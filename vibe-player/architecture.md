<!-- /vibe-player/architecture.md -->
# Vibe Player Architecture

## 1. Overview

*   **Purpose:** Browser-based audio player focused on playback speed/pitch manipulation, voice activity detection (VAD) visualization, and waveform/spectrogram display. Designed for static file deployment. Supports loading and concurrent playback/processing of up to two audio tracks.
*   **Core Philosophy:** Prioritize simplicity and minimal dependencies by using Vanilla JS, HTML, and CSS. Leverage WebAssembly (WASM) via standardized Web APIs (`AudioWorklet`, `ONNX Runtime Web`) for computationally intensive tasks. A **single** `AudioWorklet` instance is used for audio processing (time/pitch shifting via Rubberband WASM) to avoid WASM memory conflicts observed with multiple instances, while managing state for both tracks internally. The application follows an event-driven interaction flow managed by a central controller (`app.js`).

## 2. Key Technologies

*   **Frontend:** HTML5, CSS3 (98.css for styling + custom `styles.css`), Vanilla JavaScript (ES6 Modules via IIFE pattern on `AudioApp` namespace)
*   **Audio Engine:** Web Audio API (`AudioContext`, `GainNode`, `AudioWorkletNode`, `OfflineAudioContext` for resampling)
*   **Time/Pitch Shifting:** Rubberband WASM library (via `js/player/rubberbandProcessor.js` AudioWorklet).
    *   **Loader (`lib/rubberband-loader.js`):** ***Note:*** *This is a heavily modified version of the standard Emscripten loader, adapted specifically for use within the AudioWorklet context and to handle WASM instantiation via a hook.*
    *   **Temporal Accuracy:** ***Note:*** *Rubberband prioritizes audio quality over strict temporal accuracy. The number of output frames generated may not perfectly match the requested time ratio for a given input block, and its internal time/latency reporting can drift relative to the Web Audio clock. Therefore, its time reports are not used directly for precise UI indicator synchronization.*
*   **VAD:** Silero VAD model (`model/silero_vad.onnx`) executed via ONNX Runtime Web (WASM backend in `lib/`)
*   **Visualizations:** HTML Canvas API (2D Context), FFT.js library (`lib/fft.js`).
    *   **FFT Library (`lib/fft.js`):** ***Note:*** *This is based on indutny/fft.js but contains modifications made during initial development to ensure compatibility or functionality.*

## 3. Code Structure (`js/` directory)

*   **`app.js` (Controller):** Initializes modules, orchestrates loading (alternating tracks)/VAD/playback flow for up to two tracks, handles events, manages core state (buffers, VAD results, flags per track), manages main-thread time updates using `AudioContext.currentTime`. Handles temporary mute keybinds.
*   **`constants.js`:** Defines shared constants (paths, parameters, colors, etc.).
*   **`utils.js`:** Contains shared utility functions (e.g., `formatTime`, `yieldToMainThread`, `hannWindow`, `viridisColor`, `debounce`).
*   **`uiManager.js` (View/UI Logic):** Handles all direct DOM manipulation, UI event listeners, and dispatches UI events. Manages VAD progress bar UI. ***Note: Currently only displays information/visuals for Track 0.***
*   **`js/player/`:**
    *   **`audioEngine.js` (Audio Backend):** Manages Web Audio API, **single `AudioWorkletNode` lifecycle/communication**, audio decoding, track-specific gain nodes (for mute), master gain, and resampling capability. Relays messages to/from the worklet.
    *   **`rubberbandProcessor.js` (AudioWorklet):** Runs in **one** worklet thread. Interfaces with Rubberband WASM. **Crucially, manages multiple internal Rubberband state instances (`_rubberband_new`)**, one for each loaded audio track (up to 2). Handles processing requests for each active track, mixes their output, and performs manual memory management (`_malloc`/`_free`) for WASM buffers. Communicates via messages with `audioEngine.js`. Reports its consumed source time per track (acknowledging potential inaccuracies).
*   **`js/vad/`:**
    *   **`sileroWrapper.js` (VAD ONNX Interface):** Wraps ONNX Runtime session for the Silero VAD model. Handles inference calls and state tensors.
    *   **`sileroProcessor.js` (VAD Frame Logic):** Iterates audio frames, calls `sileroWrapper`, calculates regions based on probabilities/thresholds, yields to main thread, reports progress.
    *   **`vadAnalyzer.js` (VAD State Manager):** Bridges `app.js` and VAD processing. Holds VAD results/thresholds *per track*. Initiates analysis and recalculation.
