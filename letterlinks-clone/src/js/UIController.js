// File: src/js/UIController.js

/**
 * @fileoverview Manages all DOM interactions, rendering game state,
 * handling user input events, managing modals, and playing animations.
 */

import { CSS_CLASSES, BONUS_TYPES, ANIMATION_DURATIONS, ACHIEVEMENT_DETAILS } from './Constants.js';
import * as Utils from './Utils.js';

// --- DOM Element References ---
// (These are assigned in the init function)

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
// Modal Elements
/** @type {HTMLElement | null} Global modal backdrop */
let modalBackdrop = null;
/** @type {HTMLElement | null} Tutorial modal container */
let tutorialModal = null;
/** @type {HTMLElement | null} Wildcard modal container */
let wildcardModal = null;
/** @type {HTMLElement | null} Wildcard grid element */
let wildcardGrid = null;
/** @type {HTMLElement | null} Submit confirmation modal container */
let confirmModal = null;
/** @type {HTMLElement | null} Submit confirmation preview board */
let confirmPreviewBoard = null;
/** @type {HTMLElement | null} Game Over modal container */
let gameOverModal = null;
/** @type {HTMLElement | null} Game Over score display */
let gameOverScore = null;
/** @type {HTMLElement | null} Game Over board display */
let gameOverBoard = null;
/** @type {HTMLElement | null} Game Over achievement list area */
let gameOverAchievements = null;
/** @type {HTMLElement | null} Loading modal/overlay */
let loadingModal = null;
/** @type {HTMLElement | null} Loading modal message element */
let loadingModalMessage = null;
/** @type {HTMLElement | null} Error message display area */
let errorDisplay = null;
/** @type {HTMLElement | null} Achievement unlocked notification area */
let achievementDisplay = null;
/** @type {number | null} Timeout ID for achievement display */
let achievementTimeout = null;


// --- Module State ---

/** @type {object} Callbacks provided by GameManager */
let gameCallbacks = {};
/** @type {object | null} Reference to the currently dragged tile element */
let draggedTileElement = null;
/** @type {{x: number, y: number} | null} Original coords of the dragged tile */
let dragStartCoords = null;
/** @type {string | null} Holds the letter of the tile selected from the pool */
let selectedPoolLetter = null;
/** @type {HTMLElement | null} Holds reference to the selected pool tile element for highlighting */
let selectedPoolTileElement = null;


// --- Initialization ---

/**
 * Initializes the UIController, gets element references, and sets up base event listeners.
 * @param {object} callbacks - Functions provided by GameManager to handle user actions.
 * @param {() => void} callbacks.onSubmitClick
 * @param {(coords: {x: number, y: number}) => void} callbacks.onBoardSquareClick
 * @param {(coords: {x: number, y: number}) => void} callbacks.onPlacedTileClick
 * @param {(letter: string, element: HTMLElement) => void} callbacks.onPoolTileClick
 * @param {() => void} callbacks.onResetClick
 * @param {() => void} callbacks.onHowToPlayClick
 * @param {(coords: {x: number, y: number}, element: HTMLElement) => void} callbacks.onPlacedTileDragStart
 * @param {(targetType: 'board' | 'pool' | 'off', coords?: {x: number, y: number}) => void} callbacks.onDrop
 * @param {(letter: string) => void} callbacks.onWildcardSelect
 * @param {() => void} callbacks.onWildcardCancel
 * @param {() => void} callbacks.onSubmitConfirm
 * @param {() => void} callbacks.onSubmitCancel
 * @param {() => void} callbacks.onTutorialClose
 * @param {() => void} callbacks.onGameOverClose
 * @param {(unlockedIds: string[]) => void} [callbacks.onDisplayedAchievementsCleared] - Optional callback.
 */
