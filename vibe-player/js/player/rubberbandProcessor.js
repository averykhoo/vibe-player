// --- /vibe-player/js/player/rubberbandProcessor.js --- // Updated Path
// AudioWorkletProcessor for real-time time-stretching using Rubberband WASM.

// Constants cannot be accessed here directly, but name is needed for registration.
const PROCESSOR_NAME = 'rubberband-processor';

/**
 * @class RubberbandProcessor
 * @extends AudioWorkletProcessor
 * @description Processes audio using the Rubberband library compiled to WASM.
 * Handles loading Rubberband WASM, managing its state, processing audio frames
 * for time-stretching and pitch-shifting, and communicating with the main thread.
 * Runs within an AudioWorkletGlobalScope.
 */
class RubberbandProcessor extends AudioWorkletProcessor {

    /**
     * Initializes the processor instance. Sets up initial state and message handling.
     * WASM/Rubberband initialization happens asynchronously via message handler or first process call.
     * @constructor
     * @param {AudioWorkletNodeOptions} options - Options passed from the AudioWorkletNode constructor.
     * @param {object} options.processorOptions - Custom options containing sampleRate, numberOfChannels, wasmBinary, loaderScriptText.
     * @param {string|number} [options.processorOptions.trackId='unknown'] - An identifier for this processor instance (for logging/messaging).
     */
    constructor(options) {
        super();

        // --- State Initialization ---
        this.processorOpts = options.processorOptions || {};
        this.trackId = this.processorOpts.trackId ?? 'unknown'; // ** NEW: Store Track ID **
        console.log(`[Worklet ${this.trackId}] RubberbandProcessor created.`); // Added trackId

        // Audio properties (passed in options)
        this.sampleRate = this.processorOpts.sampleRate || sampleRate; // Fallback to global scope 'sampleRate' if needed
        this.numberOfChannels = this.processorOpts.numberOfChannels || 0;
        // WASM resources (passed via options)
        this.wasmBinary = this.processorOpts.wasmBinary;
        this.loaderScriptText = this.processorOpts.loaderScriptText;
        // WASM/Rubberband state
        /** @type {object|null} WASM module exports. */ this.wasmModule = null;
        /** @type {boolean} */ this.wasmReady = false;
        /** @type {number} Pointer to the RubberbandStretcher instance in WASM memory. */ this.rubberbandStretcher = 0;
        // Playback control state
        /** @type {boolean} */ this.isPlaying = false;
        /** @type {number} */ this.currentTargetSpeed = 1.0;
        /** @type {number} */ this.currentTargetPitchScale = 1.0;
        /** @type {number} */ this.currentTargetFormantScale = 1.0;
        /** @type {number} */ this.lastAppliedStretchRatio = 1.0; // Speed = 1 / Ratio
        /** @type {number} */ this.lastAppliedPitchScale = 1.0;
        /** @type {number} */ this.lastAppliedFormantScale = 1.0;
        // Processing state
        /** @type {boolean} */ this.resetNeeded = true; // Force reset initially and after seek
        /** @type {boolean} */ this.streamEnded = false; // True when source audio fully processed AND buffer empty
        /** @type {boolean} */ this.finalBlockSent = false; // True once the last block flag sent to rubberband_process
        /** @type {number} Current playback position in SOURCE audio (seconds). */ this.playbackPositionInSeconds = 0.0;
        // WASM Memory Management
        /** @type {number} Pointer to array of input channel buffer pointers in WASM mem. */ this.inputPtrs = 0;
        /** @type {number} Pointer to array of output channel buffer pointers in WASM mem. */ this.outputPtrs = 0;
        /** @type {number[]} JS array holding pointers to input channel buffers in WASM mem. */ this.inputChannelBuffers = [];
        /** @type {number[]} JS array holding pointers to output channel buffers in WASM mem. */ this.outputChannelBuffers = [];
        /** @type {number} Size of blocks used for WASM buffer allocation/processing. */ this.blockSizeWasm = 1024; // Fixed block size for WASM buffers
        // Source Audio Data
        /** @type {Float32Array[]|null} Holds original audio data per channel. */ this.originalChannels = null;
        /** @type {boolean} */ this.audioLoaded = false;
        /** @type {number} */ this.sourceDurationSeconds = 0;

        // --- Message Port Setup ---
        if (this.port) {
            this.port.onmessage = this.handleMessage.bind(this);
            console.log(`[Worklet ${this.trackId}] Message port listener attached.`);
        } else {
            console.error(`[Worklet ${this.trackId}] CONSTRUCTOR: Message port is not available!`);
        }

        // --- Initial Validation ---
        if (!this.wasmBinary) this.postErrorAndStop("WASM binary missing.");
        if (!this.loaderScriptText) this.postErrorAndStop("Loader script text missing.");
        if (!this.sampleRate || this.sampleRate <= 0) this.postErrorAndStop(`Invalid SampleRate: ${this.sampleRate}`);
        if (!this.numberOfChannels || this.numberOfChannels <= 0) this.postErrorAndStop(`Invalid NumberOfChannels: ${this.numberOfChannels}`);

        console.log(`[Worklet ${this.trackId}] Initialized with SR=${this.sampleRate}, Chans=${this.numberOfChannels}. Waiting for audio data.`);
    }

