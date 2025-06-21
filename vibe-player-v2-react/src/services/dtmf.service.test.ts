// vibe-player-v2-react/src/services/dtmf.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DtmfWorker from "../workers/dtmf.worker?worker"; // Path for Vite
import dtmfServiceInstance from "./dtmf.service"; // Import the actual instance
import { useDtmfStore, DtmfState } from "../stores/dtmf.store"; // Zustand import and type

// Mock Web Workers
const mockDtmfWorkerInstance = {
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  onerror: null as ((event: ErrorEvent) => void) | null,
};

vi.mock("../workers/dtmf.worker?worker", () => ({ // Path for Vite
  default: vi.fn().mockImplementation(() => mockDtmfWorkerInstance),
}));

// Mock OfflineAudioContext
const mockGetChannelData = vi.fn();
const mockStartRendering = vi.fn();

// Define initialDtmfState for tests
const initialDtmfState: DtmfState = {
  status: "idle",
  dtmf: [],
  cpt: [],
  error: null,
};

// Minimal valid AudioBuffer mock
const mockAudioBuffer = {
  length: 48000, // Example length
  sampleRate: 48000, // Example sampleRate
  duration: 1.0,
  numberOfChannels: 1,
  getChannelData: vi.fn(() => new Float32Array(48000)), // Mock this method
} as unknown as AudioBuffer;

const resampledAudioBufferMock = {
  getChannelData: mockGetChannelData,
} as unknown as AudioBuffer;


describe("DtmfService", () => {
  const dtmfService = dtmfServiceInstance; // Use the singleton

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset worker instance properties
    mockDtmfWorkerInstance.onmessage = null;
    mockDtmfWorkerInstance.onerror = null;

    // Reset Zustand store
    useDtmfStore.setState({ ...initialDtmfState }, true);

    // Mock global OfflineAudioContext
    /* eslint-disable @typescript-eslint/no-explicit-any */
    global.OfflineAudioContext = vi.fn().mockImplementation(() => ({
        createBufferSource: vi.fn(() => ({
            buffer: null,
            connect: vi.fn(),
            start: vi.fn(),
        })),
        startRendering: mockStartRendering,
        destination: {} // Mock destination property
    })) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */


    // Dispose before each test to ensure worker is re-initialized if needed by test logic
    dtmfService.dispose();
  });

  afterEach(() => {
    dtmfService.dispose(); // Ensure cleanup after each test
  });

  describe("initialize", () => {
    it("should create DTMF worker, post INIT message, and update store on init_complete", () => {
      dtmfService.initialize(16000);

      expect(DtmfWorker).toHaveBeenCalledTimes(1); // Checks if constructor was called
      expect(mockDtmfWorkerInstance.postMessage).toHaveBeenCalledWith({
        type: "INIT", // Corrected to match worker's expectation
        payload: { sampleRate: 16000 },
      });
      expect(useDtmfStore.getState().status).toBe("initializing"); // Set during initialize call

      // Simulate worker response for init_complete
      if (mockDtmfWorkerInstance.onmessage) {
        mockDtmfWorkerInstance.onmessage({
          data: { type: "INIT_COMPLETE" }, // Corrected to match worker's response
        } as MessageEvent);
      }
      expect(useDtmfStore.getState().status).toBe("idle");
      expect(useDtmfStore.getState().error).toBeNull();
    });

    it("should update dtmfStore on 'ERROR' message from worker during init", () => {
      dtmfService.initialize(16000);

      if (mockDtmfWorkerInstance.onmessage) {
        mockDtmfWorkerInstance.onmessage({
          data: { type: "ERROR", error: "Init failed" }, // Corrected to match worker's error structure
        } as MessageEvent);
      }
      expect(useDtmfStore.getState().status).toBe("error");
      expect(useDtmfStore.getState().error).toBe("Init failed");
    });
  });

  describe("process", () => {
    beforeEach(() => {
      dtmfService.initialize(16000); // Ensure service is initialized
      if (mockDtmfWorkerInstance.onmessage) {
        mockDtmfWorkerInstance.onmessage({ data: { type: "INIT_COMPLETE" } } as MessageEvent);
      }
      useDtmfStore.setState({...initialDtmfState, status: "idle"}, true);

      mockGetChannelData.mockReturnValue(new Float32Array(16000));
      mockStartRendering.mockResolvedValue(resampledAudioBufferMock);
    });

    it("should update store to 'processing', resample audio, and post 'PROCESS' message", async () => {
      await dtmfService.process(mockAudioBuffer);

      expect(useDtmfStore.getState().status).toBe("processing");
      expect(global.OfflineAudioContext).toHaveBeenCalledWith(
        mockAudioBuffer.numberOfChannels, // Use actual channels from mockAudioBuffer
        mockAudioBuffer.duration * 16000,
        16000,
      );
      expect(mockStartRendering).toHaveBeenCalled();

      // Ensure the promise from startRendering resolves before checking postMessage
      await Promise.resolve(); // Wait for microtasks

      expect(mockDtmfWorkerInstance.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "PROCESS", // Corrected
          payload: { pcmData: expect.any(Float32Array) },
        }),
        [expect.any(ArrayBuffer)] // For transferable pcmData.buffer
      );
    });

    it("should update store with results on 'RESULT' message from worker", async () => {
      const processPromise = dtmfService.process(mockAudioBuffer);

      // Simulate worker response for result
      if (mockDtmfWorkerInstance.onmessage) {
        mockDtmfWorkerInstance.onmessage({
          data: {
            type: "RESULT", // Corrected
            payload: { dtmf: ["1", "2"], cpt: ["busy"] },
          },
        } as MessageEvent);
      }
      await processPromise;

      const finalState = useDtmfStore.getState();
      expect(finalState.status).toBe("complete");
      expect(finalState.dtmf).toEqual(["1", "2"]);
      expect(finalState.cpt).toEqual(["busy"]);
    });

    it("should throw error and update store if worker not initialized", async () => {
      dtmfService.dispose(); // Ensure worker is null
      useDtmfStore.setState({ ...initialDtmfState }, true);

      await expect(dtmfService.process(mockAudioBuffer)).rejects.toThrow("DTMF Worker not initialized.");

      const finalState = useDtmfStore.getState();
      expect(finalState.status).toBe("error");
      expect(finalState.error).toBe("DTMF Worker not initialized.");
    });

    it("should throw error and update store if resampling fails", async () => {
      const resamplingError = new Error("Resampling failed");
      mockStartRendering.mockRejectedValueOnce(resamplingError);
      useDtmfStore.setState({ ...initialDtmfState }, true);

      await expect(dtmfService.process(mockAudioBuffer)).rejects.toThrow(resamplingError);

      const finalState = useDtmfStore.getState();
      expect(finalState.status).toBe("error");
      expect(finalState.error).toContain("Resampling or posting message to worker failed: Resampling failed");
    });
  });

  describe("dispose", () => {
    it("should terminate worker", () => {
      dtmfService.initialize(16000);
      if (mockDtmfWorkerInstance.onmessage) {
        mockDtmfWorkerInstance.onmessage({ data: { type: "INIT_COMPLETE" } } as MessageEvent);
      }
      dtmfService.dispose();
      expect(mockDtmfWorkerInstance.terminate).toHaveBeenCalledTimes(1);
    });

    it("should do nothing if worker already null", () => {
      dtmfService.dispose(); // Worker is null now
      mockDtmfWorkerInstance.terminate.mockClear(); // Clear calls from previous dispose
      dtmfService.dispose(); // Call again
      expect(mockDtmfWorkerInstance.terminate).not.toHaveBeenCalled();
    });
  });
});
