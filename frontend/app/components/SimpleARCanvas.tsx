'use client';

/**
 * SimpleARCanvas.tsx
 * A simple WebXR AR canvas that doesn't rely on React Three Fiber
 * Compatible with React 19
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SimpleARCanvasProps {
  className?: string;
  onARStart?: () => void;
  onAREnd?: () => void;
  onError?: (error: string) => void;
  selectedFurniture?: { name: string; emoji: string } | null;
  onFurniturePlaced?: (name: string) => void;
}

interface PlacedMarker {
  id: string;
  position: { x: number; y: number; z: number };
  furniture?: { name: string; emoji: string };
}

// Distance threshold for selecting a marker (in meters)
const SELECT_THRESHOLD = 0.15;

export function SimpleARCanvas({
  className,
  onARStart,
  onAREnd,
  onError,
  selectedFurniture,
  onFurniturePlaced,
}: SimpleARCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isARSupported, setIsARSupported] = useState<boolean | null>(null);
  const [isARActive, setIsARActive] = useState(false);
  const [status, setStatus] = useState('Checking AR support...');
  const [placedMarkers, setPlacedMarkers] = useState<PlacedMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [hitPosition, setHitPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const referenceSpaceRef = useRef<XRReferenceSpace | null>(null);
  const hitPositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const markersRef = useRef<PlacedMarker[]>([]);
  const selectedMarkerIdRef = useRef<string | null>(null);
  const selectedFurnitureRef = useRef<{ name: string; emoji: string } | null>(null);
  const onFurniturePlacedRef = useRef<((name: string) => void) | null>(null);

  // Keep refs in sync with props
  useEffect(() => {
    selectedFurnitureRef.current = selectedFurniture || null;
    onFurniturePlacedRef.current = onFurniturePlaced || null;
  }, [selectedFurniture, onFurniturePlaced]);

  // Check WebXR AR support
  useEffect(() => {
    const checkSupport = async () => {
      if (!navigator.xr) {
        setIsARSupported(false);
        setStatus('WebXR not available');
        return;
      }

      try {
        const supported = await navigator.xr.isSessionSupported('immersive-ar');
        setIsARSupported(supported);
        setStatus(supported ? 'AR Ready' : 'AR not supported on this device');
      } catch (err) {
        setIsARSupported(false);
        setStatus('Failed to check AR support');
        console.error('WebXR check failed:', err);
      }
    };

    checkSupport();
  }, []);

  // Place marker at current hit position (kept for potential manual placement button)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const placeMarker = useCallback(() => {
    if (hitPosition) {
      const newMarker: PlacedMarker = {
        id: `marker_${Date.now()}`,
        position: { ...hitPosition },
      };
      setPlacedMarkers(prev => [...prev, newMarker]);
      setStatus(`Placed marker #${placedMarkers.length + 1}`);
    }
  }, [hitPosition, placedMarkers.length]);

  // Clear all markers
  const clearMarkers = useCallback(() => {
    setPlacedMarkers([]);
    markersRef.current = [];
    setSelectedMarkerId(null);
    selectedMarkerIdRef.current = null;
    setStatus('Markers cleared');
  }, []);

  // Delete selected marker
  const deleteSelectedMarker = useCallback(() => {
    if (selectedMarkerId) {
      setPlacedMarkers(prev => {
        const updated = prev.filter(m => m.id !== selectedMarkerId);
        markersRef.current = updated;
        return updated;
      });
      setSelectedMarkerId(null);
      selectedMarkerIdRef.current = null;
      setStatus('Marker deleted');
    }
  }, [selectedMarkerId]);

  // Start AR session
  const startAR = useCallback(async () => {
    if (!navigator.xr || !canvasRef.current) {
      onError?.('WebXR not available');
      return;
    }

    try {
      setStatus('Starting AR...');
      
      // Get WebGL context
      const canvas = canvasRef.current;
      const gl = canvas.getContext('webgl', { xrCompatible: true });
      if (!gl) {
        throw new Error('WebGL not available');
      }
      glRef.current = gl;

      // Request AR session with hit-test
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['local-floor', 'hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.getElementById('ar-overlay') || document.body },
      });

      sessionRef.current = session;
      setIsARActive(true);
      setStatus('AR Active - Point at a surface');
      onARStart?.();

      // Set up XR rendering
      await gl.makeXRCompatible();
      const xrLayer = new XRWebGLLayer(session, gl);
      await session.updateRenderState({ baseLayer: xrLayer });

      // Get reference spaces
      const referenceSpace = await session.requestReferenceSpace('local-floor');
      referenceSpaceRef.current = referenceSpace;
      
      // Set up hit testing
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const hitTestSource = await session.requestHitTestSource?.({ space: viewerSpace });
      hitTestSourceRef.current = hitTestSource || null;

      // Simple shader for rendering markers
      const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vertexShader, `
        attribute vec3 position;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform mat4 modelMatrix;
        void main() {
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_PointSize = 20.0;
        }
      `);
      gl.compileShader(vertexShader);

      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fragmentShader, `
        precision mediump float;
        uniform vec3 color;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          gl_FragColor = vec4(color, 1.0);
        }
      `);
      gl.compileShader(fragmentShader);

      const program = gl.createProgram()!;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);

      const positionLoc = gl.getAttribLocation(program, 'position');
      const projMatLoc = gl.getUniformLocation(program, 'projectionMatrix');
      const viewMatLoc = gl.getUniformLocation(program, 'viewMatrix');
      const modelMatLoc = gl.getUniformLocation(program, 'modelMatrix');
      const colorLoc = gl.getUniformLocation(program, 'color');

      const pointBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW);

      // Animation loop
      const onXRFrame = (_time: number, frame: XRFrame) => {
        const sess = sessionRef.current;
        if (!sess) return;

        sess.requestAnimationFrame(onXRFrame);

        const refSpace = referenceSpaceRef.current;
        if (!refSpace) return;

        const pose = frame.getViewerPose(refSpace);
        if (!pose || !glRef.current) return;

        const glLayer = sess.renderState.baseLayer;
        if (!glLayer) return;

        const glContext = glRef.current;
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, glLayer.framebuffer);
        glContext.clearColor(0, 0, 0, 0);
        glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT);
        glContext.enable(glContext.DEPTH_TEST);

        // Process hit test results
        if (hitTestSourceRef.current) {
          const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const hitPose = hit.getPose(refSpace);
            if (hitPose) {
              const newHitPos = {
                x: hitPose.transform.position.x,
                y: hitPose.transform.position.y,
                z: hitPose.transform.position.z,
              };
              hitPositionRef.current = newHitPos;
              setHitPosition(newHitPos);
            }
          }
        }

        // Render for each view (usually one for AR)
        for (const view of pose.views) {
          const viewport = glLayer.getViewport(view);
          if (viewport) {
            glContext.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
          }

          glContext.useProgram(program);
          glContext.uniformMatrix4fv(projMatLoc, false, view.projectionMatrix);
          glContext.uniformMatrix4fv(viewMatLoc, false, view.transform.inverse.matrix);

          // Render hit position reticle (green)
          if (hitPosition) {
            const modelMatrix = new Float32Array([
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              hitPosition.x, hitPosition.y, hitPosition.z, 1
            ]);
            glContext.uniformMatrix4fv(modelMatLoc, false, modelMatrix);
            glContext.uniform3f(colorLoc, 0, 1, 0.5); // Green
            glContext.bindBuffer(glContext.ARRAY_BUFFER, pointBuffer);
            glContext.enableVertexAttribArray(positionLoc);
            glContext.vertexAttribPointer(positionLoc, 3, glContext.FLOAT, false, 0, 0);
            glContext.drawArrays(glContext.POINTS, 0, 1);
          }

          // Render placed markers (blue = unselected, yellow = selected)
          const currentMarkers = markersRef.current;
          const currentSelectedId = selectedMarkerIdRef.current;
          for (const marker of currentMarkers) {
            const modelMatrix = new Float32Array([
              1, 0, 0, 0,
              0, 1, 0, 0,
              0, 0, 1, 0,
              marker.position.x, marker.position.y, marker.position.z, 1
            ]);
            glContext.uniformMatrix4fv(modelMatLoc, false, modelMatrix);
            
            // Yellow if selected, blue otherwise
            if (marker.id === currentSelectedId) {
              glContext.uniform3f(colorLoc, 1, 0.8, 0); // Yellow/Gold
            } else {
              glContext.uniform3f(colorLoc, 0.3, 0.5, 1); // Blue
            }
            
            glContext.bindBuffer(glContext.ARRAY_BUFFER, pointBuffer);
            glContext.enableVertexAttribArray(positionLoc);
            glContext.vertexAttribPointer(positionLoc, 3, glContext.FLOAT, false, 0, 0);
            glContext.drawArrays(glContext.POINTS, 0, 1);
          }
        }
      };

      session.requestAnimationFrame(onXRFrame);

      // Handle tap/select to place or select markers
      session.addEventListener('select', () => {
        const currentHit = hitPositionRef.current;
        if (!currentHit) {
          setStatus('No surface detected - point at floor/table');
          return;
        }

        // Check if tapping near an existing marker
        const markers = markersRef.current;
        let closestMarker: PlacedMarker | null = null;
        let closestDistance = SELECT_THRESHOLD;

        for (const marker of markers) {
          const dx = marker.position.x - currentHit.x;
          const dy = marker.position.y - currentHit.y;
          const dz = marker.position.z - currentHit.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestMarker = marker;
          }
        }

        if (closestMarker) {
          // Select existing marker
          selectedMarkerIdRef.current = closestMarker.id;
          setSelectedMarkerId(closestMarker.id);
          const itemName = closestMarker.furniture?.name || 'marker';
          setStatus(`Selected ${itemName} - tap elsewhere to deselect`);
        } else {
          // Place new marker/furniture
          const furniture = selectedFurnitureRef.current;
          const newMarker: PlacedMarker = {
            id: `marker_${Date.now()}`,
            position: { ...currentHit },
            furniture: furniture || undefined,
          };
          setPlacedMarkers(prev => {
            const updated = [...prev, newMarker];
            markersRef.current = updated; // Keep ref in sync
            const itemName = furniture?.name || 'marker';
            setStatus(`Placed ${itemName} #${updated.length}`);
            return updated;
          });
          // Notify parent if furniture was placed
          if (furniture && onFurniturePlacedRef.current) {
            onFurniturePlacedRef.current(furniture.name);
          }
          selectedMarkerIdRef.current = null;
          setSelectedMarkerId(null);
        }
      });

      // Handle session end
      session.addEventListener('end', () => {
        setIsARActive(false);
        setStatus('AR ended');
        sessionRef.current = null;
        hitTestSourceRef.current = null;
        referenceSpaceRef.current = null;
        onAREnd?.();
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start AR';
      setStatus(`Error: ${message}`);
      onError?.(message);
      console.error('AR start failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onARStart, onAREnd, onError]);

  // Stop AR session
  const stopAR = useCallback(async () => {
    if (sessionRef.current) {
      await sessionRef.current.end();
      sessionRef.current = null;
    }
    setIsARActive(false);
    setHitPosition(null);
    hitPositionRef.current = null;
    setStatus('AR Ready');
  }, []);

  return (
    <div className={cn('relative w-full h-full bg-linear-to-b from-gray-900 to-gray-950', className)}>
      {/* WebGL Canvas (hidden during non-AR) */}
      <canvas
        ref={canvasRef}
        className={cn(
          'absolute inset-0 w-full h-full',
          isARActive ? 'block' : 'hidden'
        )}
      />

      {/* AR Overlay - ALL AR UI must be inside this div to be visible during AR session */}
      <div 
        id="ar-overlay" 
        className="absolute inset-0 touch-none"
      >
        {isARActive && (
          <>
            {/* Top status bar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 text-white rounded-full text-sm z-[9999]">
              {selectedFurniture 
                ? `${selectedFurniture.emoji} ${selectedFurniture.name} - Tap to place`
                : selectedMarkerId 
                  ? '✨ Item selected'
                  : hitPosition 
                    ? '🎯 Tap screen to place' 
                    : '🔍 Looking for surfaces...'}
            </div>

            {/* Bottom controls - using inline styles for WebXR compatibility */}
            <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-[9999]">
              {/* Selected marker actions */}
              {selectedMarkerId && (
                <div className="flex gap-2 mb-2">
                  <button
                    title="Delete selected item"
                    onPointerDown={(e) => { e.stopPropagation(); deleteSelectedMarker(); }}
                    className="px-5 py-3 bg-orange-500 text-white font-bold rounded-full shadow-lg touch-manipulation"
                  >
                    🗑️ Delete
                  </button>
                  <button
                    title="Deselect item"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedMarkerId(null);
                      selectedMarkerIdRef.current = null;
                    }}
                    className="px-4 py-3 bg-gray-600 text-white font-bold rounded-full shadow-lg touch-manipulation"
                  >
                    ✕
                  </button>
                </div>
              )}
              
              {/* Main action buttons */}
              <div className="flex gap-2">
                {placedMarkers.length > 0 && (
                  <button
                    title="Delete all markers"
                    onPointerDown={(e) => { e.stopPropagation(); clearMarkers(); }}
                    className="px-4 py-3 bg-yellow-500 text-white font-bold rounded-full shadow-lg touch-manipulation"
                  >
                    🗑️ {placedMarkers.length}
                  </button>
                )}
                
                <button
                  title="Exit AR"
                  onPointerDown={(e) => { e.stopPropagation(); stopAR(); }}
                  className="px-6 py-3 bg-red-500 text-white font-bold rounded-full shadow-lg touch-manipulation"
                >
                  ✕ Exit AR
                </button>
              </div>
              
              {/* Marker count */}
              {placedMarkers.length > 0 && (
                <div className="text-white text-xs bg-black/70 px-3 py-1 rounded-full">
                  {placedMarkers.length} marker{placedMarkers.length !== 1 ? 's' : ''} placed
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Main UI (when not in AR) */}
      {!isARActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
          {/* Status indicator */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">
              {isARSupported === null ? '🔄' : isARSupported ? '📱' : '⚠️'}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              {isARSupported === null ? 'Checking...' : isARSupported ? 'AR Ready' : 'AR Preview Mode'}
            </h2>
            <p className="text-gray-400 text-sm">{status}</p>
          </div>

          {/* AR Button */}
          {isARSupported && (
            <button
              onClick={startAR}
              className="px-8 py-4 bg-linear-to-r from-purple-600 to-blue-600 text-white text-lg font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              🥽 Start AR Experience
            </button>
          )}

          {/* Non-AR info */}
          {isARSupported === false && (
            <div className="text-center text-gray-500 text-sm max-w-xs">
              <p className="mb-4">
                WebXR AR requires a compatible device and browser.
              </p>
              <p>
                Try opening on an Android device with Chrome, or iOS with Safari.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default SimpleARCanvas;

