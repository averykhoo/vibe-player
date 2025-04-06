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
     */
     function createInitialTrackState(side) { return { id: `track_${side}`, side: side, file: null, audioBuffer: null, isLoading: false, isReady: false, hasEnded: false, parameters: { offsetSeconds: 0.0, volume: 1.0, speed: 1.0, pitch: 1.0, pan: (side === 'left' ? -1 : 1), isMuted: false, isSoloed: false, }, vad: { results: null, isProcessing: false, }, }; }
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

    // --- Visualizer Instance References ---
    /** @type {object|null} Waveform visualizer instance for Left */
    let waveformVizLeft = null;
    /** @type {object|null} Spectrogram visualizer instance for Left */
    let specVizLeft = null;
    /** @type {object|null} Waveform visualizer instance for Right */
    let waveformVizRight = null;
    /** @type {object|null} Spectrogram visualizer instance for Right */
    let specVizRight = null;


    // --- Initialization ---
    /** @public */
    function init() {
        console.log("AudioApp: Initializing...");
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer ||
            !AudioApp.spectrogramVisualizer || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper ||
            !AudioApp.Constants || !AudioApp.Utils)
        { let missing = []; if (!AudioApp.uiManager) missing.push("uiManager"); if (!AudioApp.audioEngine) missing.push("audioEngine"); if (!AudioApp.waveformVisualizer) missing.push("waveformVisualizer"); if (!AudioApp.spectrogramVisualizer) missing.push("spectrogramVisualizer"); if (!AudioApp.vadAnalyzer) missing.push("vadAnalyzer"); if (!AudioApp.sileroWrapper) missing.push("sileroWrapper"); if (!AudioApp.Constants) missing.push("Constants"); if (!AudioApp.Utils) missing.push("Utils"); console.error(`AudioApp: CRITICAL - Required modules missing on AudioApp namespace: [${missing.join(', ')}]. Check script loading order.`); AudioApp.uiManager?.setFileInfo('left', "Initialization Error: Missing modules."); return; }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);
        AudioApp.uiManager.init();
        AudioApp.audioEngine.init();

        try { // Initialize Left Visualizers
            waveformVizLeft = AudioApp.waveformVisualizer;
            waveformVizLeft.init({ canvasId: 'waveformCanvas_left', indicatorId: 'waveformProgressIndicator_left' });
            specVizLeft = AudioApp.spectrogramVisualizer;
            specVizLeft.init({ canvasId: 'spectrogramCanvas_left', spinnerId: 'spectrogramSpinner_left', indicatorId: 'spectrogramProgressIndicator_left' });
            console.log("AudioApp: Left visualizer instances initialized.");
        } catch (vizError) { console.error("AudioApp: CRITICAL - Failed to initialize base visualizer instances:", vizError); AudioApp.uiManager?.setFileInfo('left', "Error: Visualizers failed to init."); }

        setupAppEventListeners();
        AudioApp.uiManager.resetUI();
        console.log("AudioApp: Initialized. Waiting for file...");
    }

    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() {
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
        document.addEventListener('audioapp:seekBarInput', handleSeek); // Use handleSeek directly
        document.addEventListener('audioapp:gainChanged', handleMasterGainChange);
        document.addEventListener('audioapp:thresholdChanged', handleThresholdChange);
        document.addEventListener('audioapp:keyPressed', handleKeyPress);
        document.addEventListener('audioapp:audioLoaded', handleAudioLoaded);
        document.addEventListener('audioapp:workletReady', handleWorkletReady);
        document.addEventListener('audioapp:decodingError', handleAudioError);
        document.addEventListener('audioapp:resamplingError', handleAudioError);
        document.addEventListener('audioapp:playbackError', handleAudioError);
        document.addEventListener('audioapp:engineError', handleAudioError);
        document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded);
        document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange);
        window.addEventListener('resize', handleWindowResize);
        window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Helper Functions ---
    function findTrackBySide(side) { return tracks.find(t => t.side === side); }
    function findTrackById(id) { return tracks.find(t => t.id === id); }
    function areAllActiveTracksReady() { if (!tracks[0]?.isReady) return false; if (multiTrackModeActive && !tracks[1]?.isReady) return false; return true; }
    function getReadyTrackCount() { return tracks.filter(t => t?.isReady).length; }


    // --- Event Handler Functions ---

    /** @param {CustomEvent<{file: File, trackId: 'left' | 'right'}>} e */
    async function handleFileSelected(e) {
        const { file, trackId: trackSide } = e.detail;
        const track = findTrackBySide(trackSide);
        if (!track) { console.error(`App: Invalid track side '${trackSide}' received.`); return; }
        if (!file) { console.log(`App: No file selected for track ${track.side}.`); return; }
        if (track.side === 'right' && !tracks[0]?.isReady) { console.warn(`App: Cannot load Right track until Left track is loaded and ready.`); AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return; }

        console.log(`App: File selected for track ${track.side} -`, file.name);
        Object.assign(track, createInitialTrackState(track.side), { file: file, isLoading: true });

        if (track.side === 'left') {
             console.log("App: Resetting global state and UI for Left track load.");
             stopUIUpdateLoop(); globalPlaybackState = 'stopped'; playbackStartTimeContext = null;
             playbackStartSourceTime = 0.0; currentGlobalSpeed = 1.0;
             if (tracks[1]?.audioBuffer || tracks[1]?.file) { await handleRemoveTrackInternal(); }
             AudioApp.uiManager.resetUI();
             waveformVizLeft?.clearVisuals(); specVizLeft?.clearVisuals();
        } else {
             AudioApp.uiManager.setFileInfo(track.side, `Loading: ${file.name}...`);
             AudioApp.uiManager.enableTrackControls(track.side, false);
             waveformVizRight?.clearVisuals(); specVizRight?.clearVisuals();
             multiTrackModeActive = true; // Set flag early
             AudioApp.uiManager.showMultiTrackUI(true); // Show UI skeleton early
        }
        AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);
        if (track.side === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); } // Keep disabled until ready
        try { await AudioApp.audioEngine.setupTrack(track.id, file); }
        catch (error) {
             console.error(`App: Error initiating file processing for track ${track.side} -`, error); track.isLoading = false; AudioApp.uiManager.setFileInfo(track.side, `Error loading: ${error.message}`);
             if (track.side === 'left') { AudioApp.uiManager.resetUI(); } else { AudioApp.uiManager.updateFileName(track.side, 'Load Error!'); }
             if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        }
    }

         // --- NEW HELPER FUNCTION ---
     /** Draws visuals for a specific track if its buffer and visualizer instance exist */
     async function drawTrackVisuals(track) {
         if (!track?.audioBuffer) {
             console.warn(`App: Cannot draw visuals for ${track?.side}, no audio buffer.`);
             return;
         }
         console.log(`App: Drawing/Redrawing visuals for track ${track.side}...`);
         try {
             const waveformViz = (track.side === 'left') ? waveformVizLeft : waveformVizRight;
             const specViz = (track.side === 'left') ? specVizLeft : specVizRight;
             const initialRegions = (track.side === 'left') ? (track.vad.results?.regions || []) : null; // Only use VAD regions for left

             if (waveformViz) {
                 await waveformViz.computeAndDrawWaveform(track.audioBuffer, initialRegions);
             } else { console.warn(`App: Waveform visualizer instance for ${track.side} not found during draw.`); }

             if (specViz) {
                 await specViz.computeAndDrawSpectrogram(track.audioBuffer);
             } else { console.warn(`App: Spectrogram visualizer instance for ${track.side} not found during draw.`); }
         } catch (visError) { console.error(`App: Error drawing visuals for track ${track.side}:`, visError); }
     }


     /** @param {CustomEvent<{audioBuffer: AudioBuffer, trackId: string}>} e */
    async function handleAudioLoaded(e) {
         const { audioBuffer, trackId } = e.detail;
         const track = findTrackById(trackId);
         if (!track || track.audioBuffer || !track.isLoading) { // Check if already loaded OR not loading
              console.warn(`App: handleAudioLoaded ignored for ${trackId}. Track removed, already loaded, or wasn't loading.`);
              return;
         }
         console.log(`App: Audio decoded for track ${track.side} (${audioBuffer.duration.toFixed(2)}s)`);
         track.audioBuffer = audioBuffer; track.isLoading = false;
         AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`);

         if (track.side === 'left') {
             const duration = audioBuffer.duration;
             AudioApp.uiManager.updateTimeDisplay(0, duration); AudioApp.uiManager.updateSeekBar(0);
             playbackStartSourceTime = 0.0;
             runVadInBackground(track);
             // Draw visuals for Left track now
             await drawTrackVisuals(track);
         } else {
             // For the right track, visuals are drawn after workletReady instantiates the viz objects
         }
         // Don't set pan here, do it in workletReady
    }

    /** @param {CustomEvent<{trackId: string}>} e */
    async function handleWorkletReady(e) { // Make async because we await drawTrackVisuals
        const trackId = e.detail.trackId;
        const track = findTrackById(trackId);
        if (!track || !track.audioBuffer) { console.warn(`App: Worklet ready for ${trackId}, but track/audioBuffer is missing. Ignoring.`); return; }

        console.log(`App: AudioWorklet processor is ready for track ${track.side}.`);
        track.isReady = true; track.isLoading = false; track.hasEnded = false;

        AudioApp.uiManager.enableTrackControls(track.side, true);
        AudioApp.audioEngine.setVolume(track.id, track.parameters.volume);
        AudioApp.audioEngine.setPan(track.id, track.parameters.pan);
        AudioApp.audioEngine.setTrackSpeed(track.id, track.parameters.speed);
        AudioApp.audioEngine.setTrackPitch(track.id, track.parameters.pitch);

        if (track.side === 'left') {
             AudioApp.uiManager.enableRightTrackLoadButton(true);
             if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
        }
        if (track.side === 'right') {
             multiTrackModeActive = true;
             if (!waveformVizRight || !specVizRight) { // Instantiate if needed
                  try {
                       console.log("App: Instantiating Right visualizer instances...");
                       waveformVizRight = AudioApp.waveformVisualizer;
                       waveformVizRight.init({ canvasId: 'waveformCanvas_right', indicatorId: 'waveformProgressIndicator_right' });
                       specVizRight = AudioApp.spectrogramVisualizer;
                       specVizRight.init({ canvasId: 'spectrogramCanvas_right', spinnerId: 'spectrogramSpinner_right', indicatorId: 'spectrogramProgressIndicator_right' });
                       // *** Draw visuals AFTER instances are created ***
                       await drawTrackVisuals(track); // Await drawing for the right track
                  } catch(vizError) { console.error("App: Failed to initialize/draw Right visualizers:", vizError); }
             } else {
                  // Instances already exist, maybe redraw if needed? Or assume drawn on load.
                   await drawTrackVisuals(track); // Redraw in case buffer changed?
             }
             AudioApp.uiManager.showMultiTrackUI(true);
             AudioApp.uiManager.enableSwapButton(true); AudioApp.uiManager.enableRemoveButton(true);
        }

        if (areAllActiveTracksReady()) {
             console.log("App: All active tracks are now ready.");
             AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true);
        } else {
             console.log("App: Waiting for other track(s) to become ready...");
             AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false);
        }
    }

    // --- Multi-Track Handlers ---
    async function handleRemoveTrack() { console.log("App: Remove Right track requested."); await handleRemoveTrackInternal(); }
    async function handleRemoveTrackInternal() {
        if (!tracks[1]) return; const trackId = tracks[1].id;
        await AudioApp.audioEngine.cleanupTrack(trackId);
        tracks[1] = createInitialTrackState('right'); multiTrackModeActive = false;
        waveformVizRight = null; specVizRight = null;
        AudioApp.uiManager.showMultiTrackUI(false);
        AudioApp.uiManager.enableRightTrackLoadButton(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
        if (tracks[0]?.isReady) { AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); }
        else { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log("App: Right track removed and UI reverted.");
    }
    function handleSwapTracks() { console.warn("Swap tracks not implemented yet."); }
    function handleLinkSpeedToggle(e) { speedLinked = e.detail.linked; console.log("App: SpeedLink set to", speedLinked); }
    function handleLinkPitchToggle(e) { pitchLinked = e.detail.linked; console.log("App: PitchLink set to", pitchLinked); }
    function handleVolumeChange(trackSide, volume) { console.warn("Volume change not implemented yet."); }
    function handleDelayChange(trackSide, valueStr) { console.warn("Delay change not implemented yet."); }
    function handleMuteToggle(trackSide) { console.warn("Mute toggle not implemented yet."); }
    function handleSoloToggle(trackSide) { console.warn("Solo toggle not implemented yet."); }

    // --- VAD Processing ---
    /** @param {TrackState} track */
    async function runVadInBackground(track) {
         if (track.side !== 'left' || !track.audioBuffer) return;
         if (!AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager || !AudioApp.waveformVisualizer) { console.error("App (VAD Task): Missing dependencies."); track.vad.isProcessing = false; return; }
         if (track.vad.isProcessing) { console.warn("App: VAD already running for Left track."); return; }
         track.vad.isProcessing = true; track.vad.results = null; let pcm16k = null; let vadSucceeded = false;
         AudioApp.uiManager.setFileInfo(track.side, `Processing VAD...`); AudioApp.uiManager.showVadProgress(true); AudioApp.uiManager.updateVadProgress(0);
         try {
             if (!vadModelReady) { vadModelReady = await AudioApp.sileroWrapper.create(AudioApp.Constants.VAD_SAMPLE_RATE); if (!vadModelReady) throw new Error("Failed VAD model create."); }
             pcm16k = await AudioApp.audioEngine.resampleTo16kMono(track.audioBuffer); if (!pcm16k || pcm16k.length === 0) throw new Error("Resampling yielded no data");
             const vadProgressCallback = (p) => { AudioApp.uiManager?.updateVadProgress(p.totalFrames > 0 ? (p.processedFrames / p.totalFrames) * 100 : 0); };
             track.vad.results = await AudioApp.vadAnalyzer.analyze(pcm16k, { onProgress: vadProgressCallback });
             const regions = track.vad.results.regions || []; console.log(`App (VAD Task): VAD done for Left. ${regions.length} regions.`);
             AudioApp.uiManager.updateVadDisplay(track.vad.results.initialPositiveThreshold, track.vad.results.initialNegativeThreshold);
             AudioApp.uiManager.setSpeechRegionsText(regions); if (track.isReady) AudioApp.uiManager.enableVadControls(true);
             // Redraw specific visualizer
             if(waveformVizLeft) waveformVizLeft.redrawWaveformHighlight(regions); // Use left instance
             AudioApp.uiManager.updateVadProgress(100); vadSucceeded = true;
         } catch (error) { console.error("App (VAD Task): Error -", error); AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`); AudioApp.uiManager.enableVadControls(false); AudioApp.uiManager.updateVadProgress(0); track.vad.results = null; }
         finally { track.vad.isProcessing = false; if (track.audioBuffer) AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`); }
    }

     /** @param {CustomEvent<{type?: string, error: Error, trackId?: string}>} e */
    function handleAudioError(e) {
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
         console.log("Handler called: handlePlayPause"); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; }
         const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AC missing."); return; }
         const isCurrentlyPlaying = (globalPlaybackState === 'playing'); const targetStatePlay = !isCurrentlyPlaying;
         if (targetStatePlay) {
              const targetGlobalTime = calculateEstimatedSourceTime(); console.log(`App: Play/Resume. Seeking active tracks to global time: ${targetGlobalTime.toFixed(3)} before playing.`);
              const trackSeekTimes = new Map();
              tracks.forEach(track => { if (track?.isReady) { const trackSeekTime = Math.max(0, targetGlobalTime - track.parameters.offsetSeconds); trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false; } });
              AudioApp.audioEngine.seekAllTracks(trackSeekTimes); playbackStartSourceTime = targetGlobalTime; playbackStartTimeContext = audioCtx.currentTime; AudioApp.audioEngine.togglePlayPause(true);
              globalPlaybackState = 'playing'; AudioApp.uiManager.setPlayButtonState(true); startUIUpdateLoop();
         } else {
              console.log(`App: Pausing requested.`); stopUIUpdateLoop(); playbackStartSourceTime = calculateEstimatedSourceTime(); playbackStartTimeContext = null; AudioApp.audioEngine.togglePlayPause(false);
              globalPlaybackState = 'paused'; AudioApp.uiManager.setPlayButtonState(false); updateUIWithTime(playbackStartSourceTime);
         }
    }

    /** @param {CustomEvent<{seconds: number}>} e */
    function handleJump(e) {
        console.log("Handler called: handleJump"); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return;
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return; const currentGlobalTime = calculateEstimatedSourceTime(); const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration)); handleSeekInternal(targetGlobalTime);
    }
    /** @param {CustomEvent<{fraction: number, sourceCanvasId?: string}>} e */
    function handleSeek(e) {
        console.log("Handler called: handleSeek", e.detail); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return;
        let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return;
        let targetGlobalTime = 0;
        if (e.detail.sourceCanvasId) {
             const side = e.detail.sourceCanvasId.includes('_right') ? 'right' : 'left'; const sourceTrack = findTrackBySide(side);
             if (sourceTrack?.audioBuffer) { const clickedTrackTargetTime = e.detail.fraction * sourceTrack.audioBuffer.duration; targetGlobalTime = clickedTrackTargetTime + sourceTrack.parameters.offsetSeconds; }
             else { return; }
        } else { targetGlobalTime = e.detail.fraction * maxDuration; }
        handleSeekInternal(targetGlobalTime);
    }

    /** Internal function to handle global seek logic */
    function handleSeekInternal(targetGlobalTime) {
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
        let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); });
        const clampedGlobalTime = Math.max(0, Math.min(targetGlobalTime, maxDuration));
        console.log(`App: Global seek requested to ${clampedGlobalTime.toFixed(3)}s`);
        const trackSeekTimes = new Map();
        tracks.forEach(track => { if (track?.isReady) { const trackSeekTime = Math.max(0, clampedGlobalTime - track.parameters.offsetSeconds); trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false; } });
        AudioApp.audioEngine.seekAllTracks(trackSeekTimes);
        playbackStartSourceTime = clampedGlobalTime;
        if (globalPlaybackState === 'playing') { playbackStartTimeContext = audioCtx.currentTime; }
        else { playbackStartTimeContext = null; updateUIWithTime(clampedGlobalTime); }
    }

    // --- Parameter Change Handlers ---
    /** @param {'left' | 'right'} trackSide @param {number} speed */
    function handleSpeedChange(trackSide, speed) {
        if (!speedLinked) { console.warn("App: Unlinked speed change not implemented yet."); return; }
        const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0));
        if (Math.abs(currentGlobalSpeed - newSpeed) < 1e-6) return;
        console.log(`App: Linked speed changed to ${newSpeed.toFixed(2)}x`);
        const oldGlobalSpeed = currentGlobalSpeed; currentGlobalSpeed = newSpeed;
        tracks.forEach(track => {
            if (track?.isReady) {
                 track.parameters.speed = newSpeed; AudioApp.audioEngine.setTrackSpeed(track.id, newSpeed);
                 // Update UI directly (setting slider value triggers 'input' which updates text)
                 const slider = document.getElementById(`speed_${track.side}`);
                 if (slider) slider.value = String(newSpeed); // This should trigger uiManager's listener
                 // REMOVED: AudioApp.uiManager.setSliderValue(...) call
            }
        });
        const audioCtx = AudioApp.audioEngine.getAudioContext();
        if (globalPlaybackState === 'playing' && playbackStartTimeContext !== null && audioCtx) {
             const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * oldGlobalSpeed;
             const previousSourceTime = playbackStartSourceTime + elapsedSourceTime;
             playbackStartSourceTime = previousSourceTime; playbackStartTimeContext = audioCtx.currentTime;
        }
        debouncedSyncEngine();
    }

    /** @param {'left' | 'right'} trackSide @param {number} pitch */
    function handlePitchChange(trackSide, pitch) { console.warn("Pitch change not implemented yet."); }
    /** @param {CustomEvent<{gain: number}>} e */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); }

    /** Syncs engine to main thread estimated time */
    function syncEngineToEstimatedTime() {
         if (!areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - tracks not ready."); return; }
         const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return;
         const targetGlobalTime = calculateEstimatedSourceTime();
         console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`);
         handleSeekInternal(targetGlobalTime);
    }

    /** @param {CustomEvent<{type: string, value: number}>} e */
    function handleThresholdChange(e) {
        const track = tracks[0]; if (!track || !track.vad.results || track.vad.isProcessing) return;
        const { type, value } = e.detail; const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value);
        AudioApp.uiManager.setSpeechRegionsText(newRegions);
        if(track.audioBuffer && waveformVizLeft) { waveformVizLeft.redrawWaveformHighlight(newRegions); }
    }

    /** @param {CustomEvent<{trackId: string}>} e */
    function handlePlaybackEnded(e) {
          const trackId = e.detail.trackId; const track = findTrackById(trackId); if (!track) return;
          console.log(`App: Playback ended event received for track ${track.side}.`); track.hasEnded = true;
          const activeTracks = tracks.filter(t => t?.isReady && !t.hasEnded && (multiTrackModeActive || t.side === 'left'));
          if (activeTracks.length === 0 && getReadyTrackCount() > 0) {
              console.log("App: All active tracks have ended."); globalPlaybackState = 'stopped'; stopUIUpdateLoop(); playbackStartTimeContext = null;
              let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); });
              playbackStartSourceTime = maxDuration; updateUIWithTime(maxDuration); AudioApp.uiManager.setPlayButtonState(false);
          }
    }

    /** @param {CustomEvent<{isPlaying: boolean, trackId: string}>} e */
    function handlePlaybackStateChange(e) { /* Informational */ }

    /** @param {CustomEvent<{key: string}>} e */
    function handleKeyPress(e) {
        console.log("Handler called: handleKeyPress", e.detail.key); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return;
        const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; }
    }
    /** @private */
    function handleBeforeUnload() { console.log("App: Unloading..."); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); }

    /** @private */
    function handleWindowResize() {
        const currentTime = calculateEstimatedSourceTime();
        waveformVizLeft?.resizeAndRedraw(); specVizLeft?.resizeAndRedraw();
        if (multiTrackModeActive) { waveformVizRight?.resizeAndRedraw(); specVizRight?.resizeAndRedraw(); }
        updateUIWithTime(currentTime); // Updates indicators
    }


    // --- Main Thread Time Calculation & UI Update ---
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }
    function calculateEstimatedSourceTime() { const audioCtx = AudioApp.audioEngine.getAudioContext(); let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (globalPlaybackState !== 'playing' || playbackStartTimeContext === null || !audioCtx || maxDuration <= 0) { return playbackStartSourceTime; } if (currentGlobalSpeed <= 0) { return playbackStartSourceTime; } const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * currentGlobalSpeed; let estimatedCurrentGlobalTime = playbackStartSourceTime + elapsedSourceTime; return estimatedCurrentGlobalTime; }

     /** Updates the time display, seek bar, drift, and visualization progress indicators. */
     function updateUIWithTime(globalTime) {
          let maxEffectiveDuration = 0; tracks.forEach(track => { if (track?.audioBuffer) { maxEffectiveDuration = Math.max(maxEffectiveDuration, track.parameters.offsetSeconds + track.audioBuffer.duration); } });
          if (isNaN(maxEffectiveDuration)) maxEffectiveDuration = 0;
          const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration));
          const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0;
          AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration);
          AudioApp.uiManager.updateSeekBar(fraction);
          AudioApp.uiManager.updateDriftDisplay(0); // Placeholder

          // --- Update Visualizer Progress Indicators ---
          // Left Track
          if (tracks[0]?.audioBuffer && waveformVizLeft) {
              waveformVizLeft.updateProgressIndicator(clampedGlobalTime, tracks[0].parameters.offsetSeconds, tracks[0].audioBuffer.duration);
          }
          if (tracks[0]?.audioBuffer && specVizLeft) {
              specVizLeft.updateProgressIndicator(clampedGlobalTime, tracks[0].parameters.offsetSeconds, tracks[0].audioBuffer.duration);
          }
          // Right Track (only if active and instance exists)
          if (multiTrackModeActive && tracks[1]?.audioBuffer && waveformVizRight) {
              waveformVizRight.updateProgressIndicator(clampedGlobalTime, tracks[1].parameters.offsetSeconds, tracks[1].audioBuffer.duration);
          }
          if (multiTrackModeActive && tracks[1]?.audioBuffer && specVizRight) {
              specVizRight.updateProgressIndicator(clampedGlobalTime, tracks[1].parameters.offsetSeconds, tracks[1].audioBuffer.duration);
          }
     }
    /** rAF loop function */
    function updateUIBasedOnContextTime(timestamp) { if (globalPlaybackState !== 'playing') { rAFUpdateHandle = null; return; } const estimatedGlobalTime = calculateEstimatedSourceTime(); updateUIWithTime(estimatedGlobalTime); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); }


    // --- Public Interface ---
    return { init: init };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---