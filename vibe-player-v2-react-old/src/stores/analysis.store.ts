// vibe-player-v2-react/src/stores/analysis.store.ts
import { create } from 'zustand';
import type { AnalysisState } from '../types/analysis.types'; // Adjust path as needed

const initialState: AnalysisState = {
  vadStatus: undefined,
  lastVadResult: null,
  isSpeaking: undefined,
  vadStateResetted: undefined,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5,
  vadNegativeThreshold: 0.35,

  spectrogramStatus: undefined,
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,

  isLoading: false,
};

export const useAnalysisStore = create<AnalysisState>((set) => ({
  ...initialState,
}));
