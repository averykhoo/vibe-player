// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
// Handles drawing the Spectrogram visualization using a Factory Function pattern.

var AudioApp = AudioApp || {}; // Ensure namespace exists

/**
 * Factory function to create a Spectrogram Visualizer instance for a specific track.
 * @param {number} trackIndex - The track index (0 or 1).
 * @param {object} globalFFT - The FFT constructor (dependency injection).
 * @returns {object|null} The visualizer API object or null if init fails.
 */
AudioApp.createSpectrogramVisualizer = function(trackIndex, globalFFT) {
    'use strict';

     // Check if the required FFT library is available
     if (typeof globalFFT === 'undefined') {
        console.error(`SpectrogramVisualizer[${trackIndex}]: CRITICAL - FFT library constructor not provided!`);
        return null; // Cannot initialize without FFT
    }

    // === Module Dependencies ===
    const Constants = AudioApp.Constants;
    const Utils = AudioApp.Utils;

    // === Instance State (Private via closure) ===
    /** @type {HTMLCanvasElement|null} */ let spectrogramCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */ let spectrogramCtx = null;
    /** @type {HTMLSpanElement|null} */ let spectrogramSpinner = null;
    /** @type {HTMLDivElement|null} */ let spectrogramProgressIndicator = null;
    /** @type {HTMLCanvasElement|null} */ let cachedSpectrogramCanvas = null; // Instance-specific cache
    const instanceIndex = trackIndex;

    // === Initialization Logic (Called immediately) ===
    function initInternal() {
        console.log(`SpectrogramVisualizer[${instanceIndex}]: Initializing...`);
        if (!Constants || !Utils) {
            console.error(`SpectrogramVisualizer[${instanceIndex}]: Missing Constants or Utils! Cannot initialize.`);
            return false; // Indicate failure
        }
        assignDOMElements(instanceIndex);

        if (spectrogramCanvas) {
            spectrogramCanvas.addEventListener('click', handleCanvasClick);
        } else {
             console.warn(`SpectrogramVisualizer[${instanceIndex}]: Spectrogram canvas not found.`);
        }
        console.log(`SpectrogramVisualizer[${instanceIndex}]: Initialized.`);
        return true; // Indicate success
    }

    /**
     * Gets references to spectrogram elements for this instance.
     * @param {number} index - The track index (0 or 1).
     * @private
     */
    function assignDOMElements(index) {
         try {
            spectrogramCanvas = document.getElementById(`spectrogramCanvas-track-${index}`);
            spectrogramSpinner = document.getElementById(`spectrogramSpinner-track-${index}`);
            spectrogramProgressIndicator = document.getElementById(`spectrogramProgressIndicator-track-${index}`);
            if (spectrogramCanvas) {
                spectrogramCtx = spectrogramCanvas.getContext('2d');
                 if (!spectrogramCtx) { console.error(`SpectrogramVisualizer[${index}]: Failed to get 2D context.`); }
            }
             if (!spectrogramSpinner) { console.warn(`SpectrogramVisualizer[${index}]: Did not find spinner element.`); }
             if (!spectrogramProgressIndicator) { console.warn(`SpectrogramVisualizer[${index}]: Did not find progress indicator.`); }
        } catch (error) {
             console.error(`SpectrogramVisualizer[${index}]: Error assigning DOM elements:`, error);
             spectrogramCanvas = null; spectrogramCtx = null; spectrogramSpinner = null; spectrogramProgressIndicator = null;
        }
    }

    // === Event Handlers (Private via closure) ===
    /** @private */
     function handleCanvasClick(e) {
        if (!spectrogramCanvas) return;
        const rect = spectrogramCanvas.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const clickXRelative = e.clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, clickXRelative / rect.width));
        document.dispatchEvent(new CustomEvent('audioapp:seekRequested', { detail: { fraction: fraction } }));
    }

    // === Core Drawing & Computation (Private via closure) ===

    /** @private */
    async function computeAndDrawSpectrogramInternal(audioBuffer) {
        if (!audioBuffer) { console.warn(`SpectrogramVisualizer[${instanceIndex}]: AudioBuffer missing.`); return; }
        if (!spectrogramCtx || !spectrogramCanvas) { console.warn(`SpectrogramVisualizer[${instanceIndex}]: Canvas context/element missing.`); return; }
        if (!Constants || !Utils || !globalFFT) { console.error(`SpectrogramVisualizer[${instanceIndex}]: Dependencies missing.`); return; }

        console.log(`SpectrogramVisualizer[${instanceIndex}]: Starting computation and drawing...`);
        const startTime = performance.now();

        clearVisualsInternal();
        resizeCanvasInternal();

        cachedSpectrogramCanvas = null; // Clear instance cache
        showSpinnerInternal(true); // Show instance spinner

        console.time(`Spectrogram compute T${instanceIndex}`);
        const actualFftSize = audioBuffer.duration < Constants.SPEC_SHORT_FILE_FFT_THRESHOLD_S ? Constants.SPEC_SHORT_FFT_SIZE : Constants.SPEC_NORMAL_FFT_SIZE;
        console.log(`SpectrogramVisualizer[${instanceIndex}]: Using FFT Size: ${actualFftSize} for duration ${audioBuffer.duration.toFixed(2)}s`);
        const spectrogramData = computeSpectrogramInternal(audioBuffer, actualFftSize, Constants.SPEC_FIXED_WIDTH);
        console.timeEnd(`Spectrogram compute T${instanceIndex}`);

        if (spectrogramData && spectrogramData.length > 0) {
             console.time(`Spectrogram draw T${instanceIndex} (async)`);
             try {
                await drawSpectrogramAsyncInternal(spectrogramData, spectrogramCanvas, audioBuffer.sampleRate, actualFftSize);
                console.timeEnd(`Spectrogram draw T${instanceIndex} (async)`);
             } catch (error) {
                  console.error(`SpectrogramVisualizer[${instanceIndex}]: Error drawing spectrogram asynchronously -`, error);
                  if (spectrogramCtx && spectrogramCanvas) {
                     spectrogramCtx.fillStyle = '#D32F2F'; spectrogramCtx.textAlign = 'center'; spectrogramCtx.font = '14px sans-serif';
                     spectrogramCtx.fillText(`Error: ${error.message}`, spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);
                  }
             } finally {
                showSpinnerInternal(false);
             }
        } else {
             console.warn(`SpectrogramVisualizer[${instanceIndex}]: Spectrogram computation yielded no data or failed.`);
              if (spectrogramCtx && spectrogramCanvas) {
                 spectrogramCtx.fillStyle = '#888'; spectrogramCtx.textAlign = 'center'; spectrogramCtx.font = '12px sans-serif';
                 spectrogramCtx.fillText("No spectrogram data", spectrogramCanvas.width / 2, spectrogramCanvas.height / 2);
              }
             showSpinnerInternal(false);
        }

        const endTime = performance.now();
        console.log(`SpectrogramVisualizer[${instanceIndex}]: Processing took ${((endTime - startTime)/1000).toFixed(2)}s.`);
        updateProgressIndicatorInternal(0, audioBuffer.duration);
    }

    /** @private */
     function computeSpectrogramInternal(buffer, actualFftSize, targetSlices) {
         if (!buffer?.getChannelData) { console.error(`SpectrogramVisualizer[${instanceIndex}]: Invalid AudioBuffer`); return null; }
         if (!Constants || !Utils) { console.error(`SpectrogramVisualizer[${instanceIndex}]: Constants or Utils not loaded.`); return null; }
         if ((actualFftSize & (actualFftSize - 1)) !== 0 || actualFftSize <= 1) { console.error(`SpectrogramVisualizer[${instanceIndex}]: Invalid FFT size: ${actualFftSize}`); return null; }

         const channelData = buffer.getChannelData(0); const totalSamples = channelData.length; const duration = buffer.duration;
         const hopDivisor = duration < Constants.SPEC_SHORT_FILE_HOP_THRESHOLD_S ? Constants.SPEC_SHORT_HOP_DIVISOR : Constants.SPEC_NORMAL_HOP_DIVISOR;
         const hopSize = Math.max(1, Math.floor(actualFftSize / hopDivisor));
         const padding = Constants.SPEC_CENTER_WINDOWS ? Math.floor(actualFftSize / 2) : 0;
         const rawSliceCount = Constants.SPEC_CENTER_WINDOWS ? Math.ceil(totalSamples / hopSize) : (totalSamples < actualFftSize ? 0 : Math.floor((totalSamples - actualFftSize) / hopSize) + 1);
         if (rawSliceCount <= 0) { console.warn(`SpectrogramVisualizer[${instanceIndex}]: Not enough audio samples for FFT.`); return []; }

         const fftInstance = new globalFFT(actualFftSize); const complexBuffer = fftInstance.createComplexArray(); const fftInput = new Array(actualFftSize); const windowFunc = Utils.hannWindow(actualFftSize); if (!windowFunc) return null;
         const rawSpec = [];
         for (let i = 0; i < rawSliceCount; i++) { const windowCenterSample = i * hopSize; const windowFetchStart = windowCenterSample - padding; for (let j = 0; j < actualFftSize; j++) { const sampleIndex = windowFetchStart + j; let sampleValue; if (sampleIndex < 0) { sampleValue = channelData[0]; } else if (sampleIndex >= totalSamples) { sampleValue = totalSamples > 0 ? channelData[totalSamples - 1] : 0.0; } else { sampleValue = channelData[sampleIndex]; } fftInput[j] = sampleValue * windowFunc[j]; } fftInstance.realTransform(complexBuffer, fftInput); const numBins = actualFftSize / 2; const magnitudes = new Float32Array(numBins); for (let k = 0; k < numBins; k++) { const re = complexBuffer[k * 2]; const im = complexBuffer[k * 2 + 1]; const magSq = (re * re + im * im); magnitudes[k] = Math.sqrt(magSq > 0 ? magSq : 0); } rawSpec.push(magnitudes); }
         const numRawSlices = rawSpec.length; if (numRawSlices === 0) return []; const numFreqBins = rawSpec[0].length; const finalSpec = new Array(targetSlices);
         if (numRawSlices === targetSlices) { for (let i = 0; i < numRawSlices; i++) { finalSpec[i] = rawSpec[i]; } }
         else if (numRawSlices > 0) { for (let i = 0; i < targetSlices; i++) { const rawPos = (numRawSlices > 1) ? (i / (targetSlices - 1)) * (numRawSlices - 1) : 0; const index1 = Math.floor(rawPos); const index2 = Math.min(numRawSlices - 1, Math.ceil(rawPos)); const factor = rawPos - index1; const magnitudes1 = rawSpec[index1]; const magnitudes2 = rawSpec[index2]; finalSpec[i] = new Float32Array(numFreqBins); if (index1 === index2 || factor === 0) { finalSpec[i].set(magnitudes1); } else { for (let k = 0; k < numFreqBins; k++) { finalSpec[i][k] = magnitudes1[k] * (1.0 - factor) + magnitudes2[k] * factor; } } } }
         return finalSpec;
     }

    /** @private */
    function drawSpectrogramAsyncInternal(spectrogramData, canvas, sampleRate, actualFftSize) {
         return new Promise((resolve, reject) => {
            if (!canvas || !spectrogramData?.[0] || !Constants || !Utils) { return reject(new Error("Missing dependencies")); }
            const displayCtx = canvas.getContext('2d'); if (!displayCtx) return reject(new Error("Could not get 2D context"));

            displayCtx.clearRect(0, 0, canvas.width, canvas.height); displayCtx.fillStyle = '#000'; displayCtx.fillRect(0, 0, canvas.width, canvas.height);

            const dataWidth = spectrogramData.length; const displayHeight = canvas.height;
            // Use instance cache
            if (!cachedSpectrogramCanvas || cachedSpectrogramCanvas.width !== dataWidth || cachedSpectrogramCanvas.height !== displayHeight) {
                 cachedSpectrogramCanvas = document.createElement('canvas');
                 cachedSpectrogramCanvas.width = dataWidth; cachedSpectrogramCanvas.height = displayHeight;
                 console.log(`SpectrogramVisualizer[${instanceIndex}]: Created/resized cache canvas (${dataWidth}x${displayHeight})`);
            }
            const offCtx = cachedSpectrogramCanvas.getContext('2d', { willReadFrequently: false });
            if (!offCtx) return reject(new Error("Could not get offscreen context"));

            const computedSlices = dataWidth; const height = displayHeight; const numBins = actualFftSize / 2; const nyquist = sampleRate / 2; const maxBinIndex = Math.min(numBins - 1, Math.floor((Constants.SPEC_MAX_FREQ / nyquist) * (numBins - 1)));
            const dbThreshold = -60; let maxDb = -Infinity; const sliceStep = Math.max(1, Math.floor(computedSlices / 100)); const binStep = Math.max(1, Math.floor(maxBinIndex / 50));
             for (let i = 0; i < computedSlices; i += sliceStep) { const mags = spectrogramData[i]; if (!mags) continue; for (let j = 0; j <= maxBinIndex; j += binStep) { if (j >= mags.length) break; const db = 20 * Math.log10((mags[j] || 0) + 1e-9); maxDb = Math.max(maxDb, Math.max(dbThreshold, db)); } }
             maxDb = Math.max(maxDb, dbThreshold + 1); const minDb = dbThreshold; const dbRange = maxDb - minDb;

            const fullImageData = offCtx.createImageData(computedSlices, height); const data = fullImageData.data; let currentSlice = 0; const chunkSize = 32;

            function drawChunk() {
                try {
                    const startSlice = currentSlice; const endSlice = Math.min(startSlice + chunkSize, computedSlices);
                    for (let i = startSlice; i < endSlice; i++) { if (!spectrogramData[i]) continue; const mags = spectrogramData[i]; if (mags.length !== numBins) continue; for (let y = 0; y < height; y++) { const fr = (height - 1 - y) / (height - 1); const lr = Math.pow(fr, 2.0); const bin = Math.min(maxBinIndex, Math.floor(lr * maxBinIndex)); const mag = mags[bin] || 0; const db = 20 * Math.log10(mag + 1e-9); const cdb = Math.max(minDb, db); const norm = dbRange > 0 ? (cdb - minDb) / dbRange : 0; const [r, g, b] = Utils.viridisColor(norm); const idx = (i + y * computedSlices) * 4; data[idx]=r; data[idx+1]=g; data[idx+2]=b; data[idx+3]=255; } }
                    offCtx.putImageData(fullImageData, 0, 0, startSlice, 0, endSlice - startSlice, height);
                    currentSlice = endSlice;
                    if (currentSlice < computedSlices) { requestAnimationFrame(drawChunk); }
                    else { displayCtx.drawImage(cachedSpectrogramCanvas, 0, 0, canvas.width, canvas.height); resolve(); }
                } catch (error) { console.error(`SpectrogramVisualizer[${instanceIndex}]: Error in drawChunk -`, error); reject(error); }
            }
            requestAnimationFrame(drawChunk);
        });
    }

    // --- UI Update Methods (Private via closure) ---
    /** @private */
    function updateProgressIndicatorInternal(currentTime, duration) {
        if (!spectrogramCanvas || !spectrogramProgressIndicator) return;
        if (isNaN(duration) || duration <= 0) { spectrogramProgressIndicator.style.left = "0px"; return; }
        const fraction = Math.max(0, Math.min(1, currentTime / duration));
        const spectrogramWidth = spectrogramCanvas.clientWidth;
        if (spectrogramWidth > 0) { spectrogramProgressIndicator.style.left = (fraction * spectrogramWidth) + "px"; }
        else { spectrogramProgressIndicator.style.left = "0px"; }
    }

    /** @private */
    function clearVisualsInternal() {
        console.log(`SpectrogramVisualizer[${instanceIndex}]: Clearing visuals and cache.`);
        if (spectrogramCtx && spectrogramCanvas) {
            spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
            spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
        }
        cachedSpectrogramCanvas = null; // Clear instance cache
        updateProgressIndicatorInternal(0, 1);
    }

    /** @private */
    function showSpinnerInternal(show) {
        if (spectrogramSpinner) {
            spectrogramSpinner.style.display = show ? 'inline' : 'none';
        }
    }

    /** @private */
    function resizeCanvasInternal() {
         if (!spectrogramCanvas) return false;
         const { clientWidth, clientHeight } = spectrogramCanvas;
         const roundedWidth = Math.max(10, Math.round(clientWidth));
         const roundedHeight = Math.max(10, Math.round(clientHeight));
         if (spectrogramCanvas.width !== roundedWidth || spectrogramCanvas.height !== roundedHeight) {
            spectrogramCanvas.width = roundedWidth; spectrogramCanvas.height = roundedHeight;
             if(spectrogramCtx) { spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, roundedWidth, roundedHeight); }
             console.log(`SpectrogramVisualizer[${instanceIndex}]: Resized canvas to ${roundedWidth}x${roundedHeight}`);
            return true;
         }
         return false;
    }

    /** @private */
    function resizeAndRedrawInternal(audioBuffer) {
        if (!spectrogramCanvas) return;
        const wasResized = resizeCanvasInternal();
        if (wasResized && cachedSpectrogramCanvas && spectrogramCtx) {
            console.log(`SpectrogramVisualizer[${instanceIndex}]: Redrawing spectrogram from cache after resize.`);
             spectrogramCtx.clearRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
             spectrogramCtx.fillStyle = '#000'; spectrogramCtx.fillRect(0, 0, spectrogramCanvas.width, spectrogramCanvas.height);
             // Use drawImage with scaling arguments
              spectrogramCtx.drawImage(
                 cachedSpectrogramCanvas,
                 0, 0, cachedSpectrogramCanvas.width, cachedSpectrogramCanvas.height, // Source rect
                 0, 0, spectrogramCanvas.width, spectrogramCanvas.height // Destination rect
             );
        } else if (wasResized) {
            clearVisualsInternal();
        }
        // Time update handled by app.js calling updateProgressIndicator separately
    }


    // --- Initialize ---
    if (!initInternal()) {
         return null; // Return null if initialization failed
    }

    // --- Public API ---
    return {
        /** @type {number} */
        trackIndex: instanceIndex,

        /** Computes and draws spectrogram */
        computeAndDrawSpectrogram: async function(audioBuffer) {
             return computeAndDrawSpectrogramInternal(audioBuffer);
        },
        /** Handles resize */
        resizeAndRedraw: function(audioBuffer) {
            resizeAndRedrawInternal(audioBuffer);
        },
        /** Updates progress indicator */
        updateProgressIndicator: function(currentTime, duration) {
            updateProgressIndicatorInternal(currentTime, duration);
        },
        /** Clears the canvas */
        clearVisuals: function() {
            clearVisualsInternal();
        },
        /** Shows/hides spinner */
        showSpinner: function(show) {
            showSpinnerInternal(show);
        }
    };

}; // End of createSpectrogramVisualizer factory

// --- /vibe-player/js/visualizers/spectrogramVisualizer.js ---
