// ARScanViewController.swift
// AR Designer Kit - Native AR Scanning Interface
// Copyright 2024

import UIKit
import ARKit
import SceneKit

class ARScanViewController: UIViewController {
    
    // MARK: - Properties
    
    private let arView: ARSCNView
    var onDismiss: (() -> Void)?
    
    private var scanProgressView: UIProgressView!
    private var instructionLabel: UILabel!
    private var captureButton: UIButton!
    private var closeButton: UIButton!
    private var flashlightButton: UIButton!
    private var meshVisualizationNode: SCNNode?
    
    private var isFlashlightOn = false
    private var showMeshOverlay = true
    
    // MARK: - Initialization
    
    init(arView: ARSCNView) {
        self.arView = arView
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    // MARK: - Lifecycle
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupARView()
        setupGestures()
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        arView.session.pause()
        turnOffFlashlight()
    }
    
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    
    // MARK: - UI Setup
    
    private func setupUI() {
        view.backgroundColor = .black
        
        // AR View
        arView.frame = view.bounds
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(arView)
        
        // Close Button
        closeButton = UIButton(type: .system)
        closeButton.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        closeButton.tintColor = .white
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(closeButton)
        
        // Flashlight Button
        flashlightButton = UIButton(type: .system)
        flashlightButton.setImage(UIImage(systemName: "flashlight.off.fill"), for: .normal)
        flashlightButton.tintColor = .white
        flashlightButton.addTarget(self, action: #selector(flashlightTapped), for: .touchUpInside)
        flashlightButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(flashlightButton)
        
        // Progress View
        scanProgressView = UIProgressView(progressViewStyle: .bar)
        scanProgressView.progressTintColor = UIColor.systemBlue
        scanProgressView.trackTintColor = UIColor.white.withAlphaComponent(0.3)
        scanProgressView.translatesAutoresizingMaskIntoConstraints = false
        scanProgressView.layer.cornerRadius = 4
        scanProgressView.clipsToBounds = true
        view.addSubview(scanProgressView)
        
        // Instruction Label
        instructionLabel = UILabel()
        instructionLabel.text = "Move your device slowly to scan the room"
        instructionLabel.textColor = .white
        instructionLabel.font = .systemFont(ofSize: 16, weight: .medium)
        instructionLabel.textAlignment = .center
        instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        instructionLabel.layer.cornerRadius = 8
        instructionLabel.clipsToBounds = true
        instructionLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(instructionLabel)
        
        // Capture Button
        captureButton = UIButton(type: .system)
        captureButton.setTitle("Complete Scan", for: .normal)
        captureButton.setTitleColor(.white, for: .normal)
        captureButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        captureButton.backgroundColor = UIColor.systemBlue
        captureButton.layer.cornerRadius = 25
        captureButton.addTarget(self, action: #selector(captureTapped), for: .touchUpInside)
        captureButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(captureButton)
        
        // Mesh Toggle Button
        let meshToggleButton = UIButton(type: .system)
        meshToggleButton.setImage(UIImage(systemName: "square.3.layers.3d"), for: .normal)
        meshToggleButton.tintColor = .white
        meshToggleButton.addTarget(self, action: #selector(toggleMeshOverlay), for: .touchUpInside)
        meshToggleButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(meshToggleButton)
        
        // Constraints
        NSLayoutConstraint.activate([
            // Close button
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),
            
            // Flashlight button
            flashlightButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            flashlightButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            flashlightButton.widthAnchor.constraint(equalToConstant: 44),
            flashlightButton.heightAnchor.constraint(equalToConstant: 44),
            
            // Mesh toggle button
            meshToggleButton.topAnchor.constraint(equalTo: flashlightButton.bottomAnchor, constant: 16),
            meshToggleButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            meshToggleButton.widthAnchor.constraint(equalToConstant: 44),
            meshToggleButton.heightAnchor.constraint(equalToConstant: 44),
            
            // Progress view
            scanProgressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            scanProgressView.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 16),
            scanProgressView.trailingAnchor.constraint(equalTo: flashlightButton.leadingAnchor, constant: -16),
            scanProgressView.heightAnchor.constraint(equalToConstant: 8),
            
            // Instruction label
            instructionLabel.topAnchor.constraint(equalTo: scanProgressView.bottomAnchor, constant: 16),
            instructionLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            instructionLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            instructionLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32),
            
            // Capture button
            captureButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -32),
            captureButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            captureButton.widthAnchor.constraint(equalToConstant: 200),
            captureButton.heightAnchor.constraint(equalToConstant: 50)
        ])
        
