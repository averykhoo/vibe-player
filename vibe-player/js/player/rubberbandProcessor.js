// --- /vibe-player/js/player/rubberbandProcessor.js ---
// AudioWorkletProcessor script for time/pitch shifting using Rubberband WASM.
// Evaluates loader script text received via options.

/**
 * @typedef {import("../constants.js").AudioApp.Constants} Constants
 */

// Declare global variable that the loader script's IIFE will populate
var Rubberband;

/**
 * The main AudioWorkletProcessor class for Rubberband.
 * Runs off the main thread.
 */
class RubberbandProcessor extends AudioWorkletProcessor {
    // --- Static Properties ---
    static RENDER_QUANTUM_FRAMES = 128; // Defined by Web Audio API

    // --- Instance Properties ---
    /** @type {boolean} Flag indicating if initialization has started. */
    isLoading = false;
    /** @type {boolean} Flag indicating if the WASM module is loaded and Rubberband initialized. */
    isReady = false;
    /** @type {any} The loaded Emscripten WASM module instance for Rubberband. */
    Module = null;
     /** @type {Function|null} The Rubberband loader function obtained by evaluating script text. */
     rubberbandLoaderFunc = null;
    /** @type {number} Pointer to the RubberbandState instance in WASM memory. */
    rubberbandState = 0;
    /** @type {number} The sample rate provided during construction (critical!). */
    sampleRate = 0;
    /** @type {number} Number of audio channels specified during construction. */
    initialChannelCount = 1;
     /** @type {number} Actual number of audio channels from loaded data. */
    channelCount = 1;
    /** @type {ArrayBuffer|null} Received WASM binary ArrayBuffer. */
    wasmBinary = null;
    /** @type {Array<Float32Array>|null} Array holding audio data for each channel. */
    audioDataChannels = null;
    /** @type {number} Current playback position in source samples. */
    sourcePosition = 0;
    /** @type {number} Total length of the source audio in samples. */
    sourceLength = 0;
    /** @type {boolean} Playback state (playing or paused). */
    isPlaying = false;
    /** @type {number} Target playback speed ratio. */
    timeRatio = 1.0;
    /** @type {number} Target pitch scale ratio. */
    pitchScale = 1.0;
    /** @type {number} Size of the input buffer required by Rubberband. */
    inputBufferSize = 0;
    /** @type {Array<Float32Array>} Buffers to hold input data for Rubberband processing. */
    wasmInputBuffers = [];
    /** @type {Array<Float32Array>} Buffers to hold output data from Rubberband processing. */
    wasmOutputBuffers = [];
    /** @type {Array<number>} Pointers to WASM memory for input buffers. */
    wasmInputPtrs = [];
    /** @type {Array<number>} Pointers to WASM memory for output buffers. */
    wasmOutputPtrs = [];
    /** @type {number} Number of frames available in Rubberband's output buffer. */
    availableFrames = 0;
    /** @type {Array<MessageEvent['data']>|null} Queue for messages received during init. */
     messageQueue = [];
    /** @type {number} Unique ID for logging instance distinction */ // NEW: Instance ID
    instanceId = Math.floor(Math.random() * 1000);


    /**
     * Constructor: Called when the node is created.
     * Receives options from the main thread (AudioWorkletNode constructor).
     * Evaluates loader script text and kicks off asynchronous WASM initialization.
     * @param {AudioWorkletNodeOptions} options
     */
    constructor(options) {
        super(options);
        console.log(`[RBProc-${this.instanceId}] Constructor called.`); // Added ID
        this.isLoading = true; // Mark as loading
        this.messageQueue = []; // Initialize queue

        // --- Get Essential Options & Evaluate Loader ---
        try {
            if (!options.processorOptions) {
                 throw new Error("processorOptions missing.");
            }
            this.sampleRate = options.processorOptions.sampleRate;
            this.wasmBinary = options.processorOptions.wasmBinary;
            const loaderScriptText = options.processorOptions.loaderScriptText;
            this.initialChannelCount = options.processorOptions.channelCount || 1;
            this.channelCount = this.initialChannelCount;

            if (!this.sampleRate) throw new Error("sampleRate missing or invalid.");
            if (!this.wasmBinary) throw new Error("wasmBinary missing.");
            if (!loaderScriptText) throw new Error("loaderScriptText missing.");

            console.log(`[RBProc-${this.instanceId}] Options received: SampleRate=${this.sampleRate}, Channels=${this.initialChannelCount}`);

             // Evaluate the loader script text to get the loader function
             console.log(`[RBProc-${this.instanceId}] Evaluating loader script text...`);
             this.rubberbandLoaderFunc = new Function(loaderScriptText + '; return Rubberband;')();
             if (typeof this.rubberbandLoaderFunc !== 'function') {
                 throw new Error("Evaluating loader script text did not yield a function.");
             }
             console.log(`[RBProc-${this.instanceId}] Loader function obtained.`);

            // Start async WASM initialization
            this._initializeWasm();

        } catch (error) {
             console.error(`[RBProc-${this.instanceId}] FATAL: Error during constructor setup: ${error.message}`);
             this.port.postMessage({ type: 'error', message: `Processor construction failed: ${error.message}` });
             this.isReady = false;
             this.isLoading = false;
        }

        this.port.onmessage = this.handleMessage.bind(this);
    }

