/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-enable @typescript-eslint/ban-ts-comment */
/**
 * TypeScript checking disabled: React Three Fiber's JSX types use global JSX.IntrinsicElements
 * which conflicts with React 19's new JSX namespace. This is a known compatibility issue.
 * Runtime works correctly. See: https://github.com/pmndrs/react-three-fiber/issues/3117
 * 
 * Best practice from R3F docs (Context7):
 * - Use extend() to register THREE elements for tree-shaking
 * - Use lowercase JSX elements: <mesh>, <boxGeometry>, etc.
 * - Module augmentation doesn't work until R3F officially supports React 19
 */
'use client';

/**
 * WebXRCanvas.tsx
 * AR Canvas using WebXR for cross-platform AR support
 * Updated to use @react-three/xr v6+ patterns with createXRStore
 */

import React, { Suspense, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, extend } from '@react-three/fiber';
import { XR, createXRStore, useXRHitTest, useXR } from '@react-three/xr';
import { OrbitControls, Grid, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Register THREE elements for JSX use (R3F best practice for tree-shaking)
extend({
  Mesh: THREE.Mesh,
  Group: THREE.Group,
  BoxGeometry: THREE.BoxGeometry,
  PlaneGeometry: THREE.PlaneGeometry,
  RingGeometry: THREE.RingGeometry,
  MeshBasicMaterial: THREE.MeshBasicMaterial,
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  AmbientLight: THREE.AmbientLight,
  DirectionalLight: THREE.DirectionalLight,
  PointLight: THREE.PointLight,
  GridHelper: THREE.GridHelper,
});
import { cn } from '@/lib/utils';
import { checkWebXRSupport } from '@/lib/webxr';

// ============================================================================
// Types
// ============================================================================

interface PlacedObject {
  id: string;
  modelUrl: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

interface WebXRCanvasProps {
  className?: string;
  onObjectPlaced?: (object: PlacedObject) => void;
  onObjectSelected?: (id: string | null) => void;
  selectedModelUrl?: string | null;
  placementMode?: boolean;
}

// Create XR store outside component (singleton pattern)
const xrStore = createXRStore({
  depthSensing: true,
  hitTest: true,
});

// ============================================================================
// Hit Test Reticle - Shows where objects will be placed
// ============================================================================

interface HitTestReticleProps {
  onHitTest?: (position: [number, number, number]) => void;
  visible: boolean;
}

function HitTestReticle({ onHitTest, visible }: HitTestReticleProps) {
  const reticleRef = useRef<THREE.Object3D>(null);
  
  useXRHitTest((hitMatrix: THREE.Matrix4) => {
    if (reticleRef.current) {
      hitMatrix.decompose(
        reticleRef.current.position,
        reticleRef.current.quaternion,
        reticleRef.current.scale
      );
      // Notify parent of hit position
      onHitTest?.([
        reticleRef.current.position.x,
        reticleRef.current.position.y,
        reticleRef.current.position.z,
      ]);
    }
  });

  if (!visible) return null;

  return (
    <mesh ref={reticleRef} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.08, 0.1, 32]} />
      <meshBasicMaterial color="#00ff88" opacity={0.9} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

// ============================================================================
// Placeable 3D Model Component
// ============================================================================

interface PlaceableModelProps {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  selected?: boolean;
  onClick?: () => void;
}

function PlaceableModel({ url, position, rotation, scale, selected, onClick }: PlaceableModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);
  
  // Clone the scene for each instance
  const clonedScene = React.useMemo(() => scene.clone(), [scene]);

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation}
      scale={[scale, scale, scale]}
      onClick={(e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onClick?.();
      }}
      // Deny grab to allow click through in XR
      pointerEventsType={{ deny: 'grab' }}
    >
      <primitive object={clonedScene} />
      {selected && (
        <mesh>
          <boxGeometry args={[1.1, 1.1, 1.1]} />
          <meshBasicMaterial color="#00aaff" wireframe transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// AR Scene Content
// ============================================================================

interface ARSceneProps {
  placedObjects: PlacedObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onPlaceObject: (position: [number, number, number]) => void;
  placementMode: boolean;
  selectedModelUrl: string | null;
}

function ARScene({ 
  placedObjects, 
  selectedObjectId, 
  onSelectObject, 
  onPlaceObject,
  placementMode,
  selectedModelUrl 
}: ARSceneProps) {
  const { isPresenting } = useXR();
  const [hitPosition, setHitPosition] = useState<[number, number, number]>([0, 0, -2]);

  // Handle tap to place in AR
  const handleReticleClick = useCallback(() => {
    if (placementMode && selectedModelUrl && isPresenting) {
      onPlaceObject(hitPosition);
    }
  }, [placementMode, selectedModelUrl, hitPosition, onPlaceObject, isPresenting]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} castShadow />

      {/* Hit test reticle for AR placement */}
      {placementMode && isPresenting && (
        <group onClick={handleReticleClick}>
          <HitTestReticle 
            visible={true} 
            onHitTest={setHitPosition}
          />
        </group>
      )}

      {/* Placed Objects */}
      {placedObjects.map((obj) => (
        <Suspense key={obj.id} fallback={
          <mesh position={obj.position}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color="#888" />
          </mesh>
        }>
          <PlaceableModel
            url={obj.modelUrl}
            position={obj.position}
            rotation={obj.rotation}
            scale={obj.scale}
            selected={obj.id === selectedObjectId}
            onClick={() => onSelectObject(obj.id)}
          />
        </Suspense>
      ))}

      {/* Floor grid (non-AR mode only) */}
      {!isPresenting && (
        <>
          <Grid 
            args={[10, 10]} 
            cellSize={0.5} 
            cellThickness={0.5}
            cellColor="#6e6e6e"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#9d4b4b"
            fadeDistance={20}
            fadeStrength={1}
            followCamera={false}
            position={[0, 0, 0]}
          />
          <OrbitControls makeDefault />
          <Environment preset="apartment" />
        </>
      )}
    </>
  );
}

// ============================================================================
// Fallback 3D View (when WebXR not available)
// ============================================================================

interface Fallback3DViewProps {
  placedObjects: PlacedObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onPlaceObject: (position: [number, number, number]) => void;
}

function Fallback3DView({ placedObjects, selectedObjectId, onSelectObject, onPlaceObject }: Fallback3DViewProps) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} />
      
      {/* Room floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>

      {/* Grid helper */}
      <gridHelper args={[20, 20, '#888', '#ccc']} />

      {/* Placed objects */}
      {placedObjects.map((obj) => (
        <Suspense key={obj.id} fallback={
          <mesh position={obj.position}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#666" />
          </mesh>
        }>
          <PlaceableModel
            url={obj.modelUrl}
            position={obj.position}
            rotation={obj.rotation}
            scale={obj.scale}
            selected={obj.id === selectedObjectId}
            onClick={() => onSelectObject(obj.id)}
          />
        </Suspense>
      ))}

      {/* Click to place on floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onClick={(e: { stopPropagation: () => void; point: { x: number; y: number; z: number } }) => {
          e.stopPropagation();
          const point = e.point;
          onPlaceObject([point.x, 0, point.z]);
        }}
        visible={false}
      >
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <OrbitControls 
        makeDefault 
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2.1}
      />
      <Environment preset="apartment" />
    </>
  );
}

// ============================================================================
// Main WebXR Canvas Component
// ============================================================================

export function WebXRCanvas({ 
  className, 
  onObjectPlaced, 
  onObjectSelected,
  selectedModelUrl = null,
  placementMode = false,
}: WebXRCanvasProps) {
  const [placedObjects, setPlacedObjects] = useState<PlacedObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [webxrSupported, setWebxrSupported] = useState<boolean | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const checkedRef = useRef(false);

  // Check WebXR support on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    
    let mounted = true;
    checkWebXRSupport().then((support) => {
      if (mounted) {
        setWebxrSupported(support.hasAR);
      }
    });
    
    return () => { mounted = false; };
  }, []);

  // Handle object placement
  const handlePlaceObject = useCallback((position: [number, number, number]) => {
    if (!selectedModelUrl) return;

    const newObject: PlacedObject = {
      id: `obj_${Date.now()}`,
      modelUrl: selectedModelUrl,
      position,
      rotation: [0, 0, 0],
      scale: 1,
    };

    setPlacedObjects((prev) => [...prev, newObject]);
    onObjectPlaced?.(newObject);
  }, [selectedModelUrl, onObjectPlaced]);

  // Handle object selection
  const handleSelectObject = useCallback((id: string | null) => {
    setSelectedObjectId(id);
    onObjectSelected?.(id);
  }, [onObjectSelected]);

  return (
    <div ref={containerRef} className={cn('relative w-full h-full', className)}>
      {/* AR Entry Button - New v6+ pattern */}
      {webxrSupported && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
          <button 
            onClick={() => xrStore.enterAR()}
            className="px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105"
          >
            🥽 Enter AR
          </button>
        </div>
      )}

      {/* WebXR Support Status */}
      {webxrSupported === false && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-yellow-500/90 text-black rounded-lg text-sm font-medium">
          📱 WebXR AR not available - using 3D preview mode
        </div>
      )}

      {/* Three.js Canvas with XR */}
      <Canvas
        shadows
        camera={{ position: [0, 2, 5], fov: 50 }}
        style={{ background: 'linear-gradient(to bottom, #1a1a2e, #16213e)' }}
      >
        <XR store={xrStore}>
          {webxrSupported ? (
            <ARScene
              placedObjects={placedObjects}
              selectedObjectId={selectedObjectId}
              onSelectObject={handleSelectObject}
              onPlaceObject={handlePlaceObject}
              placementMode={placementMode}
              selectedModelUrl={selectedModelUrl}
            />
          ) : (
            <Fallback3DView
              placedObjects={placedObjects}
              selectedObjectId={selectedObjectId}
              onSelectObject={handleSelectObject}
              onPlaceObject={handlePlaceObject}
            />
          )}
        </XR>
      </Canvas>

      {/* Instructions overlay */}
      {placementMode && selectedModelUrl && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-black/70 text-white rounded-lg text-sm backdrop-blur-sm">
          {webxrSupported 
            ? '👆 Tap the green reticle to place object' 
            : '🖱️ Click on the floor to place object'
          }
        </div>
      )}

      {/* Object count */}
      <div className="absolute bottom-4 left-4 z-40 px-3 py-1.5 bg-black/50 text-white rounded-lg text-sm backdrop-blur-sm">
        📦 {placedObjects.length} object{placedObjects.length !== 1 ? 's' : ''} placed
      </div>
    </div>
  );
}

export default WebXRCanvas;
