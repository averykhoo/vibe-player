// vibe-player-v2-react/src/workers/rubberband.worker.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { RB_WORKER_MSG_TYPE } from '../types/worker.types'; // Adjusted path

// --- Global Mocks for Worker Environment ---
const mockPostMessage = vi.fn();
let onWorkerMessage: Function | null = null; // To capture the worker's self.onmessage

vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  addEventListener: vi.fn(), // If used
  removeEventListener: vi.fn(), // If used
  onmessage: null, // Worker will set this
  location: { origin: 'http://localhost:3000' }, // For PitchShifter.js if it uses self.location.origin
});

// --- Mock for RubberBand PitchShifter ---
// The actual RubberBand PitchShifter is complex and involves WASM.
// We mock its interface to test the worker's interaction with it.
const MockPitchShifter = vi.fn().mockImplementation(() => ({
  set_time_ratio: vi.fn(),
  set_pitch_scale: vi.fn(),
  study: vi.fn(),
  process: vi.fn((input: Float32Array[][], isFinal: boolean) => {
    // Return dummy processed audio of similar structure but not necessarily meaningful content
    return input.map(channel => new Float32Array(channel[0].length / 2)); // e.g. half length
  }),
  get_frames_required: vi.fn(() => 0), // Adjust if worker logic depends on this
  get_channel_count: vi.fn(() => 1),   // Adjust if worker logic depends on this
  reset: vi.fn(),
  destroy: vi.fn(),
}));

vi.stubGlobal('RubberBand', { PitchShifter: MockPitchShifter });
vi.stubGlobal('fetch', vi.fn()); // Mock fetch for wasmBinary and loaderScriptText

// --- Import Worker Script ---
// This executes the worker code, setting up its message handlers on the mocked `self`
import './rubberband.worker.ts';

