// File: src/js/LocalStorageManager.js

/**
 * @fileoverview Manages all interactions with the browser's localStorage.
 * Handles saving/loading game state attempts, game history, settings,
 * achievements, and dictionary cache. Includes basic error handling.
 */

import { LS_KEYS, GAME_HISTORY_LIMIT } from './Constants.js';

// --- Helper Functions ---

/**
 * Safely retrieves an item from localStorage.
 * @param {string} key The key to retrieve.
 * @returns {string | null} The retrieved value or null if not found or error.
 */
function getItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.error(`Error reading localStorage key "${key}":`, error);
        return null;
    }
}

/**
 * Safely sets an item in localStorage.
 * @param {string} key The key to set.
 * @param {string} value The value to store.
 * @returns {boolean} True if successful, false otherwise.
 */
function setItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
        // Possible QuotaExceededError
        alert("Could not save game progress. Local storage might be full."); // Basic user feedback
        return false;
    }
}

/**
 * Safely removes an item from localStorage.
 * @param {string} key The key to remove.
 */
function removeItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error(`Error removing localStorage key "${key}":`, error);
    }
}

/**
 * Safely parses JSON from a string.
 * @param {string | null} jsonString The string to parse.
 * @returns {any | null} The parsed object or null if parsing fails or input is null.
 */
function safeJsonParse(jsonString) {
    if (jsonString === null) return null;
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error parsing JSON from localStorage:", error);
        return null;
    }
}

// --- Current Attempt State ---

/**
 * Saves the current game attempt state (board tiles, start time).
 * @param {string} challengeId Identifier for the current challenge.
 * @param {object} boardTiles The current state of tiles on the board.
 * @param {number} startTimestamp The timestamp when the current attempt started.
 */
export function saveCurrentAttempt(challengeId, boardTiles, startTimestamp) {
    if (!challengeId) return;
    const key = `${LS_KEYS.CURRENT_ATTEMPT_PREFIX}${challengeId}`;
    const state = { boardTiles, startTimestamp };
    setItem(key, JSON.stringify(state));
    // console.log("Saved attempt state for challenge:", challengeId); // Debug
}

/**
 * Loads the saved game attempt state for a specific challenge.
 * @param {string} challengeId Identifier for the challenge.
 * @returns {{boardTiles: object, startTimestamp: number} | null} The saved state or null if not found/invalid.
 */
export function loadCurrentAttempt(challengeId) {
    if (!challengeId) return null;
    const key = `${LS_KEYS.CURRENT_ATTEMPT_PREFIX}${challengeId}`;
    const jsonString = getItem(key);
    const state = safeJsonParse(jsonString);

    // Basic validation
    if (state && typeof state.boardTiles === 'object' && typeof state.startTimestamp === 'number') {
        // console.log("Loaded attempt state for challenge:", challengeId); // Debug
        return state;
    }
    if (jsonString) {
        // Clear invalid data if found
        console.warn("Clearing invalid saved attempt state for challenge:", challengeId);
        removeItem(key);
    }
    return null;
}

/**
 * Clears the saved game attempt state for a specific challenge.
 * @param {string} challengeId Identifier for the challenge.
 */
export function clearCurrentAttempt(challengeId) {
    if (!challengeId) return;
    const key = `${LS_KEYS.CURRENT_ATTEMPT_PREFIX}${challengeId}`;
    removeItem(key);
    // console.log("Cleared attempt state for challenge:", challengeId); // Debug
}

// --- Game History ---

/**
 * Saves a completed game result to the history.
 * Manages history size limit.
 * @param {object} resultData - The game result object.
 * @param {string} resultData.challengeId
 * @param {number} resultData.startTimestamp
 * @param {number} resultData.endTimestamp
 * @param {number} resultData.finalScore
 * @param {object} resultData.finalBoardState - Snapshot of boardTiles and boardLayout.
 */
export function saveGameResult(resultData) {
    const history = loadGameHistory();
    history.unshift(resultData); // Add new result to the beginning

    // Limit history size
    if (history.length > GAME_HISTORY_LIMIT) {
        history.length = GAME_HISTORY_LIMIT; // Truncate older entries
    }

    setItem(LS_KEYS.GAME_HISTORY, JSON.stringify(history));
}

/**
 * Loads the game history array.
 * @returns {object[]} An array of game result objects, newest first. Returns empty array on error/not found.
 */
