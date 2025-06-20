// vibe-player-v2-react/src/workers/dtmf.worker.ts
// vibe-player-v2/src/lib/workers/dtmf.worker.ts

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION: Constants
// ─────────────────────────────────────────────────────────────────────────────

// --- DTMF Constants directly ported from V1's goertzel.js ---
const DTMF_SAMPLE_RATE = 16000;
const DTMF_BLOCK_SIZE = 410;
const DTMF_RELATIVE_THRESHOLD_FACTOR = 2.0;
const DTMF_ABSOLUTE_MAGNITUDE_THRESHOLD = 4e2;
const DTMF_FREQUENCIES_LOW = [697, 770, 852, 941];
const DTMF_FREQUENCIES_HIGH = [1209, 1336, 1477, 1633];
export const DTMF_CHARACTERS: { [key: string]: string } = {
  "697_1209": "1",
  "697_1336": "2",
  "697_1477": "3",
  "697_1633": "A",
  "770_1209": "4",
  "770_1336": "5",
  "770_1477": "6",
  "770_1633": "B",
  "852_1209": "7",
  "852_1336": "8",
  "852_1477": "9",
  "852_1633": "C",
  "941_1209": "*",
  "941_1336": "0",
  "941_1477": "#",
  "941_1633": "D",
};
// NOTE: CPT constants and classes would be ported here as well for a full implementation.
// For this step, we will focus on DTMF.

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION: DSP Algorithm Implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @class GoertzelFilter
 * @description Implements the Goertzel algorithm to detect the magnitude of a specific frequency
 * within a block of samples. This version is corrected and ported from an original V1 implementation.
 * It is used to efficiently detect the presence of specific frequencies, such as those in DTMF tones.
 */
class GoertzelFilter {
  private q1: number = 0;
  private q2: number = 0;
  private N: number;
  private cosine: number;
  private sine: number;
  private coeff: number;

  /**
   * Creates an instance of GoertzelFilter.
   * @param {number} targetFrequency - The specific frequency to detect.
   * @param {number} sampleRate - The sample rate of the audio signal.
   * @param {number} N - The block size (number of samples) over which to calculate the Goertzel magnitude.
   */
  constructor(
    public targetFrequency: number,
    public sampleRate: number,
    N: number,
  ) {
    this.N = N;
    // Calculate k, the normalized frequency
    const k = Math.floor(0.5 + (this.N * this.targetFrequency) / this.sampleRate);
    const omega = (2 * Math.PI * k) / this.N;
    this.cosine = Math.cos(omega);
    this.sine = Math.sin(omega); // Sine is crucial for correct magnitude calculation
    this.coeff = 2 * this.cosine;
  }

  /**
   * Resets the internal state (q1, q2) of the filter.
   * This should be called before processing a new block of samples if the blocks are independent.
   */
  public reset(): void {
    this.q1 = 0;
    this.q2 = 0;
  }

  /**
   * Processes a block of audio samples through the filter.
   * Updates the internal state (q1, q2) based on the input samples.
   * @param {Float32Array} samples - The block of audio samples to process.
   */
  public processBlock(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      const q0 = samples[i] + this.coeff * this.q1 - this.q2;
      this.q2 = this.q1;
      this.q1 = q0;
    }
  }

  /**
   * Calculates the squared magnitude of the target frequency component in the processed block.
   * The formula used is `q1^2 + q2^2 - q1 * q2 * coeff` which simplifies from the complex representation.
   * @returns {number} The squared magnitude (effectively, power) of the signal at the target frequency.
   */
  public getMagnitudeSquared(): number {
    // Correct magnitude calculation: realPart^2 + imagPart^2
    // realPart = q1 - q2 * cos(omega)
    // imagPart = q2 * sin(omega)
    const realPart = this.q1 - this.q2 * this.cosine;
    const imagPart = this.q2 * this.sine;
    return realPart * realPart + imagPart * imagPart;
  }
}