    /**
     * Initializes the Rubberband WASM module using the evaluated loader function.
     * @private
     * @returns {Promise<void>}
     */
     async _initializeWasm() {
        if (typeof this.rubberbandLoaderFunc !== 'function') {
            this.port.postMessage({ type: 'error', message: 'Internal Error: Loader function not available for WASM init.' });
            this.isReady = false; this.isLoading = false; return;
        }
        if (!this.wasmBinary) {
             this.port.postMessage({ type: 'error', message: 'Internal Error: WASM binary not available for WASM init.' });
             this.isReady = false; this.isLoading = false; return;
        }

        console.log(`[RBProc-${this.instanceId}] Initializing WASM...`);
        try {
            // Instantiate WASM using the custom loader function
            const moduleArg = {
                wasmBinary: this.wasmBinary,
                instantiateWasm: (info, receiveInstance) => {
                    WebAssembly.instantiate(this.wasmBinary, info)
                        .then(({ instance }) => receiveInstance(instance))
                        .catch(error => {
                             console.error(`[RBProc-${this.instanceId}] WASM Instantiation failed:`, error);
                             this.port.postMessage({ type: 'error', message: `WASM Instantiation failed: ${error.message}` });
                             this.isReady = false; this.isLoading = false; this.Module = null;
                        });
                }
            };
            this.Module = await this.rubberbandLoaderFunc(moduleArg);
            console.log(`[RBProc-${this.instanceId}] WASM Module loaded.`);

             if (!this.Module) {
                  throw new Error("WASM Module object was not created after loader execution.");
             }

            // Initialize Rubberband state *after* WASM is loaded
            this._initializeRubberband();

        } catch (error) {
            console.error(`[RBProc-${this.instanceId}] Error initializing WASM:`, error);
            this.port.postMessage({ type: 'error', message: `WASM Initialization failed: ${error.message}` });
            this.isReady = false;
            this.isLoading = false;
            this.Module = null;
        } finally {
             this.isLoading = false; // Finished loading attempt
             if (this.messageQueue && this.messageQueue.length > 0) {
                  console.log(`[RBProc-${this.instanceId}] Processing ${this.messageQueue.length} buffered messages post-init attempt...`);
                  while (this.messageQueue.length > 0) {
                       this._processMessage(this.messageQueue.shift());
                  }
                  this.messageQueue = null;
             }
        }
    }

