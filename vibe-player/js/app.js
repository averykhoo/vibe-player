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
    // --- Single Worklet State --- // MODIFIED
    /** @type {boolean} Flag indicating if the AudioWorklet processor script/WASM is ready. */
    let workletProcessorReady = false; // Renamed from workletReadyStates
    /** @type {Array<boolean>} Flags indicating if a specific track has loaded its data into the worklet. */
    let workletTrackLoaded = [false, false]; // Tracks readiness *within* the single worklet
    // --- End Single Worklet State ---
    /** @type {Array<boolean>} Flags indicating if background VAD is running for a track. */
    let vadProcessingStates = [false, false];
    /** @type {Array<boolean>} Flags indicating if playback for a track has ended (internal worklet flag). */
    let trackEndedStates = [false, false]; // May become less relevant if worklet reports overall state
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
        AudioApp.audioEngine.init(); // Initializes engine, creates context
        AudioApp.waveformVisualizer.init();
        AudioApp.spectrogramVisualizer.init();
        setupAppEventListeners();

        // Reset state completely on init
        _resetAppState();

        console.log("AudioApp: Initialized. Waiting for file...");
    }

    /** @private */
    function _resetAppState() {
        console.log("App: Resetting global state...");
        stopUIUpdateLoop();
        audioBuffers = [null, null];
        vadResults = [null, null];
        files = [null, null];
        workletProcessorReady = false; // Reset single worklet flag
        workletTrackLoaded = [false, false]; // Reset track loaded flags
        vadProcessingStates = [false, false];
        trackEndedStates = [false, false];
        trackMutedStates = [false, false];
        activeTracks = 0;
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        isActuallyPlaying = false;
        currentSpeedForUpdate = 1.0;
        nextTrackIndexToLoad = 0;

        // Reset UI elements
        AudioApp.uiManager?.resetUI();
        AudioApp.waveformVisualizer?.clearVisuals();
        AudioApp.spectrogramVisualizer?.clearVisuals();

        // Reset engine (this also attempts to clean up any existing worklet)
        AudioApp.audioEngine?.cleanup();
        AudioApp.audioEngine?.init(); // Re-initialize engine to ensure clean context/gain node

        // Now that engine is re-initialized, ensure tracks are unmuted
        // (setTrackMuted will correctly do nothing if nodes don't exist yet)
        AudioApp.audioEngine?.setTrackMuted(0, false);
        AudioApp.audioEngine?.setTrackMuted(1, false);
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
        // AudioEngine -> App
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady); // Fired when worklet script/WASM ready
        document.addEventListener('audioapp:trackLoadComplete', handleTrackLoadComplete); // NEW: Fired when worklet confirms track data processed
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError);
        document.addEventListener('audioapp:playbackError', handleAudioError);
        document.addEventListener('audioapp:engineError', handleAudioError);
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded); // Worklet reports overall end
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange); // Worklet reports overall state
        document.addEventListener('audioapp:internalSpeedChanged', handleInternalSpeedChange); // May be obsolete
        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Event Handler Functions ---

    /** @param {CustomEvent<{file: File}>} e @private */
    async function handleFileSelected(e) {
        const file = e.detail.file; if (!file) return;

        const targetTrackIndex = nextTrackIndexToLoad;
        console.log(`App: File selected - ${file.name} (loading into track ${targetTrackIndex})`);

        // Stop existing playback IF IT IS CURRENTLY PLAYING before loading new file
        if (isActuallyPlaying) {
            console.log("App: Pausing existing playback before loading new file.");
            AudioApp.audioEngine.togglePlayPause();
            stopUIUpdateLoop();
            isActuallyPlaying = false;
            playbackStartTimeContext = null;
            AudioApp.uiManager.setPlayButtonState(false);
        }

        // Reset state for the specific target track
        _resetTrackState(targetTrackIndex);

        // Update overall state
        files[targetTrackIndex] = file;
        activeTracks = files.filter(f => f !== null).length;
        playbackStartSourceTime = 0.0;

        // Reset UI only if loading into track 0
        if (targetTrackIndex === 0) {
            AudioApp.uiManager.resetUI();
            AudioApp.waveformVisualizer.clearVisuals();
            AudioApp.spectrogramVisualizer.clearVisuals();
            AudioApp.spectrogramVisualizer.showSpinner(true);
        }

        AudioApp.uiManager.setFileInfo(`Loading Track ${targetTrackIndex}: ${file.name}...`);

        try {
            // AudioEngine now handles creating the *single* worklet if needed
            await AudioApp.audioEngine.loadAndProcessTrack(file, targetTrackIndex);
            nextTrackIndexToLoad = 1 - targetTrackIndex;
            console.log(`App: Next file will load into track ${nextTrackIndexToLoad}`);
        }
        catch (error) {
            console.error("App: Error initiating file processing -", error);
            AudioApp.uiManager.setFileInfo(`Error loading Track ${targetTrackIndex}: ${error.message}`);
            if (targetTrackIndex === 0) {
                AudioApp.uiManager.resetUI();
                AudioApp.spectrogramVisualizer.showSpinner(false);
            }
            stopUIUpdateLoop();
            _clearTrackStateOnError(targetTrackIndex, 'load');
        }
    }

    /**
     * Handles audio decoding completion for a specific track.
     * Stores buffer, triggers visuals/VAD for that track.
     * NOTE: Audio data is sent to engine/worklet in `handleFileSelected`.
     * @param {CustomEvent<{audioBuffer: AudioBuffer, trackIndex: number}>} e @private
     */
    async function handleAudioLoaded(e) {
        const { audioBuffer, trackIndex } = e.detail;
        if (audioBuffer === null || trackIndex === undefined) return;

        console.log(`App: Audio decoded for track ${trackIndex} (${audioBuffer.duration.toFixed(2)}s)`);
        audioBuffers[trackIndex] = audioBuffer;

        // Update UI/Visuals only for Track 0
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
        }

        // Trigger background VAD processing for the track
        console.log(`App: Starting background VAD processing (Track ${trackIndex})...`);
        runVadInBackground(audioBuffer, trackIndex);

        // Note: We now wait for 'trackLoadComplete' from the worklet via audioEngine
        // before considering a track truly ready for playback enable check.
    }

    /**
     * Handles the signal that the single AudioWorkletProcessor script/WASM is loaded and ready.
     * @param {CustomEvent} e @private
     */
    function handleWorkletReady(e) {
        console.log(`App: AudioWorklet processor script/WASM is ready.`);
        workletProcessorReady = true;
        // Don't enable controls yet, wait for tracks to load *into* the worklet
        _checkAndEnablePlaybackControls();
    }

    /**
     * Handles the signal that a specific track's data has been loaded and initialized
     * within the single AudioWorkletProcessor.
     * @param {CustomEvent<{trackIndex: number}>} e @private
     */
     function handleTrackLoadComplete(e) {
         const { trackIndex } = e.detail;
         if (trackIndex === undefined) return;
         console.log(`App: Track ${trackIndex} data loaded into worklet processor.`);
         workletTrackLoaded[trackIndex] = true;
         _checkAndEnablePlaybackControls(); // Check if all active tracks are loaded
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
                     AudioApp.uiManager.showVadProgress(false);
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
            vadResults[trackIndex] = result;

            console.log(`App (VAD Task ${trackIndex}): VAD analysis complete. Found ${result.regions?.length || 0} regions.`);
            vadSucceeded = true;

            // Update UI only for Track 0
            if (trackIndex === 0) {
                 const speechRegions = result.regions || [];
                 AudioApp.uiManager.updateVadDisplay(result.initialPositiveThreshold, result.initialNegativeThreshold);
                 AudioApp.uiManager.setSpeechRegionsText(speechRegions);
                 AudioApp.uiManager.enableVadControls(true);
                 AudioApp.waveformVisualizer.redrawWaveformHighlight(audioBuffer, speechRegions);
                 AudioApp.uiManager.updateVadProgress(100);
                 setTimeout(() => AudioApp.uiManager.showVadProgress(false), 500);
            }

        } catch (error) {
            console.error(`App (VAD Task ${trackIndex}): Error during background VAD processing -`, error);
            if (trackIndex === 0) { // Only update UI for track 0
                 const errorType = error.message.includes("resampling") ? "Resampling Error" : error.message.includes("VAD") ? "VAD Error" : "Processing Error";
                 AudioApp.uiManager.setSpeechRegionsText(`${errorType}: ${error.message}`);
                 AudioApp.uiManager.enableVadControls(false);
                 AudioApp.uiManager.updateVadProgress(0);
                 AudioApp.uiManager.showVadProgress(false);
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
        // Track index might be associated even with engine errors now if traceable
        const trackIndex = e.detail.trackIndex;

        console.error(`App: Audio Error - Type: ${errorType}, Track: ${trackIndex ?? 'N/A'}, Message: ${errorMessage}`, e.detail.error);

        if (trackIndex !== undefined) {
            _clearTrackStateOnError(trackIndex, errorType);
            if (trackIndex === 0) {
                 AudioApp.uiManager.setFileInfo(`Error (Track 0, ${errorType}): ${errorMessage.substring(0, 100)}`);
            } else {
                 const track0Name = files[0]?.name;
                 const baseInfo = track0Name ? `Track 0: ${track0Name}` : "Error";
                 AudioApp.uiManager.setFileInfo(`${baseInfo} | Error (Track 1, ${errorType}): ${errorMessage.substring(0, 60)}`);
            }
        } else {
            // General engine error or early load error without track context
            console.warn("App: General audio error or unknown track index, performing full reset.");
            _resetAppState(); // Full reset might be needed
            AudioApp.uiManager.setFileInfo(`Error (${errorType}): ${errorMessage.substring(0, 100)}`);
        }

        _checkAndEnablePlaybackControls();
        stopUIUpdateLoop();
    }

    /** Helper to clear state for a specific track on error */
    function _clearTrackStateOnError(trackIndex, errorType) {
         console.log(`App: Clearing state for track ${trackIndex} due to error (${errorType}).`);
         audioBuffers[trackIndex] = null;
         files[trackIndex] = null;
         vadResults[trackIndex] = null;
         workletTrackLoaded[trackIndex] = false; // Mark track as not loaded in worklet
         vadProcessingStates[trackIndex] = false;
         trackEndedStates[trackIndex] = false;
         trackMutedStates[trackIndex] = false;
         activeTracks = files.filter(f => f !== null).length;

         // If track 0 fails, clear its visuals and reset main UI elements
         if (trackIndex === 0) {
            AudioApp.waveformVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.clearVisuals();
            AudioApp.spectrogramVisualizer?.showSpinner(false);
            AudioApp.uiManager.resetUI();
         }
    }


    /** @private */
    function handlePlayPause() {
        // Check if worklet script/WASM itself is ready AND if all *active* tracks are loaded into it
        if (!_areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Not all active tracks ready in worklet."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: Cannot play/pause, AudioContext not available."); return; }

        if (isActuallyPlaying) {
            const finalEstimatedTime = calculateEstimatedSourceTime();
            console.log(`App: Pausing requested. Storing estimated shared time: ${finalEstimatedTime.toFixed(3)}.`);
            playbackStartSourceTime = finalEstimatedTime;
            playbackStartTimeContext = null;
            stopUIUpdateLoop();
            updateUIWithTime(finalEstimatedTime);
        }
        // Always tell engine to toggle internal state
        AudioApp.audioEngine.togglePlayPause();
        // State/UI update happens in handlePlaybackStateChange
    }

    /** @param {CustomEvent<{seconds: number}>} e @private */
    function handleJump(e) {
        // Check readiness before allowing jump
        if (!_areAllActiveTracksReady()) { console.warn("App: Jump ignored - Not all active tracks ready in worklet."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        const wasPlaying = isActuallyPlaying;
        let pausedForSeek = false;

        // **Pause before seeking**
        if (wasPlaying) {
            console.log("App: Pausing before jump...");
            AudioApp.audioEngine.togglePlayPause();
            stopUIUpdateLoop();
            isActuallyPlaying = false;
            playbackStartTimeContext = null;
            AudioApp.uiManager.setPlayButtonState(false);
            pausedForSeek = true;
        }

        // Calculate target time
        const currentTime = calculateEstimatedSourceTime();
        const duration = audioBuffers[0]?.duration || 0;
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = Math.max(0, Math.min(currentTime + e.detail.seconds, duration));

        console.log(`App: Jumping to ${targetSharedTime.toFixed(3)}s`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine sends seek command

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        updateUIWithTime(targetSharedTime);

        // **Do NOT auto-resume playback.**
    }

    /** @param {CustomEvent<{fraction: number}>} e @private */
    function handleSeek(e) {
        // Check readiness before allowing seek
        if (!_areAllActiveTracksReady()) { console.warn("App: Seek ignored - Not all active tracks ready in worklet."); return; }
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
        const duration = audioBuffers[0]?.duration || 0;
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = e.detail.fraction * duration;

        console.log(`App: Seeking to ${targetSharedTime.toFixed(3)}s (fraction: ${e.detail.fraction.toFixed(3)})`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine sends seek command

        // Update main thread time tracking immediately
        playbackStartSourceTime = targetSharedTime;
        updateUIWithTime(targetSharedTime);

        // **Do NOT auto-resume playback.**
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
        if (!_areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - not ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;

        const targetSharedTime = calculateEstimatedSourceTime();
        console.log(`App: Debounced sync executing. Seeking engine to estimated shared time: ${targetSharedTime.toFixed(3)}.`);
        AudioApp.audioEngine.seek(targetSharedTime); // Engine sends seek command

        playbackStartSourceTime = targetSharedTime;
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }

    /**
     * Handles the internal speed change potentially reported by the engine.
     * Updates the main thread's time tracking base.
     * @param {CustomEvent<{speed: number, trackIndex?: number}>} e @private // trackIndex may be irrelevant now
     */
    function handleInternalSpeedChange(e) {
        // This might be less relevant if worklet doesn't report per-track speed changes
        const { speed: newSpeed } = e.detail;
        if (newSpeed === currentSpeedForUpdate) return;

        console.log(`App: Internal speed updated by engine to ${newSpeed.toFixed(2)}x. Updating shared speed estimate.`);

        const oldSpeed = currentSpeedForUpdate;
        currentSpeedForUpdate = newSpeed;

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
     * Handles playback ended signal from the single worklet (means all tracks finished).
     * @param {CustomEvent} e @private
     */
    function handlePlaybackEnded(e) {
        console.log("App: Playback ended event received (all tracks finished).");
        isActuallyPlaying = false;
        stopUIUpdateLoop();
        playbackStartTimeContext = null;
        const duration = audioBuffers[0]?.duration || 0; // Use track 0 duration for UI
        playbackStartSourceTime = duration;
        updateUIWithTime(duration);
        AudioApp.uiManager.setPlayButtonState(false);
        // Reset internal ended flags (may not be needed)
        trackEndedStates = [false, false];
    }

    /**
     * Handles playback state confirmation from the single worklet.
     * @param {CustomEvent<{isPlaying: boolean}>} e @private // Now receives overall state
     */
     function handlePlaybackStateChange(e) {
        const shouldBePlayingOverall = e.detail.isPlaying;
        // console.log(`App: Playback state confirmed by worklet: ${shouldBePlayingOverall}`);

        // Update state and UI loop based on the overall state
        if (shouldBePlayingOverall && !isActuallyPlaying) {
            // Transitioning to Playing
            isActuallyPlaying = true;
            AudioApp.uiManager.setPlayButtonState(true);
            const audioCtx = AudioApp.audioEngine?.getAudioContext();
            if (audioCtx) {
                 playbackStartSourceTime = calculateEstimatedSourceTime();
                 playbackStartTimeContext = audioCtx.currentTime;
                 // console.log(`App: Playback confirmed started/resumed. Base: src=${playbackStartSourceTime.toFixed(3)}, ctx=${playbackStartTimeContext.toFixed(3)}`);
                 updateUIWithTime(playbackStartSourceTime);
                 startUIUpdateLoop();
            }
        } else if (!shouldBePlayingOverall && isActuallyPlaying) {
            // Transitioning to Paused/Stopped
            isActuallyPlaying = false;
            AudioApp.uiManager.setPlayButtonState(false);
            stopUIUpdateLoop();
            playbackStartTimeContext = null;
            // console.log(`App: Playback confirmed stopped/paused. Base src time: ${playbackStartSourceTime.toFixed(3)}`);
            updateUIWithTime(calculateEstimatedSourceTime());
        }
    }


    /** @param {CustomEvent<{key: string}>} e @private */
    function handleKeyPress(e) {
        // Check if ready before allowing *any* key controls
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
                console.log("App: Key '1' pressed. Toggling mute for Track 0.");
                trackMutedStates[0] = !trackMutedStates[0];
                AudioApp.audioEngine.setTrackMuted(0, trackMutedStates[0]);
                break;
            case 'Digit2': // Key '2'
                console.log("App: Key '2' pressed. Toggling mute for Track 1.");
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
         // Only reset app-level state here
         audioBuffers[trackIndex] = null;
         files[trackIndex] = null;
         vadResults[trackIndex] = null;
         workletTrackLoaded[trackIndex] = false; // Mark track as unloaded in worklet state
         vadProcessingStates[trackIndex] = false;
         trackEndedStates[trackIndex] = false;
         trackMutedStates[trackIndex] = false;
         // Engine-level unmute happens in _resetAppState or handleFileSelected
         if (AudioApp.audioEngine?.setTrackMuted) {
            try { AudioApp.audioEngine.setTrackMuted(trackIndex, false); }
            catch(e) { console.warn(`App: Error setting unmute on reset for track ${trackIndex}:`, e); }
         }
    }

    /**
     * Checks if the worklet is ready AND all *active* tracks have loaded their data into it.
     * @private
     */
    function _areAllActiveTracksReady() {
        if (!workletProcessorReady || activeTracks === 0) return false; // Need worklet itself ready
        for (let i = 0; i < workletTrackLoaded.length; i++) {
            // If a file exists for this track index, it MUST be loaded in the worklet
            if (files[i] !== null && !workletTrackLoaded[i]) {
                 return false; // Found an active track that isn't loaded in worklet
            }
        }
        return true; // All active tracks are loaded in the worklet
    }

     /** @private */
     function _checkAndEnablePlaybackControls() {
         const allReady = _areAllActiveTracksReady();
         // console.log(`App: Checking controls. Active: ${activeTracks}, WorkletReady: ${workletProcessorReady}, T0 Loaded: ${workletTrackLoaded[0]}, T1 Loaded: ${workletTrackLoaded[1]}. AllReady: ${allReady}`);
         AudioApp.uiManager.enablePlaybackControls(allReady);
         AudioApp.uiManager.enableSeekBar(allReady);

         // Update file info based on readiness
          if (allReady && activeTracks > 0) {
              const fileNames = files.map(f => f?.name).filter(Boolean).join(' & ');
              AudioApp.uiManager.setFileInfo(`Ready: ${fileNames}`);
              if (files[0]) { // If track 0 exists and all are ready, hide spinner
                  AudioApp.spectrogramVisualizer.showSpinner(false);
              }
          } else if (activeTracks > 0) {
             const loadedCount = workletTrackLoaded.filter((loaded, i) => files[i] !== null && loaded).length;
             const fileNames = files.map(f => f?.name).filter(Boolean).join(' & ');
             AudioApp.uiManager.setFileInfo(`Loading: ${fileNames} (${loadedCount}/${activeTracks} tracks processed)`);
          } else {
             // Handles the case after reset or initial load before files selected
             AudioApp.uiManager.setFileInfo("No file selected.");
          }
     }

    // --- Public Interface ---
    return {
        init: init
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
