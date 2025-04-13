// --- /vibe-player/js/uiManager.js ---
// Handles DOM manipulation, UI event listeners, and dispatches UI events.
// REFACTORED to use a global speed control and remove individual/linked speed logic.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.uiManager = (function () {
    'use strict';

    // === Module Dependencies ===
    const Utils = AudioApp.Utils; // Assumed loaded

    // --- DOM Element References ---
    // File/Info - Left
    let chooseFileButton_left, hiddenAudioFile_left, fileNameDisplay_left, fileInfo_left;
    // File/Info - Right
    let chooseFileButton_right, hiddenAudioFile_right, fileNameDisplay_right, fileInfo_right;
    // Multi-Track Options
    let multiTrackOptionsDiv, swapTracksButton, removeTrackButton_right;
    // Global Buttons & Seek
    let playPauseButton, jumpBackButton, jumpForwardButton, jumpTimeInput, timeDisplay, seekBar, driftValueMsSpan;
    // Track Controls Section (Container)
    let trackControlsSection;
    // Track Left Controls (No Speed)
    let muteButton_left, soloButton_left, volumeSlider_left, volumeValue_left, delayInput_left, pitchSlider_left, pitchValue_left, pitchMarkers_left;
    // Track Right Controls (No Speed)
    let muteButton_right, soloButton_right, volumeSlider_right, volumeValue_right, delayInput_right, pitchSlider_right, pitchValue_right, pitchMarkers_right;
    // Linking Buttons (No Speed)
    let linkPitchButton;
    // Global Master Gain & Speed
    let gainControl, gainValueDisplay, gainMarkers;
    let globalSpeedControl, globalSpeedValue, globalSpeedMarkers; // ** NEW: Global Speed Elements **
    // VAD (Left Track Only UI Controls)
    let vadProgressContainer, vadProgressBar, vadThresholdSlider, vadThresholdValueDisplay, vadNegativeThresholdSlider, vadNegativeThresholdValueDisplay, speechRegionsDisplay;
    // Visualizations (Containers)
    let visualizationLeftSection, visualizationLeftSpecSection, visualizationRightSection, visualizationRightSpecSection;

    // --- State ---
    let isMultiTrackUIVisible = false;

    // --- Initialization ---
    /**
     * Initializes the UI Manager by assigning elements, setting up listeners, and resetting the UI.
     * @public
     */
    function init() {
        console.log("UIManager: Initializing...");
        if (!Utils) { console.error("UIManager: CRITICAL - AudioApp.Utils not found!"); return; }
        assignDOMElements();
        initializeSliderMarkers();
        setupEventListeners();
        resetUI();
        console.log("UIManager: Initialized.");
    }

    // --- DOM Element Assignment ---
    /**
     * Assigns DOM elements to module-scoped variables. Includes new global speed elements.
     * @private
     */
    function assignDOMElements() {
        // File Handling - Left
        chooseFileButton_left = document.getElementById('chooseFileButton_left'); hiddenAudioFile_left = document.getElementById('hiddenAudioFile_left'); fileNameDisplay_left = document.getElementById('fileNameDisplay_left'); fileInfo_left = document.getElementById('fileInfo_left');
        // File Handling - Right & Multi-Track Options
        multiTrackOptionsDiv = document.getElementById('multi-track-options'); chooseFileButton_right = document.getElementById('chooseFileButton_right'); hiddenAudioFile_right = document.getElementById('hiddenAudioFile_right'); fileNameDisplay_right = document.getElementById('fileNameDisplay_right'); fileInfo_right = document.getElementById('fileInfo_right'); swapTracksButton = document.getElementById('swapTracksButton'); removeTrackButton_right = document.getElementById('removeTrackButton_right');
        // Global Playback
        playPauseButton = document.getElementById('playPause'); jumpBackButton = document.getElementById('jumpBack'); jumpForwardButton = document.getElementById('jumpForward'); jumpTimeInput = document.getElementById('jumpTime'); seekBar = document.getElementById('seekBar'); timeDisplay = document.getElementById('timeDisplay'); driftValueMsSpan = document.getElementById('driftValueMs');
        // Track Controls Section Container
        trackControlsSection = document.getElementById('track-controls');
        // Track Left Controls (No Speed)
        muteButton_left = document.getElementById('mute_left'); soloButton_left = document.getElementById('solo_left'); volumeSlider_left = document.getElementById('volume_left'); volumeValue_left = document.getElementById('volumeValue_left'); delayInput_left = document.getElementById('delay_left'); pitchSlider_left = document.getElementById('pitch_left'); pitchValue_left = document.getElementById('pitchValue_left'); pitchMarkers_left = document.getElementById('pitchMarkers_left');
        // Track Right Controls (No Speed)
        muteButton_right = document.getElementById('mute_right'); soloButton_right = document.getElementById('solo_right'); volumeSlider_right = document.getElementById('volume_right'); volumeValue_right = document.getElementById('volumeValue_right'); delayInput_right = document.getElementById('delay_right'); pitchSlider_right = document.getElementById('pitch_right'); pitchValue_right = document.getElementById('pitchValue_right'); pitchMarkers_right = document.getElementById('pitchMarkers_right');
        // Linking Buttons (No Speed Link)
        linkPitchButton = document.getElementById('linkPitchButton');
        // Global Master Gain
        gainControl = document.getElementById('gainControl'); gainValueDisplay = document.getElementById('gainValue'); gainMarkers = document.getElementById('gainMarkers');
        // ** NEW: Assign Global Speed Elements **
        globalSpeedControl = document.getElementById('globalSpeedControl');
        globalSpeedValue = document.getElementById('globalSpeedValue');
        globalSpeedMarkers = document.getElementById('globalSpeedMarkers');
        // VAD (Left Track Only Controls)
        vadProgressContainer = document.getElementById('vadProgressContainer'); vadProgressBar = document.getElementById('vadProgressBar'); vadThresholdSlider = document.getElementById('vadThreshold'); vadThresholdValueDisplay = document.getElementById('vadThresholdValue'); vadNegativeThresholdSlider = document.getElementById('vadNegativeThreshold'); vadNegativeThresholdValueDisplay = document.getElementById('vadNegativeThresholdValue'); speechRegionsDisplay = document.getElementById('speechRegionsDisplay');
        // Visualizations (Section containers)
        visualizationLeftSection = document.getElementById('visualization_left'); visualizationLeftSpecSection = document.getElementById('visualization_left_spec'); visualizationRightSection = document.getElementById('visualization_right'); visualizationRightSpecSection = document.getElementById('visualization_right_spec');
        // Basic checks
        if (!chooseFileButton_left || !playPauseButton || !seekBar || !gainControl || !globalSpeedControl) console.warn("UIManager: Could not find all required baseline UI elements!"); // Added globalSpeedControl check
        if (!trackControlsSection || !chooseFileButton_right || !multiTrackOptionsDiv) console.warn("UIManager: Could not find multi-track container/control elements!");
        if (!driftValueMsSpan) console.warn("UIManager: Drift display span not found.");
    }

    // --- Slider Marker Positioning ---
    /**
     * Initializes marker positions for all relevant sliders upon load. Includes global speed.
     * @private
     */
    function initializeSliderMarkers() {
        const markerConfigs = [
            {slider: gainControl, markersDiv: gainMarkers}, // Master Gain
            {slider: globalSpeedControl, markersDiv: globalSpeedMarkers }, // ** NEW: Global Speed **
            {slider: pitchSlider_left, markersDiv: pitchMarkers_left}, // Left Pitch
            // Right pitch markers positioned when shown
        ];
        markerConfigs.forEach(config => {
            positionMarkersForSlider(config.slider, config.markersDiv);
        });
    }

    /**
     * Helper to position markers for a given slider based on its min/max and marker data-value.
     * @param {HTMLInputElement | null} slider - The slider element.
     * @param {HTMLDivElement | null} markersDiv - The container div for the markers.
     * @private
     */
    function positionMarkersForSlider(slider, markersDiv) {
        if (!slider || !markersDiv) return;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const range = max - min;
        if (range <= 0) return;
        const markers = markersDiv.querySelectorAll('span[data-value]');
        markers.forEach(span => {
            const value = parseFloat(span.dataset.value);
            if (!isNaN(value)) {
                const percent = ((value - min) / range) * 100;
                span.style.left = `${percent}%`;
            }
        });
    }

    // --- Event Listener Setup ---
    /**
     * Sets up all DOM event listeners for UI interactions. Uses new global speed control.
     * @private
     */
    function setupEventListeners() {
        // File Loading
        chooseFileButton_left?.addEventListener('click', () => { hiddenAudioFile_left?.click(); });
        hiddenAudioFile_left?.addEventListener('change', (e) => { handleFileSelectionEvent(e, 'left'); });
        chooseFileButton_right?.addEventListener('click', () => { hiddenAudioFile_right?.click(); });
        hiddenAudioFile_right?.addEventListener('change', (e) => { handleFileSelectionEvent(e, 'right'); });
        swapTracksButton?.addEventListener('click', () => dispatchUIEvent('audioapp:swapTracksClicked'));
        removeTrackButton_right?.addEventListener('click', () => dispatchUIEvent('audioapp:removeTrackClicked'));

        // Global Playback & Seek
        seekBar?.addEventListener('input', handleSeekBarInput);
        playPauseButton?.addEventListener('click', () => dispatchUIEvent('audioapp:playPauseClicked'));
        jumpBackButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', {seconds: -getJumpTime()}));
        jumpForwardButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', {seconds: getJumpTime()}));

        // Global Controls (Gain & Speed)
        setupSliderListeners(gainControl, gainValueDisplay, 'audioapp:gainChanged', 'gain', 'x');
        gainMarkers?.addEventListener('click', (e) => handleMarkerClick(e, gainControl));
        // ** NEW: Global Speed Listener **
        setupSliderListeners(globalSpeedControl, globalSpeedValue, 'audioapp:globalSpeedChanged', 'speed', 'x');
        globalSpeedMarkers?.addEventListener('click', (e) => handleMarkerClick(e, globalSpeedControl));

        // Track Controls (Setup for both sides - No Speed listeners needed here)
        setupTrackControlListeners('left');
        setupTrackControlListeners('right');

        // Linking Buttons (Only Pitch Link remains)
        linkPitchButton?.addEventListener('click', () => { const isActive = toggleLinkButton(linkPitchButton); dispatchUIEvent('audioapp:linkPitchToggled', {linked: isActive}); });

        // VAD Sliders
        vadThresholdSlider?.addEventListener('input', handleVadSliderInput);
        vadNegativeThresholdSlider?.addEventListener('input', handleVadSliderInput);

        // Global Keydowns
        document.addEventListener('keydown', handleKeyDown);
    }

    /**
     * Helper to set up listeners for a specific track's UI controls (Volume, Delay, Pitch).
     * @param {'left' | 'right'} trackSide - The side ('left' or 'right').
     * @private
     */
    function setupTrackControlListeners(trackSide) {
        const suffix = `_${trackSide}`;
        const volumeSlider = document.getElementById(`volume${suffix}`); const volumeValue = document.getElementById(`volumeValue${suffix}`);
        const delayInput = document.getElementById(`delay${suffix}`);
        const pitchSlider = document.getElementById(`pitch${suffix}`); const pitchValue = document.getElementById(`pitchValue${suffix}`); const pitchMarkers = document.getElementById(`pitchMarkers${suffix}`);
        const muteButton = document.getElementById(`mute${suffix}`); const soloButton = document.getElementById(`solo${suffix}`);

        // Volume
        setupSliderListeners(volumeSlider, volumeValue, `audioapp:volumeChanged${suffix}`, 'volume', '');
        // Delay
        delayInput?.addEventListener('change', (e) => { dispatchUIEvent(`audioapp:delayChanged${suffix}`, {value: e.target.value}); });
        // Pitch
        setupSliderListeners(pitchSlider, pitchValue, `audioapp:pitchChanged${suffix}`, 'pitch', 'x');
        pitchMarkers?.addEventListener('click', (e) => handleMarkerClick(e, pitchSlider));
        // Mute/Solo
        muteButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:muteToggled${suffix}`));
        soloButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:soloToggled${suffix}`));
        // No Speed listener here
    }

    // --- Generic Event Handlers ---
    /** Handles file input changes. */
    function handleFileSelectionEvent(event, trackSide) {
        const file = event.target.files?.[0]; const detail = {file: file, trackId: trackSide}; if (file) { updateFileName(trackSide, file.name); dispatchUIEvent('audioapp:fileSelected', detail); } else { updateFileName(trackSide, ""); } event.target.value = null;
    }
    /** Handles seek bar input. */
    function handleSeekBarInput(e) {
        const target = /** @type {HTMLInputElement} */ (e.target); const fraction = parseFloat(target.value); if (!isNaN(fraction)) { dispatchUIEvent('audioapp:seekBarInput', {fraction: fraction}); }
    }
    /** Generic slider listener setup. */
    function setupSliderListeners(slider, valueDisplay, eventName, detailKey, suffix = '') {
        if (!slider || !valueDisplay) return;
        // Store event name and detail key on the element for handleMarkerClick
        slider.dataset.eventName = eventName;
        slider.dataset.detailKey = detailKey;
        // Set initial display
        const initialValue = parseFloat(slider.value); valueDisplay.textContent = initialValue.toFixed(2) + suffix;
        // Add listener
        slider.addEventListener('input', () => { const value = parseFloat(slider.value); valueDisplay.textContent = value.toFixed(2) + suffix; dispatchUIEvent(eventName, {[detailKey]: value}); });
        // Position markers
        const markersDivId = slider.id.replace(/Slider|Control/i, 'Markers'); const markersDiv = document.getElementById(markersDivId); positionMarkersForSlider(slider, markersDiv);
    }
    /** Handles clicks on slider markers. */
    function handleMarkerClick(event, sliderElement) {
        if (!sliderElement || sliderElement.disabled) return; const target = event.target;
        if (target instanceof HTMLElement && target.tagName === 'SPAN' && target.dataset.value) {
            const value = parseFloat(target.dataset.value);
            if (!isNaN(value)) {
                sliderElement.value = String(value);
                // Dispatch 'input' event to trigger standard listener (updates display, dispatches specific event)
                sliderElement.dispatchEvent(new Event('input', {bubbles: true}));
            }
        }
    }
    /** Handles VAD slider input. */
    function handleVadSliderInput(e) {
        const slider = /** @type {HTMLInputElement} */ (e.target); const value = parseFloat(slider.value); let type = null; if (slider === vadThresholdSlider && vadThresholdValueDisplay) { vadThresholdValueDisplay.textContent = value.toFixed(2); type = 'positive'; } else if (slider === vadNegativeThresholdSlider && vadNegativeThresholdValueDisplay) { vadNegativeThresholdValueDisplay.textContent = value.toFixed(2); type = 'negative'; } if (type) { dispatchUIEvent('audioapp:thresholdChanged', {type: type, value: value}); }
    }
    /** Handles global keydowns. */
    function handleKeyDown(e) {
        const target = e.target; const isBody = target instanceof HTMLBodyElement; const isButton = target instanceof HTMLButtonElement; const isRange = target instanceof HTMLInputElement && target.type === 'range'; if (!isBody && !isButton && !isRange) return; let handled = false; let eventKey = null; switch (e.code) { case 'Space': eventKey = 'Space'; handled = true; break; case 'ArrowLeft': eventKey = 'ArrowLeft'; handled = true; break; case 'ArrowRight': eventKey = 'ArrowRight'; handled = true; break; } if (eventKey) { dispatchUIEvent('audioapp:keyPressed', {key: eventKey}); } if (handled) { e.preventDefault(); }
    }
    /** Toggles link button visual state. */
    function toggleLinkButton(button) {
        if (!button) return false; const isActive = !button.classList.contains('active'); if (isActive) { button.classList.add('active'); button.innerHTML = '🔗'; button.title = button.title.replace('Link', 'Unlink'); } else { button.classList.remove('active'); button.innerHTML = '🚫'; button.title = button.title.replace('Unlink', 'Link'); } return isActive;
    }
    /** Dispatches a custom UI event. */
    function dispatchUIEvent(eventName, detail = {}) {
        document.dispatchEvent(new CustomEvent(eventName, {detail: detail}));
    }

    // --- Public Methods for Updating UI ---

    /**
     * Updates all UI elements associated with a specific side ('left' or 'right') based on track data.
     * Excludes speed controls, which are now global.
     * @param {'left' | 'right'} side The UI side to update.
     * @param {TrackState | null} trackData The data for the track currently assigned to this side, or null if none.
     * @public
     */
    function refreshTrackUI(side, trackData) {
         console.log(`UIManager: Refreshing UI for side '${side}' with data:`, trackData);
         const suffix = `_${side}`;
         const fileDisplay = document.getElementById(`fileNameDisplay${suffix}`); const infoDisplay = document.getElementById(`fileInfo${suffix}`);
         const volSlider = document.getElementById(`volume${suffix}`); const volValue = document.getElementById(`volumeValue${suffix}`);
         const delayInputEl = document.getElementById(`delay${suffix}`);
         const pitchSliderEl = document.getElementById(`pitch${suffix}`); const pitchValueEl = document.getElementById(`pitchValue${suffix}`);
         const muteButtonEl = document.getElementById(`mute${suffix}`); const soloButtonEl = document.getElementById(`solo${suffix}`);
         // Speed elements are no longer here

         if (trackData && trackData.audioBuffer) { // Track exists and is loaded
             if (fileDisplay) { fileDisplay.textContent = trackData.file?.name || "Loaded"; fileDisplay.title = trackData.file?.name || "Loaded"; }
             if (infoDisplay) { infoDisplay.textContent = `Ready (${trackData.audioBuffer.duration.toFixed(2)}s)`; infoDisplay.title = infoDisplay.textContent; }
             setSliderValue(volSlider, trackData.parameters.volume, volValue, '');
             setDelayValue(side, trackData.parameters.offsetSeconds);
             // No Speed update here
             setSliderValue(pitchSliderEl, trackData.parameters.pitch, pitchValueEl, 'x');
             setMuteButtonState(muteButtonEl, trackData.parameters.isMuted);
             setSoloButtonState(soloButtonEl, trackData.parameters.isSoloed);
             enableTrackControls(side, trackData.isReady);
         } else { // No track assigned or track not loaded
             if (fileDisplay) { fileDisplay.textContent = "None"; fileDisplay.title = "None"; }
             if (infoDisplay) { infoDisplay.textContent = (side === 'left' ? "No file selected." : ""); infoDisplay.title = infoDisplay.textContent; }
             setSliderValue(volSlider, 1.0, volValue, '');
             setDelayValue(side, 0.0);
             // No Speed update here
             setSliderValue(pitchSliderEl, 1.0, pitchValueEl, 'x');
             setMuteButtonState(muteButtonEl, false);
             setSoloButtonState(soloButtonEl, false);
             enableTrackControls(side, false);
         }
    }

    /**
     * Resets UI to initial single-track state. Includes resetting the global speed control.
     * @public
     */
    function resetUI() {
        console.log("UIManager: Resetting UI to single-track state");
        showMultiTrackUI(false); // Hide multi-track elements

        // Reset Global controls
        setPlayButtonState(false);
        updateTimeDisplay(0, 0); updateSeekBar(0); updateDriftDisplay(0);
        setSliderValue(gainControl, 1.0, gainValueDisplay, 'x'); // Master Gain
        setSliderValue(globalSpeedControl, 1.0, globalSpeedValue, 'x'); // ** NEW: Reset Global Speed **
        setLinkButtonState(linkPitchButton, true); // Reset Pitch Link (Speed link gone)
        if (jumpTimeInput) jumpTimeInput.value = "5";

        // Reset VAD display
        setSpeechRegionsText("None"); updateVadDisplay(0.5, 0.35, true); showVadProgress(false); updateVadProgress(0);

        // Use refreshTrackUI to reset both sides
        refreshTrackUI('left', null);
        refreshTrackUI('right', null);

        // Disable global/track controls initially
        enablePlaybackControls(false); enableSeekBar(false); enableVadControls(false);
        // enableTrackControls is handled by refreshTrackUI

        // Reset multi-track button states
        enableRightTrackLoadButton(false); enableSwapButton(false); enableRemoveButton(false);

        isMultiTrackUIVisible = false;
    }

    /** Helper to set slider value and update its display. */
    function setSliderValue(slider, value, displayElement, suffix = '') {
        if (slider) slider.value = String(value);
        if (displayElement) displayElement.textContent = Number(value).toFixed(2) + suffix;
    }
    /** Helper to set link button state. */
    function setLinkButtonState(button, isActive) {
        // Only operate on pitch link now
        if (!button || button !== linkPitchButton) return;
        if (isActive) { if (!button.classList.contains('active')) toggleLinkButton(button); }
        else { if (button.classList.contains('active')) toggleLinkButton(button); }
    }
    /** Updates filename display for a side. */
    function updateFileName(trackSide, text) {
        const display = trackSide === 'left' ? fileNameDisplay_left : fileNameDisplay_right; if (display) { display.textContent = text; display.title = text; }
    }
    /** Updates file info display for a side. */
    function setFileInfo(trackSide, text) {
        const info = trackSide === 'left' ? fileInfo_left : fileInfo_right; if (info) { info.textContent = text; info.title = text; }
    }
    /** Sets Play/Pause button text. */
    function setPlayButtonState(isPlaying) {
        if (playPauseButton) playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
    }
    /** Updates time display. */
    function updateTimeDisplay(currentTime, duration) {
        if (timeDisplay && Utils) { timeDisplay.textContent = `${Utils.formatTime(currentTime)} / ${Utils.formatTime(duration)}`; } else if (timeDisplay) { timeDisplay.textContent = `Err / Err`; }
    }
    /** Updates seek bar position. */
    function updateSeekBar(fraction) {
        if (seekBar) { const clampedFraction = Math.max(0, Math.min(1, fraction)); if (Math.abs(parseFloat(seekBar.value) - clampedFraction) > 1e-3) { seekBar.value = String(clampedFraction); } }
    }
    /** Updates drift display. */
    function updateDriftDisplay(driftMs) {
        if (driftValueMsSpan) { driftValueMsSpan.textContent = driftMs.toFixed(1); }
    }
    /** Updates VAD speech regions text. */
    function setSpeechRegionsText(regionsOrText) {
        // Functionality remains, element might be removed later depending on VAD UI decisions
        if (!speechRegionsDisplay) return; if (typeof regionsOrText === 'string') { speechRegionsDisplay.textContent = regionsOrText; } else if (Array.isArray(regionsOrText)) { if (regionsOrText.length > 0) { speechRegionsDisplay.textContent = regionsOrText.map(r => `Start: ${r.start.toFixed(2)}s, End: ${r.end.toFixed(2)}s`).join('\n'); } else { speechRegionsDisplay.textContent = "No speech detected."; } } else { speechRegionsDisplay.textContent = "None"; }
    }
    /** Updates VAD threshold slider display. */
    function updateVadDisplay(positive, negative, isNA = false) {
        if (isNA) { if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = "N/A"; if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = "N/A"; if (vadThresholdSlider) vadThresholdSlider.value = "0.5"; if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = "0.35"; } else { if (vadThresholdSlider) vadThresholdSlider.value = String(positive); if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = positive.toFixed(2); if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = String(negative); if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = negative.toFixed(2); }
    }

    // --- Control Enabling/Disabling ---
    /** Enables/disables global Play/Pause, Jump controls. */
    function enablePlaybackControls(enable) {
        console.log(`UIManager: Setting Playback Controls enabled = ${enable}`); if (playPauseButton) playPauseButton.disabled = !enable; if (jumpBackButton) jumpBackButton.disabled = !enable; if (jumpForwardButton) jumpForwardButton.disabled = !enable;
        // ** NEW: Also enable/disable Global Speed/Gain ** (Assumption: enable these with playback controls)
        if (gainControl) gainControl.disabled = !enable;
        if (globalSpeedControl) globalSpeedControl.disabled = !enable;
    }
    /** Enables/disables the main seek bar. */
    function enableSeekBar(enable) {
        console.log(`UIManager: Setting Seek Bar enabled = ${enable}`); if (seekBar) seekBar.disabled = !enable;
    }
    /** Enables/disables track-specific controls for a UI side (Volume, Delay, Pitch, Mute, Solo). */
    function enableTrackControls(trackSide, enable) {
        const suffix = `_${trackSide}`;
        const controls = [ document.getElementById(`mute${suffix}`), document.getElementById(`solo${suffix}`), document.getElementById(`volume${suffix}`), document.getElementById(`delay${suffix}`), document.getElementById(`pitch${suffix}`), ]; // Removed speed
        controls.forEach(el => { if (el) el.disabled = !enable; });

        // Disable pitch linking button if EITHER track's controls are disabled when in multi-track mode
        if (isMultiTrackUIVisible) {
            const leftPitchDisabled = document.getElementById(`pitch_left`)?.disabled ?? true;
            const rightPitchDisabled = document.getElementById(`pitch_right`)?.disabled ?? true;
            if (linkPitchButton) linkPitchButton.disabled = (leftPitchDisabled || rightPitchDisabled);
        } else { // Disable link button in single track mode
            if (linkPitchButton) linkPitchButton.disabled = true;
        }
    }
    /** Enables/disables the 'Load Right Track...' button. */
    function enableRightTrackLoadButton(enable) {
        console.log(`UIManager: enableRightTrackLoadButton called with enable=${enable}. Button element:`, chooseFileButton_right); if (chooseFileButton_right) { chooseFileButton_right.disabled = !enable; console.log(`UIManager: Set chooseFileButton_right.disabled = ${!enable}`); } else { console.error("UIManager: enableRightTrackLoadButton - chooseFileButton_right element not found!"); }
    }
    /** Enables/disables the 'Swap L/R' button. */
    function enableSwapButton(enable) {
        if (swapTracksButton) swapTracksButton.disabled = !enable;
    }
    /** Enables/disables the 'Remove Right' button. */
    function enableRemoveButton(enable) {
        if (removeTrackButton_right) removeTrackButton_right.disabled = !enable;
    }
    /** Enables/disables VAD threshold sliders. */
    function enableVadControls(enable) {
        if (vadThresholdSlider) vadThresholdSlider.disabled = !enable; if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.disabled = !enable; if (!enable) { updateVadDisplay(0.5, 0.35, true); }
    }

    // --- Visibility Control ---
    /** Shows/hides UI elements specific to multi-track mode. */
    function showMultiTrackUI(show) {
        console.log(`UIManager: Setting multi-track UI visibility to ${show}`);
        const displayStyle = show ? '' : 'none';
        if (trackControlsSection) trackControlsSection.style.display = displayStyle;
        if (visualizationRightSection) visualizationRightSection.style.display = displayStyle;
        if (visualizationRightSpecSection) visualizationRightSpecSection.style.display = displayStyle;
        // Individual file load elements are part of the main file loader section, always visible.
        // Swap/Remove buttons visibility controlled here:
        if (swapTracksButton) swapTracksButton.style.display = show ? '' : 'none';
        if (removeTrackButton_right) removeTrackButton_right.style.display = show ? '' : 'none';

        if (show) { setTimeout(() => { console.log("UIManager: Positioning markers for right track sliders."); /*positionMarkersForSlider(speedSlider_right, speedMarkers_right);*/ positionMarkersForSlider(pitchSlider_right, pitchMarkers_right); }, 0); } // Removed speed marker positioning
        isMultiTrackUIVisible = show;
    }

    // --- Getters / Parsers ---
    /** Gets jump time value. */
    function getJumpTime() {
        return parseFloat(jumpTimeInput?.value) || 5;
    }
    /** Gets delay value for a side. */
    function getDelaySeconds(trackSide) {
        const input = trackSide === 'left' ? delayInput_left : delayInput_right; if (!input) return 0; return parseDelayInput(input.value);
    }
    /** Sets delay input value for a side. */
    function setDelayValue(trackSide, seconds) {
        const input = trackSide === 'left' ? delayInput_left : delayInput_right; if (!input) return; input.value = formatDelaySeconds(seconds);
    }
    /** Parses delay input string. */
    function parseDelayInput(valueStr) {
        if (!valueStr) return 0; valueStr = valueStr.trim(); let totalSeconds = 0; if (valueStr.includes(':')) { const parts = valueStr.split(':'); if (parts.length === 2) { const minutes = parseFloat(parts[0]); const secondsMs = parseFloat(parts[1]); if (!isNaN(minutes) && !isNaN(secondsMs)) { totalSeconds = (minutes * 60) + secondsMs; } } } else { totalSeconds = parseFloat(valueStr); } return isNaN(totalSeconds) || totalSeconds < 0 ? 0 : totalSeconds;
    }
    /** Formats seconds to delay string. */
    function formatDelaySeconds(seconds) {
        if (isNaN(seconds) || seconds < 0) seconds = 0; return seconds.toFixed(3);
    }


    // --- VAD Progress Bar Functions ---
    /** Updates VAD progress bar percentage. */
    function updateVadProgress(percentage) {
        if (!vadProgressBar) return; const clampedPercentage = Math.max(0, Math.min(100, percentage)); vadProgressBar.style.width = `${clampedPercentage}%`;
    }
    /** Shows/hides VAD progress bar container. */
    function showVadProgress(show) {
        if (!vadProgressContainer) return; vadProgressContainer.style.display = show ? 'block' : 'none';
    }

    // --- Mute/Solo Button State Placeholders ---
    /** Sets the visual state of a Mute button. */
    function setMuteButtonState(button, isMuted) {
        if(!button) return; if(isMuted) { button.classList.add('active'); } else { button.classList.remove('active'); }
    }
    /** Sets the visual state of a Solo button. */
    function setSoloButtonState(button, isSoloed) {
        if(!button) return; if(isSoloed) { button.classList.add('active'); } else { button.classList.remove('active'); }
    }


    // --- Public Interface ---
    return {
        init: init,
        resetUI: resetUI,
        refreshTrackUI: refreshTrackUI,
        // File Info
        updateFileName: updateFileName, setFileInfo: setFileInfo,
        // Multi-track UI Control
        showMultiTrackUI: showMultiTrackUI, enableRightTrackLoadButton: enableRightTrackLoadButton, enableSwapButton: enableSwapButton, enableRemoveButton: enableRemoveButton,
        // Global Controls
        setPlayButtonState: setPlayButtonState, updateTimeDisplay: updateTimeDisplay, updateSeekBar: updateSeekBar, updateDriftDisplay: updateDriftDisplay, enablePlaybackControls: enablePlaybackControls, enableSeekBar: enableSeekBar, getJumpTime: getJumpTime,
        // Track Controls
        setLinkButtonState: setLinkButtonState, enableTrackControls: enableTrackControls, setMuteButtonState: setMuteButtonState, setSoloButtonState: setSoloButtonState, setDelayValue: setDelayValue, parseDelayInput: parseDelayInput, formatDelaySeconds: formatDelaySeconds, setSliderValue: setSliderValue,
        // VAD Controls/Display
        setSpeechRegionsText: setSpeechRegionsText, updateVadDisplay: updateVadDisplay, enableVadControls: enableVadControls, updateVadProgress: updateVadProgress, showVadProgress: showVadProgress
    };
})();
// --- /vibe-player/js/uiManager.js ---