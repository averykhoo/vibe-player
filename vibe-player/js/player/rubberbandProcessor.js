// --- /vibe-player/js/player/rubberbandProcessor.js ---
// AudioWorkletProcessor script for time/pitch shifting using Rubberband WASM.
// *** Handles state for up to TWO tracks within ONE worklet instance. ***

// Declare global variable that the loader script's IIFE will populate
var Rubberband;

/**
 * The main AudioWorkletProcessor class for Rubberband.
 * Runs off the main thread, managing state for two potential tracks.
 */
class RubberbandProcessor extends AudioWorkletProcessor {
    // --- Static Properties ---
    static RENDER_QUANTUM_FRAMES = 128;
    static MAX_TRACKS = 2; // Handle up to two tracks

    // --- Instance Properties ---
    /** @type {boolean} Flag indicating if initialization has started. */
    isLoading = false;
    /** @type {boolean} Flag indicating if the WASM module is loaded (but not necessarily RB instances). */
    isWasmReady = false;
    /** @type {any} The loaded Emscripten WASM module instance for Rubberband. */
    Module = null;
    /** @type {Function|null} The Rubberband loader function. */
    rubberbandLoaderFunc = null;
    /** @type {ArrayBuffer|null} Received WASM binary ArrayBuffer. */
    wasmBinary = null;
    /** @type {string|null} Received loader script text. */
    loaderScriptText = null;
    /** @type {number} Sample rate provided during construction (assumed same for both tracks). */
    sampleRate = 0; // Set during construction

    // --- Per-Track State (Arrays indexed by trackIndex 0 or 1) ---
    /** @type {Array<number>} Pointers to RubberbandState instances [track0, track1]. */
    rubberbandState = [0, 0];
    /** @type {Array<number>} Number of channels for each track [track0, track1]. */
    channelCount = [0, 0];
    /** @type {Array<Array<Float32Array>|null>} Audio data [track0[ch0, ch1...], track1[ch0, ch1...]]. */
    audioDataChannels = [null, null];
    /** @type {Array<number>} Current playback position in source samples [track0, track1]. */
    sourcePosition = [0, 0];
    /** @type {Array<number>} Total length of source audio in samples [track0, track1]. */
    sourceLength = [0, 0];
    /** @type {Array<boolean>} Playback state per track [track0, track1]. */
    isPlaying = [false, false];
    /** @type {Array<number>} Input buffer size required by Rubberband [track0, track1]. */
    inputBufferSize = [0, 0];
    /** @type {Array<Array<Float32Array>>} Input buffers [[ch0, ch1...], [ch0, ch1...]]. */
    wasmInputBuffers = [[], []];
    /** @type {Array<Array<Float32Array>>} Output buffers [[ch0, ch1...], [ch0, ch1...]]. */
    wasmOutputBuffers = [[], []];
    /** @type {Array<Array<number>>} Pointers to WASM input buffers [[ptr0, ptr1...], [ptr0, ptr1...]]. */
    wasmInputPtrs = [[], []];
    /** @type {Array<Array<number>>} Pointers to WASM output buffers [[ptr0, ptr1...], [ptr0, ptr1...]]. */
    wasmOutputPtrs = [[], []];
    /** @type {Array<number>} Frames available in Rubberband output [track0, track1]. */
    availableFrames = [0, 0];
    /** @type {Array<boolean>} Whether the processor instance for a track is ready [track0, track1]. */
    isTrackReady = [false, false];

    // --- Shared State ---
    /** @type {number} Target playback speed ratio (applied to both). */
    timeRatio = 1.0;
    /** @type {number} Target pitch scale ratio (applied to both). */
    pitchScale = 1.0;
    /** @type {boolean} Overall playback state (true if ANY track is playing). */
    isOverallPlaying = false;

    /** @type {Array<MessageEvent['data']>|null} Queue for messages received during init. */
    messageQueue = [];