    /**
     * Initializes the Rubberband state using the loaded WASM module.
     * Called after _initializeWasm completes successfully.
     * @private
     */
    _initializeRubberband() {
        if (!this.Module || !this.Module._rubberband_new) {
             console.error(`[RBProc-${this.instanceId}] WASM Module or _rubberband_new not available for Rubberband init.`);
             this.port.postMessage({ type: 'error', message: 'WASM Module methods not available post-load.' });
             this.isReady = false;
             return;
        }
        try {
            const channels = this.initialChannelCount;
            // --- SIMPLIFIED OPTIONS ---
            // const options = this.Module.RubberbandOptions.ProcessRealTime |
            //                 this.Module.RubberbandOptions.PitchHighQuality |
            //                 this.Module.RubberbandOptions.PhaseIndependent |
            //                 this.Module.RubberbandOptions.TransientsCrisp;
            const options = this.Module.RubberbandOptions.ProcessRealTime; // Use minimal options
            // const options = this.Module.RubberbandOptions.ProcessOffline; // Alternative minimal
            // const options = 0; // Default options (equivalent to ProcessOffline)

            console.log(`[RBProc-${this.instanceId}] Initializing Rubberband instance with Rate: ${this.sampleRate}, Channels: ${channels}, Options: ${options} (SIMPLIFIED)`);

            this.rubberbandState = this.Module._rubberband_new(this.sampleRate, channels, options, this.timeRatio, this.pitchScale);

            if (!this.rubberbandState) {
                 throw new Error("_rubberband_new returned null or zero pointer.");
            }

            console.log(`[RBProc-${this.instanceId}] Rubberband instance created (State Ptr: ${this.rubberbandState}).`);

            this.inputBufferSize = this.Module._rubberband_get_samples_required(this.rubberbandState);
            console.log(`[RBProc-${this.instanceId}] Rubberband requires input buffer size: ${this.inputBufferSize} frames`);
             if (this.inputBufferSize <= 0) {
                  throw new Error(`_rubberband_get_samples_required returned invalid size: ${this.inputBufferSize}`);
             }

            this._allocateWasmBuffers(channels); // Will throw on error

            this.isReady = true;
            this.port.postMessage({ type: 'processorReady' });
            console.log(`[RBProc-${this.instanceId}] Processor is ready.`);

        } catch (error) {
            console.error(`[RBProc-${this.instanceId}] Error initializing Rubberband state:`, error);
            this.port.postMessage({ type: 'error', message: `Rubberband Initialization failed: ${error.message}` });
            this.isReady = false;
            this._freeWasmBuffers(); // Attempt cleanup
        }
    }

    /**
     * Allocates input and output buffers in WASM memory.
     * @param {number} channels - Number of channels.
     * @private
     */
    _allocateWasmBuffers(channels) {
        if (!this.Module || !this.Module._malloc || this.inputBufferSize <= 0) {
             console.error(`[RBProc-${this.instanceId}] Cannot allocate buffers: Module/malloc not ready or invalid buffer size.`);
             throw new Error("WASM module or buffer size invalid for allocation.");
        }
        this._freeWasmBuffers(); // Free existing buffers first

        const bufferSizeBytes = this.inputBufferSize * Float32Array.BYTES_PER_ELEMENT;
        console.log(`[RBProc-${this.instanceId}] Allocating ${channels} channel(s), ${bufferSizeBytes} bytes per buffer (${this.inputBufferSize} frames)`);

        for (let i = 0; i < channels; i++) {
            let inputPtr = 0; let outputPtr = 0;
            try {
                inputPtr = this.Module._malloc(bufferSizeBytes);
                outputPtr = this.Module._malloc(bufferSizeBytes);
                 if (!inputPtr || !outputPtr) {
                      throw new Error(`_malloc returned null pointer for channel ${i}.`);
                 }
                this.wasmInputPtrs.push(inputPtr);
                this.wasmOutputPtrs.push(outputPtr);
                // Add pointer logging
                console.log(`[RBProc-${this.instanceId}] Allocated ch ${i}: Input Ptr=${inputPtr}, Output Ptr=${outputPtr}`);
                this.wasmInputBuffers.push(new Float32Array(this.Module.HEAPF32.buffer, inputPtr, this.inputBufferSize));
                this.wasmOutputBuffers.push(new Float32Array(this.Module.HEAPF32.buffer, outputPtr, this.inputBufferSize));
            } catch (allocError) {
                 console.error(`[RBProc-${this.instanceId}] Error allocating WASM memory for ch ${i}: ${allocError.message}`);
                  if(inputPtr) this.Module._free(inputPtr);
                  if(outputPtr) this.Module._free(outputPtr);
                 this._freeWasmBuffers(); // Free anything already in the arrays
                 throw allocError;
            }
        }
        console.log(`[RBProc-${this.instanceId}] Finished allocating WASM buffers for ${channels} channels.`);
    }

