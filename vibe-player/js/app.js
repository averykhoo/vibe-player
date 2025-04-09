// --- /vibe-player/js/app.js ---
// Creates the global namespace and orchestrates the application flow.
// MUST be loaded FIRST after libraries.

/**
 * @namespace AudioApp
 * @description Main application namespace for Vibe Player.
 */
var AudioApp = AudioApp || {}; // Create the main application namespace

// Design Decision: Use an IIFE to encapsulate the main application logic
// and expose only the `init` function via the AudioApp namespace.
AudioApp = (function() {
    'use strict';

    // === Module Dependencies ===
    // Access modules via AudioApp.* where needed, after init check.

    // --- Application State ---
    /**
     * @typedef {object} TrackState
     * @property {'track_left' | 'track_right'} id - Unique track identifier.
     * @property {'left' | 'right'} side - UI side identifier.
     * @property {File|null} file - The original audio file object.
     * @property {AudioBuffer|null} audioBuffer - The decoded audio buffer.
     * @property {boolean} isLoading - Is the track currently loading/decoding?
     * @property {boolean} isReady - Is the track's worklet ready for playback commands?
     * @property {boolean} hasEnded - Has the worklet reported the end of this track's playback?
     * @property {object} parameters - Playback parameters for this track.
     * @property {number} parameters.offsetSeconds - Playback start offset in seconds.
     * @property {number} parameters.volume - Individual track volume (0.0 to 1.5+).
     * @property {number} parameters.speed - Individual track target speed (used if unlinked).
     * @property {number} parameters.pitch - Individual track target pitch (used if unlinked).
     * @property {number} parameters.pan - Stereo pan (-1 Left, 0 Center, 1 Right).
     * @property {boolean} parameters.isMuted - User-requested mute state.
     * @property {boolean} parameters.isSoloed - User-requested solo state.
     * @property {object} vad - VAD related state (currently only for left track).
     * @property {VadResult|null} vad.results - Results from VAD analysis.
     * @property {boolean} vad.isProcessing - Is VAD currently running for this track?
     * @property {number|null} playTimeoutId - ID of the scheduled 'play' command timeout. **NEW**
     * @property {number} lastReportedTime - Last source time reported by this track's worklet. **NEW**
     */
     function createInitialTrackState(side) {
         return {
             id: `track_${side}`, side: side, file: null, audioBuffer: null, isLoading: false, isReady: false, hasEnded: false,
             parameters: { offsetSeconds: 0.0, volume: 1.0, speed: 1.0, pitch: 1.0, pan: (side === 'left' ? -1 : 1), isMuted: false, isSoloed: false, },
             vad: { results: null, isProcessing: false, },
             playTimeoutId: null, // ** NEW **
             lastReportedTime: 0.0, // ** NEW ** Initialize reported time
         };
     }

     let tracks = [ createInitialTrackState('left'), createInitialTrackState('right') ];
     let multiTrackModeActive = false;
     let speedLinked = true;
     let pitchLinked = true;
     let globalPlaybackState = 'stopped'; // 'stopped', 'playing', 'paused'
     let playbackStartTimeContext = null; // AudioContext time when playback last started/resumed
     let playbackStartSourceTime = 0.0; // Global source time when playback last started/resumed/paused/seeked
     let rAFUpdateHandle = null; // Handle for requestAnimationFrame loop
     let currentGlobalSpeed = 1.0; // Current effective speed for global time calculation
     let vadModelReady = false;
     let debouncedSyncEngine = null; // Debounced function for seeking engine after rapid changes
     const SYNC_DEBOUNCE_WAIT_MS = 300;

    // --- Visualizer Instance References ---
    let waveformVizLeft = null; let specVizLeft = null; let waveformVizRight = null; let specVizRight = null;

    // --- Initialization ---
    /**
     * Initializes the application: checks dependencies, creates visualizers,
     * sets up event listeners, and resets the UI.
     * @public
     */
    function init() {
        console.log("AudioApp: Initializing...");
        // Dependency Check
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer?.createInstance || !AudioApp.spectrogramVisualizer?.createInstance || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.Constants || !AudioApp.Utils)
        { let missing = []; /* ... add specific checks ... */ console.error(`AudioApp: CRITICAL - Required modules/factories missing. Check script load order.`); AudioApp.uiManager?.setFileInfo('left', "Initialization Error: Missing modules."); return; }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);
        AudioApp.uiManager.init(); AudioApp.audioEngine.init();

        // Create Left Visualizer Instances
        try {
            waveformVizLeft = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_left', indicatorId: 'waveformProgressIndicator_left' });
            specVizLeft = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_left', spinnerId: 'spectrogramSpinner_left', indicatorId: 'spectrogramProgressIndicator_left' });
            console.log("AudioApp: Left visualizer instances created.");
        } catch (vizError) { console.error("AudioApp: CRITICAL - Failed to create visualizer instances:", vizError); AudioApp.uiManager?.setFileInfo('left', "Error: Visualizers failed to create."); }

        setupAppEventListeners(); // Setup main event listeners
        AudioApp.uiManager.resetUI(); // Reset UI to initial state
        console.log("AudioApp: Initialized. Waiting for file...");
    }

    // --- Event Listener Setup ---
    /**
     * Sets up listeners for UI events and audio engine events.
     * @private
     */
    function setupAppEventListeners() {
        // File/Track Management
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrack);
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracks);

        // Linking
        document.addEventListener('audioapp:linkSpeedToggled', handleLinkSpeedToggle);
        document.addEventListener('audioapp:linkPitchToggled', handleLinkPitchToggle);

        // Track Parameters
        document.addEventListener('audioapp:volumeChanged_left', (e) => handleVolumeChange('left', e.detail.volume));
        document.addEventListener('audioapp:volumeChanged_right', (e) => handleVolumeChange('right', e.detail.volume));
        document.addEventListener('audioapp:delayChanged_left', (e) => handleDelayChange('left', e.detail.value));
        document.addEventListener('audioapp:delayChanged_right', (e) => handleDelayChange('right', e.detail.value));
        document.addEventListener('audioapp:speedChanged_left', (e) => handleSpeedChange('left', e.detail.speed));
        document.addEventListener('audioapp:speedChanged_right', (e) => handleSpeedChange('right', e.detail.speed));
        document.addEventListener('audioapp:pitchChanged_left', (e) => handlePitchChange('left', e.detail.pitch));
        document.addEventListener('audioapp:pitchChanged_right', (e) => handlePitchChange('right', e.detail.pitch));
        document.addEventListener('audioapp:muteToggled_left', () => handleMuteToggle('left'));
        document.addEventListener('audioapp:muteToggled_right', () => handleMuteToggle('right'));
        document.addEventListener('audioapp:soloToggled_left', () => handleSoloToggle('left'));
        document.addEventListener('audioapp:soloToggled_right', () => handleSoloToggle('right'));

        // Global Playback & Seek
        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek); // From canvas clicks
        document.addEventListener('audioapp:seekBarInput', handleSeek); // From seek bar drag
        document.addEventListener('audioapp:gainChanged', handleMasterGainChange);

        // VAD
        document.addEventListener('audioapp:thresholdChanged', handleThresholdChange);

        // Keyboard
        document.addEventListener('audioapp:keyPressed', handleKeyPress);

        // Audio Engine Lifecycle & Errors
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError);
        document.addEventListener('audioapp:playbackError', handleAudioError); // Not currently dispatched?
        document.addEventListener('audioapp:engineError', handleAudioError);
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded);
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange);
        document.addEventListener('audioapp:timeUpdated', handleTimeUpdate); // ** NEW Listener for drift **

        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Helper Functions ---
    /** Finds a track state object by its side ('left' or 'right'). */
    function findTrackBySide(side) { return tracks.find(t => t.side === side); }
    /** Finds a track state object by its ID ('track_left' or 'track_right'). */
    function findTrackById(id) { return tracks.find(t => t.id === id); }
    /** Checks if all currently *active* tracks are loaded and ready. */
    function areAllActiveTracksReady() { if (!tracks[0]?.isReady) return false; if (multiTrackModeActive && !tracks[1]?.isReady) return false; return true; }
    /** Counts how many tracks are currently ready. */
    function getReadyTrackCount() { return tracks.filter(t => t?.isReady).length; }
    /** Calculates the maximum effective duration considering track offsets. */
    function calculateMaxEffectiveDuration() { let maxDuration = 0; tracks.forEach(track => { if (track?.audioBuffer) { maxDuration = Math.max(maxDuration, track.parameters.offsetSeconds + track.audioBuffer.duration); } }); return isNaN(maxDuration) ? 0 : maxDuration; }


     /**
      * Computes and draws the waveform and spectrogram for a specific track.
      * @param {TrackState} track - The track state object.
      * @private
      */
     async function drawTrackVisuals(track) {
         if (!track?.audioBuffer) { console.warn(`App: Cannot draw visuals for ${track?.side}, no buffer.`); return; }
         console.log(`App: Drawing/Redrawing visuals for ${track.side}...`);
         try {
             const waveformViz = (track.side === 'left') ? waveformVizLeft : waveformVizRight;
             const specViz = (track.side === 'left') ? specVizLeft : specVizRight;
             // Get initial VAD regions only for the left track
             const initialRegions = (track.side === 'left') ? (track.vad.results?.regions || []) : null;

             if (waveformViz?.computeAndDrawWaveform) {
                 await waveformViz.computeAndDrawWaveform(track.audioBuffer, initialRegions);
             } else { console.warn(`App: Waveform Visualizer for ${track.side} not available.`); }

             if (specViz?.computeAndDrawSpectrogram) {
                 await specViz.computeAndDrawSpectrogram(track.audioBuffer);
             } else { console.warn(`App: Spectrogram Visualizer for ${track.side} not available.`); }
         } catch (visError) { console.error(`App: Error drawing visuals for ${track.side}:`, visError); }
     }


    // --- Event Handler Functions ---

    /**
     * Handles file selection for either the left or right track.
     * Resets state if loading the left track. Sets up multi-track mode if loading right.
     * Initiates audio processing via audioEngine.
     * @param {CustomEvent<{file: File, trackId: 'left' | 'right'}>} e - Event detail contains file and target track side.
     * @private
     */
    async function handleFileSelected(e) {
        const { file, trackId: trackSide } = e.detail; const track = findTrackBySide(trackSide); if (!track || !file) return;
        // Prevent loading right track if left isn't ready
        if (track.side === 'right' && !tracks[0]?.isReady) { console.warn(`App: Cannot load Right track before Left is ready.`); AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return; }
        console.log(`App: File selected for track ${track.side} -`, file.name);

        // --- State Reset Logic ---
        if (track.side === 'left') { // Resetting everything if loading left track
             console.log("App: Loading Left track - resetting global state.");
             // Cancel pending play timeouts
             tracks.forEach(t => { if (t.playTimeoutId) { clearTimeout(t.playTimeoutId); t.playTimeoutId = null; } });
             stopUIUpdateLoop(); // Stop UI updates
             globalPlaybackState = 'stopped'; playbackStartTimeContext = null; playbackStartSourceTime = 0.0; currentGlobalSpeed = 1.0;
             // If right track exists, clean it up fully
             if (tracks[1]?.audioBuffer || tracks[1]?.file) { await handleRemoveTrackInternal(false); } // Don't reset UI yet
             AudioApp.uiManager.resetUI(); // Full UI reset *after* potential right track cleanup
             waveformVizLeft?.clearVisuals(); specVizLeft?.clearVisuals();
             // Reset track state objects fully
             tracks = [ createInitialTrackState('left'), createInitialTrackState('right') ];
             const currentLeftTrack = tracks[0]; // Get the newly created state object
             Object.assign(currentLeftTrack, { file: file, isLoading: true }); // Assign file and loading state
        } else { // Loading right track
             console.log("App: Loading Right track - setting up multi-track mode.");
             // Reset only the right track's state
             if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; }
             const currentRightTrack = createInitialTrackState('right'); // Create new state
             tracks[1] = currentRightTrack; // Replace old right track state
             Object.assign(currentRightTrack, { file: file, isLoading: true }); // Assign file and loading state
             AudioApp.uiManager.setFileInfo(track.side, `Loading: ${file.name}...`); AudioApp.uiManager.enableTrackControls(track.side, false);
             waveformVizRight?.clearVisuals(); specVizRight?.clearVisuals();
             multiTrackModeActive = true; AudioApp.uiManager.showMultiTrackUI(true);
        }

        // Disable playback controls during load
        AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);
        if (track.side === 'right') { // Disable swap/remove while loading right
             AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
        }

        // Start processing the loaded file
        const targetTrack = findTrackBySide(trackSide); // Get the potentially new track state object
        try {
            await AudioApp.audioEngine.setupTrack(targetTrack.id, file);
        }
        catch (error) { // Handle errors during audioEngine setup
            console.error(`App: Error initiating file processing for ${targetTrack.side}`, error);
            targetTrack.isLoading = false;
            AudioApp.uiManager.setFileInfo(targetTrack.side, `Error: ${error.message}`);
            if (targetTrack.side === 'left') { AudioApp.uiManager.resetUI(); } // Full reset on left load error
            else { AudioApp.uiManager.updateFileName(targetTrack.side, 'Load Error!'); multiTrackModeActive = false; AudioApp.uiManager.showMultiTrackUI(false); } // Revert multi-track UI
            // Ensure controls remain disabled if not all tracks are ready
            if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        }
    }

    /**
     * Handles the `audioLoaded` event from the audioEngine.
     * Stores the decoded AudioBuffer and triggers VAD/visualizations for the left track.
     * @param {CustomEvent<{audioBuffer: AudioBuffer, trackId: string}>} e - Event details.
     * @private
     */
    async function handleAudioLoaded(e) {
         const { audioBuffer, trackId } = e.detail; const track = findTrackById(trackId);
         // Ignore if track doesn't exist, already has a buffer, or isn't marked as loading
         if (!track || track.audioBuffer || !track.isLoading) { console.warn(`App: handleAudioLoaded ignored for ${trackId}. Track:`, track); return; }
         console.log(`App: Audio decoded for ${track.side}. Duration: ${audioBuffer.duration.toFixed(2)}s`);
         track.audioBuffer = audioBuffer; track.isLoading = false;
         AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file?.name || 'Unknown'}`);

         // Specific actions based on track side
         if (track.side === 'left') {
             const duration = calculateMaxEffectiveDuration(); // Use helper for duration
             AudioApp.uiManager.updateTimeDisplay(0, duration); AudioApp.uiManager.updateSeekBar(0);
             playbackStartSourceTime = 0.0; // Reset global time reference
             runVadInBackground(track); // Start VAD for left track
             await drawTrackVisuals(track); // Draw left visuals now
         } else {
             // Only draw right visuals if the visualizers exist (created on workletReady for right)
             if (waveformVizRight && specVizRight) {
                 await drawTrackVisuals(track);
             }
             const duration = calculateMaxEffectiveDuration(); // Update global duration display
             AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, duration);
         }
    }

    /**
     * Handles the `workletReady` event from the audioEngine.
     * Marks the track as ready, applies initial parameters, draws visuals (for right track),
     * and enables relevant UI controls.
     * @param {CustomEvent<{trackId: string}>} e - Event details.
     * @private
     */
    async function handleWorkletReady(e) {
        const trackId = e.detail.trackId; const track = findTrackById(trackId);
        // Ignore if track/buffer doesn't exist
        if (!track || !track.audioBuffer) { console.warn(`App: Worklet ready event ignored for ${trackId}, track/buffer missing.`); return; }
        console.log(`App: Worklet ready for ${track.side}. Applying initial parameters.`);

        track.isReady = true; track.isLoading = false; track.hasEnded = false; track.lastReportedTime = 0.0; // Reset reported time

        // Enable track-specific UI controls
        AudioApp.uiManager.enableTrackControls(track.side, true);

        // Apply initial parameters via audioEngine
        AudioApp.audioEngine.setVolume(track.id, track.parameters.volume);
        AudioApp.audioEngine.setPan(track.id, track.parameters.pan);
        AudioApp.audioEngine.setTrackSpeed(track.id, track.parameters.speed);
        AudioApp.audioEngine.setTrackPitch(track.id, track.parameters.pitch);
        // Note: Offset is not applied here, it's used during play/seek calculation

        // Side-specific UI enablement and actions
        if (track.side === 'left') {
             AudioApp.uiManager.enableRightTrackLoadButton(true); // Allow loading right track
             // Enable VAD controls only if VAD analysis is complete
             if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
        } else { // Right track is ready
             multiTrackModeActive = true;
             // Create Right Visualizers if they don't exist
             if (!waveformVizRight) { try { waveformVizRight = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_right', indicatorId: 'waveformProgressIndicator_right' }); } catch(err) { console.error("Failed creating waveformVizRight", err); } }
             if (!specVizRight) { try { specVizRight = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_right', spinnerId: 'spectrogramSpinner_right', indicatorId: 'spectrogramProgressIndicator_right' }); } catch(err) { console.error("Failed creating specVizRight", err); } }

             AudioApp.uiManager.showMultiTrackUI(true); // Ensure multi-track UI is visible
             await drawTrackVisuals(track); // Draw Right visuals now that it's ready and viz exist
             // Enable multi-track interaction buttons (Swap/Remove)
             AudioApp.uiManager.enableSwapButton(true);
             AudioApp.uiManager.enableRemoveButton(true);
        }

        // Check if all *active* tracks are now ready to enable global playback
        if (areAllActiveTracksReady()) {
            console.log("App: All active tracks ready. Enabling global playback.");
            AudioApp.uiManager.enablePlaybackControls(true);
            AudioApp.uiManager.enableSeekBar(true);
            // Update max duration display now that all active buffers are loaded
            const maxDuration = calculateMaxEffectiveDuration();
            AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, maxDuration);
        } else {
            console.log("App: Waiting for other track(s) to become ready.");
            AudioApp.uiManager.enablePlaybackControls(false);
            AudioApp.uiManager.enableSeekBar(false);
        }
    }

    // --- Multi-Track Handlers ---

    /** Handles click on 'Remove Right' button */
    async function handleRemoveTrack() { console.log("App: Remove Right track requested."); await handleRemoveTrackInternal(); }
    /** Internal logic to remove the right track state and UI elements. */
    async function handleRemoveTrackInternal(resetUICall = true) {
        const rightTrack = tracks[1];
        if (!rightTrack) return;
        const trackId = rightTrack.id;

        // Cancel pending play timeout
        if (rightTrack.playTimeoutId) { clearTimeout(rightTrack.playTimeoutId); rightTrack.playTimeoutId = null; }

        // Clean up audio engine resources for the track
        await AudioApp.audioEngine.cleanupTrack(trackId);

        // Reset the right track state
        tracks[1] = createInitialTrackState('right');
        multiTrackModeActive = false;

        // Nullify visualizer instances (allowing garbage collection)
        waveformVizRight = null;
        specVizRight = null;

        // Update UI
        if(resetUICall) AudioApp.uiManager.showMultiTrackUI(false); // Hide multi-track sections
        AudioApp.uiManager.enableRightTrackLoadButton(true); // Re-enable load button
        AudioApp.uiManager.enableSwapButton(false);
        AudioApp.uiManager.enableRemoveButton(false);

        // Re-evaluate global playback readiness
        if (tracks[0]?.isReady) { // If left track is still ready
            AudioApp.uiManager.enablePlaybackControls(true);
            AudioApp.uiManager.enableSeekBar(true);
            // Update max duration display based only on left track now
            const maxDuration = calculateMaxEffectiveDuration();
            AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, maxDuration);
        } else { // If left track isn't ready (shouldn't happen unless unloading?)
            AudioApp.uiManager.enablePlaybackControls(false);
            AudioApp.uiManager.enableSeekBar(false);
        }
        console.log("App: Right track removed.");
    }

    /** Placeholder for Swap Tracks functionality */
    function handleSwapTracks() { console.warn("Swap tracks not implemented yet."); }
    /** Handles toggling the speed link button */
    function handleLinkSpeedToggle(e) { speedLinked = e.detail.linked; console.log("App: SpeedLink set to", speedLinked); AudioApp.uiManager.setLinkButtonState(AudioApp.linkSpeedButton, speedLinked); }
    /** Handles toggling the pitch link button */
    function handleLinkPitchToggle(e) { pitchLinked = e.detail.linked; console.log("App: PitchLink set to", pitchLinked); AudioApp.uiManager.setLinkButtonState(AudioApp.linkPitchButton, pitchLinked); }

    /** Handler for individual track volume changes from UI */
    function handleVolumeChange(trackSide, volume) {
         const track = findTrackBySide(trackSide);
         if (!track || !track.isReady) return; // Ignore if track not ready
         const newVolume = Math.max(0, Math.min(parseFloat(volume) || 1.0, 1.5)); // Clamp 0-1.5
         console.log(`App: Volume change for ${trackSide} to ${newVolume.toFixed(2)}`);
         track.parameters.volume = newVolume;
         AudioApp.audioEngine.setVolume(track.id, newVolume);
         // Mute/Solo interaction logic would go here
    }

     /** Handler for individual track delay input changes from UI */
     function handleDelayChange(trackSide, valueStr) {
         const track = findTrackBySide(trackSide);
         if (!track) return;
         const newOffsetSeconds = AudioApp.uiManager.parseDelayInput(valueStr); // Use UI manager's parser
         // Check if parsing failed (returned NaN, handled by parser returning 0)
         // Check if value actually changed
         if (track.parameters.offsetSeconds !== newOffsetSeconds) {
              console.log(`App: Delay change for ${trackSide} to ${newOffsetSeconds.toFixed(3)}s`);
              track.parameters.offsetSeconds = newOffsetSeconds;
              // Update UI input to show potentially formatted/validated value
              AudioApp.uiManager.setDelayValue(trackSide, newOffsetSeconds);
              // Recalculate and update max duration display
              const maxDuration = calculateMaxEffectiveDuration();
              AudioApp.uiManager.updateTimeDisplay(playbackStartSourceTime, maxDuration);
              // If playing, we might want to re-evaluate playback, but seek/play handles offset naturally.
              // No automatic seek on delay change for now.
         }
     }

    /** Placeholder for Mute toggle */
    function handleMuteToggle(trackSide) { console.warn("Mute toggle not implemented yet."); }
    /** Placeholder for Solo toggle */
    function handleSoloToggle(trackSide) { console.warn("Solo toggle not implemented yet."); }

    // --- VAD Processing ---
    /**
     * Initiates VAD analysis for the left track in the background.
     * Handles resampling, calling the analyzer, and updating UI/visuals.
     * @param {TrackState} track - The track state object (should be left track).
     * @private
     */
    async function runVadInBackground(track) {
        // Only run for the left track, if it has an audio buffer, and viz exists
        if (track.side !== 'left' || !track.audioBuffer || !waveformVizLeft) return;
        // Check dependencies
        if (!AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager) { console.error("App (VAD Task): Missing VAD dependencies."); track.vad.isProcessing = false; return; }
        if (track.vad.isProcessing) { console.warn("App: VAD already running for Left track."); return; }

        track.vad.isProcessing = true; track.vad.results = null; let pcm16k = null; let vadSucceeded = false;
        AudioApp.uiManager.setFileInfo(track.side, `Processing VAD...`);
        AudioApp.uiManager.showVadProgress(true); AudioApp.uiManager.updateVadProgress(0);

        try {
            // Ensure ONNX model/session is ready (idempotent)
            if (!vadModelReady) { vadModelReady = await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE); if (!vadModelReady) throw new Error("Failed VAD model create."); }

            // Resample audio
            pcm16k = await AudioApp.audioEngine.resampleTo16kMono(track.audioBuffer);
            if (!pcm16k || pcm16k.length === 0) throw new Error("Resampling yielded no data");

            // Setup progress callback
            const vadProgressCallback = (p) => { AudioApp.uiManager?.updateVadProgress(p.totalFrames > 0 ? (p.processedFrames / p.totalFrames) * 100 : 0); };

            // Analyze using vadAnalyzer
            track.vad.results = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback });
            const regions = track.vad.results.regions || [];
            console.log(`App (VAD Task): VAD done for Left. Found ${regions.length} regions.`);

            // Update UI with initial results
            AudioApp.uiManager.updateVadDisplay(track.vad.results.initialPositiveThreshold, track.vad.results.initialNegativeThreshold);
            AudioApp.uiManager.setSpeechRegionsText(regions); // Currently unused UI element
            if (track.isReady) AudioApp.uiManager.enableVadControls(true); // Enable sliders if track worklet is ready

            // Update waveform highlighting
            waveformVizLeft.redrawWaveformHighlight(regions); // Use instance method
            AudioApp.uiManager.updateVadProgress(100); // Mark progress as complete
            vadSucceeded = true;

        } catch (error) {
            console.error("App (VAD Task): VAD Error -", error);
            AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`);
            AudioApp.uiManager.enableVadControls(false);
            AudioApp.uiManager.updateVadProgress(0); // Reset progress bar
            track.vad.results = null; // Clear results on error
        } finally {
            track.vad.isProcessing = false;
            // Restore "Ready" status if buffer still exists
            if (track.audioBuffer) AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`);
            AudioApp.uiManager.showVadProgress(false); // Hide progress bar container
        }
    }

     /**
      * Generic handler for audio-related errors dispatched from audioEngine.
      * Updates UI and potentially resets state based on the error.
      * @param {CustomEvent<{type?: string, error: Error, trackId?: string}>} e - Event details.
      * @private
      */
    function handleAudioError(e) {
        const errorType = e.detail.type || 'Unknown';
        const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred';
        const trackId = e.detail.trackId;
        const track = findTrackById(trackId);
        const trackSide = track ? track.side : 'global';

        console.error(`App: Audio Error - Track: ${trackSide}, Type: ${errorType}, Msg: ${errorMessage}`, e.detail.error);

        if (track) {
            // Error specific to a track
            track.isLoading = false; track.isReady = false;
            // Cancel pending play timeout if track had one
            if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; }
            AudioApp.uiManager.setFileInfo(track.side, `Error (${errorType})`);
            AudioApp.uiManager.enableTrackControls(track.side, false);
            if (track.side === 'right') { // Disable multi-track buttons if right track failed
                 AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
            }
        } else {
            // Global error (e.g., context creation, resource fetch) - requires full reset
            console.log("App: Handling global audio error - resetting application.");
            stopUIUpdateLoop();
            // Cancel all pending play timeouts
            tracks.forEach(t => { if (t.playTimeoutId) { clearTimeout(t.playTimeoutId); t.playTimeoutId = null; } });
            AudioApp.uiManager.resetUI();
            // Fully reset track state objects
            tracks = [ createInitialTrackState('left'), createInitialTrackState('right') ];
            multiTrackModeActive = false; globalPlaybackState = 'stopped';
            waveformVizLeft?.clearVisuals(); specVizLeft?.clearVisuals(); waveformVizRight = null; specVizRight = null;
            // Display global error on left track info area
            AudioApp.uiManager.setFileInfo('left', `Fatal Error (${errorType}): ${errorMessage}`);
        }

        // Re-evaluate global playback readiness after handling error
        if (!areAllActiveTracksReady()) {
            AudioApp.uiManager.enablePlaybackControls(false);
            AudioApp.uiManager.enableSeekBar(false);
        }
    }


    // --- Global Playback Handlers ---

    /**
     * Handles the Play/Pause button click. Orchestrates starting or stopping playback
     * for all ready tracks, respecting their offsets using setTimeout for delayed starts.
     * @private
     */
    function handlePlayPause() {
        console.log("App: Play/Pause button clicked.");
        if (!areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AudioContext missing."); return; }

        const isCurrentlyPlaying = (globalPlaybackState === 'playing');
        const targetStatePlay = !isCurrentlyPlaying;

        if (targetStatePlay) { // --- Play/Resume Logic ---
            console.log("App: Handling Play/Resume request.");
            const ctxPlayTime = audioCtx.currentTime;
            const srcPlayTime = calculateEstimatedSourceTime(); // Get current estimated source time

            console.log(`App: Starting playback from global source time ${srcPlayTime.toFixed(3)}s at context time ${ctxPlayTime.toFixed(3)}s`);
            globalPlaybackState = 'playing';
            playbackStartTimeContext = ctxPlayTime; // Record the context time when play was initiated
            playbackStartSourceTime = srcPlayTime; // Record the source time corresponding to the context time above

            // Schedule play for each ready track
            tracks.forEach(track => {
                if (track?.isReady) {
                    // 1. Cancel any existing scheduled play for this track
                    if (track.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; }

                    // 2. Calculate where this track should start reading its audio file
                    const trackSeekTime = Math.max(0, srcPlayTime - track.parameters.offsetSeconds);
                    // Send seek command immediately
                    AudioApp.audioEngine.seekTrack(track.id, trackSeekTime);
                    track.hasEnded = false; // Reset ended flag

                    // 3. Calculate delay before this track should start playing *from now*
                    const scheduledPlayTime = track.parameters.offsetSeconds; // When the track SHOULD start on the global timeline
                    const timeUntilStart = scheduledPlayTime - srcPlayTime; // How far in the future (or past) the start time is
                    const delayMs = Math.max(0, timeUntilStart * 1000); // Delay in ms, minimum 0

                    console.log(`App: Track ${track.side} - Offset: ${track.parameters.offsetSeconds.toFixed(3)}s, SeekTo: ${trackSeekTime.toFixed(3)}s, DelayMs: ${delayMs.toFixed(1)}ms`);

                    // 4. Schedule the 'play' command using setTimeout
                    track.playTimeoutId = setTimeout(() => {
                        console.log(`App: Timeout fired - Playing track ${track.id}`);
                        AudioApp.audioEngine.playTrack(track.id); // Tell engine to play this specific track
                        track.playTimeoutId = null; // Clear the timeout ID
                    }, delayMs);
                }
            });

            AudioApp.uiManager.setPlayButtonState(true); // Update UI button
            startUIUpdateLoop(); // Start updating UI time/indicators

        } else { // --- Pause Logic ---
            console.log("App: Handling Pause request.");
            globalPlaybackState = 'paused';
            stopUIUpdateLoop(); // Stop UI updates

            // Store the estimated source time when pause was pressed
            playbackStartSourceTime = calculateEstimatedSourceTime();
            playbackStartTimeContext = null; // Clear context start time

            // Cancel any pending play timeouts for all tracks
            tracks.forEach(track => {
                if (track?.playTimeoutId) {
                    console.log(`App: Clearing pending play timeout for track ${track.id}`);
                    clearTimeout(track.playTimeoutId);
                    track.playTimeoutId = null;
                }
            });

            // Send pause command to all worklets via audioEngine
            AudioApp.audioEngine.togglePlayPause(false); // Use the toggle function for pause

            AudioApp.uiManager.setPlayButtonState(false); // Update UI button
            // Update UI one last time with the paused time
            updateUIWithTime(playbackStartSourceTime);
        }
    }

    /**
     * Handles jump forward/backward requests.
     * @param {CustomEvent<{seconds: number}>} e - Event detail contains jump amount.
     * @private
     */
    function handleJump(e) {
        console.log("App: Handling Jump request.");
        if (!areAllActiveTracksReady()) return;
        const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return;
        const currentGlobalTime = calculateEstimatedSourceTime();
        const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration));
        handleSeekInternal(targetGlobalTime); // Use internal seek handler
    }

    /**
     * Handles seek requests from the seek bar or canvas clicks.
     * @param {CustomEvent<{fraction: number, sourceCanvasId?: string}>} e - Event detail.
     * @private
     */
    function handleSeek(e) {
        console.log("App: Handling Seek request from", e.detail.sourceCanvasId || "SeekBar");
        if (!areAllActiveTracksReady()) return;
        const maxDuration = calculateMaxEffectiveDuration(); if (maxDuration <= 0) return;

        let targetGlobalTime = 0;
        // Calculate target time based on source (canvas vs seekbar)
        if (e.detail.sourceCanvasId) { // Clicked on a visualizer
            const side = e.detail.sourceCanvasId.includes('_right') ? 'right' : 'left';
            const sourceTrack = findTrackBySide(side);
            if (sourceTrack?.audioBuffer) {
                // Calculate click position relative to the *track's* duration
                const clickedTrackTargetTime = e.detail.fraction * sourceTrack.audioBuffer.duration;
                // Convert track time to global time using offset
                targetGlobalTime = clickedTrackTargetTime + sourceTrack.parameters.offsetSeconds;
            } else { return; } // Should not happen if track is ready
        } else { // Dragged the global seek bar
            targetGlobalTime = e.detail.fraction * maxDuration;
        }

        handleSeekInternal(targetGlobalTime); // Use internal seek handler
    }

    /**
     * Internal function to handle the core logic of seeking the playback position globally.
     * Manages pausing, seeking individual tracks respecting offsets, updating UI,
     * and resuming playback if it was active before the seek.
     * @param {number} targetGlobalTime - The desired global time position in seconds.
     * @private
     */
    function handleSeekInternal(targetGlobalTime) {
        if (!areAllActiveTracksReady()) { console.warn("App: Seek ignored - tracks not ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        const maxDuration = calculateMaxEffectiveDuration();
        const clampedGlobalTime = Math.max(0, Math.min(targetGlobalTime, maxDuration));

        console.log(`App: Internal Seek. Target Global Time: ${clampedGlobalTime.toFixed(3)}s`);
        const wasPlaying = (globalPlaybackState === 'playing');

        // --- Pause Phase ---
        if (wasPlaying) {
            console.log("App (Seek): Pausing before seek...");
            stopUIUpdateLoop(); // Stop UI updates temporarily
            // Cancel any pending play timeouts (important!)
            tracks.forEach(track => {
                if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); track.playTimeoutId = null; }
            });
            // Send pause to all worklets
            AudioApp.audioEngine.togglePlayPause(false);
        }
        playbackStartTimeContext = null; // Clear context time reference

        // --- Seek Phase ---
        playbackStartSourceTime = clampedGlobalTime; // Set the new global source time reference
        console.log(`App (Seek): Seeking individual tracks relative to ${clampedGlobalTime.toFixed(3)}s...`);
        tracks.forEach(track => {
            if (track?.isReady) {
                const trackSeekTime = Math.max(0, clampedGlobalTime - track.parameters.offsetSeconds);
                AudioApp.audioEngine.seekTrack(track.id, trackSeekTime);
                track.hasEnded = false; // Seeking resets the ended flag
                track.lastReportedTime = trackSeekTime; // Assume seek is accurate initially for drift
            }
        });

        // --- UI Update Phase ---
        updateUIWithTime(clampedGlobalTime); // Update UI immediately to reflect seek

        // --- Resume Phase (If applicable) ---
        if (wasPlaying) {
            console.log("App (Seek): Resuming playback after seek...");
            // Execute the 'Play' logic using the new clampedGlobalTime
            globalPlaybackState = 'playing'; // Set state back to playing
            playbackStartTimeContext = audioCtx.currentTime; // Record new context start time
            // playbackStartSourceTime is already set to clampedGlobalTime

            // Reschedule play commands for each track based on the new position
            tracks.forEach(track => {
                if (track?.isReady) {
                    // Calculate delay relative to the new targetGlobalTime
                    const scheduledPlayTime = track.parameters.offsetSeconds;
                    const timeUntilStart = scheduledPlayTime - clampedGlobalTime;
                    const delayMs = Math.max(0, timeUntilStart * 1000);
                    console.log(`App (Seek-Resume): Track ${track.side} - DelayMs: ${delayMs.toFixed(1)}ms`);
                    track.playTimeoutId = setTimeout(() => {
                        console.log(`App: Timeout fired (Seek-Resume) - Playing track ${track.id}`);
                        AudioApp.audioEngine.playTrack(track.id);
                        track.playTimeoutId = null;
                    }, delayMs);
                }
            });
            startUIUpdateLoop(); // Restart UI updates
        }
        // Seek complete
    }


    // --- Parameter Change Handlers ---

    /**
     * Handles speed changes from UI sliders. Applies to one or both tracks based on linking state.
     * Adjusts the global time base if playing and speed is linked.
     * @param {'left' | 'right'} trackSide - The side of the slider that triggered the change.
     * @param {number} speed - The new speed value.
     * @private
     */
    function handleSpeedChange(trackSide, speed) {
        const newSpeedValue = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0)); // Clamp 0.25-2.0

        if (speedLinked) {
            // Apply to all ready tracks and update global speed reference
            if (Math.abs(currentGlobalSpeed - newSpeedValue) < 1e-6) return; // No change
            console.log(`App: Linked speed changed to ${newSpeedValue.toFixed(2)}x`);

            const oldGlobalSpeed = currentGlobalSpeed;
            currentGlobalSpeed = newSpeedValue; // Update global speed reference

            // Apply speed to both tracks and update their UI sliders
            tracks.forEach(track => {
                if (track?.isReady) {
                    track.parameters.speed = newSpeedValue;
                    AudioApp.audioEngine.setTrackSpeed(track.id, newSpeedValue);
                    // Update the corresponding UI slider value directly
                    AudioApp.uiManager.setSliderValue(document.getElementById(`speed_${track.side}`), newSpeedValue, document.getElementById(`speedValue_${track.side}`), 'x');
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
            debouncedSyncEngine(); // Debounce a seek to ensure engine catches up after speed change

        } else {
            // Apply only to the specific track that changed
            const track = findTrackBySide(trackSide);
            if (!track || !track.isReady) return;
            if (Math.abs(track.parameters.speed - newSpeedValue) < 1e-6) return; // No change for this track

            console.log(`App: Unlinked speed for track ${track.side} changed to ${newSpeedValue.toFixed(2)}x`);
            track.parameters.speed = newSpeedValue;
            AudioApp.audioEngine.setTrackSpeed(track.id, newSpeedValue);
            // Note: Global time calculation becomes less accurate with unlinked speeds.
            // Drift measurement will still work based on worklet reports.
        }
    }

    /**
     * Handles pitch changes from UI sliders. Applies to one or both tracks based on linking state.
     * @param {'left' | 'right'} trackSide - The side of the slider that triggered the change.
     * @param {number} pitch - The new pitch value.
     * @private
     */
    function handlePitchChange(trackSide, pitch) {
         const newPitchValue = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0)); // Clamp 0.25-2.0

         if (pitchLinked) {
              // Apply to all ready tracks
              console.log(`App: Linked pitch changed to ${newPitchValue.toFixed(2)}x`);
              tracks.forEach(track => {
                  if (track?.isReady) {
                       track.parameters.pitch = newPitchValue;
                       AudioApp.audioEngine.setTrackPitch(track.id, newPitchValue);
                       // Update the corresponding UI slider value directly
                       AudioApp.uiManager.setSliderValue(document.getElementById(`pitch_${track.side}`), newPitchValue, document.getElementById(`pitchValue_${track.side}`), 'x');
                  }
              });
         } else {
              // Apply only to the specific track
              const track = findTrackBySide(trackSide);
              if (!track || !track.isReady) return;
              if (Math.abs(track.parameters.pitch - newPitchValue) < 1e-6) return; // No change

              console.log(`App: Unlinked pitch for track ${track.side} changed to ${newPitchValue.toFixed(2)}x`);
              track.parameters.pitch = newPitchValue;
              AudioApp.audioEngine.setTrackPitch(track.id, newPitchValue);
         }
         // No time base adjustment or sync needed for pitch
    }

    /** Handles master gain changes from UI */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); }

    /** Internal function to sync engine after debounced wait (e.g., after speed change) */
    function syncEngineToEstimatedTime() {
        // Check if playing and ready before syncing
        if (globalPlaybackState !== 'playing' || !areAllActiveTracksReady()) {
            console.log("App (Debounced Sync): Skipping sync - not playing or tracks not ready.");
            return;
        }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        const targetGlobalTime = calculateEstimatedSourceTime();
        console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`);
        handleSeekInternal(targetGlobalTime); // Use the seek logic to handle pause/resume correctly
    }

    /** Handles VAD threshold changes from UI (applies to Left track only) */
    function handleThresholdChange(e) {
        const track = tracks[0]; // VAD only on left track currently
        if (!track || !track.vad.results || track.vad.isProcessing) return;
        const { type, value } = e.detail;
        // Delegate update and recalculation to vadAnalyzer
        const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value);
        // Update UI text (if element exists)
        AudioApp.uiManager.setSpeechRegionsText(newRegions);
        // Redraw waveform highlight if visualizer exists
        if(track.audioBuffer && waveformVizLeft) {
            waveformVizLeft.redrawWaveformHighlight(newRegions);
        }
    }

    /** Handles the `playbackEnded` event from a worklet */
    function handlePlaybackEnded(e) {
        const trackId = e.detail.trackId; const track = findTrackById(trackId);
        if (!track) return;
        console.log(`App: Playback ended event received for track ${track.side}.`);
        track.hasEnded = true; // Mark this track as ended

        // Check if *all* currently active and ready tracks have ended
        const activeTracksStillPlaying = tracks.filter(t => t?.isReady && !t.hasEnded && (multiTrackModeActive || t.side === 'left'));

        if (activeTracksStillPlaying.length === 0 && getReadyTrackCount() > 0) {
            console.log("App: All active tracks have ended playback.");
            globalPlaybackState = 'stopped'; // Change global state
            stopUIUpdateLoop(); // Stop UI updates
            playbackStartTimeContext = null; // Clear context time
            // Set final time to max duration
            const maxDuration = calculateMaxEffectiveDuration();
            playbackStartSourceTime = maxDuration;
            updateUIWithTime(maxDuration); // Update UI to show end time
            AudioApp.uiManager.setPlayButtonState(false); // Set button to 'Play'
        }
    }

    /** Informational handler for playback state changes from worklet */
    function handlePlaybackStateChange(e) { /* console.log(`App: Worklet ${e.detail.trackId} reported playing state: ${e.detail.isPlaying}`); */ }

    /**
     * Handles the `timeUpdated` event from the audioEngine (forwarded from worklets).
     * Stores the reported time for the specific track, used for drift calculation.
     * @param {CustomEvent<{currentTime: number, trackId: string}>} e - Event details.
     * @private
     */
    function handleTimeUpdate(e) {
        const { currentTime, trackId } = e.detail;
        const track = findTrackById(trackId);
        if (track) {
            track.lastReportedTime = currentTime;
            // Drift calculation happens within the rAF loop (updateUIWithTime)
        }
    }

    /** Handles keyboard shortcuts */
    function handleKeyPress(e) {
        console.log("App: Key pressed", e.detail.key);
        // Only handle if controls are generally enabled
        if (!areAllActiveTracksReady() && e.detail.key !== 'Space') return; // Allow space maybe? Let's restrict for now.
        if (!areAllActiveTracksReady()) return;

        const key = e.detail.key;
        const jumpTimeValue = AudioApp.uiManager.getJumpTime();
        switch (key) {
            case 'Space':
                handlePlayPause();
                break;
            case 'ArrowLeft':
                handleJump({ detail: { seconds: -jumpTimeValue } });
                break;
            case 'ArrowRight':
                handleJump({ detail: { seconds: jumpTimeValue } });
                break;
        }
    }

    /** Cleans up resources before the page unloads */
    function handleBeforeUnload() {
        console.log("App: Unloading page...");
        // Cancel any pending timeouts
        tracks.forEach(track => { if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); } });
        stopUIUpdateLoop();
        AudioApp.audioEngine?.cleanup(); // Tell engine to release context and worklets
    }

    /** Handles window resize events - redraws visuals */
    function handleWindowResize() {
        const currentTime = calculateEstimatedSourceTime();
        // Resize and redraw visualizers (they handle caching internally)
        waveformVizLeft?.resizeAndRedraw();
        specVizLeft?.resizeAndRedraw();
        if (multiTrackModeActive) {
            waveformVizRight?.resizeAndRedraw();
            specVizRight?.resizeAndRedraw();
        }
        // Update UI time/indicators immediately after resize
        updateUIWithTime(currentTime);
    }


    // --- Main Thread Time Calculation & UI Update ---

    /** Starts the requestAnimationFrame loop for UI updates. */
    function startUIUpdateLoop() {
        // Prevent multiple loops
        if (rAFUpdateHandle === null) {
             console.log("App: Starting UI update loop.");
             rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime);
        }
    }
    /** Stops the requestAnimationFrame loop. */
    function stopUIUpdateLoop() {
        if (rAFUpdateHandle !== null) {
            console.log("App: Stopping UI update loop.");
            cancelAnimationFrame(rAFUpdateHandle);
            rAFUpdateHandle = null;
        }
    }

    /**
     * Calculates the estimated current global source time based on context time and speed.
     * @returns {number} The estimated global source time in seconds.
     */
    function calculateEstimatedSourceTime() {
        const audioCtx = AudioApp.audioEngine.getAudioContext();
        const maxDuration = calculateMaxEffectiveDuration();

        // If not playing, or context/duration invalid, return the last known source time
        if (globalPlaybackState !== 'playing' || playbackStartTimeContext === null || !audioCtx || maxDuration <= 0) {
            return playbackStartSourceTime;
        }
        // Avoid division by zero or negative speeds
        if (currentGlobalSpeed <= 0) {
            return playbackStartSourceTime;
        }

        const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
        const elapsedSourceTime = elapsedContextTime * currentGlobalSpeed; // Time progressed since play/resume
        let estimatedCurrentGlobalTime = playbackStartSourceTime + elapsedSourceTime;

        // Clamp to bounds [0, maxDuration]
        return Math.max(0, Math.min(estimatedCurrentGlobalTime, maxDuration));
    }

     /**
      * Updates the UI time display, seek bar, drift display, and visualization progress indicators.
      * Called within the rAF loop or after seeks/pauses.
      * @param {number} globalTime - The current estimated global time.
      * @private
      */
     function updateUIWithTime(globalTime) {
          const maxEffectiveDuration = calculateMaxEffectiveDuration();
          const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration));
          const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0;

          // Update Time Display & Seek Bar
          AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration);
          AudioApp.uiManager.updateSeekBar(fraction); // UI Manager handles not fighting user input

          // --- Calculate and Update Drift ---
          let driftMs = 0;
          const leftTrack = tracks[0];
          const rightTrack = tracks[1];
          // Only calculate drift if in multi-track mode and both tracks have reported time
          if (multiTrackModeActive && leftTrack?.isReady && rightTrack?.isReady) {
               // Use the last reported times stored in the track state
               driftMs = (leftTrack.lastReportedTime - rightTrack.lastReportedTime) * 1000;
          }
          AudioApp.uiManager.updateDriftDisplay(driftMs);

          // --- Update Visualizer Progress Indicators ---
          // Left Track
          if (leftTrack?.audioBuffer && waveformVizLeft?.updateProgressIndicator) {
              waveformVizLeft.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration);
          }
          if (leftTrack?.audioBuffer && specVizLeft?.updateProgressIndicator) {
              specVizLeft.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration);
          }
          // Right Track (only if active)
          if (multiTrackModeActive && rightTrack?.audioBuffer && waveformVizRight?.updateProgressIndicator) {
              waveformVizRight.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration);
          }
          if (multiTrackModeActive && rightTrack?.audioBuffer && specVizRight?.updateProgressIndicator) {
              specVizRight.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration);
          }
     }

    /**
     * The function called by requestAnimationFrame to update the UI based on current time.
     * @param {DOMHighResTimeStamp} timestamp - Provided by requestAnimationFrame.
     * @private
     */
    function updateUIBasedOnContextTime(timestamp) {
        // Ensure loop stops if state is not 'playing'
        if (globalPlaybackState !== 'playing') {
            rAFUpdateHandle = null; // Ensure handle is cleared
            return;
        }
        const estimatedGlobalTime = calculateEstimatedSourceTime();
        updateUIWithTime(estimatedGlobalTime);
        // Schedule the next frame
        rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime);
    }


    // --- Public Interface ---
    return {
        init: init // Expose only the init function
        // All other functions are private or event handlers
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---