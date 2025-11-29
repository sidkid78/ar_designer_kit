/**
 * useRoomEditing.ts - React hooks for room editing Cloud Functions
 */

import { useState, useCallback, useEffect } from 'react';
import { 
  getFunctions, 
  httpsCallable,
  HttpsCallableResult 
} from 'firebase/functions';
import { useAuth } from './useAuth'; // Assume this exists

// ============================================================================
// Types
// ============================================================================

export interface RoomAnalysis {
  roomType: string;
  dimensions: {
    estimatedWidth: number;
    estimatedLength: number;
    estimatedHeight: number;
  };
  lightingSuggestions: string[];
  styleRecommendations: string[];
  detectedFeatures: string[];
  currentStyle?: string;
  improvementAreas?: string[];
}

export interface StyleVariation {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface GeneratedTexture {
  id: string;
  name: string;
  materialType: string;
  imageUrl: string;
  thumbnailUrl: string;
  resolution: string;
  isSeamless: boolean;
}

export interface EditingSessionData {
  sessionId: string;
  projectId: string;
  roomId: string;
  currentImageUrl?: string;
  metadata: {
    roomType?: string;
    baseStyle?: string;
    editCount: number;
  };
  history: Array<{
    role: 'user' | 'model';
    text?: string;
    imageUrl?: string;
    timestamp: string;
  }>;
}

export interface ProductRecommendation {
  name: string;
  brand: string;
  priceRange: string;
  retailer: string;
  fitRationale: string;
  searchQuery: string;
}

// ============================================================================
// Cloud Function Callers
// ============================================================================

const functions = getFunctions();

const callAnalyzeAndCreateSession = httpsCallable<
  { projectId: string; roomId: string; imageBase64: string; mimeType?: string },
  { sessionId: string; imageUrl: string; roomAnalysis: RoomAnalysis }
>(functions, 'analyzeAndCreateSession');

const callSendRoomEdit = httpsCallable<
  { 
    sessionId: string; 
    prompt: string; 
    newImageBase64?: string;
    mimeType?: string;
    aspectRatio?: string;
    imageSize?: string;
  },
  { imageUrl?: string; text: string; editCount: number }
>(functions, 'sendRoomEdit');

const callGenerateStyleVariations = httpsCallable<
  {
    projectId: string;
    roomId: string;
    imageBase64: string;
    mimeType?: string;
    baseStyle: string;
    numberOfVariations?: number;
  },
  { variationId: string; variations: StyleVariation[] }
>(functions, 'generateStyleVariations');

const callGenerateTexture = httpsCallable<
  {
    projectId: string;
    materialDescription: string;
    materialType?: string;
    resolution?: string;
  },
  GeneratedTexture
>(functions, 'generateTexture');

const callGetProductRecommendations = httpsCallable<
  {
    roomAnalysis: RoomAnalysis;
    budget?: string;
    style?: string;
    priorities?: string[];
  },
  { recommendations: ProductRecommendation[]; searchQueries: string[] }
>(functions, 'getProductRecommendations');

const callGetSessionHistory = httpsCallable<
  { sessionId: string },
  EditingSessionData
>(functions, 'getSessionHistory');

const callDeleteSession = httpsCallable<
  { sessionId: string },
  { success: boolean }
>(functions, 'deleteSession');

// ============================================================================
// useRoomAnalysis - Analyze a room and create editing session
// ============================================================================

export interface UseRoomAnalysisResult {
  analyze: (imageFile: File, projectId: string, roomId: string) => Promise<void>;
  sessionId: string | null;
  imageUrl: string | null;
  analysis: RoomAnalysis | null;
  isAnalyzing: boolean;
  error: Error | null;
  reset: () => void;
}

export function useRoomAnalysis(): UseRoomAnalysisResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const analyze = useCallback(async (
    imageFile: File,
    projectId: string,
    roomId: string
  ) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Convert file to base64
      const base64 = await fileToBase64(imageFile);
      const mimeType = imageFile.type || 'image/jpeg';

      const result = await callAnalyzeAndCreateSession({
        projectId,
        roomId,
        imageBase64: base64,
        mimeType,
      });

      setSessionId(result.data.sessionId);
      setImageUrl(result.data.imageUrl);
      setAnalysis(result.data.roomAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Analysis failed'));
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSessionId(null);
    setImageUrl(null);
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analyze,
    sessionId,
    imageUrl,
    analysis,
    isAnalyzing,
    error,
    reset,
  };
}

// ============================================================================
// useEditingSession - Multi-turn room editing
// ============================================================================

export interface EditHistoryItem {
  role: 'user' | 'model';
  text?: string;
  imageUrl?: string;
  timestamp: string;
}

export interface UseEditingSessionResult {
  sessionId: string | null;
  currentImageUrl: string | null;
  history: EditHistoryItem[];
  editCount: number;
  isEditing: boolean;
  error: Error | null;
  
