'use client';

/**
 * ProjectWorkspace.tsx - Main Project Orchestrator
 * 
 * The primary stateful component for managing a single project.
 * Orchestrates the AR view, tools, panels, and overall UX flow.
 */

import React, { useEffect, useCallback, useState } from 'react';
import { useARStore, type ViewMode } from '@/stores/useARStore';
import { PlacedObject, useProjectStore } from '@/stores/useProjectStore';
import { ARCanvas } from './ARCanvas';
import { Toolbar } from './Toolbar';
import { SidePanel } from './SidePanel';
import { cn } from '@/lib/utils';

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

  // Zustand stores
  const {
    viewMode,
    setViewMode,
    currentTool,
    isSessionActive,
    error: arError,
    clearError: clearARError,
    reset: resetAR,
  } = useARStore();

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

  const handleScanComplete = useCallback(() => {
    showNotification('Scan complete! Room captured successfully.', 'success');
    setViewMode('design');
  }, [setViewMode, showNotification]);

  const handleObjectPlaced = useCallback(
    (object: PlacedObject) => {
      addPlacedObject(object);
      setNotification({ message: 'Object placed successfully!', type: 'success' });
    },
    [addPlacedObject, setNotification]
  );

  const handleMeasurementComplete = useCallback(
    (distance: number) => {
      showNotification(`Distance: ${distance.toFixed(2)}m`, 'info');
    },
    [showNotification]
  );

  const handleModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (mode === 'design' || mode === 'guide') {
        setShowSidePanel(true);
      }
    },
    [setViewMode, setShowSidePanel]
  );

  const handleToolSelect = useCallback(
    (tool: string) => {
      // Tool selection handled by Toolbar component
      if (tool === 'catalog' || tool === 'materials' || tool === 'style') {
        setShowSidePanel(true);
      }
    },
    [setShowSidePanel]
  );

  // ============================================================================
  // Render
  // ============================================================================

  // Show active tool indicator
  const activeToolLabel = currentTool ? currentTool.charAt(0).toUpperCase() + currentTool.slice(1) : null;

  return (
    <div className={cn('relative w-full h-full bg-gray-950 overflow-hidden', className)}>
      {/* Main AR Canvas */}
      <ARCanvas
        className="absolute inset-0"
        onScanComplete={handleScanComplete}
        onObjectPlaced={(objectId: string) => handleObjectPlaced({ id: objectId, productName: 'Placed Object', modelUrl: '', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 }, addedAt: new Date() })}
        onMeasurementComplete={handleMeasurementComplete}
        onError={(error) => setNotification({ message: error, type: 'error' })}
      />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10">
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
                {isSessionActive && ' • Active'}
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

      {/* Toolbar */}
      <Toolbar
        className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10"
        onToolSelect={handleToolSelect}
      />

      {/* Side Panel */}
      <SidePanel
        isOpen={shouldShowSidePanel}
        onClose={() => setShowSidePanel(false)}
        className="absolute top-0 right-0 bottom-0 z-20"
      />

      {/* Stats Bar (when scanning is complete) */}
      {currentScan && viewMode !== 'scan' && (
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
