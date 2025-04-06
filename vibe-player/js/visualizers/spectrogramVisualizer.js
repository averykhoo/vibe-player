// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
// Handles drawing the Spectrogram visualization to a canvas element.
// Adapted for multi-track use by accepting element IDs and managing state per instance.

var AudioApp = AudioApp || {}; // Ensure namespace exists

// Design Decision: Use IIFE, pass the global FFT constructor dependency.
AudioApp.spectrogramVisualizer = (function (globalFFT) {
    'use strict';

    // === Dependency Checks ===
    if (typeof globalFFT === 'undefined') {
        console.error("SpectrogramVisualizer: CRITICAL - FFT library constructor not found globally!");
        // Return non-functional interface matching the expected public methods
        return {
            init: () => {
            }, computeAndDrawSpectrogram: () => Promise.resolve(), resizeAndRedraw: () => {
            }, updateProgressIndicator: () => {
            }, clearVisuals: () => {
            }, showSpinner: () => {
            }
        };
    }
    // Check for other dependencies within init/functions where needed

    // === Constants (Local fallback if global not found) ===
    const FALLBACK_SPEC_SHORT_FFT_THRESHOLD_S = 10.0;
    const FALLBACK_SPEC_NORMAL_FFT_SIZE = 8192;
    const FALLBACK_SPEC_SHORT_FFT_SIZE = 2048;
    const FALLBACK_SPEC_FIXED_WIDTH = 2048;
    const FALLBACK_SPEC_SHORT_FILE_HOP_THRESHOLD_S = 5.0;
    const FALLBACK_SPEC_NORMAL_HOP_DIVISOR = 4;
    const FALLBACK_SPEC_SHORT_HOP_DIVISOR = 8;
    const FALLBACK_SPEC_CENTER_WINDOWS = true;
    const FALLBACK_SPEC_MAX_FREQ = 12000;


    // === DOM Element References (Instance-specific) ===
    /** @type {HTMLCanvasElement|null} */ let spectrogramCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */ let spectrogramCtx = null;
    /** @type {HTMLSpanElement|null} */ let spectrogramSpinner = null;
    /** @type {HTMLDivElement|null} */ let spectrogramProgressIndicator = null;

    // === State (Instance-specific) ===
    /** @type {string} ID suffix for elements ('_left', '_right') */
    let elementSuffix = '';
    /** @type {string|null} ID of the canvas element */
    let canvasId = null;
    /** @type {string|null} ID of the spinner element */
    let spinnerId = null;
    /** @type {string|null} ID of the progress indicator element */
    let indicatorId = null;
    /** @type {HTMLCanvasElement|null} Offscreen cache for this instance's spectrogram */
    let cachedSpectrogramCanvas = null;
    /** @type {number} Cached audio duration */
    let cachedAudioDuration = 0;
    /** @type {boolean} Flag to track if computation is in progress */
    let isComputing = false;


    // === Initialization ===

    /**
     * Initializes the Spectrogram Visualizer instance for specific elements.
     * @param {object} config - Configuration object.
     * @param {string} config.canvasId - The DOM ID of the canvas element.
     * @param {string} config.spinnerId - The DOM ID of the loading spinner span.
     * @param {string} config.indicatorId - The DOM ID of the progress indicator div.
     * @public
     */
    function init(config) {
        if (!config || !config.canvasId || !config.spinnerId || !config.indicatorId) {
            console.error("SpectrogramVisualizer: Initialization failed - Missing canvasId, spinnerId, or indicatorId in config.");
            return;
        }
        canvasId = config.canvasId;
        spinnerId = config.spinnerId;
        indicatorId = config.indicatorId;
        elementSuffix = canvasId.includes('_right') ? '_right' : '_left';

        console.log(`SpectrogramVisualizer (${elementSuffix}): Initializing for canvas #${canvasId}...`);

        // Dependency check
        if (!AudioApp.Constants || !AudioApp.Utils) {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Constants or Utils not found on AudioApp namespace. Using fallbacks.`);
        }

        assignDOMElements();

        if (spectrogramCanvas && spectrogramCtx) {
            spectrogramCanvas.addEventListener('click', handleCanvasClick);
            console.log(`SpectrogramVisualizer (${elementSuffix}): Canvas found and listener added.`);
        } else {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Spectrogram canvas (#${canvasId}) or context not found.`);
        }
        if (!spectrogramSpinner) {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Spinner (#${spinnerId}) not found.`);
        }
        if (!spectrogramProgressIndicator) {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Progress indicator (#${indicatorId}) not found.`);
        }

        console.log(`SpectrogramVisualizer (${elementSuffix}): Initialized.`);
    }

    /**
     * Gets references to instance-specific DOM elements using stored IDs.
     * @private
     */
    function assignDOMElements() {
        if (!canvasId || !spinnerId || !indicatorId) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Cannot assign DOM elements - IDs missing.`);
            return;
        }
        spectrogramCanvas = document.getElementById(canvasId);
        spectrogramSpinner = document.getElementById(spinnerId);
        spectrogramProgressIndicator = document.getElementById(indicatorId);
        if (spectrogramCanvas) {
            spectrogramCtx = spectrogramCanvas.getContext('2d');
            if (!spectrogramCtx) {
                console.error(`SpectrogramVisualizer (${elementSuffix}): Failed to get 2D context for canvas #${canvasId}.`);
            }
        }
    }

    // === Event Handlers ===

    /**
     * Handles click events on the spectrogram canvas for seeking.
     * Dispatches 'audioapp:seekRequested'.
     * @param {MouseEvent} e - The click event.
     * @private
     */
    function handleCanvasClick(e) {
        // ... (Implementation unchanged, but includes sourceCanvasId) ...
        if (!spectrogramCanvas) return;
        const rect = spectrogramCanvas.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const clickXRelative = e.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', {
            detail: {fraction: fraction, sourceCanvasId: canvasId} // Include source ID
        }));
    }

    // === Core Drawing & Computation ===

    /**
     * Computes and draws the spectrogram for the given audio buffer.
     * @param {AudioBuffer} audioBuffer - The original, decoded audio buffer.
     * @returns {Promise<void>} Resolves when async drawing is complete.
     * @public
     */
    async function computeAndDrawSpectrogram(audioBuffer) {
        // Ensure instance is initialized
        if (!spectrogramCtx || !spectrogramCanvas || isComputing) {
            if (isComputing) console.warn(`SpectrogramVisualizer (${elementSuffix}): Already computing, ignoring request.`);
            else console.warn(`SpectrogramVisualizer (${elementSuffix}): Cannot draw - Canvas context/element missing.`);
            return;
        }
        if (!audioBuffer) {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): AudioBuffer missing, clearing visuals.`);
            clearVisuals(); // Clear if no buffer
            return;
        }

        // Dependency check
        const Constants = AudioApp.Constants;
        const Utils = AudioApp.Utils;
        if (!Constants || !Utils) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Dependencies (Constants, Utils) not loaded.`);
            return;
        }

        console.log(`SpectrogramVisualizer (${elementSuffix}): Starting computation and drawing...`);
        isComputing = true;
        const startTime = performance.now();

        clearVisualsInternal(); // Clear canvas before drawing
        resizeCanvasInternal(); // Ensure correct size

        // Clear cache for this instance and show its spinner
        cachedSpectrogramCanvas = null;
        showSpinner(true);

        console.time(`Spectrogram compute (${elementSuffix})`);
        const specShortFileThreshold = Constants?.SPEC_SHORT_FILE_FFT_THRESHOLD_S ?? FALLBACK_SPEC_SHORT_FFT_THRESHOLD_S;
        const specShortSize = Constants?.SPEC_SHORT_FFT_SIZE ?? FALLBACK_SPEC_SHORT_FFT_SIZE;
        const specNormalSize = Constants?.SPEC_NORMAL_FFT_SIZE ?? FALLBACK_SPEC_NORMAL_FFT_SIZE;
        const specFixedWidth = Constants?.SPEC_FIXED_WIDTH ?? FALLBACK_SPEC_FIXED_WIDTH;

        const actualFftSize = audioBuffer.duration < specShortFileThreshold ? specShortSize : specNormalSize;
        console.log(`SpectrogramVisualizer (${elementSuffix}): Using FFT Size: ${actualFftSize} for duration ${audioBuffer.duration.toFixed(2)}s`);
        const spectrogramData = computeSpectrogramInternal(audioBuffer, actualFftSize, specFixedWidth);
        console.timeEnd(`Spectrogram compute (${elementSuffix})`);

        // Cache duration
        cachedAudioDuration = audioBuffer.duration;

        if (spectrogramData && spectrogramData.length > 0) {
            console.time(`Spectrogram draw async (${elementSuffix})`);
            try {
                // Draw asynchronously to offscreen cache, then display
                await drawSpectrogramAsyncInternal(spectrogramData, audioBuffer.sampleRate, actualFftSize);
                console.timeEnd(`Spectrogram draw async (${elementSuffix})`);
            } catch (error) {
                console.error(`SpectrogramVisualizer (${elementSuffix}): Error drawing spectrogram asynchronously -`, error);
                if (spectrogramCtx && spectrogramCanvas) { // Check context again just in case
                    spectrogramCtx.fillStyle = '#D32F2F';
                    spectrogramCtx.textAlign = 'center';
                    spectrogramCtx.font = '14px sans-serif';
                    spectrogramCtx.fillText(`Spectrogram Error: ${error.message}`, spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);
                }
            } finally {
                showSpinner(false); // Hide instance spinner
                isComputing = false;
            }
        } else {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Spectrogram computation yielded no data or failed.`);
            if (spectrogramCtx && spectrogramCanvas) {
                spectrogramCtx.fillStyle = '#888';
                spectrogramCtx.textAlign = 'center';
                spectrogramCtx.font = '12px sans-serif';
                spectrogramCtx.fillText("Could not compute spectrogram", spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);
            }
            showSpinner(false);
            isComputing = false;
        }

        const endTime = performance.now();
        console.log(`SpectrogramVisualizer (${elementSuffix}): Processing took ${((endTime - startTime) / 1000).toFixed(2)}s.`);
        updateProgressIndicator(0, 0, cachedAudioDuration); // Reset progress indicator
    }

    // --- Computation Helper Functions ---

    /**
     * Computes spectrogram data using FFT.js. (Internal logic mostly unchanged).
     * Relies on AudioApp.Constants and AudioApp.Utils (accessed via namespace).
     * @param {AudioBuffer} buffer
     * @param {number} actualFftSize
     * @param {number} targetSlices
     * @returns {Array<Float32Array>|null} Array of magnitude arrays or null on error.
     * @private
     */
    function computeSpectrogramInternal(buffer, actualFftSize, targetSlices) {
        // Access fresh dependency refs
        const Constants = AudioApp.Constants;
        const Utils = AudioApp.Utils;
        if (!Constants || !Utils) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Compute error - Constants or Utils not loaded.`);
            return null;
        }
        if (!buffer?.getChannelData) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Invalid AudioBuffer`);
            return null;
        }
        if ((actualFftSize & (actualFftSize - 1)) !== 0 || actualFftSize <= 1) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Invalid FFT size: ${actualFftSize}`);
            return null;
        }

        const channelData = buffer.getChannelData(0);
        const totalSamples = channelData.length;
        const duration = buffer.duration;

        // Use fallbacks if Constants missing
        const hopThreshold = Constants?.SPEC_SHORT_FILE_HOP_THRESHOLD_S ?? FALLBACK_SPEC_SHORT_FILE_HOP_THRESHOLD_S;
        const shortHopDivisor = Constants?.SPEC_SHORT_HOP_DIVISOR ?? FALLBACK_SPEC_SHORT_HOP_DIVISOR;
        const normalHopDivisor = Constants?.SPEC_NORMAL_HOP_DIVISOR ?? FALLBACK_SPEC_NORMAL_HOP_DIVISOR;
        const centerWindows = Constants?.SPEC_CENTER_WINDOWS ?? FALLBACK_SPEC_CENTER_WINDOWS;

        const hopDivisor = duration < hopThreshold ? shortHopDivisor : normalHopDivisor;
        const hopSize = Math.max(1, Math.floor(actualFftSize / hopDivisor));

        const padding = centerWindows ? Math.floor(actualFftSize / 2) : 0;
        const rawSliceCount = centerWindows
            ? Math.ceil(totalSamples / hopSize)
            : (totalSamples < actualFftSize ? 0 : Math.floor((totalSamples - actualFftSize) / hopSize) + 1);

        if (rawSliceCount <= 0) {
            console.warn(`SpectrogramVisualizer (${elementSuffix}): Not enough audio samples for FFT.`);
            return [];
        }

        const fftInstance = new globalFFT(actualFftSize);
        const complexBuffer = fftInstance.createComplexArray();
        const fftInput = new Array(actualFftSize);
        const windowFunc = Utils.hannWindow(actualFftSize); // Use Utils
        if (!windowFunc) {
            console.error(`SpectrogramVisualizer (${elementSuffix}): Failed to create Hann window.`);
            return null;
        }

        const rawSpec = [];
        // ... (FFT calculation loop - unchanged logic) ...
        for (let i = 0; i < rawSliceCount; i++) {
            const windowCenterSample = i * hopSize;
            const windowFetchStart = windowCenterSample - padding;
            for (let j = 0; j < actualFftSize; j++) {
                const sampleIndex = windowFetchStart + j;
                let sampleValue;
                if (sampleIndex < 0) {
                    sampleValue = channelData[0];
                } else if (sampleIndex >= totalSamples) {
                    sampleValue = totalSamples > 0 ? channelData[totalSamples - 1] : 0.0;
                } else {
                    sampleValue = channelData[sampleIndex];
                }
                fftInput[j] = sampleValue * windowFunc[j];
            }
            fftInstance.realTransform(complexBuffer, fftInput);
            const numBins = actualFftSize / 2;
            const magnitudes = new Float32Array(numBins);
            for (let k = 0; k < numBins; k++) {
                const re = complexBuffer[k * 2];
                const im = complexBuffer[k * 2 + 1];
                const magSq = (re * re + im * im);
                magnitudes[k] = Math.sqrt(magSq > 0 ? magSq : 0);
            }
            rawSpec.push(magnitudes);
        }

        // --- Resample/Interpolate Slices (unchanged logic) ---
        const numRawSlices = rawSpec.length;
        if (numRawSlices === 0) return [];
        const numFreqBins = rawSpec[0].length;
        const finalSpec = new Array(targetSlices);
        if (numRawSlices === targetSlices) {
            for (let i = 0; i < numRawSlices; i++) {
                finalSpec[i] = rawSpec[i];
            }
        } else if (numRawSlices > 0) {
            for (let i = 0; i < targetSlices; i++) {
                const rawPos = (numRawSlices > 1) ? (i / (targetSlices - 1)) * (numRawSlices - 1) : 0;
                const index1 = Math.floor(rawPos);
                const index2 = Math.min(numRawSlices - 1, Math.ceil(rawPos));
                const factor = rawPos - index1;
                const magnitudes1 = rawSpec[index1];
                const magnitudes2 = rawSpec[index2];
                finalSpec[i] = new Float32Array(numFreqBins);
                if (index1 === index2 || factor === 0) {
                    finalSpec[i].set(magnitudes1);
                } else {
                    for (let k = 0; k < numFreqBins; k++) {
                        finalSpec[i][k] = magnitudes1[k] * (1.0 - factor) + magnitudes2[k] * factor;
                    }
                }
            }
        }
        return finalSpec;
    }

    // --- Drawing Helper Functions ---

    /**
     * Draws the spectrogram asynchronously to this instance's offscreen cache, then to the visible canvas.
     * @param {Array<Float32Array>} spectrogramData
     * @param {number} sampleRate
     * @param {number} actualFftSize
     * @returns {Promise<void>}
     * @private
     */
    function drawSpectrogramAsyncInternal(spectrogramData, sampleRate, actualFftSize) {
        // Uses instance variables: spectrogramCanvas, spectrogramCtx, cachedSpectrogramCanvas
        return new Promise((resolve, reject) => {
            // Check dependencies and instance state
            const Constants = AudioApp.Constants;
            const Utils = AudioApp.Utils;
            if (!spectrogramCanvas || !spectrogramCtx || !spectrogramData?.[0] || !Constants || !Utils) {
                console.warn(`SpectrogramVisualizer (${elementSuffix}): Missing canvas, data, Constants or Utils for async draw.`);
                return reject(new Error(`Missing dependencies for async draw (${elementSuffix})`));
            }

            // Clear display canvas and set black background
            spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectrogramCtx.fillStyle = '#000';
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);

            // Create/reuse *instance-specific* offscreen cache canvas
            const dataWidth = spectrogramData.length; // Should match targetSlices (e.g., SPEC_FIXED_WIDTH)
            const displayHeight = spectrogramCanvas.height;
            // Ensure cache exists and has correct dimensions
            if (!cachedSpectrogramCanvas || cachedSpectrogramCanvas.width !== dataWidth || cachedSpectrogramCanvas.height !== displayHeight) {
                console.log(`SpectrogramVisualizer (${elementSuffix}): Creating/Resizing cache canvas (${dataWidth}x${displayHeight})...`);
                cachedSpectrogramCanvas = document.createElement('canvas');
                cachedSpectrogramCanvas.width = dataWidth;
                cachedSpectrogramCanvas.height = displayHeight;
            }
            const offCtx = cachedSpectrogramCanvas.getContext('2d', {willReadFrequently: false});
            if (!offCtx) return reject(new Error(`Could not get 2D context for offscreen spectrogram (${elementSuffix})`));

            const computedSlices = dataWidth;
            const height = displayHeight;
            const numBins = actualFftSize / 2;
            const nyquist = sampleRate / 2;
            const maxFreq = Constants?.SPEC_MAX_FREQ ?? FALLBACK_SPEC_MAX_FREQ;
            const maxBinIndex = Math.min(numBins - 1, Math.floor((maxFreq / nyquist) * (numBins - 1)));

            // Calculate dB Range (logic unchanged)
            const dbThreshold = -60;
            let maxDb = -Infinity;
            const sliceStep = Math.max(1, Math.floor(computedSlices / 100));
            const binStep = Math.max(1, Math.floor(maxBinIndex / 50));
            for (let i = 0; i < computedSlices; i += sliceStep) { /* ... */
                const magnitudes = spectrogramData[i];
                if (!magnitudes) continue;
                for (let j = 0; j <= maxBinIndex; j += binStep) {
                    if (j >= magnitudes.length) break;
                    const db = 20 * Math.log10((magnitudes[j] || 0) + 1e-9);
                    maxDb = Math.max(maxDb, Math.max(dbThreshold, db));
                }
            }
            maxDb = Math.max(maxDb, dbThreshold + 1);
            const minDb = dbThreshold;
            const dbRange = maxDb - minDb;

            // Async Drawing Loop (rAF) - logic unchanged
            const fullImageData = offCtx.createImageData(computedSlices, height);
            const data = fullImageData.data;
            let currentSlice = 0;
            const chunkSize = 32;

            function drawChunk() {
                try {
                    const startSlice = currentSlice;
                    const endSlice = Math.min(startSlice + chunkSize, computedSlices);
                    for (let i = startSlice; i < endSlice; i++) {
                        if (!spectrogramData[i]) continue;
                        const magnitudes = spectrogramData[i];
                        if (magnitudes.length !== numBins) continue;
                        for (let y = 0; y < height; y++) {
                            const freqRatio = (height - 1 - y) / (height - 1);
                            const logFreqRatio = Math.pow(freqRatio, 2.0);
                            const binIndex = Math.min(maxBinIndex, Math.floor(logFreqRatio * maxBinIndex));
                            const magnitude = magnitudes[binIndex] || 0;
                            const db = 20 * Math.log10(magnitude + 1e-9);
                            const clampedDb = Math.max(minDb, db);
                            const normValue = dbRange > 0 ? (clampedDb - minDb) / dbRange : 0;
                            const [r, g, b] = Utils.viridisColor(normValue); // Use Utils
                            const idx = (i + y * computedSlices) * 4;
                            data[idx] = r;
                            data[idx + 1] = g;
                            data[idx + 2] = b;
                            data[idx + 3] = 255;
                        }
                    }
                    // Update chunk on offscreen canvas
                    offCtx.putImageData(fullImageData, 0, 0, startSlice, 0, endSlice - startSlice, height);
                    currentSlice = endSlice;
                    if (currentSlice < computedSlices) {
                        requestAnimationFrame(drawChunk);
                    } else { // Drawing finished - copy final result to visible canvas
                        spectrogramCtx.drawImage(cachedSpectrogramCanvas, 0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
                        console.log(`SpectrogramVisualizer (${elementSuffix}): Async draw complete.`);
                        resolve();
                    }
                } catch (error) {
                    console.error(`SpectrogramVisualizer (${elementSuffix}): Error in drawChunk -`, error);
                    reject(error);
                }
            }

            requestAnimationFrame(drawChunk); // Start loop
        });
    }

    // --- UI Update Methods ---

    /**
     * Updates the position and style of the progress indicator overlay.
     * @param {number} globalCurrentTime - The current global timeline time in seconds.
     * @param {number} trackOffsetSeconds - The offset of this track in seconds.
     * @param {number} trackDurationSeconds - The total duration of this track's audio in seconds.
     * @public
     */
    function updateProgressIndicator(globalCurrentTime, trackOffsetSeconds, trackDurationSeconds) {
        // *** ADD LOGGING ***
        // console.log(`SpectroViz (${elementSuffix}): updateProgressIndicator - globalT=${globalCurrentTime?.toFixed(3)}, offset=${trackOffsetSeconds?.toFixed(3)}, duration=${trackDurationSeconds?.toFixed(3)}`); // DEBUG - Can be noisy

        if (!spectrogramCanvas || !spectrogramProgressIndicator || isNaN(trackDurationSeconds) || trackDurationSeconds <= 0) {
            // console.log(`SpectroViz (${elementSuffix}): Indicator update skipped - invalid state.`); // DEBUG
            if (spectrogramProgressIndicator) spectrogramProgressIndicator.style.left = "0px";
            return;
        }
        const canvasWidth = spectrogramCanvas.clientWidth;
        if (canvasWidth <= 0) {
            spectrogramProgressIndicator.style.left = "0px";
            return;
        }

        const trackEffectiveTime = globalCurrentTime - trackOffsetSeconds;
        let indicatorLeft = "0px";
        let indicatorClass = 'playback-position-indicator'; // Base class
        let state = "pre"; // For logging

        if (trackEffectiveTime < 0) {
            indicatorLeft = "0px";
            indicatorClass += ' inactive';
            state = "pre";
        } else if (trackEffectiveTime > trackDurationSeconds) {
            indicatorLeft = canvasWidth + "px";
            indicatorClass += ' inactive';
            state = "post";
        } else {
            const fraction = trackEffectiveTime / trackDurationSeconds;
            indicatorLeft = (fraction * canvasWidth) + "px";
            state = "active";
        }

        // *** ADD LOGGING ***
        // console.log(`SpectroViz (${elementSuffix}): effectiveT=${trackEffectiveTime.toFixed(3)}, state=${state}, left=${indicatorLeft}, class=${indicatorClass}`); // DEBUG - Can be noisy

        spectrogramProgressIndicator.style.left = indicatorLeft;
        spectrogramProgressIndicator.className = indicatorClass;
    }

    /**
     * Clears the spectrogram visualization canvas and instance cache.
     * @public
     */
    function clearVisuals() {
        console.log(`SpectrogramVisualizer (${elementSuffix}): Clearing visuals and cache.`);
        clearVisualsInternal();
        cachedSpectrogramCanvas = null; // Clear the instance cache
        cachedAudioDuration = 0;
    }

    /** Internal helper to clear canvas */
    function clearVisualsInternal() {
        if (spectrogramCtx && spectrogramCanvas) {
            spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectrogramCtx.fillStyle = '#000'; // Draw black background
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
        updateProgressIndicator(0, 0, 1); // Reset progress indicator
    }

    /**
     * Shows or hides this instance's loading spinner.
     * @param {boolean} show - True to show, false to hide.
     * @public
     */
    function showSpinner(show) {
        if (spectrogramSpinner) {
            spectrogramSpinner.style.display = show ? 'inline' : 'none';
        }
    }

    /**
     * Resizes canvas to match its displayed size. Internal use.
     * @returns {boolean} True if the canvas was actually resized.
     * @private
     */
    function resizeCanvasInternal() {
        // ... (Implementation identical to waveformVisualizer) ...
        if (!spectrogramCanvas) return false;
        const {clientWidth, clientHeight} = spectrogramCanvas; // Use clientWidth/Height
        const roundedWidth = Math.max(10, Math.round(clientWidth));
        const roundedHeight = Math.max(10, Math.round(clientHeight));
        if (spectrogramCanvas.width !== roundedWidth || spectrogramCanvas.height !== roundedHeight) {
            spectrogramCanvas.width = roundedWidth;
            spectrogramCanvas.height = roundedHeight;
            console.log(`SpectrogramVisualizer (${elementSuffix}): Canvas resized to ${roundedWidth}x${roundedHeight}`);
            if (spectrogramCtx) {
                spectrogramCtx.fillStyle = '#000';
                spectrogramCtx.fillRect(0, 0, roundedWidth, roundedHeight);
            }
            return true;
        }
        return false;
    }

    /**
     * Handles window resize: adjusts canvas dimensions and redraws spectrogram from cache.
     * @public
     */
    function resizeAndRedraw() {
        // Check if instance is initialized
        if (!spectrogramCanvas || !spectrogramCtx) return;

        const wasResized = resizeCanvasInternal();

        if (wasResized && cachedSpectrogramCanvas) {
            console.log(`SpectrogramVisualizer (${elementSuffix}): Redrawing spectrogram from cache after resize.`);
            spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectrogramCtx.fillStyle = '#000'; // Ensure black background
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectrogramCtx.drawImage( // Draw cached image scaled
                cachedSpectrogramCanvas,
                0, 0, cachedSpectrogramCanvas.width, cachedSpectrogramCanvas.height, // Source rect (full cache)
                0, 0, spectrogramCanvas.width, spectrogramCanvas.height // Destination rect (scaled display)
            );
        } else if (wasResized) {
            // If resized but no cache, ensure it's cleared (resizeCanvasInternal draws black bg)
        }

        // Update progress indicator position after resize
        const {currentTime = 0, offset = 0} = getCurrentTimeAndOffset(); // Placeholder
        updateProgressIndicator(currentTime, offset, cachedAudioDuration);
    }

    /** Placeholder for getting current time/offset if needed internally */
    function getCurrentTimeAndOffset() {
        return {currentTime: 0, offset: 0};
    }


    // === Public Interface ===
    return {
        init: init,
        computeAndDrawSpectrogram: computeAndDrawSpectrogram,
        resizeAndRedraw: resizeAndRedraw,
        updateProgressIndicator: updateProgressIndicator,
        clearVisuals: clearVisuals,
        showSpinner: showSpinner
    };

})(window.FFT); // Pass the global FFT constructor
// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
