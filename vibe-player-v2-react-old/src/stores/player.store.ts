// vibe-player-v2-react/src/stores/player.store.ts
import { create } from 'zustand';
import type { PlayerState } from '../types/player.types'; // Adjust path as needed

// Note: In Svelte, PlayerState included actions.
// In Zustand, actions are part of the create function or can be defined separately.
// For this migration, we'll use the Omit approach from the example if PlayerState had actions,
// or just use PlayerState if it purely represented state.
// From the read file, PlayerState does not have actions, it's a pure state type.

const initialState: PlayerState = {
  status: "idle",
  fileName: null,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  isPlayable: false,
  speed: 1.0,
  pitchShift: 0.0,
  gain: 1.0,
  waveformData: undefined,
  error: null,
  audioBuffer: undefined,
  audioContextResumed: false,
  channels: undefined,
  sampleRate: undefined,
  lastProcessedChunk: undefined,
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,
  // Example action, if needed later:
  // setSpeed: (speed) => set({ speed }),
  // If actions are defined directly in services that call usePlayerStore.setState(),
  // then no explicit actions need to be defined here.
  // For now, we'll keep it simple and services will use setState.
}));
