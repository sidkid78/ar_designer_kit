// hooks/useRoomScanner.ts
// React hook for photo-based room scanning with Gemini Vision
// Works on Android via Chrome - no native AR required

'use client';

import { useState, useCallback, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirestore, doc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { useAuth } from './useAuth';

// ============================================================================
// Types
// ============================================================================

export interface CapturedPhoto {
  id: string;
  dataUrl: string;
  blob: Blob;
  timestamp: number;
  type: 'front' | 'left' | 'right' | 'back' | 'ceiling' | 'floor' | 'corner' | 'detail';
  label: string;
}

export interface RecognizedObject {
  label: string;
  confidence: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  category: 'architectural' | 'furniture' | 'fixture' | 'other';
}

export interface RoomDimensions {
  width: number;
  length: number;
  height: number;
  unit: 'meters' | 'feet';
}

export interface FloorPlanData {
  walls: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>;
  doors: Array<{ position: { x: number; y: number }; width: number; angle: number }>;
  windows: Array<{ position: { x: number; y: number }; width: number; height: number }>;
  dimensions: { width: number; length: number };
}

export interface RoomScanResult {
  scanId: string;
  roomType: string;
  dimensions: RoomDimensions;
  recognizedObjects: RecognizedObject[];
  floorPlan: FloorPlanData | null;
  styleRecommendations: string[];
  lightingSuggestions: string[];
  detectedFeatures: string[];
  photos: string[]; // Storage URLs
  processedAt: Date;
}

export interface ScanProgress {
  stage: 'idle' | 'capturing' | 'uploading' | 'analyzing' | 'generating' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  substage?: string;
}

export interface UseRoomScannerReturn {
  // State
  photos: CapturedPhoto[];
  scanResult: RoomScanResult | null;
  progress: ScanProgress;
  isScanning: boolean;
  
  // Camera
  isCameraActive: boolean;
  cameraError: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  
  // Actions
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capturePhoto: (type: CapturedPhoto['type']) => Promise<CapturedPhoto | null>;
  removePhoto: (id: string) => void;
  clearPhotos: () => void;
  
  // Scanning
  startScan: (projectId: string, roomName?: string) => Promise<RoomScanResult | null>;
  cancelScan: () => void;
  
  // Guidance
  getPhotoGuidance: () => PhotoGuidance;
  getRequiredPhotos: () => PhotoRequirement[];
}

export interface PhotoGuidance {
  nextPhoto: CapturedPhoto['type'];
  instruction: string;
  tip: string;
  icon: string;
}

export interface PhotoRequirement {
  type: CapturedPhoto['type'];
  label: string;
  required: boolean;
  captured: boolean;
  icon: string;
}

// ============================================================================
// Photo Requirements
// ============================================================================

const PHOTO_TYPES: Array<{
  type: CapturedPhoto['type'];
  label: string;
  required: boolean;
  instruction: string;
  tip: string;
  icon: string;
}> = [
  {
    type: 'front',
    label: 'Front Wall',
    required: true,
    instruction: 'Stand at the entrance and photograph the main wall',
    tip: 'Include the full wall from floor to ceiling',
    icon: '🏠',
  },
  {
    type: 'left',
    label: 'Left Wall',
    required: true,
    instruction: 'Turn left and photograph that wall',
    tip: 'Capture any windows, doors, or outlets',
    icon: '⬅️',
  },
  {
    type: 'right',
    label: 'Right Wall',
    required: true,
    instruction: 'Turn right and photograph that wall',
    tip: 'Include furniture against the wall',
    icon: '➡️',
  },
  {
    type: 'back',
    label: 'Back Wall / Entrance',
    required: true,
    instruction: 'Turn around and photograph behind you',
    tip: 'This helps AI understand room depth',
    icon: '🚪',
  },
  {
    type: 'corner',
    label: 'Corner View',
    required: false,
    instruction: 'Photograph from a corner to show room depth',
    tip: 'This helps estimate room dimensions',
    icon: '📐',
  },
  {
    type: 'floor',
    label: 'Floor Detail',
    required: false,
    instruction: 'Photograph the floor material',
    tip: 'Helps identify flooring type for design',
    icon: '🟫',
  },
  {
    type: 'ceiling',
    label: 'Ceiling',
    required: false,
    instruction: 'Photograph the ceiling',
    tip: 'Capture light fixtures and ceiling height',
    icon: '💡',
  },
  {
    type: 'detail',
    label: 'Special Features',
    required: false,
    instruction: 'Photograph any special features',
    tip: 'Fireplaces, built-ins, architectural details',
    icon: '✨',
  },
];

// ============================================================================
// Hook Implementation
// ============================================================================

export function useRoomScanner(): UseRoomScannerReturn {
  // State
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [scanResult, setScanResult] = useState<RoomScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress>({
    stage: 'idle',
    progress: 0,
    message: 'Ready to scan',
  });
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Auth
  const { user } = useAuth();

  // ============================================================================
  // Camera Functions
  // ============================================================================

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      // Request camera with environment-facing preference (back camera on mobile)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      const message = err instanceof Error ? err.message : 'Failed to access camera';
      setCameraError(message);
      setIsCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  const capturePhoto = useCallback(async (type: CapturedPhoto['type']): Promise<CapturedPhoto | null> => {
    if (!videoRef.current || !isCameraActive) {
      console.error('Camera not active');
      return null;
    }

    try {
      const video = videoRef.current;
      
      // Create canvas if not exists
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      
      // Set canvas size to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        return null;
      }
      ctx.drawImage(video, 0, 0);
      
      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
          'image/jpeg',
          0.85
        );
      });
      
      // Create data URL for preview
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      // Get label for type
      const typeInfo = PHOTO_TYPES.find(t => t.type === type);
      
      const photo: CapturedPhoto = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        dataUrl,
        blob,
        timestamp: Date.now(),
        type,
        label: typeInfo?.label || type,
      };

      setPhotos(prev => [...prev, photo]);
      
      return photo;
    } catch (err) {
      console.error('Capture error:', err);
      return null;
    }
  }, [isCameraActive]);

  const removePhoto = useCallback((id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  const clearPhotos = useCallback(() => {
    setPhotos([]);
    setScanResult(null);
    setProgress({ stage: 'idle', progress: 0, message: 'Ready to scan' });
  }, []);

  // ============================================================================
  // Scanning Functions
  // ============================================================================

  const startScan = useCallback(async (projectId: string, roomName?: string): Promise<RoomScanResult | null> => {
    if (!user) {
      setProgress({ stage: 'error', progress: 0, message: 'Not authenticated' });
      return null;
    }

    if (photos.length < 4) {
      setProgress({ stage: 'error', progress: 0, message: 'Need at least 4 photos (all walls)' });
      return null;
    }

    cancelRef.current = false;
    const scanId = `scan_${Date.now()}`;
    
    try {
      // Stage 1: Uploading photos
      setProgress({ stage: 'uploading', progress: 5, message: 'Uploading photos...', substage: '0/' + photos.length });
      
      const storage = getStorage();
      const uploadedUrls: string[] = [];
      
      for (let i = 0; i < photos.length; i++) {
        if (cancelRef.current) throw new Error('Cancelled');
        
        const photo = photos[i];
        const storagePath = `projects/${projectId}/scans/${scanId}/${photo.type}_${i}.jpg`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, photo.blob, {
          contentType: 'image/jpeg',
          customMetadata: {
            type: photo.type,
            capturedAt: photo.timestamp.toString(),
          },
        });
        
        const downloadUrl = await getDownloadURL(storageRef);
        uploadedUrls.push(downloadUrl);
        
        const uploadProgress = 5 + (i + 1) / photos.length * 25;
        setProgress({
          stage: 'uploading',
          progress: uploadProgress,
          message: 'Uploading photos...',
          substage: `${i + 1}/${photos.length}`,
        });
      }

      if (cancelRef.current) throw new Error('Cancelled');

      // Stage 2: Create scan document in Firestore
      setProgress({ stage: 'analyzing', progress: 35, message: 'Initializing analysis...' });
      
      const db = getFirestore();
      const scanDocRef = doc(db, `projects/${projectId}/scans/${scanId}`);
      
      await setDoc(scanDocRef, {
        projectId,
        userId: user.uid,
        roomName: roomName || 'Untitled Room',
        status: 'processing',
        photoUrls: uploadedUrls,
        photoTypes: photos.map(p => p.type),
        createdAt: Timestamp.now(),
      });

      // Stage 3: Call Cloud Function to analyze
      setProgress({ stage: 'analyzing', progress: 45, message: 'AI analyzing room...' });
      
      const functions = getFunctions();
      const analyzeRoom = httpsCallable<
        { projectId: string; scanId: string; photoUrls: string[] },
        RoomScanResult
      >(functions, 'analyzeRoomPhotos');
      
      // Set up real-time listener for progress updates
      unsubscribeRef.current = onSnapshot(scanDocRef, (snapshot) => {
        const data = snapshot.data();
        if (data?.analysisProgress) {
          const stage = data.analysisProgress.stage;
          const pct = data.analysisProgress.progress;
          
          if (stage === 'detecting') {
            setProgress({ stage: 'analyzing', progress: 45 + pct * 0.2, message: 'Detecting objects...' });
          } else if (stage === 'measuring') {
            setProgress({ stage: 'analyzing', progress: 65 + pct * 0.15, message: 'Estimating dimensions...' });
          } else if (stage === 'floorplan') {
            setProgress({ stage: 'generating', progress: 80 + pct * 0.15, message: 'Generating floor plan...' });
          }
        }
      });

      // Execute analysis
      const result = await analyzeRoom({
        projectId,
        scanId,
        photoUrls: uploadedUrls,
      });

      // Clean up listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (cancelRef.current) throw new Error('Cancelled');

      // Stage 4: Complete
      setProgress({ stage: 'complete', progress: 100, message: 'Scan complete!' });
      setScanResult(result.data);
      
      return result.data;

    } catch (err) {
      // Clean up listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if ((err as Error).message === 'Cancelled') {
        setProgress({ stage: 'idle', progress: 0, message: 'Scan cancelled' });
        return null;
      }
      
      console.error('Scan error:', err);
      setProgress({
        stage: 'error',
        progress: 0,
        message: err instanceof Error ? err.message : 'Scan failed',
      });
      return null;
    }
  }, [user, photos]);

  const cancelScan = useCallback(() => {
    cancelRef.current = true;
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setProgress({ stage: 'idle', progress: 0, message: 'Scan cancelled' });
  }, []);

  // ============================================================================
  // Guidance Functions
  // ============================================================================

  const getPhotoGuidance = useCallback((): PhotoGuidance => {
    const capturedTypes = new Set(photos.map(p => p.type));
    
    // Find next required photo
    for (const photoType of PHOTO_TYPES) {
      if (photoType.required && !capturedTypes.has(photoType.type)) {
        return {
          nextPhoto: photoType.type,
          instruction: photoType.instruction,
          tip: photoType.tip,
          icon: photoType.icon,
        };
      }
    }
    
    // All required done, suggest optional
    for (const photoType of PHOTO_TYPES) {
      if (!capturedTypes.has(photoType.type)) {
        return {
          nextPhoto: photoType.type,
          instruction: photoType.instruction,
          tip: '(Optional) ' + photoType.tip,
          icon: photoType.icon,
        };
      }
    }
    
    // All done
    return {
      nextPhoto: 'detail',
      instruction: 'All photos captured! Ready to scan.',
      tip: 'You can add more detail photos or start the scan',
      icon: '✅',
    };
  }, [photos]);

  const getRequiredPhotos = useCallback((): PhotoRequirement[] => {
    const capturedTypes = new Set(photos.map(p => p.type));
    
    return PHOTO_TYPES.map(pt => ({
      type: pt.type,
      label: pt.label,
      required: pt.required,
      captured: capturedTypes.has(pt.type),
      icon: pt.icon,
    }));
  }, [photos]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // State
    photos,
    scanResult,
    progress,
    isScanning: ['uploading', 'analyzing', 'generating'].includes(progress.stage),
    
    // Camera
    isCameraActive,
    cameraError,
    videoRef,
    
    // Actions
    startCamera,
    stopCamera,
    capturePhoto,
    removePhoto,
    clearPhotos,
    
    // Scanning
    startScan,
    cancelScan,
    
    // Guidance
    getPhotoGuidance,
    getRequiredPhotos,
  };
}

export default useRoomScanner;
