// vibe-player-v2-react/src/services/analysis.service.ts
const BROWSER = !import.meta.env.SSR; // Vite environment variable
import type {
  SileroVadInitPayload,
  SileroVadProcessPayload,
  SileroVadProcessResultPayload,
  WorkerMessage,
  WorkerPayload,
} from "@/types/worker.types";
import { VAD_WORKER_MSG_TYPE } from "@/types/worker.types";
import { VAD_CONSTANTS } from "@/utils/constants"; // Corrected path assuming constants.ts is in @/utils
import { useAnalysisStore } from "../stores/analysis.store"; // Changed to relative path
import type { AnalysisState } from "@/types/analysis.types"; // Import AnalysisState
// Ensure the worker is correctly imported for Vite. The `?worker&inline` suffix might need adjustment
// depending on Vite version and configuration. Standard Vite worker import:
import SileroVadWorker from "@/workers/sileroVad.worker?worker";

/**
 * Represents a pending request to the worker.
 */
interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

/**
 * Options for initializing the AnalysisService.
 */
interface AnalysisServiceInitializeOptions {
  positiveThreshold?: number;
  negativeThreshold?: number;
}

/**
 * Service for handling audio analysis, particularly Voice Activity Detection (VAD)
 * using a Web Worker. Implemented as a singleton.
 */
class AnalysisService {
  private static instance: AnalysisService;
  private worker: Worker | null = null;
  private isInitialized = false;
  private isInitializing = false;
  private nextMessageId = 0;
  private pendingRequests = new Map<string, PendingRequest>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Gets the singleton instance of the AnalysisService.
   * @returns {AnalysisService} The singleton instance.
   */
  public static getInstance(): AnalysisService {
    if (!AnalysisService.instance) {
      AnalysisService.instance = new AnalysisService();
    }
    return AnalysisService.instance;
  }

  /**
   * Generates a unique message ID for worker communication.
   * @returns {string} A unique message ID.
   */
  private generateMessageId(): string {
    return `vad_msg_${this.nextMessageId++}`;
  }

