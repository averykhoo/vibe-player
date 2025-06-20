// vibe-player-v2-react/src/types/worker.types.ts
// vibe-player-v2/src/lib/types/worker.types.ts

/**
 * @interface WorkerMessage
 * @template T - The type of the payload.
 * @description Defines the general structure for messages sent to and from Web Workers.
 */
export interface WorkerMessage<T = unknown> {
  /** The type of the message, used to determine how to handle it. */
  type: string;
  /** The actual data being sent with the message. */
  payload?: T;
  /** Optional error message or Error object if something went wrong. */
  error?: string | Error;
  /** Optional unique identifier for correlating requests and responses. */
  messageId?: string;
}

/**
 * @type WorkerPayload
 * @description A union type representing all possible specific payloads that can be part of a WorkerMessage.
 * This helps in type checking and handling different message payloads.
 */
export type WorkerPayload =
  | RubberbandInitPayload
  | RubberbandProcessPayload
  | RubberbandProcessResultPayload
  | RubberbandStatusPayload
  | RubberbandSetSpeedPayload
  | RubberbandSetPitchPayload
  | SileroVadInitPayload
  | SileroVadProcessPayload
  | SileroVadProcessResultPayload
  | SileroVadStatusPayload
  | SpectrogramInitPayload
  | SpectrogramProcessPayload
  | SpectrogramResultPayload
  | DtmfInitPayload
  | DtmfProcessPayload
  | DtmfResultPayload
  | WorkerErrorPayload
  | null; // Added null for messages that might not have a payload (e.g. INIT_SUCCESS)


// --- Rubberband Worker ---

/**
 * @const RB_WORKER_MSG_TYPE
 * @description Defines message types for communication with the Rubberband (time/pitch stretching) Web Worker.
 */
export const RB_WORKER_MSG_TYPE = {
  INIT: "rb_init",
  PROCESS: "rb_process",
  FLUSH: "rb_flush",
  RESET: "rb_reset",
  SET_PITCH: "rb_set_pitch",
  SET_SPEED: "rb_set_speed",
  INIT_SUCCESS: "rb_init_success",
  INIT_ERROR: "rb_init_error",
  PROCESS_RESULT: "rb_process_result",
  PROCESS_ERROR: "rb_process_error",
  FLUSH_RESULT: "rb_flush_result",
  STATUS: "rb_status",
  ERROR: "rb_error", // Added generic error type
};

/**
 * @interface RubberbandInitPayload
 * @description Payload for initializing the Rubberband worker.
 */
export interface RubberbandInitPayload {
  /** The WASM binary for Rubberband, loaded as an ArrayBuffer. */
  wasmBinary: ArrayBuffer;
  /** The JavaScript loader script text for Rubberband. */
  loaderScriptText: string;
  /** The origin of the main application, for resolving relative paths if needed by the worker. */
  origin: string;
  /** Sample rate of the audio to be processed. */
  sampleRate: number;
  /** Number of audio channels. */
  channels: number;
  /** Initial playback speed/time ratio. */
  initialSpeed: number;
  /** Initial pitch shift in semitones. */
  initialPitch: number;
}

/**
 * @interface RubberbandProcessPayload
 * @description Payload for sending audio data to Rubberband for processing.
 */
export interface RubberbandProcessPayload {
  /** Array of Float32Arrays, each representing a channel of input audio data. */
  inputBuffer: Float32Array[];
  /** Flag indicating if this is the final chunk of audio data. */
  isFinalChunk?: boolean; // Optional, but good for stream processing
}

/**
 * @interface RubberbandProcessResultPayload
 * @description Payload received from Rubberband worker after processing audio.
 */
export interface RubberbandProcessResultPayload {
  /** Array of Float32Arrays, each representing a channel of processed audio data. */
  outputBuffer: Float32Array[];
}

/**
 * @interface RubberbandStatusPayload
 * @description Payload for status updates from the Rubberband worker (e.g., progress).
 */
export interface RubberbandStatusPayload {
  /** Status message. */
  message: string;
  /** Optional progress value (0-1). */
  progress?: number;
}

/**
 * @interface RubberbandSetSpeedPayload
 * @description Payload for setting the playback speed of the Rubberband stretcher.
 */
export interface RubberbandSetSpeedPayload {
  speed: number;
}

/**
 * @interface RubberbandSetPitchPayload
 * @description Payload for setting the pitch scale of the Rubberband stretcher.
 */
export interface RubberbandSetPitchPayload {
  pitch: number; // In semitones
}


// --- Silero VAD Worker ---

/**
 * @const VAD_WORKER_MSG_TYPE
 * @description Defines message types for communication with the Silero VAD Web Worker.
 */
export const VAD_WORKER_MSG_TYPE = {
  INIT: "vad_init",
  PROCESS: "vad_process",
  RESET: "vad_reset",
  INIT_SUCCESS: "vad_init_success",
  INIT_ERROR: "vad_init_error",
  PROCESS_RESULT: "vad_process_result",
  PROCESS_ERROR: "vad_process_error",
  STATUS: "vad_status",
  ERROR: "vad_error", // Added generic error type
};

/**
 * @interface SileroVadInitPayload
 * @description Payload for initializing the Silero VAD worker.
 */
export interface SileroVadInitPayload {
  /** The origin of the main application. */
  origin: string;
  /** The ONNX model for Silero VAD, loaded as an ArrayBuffer. */
  modelBuffer: ArrayBuffer;
  /** Sample rate of the audio (e.g., 16000 Hz for Silero VAD). */
  sampleRate: number;
  /** Number of samples per audio frame processed by VAD. */
  frameSamples: number;
  /** Optional threshold for positive speech detection (0-1). */
  positiveThreshold?: number;
  /** Optional threshold for negative speech detection (hysteresis, 0-1). */
  negativeThreshold?: number;
}

