// --- /vibe-player/js/app.js ---
// Orchestrates the Vibe Player application flow by handling events and coordinating
// between UI (uiManager), state (stateManager), audio processing (audioEngine),
// VAD (vadAnalyzer), and visualizations.
// REFACTORED: Uses stateManager, global speed, Mute only (no Solo).

/**
 * @namespace AudioApp
 * @description Main application namespace for Vibe Player.
 */
var AudioApp = AudioApp || {};

AudioApp = (function() {
    'use strict';

    // === Module Dependencies ===
    // Access modules via AudioApp.* after init check.

    // --- Local Variables ---
    /** @type {number | null} Handle for requestAnimationFrame loop. */
    let rAFUpdateHandle = null;
    /** @type {Function | null} Debounced function for syncing engine. */
    let debouncedSyncEngine = null;
    const SYNC_DEBOUNCE_WAIT_MS = 300;

    /** @type {object} Holds references to visualizer instances */
    let vizRefs = { left: { waveform: null, spec: null }, right: { waveform: null, spec: null } };

    // --- Initialization ---
    /** Initializes the application controller. */
    function init() {
        console.log("AudioApp: Initializing Controller...");
        // Dependency Check
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.stateManager ||
            !AudioApp.waveformVisualizer?.createInstance || !AudioApp.spectrogramVisualizer?.createInstance ||
            !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.Constants || !AudioApp.Utils)
        { console.error(`AudioApp: CRITICAL - Required modules missing.`); return; }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);
        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();

        // Create Left Visualizers
        try {
            vizRefs.left.waveform = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_left', indicatorId: 'waveformProgressIndicator_left' });
            vizRefs.left.spec = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_left', spinnerId: 'spectrogramSpinner_left', indicatorId: 'spectrogramProgressIndicator_left' });
            console.log("AudioApp: Left visualizer instances created.");
        } catch (vizError) { console.error("AudioApp: CRITICAL - Failed to create visualizer instances:", vizError); }

        setupAppEventListeners();
        AudioApp.stateManager.resetState(); // Reset state first
        AudioApp.uiManager.resetUI();     // Then reset UI
        console.log("AudioApp: Controller Initialized. Waiting for file...");
    }

    // --- State Reset ---
    /** Resets the application state via stateManager and triggers a full UI reset. */
    function resetAppStateAndUI() {
         console.log("AudioApp: Resetting application state and UI.");
         stopUIUpdateLoop();
         AudioApp.stateManager.setPlaybackState('stopped', null, 0.0);
         AudioApp.stateManager.resetState();
         vizRefs.left.waveform?.clearVisuals(); vizRefs.left.spec?.clearVisuals();
         vizRefs.right.waveform?.clearVisuals(); vizRefs.right.spec?.clearVisuals();
         vizRefs.right.waveform = null; vizRefs.right.spec = null;
         AudioApp.uiManager.resetUI();
    }

    // --- Event Listener Setup ---
    /** Sets up application event listeners. */
    function setupAppEventListeners() {
        // File/Track Management
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrack);
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracks);
        // Linking (Only Pitch)
        document.addEventListener('audioapp:linkPitchToggled', handleLinkPitchToggle);
        // Track Parameters (Volume, Delay, Pitch, Mute)
        document.addEventListener('audioapp:volumeChanged_left', (e) => handleVolumeChange('left', e.detail.volume));
        document.addEventListener('audioapp:volumeChanged_right', (e) => handleVolumeChange('right', e.detail.volume));
        document.addEventListener('audioapp:delayChanged_left', (e) => handleDelayChange('left', e.detail.value));
        document.addEventListener('audioapp:delayChanged_right', (e) => handleDelayChange('right', e.detail.value));
        document.addEventListener('audioapp:pitchChanged_left', (e) => handlePitchChange('left', e.detail.pitch));
        document.addEventListener('audioapp:pitchChanged_right', (e) => handlePitchChange('right', e.detail.pitch));
        document.addEventListener('audioapp:muteToggled_left', () => handleMuteToggle('left'));   // Mute listener
        document.addEventListener('audioapp:muteToggled_right', () => handleMuteToggle('right')); // Mute listener
        // document.removeEventListener('audioapp:soloToggled_left', handleSoloToggle); // REMOVED Solo listener
        // document.removeEventListener('audioapp:soloToggled_right', handleSoloToggle); // REMOVED Solo listener
        // Global Playback & Seek
        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek);
        document.addEventListener('audioapp:seekBarInput', handleSeek);
        document.addEventListener('audioapp:gainChanged', handleMasterGainChange);
        document.addEventListener('audioapp:globalSpeedChanged', handleGlobalSpeedChanged);
        // VAD
        document.addEventListener('audioapp:thresholdChanged', handleThresholdChange);
        // Keyboard
        document.addEventListener('audioapp:keyPressed', handleKeyPress);
        // Audio Engine Lifecycle & Errors
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError);
        document.addEventListener('audioapp:playbackError', handleAudioError);
        document.addEventListener('audioapp:engineError', handleAudioError);
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded);
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange);
        document.addEventListener('audioapp:timeUpdated', handleTimeUpdate);
        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Helper Functions ---
    /** Checks if all currently assigned tracks are ready via stateManager. */
    function areAllActiveTracksReady() { return AudioApp.stateManager.areAllActiveTracksReady(); }
    /** Calculates the max effective duration via stateManager. */
    function calculateMaxEffectiveDuration() { return AudioApp.stateManager.calculateMaxEffectiveDuration(); }
    /** Computes and draws visuals for the track assigned to a specific UI side. */
     async function drawTrackVisuals(side) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const trackIndex = sm.getTrackIndexForSide(side); const track = sm.getTrackByIndex(trackIndex); const targetVizRefs = vizRefs[side]; if (!track?.audioBuffer || !targetVizRefs) { console.warn(`App: Cannot draw visuals for UI side ${side}, track data or viz refs missing.`); return; } console.log(`App: Drawing/Redrawing visuals for track #${trackIndex} on UI side ${side}...`); try { const vadRegions = track.vad.results ? (track.vad.results.regions || []) : null; if (targetVizRefs.waveform?.computeAndDrawWaveform) { await targetVizRefs.waveform.computeAndDrawWaveform(track.audioBuffer, vadRegions); } else { console.warn(`App: Waveform Visualizer for UI side ${side} not available.`); } if (targetVizRefs.spec?.computeAndDrawSpectrogram) { await targetVizRefs.spec.computeAndDrawSpectrogram(track.audioBuffer); } else { console.warn(`App: Spectrogram Visualizer for UI side ${side} not available.`); } } catch (visError) { console.error(`App: Error drawing visuals for UI side ${side} (Track #${trackIndex}):`, visError); } }


    // --- Event Handler Functions (Using StateManager) ---

    /**
     * Handles file selection for a UI side. Uses stateManager to find slots, manage assignments, and track state.
     * @param {CustomEvent<{file: File, trackId: 'left' | 'right'}>} e
     * @private
     */
    async function handleFileSelected(e) {
        const { file, trackId: side } = e.detail; if (!file) return;
        const sm = AudioApp.stateManager; // Alias

        console.log(`App: File selected for UI side ${side} - ${file.name}`);
        let targetTrackIndex = -1;
        let isReplacingLeft = false;

        if (side === 'left') {
            console.log("App: Loading Left channel - resetting application state."); isReplacingLeft = true;
            const oldLeftIndex = sm.getLeftTrackIndex();
            if (oldLeftIndex !== -1) await AudioApp.audioEngine.cleanupTrack(oldLeftIndex);
            sm.resetState(); AudioApp.uiManager.resetUI();
            targetTrackIndex = sm.findFirstAvailableSlot();
            sm.assignChannel('left', targetTrackIndex);
        } else { // Loading Right
            if (!sm.isSideAssigned('left')) { console.warn("App: Cannot load Right channel before Left channel."); AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return; }
            if (sm.isSideAssigned('right')) { console.log("App: Right channel already loaded, replacing existing track."); await handleRemoveTrackInternal(false); }
            targetTrackIndex = sm.findFirstAvailableSlot();
            sm.assignChannel('right', targetTrackIndex);
            AudioApp.uiManager.showMultiTrackUI(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
        }

        // Add track state using stateManager (this creates the object AND puts it in the internal array)
        const newTrack = sm.addNewTrack(targetTrackIndex);
        if (!newTrack) { console.error("App: Failed to add new track state via stateManager."); return; }

        // Now, modify the returned track object properties
        newTrack.file = file; newTrack.isLoading = true;
        // Speed is already set to currentGlobalSpeed within createInitialTrackState called by addNewTrack

        // *** REMOVED This Incorrect Line: tracksData[targetTrackIndex] = newTrack; ***

        console.log(`App: Assigned file to track index #${targetTrackIndex} for UI side ${side}. Initial speed: ${sm.getCurrentGlobalSpeed()}`);

        // Update UI
        AudioApp.uiManager.updateFileName(side, file.name); AudioApp.uiManager.setFileInfo(side, `Loading...`); AudioApp.uiManager.enableTrackControls(side, false); AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);

        // Start processing via audioEngine
        try {
            await AudioApp.audioEngine.setupTrack(targetTrackIndex, file);
        } catch (error) {
             console.error(`App: Error initiating processing for track #${targetTrackIndex} on UI side ${side}`, error);
             sm.clearTrackSlot(targetTrackIndex);
             AudioApp.uiManager.updateFileName(side, 'Load Error!'); AudioApp.uiManager.setFileInfo(side, `Error: ${error.message}`);
             if (!sm.getIsMultiChannelModeActive()) AudioApp.uiManager.showMultiTrackUI(false);
             if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        }
    }
    /** Handles `audioLoaded` event. */
    async function handleAudioLoaded(e) { /* ... (Implementation unchanged) ... */ const { audioBuffer, trackId: trackIndex } = e.detail; const sm = AudioApp.stateManager; const track = sm.getTrackByIndex(trackIndex); if (!track || track.audioBuffer || !track.isLoading) { console.warn(`App: handleAudioLoaded ignored for track #${trackIndex}.`); return; } console.log(`App: Audio decoded for track #${trackIndex}. Duration: ${audioBuffer.duration.toFixed(2)}s`); track.audioBuffer = audioBuffer; track.isLoading = false; const uiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (uiSide) { AudioApp.uiManager.setFileInfo(uiSide, `Ready: ${track.file?.name || 'Unknown'}`); if (trackIndex === sm.getLeftTrackIndex()) { runVadInBackground(trackIndex); } await drawTrackVisuals(uiSide); } else { console.warn(`App: Audio loaded for unassigned track index #${trackIndex}. No UI update.`); } const maxDuration = sm.calculateMaxEffectiveDuration(); const currentTime = calculateEstimatedSourceTime(); AudioApp.uiManager.updateTimeDisplay(currentTime, maxDuration); }
    /**
     * Handles `workletReady` event from audioEngine. Sets pan, applies mute state,
     * draws visuals, enables controls, manages multi-channel mode activation,
     * and enables Swap/Remove buttons when appropriate. Includes diagnostic logging.
     * @param {CustomEvent<{trackId: number}>} e - Event uses numeric trackId.
     * @private
     */
    async function handleWorkletReady(e) {
        const trackIndex = e.detail.trackId; // Numeric index from engine event
        const sm = AudioApp.stateManager;
        const track = sm.getTrackByIndex(trackIndex);
        // *** Log Entry ***
        console.log(`App: handleWorkletReady called for track #${trackIndex}.`);
        if (!track || !track.audioBuffer) { console.warn(`App: Worklet ready event ignored for track #${trackIndex}, track/buffer missing.`); return; }
        console.log(`App: Worklet ready for track #${trackIndex}. Applying initial parameters.`);
        track.isReady = true; track.isLoading = false; track.hasEnded = false; track.lastReportedTime = 0.0;
        const uiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null;

        // Apply initial parameters
        AudioApp.audioEngine.setVolume(trackIndex, track.parameters.volume);
        AudioApp.audioEngine.setTrackSpeed(trackIndex, track.parameters.speed);
        AudioApp.audioEngine.setTrackPitch(trackIndex, track.parameters.pitch);

        // Create Right Visualizers if needed
        if (trackIndex === sm.getRightTrackIndex() && !vizRefs.right.waveform) { /* ... create viz ... */ console.log("App: Creating Right visualizer instances."); try { vizRefs.right.waveform = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_right', indicatorId: 'waveformProgressIndicator_right' }); } catch(err) { console.error("Failed creating waveformVizRight", err); } try { vizRefs.right.spec = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_right', spinnerId: 'spectrogramSpinner_right', indicatorId: 'spectrogramProgressIndicator_right' }); } catch(err) { console.error("Failed creating specVizRight", err); } AudioApp.uiManager.showMultiTrackUI(true); }

        // --- Panning Logic ---
        AudioApp.audioEngine.setPan(trackIndex, 0); track.parameters.pan = 0; // Set initial pan & state
        const leftIdx = sm.getLeftTrackIndex(); const rightIdx = sm.getRightTrackIndex();
        const leftTrack = sm.getTrackByIndex(leftIdx);
        const rightTrack = sm.getTrackByIndex(rightIdx);
        // Re-evaluate readiness AFTER marking current track ready
        const leftTrackReady = leftTrack?.isReady ?? false;
        const rightTrackReady = rightTrack?.isReady ?? false;
        let multiModeNowActive = false; // Track if mode becomes active *in this call*

        // *** Diagnostic Log: Check conditions for multi-channel mode ***
        console.log(`App (handleWorkletReady #${trackIndex}): Checking multi-channel conditions - LeftIdx=${leftIdx}, RightIdx=${rightIdx}, LeftReady=${leftTrackReady}, RightReady=${rightTrackReady}`);

        if (leftIdx !== -1 && rightIdx !== -1 && leftTrackReady && rightTrackReady) { // Both assigned and ready
            if (!sm.getIsMultiChannelModeActive()) { // Check previous state
                 console.log("App: Both tracks ready, activating multi-channel L/R panning.");
                 sm.updateMultiChannelMode(); // Update state flag
                 multiModeNowActive = true; // Mark that mode was activated now
                 AudioApp.audioEngine.setPan(leftIdx, -1); if(leftTrack) leftTrack.parameters.pan = -1;
                 AudioApp.audioEngine.setPan(rightIdx, 1); if(rightTrack) rightTrack.parameters.pan = 1;
            } else {
                 console.log("App: Multi-channel mode already active.");
                 multiModeNowActive = true; // It remains active
            }
        } else { // Conditions not met
            if (sm.getIsMultiChannelModeActive()) { // If it WAS active
                 console.log("App: Conditions for multi-channel mode no longer met, deactivating.");
                 sm.updateMultiChannelMode(); // Update state flag
                 multiModeNowActive = false; // Mode deactivated
                 // Re-center pan
                 if (leftIdx !== -1 && leftTrackReady) { AudioApp.audioEngine.setPan(leftIdx, 0); if(leftTrack) leftTrack.parameters.pan = 0;}
                 if (rightIdx !== -1 && rightTrackReady) { AudioApp.audioEngine.setPan(rightIdx, 0); if(rightTrack) rightTrack.parameters.pan = 0;}
            } else {
                 console.log("App: Conditions not met, multi-channel mode remains inactive.");
                 multiModeNowActive = false;
            }
        }
        // --- End Panning Logic ---

        // ** Set Swap/Remove button state based on calculated multiModeNowActive **
        console.log(`App (handleWorkletReady #${trackIndex}): Setting Swap/Remove enabled state based on multiModeNowActive = ${multiModeNowActive}`);
        AudioApp.uiManager.enableSwapButton(multiModeNowActive);
        AudioApp.uiManager.enableRemoveButton(multiModeNowActive);


        // Apply mute state after potentially changing pan/multi-mode
        applyMuteState();

        // Update UI for the specific side
        if (uiSide) {
             AudioApp.uiManager.enableTrackControls(uiSide, true);
             console.log(`App: Checking conditions for UI side ${uiSide}. Is Left Channel Index? ${trackIndex === sm.getLeftTrackIndex()}`);
             if (trackIndex === sm.getLeftTrackIndex()) { // Track assigned to Left UI
                 console.log("App: Enabling Right Track Load Button."); AudioApp.uiManager.enableRightTrackLoadButton(true);
                 if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
             }
             await drawTrackVisuals(uiSide);
        } else { console.warn(`App: Worklet for track #${trackIndex} is ready, but it is not currently assigned to Left or Right UI channel.`); }

        // Check overall readiness for global controls
        if (areAllActiveTracksReady()) {
            console.log("App: All assigned tracks ready. Enabling global playback.");
            AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true);
            const maxDuration = sm.calculateMaxEffectiveDuration(); AudioApp.uiManager.updateTimeDisplay(sm.getPlaybackStartSourceTime(), maxDuration);
        } else { console.log("App: Waiting for other assigned track(s) to become ready."); AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log(`App: handleWorkletReady finished for track #${trackIndex}.`);
    }

    // --- Multi-Track Handlers ---
    /** Handles click on 'Remove Right' button. */
    async function handleRemoveTrack() { console.log("App: Remove Right UI channel track requested."); await handleRemoveTrackInternal(); }
    /** Internal logic to remove the track assigned to the Right UI channel. */
    async function handleRemoveTrackInternal(resetUICall = true) { const sm = AudioApp.stateManager; const trackIndexToRemove = sm.getRightTrackIndex(); if (trackIndexToRemove === -1) { console.log("App: No track assigned to Right channel to remove."); return; } console.log(`App: Removing track index #${trackIndexToRemove} assigned to Right channel.`); await AudioApp.audioEngine.cleanupTrack(trackIndexToRemove); sm.clearTrackSlot(trackIndexToRemove); // Clears state & assignment const leftIdx = sm.getLeftTrackIndex(); const leftTrack = sm.getTrackByIndex(leftIdx); if (leftIdx !== -1 && leftTrack?.isReady) { console.log(`App: Re-centering pan for remaining Left track #${leftIdx}`); AudioApp.audioEngine.setPan(leftIdx, 0); leftTrack.parameters.pan = 0; } if (resetUICall) { AudioApp.uiManager.showMultiTrackUI(false); AudioApp.uiManager.enableRightTrackLoadButton(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); AudioApp.uiManager.refreshTrackUI('right', null); } vizRefs.right.waveform = null; vizRefs.right.spec = null;
        // *** NEW: Apply mute state after removal might change context ***
        applyMuteState();
        if (leftTrack?.isReady) { AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); const maxDuration = sm.calculateMaxEffectiveDuration(); AudioApp.uiManager.updateTimeDisplay(sm.getPlaybackStartSourceTime(), maxDuration); } else { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); } console.log(`App: Track index #${trackIndexToRemove} removed.`);
    }
    /** Handles click on 'Swap L/R' button. */
    async function handleSwapTracks() { const sm = AudioApp.stateManager; if (!sm.getIsMultiChannelModeActive()) { console.warn("App: Cannot swap, not in multi-channel mode."); return; } const leftIdx = sm.getLeftTrackIndex(); const rightIdx = sm.getRightTrackIndex(); if (leftIdx === -1 || rightIdx === -1) { console.error("App: Swap requested but channel indices are invalid."); sm.updateMultiChannelMode(); AudioApp.uiManager.enableSwapButton(false); return; } console.log(`App: Swapping Left (idx ${leftIdx}) and Right (idx ${rightIdx}).`); sm.swapChannels(); const newLeftIdx = sm.getLeftTrackIndex(); const newRightIdx = sm.getRightTrackIndex(); AudioApp.audioEngine.setPan(newLeftIdx, -1); AudioApp.audioEngine.setPan(newRightIdx, 1); const newLeftTrack = sm.getTrackByIndex(newLeftIdx); const newRightTrack = sm.getTrackByIndex(newRightIdx); if (newLeftTrack) newLeftTrack.parameters.pan = -1; if (newRightTrack) newRightTrack.parameters.pan = 1; console.log("App: Refreshing UI after swap..."); AudioApp.uiManager.refreshTrackUI('left', newLeftTrack); AudioApp.uiManager.refreshTrackUI('right', newRightTrack); console.log("App: Redrawing visualizers after swap..."); try { await Promise.all([ drawTrackVisuals('left'), drawTrackVisuals('right') ]); } catch (drawError) { console.error("App: Error redrawing visuals after swap:", drawError); }
        // *** NEW: Apply mute state after swap ***
        applyMuteState();
        updateUIWithTime(calculateEstimatedSourceTime()); console.log(`App: Swap complete. Left is now idx ${newLeftIdx}, Right is now idx ${newRightIdx}.`);
    }
    /** Handles toggling the pitch link button. */
    function handleLinkPitchToggle(e) { const sm = AudioApp.stateManager; const newState = sm.togglePitchLink(); console.log("App: PitchLink set to", newState); }
    /** Handler for individual track volume changes. */
    function handleVolumeChange(side, volume) { const sm = AudioApp.stateManager; const trackIndex = sm.getTrackIndexForSide(side); if (trackIndex === -1) return; const track = sm.getTrackByIndex(trackIndex); if (!track || !track.isReady) return; const newVolume = Math.max(0, Math.min(parseFloat(volume) || 1.0, 1.5)); console.log(`App: Volume change for track #${trackIndex} (UI Side: ${side}) to ${newVolume.toFixed(2)}`); track.parameters.volume = newVolume; AudioApp.audioEngine.setVolume(trackIndex, newVolume); }
    /** Handler for individual track delay input changes. */
    function handleDelayChange(side, valueStr) { const sm = AudioApp.stateManager; const trackIndex = sm.getTrackIndexForSide(side); if (trackIndex === -1) return; const track = sm.getTrackByIndex(trackIndex); if (!track) return; const newOffsetSeconds = AudioApp.uiManager.parseDelayInput(valueStr); if (track.parameters.offsetSeconds !== newOffsetSeconds) { console.log(`App: Delay change for track #${trackIndex} (UI Side: ${side}) to ${newOffsetSeconds.toFixed(3)}s`); track.parameters.offsetSeconds = newOffsetSeconds; AudioApp.uiManager.setDelayValue(side, newOffsetSeconds); const maxDuration = sm.calculateMaxEffectiveDuration(); const currentDisplayTime = calculateEstimatedSourceTime(); AudioApp.uiManager.updateTimeDisplay(currentDisplayTime, maxDuration); if (sm.getPlaybackState() === 'playing') { console.log(`App: Delay changed while playing. Triggering seek to resync.`); const currentGlobalTime = calculateEstimatedSourceTime(); handleSeekInternal(currentGlobalTime); } } }

    /**
     * Handles Mute button toggle events.
     * @param {'left' | 'right'} side - The UI side of the button clicked.
     * @private NEW
     */
    function handleMuteToggle(side) {
        const sm = AudioApp.stateManager;
        const trackIndex = sm.getTrackIndexForSide(side);
        if (trackIndex === -1) { console.warn(`App: Mute toggle ignored for ${side}, no track assigned.`); return; }
        const track = sm.getTrackByIndex(trackIndex);
        if (!track) { console.error(`App: Mute toggle failed for ${side}, track data not found for index ${trackIndex}.`); return; }

        // Toggle the mute state in the state manager data
        track.parameters.isMuted = !track.parameters.isMuted;
        console.log(`App: Mute toggled for track #${trackIndex} (UI Side: ${side}) to ${track.parameters.isMuted}`);

        // Apply the new mute state to the audio engine
        applyMuteState();

        // Update the button's visual state
        AudioApp.uiManager.setMuteButtonState(side, track.parameters.isMuted);
    }

    // function handleSoloToggle(side) { // REMOVED }

    // --- Mute/Solo Application Logic ---
    /**
     * Applies the current mute states to the audio engine for all assigned tracks.
     * @private NEW
     */
    function applyMuteState() {
        console.log("App: Applying mute state to audio engine...");
        const sm = AudioApp.stateManager;
        const assignedIndices = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1);

        assignedIndices.forEach(trackIndex => {
            const track = sm.getTrackByIndex(trackIndex);
            if (track?.isReady) { // Only apply if track is ready
                const isMuted = track.parameters.isMuted;
                console.log(`App: Setting engine mute for track #${trackIndex} to ${isMuted}`);
                AudioApp.audioEngine.setMute(trackIndex, isMuted);
            } else {
                 console.log(`App: Skipping apply mute for track #${trackIndex}, not ready.`);
            }
        });
    }

    // --- VAD Processing ---
    /** Initiates VAD analysis for a given track index. */
    async function runVadInBackground(trackIndex) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const track = sm.getTrackByIndex(trackIndex); const uiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (!track?.audioBuffer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager) { console.error(`App (VAD Task #${trackIndex}): Missing dependencies or track data.`); return; } if (uiSide !== 'left') { console.log(`App (VAD Task #${trackIndex}): Skipping VAD as track is not on Left UI side.`); return; } if (track.vad.isProcessing) { console.warn(`App: VAD already running for track #${trackIndex}.`); return; } track.vad.isProcessing = true; track.vad.results = null; let pcm16k = null; if(uiSide) AudioApp.uiManager.setFileInfo(uiSide, `Processing VAD...`); if (uiSide === 'left') { AudioApp.uiManager.showVadProgress(true); AudioApp.uiManager.updateVadProgress(0); } try { if (!sm.getIsVadModelReady()) { sm.setVadModelReady(await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE)); if (!sm.getIsVadModelReady()) throw new Error("Failed VAD model create."); } pcm16k = await AudioApp.audioEngine.resampleTo16kMono(track.audioBuffer); if (!pcm16k || pcm16k.length === 0) throw new Error("Resampling yielded no data"); const vadProgressCallback = (p) => { if (uiSide === 'left') AudioApp.uiManager?.updateVadProgress(p.totalFrames > 0 ? (p.processedFrames / p.totalFrames) * 100 : 0); }; track.vad.results = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback }); const regions = track.vad.results.regions || []; console.log(`App (VAD Task #${trackIndex}): VAD done. Found ${regions.length} regions.`); const currentUiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (currentUiSide === uiSide && currentUiSide === 'left') { AudioApp.uiManager.updateVadDisplay(track.vad.results.initialPositiveThreshold, track.vad.results.initialNegativeThreshold); AudioApp.uiManager.setSpeechRegionsText(regions); if (track.isReady) AudioApp.uiManager.enableVadControls(true); vizRefs.left.waveform?.redrawWaveformHighlight(regions); AudioApp.uiManager.updateVadProgress(100); } else { console.log(`App (VAD Task #${trackIndex}): VAD finished, but track no longer assigned to original UI side ${uiSide} or not Left UI. Skipping VAD UI update.`); } } catch (error) { console.error(`App (VAD Task #${trackIndex}): VAD Error -`, error); const currentUiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (currentUiSide === uiSide && currentUiSide === 'left') { AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`); AudioApp.uiManager.enableVadControls(false); AudioApp.uiManager.updateVadProgress(0); } track.vad.results = null; } finally { track.vad.isProcessing = false; const currentUiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (currentUiSide === uiSide) { if (track.audioBuffer) AudioApp.uiManager.setFileInfo(currentUiSide, `Ready: ${track.file ? track.file.name : 'Unknown'}`); } if (uiSide === 'left') AudioApp.uiManager.showVadProgress(false); } }
    /** Generic handler for audio-related errors. */
    function handleAudioError(e) { /* ... (Implementation unchanged) ... */ const errorType = e.detail.type || 'Unknown'; const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred'; const trackIndex = (typeof e.detail.trackId === 'number') ? e.detail.trackId : -1; console.error(`App: Audio Error - Track Index: #${trackIndex}, Type: ${errorType}, Msg: ${errorMessage}`, e.detail.error); const sm = AudioApp.stateManager; if (trackIndex !== -1) { const track = sm.getTrackByIndex(trackIndex); if (track) { track.isLoading = false; track.isReady = false; if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } } const uiSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : (trackIndex === sm.getRightTrackIndex()) ? 'right' : null; if (uiSide) { AudioApp.uiManager.setFileInfo(uiSide, `Error (${errorType})`); AudioApp.uiManager.enableTrackControls(uiSide, false); if (uiSide === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); } } sm.clearTrackSlot(trackIndex); } else { console.log("App: Handling global audio error - resetting application."); resetAppStateAndUI(); AudioApp.uiManager.setFileInfo('left', `Fatal Error (${errorType}): ${errorMessage}`); } if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); } }

    // --- Global Playback Handlers ---
    /** Handles the Play/Pause button click. */
    function handlePlayPause() { /* ... (Implementation unchanged) ... */ console.log("App: Play/Pause button clicked."); const sm = AudioApp.stateManager; if (!areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AudioContext missing."); return; } const isCurrentlyPlaying = (sm.getPlaybackState() === 'playing'); const targetStatePlay = !isCurrentlyPlaying; if (targetStatePlay) { console.log("App: Handling Play/Resume request."); const ctxPlayTime = audioCtx.currentTime; const srcPlayTime = calculateEstimatedSourceTime(); console.log(`App: Starting playback from global source time ${srcPlayTime.toFixed(3)}s at context time ${ctxPlayTime.toFixed(3)}s`); sm.setPlaybackState('playing', ctxPlayTime, srcPlayTime); const indicesToPlay = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1); indicesToPlay.forEach(trackIndex => { const track = sm.getTrackByIndex(trackIndex); if (track?.isReady) { if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } const trackSeekTime = Math.max(0, srcPlayTime - track.parameters.offsetSeconds); AudioApp.audioEngine.seekTrack(trackIndex, trackSeekTime); track.hasEnded = false; const scheduledPlayTime = track.parameters.offsetSeconds; const timeUntilStart = scheduledPlayTime - srcPlayTime; const delayMs = Math.max(0, timeUntilStart * 1000); console.log(`App: Track #${trackIndex} - Offset: ${track.parameters.offsetSeconds.toFixed(3)}s, SeekTo: ${trackSeekTime.toFixed(3)}s, DelayMs: ${delayMs.toFixed(1)}ms`); track.playTimeoutId = setTimeout(() => { console.log(`App: Timeout fired - Playing track #${trackIndex}`); AudioApp.audioEngine.playTrack(trackIndex); track.playTimeoutId = null; }, delayMs); } }); AudioApp.uiManager.setPlayButtonState(true); startUIUpdateLoop(); } else { console.log("App: Handling Pause request."); const timeAtPause = calculateEstimatedSourceTime(); console.log(`App (Pause Debug): Calculated timeAtPause = ${timeAtPause.toFixed(5)}`); sm.setPlaybackState('paused', null, timeAtPause); stopUIUpdateLoop(); console.log(`App (Pause Debug): Stored playbackStartSourceTime = ${sm.getPlaybackStartSourceTime().toFixed(5)}`); sm.getTracksData().forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } }); AudioApp.audioEngine.togglePlayPause(false); AudioApp.uiManager.setPlayButtonState(false); console.log(`App (Pause Debug): Calling updateUIWithTime with ${sm.getPlaybackStartSourceTime().toFixed(5)}`); updateUIWithTime(sm.getPlaybackStartSourceTime()); } }
    /** Handles jump forward/backward requests. */
    function handleJump(e) { /* ... (Implementation unchanged) ... */ console.log("App: Handling Jump request."); if (!areAllActiveTracksReady()) return; const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return; const currentGlobalTime = calculateEstimatedSourceTime(); const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration)); handleSeekInternal(targetGlobalTime); }
    /** Handles seek requests from seek bar or canvas clicks. */
    function handleSeek(e) { /* ... (Implementation unchanged) ... */ console.log("App: Handling Seek request from", e.detail.sourceCanvasId || "SeekBar"); if (!areAllActiveTracksReady()) return; const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return; let targetGlobalTime = 0; const sm = AudioApp.stateManager; if (e.detail.sourceCanvasId) { const side = e.detail.sourceCanvasId.includes('_right') ? 'right' : 'left'; const trackIndex = sm.getTrackIndexForSide(side); const sourceTrack = sm.getTrackByIndex(trackIndex); if (sourceTrack?.audioBuffer) { const clickedTrackTargetTime = e.detail.fraction * sourceTrack.audioBuffer.duration; targetGlobalTime = clickedTrackTargetTime + sourceTrack.parameters.offsetSeconds; } else { return; } } else { targetGlobalTime = e.detail.fraction * maxDuration; } handleSeekInternal(targetGlobalTime); }
    /** Internal seek handler. */
    function handleSeekInternal(targetGlobalTime) { /* ... (Implementation unchanged, calls applyMuteState at end if resuming play) ... */
        if (!areAllActiveTracksReady()) { console.warn("App: Seek ignored - tracks not ready."); return; }
        const sm = AudioApp.stateManager; const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        const maxDuration = calculateMaxEffectiveDuration(); const clampedGlobalTime = Math.max(0, Math.min(targetGlobalTime, maxDuration));
        console.log(`App: Internal Seek. Target Global Time: ${clampedGlobalTime.toFixed(3)}s`);
        const wasPlaying = (sm.getPlaybackState() === 'playing');
        if (wasPlaying) { console.log("App (Seek): Pausing before seek..."); stopUIUpdateLoop(); sm.getTracksData().forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } }); AudioApp.audioEngine.togglePlayPause(false); }
        sm.setPlaybackState(sm.getPlaybackState(), null, clampedGlobalTime);
        console.log(`App (Seek): Seeking assigned tracks relative to ${clampedGlobalTime.toFixed(3)}s...`);
        const indicesToSeek = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1);
        indicesToSeek.forEach(trackIndex => { const track = sm.getTrackByIndex(trackIndex); if (track?.isReady) { const trackSeekTime = Math.max(0, clampedGlobalTime - track.parameters.offsetSeconds); AudioApp.audioEngine.seekTrack(trackIndex, trackSeekTime); track.hasEnded = false; track.lastReportedTime = trackSeekTime; } });
        updateUIWithTime(clampedGlobalTime);
        if (wasPlaying) { console.log("App (Seek): Resuming playback after seek..."); const newContextTime = audioCtx.currentTime; sm.setPlaybackState('playing', newContextTime, clampedGlobalTime); indicesToSeek.forEach(trackIndex => { const track = sm.getTrackByIndex(trackIndex); if (track?.isReady) { const scheduledPlayTime = track.parameters.offsetSeconds; const timeUntilStart = scheduledPlayTime - clampedGlobalTime; const delayMs = Math.max(0, timeUntilStart * 1000); console.log(`App (Seek-Resume): Track #${trackIndex} - DelayMs: ${delayMs.toFixed(1)}ms`); track.playTimeoutId = setTimeout(() => { console.log(`App: Timeout fired (Seek-Resume) - Playing track #${trackIndex}`); AudioApp.audioEngine.playTrack(trackIndex); track.playTimeoutId = null; }, delayMs); } });
            // ** NEW: Ensure mute state is reapplied after resuming **
            applyMuteState();
            startUIUpdateLoop();
        }
    }

    // --- Parameter Change Handlers ---
    /** Handles changes from the GLOBAL speed slider. */
    function handleGlobalSpeedChanged(e) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const newSpeedValue = Math.max(0.25, Math.min(parseFloat(e.detail.speed) || 1.0, 2.0)); if (Math.abs(sm.getCurrentGlobalSpeed() - newSpeedValue) < 1e-6) return; console.log(`App: Global speed changed to ${newSpeedValue.toFixed(2)}x`); const oldGlobalSpeed = sm.getCurrentGlobalSpeed(); sm.setCurrentGlobalSpeed(newSpeedValue); const indicesToChange = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1); indicesToChange.forEach(trackIndex => { const track = sm.getTrackByIndex(trackIndex); if (track?.isReady) { track.parameters.speed = newSpeedValue; AudioApp.audioEngine.setTrackSpeed(trackIndex, newSpeedValue); } }); const audioCtx = AudioApp.audioEngine.getAudioContext(); if (sm.getPlaybackState() === 'playing' && sm.getPlaybackStartTimeContext() !== null && audioCtx) { const elapsedContextTime = audioCtx.currentTime - sm.getPlaybackStartTimeContext(); const elapsedSourceTime = elapsedContextTime * oldGlobalSpeed; const previousSourceTime = sm.getPlaybackStartSourceTime() + elapsedSourceTime; sm.updateTimebaseForSpeedChange(audioCtx.currentTime, previousSourceTime); } debouncedSyncEngine(); }
    /** Handles pitch changes from UI sliders. */
    function handlePitchChange(side, pitch) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const newPitchValue = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0)); if (sm.getIsPitchLinked()) { console.log(`App: Linked pitch changed to ${newPitchValue.toFixed(2)}x`); const indicesToChange = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1); indicesToChange.forEach(trackIndex => { const track = sm.getTrackByIndex(trackIndex); if (track?.isReady) { track.parameters.pitch = newPitchValue; AudioApp.audioEngine.setTrackPitch(trackIndex, newPitchValue); const currentSide = (trackIndex === sm.getLeftTrackIndex()) ? 'left' : 'right'; AudioApp.uiManager.setSliderValue(document.getElementById(`pitch_${currentSide}`), newPitchValue, document.getElementById(`pitchValue_${currentSide}`), 'x'); } }); } else { const trackIndex = sm.getTrackIndexForSide(side); if (trackIndex === -1) return; const track = sm.getTrackByIndex(trackIndex); if (!track || !track.isReady) return; if (Math.abs(track.parameters.pitch - newPitchValue) < 1e-6) return; console.log(`App: Unlinked pitch for track #${trackIndex} (UI Side: ${side}) changed to ${newPitchValue.toFixed(2)}x`); track.parameters.pitch = newPitchValue; AudioApp.audioEngine.setTrackPitch(trackIndex, newPitchValue); } }
    /** Handles master gain changes from UI. */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); }
    /** Internal function to sync engine after debounced wait. */
    function syncEngineToEstimatedTime() { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; if (sm.getPlaybackState() !== 'playing' || !areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - not playing or tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; const targetGlobalTime = calculateEstimatedSourceTime(); console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`); handleSeekInternal(targetGlobalTime); }
    /** Handles VAD threshold changes from UI. */
    function handleThresholdChange(e) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const trackIndex = sm.getLeftTrackIndex(); if (trackIndex === -1) return; const track = sm.getTrackByIndex(trackIndex); if (!track || !track.vad.results || track.vad.isProcessing) return; const { type, value } = e.detail; const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value); AudioApp.uiManager.setSpeechRegionsText(newRegions); if(track.audioBuffer && vizRefs.left.waveform) { vizRefs.left.waveform.redrawWaveformHighlight(newRegions); } }
    /** Handles the `playbackEnded` event from a worklet. */
    function handlePlaybackEnded(e) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const trackIndex = e.detail.trackId; const track = sm.getTrackByIndex(trackIndex); if (!track) return; console.log(`App: Playback ended event received for track #${trackIndex}.`); track.hasEnded = true; const assignedIndices = [sm.getLeftTrackIndex(), sm.getRightTrackIndex()].filter(idx => idx !== -1); const activeTracksStillPlaying = assignedIndices.filter(idx => { const t = sm.getTrackByIndex(idx); return t?.isReady && !t.hasEnded; }); if (activeTracksStillPlaying.length === 0 && assignedIndices.length > 0) { console.log("App: All assigned tracks have ended playback."); const maxDuration = sm.calculateMaxEffectiveDuration(); sm.setPlaybackState('stopped', null, maxDuration); stopUIUpdateLoop(); AudioApp.uiManager.setPlayButtonState(false); updateUIWithTime(maxDuration); } }
    /** Informational handler for playback state changes. */
    function handlePlaybackStateChange(e) { /* Ignored */ }
    /** Handles `timeUpdated` event for drift calculation. */
    function handleTimeUpdate(e) { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const { currentTime, trackId: trackIndex } = e.detail; const track = sm.getTrackByIndex(trackIndex); if (track) { track.lastReportedTime = currentTime; } }
    /** Handles keyboard shortcuts. */
    function handleKeyPress(e) { /* ... (Implementation unchanged) ... */ console.log("App: Key pressed", e.detail.key); if (!areAllActiveTracksReady()) return; const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; } }
    /** Cleans up resources before page unload. */
    function handleBeforeUnload() { /* ... (Implementation unchanged) ... */ console.log("App: Unloading page..."); const sm = AudioApp.stateManager; sm.getTracksData().forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); } }); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); }
    /** Handles window resize events. */
    function handleWindowResize() { /* ... (Implementation unchanged) ... */ const sm = AudioApp.stateManager; const currentTime = calculateEstimatedSourceTime(); vizRefs.left.waveform?.resizeAndRedraw(); vizRefs.left.spec?.resizeAndRedraw(); if (sm.getIsMultiChannelModeActive()) { vizRefs.right.waveform?.resizeAndRedraw(); vizRefs.right.spec?.resizeAndRedraw(); } updateUIWithTime(currentTime); }

    // --- Main Thread Time Calculation & UI Update ---
    /** Starts the UI update loop. */
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { console.log("App: Starting UI update loop."); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    /** Stops the UI update loop. */
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { console.log("App: Stopping UI update loop."); cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }
    /** Calculates estimated global source time using stateManager. */
    function calculateEstimatedSourceTime() { const sm = AudioApp.stateManager; const audioCtx = AudioApp.audioEngine.getAudioContext(); const maxDuration = sm.calculateMaxEffectiveDuration(); const state = sm.getPlaybackState(); const startTimeCtx = sm.getPlaybackStartTimeContext(); const startTimeSrc = sm.getPlaybackStartSourceTime(); const speed = sm.getCurrentGlobalSpeed(); if (state !== 'playing' || startTimeCtx === null || !audioCtx || maxDuration <= 0) { return startTimeSrc; } if (speed <= 0) { return startTimeSrc; } const elapsedContextTime = audioCtx.currentTime - startTimeCtx; const elapsedSourceTime = elapsedContextTime * speed; let estimatedCurrentGlobalTime = startTimeSrc + elapsedSourceTime; return Math.max(0, Math.min(estimatedCurrentGlobalTime, maxDuration)); }
     /** Updates UI time, seek bar, drift, and visualization indicators using stateManager. */
     function updateUIWithTime(globalTime) { const sm = AudioApp.stateManager; const maxEffectiveDuration = sm.calculateMaxEffectiveDuration(); const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration)); const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0; AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration); AudioApp.uiManager.updateSeekBar(fraction); let driftMs = 0; const leftTrack = sm.getTrackByIndex(sm.getLeftTrackIndex()); const rightTrack = sm.getTrackByIndex(sm.getRightTrackIndex()); if (sm.getIsMultiChannelModeActive() && leftTrack?.isReady && rightTrack?.isReady) { driftMs = (leftTrack.lastReportedTime - rightTrack.lastReportedTime) * 1000; } AudioApp.uiManager.updateDriftDisplay(driftMs); if (leftTrack?.audioBuffer && vizRefs.left.waveform?.updateProgressIndicator) { vizRefs.left.waveform.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } if (leftTrack?.audioBuffer && vizRefs.left.spec?.updateProgressIndicator) { vizRefs.left.spec.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } if (sm.getIsMultiChannelModeActive() && rightTrack?.audioBuffer && vizRefs.right.waveform?.updateProgressIndicator) { vizRefs.right.waveform.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); } if (sm.getIsMultiChannelModeActive() && rightTrack?.audioBuffer && vizRefs.right.spec?.updateProgressIndicator) { vizRefs.right.spec.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); } }
    /** The rAF loop function using stateManager. */
    function updateUIBasedOnContextTime(timestamp) { const sm = AudioApp.stateManager; if (sm.getPlaybackState() !== 'playing') { rAFUpdateHandle = null; return; } const estimatedGlobalTime = calculateEstimatedSourceTime(); updateUIWithTime(estimatedGlobalTime); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); }

    // --- Public Interface ---
    return {
        init: init
    };
})();
// --- /vibe-player/js/app.js ---