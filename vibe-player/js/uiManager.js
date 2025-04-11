// --- /vibe-player/js/uiManager.js ---
// Handles DOM manipulation, UI event listeners, and dispatches UI events.
// REFACTORED to include a refreshTrackUI function for track indirection.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.uiManager = (function () {
    'use strict';

    // === Module Dependencies ===
    const Utils = AudioApp.Utils; // Assumed loaded

    // --- DOM Element References ---
    // (Element references remain the same as before)
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
    // Track Left Controls
    let muteButton_left, soloButton_left, volumeSlider_left, volumeValue_left, delayInput_left, speedSlider_left, speedValue_left, speedMarkers_left, pitchSlider_left, pitchValue_left, pitchMarkers_left;
    // Track Right Controls
    let muteButton_right, soloButton_right, volumeSlider_right, volumeValue_right, delayInput_right, speedSlider_right, speedValue_right, speedMarkers_right, pitchSlider_right, pitchValue_right, pitchMarkers_right;
    // Linking Buttons
    let linkSpeedButton, linkPitchButton;
    // Global Master Gain
    let gainControl, gainValueDisplay, gainMarkers;
    // VAD (Still Left Track Only UI Controls)
    let vadProgressContainer, vadProgressBar, vadThresholdSlider, vadThresholdValueDisplay, vadNegativeThresholdSlider, vadNegativeThresholdValueDisplay, speechRegionsDisplay;
    // Visualizations (Containers)
    let visualizationLeftSection, visualizationLeftSpecSection, visualizationRightSection, visualizationRightSpecSection;

    // --- State ---
    let isMultiTrackUIVisible = false;

    // --- Initialization ---
    /** @public Initializes the UI Manager */
    function init() {
        console.log("UIManager: Initializing...");
        if (!Utils) { console.error("UIManager: CRITICAL - AudioApp.Utils not found!"); return; }
        assignDOMElements();
        initializeSliderMarkers();
        setupEventListeners();
        resetUI(); // Resets to initial single-track state using refresh logic
        console.log("UIManager: Initialized.");
    }

    // --- DOM Element Assignment ---
    /** @private Assigns DOM elements to variables. */
    function assignDOMElements() {
        // File Handling - Left
        chooseFileButton_left = document.getElementById('chooseFileButton_left'); hiddenAudioFile_left = document.getElementById('hiddenAudioFile_left'); fileNameDisplay_left = document.getElementById('fileNameDisplay_left'); fileInfo_left = document.getElementById('fileInfo_left');
        // File Handling - Right & Multi-Track Options
        multiTrackOptionsDiv = document.getElementById('multi-track-options'); chooseFileButton_right = document.getElementById('chooseFileButton_right'); hiddenAudioFile_right = document.getElementById('hiddenAudioFile_right'); fileNameDisplay_right = document.getElementById('fileNameDisplay_right'); fileInfo_right = document.getElementById('fileInfo_right'); swapTracksButton = document.getElementById('swapTracksButton'); removeTrackButton_right = document.getElementById('removeTrackButton_right');
        // Global Playback
        playPauseButton = document.getElementById('playPause'); jumpBackButton = document.getElementById('jumpBack'); jumpForwardButton = document.getElementById('jumpForward'); jumpTimeInput = document.getElementById('jumpTime'); seekBar = document.getElementById('seekBar'); timeDisplay = document.getElementById('timeDisplay'); driftValueMsSpan = document.getElementById('driftValueMs');
        // Track Controls Section Container
        trackControlsSection = document.getElementById('track-controls');
        // Track Left Controls
        muteButton_left = document.getElementById('mute_left'); soloButton_left = document.getElementById('solo_left'); volumeSlider_left = document.getElementById('volume_left'); volumeValue_left = document.getElementById('volumeValue_left'); delayInput_left = document.getElementById('delay_left'); speedSlider_left = document.getElementById('speed_left'); speedValue_left = document.getElementById('speedValue_left'); speedMarkers_left = document.getElementById('speedMarkers_left'); pitchSlider_left = document.getElementById('pitch_left'); pitchValue_left = document.getElementById('pitchValue_left'); pitchMarkers_left = document.getElementById('pitchMarkers_left');
        // Track Right Controls
        muteButton_right = document.getElementById('mute_right'); soloButton_right = document.getElementById('solo_right'); volumeSlider_right = document.getElementById('volume_right'); volumeValue_right = document.getElementById('volumeValue_right'); delayInput_right = document.getElementById('delay_right'); speedSlider_right = document.getElementById('speed_right'); speedValue_right = document.getElementById('speedValue_right'); speedMarkers_right = document.getElementById('speedMarkers_right'); pitchSlider_right = document.getElementById('pitch_right'); pitchValue_right = document.getElementById('pitchValue_right'); pitchMarkers_right = document.getElementById('pitchMarkers_right');
        // Linking Buttons
        linkSpeedButton = document.getElementById('linkSpeedButton'); linkPitchButton = document.getElementById('linkPitchButton');
        // Global Master Gain
        gainControl = document.getElementById('gainControl'); gainValueDisplay = document.getElementById('gainValue'); gainMarkers = document.getElementById('gainMarkers');
        // VAD (Left Track Only Controls)
        vadProgressContainer = document.getElementById('vadProgressContainer'); vadProgressBar = document.getElementById('vadProgressBar'); vadThresholdSlider = document.getElementById('vadThreshold'); vadThresholdValueDisplay = document.getElementById('vadThresholdValue'); vadNegativeThresholdSlider = document.getElementById('vadNegativeThreshold'); vadNegativeThresholdValueDisplay = document.getElementById('vadNegativeThresholdValue'); speechRegionsDisplay = document.getElementById('speechRegionsDisplay'); // This element might be removed
        // Visualizations (Section containers)
        visualizationLeftSection = document.getElementById('visualization_left'); visualizationLeftSpecSection = document.getElementById('visualization_left_spec'); visualizationRightSection = document.getElementById('visualization_right'); visualizationRightSpecSection = document.getElementById('visualization_right_spec');
        // Basic checks
        if (!chooseFileButton_left || !playPauseButton || !seekBar || !gainControl) console.warn("UIManager: Could not find all required baseline UI elements!");
        if (!trackControlsSection || !chooseFileButton_right || !multiTrackOptionsDiv) console.warn("UIManager: Could not find multi-track container/control elements!");
        if (!driftValueMsSpan) console.warn("UIManager: Drift display span not found.");
    }

    // --- Slider Marker Positioning ---
    /** @private Initializes markers for initially visible sliders. */
    function initializeSliderMarkers() { /* ... (Implementation unchanged) ... */
        const markerConfigs = [ {slider: speedSlider_left, markersDiv: speedMarkers_left}, {slider: pitchSlider_left, markersDiv: pitchMarkers_left}, {slider: gainControl, markersDiv: gainMarkers}, ]; markerConfigs.forEach(config => { positionMarkersForSlider(config.slider, config.markersDiv); });
    }
    /** @private Helper to position markers for a given slider. */
    function positionMarkersForSlider(slider, markersDiv) { /* ... (Implementation unchanged) ... */
        if (!slider || !markersDiv) return; const min = parseFloat(slider.min); const max = parseFloat(slider.max); const range = max - min; if (range <= 0) return; const markers = markersDiv.querySelectorAll('span[data-value]'); markers.forEach(span => { const value = parseFloat(span.dataset.value); if (!isNaN(value)) { const percent = ((value - min) / range) * 100; span.style.left = `${percent}%`; } });
    }

    // --- Event Listener Setup ---
    /** @private Sets up all DOM event listeners. */
    function setupEventListeners() {
        // File Loading
        chooseFileButton_left?.addEventListener('click', () => { hiddenAudioFile_left?.click(); });
        hiddenAudioFile_left?.addEventListener('change', (e) => { handleFileSelectionEvent(e, 'left'); });
        chooseFileButton_right?.addEventListener('click', () => { hiddenAudioFile_right?.click(); });
        hiddenAudioFile_right?.addEventListener('change', (e) => { handleFileSelectionEvent(e, 'right'); });
        swapTracksButton?.addEventListener('click', () => dispatchUIEvent('audioapp:swapTracksClicked'));
        removeTrackButton_right?.addEventListener('click', () => dispatchUIEvent('audioapp:removeTrackClicked'));
        // Global Playback
        seekBar?.addEventListener('input', handleSeekBarInput);
        playPauseButton?.addEventListener('click', () => dispatchUIEvent('audioapp:playPauseClicked'));
        jumpBackButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', {seconds: -getJumpTime()}));
        jumpForwardButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', {seconds: getJumpTime()}));
        // Global Master Gain
        setupSliderListeners(gainControl, gainValueDisplay, 'audioapp:gainChanged', 'gain', 'x');
        gainMarkers?.addEventListener('click', (e) => handleMarkerClick(e, gainControl));
        // Track Controls (Setup for both sides)
        setupTrackControlListeners('left');
        setupTrackControlListeners('right');
        // Linking Buttons
        linkSpeedButton?.addEventListener('click', () => { const isActive = toggleLinkButton(linkSpeedButton); dispatchUIEvent('audioapp:linkSpeedToggled', {linked: isActive}); });
        linkPitchButton?.addEventListener('click', () => { const isActive = toggleLinkButton(linkPitchButton); dispatchUIEvent('audioapp:linkPitchToggled', {linked: isActive}); });
        // VAD Sliders (Still apply only to Left track recalc for now)
        vadThresholdSlider?.addEventListener('input', handleVadSliderInput);
        vadNegativeThresholdSlider?.addEventListener('input', handleVadSliderInput);
        // Global Keydowns
        document.addEventListener('keydown', handleKeyDown);
    }

    /** @private Helper to set up listeners for a specific track's UI controls */
    function setupTrackControlListeners(trackSide) { // trackSide is 'left' or 'right'
        // Find elements based on side suffix
        const volumeSlider = document.getElementById(`volume_${trackSide}`); const volumeValue = document.getElementById(`volumeValue_${trackSide}`); const delayInput = document.getElementById(`delay_${trackSide}`); const speedSlider = document.getElementById(`speed_${trackSide}`); const speedValue = document.getElementById(`speedValue_${trackSide}`); const speedMarkers = document.getElementById(`speedMarkers_${trackSide}`); const pitchSlider = document.getElementById(`pitch_${trackSide}`); const pitchValue = document.getElementById(`pitchValue_${trackSide}`); const pitchMarkers = document.getElementById(`pitchMarkers_${trackSide}`); const muteButton = document.getElementById(`mute_${trackSide}`); const soloButton = document.getElementById(`solo_${trackSide}`);
        // Volume
        setupSliderListeners(volumeSlider, volumeValue, `audioapp:volumeChanged_${trackSide}`, 'volume', '');
        // Delay
        delayInput?.addEventListener('change', (e) => { dispatchUIEvent(`audioapp:delayChanged_${trackSide}`, {value: e.target.value}); });
        // Speed
        setupSliderListeners(speedSlider, speedValue, `audioapp:speedChanged_${trackSide}`, 'speed', 'x');
        speedMarkers?.addEventListener('click', (e) => handleMarkerClick(e, speedSlider));
        // Pitch
        setupSliderListeners(pitchSlider, pitchValue, `audioapp:pitchChanged_${trackSide}`, 'pitch', 'x');
        pitchMarkers?.addEventListener('click', (e) => handleMarkerClick(e, pitchSlider));
        // Mute/Solo (Dispatch events, app.js handles logic)
        muteButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:muteToggled_${trackSide}`));
        soloButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:soloToggled_${trackSide}`));
    }

    // --- Generic Event Handlers ---
    /** @private Handles file input changes */
    function handleFileSelectionEvent(event, trackSide) { /* ... (Implementation unchanged) ... */
        const file = event.target.files?.[0]; const detail = {file: file, trackId: trackSide}; if (file) { updateFileName(trackSide, file.name); dispatchUIEvent('audioapp:fileSelected', detail); } else { updateFileName(trackSide, ""); } event.target.value = null;
    }
    /** @private Handles seek bar input */
    function handleSeekBarInput(e) { /* ... (Implementation unchanged) ... */
        const target = /** @type {HTMLInputElement} */ (e.target); const fraction = parseFloat(target.value); if (!isNaN(fraction)) { dispatchUIEvent('audioapp:seekBarInput', {fraction: fraction}); }
    }
    /** @private Generic slider listener setup */
    function setupSliderListeners(slider, valueDisplay, eventName, detailKey, suffix = '') { /* ... (Implementation unchanged) ... */
        if (!slider || !valueDisplay) return; const initialValue = parseFloat(slider.value); valueDisplay.textContent = initialValue.toFixed(2) + suffix; slider.addEventListener('input', () => { const value = parseFloat(slider.value); valueDisplay.textContent = value.toFixed(2) + suffix; dispatchUIEvent(eventName, {[detailKey]: value}); }); const markersDivId = slider.id.replace(/Slider|Control/i, 'Markers'); const markersDiv = document.getElementById(markersDivId); positionMarkersForSlider(slider, markersDiv);
    }
    /** @private Handles clicks on slider markers */
    function handleMarkerClick(event, sliderElement) { /* ... (Implementation unchanged) ... */
        if (!sliderElement || sliderElement.disabled) return; const target = event.target; if (target instanceof HTMLElement && target.tagName === 'SPAN' && target.dataset.value) { const value = parseFloat(target.dataset.value); if (!isNaN(value)) { sliderElement.value = String(value); sliderElement.dispatchEvent(new Event('input', {bubbles: true})); const eventName = sliderElement.dataset.eventName; const detailKey = sliderElement.dataset.detailKey; if (eventName && detailKey) { dispatchUIEvent(eventName, {[detailKey]: value}); } } }
    }
    /** @private Handles VAD slider input */
    function handleVadSliderInput(e) { /* ... (Implementation unchanged, still controls left track VAD recalc) ... */
        const slider = /** @type {HTMLInputElement} */ (e.target); const value = parseFloat(slider.value); let type = null; if (slider === vadThresholdSlider && vadThresholdValueDisplay) { vadThresholdValueDisplay.textContent = value.toFixed(2); type = 'positive'; } else if (slider === vadNegativeThresholdSlider && vadNegativeThresholdValueDisplay) { vadNegativeThresholdValueDisplay.textContent = value.toFixed(2); type = 'negative'; } if (type) { dispatchUIEvent('audioapp:thresholdChanged', {type: type, value: value}); }
    }
    /** @private Handles global keydowns */
    function handleKeyDown(e) { /* ... (Implementation unchanged) ... */
        const target = e.target; const isBody = target instanceof HTMLBodyElement; const isButton = target instanceof HTMLButtonElement; const isRange = target instanceof HTMLInputElement && target.type === 'range'; if (!isBody && !isButton && !isRange) return; let handled = false; let eventKey = null; switch (e.code) { case 'Space': eventKey = 'Space'; handled = true; break; case 'ArrowLeft': eventKey = 'ArrowLeft'; handled = true; break; case 'ArrowRight': eventKey = 'ArrowRight'; handled = true; break; } if (eventKey) { dispatchUIEvent('audioapp:keyPressed', {key: eventKey}); } if (handled) { e.preventDefault(); }
    }
    /** @private Toggles link button visual state */
    function toggleLinkButton(button) { /* ... (Implementation unchanged) ... */
        if (!button) return false; const isActive = !button.classList.contains('active'); if (isActive) { button.classList.add('active'); button.innerHTML = '🔗'; button.title = button.title.replace('Link', 'Unlink'); } else { button.classList.remove('active'); button.innerHTML = '🚫'; button.title = button.title.replace('Unlink', 'Link'); } return isActive;
    }
    /** @private Dispatches a custom UI event */
    function dispatchUIEvent(eventName, detail = {}) { /* ... (Implementation unchanged) ... */
        document.dispatchEvent(new CustomEvent(eventName, {detail: detail}));
    }


    // --- Public Methods for Updating UI ---

    /**
     * Updates all UI elements associated with a specific side ('left' or 'right')
     * based on the provided track data (or lack thereof).
     * Called by app.js after swaps or potentially during initialization/reset.
     * @param {'left' | 'right'} side The UI side to update.
     * @param {TrackState | null} trackData The data for the track currently assigned to this side, or null if none.
     * @public NEW
     */
    function refreshTrackUI(side, trackData) {
         console.log(`UIManager: Refreshing UI for side '${side}' with data:`, trackData);

         const suffix = `_${side}`;
         const fileDisplay = document.getElementById(`fileNameDisplay${suffix}`);
         const infoDisplay = document.getElementById(`fileInfo${suffix}`);
         const volSlider = document.getElementById(`volume${suffix}`);
         const volValue = document.getElementById(`volumeValue${suffix}`);
         const delayInputEl = document.getElementById(`delay${suffix}`);
         const speedSliderEl = document.getElementById(`speed${suffix}`);
         const speedValueEl = document.getElementById(`speedValue${suffix}`);
         const pitchSliderEl = document.getElementById(`pitch${suffix}`);
         const pitchValueEl = document.getElementById(`pitchValue${suffix}`);
         const muteButtonEl = document.getElementById(`mute${suffix}`);
         const soloButtonEl = document.getElementById(`solo${suffix}`);
         // Add other controls as needed

         if (trackData && trackData.audioBuffer) { // Track exists and is loaded
             // Update File Info
             if (fileDisplay) { fileDisplay.textContent = trackData.file?.name || "Loaded"; fileDisplay.title = trackData.file?.name || "Loaded"; }
             if (infoDisplay) { infoDisplay.textContent = `Ready (${trackData.audioBuffer.duration.toFixed(2)}s)`; infoDisplay.title = infoDisplay.textContent; }

             // Update Controls based on trackData.parameters
             setSliderValue(volSlider, trackData.parameters.volume, volValue, '');
             setDelayValue(side, trackData.parameters.offsetSeconds); // Use dedicated function
             setSliderValue(speedSliderEl, trackData.parameters.speed, speedValueEl, 'x');
             setSliderValue(pitchSliderEl, trackData.parameters.pitch, pitchValueEl, 'x');
             setMuteButtonState(muteButtonEl, trackData.parameters.isMuted); // Placeholder
             setSoloButtonState(soloButtonEl, trackData.parameters.isSoloed); // Placeholder

             // Enable Controls (if track is ready)
             enableTrackControls(side, trackData.isReady);

         } else { // No track assigned or track not loaded
             // Reset File Info
             if (fileDisplay) { fileDisplay.textContent = "None"; fileDisplay.title = "None"; }
             if (infoDisplay) { infoDisplay.textContent = (side === 'left' ? "No file selected." : ""); infoDisplay.title = infoDisplay.textContent; } // Only show 'no file' for left

             // Reset Controls to Defaults and Disable
             setSliderValue(volSlider, 1.0, volValue, '');
             setDelayValue(side, 0.0);
             setSliderValue(speedSliderEl, 1.0, speedValueEl, 'x');
             setSliderValue(pitchSliderEl, 1.0, pitchValueEl, 'x');
             setMuteButtonState(muteButtonEl, false);
             setSoloButtonState(soloButtonEl, false);
             enableTrackControls(side, false);
         }
    }


    /** @public Resets UI to initial single-track state */
    function resetUI() {
        console.log("UIManager: Resetting UI to single-track state");
        showMultiTrackUI(false); // Hide multi-track elements first

        // Reset Global controls
        setPlayButtonState(false);
        updateTimeDisplay(0, 0); updateSeekBar(0); updateDriftDisplay(0);
        setSliderValue(gainControl, 1.0, gainValueDisplay, 'x'); // Master Gain
        setLinkButtonState(linkSpeedButton, true); setLinkButtonState(linkPitchButton, true); // Reset Links
        if (jumpTimeInput) jumpTimeInput.value = "5"; // Reset Jump time

        // Reset VAD display (for Left track VAD controls)
        setSpeechRegionsText("None"); updateVadDisplay(0.5, 0.35, true); showVadProgress(false); updateVadProgress(0);

        // Use refreshTrackUI to reset both sides to their initial/empty state
        refreshTrackUI('left', null);
        refreshTrackUI('right', null);

        // Disable global controls initially
        enablePlaybackControls(false); enableSeekBar(false); enableVadControls(false);

        // Reset multi-track button states explicitly
        enableRightTrackLoadButton(false); enableSwapButton(false); enableRemoveButton(false);

        isMultiTrackUIVisible = false;
    }

    /** @private Helper to set slider value and update its display */
    function setSliderValue(slider, value, displayElement, suffix = '') { /* ... (Implementation unchanged) ... */
        if (slider) slider.value = String(value); if (displayElement) displayElement.textContent = Number(value).toFixed(2) + suffix;
    }
    /** @private Helper to set link button state */
    function setLinkButtonState(button, isActive) { /* ... (Implementation unchanged) ... */
        if (!button) return; if (isActive) { if (!button.classList.contains('active')) toggleLinkButton(button); } else { if (button.classList.contains('active')) toggleLinkButton(button); }
    }
    /** @public Updates filename display for a side */
    function updateFileName(trackSide, text) { /* ... (Implementation unchanged) ... */
        const display = trackSide === 'left' ? fileNameDisplay_left : fileNameDisplay_right; if (display) { display.textContent = text; display.title = text; }
    }
    /** @public Updates file info display for a side */
    function setFileInfo(trackSide, text) { /* ... (Implementation unchanged) ... */
        const info = trackSide === 'left' ? fileInfo_left : fileInfo_right; if (info) { info.textContent = text; info.title = text; }
    }
    /** @public Sets Play/Pause button text */
    function setPlayButtonState(isPlaying) { /* ... (Implementation unchanged) ... */
        if (playPauseButton) playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
    }
    /** @public Updates time display */
    function updateTimeDisplay(currentTime, duration) { /* ... (Implementation unchanged) ... */
        if (timeDisplay && Utils) { timeDisplay.textContent = `${Utils.formatTime(currentTime)} / ${Utils.formatTime(duration)}`; } else if (timeDisplay) { timeDisplay.textContent = `Err / Err`; }
    }
    /** @public Updates seek bar position */
    function updateSeekBar(fraction) { /* ... (Implementation unchanged) ... */
        if (seekBar) { const clampedFraction = Math.max(0, Math.min(1, fraction)); if (Math.abs(parseFloat(seekBar.value) - clampedFraction) > 1e-3) { seekBar.value = String(clampedFraction); } }
    }
    /** @public Updates drift display */
    function updateDriftDisplay(driftMs) { /* ... (Implementation unchanged) ... */
        if (driftValueMsSpan) { driftValueMsSpan.textContent = driftMs.toFixed(1); }
    }
    /** @public Updates VAD speech regions text (if element exists) */
    function setSpeechRegionsText(regionsOrText) { /* ... (Implementation unchanged) ... */
        if (!speechRegionsDisplay) return; if (typeof regionsOrText === 'string') { speechRegionsDisplay.textContent = regionsOrText; } else if (Array.isArray(regionsOrText)) { if (regionsOrText.length > 0) { speechRegionsDisplay.textContent = regionsOrText.map(r => `Start: ${r.start.toFixed(2)}s, End: ${r.end.toFixed(2)}s`).join('\n'); } else { speechRegionsDisplay.textContent = "No speech detected."; } } else { speechRegionsDisplay.textContent = "None"; }
    }
    /** @public Updates VAD threshold slider display */
    function updateVadDisplay(positive, negative, isNA = false) { /* ... (Implementation unchanged) ... */
        if (isNA) { if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = "N/A"; if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = "N/A"; if (vadThresholdSlider) vadThresholdSlider.value = "0.5"; if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = "0.35"; } else { if (vadThresholdSlider) vadThresholdSlider.value = String(positive); if (vadThresholdValueDisplay) vadThresholdValueDisplay.textContent = positive.toFixed(2); if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.value = String(negative); if (vadNegativeThresholdValueDisplay) vadNegativeThresholdValueDisplay.textContent = negative.toFixed(2); }
    }

    // --- Control Enabling/Disabling ---
    /** @public Enables/disables global Play/Pause, Jump controls */
    function enablePlaybackControls(enable) { /* ... (Implementation unchanged) ... */
        console.log(`UIManager: Setting Playback Controls enabled = ${enable}`); if (playPauseButton) playPauseButton.disabled = !enable; if (jumpBackButton) jumpBackButton.disabled = !enable; if (jumpForwardButton) jumpForwardButton.disabled = !enable;
    }
    /** @public Enables/disables the main seek bar */
    function enableSeekBar(enable) { /* ... (Implementation unchanged) ... */
        console.log(`UIManager: Setting Seek Bar enabled = ${enable}`); if (seekBar) seekBar.disabled = !enable;
    }
    /** @public Enables/disables controls for a specific UI side */
    function enableTrackControls(trackSide, enable) { /* ... (Implementation unchanged, enables/disables based on suffix) ... */
        const suffix = `_${trackSide}`;
        const controls = [ document.getElementById(`mute${suffix}`), document.getElementById(`solo${suffix}`), document.getElementById(`volume${suffix}`), document.getElementById(`delay${suffix}`), document.getElementById(`speed${suffix}`), document.getElementById(`pitch${suffix}`), ];
        controls.forEach(el => { if (el) el.disabled = !enable; });
        // Linking buttons disabled state depends on multi-track mode AND both tracks being enabled
        if (isMultiTrackUIVisible) {
            const otherSide = trackSide === 'left' ? 'right' : 'left';
            // Check if the *other* track's controls are enabled (or about to be if 'enable' is true for current track)
            const otherTrackControlsEnabled = !document.getElementById(`volume_${otherSide}`)?.disabled;
            const bothWillBeEnabled = enable && otherTrackControlsEnabled; // If current track is being enabled AND other is already enabled
            const bothAreEnabled = !document.getElementById(`volume_left`)?.disabled && !document.getElementById(`volume_right`)?.disabled; // Check actual current state
            const linkEnable = (enable && otherTrackControlsEnabled) || (!enable && bothAreEnabled && trackSide === 'left') || (!enable && bothAreEnabled && trackSide === 'right'); // Complex logic, maybe simplify? Let app.js control link enable explicitly?
            // Let's simplify: Disable links unless both tracks' controls are currently NOT disabled.
            const bothControlsCurrentlyEnabled = !document.getElementById(`volume_left`)?.disabled && !document.getElementById(`volume_right`)?.disabled;
            if (linkSpeedButton) linkSpeedButton.disabled = !bothControlsCurrentlyEnabled;
            if (linkPitchButton) linkPitchButton.disabled = !bothControlsCurrentlyEnabled;
        } else {
            if (linkSpeedButton) linkSpeedButton.disabled = true;
            if (linkPitchButton) linkPitchButton.disabled = true;
        }
    }
    /**
     * @public Enables/disables the 'Load Right Track...' button
     * @param {boolean} enable - True to enable, false to disable.
     */
    function enableRightTrackLoadButton(enable) {
        // *** ADDED Log: Check button reference and action ***
        console.log(`UIManager: enableRightTrackLoadButton called with enable=${enable}. Button element:`, chooseFileButton_right);
        if (chooseFileButton_right) {
            chooseFileButton_right.disabled = !enable;
            console.log(`UIManager: Set chooseFileButton_right.disabled = ${!enable}`);
        } else {
            console.error("UIManager: enableRightTrackLoadButton - chooseFileButton_right element not found!");
        }
    }
    /** @public Enables/disables the 'Swap L/R' button */
    function enableSwapButton(enable) { /* ... (Implementation unchanged) ... */
        if (swapTracksButton) swapTracksButton.disabled = !enable;
    }
    /** @public Enables/disables the 'Remove Right' button */
    function enableRemoveButton(enable) { /* ... (Implementation unchanged) ... */
        if (removeTrackButton_right) removeTrackButton_right.disabled = !enable;
    }
    /** @public Enables/disables VAD threshold sliders */
    function enableVadControls(enable) { /* ... (Implementation unchanged) ... */
        if (vadThresholdSlider) vadThresholdSlider.disabled = !enable; if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.disabled = !enable; if (!enable) { updateVadDisplay(0.5, 0.35, true); }
    }

    // --- Visibility Control ---
    /**
     * @public Shows/hides UI elements specific to multi-track mode (Track Controls Section, Right Visualizers).
     * Controls visibility using the 'display' style property.
     * @param {boolean} show - True to show multi-track elements, false to hide.
     */
    function showMultiTrackUI(show) {
        console.log(`UIManager: Setting multi-track UI visibility to ${show}`);
        const displayStyle = show ? '' : 'none'; // Use display: none / ''

        // Toggle visibility of the main sections
        if (trackControlsSection) trackControlsSection.style.display = displayStyle;
        if (visualizationRightSection) visualizationRightSection.style.display = displayStyle;
        if (visualizationRightSpecSection) visualizationRightSpecSection.style.display = displayStyle;

        // The buttons/spans within multi-track-options are always present in the DOM,
        // their enabled/disabled state and content are managed elsewhere (resetUI, enable*, refreshTrackUI).
        // We don't need to toggle visibility of individual file load elements here.

        // Ensure markers for the Right track sliders are positioned correctly when shown
        if (show) {
            setTimeout(() => {
                console.log("UIManager: Positioning markers for right track sliders.");
                positionMarkersForSlider(speedSlider_right, speedMarkers_right);
                positionMarkersForSlider(pitchSlider_right, pitchMarkers_right);
                // Add volume markers if they exist and need positioning
                // positionMarkersForSlider(volumeSlider_right, volumeMarkers_right);
            }, 0); // Use timeout to ensure elements are rendered
        }

        // Update internal state tracker
        isMultiTrackUIVisible = show;
    }

    // --- Getters / Parsers ---
    /** @public Gets jump time value */
    function getJumpTime() { /* ... (Implementation unchanged) ... */
        return parseFloat(jumpTimeInput?.value) || 5;
    }
    /** @public Gets delay value for a side */
    function getDelaySeconds(trackSide) { /* ... (Implementation unchanged) ... */
        const input = trackSide === 'left' ? delayInput_left : delayInput_right; if (!input) return 0; return parseDelayInput(input.value);
    }
    /** @public Sets delay input value for a side */
    function setDelayValue(trackSide, seconds) { /* ... (Implementation unchanged) ... */
        const input = trackSide === 'left' ? delayInput_left : delayInput_right; if (!input) return; input.value = formatDelaySeconds(seconds);
    }
    /** @private Parses delay input string */
    function parseDelayInput(valueStr) { /* ... (Implementation unchanged) ... */
        if (!valueStr) return 0; valueStr = valueStr.trim(); let totalSeconds = 0; if (valueStr.includes(':')) { const parts = valueStr.split(':'); if (parts.length === 2) { const minutes = parseFloat(parts[0]); const secondsMs = parseFloat(parts[1]); if (!isNaN(minutes) && !isNaN(secondsMs)) { totalSeconds = (minutes * 60) + secondsMs; } } } else { totalSeconds = parseFloat(valueStr); } return isNaN(totalSeconds) || totalSeconds < 0 ? 0 : totalSeconds;
    }
    /** @private Formats seconds to delay string */
    function formatDelaySeconds(seconds) { /* ... (Implementation unchanged) ... */
        if (isNaN(seconds) || seconds < 0) seconds = 0; return seconds.toFixed(3);
    }


    // --- VAD Progress Bar Functions (Left Track UI Only for now) ---
    /** @public Updates VAD progress bar percentage */
    function updateVadProgress(percentage) { /* ... (Implementation unchanged) ... */
        if (!vadProgressBar) return; const clampedPercentage = Math.max(0, Math.min(100, percentage)); vadProgressBar.style.width = `${clampedPercentage}%`;
    }
    /** @public Shows/hides VAD progress bar container */
    function showVadProgress(show) { /* ... (Implementation unchanged) ... */
        if (!vadProgressContainer) return; vadProgressContainer.style.display = show ? 'block' : 'none';
    }

    // --- Mute/Solo Button State (Placeholders for Phase M1) ---
    /** Sets the visual state of a Mute button */
    function setMuteButtonState(button, isMuted) {
        if(!button) return;
        // Placeholder: Add/remove an 'active' class or change text
        if(isMuted) { button.classList.add('active'); /* button.textContent = "Unmute"; */ }
        else { button.classList.remove('active'); /* button.textContent = "Mute"; */ }
    }
    /** Sets the visual state of a Solo button */
    function setSoloButtonState(button, isSoloed) {
        if(!button) return;
        if(isSoloed) { button.classList.add('active'); /* button.textContent = "Unsolo"; */ }
        else { button.classList.remove('active'); /* button.textContent = "Solo"; */ }
    }


    // --- Public Interface ---
    return {
        init: init,
        resetUI: resetUI,
        refreshTrackUI: refreshTrackUI, // ** NEW ** Expose refresh function
        // File Info
        updateFileName: updateFileName,
        setFileInfo: setFileInfo,
        // Multi-track UI Control
        showMultiTrackUI: showMultiTrackUI,
        enableRightTrackLoadButton: enableRightTrackLoadButton,
        enableSwapButton: enableSwapButton,
        enableRemoveButton: enableRemoveButton,
        // Global Controls
        setPlayButtonState: setPlayButtonState,
        updateTimeDisplay: updateTimeDisplay,
        updateSeekBar: updateSeekBar,
        updateDriftDisplay: updateDriftDisplay,
        enablePlaybackControls: enablePlaybackControls,
        enableSeekBar: enableSeekBar,
        getJumpTime: getJumpTime,
        // Track Controls
        setLinkButtonState: setLinkButtonState,
        enableTrackControls: enableTrackControls,
        setMuteButtonState: setMuteButtonState, // ** NEW ** For Mute/Solo phase
        setSoloButtonState: setSoloButtonState, // ** NEW ** For Mute/Solo phase
        setDelayValue: setDelayValue,
        parseDelayInput: parseDelayInput, // Keep exposed if needed by app.js
        formatDelaySeconds: formatDelaySeconds, // Keep exposed if needed by app.js
        setSliderValue: setSliderValue, // Expose generic slider setter for convenience
        // VAD Controls/Display (Left Track Only UI)
        setSpeechRegionsText: setSpeechRegionsText,
        updateVadDisplay: updateVadDisplay,
        enableVadControls: enableVadControls,
        updateVadProgress: updateVadProgress,
        showVadProgress: showVadProgress
    };
})(); // End of AudioApp.uiManager IIFE
// --- /vibe-player/js/uiManager.js ---