// File: src/js/ConfigLoader.js

/**
 * @fileoverview Loads challenge definitions, determines the current active challenge,
 * resolves necessary data (tile values, theme), and provides the complete
 * configuration object for the current game session.
 */

import { challenges } from '../data/challenges.js'; // Assuming challenges are defined here
import { dictionaryPathMap } from '../data/dictionaries/dictionary_paths.js'; // Assuming paths are mapped here
import { themeMap } from '../data/themes/theme_map.js'; // Assuming themes are mapped here
import { tileSetMap } from '../data/tileSets/tile_set_map.js'; // Assuming tile sets (values) are mapped here

import {
    DEFAULT_BOARD_SIZE,
    DEFAULT_BONUS_COUNTS,
    DEFAULT_MIN_BONUS_DISTANCE,
    DEFAULT_TOTAL_TILES_TARGET,
    DEFAULT_DICTIONARY_ID,
    DEFAULT_TILE_SET_ID,
    DEFAULT_THEME_ID,
    DEFAULT_WORD_FILTER_OPTIONS
} from './Constants.js';

// --- Helper Functions ---

/**
 * Gets the week number of the year for a given date.
 * Handles week starting on Monday (ISO 8601).
 * @param {Date} date The date object.
 * @returns {number} The ISO week number.
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    // Get first day of year
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Finds the active challenge based on current date and challenge rules.
 * Currently supports 'WEEK_OF_YEAR' rule type.
 * @param {Date} currentDate The current date object.
 * @returns {object | null} The active challenge definition object or null.
 */
function findActiveChallengeDefinition(currentDate) {
    const currentYear = currentDate.getFullYear();
    const currentWeek = getWeekNumber(currentDate);

    // Simple rule: only active on odd weeks
    if (currentWeek % 2 === 0) {
        console.log(`Current week (${currentWeek}) is even. No challenge active.`);
        return null;
    }

    // Find a challenge matching the rule (simplistic: assume one rule type for now)
    // In a real scenario, you might need more complex matching or a lookup
    const activeChallenge = challenges.find(challenge => {
        // Example rule matching (can be expanded)
        if (challenge.periodRule && challenge.periodRule.type === 'WEEK_OF_YEAR') {
            return challenge.periodRule.year === currentYear && challenge.periodRule.week === currentWeek;
        }
        // Add other rule types here (e.g., specific date range)
        return false; // Default: no match if rule doesn't fit
    });

    if (activeChallenge) {
        console.log(`Found active challenge for week ${currentWeek}, year ${currentYear}: ID ${activeChallenge.id}`);
        return activeChallenge;
    } else {
        // If no specific challenge defined for this odd week, maybe select one pseudo-randomly?
        // For now, let's return null if no explicit match.
        console.log(`No specific challenge defined for week ${currentWeek}, year ${currentYear}.`);
        // To implement PRNG selection:
        // 1. Filter challenges suitable for random selection (e.g., those without specific periodRules).
        // 2. Use `Utils.createPRNG(currentYear + '-' + currentWeek)` to pick one from the filtered list.
        // Let's keep it simple: No fallback random selection for now.
        return null;
    }
}

/**
 * Creates a default configuration object.
 * Used when no active challenge is found or loading fails.
 * @returns {object} A default configuration object.
 */
function createDefaultConfig() {
    console.warn("Using default configuration.");
    const dictionaryId = DEFAULT_DICTIONARY_ID;
    const tileSetId = DEFAULT_TILE_SET_ID;
    const themeId = DEFAULT_THEME_ID;

    return {
        id: 'default',
        boardSize: DEFAULT_BOARD_SIZE,
        totalTiles: DEFAULT_TOTAL_TILES_TARGET + 2, // Include wildcards in total
        bonusRules: {
            counts: { ...DEFAULT_BONUS_COUNTS },
            minDistance: DEFAULT_MIN_BONUS_DISTANCE
        },
        bonusSeed: 'default-bonus-seed-' + Date.now(), // Non-deterministic seed for default
        tileSeed: 'default-tile-seed-' + Date.now(), // Non-deterministic seed for default
        dictionary: {
            id: dictionaryId,
            path: dictionaryPathMap[dictionaryId] || null
        },
        theme: {
            id: themeId,
            data: themeMap[themeId] || themeMap['default'] || {} // Fallback to default theme data
        },
        tileSet: {
            id: tileSetId,
            values: tileSetMap[tileSetId]?.values || {}, // Extract values map
            // frequencies needed? Only if gen logic uses them. Let's assume values are enough.
        },
        wordFilterOptions: { ...DEFAULT_WORD_FILTER_OPTIONS },
        isActiveChallenge: false // Flag indicating this is not a scheduled challenge
    };
}


