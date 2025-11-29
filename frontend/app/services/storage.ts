/**
 * storage.ts - Cloud Storage service for AR Designer Kit
 * Handles upload, download, and management of generated assets
 */

import { 
    getStorage, 
    ref, 
    uploadBytes, 
    uploadString,
    getDownloadURL,
    deleteObject,
    listAll,
    getMetadata,
    updateMetadata,
    StorageReference 
  } from 'firebase/storage';
  import { getAuth } from 'firebase/auth';
  
  // ============================================================================
  // Types
  // ============================================================================
  
  export interface UploadResult {
    url: string;
    path: string;
    metadata: {
      size: number;
      contentType: string;
      timeCreated: string;
    };
  }
  
  export interface AssetMetadata {
    name: string;
    path: string;
    url: string;
    size: number;
    contentType: string;
    createdAt: string;
    customMetadata?: Record<string, string>;
  }
  
  export interface StorageFolder {
    path: string;
    items: AssetMetadata[];
    prefixes: string[];
  }
  
  export type AssetType = 
    | 'original'      // Original uploaded images
    | 'generated'     // AI-generated room images
    | 'variation'     // Style variations
    | 'texture'       // Generated textures
    | 'thumbnail'     // Thumbnails
    | 'floorplan';    // Floor plan exports
  
  // ============================================================================
  // Storage Service
  // ============================================================================
  
  class StorageService {
    private storage = getStorage();
    private auth = getAuth();
    
    // ---------------------------------------------------------------------------
    // Path Helpers
    // ---------------------------------------------------------------------------
  
    /**
     * Get the current user's ID or throw
     */
    private getUserId(): string {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User must be authenticated');
      }
      return user.uid;
    }
  
    /**
     * Build a storage path for an asset
     */
    private buildPath(
      projectId: string,
      assetType: AssetType,
      filename: string,
      roomId?: string,
      sessionId?: string
    ): string {
      const userId = this.getUserId();
      const basePath = `users/${userId}/projects/${projectId}`;
      
      switch (assetType) {
        case 'original':
          return roomId 
            ? `${basePath}/rooms/${roomId}/original/${filename}`
            : `${basePath}/originals/${filename}`;
        
        case 'generated':
          return sessionId
            ? `${basePath}/sessions/${sessionId}/generated/${filename}`
            : `${basePath}/generated/${filename}`;
        
        case 'variation':
          return roomId
            ? `${basePath}/rooms/${roomId}/variations/${filename}`
            : `${basePath}/variations/${filename}`;
        
        case 'texture':
          return `${basePath}/textures/${filename}`;
        
        case 'thumbnail':
          return `${basePath}/thumbnails/${filename}`;
        
        case 'floorplan':
          return roomId
            ? `${basePath}/rooms/${roomId}/floorplans/${filename}`
            : `${basePath}/floorplans/${filename}`;
        
        default:
          return `${basePath}/misc/${filename}`;
      }
    }
  
    // ---------------------------------------------------------------------------
    // Upload Methods
    // ---------------------------------------------------------------------------
  
    /**
     * Upload a file to storage
     */
    async uploadFile(
      file: File,
      projectId: string,
      assetType: AssetType,
      options?: {
        roomId?: string;
        sessionId?: string;
        customFilename?: string;
        customMetadata?: Record<string, string>;
      }
    ): Promise<UploadResult> {
      const filename = options?.customFilename || this.generateFilename(file.name);
      const path = this.buildPath(
        projectId,
        assetType,
        filename,
        options?.roomId,
        options?.sessionId
      );
      
      const storageRef = ref(this.storage, path);
      
      // Upload with metadata
      const metadata = {
        contentType: file.type,
        customMetadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
          assetType,
          ...options?.customMetadata,
        },
      };
      
      const snapshot = await uploadBytes(storageRef, file, metadata);
      const url = await getDownloadURL(snapshot.ref);
      
      return {
        url,
        path,
        metadata: {
          size: snapshot.metadata.size || file.size,
          contentType: snapshot.metadata.contentType || file.type,
          timeCreated: snapshot.metadata.timeCreated || new Date().toISOString(),
        },
      };
    }
  
    /**
     * Upload a base64 encoded image
     */
    async uploadBase64(
      base64Data: string,
      projectId: string,
      assetType: AssetType,
      options?: {
        roomId?: string;
        sessionId?: string;
        filename?: string;
        contentType?: string;
        customMetadata?: Record<string, string>;
      }
    ): Promise<UploadResult> {
      const contentType = options?.contentType || 'image/png';
      const extension = contentType.split('/')[1] || 'png';
      const filename = options?.filename || `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
      
      const path = this.buildPath(
        projectId,
        assetType,
        filename,
        options?.roomId,
        options?.sessionId
      );
      
      const storageRef = ref(this.storage, path);
      
      // Handle data URL prefix if present
      const base64Content = base64Data.includes(',') 
        ? base64Data.split(',')[1] 
        : base64Data;
      
      const metadata = {
        contentType,
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          assetType,
          ...options?.customMetadata,
        },
      };
      
      const snapshot = await uploadString(storageRef, base64Content, 'base64', metadata);
      const url = await getDownloadURL(snapshot.ref);
      
      return {
        url,
        path,
        metadata: {
          size: snapshot.metadata.size || 0,
          contentType: snapshot.metadata.contentType || contentType,
          timeCreated: snapshot.metadata.timeCreated || new Date().toISOString(),
        },
      };
    }
  
    /**
     * Upload a Blob (useful for canvas exports, etc.)
     */
    async uploadBlob(
      blob: Blob,
      projectId: string,
      assetType: AssetType,
      options?: {
        roomId?: string;
        sessionId?: string;
        filename?: string;
        customMetadata?: Record<string, string>;
      }
    ): Promise<UploadResult> {
      const contentType = blob.type || 'application/octet-stream';
      const extension = contentType.split('/')[1] || 'bin';
      const filename = options?.filename || `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
      
      const path = this.buildPath(
        projectId,
        assetType,
        filename,
        options?.roomId,
        options?.sessionId
      );
      
      const storageRef = ref(this.storage, path);
      
      const metadata = {
        contentType,
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          assetType,
          ...options?.customMetadata,
        },
      };
      
      const snapshot = await uploadBytes(storageRef, blob, metadata);
      const url = await getDownloadURL(snapshot.ref);
      
      return {
        url,
        path,
        metadata: {
          size: snapshot.metadata.size || blob.size,
          contentType: snapshot.metadata.contentType || contentType,
          timeCreated: snapshot.metadata.timeCreated || new Date().toISOString(),
        },
      };
    }
  
    // ---------------------------------------------------------------------------
    // Download Methods
    // ---------------------------------------------------------------------------
  
    /**
     * Get download URL for a path
     */
    async getUrl(path: string): Promise<string> {
      const storageRef = ref(this.storage, path);
      return getDownloadURL(storageRef);
    }
  
    /**
     * Download file as blob
     */
    async downloadBlob(path: string): Promise<Blob> {
      const url = await this.getUrl(path);
      const response = await fetch(url);
      return response.blob();
    }
  
    /**
     * Download file as base64
     */
    async downloadBase64(path: string): Promise<string> {
      const blob = await this.downloadBlob(path);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // Remove data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  
    // ---------------------------------------------------------------------------
    // Listing & Metadata
    // ---------------------------------------------------------------------------
  
    /**
     * List all assets in a folder
     */
    async listAssets(
      projectId: string,
      assetType: AssetType,
      options?: {
        roomId?: string;
        sessionId?: string;
      }
    ): Promise<AssetMetadata[]> {
      const folderPath = this.buildPath(projectId, assetType, '', options?.roomId, options?.sessionId);
      // Remove trailing filename placeholder
      const cleanPath = folderPath.replace(/\/+$/, '');
      
      const folderRef = ref(this.storage, cleanPath);
      const result = await listAll(folderRef);
      
      const assets: AssetMetadata[] = await Promise.all(
        result.items.map(async (itemRef) => {
          const metadata = await getMetadata(itemRef);
          const url = await getDownloadURL(itemRef);
          
          return {
            name: itemRef.name,
            path: itemRef.fullPath,
            url,
            size: metadata.size,
            contentType: metadata.contentType || 'application/octet-stream',
            createdAt: metadata.timeCreated,
            customMetadata: metadata.customMetadata,
          };
        })
      );
      
      // Sort by creation date, newest first
      return assets.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
  
    /**
     * Get metadata for a specific file
     */
    async getAssetMetadata(path: string): Promise<AssetMetadata> {
      const storageRef = ref(this.storage, path);
      const metadata = await getMetadata(storageRef);
      const url = await getDownloadURL(storageRef);
      
      return {
        name: storageRef.name,
        path: storageRef.fullPath,
        url,
        size: metadata.size,
        contentType: metadata.contentType || 'application/octet-stream',
        createdAt: metadata.timeCreated,
        customMetadata: metadata.customMetadata,
      };
    }
  
    /**
     * Update custom metadata for a file
     */
    async updateAssetMetadata(
      path: string,
      customMetadata: Record<string, string>
    ): Promise<void> {
      const storageRef = ref(this.storage, path);
      await updateMetadata(storageRef, { customMetadata });
    }
  
    // ---------------------------------------------------------------------------
    // Delete Methods
    // ---------------------------------------------------------------------------
  
    /**
     * Delete a single file
     */
    async deleteAsset(path: string): Promise<void> {
      const storageRef = ref(this.storage, path);
      await deleteObject(storageRef);
    }
  
    /**
     * Delete all assets in a folder
     */
    async deleteFolder(
      projectId: string,
      assetType: AssetType,
      options?: {
        roomId?: string;
        sessionId?: string;
      }
    ): Promise<number> {
      const folderPath = this.buildPath(projectId, assetType, '', options?.roomId, options?.sessionId);
      const cleanPath = folderPath.replace(/\/+$/, '');
      
      const folderRef = ref(this.storage, cleanPath);
      const result = await listAll(folderRef);
      
      await Promise.all(result.items.map(item => deleteObject(item)));
      
      return result.items.length;
    }
  
    /**
     * Delete all assets for a project
     */
    async deleteProjectAssets(projectId: string): Promise<void> {
      const userId = this.getUserId();
      const projectPath = `users/${userId}/projects/${projectId}`;
      
      await this.deleteRecursive(ref(this.storage, projectPath));
    }
  
    /**
     * Recursively delete all files in a path
     */
    private async deleteRecursive(folderRef: StorageReference): Promise<void> {
      const result = await listAll(folderRef);
      
      // Delete all files
      await Promise.all(result.items.map(item => deleteObject(item)));
      
      // Recursively delete subfolders
      await Promise.all(result.prefixes.map(prefix => this.deleteRecursive(prefix)));
    }
  
    // ---------------------------------------------------------------------------
    // Utility Methods
    // ---------------------------------------------------------------------------
  
    /**
     * Generate a unique filename
     */
    private generateFilename(originalName: string): string {
      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const extension = originalName.split('.').pop() || 'bin';
      return `${timestamp}_${random}.${extension}`;
    }
  
    /**
     * Get storage usage for a project
     */
    async getProjectStorageUsage(projectId: string): Promise<{
      totalSize: number;
      fileCount: number;
      byType: Record<AssetType, { size: number; count: number }>;
    }> {
      const userId = this.getUserId();
      const projectPath = `users/${userId}/projects/${projectId}`;
      
      const result = await this.calculateFolderSize(ref(this.storage, projectPath));
      
      return {
        totalSize: result.totalSize,
        fileCount: result.fileCount,
        byType: result.byType as Record<AssetType, { size: number; count: number }>,
      };
    }
  
    /**
     * Calculate total size of a folder recursively
     */
    private async calculateFolderSize(
      folderRef: StorageReference
    ): Promise<{
      totalSize: number;
      fileCount: number;
      byType: Record<string, { size: number; count: number }>;
    }> {
      const result = await listAll(folderRef);
      
      let totalSize = 0;
      let fileCount = 0;
      const byType: Record<string, { size: number; count: number }> = {};
      
      // Process files
      for (const item of result.items) {
        const metadata = await getMetadata(item);
        const assetType = metadata.customMetadata?.assetType || 'unknown';
        
        totalSize += metadata.size;
        fileCount++;
        
        if (!byType[assetType]) {
          byType[assetType] = { size: 0, count: 0 };
        }
        byType[assetType].size += metadata.size;
        byType[assetType].count++;
      }
      
      // Process subfolders
      for (const prefix of result.prefixes) {
        const subResult = await this.calculateFolderSize(prefix);
        totalSize += subResult.totalSize;
        fileCount += subResult.fileCount;
        
        for (const [type, stats] of Object.entries(subResult.byType)) {
          if (!byType[type]) {
            byType[type] = { size: 0, count: 0 };
          }
          byType[type].size += stats.size;
          byType[type].count += stats.count;
        }
      }
      
      return { totalSize, fileCount, byType };
    }
  
    /**
     * Format bytes to human readable
     */
    formatBytes(bytes: number): string {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  }
  
  // ============================================================================
  // Export Singleton
  // ============================================================================
  
  export const storageService = new StorageService();
  export default storageService;