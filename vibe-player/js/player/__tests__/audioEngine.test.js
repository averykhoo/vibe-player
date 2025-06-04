/**
 * @jest-environment jsdom
 */
// Mock global objects and functions before importing the module
// Crucially, these need to be on `window` because that's how audioEngine.js accesses them.
window.AudioContext = jest.fn();
window.webkitAudioContext = jest.fn(); // Fallback for AudioContext
window.AudioWorkletNode = jest.fn();
window.StereoPannerNode = jest.fn();
window.GainNode = jest.fn();
window.CustomEvent = jest.fn().mockImplementation((type, eventInitDict) => {
    return { type, detail: eventInitDict ? eventInitDict.detail : {} };
});
global.fetch = jest.fn(); // fetch is global, not typically on window by default in Node for mocking
window.OfflineAudioContext = jest.fn();
window.File = jest.fn().mockImplementation((bits, name, options) => ({
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(bits && bits[0] ? bits[0].length : 0)),
    name: name,
    type: options ? options.type : '',
  }));

// Mock document.dispatchEvent
document.dispatchEvent = jest.fn(); // document is global in Jest's JSDOM env

// Ensure AudioApp namespace exists if the module tries to assign to AudioApp.audioEngine
if (!global.AudioApp) { // Keep this as global for the AudioApp namespace itself
  global.AudioApp = {};
}


let audioEngine;
const mockAppConstants = {
    WASM_BINARY_URL: 'mock-wasm-url.wasm',
    LOADER_SCRIPT_URL: 'mock-loader-url.js',
    PROCESSOR_SCRIPT_URL: 'mock-processor-url.js',
    PROCESSOR_NAME: 'mock-rubberband-processor',
    VAD_SAMPLE_RATE: 16000,
};

