'use client';

/**
 * ProjectWorkspace.tsx - Main Project Orchestrator
 * 
 * The primary stateful component for managing a single project.
 * Orchestrates the AR view, tools, panels, and overall UX flow.
 */

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useARStore, type ViewMode } from '@/stores/useARStore';
import { PlacedObject, useProjectStore } from '@/stores/useProjectStore';
import { Toolbar } from './Toolbar';
import { SidePanel } from './SidePanel';
import { cn } from '@/lib/utils';
import { checkWebXRSupport } from '@/lib/webxr';

// Sample 3D models for furniture (these would normally come from API)
const FURNITURE_MODELS: Record<string, { name: string; emoji: string }> = {
  '/models/1.glb': { name: 'Modern Sofa', emoji: '🛋️' },
  '/models/2.glb': { name: 'Coffee Table', emoji: '🪑' },
  '/models/3.glb': { name: 'Floor Lamp', emoji: '💡' },
  '/models/4.glb': { name: 'Bookshelf', emoji: '📚' },
  '/models/5.glb': { name: 'Armchair', emoji: '🪑' },
  '/models/6.glb': { name: 'Dining Table', emoji: '🍽️' },
};

// Dynamic import - SimpleARCanvas doesn't use React Three Fiber (React 19 compatible)
const SimpleARCanvas = dynamic(
  () => import('./SimpleARCanvas').then(mod => mod.SimpleARCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Loading AR Engine...</p>
        </div>
      </div>
    ),
  }
);

// ============================================================================
// Types
// ============================================================================

