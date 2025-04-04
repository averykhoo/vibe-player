// File: src/js/TilePoolController.js

/**
 * @fileoverview Manages the state of the available tile pool. Calculates remaining
 * tiles based on the full challenge list and placed tiles. Provides tile value lookups.
 */

/** @typedef {import('./GameState.js').default} GameState */ // For JSDoc type hinting

/**
 * Calculates the initial counts of each letter in the full tile list for the challenge.
 * @param {string[]} fullTileList - The complete list of tiles for the challenge (e.g., ['A', 'A', 'B', '*']).
 * @returns {object} An object mapping each letter (or '*') to its count (e.g., {'A': 2, 'B': 1, '*': 1}). Returns empty object on error.
 */
export function getInitialPoolState(fullTileList) {
    if (!Array.isArray(fullTileList)) {
        console.error("Invalid fullTileList provided for initial pool state.");
        return {};
    }
    const initialPool = {};
    for (const tile of fullTileList) {
        if (typeof tile === 'string' && tile.length > 0) {
            const letter = tile.toUpperCase(); // Ensure consistency
            initialPool[letter] = (initialPool[letter] || 0) + 1;
        }
    }
    // console.log("Initial Pool State:", initialPool); // Debug
    return initialPool;
}

/**
 * Recalculates the remaining tile pool counts based on the full challenge list
 * and the tiles currently placed on the board.
 * This is the primary way to get the current pool state after initialization or state restoration.
 * @param {string[]} fullTileList - The complete list of tiles for the challenge.
 * @param {object} boardTiles - The GameState.boardTiles object {'x,y': { letter, ... }}.
 * @returns {object} An object mapping remaining letters to their counts. Returns empty object on error.
 */
export function recalculatePoolState(fullTileList, boardTiles) {
    if (!Array.isArray(fullTileList) || typeof boardTiles !== 'object') {
        console.error("Invalid input for recalculating pool state.");
        return {};
    }

    // Start with the full counts
    const remainingPool = getInitialPoolState(fullTileList);

    // Subtract placed tiles
    for (const key in boardTiles) {
        if (boardTiles.hasOwnProperty(key)) {
            const tileData = boardTiles[key];
            if (tileData && typeof tileData.letter === 'string') {
                const letter = tileData.letter.toUpperCase(); // Use the actual letter ('*' for wildcard)
                if (remainingPool.hasOwnProperty(letter)) {
                    remainingPool[letter]--;
                    if (remainingPool[letter] < 0) {
                        // This indicates an inconsistency between board state and full tile list!
                        console.error(`Inconsistency found: More '${letter}' tiles on board than in challenge list.`);
                        remainingPool[letter] = 0; // Correct to zero
                    }
                } else {
                    console.error(`Inconsistency found: Tile '${letter}' on board but not expected in pool.`);
                }
            }
        }
    }

    // Filter out letters with zero count for cleaner state? Optional.
    // const finalPool = {};
    // for (const letter in remainingPool) {
    //     if (remainingPool[letter] > 0) {
    //         finalPool[letter] = remainingPool[letter];
    //     }
    // }
    // return finalPool;
    // console.log("Recalculated Pool State:", remainingPool); // Debug
    return remainingPool; // Keep zeros for easier UI rendering checks maybe
}

/**
 * Checks if a specific tile is available in the current pool state.
 * @param {string} letter - The letter (or '*') to check.
 * @param {object} currentPoolState - The current pool state object (counts).
 * @returns {boolean} True if the tile is available (count > 0).
 */
export function isTileAvailable(letter, currentPoolState) {
    return !!currentPoolState && currentPoolState[letter.toUpperCase()] > 0;
}


/**
 * Gets the point value for a given letter based on the configured tile set.
 * @param {string} letter - The letter (or '*') to get the value for.
 * @param {object} tileSetConfig - The `tileSet` object from `GameState.currentConfig`, containing the `values` map.
 * @returns {number} The point value, or 0 if not found or input is invalid.
 */
export function getTileValue(letter, tileSetConfig) {
    if (!letter || typeof letter !== 'string' || !tileSetConfig || !tileSetConfig.values) {
        return 0;
    }
    const upperLetter = letter.toUpperCase();
    return tileSetConfig.values[upperLetter] ?? 0; // Use nullish coalescing for safety
}


// Note: We removed takeTile/returnTile as recalculatePoolState is now the primary method
// for ensuring pool state consistency based on the authoritative fullTileList and boardTiles.
// GameManager will trigger recalculations when the board changes.

// File: src/js/TilePoolController.js
