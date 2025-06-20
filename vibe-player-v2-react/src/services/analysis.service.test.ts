// vibe-player-v2-react/src/services/analysis.service.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VAD_CONSTANTS } from "../utils/constants"; // Corrected path
import { VAD_WORKER_MSG_TYPE } from "../types/worker.types";
import { useAnalysisStore } from "../stores/analysis.store";
import type { AnalysisState } from "../types/analysis.types";
import analysisServiceInstance from "./analysis.service"; // Import the actual instance

// --- Mock Dependencies ---

// Define the shape of our mock worker instance
interface MockWorker {
  postMessage: vi.Mock;
  terminate: vi.Mock;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

// Create the mock worker instance
const mockVadWorkerInstance: MockWorker = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
};

// Mock the worker constructor
vi.mock("../workers/sileroVad.worker?worker", () => {
  // The default export of a ?worker import is the worker constructor
  return {
    default: vi.fn().mockImplementation(() => mockVadWorkerInstance),
  };
});


const initialAnalysisState: AnalysisState = {
  vadStatus: "idle",
  lastVadResult: null,
  isSpeaking: undefined,
  vadStateResetted: undefined,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5,
  vadNegativeThreshold: 0.35,
  spectrogramStatus: "Spectrogram service idle",
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,
  isLoading: false,
};