interface ProjectWorkspaceProps {
  projectId: string;
  projectName?: string;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function ProjectWorkspace({
  projectId,
  projectName = 'Untitled Project',
  className,
}: ProjectWorkspaceProps) {
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [selectedModelUrl, setSelectedModelUrl] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [placementMode, setPlacementMode] = useState(false);
  const [webxrSupported, setWebxrSupported] = useState<boolean | null>(null);
  const [isARActive, setIsARActive] = useState(false);

  // Check WebXR support on mount
  useEffect(() => {
    checkWebXRSupport().then((support) => {
      setWebxrSupported(support.hasAR);
      console.log('[ProjectWorkspace] WebXR AR supported:', support.hasAR);
    });
  }, []);

  // Zustand stores
  const {
    viewMode,
    setViewMode,
    currentTool,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isSessionActive,
    error: arError,
    clearError: clearARError,
    reset: resetAR,
    selectedModelUrl: storeSelectedModelUrl,
    selectModel,
  } = useARStore();

  // Get furniture info for selected model
  const selectedFurniture = useMemo(() => {
    if (!storeSelectedModelUrl) return null;
    return FURNITURE_MODELS[storeSelectedModelUrl] || { name: 'Custom Model', emoji: '📦' };
  }, [storeSelectedModelUrl]);

  const {
    setProject,
    clearProject,
    floorPlan,
    placedObjects,
    isLoading,
    isSaving,
    currentScan,
    addPlacedObject,
  } = useProjectStore();

  // ============================================================================
  // Handlers
  // ============================================================================

  const showNotification = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 4000);
    },
    []
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Initialize project
  useEffect(() => {
    setProject(projectId, projectName);
    return () => {
      clearProject();
      resetAR();
    };
  }, [projectId, projectName, setProject, clearProject, resetAR]);

  // Auto-show side panel based on mode - use derived state instead of effect
  const shouldShowSidePanel = viewMode === 'design' || viewMode === 'guide' || showSidePanel;

  // Derive displayed notification - prioritize AR errors
  const displayedNotification = arError 
    ? { message: arError, type: 'error' as const }
    : notification;

  // Auto-clear AR errors after display
  useEffect(() => {
    if (arError) {
      const timer = setTimeout(() => clearARError(), 4000);
      return () => clearTimeout(timer);
    }
  }, [arError, clearARError]);

  // Called when scan completes (for future native AR integration)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleScanComplete = useCallback(() => {
    showNotification('Scan complete! Room captured successfully.', 'success');
    setViewMode('design');
  }, [setViewMode, showNotification]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleObjectPlaced = useCallback(
    (object: PlacedObject) => {
      addPlacedObject(object);
      setNotification({ message: 'Object placed successfully!', type: 'success' });
    },
    [addPlacedObject, setNotification]
  );

  // Called when measurement completes (for future native AR integration)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleMeasurementComplete = useCallback(
    (distance: number) => {
      showNotification(`Distance: ${distance.toFixed(2)}m`, 'info');
    },
    [showNotification]
  );

  const handleModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      // Enable placement mode in design view
      setPlacementMode(mode === 'design');
      if (mode === 'design' || mode === 'guide') {
        setShowSidePanel(true);
      }
    },
    [setViewMode, setShowSidePanel, setPlacementMode]
  );

  const handleToolSelect = useCallback(
    (tool: string) => {
      // Tool selection handled by Toolbar component
      if (tool === 'catalog' || tool === 'materials' || tool === 'style') {
        setShowSidePanel(true);
      }
      // Enable placement mode when selecting placement tools
      if (tool === 'place' || tool === 'catalog') {
        setPlacementMode(true);
      }
    },
    [setShowSidePanel, setPlacementMode]
  );

  // Handle model selection from catalog (for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleModelSelect = useCallback((modelUrl: string) => {
    setSelectedModelUrl(modelUrl);
    setPlacementMode(true);
    showNotification('Model selected - tap to place in AR', 'info');
  }, [setSelectedModelUrl, setPlacementMode, showNotification]);

  // ============================================================================
  // Render
  // ============================================================================

  // Show active tool indicator
  const activeToolLabel = currentTool ? currentTool.charAt(0).toUpperCase() + currentTool.slice(1) : null;

  return (
    <div className={cn('relative w-full h-full bg-gray-950 overflow-hidden', className)}>
      {/* Main AR Canvas - Simple WebXR without R3F for React 19 compatibility */}
      <SimpleARCanvas
        className="absolute inset-0"
        selectedFurniture={selectedFurniture}
        onARStart={() => {
          setIsARActive(true);
          showNotification('AR session started!', 'success');
        }}
        onAREnd={() => {
          setIsARActive(false);
          showNotification('AR session ended', 'info');
        }}
        onError={(error) => {
          showNotification(error, 'error');
        }}
        onFurniturePlaced={(name) => {
          showNotification(`Placed ${name}!`, 'success');
          selectModel(''); // Clear selection after placing
        }}
      />

      {/* Top Bar - Hidden during AR */}
      <div className={cn(
        "absolute top-0 left-0 right-0 z-10 transition-opacity duration-300",
        isARActive && "opacity-0 pointer-events-none"
      )}>
        <div className="flex items-center justify-between p-4 bg-linear-to-b from-black/60 to-transparent">
          {/* Project Name */}
          <div className="flex items-center gap-3">
            <button
              title="Back to Projects"
              onClick={() => window.history.back()}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-white font-semibold text-lg leading-tight">
                {projectName}
              </h1>
              <p className="text-white/60 text-xs capitalize">
                {viewMode} Mode
                {activeToolLabel && ` • ${activeToolLabel}`}
                {webxrSupported === true && ' • WebXR ✓'}
                {webxrSupported === false && ' • 3D Preview'}
              </p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-full bg-black/40 backdrop-blur-sm">
            {(['scan', 'design', 'measure', 'guide'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                disabled={mode !== 'scan' && !currentScan}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-all',
                  viewMode === mode
                    ? 'bg-white text-black'
                    : 'text-white/70 hover:text-white hover:bg-white/10',
                  mode !== 'scan' && !currentScan && 'opacity-40 cursor-not-allowed'
                )}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="text-white/60 text-sm animate-pulse">Saving...</span>
            )}
            <button
              title="Open Side Panel"
              onClick={() => setShowSidePanel(!showSidePanel)}
              className={cn(
                'p-2 rounded-full transition-colors',
                shouldShowSidePanel ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'
              )}
            >
              <PanelRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar - Hidden during AR */}
      {!isARActive && (
        <Toolbar
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10"
          onToolSelect={handleToolSelect}
        />
      )}

      {/* Side Panel - Hidden during AR */}
      {!isARActive && (
        <SidePanel
          isOpen={shouldShowSidePanel}
          onClose={() => setShowSidePanel(false)}
          className="absolute top-0 right-0 bottom-0 z-20"
        />
      )}

      {/* Stats Bar (when scanning is complete) - Hidden during AR */}
      {!isARActive && currentScan && viewMode !== 'scan' && (
        <div className="absolute bottom-4 left-4 z-10">
          <div className="flex items-center gap-4 px-4 py-2 rounded-xl bg-black/50 backdrop-blur-sm">
            <Stat
              label="Room"
              value={`${currentScan.dimensions.width.toFixed(1)}m × ${currentScan.dimensions.length.toFixed(1)}m`}
            />
            <div className="w-px h-8 bg-white/20" />
            <Stat label="Objects" value={currentScan.recognizedObjects.length.toString()} />
            <div className="w-px h-8 bg-white/20" />
            <Stat label="Placed" value={placedObjects.length.toString()} />
            {floorPlan && (
              <>
                <div className="w-px h-8 bg-white/20" />
                <Stat label="Floor Plan" value="✓" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {displayedNotification && (
        <div
          className={cn(
            'absolute top-20 left-1/2 -translate-x-1/2 z-50',
            'px-6 py-3 rounded-xl shadow-2xl',
            'animate-in fade-in slide-in-from-top-4 duration-300',
            displayedNotification.type === 'success' && 'bg-green-500 text-white',
            displayedNotification.type === 'error' && 'bg-red-500 text-white',
            displayedNotification.type === 'info' && 'bg-white/90 text-black backdrop-blur-sm'
          )}
        >
          <p className="font-medium">{displayedNotification.message}</p>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white font-medium">Loading...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-white/60 text-xs">{label}</p>
      <p className="text-white font-semibold">{value}</p>
    </div>
  );
}

// Icons
function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PanelRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 3h12v18H9M9 3v18M3 9h6M3 15h6"
      />
    </svg>
  );
}

export default ProjectWorkspace;