    /** Constructor */
    constructor(options) { /* ... unchanged ... */
        super(options);
        console.log(`[RBProc] Constructor called (Single Instance).`);
        this.isLoading = true;
        this.messageQueue = [];
        try {
            if (!options.processorOptions) throw new Error("processorOptions missing.");
            this.sampleRate = options.processorOptions.sampleRate;
            this.wasmBinary = options.processorOptions.wasmBinary;
            this.loaderScriptText = options.processorOptions.loaderScriptText;
            if (!this.sampleRate) throw new Error("sampleRate missing or invalid.");
            if (!this.wasmBinary) throw new Error("wasmBinary missing.");
            if (!this.loaderScriptText) throw new Error("loaderScriptText missing.");
            console.log(`[RBProc] Options received: SampleRate=${this.sampleRate}`);
            console.log(`[RBProc] Evaluating loader script text...`);
            this.rubberbandLoaderFunc = new Function(this.loaderScriptText + '; return Rubberband;')();
            if (typeof this.rubberbandLoaderFunc !== 'function') {
                throw new Error("Evaluating loader script text did not yield a function.");
            }
            console.log(`[RBProc] Loader function obtained.`);
            this._initializeWasm();
        } catch (error) {
             console.error(`[RBProc] FATAL: Error during constructor setup: ${error.message}`);
             this.port.postMessage({ type: 'error', message: `Processor construction failed: ${error.message}` });
             this.isWasmReady = false; this.isLoading = false;
        }
        this.port.onmessage = this.handleMessage.bind(this);
    }

    /** Initializes WASM */
     async _initializeWasm() { /* ... unchanged ... */
        if (typeof this.rubberbandLoaderFunc !== 'function' || !this.wasmBinary) { this.port.postMessage({ type: 'error', message: 'Internal Error: Loader/Binary not available for WASM init.' }); this.isWasmReady = false; this.isLoading = false; return; }
        console.log(`[RBProc] Initializing WASM...`);
        try {
            const instantiateWasm = (info, receiveInstance) => { console.log("[RBProc] instantiateWasm hook called..."); WebAssembly.instantiate(this.wasmBinary, info).then(({ instance, module }) => { console.log("[RBProc] WebAssembly.instantiate successful."); receiveInstance(instance, module); }).catch(error => { console.error(`[RBProc] WASM Instantiation failed inside hook:`, error); this.port.postMessage({ type: 'error', message: `WASM Instantiation failed inside hook: ${error.message}` }); this.isWasmReady = false; this.isLoading = false; this.Module = null; }); return {}; };
            const moduleArg = { wasmBinary: this.wasmBinary, instantiateWasm: instantiateWasm };
            this.Module = await this.rubberbandLoaderFunc(moduleArg);
            console.log(`[RBProc] WASM Module loading process initiated by loader function.`);
            if (!this.Module) { console.error("[RBProc] WASM Module object is null after loader function finished."); this.isWasmReady = false; this.isLoading = false; return; }
            this.isWasmReady = true;
            console.log(`[RBProc] WASM Module ready. Waiting for track load messages...`);
            this.port.postMessage({ type: 'processorReady' });
        } catch (error) { console.error(`[RBProc] Error initializing WASM (loader function error):`, error); this.port.postMessage({ type: 'error', message: `WASM Initialization loader error: ${error.message}` }); this.isWasmReady = false; this.isLoading = false; this.Module = null;
        } finally { this.isLoading = false; if (this.messageQueue && this.messageQueue.length > 0) { console.log(`[RBProc] Processing ${this.messageQueue.length} buffered messages post-WASM-init...`); while (this.messageQueue.length > 0) { this._processMessage(this.messageQueue.shift()); } this.messageQueue = null; } }
    }