export function init(callbacks) {
    console.log("UIController initializing...");
    gameCallbacks = callbacks;

    // Get main element references
    appContainer = document.body; // Use body for modal overlay class
    boardElement = document.querySelector('#game-board');
    tilePoolElement = document.querySelector('#tile-pool');
    actionsElement = document.querySelector('#actions-area');
    scoreDisplayElement = document.querySelector('#score-display');
    countdownDisplayElement = document.querySelector('#countdown-display');
    submitButtonElement = document.querySelector('#submit-button');
    menuButtonElement = document.querySelector('#menu-button');
    menuOverlayElement = document.querySelector('#menu-overlay');
    modalBackdrop = document.querySelector('#modal-backdrop');
    tutorialModal = document.querySelector('#tutorial-modal');
    wildcardModal = document.querySelector('#wildcard-modal');
    wildcardGrid = document.querySelector('#wildcard-grid');
    confirmModal = document.querySelector('#confirm-modal');
    confirmPreviewBoard = document.querySelector('#confirm-preview-board');
    gameOverModal = document.querySelector('#game-over-modal');
    gameOverScore = document.querySelector('#game-over-score');
    gameOverBoard = document.querySelector('#game-over-board');
    gameOverAchievements = document.querySelector('#achievement-display-gameover'); // Get achievement list element
    loadingModal = document.querySelector('#loading-modal');
    loadingModalMessage = loadingModal?.querySelector('.message'); // Get message element inside loading modal
    errorDisplay = document.querySelector('#error-display');
    achievementDisplay = document.querySelector('#achievement-display');


    // Validate critical elements
    const criticalElements = { boardElement, tilePoolElement, submitButtonElement, menuButtonElement, modalBackdrop, loadingModal, loadingModalMessage };
    for (const key in criticalElements) {
        if (!criticalElements[key]) {
            console.error(`UIController Init Error: Required element "${key}" not found! Check index.html.`);
            displayError("Initialization Failed: UI elements missing.");
            return;
        }
    }

    setupEventListeners();
    console.log("UIController initialized.");
}

/**
 * Sets up global and persistent event listeners.
 */
