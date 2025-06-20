// vibe-player-v2-react/src/services/spectrogram.service.ts
const BROWSER = !import.meta.env.SSR;
import type {
  SpectrogramInitPayload,
  SpectrogramProcessPayload,
  SpectrogramResultPayload,
  WorkerMessage,
  WorkerPayload,
} from "@/types/worker.types";
import { SPEC_WORKER_MSG_TYPE } from "@/types/worker.types";
import { VISUALIZER_CONSTANTS } from "@/utils/constants";
import { useAnalysisStore } from "../stores/analysis.store"; // Changed to relative path
import type { AnalysisState } from "@/types/analysis.types"; // Import AnalysisState
import SpectrogramWorker from "@/workers/spectrogram.worker?worker";

/**
 * @interface PendingRequest
 * @description Structure for managing pending promises for worker messages.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

/**
 * @class SpectrogramService
 * @description A singleton service for managing interactions with the Spectrogram Web Worker.
 * It handles initialization, audio processing for spectrogram generation, and worker lifecycle.
 */
class SpectrogramService {
  private static instance: SpectrogramService;
  private worker: Worker | null = null;
  private isInitialized = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of the SpectrogramService.
   * @returns {SpectrogramService} The singleton instance.
   */
  public static getInstance(): SpectrogramService {
    if (!SpectrogramService.instance) {
      SpectrogramService.instance = new SpectrogramService();
    }
    return SpectrogramService.instance;
  }

  /**
   * Generates a unique message ID for worker communication.
   * @returns {string} A unique message ID string.
   */
  private generateMessageId(): string {
    return `spec_msg_${this.nextMessageId++}`;
  }

