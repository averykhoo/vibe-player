// vibe-player-v2-react/src/stores/transcript.store.ts
import { create } from 'zustand';
import type { TranscriptState, TranscriptSegment } from '@/types/transcript.types';

const initialState: TranscriptState = {
  segments: [],
  isLoading: false,
  error: null,
  // activeSegmentId: null, // Example from prompt, not in TranscriptState by default
  // editMode: false,        // Example from prompt, not in TranscriptState by default
};

export const useTranscriptStore = create<TranscriptState>((set) => ({
  ...initialState,

  // Actions to manage transcript state
  setSegments: (segments: TranscriptSegment[]) => set({ segments, isLoading: false, error: null }),

  addSegment: (segment: TranscriptSegment) =>
    set((state) => ({ segments: [...state.segments, segment] })),

  updateSegment: (updatedSegment: TranscriptSegment) =>
    set((state) => ({
      segments: state.segments.map((segment) =>
        segment.id === updatedSegment.id ? { ...segment, ...updatedSegment } : segment // Ensure full update
      ),
    })),

  removeSegment: (segmentId: string) =>
    set((state) => ({
      segments: state.segments.filter((segment) => segment.id !== segmentId),
    })),

  setLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => set({ error, isLoading: false }),

  resetTranscript: () => set({ ...initialState }),
}));
