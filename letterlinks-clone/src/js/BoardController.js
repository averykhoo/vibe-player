// File: src/js/BoardController.js

/**
 * @fileoverview Manages the board's data structure, including bonus square layout
 * and placed tiles. Handles placing/removing tile data and validates board state
 * for submission rules (connectivity, center star).
 */

import * as Utils from './Utils.js';
import { BONUS_TYPES } from './Constants.js';

/** @typedef {import('./GameState.js').default} GameState */ // For JSDoc type hinting

// --- Bonus Layout Generation ---

/**
 * Generates the deterministic bonus square layout for the board.
 * Uses a seeded PRNG and respects configured counts and minimum distance rules.
 * @param {number} size - The dimension of the board (e.g., 5 for 5x5).
 * @param {object} bonusRules - Rules from config { counts: { DL: 4, ... }, minDistance: 1 }.
 * @param {string | number} seed - The seed for the PRNG.
 * @returns {object} The generated layout object mapping coord keys to bonus types {'x,y': 'DL'|...}.
 */
export function generateBonusLayout(size, bonusRules, seed) {
    const prng = Utils.createPRNG(seed);
    const centerCoords = Utils.getCenterCoords(size);
    const centerKey = Utils.coordKey(centerCoords);
    const placedLayout = {}; // Using object map for sparse storage
    const placedCoords = []; // Keep track of coordinates with bonuses for distance checks
    const { counts, minDistance } = bonusRules;

    // 1. Create list of bonuses to place based on counts
    const bonusesToPlace = [];
    for (const type in counts) {
        if (counts.hasOwnProperty(type) && counts[type] > 0) {
            for (let i = 0; i < counts[type]; i++) {
                bonusesToPlace.push(type);
            }
        }
    }
    Utils.shuffleArray(bonusesToPlace, prng); // Shuffle the order we try to place them

    // 2. Create list of valid coordinates for bonuses (all except center)
    let validCoords = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const currentCoord = { x, y };
            if (Utils.coordKey(currentCoord) !== centerKey) {
                validCoords.push(currentCoord);
            }
        }
    }
    Utils.shuffleArray(validCoords, prng); // Shuffle potential locations

    // 3. Place bonuses one by one
    let placedCount = 0;
    for (const bonusType of bonusesToPlace) {
        let placed = false;
        let attempts = 0; // Retry mechanism for distance check
        const maxPlacementAttempts = validCoords.length > 0 ? Math.min(5, validCoords.length) : 0; // Try up to 5 valid spots
        let firstAttemptCoord = null; // Remember the first coord tried for this bonus type

        for (let i = 0; i < validCoords.length && attempts < maxPlacementAttempts; i++) {
            const candidateCoord = validCoords[i];
            if (placedLayout[Utils.coordKey(candidateCoord)]) {
                 continue; // Skip if already occupied by another bonus (shouldn't happen if logic is right)
            }

            if (attempts === 0) firstAttemptCoord = candidateCoord;
            attempts++;

            // Check minimum distance rule
            let distanceOk = true;
            if (minDistance > 0) {
                for (const existingCoord of placedCoords) {
                    if (Utils.manhattanDistance(candidateCoord, existingCoord) < minDistance) {
                        distanceOk = false;
                        break;
                    }
                }
            }

            if (distanceOk) {
                const key = Utils.coordKey(candidateCoord);
                placedLayout[key] = bonusType;
                placedCoords.push(candidateCoord);
                validCoords.splice(i, 1); // Remove from available spots
                placed = true;
                placedCount++;
                break; // Bonus placed, move to next bonus type
            }
        }

        // Fallback: If no suitable spot found respecting distance after retries, place at the first tried location
        if (!placed && firstAttemptCoord) {
            console.warn(`Bonus placement for ${bonusType} ignored minDistance rule due to limited options.`);
            const key = Utils.coordKey(firstAttemptCoord);
            if (!placedLayout[key]) { // Ensure it's not somehow already filled
                placedLayout[key] = bonusType;
                placedCoords.push(firstAttemptCoord);
                // Find and remove firstAttemptCoord from validCoords
                const indexToRemove = validCoords.findIndex(c => c.x === firstAttemptCoord.x && c.y === firstAttemptCoord.y);
                if (indexToRemove > -1) {
                    validCoords.splice(indexToRemove, 1);
                }
                placed = true;
                placedCount++;
            } else {
                 console.error(`Fallback placement failed for ${bonusType} at ${key}, square was already occupied?`);
            }
        } else if (!placed) {
             console.error(`Could not place bonus ${bonusType}. No valid squares left or firstAttemptCoord was null.`);
        }
    }

    if (placedCount !== bonusesToPlace.length) {
         console.error(`Could only place ${placedCount}/${bonusesToPlace.length} bonuses. Check config/logic.`);
    }

    // Add the center star marker (doesn't affect distance checks)
    placedLayout[centerKey] = BONUS_TYPES.STAR;

    console.log("Generated Board Layout:", placedLayout); // Debug
    return placedLayout;
}


// --- Tile Placement/Removal (Data Operations) ---

/**
 * Creates a new boardTiles state object with a tile added. (Pure function)
 * Does basic validation (is square empty?).
 * @param {{x: number, y: number}} coords - Coordinates to place the tile.
 * @param {object} tileData - Data of the tile being placed { letter, value, isWildcard, displayLetter }.
 * @param {object} currentBoardTiles - The current state of `GameState.boardTiles`.
 * @param {number} size - Board dimension.
 * @returns {{success: boolean, updatedBoardTiles: object}} Result object. `success` is false if placement is invalid. `updatedBoardTiles` is a *new* object.
 */
