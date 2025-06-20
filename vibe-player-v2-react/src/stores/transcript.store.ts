// vibe-player-v2-react/src/stores/transcript.store.ts
import { create } from 'zustand';
import type { TranscriptState as TranscriptStateType, TranscriptSegment as TranscriptSegmentType } from '@/types/transcript.types';

// Re-export types
export type { TranscriptStateType as TranscriptState };
export type { TranscriptSegmentType as TranscriptSegment };

const initialState: TranscriptStateType = {
  segments: [],
  isLoading: false,
  error: null,
  // activeSegmentId: null, // Example from prompt, not in TranscriptState by default
  // editMode: false,        // Example from prompt, not in TranscriptState by default
};

export const useTranscriptStore = create<TranscriptStateType>((set) => ({
  ...initialState,

  // Actions to manage transcript state
  setSegments: (segments: TranscriptSegmentType[]) => set({ segments, isLoading: false, error: null }),

  addSegment: (segment: TranscriptSegmentType) =>
    set((state) => ({ segments: [...state.segments, segment] })),

  updateSegment: (updatedSegment: TranscriptSegmentType) =>
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
