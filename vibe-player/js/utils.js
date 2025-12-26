// --- /vibe-player/js/utils.js ---
// General utility functions for the Vibe Player application.

/** @namespace AudioApp */
var AudioApp = AudioApp || {}; // Ensure main namespace exists

/**
 * @namespace AudioApp.Utils
 * @description Provides utility functions for auditory scales, windowing, and rendering.
 */
AudioApp.Utils = (function () {
    'use strict';

    /**
     * Formats time in seconds to a mm:ss string.
     * @param {number} sec - Time in seconds.
     * @returns {string} Formatted time string (e.g., "0:00", "1:23").
     */
    function formatTime(sec) {
        if (isNaN(sec) || sec < 0) sec = 0;
        const minutes = Math.floor(sec / 60);
        const seconds = Math.floor(sec % 60);
        return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
    }

    /**
     * Helper function to yield control back to the main event loop.
     * Uses `setTimeout(resolve, 0)` inside a Promise.
     * @async
     * @returns {Promise<void>} Resolves on the next tick, allowing other microtasks/macrotasks to run.
     */
    async function yieldToMainThread() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    /**
     * Generates a Hann window array for FFT.
     * The Hann window is a taper function used to reduce spectral leakage in FFT processing.
     * @param {number} length - The desired window length (number of samples). Must be a positive integer.
     * @returns {number[]|null} The Hann window array of the specified length, or null if length is invalid.
     * Each element is a float between 0 and 1.
     */
    function hannWindow(length) {
        if (length <= 0 || !Number.isInteger(length)) {
            console.error("Utils.hannWindow: Length must be a positive integer.");
            return null;
        }
        /** @type {number[]} */
        let windowArr = new Float32Array(length);
        if (length === 1) {
            windowArr[0] = 1; // Single point window is 1
            return windowArr;
        }
        const denom = length - 1; // Denominator for the cosine argument
        for (let i = 0; i < length; i++) {
            windowArr[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
        }
        return windowArr;
    }

    /**
     * Calculates the Coherent Gain (sum of coefficients) of a window.
     * Used to normalize energy across different FFT window sizes.
     */
    function getWindowSum(windowArr) {
        let sum = 0;
        for (let i = 0; i < windowArr.length; i++) sum += windowArr[i];
        return sum;
    }

    /**
     * Glasberg & Moore: Frequency (Hz) to Auditory Scale (Cams).
     */
    function freqToCam(freq) {
        return 21.4 * Math.log10(0.00437 * freq + 1);
    }

    /**
     * Glasberg & Moore: Auditory Scale (Cams) to Frequency (Hz).
     */
    function camToFreq(cam) {
        return (Math.pow(10, cam / 21.4) - 1) / 0.00437;
    }

    /**
     * Calculates the ERB (Equivalent Rectangular Bandwidth) in Hz for a given frequency.
     */
    function getERBWidth(fc) {
        return 24.7 * (0.00437 * fc + 1);
    }

    /**
     * Calculates the magnitude response of a 4th-order Gammatone filter.
     * @param {number} f - The frequency to evaluate.
     * @param {number} fc - Center frequency of the filter.
     * @param {number} erbWidth - The ERB width at fc.
     * @param {number} n - The filter order (default 4).
     */
    function gammatoneMagnitude(f, fc, erbWidth, n = 4) {
        // Slaney's correction factor for 4th order Gammatone filter
        const b = erbWidth / 1.019;
        const diff = f - fc;
        return Math.pow(1 + (diff * diff) / (b * b), -n / 2);
    }

    /**
     * Viridis colormap function. Maps a normalized value (0 to 1) to an RGB color.
     * The Viridis colormap is designed to be perceptually uniform.
     * @param {number} t - Normalized value (0 to 1). Values outside this range will be clamped.
     * @returns {number[]} Array containing [r, g, b] values (each 0-255).
     */
    function viridisColor(t) {
        /** @type {Array<Array<number>>} Colormap definition: [value, r, g, b] */
        const colors = [ // [normalized_value, R, G, B]
            [0.0, 68, 1, 84], [0.1, 72, 40, 120], [0.2, 62, 74, 137], [0.3, 49, 104, 142],
            [0.4, 38, 130, 142], [0.5, 31, 155, 137], [0.6, 53, 178, 126], [0.7, 109, 199, 104],
            [0.8, 170, 217, 70], [0.9, 235, 231, 35], [1.0, 253, 231, 37]
        ];
        t = Math.max(0, Math.min(1, t)); // Clamp t to [0, 1]

        /** @type {Array<number>} */ let c1 = colors[0];
        /** @type {Array<number>} */ let c2 = colors[colors.length - 1];

        for (let i = 0; i < colors.length - 1; i++) {
            if (t >= colors[i][0] && t <= colors[i + 1][0]) {
                c1 = colors[i];
                c2 = colors[i + 1];
                break;
            }
        }

        const range = c2[0] - c1[0];
        const ratio = (range === 0) ? 0 : (t - c1[0]) / range; // Avoid division by zero

        const r = Math.round(c1[1] + ratio * (c2[1] - c1[1]));
        const g = Math.round(c1[2] + ratio * (c2[2] - c1[2]));
        const b = Math.round(c1[3] + ratio * (c2[3] - c1[3]));
        return [r, g, b];
    }


    /**
     * Returns a function, that, as long as it continues to be invoked, will not
     * be triggered. The function will be called after it stops being called for
     * N milliseconds. If `immediate` is passed, trigger the function on the
     * leading edge, instead of the trailing.
     *
     * @template {Function} F
     * @param {F} func - The function to debounce.
     * @param {number} wait - The number of milliseconds to delay before invoking the function.
     * @param {boolean} [immediate=false] - If true, trigger the function on the leading edge instead of the trailing.
     * @returns {(...args: Parameters<F>) => void} The new debounced function.
     */
    function debounce(func, wait, immediate = false) {
        /** @type {number | undefined | null} */
        let timeout;
        // Using 'function' syntax for 'this' and 'arguments'
        return function executedFunction() {
            const context = this;
            const args = arguments; // arguments is not typed with ...args in JSDoc well

            const later = function () {
                timeout = null;
                if (!immediate) {
                    func.apply(context, args);
                }
            };

            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);

            if (callNow) {
                func.apply(context, args);
            }
        };
    }

    return {
        formatTime,
        yieldToMainThread,
        hannWindow,
        getWindowSum,
        freqToCam,
        camToFreq,
        getERBWidth,
        gammatoneMagnitude,
        viridisColor,
        debounce
    };

})(); // End of AudioApp.Utils IIFE
// --- /vibe-player/js/utils.js ---
