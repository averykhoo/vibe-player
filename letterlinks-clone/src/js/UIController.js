// File: src/js/UIController.js

/**
 * @fileoverview Manages all DOM interactions, rendering game state,
 * handling user input events, managing modals, and playing animations.
 */

import { CSS_CLASSES, BONUS_TYPES, ANIMATION_DURATIONS } from './Constants.js';
import * as Utils from './Utils.js';

// --- DOM Element References ---

/** @type {HTMLElement | null} Main application container */
let appContainer = null;
/** @type {HTMLElement | null} Game board container */
let boardElement = null;
/** @type {HTMLElement | null} Tile pool container */
let tilePoolElement = null;
/** @type {HTMLElement | null} Actions area container */
let actionsElement = null;
/** @type {HTMLElement | null} Score display element */
let scoreDisplayElement = null;
/** @type {HTMLElement | null} Countdown display element */
let countdownDisplayElement = null;
/** @type {HTMLElement | null} Submit button element */
let submitButtonElement = null;
/** @type {HTMLElement | null} Menu button element */
let menuButtonElement = null;
/** @type {HTMLElement | null} Menu overlay element */
let menuOverlayElement = null;
// Add references for modal elements later (backdrop, containers, buttons etc.)

/** @type {object} Callbacks provided by GameManager */
let gameCallbacks = {};

/** @type {object | null} Reference to the currently dragged tile element */
let draggedTileElement = null;
/** @type {{x: number, y: number} | null} Original coords of the dragged tile */
let dragStartCoords = null;

// --- Initialization ---

/**
 * Initializes the UIController, gets element references, and sets up base event listeners.
 * @param {object} callbacks - Functions provided by GameManager to handle user actions.
 * @param {() => void} callbacks.onSubmitClick - Called when submit button is clicked.
 * @param {(coords: {x: number, y: number}) => void} callbacks.onBoardSquareClick - Called when an empty board square is clicked.
 * @param {(coords: {x: number, y: number}) => void} callbacks.onPlacedTileClick - Called when a tile on the board is clicked.
 * @param {(letter: string, element: HTMLElement) => void} callbacks.onPoolTileClick - Called when a tile in the pool is clicked.
 * @param {() => void} callbacks.onResetClick - Called when 'Reset Board' in menu is clicked.
 * @param {() => void} callbacks.onHowToPlayClick - Called when 'How to Play' in menu is clicked.
 * @param {(coords: {x: number, y: number}) => void} callbacks.onPlacedTileDragStart - Called when dragging a board tile starts.
 * @param {(coords: {x: number, y: number} | null) => void} callbacks.onDragEnd - Called when dragging ends (null if dropped outside board/pool).
 */
export function init(callbacks) {
    console.log("UIController initializing...");
    gameCallbacks = callbacks;

    // Get main element references
    appContainer = document.getElementById('app'); // Assuming root element has id="app"
    boardElement = document.getElementById('game-board');
    tilePoolElement = document.getElementById('tile-pool');
    actionsElement = document.getElementById('actions-area');
    scoreDisplayElement = document.getElementById('score-display');
    countdownDisplayElement = document.getElementById('countdown-display');
    submitButtonElement = document.getElementById('submit-button');
    menuButtonElement = document.getElementById('menu-button');
    menuOverlayElement = document.getElementById('menu-overlay');
    // Get modal elements later

    if (!appContainer || !boardElement || !tilePoolElement || !actionsElement || !scoreDisplayElement || !submitButtonElement || !menuButtonElement || !menuOverlayElement || !countdownDisplayElement) {
        console.error("UIController Init Error: Could not find all required DOM elements!");
        // Perhaps display a critical error message here
        return;
    }

    // Add base event listeners
    setupEventListeners();
    console.log("UIController initialized.");
}

/**
 * Sets up global and persistent event listeners.
 */
function setupEventListeners() {
    // --- Click Listeners ---
    if (submitButtonElement) {
        submitButtonElement.addEventListener('click', handleSubmitClick);
    }
    if (menuButtonElement) {
        menuButtonElement.addEventListener('click', handleMenuToggle);
    }
    if (menuOverlayElement) {
         // Add listeners for menu items if they exist inside the overlay
         const resetButton = menuOverlayElement.querySelector('#reset-board-button');
         const howToPlayButton = menuOverlayElement.querySelector('#how-to-play-button');
         if (resetButton) resetButton.addEventListener('click', handleResetClick);
         if (howToPlayButton) howToPlayButton.addEventListener('click', handleHowToPlayClick);
         // Close menu if clicking outside of it (optional)
         // document.addEventListener('click', handleOutsideMenuClick); // More complex handling needed
    }

    // Delegated listeners for dynamically created elements (tiles, squares)
    if (boardElement) {
        boardElement.addEventListener('click', handleBoardClick);
        // Drag & Drop listeners for tiles ON the board
        boardElement.addEventListener('dragstart', handleBoardDragStart);
        // Need listeners on potential drop targets (pool area, maybe body to detect drop 'off')
    }
    if (tilePoolElement) {
        tilePoolElement.addEventListener('click', handlePoolClick);
    }

    // --- Drag & Drop Listeners (Global for handling drop anywhere) ---
    // Prevent default to allow drop
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd); // Cleanup after drag finishes
}

