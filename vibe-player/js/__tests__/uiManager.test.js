// vibe-player/js/__tests__/uiManager.test.js
var AudioApp = AudioApp || {};
AudioApp.Utils = { formatTime: jest.fn(t => `${t}s`) }; // Mock minimal utils

describe('AudioApp.uiManager', () => {
    let uiManager;

    // Helper function to set up DOM elements for each test
    function setupDOM() {
        document.body.innerHTML = `
            <div id="track-controls">
                <div id="track-controls-left">
                    <input type="range" id="pitch_left">
                    <span id="pitchValue_left"></span>
                    <div id="pitchMarkers_left"></div>
                    <button id="mute_left"></button>
                    <input type="range" id="volume_left">
                    <span id="volumeValue_left"></span>
                    <input type="text" id="delay_left">
                </div>
                <div id="track-controls-linking">
                    <button id="linkPitchButton"></button>
                </div>
                <div id="track-controls-right">
                    <input type="range" id="pitch_right">
                    <span id="pitchValue_right"></span>
                    <div id="pitchMarkers_right"></div>
                    <button id="mute_right"></button>
                    <input type="range" id="volume_right">
                    <span id="volumeValue_right"></span>
                    <input type="text" id="delay_right">
                </div>
            </div>
            <div id="visualization_right"></div>
            <div id="visualization_right_spec"></div>
            <button id="swapTracksButton"></button>
            <button id="removeTrackButton_right"></button>
            <input type="file" id="hiddenAudioFile_left">
            <button id="chooseFileButton_left"></button>
            <span id="fileNameDisplay_left"></span>
            <p id="fileInfo_left"></p>
            <input type="file" id="hiddenAudioFile_right">
            <button id="chooseFileButton_right"></button>
            <span id="fileNameDisplay_right"></span>
            <p id="fileInfo_right"></p>
            <div id="multi-track-options"></div>
            <button id="playPause"></button>
            <button id="jumpBack"></button>
            <button id="jumpForward"></button>
            <input type="number" id="jumpTime">
            <div id="timeDisplay"></div>
            <input type="range" id="seekBar">
            <span id="driftValueMs"></span>
            <input type="range" id="gainControl">
            <span id="gainValue"></span>
            <div id="gainMarkers"></div>
            <input type="range" id="globalSpeedControl">
            <span id="globalSpeedValue"></span>
            <div id="globalSpeedMarkers"></div>
            <div id="vadProgressContainer"></div>
            <span id="vadProgressBar"></span>
            <input type="range" id="vadThreshold">
            <span id="vadThresholdValue"></span>
            <input type="range" id="vadNegativeThreshold">
            <span id="vadNegativeThresholdValue"></span>
            <div id="speechRegionsDisplay"></div>
            <section id="visualization_left"></section>
            <section id="visualization_left_spec"></section>
        `;
        // Re-require and init uiManager after DOM is set up
        jest.resetModules(); // Important to get fresh module
        AudioApp = global.AudioApp || {}; // Ensure AudioApp namespace exists for uiManager
        AudioApp.Utils = { formatTime: jest.fn(t => `${t}s`), debounce: jest.fn(fn => fn) }; // Re-mock if uiManager uses more utils
        uiManager = require('../uiManager');
        AudioApp.uiManager = uiManager; // Make it available on the global for app.js if it were also tested here
        uiManager.init(); // Calls assignDOMElements
    }

    beforeEach(() => {
        setupDOM();
    });

    test('initial state after init() and resetUI()', () => {
        uiManager.resetUI(); // resetUI calls showMultiTrackUI(false) and hides trackControlsSection

        const trackControlsSection = document.getElementById('track-controls');
        const linkPitchButton = document.getElementById('linkPitchButton');

        expect(trackControlsSection.style.display).toBe('none');
        // Check for 'active' class or other visual cue for linked state
        expect(linkPitchButton.classList.contains('active')).toBe(true); // Assuming 'active' means linked
        expect(linkPitchButton.innerHTML).toBe('🔗');
    });

    test('UI state for single (left) track loaded', () => {
        uiManager.resetUI(); // Start from reset state
        uiManager.setTrackControlsVisibility(true); // Show the main section
        // showMultiTrackUI(false) is called by resetUI, so right controls should be hidden

        const trackControlsSection = document.getElementById('track-controls');
        const leftControls = document.getElementById('track-controls-left');
        const rightControls = document.getElementById('track-controls-right');
        const linkingControls = document.getElementById('track-controls-linking');

        expect(trackControlsSection.style.display).toBe(''); // Main section visible
        expect(leftControls.style.display).toBe('');       // Left controls visible
        expect(rightControls.style.display).toBe('none');   // Right controls hidden
        expect(linkingControls.style.display).toBe('none'); // Linking controls hidden
    });

    test('UI state for dual (both) tracks loaded', () => {
        uiManager.resetUI();
        uiManager.setTrackControlsVisibility(true); // Show the main section
        uiManager.showMultiTrackUI(true);           // Show right-side elements

        const trackControlsSection = document.getElementById('track-controls');
        const leftControls = document.getElementById('track-controls-left');
        const rightControls = document.getElementById('track-controls-right');
        const linkingControls = document.getElementById('track-controls-linking');

        expect(trackControlsSection.style.display).toBe(''); // Main section visible
        expect(leftControls.style.display).toBe('');       // Left controls visible
        expect(rightControls.style.display).toBe('');       // Right controls visible
        expect(linkingControls.style.display).toBe('');       // Linking controls visible
    });

    // TODO: Add test for linkPitchButton click toggling its state
});
