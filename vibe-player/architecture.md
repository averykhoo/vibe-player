<!-- /vibe-player/architecture.md -->
# Vibe Player Architecture (Multi-Track Update)

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

*   **`app.js` (Controller):** Initializes modules, manages application state (including the `tracks` array), orchestrates loading/VAD/playback flow for **multiple tracks**, handles events, calculates global time and track offsets, manages UI state via `uiManager`, drives visualizer updates.
*   **`constants.js`:** Shared constants.
*   **`utils.js`:** Shared utility functions.
*   **`uiManager.js` (View/UI Logic):** Handles all DOM manipulation, UI event listeners. Manages **progressive display** of Left/Right track elements, updates track-specific controls, handles link/swap/remove button states, parses/formats delay input, updates drift display.
*   **`js/player/`:**
    *   **`audioEngine.js` (Audio Backend):** Manages Web Audio API context, **master gain**. Creates/manages audio graph nodes **per track** (`Worklet -> Panner -> VolumeGain -> MuteGain -> MasterGain`) using an internal Map keyed by `trackId`. Handles `AudioWorkletNode` lifecycle/communication per track. Provides track-specific control methods (`setVolume`, `setPan`, `setTrackSpeed`, `playTrack`, `seekTrack`, etc.) and adapted global methods (`togglePlayPause`, `seekAllTracks`).
    *   **`rubberbandProcessor.js` (AudioWorklet):** Runs in worklet thread. Interfaces with Rubberband WASM. Accepts `trackId` for logging/messaging. **One instance runs per loaded audio track.**
*   **`js/vad/`:** (Modules unchanged, but only used by `app.js` for Left track)
    *   **`sileroWrapper.js`**
    *   **`sileroProcessor.js`**
    *   **`vadAnalyzer.js`**
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
*   **State:** `app.js` manages `tracks` array (holds buffer, file, parameters, state flags per track), `multiTrackModeActive`, link flags, global playback state. `audioEngine` manages the `trackNodesMap` (mapping `trackId` to AudioNode references). Visualizers manage their own internal state (canvas refs, cached data) per instance.

## 5. Design Decisions, Constraints & Tradeoffs

*   **Static Hosting (C1), Vanilla JS (C2), Namespace/Events (C3), Error Handling (C4), Manual Testing (C5), File Structure (C6), JSDoc (C7):** Constraints remain largely the same.
*   **Progressive Multi-Track UI:** UI starts simple, reveals complexity only when the second track is added. Keeps initial experience clean. (New Design)
*   **Independent Worklet Instances:** One Rubberband worklet per track. POC confirmed memory isolation seems sufficient. (New Design / Confirmation)
*   **Audio Graph per Track:** `Worklet -> Panner -> VolumeGain -> MuteGain -> MasterGain`. Ensures independent panning, volume, mute control before mixing. (New Design)
*   **Visualizer Factory Pattern:** `waveformVisualizer` and `spectrogramVisualizer` refactored to return `createInstance` functions, allowing independent instances with separate state (element refs, cache) for Left and Right tracks. (New Design / Refactor)
*   **Offset Handling via Seek:** Using `app.js` logic and `seek` commands to manage track start offsets instead of `DelayNode`. More flexible, less memory intensive, better control. (New Design)
*   **Linked Speed (Default):** Speed/Pitch controls default to linked for simpler synchronization logic and UI. Independent control deferred. (New Design Choice)
*   **Main-Thread Time Sync:** Still relies on `AudioContext.currentTime` and `requestAnimationFrame` in `app.js` for UI updates and the primary time reference. Periodic seeks (on Play/Seek) correct worklet timing drift relative to this reference. (Constraint/Design Adaptation)
*   **VAD on Left Only:** VAD processing and UI elements currently only apply to the Left track to limit scope. (MVP Limitation)
*   **Visualizer Offset Display:** Uses progress indicator styling (inactive/active states) and positioning (start/middle/end) to show offset/duration relationship, avoids complex graphical waveform shifting for now. (New Design)
*   **Master Gain 0x Workaround:** Targeting a near-zero value (`1e-7`) in `audioEngine.setGain` instead of `0.0` to avoid browser quirks. (Implementation Detail)

## 6. Known Issues & Development Log

*   **Formant Shifting (Non-Functional):** No change.
*   **VAD:** Only works for Left track. Backgrounding tab may pause processing.
*   **Spectrogram Latency:** Initial computation delay still exists per track.
*   **Rubberband Drift:** Potential for minor drift between tracks over long durations, currently only corrected by user Play/Seek actions. Active correction deferred.
*   **Unimplemented Controls:** Mute, Solo, Volume, Delay, Pitch, Swap, Linking logic handlers in `app.js` are placeholders.

<!-- /vibe-player/architecture.md -->
