'use client';

/**
 * RoomScanner.tsx
 * Photo-based room scanning component for Android/Web
 * Uses camera to capture multiple angles, then Gemini Vision to analyze
 */

import React, { useEffect, useState } from 'react';
import { useRoomScanner, type CapturedPhoto, type PhotoRequirement } from '@/hooks/useRoomScanner';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface RoomScannerProps {
  projectId: string;
  roomName?: string;
  onScanComplete?: (result: ReturnType<typeof useRoomScanner>['scanResult']) => void;
  onCancel?: () => void;
  className?: string;
}

// ============================================================================
// Sub-Components
// ============================================================================

function PhotoRequirementBadge({ req }: { req: PhotoRequirement }) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all',
        req.captured
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : req.required
          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
      )}
    >
      <span>{req.icon}</span>
      <span>{req.label}</span>
      {req.captured && <span>✓</span>}
    </div>
  );
}

function PhotoThumbnail({ 
  photo, 
  onRemove 
}: { 
  photo: CapturedPhoto; 
  onRemove: () => void;
}) {
  return (
    <div className="relative group">
      <img
        src={photo.dataUrl}
        alt={photo.label}
        className="w-20 h-20 object-cover rounded-lg border-2 border-white/20"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center rounded-b-lg">
        {photo.label}
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-sm font-bold"
      >
        ×
      </button>
    </div>
  );
}

