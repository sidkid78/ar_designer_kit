// types/webxr.d.ts
// WebXR Type Definitions

interface XRSystem {
  isSessionSupported(mode: XRSessionMode): Promise<boolean>;
  requestSession(mode: XRSessionMode, options?: XRSessionInit): Promise<XRSession>;
}

type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: { root: Element };
}

interface XRSession extends EventTarget {
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  requestHitTestSource?(options: XRHitTestSourceInit): Promise<XRHitTestSource>;
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  end(): Promise<void>;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';

interface XRReferenceSpace extends EventTarget {
  getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace;
}

interface XRHitTestSourceInit {
  space: XRSpace;
  offsetRay?: XRRay;
}

interface XRHitTestSource {
  cancel(): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface XRSpace extends EventTarget {}

interface XRRay {
  origin: DOMPointReadOnly;
  direction: DOMPointReadOnly;
  matrix: Float32Array;
}

interface XRRigidTransform {
  position: DOMPointReadOnly;
  orientation: DOMPointReadOnly;
  matrix: Float32Array;
  inverse: XRRigidTransform;
}

interface XRFrame {
  session: XRSession;
  getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | null;
  getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[];
}

interface XRViewerPose {
  transform: XRRigidTransform;
  views: XRView[];
}

interface XRView {
  eye: XREye;
  projectionMatrix: Float32Array;
  transform: XRRigidTransform;
}

type XREye = 'none' | 'left' | 'right';

interface XRHitTestResult {
  getPose(baseSpace: XRSpace): XRPose | null;
  results?: Array<{ inputSource?: { targetRaySpace: XRSpace } }>;
}

interface XRPose {
  transform: XRRigidTransform;
  emulatedPosition: boolean;
}

type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void;

// Extend Navigator interface
interface Navigator {
  xr?: XRSystem;
}

// Extend Window interface
interface Window {
  XRSession?: typeof XRSession;
}

