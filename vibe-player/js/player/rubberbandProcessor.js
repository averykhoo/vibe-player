// --- /vibe-player/js/player/rubberbandProcessor.js ---
// AudioWorkletProcessor for real-time time-stretching using Rubberband WASM.
// REFACTORED to use numeric trackId (trackIndex) for identification.

// Constants cannot be accessed here directly, but name is needed for registration.
const PROCESSOR_NAME = 'rubberband-processor';

/**
 * @class RubberbandProcessor
 * @extends AudioWorkletProcessor
 * @description Processes audio using the Rubberband library compiled to WASM.
 * Handles loading Rubberband WASM, managing its state, processing audio frames
 * for time-stretching and pitch-shifting, and communicating with the main thread.
 * Uses a numeric trackId (trackIndex) for context.
 * Runs within an AudioWorkletGlobalScope.
 */
class RubberbandProcessor extends AudioWorkletProcessor {

    /**
     * Initializes the processor instance. Sets up initial state and message handling.
     * WASM/Rubberband initialization happens asynchronously via message handler or first process call.
     * @constructor
     * @param {AudioWorkletNodeOptions} options - Options passed from the AudioWorkletNode constructor.
     * @param {object} options.processorOptions - Custom options containing sampleRate, numberOfChannels, wasmBinary, loaderScriptText.
     * @param {number} [options.processorOptions.trackId=-1] - A numeric identifier (trackIndex) for this processor instance. **MODIFIED: Expects number**
     */
    constructor(options) {
        super();

        // --- State Initialization ---
        this.processorOpts = options.processorOptions || {};
        // ** MODIFIED: Store numeric trackId (trackIndex), default to -1 if missing **
        this.trackId = typeof this.processorOpts.trackId === 'number' ? this.processorOpts.trackId : -1;
        console.log(`[Worklet #${this.trackId}] RubberbandProcessor created.`); // Updated log format

        // Audio properties (passed in options)
        // this.sampleRate = this.processorOpts.sampleRate || sampleRate; // sampleRate is global in AudioWorkletGlobalScope
        // this.numberOfChannels = this.processorOpts.numberOfChannels || 0;

        // Directly use processorOpts for validation, then assign with fallback.
        const optSampleRate = this.processorOpts.sampleRate;
        const optNumChannels = this.processorOpts.numberOfChannels;

        if (typeof optSampleRate !== 'number' || optSampleRate <= 0) {
            this.postErrorAndStop(`Invalid SampleRate from options: ${optSampleRate}`);
            this.sampleRate = global.sampleRate; // Fallback to global AudioWorkletGlobalScope sampleRate
        } else {
            this.sampleRate = optSampleRate;
        }

        if (typeof optNumChannels !== 'number' || optNumChannels <= 0) {
            this.postErrorAndStop(`Invalid NumberOfChannels from options: ${optNumChannels}`);
            // Fallback to 0 or a sensible default, or rely on later checks if global.sampleRate also implies a channel count
            this.numberOfChannels = 0; // Defaulting to 0, subsequent checks should catch if this remains invalid
        } else {
            this.numberOfChannels = optNumChannels;
        }

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
        /** @type {boolean} */ this.resetNeeded = true;
        /** @type {boolean} */ this.streamEnded = false;
        /** @type {boolean} */ this.finalBlockSent = false;
        /** @type {number} Current playback position in SOURCE audio (seconds). */ this.playbackPositionInSeconds = 0.0;
        // WASM Memory Management
        /** @type {number} Pointer to array of input channel buffer pointers in WASM mem. */ this.inputPtrs = 0;
        /** @type {number} Pointer to array of output channel buffer pointers in WASM mem. */ this.outputPtrs = 0;
        /** @type {number[]} JS array holding pointers to input channel buffers in WASM mem. */ this.inputChannelBuffers = [];
        /** @type {number[]} JS array holding pointers to output channel buffers in WASM mem. */ this.outputChannelBuffers = [];
        /** @type {number} Size of blocks used for WASM buffer allocation/processing. */ this.blockSizeWasm = 1024;
        // Source Audio Data
        /** @type {Float32Array[]|null} Holds original audio data per channel. */ this.originalChannels = null;
        /** @type {boolean} */ this.audioLoaded = false;
        /** @type {number} */ this.sourceDurationSeconds = 0;

        // --- Message Port Setup ---
        if (this.port) {
            this.port.onmessage = this.handleMessage.bind(this);
            console.log(`[Worklet #${this.trackId}] Message port listener attached.`); // Updated log format
        } else {
            console.error(`[Worklet #${this.trackId}] CONSTRUCTOR: Message port is not available!`); // Updated log format
        }

        // --- Initial Validation ---
        if (!this.wasmBinary) this.postErrorAndStop("WASM binary missing.");
        if (!this.loaderScriptText) this.postErrorAndStop("Loader script text missing.");
        // Validations for sampleRate and numberOfChannels are now done above when assigning them.
        // However, we might still want to check the final values if fallbacks could also be invalid.
        if (!this.sampleRate || this.sampleRate <= 0) this.postErrorAndStop(`Final SampleRate is invalid: ${this.sampleRate} (after potential fallback)`);
        if (!this.numberOfChannels || this.numberOfChannels <= 0) this.postErrorAndStop(`Final NumberOfChannels is invalid: ${this.numberOfChannels} (after potential fallback)`);
        if (this.trackId === -1) this.postErrorAndStop(`Invalid trackId: ${this.trackId}`); // Check for valid numeric ID

        console.log(`[Worklet #${this.trackId}] Initialized with SR=${this.sampleRate}, Chans=${this.numberOfChannels}. Waiting for audio data.`); // Updated log format
    }

