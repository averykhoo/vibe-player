// vibe-player-v2-react/src/workers/spectrogram.worker.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SPEC_WORKER_MSG_TYPE } from '../types/worker.types'; // Adjusted path

// --- Global Mocks for Worker Environment ---
const mockPostMessage = vi.fn();
let onWorkerMessage: Function | null = null;

// Mock for importScripts. fft.js would define FFT on self.
// We need to simulate this.
const mockFFT = {
  init: vi.fn(),
  fft: vi.fn((out, real, imag) => {
    // Simulate FFT output: fill `out` array with some values
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.random(); // Dummy FFT output
    }
  }),
};

vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  location: { origin: 'http://localhost:3000' }, // For fft.js if it uses self.location.origin
  importScripts: vi.fn((scriptUrl: string) => {
    // When importScripts('fft.js') is called, simulate its effect by attaching FFT to self.
    if (scriptUrl.endsWith('fft.js')) {
      (self as any).FFT = mockFFT; // Make the mock FFT available on self
    } else {
      console.warn(`importScripts called with unexpected URL in test: ${scriptUrl}`);
    }
  }),
  // Placeholder for FFT class if fft.js assigns it to self
  FFT: null,
});


// --- Import Worker Script ---
// This executes the worker code, setting up its message handlers on the mocked `self`
import './spectrogram.worker.ts';

describe('Spectrogram Worker', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    mockFFT.init.mockClear();
    mockFFT.fft.mockClear();

    // Reset self.FFT before each test in case a previous test set it through importScripts
    // The import './spectrogram.worker.ts' will call importScripts again.
    (self as any).FFT = null;
    (self.importScripts as vi.Mock).mockClear();


    // Capture the onmessage handler set by the worker script
    onWorkerMessage = (self as any).onmessage;
    if (typeof onWorkerMessage !== 'function') {
      throw new Error("Worker did not set self.onmessage correctly.");
    }

    // Mock fetch for the FFT script text for the INIT message
    // The worker's INIT takes fftScriptText as a payload, not URL.
    // So, direct fetch mock for fft.js might not be needed here if service provides text.
    // However, the worker *itself* calls importScripts(payload.fftScriptUrl) if that's how it's designed.
    // The current spectrogram.worker.ts seems to take fftScriptText in init.
    // The service fetches fft.js and passes its text.
    // The worker then does: eval(payload.fftScriptText + '\\nself.FFT = FFT;').
    // So, we don't need to mock fetch here for FFT script, but ensure self.FFT is set by eval.
    // The importScripts mock above handles the case IF the worker used importScripts directly.
    // Given the eval approach, the FFT mock needs to be available globally for eval.
    vi.stubGlobal('FFT', mockFFT); // Make FFT globally available for eval

  });

  it('should initialize FFT on INIT message and post INIT_SUCCESS', async () => {
    const initPayload = {
      sampleRate: 44100,
      fftSize: 1024,
      hopLength: 256,
      // fftScriptText: "//fft.js content mock", // This is now handled by the service providing it
      // The worker itself might not need origin if script text is passed.
    };
    const initMessage = { data: { type: SPEC_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'spec_init1' } } as MessageEvent;

    await (onWorkerMessage as Function)(initMessage);

    // Check if FFT was initialized via the mechanism in the worker (e.g. new self.FFT)
    // If the worker does `this.fft = new self.FFT(fftSize, sampleRate, channels)`, then:
    // expect(mockFFT.init).toHaveBeenCalledWith(initPayload.fftSize, initPayload.sampleRate);
    // The current spectrogram.worker.ts uses `this.fft = new FFT(this.fftSize, this.sampleRate, this.numChannels);`
    // `this.numChannels` is hardcoded to 1 in the worker.
    expect(mockFFT.init).toHaveBeenCalledWith(initPayload.fftSize, initPayload.sampleRate, 1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: SPEC_WORKER_MSG_TYPE.INIT_SUCCESS, payload: {}, messageId: 'spec_init1' });
  });

  it('should process audioData on PROCESS message and return PROCESS_RESULT', async () => {
    // Initialize first
    const initPayload = { sampleRate: 44100, fftSize: 1024, hopLength: 256 };
    await (onWorkerMessage as Function)({ data: { type: SPEC_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'spec_init_proc' } } as MessageEvent);
    mockPostMessage.mockClear();

    // Then process
    const audioData = new Float32Array(2048); // Example audio data
    const processMessage = {
      data: {
        type: SPEC_WORKER_MSG_TYPE.PROCESS,
        payload: { audioData },
        messageId: 'spec_proc1'
      }
    } as MessageEvent;
    await (onWorkerMessage as Function)(processMessage);

    expect(mockFFT.fft).toHaveBeenCalled(); // Check if the core FFT function was called
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SPEC_WORKER_MSG_TYPE.PROCESS_RESULT,
        payload: expect.objectContaining({
          magnitudes: expect.any(Float32Array), // Or Array if it's converted
        }),
        messageId: 'spec_proc1'
      })
    );
  });

  it('should handle errors during processing', async () => {
    // Initialize
    const initPayload = { sampleRate: 44100, fftSize: 1024, hopLength: 256 };
    await (onWorkerMessage as Function)({ data: { type: SPEC_WORKER_MSG_TYPE.INIT, payload: initPayload, messageId: 'spec_init_err' } } as MessageEvent);
    mockPostMessage.mockClear();

    // Make FFT processing throw an error
    mockFFT.fft.mockImplementationOnce(() => {
      throw new Error("FFT calculation failed");
    });

    const audioData = new Float32Array(2048);
    const processMessage = {
      data: {
        type: SPEC_WORKER_MSG_TYPE.PROCESS,
        payload: { audioData },
        messageId: 'spec_proc_err'
      }
    } as MessageEvent;

    await (onWorkerMessage as Function)(processMessage);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SPEC_WORKER_MSG_TYPE.ERROR, // Worker should post an error
        error: expect.stringContaining("FFT calculation failed"),
        messageId: 'spec_proc_err'
      })
    );
  });

});