// --- Event Handlers ---

/** Handles clicks on the submit button. */
function handleSubmitClick() {
    // Check if button is disabled first
    if (submitButtonElement && !submitButtonElement.classList.contains(CSS_CLASSES.SUBMIT_DISABLED)) {
        gameCallbacks.onSubmitClick?.();
    }
}

/** Handles clicks on the main menu toggle button. */
function handleMenuToggle(event) {
    event.stopPropagation(); // Prevent potential outside click closing immediately
    menuOverlayElement?.classList.toggle('visible'); // Assuming 'visible' class controls display
}

/** Handles clicks on the Reset Board menu item. */
function handleResetClick() {
    menuOverlayElement?.classList.remove('visible'); // Close menu
    gameCallbacks.onResetClick?.();
}

/** Handles clicks on the How to Play menu item. */
function handleHowToPlayClick() {
    menuOverlayElement?.classList.remove('visible'); // Close menu
    gameCallbacks.onHowToPlayClick?.();
}

/**
 * Handles clicks within the board area (delegated).
 * Determines if a square or a placed tile was clicked.
 * @param {MouseEvent} event
 */
function handleBoardClick(event) {
    const target = event.target;
    const square = target.closest(`.${CSS_CLASSES.SQUARE}`);

    if (!square) return; // Click wasn't inside a square

    const coords = parseCoordsFromElement(square);
    if (!coords) return;

    const placedTile = square.querySelector(`.${CSS_CLASSES.TILE_BOARD}`);

    if (placedTile) {
        // Clicked on a placed tile
        gameCallbacks.onPlacedTileClick?.(coords);
    } else {
        // Clicked on an empty square
        gameCallbacks.onBoardSquareClick?.(coords);
    }
}

/**
 * Handles clicks within the tile pool area (delegated).
 * @param {MouseEvent} event
 */
function handlePoolClick(event) {
    const targetTile = event.target.closest(`.${CSS_CLASSES.TILE_POOL}`);
    if (targetTile) {
        const letter = targetTile.dataset.letter; // Assuming letter is stored in data attribute
        if (letter) {
            gameCallbacks.onPoolTileClick?.(letter, targetTile);
        }
    }
}


// --- Board Rendering ---

/**
 * Renders the entire game board structure and placed tiles.
 * @param {number} size - Board dimension.
 * @param {object | null} boardLayout - Bonus layout {'x,y': 'DL'|...}.
 * @param {object} boardTiles - Placed tiles {'x,y': { letter, value, ... }}.
 * @param {object} validationStatus - Current validation status for highlighting.
 */
export function renderBoard(size, boardLayout, boardTiles, validationStatus) {
    if (!boardElement) return;

    // Clear previous content (simple approach)
    boardElement.innerHTML = '';
    boardElement.style.setProperty('--board-size', size); // For CSS Grid layout

    const fragment = document.createDocumentFragment();
    const centerCoords = Utils.getCenterCoords(size);
    const centerKey = Utils.coordKey(centerCoords);
    const invalidKeys = new Set(validationStatus?.discontinuityCoords || []);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const coords = { x, y };
            const key = Utils.coordKey(coords);
            const squareElement = document.createElement('div');
            squareElement.classList.add(CSS_CLASSES.SQUARE);
            squareElement.dataset.coordX = x; // Store coords for event handling
            squareElement.dataset.coordY = y;
            squareElement.dataset.coordKey = key;

            // Apply bonus class
            const bonusType = boardLayout ? boardLayout[key] : null;
            if (bonusType) {
                const bonusClass = getBonusClass(bonusType);
                if (bonusClass) {
                    squareElement.classList.add(bonusClass);
                    // Optionally add text label for bonus squares
                    // squareElement.textContent = bonusType !== BONUS_TYPES.STAR ? bonusType : '★';
                }
            }

            // Render placed tile if exists
            const tileData = boardTiles[key];
            if (tileData) {
                const tileElement = createTileElement(tileData, true); // true for board tile
                squareElement.appendChild(tileElement);
                 // Apply invalid highlight if needed
                 if (invalidKeys.has(key)) {
                     tileElement.classList.add(CSS_CLASSES.INVALID_SUBMIT_TILE);
                 } else {
                     tileElement.classList.remove(CSS_CLASSES.INVALID_SUBMIT_TILE);
                 }
            }

            // Apply invalid center star highlight specifically
             if (key === centerKey && validationStatus?.needsCenterStar) {
                squareElement.classList.add(CSS_CLASSES.INVALID_SUBMIT_STAR);
            } else {
                 squareElement.classList.remove(CSS_CLASSES.INVALID_SUBMIT_STAR);
            }


            fragment.appendChild(squareElement);
        }
    }
    boardElement.appendChild(fragment);

    // Apply valid word highlights separately after all tiles are in DOM
    renderWordHighlights(validationStatus?.validWordMap || {});
}