  // Actions
  loadSession: (sessionId: string) => Promise<void>;
  sendEdit: (prompt: string, newImage?: File) => Promise<void>;
  deleteSession: () => Promise<void>;
}

export function useEditingSession(
  initialSessionId?: string
): UseEditingSessionResult {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<EditHistoryItem[]>([]);
  const [editCount, setEditCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load existing session
  const loadSession = useCallback(async (id: string) => {
    try {
      const result = await callGetSessionHistory({ sessionId: id });
      setSessionId(result.data.sessionId);
      setCurrentImageUrl(result.data.currentImageUrl || null);
      setHistory(result.data.history);
      setEditCount(result.data.metadata.editCount);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load session'));
    }
  }, []);

  // Load session on mount if initialSessionId provided
  useEffect(() => {
    if (initialSessionId) {
      loadSession(initialSessionId);
    }
  }, [initialSessionId, loadSession]);

  // Send an edit
  const sendEdit = useCallback(async (prompt: string, newImage?: File) => {
    if (!sessionId) {
      setError(new Error('No active session'));
      return;
    }

    setIsEditing(true);
    setError(null);

    try {
      let newImageBase64: string | undefined;
      let mimeType: string | undefined;

      if (newImage) {
        newImageBase64 = await fileToBase64(newImage);
        mimeType = newImage.type || 'image/jpeg';
      }

      // Optimistically add user message to history
      const userMessage: EditHistoryItem = {
        role: 'user',
        text: prompt,
        timestamp: new Date().toISOString(),
      };
      setHistory(prev => [...prev, userMessage]);

      const result = await callSendRoomEdit({
        sessionId,
        prompt,
        newImageBase64,
        mimeType,
      });

      // Add model response to history
      const modelMessage: EditHistoryItem = {
        role: 'model',
        text: result.data.text,
        imageUrl: result.data.imageUrl,
        timestamp: new Date().toISOString(),
      };
      setHistory(prev => [...prev, modelMessage]);

      if (result.data.imageUrl) {
        setCurrentImageUrl(result.data.imageUrl);
      }
      setEditCount(result.data.editCount);
    } catch (err) {
      // Remove optimistic user message on error
      setHistory(prev => prev.slice(0, -1));
      setError(err instanceof Error ? err : new Error('Edit failed'));
    } finally {
      setIsEditing(false);
    }
  }, [sessionId]);

  // Delete session
  const deleteSessionFn = useCallback(async () => {
    if (!sessionId) return;

    try {
      await callDeleteSession({ sessionId });
      setSessionId(null);
      setCurrentImageUrl(null);
      setHistory([]);
      setEditCount(0);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete session'));
    }
  }, [sessionId]);

  return {
    sessionId,
    currentImageUrl,
    history,
    editCount,
    isEditing,
    error,
    loadSession,
    sendEdit,
    deleteSession: deleteSessionFn,
  };
}

// ============================================================================
// useStyleVariations - Generate and manage style variations
// ============================================================================

export interface UseStyleVariationsResult {
  variations: StyleVariation[];
  variationId: string | null;
  isGenerating: boolean;
  error: Error | null;
  selectedVariation: StyleVariation | null;
  
  // Actions
  generate: (
    imageFile: File,
    projectId: string,
    roomId: string,
    baseStyle: string,
    count?: number
  ) => Promise<void>;
  selectVariation: (id: string) => void;
  clear: () => void;
}

export function useStyleVariations(): UseStyleVariationsResult {
  const [variations, setVariations] = useState<StyleVariation[]>([]);
  const [variationId, setVariationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const generate = useCallback(async (
    imageFile: File,
    projectId: string,
    roomId: string,
    baseStyle: string,
    count: number = 4
  ) => {
    setIsGenerating(true);
    setError(null);
    setVariations([]);

    try {
      const base64 = await fileToBase64(imageFile);
      const mimeType = imageFile.type || 'image/jpeg';

      const result = await callGenerateStyleVariations({
        projectId,
        roomId,
        imageBase64: base64,
        mimeType,
        baseStyle,
        numberOfVariations: count,
      });

      setVariationId(result.data.variationId);
      setVariations(result.data.variations);
      
      // Auto-select first variation
      if (result.data.variations.length > 0) {
        setSelectedId(result.data.variations[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Generation failed'));
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const selectVariation = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const clear = useCallback(() => {
    setVariations([]);
    setVariationId(null);
    setSelectedId(null);
    setError(null);
  }, []);

  const selectedVariation = variations.find(v => v.id === selectedId) || null;

  return {
    variations,
    variationId,
    isGenerating,
    error,
    selectedVariation,
    generate,
    selectVariation,
    clear,
  };
}

// ============================================================================
// useTextureGenerator - Generate seamless textures
// ============================================================================

export interface UseTextureGeneratorResult {
  texture: GeneratedTexture | null;
  isGenerating: boolean;
  error: Error | null;
  
  generate: (
    projectId: string,
    description: string,
    materialType?: string,
    resolution?: '1K' | '2K' | '4K'
  ) => Promise<GeneratedTexture | null>;
  clear: () => void;
}

export function useTextureGenerator(): UseTextureGeneratorResult {
  const [texture, setTexture] = useState<GeneratedTexture | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(async (
    projectId: string,
    description: string,
    materialType: string = 'generic',
    resolution: '1K' | '2K' | '4K' = '2K'
  ): Promise<GeneratedTexture | null> => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await callGenerateTexture({
        projectId,
        materialDescription: description,
        materialType,
        resolution,
      });

      setTexture(result.data);
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Texture generation failed'));
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clear = useCallback(() => {
    setTexture(null);
    setError(null);
  }, []);

  return {
    texture,
    isGenerating,
    error,
    generate,
    clear,
  };
}

// ============================================================================
// useProductRecommendations - Get product suggestions
// ============================================================================

export interface UseProductRecommendationsResult {
  recommendations: ProductRecommendation[];
  searchQueries: string[];
  isLoading: boolean;
  error: Error | null;
  
  fetch: (
    roomAnalysis: RoomAnalysis,
    options?: {
      budget?: 'low' | 'medium' | 'high' | 'luxury';
      style?: string;
      priorities?: string[];
    }
  ) => Promise<void>;
  clear: () => void;
}

export function useProductRecommendations(): UseProductRecommendationsResult {
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async (
    roomAnalysis: RoomAnalysis,
    options?: {
      budget?: 'low' | 'medium' | 'high' | 'luxury';
      style?: string;
      priorities?: string[];
    }
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await callGetProductRecommendations({
        roomAnalysis,
        budget: options?.budget,
        style: options?.style,
        priorities: options?.priorities,
      });

      setRecommendations(result.data.recommendations);
      setSearchQueries(result.data.searchQueries);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get recommendations'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setRecommendations([]);
    setSearchQueries([]);
    setError(null);
  }, []);

  return {
    recommendations,
    searchQueries,
    isLoading,
    error,
    fetch,
    clear,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (data:image/jpeg;base64,)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}