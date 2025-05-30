<!-- /vibe-player/architecture.md -->
# Vibe Player Architecture

## 1. Overview

*   **Purpose:** Browser-based audio player focused on playback speed/pitch manipulation, voice activity detection (VAD) visualization, and waveform/spectrogram display. Now supports loading **two tracks** (Left and Right) for simultaneous playback with offset capabilities. Designed for static file deployment.
*   **Core Philosophy:** Prioritize simplicity and minimal dependencies using Vanilla JS, HTML, and CSS. Leverage WebAssembly (WASM) via standardized Web APIs (`AudioWorklet`, `ONNX Runtime Web`) for intensive tasks. Application follows an event-driven flow managed by `app.js`. Multi-track features are introduced progressively in the UI.

## 2. Key Technologies

*   **Frontend:** HTML5, CSS3 (98.css + `styles.css`), Vanilla JavaScript (ES6 Modules via IIFE pattern on `AudioApp` namespace)
*   **Audio Engine:** Web Audio API (`AudioContext`, `GainNode`, `StereoPannerNode`, `AudioWorkletNode`, `OfflineAudioContext` for VAD resampling)
*   **Time/Pitch Shifting:** Rubberband WASM library (via `js/player/rubberbandProcessor.js` AudioWorklet). **One independent worklet instance per track.**
    *   **Loader (`lib/rubberband-loader.js`):** Modified Emscripten loader for AudioWorklet context.
    *   **WASM Memory:** POC testing indicates that separate `AudioWorkletNode` instances using the same `addModule` script *do* maintain independent memory spaces, alleviating initial concerns about `malloc` conflicts between Rubberband instances.
    *   **Temporal Accuracy:** Rubberband's potential timing drift remains. UI timing relies on main-thread `AudioContext.currentTime`. Periodic re-sync via seek commands (on Play/Seek) mitigates drift.
*   **VAD:** Silero VAD model (`model/silero_vad.onnx`) via ONNX Runtime Web (`lib/`). **Currently applied only to the Left track.**
*   **Visualizations:** HTML Canvas API (2D Context), FFT.js library (`lib/fft.js`). Visualizer modules (`waveformVisualizer.js`, `spectrogramVisualizer.js`) now use a **factory pattern (`createInstance`)** to manage separate instances for Left and Right tracks.
*   **Gain Node Quirk:** Browsers may handle `GainNode.gain.setTargetAtTime(0.0, ...)` inconsistently, potentially causing volume jumps. Workaround implemented in `audioEngine.js` targets a near-zero value (`1e-7`) instead of exact zero for smooth fades to silence.

## 3. Code Structure (`js/` directory)

*   **`app.js` (Controller):** Initializes modules, coordinates with `stateManager.js` for managing application state (like track data, playback status), orchestrates loading/VAD/playback flow for **multiple tracks**, handles events, calculates global time and track offsets, manages UI state via `uiManager`, drives visualizer updates.
*   **`constants.js`:** Shared constants.
*   **`utils.js`:** Shared utility functions.
*   **`uiManager.js` (View/UI Logic):** Handles all DOM manipulation, UI event listeners. Manages **progressive display** of Left/Right track elements, updates track-specific controls, handles link/swap/remove button states, parses/formats delay input, updates drift display.
*   **`stateManager.js` (State Logic):** Centralizes the core application state. Manages the `tracksData` array (holding `TrackState` objects with buffer, file, parameters, VAD results, etc., per track), UI channel assignments (`leftChannelTrackIndex`, `rightChannelTrackIndex`), `isMultiChannelModeActive` status, global playback parameters (state, speed, time references), VAD model readiness, and parameter linking states. Provides getters and setters for `app.js` to interact with the application state in a controlled manner.
*   **`js/player/`:**
    *   **`audioEngine.js` (Audio Backend):** Manages Web Audio API context, **master gain**. Creates/manages audio graph nodes **per track** (`Worklet -> Panner -> VolumeGain -> MuteGain -> MasterGain`) using an internal Map keyed by numeric `trackIndex`. Handles `AudioWorkletNode` lifecycle/communication per track. Provides track-specific control methods (`setVolume`, `setPan`, `setTrackSpeed`, `playTrack`, `seekTrack`, etc.) and adapted global methods (`togglePlayPause`, `seekAllTracks`).
    *   **`rubberbandProcessor.js` (AudioWorklet):** Runs in worklet thread. Interfaces with Rubberband WASM. Accepts `trackId` for logging/messaging. **One instance runs per loaded audio track.**
