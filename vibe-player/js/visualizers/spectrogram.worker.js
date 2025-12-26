// --- /vibe-player/js/visualizers/spectrogram.worker.js ---

// 1. Import Dependencies
try {
    importScripts('../../lib/fft.js', '../state/constants.js', '../utils.js');
} catch (e) {
    console.error("Spectrogram Worker: Failed to import scripts.", e);
}

/** @type {Object} Cached filterbank mapping matrix */
let cachedFilterMap = null;
/** @type {number} Cached sample rate for the current map */
let cachedSampleRate = 0;

// 2. Listen for Messages
self.onmessage = (event) => {
    const { type, payload } = event.data;
    if (type !== 'compute') return;

    const { channelData, sampleRate, targetWidth } = payload;
    const Utils = self.AudioApp.Utils;

    // --- STAGE 1: PRE-COMPUTATION ---
    // Generate the Auditory Matrix if sample rate changed or first run
    if (!cachedFilterMap || cachedSampleRate !== sampleRate) {
        cachedFilterMap = createForensicFilterMap(sampleRate, self.Constants, Utils);
        cachedSampleRate = sampleRate;
    }

    // --- STAGE 2: PASS 1 - THE FLASH PASS (~0.05s) ---
    // Sparse probe to fill the UI instantly with a hazy heatmap
    const draftData = computeDraftPass(channelData, sampleRate, self.Constants);
    self.postMessage({ type: 'preview', payload: { spectrogramData: draftData } });

    // --- STAGE 3: PASS 2 - THE FORENSIC PASS (0.3s - 0.5s) ---
    // Full 8-layer MRSTFT for razor-sharp formants
    const finalData = computeForensicPass(channelData, sampleRate, targetWidth, cachedFilterMap, self.Constants, Utils);

    // Send final result as a single Float32Array (flat) for transfer performance
    self.postMessage({ type: 'result', payload: { spectrogramData: finalData } }, [finalData.buffer]);
};

/**
 * Creates the mapping from 512 auditory bins to the 8-layer FFT stack.
 */
function createForensicFilterMap(sampleRate, C, Utils) {
    const numBins = C.Visualizer.SPEC_ERB_BINS;
    const resolutions = C.Visualizer.SPEC_RESOLUTIONS;
    const minFreq = 20;
    const maxFreq = sampleRate / 2;

    const camMin = Utils.freqToCam(minFreq);
    const camMax = Utils.freqToCam(maxFreq);
    const camStep = (camMax - camMin) / (numBins - 1);

    const filterMap = [];

    for (let i = 0; i < numBins; i++) {
        const centerFreq = Utils.camToFreq(camMin + i * camStep);
        const erbWidth = Utils.getERBWidth(centerFreq);

        // 1. Find the "Ideal" theoretical resolution
        // We target an FFT bin width that is 1/4 of the ERB bandwidth
        const idealN = (sampleRate * 4) / erbWidth;

        // 2. Identify the two surrounding resolutions in our 8-layer stack
        let idxLow = 0;
        let idxHigh = 0;
        for (let r = 0; r < resolutions.length - 1; r++) {
            if (idealN <= resolutions[r] && idealN >= resolutions[r+1]) {
                idxLow = r;
                idxHigh = r + 1;
                break;
            }
            if (r === resolutions.length - 2) {
                idxLow = resolutions.length - 2;
                idxHigh = resolutions.length - 1;
            }
        }

        // 3. Calculate log-linear blend factor between the two window sizes
        const valLow = Math.log2(resolutions[idxLow]);
        const valHigh = Math.log2(resolutions[idxHigh]);
        const valIdeal = Math.log2(idealN);
        const blend = (valLow - valIdeal) / (valLow - valHigh);
        const clampedBlend = Math.max(0, Math.min(1, blend));

        // 4. Generate Filter Weights for BOTH resolutions
        const genWeights = (N) => {
            const binFreqStep = sampleRate / N;
            const startIdx = Math.max(0, Math.floor((centerFreq - 2 * erbWidth) / binFreqStep));
            const endIdx = Math.min(N / 2 - 1, Math.ceil((centerFreq + 2 * erbWidth) / binFreqStep));
            const indices = [];
            const weights = [];
            let weightSum = 0;
            for (let j = startIdx; j <= endIdx; j++) {
                const f = j * binFreqStep;
                const w = Utils.gammatoneMagnitude(f, centerFreq, erbWidth, C.Visualizer.SPEC_GAMMATONE_ORDER);
                indices.push(j);
                weights.push(w);
                weightSum += w;
            }
            return {
                indices: new Int32Array(indices),
                weights: new Float32Array(weights.map(w => w / (weightSum || 1)))
            };
        };

        filterMap.push({
            idxLow,
            idxHigh,
            blend: clampedBlend,
            lowRes: genWeights(resolutions[idxLow]),
            highRes: genWeights(resolutions[idxHigh])
        });
    }
    return filterMap;
}

