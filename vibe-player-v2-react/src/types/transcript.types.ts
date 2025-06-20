// vibe-player-v2-react/src/types/transcript.types.ts
export interface TranscriptSegment {
  id: string; // Unique identifier for the segment
  startTime: number;
  endTime: number;
  text: string;
  speaker?: string; // Optional speaker label
  confidence?: number; // Optional confidence score
  // Add other relevant fields as needed, e.g., language
}

export interface TranscriptState {
  segments: TranscriptSegment[];
  isLoading: boolean;
  error: string | null;
  // Potentially other state related to transcript presentation or editing
  // For example:
  // activeSegmentId: string | null;
  // editMode: boolean;
}
