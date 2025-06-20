// vibe-player-v2-react/src/stores/status.store.ts
import { create } from 'zustand';
import type { StatusState } from '../types/status.types'; // Adjust path as needed

const initialState: StatusState = {
  message: null,
  type: null,
  isLoading: false,
  details: null,
  progress: null,
};

export const useStatusStore = create<StatusState>((set) => ({
  ...initialState,
}));