function setupEventListeners() {
    submitButtonElement?.addEventListener('click', handleSubmitClick);
    menuButtonElement?.addEventListener('click', handleMenuToggle);
    menuOverlayElement?.querySelector('#reset-board-button')?.addEventListener('click', handleResetClick);
    menuOverlayElement?.querySelector('#how-to-play-button')?.addEventListener('click', handleHowToPlayClick);
    boardElement?.addEventListener('click', handleBoardClick);
    tilePoolElement?.addEventListener('click', handlePoolClick);
    boardElement?.addEventListener('dragstart', handleBoardDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
    modalBackdrop?.addEventListener('click', handleBackdropClick);
    document.addEventListener('click', handleOutsideMenuClick, true); // Use capture phase
    setupModalListeners(); // Add listeners for modal buttons
}

/** Sets up listeners specific to modal buttons. */
function setupModalListeners() {
    // Use optional chaining for safety
    tutorialModal?.querySelector('.close-button')?.addEventListener('click', () => gameCallbacks.onTutorialClose?.());
    tutorialModal?.querySelector('.skip-button')?.addEventListener('click', () => gameCallbacks.onTutorialClose?.());
    wildcardModal?.querySelector('.cancel-button')?.addEventListener('click', () => gameCallbacks.onWildcardCancel?.());
    wildcardGrid?.addEventListener('click', handleWildcardGridClick);
    confirmModal?.querySelector('.confirm-button')?.addEventListener('click', () => gameCallbacks.onSubmitConfirm?.());
    confirmModal?.querySelector('.cancel-button')?.addEventListener('click', () => gameCallbacks.onSubmitCancel?.());
    gameOverModal?.querySelector('.close-button')?.addEventListener('click', () => gameCallbacks.onGameOverClose?.());
}

// --- Event Handlers ---

/** Handles clicks on the submit button. */
function handleSubmitClick() {
    if (submitButtonElement && !submitButtonElement.disabled) {
        gameCallbacks.onSubmitClick?.();
    }
}

/** Handles clicks on the main menu toggle button. */
function handleMenuToggle(event) {
    event.stopPropagation();
    menuOverlayElement?.classList.toggle('visible');
}

/** Handles click outside the menu to close it. */
function handleOutsideMenuClick(event) {
    if (menuOverlayElement?.classList.contains('visible') &&
        !menuOverlayElement.contains(/** @type {Node} */ (event.target)) &&
        !menuButtonElement?.contains(/** @type {Node} */ (event.target))) {
        menuOverlayElement.classList.remove('visible');
    }
}

/** Handles clicks on the Reset Board menu item. */
function handleResetClick() {
    menuOverlayElement?.classList.remove('visible');
    gameCallbacks.onResetClick?.();
}

/** Handles clicks on the How to Play menu item. */
function handleHowToPlayClick() {
    menuOverlayElement?.classList.remove('visible');
    gameCallbacks.onHowToPlayClick?.();
}

/** Handles clicks within the board area (delegated). */
function handleBoardClick(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const square = target.closest(`.${CSS_CLASSES.SQUARE}`);
    const tileOnSquare = target.closest(`.${CSS_CLASSES.TILE_BOARD}`);

    if (tileOnSquare && square) {
        const coords = parseCoordsFromElement(square);
        if (coords) gameCallbacks.onPlacedTileClick?.(coords);
    } else if (square) {
        const coords = parseCoordsFromElement(square);
        if (coords) gameCallbacks.onBoardSquareClick?.(coords);
    }
}

/** Handles clicks within the tile pool area (delegated). */
function handlePoolClick(event) {
    const targetTile = /** @type {HTMLElement} */ (event.target).closest(`.${CSS_CLASSES.TILE_POOL}`);
    if (targetTile) {
        const letter = targetTile.dataset.letter;
        if (letter) {
            selectPoolTile(letter, targetTile); // Visually select
            gameCallbacks.onPoolTileClick?.(letter, targetTile); // Notify manager
        }
    }
}

/** Handles clicking a letter button in the wildcard grid. */
function handleWildcardGridClick(event) {
    const button = /** @type {HTMLElement} */ (event.target).closest(`.${CSS_CLASSES.WILDCARD_BUTTON}`);
    if (button) {
        const letter = button.dataset.letter;
        if (letter) gameCallbacks.onWildcardSelect?.(letter);
    }
}

/** Handles clicks on the modal backdrop to close modals (if appropriate). */
function handleBackdropClick() {
    if (wildcardModal?.classList.contains('visible')) {
        gameCallbacks.onWildcardCancel?.();
    } else if (confirmModal?.classList.contains('visible')) {
        gameCallbacks.onSubmitCancel?.();
    } else if (menuOverlayElement?.classList.contains('visible')){
        menuOverlayElement.classList.remove('visible');
    }
    // By default, don't close Tutorial, Game Over, Loading, or Error modals via backdrop
}

// --- Drag and Drop Handlers ---

/** Handles starting to drag a tile from the board. */
function handleBoardDragStart(event) {
    const target = /** @type {HTMLElement} */ (event.target);
    const tileElement = target.closest(`.${CSS_CLASSES.TILE_BOARD}`);
    const squareElement = target.closest(`.${CSS_CLASSES.SQUARE}`);

    if (tileElement && squareElement && event.dataTransfer) {
        draggedTileElement = tileElement;
        dragStartCoords = parseCoordsFromElement(squareElement);
        event.dataTransfer.setData('text/plain', tileElement.dataset.letter || '');
        event.dataTransfer.effectAllowed = 'move';
        // Use setTimeout to allow the browser to render the drag image before adding class
        setTimeout(() => tileElement.classList.add(CSS_CLASSES.TILE_DRAGGING), 0);
        if (dragStartCoords) gameCallbacks.onPlacedTileDragStart?.(dragStartCoords, tileElement);
    } else {
        event.preventDefault();
    }
}

/** Handles dragging over a potential drop target. */
function handleDragOver(event) {
    event.preventDefault(); // Necessary to allow dropping
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
}

/** Handles dropping a dragged element. */
function handleDrop(event) {
    event.preventDefault();
    if (!draggedTileElement || !dragStartCoords) return;

    const target = /** @type {HTMLElement} */ (event.target);
    const targetSquare = target.closest(`.${CSS_CLASSES.SQUARE}`);
    const targetPool = target.closest(`.${CSS_CLASSES.TILE_POOL_AREA}`);
    let dropTargetType = 'off';
    let dropCoords = null;

    if (targetSquare) {
        dropTargetType = 'board';
        dropCoords = parseCoordsFromElement(targetSquare);
        // Per previous decision, dropping on board doesn't move/swap, only remove original
        console.log("Dropped on board - treating as remove request for original tile.");
        gameCallbacks.onDrop?.('pool', undefined); // Signal removal by dropping on pool
    } else if (targetPool) {
        dropTargetType = 'pool';
        gameCallbacks.onDrop?.(dropTargetType, undefined); // Signal removal
    } else {
        // Dropped somewhere else (off target)
        dropTargetType = 'off';
        gameCallbacks.onDrop?.(dropTargetType, undefined); // Signal removal
    }
    // Cleanup happens in handleDragEnd regardless of drop target
}

/** Handles cleanup after any drag operation ends. */
function handleDragEnd(event) {
    if (draggedTileElement) {
        draggedTileElement.classList.remove(CSS_CLASSES.TILE_DRAGGING);
    }
    draggedTileElement = null;
    dragStartCoords = null;
}


// --- Core Rendering Functions ---

/** Renders the entire game board structure and placed tiles. */
export function renderBoard(size, boardLayout, boardTiles, validationStatus) {
    // ... (Implementation as provided before, ensure it uses Utils.coordKey, Utils.getCenterCoords, getBonusClass, createTileElement, parseCoordsFromElement correctly) ...
     if (!boardElement) return;
    boardElement.innerHTML = '';
    boardElement.style.setProperty('--board-size', size);
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
            squareElement.dataset.coordX = String(x); squareElement.dataset.coordY = String(y); squareElement.dataset.coordKey = key;

            const bonusType = boardLayout ? boardLayout[key] : null;
            if (bonusType) {
                const bonusClass = getBonusClass(bonusType);
                if (bonusClass) squareElement.classList.add(bonusClass);
                if (bonusType === BONUS_TYPES.STAR && !boardTiles[key]) { // Add star symbol if empty
                    squareElement.innerHTML = '<span class="material-symbols-outlined bonus-star-icon">star</span>'; // Example using icon font
                }
            }


            const tileData = boardTiles[key];
            if (tileData) {
                const tileElement = createTileElement(tileData, true);
                squareElement.appendChild(tileElement);
                if (invalidKeys.has(key)) {
                    tileElement.classList.add(CSS_CLASSES.INVALID_SUBMIT_TILE);
                }
                 // Remove star icon if tile is placed on star square
                if (key === centerKey) {
                    const starIcon = squareElement.querySelector('.bonus-star-icon');
                    if(starIcon) starIcon.remove();
                }
            }

            if (key === centerKey && validationStatus?.needsCenterStar) {
                squareElement.classList.add(CSS_CLASSES.INVALID_SUBMIT_STAR);
            } else {
                 squareElement.classList.remove(CSS_CLASSES.INVALID_SUBMIT_STAR);
            }
            fragment.appendChild(squareElement);
        }
    }
    boardElement.appendChild(fragment);
    applyWordHighlights(validationStatus?.validWordMap || {}); // Apply highlights after elements exist
}

