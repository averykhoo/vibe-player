// vibe-player-v2-react/src/services/dtmf.service.ts
const browser = typeof window !== 'undefined'; // Replaces SvelteKit's $app/environment
import DtmfWorker from '../workers/dtmf.worker?worker&inline'; // Adjusted path
import { useDtmfStore } from '../stores/dtmf.store'; // Zustand import

class DtmfService {
  private static instance: DtmfService;
  private worker: Worker | null = null;

  private constructor() {}

  public static getInstance(): DtmfService {
    if (!DtmfService.instance) {
      DtmfService.instance = new DtmfService();
    }
    return DtmfService.instance;
  }

  public initialize(sampleRate: number): void {
    if (!browser) return; // <-- ADD THIS GUARD

    if (this.worker) {
      this.worker.terminate();
    }

    this.worker = new DtmfWorker();

    this.worker.onmessage = (event) => {
      const { type, payload, error } = event.data;
      if (type === "init_complete") {
        useDtmfStore.setState({ status: "idle", error: null });
      } else if (type === "result") {
        useDtmfStore.setState({
          status: "complete",
          dtmf: payload.dtmf,
          cpt: payload.cpt || [],
        });
      } else if (type === "error") {
        useDtmfStore.setState({ status: "error", error: payload });
      }
    };

    this.worker.postMessage({ type: "init", payload: { sampleRate } });
  }

  public async process(audioBuffer: AudioBuffer): Promise<void> {
    // --- ADD THIS GUARD ---
    if (!this.worker) {
      useDtmfStore.setState({
        status: "error",
        error: "DTMF Worker not initialized.",
      });
      return;
    }
    if (
      !audioBuffer ||
      !(audioBuffer instanceof AudioBuffer) ||
      audioBuffer.length === 0
    ) {
      useDtmfStore.setState({
        status: "error",
        error: "DTMF process called with invalid AudioBuffer.",
      });
      return;
    }
    // --- END GUARD ---
    useDtmfStore.setState({
      status: "processing",
      dtmf: [],
      cpt: [],
    });

    // We need to resample the audio to 16kHz for the Goertzel algorithm
    const targetSampleRate = 16000;
    const offlineCtx = new OfflineAudioContext(
      1,
      audioBuffer.duration * targetSampleRate,
      targetSampleRate,
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    try {
      const resampled = await offlineCtx.startRendering();
      const pcmData = resampled.getChannelData(0);
      console.log(
        `[DtmfService] Resampled audio to ${pcmData.length} samples. Sending to worker.`,
      );
      this.worker?.postMessage({ type: "process", payload: { pcmData } });
    } catch (e) {
      const error = e as Error;
      useDtmfStore.setState({
        status: "error",
        error: `Resampling failed: ${error.message}`,
      });
      // Re-throw the error so the caller (like a test) can know it failed.
      throw error;
    }
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    console.log("DtmfService disposed.");
  }
}

export default DtmfService.getInstance();
