// --- /vibe-player/js/app.js ---
// Creates the global namespace and orchestrates the application flow.
// MUST be loaded FIRST after libraries.
// Refactored for multi-track UI states and basic track management.

/**
 * @namespace AudioApp
 * @description Main application namespace for Vibe Player.
 */
var AudioApp = AudioApp || {}; // Create the main application namespace

AudioApp = (function() {
    'use strict';

    // === Module Dependencies ===
    const Utils = AudioApp.Utils;

    // --- Application State ---
    // Track-Specific State
    /** @type {Array<AudioBuffer|null>} */ let audioBuffers = [null, null];
    /** @type {Array<VadResult|null>} */ let vadResults = [null, null];
    /** @type {Array<File|null>} */ let files = [null, null];
    /** @type {boolean} */ let vadModelReady = false;
    /** @type {Array<boolean>} */ let workletReadyStates = [false, false];
    /** @type {Array<boolean>} */ let vadProcessingStates = [false, false];
    /** @type {Array<boolean>} */ let trackEndedStates = [false, false];
    /** @type {Array<boolean>} */ let trackMuteStates = [false, false]; // New state for mute

    // Shared Playback State
    /** @type {number} */ let activeTracks = 0;
    /** @type {number|null} */ let playbackStartTimeContext = null;
    /** @type {number} */ let playbackStartSourceTime = 0.0;
    /** @type {boolean} */ let isActuallyPlaying = false;
    /** @type {number|null} */ let rAFUpdateHandle = null;
    /** @type {number} */ let currentSpeedForUpdate = 1.0;

    // Debounced Function
    /** @type {Function|null} */ let debouncedSyncEngine = null;
    const SYNC_DEBOUNCE_WAIT_MS = 300;

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("AudioApp: Initializing...");

        if (!AudioApp.uiManager || !AudioApp.audioEngine /* ... other checks ... */) {
             console.error("AudioApp: CRITICAL - One or more required modules not found!");
             AudioApp.uiManager?.setFileInfo("Init Error.", 0); return;
        }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);

        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();
        AudioApp.waveformVisualizer.init();
        AudioApp.spectrogramVisualizer.init();
        setupAppEventListeners();

        _resetAppState();
        AudioApp.uiManager.setUILayoutState(0); // Start with 0 tracks visible

        console.log("AudioApp: Initialized. Waiting for file...");
    }

    /** @private */
    function _resetAppState() {
        console.log("App: Resetting app state.");
        stopUIUpdateLoop();
        audioBuffers = [null, null];
        vadResults = [null, null];
        files = [null, null];
        workletReadyStates = [false, false];
        vadProcessingStates = [false, false];
        trackEndedStates = [false, false];
        trackMuteStates = [false, false]; // Reset mute state
        activeTracks = 0;
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        isActuallyPlaying = false;
        currentSpeedForUpdate = 1.0;
    }


    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() {
        // UI -> App (Now includes trackIndex where relevant)
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrackClicked); // New
        document.addEventListener('audioapp:muteTrackClicked', handleMuteTrackClicked); // New
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracksClicked); // New

        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek);
        document.addEventListener('audioapp:seekBarInput', handleSeekBarInput);
        document.addEventListener('audioapp:speedChanged', handleSpeedChange);
        document.addEventListener('audioapp:pitchChanged', handlePitchChange);
        document.addEventListener('audioapp:gainChanged', handleGainChange); // Master Gain
        document.addEventListener('audioapp:thresholdChanged', handleThresholdChange);
        document.addEventListener('audioapp:keyPressed', handleKeyPress);

        // AudioEngine -> App
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError); // Context needed
        document.addEventListener('audioapp:playbackError', handleAudioError);
        document.addEventListener('audioapp:engineError', handleAudioError);
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded);
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange);
        document.addEventListener('audioapp:internalSpeedChanged', handleInternalSpeedChange);

        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Event Handler Functions ---

    /**
     * Handles file selection for a specific track.
     * @param {CustomEvent<{file: File, trackIndex: number}>} e @private
     */
    async function handleFileSelected(e) {
        const { file, trackIndex } = e.detail;
        if (!file || trackIndex === undefined) return;
        if (trackIndex !== 0 && trackIndex !== 1) {
             console.error(`App: Invalid trackIndex ${trackIndex} received from fileSelected event.`); return;
        }

        console.log(`App: File selected - ${file.name} (loading into track ${trackIndex})`);

        // --- State Reset ---
        // Reset state ONLY for the target track being loaded/reloaded
        const wasTrackActive = files[trackIndex] !== null;
        _resetTrackState(trackIndex); // Clears buffer, vad, ready flags etc. for this index

        // Stop playback if currently playing before loading new file
        if (isActuallyPlaying) {
             audioEngine.togglePlayPause(); // Stop all tracks
             stopUIUpdateLoop();
             isActuallyPlaying = false;
             playbackStartTimeContext = null;
        }
        // Reset shared time base only if loading track 0 OR if it was the only active track
        if (trackIndex === 0 || activeTracks === 1 && wasTrackActive) {
             playbackStartSourceTime = 0.0;
        }

        // --- Update State ---
        files[trackIndex] = file;
        activeTracks = files.filter(f => f !== null).length; // Recalculate count

        // --- Update UI ---
        AudioApp.uiManager.updateFileName(file.name, trackIndex);
        AudioApp.uiManager.setFileInfo(`Loading Track ${trackIndex}...`, trackIndex);
        // Set layout state based on number of active tracks
        AudioApp.uiManager.setUILayoutState(activeTracks);

        // Clear/Reset visuals ONLY for the target track (if UI is adapted later)
        // For now, only clear Track 0 visuals if Track 0 is loaded/reloaded
        if (trackIndex === 0) {
             AudioApp.uiManager.updateTimeDisplay(0, 0); // Reset shared display
             AudioApp.uiManager.updateSeekBar(0);
             AudioApp.waveformVisualizer.clearVisuals();
             AudioApp.spectrogramVisualizer.clearVisuals();
             AudioApp.spectrogramVisualizer.showSpinner(true);
             AudioApp.uiManager.enableVadControls(false, 0); // Disable VAD controls for T0
        } else {
             // TODO: Clear Track 1 visuals when UI is ready
        }

        // Disable shared controls until this track is ready
        AudioApp.uiManager.enablePlaybackControls(false);
        AudioApp.uiManager.enableSeekBar(false);

        // --- Load Audio ---
        try {
            await AudioApp.audioEngine.loadAndProcessTrack(file, trackIndex);
        } catch (error) {
            // Error is usually caught internally by audioEngine and dispatched, handled in handleAudioError
            console.error(`App: Error initiating file processing for track ${trackIndex} -`, error);
            // UI update happens in handleAudioError
        }
    }

    /**
     * Handles audio decoding completion for a specific track.
     * @param {CustomEvent<{audioBuffer: AudioBuffer, trackIndex: number}>} e @private
     */
    async function handleAudioLoaded(e) {
        const { audioBuffer, trackIndex } = e.detail;
        if (audioBuffer === null || trackIndex === undefined) return;

        console.log(`App: Audio decoded for track ${trackIndex} (${audioBuffer.duration.toFixed(2)}s)`);
        audioBuffers[trackIndex] = audioBuffer;
        AudioApp.uiManager.setFileInfo(`Decoded: ${files[trackIndex]?.name || 'Unknown'}`, trackIndex);

        // Update shared UI time/seek state only if Track 0 loaded/reloaded
        if (trackIndex === 0) {
            AudioApp.uiManager.updateTimeDisplay(0, audioBuffer.duration);
            AudioApp.uiManager.updateSeekBar(0);
            playbackStartSourceTime = 0.0;
        }

        // --- Draw visuals and run VAD only for Track 0 FOR NOW ---
        if (trackIndex === 0) {
            console.log("App: Drawing initial waveform (Track 0)...");
            await AudioApp.waveformVisualizer.computeAndDrawWaveform(audioBuffer, []);
            console.log("App: Starting spectrogram computation/drawing (Track 0)...");
            // Spectrogram handles its own spinner hiding
            await AudioApp.spectrogramVisualizer.computeAndDrawSpectrogram(audioBuffer);
            console.log("App: Initial visuals initiated (Track 0).");
            AudioApp.uiManager.setFileInfo(`Processing VAD (Track 0)...`, trackIndex);
            console.log("App: Starting background VAD processing (Track 0)...");
            runVadInBackground(audioBuffer, trackIndex);
        } else {
            // TODO: Trigger visual/VAD processing for Track 1 later
            console.log(`App: Track ${trackIndex} buffer stored. Visual/VAD update deferred.`);
        }
    }

    /**
     * Handles worklet ready signal for a specific track.
     * @param {CustomEvent<{trackIndex: number}>} e @private
     */
    function handleWorkletReady(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackIndex < 0 || trackIndex >= workletReadyStates.length) return;

        console.log(`App: AudioWorklet processor for track ${trackIndex} is ready.`);
        workletReadyStates[trackIndex] = true;

        _checkAndEnablePlaybackControls(); // Checks if all active tracks are ready

        // Update file info text
        const allReady = _areAllActiveTracksReady();
        if (allReady && activeTracks > 0) {
            const infoText = activeTracks === 1
                ? `Ready: ${files[0]?.name || 'Track 0'}`
                : `Ready: T1: ${files[0]?.name || '?'} | T2: ${files[1]?.name || '?'}`;
             // Show combined info in Track 1's slot for now
             AudioApp.uiManager.setFileInfo(infoText, 0);
             AudioApp.uiManager.setFileInfo("", 1); // Clear track 2 info slot
             if (trackIndex === 0) AudioApp.spectrogramVisualizer.showSpinner(false); // Hide T0 spinner
             // TODO: Hide T1 spinner later
        } else if (activeTracks > 0) {
            const readyCount = workletReadyStates.filter((ready, i) => files[i] !== null && ready).length;
            AudioApp.uiManager.setFileInfo(`Loading... (${readyCount}/${activeTracks} tracks ready)`, 0); // Show status in T0 slot
             AudioApp.uiManager.setFileInfo("", 1);
        }
    }

    /**
     * Runs VAD analysis in the background for a specific track.
     * (Currently only updates UI for Track 0).
     * @param {AudioBuffer} audioBuffer The buffer for the track to analyze.
     * @param {number} trackIndex The index of the track being analyzed.
     * @private
     */
     async function runVadInBackground(audioBuffer, trackIndex) {
        // ... (Keep previous VAD logic, ensuring UI updates target track 0 elements for now) ...
         if (vadProcessingStates[trackIndex]) { console.warn(`App: VAD processing already running for track ${trackIndex}.`); return; }
         vadProcessingStates[trackIndex] = true;
         // ... rest of VAD logic from previous version ...
          try {
             // ... (Init model if needed) ...
             if (trackIndex === 0) { AudioApp.uiManager.showVadProgress(true, 0); AudioApp.uiManager.updateVadProgress(0, 0); }
             // ... (Resample) ...
             if (!pcm16k || pcm16k.length === 0) { /* ... handle empty ...*/ }
             // ... (Analyze with progress callback updating UI for track 0) ...
             const vadProgressCallback = (progress) => { if (trackIndex === 0) { /* update UI */ } };
             const result = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback });
             vadResults[trackIndex] = result;
             // ... (Update UI only for Track 0) ...
             if (trackIndex === 0) { /* Update VAD display, highlights etc */ }
          } catch (error) { /* ... handle error, update UI for track 0 ... */ }
          finally { vadProcessingStates[trackIndex] = false; }
    }

    /**
     * Handles various audio errors, clearing state for the affected track.
     * @param {CustomEvent<{type?: string, error: Error, trackIndex?: number}>} e @private
     */
    function handleAudioError(e) {
        const errorType = e.detail.type || 'Unknown';
        const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred';
        const trackIndex = e.detail.trackIndex; // Can be undefined for early/generic errors

        console.error(`App: Audio Error - Type: ${errorType}, Track: ${trackIndex ?? 'N/A'}, Message: ${errorMessage}`, e.detail.error);

        let targetIndex = -1;
        if (trackIndex !== undefined) { targetIndex = trackIndex; }
        else if (errorType === 'resampling' || errorType === 'decoding') {
             // Try to guess track index if not provided for these types? Risky. Assume track 0 for now.
             console.warn("App: Guessing track index 0 for resampling/decoding error.");
             targetIndex = 0;
        }

        if (targetIndex !== -1) {
            _clearTrackStateOnError(targetIndex, errorType); // Clears state, updates activeTracks, sets UI state
            AudioApp.uiManager.setFileInfo(`Error (T${targetIndex}): ${errorMessage.substring(0, 60)}`, targetIndex);
        } else {
            // Generic error, reset everything
            console.warn("App: Audio error with unknown track index, performing full reset.");
            _resetAppState();
            AudioApp.uiManager.resetUI(); // Resets layout to 0
        }

        // Update shared controls based on remaining tracks
        _checkAndEnablePlaybackControls();
        stopUIUpdateLoop();
    }

    /** Helper to clear state and update UI on error */
    function _clearTrackStateOnError(trackIndex, errorType) {
         console.log(`App: Clearing state for track ${trackIndex} due to error (${errorType}).`);
         // Cleanup engine resources FIRST
         AudioApp.audioEngine.cleanupTrack(trackIndex);
         // Clear app state
         _resetTrackState(trackIndex); // Resets buffer, file, vad, ready flags etc.
         activeTracks = files.filter(f => f !== null).length; // Recalculate count
         // Update UI Layout
         AudioApp.uiManager.setUILayoutState(activeTracks);
         // Clear specific UI elements for the track
         AudioApp.uiManager.updateFileName("", trackIndex);
         AudioApp.uiManager.setFileInfo(`Cleared (Error: ${errorType})`, trackIndex);
         if (trackIndex === 0) { // If track 0 cleared, reset shared UI
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
            AudioApp.uiManager.updateTimeDisplay(0, 0);
            AudioApp.uiManager.updateSeekBar(0);
            AudioApp.uiManager.enableVadControls(false, 0);
         }
          // TODO: Clear track 1 visuals if needed later
    }

    // --- NEW Event Handlers ---
    /**
     * Handles remove track button clicks.
     * @param {CustomEvent<{trackIndex: number}>} e
     * @private
     */
     function handleRemoveTrackClicked(e) {
          const { trackIndex } = e.detail;
          if (trackIndex === undefined || files[trackIndex] === null) return; // Ignore if no file there

          console.log(`App: Remove track ${trackIndex} requested.`);

          // Stop playback if running
          if (isActuallyPlaying) {
              audioEngine.togglePlayPause(); // Stop all tracks first
              stopUIUpdateLoop();
              isActuallyPlaying = false;
              playbackStartTimeContext = null;
              playbackStartSourceTime = 0.0; // Reset shared time
          }

          // Cleanup engine resources for this track
          AudioApp.audioEngine.cleanupTrack(trackIndex);

          // Clear app state for this track
          _resetTrackState(trackIndex);
          activeTracks = files.filter(f => f !== null).length; // Recalculate

           // Update UI Layout
           AudioApp.uiManager.setUILayoutState(activeTracks);
           AudioApp.uiManager.updateFileName("", trackIndex);
           AudioApp.uiManager.setFileInfo(activeTracks > 0 ? `Track ${trackIndex} removed.` : "No file selected.", trackIndex);

           // If track 0 was removed and track 1 exists, potentially shift T1 data to T0? (More complex)
           // For now, just clear T0 visuals if T0 removed.
           if (trackIndex === 0) {
               AudioApp.waveformVisualizer?.clearVisuals();
               AudioApp.spectrogramVisualizer?.clearVisuals();
               AudioApp.uiManager.updateTimeDisplay(0, 0);
               AudioApp.uiManager.updateSeekBar(0);
               AudioApp.uiManager.enableVadControls(false, 0);
           }
            // TODO: Clear T1 visuals if T1 removed later

           // Reset shared controls if no tracks left
           if (activeTracks === 0) {
                AudioApp.uiManager.resetUI();
                _resetAppState(); // Full reset if no tracks left
           } else {
                // If track 1 remains, update shared time display based on it?
                if (files[0] === null && files[1] !== null) {
                    // For now, time display stays blank or shows 0 until T1->T0 shift is implemented
                    AudioApp.uiManager.updateTimeDisplay(0, 0);
                    AudioApp.uiManager.updateSeekBar(0);
                } else if (files[0] !== null) {
                    // Update time display based on remaining track 0
                     AudioApp.uiManager.updateTimeDisplay(0, audioBuffers[0]?.duration || 0);
                     AudioApp.uiManager.updateSeekBar(0);
                }
                 _checkAndEnablePlaybackControls(); // Re-check controls based on remaining tracks
           }
     }

    /**
     * Handles mute button clicks for a specific track.
     * @param {CustomEvent<{trackIndex: number}>} e
     * @private
     */
    function handleMuteTrackClicked(e) {
         const { trackIndex } = e.detail;
         if (trackIndex === undefined || files[trackIndex] === null) return; // Ignore if no file

         const newMuteState = !trackMuteStates[trackIndex];
         trackMuteStates[trackIndex] = newMuteState;
         console.log(`App: Setting track ${trackIndex} mute state to ${newMuteState}`);

         AudioApp.audioEngine.setTrackMuted(trackIndex, newMuteState);
         AudioApp.uiManager.setMuteButtonState(trackIndex, newMuteState);
    }

    /**
     * Handles swap tracks button click. (Placeholder for now)
     * @param {CustomEvent} e
     * @private
     */
    function handleSwapTracksClicked(e) {
        if (activeTracks !== 2) return; // Only makes sense with two tracks

        console.log("App: Swap Tracks requested (Implementation Deferred).");
        // TODO: Implement actual swapping logic:
        // 1. Swap state arrays: files, audioBuffers, vadResults, workletReadyStates, etc.
        // 2. Potentially tell audioEngine to swap internal worklet associations? Or just rely on app state driving commands?
        // 3. Update UI: redraw visuals in swapped positions, update file names/info, update mute button states if needed.
        // AudioApp.uiManager.updateFileName(files[0]?.name || "", 0); // Update UI after swap
        // AudioApp.uiManager.updateFileName(files[1]?.name || "", 1);
        // ... redraw visuals ...
    }

    // --- Playback Controls & Time Sync Handlers (Largely Unchanged Logic, Operate on Shared State/Engine) ---
    /** @private */
    function handlePlayPause() { /* ... unchanged from previous version (calls engine.togglePlayPause) ... */ }
    /** @param {CustomEvent<{seconds: number}>} e @private */
    function handleJump(e) { /* ... unchanged (calculates shared time, calls engine.seek) ... */ }
    /** @param {CustomEvent<{fraction: number}>} e @private */
    function handleSeek(e) { /* ... unchanged (calculates shared time, calls engine.seek) ... */ }
    const handleSeekBarInput = handleSeek;
    /** @param {CustomEvent<{speed: number}>} e @private */
    function handleSpeedChange(e) { /* ... unchanged (calls engine.setSpeed, triggers debounce) ... */ }
    /** @param {CustomEvent<{pitch: number}>} e @private */
    function handlePitchChange(e) { /* ... unchanged (calls engine.setPitch) ... */ }
    /** @param {CustomEvent<{gain: number}>} e @private */
    function handleGainChange(e) { /* ... unchanged (calls engine.setGain for master) ... */ }
    /** @private */
    function syncEngineToEstimatedTime() { /* ... unchanged (calculates shared time, calls engine.seek) ... */ }
    /** @param {CustomEvent<{speed: number, trackIndex: number}>} e @private */
    function handleInternalSpeedChange(e) { /* ... unchanged (updates shared currentSpeedForUpdate) ... */ }
    /** @param {CustomEvent<{type: string, value: number, trackIndex: number}>} e @private */
    function handleThresholdChange(e) { /* ... unchanged (operates on track 0 VAD/Visuals for now) ... */ }
    /** @param {CustomEvent<{trackIndex: number}>} e @private */
    function handlePlaybackEnded(e) { /* ... unchanged (updates trackEndedStates, checks if all ended) ... */ }
    /** @param {CustomEvent<{isPlaying: boolean, trackIndex: number}>} e @private */
     function handlePlaybackStateChange(e) { /* ... unchanged (updates overall isActuallyPlaying) ... */ } // Review logic if needed
    /** @param {CustomEvent<{key: string}>} e @private */
    function handleKeyPress(e) { /* ... unchanged ... */ }
    /** @private */
    function handleWindowResize() { /* ... unchanged (resizes track 0 visuals for now) ... */ }
    /** @private */
    function handleBeforeUnload() { /* ... unchanged ... */ }


    // --- Main Thread Time Calculation & UI Update (Shared Timeline) ---
    /** @private */
    function startUIUpdateLoop() { /* ... unchanged ... */ }
    /** @private */
    function stopUIUpdateLoop() { /* ... unchanged ... */ }
    /** @private @returns {number} */
    function calculateEstimatedSourceTime() { /* ... unchanged (uses shared time base, track 0 duration) ... */ }
    /** @private @param {number} sharedTime */
    function updateUIWithTime(sharedTime) { /* ... unchanged (updates shared UI, track 0 visuals) ... */ }
    /** @private @param {DOMHighResTimeStamp} timestamp */
    function updateUIBasedOnContextTime(timestamp) { /* ... unchanged (calls calculate and updateUIWithTime) ... */ }


    // --- Helper Functions ---
    /** @private */
    function _resetTrackState(trackIndex) {
         console.log(`App: Resetting state for track ${trackIndex}`);
         audioBuffers[trackIndex] = null;
         files[trackIndex] = null; // Clear file reference
         vadResults[trackIndex] = null;
         workletReadyStates[trackIndex] = false;
         vadProcessingStates[trackIndex] = false;
         trackEndedStates[trackIndex] = false;
         trackMuteStates[trackIndex] = false; // Reset mute state too
         // activeTracks count is recalculated elsewhere
    }

    /** @private */
    function _areAllActiveTracksReady() {
        if (activeTracks === 0) return false;
        for (let i = 0; i < files.length; i++) { // Check up to max tracks (2)
            if (files[i] !== null && !workletReadyStates[i]) {
                 return false; // Found an loaded track that isn't ready
            }
        }
        return true; // All loaded tracks are ready
    }

     /** @private */
     function _checkAndEnablePlaybackControls() {
         const allReady = _areAllActiveTracksReady();
         console.log(`App: Checking controls. Active tracks: ${activeTracks}, All active ready: ${allReady}`);
         AudioApp.uiManager.enablePlaybackControls(allReady);
         AudioApp.uiManager.enableSeekBar(allReady);
         // If all are ready, ensure the UI state reflects it (might still be 'loading' visually)
         if(allReady && activeTracks > 0) {
              // Update layout state if needed (e.g., if UI was stuck showing 'loading')
               AudioApp.uiManager.setUILayoutState(activeTracks);
         }
     }

    // --- Public Interface ---
    return {
        init: init
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
