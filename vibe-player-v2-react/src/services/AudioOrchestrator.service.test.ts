// vibe-player-v2-react/src/services/AudioOrchestrator.service.test.ts
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import { audioOrchestrator } from "./AudioOrchestrator.service"; // Use the actual instance
import audioEngine from "./audioEngine.service";
import type { PlayerState } from "../types/player.types";
import type { AnalysisState } from "../types/analysis.types";
import type { StatusState } from "../types/status.types";

import { usePlayerStore } from "../stores/player.store";
import { useAnalysisStore } from "../stores/analysis.store";
import { useStatusStore } from "../stores/status.store";

import dtmfService from "./dtmf.service";
import spectrogramService from "./spectrogram.service";
import { updateUrlWithParams } from "../utils/urlState";
import { URL_HASH_KEYS, UI_CONSTANTS } from "../utils/constants";


// --- Define Initial States for Tests ---
// It's important that these match the actual structure defined in the types
const initialPlayerState: PlayerState = {
  status: "idle",
  fileName: null,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  isPlayable: false,
  speed: 1.0,
  pitchShift: 0.0,
  gain: 1.0,
  waveformData: undefined,
  error: null,
  audioBuffer: undefined,
  audioContextResumed: false,
  channels: undefined,
  sampleRate: undefined,
  lastProcessedChunk: undefined,
};

const initialAnalysisState: AnalysisState = {
  spectrogramData: null,
  vadPositiveThreshold: 0.5, // Default from AnalysisState
  vadNegativeThreshold: 0.35, // Default from AnalysisState
  isSpeaking: undefined,
  vadInitialized: false,
  vadStatus: "VAD service idle",
  vadError: null,
  isLoading: false,
  spectrogramStatus: "Spectrogram service idle",
  spectrogramError: null,
  spectrogramInitialized: false,
  lastVadResult: null,
  vadStateResetted: undefined,
  // dtmfResults is not part of AnalysisState, it's in DtmfState
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
    // No need to mock getDuration, getSampleRate etc. if loadFile mock returns a complete AudioBuffer
  },
}));
vi.mock("./dtmf.service", () => ({
  default: {
    initialize: vi.fn(), // Changed from init
    process: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("./spectrogram.service", () => ({
  default: {
    initialize: vi.fn(), // Changed from init
    process: vi.fn().mockResolvedValue(new Float32Array()),
  },
}));
vi.mock("../utils/urlState", () => ({ updateUrlWithParams: vi.fn() }));


describe("AudioOrchestrator.service.ts", () => {
  // AudioOrchestrator is a singleton, so we get its instance
  // No need to instantiate it with `new` in tests if we import the singleton.
  // const audioOrchestrator = AudioOrchestrator.getInstance(); // This is already done by named export

  const mockFile = new File([""], "test-audio.mp3", { type: "audio/mpeg" });
  const mockAudioBuffer = {
    duration: 120,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: vi.fn(() => new Float32Array(1024)),
  } as unknown as AudioBuffer;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset Zustand stores to their initial states
    usePlayerStore.setState(initialPlayerState, true);
    useAnalysisStore.setState(initialAnalysisState, true);
    useStatusStore.setState(initialStatusState, true);

    (audioEngine.loadFile as vi.Mock).mockResolvedValue(mockAudioBuffer);
  });

  afterEach(() => {
    vi.clearAllTimers(); // Changed from vi.clearAllTimers() to vi.advanceTimersByTime(0) or runAllTimers if needed
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

      expect(useStatusStore.getState()).toEqual(expect.objectContaining({
        message: "Ready",
        type: "success",
        isLoading: false,
      }));

      expect(audioEngine.unlockAudio).toHaveBeenCalled();
      expect(audioEngine.loadFile).toHaveBeenCalledWith(mockFile);
      expect(spectrogramService.initialize).toHaveBeenCalledWith({sampleRate: mockAudioBuffer.sampleRate});
      expect(dtmfService.initialize).toHaveBeenCalledWith(mockAudioBuffer.sampleRate);
      expect(spectrogramService.process).toHaveBeenCalled();
      expect(dtmfService.process).toHaveBeenCalled();
    });

    it("should set error status in statusStore and playerStore if audioEngine.loadFile fails", async () => {
      const errorMessage = "Failed to load file";
      (audioEngine.loadFile as vi.Mock).mockRejectedValueOnce(new Error(errorMessage));

      await audioOrchestrator.loadFileAndAnalyze(mockFile);

      expect(useStatusStore.getState()).toEqual(expect.objectContaining({
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

    it("should handle errors from analysis services gracefully (e.g., console.error but main flow completes)", async () => {
      const dtmfErrorMsg = "DTMF processing failed";
      (dtmfService.process as vi.Mock).mockRejectedValueOnce(new Error(dtmfErrorMsg));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console.error for this test

      await audioOrchestrator.loadFileAndAnalyze(mockFile);

      // Main flow should still complete successfully
      expect(useStatusStore.getState().type).toBe("success"); // Status should still be success from loading
      expect(usePlayerStore.getState().status).toBe("Ready");
      // Check if the error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Analysis task 0 failed:"), expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe("setupUrlSerialization", () => {
    // Use a fresh initial state for these specific tests to avoid interference
    const urlTestPlayerState: PlayerState = {
      ...initialPlayerState,
      speed: 0.75,
      pitchShift: -2.5,
      gain: 1.25,
      status: "Ready", // Ensure status is something reasonable
      fileName: "test.mp3",
      isPlayable: true, // Important for some logic
    };

    beforeEach(() => {
      usePlayerStore.setState(urlTestPlayerState, true);
    });

    it("should call updateUrlWithParams with correct parameters after debounced interval", () => {
      audioOrchestrator.setupUrlSerialization(); // Call it once

      // Simulate a change that triggers the debounced update
      usePlayerStore.setState({ speed: 0.5 });

      vi.advanceTimersByTime(UI_CONSTANTS.DEBOUNCE_HASH_UPDATE_MS); // Use the correct constant name

      expect(updateUrlWithParams).toHaveBeenCalledTimes(1);
      expect(updateUrlWithParams).toHaveBeenLastCalledWith({
        [URL_HASH_KEYS.SPEED]: "0.50",
        [URL_HASH_KEYS.PITCH_SHIFT]: urlTestPlayerState.pitchShift.toFixed(1), // Use PITCH_SHIFT key
        [URL_HASH_KEYS.GAIN]: urlTestPlayerState.gain.toFixed(2),
      });
    });

    it("should use updated values if store changes multiple times before debounce", () => {
      audioOrchestrator.setupUrlSerialization(); // Call it once

      usePlayerStore.setState({ speed: 0.5 });
      usePlayerStore.setState({ speed: 0.8, pitchShift: 1.5 }); // This is the final state before debounce triggers

      vi.advanceTimersByTime(UI_CONSTANTS.DEBOUNCE_HASH_UPDATE_MS);

      expect(updateUrlWithParams).toHaveBeenCalledTimes(1); // Still only called once
      expect(updateUrlWithParams).toHaveBeenLastCalledWith({
        [URL_HASH_KEYS.SPEED]: "0.80",
        [URL_HASH_KEYS.PITCH_SHIFT]: "1.5", // Use PITCH_SHIFT key
        [URL_HASH_KEYS.GAIN]: urlTestPlayerState.gain.toFixed(2),
      });
    });
  });
});