*   **`js/vad/`:**
    *   **`sileroWrapper.js` (VAD ONNX Interface):** Wraps ONNX Runtime session for the Silero VAD model. Handles inference calls and state tensors.
    *   **`sileroProcessor.js` (VAD Frame Logic):** Iterates audio frames, calls `sileroWrapper`, calculates regions based on probabilities/thresholds, yields to main thread, reports progress.
    *   **`vadAnalyzer.js` (VAD State Manager):** Bridges `app.js` and VAD processing. Holds VAD results/thresholds. Initiates analysis and recalculation.
*   **`js/visualizers/`:**
    *   **`waveformVisualizer.js`:** **Refactored** to export a `createInstance` factory. Each instance manages its own canvas/indicator elements (passed during creation) and state. Draws waveform, handles highlighting (Left only), resizing. `updateProgressIndicator` now handles offset logic for pre-roll/active/post-roll states.
    *   **`spectrogramVisualizer.js`:** **Refactored** to export a `createInstance` factory. Each instance manages its own elements, state, and offscreen cache. Computes/draws spectrogram. `updateProgressIndicator` handles offset logic.

## 4. Interaction Flow & State Management

*   **Loading Sequence (Progressive):**
    1.  App initializes in single-track mode. Left visualizer instances created.
    2.  `UI (Load Left)` -> `uiManager` (`fileSelected` event w/ `trackId: 'left'`) -> `app.js (handleFileSelected)`: Resets global state, resets UI, populates `tracks[0]`, calls `audioEngine.setupTrack('track_left', file)`.
    3.  `audioEngine`: Decodes audio, creates Left track nodes (Worklet, Panner, Volume, Mute, connected to MasterGain), sends data to worklet, dispatches `audioLoaded` (`trackId: 'track_left'`).
    4.  `app.js (handleAudioLoaded)`: Stores `tracks[0].audioBuffer`, updates Left track UI, calls `waveformVizLeft.computeAndDraw*`, `specVizLeft.computeAndDraw*`, starts VAD for Left track.
    5.  `audioEngine`: Worklet instance for Left track signals ready -> dispatches `workletReady` (`trackId: 'track_left'`).
    6.  `app.js (handleWorkletReady)`: Sets `tracks[0].isReady`, applies initial parameters (pan, volume, speed, pitch) via `audioEngine`, enables VAD controls (if VAD done), calls **`uiManager.enableRightTrackLoadButton(true)`**. Global controls remain disabled.
    7.  `UI (Load Right)` -> `uiManager` (`fileSelected` event w/ `trackId: 'right'`) -> `app.js (handleFileSelected)`: Populates `tracks[1]`, sets `multiTrackModeActive=true`, calls `uiManager.showMultiTrackUI(true)`, calls `audioEngine.setupTrack('track_right', file)`.
    8.  `audioEngine`: Decodes Right audio, creates Right track nodes, sends data, dispatches `audioLoaded` (`trackId: 'track_right'`).
    9.  `app.js (handleAudioLoaded)`: Stores `tracks[1].audioBuffer`. (Visuals drawn after worklet ready).
    10. `audioEngine`: Worklet instance for Right track signals ready -> dispatches `workletReady` (`trackId: 'track_right'`).
    11. `app.js (handleWorkletReady)`: Sets `tracks[1].isReady`, **instantiates Right visualizer instances** (`waveformVizRight`, `specVizRight`), applies initial parameters via `audioEngine`, calls `drawTrackVisuals(tracks[1])`, enables Swap/Remove buttons. Calls `areAllActiveTracksReady()`, which now returns true -> calls **`uiManager.enablePlaybackControls(true)`, `uiManager.enableSeekBar(true)`**.
