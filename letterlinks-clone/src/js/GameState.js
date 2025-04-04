// File: src/js/GameState.js

/**
 * @fileoverview Defines the central state object for the application.
 * Holds all dynamic data related to the current game session, configuration,
 * UI state, and validation results. It acts as the single source of truth.
 * Other modules read from this state; GameManager coordinates updates.
 */

import { GAME_PHASES } from './Constants.js';

/**
 * The main application state object.
 * @property {string} currentPhase - Current phase of the game (from GAME_PHASES).
 * @property {object | null} currentConfig - The resolved configuration for the active challenge.
 * @property {object | null} boardLayout - Bonus square layout {'x,y': 'DL'|'TL'|'DW'|'TW'}. Null until generated.
 * @property {object} boardTiles - Tiles currently placed on the board {'x,y': { letter, value, isWildcard, displayLetter }}. Starts empty.
 * @property {object} poolTiles - Counts of available tiles in the pool {'A': count, 'B': count, ...}. Starts reflecting full challenge set.
 * @property {object | null} selectedTile - Data of the tile selected from the pool { letter, value }. Null if none selected.
 * @property {object} validationStatus - Results of board validation checks.
 * @property {boolean} validationStatus.isSubmittable - Whether the current board state meets submission criteria.
 * @property {boolean} validationStatus.needsCenterStar - True if contiguous block exists but doesn't include center.
 * @property {Array<string>} validationStatus.discontinuityCoords - Coordinate keys ("x,y") of tiles in invalid/disconnected groups.
 * @property {object} validationStatus.validWordMap - Map of word coordinate keys ("x1,y1-xN,yN") to boolean validity.
 * @property {number} finalScore - The score calculated after successful submission. Set only at GAME_OVER.
 * @property {number | null} startTimestamp - Timestamp (Date.now()) when the current attempt started. Null initially.
 * @property {object} transientState - Holds temporary UI-related state if needed (e.g., wildcard modal context).
 * @property {{x: number, y: number} | null} transientState.wildcardPlacementCoords - Coords where wildcard is being placed.
 */
const GameState = {
    currentPhase: GAME_PHASES.LOADING,
    currentConfig: null,
    boardLayout: null,
    boardTiles: {},
    poolTiles: {},
    selectedTile: null,
    validationStatus: {
        isSubmittable: false,
        needsCenterStar: false,
        discontinuityCoords: [],
        validWordMap: {},
    },
    finalScore: 0,
    startTimestamp: null,
    transientState: {
        wildcardPlacementCoords: null,
    },

    // --- State Reset Methods ---

    /**
     * Resets the state completely for a brand new challenge period.
     * Called typically during initialization if no saved state exists for the new challenge.
     */
    resetForNewChallenge() {
        // Keep currentPhase as it is (likely LOADING or just finished RESETTING)
        // currentConfig will be set by GameManager after ConfigLoader
        this.boardLayout = null;
        this.boardTiles = {};
        this.poolTiles = {}; // Will be initialized by TilePoolController
        this.selectedTile = null;
        this.validationStatus = {
            isSubmittable: false,
            needsCenterStar: false,
            discontinuityCoords: [],
            validWordMap: {},
        };
        this.finalScore = 0;
        this.startTimestamp = null; // Will be set when game actually starts
        this.transientState = {
            wildcardPlacementCoords: null,
        };
        console.log("GameState: Reset for New Challenge");
    },

    /**
     * Resets the state for restarting the *current* challenge attempt.
     * Keeps the config and boardLayout, but clears placed tiles, pool, score etc.
     * Called when the user manually resets the board.
     */
    resetForBoardAttempt() {
        // Keep currentPhase as it is (likely PLAYING)
        // Keep currentConfig
        // Keep boardLayout
        this.boardTiles = {};
        this.poolTiles = {}; // Will be re-initialized by TilePoolController based on config
        this.selectedTile = null;
        this.validationStatus = {
            isSubmittable: false,
            needsCenterStar: false,
            discontinuityCoords: [],
            validWordMap: {},
        };
        this.finalScore = 0; // Reset score for the attempt
        this.startTimestamp = null; // Will be set by GameManager for the new attempt
        this.transientState = {
            wildcardPlacementCoords: null,
        };
        console.log("GameState: Reset for Board Attempt");
    },

    /**
     * Restores state specifically loaded from localStorage.
     * @param {object} savedState - The state object loaded from LocalStorageManager.
     * @param {object} savedState.boardTiles
     * @param {number} savedState.startTimestamp
     */
    restoreAttemptState(savedState) {
        this.boardTiles = savedState.boardTiles || {};
        this.startTimestamp = savedState.startTimestamp || Date.now(); // Use saved time, or now if missing
        // Other state like pool, validation will be recalculated by GameManager after restore
        this.selectedTile = null;
        this.finalScore = 0;
        this.validationStatus = { isSubmittable: false, needsCenterStar: false, discontinuityCoords: [], validWordMap: {} };
        this.transientState = { wildcardPlacementCoords: null };
        console.log("GameState: Restored Attempt State");
    }
};

export default GameState;

// File: src/js/GameState.js
