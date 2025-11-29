'use client';

/**
 * Toolbar.tsx - Tool Selection Interface
 * 
 * Provides tool selection buttons for different AR operations
 * like measuring, placing objects, and applying materials.
 */

import React, { useCallback } from 'react';
import { useARStore, type ARTool } from '@/stores/useARStore';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface ToolbarProps {
  className?: string;
  onToolSelect?: (tool: string) => void;
}

interface ToolConfig {
  id: ARTool | 'catalog' | 'materials' | 'style';
  label: string;
  icon: React.ReactNode;
  modes: string[];
  requiresScan?: boolean;
}

// ============================================================================
// Tool Configurations
// ============================================================================

const tools: ToolConfig[] = [
  {
    id: 'scan',
    label: 'Scan',
    icon: <ScanIcon />,
    modes: ['scan'],
  },
  {
    id: 'measure',
    label: 'Measure',
    icon: <RulerIcon />,
    modes: ['measure', 'design'],
    requiresScan: true,
  },
  {
    id: 'place',
    label: 'Place',
    icon: <CubeIcon />,
    modes: ['design'],
    requiresScan: true,
  },
  {
    id: 'paint',
    label: 'Paint',
    icon: <PaintIcon />,
    modes: ['design'],
    requiresScan: true,
  },
  {
    id: 'select',
    label: 'Select',
    icon: <CursorIcon />,
    modes: ['design'],
    requiresScan: true,
  },
  {
    id: 'style',
    label: 'AI Style',
    icon: <SparklesIcon />,
    modes: ['design'],
    requiresScan: true,
  },
];

// ============================================================================
// Component
// ============================================================================

export function Toolbar({ className, onToolSelect }: ToolbarProps) {
  const { 
    viewMode, 
    currentTool, 
    setTool,
    toggleObjectCatalog,
    toggleMaterialPicker,
  } = useARStore();

  const handleToolClick = useCallback(
    (tool: ToolConfig) => {
      if (tool.id === 'catalog') {
        toggleObjectCatalog();
        setTool('place');
      } else if (tool.id === 'materials') {
        toggleMaterialPicker();
        setTool('paint');
      } else if (tool.id === 'style') {
        // Style transformer - open side panel
        onToolSelect?.('style');
      } else {
        setTool(tool.id as ARTool);
      }
      onToolSelect?.(tool.id);
    },
    [setTool, toggleObjectCatalog, toggleMaterialPicker, onToolSelect]
  );

  // Filter tools based on current view mode
  const visibleTools = tools.filter((tool) => tool.modes.includes(viewMode));

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-2xl',
        'bg-black/60 backdrop-blur-xl border border-white/10',
        'shadow-2xl',
        className
      )}
    >
      {visibleTools.map((tool) => {
        const isActive = currentTool === tool.id;
        
        return (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool)}
            className={cn(
              'group relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all',
              isActive
                ? 'bg-white text-black'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          >
            <div className="w-6 h-6">{tool.icon}</div>
            <span className="text-[10px] font-medium">{tool.label}</span>
            
            {/* Active indicator */}
            {isActive && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
            )}
          </button>
        );
      })}

      {/* Divider */}
      {viewMode === 'design' && (
        <>
          <div className="w-px h-12 bg-white/20 mx-1" />
          
          {/* Quick Actions */}
          <button
            onClick={() => {
              toggleObjectCatalog(true);
              onToolSelect?.('catalog');
            }}
            className="p-3 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all"
            title="Object Catalog"
          >
            <GridIcon className="w-6 h-6" />
          </button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function ScanIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 4h4M4 4v4M20 4h-4M20 4v4M4 20h4M4 20v-4M20 20h-4M20 20v-4M8 12h8M12 8v8"
      />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M6 20L20 6M9 6v3M6 9h3M15 18v-3M18 15h-3"
      />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
      />
      <polyline
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        points="3.27,6.96 12,12.01 20.73,6.96"
      />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function PaintIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
      />
    </svg>
  );
}

function CursorIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3zM13 13l6 6"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-full h-full">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"
      />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}

export default Toolbar;