describe("AnalysisService (VAD Only)", () => {
  // Use the imported singleton instance for all tests
  const analysisService = analysisServiceInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    useAnalysisStore.setState({ ...initialAnalysisState }, true); // Reset store

    // Reset worker instance properties that might be set by the service
    mockVadWorkerInstance.onmessage = null;
    mockVadWorkerInstance.onerror = null;

    // Mock global fetch for ONNX model
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)), // Minimal valid ArrayBuffer
    } as unknown as Response);

    // Since analysisService is a singleton, we call dispose to reset its internal state
    // IF it has been initialized in a previous test.
    // This is important because the service instance persists across tests.
    analysisService.dispose();
  });

  afterEach(() => {
    // No specific cleanup needed here as beforeEach handles reset
  });

  describe("initialize (VAD)", () => {
    it("should successfully initialize the VAD worker and update store", async () => {
      const initPromise = analysisService.initialize();

      // Allow microtasks to run (e.g., promise resolutions within initialize)
      await new Promise(resolve => setImmediate(resolve));

      expect(fetch).toHaveBeenCalledWith(VAD_CONSTANTS.ONNX_MODEL_URL);
      // Worker constructor should be called by now due to `new SileroVadWorker()`
      // The mock for the worker path should ensure our mockVadWorkerInstance is used.
      expect(mockVadWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: VAD_WORKER_MSG_TYPE.INIT }),
        expect.any(Array), // For the modelBuffer transferable
      );

      // Simulate the worker sending INIT_SUCCESS
      // Ensure onmessage has been set by the service's initialize method
      if (mockVadWorkerInstance.onmessage) {
        act(() => { // Wrap state-updating worker message in act
            mockVadWorkerInstance.onmessage!({
                data: { type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: "vad_msg_0" }, // Assuming messageId starts at 0
            } as MessageEvent);
        });
      } else {
        throw new Error("Worker onmessage handler not set during initialization");
      }

      await expect(initPromise).resolves.toBeUndefined();

      const storeState = useAnalysisStore.getState();
      expect(storeState.vadInitialized).toBe(true);
      expect(storeState.vadStatus).toBe("VAD service initialized.");
      expect(storeState.vadError).toBeNull();
    });

    it("should handle initialization failure from the worker and update store", async () => {
      const initPromise = analysisService.initialize();
      await new Promise(resolve => setImmediate(resolve));

      expect(mockVadWorkerInstance.postMessage).toHaveBeenCalled();

      // Simulate worker sending INIT_ERROR
      if (mockVadWorkerInstance.onmessage) {
        act(() => {
            mockVadWorkerInstance.onmessage!({
                data: { type: VAD_WORKER_MSG_TYPE.INIT_ERROR, error: "Worker init failed", messageId: "vad_msg_0" },
            } as MessageEvent);
        });
      } else {
        throw new Error("Worker onmessage handler not set");
      }

      await expect(initPromise).rejects.toThrow("Worker init failed");

      const storeState = useAnalysisStore.getState();
      expect(storeState.vadInitialized).toBe(false);
      expect(storeState.vadStatus).toBe("Error initializing VAD service.");
      expect(storeState.vadError).toContain("Worker init failed");
    });

     it("should handle fetch failure for ONNX model and update store", async () => {
      (fetch as vi.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response);

      await expect(analysisService.initialize()).rejects.toThrow(/Failed to fetch ONNX model: Not Found/);

      const storeState = useAnalysisStore.getState();
      expect(storeState.vadInitialized).toBe(false);
      expect(storeState.vadStatus).toBe("Error sending VAD init to worker."); // This status is set before throwing
      expect(storeState.vadError).toContain("Failed to fetch ONNX model: Not Found");
    });
  });

  describe("analyzeAudioFrame", () => {
    beforeEach(async () => {
      // Ensure service is initialized before each test in this block
      const initPromise = analysisService.initialize();
      if (mockVadWorkerInstance.onmessage) {
         act(() => {
            mockVadWorkerInstance.onmessage!({ data: { type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: "vad_msg_0"} } as MessageEvent);
         });
      }
      await initPromise;
      mockVadWorkerInstance.postMessage.mockClear(); // Clear postMessage calls from init
    });

    it("should send audio frame to worker and update store on result", async () => {
      const audioFrame = new Float32Array(VAD_CONSTANTS.DEFAULT_FRAME_SAMPLES).fill(0.1);
      const timestamp = Date.now();

      const processPromise = analysisService.analyzeAudioFrame(audioFrame, timestamp);
      await new Promise(resolve => setImmediate(resolve));

      expect(mockVadWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: VAD_WORKER_MSG_TYPE.PROCESS, payload: { audioFrame, timestamp } }),
        [audioFrame.buffer]
      );

      const mockResultPayload = { isSpeech: true, score: 0.8, timestamp };
      if (mockVadWorkerInstance.onmessage) {
        act(() => {
            mockVadWorkerInstance.onmessage!({
                data: { type: VAD_WORKER_MSG_TYPE.PROCESS_RESULT, payload: mockResultPayload, messageId: "vad_msg_1" }
            } as MessageEvent);
        });
      } else {
        throw new Error("Worker onmessage handler not set");
      }

      await expect(processPromise).resolves.toEqual(mockResultPayload);

      const storeState = useAnalysisStore.getState();
      expect(storeState.lastVadResult).toEqual(mockResultPayload);
      expect(storeState.isSpeaking).toBe(true);
    });

    it("should throw error if service not initialized", async () => {
      analysisService.dispose(); // Ensure it's not initialized
      const audioFrame = new Float32Array(VAD_CONSTANTS.DEFAULT_FRAME_SAMPLES);
      await expect(analysisService.analyzeAudioFrame(audioFrame)).rejects.toThrow("VAD Service not initialized or worker unavailable.");
    });
  });

  describe("dispose", () => {
    it("should terminate the worker if it was initialized", async () => {
      const initPromise = analysisService.initialize();
      if (mockVadWorkerInstance.onmessage) {
         act(() => {
            mockVadWorkerInstance.onmessage!({ data: { type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: "vad_msg_0" } } as MessageEvent);
         });
      }
      await initPromise;

      analysisService.dispose();
      expect(mockVadWorkerInstance.terminate).toHaveBeenCalledTimes(1);
      const storeState = useAnalysisStore.getState();
      expect(storeState.vadInitialized).toBe(false);
      expect(storeState.vadStatus).toBe("VAD service disposed.");
    });

    it("should not throw an error if called before initialization", () => {
      expect(() => analysisService.dispose()).not.toThrow();
      expect(mockVadWorkerInstance.terminate).not.toHaveBeenCalled();
    });
  });
});

// Helper to wrap state updates in act for React testing environment
// Vitest doesn't run in a browser, so `act` might not be strictly necessary here
// unless tests involve components that react to these store changes.
// For service-only tests, it's often omitted, but good practice if any async updates might occur.
const act = async (callback: () => void) => {
  // Simple version for non-component tests
  callback();
  await new Promise(resolve => setImmediate(resolve));
};
