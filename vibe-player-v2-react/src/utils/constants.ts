// vibe-player-v2-react/src/utils/constants.ts
// vibe-player-v2/src/lib/utils/constants.ts

/**
 * @interface AudioEngineConstants
 * @description Defines constants related to the audio engine's Web Worker and processing parameters.
 */
export interface AudioEngineConstants {
  PROCESSOR_SCRIPT_URL: string;
  PROCESSOR_NAME: string;
  WASM_BINARY_URL: string;
  LOADER_SCRIPT_URL: string;
  PROCESS_LOOKAHEAD_TIME: number;
  TARGET_CHUNK_DURATION_S: number;
  MIN_CHUNK_DURATION_S: number;
  SCHEDULE_AHEAD_TIME_S: number;
  MAX_GAIN: number; // Added MAX_GAIN
}

/**
 * @const AUDIO_ENGINE_CONSTANTS
 * @description Actual values for audio engine constants.
 * URLs for WASM and loader scripts are relative to the public directory.
 */
export const AUDIO_ENGINE_CONSTANTS: AudioEngineConstants = {
  PROCESSOR_SCRIPT_URL: "js/player/rubberbandProcessor.js", // Path to the Rubberband processor script
  PROCESSOR_NAME: "rubberband-processor", // Name for the AudioWorkletProcessor
  WASM_BINARY_URL: "/vendor/rubberband/rubberband.wasm", // URL for the Rubberband WASM binary
  LOADER_SCRIPT_URL: "/vendor/rubberband/rubberband-loader.js", // URL for the Rubberband WASM loader script
  PROCESS_LOOKAHEAD_TIME: 0.1, // How far ahead (in seconds) the engine should check if it needs to process more audio
  TARGET_CHUNK_DURATION_S: 0.1, // Ideal duration (in seconds) of audio chunks to process
  MIN_CHUNK_DURATION_S: 0.001, // Minimum duration (in seconds) of an audio chunk to process, especially near the end of a file
  SCHEDULE_AHEAD_TIME_S: 0.05, // How far ahead (in seconds) to schedule processed audio chunks for playback
  MAX_GAIN: 3.0, // Added MAX_GAIN with a default value
};

/**
 * @interface VadConstants
 * @description Defines constants related to Voice Activity Detection (VAD).
 */
export interface VadConstants {
  SAMPLE_RATE: number;
  DEFAULT_FRAME_SAMPLES: number;
  PROGRESS_REPORT_INTERVAL: number;
  YIELD_INTERVAL: number;
  DEFAULT_POSITIVE_THRESHOLD: number;
  DEFAULT_NEGATIVE_THRESHOLD: number;
  ONNX_MODEL_URL: string;
}

/**
 * @const VAD_CONSTANTS
 * @description Actual values for VAD constants.
 * ONNX_MODEL_URL is relative to the public directory.
 */
export const VAD_CONSTANTS: VadConstants = {
  SAMPLE_RATE: 16000, // Sample rate required by the Silero VAD model
  DEFAULT_FRAME_SAMPLES: 1536, // Default number of samples per audio frame for VAD processing
  PROGRESS_REPORT_INTERVAL: 20, // Interval for reporting progress during VAD processing (e.g., every 20 frames)
  YIELD_INTERVAL: 5, // Interval for yielding to the main thread during intensive VAD processing (e.g., every 5 progress reports)
  DEFAULT_POSITIVE_THRESHOLD: 0.5, // Default threshold for considering a frame as speech
  DEFAULT_NEGATIVE_THRESHOLD: 0.35, // Default threshold for considering a frame as non-speech (used for hysteresis)
  ONNX_MODEL_URL: "/models/silero_vad.onnx", // URL for the Silero VAD ONNX model
};

/**
 * @interface UiConstants
 * @description Defines constants related to UI behavior, like debounce times.
 */
export interface UiConstants {
  DEBOUNCE_HASH_UPDATE_MS: number;
  SYNC_DEBOUNCE_WAIT_MS: number;
  URL_TIME_PRECISION: number;
}

/**
 * @const UI_CONSTANTS
 * @description Actual values for UI behavior constants.
 */
export const UI_CONSTANTS: UiConstants = {
  DEBOUNCE_HASH_UPDATE_MS: 500, // Debounce time (in ms) for updating URL hash parameters
  SYNC_DEBOUNCE_WAIT_MS: 300, // Debounce time (in ms) for synchronizing state changes
  URL_TIME_PRECISION: 2, // Number of decimal places for time values in URL hash
};

/**
 * @interface VisualizerConstants
 * @description Defines constants for audio visualizers (waveform and spectrogram).
 */