*   **Playback Control:** `UI (Play)` -> `app.js (handlePlayPause)` -> Calculates global time, calculates target seek time for *each ready track* respecting offset -> `audioEngine.seekAllTracks(Map<trackId, seekTime>)` -> `audioEngine` sends individual `seek` messages -> `app.js` calls `audioEngine.togglePlayPause(true)` -> `audioEngine` sends `play` message to each ready track worklet. Pause skips seek and sends `pause`.
*   **Parameter Control (Linked Speed Example):** `UI (Speed Slider Left)` -> `uiManager` (`speedChanged_left` event) -> `app.js (handleSpeedChange)` -> Checks `speedLinked` flag -> Updates `currentGlobalSpeed` -> Updates `tracks[0].parameters.speed` & `tracks[1].parameters.speed` -> Calls `uiManager` to update *both* slider positions -> Calls `audioEngine.setTrackSpeed('track_left', newSpeed)` & `audioEngine.setTrackSpeed('track_right', newSpeed)`. Calls debounced sync. (Pitch similar, Volume/Delay target specific track).
*   **Offset Application:** Managed entirely within `app.js` when calculating seek times for `handlePlayPause`, `handleJump`, `handleSeek`. Formula: `trackSeekTime = Math.max(0, globalTargetTime - track.parameters.offsetSeconds)`.
*   **State:** **`stateManager.js`** is the central module for application state. It manages the `tracksData` array (holding `TrackState` objects with buffer, file, parameters, VAD results, etc., per track), `leftChannelTrackIndex`, `rightChannelTrackIndex`, `isMultiChannelModeActive` status, global playback parameters (state, speed, time references), VAD model readiness, and parameter linking states. `app.js` acts as the primary controller that utilizes `stateManager.js` to read and modify this state. `audioEngine.js` manages its own map of audio nodes (`trackNodesMap`) keyed by numeric `trackIndex`. Visualizer instances manage their own internal UI-related state (canvas refs, cached data).

## 5. Design Decisions, Constraints & Tradeoffs

*   **Static Hosting (C1), Vanilla JS (C2), Namespace/Events (C3), Error Handling (C4), Manual Testing (C5), File Structure (C6), JSDoc (C7):** Constraints remain largely the same.
*   **Progressive Multi-Track UI:** UI starts simple, reveals complexity only when the second track is added. Keeps initial experience clean. (New Design)
*   **Independent Worklet Instances:** One Rubberband worklet per track. POC confirmed memory isolation seems sufficient. (New Design / Confirmation)
*   **Audio Graph per Track:** `Worklet -> Panner -> VolumeGain -> MuteGain -> MasterGain`. Ensures independent panning, volume, mute control before mixing. (New Design)
*   **Visualizer Factory Pattern:** `waveformVisualizer` and `spectrogramVisualizer` refactored to return `createInstance` functions, allowing independent instances with separate state (element refs, cache) for Left and Right tracks. (New Design / Refactor)
*   **Offset Handling via Seek:** Using `app.js` logic and `seek` commands to manage track start offsets instead of `DelayNode`. More flexible, less memory intensive, better control. (New Design)
*   **Linked Speed (Default):** Speed/Pitch controls default to linked for simpler synchronization logic and UI. Independent control deferred. (New Design Choice)
*   **Main-Thread Time Sync:** Still relies on `AudioContext.currentTime` and `requestAnimationFrame` in `app.js` for UI updates and the primary time reference. Periodic seeks (on Play/Seek) correct worklet timing drift relative to this reference. (Constraint/Design Adaptation)
*   **Visualizer Offset Display:** Uses progress indicator styling (inactive/active states) and positioning (start/middle/end) to show offset/duration relationship, avoids complex graphical waveform shifting for now. (New Design)

