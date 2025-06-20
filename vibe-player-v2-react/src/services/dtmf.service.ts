// vibe-player-v2-react/src/services/dtmf.service.ts
const BROWSER = !import.meta.env.SSR;
import DtmfWorker from "@/workers/dtmf.worker?worker";
import { useDtmfStore } from "../stores/dtmf.store"; // Changed to relative path
import type { DtmfWorkerMessageDataIn, DtmfWorkerMessageDataOut } from "@/types/worker.types";


/**
 * @class DtmfService
 * @description A singleton service to manage interactions with the DTMF processing Web Worker.
 * It handles initialization, audio processing for DTMF detection, and worker lifecycle.
 */
class DtmfService {
  private static instance: DtmfService;
  private worker: Worker | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of the DtmfService.
   * @returns {DtmfService} The singleton instance.
   */
  public static getInstance(): DtmfService {
    if (!DtmfService.instance) {
      DtmfService.instance = new DtmfService();
    }
    return DtmfService.instance;
  }

  /**
   * Initializes the DTMF worker. If a worker already exists, it's terminated and a new one is created.
   * @param {number} sampleRate - The sample rate of the audio to be processed.
   * The worker will be initialized with this sample rate.
   */
  public initialize(sampleRate: number): void {
    if (!BROWSER) {
      console.log("DTMF Service: Not running in browser environment. Skipping initialization.");
      return;
    }

    if (this.worker) {
      console.log("DTMF Service: Terminating existing worker before re-initialization.");
      this.worker.terminate();
    }

    this.worker = new DtmfWorker();

    this.worker.onmessage = (event: MessageEvent<DtmfWorkerMessageDataOut>) => {
      const { type, payload, error } = event.data; // Assuming 'error' might be part of the message
      if (error) {
         console.error("DTMF Worker reported an error:", error);
         useDtmfStore.setState({ status: "error", error: typeof error === 'string' ? error : (error as Error).message });
         return;
      }

      switch (type) {
        case "INIT_COMPLETE": // Standardized message type
          useDtmfStore.setState({ status: "idle", error: null });
          break;
        case "RESULT": // Standardized message type
          if (typeof payload === 'object' && payload !== null && 'dtmf' in payload && 'cpt' in payload) {
            useDtmfStore.setState({
              status: "complete",
              dtmf: payload.dtmf || [],
              cpt: payload.cpt || [],
              error: null,
            });
          } else {
            console.warn("DTMF Service: Received RESULT message with invalid payload:", payload);
            useDtmfStore.setState({ status: "error", error: "Invalid payload for RESULT message", dtmf: [], cpt: [] });
          }
          break;
        case "ERROR": // Standardized message type for explicit errors from worker
          console.error("DTMF Worker send ERROR message:", payload);
          useDtmfStore.setState({ status: "error", error: payload as string, dtmf: [], cpt: [] });
          break;
        default:
          console.warn(`DTMF Service: Received unknown message type: ${type}`);
      }
    };

    this.worker.onerror = (err: Event | string) => {
        const errorMsg = err instanceof ErrorEvent ? err.message : typeof err === 'string' ? err : "Unknown DTMF worker error";
        console.error("DTMF Service: Worker onerror triggered:", errorMsg);
        useDtmfStore.setState({ status: "error", error: errorMsg, dtmf: [], cpt: [] });
    };

    const initMessage: DtmfWorkerMessageDataIn = { type: "INIT", payload: { sampleRate } };
    this.worker.postMessage(initMessage);
    useDtmfStore.setState({ status: "initializing", error: null });
  }

  /**
   * Processes an AudioBuffer for DTMF tones.
   * The audio is resampled to 16kHz before sending to the worker.
   * @param {AudioBuffer} audioBuffer - The audio buffer to process.
   * @returns {Promise<void>} A promise that resolves when processing is initiated or rejects on error.
   * @throws {Error} If resampling fails or worker is not initialized.
   */
  public async process(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.worker) {
      const errorMsg = "DTMF Worker not initialized.";
      console.error("DTMF Service:", errorMsg);
      useDtmfStore.setState({ status: "error", error: errorMsg, dtmf: [], cpt: [] });
      throw new Error(errorMsg); // Throw to allow caller to handle
    }
    if (!audioBuffer || !(audioBuffer instanceof AudioBuffer) || audioBuffer.length === 0) {
      const errorMsg = "DTMF process called with invalid AudioBuffer.";
      console.error("DTMF Service:", errorMsg);
      useDtmfStore.setState({ status: "error", error: errorMsg, dtmf: [], cpt: [] });
      throw new Error(errorMsg); // Throw to allow caller to handle
    }

    useDtmfStore.setState({ status: "processing", dtmf: [], cpt: [], error: null });

    const targetSampleRate = 16000; // Required by Goertzel algorithm in worker
    let offlineCtx: OfflineAudioContext;

    try {
        // Ensure OfflineAudioContext is created correctly
        offlineCtx = new OfflineAudioContext(
            audioBuffer.numberOfChannels, // Use original number of channels for resampling context
            audioBuffer.duration * targetSampleRate,
            targetSampleRate,
        );
    } catch(e) {
        const error = e as Error;
        const errorMsg = `Failed to create OfflineAudioContext: ${error.message}`;
        console.error("DTMF Service:", errorMsg, e);
        useDtmfStore.setState({ status: "error", error: errorMsg, dtmf: [], cpt: [] });
        throw new Error(errorMsg);
    }

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    try {
      const resampledAudioBuffer: AudioBuffer = await offlineCtx.startRendering();
      // Assuming mono processing for DTMF, take the first channel.
      // If stereo or multi-channel DTMF is needed, worker and this logic must be adapted.
      const pcmData: Float32Array = resampledAudioBuffer.getChannelData(0);
      console.log(
        `[DtmfService] Resampled audio to ${pcmData.length} samples. Sending to worker.`,
      );

      const processMessage: DtmfWorkerMessageDataIn = { type: "PROCESS", payload: { pcmData } };
      // Transfer array buffer to worker for performance
      this.worker.postMessage(processMessage, [pcmData.buffer]);
    } catch (e) {
      const error = e as Error;
      const errorMsg = `Resampling or posting message to worker failed: ${error.message}`;
      console.error("DTMF Service:", errorMsg, e);
      useDtmfStore.setState({ status: "error", error: errorMsg, dtmf: [], cpt: [] });
      throw error; // Re-throw
    }
  }

  /**
   * Terminates the DTMF worker and cleans up resources.
   */
  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log("DtmfService: Worker terminated.");
    }
    // Optionally reset store state on dispose
    // useDtmfStore.setState({ status: "idle", dtmf: [], cpt: [], error: null });
    console.log("DtmfService disposed.");
  }
}

export default DtmfService.getInstance();