/** Gets the appropriate CSS class for a bonus type. */
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

/** Creates a tile DOM element. */
function createTileElement(tileData, isBoardTile) {
    const tileElement = document.createElement('div');
    tileElement.classList.add(CSS_CLASSES.TILE);
    tileElement.classList.add(isBoardTile ? CSS_CLASSES.TILE_BOARD : CSS_CLASSES.TILE_POOL);
    tileElement.dataset.letter = tileData.letter;
    const letterSpan = document.createElement('span');
    letterSpan.classList.add(CSS_CLASSES.TILE_LETTER);
    letterSpan.textContent = tileData.displayLetter || tileData.letter;
    const valueSpan = document.createElement('span');
    valueSpan.classList.add(CSS_CLASSES.TILE_VALUE);
    valueSpan.textContent = String(tileData.value ?? 0);
    tileElement.appendChild(letterSpan);
    tileElement.appendChild(valueSpan);
    if (isBoardTile) tileElement.draggable = true;
    return tileElement;
}

/** Parses coordinates from a DOM element's data attributes. */
function parseCoordsFromElement(element) {
    if (!element || !element.dataset) return null;
    const x = parseInt(element.dataset.coordX, 10);
    const y = parseInt(element.dataset.coordY, 10);
    if (!isNaN(x) && !isNaN(y)) return { x, y };
    return null;
}