(old decisions, retained by human)

*   **AudioWorklet for Rubberband:** Essential for performing complex audio processing (time-stretching) off the main thread without blocking UI or audio playback. Adds architectural complexity for message passing and state synchronization between main thread (`audioEngine`) and worklet thread (`rubberbandProcessor`). Required a **customized WASM loader** (`lib/rubberband-loader.js`).
    *   **Alternative Considered (SoundTouchJS):** SoundTouchJS was evaluated, but the audio quality, especially at slower speeds, was significantly worse than Rubberband. Rubberband's computational cost was deemed acceptable for the quality improvement. Native Web Audio playback rate changes were also too choppy at low speeds.
    *   **Rubberband Flags:** The primary goal for flag tuning was improving voice quality. The current flag set (`ProcessRealTime`, `PitchHighQuality`, `PhaseIndependent`, `TransientsCrisp`) represents a balance. `EngineFiner` was tested but resulted in stuttering playback, likely due to exceeding CPU limits on the test machine; the default (faster) engine is currently used.
    *   **Rubberband Temporal Inaccuracy:** ***(RESTORED)*** Rubberband prioritizes audio quality, leading to potential drift in its output duration and time reporting relative to Web Audio clock. This necessitates **main-thread time calculation** for the UI indicator and periodic seek-based synchronization. Analogy: Cannot use a rubber band as a precise ruler.
*   **ONNX Runtime Web for VAD:** Enables use of standard ML models (like Silero VAD) directly in the browser via WASM. Avoids needing a dedicated VAD implementation.
*   **Visualizer Computation:** Waveform data calculated per-pixel. Spectrogram data computed entirely upfront (using **modified `lib/fft.js`**) before being drawn asynchronously chunk-by-chunk.
    *   **Tradeoff:** Faster waveform display. Spectrogram has an initial computation delay before drawing starts, but avoids the complexity of streaming FFT computation. Async drawing prevents blocking during render.

## 6. Known Issues & Development Log

*   **Formant Shifting (Non-Functional):** Currently disabled/commented out.
    *   **Details:** Attempts were made to enable formant scaling using `_rubberband_set_formant_scale`. Rubberband flags tested included permutations of `EngineFiner`, `PhaseIndependent`, `FormantPreserved`, and the current default flag set. Formant scaling was tested alone and in combination with phase/speed shifting (0.25x to 2.0x). Debugging confirmed the target scale value was successfully passed to the WASM function via the correct API call.
    *   **Result:** No errors were thrown, but **no audible effect** from formant shifting was ever observed. The feature was abandoned as non-functional in the current Rubberband WASM build/configuration. It's uncertain if the issue is in the WASM compilation, the underlying library's formant preservation interaction with other flags, or a misunderstanding of the scale parameter (though multiplier is standard).
*   **VAD Performance & Backgrounding:** Runs on main thread; may cause minor UI jank and pauses when tab unfocused.
*   **VAD:** Only works for Left track. Backgrounding tab may pause processing.
*   **Spectrogram Latency:** Initial computation delay before drawing begins.
*   **Rubberband Engine Choice:** `EngineFiner` caused stuttering; using default (faster) engine.
*   **Rubberband Drift:** Potential for minor drift between tracks over long durations, currently only corrected by user Play/Seek actions. Active correction deferred.
*   **Playback Indicator Drift (Mitigated):** Reliance on main-thread calculation and sync-on-pause/speed-change significantly reduces drift compared to trusting worklet time reports, but minor visual discrepancies *during* rapid parameter changes might still occur due to inherent system latencies.
*   **Unimplemented Controls:** Solo functionality has been explicitly removed. Other control handlers (Mute, Volume, Delay, Pitch, Swap, Linking) are implemented in `app.js`.

<!-- /vibe-player/architecture.md -->
