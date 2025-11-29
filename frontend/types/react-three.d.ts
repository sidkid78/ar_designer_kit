// types/react-three.d.ts
// Type declarations for @react-three/fiber, @react-three/drei, @react-three/xr

declare module '@react-three/fiber' {
  import * as THREE from 'three';
  import * as React from 'react';

  export interface CanvasProps {
    children?: React.ReactNode;
    camera?: Partial<THREE.PerspectiveCamera> | { position?: [number, number, number]; fov?: number };
    shadows?: boolean;
    style?: React.CSSProperties;
    className?: string;
    gl?: Partial<THREE.WebGLRendererParameters>;
    frameloop?: 'always' | 'demand' | 'never';
    resize?: { scroll?: boolean; debounce?: { scroll?: number; resize?: number } };
    orthographic?: boolean;
    dpr?: number | [number, number];
    linear?: boolean;
    flat?: boolean;
    legacy?: boolean;
    events?: (store: RootState) => EventManager<HTMLElement>;
    eventSource?: HTMLElement | React.MutableRefObject<HTMLElement>;
    eventPrefix?: 'offset' | 'client' | 'page' | 'layer' | 'screen';
    onCreated?: (state: RootState) => void;
    onPointerMissed?: (event: MouseEvent) => void;
  }

  export interface RootState {
    gl: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    clock: THREE.Clock;
    size: { width: number; height: number };
    viewport: { width: number; height: number; factor: number; distance: number };
    events: EventManager<HTMLElement>;
  }

  export interface EventManager<T> {
    connected: T | null;
    handlers: Record<string, (event: any) => void>;
    connect: (target: T) => void;
    disconnect: () => void;
  }

  export function Canvas(props: CanvasProps): JSX.Element;
  export function useThree(): RootState;
  export function useFrame(callback: (state: RootState, delta: number) => void, renderPriority?: number): void;
  export function useLoader<T>(loader: new () => THREE.Loader, url: string): T;
}

declare module '@react-three/drei' {
  import * as THREE from 'three';
  import * as React from 'react';

  export function OrbitControls(props?: {
    makeDefault?: boolean;
    target?: [number, number, number];
    maxPolarAngle?: number;
    minPolarAngle?: number;
    enableZoom?: boolean;
    enablePan?: boolean;
    enableRotate?: boolean;
  }): JSX.Element;

  export function Grid(props?: {
    args?: [number, number];
    cellSize?: number;
    cellThickness?: number;
    cellColor?: string;
    sectionSize?: number;
    sectionThickness?: number;
    sectionColor?: string;
    fadeDistance?: number;
    fadeStrength?: number;
    followCamera?: boolean;
    position?: [number, number, number];
  }): JSX.Element;

  export function Environment(props?: {
    preset?: 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'studio' | 'city' | 'park' | 'lobby';
    background?: boolean;
  }): JSX.Element;

  export function useGLTF(url: string): { scene: THREE.Group; nodes: Record<string, THREE.Object3D>; materials: Record<string, THREE.Material> };

  export function Html(props?: {
    children?: React.ReactNode;
    position?: [number, number, number];
    center?: boolean;
    distanceFactor?: number;
  }): JSX.Element;
}

declare module '@react-three/xr' {
  import * as React from 'react';
  import * as THREE from 'three';

  interface XRStoreOptions {
    depthSensing?: boolean;
    hitTest?: boolean;
    domOverlay?: boolean;
    controller?: boolean;
  }

  interface XRStore {
    enterAR(): Promise<void>;
    enterVR(): Promise<void>;
    exit(): void;
  }

  export function createXRStore(options?: XRStoreOptions): XRStore;

  export function XR(props?: { children?: React.ReactNode; store?: XRStore }): JSX.Element;

  export function ARButton(props?: {
    className?: string;
    sessionInit?: {
      requiredFeatures?: string[];
      optionalFeatures?: string[];
    };
  }): JSX.Element;

  export function useXR(): {
    isPresenting: boolean;
    session: XRSession | null;
  };

  export function useHitTest(callback: (hitMatrix: THREE.Matrix4) => void): void;
}

// Extend JSX.IntrinsicElements for React Three Fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Lights
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      spotLight: any;
      hemisphereLight: any;

      // Objects
      mesh: any;
      group: any;
      primitive: any;
      line: any;
      lineSegments: any;
      points: any;

      // Geometries
      boxGeometry: any;
      planeGeometry: any;
      sphereGeometry: any;
      cylinderGeometry: any;
      coneGeometry: any;
      torusGeometry: any;
      ringGeometry: any;
      circleGeometry: any;
      bufferGeometry: any;

      // Materials
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      meshPhongMaterial: any;
      meshLambertMaterial: any;
      meshPhysicalMaterial: any;
      lineBasicMaterial: any;
      lineDashedMaterial: any;
      pointsMaterial: any;
      shaderMaterial: any;

      // Helpers
      gridHelper: any;
      axesHelper: any;
      boxHelper: any;

      // Other
      fog: any;
      color: any;
    }
  }
}

export {};

