// --- /vibe-player/js/stateManager.js ---
// Manages the core application state for Vibe Player.
// REFACTORED: Removed Solo state and related logic.

var AudioApp = AudioApp || {}; // Ensure main namespace exists

AudioApp.stateManager = (function() {
    'use strict';

    // --- Module State ---

    // Define TrackState structure locally or assume global availability if needed elsewhere
    // For encapsulation, defining essentials here is safer if app.js isn't guaranteed loaded first
    /**
     * @typedef {object} TrackState Represents the state of a single audio track.
     * @property {number} id
     * @property {File|null} file
     * @property {AudioBuffer|null} audioBuffer
     * @property {boolean} isLoading
     * @property {boolean} isReady
     * @property {boolean} hasEnded
     * @property {object} parameters
     * @property {number} parameters.offsetSeconds
     * @property {number} parameters.volume
     * @property {number} parameters.speed
     * @property {number} parameters.pitch
     * @property {number} parameters.pan
     * @property {boolean} parameters.isMuted // Mute state remains
     * // property {boolean} parameters.isSoloed // REMOVED
     * @property {object} vad
     * @property {VadResult|null} vad.results
     * @property {boolean} vad.isProcessing
     * @property {number|null} playTimeoutId
     * @property {number} lastReportedTime
     */

    // --- Core State Variables ---
    /**
     * @type {Array<TrackState | null>}
     * @description Array storing the state objects for all loaded tracks.
     *              Each element can be a TrackState object or null if the slot is empty.
     *              The index in this array serves as the track's unique numeric ID.
     */
    let tracksData = [];
    /** @type {number} */
    let leftChannelTrackIndex = -1;
    /** @type {number} */
    let rightChannelTrackIndex = -1;
    /** @type {boolean} */
    let isMultiChannelModeActive = false;

    // --- Global Playback State ---
    let globalPlaybackState = 'stopped';
    let playbackStartTimeContext = null;
    let playbackStartSourceTime = 0.0;
    let currentGlobalSpeed = 1.0;

    // --- Linking State ---
    let pitchLinked = true;

    // --- VAD State ---
    let vadModelReady = false;

    // --- REMOVED Solo State ---
    // let soloedTrackIndex = -1; // REMOVED

    // --- Track State Creation ---
    /**
     * Creates an initial state object for a track at a given index.
     * @param {number} trackIndex - The numeric index/ID for the track.
     * @returns {TrackState}
     * @private
     */
    function createInitialTrackState(trackIndex) {
        return {
            id: trackIndex, file: null, audioBuffer: null, isLoading: false, isReady: false, hasEnded: false,
            parameters: {
                offsetSeconds: 0.0, volume: 1.0, speed: currentGlobalSpeed,
                pitch: 1.0, pan: 0.0,
                isMuted: false, // Mute remains
                // isSoloed: false, // REMOVED
            },
            vad: { results: null, isProcessing: false, },
            playTimeoutId: null, lastReportedTime: 0.0,
        };
    }

    // --- State Accessors (Getters) ---

    /**
     * Gets the entire `tracksData` array, which holds the state for all tracks.
     * @returns {Array<TrackState|null>} The array of track states.
     */
    function getTracksData() { return tracksData; }

    /**
     * Safely retrieves a track's state object by its numeric index.
     * @param {number} index - The numeric index (ID) of the track.
     * @returns {TrackState|null} The track state object, or null if the index is invalid or the slot is empty.
     */
    function getTrackByIndex(index) { return (index >= 0 && index < tracksData.length) ? tracksData[index] : null; }

    /**
     * Gets the numeric index of the track currently assigned to the Left UI channel.
     * @returns {number} The track index, or -1 if no track is assigned to the left channel.
     */
    function getLeftTrackIndex() { return leftChannelTrackIndex; }

    /**
     * Gets the numeric index of the track currently assigned to the Right UI channel.
     * @returns {number} The track index, or -1 if no track is assigned to the right channel.
     */
    function getRightTrackIndex() { return rightChannelTrackIndex; }

    /**
     * Gets the numeric index of the track currently assigned to a specific UI side ('left' or 'right').
     * @param {'left'|'right'} side - The UI side ('left' or 'right') to query.
     * @returns {number} The track index, or -1 if no track is assigned to that side.
     */
    function getTrackIndexForSide(side) { return side === 'left' ? leftChannelTrackIndex : rightChannelTrackIndex; }

    /**
     * Checks if multi-channel mode is active, meaning both Left and Right UI channels currently have tracks assigned to them.
     * @returns {boolean} True if multi-channel mode is active, false otherwise.
     */
    function getIsMultiChannelModeActive() { return isMultiChannelModeActive; }

    /**
     * Gets the current global playback state of the application.
     * @returns {'stopped'|'playing'|'paused'} The current playback state.
     */
    function getPlaybackState() { return globalPlaybackState; }

    /**
     * Gets the AudioContext's `currentTime` (in seconds) that was captured when playback last started or resumed.
     * This is used as a reference for calculating elapsed playback time.
     * @returns {number|null} The context time in seconds, or null if playback hasn't started or state is not set.
     */
    function getPlaybackStartTimeContext() { return playbackStartTimeContext; }

    /**
     * Gets the global source time (playback position within the audio content, adjusted for speed)
     * that corresponds to `playbackStartTimeContext`. This forms the other part of the time reference pair.
     * @returns {number} The source time in seconds.
     */
    function getPlaybackStartSourceTime() { return playbackStartSourceTime; }

    /**
     * Gets the current global playback speed multiplier applied to all tracks.
     * @returns {number} The speed multiplier (e.g., 1.0 for normal speed).
     */
    function getCurrentGlobalSpeed() { return currentGlobalSpeed; }

    /**
     * Gets the state of the pitch linking toggle. If true, pitch controls for left and right tracks are linked.
     * @returns {boolean} The pitch link state.
     */
    function getIsPitchLinked() { return pitchLinked; }

    /**
     * Gets the VAD (Voice Activity Detection) model readiness state.
     * @returns {boolean} True if the VAD model has been initialized by `sileroWrapper` and is ready for use.
     */
    function getIsVadModelReady() { return vadModelReady; }

    /**
     * Checks if a UI side ('left' or 'right') currently has a track assigned to it.
     * @param {'left'|'right'} side - The UI side to check.
     * @returns {boolean} True if a track is assigned to the specified side, false otherwise.
     */
    function isSideAssigned(side) { return getTrackIndexForSide(side) !== -1; }

    /**
     * Checks if all currently assigned tracks (to Left and potentially Right UI channels)
     * have their `isReady` flag set to true, indicating they are fully loaded and
     * their audio engines (worklets) are ready for playback.
     * @returns {boolean} True if all active (assigned) tracks are ready, false otherwise.
     */
    function areAllActiveTracksReady() {
        const leftTrack = getTrackByIndex(leftChannelTrackIndex);
        if (leftChannelTrackIndex !== -1) { // Check if left is assigned
            if (!leftTrack?.isReady) return false;
        }
        // Only proceed to check right channel if it's assigned
        if (rightChannelTrackIndex !== -1) {
            const rightTrack = getTrackByIndex(rightChannelTrackIndex);
            if (!rightTrack?.isReady) return false;
        }
        return true; // If all assigned tracks are ready, or no tracks are assigned
    }

    /**
     * Counts how many valid (non-null) track state objects currently exist in the `tracksData` array.
     * This represents the total number of tracks loaded into the application, regardless of UI assignment.
     * @returns {number} The count of loaded tracks.
     */
    function getLoadedTrackCount() { return tracksData.filter(t => t !== null).length; }

    /**
     * Calculates the maximum effective duration of the entire composition,
     * considering the individual durations and start offsets of both currently assigned tracks (if any).
     * This is used for UI elements like the main seek bar.
     * @returns {number} The maximum effective duration in seconds. Returns 0 if no tracks are loaded or durations are invalid.
     */
    function calculateMaxEffectiveDuration() {
        let maxDuration = 0;
        const leftTrack = getTrackByIndex(leftChannelTrackIndex);
        const rightTrack = getTrackByIndex(rightChannelTrackIndex);
        if (leftTrack?.audioBuffer) {
            maxDuration = Math.max(maxDuration, leftTrack.parameters.offsetSeconds + leftTrack.audioBuffer.duration);
        }
        if (rightTrack?.audioBuffer) {
            maxDuration = Math.max(maxDuration, rightTrack.parameters.offsetSeconds + rightTrack.audioBuffer.duration);
        }
        return isNaN(maxDuration) ? 0 : maxDuration;
    }
    // function getSoloedTrackIndex() { return soloedTrackIndex; } // REMOVED


    // --- State Modifiers (Setters / Actions) ---

    /**
     * Sets the global playback state (e.g., 'playing', 'paused', 'stopped')
     * and the associated time references used for synchronizing playback calculations.
     * @param {'stopped'|'playing'|'paused'} newState - The new playback state.
     * @param {number|null} [contextTime=null] - The AudioContext's `currentTime` at the moment of this state change.
     *                                         Should be provided when state changes to 'playing'.
     * @param {number} [sourceTime=playbackStartSourceTime] - The source time (playback position within the
     *                                         audio content, considering speed) that corresponds to `contextTime`.
     *                                         Defaults to the current `playbackStartSourceTime` if not explicitly provided.
     */
    function setPlaybackState(newState, contextTime = null, sourceTime = playbackStartSourceTime) {
        if (['stopped', 'playing', 'paused'].includes(newState)) {
            globalPlaybackState = newState;
            playbackStartTimeContext = contextTime;
            playbackStartSourceTime = sourceTime;
            console.log(`StateManager: Playback state set to ${newState}, contextTime: ${contextTime}, sourceTime: ${sourceTime.toFixed(3)}`);
        } else {
            console.warn(`StateManager: Invalid playback state provided: ${newState}`);
        }
    }

    /**
     * Updates the current global playback speed multiplier.
     * The provided speed value is parsed as a float, validated, and clamped between 0.25 and 2.0.
     * @param {number|string} speed - The new speed multiplier (e.g., 1.0 for normal speed).
     */
    function setCurrentGlobalSpeed(speed) {
        const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0));
        currentGlobalSpeed = newSpeed;
        console.log(`StateManager: Global speed set to ${currentGlobalSpeed}`);
    }

    /**
     * Updates the core timebase references (`playbackStartTimeContext` and `playbackStartSourceTime`).
     * This is crucial after events like a speed change during active playback, allowing
     * `calculateEstimatedSourceTime` to remain accurate.
     * @param {number} newContextTime - The new AudioContext's `currentTime` to set as the reference.
     * @param {number} newSourceTime - The new source time (playback position) corresponding to `newContextTime`.
     */
    function updateTimebaseForSpeedChange(newContextTime, newSourceTime) {
        playbackStartTimeContext = newContextTime;
        playbackStartSourceTime = newSourceTime;
        console.log(`StateManager: Timebase updated after speed change. New ContextStart: ${newContextTime?.toFixed(3)}, New SourceStart: ${newSourceTime.toFixed(3)}`);
    }

    /**
     * Toggles the pitch linking state (between linked and unlinked modes for pitch sliders).
     * @returns {boolean} The new pitch linking state (true if pitch is now linked, false if unlinked).
     */
    function togglePitchLink() {
        pitchLinked = !pitchLinked;
        console.log(`StateManager: Pitch link toggled to ${pitchLinked}`);
        return pitchLinked;
    }

    /**
     * Sets the VAD (Voice Activity Detection) model readiness flag.
     * This should be called after the VAD model (e.g., Silero) has been successfully initialized.
     * @param {boolean} isReady - True to indicate the VAD model is ready, false otherwise.
     */
    function setVadModelReady(isReady) {
        vadModelReady = !!isReady; // Coerce to boolean
        console.log(`StateManager: VAD model ready set to ${vadModelReady}`);
    }

    /**
     * Finds the first available (null) slot index in the `tracksData` array.
     * If no null slot is found, it expands the `tracksData` array by creating a new slot at the end.
     * This ensures there's always a place for a new track.
     * @returns {number} The numeric index of the available or newly created slot.
     */
    function findFirstAvailableSlot() {
        const nullIndex = tracksData.findIndex(slot => slot === null);
        if (nullIndex !== -1) {
            console.log(`StateManager: Found available slot at index ${nullIndex}`);
            return nullIndex;
        }
        tracksData.push(null); // Expand array if no null slots
        const newIndex = tracksData.length - 1;
        console.log(`StateManager: Created new slot at index ${newIndex}`);
        return newIndex;
    }

    /**
     * Creates a new `TrackState` object using `createInitialTrackState` and stores it
     * in the `tracksData` array at the specified `trackIndex`.
     * It logs a warning if an existing track's data is being overwritten.
     * @param {number} trackIndex - The numeric index at which to add the new track state. Must be non-negative.
     * @returns {TrackState|null} The newly created `TrackState` object, or null if `trackIndex` is negative.
     */
    function addNewTrack(trackIndex) {
        if (trackIndex < 0) {
            console.error("StateManager: Cannot add track with negative index.");
            return null;
        }
        if (trackIndex < tracksData.length && tracksData[trackIndex] !== null) {
            console.warn(`StateManager: Overwriting existing track data at index ${trackIndex}`);
        }
        const newTrack = createInitialTrackState(trackIndex);
        tracksData[trackIndex] = newTrack;
        console.log(`StateManager: Added new track state at index ${trackIndex}`);
        return newTrack;
    }

    /**
     * Assigns a given track index to either the Left or Right UI channel's state variable
     * (`leftChannelTrackIndex` or `rightChannelTrackIndex`).
     * After assignment, it calls `updateMultiChannelMode` to refresh the multi-channel status.
     * @param {'left'|'right'} side - The UI channel ('left' or 'right') to assign the track index to.
     * @param {number} trackIndex - The numeric index of the track to assign to the channel.
     */
    function assignChannel(side, trackIndex) {
        console.log(`StateManager: Assigning track index #${trackIndex} to ${side} channel.`);
        if (side === 'left') {
            leftChannelTrackIndex = trackIndex;
        } else if (side === 'right') {
            rightChannelTrackIndex = trackIndex;
        } else {
            console.warn(`StateManager: Invalid side "${side}" for channel assignment.`);
            return;
        }
        updateMultiChannelMode();
    }

    /**
     * Clears the track data slot at the given `trackIndex` by setting its entry in `tracksData` to null.
     * This function also ensures any pending `playTimeoutId` for the track is cleared.
     * If the cleared track was assigned to a UI channel (Left or Right), that channel assignment
     * is also reset (to -1), and the multi-channel mode status is updated accordingly.
     * @param {number} trackIndex - The numeric index of the track slot to clear.
     */
    function clearTrackSlot(trackIndex) {
        if (trackIndex >= 0 && trackIndex < tracksData.length) {
            const track = tracksData[trackIndex];
            if (track?.playTimeoutId) {
                clearTimeout(track.playTimeoutId);
            }
            console.log(`StateManager: Clearing track data at index ${trackIndex}.`);
            tracksData[trackIndex] = null;

            let refreshMulti = false;
            if (leftChannelTrackIndex === trackIndex) {
                leftChannelTrackIndex = -1;
                refreshMulti = true;
            }
            if (rightChannelTrackIndex === trackIndex) {
                rightChannelTrackIndex = -1;
                refreshMulti = true;
            }
            if (refreshMulti) {
                updateMultiChannelMode();
            }
        } else {
            console.warn(`StateManager: Invalid index ${trackIndex} for clearTrackSlot.`);
        }
    }

    /**
     * Swaps the track indices currently assigned to the Left (`leftChannelTrackIndex`)
     * and Right (`rightChannelTrackIndex`) UI channels.
     * Logs a warning if both channels are currently unassigned (i.e., both are -1).
     */
    function swapChannels() {
        if (leftChannelTrackIndex === -1 && rightChannelTrackIndex === -1) {
            console.warn("StateManager: Cannot swap empty channels.");
            return;
        }
        console.log(`StateManager: Swapping channels. Old Left: ${leftChannelTrackIndex}, Old Right: ${rightChannelTrackIndex}`);
        const tempIndex = leftChannelTrackIndex;
        leftChannelTrackIndex = rightChannelTrackIndex;
        rightChannelTrackIndex = tempIndex;
        console.log(`StateManager: Swap complete. New Left: ${leftChannelTrackIndex}, New Right: ${rightChannelTrackIndex}`);
    }

    /**
     * Updates the `isMultiChannelModeActive` flag. This flag is true if both
     * `leftChannelTrackIndex` AND `rightChannelTrackIndex` currently point to valid
     * track indices (i.e., not -1). Otherwise, it's false.
     * Logs a message if the mode changes.
     * @returns {boolean} The new (current) state of `isMultiChannelModeActive`.
     */
    function updateMultiChannelMode() {
        const wasActive = isMultiChannelModeActive;
        isMultiChannelModeActive = (leftChannelTrackIndex !== -1 && rightChannelTrackIndex !== -1);
        if (wasActive !== isMultiChannelModeActive) {
            console.log(`StateManager: Multi-channel mode changed to ${isMultiChannelModeActive}`);
        }
        return isMultiChannelModeActive;
    }

    /**
     * Resets all state variables in the `stateManager` to their initial default values.
     * This effectively returns the application to a clean slate. It includes clearing
     * all `tracksData`, resetting channel assignments, playback status, global speed,
     * linking states, and VAD model readiness. Importantly, it also iterates through
     * any existing tracks to clear their `playTimeoutId`s before emptying `tracksData`.
     */
    function resetState() {
        console.log("StateManager: Resetting all state.");
        tracksData.forEach(track => {
            if (track?.playTimeoutId) clearTimeout(track.playTimeoutId);
        });
        tracksData = [];
        leftChannelTrackIndex = -1;
        rightChannelTrackIndex = -1;
        isMultiChannelModeActive = false;
        globalPlaybackState = 'stopped';
        playbackStartTimeContext = null;
        playbackStartSourceTime = 0.0;
        currentGlobalSpeed = 1.0;
        pitchLinked = true;
        vadModelReady = false;
        // soloedTrackIndex = -1; // REMOVED
    }

    // --- Public Interface ---
    return {
        // Getters
        getTracksData, getTrackByIndex, getLeftTrackIndex, getRightTrackIndex, getTrackIndexForSide,
        getIsMultiChannelModeActive, getPlaybackState, getPlaybackStartTimeContext, getPlaybackStartSourceTime,
        getCurrentGlobalSpeed, getIsPitchLinked, getIsVadModelReady, isSideAssigned,
        areAllActiveTracksReady, getLoadedTrackCount, calculateMaxEffectiveDuration,
        // getSoloedTrackIndex, // REMOVED

        // Setters / Actions
        setPlaybackState, setCurrentGlobalSpeed, updateTimebaseForSpeedChange, togglePitchLink,
        setVadModelReady, findFirstAvailableSlot, addNewTrack, assignChannel, clearTrackSlot,
        swapChannels, resetState,
        // setSoloedTrackIndex // REMOVED
    };

})();

// Export for Node.js/CommonJS environments (like Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioApp.stateManager;
}
// --- /vibe-player/js/stateManager.js --- END MODIFIED FILE ---