*   **`js/visualizers/`:**
    *   **`waveformVisualizer.js`:** Computes and draws the waveform display, handles highlighting, resizing, progress indicator, and click-to-seek. ***Note: Currently only displays Track 0.***
    *   **`spectrogramVisualizer.js`:** Computes (using FFT.js) and draws the spectrogram display, manages caching, resizing, progress indicator, click-to-seek, and loading spinner. ***Note: Currently only displays Track 0.***

*(For detailed responsibilities, see previous full generation)*

## 4. Interaction Flow & State Management

*   **Loading Sequence:**
    1.  `UI (Choose File)` -> `uiManager` dispatches `audioapp:fileSelected`.
    2.  `app.js (handleFileSelected)`: Determines `targetTrackIndex` (alternating 0/1), pauses playback if active, resets state for `targetTrackIndex`, updates UI (`setFileInfo`), calls `audioEngine.loadAndProcessTrack(file, targetTrackIndex)`. Toggles `nextTrackIndexToLoad`.
    3.  `audioEngine`: Decodes audio, dispatches `audioapp:audioLoaded` (with `trackIndex`). Initializes the **single** worklet node and loads WASM/loader script **only if not already done**. Sends `load` message with audio data and `trackIndex` to the worklet.
    4.  `app.js (handleAudioLoaded)`: Stores `audioBuffer[trackIndex]`. If `trackIndex === 0`, updates time/seek UI, calls `visualizer.computeAndDrawVisuals([])` (gray waveform + spectrogram), hides main spinner. Triggers `runVadInBackground(audioBuffer, trackIndex)`.
    5.  `audioEngine`: When worklet script/WASM loading completes (once), dispatches `audioapp:workletReady`.
    6.  `app.js (handleWorkletReady)`: Sets `workletPlaybackReady=true`, enables playback controls/seek bar *only if all active tracks have also sent their 'load' confirmation or equivalent readiness signal* (logic adjusted based on single worklet). **Playback is now possible.**
    7.  `app.js (runVadInBackground)` (Running concurrently per track):
        *   Initializes VAD model if needed (`sileroWrapper.create`).
        *   If `trackIndex === 0`, shows VAD progress bar (`uiManager`).
        *   Calls `audioEngine.resampleTo16kMono`.
        *   Calls `vadAnalyzer.analyze` (which calls `sileroProcessor.analyzeAudio` with progress callback).
        *   `sileroProcessor`: Iterates frames, calls `sileroWrapper.process`, yields, calls progress callback -> `uiManager.updateVadProgress` (only if track 0).
        *   On VAD completion/error: Updates VAD results `vadResults[trackIndex]`, if `trackIndex === 0` updates VAD slider UI (`uiManager`), redraws waveform highlights (`visualizer.redrawWaveformHighlight`), updates progress bar.
*   **Playback Control:** `UI (Button Click)` -> `uiManager` dispatches event -> `app.js (handlePlayPause/Jump/Seek)` -> `app.js` potentially pauses playback first (for seek/jump) -> `audioEngine` (sends command message to single worklet) -> `rubberbandProcessor` (applies command to internal state(s)). Status feedback: `rubberbandProcessor` (sends overall state message) -> `audioEngine` (dispatches event) -> `app.js (handlePlaybackStateChange)` -> `uiManager` (updates button).
*   **Parameter Control (Speed/Pitch/Gain):** `UI (Slider Input)` -> `uiManager` dispatches event -> `app.js (handleSpeed/Pitch/GainChange)` -> `audioEngine`. Gain applied directly via `GainNode`. Speed/Pitch command message sent to the single `rubberbandProcessor`, which applies it to *all* active internal track states.
*   **VAD Threshold Tuning:** `UI (Slider Input)` -> `uiManager` dispatches `audioapp:thresholdChanged` -> `app.js (handleThresholdChange)` (checks if VAD done for track 0) -> `vadAnalyzer.handleThresholdUpdate` (for track 0 results) -> `sileroProcessor.recalculateSpeechRegions` -> `app.js` receives new regions -> `visualizer.redrawWaveformHighlight` & `uiManager.setSpeechRegionsText`.
*   **State:** Core state (`audioBuffers`, `vadResults`, playback flags, etc.) managed centrally in `app.js` using arrays indexed by track. `audioEngine` manages the single worklet communication state. `vadAnalyzer` manages VAD results/thresholds per track. `uiManager` reflects state in the DOM (currently mostly Track 0). `rubberbandProcessor` manages **multiple internal** WASM states and buffers.
*   **Key Points:** Loading alternates between tracks 0 and 1. UI primarily reflects track 0. One worklet manages processing for both tracks. Seek/Jump pauses playback first.
*   **Time Synchronization:** UI progress indicator is driven by `app.js` using main-thread `AudioContext.currentTime` calculations, compensated for speed changes. Explicit seeks/jumps pause playback and force engine synchronization. Speed slider adjustments trigger debounced sync.

