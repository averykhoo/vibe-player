// File: src/data/challenges.js

/**
 * @fileoverview Defines the list of available challenges.
 * Each challenge specifies its rules, timing, board setup, content seeds, and assets.
 * ConfigLoader uses this list to determine the currently active challenge.
 */

import {
    DEFAULT_BOARD_SIZE,
    DEFAULT_BONUS_COUNTS,
    DEFAULT_MIN_BONUS_DISTANCE,
    DEFAULT_TOTAL_TILES_TARGET,
    DEFAULT_DICTIONARY_ID,
    DEFAULT_TILE_SET_ID,
    DEFAULT_THEME_ID,
    DEFAULT_WORD_FILTER_OPTIONS
} from '../js/Constants.js'; // Import defaults for easier definition

/**
 * @typedef {object} ChallengePeriodRule
 * @property {'WEEK_OF_YEAR'} type - The type of rule for determining activation.
 * @property {number} week - The ISO week number (1-53).
 * @property {number} year - The full year.
 * @property {boolean} [isOddWeekOnly=true] - If true, only active if the week number is odd.
 */

/**
 * @typedef {object} ChallengeDefinition
 * @property {string} id - Unique identifier for the challenge (e.g., "wk-YYYY-WW").
 * @property {ChallengePeriodRule | null} periodRule - Rule defining when this challenge is active.
 * @property {number} [boardSize=DEFAULT_BOARD_SIZE] - Dimension of the board (NxN).
 * @property {number} [totalTiles=(DEFAULT_TOTAL_TILES_TARGET + 2)] - Total tiles including wildcards (unless wildcards=0).
 * @property {object} [bonusRules] - Rules for bonus square generation.
 * @property {object} [bonusRules.counts=DEFAULT_BONUS_COUNTS] - Counts of each bonus type.
 * @property {number} [bonusRules.minDistance=DEFAULT_MIN_BONUS_DISTANCE] - Min distance between bonuses.
 * @property {string} bonusSeed - Seed for PRNG used in bonus layout generation.
 * @property {string} tileSeed - Seed for PRNG used in tile list generation.
 * @property {number} [wildcards=2] - Number of wildcards to include (0 or 2). Affects tile generation target.
 * @property {string} [dictionaryId=DEFAULT_DICTIONARY_ID] - ID mapping to dictionary path.
 * @property {string} [themeId=DEFAULT_THEME_ID] - ID mapping to theme data.
 * @property {string} [tileSetId=DEFAULT_TILE_SET_ID] - ID mapping to tile set data (values).
 * @property {object} [wordFilterOptions=DEFAULT_WORD_FILTER_OPTIONS] - Options for `generateTileListFromWords`.
 */

/**
 * Array containing all defined challenges. ConfigLoader finds the active one.
 * Assumes odd weeks only for these examples in 2024.
 * @type {ChallengeDefinition[]}
 */
