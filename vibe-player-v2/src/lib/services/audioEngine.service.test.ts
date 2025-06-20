// vibe-player-v2/src/lib/services/audioEngine.service.test.ts
// Unit tests for AudioEngineService, focusing on event dispatching and core audio logic.
import { vi } from "vitest";

// --- Mocks ---
// All vi.mock calls are hoisted to the top. They must come before other imports.

// Mock the web worker dependency.
// This allows us to control worker responses and check messages sent to it.
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
import audioEngineService from "./audioEngine.service"; // We import the REAL service.
import { RB_WORKER_MSG_TYPE } from "$lib/types/worker.types";

// Note: Store-related imports and mocks (player.store, url.store) have been removed
// as the service now dispatches events instead of interacting with stores directly.

describe("AudioEngineService Tests: Event-Driven Behavior", () => {
  const MOCK_RAF_ID = 12345; // Mock ID for requestAnimationFrame
  let rafSpy: ReturnType<typeof vi.spyOn>;
  let cafSpy: ReturnType<typeof vi.spyOn>;
  let mockAudioBuffer: AudioBuffer;
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
    it("should return AudioBuffer on successful load and trigger worker initialization sequence", async () => {
      const dispatchSpy = vi.spyOn(audioEngineService, "dispatchEvent");
      const returnedBuffer = await audioEngineService.loadFile(mockFile);
      expect(returnedBuffer).toBe(mockAudioBuffer);
      // loadFile itself doesn't dispatch a success event; 'ready' event comes after worker initialization.
      // This test ensures no error event was dispatched during the loadFile call.
      expect(dispatchSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      );
    });

    it("should trigger _initializeWorker to post an INIT message with default speed/pitch", async () => {
      await audioEngineService.loadFile(mockFile);
      // Verifies that _initializeWorker (called by loadFile) sends the correct INIT message.
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RB_WORKER_MSG_TYPE.INIT,
          payload: expect.objectContaining({
            channels: mockAudioBuffer.numberOfChannels,
            sampleRate: mockAudioBuffer.sampleRate,
            initialSpeed: 1.0, // Default value
            initialPitch: 0.0, // Default value
          }),
        }),
        expect.any(Array), // For wasmBinary
      );
    });

    it("should re-throw if decodeAudioData fails (no 'error' event from loadFile for this specific step)", async () => {
      const decodeError = new Error("Failed to decode audio data");
      mockDecodeAudioData.mockRejectedValueOnce(decodeError);
      const errorFile = new File([new ArrayBuffer(8)], "error.wav", {
        type: "audio/wav",
      });
      const errorListener = vi.fn();
      audioEngineService.addEventListener("error", errorListener);

      await expect(audioEngineService.loadFile(errorFile)).rejects.toThrow(
        decodeError.message,
      );
      // Verifying that loadFile itself doesn't dispatch an event for decodeAudioData failure,
      // as it re-throws, and _initializeWorker (which dispatches errors) isn't reached.
      expect(errorListener).not.toHaveBeenCalled();
    });

    it("should dispatch 'error' from _initializeWorker and re-throw if fetching worker dependencies fails", async () => {
      global.fetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, status: 500 } as Response),
      );
      const fetchErrorFile = new File([new ArrayBuffer(8)], "fetch_error.wav", {
        type: "audio/wav",
      });
      const errorListener = vi.fn();
      audioEngineService.addEventListener("error", errorListener);
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
      expect(errorListener).toHaveBeenCalledTimes(1);
      const event = errorListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("error");
      expect(event.detail.message).toContain(
        "Failed to fetch worker dependencies",
      );
    });
  });

  describe("handleWorkerMessage (INIT_SUCCESS) -> 'ready' event", () => {
    it("should dispatch a 'ready' event when worker initialization is successful", async () => {
      const readyListener = vi.fn();
      audioEngineService.addEventListener("ready", readyListener);

      await audioEngineService.loadFile(mockFile); // This internally calls _initializeWorker
      makeWorkerReady(); // Simulates worker sending INIT_SUCCESS

      expect(readyListener).toHaveBeenCalledTimes(1);
      const event = readyListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("ready");
    });
  });

  describe("play", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should dispatch a 'play' event and start the animation loop", async () => {
      const playListener = vi.fn();
      audioEngineService.addEventListener("play", playListener);

      audioEngineService.play();

      await new Promise((resolve) => setTimeout(resolve, 0)); // Event loop tick

      expect(playListener).toHaveBeenCalledTimes(1);
      const event = playListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("play");
      expect(rafSpy).toHaveBeenCalledTimes(1);
    });

    it("should not dispatch 'play' or start animation loop if worker is not initialized", async () => {
      audioEngineService.dispose();
      await audioEngineService.loadFile(mockFile); // Worker is created but not "ready"

      const playListener = vi.fn();
      audioEngineService.addEventListener("play", playListener);

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(playListener).not.toHaveBeenCalled();
      expect(rafSpy).not.toHaveBeenCalled();
    });
  });

  describe("pause", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should dispatch 'pause' event and cancel animation frame if playing", async () => {
      const pauseListener = vi.fn();
      audioEngineService.addEventListener("pause", pauseListener);

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));

      audioEngineService.pause();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pauseListener).toHaveBeenCalledTimes(1);
      const event = pauseListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("pause");
      expect(cafSpy).toHaveBeenCalledTimes(1);
    });

    it("should not dispatch 'pause' if not playing", async () => {
      const pauseListener = vi.fn();
      audioEngineService.addEventListener("pause", pauseListener);

      audioEngineService.pause();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pauseListener).not.toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should dispatch 'stop' event, reset worker, and cancel animation frame", async () => {
      const stopListener = vi.fn();
      audioEngineService.addEventListener("stop", stopListener);

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));

      await audioEngineService.stop();

      expect(stopListener).toHaveBeenCalledTimes(1);
      const event = stopListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("stop");
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
      expect(cafSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("seek", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should dispatch 'seek' event and reset worker when paused", async () => {
      const seekListener = vi.fn();
      audioEngineService.addEventListener("seek", seekListener);
      const seekTime = 5.0;

      if (audioEngineService["isPlaying"]) audioEngineService.pause();
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.mocked(mockWorkerInstance.postMessage).mockClear();

      await audioEngineService.seek(seekTime);

      expect(seekListener).toHaveBeenCalledTimes(1);
      const event = seekListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("seek");
      expect(event.detail.currentTime).toBe(seekTime);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
    });

    it("should dispatch 'pause', then 'seek' event, and reset worker when playing", async () => {
      const pauseListener = vi.fn();
      const seekListener = vi.fn();
      audioEngineService.addEventListener("pause", pauseListener);
      audioEngineService.addEventListener("seek", seekListener);

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));
      vi.mocked(mockWorkerInstance.postMessage).mockClear();

      const seekTime = 3.0;
      await audioEngineService.seek(seekTime);

      expect(pauseListener).toHaveBeenCalledTimes(1);
      expect(seekListener).toHaveBeenCalledTimes(1);
      const seekEvent = seekListener.mock.calls[0][0] as CustomEvent;
      expect(seekEvent.type).toBe("seek");
      expect(seekEvent.detail.currentTime).toBe(seekTime);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: RB_WORKER_MSG_TYPE.RESET,
      });
    });
  });

  describe("Pre-Worker Gain Application", () => {
    let originalChannelData: Float32Array;

    beforeEach(async () => {
      originalChannelData = new Float32Array([0.1, 0.2, -0.1, -0.2, 0.5]);
      mockAudioBuffer = {
        duration: originalChannelData.length / 44100,
        numberOfChannels: 1,
        sampleRate: 44100,
        getChannelData: vi.fn(() => new Float32Array(originalChannelData)),
        length: originalChannelData.length,
      } as unknown as AudioBuffer;
      mockDecodeAudioData.mockResolvedValue(mockAudioBuffer);

      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should apply gain to audio samples before sending them to the worker", async () => {
      const testGain = 0.5;
      audioEngineService.setGain(testGain);

      vi.mocked(mockWorkerInstance.postMessage).mockClear();
      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const processLoopCallback = rafSpy.mock.calls[0][0];
      processLoopCallback(0);

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1);
      const messagePayload = mockWorkerInstance.postMessage.mock.calls[0][0];
      expect(messagePayload.type).toBe(RB_WORKER_MSG_TYPE.PROCESS);
      const sentBuffer = messagePayload.payload.inputBuffer[0] as Float32Array;

      expect(sentBuffer.length).toBe(originalChannelData.length);
      for (let i = 0; i < sentBuffer.length; i++) {
        expect(sentBuffer[i]).toBeCloseTo(originalChannelData[i] * testGain);
      }
    });

    it("should handle multichannel audio by applying gain to all channels", async () => {
      const channel1Data = new Float32Array([0.1, 0.2, 0.3]);
      const channel2Data = new Float32Array([0.4, 0.5, 0.6]);
      mockAudioBuffer = {
        duration: channel1Data.length / 44100,
        numberOfChannels: 2,
        sampleRate: 44100,
        getChannelData: vi.fn((channelIndex) => {
          if (channelIndex === 0) return new Float32Array(channel1Data);
          if (channelIndex === 1) return new Float32Array(channel2Data);
          return new Float32Array(0);
        }),
        length: channel1Data.length,
      } as unknown as AudioBuffer;
      mockDecodeAudioData.mockResolvedValue(mockAudioBuffer);

      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();

      const testGain = 0.7;
      audioEngineService.setGain(testGain);
      vi.mocked(mockWorkerInstance.postMessage).mockClear();

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const processLoopCallback = rafSpy.mock.calls[0][0];
      processLoopCallback(0);

      expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(1);
      const messagePayload = mockWorkerInstance.postMessage.mock.calls[0][0];
      expect(messagePayload.type).toBe(RB_WORKER_MSG_TYPE.PROCESS);

      const sentBufferChannel1 = messagePayload.payload
        .inputBuffer[0] as Float32Array;
      const sentBufferChannel2 = messagePayload.payload
        .inputBuffer[1] as Float32Array;

      expect(sentBufferChannel1.length).toBe(channel1Data.length);
      for (let i = 0; i < sentBufferChannel1.length; i++) {
        expect(sentBufferChannel1[i]).toBeCloseTo(channel1Data[i] * testGain);
      }

      expect(sentBufferChannel2.length).toBe(channel2Data.length);
      for (let i = 0; i < sentBufferChannel2.length; i++) {
        expect(sentBufferChannel2[i]).toBeCloseTo(channel2Data[i] * testGain);
      }
    });
  });

  describe("_recursiveProcessAndPlayLoop (via play)", () => {
    beforeEach(async () => {
      await audioEngineService.loadFile(mockFile);
      makeWorkerReady();
    });

    it("should dispatch a 'timeupdate' event from the playback loop", async () => {
      const timeUpdateListener = vi.fn();
      audioEngineService.addEventListener("timeupdate", timeUpdateListener);

      audioEngineService.play();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const processLoopCallback = rafSpy.mock.calls[0][0];
      processLoopCallback(0);

      expect(timeUpdateListener).toHaveBeenCalledTimes(1);
      const event = timeUpdateListener.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe("timeupdate");
      expect(event.detail).toHaveProperty("currentTime");
      expect(event.detail.currentTime).toBe(0);
    });
  });

  describe("setSpeed", () => {
    let localMockFile: File;
    beforeEach(async () => {
      localMockFile = new File([new ArrayBuffer(8)], "test-setspeed.wav", { type: "audio/wav" });
      // Ensure arrayBuffer is mocked for this File instance if needed by loadFile
      if (!File.prototype.arrayBuffer) {
          File.prototype.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      } else {
          // Make sure to spy on the prototype if it exists, not re-assign
          vi.spyOn(File.prototype, "arrayBuffer").mockResolvedValue(new ArrayBuffer(8));
      }
      await audioEngineService.loadFile(localMockFile);
      makeWorkerReady(); // makeWorkerReady is in scope from the parent describe
      vi.mocked(mockWorkerInstance.postMessage).mockClear();
    });

    it("should post a SET_SPEED message to the worker if worker is initialized", () => {
      const testSpeed = 1.5;
      audioEngineService.setSpeed(testSpeed);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RB_WORKER_MSG_TYPE.SET_SPEED,
          payload: { speed: testSpeed },
        }),
      );
    });

    it("should not post a message if worker is not initialized", async () => {
      audioEngineService.dispose(); // Resets isWorkerInitialized
      // Re-loadFile but DON'T make worker ready
      localMockFile = new File([new ArrayBuffer(8)], "test-setspeed-notready.wav", { type: "audio/wav" });
       if (!File.prototype.arrayBuffer) {
          File.prototype.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      } else {
          vi.spyOn(File.prototype, "arrayBuffer").mockResolvedValue(new ArrayBuffer(8));
      }
      await audioEngineService.loadFile(localMockFile);

      const testSpeed = 1.5;
      audioEngineService.setSpeed(testSpeed);
      // It will attempt to post INIT, but not SET_SPEED if isWorkerInitialized is false.
      // We check that no SET_SPEED message was sent.
      expect(mockWorkerInstance.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: RB_WORKER_MSG_TYPE.SET_SPEED }),
      );
    });
  });

  describe("setPitch", () => {
    let localMockFile: File;
    beforeEach(async () => {
      localMockFile = new File([new ArrayBuffer(8)], "test-setpitch.wav", { type: "audio/wav" });
      if (!File.prototype.arrayBuffer) {
          File.prototype.arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(8));
      } else {
          vi.spyOn(File.prototype, "arrayBuffer").mockResolvedValue(new ArrayBuffer(8));
      }
      await audioEngineService.loadFile(localMockFile);
      makeWorkerReady(); // makeWorkerReady is in scope from the parent describe
      vi.mocked(mockWorkerInstance.postMessage).mockClear();
    });

    it("should post a SET_PITCH message to the worker if worker is initialized", () => {
      const testPitch = 2.5;
      audioEngineService.setPitch(testPitch);
      expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RB_WORKER_MSG_TYPE.SET_PITCH,
          payload: { pitch: testPitch },
        }),
      );
    });
  });

}); // This closes the main "AudioEngineService Tests: Event-Driven Behavior" describe block