    /**
     * Initializes the WASM module and creates the Rubberband instance.
     * (Implementation is complex but internal logic doesn't directly depend on string vs number trackId,
     * only logging needs updating).
     * Posts 'processor-ready' status on success or 'error' on failure.
     * @private
     * @returns {Promise<void>} Resolves when initialization is complete, rejects on fatal error.
     */
    async initializeWasmAndRubberband() {
        // ** MODIFIED: Update all console logs within this function to use `[Worklet #${this.trackId}]` format **
        console.log(`[Worklet #${this.trackId}] initializeWasmAndRubberband called.`); // Example log update
        if (this.wasmReady) { console.warn(`[Worklet #${this.trackId}] WASM already ready, skipping initialization.`); return; }
        if (!this.wasmBinary || !this.loaderScriptText) { this.postErrorAndStop("Cannot initialize WASM: Resources missing."); return; }

        try {
            this.postStatus("Initializing WASM & Rubberband...");
            console.log(`[Worklet #${this.trackId}] Starting WASM & Rubberband instance initialization...`);

            const instantiateWasm = (imports, successCallback) => {
                console.log(`[Worklet #${this.trackId}] instantiateWasm hook called by loader.`);
                WebAssembly.instantiate(this.wasmBinary, imports)
                    .then(output => {
                        console.log(`[Worklet #${this.trackId}] WASM instantiate successful.`);
                        successCallback(output.instance, output.module);
                    })
                    .catch(error => {
                        console.error(`[Worklet #${this.trackId}] WASM instantiate hook failed:`, error);
                        this.postError(`WASM Hook Error: ${error.message}`);
                        successCallback(null, null); // Signal failure to the loader
                    });
                return {};
            };

            let loaderFunc;
            try {
                 console.log(`[Worklet #${this.trackId}] Evaluating loader script...`);
                 const getLoaderFactory = new Function('moduleArg', `${this.loaderScriptText}; return Rubberband;`);
                 loaderFunc = getLoaderFactory();
                 if (typeof loaderFunc !== 'function') throw new Error(`Loader script did not return an async function.`);
                 console.log(`[Worklet #${this.trackId}] Loader script evaluated successfully.`);
            } catch (loaderError) { console.error(`[Worklet #${this.trackId}] Loader script eval error:`, loaderError); throw new Error(`Loader script eval error: ${loaderError.message}`); }

            console.log(`[Worklet #${this.trackId}] Calling loader function...`);
            const loadedModule = await loaderFunc({ instantiateWasm: instantiateWasm });
            this.wasmModule = loadedModule;
            console.log(`[Worklet #${this.trackId}] Loader function resolved.`);

            if (!this.wasmModule || typeof this.wasmModule._rubberband_new !== 'function' || typeof this.wasmModule._malloc !== 'function' || !this.wasmModule.HEAPU32) { console.error(`[Worklet #${this.trackId}] WASM Module missing essential exports!`, this.wasmModule); throw new Error(`WASM Module loaded, but essential exports (_rubberband_new, _malloc, HEAPU32) not found.`); }
            console.log(`[Worklet #${this.trackId}] WASM module loaded and exports assigned.`);

            const RBOptions = this.wasmModule.RubberBandOptionFlag || {};
            const ProcessRealTime = RBOptions.ProcessRealTime ?? 0x00000001;
            const PitchHighQuality = RBOptions.PitchHighQuality ?? 0x02000000;
            const PhaseIndependent = RBOptions.PhaseIndependent ?? 0x00002000;
            const TransientsCrisp = RBOptions.TransientsCrisp ?? 0x00000000;
            const options = ProcessRealTime | PitchHighQuality | PhaseIndependent | TransientsCrisp;
            console.log(`[Worklet #${this.trackId}] Creating Rubberband instance with options: 0x${options.toString(16)} (SR: ${this.sampleRate}, Ch: ${this.numberOfChannels})`); // Updated log format

            this.rubberbandStretcher = this.wasmModule._rubberband_new(this.sampleRate, this.numberOfChannels, options, 1.0, 1.0);
            if (!this.rubberbandStretcher) throw new Error("_rubberband_new failed (returned 0). Check WASM logs or resource loading.");
            console.log(`[Worklet #${this.trackId}] Rubberband instance created: ptr=${this.rubberbandStretcher}`); // Updated log format

            console.log(`[Worklet #${this.trackId}] Allocating WASM memory buffers (blockSize=${this.blockSizeWasm})...`); // Updated log format
            const pointerSize = 4; const frameSize = 4;
            this.inputPtrs = this.wasmModule._malloc(this.numberOfChannels * pointerSize);
            this.outputPtrs = this.wasmModule._malloc(this.numberOfChannels * pointerSize);
            if (!this.inputPtrs || !this.outputPtrs) throw new Error("Pointer array _malloc failed.");
            console.log(`[Worklet #${this.trackId}] Pointer arrays allocated: inputPtrs=${this.inputPtrs}, outputPtrs=${this.outputPtrs}`); // Updated log format

            this.inputChannelBuffers = []; this.outputChannelBuffers = [];
            for (let i = 0; i < this.numberOfChannels; ++i) {
                const bufferSizeBytes = this.blockSizeWasm * frameSize;
                const inputBuf = this.wasmModule._malloc(bufferSizeBytes);
                const outputBuf = this.wasmModule._malloc(bufferSizeBytes);
                if (!inputBuf || !outputBuf) { this.cleanupWasmMemory(); throw new Error(`Buffer _malloc failed for Channel ${i}.`); }
                console.log(`[Worklet #${this.trackId}] Allocated channel ${i}: inputBuf=${inputBuf}, outputBuf=${outputBuf}`); // Updated log format
                this.inputChannelBuffers.push(inputBuf); this.outputChannelBuffers.push(outputBuf);
                this.wasmModule.HEAPU32[(this.inputPtrs / pointerSize) + i] = inputBuf;
                this.wasmModule.HEAPU32[(this.outputPtrs / pointerSize) + i] = outputBuf;
            }
            console.log(`[Worklet #${this.trackId}] Input/Output buffers allocated and pointers set in WASM memory.`); // Updated log format

            this.wasmReady = true;
            console.log(`[Worklet #${this.trackId}] WASM and Rubberband ready.`); // Updated log format
            this.postStatus('processor-ready');

        } catch (error) {
            console.error(`[Worklet #${this.trackId}] WASM/Rubberband Init Error: ${error.message}\n${error.stack}`); // Updated log format
            this.postError(`Init Error: ${error.message}`);
            this.wasmReady = false; this.rubberbandStretcher = 0;
            this.cleanupWasmMemory();
        }
         console.log(`[Worklet #${this.trackId}] initializeWasmAndRubberband finished.`); // Updated log format
    }