    /** Initializes Rubberband state for a track */
    _initializeRubberbandTrack(trackIndex, numChannels) { /* ... unchanged ... */
        if (!this.isWasmReady || !this.Module || !this.Module._rubberband_new) { console.error(`[RBProc] Cannot init track ${trackIndex}: WASM Module not ready.`); this.port.postMessage({ type: 'error', message: `Cannot init track ${trackIndex}: WASM Module not ready.` }); this.isTrackReady[trackIndex] = false; return false; }
        this._cleanupTrack(trackIndex); // Ensure clean slate
        try {
            const options = this.Module.RubberbandOptions.ProcessRealTime;
            console.log(`[RBProc] Initializing RB instance track ${trackIndex}: Rate=${this.sampleRate}, Chans=${numChannels}, Opts=${options}`);
            this.rubberbandState[trackIndex] = this.Module._rubberband_new(this.sampleRate, numChannels, options, this.timeRatio, this.pitchScale);
            if (!this.rubberbandState[trackIndex]) throw new Error("_rubberband_new failed.");
            console.log(`[RBProc] RB instance track ${trackIndex} created (Ptr: ${this.rubberbandState[trackIndex]}).`);
            this.channelCount[trackIndex] = numChannels;
            this.inputBufferSize[trackIndex] = this.Module._rubberband_get_samples_required(this.rubberbandState[trackIndex]);
            console.log(`[RBProc] RB track ${trackIndex} requires input buffer size: ${this.inputBufferSize[trackIndex]} frames`);
            if (this.inputBufferSize[trackIndex] <= 0) throw new Error(`_rubberband_get_samples_required invalid size.`);
            this._allocateWasmBuffers(trackIndex);
            this.isTrackReady[trackIndex] = true;
            console.log(`[RBProc] Track ${trackIndex} processor instance is ready.`);
            return true;
        } catch (error) { console.error(`[RBProc] Error initializing RB state for track ${trackIndex}:`, error); this.port.postMessage({ type: 'error', message: `RB Init track ${trackIndex} failed: ${error.message}`, trackIndex: trackIndex }); this._cleanupTrack(trackIndex); return false; }
    }

    /** Allocates WASM buffers */
    _allocateWasmBuffers(trackIndex) { /* ... unchanged ... */
        const numChannels = this.channelCount[trackIndex]; const bufferSize = this.inputBufferSize[trackIndex];
        if (!this.Module || !this.Module._malloc || numChannels <= 0 || bufferSize <= 0) { throw new Error("Invalid state for buffer allocation."); }
        this._freeWasmBuffers(trackIndex); const bufferSizeBytes = bufferSize * Float32Array.BYTES_PER_ELEMENT;
        console.log(`[RBProc] Track ${trackIndex}: Allocating ${numChannels} chan(s), ${bufferSizeBytes} bytes/buf (${bufferSize} frames)`);
        this.wasmInputPtrs[trackIndex] = []; this.wasmOutputPtrs[trackIndex] = []; this.wasmInputBuffers[trackIndex] = []; this.wasmOutputBuffers[trackIndex] = [];
        for (let i = 0; i < numChannels; i++) { let inputPtr = 0; let outputPtr = 0; try { inputPtr = this.Module._malloc(bufferSizeBytes); outputPtr = this.Module._malloc(bufferSizeBytes); if (!inputPtr || !outputPtr) throw new Error(`_malloc failed track ${trackIndex} ch ${i}.`); this.wasmInputPtrs[trackIndex].push(inputPtr); this.wasmOutputPtrs[trackIndex].push(outputPtr); this.wasmInputBuffers[trackIndex].push(new Float32Array(this.Module.HEAPF32.buffer, inputPtr, bufferSize)); this.wasmOutputBuffers[trackIndex].push(new Float32Array(this.Module.HEAPF32.buffer, outputPtr, bufferSize)); } catch (allocError) { console.error(`[RBProc] Alloc Error track ${trackIndex} ch ${i}: ${allocError.message}`); if(inputPtr) this.Module._free(inputPtr); if(outputPtr) this.Module._free(outputPtr); this._freeWasmBuffers(trackIndex); throw allocError; } }
        console.log(`[RBProc] Track ${trackIndex}: Finished allocating WASM buffers.`);
    }

