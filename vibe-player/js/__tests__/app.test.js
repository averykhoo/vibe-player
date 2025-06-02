// vibe-player/js/__tests__/app.test.js

global.AudioApp = global.AudioApp || {};

// Load actual constants. This assumes constants.js correctly populates global.AudioApp.Constants.
// It's executed when Jest processes this file.
require('../constants');

// Mock document and window properties that app.js might use during initialization
global.document = global.document || {}; // Ensure document exists
global.document.addEventListener = jest.fn();
global.window = global.window || {}; // Ensure window exists
global.window.addEventListener = jest.fn();
global.requestAnimationFrame = jest.fn(); // Used by app.js
global.cancelAnimationFrame = jest.fn(); // Used by app.js


// Mock dependencies that app.js's init function will use.
// These need to be on global.AudioApp BEFORE app.js is required.
global.AudioApp.uiManager = {
  init: jest.fn(),
  resetUI: jest.fn(),
  // Add any other methods app.js init might call on uiManager
};

global.AudioApp.stateManager = {
  resetState: jest.fn(),
  // Add any other methods/properties
};

const mockVisualizerInstance = {
  clearVisuals: jest.fn(),
  resizeAndRedraw: jest.fn(),
  updateProgressIndicator: jest.fn(),
  computeAndDrawWaveform: jest.fn(),
  computeAndDrawSpectrogram: jest.fn(),
  redrawWaveformHighlight: jest.fn(),
};

global.AudioApp.waveformVisualizer = {
  createInstance: jest.fn().mockReturnValue(mockVisualizerInstance),
};

global.AudioApp.spectrogramVisualizer = {
  createInstance: jest.fn().mockReturnValue(mockVisualizerInstance),
};

global.AudioApp.vadAnalyzer = {
  analyze: jest.fn(),
  handleThresholdUpdate: jest.fn(),
};

global.AudioApp.sileroWrapper = {
  create: jest.fn(),
};

global.AudioApp.Utils = {
  debounce: jest.fn((fn) => fn), // Mock debounce to return the original function
};

// This is the module whose interaction with app.js we are testing.
global.AudioApp.audioEngine = {
  setAppConstants: jest.fn(),
  init: jest.fn(),
  cleanupTrack: jest.fn(),
  setupTrack: jest.fn(),
  getAudioContext: jest.fn().mockReturnValue({
    currentTime: 0,
    state: 'running',
    // AudioContext methods/properties used by app.js if any during init
  }),
};

// Now, require app.js. Its IIFE will execute and should use the mocks we've set up on global.AudioApp.
// The AudioApp object returned by this require will be the one from app.js's IIFE.
const AppMain = require('../app'); // Or simply `require('../app');` if it only modifies global.AudioApp

describe('AudioApp.init', () => {
  beforeEach(() => {
    // Clear all mock call histories before each test.
    jest.clearAllMocks();

    // AudioApp.init is a function, so we directly call it.
    // If AppMain was assigned, it would be AppMain.init().
    // If require('../app') just modified global.AudioApp, then it's global.AudioApp.init().
    // Given app.js: `AudioApp = (function() { ... return { init: init }; })();`
    // `require('../app')` should make `AudioApp.init` (the one from app.js) available.
    // If there's a conflict with `global.AudioApp` vs the returned `AudioApp` from require,
    // ensure the one with the `init` method is used.
    // For safety, let's assume `require('../app')` correctly populates/returns the main AudioApp object/namespace.
    // The tests will call `AudioApp.init()`.

    // Re-mock document/window addEventListener for each test if needed,
    // though clearAllMocks should handle jest.fn()
    global.document.addEventListener.mockClear();
    global.window.addEventListener.mockClear();
    global.requestAnimationFrame.mockClear();
    global.cancelAnimationFrame.mockClear();
  });

  test('should call AudioEngine.setAppConstants with Constants before calling AudioEngine.init', () => {
    // Ensure AudioApp.Constants is valid before calling init
    if (!global.AudioApp.Constants || Object.keys(global.AudioApp.Constants).length === 0) {
      // Fallback if constants.js didn't load as expected into global.AudioApp.Constants
      // This indicates a potential issue with how constants.js is structured or loaded in Jest.
      console.warn("Warning: global.AudioApp.Constants not populated before test. Using fallback mock for Constants.");
      global.AudioApp.Constants = {
        PROCESSOR_SCRIPT_URL: 'js/player/rubberbandProcessor.js',
        PROCESSOR_NAME: 'rubberband-processor',
        WASM_BINARY_URL: 'lib/rubberband.wasm',
        LOADER_SCRIPT_URL: 'lib/rubberband-loader.js',
        VAD_SAMPLE_RATE: 16000, // Example, add others if init() needs them
      };
    }

    AudioApp.init(); // This should be the init from app.js

    expect(global.AudioApp.audioEngine.setAppConstants).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.audioEngine.setAppConstants).toHaveBeenCalledWith(global.AudioApp.Constants);

    expect(global.AudioApp.audioEngine.init).toHaveBeenCalledTimes(1);

    const setAppConstantsOrder = global.AudioApp.audioEngine.setAppConstants.mock.invocationCallOrder[0];
    const initOrder = global.AudioApp.audioEngine.init.mock.invocationCallOrder[0];

    expect(setAppConstantsOrder).toBeLessThan(initOrder);
  });

  test('should call initialization methods on UI, State, and Visualizer modules', () => {
    AudioApp.init();

    expect(global.AudioApp.uiManager.init).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.uiManager.resetUI).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.stateManager.resetState).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.waveformVisualizer.createInstance).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.spectrogramVisualizer.createInstance).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.Utils.debounce).toHaveBeenCalled(); // Debounce is called
  });

  test('should setup event listeners', () => {
    AudioApp.init();
    // Check a few examples. Exact number might be fragile if app.js changes often.
    expect(global.document.addEventListener).toHaveBeenCalledWith('audioapp:fileSelected', expect.any(Function));
    expect(global.document.addEventListener).toHaveBeenCalledWith('audioapp:playPauseClicked', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

});
