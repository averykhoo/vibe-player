// vibe-player-v2-react/src/services/spectrogram.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpectrogramWorker from "../workers/spectrogram.worker?worker"; // Vite path
import spectrogramServiceInstance from "./spectrogram.service"; // Singleton instance
import { useAnalysisStore, AnalysisState } from "../stores/analysis.store";
import { SPEC_WORKER_MSG_TYPE } from "../types/worker.types";
import { VISUALIZER_CONSTANTS } from "../utils/constants";

// Mock Web Workers
const mockSpecWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent | Event | string) => void) | null,
};

vi.mock("../workers/spectrogram.worker?worker", () => ({ // Vite path
  default: vi.fn().mockImplementation(() => mockSpecWorkerInstance),
}));

const initialAnalysisState: AnalysisState = {
  vadStatus: "idle",
  lastVadResult: null,
  isSpeaking: undefined,
  vadStateResetted: undefined,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5,
  vadNegativeThreshold: 0.35,
  spectrogramStatus: "Spectrogram service idle", // Initialized more descriptively
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,
  isLoading: false,
};

const mockAudioData = new Float32Array(16000 * 5); // 5 seconds of audio data at 16kHz

describe("SpectrogramService", () => {
  const spectrogramService = spectrogramServiceInstance; // Use the singleton

  beforeEach(() => {
    vi.useFakeTimers(); // Use fake timers for controlling async operations like fetch
    vi.clearAllMocks();

    // Mock global fetch for FFT script
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes(VISUALIZER_CONSTANTS.FFT_WORKER_SCRIPT_URL)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("/* Mock FFT script content */"),
        } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    });

    // Reset worker instance mocks
    mockSpecWorkerInstance.onmessage = null;
    mockSpecWorkerInstance.onerror = null;

    useAnalysisStore.setState({ ...initialAnalysisState }, true); // Reset store
    spectrogramService.dispose(); // Dispose to ensure clean state for the singleton
  });

  afterEach(() => {
    spectrogramService.dispose();
    vi.useRealTimers(); // Restore real timers
  });

  describe("initialize", () => {
    it("should create worker, fetch FFT script, post INIT, and update store on success", async () => {
      const initializePromise = spectrogramService.initialize({ sampleRate: 16000 });

      // Check initial store update
      expect(useAnalysisStore.getState().spectrogramStatus).toBe("Initializing worker...");

      // Allow microtasks (fetch, then .text()) and timers (if any) to run
      await vi.runAllTimersAsync();
      await Promise.resolve(); // Additional flush for promise queue

      expect(SpectrogramWorker).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(VISUALIZER_CONSTANTS.FFT_WORKER_SCRIPT_URL);
      expect(mockSpecWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: SPEC_WORKER_MSG_TYPE.INIT }),
      );

      const initMessage = mockSpecWorkerInstance.postMessage.mock.calls[0][0];

      // Simulate worker INIT_SUCCESS
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: { type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: initMessage.messageId },
        } as MessageEvent);
      } else {
        throw new Error("Worker onmessage not set for INIT_SUCCESS");
      }

      await expect(initializePromise).resolves.toBeUndefined();

      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramStatus).toBe("Initialized");
      expect(finalState.spectrogramInitialized).toBe(true);
      expect(finalState.spectrogramError).toBeNull();
    });

    it("should update store on INIT_ERROR from worker", async () => {
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      await vi.runAllTimersAsync();
      await Promise.resolve();

      const initMessage = mockSpecWorkerInstance.postMessage.mock.calls[0][0];

      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: { type: SPEC_WORKER_MSG_TYPE.INIT_ERROR, error: "Worker init failed", messageId: initMessage.messageId },
        } as MessageEvent);
      } else {
        throw new Error("Worker onmessage not set for INIT_ERROR");
      }

      // The service catches the error and updates the store, but the promise from postMessageToWorker rejects
      await expect(initPromise).rejects.toEqual("Worker init failed");

      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramError).toContain("Worker error: Worker init failed");
      expect(finalState.spectrogramInitialized).toBe(false);
    });

    it("should throw and update store if FFT script fetch fails", async () => {
        (global.fetch as vi.Mock).mockImplementationOnce(() => Promise.resolve({
            ok: false,
            status: 404,
            statusText: "Not Found"
        } as Response));

        await expect(spectrogramService.initialize({ sampleRate: 16000 })).rejects.toThrow(
            "FFT script fetch failed: Failed to fetch FFT script: 404 Not Found"
        );

        const finalState = useAnalysisStore.getState();
        expect(finalState.spectrogramError).toContain("FFT script fetch error: Failed to fetch FFT script: 404 Not Found");
        expect(finalState.spectrogramInitialized).toBe(false);
    });

  });

  describe("process", () => {
    beforeEach(async () => {
      // Initialize successfully before process tests
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      await vi.runAllTimersAsync();
      await Promise.resolve();
      const initMessage = mockSpecWorkerInstance.postMessage.mock.calls[0][0];
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({ data: { type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: initMessage.messageId } } as MessageEvent);
      }
      await initPromise;
      // Clear mocks from initialization phase
      mockSpecWorkerInstance.postMessage.mockClear();
      useAnalysisStore.setState({ ...initialAnalysisState, spectrogramInitialized: true, spectrogramStatus: "Initialized" }, true);
    });

    it("should post PROCESS message and update store on success", async () => {
      const processPromise = spectrogramService.process(mockAudioData);

      expect(useAnalysisStore.getState().spectrogramStatus).toBe("Processing audio for spectrogram...");
      expect(mockSpecWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SPEC_WORKER_MSG_TYPE.PROCESS,
          payload: { audioData: mockAudioData },
        }),
      );

      const processMessage = mockSpecWorkerInstance.postMessage.mock.calls[0][0];
      const mockResultPayload = { magnitudes: [new Float32Array([1,2,3])] }; // Example result

      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: { type: SPEC_WORKER_MSG_TYPE.PROCESS_RESULT, payload: mockResultPayload, messageId: processMessage.messageId },
        } as MessageEvent);
      } else {
        throw new Error("Worker onmessage not set for PROCESS_RESULT");
      }

      await expect(processPromise).resolves.toBeUndefined(); // Service's process method resolves void

      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramData).toEqual(mockResultPayload.magnitudes);
      expect(finalState.spectrogramStatus).toBe("Processing complete");
    });

    it("should throw error if service not initialized", async () => {
      spectrogramService.dispose(); // Ensure not initialized
      await expect(spectrogramService.process(mockAudioData)).rejects.toThrow("Spectrogram worker not initialized or unavailable.");
    });
  });

  describe("dispose", () => {
    it("should terminate worker and update store", async () => {
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      await vi.runAllTimersAsync(); await Promise.resolve();
      const initMessage = mockSpecWorkerInstance.postMessage.mock.calls[0][0];
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({ data: { type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: initMessage.messageId } } as MessageEvent);
      }
      await initPromise;

      spectrogramService.dispose();
      expect(mockSpecWorkerInstance.terminate).toHaveBeenCalledTimes(1);
      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramStatus).toBe("Disposed");
      expect(finalState.spectrogramData).toBeNull();
      expect(finalState.spectrogramInitialized).toBe(false);
    });
  });
});
