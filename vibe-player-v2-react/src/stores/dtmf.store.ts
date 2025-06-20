// vibe-player-v2-react/src/stores/dtmf.store.ts
import { create } from 'zustand';
import type { DtmfState as DtmfStateType } from '@/types/dtmf.types'; // Assuming DtmfState is in a new dtmf.types.ts

// Re-export the type for services that might import it from the store module
export type { DtmfStateType as DtmfState };

const initialState: DtmfStateType = {
  status: 'idle',
  dtmf: [], // This field will store the detected DTMF tones.
  cpt: [],
  error: null,
};

/**
 * @store useDtmfStore
 * @description Zustand store for managing DTMF (Dual-Tone Multi-Frequency) detection state.
 * This includes the status of DTMF processing, an array of detected DTMF tones (`dtmf`),
 * an array for Call Progress Tones (`cpt`), and any processing errors.
 *
 * @property {DtmfStateType['status']} status - Current status of DTMF processing.
 * @property {string[]} dtmf - Array of detected DTMF characters/tones.
 * @property {string[]} cpt - Array of detected Call Progress Tones (currently not implemented).
 * @property {string | null} error - Error message if DTMF processing fails.
 *
 * @action setStatus - Sets the processing status.
 * @action setResults - Sets the detected DTMF and CPT results and updates status to 'complete'.
 * @action setError - Sets an error message and updates status to 'error'.
 * @action reset - Resets the store to its initial state.
 */
export const useDtmfStore = create<DtmfStateType>((set) => ({
  ...initialState,
  setStatus: (status: DtmfStateType['status']) => set({ status }),
  setResults: (results: { dtmf: string[]; cpt: string[] }) =>
    set({ dtmf: results.dtmf, cpt: results.cpt, status: 'complete', error: null }),
  setError: (error: string | null) =>
    set({ error, status: 'error', dtmf: [], cpt: [] }), // Clear tones on error
  reset: () => set(initialState),
}));
