// --- /vibe-player/js/app.js ---
// Orchestrates the Vibe Player application flow.
// Manages application state including multiple tracks using track indirection.
// Handles user interactions, audio engine communication, VAD, and visualization updates.
// REFACTORED to use a single global speed control.

/**
 * @namespace AudioApp
 * @description Main application namespace for Vibe Player.
 */
var AudioApp = AudioApp || {};

AudioApp = (function() {
    'use strict';

    // === Module Dependencies ===
    // Access modules via AudioApp.* after init check.

    // --- Application State ---
    /**
     * @typedef {object} TrackState Represents the state of a single audio track.
     * @property {number} id - The numeric index of this track in the tracksData array.
     * @property {File|null} file - The original audio file object.
     * @property {AudioBuffer|null} audioBuffer - The decoded audio buffer.
     * @property {boolean} isLoading - Is the track currently loading/decoding?
     * @property {boolean} isReady - Is the track's worklet ready for playback commands?
     * @property {boolean} hasEnded - Has the worklet reported the end of this track's playback?
     * @property {object} parameters - Playback parameters for this track.
     * @property {number} parameters.offsetSeconds - Playback start offset in seconds.
     * @property {number} parameters.volume - Individual track volume (0.0 to 1.5+).
     * @property {number} parameters.speed - Individual track target speed (now always matches global speed).
     * @property {number} parameters.pitch - Individual track target pitch (used if unlinked).
     * @property {number} parameters.pan - Stereo pan (-1 Left, 0 Center, 1 Right).
     * @property {boolean} parameters.isMuted - User-requested mute state.
     * @property {boolean} parameters.isSoloed - User-requested solo state.
     * @property {object} vad - VAD related state.
     * @property {VadResult|null} vad.results - Results from VAD analysis.
     * @property {boolean} vad.isProcessing - Is VAD currently running for this track?
     * @property {number|null} playTimeoutId - ID of the scheduled 'play' command timeout.
     * @property {number} lastReportedTime - Last source time reported by this track's worklet.
     */
     /** Creates an initial state object for a track at a given index. */
     function createInitialTrackState(trackIndex) {
         return {
             id: trackIndex, file: null, audioBuffer: null, isLoading: false, isReady: false, hasEnded: false,
             parameters: { offsetSeconds: 0.0, volume: 1.0, speed: 1.0, pitch: 1.0, pan: 0.0, isMuted: false, isSoloed: false, },
             vad: { results: null, isProcessing: false, },
             playTimeoutId: null, lastReportedTime: 0.0,
         };
     }

     /** @type {Array<TrackState | null>} Array holding track data. */
     let tracksData = [];
     /** @type {number} Index in tracksData assigned to the Left UI channel, or -1. */
     let leftChannelTrackIndex = -1;
     /** @type {number} Index in tracksData assigned to the Right UI channel, or -1. */
     let rightChannelTrackIndex = -1;
     /** @type {boolean} True if both L/R channels have valid tracks assigned. */
     let isMultiChannelModeActive = false;

     // --- Global Playback State ---
     // let speedLinked = true; // REMOVED - Speed is always global/linked now
     let pitchLinked = true; // Keep pitch linking state
     let globalPlaybackState = 'stopped';
     let playbackStartTimeContext = null;
     let playbackStartSourceTime = 0.0;
     let rAFUpdateHandle = null;
     let currentGlobalSpeed = 1.0; // Single global speed value
     let vadModelReady = false;
     let debouncedSyncEngine = null;
     const SYNC_DEBOUNCE_WAIT_MS = 300;

    /** @type {object} Holds references to visualizer instances, keyed by UI side. */
    let vizRefs = { left: { waveform: null, spec: null }, right: { waveform: null, spec: null } };

    // --- Initialization ---
    /** Initializes the application. */
    function init() {
        console.log("AudioApp: Initializing...");
        // Dependency Check
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer?.createInstance || !AudioApp.spectrogramVisualizer?.createInstance || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.Constants || !AudioApp.Utils)
        { console.error(`AudioApp: CRITICAL - Required modules missing.`); return; }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);
        AudioApp.uiManager.init();
        AudioApp.audioEngine.init(); // Start engine init (fetches resources async)

        // Create Left Visualizers
        try {
            vizRefs.left.waveform = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_left', indicatorId: 'waveformProgressIndicator_left' });
            vizRefs.left.spec = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_left', spinnerId: 'spectrogramSpinner_left', indicatorId: 'spectrogramProgressIndicator_left' });
            console.log("AudioApp: Left visualizer instances created.");
        } catch (vizError) { console.error("AudioApp: CRITICAL - Failed to create visualizer instances:", vizError); }

        setupAppEventListeners();
        resetAppStateAndUI();
        console.log("AudioApp: Initialized. Waiting for file...");
    }

    // --- State Reset ---
    /** Resets the application state and UI. */
    function resetAppStateAndUI() {
         console.log("AudioApp: Resetting application state and UI.");
         tracksData.forEach(track => { if (track?.playTimeoutId) clearTimeout(track.playTimeoutId); });
         stopUIUpdateLoop();
         tracksData = []; leftChannelTrackIndex = -1; rightChannelTrackIndex = -1; isMultiChannelModeActive = false;
         // speedLinked removed
         pitchLinked = true; globalPlaybackState = 'stopped'; playbackStartTimeContext = null; playbackStartSourceTime = 0.0;
         currentGlobalSpeed = 1.0; // Reset global speed state
         vizRefs.left.waveform?.clearVisuals(); vizRefs.left.spec?.clearVisuals();
         vizRefs.right.waveform?.clearVisuals(); vizRefs.right.spec?.clearVisuals();
         vizRefs.right.waveform = null; vizRefs.right.spec = null;
         AudioApp.uiManager.resetUI(); // Resets UI elements including global speed slider
    }

    // --- Event Listener Setup ---
    /** Sets up application event listeners. */
    function setupAppEventListeners() {
        // File/Track Management
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrack);
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracks);
        // Linking (Only Pitch)
        // document.removeEventListener('audioapp:linkSpeedToggled', handleLinkSpeedToggle); // REMOVED Speed Link listener
        document.addEventListener('audioapp:linkPitchToggled', handleLinkPitchToggle);
        // Track Parameters (No Speed)
        document.addEventListener('audioapp:volumeChanged_left', (e) => handleVolumeChange('left', e.detail.volume));
        document.addEventListener('audioapp:volumeChanged_right', (e) => handleVolumeChange('right', e.detail.volume));
        document.addEventListener('audioapp:delayChanged_left', (e) => handleDelayChange('left', e.detail.value));
        document.addEventListener('audioapp:delayChanged_right', (e) => handleDelayChange('right', e.detail.value));
        // document.removeEventListener('audioapp:speedChanged_left', handleSpeedChange); // REMOVED listener
        // document.removeEventListener('audioapp:speedChanged_right', handleSpeedChange); // REMOVED listener
        document.addEventListener('audioapp:pitchChanged_left', (e) => handlePitchChange('left', e.detail.pitch));
        document.addEventListener('audioapp:pitchChanged_right', (e) => handlePitchChange('right', e.detail.pitch));
        document.addEventListener('audioapp:muteToggled_left', () => handleMuteToggle('left'));
        document.addEventListener('audioapp:muteToggled_right', () => handleMuteToggle('right'));
        document.addEventListener('audioapp:soloToggled_left', () => handleSoloToggle('left'));
        document.addEventListener('audioapp:soloToggled_right', () => handleSoloToggle('right'));
        // Global Playback & Seek
        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek);
        document.addEventListener('audioapp:seekBarInput', handleSeek);
        document.addEventListener('audioapp:gainChanged', handleMasterGainChange);
        document.addEventListener('audioapp:globalSpeedChanged', handleGlobalSpeedChanged); // ** NEW listener **
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
    /** Finds the first index in tracksData that is null, or adds a new slot. */
    function findFirstAvailableSlot() { const nullIndex = tracksData.findIndex(slot => slot === null); if (nullIndex !== -1) return nullIndex; tracksData.push(null); return tracksData.length - 1; }
    /** Safely gets track data by index. */
    function getTrackDataByIndex(index) { return (index >= 0 && index < tracksData.length) ? tracksData[index] : null; }
    /** Gets the track index currently assigned to a UI side. */
    function getTrackIndexForSide(side) { return side === 'left' ? leftChannelTrackIndex : rightChannelTrackIndex; }
    /** Checks if a UI side currently has a track assigned. */
    function isSideAssigned(side) { return getTrackIndexForSide(side) !== -1; }
    /** Checks if all currently assigned tracks are loaded and ready. */
    function areAllActiveTracksReady() { const leftTrack = getTrackDataByIndex(leftChannelTrackIndex); if (!leftTrack?.isReady) return false; if (rightChannelTrackIndex !== -1) { const rightTrack = getTrackDataByIndex(rightChannelTrackIndex); if (!rightTrack?.isReady) return false; } return true; }
    /** Counts how many valid track state objects exist. */
    function getLoadedTrackCount() { return tracksData.filter(t => t !== null).length; }
    /** Calculates the maximum effective duration considering offsets of assigned tracks. */
    function calculateMaxEffectiveDuration() { let maxDuration = 0; const leftTrack = getTrackDataByIndex(leftChannelTrackIndex); const rightTrack = getTrackDataByIndex(rightChannelTrackIndex); if (leftTrack?.audioBuffer) maxDuration = Math.max(maxDuration, leftTrack.parameters.offsetSeconds + leftTrack.audioBuffer.duration); if (rightTrack?.audioBuffer) maxDuration = Math.max(maxDuration, rightTrack.parameters.offsetSeconds + rightTrack.audioBuffer.duration); return isNaN(maxDuration) ? 0 : maxDuration; }
    /** Computes and draws visuals for the track assigned to a specific UI side. */
     async function drawTrackVisuals(side) {
         const trackIndex = getTrackIndexForSide(side); const track = getTrackDataByIndex(trackIndex); const targetVizRefs = vizRefs[side];
         if (!track?.audioBuffer || !targetVizRefs) { console.warn(`App: Cannot draw visuals for UI side ${side}, track data or viz refs missing.`); return; }
         console.log(`App: Drawing/Redrawing visuals for track #${trackIndex} on UI side ${side}...`);
         try { const vadRegions = track.vad.results ? (track.vad.results.regions || []) : null;
             if (targetVizRefs.waveform?.computeAndDrawWaveform) { await targetVizRefs.waveform.computeAndDrawWaveform(track.audioBuffer, vadRegions); }
             else { console.warn(`App: Waveform Visualizer for UI side ${side} not available.`); }
             if (targetVizRefs.spec?.computeAndDrawSpectrogram) { await targetVizRefs.spec.computeAndDrawSpectrogram(track.audioBuffer); }
             else { console.warn(`App: Spectrogram Visualizer for UI side ${side} not available.`); }
         } catch (visError) { console.error(`App: Error drawing visuals for UI side ${side} (Track #${trackIndex}):`, visError); }
     }

    // --- Event Handler Functions ---

    /** Handles file selection for a UI side. */
    async function handleFileSelected(e) {
        const { file, trackId: side } = e.detail; if (!file) return;
        console.log(`App: File selected for UI side ${side} - ${file.name}`);
        let targetTrackIndex = -1; let isReplacingLeft = false;

        if (side === 'left') { // Still reset state when loading left for now
            console.log("App: Loading Left channel - resetting application state."); isReplacingLeft = true;
            // TODO: Implement non-resetting left load later if needed
            await resetAppStateAndUI(); // Full reset includes cleaning engine tracks
            targetTrackIndex = findFirstAvailableSlot(); leftChannelTrackIndex = targetTrackIndex;
        } else { // Loading Right
            if (leftChannelTrackIndex === -1) { console.warn("App: Cannot load Right channel before Left channel."); AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return; }
            if (rightChannelTrackIndex !== -1) { console.log("App: Right channel already loaded, replacing existing track."); await handleRemoveTrackInternal(false); } // Remove without full UI reset
            targetTrackIndex = findFirstAvailableSlot(); rightChannelTrackIndex = targetTrackIndex;
            AudioApp.uiManager.showMultiTrackUI(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
        }

        const newTrack = createInitialTrackState(targetTrackIndex); newTrack.file = file; newTrack.isLoading = true;
        // ** Inherit Global Speed on load **
        newTrack.parameters.speed = currentGlobalSpeed;
        tracksData[targetTrackIndex] = newTrack;
        console.log(`App: Assigned file to track index #${targetTrackIndex} for UI side ${side}. Initial speed: ${currentGlobalSpeed}`);

        AudioApp.uiManager.updateFileName(side, file.name); AudioApp.uiManager.setFileInfo(side, `Loading...`); AudioApp.uiManager.enableTrackControls(side, false); AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);

        try { await AudioApp.audioEngine.setupTrack(targetTrackIndex, file); }
        catch (error) {
             console.error(`App: Error initiating processing for track #${targetTrackIndex} on UI side ${side}`, error); tracksData[targetTrackIndex] = null;
             if (side === 'left') { leftChannelTrackIndex = -1; resetAppStateAndUI(); } else { rightChannelTrackIndex = -1; isMultiChannelModeActive = false; AudioApp.uiManager.showMultiTrackUI(false); }
             AudioApp.uiManager.updateFileName(side, 'Load Error!'); AudioApp.uiManager.setFileInfo(side, `Error: ${error.message}`);
             if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        }
    }

    /** Handles `audioLoaded` event. */
    async function handleAudioLoaded(e) {
         const { audioBuffer, trackId: trackIndex } = e.detail; const track = getTrackDataByIndex(trackIndex);
         if (!track || track.audioBuffer || !track.isLoading) { console.warn(`App: handleAudioLoaded ignored for track #${trackIndex}.`); return; }
         console.log(`App: Audio decoded for track #${trackIndex}. Duration: ${audioBuffer.duration.toFixed(2)}s`);
         track.audioBuffer = audioBuffer; track.isLoading = false;
         const uiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null;

         if (uiSide) {
             AudioApp.uiManager.setFileInfo(uiSide, `Ready: ${track.file?.name || 'Unknown'}`);
             // TODO: Adapt VAD trigger logic when right-track VAD is added
             if (trackIndex === leftChannelTrackIndex) { runVadInBackground(trackIndex); }
             await drawTrackVisuals(uiSide);
         } else { console.warn(`App: Audio loaded for unassigned track index #${trackIndex}. No UI update.`); }
         const maxDuration = calculateMaxEffectiveDuration(); const currentTime = calculateEstimatedSourceTime();
         AudioApp.uiManager.updateTimeDisplay(currentTime, maxDuration);
    }

    /** Handles `workletReady` event. */
    async function handleWorkletReady(e) {
        const trackIndex = e.detail.trackId; const track = getTrackDataByIndex(trackIndex);
        console.log(`App: handleWorkletReady called for track #${trackIndex}.`);
        if (!track || !track.audioBuffer) { console.warn(`App: Worklet ready event ignored for track #${trackIndex}, track/buffer missing.`); return; }
        console.log(`App: Worklet ready for track #${trackIndex}. Applying initial parameters.`);
        track.isReady = true; track.isLoading = false; track.hasEnded = false; track.lastReportedTime = 0.0;
        const uiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null;

        // Apply initial parameters (Volume, Pitch, Global Speed)
        AudioApp.audioEngine.setVolume(trackIndex, track.parameters.volume);
        AudioApp.audioEngine.setTrackSpeed(trackIndex, track.parameters.speed); // Speed is now from global/inherited
        AudioApp.audioEngine.setTrackPitch(trackIndex, track.parameters.pitch);

        // Create Right Visualizers if needed
        if (trackIndex === rightChannelTrackIndex && !vizRefs.right.waveform) {
             console.log("App: Creating Right visualizer instances.");
             try { vizRefs.right.waveform = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_right', indicatorId: 'waveformProgressIndicator_right' }); } catch(err) { console.error("Failed creating waveformVizRight", err); }
             try { vizRefs.right.spec = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_right', spinnerId: 'spectrogramSpinner_right', indicatorId: 'spectrogramProgressIndicator_right' }); } catch(err) { console.error("Failed creating specVizRight", err); }
             AudioApp.uiManager.showMultiTrackUI(true);
        }

        // Panning Logic
        AudioApp.audioEngine.setPan(trackIndex, 0); track.parameters.pan = 0;
        const leftIdx = leftChannelTrackIndex; const rightIdx = rightChannelTrackIndex;
        const leftTrackReady = getTrackDataByIndex(leftIdx)?.isReady ?? false;
        const rightTrackReady = getTrackDataByIndex(rightIdx)?.isReady ?? false;
        if (leftIdx !== -1 && rightIdx !== -1 && leftTrackReady && rightTrackReady) {
            if (!isMultiChannelModeActive) { console.log("App: Both tracks ready, activating multi-channel L/R panning."); isMultiChannelModeActive = true; AudioApp.audioEngine.setPan(leftIdx, -1); getTrackDataByIndex(leftIdx).parameters.pan = -1; AudioApp.audioEngine.setPan(rightIdx, 1); getTrackDataByIndex(rightIdx).parameters.pan = 1; AudioApp.uiManager.enableSwapButton(true); AudioApp.uiManager.enableRemoveButton(true); }
        } else { if (isMultiChannelModeActive) { console.log("App: Conditions for multi-channel mode no longer met, deactivating."); isMultiChannelModeActive = false; if (leftIdx !== -1 && leftTrackReady) { AudioApp.audioEngine.setPan(leftIdx, 0); getTrackDataByIndex(leftIdx).parameters.pan = 0;} if (rightIdx !== -1 && rightTrackReady) { AudioApp.audioEngine.setPan(rightIdx, 0); getTrackDataByIndex(rightIdx).parameters.pan = 0;} AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); } }

        // Update UI for the specific side
        if (uiSide) {
             AudioApp.uiManager.enableTrackControls(uiSide, true);
             console.log(`App: Checking conditions for UI side ${uiSide}. Is Left Channel Index? ${trackIndex === leftChannelTrackIndex}`);
             if (trackIndex === leftChannelTrackIndex) {
                 console.log("App: Enabling Right Track Load Button.");
                 AudioApp.uiManager.enableRightTrackLoadButton(true);
                 if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
             }
             await drawTrackVisuals(uiSide);
        } else { console.warn(`App: Worklet for track #${trackIndex} is ready, but it is not currently assigned to Left or Right UI channel.`); }

        // Check global readiness
        if (areAllActiveTracksReady()) {
            console.log("App: All assigned tracks ready. Enabling global playback.");
            AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true);
            const maxDuration = calculateMaxEffectiveDuration(); AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, maxDuration);
        } else { console.log("App: Waiting for other assigned track(s) to become ready."); AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log(`App: handleWorkletReady finished for track #${trackIndex}.`);
    }

    // --- Multi-Track Handlers ---
    /** Handles click on 'Remove Right' button. */
    async function handleRemoveTrack() { console.log("App: Remove Right UI channel track requested."); await handleRemoveTrackInternal(); }
    /** Internal logic to remove the track assigned to the Right UI channel. */
    async function handleRemoveTrackInternal(resetUICall = true) {
        const trackIndexToRemove = rightChannelTrackIndex; if (trackIndexToRemove === -1) { console.log("App: No track assigned to Right channel to remove."); return; }
        const track = getTrackDataByIndex(trackIndexToRemove);
        console.log(`App: Removing track index #${trackIndexToRemove} assigned to Right channel.`);
        if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; }
        await AudioApp.audioEngine.cleanupTrack(trackIndexToRemove);
        tracksData[trackIndexToRemove] = null; rightChannelTrackIndex = -1; isMultiChannelModeActive = false;
        const leftTrack = getTrackDataByIndex(leftChannelTrackIndex);
        if (leftChannelTrackIndex !== -1 && leftTrack?.isReady) { console.log(`App: Re-centering pan for remaining Left track #${leftChannelTrackIndex}`); AudioApp.audioEngine.setPan(leftChannelTrackIndex, 0); leftTrack.parameters.pan = 0; }
        if (resetUICall) { AudioApp.uiManager.showMultiTrackUI(false); AudioApp.uiManager.enableRightTrackLoadButton(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); AudioApp.uiManager.refreshTrackUI('right', null); }
        vizRefs.right.waveform = null; vizRefs.right.spec = null;
        if (leftTrack?.isReady) { AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); const maxDuration = calculateMaxEffectiveDuration(); AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, maxDuration); }
        else { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log(`App: Track index #${trackIndexToRemove} removed.`);
    }
    /** Handles click on 'Swap L/R' button. */
    async function handleSwapTracks() {
        if (!isMultiChannelModeActive) { console.warn("App: Cannot swap, not in multi-channel mode."); return; }
        if (leftChannelTrackIndex === -1 || rightChannelTrackIndex === -1) { console.error("App: Swap requested but channel indices are invalid."); isMultiChannelModeActive = false; AudioApp.uiManager.enableSwapButton(false); return; }
        console.log(`App: Swapping Left (idx ${leftChannelTrackIndex}) and Right (idx ${rightChannelTrackIndex}).`);
        const tempIndex = leftChannelTrackIndex; leftChannelTrackIndex = rightChannelTrackIndex; rightChannelTrackIndex = tempIndex;
        AudioApp.audioEngine.setPan(leftChannelTrackIndex, -1); AudioApp.audioEngine.setPan(rightChannelTrackIndex, 1);
        const newLeftTrack = getTrackDataByIndex(leftChannelTrackIndex); const newRightTrack = getTrackDataByIndex(rightChannelTrackIndex);
        if (newLeftTrack) newLeftTrack.parameters.pan = -1; if (newRightTrack) newRightTrack.parameters.pan = 1;
        console.log("App: Refreshing UI after swap..."); AudioApp.uiManager.refreshTrackUI('left', newLeftTrack); AudioApp.uiManager.refreshTrackUI('right', newRightTrack);
        console.log("App: Redrawing visualizers after swap...");
        try { await Promise.all([ drawTrackVisuals('left'), drawTrackVisuals('right') ]); }
        catch (drawError) { console.error("App: Error redrawing visuals after swap:", drawError); }
        const currentTime = calculateEstimatedSourceTime(); updateUIWithTime(currentTime);
        console.log(`App: Swap complete. Left is now idx ${leftChannelTrackIndex}, Right is now idx ${rightChannelTrackIndex}.`);
    }
    /** Handles toggling the pitch link button. */
    function handleLinkPitchToggle(e) { pitchLinked = e.detail.linked; console.log("App: PitchLink set to", pitchLinked); /* UI update handled by uiManager */ }
    /** Handler for individual track volume changes. */
    function handleVolumeChange(side, volume) { const trackIndex = getTrackIndexForSide(side); if (trackIndex === -1) return; const track = getTrackDataByIndex(trackIndex); if (!track || !track.isReady) return; const newVolume = Math.max(0, Math.min(parseFloat(volume) || 1.0, 1.5)); console.log(`App: Volume change for track #${trackIndex} (UI Side: ${side}) to ${newVolume.toFixed(2)}`); track.parameters.volume = newVolume; AudioApp.audioEngine.setVolume(trackIndex, newVolume); }
    /** Handler for individual track delay input changes. */
     function handleDelayChange(side, valueStr) { const trackIndex = getTrackIndexForSide(side); if (trackIndex === -1) return; const track = getTrackDataByIndex(trackIndex); if (!track) return; const newOffsetSeconds = AudioApp.uiManager.parseDelayInput(valueStr); if (track.parameters.offsetSeconds !== newOffsetSeconds) { console.log(`App: Delay change for track #${trackIndex} (UI Side: ${side}) to ${newOffsetSeconds.toFixed(3)}s`); track.parameters.offsetSeconds = newOffsetSeconds; AudioApp.uiManager.setDelayValue(side, newOffsetSeconds); const maxDuration = calculateMaxEffectiveDuration(); const currentDisplayTime = calculateEstimatedSourceTime(); AudioApp.uiManager.updateTimeDisplay(currentDisplayTime, maxDuration); if (globalPlaybackState === 'playing') { console.log(`App: Delay changed while playing. Triggering seek to resync.`); const currentGlobalTime = calculateEstimatedSourceTime(); handleSeekInternal(currentGlobalTime); } } }
    /** Placeholder for Mute toggle. */
    function handleMuteToggle(side) { console.warn(`Mute toggle for ${side} not implemented yet.`); }
    /** Placeholder for Solo toggle. */
    function handleSoloToggle(side) { console.warn(`Solo toggle for ${side} not implemented yet.`); }

    // --- VAD Processing ---
    /** Initiates VAD analysis for a given track index. */
    async function runVadInBackground(trackIndex) { /* ... (Implementation unchanged, still only triggers VAD UI/Highlight for Left UI) ... */
        const track = getTrackDataByIndex(trackIndex); const uiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null;
        if (!track?.audioBuffer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager) { console.error(`App (VAD Task #${trackIndex}): Missing dependencies or track data.`); return; }
        // TODO: Adapt VAD target logic for Right VAD Phase
        if (uiSide !== 'left') { console.log(`App (VAD Task #${trackIndex}): Skipping VAD as track is not on Left UI side.`); return; }
        if (track.vad.isProcessing) { console.warn(`App: VAD already running for track #${trackIndex}.`); return; }
        track.vad.isProcessing = true; track.vad.results = null; let pcm16k = null;
        if(uiSide) AudioApp.uiManager.setFileInfo(uiSide, `Processing VAD...`);
        if (uiSide === 'left') { AudioApp.uiManager.showVadProgress(true); AudioApp.uiManager.updateVadProgress(0); }
        try { if (!vadModelReady) { vadModelReady = await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE); if (!vadModelReady) throw new Error("Failed VAD model create."); }
            pcm16k = await AudioApp.audioEngine.resampleTo16kMono(track.audioBuffer); if (!pcm16k || pcm16k.length === 0) throw new Error("Resampling yielded no data");
            const vadProgressCallback = (p) => { if (uiSide === 'left') AudioApp.uiManager?.updateVadProgress(p.totalFrames > 0 ? (p.processedFrames / p.totalFrames) * 100 : 0); };
            track.vad.results = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback });
            const regions = track.vad.results.regions || []; console.log(`App (VAD Task #${trackIndex}): VAD done. Found ${regions.length} regions.`);
            const currentUiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null;
            if (currentUiSide === uiSide && currentUiSide === 'left') { AudioApp.uiManager.updateVadDisplay(track.vad.results.initialPositiveThreshold, track.vad.results.initialNegativeThreshold); AudioApp.uiManager.setSpeechRegionsText(regions); if (track.isReady) AudioApp.uiManager.enableVadControls(true); vizRefs.left.waveform?.redrawWaveformHighlight(regions); AudioApp.uiManager.updateVadProgress(100); }
            else { console.log(`App (VAD Task #${trackIndex}): VAD finished, but track no longer assigned to original UI side ${uiSide} or not Left UI. Skipping VAD UI update.`); }
        } catch (error) { console.error(`App (VAD Task #${trackIndex}): VAD Error -`, error); const currentUiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null; if (currentUiSide === uiSide && currentUiSide === 'left') { AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`); AudioApp.uiManager.enableVadControls(false); AudioApp.uiManager.updateVadProgress(0); } track.vad.results = null;
        } finally { track.vad.isProcessing = false; const currentUiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null; if (currentUiSide === uiSide) { if (track.audioBuffer) AudioApp.uiManager.setFileInfo(currentUiSide, `Ready: ${track.file ? track.file.name : 'Unknown'}`); } if (uiSide === 'left') AudioApp.uiManager.showVadProgress(false); }
    }
     /** Generic handler for audio-related errors. */
    function handleAudioError(e) { /* ... (Implementation unchanged, uses numeric index) ... */
        const errorType = e.detail.type || 'Unknown'; const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred'; const trackIndex = (typeof e.detail.trackId === 'number') ? e.detail.trackId : -1; console.error(`App: Audio Error - Track Index: #${trackIndex}, Type: ${errorType}, Msg: ${errorMessage}`, e.detail.error); if (trackIndex !== -1 && trackIndex < tracksData.length && tracksData[trackIndex]) { const track = tracksData[trackIndex]; track.isLoading = false; track.isReady = false; if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } const uiSide = (trackIndex === leftChannelTrackIndex) ? 'left' : (trackIndex === rightChannelTrackIndex) ? 'right' : null; if (uiSide) { AudioApp.uiManager.setFileInfo(uiSide, `Error (${errorType})`); AudioApp.uiManager.enableTrackControls(uiSide, false); if (uiSide === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); } } } else { console.log("App: Handling global audio error - resetting application."); resetAppStateAndUI(); AudioApp.uiManager.setFileInfo('left', `Fatal Error (${errorType}): ${errorMessage}`); } if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
    }

    // --- Global Playback Handlers ---
    /** Handles the Play/Pause button click. */
    function handlePlayPause() { /* ... (Implementation unchanged, uses indicesToPlay) ... */
        console.log("App: Play/Pause button clicked."); if (!areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AudioContext missing."); return; } const isCurrentlyPlaying = (globalPlaybackState === 'playing'); const targetStatePlay = !isCurrentlyPlaying; if (targetStatePlay) { console.log("App: Handling Play/Resume request."); const ctxPlayTime = audioCtx.currentTime; const srcPlayTime = calculateEstimatedSourceTime(); console.log(`App: Starting playback from global source time ${srcPlayTime.toFixed(3)}s at context time ${ctxPlayTime.toFixed(3)}s`); globalPlaybackState = 'playing'; playbackStartTimeContext = ctxPlayTime; playbackStartSourceTime = srcPlayTime; const indicesToPlay = [leftChannelTrackIndex, rightChannelTrackIndex].filter(idx => idx !== -1); indicesToPlay.forEach(trackIndex => { const track = getTrackDataByIndex(trackIndex); if (track?.isReady) { if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } const trackSeekTime = Math.max(0, srcPlayTime - track.parameters.offsetSeconds); AudioApp.audioEngine.seekTrack(trackIndex, trackSeekTime); track.hasEnded = false; const scheduledPlayTime = track.parameters.offsetSeconds; const timeUntilStart = scheduledPlayTime - srcPlayTime; const delayMs = Math.max(0, timeUntilStart * 1000); console.log(`App: Track #${trackIndex} - Offset: ${track.parameters.offsetSeconds.toFixed(3)}s, SeekTo: ${trackSeekTime.toFixed(3)}s, DelayMs: ${delayMs.toFixed(1)}ms`); track.playTimeoutId = setTimeout(() => { console.log(`App: Timeout fired - Playing track #${trackIndex}`); AudioApp.audioEngine.playTrack(trackIndex); track.playTimeoutId = null; }, delayMs); } }); AudioApp.uiManager.setPlayButtonState(true); startUIUpdateLoop(); } else { console.log("App: Handling Pause request."); const timeAtPause = calculateEstimatedSourceTime(); console.log(`App (Pause Debug): Calculated timeAtPause = ${timeAtPause.toFixed(5)}`); globalPlaybackState = 'paused'; stopUIUpdateLoop(); playbackStartSourceTime = timeAtPause; playbackStartTimeContext = null; console.log(`App (Pause Debug): Stored playbackStartSourceTime = ${playbackStartSourceTime.toFixed(5)}`); tracksData.forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } }); AudioApp.audioEngine.togglePlayPause(false); AudioApp.uiManager.setPlayButtonState(false); console.log(`App (Pause Debug): Calling updateUIWithTime with ${playbackStartSourceTime.toFixed(5)}`); updateUIWithTime(playbackStartSourceTime); }
    }
    /** Handles jump forward/backward requests. */
    function handleJump(e) { /* ... (Implementation unchanged) ... */ console.log("App: Handling Jump request."); if (!areAllActiveTracksReady()) return; const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return; const currentGlobalTime = calculateEstimatedSourceTime(); const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration)); handleSeekInternal(targetGlobalTime); }
    /** Handles seek requests from seek bar or canvas clicks. */
    function handleSeek(e) { /* ... (Implementation unchanged) ... */ console.log("App: Handling Seek request from", e.detail.sourceCanvasId || "SeekBar"); if (!areAllActiveTracksReady()) return; const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return; let targetGlobalTime = 0; if (e.detail.sourceCanvasId) { const side = e.detail.sourceCanvasId.includes('_right') ? 'right' : 'left'; const trackIndex = getTrackIndexForSide(side); const sourceTrack = getTrackDataByIndex(trackIndex); if (sourceTrack?.audioBuffer) { const clickedTrackTargetTime = e.detail.fraction * sourceTrack.audioBuffer.duration; targetGlobalTime = clickedTrackTargetTime + sourceTrack.parameters.offsetSeconds; } else { return; } } else { targetGlobalTime = e.detail.fraction * maxDuration; } handleSeekInternal(targetGlobalTime); }
    /** Internal seek handler. */
    function handleSeekInternal(targetGlobalTime) { /* ... (Implementation unchanged, uses indicesToSeek) ... */ if (!areAllActiveTracksReady()) { console.warn("App: Seek ignored - tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; const maxDuration = calculateMaxEffectiveDuration(); const clampedGlobalTime = Math.max(0, Math.min(targetGlobalTime, maxDuration)); console.log(`App: Internal Seek. Target Global Time: ${clampedGlobalTime.toFixed(3)}s`); const wasPlaying = (globalPlaybackState === 'playing'); if (wasPlaying) { console.log("App (Seek): Pausing before seek..."); stopUIUpdateLoop(); tracksData.forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; } }); AudioApp.audioEngine.togglePlayPause(false); } playbackStartTimeContext = null; playbackStartSourceTime = clampedGlobalTime; console.log(`App (Seek): Seeking assigned tracks relative to ${clampedGlobalTime.toFixed(3)}s...`); const indicesToSeek = [leftChannelTrackIndex, rightChannelTrackIndex].filter(idx => idx !== -1); indicesToSeek.forEach(trackIndex => { const track = getTrackDataByIndex(trackIndex); if (track?.isReady) { const trackSeekTime = Math.max(0, clampedGlobalTime - track.parameters.offsetSeconds); AudioApp.audioEngine.seekTrack(trackIndex, trackSeekTime); track.hasEnded = false; track.lastReportedTime = trackSeekTime; } }); updateUIWithTime(clampedGlobalTime); if (wasPlaying) { console.log("App (Seek): Resuming playback after seek..."); globalPlaybackState = 'playing'; playbackStartTimeContext = audioCtx.currentTime; indicesToSeek.forEach(trackIndex => { const track = getTrackDataByIndex(trackIndex); if (track?.isReady) { const scheduledPlayTime = track.parameters.offsetSeconds; const timeUntilStart = scheduledPlayTime - clampedGlobalTime; const delayMs = Math.max(0, timeUntilStart * 1000); console.log(`App (Seek-Resume): Track #${trackIndex} - DelayMs: ${delayMs.toFixed(1)}ms`); track.playTimeoutId = setTimeout(() => { console.log(`App: Timeout fired (Seek-Resume) - Playing track #${trackIndex}`); AudioApp.audioEngine.playTrack(trackIndex); track.playTimeoutId = null; }, delayMs); } }); startUIUpdateLoop(); } }

    // --- Parameter Change Handlers ---

    /**
     * Handles changes from the GLOBAL speed slider. Updates all active tracks.
     * @param {CustomEvent<{speed: number}>} e - Event detail contains the new speed value.
     * @private NEW
     */
    function handleGlobalSpeedChanged(e) {
        const newSpeedValue = Math.max(0.25, Math.min(parseFloat(e.detail.speed) || 1.0, 2.0)); // Clamp 0.25-2.0

        if (Math.abs(currentGlobalSpeed - newSpeedValue) < 1e-6) return; // No significant change
        console.log(`App: Global speed changed to ${newSpeedValue.toFixed(2)}x`);

        const oldGlobalSpeed = currentGlobalSpeed;
        currentGlobalSpeed = newSpeedValue; // Update global speed reference

        // Apply speed to all assigned and ready tracks
        const indicesToChange = [leftChannelTrackIndex, rightChannelTrackIndex].filter(idx => idx !== -1);
        indicesToChange.forEach(trackIndex => {
            const track = getTrackDataByIndex(trackIndex);
            if (track?.isReady) {
                track.parameters.speed = newSpeedValue; // Update track state
                AudioApp.audioEngine.setTrackSpeed(trackIndex, newSpeedValue); // Send to engine
            }
        });

        // Adjust time base if currently playing
        const audioCtx = AudioApp.audioEngine.getAudioContext();
        if (globalPlaybackState === 'playing' && playbackStartTimeContext !== null && audioCtx) {
            const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
            const elapsedSourceTime = elapsedContextTime * oldGlobalSpeed; // Time elapsed at the OLD speed
            const previousSourceTime = playbackStartSourceTime + elapsedSourceTime; // Actual source time reached
            playbackStartSourceTime = previousSourceTime; // Update base source time
            playbackStartTimeContext = audioCtx.currentTime; // Reset context start time to NOW
        }
        debouncedSyncEngine(); // Debounce a seek to ensure engine catches up
    }

    /** Handles pitch changes from UI sliders (respects linking). */
    function handlePitchChange(side, pitch) { /* ... (Logic largely unchanged, but uses getTrackIndexForSide, getTrackDataByIndex, calls engine with index) ... */
         const newPitchValue = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0));
         if (pitchLinked) {
              console.log(`App: Linked pitch changed to ${newPitchValue.toFixed(2)}x`);
              const indicesToChange = [leftChannelTrackIndex, rightChannelTrackIndex].filter(idx => idx !== -1);
              indicesToChange.forEach(trackIndex => {
                  const track = getTrackDataByIndex(trackIndex);
                  if (track?.isReady) {
                       track.parameters.pitch = newPitchValue; AudioApp.audioEngine.setTrackPitch(trackIndex, newPitchValue);
                       const currentSide = (trackIndex === leftChannelTrackIndex) ? 'left' : 'right';
                       AudioApp.uiManager.setSliderValue(document.getElementById(`pitch_${currentSide}`), newPitchValue, document.getElementById(`pitchValue_${currentSide}`), 'x');
                  }
              });
         } else {
              const trackIndex = getTrackIndexForSide(side); if (trackIndex === -1) return;
              const track = getTrackDataByIndex(trackIndex); if (!track || !track.isReady) return;
              if (Math.abs(track.parameters.pitch - newPitchValue) < 1e-6) return;
              console.log(`App: Unlinked pitch for track #${trackIndex} (UI Side: ${side}) changed to ${newPitchValue.toFixed(2)}x`);
              track.parameters.pitch = newPitchValue; AudioApp.audioEngine.setTrackPitch(trackIndex, newPitchValue);
         }
    }
    /** Handles master gain changes from UI. */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); }
    /** Internal function to sync engine after debounced wait. */
    function syncEngineToEstimatedTime() { /* ... (Implementation unchanged) ... */ if (globalPlaybackState !== 'playing' || !areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - not playing or tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; const targetGlobalTime = calculateEstimatedSourceTime(); console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`); handleSeekInternal(targetGlobalTime); }
    /** Handles VAD threshold changes from UI (applies to track in Left UI only). */
    function handleThresholdChange(e) { /* ... (Implementation unchanged) ... */ const trackIndex = leftChannelTrackIndex; if (trackIndex === -1) return; const track = getTrackDataByIndex(trackIndex); if (!track || !track.vad.results || track.vad.isProcessing) return; const { type, value } = e.detail; const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value); AudioApp.uiManager.setSpeechRegionsText(newRegions); if(track.audioBuffer && vizRefs.left.waveform) { vizRefs.left.waveform.redrawWaveformHighlight(newRegions); } }
    /** Handles the `playbackEnded` event from a worklet. */
    function handlePlaybackEnded(e) { /* ... (Implementation unchanged) ... */ const trackIndex = e.detail.trackId; const track = getTrackDataByIndex(trackIndex); if (!track) return; console.log(`App: Playback ended event received for track #${trackIndex}.`); track.hasEnded = true; const assignedIndices = [leftChannelTrackIndex, rightChannelTrackIndex].filter(idx => idx !== -1); const activeTracksStillPlaying = assignedIndices.filter(idx => { const t = getTrackDataByIndex(idx); return t?.isReady && !t.hasEnded; }); if (activeTracksStillPlaying.length === 0 && assignedIndices.length > 0) { console.log("App: All assigned tracks have ended playback."); globalPlaybackState = 'stopped'; stopUIUpdateLoop(); playbackStartTimeContext = null; const maxDuration = calculateMaxEffectiveDuration(); playbackStartSourceTime = maxDuration; updateUIWithTime(maxDuration); AudioApp.uiManager.setPlayButtonState(false); } }
    /** Informational handler for playback state changes. */
    function handlePlaybackStateChange(e) { /* console.log(`App: Worklet #${e.detail.trackId} reported playing state: ${e.detail.isPlaying}`); */ }
    /** Handles `timeUpdated` event for drift calculation. */
    function handleTimeUpdate(e) { /* ... (Implementation unchanged) ... */ const { currentTime, trackId: trackIndex } = e.detail; const track = getTrackDataByIndex(trackIndex); if (track) { track.lastReportedTime = currentTime; } }
    /** Handles keyboard shortcuts. */
    function handleKeyPress(e) { /* ... (Implementation unchanged) ... */ console.log("App: Key pressed", e.detail.key); if (!areAllActiveTracksReady()) return; const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; } }
    /** Cleans up resources before page unload. */
    function handleBeforeUnload() { /* ... (Implementation unchanged) ... */ console.log("App: Unloading page..."); tracksData.forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); } }); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); }
    /** Handles window resize events - redraws visuals. */
    function handleWindowResize() { /* ... (Implementation unchanged) ... */ const currentTime = calculateEstimatedSourceTime(); vizRefs.left.waveform?.resizeAndRedraw(); vizRefs.left.spec?.resizeAndRedraw(); if (isMultiChannelModeActive) { vizRefs.right.waveform?.resizeAndRedraw(); vizRefs.right.spec?.resizeAndRedraw(); } updateUIWithTime(currentTime); }

    // --- Main Thread Time Calculation & UI Update ---
    /** Starts the UI update loop. */
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { console.log("App: Starting UI update loop."); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    /** Stops the UI update loop. */
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { console.log("App: Stopping UI update loop."); cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }
    /** Calculates estimated global source time. */
    function calculateEstimatedSourceTime() { /* ... (Implementation unchanged) ... */ const audioCtx = AudioApp.audioEngine.getAudioContext(); const maxDuration = calculateMaxEffectiveDuration(); if (globalPlaybackState !== 'playing' || playbackStartTimeContext === null || !audioCtx || maxDuration <= 0) { return playbackStartSourceTime; } if (currentGlobalSpeed <= 0) { return playbackStartSourceTime; } const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * currentGlobalSpeed; let estimatedCurrentGlobalTime = playbackStartSourceTime + elapsedSourceTime; return Math.max(0, Math.min(estimatedCurrentGlobalTime, maxDuration)); }
     /** Updates UI time, seek bar, drift, and visualization indicators. */
     function updateUIWithTime(globalTime) { /* ... (Implementation unchanged) ... */ const maxEffectiveDuration = calculateMaxEffectiveDuration(); const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration)); const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0; AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration); AudioApp.uiManager.updateSeekBar(fraction); let driftMs = 0; const leftTrack = getTrackDataByIndex(leftChannelTrackIndex); const rightTrack = getTrackDataByIndex(rightChannelTrackIndex); if (isMultiChannelModeActive && leftTrack?.isReady && rightTrack?.isReady) { driftMs = (leftTrack.lastReportedTime - rightTrack.lastReportedTime) * 1000; } AudioApp.uiManager.updateDriftDisplay(driftMs); if (leftTrack?.audioBuffer && vizRefs.left.waveform?.updateProgressIndicator) { vizRefs.left.waveform.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } if (leftTrack?.audioBuffer && vizRefs.left.spec?.updateProgressIndicator) { vizRefs.left.spec.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } if (isMultiChannelModeActive && rightTrack?.audioBuffer && vizRefs.right.waveform?.updateProgressIndicator) { vizRefs.right.waveform.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); } if (isMultiChannelModeActive && rightTrack?.audioBuffer && vizRefs.right.spec?.updateProgressIndicator) { vizRefs.right.spec.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); } }
    /** The rAF loop function. */
    function updateUIBasedOnContextTime(timestamp) { /* ... (Implementation unchanged) ... */ if (globalPlaybackState !== 'playing') { rAFUpdateHandle = null; return; } const estimatedGlobalTime = calculateEstimatedSourceTime(); updateUIWithTime(estimatedGlobalTime); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); }

    // --- Public Interface ---
    return {
        init: init
    };
})();
// --- /vibe-player/js/app.js ---