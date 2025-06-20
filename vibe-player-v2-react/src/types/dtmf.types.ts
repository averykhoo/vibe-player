// vibe-player-v2-react/src/types/dtmf.types.ts

/**
 * @interface DtmfState
 * @description Defines the shape of the state for DTMF (Dual-Tone Multi-Frequency) detection.
 */
export interface DtmfState {
  /** Current status of DTMF processing ('idle', 'initializing', 'processing', 'complete', 'error'). */
  status: 'idle' | 'initializing' | 'processing' | 'complete' | 'error';
  /** Array of detected DTMF characters/tones. This is the primary field for displaying detected tones. */
  dtmf: string[];
  /** Array of detected Call Progress Tones (CPT), if implemented. (Currently not used but placeholder for future). */
  cpt: string[];
  /** Any error message related to DTMF processing. */
  error: string | null;
}
