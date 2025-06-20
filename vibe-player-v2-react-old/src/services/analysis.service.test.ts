// vibe-player-v2-react/src/services/analysis.service.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VAD_CONSTANTS } from "../utils"; // Adjusted path
import { VAD_WORKER_MSG_TYPE } from "../types/worker.types"; // Adjusted path
import { useAnalysisStore } from "../stores/analysis.store"; // Zustand import
import type { AnalysisState } from "../types/analysis.types"; // Import type for initial state

// --- Mock Dependencies ---

const mockVadWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent) => void) | null,
  __IS_MOCK__: true,
};

// No longer mocking the Svelte store module.
// vi.mock("$lib/stores/analysis.store", ...);

vi.mock("../workers/sileroVad.worker?worker&inline", () => { // Adjusted path
  const MockConstructor = vi.fn().mockImplementation(() => {
    return mockVadWorkerInstance;
  });
  return { default: MockConstructor };
});

// Define initialAnalysisState for tests
const initialAnalysisState: AnalysisState = {
  vadStatus: "idle",
  lastVadResult: null,
  isSpeaking: undefined,
  vadStateResetted: undefined,
  vadError: null,
  vadInitialized: false,
  vadPositiveThreshold: 0.5, // Default from actual store
  vadNegativeThreshold: 0.35, // Default from actual store
  spectrogramStatus: undefined,
  spectrogramError: null,
  spectrogramData: null,
  spectrogramInitialized: false,
  isLoading: false,
};

describe("AnalysisService (VAD Only)", () => {
  let analysisService: typeof import("./analysis.service").default;

  beforeEach(async () => {
    vi.resetModules();

    // Dynamically import the service to get a fresh instance
    const serviceModule = await import("./analysis.service");
    analysisService = serviceModule.default;

    vi.clearAllMocks();

    // Reset Zustand store
    useAnalysisStore.setState({ ...initialAnalysisState }, true);

    // Mock the global `fetch` API
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    } as Response);

    // Dispose the freshly imported service instance to ensure clean state before test logic
    analysisService.dispose();
  });

  afterEach(() => {
    // Restore original implementations after each test.
    // vi.restoreAllMocks(); // restoreAllMocks might be too broad if fetch is spied globally
    // vi.resetAllMocks() could also be an option if preferred over clearAllMocks.
    // For now, beforeEach handles spy setup.
  });

  describe("initialize (VAD)", () => {
    // FIX: Correctly test the asynchronous flow.
    it("should successfully initialize the VAD worker", async () => {
      // Act: Start the initialization process.
      const initPromise = analysisService.initialize();

      // Give a chance for async operations within initialize() to proceed up to postMessage
      await new Promise((resolve) => setImmediate(resolve)); // Ensures any sync code in initialize runs

      // Directly check if postMessage spy was called
      expect(mockVadWorkerInstance.postMessage.mock.calls.length).toBe(1);
      expect(mockVadWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: VAD_WORKER_MSG_TYPE.INIT }),
        expect.any(Array),
      );

      // Simulate: The worker sends a "success" message back.
      mockVadWorkerInstance.onmessage!({
        data: {
          type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS,
          messageId: "vad_msg_0",
        },
      } as MessageEvent);

      // Assert: The main initialization promise should now resolve without errors.
      await expect(initPromise).resolves.toBeUndefined();

      // Assert (Final): Check that fetch was also called as expected.
      expect(global.fetch).toHaveBeenCalledWith(VAD_CONSTANTS.ONNX_MODEL_URL);
    });

    // FIX: Correctly test the rejection flow.
    it("should handle initialization failure from the worker", async () => {
      // Act: Start the initialization process.
      const initPromise = analysisService.initialize();

      // Give a chance for async operations within initialize() to proceed up to postMessage
      await new Promise((resolve) => setImmediate(resolve));

      // Directly check if postMessage spy was called (it should be, to register the promise)
      expect(mockVadWorkerInstance.postMessage.mock.calls.length).toBe(1);

      // Simulate: The worker responds with an error message.
      mockVadWorkerInstance.onmessage!({
        data: {
          type: VAD_WORKER_MSG_TYPE.INIT_ERROR,
          error: "Model load failed",
          messageId: "vad_msg_0",
        },
      } as MessageEvent);

      // Assert: The promise should reject with the worker's error.
      await expect(initPromise).rejects.toThrowError("Model load failed");
    });
  });

  // ... (dispose tests should now pass due to the beforeEach fix)
  describe("dispose", () => {
    it("should terminate the worker if it was initialized", async () => {
      // Arrange
      const initPromise = analysisService.initialize();

      // Give a chance for async operations within initialize() to proceed up to postMessage
      await new Promise((resolve) => setImmediate(resolve));

      // Check postMessage was called for initialization
      expect(mockVadWorkerInstance.postMessage.mock.calls.length).toBe(1);

      mockVadWorkerInstance.onmessage!({
        data: {
          type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS,
          messageId: "vad_msg_0",
        },
      } as MessageEvent);
      await initPromise; // This should now resolve

      // Act
      analysisService.dispose();

      // Assert
      expect(mockVadWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should not throw an error if called before initialization", () => {
      // Arrange: The beforeEach hook already ensures a clean state.

      // Act & Assert
      expect(() => analysisService.dispose()).not.toThrow();
      expect(mockVadWorkerInstance.terminate).not.toHaveBeenCalled();
    });
  });
});
