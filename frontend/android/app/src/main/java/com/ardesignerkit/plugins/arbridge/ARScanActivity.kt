package com.ardesignerkit.plugins.arbridge

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.util.Log
import android.view.MotionEvent
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.ardesignerkit.app.R
import com.google.ar.core.*
import com.google.ar.core.exceptions.*
import kotlinx.coroutines.*
import java.io.File
import java.nio.FloatBuffer
import java.util.concurrent.ConcurrentHashMap
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class ARScanActivity : AppCompatActivity(), GLSurfaceView.Renderer {
    
    companion object {
        private const val TAG = "ARScanActivity"
    }
    
    private lateinit var surfaceView: GLSurfaceView
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView
    private lateinit var stopButton: Button
    
    private var arSession: Session? = null
    private var isScanning = false
    private var recognizeObjects = true
    private var highAccuracy = false
    
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    // Accumulated mesh data
    private val meshVertices = mutableListOf<Float>()
    private val meshIndices = mutableListOf<Int>()
    private val recognizedObjects = mutableListOf<RecognizedObjectData>()
    private val floorPlanPoints = mutableListOf<Pair<Float, Float>>()
    
    // Room dimensions
    private var minX = Float.MAX_VALUE
    private var maxX = Float.MIN_VALUE
    private var minY = Float.MAX_VALUE
    private var maxY = Float.MIN_VALUE
    private var minZ = Float.MAX_VALUE
    private var maxZ = Float.MIN_VALUE
    
    // Placed objects
    private val placedAnchors = ConcurrentHashMap<String, Anchor>()
    
    private val commandReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                "com.ardesignerkit.STOP_SCAN" -> finishScanning()
                "com.ardesignerkit.PLACE_OBJECT" -> handlePlaceObject(intent)
                "com.ardesignerkit.REMOVE_OBJECT" -> handleRemoveObject(intent)
                "com.ardesignerkit.MEASURE_DISTANCE" -> handleMeasureDistance(intent)
                "com.ardesignerkit.HIT_TEST" -> handleHitTest(intent)
                "com.ardesignerkit.EXPORT_MESH" -> handleExportMesh(intent)
                "com.ardesignerkit.APPLY_MATERIAL" -> handleApplyMaterial(intent)
            }
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ar_scan)
        
        recognizeObjects = intent.getBooleanExtra("recognizeObjects", true)
        highAccuracy = intent.getBooleanExtra("highAccuracy", false)
        
        setupViews()
        setupARCore()
        registerReceivers()
    }
    
    private fun setupViews() {
        surfaceView = findViewById(R.id.surfaceView)
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)
        stopButton = findViewById(R.id.stopButton)
        
        surfaceView.apply {
            preserveEGLContextOnPause = true
            setEGLContextClientVersion(2)
            setEGLConfigChooser(8, 8, 8, 8, 16, 0)
            setRenderer(this@ARScanActivity)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
        
        stopButton.setOnClickListener {
            finishScanning()
        }
    }
    
    private fun setupARCore() {
        try {
            // Check ARCore availability
            when (ArCoreApk.getInstance().requestInstall(this, true)) {
                ArCoreApk.InstallStatus.INSTALLED -> initializeSession()
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    statusText.text = "Installing ARCore..."
                }
            }
        } catch (e: UnavailableException) {
            Log.e(TAG, "ARCore unavailable", e)
            finishWithError("ARCore is not available on this device")
        }
    }
    
    private fun initializeSession() {
        try {
            arSession = Session(this).apply {
                val config = Config(this).apply {
                    // Enable depth if available
                    if (isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                        depthMode = Config.DepthMode.AUTOMATIC
                        Log.d(TAG, "Depth mode enabled")
                    }
                    
                    // Enable instant placement for faster plane detection
                    instantPlacementMode = Config.InstantPlacementMode.LOCAL_Y_UP
                    
                    // Focus mode
                    focusMode = Config.FocusMode.AUTO
                    
                    // Update mode for better tracking
                    updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                    
                    // Enable plane detection
                    planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                }
                configure(config)
            }
            
            isScanning = true
            statusText.text = "Scanning... Move your device slowly"
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create AR session", e)
            finishWithError("Failed to initialize AR: ${e.message}")
        }
    }
    
    private fun registerReceivers() {
        val filter = IntentFilter().apply {
            addAction("com.ardesignerkit.STOP_SCAN")
            addAction("com.ardesignerkit.PLACE_OBJECT")
            addAction("com.ardesignerkit.REMOVE_OBJECT")
            addAction("com.ardesignerkit.MEASURE_DISTANCE")
            addAction("com.ardesignerkit.HIT_TEST")
            addAction("com.ardesignerkit.EXPORT_MESH")
            addAction("com.ardesignerkit.APPLY_MATERIAL")
        }
        registerReceiver(commandReceiver, filter, RECEIVER_NOT_EXPORTED)
    }
    
    // ========================================================================
    // GLSurfaceView.Renderer Implementation
    // ========================================================================
    
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0.1f, 0.1f, 0.1f, 1.0f)
    }
    
    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        arSession?.setDisplayGeometry(0, width, height)
    }
    
    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        
        val session = arSession ?: return
        
        try {
            session.setCameraTextureName(0) // Simplified - would need texture setup
            
            val frame = session.update()
            val camera = frame.camera
            
            if (camera.trackingState == TrackingState.TRACKING && isScanning) {
                processFrame(frame)
            }
            
            // Update tracking state UI
            runOnUiThread {
                when (camera.trackingState) {
                    TrackingState.TRACKING -> statusText.text = "Scanning... ${progressBar.progress}%"
                    TrackingState.PAUSED -> statusText.text = "Tracking paused - move slower"
                    TrackingState.STOPPED -> statusText.text = "Tracking stopped"
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error in frame update", e)
        }
    }
    
    private fun processFrame(frame: Frame) {
        // Process depth data if available
        try {
            frame.acquireDepthImage16Bits()?.use { depthImage ->
                processDepthImage(frame, depthImage)
            }
        } catch (e: NotYetAvailableException) {
            // Depth not ready yet, that's okay
        }
        
        // Process detected planes for floor plan
        for (plane in frame.getUpdatedTrackables(Plane::class.java)) {
            if (plane.trackingState == TrackingState.TRACKING) {
                processPlane(plane)
            }
        }
        
        // Update progress based on coverage
        updateScanProgress()
    }
    
    private fun processDepthImage(frame: Frame, depthImage: android.media.Image) {
        val camera = frame.camera
        val pose = camera.displayOrientedPose
        
        // Get depth data
        val depthBuffer = depthImage.planes[0].buffer.asShortBuffer()
        val width = depthImage.width
        val height = depthImage.height
        
        // Sample points from depth image (not every pixel for performance)
        val sampleStep = if (highAccuracy) 4 else 8
        
        for (y in 0 until height step sampleStep) {
            for (x in 0 until width step sampleStep) {
                val depthMm = depthBuffer.get(y * width + x).toInt() and 0xFFFF
                if (depthMm > 0 && depthMm < 10000) { // Valid depth range
                    val depthM = depthMm / 1000f
                    
                    // Convert to 3D point (simplified projection)
                    val fx = 500f // Approximate focal length
                    val fy = 500f
                    val cx = width / 2f
                    val cy = height / 2f
                    
                    val pointX = (x - cx) * depthM / fx
                    val pointY = (y - cy) * depthM / fy
                    val pointZ = depthM
                    
                    // Transform to world coordinates
                    val worldPoint = floatArrayOf(pointX, pointY, pointZ)
                    pose.transformPoint(worldPoint, 0, worldPoint, 0)
                    
                    // Add to mesh
                    meshVertices.addAll(worldPoint.toList())
                    
                    // Track bounds
                    minX = minOf(minX, worldPoint[0])
                    maxX = maxOf(maxX, worldPoint[0])
                    minY = minOf(minY, worldPoint[1])
                    maxY = maxOf(maxY, worldPoint[1])
                    minZ = minOf(minZ, worldPoint[2])
                    maxZ = maxOf(maxZ, worldPoint[2])
                }
            }
        }
    }
    
    private fun processPlane(plane: Plane) {
        if (plane.type == Plane.Type.HORIZONTAL_DOWNWARD_FACING) {
            // This is likely the floor
            val polygon = plane.polygon
            for (i in 0 until polygon.limit() step 2) {
                val x = polygon.get(i)
                val z = polygon.get(i + 1)
                
                // Transform to world coordinates
                val worldPoint = floatArrayOf(x, 0f, z)
                plane.centerPose.transformPoint(worldPoint, 0, worldPoint, 0)
                
                floorPlanPoints.add(Pair(worldPoint[0], worldPoint[2]))
            }
        }
    }
    
    private fun updateScanProgress() {
        // Calculate progress based on mesh coverage
        val vertexCount = meshVertices.size / 3
        val targetVertices = if (highAccuracy) 50000 else 20000
        val progress = minOf(100, (vertexCount * 100) / targetVertices)
        
        runOnUiThread {
            progressBar.progress = progress
        }
        
        // Notify plugin of progress
        ARBridgePlugin.instance?.notifyScanProgress(progress / 100f)
    }
    
    // ========================================================================
    // Command Handlers
    // ========================================================================
    
    private fun handlePlaceObject(intent: Intent) {
        val modelUrl = intent.getStringExtra("modelUrl") ?: return
        val objectId = intent.getStringExtra("objectId") ?: return
        
        val session = arSession ?: return
        val frame = session.update()
        
        // Get position from intent or use center of screen
        val posX = intent.getDoubleExtra("posX", 0.0).toFloat()
        val posY = intent.getDoubleExtra("posY", 0.0).toFloat()
        val posZ = intent.getDoubleExtra("posZ", -1.0).toFloat()
        
        // Create anchor at position
        val pose = Pose.makeTranslation(posX, posY, posZ)
        val anchor = session.createAnchor(pose)
        
        placedAnchors[objectId] = anchor
        
        Log.d(TAG, "Placed object $objectId at ($posX, $posY, $posZ)")
    }
    
    private fun handleRemoveObject(intent: Intent) {
        val objectId = intent.getStringExtra("objectId") ?: return
        placedAnchors.remove(objectId)?.detach()
        Log.d(TAG, "Removed object $objectId")
    }
    
    private fun handleMeasureDistance(intent: Intent) {
        val callbackId = intent.getStringExtra("callbackId") ?: return
        val p1x = intent.getDoubleExtra("p1x", 0.0).toFloat()
        val p1y = intent.getDoubleExtra("p1y", 0.0).toFloat()
        val p2x = intent.getDoubleExtra("p2x", 0.0).toFloat()
        val p2y = intent.getDoubleExtra("p2y", 0.0).toFloat()
        
        val session = arSession ?: return
        val frame = session.update()
        
        // Perform hit tests
        val hits1 = frame.hitTest(p1x, p1y)
        val hits2 = frame.hitTest(p2x, p2y)
        
        if (hits1.isNotEmpty() && hits2.isNotEmpty()) {
            val pose1 = hits1[0].hitPose
            val pose2 = hits2[0].hitPose
            
            val point1 = floatArrayOf(pose1.tx(), pose1.ty(), pose1.tz())
            val point2 = floatArrayOf(pose2.tx(), pose2.ty(), pose2.tz())
            
            val dx = point2[0] - point1[0]
            val dy = point2[1] - point1[1]
            val dz = point2[2] - point1[2]
            val distance = kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
            
            val midpoint = floatArrayOf(
                (point1[0] + point2[0]) / 2,
                (point1[1] + point2[1]) / 2,
                (point1[2] + point2[2]) / 2
            )
            
            val result = com.getcapacitor.JSObject().apply {
                put("distance", distance.toDouble())
                put("unit", "meters")
                put("point1", com.getcapacitor.JSObject().apply {
                    put("x", point1[0].toDouble())
                    put("y", point1[1].toDouble())
                    put("z", point1[2].toDouble())
                })
                put("point2", com.getcapacitor.JSObject().apply {
                    put("x", point2[0].toDouble())
                    put("y", point2[1].toDouble())
                    put("z", point2[2].toDouble())
                })
                put("midpoint", com.getcapacitor.JSObject().apply {
                    put("x", midpoint[0].toDouble())
                    put("y", midpoint[1].toDouble())
                    put("z", midpoint[2].toDouble())
                })
            }
            
            ARBridgePlugin.instance?.onMeasurementResult(callbackId, result)
        }
    }
    
    private fun handleHitTest(intent: Intent) {
        val callbackId = intent.getStringExtra("callbackId") ?: return
        val screenX = intent.getDoubleExtra("screenX", 0.0).toFloat()
        val screenY = intent.getDoubleExtra("screenY", 0.0).toFloat()
        
        val session = arSession ?: return
        val frame = session.update()
        
        val hits = frame.hitTest(screenX, screenY)
        
        if (hits.isNotEmpty()) {
            val pose = hits[0].hitPose
            ARBridgePlugin.instance?.onHitTestResult(
                callbackId,
                true,
                floatArrayOf(pose.tx(), pose.ty(), pose.tz())
            )
        } else {
            ARBridgePlugin.instance?.onHitTestResult(callbackId, false, null)
        }
    }
    
    private fun handleExportMesh(intent: Intent) {
        val callbackId = intent.getStringExtra("callbackId") ?: return
        val format = intent.getStringExtra("format") ?: "glb"
        
        scope.launch(Dispatchers.IO) {
            try {
                val meshFile = exportMeshToFile(format)
                ARBridgePlugin.instance?.onMeshExported(callbackId, meshFile.absolutePath, format)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to export mesh", e)
            }
        }
    }
    
    private fun handleApplyMaterial(intent: Intent) {
        // Material application would require more complex shader setup
        // This is a placeholder for the implementation
        Log.d(TAG, "Apply material requested")
    }
    
    // ========================================================================
    // Mesh Export
    // ========================================================================
    
    private fun exportMeshToFile(format: String): File {
        val outputDir = File(cacheDir, "meshes")
        outputDir.mkdirs()
        
        val timestamp = System.currentTimeMillis()
        val outputFile = File(outputDir, "scan_$timestamp.$format")
        
        when (format) {
            "glb" -> exportAsGLB(outputFile)
            "obj" -> exportAsOBJ(outputFile)
            else -> exportAsGLB(outputFile)
        }
        
        return outputFile
    }
    
    private fun exportAsGLB(file: File) {
        // Simplified GLB export - in production, use a proper GLTF library
        val vertices = meshVertices.toFloatArray()
        
        // Create a minimal GLB file
        // This is a simplified implementation - real GLB export would be more complex
        file.outputStream().use { output ->
            // GLB header
            output.write(byteArrayOf(0x67, 0x6C, 0x54, 0x46)) // "glTF" magic
            output.write(byteArrayOf(0x02, 0x00, 0x00, 0x00)) // Version 2
            // ... rest of GLB structure would go here
            
            // For now, write vertices as binary
            val buffer = java.nio.ByteBuffer.allocate(vertices.size * 4)
            buffer.asFloatBuffer().put(vertices)
            output.write(buffer.array())
        }
        
        Log.d(TAG, "Exported mesh to ${file.absolutePath}")
    }
    
    private fun exportAsOBJ(file: File) {
        file.bufferedWriter().use { writer ->
            writer.write("# AR Designer Kit Scan\n")
            writer.write("# Vertices: ${meshVertices.size / 3}\n\n")
            
            for (i in meshVertices.indices step 3) {
                writer.write("v ${meshVertices[i]} ${meshVertices[i + 1]} ${meshVertices[i + 2]}\n")
            }
        }
        
        Log.d(TAG, "Exported OBJ to ${file.absolutePath}")
    }
    
    // ========================================================================
    // Finish
    // ========================================================================
    
    private fun finishScanning() {
        isScanning = false
        
        scope.launch(Dispatchers.IO) {
            try {
                val meshFile = exportMeshToFile("glb")
                
                // Simplify floor plan points (convex hull or similar)
                val simplifiedFloorPlan = simplifyFloorPlan(floorPlanPoints)
                
                val resultIntent = Intent().apply {
                    putExtra("meshUrl", meshFile.absolutePath)
                    putExtra("width", maxX - minX)
                    putExtra("length", maxZ - minZ)
                    putExtra("height", maxY - minY)
                    putExtra("recognizedObjects", "[]") // Would be JSON array
                    putExtra("floorPlanPoints", simplifiedFloorPlan.joinToString { "[${it.first},${it.second}]" })
                }
                
                setResult(Activity.RESULT_OK, resultIntent)
                finish()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error finishing scan", e)
                finishWithError("Failed to export scan: ${e.message}")
            }
        }
    }
    
    private fun simplifyFloorPlan(points: List<Pair<Float, Float>>): List<Pair<Float, Float>> {
        // Simple bounding box for now - could implement convex hull
        if (points.isEmpty()) return emptyList()
        
        val minX = points.minOf { it.first }
        val maxX = points.maxOf { it.first }
        val minY = points.minOf { it.second }
        val maxY = points.maxOf { it.second }
        
        return listOf(
            Pair(minX, minY),
            Pair(maxX, minY),
            Pair(maxX, maxY),
            Pair(minX, maxY)
        )
    }
    
    private fun finishWithError(error: String) {
        val resultIntent = Intent().apply {
            putExtra("error", error)
        }
        setResult(Activity.RESULT_FIRST_USER, resultIntent)
        finish()
    }
    
    override fun onResume() {
        super.onResume()
        arSession?.resume()
        surfaceView.onResume()
    }
    
    override fun onPause() {
        super.onPause()
        surfaceView.onPause()
        arSession?.pause()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(commandReceiver)
        arSession?.close()
        scope.cancel()
    }
}

data class RecognizedObjectData(
    val label: String,
    val confidence: Float,
    val boundingBox: FloatArray
)