    /**
     * Frees previously allocated WASM memory for buffers.
     * @private
     */
    _freeWasmBuffers() {
        if (!this.Module || !this.Module._free) return;
        console.log(`[RBProc-${this.instanceId}] Freeing ${this.wasmInputPtrs.length + this.wasmOutputPtrs.length} WASM buffers...`);
        this.wasmInputPtrs.forEach((ptr, i) => {
            try { if(ptr) { console.log(`[RBProc-${this.instanceId}] Freeing Input Ptr ch ${i}: ${ptr}`); this.Module._free(ptr); } } catch(e) {}
        });
        this.wasmOutputPtrs.forEach((ptr, i) => {
            try { if(ptr) { console.log(`[RBProc-${this.instanceId}] Freeing Output Ptr ch ${i}: ${ptr}`); this.Module._free(ptr); } } catch(e) {}
        });
        this.wasmInputPtrs = [];
        this.wasmOutputPtrs = [];
        this.wasmInputBuffers = [];
        this.wasmOutputBuffers = [];
        console.log(`[RBProc-${this.instanceId}] Buffers freed.`);
    }

    /**
     * Handles messages received from the main thread (AudioEngine).
     * Buffers messages if initialization is still in progress.
     * @param {MessageEvent} event
     */
    handleMessage(event) {
         if (this.isLoading) {
             console.log(`[RBProc-${this.instanceId}] Buffering message received during load:`, event.data.type);
             this.messageQueue.push(event.data); // Queue the data part only
             return;
         }
        this._processMessage(event.data);
    }

     /**
      * Internal message processing logic.
      * @param {any} data - The message data object.
      * @private
      */
     _processMessage(data) {
        // console.log(`[RBProc-${this.instanceId}] Processing message:`, data.type); // Less verbose log

        if (!this.isReady && !['load', 'reset'].includes(data.type)) {
             console.warn(`[RBProc-${this.instanceId}] Ignoring command '${data.type}' because processor is not ready.`);
             return;
        }
        if (!this.Module && data.type !== 'reset') {
             console.warn(`[RBProc-${this.instanceId}] Ignoring command '${data.type}' because WASM Module not loaded.`);
             return;
        }

        try {
            switch (data.type) {
                case 'load':
                    console.log(`[RBProc-${this.instanceId}] Load command processed.`);
                     if (!this.Module || !this.rubberbandState) {
                          console.error(`[RBProc-${this.instanceId}] Cannot process 'load': Module or Rubberband state not initialized.`);
                          return;
                     }
                    this.audioDataChannels = data.audioData;
                    const newChannelCount = this.audioDataChannels ? this.audioDataChannels.length : 0;
                    this.sourceLength = newChannelCount > 0 ? this.audioDataChannels[0].length : 0;
                    this.sourcePosition = 0;
                    this.availableFrames = 0;

                    if (newChannelCount <= 0) {
                         console.warn(`[RBProc-${this.instanceId}] Load received empty audio data.`);
                         this.channelCount = 0;
                         this._freeWasmBuffers(); // Free buffers if no channels
                         this.Module._rubberband_reset(this.rubberbandState);
                    } else if (newChannelCount !== this.channelCount) {
                        console.warn(`[RBProc-${this.instanceId}] Channel count changed (${this.channelCount} -> ${newChannelCount}). Re-allocating buffers & resetting state.`);
                        this.channelCount = newChannelCount;
                        this._allocateWasmBuffers(this.channelCount); // Re-allocate (will free first)
                        this.Module._rubberband_reset(this.rubberbandState);
                        console.log(`[RBProc-${this.instanceId}] Buffers re-allocated for ${this.channelCount} channels.`)
                    } else {
                        // Channel count same, just reset state and buffers
                        this.Module._rubberband_reset(this.rubberbandState);
                        // Ensure buffers are valid (might have been freed on error)
                        if(this.wasmInputPtrs.length !== this.channelCount) {
                           console.warn(`[RBProc-${this.instanceId}] Buffers were invalid on load/reset. Re-allocating.`);
                           this._allocateWasmBuffers(this.channelCount);
                        }
                    }
                    console.log(`[RBProc-${this.instanceId}] Audio loaded. Channels: ${this.channelCount}, Source length: ${this.sourceLength} samples.`);
                    break;
                case 'togglePlayPause':
                    this.isPlaying = !this.isPlaying;
                    console.log(`[RBProc-${this.instanceId}] Playback state toggled to: ${this.isPlaying}`);
                    this.port.postMessage({ type: 'playbackStateChanged', isPlaying: this.isPlaying });
                    break;
                case 'seek':
                     if (!this.Module || !this.rubberbandState) {
                         console.warn(`[RBProc-${this.instanceId}] Cannot seek: Module/State not ready.`);
                         return;
                     }
                     const seekTime = data.time;
                     const seekSample = Math.max(0, Math.floor(seekTime * this.sampleRate));
                     console.log(`[RBProc-${this.instanceId}] Seek command processed: ${seekTime.toFixed(3)}s (Sample: ${seekSample})`);
                     this.sourcePosition = Math.min(seekSample, this.sourceLength);
                     this.availableFrames = 0;
                     // It's crucial to reset Rubberband state on seek
                     this.Module._rubberband_reset(this.rubberbandState);
                     console.log(`[RBProc-${this.instanceId}] Rubberband state reset after seek.`);
                    break;
                case 'setSpeed':
                     if (!this.Module || !this.rubberbandState) {
                         console.warn(`[RBProc-${this.instanceId}] Cannot set speed: Module/State not ready.`);
                         return;
                     }
                     this.timeRatio = data.speed;
                     console.log(`[RBProc-${this.instanceId}] Setting time ratio: ${this.timeRatio.toFixed(2)}`);
                     this.Module._rubberband_set_time_ratio(this.rubberbandState, this.timeRatio);
                    break;
                case 'setPitch':
                    if (!this.Module || !this.rubberbandState) {
                         console.warn(`[RBProc-${this.instanceId}] Cannot set pitch: Module/State not ready.`);
                         return;
                    }
                    this.pitchScale = data.pitch;
                    console.log(`[RBProc-${this.instanceId}] Setting pitch scale: ${this.pitchScale.toFixed(2)}`);
                    this.Module._rubberband_set_pitch_scale(this.rubberbandState, this.pitchScale);
                    break;
                case 'reset':
                    console.log(`[RBProc-${this.instanceId}] Reset/Cleanup command processed.`);
                    this._cleanup();
                    break;
                default:
                    console.warn(`[RBProc-${this.instanceId}] Unknown message type: ${data.type}`);
            }
        } catch (error) {
             console.error(`[RBProc-${this.instanceId}] Error processing message type ${data.type}:`, error);
             this.port.postMessage({ type: 'error', message: `Error processing command ${data.type}: ${error.message}` });
             this.isPlaying = false; // Stop playback on error
        }
    }


