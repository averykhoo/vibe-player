// vibe-player-v2-react/src/services/AudioOrchestrator.service.ts
// import { get } from "svelte/store"; // Removed
import { usePlayerStore } from '../stores/player.store';
import { useStatusStore } from '../stores/status.store';
import type { StatusState } from '../types/status.types'; // Adjusted path
import { useAnalysisStore } from '../stores/analysis.store';
import audioEngine from "./audioEngine.service";
import dtmfService from "./dtmf.service";
import spectrogramService from "./spectrogram.service";
import { debounce } from '../utils/async'; // Adjusted path
import { updateUrlWithParams } from '../utils/urlState'; // Adjusted path
import { UI_CONSTANTS, URL_HASH_KEYS } from '../utils/constants'; // Adjusted path

export class AudioOrchestrator {
  private static instance: AudioOrchestrator;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AudioOrchestrator {
    if (!AudioOrchestrator.instance) {
      AudioOrchestrator.instance = new AudioOrchestrator();
    }
    return AudioOrchestrator.instance;
  }

  public async loadFileAndAnalyze(file: File): Promise<void> {
    console.log(`[Orchestrator] === Starting New File Load: ${file.name} ===`);
    useStatusStore.setState({
      message: `Loading ${file.name}...`,
      type: "info",
      isLoading: true,
      details: null,
      progress: null,
    });
    // Ensure other relevant stores are reset if that's current behavior (e.g., analysisStore, waveformStore)
    usePlayerStore.setState({
      error: null,
      status: "Loading",
      isPlayable: false,
      fileName: file.name,
      duration: 0,
      currentTime: 0,
    }); // Added fileName and reset duration/currentTime
    useAnalysisStore.setState({
      // ...store, // Spreading previous state is default in Zustand's setState merge
      // dtmfResults: [], // This property does not exist on AnalysisState. It's on DtmfState. Addressed by commenting out.
      spectrogramData: null, // This exists on AnalysisState
    });

    try {
      await audioEngine.unlockAudio();
      const audioBuffer = await audioEngine.loadFile(file);
      // audioEngine.decodeAudioData() is usually part of loadFile or handled by the browser's AudioContext directly

      const duration = audioBuffer.duration;
      const sampleRate = audioBuffer.sampleRate;
      const channels = audioBuffer.numberOfChannels; // Assuming this property exists

      usePlayerStore.setState({
        duration,
        sampleRate,
        channels, // Added channels
        isPlayable: true,
        status: "Ready", // Updated status here
      });
      useStatusStore.setState({ message: "Ready", type: "success", isLoading: false });

      spectrogramService.init(audioBuffer.sampleRate);
      dtmfService.init(audioBuffer.sampleRate);

      console.log("AudioOrchestrator: Starting background analysis tasks.");
      const analysisPromises = [
        dtmfService.process(audioBuffer),
        spectrogramService.process(audioBuffer.getChannelData(0)),
      ];

      const results = await Promise.allSettled(analysisPromises);
      console.log(
        "AudioOrchestrator: All background analysis tasks settled.",
        results,
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `AudioOrchestrator: Analysis task ${index} failed:`,
            result.reason,
          );
          // Optionally, update a specific error state in analysisStore or playerStore
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[Orchestrator] !!! CRITICAL ERROR during file load:`,
        error,
      );
      useStatusStore.setState({
        message: "File processing failed.",
        type: "error",
        isLoading: false,
        details: message,
      });
      // Update playerStore to reflect the error state specifically for the player
      usePlayerStore.setState({
        status: "Error",
        error: message,
        isPlayable: false,
        duration: 0,
        currentTime: 0,
      });
    }
  }

  /**
   * Sets up debounced URL serialization based on player and analysis store changes.
   * @public
   */
  public setupUrlSerialization(): void {
    console.log("[Orchestrator] Setting up URL serialization.");

    const debouncedUpdater = debounce(() => {
      const pStore = usePlayerStore.getState();
      // const aStore = useAnalysisStore.getState(); // Keep this commented out if analysisStore part is not for this step yet

      const params: Record<string, string> = {
        [URL_HASH_KEYS.SPEED]: pStore.speed.toFixed(2),
        [URL_HASH_KEYS.PITCH]: pStore.pitchShift.toFixed(1), // Corrected: pStore.pitch -> pStore.pitchShift
        [URL_HASH_KEYS.GAIN]: pStore.gain.toFixed(2),
        // [URL_HASH_KEYS.VAD_THRESHOLD]: aStore.vadPositiveThreshold.toFixed(2), // Keep commented
        // ... any other relevant params from playerStore that should be serialized
      };

      console.log(
        `[Orchestrator/URL] Debounced update triggered. New params:`,
        params,
      );
      updateUrlWithParams(params); // Make sure updateUrlWithParams is correctly imported/defined
    }, UI_CONSTANTS.DEBOUNCE_TIME_MS_URL_UPDATE);

    usePlayerStore.subscribe(debouncedUpdater);
    // useAnalysisStore.subscribe(debouncedUpdater); // Only subscribe if aStore is used in params
  }
}

export const audioOrchestrator = AudioOrchestrator.getInstance();
