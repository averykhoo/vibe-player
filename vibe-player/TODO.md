<!-- /vibe-player/TODO.md -->
# Vibe Player - TODO & Future Ideas

This file tracks potential improvements, features, and known issues requiring further investigation for the Vibe Player project.

## Bugs / Issues

*   **[INVESTIGATE] Formant Shift:** The formant shift feature provided by Rubberband WASM is currently non-functional (no audible effect). Requires deeper investigation. *(Deferred)*
*   **[RESOLVED - Post-MVP Fix] Pause Position Bug:** Play position jumped back on pause. Fixed by correcting the order of operations in `app.js::handlePlayPause`.
*   **[RESOLVED - Post-MVP Fix] Delay Change Bug:** Changing delay offset while playing didn't affect audio. Fixed by triggering a seek in `app.js::handleDelayChange`.
*   **[RESOLVED - Refactor Bug] Initial Load Error:** Worklet received empty audio data due to missing loop in `audioEngine`. Fixed.
*   **[RESOLVED - Refactor Bug] Constructor Errors:** Worklet constructor failed due to WASM resources not being ready. Fixed by adding await in `audioEngine::setupTrack`.
*   **[RESOLVED - Refactor Bug] Right Load Button:** Button was enabled but invisible. Fixed by removing `visibility: hidden` style in `uiManager`.
*   **[RESOLVED - Refactor Bug] Visualizer Swap:** Waveform/Spectrogram content didn't update on swap. Fixed by adding redraw calls in `app.js::handleSwapTracks`.
*   **[RESOLVED - Refactor Bug] VAD Highlight Swap:** VAD highlights didn't swap correctly. Fixed `app.js::drawTrackVisuals` to use track data for VAD regions.

## Immediate Implementation (Multi-Track Feature Set)

**Goal:** Implement core multi-track features (Volume, Mute, Solo, Multi-VAD) on the refactored architecture.

**Order of Operations:**

1.  **Phase R1: Architectural Refactor - Track Indirection & Swap (COMPLETE)**
    *   Refactored state (`app.js`) to use `tracksData` array and `left/rightChannelTrackIndex` pointers.
    *   Refactored `audioEngine.js` & `rubberbandProcessor.js` to use numeric `trackIndex`.
    *   Refactored `uiManager.js` to include `refreshTrackUI`.
    *   Implemented `handleSwapTracks`.
    *   **Completed:** Move Speed control to Global section (`index.html`, `uiManager.js`, `app.js`).

2.  **Phase M1: Mute & Solo Implementation (NEXT)**
    *   **Goal:** Implement working Mute and Solo buttons for individual tracks.
    *   **Tasks:**
        *   [ ] **`app.js`:** Implement `handleMuteToggle`, `handleSoloToggle` to update `isMuted`/`isSoloed` flags in `tracksData`.
        *   [ ] **`app.js`:** Implement `applyMuteSoloState` helper function to calculate effective mute state based on all track flags and call `audioEngine.setMute`.
        *   [ ] **`uiManager.js`:** Ensure `setMuteButtonState`/`setSoloButtonState` provide clear visual feedback. Ensure listeners call `app.js` handlers.
    *   **(Testing Step)**

3.  **Phase M2: VAD for All Tracks (After Mute/Solo)**
    *   **Goal:** Enable VAD processing and waveform highlighting for both Left and Right UI channels.
    *   **Tasks:**
        *   [ ] **`app.js`:** Modify `runVadInBackground` trigger in `handleWorkletReady` to run for *any* ready track (Left or Right).
        *   [ ] **`app.js`:** Ensure `runVadInBackground` uses the correct track index for storing results and updating the correct visualizer via `vizRefs` (Highlighting part already done in `drawTrackVisuals`).
        *   [ ] **`uiManager.js`:** Decide on and implement VAD progress display for potentially concurrent VAD runs (e.g., modify `showVadProgress`/`updateVadProgress` or add a second bar). *(Decision needed)*
        *   [ ] **`uiManager.js`:** Ensure VAD Tuning section title clearly states sliders only affect Left Track *recalculation*. *(Partially done, verify text)*
    *   **(Testing Step)**

4.  **Phase M3: Final Polish & Verification (After VAD)**
    *   **Goal:** Ensure individual volume and unlinked pitch work as expected after refactors. Fix single-track UI presentation.
    *   **Tasks:**
        *   [ ] **`app.js` / `uiManager.js`:** Verify `handleVolumeChange` works correctly with track indirection.
        *   [ ] **Testing:** Thoroughly test unlinked pitch mode toggle and control.
        *   [ ] **Testing:** Thoroughly test individual volume sliders.
        *   [ ] **UI Fix:** Fix single-track UI presentation (ensure Right track column/viz are properly hidden/collapsed when only Left track is loaded). Verify `showMultiTrackUI` logic.
    *   **(Testing Step - Final Features)**

## Deferred / Future Ideas

*   **Track Management:**
    *   Implement non-resetting Left track load (preserve Right track). *(Was previously immediate, now deferred)*
    *   Track Deletion (beyond just 'Remove Right').
    *   Track Reordering.
*   **UI / UX:**
    *   **Zoom & Pan/Slide:** Implement zoom controls for visualizers and click-and-drag panning/sliding. *(New Request)*
    *   XP.css Theme + Windows XP Sounds.
    *   Parameter Smoothing (Speed/Pitch).
    *   Error Handling UI Overlay.
    *   Preset Management.
    *   Keyboard Binding Configuration.
    *   'Back to Start' button.
*   **Visualizations:**
    *   **Spectrogram Focus:** Adjust spectrogram frequency range/scaling (e.g., 0-8kHz or 300-5kHz) for speech intelligibility. *(New Request)*
    *   Graphical Offset Display (Shift waveform/spectrogram content).
    *   Toggle Viz Type (Waveform/Spectrogram).
    *   VAD Probability Graph.
    *   Separate VAD Threshold Controls for Right Track (Option B).
*   **Audio / Sync:**
    *   **Real-time Drift:** Verify drift clock calculation and display accuracy. *(New Request - partially done)*
    *   Active Drift Correction (Manual Resync button first).
*   **Architecture / Code Health:**
    *   VAD Worker.
    *   Visualizer Computation Worker(s).
    *   State Management Module (`audioPlayerState.js`).
    *   Review `app.js` / `audioEngine.js` Complexity.
    *   Automated Testing.

<!-- /vibe-player/TODO.md -->