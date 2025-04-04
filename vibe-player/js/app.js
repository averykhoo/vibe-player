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
    /** @type {boolean} Flag indicating if the VAD model is ready (shared). */
    let vadModelReady = false;
    /** @type {Array<boolean>} Flags indicating if the AudioWorklet processor is ready for playback commands. */
    let workletReadyStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if background VAD is running for a track. */
    let vadProcessingStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if playback for a track has ended. */
    let trackEndedStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if a track is muted [Track 0, Track 1]. */
    let trackMutedStates = [false, false];

    // --- Shared Playback State ---
    /** @type {number} Number of currently active/loaded tracks (0, 1, or 2). */
    let activeTracks = 0;
    /** @type {number|null} AudioContext time when playback/seek started */ let playbackStartTimeContext = null;
    /** @type {number} Shared source time (in seconds) when playback/seek started */ let playbackStartSourceTime = 0.0;
    /** @type {boolean} Overall playback state (true if any active track is playing). */ let isActuallyPlaying = false;
    /** @type {number|null} */ let rAFUpdateHandle = null; // requestAnimationFrame handle
    /** @type {number} Playback speed used for main thread time estimation */ let currentSpeedForUpdate = 1.0;

    // --- Loading State ---
    /** @type {number} Index of the next track slot to load into (0 or 1). */
    let nextTrackIndexToLoad = 0;

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
        AudioApp.waveformVisualizer.init();
        AudioApp.spectrogramVisualizer.init();
        setupAppEventListeners();

        // Reset state completely on init
        _resetAppState();

        console.log("AudioApp: Initialized. Waiting for file...");
    }

    /** @private */
    function _resetAppState() {
        console.log("App: Resetting global state..."); // Added log
        stopUIUpdateLoop();
        audioBuffers = [null, null];
        vadResults = [null, null];
        files = [null, null];
        workletReadyStates = [false, false];
        vadProcessingStates = [false, false];
        trackEndedStates = [false, false];
        trackMutedStates = [false, false]; // Reset mute state
        activeTracks = 0;
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        isActuallyPlaying = false;
        currentSpeedForUpdate = 1.0;
        nextTrackIndexToLoad = 0; // Reset loading index

        // Ensure tracks are unmuted in engine on reset, IF engine exists
        // FIX: Check if audioEngine and setTrackMuted exist before calling
        if (AudioApp.audioEngine?.setTrackMuted) {
            try {
                AudioApp.audioEngine.setTrackMuted(0, false);
                AudioApp.audioEngine.setTrackMuted(1, false);
            } catch (e) {
                 console.warn("App: Error during reset unmute:", e); // Should not happen with check, but safety
            }
        } else {
            console.log("App: Skipping reset unmute as audioEngine is not ready.");
        }
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

        // --- Use alternating track index ---
        const targetTrackIndex = nextTrackIndexToLoad;
        console.log(`App: File selected - ${file.name} (loading into track ${targetTrackIndex})`);

        // Stop existing playback IF IT IS CURRENTLY PLAYING before loading new file
        if (isActuallyPlaying) {
            console.log("App: Pausing existing playback before loading new file.");
            // Important: Don't just toggle, explicitly pause
            AudioApp.audioEngine.togglePlayPause(); // Ask engine to pause
            stopUIUpdateLoop();
            isActuallyPlaying = false; // Assume pause takes effect quickly enough
            playbackStartTimeContext = null;
            // Update UI to paused state immediately
            AudioApp.uiManager.setPlayButtonState(false);
        }

        // Reset state for the specific target track
        _resetTrackState(targetTrackIndex);

        // Update overall state
        files[targetTrackIndex] = file;
        activeTracks = files.filter(f => f !== null).length; // Recalculate active tracks
        playbackStartSourceTime = 0.0; // Reset shared start time on any load

        // Reset UI only if loading into track 0
        if (targetTrackIndex === 0) {
            AudioApp.uiManager.resetUI();
            AudioApp.waveformVisualizer.clearVisuals();
            AudioApp.spectrogramVisualizer.clearVisuals();
            AudioApp.spectrogramVisualizer.showSpinner(true);
        }

        // Update file info to indicate which track is loading
        AudioApp.uiManager.setFileInfo(`Loading Track ${targetTrackIndex}: ${file.name}...`);

        try {
            await AudioApp.audioEngine.loadAndProcessTrack(file, targetTrackIndex);
            // Toggle the index for the *next* load
            nextTrackIndexToLoad = 1 - targetTrackIndex;
            console.log(`App: Next file will load into track ${nextTrackIndexToLoad}`);
        }
        catch (error) {
            console.error("App: Error initiating file processing -", error);
            AudioApp.uiManager.setFileInfo(`Error loading Track ${targetTrackIndex}: ${error.message}`);
            if (targetTrackIndex === 0) AudioApp.uiManager.resetUI(); // Reset UI only if track 0 failed
            if (targetTrackIndex === 0) AudioApp.spectrogramVisualizer.showSpinner(false);
            stopUIUpdateLoop();
            _clearTrackStateOnError(targetTrackIndex, 'load');
            // Do not toggle nextTrackIndexToLoad on error, retry same slot next time.
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
            AudioApp.uiManager.updateTimeDisplay(0, audioBuffer.duration);
            AudioApp.uiManager.updateSeekBar(0);
            playbackStartSourceTime = 0.0;

            console.log("App: Drawing initial waveform (Track 0)...");
            await AudioApp.waveformVisualizer.computeAndDrawWaveform(audioBuffer, []);

            console.log("App: Starting spectrogram computation/drawing (Track 0)...");
            await AudioApp.spectrogramVisualizer.computeAndDrawSpectrogram(audioBuffer);

            console.log("App: Initial visuals initiated (Track 0).");
            AudioApp.uiManager.setFileInfo(`Processing VAD (Track 0): ${files[trackIndex]?.name || 'Unknown File'}`);

            console.log("App: Starting background VAD processing (Track 0)...");
            runVadInBackground(audioBuffer, trackIndex);
        } else {
            console.log(`App: Track ${trackIndex} buffer stored. Triggering VAD processing (no UI update)...`);
            runVadInBackground(audioBuffer, trackIndex);
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

        _checkAndEnablePlaybackControls(); // Check if ALL active tracks are now ready

        const allActiveReady = _areAllActiveTracksReady();
        if(allActiveReady && activeTracks > 0) {
             const fileNames = files.map(f => f?.name).filter(Boolean).join(' & ');
             AudioApp.uiManager.setFileInfo(`Ready: ${fileNames}`);
             if (files[0]) { // If track 0 exists and all are ready, hide spinner
                 AudioApp.spectrogramVisualizer.showSpinner(false);
             }
        } else if (activeTracks > 0) {
            const readyCount = workletReadyStates.filter((ready, i) => files[i] !== null && ready).length;
            const fileNames = files.map(f => f?.name).filter(Boolean).join(' & ');
             AudioApp.uiManager.setFileInfo(`Loading: ${fileNames} (${readyCount}/${activeTracks} tracks ready)`);
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

            // Show VAD Progress UI only for Track 0
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
                     AudioApp.uiManager.showVadProgress(false); // Hide bar if no data
                 }
                 vadProcessingStates[trackIndex] = false; return;
            }

            console.log(`App (VAD Task ${trackIndex}): Starting VAD analysis...`);
            const vadProgressCallback = (progress) => {
                 // Update UI progress only for Track 0
                 if (trackIndex === 0 && AudioApp.uiManager) {
                     if (progress.totalFrames > 0) { const percentage = (progress.processedFrames / progress.totalFrames) * 100; AudioApp.uiManager.updateVadProgress(percentage); }
                     else { AudioApp.uiManager.updateVadProgress(0); }
                 }
            };
            const analysisOptions = { onProgress: vadProgressCallback };
            const result = await AudioApp.vadAnalyzer.analyze(pcm16k, analysisOptions);
            vadResults[trackIndex] = result; // Store result in the correct slot

            console.log(`App (VAD Task ${trackIndex}): VAD analysis complete. Found ${result.regions?.length || 0} regions.`);
            vadSucceeded = true;

            // Update UI only for Track 0
            if (trackIndex === 0) {
                 const speechRegions = result.regions || [];
                 AudioApp.uiManager.updateVadDisplay(result.initialPositiveThreshold, result.initialNegativeThreshold);
                 AudioApp.uiManager.setSpeechRegionsText(speechRegions);
                 AudioApp.uiManager.enableVadControls(true);
                 AudioApp.waveformVisualizer.redrawWaveformHighlight(audioBuffer, speechRegions);
                 AudioApp.uiManager.updateVadProgress(100); // Ensure 100%
                 setTimeout(() => AudioApp.uiManager.showVadProgress(false), 500); // Hide after short delay
            }

        } catch (error) {
            console.error(`App (VAD Task ${trackIndex}): Error during background VAD processing -`, error);
            if (trackIndex === 0) { // Only update UI for track 0
                 const errorType = error.message.includes("resampling") ? "Resampling Error" : error.message.includes("VAD") ? "VAD Error" : "Processing Error";
                 AudioApp.uiManager.setSpeechRegionsText(`${errorType}: ${error.message}`);
                 AudioApp.uiManager.enableVadControls(false);
                 AudioApp.uiManager.updateVadProgress(0);
                 AudioApp.uiManager.showVadProgress(false); // Hide on error
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

        if (trackIndex !== undefined) {
            _clearTrackStateOnError(trackIndex, errorType);
            // If track 0 failed, update UI to reflect its error
            if (trackIndex === 0) {
                 AudioApp.uiManager.setFileInfo(`Error (Track 0, ${errorType}): ${errorMessage.substring(0, 100)}`);
            } else {
                 // Update file info to show track 1 failed, keeping track 0 info if present
                 const track0Name = files[0]?.name;
                 const baseInfo = track0Name ? `Track 0: ${track0Name}` : "Error";
                 AudioApp.uiManager.setFileInfo(`${baseInfo} | Error (Track 1, ${errorType}): ${errorMessage.substring(0, 60)}`);
            }
        } else {
            console.warn("App: Audio error with unknown track index, performing full reset.");
            _resetAppState();
            AudioApp.uiManager.resetUI();
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
            AudioApp.uiManager.setFileInfo(`Error (${errorType}): ${errorMessage.substring(0, 100)}`);
        }

        // Disable controls if no tracks are ready
        _checkAndEnablePlaybackControls();
        stopUIUpdateLoop();
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
         trackMutedStates[trackIndex] = false; // Reset mute state
         activeTracks = files.filter(f => f !== null).length; // Recalculate

         // If track 0 fails, clear its visuals and reset main UI elements
         if (trackIndex === 0) {
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
            AudioApp.uiManager.resetUI(); // Reset sliders, time display etc.
         }
         // If track 1 fails, we don't clear track 0's visuals
    }


    /** @private */
    function handlePlayPause() {
        if (!_areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Not all active tracks ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: Cannot play/pause, AudioContext not available."); return; }

        if (isActuallyPlaying) {
            // Store estimated time BEFORE pausing
            const finalEstimatedTime = calculateEstimatedSourceTime();
            console.log(`App: Pausing requested. Storing estimated shared time: ${finalEstimatedTime.toFixed(3)}.`);
            // We no longer seek on pause, just update the base time
            playbackStartSourceTime = finalEstimatedTime;
            playbackStartTimeContext = null;
            stopUIUpdateLoop();
            updateUIWithTime(finalEstimatedTime);
        }
        // Always tell engine to toggle internal state
        AudioApp.audioEngine.togglePlayPause();
        // Actual state update and UI loop start happens in handlePlaybackStateChange
    }

    /** @param {CustomEvent<{seconds: number}>} e @private */
    function handleJump(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        // Store whether we were playing before the jump
        const wasPlaying = isActuallyPlaying;
        let pausedForSeek = false;

        // **Pause before seeking**
        if (wasPlaying) {
            console.log("App: Pausing before jump...");
            AudioApp.audioEngine.togglePlayPause(); // Send pause command
            stopUIUpdateLoop();
            isActuallyPlaying = false; // Assume pause happens quickly
            playbackStartTimeContext = null;
            AudioApp.uiManager.setPlayButtonState(false); // Update UI to show paused
            pausedForSeek = true;
        }

        // Calculate target time
        const currentTime = calculateEstimatedSourceTime(); // Get current time *after* potential pause update
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = Math.max(0, Math.min(currentTime + e.detail.seconds, duration));

        console.log(`App: Jumping to ${targetSharedTime.toFixed(3)}s`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine seeks all active tracks

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        updateUIWithTime(targetSharedTime); // Update UI immediately

        // **Do NOT auto-resume playback.** User must press Play again.
        // if (pausedForSeek) {
        //     console.log("App: Resuming playback after jump...");
        //     AudioApp.audioEngine.togglePlayPause(); // Send play command
        // }
    }

    /** @param {CustomEvent<{fraction: number}>} e @private */
    function handleSeek(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        const wasPlaying = isActuallyPlaying;
        let pausedForSeek = false;

        // **Pause before seeking**
        if (wasPlaying) {
            console.log("App: Pausing before seek...");
            AudioApp.audioEngine.togglePlayPause();
            stopUIUpdateLoop();
            isActuallyPlaying = false;
            playbackStartTimeContext = null;
            AudioApp.uiManager.setPlayButtonState(false);
            pausedForSeek = true;
        }

        // Calculate target time
        const duration = audioBuffers[0] ? audioBuffers[0].duration : 0;
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = e.detail.fraction * duration;

        console.log(`App: Seeking to ${targetSharedTime.toFixed(3)}s (fraction: ${e.detail.fraction.toFixed(3)})`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine seeks all active tracks

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        updateUIWithTime(targetSharedTime); // Update UI immediately

        // **Do NOT auto-resume playback.**
        // if (pausedForSeek) {
        //     console.log("App: Resuming playback after seek...");
        //     AudioApp.audioEngine.togglePlayPause();
        // }
    }
    const handleSeekBarInput = handleSeek; // Alias remains the same

    /** @param {CustomEvent<{speed: number}>} e @private */
    function handleSpeedChange(e) {
        if (!_areAllActiveTracksReady()) return;
        AudioApp.audioEngine.setSpeed(e.detail.speed);
        debouncedSyncEngine();
    }

    /** @param {CustomEvent<{pitch: number}>} e @private */
    function handlePitchChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setPitch(e.detail.pitch); }
    /** @param {CustomEvent<{gain: number}>} e @private */
    function handleGainChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setGain(e.detail.gain); }

    /** @private */
    function syncEngineToEstimatedTime() {
        // No need to pause here as speed changes don't seem to cause the crash directly
        if (!_areAllActiveTracksReady() || activeTracks === 0) { console.log("App (Debounced Sync): Skipping sync - not ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        const targetSharedTime = calculateEstimatedSourceTime();
        console.log(`App: Debounced sync executing. Seeking engine to estimated shared time: ${targetSharedTime.toFixed(3)}.`);
        AudioApp.audioEngine.seek(targetSharedTime);

        playbackStartSourceTime = targetSharedTime;
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }

    /**
     * Handles the internal speed change potentially reported by the engine.
     * Updates the main thread's time tracking base.
     * @param {CustomEvent<{speed: number, trackIndex: number}>} e @private
     */
    function handleInternalSpeedChange(e) {
        const { speed: newSpeed, trackIndex } = e.detail;
        if (newSpeed === currentSpeedForUpdate || files[trackIndex] === null) return;

        console.log(`App: Internal speed updated by engine (Track ${trackIndex}) to ${newSpeed.toFixed(2)}x. Updating shared speed estimate.`);

        const oldSpeed = currentSpeedForUpdate;
        currentSpeedForUpdate = newSpeed; // Update shared speed used for UI calculation

        const audioCtx = AudioApp.audioEngine.getAudioContext();
        if (isActuallyPlaying && playbackStartTimeContext !== null && audioCtx) {
            const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
            const elapsedSourceTime = elapsedContextTime * oldSpeed;
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
        const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value);

        // Update UI for track 0
        AudioApp.uiManager.setSpeechRegionsText(newRegions);
        if(audioBuffers[trackIndex]) {
             AudioApp.waveformVisualizer.redrawWaveformHighlight(audioBuffers[trackIndex], newRegions);
        }
    }

    /**
     * Handles playback ended signal from a specific track's worklet.
     * Updates the ended state for that track. Stops UI loop only if ALL active tracks ended.
     * @param {CustomEvent<{trackIndex: number}>} e @private
     */
    function handlePlaybackEnded(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackEndedStates[trackIndex]) return;

        console.log(`App: Playback ended event received for track ${trackIndex}.`);
        trackEndedStates[trackIndex] = true;

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
             const duration = audioBuffers[0]?.duration || 0; // Use track 0 duration for UI
             playbackStartSourceTime = duration;
             updateUIWithTime(duration);
             AudioApp.uiManager.setPlayButtonState(false);
        } else {
            console.log(`App: Track ${trackIndex} ended, but other active tracks continue.`);
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

        // console.log(`App: Playback state confirmed by worklet (Track ${trackIndex}): ${workletIsPlaying}`); // Keep console cleaner

        // Determine overall state based on whether *any* active, non-ended track reports playing
        let shouldBePlayingOverall = false;
        for(let i=0; i<files.length; i++) {
            if (files[i] !== null && !trackEndedStates[i]) {
                 // How to know the state of track 'i'? Assume if the *event source* is playing, we are playing.
                 // If the event source stopped, only stop overall if no *other* track is assumed playing.
                 if (i === trackIndex && workletIsPlaying) {
                      shouldBePlayingOverall = true; break;
                 }
                 // If we receive a 'stopped' event from trackIndex, we need to know if *any other* track
                 // might still be playing. This logic is tricky without storing each track's last known state.
                 // Let's stick to: if the latest event source is playing, overall is playing.
                 // If latest event source stopped, check if any *other* non-ended track exists.
                 if (workletIsPlaying) {
                     shouldBePlayingOverall = true; break;
                 } else {
                     // This track stopped. Check others.
                     let otherPotentiallyPlaying = false;
                     for (let j=0; j<files.length; j++) {
                          if (j !== trackIndex && files[j] !== null && !trackEndedStates[j]) {
                              otherPotentiallyPlaying = true; break;
                          }
                     }
                     shouldBePlayingOverall = otherPotentiallyPlaying;
                 }
            }
        }

        // Update state and UI loop based on the determined overall state
        if (shouldBePlayingOverall && !isActuallyPlaying) {
            // Transitioning to Playing
            isActuallyPlaying = true;
            AudioApp.uiManager.setPlayButtonState(true);
            const audioCtx = AudioApp.audioEngine?.getAudioContext();
            if (audioCtx) {
                 playbackStartSourceTime = calculateEstimatedSourceTime(); // Get current estimate before starting
                 playbackStartTimeContext = audioCtx.currentTime; // Mark context time NOW
                 // console.log(`App: Playback confirmed started/resumed. Setting shared time base: src=${playbackStartSourceTime.toFixed(3)}, ctx=${playbackStartTimeContext.toFixed(3)}`);
                 updateUIWithTime(playbackStartSourceTime); // Ensure UI reflects start
                 startUIUpdateLoop();
            }
        } else if (!shouldBePlayingOverall && isActuallyPlaying) {
            // Transitioning to Paused/Stopped
            isActuallyPlaying = false;
            AudioApp.uiManager.setPlayButtonState(false);
            stopUIUpdateLoop();
            playbackStartTimeContext = null;
            // console.log(`App: Playback confirmed stopped/paused. Base source time: ${playbackStartSourceTime.toFixed(3)}`);
            updateUIWithTime(calculateEstimatedSourceTime()); // Update UI to final estimated time
        }
    }


    /** @param {CustomEvent<{key: string}>} e @private */
    function handleKeyPress(e) {
        // Only allow controls if *all* active tracks are ready
        if (!_areAllActiveTracksReady()) return;

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
            case 'Digit1': // Key '1'
                console.log("App: Key '1' pressed. Toggling mute for Track 0."); // Log press
                trackMutedStates[0] = !trackMutedStates[0];
                AudioApp.audioEngine.setTrackMuted(0, trackMutedStates[0]);
                break;
            case 'Digit2': // Key '2'
                console.log("App: Key '2' pressed. Toggling mute for Track 1."); // Log press
                trackMutedStates[1] = !trackMutedStates[1];
                AudioApp.audioEngine.setTrackMuted(1, trackMutedStates[1]);
                break;
        }
    }

    /** @private */
    function handleWindowResize() {
        // Resize visuals for track 0 for now
        const trackIndex = 0;
        const regions = vadResults[trackIndex] ? (vadResults[trackIndex].regions || []) : [];
        AudioApp.waveformVisualizer?.resizeAndRedraw(audioBuffers[trackIndex], regions);
        AudioApp.spectrogramVisualizer?.resizeAndRedraw(audioBuffers[trackIndex]);

        // Update progress indicator on resize (app.js is responsible)
        updateUIWithTime(calculateEstimatedSourceTime());
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
     * Uses duration of Track 0 for clamping.
     * @private
     * @returns {number} The estimated current time in seconds on the shared timeline.
     */
    function calculateEstimatedSourceTime() {
        const audioCtx = AudioApp.audioEngine?.getAudioContext();
        const duration = audioBuffers[0]?.duration || 0;

        if (!isActuallyPlaying || playbackStartTimeContext === null || !audioCtx || activeTracks === 0 || duration <= 0) {
            return playbackStartSourceTime;
        }
        if (currentSpeedForUpdate <= 0) { return playbackStartSourceTime; }

        const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
        const elapsedSourceTime = elapsedContextTime * currentSpeedForUpdate;
        let estimatedCurrentSourceTime = playbackStartSourceTime + elapsedSourceTime;

        estimatedCurrentSourceTime = Math.max(0, Math.min(estimatedCurrentSourceTime, duration));
        return estimatedCurrentSourceTime;
    }

    /**
     * Updates the shared time display, seek bar, and track 0 visualization progress.
     * @param {number} sharedTime - The current shared source time to display.
     * @private
     */
    function updateUIWithTime(sharedTime) {
        const duration = audioBuffers[0]?.duration || 0;
        if (isNaN(duration)) return;

        const clampedSharedTime = Math.max(0, Math.min(sharedTime, duration));
        const fraction = duration > 0 ? clampedSharedTime / duration : 0;

        AudioApp.uiManager.updateTimeDisplay(clampedSharedTime, duration);
        AudioApp.uiManager.updateSeekBar(fraction);

        if (audioBuffers[0]) {
            AudioApp.waveformVisualizer?.updateProgressIndicator(clampedSharedTime, duration);
            AudioApp.spectrogramVisualizer?.updateProgressIndicator(clampedSharedTime, duration);
        } else {
             AudioApp.waveformVisualizer?.updateProgressIndicator(0, 1);
             AudioApp.spectrogramVisualizer?.updateProgressIndicator(0, 1);
        }
    }


    /**
     * The main UI update loop function, called via requestAnimationFrame.
     * Uses main thread calculation (AudioContext time) for shared time estimation.
     * @param {DOMHighResTimeStamp} timestamp - The timestamp provided by rAF.
     * @private
     */
    function updateUIBasedOnContextTime(timestamp) {
        if (!isActuallyPlaying) { rAFUpdateHandle = null; return; }

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
         trackMutedStates[trackIndex] = false; // Reset mute state
         // FIX: Check if engine and function exist before calling
         if (AudioApp.audioEngine?.setTrackMuted) {
             try {
                 AudioApp.audioEngine.setTrackMuted(trackIndex, false);
             } catch(e) {
                  console.warn(`App: Error setting unmute on reset for track ${trackIndex}:`, e);
             }
         }
    }

    /** @private */
    function _areAllActiveTracksReady() {
        if (activeTracks === 0) return false;
        for (let i = 0; i < workletReadyStates.length; i++) {
            if (files[i] !== null && !workletReadyStates[i]) {
                 return false;
            }
        }
        return true;
    }

     /** @private */
     function _checkAndEnablePlaybackControls() {
         const allReady = _areAllActiveTracksReady();
         // console.log(`App: Checking controls. Active tracks: ${activeTracks}, All active ready: ${allReady}`); // Less verbose
         AudioApp.uiManager.enablePlaybackControls(allReady);
         AudioApp.uiManager.enableSeekBar(allReady);
     }

    // --- Public Interface ---
    return {
        init: init
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
