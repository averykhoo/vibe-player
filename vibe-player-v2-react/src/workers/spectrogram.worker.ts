// vibe-player-v2-react/src/workers/spectrogram.worker.ts
// vibe-player-v2/src/lib/workers/spectrogram.worker.ts
import type {
  SpectrogramInitPayload,
  SpectrogramProcessPayload,
  SpectrogramResultPayload,
  // SpectrogramResultPayload, // Removed duplicate
  WorkerMessage,
  WorkerPayload, // Generic payload for broader type compatibility in onmessage
} from "@/types/worker.types";
import { SPEC_WORKER_MSG_TYPE } from "@/types/worker.types";

/**
 * @interface FFTClass
 * @description Defines the constructor signature for an FFT class.
 * Used for dynamically loaded FFT libraries.
 */
interface FFTClass {
  new (size: number): FFTInstance;
}

/**
 * @interface FFTInstance
 * @description Defines the instance methods expected from an FFT library object.
 */
interface FFTInstance {
  createComplexArray(): Float32Array; // Method to create a complex array for FFT output
  realTransform(output: Float32Array, input: Float32Array): void; // Performs a real FFT
  // Add other methods like `complexToReal` or `completeSpectrum` if used by the library
}

/**
 * @var FFT
 * @description Global declaration for the FFT class, which will be dynamically assigned
 * after loading the FFT script text.
 * @type {FFTClass | undefined}
 */
// declare var FFT: FFTClass | undefined; // Make it potentially undefined initially // Unused

/**
 * Generates a Hann window array.
 * A Hann window is a taper function used to reduce spectral leakage in FFT processing.
 * @param {number} length - The desired length of the window. Must be a positive integer.
 * @returns {number[] | null} An array representing the Hann window, or null if length is invalid.
 */
