// vibe-player-v2/src/lib/services/audioEngine.service.test.ts
import { writable, type Writable } from "svelte/store";
import { vi } from "vitest";

// --- Mocks ---
// All vi.mock calls are hoisted to the top. They must come before other imports.

// Mock the Svelte store with a real writable instance created inside the factory.
// This solves the "Cannot access before initialization" ReferenceError.
vi.mock("$lib/stores/player.store", async () => {
  const { writable: actualWritable } =
    await vi.importActual<typeof import("svelte/store")>("svelte/store");
  const initialPlayerState = {
    speed: 1.0,
    pitch: 0.0,
    gain: 1.0,
    isPlayable: false,
    isPlaying: false,
    error: null,
    fileName: "",
    status: "",
    duration: 0,
    currentTime: 0,
    audioBuffer: null,
  };
  const internalPlayerStoreInstance = actualWritable({ ...initialPlayerState });

  return {
    playerStore: internalPlayerStoreInstance,
    // Provide an "accessor" function so our tests can get a handle to the mock instance.
    __test__getPlayerStoreInstance: () => internalPlayerStoreInstance,
    __test__getInitialPlayerState: () => ({ ...initialPlayerState }),
  };
});

// Mock the web worker dependency.
const mockWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent) => void) | null,
};
vi.mock("$lib/workers/rubberband.worker?worker&inline", () => ({
  default: vi.fn().mockImplementation(() => mockWorkerInstance),
}));

// Mock AudioContext and its methods.
const mockDecodeAudioData = vi.fn();
global.AudioContext = vi.fn(() => ({
  decodeAudioData: mockDecodeAudioData,
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn() },
  })),
  resume: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  state: "running",
  currentTime: 0,
  destination: {},
  sampleRate: 48000,
})) as any;

// Mock fetch for worker dependencies.
vi.spyOn(global, "fetch").mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    text: () => Promise.resolve("// Mock loader script"),
  } as Response),
);
// --- End Mocks ---

// Now, we can safely import everything else.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { get } from "svelte/store";
import audioEngineService from "./audioEngine.service"; // We import the REAL service.
import { RB_WORKER_MSG_TYPE } from "$lib/types/worker.types";
import {
  __test__getPlayerStoreInstance,
  __test__getInitialPlayerState,
} from "$lib/stores/player.store"; // Import the test accessors.