    /** Frees WASM buffers */
    _freeWasmBuffers(trackIndex) { /* ... unchanged ... */
        if (!this.Module || !this.Module._free) return; const numInput = this.wasmInputPtrs[trackIndex]?.length || 0; const numOutput = this.wasmOutputPtrs[trackIndex]?.length || 0; if (numInput === 0 && numOutput === 0) return;
        (this.wasmInputPtrs[trackIndex] || []).forEach((ptr) => { try { if(ptr) this.Module._free(ptr); } catch(e) {} }); (this.wasmOutputPtrs[trackIndex] || []).forEach((ptr) => { try { if(ptr) this.Module._free(ptr); } catch(e) {} });
        this.wasmInputPtrs[trackIndex] = []; this.wasmOutputPtrs[trackIndex] = []; this.wasmInputBuffers[trackIndex] = []; this.wasmOutputBuffers[trackIndex] = [];
    }

    /** Handles messages */
    handleMessage(event) { /* ... unchanged ... */
         if (this.isLoading) { console.log(`[RBProc] Buffering message:`, event.data.type); this.messageQueue.push(event.data); return; }
        this._processMessage(event.data);
    }

          /** Internal message processing logic. */
     _processMessage(data) {
        // console.log(`[RBProc] Processing message:`, data.type, data);
        if (!this.isWasmReady && !['load', 'reset'].includes(data.type)) { console.warn(`[RBProc] Ignoring '${data.type}' - WASM not ready.`); return; }
        if (!this.Module && data.type !== 'reset') { console.warn(`[RBProc] Ignoring '${data.type}' - WASM Module not loaded.`); return; }

        try {
            const trackIndex = data.trackIndex;

            switch (data.type) {
                case 'load':
                    if (trackIndex === undefined || trackIndex < 0 || trackIndex >= RubberbandProcessor.MAX_TRACKS) { console.error(`[RBProc] Load invalid trackIndex: ${trackIndex}`); return; }
                    console.log(`[RBProc] Load command received for track ${trackIndex}.`);

                    const loadedAudioData = data.audioData;
                    const numChannels = loadedAudioData?.length || 0;
                    const calculatedSourceLength = numChannels > 0 ? (loadedAudioData[0]?.length || 0) : 0;
                    console.log(`[RBProc] Track ${trackIndex} data length from message: ${calculatedSourceLength} samples.`);

                    this.audioDataChannels[trackIndex] = loadedAudioData;
                    this.sourceLength[trackIndex] = 0; // Reset before init
                    this.sourcePosition[trackIndex] = 0;
                    this.availableFrames[trackIndex] = 0;
                    this.isPlaying[trackIndex] = false;

                    if (numChannels > 0 && calculatedSourceLength > 0) {
                        if (this._initializeRubberbandTrack(trackIndex, numChannels)) {
                             this.sourceLength[trackIndex] = calculatedSourceLength; // Assign length AFTER init
                             console.log(`[RBProc] Track ${trackIndex} initialized & loaded. Chans: ${this.channelCount[trackIndex]}, Len: ${this.sourceLength[trackIndex]} samples.`);
                             this.port.postMessage({ type: 'trackLoadComplete', trackIndex: trackIndex });
                        } else { console.error(`[RBProc] Failed to initialize track ${trackIndex} after load.`); }
                    } else { console.warn(`[RBProc] Load track ${trackIndex} received empty/invalid audio data.`); this._cleanupTrack(trackIndex); }
                    break;

                case 'togglePlayPause':
                    // Removed state recreation from here - just toggle flags
                    this.isOverallPlaying = !this.isOverallPlaying;
                    let actuallyPlayingCount = 0;
                    console.log(`[RBProc] Toggle received. Target overall state: ${this.isOverallPlaying}`);
                    for (let i = 0; i < RubberbandProcessor.MAX_TRACKS; i++) {
                         if(this.isTrackReady[i]) {
                             this.isPlaying[i] = this.isOverallPlaying; // Set based on overall target
                             if (this.isPlaying[i]) {
                                 actuallyPlayingCount++;
                                 console.log(`[RBProc] Setting track ${i} to playing.`);
                             }
                         } else {
                             this.isPlaying[i] = false;
                         }
                    }
                    this.isOverallPlaying = (actuallyPlayingCount > 0); // Final state depends on who could play
                    console.log(`[RBProc] Playback toggled. Final Overall: ${this.isOverallPlaying}, T0: ${this.isPlaying[0]}, T1: ${this.isPlaying[1]}`);
                    this.port.postMessage({ type: 'playbackStateChanged', isPlaying: this.isOverallPlaying });
                    break;

                case 'seek':
                     const seekTime = data.time;
                     const seekSample = Math.max(0, Math.floor(seekTime * this.sampleRate));
                     console.log(`[RBProc] Seek command processed for ALL tracks: ${seekTime.toFixed(3)}s (Sample: ${seekSample})`);
                     for (let i = 0; i < RubberbandProcessor.MAX_TRACKS; i++) {
                          if (this.isTrackReady[i] && this.rubberbandState[i]) { // Check state pointer exists
                               this.sourcePosition[i] = Math.min(seekSample, this.sourceLength[i]);
                               this.availableFrames[i] = 0;
                               // *** FIX: Use reset instead of recreate ***
                               console.log(`[RBProc] Resetting state for track ${i} on seek to sample ${this.sourcePosition[i]}.`);
                               try {
                                   this.Module._rubberband_reset(this.rubberbandState[i]);
                               } catch(e) {
                                   console.error(`[RBProc] Error resetting RB state for track ${i} on seek:`, e);
                                   // If reset fails, maybe cleanup is needed? For now, just log.
                                   this._cleanupTrack(i); // Attempt cleanup if reset fails? Risky.
                                   this.port.postMessage({ type: 'error', message: `RB Reset track ${i} failed: ${e.message}`, trackIndex: i });
                               }
                          }
                     }
                     console.log(`[RBProc] All track states reset after seek.`);
                     // Ensure processor state reflects pause after seek
                     this.isOverallPlaying = false; this.isPlaying = [false, false];
                     this.port.postMessage({ type: 'playbackStateChanged', isPlaying: false });
                    break;

                // ... (setSpeed, setPitch, setMute, reset, default cases - unchanged) ...
                case 'setSpeed': this.timeRatio = data.speed; console.log(`[RBProc] Setting time ratio for ALL tracks: ${this.timeRatio.toFixed(2)}`); for (let i = 0; i < RubberbandProcessor.MAX_TRACKS; i++) { if (this.isTrackReady[i] && this.rubberbandState[i]) { try { this.Module._rubberband_set_time_ratio(this.rubberbandState[i], this.timeRatio); } catch(e) {} } } break;
                case 'setPitch': this.pitchScale = data.pitch; console.log(`[RBProc] Setting pitch scale for ALL tracks: ${this.pitchScale.toFixed(2)}`); for (let i = 0; i < RubberbandProcessor.MAX_TRACKS; i++) { if (this.isTrackReady[i] && this.rubberbandState[i]) { try { this.Module._rubberband_set_pitch_scale(this.rubberbandState[i], this.pitchScale); } catch(e) {} } } break;
                case 'setMute': if (trackIndex === undefined || trackIndex < 0 || trackIndex >= RubberbandProcessor.MAX_TRACKS) { console.error(`[RBProc] setMute invalid trackIndex: ${trackIndex}`); return; } console.log(`[RBProc] Mute command received for track ${trackIndex}: ${data.muted} (Not implemented in worklet)`); break;
                case 'reset': console.log(`[RBProc] Reset/Cleanup command processed.`); this._cleanup(); break;
                default: console.warn(`[RBProc] Unknown message type: ${data.type}`);

            }
        } catch (error) {
             console.error(`[RBProc] Error processing message type ${data.type}:`, error);
             this.port.postMessage({ type: 'error', message: `Error processing command ${data.type}: ${error.message}` });
             this.isOverallPlaying = false; this.isPlaying = [false, false];
        }
    }


