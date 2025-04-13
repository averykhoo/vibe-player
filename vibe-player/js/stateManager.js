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
    /** @type {Array<TrackState | null>} */
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
    // (Getters for removed state are implicitly removed)

    /** Gets the entire tracksData array. */
    function getTracksData() { return tracksData; }
    /** Safely gets track data by index. */
    function getTrackByIndex(index) { return (index >= 0 && index < tracksData.length) ? tracksData[index] : null; }
    /** Gets the track index currently assigned to the Left UI channel. */
    function getLeftTrackIndex() { return leftChannelTrackIndex; }
    /** Gets the track index currently assigned to the Right UI channel. */
    function getRightTrackIndex() { return rightChannelTrackIndex; }
    /** Gets the track index currently assigned to a specific UI side. */
    function getTrackIndexForSide(side) { return side === 'left' ? leftChannelTrackIndex : rightChannelTrackIndex; }
    /** Checks if multi-channel mode (both L/R assigned) is active. */
    function getIsMultiChannelModeActive() { return isMultiChannelModeActive; }
    /** Gets the current global playback state. */
    function getPlaybackState() { return globalPlaybackState; }
    /** Gets the AudioContext time when playback last started/resumed. */
    function getPlaybackStartTimeContext() { return playbackStartTimeContext; }
    /** Gets the global source time reference point. */
    function getPlaybackStartSourceTime() { return playbackStartSourceTime; }
    /** Gets the current global playback speed multiplier. */
    function getCurrentGlobalSpeed() { return currentGlobalSpeed; }
    /** Gets the pitch linking state. */
    function getIsPitchLinked() { return pitchLinked; }
    /** Gets the VAD model readiness state. */
    function getIsVadModelReady() { return vadModelReady; }
    /** Checks if a UI side currently has a track assigned. */
    function isSideAssigned(side) { return getTrackIndexForSide(side) !== -1; }
    /** Checks if all currently assigned tracks are loaded and ready. */
    function areAllActiveTracksReady() { const leftTrack = getTrackByIndex(leftChannelTrackIndex); if (!leftTrack?.isReady) return false; if (rightChannelTrackIndex !== -1) { const rightTrack = getTrackByIndex(rightChannelTrackIndex); if (!rightTrack?.isReady) return false; } return true; }
    /** Counts how many valid (non-null) track state objects exist. */
    function getLoadedTrackCount() { return tracksData.filter(t => t !== null).length; }
    /** Calculates the maximum effective duration considering offsets of assigned tracks. */
    function calculateMaxEffectiveDuration() { let maxDuration = 0; const leftTrack = getTrackByIndex(leftChannelTrackIndex); const rightTrack = getTrackByIndex(rightChannelTrackIndex); if (leftTrack?.audioBuffer) maxDuration = Math.max(maxDuration, leftTrack.parameters.offsetSeconds + leftTrack.audioBuffer.duration); if (rightTrack?.audioBuffer) maxDuration = Math.max(maxDuration, rightTrack.parameters.offsetSeconds + rightTrack.audioBuffer.duration); return isNaN(maxDuration) ? 0 : maxDuration; }
    // function getSoloedTrackIndex() { return soloedTrackIndex; } // REMOVED


    // --- State Modifiers (Setters / Actions) ---

    /** Sets the global playback state and associated time references. */
    function setPlaybackState(newState, contextTime = null, sourceTime = playbackStartSourceTime) { if (['stopped', 'playing', 'paused'].includes(newState)) { globalPlaybackState = newState; playbackStartTimeContext = contextTime; playbackStartSourceTime = sourceTime; console.log(`StateManager: Playback state set to ${newState}, contextTime: ${contextTime}, sourceTime: ${sourceTime.toFixed(3)}`); } else { console.warn(`StateManager: Invalid playback state provided: ${newState}`); } }
    /** Updates the current global speed. */
    function setCurrentGlobalSpeed(speed) { const newSpeed = Math.max(0.25, Math.min(parseFloat(speed) || 1.0, 2.0)); currentGlobalSpeed = newSpeed; console.log(`StateManager: Global speed set to ${currentGlobalSpeed}`); }
    /** Updates the context start time after speed changes while playing. */
    function updateTimebaseForSpeedChange(newContextTime, newSourceTime) { playbackStartTimeContext = newContextTime; playbackStartSourceTime = newSourceTime; console.log(`StateManager: Timebase updated after speed change. New ContextStart: ${newContextTime?.toFixed(3)}, New SourceStart: ${newSourceTime.toFixed(3)}`); }
    /** Toggles the pitch linking state. */
    function togglePitchLink() { pitchLinked = !pitchLinked; console.log(`StateManager: Pitch link toggled to ${pitchLinked}`); return pitchLinked; }
    /** Sets the VAD model readiness flag. */
    function setVadModelReady(isReady) { vadModelReady = !!isReady; console.log(`StateManager: VAD model ready set to ${vadModelReady}`); }
    /** Finds the first available slot index or creates a new one. */
    function findFirstAvailableSlot() { const nullIndex = tracksData.findIndex(slot => slot === null); if (nullIndex !== -1) { console.log(`StateManager: Found available slot at index ${nullIndex}`); return nullIndex; } tracksData.push(null); const newIndex = tracksData.length - 1; console.log(`StateManager: Created new slot at index ${newIndex}`); return newIndex; }
    /** Creates and adds a new track state at the specified index. */
    function addNewTrack(trackIndex) { if (trackIndex < 0) { console.error("StateManager: Cannot add track with negative index."); return null; } if (trackIndex < tracksData.length && tracksData[trackIndex] !== null) { console.warn(`StateManager: Overwriting existing track data at index ${trackIndex}`); } const newTrack = createInitialTrackState(trackIndex); tracksData[trackIndex] = newTrack; console.log(`StateManager: Added new track state at index ${trackIndex}`); return newTrack; }
    /** Assigns a track index to a UI channel (Left or Right). */
    function assignChannel(side, trackIndex) { console.log(`StateManager: Assigning track index #${trackIndex} to ${side} channel.`); if (side === 'left') { leftChannelTrackIndex = trackIndex; } else if (side === 'right') { rightChannelTrackIndex = trackIndex; } else { console.warn(`StateManager: Invalid side "${side}" for channel assignment.`); return; } updateMultiChannelMode(); }
    /** Clears the track data slot at the given index (sets to null). */
    function clearTrackSlot(trackIndex) { if (trackIndex >= 0 && trackIndex < tracksData.length) { const track = tracksData[trackIndex]; if (track?.playTimeoutId) { clearTimeout(track.playTimeoutId); } console.log(`StateManager: Clearing track data at index ${trackIndex}.`); tracksData[trackIndex] = null; let refreshMulti = false; if (leftChannelTrackIndex === trackIndex) { leftChannelTrackIndex = -1; refreshMulti = true; } if (rightChannelTrackIndex === trackIndex) { rightChannelTrackIndex = -1; refreshMulti = true; } if (refreshMulti) { updateMultiChannelMode(); } } else { console.warn(`StateManager: Invalid index ${trackIndex} for clearTrackSlot.`); } }
    /** Swaps the track indices assigned to Left and Right channels. */
    function swapChannels() { if (leftChannelTrackIndex === -1 && rightChannelTrackIndex === -1) { console.warn("StateManager: Cannot swap empty channels."); return; } console.log(`StateManager: Swapping channels. Old Left: ${leftChannelTrackIndex}, Old Right: ${rightChannelTrackIndex}`); const tempIndex = leftChannelTrackIndex; leftChannelTrackIndex = rightChannelTrackIndex; rightChannelTrackIndex = tempIndex; console.log(`StateManager: Swap complete. New Left: ${leftChannelTrackIndex}, New Right: ${rightChannelTrackIndex}`); }
    /** Updates the multi-channel mode flag based on current L/R assignments. */
    function updateMultiChannelMode() { const wasActive = isMultiChannelModeActive; isMultiChannelModeActive = (leftChannelTrackIndex !== -1 && rightChannelTrackIndex !== -1); if (wasActive !== isMultiChannelModeActive) { console.log(`StateManager: Multi-channel mode changed to ${isMultiChannelModeActive}`); } return isMultiChannelModeActive; }
    // function setSoloedTrackIndex(index) { soloedTrackIndex = index; console.log(`StateManager: Soloed track index set to ${soloedTrackIndex}`); } // REMOVED
    /** Resets all state variables to their initial values. */
    function resetState() {
        console.log("StateManager: Resetting all state.");
        tracksData.forEach(track => { if (track?.playTimeoutId) clearTimeout(track.playTimeoutId); });
        tracksData = []; leftChannelTrackIndex = -1; rightChannelTrackIndex = -1; isMultiChannelModeActive = false;
        globalPlaybackState = 'stopped'; playbackStartTimeContext = null; playbackStartSourceTime = 0.0;
        currentGlobalSpeed = 1.0; pitchLinked = true; vadModelReady = false;
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
// --- /vibe-player/js/stateManager.js --- END MODIFIED FILE ---