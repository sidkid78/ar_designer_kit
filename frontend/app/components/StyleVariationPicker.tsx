'use client';
/**
 * StyleVariationPicker.tsx - Display and select style variations
 */


import React, { useState } from 'react';
import { StyleVariation } from '@/hooks/useRoomEditing';
import Image from 'next/image';

// ============================================================================
// Types
// ============================================================================

interface StyleVariationPickerProps {
  variations: StyleVariation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApply?: (variation: StyleVariation) => void;
  isLoading?: boolean;
  className?: string;
}

interface VariationCardProps {
  variation: StyleVariation;
  isSelected: boolean;
  onClick: () => void;
}

// ============================================================================
// VariationCard Component
// ============================================================================

const VariationCard: React.FC<VariationCardProps> = ({
  variation,
  isSelected,
  onClick,
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  return (
    <>
      <div
        className={`
          relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200
          ${isSelected 
            ? 'ring-2 ring-blue-500 ring-offset-2 scale-[1.02] shadow-lg' 
            : 'hover:shadow-md hover:scale-[1.01]'
          }
        `}
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className="aspect-video bg-gray-100 relative">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}
          <Image
            title="Variation thumbnail"
            width={100}
            height={100}
            src={variation.thumbnailUrl}
            alt={variation.name}
            className={`w-full h-full object-cover transition-opacity ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
          
          {/* Expand button */}
          <button
            title="Expand"
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowFullImage(true);
            }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          
          {/* Selected indicator */}
          {isSelected && (
            <div className="absolute top-2 left-2 p-1 bg-blue-500 rounded-full">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
        
        {/* Info */}
        <div className="p-3 bg-white">
          <h4 className="font-medium text-gray-900 text-sm">{variation.name}</h4>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{variation.description}</p>
        </div>
      </div>

      {/* Full Image Modal */}
      {showFullImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <Image
              src={variation.imageUrl}
              alt={variation.name}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <button
              title="Close"
              className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
              onClick={() => setShowFullImage(false)}
            >
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute bottom-4 left-4 right-4 p-4 bg-black/70 rounded-lg">
              <h3 className="text-white font-medium">{variation.name}</h3>
              <p className="text-white/80 text-sm mt-1">{variation.description}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// Loading Skeleton
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="rounded-xl overflow-hidden bg-gray-100 animate-pulse">
        <div className="aspect-video bg-gray-200" />
        <div className="p-3 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-full" />
        </div>
      </div>
    ))}
  </div>
);

// ============================================================================
// Main Component
// ============================================================================

export const StyleVariationPicker: React.FC<StyleVariationPickerProps> = ({
  variations,
  selectedId,
  onSelect,
  onApply,
  isLoading = false,
  className = '',
}) => {
  const selectedVariation = variations.find(v => v.id === selectedId);

  if (isLoading) {
    return (
      <div className={className}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Generating Style Variations...</h3>
          <p className="text-sm text-gray-500">This may take a minute</p>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (variations.length === 0) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No Variations Yet</h3>
        <p className="mt-2 text-sm text-gray-500">Generate style variations to see them here</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Style Variations</h3>
          <p className="text-sm text-gray-500">
            {variations.length} variation{variations.length !== 1 ? 's' : ''} generated
          </p>
        </div>
        
        {selectedVariation && onApply && (
          <button
            onClick={() => onApply(selectedVariation)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Apply &quot;{selectedVariation.name}&quot;
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {variations.map((variation) => (
          <VariationCard
            key={variation.id}
            variation={variation}
            isSelected={variation.id === selectedId}
            onClick={() => onSelect(variation.id)}
          />
        ))}
      </div>

      {/* Selected Details */}
      {selectedVariation && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-start gap-4">
            <Image
              title="Selected variation"
              width={96}
              height={96}
              src={selectedVariation.thumbnailUrl}
              alt={selectedVariation.name}
              className="w-24 h-16 object-cover rounded-lg"
            />
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">{selectedVariation.name}</h4>
              <p className="text-sm text-gray-600 mt-1">{selectedVariation.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StyleVariationPicker;