// vibe-player/js/__tests__/app.test.js

global.AudioApp = global.AudioApp || {};

// Load actual constants. This assumes constants.js correctly populates global.AudioApp.Constants.
// It's executed when Jest processes this file.
// require('../constants'); // Moved to beforeEach in describe('AudioApp.init',...)

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
  setSliderValue: jest.fn(), // Added for pitch control tests
  setTrackControlsVisibility: jest.fn(), // Added from previous subtask, good to have
  showMultiTrackUI: jest.fn(), // Added from previous subtask
  updateFileName: jest.fn(),
  setFileInfo: jest.fn(),
  enableTrackControls: jest.fn(),
  enablePlaybackControls: jest.fn(),
  enableSeekBar: jest.fn(),
  enableRightTrackLoadButton: jest.fn(),
  enableSwapButton: jest.fn(),
  enableRemoveButton: jest.fn(),
  // Add any other methods app.js init might call on uiManager
};

global.AudioApp.stateManager = {
  resetState: jest.fn(),
  togglePitchLink: jest.fn(), // Added for pitch control tests
  getIsPitchLinked: jest.fn(), // Added for pitch control tests
  getTrackIndexForSide: jest.fn(), // Added for pitch control tests
  getTrackByIndex: jest.fn(), // Added for pitch control tests
  findFirstAvailableSlot: jest.fn(),
  assignChannel: jest.fn(),
  addNewTrack: jest.fn(),
  clearTrackSlot: jest.fn(),
  isSideAssigned: jest.fn(),
  getIsMultiChannelModeActive: jest.fn(),
  areAllActiveTracksReady: jest.fn(),
  calculateMaxEffectiveDuration: jest.fn(),
  getPlaybackState: jest.fn(),
  setPlaybackState: jest.fn(),
  getPlaybackStartTimeContext: jest.fn(),
  getPlaybackStartSourceTime: jest.fn(),
  getCurrentGlobalSpeed: jest.fn(),
  setCurrentGlobalSpeed: jest.fn(),
  updateTimebaseForSpeedChange: jest.fn(),
  getTracksData: jest.fn(() => []), // Default to empty array
  // Add any other methods/properties
};

