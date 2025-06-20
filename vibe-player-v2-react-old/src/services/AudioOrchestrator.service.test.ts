// vibe-player-v2-react/src/services/AudioOrchestrator.service.test.ts
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  // type MockInstance, // Not needed for svelteStoreGetMock anymore
} from "vitest";
// No longer importing get, writable from svelte/store
import { AudioOrchestrator } from "./AudioOrchestrator.service";
import audioEngine from "./audioEngine.service";
// Types for stores (adjust paths)
import type { PlayerState } from "../types/player.types"; // Adjusted path
import type { AnalysisState } from "../types/analysis.types"; // Adjusted path
import type { StatusState } from "../types/status.types"; // Adjusted path

// Import Zustand stores
import { usePlayerStore } from "../stores/player.store";
import { useAnalysisStore } from "../stores/analysis.store";
import { useStatusStore } from "../stores/status.store";

import dtmfService from "./dtmf.service";
import spectrogramService from "./spectrogram.service";
import { updateUrlWithParams } from "../utils/urlState"; // Adjusted path
import { URL_HASH_KEYS } from "../utils/constants"; // Adjusted path
// import { act } from "@testing-library/svelte"; // Not needed

// --- Define Initial States for Tests ---
const initialPlayerState: PlayerState = {
  status: "idle", // Changed from "Idle" to match type
  fileName: null,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  isPlayable: false,
  speed: 1.0,
  pitchShift: 0.0, // Removed 'pitch', ensuring only 'pitchShift'
  gain: 1.0,
  waveformData: undefined,
  error: null,
  audioBuffer: undefined,
  audioContextResumed: false,
  channels: undefined, // Changed from 0
  sampleRate: undefined, // Changed from 0
  lastProcessedChunk: undefined,
};

const initialAnalysisState: AnalysisState = {
  // Removed dtmfResults as it's not in AnalysisState type
  spectrogramData: null,
  // Removed vadEvents as it's not in AnalysisState type
  vadPositiveThreshold: 0.9,
  vadNegativeThreshold: 0.7,
  isSpeaking: undefined, // Changed from false
  vadInitialized: false,
  vadStatus: "idle", // Corrected to match type, was undefined
  vadError: null,
  // Removed vadNoiseFloor, vadSensitivity as they are not in AnalysisState type
  isLoading: false, // Added isLoading as it is in AnalysisState
  spectrogramStatus: undefined, // Added from AnalysisState
  spectrogramError: null, // Added from AnalysisState
  spectrogramInitialized: false, // Added from AnalysisState
  lastVadResult: null, // Added from AnalysisState
  vadStateResetted: undefined, // Added from AnalysisState
};

const initialStatusState: StatusState = {
  message: null,
  type: null,
  isLoading: false,
  details: null,
  progress: null,
};


// --- Service Mocks ---
vi.mock("./audioEngine.service", () => ({
  default: {
    unlockAudio: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn(),
    // getDuration, getSampleRate, getNumberOfChannels are not part of audioEngineService's public API
    // They were likely used to mock values returned by loadFile.
    // The mockAudioBuffer below serves this purpose better.
  },
}));
vi.mock("./dtmf.service", () => ({
  default: { init: vi.fn(), process: vi.fn().mockResolvedValue([]) },
}));
vi.mock("./spectrogram.service", () => ({
  default: {
    init: vi.fn(),
    process: vi.fn().mockResolvedValue(new Float32Array()),
  },
}));
vi.mock("../utils/urlState", () => ({ updateUrlWithParams: vi.fn() })); // Adjusted path

// --- Store Mocks are no longer needed as we use the actual Zustand stores ---

