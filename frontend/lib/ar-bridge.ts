// ar-bridge.ts
// AR Designer Kit - Capacitor Plugin JavaScript Interface
// Copyright 2024

import { registerPlugin } from '@capacitor/core';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ARBridgePlugin {
  // Device Capability Checks
  checkLiDARSupport(): Promise<LiDARSupportResult>;
  
  // Scanning
  startScan(options?: ScanOptions): Promise<ScanStartResult>;
  stopScan(): Promise<ScanResult>;
  
  // Object Placement
  placeObject(options: PlaceObjectOptions): Promise<PlaceObjectResult>;
  removeObject(options: { objectId: string }): Promise<{ status: string }>;
  
  // Measurement
  measureDistance(options: MeasureOptions): Promise<MeasureResult>;
  
  // Materials
  applyVirtualMaterial(options: MaterialOptions): Promise<{ status: string }>;
  
  // Utilities
  hitTest(options: HitTestOptions): Promise<HitTestResult>;
  exportMesh(options?: ExportOptions): Promise<ExportResult>;
  getTrackingState(): Promise<TrackingStateResult>;
  
  // Event Listeners
  addListener(event: 'scanStarted', callback: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'scanComplete', callback: (data: ScanCompleteEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'scanProgress', callback: (data: { progress: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'scanDismissed', callback: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'scanError', callback: (data: { error: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'objectPlaced', callback: (data: ObjectPlacedEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'objectRemoved', callback: (data: { objectId: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'objectRecognized', callback: (data: RecognizedObjectEvent) => void): Promise<PluginListenerHandle>;
  addListener(event: 'materialApplied', callback: (data: MaterialAppliedEvent) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export interface PluginListenerHandle {
  remove: () => Promise<void>;
}

// Support Check Types
export interface LiDARSupportResult {
  supportsLiDAR: boolean;
  supportsDepth: boolean;
  supportsWorldTracking: boolean;
  supportsPeopleOcclusion: boolean;
}

// Scan Types
export interface ScanOptions {
  recognizeObjects?: boolean;
  highAccuracy?: boolean;
}

export interface ScanStartResult {
  status: 'scanning' | 'error';
}

export interface ScanResult {
  status: 'complete' | 'error';
  meshUrl?: string;
}

export interface ScanCompleteEvent {
  meshUrl: string;
  dimensions: RoomDimensions;
  recognizedObjects: RecognizedObject[];
  floorPlanPoints: Array<{ x: number; y: number }>;
}

export interface RoomDimensions {
  width: number;
  length: number;
  height: number;
}

export interface RecognizedObject {
  label: string;
  confidence: number;
  boundingBox: BoundingBox3D;
}

export interface BoundingBox3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

// Object Placement Types
export interface PlaceObjectOptions {
  modelUrl: string;
  objectId?: string;
  position?: Vector3;
  rotation?: Quaternion;
  scale?: number;
}

export interface PlaceObjectResult {
  objectId: string;
  status: 'placed' | 'error';
}

export interface ObjectPlacedEvent {
  objectId: string;
  position: Vector3;
}

// Measurement Types
export interface MeasureOptions {
  point1: ScreenPoint;
  point2: ScreenPoint;
}

export interface MeasureResult {
  distance: number;
  unit: 'meters';
  point1: Vector3;
  point2: Vector3;
  midpoint: Vector3;
}

// Material Types
export interface MaterialOptions {
  materialUrl: string;
  screenX: number;
  screenY: number;
  scale?: number;
}

export interface MaterialAppliedEvent {
  anchorId: string;
  materialUrl: string;
}

// Hit Test Types
export interface HitTestOptions {
  screenX: number;
  screenY: number;
}

export interface HitTestResult {
  hit: boolean;
  position?: Vector3;
}

// Export Types
export interface ExportOptions {
  format?: 'glb' | 'usdz' | 'obj';
}

export interface ExportResult {
  meshUrl: string;
  format: string;
}

// Tracking State Types
export interface TrackingStateResult {
  state: 'normal' | 'limited' | 'notAvailable';
  reason?: 'initializing' | 'excessiveMotion' | 'insufficientFeatures' | 'relocalizing' | 'unknown';
}

// Common Types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface RecognizedObjectEvent {
  label: string;
  confidence: number;
  position: Vector3;
}

// ============================================================================
// Plugin Registration
// ============================================================================

const ARBridge = registerPlugin<ARBridgePlugin>('ARBridge', {
  web: () => Promise.resolve(new ARBridgeWeb()),
});

export { ARBridge };

// ============================================================================
// React Hook
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseARBridgeReturn {
  // State
  isSupported: boolean | null;
  isScanning: boolean;
  scanProgress: number;
  trackingState: TrackingStateResult | null;
  scanData: ScanCompleteEvent | null;
  placedObjects: Map<string, PlaceObjectResult>;
  recognizedObjects: RecognizedObject[];
  error: string | null;
  
  // Actions
  checkSupport: () => Promise<LiDARSupportResult>;
  startScan: (options?: ScanOptions) => Promise<void>;
  stopScan: () => Promise<ScanResult>;
  placeObject: (options: PlaceObjectOptions) => Promise<PlaceObjectResult>;
  removeObject: (objectId: string) => Promise<void>;
  measureDistance: (point1: ScreenPoint, point2: ScreenPoint) => Promise<MeasureResult>;
  applyMaterial: (options: MaterialOptions) => Promise<void>;
  hitTest: (screenX: number, screenY: number) => Promise<HitTestResult>;
  exportMesh: (format?: 'glb' | 'usdz' | 'obj') => Promise<ExportResult>;
  clearError: () => void;
}

export function useARBridge(): UseARBridgeReturn {
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [trackingState, setTrackingState] = useState<TrackingStateResult | null>(null);
  const [scanData, setScanData] = useState<ScanCompleteEvent | null>(null);
  const [placedObjects, setPlacedObjects] = useState<Map<string, PlaceObjectResult>>(new Map());
  const [recognizedObjects, setRecognizedObjects] = useState<RecognizedObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const listenersRef = useRef<PluginListenerHandle[]>([]);
  
  // Setup event listeners
  useEffect(() => {
    const setupListeners = async () => {
      const listeners = await Promise.all([
        ARBridge.addListener('scanStarted', (): void => {
          setIsScanning(true);
          setScanProgress(0);
          setError(null);
        }),
        
        ARBridge.addListener('scanComplete', (data: ScanCompleteEvent) => {
          setIsScanning(false);
          setScanData(data);
          setRecognizedObjects(data.recognizedObjects);
        }),
        
        ARBridge.addListener('scanProgress', ({ progress }: { progress: number }) => {
          setScanProgress(progress);
        }),
        
        ARBridge.addListener('scanDismissed', () => {
          setIsScanning(false);
        }),
        
        ARBridge.addListener('scanError', ({ error: err }: { error: string }) => {
          setError(err);
          setIsScanning(false);
        }),
        
        ARBridge.addListener('objectPlaced', (data: ObjectPlacedEvent) => {
          setPlacedObjects(prev => new Map(prev).set(data.objectId, { 
            objectId: data.objectId, 
            status: 'placed' 
          }));
        }),
        
        ARBridge.addListener('objectRemoved', ({ objectId }: { objectId: string }) => {
          setPlacedObjects(prev => {
            const next = new Map(prev);
            next.delete(objectId);
            return next;
          });
        }),
        
        ARBridge.addListener('objectRecognized', (data: RecognizedObjectEvent) => {
          setRecognizedObjects(prev => [...prev, {
            label: data.label,
            confidence: data.confidence,
            boundingBox: {
              minX: data.position.x - 0.1,
              minY: data.position.y - 0.1,
              minZ: data.position.z - 0.1,
              maxX: data.position.x + 0.1,
              maxY: data.position.y + 0.1,
              maxZ: data.position.z + 0.1,
            }
          }]);
        }),
      ]);
      
      listenersRef.current = listeners;
    };
    
    setupListeners();
    
    return () => {
      listenersRef.current.forEach(listener => listener.remove());
      listenersRef.current = [];
    };
  }, []);
  
  // Actions
  const checkSupport = useCallback(async () => {
    const result = await ARBridge.checkLiDARSupport();
    setIsSupported(result.supportsLiDAR);
    return result;
  }, []);
  
  const startScan = useCallback(async (options?: ScanOptions) => {
    try {
      setError(null);
      await ARBridge.startScan(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      throw err;
    }
  }, []);
  
  const stopScan = useCallback(async () => {
    try {
      return await ARBridge.stopScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop scan');
      throw err;
    }
  }, []);
  
  const placeObject = useCallback(async (options: PlaceObjectOptions) => {
    try {
      const result = await ARBridge.placeObject(options);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place object');
      throw err;
    }
  }, []);
  
  const removeObject = useCallback(async (objectId: string) => {
    try {
      await ARBridge.removeObject({ objectId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove object');
      throw err;
    }
  }, []);
  
  const measureDistance = useCallback(async (point1: ScreenPoint, point2: ScreenPoint) => {
    try {
      return await ARBridge.measureDistance({ point1, point2 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to measure distance');
      throw err;
    }
  }, []);
  
  const applyMaterial = useCallback(async (options: MaterialOptions) => {
    try {
      await ARBridge.applyVirtualMaterial(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply material');
      throw err;
    }
  }, []);
  
  const hitTest = useCallback(async (screenX: number, screenY: number) => {
    try {
      return await ARBridge.hitTest({ screenX, screenY });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hit test failed');
      throw err;
    }
  }, []);
  
  const exportMesh = useCallback(async (format?: 'glb' | 'usdz' | 'obj') => {
    try {
      return await ARBridge.exportMesh({ format });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export mesh');
      throw err;
    }
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  // Check support on mount
  useEffect(() => {
    let isMounted = true;
    
    ARBridge.checkLiDARSupport()
      .then((result: LiDARSupportResult) => {
        if (isMounted) {
          setIsSupported(result.supportsLiDAR);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsSupported(false);
        }
      });
    
    return () => {
      isMounted = false;
    };
  }, []);
  
  // Poll tracking state while scanning
  useEffect(() => {
    if (!isScanning) return;
    
    const interval = setInterval(async () => {
      try {
        const state = await ARBridge.getTrackingState();
        setTrackingState(state);
      } catch {
        // Ignore errors during polling
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isScanning]);
  
  return {
    isSupported,
    isScanning,
    scanProgress,
    trackingState,
    scanData,
    placedObjects,
    recognizedObjects,
    error,
    checkSupport,
    startScan,
    stopScan,
    placeObject,
    removeObject,
    measureDistance,
    applyMaterial,
    hitTest,
    exportMesh,
    clearError,
  };
}

// ============================================================================
// Web Fallback (for development/testing)
// ============================================================================

// Callback type for AR event listeners (compatible with all listener signatures)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AREventCallback = (...args: any[]) => void;

export class ARBridgeWeb implements ARBridgePlugin {
  private listeners: Map<string, Set<AREventCallback>> = new Map();
  
  async checkLiDARSupport(): Promise<LiDARSupportResult> {
    console.warn('[ARBridge] Running in web mode - LiDAR not available');
    return {
      supportsLiDAR: false,
      supportsDepth: false,
      supportsWorldTracking: false,
      supportsPeopleOcclusion: false,
    };
  }
  
  async startScan(_options?: ScanOptions): Promise<ScanStartResult> {
    console.warn('[ARBridge] startScan called in web mode');
    this.emit('scanStarted', {});
    
    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 0.1;
      this.emit('scanProgress', { progress: Math.min(progress, 1) });
      
      if (progress >= 1) {
        clearInterval(interval);
      }
    }, 500);
    
    return { status: 'scanning' };
  }
  
  async stopScan(): Promise<ScanResult> {
    console.warn('[ARBridge] stopScan called in web mode');
    
    const mockScanData: ScanCompleteEvent = {
      meshUrl: 'mock://scan.glb',
      dimensions: { width: 5, length: 4, height: 2.5 },
      recognizedObjects: [
        { label: 'wall', confidence: 0.95, boundingBox: { minX: 0, minY: 0, minZ: 0, maxX: 5, maxY: 2.5, maxZ: 0.1 } },
        { label: 'floor', confidence: 0.98, boundingBox: { minX: 0, minY: 0, minZ: 0, maxX: 5, maxY: 0.1, maxZ: 4 } },
        { label: 'window', confidence: 0.85, boundingBox: { minX: 1, minY: 0.8, minZ: 0, maxX: 2.5, maxY: 2, maxZ: 0.1 } },
      ],
      floorPlanPoints: [
        { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }
      ],
    };
    
    this.emit('scanComplete', mockScanData);
    
    return { status: 'complete', meshUrl: mockScanData.meshUrl };
  }
  
  async placeObject(options: PlaceObjectOptions): Promise<PlaceObjectResult> {
    console.warn('[ARBridge] placeObject called in web mode', options);
    const objectId = options.objectId || `obj_${Date.now()}`;
    
    this.emit('objectPlaced', {
      objectId,
      position: options.position || { x: 0, y: 0, z: -1 }
    });
    
    return { objectId, status: 'placed' };
  }
  
  async removeObject(options: { objectId: string }): Promise<{ status: string }> {
    console.warn('[ARBridge] removeObject called in web mode', options);
    this.emit('objectRemoved', { objectId: options.objectId });
    return { status: 'removed' };
  }
  
  async measureDistance(_options: MeasureOptions): Promise<MeasureResult> {
    console.warn('[ARBridge] measureDistance called in web mode');
    return {
      distance: 2.5,
      unit: 'meters',
      point1: { x: 0, y: 0, z: 0 },
      point2: { x: 2.5, y: 0, z: 0 },
      midpoint: { x: 1.25, y: 0, z: 0 },
    };
  }
  
  async applyVirtualMaterial(_options: MaterialOptions): Promise<{ status: string }> {
    console.warn('[ARBridge] applyVirtualMaterial called in web mode');
    return { status: 'applied' };
  }
  
  async hitTest(_options: HitTestOptions): Promise<HitTestResult> {
    console.warn('[ARBridge] hitTest called in web mode');
    return { hit: true, position: { x: 0, y: 0, z: -1 } };
  }
  
  async exportMesh(_options?: ExportOptions): Promise<ExportResult> {
    console.warn('[ARBridge] exportMesh called in web mode');
    return { meshUrl: 'mock://exported.glb', format: _options?.format || 'glb' };
  }
  
  async getTrackingState(): Promise<TrackingStateResult> {
    return { state: 'normal' };
  }
  
  async addListener(event: string, callback: AREventCallback): Promise<PluginListenerHandle> {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    return {
      remove: async () => {
        this.listeners.get(event)?.delete(callback);
      }
    };
  }
  
  async removeAllListeners(): Promise<void> {
    this.listeners.clear();
  }
  
  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }
}