describe('RubberBand Worker', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    MockPitchShifter.mockClear(); // Clear calls to constructor
    // Clear calls to all methods of all instances of MockPitchShifter
    MockPitchShifter.mock.results.forEach(instanceResult => {
      if (instanceResult.type === 'return') {
        Object.values(instanceResult.value).forEach(method => {
          if (vi.isMockFunction(method)) {
            method.mockClear();
          }
        });
      }
    });

    (global.fetch as vi.Mock).mockClear().mockImplementation(async (url: string) => {
      if (url.includes('rubberband.wasm')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)), // Minimal WASM mock
        });
      }
      if (url.includes('rubberband-loader.js')) {
        // Mock the loader script content. It defines `RubberBand`.
        // The actual content is complex, but for the test, we just need to ensure
        // it can be "evaluated" and that `RubberBand.PitchShifter` is available (which we mocked).
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`
            // Minimal mock of rubberband-loader.js
            // It would typically define a 'Module' or 'RubberBand' global.
            // Since we've globally mocked RubberBand.PitchShifter, this is mostly for show.
            console.log("Mocked rubberband-loader.js executed");
          `),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    // Capture the onmessage handler set by the worker script
    // The worker script should assign its handler to `self.onmessage`.
    // We need to ensure `self` is correctly typed or cast for this.
    onWorkerMessage = (self as any).onmessage;
    if (typeof onWorkerMessage !== 'function') {
      throw new Error("Worker did not set self.onmessage correctly.");
    }
  });

  it('should initialize PitchShifter on INIT message and post INIT_SUCCESS', async () => {
    const initPayload = {
      wasmBinary: new ArrayBuffer(0), // Will be fetched by mock
      loaderScriptText: "", // Will be fetched by mock
      origin: 'http://localhost:3000',
      sampleRate: 44100,
      channels: 1,
      initialSpeed: 1.0,
      initialPitch: 0.0,
    };
    const initMessage = { data: { type: RB_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'init1' } } as MessageEvent;

    await (onWorkerMessage as Function)(initMessage);

    expect(global.fetch).toHaveBeenCalledTimes(2); // For WASM and loader
    expect(MockPitchShifter).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: RB_WORKER_MSG_TYPE.INIT_SUCCESS, messageId: 'init1' });
  });

  it('should call PitchShifter.process on PROCESS message and return PROCESS_RESULT', async () => {
    // First, initialize
    const initPayload = { sampleRate: 44100, channels: 1, initialSpeed: 1.0, initialPitch: 0.0 };
    await (onWorkerMessage as Function)({ data: { type: RB_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'init_proc' } } as MessageEvent);
    mockPostMessage.mockClear(); // Clear INIT_SUCCESS

    // Then, process
    const inputBuffer = [new Float32Array(1024)];
    const processMessage = {
      data: {
        type: RB_WORKER_MSG_TYPE.PROCESS,
        payload: { inputBuffer, isFinalChunk: false },
        messageId: 'proc1'
      }
    } as MessageEvent;
    await (onWorkerMessage as Function)(processMessage);

    const pitchShifterInstance = MockPitchShifter.mock.results[0].value;
    expect(pitchShifterInstance.process).toHaveBeenCalledWith([inputBuffer], false); // Note: worker wraps inputBuffer
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RB_WORKER_MSG_TYPE.PROCESS_RESULT,
        payload: { outputBuffer: expect.any(Array) },
        messageId: 'proc1'
      })
    );
  });

  it('should call PitchShifter.set_time_ratio on SET_SPEED message', async () => {
    await (onWorkerMessage as Function)({ data: { type: RB_WORKER_MSG_TYPE.INIT, payload: {sampleRate:44100, channels:1}, messageId: 'init_speed' } } as MessageEvent);
    const pitchShifterInstance = MockPitchShifter.mock.results[0].value;

    const speedMessage = { data: { type: RB_WORKER_MSG_TYPE.SET_SPEED, payload: { speed: 1.5 } } } as MessageEvent;
    await (onWorkerMessage as Function)(speedMessage);
    expect(pitchShifterInstance.set_time_ratio).toHaveBeenCalledWith(1.5);
  });

  it('should call PitchShifter.set_pitch_scale on SET_PITCH message', async () => {
    await (onWorkerMessage as Function)({ data: { type: RB_WORKER_MSG_TYPE.INIT, payload: {sampleRate:44100, channels:1}, messageId: 'init_pitch' } } as MessageEvent);
    const pitchShifterInstance = MockPitchShifter.mock.results[0].value;

    const pitchMessage = { data: { type: RB_WORKER_MSG_TYPE.SET_PITCH, payload: { pitch: 2.0 } } } as MessageEvent;
    await (onWorkerMessage as Function)(pitchMessage);
    expect(pitchShifterInstance.set_pitch_scale).toHaveBeenCalledWith(2.0);
  });

  it('should call PitchShifter.reset on RESET message', async () => {
    await (onWorkerMessage as Function)({ data: { type: RB_WORKER_MSG_TYPE.INIT, payload: {sampleRate:44100, channels:1}, messageId: 'init_reset' } } as MessageEvent);
    const pitchShifterInstance = MockPitchShifter.mock.results[0].value;

    const resetMessage = { data: { type: RB_WORKER_MSG_TYPE.RESET } } as MessageEvent;
    await (onWorkerMessage as Function)(resetMessage);
    expect(pitchShifterInstance.reset).toHaveBeenCalled();
  });

  it('should post error if fetch fails during INIT', async () => {
    (global.fetch as vi.Mock).mockImplementationOnce(async () => Promise.reject(new Error("Fetch failed")));

    const initPayload = { sampleRate: 44100, channels: 1 };
    const initMessage = { data: { type: RB_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'init_fail' } } as MessageEvent;

    await (onWorkerMessage as Function)(initMessage);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RB_WORKER_MSG_TYPE.ERROR,
        error: expect.stringContaining("Fetch failed"),
        messageId: 'init_fail'
      })
    );
  });

});
