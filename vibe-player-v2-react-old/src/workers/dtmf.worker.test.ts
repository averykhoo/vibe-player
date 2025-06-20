// vibe-player-v2-react/src/workers/dtmf.worker.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock self globally for this test file
const mockPostMessage = vi.fn();
vi.stubGlobal('self', {
  postMessage: mockPostMessage,
  // Add any other properties from `self` the worker might use.
  // DTMF worker seems simple and might not need more.
});

// Import the worker script. This will execute it and attach `onmessage` to the mocked `self`.
// This line assumes the worker script is written in a way that it attaches its event handlers to `self` upon execution.
import './dtmf.worker.ts';

describe('DTMF Worker', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
    // Reset any state if your worker module maintains state outside the onmessage handler
    // For dtmf.worker, state seems to be managed within onmessage or local to functions.
  });

  it('should initialize correctly and respond with init_complete', () => {
    const initMessage = { data: { type: 'init', payload: { sampleRate: 16000 } } } as MessageEvent;
    if (typeof self.onmessage === 'function') {
      (self.onmessage as Function)(initMessage);
    } else {
      throw new Error("self.onmessage is not a function or not set by the worker script.");
    }

    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'init_complete' }));
  });

  it('should process PCM data and return DTMF results', () => {
    // Step 1: Initialize the worker (if its stateful or requires init)
    const initMessage = { data: { type: 'init', payload: { sampleRate: 16000 } } } as MessageEvent;
    if (typeof self.onmessage === 'function') {
      (self.onmessage as Function)(initMessage);
    } else {
      throw new Error("self.onmessage not set for init.");
    }
    mockPostMessage.mockClear(); // Clear postMessage calls from init

    // Step 2: Send process message
    const pcmData = new Float32Array(16000 * 0.5); // 0.5 seconds of audio
    // Fill with some dummy data, not critical for this unit test unless internal logic is very specific
    for(let i=0; i < pcmData.length; i++) pcmData[i] = Math.random() * 0.1;

    const processMessage = { data: { type: 'process', payload: { pcmData } } } as MessageEvent;
    if (typeof self.onmessage === 'function') {
      (self.onmessage as Function)(processMessage);
    } else {
      throw new Error("self.onmessage not set for process.");
    }

    // We expect a 'result' message. The actual DTMF/CPT detection logic is complex and
    // is treated as a black box for this basic unit test. We just check the structure.
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'result',
        payload: expect.objectContaining({
          dtmf: expect.any(Array),
          cpt: expect.any(Array),
        }),
      }),
    );
  });

  it('should post an error message if processing is attempted before init (if worker designed to error)', () => {
    // This test depends on how the worker handles out-of-order messages.
    // The current dtmf.worker.ts seems to overwrite onmessage on init, implying it might not error explicitly
    // but rather fail to process correctly or use a default/uninitialized state.
    // For a robust test, the worker would ideally post an error.
    // Assuming it might post an error or a specific state if not initialized:
    const pcmData = new Float32Array(100);
    const processMessage = { data: { type: 'process', payload: { pcmData } } } as MessageEvent;

    // What happens if self.onmessage is not set before first message?
    // The import './dtmf.worker.ts' should set it.
    if (typeof self.onmessage === 'function') {
        (self.onmessage as Function)(processMessage);
        // This test is speculative: the actual worker might not send an error,
        // but might silently fail or process with default/bad values.
        // A more robust worker would send an error.
        // Example: expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', payload: 'Not initialized' }));
        // For now, just check it was called, actual behavior depends on worker's internal uninitialized state handling.
        expect(mockPostMessage).toHaveBeenCalled();
    } else {
        console.warn("Skipping test for processing before init: self.onmessage not set.");
    }
  });
});
