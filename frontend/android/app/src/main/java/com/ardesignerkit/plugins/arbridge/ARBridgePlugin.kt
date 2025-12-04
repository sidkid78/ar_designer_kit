package com.ardesignerkit.plugins.arbridge

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Session
import kotlinx.coroutines.*

@CapacitorPlugin(
    name = "ARBridge",
    permissions = [
        Permission(
            strings = [Manifest.permission.CAMERA],
            alias = "camera"
        )
    ]
)
class ARBridgePlugin : Plugin() {
    
    companion object {
        private const val TAG = "ARBridgePlugin"
        private const val AR_ACTIVITY_REQUEST_CODE = 1001
        
        // Singleton instance for ARScanActivity to communicate back
        var instance: ARBridgePlugin? = null
            private set
    }
    
    private var pendingScanCall: PluginCall? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    override fun load() {
        super.load()
        instance = this
        Log.d(TAG, "ARBridge plugin loaded")
    }
    
    override fun handleOnDestroy() {
        instance = null
        super.handleOnDestroy()
        scope.cancel()
    }
    
    // ========================================================================
    // Device Capability Checks
    // ========================================================================
    
    @PluginMethod
    fun checkLiDARSupport(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }
        
        scope.launch {
            try {
                val availability = ArCoreApk.getInstance().checkAvailability(activity)
                
                // Check if device supports depth
                val supportsDepth = checkDepthSupport(activity)
                
                val result = JSObject().apply {
                    // Android doesn't have LiDAR, but ARCore Depth API provides similar functionality
                    put("supportsLiDAR", false)
                    put("supportsDepth", supportsDepth)
                    put("supportsWorldTracking", availability.isSupported)
                    put("supportsPeopleOcclusion", supportsDepth) // Depth API enables occlusion
                }
                
                call.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Error checking AR support", e)
                call.reject("Failed to check AR support: ${e.message}")
            }
        }
    }
    
    private suspend fun checkDepthSupport(activity: Activity): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val session = Session(activity)
                val config = Config(session)
                val supported = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
                session.close()
                supported
            } catch (e: Exception) {
                Log.w(TAG, "Depth mode check failed", e)
                false
            }
        }
    }
    
    // ========================================================================
    // Scanning
    // ========================================================================
    
    @PluginMethod
    fun startScan(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }
        
        // Check camera permission first
        if (!hasPermission(Manifest.permission.CAMERA)) {
            pendingScanCall = call
            requestPermissionForAlias("camera", call, "handleCameraPermission")
            return
        }
        
        launchARActivity(call)
    }
    
    @PermissionCallback
    private fun handleCameraPermission(call: PluginCall) {
        if (hasPermission(Manifest.permission.CAMERA)) {
            launchARActivity(call)
        } else {
            call.reject("Camera permission denied")
        }
    }
    
    private fun launchARActivity(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity not available")
            return
        }
        
        val recognizeObjects = call.getBoolean("recognizeObjects", true) ?: true
        val highAccuracy = call.getBoolean("highAccuracy", false) ?: false
        
        pendingScanCall = call
        
        // Launch the AR scanning activity
        val intent = Intent(activity, ARScanActivity::class.java).apply {
            putExtra("recognizeObjects", recognizeObjects)
            putExtra("highAccuracy", highAccuracy)
        }
        
        startActivityForResult(call, intent, "handleScanResult")
        
        // Notify that scanning has started
        notifyListeners("scanStarted", JSObject())
        
        call.resolve(JSObject().apply {
            put("status", "scanning")
        })
    }
    
    @PluginMethod
    fun stopScan(call: PluginCall) {
        // Send broadcast to stop the AR activity
        val intent = Intent("com.ardesignerkit.STOP_SCAN")
        context.sendBroadcast(intent)
        
        // The actual result will come from handleScanResult
        call.resolve(JSObject().apply {
            put("status", "stopping")
        })
    }
    
    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)
        
        if (requestCode == AR_ACTIVITY_REQUEST_CODE) {
            when (resultCode) {
                Activity.RESULT_OK -> {
                    data?.let { handleScanComplete(it) }
                }
                Activity.RESULT_CANCELED -> {
                    notifyListeners("scanDismissed", JSObject())
                }
                else -> {
                    val error = data?.getStringExtra("error") ?: "Unknown error"
                    notifyListeners("scanError", JSObject().apply {
                        put("error", error)
                    })
                }
            }
        }
    }
    
    private fun handleScanComplete(data: Intent) {
        val meshUrl = data.getStringExtra("meshUrl") ?: ""
        val width = data.getFloatExtra("width", 0f)
        val length = data.getFloatExtra("length", 0f)
        val height = data.getFloatExtra("height", 0f)
        val objectsJson = data.getStringExtra("recognizedObjects") ?: "[]"
        val floorPlanJson = data.getStringExtra("floorPlanPoints") ?: "[]"
        
        val dimensions = JSObject().apply {
            put("width", width.toDouble())
            put("length", length.toDouble())
            put("height", height.toDouble())
        }
        
        val result = JSObject().apply {
            put("meshUrl", meshUrl)
            put("dimensions", dimensions)
            put("recognizedObjects", JSArray(objectsJson))
            put("floorPlanPoints", JSArray(floorPlanJson))
        }
        
        notifyListeners("scanComplete", result)
        
        pendingScanCall?.resolve(JSObject().apply {
            put("status", "complete")
            put("meshUrl", meshUrl)
        })
        pendingScanCall = null
    }
    
    // ========================================================================
    // Object Placement
    // ========================================================================
    
    @PluginMethod
    fun placeObject(call: PluginCall) {
        val modelUrl = call.getString("modelUrl") ?: run {
            call.reject("modelUrl is required")
            return
        }
        
        val objectId = call.getString("objectId") ?: "obj_${System.currentTimeMillis()}"
        val position = call.getObject("position")
        val rotation = call.getObject("rotation")
        val scale = call.getDouble("scale", 1.0)
        
        // Send to AR activity via broadcast
        val intent = Intent("com.ardesignerkit.PLACE_OBJECT").apply {
            putExtra("modelUrl", modelUrl)
            putExtra("objectId", objectId)
            position?.let {
                putExtra("posX", it.getDouble("x"))
                putExtra("posY", it.getDouble("y"))
                putExtra("posZ", it.getDouble("z"))
            }
            rotation?.let {
                putExtra("rotX", it.getDouble("x"))
                putExtra("rotY", it.getDouble("y"))
                putExtra("rotZ", it.getDouble("z"))
                putExtra("rotW", it.getDouble("w"))
            }
            putExtra("scale", scale)
        }
        context.sendBroadcast(intent)
        
        call.resolve(JSObject().apply {
            put("objectId", objectId)
            put("status", "placed")
        })
        
        // Notify listeners
        notifyListeners("objectPlaced", JSObject().apply {
            put("objectId", objectId)
            put("position", position ?: JSObject().apply {
                put("x", 0)
                put("y", 0)
                put("z", -1)
            })
        })
    }
    
    @PluginMethod
    fun removeObject(call: PluginCall) {
        val objectId = call.getString("objectId") ?: run {
            call.reject("objectId is required")
            return
        }
        
        val intent = Intent("com.ardesignerkit.REMOVE_OBJECT").apply {
            putExtra("objectId", objectId)
        }
        context.sendBroadcast(intent)
        
        notifyListeners("objectRemoved", JSObject().apply {
            put("objectId", objectId)
        })
        
        call.resolve(JSObject().apply {
            put("status", "removed")
        })
    }
    
    // ========================================================================
    // Measurement
    // ========================================================================
    
    @PluginMethod
    fun measureDistance(call: PluginCall) {
        val point1 = call.getObject("point1") ?: run {
            call.reject("point1 is required")
            return
        }
        val point2 = call.getObject("point2") ?: run {
            call.reject("point2 is required")
            return
        }
        
        // Send measurement request to AR activity
        val intent = Intent("com.ardesignerkit.MEASURE_DISTANCE").apply {
            putExtra("p1x", point1.getDouble("x"))
            putExtra("p1y", point1.getDouble("y"))
            putExtra("p2x", point2.getDouble("x"))
            putExtra("p2y", point2.getDouble("y"))
            putExtra("callbackId", call.callbackId)
        }
        
        // Store call for async response
        bridge.saveCall(call)
        context.sendBroadcast(intent)
    }
    
    // Called from AR activity with measurement result
    fun onMeasurementResult(callbackId: String, result: JSObject) {
        val call = bridge.getSavedCall(callbackId) ?: return
        call.resolve(result)
        bridge.releaseCall(call)
    }
    
    // ========================================================================
    // Materials
    // ========================================================================
    
    @PluginMethod
    fun applyVirtualMaterial(call: PluginCall) {
        val materialUrl = call.getString("materialUrl") ?: run {
            call.reject("materialUrl is required")
            return
        }
        val screenX = call.getDouble("screenX") ?: run {
            call.reject("screenX is required")
            return
        }
        val screenY = call.getDouble("screenY") ?: run {
            call.reject("screenY is required")
            return
        }
        val scale = call.getDouble("scale", 1.0)
        
        val intent = Intent("com.ardesignerkit.APPLY_MATERIAL").apply {
            putExtra("materialUrl", materialUrl)
            putExtra("screenX", screenX)
            putExtra("screenY", screenY)
            putExtra("scale", scale)
        }
        context.sendBroadcast(intent)
        
        call.resolve(JSObject().apply {
            put("status", "applied")
        })
    }
    
    // ========================================================================
    // Utilities
    // ========================================================================
    
    @PluginMethod
    fun hitTest(call: PluginCall) {
        val screenX = call.getDouble("screenX") ?: run {
            call.reject("screenX is required")
            return
        }
        val screenY = call.getDouble("screenY") ?: run {
            call.reject("screenY is required")
            return
        }
        
        val intent = Intent("com.ardesignerkit.HIT_TEST").apply {
            putExtra("screenX", screenX)
            putExtra("screenY", screenY)
            putExtra("callbackId", call.callbackId)
        }
        
        bridge.saveCall(call)
        context.sendBroadcast(intent)
    }
    
    fun onHitTestResult(callbackId: String, hit: Boolean, position: FloatArray?) {
        val call = bridge.getSavedCall(callbackId) ?: return
        
        val result = JSObject().apply {
            put("hit", hit)
            if (hit && position != null) {
                put("position", JSObject().apply {
                    put("x", position[0].toDouble())
                    put("y", position[1].toDouble())
                    put("z", position[2].toDouble())
                })
            }
        }
        
        call.resolve(result)
        bridge.releaseCall(call)
    }
    
    @PluginMethod
    fun exportMesh(call: PluginCall) {
        val format = call.getString("format", "glb") ?: "glb"
        
        val intent = Intent("com.ardesignerkit.EXPORT_MESH").apply {
            putExtra("format", format)
            putExtra("callbackId", call.callbackId)
        }
        
        bridge.saveCall(call)
        context.sendBroadcast(intent)
    }
    
    fun onMeshExported(callbackId: String, meshUrl: String, format: String) {
        val call = bridge.getSavedCall(callbackId) ?: return
        
        call.resolve(JSObject().apply {
            put("meshUrl", meshUrl)
            put("format", format)
        })
        bridge.releaseCall(call)
    }
    
    @PluginMethod
    fun getTrackingState(call: PluginCall) {
        // This would ideally query the current AR session
        // For now, return a default state
        call.resolve(JSObject().apply {
            put("state", "normal")
        })
    }
    
    // ========================================================================
    // Progress notifications (called from AR activity)
    // ========================================================================
    
    fun notifyScanProgress(progress: Float) {
        notifyListeners("scanProgress", JSObject().apply {
            put("progress", progress.toDouble())
        })
    }
    
    fun notifyObjectRecognized(label: String, confidence: Float, position: FloatArray) {
        notifyListeners("objectRecognized", JSObject().apply {
            put("label", label)
            put("confidence", confidence.toDouble())
            put("position", JSObject().apply {
                put("x", position[0].toDouble())
                put("y", position[1].toDouble())
                put("z", position[2].toDouble())
            })
        })
    }
    
}