export function loadGameHistory() {
    const jsonString = getItem(LS_KEYS.GAME_HISTORY);
    const history = safeJsonParse(jsonString);
    return Array.isArray(history) ? history : [];
}

// --- Settings ---

/**
 * Saves a specific setting value.
 * Settings are stored in a single object under LS_KEYS.SETTINGS.
 * @param {string} settingKey The key of the setting within the settings object.
 * @param {any} value The value to save (must be JSON-serializable).
 */
export function saveSetting(settingKey, value) {
    const settings = loadSettings();
    settings[settingKey] = value;
    setItem(LS_KEYS.SETTINGS, JSON.stringify(settings));
}

/**
 * Loads a specific setting value.
 * @param {string} settingKey The key of the setting to retrieve.
 * @param {any} [defaultValue=undefined] The value to return if the setting is not found.
 * @returns {any} The retrieved value or the default value.
 */
export function loadSetting(settingKey, defaultValue = undefined) {
    const settings = loadSettings();
    return settings.hasOwnProperty(settingKey) ? settings[settingKey] : defaultValue;
}

/**
 * Loads the entire settings object.
 * @returns {object} The settings object. Returns empty object on error/not found.
 */
function loadSettings() {
    const jsonString = getItem(LS_KEYS.SETTINGS);
    const settings = safeJsonParse(jsonString);
    return (settings && typeof settings === 'object') ? settings : {};
}

// --- Achievements ---

/**
 * Saves the entire achievements status object.
 * @param {object} achievementsData Object mapping achievement IDs to status (e.g., { ACHIEVE_ID: true/timestamp }).
 */
export function saveAchievements(achievementsData) {
    if (achievementsData && typeof achievementsData === 'object') {
        setItem(LS_KEYS.ACHIEVEMENTS, JSON.stringify(achievementsData));
    }
}

/**
 * Loads the achievements status object.
 * @returns {object} The saved achievements object, or empty object if not found/invalid.
 */
export function loadAchievements() {
    const jsonString = getItem(LS_KEYS.ACHIEVEMENTS);
    const achievements = safeJsonParse(jsonString);
    return (achievements && typeof achievements === 'object') ? achievements : {};
}

// --- Dictionary Cache ---

/**
 * Saves a parsed dictionary Set to localStorage.
 * Serializes the Set to an Array for storage.
 * @param {string} dictionaryPath The path (used as key, should include version).
 * @param {Set<string>} dictionarySetObject The parsed dictionary Set.
 */
export function saveDictionaryCache(dictionaryPath, dictionarySetObject) {
    if (!dictionaryPath || !(dictionarySetObject instanceof Set)) return;
    const key = `${LS_KEYS.DICTIONARY_CACHE_PREFIX}${dictionaryPath}`;
    try {
        const arrayToStore = Array.from(dictionarySetObject);
        setItem(key, JSON.stringify(arrayToStore));
        // console.log(`Cached dictionary: ${dictionaryPath}`); // Debug
    } catch (error) {
        console.error(`Error saving dictionary cache for "${dictionaryPath}":`, error);
        // Avoid saving partial/corrupt data if serialization fails (unlikely for string array)
        removeItem(key);
    }
}

/**
 * Loads a dictionary Set from the localStorage cache.
 * Deserializes the stored Array back into a Set.
 * @param {string} dictionaryPath The path (used as key, should include version).
 * @returns {Set<string> | null} The reconstructed Set or null if not found/invalid.
 */
export function loadDictionaryCache(dictionaryPath) {
    if (!dictionaryPath) return null;
    const key = `${LS_KEYS.DICTIONARY_CACHE_PREFIX}${dictionaryPath}`;
    const jsonString = getItem(key);
    const array = safeJsonParse(jsonString);

    if (Array.isArray(array)) {
        try {
            // console.log(`Loaded dictionary from cache: ${dictionaryPath}`); // Debug
            return new Set(array);
        } catch (error) {
            console.error(`Error reconstructing Set from cached dictionary "${dictionaryPath}":`, error);
            // Clear potentially corrupt cache entry
            removeItem(key);
            return null;
        }
    }
    if (jsonString) {
        // Clear invalid non-array data if found
         console.warn("Clearing invalid dictionary cache for:", dictionaryPath);
         removeItem(key);
    }
    return null;
}


// File: src/js/LocalStorageManager.js
