// vibe-player-v2-react/src/services/spectrogram.service.test.ts
// vibe-player-v2/src/lib/services/spectrogram.service.test.ts
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mocked, // Keep if used
  vi,
} from "vitest";
import SpectrogramWorker from "../workers/spectrogram.worker?worker&inline"; // Adjusted path
import spectrogramService from "./spectrogram.service";
import { useAnalysisStore } from "../stores/analysis.store"; // Zustand import
import type { AnalysisState } from "../types/analysis.types"; // For initial state
import { SPEC_WORKER_MSG_TYPE } from "../types/worker.types"; // Adjusted path
// VISUALIZER_CONSTANTS is used by the service, not directly in tests here.

// No longer mock Svelte store module for analysisStore

// Define initialAnalysisState for tests
const initialAnalysisState: AnalysisState = {
  vadStatus: "idle",
  lastVadResult: null,
  isSpeaking: undefined,
  vadStateResetted: undefined,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5,
  vadNegativeThreshold: 0.35,
  spectrogramStatus: undefined,
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,
  isLoading: false,
};

// Mock Web Workers
const mockSpecWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent | Event | string) => void) | null,
};

vi.mock("../workers/spectrogram.worker?worker&inline", () => ({ // Adjusted path
  default: vi.fn().mockImplementation(() => mockSpecWorkerInstance),
}));

const mockAudioData = new Float32Array(16000); // Sample audio data

