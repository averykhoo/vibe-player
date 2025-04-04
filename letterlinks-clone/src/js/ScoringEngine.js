// File: src/js/ScoringEngine.js

/**
 * @fileoverview Calculates the final score for a completed game board based on
 * standard Scrabble rules, including letter values, bonus squares, and word validation.
 */

import * as WordValidator from './WordValidator.js';
import * as Utils from '../../../vibe-player/js/utils.js';
import { BONUS_TYPES } from '../../../vibe-player/js/constants.js';

/** @typedef {import('./WordValidator.js').isValid} isValidWordFn */ // Type hint for validator function

// --- Helper Functions ---

/**
 * Extracts all potential horizontal and vertical word segments from the board.
 * @param {object} boardTiles - The GameState.boardTiles object.
 * @param {number} size - The board dimension.
 * @returns {Array<{word: string, coords: Array<{x: number, y: number}>, keys: string[]}>} Array of potential words.
 */
function findAllWordSegments(boardTiles, size) {
    const segments = [];
    const placedKeys = new Set(Object.keys(boardTiles));

    // Horizontal segments
    for (let y = 0; y < size; y++) {
        let currentSegment = { word: "", coords: [], keys: [] };
        for (let x = 0; x < size; x++) {
            const key = Utils.coordKey({ x, y });
            if (placedKeys.has(key)) {
                currentSegment.word += boardTiles[key].displayLetter; // Use displayed letter (for wildcards)
                currentSegment.coords.push({ x, y });
                currentSegment.keys.push(key);
            } else {
                if (currentSegment.word.length >= 2) { // Minimum word length is 2
                    segments.push(currentSegment);
                }
                currentSegment = { word: "", coords: [], keys: [] }; // Reset
            }
        }
        if (currentSegment.word.length >= 2) { // Catch segment ending at edge
            segments.push(currentSegment);
        }
    }

    // Vertical segments
    for (let x = 0; x < size; x++) {
        let currentSegment = { word: "", coords: [], keys: [] };
        for (let y = 0; y < size; y++) {
            const key = Utils.coordKey({ x, y });
            if (placedKeys.has(key)) {
                currentSegment.word += boardTiles[key].displayLetter;
                currentSegment.coords.push({ x, y });
                currentSegment.keys.push(key);
            } else {
                if (currentSegment.word.length >= 2) {
                    segments.push(currentSegment);
                }
                currentSegment = { word: "", coords: [], keys: [] };
            }
        }
        if (currentSegment.word.length >= 2) { // Catch segment ending at edge
            segments.push(currentSegment);
        }
    }

    return segments;
}


// --- Main Scoring Function ---

/**
 * Calculates the final score for the submitted board state.
 * Finds all valid words, calculates their scores including bonuses, and sums them up.
 * @param {object} boardTiles - The `GameState.boardTiles` object.
 * @param {object} boardLayout - The `GameState.boardLayout` object {'x,y': 'DL'|...}.
 * @param {object} tileSetConfig - The `tileSet` config object containing the `values` map.
 * @param {number} size - The board dimension.
 * @param {isValidWordFn} isValidWordCheck - The function from WordValidator to check word validity.
 * @returns {{finalScore: number, scoredWords: Array<{word: string, score: number, keys: string[]}>, maxWordScore: number}}
 *          Object containing the total score, details of each scored word, and the highest single word score.
 */
export function calculateFinalScore(boardTiles, boardLayout, tileSetConfig, size, isValidWordCheck) {
    let totalScore = 0;
    let maxWordScore = 0;
    const scoredWordsInfo = []; // To store details of words that contributed score
    const scoredTileKeys = new Set(); // Track keys part of *any* valid word to avoid recounting base letter values if logic summed letters separately (safer to calc per word)

    const potentialSegments = findAllWordSegments(boardTiles, size);
    const tileValues = tileSetConfig.values || {};

    // console.log("Potential Segments:", potentialSegments); // Debug

    for (const segment of potentialSegments) {
        // 1. Validate the word segment
        if (!isValidWordCheck(segment.word)) {
            // console.log(`Invalid word: ${segment.word}`); // Debug
            continue; // Skip invalid words
        }

        // console.log(`Valid word found: ${segment.word}`); // Debug

        // 2. Calculate score for this valid word
        let currentWordScore = 0;
        let wordMultiplier = 1;
        let hasWildcard = false;

        for (const key of segment.keys) {
            const tileData = boardTiles[key];
            if (!tileData) continue; // Should not happen

            const letterValue = tileValues[tileData.letter] ?? 0; // Use actual letter ('*' for wildcard value=0)
            let letterMultiplier = 1;

            // Check for letter bonuses on the square
            const bonusType = boardLayout[key];
            if (bonusType === BONUS_TYPES.DL) {
                letterMultiplier = 2;
            } else if (bonusType === BONUS_TYPES.TL) {
                letterMultiplier = 3;
            }

            // Apply letter multiplier *before* adding to word score
            currentWordScore += (letterValue * letterMultiplier);

            // Check for word bonuses on the square
            if (bonusType === BONUS_TYPES.DW) {
                wordMultiplier *= 2;
            } else if (bonusType === BONUS_TYPES.TW) {
                wordMultiplier *= 3;
            }

            if (tileData.isWildcard) {
                hasWildcard = true;
            }

            // Mark tile as scored (optional, might be useful for some validation/UI)
            scoredTileKeys.add(key);
        }

        // Apply word multiplier(s)
        currentWordScore *= wordMultiplier;

        // (Standard Scrabble doesn't have special tile multipliers like Green N, so skip that)

        // Add word score to total
        totalScore += currentWordScore;

        // Track max word score
        if (currentWordScore > maxWordScore) {
            maxWordScore = currentWordScore;
        }

        // Store scored word info
        scoredWordsInfo.push({
            word: segment.word,
            score: currentWordScore,
            keys: segment.keys, // Store coord keys for potential highlighting/analysis
            hasWildcard: hasWildcard
        });
    }

    // Note: Standard Scrabble rules score each word fully independently.
    // If a tile is part of two words (one horizontal, one vertical), its base value
    // and any letter multiplier contribute to BOTH word scores. Word multipliers
    // also apply to both words if the tile is on a word bonus square.
    // The logic above handles this correctly by calculating each valid word's score separately.

    console.log("Final Score Calculated:", totalScore); // Debug
    console.log("Scored Words:", scoredWordsInfo); // Debug

    return {
        finalScore: totalScore,
        scoredWords: scoredWordsInfo,
        maxWordScore: maxWordScore
    };
}


// File: src/js/ScoringEngine.js