/**
 * Gets the appropriate CSS class for a bonus type.
 * @param {string | null} bonusType - The bonus type string (e.g., 'DL', 'STAR').
 * @returns {string | null} The corresponding CSS class or null.
 */
function getBonusClass(bonusType) {
    switch (bonusType) {
        case BONUS_TYPES.DL: return CSS_CLASSES.BONUS_DL;
        case BONUS_TYPES.TL: return CSS_CLASSES.BONUS_TL;
        case BONUS_TYPES.DW: return CSS_CLASSES.BONUS_DW;
        case BONUS_TYPES.TW: return CSS_CLASSES.BONUS_TW;
        case BONUS_TYPES.STAR: return CSS_CLASSES.BONUS_STAR;
        default: return null;
    }
}

/**
 * Creates a tile DOM element.
 * @param {object} tileData - Tile data { letter, value, displayLetter, isWildcard }.
 * @param {boolean} isBoardTile - True if the tile is for the board, false for the pool.
 * @returns {HTMLElement} The created tile element.
 */
function createTileElement(tileData, isBoardTile) {
    const tileElement = document.createElement('div');
    tileElement.classList.add(CSS_CLASSES.TILE);
    tileElement.classList.add(isBoardTile ? CSS_CLASSES.TILE_BOARD : CSS_CLASSES.TILE_POOL);
    tileElement.dataset.letter = tileData.letter; // Store actual letter ('*' for wildcard)

    const letterSpan = document.createElement('span');
    letterSpan.classList.add(CSS_CLASSES.TILE_LETTER);
    letterSpan.textContent = tileData.displayLetter || tileData.letter; // Show chosen letter for wildcard

    const valueSpan = document.createElement('span');
    valueSpan.classList.add(CSS_CLASSES.TILE_VALUE);
    valueSpan.textContent = tileData.value ?? 0;

    tileElement.appendChild(letterSpan);
    tileElement.appendChild(valueSpan);

    // Make board tiles draggable
    if (isBoardTile) {
        tileElement.draggable = true;
    }

    return tileElement;
}

/**
 * Parses coordinates from a DOM element's data attributes.
 * @param {HTMLElement} element - The element (e.g., a square).
 * @returns {{x: number, y: number} | null} Coordinates object or null.
 */
function parseCoordsFromElement(element) {
    if (!element || !element.dataset) return null;
    const x = parseInt(element.dataset.coordX, 10);
    const y = parseInt(element.dataset.coordY, 10);
    if (!isNaN(x) && !isNaN(y)) {
        return { x, y };
    }
    return null;
}

// --- Tile Pool Rendering ---

/**
 * Renders the tiles available in the pool.
 * @param {object} poolTiles - Counts of available tiles {'A': count, ...}.
 * @param {string | null} selectedTileLetter - The letter of the currently selected pool tile.
 * @param {object} tileSetConfig - Tile set config containing values needed by createTileElement.
 */
export function renderTilePool(poolTiles, selectedTileLetter, tileSetConfig) {
    if (!tilePoolElement) return;

    tilePoolElement.innerHTML = ''; // Clear previous pool
    const fragment = document.createDocumentFragment();
    const sortedLetters = Object.keys(poolTiles).sort(); // Sort for consistent display

    for (const letter of sortedLetters) {
        const count = poolTiles[letter];
        if (count > 0) {
            const value = tileSetConfig?.values?.[letter] ?? 0;
            // Create one tile element for each available count
            for (let i = 0; i < count; i++) {
                const tileData = {
                    letter: letter,
                    value: value,
                    displayLetter: letter, // Display actual letter/symbol
                    isWildcard: letter === '*'
                };
                const tileElement = createTileElement(tileData, false); // Pool tile

                // Add selected class if applicable
                if (letter === selectedTileLetter && i === 0) { // Highlight only one instance if selected
                    tileElement.classList.add(CSS_CLASSES.TILE_SELECTED_POOL);
                } else {
                    tileElement.classList.remove(CSS_CLASSES.TILE_SELECTED_POOL);
                }

                fragment.appendChild(tileElement);
            }
        }
    }
    tilePoolElement.appendChild(fragment);
}


