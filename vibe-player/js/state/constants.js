// vibe-player/js/state/constants.js
class Constants {
    static get AudioEngine() {
        return {
            PROCESSOR_SCRIPT_URL: 'js/player/rubberbandProcessor.js',
            PROCESSOR_NAME: 'rubberband-processor',
            WASM_BINARY_URL: 'lib/rubberband.wasm',
            LOADER_SCRIPT_URL: 'lib/rubberband-loader.js'
        };
    }

    static get VAD() {
        return {
            SAMPLE_RATE: 16000,
            DEFAULT_FRAME_SAMPLES: 1536,
            PROGRESS_REPORT_INTERVAL: 20,
            YIELD_INTERVAL: 5,
            // Default thresholds (can be overridden by AppState or UI)
            DEFAULT_POSITIVE_THRESHOLD: 0.5,
            DEFAULT_NEGATIVE_THRESHOLD: 0.35,
            // these were missing
            MIN_SPEECH_DURATION_MS: 200,
            SPEECH_PAD_MS: 50,
            REDEMPTION_FRAMES: 3
        };
    }

    static get UI() {
        return {
            // Example:
            // DEFAULT_JUMP_TIME_S: 5,
            // MAX_GAIN_VALUE: 5.0
            DEBOUNCE_HASH_UPDATE_MS: 500,
            SYNC_DEBOUNCE_WAIT_MS: 300
        };
    }

    /**
     * @description Configuration for high-fidelity auditory visualizers.
     * Implements an 8-layer MRSTFT stack mapped to 512 ERB bins.
     */
    static get Visualizer() {
        return {
            // Waveform configuration
            WAVEFORM_HEIGHT_SCALE: 0.8,
            WAVEFORM_COLOR_LOADING: '#888888',
            WAVEFORM_COLOR_DEFAULT: '#26828E',
            WAVEFORM_COLOR_SPEECH: '#FDE725',
            WAVEFORM_PROBES_PER_PIXEL: 64,

            // Spectrogram Engine (Forensic Pass)
            SPEC_ERB_BINS: 512,
            SPEC_TARGET_WIDTH: 2048,
            SPEC_RESOLUTIONS: [16384, 8192, 4096, 2048, 1024, 512, 256, 128],
            SPEC_GAMMATONE_ORDER: 4,
            SPEC_DB_FLOOR: -80, // Dynamic range floor in Decibels

            // Spectrogram Draft (Flash Pass)
            SPEC_DRAFT_COLS: 200,
            SPEC_DRAFT_BINS: 64,
            SPEC_DRAFT_FFT_SIZE: 1024
        };
    }

    static get URLHashKeys() {
        return {
            SPEED: 'speed',
            PITCH: 'pitch',
            GAIN: 'gain', // Assuming 'v' (volume) becomes 'gain'
            VAD_POSITIVE: 'vadPositive',
            VAD_NEGATIVE: 'vadNegative',
            AUDIO_URL: 'url',
            TIME: 'time' // For playback position
        };
    }

    static get DTMF() {
        return {
            SAMPLE_RATE: 16000,
            BLOCK_SIZE: 410
        };
    }
}

// Export for Node.js/CommonJS for testing, or attach to window/global for browser/other environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Constants;
} else if (typeof self !== 'undefined' && (typeof self.importScripts === 'function' || typeof self.postMessage === 'function')) {
    self.Constants = Constants;
} else if (typeof window !== 'undefined') {
    window.Constants = Constants;
} else if (typeof global !== 'undefined') {
    // Fallback for environments like Jest's JSDOM where 'global' is the window-like object
    global.Constants = Constants;
}
