// File: src/js/AchievementManager.js

/**
 * @fileoverview Manages tracking and checking player achievements.
 * Loads initial state from localStorage, updates based on game events,
 * and provides information about newly unlocked achievements.
 */

import * as LocalStorage from './LocalStorageManager.js';
import { BONUS_TYPES } from './Constants.js'; // If needed for Bonus Hunter

// --- Achievement Definitions ---

/**
 * Enum defining unique IDs for each achievement.
 * @enum {string}
 */
export const ACHIEVE_ID = {
    FIRST_GAME: 'FIRST_GAME',
    SCORE_BREAKER_200: 'SCORE_BREAKER_200',
    HIGH_SCORER_500: 'HIGH_SCORER_500',
    WORD_WHIZ_50: 'WORD_WHIZ_50',
    LEXICOGRAPHER_100: 'LEXICOGRAPHER_100',
    BONUS_HUNTER: 'BONUS_HUNTER',
    WILD_THING: 'WILD_THING',
    // Speed achievements
    SPEED_THINKER_200_90S: 'SPEED_THINKER_200_90S',
    LIGHTNING_LINKS_400_180S: 'LIGHTNING_LINKS_400_180S',
    BLITZ_FINISH_30S: 'BLITZ_FINISH_30S',
    // Add more IDs here as needed
};

/**
 * Optional: Descriptions or names for achievements (useful for UI).
 */
export const ACHIEVEMENT_DETAILS = {
    [ACHIEVE_ID.FIRST_GAME]: { name: "First Game", description: "Complete your first game." },
    [ACHIEVE_ID.SCORE_BREAKER_200]: { name: "Score Breaker", description: "Score over 200 points in a single game." },
    [ACHIEVE_ID.HIGH_SCORER_500]: { name: "High Scorer", description: "Score over 500 points in a single game." },
    [ACHIEVE_ID.WORD_WHIZ_50]: { name: "Word Whiz", description: "Score 50+ points with a single word." },
    [ACHIEVE_ID.LEXICOGRAPHER_100]: { name: "Lexicographer", description: "Score 100+ points with a single word." },
    [ACHIEVE_ID.BONUS_HUNTER]: { name: "Bonus Hunter", description: "Use DL, TL, DW, and TW squares in one game." },
    [ACHIEVE_ID.WILD_THING]: { name: "Wild Thing", description: "Use both wildcard tiles in one game." },
    [ACHIEVE_ID.SPEED_THINKER_200_90S]: { name: "Quick Thinker", description: "Score 200+ points in under 90 seconds." },
    [ACHIEVE_ID.LIGHTNING_LINKS_400_180S]: { name: "Lightning Links", description: "Score 400+ points in under 3 minutes." },
    [ACHIEVE_ID.BLITZ_FINISH_30S]: { name: "Blitz Finish", description: "Complete a game within 30 seconds." },
};


// --- Module State ---

/** @type {object} Holds the current status of all achievements. Loaded from localStorage. Keys are ACHIEVE_ID, values are boolean (true if unlocked). */
let achievementStatus = {};

/** @type {Set<string>} Tracks achievements unlocked *during the current game session*. Cleared on init. */
let newlyUnlocked = new Set();

/** @type {Set<string>} Tracks bonus types used *during the current game attempt*. Used for BONUS_HUNTER. Cleared on attempt start. */
let bonusesUsedThisAttempt = new Set();

/** @type {number} Tracks wildcards used *during the current game attempt*. Used for WILD_THING. Cleared on attempt start. */
let wildcardsUsedThisAttempt = 0;


// --- Public Methods ---

/**
 * Initializes the achievement manager by loading status from localStorage.
 * Should be called once when the application starts.
 */
export function init() {
    achievementStatus = LocalStorage.loadAchievements();
    newlyUnlocked = new Set(); // Reset session tracking
    // Reset attempt-specific trackers as well (will be reset again on game start/reset)
    resetAttemptTracking();
    console.log("AchievementManager initialized. Loaded status:", achievementStatus);
}

/**
 * Resets trackers that are specific to a single game attempt.
 * Should be called when a new game starts or the board is reset.
 */
export function resetAttemptTracking() {
    bonusesUsedThisAttempt = new Set();
    wildcardsUsedThisAttempt = 0;
    // newlyUnlocked is NOT reset here, it tracks the whole session until next init()
    console.log("AchievementManager: Attempt tracking reset.");
}

