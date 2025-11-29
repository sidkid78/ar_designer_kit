// stores/useProjectStore.ts
// Global state for the currently open project

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { 
  ScanCompleteEvent, 
  RecognizedObject, 
  Vector3, 
  Quaternion 
} from '@/lib/ar-bridge';

// ============================================================================
// Types
// ============================================================================

export interface PlacedObject {
  id: string;
  productId?: string;
  productName: string;
  modelUrl: string;
  thumbnailUrl?: string;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  affiliateLink?: string;
  addedAt: Date;
}

export interface DesignState {
  id: string;
  name: string;
  stylePrompt?: string;
  generatedTextures: GeneratedTexture[];
  placedObjects: PlacedObject[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedTexture {
  surfaceType: 'wall' | 'floor' | 'ceiling' | 'custom';
  surfaceId: string;
  textureUrl: string;
  thumbnailUrl?: string;
}

export interface FloorPlan {
  id: string;
  scanId: string;
  imageUrl: string;
  pdfUrl?: string;
  dimensions: {
    width: number;
    length: number;
    height: number;
  };
  walls: WallSegment[];
  doors: DoorSegment[];
  windows: WindowSegment[];
}

interface WallSegment {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  height: number;
}

interface DoorSegment {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  rotation: number;
}

interface WindowSegment {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  wallId: string;
}

// ============================================================================
// Store Interface
// ============================================================================

interface ProjectState {
  // Project metadata
  projectId: string | null;
  projectName: string;
  
  // Scan data
  currentScan: ScanCompleteEvent | null;
  recognizedObjects: RecognizedObject[];
  meshUrl: string | null;
  
  // Floor plan
  floorPlan: FloorPlan | null;
  
  // Design state
  currentDesign: DesignState | null;
  designs: DesignState[];
  
  // Placed objects in current design
  placedObjects: PlacedObject[];
  selectedObjectId: string | null;
  
  // Style transformation
  stylePrompt: string;
  generatedTextures: GeneratedTexture[];
  
  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  
  // Actions
  setProject: (projectId: string, projectName: string) => void;
  clearProject: () => void;
  
  // Scan actions
  setScanData: (scan: ScanCompleteEvent) => void;
  setMeshUrl: (url: string) => void;
  addRecognizedObject: (object: RecognizedObject) => void;
  
  // Floor plan actions
  setFloorPlan: (floorPlan: FloorPlan) => void;
  
  // Design actions
  createDesign: (name: string) => DesignState;
  setCurrentDesign: (design: DesignState | null) => void;
  updateDesign: (designId: string, updates: Partial<DesignState>) => void;
  
  // Object placement actions
  addPlacedObject: (object: Omit<PlacedObject, 'id' | 'addedAt'>) => PlacedObject;
  updatePlacedObject: (id: string, updates: Partial<PlacedObject>) => void;
  removePlacedObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  
  // Style actions
  setStylePrompt: (prompt: string) => void;
  addGeneratedTexture: (texture: GeneratedTexture) => void;
  clearTextures: () => void;
  
  // Loading actions
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

const initialState = {
  projectId: null,
  projectName: '',
  currentScan: null,
  recognizedObjects: [],
  meshUrl: null,
  floorPlan: null,
  currentDesign: null,
  designs: [],
  placedObjects: [],
  selectedObjectId: null,
  stylePrompt: '',
  generatedTextures: [],
  isLoading: false,
  isSaving: false,
};

export const useProjectStore = create<ProjectState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Project actions
        setProject: (projectId, projectName) => {
          set({ projectId, projectName }, false, 'setProject');
        },

        clearProject: () => {
          set(initialState, false, 'clearProject');
        },

        // Scan actions
        setScanData: (scan) => {
          set(
            {
              currentScan: scan,
              meshUrl: scan.meshUrl,
              recognizedObjects: scan.recognizedObjects,
            },
            false,
            'setScanData'
          );
        },

        setMeshUrl: (url) => {
          set({ meshUrl: url }, false, 'setMeshUrl');
        },

        addRecognizedObject: (object) => {
          set(
            (state) => ({
              recognizedObjects: [...state.recognizedObjects, object],
            }),
            false,
            'addRecognizedObject'
          );
        },

        // Floor plan actions
        setFloorPlan: (floorPlan) => {
          set({ floorPlan }, false, 'setFloorPlan');
        },

        // Design actions
        createDesign: (name) => {
          const design: DesignState = {
            id: `design_${Date.now()}`,
            name,
            generatedTextures: [],
            placedObjects: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          set(
            (state) => ({
              designs: [...state.designs, design],
              currentDesign: design,
            }),
            false,
            'createDesign'
          );
          return design;
        },

        setCurrentDesign: (design) => {
          set(
            {
              currentDesign: design,
              placedObjects: design?.placedObjects || [],
              generatedTextures: design?.generatedTextures || [],
              stylePrompt: design?.stylePrompt || '',
            },
            false,
            'setCurrentDesign'
          );
        },

        updateDesign: (designId, updates) => {
          set(
            (state) => ({
              designs: state.designs.map((d) =>
                d.id === designId ? { ...d, ...updates, updatedAt: new Date() } : d
              ),
              currentDesign:
                state.currentDesign?.id === designId
                  ? { ...state.currentDesign, ...updates, updatedAt: new Date() }
                  : state.currentDesign,
            }),
            false,
            'updateDesign'
          );
        },

        // Object placement actions
        addPlacedObject: (objectData) => {
          const object: PlacedObject = {
            ...objectData,
            id: `obj_${Date.now()}`,
            addedAt: new Date(),
          };
          set(
            (state) => ({
              placedObjects: [...state.placedObjects, object],
            }),
            false,
            'addPlacedObject'
          );
          return object;
        },

        updatePlacedObject: (id, updates) => {
          set(
            (state) => ({
              placedObjects: state.placedObjects.map((obj) =>
                obj.id === id ? { ...obj, ...updates } : obj
              ),
            }),
            false,
            'updatePlacedObject'
          );
        },

        removePlacedObject: (id) => {
          set(
            (state) => ({
              placedObjects: state.placedObjects.filter((obj) => obj.id !== id),
              selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId,
            }),
            false,
            'removePlacedObject'
          );
        },

        selectObject: (id) => {
          set({ selectedObjectId: id }, false, 'selectObject');
        },

        // Style actions
        setStylePrompt: (prompt) => {
          set({ stylePrompt: prompt }, false, 'setStylePrompt');
        },

        addGeneratedTexture: (texture) => {
          set(
            (state) => ({
              generatedTextures: [...state.generatedTextures, texture],
            }),
            false,
            'addGeneratedTexture'
          );
        },

        clearTextures: () => {
          set({ generatedTextures: [] }, false, 'clearTextures');
        },

        // Loading actions
        setLoading: (loading) => {
          set({ isLoading: loading }, false, 'setLoading');
        },

        setSaving: (saving) => {
          set({ isSaving: saving }, false, 'setSaving');
        },
      }),
      {
        name: 'ar-designer-project',
        partialize: (state) => ({
          projectId: state.projectId,
          projectName: state.projectName,
        }),
      }
    ),
    { name: 'ProjectStore' }
  )
);

export default useProjectStore;