## 5. Design Decisions, Constraints & Tradeoffs

*   **Static Hosting:** Simplifies deployment, no backend required. Limits features requiring server interaction. (Constraint C1)
*   **Vanilla JS:** Reduces dependency footprint, avoids framework overhead/learning curve. Requires manual implementation of patterns (modules, state management). (Constraint C2)
*   **IIFE Module Pattern:** Provides simple namespacing (`AudioApp`) without requiring a build step. Relies on careful script loading order.
*   **Custom Events (`audioapp:*`):** Decouples UI Manager and Audio Engine from the main App controller. (Constraint C3)
*   **Single AudioWorklet for Rubberband:**
    *   **Motivation:** Essential for performing complex audio processing off the main thread.
    *   **Initial Problem:** Attempting to use multiple `AudioWorkletNode` instances (one per track) each running the same `rubberbandProcessor.js` script resulted in crashes (`RuntimeError: table index is out of bounds`). Debugging revealed that both instances were being allocated overlapping or identical memory regions by the Emscripten runtime's `_malloc` within the shared WASM memory heap, leading to state corruption.
    *   **Current Architecture:** Uses only **one** `AudioWorkletNode` instance running `rubberbandProcessor.js`. This single processor script is now responsible for:
        *   Managing **multiple internal** Rubberband state instances (via separate `_rubberband_new` calls).
        *   Handling track-specific state (audio data, playback position, buffer pointers).
        *   Performing **manual memory management** (`_malloc`/`_free`) for WASM heap buffers required by each internal Rubberband instance.
        *   Processing audio independently for each active track during its `process()` loop.
        *   **Mixing** the processed output from active tracks into the single output buffer provided to the `AudioWorkletProcessor`.
    *   **Tradeoffs:**
        *   Solves the memory corruption/crash issue reliably.
        *   Increases the complexity of `rubberbandProcessor.js`.
        *   **Introduces a significant CPU scaling limitation:** Because all processing for *all* tracks occurs within the single worklet thread's tight time budget (`process` loop), the number of concurrent tracks is severely limited by CPU power (likely 2 stereo tracks max on typical hardware).
*   **ONNX Runtime Web for VAD:** Enables use of standard ML models (like Silero VAD) directly in the browser via WASM. Avoids needing a dedicated VAD implementation.
*   **Main-Thread VAD (Async):** VAD processing (`sileroProcessor`) runs on the main thread but uses `async/await` and `yieldToMainThread` (`setTimeout(0)`) to yield periodically.
    *   **Tradeoff:** Simpler implementation for MVP compared to setting up a dedicated Web Worker for VAD.
    *   **Downside:** Can still cause minor UI sluggishness. Susceptible to browser throttling.
*   **VAD Progress Updates:** Uses a callback passed down to `sileroProcessor` which calls `uiManager.updateVadProgress` (currently only for Track 0 UI).
*   **JSDoc:** Chosen standard for JavaScript documentation. (Constraint C7)
*   **Manual Testing:** Adopted for rapid iteration. Lacks automated checks. (Constraint C5)
*   **Visualizer Computation:** Waveform data calculated per-pixel. Spectrogram data computed entirely upfront before async drawing. ***(Visualizers currently only display Track 0).***
*   **File Structure:** Modular approach. (Constraint C6)

## 6. Known Issues & Development Log

*   **Formant Shifting (Non-Functional):** Currently disabled/commented out. No audible effect observed during testing. Issue might be in WASM build, library interaction, or parameter understanding.
*   **VAD Performance & Backgrounding:** Runs on main thread; may cause minor UI jank and pauses when tab unfocused.
*   **Spectrogram Latency:** Initial computation delay before drawing begins.
*   **Rubberband Engine Choice:** `EngineFiner` caused stuttering; using default (faster) engine.
*   **Playback Indicator Drift (Mitigated):** Reliance on main-thread calculation and sync-on-pause/speed-change reduces drift, but minor visual discrepancies *during* rapid parameter changes might still occur.
*   **CPU Scaling Limitation:** The single AudioWorklet architecture limits the number of concurrent tracks that can be processed in real-time (likely 2 stereo tracks max) due to CPU constraints within the worklet thread. Exceeding this limit will likely cause audio glitches or crashes.
*   **UI Multi-Track Support:** UI currently only displays visuals, VAD info, and file info for Track 0. Mute control is only via temporary keyboard shortcuts.

<!-- /vibe-player/architecture.md -->
