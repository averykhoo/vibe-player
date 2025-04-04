// --- /vibe-player/js/player/audioEngine.js ---
// Manages Web Audio API, SINGLE AudioWorkletNode lifecycle, decoding, resampling,
// track gain nodes, and communication with the Rubberband WASM processor.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.audioEngine = (function() {
    'use strict';

    // === Module Dependencies ===
    const Constants = AudioApp.Constants;

    // === Module State ===
    /** @type {AudioContext|null} */
    let audioContext = null;
    /** @type {GainNode|null} Master Gain Node - Controls overall output volume. */
    let masterGainNode = null;
    /** @type {AudioWorkletNode|null} The single worklet node instance. */ // MODIFIED
    let workletNode = null;
    /** @type {boolean} Flag indicating if the worklet processor script/WASM is ready. */ // MODIFIED
    let workletProcessorReady = false;
    /** @type {Array<GainNode|null>} Array for per-track gain nodes [Track0, Track1]. */ // MODIFIED
    let trackGainNodes = [null, null];

    // --- Resource Cache (used by single worklet) ---
    /** @type {boolean} Flag indicating if WASM binary and loader script are loaded. */
    let workletResourcesLoaded = false;
    /** @type {ArrayBuffer|null} Cached WASM binary. */
    let wasmBinary = null;
    /** @type {string|null} Cached Rubberband loader script text. */
    let loaderScriptText = null;
    /** @type {boolean} Flag indicating if the AudioWorklet module has been added. */
    let workletModuleAdded = false;


    // === Initialization ===
    /**
     * Initializes the AudioEngine. Creates AudioContext and master gain.
     * Does not load worklet resources immediately.
     * @public
     */
    function init() {
        console.log("AudioEngine: Initializing...");
        try {
            // Cleanup existing context if necessary (e.g., during reset)
            if (audioContext && audioContext.state !== 'closed') {
                console.log("AudioEngine: Closing existing AudioContext before init.");
                audioContext.close().catch(e => console.warn("AudioEngine: Error closing previous context:", e));
            }

            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGainNode = audioContext.createGain();
            masterGainNode.connect(audioContext.destination);

            // Reset all state variables
            _resetEngineState();

            console.log("AudioEngine: Initialized with AudioContext and Master Gain.");
        } catch (e) {
            console.error("AudioEngine: Error initializing Web Audio API:", e);
            _dispatchError('init', e);
            _resetEngineState(); // Ensure clean state on error
            audioContext = null; masterGainNode = null;
        }
    }

    /** Resets engine-specific state variables */
    function _resetEngineState() {
        console.log("AudioEngine: Resetting internal engine state.");
        workletNode = null;
        workletProcessorReady = false;
        trackGainNodes = [null, null];
        // Keep cached resources unless explicitly cleared by cleanup()
        // workletResourcesLoaded = false;
        // wasmBinary = null;
        // loaderScriptText = null;
        // workletModuleAdded = false;
    }

    // --- Resource Loading (WASM, Worklet Script) ---

    /**
     * Loads the Rubberband WASM binary, the custom loader script TEXT,
     * and adds the AudioWorkletProcessor module if not already done.
     * Idempotent.
     * @returns {Promise<boolean>} True if resources are ready, false otherwise.
     * @private
     */
    async function _ensureWorkletResources() { // Renamed for clarity
        if (!audioContext) return false;
        if (workletResourcesLoaded && workletModuleAdded) return true; // Use combined check now

        console.log("AudioEngine: Loading/Verifying Worklet resources (WASM, Loader Text, Module)...");
        try {
            if (!workletResourcesLoaded) { // Load WASM and Script Text only once
                if (wasmBinary === null) {
                    const wasmResponse = await fetch(Constants.WASM_BINARY_URL);
                    if (!wasmResponse.ok) throw new Error(`Failed to fetch WASM: ${wasmResponse.statusText}`);
                    wasmBinary = await wasmResponse.arrayBuffer();
                    console.log("AudioEngine: WASM binary loaded and cached.");
                }
                if (loaderScriptText === null) {
                    const loaderResponse = await fetch(Constants.LOADER_SCRIPT_URL);
                    if (!loaderResponse.ok) throw new Error(`Failed to fetch Loader Script: ${loaderResponse.statusText}`);
                    loaderScriptText = await loaderResponse.text();
                    console.log("AudioEngine: Custom WASM Loader script text loaded and cached.");
                }
                workletResourcesLoaded = true;
            }

            if (!workletModuleAdded) { // Add module only once
                 console.log(`AudioEngine: Adding AudioWorklet module: ${Constants.PROCESSOR_SCRIPT_URL}`);
                 if (audioContext.state === 'suspended') { await audioContext.resume(); }
                 await audioContext.audioWorklet.addModule(Constants.PROCESSOR_SCRIPT_URL);
                 workletModuleAdded = true;
                 console.log("AudioEngine: AudioWorklet module added.");
            }

            return true; // Resources are ready
        } catch (error) {
            console.error("AudioEngine: Failed to load Worklet resources:", error);
            _dispatchError('resourceLoad', error);
            // Don't reset cached resources on error, maybe retry later?
            workletResourcesLoaded = false; // Mark as failed this attempt
            workletModuleAdded = false;
            return false;
        }
    }

     /**
      * Creates the single AudioWorkletNode instance if it doesn't exist.
      * Assumes resources are loaded (_ensureWorkletResources called first).
      * @param {number} outputChannelCount - Number of channels for the output node.
      * @returns {Promise<boolean>} True if node exists or was created, false on error.
      * @private
      */
     async function _ensureWorkletNode(outputChannelCount = 2) { // Default to stereo
         if (workletNode) return true; // Already exists
         if (!audioContext || !wasmBinary || !loaderScriptText || !workletModuleAdded) {
             console.error("AudioEngine: Cannot create WorkletNode, resources not ready.");
             return false;
         }

         console.log("AudioEngine: Creating single AudioWorkletNode...");
         try {
             const processorOptions = {
                 sampleRate: audioContext.sampleRate, // Use context's rate
                 wasmBinary: wasmBinary, // Pass cached binary
                 loaderScriptText: loaderScriptText // Pass cached script text
             };
             // console.log("AudioEngine: WorkletNode options:", { sampleRate: processorOptions.sampleRate, /* omit large data */ });

             if (audioContext.state === 'suspended') { await audioContext.resume(); }

             workletNode = new AudioWorkletNode(audioContext, Constants.PROCESSOR_NAME, {
                  processorOptions: processorOptions,
                  numberOfInputs: 0, // Generates audio
                  numberOfOutputs: 1,
                  outputChannelCount: [outputChannelCount] // Match expected output
             });

             // Setup Message & Error Handling (Now applies to the single node)
              workletNode.port.onmessage = _handleWorkletMessage; // Single handler
              workletNode.port.onerror = _handleWorkletError;     // Single handler
              console.log("AudioEngine: Single Worklet node created and connected.");
              return true;

         } catch(error) {
             console.error("AudioEngine: Failed to create AudioWorkletNode:", error);
             _dispatchError('nodeCreate', error);
             workletNode = null;
             return false;
         }
     }

    // --- Track Loading and Processing ---

    /**
     * Loads an audio file, decodes it, creates track-specific gain node,
     * ensures the single worklet node exists, and sends track data to it.
     * @param {File} file - The audio file to load.
     * @param {number} trackIndex - The index (0 or 1) for this track.
     * @returns {Promise<void>}
     * @public
     */
    async function loadAndProcessTrack(file, trackIndex) {
        if (!audioContext || !masterGainNode) {
            console.error("AudioEngine: Cannot load track, AudioContext not ready.");
            _dispatchError('load', new Error("AudioContext not available.")); return;
        }
        if (trackIndex !== 0 && trackIndex !== 1) {
            console.error(`AudioEngine: Invalid trackIndex: ${trackIndex}`);
            _dispatchError('load', new Error(`Invalid trackIndex ${trackIndex}`)); return;
        }

        console.log(`AudioEngine: Loading track ${trackIndex} from file: ${file.name}`);

        // Cleanup existing GAIN node for this track, if any
        _cleanupTrackGainNode(trackIndex);

        try {
            // 1. Decode Audio Data
            console.log(`AudioEngine: Decoding audio data for track ${trackIndex}...`);
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log(`AudioEngine: Track ${trackIndex} decoded. SR: ${audioBuffer.sampleRate}, Ch: ${audioBuffer.numberOfChannels}, Dur: ${audioBuffer.duration.toFixed(2)}s`);

            // Dispatch audio loaded event
            _dispatchEvent('audioapp:audioLoaded', { audioBuffer: audioBuffer, trackIndex: trackIndex });

            // 2. Create Per-Track Gain Node
            trackGainNodes[trackIndex] = audioContext.createGain();
            console.log(`AudioEngine: Created GainNode for track ${trackIndex}.`);

            // 3. Ensure Worklet Resources & Node are Ready
            const resourcesReady = await _ensureWorkletResources();
            if (!resourcesReady) throw new Error("Worklet resources failed to load.");

            // Determine output channel count (max of loaded tracks? Or fixed stereo?) Let's fix to stereo for now.
            const outputChannels = 2;
            const nodeReady = await _ensureWorkletNode(outputChannels);
            if (!nodeReady || !workletNode) throw new Error("Failed to create or ensure AudioWorkletNode.");

            // 4. Connect Track Gain -> Master Gain -> Destination
            // Connection from workletNode happens ONCE after _ensureWorkletNode succeeds
            if (trackGainNodes[trackIndex] && masterGainNode && !trackGainNodes[trackIndex].numberOfOutputs > 0) { // Connect only if not already connected
                 trackGainNodes[trackIndex].connect(masterGainNode);
                 console.log(`AudioEngine: Connected GainNode for track ${trackIndex} to Master Gain.`);
            }
            // Connect Worklet to Destination happens once below

            // 5. Connect workletNode to Destination (through master gain) if not already done
            // This assumes the worklet output should be mixed and sent to master gain
            // **Correction:** Worklet output should go to track gains, which go to master.
            // The worklet output needs to be routed correctly. Let's rethink the connections.
             if (workletNode && workletNode.numberOfOutputs > 0) { // Check if worklet output exists
                 // Disconnect existing connections? Risky. Assume we connect once.
                 // How to route single worklet output to TWO track gains? Cannot directly.

                 // **Revised Connection Strategy:**
                 // Single Worklet -> Master Gain -> Destination
                 // Track Gain Nodes are now ONLY for applying MUTE/Volume to the source *before* sending? No, that doesn't work.
                 // Okay, the worklet needs to output mixed audio. Connect worklet directly to Master Gain.
                 // Track Gain Nodes CANNOT be used post-worklet easily with a single worklet output.
                 // MUTE logic MUST be handled by telling the worklet NOT TO PROCESS the track.

                 // Connect Worklet -> Master Gain (if not already connected)
                 const isConnected = masterGainNode && workletNode.numberOfOutputs > 0; // Simplified check
                 // This check is flawed. How to reliably check connection?
                 // Let's just connect it once after creation in _ensureWorkletNode.

                 // Revisit _ensureWorkletNode connection logic
                 // Connect inside _ensureWorkletNode:
                 // workletNode.connect(masterGainNode); // Connect the single worklet output to master gain
                 // console.log("AudioEngine: Connected single WorkletNode output to Master Gain.");

                 // Delete trackGainNodes creation/connection - they are unusable here?
                 // Keep them for now, maybe they control volume *before* data sent? No.
                 // Let's keep them but acknowledge they aren't used in the main chain post-worklet.
                 // Muting will require a 'setMute' command to the worklet.
             }


            // 6. Send 'load' message to the single worklet
             const channels = [];
             for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                 channels.push(audioBuffer.getChannelData(i).slice());
             }
             const loadMessage = {
                 type: 'load',
                 trackIndex: trackIndex, // Tell worklet which track this is for
                 audioData: channels,
                 sampleRate: audioBuffer.sampleRate // Let worklet know original rate if needed
             };
             console.log(`AudioEngine: Sending 'load' message to worklet for track ${trackIndex}.`);
             if (workletNode) {
                  workletNode.port.postMessage(loadMessage, channels.map(c => c.buffer));
             } else {
                  throw new Error("WorkletNode is null, cannot send load message.");
             }

        } catch (error) {
            console.error(`AudioEngine: Error processing track ${trackIndex}:`, error);
            _dispatchError('load', error, trackIndex);
            _cleanupTrackGainNode(trackIndex); // Clean up gain node on error
        }
    }

    /** Re-Connect worklet node in _ensureWorkletNode */
    async function _ensureWorkletNode(outputChannelCount = 2) { // Default to stereo
         if (workletNode) return true;
         if (!audioContext || !wasmBinary || !loaderScriptText || !workletModuleAdded || !masterGainNode) {
             console.error("AudioEngine: Cannot create WorkletNode, resources/context/masterGain not ready.");
             return false;
         }

         console.log("AudioEngine: Creating single AudioWorkletNode...");
         try {
             const processorOptions = {
                 sampleRate: audioContext.sampleRate,
                 wasmBinary: wasmBinary,
                 loaderScriptText: loaderScriptText
             };

             if (audioContext.state === 'suspended') { await audioContext.resume(); }

             workletNode = new AudioWorkletNode(audioContext, Constants.PROCESSOR_NAME, {
                  processorOptions: processorOptions,
                  numberOfInputs: 0, numberOfOutputs: 1,
                  outputChannelCount: [outputChannelCount]
             });

             workletNode.port.onmessage = _handleWorkletMessage;
             workletNode.port.onerror = _handleWorkletError;

             // Connect the single worklet output DIRECTLY to the master gain
             workletNode.connect(masterGainNode);
             console.log("AudioEngine: Single Worklet node created and connected to Master Gain.");
             return true;

         } catch(error) {
             console.error("AudioEngine: Failed to create AudioWorkletNode:", error);
             _dispatchError('nodeCreate', error);
             workletNode = null;
             return false;
         }
     }


    // --- Worklet Communication ---

        /**
     * Handles messages received from the single AudioWorklet processor instance.
     * @param {MessageEvent} event - The message event from the worklet port.
     * @private
     */
    function _handleWorkletMessage(event) { // No trackIndex needed here
        const data = event.data;
        // console.log(`AudioEngine: Message from worklet:`, data.type); // Optional verbose log

        switch (data.type) {
            case 'processorReady': // Worklet script/WASM loaded
                console.log(`AudioEngine: Worklet processor script/WASM ready.`);
                workletProcessorReady = true;
                _dispatchEvent('audioapp:workletReady');
                break;
            case 'trackLoadComplete': // *** NEW CASE *** Specific track data processed
                 if (data.trackIndex !== undefined) {
                    console.log(`AudioEngine: Worklet confirmed load for track ${data.trackIndex}.`);
                    // Dispatch app event so app.js knows this track is ready within the worklet
                    _dispatchEvent('audioapp:trackLoadComplete', { trackIndex: data.trackIndex });
                 } else {
                    console.warn("AudioEngine: Received 'trackLoadComplete' message without trackIndex.");
                 }
                 break;
            case 'playbackStateChanged': // Overall state
                // Dispatch event with overall playing state
                _dispatchEvent('audioapp:playbackStateChanged', { isPlaying: data.isPlaying });
                break;
             case 'playbackEnded': // Overall end
                 console.log(`AudioEngine: Playback ended event from worklet.`);
                 // Dispatch event indicating playback stopped
                 _dispatchEvent('audioapp:playbackEnded');
                 break;
            // case 'internalSpeedChanged': // Less relevant now?
            //      console.log(`AudioEngine: Internal speed reported: ${data.speed}`);
            //      _dispatchEvent('audioapp:internalSpeedChanged', { speed: data.speed });
            //      break;
            case 'error':
                console.error(`AudioEngine: Error message from worklet:`, data.message);
                // Try to associate error with a track if possible, otherwise general engine error
                const trackIndex = data.trackIndex; // Worklet might include trackIndex if error is track-specific
                _dispatchError('processor', new Error(data.message), trackIndex);
                break;
            default:
                console.warn(`AudioEngine: Unknown message type from worklet:`, data.type);
        }
    }

    /**
     * Handles errors reported by the single worklet port itself.
     * @param {Event} event - The error event from the worklet port.
     * @private
     */
     function _handleWorkletError(event) {
         console.error(`AudioEngine: Uncaught error in single AudioWorklet:`, event);
         const error = event instanceof ErrorEvent ? event.error : new Error(`Worklet port error`);
         _dispatchError('processor', error); // General processor error
         // Consider full cleanup?
         // cleanup();
     }

    // --- Playback Controls (Send commands to the single worklet) ---

    /** Sends command to the single worklet node */
    function _sendCommandToWorklet(command) {
        if (workletNode && workletNode.port) {
            // console.log("AudioEngine: Sending command to worklet:", command.type); // Less verbose
             workletNode.port.postMessage(command);
        } else {
            console.warn("AudioEngine: Cannot send command, worklet node/port not available.", command.type);
        }
    }


    /** Toggles playback state */
    function togglePlayPause() {
        if (!audioContext) return;
        console.log("AudioEngine: Sending command 'togglePlayPause' to worklet.");
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                 console.log("AudioEngine: AudioContext resumed.");
                 _sendCommandToWorklet({ type: 'togglePlayPause' });
             }).catch(err => {
                 console.error("AudioEngine: Failed to resume AudioContext:", err);
                 _dispatchError('playback', err);
             });
        } else {
             _sendCommandToWorklet({ type: 'togglePlayPause' });
        }
    }

    /** Sends seek command */
    function seek(targetSharedTime) {
        if (!audioContext) return;
        console.log(`AudioEngine: Sending 'seek' command to worklet: ${targetSharedTime.toFixed(3)}s`);
        // Validate time? Worklet should handle clamping.
        _sendCommandToWorklet({ type: 'seek', time: targetSharedTime });
    }

    /** Sends setSpeed command */
    function setSpeed(speed) {
        console.log(`AudioEngine: Sending 'setSpeed' command (${speed.toFixed(2)}) to worklet.`);
        _sendCommandToWorklet({ type: 'setSpeed', speed: speed });
    }

    /** Sends setPitch command */
    function setPitch(pitch) {
        console.log(`AudioEngine: Sending 'setPitch' command (${pitch.toFixed(2)}) to worklet.`);
        _sendCommandToWorklet({ type: 'setPitch', pitch: pitch });
    }

    /** Sets MASTER gain */
    function setGain(gainValue) {
        if (masterGainNode && audioContext) {
            console.log(`AudioEngine: Setting master gain to ${gainValue.toFixed(2)}.`);
            masterGainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.05);
        }
    }

    /**
     * Applies mute using the per-track GainNode.
     * NOTE: With the single worklet outputting mixed audio, these gain nodes
     * are NOT in the main audio path anymore. This function will visually change gain
     * but won't affect the final output unless connections are changed.
     * TODO: Implement mute via command to worklet.
     * @param {number} trackIndex - The index of the track (0 or 1).
     * @param {boolean} isMuted - True to mute, false to unmute.
     * @public
     */
     function setTrackMuted(trackIndex, isMuted) {
        const gainNode = trackGainNodes[trackIndex];
        if (gainNode && audioContext) {
             const targetGain = isMuted ? 0 : 1;
             console.log(`AudioEngine: Setting Track ${trackIndex} GainNode value to ${targetGain} (Muted: ${isMuted}). NOTE: May not affect output with single worklet mixing.`);
             gainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.01);
             // TODO: Send 'setMute' command to worklet instead/as well
             // _sendCommandToWorklet({ type: 'setMute', trackIndex: trackIndex, muted: isMuted });
         } else {
              console.warn(`AudioEngine: Cannot set mute for track ${trackIndex}, GainNode not found.`);
         }
     }


    // --- Utility Functions ---

    /** Resamples AudioBuffer */
     async function resampleTo16kMono(audioBuffer) {
        if (!audioBuffer) return null;
        const targetSampleRate = Constants.VAD_SAMPLE_RATE;

        if (audioBuffer.sampleRate === targetSampleRate && audioBuffer.numberOfChannels === 1) {
             console.log("AudioEngine: Audio already 16kHz mono, no resampling needed.");
             return audioBuffer.getChannelData(0).slice();
        }

        console.log(`AudioEngine: Resampling from ${audioBuffer.sampleRate}Hz/${audioBuffer.numberOfChannels}ch to ${targetSampleRate}Hz/1ch...`);
        const duration = audioBuffer.duration;
        const targetLength = Math.ceil(duration * targetSampleRate);
        if (targetLength <= 0) return new Float32Array();

        try {
             // Ensure we have an AudioContext for resampling
             const ctx = audioContext || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, targetSampleRate); // Fallback to Offline if main ctx missing
             const offlineCtx = (ctx instanceof OfflineAudioContext) ? ctx : new OfflineAudioContext(1, targetLength, targetSampleRate);

             const bufferSource = offlineCtx.createBufferSource();
             bufferSource.buffer = audioBuffer;
             bufferSource.connect(offlineCtx.destination);
             bufferSource.start(0);

             const renderedBuffer = await offlineCtx.startRendering();
             console.log("AudioEngine: Resampling complete.");
             return renderedBuffer.getChannelData(0);
        } catch (error) {
             console.error("AudioEngine: Error during resampling:", error);
             _dispatchError('resampling', error);
             return null;
        }
    }

    /** Dispatches events */
    function _dispatchEvent(eventName, detail = {}) {
        document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }

    /** Dispatches errors */
    function _dispatchError(type, error, trackIndex) {
        let detail = { type: type, error: error };
        if (trackIndex !== undefined) { detail.trackIndex = trackIndex; }
        _dispatchEvent('audioapp:engineError', detail);
    }

    // --- Cleanup ---

    /** Cleans up gain node for a specific track */
    function _cleanupTrackGainNode(trackIndex) {
        if (trackGainNodes[trackIndex]) {
            console.log(`AudioEngine: Cleaning up GainNode for track ${trackIndex}.`);
            try { trackGainNodes[trackIndex].disconnect(); } catch(e) {}
            trackGainNodes[trackIndex] = null;
        }
    }

    /** Cleans up all audio resources */
    function cleanup() {
        console.log("AudioEngine: Cleaning up all resources...");

        // Stop worklet processing and close port
        if (workletNode && workletNode.port) {
            try {
                console.log("AudioEngine: Sending reset to worklet and closing port.");
                workletNode.port.postMessage({ type: 'reset' });
                workletNode.port.close();
            } catch (e) { console.warn("AudioEngine: Error closing worklet port:", e); }
        }
        // Disconnect node
        if (workletNode) {
             try { workletNode.disconnect(); console.log("AudioEngine: Disconnected worklet node."); } catch (e) {}
             workletNode = null;
        }

        _cleanupTrackGainNode(0);
        _cleanupTrackGainNode(1);

        if (masterGainNode) {
            try { masterGainNode.disconnect(); } catch(e) {}
            masterGainNode = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().then(() => console.log("AudioEngine: AudioContext closed."))
                       .catch(e => console.warn("AudioEngine: Error closing AudioContext:", e));
        }
        audioContext = null;

        // Reset state (keeps cached resources)
        _resetEngineState();

        // Optionally clear cached resources too? For a full reset, maybe.
        // wasmBinary = null;
        // loaderScriptText = null;
        // workletResourcesLoaded = false;
        // workletModuleAdded = false;

        console.log("AudioEngine: Cleanup complete.");
    }


    /** Returns the main AudioContext instance */
    function getAudioContext() {
        return audioContext;
    }

    // === Public Interface ===
    return {
        init: init,
        loadAndProcessTrack: loadAndProcessTrack,
        togglePlayPause: togglePlayPause,
        seek: seek,
        setSpeed: setSpeed,
        setPitch: setPitch,
        setGain: setGain, // Master gain
        setTrackMuted: setTrackMuted, // Note: currently ineffective due to single worklet mixing
        resampleTo16kMono: resampleTo16kMono,
        cleanup: cleanup,
        getAudioContext: getAudioContext
    };

})(); // End of AudioApp.audioEngine IIFE
// --- /vibe-player/js/player/audioEngine.js ---