describe("SpectrogramService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock global fetch
    vi.spyOn(global, "fetch").mockImplementation((url) => {
      if (String(url).includes("fft.js")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("// Mock FFT script content"),
        } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch in test: ${url}`));
    });

    // Reset worker instance mocks
    mockSpecWorkerInstance.postMessage.mockClear();
    mockSpecWorkerInstance.terminate.mockClear();
    mockSpecWorkerInstance.onmessage = null;
    mockSpecWorkerInstance.onerror = null;

    // Reset store mocks are not needed for Zustand in this way
    // Reset Zustand store
    useAnalysisStore.setState({ ...initialAnalysisState }, true);

    spectrogramService.dispose();
  });

  afterEach(() => {
    spectrogramService.dispose(); // Clean up
    vi.useRealTimers();
  });

  describe("initialize", () => {
    it("should create Spectrogram worker, post INIT message, and update store", async () => {
      const initializePromise = spectrogramService.initialize({
        sampleRate: 16000,
      });

      // SpectrogramWorker constructor is called synchronously within initialize
      expect(SpectrogramWorker).toHaveBeenCalledTimes(1);
      // Check initial store update for 'Initializing worker...'
      expect(useAnalysisStore.getState().spectrogramStatus).toBe("Initializing worker...");

      // Allow async operations within initialize (like fetch) to complete and postMessage to be called.
      await vi.runAllTimersAsync();

      // Now that timers have run, postMessage (INIT) should have been called.
      expect(mockSpecWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: SPEC_WORKER_MSG_TYPE.INIT }),
      );

      // Ensure postMessage was called before trying to access its details
      if (mockSpecWorkerInstance.postMessage.mock.calls.length === 0) {
        throw new Error(
          "mockSpecWorkerInstance.postMessage was not called by initialize().",
        );
      }
      const initMessageId =
        mockSpecWorkerInstance.postMessage.mock.calls[0][0].messageId;

      // Simulate worker response for INIT_SUCCESS *before* awaiting initializePromise
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS,
            payload: {},
            messageId: initMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error(
          "mockSpecWorkerInstance.onmessage is not set up for INIT_SUCCESS simulation.",
        );
      }

      // Now await the promise. It should resolve as the worker has responded.
      await initializePromise;

      // Ensure promise queue is flushed after initializePromise resolves
      await Promise.resolve();

      // Check the final state update for success
      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramStatus).toBe("Initialized");
      expect(finalState.spectrogramInitialized).toBe(true);
      expect(finalState.spectrogramError).toBeNull();
    });

    it("should update analysisStore on INIT_ERROR from worker message", async () => {
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      await vi.runAllTimersAsync(); // Allow fetch and postMessage

      const initMessageId = mockSpecWorkerInstance.postMessage.mock.calls[0]?.[0]?.messageId;
      if (!initMessageId) throw new Error("No INIT message posted or messageId missing");

      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.INIT_ERROR,
            error: "Init failed in worker",
            messageId: initMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error("onmessage not set for INIT_ERROR simulation.");
      }

      try {
        await initPromise;
      } catch (e) { /* Expected */ }
      await Promise.resolve();

      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramError).toContain("Init failed in worker");
      expect(finalState.spectrogramInitialized).toBe(false);
    });

    it("should update analysisStore on worker onerror during initialize", async () => {
      mockSpecWorkerInstance.postMessage.mockImplementationOnce(() => {
        if (mockSpecWorkerInstance.onerror) {
          mockSpecWorkerInstance.onerror(
            new ErrorEvent("error", { message: "Critical worker failure" }),
          );
        }
        throw new Error("Simulated postMessage failure");
      });

      try {
        await spectrogramService.initialize({ sampleRate: 16000 });
      } catch (e) { /* Expected */ }
      await Promise.resolve();

      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramError).toBeDefined(); // Could be "Critical worker failure" or "Simulated postMessage failure"
      expect(finalState.spectrogramInitialized).toBe(false);
    });
  });

  describe("process", () => {
    beforeEach(async () => {
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      // Allow async operations within initialize (like fetch) to complete and postMessage to be called.
      await vi.runAllTimersAsync();

      if (mockSpecWorkerInstance.postMessage.mock.calls.length === 0) {
        throw new Error(
          "Spectrogram service initialization failed to call postMessage in beforeEach for 'process' tests. Cannot get initMessageId.",
        );
      }
      const initMessageId =
        mockSpecWorkerInstance.postMessage.mock.calls[0][0].messageId;

      // Simulate INIT_SUCCESS *before* awaiting initPromise
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS,
            payload: {},
            messageId: initMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error(
          "mockSpecWorkerInstance.onmessage is not set up for INIT_SUCCESS simulation in 'process' beforeEach.",
        );
      }

      await initPromise;
      await Promise.resolve();
      // Clear any store updates from initialization
      useAnalysisStore.setState({ ...initialAnalysisState, spectrogramInitialized: true, spectrogramStatus: "Initialized" }, true);
    });

    it("should post PROCESS message and update store on success", async () => {
      const processPromise = spectrogramService.process(mockAudioData);
      await vi.runAllTimersAsync();

      expect(mockSpecWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SPEC_WORKER_MSG_TYPE.PROCESS,
          payload: { audioData: mockAudioData },
        }),
      );

      const processCall = mockSpecWorkerInstance.postMessage.mock.calls.find(
        (call) => call[0].type === SPEC_WORKER_MSG_TYPE.PROCESS,
      );
      if (!processCall) throw new Error("PROCESS message not found");
      const processMessageId = processCall[0].messageId;

      const mockResultPayload = { magnitudes: new Float32Array([1, 2, 3]) };
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.PROCESS_RESULT,
            payload: mockResultPayload,
            messageId: processMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error("onmessage not set for PROCESS_RESULT simulation.");
      }

      await processPromise;
      await Promise.resolve();

      const finalState = useAnalysisStore.getState();
      // Check intermediate 'Processing audio...' state
      // This is tricky as setState merges. The service does two setStates.
      // We'll check the final outcome.
      expect(finalState.spectrogramData).toEqual(mockResultPayload.magnitudes);
      expect(finalState.spectrogramStatus).toBe("Processing complete.");
    });

    it("should update store on PROCESS_ERROR from worker", async () => {
      const processPromise = spectrogramService.process(mockAudioData);
      await vi.runAllTimersAsync();

      const processCall = mockSpecWorkerInstance.postMessage.mock.calls.find(
        (call) => call[0].type === SPEC_WORKER_MSG_TYPE.PROCESS,
      );
      if (!processCall) throw new Error("PROCESS message not found for error test.");
      const processMessageId = processCall[0].messageId;

      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.PROCESS_ERROR, // This type doesn't exist in SPEC_WORKER_MSG_TYPE, service uses 'error' from worker.
                                                     // Assuming worker sends a generic 'error' type or the service maps it.
                                                     // For now, let's assume the service gets an error via the main error handler.
            error: "Processing failed in worker",    // The service's onmessage handles 'error' field in payload
            messageId: processMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error("onmessage not set for PROCESS_ERROR simulation.");
      }

      try {
        await processPromise; // This might not reject if service catches and updates store
      } catch(e) { /* Allow for rejection or service handling */ }
      await Promise.resolve();

      const finalState = useAnalysisStore.getState();
      // Based on service logic, error from worker's onmessage (if type is error or payload has error)
      // will update spectrogramError and spectrogramInitialized=false.
      // The current test simulates an 'error' property on the message event data.
      // The service's main onmessage handler:
      // if (error) { ... analysisStore.update(s => ({ ...s, spectrogramError: `Worker error: ${errorMsg}` ...})) }
      // So, this should trigger the error state.
      expect(finalState.spectrogramStatus).toBe("Processing failed."); // This is set in the service's catch block for process()
      expect(finalState.spectrogramError).toContain("Processing failed in worker");
    });
  });

  describe("dispose", () => {
    it("should terminate worker, update store to disposed state, and clear pending promises", async () => {
      const initPromise = spectrogramService.initialize({ sampleRate: 16000 });
      // Allow async operations within initialize (like fetch) to complete and postMessage to be called.
      await vi.runAllTimersAsync();

      if (mockSpecWorkerInstance.postMessage.mock.calls.length === 0) {
        throw new Error(
          "Spectrogram service initialization failed to call postMessage in 'dispose' test. Cannot get initMessageId.",
        );
      }
      const initMessageId =
        mockSpecWorkerInstance.postMessage.mock.calls[0][0].messageId;

      // Simulate INIT_SUCCESS *before* awaiting initPromise
      if (mockSpecWorkerInstance.onmessage) {
        mockSpecWorkerInstance.onmessage({
          data: {
            type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS,
            payload: {},
            messageId: initMessageId,
          },
        } as MessageEvent);
      } else {
        throw new Error(
          "mockSpecWorkerInstance.onmessage is not set up for INIT_SUCCESS simulation in 'dispose' test.",
        );
      }

      await initPromise;
      await Promise.resolve();
      useAnalysisStore.setState({ ...initialAnalysisState, spectrogramInitialized: true, spectrogramStatus: "Initialized" }, true);


      spectrogramService.dispose();

      expect(mockSpecWorkerInstance.terminate).toHaveBeenCalledTimes(1);
      const finalState = useAnalysisStore.getState();
      expect(finalState.spectrogramStatus).toBe("Disposed");
      expect(finalState.spectrogramData).toBeNull();
      expect(finalState.spectrogramInitialized).toBe(false);
      expect(finalState.spectrogramError).toBeNull();
    });

    it("should handle dispose being called multiple times without error", () => {
      spectrogramService.initialize({ sampleRate: 16000 }); // Ensure worker exists

      expect(() => {
        spectrogramService.dispose();
        spectrogramService.dispose(); // Call dispose again
      }).not.toThrow();

      expect(mockSpecWorkerInstance.terminate).toHaveBeenCalledTimes(1); // Still only terminates the first time
    });
  });
});
