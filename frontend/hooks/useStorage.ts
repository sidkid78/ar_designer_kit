/**
 * useStorage.ts - React hook for Cloud Storage operations
 */

import { useState, useCallback } from 'react';
import storageService, { 
  UploadResult, 
  AssetMetadata, 
  AssetType 
} from '@/app/services/storage';

// ============================================================================
// Types
// ============================================================================

export interface UseStorageUploadResult {
  upload: (file: File) => Promise<UploadResult | null>;
  uploadBase64: (data: string, contentType?: string) => Promise<UploadResult | null>;
  isUploading: boolean;
  progress: number;
  error: Error | null;
  lastUpload: UploadResult | null;
}

export interface UseStorageAssetsResult {
  assets: AssetMetadata[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  deleteAsset: (path: string) => Promise<boolean>;
}

export interface StorageUsage {
  totalSize: number;
  fileCount: number;
  byType: Record<AssetType, { size: number; count: number }>;
  formattedSize: string;
}

// ============================================================================
// useStorageUpload
// ============================================================================

export function useStorageUpload(
  projectId: string,
  assetType: AssetType,
  options?: {
    roomId?: string;
    sessionId?: string;
  }
): UseStorageUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpload, setLastUpload] = useState<UploadResult | null>(null);

  const upload = useCallback(async (file: File): Promise<UploadResult | null> => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      // Simulate progress (Firebase doesn't provide upload progress in v9 modular API easily)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const result = await storageService.uploadFile(file, projectId, assetType, {
        roomId: options?.roomId,
        sessionId: options?.sessionId,
      });

      clearInterval(progressInterval);
      setProgress(100);
      setLastUpload(result);
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Upload failed'));
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [projectId, assetType, options?.roomId, options?.sessionId]);

  const uploadBase64 = useCallback(async (
    data: string,
    contentType: string = 'image/png'
  ): Promise<UploadResult | null> => {
    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      setProgress(50);

      const result = await storageService.uploadBase64(data, projectId, assetType, {
        roomId: options?.roomId,
        sessionId: options?.sessionId,
        contentType,
      });

      setProgress(100);
      setLastUpload(result);
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Upload failed'));
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [projectId, assetType, options?.roomId, options?.sessionId]);

  return {
    upload,
    uploadBase64,
    isUploading,
    progress,
    error,
    lastUpload,
  };
}

// ============================================================================
// useStorageAssets
// ============================================================================

export function useStorageAssets(
  projectId: string,
  assetType: AssetType,
  options?: {
    roomId?: string;
    sessionId?: string;
    autoLoad?: boolean;
  }
): UseStorageAssetsResult {
  const [assets, setAssets] = useState<AssetMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await storageService.listAssets(projectId, assetType, {
        roomId: options?.roomId,
        sessionId: options?.sessionId,
      });
      setAssets(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load assets'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, assetType, options?.roomId, options?.sessionId]);

  const deleteAsset = useCallback(async (path: string): Promise<boolean> => {
    try {
      await storageService.deleteAsset(path);
      setAssets(prev => prev.filter(a => a.path !== path));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to delete asset'));
      return false;
    }
  }, []);

  // Auto-load on mount if enabled
  useState(() => {
    if (options?.autoLoad !== false) {
      refresh();
    }
  });

  return {
    assets,
    isLoading,
    error,
    refresh,
    deleteAsset,
  };
}

// ============================================================================
// useStorageUsage
// ============================================================================

export function useStorageUsage(projectId: string): {
  usage: StorageUsage | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await storageService.getProjectStorageUsage(projectId);
      setUsage({
        ...result,
        formattedSize: storageService.formatBytes(result.totalSize),
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get usage'));
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return {
    usage,
    isLoading,
    error,
    refresh,
  };
}

// ============================================================================
// Export
// ============================================================================

export { storageService, type AssetType, type UploadResult, type AssetMetadata };