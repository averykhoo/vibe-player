// --- /vibe-player/js/app.js ---
// Creates the global namespace and orchestrates the application flow.
// MUST be loaded FIRST after libraries.
// Refactored for potential multi-track support.

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
    const Utils = AudioApp.Utils; // Now using Utils

    // --- Application State ---
    // --- Track-Specific State (Arrays, index 0 and 1) ---
    /** @type {Array<AudioBuffer|null>} Currently loaded audio buffers. */
    let audioBuffers = [null, null];
    /** @type {Array<VadResult|null>} Results from VAD analysis. */
    let vadResults = [null, null];
    /** @type {Array<File|null>} Currently loaded audio file objects. */
    let files = [null, null];
    /** @type {Array<boolean>} Flags indicating if the VAD model is ready (shared, but potentially track-specific logic later?). */
    let vadModelReady = false; // Keep single for now, model is loaded once.
    /** @type {Array<boolean>} Flags indicating if the AudioWorklet processor is ready for playback commands. */
    let workletReadyStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if background VAD is running for a track. */
    let vadProcessingStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if playback for a track has ended. */
    let trackEndedStates = [false, false];

    // --- Shared Playback State ---
    /** @type {number} Number of currently active/loaded tracks (0, 1, or 2). */
    let activeTracks = 0;
    /** @type {number|null} AudioContext time when playback/seek started */ let playbackStartTimeContext = null;
    /** @type {number} Shared source time (in seconds) when playback/seek started */ let playbackStartSourceTime = 0.0;
    /** @type {boolean} Overall playback state (true if any active track is playing). */ let isActuallyPlaying = false;
    /** @type {number|null} */ let rAFUpdateHandle = null; // requestAnimationFrame handle
    /** @type {number} Playback speed used for main thread time estimation */ let currentSpeedForUpdate = 1.0;

    // --- Debounced Function ---
    /** @type {Function|null} Debounced function for engine synchronization after speed change. */
    let debouncedSyncEngine = null;
    const SYNC_DEBOUNCE_WAIT_MS = 300; // Wait 300ms after last speed change before syncing

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("AudioApp: Initializing...");

        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer || !AudioApp.spectrogramVisualizer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.Constants || !AudioApp.Utils) {
             console.error("AudioApp: CRITICAL - One or more required modules/constants/utils not found!");
             AudioApp.uiManager?.setFileInfo("Initialization Error: Missing modules. Check console.");
             return;
        }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);

        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();
        AudioApp.waveformVisualizer.init(); // Assuming single instance for now
        AudioApp.spectrogramVisualizer.init(); // Assuming single instance for now
        setupAppEventListeners();

        // Reset state completely on init
        _resetAppState();

        console.log("AudioApp: Initialized. Waiting for file...");
    }

    /** @private */
    function _resetAppState() {
        stopUIUpdateLoop();
        audioBuffers = [null, null];
        vadResults = [null, null];
        files = [null, null];
        workletReadyStates = [false, false];
        vadProcessingStates = [false, false];
        trackEndedStates = [false, false];
        activeTracks = 0;
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        isActuallyPlaying = false;
        currentSpeedForUpdate = 1.0;
        // vadModelReady flag persists across loads unless explicitly reset if needed
    }


    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() {
        // UI -> App
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek);
        document.addEventListener('audioapp:seekBarInput', handleSeekBarInput);
        document.addEventListener('audioapp:speedChanged', handleSpeedChange);
        document.addEventListener('audioapp:pitchChanged', handlePitchChange);
        document.addEventListener('audioapp:gainChanged', handleGainChange);
        document.addEventListener('audioapp:thresholdChanged', handleThresholdChange);
        document.addEventListener('audioapp:keyPressed', handleKeyPress);
        // AudioEngine -> App (Events now include trackIndex)
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError); // May not have trackIndex yet
        document.addEventListener('audioapp:resamplingError', handleAudioError); // Needs context to know trackIndex
        document.addEventListener('audioapp:playbackError', handleAudioError); // Now includes trackIndex
        document.addEventListener('audioapp:engineError', handleAudioError); // Now includes trackIndex
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded); // Now includes trackIndex
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange); // Now includes trackIndex
        document.addEventListener('audioapp:internalSpeedChanged', handleInternalSpeedChange); // Now includes trackIndex
        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Event Handler Functions ---

    /** @param {CustomEvent<{file: File}>} e @private */
    async function handleFileSelected(e) {
        const file = e.detail.file; if (!file) return;

        // --- For this refactor, we always load into Track 0 ---
        const targetTrackIndex = 0;
        console.log(`App: File selected - ${file.name} (loading into track ${targetTrackIndex})`);

        // Reset state for the target track ONLY
        _resetTrackState(targetTrackIndex);

        // Reset shared playback state if needed (e.g., if stopping current playback)
        if (isActuallyPlaying) {
             audioEngine.togglePlayPause(); // Ask engine to stop everything
             stopUIUpdateLoop();
             isActuallyPlaying = false;
             playbackStartTimeContext = null;
        }
        playbackStartSourceTime = 0.0; // Reset shared start time

        // Update state for the new track
        files[targetTrackIndex] = file;
        activeTracks = files.filter(f => f !== null).length; // Recalculate active tracks

        // Reset UI & Visuals (assuming single-track UI for now)
        AudioApp.uiManager.resetUI(); // Full reset might be okay for now
        AudioApp.uiManager.setFileInfo(`Loading Track ${targetTrackIndex}: ${file.name}...`);
        AudioApp.waveformVisualizer.clearVisuals(); // Clears track 0 visuals
        AudioApp.spectrogramVisualizer.clearVisuals(); // Clears track 0 visuals
        AudioApp.spectrogramVisualizer.showSpinner(true); // Show track 0 spinner

        try {
            // Use the new engine method
            await AudioApp.audioEngine.loadAndProcessTrack(file, targetTrackIndex);
        }
        catch (error) {
            console.error("App: Error initiating file processing -", error);
            AudioApp.uiManager.setFileInfo(`Error loading: ${error.message}`); AudioApp.uiManager.resetUI();
            AudioApp.spectrogramVisualizer.showSpinner(false); stopUIUpdateLoop();
            _clearTrackStateOnError(targetTrackIndex, 'load'); // Clear state for the failed track
        }
    }

    /**
     * Handles audio decoding completion for a specific track.
     * Stores buffer, triggers visuals/VAD for that track.
     * @param {CustomEvent<{audioBuffer: AudioBuffer, trackIndex: number}>} e @private
     */
    async function handleAudioLoaded(e) {
        const { audioBuffer, trackIndex } = e.detail;
        if (audioBuffer === null || trackIndex === undefined) return;

        console.log(`App: Audio decoded for track ${trackIndex} (${audioBuffer.duration.toFixed(2)}s)`);
        audioBuffers[trackIndex] = audioBuffer;

        // --- Update UI/Visuals only for Track 0 for now ---
        if (trackIndex === 0) {
            // Update shared UI time/seek state based on track 0
            AudioApp.uiManager.updateTimeDisplay(0, audioBuffer.duration);
            AudioApp.uiManager.updateSeekBar(0);
            playbackStartSourceTime = 0.0; // Reset shared time base

            // Draw initial waveform (gray) for track 0
            console.log("App: Drawing initial waveform (Track 0)...");
            await AudioApp.waveformVisualizer.computeAndDrawWaveform(audioBuffer, []); // Pass empty regions for loading color

            // Draw spectrogram (shows spinner internally) for track 0
            console.log("App: Starting spectrogram computation/drawing (Track 0)...");
            await AudioApp.spectrogramVisualizer.computeAndDrawSpectrogram(audioBuffer);

            console.log("App: Initial visuals initiated (Track 0).");
            AudioApp.uiManager.setFileInfo(`Processing VAD (Track 0): ${files[trackIndex] ? files[trackIndex].name : 'Unknown File'}`);

            // Trigger background VAD processing for track 0
            console.log("App: Starting background VAD processing (Track 0)...");
            runVadInBackground(audioBuffer, trackIndex); // Pass trackIndex
        } else {
            // Handle loading of track 1 later (VAD, visuals etc.)
            console.log(`App: Track ${trackIndex} buffer stored. UI/VAD update deferred.`);
        }
    }

    /**
     * Handles worklet ready signal for a specific track.
     * Enables playback controls only when *all* active tracks are ready.
     * @param {CustomEvent<{trackIndex: number}>} e @private
     */
    function handleWorkletReady(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackIndex < 0 || trackIndex >= workletReadyStates.length) return;

        console.log(`App: AudioWorklet processor for track ${trackIndex} is ready.`);
        workletReadyStates[trackIndex] = true;

        // Check if all *active* tracks are now ready
        _checkAndEnablePlaybackControls();

        // Update file info if all ready (use file name from track 0 for now)
        const allActiveReady = _areAllActiveTracksReady();
        if(allActiveReady && activeTracks > 0) {
             AudioApp.uiManager.setFileInfo(`Ready: ${files[0] ? files[0].name : 'Unknown File'}${activeTracks > 1 ? ' (+1 more)' : ''}`);
             // Hide spinner for track 0 visuals if it was the last one needed
             if (trackIndex === 0) {
                 AudioApp.spectrogramVisualizer.showSpinner(false);
             }
        } else if (activeTracks > 0) {
            const readyCount = workletReadyStates.filter((ready, i) => files[i] !== null && ready).length;
             AudioApp.uiManager.setFileInfo(`Loading... (${readyCount}/${activeTracks} tracks ready)`);
        }
    }


    /**
     * Runs VAD analysis in the background for a specific track.
     * @param {AudioBuffer} audioBuffer The buffer for the track to analyze.
     * @param {number} trackIndex The index of the track being analyzed.
     * @private
     */
     async function runVadInBackground(audioBuffer, trackIndex) {
        if (!audioBuffer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager || !AudioApp.waveformVisualizer) {
             console.error(`App (VAD Task ${trackIndex}): Missing dependencies.`); return;
        }
        if (vadProcessingStates[trackIndex]) { console.warn(`App: VAD processing already running for track ${trackIndex}.`); return; }

        vadProcessingStates[trackIndex] = true;
        let pcm16k = null; let vadSucceeded = false;

        try {
            if (!vadModelReady) {
                console.log(`App (VAD Task ${trackIndex}): Creating/loading VAD model...`);
                vadModelReady = await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE);
                if (!vadModelReady) throw new Error("Failed to create Silero VAD model.");
                console.log(`App (VAD Task ${trackIndex}): VAD model ready.`);
            }

            // --- Show VAD Progress UI only for Track 0 for now ---
            if (trackIndex === 0) {
                AudioApp.uiManager.showVadProgress(true);
                AudioApp.uiManager.updateVadProgress(0);
            }

            console.log(`App (VAD Task ${trackIndex}): Resampling audio...`);
            pcm16k = await AudioApp.audioEngine.resampleTo16kMono(audioBuffer);
            if (!pcm16k || pcm16k.length === 0) {
                 console.log(`App (VAD Task ${trackIndex}): No audio data after resampling.`);
                 if (trackIndex === 0) { // Only update UI for track 0
                     AudioApp.uiManager.setSpeechRegionsText("No VAD data (empty audio?)");
                     AudioApp.uiManager.updateVadProgress(100);
                     AudioApp.uiManager.enableVadControls(false);
                 }
                 vadProcessingStates[trackIndex] = false; return;
            }

            console.log(`App (VAD Task ${trackIndex}): Starting VAD analysis...`);
            const vadProgressCallback = (progress) => {
                 if (trackIndex === 0 && AudioApp.uiManager) { // Only update UI for track 0
                     if (progress.totalFrames > 0) { const percentage = (progress.processedFrames / progress.totalFrames) * 100; AudioApp.uiManager.updateVadProgress(percentage); }
                     else { AudioApp.uiManager.updateVadProgress(0); }
                 }
            };
            const analysisOptions = { onProgress: vadProgressCallback };
            const result = await AudioApp.vadAnalyzer.analyze(pcm16k, analysisOptions); // Use VAD module (manages its own state)
            vadResults[trackIndex] = result; // Store result in the correct slot

            console.log(`App (VAD Task ${trackIndex}): VAD analysis complete. Found ${result.regions?.length || 0} regions.`);
            vadSucceeded = true;

            // --- Update UI only for Track 0 ---
            if (trackIndex === 0) {
                 const speechRegions = result.regions || [];
                 AudioApp.uiManager.updateVadDisplay(result.initialPositiveThreshold, result.initialNegativeThreshold);
                 AudioApp.uiManager.setSpeechRegionsText(speechRegions);
                 AudioApp.uiManager.enableVadControls(true);
                 AudioApp.waveformVisualizer.redrawWaveformHighlight(audioBuffer, speechRegions);
                 AudioApp.uiManager.updateVadProgress(100);
            }

        } catch (error) {
            console.error(`App (VAD Task ${trackIndex}): Error during background VAD processing -`, error);
            if (trackIndex === 0) { // Only update UI for track 0
                 const errorType = error.message.includes("resampling") ? "Resampling Error" : error.message.includes("VAD") ? "VAD Error" : "Processing Error";
                 AudioApp.uiManager.setSpeechRegionsText(`${errorType}: ${error.message}`);
                 AudioApp.uiManager.enableVadControls(false);
                 AudioApp.uiManager.updateVadProgress(0);
            }
            vadResults[trackIndex] = null;
        } finally {
            vadProcessingStates[trackIndex] = false;
        }
    }

    /** @param {CustomEvent<{type?: string, error: Error, trackIndex?: number}>} e @private */
    function handleAudioError(e) {
        const errorType = e.detail.type || 'Unknown';
        const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred';
        const trackIndex = e.detail.trackIndex; // May be undefined for early errors

        console.error(`App: Audio Error - Type: ${errorType}, Track: ${trackIndex ?? 'N/A'}, Message: ${errorMessage}`, e.detail.error);

        // Attempt to clear state for the specific track if index is known
        if (trackIndex !== undefined) {
            _clearTrackStateOnError(trackIndex, errorType);
        } else {
            // If track index unknown (e.g., early load error), reset everything?
            console.warn("App: Audio error with unknown track index, performing full reset.");
            _resetAppState();
            AudioApp.uiManager.resetUI();
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
        }

        // Update UI
        // TODO: Improve UI error feedback beyond just fileInfo
        AudioApp.uiManager.setFileInfo(`Error (${errorType}): ${errorMessage.substring(0, 100)}`);
        if (_areAllActiveTracksReady()) { // Check if controls should be re-enabled/disabled
             _checkAndEnablePlaybackControls();
        } else {
             AudioApp.uiManager.enablePlaybackControls(false);
             AudioApp.uiManager.enableSeekBar(false);
        }
        stopUIUpdateLoop(); // Ensure loop is stopped on error
    }

    /** Helper to clear state for a specific track on error */
    function _clearTrackStateOnError(trackIndex, errorType) {
         console.log(`App: Clearing state for track ${trackIndex} due to error (${errorType}).`);
         audioBuffers[trackIndex] = null;
         files[trackIndex] = null;
         vadResults[trackIndex] = null;
         workletReadyStates[trackIndex] = false;
         vadProcessingStates[trackIndex] = false;
         trackEndedStates[trackIndex] = false;
         activeTracks = files.filter(f => f !== null).length; // Recalculate

         // TODO: Update UI more specifically later (e.g., show error for track 1)
         // For now, if track 0 fails, clear visuals.
         if (trackIndex === 0) {
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
            AudioApp.uiManager.resetUI(); // May be too aggressive later
         }
    }


    /** @private */
    function handlePlayPause() {
        if (!_areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Not all active tracks ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: Cannot play/pause, AudioContext not available."); return; }

        // If pausing, calculate current *shared* time and seek engine
        if (isActuallyPlaying) {
            const finalEstimatedTime = calculateEstimatedSourceTime();
            console.log(`App: Pausing requested. Seeking engine to estimated shared time: ${finalEstimatedTime.toFixed(3)} before pausing.`);
            AudioApp.audioEngine.seek(finalEstimatedTime); // Seek all active tracks

            // Update shared time base immediately
            playbackStartSourceTime = finalEstimatedTime;
            playbackStartTimeContext = null;
            stopUIUpdateLoop();
            updateUIWithTime(finalEstimatedTime); // Update shared UI immediately
        }
        // Tell engine to toggle internal state for all tracks
        AudioApp.audioEngine.togglePlayPause();
        // Actual state update and UI loop start happens in handlePlaybackStateChange
    }

    /** @param {CustomEvent<{seconds: number}>} e @private */
    function handleJump(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        // Use main thread calculation for current shared time
        const currentTime = calculateEstimatedSourceTime();
        // Duration for clamping needs context later (e.g., longest track?) - use track 0 for now
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
        if (isNaN(duration) || duration <= 0) return;

        const targetSharedTime = Math.max(0, Math.min(currentTime + e.detail.seconds, duration)); // Clamp based on Track 0 for now

        AudioApp.audioEngine.seek(targetSharedTime); // Tell engine to seek all active tracks

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }

    /** @param {CustomEvent<{fraction: number}>} e @private */
    function handleSeek(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        // Use duration from track 0 for fraction calculation for now
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
        if (isNaN(duration) || duration <= 0) return;

        const targetSharedTime = e.detail.fraction * duration;
        AudioApp.audioEngine.seek(targetSharedTime); // Tell engine to seek all active tracks

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }
    const handleSeekBarInput = handleSeek; // Alias

    /** @param {CustomEvent<{speed: number}>} e @private */
    function handleSpeedChange(e) {
        if (!_areAllActiveTracksReady()) return;
        AudioApp.audioEngine.setSpeed(e.detail.speed); // Engine applies to all
        debouncedSyncEngine(); // Sync engine to main thread time estimate after changes stop
    }

    /** @param {CustomEvent<{pitch: number}>} e @private */
    function handlePitchChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setPitch(e.detail.pitch); } // Engine applies to all
    /** @param {CustomEvent<{gain: number}>} e @private */
    function handleGainChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setGain(e.detail.gain); } // Engine applies to master

    /** @private */
    function syncEngineToEstimatedTime() {
        if (!_areAllActiveTracksReady() || activeTracks === 0) { console.log("App (Debounced Sync): Skipping sync - not ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        const targetSharedTime = calculateEstimatedSourceTime();
        console.log(`App: Debounced sync executing. Seeking engine to estimated shared time: ${targetSharedTime.toFixed(3)}.`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine seeks all active tracks

        // Update main thread state immediately
        playbackStartSourceTime = targetSharedTime;
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }


    /**
     * Handles the internal speed change potentially reported by the engine (less common now).
     * Updates the main thread's time tracking base.
     * @param {CustomEvent<{speed: number, trackIndex: number}>} e @private
     */
    function handleInternalSpeedChange(e) {
        const { speed: newSpeed, trackIndex } = e.detail;
        // Only react if the speed actually changed and it's from an active track
        if (newSpeed === currentSpeedForUpdate || files[trackIndex] === null) return;

        console.log(`App: Internal speed updated by engine (Track ${trackIndex}) to ${newSpeed.toFixed(2)}x. Updating shared speed estimate.`);

        const oldSpeed = currentSpeedForUpdate;
        currentSpeedForUpdate = newSpeed; // Update shared speed used for UI calculation

        const audioCtx = AudioApp.audioEngine.getAudioContext();
        // If playing, recalculate base times to prevent jump in UI display
        if (isActuallyPlaying && playbackStartTimeContext !== null && audioCtx) {
            const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
            const elapsedSourceTime = elapsedContextTime * oldSpeed; // Use OLD speed
            const previousSourceTime = playbackStartSourceTime + elapsedSourceTime;
            playbackStartSourceTime = previousSourceTime;
            playbackStartTimeContext = audioCtx.currentTime;
            console.log(`App: Adjusted time tracking base for speed change. New base source time: ${playbackStartSourceTime.toFixed(3)}`);
        }
    }

    /** @param {CustomEvent<{type: string, value: number}>} e @private */
    function handleThresholdChange(e) {
        // Operate on VAD results for track 0 for now
        const trackIndex = 0;
        if (!vadResults[trackIndex] || vadProcessingStates[trackIndex]) return;

        const { type, value } = e.detail;
        // Assume vadAnalyzer handles its own state based on initial analysis
        const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value); // TODO: Pass trackIndex if vadAnalyzer is adapted later

        // Update UI for track 0
        AudioApp.uiManager.setSpeechRegionsText(newRegions); // Assumes single display
        if(audioBuffers[trackIndex]) {
             AudioApp.waveformVisualizer.redrawWaveformHighlight(audioBuffers[trackIndex], newRegions); // Assumes single visualizer instance
        }
    }

    /**
     * Handles playback ended signal from a specific track's worklet.
     * Updates the ended state for that track. Stops UI loop only if ALL active tracks ended.
     * @param {CustomEvent<{trackIndex: number}>} e @private
     */
    function handlePlaybackEnded(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackEndedStates[trackIndex]) return; // Ignore if index invalid or already ended

        console.log(`App: Playback ended event received for track ${trackIndex}.`);
        trackEndedStates[trackIndex] = true;

        // Check if all *active* tracks have now ended
        let allActiveEnded = true;
        for (let i = 0; i < files.length; i++) {
            if (files[i] !== null && !trackEndedStates[i]) {
                 allActiveEnded = false;
                 break;
            }
        }

        if (allActiveEnded) {
             console.log("App: All active tracks have ended.");
             isActuallyPlaying = false;
             stopUIUpdateLoop();
             playbackStartTimeContext = null;
             // Set UI time to duration of track 0 (or longest track later?)
             const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
             playbackStartSourceTime = duration;
             updateUIWithTime(duration);
             AudioApp.uiManager.setPlayButtonState(false);
        } else {
            console.log(`App: Track ${trackIndex} ended, but other active tracks continue.`);
            // isActuallyPlaying state is managed in handlePlaybackStateChange
        }
    }

    /**
     * Handles playback state confirmation from a specific track's worklet.
     * Manages overall playback state and UI loop.
     * @param {CustomEvent<{isPlaying: boolean, trackIndex: number}>} e @private
     */
     function handlePlaybackStateChange(e) {
        const { isPlaying: workletIsPlaying, trackIndex } = e.detail;
        if (trackIndex === undefined) return;

        console.log(`App: Playback state confirmed by worklet (Track ${trackIndex}): ${workletIsPlaying}`);

        // Determine the *new overall* playback state
        // Play if commanded AND at least one active track is NOT ended AND reporting playing
        // Note: This assumes a command to play/pause affects all simultaneously.
        let overallShouldBePlaying = false;
        if (workletIsPlaying) { // If at least one track reports playing...
             // Check if *any* active, non-ended track is now playing
             for(let i=0; i<files.length; i++) {
                  if (files[i] !== null && !trackEndedStates[i]) {
                       // We need to know the intended state (was play commanded?)
                       // For simplicity now, if *any* active track reports playing, assume overall is playing
                       overallShouldBePlaying = true; // This might need refinement based on exact command timing
                       break;
                  }
             }
        } else {
            // If this track stopped, check if *any other* active, non-ended track is still playing
             // This requires knowing the state of other worklets, which isn't directly available here.
             // Alternative: rely on the commanded state. If pause was commanded, overallShouldBePlaying = false.
             // Let's assume for now: if the latest event is 'false', the overall state becomes false.
             // This relies on receiving events promptly from all worklets after a command.
             overallShouldBePlaying = false; // Simplification: last event dictates state? Risky.
        }

         // --- Refined approach: Check intended state ---
         // Let's track the *intended* state based on the last command
         let commandedStateIsPlay = false; // Need to track this based on handlePlayPause etc.
         // For now, use the logic: If ANY active, non-ended track is playing, UI loop runs.
         let anyActiveTrackPlaying = false;
          for(let i=0; i<files.length; i++) {
               // How to know the *current* state of track 'i' if its event hasn't arrived?
               // Need to store last known state per track? e.g., trackPlayingStates = [false, false]
               // Let's stick to the simple logic for now: if the event says playing, overall is playing.
               // If the event says stopping, overall is stopping (assuming pause syncs).
               if (files[i] !== null && !trackEndedStates[i]) {
                    if(i === trackIndex && workletIsPlaying) {
                         anyActiveTrackPlaying = true; break;
                    }
                    // If we stored state: if (trackPlayingStates[i]) { anyActiveTrackPlaying = true; break; }
               }
          }
         overallShouldBePlaying = anyActiveTrackPlaying; // Revise based on incoming event


        // --- Update state and UI loop ---
        if (overallShouldBePlaying && !isActuallyPlaying) {
            // Transitioning to Playing
            isActuallyPlaying = true;
            AudioApp.uiManager.setPlayButtonState(true);
            const audioCtx = AudioApp.audioEngine?.getAudioContext();
            if (audioCtx) {
                // Reset time base based on *shared* source time
                 playbackStartSourceTime = calculateEstimatedSourceTime(); // Get current estimate before starting
                 playbackStartTimeContext = audioCtx.currentTime; // Mark context time NOW
                 console.log(`App: Playback confirmed started/resumed. Setting shared time base: src=${playbackStartSourceTime.toFixed(3)}, ctx=${playbackStartTimeContext.toFixed(3)}`);
                 updateUIWithTime(playbackStartSourceTime); // Ensure UI reflects start
                 startUIUpdateLoop();
            }
        } else if (!overallShouldBePlaying && isActuallyPlaying) {
            // Transitioning to Paused/Stopped
            isActuallyPlaying = false;
            AudioApp.uiManager.setPlayButtonState(false);
            stopUIUpdateLoop();
            playbackStartTimeContext = null; // Clear context time marker
            // Time already synced in handlePlayPause or handlePlaybackEnded
            console.log(`App: Playback confirmed stopped/paused. Base source time: ${playbackStartSourceTime.toFixed(3)}`);
        }
    }


    /** @param {CustomEvent<{key: string}>} e @private */
    function handleKeyPress(e) { if (!_areAllActiveTracksReady()) return; const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; } }

    /** @private */
    function handleWindowResize() {
        // Resize visuals for track 0 for now
        const trackIndex = 0;
        const regions = vadResults[trackIndex] ? (vadResults[trackIndex].regions || []) : [];
        AudioApp.waveformVisualizer?.resizeAndRedraw(audioBuffers[trackIndex], regions); // Assumes single instance
        AudioApp.spectrogramVisualizer?.resizeAndRedraw(audioBuffers[trackIndex]); // Assumes single instance
    }
    /** @private */
    function handleBeforeUnload() { console.log("App: Unloading..."); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); }

    // --- Main Thread Time Calculation & UI Update (Shared Timeline) ---

    /** @private */
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    /** @private */
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }

    /**
     * Calculates the estimated current shared source time based on AudioContext time.
     * @private
     * @returns {number} The estimated current time in seconds on the shared timeline.
     */
    function calculateEstimatedSourceTime() {
        const audioCtx = AudioApp.audioEngine?.getAudioContext();
        // Use duration of track 0 for clamping for now
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;

        if (!isActuallyPlaying || playbackStartTimeContext === null || !audioCtx || activeTracks === 0 || duration <= 0) {
            return playbackStartSourceTime;
        }
        if (currentSpeedForUpdate <= 0) { return playbackStartSourceTime; }

        const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
        const elapsedSourceTime = elapsedContextTime * currentSpeedForUpdate;
        let estimatedCurrentSourceTime = playbackStartSourceTime + elapsedSourceTime;

        // Clamp to valid duration range (using track 0's duration for now)
        estimatedCurrentSourceTime = Math.max(0, Math.min(estimatedCurrentSourceTime, duration));
        return estimatedCurrentSourceTime;
    }

    /**
     * Updates the shared time display, seek bar, and track 0 visualization progress.
     * @param {number} sharedTime - The current shared source time to display.
     * @private
     */
    function updateUIWithTime(sharedTime) {
        // Use duration of track 0 for display/seek bar calculation for now
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
        if (isNaN(duration)) return;

        const clampedSharedTime = Math.max(0, Math.min(sharedTime, duration)); // Clamp based on track 0
        const fraction = duration > 0 ? clampedSharedTime / duration : 0;

        // Update shared UI elements
        AudioApp.uiManager.updateTimeDisplay(clampedSharedTime, duration);
        AudioApp.uiManager.updateSeekBar(fraction);

        // Update visuals for track 0
        // TODO: Update visuals for track 1 using sharedTime + offset later
        if (audioBuffers[0]) {
            AudioApp.waveformVisualizer?.updateProgressIndicator(clampedSharedTime, duration); // Pass track 0 duration
            AudioApp.spectrogramVisualizer?.updateProgressIndicator(clampedSharedTime, duration); // Pass track 0 duration
        }
    }


    /**
     * The main UI update loop function, called via requestAnimationFrame.
     * Uses main thread calculation (AudioContext time) for shared time estimation.
     * @param {DOMHighResTimeStamp} timestamp - The timestamp provided by rAF.
     * @private
     */
    function updateUIBasedOnContextTime(timestamp) {
        if (!isActuallyPlaying) { rAFUpdateHandle = null; return; } // Stop loop if not playing

        const estimatedSharedTime = calculateEstimatedSourceTime();
        updateUIWithTime(estimatedSharedTime);

        rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime);
    }

    // --- Helper Functions ---
    /** @private */
    function _resetTrackState(trackIndex) {
         audioBuffers[trackIndex] = null;
         files[trackIndex] = null;
         vadResults[trackIndex] = null;
         workletReadyStates[trackIndex] = false;
         vadProcessingStates[trackIndex] = false;
         trackEndedStates[trackIndex] = false;
         // Don't decrement activeTracks here, handleFileSelected recalculates it
    }

    /** @private */
    function _areAllActiveTracksReady() {
        if (activeTracks === 0) return false;
        for (let i = 0; i < workletReadyStates.length; i++) {
            if (files[i] !== null && !workletReadyStates[i]) {
                 return false; // Found an active track that isn't ready
            }
        }
        return true; // All active tracks are ready
    }

     /** @private */
     function _checkAndEnablePlaybackControls() {
         const allReady = _areAllActiveTracksReady();
         console.log(`App: Checking controls. Active tracks: ${activeTracks}, All active ready: ${allReady}`);
         AudioApp.uiManager.enablePlaybackControls(allReady);
         AudioApp.uiManager.enableSeekBar(allReady);
         // VAD controls enabled separately based on VAD completion for track 0
     }

    // --- Public Interface ---
    return {
        init: init
        // Expose other methods if needed for debugging or direct calls, but keep minimal
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