  /**
   * Posts a message to the VAD worker and returns a promise that resolves with the worker's response.
   * @template T - The type of the payload.
   * @param {WorkerMessage<T>} message - The message to send to the worker.
   * @param {Transferable[]} [transferList] - Optional list of transferable objects.
   * @returns {Promise<unknown>} A promise that resolves with the worker's response or rejects on error.
   */
  private postMessageToWorker<T extends WorkerPayload>(
    message: WorkerMessage<T>,
    transferList?: Transferable[],
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error("VAD Worker not initialized."));
      }
      const messageId = this.generateMessageId();
      this.pendingRequests.set(messageId, { resolve, reject });
      this.worker.postMessage({ ...message, messageId }, transferList || []);
    });
  }

  /**
   * Initializes the VAD worker, loading the ONNX model and configuring the worker.
   * @param {AnalysisServiceInitializeOptions} [options] - Optional configuration for VAD thresholds.
   * @returns {Promise<void>} A promise that resolves when initialization is complete or fails.
   */
  public async initialize(
    options?: AnalysisServiceInitializeOptions,
  ): Promise<void> {
    if (!BROWSER) return;
    if (this.isInitialized || this.isInitializing) {
      console.log(
        "VAD Service: Already initialized or initializing. Skipping.",
      );
      return;
    }
    this.isInitializing = true;
    useAnalysisStore.setState((s: AnalysisState) => ({
      ...s,
      vadStatus: "VAD service initializing...",
      vadInitialized: false,
      vadError: null,
    }));

    this.worker = new SileroVadWorker();

    this.worker.onmessage = (
      event: MessageEvent<WorkerMessage<unknown>>,
    ): void => {
      const { type, payload, error, messageId } = event.data;
      const request = messageId
        ? this.pendingRequests.get(messageId)
        : undefined;

      if (error) {
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        useAnalysisStore.setState((s: AnalysisState) => ({
          ...s,
          vadError: `VAD Worker error: ${errorMsg}`,
        }));
        if (request) request.reject(new Error(errorMsg));

        if (type === VAD_WORKER_MSG_TYPE.INIT_ERROR) {
          this.isInitialized = false;
          this.isInitializing = false;
          useAnalysisStore.setState((s: AnalysisState) => ({
            ...s,
            vadStatus: "Error initializing VAD service.",
            vadInitialized: false,
          }));
        }
      } else {
        switch (type) {
          case VAD_WORKER_MSG_TYPE.INIT_SUCCESS:
            this.isInitialized = true;
            this.isInitializing = false;
            useAnalysisStore.setState((s: AnalysisState) => ({
              ...s,
              vadStatus: "VAD service initialized.",
              vadInitialized: true,
              vadError: null,
            }));
            if (request) request.resolve(payload);
            break;
          case VAD_WORKER_MSG_TYPE.PROCESS_RESULT:
            const resultPayload = payload as SileroVadProcessResultPayload;
            useAnalysisStore.setState((s: AnalysisState) => ({
              ...s,
              lastVadResult: resultPayload,
              isSpeaking: resultPayload.isSpeech, // Assuming isSpeech is part of the payload
            }));
            if (request) request.resolve(resultPayload);
            break;
          case `${VAD_WORKER_MSG_TYPE.RESET}_SUCCESS`: // Note: Template literal types might not work as expected for switch cases
            useAnalysisStore.setState((s: AnalysisState) => ({
              ...s,
              vadStateResetted: true, // Ensure this state property exists in your Zustand store
              lastVadResult: null,
              isSpeaking: false,
            }));
            if (request) request.resolve(payload);
            break;
          default:
            console.warn(`VAD Service: Received unhandled message type ${type}`);
            if (request) request.resolve(payload); // Resolve to avoid hanging promises
        }
      }
      if (messageId && request) this.pendingRequests.delete(messageId);
    };

    this.worker.onerror = (err: Event | string): void => {
      const errorMsg =
        typeof err === "string"
          ? err
          : err instanceof ErrorEvent
          ? err.message
          : "Unknown VAD worker error";
      console.error(`VAD Worker critical error: ${errorMsg}`, err);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        vadStatus: "Critical VAD worker error.",
        vadError: errorMsg,
        vadInitialized: false,
      }));
      this.pendingRequests.forEach((req) =>
        req.reject(new Error(`VAD Worker failed critically: ${errorMsg}`)),
      );
      this.pendingRequests.clear();
      this.isInitialized = false;
      this.isInitializing = false;
    };

    try {
      const modelResponse = await fetch(VAD_CONSTANTS.ONNX_MODEL_URL);
      if (!modelResponse.ok) {
        throw new Error(
          `Failed to fetch ONNX model: ${modelResponse.statusText}`,
        );
      }
      const modelBuffer: ArrayBuffer = await modelResponse.arrayBuffer();

      const initPayload: SileroVadInitPayload = {
        origin: BROWSER ? location.origin : "", // Handle SSR case for origin
        modelBuffer,
        sampleRate: VAD_CONSTANTS.SAMPLE_RATE,
        frameSamples: VAD_CONSTANTS.DEFAULT_FRAME_SAMPLES,
        positiveThreshold:
          options?.positiveThreshold ||
          VAD_CONSTANTS.DEFAULT_POSITIVE_THRESHOLD,
        negativeThreshold:
          options?.negativeThreshold ||
          VAD_CONSTANTS.DEFAULT_NEGATIVE_THRESHOLD,
      };

      await this.postMessageToWorker<SileroVadInitPayload>(
        { type: VAD_WORKER_MSG_TYPE.INIT, payload: initPayload },
        [initPayload.modelBuffer],
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("VAD Service: Initialization failed.", errorMessage);
      this.isInitialized = false;
      this.isInitializing = false;
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        vadStatus: "Error sending VAD init to worker.",
        vadError: errorMessage,
        vadInitialized: false,
      }));
      // Rethrow to allow caller to handle, or handle more gracefully here
      throw new Error(`VAD Initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Analyzes a single audio frame for voice activity.
   * @param {Float32Array} audioFrame - The audio frame to analyze.
   * @param {number} [timestamp] - Optional timestamp for the frame.
   * @returns {Promise<SileroVadProcessResultPayload | null>} The VAD result, or null on error.
   */
  public async analyzeAudioFrame(
    audioFrame: Float32Array,
    timestamp?: number,
  ): Promise<SileroVadProcessResultPayload | null> {
    if (!this.worker || !this.isInitialized) {
      const errorMsg = "VAD Service not initialized or worker unavailable.";
      console.warn(errorMsg);
      useAnalysisStore.setState((s: AnalysisState) => ({ ...s, vadError: errorMsg }));
      // Consider if throwing an error or returning null/specific object is better
      throw new Error(errorMsg);
    }

    const payload: SileroVadProcessPayload = { audioFrame, timestamp };
    try {
      const result = (await this.postMessageToWorker<SileroVadProcessPayload>(
        { type: VAD_WORKER_MSG_TYPE.PROCESS, payload },
        [payload.audioFrame.buffer],
      )) as SileroVadProcessResultPayload; // Type assertion
      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`Error processing VAD frame: ${errorMessage}`, error);
      useAnalysisStore.setState((s: AnalysisState) => ({
        ...s,
        vadError: `Error processing VAD frame: ${errorMessage}`,
      }));
      return null; // Or rethrow, depending on desired error handling
    }
  }

  /**
   * Terminates the VAD worker and cleans up resources.
   */
  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log("VAD Worker terminated.");
    }
    this.pendingRequests.clear();
    this.nextMessageId = 0;
    this.isInitialized = false;
    this.isInitializing = false;
    useAnalysisStore.setState((s: AnalysisState) => ({
      ...s,
      vadStatus: "VAD service disposed.",
      vadInitialized: false,
      lastVadResult: null,
      isSpeaking: undefined, // Use undefined for "unknown" or initial state
      vadError: null,
    }));
    console.log("AnalysisService disposed.");
  }
}

export default AnalysisService.getInstance();
