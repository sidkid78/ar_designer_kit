'use client';

/**
 * TextureGallery.tsx - Display and manage generated textures
 */

import React, { useState } from 'react';
import { GeneratedTexture, useTextureGenerator } from '../../hooks/useRoomEditing';
import Image from 'next/image';
// ============================================================================
// Types
// ============================================================================

interface TextureGalleryProps {
  projectId: string;
  textures: GeneratedTexture[];
  onTextureSelect?: (texture: GeneratedTexture) => void;
  onTextureGenerate?: (texture: GeneratedTexture) => void;
  className?: string;
}

interface TextureCardProps {
  texture: GeneratedTexture;
  isSelected: boolean;
  onClick: () => void;
}

interface TextureGeneratorFormProps {
  projectId: string;
  onGenerate: (texture: GeneratedTexture) => void;
}

// ============================================================================
// Preset Materials
// ============================================================================

const PRESET_MATERIALS = [
  { name: 'Oak Hardwood', description: 'Light oak hardwood flooring with natural grain patterns', type: 'flooring' },
  { name: 'White Marble', description: 'Polished white carrara marble with grey veining', type: 'countertop' },
  { name: 'Exposed Brick', description: 'Rustic red exposed brick wall texture', type: 'wall' },
  { name: 'Concrete', description: 'Modern polished concrete with subtle aggregate', type: 'flooring' },
  { name: 'Herringbone Tile', description: 'White herringbone ceramic tile pattern', type: 'backsplash' },
  { name: 'Walnut Wood', description: 'Dark walnut wood grain for cabinets or furniture', type: 'furniture' },
  { name: 'Terrazzo', description: 'Modern terrazzo with colorful aggregate chips', type: 'flooring' },
  { name: 'Linen Texture', description: 'Natural linen fabric texture for upholstery', type: 'fabric' },
];

// ============================================================================
// TextureCard Component
// ============================================================================