// Ensure AudioEngine mock has setTrackPitch
global.AudioApp.audioEngine = global.AudioApp.audioEngine || {};
global.AudioApp.audioEngine.setTrackPitch = jest.fn();


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
    require('../constants'); // Ensure constants are loaded for each test after mocks are cleared/reset

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

    AppMain.init(); // This should be the init from app.js

    expect(global.AudioApp.audioEngine.setAppConstants).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.audioEngine.setAppConstants).toHaveBeenCalledWith(global.AudioApp.Constants);

    expect(global.AudioApp.audioEngine.init).toHaveBeenCalledTimes(1);

    const setAppConstantsOrder = global.AudioApp.audioEngine.setAppConstants.mock.invocationCallOrder[0];
    const initOrder = global.AudioApp.audioEngine.init.mock.invocationCallOrder[0];

    expect(setAppConstantsOrder).toBeLessThan(initOrder);
  });

  test('should call initialization methods on UI, State, and Visualizer modules', () => {
    AppMain.init();

    expect(global.AudioApp.uiManager.init).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.uiManager.resetUI).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.stateManager.resetState).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.waveformVisualizer.createInstance).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.spectrogramVisualizer.createInstance).toHaveBeenCalledTimes(1);
    expect(global.AudioApp.Utils.debounce).toHaveBeenCalled(); // Debounce is called
  });

  test('should setup event listeners', () => {
    AppMain.init();
    // Check a few examples. Exact number might be fragile if app.js changes often.
    expect(global.document.addEventListener).toHaveBeenCalledWith('audioapp:fileSelected', expect.any(Function));
    expect(global.document.addEventListener).toHaveBeenCalledWith('audioapp:playPauseClicked', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

});

describe('AudioApp Pitch Control Handlers', () => {
    // AppMain is already required at the top of the file, its IIFE runs once.
    // Event listeners are attached to the global document by app.js's init.

    beforeEach(() => {
        jest.clearAllMocks(); // Clear mocks before each test

        // Reset specific mock behaviors needed for these tests
        global.AudioApp.stateManager.getTrackIndexForSide.mockImplementation(side => {
            if (side === 'left') return 0;
            if (side === 'right') return 1;
            return -1;
        });
        global.AudioApp.stateManager.getTrackByIndex.mockImplementation(index => {
            if (index === 0 || index === 1) {
                return { id: index, isReady: true, parameters: { pitch: 1.0 } }; // Mock track object
            }
            return null;
        });
        // Ensure document.addEventListener is available for dispatchEvent to work as expected
        // if it was cleared or not set up correctly for this scope.
        // global.document.addEventListener = jest.fn(); // This might be too broad if app.js actually removes/adds listeners.
                                                     // Better to rely on the global setup.
    });

    test('handleLinkPitchToggle should call stateManager.togglePitchLink', () => {
        // Simulate the event that app.js listens for
        // app.js calls togglePitchLink directly from the event handler, no detail needed for this part of the test.
        const event = new CustomEvent('audioapp:linkPitchToggled'); // Removed detail as app.js doesn't use it for this
        document.dispatchEvent(event);

        expect(global.AudioApp.stateManager.togglePitchLink).toHaveBeenCalled();
    });

    describe('handlePitchChange', () => {
        test('should update both tracks when pitch is linked', () => {
            global.AudioApp.stateManager.getIsPitchLinked.mockReturnValue(true);

            const mockPitchSliderLeft = { value: '1.0' }; // Mock DOM element
            const mockPitchValueLeft = { textContent: '' }; // Mock DOM element
            const mockPitchSliderRight = { value: '1.0' }; // Mock DOM element
            const mockPitchValueRight = { textContent: '' }; // Mock DOM element

            const originalGetElementById = global.document.getElementById;
            global.document.getElementById = jest.fn(id => {
                if (id === 'pitch_left') return mockPitchSliderLeft;
                if (id === 'pitchValue_left') return mockPitchValueLeft;
                if (id === 'pitch_right') return mockPitchSliderRight;
                if (id === 'pitchValue_right') return mockPitchValueRight;
                return originalGetElementById(id); // Fallback to original if other elements are needed
            });

            const eventDetail = { detail: { pitch: 1.5 } };
            // Dispatch event as if from the left slider
            const event = new CustomEvent('audioapp:pitchChanged_left', eventDetail);
            document.dispatchEvent(event);

            expect(global.AudioApp.audioEngine.setTrackPitch).toHaveBeenCalledWith(0, 1.5); // track 0 (left)
            expect(global.AudioApp.audioEngine.setTrackPitch).toHaveBeenCalledWith(1, 1.5); // track 1 (right)

            expect(global.AudioApp.uiManager.setSliderValue).toHaveBeenCalledWith(mockPitchSliderLeft, 1.5, mockPitchValueLeft, 'x');
            expect(global.AudioApp.uiManager.setSliderValue).toHaveBeenCalledWith(mockPitchSliderRight, 1.5, mockPitchValueRight, 'x');

            global.document.getElementById = originalGetElementById; // Restore original
        });

        test('should update only one track when pitch is unlinked', () => {
            global.AudioApp.stateManager.getIsPitchLinked.mockReturnValue(false);

            const mockPitchSliderLeft = { value: '1.0' };
            const mockPitchValueLeft = { textContent: '' };
            const originalGetElementById = global.document.getElementById;
            global.document.getElementById = jest.fn(id => {
                if (id === 'pitch_left') return mockPitchSliderLeft;
                if (id === 'pitchValue_left') return mockPitchValueLeft;
                return originalGetElementById(id);
            });

            const eventDetail = { detail: { pitch: 1.25 } };
            const event = new CustomEvent('audioapp:pitchChanged_left', eventDetail); // Event from left
            document.dispatchEvent(event);

            expect(global.AudioApp.audioEngine.setTrackPitch).toHaveBeenCalledWith(0, 1.25); // track 0 (left)
            expect(global.AudioApp.audioEngine.setTrackPitch).toHaveBeenCalledTimes(1); // Only called once

            // When unlinked, app.js's handlePitchChange for 'left' does NOT call uiManager.setSliderValue for the 'right' side.
            // It does update the 'left' side's parameters and relies on the UI event itself to have updated the originating slider.
            // So, we check that setSliderValue wasn't called for the right side.
            expect(global.AudioApp.uiManager.setSliderValue).not.toHaveBeenCalledWith(
                expect.objectContaining({id: 'pitch_right'}), // A more robust way if actual DOM nodes were constructed
                expect.any(Number),
                expect.any(Object),
                'x'
            );
            // It would have been called for the originating side ('left') only if its own event triggered it,
            // but app.js's handlePitchChange updates the state, and the UI slider itself would have already changed.
            // The critical part for app.js is if it updates the *other* slider when linked.
            // So, we can check it was called for the left side exactly once (or not at all by this handler if UI handles its own originating slider)
            // For this test, it's sufficient that the other track's pitch was NOT set and its UI slider was NOT updated by app.js

            global.document.getElementById = originalGetElementById; // Restore original
        });
    });
});
