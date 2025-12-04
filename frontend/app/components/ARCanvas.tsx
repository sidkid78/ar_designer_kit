'use client';

/**
 * ARCanvas.tsx - The Bridge to Native AR
 * 
 * This component is the critical bridge between React and native AR functionality.
 * It initializes the native AR view via the Capacitor bridge and handles all
 * AR-related interactions like scanning, object placement, and measurements.
 */

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useARBridge } from '@/lib/ar-bridge';
import { useWebXR } from '@/hooks/useWebXR';
import { useARStore } from '@/stores/useARStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface ARCanvasProps {
  className?: string;
  onScanComplete?: () => void;
  onObjectPlaced?: (objectId: string) => void;
  onMeasurementComplete?: (distance: number) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ARCanvas({
  className,
  onScanComplete,
  onObjectPlaced,
  onMeasurementComplete,
  onError,
}: ARCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isTouching, setIsTouching] = useState(false);

  // AR Bridge hook
  const {
    isSupported,
    hasAnyARSupport,
    isWebXRSupported,
    isScanning,
    scanProgress,
    trackingState,
    scanData,
    error: bridgeError,
    startScan,
    stopScan,
    placeObject,
    measureDistance,
    applyMaterial,
    hitTest,
    clearError: clearBridgeError,
  } = useARBridge();

  // WebXR hook for actual AR session
  const {
    startSession: startWebXRSession,
    endSession: endWebXRSession,
    isSessionActive: isWebXRActive,
    error: webXRError,
  } = useWebXR();

  // Zustand stores
  const {
    isSessionActive,
    currentTool,
    viewMode,
    selectedModelUrl,
    selectedMaterialUrl,
    startSession,
    endSession,
    setScanning,
    setScanProgress,
    setTrackingState,
    startMeasurement,
    completeMeasurement,
    setPlacementPreview,
    setError,
    clearError,
  } = useARStore();

  const {
    setScanData,
    addPlacedObject,
  } = useProjectStore();

  // ============================================================================
  // Effects
  // ============================================================================

  // Sync scanning state
  useEffect(() => {
    setScanning(isScanning);
  }, [isScanning, setScanning]);

  // Sync scan progress
  useEffect(() => {
    setScanProgress(scanProgress);
  }, [scanProgress, setScanProgress]);

  // Sync tracking state
  useEffect(() => {
    if (trackingState) {
      setTrackingState(trackingState);
    }
  }, [trackingState, setTrackingState]);

  // Handle scan completion
  useEffect(() => {
    if (scanData) {
      setScanData(scanData);
      onScanComplete?.();
    }
  }, [scanData, setScanData, onScanComplete]);

  // Handle errors
  useEffect(() => {
    if (bridgeError) {
      setError(bridgeError);
      onError?.(bridgeError);
    }
  }, [bridgeError, setError, onError]);

  // Handle WebXR errors
  useEffect(() => {
    if (webXRError) {
      setError(webXRError);
      onError?.(webXRError);
    }
  }, [webXRError, setError, onError]);

  // Sync WebXR session state
  useEffect(() => {
    if (isWebXRActive && !isSessionActive) {
      startSession();
    } else if (!isWebXRActive && isSessionActive) {
      endSession();
    }
  }, [isWebXRActive, isSessionActive, startSession, endSession]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleStartScan = useCallback(async () => {
    try {
      clearError();
      clearBridgeError();
      
      // Start actual WebXR AR session
      if (isWebXRSupported) {
        await startWebXRSession();
      }
      
      // Update store state
      startSession();
      
      // Start the AR bridge scan (for native features)
      await startScan({ recognizeObjects: true, highAccuracy: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start AR session';
      setError(message);
      onError?.(message);
    }
  }, [startScan, startSession, startWebXRSession, isWebXRSupported, clearError, clearBridgeError, setError, onError]);

  const handleStopScan = useCallback(async () => {
    try {
      await stopScan();
      endWebXRSession();
      endSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop scan';
      setError(message);
    }
  }, [stopScan, endSession, endWebXRSession, setError]);

  const handleTouchStart = useCallback(
    async (e: React.TouchEvent | React.MouseEvent) => {
      if (!isSessionActive) return;

      setIsTouching(true);

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      switch (currentTool) {
        case 'place':
          if (selectedModelUrl) {
            const hitResult = await hitTest(screenX, screenY);
            if (hitResult.hit && hitResult.position) {
              setPlacementPreview(hitResult.position, true);
            }
          }
          break;

        case 'measure':
          const measureHit = await hitTest(screenX, screenY);
          if (measureHit.hit && measureHit.position) {
            startMeasurement({
              id: `point_${Date.now()}`,
              screenPosition: { x: screenX, y: screenY },
              worldPosition: measureHit.position,
            });
          }
          break;

        case 'paint':
          if (selectedMaterialUrl) {
            await applyMaterial({
              materialUrl: selectedMaterialUrl,
              screenX,
              screenY,
            });
          }
          break;
      }
    },
    [
      isSessionActive,
      currentTool,
      selectedModelUrl,
      selectedMaterialUrl,
      hitTest,
      setPlacementPreview,
      startMeasurement,
      applyMaterial,
    ]
  );

  const handleTouchEnd = useCallback(
    async (e: React.TouchEvent | React.MouseEvent) => {
      if (!isSessionActive) return;

      setIsTouching(false);

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
      const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;

      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      switch (currentTool) {
        case 'place':
          if (selectedModelUrl) {
            try {
              const result = await placeObject({
                modelUrl: selectedModelUrl,
              });
              addPlacedObject({
                productName: 'Placed Object',
                modelUrl: selectedModelUrl,
                position: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                scale: { x: 1, y: 1, z: 1 },
              });
              onObjectPlaced?.(result.objectId);
            } catch (err) {
              console.error('Failed to place object:', err);
            }
          }
          break;

        case 'measure':
          // Complete measurement on second tap
          const measureHit = await hitTest(screenX, screenY);
          if (measureHit.hit && measureHit.position) {
            // Get distance from bridge
            const { currentMeasurement } = useARStore.getState();
            if (currentMeasurement?.startPoint) {
              const result = await measureDistance(
                { x: currentMeasurement.startPoint.screenPosition.x, y: currentMeasurement.startPoint.screenPosition.y },
                { x: screenX, y: screenY }
              );
              completeMeasurement(
                {
                  id: `point_${Date.now()}`,
                  screenPosition: { x: screenX, y: screenY },
                  worldPosition: measureHit.position,
                },
                result
              );
              onMeasurementComplete?.(result.distance);
            }
          }
          break;
      }
    },
    [
      isSessionActive,
      currentTool,
      selectedModelUrl,
      placeObject,
      addPlacedObject,
      onObjectPlaced,
      hitTest,
      measureDistance,
      completeMeasurement,
      onMeasurementComplete,
    ]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative w-full h-full bg-black overflow-hidden touch-none select-none',
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
    >
      {/* AR View Placeholder - Native view renders behind this */}
      <div className="absolute inset-0 flex items-center justify-center">
        {!isSessionActive && (
          <div className="text-center text-white/60 p-8">
            {hasAnyARSupport === false ? (
              <div className="space-y-4">
                <div className="text-6xl">📱</div>
                <p className="text-lg font-medium">AR Not Supported</p>
                <p className="text-sm">
                  This device doesn&apos;t support AR features.
                  <br />
                  Please use an AR-capable device.
                </p>
                <p className="text-xs text-white/40">
                  LiDAR: {isSupported ? '✓' : '✗'} | WebXR: {isWebXRSupported ? '✓' : '✗'}
                </p>
              </div>
            ) : hasAnyARSupport === null || (isSupported === null && isWebXRSupported === null) ? (
              <div className="space-y-4">
                <div className="animate-pulse text-4xl">🔍</div>
                <p>Checking device capabilities...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-6xl">📷</div>
                <p className="text-lg font-medium">Ready to Scan</p>
                <p className="text-sm text-white/40">
                  Tap the scan button to start
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scanning Overlay */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Scanning progress ring */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="#22c55e"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${scanProgress * 283} 283`}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {Math.round(scanProgress * 100)}%
              </span>
            </div>
          </div>

          {/* Scanning instructions */}
          <div className="absolute bottom-24 left-0 right-0 text-center">
            <p className="text-white text-lg font-medium drop-shadow-lg">
              Move your device slowly around the room
            </p>
            <p className="text-white/60 text-sm mt-2">
              Point at walls, floors, and furniture
            </p>
          </div>
        </div>
      )}

      {/* Tracking State Indicator */}
      {isSessionActive && trackingState && (
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                trackingState.state === 'normal' && 'bg-green-500',
                trackingState.state === 'limited' && 'bg-yellow-500',
                trackingState.state === 'notAvailable' && 'bg-red-500'
              )}
            />
            <span className="text-white text-xs font-medium capitalize">
              {trackingState.state === 'normal'
                ? 'Tracking'
                : trackingState.reason || trackingState.state}
            </span>
          </div>
        </div>
      )}

      {/* Touch indicator */}
      {isTouching && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/50 animate-ping" />
        </div>
      )}

      {/* Measurement overlay */}
      {currentTool === 'measure' && (
        <MeasurementOverlay />
      )}

      {/* Action Buttons */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
        {viewMode === 'scan' && !isScanning && (
          <button
            onClick={handleStartScan}
            disabled={!isSupported}
            className={cn(
              'px-8 py-4 rounded-full font-semibold text-lg shadow-xl',
              'bg-linear-to-b from-blue-500 to-purple-600 text-white',
              'hover:from-blue-600 hover:to-purple-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200 active:scale-95'
            )}
          >
            Start Scan
          </button>
        )}

        {isScanning && (
          <button
            onClick={handleStopScan}
            className={cn(
              'px-8 py-4 rounded-full font-semibold text-lg shadow-xl',
              'bg-red-500 text-white hover:bg-red-600',
              'transition-all duration-200 active:scale-95'
            )}
          >
            Stop Scan
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Measurement Overlay Component
// ============================================================================

function MeasurementOverlay() {
  const { measurements, currentMeasurement, measurementUnit } = useARStore();

  const formatDistance = (meters: number): string => {
    switch (measurementUnit) {
      case 'feet':
        return `${(meters * 3.28084).toFixed(2)} ft`;
      case 'inches':
        return `${(meters * 39.3701).toFixed(1)} in`;
      default:
        return `${meters.toFixed(2)} m`;
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Completed measurements */}
      {measurements.map((m) => (
        <div key={m.id} className="absolute">
          {m.startPoint && m.endPoint && m.distance && (
            <>
              {/* Line between points */}
              <svg className="absolute inset-0 w-full h-full">
                <line
                  x1={m.startPoint.screenPosition.x}
                  y1={m.startPoint.screenPosition.y}
                  x2={m.endPoint.screenPosition.x}
                  y2={m.endPoint.screenPosition.y}
                  stroke="white"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
              {/* Distance label */}
              <div
                className="absolute px-2 py-1 bg-black/70 rounded text-white text-sm font-mono"
                style={{
                  left:
                    (m.startPoint.screenPosition.x + m.endPoint.screenPosition.x) / 2 - 30,
                  top:
                    (m.startPoint.screenPosition.y + m.endPoint.screenPosition.y) / 2 - 12,
                }}
              >
                {formatDistance(m.distance)}
              </div>
            </>
          )}
        </div>
      ))}

      {/* Current measurement in progress */}
      {currentMeasurement?.startPoint && (
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-yellow-400 border-2 border-white animate-pulse"
          style={{
            left: currentMeasurement.startPoint.screenPosition.x,
            top: currentMeasurement.startPoint.screenPosition.y,
          }}
        />
      )}

      {/* Instructions */}
      <div className="absolute top-20 left-0 right-0 text-center">
        <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
          {currentMeasurement ? 'Tap second point to measure' : 'Tap to set first point'}
        </p>
      </div>
    </div>
  );
}

export default ARCanvas;

