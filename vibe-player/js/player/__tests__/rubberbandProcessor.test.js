/**
 * @jest-environment jsdom
 */

// Mock AudioWorkletProcessor base class
global.AudioWorkletProcessor = class {
  constructor(options) {
    this.port = {
      postMessage: jest.fn(),
      onmessage: null,
    };
    // Any other base class initialization needed by RubberbandProcessor
  }
};

// Mock global sampleRate and currentTime (available in AudioWorkletGlobalScope)
global.sampleRate = 44100;
global.currentTime = 0;   // This is a static value for tests, advance manually if needed for process()

// Mock WebAssembly
const mockWasmInstance = {
  exports: {
    _rubberband_new: jest.fn().mockReturnValue(12345), // Mock pointer
    _rubberband_delete: jest.fn(),
    _rubberband_set_time_ratio: jest.fn(),
    _rubberband_set_pitch_scale: jest.fn(),
    _rubberband_set_formant_scale: jest.fn(),
    _rubberband_process: jest.fn(),
    _rubberband_available: jest.fn().mockReturnValue(0),
    _rubberband_retrieve: jest.fn().mockReturnValue(0),
    _rubberband_get_samples_required: jest.fn().mockReturnValue(1024),
    _rubberband_reset: jest.fn(),
    _rubberband_get_latency: jest.fn().mockReturnValue(256),
    _malloc: jest.fn((size) => {
      // Simple mock: return an incrementing "pointer"
      mockWasmInstance.exports.__heap_base = (mockWasmInstance.exports.__heap_base || 100000) + size;
      return mockWasmInstance.exports.__heap_base - size;
    }),
    _free: jest.fn(),
    // Mock HEAPF32 and HEAPU32 as views on a shared buffer for advanced tests if needed
    // For many tests, direct interaction might not be required if _rubberband_process etc. are mocked.
    HEAPF32: { buffer: new ArrayBuffer(1024 * 1024), subarray: jest.fn().mockReturnThis(), set: jest.fn() }, // 1MB buffer
    HEAPU32: { buffer: new ArrayBuffer(1024 * 1024), subarray: jest.fn().mockReturnThis(), set: jest.fn() },
    memory: { buffer: new ArrayBuffer(1024 * 1024) }, // Mock memory for loader script
    RubberBandOptionFlag: { // From rubberband-loader.js example
        ProcessRealTime: 0x00000001,
        PitchHighQuality: 0x02000000,
        PhaseIndependent: 0x00002000,
        TransientsCrisp: 0x00000000, // Example, actual values may vary
    }
  },
};

global.WebAssembly = {
  instantiate: jest.fn().mockResolvedValue({ instance: mockWasmInstance, module: {} }),
  Memory: jest.fn().mockImplementation(() => ({ buffer: new ArrayBuffer(1024*1024) })), // Mock WebAssembly.Memory
};

const RubberbandProcessor = require('../rubberbandProcessor');