    /**
     * Handles messages received from the main thread (AudioEngine).
     * Expects `trackId` to potentially be missing in data for older messages, uses `this.trackId`.
     * @param {MessageEvent} event - The event object containing message data.
     */
    handleMessage(event) {
        const data = event.data;
        // ** MODIFIED: Log uses this.trackId directly **
        console.log(`[Worklet #${this.trackId}] Received message: Type=${data.type}`, data);

        try {
            switch (data.type) {
                case 'load-audio':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'load-audio'...`);
                    this.playbackPositionInSeconds = 0; this.resetNeeded = true;
                    this.streamEnded = false; this.finalBlockSent = false;
                    this.currentTargetSpeed = 1.0; this.lastAppliedStretchRatio = 1.0;
                    this.currentTargetPitchScale = 1.0; this.lastAppliedPitchScale = 1.0;
                    this.currentTargetFormantScale = 1.0; this.lastAppliedFormantScale = 1.0;
                    this.audioLoaded = false; this.originalChannels = null; this.sourceDurationSeconds = 0;
                    console.log(`[Worklet #${this.trackId}] State reset for new audio.`);

                    if (data.channelData && Array.isArray(data.channelData) && data.channelData.length === this.numberOfChannels) {
                         console.log(`[Worklet #${this.trackId}] Converting received ArrayBuffers (${data.channelData.length} channels)...`);
                        this.originalChannels = data.channelData.map(buffer => new Float32Array(buffer));
                        this.audioLoaded = true;
                        this.sourceDurationSeconds = (this.originalChannels[0]?.length || 0) / this.sampleRate;
                        console.log(`[Worklet #${this.trackId}] Audio loaded. Duration: ${this.sourceDurationSeconds.toFixed(3)}s`);
                        if (!this.wasmReady) {
                             console.log(`[Worklet #${this.trackId}] Triggering WASM initialization after audio load...`);
                             this.initializeWasmAndRubberband();
                        } else {
                            console.log(`[Worklet #${this.trackId}] WASM already initialized, posting processor-ready.`);
                            this.postStatus('processor-ready');
                        }
                    } else {
                         console.error(`[Worklet #${this.trackId}] Invalid audio data received. Expected ${this.numberOfChannels} channels.`, data.channelData);
                         this.postError('Invalid audio data received.');
                    }
                    break;

                case 'play':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'play'...`);
                    if (this.wasmReady && this.audioLoaded) {
                        if (!this.isPlaying) {
                             console.log(`[Worklet #${this.trackId}] Starting playback.`);
                            if (this.streamEnded || this.playbackPositionInSeconds >= this.sourceDurationSeconds) {
                                 console.log(`[Worklet #${this.trackId}] Stream was ended or at end, resetting position.`);
                                this.playbackPositionInSeconds = 0; this.resetNeeded = true;
                                this.streamEnded = false; this.finalBlockSent = false;
                            }
                            this.isPlaying = true;
                            // ** MODIFIED: Ensure numeric trackId is sent back **
                            this.port?.postMessage({ type: 'playback-state', isPlaying: true, trackId: this.trackId });
                        } else { console.log(`[Worklet #${this.trackId}] Play command received but already playing.`); }
                    } else {
                         const reason = !this.wasmReady ? 'WASM not ready' : 'Audio not loaded';
                         console.error(`[Worklet #${this.trackId}] Cannot play: ${reason}.`);
                         this.postError(`Cannot play: ${reason}.`);
                         // ** MODIFIED: Ensure numeric trackId is sent back **
                         this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId });
                    }
                    break;

                case 'pause':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'pause'...`);
                    if (this.isPlaying) {
                        this.isPlaying = false; console.log(`[Worklet #${this.trackId}] Pausing playback.`);
                        // ** MODIFIED: Ensure numeric trackId is sent back **
                        this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId });
                    } else { console.log(`[Worklet #${this.trackId}] Pause command received but already paused.`); }
                    break;

                case 'set-speed':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'set-speed' to ${data.value}...`);
                    if (this.wasmReady) { const newSpeed = Math.max(0.01, data.value || 1.0); if (this.currentTargetSpeed !== newSpeed) { console.log(`[Worklet #${this.trackId}] Updating target speed from ${this.currentTargetSpeed.toFixed(3)} to ${newSpeed.toFixed(3)}`); this.currentTargetSpeed = newSpeed; } else { console.log(`[Worklet #${this.trackId}] Speed unchanged (${newSpeed.toFixed(3)}), ignoring.`); } }
                    else { console.warn(`[Worklet #${this.trackId}] Ignoring set-speed, WASM not ready.`); }
                    break;
                 case 'set-pitch':
                     // ** MODIFIED: Update logs **
                     console.log(`[Worklet #${this.trackId}] Handling 'set-pitch' to ${data.value}...`);
                     if (this.wasmReady) { const newPitch = Math.max(0.1, data.value || 1.0); if (this.currentTargetPitchScale !== newPitch) { console.log(`[Worklet #${this.trackId}] Updating target pitch from ${this.currentTargetPitchScale.toFixed(3)} to ${newPitch.toFixed(3)}`); this.currentTargetPitchScale = newPitch; } else { console.log(`[Worklet #${this.trackId}] Pitch unchanged (${newPitch.toFixed(3)}), ignoring.`); } }
                     else { console.warn(`[Worklet #${this.trackId}] Ignoring set-pitch, WASM not ready.`); }
                     break;
                 case 'set-formant':
                     // ** MODIFIED: Update logs **
                     console.log(`[Worklet #${this.trackId}] Handling 'set-formant' to ${data.value}...`);
                     if (this.wasmReady) { const newFormant = Math.max(0.1, data.value || 1.0); if (this.currentTargetFormantScale !== newFormant) { console.log(`[Worklet #${this.trackId}] Updating target formant from ${this.currentTargetFormantScale.toFixed(3)} to ${newFormant.toFixed(3)}`); this.currentTargetFormantScale = newFormant; } else { console.log(`[Worklet #${this.trackId}] Formant unchanged (${newFormant.toFixed(3)}), ignoring.`); } }
                     else { console.warn(`[Worklet #${this.trackId}] Ignoring set-formant, WASM not ready.`); }
                     break;

                case 'seek':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'seek' to ${data.positionSeconds}...`);
                    if (this.wasmReady && this.audioLoaded) {
                        const seekPosition = Math.max(0, Math.min(data.positionSeconds || 0, this.sourceDurationSeconds));
                        this.playbackPositionInSeconds = seekPosition; this.resetNeeded = true;
                        this.streamEnded = false; this.finalBlockSent = false;
                        console.log(`[Worklet #${this.trackId}] Seek position set to ${this.playbackPositionInSeconds.toFixed(3)}s. Reset flag enabled.`);
                        // ** MODIFIED: Ensure numeric trackId is sent back **
                        this.port?.postMessage({type: 'time-update', currentTime: this.playbackPositionInSeconds, trackId: this.trackId });
                    } else {
                         const reason = !this.wasmReady ? 'WASM not ready' : 'Audio not loaded';
                         console.warn(`[Worklet #${this.trackId}] Ignoring seek: ${reason}.`);
                    }
                    break;

                case 'cleanup':
                    // ** MODIFIED: Update logs **
                    console.log(`[Worklet #${this.trackId}] Handling 'cleanup'...`);
                    this.cleanup();
                    break;
                default:
                    // ** MODIFIED: Update logs **
                    console.warn(`[Worklet #${this.trackId}] Received unknown message type:`, data.type);
            }
        } catch (error) {
             // ** MODIFIED: Update logs and ensure numeric trackId is sent back **
             console.error(`[Worklet #${this.trackId}] Error handling message type '${data.type}': ${error.stack}`);
             this.postError(`Error handling message '${data.type}': ${error.message}`);
             this.isPlaying = false;
             this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId });
        }
        // ** MODIFIED: Update logs **
        console.log(`[Worklet #${this.trackId}] Finished handling message: ${data.type}`);
    }

    /**
     * Core audio processing method called by the AudioWorklet system.
     * Pulls source audio data, processes it through Rubberband WASM if playing,
     * retrieves stretched/shifted audio, and fills the output buffers.
     * Handles parameter updates (speed, pitch), state resets, and end-of-stream logic.
     * Sends 'time-update' and 'playback-state' messages to the main thread with numeric trackId.
     * @param {Float32Array[][]} inputs - Input audio data (unused).
     * @param {Float32Array[][]} outputs - Output buffers to fill.
     * @param {Record<string, Float32Array>} parameters - Audio parameters (unused).
     * @returns {boolean} - Return true to keep the processor alive, false to terminate.
     */
    process(inputs, outputs, parameters) {
        // *** ADDED Log: Check if process is being called ***
        // console.log(`[Worklet #${this.trackId}] process() called. isPlaying=${this.isPlaying}, wasmReady=${this.wasmReady}, audioLoaded=${this.audioLoaded}`); // Optional: Too noisy

        // --- Essential Checks ---
        if (!this.wasmReady || !this.audioLoaded || !this.rubberbandStretcher || !this.wasmModule) {
            this.outputSilence(outputs); return true;
        }
        if (!this.isPlaying) {
            this.outputSilence(outputs); return true;
        }

        const outputBuffer = outputs[0];
        if (!outputBuffer || outputBuffer.length !== this.numberOfChannels || !outputBuffer[0]) { console.error(`[Worklet #${this.trackId}] Process Error: Invalid output buffer structure.`); this.postError("Invalid output buffer structure."); this.outputSilence(outputs); return true; }
        const outputBlockSize = outputBuffer[0].length;
        if (outputBlockSize === 0) { console.warn(`[Worklet #${this.trackId}] Process Warning: Output block size is 0.`); return true; }

        // --- End-of-Stream Check (Before Processing) ---
        if (this.streamEnded) {
             let available = this.wasmModule._rubberband_available?.(this.rubberbandStretcher) ?? 0; available = Math.max(0, available);
             if (available <= 0) { this.outputSilence(outputs); return true; }
        }

        // *** ADDED Log: Check before try block ***
        // console.log(`[Worklet #${this.trackId}] Entering process try block... resetNeeded=${this.resetNeeded}`); // Optional: Might be noisy

        try {
            // --- Apply Parameter Changes ---
            // (Get sourceChannels, calculate target ratios etc. - unchanged)
            const sourceChannels = this.originalChannels;
            const targetStretchRatio = 1.0 / Math.max(0.01, this.currentTargetSpeed);
            const safeStretchRatio = Math.max(0.05, Math.min(20.0, targetStretchRatio));
            const safeTargetPitch = Math.max(0.1, this.currentTargetPitchScale);
            const safeTargetFormant = Math.max(0.1, this.currentTargetFormantScale);
            const ratioChanged = Math.abs(safeStretchRatio - this.lastAppliedStretchRatio) > 1e-6;
            const pitchChanged = Math.abs(safeTargetPitch - this.lastAppliedPitchScale) > 1e-6;
            const formantChanged = Math.abs(safeTargetFormant - this.lastAppliedFormantScale) > 1e-6;

            if (this.resetNeeded) {
                console.log(`[Worklet #${this.trackId}] Applying Reset.`);
                this.wasmModule._rubberband_reset(this.rubberbandStretcher);
                this.wasmModule._rubberband_set_time_ratio(this.rubberbandStretcher, safeStretchRatio);
                this.wasmModule._rubberband_set_pitch_scale(this.rubberbandStretcher, safeTargetPitch);
                this.wasmModule._rubberband_set_formant_scale(this.rubberbandStretcher, safeTargetFormant);
                this.lastAppliedStretchRatio = safeStretchRatio; this.lastAppliedPitchScale = safeTargetPitch; this.lastAppliedFormantScale = safeTargetFormant;
                this.resetNeeded = false; this.finalBlockSent = false; this.streamEnded = false;
                console.log(`[Worklet #${this.trackId}] Rubberband Reset. Applied R:${safeStretchRatio.toFixed(3)}, P:${safeTargetPitch.toFixed(3)}, F:${safeTargetFormant.toFixed(3)}`);
                 // *** ADDED Log: After reset applied ***
                 console.log(`[Worklet #${this.trackId}] After reset. Continuing processing...`);
            } else { // Apply incremental changes if no reset
                if (ratioChanged) { /* ... apply ratio ... */ console.log(`[Worklet #${this.trackId}] Applying Time Ratio: ${safeStretchRatio.toFixed(3)}`); this.wasmModule._rubberband_set_time_ratio(this.rubberbandStretcher, safeStretchRatio); this.lastAppliedStretchRatio = safeStretchRatio; }
                if (pitchChanged) { /* ... apply pitch ... */ console.log(`[Worklet #${this.trackId}] Applying Pitch Scale: ${safeTargetPitch.toFixed(3)}`); this.wasmModule._rubberband_set_pitch_scale(this.rubberbandStretcher, safeTargetPitch); this.lastAppliedPitchScale = safeTargetPitch; }
                 if (formantChanged) { /* ... apply formant ... */ console.log(`[Worklet #${this.trackId}] Applying Formant Scale: ${safeTargetFormant.toFixed(3)}`); this.wasmModule._rubberband_set_formant_scale(this.rubberbandStretcher, safeTargetFormant); this.lastAppliedFormantScale = safeTargetFormant; }
            }

            // --- Feed Input Data to Rubberband ---
            // *** ADDED Log: Before input feeding ***
            // console.log(`[Worklet #${this.trackId}] Preparing input data...`); // Optional: Noisy

            // (Calculate inputFramesNeeded, readPosInSourceSamples, etc. - unchanged)
            let inputFramesNeeded = Math.ceil(outputBlockSize / safeStretchRatio) + 4;
            inputFramesNeeded = Math.max(1, inputFramesNeeded);
            let readPosInSourceSamples = Math.max(0, Math.min(Math.round(this.playbackPositionInSeconds * this.sampleRate), sourceChannels[0].length));
            let actualInputProvided = Math.max(0, Math.min(inputFramesNeeded, sourceChannels[0].length - readPosInSourceSamples));
            const isFinalDataBlock = (readPosInSourceSamples + actualInputProvided) >= sourceChannels[0].length;
            const sendFinalFlag = isFinalDataBlock && !this.finalBlockSent;

            if (actualInputProvided > 0 || sendFinalFlag) {
                // (Copy input chunk to WASM buffers - unchanged)
                for (let i = 0; i < this.numberOfChannels; i++) { const wasmInputBufferView = new Float32Array(this.wasmModule.HEAPF32.buffer, this.inputChannelBuffers[i], this.blockSizeWasm); if (actualInputProvided > 0) { const inputSlice = sourceChannels[i].subarray(readPosInSourceSamples, readPosInSourceSamples + actualInputProvided); const copyLength = Math.min(inputSlice.length, this.blockSizeWasm); if(copyLength < actualInputProvided) console.warn(`[Worklet #${this.trackId}] Input data (${actualInputProvided}) truncated to WASM buffer size (${copyLength})`); if (copyLength > 0) wasmInputBufferView.set(inputSlice.subarray(0, copyLength)); if (copyLength < this.blockSizeWasm) wasmInputBufferView.fill(0.0, copyLength); } else { wasmInputBufferView.fill(0.0); } }

                // *** ADDED Log: Before calling process ***
                // console.log(`[Worklet #${this.trackId}] Calling _rubberband_process (Frames: ${actualInputProvided}, Final: ${sendFinalFlag ? 1 : 0})`); // Optional: Noisy
                this.wasmModule._rubberband_process(this.rubberbandStretcher, this.inputPtrs, actualInputProvided, sendFinalFlag ? 1 : 0);
                // *** ADDED Log: After calling process ***
                // console.log(`[Worklet #${this.trackId}] _rubberband_process returned.`); // Optional: Noisy

                // (Update source playback position - unchanged)
                this.playbackPositionInSeconds += (actualInputProvided / this.sampleRate);
                this.playbackPositionInSeconds = Math.min(this.playbackPositionInSeconds, this.sourceDurationSeconds);

                 // --- Latency Correction & Time Update --- (Unchanged)
                 let latencySamples = 0; try { if (this.wasmModule._rubberband_get_latency) { latencySamples = this.wasmModule._rubberband_get_latency(this.rubberbandStretcher) ?? 0; latencySamples = Math.max(0, latencySamples); } } catch(latencyError) { console.warn(`[Worklet #${this.trackId}] Error getting latency:`, latencyError); latencySamples = 0; } const totalLatencySeconds = (latencySamples / this.sampleRate) + (outputBlockSize / this.sampleRate); let correctedTime = Math.max(0, this.playbackPositionInSeconds - totalLatencySeconds); this.port?.postMessage({type: 'time-update', currentTime: correctedTime, trackId: this.trackId });

                if (sendFinalFlag) { console.log(`[Worklet #${this.trackId}] Final input block flag sent.`); this.finalBlockSent = true; }
            } else {
                 // *** ADDED Log: When no input is provided ***
                 // console.log(`[Worklet #${this.trackId}] No input provided this cycle (ActualInput=${actualInputProvided}, SendFinal=${sendFinalFlag}).`); // Optional: Noisy
            }

            // --- Retrieve Processed Output from Rubberband ---
            // *** ADDED Log: Before output retrieval ***
            // console.log(`[Worklet #${this.trackId}] Retrieving output data...`); // Optional: Noisy
            let totalRetrieved = 0; let available = 0; let retrieved = 0;
            const tempOutputBuffers = Array.from({ length: this.numberOfChannels }, () => new Float32Array(outputBlockSize));
            let retrieveLoopCount = 0; const maxRetrieveLoops = 10;

            do { // (Retrieve loop - unchanged)
                retrieveLoopCount++; available = this.wasmModule._rubberband_available?.(this.rubberbandStretcher) ?? 0; available = Math.max(0, available); const neededNow = outputBlockSize - totalRetrieved; if (available <= 0 || neededNow <= 0) break; const framesToRetrieve = Math.min(available, neededNow, this.blockSizeWasm); if (framesToRetrieve <= 0) break; retrieved = this.wasmModule._rubberband_retrieve?.(this.rubberbandStretcher, this.outputPtrs, framesToRetrieve) ?? -1; if (retrieved > 0) { for (let i = 0; i < this.numberOfChannels; i++) { const wasmOutputBufferView = new Float32Array(this.wasmModule.HEAPF32.buffer, this.outputChannelBuffers[i], retrieved); const copyLength = Math.min(retrieved, tempOutputBuffers[i].length - totalRetrieved); if (copyLength > 0) tempOutputBuffers[i].set(wasmOutputBufferView.subarray(0, copyLength), totalRetrieved); } totalRetrieved += retrieved; } else { console.warn(`[Worklet #${this.trackId}] _rubberband_retrieve returned ${retrieved}, breaking retrieve loop.`); available = 0; break; } if (retrieveLoopCount > maxRetrieveLoops) { console.warn(`[Worklet #${this.trackId}] Exceeded max retrieve loops (${maxRetrieveLoops}), breaking.`); break; }
            } while (totalRetrieved < outputBlockSize);

            // --- Copy to Final Output Buffers --- (Unchanged)
            for (let i = 0; i < this.numberOfChannels; ++i) { if (outputBuffer[i]) { const copyLength = Math.min(totalRetrieved, outputBlockSize); if (copyLength > 0) outputBuffer[i].set(tempOutputBuffers[i].subarray(0, copyLength)); if (copyLength < outputBlockSize) { outputBuffer[i].fill(0.0, copyLength); } } else { console.warn(`[Worklet #${this.trackId}] Output buffer for channel ${i} is missing!`); } }

            // --- Check for Actual Stream End --- (Unchanged)
            console.log(`[Worklet #${this.trackId}] DEBUG EOS Check: finalBlockSent=${this.finalBlockSent}, available=${available}, totalRetrieved=${totalRetrieved}, outputBlockSize=${outputBlockSize}, streamEnded=${this.streamEnded}`);
            if (this.finalBlockSent && available <= 0 && totalRetrieved < outputBlockSize) { if (!this.streamEnded) { console.log(`[Worklet #${this.trackId}] Playback stream processing officially ended.`); this.streamEnded = true; this.isPlaying = false; this.postStatus('Playback ended'); this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId }); } }

        } catch (error) { // Error handling unchanged
            console.error(`[Worklet #${this.trackId}] Processing Error: ${error.message}\n${error.stack}`);
            this.postError(`Processing Error: ${error.message}`);
            this.isPlaying = false; this.streamEnded = true;
            this.outputSilence(outputs);
            this.port?.postMessage({ type: 'playback-state', isPlaying: false, trackId: this.trackId });
        }

        return true; // Keep processor alive
    } // --- End process() ---

    /** Fills output buffers with silence. (Implementation unchanged) */
    outputSilence(outputs) {
        if (!outputs?.[0]?.[0]) return;
        for (let channel = 0; channel < outputs[0].length; ++channel) { if (outputs[0][channel]) { outputs[0][channel].fill(0.0); } }
    }

    /**
     * Posts a status message back to the main thread. Includes numeric trackId.
     * @private
     * @param {string} message - The status message string.
     */
    postStatus(message) {
        try { this.port?.postMessage({ type: 'status', message, trackId: this.trackId }); }
        catch (e) { console.error(`[Worklet #${this.trackId}] FAILED to post status '${message}':`, e); } // Log format
    }

    /**
     * Posts an error message back to the main thread. Includes numeric trackId.
     * @private
     * @param {string} message - The error message string.
     */
    postError(message) {
         try { this.port?.postMessage({ type: 'error', message, trackId: this.trackId }); }
         catch (e) { console.error(`[Worklet #${this.trackId}] FAILED to post error '${message}':`, e); } // Log format
    }

    /** Posts an error message and attempts cleanup. */
    postErrorAndStop(message) {
         console.error(`[Worklet #${this.trackId}] FATAL ERROR: ${message}. Triggering cleanup.`); // Log format
        this.postError(message); this.cleanup();
    }

    /** Frees WASM memory allocated for buffers. */
    cleanupWasmMemory() {
         // ** MODIFIED: Update all console logs within this function to use `[Worklet #${this.trackId}]` format **
         console.log(`[Worklet #${this.trackId}] cleanupWasmMemory called.`);
        if (this.wasmModule?._free) {
            console.log(`[Worklet #${this.trackId}] Freeing WASM memory...`);
            try {
                this.inputChannelBuffers.forEach(ptr => { if (ptr) { this.wasmModule._free(ptr); } });
                this.outputChannelBuffers.forEach(ptr => { if (ptr) { this.wasmModule._free(ptr); } });
                if (this.inputPtrs) { this.wasmModule._free(this.inputPtrs); }
                if (this.outputPtrs) { this.wasmModule._free(this.outputPtrs); }
                 console.log(`[Worklet #${this.trackId}] WASM memory freed.`);
            } catch (e) { console.error(`[Worklet #${this.trackId}] Error during WASM memory cleanup:`, e); }
        } else { console.log(`[Worklet #${this.trackId}] WASM module or _free function not available for cleanup.`); }
        this.inputPtrs = 0; this.outputPtrs = 0;
        this.inputChannelBuffers = []; this.outputChannelBuffers = [];
    }

    /** Cleans up all resources. */
    cleanup() {
        // ** MODIFIED: Update all console logs within this function to use `[Worklet #${this.trackId}]` format **
        console.log(`[Worklet #${this.trackId}] Cleanup requested.`);
        this.isPlaying = false;
        if (this.wasmReady && this.rubberbandStretcher !== 0 && this.wasmModule?._rubberband_delete) {
            try { console.log(`[Worklet #${this.trackId}] Deleting Rubberband instance (ptr=${this.rubberbandStretcher})...`); this.wasmModule._rubberband_delete(this.rubberbandStretcher); console.log(`[Worklet #${this.trackId}] Rubberband instance deleted.`); }
            catch (e) { console.error(`[Worklet #${this.trackId}] Error deleting Rubberband instance:`, e); }
        } else if (this.rubberbandStretcher !== 0) { console.warn(`[Worklet #${this.trackId}] Cannot delete Rubberband instance: WASM not ready or delete function missing.`); }
        this.rubberbandStretcher = 0;
        this.cleanupWasmMemory();
        console.log(`[Worklet #${this.trackId}] Resetting internal state variables.`);
        this.wasmReady = false; this.audioLoaded = false;
        this.originalChannels = null; this.wasmModule = null;
        this.wasmBinary = null; this.loaderScriptText = null; // Clear WASM resources
        this.playbackPositionInSeconds = 0; this.streamEnded = true;
        this.finalBlockSent = false; this.resetNeeded = true;
        console.log(`[Worklet #${this.trackId}] Cleanup finished.`);
        this.postStatus("Processor cleaned up");
    }

} // --- End RubberbandProcessor Class ---

// --- Processor Registration ---
// Wrap in a check for environments where registerProcessor might not be defined (e.g. Jest)
if (typeof registerProcessor === 'function') {
    try {
        // sampleRate is globally available in AudioWorkletGlobalScope, check if it's defined
        if (typeof sampleRate === 'undefined') {
             console.error("[Worklet Registration] global sampleRate not defined. This is unexpected in an AudioWorkletGlobalScope.");
        }
        registerProcessor(PROCESSOR_NAME, RubberbandProcessor);
    } catch (error) {
        console.error(`[Worklet Registration] Failed to register processor '${PROCESSOR_NAME}':`, error);
        try { if (self?.postMessage) self.postMessage({ type: 'error', message: `Failed to register processor: ${error.message}`, trackId: -1 }); } catch(e) {}
    }
} else {
    console.warn("[Worklet Registration] registerProcessor is not defined. Skipping registration (expected in Jest).");
}

// Export the class for Jest testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RubberbandProcessor;
}
// --- /vibe-player/js/player/rubberbandProcessor.js ---
