'use client';

/**
 * RoomDesigner.tsx - Main page for room design and editing
 * Integrates analysis, style variations, editing, and textures
 */

import React, { useState, useCallback } from 'react';
import {
  useRoomAnalysis,
  useStyleVariations,
  useProductRecommendations,
  RoomAnalysis,
  StyleVariation,
  GeneratedTexture,
} from '@/hooks/useRoomEditing';
import { StyleVariationPicker } from './StyleVariationPicker';
import { EditingSessionPanel } from './EditingSessionPanel';
import { TextureGallery } from './TextureGallery';
import Image from 'next/image';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'upload' | 'analysis' | 'styles' | 'editor' | 'textures';

interface RoomDesignerProps {
  projectId: string;
  roomId: string;
}

// ============================================================================
// Style Presets
// ============================================================================

const STYLE_PRESETS = [
  { id: 'modern', name: 'Modern', icon: '🏢' },
  { id: 'scandinavian', name: 'Scandinavian', icon: '🌿' },
  { id: 'industrial', name: 'Industrial', icon: '🏭' },
  { id: 'bohemian', name: 'Bohemian', icon: '🎨' },
  { id: 'minimalist', name: 'Minimalist', icon: '⬜' },
  { id: 'traditional', name: 'Traditional', icon: '🏛️' },
  { id: 'mid-century', name: 'Mid-Century', icon: '🛋️' },
  { id: 'coastal', name: 'Coastal', icon: '🌊' },
];

// ============================================================================
// UploadView Component
// ============================================================================

interface UploadViewProps {
  onUpload: (file: File) => void;
  isAnalyzing: boolean;
}

