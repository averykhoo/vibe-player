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
    let loaderScriptText = null;


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
            loaderScriptText = null;
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
                const wasmResponse = await fetch(Constants.WASM_BINARY_URL);
                if (!wasmResponse.ok) throw new Error(`Failed to fetch WASM: ${wasmResponse.statusText}`);
                wasmBinary = await wasmResponse.arrayBuffer();
                console.log("AudioEngine: WASM binary loaded.");
            }

            // Fetch Loader Script Text only if not already loaded
            if (loaderScriptText === null) {
                const loaderResponse = await fetch(Constants.LOADER_SCRIPT_URL);
                if (!loaderResponse.ok) throw new Error(`Failed to fetch Loader Script: ${loaderResponse.statusText}`);
                loaderScriptText = await loaderResponse.text();
                console.log("AudioEngine: Custom WASM Loader script text loaded.");
            }

            // Add the main processor module ONCE if not already added.
            if (!workletModuleAdded) {
                 console.log(`AudioEngine: Adding AudioWorklet module: ${Constants.PROCESSOR_SCRIPT_URL}`);
                 if (audioContext.state === 'suspended') {
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

        // Ensure resources are loaded
        const resourcesReady = await _loadWorkletResources();
        if (!resourcesReady || !wasmBinary || !loaderScriptText || !workletModuleAdded) {
             console.error(`AudioEngine: Cannot load track ${trackIndex}, worklet resources failed to load.`);
             return;
        }

        // Cleanup existing processor for this track index, if any
        _cleanupTrack(trackIndex);

        try {
            // 1. Decode Audio Data
            console.log(`AudioEngine: Decoding audio data for track ${trackIndex}...`);
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log(`AudioEngine: Track ${trackIndex} decoded. Sample Rate: ${audioBuffer.sampleRate}, Duration: ${audioBuffer.duration.toFixed(2)}s`);

            // Dispatch audio loaded event WITH trackIndex
            _dispatchEvent('audioapp:audioLoaded', { audioBuffer: audioBuffer, trackIndex: trackIndex });

            // 2. Create Per-Track Gain Node
            const trackGainNode = audioContext.createGain();
            trackGainNode.connect(masterGainNode); // Connect track gain to master gain

            // 3. Create AudioWorkletNode for this track
            const processorOptions = {
                sampleRate: audioBuffer.sampleRate,
                wasmBinary: wasmBinary,
                loaderScriptText: loaderScriptText,
                channelCount: audioBuffer.numberOfChannels
            };
            // console.log(`AudioEngine: Creating AudioWorkletNode for track ${trackIndex} with options:`, { ... }); // Avoid logging large data

            if (audioContext.state === 'suspended') {
                 await audioContext.resume();
            }

            const workletNode = new AudioWorkletNode(audioContext, Constants.PROCESSOR_NAME, {
                 processorOptions: processorOptions,
                 numberOfInputs: 0,
                 numberOfOutputs: 1,
                 outputChannelCount: [audioBuffer.numberOfChannels]
            });

            // 4. Connect nodes: Worklet -> Track Gain -> Master Gain -> Destination
            workletNode.connect(trackGainNode);

            // 5. Store processor state
            trackProcessors[trackIndex] = {
                workletNode: workletNode,
                isReady: false,
                trackGainNode: trackGainNode,
                sampleRate: audioBuffer.sampleRate
            };

            // 6. Setup Message & Error Handling
             workletNode.port.onmessage = (event) => {
                 _handleWorkletMessage(event, trackIndex);
             };
             workletNode.port.onerror = (event) => {
                  _handleWorkletError(event, trackIndex);
             };
             console.log(`AudioEngine: Worklet node created and connected for track ${trackIndex}. Waiting for processor ready message...`);

            // 7. Send initial data to worklet
             const channels = [];
             for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
                 channels.push(audioBuffer.getChannelData(i).slice());
             }
             const loadMessage = {
                 type: 'load',
                 audioData: channels,
                 sampleRate: audioBuffer.sampleRate
             };
             console.log(`AudioEngine: Sending 'load' message to track ${trackIndex} worklet.`); // Added Log
             workletNode.port.postMessage(loadMessage, channels.map(c => c.buffer));

        } catch (error) {
            console.error(`AudioEngine: Error processing track ${trackIndex}:`, error);
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
        if (!processor) return;

        // console.log(`AudioEngine: Message from track ${trackIndex} worklet:`, data.type); // Optional verbose log

        switch (data.type) {
            case 'processorReady':
                console.log(`AudioEngine: Processor for track ${trackIndex} reported ready.`);
                processor.isReady = true;
                _dispatchEvent('audioapp:workletReady', { trackIndex: trackIndex });
                break;
            case 'playbackStateChanged':
                _dispatchEvent('audioapp:playbackStateChanged', { isPlaying: data.isPlaying, trackIndex: trackIndex });
                break;
             case 'playbackEnded':
                 console.log(`AudioEngine: Track ${trackIndex} playback ended event from worklet.`);
                 _dispatchEvent('audioapp:playbackEnded', { trackIndex: trackIndex });
                 break;
            case 'internalSpeedChanged':
                 console.log(`AudioEngine: Track ${trackIndex} internal speed reported: ${data.speed}`);
                 _dispatchEvent('audioapp:internalSpeedChanged', { speed: data.speed, trackIndex: trackIndex });
                 break;
            case 'error':
                console.error(`AudioEngine: Error message from track ${trackIndex} worklet:`, data.message);
                _dispatchError('processor', new Error(data.message), trackIndex);
                break;
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
         const error = event instanceof ErrorEvent ? event.error : new Error(`Worklet port error for track ${trackIndex}`);
         _dispatchError('processor', error, trackIndex);
     }

    // --- Playback Controls (Act on all active tracks) ---

    /**
     * Toggles playback state (play/pause) for all active tracks.
     * Sends commands to the corresponding worklets.
     * @public
     */
    function togglePlayPause() {
        if (!audioContext) return;
        console.log("AudioEngine: Sending command 'togglePlayPause' to active worklets."); // Added Log
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
     * Initiates seek for all active tracks to a target time on the shared timeline.
     * Calls _seekTrack for each active track.
     * @param {number} targetSharedTime - The target time in seconds on the shared timeline.
     * @public
     */
    function seek(targetSharedTime) {
        if (!audioContext) return;
        console.log(`AudioEngine: Initiating seek for all active tracks to shared time ${targetSharedTime.toFixed(3)}s`); // Modified Log
        trackProcessors.forEach((processor, index) => {
             if (processor && processor.isReady && processor.workletNode) {
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
             if (typeof targetTime !== 'number' || isNaN(targetTime)) {
                 console.warn(`AudioEngine: Invalid seek time (${targetTime}) for track ${trackIndex}`);
                 return;
             }
             const clampedTime = Math.max(0, targetTime);
             console.log(`AudioEngine: Sending 'seek' command to track ${trackIndex} worklet: ${clampedTime.toFixed(3)}s`); // Added Log
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
        console.log(`AudioEngine: Sending command 'setSpeed' (${speed.toFixed(2)}) to active worklets.`); // Added Log
        _sendCommandToActiveWorklets({ type: 'setSpeed', speed: speed });
    }

    /**
     * Sets the target pitch scale for all active tracks.
     * @param {number} pitch - The desired pitch scale (e.g., 1.0 is normal).
     * @public
     */
    function setPitch(pitch) {
        console.log(`AudioEngine: Sending command 'setPitch' (${pitch.toFixed(2)}) to active worklets.`); // Added Log
        _sendCommandToActiveWorklets({ type: 'setPitch', pitch: pitch });
    }

    /**
     * Sets the gain of the MASTER output node.
     * @param {number} gainValue - The desired gain value (e.g., 1.0 is normal).
     * @public
     */
    function setGain(gainValue) {
        if (masterGainNode && audioContext) {
            console.log(`AudioEngine: Setting master gain to ${gainValue.toFixed(2)}.`); // Added Log
            masterGainNode.gain.setTargetAtTime(gainValue, audioContext.currentTime, 0.05);
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
             // Added more detailed log here
             console.log(`AudioEngine: Setting track ${trackIndex} gain node to ${targetGain} (muted: ${isMuted}).`);
             processor.trackGainNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, 0.01);
         } else {
              // Keep warning if called too early
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
                 processor.workletNode.port.postMessage(command);
             }
         });
    }

    // --- Utility Functions ---

    /**
     * Resamples an AudioBuffer to 16kHz mono using OfflineAudioContext.
     * @param {AudioBuffer} audioBuffer - The input buffer.
     * @returns {Promise<Float32Array|null>} The resampled PCM data or null on error.
     * @public
     */
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
             const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
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
        _dispatchEvent('audioapp:engineError', detail);
    }

    // --- Cleanup ---

    /**
     * Cleans up resources for a specific track index.
     * Terminates the worklet, disconnects nodes.
     * @param {number} trackIndex - The index (0 or 1) of the track to clean up.
     * @private
     */
     function _cleanupTrack(trackIndex) {
         const processor = trackProcessors[trackIndex];
         if (processor) {
             console.log(`AudioEngine: Cleaning up resources for track ${trackIndex}...`);
             if (processor.workletNode) {
                 try {
                     processor.workletNode.port.postMessage({ type: 'reset' });
                     processor.workletNode.port.close();
                     processor.workletNode.disconnect();
                     console.log(`AudioEngine: WorkletNode for track ${trackIndex} disconnected.`);
                 } catch (e) { console.warn(`AudioEngine: Error during worklet cleanup for track ${trackIndex}`, e); }
                 processor.workletNode = null;
             }
             if (processor.trackGainNode) {
                 try { processor.trackGainNode.disconnect(); }
                 catch (e) { console.warn(`AudioEngine: Error disconnecting trackGainNode for track ${trackIndex}`, e); }
                 processor.trackGainNode = null;
             }
             trackProcessors[trackIndex] = null;
         }
     }


    /**
     * Cleans up all audio resources (context, nodes, worklets).
     * @public
     */
    function cleanup() {
        console.log("AudioEngine: Cleaning up all resources...");
        _cleanupTrack(0);
        _cleanupTrack(1);

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

    // === Public Interface ===
    return {
        init: init,
        loadAndProcessTrack: loadAndProcessTrack,
        togglePlayPause: togglePlayPause,
        seek: seek,
        setSpeed: setSpeed,
        setPitch: setPitch,
        setGain: setGain, // Master gain
        setTrackMuted: setTrackMuted, // Track-specific mute
        resampleTo16kMono: resampleTo16kMono,
        cleanup: cleanup,
        getAudioContext: getAudioContext
    };

})(); // End of AudioApp.audioEngine IIFE
// --- /vibe-player/js/player/audioEngine.js ---