        // Add padding to instruction label
        instructionLabel.layoutMargins = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
    }
    
    private func setupARView() {
        arView.delegate = self
        arView.debugOptions = [.showFeaturePoints]
        
        // Add mesh visualization
        if showMeshOverlay {
            arView.debugOptions.insert(.showSceneUnderstanding)
        }
    }
    
    private func setupGestures() {
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        arView.addGestureRecognizer(tapGesture)
    }
    
    // MARK: - Actions
    
    @objc private func closeTapped() {
        dismiss(animated: true) { [weak self] in
            self?.onDismiss?()
        }
    }
    
    @objc private func captureTapped() {
        // Animate button
        UIView.animate(withDuration: 0.1, animations: {
            self.captureButton.transform = CGAffineTransform(scaleX: 0.95, y: 0.95)
        }) { _ in
            UIView.animate(withDuration: 0.1) {
                self.captureButton.transform = .identity
            }
        }
        
        // Trigger scan completion via notification
        NotificationCenter.default.post(name: .scanCompleteRequested, object: nil)
    }
    
    @objc private func flashlightTapped() {
        isFlashlightOn.toggle()
        
        if isFlashlightOn {
            turnOnFlashlight()
            flashlightButton.setImage(UIImage(systemName: "flashlight.on.fill"), for: .normal)
        } else {
            turnOffFlashlight()
            flashlightButton.setImage(UIImage(systemName: "flashlight.off.fill"), for: .normal)
        }
    }
    
    @objc private func toggleMeshOverlay() {
        showMeshOverlay.toggle()
        
        if showMeshOverlay {
            arView.debugOptions.insert(.showSceneUnderstanding)
        } else {
            arView.debugOptions.remove(.showSceneUnderstanding)
        }
    }
    
    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: arView)
        
        // Perform hit test and show visual feedback
        if let query = arView.raycastQuery(from: location, allowing: .estimatedPlane, alignment: .any),
           let result = arView.session.raycast(query).first {
            showTapFeedback(at: result.worldTransform)
        }
    }
    
    // MARK: - Helper Methods
    
    private func showTapFeedback(at transform: simd_float4x4) {
        let sphere = SCNSphere(radius: 0.02)
        sphere.firstMaterial?.diffuse.contents = UIColor.systemBlue.withAlphaComponent(0.7)
        
        let node = SCNNode(geometry: sphere)
        node.simdTransform = transform
        
        arView.scene.rootNode.addChildNode(node)
        
        // Fade out and remove
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            SCNTransaction.begin()
            SCNTransaction.animationDuration = 0.3
            node.opacity = 0
            SCNTransaction.completionBlock = {
                node.removeFromParentNode()
            }
            SCNTransaction.commit()
        }
    }
    
    private func turnOnFlashlight() {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        
        try? device.lockForConfiguration()
        device.torchMode = .on
        device.unlockForConfiguration()
    }
    
    private func turnOffFlashlight() {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else { return }
        
        try? device.lockForConfiguration()
        device.torchMode = .off
        device.unlockForConfiguration()
    }
    
    func updateProgress(_ progress: Float) {
        DispatchQueue.main.async {
            self.scanProgressView.setProgress(progress, animated: true)
            
            if progress >= 0.8 {
                self.instructionLabel.text = "Good coverage! Tap Complete when ready"
                self.instructionLabel.backgroundColor = UIColor.systemGreen.withAlphaComponent(0.6)
            } else if progress >= 0.5 {
                self.instructionLabel.text = "Keep scanning to improve accuracy"
            }
        }
    }
    
    func updateTrackingState(_ state: String, reason: String?) {
        DispatchQueue.main.async {
            switch state {
            case "normal":
                self.instructionLabel.text = "Move your device slowly to scan the room"
                self.instructionLabel.backgroundColor = UIColor.black.withAlphaComponent(0.6)
                
            case "limited":
                switch reason {
                case "initializing":
                    self.instructionLabel.text = "Initializing AR session..."
                case "excessiveMotion":
                    self.instructionLabel.text = "Slow down! Moving too fast"
                    self.instructionLabel.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.6)
                case "insufficientFeatures":
                    self.instructionLabel.text = "Point at a textured surface"
                    self.instructionLabel.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.6)
                case "relocalizing":
                    self.instructionLabel.text = "Relocalizing..."
                default:
                    self.instructionLabel.text = "Adjusting..."
                }
                
            case "notAvailable":
                self.instructionLabel.text = "AR not available"
                self.instructionLabel.backgroundColor = UIColor.systemRed.withAlphaComponent(0.6)
                
            default:
                break
            }
        }
    }
}