/** Renders the tiles available in the pool. */
export function renderTilePool(poolTiles, currentSelectedPoolLetter, tileSetConfig) {
    if (!tilePoolElement) return;
    selectedPoolLetter = currentSelectedPoolLetter; // Update internal tracker

    tilePoolElement.innerHTML = '';
    const fragment = document.createDocumentFragment();
    // Sort order might be defined by constants or preferred order
    const sortedLetters = Object.keys(poolTiles).sort((a, b) => a.localeCompare(b)); // Simple alpha sort

    let firstElementOfSelectedType = null; // Track the first element for highlighting

    for (const letter of sortedLetters) {
        const count = poolTiles[letter];
        if (count > 0) {
            const value = tileSetConfig?.values?.[letter] ?? 0;
            for (let i = 0; i < count; i++) {
                const tileData = { letter, value, displayLetter: letter, isWildcard: letter === '*' };
                const tileElement = createTileElement(tileData, false);
                fragment.appendChild(tileElement);
                // Track the first instance if it matches the selected letter
                if (letter === selectedPoolLetter && !firstElementOfSelectedType) {
                    firstElementOfSelectedType = tileElement;
                }
            }
        }
    }
    tilePoolElement.appendChild(fragment);

    // Apply selection highlight after all elements are added
    selectPoolTile(selectedPoolLetter, firstElementOfSelectedType);
}

/** Visually selects/deselects a pool tile element */
function selectPoolTile(letter, tileElement) {
    // Deselect previous
    if (selectedPoolTileElement) {
        selectedPoolTileElement.classList.remove(CSS_CLASSES.TILE_SELECTED_POOL);
        selectedPoolTileElement = null; // Clear reference
    }
    // Select new (only if element exists)
    if (tileElement && letter) {
        tileElement.classList.add(CSS_CLASSES.TILE_SELECTED_POOL);
        selectedPoolTileElement = tileElement; // Store reference
        // selectedPoolLetter is updated in renderTilePool call
    }
}

/** Updates the score display element. */
export function renderScore(score) {
    if (scoreDisplayElement) scoreDisplayElement.textContent = `Score: ${score}`;
}

/** Updates the countdown timer display. */
export function renderCountdown(timeLeftString) {
     if (countdownDisplayElement) countdownDisplayElement.textContent = `Next: ${timeLeftString}`;
}

/** Updates the enabled/disabled state and visual style of the submit button. */
export function renderSubmitButton(isSubmittable) {
    if (!submitButtonElement) return;
    if (isSubmittable) {
        submitButtonElement.classList.remove(CSS_CLASSES.SUBMIT_DISABLED);
        submitButtonElement.disabled = false;
    } else {
        submitButtonElement.classList.add(CSS_CLASSES.SUBMIT_DISABLED);
        submitButtonElement.disabled = true;
    }
}

/** Applies/removes green borders to tiles that form potentially valid words. */
function applyWordHighlights(validWordMap) {
    if (!boardElement) return;

    // Clear previous highlights first
    boardElement.querySelectorAll(`.${CSS_CLASSES.VALID_WORD_TILE}`).forEach(el => {
        el.classList.remove(CSS_CLASSES.VALID_WORD_TILE);
    });

    // Apply new highlights
    for (const wordKey in validWordMap) {
        if (validWordMap[wordKey]) { // Only highlight valid words
            // Assumption: wordKey is "x1,y1;x2,y2;..." representing tile coords in the word
            const coordKeys = wordKey.split(';');
            coordKeys.forEach(key => {
                // Find the square, then the tile within it
                const square = boardElement.querySelector(`.${CSS_CLASSES.SQUARE}[data-coord-key="${key}"]`);
                const tile = square?.querySelector(`.${CSS_CLASSES.TILE_BOARD}`);
                if (tile) { // Ensure tile exists before adding class
                    tile.classList.add(CSS_CLASSES.VALID_WORD_TILE);
                }
            });
        }
    }
}


// --- Theme Application ---

/**
 * Applies theme styles using CSS variables.
 * @param {object} themeData - The theme configuration object (e.g., { primaryColor: '#ff0000', tileBg: '#eee', ... }).
 */