export function placeTile(coords, tileData, currentBoardTiles, size) {
    if (!Utils.isValidCoords(coords, size)) {
        console.error("Invalid coordinates for placing tile:", coords);
        return { success: false, updatedBoardTiles: currentBoardTiles };
    }
    const key = Utils.coordKey(coords);
    if (currentBoardTiles[key]) {
        console.warn("Attempted to place tile on occupied square:", key);
        return { success: false, updatedBoardTiles: currentBoardTiles }; // Cannot place on occupied square
    }

    // Create a new board state object
    const updatedBoardTiles = { ...currentBoardTiles };
    updatedBoardTiles[key] = { ...tileData }; // Add a copy of the tile data

    return { success: true, updatedBoardTiles };
}

/**
 * Creates a new boardTiles state object with a tile removed. (Pure function)
 * @param {{x: number, y: number}} coords - Coordinates of the tile to remove.
 * @param {object} currentBoardTiles - The current state of `GameState.boardTiles`.
 * @param {number} size - Board dimension.
 * @returns {{success: boolean, updatedBoardTiles: object, removedTileData: object | null}} Result object. `success` is true if a tile existed at coords. `updatedBoardTiles` is a *new* object.
 */
export function removeTile(coords, currentBoardTiles, size) {
     if (!Utils.isValidCoords(coords, size)) {
        console.error("Invalid coordinates for removing tile:", coords);
        return { success: false, updatedBoardTiles: currentBoardTiles, removedTileData: null };
    }
    const key = Utils.coordKey(coords);
    if (!currentBoardTiles[key]) {
        // console.warn("Attempted to remove tile from empty square:", key);
        return { success: false, updatedBoardTiles: currentBoardTiles, removedTileData: null }; // No tile to remove
    }

    const removedTileData = { ...currentBoardTiles[key] }; // Copy data before deleting

    // Create a new board state object *without* the removed tile
    const updatedBoardTiles = { ...currentBoardTiles };
    delete updatedBoardTiles[key];

    return { success: true, updatedBoardTiles, removedTileData };
}


// --- Submission Validation ---

/**
 * Validates if the current board state meets submission criteria:
 * 1. All placed tiles form a single contiguous block (no gaps/islands).
 * 2. The block includes the center star square.
 * Uses a Breadth-First Search (BFS) or Depth-First Search (DFS) approach.
 * @param {object} boardTiles - The `GameState.boardTiles` object.
 * @param {number} size - The board dimension.
 * @param {{x: number, y: number}} centerCoords - Coordinates of the center square.
 * @returns {{isConnected: boolean, includesCenter: boolean, blockCoords: string[] | null, discontinuityCoords: string[]}}
 *          isConnected: True if all tiles form one block.
 *          includesCenter: True if the block contains the center square.
 *          blockCoords: Array of coord keys ("x,y") in the main block (if connected), else null.
 *          discontinuityCoords: Array of coord keys ("x,y") of tiles *not* in the main block.
 */
export function validateSubmissionState(boardTiles, size, centerCoords) {
    const placedTileKeys = Object.keys(boardTiles);
    if (placedTileKeys.length === 0) {
        // Empty board is technically connected but doesn't include center
        return { isConnected: true, includesCenter: false, blockCoords: [], discontinuityCoords: [] };
    }

    const centerKey = Utils.coordKey(centerCoords);
    const visited = new Set();
    const queue = [];
    const mainBlock = []; // Keys found in the connected block starting from the first tile
    let foundCenterInBlock = false;

    // Start BFS from the first tile found
    const startKey = placedTileKeys[0];
    queue.push(startKey);
    visited.add(startKey);

    while (queue.length > 0) {
        const currentKey = queue.shift();
        mainBlock.push(currentKey);
        if (currentKey === centerKey) {
            foundCenterInBlock = true;
        }

        const currentCoords = Utils.parseCoordKey(currentKey);
        if (!currentCoords) continue; // Should not happen if keys are valid

        // Check neighbors (Up, Down, Left, Right)
        const neighbors = [
            { x: currentCoords.x, y: currentCoords.y - 1 }, // Up
            { x: currentCoords.x, y: currentCoords.y + 1 }, // Down
            { x: currentCoords.x - 1, y: currentCoords.y }, // Left
            { x: currentCoords.x + 1, y: currentCoords.y }, // Right
        ];

        for (const neighborCoords of neighbors) {
            const neighborKey = Utils.coordKey(neighborCoords);
            // Check if neighbor is within bounds, has a tile, and hasn't been visited
            if (Utils.isValidCoords(neighborCoords, size) && boardTiles[neighborKey] && !visited.has(neighborKey)) {
                visited.add(neighborKey);
                queue.push(neighborKey);
            }
        }
    }

    // Check results
    const isConnected = visited.size === placedTileKeys.length;
    const includesCenter = foundCenterInBlock;

    let discontinuityCoords = [];
    if (!isConnected) {
        // Find which tiles weren't visited (belong to other islands)
        discontinuityCoords = placedTileKeys.filter(key => !visited.has(key));
    }

    return {
        isConnected: isConnected,
        includesCenter: includesCenter,
        blockCoords: mainBlock, // Coordinates in the main block found
        discontinuityCoords: discontinuityCoords // Coordinates not part of the main block
    };
}


// File: src/js/BoardController.js
