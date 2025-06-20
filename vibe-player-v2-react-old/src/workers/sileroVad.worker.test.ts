// vibe-player-v2-react/src/workers/sileroVad.worker.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VAD_WORKER_MSG_TYPE } from '../types/worker.types'; // Adjusted path

// --- Global Mocks for Worker Environment ---
const mockPostMessage = vi.fn();
let onWorkerMessage: Function | null = null;

vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  // Silero VAD worker might not need location.origin if model URL is absolute or passed in.
  // For this test, we assume model is fetched by the worker.
});

// --- Mock for ONNX InferenceSession ---
// The actual ONNX runtime is complex. We mock its interface.
const mockInferenceSession = {
  run: vi.fn(),
};
const mockOrt = {
  InferenceSession: {
    create: vi.fn().mockResolvedValue(mockInferenceSession),
  },
};
vi.stubGlobal('ort', mockOrt); // If ONNX runtime is expected as a global 'ort'

// --- Mock for Silero VAD specific logic object if it's structured that way ---
// If the worker instantiates a class or uses a large object for VAD logic,
// that might need mocking too. From the service, it seems the worker handles this internally.
// For now, we assume the worker's primary job is to manage this session and its inputs/outputs.

// --- Import Worker Script ---
import './sileroVad.worker.ts'; // This executes the script

describe('Silero VAD Worker', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    mockOrt.InferenceSession.create.mockClear().mockResolvedValue(mockInferenceSession);
    mockInferenceSession.run.mockClear().mockImplementation(async (feeds) => {
      // Simulate some output based on input.
      // This is highly dependent on what the actual model and processing logic does.
      // For this test, return a structure that mimics a VAD output (e.g., speech probability).
      const inputFrames = feeds.input.dims[2]; // Example: get number of frames from input
      const outputData = new Float32Array(inputFrames);
      for (let i = 0; i < inputFrames; i++) {
        // Simulate some speech detection based on input values (e.g. if input non-zero)
        // This is a placeholder for actual model behavior.
        const frameData = (feeds.input.data as Float32Array).subarray(i * 64, (i + 1) * 64); // Assuming 64 samples per frame
        let sum = 0;
        frameData.forEach(v => sum += Math.abs(v));
        outputData[i] = sum > 0 ? 0.8 : 0.2; // Simplified speech detection
      }
      return { output: { data: outputData, dims: [1, 1, inputFrames] } };
    });

    // Capture the onmessage handler set by the worker script
    onWorkerMessage = (self as any).onmessage;
    if (typeof onWorkerMessage !== 'function') {
      throw new Error("Worker did not set self.onmessage correctly.");
    }

    // Mock fetch for the ONNX model
    vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (String(url).endsWith('.onnx')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)), // Mock ONNX model data
        } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch in VAD test: ${url}`));
    });
  });

  it('should initialize ONNX session on INIT message and post INIT_SUCCESS', async () => {
    const initPayload = {
      modelBuffer: new ArrayBuffer(0), // Will be fetched by mock
      sampleRate: 16000,
      frameSamples: 512,
      positiveThreshold: 0.7,
      negativeThreshold: 0.3,
    };
    const initMessage = { data: { type: VAD_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'vad_init1' } } as MessageEvent;

    await (onWorkerMessage as Function)(initMessage);

    expect(global.fetch).toHaveBeenCalled(); // If model URL is fetched internally by worker
    expect(mockOrt.InferenceSession.create).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: 'vad_init1' });
  });

  it('should process audio frame on PROCESS message and return PROCESS_RESULT', async () => {
    // Initialize first
    const initPayload = { sampleRate: 16000, frameSamples: 512 };
    await (onWorkerMessage as Function)({ data: { type: VAD_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'vad_init_proc' } } as MessageEvent);
    mockPostMessage.mockClear();

    // Then process
    const audioFrame = new Float32Array(512); // Example audio frame
    const processMessage = {
      data: {
        type: VAD_WORKER_MSG_TYPE.PROCESS,
        payload: { audioFrame, timestamp: 12345 },
        messageId: 'vad_proc1'
      }
    } as MessageEvent;
    await (onWorkerMessage as Function)(processMessage);

    expect(mockInferenceSession.run).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VAD_WORKER_MSG_TYPE.PROCESS_RESULT,
        payload: expect.objectContaining({
          isSpeech: expect.any(Boolean), // or specific based on mock run's logic
          // probability: expect.any(Number), // if worker calculates this
          timestamp: 12345,
        }),
        messageId: 'vad_proc1'
      })
    );
  });

  it('should handle RESET message', async () => {
    // Initialize first
    await (onWorkerMessage as Function)({ data: { type: VAD_WORKER_MSG_TYPE.INIT, payload: {sampleRate: 16000}, messageId: 'vad_init_reset' } } as MessageEvent);
    mockPostMessage.mockClear();

    // Send some data that might change internal VAD state (e.g. _h, _c tensors)
    await (onWorkerMessage as Function)({ data: { type: VAD_WORKER_MSG_TYPE.PROCESS, payload: { audioFrame: new Float32Array(512) }, messageId: 'vad_proc_before_reset' } } as MessageEvent);
    mockPostMessage.mockClear();

    // Send RESET
    const resetMessage = { data: { type: VAD_WORKER_MSG_TYPE.RESET, messageId: 'vad_reset1' } } as MessageEvent;
    await (onWorkerMessage as Function)(resetMessage);

    // Expect a success message for reset
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: `${VAD_WORKER_MSG_TYPE.RESET}_SUCCESS`, messageId: 'vad_reset1' })
    );
    // Further tests could verify that internal states (_h, _c) were actually reset if they are exposed or affect output.
  });

  it('should post error if fetch for ONNX model fails during INIT', async () => {
    (global.fetch as vi.Mock).mockImplementationOnce(async () => Promise.reject(new Error("Fetch ONNX failed")));

    const initPayload = { sampleRate: 16000 };
    const initMessage = { data: { type: VAD_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'vad_init_fetch_fail' } } as MessageEvent;

    await (onWorkerMessage as Function)(initMessage);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: VAD_WORKER_MSG_TYPE.INIT_ERROR, // Service maps this to general ERROR
        error: expect.stringContaining("Fetch ONNX failed"),
        messageId: 'vad_init_fetch_fail'
      })
    );
  });

});