    /** Main processing function */
    process(inputs, outputs, parameters) { /* ... unchanged ... */
         if (!this.isWasmReady || !this.Module || !this.isOverallPlaying) { this._outputSilence(outputs); return true; }
        const outputBuffer = outputs[0]; const outputChannelCount = outputBuffer.length; const requestedFrames = outputBuffer[0].length;
        this._outputSilence(outputBuffer); let anyTrackStillPlaying = false;
        try {
            for (let trackIndex = 0; trackIndex < RubberbandProcessor.MAX_TRACKS; trackIndex++) {
                if (!this.isTrackReady[trackIndex] || !this.isPlaying[trackIndex] || !this.rubberbandState[trackIndex]) continue;
                anyTrackStillPlaying = true; let framesWrittenThisTrack = 0; const trackChannelCount = this.channelCount[trackIndex]; const trackInputBufferSize = this.inputBufferSize[trackIndex];
                if (outputChannelCount < trackChannelCount) { console.error(`[RBProc] T${trackIndex}: Output chan mismatch. Stop.`); this.isPlaying[trackIndex] = false; continue; } if (this.wasmInputBuffers[trackIndex]?.length !== trackChannelCount || this.wasmOutputBuffers[trackIndex]?.length !== trackChannelCount) { console.error(`[RBProc] T${trackIndex}: WASM buffer mismatch. Stop.`); this.isPlaying[trackIndex] = false; continue; }
                while (framesWrittenThisTrack < requestedFrames) {
                    if (this.availableFrames[trackIndex] === 0) { this.availableFrames[trackIndex] = this.Module._rubberband_available(this.rubberbandState[trackIndex]); }
                    if (this.availableFrames[trackIndex] > 0) {
                        let framesToRetrieve = Math.min(this.availableFrames[trackIndex], requestedFrames - framesWrittenThisTrack); if (framesToRetrieve > trackInputBufferSize) framesToRetrieve = trackInputBufferSize; if (framesToRetrieve <= 0) break; const outputPtrArray = this.Module.stackAlloc(trackChannelCount * 4); for (let i = 0; i < trackChannelCount; ++i) { this.Module.setValue(outputPtrArray + i * 4, this.wasmOutputPtrs[trackIndex][i], '*'); } const retrieved = this.Module._rubberband_retrieve(this.rubberbandState[trackIndex], outputPtrArray, framesToRetrieve);
                        if (retrieved > 0) { for (let i = 0; i < trackChannelCount; ++i) { const trackOutput = this.wasmOutputBuffers[trackIndex][i]; const mainOutput = outputBuffer[i]; if (mainOutput) { for(let j=0; j < retrieved; j++) { mainOutput[framesWrittenThisTrack + j] += trackOutput[j]; } } } framesWrittenThisTrack += retrieved; this.availableFrames[trackIndex] -= retrieved; } else { this.availableFrames[trackIndex] = 0; break; }
                    } else {
                        if (this.sourcePosition[trackIndex] >= this.sourceLength[trackIndex]) { const inputPtrArray = this.Module.stackAlloc(trackChannelCount * 4); for (let i = 0; i < trackChannelCount; ++i) { this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[trackIndex][i], '*'); } this.Module._rubberband_process(this.rubberbandState[trackIndex], inputPtrArray, 0, true); this.availableFrames[trackIndex] = this.Module._rubberband_available(this.rubberbandState[trackIndex]); if (this.availableFrames[trackIndex] <= 0) { /* console.log(`[RBProc] T${trackIndex}: End of source & flushed.`); */ this.isPlaying[trackIndex] = false; break; } continue; }
                        const framesToProcess = Math.min(trackInputBufferSize, this.sourceLength[trackIndex] - this.sourcePosition[trackIndex]); if (framesToProcess <= 0) { console.warn(`[RBProc] T${trackIndex}: framesToProcess is ${framesToProcess}. Stop.`); this.isPlaying[trackIndex] = false; break; } const inputPtrArray = this.Module.stackAlloc(trackChannelCount * 4); for (let i = 0; i < trackChannelCount; ++i) { const channelData = this.audioDataChannels[trackIndex]?.[i]; if (!channelData) throw new Error(`Missing audio T${trackIndex} Ch${i}`); const subArray = channelData.subarray(this.sourcePosition[trackIndex], this.sourcePosition[trackIndex] + framesToProcess); this.wasmInputBuffers[trackIndex][i].set(subArray); if (framesToProcess < trackInputBufferSize) { this.wasmInputBuffers[trackIndex][i].fill(0, framesToProcess); } this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[trackIndex][i], '*'); } this.Module._rubberband_process(this.rubberbandState[trackIndex], inputPtrArray, framesToProcess, false); this.sourcePosition[trackIndex] += framesToProcess; this.availableFrames[trackIndex] = this.Module._rubberband_available(this.rubberbandState[trackIndex]); if (this.availableFrames[trackIndex] <= 0 && framesWrittenThisTrack === 0) { break; }
                    }
                }
            }
            this.isOverallPlaying = this.isPlaying[0] || this.isPlaying[1];
            if (!this.isOverallPlaying && anyTrackStillPlaying) { console.log(`[RBProc] Both tracks finished playing.`); this.port.postMessage({ type: 'playbackEnded' }); }
        } catch(error) { console.error(`[RBProc] Error during process loop:`, error); this.port.postMessage({ type: 'error', message: `Processing error: ${error.message}`}); this.isPlaying = [false, false]; this.isOverallPlaying = false; this._outputSilence(outputBuffer); }
        return true;
    }

    /** Fills output buffers with silence */
    _outputSilence(outputBuffer, startIndex = 0) { /* ... unchanged ... */
        const channels = outputBuffer?.[0]; if (!channels) return;
        for (const channel of channels) { if (channel && startIndex < channel.length) { try { channel.fill(0, startIndex); } catch(e) { if (!this._silenceErrorLogged) { console.error(`[RBProc] Error filling silence:`, e); this._silenceErrorLogged = true; } } } }
    }

          /** Cleans up resources for a specific track, EXCEPT the audio data itself. */
     _cleanupTrack(trackIndex) {
         // console.log(`[RBProc] Cleaning up resources for track ${trackIndex}...`); // Less verbose
         this.isPlaying[trackIndex] = false;
         this.isTrackReady[trackIndex] = false;

         // Delete the Rubberband state instance
         if (this.Module && this.rubberbandState[trackIndex]) {
             try { this.Module._rubberband_delete(this.rubberbandState[trackIndex]); } catch(e) {}
             this.rubberbandState[trackIndex] = 0;
         }
         // Free WASM buffers
         try { this._freeWasmBuffers(trackIndex); } catch(e) {}

         // *** DO NOT CLEAR AUDIO DATA HERE ***
         // this.audioDataChannels[trackIndex] = null; // REMOVED

         // Reset other track-specific state
         this.sourcePosition[trackIndex] = 0;
         // Keep sourceLength - it's tied to the audioDataChannels
         // this.sourceLength[trackIndex] = 0; // Keep
         // Keep channelCount - it's tied to audioDataChannels
         // this.channelCount[trackIndex] = 0; // Keep
         this.availableFrames[trackIndex] = 0;
         this.inputBufferSize[trackIndex] = 0;
         // console.log(`[RBProc] Track ${trackIndex} cleanup finished (kept audio data).`); // Less verbose
     }

    /** Cleans up all resources */
     _cleanup() { /* ... unchanged ... */
         console.log(`[RBProc] Cleaning up ALL resources...`); this._cleanupTrack(0); this._cleanupTrack(1); this.isOverallPlaying = false; this.timeRatio = 1.0; this.pitchScale = 1.0; console.log(`[RBProc] Full cleanup finished.`);
     }
}

// Register the processor
try {
     registerProcessor('rubberband-processor', RubberbandProcessor);
} catch (error) { console.error("Failed to register RubberbandProcessor:", error); }
// --- /vibe-player/js/player/rubberbandProcessor.js ---
