// --- /vibe-player/js/visualizers/spectrogram.worker.js ---
try {
    importScripts('../../lib/fft.js', '../state/constants.js', '../utils.js');
} catch (e) { console.error(e); }

let cachedWarpMap = null;
let cachedSampleRate = 0;

self.onmessage = (event) => {
    const { type, payload } = event.data;
    if (type !== 'compute') return;
    const { channelData, sampleRate, targetWidth } = payload;
    const C = self.Constants;

    if (!cachedWarpMap || cachedSampleRate !== sampleRate) {
        cachedWarpMap = createMelWarpMap(sampleRate, C);
        cachedSampleRate = sampleRate;
    }

    // Pass 1: Flash Pass (Simple warped probe)
    const draftData = computeDraftPass(channelData, sampleRate, C);
    self.postMessage({ type: 'preview', payload: { spectrogramData: draftData } });

    // Pass 2: Forensic Pass (MRSTFT Point-Sampling)
    const finalData = computeForensicPass(channelData, sampleRate, targetWidth, cachedWarpMap, C);
    self.postMessage({ type: 'result', payload: { spectrogramData: finalData } }, [finalData.buffer]);
};

/**
 * Pre-calculates the Mel-frequency lookup table.
 * Each of the 1024 pixels is mapped to an optimal resolution and a fractional bin index.
 */
function createMelWarpMap(sampleRate, C) {
    const numBins = C.Visualizer.SPEC_MEL_BINS;
    const res = C.Visualizer.SPEC_RESOLUTIONS;

    const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
    const melToHz = (m) => 700 * (Math.pow(10, m / 2595) - 1);

    const minHz = 20, maxHz = sampleRate / 2;
    const minMel = hzToMel(minHz), maxMel = hzToMel(maxHz);
    const melStep = (maxMel - minMel) / (numBins - 1);

    const warpMap = [];
    for (let i = 0; i < numBins; i++) {
        const targetHz = melToHz(minMel + i * melStep);

        // Pick optimal resolution based on frequency
        let rIdx = 0;
        if (targetHz > 150) rIdx = 1;
        if (targetHz > 450) rIdx = 2;
        if (targetHz > 1200) rIdx = 3;
        if (targetHz > 3000) rIdx = 4;
        if (targetHz > 7000) rIdx = 5;
        if (targetHz > 12000) rIdx = 6;
        if (targetHz > 18000) rIdx = 7;

        warpMap.push({
            resIdx: rIdx,
            binIdx: targetHz / (sampleRate / res[rIdx])
        });
    }
    return warpMap;
}

function computeForensicPass(data, sampleRate, targetWidth, warpMap, C) {
    const res = C.Visualizer.SPEC_RESOLUTIONS;
    const numBins = C.Visualizer.SPEC_MEL_BINS;
    const hop = data.length / targetWidth;
    const preEmph = C.Visualizer.SPEC_PRE_EMPHASIS;

    const ffts = res.map(s => new self.FFT(s));
    const windows = res.map(s => self.AudioApp.Utils.hannWindow(s));
    const winSums = windows.map(w => self.AudioApp.Utils.getWindowSum(w));
    const output = new Float32Array(targetWidth * numBins);

    for (let col = 0; col < targetWidth; col++) {
        const center = Math.floor(col * hop);
        const fftMags = [];

        for (let r = 0; r < res.length; r++) {
            const size = res[r], half = size / 2, win = windows[r];
            const input = new Float32Array(size);
            for (let j = 0; j < size; j++) {
                const srcIdx = (center - half/2) + j;
                const raw = (srcIdx >= 0 && srcIdx < data.length) ? data[srcIdx] : 0;
                const prev = (srcIdx > 0 && srcIdx < data.length) ? data[srcIdx-1] : 0;
                // PRE-EMPHASIS + WINDOWING
                input[j] = (raw - preEmph * prev) * win[j];
            }
            const comp = ffts[r].createComplexArray();
            ffts[r].realTransform(comp, input);
            const mags = new Float32Array(half);
            const invGain = 1.0 / winSums[r];
            for (let m = 0; m < half; m++) {
                mags[m] = Math.sqrt(comp[m*2]**2 + comp[m*2+1]**2) * invGain;
            }
            fftMags.push(mags);
        }

        for (let b = 0; b < numBins; b++) {
            const map = warpMap[b];
            const fftData = fftMags[map.resIdx];
            // Point-sampling with Linear Interpolation (Keeps lines sharp)
            const i0 = Math.floor(map.binIdx), i1 = i0 + 1;
            const frac = map.binIdx - i0;
            const val = (fftData[i0] || 0) * (1 - frac) + (fftData[i1] || 0) * frac;
            output[col * numBins + b] = 20 * Math.log10(Math.max(1e-10, val));
        }
    }
    return output;
}

function computeDraftPass(data, sampleRate, C) {
    // Similar point-sampling logic but on a single 1024 FFT
    const cols = C.Visualizer.SPEC_DRAFT_COLS, bins = C.Visualizer.SPEC_DRAFT_BINS;
    const fftSize = C.Visualizer.SPEC_DRAFT_FFT_SIZE, fft = new self.FFT(fftSize);
    const hop = data.length / cols, output = new Float32Array(cols * bins);
    const comp = fft.createComplexArray();
    for (let i = 0; i < cols; i++) {
        const input = data.slice(i * hop, i * hop + fftSize);
        if (input.length < fftSize) break;
        fft.realTransform(comp, input);
        for (let j = 0; j < bins; j++) {
            const f = (j / bins) * (sampleRate / 2);
            const idx = Math.round(f / (sampleRate / fftSize));
            output[i * bins + j] = 20 * Math.log10(Math.max(1e-6, Math.sqrt(comp[idx*2]**2 + comp[idx*2+1]**2)));
        }
    }
    return output;
}