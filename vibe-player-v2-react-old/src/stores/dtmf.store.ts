// vibe-player-v2-react/src/stores/dtmf.store.ts
import { create } from 'zustand';
// Assuming DtmfState is defined in types or locally if not present in types
// Based on the svelte store, the type is local. Let's ensure it's included or moved.
// For now, reproduce locally, will adjust if types/dtmf.types.ts exists.
// Based on `ls vibe-player-v2/src/lib/types`, there isn't a dtmf.types.ts.

export interface DtmfState {
  status: "idle" | "processing" | "complete" | "error";
  dtmf: string[];
  cpt: string[]; // For Call Progress Tones
  error: string | null;
}

const initialState: DtmfState = {
  status: "idle",
  dtmf: [],
  cpt: [],
  error: null,
};

export const useDtmfStore = create<DtmfState>((set) => ({
  ...initialState,
}));
