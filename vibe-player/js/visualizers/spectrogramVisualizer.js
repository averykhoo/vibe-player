// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
// Handles drawing the Spectrogram visualization to a canvas element.
// REFACTORED to provide a factory function for creating independent instances.

var AudioApp = AudioApp || {};

AudioApp.spectrogramVisualizer = (function(globalFFT) {
    'use strict';

    // === Dependency Checks ===
     if (typeof globalFFT === 'undefined') { /* ... return dummy interface ... */ console.error("SpectrogramVisualizer Factory: CRITICAL - FFT library constructor not found globally!"); return { createInstance: () => ({ init: ()=>{}, computeAndDrawSpectrogram: ()=>Promise.resolve(), resizeAndRedraw: ()=>{}, updateProgressIndicator: ()=>{}, clearVisuals: ()=>{}, showSpinner: ()=>{} }) }; }

    // === Constants (Shared or passed) ===
    // Fallbacks defined within factory or accessed via AudioApp.Constants

    // === Instance Factory ===
    /**
     * Creates a new Spectrogram Visualizer instance.
     * @param {object} config - Configuration object.
     * @param {string} config.canvasId - The DOM ID of the canvas element.
     * @param {string} config.spinnerId - The DOM ID of the loading spinner span.
     * @param {string} config.indicatorId - The DOM ID of the progress indicator div.
     * @returns {object} A visualizer instance with public methods.
     */
    function createInstance(config) {
        if (!config || !config.canvasId || !config.spinnerId || !config.indicatorId) {
            console.error("SpectrogramVisualizer Factory: Creation failed - Missing IDs in config.");
            return { computeAndDrawSpectrogram: ()=>Promise.resolve(), /* ... dummy methods */ };
        }

        // --- Instance-Specific State & Refs ---
        let spectrogramCanvas = null;
        let spectrogramCtx = null;
        let spectrogramSpinner = null;
        let spectrogramProgressIndicator = null;
        const canvasId = config.canvasId;
        const spinnerId = config.spinnerId;
        const indicatorId = config.indicatorId;
        const elementSuffix = canvasId.includes('_right') ? '_right' : '_left';
        let cachedSpectrogramCanvas = null; // Instance-specific cache
        let cachedAudioDuration = 0;
        let isComputing = false;

        console.log(`SpectrogramVisualizer Instance (${elementSuffix}): Creating for canvas #${canvasId}...`);

        // --- Private Methods (Bound to this instance's state) ---

        function assignDOMElements() {
            spectrogramCanvas = document.getElementById(canvasId);
            spectrogramSpinner = document.getElementById(spinnerId);
            spectrogramProgressIndicator = document.getElementById(indicatorId);
            if (spectrogramCanvas) {
                spectrogramCtx = spectrogramCanvas.getContext('2d');
                if(!spectrogramCtx){ console.error(`SpectrogramVisualizer (${elementSuffix}): Failed to get 2D context.`); }
                else {
                     spectrogramCanvas.addEventListener('click', handleCanvasClick);
                     console.log(`SpectrogramVisualizer (${elementSuffix}): Canvas found and listener added.`);
                }
            } else { console.warn(`SpectrogramVisualizer (${elementSuffix}): Canvas #${canvasId} not found.`); }
            if (!spectrogramSpinner) { console.warn(`SpectrogramVisualizer (${elementSuffix}): Spinner #${spinnerId} not found.`); }
            if (!spectrogramProgressIndicator) { console.warn(`SpectrogramVisualizer (${elementSuffix}): Indicator #${indicatorId} not found.`); }
        }

        function handleCanvasClick(e) {
             if (!spectrogramCanvas) return; const rect = spectrogramCanvas.getBoundingClientRect(); if (!rect || rect.width <= 0) return; const clickXRelative = e.clientX - rect.left; const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
             document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction: fraction, sourceCanvasId: canvasId } }));
        }

        function resizeCanvasInternal() {
            if (!spectrogramCanvas) return false; const { clientWidth, clientHeight } = spectrogramCanvas; const roundedWidth = Math.max(10, Math.round(clientWidth)); const roundedHeight = Math.max(10, Math.round(clientHeight));
            if (spectrogramCanvas.width !== roundedWidth || spectrogramCanvas.height !== roundedHeight) {
                 spectrogramCanvas.width = roundedWidth; spectrogramCanvas.height = roundedHeight; console.log(`SpectrogramVisualizer (${elementSuffix}): Canvas resized to ${roundedWidth}x${roundedHeight}`);
                 if(spectrogramCtx) { spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, roundedWidth, roundedHeight); }
                 return true;
            } return false;
        }

        function showSpinner(show) { // Operates on instance spinner
             if (spectrogramSpinner) { spectrogramSpinner.style.display = show ? 'inline' : 'none'; }
        }

        function computeSpectrogramInternal(buffer, actualFftSize, targetSlices) {
             // (Computation logic is self-contained)
             // Access Constants/Utils via AudioApp.*
             // ... (Paste original computeSpectrogramInternal logic here) ...
             const Constants = AudioApp.Constants; const Utils = AudioApp.Utils; if (!Constants || !Utils) { console.error(`SpectrogramVisualizer (${elementSuffix}): Compute error - Constants or Utils not loaded.`); return null; } if (!buffer?.getChannelData) { console.error(`SpectrogramVisualizer (${elementSuffix}): Invalid AudioBuffer`); return null; } if ((actualFftSize & (actualFftSize - 1)) !== 0 || actualFftSize <= 1) { console.error(`SpectrogramVisualizer (${elementSuffix}): Invalid FFT size: ${actualFftSize}`); return null; } const channelData = buffer.getChannelData(0); const totalSamples = channelData.length; const duration = buffer.duration; const hopThreshold = Constants?.SPEC_SHORT_FILE_HOP_THRESHOLD_S ?? 5.0; const shortHopDivisor = Constants?.SPEC_SHORT_HOP_DIVISOR ?? 8; const normalHopDivisor = Constants?.SPEC_NORMAL_HOP_DIVISOR ?? 4; const centerWindows = Constants?.SPEC_CENTER_WINDOWS ?? true; const hopDivisor = duration < hopThreshold ? shortHopDivisor : normalHopDivisor; const hopSize = Math.max(1, Math.floor(actualFftSize / hopDivisor)); const padding = centerWindows ? Math.floor(actualFftSize / 2) : 0; const rawSliceCount = centerWindows ? Math.ceil(totalSamples / hopSize) : (totalSamples < actualFftSize ? 0 : Math.floor((totalSamples - actualFftSize) / hopSize) + 1); if (rawSliceCount <= 0) { console.warn(`SpectrogramVisualizer (${elementSuffix}): Not enough audio samples for FFT.`); return []; } const fftInstance = new globalFFT(actualFftSize); const complexBuffer = fftInstance.createComplexArray(); const fftInput = new Array(actualFftSize); const windowFunc = Utils.hannWindow(actualFftSize); if (!windowFunc) { console.error(`SpectrogramVisualizer (${elementSuffix}): Failed to create Hann window.`); return null; } const rawSpec = []; for (let i = 0; i < rawSliceCount; i++) { const windowCenterSample = i * hopSize; const windowFetchStart = windowCenterSample - padding; for (let j = 0; j < actualFftSize; j++) { const sampleIndex = windowFetchStart + j; let sampleValue; if (sampleIndex < 0) { sampleValue = channelData[0]; } else if (sampleIndex >= totalSamples) { sampleValue = totalSamples > 0 ? channelData[totalSamples - 1] : 0.0; } else { sampleValue = channelData[sampleIndex]; } fftInput[j] = sampleValue * windowFunc[j]; } fftInstance.realTransform(complexBuffer, fftInput); const numBins = actualFftSize / 2; const magnitudes = new Float32Array(numBins); for (let k = 0; k < numBins; k++) { const re = complexBuffer[k * 2]; const im = complexBuffer[k * 2 + 1]; const magSq = (re * re + im * im); magnitudes[k] = Math.sqrt(magSq > 0 ? magSq : 0); } rawSpec.push(magnitudes); } const numRawSlices = rawSpec.length; if (numRawSlices === 0) return []; const numFreqBins = rawSpec[0].length; const finalSpec = new Array(targetSlices); if (numRawSlices === targetSlices) { for (let i = 0; i < numRawSlices; i++) { finalSpec[i] = rawSpec[i]; } } else if (numRawSlices > 0) { for (let i = 0; i < targetSlices; i++) { const rawPos = (numRawSlices > 1) ? (i / (targetSlices - 1)) * (numRawSlices - 1) : 0; const index1 = Math.floor(rawPos); const index2 = Math.min(numRawSlices - 1, Math.ceil(rawPos)); const factor = rawPos - index1; const magnitudes1 = rawSpec[index1]; const magnitudes2 = rawSpec[index2]; finalSpec[i] = new Float32Array(numFreqBins); if (index1 === index2 || factor === 0) { finalSpec[i].set(magnitudes1); } else { for (let k = 0; k < numFreqBins; k++) { finalSpec[i][k] = magnitudes1[k] * (1.0 - factor) + magnitudes2[k] * factor; } } } } return finalSpec;
        }

        function drawSpectrogramAsyncInternal(spectrogramData, sampleRate, actualFftSize) {
             // Uses instance variables: spectrogramCanvas, spectrogramCtx, cachedSpectrogramCanvas
             // Access Constants/Utils via AudioApp.*
             // ... (Paste original drawSpectrogramAsyncInternal logic here) ...
             return new Promise((resolve, reject) => { const Constants = AudioApp.Constants; const Utils = AudioApp.Utils; if (!spectrogramCanvas || !spectrogramCtx || !spectrogramData?.[0] || !Constants || !Utils) { console.warn(`SpectrogramVisualizer (${elementSuffix}): Missing dependencies for async draw.`); return reject(new Error(`Missing dependencies (${elementSuffix})`)); } spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height); spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height); const dataWidth = spectrogramData.length; const displayHeight = spectrogramCanvas.height; if (!cachedSpectrogramCanvas || cachedSpectrogramCanvas.width !== dataWidth || cachedSpectrogramCanvas.height !== displayHeight) { console.log(`SpectrogramVisualizer (${elementSuffix}): Creating/Resizing cache canvas (${dataWidth}x${displayHeight})...`); cachedSpectrogramCanvas = document.createElement('canvas'); cachedSpectrogramCanvas.width = dataWidth; cachedSpectrogramCanvas.height = displayHeight; } const offCtx = cachedSpectrogramCanvas.getContext('2d', { willReadFrequently: false }); if (!offCtx) return reject(new Error(`Could not get offscreen context (${elementSuffix})`)); const computedSlices = dataWidth; const height = displayHeight; const numBins = actualFftSize / 2; const nyquist = sampleRate / 2; const maxFreq = Constants?.SPEC_MAX_FREQ ?? 12000; const maxBinIndex = Math.min(numBins - 1, Math.floor((maxFreq / nyquist) * (numBins - 1))); const dbThreshold = -60; let maxDb = -Infinity; const sliceStep = Math.max(1, Math.floor(computedSlices / 100)); const binStep = Math.max(1, Math.floor(maxBinIndex / 50)); for (let i = 0; i < computedSlices; i += sliceStep) { const magnitudes = spectrogramData[i]; if (!magnitudes) continue; for (let j = 0; j <= maxBinIndex; j += binStep) { if (j >= magnitudes.length) break; const db = 20 * Math.log10((magnitudes[j] || 0) + 1e-9); maxDb = Math.max(maxDb, Math.max(dbThreshold, db)); } } maxDb = Math.max(maxDb, dbThreshold + 1); const minDb = dbThreshold; const dbRange = maxDb - minDb; const fullImageData = offCtx.createImageData(computedSlices, height); const data = fullImageData.data; let currentSlice = 0; const chunkSize = 32; function drawChunk() { try { const startSlice = currentSlice; const endSlice = Math.min(startSlice + chunkSize, computedSlices); for (let i = startSlice; i < endSlice; i++) { if (!spectrogramData[i]) continue; const magnitudes = spectrogramData[i]; if (magnitudes.length !== numBins) continue; for (let y = 0; y < height; y++) { const freqRatio = (height - 1 - y) / (height - 1); const logFreqRatio = Math.pow(freqRatio, 2.0); const binIndex = Math.min(maxBinIndex, Math.floor(logFreqRatio * maxBinIndex)); const magnitude = magnitudes[binIndex] || 0; const db = 20 * Math.log10(magnitude + 1e-9); const clampedDb = Math.max(minDb, db); const normValue = dbRange > 0 ? (clampedDb - minDb) / dbRange : 0; const [r, g, b] = Utils.viridisColor(normValue); const idx = (i + y * computedSlices) * 4; data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255; } } offCtx.putImageData(fullImageData, 0, 0, startSlice, 0, endSlice - startSlice, height); currentSlice = endSlice; if (currentSlice < computedSlices) { requestAnimationFrame(drawChunk); } else { spectrogramCtx.drawImage(cachedSpectrogramCanvas, 0, 0, spectrogramCanvas.width, spectrogramCanvas.height); console.log(`SpectrogramVisualizer (${elementSuffix}): Async draw complete.`); resolve(); } } catch (error) { console.error(`SpectrogramVisualizer (${elementSuffix}): Error in drawChunk -`, error); reject(error); } } requestAnimationFrame(drawChunk); });
        }

        function clearVisualsInternal() {
            if (spectrogramCtx && spectrogramCanvas) { spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height); spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height); }
            if(spectrogramProgressIndicator) { updateProgressIndicator(0, 0, 1); }
        }

        // --- Public Methods of the Instance ---

        async function computeAndDrawSpectrogram(audioBuffer) {
            if (!spectrogramCtx || !spectrogramCanvas || isComputing) { /* ... warn/return ... */ if (isComputing) console.warn(`SpectrogramVisualizer (${elementSuffix}): Already computing.`); else console.warn(`SpectrogramVisualizer (${elementSuffix}): Cannot draw - context/element missing.`); return; }
            if (!audioBuffer) { /* ... clear visuals ... */ console.warn(`SpectrogramVisualizer (${elementSuffix}): AudioBuffer missing.`); clearVisuals(); return; }
            const Constants = AudioApp.Constants; const Utils = AudioApp.Utils; if (!Constants || !Utils) { console.error(`SpectrogramVisualizer (${elementSuffix}): Dependencies missing.`); return; }

            console.log(`SpectrogramVisualizer (${elementSuffix}): Starting computation and drawing...`); isComputing = true; const startTime = performance.now();
            clearVisualsInternal(); resizeCanvasInternal();
            cachedSpectrogramCanvas = null; showSpinner(true);

            console.time(`Spectrogram compute (${elementSuffix})`);
            const specShortFileThreshold = Constants?.SPEC_SHORT_FILE_FFT_THRESHOLD_S ?? 10.0; const specShortSize = Constants?.SPEC_SHORT_FFT_SIZE ?? 2048; const specNormalSize = Constants?.SPEC_NORMAL_FFT_SIZE ?? 8192; const specFixedWidth = Constants?.SPEC_FIXED_WIDTH ?? 2048;
            const actualFftSize = audioBuffer.duration < specShortFileThreshold ? specShortSize : specNormalSize;
            console.log(`SpectrogramVisualizer (${elementSuffix}): Using FFT Size: ${actualFftSize}`);
            const spectrogramData = computeSpectrogramInternal(audioBuffer, actualFftSize, specFixedWidth);
            console.timeEnd(`Spectrogram compute (${elementSuffix})`);
            cachedAudioDuration = audioBuffer.duration;

            if (spectrogramData && spectrogramData.length > 0) {
                 console.time(`Spectrogram draw async (${elementSuffix})`);
                 try { await drawSpectrogramAsyncInternal(spectrogramData, audioBuffer.sampleRate, actualFftSize); }
                 catch (error) { /* ... error handling ... */ console.error(`SpectrogramVisualizer (${elementSuffix}): Error drawing async -`, error); if(spectrogramCtx && spectrogramCanvas){ spectrogramCtx.fillStyle = '#D32F2F'; spectrogramCtx.textAlign = 'center'; spectrogramCtx.font = '14px sans-serif'; spectrogramCtx.fillText(`Error: ${error.message}`, spectrogramCanvas.width / 2, spectrogramCanvas.height / 2); } }
                 finally { showSpinner(false); isComputing = false; console.timeEnd(`Spectrogram draw async (${elementSuffix})`);}
            } else { /* ... handle no data ... */ console.warn(`SpectrogramVisualizer (${elementSuffix}): No spectrogram data.`); if(spectrogramCtx && spectrogramCanvas){ spectrogramCtx.fillStyle = '#888'; spectrogramCtx.textAlign = 'center'; spectrogramCtx.font = '12px sans-serif'; spectrogramCtx.fillText("No spectrogram data", spectrogramCanvas.width / 2, spectrogramCanvas.height / 2); } showSpinner(false); isComputing = false; }

            const endTime = performance.now(); console.log(`SpectrogramVisualizer (${elementSuffix}): Processing took ${((endTime - startTime)/1000).toFixed(2)}s.`);
            updateProgressIndicator(0, 0, cachedAudioDuration);
        }

            /**
     * Updates the position and style of the progress indicator overlay.
     * @param {number} globalCurrentTime - The current global timeline time in seconds.
     * @param {number} trackOffsetSeconds - The offset of this track in seconds.
     * @param {number} trackDurationSeconds - The total duration of this track's audio in seconds.
     * @public
     */
    function updateProgressIndicator(globalCurrentTime, trackOffsetSeconds, trackDurationSeconds) {
        // *** ADD LOGGING (Ensure it's present) ***
        console.log(`SpectroViz (${elementSuffix}): updateProgressIndicator - globalT=${globalCurrentTime?.toFixed(3)}, offset=${trackOffsetSeconds?.toFixed(3)}, duration=${trackDurationSeconds?.toFixed(3)}`);

        if (!spectrogramCanvas || !spectrogramProgressIndicator) {
             console.log(`SpectroViz (${elementSuffix}): Indicator update skipped - elements missing.`);
             return;
        }
        const canvasWidth = spectrogramCanvas.clientWidth;
        if (isNaN(trackDurationSeconds) || trackDurationSeconds <= 0 || canvasWidth <= 0) {
            console.log(`SpectroViz (${elementSuffix}): Indicator update skipped - invalid state (Dur:${trackDurationSeconds}, Width:${canvasWidth}). Resetting position.`);
            spectrogramProgressIndicator.style.left = "0px";
            spectrogramProgressIndicator.className = 'playback-position-indicator inactive';
            return;
        }

        const trackEffectiveTime = globalCurrentTime - trackOffsetSeconds;
        let indicatorLeft = "0px";
        let indicatorClass = 'playback-position-indicator';
        let state = "pre";

        if (trackEffectiveTime < 0) {
            indicatorLeft = "0px"; indicatorClass += ' inactive'; state = "pre";
        } else if (trackEffectiveTime > trackDurationSeconds) {
            indicatorLeft = canvasWidth + "px"; indicatorClass += ' inactive'; state = "post";
        } else {
            const fraction = trackEffectiveTime / trackDurationSeconds;
            indicatorLeft = (fraction * canvasWidth) + "px"; state = "active";
        }

        // *** ADD LOGGING (Ensure it's present) ***
        console.log(`SpectroViz (${elementSuffix}): effectiveT=${trackEffectiveTime.toFixed(3)}, state=${state}, left=${indicatorLeft}, class=${indicatorClass}`);

        spectrogramProgressIndicator.style.left = indicatorLeft;
        spectrogramProgressIndicator.className = indicatorClass;
    }

        function clearVisuals() {
            console.log(`SpectrogramVisualizer (${elementSuffix}): Clearing visuals and cache.`);
            clearVisualsInternal(); cachedSpectrogramCanvas = null; cachedAudioDuration = 0;
        }

        function resizeAndRedraw() {
            if (!spectrogramCanvas || !spectrogramCtx) return; const wasResized = resizeCanvasInternal();
            if (wasResized && cachedSpectrogramCanvas) {
                 console.log(`SpectrogramVisualizer (${elementSuffix}): Redrawing from cache after resize.`);
                 spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height); spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
                 spectrogramCtx.drawImage( cachedSpectrogramCanvas, 0, 0, cachedSpectrogramCanvas.width, cachedSpectrogramCanvas.height, 0, 0, spectrogramCanvas.width, spectrogramCanvas.height );
            }
            // Update indicator pos after resize
            // const { currentTime = 0, offset = 0 } = {currentTime:0, offset:0}; // Need time from app.js
            // updateProgressIndicator(currentTime, offset, cachedAudioDuration);
        }

        // --- Initial setup ---
        assignDOMElements();

        // --- Public API ---
        return {
            // init method is part of the factory pattern
            computeAndDrawSpectrogram,
            resizeAndRedraw,
            updateProgressIndicator,
            clearVisuals,
            showSpinner // Expose showSpinner for external control if needed
        };
    }

    // --- Export Factory ---
    return {
        createInstance: createInstance
    };

})(window.FFT); // Pass the global FFT constructor
// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---