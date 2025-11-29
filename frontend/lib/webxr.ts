// lib/webxr.ts
// WebXR Support Detection and Utilities

export interface WebXRSupport {
  isSupported: boolean;
  hasAR: boolean;
  hasVR: boolean;
  hasHitTest: boolean;
  hasDomOverlay: boolean;
  hasLightEstimation: boolean;
}

/**
 * Check WebXR support in the browser
 */
export async function checkWebXRSupport(): Promise<WebXRSupport> {
  const result: WebXRSupport = {
    isSupported: false,
    hasAR: false,
    hasVR: false,
    hasHitTest: false,
    hasDomOverlay: false,
    hasLightEstimation: false,
  };

  // Check if WebXR is available
  if (!navigator.xr) {
    return result;
  }

  result.isSupported = true;

  try {
    // Check AR support
    result.hasAR = await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    result.hasAR = false;
  }

  try {
    // Check VR support
    result.hasVR = await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    result.hasVR = false;
  }

  // Feature detection for optional features
  // These are checked when session is created, but we can estimate support
  if (result.hasAR) {
    result.hasHitTest = true; // Most AR-capable browsers support hit-test
    result.hasDomOverlay = true; // Most support dom-overlay
    result.hasLightEstimation = true; // Many support light-estimation
  }

  return result;
}

/**
 * Required features for our AR session
 */
export const AR_SESSION_OPTIONS = {
  requiredFeatures: ['hit-test', 'local-floor'],
  optionalFeatures: ['dom-overlay', 'light-estimation'],
};

/**
 * Convert XR hit test result to world position
 */
export function hitResultToPosition(hitResult: XRHitTestResult): { x: number; y: number; z: number } | null {
  const pose = hitResult.getPose(hitResult.results?.[0]?.inputSource?.targetRaySpace as XRSpace);
  if (!pose) return null;
  
  return {
    x: pose.transform.position.x,
    y: pose.transform.position.y,
    z: pose.transform.position.z,
  };
}

