// File: src/js/Utils.js

/**
 * @fileoverview Provides utility functions used throughout the application,
 * including seeded PRNG, array shuffling, random choices, coordinate helpers,
 * time formatting, and tile list generation.
 */

// --- PRNG Setup (Requires Vendored seedrandom library) ---

// IMPORTANT: Assumes 'seedrandom.js' has been placed in ../lib/
// AND that it exports a default function or is adapted to do so.
// If it modifies Math globally, the import line might be removed,
// and createPRNG would use `new Math.seedrandom(seed)`.
// Using placeholder import assuming an ESM-compatible version exists/is made.
import seedrandom from '../lib/seedrandom.js'; // Adjust path/import method as needed!

/**
 * Creates a seeded Pseudo-Random Number Generator instance using seedrandom.
 * @param {string | number} seed The initial seed.
 * @returns {() => number} A function that returns a seeded random number [0, 1).
 * Returns Math.random if seedrandom library fails to load.
 */
export function createPRNG(seed) {
    if (typeof seedrandom !== 'function') {
        console.error("seedrandom library not loaded or not a function! Falling back to Math.random (non-deterministic).");
        return Math.random;
    }
    try {
        const prng = seedrandom(seed);
        // Test the generator immediately to catch potential issues from library loading
        prng(); // Discard first result (sometimes recommended)
        return prng;
    } catch (error) {
        console.error("Failed to initialize seedrandom:", error, "Falling back to Math.random.");
        return Math.random;
    }
}

// --- Array Utilities ---

/**
 * Selects a random element from an array using a seeded PRNG.
 * @template T
 * @param {T[]} array The array to sample from.
 * @param {() => number} prng Seeded PRNG function returning [0, 1).
 * @returns {T | undefined} A random element, or undefined if array is empty.
 */
export function randomChoice(array, prng) {
    if (!array || array.length === 0) {
        return undefined;
    }
    const index = Math.floor(prng() * array.length);
    return array[index];
}

/**
 * Shuffles array in place using the Fisher-Yates algorithm and a PRNG.
 * @template T
 * @param {T[]} array Array to shuffle.
 * @param {() => number} prng Seeded PRNG function returning [0, 1).
 * @returns {T[]} The mutated (shuffled) array.
 */
export function shuffleArray(array, prng) {
    if (!array || array.length < 2) {
        return array; // No need to shuffle empty or single-element arrays
    }
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap
    }
    return array;
}

// --- Tile List Generation ---

/**
 * Generates the specific tile list for a challenge using dictionary words.
 * Ensures exactly two wildcards are present in the final list.
 * @param {Set<string>} dictionarySet The dictionary word list (normalized, e.g., uppercase).
 * @param {number} totalTiles Target number of tiles *including* wildcards (e.g., 37).
 * @param {string | number} seed Seed for the PRNG.
 * @param {{minLength?: number, maxLength?: number}} [wordFilterOptions={}] Optional filters for source words.
 * @returns {string[]} The generated list of tiles, shuffled. Returns empty array on error.
 */
export function generateTileListFromWords(dictionarySet, totalTiles, seed, wordFilterOptions = {}) {
    if (!(dictionarySet instanceof Set) || dictionarySet.size === 0 || totalTiles < 3) {
        console.error("Invalid input for tile list generation.");
        return [];
    }

    const prng = createPRNG(seed);
    const dictionaryArray = Array.from(dictionarySet);
    const targetLetters = Math.max(0, totalTiles - 2); // Number of non-wildcard tiles needed
    let currentTileList = [];
    const minLen = wordFilterOptions.minLength || 3;
    const maxLen = wordFilterOptions.maxLength || 8;

    let attempts = 0;
    const maxAttempts = dictionaryArray.length * 5 + 100; // Safety break with some buffer

    // Filter dictionary once if needed (might be large)
    const usableWords = dictionaryArray.filter(word => word.length >= minLen && word.length <= maxLen);
    if (usableWords.length === 0) {
        console.error("No words in dictionary match filter criteria for tile generation.");
        return [];
    }

    while (currentTileList.length < targetLetters && attempts < maxAttempts) {
        const randomWord = randomChoice(usableWords, prng);
        if (randomWord) {
             // Assuming dictionary is already uppercase
            currentTileList.push(...randomWord.split(''));
        }
        attempts++;
    }

    if (attempts >= maxAttempts && currentTileList.length < targetLetters) {
        console.warn(`Tile generation attempt limit reached. Generated ${currentTileList.length}/${targetLetters} letters.`);
        // Optional: Fill remaining slots with common letters? Keep simple for now.
    }

    // Trim excess letters if we overshot
    if (currentTileList.length > targetLetters) {
         shuffleArray(currentTileList, prng); // Shuffle before trimming
         currentTileList = currentTileList.slice(0, targetLetters);
    }

    // Add exactly two wildcards
    currentTileList.push('*', '*');

    // Final shuffle of the complete list
    shuffleArray(currentTileList, prng);

    if (currentTileList.length !== totalTiles) {
        console.warn(`Final tile list length (${currentTileList.length}) does not match target (${totalTiles}).`);
        // This might happen if targetLetters was 0 or less initially.
    }

    return currentTileList;
}