// MARK: - ARSCNViewDelegate

extension ARScanViewController: ARSCNViewDelegate {
    
    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        if let meshAnchor = anchor as? ARMeshAnchor {
            // Visualize mesh with semi-transparent material
            let meshGeometry = createGeometry(from: meshAnchor)
            let meshNode = SCNNode(geometry: meshGeometry)
            meshNode.opacity = 0.3
            node.addChildNode(meshNode)
        }
    }
    
    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        if let meshAnchor = anchor as? ARMeshAnchor {
            // Update mesh visualization
            node.childNodes.first?.geometry = createGeometry(from: meshAnchor)
        }
    }
    
    private func createGeometry(from meshAnchor: ARMeshAnchor) -> SCNGeometry {
        let meshGeometry = meshAnchor.geometry
        
        // Create vertices source
        let vertices = meshGeometry.vertices
        let vertexSource = SCNGeometrySource(
            buffer: vertices.buffer,
            vertexFormat: vertices.format,
            semantic: .vertex,
            vertexCount: vertices.count,
            dataOffset: vertices.offset,
            dataStride: vertices.stride
        )
        
        // Create normals source
        let normals = meshGeometry.normals
        let normalSource = SCNGeometrySource(
            buffer: normals.buffer,
            vertexFormat: normals.format,
            semantic: .normal,
            vertexCount: normals.count,
            dataOffset: normals.offset,
            dataStride: normals.stride
        )
        
        // Create faces element
        let faces = meshGeometry.faces
        let faceElement = SCNGeometryElement(
            buffer: faces.buffer,
            primitiveType: .triangles,
            primitiveCount: faces.count,
            bytesPerIndex: faces.bytesPerIndex
        )
        
        let geometry = SCNGeometry(sources: [vertexSource, normalSource], elements: [faceElement])
        
        // Apply material based on classification
        let material = SCNMaterial()
        material.diffuse.contents = UIColor.systemBlue.withAlphaComponent(0.3)
        material.isDoubleSided = true
        material.fillMode = .lines
        geometry.materials = [material]
        
        return geometry
    }
    
    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let stateString: String
        let reason: String?
        
        switch camera.trackingState {
        case .normal:
            stateString = "normal"
            reason = nil
        case .notAvailable:
            stateString = "notAvailable"
            reason = nil
        case .limited(let trackingReason):
            stateString = "limited"
            switch trackingReason {
            case .initializing: reason = "initializing"
            case .excessiveMotion: reason = "excessiveMotion"
            case .insufficientFeatures: reason = "insufficientFeatures"
            case .relocalizing: reason = "relocalizing"
            @unknown default: reason = "unknown"
            }
        }
        
        updateTrackingState(stateString, reason: reason)
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let scanCompleteRequested = Notification.Name("scanCompleteRequested")
}