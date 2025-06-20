// vibe-player-v2-react/src/types/analysis.types.ts
// vibe-player-v2/src/lib/types/analysis.types.ts
// Adjusted import path for Vite/React setup
import type { SileroVadProcessResultPayload } from "@/types/worker.types";

/**
 * @interface AnalysisState
 * @description Defines the shape of the state for audio analysis features,
 * including Voice Activity Detection (VAD) and spectrogram generation.
 */
export interface AnalysisState {
  // VAD related properties
  /** Current status message from the VAD service. */
  vadStatus?: string;
  /** The last received VAD processing result. */
  lastVadResult?: SileroVadProcessResultPayload | null;
  /** Flag indicating if speech is currently detected. */
  isSpeaking?: boolean;
  /** Flag indicating if the VAD state has been reset. */
  vadStateResetted?: boolean;
  /** Any error message from the VAD service. */
  vadError?: string | null;
  /** Flag indicating if the VAD service worker is initialized. */
  vadInitialized?: boolean;
  /** Threshold for positive speech detection in VAD. */
  vadPositiveThreshold?: number;
  /** Threshold for negative speech detection (hysteresis) in VAD. */
  vadNegativeThreshold?: number;

  // Spectrogram related properties
  /** Current status message from the Spectrogram service. */
  spectrogramStatus?: string;
  /** Any error message from the Spectrogram service. */
  spectrogramError?: string | null;
  /** Spectrogram data, typically an array of Float32Arrays representing frequency magnitudes over time. */
  spectrogramData?: Float32Array[] | null;
  /** Flag indicating if the Spectrogram service worker is initialized. */
  spectrogramInitialized?: boolean;

  // General analysis properties
  /** General loading indicator for analysis processes. */
  isLoading?: boolean;
}