// --- Coordinate and Board Utilities ---

/**
 * Calculates center coordinates for a given board size.
 * @param {number} size The board dimension (e.g., 5 for 5x5).
 * @returns {{x: number, y: number}} The coordinates of the center square.
 */
export function getCenterCoords(size) {
    const center = Math.floor(size / 2);
    return { x: center, y: center };
}

/**
 * Checks if coordinates are within the board bounds.
 * @param {{x: number, y: number}} coords The coordinates to check.
 * @param {number} size The board dimension.
 * @returns {boolean} True if coordinates are valid.
 */
export function isValidCoords(coords, size) {
    return coords &&
           typeof coords.x === 'number' && coords.x >= 0 && coords.x < size &&
           typeof coords.y === 'number' && coords.y >= 0 && coords.y < size;
}

/**
 * Creates a string key from coordinates, useful for object maps.
 * @param {{x: number, y: number}} coords Coordinates object.
 * @returns {string} A string representation like "x,y". Returns empty string for invalid input.
 */
export function coordKey(coords) {
    if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
        return `${coords.x},${coords.y}`;
    }
    return "";
}

/**
 * Parses a coordinate key string back into an object.
 * @param {string} key The coordinate key string (e.g., "2,3").
 * @returns {{x: number, y: number} | null} Coordinates object or null if invalid key.
 */
export function parseCoordKey(key) {
    if (typeof key !== 'string') return null;
    const parts = key.split(',');
    if (parts.length === 2) {
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        if (!isNaN(x) && !isNaN(y)) {
            return { x, y };
        }
    }
    return null;
}

/**
 * Calculates the Manhattan distance between two coordinates.
 * @param {{x: number, y: number}} coord1 First coordinate.
 * @param {{x: number, y: number}} coord2 Second coordinate.
 * @returns {number} The distance, or Infinity if inputs are invalid.
 */
export function manhattanDistance(coord1, coord2) {
    if (!coord1 || !coord2 || typeof coord1.x !== 'number' || typeof coord1.y !== 'number' || typeof coord2.x !== 'number' || typeof coord2.y !== 'number') {
        return Infinity;
    }
    return Math.abs(coord1.x - coord2.x) + Math.abs(coord1.y - coord2.y);
}

// --- Time Formatting ---

/**
 * Formats remaining milliseconds into an HH:MM:SS string.
 * @param {number} ms Milliseconds remaining.
 * @returns {string} Formatted time string. Returns "00:00:00" for negative input.
 */
export function formatTimeCountdown(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return `${hh}:${mm}:${ss}`;
}

// --- Other Utilities ---

/**
 * Performs a deep clone of a simple object or array (no functions, Maps, Sets, etc.).
 * Sufficient for basic game state objects.
 * @template T
 * @param {T} obj The object/array to clone.
 * @returns {T} A deep clone. Returns input if not object/array.
 */
export function simpleDeepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    // Handle Date (though unlikely needed in core state)
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    // Handle Array
    if (Array.isArray(obj)) {
        const copy = [];
        for (let i = 0, len = obj.length; i < len; i++) {
            copy[i] = simpleDeepClone(obj[i]);
        }
        return copy;
    }
    // Handle Object
    if (obj instanceof Object) {
        const copy = {};
        for (const attr in obj) {
            if (obj.hasOwnProperty(attr)) {
                copy[attr] = simpleDeepClone(obj[attr]);
            }
        }
        return copy;
    }
    // Should not reach here for simple JSON-like objects
    throw new Error("Unable to clone object!");
}

/**
 * Debounces a function call.
 * @param {Function} func The function to debounce.
 * @param {number} wait The debounce wait time in milliseconds.
 * @returns {(...args: any[]) => void} A debounced version of the function.
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


// File: src/js/Utils.js
