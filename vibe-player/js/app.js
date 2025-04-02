// --- /vibe-player/js/app.js ---
// Creates the global namespace and orchestrates the application flow.
// Updated to instantiate and manage dual visualizer instances and basic multi-track logic.

/**
 * @namespace AudioApp
 * @description Main application namespace for Vibe Player.
 */
var AudioApp = AudioApp || {};

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
    /** @type {Array<boolean>} */ let trackMuteStates = [false, false];
    /** @type {number} Offset in seconds for track 1 relative to track 0 */ let trackOffsetSeconds = 0.0;

    // Shared Playback State
    /** @type {number} */ let activeTracks = 0;
    /** @type {number|null} */ let playbackStartTimeContext = null;
    /** @type {number} */ let playbackStartSourceTime = 0.0; // Shared time base
    /** @type {boolean} */ let isActuallyPlaying = false;
    /** @type {number|null} */ let rAFUpdateHandle = null;
    /** @type {number} */ let currentSpeedForUpdate = 1.0;

    // Visualizer Instances
    /** @type {Array<object|null>} */ let waveformVisualizers = [null, null];
    /** @type {Array<object|null>} */ let spectrogramVisualizers = [null, null];

    // Debounced Function
    /** @type {Function|null} */ let debouncedSyncEngine = null;
    const SYNC_DEBOUNCE_WAIT_MS = 300;

    // --- Initialization ---
        /** @public */
    function init() {
        console.log("AudioApp: Initializing...");

        // Updated Dependency Check for Factory Functions
        if (!AudioApp.uiManager ||
            !AudioApp.audioEngine ||
            !AudioApp.createWaveformVisualizer || // Check for factory function
            !AudioApp.createSpectrogramVisualizer || // Check for factory function
            !AudioApp.vadAnalyzer ||
            !AudioApp.sileroWrapper ||
            !AudioApp.Constants ||
            !AudioApp.Utils) {
             console.error("AudioApp: CRITICAL - Module dependencies missing! Check script loading order and module definitions.");
             // Attempt to show error even if uiManager might be missing
             try {
                 const fileInfoEl = document.getElementById('fileInfo-track-1');
                 if (fileInfoEl) fileInfoEl.textContent = "Fatal Error: App failed to load. Check console.";
                 else console.error("Could not find fileInfo-track-1 to display error.");
             } catch (e) {
                 console.error("Error trying to display initialization error:", e);
             }
             return; // Stop initialization
        }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);

        // Initialize Modules
        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();

        // Create and Initialize Visualizer Instances using Factory Functions
        try {
             // Factory functions checked above, proceed with creation
             waveformVisualizers[0] = AudioApp.createWaveformVisualizer(0);
             waveformVisualizers[1] = AudioApp.createWaveformVisualizer(1);
             spectrogramVisualizers[0] = AudioApp.createSpectrogramVisualizer(0, window.FFT); // Pass FFT dependency
             spectrogramVisualizers[1] = AudioApp.createSpectrogramVisualizer(1, window.FFT); // Pass FFT dependency

             // Check if factory functions returned null (indicating internal init failure)
             if (!waveformVisualizers[0] || !waveformVisualizers[1] || !spectrogramVisualizers[0] || !spectrogramVisualizers[1]) {
                  throw new Error("One or more visualizer factory functions returned null.");
             }

        } catch (error) {
             console.error("AudioApp: Failed to initialize visualizers:", error);
              AudioApp.uiManager.setFileInfo("Init Error: Visualizers failed.", 0);
             // Clear potentially half-created instances
             waveformVisualizers = [null, null]; spectrogramVisualizers = [null, null];
             // Depending on the error, may want to stop further app init
        }

        setupAppEventListeners();
        _resetAppState(); // Resets state variables
        AudioApp.uiManager.setUILayoutState(0); // Set initial UI state

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
        trackMuteStates = [false, false];
        trackOffsetSeconds = 0.0;
        activeTracks = 0;
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        isActuallyPlaying = false;
        currentSpeedForUpdate = 1.0;
        waveformVisualizers.forEach(vis => vis?.clearVisuals());
        spectrogramVisualizers.forEach(vis => vis?.clearVisuals());
    }


    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() {
        // UI -> App
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrackClicked);
        document.addEventListener('audioapp:muteTrackClicked', handleMuteTrackClicked);
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracksClicked);
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
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError);
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

    /** @param {CustomEvent<{file: File, trackIndex: number}>} e @private */
    async function handleFileSelected(e) {
        const { file, trackIndex } = e.detail;
        if (!file || trackIndex === undefined || (trackIndex !== 0 && trackIndex !== 1)) return;

        console.log(`App: File selected - ${file.name} (loading into track ${trackIndex})`);
        const wasTrackActive = files[trackIndex] !== null;
        _resetTrackState(trackIndex); // Reset specific track state FIRST

        // Stop playback if currently playing
        if (isActuallyPlaying) {
             AudioApp.audioEngine.togglePlayPause();
             stopUIUpdateLoop();
             isActuallyPlaying = false;
             playbackStartTimeContext = null;
        }
        // Reset shared time base if loading track 0 OR if it was the only active track
        if (trackIndex === 0 || (activeTracks === 1 && wasTrackActive)) {
             playbackStartSourceTime = 0.0;
        }

        files[trackIndex] = file;
        activeTracks = files.filter(f => f !== null).length; // Recalculate count

        AudioApp.uiManager.updateFileName(file.name, trackIndex);
        AudioApp.uiManager.setFileInfo(`Loading Track ${trackIndex}...`, trackIndex);
        AudioApp.uiManager.setUILayoutState(activeTracks); // Update layout

        // Clear visuals for the specific track being loaded
        waveformVisualizers[trackIndex]?.clearVisuals();
        spectrogramVisualizers[trackIndex]?.clearVisuals();
        spectrogramVisualizers[trackIndex]?.showSpinner(true);

        // Reset VAD UI for the track (only track 0 has VAD UI currently)
        if (trackIndex === 0) {
             AudioApp.uiManager.enableVadControls(false, 0);
             AudioApp.uiManager.updateVadDisplay(0.5, 0.35, true, 0);
             AudioApp.uiManager.showVadProgress(false, 0);
        }

        // Reset shared time display if loading track 0
        if(trackIndex === 0){
             AudioApp.uiManager.updateTimeDisplay(0, 0);
             AudioApp.uiManager.updateSeekBar(0);
        }

        AudioApp.uiManager.enablePlaybackControls(false); // Disable until ready
        AudioApp.uiManager.enableSeekBar(false);

        try {
            await AudioApp.audioEngine.loadAndProcessTrack(file, trackIndex);
        } catch (error) { /* Handled by handleAudioError */ }
    }

    /** @param {CustomEvent<{audioBuffer: AudioBuffer, trackIndex: number}>} e @private */
    async function handleAudioLoaded(e) {
        const { audioBuffer, trackIndex } = e.detail;
        if (!audioBuffer || trackIndex === undefined) return;

        console.log(`App: Audio decoded for track ${trackIndex} (${audioBuffer.duration.toFixed(2)}s)`);
        audioBuffers[trackIndex] = audioBuffer;
        AudioApp.uiManager.setFileInfo(`Decoded: ${files[trackIndex]?.name || 'Unknown'}`, trackIndex);

        // Update shared UI time/seek state only if Track 0 loaded/reloaded
        if (trackIndex === 0) {
            AudioApp.uiManager.updateTimeDisplay(0, audioBuffer.duration);
            AudioApp.uiManager.updateSeekBar(0);
            playbackStartSourceTime = 0.0;
        } else if (activeTracks === 1) { // If only track 1 is loaded, use its duration for display
            AudioApp.uiManager.updateTimeDisplay(0, audioBuffer.duration);
            AudioApp.uiManager.updateSeekBar(0);
            playbackStartSourceTime = 0.0;
        }

        // Trigger Visuals and VAD for the loaded track
        console.log(`App: Drawing initial waveform (Track ${trackIndex})...`);
        await waveformVisualizers[trackIndex]?.computeAndDrawWaveform(audioBuffer, []);

        console.log(`App: Starting spectrogram computation/drawing (Track ${trackIndex})...`);
        await spectrogramVisualizers[trackIndex]?.computeAndDrawSpectrogram(audioBuffer);

        console.log(`App: Initial visuals initiated (Track ${trackIndex}).`);

        // Only run VAD on Track 0 for now
        if (trackIndex === 0) {
             AudioApp.uiManager.setFileInfo(`Processing VAD (Track 0)...`, trackIndex);
             console.log("App: Starting background VAD processing (Track 0)...");
             runVadInBackground(audioBuffer, trackIndex);
        }
    }

    /** @param {CustomEvent<{trackIndex: number}>} e @private */
    function handleWorkletReady(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackIndex < 0 || trackIndex >= workletReadyStates.length) return;

        console.log(`App: AudioWorklet processor for track ${trackIndex} is ready.`);
        workletReadyStates[trackIndex] = true;

        _checkAndEnablePlaybackControls(); // Checks if all *active* tracks are now ready

        const allReady = _areAllActiveTracksReady();
        if (allReady && activeTracks > 0) {
            const infoText = activeTracks === 1
                ? `Ready: ${files[0]?.name || files[1]?.name || 'Track'}` // Show remaining track name
                : `Ready: T1: ${files[0]?.name || '?'} | T2: ${files[1]?.name || '?'}`;
             AudioApp.uiManager.setFileInfo(infoText, 0); // Display combined info in T0 slot
             AudioApp.uiManager.setFileInfo("", 1);
             spectrogramVisualizers[trackIndex]?.showSpinner(false); // Hide spinner for the track that just became ready
        } else if (activeTracks > 0) {
            const readyCount = workletReadyStates.filter((ready, i) => files[i] !== null && ready).length;
            AudioApp.uiManager.setFileInfo(`Loading... (${readyCount}/${activeTracks} tracks ready)`, 0);
            AudioApp.uiManager.setFileInfo("", 1);
        }
    }

    /** @param {AudioBuffer} audioBuffer, @param {number} trackIndex @private */
     async function runVadInBackground(audioBuffer, trackIndex) {
        // --- This function only operates on Track 0's VAD results/UI for now ---
        if (trackIndex !== 0) {
             console.log(`App: Skipping VAD for track ${trackIndex} (currently only supported for track 0).`);
             return;
        }
         if (!audioBuffer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager || !waveformVisualizers[trackIndex]) {
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

             AudioApp.uiManager.showVadProgress(true, 0); AudioApp.uiManager.updateVadProgress(0, 0);

             console.log(`App (VAD Task ${trackIndex}): Resampling audio...`);
             pcm16k = await AudioApp.audioEngine.resampleTo16kMono(audioBuffer);
             if (!pcm16k || pcm16k.length === 0) {
                  console.log(`App (VAD Task ${trackIndex}): No audio data after resampling.`);
                  AudioApp.uiManager.setSpeechRegionsText("No VAD data", 0); AudioApp.uiManager.updateVadProgress(100, 0); AudioApp.uiManager.enableVadControls(false, 0);
                  vadProcessingStates[trackIndex] = false; return;
             }

             console.log(`App (VAD Task ${trackIndex}): Starting VAD analysis...`);
             const vadProgressCallback = (progress) => {
                  if (AudioApp.uiManager) {
                      if (progress.totalFrames > 0) { const percentage = (progress.processedFrames / progress.totalFrames) * 100; AudioApp.uiManager.updateVadProgress(percentage, 0); }
                      else { AudioApp.uiManager.updateVadProgress(0, 0); }
                  }
             };
             const analysisOptions = { onProgress: vadProgressCallback };
             const result = await AudioApp.vadAnalyzer.analyze(pcm16k, analysisOptions); // Analyzer manages its own state, assumes T0 for now if not adapted
             vadResults[trackIndex] = result;

             console.log(`App (VAD Task ${trackIndex}): VAD analysis complete. Found ${result.regions?.length || 0} regions.`);
             vadSucceeded = true;

             // Update UI for Track 0
              const speechRegions = result.regions || [];
              AudioApp.uiManager.updateVadDisplay(result.initialPositiveThreshold, result.initialNegativeThreshold, false, 0);
              AudioApp.uiManager.setSpeechRegionsText(speechRegions, 0);
              AudioApp.uiManager.enableVadControls(true, 0);
              waveformVisualizers[0]?.redrawWaveformHighlight(audioBuffer, speechRegions);
              AudioApp.uiManager.updateVadProgress(100, 0);

         } catch (error) {
             console.error(`App (VAD Task ${trackIndex}): Error during background VAD processing -`, error);
              const errorType = error.message.includes("resampling") ? "Resampling" : error.message.includes("VAD") ? "VAD" : "Processing";
              AudioApp.uiManager.setSpeechRegionsText(`${errorType} Error`, 0);
              AudioApp.uiManager.enableVadControls(false, 0);
              AudioApp.uiManager.updateVadProgress(0, 0);
             vadResults[trackIndex] = null;
         } finally {
             vadProcessingStates[trackIndex] = false;
         }
    }

    /** @param {CustomEvent<{type?: string, error: Error, trackIndex?: number}>} e @private */
    function handleAudioError(e) {
        const errorType = e.detail.type || 'Unknown';
        const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred';
        const trackIndex = e.detail.trackIndex;

        console.error(`App: Audio Error - Type: ${errorType}, Track: ${trackIndex ?? 'N/A'}, Message: ${errorMessage}`, e.detail.error);

        let targetIndex = -1;
        if (trackIndex !== undefined) { targetIndex = trackIndex; }
        else if (['resampling', 'decoding', 'load', 'resourceLoad'].includes(errorType)) {
             console.warn(`App: Guessing track index 0 for ${errorType} error.`);
             targetIndex = 0;
        }

        if (targetIndex !== -1) {
            _clearTrackStateOnError(targetIndex, errorType); // Clears state, updates counts/UI state
            AudioApp.uiManager.setFileInfo(`Error (T${targetIndex}): ${errorMessage.substring(0, 60)}`, targetIndex);
        } else {
            console.warn("App: Audio error with unknown track index, performing full reset.");
            _resetAppState();
            AudioApp.uiManager.resetUI();
        }
        _checkAndEnablePlaybackControls(); // Re-evaluate controls
        stopUIUpdateLoop();
    }

    /** @private */
    function _clearTrackStateOnError(trackIndex, errorType) {
         console.log(`App: Clearing state for track ${trackIndex} due to error (${errorType}).`);
         AudioApp.audioEngine.cleanupTrack(trackIndex);
         const wasPlaying = isActuallyPlaying;

         _resetTrackState(trackIndex);
         activeTracks = files.filter(f => f !== null).length;

         AudioApp.uiManager.setUILayoutState(activeTracks);
         AudioApp.uiManager.updateFileName("", trackIndex);
         AudioApp.uiManager.setFileInfo(`Cleared (Error: ${errorType})`, trackIndex);

         waveformVisualizers[trackIndex]?.clearVisuals();
         spectrogramVisualizers[trackIndex]?.clearVisuals();
         spectrogramVisualizers[trackIndex]?.showSpinner(false);

          if (trackIndex === 0) { // If track 0 cleared, reset shared UI if it was the basis
              // Check if track 1 still exists to base shared UI on it
              if (files[1]) {
                   AudioApp.uiManager.updateTimeDisplay(0, audioBuffers[1]?.duration || 0);
              } else {
                   AudioApp.uiManager.updateTimeDisplay(0, 0);
              }
             AudioApp.uiManager.updateSeekBar(0); // Reset seek bar
             AudioApp.uiManager.enableVadControls(false, 0);
          }

         if (wasPlaying && activeTracks === 0) {
              stopUIUpdateLoop(); isActuallyPlaying = false; playbackStartTimeContext = null; playbackStartSourceTime = 0.0;
         }
         _checkAndEnablePlaybackControls();
    }

    // --- NEW Event Handlers ---
    /** @param {CustomEvent<{trackIndex: number}>} e @private */
     function handleRemoveTrackClicked(e) {
          const { trackIndex } = e.detail;
          if (trackIndex === undefined || files[trackIndex] === null) return;
          console.log(`App: Remove track ${trackIndex} requested.`);
          const wasPlaying = isActuallyPlaying;

          if (wasPlaying) { AudioApp.audioEngine.togglePlayPause(); stopUIUpdateLoop(); isActuallyPlaying = false; playbackStartTimeContext = null; playbackStartSourceTime = 0.0;}

          AudioApp.audioEngine.cleanupTrack(trackIndex);
          _resetTrackState(trackIndex);
          activeTracks = files.filter(f => f !== null).length;

          AudioApp.uiManager.setUILayoutState(activeTracks);
          AudioApp.uiManager.updateFileName("", trackIndex);
          AudioApp.uiManager.setFileInfo(activeTracks > 0 ? `Track ${trackIndex} removed.` : "No file selected.", trackIndex);

          waveformVisualizers[trackIndex]?.clearVisuals();
          spectrogramVisualizers[trackIndex]?.clearVisuals();

          if (activeTracks === 0) {
                AudioApp.uiManager.resetUI();
                _resetAppState();
          } else {
                const remainingTrackIndex = files[0] !== null ? 0 : 1;
                const remainingBuffer = audioBuffers[remainingTrackIndex];
                AudioApp.uiManager.updateTimeDisplay(0, remainingBuffer?.duration || 0);
                AudioApp.uiManager.updateSeekBar(0);
                playbackStartSourceTime = 0.0;
                // Ensure VAD controls match remaining track 0 state if applicable
                if (remainingTrackIndex === 0) {
                     AudioApp.uiManager.enableVadControls(!!vadResults[0], 0); // Enable if VAD results exist
                } else {
                     AudioApp.uiManager.enableVadControls(false, 0); // Disable T0 VAD controls if only T1 remains
                }
                 _checkAndEnablePlaybackControls();
          }
     }

    /** @param {CustomEvent<{trackIndex: number}>} e @private */
    function handleMuteTrackClicked(e) {
         const { trackIndex } = e.detail;
         if (trackIndex === undefined || files[trackIndex] === null) return;
         const newMuteState = !trackMuteStates[trackIndex];
         trackMuteStates[trackIndex] = newMuteState;
         console.log(`App: Setting track ${trackIndex} mute state to ${newMuteState}`);
         AudioApp.audioEngine.setTrackMuted(trackIndex, newMuteState);
         AudioApp.uiManager.setMuteButtonState(trackIndex, newMuteState);
    }

    /** @param {CustomEvent} e @private */
    function handleSwapTracksClicked(e) {
        if (activeTracks !== 2) return;
        console.log("App: Swap Tracks requested (Implementation Deferred).");
        // TODO: Implementation
    }

    // --- Playback Controls & Time Sync Handlers ---
    /** @private */
    function handlePlayPause() {
        if (!_areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Not all active tracks ready."); return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        if (isActuallyPlaying) {
            const finalEstimatedTime = calculateEstimatedSourceTime();
            console.log(`App: Pausing requested. Seeking engine to estimated shared time: ${finalEstimatedTime.toFixed(3)} before pausing.`);
            AudioApp.audioEngine.seek(finalEstimatedTime); // Seek all active tracks to shared time (engine handles offset internally if implemented)
            playbackStartSourceTime = finalEstimatedTime;
            playbackStartTimeContext = null;
            stopUIUpdateLoop();
            updateUIWithTime(finalEstimatedTime); // Update UI immediately
        }
        AudioApp.audioEngine.togglePlayPause(); // Tell engine to toggle state for all
    }

    /** @param {CustomEvent<{seconds: number}>} e @private */
    function handleJump(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        const currentTime = calculateEstimatedSourceTime();
        // Use longest duration for clamping? Or Track 0? Using longest for jump range.
        const duration = Math.max(audioBuffers[0]?.duration || 0, audioBuffers[1]?.duration || 0);
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = Math.max(0, Math.min(currentTime + e.detail.seconds, duration)); // Clamp jump target
        AudioApp.audioEngine.seek(targetSharedTime); // Seek all to shared time
        playbackStartSourceTime = targetSharedTime; // Update shared base time
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }

    /** @param {CustomEvent<{fraction: number}>} e @private */
    function handleSeek(e) {
        if (!_areAllActiveTracksReady() || activeTracks === 0) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        // Use duration of track 0 for seek bar fraction calculation (consistent with display)
        const duration = audioBuffers[0]?.duration || audioBuffers[1]?.duration || 0; // Base seek on longest? Or T0? Using T0 for now.
        if (isNaN(duration) || duration <= 0) return;
        const targetSharedTime = e.detail.fraction * duration;
        AudioApp.audioEngine.seek(targetSharedTime); // Seek all to shared time
        playbackStartSourceTime = targetSharedTime; // Update shared base time
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }
    const handleSeekBarInput = handleSeek;

    /** @param {CustomEvent<{speed: number}>} e @private */
    function handleSpeedChange(e) {
        if (!_areAllActiveTracksReady()) return;
        AudioApp.audioEngine.setSpeed(e.detail.speed);
        debouncedSyncEngine();
    }

    /** @param {CustomEvent<{pitch: number}>} e @private */
    function handlePitchChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setPitch(e.detail.pitch); }

    /** @param {CustomEvent<{gain: number}>} e @private */
    function handleGainChange(e) { if (_areAllActiveTracksReady()) AudioApp.audioEngine.setGain(e.detail.gain); } // Master Gain

    /** @private */
    function syncEngineToEstimatedTime() {
        if (!_areAllActiveTracksReady() || activeTracks === 0) { return; }
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        const targetSharedTime = calculateEstimatedSourceTime();
        console.log(`App: Debounced sync executing. Seeking engine to estimated shared time: ${targetSharedTime.toFixed(3)}.`);
        AudioApp.audioEngine.seek(targetSharedTime); // Seek all to shared time
        playbackStartSourceTime = targetSharedTime; // Update shared base time
        if (isActuallyPlaying) { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetSharedTime); }
    }

    /** @param {CustomEvent<{speed: number, trackIndex: number}>} e @private */
    function handleInternalSpeedChange(e) {
        const { speed: newSpeed, trackIndex } = e.detail;
        if (newSpeed === currentSpeedForUpdate || files[trackIndex] === null) return;
        console.log(`App: Internal speed updated by engine (Track ${trackIndex}) to ${newSpeed.toFixed(2)}x. Updating shared speed estimate.`);
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

    /** @param {CustomEvent<{trackIndex: number}>} e @private */
    function handlePlaybackEnded(e) {
        const { trackIndex } = e.detail;
        if (trackIndex === undefined || trackEndedStates[trackIndex]) return;
        console.log(`App: Playback ended event received for track ${trackIndex}.`);
        trackEndedStates[trackIndex] = true;
        let allActiveEnded = true;
        for (let i = 0; i < files.length; i++) { if (files[i] !== null && !trackEndedStates[i]) { allActiveEnded = false; break; } }
        if (allActiveEnded) {
             console.log("App: All active tracks have ended.");
             isActuallyPlaying = false;
             stopUIUpdateLoop();
             playbackStartTimeContext = null;
             // Use longest duration for final time? Or T0?
             const duration = Math.max(audioBuffers[0]?.duration || 0, audioBuffers[1]?.duration || 0);
             playbackStartSourceTime = duration;
             updateUIWithTime(duration);
             AudioApp.uiManager.setPlayButtonState(false);
        } else { console.log(`App: Track ${trackIndex} ended, but other active tracks continue.`); }
    }

    /** @param {CustomEvent<{isPlaying: boolean, trackIndex: number}>} e @private */
     function handlePlaybackStateChange(e) {
        const { isPlaying: workletIsPlaying, trackIndex } = e.detail;
        if (trackIndex === undefined) return;
        console.log(`App: Playback state confirmed by worklet (Track ${trackIndex}): ${workletIsPlaying}`);

        // Determine new overall playing state: true if ANY active, non-ended track is (or was just commanded to be) playing.
        // This still requires knowing the intended state or storing individual states.
        // Simplification: Assume if this worklet says 'true', overall is 'true'. If 'false', check others (difficult).
        // Let's stick to the simplest logic for now: overall state matches the last event received.
         const newOverallPlayingState = workletIsPlaying; // Potentially racy if events cross.

        // Update shared state and UI loop if overall state changes
        if (newOverallPlayingState && !isActuallyPlaying) {
            isActuallyPlaying = true;
            AudioApp.uiManager.setPlayButtonState(true);
            const audioCtx = AudioApp.audioEngine?.getAudioContext();
            if (audioCtx) {
                 // Reset shared time base using current estimated position
                 playbackStartSourceTime = calculateEstimatedSourceTime();
                 playbackStartTimeContext = audioCtx.currentTime;
                 console.log(`App: Playback confirmed started/resumed. Setting shared time base: src=${playbackStartSourceTime.toFixed(3)}, ctx=${playbackStartTimeContext.toFixed(3)}`);
                 updateUIWithTime(playbackStartSourceTime); // Update UI immediately
                 startUIUpdateLoop(); // Start UI updates
            }
        } else if (!newOverallPlayingState && isActuallyPlaying) {
             // Need to be careful: only set overall to false if ALL active tracks have stopped.
             // Check if any *other* active, non-ended track might still be playing.
             let anyOtherPlaying = false;
             for (let i = 0; i < files.length; i++) {
                  if (i !== trackIndex && files[i] !== null && !trackEndedStates[i] /* && trackIsStillPlaying[i] ??? */) {
                       // How do we know if track 'i' is still playing without its own event?
                       // Assume for now: if the worklet reporting 'false' was the ONLY one playing, then stop.
                       // This requires more state or different event handling from engine.
                       // Revert to simple: if event is false, stop overall.
                       // anyOtherPlaying = true; break;
                  }
             }

             // if (!anyOtherPlaying) { // Only stop if no others are playing
                 isActuallyPlaying = false;
                 AudioApp.uiManager.setPlayButtonState(false);
                 stopUIUpdateLoop(); // Stop UI updates
                 playbackStartTimeContext = null;
                 console.log(`App: Playback confirmed stopped/paused. Base source time: ${playbackStartSourceTime.toFixed(3)}`);
             // } else {
             //     console.log(`App: Track ${trackIndex} stopped, but other tracks may still be playing.`);
             // }
        }
    }

    /** @param {CustomEvent<{type: string, value: number, trackIndex: number}>} e @private */
     function handleThresholdChange(e) {
         const trackIndex = 0; // Operate on T0 VAD for now
         if (!vadResults[trackIndex] || vadProcessingStates[trackIndex]) return;
         const { type, value } = e.detail;
         const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value);
         AudioApp.uiManager.setSpeechRegionsText(newRegions, 0);
         if(audioBuffers[trackIndex]) {
              waveformVisualizers[trackIndex]?.redrawWaveformHighlight(audioBuffers[trackIndex], newRegions);
         }
     }

    /** @param {CustomEvent<{key: string}>} e @private */
    function handleKeyPress(e) {
        if (!_areAllActiveTracksReady()) return;
        const key = e.detail.key;
        const jumpTimeValue = AudioApp.uiManager.getJumpTime();
        switch (key) {
            case 'Space': handlePlayPause(); break;
            case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break;
            case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break;
        }
    }

    /** @private */
    function handleWindowResize() {
        console.log("App: Window resize detected.");
        let effectiveTime = 0;
        if (isActuallyPlaying || activeTracks > 0) {
            effectiveTime = calculateEstimatedSourceTime(); // Calculate time once
        }
        for (let i = 0; i < files.length; i++) {
            if (files[i] !== null && audioBuffers[i]) {
                const regions = vadResults[i] ? (vadResults[i].regions || []) : [];
                waveformVisualizers[i]?.resizeAndRedraw(audioBuffers[i], regions);
                spectrogramVisualizers[i]?.resizeAndRedraw(audioBuffers[i]);
            }
        }
        // Update indicators AFTER potential resize changes width
        if (isActuallyPlaying || activeTracks > 0) {
            updateUIWithTime(effectiveTime);
        }
    }

    /** @private */
    function handleBeforeUnload() {
        console.log("App: Unloading...");
        stopUIUpdateLoop();
        AudioApp.audioEngine?.cleanup();
    }

    // --- Main Thread Time Calculation & UI Update ---
    /** @private */
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    /** @private */
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }

    /** @private @returns {number} */
    function calculateEstimatedSourceTime() {
        const audioCtx = AudioApp.audioEngine?.getAudioContext();
        // Use duration of track 0 as the basis for the shared timeline length/clamping
        const duration = audioBuffers[0]?.duration || 0; // Default to 0 if track 0 not loaded

        if (!isActuallyPlaying || playbackStartTimeContext === null || !audioCtx || activeTracks === 0) {
            return playbackStartSourceTime;
        }
        // If duration is 0 (e.g., only track 1 loaded, track 0 failed), return start time
        if (duration <= 0 && !audioBuffers[1]) return playbackStartSourceTime;
        // If only track 1 loaded, use its duration for clamping? This makes timeline inconsistent.
        // Stick to using T0 duration for shared timeline clamping.

        if (currentSpeedForUpdate <= 0) { return playbackStartSourceTime; }
        const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
        const elapsedSourceTime = elapsedContextTime * currentSpeedForUpdate;
        let estimatedCurrentSourceTime = playbackStartSourceTime + elapsedSourceTime;

        // Clamp to valid duration range (using track 0's duration as the master timeline length)
        estimatedCurrentSourceTime = Math.max(0, Math.min(estimatedCurrentSourceTime, duration || Infinity)); // Clamp to T0 duration or allow going beyond if T0 missing?

        return estimatedCurrentSourceTime;
    }

    /** @private @param {number} sharedTime */
    function updateUIWithTime(sharedTime) {
        const durationT0 = audioBuffers[0]?.duration || 0;
        const durationT1 = audioBuffers[1]?.duration || 0;
        // Use duration of track 0 for shared display elements
        const displayDuration = durationT0 || 0;

        if (isNaN(displayDuration)) return;

        const clampedSharedTime = Math.max(0, Math.min(sharedTime, displayDuration)); // Clamp shared time to display duration (T0)
        const fraction = displayDuration > 0 ? clampedSharedTime / displayDuration : 0;

        AudioApp.uiManager.updateTimeDisplay(clampedSharedTime, displayDuration);
        AudioApp.uiManager.updateSeekBar(fraction);

        // Update Visualizer 0
        if(audioBuffers[0]){
             const clampedTimeT0 = Math.max(0, Math.min(sharedTime, durationT0)); // Clamp to T0 duration
             waveformVisualizers[0]?.updateProgressIndicator(clampedTimeT0, durationT0);
             spectrogramVisualizers[0]?.updateProgressIndicator(clampedTimeT0, durationT0);
        } else {
             waveformVisualizers[0]?.updateProgressIndicator(0, 0);
             spectrogramVisualizers[0]?.updateProgressIndicator(0, 0);
        }

        // Update Visualizer 1
        if (audioBuffers[1]) {
            const timeT1 = sharedTime + trackOffsetSeconds;
            const clampedTimeT1 = Math.max(0, Math.min(timeT1, durationT1)); // Clamp to T1 duration
            waveformVisualizers[1]?.updateProgressIndicator(clampedTimeT1, durationT1);
            spectrogramVisualizers[1]?.updateProgressIndicator(clampedTimeT1, durationT1);
        } else {
             waveformVisualizers[1]?.updateProgressIndicator(0, 0);
             spectrogramVisualizers[1]?.updateProgressIndicator(0, 0);
        }
    }

    /** @private @param {DOMHighResTimeStamp} timestamp */
    function updateUIBasedOnContextTime(timestamp) {
        if (!isActuallyPlaying) { rAFUpdateHandle = null; return; }
        const estimatedSharedTime = calculateEstimatedSourceTime();
        updateUIWithTime(estimatedSharedTime);
        rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime);
    }

    // --- Helper Functions ---
    /** @private */
    function _resetTrackState(trackIndex) {
         console.log(`App: Resetting state for track ${trackIndex}`);
         audioBuffers[trackIndex] = null; files[trackIndex] = null; vadResults[trackIndex] = null;
         workletReadyStates[trackIndex] = false; vadProcessingStates[trackIndex] = false; trackEndedStates[trackIndex] = false; trackMuteStates[trackIndex] = false;
         // Don't clear visualizer instances here, just their content via caller
    }

    /** @private */
    function _areAllActiveTracksReady() {
        if (activeTracks === 0) return false;
        for (let i = 0; i < files.length; i++) {
            if (files[i] !== null && !workletReadyStates[i]) {
                 return false;
            }
        }
        return true;
    }

    /** @private */
     function _checkAndEnablePlaybackControls() {
         const allReady = _areAllActiveTracksReady();
         console.log(`App: Checking controls. Active tracks: ${activeTracks}, All active ready: ${allReady}`);
         AudioApp.uiManager.enablePlaybackControls(allReady);
         AudioApp.uiManager.enableSeekBar(allReady);
         // Also update UI state here in case it wasn't updated before (e.g. if last track just became ready)
          if(allReady && activeTracks > 0) {
              AudioApp.uiManager.setUILayoutState(activeTracks);
          }
     }

    // --- Public Interface ---
    return {
        init: init
    };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
