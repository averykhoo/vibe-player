// --- /vibe-player/js/visualizers/waveformVisualizer.js ---
/** @namespace AudioApp */
var AudioApp = AudioApp || {};

/**
 * @namespace AudioApp.waveformVisualizer
 * @description Manages the rendering of an optimized waveform. 
 * Uses a constant-time 64-probe-per-pixel scan to highlight vocal density.
 */
AudioApp.waveformVisualizer = (function () {
    'use strict';

    const Utils = AudioApp.Utils;

    // DOM Elements
    let waveformCanvas = null;
    let waveformCtx = null;
    let waveformProgressIndicator = null;

    /** @type {Object|null} Cached waveform metadata to avoid re-computation */
    let cachedData = null;

    function init() {
        console.log("WaveformVisualizer: Initializing Vocal-Density Engine...");
        assignDOMElements();
        if (waveformCanvas) {
            waveformCanvas.addEventListener('click', handleCanvasClick);
        }
    }

    function assignDOMElements() {
        waveformCanvas = document.getElementById('waveformCanvas');
        waveformProgressIndicator = document.getElementById('waveformProgressIndicator');
        if (waveformCanvas) {
            waveformCtx = waveformCanvas.getContext('2d');
            // Lock internal texture resolution (matches spectrogram for symmetry)
            waveformCanvas.width = Constants.Visualizer.SPEC_TARGET_WIDTH;
            waveformCanvas.height = 400; 
        }
    }

    /**
     * @typedef {object} WaveformSlice
     * @property {number} peak - Max absolute value of the 64 probes.
     * @property {number} body - Average absolute value of the 64 probes.
     */

    /**
     * Optimized scan: Constant time O(Width) regardless of file duration.
     */
    function computeWaveformData(buffer, targetWidth) {
        if (!buffer || targetWidth <= 0) return [];
        const data = buffer.getChannelData(0); // Use Mono for viz
        const numProbes = Constants.Visualizer.WAVEFORM_PROBES_PER_PIXEL || 64;
        const totalSamples = data.length;
        
        const waveform = [];
        const samplesPerPixel = totalSamples / targetWidth;
        const probeStep = samplesPerPixel / numProbes;

        for (let x = 0; x < targetWidth; x++) {
            const pixelStart = x * samplesPerPixel;
            let peak = 0;
            let absSum = 0;

            for (let p = 0; p < numProbes; p++) {
                const sampleIdx = Math.floor(pixelStart + p * probeStep);
                if (sampleIdx >= totalSamples) break;
                
                const val = Math.abs(data[sampleIdx]);
                if (val > peak) peak = val;
                absSum += val;
            }

            waveform.push({
                peak: peak,
                body: absSum / numProbes
            });
        }
        return waveform;
    }

    async function computeAndDrawWaveform(audioBuffer, speechRegions) {
        if (!audioBuffer || !waveformCtx) return;

        const width = waveformCanvas.width;
        const waveformData = computeWaveformData(audioBuffer, width);
        
        // Cache the math so we can redraw highlights/colors without re-scanning samples
        cachedData = { waveformData, duration: audioBuffer.duration };
        
        drawWaveform(waveformData, speechRegions, audioBuffer.duration);
        updateProgressIndicator(0, audioBuffer.duration);
    }

    /**
     * Renders the Dual-Envelope Waveform.
     */
    function drawWaveform(waveformData, speechRegions, duration) {
        const ctx = waveformCtx;
        const C = Constants.Visualizer;
        const { width, height } = waveformCanvas;
        const halfH = height / 2;
        const scale = halfH * C.WAVEFORM_HEIGHT_SCALE;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const pixelsPerSec = width / duration;
        const isSpeech = (x) => {
            if (!speechRegions || speechRegions.length === 0) return false;
            const time = x / pixelsPerSec;
            return speechRegions.some(r => time >= r.start && time <= r.end);
        };

        // 1. Draw the "Peak" Envelope (Transients)
        // Drawn as thin vertical lines for a crisp look
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x++) {
            const { peak } = waveformData[x];
            ctx.strokeStyle = isSpeech(x) ? C.WAVEFORM_COLOR_SPEECH : C.WAVEFORM_COLOR_DEFAULT;
            ctx.globalAlpha = 0.4; // Peak is subtle background
            ctx.beginPath();
            ctx.moveTo(x, halfH - peak * scale);
            ctx.lineTo(x, halfH + peak * scale);
            ctx.stroke();
        }

        // 2. Draw the "Body" Envelope (Vocal Density)
        // Drawn as a solid filled path to highlight the "weight" of speech
        ctx.globalAlpha = 1.0;
        const bodyPath = new Path2D();
        
        // Upper half
        bodyPath.moveTo(0, halfH);
        for (let x = 0; x < width; x++) {
            bodyPath.lineTo(x, halfH - waveformData[x].body * scale * 1.5); // Slightly boost body for visibility
        }
        // Lower half
        for (let x = width - 1; x >= 0; x--) {
            bodyPath.lineTo(x, halfH + waveformData[x].body * scale * 1.5);
        }
        bodyPath.closePath();

        // Color coding for the body
        ctx.fillStyle = C.WAVEFORM_COLOR_DEFAULT;
        ctx.fill(bodyPath);

        // Overlay Speech color on the body path
        if (speechRegions && speechRegions.length > 0) {
            ctx.save();
            ctx.clip(bodyPath);
            ctx.fillStyle = C.WAVEFORM_COLOR_SPEECH;
            for (const r of speechRegions) {
                const xStart = r.start * pixelsPerSec;
                const xEnd = r.end * pixelsPerSec;
                ctx.fillRect(xStart, 0, xEnd - xStart, height);
            }
            ctx.restore();
        }
    }

    function redrawWaveformHighlight(audioBuffer, speechRegions) {
        if (!cachedData) return;
        drawWaveform(cachedData.waveformData, speechRegions, cachedData.duration);
    }

    function handleCanvasClick(e) {
        const rect = waveformCanvas.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction } }));
    }

    function updateProgressIndicator(currentTime, duration) {
        if (!waveformCanvas || !waveformProgressIndicator) return;
        const fraction = isNaN(duration) || duration <= 0 ? 0 : Math.max(0, Math.min(1, currentTime / duration));
        waveformProgressIndicator.style.left = `${fraction * waveformCanvas.clientWidth}px`;
    }

    function clearVisuals() {
        if (waveformCtx) {
            waveformCtx.fillStyle = '#000';
            waveformCtx.fillRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        }
        cachedData = null;
        updateProgressIndicator(0, 1);
    }

    function resizeAndRedraw(audioBuffer, speechRegions) {
        const { currentTime = 0, duration = 0 } = AudioApp.audioEngine?.getCurrentTime() || {};
        updateProgressIndicator(currentTime, duration || (audioBuffer ? audioBuffer.duration : 0));
    }

    return {
        init,
        computeAndDrawWaveform,
        redrawWaveformHighlight,
        resizeAndRedraw,
        updateProgressIndicator,
        clearVisuals
    };
})();