const UploadView: React.FC<UploadViewProps> = ({ onUpload, isAnalyzing }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <h3 className="mt-6 text-lg font-medium text-gray-900">Analyzing Your Room</h3>
        <p className="mt-2 text-gray-500">This may take a moment...</p>
      </div>
    );
  }

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-2xl p-12 text-center transition-colors
        ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
      `}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <input
        title="Upload room"
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      
      <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      
      <h3 className="mt-4 text-lg font-medium text-gray-900">Upload a Room Photo</h3>
      <p className="mt-2 text-gray-500">Drag and drop or click to select</p>
      <p className="mt-1 text-sm text-gray-400">JPG, PNG up to 10MB</p>
    </div>
  );
};

// ============================================================================
// AnalysisView Component
// ============================================================================

interface AnalysisViewProps {
  imageUrl: string;
  analysis: RoomAnalysis;
  onSelectStyle: (style: string) => void;
  onStartEditing: () => void;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({
  imageUrl,
  analysis,
  onSelectStyle,
  onStartEditing,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Image Preview */}
    <div>
      <Image 
        title="Uploaded room"
        width={100}
        height={100}    
        src={imageUrl}
        alt="Uploaded room"
        className="w-full rounded-xl shadow-sm"
      />
    </div>

    {/* Analysis Results */}
    <div className="space-y-6">
      {/* Room Info */}
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h3 className="font-semibold text-gray-900 mb-3">Room Analysis</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Room Type</span>
            <span className="font-medium capitalize">{analysis.roomType}</span>
          </div>
          
          {analysis.dimensions && (
            <div className="flex justify-between">
              <span className="text-gray-500">Est. Dimensions</span>
              <span className="font-medium">
                {analysis.dimensions.estimatedWidth.toFixed(1)}m × {analysis.dimensions.estimatedLength.toFixed(1)}m
              </span>
            </div>
          )}
          
          {analysis.detectedFeatures && analysis.detectedFeatures.length > 0 && (
            <div>
              <span className="text-gray-500 text-sm">Detected Features</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.detectedFeatures.slice(0, 6).map((feature, i) => (
                  <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {analysis.styleRecommendations && analysis.styleRecommendations.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
          <h4 className="font-medium text-gray-900 mb-2">Recommended Styles</h4>
          <div className="flex flex-wrap gap-2">
            {analysis.styleRecommendations.map((style, i) => (
              <button
                key={i}
                onClick={() => onSelectStyle(style)}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 text-sm rounded-full hover:bg-blue-100 transition-colors"
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Style Selection */}
      <div className="bg-white rounded-xl p-5 shadow-sm border">
        <h4 className="font-medium text-gray-900 mb-3">Choose a Style</h4>
        <div className="grid grid-cols-4 gap-2">
          {STYLE_PRESETS.map((style) => (
            <button
              key={style.id}
              onClick={() => onSelectStyle(style.name)}
              className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 transition-colors border hover:border-blue-300"
            >
              <span className="text-2xl">{style.icon}</span>
              <span className="text-xs mt-1 text-gray-700">{style.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <button
          onClick={onStartEditing}
          className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
        >
          Start Editing
        </button>
      </div>
    </div>
  </div>
);

// ============================================================================
// Navigation Tabs
// ============================================================================

interface TabsProps {
  currentView: ViewMode;
  onChange: (view: ViewMode) => void;
  disabled: string[];
}

const Tabs: React.FC<TabsProps> = ({ currentView, onChange, disabled }) => {
  const tabs: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'analysis', label: 'Analysis', icon: '📊' },
    { id: 'styles', label: 'Styles', icon: '🎨' },
    { id: 'editor', label: 'Editor', icon: '✏️' },
    { id: 'textures', label: 'Textures', icon: '🧱' },
  ];

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          disabled={disabled.includes(tab.id)}
          className={`
            flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors
            ${currentView === tab.id
              ? 'bg-white text-gray-900 shadow-sm'
              : disabled.includes(tab.id)
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }
          `}
        >
          <span>{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const RoomDesigner: React.FC<RoomDesignerProps> = ({ projectId, roomId }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [textures, setTextures] = useState<GeneratedTexture[]>([]);

  // Hooks
  const {
    analyze,
    sessionId,
    imageUrl,
    analysis,
    isAnalyzing,
    error: analysisError,
  } = useRoomAnalysis();

  const {
    variations,
    isGenerating: isGeneratingStyles,
    generate: generateStyles,
    selectedVariation,
    selectVariation,
  } = useStyleVariations();

  const {
    recommendations,
    isLoading: isLoadingRecs,
    fetch: fetchRecommendations,
  } = useProductRecommendations();

  // Handle file upload
  const handleUpload = async (file: File) => {
    setUploadedFile(file);
    await analyze(file, projectId, roomId);
    setViewMode('analysis');
  };

  // Handle style selection
  const handleStyleSelect = async (style: string) => {
    setSelectedStyle(style);
    if (uploadedFile) {
      await generateStyles(uploadedFile, projectId, roomId, style, 4);
      setViewMode('styles');
    }
  };

  // Handle variation apply
  const handleApplyVariation = (variation: StyleVariation) => {
    // Could start an editing session with this variation
    console.log('Applied variation:', variation.name);
    setViewMode('editor');
  };

  // Handle new texture
  const handleNewTexture = (texture: GeneratedTexture) => {
    setTextures(prev => [texture, ...prev]);
  };

  // Determine disabled tabs
  const disabledTabs: ViewMode[] = [];
  if (!sessionId) {
    disabledTabs.push('analysis', 'styles', 'editor', 'textures');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Room Designer</h1>
              <p className="text-sm text-gray-500">AI-powered interior design</p>
            </div>
            
            {sessionId && (
              <Tabs
                currentView={viewMode}
                onChange={setViewMode}
                disabled={disabledTabs}
              />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Display */}
        {analysisError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700">{analysisError.message}</p>
          </div>
        )}

        {/* Upload View */}
        {viewMode === 'upload' && (
          <UploadView onUpload={handleUpload} isAnalyzing={isAnalyzing} />
        )}

        {/* Analysis View */}
        {viewMode === 'analysis' && imageUrl && analysis && (
          <AnalysisView
            imageUrl={imageUrl}
            analysis={analysis}
            onSelectStyle={handleStyleSelect}
            onStartEditing={() => setViewMode('editor')}
          />
        )}

        {/* Styles View */}
        {viewMode === 'styles' && (
          <div className="space-y-6">
            {selectedStyle && (
              <div className="flex items-center gap-3">
                <span className="text-gray-500">Base Style:</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                  {selectedStyle}
                </span>
                <button
                  onClick={() => setSelectedStyle(null)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Change
                </button>
              </div>
            )}
            
            <StyleVariationPicker
              variations={variations}
              selectedId={selectedVariation?.id || null}
              onSelect={selectVariation}
              onApply={handleApplyVariation}
              isLoading={isGeneratingStyles}
            />

            {/* Style selector if none selected */}
            {!selectedStyle && !isGeneratingStyles && (
              <div className="bg-white rounded-xl p-6 shadow-sm border">
                <h3 className="font-medium text-gray-900 mb-4">Select a Base Style</h3>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                  {STYLE_PRESETS.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => handleStyleSelect(style.name)}
                      className="flex flex-col items-center p-4 rounded-xl hover:bg-gray-50 transition-colors border hover:border-blue-300"
                    >
                      <span className="text-3xl">{style.icon}</span>
                      <span className="text-sm mt-2 text-gray-700">{style.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Editor View */}
        {viewMode === 'editor' && sessionId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main editor panel */}
            <div className="lg:col-span-2">
              <EditingSessionPanel
                sessionId={sessionId}
                initialImageUrl={imageUrl || undefined}
                className="h-[600px]"
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick styles */}
              <div className="bg-white rounded-xl p-4 shadow-sm border">
                <h4 className="font-medium text-gray-900 mb-3">Quick Styles</h4>
                <div className="grid grid-cols-4 gap-2">
                  {STYLE_PRESETS.slice(0, 8).map((style) => (
                    <button
                      key={style.id}
                      className="flex flex-col items-center p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xl">{style.icon}</span>
                      <span className="text-xs mt-1 text-gray-600">{style.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Product Recommendations */}
              {analysis && (
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-900">Product Ideas</h4>
                    <button
                      onClick={() => fetchRecommendations(analysis)}
                      disabled={isLoadingRecs}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      {isLoadingRecs ? 'Loading...' : 'Get Suggestions'}
                    </button>
                  </div>
                  
                  {recommendations.length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {recommendations.map((rec, i) => (
                        <div key={i} className="p-2 bg-gray-50 rounded-lg">
                          <p className="font-medium text-sm text-gray-900">{rec.name}</p>
                          <p className="text-xs text-gray-500">{rec.brand} • {rec.priceRange}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Click above to get AI-powered product suggestions
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Textures View */}
        {viewMode === 'textures' && (
          <TextureGallery
            projectId={projectId}
            textures={textures}
            onTextureGenerate={handleNewTexture}
          />
        )}
      </main>
    </div>
  );
};

export default RoomDesigner;