/**
 * @interface SileroVadProcessPayload
 * @description Payload for sending an audio frame to Silero VAD for processing.
 */
export interface SileroVadProcessPayload {
  /** A single frame of audio data as a Float32Array. */
  audioFrame: Float32Array;
  /** Optional timestamp for this audio frame. */
  timestamp?: number;
}

/**
 * @interface SileroVadProcessResultPayload
 * @description Payload received from Silero VAD worker after processing an audio frame.
 */
export interface SileroVadProcessResultPayload {
  /** True if speech is detected in the frame, false otherwise. */
  isSpeech: boolean;
  /** Timestamp of the processed frame. */
  timestamp: number;
  /** Confidence score from the VAD model (0-1). */
  score: number;
  /** Optional: The original audio frame, if needed for further processing or debugging. */
  audioFrame?: Float32Array;
}

/**
 * @interface SileroVadStatusPayload
 * @description Payload for status updates from the Silero VAD worker.
 */
export interface SileroVadStatusPayload {
  /** Status message. */
  message: string;
}


// --- Spectrogram Worker ---

/**
 * @const SPEC_WORKER_MSG_TYPE
 * @description Defines message types for communication with the Spectrogram Web Worker.
 */
export const SPEC_WORKER_MSG_TYPE = {
  INIT: "spec_init",
  PROCESS: "spec_process",
  CONFIG_UPDATE: "spec_config_update",
  INIT_SUCCESS: "spec_init_success",
  INIT_ERROR: "spec_init_error",
  PROCESS_RESULT: "spec_process_result",
  PROCESS_ERROR: "spec_process_error",
  ERROR: "spec_error", // Added generic error type
};

/**
 * @interface SpectrogramInitPayload
 * @description Payload for initializing the Spectrogram worker.
 */
export interface SpectrogramInitPayload {
  /** The origin of the main application. */
  origin: string;
  /** The JavaScript FFT library script text. */
  fftScriptText: string;
  /** Sample rate of the audio. */
  sampleRate: number;
  /** FFT window size. */
  fftSize: number;
  /** Hop length between FFT windows. */
  hopLength: number;
}

/**
 * @interface SpectrogramProcessPayload
 * @description Payload for sending audio data to the Spectrogram worker.
 */
export interface SpectrogramProcessPayload {
  /** Full audio data as a Float32Array. */
  audioData: Float32Array;
}

/**
 * @interface SpectrogramResultPayload
 * @description Payload received from Spectrogram worker with processed data.
 */
export interface SpectrogramResultPayload {
  /** Array of Float32Arrays, where each inner array represents the magnitudes of frequency bins for a time window. */
  magnitudes: Float32Array[];
}

// --- DTMF Worker ---

/**
 * @const DTMF_WORKER_MSG_TYPE
 * @description Defines message types for communication with the DTMF Web Worker.
 */
export const DTMF_WORKER_MSG_TYPE = {
  INIT: "INIT", // Standardized to uppercase
  PROCESS: "PROCESS", // Standardized to uppercase
  INIT_COMPLETE: "INIT_COMPLETE", // Standardized
  RESULT: "RESULT", // Standardized
  ERROR: "ERROR", // Standardized
};

/**
 * @interface DtmfInitPayload
 * @description Payload for initializing the DTMF worker.
 */
export interface DtmfInitPayload {
  /** Sample rate of the audio to be processed. Note: DTMF worker often resamples/expects a fixed rate (e.g., 16kHz). */
  sampleRate: number;
}

/**
 * @interface DtmfProcessPayload
 * @description Payload for sending PCM audio data to the DTMF worker.
 */
export interface DtmfProcessPayload {
  /** Raw PCM audio data as a Float32Array. */
  pcmData: Float32Array;
}

/**
 * @interface DtmfResultPayload
 * @description Payload received from DTMF worker with detected tones.
 */
export interface DtmfResultPayload {
  /** Array of detected DTMF characters. */
  dtmf: string[];
  /** Array of detected Call Progress Tones (CPT), if implemented. */
  cpt: string[];
}

/**
 * @interface DtmfWorkerMessageDataIn
 * @description Defines the structure of messages sent TO the DTMF worker.
 * Extends WorkerMessage with specific payload types for DTMF operations.
 */
export interface DtmfWorkerMessageDataIn extends WorkerMessage {
  type: typeof DTMF_WORKER_MSG_TYPE.INIT | typeof DTMF_WORKER_MSG_TYPE.PROCESS;
  payload: DtmfInitPayload | DtmfProcessPayload;
}

/**
 * @interface DtmfWorkerMessageDataOut
 * @description Defines the structure of messages sent FROM the DTMF worker.
 * Extends WorkerMessage with specific payload types for DTMF results or errors.
 */
export interface DtmfWorkerMessageDataOut extends WorkerMessage {
  type: typeof DTMF_WORKER_MSG_TYPE.INIT_COMPLETE | typeof DTMF_WORKER_MSG_TYPE.RESULT | typeof DTMF_WORKER_MSG_TYPE.ERROR;
  payload?: DtmfResultPayload | string; // string for error messages
  error?: string; // Explicit error message string
}


// --- General Worker Error Payload ---

/**
 * @interface WorkerErrorPayload
 * @description A generic payload structure for sending error details from a worker.
 */
export interface WorkerErrorPayload {
  /** The error message. */
  message: string;
  /** Optional: The stack trace or other details. */
  stack?: string;
}