// --- Score & Countdown Rendering ---

/**
 * Updates the score display element.
 * @param {number} score - The score to display.
 */
export function renderScore(score) {
    if (scoreDisplayElement) {
        scoreDisplayElement.textContent = `Score: ${score}`;
    }
}

/**
 * Updates the countdown timer display.
 * @param {string} timeLeftString - Formatted time string (e.g., "HH:MM:SS").
 */
export function renderCountdown(timeLeftString) {
     if (countdownDisplayElement) {
        countdownDisplayElement.textContent = `Next: ${timeLeftString}`;
    }
}

// --- Validation & State Rendering ---

/**
 * Updates the enabled/disabled state and visual style of the submit button.
 * @param {boolean} isSubmittable - Whether the game state allows submission.
 */
export function renderSubmitButton(isSubmittable) {
    if (!submitButtonElement) return;
    if (isSubmittable) {
        submitButtonElement.classList.remove(CSS_CLASSES.SUBMIT_DISABLED);
        submitButtonElement.disabled = false;
        submitButtonElement.setAttribute('aria-disabled', 'false');
    } else {
        submitButtonElement.classList.add(CSS_CLASSES.SUBMIT_DISABLED);
        submitButtonElement.disabled = true;
        submitButtonElement.setAttribute('aria-disabled', 'true');
    }
}

/**
 * Applies/removes green borders to tiles that form potentially valid words.
 * @param {object} validWordMap - Map of word coordinate keys ("x1,y1-xN,yN") to boolean validity.
 */
export function renderWordHighlights(validWordMap) {
    if (!boardElement) return;

    // Clear previous highlights first
    boardElement.querySelectorAll(`.${CSS_CLASSES.VALID_WORD_TILE}`).forEach(el => {
        el.classList.remove(CSS_CLASSES.VALID_WORD_TILE);
    });

    // Apply new highlights
    for (const wordKey in validWordMap) {
        if (validWordMap[wordKey]) { // Only highlight valid words
            // Parse the coordinate keys from the wordKey (e.g., "2,2-2,4") -> ["2,2", "2,3", "2,4"]
            // This requires a helper function to parse ranges or store keys directly
            // Let's assume validWordMap keys are actually arrays of coordKeys for simplicity here.
            // OR, assume the key maps directly to the tiles involved in that word.
            // Simpler: Re-query based on segment keys if ScoringEngine provided them.
            // For now: Assume we need to find the tiles related to the wordKey somehow.
            // This part needs refinement based on how word segments/keys are stored.

            // Placeholder: If validWordMap provided segment.keys directly:
            // const tileKeys = validWordMap[wordKey].keys; // Hypothetical
            // if(tileKeys) {
            //    tileKeys.forEach(key => {
            //        const square = boardElement.querySelector(`[data-coord-key="${key}"]`);
            //        const tile = square?.querySelector(`.${CSS_CLASSES.TILE_BOARD}`);
            //        tile?.classList.add(CSS_CLASSES.VALID_WORD_TILE);
            //    });
            // }
        }
    }
    // TODO: Refine how validWordMap relates word validity back to specific tile elements.
    // Maybe GameManager needs to pass tileKeys -> isValid map instead?
}


// --- Drag and Drop Handling --- (To be added in Part 2)
/** Handles starting to drag a tile from the board. */
function handleBoardDragStart(event) {
    // ... Implementation in Part 2 ...
}
/** Handles dragging over a potential drop target. */
function handleDragOver(event) {
     // ... Implementation in Part 2 ...
}
/** Handles dropping a dragged element. */
function handleDrop(event) {
     // ... Implementation in Part 2 ...
}
/** Handles cleanup after any drag operation ends. */
function handleDragEnd(event) {
    // ... Implementation in Part 2 ...
}


// --- Theme Application --- (To be added in Part 2)
/**
 * Applies theme styles (e.g., colors) using CSS variables.
 * @param {object} themeData - The theme configuration object.
 */
export function applyTheme(themeData) {
    // ... Implementation in Part 2 ...
}

// --- Modals --- (To be added in Part 2)
// showTutorialModal, hideTutorialModal, showWildcardModal, hideWildcardModal,
// showSubmitConfirmModal, hideSubmitConfirmModal, showGameOverScreen,
// displayAchievementsUnlocked, showError, showLoading

// --- Animations --- (To be added in Part 2)
// animateTilePlacement, animateTileRemoval, animateBonusSquareLoad

// File: src/js/UIController.js
