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

    // --- STAGE 1: BLENDED PRE-COMPUTATION ---
    if (!cachedWarpMap || cachedSampleRate !== sampleRate) {
        cachedWarpMap = createBlendedMelWarpMap(sampleRate, C);
        cachedSampleRate = sampleRate;
    }

    // Pass 1: Flash Pass (Simple probe)
    const draftData = computeDraftPass(channelData, sampleRate, C);
    self.postMessage({ type: 'preview', payload: { spectrogramData: draftData } });

    // Pass 2: Forensic Pass (Blended MRSTFT)
    const finalData = computeForensicPass(channelData, sampleRate, targetWidth, cachedWarpMap, C);
    self.postMessage({ type: 'result', payload: { spectrogramData: finalData } }, [finalData.buffer]);
};

/**
 * Creates a Warp Map that supports soft-switching between FFT resolutions.
 * Each bin stores two resolution indices and a blend factor.
 */
function createBlendedMelWarpMap(sampleRate, C) {
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

        // 1. Calculate the ideal window size for this frequency (Heisenberg target)
        // This targets a Q-factor that feels "natural" for speech
        const idealN = (sampleRate * 4.5) / (24.7 * (0.00437 * targetHz + 1));

        // 2. Find the two closest anchor resolutions in our 8-layer stack
        let r0 = 0, r1 = 0;
        for (let r = 0; r < res.length - 1; r++) {
            if (idealN <= res[r] && idealN >= res[r+1]) {
                r0 = r; r1 = r + 1; break;
            }
            if (r === res.length - 2) { r0 = res.length - 2; r1 = res.length - 1; }
        }

        // 3. Calculate blend factor in log2 space for smooth transition
        const v0 = Math.log2(res[r0]), v1 = Math.log2(res[r1]), vI = Math.log2(idealN);
        const blend = Math.max(0, Math.min(1, (v0 - vI) / (v0 - v1)));

        warpMap.push({
            r0, r1, blend,
            bin0: targetHz / (sampleRate / res[r0]),
            bin1: targetHz / (sampleRate / res[r1])
        });
    }
    return warpMap;
}

/**
 * Main computation pass with dual-resolution blending per bin.
 */
function computeForensicPass(data, sampleRate, targetWidth, warpMap, C) {
    const res = C.Visualizer.SPEC_RESOLUTIONS;
    const numBins = C.Visualizer.SPEC_MEL_BINS;
    const hop = data.length / targetWidth;
    const preEmph = C.Visualizer.SPEC_PRE_EMPHASIS;

    const ffts = res.map(s => new self.FFT(s));
    const windows = res.map(s => self.AudioApp.Utils.hannWindow(s));

    // RMS Normalization is critical to keep the noise floor level across windows
    const winNorms = windows.map(w => {
        let s2 = 0;
        for (let i = 0; i < w.length; i++) s2 += w[i] * w[i];
        return Math.sqrt(s2);
    });

    const output = new Float32Array(targetWidth * numBins);
    const fftInputs = res.map(s => new Float32Array(s));
    const complexBuffers = ffts.map(f => f.createComplexArray());

    for (let col = 0; col < targetWidth; col++) {
        const center = Math.floor(col * hop);
        const fftMags = [];

        // Run all 8 FFTs for the current time slice
        for (let r = 0; r < res.length; r++) {
            const size = res[r], win = windows[r], input = fftInputs[r];
            const halfSize = size / 2;
            for (let j = 0; j < size; j++) {
                const srcIdx = (center - halfSize) + j;
                const raw = (srcIdx >= 0 && srcIdx < data.length) ? data[srcIdx] : 0;
                const prev = (srcIdx > 0 && srcIdx < data.length) ? data[srcIdx-1] : 0;
                input[j] = (raw - preEmph * prev) * win[j];
            }
            ffts[r].realTransform(complexBuffers[r], input);

            const mags = new Float32Array(halfSize);
            const comp = complexBuffers[r];
            const invNorm = 1.0 / winNorms[r];
            for (let m = 0; m < halfSize; m++) {
                mags[m] = Math.sqrt(comp[m*2]**2 + comp[m*2+1]**2) * invNorm;
            }
            fftMags.push(mags);
        }

        // Synthesize Bins with Soft Blending
        for (let b = 0; b < numBins; b++) {
            const map = warpMap[b];

            // Sample from First Window (r0)
            const f0 = fftMags[map.r0];
            const i0 = Math.floor(map.bin0);
            const v0 = f0[i0] * (1 - (map.bin0 - i0)) + (f0[i0+1] || 0) * (map.bin0 - i0);

            // Sample from Second Window (r1)
            const f1 = fftMags[map.r1];
            const i1 = Math.floor(map.bin1);
            const v1 = f1[i1] * (1 - (map.bin1 - i1)) + (f1[i1+1] || 0) * (map.bin1 - i1);

            // Cross-fade resolutions to eliminate banding
            const val = (v0 * (1 - map.blend)) + (v1 * map.blend);
            output[col * numBins + b] = 20 * Math.log10(Math.max(1e-12, val));
        }
    }
    return output;
}

/**
 * Simple point-sampling probe for the draft pass.
 */
function computeDraftPass(data, sampleRate, C) {
    const cols = C.Visualizer.SPEC_DRAFT_COLS, bins = C.Visualizer.SPEC_DRAFT_BINS;
    const fftSize = C.Visualizer.SPEC_DRAFT_FFT_SIZE, fft = new self.FFT(fftSize);
    const hop = data.length / cols, output = new Float32Array(cols * bins);
    const comp = fft.createComplexArray();
    const win = self.AudioApp.Utils.hannWindow(fftSize);

    for (let i = 0; i < cols; i++) {
        const start = Math.floor(i * hop);
        const input = new Float32Array(fftSize);
        for(let j=0; j<fftSize; j++) input[j] = (data[start+j] || 0) * win[j];

        fft.realTransform(comp, input);
        for (let j = 0; j < bins; j++) {
            const f = (j / bins) * (sampleRate / 2);
            const idx = Math.round(f / (sampleRate / fftSize));
            output[i * bins + j] = 20 * Math.log10(Math.max(1e-8, Math.sqrt(comp[idx*2]**2 + comp[idx*2+1]**2)));
        }
    }
    return output;
}