export function applyTheme(themeData) {
    const root = document.documentElement;
    if (!themeData || typeof themeData !== 'object') {
        console.warn("Applying default theme styles (no theme data provided).");
        // Potentially clear existing custom properties if needed?
        return;
    }
    for (const key in themeData) {
        if (themeData.hasOwnProperty(key) && key !== 'id') { // Exclude theme id property
            const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.setProperty(cssVarName, themeData[key]);
        }
    }
     console.log("Theme applied:", themeData.id || 'custom');
}


// --- Modals ---

/** Helper to show/hide a modal and backdrop */
function setModalVisibility(modalElement, visible) {
     if (modalElement && modalBackdrop) {
        if (visible) {
            modalBackdrop.classList.add('visible');
            modalElement.classList.add('visible');
            appContainer?.classList.add(CSS_CLASSES.MODAL_OPEN);
        } else {
            modalElement.classList.remove('visible');
            const anyVisible = document.querySelector(`.${CSS_CLASSES.MODAL_CONTAINER}.visible`);
            if (!anyVisible) {
                 modalBackdrop.classList.remove('visible');
                 appContainer?.classList.remove(CSS_CLASSES.MODAL_OPEN);
             }
        }
    } else if(visible) {
         console.error("Attempted to show modal, but modal or backdrop element not found.", modalElement);
    }
}

/** Shows the Tutorial Modal */
export function showTutorialModal() { setModalVisibility(tutorialModal, true); }
/** Hides the Tutorial Modal */
export function hideTutorialModal() { setModalVisibility(tutorialModal, false); }

/** Shows the Wildcard Selection Modal */
export function showWildcardModal() {
     if (wildcardGrid) {
        wildcardGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        for (let i = 65; i <= 90; i++) {
            const letter = String.fromCharCode(i);
            const button = document.createElement('button');
            button.classList.add(CSS_CLASSES.WILDCARD_BUTTON);
            button.dataset.letter = letter; button.textContent = letter;
            fragment.appendChild(button);
        }
        wildcardGrid.appendChild(fragment);
    }
    setModalVisibility(wildcardModal, true);
}
/** Hides the Wildcard Selection Modal */
export function hideWildcardModal() { setModalVisibility(wildcardModal, false); }

/** Shows the Submit Confirmation Modal with a board preview. */
export function showSubmitConfirmModal(boardTiles, validWordMap, size, boardLayout) {
    if (confirmPreviewBoard) {
        confirmPreviewBoard.innerHTML = ''; // Clear previous
        confirmPreviewBoard.style.setProperty('--board-size', size);
        const validTileKeys = new Set();
         for (const wordKey in validWordMap) {
            if (validWordMap[wordKey]) {
                 const coordKeys = wordKey.split(';'); // Still assumes this key format
                 coordKeys.forEach(key => validTileKeys.add(key));
            }
        }
        const previewTiles = {};
        validTileKeys.forEach(key => {
            if (boardTiles[key]) previewTiles[key] = boardTiles[key];
        });
        const fragment = document.createDocumentFragment();
        for (let y = 0; y < size; y++) {
             for (let x = 0; x < size; x++) {
                const key = Utils.coordKey({ x, y });
                const square = document.createElement('div');
                square.classList.add(CSS_CLASSES.SQUARE);
                const bonus = boardLayout?.[key];
                if(bonus) square.classList.add(getBonusClass(bonus));
                 if(bonus === BONUS_TYPES.STAR && !previewTiles[key]) {
                    square.innerHTML = '<span class="material-symbols-outlined bonus-star-icon">star</span>';
                 }
                if (previewTiles[key]) {
                     square.appendChild(createTileElement(previewTiles[key], true));
                     // Remove star icon if tile is placed on star square
                    if (key === Utils.coordKey(Utils.getCenterCoords(size))) {
                        const starIcon = square.querySelector('.bonus-star-icon');
                        if(starIcon) starIcon.remove();
                    }
                }
                fragment.appendChild(square);
             }
        }
         confirmPreviewBoard.appendChild(fragment);
    }
    setModalVisibility(confirmModal, true);
}
/** Hides the Submit Confirmation Modal */
export function hideSubmitConfirmModal() { setModalVisibility(confirmModal, false); }

