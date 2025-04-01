// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
// Handles drawing the Waveform visualization to a specific canvas element based on track index.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.waveformVisualizer = (function() {
    'use strict';

    // === Module Dependencies ===
    const Constants = AudioApp.Constants;
    const Utils = AudioApp.Utils;

    // === DOM Element References (specific to an instance) ===
    /** @type {HTMLCanvasElement|null} */ let waveformCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */ let waveformCtx = null;
    /** @type {HTMLDivElement|null} */ let waveformProgressIndicator = null;
    /** @type {number|null} */ let trackIndex = null; // Store track index for clarity

    // === Initialization ===

    /**
     * Initializes the Waveform Visualizer module for a specific track.
     * Gets canvas references based on track index and adds event listeners.
     * @public
     * @param {number} index - The track index (0 or 1).
     */
    function init(index) {
        if (index !== 0 && index !== 1) {
            console.error(`WaveformVisualizer: Invalid trackIndex (${index}) provided during init.`);
            return;
        }
        this.trackIndex = index; // Store index for reference
        console.log(`WaveformVisualizer[${this.trackIndex}]: Initializing...`);

        assignDOMElements(this.trackIndex); // Pass index to find correct elements

        if (waveformCanvas) {
            waveformCanvas.addEventListener('click', handleCanvasClick); // Listener added to specific canvas
        } else {
            console.warn(`WaveformVisualizer[${this.trackIndex}]: Waveform canvas not found.`);
        }
        console.log(`WaveformVisualizer[${this.trackIndex}]: Initialized.`);
    }

    /**
     * Gets references to waveform canvas elements and context for the specified track.
     * @param {number} index - The track index (0 or 1).
     * @private
     */
    function assignDOMElements(index) {
        try {
            waveformCanvas = document.getElementById(`waveformCanvas-track-${index}`);
            waveformProgressIndicator = document.getElementById(`waveformProgressIndicator-track-${index}`);
            if (waveformCanvas) {
                waveformCtx = waveformCanvas.getContext('2d');
                 if (!waveformCtx) {
                      console.error(`WaveformVisualizer[${index}]: Failed to get 2D context.`);
                 }
            } else {
                // Log warning here instead of init?
                // console.warn(`WaveformVisualizer[${index}]: Did not find canvas element #waveformCanvas-track-${index}`);
            }
             if (!waveformProgressIndicator) {
                  // console.warn(`WaveformVisualizer[${index}]: Did not find progress indicator #waveformProgressIndicator-track-${index}`);
             }
        } catch (error) {
             console.error(`WaveformVisualizer[${index}]: Error assigning DOM elements:`, error);
             waveformCanvas = null;
             waveformCtx = null;
             waveformProgressIndicator = null;
        }
    }


    // === Event Handlers ===

    /**
     * Handles click events on the waveform canvas for seeking.
     * Dispatches 'audioapp:seekRequested'. (Event is generic, app handles which track)
     * @param {MouseEvent} e - The click event.
     * @private
     */
    function handleCanvasClick(e) {
        // No change needed - operates on the specific canvas it's attached to
        if (!waveformCanvas) return;
        const rect = waveformCanvas.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const clickXRelative = e.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
        // Dispatch generic event, app.js determines context if needed
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction: fraction } }));
    }

    // === Core Drawing & Computation (Operate on instance's canvas/ctx) ===

    /**
     * Computes and draws the waveform for the given audio buffer onto this instance's canvas.
     * Uses loading color if speechRegions is empty/null.
     * @param {AudioBuffer} audioBuffer - The original, decoded audio buffer.
     * @param {Array<{start: number, end: number}>|null|undefined} speechRegions - Speech regions, or null/empty for initial draw.
     * @returns {Promise<void>} Resolves when drawing is complete.
     * @public
     */
    async function computeAndDrawWaveform(audioBuffer, speechRegions) {
        // No change needed - uses this instance's waveformCtx/waveformCanvas
        if (!audioBuffer) { console.warn(`WaveformVisualizer[${this.trackIndex}]: AudioBuffer missing.`); return; }
        if (!waveformCtx || !waveformCanvas) { console.warn(`WaveformVisualizer[${this.trackIndex}]: Canvas context/element missing.`); return; }

        resizeCanvasInternal(); // Resizes this instance's canvas
        const width = waveformCanvas.width;

        console.time(`Waveform compute T${this.trackIndex}`);
        const waveformData = computeWaveformData(audioBuffer, width);
        console.timeEnd(`Waveform compute T${this.trackIndex}`);

        console.time(`Waveform draw T${this.trackIndex}`);
        drawWaveform(waveformData, waveformCanvas, waveformCtx, speechRegions, audioBuffer.duration, width);
        console.timeEnd(`Waveform draw T${this.trackIndex}`);

        updateProgressIndicator(0, audioBuffer.duration); // Reset this instance's progress bar
    }

    /**
     * Redraws waveform highlighting on this instance's canvas.
     * Recomputes waveform data for current size and redraws with speech highlights.
     * @param {AudioBuffer|null} audioBuffer - The current audio buffer.
     * @param {Array<{start: number, end: number}>} speechRegions - The calculated speech regions.
     * @public
     */
    function redrawWaveformHighlight(audioBuffer, speechRegions) {
         // No change needed - uses this instance's waveformCtx/waveformCanvas
         if (!audioBuffer) { console.warn(`WaveformVisualizer[${this.trackIndex}]: Cannot redraw highlight, AudioBuffer missing.`); return; }
         if (!waveformCanvas || !waveformCtx) { console.warn(`WaveformVisualizer[${this.trackIndex}]: Cannot redraw highlight, Canvas/context missing.`); return; }
         const width = waveformCanvas.width;
         if (width <= 0) { console.warn(`WaveformVisualizer[${this.trackIndex}]: Cannot redraw highlight, Canvas width is zero.`); return; }

         console.log(`WaveformVisualizer[${this.trackIndex}]: Redrawing waveform highlights...`);
         const waveformData = computeWaveformData(audioBuffer, width);
         drawWaveform(waveformData, waveformCanvas, waveformCtx, speechRegions, audioBuffer.duration, width);
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
        // No change needed - pure computation based on inputs
        if (!buffer?.getChannelData || targetWidth <= 0) return [];
        // ... (rest of function is identical to previous version) ...
         const channelCount = buffer.numberOfChannels;
         const bufferLength = buffer.length; if (bufferLength === 0) return [];
         let sourceData;
         if (channelCount === 1) { sourceData = buffer.getChannelData(0); }
         else { /* ... averaging logic ... */
             sourceData = new Float32Array(bufferLength).fill(0);
             for (let ch = 0; ch < channelCount; ch++) { const channelData = buffer.getChannelData(ch); for (let i = 0; i < bufferLength; i++) { sourceData[i] += channelData[i]; } }
             for (let i = 0; i < bufferLength; i++) { sourceData[i] /= channelCount; }
         }
         const samplesPerPixel = Math.max(1, Math.floor(bufferLength / targetWidth)); const waveform = [];
         for (let i = 0; i < targetWidth; i++) { const start = Math.floor(i * samplesPerPixel); const end = Math.min(start + samplesPerPixel, bufferLength); if (start >= end) { waveform.push({min: 0, max: 0}); continue; } let min = 1.0, max = -1.0; for (let j = start; j < end; j++) { const sample = sourceData[j]; if (sample < min) min = sample; if (sample > max) max = sample; } waveform.push({min, max}); }
         return waveform;
    }

    // --- Drawing Helper Functions ---

    /**
     * Draws the waveform, highlighting speech regions with specific colors.
     * @param {Array<{min: number, max: number}>} waveformData - Min/max pairs per pixel.
     * @param {HTMLCanvasElement} canvas - The target canvas element (passed explicitly now for clarity, though it's the instance's canvas).
     * @param {CanvasRenderingContext2D} ctx - The canvas context (passed explicitly).
     * @param {Array<{start: number, end: number}>|null|undefined} speechRegions - Array of speech time regions.
     * @param {number} audioDuration - Total duration of the audio in seconds.
     * @param {number} width - The current width of the canvas.
     * @private
     */
     function drawWaveform(waveformData, canvas, ctx, speechRegions, audioDuration, width) {
         // No change needed - uses passed canvas/ctx, Constants, Utils
         if (!ctx || !Constants || !canvas) return;
         // ... (rest of function is identical to previous version) ...
         const { height } = canvas; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
         if (!waveformData || waveformData.length === 0 || !audioDuration || audioDuration <= 0) { /* ... draw 'No data' ... */ return; }
         const dataLen = waveformData.length; const halfHeight = height / 2; const scale = halfHeight * Constants.WAVEFORM_HEIGHT_SCALE; const pixelsPerSecond = width / audioDuration;
         const initialDraw = !speechRegions || speechRegions.length === 0; const defaultColor = initialDraw ? Constants.WAVEFORM_COLOR_LOADING : Constants.WAVEFORM_COLOR_DEFAULT;
         const speechPixelRegions = initialDraw ? [] : (speechRegions || []).map(r => ({ startPx: r.start * pixelsPerSecond, endPx: r.end * pixelsPerSecond }));
         const pixelWidth = width / dataLen;
         ctx.fillStyle = defaultColor; ctx.beginPath();
         for (let i = 0; i < dataLen; i++) { const x = i * pixelWidth; const currentPixelEnd = x + pixelWidth; let isOutsideSpeech = true; if (!initialDraw) { for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isOutsideSpeech = false; break; } } } if (isOutsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; ctx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } }
         ctx.fill();
         if (!initialDraw) { ctx.fillStyle = Constants.WAVEFORM_COLOR_SPEECH; ctx.beginPath(); for (let i = 0; i < dataLen; i++) { const x = i * pixelWidth; const currentPixelEnd = x + pixelWidth; let isInsideSpeech = false; for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isInsideSpeech = true; break; } } if (isInsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; ctx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } } ctx.fill(); }
    }

    // --- UI Update Methods ---

    /**
     * Updates the position of this instance's progress indicator overlay.
     * @param {number} currentTime - The current playback time in seconds FOR THIS TRACK.
     * @param {number} duration - The total audio duration in seconds FOR THIS TRACK.
     * @public
     */
    function updateProgressIndicator(currentTime, duration) {
        // No change needed - uses this instance's waveformCanvas/waveformProgressIndicator
        if (!waveformCanvas || !waveformProgressIndicator) return;
        if (isNaN(duration) || duration <= 0) {
            waveformProgressIndicator.style.left = "0px"; return;
        }
        const fraction = Math.max(0, Math.min(1, currentTime / duration));
        const waveformWidth = waveformCanvas.clientWidth; // Use clientWidth for displayed size
        if (waveformWidth > 0) {
            waveformProgressIndicator.style.left = (fraction * waveformWidth) + "px";
        } else {
            waveformProgressIndicator.style.left = "0px"; // Fallback
        }
    }

    /**
     * Clears this instance's waveform visualization canvas.
     * @public
     */
    function clearVisuals() {
        // No change needed - uses this instance's waveformCtx/waveformCanvas
        console.log(`WaveformVisualizer[${this.trackIndex}]: Clearing visuals.`);
        if (waveformCtx && waveformCanvas) {
            waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
             waveformCtx.fillStyle = '#000';
             waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        }
        updateProgressIndicator(0, 1); // Reset progress indicator
    }

    /**
     * Resizes this instance's canvas to match its displayed size. Internal use.
     * @returns {boolean} True if the canvas was actually resized.
     * @private
     */
    function resizeCanvasInternal() {
        // No change needed - uses this instance's waveformCanvas/waveformCtx
        if (!waveformCanvas) return false;
        // Use clientWidth/Height for responsive sizing
        const { clientWidth, clientHeight } = waveformCanvas;
        const roundedWidth = Math.max(10, Math.round(clientWidth));
        const roundedHeight = Math.max(10, Math.round(clientHeight));
        if (waveformCanvas.width !== roundedWidth || waveformCanvas.height !== roundedHeight) {
            waveformCanvas.width = roundedWidth;
            waveformCanvas.height = roundedHeight;
             if(waveformCtx) {
                  waveformCtx.fillStyle = '#000';
                  waveformCtx.fillRect(0, 0, roundedWidth, roundedHeight);
             }
             console.log(`WaveformVisualizer[${this.trackIndex}]: Resized canvas to ${roundedWidth}x${roundedHeight}`);
            return true;
        }
        return false;
    }

    /**
     * Handles window resize: adjusts canvas dimensions and redraws waveform.
     * @param {AudioBuffer | null} audioBuffer - The current audio buffer for this track.
     * @param {Array<{start: number, end: number}> | null} speechRegions - Current speech regions for this track.
     * @public
     */
    function resizeAndRedraw(audioBuffer, speechRegions) {
        // Need context (this instance's canvas/buffer/regions)
        if (!waveformCanvas) return;
        const wasResized = resizeCanvasInternal(); // Resizes this instance's canvas
        if (wasResized && audioBuffer) {
            console.log(`WaveformVisualizer[${this.trackIndex}]: Redrawing waveform after resize.`);
            redrawWaveformHighlight(audioBuffer, speechRegions || []); // Redraws this instance
        } else if (wasResized) {
            clearVisuals(); // Clear this instance if resized but no buffer
        }
        // Always update progress indicator for this instance after resize
        // Note: app.js needs to provide the correct currentTime/duration for this specific track index.
        // This method itself doesn't know the current time.
        // Let's remove the time update from here, app.js should call updateProgressIndicator separately.
        // const { currentTime = 0, duration = 0 } = /* How to get time for this track? */;
        // updateProgressIndicator(currentTime, duration || (audioBuffer ? audioBuffer.duration : 0));
    }

    // === Public Interface (should be consistent for both instances) ===
    // We return an object representing the public API of a single visualizer instance.
    // app.js will create two such objects.
    return {
        init: init,
        computeAndDrawWaveform: computeAndDrawWaveform,
        redrawWaveformHighlight: redrawWaveformHighlight,
        resizeAndRedraw: resizeAndRedraw,
        updateProgressIndicator: updateProgressIndicator,
        clearVisuals: clearVisuals
        // No need to expose internal helpers like assignDOMElements, etc.
    };

})(); // End of AudioApp.waveformVisualizer IIFE
// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
