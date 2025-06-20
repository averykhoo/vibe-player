// vibe-player-v2-react/src/types/transcript.types.ts

/**
 * @interface TranscriptSegment
 * @description Defines the structure for a single segment of an audio transcript.
 * Each segment represents a piece of text spoken within a specific time range.
 */
export interface TranscriptSegment {
  /** Unique identifier for the segment (e.g., UUID). */
  id: string;
  /** Start time of the segment in seconds from the beginning of the audio. */
  startTime: number;
  /** End time of the segment in seconds from the beginning of the audio. */
  endTime: number;
  /** The transcribed text for this segment. */
  text: string;
  /** Optional identifier for the speaker of this segment. */
  speaker?: string;
  /** Optional confidence score (0-1) for the transcription accuracy of this segment. */
  confidence?: number;
  // Consider adding language if multilingual transcripts are possible:
  // language?: string;
}

/**
 * @interface TranscriptState
 * @description Defines the shape of the state for managing audio transcripts.
 * This includes the list of segments, loading status, and any errors.
 */
export interface TranscriptState {
  /** Array of transcript segments that make up the full transcript. */
  segments: TranscriptSegment[];
  /** True if the transcript is currently being loaded or processed. */
  isLoading: boolean;
  /** Any error message related to loading or processing the transcript. */
  error: string | null;

  // Examples of additional state properties that might be useful for transcript features:
  /** ID of the currently active or focused transcript segment, for UI interaction. */
  // activeSegmentId?: string | null;
  /** Flag to indicate if the transcript is in an editable mode. */
  // editMode?: boolean;
}