    /**
     * Initializes the WASM module (compiling + instantiating) and creates the Rubberband instance in WASM memory.
     * Uses a custom loader script evaluated via Function constructor and an instantiateWasm hook.
     * Allocates necessary memory buffers within the WASM heap.
     * Posts 'processor-ready' status on success or 'error' on failure.
     * @private
     * @returns {Promise<void>} Resolves when initialization is complete, rejects on fatal error.
     */
    async initializeWasmAndRubberband() {
        console.log(`[Worklet ${this.trackId}] initializeWasmAndRubberband called.`);
        // Prevent re-initialization
        if (this.wasmReady) {
            console.warn(`[Worklet ${this.trackId}] WASM already ready, skipping initialization.`);
            return;
        }
        if (!this.wasmBinary || !this.loaderScriptText) {
            this.postErrorAndStop("Cannot initialize WASM: Resources missing.");
            return;
        }

        try {
            this.postStatus("Initializing WASM & Rubberband...");
            console.log(`[Worklet ${this.trackId}] Starting WASM & Rubberband instance initialization...`);

            // Define instantiateWasm hook (required by the custom loader)
            const instantiateWasm = (imports, successCallback) => {
                console.log(`[Worklet ${this.trackId}] instantiateWasm hook called by loader.`);
                WebAssembly.instantiate(this.wasmBinary, imports)
                    .then(output => {
                        console.log(`[Worklet ${this.trackId}] WASM instantiate successful.`);
                        successCallback(output.instance, output.module); // Pass back to loader
                    })
                    .catch(error => {
                        console.error(`[Worklet ${this.trackId}] WASM instantiate hook failed:`, error);
                        this.postError(`WASM Hook Error: ${error.message}`);
                    });
                return {}; // Emscripten convention
            };

            // Evaluate the custom loader script text
            let loaderFunc;
            try {
                 console.log(`[Worklet ${this.trackId}] Evaluating loader script...`);
                 const getLoaderFactory = new Function('moduleArg', `${this.loaderScriptText}; return Rubberband;`);
                 loaderFunc = getLoaderFactory();
                 if (typeof loaderFunc !== 'function') throw new Error(`Loader script did not return an async function.`);
                 console.log(`[Worklet ${this.trackId}] Loader script evaluated successfully.`);
            } catch (loaderError) {
                 console.error(`[Worklet ${this.trackId}] Loader script eval error:`, loaderError);
                 throw new Error(`Loader script eval error: ${loaderError.message}`);
            }

            // Call the async loader function
            console.log(`[Worklet ${this.trackId}] Calling loader function...`);
            const loadedModule = await loaderFunc({ instantiateWasm: instantiateWasm });
            this.wasmModule = loadedModule;
            console.log(`[Worklet ${this.trackId}] Loader function resolved.`);

            // Verify essential WASM exports exist
            if (!this.wasmModule || typeof this.wasmModule._rubberband_new !== 'function' || typeof this.wasmModule._malloc !== 'function' || !this.wasmModule.HEAPU32) {
                 console.error(`[Worklet ${this.trackId}] WASM Module missing essential exports!`, this.wasmModule);
                 throw new Error(`WASM Module loaded, but essential exports (_rubberband_new, _malloc, HEAPU32) not found.`);
            }
            console.log(`[Worklet ${this.trackId}] WASM module loaded and exports assigned.`);

            // --- Create Rubberband Instance ---
            const RBOptions = this.wasmModule.RubberBandOptionFlag || {};
            const ProcessRealTime = RBOptions.ProcessRealTime ?? 0x00000001;
            const PitchHighQuality = RBOptions.PitchHighQuality ?? 0x02000000;
            const PhaseIndependent = RBOptions.PhaseIndependent ?? 0x00002000;
            const TransientsCrisp = RBOptions.TransientsCrisp ?? 0x00000000;
            const options = ProcessRealTime | PitchHighQuality | PhaseIndependent | TransientsCrisp;
            console.log(`[Worklet ${this.trackId}] Creating Rubberband instance with options: 0x${options.toString(16)} (SR: ${this.sampleRate}, Ch: ${this.numberOfChannels})`);

            this.rubberbandStretcher = this.wasmModule._rubberband_new(this.sampleRate, this.numberOfChannels, options, 1.0, 1.0);
            if (!this.rubberbandStretcher) throw new Error("_rubberband_new failed (returned 0). Check WASM logs or resource loading.");
            console.log(`[Worklet ${this.trackId}] Rubberband instance created: ptr=${this.rubberbandStretcher}`);

            // --- Allocate WASM Memory Buffers ---
            console.log(`[Worklet ${this.trackId}] Allocating WASM memory buffers (blockSize=${this.blockSizeWasm})...`);
            const pointerSize = 4; // Assuming 32-bit pointers
            const frameSize = 4; // sizeof(float)

            // Allocate memory for arrays holding channel pointers
            this.inputPtrs = this.wasmModule._malloc(this.numberOfChannels * pointerSize);
            this.outputPtrs = this.wasmModule._malloc(this.numberOfChannels * pointerSize);
            if (!this.inputPtrs || !this.outputPtrs) throw new Error("Pointer array _malloc failed.");
             console.log(`[Worklet ${this.trackId}] Pointer arrays allocated: inputPtrs=${this.inputPtrs}, outputPtrs=${this.outputPtrs}`);

            this.inputChannelBuffers = []; this.outputChannelBuffers = [];
            // Allocate memory for each channel's buffer
            for (let i = 0; i < this.numberOfChannels; ++i) {
                const bufferSizeBytes = this.blockSizeWasm * frameSize;
                const inputBuf = this.wasmModule._malloc(bufferSizeBytes);
                const outputBuf = this.wasmModule._malloc(bufferSizeBytes);
                if (!inputBuf || !outputBuf) { this.cleanupWasmMemory(); throw new Error(`Buffer _malloc failed for Channel ${i}.`); }
                 console.log(`[Worklet ${this.trackId}] Allocated channel ${i}: inputBuf=${inputBuf}, outputBuf=${outputBuf}`);
                this.inputChannelBuffers.push(inputBuf);
                this.outputChannelBuffers.push(outputBuf);
                // Store buffer pointers in the pointer arrays in WASM memory
                this.wasmModule.HEAPU32[(this.inputPtrs / pointerSize) + i] = inputBuf;
                this.wasmModule.HEAPU32[(this.outputPtrs / pointerSize) + i] = outputBuf;
            }
             console.log(`[Worklet ${this.trackId}] Input/Output buffers allocated and pointers set in WASM memory.`);

            this.wasmReady = true;
            console.log(`[Worklet ${this.trackId}] WASM and Rubberband ready.`);
            this.postStatus('processor-ready'); // Notify main thread

        } catch (error) {
            console.error(`[Worklet ${this.trackId}] WASM/Rubberband Init Error: ${error.message}\n${error.stack}`);
            this.postError(`Init Error: ${error.message}`);
            this.wasmReady = false; this.rubberbandStretcher = 0;
            this.cleanupWasmMemory(); // Attempt cleanup
        }
         console.log(`[Worklet ${this.trackId}] initializeWasmAndRubberband finished.`);
    }

