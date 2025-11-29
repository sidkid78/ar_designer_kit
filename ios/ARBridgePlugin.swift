// ARBridgePlugin.swift
// AR Designer Kit - Capacitor Plugin for ARKit/LiDAR Integration
// Copyright 2024

import Foundation
import Capacitor
import ARKit
import RealityKit
import CoreML
import SceneKit

// MARK: - Plugin Definition

@objc(ARBridgePlugin)
public class ARBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    
    public let identifier = "ARBridgePlugin"
    public let jsName = "ARBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkLiDARSupport", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "placeObject", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeObject", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "measureDistance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "applyVirtualMaterial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportMesh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hitTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTrackingState", returnType: CAPPluginReturnPromise)
    ]
    
    // MARK: - Properties
    
    private var arSession: ARSession?
    private var arView: ARSCNView?
    private var scanManager: LiDARScanManager?
    private var placedObjects: [String: SCNNode] = [:]
    private var isScanning = false
    
    // MARK: - Lifecycle
    
    @objc override public func load() {
        // Initialize AR session when plugin loads
        arSession = ARSession()
        print("[ARBridge] Plugin loaded")
    }
    
    // MARK: - LiDAR Support Check
    
    @objc func checkLiDARSupport(_ call: CAPPluginCall) {
        let supportsLiDAR = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        let supportsDepth = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        
        call.resolve([
            "supportsLiDAR": supportsLiDAR,
            "supportsDepth": supportsDepth,
            "supportsWorldTracking": ARWorldTrackingConfiguration.isSupported,
            "supportsPeopleOcclusion": ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth)
        ])
    }
    
    // MARK: - Scanning
    
    @objc func startScan(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else {
            call.reject("LiDAR not supported on this device")
            return
        }
        
        let options = call.getObject("options") ?? [:]
        let recognizeObjects = options["recognizeObjects"] as? Bool ?? true
        let highAccuracy = options["highAccuracy"] as? Bool ?? true
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Create and configure AR view
            let arView = ARSCNView(frame: UIScreen.main.bounds)
            arView.session = self.arSession ?? ARSession()
            arView.automaticallyUpdatesLighting = true
            arView.autoenablesDefaultLighting = true
            
            self.arView = arView
            
            // Configure AR session for LiDAR scanning
            let configuration = ARWorldTrackingConfiguration()
            configuration.sceneReconstruction = highAccuracy ? .meshWithClassification : .mesh
            configuration.frameSemantics = [.sceneDepth, .smoothedSceneDepth]
            configuration.planeDetection = [.horizontal, .vertical]
            configuration.environmentTexturing = .automatic
            
            // Initialize scan manager
            self.scanManager = LiDARScanManager(
                session: arView.session,
                recognizeObjects: recognizeObjects
            )
            self.scanManager?.delegate = self
            
            // Present AR view controller
            let arViewController = ARScanViewController(arView: arView)
            arViewController.modalPresentationStyle = .fullScreen
            arViewController.onDismiss = { [weak self] in
                self?.handleScanDismiss()
            }
            
            self.bridge?.viewController?.present(arViewController, animated: true) {
                arView.session.run(configuration)
                self.isScanning = true
                self.notifyListeners("scanStarted", data: [:])
                call.resolve(["status": "scanning"])
            }
        }
    }
    
    @objc func stopScan(_ call: CAPPluginCall) {
        guard isScanning else {
            call.reject("No active scan session")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            // Export the scanned mesh
            self.scanManager?.finalizeScan { result in
                switch result {
                case .success(let scanData):
                    // Dismiss AR view
                    self.bridge?.viewController?.dismiss(animated: true)
                    self.isScanning = false
                    
                    // Notify JS of completion
                    self.notifyListeners("scanComplete", data: [
                        "meshUrl": scanData.meshFileURL.absoluteString,
                        "dimensions": [
                            "width": scanData.dimensions.width,
                            "length": scanData.dimensions.length,
                            "height": scanData.dimensions.height
                        ],
                        "recognizedObjects": scanData.recognizedObjects.map { obj in
                            [
                                "label": obj.label,
                                "confidence": obj.confidence,
                                "boundingBox": [
                                    "minX": obj.boundingBox.min.x,
                                    "minY": obj.boundingBox.min.y,
                                    "minZ": obj.boundingBox.min.z,
                                    "maxX": obj.boundingBox.max.x,
                                    "maxY": obj.boundingBox.max.y,
                                    "maxZ": obj.boundingBox.max.z
                                ]
                            ]
                        },
                        "floorPlanPoints": scanData.floorPlanPoints
                    ])
                    
                    call.resolve([
                        "status": "complete",
                        "meshUrl": scanData.meshFileURL.absoluteString
                    ])
                    
                case .failure(let error):
                    call.reject("Failed to export scan: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // MARK: - Object Placement
    
    @objc func placeObject(_ call: CAPPluginCall) {
        guard let modelUrl = call.getString("modelUrl") else {
            call.reject("modelUrl is required")
            return
        }
        
        let position = call.getObject("position") ?? [:]
        let rotation = call.getObject("rotation") ?? [:]
        let scale = call.getFloat("scale") ?? 1.0
        let objectId = call.getString("objectId") ?? UUID().uuidString
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let arView = self.arView else {
                call.reject("AR session not active")
                return
            }
            
            // Load 3D model
            self.loadModel(from: modelUrl) { result in
                switch result {
                case .success(let node):
                    // Set position
                    if let x = position["x"] as? Float,
                       let y = position["y"] as? Float,
                       let z = position["z"] as? Float {
                        node.position = SCNVector3(x, y, z)
                    }
                    
                    // Set rotation (quaternion)
                    if let rx = rotation["x"] as? Float,
                       let ry = rotation["y"] as? Float,
                       let rz = rotation["z"] as? Float,
                       let rw = rotation["w"] as? Float {
                        node.orientation = SCNQuaternion(rx, ry, rz, rw)
                    }
                    
                    // Set scale
                    node.scale = SCNVector3(scale, scale, scale)
                    node.name = objectId
                    
                    // Enable physics for realistic interaction
                    if let geometry = node.geometry {
                        let shape = SCNPhysicsShape(geometry: geometry, options: nil)
                        node.physicsBody = SCNPhysicsBody(type: .static, shape: shape)
                    }
                    
                    // Add to scene
                    arView.scene.rootNode.addChildNode(node)
                    self.placedObjects[objectId] = node
                    
                    self.notifyListeners("objectPlaced", data: [
                        "objectId": objectId,
                        "position": ["x": node.position.x, "y": node.position.y, "z": node.position.z]
                    ])
                    
                    call.resolve([
                        "objectId": objectId,
                        "status": "placed"
                    ])
                    
                case .failure(let error):
                    call.reject("Failed to load model: \(error.localizedDescription)")
                }
            }
        }
    }
    
    @objc func removeObject(_ call: CAPPluginCall) {
        guard let objectId = call.getString("objectId") else {
            call.reject("objectId is required")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            if let node = self.placedObjects[objectId] {
                node.removeFromParentNode()
                self.placedObjects.removeValue(forKey: objectId)
                
                self.notifyListeners("objectRemoved", data: ["objectId": objectId])
                call.resolve(["status": "removed"])
            } else {
                call.reject("Object not found: \(objectId)")
            }
        }
    }
    
    // MARK: - Measurement
    
    @objc func measureDistance(_ call: CAPPluginCall) {
        guard let point1 = call.getObject("point1"),
              let point2 = call.getObject("point2") else {
            call.reject("point1 and point2 are required")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let arView = self.arView else {
                call.reject("AR session not active")
                return
            }
            
            // Convert screen points to 3D world coordinates via hit test
            let screenPoint1 = CGPoint(
                x: CGFloat(point1["x"] as? Float ?? 0),
                y: CGFloat(point1["y"] as? Float ?? 0)
            )
            let screenPoint2 = CGPoint(
                x: CGFloat(point2["x"] as? Float ?? 0),
                y: CGFloat(point2["y"] as? Float ?? 0)
            )
            
            // Perform ray casting for both points
            guard let worldPoint1 = self.performHitTest(at: screenPoint1, in: arView),
                  let worldPoint2 = self.performHitTest(at: screenPoint2, in: arView) else {
                call.reject("Could not determine 3D positions for measurement points")
                return
            }
            
            // Calculate distance
            let distance = simd_distance(worldPoint1, worldPoint2)
            
            // Calculate midpoint for label placement
            let midpoint = (worldPoint1 + worldPoint2) / 2
            
            call.resolve([
                "distance": distance,
                "unit": "meters",
                "point1": ["x": worldPoint1.x, "y": worldPoint1.y, "z": worldPoint1.z],
                "point2": ["x": worldPoint2.x, "y": worldPoint2.y, "z": worldPoint2.z],
                "midpoint": ["x": midpoint.x, "y": midpoint.y, "z": midpoint.z]
            ])
        }
    }
    
    // MARK: - Virtual Material
    
    @objc func applyVirtualMaterial(_ call: CAPPluginCall) {
        guard let materialUrl = call.getString("materialUrl") else {
            call.reject("materialUrl is required")
            return
        }
        
        let screenX = call.getFloat("screenX") ?? 0
        let screenY = call.getFloat("screenY") ?? 0
        let scale = call.getFloat("scale") ?? 1.0
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let arView = self.arView else {
                call.reject("AR session not active")
                return
            }
            
            let screenPoint = CGPoint(x: CGFloat(screenX), y: CGFloat(screenY))
            
            // Find the plane at this location
            let hitResults = arView.hitTest(screenPoint, types: [.existingPlaneUsingExtent])
            
            guard let hitResult = hitResults.first,
                  let anchor = hitResult.anchor as? ARPlaneAnchor else {
                call.reject("No surface detected at this location")
                return
            }
            
            // Load and apply material
            self.loadMaterial(from: materialUrl) { result in
                switch result {
                case .success(let material):
                    // Apply light estimation for realistic rendering
                    if let lightEstimate = arView.session.currentFrame?.lightEstimate {
                        material.lightingModel = .physicallyBased
                        let intensity = lightEstimate.ambientIntensity / 1000.0
                        material.diffuse.intensity = CGFloat(intensity)
                    }
                    
                    // Create a plane geometry matching the detected surface
                    let planeGeometry = SCNPlane(
                        width: CGFloat(anchor.extent.x * scale),
                        height: CGFloat(anchor.extent.z * scale)
                    )
                    planeGeometry.materials = [material]
                    
                    let planeNode = SCNNode(geometry: planeGeometry)
                    planeNode.eulerAngles.x = -.pi / 2 // Rotate to lay flat
                    planeNode.position = SCNVector3(
                        anchor.center.x,
                        0,
                        anchor.center.z
                    )
                    
                    // Add to anchor node
                    if let anchorNode = arView.node(for: anchor) {
                        anchorNode.addChildNode(planeNode)
                    }
                    
                    self.notifyListeners("materialApplied", data: [
                        "anchorId": anchor.identifier.uuidString,
                        "materialUrl": materialUrl
                    ])
                    
                    call.resolve(["status": "applied"])
                    
                case .failure(let error):
                    call.reject("Failed to load material: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // MARK: - Hit Test
    
    @objc func hitTest(_ call: CAPPluginCall) {
        let screenX = call.getFloat("screenX") ?? 0
        let screenY = call.getFloat("screenY") ?? 0
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let arView = self.arView else {
                call.reject("AR session not active")
                return
            }
            
            let screenPoint = CGPoint(x: CGFloat(screenX), y: CGFloat(screenY))
            
            if let worldPosition = self.performHitTest(at: screenPoint, in: arView) {
                call.resolve([
                    "hit": true,
                    "position": [
                        "x": worldPosition.x,
                        "y": worldPosition.y,
                        "z": worldPosition.z
                    ]
                ])
            } else {
                call.resolve(["hit": false])
            }
        }
    }
    
    // MARK: - Export Mesh
    
    @objc func exportMesh(_ call: CAPPluginCall) {
        let format = call.getString("format") ?? "glb"
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.scanManager?.exportMesh(format: format) { result in
                switch result {
                case .success(let url):
                    call.resolve([
                        "meshUrl": url.absoluteString,
                        "format": format
                    ])
                case .failure(let error):
                    call.reject("Export failed: \(error.localizedDescription)")
                }
            }
        }
    }
    
    // MARK: - Tracking State
    
    @objc func getTrackingState(_ call: CAPPluginCall) {
        guard let frame = arSession?.currentFrame else {
            call.reject("No AR frame available")
            return
        }
        
        let stateString: String
        let reason: String?
        
        switch frame.camera.trackingState {
        case .normal:
            stateString = "normal"
            reason = nil
        case .notAvailable:
            stateString = "notAvailable"
            reason = nil
        case .limited(let trackingReason):
            stateString = "limited"
            switch trackingReason {
            case .initializing:
                reason = "initializing"
            case .excessiveMotion:
                reason = "excessiveMotion"
            case .insufficientFeatures:
                reason = "insufficientFeatures"
            case .relocalizing:
                reason = "relocalizing"
            @unknown default:
                reason = "unknown"
            }
        }
        
        call.resolve([
            "state": stateString,
            "reason": reason as Any
        ])
    }
    
    // MARK: - Helper Methods
    
    private func handleScanDismiss() {
        isScanning = false
        arView?.session.pause()
        notifyListeners("scanDismissed", data: [:])
    }
    
    private func performHitTest(at point: CGPoint, in arView: ARSCNView) -> simd_float3? {
        // Try ray casting first (more accurate with LiDAR)
        if let query = arView.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .any),
           let result = arView.session.raycast(query).first {
            return simd_float3(
                result.worldTransform.columns.3.x,
                result.worldTransform.columns.3.y,
                result.worldTransform.columns.3.z
            )
        }
        
        // Fallback to traditional hit test
        let hitResults = arView.hitTest(point, types: [.existingPlaneUsingExtent, .featurePoint])
        if let hit = hitResults.first {
            return simd_float3(
                hit.worldTransform.columns.3.x,
                hit.worldTransform.columns.3.y,
                hit.worldTransform.columns.3.z
            )
        }
        
        return nil
    }
    
    private func loadModel(from urlString: String, completion: @escaping (Result<SCNNode, Error>) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(.failure(ARBridgeError.invalidURL))
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let scene: SCNScene
                
                if url.pathExtension.lowercased() == "usdz" {
                    scene = try SCNScene(url: url, options: [.checkConsistency: true])
                } else {
                    // For GLB/GLTF, use ModelIO
                    let asset = MDLAsset(url: url)
                    scene = SCNScene(mdlAsset: asset)
                }
                
                let containerNode = SCNNode()
                for child in scene.rootNode.childNodes {
                    containerNode.addChildNode(child)
                }
                
                DispatchQueue.main.async {
                    completion(.success(containerNode))
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    private func loadMaterial(from urlString: String, completion: @escaping (Result<SCNMaterial, Error>) -> Void) {
        guard let url = URL(string: urlString) else {
            completion(.failure(ARBridgeError.invalidURL))
            return
        }
        
        URLSession.shared.dataTask(with: url) { data, _, error in
            if let error = error {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
                return
            }
            
            guard let data = data, let image = UIImage(data: data) else {
                DispatchQueue.main.async {
                    completion(.failure(ARBridgeError.invalidMaterial))
                }
                return
            }
            
            let material = SCNMaterial()
            material.diffuse.contents = image
            material.diffuse.wrapS = .repeat
            material.diffuse.wrapT = .repeat
            material.isDoubleSided = true
            
            DispatchQueue.main.async {
                completion(.success(material))
            }
        }.resume()
    }
}

// MARK: - LiDARScanManagerDelegate

extension ARBridgePlugin: LiDARScanManagerDelegate {
    func scanManager(_ manager: LiDARScanManager, didUpdateProgress progress: Float) {
        notifyListeners("scanProgress", data: ["progress": progress])
    }
    
    func scanManager(_ manager: LiDARScanManager, didRecognizeObject object: RecognizedObject) {
        notifyListeners("objectRecognized", data: [
            "label": object.label,
            "confidence": object.confidence,
            "position": [
                "x": object.position.x,
                "y": object.position.y,
                "z": object.position.z
            ]
        ])
    }
    
    func scanManager(_ manager: LiDARScanManager, didEncounterError error: Error) {
        notifyListeners("scanError", data: ["error": error.localizedDescription])
    }
}

// MARK: - Error Types

enum ARBridgeError: LocalizedError {
    case invalidURL
    case invalidMaterial
    case sessionNotActive
    case exportFailed
    
    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL provided"
        case .invalidMaterial: return "Failed to load material"
        case .sessionNotActive: return "AR session is not active"
        case .exportFailed: return "Failed to export mesh"
        }
    }
}