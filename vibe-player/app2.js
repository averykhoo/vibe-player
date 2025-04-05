// /vibe-player/app2.js
// Simple POC script for multi-track Rubberband testing (with hardcoded constants).

(function() {
    'use strict';

    console.log("APP2: Script loaded.");

    // === Hardcoded Constants (Replacing js/constants.js dependency) ===
    const POC_CONSTANTS = {
        PROCESSOR_SCRIPT_URL: 'js/player/rubberbandProcessor.js',
        PROCESSOR_NAME: 'rubberband-processor',
        WASM_BINARY_URL: 'lib/rubberband.wasm',
        LOADER_SCRIPT_URL: 'lib/rubberband-loader.js'
    };
    console.log("APP2: Using hardcoded constants:", POC_CONSTANTS);

    // === DOM Elements ===
    const fileInputLeft = document.getElementById('fileInputLeft');
    const fileInputRight = document.getElementById('fileInputRight');
    const fileNameLeft = document.getElementById('fileNameLeft');
    const fileNameRight = document.getElementById('fileNameRight');
    const playPauseButton = document.getElementById('playPauseButton');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const statusDiv = document.getElementById('status');

    // === Audio State ===
    /** @type {AudioContext|null} */
    let audioCtx = null;
    /** @type {ArrayBuffer|null} */
    let wasmBinary = null;
    /** @type {string|null} */
    let loaderScriptText = null;
    /** @type {boolean} */
    let resourcesReady = false;
    /** @type {boolean} */
    let workletModuleLoaded = false;

    /** @typedef {{file: File|null, audioBuffer: AudioBuffer|null, workletNode: AudioWorkletNode|null, pannerNode: StereoPannerNode|null, isReady: boolean, name: string, trackId: string}} TrackState */

    /** @type {TrackState} */
    const trackLeft = {
        file: null,
        audioBuffer: null,
        workletNode: null,
        pannerNode: null,
        isReady: false,
        name: 'Left',
        trackId: 'track_left' // Unique ID
    };

    /** @type {TrackState} */
    const trackRight = {
        file: null,
        audioBuffer: null,
        workletNode: null,
        pannerNode: null,
        isReady: false,
        name: 'Right',
        trackId: 'track_right' // Unique ID
    };

    /** @type {boolean} */
    let isPlaying = false;
    /** @type {number} */
    let currentSpeed = 1.0;

    // === Initialization ===

    function init() {
        logStatus("Initializing POC...");
        setupAudioContext();
        addEventListeners();
        // Fetch resources immediately, but module loading waits for context
        preFetchWorkletResources().then(() => {
            resourcesReady = true;
            logStatus("WASM resources fetched. Ready for context/module load.");
            checkAndLoadWorkletModule(); // Attempt module load if context ready
        }).catch(error => {
            logError(`Failed to fetch WASM resources: ${error.message}`);
            disableControlsOnError("Resource Fetch Failed");
        });
    }

    /** Sets up the AudioContext */
    function setupAudioContext() {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            logStatus(`AudioContext created (state: ${audioCtx.state}, sample rate: ${audioCtx.sampleRate})`);
            if (audioCtx.state === 'suspended') {
                logStatus("AudioContext is suspended. Will attempt resume on first interaction.");
            }
        } catch (e) {
            logError(`Failed to create AudioContext: ${e.message}`);
            audioCtx = null;
            disableControlsOnError("AudioContext Failed");
        }
    }

    /** Fetches WASM binary and loader script */
    async function preFetchWorkletResources() {
        logStatus("Fetching WASM resources...");
        // Using hardcoded paths from POC_CONSTANTS
        try {
            const wasmResponse = await fetch(POC_CONSTANTS.WASM_BINARY_URL);
            if (!wasmResponse.ok) throw new Error(`Fetch failed ${wasmResponse.status} for WASM binary (${POC_CONSTANTS.WASM_BINARY_URL})`);
            wasmBinary = await wasmResponse.arrayBuffer();

            const loaderResponse = await fetch(POC_CONSTANTS.LOADER_SCRIPT_URL);
            if (!loaderResponse.ok) throw new Error(`Fetch failed ${loaderResponse.status} for Loader script (${POC_CONSTANTS.LOADER_SCRIPT_URL})`);
            loaderScriptText = await loaderResponse.text();
            logStatus(`WASM resources fetched: Binary (${wasmBinary.byteLength} bytes), Loader (${loaderScriptText.length} chars)`);
        } catch (error) {
            wasmBinary = null;
            loaderScriptText = null;
            throw error; // Re-throw for init() to catch
        }
    }

     /** Checks dependencies and loads the AudioWorklet module if possible */
     async function checkAndLoadWorkletModule() {
        if (!audioCtx || audioCtx.state === 'closed' || !resourcesReady || workletModuleLoaded) {
             if (!audioCtx || audioCtx.state === 'closed') logStatus("Worklet module load deferred: AudioContext not ready.");
             else if (!resourcesReady) logStatus("Worklet module load deferred: WASM resources not ready.");
             else if (workletModuleLoaded) logStatus("Worklet module already loaded.");
            return;
        }
         if (audioCtx.state === 'suspended') {
             logStatus("Worklet module load deferred: AudioContext suspended. Waiting for resume.");
             return;
         }

        try {
            // Using hardcoded path from POC_CONSTANTS
            logStatus(`Adding AudioWorklet module: ${POC_CONSTANTS.PROCESSOR_SCRIPT_URL}`);
            await audioCtx.audioWorklet.addModule(POC_CONSTANTS.PROCESSOR_SCRIPT_URL);
            workletModuleLoaded = true;
            logStatus("AudioWorklet module added successfully.");
            checkIfReadyToInstantiate(); // Check if files are also loaded
        } catch (error) {
            logError(`Failed to add AudioWorklet module: ${error.message}`);
            disableControlsOnError("Worklet Module Load Failed");
            workletModuleLoaded = false;
        }
    }

    /** Adds UI event listeners */
    function addEventListeners() {
        logStatus("Adding event listeners...");

        fileInputLeft.addEventListener('change', (e) => handleFileSelect(e, trackLeft, fileNameLeft));
        fileInputRight.addEventListener('change', (e) => handleFileSelect(e, trackRight, fileNameRight));

        playPauseButton.addEventListener('click', handlePlayPause);
        speedSlider.addEventListener('input', handleSpeedChange);

        // Context resume logic
        const resumeContext = async () => {
            if (audioCtx && audioCtx.state === 'suspended') {
                logStatus("Attempting to resume AudioContext due to user interaction...");
                try {
                    await audioCtx.resume();
                    logStatus(`AudioContext resumed (state: ${audioCtx.state})`);
                    if (!workletModuleLoaded) {
                        await checkAndLoadWorkletModule(); // Try loading module again now
                    }
                     checkIfReadyToInstantiate(); // Check if files also loaded
                } catch (e) {
                    logError(`Failed to resume AudioContext: ${e.message}`);
                    disableControlsOnError("AudioContext Resume Failed");
                }
            }
             // Remove listener after first attempt (or success)
             document.removeEventListener('click', resumeContext);
             document.removeEventListener('touchend', resumeContext);
             document.removeEventListener('keydown', resumeContext);
        };
        document.addEventListener('click', resumeContext);
        document.addEventListener('touchend', resumeContext);
        document.addEventListener('keydown', resumeContext);
    }

    /** Handles file selection, decoding */
    async function handleFileSelect(event, trackState, nameDisplayElement) {
        const file = event.target.files?.[0];
        if (!file || !audioCtx) {
            logStatus(`No file selected or AudioContext not ready for track ${trackState.name}`);
            return;
        }

        trackState.file = file;
        nameDisplayElement.textContent = file.name;
        logStatus(`Track ${trackState.name}: File selected - ${file.name}. Decoding...`);
        disableControlsDuringLoad(); // Disable controls while loading

        try {
            const arrayBuffer = await file.arrayBuffer();
            try {
                 trackState.audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                 logStatus(`Track ${trackState.name}: Decoded ${trackState.audioBuffer.duration.toFixed(2)}s @ ${trackState.audioBuffer.sampleRate}Hz (${trackState.audioBuffer.numberOfChannels}ch)`);
                 trackState.isReady = false;
                 checkIfReadyToInstantiate();
            } catch (decodeError) {
                 logError(`Track ${trackState.name}: decodeAudioData failed: ${decodeError.message}`);
                 trackState.audioBuffer = null;
                 nameDisplayElement.textContent = `Decode Error!`;
                 enableControlsIfReady();
            }
        } catch (readError) {
            logError(`Track ${trackState.name}: Failed to read file: ${readError.message}`);
            trackState.audioBuffer = null;
            nameDisplayElement.textContent = `Read Error!`;
            enableControlsIfReady();
        }
    }

    /** Checks if both tracks decoded and module loaded, then starts worklet creation */
    function checkIfReadyToInstantiate() {
        if (trackLeft.audioBuffer && trackRight.audioBuffer && workletModuleLoaded && audioCtx && audioCtx.state === 'running') {
            logStatus("Both tracks decoded and worklet module loaded. Instantiating worklets...");
            instantiateWorklets();
        } else {
             let reason = [];
             if (!trackLeft.audioBuffer) reason.push("Left track not decoded");
             if (!trackRight.audioBuffer) reason.push("Right track not decoded");
             if (!workletModuleLoaded) reason.push("Worklet module not loaded");
             if (!audioCtx || audioCtx.state !== 'running') reason.push(`AudioContext not ready (${audioCtx?.state})`);
             logStatus(`Not ready to instantiate: ${reason.join(', ')}`);
        }
    }

       /** Creates and connects worklet nodes for both tracks */
    async function instantiateWorklets() {
        logStatus("Starting worklet instantiation process...");

        // --- REMOVE THESE LINES ---
        // await cleanupTrack(trackLeft); // Problematic cleanup before setup
        // await cleanupTrack(trackRight); // Problematic cleanup before setup
        // --- END OF REMOVAL ---

        // Ensure previous nodes ARE definitely cleaned up if they exist from a prior run/error
        if (trackLeft.workletNode || trackLeft.pannerNode) {
            logWarn("Found existing nodes for Left track before instantiation, cleaning up first...");
            await cleanupTrack(trackLeft);
        }
         if (trackRight.workletNode || trackRight.pannerNode) {
             logWarn("Found existing nodes for Right track before instantiation, cleaning up first...");
             await cleanupTrack(trackRight);
         }
         // Now proceed with setup, the audioBuffers should still be present

        try {
            await setupTrackAudioNodes(trackLeft, -1); // Pan left
            await setupTrackAudioNodes(trackRight, 1); // Pan right
            logStatus("Worklet instantiation process completed for both tracks.");
            // enableControlsIfReady() will be called by 'processor-ready' handler
        } catch (error) {
            logError(`Failed during worklet instantiation: ${error.message}`);
            // Attempt cleanup again on error during setup
            await cleanupTrack(trackLeft);
            await cleanupTrack(trackRight);
            disableControlsOnError("Worklet Instantiation Failed");
        }
    }

        /** Sets up panner, worklet node, and sends audio data for a single track */
    async function setupTrackAudioNodes(trackState, panValue) {

        // *** ADD THIS LOGGING BLOCK ***
        console.log(`APP2 DEBUG: Entering setupTrackAudioNodes for ${trackState.name}`);
        console.log(`  - audioCtx exists: ${!!audioCtx}`);
        console.log(`  - trackState.audioBuffer exists: ${!!trackState.audioBuffer}`);
        if (trackState.audioBuffer) {
             console.log(`    - audioBuffer duration: ${trackState.audioBuffer.duration}`);
        }
        console.log(`  - wasmBinary exists: ${!!wasmBinary}`);
        console.log(`  - loaderScriptText exists: ${!!loaderScriptText}`);
        console.log(`  - POC_CONSTANTS exists: ${!!POC_CONSTANTS}`); // Check the object itself
        if (typeof POC_CONSTANTS !== 'undefined') {
             console.log(`    - POC_CONSTANTS.PROCESSOR_NAME: ${POC_CONSTANTS.PROCESSOR_NAME}`); // Check a property
        }
        // *** END OF LOGGING BLOCK ***

        // Check using hardcoded constant object
        if (!audioCtx || !trackState.audioBuffer || !wasmBinary || !loaderScriptText || !POC_CONSTANTS) {
            // Log which specific prerequisite failed *if* the check fails
            let missing = [];
            if (!audioCtx) missing.push("audioCtx");
            if (!trackState.audioBuffer) missing.push("trackState.audioBuffer");
            if (!wasmBinary) missing.push("wasmBinary");
            if (!loaderScriptText) missing.push("loaderScriptText");
            if (!POC_CONSTANTS) missing.push("POC_CONSTANTS");
             console.error(`APP2 DEBUG: Prerequisite check failed! Missing: ${missing.join(', ')}`); // Log specific failure reason

            throw new Error(`Track ${trackState.name}: Prerequisites missing for node setup.`);
        }
        logStatus(`Track ${trackState.name}: Setting up audio nodes (Pan: ${panValue})...`);

        // ... (rest of the function remains the same) ...

        // 1. Create Panner
        trackState.pannerNode = audioCtx.createStereoPanner();
        trackState.pannerNode.pan.value = panValue;
        trackState.pannerNode.connect(audioCtx.destination);
        logStatus(`Track ${trackState.name}: PannerNode created and connected.`);

        // 2. Create Worklet Node
        const processorOpts = {
            sampleRate: audioCtx.sampleRate,
            numberOfChannels: trackState.audioBuffer.numberOfChannels,
            wasmBinary: wasmBinary.slice(0), // Transfer copy
            loaderScriptText: loaderScriptText,
            trackId: trackState.trackId
        };
         logStatus(`Track ${trackState.name}: Creating AudioWorkletNode ('${POC_CONSTANTS.PROCESSOR_NAME}') with options:`, processorOpts);

        try {
            // Use hardcoded processor name
            trackState.workletNode = new AudioWorkletNode(audioCtx, POC_CONSTANTS.PROCESSOR_NAME, {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [trackState.audioBuffer.numberOfChannels],
                processorOptions: processorOpts
            });
        } catch (nodeError) {
            throw new Error(`Track ${trackState.name}: Failed to create AudioWorkletNode: ${nodeError.message}`);
        }

        // 3. Setup Message Handling
        if (trackState.workletNode.port) {
            trackState.workletNode.port.onmessage = (event) => handleWorkletMessage(event, trackState);
        } else {
             logError(`Track ${trackState.name}: WorkletNode port not available! Cannot set message handler.`);
        }
        trackState.workletNode.onprocessorerror = (event) => {
             logError(`Track ${trackState.name}: CRITICAL PROCESSOR ERROR: ${event}`);
             disableControlsOnError(`Worklet ${trackState.name} Crashed`);
             cleanupTrack(trackState);
        };
        logStatus(`Track ${trackState.name}: WorkletNode created. Port listener attached.`);

        // 4. Connect Worklet to Panner
        trackState.workletNode.connect(trackState.pannerNode);
        logStatus(`Track ${trackState.name}: WorkletNode connected to PannerNode.`);

        // 5. Send Audio Data
        const channelData = [];
        const transferListAudio = [];
        for (let i = 0; i < trackState.audioBuffer.numberOfChannels; i++) {
            const dataArray = trackState.audioBuffer.getChannelData(i);
            const bufferCopy = dataArray.buffer.slice(dataArray.byteOffset, dataArray.byteOffset + dataArray.byteLength);
            channelData.push(bufferCopy);
            transferListAudio.push(bufferCopy);
        }
        logStatus(`Track ${trackState.name}: Sending audio data (${channelData.length} channels) to worklet...`);
        postWorkletMessage(trackState.workletNode, { type: 'load-audio', channelData: channelData }, transferListAudio);
        logStatus(`Track ${trackState.name}: Audio data sent.`);
    }

    /** Handles messages received from a specific worklet */
    function handleWorkletMessage(event, trackState) {
        const data = event.data;
         if (data.trackId !== trackState.trackId) {
             console.warn(`Mismatched trackId in message! Expected ${trackState.trackId}, got ${data.trackId}`, data);
         }
        // console.log(`APP2: Received message from Worklet ${trackState.trackId}:`, data); // Noisy

        switch(data.type) {
            case 'status':
                logStatus(`Worklet ${trackState.trackId}: ${data.message}`);
                if (data.message === 'processor-ready') {
                    trackState.isReady = true;
                    enableControlsIfReady(); // Check if BOTH are ready
                } else if (data.message === 'Playback ended') {
                     logStatus(`Worklet ${trackState.trackId} reported playback ended.`);
                     // Could potentially set a flag here trackState.hasEnded = true
                     // Then check if both have ended to update global state/UI if needed
                }
                break;
            case 'error':
                logError(`Worklet ${trackState.trackId} Error: ${data.message}`);
                trackState.isReady = false;
                enableControlsIfReady();
                break;
            case 'playback-state':
                 logStatus(`Worklet ${trackState.trackId} confirmed playback state: ${data.isPlaying}`);
                // We don't strictly need this confirmation for the POC UI update logic
                break;
            case 'time-update':
                // Ignore for POC display
                break;
            default:
                console.warn(`APP2: Unhandled message type ${data.type} from worklet ${trackState.trackId}`);
        }
    }

     /** Safely posts message to a worklet node */
     function postWorkletMessage(workletNode, message, transferList = []) {
        if (workletNode && workletNode.port) {
            try {
                workletNode.port.postMessage(message, transferList);
            } catch (error) {
                logError(`APP2: Error posting message (${message.type}) to worklet: ${error.message}`);
                const track = workletNode === trackLeft.workletNode ? trackLeft : trackRight;
                if(track) {
                    track.isReady = false;
                    enableControlsIfReady();
                }
            }
        } else {
            // Don't warn if node is null during initial setup or after cleanup
            // Only warn if we expected it to be ready
            const track = workletNode === trackLeft.workletNode ? trackLeft : trackRight;
            if(track?.isReady || (track?.audioBuffer && workletModuleLoaded) ) { // Warn if track was loaded or ready
                 logWarn(`APP2: Cannot post message (${message.type}): Worklet node or port is missing/invalid for track ${track?.name}.`);
            }
        }
    }

    /** Handles play/pause button click */
    function handlePlayPause() {
        if (!trackLeft.isReady || !trackRight.isReady || !audioCtx) {
            logWarn("Cannot toggle play/pause: Tracks not ready or AudioContext missing.");
            return;
        }
        if (audioCtx.state === 'suspended') {
             audioCtx.resume().then(() => {
                  logStatus("Context resumed on play/pause click.");
                  togglePlaybackState();
             }).catch(e => logError(`Failed to resume context on play/pause: ${e.message}`));
        } else {
             togglePlaybackState();
        }
    }

    /** Toggles the playback state and sends messages */
    function togglePlaybackState() {
         isPlaying = !isPlaying;
         const messageType = isPlaying ? 'play' : 'pause';
         logStatus(`Sending '${messageType}' command to both worklets.`);
         postWorkletMessage(trackLeft.workletNode, { type: messageType });
         postWorkletMessage(trackRight.workletNode, { type: messageType });
         updatePlayButtonText();
    }

    /** Handles speed slider changes */
    function handleSpeedChange() {
        currentSpeed = parseFloat(speedSlider.value);
        speedValue.textContent = `${currentSpeed.toFixed(2)}x`;
        // Only send if tracks are actually ready to process it
        if (trackLeft.isReady && trackRight.isReady) {
            logStatus(`Sending 'set-speed' (${currentSpeed.toFixed(2)}) command to both worklets.`);
            postWorkletMessage(trackLeft.workletNode, { type: 'set-speed', value: currentSpeed });
            postWorkletMessage(trackRight.workletNode, { type: 'set-speed', value: currentSpeed });
        } else {
            logStatus(`Speed changed to ${currentSpeed.toFixed(2)}x, but not sending command (tracks not ready).`);
        }
    }

    /** Updates button text based on isPlaying state */
    function updatePlayButtonText() {
        playPauseButton.textContent = isPlaying ? 'Pause' : 'Play';
    }

    /** Enables controls only if both tracks are ready */
    function enableControlsIfReady() {
        if (trackLeft.isReady && trackRight.isReady) {
            logStatus("Both tracks ready. Enabling controls.");
            playPauseButton.disabled = false;
            speedSlider.disabled = false;
            updatePlayButtonText();
        } else {
            logStatus(`Controls remain disabled. Left Ready: ${trackLeft.isReady}, Right Ready: ${trackRight.isReady}`);
            disableControlsDuringLoad(); // Keep controls disabled if not fully ready
        }
    }

    /** Disables controls during loading/instantiation */
    function disableControlsDuringLoad() {
        playPauseButton.disabled = true;
        playPauseButton.textContent = 'Loading...';
        speedSlider.disabled = true;
    }


    /** Disables controls and logs error on fatal issue */
    function disableControlsOnError(reason) {
        logError(`Disabling controls due to: ${reason}`);
        playPauseButton.disabled = true;
        playPauseButton.textContent = reason;
        speedSlider.disabled = true;
        fileInputLeft.disabled = true;
        fileInputRight.disabled = true;
    }

    /** Cleans up resources for a single track */
    async function cleanupTrack(trackState) {
        if (!trackState) return;
        logStatus(`Cleaning up track ${trackState.name}...`);
        trackState.isReady = false; // Mark immediately as not ready
        enableControlsIfReady(); // Update UI based on potentially only one track remaining

        const nodeToClean = trackState.workletNode; // Store ref before nulling
        const pannerToClean = trackState.pannerNode;

        // Nullify references first
        trackState.workletNode = null;
        trackState.pannerNode = null;
        trackState.audioBuffer = null;
        trackState.file = null;
        if(trackState.trackId === trackLeft.trackId) fileNameLeft.textContent = 'None';
        else fileNameRight.textContent = 'None';

        // Now attempt cleanup on the stored references
        if (nodeToClean) {
            logStatus(`Track ${trackState.name}: Sending cleanup message to worklet...`);
            postWorkletMessage(nodeToClean, { type: 'cleanup' }); // Use stored ref
            await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for message
            try {
                 if(nodeToClean.port) nodeToClean.port.onmessage = null;
                 nodeToClean.onprocessorerror = null;
                 nodeToClean.disconnect();
                 logStatus(`Track ${trackState.name}: WorkletNode disconnected.`);
            } catch(e) { logWarn(`Track ${trackState.name}: Error disconnecting worklet node: ${e.message}`); }
        }
        if (pannerToClean) {
            try {
                pannerToClean.disconnect();
                logStatus(`Track ${trackState.name}: PannerNode disconnected.`);
            } catch(e) { logWarn(`Track ${trackState.name}: Error disconnecting panner node: ${e.message}`); }
        }

        logStatus(`Track ${trackState.name} cleanup finished.`);
    }


    // === Utility Functions ===
    /** Logs status to the status div and console */
    function logStatus(message, data) {
        console.log(`APP2: ${message}`, data || '');
        if (statusDiv) {
             const lines = statusDiv.textContent.split('\n');
             const limitedLines = lines.slice(0, 15).join('\n');
             statusDiv.textContent = `${new Date().toLocaleTimeString()}: ${message}\n${limitedLines}`;
        }
    }
    /** Logs error to the status div and console */
    function logError(message, data) {
        console.error(`APP2 ERROR: ${message}`, data || '');
        if (statusDiv) {
            const lines = statusDiv.textContent.split('\n');
            const limitedLines = lines.slice(0, 15).join('\n');
            statusDiv.textContent = `${new Date().toLocaleTimeString()}: ERROR: ${message}\n${limitedLines}`;
            statusDiv.style.color = 'red';
        }
    }
     /** Logs warning to console */
     function logWarn(message, data) {
         console.warn(`APP2 WARN: ${message}`, data || '');
     }


    // === Start Initialization ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); // End of IIFE
// /vibe-player/app2.js