// hooks/useWebXR.ts
// React hook for WebXR AR functionality

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { checkWebXRSupport, type WebXRSupport } from '@/lib/webxr';

export interface PlacedObject {
  id: string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: number;
}

export interface UseWebXRReturn {
  // Support
  support: WebXRSupport | null;
  isChecking: boolean;
  
  // Session state
  isSessionActive: boolean;
  isSessionSupported: boolean;
  
  // Objects
  placedObjects: PlacedObject[];
  selectedObjectId: string | null;
  
  // Actions
  startSession: () => Promise<void>;
  endSession: () => void;
  placeObject: (modelUrl: string, position?: { x: number; y: number; z: number }) => string;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  updateObjectTransform: (id: string, transform: Partial<Pick<PlacedObject, 'position' | 'rotation' | 'scale'>>) => void;
  
  // Hit test
  lastHitPosition: { x: number; y: number; z: number } | null;
  
  // Error
  error: string | null;
}

export function useWebXR(): UseWebXRReturn {
  const [support, setSupport] = useState<WebXRSupport | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [lastHitPosition, setLastHitPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);

  // Check WebXR support on mount
  useEffect(() => {
    let mounted = true;
    
    checkWebXRSupport().then((result) => {
      if (mounted) {
        setSupport(result);
        setIsChecking(false);
      }
    });
    
    return () => {
      mounted = false;
    };
  }, []);

  // Start AR session
  const startSession = useCallback(async () => {
    if (!support?.hasAR) {
      setError('AR not supported on this device');
      return;
    }

    try {
      const session = await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
      });

      sessionRef.current = session;
      setIsSessionActive(true);
      setError(null);

      // Set up hit test source
      const referenceSpace = await session.requestReferenceSpace('local-floor');
      const viewerSpace = await session.requestReferenceSpace('viewer');
      
      hitTestSourceRef.current = await session.requestHitTestSource!({
        space: viewerSpace,
      });

      // Handle session end
      session.addEventListener('end', () => {
        setIsSessionActive(false);
        sessionRef.current = null;
        hitTestSourceRef.current = null;
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start AR session');
    }
  }, [support]);

  // End AR session
  const endSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.end();
    }
  }, []);

  // Place object
  const placeObject = useCallback((modelUrl: string, position?: { x: number; y: number; z: number }) => {
    const id = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newObject: PlacedObject = {
      id,
      modelUrl,
      position: position || lastHitPosition || { x: 0, y: 0, z: -1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1,
    };

    setPlacedObjects((prev) => [...prev, newObject]);
    return id;
  }, [lastHitPosition]);

  // Remove object
  const removeObject = useCallback((id: string) => {
    setPlacedObjects((prev) => prev.filter((obj) => obj.id !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
  }, [selectedObjectId]);

  // Select object
  const selectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
  }, []);

  // Update object transform
  const updateObjectTransform = useCallback((
    id: string, 
    transform: Partial<Pick<PlacedObject, 'position' | 'rotation' | 'scale'>>
  ) => {
    setPlacedObjects((prev) => prev.map((obj) => {
      if (obj.id !== id) return obj;
      return {
        ...obj,
        ...(transform.position && { position: transform.position }),
        ...(transform.rotation && { rotation: transform.rotation }),
        ...(transform.scale !== undefined && { scale: transform.scale }),
      };
    }));
  }, []);

  return {
    support,
    isChecking,
    isSessionActive,
    isSessionSupported: support?.hasAR ?? false,
    placedObjects,
    selectedObjectId,
    startSession,
    endSession,
    placeObject,
    removeObject,
    selectObject,
    updateObjectTransform,
    lastHitPosition,
    error,
  };
}