describe("AudioEngineService", () => {
  const MOCK_RAF_ID = 12345;
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;
  let mockAudioBuffer: AudioBuffer;
  let playerStoreInstance: Writable<any>;
  let mockFile: File;

  // Helper to simulate the worker becoming ready after INIT.
  const makeWorkerReady = () => {
    if (mockWorkerInstance.onmessage) {
      mockWorkerInstance.onmessage({
        data: { type: RB_WORKER_MSG_TYPE.INIT_SUCCESS },
      } as MessageEvent);
    }
  };

  beforeEach(() => {
    // Reset mocks and state before each test.
    vi.clearAllMocks();
    global.fetch.mockClear(); // Clear fetch mock specifically if needed

    // Get the handle to our mocked store instance and reset it.
    playerStoreInstance = __test__getPlayerStoreInstance();
    playerStoreInstance.set({ ...__test__getInitialPlayerState() });

    // Dispose the service to ensure a clean state from the previous test.
    // Note: This also clears the worker instance if it was created.
    audioEngineService.dispose();

    // Spy on animation frame methods.
    rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockReturnValue(MOCK_RAF_ID);
    cafSpy = vi.spyOn(window, "cancelAnimationFrame");

    // Create a mock AudioBuffer for tests.
    mockAudioBuffer = {
      duration: 10.0,
      numberOfChannels: 1,
      sampleRate: 44100,
      getChannelData: vi.fn(() => new Float32Array(441000).fill(0.1)),
      length: 441000,
    } as unknown as AudioBuffer;
    mockDecodeAudioData.mockResolvedValue(mockAudioBuffer); // Default successful decode

    mockFile = new File([new ArrayBuffer(8)], "test.wav", {
      type: "audio/wav",
    });

    // Polyfill/mock File.prototype.arrayBuffer if it doesn't exist in JSDOM
    if (!File.prototype.arrayBuffer) {
      File.prototype.arrayBuffer = vi
        .fn()
        .mockResolvedValue(new ArrayBuffer(8));
    } else {
      vi.spyOn(File.prototype, "arrayBuffer").mockResolvedValue(
        new ArrayBuffer(8),
      );
    }
  });

  afterEach(() => {
    audioEngineService.dispose(); // Clean up service state
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  describe("loadFile", () => {
    it("should update store status to 'Decoding...' and return AudioBuffer on successful load", async () => {
      const returnedBuffer = await audioEngineService.loadFile(mockFile);
      expect(get(playerStoreInstance).status).toBe(
        `Decoding ${mockFile.name}...`,
      );
      expect(returnedBuffer).toBe(mockAudioBuffer);
      // isPlayable is false until worker init
      expect(get(playerStoreInstance).isPlayable).toBe(false);
    });

    it("should call _initializeWorker internally, which posts an INIT message to the worker", async () => {
      await audioEngineService.loadFile(mockFile);
      // _initializeWorker is private, so we check its side effect: posting INIT to worker
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RB_WORKER_MSG_TYPE.INIT,
          payload: expect.objectContaining({
            channels: mockAudioBuffer.numberOfChannels,
            sampleRate: mockAudioBuffer.sampleRate,
            initialSpeed: get(playerStoreInstance).speed, // Ensure these are from store
            initialPitch: get(playerStoreInstance).pitch,
          }),
        }),
        expect.any(Array), // For wasmBinary
      );
    });

    it("should update store and re-throw error if decodeAudioData fails", async () => {
      const decodeError = new Error("Failed to decode");
      mockDecodeAudioData.mockRejectedValueOnce(decodeError);
      const errorFile = new File([new ArrayBuffer(8)], "error.wav", {
        type: "audio/wav",
      });

      try {
        await audioEngineService.loadFile(errorFile);
      } catch (e) {
        expect(e).toBe(decodeError);
      }
      expect(get(playerStoreInstance).status).toBe(
        `Error decoding ${errorFile.name}`,
      );
      expect(get(playerStoreInstance).error).toBe(decodeError.message);
      expect(get(playerStoreInstance).isPlayable).toBe(false);
    });

    it("should re-throw error if fetching worker dependencies fails", async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, status: 500 } as Response),
      );
      const fetchErrorFile = new File([new ArrayBuffer(8)], "fetch_error.wav", {
        type: "audio/wav",
      });
      let errorThrown;
      try {
        await audioEngineService.loadFile(fetchErrorFile);
      } catch (e) {
        errorThrown = e;
      }
      expect(errorThrown).toBeInstanceOf(Error);
      expect((errorThrown as Error).message).toContain(
        "Failed to fetch worker dependencies",
      );
      expect(get(playerStoreInstance).status).toBe(
        `Error decoding ${fetchErrorFile.name}`,
      ); // loadFile's catch block will set this
    });
  });

  describe("handleWorkerMessage (INIT_SUCCESS)", () => {
    it("should update the player store to be playable but not change status from 'Ready'", async () => {
      // Load file first to set up the worker interaction path
      await audioEngineService.loadFile(mockFile);

      // Simulate a different status set by Orchestrator before worker init completes
      playerStoreInstance.update((s) => ({
        ...s,
        status: "OrchestratorIsReady",
      }));

      makeWorkerReady(); // Simulates worker sending INIT_SUCCESS

      expect(get(playerStoreInstance).isPlayable).toBe(true);
      expect(get(playerStoreInstance).status).toBe("OrchestratorIsReady"); // Status should not be overridden to "Ready..."
    });
  });

  describe("play", () => {
    // Re-initialize service for these tests as loadFile in outer beforeEach might not be desired for all.
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should start the animation loop by calling requestAnimationFrame", async () => {
      await audioEngineService.play();
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it("should not play if worker is not initialized", async () => {
      audioEngineService.dispose(); // Reset service, worker is not initialized by removing it
      // Re-mock worker instance as dispose clears it
      vi.mocked(global.AudioContext).mockImplementationOnce(
        () =>
          ({
            decodeAudioData: mockDecodeAudioData,
            createGain: vi.fn(() => ({
              connect: vi.fn(),
              gain: { setValueAtTime: vi.fn() },
            })),
            resume: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            state: "running",
            currentTime: 0,
            destination: {},
            sampleRate: 48000,
          }) as any,
      );
      await audioEngineService.loadFile(mockFile); // loadFile now creates worker but we won't call makeWorkerReady

      await audioEngineService.play();
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe("pause", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });
    it("should stop the animation loop by calling cancelAnimationFrame", async () => {
      await audioEngineService.play();
      expect(rafSpy).toHaveBeenCalledTimes(1); // Loop started.

      audioEngineService.pause();
      expect(cafSpy).toHaveBeenCalledWith(MOCK_RAF_ID); // Loop canceled.
      expect(get(playerStoreInstance).isPlaying).toBe(false);
    });
  });

  describe("stop", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });
    it("should cancel the animation loop, reset worker, and reset time", async () => {
      await audioEngineService.play(); // Start playing.
      playerStoreInstance.update((s) => ({ ...s, currentTime: 5.0 })); // Simulate time advance.

      await audioEngineService.stop();

      expect(cafSpy).toHaveBeenCalledWith(MOCK_RAF_ID);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
      expect(get(playerStoreInstance).currentTime).toBe(0);
    });
  });

  describe("seek", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });
    it("should update time and reset worker when seeking while paused", async () => {
      // Ensure player is paused (default after loadFile and makeWorkerReady)
      playerStoreInstance.update((s) => ({ ...s, isPlaying: false }));
      expect(get(playerStoreInstance).isPlaying).toBe(false);

      await audioEngineService.seek(5.0);

      expect(rafSpy).not.toHaveBeenCalled();
      expect(cafSpy).not.toHaveBeenCalled();
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
      expect(get(playerStoreInstance).currentTime).toBe(5.0);
      expect(get(playerStoreInstance).isPlaying).toBe(false);
    });

    it("should pause playback, update time, and reset worker when seeking while playing", async () => {
      await audioEngineService.play();
      expect(get(playerStoreInstance).isPlaying).toBe(true);
      // Clear spies that might have been called during play()
      rafSpy.mockClear();
      cafSpy.mockClear();
      vi.mocked(mockWorkerInstance.postMessage).mockClear();

      await audioEngineService.seek(3.0);

      expect(cafSpy).toHaveBeenCalledWith(MOCK_RAF_ID);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
      expect(get(playerStoreInstance).currentTime).toBe(3.0);
      expect(rafSpy).not.toHaveBeenCalled();
      expect(get(playerStoreInstance).isPlaying).toBe(false);
    });
  });
});
