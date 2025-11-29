// stores/useARStore.ts
// Global state for AR session management

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { 
  LiDARSupportResult, 
  TrackingStateResult, 
  MeasureResult,
  Vector3 
} from '@/lib/ar-bridge';

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'scan' | 'design' | 'guide' | 'measure';

export type ARTool = 
  | 'none'
  | 'scan'
  | 'measure'
  | 'place'
  | 'paint'
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale';

export interface MeasurementPoint {
  id: string;
  screenPosition: { x: number; y: number };
  worldPosition: Vector3;
  label?: string;
}

export interface ActiveMeasurement {
  id: string;
  startPoint: MeasurementPoint;
  endPoint?: MeasurementPoint;
  distance?: number;
  unit: 'meters' | 'feet' | 'inches';
}

// ============================================================================
// Store Interface
// ============================================================================

interface ARState {
  // Device capabilities
  deviceCapabilities: LiDARSupportResult | null;
  isSupported: boolean | null;
  
  // Session state
  isSessionActive: boolean;
  isScanning: boolean;
  scanProgress: number;
  
  // Tracking
  trackingState: TrackingStateResult | null;
  
  // View & Tool state
  viewMode: ViewMode;
  currentTool: ARTool;
  previousTool: ARTool;
  
  // Measurement
  measurements: ActiveMeasurement[];
  currentMeasurement: ActiveMeasurement | null;
  measurementPoints: MeasurementPoint[];
  measurementUnit: 'meters' | 'feet' | 'inches';
  
  // Material/Paint
  selectedMaterialUrl: string | null;
  selectedMaterialPreview: string | null;
  
  // Object placement
  selectedModelUrl: string | null;
  placementPreviewPosition: Vector3 | null;
  isPlacementValid: boolean;
  
  // UI state
  showObjectCatalog: boolean;
  showMaterialPicker: boolean;
  showMeasurements: boolean;
  
  // Error state
  error: string | null;
  
  // Actions
  setDeviceCapabilities: (capabilities: LiDARSupportResult) => void;
  
  // Session actions
  startSession: () => void;
  endSession: () => void;
  setScanning: (scanning: boolean) => void;
  setScanProgress: (progress: number) => void;
  setTrackingState: (state: TrackingStateResult) => void;
  
  // View & Tool actions
  setViewMode: (mode: ViewMode) => void;
  setTool: (tool: ARTool) => void;
  revertTool: () => void;
  
  // Measurement actions
  startMeasurement: (point: MeasurementPoint) => void;
  completeMeasurement: (endPoint: MeasurementPoint, result: MeasureResult) => void;
  cancelMeasurement: () => void;
  clearMeasurements: () => void;
  setMeasurementUnit: (unit: 'meters' | 'feet' | 'inches') => void;
  
  // Material actions
  selectMaterial: (url: string, previewUrl?: string) => void;
  clearMaterial: () => void;
  
  // Placement actions
  selectModel: (url: string) => void;
  setPlacementPreview: (position: Vector3 | null, isValid: boolean) => void;
  clearPlacement: () => void;
  
  // UI actions
  toggleObjectCatalog: (show?: boolean) => void;
  toggleMaterialPicker: (show?: boolean) => void;
  toggleMeasurements: (show?: boolean) => void;
  
  // Error actions
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Reset
  reset: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

const initialState = {
  deviceCapabilities: null,
  isSupported: null,
  isSessionActive: false,
  isScanning: false,
  scanProgress: 0,
  trackingState: null,
  viewMode: 'scan' as ViewMode,
  currentTool: 'none' as ARTool,
  previousTool: 'none' as ARTool,
  measurements: [],
  currentMeasurement: null,
  measurementPoints: [],
  measurementUnit: 'meters' as const,
  selectedMaterialUrl: null,
  selectedMaterialPreview: null,
  selectedModelUrl: null,
  placementPreviewPosition: null,
  isPlacementValid: false,
  showObjectCatalog: false,
  showMaterialPicker: false,
  showMeasurements: true,
  error: null,
};

export const useARStore = create<ARState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Device capabilities
      setDeviceCapabilities: (capabilities) => {
        set(
          {
            deviceCapabilities: capabilities,
            isSupported: capabilities.supportsLiDAR || capabilities.supportsDepth,
          },
          false,
          'setDeviceCapabilities'
        );
      },

      // Session actions
      startSession: () => {
        set({ isSessionActive: true, error: null }, false, 'startSession');
      },

