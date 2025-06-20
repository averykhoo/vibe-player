// vibe-player-v2-react/src/services/audioEngine.service.test.ts
import { vi, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlayerState }
from "../types/player.types";
import { usePlayerStore } from "../stores/player.store";
import audioEngineServiceInstance from "./audioEngine.service"; // Import the actual instance
import { RB_WORKER_MSG_TYPE } from "../types/worker.types";
import { AUDIO_ENGINE_CONSTANTS } from "../utils/constants";

// --- Mocks ---
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

// Mock the web worker
const mockWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent) => void) | null,
};
vi.mock("../workers/rubberband.worker?worker", () => ({ // Adjusted path for Vite
  default: vi.fn().mockImplementation(() => mockWorkerInstance),
}));

// Mock AudioContext
const mockGainNode = {
  connect: vi.fn(),
  gain: { setValueAtTime: vi.fn(), value: 1.0 },
};
const mockAudioContextInstance = {
  decodeAudioData: vi.fn(),
  createGain: vi.fn(() => mockGainNode),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  state: "running" as AudioContextState,
  currentTime: 0,
  destination: {} as AudioDestinationNode,
  sampleRate: 48000,
  createBufferSource: vi.fn(() => ({
    buffer: null as AudioBuffer | null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(), // stop is needed for some internal logic if sources are stopped
    onended: null as (() => void) | null,
    disconnect: vi.fn(),
  })),
  createBuffer: vi.fn((channels, length, sampleRate) => ({
    numberOfChannels: channels,
    length: length,
    sampleRate: sampleRate,
    duration: length / sampleRate,
    getChannelData: vi.fn(() => new Float32Array(length)),
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  })),
};
global.AudioContext = vi.fn().mockImplementation(() => mockAudioContextInstance);
global.fetch = vi.fn();


