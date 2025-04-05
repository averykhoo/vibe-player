// --- /vibe-player/js/uiManager.js ---
// Handles DOM manipulation, UI event listeners, and dispatches UI events.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.uiManager = (function() {
    'use strict';

    // === Module Dependencies ===
    const Utils = AudioApp.Utils; // Assumed loaded

    // --- DOM Element References ---

    // File/Info (Track Left - formerly global)
    /** @type {HTMLButtonElement|null} */ let chooseFileButton_left;
    /** @type {HTMLInputElement|null} */ let hiddenAudioFile_left;
    /** @type {HTMLSpanElement|null} */ let fileNameDisplay_left;
    /** @type {HTMLParagraphElement|null} */ let fileInfo_left;
    /** @type {HTMLDivElement|null} */ let vadProgressContainer; // Still applies to Left only for now
    /** @type {HTMLSpanElement|null} */ let vadProgressBar;

    // File/Info (Track Right - New)
    /** @type {HTMLButtonElement|null} */ let chooseFileButton_right;
    /** @type {HTMLInputElement|null} */ let hiddenAudioFile_right;
    /** @type {HTMLSpanElement|null} */ let fileNameDisplay_right;
    /** @type {HTMLParagraphElement|null} */ let fileInfo_right;
    /** @type {HTMLButtonElement|null} */ let removeTrackButton_right;

    // Multi-Track Options
    /** @type {HTMLDivElement|null} */ let multiTrackOptionsDiv; // Container for swap/load right/remove
    /** @type {HTMLButtonElement|null} */ let swapTracksButton;

    // Global Buttons & Seek
    /** @type {HTMLButtonElement|null} */ let playPauseButton;
    /** @type {HTMLButtonElement|null} */ let jumpBackButton;
    /** @type {HTMLButtonElement|null} */ let jumpForwardButton;
    /** @type {HTMLInputElement|null} */ let jumpTimeInput;
    /** @type {HTMLDivElement|null} */ let timeDisplay;
    /** @type {HTMLInputElement|null} */ let seekBar;
    /** @type {HTMLSpanElement|null} */ let driftValueMsSpan; // Drift display span

    // Track Controls Section (Container)
    /** @type {HTMLElement|null} */ let trackControlsSection;

    // Track Left Controls
    /** @type {HTMLButtonElement|null} */ let muteButton_left;
    /** @type {HTMLButtonElement|null} */ let soloButton_left;
    /** @type {HTMLInputElement|null} */ let volumeSlider_left;
    /** @type {HTMLSpanElement|null} */ let volumeValue_left;
    /** @type {HTMLInputElement|null} */ let delayInput_left;
    /** @type {HTMLInputElement|null} */ let speedSlider_left;
    /** @type {HTMLSpanElement|null} */ let speedValue_left;
    /** @type {HTMLDivElement|null} */ let speedMarkers_left;
    /** @type {HTMLInputElement|null} */ let pitchSlider_left;
    /** @type {HTMLSpanElement|null} */ let pitchValue_left;
    /** @type {HTMLDivElement|null} */ let pitchMarkers_left;

    // Track Right Controls
    /** @type {HTMLButtonElement|null} */ let muteButton_right;
    /** @type {HTMLButtonElement|null} */ let soloButton_right;
    /** @type {HTMLInputElement|null} */ let volumeSlider_right;
    /** @type {HTMLSpanElement|null} */ let volumeValue_right;
    /** @type {HTMLInputElement|null} */ let delayInput_right;
    /** @type {HTMLInputElement|null} */ let speedSlider_right;
    /** @type {HTMLSpanElement|null} */ let speedValue_right;
    /** @type {HTMLDivElement|null} */ let speedMarkers_right;
    /** @type {HTMLInputElement|null} */ let pitchSlider_right;
    /** @type {HTMLSpanElement|null} */ let pitchValue_right;
    /** @type {HTMLDivElement|null} */ let pitchMarkers_right;

    // Linking Buttons
    /** @type {HTMLButtonElement|null} */ let linkSpeedButton;
    /** @type {HTMLButtonElement|null} */ let linkPitchButton;
    // let linkVolumeButton; // If added later

    // Global Master Gain
    /** @type {HTMLInputElement|null} */ let gainControl; // Master Gain
    /** @type {HTMLSpanElement|null} */ let gainValueDisplay; // Master Gain Value
    /** @type {HTMLDivElement|null} */ let gainMarkers; // Master Gain Markers

    // VAD (Still Left Track Only)
    /** @type {HTMLInputElement|null} */ let vadThresholdSlider;
    /** @type {HTMLSpanElement|null} */ let vadThresholdValueDisplay;
    /** @type {HTMLInputElement|null} */ let vadNegativeThresholdSlider;
    /** @type {HTMLSpanElement|null} */ let vadNegativeThresholdValueDisplay;
    /** @type {HTMLPreElement|null} */ let speechRegionsDisplay;

    // Visualizations (Containers - elements inside managed by visualizers)
    /** @type {HTMLElement|null} */ let visualizationLeftSection;
    /** @type {HTMLElement|null} */ let visualizationLeftSpecSection;
    /** @type {HTMLElement|null} */ let visualizationRightSection;
    /** @type {HTMLElement|null} */ let visualizationRightSpecSection;

    // --- State ---
    let isMultiTrackUIVisible = false; // Track visibility state

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("UIManager: Initializing...");
        if (!Utils) {
            console.error("UIManager: CRITICAL - AudioApp.Utils not found!");
            return;
        }
        assignDOMElements();
        initializeSliderMarkers(); // Initialize markers for all sliders that exist initially
        setupEventListeners();
        resetUI(); // Resets to initial single-track state
        console.log("UIManager: Initialized.");
    }

    // --- DOM Element Assignment ---
    /** @private */
    function assignDOMElements() {
        // File Handling - Left
        chooseFileButton_left = document.getElementById('chooseFileButton_left');
        hiddenAudioFile_left = document.getElementById('hiddenAudioFile_left');
        fileNameDisplay_left = document.getElementById('fileNameDisplay_left');
        fileInfo_left = document.getElementById('fileInfo_left');

        // File Handling - Right & Multi-Track Options
        multiTrackOptionsDiv = document.getElementById('multi-track-options');
        chooseFileButton_right = document.getElementById('chooseFileButton_right');
        hiddenAudioFile_right = document.getElementById('hiddenAudioFile_right');
        fileNameDisplay_right = document.getElementById('fileNameDisplay_right');
        fileInfo_right = document.getElementById('fileInfo_right');
        swapTracksButton = document.getElementById('swapTracksButton');
        removeTrackButton_right = document.getElementById('removeTrackButton_right');

        // Global Playback
        playPauseButton = document.getElementById('playPause');
        jumpBackButton = document.getElementById('jumpBack');
        jumpForwardButton = document.getElementById('jumpForward');
        jumpTimeInput = document.getElementById('jumpTime');
        seekBar = document.getElementById('seekBar');
        timeDisplay = document.getElementById('timeDisplay');
        driftValueMsSpan = document.getElementById('driftValueMs'); // Drift Display

        // Track Controls Section Container
        trackControlsSection = document.getElementById('track-controls');

        // Track Left Controls
        muteButton_left = document.getElementById('mute_left');
        soloButton_left = document.getElementById('solo_left');
        volumeSlider_left = document.getElementById('volume_left');
        volumeValue_left = document.getElementById('volumeValue_left');
        delayInput_left = document.getElementById('delay_left');
        speedSlider_left = document.getElementById('speed_left');
        speedValue_left = document.getElementById('speedValue_left');
        speedMarkers_left = document.getElementById('speedMarkers_left');
        pitchSlider_left = document.getElementById('pitch_left');
        pitchValue_left = document.getElementById('pitchValue_left');
        pitchMarkers_left = document.getElementById('pitchMarkers_left');

        // Track Right Controls
        muteButton_right = document.getElementById('mute_right');
        soloButton_right = document.getElementById('solo_right');
        volumeSlider_right = document.getElementById('volume_right');
        volumeValue_right = document.getElementById('volumeValue_right');
        delayInput_right = document.getElementById('delay_right');
        speedSlider_right = document.getElementById('speed_right');
        speedValue_right = document.getElementById('speedValue_right');
        speedMarkers_right = document.getElementById('speedMarkers_right');
        pitchSlider_right = document.getElementById('pitch_right');
        pitchValue_right = document.getElementById('pitchValue_right');
        pitchMarkers_right = document.getElementById('pitchMarkers_right');

        // Linking Buttons
        linkSpeedButton = document.getElementById('linkSpeedButton');
        linkPitchButton = document.getElementById('linkPitchButton');

        // Global Master Gain
        gainControl = document.getElementById('gainControl');
        gainValueDisplay = document.getElementById('gainValue');
        gainMarkers = document.getElementById('gainMarkers');

        // VAD (Left Track Only)
        vadProgressContainer = document.getElementById('vadProgressContainer');
        vadProgressBar = document.getElementById('vadProgressBar');
        vadThresholdSlider = document.getElementById('vadThreshold');
        vadThresholdValueDisplay = document.getElementById('vadThresholdValue');
        vadNegativeThresholdSlider = document.getElementById('vadNegativeThreshold');
        vadNegativeThresholdValueDisplay = document.getElementById('vadNegativeThresholdValue');
        speechRegionsDisplay = document.getElementById('speechRegionsDisplay');

        // Visualizations (Section containers)
        visualizationLeftSection = document.getElementById('visualization_left');
        visualizationLeftSpecSection = document.getElementById('visualization_left_spec');
        visualizationRightSection = document.getElementById('visualization_right');
        visualizationRightSpecSection = document.getElementById('visualization_right_spec');

        // Check essential elements
        if (!chooseFileButton_left || !playPauseButton || !seekBar || !gainControl) {
             console.warn("UIManager: Could not find all required baseline UI elements!");
        }
        if (!trackControlsSection || !chooseFileButton_right || !multiTrackOptionsDiv) {
            console.warn("UIManager: Could not find multi-track container/control elements!");
        }
         if (!driftValueMsSpan) { console.warn("UIManager: Drift display span not found."); }
    }

    // --- Slider Marker Positioning ---
    /** @private */
    function initializeSliderMarkers() {
        const markerConfigs = [
            // Use _left suffixes for initial setup
            { slider: speedSlider_left, markersDiv: speedMarkers_left },
            { slider: pitchSlider_left, markersDiv: pitchMarkers_left },
            { slider: gainControl, markersDiv: gainMarkers }, // Master Gain
            // Right track markers will be initialized when shown, if needed, or rely on CSS
        ];
        markerConfigs.forEach(config => {
            positionMarkersForSlider(config.slider, config.markersDiv);
        });
    }

    /** Helper to position markers for a given slider */
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
    /** @private */
    function setupEventListeners() {
        // File Loading
        chooseFileButton_left?.addEventListener('click', () => { hiddenAudioFile_left?.click(); });
        hiddenAudioFile_left?.addEventListener('change', (e) => {
             handleFileSelectionEvent(e, 'left');
        });
        chooseFileButton_right?.addEventListener('click', () => { hiddenAudioFile_right?.click(); });
        hiddenAudioFile_right?.addEventListener('change', (e) => {
             handleFileSelectionEvent(e, 'right');
        });
        swapTracksButton?.addEventListener('click', () => dispatchUIEvent('audioapp:swapTracksClicked'));
        removeTrackButton_right?.addEventListener('click', () => dispatchUIEvent('audioapp:removeTrackClicked'));

        // Global Playback
        seekBar?.addEventListener('input', handleSeekBarInput);
        playPauseButton?.addEventListener('click', () => dispatchUIEvent('audioapp:playPauseClicked'));
        jumpBackButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', { seconds: -getJumpTime() }));
        jumpForwardButton?.addEventListener('click', () => dispatchUIEvent('audioapp:jumpClicked', { seconds: getJumpTime() }));

        // Global Master Gain
        setupSliderListeners(gainControl, gainValueDisplay, 'audioapp:gainChanged', 'gain', 'x');
        gainMarkers?.addEventListener('click', (e) => handleMarkerClick(e, gainControl));

        // Track Controls (Setup listeners for both left and right)
        setupTrackControlListeners('left');
        setupTrackControlListeners('right');

        // Linking Buttons
        linkSpeedButton?.addEventListener('click', () => {
            const isActive = toggleLinkButton(linkSpeedButton);
            dispatchUIEvent('audioapp:linkSpeedToggled', { linked: isActive });
        });
        linkPitchButton?.addEventListener('click', () => {
            const isActive = toggleLinkButton(linkPitchButton);
            dispatchUIEvent('audioapp:linkPitchToggled', { linked: isActive });
        });

        // VAD Sliders (Apply to Left Track only)
        vadThresholdSlider?.addEventListener('input', handleVadSliderInput);
        vadNegativeThresholdSlider?.addEventListener('input', handleVadSliderInput);

        // Global Keydowns
        document.addEventListener('keydown', handleKeyDown);
    }

    /** Helper to set up listeners for a specific track's controls */
    function setupTrackControlListeners(trackSide) { // trackSide is 'left' or 'right'
        const volumeSlider = document.getElementById(`volume_${trackSide}`);
        const volumeValue = document.getElementById(`volumeValue_${trackSide}`);
        const delayInput = document.getElementById(`delay_${trackSide}`);
        const speedSlider = document.getElementById(`speed_${trackSide}`);
        const speedValue = document.getElementById(`speedValue_${trackSide}`);
        const speedMarkers = document.getElementById(`speedMarkers_${trackSide}`);
        const pitchSlider = document.getElementById(`pitch_${trackSide}`);
        const pitchValue = document.getElementById(`pitchValue_${trackSide}`);
        const pitchMarkers = document.getElementById(`pitchMarkers_${trackSide}`);
        const muteButton = document.getElementById(`mute_${trackSide}`);
        const soloButton = document.getElementById(`solo_${trackSide}`);

        // Volume
        setupSliderListeners(volumeSlider, volumeValue, `audioapp:volumeChanged_${trackSide}`, 'volume', '');
        // Delay (using 'change' or 'blur' might be better than 'input' for text)
        delayInput?.addEventListener('change', (e) => {
             const value = e.target.value;
             // Basic validation could happen here, but parsing is done in app.js
             dispatchUIEvent(`audioapp:delayChanged_${trackSide}`, { value: value });
        });
        // Speed
        setupSliderListeners(speedSlider, speedValue, `audioapp:speedChanged_${trackSide}`, 'speed', 'x');
        speedMarkers?.addEventListener('click', (e) => handleMarkerClick(e, speedSlider));
        // Pitch
        setupSliderListeners(pitchSlider, pitchValue, `audioapp:pitchChanged_${trackSide}`, 'pitch', 'x');
        pitchMarkers?.addEventListener('click', (e) => handleMarkerClick(e, pitchSlider));
        // Mute/Solo
        muteButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:muteToggled_${trackSide}`));
        soloButton?.addEventListener('click', () => dispatchUIEvent(`audioapp:soloToggled_${trackSide}`));
    }


    /** Generic handler for file input change events */
    function handleFileSelectionEvent(event, trackSide) { // trackSide is 'left' or 'right'
         const file = event.target.files?.[0];
         const detail = { file: file, trackId: trackSide }; // Pass track identifier
         if (file) {
             // Update filename display immediately
             updateFileName(trackSide, file.name);
             dispatchUIEvent('audioapp:fileSelected', detail);
         } else {
             updateFileName(trackSide, "");
             // Optionally dispatch event even if no file selected? Maybe not needed.
         }
         // Clear the input value to allow selecting the same file again
         event.target.value = null;
    }

    /** Generic handler for seek bar input */
    function handleSeekBarInput(e) {
         const target = /** @type {HTMLInputElement} */ (e.target);
         const fraction = parseFloat(target.value);
         if (!isNaN(fraction)) { dispatchUIEvent('audioapp:seekBarInput', { fraction: fraction }); }
    }

    /** Generic slider listener setup */
    function setupSliderListeners(slider, valueDisplay, eventName, detailKey, suffix = '') {
        if (!slider || !valueDisplay) return;
        // Update display on initial load
        const initialValue = parseFloat(slider.value);
        valueDisplay.textContent = initialValue.toFixed(2) + suffix;

        slider.addEventListener('input', () => {
            const value = parseFloat(slider.value);
            valueDisplay.textContent = value.toFixed(2) + suffix;
            dispatchUIEvent(eventName, { [detailKey]: value });
        });
        // Ensure markers are positioned if slider exists
        const markersDivId = slider.id.replace(/Slider|Control/i, 'Markers'); // Guess markers div ID
        const markersDiv = document.getElementById(markersDivId);
        positionMarkersForSlider(slider, markersDiv);
    }

    /** Handles clicks on slider markers */
    function handleMarkerClick(event, sliderElement) {
        // ... (implementation unchanged) ...
        if (!sliderElement || sliderElement.disabled) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.tagName === 'SPAN' && target.dataset.value) {
            const value = parseFloat(target.dataset.value);
            if (!isNaN(value)) {
                sliderElement.value = String(value);
                // Crucially, dispatch the 'input' event so listeners (including ours) fire
                sliderElement.dispatchEvent(new Event('input', { bubbles: true }));
                 // Also dispatch the specific change event for app.js if needed immediately
                 const eventName = sliderElement.dataset.eventName; // Need to store event name on slider
                 const detailKey = sliderElement.dataset.detailKey;
                 if(eventName && detailKey) {
                    dispatchUIEvent(eventName, { [detailKey]: value });
                 }
            }
        }
    }

     /** Handles VAD slider input */
     function handleVadSliderInput(e) {
        // ... (implementation unchanged, still applies to left) ...
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

    /** Handles global keydowns */
    function handleKeyDown(e) {
        // ... (implementation unchanged) ...
         const target = e.target;
         // Allow keybinds if target is body or button, but not input fields
         const isBody = target instanceof HTMLBodyElement;
         const isButton = target instanceof HTMLButtonElement;
         const isRange = target instanceof HTMLInputElement && target.type === 'range';

         if (!isBody && !isButton && !isRange) return; // Ignore inputs in text fields etc.

         let handled = false; let eventKey = null;
         switch (e.code) {
             case 'Space': eventKey = 'Space'; handled = true; break;
             case 'ArrowLeft': eventKey = 'ArrowLeft'; handled = true; break;
             case 'ArrowRight': eventKey = 'ArrowRight'; handled = true; break;
         }
         if (eventKey) { dispatchUIEvent('audioapp:keyPressed', { key: eventKey }); }
         if (handled) { e.preventDefault(); }
    }

    /** Toggles link button visual state and returns new active state */
    function toggleLinkButton(button) {
         if (!button) return false;
         const isActive = !button.classList.contains('active');
         if (isActive) {
             button.classList.add('active');
             button.innerHTML = '🔗'; // Linked icon
             button.title = button.title.replace('Link', 'Unlink');
         } else {
             button.classList.remove('active');
             button.innerHTML = '🚫'; // Unlinked icon (simple placeholder)
             button.title = button.title.replace('Unlink', 'Link');
         }
         return isActive;
    }


    /** Dispatches a custom UI event */
    function dispatchUIEvent(eventName, detail = {}) {
        // console.log("UIManager: Dispatching event", eventName, detail); // Optional debug
        document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }

    // --- Public Methods for Updating UI ---

    /** @public Resets UI to initial single-track state */
    function resetUI() {
        console.log("UIManager: Resetting UI to single-track state");

        // Hide multi-track elements
        showMultiTrackUI(false);

        // Reset Left Track display
        updateFileName('left', "");
        setFileInfo('left', "No file selected.");

        // Reset Global controls
        setPlayButtonState(false);
        updateTimeDisplay(0, 0);
        updateSeekBar(0);
        updateDriftDisplay(0); // Reset drift

        // Reset Sliders to default values
        setSliderValue(gainControl, 1.0, gainValueDisplay, 'x'); // Master Gain
        // Reset Left track sliders (Right track sliders are hidden)
        setSliderValue(volumeSlider_left, 1.0, volumeValue_left, '');
        setSliderValue(speedSlider_left, 1.0, speedValue_left, 'x');
        setSliderValue(pitchSlider_left, 1.0, pitchValue_left, 'x');
        setDelayValue('left', 0); // Reset delay input

        // Reset Link buttons to default (active/linked)
        setLinkButtonState(linkSpeedButton, true);
        setLinkButtonState(linkPitchButton, true);

        // Reset Jump time
        if (jumpTimeInput) jumpTimeInput.value = "5";

        // Reset VAD display (for Left track)
        setSpeechRegionsText("None");
        updateVadDisplay(0.5, 0.35, true); // Reset VAD sliders to N/A
        showVadProgress(false);
        updateVadProgress(0);

        // Disable controls
        enablePlaybackControls(false); // Disables global Play/Jump
        enableSeekBar(false);
        enableTrackControls('left', false); // Disable left track specific controls initially
        enableVadControls(false); // Disable VAD controls

        // Reset multi-track button states
        enableRightTrackLoadButton(false);
        enableSwapButton(false);
        enableRemoveButton(false);

        isMultiTrackUIVisible = false;
    }

    /** Helper to set slider value and update its display */
    function setSliderValue(slider, value, displayElement, suffix = '') {
        if (slider) slider.value = String(value);
        if (displayElement) displayElement.textContent = Number(value).toFixed(2) + suffix;
    }

    /** Helper to set link button state */
    function setLinkButtonState(button, isActive) {
        if (!button) return;
        if (isActive) {
            if (!button.classList.contains('active')) toggleLinkButton(button); // Add active state
        } else {
            if (button.classList.contains('active')) toggleLinkButton(button); // Remove active state
        }
    }

    /** @public @param {'left' | 'right'} trackSide @param {string} text */
    function updateFileName(trackSide, text) {
        const display = trackSide === 'left' ? fileNameDisplay_left : fileNameDisplay_right;
        if (display) { display.textContent = text; display.title = text; }
    }
    /** @public @param {'left' | 'right'} trackSide @param {string} text */
    function setFileInfo(trackSide, text) {
        const info = trackSide === 'left' ? fileInfo_left : fileInfo_right;
        if (info) { info.textContent = text; info.title = text; }
    }

    /** @public @param {boolean} isPlaying */
    function setPlayButtonState(isPlaying) {
        if (playPauseButton) playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
    }

    /** @public @param {number} currentTime @param {number} duration */
    function updateTimeDisplay(currentTime, duration) {
        if (timeDisplay && Utils) {
            timeDisplay.textContent = `${Utils.formatTime(currentTime)} / ${Utils.formatTime(duration)}`;
        } else if (timeDisplay) {
             timeDisplay.textContent = `Err / Err`;
        }
    }

    /** @public @param {number} fraction */
    function updateSeekBar(fraction) {
        // ... (implementation unchanged) ...
        if (seekBar) {
            const clampedFraction = Math.max(0, Math.min(1, fraction));
            // Only update if value is significantly different to avoid fighting user input
            if (Math.abs(parseFloat(seekBar.value) - clampedFraction) > 1e-3 ) { // Tolerance
                seekBar.value = String(clampedFraction);
            }
        }
    }

     /** @public @param {number} driftMs */
     function updateDriftDisplay(driftMs) {
          if (driftValueMsSpan) {
              driftValueMsSpan.textContent = driftMs.toFixed(1); // Show one decimal place
          }
     }

    /** @public @param {string | Array<{start: number, end: number}>} regionsOrText */
    function setSpeechRegionsText(regionsOrText) {
        // ... (implementation unchanged - still applies to left VAD) ...
        if (!speechRegionsDisplay) return;
        if (typeof regionsOrText === 'string') { speechRegionsDisplay.textContent = regionsOrText; }
        else if (Array.isArray(regionsOrText)) {
             if (regionsOrText.length > 0) { speechRegionsDisplay.textContent = regionsOrText.map(r => `Start: ${r.start.toFixed(2)}s, End: ${r.end.toFixed(2)}s`).join('\n'); }
             else { speechRegionsDisplay.textContent = "No speech detected."; }
        } else { speechRegionsDisplay.textContent = "None"; }
    }

    /** @public @param {number} positive @param {number} negative @param {boolean} [isNA=false] */
    function updateVadDisplay(positive, negative, isNA = false) {
        // ... (implementation unchanged - still applies to left VAD) ...
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

    // --- Control Enabling/Disabling ---

    /** @public @param {boolean} enable - Enables global Play/Pause, Jump controls */
    function enablePlaybackControls(enable) {
        if (playPauseButton) playPauseButton.disabled = !enable;
        if (jumpBackButton) jumpBackButton.disabled = !enable;
        if (jumpForwardButton) jumpForwardButton.disabled = !enable;
        // Master Gain is generally always enabled
    }

    /** @public @param {boolean} enable */
     function enableSeekBar(enable) { if (seekBar) seekBar.disabled = !enable; }

    /** @public @param {'left' | 'right'} trackSide @param {boolean} enable */
    function enableTrackControls(trackSide, enable) {
        const controls = [
            document.getElementById(`mute_${trackSide}`),
            document.getElementById(`solo_${trackSide}`),
            document.getElementById(`volume_${trackSide}`),
            document.getElementById(`delay_${trackSide}`),
            document.getElementById(`speed_${trackSide}`),
            document.getElementById(`pitch_${trackSide}`),
        ];
        controls.forEach(el => { if (el) el.disabled = !enable; });

        // Also enable/disable linking buttons if BOTH tracks become enabled/disabled
        // This logic might be better handled in app.js based on overall state
        if (isMultiTrackUIVisible) {
             const otherSide = trackSide === 'left' ? 'right' : 'left';
             const otherTrackControlsEnabled = !document.getElementById(`volume_${otherSide}`)?.disabled;
             const bothEnabled = enable && otherTrackControlsEnabled;
             if(linkSpeedButton) linkSpeedButton.disabled = !bothEnabled;
             if(linkPitchButton) linkPitchButton.disabled = !bothEnabled;
        } else {
             if(linkSpeedButton) linkSpeedButton.disabled = true;
             if(linkPitchButton) linkPitchButton.disabled = true;
        }
    }

     /** @public @param {boolean} enable */
     function enableRightTrackLoadButton(enable) {
          if(chooseFileButton_right) chooseFileButton_right.disabled = !enable;
     }
     /** @public @param {boolean} enable */
     function enableSwapButton(enable) {
          if(swapTracksButton) swapTracksButton.disabled = !enable;
     }
     /** @public @param {boolean} enable */
     function enableRemoveButton(enable) {
          if(removeTrackButton_right) removeTrackButton_right.disabled = !enable;
     }

    /** @public @param {boolean} enable */
    function enableVadControls(enable) {
        // ... (implementation unchanged - still applies to left VAD) ...
        if (vadThresholdSlider) vadThresholdSlider.disabled = !enable;
        if (vadNegativeThresholdSlider) vadNegativeThresholdSlider.disabled = !enable;
        if (!enable) { updateVadDisplay(0.5, 0.35, true); }
    }

    // --- Visibility Control ---
    /** @public Shows/hides the UI elements specific to multi-track mode */
    function showMultiTrackUI(show) {
        console.log(`UIManager: Setting multi-track UI visibility to ${show}`);
        const displayStyle = show ? '' : 'none'; // Use default display (block, flex, etc.) or none

        // Show/hide sections
        if (trackControlsSection) trackControlsSection.style.display = displayStyle;
        if (visualizationRightSection) visualizationRightSection.style.display = displayStyle;
        if (visualizationRightSpecSection) visualizationRightSpecSection.style.display = displayStyle;

        // Show/hide buttons in the file loader area
        if (swapTracksButton) swapTracksButton.style.display = show ? '' : 'none';
        if (removeTrackButton_right) removeTrackButton_right.style.display = show ? '' : 'none';

        // Also handle enabling/disabling relevant controls
         enableSwapButton(show); // Enable swap/remove only when shown and both tracks loaded (app.js logic)
         enableRemoveButton(show);
        // Enable/disable track controls based on the 'show' state? Or based on track readiness? Let app.js control enable state.
        // If hiding, disable track 2 controls explicitly?
        if (!show) {
            enableTrackControls('right', false);
            // Reset right track file display
            updateFileName('right', 'None');
            setFileInfo('right', '');
        }

        isMultiTrackUIVisible = show;
    }

    // --- Getters / Parsers ---

    /** @public @returns {number} */
    function getJumpTime() { return parseFloat(jumpTimeInput?.value) || 5; }

    /**
     * @public
     * @param {'left' | 'right'} trackSide
     * @returns {number} Delay in seconds, or 0 if input is invalid.
     */
    function getDelaySeconds(trackSide) {
        const input = trackSide === 'left' ? delayInput_left : delayInput_right;
        if (!input) return 0;
        return parseDelayInput(input.value);
    }

    /**
     * @public
     * @param {'left' | 'right'} trackSide
     * @param {number} seconds - Delay in seconds.
     */
     function setDelayValue(trackSide, seconds) {
         const input = trackSide === 'left' ? delayInput_left : delayInput_right;
         if (!input) return;
         input.value = formatDelaySeconds(seconds);
     }

    /** Parses ss.ms or mm:ss.ms input into seconds */
    function parseDelayInput(valueStr) {
        if (!valueStr) return 0;
        valueStr = valueStr.trim();
        let totalSeconds = 0;
        if (valueStr.includes(':')) {
            // Handle mm:ss.ms
            const parts = valueStr.split(':');
            if (parts.length === 2) {
                const minutes = parseFloat(parts[0]);
                const secondsMs = parseFloat(parts[1]);
                if (!isNaN(minutes) && !isNaN(secondsMs)) {
                    totalSeconds = (minutes * 60) + secondsMs;
                }
            }
             // Add hh:mm:ss.ms later if needed
        } else {
            // Handle ss.ms
            totalSeconds = parseFloat(valueStr);
        }
        return isNaN(totalSeconds) || totalSeconds < 0 ? 0 : totalSeconds;
    }

    /** Formats seconds into ss.ms string */
    function formatDelaySeconds(seconds) {
         if (isNaN(seconds) || seconds < 0) seconds = 0;
         // Show 3 decimal places for milliseconds
         return seconds.toFixed(3);
    }


    // --- VAD Progress Bar Functions ---
    /** @public @param {number} percentage */
    function updateVadProgress(percentage) {
        // ... (implementation unchanged) ...
        if (!vadProgressBar) return;
        const clampedPercentage = Math.max(0, Math.min(100, percentage));
        vadProgressBar.style.width = `${clampedPercentage}%`;
    }
    /** @public @param {boolean} show */
    function showVadProgress(show) {
        // ... (implementation unchanged) ...
        if (!vadProgressContainer) return;
        vadProgressContainer.style.display = show ? 'block' : 'none';
    }

    // --- Public Interface ---
    return {
        init: init,
        resetUI: resetUI,
        // File Info
        updateFileName: updateFileName, // Needs trackSide
        setFileInfo: setFileInfo, // Needs trackSide
        // Multi-track UI Control
        showMultiTrackUI: showMultiTrackUI,
        enableRightTrackLoadButton: enableRightTrackLoadButton,
        enableSwapButton: enableSwapButton,
        enableRemoveButton: enableRemoveButton,
        // Global Controls
        setPlayButtonState: setPlayButtonState,
        updateTimeDisplay: updateTimeDisplay,
        updateSeekBar: updateSeekBar,
        updateDriftDisplay: updateDriftDisplay, // New
        enablePlaybackControls: enablePlaybackControls,
        enableSeekBar: enableSeekBar,
        getJumpTime: getJumpTime,
        // Track Controls (Getters/Setters maybe added later if needed by app.js)
        // setSliderValue: setSliderValue, // Expose if needed externally? Probably not.
        setDelayValue: setDelayValue, // Needed to update display after parsing
        getDelaySeconds: getDelaySeconds, // Needed by app.js
        setLinkButtonState: setLinkButtonState, // Needed by app.js to set initial state
        enableTrackControls: enableTrackControls, // Needed by app.js
        // VAD Controls/Display (Left Track Only)
        setSpeechRegionsText: setSpeechRegionsText,
        updateVadDisplay: updateVadDisplay,
        enableVadControls: enableVadControls,
        updateVadProgress: updateVadProgress,
        showVadProgress: showVadProgress
    };
})();
// --- /vibe-player/js/uiManager.js ---
