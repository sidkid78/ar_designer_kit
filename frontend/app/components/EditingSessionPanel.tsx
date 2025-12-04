'use client';
/**
 * EditingSessionPanel.tsx - Multi-turn conversational room editing UI
 */

import React, { useState, useRef, useEffect } from 'react';
import { EditHistoryItem, useEditingSession } from '../../hooks/useRoomEditing';
import Image from 'next/image';
// ============================================================================
// Types
// ============================================================================

interface EditingSessionPanelProps {
  sessionId: string;
  initialImageUrl?: string;
  onImageUpdate?: (imageUrl: string) => void;
  className?: string;
}

interface ChatMessageProps {
  message: EditHistoryItem;
  isLatest: boolean;
}

interface ImagePreviewProps {
  imageUrl: string;
  onClose: () => void;
}

// ============================================================================
// ImagePreview Component
// ============================================================================

const ImagePreview: React.FC<ImagePreviewProps> = ({ imageUrl, onClose }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    onClick={onClose}
  >
    <div className="relative max-w-5xl max-h-[90vh]">
      <Image
        src={imageUrl}
        alt="Generated room"
        width={1200}
        height={800}
        className="max-w-full max-h-[90vh] object-contain rounded-lg"
      />
      <button
        title="Close"
        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full"
        onClick={onClose}
      >
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <a
        href={imageUrl}
        download="generated-room.png"
        className="absolute bottom-4 right-4 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </a>
    </div>
  </div>
);

// ============================================================================
// ChatMessage Component
// ============================================================================

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLatest }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const isUser = message.role === 'user';

  return (
    <>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`
            max-w-[85%] rounded-2xl px-4 py-3
            ${isUser 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-900'
            }
            ${isLatest && !isUser ? 'animate-fade-in' : ''}
          `}
        >
          {/* Text content */}
          {message.text && (
            <p className={`text-sm ${isUser ? 'text-white' : 'text-gray-900'}`}>
              {message.text}
            </p>
          )}
          
          {/* Generated image */}
          {message.imageUrl && (
            <div className="mt-2">
              <div
                className="relative group cursor-pointer"
                onClick={() => setPreviewImage(message.imageUrl!)}
              >
                <div className="relative w-full h-auto">
                  <Image
                    src={message.imageUrl} 
                    alt="Generate room"
                    width={1200}
                    height={800}
                    className="max-w-full max-h-[90vh] object-contain rounded-lg" 
              />
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                  <span className="opacity-0 group-hover:opacity-100 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                    Click to expand
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Timestamp */}
          <p className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-500'}`}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreview imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </>
  );
};

// ============================================================================
// Suggested Prompts
// ============================================================================

const SUGGESTED_PROMPTS = [
  "Make it more modern and minimalist",
  "Add warmer lighting throughout",
  "Change the floor to light oak hardwood",
  "Make the walls a soft grey color",
  "Add more plants and greenery",
  "Make the space feel more cozy",
  "Add accent lighting behind the sofa",
  "Change to a Scandinavian style",
];

// ============================================================================
// Main Component
// ============================================================================

export const EditingSessionPanel: React.FC<EditingSessionPanelProps> = ({
  sessionId,
  initialImageUrl,
  onImageUpdate,
  className = '',
}) => {
  const {
    currentImageUrl,
    history,
    editCount,
    isEditing,
    error,
    sendEdit,
  } = useEditingSession(sessionId);

  const [inputValue, setInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [history]);

  // Notify parent of image updates
  useEffect(() => {
    if (currentImageUrl && onImageUpdate) {
      onImageUpdate(currentImageUrl);
    }
  }, [currentImageUrl, onImageUpdate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() && !selectedImage) return;

    setShowSuggestions(false);
    await sendEdit(inputValue.trim(), selectedImage || undefined);
    setInputValue('');
    setSelectedImage(null);
  };

  const handleSuggestionClick = (prompt: string) => {
    setInputValue(prompt);
    setShowSuggestions(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
    }
  };

  const displayImageUrl = currentImageUrl || initialImageUrl;

  return (
    <div className={`flex flex-col h-full bg-white rounded-xl shadow-sm border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="font-semibold text-gray-900">Room Editor</h3>
          <p className="text-xs text-gray-500">{editCount} edit{editCount !== 1 ? 's' : ''} made</p>
        </div>
        
        {displayImageUrl && (
          <button
            onClick={() => window.open(displayImageUrl, '_blank')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View Current
          </button>
        )}
      </div>

      {/* Current Image Preview */}
      {displayImageUrl && history.length === 0 && (
        <div className="p-4 border-b bg-gray-50">
          <Image
            title="Current room"
            width={100}
            height={100}
            src={displayImageUrl}
            alt="Current room image"
            className="w-full max-h-48 object-cover rounded-lg"
          />
          <p className="text-sm text-gray-500 mt-2 text-center">
            Start editing by typing a prompt below
          </p>
        </div>
      )}

      {/* Chat History */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {history.length === 0 && !displayImageUrl && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="mt-4 text-gray-500">Start your editing session</p>
          </div>
        )}

        {history.map((message, index) => (
          <ChatMessage
            key={`${message.timestamp}-${index}`}
            message={message}
            isLatest={index === history.length - 1}
          />
        ))}

        {/* Loading indicator */}
        {isEditing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-gray-500">Generating...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      {/* Suggested Prompts */}
      {showSuggestions && history.length < 3 && (
        <div className="px-4 py-2 border-t bg-gray-50">
          <p className="text-xs text-gray-500 mb-2">Suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.slice(0, 4).map((prompt, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(prompt)}
                className="text-xs px-3 py-1.5 bg-white border rounded-full hover:bg-gray-100 transition-colors text-gray-700"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Image Preview */}
      {selectedImage && (
        <div className="px-4 py-2 border-t bg-blue-50 flex items-center gap-2">
          <Image
            title="Selected image"
            width={48}
            height={48}
            src={URL.createObjectURL(selectedImage)}
            alt="Selected image"
            className="w-12 h-12 object-cover rounded"
          />
          <span className="flex-1 text-sm text-gray-700 truncate">{selectedImage.name}</span>
          <button
            title="Close"
            onClick={() => setSelectedImage(null)}
            className="p-1 hover:bg-blue-100 rounded"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex items-end gap-2">
          {/* File attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Attach reference image"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <input
            title="Attach reference image"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Describe the changes you want..."
              className="w-full px-4 py-3 pr-12 border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={1}
              disabled={isEditing}
            />
          </div>

          {/* Send button */}
          <button
            type="submit"
            disabled={isEditing || (!inputValue.trim() && !selectedImage)}
            className={`
              p-3 rounded-xl transition-colors
              ${isEditing || (!inputValue.trim() && !selectedImage)
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            `}
          >
            {isEditing ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditingSessionPanel;