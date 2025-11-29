// LiDARScanManager.swift
// AR Designer Kit - LiDAR Mesh Capture and Processing
// Copyright 2024

import Foundation
import ARKit
import SceneKit
import ModelIO
import MetalKit

// MARK: - Protocols

protocol LiDARScanManagerDelegate: AnyObject {
    func scanManager(_ manager: LiDARScanManager, didUpdateProgress progress: Float)
    func scanManager(_ manager: LiDARScanManager, didRecognizeObject object: RecognizedObject)
    func scanManager(_ manager: LiDARScanManager, didEncounterError error: Error)
}

// MARK: - Data Structures

struct ScanData {
    let meshFileURL: URL
    let dimensions: RoomDimensions
    let recognizedObjects: [RecognizedObject]
    let floorPlanPoints: [[String: Float]]
    let captureDate: Date
}

struct RoomDimensions {
    let width: Float
    let length: Float
    let height: Float
}

struct RecognizedObject {
    let label: String
    let confidence: Float
    let position: simd_float3
    let boundingBox: (min: simd_float3, max: simd_float3)
    let classification: ARMeshClassification?
}

// MARK: - LiDAR Scan Manager

class LiDARScanManager: NSObject {
    
    // MARK: - Properties
    
    weak var delegate: LiDARScanManagerDelegate?
    
    private let session: ARSession
    private let recognizeObjects: Bool
    private var meshAnchors: [ARMeshAnchor] = []
    private var recognizedObjects: [RecognizedObject] = []
    private var floorPoints: [simd_float3] = []
    private var scanStartTime: Date?
    
    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    
    // Classification labels for ARKit mesh classification
    private let classificationLabels: [ARMeshClassification: String] = [
        .wall: "wall",
        .floor: "floor",
        .ceiling: "ceiling",
        .table: "table",
        .seat: "seat",
        .window: "window",
        .door: "door",
        .none: "unknown"
    ]
    
    // MARK: - Initialization
    
    init(session: ARSession, recognizeObjects: Bool = true) {
        self.session = session
        self.recognizeObjects = recognizeObjects
        self.device = MTLCreateSystemDefaultDevice()!
        self.commandQueue = device.makeCommandQueue()!
        
        super.init()
        
        session.delegate = self
    }
    
    // MARK: - Public Methods
    
