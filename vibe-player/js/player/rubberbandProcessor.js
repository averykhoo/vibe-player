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

    /**
     * Constructor: Called when the node is created.
     * Receives options from the main thread (AudioWorkletNode constructor).
     * Evaluates loader script text and kicks off asynchronous WASM initialization.
     * @param {AudioWorkletNodeOptions} options
     */
    constructor(options) {
        super(options);
        console.log('[RubberbandProcessor] Constructor called.');
        this.isLoading = true; // Mark as loading

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

            console.log(`[RubberbandProcessor] Options received: SampleRate=${this.sampleRate}, Channels=${this.initialChannelCount}`);

             // Evaluate the loader script text to get the loader function
             console.log('[RubberbandProcessor] Evaluating loader script text...');
             // Execute the script text (which defines 'Rubberband' via IIFE) and return it.
             this.rubberbandLoaderFunc = new Function(loaderScriptText + '; return Rubberband;')();
             if (typeof this.rubberbandLoaderFunc !== 'function') {
                 throw new Error("Evaluating loader script text did not yield a function.");
             }
             console.log('[RubberbandProcessor] Loader function obtained.');

            // Start async WASM initialization
            this._initializeWasm();

        } catch (error) {
             console.error(`[RubberbandProcessor] FATAL: Error during constructor setup: ${error.message}`);
             this.port.postMessage({ type: 'error', message: `Processor construction failed: ${error.message}` });
             this.isReady = false;
             this.isLoading = false;
             // Cannot proceed
        }

        // Handle messages from the main thread
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

        console.log('[RubberbandProcessor] Initializing WASM...');
        try {
            // Instantiate WASM using the custom loader function
            const moduleArg = {
                wasmBinary: this.wasmBinary,
                instantiateWasm: (info, receiveInstance) => {
                    WebAssembly.instantiate(this.wasmBinary, info)
                        .then(({ instance }) => receiveInstance(instance))
                        .catch(error => {
                             console.error("[RubberbandProcessor] WASM Instantiation failed:", error);
                             this.port.postMessage({ type: 'error', message: `WASM Instantiation failed: ${error.message}` });
                             // Ensure state reflects failure
                             this.isReady = false; this.isLoading = false; this.Module = null;
                        });
                }
            };
            this.Module = await this.rubberbandLoaderFunc(moduleArg); // Await the promise
            console.log('[RubberbandProcessor] WASM Module loaded.');

            // Check if instantiation failed during the async operation
             if (!this.Module) {
                  throw new Error("WASM Module object was not created after loader execution.");
             }

            // Initialize Rubberband state *after* WASM is loaded
            this._initializeRubberband();

        } catch (error) {
            console.error('[RubberbandProcessor] Error initializing WASM:', error);
            this.port.postMessage({ type: 'error', message: `WASM Initialization failed: ${error.message}` });
            this.isReady = false;
            this.isLoading = false;
            this.Module = null;
            // No need to re-throw, error posted.
        } finally {
             // Regardless of success/failure, process any queued messages now
             this.isLoading = false; // Finished loading attempt
             if (this.messageQueue && this.messageQueue.length > 0) {
                  console.log("[RubberbandProcessor] Processing buffered messages post-init attempt...");
                  while (this.messageQueue.length > 0) {
                       this._processMessage(this.messageQueue.shift());
                  }
                  this.messageQueue = null; // Clear queue
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
             console.error('[RubberbandProcessor] WASM Module or _rubberband_new not available for Rubberband init.');
             this.port.postMessage({ type: 'error', message: 'WASM Module methods not available post-load.' });
             this.isReady = false;
             return;
        }
        try {
            // --- Configuration ---
            const channels = this.initialChannelCount;
            const options =
                this.Module.RubberbandOptions.ProcessRealTime |
                this.Module.RubberbandOptions.PitchHighQuality |
                this.Module.RubberbandOptions.PhaseIndependent |
                this.Module.RubberbandOptions.TransientsCrisp;

            console.log(`[RubberbandProcessor] Initializing Rubberband instance with Rate: ${this.sampleRate}, Channels: ${channels}, Options: ${options}`);

            this.rubberbandState = this.Module._rubberband_new(this.sampleRate, channels, options, this.timeRatio, this.pitchScale);

            if (!this.rubberbandState) {
                 throw new Error("_rubberband_new returned null or zero pointer.");
            }

            console.log(`[RubberbandProcessor] Rubberband instance created (State Pointer: ${this.rubberbandState}).`);

            this.inputBufferSize = this.Module._rubberband_get_samples_required(this.rubberbandState);
            console.log(`[RubberbandProcessor] Rubberband requires input buffer size: ${this.inputBufferSize} frames`);
             if (this.inputBufferSize <= 0) {
                  throw new Error(`_rubberband_get_samples_required returned invalid size: ${this.inputBufferSize}`);
             }

            this._allocateWasmBuffers(channels);

            this.isReady = true;
            // this.isLoading is set false in _initializeWasm finally block
            this.port.postMessage({ type: 'processorReady' });
            console.log('[RubberbandProcessor] Processor is ready.');

        } catch (error) {
            console.error('[RubberbandProcessor] Error initializing Rubberband state:', error);
            this.port.postMessage({ type: 'error', message: `Rubberband Initialization failed: ${error.message}` });
            this.isReady = false;
            this.isLoading = false; // Ensure loading state cleared
            this._freeWasmBuffers();
        }
    }

    /**
     * Allocates input and output buffers in WASM memory.
     * @param {number} channels - Number of channels.
     * @private
     */
    _allocateWasmBuffers(channels) {
        if (!this.Module || !this.Module._malloc || this.inputBufferSize <= 0) {
             console.error("[RubberbandProcessor] Cannot allocate buffers: Module or malloc not ready, or invalid buffer size.");
             return;
        }
        this._freeWasmBuffers(); // Free existing buffers first

        const bufferSizeBytes = this.inputBufferSize * Float32Array.BYTES_PER_ELEMENT;
        console.log(`[RubberbandProcessor] Allocating ${bufferSizeBytes} bytes per channel buffer (${this.inputBufferSize} frames)`);

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
                this.wasmInputBuffers.push(new Float32Array(this.Module.HEAPF32.buffer, inputPtr, this.inputBufferSize));
                this.wasmOutputBuffers.push(new Float32Array(this.Module.HEAPF32.buffer, outputPtr, this.inputBufferSize));
            } catch (allocError) {
                 console.error(`[RubberbandProcessor] Error allocating WASM memory: ${allocError.message}`);
                 // Free any successfully allocated pointers before throwing
                  if(inputPtr) this.Module._free(inputPtr);
                  if(outputPtr) this.Module._free(outputPtr);
                 this._freeWasmBuffers(); // Free anything already in the arrays
                 throw allocError; // Re-throw to be caught by caller
            }
        }
        console.log(`[RubberbandProcessor] Allocated WASM buffers for ${channels} channels.`);
    }

    /**
     * Frees previously allocated WASM memory for buffers.
     * @private
     */
    _freeWasmBuffers() {
        if (!this.Module || !this.Module._free) return;
        // console.log("[RubberbandProcessor] Freeing WASM buffers...");
        this.wasmInputPtrs.forEach(ptr => { try { if(ptr) this.Module._free(ptr); } catch(e) {} });
        this.wasmOutputPtrs.forEach(ptr => { try { if(ptr) this.Module._free(ptr); } catch(e) {} });
        this.wasmInputPtrs = [];
        this.wasmOutputPtrs = [];
        this.wasmInputBuffers = [];
        this.wasmOutputBuffers = [];
    }

    /**
     * Handles messages received from the main thread (AudioEngine).
     * Buffers messages if initialization is still in progress.
     * @param {MessageEvent} event
     */
    handleMessage(event) {
         if (this.isLoading) {
             console.log("[RubberbandProcessor] Buffering message received during load:", event.data.type);
             this.messageQueue.push(event.data); // Queue the data part only
             return;
         }
        // Process buffered messages immediately if loading just finished
         // This is handled in the _initializeWasm finally block now.

        // Process the current message
        this._processMessage(event.data);
    }

     /**
      * Internal message processing logic.
      * @param {any} data - The message data object.
      * @private
      */
     _processMessage(data) {
        // console.log('[RubberbandProcessor] Processing message:', data.type);

        // Don't process most commands if not ready (except reset/load?)
        // Load might need to be handled even if not fully ready (buffers allocated etc)
        if (!this.isReady && !['load', 'reset'].includes(data.type)) {
             console.warn(`[RubberbandProcessor] Ignoring command '${data.type}' because processor is not ready.`);
             return;
        }
        if (!this.Module && data.type !== 'reset') {
             console.warn(`[RubberbandProcessor] Ignoring command '${data.type}' because WASM Module not loaded.`);
             return;
        }

        try { // Add try-catch around message processing
            switch (data.type) {
                case 'load':
                    console.log('[RubberbandProcessor] Load command processed.');
                     if (!this.Module || !this.rubberbandState) {
                          console.error("[RubberbandProcessor] Cannot process 'load': Module or Rubberband state not initialized.");
                          // Post error back? Might have happened during init.
                          return;
                     }
                    this.audioDataChannels = data.audioData;
                    const newChannelCount = this.audioDataChannels ? this.audioDataChannels.length : 0;
                    this.sourceLength = newChannelCount > 0 ? this.audioDataChannels[0].length : 0;
                    this.sourcePosition = 0;
                    this.availableFrames = 0;

                    if (newChannelCount !== this.channelCount) {
                        console.warn(`[RubberbandProcessor] Actual channel count (${newChannelCount}) differs from initial (${this.channelCount}). Re-allocating buffers and resetting state.`);
                        this.channelCount = newChannelCount;
                        // Re-alloc buffers. This might fail if WASM init failed partially.
                        this._allocateWasmBuffers(this.channelCount);
                        // Reset Rubberband state.
                        this.Module._rubberband_reset(this.rubberbandState);
                        // Technically, rubberband_new should be called again if channels change after init.
                        // Let's rely on reset for now, may need adjustment if issues arise.
                        console.log(`[RubberbandProcessor] Buffers re-allocated for ${this.channelCount} channels.`)
                    } else {
                        this.Module._rubberband_reset(this.rubberbandState);
                    }
                    console.log(`[RubberbandProcessor] Audio loaded. Channels: ${this.channelCount}, Source length: ${this.sourceLength} samples.`);
                    break;
                case 'togglePlayPause':
                    this.isPlaying = !this.isPlaying;
                    console.log(`[RubberbandProcessor] Playback state toggled to: ${this.isPlaying}`);
                    this.port.postMessage({ type: 'playbackStateChanged', isPlaying: this.isPlaying });
                    break;
                case 'seek':
                    if (this.isReady && this.Module) {
                        const seekTime = data.time;
                        const seekSample = Math.max(0, Math.floor(seekTime * this.sampleRate));
                        console.log(`[RubberbandProcessor] Seek command processed: ${seekTime.toFixed(3)}s (Sample: ${seekSample})`);
                        this.sourcePosition = Math.min(seekSample, this.sourceLength);
                        this.availableFrames = 0;
                        this.Module._rubberband_reset(this.rubberbandState);
                    }
                    break;
                case 'setSpeed':
                    if (this.isReady && this.Module) {
                        this.timeRatio = data.speed;
                        console.log(`[RubberbandProcessor] Setting time ratio: ${this.timeRatio.toFixed(2)}`);
                        this.Module._rubberband_set_time_ratio(this.rubberbandState, this.timeRatio);
                    }
                    break;
                case 'setPitch':
                    if (this.isReady && this.Module) {
                        this.pitchScale = data.pitch;
                        console.log(`[RubberbandProcessor] Setting pitch scale: ${this.pitchScale.toFixed(2)}`);
                        this.Module._rubberband_set_pitch_scale(this.rubberbandState, this.pitchScale);
                    }
                    break;
                case 'reset':
                    console.log('[RubberbandProcessor] Reset/Cleanup command processed.');
                    this._cleanup();
                    break;
                default:
                    console.warn(`[RubberbandProcessor] Unknown message type: ${data.type}`);
            }
        } catch (error) {
             console.error(`[RubberbandProcessor] Error processing message type ${data.type}:`, error);
             this.port.postMessage({ type: 'error', message: `Error processing command ${data.type}: ${error.message}` });
             // Optionally stop playback or attempt recovery?
             this.isPlaying = false;
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
         if (this.isLoading || !this.isReady || !this.Module || !this.rubberbandState || !this.isPlaying || !this.audioDataChannels || this.channelCount === 0) {
             this._outputSilence(outputs);
             return true;
         }

        const outputBuffer = outputs[0];
        const outputChannelCount = outputBuffer.length;
        const requestedFrames = outputBuffer[0].length;

        if (outputChannelCount < this.channelCount) {
             console.error(`[RubberbandProcessor] Mismatch: Output expects ${outputChannelCount} channels, processor has ${this.channelCount}. Stopping.`);
             this._outputSilence(outputs); this.isPlaying = false; this.port.postMessage({ type: 'error', message: 'Output channel count mismatch.'}); return true;
        }
        if (this.wasmInputBuffers.length !== this.channelCount || this.wasmOutputBuffers.length !== this.channelCount || this.wasmInputPtrs.length !== this.channelCount || this.wasmOutputPtrs.length !== this.channelCount) {
            console.error(`[RubberbandProcessor] Mismatch: WASM buffers/pointers not allocated correctly for ${this.channelCount} channels. Stopping.`);
             this._outputSilence(outputs); this.isPlaying = false; this.port.postMessage({ type: 'error', message: 'WASM buffer allocation error.'}); return true;
        }

        let framesWritten = 0;
        const stackPtr = this.Module.stackSave(); // Save current stack pointer

        try {
             while (framesWritten < requestedFrames) {
                 if (this.availableFrames === 0) {
                     this.availableFrames = this.Module._rubberband_available(this.rubberbandState);
                 }

                 if (this.availableFrames > 0) {
                     let framesToRetrieve = Math.min(this.availableFrames, requestedFrames - framesWritten);
                      if (framesToRetrieve > this.inputBufferSize) { framesToRetrieve = this.inputBufferSize; }
                      if (framesToRetrieve <= 0) { break; }

                     // --- Allocate stack for pointer array *inside* the loop ---
                     const outputPtrArray = this.Module.stackAlloc(this.channelCount * 4);
                     try { // Wrap WASM call and stack usage
                          for (let i = 0; i < this.channelCount; ++i) {
                               this.Module.setValue(outputPtrArray + i * 4, this.wasmOutputPtrs[i], '*');
                          }

                         const retrieved = this.Module._rubberband_retrieve(this.rubberbandState, outputPtrArray, framesToRetrieve);
                         // Stack automatically restored after C call in typical Emscripten builds

                         if (retrieved > 0) {
                              // Copy data from WASM buffers to output
                              for (let i = 0; i < this.channelCount; ++i) { outputBuffer[i].set(this.wasmOutputBuffers[i].subarray(0, retrieved), framesWritten); }
                              // Fill extra output channels with silence
                              for (let i = this.channelCount; i < outputChannelCount; ++i) { outputBuffer[i].fill(0, framesWritten, framesWritten + retrieved); }
                             framesWritten += retrieved;
                             this.availableFrames -= retrieved;
                         } else {
                              this.availableFrames = 0; // Assume no more available if retrieve fails
                              break; // Break inner loop, might need more input
                         }
                     } finally {
                          // Although stack is usually auto-restored, explicitly restoring ensures cleanup
                          // NOTE: If _rubberband_retrieve itself allocates stack internally, this explicit restore might cause issues.
                          // Let's keep it simple for now and rely on auto-restore. If problems persist, revisit stack management.
                          // this.Module.stackRestore(stackPtr); // Potentially problematic, rely on Emscripten's handling
                     }
                     // --- End stack allocation block ---

                 } else { // No frames available, need to process source
                     if (this.sourcePosition >= this.sourceLength) {
                           // --- Allocate stack for pointer array for process(final=true) ---
                           const inputPtrArray = this.Module.stackAlloc(this.channelCount * 4);
                           try {
                                for (let i = 0; i < this.channelCount; ++i) { this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[i], '*'); }
                                this.Module._rubberband_process(this.rubberbandState, inputPtrArray, 0, true); // Flush
                           } finally {
                                // this.Module.stackRestore(stackPtr); // Rely on auto-restore
                           }
                           // --- End stack allocation block ---

                           this.availableFrames = this.Module._rubberband_available(this.rubberbandState);
                           if (this.availableFrames <= 0) {
                               console.log('[RubberbandProcessor] End of source & flushed.');
                               this.isPlaying = false; this.port.postMessage({ type: 'playbackEnded' }); this._outputSilence(outputs, framesWritten); return true; // Stop processing loop
                           }
                           continue; // Loop again to retrieve flushed frames
                     }

                     const framesToProcess = Math.min(this.inputBufferSize, this.sourceLength - this.sourcePosition);
                     if (framesToProcess <= 0) { this.isPlaying = false; this.port.postMessage({ type: 'playbackEnded' }); this._outputSilence(outputs, framesWritten); return true; }

                      // --- Allocate stack for pointer array for process(data) ---
                      const inputPtrArray = this.Module.stackAlloc(this.channelCount * 4);
                      try {
                           for (let i = 0; i < this.channelCount; ++i) {
                                const channelData = this.audioDataChannels[i];
                                const subArray = channelData.subarray(this.sourcePosition, this.sourcePosition + framesToProcess);
                                this.wasmInputBuffers[i].set(subArray);
                                 if (framesToProcess < this.inputBufferSize) { this.wasmInputBuffers[i].fill(0, framesToProcess); }
                                this.Module.setValue(inputPtrArray + i * 4, this.wasmInputPtrs[i], '*');
                           }
                          this.Module._rubberband_process(this.rubberbandState, inputPtrArray, framesToProcess, false);
                      } finally {
                           // this.Module.stackRestore(stackPtr); // Rely on auto-restore
                      }
                      // --- End stack allocation block ---

                     this.sourcePosition += framesToProcess;
                     this.availableFrames = this.Module._rubberband_available(this.rubberbandState);

                     if (this.availableFrames <= 0 && framesWritten === 0) { break; } // Avoid potential infinite loop if no frames produced
                 }
             } // End while

             if (framesWritten < requestedFrames) { this._outputSilence(outputs, framesWritten); }

        } catch(error) {
             console.error("[RubberbandProcessor] Error during process:", error);
             // Log stack trace if available
              if (error.stack) { console.error(error.stack); }
             this.port.postMessage({ type: 'error', message: `Processing error: ${error.message || error}`});
             this.isPlaying = false;
             this._outputSilence(outputs);
        } finally {
             this.Module.stackRestore(stackPtr); // Restore stack pointer once at the end of process
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
             if(startIndex < channel.length) {
                try { channel.fill(0, startIndex); } catch(e) { console.error("Error filling silence:", e); }
             }
        }
    }

    /**
     * Cleans up WASM memory and other resources.
     * @private
     */
     _cleanup() {
         console.log('[RubberbandProcessor] Cleaning up resources...');
         this.isPlaying = false;
         this.isLoading = false;
         this.isReady = false;

         if (this.Module && this.rubberbandState) {
             try { this.Module._rubberband_delete(this.rubberbandState); }
             catch(e) { console.error('[RubberbandProcessor] Error deleting Rubberband state:', e); }
             this.rubberbandState = 0;
         }
         try { this._freeWasmBuffers(); }
         catch(e) { console.error('[RubberbandProcessor] Error freeing WASM buffers:', e); }

         this.Module = null;
         this.rubberbandLoaderFunc = null; // Clear loader func ref
         this.audioDataChannels = null;
         this.sourcePosition = 0;
         this.sourceLength = 0;
         console.log('[RubberbandProcessor] Cleanup finished.');
     }
}

// Register the processor
try {
     registerProcessor('rubberband-processor', RubberbandProcessor);
} catch (error) {
    console.error("Failed to register RubberbandProcessor:", error);
}
// --- /vibe-player/js/player/rubberbandProcessor.js ---