      endSession: () => {
        set(
          {
            isSessionActive: false,
            isScanning: false,
            scanProgress: 0,
            currentMeasurement: null,
          },
          false,
          'endSession'
        );
      },

      setScanning: (scanning) => {
        set(
          {
            isScanning: scanning,
            scanProgress: scanning ? 0 : get().scanProgress,
          },
          false,
          'setScanning'
        );
      },

      setScanProgress: (progress) => {
        set({ scanProgress: progress }, false, 'setScanProgress');
      },

      setTrackingState: (state) => {
        set({ trackingState: state }, false, 'setTrackingState');
      },

      // View & Tool actions
      setViewMode: (mode) => {
        const toolMap: Record<ViewMode, ARTool> = {
          scan: 'scan',
          design: 'place',
          guide: 'none',
          measure: 'measure',
        };
        set(
          {
            viewMode: mode,
            currentTool: toolMap[mode],
            showObjectCatalog: mode === 'design',
            showMaterialPicker: false,
          },
          false,
          'setViewMode'
        );
      },

      setTool: (tool) => {
        set(
          (state) => ({
            previousTool: state.currentTool,
            currentTool: tool,
            showObjectCatalog: tool === 'place',
            showMaterialPicker: tool === 'paint',
          }),
          false,
          'setTool'
        );
      },

      revertTool: () => {
        set(
          (state) => ({
            currentTool: state.previousTool,
            previousTool: 'none',
          }),
          false,
          'revertTool'
        );
      },

      // Measurement actions
      startMeasurement: (point) => {
        const measurement: ActiveMeasurement = {
          id: `measure_${Date.now()}`,
          startPoint: point,
          unit: get().measurementUnit,
        };
        set(
          {
            currentMeasurement: measurement,
            measurementPoints: [point],
          },
          false,
          'startMeasurement'
        );
      },

      completeMeasurement: (endPoint, result) => {
        const current = get().currentMeasurement;
        if (!current) return;

        const completed: ActiveMeasurement = {
          ...current,
          endPoint,
          distance: result.distance,
        };

        set(
          (state) => ({
            measurements: [...state.measurements, completed],
            currentMeasurement: null,
            measurementPoints: [],
          }),
          false,
          'completeMeasurement'
        );
      },

      cancelMeasurement: () => {
        set(
          {
            currentMeasurement: null,
            measurementPoints: [],
          },
          false,
          'cancelMeasurement'
        );
      },

      clearMeasurements: () => {
        set({ measurements: [], currentMeasurement: null }, false, 'clearMeasurements');
      },

      setMeasurementUnit: (unit) => {
        set({ measurementUnit: unit }, false, 'setMeasurementUnit');
      },

      // Material actions
      selectMaterial: (url, previewUrl) => {
        set(
          {
            selectedMaterialUrl: url,
            selectedMaterialPreview: previewUrl || url,
          },
          false,
          'selectMaterial'
        );
      },

      clearMaterial: () => {
        set(
          {
            selectedMaterialUrl: null,
            selectedMaterialPreview: null,
          },
          false,
          'clearMaterial'
        );
      },

      // Placement actions
      selectModel: (url) => {
        set({ selectedModelUrl: url, currentTool: 'place' }, false, 'selectModel');
      },

      setPlacementPreview: (position, isValid) => {
        set(
          {
            placementPreviewPosition: position,
            isPlacementValid: isValid,
          },
          false,
          'setPlacementPreview'
        );
      },

      clearPlacement: () => {
        set(
          {
            selectedModelUrl: null,
            placementPreviewPosition: null,
            isPlacementValid: false,
          },
          false,
          'clearPlacement'
        );
      },

      // UI actions
      toggleObjectCatalog: (show) => {
        set(
          (state) => ({
            showObjectCatalog: show ?? !state.showObjectCatalog,
          }),
          false,
          'toggleObjectCatalog'
        );
      },

      toggleMaterialPicker: (show) => {
        set(
          (state) => ({
            showMaterialPicker: show ?? !state.showMaterialPicker,
          }),
          false,
          'toggleMaterialPicker'
        );
      },

      toggleMeasurements: (show) => {
        set(
          (state) => ({
            showMeasurements: show ?? !state.showMeasurements,
          }),
          false,
          'toggleMeasurements'
        );
      },

      // Error actions
      setError: (error) => {
        set({ error }, false, 'setError');
      },

      clearError: () => {
        set({ error: null }, false, 'clearError');
      },

      // Reset
      reset: () => {
        set(initialState, false, 'reset');
      },
    }),
    { name: 'ARStore' }
  )
);

export default useARStore;

