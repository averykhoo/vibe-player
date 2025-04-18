// --- /vibe-player/js/uiManager.js ---
// Handles DOM manipulation, UI event listeners, and dispatches UI events.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.uiManager = (function() {
    'use strict';

    // === Module Dependencies ===
    // Assuming AudioApp.Utils is loaded before this file.
    const Utils = AudioApp.Utils;

    // --- DOM Element References ---
    // File/Info
    /** @type {HTMLButtonElement|null} */ let chooseFileButton;
    /** @type {HTMLInputElement|null} */ let hiddenAudioFile;
    /** @type {HTMLSpanElement|null} */ let fileNameDisplay;
    /** @type {HTMLParagraphElement|null} */ let fileInfo;
    /** @type {HTMLDivElement|null} */ let vadProgressContainer;
    /** @type {HTMLSpanElement|null} */ let vadProgressBar;

    // Buttons
    /** @type {HTMLButtonElement|null} */ let playPauseButton;
    /** @type {HTMLButtonElement|null} */ let jumpBackButton;
    /** @type {HTMLButtonElement|null} */ let jumpForwardButton;
    /** @type {HTMLInputElement|null} */ let jumpTimeInput;
    // Time & Seek
    /** @type {HTMLDivElement|null} */ let timeDisplay;
    /** @type {HTMLInputElement|null} */ let seekBar;
    // Sliders & Displays & Markers
    /** @type {HTMLInputElement|null} */ let playbackSpeedControl;
    /** @type {HTMLSpanElement|null} */ let speedValueDisplay;
    /** @type {HTMLDivElement|null} */ let speedMarkers;
    /** @type {HTMLInputElement|null} */ let pitchControl;
    /** @type {HTMLSpanElement|null} */ let pitchValueDisplay;
    /** @type {HTMLDivElement|null} */ let pitchMarkers;
    /** @type {HTMLInputElement|null} */ let formantControl; // Keep reference if needed later
    /** @type {HTMLSpanElement|null} */ let formantValueDisplay; // Keep reference if needed later
    /** @type {HTMLDivElement|null} */ let formantMarkers; // Keep reference if needed later
    /** @type {HTMLInputElement|null} */ let gainControl;
    /** @type {HTMLSpanElement|null} */ let gainValueDisplay;
    /** @type {HTMLDivElement|null} */ let gainMarkers;
    /** @type {HTMLInputElement|null} */ let vadThresholdSlider;
    /** @type {HTMLSpanElement|null} */ let vadThresholdValueDisplay;
    /** @type {HTMLInputElement|null} */ let vadNegativeThresholdSlider;
    /** @type {HTMLSpanElement|null} */ let vadNegativeThresholdValueDisplay;
    // Visuals (Removed direct canvas refs - only need progress indicator refs if managed here, but they are managed by visualizers now)
    // /** @type {HTMLCanvasElement|null} */ let waveformCanvas;
    // /** @type {CanvasRenderingContext2D|null} */ let waveformCtx;
    // /** @type {HTMLCanvasElement|null} */ let spectrogramCanvas;
    // /** @type {CanvasRenderingContext2D|null} */ let spectrogramCtx;
    // /** @type {HTMLSpanElement|null} */ let spectrogramSpinner;
    // /** @type {HTMLDivElement|null} */ let waveformProgressIndicator;
    // /** @type {HTMLDivElement|null} */ let spectrogramProgressIndicator;
    // VAD Output
    /** @type {HTMLPreElement|null} */ let speechRegionsDisplay;

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("UIManager: Initializing...");
        // Ensure Utils is loaded
        if (!Utils) {
            console.error("UIManager: CRITICAL - AudioApp.Utils not found!");
            // Optionally disable UI or show error
            return;
        }
        assignDOMElements();
        initializeSliderMarkers();
        setupEventListeners();
        resetUI();
        console.log("UIManager: Initialized.");
    }

    // --- DOM Element Assignment ---
    /** @private */
    function assignDOMElements() {
        // File Handling
        chooseFileButton = document.getElementById('chooseFileButton');
        hiddenAudioFile = document.getElementById('hiddenAudioFile');
        fileNameDisplay = document.getElementById('fileNameDisplay');
        fileInfo = document.getElementById('fileInfo');
        vadProgressContainer = document.getElementById('vadProgressContainer');
        vadProgressBar = document.getElementById('vadProgressBar');

        // Playback
        playPauseButton = document.getElementById('playPause');
        jumpBackButton = document.getElementById('jumpBack');
        jumpForwardButton = document.getElementById('jumpForward');
        jumpTimeInput = document.getElementById('jumpTime');

        // Seek & Time
        seekBar = document.getElementById('seekBar');
        timeDisplay = document.getElementById('timeDisplay');

        // Slider groups
        playbackSpeedControl = document.getElementById('playbackSpeed');
        speedValueDisplay = document.getElementById('speedValue');
        speedMarkers = document.getElementById('speedMarkers');
        pitchControl = document.getElementById('pitchControl');
        pitchValueDisplay = document.getElementById('pitchValue');
        pitchMarkers = document.getElementById('pitchMarkers');
        gainControl = document.getElementById('gainControl');
        gainValueDisplay = document.getElementById('gainValue');
        gainMarkers = document.getElementById('gainMarkers');

        // VAD sliders
        vadThresholdSlider = document.getElementById('vadThreshold');
        vadThresholdValueDisplay = document.getElementById('vadThresholdValue');
        vadNegativeThresholdSlider = document.getElementById('vadNegativeThreshold');
        vadNegativeThresholdValueDisplay = document.getElementById('vadNegativeThresholdValue');

        // Visuals - Removed canvas/context refs
        // waveformCanvas = document.getElementById('waveformCanvas');
        // if (waveformCanvas) waveformCtx = waveformCanvas.getContext('2d');
        // spectrogramCanvas = document.getElementById('spectrogramCanvas');
        //  if (spectrogramCanvas) spectrogramCtx = spectrogramCanvas.getContext('2d');
        // spectrogramSpinner = document.getElementById('spectrogramSpinner'); // Spinner ref moved to spectrogramVisualizer
        // waveformProgressIndicator = document.getElementById('waveformProgressIndicator'); // Managed by waveformVisualizer
        // spectrogramProgressIndicator = document.getElementById('spectrogramProgressIndicator'); // Managed by spectrogramVisualizer

        // Speech Info
        speechRegionsDisplay = document.getElementById('speechRegionsDisplay');

        // Check essential elements
        if (!vadProgressContainer || !vadProgressBar ) { console.warn("UIManager: Could not find VAD progress bar elements!"); }
        if (!chooseFileButton || !hiddenAudioFile || !playPauseButton || !seekBar || !playbackSpeedControl) { console.warn("UIManager: Could not find all required UI elements!"); }
    }

    // --- Slider Marker Positioning ---
    /** @private */
    function initializeSliderMarkers() {
        const markerConfigs = [
            { slider: playbackSpeedControl, markersDiv: speedMarkers },
            { slider: pitchControl, markersDiv: pitchMarkers },
            { slider: gainControl, markersDiv: gainMarkers }
        ];
        markerConfigs.forEach(config => {
            const { slider, markersDiv } = config;
            if (!slider || !markersDiv) return;
            const min = parseFloat(slider.min);
            const max = parseFloat(slider.max);
            const range = max - min;
            if (range <= 0) return;
            const markers = markersDiv.querySelectorAll('span[data-value]');
            markers.forEach(span => {
                const value = parseFloat(span.dataset.value);
                if (!isNaN(value)) { const percent = ((value - min) / range) * 100; span.style.left = `${percent}%`; }
            });
        });
    }

    // --- Event Listener Setup ---
    /** @private */
    function setupEventListeners() {
        chooseFileButton?.addEventListener('click', () => { hiddenAudioFile?.click(); });
        hiddenAudioFile?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) { updateFileName(file.name); dispatchUIEvent('audioapp:fileSelected', { file: file }); }
            else { updateFileName(""); }
        });
        seekBar?.addEventListener('input', (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            const fraction = parseFloat(target.value);
            if (!isNaN(fraction)) { dispatchUIEvent('audioapp:seekBarInput', { fraction: fraction }); }
        });
        playPauseButton?.addEventListener('click', () => dispatchUIEvent('audioapp:playPauseClicked'));
        jumpBackButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', { seconds: -getJumpTime() }));
        jumpForwardButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', { seconds: getJumpTime() }));

        setupSliderListeners(playbackSpeedControl, speedValueDisplay, 'audioapp:speedChanged', 'speed', 'x');
        setupSliderListeners(pitchControl, pitchValueDisplay, 'audioapp:pitchChanged', 'pitch', 'x');
        setupSliderListeners(gainControl, gainValueDisplay, 'audioapp:gainChanged', 'gain', 'x');

        speedMarkers?.addEventListener('click', (e) => handleMarkerClick(e, playbackSpeedControl));
        pitchMarkers?.addEventListener('click', (e) => handleMarkerClick(e, pitchControl));
        gainMarkers?.addEventListener('click', (e) => handleMarkerClick(e, gainControl));

        vadThresholdSlider?.addEventListener('input', handleVadSliderInput);
        vadNegativeThresholdSlider?.addEventListener('input', handleVadSliderInput);

        document.addEventListener('keydown', handleKeyDown);
    }

    /** @private */
    function setupSliderListeners(slider, valueDisplay, eventName, detailKey, suffix = '') {
        if (!slider || !valueDisplay) return;
        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            valueDisplay.textContent = value.toFixed(2) + suffix;
            dispatchUIEvent(eventName, { [detailKey]: value });
        });
    }

    /** @private */
    function handleKeyDown(e) {
        const target = e.target;
        const isTextInput = target instanceof HTMLInputElement && ['text', 'number', 'search', 'email', 'password', 'url'].includes(target.type);
        const isTextArea = target instanceof HTMLTextAreaElement;
        if (isTextInput || isTextArea) return; // Ignore inputs in text fields

        let handled = false; let eventKey = null;
        switch (e.code) {
            case 'Space': eventKey = 'Space'; handled = true; break;
            case 'ArrowLeft': eventKey = 'ArrowLeft'; handled = true; break;
            case 'ArrowRight': eventKey = 'ArrowRight'; handled = true; break;
        }
        if (eventKey) { dispatchUIEvent('audioapp:keyPressed', { key: eventKey }); }
        if (handled) { e.preventDefault(); }
    }

    /** @private */
    function handleVadSliderInput(e) {
        const slider = /** @type {HTMLInputElement} */ (e.target);
        const value = parseFloat(slider.value);
        let type = null;
        if (slider === vadThresholdSlider && vadThresholdValueDisplay) {
            vadThresholdValueDisplay.textContent = value.toFixed(2); type = 'positive';
        } else if (slider === vadNegativeThresholdSlider && vadNegativeThresholdValueDisplay) {
            vadNegativeThresholdValueDisplay.textContent = value.toFixed(2); type = 'negative';
        }
        if (type) { dispatchUIEvent('audioapp:thresholdChanged', { type: type, value: value }); }
    }

    /** @private */
     function handleMarkerClick(event, sliderElement) {
        if (!sliderElement || sliderElement.disabled) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.tagName === 'SPAN' && target.dataset.value) {
            const value = parseFloat(target.dataset.value);
            if (!isNaN(value)) {
                sliderElement.value = String(value);
                sliderElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    /** @private */
    function dispatchUIEvent(eventName, detail = {}) {
        document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }

    // --- Public Methods for Updating UI ---
    /** @public */
    function resetUI() {
        console.log("UIManager: Resetting UI");
        updateFileName("");
        setFileInfo("No file selected.");
        setPlayButtonState(false);
        updateTimeDisplay(0, 0);
        updateSeekBar(0);
        setSpeechRegionsText("None");
        updateVadDisplay(0.5, 0.35, true); // Reset VAD sliders to N/A
        showVadProgress(false); // Hide VAD bar
        updateVadProgress(0);   // Reset VAD bar width

        // Reset sliders
        if (playbackSpeedControl) playbackSpeedControl.value = "1.0"; if (speedValueDisplay) speedValueDisplay.textContent = "1.00x";
        if (pitchControl) pitchControl.value = "1.0"; if (pitchValueDisplay) pitchValueDisplay.textContent = "1.00x";
        if (gainControl) gainControl.value = "1.0"; if (gainValueDisplay) gainValueDisplay.textContent = "1.00x";
        if (jumpTimeInput) jumpTimeInput.value = "5";

        // Disable controls
        enablePlaybackControls(false);
        enableSeekBar(false);
        enableVadControls(false);
    }

    /** @public @param {string} text */
    function updateFileName(text) { if (fileNameDisplay) { fileNameDisplay.textContent = text; fileNameDisplay.title = text; } }
    /** @public @param {string} text */
    function setFileInfo(text) { if (fileInfo) { fileInfo.textContent = text; fileInfo.title = text; } }
    /** @public @param {boolean} isPlaying */
    function setPlayButtonState(isPlaying) { if (playPauseButton) playPauseButton.textContent = isPlaying ? 'Pause' : 'Play'; }

    /**
     * @public
     * @param {number} currentTime
     * @param {number} duration
     * Uses AudioApp.Utils.formatTime
     */
    function updateTimeDisplay(currentTime, duration) {
        if (timeDisplay && Utils) { // Check Utils exists
            timeDisplay.textContent = `${Utils.formatTime(currentTime)} / ${Utils.formatTime(duration)}`;
        } else if (timeDisplay) {
             timeDisplay.textContent = `Err / Err`; // Fallback if Utils missing
        }
    }

    /** @public @param {number} fraction */
    function updateSeekBar(fraction) {
        if (seekBar) {
            const clampedFraction = Math.max(0, Math.min(1, fraction));
            if (Math.abs(parseFloat(seekBar.value) - clampedFraction) > 1e-6 ) { seekBar.value = String(clampedFraction); }
        }
    }

    /** @public @param {string | Array<{start: number, end: number}>} regionsOrText */
    function setSpeechRegionsText(regionsOrText) {
        if (!speechRegionsDisplay) return;
        if (typeof regionsOrText === 'string') { speechRegionsDisplay.textContent = regionsOrText; }
        else if (Array.isArray(regionsOrText)) {
             if (regionsOrText.length > 0) { speechRegionsDisplay.textContent = regionsOrText.map(r => `Start: ${r.start.toFixed(2)}s, End: ${r.end.toFixed(2)}s`).join('\n'); }
             else { speechRegionsDisplay.textContent = "No speech detected."; }
        } else { speechRegionsDisplay.textContent = "None"; }
    }

    /** @public @param {number} positive @param {number} negative @param {boolean} [isNA=false] */
    function updateVadDisplay(positive, negative, isNA = false) {
        if (isNA) {
            if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = "N/A";
            if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = "N/A";
            if (vadThresholdSlider) vadThresholdSlider.value = "0.5";
            if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = "0.35";
        } else {
            if (vadThresholdSlider) vadThresholdSlider.value = String(positive);
            if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = positive.toFixed(2);
            if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = String(negative);
            if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = negative.toFixed(2);
        }
    }

    /** @public @param {boolean} enable */
    function enablePlaybackControls(enable) {
        if (playPauseButton) playPauseButton.disabled = !enable;
        if (jumpBackButton) jumpBackButton.disabled = !enable;
        if (jumpForwardButton) jumpForwardButton.disabled = !enable;
        if (playbackSpeedControl) playbackSpeedControl.disabled = !enable;
        if (pitchControl) pitchControl.disabled = !enable;
        // Gain control generally always enabled
    }
    /** @public @param {boolean} enable */
     function enableSeekBar(enable) { if (seekBar) seekBar.disabled = !enable; }
    /** @public @param {boolean} enable */
    function enableVadControls(enable) {
        if (vadThresholdSlider) vadThresholdSlider.disabled = !enable;
        if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.disabled = !enable;
        if (!enable) { updateVadDisplay(0.5, 0.35, true); } // Reset display if disabling
    }

    /** @public @returns {number} */
    function getJumpTime() { return parseFloat(jumpTimeInput?.value) || 5; }

    // --- formatTime function REMOVED ---

    // --- VAD Progress Bar Functions ---
    /** @public @param {number} percentage */
    function updateVadProgress(percentage) {
        if (!vadProgressBar) return;
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        vadProgressBar.style.width = `${clampedPercentage}%`;
    }
    /** @public @param {boolean} show */
    function showVadProgress(show) {
        if (!vadProgressContainer) return;
        vadProgressContainer.style.display = show ? 'block' : 'none'; // Simple show/hide
    }

    // --- Public Interface ---
    return {
        init: init,
        resetUI: resetUI,
        setFileInfo: setFileInfo,
        updateFileName: updateFileName,
        setPlayButtonState: setPlayButtonState,
        updateTimeDisplay: updateTimeDisplay,
        updateSeekBar: updateSeekBar,
        setSpeechRegionsText: setSpeechRegionsText,
        updateVadDisplay: updateVadDisplay,
        enablePlaybackControls: enablePlaybackControls,
        enableSeekBar: enableSeekBar,
        enableVadControls: enableVadControls,
        getJumpTime: getJumpTime,
        updateVadProgress: updateVadProgress,
        showVadProgress: showVadProgress
    };
})();
// --- /vibe-player/js/uiManager.js ---