export const challenges = [
    // --- 20 Example Challenges for 2024 Odd Weeks ---

    // 1. Week 1 - Standard Start
    {
        id: "wk-2024-01", periodRule: { type: 'WEEK_OF_YEAR', week: 1, year: 2024 },
        bonusSeed: "B0N-WK1-STDa-K9sJ", tileSeed: "T1L-WK1-STDb-LpQ2",
    },
    // 2. Week 3 - Bonus Bonanza
    {
        id: "wk-2024-03", periodRule: { type: 'WEEK_OF_YEAR', week: 3, year: 2024 },
        bonusRules: { counts: { DL: 5, TL: 3, DW: 5, TW: 3 }, minDistance: 1 },
        bonusSeed: "B0N-WK3-BONa-3zRt", tileSeed: "T1L-WK3-BONb-aQ9p",
    },
    // 3. Week 5 - The Void (Fewer Bonuses)
    {
        id: "wk-2024-05", periodRule: { type: 'WEEK_OF_YEAR', week: 5, year: 2024 },
        bonusRules: { counts: { DL: 2, TL: 1, DW: 2, TW: 1 }, minDistance: 1 },
        bonusSeed: "B0N-WK5-VOIDa-Mn7x", tileSeed: "T1L-WK5-VOIDb-Gh3a",
    },
    // 4. Week 7 - Letter Luck (More Letter Bonuses)
    {
        id: "wk-2024-07", periodRule: { type: 'WEEK_OF_YEAR', week: 7, year: 2024 },
        bonusRules: { counts: { DL: 6, TL: 4, DW: 2, TW: 1 }, minDistance: 1 },
        bonusSeed: "B0N-WK7-LETa-F5jY", tileSeed: "T1L-WK7-LETb-kL8s",
    },
    // 5. Week 9 - Small Board Blitz
    {
        id: "wk-2024-09", periodRule: { type: 'WEEK_OF_YEAR', week: 9, year: 2024 },
        boardSize: 4, totalTiles: 27, // 25 letters + 2 wildcards
        bonusRules: { counts: { DL: 3, TL: 1, DW: 3, TW: 1 }, minDistance: 1 },
        bonusSeed: "B0N-WK9-SMLa-Cv2b", tileSeed: "T1L-WK9-SMLb-Nm0x",
        wordFilterOptions: { minLength: 2, maxLength: 7 }
    },
    // 6. Week 11 - Word Wealth (More Word Bonuses)
    {
        id: "wk-2024-11", periodRule: { type: 'WEEK_OF_YEAR', week: 11, year: 2024 },
        bonusRules: { counts: { DL: 2, TL: 1, DW: 6, TW: 4 }, minDistance: 1 },
        bonusSeed: "B0N-WK11-WRDa-1qW2", tileSeed: "T1L-WK11-WRDb-eR4t",
    },
    // 7. Week 13 - Sparse Start (Increased Min Distance)
    {
        id: "wk-2024-13", periodRule: { type: 'WEEK_OF_YEAR', week: 13, year: 2024 },
        bonusRules: { counts: { DL: 4, TL: 2, DW: 4, TW: 2 }, minDistance: 2 }, // Increased distance
        bonusSeed: "B0N-WK13-SPRഘാ-Ty6u", tileSeed: "T1L-WK13-SPRb-iO8p",
    },
    // 8. Week 15 - Short Word Special
    {
        id: "wk-2024-15", periodRule: { type: 'WEEK_OF_YEAR', week: 15, year: 2024 },
        totalTiles: 42, // More tiles to allow short word chains
        bonusSeed: "B0N-WK15-SHRa-As9d", tileSeed: "T1L-WK15-SHRb-FghJ",
        wordFilterOptions: { minLength: 2, maxLength: 5 } // Generate pool from shorter words
    },
    // 9. Week 17 - No Wildcards
    {
        id: "wk-2024-17", periodRule: { type: 'WEEK_OF_YEAR', week: 17, year: 2024 },
        totalTiles: 35, wildcards: 0, // Target 35 letters, explicitly 0 wildcards
        bonusSeed: "B0N-WK17-NOWa-Kl3m", tileSeed: "T1L-WK17-NOWb-N5zQ",
    },
    // 10. Week 19 - Standard Remix
    {
        id: "wk-2024-19", periodRule: { type: 'WEEK_OF_YEAR', week: 19, year: 2024 },
        bonusSeed: "B0N-WK19-REMa-WsX7", tileSeed: "T1L-WK19-REMb-EdC9",
        // Uses all default rules but with different seeds than week 1
    },
    // 11. Week 21 - High Value Hunt (More JQXZ potential)
    {
        id: "wk-2024-21", periodRule: { type: 'WEEK_OF_YEAR', week: 21, year: 2024 },
        bonusSeed: "B0N-WK21-HVHa-RfV5", tileSeed: "T1L-WK21-HVHb-TgB6",
        // Note: Tile generation needs logic to slightly boost chance of JQXZ, or filter words containing them.
        // Easiest: Just rely on PRNG with standard word list, it's random chance.
        wordFilterOptions: { minLength: 4, maxLength: 9 } // Slightly longer words might increase chance
    },
    // 12. Week 23 - Fewer Tiles, More Strategy
    {
        id: "wk-2024-23", periodRule: { type: 'WEEK_OF_YEAR', week: 23, year: 2024 },
        totalTiles: 32, // Less room for error (30 letters + 2 wildcards)
        bonusSeed: "B0N-WK23-FEWa-YhN3", tileSeed: "T1L-WK23-FEWb-UjM4",
    },
    // 13. Week 25 - Big Board Build (Example - Requires UI/Logic Support)
    {
        id: "wk-2024-25", periodRule: { type: 'WEEK_OF_YEAR', week: 25, year: 2024 },
        boardSize: 6, // Requires CSS/JS to handle size 6
        totalTiles: 47, // 45 letters + 2 wildcards
        bonusRules: { counts: { DL: 6, TL: 3, DW: 6, TW: 3 }, minDistance: 1 }, // Scaled up bonuses
        bonusSeed: "B0N-WK25-BIGa-IkL7", tileSeed: "T1L-WK25-BIGb-OpQ8",
    },
    // 14. Week 27 - Standard Redux (Covered by earlier entry, example of re-using a type)
     {
         id: "wk-2024-27-redux", periodRule: { type: 'WEEK_OF_YEAR', week: 27, year: 2024 }, // Duplicate rule, ConfigLoader needs to pick one deterministically
         bonusSeed: "B0N-WK27-RDXa-KsLd", tileSeed: "T1L-WK27-RDXb-MnOp",
     },
    // 15. Week 35 - Balanced Bonuses
    {
        id: "wk-2024-35", periodRule: { type: 'WEEK_OF_YEAR', week: 35, year: 2024 },
        bonusRules: { counts: { DL: 4, TL: 2, DW: 4, TW: 2 }, minDistance: 1 }, // Standard counts
        bonusSeed: "B0N-WK35-BALa-ZaX1", tileSeed: "T1L-WK35-BALb-CvB2",
    },
    // 16. Week 37 - Max Length 6
    {
        id: "wk-2024-37", periodRule: { type: 'WEEK_OF_YEAR', week: 37, year: 2024 },
        bonusSeed: "B0N-WK37-ML6a-GhJ3", tileSeed: "T1L-WK37-ML6b-KlM4",
        wordFilterOptions: { minLength: 2, maxLength: 6 }
    },
    // 17. Week 39 - Minimal Bonuses
     {
        id: "wk-2024-39", periodRule: { type: 'WEEK_OF_YEAR', week: 39, year: 2024 },
        bonusRules: { counts: { DL: 1, TL: 1, DW: 1, TW: 1 }, minDistance: 2 }, // Very few, spaced out
        bonusSeed: "B0N-WK39-MINa-NpQ5", tileSeed: "T1L-WK39-MINb-RtY6",
    },
    // 18. Week 41 - Standard Variant C
    {
        id: "wk-2024-41", periodRule: { type: 'WEEK_OF_YEAR', week: 41, year: 2024 },
        bonusSeed: "B0N-WK41-STDc-UjI7", tileSeed: "T1L-WK41-STDd-oLp8",
    },
    // 19. Week 43 - Focus on TW/TL
    {
        id: "wk-2024-43", periodRule: { type: 'WEEK_OF_YEAR', week: 43, year: 2024 },
        bonusRules: { counts: { DL: 2, TL: 4, DW: 2, TW: 4 }, minDistance: 1 }, // Emphasize triples
        bonusSeed: "B0N-WK43-TRPa-AsD9", tileSeed: "T1L-WK43-TRPb-FghJ0",
    },
    // 20. Week 45 - Final Standard Challenge of Example Set
    {
        id: "wk-2024-45", periodRule: { type: 'WEEK_OF_YEAR', week: 45, year: 2024 },
        bonusSeed: "B0N-WK45-STDe-CvBn", tileSeed: "T1L-WK45-STDf-NmZx",
    },

    // Add more challenges for other years or different rules...
];


// Default export or named export depending on how ConfigLoader imports
// export default challenges; // If using default import
// File: src/data/challenges.js