/**
 * Checks if a specific achievement has been unlocked previously.
 * @param {string} achievementId - The ID from ACHIEVE_ID.
 * @returns {boolean} True if the achievement is marked as unlocked.
 */
export function isUnlocked(achievementId) {
    return !!achievementStatus[achievementId];
}

/**
 * Checks game events and state to see if any achievements are newly unlocked.
 * Updates internal status and tracks newly unlocked ones for the session.
 * Saves updated status to localStorage.
 * @param {string} eventName - The type of event (e.g., 'GAME_END', 'TILE_PLACED', 'WORD_SCORED').
 * @param {object} eventData - Data associated with the event (depends on eventName).
 *   - For 'GAME_END': { finalScore, duration, maxWordScore }
 *   - For 'TILE_PLACED': { tileData, bonusType } (bonusType can be null)
 *   - For 'WORD_SCORED': { score, wordLength } // Note: WORD_SCORED events might be redundant if checked at GAME_END
 */
export function checkAchievements(eventName, eventData) {
    let stateChanged = false;

    /** Helper to mark an achievement as unlocked */
    const unlock = (id) => {
        if (!achievementStatus[id]) {
            console.log(`Achievement Unlocked: ${ACHIEVEMENT_DETAILS[id]?.name || id}`);
            achievementStatus[id] = true; // Mark as unlocked
            newlyUnlocked.add(id);      // Track for current session feedback
            stateChanged = true;
        }
    };

    // --- Check based on Event Type ---

    if (eventName === 'TILE_PLACED' && eventData) {
        const { tileData, bonusType } = eventData;

        // Track Bonus Hunter progress
        if (bonusType && bonusType !== BONUS_TYPES.STAR) {
            bonusesUsedThisAttempt.add(bonusType);
        }

        // Track Wild Thing progress
        if (tileData?.isWildcard) {
            wildcardsUsedThisAttempt++;
        }
    }

    // --- Checks primarily done at Game End ---
    if (eventName === 'GAME_END' && eventData) {
        const { finalScore, duration, maxWordScore } = eventData;

        // First Game (Assuming GameManager tracks gamesPlayed or checks history)
        // This logic might be better placed directly in GameManager confirming submission
        // unlock(ACHIEVE_ID.FIRST_GAME); // Example: unlock based on external flag

        // Score thresholds
        if (finalScore >= 200) unlock(ACHIEVE_ID.SCORE_BREAKER_200);
        if (finalScore >= 500) unlock(ACHIEVE_ID.HIGH_SCORER_500);

        // Single word score thresholds
        if (maxWordScore >= 50) unlock(ACHIEVE_ID.WORD_WHIZ_50);
        if (maxWordScore >= 100) unlock(ACHIEVE_ID.LEXICOGRAPHER_100);

        // Bonus Hunter check
        if (bonusesUsedThisAttempt.has(BONUS_TYPES.DL) &&
            bonusesUsedThisAttempt.has(BONUS_TYPES.TL) &&
            bonusesUsedThisAttempt.has(BONUS_TYPES.DW) &&
            bonusesUsedThisAttempt.has(BONUS_TYPES.TW)) {
            unlock(ACHIEVE_ID.BONUS_HUNTER);
        }

        // Wild Thing check
        if (wildcardsUsedThisAttempt >= 2) {
            unlock(ACHIEVE_ID.WILD_THING);
        }

        // Speed achievements
        if (duration <= 30000) unlock(ACHIEVE_ID.BLITZ_FINISH_30S);
        if (finalScore >= 200 && duration <= 90000) unlock(ACHIEVE_ID.SPEED_THINKER_200_90S);
        if (finalScore >= 400 && duration <= 180000) unlock(ACHIEVE_ID.LIGHTNING_LINKS_400_180S);
    }

    // --- Save if changed ---
    if (stateChanged) {
        LocalStorage.saveAchievements(achievementStatus);
    }
}

/**
 * Gets the list of achievements unlocked during the current game session.
 * @returns {string[]} Array of newly unlocked achievement IDs.
 */
export function getNewlyUnlocked() {
    return Array.from(newlyUnlocked);
}

/**
 * Clears the list of newly unlocked achievements for the session.
 * Typically called after displaying them to the user (e.g., on Game Over screen close).
 */
export function clearNewlyUnlocked() {
    newlyUnlocked.clear();
}

/**
 * Gets the complete status object for all achievements.
 * @returns {object} The internal achievementStatus object.
 */
export function getAllAchievementsStatus() {
    return { ...achievementStatus }; // Return a copy
}


// File: src/js/AchievementManager.js