// --- Public Interface ---

/**
 * Determines the active challenge (if any) and returns its fully resolved configuration.
 * If no challenge is active or found, returns a default configuration.
 * This function is synchronous as it relies on pre-imported data modules.
 * @returns {object} The resolved configuration object for the current session.
 *                   Includes boardSize, totalTiles, bonusRules, bonusSeed, tileSeed,
 *                   dictionary{id, path}, theme{id, data}, tileSet{id, values},
 *                   wordFilterOptions, isActiveChallenge flag.
 */
export function getCurrentChallengeConfig() {
    const now = new Date();
    let challengeDefinition = findActiveChallengeDefinition(now);
    let config;

    if (challengeDefinition) {
        try {
            const dictionaryId = challengeDefinition.dictionaryId || DEFAULT_DICTIONARY_ID;
            const themeId = challengeDefinition.themeId || DEFAULT_THEME_ID;
            const tileSetId = challengeDefinition.tileSetId || DEFAULT_TILE_SET_ID;

            config = {
                id: challengeDefinition.id,
                boardSize: challengeDefinition.boardSize || DEFAULT_BOARD_SIZE,
                totalTiles: challengeDefinition.totalTiles ? challengeDefinition.totalTiles + 2 : DEFAULT_TOTAL_TILES_TARGET + 2,
                bonusRules: {
                    counts: { ...DEFAULT_BONUS_COUNTS, ...(challengeDefinition.bonusRules?.counts || {}) },
                    minDistance: challengeDefinition.bonusRules?.minDistance ?? DEFAULT_MIN_BONUS_DISTANCE
                },
                bonusSeed: challengeDefinition.bonusSeed || `bonus-${challengeDefinition.id}`, // Ensure seed exists
                tileSeed: challengeDefinition.tileSeed || `tile-${challengeDefinition.id}`, // Ensure seed exists
                dictionary: {
                    id: dictionaryId,
                    path: dictionaryPathMap[dictionaryId] || null
                },
                theme: {
                    id: themeId,
                    data: themeMap[themeId] || themeMap['default'] || {} // Fallback required
                },
                tileSet: {
                    id: tileSetId,
                    values: tileSetMap[tileSetId]?.values || {} // Ensure values exist
                },
                wordFilterOptions: {
                    ...DEFAULT_WORD_FILTER_OPTIONS,
                    ...(challengeDefinition.wordFilterOptions || {})
                },
                isActiveChallenge: true
            };

            // Validate essential parts
            if (!config.dictionary.path) {
                throw new Error(`Dictionary path not found for ID: ${dictionaryId}`);
            }
            if (!config.tileSet.values || Object.keys(config.tileSet.values).length === 0) {
                 throw new Error(`Tile set values not found for ID: ${tileSetId}`);
            }

        } catch (error) {
            console.error("Error processing challenge definition:", challengeDefinition.id, error);
            config = createDefaultConfig(); // Fallback to default on error
        }

    } else {
        // No active challenge found for the current period
        config = createDefaultConfig();
    }

    if (!config.theme.data || Object.keys(config.theme.data).length === 0) {
         console.error("Default theme data seems missing! Check theme_map.js and theme_default.js");
         config.theme.data = {}; // Prevent crashes later
    }


    console.log("Using configuration:", JSON.stringify(config, null, 2)); // Deep log for debugging
    return config;
}


/**
 * Calculates the timestamp for the next challenge reset (e.g., next midnight or next Monday).
 * Needs refinement based on the exact challenge scheduling rules (daily vs weekly).
 * @param {object} currentConfig The currently loaded configuration.
 * @returns {number} Timestamp (ms since epoch) of the next reset.
 */
export function calculateNextResetTimestamp(currentConfig) {
    // Placeholder: Assumes DAILY midnight reset for countdown simplicity
    // Needs to be adapted for actual challenge schedule (e.g., weekly on Monday)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Set to midnight of the *next* day
    console.log(`Next reset calculated for: ${tomorrow.toISOString()}`);
    return tomorrow.getTime();

    // TODO: Implement logic based on currentConfig.periodRule or a global schedule
    // Example for Weekly (Monday 00:00):
    // const currentDay = now.getDay(); // 0=Sun, 1=Mon,... 6=Sat
    // const daysUntilMonday = (currentDay === 0) ? 1 : (8 - currentDay); // Days to add to get to next Monday
    // const nextMonday = new Date(now);
    // nextMonday.setDate(now.getDate() + daysUntilMonday);
    // nextMonday.setHours(0, 0, 0, 0);
    // return nextMonday.getTime();
}


// File: src/js/ConfigLoader.js