export interface VisualizerConstants {
  WAVEFORM_HEIGHT_SCALE: number;
  WAVEFORM_COLOR_LOADING: string;
  WAVEFORM_COLOR_DEFAULT: string;
  WAVEFORM_COLOR_SPEECH: string;
  SPEC_NORMAL_FFT_SIZE: number;
  SPEC_SHORT_FFT_SIZE: number;
  SPEC_SHORT_FILE_FFT_THRESHOLD_S: number;
  SPEC_MAX_FREQS: number[];
  SPEC_DEFAULT_MAX_FREQ_INDEX: number;
  SPEC_FIXED_WIDTH: number;
  SPEC_SHORT_FILE_HOP_THRESHOLD_S: number;
  SPEC_NORMAL_HOP_DIVISOR: number;
  SPEC_SHORT_HOP_DIVISOR: number;
  SPEC_CENTER_WINDOWS: boolean;
  FFT_WORKER_SCRIPT_URL: string;
}

/**
 * @const VISUALIZER_CONSTANTS
 * @description Actual values for visualizer constants.
 * FFT_WORKER_SCRIPT_URL is relative to the public directory.
 */
export const VISUALIZER_CONSTANTS: VisualizerConstants = {
  WAVEFORM_HEIGHT_SCALE: 0.8, // Scale factor for waveform amplitude display
  WAVEFORM_COLOR_LOADING: "#888888", // Color for waveform during loading
  WAVEFORM_COLOR_DEFAULT: "#26828E", // Default color for waveform
  WAVEFORM_COLOR_SPEECH: "#FDE725", // Color for speech segments in waveform (if VAD is used)
  SPEC_NORMAL_FFT_SIZE: 8192, // FFT size for normal spectrogram rendering
  SPEC_SHORT_FFT_SIZE: 2048, // FFT size for short files or segments in spectrogram
  SPEC_SHORT_FILE_FFT_THRESHOLD_S: 10.0, // File duration threshold (in seconds) to use short FFT size
  SPEC_MAX_FREQS: [5000, 16000], // Available maximum frequencies for spectrogram display
  SPEC_DEFAULT_MAX_FREQ_INDEX: 0, // Default index into SPEC_MAX_FREQS array
  SPEC_FIXED_WIDTH: 2048, // Fixed width for spectrogram display (if applicable)
  SPEC_SHORT_FILE_HOP_THRESHOLD_S: 5.0, // File duration threshold (in seconds) to use shorter hop size
  SPEC_NORMAL_HOP_DIVISOR: 4, // Hop size divisor (of FFT size) for normal spectrogram
  SPEC_SHORT_HOP_DIVISOR: 8, // Hop size divisor (of FFT size) for short files/segments
  SPEC_CENTER_WINDOWS: true, // Whether to center FFT windows
  FFT_WORKER_SCRIPT_URL: "/vendor/fft.js", // URL for the FFT utility script (used by spectrogram worker)
};

/**
 * @interface UrlHashKeys
 * @description Defines keys used for parameters in the URL hash/fragment.
 */
export interface UrlHashKeys {
  SPEED: string;
  PITCH: string;
  GAIN: string;
  VAD_POSITIVE: string;
  VAD_NEGATIVE: string;
  AUDIO_URL: string;
  TIME: string;

  // New keys for the orchestrator
  PLAYBACK_SPEED: string;
  PITCH_SHIFT: string;
  GAIN_LEVEL: string;
  LOOP_ACTIVE: string;
  LOOP_START: string;
  LOOP_END: string;
  CURRENT_TIME: string; // This will effectively override the old TIME for the new service
  DTMF_ENABLED: string;
  SPECTROGRAM_ENABLED: string;
}

/**
 * @const URL_HASH_KEYS
 * @description Actual key strings for URL hash parameters.
 * Includes both legacy keys and new, shorter keys for better URL compactness.
 */
export const URL_HASH_KEYS: UrlHashKeys = {
  // Legacy keys (can be phased out or mapped if needed)
  SPEED: "speed",
  PITCH: "pitch",
  GAIN: "gain",
  VAD_POSITIVE: "vadPositive",
  VAD_NEGATIVE: "vadNegative",
  AUDIO_URL: "url",
  TIME: "time", // Legacy key for current time

  // New, shorter keys for current application state
  PLAYBACK_SPEED: "s", // Current playback speed
  PITCH_SHIFT: "p", // Current pitch shift in semitones
  GAIN_LEVEL: "g", // Current gain level
  LOOP_ACTIVE: "la", // Boolean indicating if loop is active
  LOOP_START: "ls", // Loop start time in seconds
  LOOP_END: "le", // Loop end time in seconds
  CURRENT_TIME: "t", // Current playback time in seconds (overwrites legacy "time")
  DTMF_ENABLED: "de", // Boolean indicating if DTMF detection is enabled
  SPECTROGRAM_ENABLED: "se", // Boolean indicating if spectrogram is enabled
};

/**
 * @interface DtmfConstants
 * @description Defines constants related to DTMF (Dual-Tone Multi-Frequency) processing.
 */
export interface DtmfConstants {
  SAMPLE_RATE: number;
  BLOCK_SIZE: number;
}

/**
 * @const DTMF_CONSTANTS
 * @description Actual values for DTMF processing constants.
 */
export const DTMF_CONSTANTS: DtmfConstants = {
  SAMPLE_RATE: 16000, // Sample rate required for DTMF processing (Goertzel algorithm)
  BLOCK_SIZE: 410, // Block size for DTMF processing
};