describe("AudioOrchestrator.service.ts", () => {
  let audioOrchestrator: AudioOrchestrator;
  const mockFile = new File([""], "test-audio.mp3", { type: "audio/mpeg" });
  const mockAudioBuffer = {
    duration: 120,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: vi.fn(() => new Float32Array(1024)),
  } as unknown as AudioBuffer; // Keep as is, service expects AudioBuffer

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => { // No longer async
    audioOrchestrator = AudioOrchestrator.getInstance();
    vi.clearAllMocks(); // Clears all mocks

    // Reset Zustand stores
    usePlayerStore.setState({ ...initialPlayerState }, true);
    useAnalysisStore.setState({ ...initialAnalysisState }, true);
    useStatusStore.setState({ ...initialStatusState }, true);

    (audioEngine.loadFile as vi.Mock).mockResolvedValue(mockAudioBuffer);
    // svelteStoreGetMock is no longer needed
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("loadFileAndAnalyze", () => {
    it("should set loading status, update player store, and then set ready status on successful load", async () => {
      await audioOrchestrator.loadFileAndAnalyze(mockFile);

      const finalPlayerState = usePlayerStore.getState();
      expect(finalPlayerState.fileName).toBe(mockFile.name);
      expect(finalPlayerState.duration).toBe(mockAudioBuffer.duration);
      expect(finalPlayerState.sampleRate).toBe(mockAudioBuffer.sampleRate);
      expect(finalPlayerState.channels).toBe(mockAudioBuffer.numberOfChannels);
      expect(finalPlayerState.isPlayable).toBe(true);
      expect(finalPlayerState.status).toBe("Ready");

      expect(useStatusStore.getState()).toEqual(expect.objectContaining({ // Use expect.objectContaining if not all fields are relevant or set
        message: "Ready",
        type: "success",
        isLoading: false,
      }));

      // Verify analysis services were initialized and called
      expect(audioEngine.unlockAudio).toHaveBeenCalled();
      expect(audioEngine.loadFile).toHaveBeenCalledWith(mockFile);
      expect(spectrogramService.init).toHaveBeenCalledWith(
        mockAudioBuffer.sampleRate,
      );
      expect(dtmfService.init).toHaveBeenCalledWith(mockAudioBuffer.sampleRate);
      expect(spectrogramService.process).toHaveBeenCalled();
      expect(dtmfService.process).toHaveBeenCalled();
    });

    it("should set error status in statusStore and playerStore if audioEngine.loadFile fails", async () => {
      const errorMessage = "Failed to load file";
      (audioEngine.loadFile as vi.Mock).mockRejectedValueOnce(
        new Error(errorMessage),
      );

      await audioOrchestrator.loadFileAndAnalyze(mockFile);

      expect(useStatusStore.getState()).toEqual(
        expect.objectContaining({
          message: "File processing failed.",
          type: "error",
          isLoading: false,
          details: errorMessage,
        }),
      );

      const finalPlayerState = usePlayerStore.getState();
      expect(finalPlayerState.status).toBe("Error");
      expect(finalPlayerState.error).toBe(errorMessage);
      expect(finalPlayerState.isPlayable).toBe(false);
      expect(finalPlayerState.duration).toBe(0);
    });

    it("should handle errors from analysis services gracefully", async () => {
      const dtmfError = "DTMF processing failed";
      (dtmfService.process as vi.Mock).mockRejectedValueOnce(
        new Error(dtmfError),
      );

      await audioOrchestrator.loadFileAndAnalyze(mockFile);

      expect(useStatusStore.getState()).toEqual(
        expect.objectContaining({
          message: "Ready",
          type: "success",
          isLoading: false,
        }),
      );
      expect(usePlayerStore.getState().status).toBe("Ready");
    });
  });

  describe("setupUrlSerialization", () => {
    const localInitialPlayerStateForUrlTest: PlayerState = {
      ...initialPlayerState, // Start with base initial state
      speed: 0.75,
      pitchShift: -2.5, // Use pitchShift
      gain: 1.25,
      status: "Ready",
      fileName: "test-audio.mp3",
      isPlayable: true, // Make sure it's playable for test logic
    };

    beforeEach(() => {
      usePlayerStore.setState({ ...localInitialPlayerStateForUrlTest }, true);
    });

    it("should call updateUrlWithParams with correct parameters after debounced interval", () => {
      audioOrchestrator.setupUrlSerialization();
      // Directly use setState on the actual store
      usePlayerStore.setState({ speed: 0.5 });
      vi.runAllTimers();

      expect(updateUrlWithParams).toHaveBeenCalled();
      expect(updateUrlWithParams).toHaveBeenLastCalledWith({
        [URL_HASH_KEYS.SPEED]: "0.50",
        [URL_HASH_KEYS.PITCH]: localInitialPlayerStateForUrlTest.pitchShift.toFixed(1), // Use pitchShift
        [URL_HASH_KEYS.GAIN]: localInitialPlayerStateForUrlTest.gain.toFixed(2),
      });
    });

    it("should use updated values if store changes multiple times before debounce", () => {
      audioOrchestrator.setupUrlSerialization();
      usePlayerStore.setState({ speed: 0.5 });
      usePlayerStore.setState({ speed: 0.8, pitchShift: 1.5 }); // Use pitchShift
      vi.runAllTimers();

      expect(updateUrlWithParams).toHaveBeenCalled();
      expect(updateUrlWithParams).toHaveBeenLastCalledWith({
        [URL_HASH_KEYS.SPEED]: "0.80",
        [URL_HASH_KEYS.PITCH]: "1.5", // Use pitchShift
        [URL_HASH_KEYS.GAIN]: localInitialPlayerStateForUrlTest.gain.toFixed(2),
      });
    });
  });
});