/**
 * FAST DRAFT: Sparse 1024-FFT probe to fill UI instantly.
 */
function computeDraftPass(data, sampleRate, C) {
    const cols = C.Visualizer.SPEC_DRAFT_COLS;
    const bins = C.Visualizer.SPEC_DRAFT_BINS;
    const fftSize = C.Visualizer.SPEC_DRAFT_FFT_SIZE;
    const fft = new self.FFT(fftSize);
    const hop = data.length / cols;

    const output = new Float32Array(cols * bins);
    const complex = fft.createComplexArray();

    for (let i = 0; i < cols; i++) {
        const start = Math.floor(i * hop);
        const input = data.slice(start, start + fftSize);
        if (input.length < fftSize) break;

        fft.realTransform(complex, input);

        for (let j = 0; j < bins; j++) {
            // Nearest-neighbor auditory scaling for draft pass
            const targetFreq = (j / bins) * (sampleRate / 2);
            const fftIdx = Math.round(targetFreq / (sampleRate / fftSize));
            const re = complex[fftIdx * 2], im = complex[fftIdx * 2 + 1];
            const mag = Math.sqrt(re * re + im * im);
            output[i * bins + j] = 20 * Math.log10(Math.max(1e-6, mag));
        }
    }
    return output;
}

/**
 * FORENSIC PASS: Full 8-layer MRSTFT synthesis.
 */
function computeForensicPass(data, sampleRate, targetWidth, filterMap, C, Utils) {
    const res = C.Visualizer.SPEC_RESOLUTIONS;
    const numBins = C.Visualizer.SPEC_ERB_BINS;
    const dbFloor = C.Visualizer.SPEC_DB_FLOOR;
    const hopSize = data.length / targetWidth;

    const ffts = res.map(size => new self.FFT(size));
    const windows = res.map(size => Utils.hannWindow(size));
    const winSums = windows.map(w => Utils.getWindowSum(w));

    // Result is a flat array: [col0_bin0, col0_bin1... colN_binM]
    const output = new Float32Array(targetWidth * numBins);

    // Reuse buffers to minimize GC pressure
    const fftInputs = res.map(size => new Float32Array(size));
    const complexBuffers = ffts.map(f => f.createComplexArray());

    for (let col = 0; col < targetWidth; col++) {
        const center = Math.floor(col * hopSize);

        // 1. Run the 8-layer stack for this time slice
        const fftMags = [];

        // Run all 8 FFTs for the current slice
        for (let r = 0; r < res.length; r++) {
            const size = res[r];
            const input = fftInputs[r];
            const window = windows[r];
            const half = size / 2;

            // Safe Centered Read with Zero Padding
            for (let j = 0; j < size; j++) {
                const srcIdx = (center - half) + j;
                input[j] = (srcIdx >= 0 && srcIdx < data.length) ? data[srcIdx] * window[j] : 0;
            }

            ffts[r].realTransform(complexBuffers[r], input);

            // Extract magnitudes and normalize by coherent gain (winSum)
            const mags = new Float32Array(half);
            const comp = complexBuffers[r];
            const invGain = 1.0 / winSums[r];
            for (let m = 0; m < half; m++) {
                mags[m] = Math.sqrt(comp[m*2]**2 + comp[m*2+1]**2) * invGain;
            }
            fftMags.push(mags);
        }

        // Blend 512 Bins across resolutions
        for (let b = 0; b < numBins; b++) {
            const map = filterMap[b];

            // Calculate Low Resolution Contribution
            let lowSum = 0;
            const lowSource = fftMags[map.idxLow];
            for (let k = 0; k < map.lowRes.indices.length; k++) {
                lowSum += lowSource[map.lowRes.indices[k]] * map.lowRes.weights[k];
            }

            // Calculate High Resolution Contribution
            let highSum = 0;
            const highSource = fftMags[map.idxHigh];
            for (let k = 0; k < map.highRes.indices.length; k++) {
                highSum += highSource[map.highRes.indices[k]] * map.highRes.weights[k];
            }

            // Perform Soft Blend
            const finalMag = (lowSum * (1 - map.blend)) + (highSum * map.blend);
            const db = 20 * Math.log10(Math.max(1e-10, finalMag));
            output[col * numBins + b] = Math.max(dbFloor, db);
        }
    }
    return output;
}