        /**
     * Main processing function called by the AudioWorklet system.
     * @param {Array<Array<Float32Array>>} inputs - Input audio data (not used).
     * @param {Array<Array<Float32Array>>} outputs - Output buffers to fill.
     * @param {Record<string, Float32Array>} parameters - Audio parameters (not used).
     * @returns {boolean} Return true to keep processor alive.
     */
    process(inputs, outputs, parameters) {
         // Simplified readiness check
         if (!this.isReady || !this.Module || !this.rubberbandState || !this.isPlaying || !this.audioDataChannels || this.channelCount === 0) {
             this._outputSilence(outputs);
             return true;
         }

        const outputBuffer = outputs[0];
        const outputChannelCount = outputBuffer.length;
        const requestedFrames = outputBuffer[0].length; // Usually 128

        // Safety checks
        if (outputChannelCount < this.channelCount) {
             console.error(`[RBProc-${this.instanceId}] Mismatch: Output expects ${outputChannelCount} channels, processor has ${this.channelCount}. Stopping.`);
             this._outputSilence(outputs);
             this.isPlaying = false;
             this.port.postMessage({ type: 'error', message: 'Output channel count mismatch.'});
             return true;
        }
        if (this.wasmInputBuffers.length !== this.channelCount || this.wasmOutputBuffers.length !== this.channelCount || this.wasmInputPtrs.length !== this.channelCount || this.wasmOutputPtrs.length !== this.channelCount) {
            console.error(`[RBProc-${this.instanceId}] Mismatch: WASM buffers/pointers not allocated correctly for ${this.channelCount} channels. Stopping.`);
             this._outputSilence(outputs);
             this.isPlaying = false;
             this.port.postMessage({ type: 'error', message: 'WASM buffer allocation error.'});
             return true;
        }

        let framesWritten = 0;
        // REMOVED: const processStartTime = performance.now();

        try {
             while (framesWritten < requestedFrames) {
                 // --- Log state before checking available frames ---
                 // console.log(`[RBProc-${this.instanceId}] Loop Start: written=${framesWritten}, req=${requestedFrames}, avail=${this.availableFrames}, srcPos=${this.sourcePosition}`);

                 if (this.availableFrames === 0) {
                     // console.log(`[RBProc-${this.instanceId}] Checking available...`);
                     this.availableFrames = this.Module._rubberband_available(this.rubberbandState);
                     // console.log(`[RBProc-${this.instanceId}] Available = ${this.availableFrames}`);
                 }

                 if (this.availableFrames > 0) {
                     // --- Retrieve Frames ---
                     let framesToRetrieve = Math.min(this.availableFrames, requestedFrames - framesWritten);
                     if (framesToRetrieve > this.inputBufferSize) {
                         // console.warn(`[RBProc-${this.instanceId}] Clamping retrieve size ${framesToRetrieve} to buffer size ${this.inputBufferSize}`);
                         framesToRetrieve = this.inputBufferSize;
                     }
                     if (framesToRetrieve <= 0) break; // Should not happen if availableFrames > 0

                     // console.log(`[RBProc-${this.instanceId}] Attempting retrieve: ${framesToRetrieve} frames`);
                     const outputPtrArray = this.Module.stackAlloc(this.channelCount * 4); // Allocate on stack
                     for (let i = 0; i < this.channelCount; ++i) { this.Module.setValue(outputPtrArray + i * 4, this.wasmOutputPtrs[i], '*'); }

                     const retrieved = this.Module._rubberband_retrieve(this.rubberbandState, outputPtrArray, framesToRetrieve);
                     // console.log(`[RBProc-${this.instanceId}] Retrieved: ${retrieved} frames`);

                     if (retrieved > 0) {
                         for (let i = 0; i < this.channelCount; ++i) {
                             // Ensure outputBuffer[i] exists before setting
                             if (outputBuffer[i]) {
                                  outputBuffer[i].set(this.wasmOutputBuffers[i].subarray(0, retrieved), framesWritten);
                             }
                         }
                         // Fill remaining output channels (if any) with silence
                         for (let i = this.channelCount; i < outputChannelCount; ++i) {
                             if (outputBuffer[i]) {
                                  outputBuffer[i].fill(0, framesWritten, framesWritten + retrieved);
                             }
                         }
                         framesWritten += retrieved;
                         this.availableFrames -= retrieved;
                     } else {
                         // If retrieve returned 0, even if available > 0, reset available and break to potentially process more input
                         this.availableFrames = 0;
                         console.warn(`[RBProc-${this.instanceId}] Retrieve returned 0 despite available=${this.availableFrames}. Breaking retrieve loop.`);
                         break;
                     }
                     // Free stack-allocated pointer array immediately? No, stack pointer moves on return.

                 } else { // availableFrames is 0, need to process more input
                     // --- Check for End of Source ---
                     if (this.sourcePosition >= this.sourceLength) {
                         // console.log(`[RBProc-${this.instanceId}] End of source reached (pos=${this.sourcePosition}). Flushing...`);
                         const inputPtrArray = this.Module.stackAlloc(this.channelCount * 4);
                         for (let i = 0; i < this.channelCount; ++i) { this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[i], '*'); }
                         // Process with 0 frames and final=true to flush internal buffers
                         this.Module._rubberband_process(this.rubberbandState, inputPtrArray, 0, true);
                         this.availableFrames = this.Module._rubberband_available(this.rubberbandState);
                         // console.log(`[RBProc-${this.instanceId}] Available after flush = ${this.availableFrames}`);

                         if (this.availableFrames <= 0) { // Nothing left after flushing
                              console.log(`[RBProc-${this.instanceId}] End of source & flushed, stopping playback.`);
                              this.isPlaying = false;
                              this.port.postMessage({ type: 'playbackEnded' });
                              this._outputSilence(outputs, framesWritten);
                              return true; // Keep processor alive but stop processing loop
                         }
                         // If frames became available after flush, loop again to retrieve them
                         continue;
                     }

                     // --- Process More Input ---
                     const framesToProcess = Math.min(this.inputBufferSize, this.sourceLength - this.sourcePosition);
                     if (framesToProcess <= 0) { // Safety check, should be caught above
                          console.warn(`[RBProc-${this.instanceId}] framesToProcess is ${framesToProcess} despite source not ended. Stopping.`);
                          this.isPlaying = false;
                          this.port.postMessage({ type: 'playbackEnded' });
                          this._outputSilence(outputs, framesWritten);
                          return true;
                     }

                     // console.log(`[RBProc-${this.instanceId}] Processing input: ${framesToProcess} frames from pos ${this.sourcePosition}`);
                     const inputPtrArray = this.Module.stackAlloc(this.channelCount * 4);
                     for (let i = 0; i < this.channelCount; ++i) {
                         const channelData = this.audioDataChannels[i];
                         // Ensure channelData is valid
                         if (!channelData) {
                              throw new Error(`Missing audio data for channel ${i}`);
                         }
                         const subArray = channelData.subarray(this.sourcePosition, this.sourcePosition + framesToProcess);
                         this.wasmInputBuffers[i].set(subArray);
                         // Zero out remaining part of input buffer if needed
                         if (framesToProcess < this.inputBufferSize) {
                             this.wasmInputBuffers[i].fill(0, framesToProcess);
                         }
                         this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[i], '*');
                     }

                     this.Module._rubberband_process(this.rubberbandState, inputPtrArray, framesToProcess, false);
                     this.sourcePosition += framesToProcess;
                     // Check available again *after* processing
                     this.availableFrames = this.Module._rubberband_available(this.rubberbandState);
                     // console.log(`[RBProc-${this.instanceId}] Available after process = ${this.availableFrames}`);

                     // If processing yielded no output frames, and we haven't written anything this quantum, break the loop
                     if (this.availableFrames <= 0 && framesWritten === 0) {
                          // console.log(`[RBProc-${this.instanceId}] Processed input but no frames available yet, breaking loop for this quantum.`);
                          break;
                     }
                 } // End if/else availableFrames > 0

                 // Safety break to prevent potential infinite loops - REMOVED performance.now() dependency
                 // const loopDuration = performance.now() - processStartTime; // REMOVED
                 // if (loopDuration > 50) { // REMOVED Timeout check
                 //      console.warn(`[RBProc-${this.instanceId}] Process loop took >50ms. Breaking to yield thread.`); // REMOVED
                 //      break; // REMOVED
                 // }

             } // End while (framesWritten < requestedFrames)

