// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
// Handles drawing the Waveform visualization to a canvas element.
// Adapted for potential multi-track use by accepting element IDs.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.waveformVisualizer = (function () {
    'use strict';

    // === Module Dependencies ===
    // Assuming AudioApp.Constants and AudioApp.Utils are loaded before this file.
    // Access via AudioApp.* namespace within functions after init check.

    // === Constants (Local fallback if global not found during init) ===
    const FALLBACK_WAVEFORM_HEIGHT_SCALE = 0.8;
    const FALLBACK_WAVEFORM_COLOR_LOADING = '#888888';
    const FALLBACK_WAVEFORM_COLOR_DEFAULT = '#26828E';
    const FALLBACK_WAVEFORM_COLOR_SPEECH = '#FDE725';

    // === DOM Element References (Instance-specific) ===
    /** @type {HTMLCanvasElement|null} */ let waveformCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */ let waveformCtx = null;
    /** @type {HTMLDivElement|null} */ let waveformProgressIndicator = null;

    // === State (Instance-specific) ===
    /** @type {string} ID suffix for elements ('_left', '_right') */
    let elementSuffix = ''; // e.g., '_left' or '_right'
    /** @type {string|null} ID of the canvas element */
    let canvasId = null;
    /** @type {string|null} ID of the progress indicator element */
    let indicatorId = null;
    /** @type {Array<{min: number, max: number}>|null} Cached waveform data */
    let cachedWaveformData = null;
    /** @type {Array<{start: number, end: number}>|null} Cached speech regions */
    let cachedSpeechRegions = null;
    /** @type {number} Cached audio duration */
    let cachedAudioDuration = 0;


    // === Initialization ===

    /**
     * Initializes the Waveform Visualizer instance for specific elements.
     * Gets canvas references and adds event listeners.
     * @param {object} config - Configuration object.
     * @param {string} config.canvasId - The DOM ID of the canvas element.
     * @param {string} config.indicatorId - The DOM ID of the progress indicator div.
     * @public
     */
    function init(config) {
        if (!config || !config.canvasId || !config.indicatorId) {
            console.error("WaveformVisualizer: Initialization failed - Missing canvasId or indicatorId in config.");
            return;
        }
        canvasId = config.canvasId;
        indicatorId = config.indicatorId;
        // Extract suffix for potential future use, though direct IDs are better
        elementSuffix = canvasId.includes('_right') ? '_right' : '_left';

        console.log(`WaveformVisualizer (${elementSuffix}): Initializing for canvas #${canvasId}...`);

        // Dependency check
        if (!AudioApp.Constants || !AudioApp.Utils) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Constants or Utils not found on AudioApp namespace. Using fallbacks.`);
        }

        assignDOMElements(); // Use IDs passed in config

        if (waveformCanvas && waveformCtx) {
            waveformCanvas.addEventListener('click', handleCanvasClick);
            console.log(`WaveformVisualizer (${elementSuffix}): Canvas found and listener added.`);
        } else {
            console.warn(`WaveformVisualizer (${elementSuffix}): Waveform canvas (#${canvasId}) or context not found.`);
        }
        if (!waveformProgressIndicator) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Progress indicator (#${indicatorId}) not found.`);
        }
        console.log(`WaveformVisualizer (${elementSuffix}): Initialized.`);
    }

    /**
     * Gets references to waveform canvas element and context using stored IDs.
     * @private
     */
    function assignDOMElements() {
        if (!canvasId || !indicatorId) {
            console.error(`WaveformVisualizer (${elementSuffix}): Cannot assign DOM elements - canvasId or indicatorId missing.`);
            return;
        }
        waveformCanvas = document.getElementById(canvasId);
        waveformProgressIndicator = document.getElementById(indicatorId);
        if (waveformCanvas) {
            waveformCtx = waveformCanvas.getContext('2d');
            if (!waveformCtx) {
                console.error(`WaveformVisualizer (${elementSuffix}): Failed to get 2D context for canvas #${canvasId}.`);
            }
        }
    }

    // === Event Handlers ===

    /**
     * Handles click events on the waveform canvas for seeking.
     * Dispatches 'audioapp:seekRequested'.
     * @param {MouseEvent} e - The click event.
     * @private
     */
    function handleCanvasClick(e) {
        if (!waveformCanvas) return;
        const rect = waveformCanvas.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const clickXRelative = e.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
        // Dispatch event - app.js handles converting fraction to global time
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', {
            detail: {fraction: fraction, sourceCanvasId: canvasId} // Include source ID
        }));
    }

    // === Core Drawing & Computation ===

    /**
     * Computes and draws the waveform for the given audio buffer.
     * Caches computed data for redraws.
     * @param {AudioBuffer} audioBuffer - The original, decoded audio buffer.
     * @param {Array<{start: number, end: number}>|null|undefined} speechRegions - Speech regions, or null/empty for initial draw.
     * @returns {Promise<void>} Resolves when drawing is complete.
     * @public
     */
    async function computeAndDrawWaveform(audioBuffer, speechRegions) {
        // Ensure instance is initialized and has context
        if (!waveformCtx || !waveformCanvas) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Cannot draw - Canvas context/element missing.`);
            return;
        }
        if (!audioBuffer) {
            console.warn(`WaveformVisualizer (${elementSuffix}): AudioBuffer missing, clearing visuals.`);
            clearVisuals();
            return;
        }

        // Ensure canvas has valid dimensions before proceeding
        const resized = resizeCanvasInternal(); // Resize to current display size
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        if (width <= 0 || height <= 0) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Cannot draw - Invalid canvas dimensions (${width}x${height}).`);
            return;
        }

        console.log(`WaveformVisualizer (${elementSuffix}): Starting compute & draw...`);
        console.time(`Waveform compute (${elementSuffix})`);
        cachedWaveformData = computeWaveformData(audioBuffer, width);
        cachedSpeechRegions = speechRegions || null; // Cache regions
        cachedAudioDuration = audioBuffer.duration; // Cache duration
        console.timeEnd(`Waveform compute (${elementSuffix})`);

        console.time(`Waveform draw (${elementSuffix})`);
        drawWaveformInternal(cachedWaveformData, cachedSpeechRegions, cachedAudioDuration);
        console.timeEnd(`Waveform draw (${elementSuffix})`);

        // Reset progress indicator after drawing
        updateProgressIndicator(0, 0, cachedAudioDuration); // Pass initial time, offset 0
    }

    /**
     * Redraws waveform highlighting using cached waveform data and new regions.
     * @param {Array<{start: number, end: number}>} speechRegions - The new speech regions.
     * @public
     */
    function redrawWaveformHighlight(speechRegions) {
        if (!waveformCtx || !waveformCanvas) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Cannot redraw highlight - Canvas/context missing.`);
            return;
        }
        if (!cachedWaveformData || cachedAudioDuration <= 0) {
            console.warn(`WaveformVisualizer (${elementSuffix}): Cannot redraw highlight - No cached waveform data or duration.`);
            return;
        }
        console.log(`WaveformVisualizer (${elementSuffix}): Redrawing waveform highlights...`);
        cachedSpeechRegions = speechRegions || null; // Update cached regions
        // Call internal draw function with cached data
        drawWaveformInternal(cachedWaveformData, cachedSpeechRegions, cachedAudioDuration);
    }

    // --- Computation Helper Functions ---

    /**
     * Computes simplified waveform data (min/max pairs per pixel column).
     * @param {AudioBuffer} buffer
     * @param {number} targetWidth
     * @returns {Array<{min: number, max: number}>}
     * @private
     */
    function computeWaveformData(buffer, targetWidth) {
        // ... (Implementation unchanged) ...
        if (!buffer || !buffer.getChannelData || targetWidth <= 0) return [];
        const channelCount = buffer.numberOfChannels;
        const bufferLength = buffer.length;
        if (bufferLength === 0) return [];
        let sourceData;
        if (channelCount === 1) {
            sourceData = buffer.getChannelData(0);
        } else {
            sourceData = new Float32Array(bufferLength).fill(0);
            for (let ch = 0; ch < channelCount; ch++) {
                const channelData = buffer.getChannelData(ch);
                for (let i = 0; i < bufferLength; i++) {
                    sourceData[i] += channelData[i];
                }
            }
            for (let i = 0; i < bufferLength; i++) {
                sourceData[i] /= channelCount;
            }
        }
        const samplesPerPixel = Math.max(1, Math.floor(bufferLength / targetWidth));
        const waveform = [];
        for (let i = 0; i < targetWidth; i++) {
            const start = Math.floor(i * samplesPerPixel);
            const end = Math.min(start + samplesPerPixel, bufferLength);
            if (start >= end) {
                waveform.push({min: 0, max: 0});
                continue;
            }
            let min = 1.0, max = -1.0;
            for (let j = start; j < end; j++) {
                const sample = sourceData[j];
                if (sample < min) min = sample;
                if (sample > max) max = sample;
            }
            waveform.push({min, max});
        }
        return waveform;
    }

    // --- Drawing Helper Functions ---

    /**
     * Internal drawing function. Assumes canvas context is valid and data is available.
     * Uses cached data if parameters are omitted.
     * @param {Array<{min: number, max: number}>|null} [waveformData]
     * @param {Array<{start: number, end: number}>|null} [speechRegions]
     * @param {number} [audioDuration]
     * @private
     */
    function drawWaveformInternal(waveformData = cachedWaveformData, speechRegions = cachedSpeechRegions, audioDuration = cachedAudioDuration) {
        // Use cached data if arguments are null/undefined
        waveformData = waveformData ?? cachedWaveformData;
        speechRegions = speechRegions ?? cachedSpeechRegions;
        audioDuration = audioDuration ?? cachedAudioDuration;

        // Exit if essential drawing components are missing
        if (!waveformCtx || !waveformCanvas) return;
        const Constants = AudioApp.Constants; // Access fresh Constants
        const height = waveformCanvas.height;
        const width = waveformCanvas.width;

        // Clear canvas with black background
        waveformCtx.clearRect(0, 0, width, height);
        waveformCtx.fillStyle = '#000';
        waveformCtx.fillRect(0, 0, width, height);

        if (!waveformData || waveformData.length === 0 || !audioDuration || audioDuration <= 0 || width <= 0 || height <= 0) {
            waveformCtx.fillStyle = '#888';
            waveformCtx.textAlign = 'center';
            waveformCtx.font = '12px sans-serif';
            waveformCtx.fillText("No waveform data", width / 2, height / 2);
            return;
        }

        const dataLen = waveformData.length;
        const halfHeight = height / 2;
        // Use fallback Constants if necessary
        const scale = halfHeight * (Constants?.WAVEFORM_HEIGHT_SCALE ?? FALLBACK_WAVEFORM_HEIGHT_SCALE);
        const pixelsPerSecond = width / audioDuration;

        const initialDraw = !speechRegions || speechRegions.length === 0;
        const defaultColor = initialDraw ? (Constants?.WAVEFORM_COLOR_LOADING ?? FALLBACK_WAVEFORM_COLOR_LOADING)
            : (Constants?.WAVEFORM_COLOR_DEFAULT ?? FALLBACK_WAVEFORM_COLOR_DEFAULT);
        const speechColor = Constants?.WAVEFORM_COLOR_SPEECH ?? FALLBACK_WAVEFORM_COLOR_SPEECH;

        const speechPixelRegions = initialDraw ? [] : (speechRegions || []).map(r => ({
            startPx: r.start * pixelsPerSecond,
            endPx: r.end * pixelsPerSecond
        }));

        const pixelWidth = width / dataLen; // Width of each data point / bar

        // Optimization: Draw regions separately to minimize style changes
        // Draw Default/Loading Color first
        waveformCtx.fillStyle = defaultColor;
        waveformCtx.beginPath();
        for (let i = 0; i < dataLen; i++) {
            const x = i * pixelWidth;
            // Check if this pixel is NOT within any speech region
            let isOutsideSpeech = true;
            if (!initialDraw) {
                const currentPixelEnd = x + pixelWidth;
                for (const region of speechPixelRegions) {
                    // Check for overlap: pixel starts before region ends AND pixel ends after region starts
                    if (x < region.endPx && currentPixelEnd > region.startPx) {
                        isOutsideSpeech = false;
                        break;
                    }
                }
            }
            // If outside speech (or if initial draw), draw with default color
            if (isOutsideSpeech) {
                const {min, max} = waveformData[i];
                const y1 = halfHeight - max * scale;
                const y2 = halfHeight - min * scale;
                // Ensure height is at least 1 pixel for visibility
                waveformCtx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1));
            }
        }
        waveformCtx.fill(); // Fill all default-colored bars at once

        // Draw Speech Highlights (only if not initial draw)
        if (!initialDraw) {
            waveformCtx.fillStyle = speechColor;
            waveformCtx.beginPath();
            for (let i = 0; i < dataLen; i++) {
                const x = i * pixelWidth;
                // Check if this pixel IS within any speech region
                let isInsideSpeech = false;
                const currentPixelEnd = x + pixelWidth;
                for (const region of speechPixelRegions) {
                    if (x < region.endPx && currentPixelEnd > region.startPx) {
                        isInsideSpeech = true;
                        break;
                    }
                }
                // If inside speech, draw with speech color
                if (isInsideSpeech) {
                    const {min, max} = waveformData[i];
                    const y1 = halfHeight - max * scale;
                    const y2 = halfHeight - min * scale;
                    waveformCtx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1));
                }
            }
            waveformCtx.fill(); // Fill all speech-colored bars at once
        }
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
        // console.log(`WaveformViz (${elementSuffix}): updateProgressIndicator - globalT=${globalCurrentTime?.toFixed(3)}, offset=${trackOffsetSeconds?.toFixed(3)}, duration=${trackDurationSeconds?.toFixed(3)}`); // DEBUG - Can be noisy

        if (!waveformCanvas || !waveformProgressIndicator || isNaN(trackDurationSeconds) || trackDurationSeconds <= 0) {
            // console.log(`WaveformViz (${elementSuffix}): Indicator update skipped - invalid state.`); // DEBUG
            if (waveformProgressIndicator) waveformProgressIndicator.style.left = "0px";
            return;
        }

        const canvasWidth = waveformCanvas.clientWidth;
        if (canvasWidth <= 0) {
            waveformProgressIndicator.style.left = "0px";
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
        // console.log(`WaveformViz (${elementSuffix}): effectiveT=${trackEffectiveTime.toFixed(3)}, state=${state}, left=${indicatorLeft}, class=${indicatorClass}`); // DEBUG - Can be noisy

        waveformProgressIndicator.style.left = indicatorLeft;
        waveformProgressIndicator.className = indicatorClass;
    }

    /**
     * Clears the waveform visualization canvas and cached data.
     * @public
     */
    function clearVisuals() {
        console.log(`WaveformVisualizer (${elementSuffix}): Clearing visuals and cache.`);
        if (waveformCtx && waveformCanvas) {
            waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
            waveformCtx.fillStyle = '#000'; // Black background
            waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        }
        // Clear cached data
        cachedWaveformData = null;
        cachedSpeechRegions = null;
        cachedAudioDuration = 0;
        // Reset progress indicator
        updateProgressIndicator(0, 0, 1); // Use dummy duration to reset style/position
    }

    /**
     * Resizes canvas to match its displayed size. Internal use.
     * @returns {boolean} True if the canvas was actually resized.
     * @private
     */
    function resizeCanvasInternal() {
        if (!waveformCanvas) return false;
        // Use clientWidth/Height for responsive sizing
        const {clientWidth, clientHeight} = waveformCanvas;
        const roundedWidth = Math.max(10, Math.round(clientWidth));
        const roundedHeight = Math.max(10, Math.round(clientHeight));

        if (waveformCanvas.width !== roundedWidth || waveformCanvas.height !== roundedHeight) {
            waveformCanvas.width = roundedWidth;
            waveformCanvas.height = roundedHeight;
            // Ensure context is reset after resize if needed (usually automatic)
            console.log(`WaveformVisualizer (${elementSuffix}): Canvas resized to ${roundedWidth}x${roundedHeight}`);
            // Redraw black background immediately after resize
            if (waveformCtx) {
                waveformCtx.fillStyle = '#000';
                waveformCtx.fillRect(0, 0, roundedWidth, roundedHeight);
            }
            return true; // Indicate resize happened
        }
        return false; // No resize needed
    }

    /**
     * Handles window resize: adjusts canvas dimensions and redraws waveform from cache.
     * @public
     */
    function resizeAndRedraw() {
        // Check if instance is initialized
        if (!waveformCanvas || !waveformCtx) return;

        const wasResized = resizeCanvasInternal();

        if (wasResized && cachedWaveformData) {
            console.log(`WaveformVisualizer (${elementSuffix}): Redrawing waveform from cache after resize.`);
            // Redraw using cached data and current dimensions
            drawWaveformInternal();
        } else if (wasResized) {
            // If resized but no data, ensure it's cleared (resizeCanvasInternal already draws black bg)
            // clearVisuals(); // Not strictly needed due to resizeCanvasInternal redraw
        }

        // Update progress indicator position after resize, using cached duration
        // Note: App.js should provide the current global time for accurate positioning
        // This is just a fallback or initial positioning after resize.
        const {currentTime = 0, offset = 0} = getCurrentTimeAndOffset(); // Get relevant time info if possible
        updateProgressIndicator(currentTime, offset, cachedAudioDuration);
    }

    /** Placeholder for getting current time/offset if needed internally */
    function getCurrentTimeAndOffset() {
        // In a real scenario, this might fetch from app.js state or be passed in.
        // For resize, we might not have accurate real-time info easily available here.
        return {currentTime: 0, offset: 0};
    }


    // === Public Interface ===
    // Expose methods needed by app.js, potentially returning an object
    // representing this specific visualizer instance if app.js manages instances.
    return {
        init: init,
        computeAndDrawWaveform: computeAndDrawWaveform,
        redrawWaveformHighlight: redrawWaveformHighlight,
        resizeAndRedraw: resizeAndRedraw,
        updateProgressIndicator: updateProgressIndicator,
        clearVisuals: clearVisuals
        // Maybe expose getCanvasId or similar if needed by app.js for event handling
        // getCanvasId: () => canvasId
    };

})(); // End of AudioApp.waveformVisualizer IIFE
// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