const TextureCard: React.FC<TextureCardProps> = ({ texture, isSelected, onClick }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [tilePreview, setTilePreview] = useState(false);

  return (
    <>
      <div
        className={`
          relative group rounded-xl overflow-hidden cursor-pointer transition-all
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:shadow-lg'}
        `}
        onClick={onClick}
      >
        {/* Texture Preview */}
        <div className="aspect-square bg-gray-100 relative">
          <Image
            title="Texture thumbnail"
            width={100}
            height={100}
            src={texture.thumbnailUrl}
            alt={texture.name}
            className="w-full h-full object-cover"
          />
          
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); setShowPreview(true); }}
              className="p-2 bg-white rounded-full hover:bg-gray-100"
              title="View full size"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setTilePreview(true); }}
              className="p-2 bg-white rounded-full hover:bg-gray-100"
              title="Preview tiled"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
          </div>

          {/* Resolution badge */}
          <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded-full">
            {texture.resolution}
          </span>

          {/* Selected indicator */}
          {isSelected && (
            <div className="absolute top-2 left-2 p-1 bg-blue-500 rounded-full">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 bg-white">
          <h4 className="font-medium text-gray-900 text-sm truncate">{texture.name}</h4>
          <p className="text-xs text-gray-500">{texture.materialType}</p>
        </div>
      </div>

      {/* Full Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative">
            <Image
              title="Full preview"
              width={100}
              height={100}
              src={texture.imageUrl}
              alt={texture.name}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            />
            <button
              title="Close"
              className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full"
              onClick={() => setShowPreview(false)}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Tiled Preview Modal */}
      {tilePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setTilePreview(false)}
        >
          <div className="relative w-[80vw] h-[80vh] overflow-hidden rounded-lg">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${texture.imageUrl})`,
                backgroundSize: '200px 200px',
                backgroundRepeat: 'repeat',
              }}
            />
            <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/70 rounded-lg">
              <span className="text-white text-sm">Tiled Preview - {texture.name}</span>
            </div>
            <button
              title="Close"
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full"
              onClick={() => setTilePreview(false)}
            >
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// TextureGeneratorForm Component
// ============================================================================

const TextureGeneratorForm: React.FC<TextureGeneratorFormProps> = ({ projectId, onGenerate }) => {
  const [description, setDescription] = useState('');
  const [materialType, setMaterialType] = useState('generic');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [showPresets, setShowPresets] = useState(false);
  
  const { isGenerating, error, generate } = useTextureGenerator();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const texture = await generate(projectId, description.trim(), materialType, resolution);
    if (texture) {
      onGenerate(texture);
      setDescription('');
    }
  };

  const handlePresetSelect = (preset: typeof PRESET_MATERIALS[0]) => {
    setDescription(preset.description);
    setMaterialType(preset.type);
    setShowPresets(false);
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <h4 className="font-medium text-gray-900 mb-3">Generate New Texture</h4>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Preset selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="w-full px-3 py-2 text-left text-sm bg-white border rounded-lg hover:bg-gray-50 flex items-center justify-between"
          >
            <span className="text-gray-600">Quick presets...</span>
            <svg className={`w-4 h-4 transition-transform ${showPresets ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {showPresets && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {PRESET_MATERIALS.map((preset, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b last:border-0"
                >
                  <span className="font-medium text-sm text-gray-900">{preset.name}</span>
                  <span className="block text-xs text-gray-500">{preset.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Description input */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the texture you want to generate..."
          className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />

        {/* Options row */}
        <div className="flex gap-2">
          <select
            title="Material type"
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value)}
            className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="generic">Generic</option>
            <option value="flooring">Flooring</option>
            <option value="wall">Wall</option>
            <option value="countertop">Countertop</option>
            <option value="fabric">Fabric</option>
            <option value="furniture">Furniture</option>
          </select>

          <select
            title="Resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as '1K' | '2K' | '4K')}
            className="w-24 px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-600">{error.message}</p>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isGenerating || !description.trim()}
          className={`
            w-full py-2.5 rounded-lg text-sm font-medium transition-colors
            ${isGenerating || !description.trim()
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </span>
          ) : (
            'Generate Texture'
          )}
        </button>
      </form>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const TextureGallery: React.FC<TextureGalleryProps> = ({
  projectId,
  textures,
  onTextureSelect,
  onTextureGenerate,
  className = '',
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);

  const handleTextureClick = (texture: GeneratedTexture) => {
    setSelectedId(texture.id);
    onTextureSelect?.(texture);
  };

  const handleNewTexture = (texture: GeneratedTexture) => {
    setSelectedId(texture.id);
    onTextureGenerate?.(texture);
    setShowGenerator(false);
  };

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Texture Library</h3>
          <p className="text-sm text-gray-500">
            {textures.length} texture{textures.length !== 1 ? 's' : ''}
          </p>
        </div>
        
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className={`
            px-4 py-2 text-sm font-medium rounded-lg transition-colors
            ${showGenerator
              ? 'bg-gray-200 text-gray-700'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
            }
          `}
        >
          {showGenerator ? 'Cancel' : '+ New Texture'}
        </button>
      </div>

      {/* Generator Form */}
      {showGenerator && (
        <div className="mb-6">
          <TextureGeneratorForm projectId={projectId} onGenerate={handleNewTexture} />
        </div>
      )}

      {/* Texture Grid */}
      {textures.length > 0 ? (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {textures.map((texture) => (
            <TextureCard
              key={texture.id}
              texture={texture}
              isSelected={texture.id === selectedId}
              onClick={() => handleTextureClick(texture)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <h4 className="mt-4 font-medium text-gray-900">No Textures Yet</h4>
          <p className="mt-1 text-sm text-gray-500">Generate your first seamless texture</p>
          <button
            onClick={() => setShowGenerator(true)}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            Generate Texture
          </button>
        </div>
      )}
    </div>
  );
};

export default TextureGallery;