             // Fill remaining buffer with silence if needed
             if (framesWritten < requestedFrames) {
                 // console.log(`[RBProc-${this.instanceId}] Outputting silence for remaining ${requestedFrames - framesWritten} frames.`);
                 this._outputSilence(outputs, framesWritten);
             }

        } catch(error) {
             console.error(`[RBProc-${this.instanceId}] Error during process loop:`, error);
             this.port.postMessage({ type: 'error', message: `Processing error: ${error.message}`});
             this.isPlaying = false;
             this._outputSilence(outputs);
        }

        return true; // Keep processor alive
    }

    /**
     * Fills output buffers with silence.
     * @param {Array<Array<Float32Array>>} outputs - The output array from process().
     * @param {number} [startIndex=0] - Index from where to start filling silence.
     * @private
     */
    _outputSilence(outputs, startIndex = 0) {
        if (!outputs || !outputs[0]) return;
        for (const channel of outputs[0]) {
             if (channel && startIndex < channel.length) { // Add check for channel existence
                try { channel.fill(0, startIndex); } catch(e) { console.error(`[RBProc-${this.instanceId}] Error filling silence:`, e); }
             }
        }
    }

    /**
     * Cleans up WASM memory and other resources.
     * @private
     */
     _cleanup() {
         console.log(`[RBProc-${this.instanceId}] Cleaning up resources...`);
         this.isPlaying = false;
         this.isLoading = false;
         this.isReady = false;

         if (this.Module && this.rubberbandState) {
             try { this.Module._rubberband_delete(this.rubberbandState); }
             catch(e) { console.error(`[RBProc-${this.instanceId}] Error deleting Rubberband state:`, e); }
             this.rubberbandState = 0;
         }
         try { this._freeWasmBuffers(); }
         catch(e) { console.error(`[RBProc-${this.instanceId}] Error freeing WASM buffers:`, e); }

         this.Module = null;
         this.rubberbandLoaderFunc = null;
         this.audioDataChannels = null;
         this.sourcePosition = 0;
         this.sourceLength = 0;
         console.log(`[RBProc-${this.instanceId}] Cleanup finished.`);
     }
}

// Register the processor
try {
     registerProcessor('rubberband-processor', RubberbandProcessor);
} catch (error) {
    console.error("Failed to register RubberbandProcessor:", error);
    // Cannot post message here as 'port' is not available statically
}
// --- /vibe-player/js/player/rubberbandProcessor.js ---
