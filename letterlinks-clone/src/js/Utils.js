// File: src/js/Utils.js

/**
 * @fileoverview Provides utility functions used throughout the application...
 */

// --- PRNG Setup (Requires Vendored seedrandom library loaded beforehand) ---

// NO IMPORT statement needed if seedrandom modifies Math globally

/**
 * Creates a seeded Pseudo-Random Number Generator instance using Math.seedrandom.
 * Relies on the 'seedrandom.js' script having been loaded and executed previously.
 * @param {string | number} seed The initial seed.
 * @returns {() => number} A function that returns a seeded random number [0, 1).
 * Returns Math.random if Math.seedrandom is not available.
 */
export function createPRNG(seed) {
    // Check if seedrandom attached itself to Math
    if (typeof Math.seedrandom !== 'function') {
        console.error("Math.seedrandom not found! Was seedrandom.js loaded correctly? Falling back to Math.random (non-deterministic).");
        return Math.random;
    }
    try {
        // Call Math.seedrandom to get a seeded RNG instance
        // Note: Calling Math.seedrandom usually replaces Math.random globally,
        // but calling it *with* a seed should return a local PRNG instance
        // without necessarily replacing Math.random globally IF called this way.
        // Let's test this assumption. If it *does* replace Math.random, we might need a different approach.
        const prng = new Math.seedrandom(seed); // Pass the seed here
        prng(); // Discard first result (optional)
        return prng;
    } catch (error) {
        console.error("Failed to initialize Math.seedrandom:", error, "Falling back to Math.random.");
        return Math.random;
    }
}

// --- Array Utilities ---
// (randomChoice, shuffleArray, generateTileListFromWords implementations remain the same,
//  as they just expect a `prng` function as input)

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
    // Ensure PRNG is callable
    const randomValue = typeof prng === 'function' ? prng() : Math.random();
    const index = Math.floor(randomValue * array.length);
    return array[index];
}

/**
 * Shuffles array in place using the Fisher-Yates algorithm and a PRNG.
 * @template T
 * @param {Array<T>} array Array to shuffle.
 * @param {() => number} prng Seeded PRNG function returning [0, 1).
 * @returns {T[]} The mutated (shuffled) array.
 */
export function shuffleArray(array, prng) {
    if (!array || array.length < 2) {
        return array; // No need to shuffle empty or single-element arrays
    }
     // Ensure PRNG is callable
     const randomFunc = typeof prng === 'function' ? prng : Math.random;
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(randomFunc() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap
    }
    return array;
}

// --- Tile List Generation ---

/**
 * Generates the specific tile list for a challenge using dictionary words.
 * Ensures exactly the specified number of wildcards are present.
 * @param {Set<string>} dictionarySet The dictionary word list (normalized, e.g., uppercase).
 * @param {number} totalTiles Target number of tiles *including* wildcards (e.g., 37).
 * @param {string | number} seed Seed for the PRNG.
 * @param {number} [wildcardCount=2] Number of wildcards to include.
 * @param {{minLength?: number, maxLength?: number}} [wordFilterOptions={}] Optional filters for source words.
 * @returns {string[]} The generated list of tiles, shuffled. Returns empty array on error.
 */
 export function generateTileListFromWords(dictionarySet, totalTiles, seed, wildcardCount = 2, wordFilterOptions = {}) {
    if (!(dictionarySet instanceof Set) || dictionarySet.size === 0 || totalTiles < wildcardCount) {
        console.error("Invalid input for tile list generation.");
        return [];
    }

    const prng = createPRNG(seed); // Get the seeded generator
    if (prng === Math.random) { // Check if fallback occurred
         console.warn("Generating tile list using non-deterministic Math.random due to PRNG failure.");
    }

    const dictionaryArray = Array.from(dictionarySet);
    const targetLetters = Math.max(0, totalTiles - wildcardCount); // Number of non-wildcard tiles needed
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
            currentTileList.push(...randomWord.toUpperCase().split(''));
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

    // Add wildcards
    for (let i = 0; i < wildcardCount; i++) {
        currentTileList.push('*');
    }

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