/**
 * @class DTMFParser
 * @description Parses DTMF tones from audio blocks using a collection of Goertzel filters.
 * It identifies dominant frequencies in the low and high DTMF bands to determine the character.
 */
class DTMFParser {
  private lowGroupFilters: GoertzelFilter[];
  private highGroupFilters: GoertzelFilter[];

  /**
   * Creates an instance of DTMFParser.
   * @param {number} sampleRate - The sample rate of the audio to be processed.
   * @param {number} blockSize - The size of audio blocks to process at a time.
   */
  constructor(
    private sampleRate: number,
    private blockSize: number,
  ) {
    this.lowGroupFilters = DTMF_FREQUENCIES_LOW.map(
      (freq) => new GoertzelFilter(freq, this.sampleRate, this.blockSize),
    );
    this.highGroupFilters = DTMF_FREQUENCIES_HIGH.map(
      (freq) => new GoertzelFilter(freq, this.sampleRate, this.blockSize),
    );
  }

  /**
   * Processes a single block of audio data to detect a DTMF tone.
   * @param {Float32Array} audioBlock - The audio block to analyze.
   * @param {number} timestamp - The timestamp of the beginning of this audio block (for potential future use).
   * @returns {string | null} The detected DTMF character ('0'-'9', '*', '#', 'A'-'D'), or null if no valid tone is detected.
   */
  public processAudioBlock(
    audioBlock: Float32Array,
    timestamp: number, // Added timestamp though not directly used in current DTMF logic here
  ): string | null {
    let maxLowMag = -1,
      detectedLowFreq = -1;
    const lowMagnitudes: { [key: number]: number } = {};
    this.lowGroupFilters.forEach((filter) => {
      filter.reset();
      filter.processBlock(audioBlock);
      const magSq = filter.getMagnitudeSquared();
      lowMagnitudes[filter.targetFrequency] = magSq;
      if (magSq > maxLowMag) {
        maxLowMag = magSq;
        detectedLowFreq = filter.targetFrequency;
      }
    });

    let maxHighMag = -1,
      detectedHighFreq = -1;
    const highMagnitudes: { [key: number]: number } = {};
    this.highGroupFilters.forEach((filter) => {
      filter.reset();
      filter.processBlock(audioBlock);
      const magSq = filter.getMagnitudeSquared();
      highMagnitudes[filter.targetFrequency] = magSq;
      if (magSq > maxHighMag) {
        maxHighMag = magSq;
        detectedHighFreq = filter.targetFrequency;
      }
    });

    // Apply absolute threshold check
    if (
      maxLowMag < DTMF_ABSOLUTE_MAGNITUDE_THRESHOLD ||
      maxHighMag < DTMF_ABSOLUTE_MAGNITUDE_THRESHOLD
    ) {
      return null;
    }

    // Apply relative threshold check to ensure one dominant tone per group
    for (const freq in lowMagnitudes) {
      if (
        Number(freq) !== detectedLowFreq &&
        lowMagnitudes[freq] * DTMF_RELATIVE_THRESHOLD_FACTOR > maxLowMag
      )
        return null;
    }
    for (const freq in highMagnitudes) {
      if (
        Number(freq) !== detectedHighFreq &&
        highMagnitudes[freq] * DTMF_RELATIVE_THRESHOLD_FACTOR > maxHighMag
      )
        return null;
    }

    const dtmfKey = `${detectedLowFreq}_${detectedHighFreq}`;
    return (DTMF_CHARACTERS as Record<string, string>)[dtmfKey] || null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION: Worker Logic
// ─────────────────────────────────────────────────────────────────────────────

import type { DtmfWorkerMessageDataIn, DtmfWorkerMessageDataOut, DtmfInitPayload, DtmfProcessPayload } from "@/types/worker.types"; // Reverted to import type

let dtmfParser: DTMFParser | null = null;

/**
 * Main message handler for the DTMF Web Worker.
 * Responds to 'INIT' and 'PROCESS' messages from the main thread.
 * - 'INIT': Initializes the DTMFParser with the provided sample rate.
 * - 'PROCESS': Processes PCM audio data to detect DTMF tones.
 *
 * Messages to main thread:
 * - { type: "INIT_COMPLETE" }
 * - { type: "RESULT", payload: { dtmf: string[], cpt: string[] } }
 * - { type: "ERROR", payload: string }
 * @param {MessageEvent<DtmfWorkerMessageDataIn>} event - The message event from the main thread.
 */
self.onmessage = (event: MessageEvent<DtmfWorkerMessageDataIn>): void => {
  const { type, payload } = event.data;

  try {
    if (type === "INIT") {
      const initPayload = payload as DtmfInitPayload;
      if (!initPayload || typeof initPayload.sampleRate !== 'number') {
        throw new Error("Initialization payload is invalid or missing sampleRate.");
      }
      // Ensure DTMF_SAMPLE_RATE is used if the worker's internal logic is fixed to it,
      // otherwise, use initPayload.sampleRate if the parser should adapt.
      // For this implementation, DTMF_SAMPLE_RATE is a fixed constant for the Goertzel filters.
      dtmfParser = new DTMFParser(DTMF_SAMPLE_RATE, DTMF_BLOCK_SIZE);
      self.postMessage({ type: "INIT_COMPLETE" } as DtmfWorkerMessageDataOut);
    } else if (type === "PROCESS") {
      if (!dtmfParser) {
        throw new Error("DTMF worker has not been initialized. Send 'INIT' message first.");
      }

      const processPayload = payload as DtmfProcessPayload;
      if (!processPayload || !processPayload.pcmData || !(processPayload.pcmData instanceof Float32Array)) {
        throw new Error("Processing payload is invalid or missing pcmData.");
      }
      const { pcmData } = processPayload;
      const detectedDtmf: string[] = [];

      let lastDetectedDtmf: string | null = null;
      let consecutiveDtmfDetections = 0;
      const minConsecutiveDtmf = 2; // A tone must be stable for this many blocks to be registered

      // Process audio in blocks
      for (let i = 0; (i + DTMF_BLOCK_SIZE) <= pcmData.length; i += DTMF_BLOCK_SIZE) {
        const audioBlock = pcmData.subarray(i, i + DTMF_BLOCK_SIZE);
        const timestamp = i / DTMF_SAMPLE_RATE; // Timestamp for this block
        const tone = dtmfParser.processAudioBlock(audioBlock, timestamp);

        // Confirmation logic: tone must be stable for minConsecutiveDtmf blocks
        if (tone) {
          if (tone === lastDetectedDtmf) {
            consecutiveDtmfDetections++;
          } else {
            lastDetectedDtmf = tone;
            consecutiveDtmfDetections = 1;
          }

          if (consecutiveDtmfDetections === minConsecutiveDtmf &&
              (detectedDtmf.length === 0 || detectedDtmf[detectedDtmf.length - 1] !== tone)) {
            detectedDtmf.push(tone);
          }
        } else {
          lastDetectedDtmf = null;
          consecutiveDtmfDetections = 0;
        }
      }

      // CPT (Call Progress Tones) detection is not implemented in this version.
      self.postMessage({
        type: "RESULT",
        payload: { dtmf: detectedDtmf, cpt: [] },
      } as DtmfWorkerMessageDataOut);
    } else {
      // Handle unknown message types
      console.warn(`DTMF Worker: Received unknown message type: ${type}`);
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.error("DTMF Worker error:", error.message, error.stack);
    self.postMessage({ type: "ERROR", error: error.message } as DtmfWorkerMessageDataOut);
  }
};

// Optional: Add an unhandled rejection handler for promises within the worker
self.addEventListener('unhandledrejection', event => {
  console.error('DTMF Worker: Unhandled promise rejection:', event.reason);
  self.postMessage({ type: "ERROR", error: event.reason?.message || "Unhandled promise rejection" } as DtmfWorkerMessageDataOut);
});
