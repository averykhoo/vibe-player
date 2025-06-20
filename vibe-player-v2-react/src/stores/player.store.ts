// vibe-player-v2-react/src/stores/player.store.ts
import { create } from 'zustand';
import type { PlayerState } from '@/types/player.types';

// The PlayerState interface (as confirmed from player.types.ts) does not include an 'actions' property.
// Thus, Omit<PlayerState, 'actions'> is equivalent to PlayerState here.
// This initialState is based on the structure of PlayerState.
const initialState: PlayerState = {
  status: 'idle', // Default status
  fileName: null,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  isPlayable: false,
  speed: 1.0,
  pitchShift: 0.0,
  gain: 1.0,
  waveformData: undefined, // Optional, so can be undefined
  error: null,
  audioBuffer: undefined, // Optional
  audioContextResumed: false, // Default to false
  channels: undefined, // Optional
  sampleRate: undefined, // Optional
  lastProcessedChunk: undefined, // Optional, and type is 'any'
};

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialState,
  // Services will use usePlayerStore.setState() for updates.
  // If specific actions are needed on the store itself later, they can be added here.
  // For example:
  // setSpeed: (speed: number) => set({ speed }),
  // setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  // setCurrentTime: (currentTime: number) => set({ currentTime }),
}));

// Example of persisting parts of the store to localStorage (currently commented out):
// import { persist, createJSONStorage } from 'zustand/middleware';
//
// export const usePlayerStore = create(
//   persist<PlayerState>(
//     (set, get) => ({
//       ...initialState,
//       // Define actions here if needed for the persisted store
//       // e.g., setSpeed: (speed) => set({ speed }),
//     }),
//     {
//       name: 'player-storage', // unique name for localStorage key
//       storage: createJSONStorage(() => localStorage),
//       partialize: (state) => ({
//         speed: state.speed,
//         gain: state.gain,
//         pitchShift: state.pitchShift
//       }), // Persist only these specific fields
//     }
//   )
// );
