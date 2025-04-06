// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
// Handles drawing the Waveform visualization to a canvas element.
// REFACTORED to provide a factory function for creating independent instances.

var AudioApp = AudioApp || {};

AudioApp.waveformVisualizer = (function() {
    'use strict';

    // === Module Dependencies ===
    // Assuming AudioApp.Constants and AudioApp.Utils are loaded before this file.

    // === Constants (Shared or passed during creation) ===
    // These can remain here or be accessed via AudioApp.Constants inside methods

    // === Instance Factory ===
    /**
     * Creates a new Waveform Visualizer instance.
     * @param {object} config - Configuration object.
     * @param {string} config.canvasId - The DOM ID of the canvas element.
     * @param {string} config.indicatorId - The DOM ID of the progress indicator div.
     * @returns {object} A visualizer instance with public methods.
     */
    function createInstance(config) {
        if (!config || !config.canvasId || !config.indicatorId) {
            console.error("WaveformVisualizer Factory: Creation failed - Missing canvasId or indicatorId in config.");
            // Return a dummy object to prevent errors?
            return { init: ()=>{}, computeAndDrawWaveform: ()=>{}, /* ... other methods */ };
        }

        // --- Instance-Specific State & Refs ---
        let waveformCanvas = null;
        let waveformCtx = null;
        let waveformProgressIndicator = null;
        const canvasId = config.canvasId; // Store from config
        const indicatorId = config.indicatorId; // Store from config
        const elementSuffix = canvasId.includes('_right') ? '_right' : '_left';
        let cachedWaveformData = null;
        let cachedSpeechRegions = null;
        let cachedAudioDuration = 0;

        console.log(`WaveformVisualizer Instance (${elementSuffix}): Creating for canvas #${canvasId}...`);

        // --- Private Methods (Bound to this instance's state) ---

        function assignDOMElements() {
             waveformCanvas = document.getElementById(canvasId);
             waveformProgressIndicator = document.getElementById(indicatorId);
             if (waveformCanvas) {
                 waveformCtx = waveformCanvas.getContext('2d');
                 if(!waveformCtx){ console.error(`WaveformVisualizer (${elementSuffix}): Failed to get 2D context.`);}
                 else {
                      // Add listener here after elements are assigned
                      waveformCanvas.addEventListener('click', handleCanvasClick);
                      console.log(`WaveformVisualizer (${elementSuffix}): Canvas found and listener added.`);
                 }
             } else { console.warn(`WaveformVisualizer (${elementSuffix}): Canvas #${canvasId} not found.`); }
             if (!waveformProgressIndicator) { console.warn(`WaveformVisualizer (${elementSuffix}): Indicator #${indicatorId} not found.`); }
        }

        function handleCanvasClick(e) {
             if (!waveformCanvas) return; const rect = waveformCanvas.getBoundingClientRect(); if (!rect || rect.width <= 0) return; const clickXRelative = e.clientX - rect.left; const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
             document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction: fraction, sourceCanvasId: canvasId } }));
        }

        function resizeCanvasInternal() {
            if (!waveformCanvas) return false; const { clientWidth, clientHeight } = waveformCanvas; const roundedWidth = Math.max(10, Math.round(clientWidth)); const roundedHeight = Math.max(10, Math.round(clientHeight));
            if (waveformCanvas.width !== roundedWidth || waveformCanvas.height !== roundedHeight) {
                 waveformCanvas.width = roundedWidth; waveformCanvas.height = roundedHeight; console.log(`WaveformVisualizer (${elementSuffix}): Canvas resized to ${roundedWidth}x${roundedHeight}`);
                 if (waveformCtx) { waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, roundedWidth, roundedHeight); }
                 return true;
            } return false;
        }

        function computeWaveformDataInternal(buffer, targetWidth) {
            // (Computation logic is self-contained, no direct instance state needed here)
            // ... (Paste original computeWaveformData logic here) ...
            if (!buffer || !buffer.getChannelData || targetWidth <= 0) return []; const channelCount = buffer.numberOfChannels; const bufferLength = buffer.length; if (bufferLength === 0) return []; let sourceData; if (channelCount === 1) { sourceData = buffer.getChannelData(0); } else { sourceData = new Float32Array(bufferLength).fill(0); for (let ch = 0; ch < channelCount; ch++) { const channelData = buffer.getChannelData(ch); for (let i = 0; i < bufferLength; i++) { sourceData[i] += channelData[i]; } } for (let i = 0; i < bufferLength; i++) { sourceData[i] /= channelCount; } } const samplesPerPixel = Math.max(1, Math.floor(bufferLength / targetWidth)); const waveform = []; for (let i = 0; i < targetWidth; i++) { const start = Math.floor(i * samplesPerPixel); const end = Math.min(start + samplesPerPixel, bufferLength); if (start >= end) { waveform.push({min: 0, max: 0}); continue; } let min = 1.0, max = -1.0; for (let j = start; j < end; j++) { const sample = sourceData[j]; if (sample < min) min = sample; if (sample > max) max = sample; } waveform.push({min, max}); } return waveform;
        }

        function drawWaveformInternal() {
            // Uses instance variables: waveformCtx, waveformCanvas, cached* data
            if (!waveformCtx || !waveformCanvas) return;
            const Constants = AudioApp.Constants; const Utils = AudioApp.Utils; // Access fresh refs
            const height = waveformCanvas.height; const width = waveformCanvas.width;

            waveformCtx.clearRect(0, 0, width, height); waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, width, height);

            const waveformData = cachedWaveformData; const speechRegions = cachedSpeechRegions; const audioDuration = cachedAudioDuration;
            if (!waveformData || waveformData.length === 0 || !audioDuration || audioDuration <= 0 || width <= 0 || height <= 0) { /* ... draw "No data" ... */ waveformCtx.fillStyle = '#888'; waveformCtx.textAlign = 'center'; waveformCtx.font = '12px sans-serif'; waveformCtx.fillText("No waveform data", width / 2, height / 2); return; }

            const dataLen = waveformData.length; const halfHeight = height / 2;
            const scale = halfHeight * (Constants?.WAVEFORM_HEIGHT_SCALE ?? 0.8);
            const pixelsPerSecond = width / audioDuration;
            const initialDraw = !speechRegions || speechRegions.length === 0;
            const defaultColor = initialDraw ? (Constants?.WAVEFORM_COLOR_LOADING ?? '#888') : (Constants?.WAVEFORM_COLOR_DEFAULT ?? '#268');
            const speechColor = Constants?.WAVEFORM_COLOR_SPEECH ?? '#FD0';

            const speechPixelRegions = initialDraw ? [] : (speechRegions || []).map(r => ({ startPx: r.start * pixelsPerSecond, endPx: r.end * pixelsPerSecond }));
            const pixelWidth = width / dataLen;

            // Draw Default/Loading
            waveformCtx.fillStyle = defaultColor; waveformCtx.beginPath();
            for (let i = 0; i < dataLen; i++) { /* ... drawing logic ... */ const x = i * pixelWidth; let isOutsideSpeech = true; if (!initialDraw) { const currentPixelEnd = x + pixelWidth; for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isOutsideSpeech = false; break; } } } if (isOutsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; waveformCtx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } } waveformCtx.fill();
            // Draw Speech
            if (!initialDraw) { waveformCtx.fillStyle = speechColor; waveformCtx.beginPath(); for (let i = 0; i < dataLen; i++) { /* ... drawing logic ... */ const x = i * pixelWidth; let isInsideSpeech = false; const currentPixelEnd = x + pixelWidth; for (const region of speechPixelRegions) { if (x < region.endPx && currentPixelEnd > region.startPx) { isInsideSpeech = true; break; } } if (isInsideSpeech) { const { min, max } = waveformData[i]; const y1 = halfHeight - max * scale; const y2 = halfHeight - min * scale; waveformCtx.rect(x, y1, pixelWidth, Math.max(1, y2 - y1)); } } waveformCtx.fill(); }
        }

        // --- Public Methods of the Instance ---

        async function computeAndDrawWaveform(audioBuffer, speechRegionsData) {
            if (!waveformCtx || !waveformCanvas) { console.warn(`WaveformVisualizer (${elementSuffix}): Cannot draw - Canvas context/element missing.`); return; }
            if (!audioBuffer) { console.warn(`WaveformVisualizer (${elementSuffix}): AudioBuffer missing, clearing visuals.`); clearVisuals(); return; }
            const resized = resizeCanvasInternal(); const width = waveformCanvas.width; const height = waveformCanvas.height; if (width <= 0 || height <= 0) { console.warn(`WaveformVisualizer (${elementSuffix}): Cannot draw - Invalid dimensions.`); return; }
            console.log(`WaveformVisualizer (${elementSuffix}): Starting compute & draw...`); console.time(`Waveform compute (${elementSuffix})`);
            cachedWaveformData = computeWaveformDataInternal(audioBuffer, width); // Use internal compute
            cachedSpeechRegions = speechRegionsData || null; cachedAudioDuration = audioBuffer.duration;
            console.timeEnd(`Waveform compute (${elementSuffix})`); console.time(`Waveform draw (${elementSuffix})`);
            drawWaveformInternal(); // Use internal draw
            console.timeEnd(`Waveform draw (${elementSuffix})`);
            updateProgressIndicator(0, 0, cachedAudioDuration);
        }

        function redrawWaveformHighlight(speechRegionsData) {
             if (!waveformCtx || !waveformCanvas || !cachedWaveformData || cachedAudioDuration <= 0) { console.warn(`WaveformVisualizer (${elementSuffix}): Cannot redraw highlight - missing context or cached data.`); return; }
             console.log(`WaveformVisualizer (${elementSuffix}): Redrawing waveform highlights...`);
             cachedSpeechRegions = speechRegionsData || null;
             drawWaveformInternal();
        }

        function updateProgressIndicator(globalCurrentTime, trackOffsetSeconds, trackDurationSeconds) {
             // Logging removed for brevity, add back if needed
             if (!waveformCanvas || !waveformProgressIndicator) { return; }
             const canvasWidth = waveformCanvas.clientWidth;
             if (isNaN(trackDurationSeconds) || trackDurationSeconds <= 0 || canvasWidth <= 0) { waveformProgressIndicator.style.left = "0px"; waveformProgressIndicator.className = 'playback-position-indicator inactive'; return; }
             const trackEffectiveTime = globalCurrentTime - trackOffsetSeconds; let indicatorLeft = "0px"; let indicatorClass = 'playback-position-indicator';
             if (trackEffectiveTime < 0) { indicatorLeft = "0px"; indicatorClass += ' inactive'; }
             else if (trackEffectiveTime > trackDurationSeconds) { indicatorLeft = canvasWidth + "px"; indicatorClass += ' inactive'; }
             else { const fraction = trackEffectiveTime / trackDurationSeconds; indicatorLeft = (fraction * canvasWidth) + "px"; }
             waveformProgressIndicator.style.left = indicatorLeft; waveformProgressIndicator.className = indicatorClass;
        }

        function clearVisuals() {
            console.log(`WaveformVisualizer (${elementSuffix}): Clearing visuals and cache.`);
            if (waveformCtx && waveformCanvas) { waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height); waveformCtx.fillStyle = '#000'; waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height); }
            cachedWaveformData = null; cachedSpeechRegions = null; cachedAudioDuration = 0;
            if (waveformProgressIndicator) { updateProgressIndicator(0, 0, 1); } // Reset indicator
        }

        function resizeAndRedraw() {
            if (!waveformCanvas || !waveformCtx) return; const wasResized = resizeCanvasInternal();
            if (wasResized && cachedWaveformData) { console.log(`WaveformVisualizer (${elementSuffix}): Redrawing waveform from cache after resize.`); drawWaveformInternal(); }
            // Update indicator position after resize
            // App.js should trigger the update with correct time after resize event
        }

        // --- Initial setup for the instance ---
        assignDOMElements(); // Assign elements immediately on creation

        // Return the public API for this instance
        return {
            // init method is part of the factory pattern now
            computeAndDrawWaveform,
            redrawWaveformHighlight,
            resizeAndRedraw,
            updateProgressIndicator,
            clearVisuals
        };
    }

    // --- Export Factory ---
    // The IIFE now returns an object with the factory function
    return {
        createInstance: createInstance
    };

})(); // End of AudioApp.waveformVisualizer IIFE
// --- /vibe-player/js/visualizers/waveformVisualizer.js ---