describe('AudioApp.audioEngine', () => {
  let mockAudioContextInstance;
  let mockMasterGainNode;
  let mockPannerNodeInstance;
  let mockVolumeGainNodeInstance;
  let mockMuteGainNodeInstance;
  let mockWorkletNodeInstance;

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
    jest.resetModules();

    // Require the module first
    audioEngine = require('../audioEngine');
    // THEN inject constants
    audioEngine.setAppConstants(mockAppConstants);

    // Reset all individual mock functions' call history etc.
    window.AudioContext.mockClear();
    window.webkitAudioContext.mockClear();
    window.AudioWorkletNode.mockClear();
    window.StereoPannerNode.mockClear();
    window.GainNode.mockClear();
    window.CustomEvent.mockClear();
    global.fetch.mockClear(); // fetch is global
    window.OfflineAudioContext.mockClear();
    window.File.mockClear();
    document.dispatchEvent.mockClear();


    mockMasterGainNode = {
      gain: { value: 1.0, setTargetAtTime: jest.fn(), cancelScheduledValues: jest.fn() },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    mockPannerNodeInstance = { pan: { value: 0, setValueAtTime: jest.fn() }, connect: jest.fn(), disconnect: jest.fn() };
    mockVolumeGainNodeInstance = { gain: { value: 1.0, setTargetAtTime: jest.fn() }, connect: jest.fn(), disconnect: jest.fn() };
    mockMuteGainNodeInstance = { gain: { value: 1.0, setTargetAtTime: jest.fn() }, connect: jest.fn(), disconnect: jest.fn() };

    mockAudioContextInstance = {
      state: 'running',
      sampleRate: 44100,
      currentTime: 0,
      createGain: jest.fn(),
      createStereoPanner: jest.fn().mockReturnValue(mockPannerNodeInstance),
      createBufferSource: jest.fn().mockReturnValue({ connect: jest.fn(), start: jest.fn(), buffer: null }),
      decodeAudioData: jest.fn(),
      audioWorklet: {
        addModule: jest.fn().mockResolvedValue(undefined),
      },
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      destination: {},
    };
    window.AudioContext.mockImplementation(() => mockAudioContextInstance);
    window.webkitAudioContext.mockImplementation(() => mockAudioContextInstance);

    mockAudioContextInstance.createGain
        .mockReturnValueOnce(mockMasterGainNode)
        .mockReturnValueOnce(mockVolumeGainNodeInstance)
        .mockReturnValueOnce(mockMuteGainNodeInstance);


    mockWorkletNodeInstance = {
      port: {
        postMessage: jest.fn(),
        onmessage: null,
      },
      onprocessorerror: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    window.AudioWorkletNode.mockImplementation(() => mockWorkletNodeInstance);

    global.fetch.mockImplementation((url) => {
      if (url === mockAppConstants.WASM_BINARY_URL) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        });
      }
      if (url === mockAppConstants.LOADER_SCRIPT_URL) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('mock loader script text'),
        });
      }
      return Promise.reject(new Error(`Unhandled fetch URL: ${url}`));
    });

    window.OfflineAudioContext.mockImplementation((channels, length, sampleRate) => {
        return {
            createBufferSource: jest.fn().mockReturnValue({
                buffer: null,
                connect: jest.fn(),
                start: jest.fn(),
            }),
            startRendering: jest.fn().mockResolvedValue({
                getChannelData: jest.fn().mockReturnValue(new Float32Array(length)),
            }),
            destination: {},
        };
    });

    window.File = jest.fn().mockImplementation((bits, name, options) => ({
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(bits && bits[0] ? bits[0].length : 0)),
        name: name,
        type: options ? options.type : '',
    }));
  });

  // === Tests Start Here ===

  describe('Initialization (init, preFetchWorkletResources, addWorkletModule)', () => {
    test('init() should setup AudioContext and start fetching resources', async () => {
      await audioEngine.init();
      const audioContextCalled = window.AudioContext.mock.calls.length > 0 || window.webkitAudioContext.mock.calls.length > 0;
      expect(audioContextCalled).toBe(true);
      expect(mockAudioContextInstance.createGain).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(mockAppConstants.WASM_BINARY_URL);
      expect(global.fetch).toHaveBeenCalledWith(mockAppConstants.LOADER_SCRIPT_URL);
    });

    test('preFetchWorkletResources success', async () => {
      await audioEngine.init();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('preFetchWorkletResources fetch failure for WASM', async () => {
      global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' }));
      await audioEngine.init();
      await new Promise(resolve => setTimeout(resolve, 0)); // allow promises to settle
      expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'audioapp:engineError',
        detail: expect.objectContaining({ type: 'resource', error: expect.any(Error) })
      }));
    });

    test('preFetchWorkletResources fetch failure for Loader Script', async () => {
      global.fetch
        .mockImplementationOnce(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })) // WASM OK
        .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' })); // Loader Fail
      await audioEngine.init();
      await new Promise(resolve => setTimeout(resolve, 0)); // allow promises to settle
      expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'audioapp:engineError',
        detail: expect.objectContaining({ type: 'resource', error: expect.any(Error) })
      }));
    });

    test('addWorkletModule success (after init and resources)', async () => {
        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));

        mockAudioContextInstance.decodeAudioData.mockResolvedValue({
            duration: 1, sampleRate: 44100, numberOfChannels: 1,
            getChannelData: jest.fn().mockReturnValue(new Float32Array(44100))
        });
        const mockFile = new File(["content"], "track.mp3", { type: "audio/mpeg" });

        await expect(audioEngine.setupTrack(0, mockFile)).resolves.toBeUndefined();
        expect(mockAudioContextInstance.audioWorklet.addModule).toHaveBeenCalledWith(mockAppConstants.PROCESSOR_SCRIPT_URL);
    });

    test('addWorkletModule when context is suspended', async () => {
        mockAudioContextInstance.state = 'suspended';
        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));

        const mockFile = new File(["content"], "track.mp3", { type: "audio/mpeg" });
        mockAudioContextInstance.resume.mockImplementation(async () => {
            mockAudioContextInstance.state = 'running';
        });
        mockAudioContextInstance.decodeAudioData.mockResolvedValue({
            duration: 1, sampleRate: 44100, numberOfChannels: 1,
            getChannelData: jest.fn().mockReturnValue(new Float32Array(44100))
        });

        await audioEngine.setupTrack(0, mockFile);
        expect(mockAudioContextInstance.resume).toHaveBeenCalled();
        expect(mockAudioContextInstance.audioWorklet.addModule).toHaveBeenCalled();
    });

    test('addWorkletModule when resources are not ready', async () => {
        global.fetch.mockImplementation(() => Promise.reject(new Error("Simulated network error")));
        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));

        const mockFile = new File(["content"], "track.mp3", { type: "audio/mpeg" });
        await expect(audioEngine.setupTrack(0, mockFile)).rejects.toThrow(expect.stringContaining('Failed to load WASM resources needed for track setup: Simulated network error'));
        expect(mockAudioContextInstance.audioWorklet.addModule).not.toHaveBeenCalled();
    });
  });

  describe('setupTrack', () => {
    const mockFile = new File(["content"], "track.mp3", { type: "audio/mpeg" });
    const mockDecodedBuffer = {
        duration: 1.0, sampleRate: 44100, numberOfChannels: 1,
        getChannelData: jest.fn(() => new Float32Array(44100))
    };

    beforeEach(async () => {
        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));
        mockAudioContextInstance.decodeAudioData.mockResolvedValue(mockDecodedBuffer);
    });

    test('success path', async () => {
      await audioEngine.setupTrack(0, mockFile);

      expect(mockAudioContextInstance.decodeAudioData).toHaveBeenCalled();
      expect(window.AudioWorkletNode).toHaveBeenCalledWith( // Check window.AudioWorkletNode
        mockAudioContextInstance,
        mockAppConstants.PROCESSOR_NAME,
        expect.objectContaining({
          processorOptions: expect.objectContaining({
            trackId: 0,
            sampleRate: mockAudioContextInstance.sampleRate,
            wasmBinary: expect.any(ArrayBuffer),
            loaderScriptText: 'mock loader script text',
          })
        })
      );
      expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'load-audio', channelData: [expect.any(ArrayBuffer)] }),
        [expect.any(ArrayBuffer)]
      );
      expect(mockWorkletNodeInstance.connect).toHaveBeenCalledWith(mockPannerNodeInstance);
      expect(mockPannerNodeInstance.connect).toHaveBeenCalledWith(mockVolumeGainNodeInstance);
      expect(mockVolumeGainNodeInstance.connect).toHaveBeenCalledWith(mockMuteGainNodeInstance);
      expect(mockMuteGainNodeInstance.connect).toHaveBeenCalledWith(mockMasterGainNode);
      expect(mockWorkletNodeInstance.port.onmessage).toBeInstanceOf(Function);
      expect(mockWorkletNodeInstance.onprocessorerror).toBeInstanceOf(Function);
    });

    test('resource fetch error during setupTrack (if init failed silently)', async () => {
        jest.resetModules();
        audioEngine = require('../audioEngine');
        global.fetch.mockImplementation(() => Promise.reject(new Error("Network error post-init")));
        audioEngine.setAppConstants(mockAppConstants);

        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));

        await expect(audioEngine.setupTrack(0, mockFile)).rejects.toThrow(expect.stringContaining('Failed to load WASM resources needed for track setup: Network error post-init'));
    });

    test('decoding error', async () => {
        mockAudioContextInstance.decodeAudioData.mockRejectedValue(new Error('Decoding failed'));
        await expect(audioEngine.setupTrack(0, mockFile)).rejects.toThrow('Decoding failed');
        expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'audioapp:decodingError',
            detail: expect.objectContaining({ trackId: 0, error: expect.any(Error) })
        }));
        expect(window.AudioWorkletNode).not.toHaveBeenCalled();
    });

    test('node setup error (e.g., AudioWorkletNode constructor throws)', async () => {
        window.AudioWorkletNode.mockImplementationOnce(() => { throw new Error('Worklet constructor failed'); });
        await expect(audioEngine.setupTrack(0, mockFile)).rejects.toThrow('Worklet constructor failed');
        expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'audioapp:engineError',
            detail: expect.objectContaining({ type: 'nodeSetup', trackId: 0, error: expect.any(Error) })
        }));
        expect(mockWorkletNodeInstance.connect).not.toHaveBeenCalled();
    });

    test('worklet module add error during setupTrack', async () => {
        jest.resetModules();
        audioEngine = require('../audioEngine');
        audioEngine.setAppConstants(mockAppConstants);

        window.AudioContext.mockImplementation(() => mockAudioContextInstance);
        window.webkitAudioContext.mockImplementation(() => mockAudioContextInstance);
        window.AudioWorkletNode.mockImplementation(() => mockWorkletNodeInstance);

        global.fetch.mockImplementation((url) => {
            if (url === mockAppConstants.WASM_BINARY_URL) return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
            if (url === mockAppConstants.LOADER_SCRIPT_URL) return Promise.resolve({ ok: true, text: () => Promise.resolve('mock loader script text') });
            return Promise.reject(new Error(`Unhandled fetch URL: ${url}`));
        });

        await audioEngine.init();
        await new Promise(resolve => setTimeout(resolve, 0));

        mockAudioContextInstance.audioWorklet.addModule.mockRejectedValueOnce(new Error("Module add failed"));
        mockAudioContextInstance.decodeAudioData.mockResolvedValue(mockDecodedBuffer);

        mockAudioContextInstance.createGain.mockReset()
            .mockReturnValueOnce(mockMasterGainNode) // For potential setupAudioContext in setupTrack
            .mockReturnValueOnce(mockVolumeGainNodeInstance)
            .mockReturnValueOnce(mockMuteGainNodeInstance);

        await expect(audioEngine.setupTrack(0, mockFile)).rejects.toThrow('Failed to add AudioWorklet module');
        expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'audioapp:engineError',
            detail: expect.objectContaining({ type: 'workletLoad', error: expect.any(Error) })
        }));
    });
  });

  describe('setupWorkletMessageHandler', () => {
    const trackIndex = 0;
    let handler;

    beforeEach(async () => {
      await audioEngine.init();
      await new Promise(resolve => setTimeout(resolve, 0));
      mockAudioContextInstance.decodeAudioData.mockResolvedValue({
          duration: 1, sampleRate: 44100, numberOfChannels: 1,
          getChannelData: jest.fn(() => new Float32Array(44100))
      });
      await audioEngine.setupTrack(trackIndex, new File(["content"], "track.mp3"));
      handler = mockWorkletNodeInstance.port.onmessage;
    });
    test('handles "processor-ready" status message', () => { handler({ data: { type: 'status', message: 'processor-ready', trackId: trackIndex } }); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:workletReady', detail: { trackId: trackIndex } })); });
    test('handles "Playback ended" status message', () => { handler({ data: { type: 'status', message: 'Playback ended', trackId: trackIndex } }); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:playbackEnded', detail: { trackId: trackIndex } })); });
    test('handles "error" message', () => { handler({ data: { type: 'error', message: 'Worklet runtime error', trackId: trackIndex } }); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:engineError', detail: expect.objectContaining({ type: 'workletRuntime', error: expect.any(Error), trackId: trackIndex }) })); });
    test('handles "playback-state" message', () => { handler({ data: { type: 'playback-state', isPlaying: true, trackId: trackIndex } }); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:playbackStateChanged', detail: { isPlaying: true, trackId: trackIndex } })); });
    test('handles "time-update" message', () => { handler({ data: { type: 'time-update', currentTime: 1.23, trackId: trackIndex } }); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:timeUpdated', detail: { currentTime: 1.23, trackId: trackIndex } })); });
    test('handles onprocessorerror', () => { mockWorkletNodeInstance.onprocessorerror({ event: 'mock error event' });  expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'audioapp:engineError', detail: expect.objectContaining({ type: 'workletProcessor', error: expect.any(Error), trackId: trackIndex }) })); });
  });

  describe('resampleTo16kMono / convertAudioBufferTo16kHzMonoFloat32', () => {
    const mockBuffer = { duration: 1.0, sampleRate: 44100, numberOfChannels: 2 };
    test('success path', async () => { const result = await audioEngine.resampleTo16kMono(mockBuffer); expect(window.OfflineAudioContext).toHaveBeenCalledWith(1, mockAppConstants.VAD_SAMPLE_RATE * mockBuffer.duration, mockAppConstants.VAD_SAMPLE_RATE); expect(result).toBeInstanceOf(Float32Array); expect(result.length).toBe(mockAppConstants.VAD_SAMPLE_RATE * mockBuffer.duration); });
    test('OfflineAudioContext creation failure', async () => { window.OfflineAudioContext.mockImplementationOnce(() => { throw new Error("OAC failed"); }); await expect(audioEngine.resampleTo16kMono(mockBuffer)).rejects.toThrow("OfflineAudioContext creation failed for resampling: OAC failed"); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'audioapp:resamplingError', detail: expect.objectContaining({error: expect.any(Error)})})); });
    test('OfflineAudioContext rendering failure', async () => { window.OfflineAudioContext.mockImplementationOnce(() => ({ createBufferSource: jest.fn().mockReturnValue({ buffer: null, connect: jest.fn(), start: jest.fn() }), startRendering: jest.fn().mockRejectedValue(new Error("Rendering problem")), destination: {}, })); await expect(audioEngine.resampleTo16kMono(mockBuffer)).rejects.toThrow("Audio resampling failed during OfflineAudioContext rendering: Rendering problem"); expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'audioapp:resamplingError', detail: expect.objectContaining({error: expect.any(Error)})})); });
    test('handles zero-duration buffer', async () => { const zeroDurationBuffer = { ...mockBuffer, duration: 0 }; const result = await audioEngine.resampleTo16kMono(zeroDurationBuffer); expect(result).toBeInstanceOf(Float32Array); expect(result.length).toBe(0); expect(window.OfflineAudioContext).not.toHaveBeenCalled();  });
  });

  describe('Playback Control Methods', () => {
    const trackIndex = 0;
    beforeEach(async () => { await audioEngine.init(); await new Promise(resolve => setTimeout(resolve, 0)); mockAudioContextInstance.decodeAudioData.mockResolvedValue({ duration: 1, sampleRate: 44100, numberOfChannels: 1, getChannelData: jest.fn(() => new Float32Array(44100)) }); await audioEngine.setupTrack(trackIndex, new File(["content"], "track.mp3")); });
    test('playTrack', () => { audioEngine.playTrack(trackIndex); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'play' }); });
    test('pauseTrack', () => { audioEngine.pauseTrack(trackIndex); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'pause' }); });
    test('seekTrack', () => { audioEngine.seekTrack(trackIndex, 5.5); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'seek', positionSeconds: 5.5 }); audioEngine.seekTrack(trackIndex, -1); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'seek', positionSeconds: 0 }); });
    test('setTrackSpeed', () => { audioEngine.setTrackSpeed(trackIndex, 1.5); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-speed', value: 1.5 }); audioEngine.setTrackSpeed(trackIndex, 0.1); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-speed', value: 0.25 }); audioEngine.setTrackSpeed(trackIndex, 3.0); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-speed', value: 2.0 }); });
    test('setTrackPitch', () => { audioEngine.setTrackPitch(trackIndex, 1.2); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-pitch', value: 1.2 }); audioEngine.setTrackPitch(trackIndex, 0.1); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-pitch', value: 0.25 }); audioEngine.setTrackPitch(trackIndex, 3.0); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-pitch', value: 2.0 }); });
    test('setTrackFormant', () => { audioEngine.setTrackFormant(trackIndex, 1.1); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-formant', value: 1.1 }); audioEngine.setTrackFormant(trackIndex, 0.2); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-formant', value: 0.5 }); audioEngine.setTrackFormant(trackIndex, 3.0); expect(mockWorkletNodeInstance.port.postMessage).toHaveBeenCalledWith({ type: 'set-formant', value: 2.0 }); });
    test('setPan', () => { audioEngine.setPan(trackIndex, 0.5); expect(mockPannerNodeInstance.pan.setValueAtTime).toHaveBeenCalledWith(0.5, mockAudioContextInstance.currentTime); audioEngine.setPan(trackIndex, -1.5); expect(mockPannerNodeInstance.pan.setValueAtTime).toHaveBeenCalledWith(-1, mockAudioContextInstance.currentTime); audioEngine.setPan(trackIndex, 1.5); expect(mockPannerNodeInstance.pan.setValueAtTime).toHaveBeenCalledWith(1, mockAudioContextInstance.currentTime); });
    test('setVolume', () => { audioEngine.setVolume(trackIndex, 0.7); expect(mockVolumeGainNodeInstance.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, mockAudioContextInstance.currentTime, 0.015); audioEngine.setVolume(trackIndex, -0.5); expect(mockVolumeGainNodeInstance.gain.setTargetAtTime).toHaveBeenCalledWith(0.0, mockAudioContextInstance.currentTime, 0.015); });
    test('setMute', () => { audioEngine.setMute(trackIndex, true); expect(mockMuteGainNodeInstance.gain.setTargetAtTime).toHaveBeenCalledWith(1e-7, mockAudioContextInstance.currentTime, 0.010); audioEngine.setMute(trackIndex, false); expect(mockMuteGainNodeInstance.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, mockAudioContextInstance.currentTime, 0.010); });
  });

  describe('setGain (Master Gain)', () => {
    beforeEach(async () => { await audioEngine.init(); });
    test('sets master gain correctly', () => { audioEngine.setGain(0.5); expect(mockMasterGainNode.gain.cancelScheduledValues).toHaveBeenCalledWith(mockAudioContextInstance.currentTime); expect(mockMasterGainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, mockAudioContextInstance.currentTime, 0.015); });
    test('clamps master gain (min and max)', () => { audioEngine.setGain(-0.5); expect(mockMasterGainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1e-7, mockAudioContextInstance.currentTime, 0.015); audioEngine.setGain(3.0); expect(mockMasterGainNode.gain.setTargetAtTime).toHaveBeenCalledWith(2.0, mockAudioContextInstance.currentTime, 0.015); });
    test('handles NaN input for master gain', () => { audioEngine.setGain(NaN); expect(mockMasterGainNode.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, mockAudioContextInstance.currentTime, 0.015); });
  });

  describe('resumeContextIfNeeded', () => {
    beforeEach(async () => { await audioEngine.init(); });
    test('resumes suspended context and attempts to add module', async () => { mockAudioContextInstance.state = 'suspended'; mockAudioContextInstance.audioWorklet.addModule.mockClear(); mockAudioContextInstance.resume.mockImplementationOnce(async () => { mockAudioContextInstance.state = 'running'; }); await audioEngine.resumeContextIfNeeded(); expect(mockAudioContextInstance.resume).toHaveBeenCalled(); expect(mockAudioContextInstance.audioWorklet.addModule).toHaveBeenCalled(); });
    test('does nothing if context is running', async () => { mockAudioContextInstance.state = 'running'; await audioEngine.resumeContextIfNeeded(); expect(mockAudioContextInstance.resume).not.toHaveBeenCalled(); });
    test('handles resume failure', async () => {
        mockAudioContextInstance.state = 'suspended';
        mockAudioContextInstance.resume.mockRejectedValueOnce(new Error("Resume failed by user"));
        await expect(audioEngine.resumeContextIfNeeded()).rejects.toThrow("Resume failed by user");
        expect(document.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: 'audioapp:engineError',
            detail: expect.objectContaining({ type: 'contextResume', error: expect.any(Error) })
        }));
    });
  });

  describe('Cleanup Methods', () => {
    const trackIndex0 = 0; const trackIndex1 = 1;
    let track0Worklet, track1Worklet;
    beforeEach(async () => {
      await audioEngine.init(); await new Promise(resolve => setTimeout(resolve, 0));
      mockAudioContextInstance.decodeAudioData.mockResolvedValue({ duration: 1, sampleRate: 44100, numberOfChannels: 1, getChannelData: jest.fn(() => new Float32Array(44100)) });

      // Mock createGain to provide distinct gain nodes for two tracks
      // init() already consumed one for masterGain.
      // This beforeEach for 'Cleanup Methods' will call setupTrack twice.
      mockAudioContextInstance.createGain.mockReset()
        .mockReturnValueOnce(mockVolumeGainNodeInstance)       // Track 0 Volume
        .mockReturnValueOnce(mockMuteGainNodeInstance)        // Track 0 Mute
        .mockReturnValueOnce({...mockVolumeGainNodeInstance}) // Track 1 Volume (fresh mock)
        .mockReturnValueOnce({...mockMuteGainNodeInstance});  // Track 1 Mute (fresh mock)

      // Ensure AudioWorkletNode mock returns distinct instances for each track
      track0Worklet = { port: { postMessage: jest.fn(), onmessage: null }, onprocessorerror: null, connect: jest.fn(), disconnect: jest.fn() };
      track1Worklet = { port: { postMessage: jest.fn(), onmessage: null }, onprocessorerror: null, connect: jest.fn(), disconnect: jest.fn() };
      window.AudioWorkletNode.mockImplementationOnce(() => track0Worklet).mockImplementationOnce(() => track1Worklet);

      // Ensure createStereoPanner also returns distinct instances if needed for these tests
      // The main beforeEach already provides one for mockPannerNodeInstance.
      // For a second track, we might need another distinct one if its state is checked.
      const mockPannerNodeInstance1 = { pan: { value: 0, setValueAtTime: jest.fn() }, connect: jest.fn(), disconnect: jest.fn() };
      mockAudioContextInstance.createStereoPanner
          .mockReturnValueOnce(mockPannerNodeInstance)   // For track 0
          .mockReturnValueOnce(mockPannerNodeInstance1); // For track 1


      await audioEngine.setupTrack(trackIndex0, new File(["content"], "track0.mp3"));
      await audioEngine.setupTrack(trackIndex1, new File(["content"], "track1.mp3"));
    });
    test('cleanupTrack dispatches cleanup to worklet and disconnects nodes', async () => { await audioEngine.cleanupTrack(trackIndex0); expect(track0Worklet.port.postMessage).toHaveBeenCalledWith({ type: 'cleanup' }); expect(track0Worklet.disconnect).toHaveBeenCalled(); });
    test('cleanupAllTracks calls cleanupTrack for all tracks', async () => { await audioEngine.cleanupAllTracks(); expect(track0Worklet.port.postMessage).toHaveBeenCalledWith({ type: 'cleanup' }); expect(track0Worklet.disconnect).toHaveBeenCalled(); expect(track1Worklet.port.postMessage).toHaveBeenCalledWith({ type: 'cleanup' }); expect(track1Worklet.disconnect).toHaveBeenCalled(); });
    test('cleanup calls cleanupAllTracks and closes AudioContext', async () => {
        await audioEngine.cleanup();
        expect(mockAudioContextInstance.close).toHaveBeenCalled();
        global.fetch.mockClear();
        // Re-inject constants as cleanup might nullify internal APP_CONSTANTS or a new init would need them
        audioEngine.setAppConstants(mockAppConstants);
        await audioEngine.init();
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