describe("unlockAudio", () => {
  beforeEach(() => {
    vi.mocked(global.AudioContext).mockReset();
    audioEngineService.dispose();
  });

  it("should call resume() on a suspended context and set internal flag after promise resolves", async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(global.AudioContext).mockImplementationOnce(
      () =>
        ({
          state: "suspended",
          resume: resumeSpy,
          createGain: vi.fn(() => ({
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn() },
          })),
          destination: {},
          currentTime: 0,
          sampleRate: 48000,
          close: vi.fn().mockResolvedValue(undefined),
          decodeAudioData: vi.fn(),
        }) as any,
    );

    const dispatchSpy = vi.spyOn(audioEngineService, "dispatchEvent");
    audioEngineService.unlockAudio();

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audioEngineService["audioContextResumed"]).toBe(true);
    expect(dispatchSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("should dispatch 'error' event if resume() fails", async () => {
    const resumeError = new Error("Resume failed");
    const resumeSpy = vi.fn().mockRejectedValue(resumeError);
    vi.mocked(global.AudioContext).mockImplementationOnce(
      () =>
        ({
          state: "suspended",
          resume: resumeSpy,
          createGain: vi.fn(() => ({
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn() },
          })),
          destination: {},
          currentTime: 0,
          sampleRate: 48000,
          close: vi.fn().mockResolvedValue(undefined),
          decodeAudioData: vi.fn(),
        }) as any,
    );

    const errorListener = vi.fn();
    audioEngineService.addEventListener("error", errorListener);

    audioEngineService.unlockAudio();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(errorListener).toHaveBeenCalledTimes(1);
    const event = errorListener.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("error");
    expect(event.detail.message).toContain(resumeError.message);
    expect(audioEngineService["audioContextResumed"]).toBe(false);
  });

  it("should not call resume() if context is already running, and set internal flag", () => {
    const resumeSpy = vi.fn();
    vi.mocked(global.AudioContext).mockImplementationOnce(
      () =>
        ({
          state: "running",
          resume: resumeSpy,
          createGain: vi.fn(() => ({
            connect: vi.fn(),
            gain: { setValueAtTime: vi.fn() },
          })),
          destination: {},
          currentTime: 0,
          sampleRate: 48000,
          close: vi.fn().mockResolvedValue(undefined),
          decodeAudioData: vi.fn(),
        }) as any,
    );

    audioEngineService.unlockAudio();

    expect(resumeSpy).not.toHaveBeenCalled();
    expect(audioEngineService["audioContextResumed"]).toBe(true);
  });

  it("should be idempotent: call resume() only once for suspended, then rely on internal flag", async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined);
    const audioContextInstance = {
      state: "suspended",
      resume: resumeSpy,
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn() },
      })),
      destination: {},
      currentTime: 0,
      sampleRate: 48000,
      close: vi.fn().mockResolvedValue(undefined),
      decodeAudioData: vi.fn(),
    };
    vi.mocked(global.AudioContext).mockImplementation(
      () => audioContextInstance as any,
    );

    audioEngineService.unlockAudio();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audioEngineService["audioContextResumed"]).toBe(true);

    audioContextInstance.state = "suspended";

    audioEngineService.unlockAudio();
    expect(resumeSpy).toHaveBeenCalledTimes(1);
    expect(audioEngineService["audioContextResumed"]).toBe(true);
  });
});
