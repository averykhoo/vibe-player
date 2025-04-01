// --- /vibe-player/js/uiManager.js ---
// Handles DOM manipulation, UI event listeners, and dispatches UI events.
// Updated for multi-track UI state management.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.uiManager = (function() {
    'use strict';

    // === Module Dependencies ===
    const Utils = AudioApp.Utils;

    // --- DOM Element References ---
    /** @type {HTMLElement|null} Main container for track visuals/controls */ let trackAreaContainer;

    // File/Info (Track 1)
    /** @type {HTMLButtonElement|null} */ let chooseFileButtonT1;
    /** @type {HTMLInputElement|null} */ let hiddenAudioFileT1;
    /** @type {HTMLSpanElement|null} */ let fileNameDisplayT1;
    /** @type {HTMLParagraphElement|null} */ let fileInfoT1;
    /** @type {HTMLButtonElement|null} */ let removeTrackButtonT1;
    /** @type {HTMLElement|null} */ let fileLoaderSectionT1;

    // File/Info (Track 2)
    /** @type {HTMLButtonElement|null} */ let chooseFileButtonT2;
    /** @type {HTMLInputElement|null} */ let hiddenAudioFileT2;
    /** @type {HTMLSpanElement|null} */ let fileNameDisplayT2;
    /** @type {HTMLParagraphElement|null} */ let fileInfoT2;
    /** @type {HTMLButtonElement|null} */ let removeTrackButtonT2;
    /** @type {HTMLElement|null} */ let fileLoaderSectionT2;


    // Shared Controls
    /** @type {HTMLButtonElement|null} */ let playPauseButton;
    /** @type {HTMLButtonElement|null} */ let jumpBackButton;
    /** @type {HTMLButtonElement|null} */ let jumpForwardButton;
    /** @type {HTMLInputElement|null} */ let jumpTimeInput;
    /** @type {HTMLDivElement|null} */ let timeDisplay;
    /** @type {HTMLInputElement|null} */ let seekBar;
    /** @type {HTMLInputElement|null} */ let playbackSpeedControl;
    /** @type {HTMLSpanElement|null} */ let speedValueDisplay;
    /** @type {HTMLDivElement|null} */ let speedMarkers;
    /** @type {HTMLInputElement|null} */ let pitchControl;
    /** @type {HTMLSpanElement|null} */ let pitchValueDisplay;
    /** @type {HTMLDivElement|null} */ let pitchMarkers;
    /** @type {HTMLInputElement|null} */ let gainControl; // Master Gain
    /** @type {HTMLSpanElement|null} */ let gainValueDisplay;
    /** @type {HTMLDivElement|null} */ let gainMarkers;

    // Track Controls (Appear when 2 tracks loaded)
    /** @type {HTMLElement|null} */ let trackControlsSection;
    /** @type {HTMLButtonElement|null} */ let muteButtonT1;
    /** @type {HTMLButtonElement|null} */ let muteButtonT2;
    /** @type {HTMLButtonElement|null} */ let swapTracksButton;

    // VAD Controls (Track 1 - For Now)
     /** @type {HTMLElement|null} */ let vadTuningSectionT1;
     /** @type {HTMLDivElement|null} */ let vadProgressContainerT1;
     /** @type {HTMLSpanElement|null} */ let vadProgressBarT1;
     /** @type {HTMLInputElement|null} */ let vadThresholdSliderT1;
     /** @type {HTMLSpanElement|null} */ let vadThresholdValueDisplayT1;
     /** @type {HTMLInputElement|null} */ let vadNegativeThresholdSliderT1;
     /** @type {HTMLSpanElement|null} */ let vadNegativeThresholdValueDisplayT1;

     // Visuals refs removed - managed by visualizer modules directly


    // --- Initialization ---
    /** @public */
    function init() {
        console.log("UIManager: Initializing...");
        if (!Utils) {
            console.error("UIManager: CRITICAL - AudioApp.Utils not found!");
            return;
        }
        assignDOMElements();
        initializeSliderMarkers(); // Only for shared sliders
        setupEventListeners();
        resetUI(); // Sets initial state to 0 tracks
        console.log("UIManager: Initialized.");
    }

    // --- DOM Element Assignment ---
    /** @private */
    function assignDOMElements() {
        trackAreaContainer = document.getElementById('track-area');

        // Track 1 Loaders
        fileLoaderSectionT1 = document.getElementById('file-loader-track-1');
        chooseFileButtonT1 = document.getElementById('chooseFileButton-track-1');
        hiddenAudioFileT1 = document.getElementById('hiddenAudioFile-track-1');
        fileNameDisplayT1 = document.getElementById('fileNameDisplay-track-1');
        fileInfoT1 = document.getElementById('fileInfo-track-1');
        removeTrackButtonT1 = document.getElementById('removeTrackButton-track-1');

        // Track 2 Loaders
        fileLoaderSectionT2 = document.getElementById('file-loader-track-2');
        chooseFileButtonT2 = document.getElementById('chooseFileButton-track-2');
        hiddenAudioFileT2 = document.getElementById('hiddenAudioFile-track-2');
        fileNameDisplayT2 = document.getElementById('fileNameDisplay-track-2');
        fileInfoT2 = document.getElementById('fileInfo-track-2');
        removeTrackButtonT2 = document.getElementById('removeTrackButton-track-2');


        // Shared Playback
        playPauseButton = document.getElementById('playPause');
        jumpBackButton = document.getElementById('jumpBack');
        jumpForwardButton = document.getElementById('jumpForward');
        jumpTimeInput = document.getElementById('jumpTime');
        seekBar = document.getElementById('seekBar');
        timeDisplay = document.getElementById('timeDisplay');

        // Shared Sliders
        playbackSpeedControl = document.getElementById('playbackSpeed');
        speedValueDisplay = document.getElementById('speedValue');
        speedMarkers = document.getElementById('speedMarkers');
        pitchControl = document.getElementById('pitchControl');
        pitchValueDisplay = document.getElementById('pitchValue');
        pitchMarkers = document.getElementById('pitchMarkers');
        gainControl = document.getElementById('gainControl');
        gainValueDisplay = document.getElementById('gainValue');
        gainMarkers = document.getElementById('gainMarkers');

         // Track Controls Section & Buttons
         trackControlsSection = document.getElementById('track-controls');
         muteButtonT1 = document.getElementById('muteButton-track-1');
         muteButtonT2 = document.getElementById('muteButton-track-2');
         swapTracksButton = document.getElementById('swapTracksButton');


        // VAD (Track 1 for now)
        vadTuningSectionT1 = document.getElementById('vad-tuning-track-1');
        vadProgressContainerT1 = document.getElementById('vadProgressContainer-track-1');
        vadProgressBarT1 = document.getElementById('vadProgressBar-track-1');
        vadThresholdSliderT1 = document.getElementById('vadThreshold-track-1');
        vadThresholdValueDisplayT1 = document.getElementById('vadThresholdValue-track-1');
        vadNegativeThresholdSliderT1 = document.getElementById('vadNegativeThreshold-track-1');
        vadNegativeThresholdValueDisplayT1 = document.getElementById('vadNegativeThresholdValue-track-1');


        // Check essential elements
        if (!trackAreaContainer) console.error("UIManager: Critical element #track-area not found!");
        if (!chooseFileButtonT1 || !playPauseButton || !seekBar) { console.warn("UIManager: Could not find some required UI elements!"); }
    }

    // --- Slider Marker Positioning ---
    /** @private */
    function initializeSliderMarkers() {
        const markerConfigs = [
            { slider: playbackSpeedControl, markersDiv: speedMarkers },
            { slider: pitchControl, markersDiv: pitchMarkers },
            { slider: gainControl, markersDiv: gainMarkers }
            // VAD markers handled if/when track 2 VAD exists
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
        // Track 1 File Input
        chooseFileButtonT1?.addEventListener('click', () => { hiddenAudioFileT1?.click(); });
        hiddenAudioFileT1?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) { updateFileName(file.name, 0); dispatchUIEvent('audioapp:fileSelected', { file: file, trackIndex: 0 }); } // Dispatch with index 0
            else { updateFileName("", 0); }
             if (hiddenAudioFileT1) hiddenAudioFileT1.value = ''; // Clear selection
        });
        removeTrackButtonT1?.addEventListener('click', () => dispatchUIEvent('audioapp:removeTrackClicked', { trackIndex: 0 }));


        // Track 2 File Input
        chooseFileButtonT2?.addEventListener('click', () => { hiddenAudioFileT2?.click(); });
        hiddenAudioFileT2?.addEventListener('change', (e) => {
             const file = e.target.files?.[0];
             if (file) { updateFileName(file.name, 1); dispatchUIEvent('audioapp:fileSelected', { file: file, trackIndex: 1 }); } // Dispatch with index 1
             else { updateFileName("", 1); }
             if (hiddenAudioFileT2) hiddenAudioFileT2.value = ''; // Clear selection
        });
        removeTrackButtonT2?.addEventListener('click', () => dispatchUIEvent('audioapp:removeTrackClicked', { trackIndex: 1 }));


        // Shared Controls
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
        setupSliderListeners(gainControl, gainValueDisplay, 'audioapp:gainChanged', 'gain', 'x'); // Master Gain
        speedMarkers?.addEventListener('click', (e) => handleMarkerClick(e, playbackSpeedControl));
        pitchMarkers?.addEventListener('click', (e) => handleMarkerClick(e, pitchControl));
        gainMarkers?.addEventListener('click', (e) => handleMarkerClick(e, gainControl));

         // Track Controls
         muteButtonT1?.addEventListener('click', () => dispatchUIEvent('audioapp:muteTrackClicked', { trackIndex: 0 }));
         muteButtonT2?.addEventListener('click', () => dispatchUIEvent('audioapp:muteTrackClicked', { trackIndex: 1 }));
         swapTracksButton?.addEventListener('click', () => dispatchUIEvent('audioapp:swapTracksClicked'));

        // VAD (Track 1 for now)
        vadThresholdSliderT1?.addEventListener('input', (e) => handleVadSliderInput(e, 0));
        vadNegativeThresholdSliderT1?.addEventListener('input', (e) => handleVadSliderInput(e, 0));

        // Global Keydowns
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
        if (isTextInput || isTextArea || target instanceof HTMLSelectElement) return; // Ignore inputs

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
    function handleVadSliderInput(e, trackIndex) {
        // Only handles track 0 VAD for now
        if (trackIndex !== 0) return;
        const slider = /** @type {HTMLInputElement} */ (e.target);
        const value = parseFloat(slider.value);
        let type = null;
        if (slider === vadThresholdSliderT1 && vadThresholdValueDisplayT1) {
            vadThresholdValueDisplayT1.textContent = value.toFixed(2); type = 'positive';
        } else if (slider === vadNegativeThresholdSliderT1 && vadNegativeThresholdValueDisplayT1) {
            vadNegativeThresholdValueDisplayT1.textContent = value.toFixed(2); type = 'negative';
        }
        if (type) { dispatchUIEvent('audioapp:thresholdChanged', { type: type, value: value, trackIndex: trackIndex }); }
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
        // console.log(`UIManager: Dispatching ${eventName}`, detail);
        document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }

    // --- Public Methods for Updating UI ---

    /**
     * Sets the overall UI layout state (0, 1, or 2 tracks).
     * Controls visibility of track sections and track-specific controls.
     * @public
     * @param {0 | 1 | 2} state - The desired layout state.
     */
    function setUILayoutState(state) {
         if (!trackAreaContainer || !fileLoaderSectionT2 || !trackControlsSection || !removeTrackButtonT1 || !removeTrackButtonT2) {
              console.error("UIManager: Cannot set layout state, essential containers/buttons missing.");
              return;
         }
         console.log(`UIManager: Setting layout state to ${state}`);

         // Manage container class
         trackAreaContainer.classList.remove('layout-state-0', 'layout-state-1', 'layout-state-2');
         trackAreaContainer.classList.add(`layout-state-${state}`);

         // Manage visibility of sections/buttons based on state
         fileLoaderSectionT2.style.display = (state === 1) ? 'block' : 'none';
         trackControlsSection.style.display = (state === 2) ? 'block' : 'none';
         removeTrackButtonT1.style.display = (state === 1 || state === 2) ? 'inline-block' : 'none';
         removeTrackButtonT2.style.display = (state === 2) ? 'inline-block' : 'none';

         // Reset mute button states when layout changes significantly
         if (state < 2) {
             setMuteButtonState(0, false);
             setMuteButtonState(1, false);
         }
    }


    /** @public */
    function resetUI() {
        console.log("UIManager: Resetting UI");
        setUILayoutState(0); // Set to no tracks loaded state
        updateFileName("", 0);
        updateFileName("", 1);
        setFileInfo("No file selected.", 0);
        setFileInfo("", 1); // Clear track 2 info
        setPlayButtonState(false);
        updateTimeDisplay(0, 0);
        updateSeekBar(0);
        setSpeechRegionsText("None", 0); // Assuming VAD display tied to track 0 for now
        updateVadDisplay(0.5, 0.35, true, 0); // Reset VAD sliders for track 0
        showVadProgress(false, 0); // Hide VAD bar for track 0
        updateVadProgress(0, 0);   // Reset VAD bar width for track 0

        // Reset shared sliders
        if (playbackSpeedControl) playbackSpeedControl.value = "1.0"; if (speedValueDisplay) speedValueDisplay.textContent = "1.00x";
        if (pitchControl) pitchControl.value = "1.0"; if (pitchValueDisplay) pitchValueDisplay.textContent = "1.00x";
        if (gainControl) gainControl.value = "1.0"; if (gainValueDisplay) gainValueDisplay.textContent = "1.00x";
        if (jumpTimeInput) jumpTimeInput.value = "5";

        // Disable controls
        enablePlaybackControls(false);
        enableSeekBar(false);
        enableVadControls(false, 0); // Disable VAD for track 0
        setMuteButtonState(0, false); // Ensure mute buttons reset
        setMuteButtonState(1, false);
    }

    /**
     * Updates the file name display for a specific track.
     * @public
     * @param {string} text
     * @param {number} trackIndex (0 or 1)
     */
    function updateFileName(text, trackIndex) {
        const displayEl = trackIndex === 0 ? fileNameDisplayT1 : fileNameDisplayT2;
        if (displayEl) { displayEl.textContent = text; displayEl.title = text; }
    }

    /**
     * Sets the informational text for a specific track loader.
     * @public
     * @param {string} text
     * @param {number} trackIndex (0 or 1)
     */
    function setFileInfo(text, trackIndex) {
         const infoEl = trackIndex === 0 ? fileInfoT1 : fileInfoT2;
         if (infoEl) { infoEl.textContent = text; infoEl.title = text; }
    }

    /** @public @param {boolean} isPlaying */
    function setPlayButtonState(isPlaying) { if (playPauseButton) playPauseButton.textContent = isPlaying ? 'Pause' : 'Play'; }

    /**
     * @public
     * @param {number} currentTime
     * @param {number} duration - Duration of the track determining the display (e.g., track 0 or longest)
     */
    function updateTimeDisplay(currentTime, duration) {
        if (timeDisplay && Utils) {
            timeDisplay.textContent = `${Utils.formatTime(currentTime)} / ${Utils.formatTime(duration)}`;
        } else if (timeDisplay) {
             timeDisplay.textContent = `Err / Err`;
        }
    }

    /** @public @param {number} fraction */
    function updateSeekBar(fraction) {
        if (seekBar) {
            const clampedFraction = Math.max(0, Math.min(1, fraction));
            if (Math.abs(parseFloat(seekBar.value) - clampedFraction) > 1e-6 ) { seekBar.value = String(clampedFraction); }
        }
    }

    /**
     * Sets the text content for speech regions (assuming single display for now).
     * @public
     * @param {string | Array<{start: number, end: number}>} regionsOrText
     * @param {number} trackIndex (Currently ignored, affects shared display)
     */
    function setSpeechRegionsText(regionsOrText, trackIndex = 0) {
        // TODO: Implement separate displays if needed. For now, only Track 0 shown.
        if (trackIndex !== 0) return;

        const speechRegionsDisplay = document.getElementById('speechRegionsDisplay'); // Assuming one for now
        if (!speechRegionsDisplay) return;

        if (typeof regionsOrText === 'string') { speechRegionsDisplay.textContent = regionsOrText; }
        else if (Array.isArray(regionsOrText)) {
             if (regionsOrText.length > 0) { speechRegionsDisplay.textContent = regionsOrText.map(r => `Start: ${r.start.toFixed(2)}s, End: ${r.end.toFixed(2)}s`).join('\n'); }
             else { speechRegionsDisplay.textContent = "No speech detected."; }
        } else { speechRegionsDisplay.textContent = "None"; }
    }

    /**
     * Updates VAD threshold sliders and displays.
     * @public
     * @param {number} positive
     * @param {number} negative
     * @param {boolean} [isNA=false]
     * @param {number} [trackIndex=0] - Which track's VAD UI to update (only 0 supported now)
     */
    function updateVadDisplay(positive, negative, isNA = false, trackIndex = 0) {
        // Only track 0 VAD UI exists for now
        if (trackIndex !== 0) return;
        const sliderPos = vadThresholdSliderT1;
        const displayPos = vadThresholdValueDisplayT1;
        const sliderNeg = vadNegativeThresholdSliderT1;
        const displayNeg = vadNegativeThresholdValueDisplayT1;

        if (isNA) {
            if (displayPos) displayPos.textContent = "N/A";
            if (displayNeg) displayNeg.textContent = "N/A";
            if (sliderPos) sliderPos.value = "0.5";
            if (sliderNeg) sliderNeg.value = "0.35";
        } else {
            if (sliderPos) sliderPos.value = String(positive);
            if (displayPos) displayPos.textContent = positive.toFixed(2);
            if (sliderNeg) sliderNeg.value = String(negative);
            if (displayNeg) displayNeg.textContent = negative.toFixed(2);
        }
    }

    /** @public @param {boolean} enable */
    function enablePlaybackControls(enable) {
        if (playPauseButton) playPauseButton.disabled = !enable;
        if (jumpBackButton) jumpBackButton.disabled = !enable;
        if (jumpForwardButton) jumpForwardButton.disabled = !enable;
        if (playbackSpeedControl) playbackSpeedControl.disabled = !enable;
        if (pitchControl) pitchControl.disabled = !enable;
        // Master Gain always enabled
    }
    /** @public @param {boolean} enable */
     function enableSeekBar(enable) { if (seekBar) seekBar.disabled = !enable; }

    /**
     * Enables or disables VAD controls for a specific track.
     * @public
     * @param {boolean} enable
     * @param {number} [trackIndex=0] - Which track's VAD UI to update (only 0 supported now)
     */
    function enableVadControls(enable, trackIndex = 0) {
        if (trackIndex !== 0) return; // Only track 0 VAD UI exists
        const sliderPos = vadThresholdSliderT1;
        const sliderNeg = vadNegativeThresholdSliderT1;

        if (sliderPos) sliderPos.disabled = !enable;
        if (sliderNeg) sliderNeg.disabled = !enable;
        if (!enable) { updateVadDisplay(0.5, 0.35, true, 0); } // Reset display if disabling
    }

    /** @public @returns {number} */
    function getJumpTime() { return parseFloat(jumpTimeInput?.value) || 5; }

    // --- VAD Progress Bar Functions ---
    /**
     * Updates the VAD progress bar for a specific track.
     * @public
     * @param {number} percentage
     * @param {number} [trackIndex=0] - Which track's VAD UI to update (only 0 supported now)
     */
    function updateVadProgress(percentage, trackIndex = 0) {
        if (trackIndex !== 0) return; // Only track 0 VAD UI exists
        const bar = vadProgressBarT1;
        if (!bar) return;
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        bar.style.width = `${clampedPercentage}%`;
    }

    /**
     * Shows or hides the VAD progress bar container for a specific track.
     * @public
     * @param {boolean} show
     * @param {number} [trackIndex=0] - Which track's VAD UI to update (only 0 supported now)
     */
    function showVadProgress(show, trackIndex = 0) {
        if (trackIndex !== 0) return; // Only track 0 VAD UI exists
        const container = vadProgressContainerT1;
        if (!container) return;
        container.style.display = show ? 'block' : 'none';
    }

    /**
     * Sets the visual state of a mute button.
     * @public
     * @param {number} trackIndex (0 or 1)
     * @param {boolean} isMuted
     */
     function setMuteButtonState(trackIndex, isMuted) {
         const button = trackIndex === 0 ? muteButtonT1 : muteButtonT2;
         if (!button) return;
         // Basic text change - could use CSS classes later for better styling
         const baseText = trackIndex === 0 ? "Mute T1" : "Mute T2";
         button.textContent = isMuted ? `Unmute T${trackIndex + 1}` : baseText;
         // Optional: Add/remove a class for styling
         // button.classList.toggle('muted', isMuted);
     }

    // --- Public Interface ---
    return {
        init: init,
        resetUI: resetUI,
        setUILayoutState: setUILayoutState, // New method
        setFileInfo: setFileInfo, // Updated signature
        updateFileName: updateFileName, // Updated signature
        setPlayButtonState: setPlayButtonState,
        updateTimeDisplay: updateTimeDisplay,
        updateSeekBar: updateSeekBar,
        setSpeechRegionsText: setSpeechRegionsText, // Updated signature (but affects shared display)
        updateVadDisplay: updateVadDisplay, // Updated signature
        enablePlaybackControls: enablePlaybackControls,
        enableSeekBar: enableSeekBar,
        enableVadControls: enableVadControls, // Updated signature
        getJumpTime: getJumpTime,
        updateVadProgress: updateVadProgress, // Updated signature
        showVadProgress: showVadProgress, // Updated signature
        setMuteButtonState: setMuteButtonState // New method
    };
})();
// --- /vibe-player/js/uiManager.js ---
