// vibe-player-v2-react/src/services/AudioOrchestrator.service.ts
import { usePlayerStore } from "../stores/player.store"; // Changed to relative path
import type { PlayerState } from "@/types/player.types";
import { useStatusStore } from "../stores/status.store"; // Changed to relative path
import type { StatusState } from "@/types/status.types"; // Added StatusState type for setState
import { useAnalysisStore } from "../stores/analysis.store"; // Changed to relative path
import type { AnalysisState } from "@/types/analysis.types";
import audioEngine from "./audioEngine.service";
import dtmfService from "./dtmf.service";
import spectrogramService from "./spectrogram.service";
import { debounce } from "@/utils/async";
import { updateUrlWithParams } from "@/utils/urlState";
import { UI_CONSTANTS, URL_HASH_KEYS } from "@/utils/constants";

/**
 * Orchestrates audio loading, analysis, and state management.
 * Implemented as a singleton.
 */
export class AudioOrchestrator {
  private static instance: AudioOrchestrator;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of the AudioOrchestrator.
   * @returns {AudioOrchestrator} The singleton instance.
   */
  public static getInstance(): AudioOrchestrator {
    if (!AudioOrchestrator.instance) {
      AudioOrchestrator.instance = new AudioOrchestrator();
    }
    return AudioOrchestrator.instance;
  }

  /**
   * Loads an audio file, analyzes it for DTMF tones and spectrogram,
   * and updates relevant stores.
   * @param {File} file - The audio file to process.
   * @returns {Promise<void>} A promise that resolves when processing is complete or fails.
   */
  public async loadFileAndAnalyze(file: File): Promise<void> {
    console.log(`[Orchestrator] === Starting New File Load: ${file.name} ===`);
    useStatusStore.setState((s: StatusState) => ({ // Added StatusState type
      ...s, // Preserve other state if any
      message: `Loading ${file.name}...`,
      type: "info",
      isLoading: true,
      details: null,
      progress: null,
    })); // Added semicolon

    usePlayerStore.setState((s: PlayerState) => ({
      ...s,
      error: null,
      status: "Loading",
      isPlayable: false,
      fileName: file.name,
      duration: 0,
      currentTime: 0 // Removed trailing comma here just in case, though unlikely the cause
    })); // Added semicolon
    useAnalysisStore.setState((store: AnalysisState) => ({
      ...store,
      dtmfResults: [],
      spectrogramData: null // Removed trailing comma
    })); // Added semicolon

    try {
      await audioEngine.unlockAudio();
      const audioBuffer: AudioBuffer = await audioEngine.loadFile(file);

      const duration: number = audioBuffer.duration;
      const sampleRate: number = audioBuffer.sampleRate;
      const channels: number = audioBuffer.numberOfChannels;

      usePlayerStore.setState((s: PlayerState) => ({
        ...s,
        duration,
        sampleRate,
        channels,
        isPlayable: true,
        status: "Ready" // Removed trailing comma
      }));
    useStatusStore.setState((s: StatusState) => ({ // Added StatusState type
      ...s,
      message: "Ready",
      type: "success",
      isLoading: false,
      details: null,
      progress: null // Removed trailing comma
    })); // Added semicolon

      spectrogramService.initialize({ sampleRate: audioBuffer.sampleRate });
      dtmfService.initialize(audioBuffer.sampleRate);

      console.log("AudioOrchestrator: Starting background analysis tasks.");
      const analysisPromises = [
        dtmfService.process(audioBuffer),
        spectrogramService.process(audioBuffer.getChannelData(0)), // Assuming mono for spectrogram for now
      ];

      const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(analysisPromises);
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
      useStatusStore.setState((s: StatusState) => ({ // Added StatusState type
        ...s,
        message: "File processing failed.",
        type: "error",
        isLoading: false,
        details: message,
        progress: null // Removed trailing comma
      })); // Added semicolon
      usePlayerStore.setState((s: PlayerState) => ({
        ...s,
        status: "Error",
        error: message,
        isPlayable: false,
        duration: 0,
        currentTime: 0 // Removed trailing comma
      })); // Added semicolon
    }
  }

  /**
   * Sets up debounced URL serialization based on player store changes.
   * This function should be called once during application initialization.
   * @public
   */
  public setupUrlSerialization(): void {
    console.log("[Orchestrator] Setting up URL serialization.");

    // Zustand's subscribe method is used for listening to store changes.
    // The listener receives the new state and the previous state.
    // const unsubPlayer = // Marked as unused, removing
    usePlayerStore.subscribe(
      (state: PlayerState, prevState: PlayerState) => {
        // Check if relevant parts of the state have changed to avoid unnecessary updates
        if (
          state.speed !== prevState.speed ||
          state.pitchShift !== prevState.pitchShift || // Corrected: state.pitch to state.pitchShift
          state.gain !== prevState.gain
          // Add other relevant pStore properties if needed
        ) {
          debouncedUrlUpdate();
        }
      },
    );

    // If you also need to react to analysisStore changes for URL serialization:
    // const unsubAnalysis = useAnalysisStore.subscribe(
    //   (state: AnalysisState, prevState: AnalysisState) => { // Added types
    //     if (state.vadPositiveThreshold !== prevState.vadPositiveThreshold) {
    //       debouncedUrlUpdate();
    //     }
    //   }
    // );

    // Consider returning the unsubscribe functions if they need to be called on cleanup
    // e.g., return () => { unsubPlayer(); unsubAnalysis(); };
    // For a singleton service, this might not be necessary unless the app can fully "reset".
  }
}

/**
 * Debounced function to update URL parameters.
 * This is defined outside the class or as a private static method if preferred.
 */
const debouncedUrlUpdate = debounce(() => {
  const pStore = usePlayerStore.getState();
  // const aStore = useAnalysisStore.getState(); // Uncomment if analysis params are needed

  const params: Record<string, string> = {
    [URL_HASH_KEYS.SPEED]: pStore.speed.toFixed(2),
    [URL_HASH_KEYS.PITCH_SHIFT]: pStore.pitchShift.toFixed(1), // Corrected: PITCH to PITCH_SHIFT, pStore.pitch to pStore.pitchShift
    [URL_HASH_KEYS.GAIN]: pStore.gain.toFixed(2),
    // [URL_HASH_KEYS.VAD_THRESHOLD]: aStore.vadPositiveThreshold.toFixed(2), // Uncomment if needed
  };

  console.log(
    `[Orchestrator/URL] Debounced update triggered. New params:`,
    params,
  );
  updateUrlWithParams(params);
}, UI_CONSTANTS.DEBOUNCE_HASH_UPDATE_MS); // Corrected: DEBOUNCE_TIME_MS_URL_UPDATE to DEBOUNCE_HASH_UPDATE_MS


export const audioOrchestrator = AudioOrchestrator.getInstance();