function generateHannWindow(length: number): number[] | null {
  if (length <= 0 || !Number.isInteger(length)) {
    console.error("generateHannWindow: Length must be a positive integer.");
    return null;
  }
  const windowArr: number[] = new Array(length);
  if (length === 1) {
    windowArr[0] = 1; // Single point window is just 1
    return windowArr;
  }
  const denom = length - 1;
  for (let i = 0; i < length; i++) {
    // Hann window formula: 0.5 * (1 - cos(2*pi*i / (N-1)))
    windowArr[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
  }
  return windowArr;
}

// Worker state variables
let fftInstance: FFTInstance | null = null;
// let currentSampleRate: number; // Renamed for clarity // Unused
let currentFftSize: number; // Renamed for clarity
let currentHopLength: number; // Renamed for clarity
let currentHannWindow: number[] | null = null; // Renamed for clarity

/**
 * @global self
 * @description Main message handler for the Spectrogram Web Worker.
 * Responds to 'INIT' and 'PROCESS' messages from the main thread.
 * - 'INIT': Initializes the FFT instance and Hann window with provided parameters.
 * - 'PROCESS': Processes PCM audio data to generate spectrogram magnitudes.
 *
 * Messages to main thread:
 * - { type: "INIT_SUCCESS", messageId }
 * - { type: "PROCESS_RESULT", payload: { magnitudes: Float32Array[] }, messageId }
 * - { type: "ERROR_INIT" | "ERROR_PROCESS", error: string, messageId } (Using more specific error types)
 * @param {MessageEvent<WorkerMessage<WorkerPayload>>} event - The message event from the main thread.
 */
self.onmessage = async (event: MessageEvent<WorkerMessage<WorkerPayload>>): Promise<void> => {
  const { type, payload, messageId } = event.data;

  try {
    switch (type) {
      case SPEC_WORKER_MSG_TYPE.INIT: {
        const initPayload = payload as SpectrogramInitPayload;
        if (!initPayload || typeof initPayload.sampleRate !== 'number' ||
            typeof initPayload.fftSize !== 'number' || typeof initPayload.hopLength !== 'number' ||
            typeof initPayload.fftScriptText !== 'string') {
          throw new Error("SpectrogramWorker INIT: Invalid or incomplete payload.");
        }

        // currentSampleRate = initPayload.sampleRate; // Unused
        currentFftSize = initPayload.fftSize;
        currentHopLength = initPayload.hopLength;

        if (!initPayload.fftScriptText) {
          throw new Error("SpectrogramWorker INIT: fftScriptText is missing in payload.");
        }

        // Dynamically create the FFT class from the script text
        // The script text should define a global `FFT` class.
        const getFftClass = new Function(initPayload.fftScriptText + "; return FFT;");
        const FftClassConstructor = getFftClass() as FFTClass | undefined;

        if (typeof FftClassConstructor === "undefined" || typeof FftClassConstructor !== 'function') {
          throw new Error("Failed to define FFT class from fftScriptText. Ensure the script defines 'FFT'.");
        }
        fftInstance = new FftClassConstructor(currentFftSize);
        console.log("SpectrogramWorker: FFT instance created.");

        currentHannWindow = generateHannWindow(currentFftSize);
        if (!currentHannWindow) {
          console.warn("SpectrogramWorker: Failed to generate Hann window, proceeding without windowing.");
        } else {
          console.log("SpectrogramWorker: Hann window generated.");
        }

        self.postMessage({ type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS, messageId } as WorkerMessage<null>);
        break;
      }
      case SPEC_WORKER_MSG_TYPE.PROCESS: {
        if (!fftInstance) {
          throw new Error("Spectrogram worker not initialized. Send 'INIT' message first.");
        }
        const processPayload = payload as SpectrogramProcessPayload;
        if (!processPayload || !processPayload.audioData || !(processPayload.audioData instanceof Float32Array)) {
          throw new Error("SpectrogramWorker PROCESS: Invalid or missing audioData in payload.");
        }
        const audioData = processPayload.audioData;
        const magnitudes: Float32Array[] = [];

        for (let i = 0; (i + currentFftSize) <= audioData.length; i += currentHopLength) {
          const frame = audioData.subarray(i, i + currentFftSize);
          const windowedFrame = new Float32Array(currentFftSize); // Changed from let to const

          if (currentHannWindow && currentHannWindow.length === currentFftSize) {
            for (let j = 0; j < currentFftSize; j++) {
              windowedFrame[j] = frame[j] * currentHannWindow[j];
            }
          } else {
            windowedFrame.set(frame); // No windowing or window length mismatch
          }

          const complexSpectrum = fftInstance.createComplexArray();
          fftInstance.realTransform(complexSpectrum, windowedFrame);

          const frameMagnitudes = new Float32Array(currentFftSize / 2 + 1);
          for (let k = 0; k < frameMagnitudes.length; k++) {
            const real = complexSpectrum[k * 2];
            const imag = complexSpectrum[k * 2 + 1];
            // Magnitude = sqrt(real^2 + imag^2), normalized by fftSize
            frameMagnitudes[k] = Math.sqrt(real * real + imag * imag) / currentFftSize;
          }
          magnitudes.push(frameMagnitudes);
        }

        const resultPayload: SpectrogramResultPayload = { magnitudes };
        self.postMessage({
          type: SPEC_WORKER_MSG_TYPE.PROCESS_RESULT,
          payload: resultPayload,
          messageId,
        } as WorkerMessage<SpectrogramResultPayload>);
        break;
      }
      default: {
        console.warn(`SpectrogramWorker: Received unknown message type: ${type}`);
        // Optionally, send an error message back for unknown types
        self.postMessage({
          type: "UNKNOWN_MESSAGE_ERROR", // Custom error type
          error: `Unknown message type received: ${type}`,
          messageId,
        } as WorkerMessage<null>);
      }
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`Error in SpectrogramWorker (processing type: ${type}):`, error.message, error.stack);
    // Use more specific error types if possible, or a general one
    const errorType = type === SPEC_WORKER_MSG_TYPE.INIT ? "ERROR_INIT" :
                      type === SPEC_WORKER_MSG_TYPE.PROCESS ? "ERROR_PROCESS" :
                      "GENERAL_ERROR";
    self.postMessage({
      type: errorType,
      error: error.message,
      messageId,
    } as WorkerMessage<null>);
  }
};

// Optional: Add an unhandled rejection handler for promises within the worker
self.addEventListener('unhandledrejection', event => {
  console.error('Spectrogram Worker: Unhandled promise rejection:', event.reason);
  self.postMessage({ type: "GENERAL_ERROR", error: event.reason?.message || "Unhandled promise rejection" } as WorkerMessage<null>);
});
