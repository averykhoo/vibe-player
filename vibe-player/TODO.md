<!-- /vibe-player/TODO.md -->
# Vibe Player - TODO & Future Ideas

This file tracks potential improvements, features, and known issues requiring further investigation for the Vibe Player project.

## Bugs / Issues

*   **[INVESTIGATE] Formant Shift:** The formant shift feature provided by Rubberband WASM is currently non-functional (no audible effect despite parameter being set). Requires deeper investigation into Rubberband flags, potential WASM build issues, or alternative approaches if the library feature is fundamentally broken in this context.
*   **[INVESTIGATE] Master Gain Display Bug:** Volume display might show `1.00x` when slider is at `0`. (Need to confirm/fix in `uiManager.js`).
*   **[INVESTIGATE] Initial Pan Error:** Harmless console warning "Cannot set pan - PannerNode/Context not ready" occurs during initial load. Timing should be adjusted.

## Immediate Implementation (Multi-Track MVP - Phase 1.5 -> 3)

*   **Phase 1.5:** Fix Visualizer init/updates, Volume display bug, Pan timing error. Ensure perfect single-track (Left) operation.
*   **Phase 2:** Implement Right track loading/removal, UI activation/deactivation.
*   **Phase 3:** Implement essential multi-track controls (Volume, Delay input, Shared Speed), Offset logic for playback/seek, Dual visualization updates (offset-aware indicators), Track ending logic.

## Potential Enhancements / Features

*   **UI / UX:**
    *   **XP.css Theme:** Upgrade styling from 98.css to XP.css (or similar) post-MVP.
    *   **Multi-Track Controls:** Implement Mute/Solo, Swap L/R, Link/Unlink buttons and logic.
    *   **Individual Speed/Pitch:** Add UI and logic for unlinked Speed/Pitch controls.
    *   **Parameter Smoothing:** Investigate smoother transitions for Speed/Pitch changes if possible.
    *   **Error Handling UI:** Display user-friendly error messages in the UI.
    *   **Preset Management:** Allow saving/loading sets of Speed/Pitch/Gain/VAD/Offset settings.
    *   **Windows 98 Sounds:** Add nostalgic UI sound effects on interactions.
    *   **Keyboard Bindings:** Make keybinds configurable (UI + LocalStorage). Add Reset button. Add more bindings (e.g., speed up/down, reset controls). Add 'Back to Start' button.
    *   **Drift Display:** Implement actual calculation and display of ms drift between tracks.
*   **Visualizations:**
    *   **VAD Probability Graph:** Add graph showing VAD probabilities and thresholds.
    *   **Graphical Offset:** Implement shifting/scaling of waveform/spectrogram content based on offset.
    *   **Toggle Viz Type:** Allow toggling track display between Waveform and Spectrogram.
*   **Audio / VAD:**
    *   **VAD Worker:** Migrate VAD processing to a Web Worker.
    *   **VAD for Right Track:** Implement VAD analysis and display for the second track.
    *   **Active Drift Correction:** Implement periodic re-syncing via seek if needed.
*   **Architecture:**
    *   **Visualizer Computation Worker(s):** Offload waveform/spectrogram calculation.
    *   **State Management Module (`audioPlayerState.js`):** Refactor state logic out of `app.js`.

* back to start button?
* play in reverse / rewind / reverse jog? button that you hold down to play at negative of your current speed

## Code Health / Refactoring Ideas

*   **Review `app.js` Complexity:** Monitor and refactor if needed, potentially using `audioPlayerState.js`.
*   **Review `audioEngine.js` State:** Evaluate opportunities for making it more stateless.
*   **Automated Testing:** Introduce unit/integration tests.
*   **Spectrogram Cache:** Ensure caching mechanism works correctly with multiple visualizer instances.

<!-- /vibe-player/TODO.md -->