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
    let waveformVizLeft = null; let specVizLeft = null; let waveformVizRight = null; let specVizRight = null;

    // --- Initialization ---
    /** @public */
    function init() {
        console.log("AudioApp: Initializing...");
        if (!AudioApp.uiManager || !AudioApp.audioEngine || !AudioApp.waveformVisualizer?.createInstance || !AudioApp.spectrogramVisualizer?.createInstance || !AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.Constants || !AudioApp.Utils)
        { let missing = []; if (!AudioApp.uiManager) missing.push("uiManager"); /* ... other checks ... */ console.error(`AudioApp: CRITICAL - Required modules/factories missing: [${missing.join(', ')}].`); AudioApp.uiManager?.setFileInfo('left', "Initialization Error: Missing modules."); return; }

        debouncedSyncEngine = AudioApp.Utils.debounce(syncEngineToEstimatedTime, SYNC_DEBOUNCE_WAIT_MS);
        AudioApp.uiManager.init(); AudioApp.audioEngine.init();

        try { // Init Left Viz
            waveformVizLeft = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_left', indicatorId: 'waveformProgressIndicator_left' });
            specVizLeft = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_left', spinnerId: 'spectrogramSpinner_left', indicatorId: 'spectrogramProgressIndicator_left' });
            console.log("AudioApp: Left visualizer instances created.");
        } catch (vizError) { console.error("AudioApp: CRITICAL - Failed to create visualizer instances:", vizError); AudioApp.uiManager?.setFileInfo('left', "Error: Visualizers failed to create."); }

        setupAppEventListeners(); AudioApp.uiManager.resetUI();
        console.log("AudioApp: Initialized. Waiting for file...");
    }

    // --- Event Listener Setup ---
    /** @private */
    function setupAppEventListeners() {
        document.addEventListener('audioapp:fileSelected', handleFileSelected); document.addEventListener('audioapp:removeTrackClicked', handleRemoveTrack); document.addEventListener('audioapp:swapTracksClicked', handleSwapTracks); document.addEventListener('audioapp:linkSpeedToggled', handleLinkSpeedToggle); document.addEventListener('audioapp:linkPitchToggled', handleLinkPitchToggle); document.addEventListener('audioapp:volumeChanged_left', (e) => handleVolumeChange('left', e.detail.volume)); document.addEventListener('audioapp:volumeChanged_right', (e) => handleVolumeChange('right', e.detail.volume)); document.addEventListener('audioapp:delayChanged_left', (e) => handleDelayChange('left', e.detail.value)); document.addEventListener('audioapp:delayChanged_right', (e) => handleDelayChange('right', e.detail.value)); document.addEventListener('audioapp:speedChanged_left', (e) => handleSpeedChange('left', e.detail.speed)); document.addEventListener('audioapp:speedChanged_right', (e) => handleSpeedChange('right', e.detail.speed)); document.addEventListener('audioapp:pitchChanged_left', (e) => handlePitchChange('left', e.detail.pitch)); document.addEventListener('audioapp:pitchChanged_right', (e) => handlePitchChange('right', e.detail.pitch)); document.addEventListener('audioapp:muteToggled_left', () => handleMuteToggle('left')); document.addEventListener('audioapp:muteToggled_right', () => handleMuteToggle('right')); document.addEventListener('audioapp:soloToggled_left', () => handleSoloToggle('left')); document.addEventListener('audioapp:soloToggled_right', () => handleSoloToggle('right')); document.addEventListener('audioapp:playPauseClicked', handlePlayPause); document.addEventListener('audioapp:jumpClicked', handleJump); document.addEventListener('audioapp:seekRequested', handleSeek); document.addEventListener('audioapp:seekBarInput', handleSeek); document.addEventListener('audioapp:gainChanged', handleMasterGainChange); document.addEventListener('audioapp:thresholdChanged', handleThresholdChange); document.addEventListener('audioapp:keyPressed', handleKeyPress); document.addEventListener('audioapp:audioLoaded', handleAudioLoaded); document.addEventListener('audioapp:workletReady', handleWorkletReady); document.addEventListener('audioapp:decodingError', handleAudioError); document.addEventListener('audioapp:resamplingError', handleAudioError); document.addEventListener('audioapp:playbackError', handleAudioError); document.addEventListener('audioapp:engineError', handleAudioError); document.addEventListener('audioapp:playbackEnded', handlePlaybackEnded); document.addEventListener('audioapp:playbackStateChanged', handlePlaybackStateChange); window.addEventListener('resize', handleWindowResize); window.addEventListener('beforeunload', handleBeforeUnload);
    }

    // --- Helper Functions ---
    function findTrackBySide(side) { return tracks.find(t => t.side === side); }
    function findTrackById(id) { return tracks.find(t => t.id === id); }
    function areAllActiveTracksReady() { if (!tracks[0]?.isReady) return false; if (multiTrackModeActive && !tracks[1]?.isReady) return false; return true; }
    function getReadyTrackCount() { return tracks.filter(t => t?.isReady).length; }

     /** Draws visuals for a specific track */
     async function drawTrackVisuals(track) {
         if (!track?.audioBuffer) { console.warn(`App: Cannot draw visuals for ${track?.side}, no buffer.`); return; }
         console.log(`App: Drawing/Redrawing visuals for ${track.side}...`);
         try {
             const waveformViz = (track.side === 'left') ? waveformVizLeft : waveformVizRight;
             const specViz = (track.side === 'left') ? specVizLeft : specVizRight;
             const initialRegions = (track.side === 'left') ? (track.vad.results?.regions || []) : null;
             if (waveformViz?.computeAndDrawWaveform) { await waveformViz.computeAndDrawWaveform(track.audioBuffer, initialRegions); }
             else { console.warn(`App: WF Viz for ${track.side} not available.`); }
             if (specViz?.computeAndDrawSpectrogram) { await specViz.computeAndDrawSpectrogram(track.audioBuffer); }
             else { console.warn(`App: Spec Viz for ${track.side} not available.`); }
         } catch (visError) { console.error(`App: Error drawing visuals for ${track.side}:`, visError); }
     }


    // --- Event Handler Functions ---

    /** @param {CustomEvent<{file: File, trackId: 'left' | 'right'}>} e */
    async function handleFileSelected(e) {
        const { file, trackId: trackSide } = e.detail; const track = findTrackBySide(trackSide); if (!track || !file) return; if (track.side === 'right' && !tracks[0]?.isReady) { console.warn(`App: Load Left first.`); AudioApp.uiManager.updateFileName('right', 'Load Left First!'); return; }
        console.log(`App: File selected for track ${track.side} -`, file.name);
        Object.assign(track, createInitialTrackState(track.side), { file: file, isLoading: true });
        if (track.side === 'left') {
             stopUIUpdateLoop(); globalPlaybackState = 'stopped'; playbackStartTimeContext = null; playbackStartSourceTime = 0.0; currentGlobalSpeed = 1.0;
             if (tracks[1]?.audioBuffer || tracks[1]?.file) { await handleRemoveTrackInternal(); }
             AudioApp.uiManager.resetUI(); waveformVizLeft?.clearVisuals(); specVizLeft?.clearVisuals();
        } else {
             AudioApp.uiManager.setFileInfo(track.side, `Loading: ${file.name}...`); AudioApp.uiManager.enableTrackControls(track.side, false);
             waveformVizRight?.clearVisuals(); specVizRight?.clearVisuals(); multiTrackModeActive = true; AudioApp.uiManager.showMultiTrackUI(true);
        }
        AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); if (track.side === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); }
        try { await AudioApp.audioEngine.setupTrack(track.id, file); }
        catch (error) { console.error(`App: Error initiating file processing for ${track.side}`, error); track.isLoading = false; AudioApp.uiManager.setFileInfo(track.side, `Error: ${error.message}`); if (track.side === 'left') { AudioApp.uiManager.resetUI(); } else { AudioApp.uiManager.updateFileName(track.side, 'Load Error!'); } if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); } }
    }

     /** @param {CustomEvent<{audioBuffer: AudioBuffer, trackId: string}>} e */
    async function handleAudioLoaded(e) {
         const { audioBuffer, trackId } = e.detail; const track = findTrackById(trackId);
         if (!track || track.audioBuffer || !track.isLoading) { console.warn(`App: handleAudioLoaded ignored for ${trackId}.`); return; }
         console.log(`App: Audio decoded for ${track.side}`); track.audioBuffer = audioBuffer; track.isLoading = false; AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file.name}`);
         if (track.side === 'left') {
             const duration = audioBuffer.duration; AudioApp.uiManager.updateTimeDisplay(0, duration); AudioApp.uiManager.updateSeekBar(0); playbackStartSourceTime = 0.0;
             runVadInBackground(track);
             await drawTrackVisuals(track); // Draw left visuals now
         } else { if (waveformVizRight && specVizRight) { await drawTrackVisuals(track); } } // Draw right only if viz exists
    }

    /** @param {CustomEvent<{trackId: string}>} e */
    async function handleWorkletReady(e) {
        const trackId = e.detail.trackId; const track = findTrackById(trackId); if (!track || !track.audioBuffer) { console.warn(`App: Worklet ready for ${trackId}, but track/buffer missing.`); return; }
        console.log(`App: Worklet ready for ${track.side}.`); track.isReady = true; track.isLoading = false; track.hasEnded = false;
        AudioApp.uiManager.enableTrackControls(track.side, true);
        AudioApp.audioEngine.setVolume(track.id, track.parameters.volume); AudioApp.audioEngine.setPan(track.id, track.parameters.pan); AudioApp.audioEngine.setTrackSpeed(track.id, track.parameters.speed); AudioApp.audioEngine.setTrackPitch(track.id, track.parameters.pitch);

        if (track.side === 'left') {
             AudioApp.uiManager.enableRightTrackLoadButton(true); if (track.vad.results && !track.vad.isProcessing) { AudioApp.uiManager.enableVadControls(true); }
        }
        if (track.side === 'right') {
             multiTrackModeActive = true;
             if (!waveformVizRight) { try { waveformVizRight = AudioApp.waveformVisualizer.createInstance({ canvasId: 'waveformCanvas_right', indicatorId: 'waveformProgressIndicator_right' }); } catch(err) { console.error("Failed creating waveformVizRight", err); } }
             if (!specVizRight) { try { specVizRight = AudioApp.spectrogramVisualizer.createInstance({ canvasId: 'spectrogramCanvas_right', spinnerId: 'spectrogramSpinner_right', indicatorId: 'spectrogramProgressIndicator_right' }); } catch(err) { console.error("Failed creating specVizRight", err); } }
             AudioApp.uiManager.showMultiTrackUI(true); AudioApp.uiManager.enableSwapButton(true); AudioApp.uiManager.enableRemoveButton(true);
             await drawTrackVisuals(track); // Draw Right visuals now
        }

        if (areAllActiveTracksReady()) { console.log("App: All active tracks ready."); AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); }
        else { console.log("App: Waiting for other track(s)."); AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
    }

    // --- Multi-Track Handlers ---
    async function handleRemoveTrack() { console.log("App: Remove Right track requested."); await handleRemoveTrackInternal(); }
    async function handleRemoveTrackInternal() {
        if (!tracks[1]) return; const trackId = tracks[1].id;
        await AudioApp.audioEngine.cleanupTrack(trackId); tracks[1] = createInitialTrackState('right'); multiTrackModeActive = false;
        waveformVizRight = null; specVizRight = null; AudioApp.uiManager.showMultiTrackUI(false);
        AudioApp.uiManager.enableRightTrackLoadButton(true); AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false);
        if (tracks[0]?.isReady) { AudioApp.uiManager.enablePlaybackControls(true); AudioApp.uiManager.enableSeekBar(true); }
        else { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
        console.log("App: Right track removed.");
    }
    function handleSwapTracks() { console.warn("Swap tracks not implemented yet."); }
    function handleLinkSpeedToggle(e) { speedLinked = e.detail.linked; console.log("App: SpeedLink set to", speedLinked); AudioApp.uiManager.setLinkButtonState(AudioApp.linkSpeedButton, speedLinked); } // Update UI button state
    function handleLinkPitchToggle(e) { pitchLinked = e.detail.linked; console.log("App: PitchLink set to", pitchLinked); AudioApp.uiManager.setLinkButtonState(AudioApp.linkPitchButton, pitchLinked); } // Update UI button state

    /** Handler for individual track volume changes */
    function handleVolumeChange(trackSide, volume) {
         const track = findTrackBySide(trackSide);
         if (!track || !track.isReady) return; // Ignore if track not ready
         const newVolume = Math.max(0, Math.min(parseFloat(volume) || 1.0, 1.5)); // Clamp 0-1.5
         console.log(`App: Volume change for ${trackSide} to ${newVolume.toFixed(2)}`);
         track.parameters.volume = newVolume;
         AudioApp.audioEngine.setVolume(track.id, newVolume);
         // TODO: Add Mute/Solo interaction logic here later
         // E.g., if volume > 0, ensure mute button is not disabled?
    }

     /** Handler for individual track delay input changes */
     function handleDelayChange(trackSide, valueStr) {
         const track = findTrackBySide(trackSide);
         if (!track) return;
         const newOffsetSeconds = AudioApp.uiManager.parseDelayInput(valueStr); // Use parser
         if (isNaN(newOffsetSeconds)) {
              console.warn(`App: Invalid delay input for ${trackSide}: "${valueStr}"`);
              // Optionally reset UI input to previous valid value
              AudioApp.uiManager.setDelayValue(trackSide, track.parameters.offsetSeconds);
              return;
         }
         if (track.parameters.offsetSeconds !== newOffsetSeconds) {
              console.log(`App: Delay change for ${trackSide} to ${newOffsetSeconds.toFixed(3)}s`);
              track.parameters.offsetSeconds = newOffsetSeconds;
              // Update UI to show potentially formatted value
              AudioApp.uiManager.setDelayValue(trackSide, newOffsetSeconds);
              // No automatic seek on delay change for now. Seek/Play will use new offset.
         }
     }

    function handleMuteToggle(trackSide) { console.warn("Mute toggle not implemented yet."); }
    function handleSoloToggle(trackSide) { console.warn("Solo toggle not implemented yet."); }

    // --- VAD Processing ---
    /** @param {TrackState} track */
    async function runVadInBackground(track) {
        if (track.side !== 'left' || !track.audioBuffer || !waveformVizLeft) return;
        if (!AudioApp.vadAnalyzer || !AudioApp.sileroWrapper || !AudioApp.audioEngine || !AudioApp.uiManager) { console.error("App (VAD Task): Missing dependencies."); track.vad.isProcessing = false; return; }
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
            waveformVizLeft.redrawWaveformHighlight(regions); // Use instance method
            AudioApp.uiManager.updateVadProgress(100); vadSucceeded = true;
        } catch (error) { console.error("App (VAD Task): Error -", error); AudioApp.uiManager.setSpeechRegionsText(`VAD Error: ${error.message}`); AudioApp.uiManager.enableVadControls(false); AudioApp.uiManager.updateVadProgress(0); track.vad.results = null; }
        finally { track.vad.isProcessing = false; if (track.audioBuffer) AudioApp.uiManager.setFileInfo(track.side, `Ready: ${track.file ? track.file.name : 'Unknown'}`); }
    }

     /** @param {CustomEvent<{type?: string, error: Error, trackId?: string}>} e */
    function handleAudioError(e) {
        const errorType = e.detail.type || 'Unknown'; const errorMessage = e.detail.error ? e.detail.error.message : 'An unknown error occurred'; const trackId = e.detail.trackId; const track = findTrackById(trackId); const trackSide = track ? track.side : 'global'; console.error(`App: Audio Error - Track: ${trackSide}, Type: ${errorType}, Msg: ${errorMessage}`, e.detail.error); if (track) { track.isLoading = false; track.isReady = false; AudioApp.uiManager.setFileInfo(track.side, `Error (${errorType})`); AudioApp.uiManager.enableTrackControls(track.side, false); if (track.side === 'right') { AudioApp.uiManager.enableSwapButton(false); AudioApp.uiManager.enableRemoveButton(false); } } else { stopUIUpdateLoop(); AudioApp.uiManager.resetUI(); tracks.forEach(t => { Object.assign(t, createInitialTrackState(t.side)); }); multiTrackModeActive = false; globalPlaybackState = 'stopped'; waveformVizLeft?.clearVisuals(); specVizLeft?.clearVisuals(); waveformVizRight = null; specVizRight = null; } if (!areAllActiveTracksReady()) { AudioApp.uiManager.enablePlaybackControls(false); AudioApp.uiManager.enableSeekBar(false); }
    }


    // --- Global Playback Handlers ---
    function handlePlayPause() {
         console.log("Handler called: handlePlayPause"); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) { console.warn("App: Play/Pause ignored - Tracks not ready."); return; }
         const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) { console.error("App: AC missing."); return; } const isCurrentlyPlaying = (globalPlaybackState === 'playing'); const targetStatePlay = !isCurrentlyPlaying;
         if (targetStatePlay) { const targetGlobalTime = calculateEstimatedSourceTime(); console.log(`App: Play/Resume. Seeking to ${targetGlobalTime.toFixed(3)}s`); const trackSeekTimes = new Map(); tracks.forEach(track => { if (track?.isReady) { const trackSeekTime = Math.max(0, targetGlobalTime - track.parameters.offsetSeconds); trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false; } }); AudioApp.audioEngine.seekAllTracks(trackSeekTimes); playbackStartSourceTime = targetGlobalTime; playbackStartTimeContext = audioCtx.currentTime; AudioApp.audioEngine.togglePlayPause(true); globalPlaybackState = 'playing'; AudioApp.uiManager.setPlayButtonState(true); startUIUpdateLoop(); }
         else { console.log(`App: Pausing requested.`); stopUIUpdateLoop(); playbackStartSourceTime = calculateEstimatedSourceTime(); playbackStartTimeContext = null; AudioApp.audioEngine.togglePlayPause(false); globalPlaybackState = 'paused'; AudioApp.uiManager.setPlayButtonState(false); updateUIWithTime(playbackStartSourceTime); }
    }

    /** @param {CustomEvent<{seconds: number}>} e */
    function handleJump(e) { console.log("Handler called: handleJump"); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return; const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return; const currentGlobalTime = calculateEstimatedSourceTime(); const targetGlobalTime = Math.max(0, Math.min(currentGlobalTime + e.detail.seconds, maxDuration)); handleSeekInternal(targetGlobalTime); }
    /** @param {CustomEvent<{fraction: number, sourceCanvasId?: string}>} e */
    function handleSeek(e) { console.log("Handler called: handleSeek", e.detail); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (isNaN(maxDuration) || maxDuration <= 0) return; let targetGlobalTime = 0; if (e.detail.sourceCanvasId) { const side = e.detail.sourceCanvasId.includes('_right') ? 'right' : 'left'; const sourceTrack = findTrackBySide(side); if (sourceTrack?.audioBuffer) { const clickedTrackTargetTime = e.detail.fraction * sourceTrack.audioBuffer.duration; targetGlobalTime = clickedTrackTargetTime + sourceTrack.parameters.offsetSeconds; } else { return; } } else { targetGlobalTime = e.detail.fraction * maxDuration; } handleSeekInternal(targetGlobalTime); }

    /** Internal function to handle global seek logic */
    function handleSeekInternal(targetGlobalTime) {
        const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); const clampedGlobalTime = Math.max(0, Math.min(targetGlobalTime, maxDuration)); console.log(`App: Global seek requested to ${clampedGlobalTime.toFixed(3)}s`); const trackSeekTimes = new Map(); tracks.forEach(track => { if (track?.isReady) { const trackSeekTime = Math.max(0, clampedGlobalTime - track.parameters.offsetSeconds); trackSeekTimes.set(track.id, trackSeekTime); track.hasEnded = false; } }); AudioApp.audioEngine.seekAllTracks(trackSeekTimes); playbackStartSourceTime = clampedGlobalTime; if (globalPlaybackState === 'playing') { playbackStartTimeContext = audioCtx.currentTime; } else { playbackStartTimeContext = null; updateUIWithTime(clampedGlobalTime); }
    }

    // --- Parameter Change Handlers ---
    /** @param {'left' | 'right'} trackSide @param {number} speed */
    function handleSpeedChange(trackSide, speed) {
        if (speedLinked) {
            const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0)); if (Math.abs(currentGlobalSpeed - newSpeed) < 1e-6) return;
            console.log(`App: Linked speed changed to ${newSpeed.toFixed(2)}x`); const oldGlobalSpeed = currentGlobalSpeed; currentGlobalSpeed = newSpeed;
            tracks.forEach(track => {
                if (track?.isReady) { track.parameters.speed = newSpeed; AudioApp.audioEngine.setTrackSpeed(track.id, newSpeed); const slider = document.getElementById(`speed_${track.side}`); if (slider) slider.value = String(newSpeed); }
            });
            const audioCtx = AudioApp.audioEngine.getAudioContext(); if (globalPlaybackState === 'playing' && playbackStartTimeContext !== null && audioCtx) { const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * oldGlobalSpeed; const previousSourceTime = playbackStartSourceTime + elapsedSourceTime; playbackStartSourceTime = previousSourceTime; playbackStartTimeContext = audioCtx.currentTime; }
            debouncedSyncEngine();
        } else {
             // --- IMPLEMENT UNLINKED SPEED (Individual track update) ---
             const track = findTrackBySide(trackSide); if (!track || !track.isReady) return;
             const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0));
             if (Math.abs(track.parameters.speed - newSpeed) < 1e-6) return; // No change for this track
             console.log(`App: Unlinked speed for track ${track.side} changed to ${newSpeed.toFixed(2)}x`);
             track.parameters.speed = newSpeed;
             AudioApp.audioEngine.setTrackSpeed(track.id, newSpeed);
             // Note: No time base adjustment or debounced sync needed for unlinked changes? Or maybe sync only the affected track? Defer complexity.
             // We also need to decide how global time estimation works with unlinked speeds - using currentGlobalSpeed (1.0?) might be wrong.
             console.warn("App: Unlinked speed change applied, but global time estimation might be inaccurate.");
        }
    }

    /** @param {'left' | 'right'} trackSide @param {number} pitch */
    function handlePitchChange(trackSide, pitch) {
         const newPitch = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0));
         if (pitchLinked) {
              console.log(`App: Linked pitch changed to ${newPitch.toFixed(2)}x`);
              tracks.forEach(track => {
                  if (track?.isReady) {
                       track.parameters.pitch = newPitch; AudioApp.audioEngine.setTrackPitch(track.id, newPitch);
                       const slider = document.getElementById(`pitch_${track.side}`); if (slider) slider.value = String(newPitch);
                  }
              });
         } else {
              const track = findTrackBySide(trackSide); if (!track || !track.isReady) return;
              if (Math.abs(track.parameters.pitch - newPitch) < 1e-6) return;
              console.log(`App: Unlinked pitch for track ${track.side} changed to ${newPitch.toFixed(2)}x`);
              track.parameters.pitch = newPitch; AudioApp.audioEngine.setTrackPitch(track.id, newPitch);
         }
         // No debounced sync typically needed for pitch
    }

    /** @param {CustomEvent<{gain: number}>} e */
    function handleMasterGainChange(e) { AudioApp.audioEngine?.setGain(e.detail.gain); }

    /** Syncs engine to main thread estimated time */
    function syncEngineToEstimatedTime() { if (!areAllActiveTracksReady()) { console.log("App (Debounced Sync): Skipping sync - tracks not ready."); return; } const audioCtx = AudioApp.audioEngine.getAudioContext(); if (!audioCtx) return; const targetGlobalTime = calculateEstimatedSourceTime(); console.log(`App: Debounced sync executing. Seeking engine globally to estimated time: ${targetGlobalTime.toFixed(3)}.`); handleSeekInternal(targetGlobalTime); }

    /** @param {CustomEvent<{type: string, value: number}>} e */
    function handleThresholdChange(e) { const track = tracks[0]; if (!track || !track.vad.results || track.vad.isProcessing) return; const { type, value } = e.detail; const newRegions = AudioApp.vadAnalyzer.handleThresholdUpdate(type, value); AudioApp.uiManager.setSpeechRegionsText(newRegions); if(track.audioBuffer && waveformVizLeft) { waveformVizLeft.redrawWaveformHighlight(newRegions); } }

    /** @param {CustomEvent<{trackId: string}>} e */
    function handlePlaybackEnded(e) { const trackId = e.detail.trackId; const track = findTrackById(trackId); if (!track) return; console.log(`App: Playback ended event received for track ${track.side}.`); track.hasEnded = true; const activeTracks = tracks.filter(t => t?.isReady && !t.hasEnded && (multiTrackModeActive || t.side === 'left')); if (activeTracks.length === 0 && getReadyTrackCount() > 0) { console.log("App: All active tracks have ended."); globalPlaybackState = 'stopped'; stopUIUpdateLoop(); playbackStartTimeContext = null; let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); playbackStartSourceTime = maxDuration; updateUIWithTime(maxDuration); AudioApp.uiManager.setPlayButtonState(false); } }

    /** @param {CustomEvent<{isPlaying: boolean, trackId: string}>} e */
    function handlePlaybackStateChange(e) { /* Informational */ }

    /** @param {CustomEvent<{key: string}>} e */
    function handleKeyPress(e) { console.log("Handler called: handleKeyPress", e.detail.key); const readyCheck = areAllActiveTracksReady(); console.log(`  - areAllActiveTracksReady: ${readyCheck}`); if (!readyCheck) return; const key = e.detail.key; const jumpTimeValue = AudioApp.uiManager.getJumpTime(); switch (key) { case 'Space': handlePlayPause(); break; case 'ArrowLeft': handleJump({ detail: { seconds: -jumpTimeValue } }); break; case 'ArrowRight': handleJump({ detail: { seconds: jumpTimeValue } }); break; } }
    /** @private */
    function handleBeforeUnload() { console.log("App: Unloading..."); stopUIUpdateLoop(); AudioApp.audioEngine?.cleanup(); }

    /** @private */
    function handleWindowResize() { const currentTime = calculateEstimatedSourceTime(); waveformVizLeft?.resizeAndRedraw(); specVizLeft?.resizeAndRedraw(); if (multiTrackModeActive) { waveformVizRight?.resizeAndRedraw(); specVizRight?.resizeAndRedraw(); } updateUIWithTime(currentTime); }


    // --- Main Thread Time Calculation & UI Update ---
    function startUIUpdateLoop() { if (rAFUpdateHandle === null) { rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); } }
    function stopUIUpdateLoop() { if (rAFUpdateHandle !== null) { cancelAnimationFrame(rAFUpdateHandle); rAFUpdateHandle = null; } }
    function calculateEstimatedSourceTime() { const audioCtx = AudioApp.audioEngine.getAudioContext(); let maxDuration = 0; tracks.forEach(t => { if(t?.audioBuffer) maxDuration = Math.max(maxDuration, t.parameters.offsetSeconds + t.audioBuffer.duration); }); if (globalPlaybackState !== 'playing' || playbackStartTimeContext === null || !audioCtx || maxDuration <= 0) { return playbackStartSourceTime; } if (currentGlobalSpeed <= 0) { return playbackStartSourceTime; } const elapsedContextTime = audioCtx.currentTime - playbackStartTimeContext; const elapsedSourceTime = elapsedContextTime * currentGlobalSpeed; let estimatedCurrentGlobalTime = playbackStartSourceTime + elapsedSourceTime; return estimatedCurrentGlobalTime; }

     /** Updates the time display, seek bar, drift, and visualization progress indicators. */
     function updateUIWithTime(globalTime) {
          let maxEffectiveDuration = 0; tracks.forEach(track => { if (track?.audioBuffer) { maxEffectiveDuration = Math.max(maxEffectiveDuration, track.parameters.offsetSeconds + track.audioBuffer.duration); } }); if (isNaN(maxEffectiveDuration)) maxEffectiveDuration = 0; const clampedGlobalTime = Math.max(0, Math.min(globalTime, maxEffectiveDuration)); const fraction = maxEffectiveDuration > 0 ? clampedGlobalTime / maxEffectiveDuration : 0;
          AudioApp.uiManager.updateTimeDisplay(clampedGlobalTime, maxEffectiveDuration); AudioApp.uiManager.updateSeekBar(fraction); AudioApp.uiManager.updateDriftDisplay(0); // Placeholder
          // Update Visualizer Progress Indicators
          const leftTrack = tracks[0]; if (leftTrack?.audioBuffer && waveformVizLeft?.updateProgressIndicator) { waveformVizLeft.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } if (leftTrack?.audioBuffer && specVizLeft?.updateProgressIndicator) { specVizLeft.updateProgressIndicator(clampedGlobalTime, leftTrack.parameters.offsetSeconds, leftTrack.audioBuffer.duration); } const rightTrack = tracks[1]; if (multiTrackModeActive && rightTrack?.audioBuffer && waveformVizRight?.updateProgressIndicator) { waveformVizRight.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); } if (multiTrackModeActive && rightTrack?.audioBuffer && specVizRight?.updateProgressIndicator) { specVizRight.updateProgressIndicator(clampedGlobalTime, rightTrack.parameters.offsetSeconds, rightTrack.audioBuffer.duration); }
     }
    /** rAF loop function */
    function updateUIBasedOnContextTime(timestamp) { if (globalPlaybackState !== 'playing') { rAFUpdateHandle = null; return; } const estimatedGlobalTime = calculateEstimatedSourceTime(); updateUIWithTime(estimatedGlobalTime); rAFUpdateHandle = requestAnimationFrame(updateUIBasedOnContextTime); }


    // --- Public Interface ---
    return { init: init };
})(); // End of AudioApp IIFE
// --- /vibe-player/js/app.js ---