describe("AudioEngineService", () => {
  const audioEngineService = audioEngineServiceInstance; // Use the singleton instance
  const MOCK_RAF_ID = 12345;
  let rafSpy: vi.SpyInstance;
  let cafSpy: vi.SpyInstance;
  let mockAudioBuffer: AudioBuffer;

  const simulateWorkerMessage = (message: any) => {
    if (mockWorkerInstance.onmessage) {
      mockWorkerInstance.onmessage({ data: message } as MessageEvent);
    }
  };
  const simulateWorkerError = (errorEvent: ErrorEvent) => {
    if (mockWorkerInstance.onerror) {
      mockWorkerInstance.onerror!(errorEvent);
    }
  };

  beforeEach(() => {
    vi.clearAllMocks(); // Clear all mocks, including AudioContext constructor calls
    usePlayerStore.setState({ ...initialPlayerState }, true);

    // Reset AudioContext mock states
    mockAudioContextInstance.state = "running";
    mockAudioContextInstance.currentTime = 0;
    mockAudioContextInstance.createGain.mockReturnValue({ // ensure createGain always returns a fresh gain node mock
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), value: 1.0 },
    });


    (global.fetch as vi.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), // For WASM
        text: () => Promise.resolve("// Mock loader script text"), // For JS loader
      } as Response),
    );

    rafSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(MOCK_RAF_ID);
    cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});


    mockAudioBuffer = {
      duration: 10.0,
      numberOfChannels: 1,
      sampleRate: 44100,
      getChannelData: vi.fn(() => new Float32Array(441000).fill(0.1)),
      length: 441000,
    } as unknown as AudioBuffer; // Type assertion for mock

    // Explicitly reset the service's internal state for relevant tests
    // This is important because it's a singleton.
    audioEngineService.dispose(); // Dispose to clear internal worker, context etc.
  });

  afterEach(() => {
     audioEngineService.dispose(); // Clean up after each test
  });

  describe("loadFile", () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(["dummy content"], "test.mp3", { type: "audio/mpeg" });
      (mockFile as any).arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(1024));
      (mockAudioContextInstance.decodeAudioData as vi.Mock).mockResolvedValue(mockAudioBuffer);
    });

    it("should load and decode a file, returning an AudioBuffer", async () => {
      const buffer = await audioEngineService.loadFile(mockFile);
      expect(mockAudioContextInstance.decodeAudioData).toHaveBeenCalledOnce();
      expect(buffer).toBe(mockAudioBuffer);
      // @ts-ignore access private member for test
      expect(audioEngineService.originalBuffer).toBe(mockAudioBuffer);
      // @ts-ignore
      expect(audioEngineService.isWorkerReady).toBe(false);
    });

    it("should throw for an invalid file", async () => {
      const emptyFile = new File([], "empty.mp3", { type: "audio/mpeg" });
      await expect(audioEngineService.loadFile(emptyFile)).rejects.toThrow(/invalid or empty File object/i);
      // @ts-ignore
      expect(audioEngineService.originalBuffer).toBeNull();
    });

    it("should throw if decoding fails", async () => {
      const decodeError = new DOMException("Decoding failed", "EncodingError");
      (mockAudioContextInstance.decodeAudioData as vi.Mock).mockRejectedValue(decodeError);
      await expect(audioEngineService.loadFile(mockFile)).rejects.toThrow(`Error decoding audio data: ${decodeError.message}`);
      // @ts-ignore
      expect(audioEngineService.originalBuffer).toBeNull();
    });
  });

  describe("initializeWorker", () => {
    beforeEach(() => {
      usePlayerStore.setState({ ...initialPlayerState, speed: 1.2, pitchShift: -2.0 }, true);
      // @ts-ignore // Ensure originalBuffer is set for initializeWorker to proceed
      audioEngineService.originalBuffer = mockAudioBuffer;
    });

    it("should init worker, post INIT, update store on success", async () => {
      const initPromise = audioEngineService.initializeWorker(mockAudioBuffer);
      simulateWorkerMessage({ type: RB_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: "rb_msg_0" }); // Ensure messageId matches if service uses it
      await expect(initPromise).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: RB_WORKER_MSG_TYPE.INIT }),
        [expect.any(ArrayBuffer)],
      );
      expect(usePlayerStore.getState().isPlayable).toBe(true);
      expect(usePlayerStore.getState().error).toBeNull();
      // @ts-ignore
      expect(audioEngineService.isWorkerReady).toBe(true);
    });

    it("should handle worker init failure (ERROR message)", async () => {
      const initPromise = audioEngineService.initializeWorker(mockAudioBuffer);
      simulateWorkerMessage({ type: RB_WORKER_MSG_TYPE.ERROR, payload: { message: "Init crash" }, messageId: "rb_msg_0" });
      await expect(initPromise).rejects.toThrow("Init crash");
      expect(usePlayerStore.getState().isPlayable).toBe(false);
      expect(usePlayerStore.getState().error).toBe("Init crash");
    });
  });

  describe("Playback Controls (after successful setup)", () => {
    beforeEach(async () => {
      // @ts-ignore
      audioEngineService.originalBuffer = mockAudioBuffer; // Make sure buffer is "loaded"
      const initPromise = audioEngineService.initializeWorker(mockAudioBuffer);
      simulateWorkerMessage({ type: RB_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: "rb_msg_0" });
      await initPromise;
      vi.clearAllMocks(); // Clear mocks from setup phase
      rafSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(MOCK_RAF_ID); // Re-spy after clear
      cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {}); // Re-spy after clear
    });

    it("play: should start animation loop if ready", async () => {
      await audioEngineService.play();
      expect(rafSpy).toHaveBeenCalledTimes(1);
      // @ts-ignore
      expect(audioEngineService.isPlaying).toBe(true);
    });

    it("pause: should stop animation loop", async () => {
      await audioEngineService.play(); // Start
      audioEngineService.pause();
      expect(cafSpy).toHaveBeenCalledWith(MOCK_RAF_ID);
      // @ts-ignore
      expect(audioEngineService.isPlaying).toBe(false);
    });

    it("stop: should cancel loop, reset worker and time", async () => {
      await audioEngineService.play();
      // @ts-ignore
      audioEngineService.sourcePlaybackOffset = 5.0;
      await audioEngineService.stop();
      expect(cafSpy).toHaveBeenCalled();
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: RB_WORKER_MSG_TYPE.RESET }));
      // @ts-ignore
      expect(audioEngineService.isPlaying).toBe(false);
      // @ts-ignore
      expect(audioEngineService.sourcePlaybackOffset).toBe(0);
    });

    it("seek: should update time, reset worker, remain paused if paused", async () => {
      // @ts-ignore
      audioEngineService.isPlaying = false;
      await audioEngineService.seek(5.0);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: RB_WORKER_MSG_TYPE.RESET }));
      // @ts-ignore
      expect(audioEngineService.sourcePlaybackOffset).toBe(5.0);
      // @ts-ignore
      expect(audioEngineService.isPlaying).toBe(false);
    });

    it("setSpeed: should post SET_SPEED to worker", () => {
      audioEngineService.setSpeed(1.5);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: RB_WORKER_MSG_TYPE.SET_SPEED, payload: { speed: 1.5 } }));
    });

    it("setPitch: should post SET_PITCH to worker", () => {
      audioEngineService.setPitch(2.0);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: RB_WORKER_MSG_TYPE.SET_PITCH, payload: { pitch: 2.0 } }));
    });

    it("setGain: should update gainNode value, clamped", () => {
        const gainNodeSetter = mockAudioContextInstance.createGain().gain.setValueAtTime; // Get the spy
        audioEngineService.setGain(0.5);
        expect(gainNodeSetter).toHaveBeenCalledWith(0.5, mockAudioContextInstance.currentTime);

        audioEngineService.setGain(AUDIO_ENGINE_CONSTANTS.MAX_GAIN + 0.5);
        expect(gainNodeSetter).toHaveBeenCalledWith(AUDIO_ENGINE_CONSTANTS.MAX_GAIN, mockAudioContextInstance.currentTime);
    });
  });
});