function ScanProgressBar({ 
  progress, 
  stage, 
  message 
}: { 
  progress: number; 
  stage: string;
  message: string;
}) {
  const stageIcons: Record<string, string> = {
    uploading: '📤',
    analyzing: '🔍',
    generating: '🏗️',
    complete: '✅',
    error: '❌',
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300">
          {stageIcons[stage] || '⏳'} {message}
        </span>
        <span className="text-sm font-medium text-white">{Math.round(progress)}%</span>
      </div>
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            stage === 'error' ? 'bg-red-500' : 
            stage === 'complete' ? 'bg-green-500' : 
            'bg-gradient-to-r from-purple-500 to-blue-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RoomScanner({
  projectId,
  roomName,
  onScanComplete,
  onCancel,
  className,
}: RoomScannerProps) {
  const {
    photos,
    scanResult,
    progress,
    isScanning,
    isCameraActive,
    cameraError,
    videoRef,
    startCamera,
    stopCamera,
    capturePhoto,
    removePhoto,
    clearPhotos,
    startScan,
    cancelScan,
    getPhotoGuidance,
    getRequiredPhotos,
  } = useRoomScanner();

  const [showCamera, setShowCamera] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);

  const guidance = getPhotoGuidance();
  const requirements = getRequiredPhotos();
  const requiredComplete = requirements.filter(r => r.required && r.captured).length;
  const requiredTotal = requirements.filter(r => r.required).length;
  const canStartScan = requiredComplete >= requiredTotal;

  // Start camera when entering camera mode
  useEffect(() => {
    if (showCamera && !isCameraActive) {
      startCamera();
    }
    return () => {
      if (isCameraActive) {
        stopCamera();
      }
    };
  }, [showCamera, isCameraActive, startCamera, stopCamera]);

  // Handle scan completion
  useEffect(() => {
    if (scanResult && onScanComplete) {
      onScanComplete(scanResult);
    }
  }, [scanResult, onScanComplete]);

  const handleCapture = async () => {
    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 200);
    
    await capturePhoto(guidance.nextPhoto);
  };

  const handleStartScan = async () => {
    setShowCamera(false);
    stopCamera();
    await startScan(projectId, roomName);
  };

  // ============================================================================
  // Render: Camera View
  // ============================================================================

  if (showCamera) {
    return (
      <div className={cn('fixed inset-0 bg-black z-50 flex flex-col', className)}>
        {/* Camera Feed */}
        <div className="relative flex-1">
          <video
            ref={videoRef as React.RefObject<HTMLVideoElement>}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Capture flash effect */}
          {captureFlash && (
            <div className="absolute inset-0 bg-white animate-pulse" />
          )}

          {/* Guidance overlay */}
          <div className="absolute top-4 left-4 right-4">
            <div className="bg-black/70 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{guidance.icon}</span>
                <div>
                  <p className="text-white font-semibold">{guidance.instruction}</p>
                  <p className="text-gray-300 text-sm">{guidance.tip}</p>
                </div>
              </div>
              <div className="text-sm text-gray-400">
                {requiredComplete}/{requiredTotal} required photos
              </div>
            </div>
          </div>

          {/* Photo count */}
          <div className="absolute bottom-24 left-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="text-white text-sm">📷 {photos.length} photos</span>
          </div>

          {/* Captured photos strip */}
          {photos.length > 0 && (
            <div className="absolute bottom-24 right-4 left-20 overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {photos.map((photo) => (
                  <PhotoThumbnail
                    key={photo.id}
                    photo={photo}
                    onRemove={() => removePhoto(photo.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Camera error */}
          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
              <div className="bg-red-900/50 border border-red-500 rounded-xl p-6 max-w-sm text-center">
                <p className="text-red-400 mb-4">📷 {cameraError}</p>
                <button
                  onClick={startCamera}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Camera Controls */}
        <div className="bg-black/90 backdrop-blur-sm p-6 safe-area-bottom">
          <div className="flex items-center justify-between max-w-md mx-auto">
            {/* Close */}
            <button
              onClick={() => {
                setShowCamera(false);
                stopCamera();
              }}
              className="w-12 h-12 rounded-full bg-gray-800 text-white flex items-center justify-center"
            >
              ✕
            </button>

            {/* Capture */}
            <button
              onClick={handleCapture}
              disabled={!isCameraActive}
              className={cn(
                'w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all',
                isCameraActive 
                  ? 'bg-white hover:bg-gray-200 active:scale-95' 
                  : 'bg-gray-600 opacity-50'
              )}
            >
              <div className="w-16 h-16 rounded-full bg-white" />
            </button>

            {/* Done / Next */}
            <button
              onClick={() => setShowCamera(false)}
              className={cn(
                'px-4 py-2 rounded-full font-medium transition-all',
                canStartScan
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              )}
            >
              {canStartScan ? 'Done ✓' : `${requiredComplete}/${requiredTotal}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Scanning Progress
  // ============================================================================

  if (isScanning) {
    return (
      <div className={cn('flex flex-col items-center justify-center min-h-[400px] p-8', className)}>
        <div className="text-6xl mb-6 animate-bounce">
          {progress.stage === 'uploading' && '📤'}
          {progress.stage === 'analyzing' && '🔍'}
          {progress.stage === 'generating' && '🏗️'}
        </div>
        
        <ScanProgressBar
          progress={progress.progress}
          stage={progress.stage}
          message={progress.message}
        />

        <p className="mt-4 text-gray-400 text-sm">
          {progress.substage || 'Please wait...'}
        </p>

        <button
          onClick={cancelScan}
          className="mt-8 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ============================================================================
  // Render: Scan Complete
  // ============================================================================

  if (progress.stage === 'complete' && scanResult) {
    return (
      <div className={cn('flex flex-col items-center p-8', className)}>
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-white mb-2">Scan Complete!</h2>
        
        <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mt-6 space-y-4">
          <div>
            <p className="text-gray-400 text-sm">Room Type</p>
            <p className="text-white text-lg font-medium">{scanResult.roomType}</p>
          </div>
          
          <div>
            <p className="text-gray-400 text-sm">Estimated Dimensions</p>
            <p className="text-white text-lg font-medium">
              {scanResult.dimensions.width.toFixed(1)}m × {scanResult.dimensions.length.toFixed(1)}m × {scanResult.dimensions.height.toFixed(1)}m
            </p>
          </div>
          
          <div>
            <p className="text-gray-400 text-sm">Detected Objects</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {scanResult.recognizedObjects.slice(0, 8).map((obj, i) => (
                <span key={i} className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm">
                  {obj.label}
                </span>
              ))}
              {scanResult.recognizedObjects.length > 8 && (
                <span className="px-2 py-1 bg-gray-700 text-gray-400 rounded text-sm">
                  +{scanResult.recognizedObjects.length - 8} more
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-gray-400 text-sm">Style Recommendations</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {scanResult.styleRecommendations.slice(0, 3).map((style, i) => (
                <span key={i} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-sm">
                  {style}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={clearPhotos}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Scan Another Room
          </button>
          <button
            onClick={() => onScanComplete?.(scanResult)}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
          >
            Continue to Design →
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Photo Collection View (Default)
  // ============================================================================

  return (
    <div className={cn('flex flex-col p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">📸 Room Scanner</h2>
          <p className="text-gray-400">Take photos of your room for AI analysis</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Requirements */}
      <div className="bg-gray-800/50 rounded-xl p-4 mb-6">
        <p className="text-sm text-gray-400 mb-3">Photo checklist:</p>
        <div className="flex flex-wrap gap-2">
          {requirements.map((req) => (
            <PhotoRequirementBadge key={req.type} req={req} />
          ))}
        </div>
      </div>

      {/* Captured Photos Grid */}
      {photos.length > 0 ? (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Captured photos ({photos.length}):</p>
          <div className="grid grid-cols-4 gap-3">
            {photos.map((photo) => (
              <PhotoThumbnail
                key={photo.id}
                photo={photo}
                onRemove={() => removePhoto(photo.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-12 mb-6 border-2 border-dashed border-gray-700 rounded-xl">
          <div className="text-6xl mb-4">📷</div>
          <p className="text-gray-400 text-center mb-4">
            No photos yet.<br />
            Tap the button below to start capturing.
          </p>
        </div>
      )}

      {/* Error message */}
      {progress.stage === 'error' && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
          <p className="text-red-400">{progress.message}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => setShowCamera(true)}
          className="flex-1 py-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-xl">📷</span>
          {photos.length > 0 ? 'Add More Photos' : 'Open Camera'}
        </button>
        
        {photos.length > 0 && (
          <button
            onClick={handleStartScan}
            disabled={!canStartScan}
            className={cn(
              'flex-1 py-4 font-semibold rounded-xl transition-all flex items-center justify-center gap-2',
              canStartScan
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            )}
          >
            <span className="text-xl">🔍</span>
            {canStartScan ? 'Analyze Room' : `Need ${requiredTotal - requiredComplete} more`}
          </button>
        )}
      </div>

      {/* Tips */}
      <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
        <p className="text-blue-400 text-sm font-medium mb-2">💡 Tips for better results:</p>
        <ul className="text-blue-300/80 text-sm space-y-1">
          <li>• Good lighting helps AI detect objects better</li>
          <li>• Include visible reference objects (doors, furniture) for scale</li>
          <li>• Corner shots help estimate room dimensions</li>
          <li>• Capture any special features you want to preserve</li>
        </ul>
      </div>
    </div>
  );
}

export default RoomScanner;
