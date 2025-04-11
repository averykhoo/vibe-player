// --- /vibe-player/js/player/audioEngine.js ---
// Manages Web Audio API, AudioWorklet loading/communication, decoding, resampling, and playback control.
// Uses Rubberband WASM via an AudioWorkletProcessor for time-stretching and pitch shifting.
// REFACTORED to use numeric trackIndex and ensure WASM resources are ready before track setup.

var AudioApp = AudioApp || {};

AudioApp.audioEngine = (function () {
    'use strict';

    // === Web Audio API State ===
    let audioCtx = null;
    let masterGainNode = null;
    /** @type {Map<number, TrackNodes>} */
    let trackNodesMap = new Map();

    // --- Worklet State ---
    let workletModuleAdded = false;

    // --- WASM Resources ---
    let wasmBinary = null;
    let loaderScriptText = null;

    // ** NEW: Promise for Resource Readiness **
    let resourceReadyPromise = null;
    let resolveResourceReady = null;
    let rejectResourceReady = null;

    /** Initializes the resource readiness promise */
    function initializeResourcePromise() {
        resourceReadyPromise = new Promise((resolve, reject) => {
            resolveResourceReady = resolve;
            rejectResourceReady = reject;
        });
        // Handle cases where resources might already be loaded if init is called multiple times
        if (wasmBinary && loaderScriptText) {
            resolveResourceReady();
        }
    }
    initializeResourcePromise(); // Create the promise immediately

    // === Initialization ===
    /**
     * Initializes the Audio Engine. Creates AudioContext, fetches WASM resources asynchronously.
     * @public
     */
    async function init() {
        console.log("AudioEngine: Initializing...");
        setupAudioContext(); // Sync setup
        // Start fetching resources, but don't await here. Let setupTrack await the promise.
        preFetchWorkletResources().catch(err => {
             // Error is handled within preFetch, which rejects the promise
             console.error("AudioEngine: init() caught resource fetch error (should also be in promise).", err);
        });
        // Module adding will be attempted within setupTrack after resources are ready
        console.log("AudioEngine: Initialization sequence started (resource fetching in background).");
    }

    // === Setup & Resource Fetching ===

    /** Creates or resets the AudioContext and Master GainNode. */
    function setupAudioContext() { /* ... (Implementation unchanged) ... */
        if (audioCtx && audioCtx.state !== 'closed') { return true; }
        try { if (audioCtx && audioCtx.state === 'closed') { console.log("AudioEngine: Recreating closed AudioContext."); cleanupAllTracks(); } audioCtx = new (window.AudioContext || window.webkitAudioContext)(); masterGainNode = audioCtx.createGain(); masterGainNode.gain.value = 1.0; masterGainNode.connect(audioCtx.destination); workletModuleAdded = false; console.log(`AudioEngine: AudioContext created/reset (state: ${audioCtx.state}). Sample Rate: ${audioCtx.sampleRate}`); if (audioCtx.state === 'suspended') { console.warn("AudioEngine: AudioContext is suspended. User interaction needed."); } return true;
        } catch (e) { console.error("AudioEngine: Failed to create AudioContext.", e); audioCtx = null; masterGainNode = null; workletModuleAdded = false; dispatchEngineEvent('audioapp:engineError', { type: 'context', error: new Error("Web Audio API not supported") }); return false; }
    }

    /**
     * Fetches WASM binary and loader script. Resolves/Rejects the resourceReadyPromise.
     * @private
     */
    async function preFetchWorkletResources() {
        // Ensure promise exists
        if (!resourceReadyPromise) initializeResourcePromise();

        // Avoid fetching again if already done
        if (wasmBinary && loaderScriptText) {
             console.log("AudioEngine: WASM resources already fetched.");
             if (resolveResourceReady) resolveResourceReady(); // Ensure promise is resolved
             return;
        }

        console.log("AudioEngine: Pre-fetching WASM resources...");
        try {
            if (!AudioApp.Constants) throw new Error("AudioApp.Constants not found.");
            const wasmResponse = await fetch(AudioApp.Constants.WASM_BINARY_URL);
            if (!wasmResponse.ok) throw new Error(`Fetch failed ${wasmResponse.status} for ${AudioApp.Constants.WASM_BINARY_URL}`);
            const fetchedWasmBinary = await wasmResponse.arrayBuffer();

            const loaderResponse = await fetch(AudioApp.Constants.LOADER_SCRIPT_URL);
            if (!loaderResponse.ok) throw new Error(`Fetch failed ${loaderResponse.status} for ${AudioApp.Constants.LOADER_SCRIPT_URL}`);
            const fetchedLoaderScript = await loaderResponse.text();

            // Store resources *after* both fetches succeed
            wasmBinary = fetchedWasmBinary;
            loaderScriptText = fetchedLoaderScript;

            console.log(`AudioEngine: Fetched WASM binary (${wasmBinary?.byteLength || 0} bytes), Loader (${loaderScriptText?.length || 0} chars).`);
            // Resolve the readiness promise
            if(resolveResourceReady) resolveResourceReady();

        } catch (fetchError) {
            console.error("AudioEngine: Failed to fetch WASM/Loader resources:", fetchError);
            wasmBinary = null; loaderScriptText = null;
            dispatchEngineEvent('audioapp:engineError', { type: 'resource', error: fetchError });
            // Reject the readiness promise
            if(rejectResourceReady) rejectResourceReady(fetchError);
        }
    }

    /** Adds the Rubberband AudioWorklet module if preconditions are met. */
    async function addWorkletModule() { /* ... (Implementation unchanged) ... */
        if (workletModuleAdded) return true; if (!audioCtx || audioCtx.state === 'closed' || !wasmBinary || !loaderScriptText) { console.warn("AudioEngine: Cannot add worklet module - prerequisites missing (Context/WASM/Loader)."); return false; } if (audioCtx.state === 'suspended') { console.log("AudioEngine: Deferring addModule until context is resumed."); return false; } try { console.log(`[AudioEngine] Adding AudioWorklet module: ${AudioApp.Constants.PROCESSOR_SCRIPT_URL}`); await audioCtx.audioWorklet.addModule(AudioApp.Constants.PROCESSOR_SCRIPT_URL); console.log("[AudioEngine] AudioWorklet module added successfully."); workletModuleAdded = true; return true; } catch (error) { console.error("[AudioEngine] Error adding AudioWorklet module:", error); workletModuleAdded = false; dispatchEngineEvent('audioapp:engineError', { type: 'workletLoad', error: error }); return false; }
    }

    // --- Track Setup, Loading, Decoding ---

    /**
     * Creates audio graph nodes, decodes audio, sets up the worklet for a specific track index.
     * **Awaits resource readiness** before proceeding.
     * @param {number} trackIndex - The numeric index for the track.
     * @param {File} file - The audio file for this track.
     * @public
     */
    async function setupTrack(trackIndex, file) {
        console.log(`AudioEngine: Setting up track index #${trackIndex}...`);

        // *** NEW: Wait for WASM resources ***
        try {
            console.log(`AudioEngine: Awaiting WASM resource readiness for track #${trackIndex}...`);
            await resourceReadyPromise; // Wait for the promise to resolve
            console.log(`AudioEngine: WASM resources ready for track #${trackIndex}.`);
        } catch (resourceError) {
            console.error(`AudioEngine: Cannot setup track #${trackIndex}, resource loading failed.`, resourceError);
            // Dispatch specific error? The fetch error was already dispatched.
            throw new Error(`Failed to load WASM resources needed for track setup: ${resourceError.message}`);
        }
        // *** END NEW ***

        // 1. Ensure Context is Ready (WASM resources checked above)
        if (!audioCtx || audioCtx.state === 'closed') { if (!setupAudioContext()) throw new Error(`AudioContext failed for track #${trackIndex}`); }
        if (audioCtx.state === 'suspended') { await resumeContextIfNeeded(`Context resume needed for track #${trackIndex} setup.`); }

        // 2. Ensure Worklet Module is Added (Attempt now if needed)
        if (!workletModuleAdded) { if (!(await addWorkletModule())) throw new Error(`Failed to add AudioWorklet module for track #${trackIndex}`); }

        // 3. Cleanup any existing nodes for this trackIndex first
        await cleanupTrack(trackIndex);

        // 4. Decode Audio
        let decodedBuffer;
        try { /* ... (Decoding logic unchanged) ... */
            console.log(`AudioEngine: Decoding audio data for track #${trackIndex}...`); const arrayBuffer = await file.arrayBuffer(); decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer); console.log(`AudioEngine: Decoded track #${trackIndex} (${decodedBuffer.duration.toFixed(2)}s @ ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch)`); dispatchEngineEvent('audioapp:audioLoaded', { audioBuffer: decodedBuffer, trackId: trackIndex });
        } catch (error) { /* ... (Error handling unchanged) ... */ console.error(`AudioEngine: Error decoding audio for track #${trackIndex}:`, error); dispatchEngineEvent('audioapp:decodingError', { error: error, trackId: trackIndex }); throw error; }

        // 5. Create Audio Graph Nodes
        console.log(`AudioEngine: Creating audio nodes for track #${trackIndex}...`);
        let nodes = {};
        try { /* ... (Node creation logic unchanged) ... */
            nodes.pannerNode = audioCtx.createStereoPanner(); nodes.volumeGainNode = audioCtx.createGain(); nodes.muteGainNode = audioCtx.createGain(); nodes.pannerNode.pan.value = 0; nodes.volumeGainNode.gain.value = 1.0; nodes.muteGainNode.gain.value = 1.0;
            // Use module-scoped wasmBinary and loaderScriptText which are now guaranteed to be loaded
            const processorOpts = { sampleRate: audioCtx.sampleRate, numberOfChannels: decodedBuffer.numberOfChannels, wasmBinary: wasmBinary.slice(0), loaderScriptText: loaderScriptText, trackId: trackIndex };
            nodes.workletNode = new AudioWorkletNode(audioCtx, AudioApp.Constants.PROCESSOR_NAME, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [decodedBuffer.numberOfChannels], processorOptions: processorOpts });
            nodes.workletNode.connect(nodes.pannerNode); nodes.pannerNode.connect(nodes.volumeGainNode); nodes.volumeGainNode.connect(nodes.muteGainNode); nodes.muteGainNode.connect(masterGainNode);
            console.log(`AudioEngine: Audio graph created and connected for track #${trackIndex}.`);
            trackNodesMap.set(trackIndex, nodes);
            setupWorkletMessageHandler(nodes.workletNode, trackIndex);

            // 6. Send Audio Data to Worklet
            const channelData = []; const transferListAudio = [];
            for (let i = 0; i < decodedBuffer.numberOfChannels; i++) { const dataArray = decodedBuffer.getChannelData(i); const bufferCopy = dataArray.buffer.slice(dataArray.byteOffset, dataArray.byteOffset + dataArray.byteLength); channelData.push(bufferCopy); transferListAudio.push(bufferCopy); }
            console.log(`AudioEngine: Sending audio data (${channelData.length} channels) to worklet #${trackIndex}...`);
            postWorkletMessage(nodes.workletNode, { type: 'load-audio', channelData: channelData }, transferListAudio);
            console.log(`AudioEngine: Setup complete for track #${trackIndex}. Waiting for processor-ready...`);

        } catch (error) { /* ... (Error handling unchanged) ... */
             console.error(`AudioEngine: Error creating/connecting nodes for track #${trackIndex}:`, error); await cleanupTrack(trackIndex); dispatchEngineEvent('audioapp:engineError', { type: 'nodeSetup', error: error, trackId: trackIndex }); throw error;
        }
    }

    /** Sets up message handling for a specific worklet node. */
    function setupWorkletMessageHandler(workletNode, trackIndex) { /* ... (Implementation unchanged, expects numeric IDs) ... */
        if (!workletNode || !workletNode.port) { console.error(`[AudioEngine] Cannot setup message handler for track #${trackIndex}: Node or port missing.`); return; }
        workletNode.port.onmessage = (event) => { const data = event.data; const messageTrackId = (typeof data.trackId === 'number') ? data.trackId : trackIndex; switch (data.type) { case 'status': console.log(`[WorkletStatus #${messageTrackId}] ${data.message}`); if (data.message === 'processor-ready') { dispatchEngineEvent('audioapp:workletReady', { trackId: messageTrackId }); } else if (data.message === 'Playback ended') { dispatchEngineEvent('audioapp:playbackEnded', { trackId: messageTrackId }); } break; case 'error': console.error(`[WorkletError #${messageTrackId}] ${data.message}`); dispatchEngineEvent('audioapp:engineError', { type: 'workletRuntime', error: new Error(data.message), trackId: messageTrackId }); break; case 'playback-state': dispatchEngineEvent('audioapp:playbackStateChanged', { isPlaying: data.isPlaying, trackId: messageTrackId }); break; case 'time-update': if (typeof data.currentTime === 'number') { dispatchEngineEvent('audioapp:timeUpdated', { currentTime: data.currentTime, trackId: messageTrackId }); } else { console.warn(`[AudioEngine] Received malformed time-update from #${messageTrackId}:`, data); } break; default: console.warn(`[AudioEngine] Unhandled message from worklet #${messageTrackId}:`, data.type); } };
        workletNode.onprocessorerror = (event) => { console.error(`[AudioEngine] Critical Processor Error for track #${trackIndex}:`, event); dispatchEngineEvent('audioapp:engineError', { type: 'workletProcessor', error: new Error("Processor crashed"), trackId: trackIndex }); cleanupTrack(trackIndex); }; console.log(`AudioEngine: Message handler set up for track #${trackIndex}.`);
    }

    /** Safely posts messages to a specific worklet via its numeric trackIndex. */
    function postMessageToTrack(trackIndex, message, transferList = []) { /* ... (Implementation unchanged) ... */
        const nodes = trackNodesMap.get(trackIndex); if (nodes && nodes.workletNode) { postWorkletMessage(nodes.workletNode, message, transferList); } else { if (message.type !== 'cleanup' && message.type !== 'load-audio') { console.warn(`[AudioEngine] Cannot post msg (${message.type}) to track #${trackIndex}: Worklet node not found.`); } }
    }
    /** Helper to post messages safely. */
    function postWorkletMessage(workletNode, message, transferList = []) { /* ... (Implementation unchanged, error logging uses index if possible) ... */
        if (workletNode && workletNode.port) { try { workletNode.port.postMessage(message, transferList); } catch (error) { let errorTrackIndex = -1; for (const [index, nodes] of trackNodesMap.entries()) { if (nodes.workletNode === workletNode) { errorTrackIndex = index; break; } } console.error(`[AudioEngine] Error posting message type ${message?.type} to track #${errorTrackIndex}:`, error); dispatchEngineEvent('audioapp:engineError', {type: 'workletComm', error: error, trackId: errorTrackIndex}); } }
    }
    /** Public wrapper for resampling. */
    async function resampleTo16kMono(audioBuffer) { /* ... (Implementation unchanged) ... */
        console.log("AudioEngine: Resampling audio to 16kHz mono..."); try { const pcm16k = await convertAudioBufferTo16kHzMonoFloat32(audioBuffer); console.log(`AudioEngine: Resampled to ${pcm16k.length} samples @ 16kHz`); return pcm16k; } catch (error) { console.error("AudioEngine: Error during public resampling call:", error); dispatchEngineEvent('audioapp:resamplingError', {error: error, trackId: -1 }); throw error; }
    }
    /** Internal resampling function. */
    function convertAudioBufferTo16kHzMonoFloat32(audioBuffer) { /* ... (Implementation unchanged) ... */
        if (!AudioApp.Constants) { return Promise.reject(new Error("AudioApp.Constants not found for resampling.")); } const targetSampleRate = AudioApp.Constants.VAD_SAMPLE_RATE; const targetLength = Math.ceil(audioBuffer.duration * targetSampleRate); if (!targetLength || targetLength <= 0) { return Promise.resolve(new Float32Array(0)); } try { const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate); const src = offlineCtx.createBufferSource(); src.buffer = audioBuffer; src.connect(offlineCtx.destination); src.start(); return offlineCtx.startRendering().then(renderedBuffer => renderedBuffer.getChannelData(0)).catch(err => { throw new Error(`Audio resampling failed: ${err.message}`); }); } catch (offlineCtxError) { return Promise.reject(new Error(`OfflineContext creation failed: ${offlineCtxError.message}`)); }
    }

    // --- Playback Control Methods (Public - Using numeric index) ---
    /** Sends pause command to all managed tracks. */
    function togglePlayPause(play) { /* ... (Implementation unchanged, iterates map) ... */
        if (play) { console.warn("AudioEngine: togglePlayPause(true) called, but app.js should use playTrack() for starting playback."); } else { const messageType = 'pause'; console.log(`AudioEngine: Sending '${messageType}' to all managed tracks.`); trackNodesMap.forEach((nodes, trackIndex) => { postMessageToTrack(trackIndex, {type: messageType}); }); }
    }
    /** Seeks all tracks based on a map of track indices to target times. */
     function seekAllTracks(trackSeekTimes) { /* ... (Implementation unchanged, uses numeric index) ... */
          console.log(`AudioEngine: seekAllTracks received Map:`); trackSeekTimes.forEach((time, index) => { console.log(`  - #${index}: ${time.toFixed(3)}s`); }); trackSeekTimes.forEach((targetSourceTime, trackIndex) => { seekTrack(trackIndex, targetSourceTime); });
     }
     /** Seeks a specific track (by index) to a target source time. */
     function seekTrack(trackIndex, targetSourceTime) { /* ... (Implementation unchanged, uses numeric index) ... */
          const clampedTime = Math.max(0, targetSourceTime); console.log(`AudioEngine: Seeking track #${trackIndex} WORKLET to ${clampedTime.toFixed(3)}s`); postMessageToTrack(trackIndex, { type: 'seek', positionSeconds: clampedTime });
     }
    /** Plays a specific track (by index). */
    function playTrack(trackIndex) { /* ... (Implementation unchanged, uses numeric index) ... */
        console.log(`AudioEngine: Sending 'play' to track #${trackIndex}`); postMessageToTrack(trackIndex, {type: 'play'});
    }
    /** Pauses a specific track (by index). */
    function pauseTrack(trackIndex) { /* ... (Implementation unchanged, uses numeric index) ... */
        console.log(`AudioEngine: Sending 'pause' to track #${trackIndex}`); postMessageToTrack(trackIndex, {type: 'pause'});
    }
    /** Sets the playback speed for a specific track (by index). */
    function setTrackSpeed(trackIndex, speed) { /* ... (Implementation unchanged, uses numeric index) ... */
        const rate = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0)); console.log(`AudioEngine: Setting speed for track #${trackIndex} to ${rate.toFixed(2)}x`); postMessageToTrack(trackIndex, {type: 'set-speed', value: rate});
    }
    /** Sets the pitch scale for a specific track (by index). */
    function setTrackPitch(trackIndex, pitch) { /* ... (Implementation unchanged, uses numeric index) ... */
        const scale = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0)); console.log(`AudioEngine: Setting pitch for track #${trackIndex} to ${scale.toFixed(2)}x`); postMessageToTrack(trackIndex, {type: 'set-pitch', value: scale});
    }
    /** Sets the formant scale for a specific track (by index). */
    function setTrackFormant(trackIndex, formant) { /* ... (Implementation unchanged, uses numeric index) ... */
        const scale = Math.max(0.5, Math.min(parseFloat(formant) || 1.0, 2.0)); console.log(`AudioEngine: Setting formant for track #${trackIndex} to ${scale.toFixed(2)}x`); postMessageToTrack(trackIndex, {type: 'set-formant', value: scale});
    }
    /** Sets the stereo pan for a specific track (by index). */
    function setPan(trackIndex, panValue) { /* ... (Implementation unchanged, uses numeric index) ... */
        const nodes = trackNodesMap.get(trackIndex); if (nodes?.pannerNode && audioCtx && audioCtx.state === 'running') { const value = Math.max(-1, Math.min(parseFloat(panValue) || 0, 1)); console.log(`AudioEngine: Setting pan for track #${trackIndex} to ${value.toFixed(2)}`); nodes.pannerNode.pan.setValueAtTime(value, audioCtx.currentTime); } else { console.warn(`AudioEngine: Cannot set pan for track #${trackIndex} - PannerNode/Context not ready.`); }
    }
    /** Sets the individual volume gain for a specific track (by index). */
    function setVolume(trackIndex, volume) { /* ... (Implementation unchanged, uses numeric index) ... */
        const nodes = trackNodesMap.get(trackIndex); if (nodes?.volumeGainNode && audioCtx && audioCtx.state === 'running') { const value = Math.max(0.0, parseFloat(volume) || 1.0); console.log(`AudioEngine: Setting volume for track #${trackIndex} to ${value.toFixed(2)}`); nodes.volumeGainNode.gain.setTargetAtTime(value, audioCtx.currentTime, 0.015); } else { console.warn(`AudioEngine: Cannot set volume for track #${trackIndex} - VolumeGainNode/Context not ready.`); }
    }
    /** Sets the mute state for a specific track (by index). */
    function setMute(trackIndex, isMuted) { /* ... (Implementation unchanged, uses numeric index) ... */
        const nodes = trackNodesMap.get(trackIndex); if (nodes?.muteGainNode && audioCtx && audioCtx.state === 'running') { const targetGain = isMuted ? 1e-7 : 1.0; console.log(`AudioEngine: Setting mute for track #${trackIndex} to ${isMuted} (Target Gain: ${targetGain})`); nodes.muteGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.010); } else { console.warn(`AudioEngine: Cannot set mute for track #${trackIndex} - MuteGainNode/Context not ready.`); }
    }
    /** Sets the master gain level smoothly. */
    function setGain(gain) { /* ... (Implementation unchanged) ... */
        console.log(`AudioEngine: setGain received input: ${gain} (Type: ${typeof gain})`); if (!masterGainNode || !audioCtx || audioCtx.state === 'closed') { console.warn("AudioEngine: Cannot set master gain - MasterGainNode/Context missing or closed."); return; } const MIN_GAIN = 0.0; const MAX_GAIN = 2.0; const RAMP_TIME_CONSTANT = 0.015; let parsedGain = parseFloat(gain); if (isNaN(parsedGain)) { console.warn(`AudioEngine: Invalid gain input '${gain}', defaulting to 1.0`); parsedGain = 1.0; } const clampedGain = Math.max(MIN_GAIN, Math.min(parsedGain, MAX_GAIN)); const targetGainValue = (clampedGain <= 0) ? 1e-7 : clampedGain; console.log(`AudioEngine: Setting master gain. Parsed: ${parsedGain}, Clamped: ${clampedGain}, Target: ${targetGainValue}`); try { masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime); masterGainNode.gain.setTargetAtTime(targetGainValue, audioCtx.currentTime, RAMP_TIME_CONSTANT); } catch (e) { console.error(`AudioEngine: Error setting master gain: ${e.message}`); }
    }
    /** Provides access to the current AudioContext instance. */
    function getAudioContext() { return audioCtx; }
    /** Resumes context if suspended. */
    async function resumeContextIfNeeded(reason = "Context resume needed.") { /* ... (Implementation unchanged) ... */
        if (audioCtx && audioCtx.state === 'suspended') { console.log(`AudioEngine: ${reason} Attempting resume...`); try { await audioCtx.resume(); console.log(`AudioEngine: Context resumed (state: ${audioCtx.state})`); if (!workletModuleAdded) { await addWorkletModule(); } } catch (err) { console.error(`AudioEngine: Failed to resume AC: ${err}`); dispatchEngineEvent('audioapp:engineError', {type: 'contextResume', error: err}); throw err; } }
    }

    // --- Cleanup ---
    /** Cleans up resources for a specific track by its numeric index. */
    async function cleanupTrack(trackIndex) { /* ... (Implementation unchanged, uses numeric index) ... */
        const nodes = trackNodesMap.get(trackIndex); if (!nodes) return; console.log(`AudioEngine: Cleaning up nodes for track #${trackIndex}...`); if (nodes.workletNode) { postMessageToTrack(trackIndex, {type: 'cleanup'}); await new Promise(resolve => setTimeout(resolve, 50)); } try { if (nodes.muteGainNode) nodes.muteGainNode.disconnect(); if (nodes.volumeGainNode) nodes.volumeGainNode.disconnect(); if (nodes.pannerNode) nodes.pannerNode.disconnect(); if (nodes.workletNode) { if (nodes.workletNode.port) nodes.workletNode.port.onmessage = null; nodes.workletNode.onprocessorerror = null; nodes.workletNode.disconnect(); } console.log(`AudioEngine: Nodes disconnected for track #${trackIndex}.`); } catch (e) { console.warn(`AudioEngine: Error during node disconnection for track #${trackIndex}:`, e); } trackNodesMap.delete(trackIndex); console.log(`AudioEngine: Track #${trackIndex} removed from map.`);
    }
    /** Cleans up all tracks. */
    async function cleanupAllTracks() { /* ... (Implementation unchanged, iterates map) ... */
        console.log("AudioEngine: Cleaning up all tracks..."); const cleanupPromises = []; trackNodesMap.forEach((nodes, trackIndex) => { cleanupPromises.push(cleanupTrack(trackIndex)); }); await Promise.all(cleanupPromises); console.log("AudioEngine: All tracks cleaned up.");
    }
    /** Global cleanup function for application exit. */
    async function cleanup() { /* ... (Implementation unchanged) ... */
        console.log("AudioEngine: Global cleanup requested..."); await cleanupAllTracks(); if (audioCtx && audioCtx.state !== 'closed') { try { await audioCtx.close(); console.log("AudioEngine: AudioContext closed."); } catch (e) { console.warn("AudioEngine: Error closing AudioContext:", e); } } audioCtx = null; masterGainNode = null; trackNodesMap.clear(); wasmBinary = null; loaderScriptText = null; workletModuleAdded = false; console.log("AudioEngine: Global cleanup finished.");
    }
    /** Dispatches events from the engine to the document. */
    function dispatchEngineEvent(eventName, detail = {}) { /* ... (Implementation unchanged, ensures numeric trackId) ... */
        if (typeof detail.trackId === 'string') { console.warn(`AudioEngine: Attempted to dispatch event ${eventName} with string trackId '${detail.trackId}'. Converting/Ignoring.`); detail.trackId = parseInt(detail.trackId, 10); if(isNaN(detail.trackId)) detail.trackId = -1; } document.dispatchEvent(new CustomEvent(eventName, {detail: detail}));
    }

    // --- Public Interface ---
    // (Interface remains the same, but methods now expect numeric indices)
    return { init, setupTrack, cleanupTrack, resampleTo16kMono, togglePlayPause, seekAllTracks, setGain, playTrack, pauseTrack, seekTrack, setTrackSpeed, setTrackPitch, setTrackFormant, setPan, setVolume, setMute, getAudioContext, cleanup };

})();
// --- /vibe-player/js/player/audioEngine.js ---