describe('RubberbandProcessor', () => {
  let processor;
  let mockProcessorOptions;

  // Mock console methods
  let mockConsoleLog, mockConsoleWarn, mockConsoleError;

  beforeAll(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockConsoleWarn.mockRestore();
    mockConsoleError.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Define mock loaderScriptText which should return a function that, when called,
    // returns the mockWasmInstance.exports.
    // This simulates the behavior of the actual rubberband-loader.js
    const mockLoaderScriptContent = `
      function Rubberband(moduleArg) {
        return new Promise((resolve, reject) => {
          // Simulate the loader's async nature and how it uses instantiateWasm
          if (moduleArg && typeof moduleArg.instantiateWasm === 'function') {
            moduleArg.instantiateWasm({}, (instance, module) => {
              if (instance) {
                resolve(instance.exports); // Resolve with the exports as the actual loader does
              } else {
                reject(new Error("Mocked WASM instantiation failed in loader"));
              }
            });
          } else {
            reject(new Error("Mocked loader did not receive instantiateWasm"));
          }
        });
      }
      // Ensure the function is returned if the script content is evaluated via new Function
      // For direct eval, this is not strictly needed but good for robustness.
      if(typeof moduleArg !== 'undefined') return Rubberband;
    `;


    mockProcessorOptions = {
      trackId: 1,
      sampleRate: 44100,
      numberOfChannels: 2,
      wasmBinary: new ArrayBuffer(10), // Mock content
      loaderScriptText: mockLoaderScriptContent,
    };
    // Ensure global sampleRate is set for constructor, as it might be accessed there
    global.sampleRate = mockProcessorOptions.sampleRate;
  });

  describe('constructor', () => {
    test('should initialize with valid options', () => {
      processor = new RubberbandProcessor({ processorOptions: mockProcessorOptions });
      expect(processor.trackId).toBe(1);
      expect(processor.sampleRate).toBe(44100);
      expect(processor.numberOfChannels).toBe(2);
      expect(processor.wasmBinary).toBeInstanceOf(ArrayBuffer);
      expect(processor.loaderScriptText).toBe(mockProcessorOptions.loaderScriptText);
      expect(processor.wasmReady).toBe(false);
      expect(processor.port.onmessage).toBeInstanceOf(Function);
    });

    test('should default trackId if not provided', () => {
      const opts = { ...mockProcessorOptions, trackId: undefined };
      processor = new RubberbandProcessor({ processorOptions: opts });
      expect(processor.trackId).toBe(-1); // Default value
    });

    test('should post error if wasmBinary is missing', () => {
        const opts = { ...mockProcessorOptions, wasmBinary: null };
        processor = new RubberbandProcessor({ processorOptions: opts });
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: 'WASM binary missing.'
        }));
    });

    test('should post error if loaderScriptText is missing', () => {
        const opts = { ...mockProcessorOptions, loaderScriptText: null };
        processor = new RubberbandProcessor({ processorOptions: opts });
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: 'Loader script text missing.'
        }));
    });

    test('should post error if sampleRate is invalid', () => {
        const opts = { ...mockProcessorOptions, sampleRate: 0 };
        processor = new RubberbandProcessor({ processorOptions: opts });
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: expect.stringContaining('Invalid SampleRate')
        }));
    });

    test('should post error if numberOfChannels is invalid', () => {
        const opts = { ...mockProcessorOptions, numberOfChannels: 0 };
        processor = new RubberbandProcessor({ processorOptions: opts });
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: expect.stringContaining('Invalid NumberOfChannels')
        }));
    });
  });

  describe('initializeWasmAndRubberband', () => {
    beforeEach(() => {
      processor = new RubberbandProcessor({ processorOptions: mockProcessorOptions });
    });

    test('should initialize WASM and Rubberband instance successfully', async () => {
      await processor.initializeWasmAndRubberband();
      expect(WebAssembly.instantiate).toHaveBeenCalledWith(processor.wasmBinary, expect.any(Object));
      expect(mockWasmInstance.exports._rubberband_new).toHaveBeenCalledWith(processor.sampleRate, processor.numberOfChannels, expect.any(Number), 1.0, 1.0);
      expect(mockWasmInstance.exports._malloc).toHaveBeenCalledTimes(1 + 1 + (processor.numberOfChannels * 2)); // inputPtrs, outputPtrs, and 2 per channel
      expect(processor.wasmReady).toBe(true);
      expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'status', message: 'processor-ready', trackId: processor.trackId });
    });

    test('should skip initialization if already ready', async () => {
      processor.wasmReady = true;
      await processor.initializeWasmAndRubberband();
      expect(WebAssembly.instantiate).not.toHaveBeenCalled();
    });

    test('should handle WASM instantiation failure', async () => {
        WebAssembly.instantiate.mockRejectedValueOnce(new Error("WASM fail"));
        // The loader script itself catches this and calls postError.
        // So we check for the postError message.
        await processor.initializeWasmAndRubberband();
        expect(processor.wasmReady).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: expect.stringContaining('WASM Hook Error: WASM fail')
        }));
    });

    test('should handle loader script evaluation error', async () => {
        processor.loaderScriptText = "throw new Error('Loader eval error');";
        await processor.initializeWasmAndRubberband();
        expect(processor.wasmReady).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: "Init Error: Loader script eval error: Loader eval error"
        }));
    });

    test('should handle _rubberband_new failure', async () => {
        mockWasmInstance.exports._rubberband_new.mockReturnValueOnce(0); // Simulate failure
        await processor.initializeWasmAndRubberband();
        expect(processor.wasmReady).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'error', message: expect.stringContaining("_rubberband_new failed")
        }));
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      processor = new RubberbandProcessor({ processorOptions: mockProcessorOptions });
      // Initialize WASM for message handling tests that require it
      await processor.initializeWasmAndRubberband();
      // Clear postMessage calls from initialization
      processor.port.postMessage.mockClear();
    });

    test('load-audio should set audio data and trigger WASM init if not ready', async () => {
        processor.wasmReady = false; // Force re-init path
        mockWasmInstance.exports._rubberband_new.mockClear(); // Clear previous init calls

        const channelData = [new Float32Array(100).buffer, new Float32Array(100).buffer];
        processor.handleMessage({ data: { type: 'load-audio', channelData } });

        // Allow async initializeWasmAndRubberband to complete
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(processor.originalChannels[0]).toBeInstanceOf(Float32Array);
        expect(processor.originalChannels[0].length).toBe(100);
        expect(processor.audioLoaded).toBe(true);
        expect(processor.sourceDurationSeconds).toBeCloseTo(100 / processor.sampleRate);
        expect(mockWasmInstance.exports._rubberband_new).toHaveBeenCalled(); // Check WASM init was triggered
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'status', message: 'processor-ready', trackId: processor.trackId });
    });

    test('load-audio with WASM already ready', () => {
        const channelData = [new Float32Array(100).buffer, new Float32Array(100).buffer];
        processor.handleMessage({ data: { type: 'load-audio', channelData } });
        expect(processor.audioLoaded).toBe(true);
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'status', message: 'processor-ready', trackId: processor.trackId });
    });

    test('play should set isPlaying and post state if ready', () => {
        processor.audioLoaded = true; // Assume audio is loaded
        processor.handleMessage({ data: { type: 'play' } });
        expect(processor.isPlaying).toBe(true);
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'playback-state', isPlaying: true, trackId: processor.trackId });
    });

    test('play should post error if WASM not ready', () => {
        processor.wasmReady = false;
        processor.audioLoaded = true;
        processor.handleMessage({ data: { type: 'play' } });
        expect(processor.isPlaying).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: 'error', message: 'Cannot play: WASM not ready.'}));
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'playback-state', isPlaying: false, trackId: processor.trackId });
    });

    test('pause should set isPlaying and post state', () => {
        processor.isPlaying = true;
        processor.handleMessage({ data: { type: 'pause' } });
        expect(processor.isPlaying).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'playback-state', isPlaying: false, trackId: processor.trackId });
    });

    test('set-speed, set-pitch, set-formant should update target values', () => {
        processor.handleMessage({ data: { type: 'set-speed', value: 1.5 } });
        expect(processor.currentTargetSpeed).toBe(1.5);
        processor.handleMessage({ data: { type: 'set-pitch', value: 1.2 } });
        expect(processor.currentTargetPitchScale).toBe(1.2);
        processor.handleMessage({ data: { type: 'set-formant', value: 0.8 } });
        expect(processor.currentTargetFormantScale).toBe(0.8);
    });

    test('seek should update position and flags, and post time-update', () => {
        processor.audioLoaded = true;
        processor.sourceDurationSeconds = 10;
        processor.handleMessage({ data: { type: 'seek', positionSeconds: 5.0 } });
        expect(processor.playbackPositionInSeconds).toBe(5.0);
        expect(processor.resetNeeded).toBe(true);
        expect(processor.streamEnded).toBe(false);
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'time-update', currentTime: 5.0, trackId: processor.trackId });
    });

    test('cleanup should call internal cleanup method', () => {
        jest.spyOn(processor, 'cleanup');
        processor.handleMessage({ data: { type: 'cleanup' } });
        expect(processor.cleanup).toHaveBeenCalled();
    });
  });

  describe('process (Simplified)', () => {
    beforeEach(async () => {
      processor = new RubberbandProcessor({ processorOptions: mockProcessorOptions });
      await processor.initializeWasmAndRubberband();
      // Load some dummy audio data
      const channelData = Array(mockProcessorOptions.numberOfChannels).fill(new Float32Array(2048).buffer);
      processor.handleMessage({ data: { type: 'load-audio', channelData } });
      processor.port.postMessage.mockClear(); // Clear init/load messages
    });

    test('should output silence if not playing', () => {
      processor.isPlaying = false;
      const outputs = [[new Float32Array(128), new Float32Array(128)]];
      processor.process([], outputs, {});
      expect(outputs[0][0].every(sample => sample === 0)).toBe(true);
      expect(outputs[0][1].every(sample => sample === 0)).toBe(true);
      expect(mockWasmInstance.exports._rubberband_process).not.toHaveBeenCalled();
    });

    test('should output silence if wasm not ready or audio not loaded', () => {
        processor.isPlaying = true;
        processor.wasmReady = false;
        const outputs = [[new Float32Array(128), new Float32Array(128)]];
        processor.process([], outputs, {});
        expect(outputs[0][0].every(sample => sample === 0)).toBe(true);
    });

    test('should call WASM functions and post time-update when playing', () => {
      processor.isPlaying = true;
      const outputs = [[new Float32Array(128), new Float32Array(128)]];
      mockWasmInstance.exports._rubberband_available.mockReturnValue(128);
      mockWasmInstance.exports._rubberband_retrieve.mockReturnValue(128);

      processor.process([], outputs, {});

      expect(mockWasmInstance.exports._rubberband_set_time_ratio).toHaveBeenCalled(); // Called during resetNeeded or if params changed
      expect(mockWasmInstance.exports._rubberband_process).toHaveBeenCalled();
      expect(mockWasmInstance.exports._rubberband_available).toHaveBeenCalled();
      expect(mockWasmInstance.exports._rubberband_retrieve).toHaveBeenCalled();
      expect(processor.port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'time-update' }));
    });

    test('should output silence and post Playback ended when stream ends', () => {
        processor.isPlaying = true;
        processor.finalBlockSent = true; // Simulate all input has been processed
        mockWasmInstance.exports._rubberband_available.mockReturnValue(0); // No more samples from Rubberband
        const outputs = [[new Float32Array(128), new Float32Array(128)]];

        processor.process([], outputs, {});

        expect(outputs[0][0].every(sample => sample === 0)).toBe(true);
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'status', message: 'Playback ended', trackId: processor.trackId });
        expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'playback-state', isPlaying: false, trackId: processor.trackId });
        expect(processor.isPlaying).toBe(false);
        expect(processor.streamEnded).toBe(true);
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      processor = new RubberbandProcessor({ processorOptions: mockProcessorOptions });
      await processor.initializeWasmAndRubberband(); // Ensure wasm is "initialized"
       // Simulate audio loaded to make cleanup more thorough
      processor.audioLoaded = true;
      processor.originalChannels = [new Float32Array(100), new Float32Array(100)];
    });

    test('should call _rubberband_delete and _free, reset state, and post status', () => {
      processor.cleanup();
      expect(mockWasmInstance.exports._rubberband_delete).toHaveBeenCalledWith(processor.rubberbandStretcher);
      // Check if _free was called for allocated buffers (inputPtrs, outputPtrs, and each channel buffer)
      expect(mockWasmInstance.exports._free).toHaveBeenCalledTimes(1 + 1 + (mockProcessorOptions.numberOfChannels * 2));

      expect(processor.wasmReady).toBe(false);
      expect(processor.audioLoaded).toBe(false);
      expect(processor.originalChannels).toBeNull();
      expect(processor.rubberbandStretcher).toBe(0);
      expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'status', message: 'Processor cleaned up', trackId: processor.trackId });
    });
  });
});
