<!-- /vibe-player/TODO.md -->
# Vibe Player - TODO & Future Ideas

This file tracks potential improvements, features, and known issues requiring further investigation for the Vibe Player project.

## Bugs / Issues

*   **[INVESTIGATE] Formant Shift:** The formant shift feature provided by Rubberband WASM is currently non-functional (no audible effect despite parameter being set). Requires deeper investigation. *(Deferred)*

## Current Implementation Plan (Multi-Track MVP)

*   **Phase 1 & 1.5: UI Structure & Left Track Baseline + Fixes (Completed)**
    *   Refactored state (`app.js`) and audioOkay, let's update `TODO.md` to reflect the completion of Phase 1.5 fixes and outline the remaining tasks for Phases 2 and 3 of the multi-track MVP, along with longer-term goals.

*(Guideline P4.1.4: Full File format)*
*(Guideline P3.4: File Identification Comments)*

```markdown
<!-- /vibe-player/TODO.md -->
# Vibe Player - TODO & Future Ideas

This file tracks potential improvements, features, and known issues requiring further investigation for the Vibe Player project.

## Bugs / Issues

*   **[INVESTIGATE] Formant Shift:** The formant shift feature provided by Rubberband WASM is currently non-functional (no audible effect despite parameter being set). Requires deeper investigation into Rubberband flags, potential WAS engine (`audioEngine.js`) for multi-track support.
    *   Implemented progressive UI (`index.html`, `uiManager.js`, `styles.css`) showing Left track first.
    *   Implemented visualizer factory pattern and instantiation (`visualizers/*.js`, `app.js`).
    *   Fixed visualizer initialization, updates, gain bug, pan timing.
    *   Left track loads, plays, seeks correctly with visuals and VAD.
    *   "Load Right Track" button enabled.

*   **Phase 2: Adding Right Track & Basic Multi-Track UI (Next)**
    *   Implement Right track loading (`app.js`, `uiManager.js`).
    *   Instantiate Right visualizers upon Right track ready (`app.js`).
    *   Activate multi-track UI display (`uiManager.js`, `app.js`).
    *   Implement "Remove Right Track" functionality (`app.js`, `uiManager.js`, `audioEngine.js`).
    *   Adapt global Play/Pause/Seek readiness checks for multi-track mode (`app.js`).
    *   **(Testing Step)**

*   **Phase 3: Essential Multi-Track Controls & Interaction (Following Phase 2)**
    *   Implement **Individual Volume** controls (UI, `app.js`, `audioEngine.js`).
    *   ImplementM build issues, or alternative approaches if the library feature is fundamentally broken in this context.
*   **[RESOLVED - Phase 1.5] Master Gain Display/Behavior Bug:** Setting Master Gain to 0x caused volume jump. Fixed by targeting near-zero value in `audioEngine.setGain`.
*   **[RESOLVED - Phase 1.5] Initial Pan Error:** Harmless console warning "Cannot set pan - PannerNode/Context not ready". Fixed by moving initial `setPan` call to `handleWorkletReady`.
*   **[RESOLVED - Phase 1.5] Right Track Visuals:** Did not appear initially. Fixed viz instantiation timing and drawing calls in `app.js`.
*   **[RESOLVED - Phase 1.5] Left Progress Indicator:** Was not moving. Fixed by refactoring visualizers to use factory pattern for independent instances.
*   **[RESOLVED - Phase 1.5] Right Track Markers:** Rendered incorrectly. Fixed by positioning markers after UI section becomes visible in `uiManager.js`.
*   **[RESOLVED - Phase 1.5] Speed Control UI Update:** Slider UI didn't update correctly when linked. Fixed by removing incorrect `setSliderValue` call in `app.js`.

## Immediate Implementation (Multi-Track MVP)

*   **Phase 1 & 1.5: UI Structure & Left Track Baseline & Fixes (COMPLETE)**
    *   Backend state/engine refactored for multi-track.
    *   Progressive UI structure added (hidden elements for Track Right).
    *   Left track loads, plays, displays visuals correctly.
    *   "Load Right Track" button enabled.
    *   Initial bugs (Gain, Pan, Viz init/update, Markers) fixed.

*   **Phase 2: Adding Right Track & Basic Multi-Track UI (NEXT)**
    *   **Goal:** User can enable multi-track mode, load the Right track, see its controls/visuals appear, have global controls affect both tracks, and remove the Right track to revert to single-track mode.
    *   **Tasks:**
        *   [ ] **`app.js`:** Implement Right track loading (`handleFileSelect` logic for 'right').
        *   [ ] **`app.js`:** Update `handleWorkletReady` for Right track to correctly trigger UI visibility and control enabling.
        *   [ ] **`uiManager.js`:** Ensure **Shared Speed** control logic fully (UI already present, logic in `app.js`).
    *   Implement **Delay Input** (UI, `uiManager.js` parser, `app.js` state).
    *   Implement **Offset Logic** in global Play/Pause/Seek handlers (`app.js`).
    *   Implement offset-aware **Dual Visualization Updates** (`app.js` calls to visualizer `updateProgressIndicator`).
    *   Implement **Track Ending** detection logic (`app.js`).
    *   **(Testing Step)**

## Deferred Features / Enhancements (Post-MVP)

*   **UI / UX:**
    *   **Multi-Track Controls:** Implement Mute/Solo buttons & logic. Implement Swap L/R button & logic. Implement Link/Unlink buttons & logic (Pitch, potentially Volume).
    *   **Individual Speed/Pitch:** Add UI and logic for unlinked Speed/Pitch controls (requires significant timing logic changes).
    *   **XP.css Theme:** Upgrade styling from 98.css to XP.css (or similar).
    *   **Parameter Smoothing:** Investigate smoother transitions for Speed/Pitch changes if possible.
    *   **Error Handling UI:** Display user-friendly error messages in the UI overlay/section.
    *   **Preset Management:** Allow saving/loading sets of Speed/Pitch/Gain/Volume/Offset/VAD settings.
    *   **Windows 98 Sounds:** Add nostalgic UI sound effects on interactions.
    *   **Keyboard Bindings:** Make keybinds configurable (UI + LocalStorage). Add Reset button. Add more bindings (e.g., speed up/down, reset controls, Mute/Solo L/R). Add 'Back to Start' button.
    *   **Drift Display:** Implement actual calculation and display of ms drift between tracks (requires reliable timing reports or analysis).
*   **Visualizations:**
    *   **VAD for Right Track:** Implement VAD analysis and display/highlighting.
    *   **Graphical Offset:** Implement shifting/scaling of waveform/spectrogram content based on offset.
    *   **Toggle Viz Type:** Allow toggling track display between Waveform and Spectrogram.
    *   **VAD Probability Graph:** Add graph showing VAD probabilities and thresholds (likely Left only initially).
*   **Audio / Sync:**
    *   **Active Drift Correction:** Implement periodic re-syncing via seek *if testing shows significant drift*. Add manual "Resync" button first.
*   **Architecture / Code Health:**
    *   **VAD Worker:** Migrate VAD processing to a Web Worker.
    *   **Visualizer Computation Worker(s):** Offload waveform/spectrogram calculation.
    *   **State Management Module (`audioPlayerState.js`):** Refactor state logic out of `app.js`.
    *   **Review `app.js` / `audioEngine.js` Complexity:** Monitor and refactor as features grow.
    *   **Automated Testing:** Introduce unit/integration tests.
    *   **Spectrogram Cache:** Verify robustness with multiple instances.

<!-- /vibe-player/TODO.md -->