/** Shows the Game Over Modal/Screen. */
export function showGameOverScreen(finalScore, finalBoardTiles, boardLayout, size, newlyUnlockedIds = []) {
    if (gameOverScore) gameOverScore.textContent = String(finalScore);
    if (gameOverBoard) {
         gameOverBoard.innerHTML = '';
         gameOverBoard.style.setProperty('--board-size', size);
         const fragment = document.createDocumentFragment();
         for (let y = 0; y < size; y++) {
             for (let x = 0; x < size; x++) {
                const key = Utils.coordKey({ x, y });
                const square = document.createElement('div');
                square.classList.add(CSS_CLASSES.SQUARE);
                 const bonus = boardLayout?.[key];
                if(bonus) square.classList.add(getBonusClass(bonus));
                 if(bonus === BONUS_TYPES.STAR && !finalBoardTiles[key]) {
                    square.innerHTML = '<span class="material-symbols-outlined bonus-star-icon">star</span>';
                 }
                if (finalBoardTiles[key]) {
                    square.appendChild(createTileElement(finalBoardTiles[key], true));
                     // Remove star icon if tile is placed on star square
                     if (key === Utils.coordKey(Utils.getCenterCoords(size))) {
                        const starIcon = square.querySelector('.bonus-star-icon');
                        if(starIcon) starIcon.remove();
                    }
                }
                fragment.appendChild(square);
             }
         }
         gameOverBoard.appendChild(fragment);
    }
    // Display achievements
    if (gameOverAchievements) {
        if (newlyUnlockedIds.length > 0) {
            gameOverAchievements.innerHTML = 'New Achievements: ' + newlyUnlockedIds.map(id => ACHIEVEMENT_DETAILS[id]?.name || id).join(', ');
        } else {
            gameOverAchievements.innerHTML = ''; // Clear if none unlocked
        }
    }
    setModalVisibility(gameOverModal, true);
}
/** Hides the Game Over Modal */
export function hideGameOverScreen() { setModalVisibility(gameOverModal, false); }

/** Shows a generic loading overlay */
export function showLoading(message = "Loading...") {
    if (loadingModal && loadingModalMessage) {
        loadingModalMessage.textContent = message;
        setModalVisibility(loadingModal, true);
    } else {
        console.warn("Loading modal or message element not found.");
    }
}
/** Hides the loading overlay */
export function hideLoading() {
    setModalVisibility(loadingModal, false);
}

/** Displays an error message */
export function displayError(message) {
     if (errorDisplay) {
         errorDisplay.textContent = message;
         errorDisplay.classList.add('visible');
         setTimeout(() => errorDisplay.classList.remove('visible'), 5000);
     } else {
        console.error("Error display element not found. Message:", message);
        alert(`Error: ${message}`); // Fallback
     }
}

/** Briefly displays unlocked achievements notification */
export function displayAchievementsUnlocked(unlockedIds) {
    if (!achievementDisplay || unlockedIds.length === 0) return;
    const details = unlockedIds.map(id => ACHIEVEMENT_DETAILS[id]?.name || id).join(', ');
    achievementDisplay.textContent = `Unlocked: ${details}!`;
    achievementDisplay.classList.add('visible');
    if (achievementTimeout) clearTimeout(achievementTimeout);
    achievementTimeout = setTimeout(() => {
        achievementDisplay.classList.remove('visible');
        achievementTimeout = null;
        gameCallbacks?.onDisplayedAchievementsCleared?.(unlockedIds);
    }, ANIMATION_DURATIONS.ACHIEVEMENT_DISPLAY);
}


// --- Animations (Placeholders) ---

/** Placeholder: Animates tile placement */
export function animateTilePlacement(tileData, startRef, endCoords, onComplete) {
    console.log("Simulating tile placement animation for:", tileData.letter);
    if (onComplete) setTimeout(onComplete, 50); // Simulate short delay
}

/** Placeholder: Animates tile removal */
export function animateTileRemoval(tileElement, onComplete) {
    console.log("Simulating tile removal animation for:", tileElement?.dataset?.letter);
    if (onComplete) setTimeout(onComplete, 50);
}

/** Placeholder: Animates bonus squares appearing */
export function animateBonusSquareLoad(boardLayout, size) {
    console.log("Simulating bonus square load animation...");
    // In reality, loop through squares, apply animation class with delay
}

// File: src/js/UIController.js
