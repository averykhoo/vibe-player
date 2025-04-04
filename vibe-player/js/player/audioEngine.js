// --- START OF FILE js/player/audioEngine.js ---
// --- /vibe-player/js/player/audioEngine.js ---
// Manages Web Audio API, AudioWorkletNode lifecycle, decoding, resampling,
// and communication with the Rubberband WASM processor.
// Refactored for potential multi-track support.

var AudioApp = AudioApp || {}; // Ensure namespace exists

AudioApp.audioEngine = (function() {
    'use strict';

    // === Module Dependencies ===
    // Assuming AudioApp.Constants is loaded before this file.
    const Constants = AudioApp.Constants;

    // === Module State ===
    /** @type {AudioContext|null} */
    let audioContext = null;
    /** @type {GainNode|null} Master Gain Node - Controls overall output volume. */
    let masterGainNode = null;

    /**
     * @typedef {object} TrackProcessor
     * @property {AudioWorkletNode|null} workletNode - The AudioWorklet node for this track.
     * @property {boolean} isReady - Flag indicating if the worklet processor is initialized and ready.
     * @property {GainNode|null} trackGainNode - Gain node specifically for this track (for mute/solo/track gain).
     * @property {number|null} sampleRate - The original sample rate of the audio loaded for this track.
     */
    /** @type {Array<TrackProcessor|null>} Array to hold state for up to two track processors. */
    let trackProcessors = [null, null];

    /** @type {boolean} Flag indicating if WASM binary and loader script are loaded. */
    let workletResourcesLoaded = false;
    /** @type {ArrayBuffer|null} Cached WASM binary. */
    let wasmBinary = null;
    /** @type {Function|null} Reference to the loaded custom Rubberband WASM loader function. */
    let rubberbandLoader = null;
    /** @type {boolean} Flag indicating if the AudioWorklet module has been added. */
    let workletModuleAdded = false;
    /** @type {string|null} Cached Rubberband loader script text. */
    let loaderScriptText = null; // <-- Added cache for loader script text

    // === Initialization ===

    /**
     * Initializes the AudioEngine. Creates AudioContext and master gain.
     * Does not load WASM/Worklet resources yet (lazy loaded on first file).
     * @public
     */
    function init() {
        console.log("AudioEngine: Initializing...");
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGainNode = audioContext.createGain();
            masterGainNode.connect(audioContext.destination);
            trackProcessors = [null, null]; // Ensure clean state on init
            workletResourcesLoaded = false;
            workletModuleAdded = false;
            wasmBinary = null;
            rubberbandLoader = null;
            loaderScriptText = null; // Initialize cached text
            console.log("AudioEngine: Initialized with AudioContext and Master Gain.");
        } catch (e) {
            console.error("AudioEngine: Error initializing Web Audio API:", e);
            _dispatchError('init', e);
            // Cannot proceed without AudioContext
            audioContext = null;
            masterGainNode = null;
        }
    }

    // --- Resource Loading (WASM, Worklet Script) ---

    /**
     * Loads the Rubberband WASM binary, the custom loader script TEXT,
     * and adds the AudioWorkletProcessor module if not already done.
     * @returns {Promise<boolean>} True if resources are ready, false otherwise.
     * @private
     */
    async function _loadWorkletResources() {
        if (!audioContext) return false;
        // Check if all necessary resources are loaded
        if (wasmBinary !== null && loaderScriptText !== null && workletModuleAdded) return true;

        console.log("AudioEngine: Loading/Verifying Worklet resources (WASM, Loader Text, Module)...");
        try {
            // Fetch WASM binary only if not already loaded
            if (wasmBinary === null) {
                console.log("AudioEngine: Fetching WASM binary..."); // Log start
                const wasmResponse = await fetch(Constants.WASM_BINARY_URL);
                if (!wasmResponse.ok) throw new Error(`Failed to fetch WASM: ${wasmResponse.statusText}`);
                wasmBinary = await wasmResponse.arrayBuffer();
                console.log("AudioEngine: WASM binary loaded.");
            }

            // Fetch Loader Script Text only if not already loaded
            if (loaderScriptText === null) {
                console.log("AudioEngine: Fetching loader script text..."); // Log start
                const loaderResponse = await fetch(Constants.LOADER_SCRIPT_URL);
                if (!loaderResponse.ok) throw new Error(`Failed to fetch Loader Script: ${loaderResponse.statusText}`);
                loaderScriptText = await loaderResponse.text();
                console.log("AudioEngine: Custom WASM Loader script text loaded.");
            }

            // Add the main processor module ONCE if not already added.
            if (!workletModuleAdded) {
                 console.log(`AudioEngine: Adding AudioWorklet module: ${Constants.PROCESSOR_SCRIPT_URL}`); // Log start
                 if (audioContext.state === 'suspended') {
                     console.log("AudioEngine: Resuming AudioContext before adding module..."); // Log context resume
                     await audioContext.resume();
                 }
                 await audioContext.audioWorklet.addModule(Constants.PROCESSOR_SCRIPT_URL);
                 workletModuleAdded = true;
                 console.log("AudioEngine: AudioWorklet module added.");
            }

            return true; // Resources are ready
        } catch (error) {
            console.error("AudioEngine: Failed to load Worklet resources:", error);
            _dispatchError('resourceLoad', error);
            // Reset all potentially loaded resources on error
            wasmBinary = null;
            loaderScriptText = null;
            workletModuleAdded = false;
            return false;
        }
    }

    // --- Track Loading and Processing ---

    /**
     * Loads an audio file, decodes it, and sets up the processing pipeline for a specific track.
     * @param {File} file - The audio file to load.
     * @param {number} trackIndex - The index (0 or 1) for this track.
     * @returns {Promise<void>}
     * @public
     */
    async function loadAndProcessTrack(file, trackIndex) {
        if (!audioContext || !masterGainNode) {
            console.error("AudioEngine: Cannot load track, AudioContext not ready.");
            _dispatchError('load', new Error("AudioContext not available."));
            return;
        }
        if (trackIndex !== 0 && trackIndex !== 1) {
            console.error(`AudioEngine: Invalid trackIndex: ${trackIndex}`);
            _dispatchError('load', new Error(`Invalid trackIndex ${trackIndex}`));
            return;
        }

        console.log(`AudioEngine: Loading track ${trackIndex} from file: ${file.name}`);

        // Ensure resources are loaded (WASM binary, Loader Text, Worklet module added)
        console.log(`AudioEngine: Track ${trackIndex} - Ensuring worklet resources...`); // <-- Add log
        const resourcesReady = await _loadWorkletResources();
        if (!resourcesReady || !wasmBinary || !loaderScriptText || !workletModuleAdded) {
             console.error(`AudioEngine: Cannot load track ${trackIndex}, worklet resources failed to load or are missing.`); // <-- More specific error
             // Error potentially already dispatched by _loadWorkletResources
             return;
        }
        console.log(`AudioEngine: Track ${trackIndex} - Worklet resources OK.`); // <-- Add log

        // Cleanup existing processor for this track index, if any
        console.log(`AudioEngine: Track ${trackIndex} - Calling _cleanupTrack...`); // <-- ADDED
        _cleanupTrack(trackIndex);
        console.log(`AudioEngine: Track ${trackIndex} - _cleanupTrack finished. Entering main try block...`);

        try {
            // 1. Decode Audio Data
            console.log(`AudioEngine: Track ${trackIndex} - Starting file read...`); // <-- MODIFIED
            const arrayBuffer = await file.arrayBuffer();
            console.log(`AudioEngine: Track ${trackIndex} - File read complete (${arrayBuffer.byteLength} bytes). Starting decodeAudioData...`); // <-- MODIFIED
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            // If we don't see the next log, decodeAudioData is the issue
            console.log(`AudioEngine: Track ${trackIndex} - decodeAudioData SUCCESS. Sample Rate: ${audioBuffer.sampleRate}, Duration: ${audioBuffer.duration.toFixed(2)}s`); // <-- MODIFIED

            // Dispatch audio loaded event WITH trackIndex
            _dispatchEvent('audioapp:audioLoaded', { audioBuffer: audioBuffer, trackIndex: trackIndex });

            // 2. Create Per-Track Gain Node
            console.log(`AudioEngine: Track ${trackIndex} - Creating GainNode...`); // <-- MODIFIED
            const trackGainNode = audioContext.createGain();
            trackGainNode.connect(masterGainNode); // Connect track gain to master gain
            console.log(`AudioEngine: Track ${trackIndex} - GainNode created and connected.`); // <-- MODIFIED


            // 3. Create AudioWorkletNode for this track
            const processorOptions = {
                // CRITICAL: Pass the specific sample rate of this track's buffer
                sampleRate: audioBuffer.sampleRate,
                // Pass WASM binary via options (will be cloned)
                wasmBinary: wasmBinary,
                // Pass Loader Script TEXT via options (will be cloned)
                loaderScriptText: loaderScriptText,
                channelCount: audioBuffer.numberOfChannels
            };
            console.log(`AudioEngine: Track ${trackIndex} - Preparing AudioWorkletNode options...`); // <-- MODIFIED
            // Avoid logging large binary/script text
            console.log(`AudioEngine: Track ${trackIndex} - Creating AudioWorkletNode with options:`, {
                 sampleRate: processorOptions.sampleRate,
                 channelCount: processorOptions.channelCount,
                 wasmBinary: '[binary]',
                 loaderScriptText: '[script text]'
            });

            // Ensure context is running before creating node
            if (audioContext.state === 'suspended') {
                 console.log(`AudioEngine: Track ${trackIndex} - Resuming AudioContext before creating node...`); // <-- MODIFIED
                 await audioContext.resume();
                 console.log(`AudioEngine: Track ${trackIndex} - AudioContext resumed.`); // <-- MODIFIED
            }

            console.log(`AudioEngine: Track ${trackIndex} - Calling new AudioWorkletNode(...)`); // <-- MODIFIED
            const workletNode = new AudioWorkletNode(audioContext, Constants.PROCESSOR_NAME, {
                 processorOptions: processorOptions,
                 numberOfInputs: 0, // The worklet generates audio
                 numberOfOutputs: 1,
                 outputChannelCount: [audioBuffer.numberOfChannels] // Match output channels to buffer
            });
             // If we don't see the next log, the constructor failed/blocked
             console.log(`AudioEngine: Track ${trackIndex} - AudioWorkletNode constructor finished.`); // <-- MODIFIED


            // 4. Connect nodes: Worklet -> Track Gain -> Master Gain -> Destination
            console.log(`AudioEngine: Track ${trackIndex} - Connecting workletNode to trackGainNode...`); // <-- MODIFIED
            workletNode.connect(trackGainNode);
            console.log(`AudioEngine: Track ${trackIndex} - workletNode connected.`); // <-- MODIFIED


            // 5. Store processor state
            trackProcessors[trackIndex] = {
                workletNode: workletNode,
                isReady: false, // Will be set true by 'processorReady' message
                trackGainNode: trackGainNode,
                sampleRate: audioBuffer.sampleRate // Store sample rate
            };
            console.log(`AudioEngine: Track ${trackIndex} - Processor state stored.`); // <-- MODIFIED


            // 6. Setup Message & Error Handling (Pass trackIndex)
             workletNode.port.onmessage = (event) => {
                 _handleWorkletMessage(event, trackIndex);
             };
             workletNode.port.onerror = (event) => {
                  _handleWorkletError(event, trackIndex);
             };
            console.log(`AudioEngine: Track ${trackIndex} - Worklet message/error handlers set.`); // <-- MODIFIED


            // 7. Send initial data to worklet
             const channels = [];
             for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                 channels.push(audioBuffer.getChannelData(i).slice());
             }
             console.log(`AudioEngine: Track ${trackIndex} - Sending 'load' message to worklet...`); // <-- MODIFIED
             workletNode.port.postMessage({
                 type: 'load',
                 audioData: channels,
                 sampleRate: audioBuffer.sampleRate
             }, channels.map(c => c.buffer));
             console.log(`AudioEngine: Track ${trackIndex} - 'load' message sent.`); // <-- MODIFIED


        } catch (error) {
             console.error(`AudioEngine: Track ${trackIndex} - Error during load/setup:`, error); // <-- MODIFIED
            if (error instanceof DOMException && error.name === 'DataCloneError') {
                console.error("DataCloneError occurred. Check if WASM binary or loader script text exceed cloning limits.");
            }
            _dispatchError('load', error, trackIndex);
            _cleanupTrack(trackIndex);
        }
    }

    // --- Worklet Communication ---

    /**
     * Handles messages received from a specific AudioWorklet processor instance.
     * @param {MessageEvent} event - The message event from the worklet port.
     * @param {number} trackIndex - The index (0 or 1) of the worklet sending the message.
     * @private
     */
    function _handleWorkletMessage(event, trackIndex) {
        const data = event.data;
        const processor = trackProcessors[trackIndex];
        if (!processor) return; // Should not happen if handler is set up correctly

        // console.log(`AudioEngine: Message from track ${trackIndex} worklet:`, data.type); // Log message type

        switch (data.type) {
            case 'processorReady':
                console.log(`AudioEngine: Processor for track ${trackIndex} reported ready.`);
                processor.isReady = true;
                _dispatchEvent('audioapp:workletReady', { trackIndex: trackIndex });
                break;
            case 'playbackStateChanged':
                 // console.log(`AudioEngine: Track ${trackIndex} worklet state changed: isPlaying=${data.isPlaying}`);
                _dispatchEvent('audioapp:playbackStateChanged', { isPlaying: data.isPlaying, trackIndex: trackIndex });
                break;
             case 'playbackEnded':
                 console.log(`AudioEngine: Track ${trackIndex} playback ended event from worklet.`);
                 _dispatchEvent('audioapp:playbackEnded', { trackIndex: trackIndex });
                 break;
            case 'internalSpeedChanged': // If worklet reports actual speed changes (less likely now)
                 console.log(`AudioEngine: Track ${trackIndex} internal speed reported: ${data.speed}`);
                 _dispatchEvent('audioapp:internalSpeedChanged', { speed: data.speed, trackIndex: trackIndex });
                 break;
            case 'error':
                console.error(`AudioEngine: Error message from track ${trackIndex} worklet:`, data.message);
                _dispatchError('processor', new Error(data.message), trackIndex);
                break;
            // case 'sourceTimeUpdate': // Removed reliance on this for UI timing
            //     // console.log(`AudioEngine: Track ${trackIndex} worklet time: ${data.currentTime.toFixed(3)}`);
            //     break;
            default:
                console.warn(`AudioEngine: Unknown message type from track ${trackIndex} worklet:`, data.type);
        }
    }

    /**
     * Handles errors reported by the worklet port itself for a specific track.
     * @param {Event} event - The error event from the worklet port.
     * @param {number} trackIndex - The index (0 or 1) of the worklet.
     * @private
     */
     function _handleWorkletError(event, trackIndex) {
         console.error(`AudioEngine: Uncaught error in AudioWorklet for track ${trackIndex}:`, event);
         // Attempt to construct a meaningful error object if possible
         const error = event instanceof ErrorEvent ? event.error : new Error(`Worklet port error for track ${trackIndex}`);
         _dispatchError('processor', error, trackIndex);
         // Consider cleaning up the failed track?
         // _cleanupTrack(trackIndex);
     }

    // --- Playback Controls (Act on all active tracks) ---

    /**
     * Toggles playback state (play/pause) for all active tracks.
     * Sends commands to the corresponding worklets.
     * @public
     */
    function togglePlayPause() {
        if (!audioContext) return;
        // If context is suspended, resume it first (browser autoplay policy)
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                 console.log("AudioEngine: AudioContext resumed.");
                 _sendCommandToActiveWorklets({ type: 'togglePlayPause' });
             }).catch(err => {
                 console.error("AudioEngine: Failed to resume AudioContext:", err);
                 _dispatchError('playback', err);
             });
        } else {
             _sendCommandToActiveWorklets({ type: 'togglePlayPause' });
        }
    }

    /**
     * Seeks all active tracks to a target time on the shared timeline.
     * Note: Offset application is handled by app.js before calling this.
     * This function will internally call _seekTrack for each active track.
     * @param {number} targetSharedTime - The target time in seconds on the shared timeline.
     * @public
     */
    function seek(targetSharedTime) {
        if (!audioContext) return;
        console.log(`AudioEngine: Seek requested for all active tracks to shared time ${targetSharedTime.toFixed(3)}s`);
        // Note: app.js is responsible for calculating the offset time for track 1
        // and calling seekTrack directly, or this function needs adapting later.
        // For this refactor, let's assume it seeks both to the same time FOR NOW.
        trackProcessors.forEach((processor, index) => {
             if (processor && processor.isReady && processor.workletNode) {
                 // TODO: In full implementation, app.js should call _seekTrack with offset applied.
                 // For now, seek both to the same targetSharedTime. Clamping happens in worklet or app.js.
                  _seekTrack(index, targetSharedTime);
             }
         });
    }

    /**
     * Sends a seek command to a specific track's worklet.
     * @param {number} trackIndex - The index of the track (0 or 1).
     * @param {number} targetTime - The target time in seconds *for that specific track*.
     * @private
     */
     function _seekTrack(trackIndex, targetTime) {
         const processor = trackProcessors[trackIndex];
         if (processor && processor.isReady && processor.workletNode) {
             // Basic validation
             if (typeof targetTime !== 'number' || isNaN(targetTime)) {
                 console.warn(`AudioEngine: Invalid seek time (${targetTime}) for track ${trackIndex}`);
                 return;
             }
             const clampedTime = Math.max(0, targetTime); // Ensure non-negative
             console.log(`AudioEngine: Sending seek command to track ${trackIndex}: ${clampedTime.toFixed(3)}s`);
             processor.workletNode.port.postMessage({ type: 'seek', time: clampedTime });
         } else {
             console.warn(`AudioEngine: Cannot seek track ${trackIndex}, processor not ready or doesn't exist.`);
         }
     }

    /**
     * Sets the target playback speed for all active tracks.
     * @param {number} speed - The desired playback speed (e.g., 1.0 is normal).
     * @public
     */
    function setSpeed(speed) {
        _sendCommandToActiveWorklets({ type: 'setSpeed', speed: speed });
    }

    /**
     * Sets the target pitch scale for all active tracks.
     * @param {number} pitch - The desired pitch scale (e.g., 1.0 is normal).
     * @public
     */
    function setPitch(pitch) {
        _sendCommandToActiveWorklets({ type: 'setPitch', pitch: pitch });
    }

    /**
     * Sets the gain of the MASTER output node.
     * @param {number} gainValue - The desired gain value (e.g., 1.0 is normal).
     * @public
     */
    function setGain(gainValue) {
        if (masterGainNode && audioContext) {
            // Use setTargetAtTime for smoother changes
            masterGainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.05); // Short ramp
        }
    }

    /**
     * Mutes or unmutes a specific track by setting its dedicated gain node.
     * @param {number} trackIndex - The index of the track (0 or 1).
     * @param {boolean} isMuted - True to mute, false to unmute.
     * @public
     */
     function setTrackMuted(trackIndex, isMuted) {
         const processor = trackProcessors[trackIndex];
         if (processor && processor.trackGainNode && audioContext) {
             const targetGain = isMuted ? 0 : 1;
             console.log(`AudioEngine: Setting track ${trackIndex} mute state to ${isMuted} (gain: ${targetGain})`);
             processor.trackGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.01); // Very fast ramp for mute
         } else {
              console.warn(`AudioEngine: Cannot set mute for track ${trackIndex}, processor or gain node not found.`);
         }
     }

    /**
     * Helper to send a command message to all active worklet processors.
     * @param {object} command - The command object to send (e.g., { type: 'setSpeed', speed: 1.5 }).
     * @private
     */
    function _sendCommandToActiveWorklets(command) {
        trackProcessors.forEach((processor, index) => {
             if (processor && processor.isReady && processor.workletNode) {
                 // console.log(`AudioEngine: Sending command to track ${index}:`, command.type);
                 processor.workletNode.port.postMessage(command);
             }
         });
    }

    // --- Utility Functions ---

    /**
     * Resamples an AudioBuffer to 16kHz mono using OfflineAudioContext.
     * (No changes needed for multi-track, operates on one buffer at a time).
     * @param {AudioBuffer} audioBuffer - The input buffer.
     * @returns {Promise<Float32Array|null>} The resampled PCM data or null on error.
     * @public
     */
     async function resampleTo16kMono(audioBuffer) {
        if (!audioBuffer) return null;
        const targetSampleRate = Constants.VAD_SAMPLE_RATE; // Use constant

        // Check if resampling is needed
        if (audioBuffer.sampleRate === targetSampleRate && audioBuffer.numberOfChannels === 1) {
             console.log("AudioEngine: Audio already 16kHz mono, no resampling needed.");
             return audioBuffer.getChannelData(0).slice(); // Return a copy
        }

        console.log(`AudioEngine: Resampling from ${audioBuffer.sampleRate}Hz/${audioBuffer.numberOfChannels}ch to ${targetSampleRate}Hz/1ch...`);
        const duration = audioBuffer.duration;
        const targetLength = Math.ceil(duration * targetSampleRate);
        if (targetLength <= 0) return new Float32Array(); // Handle zero length

        try {
            // Use OfflineAudioContext for high-quality resampling
             const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
             const bufferSource = offlineCtx.createBufferSource();
             bufferSource.buffer = audioBuffer;
             bufferSource.connect(offlineCtx.destination);
             bufferSource.start(0);

             const renderedBuffer = await offlineCtx.startRendering();
             console.log("AudioEngine: Resampling complete.");
             return renderedBuffer.getChannelData(0); // Return the Float32Array data
        } catch (error) {
             console.error("AudioEngine: Error during resampling:", error);
             _dispatchError('resampling', error); // Dispatch specific error
             return null;
        }
    }

    /**
     * Dispatches a custom event to the document.
     * @param {string} eventName - The name of the event (e.g., 'audioapp:workletReady').
     * @param {object} [detail={}] - Optional data to include in the event detail.
     * @private
     */
    function _dispatchEvent(eventName, detail = {}) {
        document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
    }

    /**
     * Dispatches a standardized error event.
     * @param {string} type - A code indicating the source/type of the error (e.g., 'decoding', 'processor').
     * @param {Error} error - The actual error object.
     * @param {number} [trackIndex] - Optional track index associated with the error.
     * @private
     */
    function _dispatchError(type, error, trackIndex) {
        let detail = { type: type, error: error };
        if (trackIndex !== undefined) { detail.trackIndex = trackIndex; }
        // Dispatch a more specific error type name if possible
        const specificEvent = `audioapp:${type}Error`;
        _dispatchEvent(specificEvent, detail); // e.g., audioapp:decodingError
        // Also dispatch a generic engine error? Maybe not needed if specific is caught.
        // _dispatchEvent('audioapp:engineError', detail);
    }


    // --- Cleanup ---

    /**
     * Cleans up resources for a specific track index.
     * Terminates the worklet, disconnects nodes. Public method.
     * @param {number} trackIndex - The index (0 or 1) of the track to clean up.
     * @public
     */
     function cleanupTrack(trackIndex) { // Renamed _cleanupTrack -> cleanupTrack
         const processor = trackProcessors[trackIndex];
         if (processor) {
             console.log(`AudioEngine: Cleaning up resources for track ${trackIndex}...`);
             if (processor.workletNode) {
                 try {
                     processor.workletNode.port.postMessage({ type: 'reset' }); // Ask worklet to release resources
                     processor.workletNode.port.close(); // Close the message port
                     processor.workletNode.disconnect();
                     console.log(`AudioEngine: WorkletNode for track ${trackIndex} disconnected.`);
                 } catch (e) { console.warn(`AudioEngine: Error during worklet cleanup for track ${trackIndex}`, e); }
                 processor.workletNode = null; // Allow garbage collection
             }
             if (processor.trackGainNode) {
                 try { processor.trackGainNode.disconnect(); }
                 catch (e) { console.warn(`AudioEngine: Error disconnecting trackGainNode for track ${trackIndex}`, e); }
                 processor.trackGainNode = null;
             }
             trackProcessors[trackIndex] = null; // Clear the entry
         }
     }


    /**
     * Cleans up all audio resources (context, nodes, worklets).
     * @public
     */
    function cleanup() {
        console.log("AudioEngine: Cleaning up all resources...");
        cleanupTrack(0); // Use public method
        cleanupTrack(1); // Use public method

        if (masterGainNode) {
            try { masterGainNode.disconnect(); } catch(e) {}
            masterGainNode = null;
        }
        if (audioContext) {
            if (audioContext.state !== 'closed') {
                audioContext.close().then(() => console.log("AudioEngine: AudioContext closed."))
                           .catch(e => console.warn("AudioEngine: Error closing AudioContext:", e));
            }
            audioContext = null;
        }
        workletResourcesLoaded = false;
        workletModuleAdded = false;
        wasmBinary = null;
        rubberbandLoader = null;
        loaderScriptText = null; // Clear cached text
        console.log("AudioEngine: Cleanup complete.");
    }


    /**
     * Returns the main AudioContext instance (e.g., for app time synchronization).
     * @returns {AudioContext|null}
     * @public
     */
    function getAudioContext() {
        return audioContext;
    }

    /*
    // DEPRECATED - app.js now handles time estimation via AudioContext.currentTime
    function getCurrentTime() {
        // This cannot reliably report a single time in a multi-track scenario,
        // and relying on worklet time is discouraged due to drift (see architecture.md).
        // app.js should calculate UI time based on audioContext.currentTime.
        console.warn("AudioEngine.getCurrentTime() is deprecated. Time should be managed in app.js.");
        return { currentTime: 0, duration: 0 }; // Return dummy value
    }
    */

    // === Public Interface ===
    return {
        init: init,
        loadAndProcessTrack: loadAndProcessTrack,
        togglePlayPause: togglePlayPause,
        seek: seek,
        setSpeed: setSpeed,
        setPitch: setPitch,
        setGain: setGain, // Master gain
        setTrackMuted: setTrackMuted,
        resampleTo16kMono: resampleTo16kMono,
        cleanup: cleanup, // Cleanup all tracks
        cleanupTrack: cleanupTrack, // Expose single track cleanup
        getAudioContext: getAudioContext
    };

})(); // End of AudioApp.audioEngine IIFE
// --- /vibe-player/js/player/audioEngine.js ---
// --- END OF FILE js/player/audioEngine.js ---