    /**
     * Handles messages received from the main thread (AudioEngine).
     * @param {MessageEvent} event - The event object containing message data.
     * @param {object} event.data - The message data.
     * @param {string} event.data.type - The message type (e.g., 'load-audio', 'play', 'pause', 'seek', 'set-speed', 'set-pitch', 'cleanup').
     */
    handleMessage(event) {
        const data = event.data;
        console.log(`[Worklet ${this.trackId}] Received message: Type=${data.type}`, data); // Added trackId

        try {
            switch (data.type) {
                case 'load-audio':
                    console.log(`[Worklet ${this.trackId}] Handling 'load-audio'...`);
                    // Reset state for new audio
                    this.playbackPositionInSeconds = 0; this.resetNeeded = true;
                    this.streamEnded = false; this.finalBlockSent = false;
                    this.currentTargetSpeed = 1.0; this.lastAppliedStretchRatio = 1.0;
                    this.currentTargetPitchScale = 1.0; this.lastAppliedPitchScale = 1.0;
                    this.currentTargetFormantScale = 1.0; this.lastAppliedFormantScale = 1.0;
                    this.audioLoaded = false; this.originalChannels = null; this.sourceDurationSeconds = 0;
                    console.log(`[Worklet ${this.trackId}] State reset for new audio.`);

                    if (data.channelData && Array.isArray(data.channelData) && data.channelData.length === this.numberOfChannels) {
                        // Convert ArrayBuffers back to Float32Arrays
                         console.log(`[Worklet ${this.trackId}] Converting received ArrayBuffers (${data.channelData.length} channels)...`);
                        this.originalChannels = data.channelData.map(buffer => new Float32Array(buffer));
                        this.audioLoaded = true;
                        this.sourceDurationSeconds = (this.originalChannels[0]?.length || 0) / this.sampleRate;
                        console.log(`[Worklet ${this.trackId}] Audio loaded. Duration: ${this.sourceDurationSeconds.toFixed(3)}s`);
                        // Initialize WASM now if first time or after cleanup
                        if (!this.wasmReady) {
                             console.log(`[Worklet ${this.trackId}] Triggering WASM initialization after audio load...`);
                             this.initializeWasmAndRubberband();
                        } else {
                            console.log(`[Worklet ${this.trackId}] WASM already initialized, posting processor-ready.`);
                            this.postStatus('processor-ready'); // Confirm readiness if already init'd
                        }
                    } else {
                         console.error(`[Worklet ${this.trackId}] Invalid audio data received. Expected ${this.numberOfChannels} channels.`, data.channelData);
                         this.postError('Invalid audio data received.');
                    }
                    break;

                case 'play':
                    console.log(`[Worklet ${this.trackId}] Handling 'play'...`);
                    if (this.wasmReady && this.audioLoaded) {
                        if (!this.isPlaying) {
                             console.log(`[Worklet ${this.trackId}] Starting playback.`);
                            // If ended or at end, reset position to start
                            if (this.streamEnded || this.playbackPositionInSeconds >= this.sourceDurationSeconds) {
                                 console.log(`[Worklet ${this.trackId}] Stream was ended or at end, resetting position.`);
                                this.playbackPositionInSeconds = 0; this.resetNeeded = true;
                                this.streamEnded = false; this.finalBlockSent = false;
                            }
                            this.isPlaying = true;
                            this.port?.postMessage({ type: 'playback-state', isPlaying: true, trackId: this.trackId }); // Echo trackId
                        } else {
                             console.log(`[Worklet ${this.trackId}] Play command received but already playing.`);
                        }
                    } else {
                         const reason = !this.wasmReady ? 'WASM not ready' : 'Audio not loaded';
                         console.error(`[Worklet ${this.trackId}] Cannot play: ${reason}.`);
                         this.postError(`Cannot play: ${reason}.`);
                         this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); // Echo trackId
                    }
                    break;

                case 'pause':
                     console.log(`[Worklet ${this.trackId}] Handling 'pause'...`);
                    if (this.isPlaying) {
                        this.isPlaying = false; console.log(`[Worklet ${this.trackId}] Pausing playback.`);
                        this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); // Echo trackId
                    } else {
                         console.log(`[Worklet ${this.trackId}] Pause command received but already paused.`);
                    }
                    break;

                case 'set-speed':
                     console.log(`[Worklet ${this.trackId}] Handling 'set-speed' to ${data.value}...`);
                     if (this.wasmReady) {
                         const newSpeed = Math.max(0.01, data.value || 1.0);
                         if (this.currentTargetSpeed !== newSpeed) {
                              console.log(`[Worklet ${this.trackId}] Updating target speed from ${this.currentTargetSpeed.toFixed(3)} to ${newSpeed.toFixed(3)}`);
                              this.currentTargetSpeed = newSpeed;
                         } else {
                              console.log(`[Worklet ${this.trackId}] Speed unchanged (${newSpeed.toFixed(3)}), ignoring.`);
                         }
                     } else { console.warn(`[Worklet ${this.trackId}] Ignoring set-speed, WASM not ready.`); }
                     break;
                 case 'set-pitch':
                     console.log(`[Worklet ${this.trackId}] Handling 'set-pitch' to ${data.value}...`);
                     if (this.wasmReady) {
                         const newPitch = Math.max(0.1, data.value || 1.0);
                         if (this.currentTargetPitchScale !== newPitch) {
                              console.log(`[Worklet ${this.trackId}] Updating target pitch from ${this.currentTargetPitchScale.toFixed(3)} to ${newPitch.toFixed(3)}`);
                              this.currentTargetPitchScale = newPitch;
                         } else {
                              console.log(`[Worklet ${this.trackId}] Pitch unchanged (${newPitch.toFixed(3)}), ignoring.`);
                         }
                     } else { console.warn(`[Worklet ${this.trackId}] Ignoring set-pitch, WASM not ready.`); }
                     break;
                 case 'set-formant': // Keep even if non-functional
                     console.log(`[Worklet ${this.trackId}] Handling 'set-formant' to ${data.value}...`);
                    if (this.wasmReady) {
                        const newFormant = Math.max(0.1, data.value || 1.0);
                        if (this.currentTargetFormantScale !== newFormant) {
                            console.log(`[Worklet ${this.trackId}] Updating target formant from ${this.currentTargetFormantScale.toFixed(3)} to ${newFormant.toFixed(3)}`);
                            this.currentTargetFormantScale = newFormant;
                        } else {
                            console.log(`[Worklet ${this.trackId}] Formant unchanged (${newFormant.toFixed(3)}), ignoring.`);
                        }
                    } else { console.warn(`[Worklet ${this.trackId}] Ignoring set-formant, WASM not ready.`); }
                    break;

                case 'seek':
                     console.log(`[Worklet ${this.trackId}] Handling 'seek' to ${data.positionSeconds}...`);
                    if (this.wasmReady && this.audioLoaded) {
                        const seekPosition = Math.max(0, Math.min(data.positionSeconds || 0, this.sourceDurationSeconds));
                        this.playbackPositionInSeconds = seekPosition;
                        this.resetNeeded = true; // Force reset after seek
                        this.streamEnded = false; this.finalBlockSent = false;
                        console.log(`[Worklet ${this.trackId}] Seek position set to ${this.playbackPositionInSeconds.toFixed(3)}s. Reset flag enabled.`);
                        // Send immediate time update after seek is processed internally
                         this.port?.postMessage({type: 'time-update', currentTime: this.playbackPositionInSeconds, trackId: this.trackId }); // Echo trackId
                    } else {
                         const reason = !this.wasmReady ? 'WASM not ready' : 'Audio not loaded';
                         console.warn(`[Worklet ${this.trackId}] Ignoring seek: ${reason}.`);
                    }
                    break;

                case 'cleanup':
                     console.log(`[Worklet ${this.trackId}] Handling 'cleanup'...`);
                    this.cleanup();
                    break;
                default:
                    console.warn(`[Worklet ${this.trackId}] Received unknown message type:`, data.type);
            }
        } catch (error) {
             console.error(`[Worklet ${this.trackId}] Error handling message type '${data.type}': ${error.stack}`);
             this.postError(`Error handling message '${data.type}': ${error.message}`);
             this.isPlaying = false;
             this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); // Echo trackId
        }
         console.log(`[Worklet ${this.trackId}] Finished handling message: ${data.type}`);
    }

    /**
     * Core audio processing method called by the AudioWorklet system.
     * Pulls source audio data, processes it through Rubberband WASM if playing,
     * retrieves stretched/shifted audio, and fills the output buffers.
     * Handles parameter updates (speed, pitch), state resets, and end-of-stream logic.
     * Sends 'time-update' and 'playback-state' messages to the main thread.
     * @param {Float32Array[][]} inputs - Input audio data (unused).
     * @param {Float32Array[][]} outputs - Output buffers to fill (typically [1][numChannels][128]).
     * @param {Record<string, Float32Array>} parameters - Audio parameters (unused).
     * @returns {boolean} - Return true to keep the processor alive, false to terminate.
     */
    process(inputs, outputs, parameters) {
        // --- Essential Checks ---
        if (!this.wasmReady || !this.audioLoaded || !this.rubberbandStretcher || !this.wasmModule) {
            // console.log(`[Worklet ${this.trackId}] Process skipped: Not ready (WASM=${this.wasmReady}, Audio=${this.audioLoaded}, Stretcher=${!!this.rubberbandStretcher})`); // Too noisy
            this.outputSilence(outputs); return true;
        }
        if (!this.isPlaying) {
            // console.log(`[Worklet ${this.trackId}] Process skipped: Paused`); // Too noisy
            this.outputSilence(outputs); return true;
        }

        const outputBuffer = outputs[0];
        if (!outputBuffer || outputBuffer.length !== this.numberOfChannels || !outputBuffer[0]) {
             console.error(`[Worklet ${this.trackId}] Process Error: Invalid output buffer structure.`);
             this.postError("Invalid output buffer structure."); this.outputSilence(outputs); return true;
        }
        const outputBlockSize = outputBuffer[0].length; // Frames to generate (e.g., 128)
        if (outputBlockSize === 0) {
             console.warn(`[Worklet ${this.trackId}] Process Warning: Output block size is 0.`);
             return true; // Nothing to do
        }
        // console.log(`[Worklet ${this.trackId}] Process called. Output block size: ${outputBlockSize}`); // Too noisy

        // --- End-of-Stream Check (Before Processing) ---
        if (this.streamEnded) {
             let available = this.wasmModule._rubberband_available?.(this.rubberbandStretcher) ?? 0;
             available = Math.max(0, available);
             if (available <= 0) {
                 // console.log(`[Worklet ${this.trackId}] Process: Stream ended and no more samples available, outputting silence.`); // Too noisy
                 this.outputSilence(outputs);
                 return true; // Keep processor alive, but outputting silence.
             } else {
                 // console.log(`[Worklet ${this.trackId}] Process: Stream ended but ${available} samples still available.`); // Too noisy
             }
        }

        try {
            // --- Apply Parameter Changes ---
            const sourceChannels = this.originalChannels;
            const targetStretchRatio = 1.0 / Math.max(0.01, this.currentTargetSpeed);
            const safeStretchRatio = Math.max(0.05, Math.min(20.0, targetStretchRatio));
            const safeTargetPitch = Math.max(0.1, this.currentTargetPitchScale);
            const safeTargetFormant = Math.max(0.1, this.currentTargetFormantScale);
            const ratioChanged = Math.abs(safeStretchRatio - this.lastAppliedStretchRatio) > 1e-6;
            const pitchChanged = Math.abs(safeTargetPitch - this.lastAppliedPitchScale) > 1e-6;
            const formantChanged = Math.abs(safeTargetFormant - this.lastAppliedFormantScale) > 1e-6;

            if (this.resetNeeded) {
                console.log(`[Worklet ${this.trackId}] Applying Reset.`);
                this.wasmModule._rubberband_reset(this.rubberbandStretcher);
                this.wasmModule._rubberband_set_time_ratio(this.rubberbandStretcher, safeStretchRatio);
                this.wasmModule._rubberband_set_pitch_scale(this.rubberbandStretcher, safeTargetPitch);
                this.wasmModule._rubberband_set_formant_scale(this.rubberbandStretcher, safeTargetFormant);
                this.lastAppliedStretchRatio = safeStretchRatio; this.lastAppliedPitchScale = safeTargetPitch; this.lastAppliedFormantScale = safeTargetFormant;
                this.resetNeeded = false; this.finalBlockSent = false; this.streamEnded = false; // Reset flags on reset
                console.log(`[Worklet ${this.trackId}] Rubberband Reset. Applied R:${safeStretchRatio.toFixed(3)}, P:${safeTargetPitch.toFixed(3)}, F:${safeTargetFormant.toFixed(3)}`);
            } else { // Apply incremental changes if no reset
                if (ratioChanged) {
                     console.log(`[Worklet ${this.trackId}] Applying Time Ratio: ${safeStretchRatio.toFixed(3)}`);
                     this.wasmModule._rubberband_set_time_ratio(this.rubberbandStretcher, safeStretchRatio);
                     this.lastAppliedStretchRatio = safeStretchRatio;
                }
                if (pitchChanged) {
                     console.log(`[Worklet ${this.trackId}] Applying Pitch Scale: ${safeTargetPitch.toFixed(3)}`);
                     this.wasmModule._rubberband_set_pitch_scale(this.rubberbandStretcher, safeTargetPitch);
                     this.lastAppliedPitchScale = safeTargetPitch;
                }
                 if (formantChanged) {
                      console.log(`[Worklet ${this.trackId}] Applying Formant Scale: ${safeTargetFormant.toFixed(3)}`);
                      this.wasmModule._rubberband_set_formant_scale(this.rubberbandStretcher, safeTargetFormant);
                      this.lastAppliedFormantScale = safeTargetFormant;
                 }
            }

            // --- Feed Input Data to Rubberband ---
            let inputFramesNeeded = Math.ceil(outputBlockSize / safeStretchRatio) + 4; // Add buffer
            inputFramesNeeded = Math.max(1, inputFramesNeeded);
            let readPosInSourceSamples = Math.max(0, Math.min(Math.round(this.playbackPositionInSeconds * this.sampleRate), sourceChannels[0].length));
            let actualInputProvided = Math.max(0, Math.min(inputFramesNeeded, sourceChannels[0].length - readPosInSourceSamples));
            const isFinalDataBlock = (readPosInSourceSamples + actualInputProvided) >= sourceChannels[0].length;
            const sendFinalFlag = isFinalDataBlock && !this.finalBlockSent;

            // console.log(`[Worklet ${this.trackId}] Input: Need=${inputFramesNeeded}, ReadPos=${readPosInSourceSamples}, Provide=${actualInputProvided}, Final=${isFinalDataBlock}, SendFinal=${sendFinalFlag}`); // Too noisy

            if (actualInputProvided > 0 || sendFinalFlag) {
                // Copy input chunk to WASM buffers
                 // console.log(`[Worklet ${this.trackId}] Copying ${actualInputProvided} input frames to WASM buffer...`); // Too noisy
                for (let i = 0; i < this.numberOfChannels; i++) {
                    const wasmInputBufferView = new Float32Array(this.wasmModule.HEAPF32.buffer, this.inputChannelBuffers[i], this.blockSizeWasm);
                    if (actualInputProvided > 0) {
                        const inputSlice = sourceChannels[i].subarray(readPosInSourceSamples, readPosInSourceSamples + actualInputProvided);
                        const copyLength = Math.min(inputSlice.length, this.blockSizeWasm); // Ensure we don't overflow WASM buffer
                        if(copyLength < actualInputProvided) console.warn(`[Worklet ${this.trackId}] Input data (${actualInputProvided}) truncated to WASM buffer size (${copyLength})`);
                        if (copyLength > 0) wasmInputBufferView.set(inputSlice.subarray(0, copyLength));
                        if (copyLength < this.blockSizeWasm) wasmInputBufferView.fill(0.0, copyLength);
                    } else { wasmInputBufferView.fill(0.0); }
                }

                // Process the chunk
                 // console.log(`[Worklet ${this.trackId}] Calling _rubberband_process (Frames: ${actualInputProvided}, Final: ${sendFinalFlag ? 1 : 0})`); // Too noisy
                this.wasmModule._rubberband_process(this.rubberbandStretcher, this.inputPtrs, actualInputProvided, sendFinalFlag ? 1 : 0);
                 // console.log(`[Worklet ${this.trackId}] _rubberband_process returned.`); // Too noisy

                // Update source playback position
                this.playbackPositionInSeconds += (actualInputProvided / this.sampleRate);
                this.playbackPositionInSeconds = Math.min(this.playbackPositionInSeconds, this.sourceDurationSeconds);

                 // --- Latency Correction & Time Update ---
                 let latencySamples = 0;
                 try {
                    if (this.wasmModule._rubberband_get_latency) {
                         latencySamples = this.wasmModule._rubberband_get_latency(this.rubberbandStretcher) ?? 0;
                         latencySamples = Math.max(0, latencySamples);
                    }
                 } catch(latencyError) { console.warn(`[Worklet ${this.trackId}] Error getting latency:`, latencyError); latencySamples = 0; }
                 // Calculate corrected time considering processing latency and output buffer duration
                 const totalLatencySeconds = (latencySamples / this.sampleRate) + (outputBlockSize / this.sampleRate);
                 let correctedTime = Math.max(0, this.playbackPositionInSeconds - totalLatencySeconds);
                 // console.log(`[Worklet ${this.trackId}] Time Update: RawPos=${this.playbackPositionInSeconds.toFixed(3)}, LatencySamps=${latencySamples}, TotalLatencySec=${totalLatencySeconds.toFixed(3)}, CorrectedTime=${correctedTime.toFixed(3)}`); // Too noisy
                 this.port?.postMessage({type: 'time-update', currentTime: correctedTime, trackId: this.trackId }); // Echo trackId

                if (sendFinalFlag) {
                     console.log(`[Worklet ${this.trackId}] Final input block flag sent.`);
                     this.finalBlockSent = true;
                }
            }

            // --- Retrieve Processed Output from Rubberband ---
            let totalRetrieved = 0; let available = 0; let retrieved = 0;
            const tempOutputBuffers = Array.from({ length: this.numberOfChannels }, () => new Float32Array(outputBlockSize));
            let retrieveLoopCount = 0; const maxRetrieveLoops = 10; // Safety break

            do {
                retrieveLoopCount++;
                 available = this.wasmModule._rubberband_available?.(this.rubberbandStretcher) ?? 0;
                 available = Math.max(0, available);
                 // console.log(`[Worklet ${this.trackId}] Retrieve Loop ${retrieveLoopCount}: Available=${available}, TotalRetrieved=${totalRetrieved}, Needed=${outputBlockSize-totalRetrieved}`); // Too noisy
                 if (available <= 0) break;

                const neededNow = outputBlockSize - totalRetrieved; if (neededNow <= 0) break;
                const framesToRetrieve = Math.min(available, neededNow, this.blockSizeWasm);
                if (framesToRetrieve <= 0) break;

                 // console.log(`[Worklet ${this.trackId}] Calling _rubberband_retrieve (Frames: ${framesToRetrieve})`); // Too noisy
                 retrieved = this.wasmModule._rubberband_retrieve?.(this.rubberbandStretcher, this.outputPtrs, framesToRetrieve) ?? -1;
                 // console.log(`[Worklet ${this.trackId}] _rubberband_retrieve returned: ${retrieved}`); // Too noisy

                if (retrieved > 0) {
                    // Copy from WASM buffers to temporary JS buffers
                    for (let i = 0; i < this.numberOfChannels; i++) {
                        const wasmOutputBufferView = new Float32Array(this.wasmModule.HEAPF32.buffer, this.outputChannelBuffers[i], retrieved);
                        const copyLength = Math.min(retrieved, tempOutputBuffers[i].length - totalRetrieved);
                        if (copyLength > 0) tempOutputBuffers[i].set(wasmOutputBufferView.subarray(0, copyLength), totalRetrieved);
                    }
                    totalRetrieved += retrieved;
                } else {
                     console.warn(`[Worklet ${this.trackId}] _rubberband_retrieve returned ${retrieved}, breaking retrieve loop.`);
                     available = 0; // Assume no more available if retrieve fails
                     break;
                }
                if (retrieveLoopCount > maxRetrieveLoops) {
                    console.warn(`[Worklet ${this.trackId}] Exceeded max retrieve loops (${maxRetrieveLoops}), breaking.`);
                    break;
                }
            } while (totalRetrieved < outputBlockSize);

            // console.log(`[Worklet ${this.trackId}] Retrieve finished. Total retrieved: ${totalRetrieved}`); // Too noisy

            // --- Copy to Final Output Buffers ---
            for (let i = 0; i < this.numberOfChannels; ++i) {
                 if (outputBuffer[i]) {
                     const copyLength = Math.min(totalRetrieved, outputBlockSize);
                     if (copyLength > 0) outputBuffer[i].set(tempOutputBuffers[i].subarray(0, copyLength));
                     if (copyLength < outputBlockSize) {
                        // console.log(`[Worklet ${this.trackId}] Zero-padding output channel ${i} from index ${copyLength}`); // Too noisy
                        outputBuffer[i].fill(0.0, copyLength);
                    }
                 } else {
                     console.warn(`[Worklet ${this.trackId}] Output buffer for channel ${i} is missing!`);
                 }
            }

            // --- Check for Actual Stream End ---
            if (this.finalBlockSent && available <= 0 && totalRetrieved < outputBlockSize) {
                if (!this.streamEnded) {
                    console.log(`[Worklet ${this.trackId}] Playback stream processing officially ended (final sent, none avail, output not filled).`);
                    this.streamEnded = true; this.isPlaying = false;
                    this.postStatus('Playback ended');
                    this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); // Echo trackId
                }
            }

        } catch (error) {
            console.error(`[Worklet ${this.trackId}] Processing Error: ${error.message}\n${error.stack}`);
            this.postError(`Processing Error: ${error.message}`);
            this.isPlaying = false; this.streamEnded = true;
            this.outputSilence(outputs);
            this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); // Echo trackId
        }

        return true; // Keep processor alive
    } // --- End process() ---

    /**
     * Fills the output buffers with silence (zeros).
     * @private
     * @param {Float32Array[][]} outputs - The output buffers array from the process method.
     */
    outputSilence(outputs) {
        if (!outputs?.[0]?.[0]) return;
        for (let channel = 0; channel < outputs[0].length; ++channel) {
            // Check if channel buffer exists before filling
            if (outputs[0][channel]) {
                outputs[0][channel].fill(0.0);
            }
        }
    }

    /**
     * Posts a status message back to the main thread (AudioEngine).
     * Includes trackId.
     * @private
     * @param {string} message - The status message string.
     */
    postStatus(message) {
        try {
            this.port?.postMessage({ type: 'status', message, trackId: this.trackId }); // Add trackId
        } catch (e) {
            console.error(`[Worklet ${this.trackId}] FAILED to post status '${message}':`, e); // Add trackId
        }
    }

    /**
     * Posts an error message back to the main thread (AudioEngine).
     * Includes trackId.
     * @private
     * @param {string} message - The error message string.
     */
    postError(message) {
         try {
             this.port?.postMessage({ type: 'error', message, trackId: this.trackId }); // Add trackId
         } catch (e) {
             console.error(`[Worklet ${this.trackId}] FAILED to post error '${message}':`, e); // Add trackId
         }
    }

    /**
     * Posts an error message and attempts to trigger cleanup.
     * @private
     * @param {string} message - The error message string.
     */
    postErrorAndStop(message) {
         console.error(`[Worklet ${this.trackId}] FATAL ERROR: ${message}. Triggering cleanup.`);
        this.postError(message);
        this.cleanup(); // Request cleanup
    }

    /**
     * Frees WASM memory allocated for channel buffers and pointer arrays.
     * Safe to call even if memory wasn't fully allocated or module is gone.
     * @private
     */
    cleanupWasmMemory() {
         console.log(`[Worklet ${this.trackId}] cleanupWasmMemory called.`);
        if (this.wasmModule?._free) {
            console.log(`[Worklet ${this.trackId}] Freeing WASM memory...`);
            try {
                this.inputChannelBuffers.forEach(ptr => { if (ptr) { /*console.log(`Freeing input buf ${ptr}`);*/ this.wasmModule._free(ptr); } });
                this.outputChannelBuffers.forEach(ptr => { if (ptr) { /*console.log(`Freeing output buf ${ptr}`);*/ this.wasmModule._free(ptr); } });
                if (this.inputPtrs) { /*console.log(`Freeing input ptrs ${this.inputPtrs}`);*/ this.wasmModule._free(this.inputPtrs); }
                if (this.outputPtrs) { /*console.log(`Freeing output ptrs ${this.outputPtrs}`);*/ this.wasmModule._free(this.outputPtrs); }
                 console.log(`[Worklet ${this.trackId}] WASM memory freed.`);
            } catch (e) { console.error(`[Worklet ${this.trackId}] Error during WASM memory cleanup:`, e); }
        } else {
             console.log(`[Worklet ${this.trackId}] WASM module or _free function not available for cleanup.`);
        }
        // Reset pointers regardless
        this.inputPtrs = 0; this.outputPtrs = 0;
        this.inputChannelBuffers = []; this.outputChannelBuffers = [];
    }

    /**
     * Cleans up all resources: deletes Rubberband instance, frees WASM memory, resets state.
     * Called on 'cleanup' message or fatal error.
     * @private
     */
    cleanup() {
        console.log(`[Worklet ${this.trackId}] Cleanup requested.`);
        this.isPlaying = false;

        // Delete Rubberband instance via WASM function
        if (this.wasmReady && this.rubberbandStretcher !== 0 && this.wasmModule?._rubberband_delete) {
            try {
                 console.log(`[Worklet ${this.trackId}] Deleting Rubberband instance (ptr=${this.rubberbandStretcher})...`);
                 this.wasmModule._rubberband_delete(this.rubberbandStretcher);
                 console.log(`[Worklet ${this.trackId}] Rubberband instance deleted.`);
            } catch (e) { console.error(`[Worklet ${this.trackId}] Error deleting Rubberband instance:`, e); }
        } else if (this.rubberbandStretcher !== 0) {
             console.warn(`[Worklet ${this.trackId}] Cannot delete Rubberband instance: WASM not ready or delete function missing.`);
        }
        this.rubberbandStretcher = 0; // Mark as deleted

        this.cleanupWasmMemory(); // Free allocated buffers

        // Reset state
        console.log(`[Worklet ${this.trackId}] Resetting internal state variables.`);
        this.wasmReady = false; this.audioLoaded = false;
        this.originalChannels = null; this.wasmModule = null;
        this.wasmBinary = null; this.loaderScriptText = null;
        this.playbackPositionInSeconds = 0; this.streamEnded = true;
        this.finalBlockSent = false; this.resetNeeded = true;

        console.log(`[Worklet ${this.trackId}] Cleanup finished.`);
        this.postStatus("Processor cleaned up"); // Notify main thread
        // Close the worklet scope? No, let the main thread handle node removal.
        // self.close(); // This would terminate the worklet entirely. Might be okay here? Let's avoid for now.
    }

} // --- End RubberbandProcessor Class ---

// --- Processor Registration ---
try {
    if (typeof registerProcessor === 'function' && typeof sampleRate !== 'undefined') {
        registerProcessor(PROCESSOR_NAME, RubberbandProcessor);
    } else {
        console.error("[Worklet Registration] registerProcessor or global sampleRate not defined.");
        try { if (self?.postMessage) self.postMessage({ type: 'error', message: 'registerProcessor or global sampleRate not defined.', trackId: 'registration' }); } catch(e) {}
    }
} catch (error) {
    console.error(`[Worklet Registration] Failed to register processor '${PROCESSOR_NAME}':`, error);
    try { if (self?.postMessage) self.postMessage({ type: 'error', message: `Failed to register processor: ${error.message}`, trackId: 'registration' }); } catch(e) {}
}
// --- /vibe-player/js/player/rubberbandProcessor.js --- // Updated Path
