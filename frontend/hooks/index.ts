/**
 * hooks/index.ts - Export all hooks
 */

// Authentication
export { useAuth, AuthProvider } from './useAuth';

// Room Editing Hooks
export {
  useRoomAnalysis,
  useEditingSession,
  useStyleVariations,
  useTextureGenerator,
  useProductRecommendations,
  type RoomAnalysis,
  type StyleVariation,
  type GeneratedTexture,
  type EditHistoryItem,
  type ProductRecommendation,
  type EditingSessionData,
} from './useRoomEditing';

// Storage Hooks
export {
  useStorageUpload,
  useStorageAssets,
  useStorageUsage,
  storageService,
  type AssetType,
  type UploadResult,
  type AssetMetadata,
} from './useStorage';