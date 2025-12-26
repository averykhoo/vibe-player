// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
/** @namespace AudioApp */
var AudioApp = AudioApp || {};

/**
 * @namespace AudioApp.spectrogramVisualizer
 * @description Renders a high-fidelity auditory spectrogram using a two-pass
 * refinement strategy (Flash Pass -> Forensic Pass).
 */
AudioApp.spectrogramVisualizer = (function () {
    'use strict';

    const Utils = AudioApp.Utils;

    // DOM Elements
    let spectrogramCanvas = null;
    let spectrogramCtx = null;
    let spectrogramSpinner = null;
    let spectrogramProgressIndicator = null;

    /** @type {Worker|null} */
    let worker = null;
    /** @type {AudioBuffer|null} Cache for current buffer */
    let lastAudioBuffer = null;
    /** @type {HTMLCanvasElement|null} Hidden canvas for the blurry draft pass */
    let draftCanvas = document.createElement('canvas');

    function init() {
        console.log("SpectrogramVisualizer: Initializing Forensic Engine...");
        assignDOMElements();

        try {
            worker = new Worker('js/visualizers/spectrogram.worker.js');
            worker.onmessage = handleWorkerMessage;
            worker.onerror = (e) => console.error("Spectrogram Worker Error:", e);
        } catch (e) {
            console.error("SpectrogramVisualizer: Failed to create Worker.", e);
        }

        if (spectrogramCanvas) {
            spectrogramCanvas.addEventListener('click', handleCanvasClick);
            // NOTE: Double-click frequency switching removed for Mel/ERB consistency.
        }
    }

    function assignDOMElements() {
        spectrogramCanvas = document.getElementById('spectrogramCanvas');
        spectrogramSpinner = document.getElementById('spectrogramSpinner');
        spectrogramProgressIndicator = document.getElementById('spectrogramProgressIndicator');
        if (spectrogramCanvas) {
            spectrogramCtx = spectrogramCanvas.getContext('2d');
            // Lock internal buffer resolution to Forensic Target
            spectrogramCanvas.width = Constants.Visualizer.SPEC_TARGET_WIDTH; // 2048
            spectrogramCanvas.height = Constants.Visualizer.SPEC_MEL_BINS;    // 1024
        }
    }

    function handleWorkerMessage(event) {
        const {type, payload} = event.data;
        if (!lastAudioBuffer) return;

        if (type === 'preview') {
            // PASS 1: The "Flash Pass" Heatmap
            // Render the 200x64 data and let the GPU blur/stretch it
            renderDataToCanvas(
                payload.spectrogramData,
                Constants.Visualizer.SPEC_DRAFT_COLS,
                Constants.Visualizer.SPEC_DRAFT_BINS,
                true // Interpolate/Blur
            );
        } else if (type === 'result') {
            // PASS 2: The "Forensic Pass" Final
            // Snap to the sharp 2048x512 pixels
            renderDataToCanvas(
                payload.spectrogramData,
                Constants.Visualizer.SPEC_TARGET_WIDTH,
                Constants.Visualizer.SPEC_ERB_BINS,
                false // Pixel-perfect
            );
            showSpinner(false);
        }
    }

    /**
     * Orchestrates the worker computation.
     */
    async function computeAndDrawSpectrogram(audioBuffer) {
        lastAudioBuffer = audioBuffer;
        if (!worker || !spectrogramCanvas) return;

        clearVisuals();
        showSpinner(true);

        const channelData = audioBuffer.getChannelData(0).slice();
        worker.postMessage({
            type: 'compute',
            payload: {
                channelData,
                sampleRate: audioBuffer.sampleRate,
                targetWidth: Constants.Visualizer.SPEC_TARGET_WIDTH
            }
        }, [channelData.buffer]);
    }

    /**
     * Logic for rendering flat Float32 data to the canvas.
     */
    function renderDataToCanvas(data, dataWidth, dataHeight, interpolate) {
        const C = Constants.Visualizer;

        // --- FIX: Ensure these are valid integers (longs) ---
        const width = Math.floor(dataWidth || 2048);
        const height = Math.floor(dataHeight || 1024);

        const tempCanvas = (width === C.SPEC_TARGET_WIDTH) ? spectrogramCanvas : draftCanvas;
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = width;
        tempCanvas.height = height;

        // Use the validated integers here
        const imgData = tempCtx.createImageData(width, height);
        const pixels = imgData.data;
        const dbFloor = C.SPEC_DB_FLOOR;

        for (let i = 0; i < data.length; i++) {
            const db = data[i];
            const normalized = Math.max(0, (db - dbFloor) / Math.abs(dbFloor));
            const [r, g, b] = Utils.viridisColor(normalized);

            // Map flat data to vertical pixels (Time is X, Frequency is Y)
            const x = Math.floor(i / height);
            const y = height - 1 - (i % height);
            const pixelIdx = (y * width + x) * 4;

            if (pixelIdx >= 0 && pixelIdx < pixels.length) {
                pixels[pixelIdx] = r;
                pixels[pixelIdx + 1] = g;
                pixels[pixelIdx + 2] = b;
                pixels[pixelIdx + 3] = 255;
            }
        }

        tempCtx.putImageData(imgData, 0, 0);

        if (tempCanvas !== spectrogramCanvas) {
            spectrogramCtx.imageSmoothingEnabled = true;
            spectrogramCtx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
    }

    function handleCanvasClick(e) {
        const rect = spectrogramCanvas.getBoundingClientRect();
        const fraction = (e.clientX - rect.left) / rect.width;
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', {detail: {fraction}}));
    }

    function updateProgressIndicator(currentTime, duration) {
        if (!spectrogramCanvas || !spectrogramProgressIndicator) return;
        const fraction = isNaN(duration) || duration <= 0 ? 0 : Math.max(0, Math.min(1, currentTime / duration));
        // Use clientWidth for the indicator position (UI space), not internal canvas width (texture space)
        spectrogramProgressIndicator.style.left = `${fraction * spectrogramCanvas.clientWidth}px`;
    }

    function clearVisuals() {
        if (spectrogramCtx) {
            spectrogramCtx.fillStyle = '#000';
            spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
        updateProgressIndicator(0, 1);
    }

    function showSpinner(show) {
        if (spectrogramSpinner) spectrogramSpinner.style.display = show ? 'inline' : 'none';
    }

    function resizeAndRedraw(audioBuffer) {
        // GPU handles scaling; we only need to update the progress line position
        const {currentTime = 0, duration = 0} = AudioApp.audioEngine?.getCurrentTime() || {};
        updateProgressIndicator(currentTime, duration || (audioBuffer ? audioBuffer.duration : 0));
    }

    return {
        init,
        computeAndDrawSpectrogram,
        resizeAndRedraw,
        updateProgressIndicator,
        clearVisuals,
        showSpinner
    };
})();