'use client';

/**
 * SidePanel.tsx - Context-Aware Side Panel
 * 
 * A dynamic panel that shows different content based on the
 * currently selected tool or mode.
 */

import React, { useState, useCallback } from 'react';
import { useARStore } from '@/stores/useARStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { cn } from '@/lib/utils';
import { RecognizedObject, ScanCompleteEvent } from '@/lib/ar-bridge';

// ============================================================================
// Types
// ============================================================================

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

type PanelTab = 'catalog' | 'materials' | 'style' | 'info';

// ============================================================================
// Component
// ============================================================================

export function SidePanel({ isOpen, onClose, className }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('catalog');

  const { currentTool } = useARStore();
  const { placedObjects, recognizedObjects, currentScan } = useProjectStore();

  // Auto-select tab based on tool
  React.useEffect(() => {
    if (currentTool === 'place') setActiveTab('catalog');
    else if (currentTool === 'paint') setActiveTab('materials');
  }, [currentTool]);

  return (
    <div
      className={cn(
        'w-80 h-full bg-gray-900/95 backdrop-blur-xl border-l border-white/10',
        'transform transition-transform duration-300 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-white font-semibold">Design Tools</h2>
        <button
          title="Close"
          onClick={onClose}
          className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(['catalog', 'materials', 'style', 'info'] as PanelTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors',
              activeTab === tab
                ? 'text-white border-b-2 border-blue-500'
                : 'text-white/50 hover:text-white/80'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'catalog' && <ObjectCatalogPanel />}
        {activeTab === 'materials' && <MaterialsPanel />}
        {activeTab === 'style' && <StyleTransformerPanel />}
        {activeTab === 'info' && (
          <RoomInfoPanel
            scanData={currentScan}
            recognizedObjects={recognizedObjects}
            placedObjectsCount={placedObjects.length}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Object Catalog Panel
// ============================================================================

function ObjectCatalogPanel() {
  const { selectModel } = useARStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = ['all', 'seating', 'tables', 'lighting', 'decor', 'storage'];

  // Mock product data - replace with real API call
  const products = [
    { id: '1', name: 'Modern Sofa', category: 'seating', price: 899, image: '🛋️' },
    { id: '2', name: 'Coffee Table', category: 'tables', price: 349, image: '🪑' },
    { id: '3', name: 'Floor Lamp', category: 'lighting', price: 189, image: '💡' },
    { id: '4', name: 'Bookshelf', category: 'storage', price: 299, image: '📚' },
    { id: '5', name: 'Armchair', category: 'seating', price: 549, image: '🪑' },
    { id: '6', name: 'Dining Table', category: 'tables', price: 799, image: '🍽️' },
  ];

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {/* Search */}
      <input
        type="text"
        placeholder="Search furniture..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-lg bg-white/10 text-white placeholder-white/40 border border-white/10 focus:border-blue-500 focus:outline-none"
      />

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-blue-500 text-white'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            )}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 gap-3">
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            onClick={() => selectModel(`/models/${product.id}.glb`)}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left group"
          >
            <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">
              {product.image}
            </div>
            <p className="text-white text-sm font-medium truncate">{product.name}</p>
            <p className="text-white/50 text-xs">${product.price}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Materials Panel
// ============================================================================

function MaterialsPanel() {
  const { selectMaterial, selectedMaterialUrl } = useARStore();
  const [category, setCategory] = useState('paint');

  const categories = ['paint', 'wallpaper', 'flooring', 'tile'];

  // Mock materials - replace with real data
  const materials = {
    paint: [
      { id: 'p1', name: 'Cloud White', color: '#F5F5F5' },
      { id: 'p2', name: 'Soft Gray', color: '#9CA3AF' },
      { id: 'p3', name: 'Navy Blue', color: '#1E3A5F' },
      { id: 'p4', name: 'Sage Green', color: '#87A96B' },
      { id: 'p5', name: 'Warm Beige', color: '#D4C4A8' },
      { id: 'p6', name: 'Charcoal', color: '#36454F' },
    ],
    wallpaper: [
      { id: 'w1', name: 'Geometric', pattern: '◇◇◇' },
      { id: 'w2', name: 'Floral', pattern: '🌸🌸🌸' },
      { id: 'w3', name: 'Stripes', pattern: '|||' },
    ],
    flooring: [
      { id: 'f1', name: 'Oak Hardwood', color: '#C19A6B' },
      { id: 'f2', name: 'Walnut', color: '#5D432C' },
      { id: 'f3', name: 'White Marble', color: '#F0EDE8' },
    ],
    tile: [
      { id: 't1', name: 'Subway White', color: '#FFFFFF' },
      { id: 't2', name: 'Hex Gray', color: '#808080' },
      { id: 't3', name: 'Terracotta', color: '#E2725B' },
    ],
  };

  const currentMaterials = materials[category as keyof typeof materials] || [];

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              category === cat
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/70 hover:bg-white/20'
            )}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-3 gap-3">
        {currentMaterials.map((material) => (
          <button
            key={material.id}
            onClick={() => selectMaterial(`/textures/${material.id}.jpg`)}
            className={cn(
              'aspect-square rounded-xl border-2 transition-all overflow-hidden',
              selectedMaterialUrl?.includes(material.id)
                ? 'border-blue-500 scale-95'
                : 'border-transparent hover:border-white/30'
            )}
          >
            {'color' in material ? (
              <div
                className="w-full h-full"
                style={{ backgroundColor: material.color }}
              />
            ) : (
              <div className="w-full h-full bg-white/10 flex items-center justify-center text-2xl">
                {material.pattern}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Material Info */}
      {selectedMaterialUrl && (
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-white text-sm">Selected material ready to apply</p>
          <p className="text-white/50 text-xs mt-1">Tap on a surface to apply</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Style Transformer Panel
// ============================================================================

function StyleTransformerPanel() {
  const { setStylePrompt, stylePrompt } = useProjectStore();
  const [prompt, setPrompt] = useState(stylePrompt);
  const [isGenerating, setIsGenerating] = useState(false);

  const presetStyles = [
    'Modern Minimalist',
    'Scandinavian',
    'Mid-Century Modern',
    'Industrial Loft',
    'Bohemian',
    'Contemporary Luxury',
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setStylePrompt(prompt);
    
    // TODO: Call AI generation API
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    setIsGenerating(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-white/70 text-sm">
        Transform your room with AI-powered style suggestions.
      </p>

      {/* Preset Styles */}
      <div className="space-y-2">
        <p className="text-white/50 text-xs uppercase tracking-wider">Quick Styles</p>
        <div className="flex flex-wrap gap-2">
          {presetStyles.map((style) => (
            <button
              key={style}
              onClick={() => setPrompt(style)}
              className="px-3 py-1.5 rounded-full text-xs bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt */}
      <div className="space-y-2">
        <p className="text-white/50 text-xs uppercase tracking-wider">Custom Style</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your ideal room style..."
          className="w-full h-24 px-4 py-3 rounded-xl bg-white/10 text-white placeholder-white/40 border border-white/10 focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || isGenerating}
        className={cn(
          'w-full py-3 rounded-xl font-semibold transition-all',
          'bg-linear-to-b from-purple-500 to-pink-500 text-white',
          'hover:from-purple-600 hover:to-pink-600',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating...
          </span>
        ) : (
          '✨ Generate Style'
        )}
      </button>
    </div>
  );
}

// ============================================================================
// Room Info Panel
// ============================================================================

interface RoomInfoPanelProps {
  scanData: ScanCompleteEvent | null;
  recognizedObjects: RecognizedObject[];
  placedObjectsCount: number;
}

function RoomInfoPanel({ scanData, recognizedObjects, placedObjectsCount }: RoomInfoPanelProps) {
  if (!scanData) {
    return (
      <div className="text-center py-8">
        <p className="text-white/50">No scan data available</p>
        <p className="text-white/30 text-sm mt-2">Scan a room to see details</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Room Dimensions */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-white font-medium mb-3">Room Dimensions</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{scanData.dimensions.width.toFixed(1)}</p>
            <p className="text-white/50 text-xs">Width (m)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{scanData.dimensions.length.toFixed(1)}</p>
            <p className="text-white/50 text-xs">Length (m)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{scanData.dimensions.height.toFixed(1)}</p>
            <p className="text-white/50 text-xs">Height (m)</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/10 text-center">
          <p className="text-lg font-semibold text-white">
            {(scanData.dimensions.width * scanData.dimensions.length).toFixed(1)} m²
          </p>
          <p className="text-white/50 text-xs">Floor Area</p>
        </div>
      </div>

      {/* Recognized Objects */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <h3 className="text-white font-medium mb-3">Detected Objects</h3>
        <div className="space-y-2">
          {recognizedObjects.length > 0 ? (
            recognizedObjects.map((obj, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b border-white/5 last:border-0"
              >
                <span className="text-white/80 capitalize">{obj.label}</span>
                <span className="text-white/40 text-sm">
                  {(obj.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))
          ) : (
            <p className="text-white/40 text-sm">No objects detected</p>
          )}
        </div>
      </div>

      {/* Placed Objects Count */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-white/80">Placed Objects</span>
          <span className="text-2xl font-bold text-white">{placedObjectsCount}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default SidePanel;