  /**
   * Posts a message to the Spectrogram worker and returns a Promise that resolves with the worker's response.
   * @template T - The type of the payload.
   * @param {WorkerMessage<T>} message - The message object to send to the worker.
   * @returns {Promise<unknown>} A promise that resolves with the worker's response or rejects on error.
   */
  private postMessageToWorker<T extends WorkerPayload>(
    message: WorkerMessage<T>,
    transferList?: Transferable[],
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error("Spectrogram Worker not initialized."));
      }
      const messageId = this.generateMessageId();
      this.pendingRequests.set(messageId, { resolve, reject });
      this.worker.postMessage({ ...message, messageId }, transferList || []);
    });
  }

  /**
   * Initializes the Spectrogram worker. Fetches necessary scripts (like FFT script)
   * and sends an INIT message to the worker.
   * @param {{ sampleRate: number }} options - Configuration options, primarily the sample rate.
   * @returns {Promise<void>} A promise that resolves upon successful initialization or rejects on error.
   */
  public async initialize(options: { sampleRate: number }): Promise<void> {
    if (!BROWSER) {
      console.log("Spectrogram Service: Not in browser environment. Skipping initialization.");
      return;
    }

    if (this.isInitialized) {
      console.log("SpectrogramService: Re-initializing. Disposing existing worker first.");
      this.dispose(); // Ensure clean state before re-init
    }
    this.isInitialized = false; // Explicitly set before new initialization starts

    useAnalysisStore.setState((s: AnalysisState) => ({
      ...s,
      spectrogramStatus: "Initializing worker...",
      spectrogramInitialized: false,
      spectrogramError: null,
    }));

    this.worker = new SpectrogramWorker();

    this.worker.onmessage = (event: MessageEvent<WorkerMessage<unknown>>) => {
      const { type, payload, error, messageId } = event.data;
      const request = messageId ? this.pendingRequests.get(messageId) : undefined;

      if (error) {
        const errorMsg = typeof error === "string" ? error : (error as Error).message || "Unknown worker error";
        console.error(`Spectrogram Worker error: ${errorMsg}`, error);
        useAnalysisStore.setState((s: AnalysisState) => ({
          ...s,
          spectrogramError: `Worker error: ${errorMsg}`,
          spectrogramInitialized: false,
          spectrogramStatus: "Error",
        }));
        if (request) request.reject(new Error(errorMsg));
      } else {
        switch (type) {
          case SPEC_WORKER_MSG_TYPE.INIT_SUCCESS:
            this.isInitialized = true;
            useAnalysisStore.setState((s: AnalysisState) => ({
              ...s,
              spectrogramStatus: "Initialized",
              spectrogramInitialized: true,
              spectrogramError: null,
            }));
            if (request) request.resolve(payload);
            break;
          case SPEC_WORKER_MSG_TYPE.PROCESS_RESULT:
            const specResult = payload as SpectrogramResultPayload;
            useAnalysisStore.setState((s: AnalysisState) => ({
              ...s,
              spectrogramData: specResult.magnitudes, // Assuming magnitudes is the primary data
              spectrogramStatus: "Processing complete", // Update status
            }));
            if (request) request.resolve(specResult);
            break;
          default:
            console.warn(`Spectrogram Service: Received unhandled message type ${type}`);
            if (request) request.resolve(payload); // Resolve to avoid hanging promises
        }
      }
      if (messageId && request) this.pendingRequests.delete(messageId);
    };

    this.worker.onerror = (err: Event | string) => {
      const errorMsg = err instanceof ErrorEvent ? err.message : typeof err === "string" ? err : "Unknown Spectrogram worker error";
      console.error(`Spectrogram Worker critical error: ${errorMsg}`, err);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        spectrogramError: `Worker onerror: ${errorMsg}`,
        spectrogramInitialized: false,
        spectrogramStatus: "Error",
      }));
      this.pendingRequests.forEach((req) => req.reject(new Error(`Spectrogram Worker failed critically: ${errorMsg}`)));
      this.pendingRequests.clear();
      this.isInitialized = false; // Critical error, worker is no longer usable
    };

    let fftScriptText: string;
    try {
      const fftResponse = await fetch(VISUALIZER_CONSTANTS.FFT_WORKER_SCRIPT_URL);
      if (!fftResponse.ok) {
        throw new Error(`Failed to fetch FFT script: ${fftResponse.status} ${fftResponse.statusText}`);
      }
      fftScriptText = await fftResponse.text();
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Spectrogram Service: FFT script fetch error: ${errorMessage}`);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        spectrogramError: `FFT script fetch error: ${errorMessage}`,
        spectrogramInitialized: false,
        spectrogramStatus: "Error",
      }));
      // Do not set this.isInitialized = false here as it's already false or will be set by onerror.
      throw new Error(`FFT script fetch failed: ${errorMessage}`); // Rethrow to allow caller to handle
    }

    const initPayload: SpectrogramInitPayload = {
      origin: BROWSER ? window.location.origin : "", // Handle SSR case for origin
      fftScriptText,
      sampleRate: options.sampleRate,
      fftSize: VISUALIZER_CONSTANTS.SPEC_NORMAL_FFT_SIZE,
      hopLength: Math.floor(VISUALIZER_CONSTANTS.SPEC_NORMAL_FFT_SIZE / 4), // Example hop length
    };

    try {
      await this.postMessageToWorker<SpectrogramInitPayload>({
        type: SPEC_WORKER_MSG_TYPE.INIT,
        payload: initPayload,
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Spectrogram Service: Error posting INIT message to worker: ${errorMessage}`);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        spectrogramError: errorMessage,
        spectrogramInitialized: false,
        spectrogramStatus: "Error",
      }));
      // this.isInitialized is already false or will be handled by onerror
      throw new Error(`Spectrogram worker INIT message failed: ${errorMessage}`); // Rethrow
    }
  }

  /**
   * Sends audio data to the worker for spectrogram processing.
   * @param {Float32Array} audioData - The raw audio data (PCM) to process.
   * @returns {Promise<void>} A promise that resolves when processing is complete or rejects on error.
   * @throws {Error} If the worker is not initialized or if posting the message fails.
   */
  public async process(audioData: Float32Array): Promise<void> {
    if (!this.worker || !this.isInitialized) {
      const errorMsg = "Spectrogram worker not initialized or unavailable.";
      console.error("Spectrogram Service:", errorMsg);
      useAnalysisStore.setState((s: AnalysisState) => ({...s, spectrogramStatus: "Error", spectrogramError: errorMsg})); // Added type
      throw new Error(errorMsg);
    }

    useAnalysisStore.setState((s: AnalysisState) => ({
      ...s,
      spectrogramStatus: "Processing audio for spectrogram...",
      spectrogramError: null, // Clear previous errors
    }));

    try {
      // The actual result (spectrogram data) will be set in the store via onmessage
      await this.postMessageToWorker<SpectrogramProcessPayload>(
        {
          type: SPEC_WORKER_MSG_TYPE.PROCESS,
          payload: { audioData },
        },
        [audioData.buffer], // Transferable object
      );
      // Status update to "Processing complete" is now handled in onmessage for PROCESS_RESULT
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`Spectrogram Service: Error during process call: ${errorMessage}`);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        spectrogramStatus: "Processing failed.",
        spectrogramError: errorMessage,
      }));
      throw new Error(`Spectrogram processing failed: ${errorMessage}`); // Rethrow
    }
  }

  /**
   * Terminates the Spectrogram worker and cleans up resources.
   */
  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log("SpectrogramService: Worker terminated.");
    }
    this.isInitialized = false; // Mark as not initialized
    this.pendingRequests.clear();
    useAnalysisStore.setState((s: AnalysisState) => ({
      ...s,
      spectrogramStatus: "Disposed",
      spectrogramData: null, // Clear any existing data
      spectrogramInitialized: false,
      spectrogramError: null,
    }));
    console.log("SpectrogramService disposed.");
  }
}

export default SpectrogramService.getInstance();