    func finalizeScan(completion: @escaping (Result<ScanData, Error>) -> Void) {
        guard !meshAnchors.isEmpty else {
            completion(.failure(ScanError.noMeshData))
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            do {
                // Combine all mesh anchors into a single mesh
                let combinedMesh = try self.combineMeshAnchors()
                
                // Calculate room dimensions from bounding box
                let dimensions = self.calculateRoomDimensions(from: combinedMesh)
                
                // Export to GLB format
                let meshURL = try self.exportMeshToGLB(combinedMesh)
                
                // Generate floor plan points (2D projection)
                let floorPlanPoints = self.generateFloorPlanPoints()
                
                let scanData = ScanData(
                    meshFileURL: meshURL,
                    dimensions: dimensions,
                    recognizedObjects: self.recognizedObjects,
                    floorPlanPoints: floorPlanPoints,
                    captureDate: Date()
                )
                
                DispatchQueue.main.async {
                    completion(.success(scanData))
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    func exportMesh(format: String, completion: @escaping (Result<URL, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            do {
                let combinedMesh = try self.combineMeshAnchors()
                
                let url: URL
                switch format.lowercased() {
                case "glb", "gltf":
                    url = try self.exportMeshToGLB(combinedMesh)
                case "usdz":
                    url = try self.exportMeshToUSDZ(combinedMesh)
                case "obj":
                    url = try self.exportMeshToOBJ(combinedMesh)
                default:
                    url = try self.exportMeshToGLB(combinedMesh)
                }
                
                DispatchQueue.main.async {
                    completion(.success(url))
                }
            } catch {
                DispatchQueue.main.async {
                    completion(.failure(error))
                }
            }
        }
    }
    
    // MARK: - Mesh Processing
    
    private func combineMeshAnchors() throws -> MDLMesh {
        var allVertices: [simd_float3] = []
        var allNormals: [simd_float3] = []
        var allIndices: [UInt32] = []
        var allClassifications: [UInt8] = []
        
        var indexOffset: UInt32 = 0
        
        for anchor in meshAnchors {
            let geometry = anchor.geometry
            
            // Get vertices
            let vertexBuffer = geometry.vertices
            let vertexStride = geometry.vertices.stride
            let vertexCount = geometry.vertices.count
            
            for i in 0..<vertexCount {
                let vertexPointer = vertexBuffer.buffer.contents()
                    .advanced(by: vertexBuffer.offset + vertexStride * i)
                let vertex = vertexPointer.assumingMemoryBound(to: simd_float3.self).pointee
                
                // Transform to world coordinates
                let worldVertex = anchor.transform * simd_float4(vertex, 1)
                allVertices.append(simd_float3(worldVertex.x, worldVertex.y, worldVertex.z))
            }
            
            // Get normals
            let normalBuffer = geometry.normals
            let normalStride = geometry.normals.stride
            
            for i in 0..<vertexCount {
                let normalPointer = normalBuffer.buffer.contents()
                    .advanced(by: normalBuffer.offset + normalStride * i)
                let normal = normalPointer.assumingMemoryBound(to: simd_float3.self).pointee
                
                // Transform normal to world coordinates (rotation only)
                let worldNormal = simd_float3x3(
                    simd_float3(anchor.transform.columns.0.x, anchor.transform.columns.0.y, anchor.transform.columns.0.z),
                    simd_float3(anchor.transform.columns.1.x, anchor.transform.columns.1.y, anchor.transform.columns.1.z),
                    simd_float3(anchor.transform.columns.2.x, anchor.transform.columns.2.y, anchor.transform.columns.2.z)
                ) * normal
                
                allNormals.append(normalize(worldNormal))
            }
            
            // Get face indices
            let faceBuffer = geometry.faces
            let bytesPerIndex = geometry.faces.bytesPerIndex
            let faceCount = geometry.faces.count
            
            for i in 0..<(faceCount * 3) {
                let indexPointer = faceBuffer.buffer.contents()
                    .advanced(by: faceBuffer.offset + bytesPerIndex * i)
                
                let index: UInt32
                if bytesPerIndex == 4 {
                    index = indexPointer.assumingMemoryBound(to: UInt32.self).pointee
                } else {
                    index = UInt32(indexPointer.assumingMemoryBound(to: UInt16.self).pointee)
                }
                
                allIndices.append(index + indexOffset)
            }
            
            // Get classifications if available
            if let classificationBuffer = geometry.classification {
                let classificationStride = classificationBuffer.stride
                
                for i in 0..<faceCount {
                    let classPointer = classificationBuffer.buffer.contents()
                        .advanced(by: classificationBuffer.offset + classificationStride * i)
                    let classification = classPointer.assumingMemoryBound(to: UInt8.self).pointee
                    allClassifications.append(classification)
                }
            }
            
            indexOffset += UInt32(vertexCount)
        }
        
        // Create MDLMesh from combined data
        let allocator = MTKMeshBufferAllocator(device: device)
        
        // Create vertex buffer
        let vertexData = Data(bytes: allVertices, count: allVertices.count * MemoryLayout<simd_float3>.stride)
        let vertexBuffer = allocator.newBuffer(with: vertexData, type: .vertex)
        
        let normalData = Data(bytes: allNormals, count: allNormals.count * MemoryLayout<simd_float3>.stride)
        let normalBuffer = allocator.newBuffer(with: normalData, type: .vertex)
        
        // Create index buffer
        let indexData = Data(bytes: allIndices, count: allIndices.count * MemoryLayout<UInt32>.stride)
        let indexBuffer = allocator.newBuffer(with: indexData, type: .index)
        
        // Create submesh
        let submesh = MDLSubmesh(
            indexBuffer: indexBuffer,
            indexCount: allIndices.count,
            indexType: .uInt32,
            geometryType: .triangles,
            material: nil
        )
        
        // Create vertex descriptor
        let vertexDescriptor = MDLVertexDescriptor()
        vertexDescriptor.attributes[0] = MDLVertexAttribute(
            name: MDLVertexAttributePosition,
            format: .float3,
            offset: 0,
            bufferIndex: 0
        )
        vertexDescriptor.attributes[1] = MDLVertexAttribute(
            name: MDLVertexAttributeNormal,
            format: .float3,
            offset: 0,
            bufferIndex: 1
        )
        vertexDescriptor.layouts[0] = MDLVertexBufferLayout(stride: MemoryLayout<simd_float3>.stride)
        vertexDescriptor.layouts[1] = MDLVertexBufferLayout(stride: MemoryLayout<simd_float3>.stride)
        
        // Create mesh
        let mesh = MDLMesh(
            vertexBuffers: [vertexBuffer, normalBuffer],
            vertexCount: allVertices.count,
            descriptor: vertexDescriptor,
            submeshes: [submesh]
        )
        
        return mesh
    }
    
    private func calculateRoomDimensions(from mesh: MDLMesh) -> RoomDimensions {
        let boundingBox = mesh.boundingBox
        
        let width = boundingBox.maxBounds.x - boundingBox.minBounds.x
        let height = boundingBox.maxBounds.y - boundingBox.minBounds.y
        let length = boundingBox.maxBounds.z - boundingBox.minBounds.z
        
        return RoomDimensions(width: width, length: length, height: height)
    }
    
    private func generateFloorPlanPoints() -> [[String: Float]] {
        // Project floor points to 2D (x, z plane)
        return floorPoints.map { point in
            ["x": point.x, "y": point.z] // y in 2D = z in 3D
        }
    }
    
    // MARK: - Export Methods
    
    private func exportMeshToGLB(_ mesh: MDLMesh) throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "scan_\(UUID().uuidString).glb"
        let fileURL = tempDir.appendingPathComponent(fileName)
        
        let asset = MDLAsset()
        asset.add(mesh)
        
        // Export as GLB (binary glTF)
        try asset.export(to: fileURL)
        
        return fileURL
    }
    
    private func exportMeshToUSDZ(_ mesh: MDLMesh) throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "scan_\(UUID().uuidString).usdz"
        let fileURL = tempDir.appendingPathComponent(fileName)
        
        let asset = MDLAsset()
        asset.add(mesh)
        
        try asset.export(to: fileURL)
        
        return fileURL
    }
    
    private func exportMeshToOBJ(_ mesh: MDLMesh) throws -> URL {
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = "scan_\(UUID().uuidString).obj"
        let fileURL = tempDir.appendingPathComponent(fileName)
        
        let asset = MDLAsset()
        asset.add(mesh)
        
        try asset.export(to: fileURL)
        
        return fileURL
    }
    
    // MARK: - Object Recognition
    
    private func processClassifications(for anchor: ARMeshAnchor) {
        guard recognizeObjects, let classification = anchor.geometry.classification else { return }
        
        let geometry = anchor.geometry
        let faceCount = geometry.faces.count
        
        // Group faces by classification
        var classificationGroups: [ARMeshClassification: [Int]] = [:]
        
        for i in 0..<faceCount {
            let classPointer = classification.buffer.contents()
                .advanced(by: classification.offset + classification.stride * i)
            let classValue = classPointer.assumingMemoryBound(to: UInt8.self).pointee
            
            if let meshClass = ARMeshClassification(rawValue: Int(classValue)) {
                if classificationGroups[meshClass] == nil {
                    classificationGroups[meshClass] = []
                }
                classificationGroups[meshClass]?.append(i)
            }
        }
        
        // Create recognized objects from significant groups
        for (classification, faceIndices) in classificationGroups {
            guard classification != .none, faceIndices.count > 10 else { continue }
            
            // Calculate bounding box for this classification group
            var minBounds = simd_float3(Float.infinity, Float.infinity, Float.infinity)
            var maxBounds = simd_float3(-Float.infinity, -Float.infinity, -Float.infinity)
            
            let vertexBuffer = geometry.vertices
            let faceBuffer = geometry.faces
            let bytesPerIndex = geometry.faces.bytesPerIndex
            
            for faceIndex in faceIndices {
                for j in 0..<3 {
                    let indexPointer = faceBuffer.buffer.contents()
                        .advanced(by: faceBuffer.offset + bytesPerIndex * (faceIndex * 3 + j))
                    
                    let vertexIndex: Int
                    if bytesPerIndex == 4 {
                        vertexIndex = Int(indexPointer.assumingMemoryBound(to: UInt32.self).pointee)
                    } else {
                        vertexIndex = Int(indexPointer.assumingMemoryBound(to: UInt16.self).pointee)
                    }
                    
                    let vertexPointer = vertexBuffer.buffer.contents()
                        .advanced(by: vertexBuffer.offset + vertexBuffer.stride * vertexIndex)
                    let vertex = vertexPointer.assumingMemoryBound(to: simd_float3.self).pointee
                    
                    // Transform to world coordinates
                    let worldVertex = anchor.transform * simd_float4(vertex, 1)
                    let worldPos = simd_float3(worldVertex.x, worldVertex.y, worldVertex.z)
                    
                    minBounds = min(minBounds, worldPos)
                    maxBounds = max(maxBounds, worldPos)
                }
            }
            
            let center = (minBounds + maxBounds) / 2
            let confidence = Float(faceIndices.count) / Float(faceCount)
            
            let recognizedObject = RecognizedObject(
                label: classificationLabels[classification] ?? "unknown",
                confidence: min(confidence * 2, 1.0), // Scale up confidence
                position: center,
                boundingBox: (min: minBounds, max: maxBounds),
                classification: classification
            )
            
            // Check if we already have a similar object (avoid duplicates)
            let isDuplicate = recognizedObjects.contains { existing in
                simd_distance(existing.position, center) < 0.5 &&
                existing.label == recognizedObject.label
            }
            
            if !isDuplicate {
                recognizedObjects.append(recognizedObject)
                delegate?.scanManager(self, didRecognizeObject: recognizedObject)
                
                // Track floor points for floor plan generation
                if classification == .floor {
                    floorPoints.append(center)
                }
            }
        }
    }
}

// MARK: - ARSessionDelegate

extension LiDARScanManager: ARSessionDelegate {
    
    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        for anchor in anchors {
            if let meshAnchor = anchor as? ARMeshAnchor {
                meshAnchors.append(meshAnchor)
                processClassifications(for: meshAnchor)
                
                // Update progress
                let progress = min(Float(meshAnchors.count) / 50.0, 1.0)
                delegate?.scanManager(self, didUpdateProgress: progress)
            }
        }
    }
    
    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        for anchor in anchors {
            if let meshAnchor = anchor as? ARMeshAnchor {
                // Update existing mesh anchor
                if let index = meshAnchors.firstIndex(where: { $0.identifier == meshAnchor.identifier }) {
                    meshAnchors[index] = meshAnchor
                }
                processClassifications(for: meshAnchor)
            }
        }
    }
    
    func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        for anchor in anchors {
            if let meshAnchor = anchor as? ARMeshAnchor {
                meshAnchors.removeAll { $0.identifier == meshAnchor.identifier }
            }
        }
    }
    
    func session(_ session: ARSession, didFailWithError error: Error) {
        delegate?.scanManager(self, didEncounterError: error)
    }
}

// MARK: - Errors

enum ScanError: LocalizedError {
    case noMeshData
    case exportFailed
    case deviceNotSupported
    
    var errorDescription: String? {
        switch self {
        case .noMeshData: return "No mesh data captured"
        case .exportFailed: return "Failed to export mesh"
        case .deviceNotSupported: return "LiDAR not supported on this device"
        }
    }
}