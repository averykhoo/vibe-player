// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
// Handles drawing the Waveform visualization using a Factory Function pattern.

var AudioApp = AudioApp || {}; // Ensure namespace exists

/**
 * Factory function to create a Waveform Visualizer instance for a specific track.
 * @param {number} trackIndex - The track index (0 or 1).
 * @returns {object|null} The visualizer API object or null if init fails.
 */
AudioApp.createWaveformVisualizer = function(trackIndex) {
    'use strict';

    // === Module Dependencies ===
    // Access dependencies from the global AudioApp namespace
    const Constants = AudioApp.Constants;
    const Utils = AudioApp.Utils;

    // === Instance State (Private via closure) ===
    /** @type {HTMLCanvasElement|null} */ let waveformCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */ let waveformCtx = null;
    /** @type {HTMLDivElement|null} */ let waveformProgressIndicator = null;
    const instanceIndex = trackIndex; // Store index for logging/reference

    // === Initialization Logic (Called immediately) ===
    function initInternal() {
        console.log(`WaveformVisualizer[${instanceIndex}]: Initializing...`);
        if (!Constants || !Utils) {
            console.error(`WaveformVisualizer[${instanceIndex}]: Missing Constants or Utils! Cannot initialize.`);
            return false; // Indicate failure
        }
        assignDOMElements(instanceIndex);

        if (waveformCanvas) {
            waveformCanvas.addEventListener('click', handleCanvasClick);
        } else {
            console.warn(`WaveformVisualizer[${instanceIndex}]: Waveform canvas not found.`);
            // Return success even if canvas missing, maybe added later? Or return false? Let's return true for now.
        }
        console.log(`WaveformVisualizer[${instanceIndex}]: Initialized.`);
        return true; // Indicate success
    }

    /**
     * Gets references to waveform canvas elements and context for this instance.
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
            }
        } catch (error) {
             console.error(`WaveformVisualizer[${index}]: Error assigning DOM elements:`, error);
             waveformCanvas = null; waveformCtx = null; waveformProgressIndicator = null;
        }
    }

    // === Event Handlers (Private via closure) ===
    /** @private */
    function handleCanvasClick(e) {
        if (!waveformCanvas) return;
        const rect = waveformCanvas.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const clickXRelative = e.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction: fraction } }));
    }

    // === Core Drawing & Computation (Private via closure) ===
    /** @private */
    async function computeAndDrawWaveformInternal(audioBuffer, speechRegions) {
        if (!audioBuffer) { console.warn(`WaveformVisualizer[${instanceIndex}]: AudioBuffer missing.`); return; }
        if (!waveformCtx || !waveformCanvas) { console.warn(`WaveformVisualizer[${instanceIndex}]: Canvas context/element missing.`); return; }

        resizeCanvasInternal();
        const width = waveformCanvas.width;

        console.time(`Waveform compute T${instanceIndex}`);
        const waveformData = computeWaveformDataInternal(audioBuffer, width);
        console.timeEnd(`Waveform compute T${instanceIndex}`);

        console.time(`Waveform draw T${instanceIndex}`);
        drawWaveformInternal(waveformData, waveformCanvas, waveformCtx, speechRegions, audioBuffer.duration, width);
        console.timeEnd(`Waveform draw T${instanceIndex}`);

        updateProgressIndicatorInternal(0, audioBuffer.duration);
    }

    /** @private */
    function redrawWaveformHighlightInternal(audioBuffer, speechRegions) {
         if (!audioBuffer) { console.warn(`WaveformVisualizer[${instanceIndex}]: Cannot redraw highlight, AudioBuffer missing.`); return; }
         if (!waveformCanvas || !waveformCtx) { console.warn(`WaveformVisualizer[${instanceIndex}]: Cannot redraw highlight, Canvas/context missing.`); return; }
         const width = waveformCanvas.width;
         if (width <= 0) { console.warn(`WaveformVisualizer[${instanceIndex}]: Cannot redraw highlight, Canvas width is zero.`); return; }

         console.log(`WaveformVisualizer[${instanceIndex}]: Redrawing waveform highlights...`);
         const waveformData = computeWaveformDataInternal(audioBuffer, width);
         drawWaveformInternal(waveformData, waveformCanvas, waveformCtx, speechRegions, audioBuffer.duration, width);
    }

    /** @private */
    function computeWaveformDataInternal(buffer, targetWidth) {
        if (!buffer?.getChannelData || targetWidth <= 0) return [];
        const channelCount = buffer.numberOfChannels;
        const bufferLength = buffer.length; if (bufferLength === 0) return [];
        let sourceData;
        if (channelCount === 1) { sourceData = buffer.getChannelData(0); }
        else {
            sourceData = new Float32Array(bufferLength).fill(0);
            for (let ch = 0; ch < channelCount; ch++) { const channelData = buffer.getChannelData(ch); for (let i = 0; i < bufferLength; i++) { sourceData[i] += channelData[i]; } }
            for (let i = 0; i < bufferLength; i++) { sourceData[i] /= channelCount; }
        }
        const samplesPerPixel = Math.max(1, Math.floor(bufferLength / targetWidth)); const waveform = [];
        for (let i = 0; i < targetWidth; i++) { const start = Math.floor(i * samplesPerPixel); const end = Math.min(start + samplesPerPixel, bufferLength); if (start >= end) { waveform.push({min: 0, max: 0}); continue; } let min = 1.0, max = -1.0; for (let j = start; j < end; j++) { const sample = sourceData[j]; if (sample < min) min = sample; if (sample > max) max = sample; } waveform.push({min, max}); }
        return waveform;
    }

    /** @private */
     function drawWaveformInternal(waveformData, canvas, ctx, speechRegions, audioDuration, width) {
         if (!ctx || !Constants || !canvas) return;
         const { height } = canvas; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
         if (!waveformData || waveformData.length === 0 || !audioDuration || audioDuration <= 0) { ctx.fillStyle = '#888'; ctx.textAlign = 'center'; ctx.font = '12px sans-serif'; ctx.fillText("No data", width / 2, height / 2); return; }
         const dataLen = waveformData.length; const halfHeight = height / 2; const scale = halfHeight * Constants.WAVEFORM_HEIGHT_SCALE; const pixelsPerSecond = width / audioDuration;
         const initialDraw = !speechRegions || speechRegions.length === 0; const defaultColor = initialDraw ? Constants.WAVEFORM_COLOR_LOADING : Constants.WAVEFORM_COLOR_DEFAULT;
         const speechPixelRegions = initialDraw ? [] : (speechRegions || []).map(r => ({ startPx: r.start * pixelsPerSecond, endPx: r.end * pixelsPerSecond }));
         const pixelWidth = width / dataLen;
         ctx.fillStyle = defaultColor; ctx.beginPath();
         for (let i = 0; i < dataLen; i++) { const x = i * pixelWidth; const currentPixelEnd = x + pixelWidth; let isOutsideSpeech = true; if (!initialDraw) { for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isOutsideSpeech = false; break; } } } if (isOutsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; ctx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } }
         ctx.fill();
         if (!initialDraw) { ctx.fillStyle = Constants.WAVEFORM_COLOR_SPEECH; ctx.beginPath(); for (let i = 0; i < dataLen; i++) { const x = i * pixelWidth; const currentPixelEnd = x + pixelWidth; let isInsideSpeech = false; for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isInsideSpeech = true; break; } } if (isInsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; ctx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } } ctx.fill(); }
    }

    // --- UI Update Methods (Private via closure) ---
    /** @private */
    function updateProgressIndicatorInternal(currentTime, duration) {
        if (!waveformCanvas || !waveformProgressIndicator) return;
        if (isNaN(duration) || duration <= 0) { waveformProgressIndicator.style.left = "0px"; return; }
        const fraction = Math.max(0, Math.min(1, currentTime / duration));
        const waveformWidth = waveformCanvas.clientWidth;
        if (waveformWidth > 0) { waveformProgressIndicator.style.left = (fraction * waveformWidth) + "px"; }
        else { waveformProgressIndicator.style.left = "0px"; }
    }

    /** @private */
    function clearVisualsInternal() {
        console.log(`WaveformVisualizer[${instanceIndex}]: Clearing visuals.`);
        if (waveformCtx && waveformCanvas) {
            waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
             waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        }
        updateProgressIndicatorInternal(0, 1);
    }

    /** @private */
    function resizeCanvasInternal() {
        if (!waveformCanvas) return false;
        const { clientWidth, clientHeight } = waveformCanvas;
        const roundedWidth = Math.max(10, Math.round(clientWidth));
        const roundedHeight = Math.max(10, Math.round(clientHeight));
        if (waveformCanvas.width !== roundedWidth || waveformCanvas.height !== roundedHeight) {
            waveformCanvas.width = roundedWidth; waveformCanvas.height = roundedHeight;
             if(waveformCtx) { waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, roundedWidth, roundedHeight); }
             console.log(`WaveformVisualizer[${instanceIndex}]: Resized canvas to ${roundedWidth}x${roundedHeight}`);
            return true;
        }
        return false;
    }

    /** @private */
    function resizeAndRedrawInternal(audioBuffer, speechRegions) {
        if (!waveformCanvas) return;
        const wasResized = resizeCanvasInternal();
        if (wasResized && audioBuffer) {
            console.log(`WaveformVisualizer[${instanceIndex}]: Redrawing waveform after resize.`);
            redrawWaveformHighlightInternal(audioBuffer, speechRegions || []);
        } else if (wasResized) {
            clearVisualsInternal();
        }
        // Time update handled by app.js calling updateProgressIndicator separately
    }

    // --- Initialize ---
    if (!initInternal()) {
         // If initialization failed (e.g., missing dependencies), return null
         return null;
    }

    // --- Public API ---
    // Return an object exposing methods that call the internal functions.
    return {
        /** @type {number} */
        trackIndex: instanceIndex, // Expose index if needed externally

        /** Computes and draws waveform */
        computeAndDrawWaveform: async function(audioBuffer, speechRegions) {
            return computeAndDrawWaveformInternal(audioBuffer, speechRegions);
        },
        /** Redraws highlights */
        redrawWaveformHighlight: function(audioBuffer, speechRegions) {
            redrawWaveformHighlightInternal(audioBuffer, speechRegions);
        },
        /** Handles resize */
        resizeAndRedraw: function(audioBuffer, speechRegions) {
            resizeAndRedrawInternal(audioBuffer, speechRegions);
        },
        /** Updates progress indicator */
        updateProgressIndicator: function(currentTime, duration) {
            updateProgressIndicatorInternal(currentTime, duration);
        },
        /** Clears the canvas */
        clearVisuals: function() {
            clearVisualsInternal();
        }
    };
}; // End of createWaveformVisualizer factory
// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
