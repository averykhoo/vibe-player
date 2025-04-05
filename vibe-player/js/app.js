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
    // REMOVED: const Utils = AudioApp.Utils;
    // REMOVED: const Constants = AudioApp.Constants;
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
     */
     function createInitialTrackState(side) { /* ... unchanged ... */ return { id: `track_${side}`, side: side, file: null, audioBuffer: null, isLoading: false, isReady: false, hasEnded: false, parameters: { offsetSeconds: 0.0, volume: 1.0, speed: 1.0, pitch: 1.0, pan: (side === 'left' ? -1 : 1), isMuted: false, isSoloed: false, }, vad: { results: null, isProcessing: false, }, }; }
     let tracks = [ createInitialTrackState('left'), createInitialTrackState('right') ];
     let multiTrackModeActive = false;
     let speedLinked = true;
     let pitchLinked = true;
     let globalPlaybackState = 'stopped';
     let playbackStartTimeContext = null;
     let playbackStartSourceTime = 0.0;
     let rAFUpdateHandle = null;
     let currentGlobalSpeed = 1.0;
     let vadModelReady = false;
     let debouncedSyncEngine = null;
     const SYNC_DEBOUNCE_WAIT_MS = 300;

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("AudioApp: Initializing...");

        // --- CRITICAL CHECK ---
        // Access modules directly from the global AudioApp namespace here.
        // The DOMContentLoaded ensures all script IIFEs should have completed.
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer ||
            !AudioApp.spectrogramVisualizer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper ||
            !AudioApp.Constants || !AudioApp.Utils) // Check global namespace
        {
             // Log which specific modules are missing
             let missing = [];
             if (!AudioApp.uiManager) missing.push("uiManager");
             if (!AudioApp.audioEngine) missing.push("audioEngine");
             if (!AudioApp.waveformVisualizer) missing.push("waveformVisualizer");
             if (!AudioApp.spectrogramVisualizer) missing.push("spectrogramVisualizer");
             if (!AudioApp.vadAnalyzer) missing.push("vadAnalyzer");
             if (!AudioApp.sileroWrapper) missing.push("sileroWrapper");
             if (!AudioApp.Constants) missing.push("Constants");
             if (!AudioApp.Utils) missing.push("Utils");
             console.error(`AudioApp: CRITICAL - Required modules missing on AudioApp namespace: [${missing.join(', ')}]. Check script loading order.`);
             // Attempt to update UI even if uiManager might be missing (using optional chaining)
             AudioApp.uiManager?.setFileInfo('left', "Initialization Error: Missing modules.");
             return;
        }
        // --- CHECK PASSED ---

        // Now safe to use AudioApp.*
        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);

        // Initialize modules (accessing via global namespace)
        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();
        AudioApp.waveformVisualizer.init();
        AudioApp.spectrogramVisualizer.init();
        setupAppEventListeners();
        AudioApp.uiManager.resetUI(); // Reset UI after everything is set up
        console.log("AudioApp: Initialized. Waiting for file...");
    }

    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() { /* ... unchanged ... */
        // UI -> App
        document.addEventListener('audioapp:fileSelected', handleFileSelected);
        document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrack);
        document.addEventListener('audioapp:swapTracksClicked', handleSwapTracks);
        document.addEventListener('audioapp:linkSpeedToggled', handleLinkSpeedToggle);
        document.addEventListener('audioapp:linkPitchToggled', handleLinkPitchToggle);
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
        document.addEventListener('audioapp:playPauseClicked', handlePlayPause);
        document.addEventListener('audioapp:jumpClicked', handleJump);
        document.addEventListener('audioapp:seekRequested', handleSeek);
        document.addEventListener('audioapp:seekBarInput', handleSeekBarInput);
        document.addEventListener('audioapp:gainChanged', handleMasterGainChange);
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
        // Window Events
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Helper Functions ---
    /** Finds track state by side ('left' | 'right') */
    function findTrackBySide(side) { /* ... unchanged ... */ return tracks.find(t => t.side === side); }
    /** Finds track state by ID ('track_left' | 'track_right') */
    function findTrackById(id) { /* ... unchanged ... */ return tracks.find(t => t.id === id); }
    /** Checks if all active tracks are ready for playback. */
    function areAllActiveTracksReady() { /* ... unchanged ... */ if (!tracks[0]?.isReady) return false; if (multiTrackModeActive && !tracks[1]?.isReady) return false; return true; }
    /** Gets the number of tracks currently loaded and ready */
    function getReadyTrackCount() { /* ... unchanged ... */ return tracks.filter(t => t?.isReady).length; }


    // --- Event Handler Functions ---
    // Use AudioApp.* to access other modules within these handlers

    /** @param {CustomEvent<{file: File, trackId: 'left' | 'right'}>} e */
    async function handleFileSelected(e) {
        const { file, trackId: trackSide } = e.detail;
        const track = findTrackBySide(trackSide);
        if (!track) { console.error(`App: Invalid track side '${trackSide}' received.`); return; }
        if (!file) { console.log(`App: No file selected for track ${track.side}.`); return; }
        if (track.side === 'right' && !tracks[0]?.isReady) {
             console.warn(`App: Cannot load Right track until Left track is loaded and ready.`);
             AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return;
        }
        console.log(`App: File selected for track ${track.side} -`, file.name);
        Object.assign(track, createInitialTrackState(track.side), { file: file, isLoading: true });
        if (track.side === 'left') {
             console.log("App: Resetting global state and UI for Left track load.");
             stopUIUpdateLoop(); globalPlaybackState = 'stopped'; playbackStartTimeContext = null;
             playbackStartSourceTime = 0.0; currentGlobalSpeed = 1.0;
             if (tracks[1]?.audioBuffer || tracks[1]?.file) { await handleRemoveTrackInternal(); }
             AudioApp.uiManager.resetUI();
        } else {
             AudioApp.uiManager.setFileInfo(track.side, `Loading: ${file.name}...`);
             AudioApp.uiManager.enableTrackControls(track.side, false);
             multiTrackModeActive = true; AudioApp.uiManager.showMultiTrackUI(true);
        }
        AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);
        if (track.side === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); }
        try {
            // Use AudioApp.*
            await AudioApp.audioEngine.setupTrack(track.id, file);
        } catch (error) {
            console.error(`App: Error initiating file processing for track ${track.side} -`, error);
            track.isLoading = false;
            AudioApp.uiManager.setFileInfo(track.side, `Error loading: ${error.message}`);
            if (track.side === 'left') { AudioApp.uiManager.resetUI(); }
            else { AudioApp.uiManager.updateFileName(track.side, 'Load Error!'); }
            if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        }
    }

     /** @param {CustomEvent<{audioBuffer: AudioBuffer, trackId: string}>} e */
    async function handleAudioLoaded(e) {
         const { audioBuffer, trackId } = e.detail;
         const track = findTrackById(trackId);
         if (!track || !track.isLoading) return;
         console.log(`App: Audio decoded for track ${track.side} (${audioBuffer.duration.toFixed(2)}s)`);
         track.audioBuffer = audioBuffer; track.isLoading = false;
         AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`);
         if (track.side === 'left') {
             const duration = audioBuffer.duration;
             AudioApp.uiManager.updateTimeDisplay(0, duration); AudioApp.uiManager.updateSeekBar(0);
             playbackStartSourceTime = 0.0;
             // Use AudioApp.*
             console.log("App: Starting background VAD processing for Left track...");
             runVadInBackground(track); // Pass the track state
             AudioApp.audioEngine.setPan(track.id, -1); // Set initial pan via engine
         } else {
             AudioApp.audioEngine.setPan(track.id, 1); // Set initial pan via engine
         }
         console.log(`App: Drawing initial visuals for track ${track.side}...`);
         try { // Placeholder viz calls
             // await AudioApp.waveformVisualizer.computeAndDrawWaveform(track.audioBuffer, [], track.side);
             // await AudioApp.spectrogramVisualizer.computeAndDrawSpectrogram(track.audioBuffer, track.side);
         } catch (visError) { console.error(`App: Error drawing visuals for track ${track.side}:`, visError); }
    }

    /** @param {CustomEvent<{trackId: string}>} e */
    function handleWorkletReady(e) {
        const trackId = e.detail.trackId;
        const track = findTrackById(trackId);
        if (!track || !track.audioBuffer) { /* ... safety check ... */ return; }
        console.log(`App: AudioWorklet processor is ready for track ${track.side}.`);
        track.isReady = true; track.isLoading = false; track.hasEnded = false;
        AudioApp.uiManager.enableTrackControls(track.side, true);
        // Apply initial params via AudioApp.*
        AudioApp.audioEngine.setVolume(track.id, track.parameters.volume);
        AudioApp.audioEngine.setPan(track.id, track.parameters.pan);
        AudioApp.audioEngine.setTrackSpeed(track.id, track.parameters.speed);
        AudioApp.audioEngine.setTrackPitch(track.id, track.parameters.pitch);
        if (track.side === 'left') {
             console.log("App: Left track ready, enabling Right track loading.");
             AudioApp.uiManager.enableRightTrackLoadButton(true);
             if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
        }
        if (track.side === 'right') {
             multiTrackModeActive = true; AudioApp.uiManager.showMultiTrackUI(true);
             AudioApp.uiManager.enableSwapButton(true); AudioApp.uiManager.enableRemoveButton(true);
             // TODO: Use uiManager to position markers if needed, or ensure it happens on show
             // AudioApp.uiManager.positionMarkersForSlider(speedSlider_right, speedMarkers_right);
             // AudioApp.uiManager.positionMarkersForSlider(pitchSlider_right, pitchMarkers_right);
        }
        if (areAllActiveTracksReady()) {
             console.log("App: All active tracks are now ready.");
             AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true);
        } else {
             console.log("App: Waiting for other track(s) to become ready...");
             AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);
        }
    }

    // --- New Multi-Track Handlers (Placeholders/Signatures) ---
    // function handleAddTrack() { /* Removed */ }
    async function handleRemoveTrack() { console.log("App: Remove Right track requested."); await handleRemoveTrackInternal(); }
    async function handleRemoveTrackInternal() {
        if (!tracks[1]) return;
        const trackId = tracks[1].id;
        // Use AudioApp.*
        await AudioApp.audioEngine.cleanupTrack(trackId);
        tracks[1] = createInitialTrackState('right');
        multiTrackModeActive = false;
        AudioApp.uiManager.showMultiTrackUI(false);
        AudioApp.uiManager.enableRightTrackLoadButton(true);
        AudioApp.uiManager.enableSwapButton(false);
        AudioApp.uiManager.enableRemoveButton(false);
        if (tracks[0]?.isReady) { AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); }
        else { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log("App: Right track removed and UI reverted.");
    }
    function handleSwapTracks() { /* Logic TBD */ }
    function handleLinkSpeedToggle(e) { speedLinked = e.detail.linked; console.log("App: SpeedLink set to", speedLinked); }
    function handleLinkPitchToggle(e) { pitchLinked = e.detail.linked; console.log("App: PitchLink set to", pitchLinked); }
    function handleVolumeChange(trackSide, volume) { /* Logic TBD */ }
    function handleDelayChange(trackSide, valueStr) { /* Logic TBD */ }
    function handleMuteToggle(trackSide) { /* Logic TBD */ }
    function handleSoloToggle(trackSide) { /* Logic TBD */ }

    // --- VAD Processing (Adapted for specific track) ---
    /** @param {TrackState} track */
    async function runVadInBackground(track) {
         if (track.side !== 'left' || !track.audioBuffer) return;
         // Use AudioApp.* for checks
         if (!AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager || !AudioApp.waveformVisualizer) {
              console.error("App (VAD Task): Missing dependencies."); track.vad.isProcessing = false; return;
         }
         if (track.vad.isProcessing) { console.warn("App: VAD already running for Left track."); return; }
         track.vad.isProcessing = true; track.vad.results = null;
         let pcm16k = null; let vadSucceeded = false; // Corrected: declare pcm16k here
         AudioApp.uiManager.setFileInfo(track.side, `Processing VAD...`);
         AudioApp.uiManager.showVadProgress(true); AudioApp.uiManager.updateVadProgress(0);
         try {
             if (!vadModelReady) { // Use AudioApp.*
                 vadModelReady = await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE);
                 if (!vadModelReady) throw new Error("Failed VAD model create.");
             }
             pcm16k = await AudioApp.audioEngine.resampleTo16kMono(track.audioBuffer);
             if (!pcm16k || pcm16k.length === 0) throw new Error("Resampling yielded no data");
             const vadProgressCallback = (p) => { AudioApp.uiManager?.updateVadProgress(p.totalFrames > 0 ? (p.processedFrames / p.totalFrames) * 100 : 0); };
             // Use AudioApp.*
             track.vad.results = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback });
             const regions = track.vad.results.regions || [];
             console.log(`App (VAD Task): VAD done for Left. ${regions.length} regions.`);
             AudioApp.uiManager.updateVadDisplay(track.vad.results.initialPositiveThreshold, track.vad.results.initialNegativeThreshold);
             AudioApp.uiManager.setSpeechRegionsText(regions);
             if (track.isReady) AudioApp.uiManager.enableVadControls(true);
             // Use AudioApp.* - TODO: Adapt viz call
             // AudioApp.waveformVisualizer.redrawWaveformHighlight(track.audioBuffer, regions, track.side);
             AudioApp.uiManager.updateVadProgress(100); vadSucceeded = true;
         } catch (error) { /* ... error handling ... */
             console.error("App (VAD Task): Error -", error);
             AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`);
             AudioApp.uiManager.enableVadControls(false); AudioApp.uiManager.updateVadProgress(0); track.vad.results = null;
         } finally { /* ... finally block ... */
             track.vad.isProcessing = false;
             if (track.audioBuffer) AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`);
         }
    }

     /** @param {CustomEvent<{type?: string, error: Error, trackId?: string}>} e */
    function handleAudioError(e) { /* ... unchanged ... */
        const errorType = e.detail.type || 'Unknown'; const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred';
        const trackId = e.detail.trackId; const track = findTrackById(trackId); const trackSide = track ? track.side : 'global';
        console.error(`App: Audio Error - Track: ${trackSide}, Type: ${errorType}, Msg: ${errorMessage}`, e.detail.error);
        if (track) {
             track.isLoading = false; track.isReady = false; AudioApp.uiManager.setFileInfo(track.side, `Error (${errorType})`);
             AudioApp.uiManager.enableTrackControls(track.side, false);
             if (track.side === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); }
        } else { stopUIUpdateLoop(); AudioApp.uiManager.resetUI(); tracks.forEach(t => { Object.assign(t, createInitialTrackState(t.side)); }); multiTrackModeActive = false; globalPlaybackState = 'stopped'; }
        if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
    }


    // --- Global Playback Handlers ---
    function handlePlayPause() {
         if (!areAllActiveTracksReady()) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; }
         // Use AudioApp.*
         const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AC missing."); return; }
         const isCurrentlyPlaying = (globalPlaybackState === 'playing'); const targetStatePlay = !isCurrentlyPlaying;
         if (targetStatePlay) {
              const targetGlobalTime = calculateEstimatedSourceTime();
              console.log(`App: Play/Resume. Seeking active tracks to global time: ${targetGlobalTime.toFixed(3)} before playing.`);
              const trackSeekTimes = new Map();
              tracks.forEach(track => {
                  if (track?.isReady) {
                       const trackSeekTime = Math.max(0, targetGlobalTime - track.parameters.offsetSeconds);
                       trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false;
                  }
              });
              AudioApp.audioEngine.seekAllTracks(trackSeekTimes); // Use AudioApp.*
              playbackStartSourceTime = targetGlobalTime; playbackStartTimeContext = audioCtx.currentTime;
              AudioApp.audioEngine.togglePlayPause(true); // Use AudioApp.*
              globalPlaybackState = 'playing'; AudioApp.uiManager.setPlayButtonState(true); startUIUpdateLoop();
         } else {
              console.log(`App: Pausing requested.`); stopUIUpdateLoop();
              playbackStartSourceTime = calculateEstimatedSourceTime(); playbackStartTimeContext = null;
              AudioApp.audioEngine.togglePlayPause(false); // Use AudioApp.*
              globalPlaybackState = 'paused'; AudioApp.uiManager.setPlayButtonState(false);
              updateUIWithTime(playbackStartSourceTime);
         }
    }

    /** @param {CustomEvent<{seconds: number}>} e */
    function handleJump(e) { if (!areAllActiveTracksReady()) return; const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return; const currentGlobalTime = calculateEstimatedSourceTime(); const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration)); handleSeekInternal(targetGlobalTime); }
    /** @param {CustomEvent<{fraction: number}>} e */
    function handleSeek(e) { if (!areAllActiveTracksReady()) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return; const targetGlobalTime = e.detail.fraction * maxDuration; handleSeekInternal(targetGlobalTime); }
    const handleSeekBarInput = handleSeek;

    /** Internal function to handle global seek logic */
    function handleSeekInternal(targetGlobalTime) {
        // Use AudioApp.*
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        console.log(`App: Global seek requested to ${targetGlobalTime.toFixed(3)}s`);
        const trackSeekTimes = new Map();
        tracks.forEach(track => {
            if (track?.isReady) {
                 const trackSeekTime = Math.max(0, targetGlobalTime - track.parameters.offsetSeconds);
                 trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false;
            }
        });
        AudioApp.audioEngine.seekAllTracks(trackSeekTimes); // Use AudioApp.*
        playbackStartSourceTime = targetGlobalTime;
        if (globalPlaybackState === 'playing') { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(targetGlobalTime); }
    }

    // --- Parameter Change Handlers ---
    /** @param {'left' | 'right'} trackSide @param {number} speed */
    function handleSpeedChange(trackSide, speed) {
        if (!speedLinked) { console.warn("App: Unlinked speed change not fully implemented yet."); return; }
        const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0));
        if (Math.abs(currentGlobalSpeed - newSpeed) < 1e-6) return;
        console.log(`App: Linked speed changed to ${newSpeed.toFixed(2)}x`);
        const oldGlobalSpeed = currentGlobalSpeed; currentGlobalSpeed = newSpeed;
        tracks.forEach(track => { // Use AudioApp.*
            if (track?.isReady) {
                 track.parameters.speed = newSpeed;
                 AudioApp.audioEngine.setTrackSpeed(track.id, newSpeed);
                 const slider = document.getElementById(`speed_${track.side}`);
                 const valueDisplay = document.getElementById(`speedValue_${track.side}`);
                 AudioApp.uiManager.setSliderValue(slider, newSpeed, valueDisplay, 'x'); // Use AudioApp.*
            }
        });
        const audioCtx = AudioApp.audioEngine.getAudioContext(); // Use AudioApp.*
        if (globalPlaybackState === 'playing' && playbackStartTimeContext !== null && audioCtx) {
             const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext;
             const elapsedSourceTime = elapsedContextTime * oldGlobalSpeed;
             const previousSourceTime = playbackStartSourceTime + elapsedSourceTime;
             playbackStartSourceTime = previousSourceTime; playbackStartTimeContext = audioCtx.currentTime;
        }
        debouncedSyncEngine();
    }

    /** @param {'left' | 'right'} trackSide @param {number} pitch */
    function handlePitchChange(trackSide, pitch) { /* Placeholder */ }
    /** @param {CustomEvent<{gain: number}>} e */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); } // Use AudioApp.*

    /** Syncs engine to main thread estimated time */
    function syncEngineToEstimatedTime() {
         if (!areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - tracks not ready."); return; }
         // Use AudioApp.*
         const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
         const targetGlobalTime = calculateEstimatedSourceTime();
         console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`);
         handleSeekInternal(targetGlobalTime);
    }

    /** @param {CustomEvent<{type: string, value: number}>} e */
    function handleThresholdChange(e) {
        const track = tracks[0]; if (!track || !track.vad.results || track.vad.isProcessing) return;
        const { type, value } = e.detail;
        // Use AudioApp.*
        const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value);
        AudioApp.uiManager.setSpeechRegionsText(newRegions); // Use AudioApp.*
        if(track.audioBuffer) { /* TODO: Adapt viz call */ }
    }

    /** @param {CustomEvent<{trackId: string}>} e */
    function handlePlaybackEnded(e) {
          const trackId = e.detail.trackId; const track = findTrackById(trackId); if (!track) return;
          console.log(`App: Playback ended event received for track ${track.side}.`); track.hasEnded = true;
          const activeTracks = tracks.filter(t => t?.isReady && !t.hasEnded && (multiTrackModeActive || t.side === 'left')); // Find active tracks not yet ended
          if (activeTracks.length === 0 && getReadyTrackCount() > 0) { // If no active tracks remain AND at least one was ready initially
              console.log("App: All active tracks have ended."); globalPlaybackState = 'stopped'; stopUIUpdateLoop(); playbackStartTimeContext = null;
              let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); });
              playbackStartSourceTime = maxDuration; updateUIWithTime(maxDuration); AudioApp.uiManager.setPlayButtonState(false); // Use AudioApp.*
          }
    }

    /** @param {CustomEvent<{isPlaying: boolean, trackId: string}>} e */
    function handlePlaybackStateChange(e) { /* Informational */ }
    /** @param {CustomEvent<{key: string}>} e */
    function handleKeyPress(e) { if (!areAllActiveTracksReady()) return; const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; } }
    /** @private */
    function handleWindowResize() { const currentTime = calculateEstimatedSourceTime(); updateUIWithTime(currentTime); /* TODO: Adapt viz resize calls */ }
    /** @private */
    function handleBeforeUnload() { console.log("App: Unloading..."); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); } // Use AudioApp.*

    // --- Main Thread Time Calculation & UI Update ---
    /** @private */
    function startUIUpdateLoop() { /* ... unchanged ... */ }
    /** @private */
    function stopUIUpdateLoop() { /* ... unchanged ... */ }
    /** Calculates estimated current GLOBAL source time */
    function calculateEstimatedSourceTime() { /* ... unchanged ... */ const audioCtx = AudioApp.audioEngine.getAudioContext(); let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (globalPlaybackState !== 'playing' || playbackStartTimeContext === null || !audioCtx || maxDuration <= 0) { return playbackStartSourceTime; } if (currentGlobalSpeed <= 0) { return playbackStartSourceTime; } const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * currentGlobalSpeed; let estimatedCurrentGlobalTime = playbackStartSourceTime + elapsedSourceTime; return estimatedCurrentGlobalTime; }
     /** Updates UI with global time */
     function updateUIWithTime(globalTime) {
          let maxEffectiveDuration = 0; tracks.forEach(track => { if (track?.audioBuffer) { maxEffectiveDuration = Math.max(maxEffectiveDuration, track.parameters.offsetSeconds + track.audioBuffer.duration); } });
          if (isNaN(maxEffectiveDuration)) maxEffectiveDuration = 0;
          const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration));
          const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0;
          // Use AudioApp.*
          AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration);
          AudioApp.uiManager.updateSeekBar(fraction);
          AudioApp.uiManager.updateDriftDisplay(0); // Placeholder
          tracks.forEach(track => {
              if (track?.audioBuffer) {
                   // TODO: Adapt viz calls using AudioApp.*
                   // AudioApp.waveformVisualizer?.updateProgressIndicator(globalTime, track.parameters.offsetSeconds, track.audioBuffer.duration, track.side);
                   // AudioApp.spectrogramVisualizer?.updateProgressIndicator(globalTime, track.parameters.offsetSeconds, track.audioBuffer.duration, track.side);
              }
          });
     }
    /** rAF loop function */
    function updateUIBasedOnContextTime(timestamp) { /* ... unchanged ... */ }


    // --- Public Interface ---
    return { init: init };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---