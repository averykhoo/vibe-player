// --- /vibe-player/js/player/audioEngine.js --- // Updated Path
// Manages Web Audio API, AudioWorklet loading/communication, decoding, resampling, and playback control.
// Uses Rubberband WASM via an AudioWorkletProcessor for time-stretching and pitch/formant shifting.
// ** MODIFIED FOR MULTI-TRACK SUPPORT **

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.audioEngine = (function () {
    'use strict';

    // === Web Audio API State ===
    /** @type {AudioContext|null} */ let audioCtx = null;
    /** @type {GainNode|null} */ let masterGainNode = null; // Renamed from gainNode

    /**
     * @typedef {object} TrackNodes
     * @property {AudioWorkletNode} workletNode
     * @property {StereoPannerNode} pannerNode
     * @property {GainNode} volumeGainNode
     * @property {GainNode} muteGainNode
     * // Add DelayNode here if it were used:
     * // @property {DelayNode} delayNode
     */

    /** @type {Map<string, TrackNodes>} Stores nodes associated with each trackId */
    let trackNodesMap = new Map();

    // --- Worklet State (Less state needed here now, managed per track or in app.js) ---
    // let isPlaying = false; // Global play state managed by app.js
    let workletModuleAdded = false; // Track if addModule has been done

    // --- WASM Resources ---
    /** @type {ArrayBuffer|null} */ let wasmBinary = null;
    /** @type {string|null} */ let loaderScriptText = null;

    // === Initialization ===
    /**
     * Initializes the Audio Engine.
     * @public
     */
    async function init() {
        console.log("AudioEngine: Initializing...");
        setupAudioContext(); // Creates context and masterGainNode
        await preFetchWorkletResources(); // Fetches WASM/Loader
        if (audioCtx && !workletModuleAdded) {
            await addWorkletModule(); // Add module once resources are ready
        }
        console.log("AudioEngine: Initialized.");
    }

    // === Setup & Resource Fetching ===

    /**
     * Creates/resets the AudioContext and Master GainNode.
     * @private
     * @returns {boolean} True if context is ready.
     */
    function setupAudioContext() {
        if (audioCtx && audioCtx.state !== 'closed') {
            return true;
        }
        try {
            if (audioCtx && audioCtx.state === 'closed') {
                console.log("AudioEngine: Recreating closed AudioContext.");
                cleanupAllTracks(); // Clean up nodes before recreating context
            }
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGainNode = audioCtx.createGain(); // Create Master Gain
            masterGainNode.gain.value = 1.0; // Default master gain
            masterGainNode.connect(audioCtx.destination); // Connect Master Gain to output

            workletModuleAdded = false; // Reset module loaded flag
            console.log(`AudioEngine: AudioContext created/reset (state: ${audioCtx.state}). Sample Rate: ${audioCtx.sampleRate}`);
            if (audioCtx.state === 'suspended') {
                console.warn("AudioEngine: AudioContext is suspended. User interaction needed.");
            }
            return true;
        } catch (e) {
            console.error("AudioEngine: Failed to create AudioContext.", e);
            audioCtx = null;
            masterGainNode = null;
            workletModuleAdded = false;
            dispatchEngineEvent('audioapp:engineError', {
                type: 'context',
                error: new Error("Web Audio API not supported")
            });
            return false;
        }
    }

    /** Fetches WASM resources (binary and loader script). */
    async function preFetchWorkletResources() {
        // ... (Implementation unchanged from previous version) ...
        console.log("AudioEngine: Pre-fetching WASM resources...");
        try {
            if (!AudioApp.Constants) {
                throw new Error("AudioApp.Constants not found.");
            }
            const wasmResponse = await fetch(AudioApp.Constants.WASM_BINARY_URL);
            if (!wasmResponse.ok) throw new Error(`Fetch failed ${wasmResponse.status} for ${AudioApp.Constants.WASM_BINARY_URL}`);
            wasmBinary = await wasmResponse.arrayBuffer();
            const loaderResponse = await fetch(AudioApp.Constants.LOADER_SCRIPT_URL);
            if (!loaderResponse.ok) throw new Error(`Fetch failed ${loaderResponse.status} for ${AudioApp.Constants.LOADER_SCRIPT_URL}`);
            loaderScriptText = await loaderResponse.text();
            console.log(`AudioEngine: Fetched WASM binary (${wasmBinary.byteLength} bytes), Loader (${loaderScriptText.length} chars).`);
        } catch (fetchError) {
            console.error("AudioEngine: Failed to fetch WASM/Loader resources:", fetchError);
            wasmBinary = null;
            loaderScriptText = null;
            dispatchEngineEvent('audioapp:engineError', {type: 'resource', error: fetchError});
        }
    }

    /** Adds the AudioWorklet module if not already added */
    async function addWorkletModule() {
        if (workletModuleAdded || !audioCtx || audioCtx.state === 'closed' || !wasmBinary || !loaderScriptText) {
            if (workletModuleAdded) console.log("AudioEngine: Worklet module already added.");
            else console.warn("AudioEngine: Cannot add worklet module - prerequisites missing.");
            return false; // Indicate module not added (or already present)
        }
        // Don't add if suspended, wait for resume
        if (audioCtx.state === 'suspended') {
            console.log("AudioEngine: Deferring addModule until context is resumed.");
            return false;
        }

        try {
            console.log(`[AudioEngine] Adding AudioWorklet module: ${AudioApp.Constants.PROCESSOR_SCRIPT_URL}`);
            await audioCtx.audioWorklet.addModule(AudioApp.Constants.PROCESSOR_SCRIPT_URL);
            console.log("[AudioEngine] AudioWorklet module added successfully.");
            workletModuleAdded = true;
            return true;
        } catch (error) {
            console.error("[AudioEngine] Error adding AudioWorklet module:", error);
            workletModuleAdded = false;
            dispatchEngineEvent('audioapp:engineError', {type: 'workletLoad', error: error});
            return false;
        }
    }

    // --- Track Setup, Loading, Decoding ---

    /**
     * Creates the audio graph and worklet node for a specific track,
     * decodes the audio file, and sends data to the worklet.
     * Replaces parts of the old loadAndProcessFile.
     * @param {string} trackId - The unique ID for the track (e.g., 'track_left').
     * @param {File} file - The audio file for this track.
     * @returns {Promise<void>} Resolves when setup is complete or rejects on error.
     * @throws {Error} If any critical step fails.
     * @public
     */
    async function setupTrack(trackId, file) {
        console.log(`AudioEngine: Setting up track ${trackId}...`);

        // 1. Ensure Context is Ready and Module Loaded
        if (!audioCtx || audioCtx.state === 'closed') {
            if (!setupAudioContext()) throw new Error(`AudioContext failed for track ${trackId}`);
        }
        if (audioCtx.state === 'suspended') {
            await resumeContextIfNeeded(`Context resume needed for track ${trackId} setup.`);
        }
        if (!workletModuleAdded) {
            if (!(await addWorkletModule())) { // Try adding module now
                throw new Error(`Failed to add AudioWorklet module for track ${trackId}`);
            }
        }
        if (!wasmBinary || !loaderScriptText) {
            throw new Error(`Cannot setup Worklet for ${trackId}: WASM/Loader resources missing.`);
        }

        // 2. Cleanup any existing nodes for this trackId first
        await cleanupTrack(trackId);

        // 3. Decode Audio
        let decodedBuffer;
        try {
            console.log(`AudioEngine: Decoding audio data for ${trackId}...`);
            const arrayBuffer = await file.arrayBuffer();
            decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            console.log(`AudioEngine: Decoded ${trackId} (${decodedBuffer.duration.toFixed(2)}s @ ${decodedBuffer.sampleRate}Hz, ${decodedBuffer.numberOfChannels}ch)`);
            dispatchEngineEvent('audioapp:audioLoaded', {audioBuffer: decodedBuffer, trackId: trackId});
        } catch (error) {
            console.error(`AudioEngine: Error decoding audio for ${trackId}:`, error);
            dispatchEngineEvent('audioapp:decodingError', {error: error, trackId: trackId});
            throw error; // Re-throw for app.js
        }

        // 4. Create Audio Graph Nodes
        console.log(`AudioEngine: Creating audio nodes for ${trackId}...`);
        let nodes = {};
        try {
            nodes.pannerNode = audioCtx.createStereoPanner();
            nodes.volumeGainNode = audioCtx.createGain();
            nodes.muteGainNode = audioCtx.createGain();
            // Default settings
            nodes.pannerNode.pan.value = 0; // Initial center pan
            nodes.volumeGainNode.gain.value = 1.0; // Initial volume
            nodes.muteGainNode.gain.value = 1.0; // Initial unmute

            // Create Worklet Node
            const processorOpts = {
                sampleRate: audioCtx.sampleRate,
                numberOfChannels: decodedBuffer.numberOfChannels,
                wasmBinary: wasmBinary.slice(0), // Transfer copy
                loaderScriptText: loaderScriptText,
                trackId: trackId // Pass trackId to processor
            };
            nodes.workletNode = new AudioWorkletNode(audioCtx, AudioApp.Constants.PROCESSOR_NAME, {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [decodedBuffer.numberOfChannels],
                processorOptions: processorOpts
            });

            // Connect Graph: Worklet -> Panner -> Volume -> Mute -> MasterGain -> Destination
            nodes.workletNode.connect(nodes.pannerNode);
            nodes.pannerNode.connect(nodes.volumeGainNode);
            nodes.volumeGainNode.connect(nodes.muteGainNode);
            nodes.muteGainNode.connect(masterGainNode); // Connect to MASTER gain

            console.log(`AudioEngine: Audio graph created and connected for ${trackId}.`);

            // Store nodes
            trackNodesMap.set(trackId, nodes);

            // Setup message/error handlers for the new worklet node
            setupWorkletMessageHandler(nodes.workletNode, trackId);

            // 5. Send Audio Data to Worklet
            const channelData = [];
            const transferListAudio = [];
            for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                const dataArray = decodedBuffer.getChannelData(i);
                const bufferCopy = dataArray.buffer.slice(dataArray.byteOffset, dataArray.byteOffset + dataArray.byteLength);
                channelData.push(bufferCopy);
                transferListAudio.push(bufferCopy);
            }
            console.log(`AudioEngine: Sending audio data to worklet ${trackId}...`);
            postWorkletMessage(nodes.workletNode, {type: 'load-audio', channelData: channelData}, transferListAudio);
            console.log(`AudioEngine: Setup complete for ${trackId}. Waiting for processor-ready...`);

        } catch (error) {
            console.error(`AudioEngine: Error creating/connecting nodes for ${trackId}:`, error);
            // Cleanup nodes created so far for this track if error occurs mid-setup
            await cleanupTrack(trackId); // This will disconnect/nullify
            dispatchEngineEvent('audioapp:engineError', {type: 'nodeSetup', error: error, trackId: trackId});
            throw error; // Re-throw for app.js
        }
    }

    /** Sets up message handling for a specific worklet node */
    function setupWorkletMessageHandler(workletNode, trackId) {
        if (!workletNode || !workletNode.port) {
            console.error(`[AudioEngine] Cannot setup message handler for ${trackId}: Node or port missing.`);
            return;
        }

        workletNode.port.onmessage = (event) => {
            const data = event.data;
            // Ensure message includes trackId (it should, from modified processor)
            const messageTrackId = data.trackId || trackId; // Fallback to function arg

            switch (data.type) {
                case 'status':
                    console.log(`[WorkletStatus ${messageTrackId}] ${data.message}`);
                    if (data.message === 'processor-ready') {
                        dispatchEngineEvent('audioapp:workletReady', {trackId: messageTrackId});
                    } else if (data.message === 'Playback ended') {
                        dispatchEngineEvent('audioapp:playbackEnded', {trackId: messageTrackId});
                    } // Processor cleaned up status is just logged
                    break;
                case 'error':
                    console.error(`[WorkletError ${messageTrackId}] ${data.message}`);
                    dispatchEngineEvent('audioapp:engineError', {
                        type: 'workletRuntime',
                        error: new Error(data.message),
                        trackId: messageTrackId
                    });
                    // Let app.js handle marking track as not ready
                    break;
                case 'playback-state':
                    dispatchEngineEvent('audioapp:playbackStateChanged', {
                        isPlaying: data.isPlaying,
                        trackId: messageTrackId
                    });
                    break;
                case 'time-update':
                    // Dispatch event with trackId so app.js can store time per track if needed later,
                    // although global time is primary for UI now.
                    // Maybe not needed if app.js doesn't use it? Keep for potential future use/debug.
                    // dispatchEngineEvent('audioapp:timeUpdated', { currentTime: data.currentTime, trackId: messageTrackId });
                    break;
                default:
                    console.warn(`[AudioEngine] Unhandled message from worklet ${messageTrackId}:`, data.type);
            }
        };

        workletNode.onprocessorerror = (event) => {
            console.error(`[AudioEngine] Critical Processor Error for ${trackId}:`, event);
            dispatchEngineEvent('audioapp:engineError', {
                type: 'workletProcessor',
                error: new Error("Processor crashed"),
                trackId: trackId
            });
            cleanupTrack(trackId); // Attempt cleanup
        };
        console.log(`AudioEngine: Message handler set up for ${trackId}.`);
    }


    /** Safely posts messages to a specific worklet via trackId */
    function postMessageToTrack(trackId, message, transferList = []) {
        const nodes = trackNodesMap.get(trackId);
        if (nodes && nodes.workletNode) {
            postWorkletMessage(nodes.workletNode, message, transferList);
        } else {
            // Don't warn during cleanup or initial load
            if (message.type !== 'cleanup' && message.type !== 'load-audio') {
                console.warn(`[AudioEngine] Cannot post msg (${message.type}) to ${trackId}: Worklet node not found.`);
            }
        }
    }

    /** Helper to post messages safely (implementation unchanged) */
    function postWorkletMessage(workletNode, message, transferList = []) {
        if (workletNode && workletNode.port) {
            try {
                workletNode.port.postMessage(message, transferList);
            } catch (error) {
                console.error(`[AudioEngine] Error posting message type ${message?.type}:`, error);
                const trackId = message?.trackId || 'unknown'; // Try to get trackId from message
                dispatchEngineEvent('audioapp:engineError', {type: 'workletComm', error: error, trackId: trackId});
                // Attempt cleanup? More complex. Let app.js handle track state.
            }
        } // else: warning handled in postMessageToTrack
    }

    /** Public wrapper for resampling (implementation unchanged) */
    async function resampleTo16kMono(audioBuffer) {
        // ... (Keep implementation from previous version) ...
        console.log("AudioEngine: Resampling audio to 16kHz mono...");
        try {
            const pcm16k = await convertAudioBufferTo16kHzMonoFloat32(audioBuffer);
            console.log(`AudioEngine: Resampled to ${pcm16k.length} samples @ 16kHz`);
            return pcm16k;
        } catch (error) {
            console.error("AudioEngine: Error during public resampling call:", error);
            dispatchEngineEvent('audioapp:resamplingError', {error: error}); // No trackId here?
            throw error;
        }
    }

    /** Internal resampling function (implementation unchanged) */
    function convertAudioBufferTo16kHzMonoFloat32(audioBuffer) {
        // ... (Keep implementation from previous version) ...
        if (!AudioApp.Constants) {
            return Promise.reject(new Error("AudioApp.Constants not found for resampling."));
        }
        const targetSampleRate = AudioApp.Constants.VAD_SAMPLE_RATE;
        const targetLength = Math.ceil(audioBuffer.duration * targetSampleRate);
        if (!targetLength || targetLength <= 0) {
            return Promise.resolve(new Float32Array(0));
        }
        try {
            const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
            const src = offlineCtx.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(offlineCtx.destination);
            src.start();
            return offlineCtx.startRendering().then(renderedBuffer => {
                return renderedBuffer.getChannelData(0);
            }).catch(err => {
                throw new Error(`Audio resampling failed: ${err.message}`);
            });
        } catch (offlineCtxError) {
            return Promise.reject(new Error(`OfflineContext creation failed: ${offlineCtxError.message}`));
        }
    }


    // --- Playback Control Methods (Public - Adapted for Multi-Track) ---

    /**
     * Toggles playback for all currently active/managed tracks.
     * Assumes app.js handles readiness checks and context resuming.
     * @param {boolean} play - True to play, false to pause.
     * @public
     */
    function togglePlayPause(play) {
        const messageType = play ? 'play' : 'pause';
        console.log(`AudioEngine: Sending '${messageType}' to all managed tracks.`);
        trackNodesMap.forEach((nodes, trackId) => {
            postMessageToTrack(trackId, {type: messageType});
        });
    }

    /**
     * Seeks all tracks to positions relative to a global target time, respecting offsets.
     * Called by app.js after calculating the global target time.
     * @param {Map<string, number>} trackSeekTimes - Map of { trackId: targetSourceTime }
     * @public
     */
    function seekAllTracks(trackSeekTimes) {
        console.log(`AudioEngine: Seeking multiple tracks...`, trackSeekTimes);
        trackSeekTimes.forEach((targetSourceTime, trackId) => {
            seekTrack(trackId, targetSourceTime); // Use individual seek function
        });
    }

    // --- NEW Track-Specific Control Methods ---

    /**
     * Seeks a specific track to a target source time.
     * @param {string} trackId
     * @param {number} targetSourceTime
     * @public
     */
    function seekTrack(trackId, targetSourceTime) {
        const nodes = trackNodesMap.get(trackId);
        const duration = nodes?.workletNode?.bufferDuration; // Need way to get duration if buffer isn't stored here
        // We might need to pass duration or get it from app.js? Assume valid time for now.
        const clampedTime = Math.max(0, targetSourceTime); // Basic clamping
        console.log(`AudioEngine: Seeking track ${trackId} to ${clampedTime.toFixed(3)}s`);
        postMessageToTrack(trackId, {type: 'seek', positionSeconds: clampedTime});
    }

    /**
     * Plays a specific track (sends 'play' message).
     * @param {string} trackId
     * @public
     */
    function playTrack(trackId) {
        console.log(`AudioEngine: Sending 'play' to track ${trackId}`);
        postMessageToTrack(trackId, {type: 'play'});
    }

    /**
     * Pauses a specific track (sends 'pause' message).
     * @param {string} trackId
     * @public
     */
    function pauseTrack(trackId) {
        console.log(`AudioEngine: Sending 'pause' to track ${trackId}`);
        postMessageToTrack(trackId, {type: 'pause'});
    }


    /**
     * Sets the playback speed for a specific track.
     * @param {string} trackId
     * @param {number} speed - The desired playback speed (e.g., 1.0 is normal).
     * @public
     */
    function setTrackSpeed(trackId, speed) {
        const rate = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0));
        console.log(`AudioEngine: Setting speed for track ${trackId} to ${rate.toFixed(2)}x`);
        postMessageToTrack(trackId, {type: 'set-speed', value: rate});
    }

    /**
     * Sets the pitch scale for a specific track.
     * @param {string} trackId
     * @param {number} pitch - The desired pitch scale.
     * @public
     */
    function setTrackPitch(trackId, pitch) {
        const scale = Math.max(0.25, Math.min(parseFloat(pitch) || 1.0, 2.0));
        console.log(`AudioEngine: Setting pitch for track ${trackId} to ${scale.toFixed(2)}x`);
        postMessageToTrack(trackId, {type: 'set-pitch', value: scale});
    }

    /**
     * Sets the formant scale for a specific track.
     * @param {string} trackId
     * @param {number} formant - The desired formant scale.
     * @public
     */
    function setTrackFormant(trackId, formant) {
        const scale = Math.max(0.5, Math.min(parseFloat(formant) || 1.0, 2.0));
        console.log(`AudioEngine: Setting formant for track ${trackId} to ${scale.toFixed(2)}x`);
        postMessageToTrack(trackId, {type: 'set-formant', value: scale});
    }

    /**
     * Sets the stereo pan for a specific track.
     * @param {string} trackId
     * @param {number} panValue - Pan value (-1 Left, 0 Center, 1 Right).
     * @public
     */
    function setPan(trackId, panValue) {
        const nodes = trackNodesMap.get(trackId);
        if (nodes?.pannerNode && audioCtx && audioCtx.state === 'running') {
            const value = Math.max(-1, Math.min(parseFloat(panValue) || 0, 1));
            console.log(`AudioEngine: Setting pan for track ${trackId} to ${value.toFixed(2)}`);
            // Use setTargetAtTime for smooth pan transition if desired, or just set value
            nodes.pannerNode.pan.setValueAtTime(value, audioCtx.currentTime);
        } else {
            console.warn(`AudioEngine: Cannot set pan for ${trackId} - PannerNode/Context not ready.`);
        }
    }

    /**
     * Sets the individual volume for a specific track.
     * @param {string} trackId
     * @param {number} volume - Volume level (e.g., 0.0 to 1.5+).
     * @public
     */
    function setVolume(trackId, volume) {
        const nodes = trackNodesMap.get(trackId);
        if (nodes?.volumeGainNode && audioCtx && audioCtx.state === 'running') {
            const value = Math.max(0.0, parseFloat(volume) || 1.0); // Allow gain > 1
            console.log(`AudioEngine: Setting volume for track ${trackId} to ${value.toFixed(2)}`);
            nodes.volumeGainNode.gain.setTargetAtTime(value, audioCtx.currentTime, 0.015); // Smooth transition
        } else {
            console.warn(`AudioEngine: Cannot set volume for ${trackId} - VolumeGainNode/Context not ready.`);
        }
    }

    /**
     * Sets the mute state for a specific track.
     * @param {string} trackId
     * @param {boolean} isMuted - True to mute, false to unmute.
     * @public
     */
    function setMute(trackId, isMuted) {
        const nodes = trackNodesMap.get(trackId);
        if (nodes?.muteGainNode && audioCtx && audioCtx.state === 'running') {
            const targetGain = isMuted ? 0.0 : 1.0;
            console.log(`AudioEngine: Setting mute for track ${trackId} to ${isMuted} (Gain: ${targetGain})`);
            // Use setTargetAtTime for smooth mute/unmute to avoid clicks
            nodes.muteGainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.010);
        } else {
            console.warn(`AudioEngine: Cannot set mute for ${trackId} - MuteGainNode/Context not ready.`);
        }
    }

    /**
     * Sets the master gain (volume) level smoothly. Avoids targeting exactly 0.0
     * and handles potential incorrect 0 input due to parseFloat(0) || 1.0 issues.
     * @param {number} gain - The desired gain level from the UI (e.g., 0.0 to 2.0).
     * @public
     */
    function setGain(gain) { // Affects masterGainNode
        // *** ADD LOGGING ***
        console.log(`AudioEngine: setGain received input: ${gain} (Type: ${typeof gain})`);

        if (!masterGainNode || !audioCtx || audioCtx.state === 'closed') {
            console.warn("AudioEngine: Cannot set master gain - MasterGainNode/Context missing or closed.");
            return;
        }

        const MIN_GAIN = 0.0;
        const MAX_GAIN = 2.0; // Should match index.html slider range
        const SILENCE_THRESHOLD = 0;  // not needed after all
        const RAMP_TIME_CONSTANT = 0.015;

        // 1. Parse the input gain carefully
        let parsedGain = parseFloat(gain);
        // Check if parseFloat resulted in NaN (e.g., bad input) - default to 1.0? Or last valid gain? Let's default to 1.0 for now.
        if (isNaN(parsedGain)) {
            console.warn(`AudioEngine: Invalid gain input '${gain}', defaulting to 1.0`);
            parsedGain = 1.0;
        }

        // 2. Clamp the *parsed* value (Do NOT use || 1.0 here)
        const clampedGain = Math.max(MIN_GAIN, Math.min(parsedGain, MAX_GAIN));

        // 3. Determine the target value, avoiding exact zero
        const targetGainValue = (clampedGain <= SILENCE_THRESHOLD) ? SILENCE_THRESHOLD : clampedGain;

        console.log(`AudioEngine: Setting master gain. Parsed: ${parsedGain}, Clamped: ${clampedGain}, Target: ${targetGainValue}`);

        try {
            // Cancel previous ramps
            masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
            // Set the new target
            masterGainNode.gain.setTargetAtTime(targetGainValue, audioCtx.currentTime, RAMP_TIME_CONSTANT);
        } catch (e) {
            console.error(`AudioEngine: Error setting master gain: ${e.message}`);
        }
    }

    /** Provides access to the current AudioContext instance. */
    function getAudioContext() {
        return audioCtx;
    }

    /** Resumes context if suspended */
    async function resumeContextIfNeeded(reason = "Context resume needed.") {
        if (audioCtx && audioCtx.state === 'suspended') {
            console.log(`AudioEngine: ${reason} Attempting resume...`);
            try {
                await audioCtx.resume();
                console.log(`AudioEngine: Context resumed (state: ${audioCtx.state})`);
                // If module wasn't added before, try now
                if (!workletModuleAdded) {
                    await addWorkletModule();
                }
            } catch (err) {
                console.error(`AudioEngine: Failed to resume AC: ${err}`);
                dispatchEngineEvent('audioapp:engineError', {type: 'contextResume', error: err});
                throw err; // Re-throw so caller knows it failed
            }
        }
    }

    // --- Cleanup ---

    /**
     * Cleans up resources for a specific trackId.
     * @param {string} trackId
     * @public
     */
    async function cleanupTrack(trackId) {
        const nodes = trackNodesMap.get(trackId);
        if (!nodes) return; // No nodes for this ID

        console.log(`AudioEngine: Cleaning up nodes for track ${trackId}...`);

        // 1. Send cleanup message to worklet first
        if (nodes.workletNode) {
            postMessageToTrack(trackId, {type: 'cleanup'});
            // Optional: wait briefly for message processing before disconnecting
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 2. Disconnect nodes (in reverse order of connection)
        try {
            if (nodes.muteGainNode) nodes.muteGainNode.disconnect();
            if (nodes.volumeGainNode) nodes.volumeGainNode.disconnect();
            if (nodes.pannerNode) nodes.pannerNode.disconnect();
            if (nodes.workletNode) {
                if (nodes.workletNode.port) nodes.workletNode.port.onmessage = null;
                nodes.workletNode.onprocessorerror = null;
                nodes.workletNode.disconnect();
            }
            console.log(`AudioEngine: Nodes disconnected for ${trackId}.`);
        } catch (e) {
            console.warn(`AudioEngine: Error during node disconnection for ${trackId}:`, e);
        }

        // 3. Remove from map
        trackNodesMap.delete(trackId);
        console.log(`AudioEngine: Track ${trackId} removed from map.`);
    }

    /** Cleans up all tracks and the AudioContext. */
    async function cleanupAllTracks() {
        console.log("AudioEngine: Cleaning up all tracks...");
        const cleanupPromises = [];
        trackNodesMap.forEach((nodes, trackId) => {
            cleanupPromises.push(cleanupTrack(trackId));
        });
        await Promise.all(cleanupPromises); // Wait for all individual cleanups
        console.log("AudioEngine: All tracks cleaned up.");
    }

    /** Global cleanup function for application exit. */
    async function cleanup() {
        console.log("AudioEngine: Global cleanup requested...");
        await cleanupAllTracks(); // Clean tracks first
        if (audioCtx && audioCtx.state !== 'closed') {
            try {
                await audioCtx.close();
                console.log("AudioEngine: AudioContext closed.");
            } catch (e) {
                console.warn("AudioEngine: Error closing AudioContext:", e);
            }
        }
        audioCtx = null;
        masterGainNode = null;
        trackNodesMap.clear();
        wasmBinary = null;
        loaderScriptText = null;
        workletModuleAdded = false;
        console.log("AudioEngine: Global cleanup finished.");
    }

    // --- Utility & Dispatch Helper ---
    function dispatchEngineEvent(eventName, detail = {}) {
        document.dispatchEvent(new CustomEvent(eventName, {detail: detail}));
    }

    // --- Public Interface ---
    return {
        init: init,
        setupTrack: setupTrack, // New setup function per track
        cleanupTrack: cleanupTrack, // Expose single track cleanup
        // Removed loadAndProcessFile
        resampleTo16kMono: resampleTo16kMono,
        // Global Controls (now potentially acting on multiple tracks)
        togglePlayPause: togglePlayPause, // Sends play/pause to all tracks
        seekAllTracks: seekAllTracks, // Seeks all tracks respecting offsets
        setGain: setGain, // Master gain
        // Track-Specific Controls
        playTrack: playTrack,
        pauseTrack: pauseTrack,
        seekTrack: seekTrack,
        setTrackSpeed: setTrackSpeed,
        setTrackPitch: setTrackPitch,
        setTrackFormant: setTrackFormant,
        setPan: setPan,
        setVolume: setVolume,
        setMute: setMute,
        // Getters
        getAudioContext: getAudioContext,
        // Global Cleanup
        cleanup: cleanup
    };
})();
// --- /vibe-player/js/player/audioEngine.js --- // Updated Path
