// vibe-player-v2-react/src/stores/analysis.store.ts
import { create } from 'zustand';
import type { AnalysisState as AnalysisStateType } from '@/types/analysis.types';

// Re-export the type
export type { AnalysisStateType as AnalysisState };

const initialState: AnalysisStateType = {
  vadStatus: "VAD service idle",
  lastVadResult: null,
  isSpeaking: false,
  vadStateResetted: false,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5, // Default from VAD_CONSTANTS
  vadNegativeThreshold: 0.35, // Default from VAD_CONSTANTS

  spectrogramStatus: "Spectrogram service idle",
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,

  isLoading: false,
};

export const useAnalysisStore = create<AnalysisStateType>(() => ({
  ...initialState,
  // Actions can be added here if needed, e.g.:
  // setVadStatus: (status: string) => set({ vadStatus: status }),
  // setSpectrogramData: (data: Float32Array[] | null) => set({ spectrogramData: data }),
}));
