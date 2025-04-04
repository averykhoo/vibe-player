// File: src/js/GameManager.js

/**
 * @fileoverview Main game orchestrator. Manages game state transitions,
 * handles user interactions, coordinates between different modules (UI, Logic, Storage),
 * manages timers, and controls the overall game flow.
 */

import GameState from './GameState.js'; // Note: Default export
import * as ConfigLoader from './ConfigLoader.js';
import * as LocalStorage from './LocalStorageManager.js';
import * as UIController from './UIController.js';
import * as WordValidator from './WordValidator.js';
import * as BoardController from './BoardController.js';
import * as TilePoolController from './TilePoolController.js';
import * as ScoringEngine from './ScoringEngine.js';
import * as AchievementManager from './AchievementManager.js';
import * as Utils from './Utils.js';
import { GAME_PHASES, SAVE_STATE_DEBOUNCE, COUNTDOWN_UPDATE_INTERVAL } from './Constants.js';

// --- Module State ---

/** @type {number | null} Timeout ID for debouncing state saves. */
let saveStateTimeout = null;
/** @type {number | null} Interval ID for the countdown timer. */
let countdownIntervalId = null;
/** @type {number | null} Timestamp for the next challenge reset. */
let nextResetTimestamp = null;

// --- Initialization ---

/**
 * Initializes the entire game application.
 * Loads configuration, checks for saved state, loads dictionary,
 * initializes UI, and starts the appropriate game phase.
 */
export async function init() {
    console.log("GameManager initializing...");
    setPhase(GAME_PHASES.LOADING);
    UIController.showLoading("Initializing..."); // Show loading indicator

    try {
        // 1. Load configuration for the current challenge period
        const config = ConfigLoader.getCurrentChallengeConfig();
        GameState.currentConfig = config;
        console.log("Loaded config:", config.id);

        // Apply theme early
        UIController.applyTheme(config.theme.data);

        // 2. Initialize Achievement Manager
        AchievementManager.init(); // Loads from localStorage

        // 3. Load Dictionary (Asynchronous)
        setPhase(GAME_PHASES.DICTIONARY_LOADING);
        UIController.showLoading("Loading Dictionary...");
        const dictionaryLoaded = await WordValidator.loadDictionary(config.dictionary.path);

        if (!dictionaryLoaded) {
            throw new Error(`Failed to load dictionary: ${config.dictionary.path}`);
        }
        UIController.showLoading("Preparing board..."); // Update loading message

        // 4. Check for saved state for this challenge attempt
        let savedState = LocalStorage.loadCurrentAttempt(config.id);
        let isRestored = false;

        // 5. Initialize Game State (Board, Pool)
        GameState.boardLayout = BoardController.generateBonusLayout(
            config.boardSize,
            config.bonusRules,
            config.bonusSeed
        );

        if (savedState) {
            console.log("Restoring saved game state.");
            GameState.restoreAttemptState(savedState);
            // Recalculate pool based on restored board
            GameState.poolTiles = TilePoolController.recalculatePoolState(
                Utils.generateTileListFromWords( // Regenerate the deterministic list first
                    await getDictionarySet(), // Need the actual dictionary Set here
                    config.totalTiles,
                    config.tileSeed,
                    config.wordFilterOptions
                ),
                GameState.boardTiles
            );
             isRestored = true;
        } else {
            console.log("Starting new game state.");
            GameState.resetForNewChallenge(); // Reset most state
            GameState.currentConfig = config; // Re-apply config after reset
            GameState.boardLayout = BoardController.generateBonusLayout(config.boardSize, config.bonusRules, config.bonusSeed); // Ensure layout is set
            // Initialize pool from full list generated deterministically
             GameState.poolTiles = TilePoolController.getInitialPoolState(
                 Utils.generateTileListFromWords(
                    await getDictionarySet(), // Need the actual dictionary Set here
                    config.totalTiles,
                    config.tileSeed,
                    config.wordFilterOptions
                 )
             );
             // Note: startTimestamp will be set when game *actually* starts
        }

        // 6. Initialize UI Controller with callbacks
        UIController.init({
            onSubmitClick: submitAttempt,
            onBoardSquareClick: handleBoardSquareClick,
            onPlacedTileClick: handlePlacedTileClick,
            onPoolTileClick: handlePoolTileSelection,
            onResetClick: handleResetRequest, // Confirmation might be added here
            onHowToPlayClick: showHowToPlay,
            onPlacedTileDragStart: handlePlacedTileDragStart,
            onDrop: handleDrop,
            onWildcardSelect: handleWildcardSelected,
            onWildcardCancel: handleWildcardCancel,
            onSubmitConfirm: confirmSubmission,
            onSubmitCancel: cancelSubmission,
            onTutorialClose: handleTutorialClose,
            onGameOverClose: handleGameOverClose,
            onDisplayedAchievementsCleared: AchievementManager.clearNewlyUnlocked // Pass through
        });

        // 7. Initial Render
        UIController.renderScore(GameState.finalScore); // Show 0 initially
        UIController.renderBoard(config.boardSize, GameState.boardLayout, GameState.boardTiles, GameState.validationStatus);
        UIController.renderTilePool(GameState.poolTiles, GameState.selectedTile?.letter, config.tileSet);

        // 8. Check Tutorial Requirement (only if not restoring state)
        const tutorialShown = LocalStorage.loadSetting(LS_KEYS.TUTORIAL_SHOWN, false);
        if (!tutorialShown && !isRestored) {
            setPhase(GAME_PHASES.TUTORIAL);
            UIController.hideLoading();
            UIController.showTutorialModal();
        } else {
            // Start game directly (or after board animation)
             setPhase(GAME_PHASES.BOARD_LOADING);
             // TODO: Trigger Board loading animation via UIController
             // For now, skip animation and go straight to playing
             // UIController.animateBonusSquareLoad(GameState.boardLayout, config.boardSize);
             // Need a callback or delay here before startGame
             startGame(isRestored); // Pass restoration status
        }

         // 9. Start Countdown Timer
         startCountdownTimer();


    } catch (error) {
        console.error("CRITICAL INITIALIZATION ERROR:", error);
        setPhase(GAME_PHASES.LOADING_FAILED);
        UIController.hideLoading();
        UIController.displayError(`Initialization failed: ${error.message}. Please refresh.`);
    }
}

/** Helper to get dictionary Set, needed for tile list generation */
async function getDictionarySet() {
    // Assuming WordValidator keeps the Set internally after loading
    // This is a slight coupling, maybe pass validator instance? Or have ConfigLoader cache it?
    // Let's refine this - WordValidator needs a method to get the Set *after* load.
    // Or, ConfigLoader loads it once and passes the Set around.

    // Simpler: Assume WordValidator loaded it and keeps it accessible (not ideal arch)
     if (!WordValidator.dictionaryLoadSucceeded()) {
         await WordValidator.loadDictionary(GameState.currentConfig.dictionary.path); // Try loading again if needed? Risky.
         if (!WordValidator.dictionaryLoadSucceeded()) throw new Error("Dictionary unavailable for tile generation");
     }
     // Need WordValidator to expose the Set or have ConfigLoader handle it.
     // Placeholder:
     // return WordValidator.getCurrentDictionarySet(); // Fictional method
     // Let's assume ConfigLoader handles resolving it fully:
     if(!GameState.currentConfig?.dictionary?.data) throw new Error("Dictionary data not resolved in config!");
     return GameState.currentConfig.dictionary.data; // Assumes ConfigLoader resolved it
     // --> This requires ConfigLoader to load/cache the dictionary itself or coordinate with WordValidator.
     // --> Let's stick to GameManager coordinating: GameManager calls loadDictionary, THEN calls generateTileList.

     // REVISED LOGIC for step 5 in init():
     // ... after WordValidator.loadDictionary succeeds ...
     const dictionarySet = WordValidator.getCurrentDictionarySet(); // NEW function needed in WordValidator
     const fullTileList = Utils.generateTileListFromWords(dictionarySet, config.totalTiles, config.tileSeed, config.wordFilterOptions);
     // ... now use fullTileList to init/recalculate pool ...

     // Requires adding getCurrentDictionarySet() to WordValidator.js
}


/**
 * Transitions the game state to Playing, sets start time if needed.
 * @param {boolean} isRestored - True if restoring from saved state.
 */
function startGame(isRestored = false) {
    console.log("Starting game (Restored:", isRestored, ")");
    setPhase(GAME_PHASES.PLAYING);
    UIController.hideLoading(); // Ensure loading is hidden

    if (!isRestored) {
        GameState.startTimestamp = Date.now();
        AchievementManager.resetAttemptTracking(); // Reset attempt specific trackers
        _saveCurrentAttemptState(); // Save initial empty state
    } else {
        // Ensure validation is run on restored state
        validateCurrentBoardState();
        UIController.renderBoard(GameState.currentConfig.boardSize, GameState.boardLayout, GameState.boardTiles, GameState.validationStatus);
        UIController.renderTilePool(GameState.poolTiles, GameState.selectedTile?.letter, GameState.currentConfig.tileSet);
        UIController.renderSubmitButton(GameState.validationStatus.isSubmittable);
    }
    // Ensure countdown is running
     if(!countdownIntervalId) startCountdownTimer();
}

// --- State Phase Management ---

/**
 * Sets the current game phase and logs it.
 * @param {string} newPhase - The phase string from GAME_PHASES.
 */
function setPhase(newPhase) {
    if (Object.values(GAME_PHASES).includes(newPhase)) {
        GameState.currentPhase = newPhase;
        console.log("Game Phase ->", newPhase);
        // Optional: Add class to body/app container for phase-specific CSS rules
        // document.body.dataset.gamePhase = newPhase;
    } else {
        console.error("Attempted to set invalid game phase:", newPhase);
    }
}

// --- User Action Handlers (Called by UIController callbacks) ---

/** Handles selection of a tile from the pool. */
function handlePoolTileSelection(letter, element) {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING) return;

    if (GameState.selectedTile && GameState.selectedTile.letter === letter) {
        // Deselect if clicking the same selected tile
        GameState.selectedTile = null;
         UIController.renderTilePool(GameState.poolTiles, null, GameState.currentConfig.tileSet); // Update UI
    } else if (TilePoolController.isTileAvailable(letter, GameState.poolTiles)) {
        const value = TilePoolController.getTileValue(letter, GameState.currentConfig.tileSet);
        GameState.selectedTile = { letter, value };
        UIController.renderTilePool(GameState.poolTiles, letter, GameState.currentConfig.tileSet); // Update UI
    }
     // Update selectedPoolLetter internal tracker in UIController as well if needed
     // UIController.selectPoolTile(letter, element); // Can be called directly if UIController exports it
}

/** Handles click on an empty board square (attempt placement). */
function handleBoardSquareClick(coords) {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING || !GameState.selectedTile) return;

    const tileToPlace = { ...GameState.selectedTile }; // Copy selected tile data

    if (tileToPlace.letter === '*') {
        // Wildcard placement: Show modal first
        GameState.transientState.wildcardPlacementCoords = coords; // Store target coords
        setPhase(GAME_PHASES.MODAL_WILDCARD);
        UIController.showWildcardModal();
    } else {
        // Regular tile placement
        placeTileOnBoard(coords, tileToPlace.letter, tileToPlace.value, false, tileToPlace.letter);
    }
}

/** Handles click on an already placed tile (trigger removal). */
function handlePlacedTileClick(coords) {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING) return;
    removeTileFromBoard(coords);
}

/** Handles start of dragging a placed tile. */
function handlePlacedTileDragStart(coords, element) {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING) return;
    // Logic handled by UIController setting drag state (draggedTileElement, dragStartCoords)
    console.log("Drag start:", coords);
}

/** Handles drop event after dragging a tile. */
function handleDrop(targetType, coords) {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING || !Utils.dragStartCoords) return; // Need dragStartCoords from UI

    const originalCoords = Utils.dragStartCoords; // Get from UI state
    Utils.dragStartCoords = null; // Clear drag state in Utils/UI

    if (targetType === 'pool' || targetType === 'off') {
        // Dropped off board or onto pool -> Remove tile
        removeTileFromBoard(originalCoords);
    } else if (targetType === 'board' && coords) {
        // Dropped onto another board square
        // Standard behavior: Move tile if target is empty, swap if target occupied?
        // Simpler behavior: Only allow drop on empty squares (effectively remove->place)
        // Let's try remove->place
        const tileData = GameState.boardTiles[Utils.coordKey(originalCoords)];
        if (tileData) {
             const removeResult = BoardController.removeTile(originalCoords, GameState.boardTiles, GameState.currentConfig.boardSize);
             if (removeResult.success) {
                 // Simulate placing it at the new spot
                 if (tileData.isWildcard) {
                     // Trigger wildcard selection again for the new spot
                     GameState.boardTiles = removeResult.updatedBoardTiles; // Temporarily update state without removed tile
                     GameState.transientState.wildcardPlacementCoords = coords;
                     setPhase(GAME_PHASES.MODAL_WILDCARD);
                     UIController.showWildcardModal();
                     // Note: Need to handle pool correctly - don't return wildcard to pool here!
                     // Maybe need a specific 'move' logic branch?
                     // Simpler: Just remove on drag, user has to re-select from pool/re-place.
                     // Let's revert to simpler: DRAG only removes (if dropped off board/pool).
                     console.warn("Tile move via drag-drop currently not supported, removing tile instead.");
                     removeTileFromBoard(originalCoords); // Treat drop on board as invalid move for now, just remove original

                 } else {
                     // Try placing at new coords
                     // This requires careful state management. Let's stick to simple drag-removal.
                      console.warn("Tile move via drag-drop currently not supported, removing tile instead.");
                      removeTileFromBoard(originalCoords);
                 }
             }
        }
    }
     // Final cleanup in UIController.handleDragEnd
}


/** Handles selection of a letter from the wildcard modal. */
function handleWildcardSelected(letter) {
    if (GameState.currentPhase !== GAME_PHASES.MODAL_WILDCARD || !GameState.transientState.wildcardPlacementCoords) return;

    const coords = GameState.transientState.wildcardPlacementCoords;
    const tileValue = TilePoolController.getTileValue('*', GameState.currentConfig.tileSet); // Should be 0

    // Proceed with placing the wildcard, using the selected letter for display
    placeTileOnBoard(coords, '*', tileValue, true, letter);

    // Reset transient state and phase
    GameState.transientState.wildcardPlacementCoords = null;
    UIController.hideWildcardModal();
    setPhase(GAME_PHASES.PLAYING); // Return to playing state AFTER placement logic finishes
}

/** Handles cancellation of wildcard selection. */
function handleWildcardCancel() {
    if (GameState.currentPhase !== GAME_PHASES.MODAL_WILDCARD) return;
    // Just close modal and return to playing state, tile remains selected in pool
    GameState.transientState.wildcardPlacementCoords = null;
    UIController.hideWildcardModal();
    setPhase(GAME_PHASES.PLAYING);
    // Need to ensure the original '*' tile is put back into selection state if needed
    GameState.selectedTile = { letter: '*', value: 0 }; // Re-select wildcard
    UIController.renderTilePool(GameState.poolTiles, '*', GameState.currentConfig.tileSet); // Update pool UI
}

/** Handles request to reset the current attempt. */
function handleResetRequest() {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING && GameState.currentPhase !== GAME_PHASES.GAME_OVER) return;

    // Optional: Add a confirmation dialog here? `if (confirm("Reset current board?")) { ... }`
    console.log("Resetting board attempt...");
    GameState.resetForBoardAttempt(); // Resets boardTiles, poolTiles, score, startTimestamp etc.
    // Recalculate initial pool state based on config
    const dictionarySet = WordValidator.getCurrentDictionarySet?.(); // Assuming this exists now
     if (!dictionarySet) {
         console.error("Dictionary not available for pool generation during reset!");
         // Handle error - maybe prevent reset or show message
         return;
     }
    const fullTileList = Utils.generateTileListFromWords(dictionarySet, GameState.currentConfig.totalTiles, GameState.currentConfig.tileSeed, GameState.currentConfig.wordFilterOptions);
    GameState.poolTiles = TilePoolController.getInitialPoolState(fullTileList);
    GameState.startTimestamp = Date.now(); // Set new start time for the attempt

    // Clear saved state for this attempt
    LocalStorage.clearCurrentAttempt(GameState.currentConfig.id);
    _saveCurrentAttemptState(); // Save the new empty state

    // Reset UI
    UIController.renderBoard(GameState.currentConfig.boardSize, GameState.boardLayout, GameState.boardTiles, GameState.validationStatus);
    UIController.renderTilePool(GameState.poolTiles, null, GameState.currentConfig.tileSet);
    UIController.renderScore(GameState.finalScore);
    UIController.renderSubmitButton(false); // Submit is initially disabled

    // Reset achievement attempt trackers
    AchievementManager.resetAttemptTracking();

    setPhase(GAME_PHASES.PLAYING); // Ensure back in playing state
}

/** Handles closing the tutorial modal. */
function handleTutorialClose() {
    LocalStorage.saveSetting(LS_KEYS.TUTORIAL_SHOWN, true); // Mark as shown
    UIController.hideTutorialModal();
    // Proceed to start the game
    setPhase(GAME_PHASES.BOARD_LOADING); // Or straight to PLAYING if no animation
    // UIController.animateBonusSquareLoad(...); // Start animation
    startGame(false); // Start game as new attempt
}

/** Handles closing the Game Over modal. */
function handleGameOverClose() {
    UIController.hideGameOverScreen();
    // Optionally clear newly unlocked achievements display if shown separately
    AchievementManager.clearNewlyUnlocked();
    // Potentially transition to an IDLE state or reload for next challenge check?
    // For now, just hide modal. User can refresh or wait for reset.
    setPhase(GAME_PHASES.PLAYING); // Or maybe a specific IDLE_AFTER_GAME phase?
}


// --- Core Logic Wrappers ---

/**
 * Internal function to handle placing a tile on the board data and updating state.
 * @param {object} coords - Target coordinates {x, y}.
 * @param {string} letter - The actual letter ('*' for wildcard).
 * @param {number} value - The tile's point value.
 * @param {boolean} isWildcard - If the tile is a wildcard.
 * @param {string} displayLetter - The letter to display (chosen letter for wildcard).
 */
function placeTileOnBoard(coords, letter, value, isWildcard, displayLetter) {
     const config = GameState.currentConfig;
     const placeResult = BoardController.placeTile(coords, { letter, value, isWildcard, displayLetter }, GameState.boardTiles, config.boardSize);

     if (placeResult.success) {
         // Update board state
         GameState.boardTiles = placeResult.updatedBoardTiles;

         // Update pool state
         GameState.poolTiles = TilePoolController.recalculatePoolState(
             Utils.generateTileListFromWords(WordValidator.getCurrentDictionarySet(), config.totalTiles, config.tileSeed, config.wordFilterOptions), // Regenerate full list needed
             GameState.boardTiles
         );

         // Clear selection from pool
         const previouslySelected = GameState.selectedTile?.letter;
         GameState.selectedTile = null;

         // Trigger validation
         validateCurrentBoardState();

         // Save debounced state
         _saveCurrentAttemptState();

         // Update UI
         UIController.renderBoard(config.boardSize, GameState.boardLayout, GameState.boardTiles, GameState.validationStatus);
         UIController.renderTilePool(GameState.poolTiles, null, config.tileSet); // Deselect pool tile visually
         UIController.renderSubmitButton(GameState.validationStatus.isSubmittable);

         // Trigger animation (optional - needs implementation)
         // UIController.animateTilePlacement(...);

         // Check achievements related to placement
         const bonusType = GameState.boardLayout?.[Utils.coordKey(coords)];
         AchievementManager.checkAchievements('TILE_PLACED', { tileData: { letter, isWildcard }, bonusType });

     } else {
         // Placement failed (e.g., square occupied) - maybe provide UI feedback?
         console.warn(`Failed to place tile at ${Utils.coordKey(coords)}`);
         // If placement failed because it was wildcard -> modal flow, don't clear selection
         if (letter !== '*') {
              GameState.selectedTile = null; // Clear selection if placement failed for non-wildcard
              UIController.renderTilePool(GameState.poolTiles, null, config.tileSet); // Update pool UI
         }
     }
}

/**
 * Internal function to handle removing a tile from the board data and updating state.
 * @param {object} coords - Coordinates {x, y} of the tile to remove.
 */
function removeTileFromBoard(coords) {
     const config = GameState.currentConfig;
     const removeResult = BoardController.removeTile(coords, GameState.boardTiles, config.boardSize);

     if (removeResult.success) {
         // Update board state
         GameState.boardTiles = removeResult.updatedBoardTiles;

         // Update pool state
          GameState.poolTiles = TilePoolController.recalculatePoolState(
              Utils.generateTileListFromWords(WordValidator.getCurrentDictionarySet(), config.totalTiles, config.tileSeed, config.wordFilterOptions),
              GameState.boardTiles
          );

         // Clear selection from pool if active
         GameState.selectedTile = null;

         // Trigger validation
         validateCurrentBoardState();

          // Save debounced state
         _saveCurrentAttemptState();

         // Update UI
         UIController.renderBoard(config.boardSize, GameState.boardLayout, GameState.boardTiles, GameState.validationStatus);
         UIController.renderTilePool(GameState.poolTiles, null, config.tileSet);
         UIController.renderSubmitButton(GameState.validationStatus.isSubmittable);

         // Trigger animation (optional)
         // UIController.animateTileRemoval(...);
     } else {
          console.warn(`Failed to remove tile at ${Utils.coordKey(coords)}`);
     }
}


/** Validates the current board state and updates GameState.validationStatus */
function validateCurrentBoardState() {
    const { boardTiles, boardLayout, currentConfig } = GameState;
    const { boardSize } = currentConfig;
    const centerCoords = Utils.getCenterCoords(boardSize);

    // 1. Check Connectivity and Center Star
    const submitState = BoardController.validateSubmissionState(boardTiles, boardSize, centerCoords);

    // 2. Find and Validate Words
    const potentialSegments = ScoringEngine.findAllWordSegments(boardTiles, boardSize); // Assuming this is moved or duplicated from ScoringEngine
    const validWordMap = {}; // Store as "coord1;coord2;...": boolean
    let hasAtLeastOneValidWord = false;

    for (const segment of potentialSegments) {
         const isValid = WordValidator.isValid(segment.word);
         const wordKey = segment.keys.join(';'); // Create a unique key from coordinate keys
         validWordMap[wordKey] = isValid;
         if (isValid) {
             hasAtLeastOneValidWord = true;
         }
    }

    // Update GameState
    GameState.validationStatus = {
        isSubmittable: submitState.isConnected && submitState.includesCenter && hasAtLeastOneValidWord,
        needsCenterStar: submitState.isConnected && !submitState.includesCenter,
        discontinuityCoords: submitState.discontinuityCoords,
        validWordMap: validWordMap,
    };
     // console.log("Validation Status Updated:", GameState.validationStatus); // Debug
}

// --- Submission Flow ---

/** Initiates the submission process. */
function submitAttempt() {
    if (GameState.currentPhase !== GAME_PHASES.PLAYING || !GameState.validationStatus.isSubmittable) return;

     // Double check time hasn't expired
     if (nextResetTimestamp && Date.now() >= nextResetTimestamp) {
         console.warn("Submit aborted: Challenge time expired.");
         handleForcedReset(); // Trigger reset immediately
         return;
     }

    setPhase(GAME_PHASES.MODAL_CONFIRM_SUBMIT);
    UIController.showSubmitConfirmModal(
        GameState.boardTiles,
        GameState.validationStatus.validWordMap,
        GameState.currentConfig.boardSize,
        GameState.boardLayout
    );
}

/** Confirms submission after user interaction. */
function confirmSubmission() {
    if (GameState.currentPhase !== GAME_PHASES.MODAL_CONFIRM_SUBMIT) return;

    setPhase(GAME_PHASES.SCORING);
    UIController.hideSubmitConfirmModal();
    UIController.showLoading("Calculating score..."); // Optional quick loading message

    // Calculate score
    const scoreResult = ScoringEngine.calculateFinalScore(
        GameState.boardTiles,
        GameState.boardLayout,
        GameState.currentConfig.tileSet,
        GameState.currentConfig.boardSize,
        WordValidator.isValid // Pass the validation function
    );

    GameState.finalScore = scoreResult.finalScore;
    const endTime = Date.now();
    const duration = GameState.startTimestamp ? endTime - GameState.startTimestamp : 0;

    // Check achievements
    AchievementManager.checkAchievements('GAME_END', {
        finalScore: scoreResult.finalScore,
        duration: duration,
        maxWordScore: scoreResult.maxWordScore
        // Pass gamesPlayed count if needed for FIRST_GAME
    });
    const newlyUnlocked = AchievementManager.getNewlyUnlocked();

    // Save result to history
    LocalStorage.saveGameResult({
        challengeId: GameState.currentConfig.id,
        startTimestamp: GameState.startTimestamp,
        endTimestamp: endTime,
        finalScore: scoreResult.finalScore,
        finalBoardState: { // Snapshot relevant state
            boardTiles: Utils.simpleDeepClone(GameState.boardTiles),
            boardLayout: Utils.simpleDeepClone(GameState.boardLayout)
        }
    });

    // Clear current attempt state from localStorage
    LocalStorage.clearCurrentAttempt(GameState.currentConfig.id);
    // Clear any pending save timeout
    if (saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = null;

    // Stop countdown? Or let it run? Let it run for now.

    // Transition to Game Over
    setPhase(GAME_PHASES.GAME_OVER);
    UIController.hideLoading();
    UIController.renderScore(GameState.finalScore); // Update final score display in header too
    UIController.showGameOverScreen(
        scoreResult.finalScore,
        GameState.boardTiles, // Show final board
        GameState.boardLayout,
        GameState.currentConfig.boardSize
    );

    // Display newly unlocked achievements (if any)
    if (newlyUnlocked.length > 0) {
        UIController.displayAchievementsUnlocked(newlyUnlocked);
        // GameManager might want a callback from UIController when display finishes
        // so it can call AchievementManager.clearNewlyUnlocked()
    }
}

/** Cancels the submission process. */
function cancelSubmission() {
    if (GameState.currentPhase !== GAME_PHASES.MODAL_CONFIRM_SUBMIT) return;
    UIController.hideSubmitConfirmModal();
    setPhase(GAME_PHASES.PLAYING);
}

// --- Timers & Reset ---

/** Starts the countdown timer to the next challenge reset. */
function startCountdownTimer() {
    if (countdownIntervalId) clearInterval(countdownIntervalId); // Clear existing timer

    nextResetTimestamp = ConfigLoader.calculateNextResetTimestamp(GameState.currentConfig);

    const updateTimer = () => {
        const now = Date.now();
        const remaining = nextResetTimestamp - now;

        if (remaining <= 0) {
            UIController.renderCountdown("00:00:00");
            stopCountdownTimer(); // Clear interval
            handleForcedReset(); // Trigger reset
        } else {
            UIController.renderCountdown(Utils.formatTimeCountdown(remaining));
        }
    };

    updateTimer(); // Initial update
    countdownIntervalId = setInterval(updateTimer, COUNTDOWN_UPDATE_INTERVAL);
}

/** Stops the countdown timer. */
function stopCountdownTimer() {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
        console.log("Countdown timer stopped.");
    }
}

/** Handles the forced reset when the countdown reaches zero. */
function handleForcedReset() {
    console.log("Forced Reset Triggered!");
    stopCountdownTimer(); // Ensure timer is stopped

    // Check if currently in a critical phase (e.g., mid-save?) - maybe add guards
    if (GameState.currentPhase === GAME_PHASES.SCORING) {
         console.warn("Reset triggered during scoring, potential race condition.");
         // Allow scoring to finish? Or force reset? Force reset for simplicity.
    }

    setPhase(GAME_PHASES.RESETTING);
    UIController.showLoading("Loading next challenge..."); // Show feedback

    // Clear state for the *expired* challenge
    if (GameState.currentConfig && GameState.currentConfig.id) {
         LocalStorage.clearCurrentAttempt(GameState.currentConfig.id);
    }
    // Reset transient state immediately
    GameState.selectedTile = null;
    if(saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = null;


    // Short delay to allow UI update, then re-initialize
    setTimeout(() => {
        init(); // Re-run the entire initialization process
    }, 100); // Small delay
}

// --- Misc ---

/** Shows the tutorial modal */
function showHowToPlay() {
    // GameManager doesn't manage tutorial state directly, tells UI to show it
    UIController.showTutorialModal();
    // Set a temporary phase if needed? Or just let UI handle overlay?
    // Let UI handle overlay, keep phase PLAYING maybe? Or add MODAL_TUTORIAL phase.
    // Let's add a phase for clarity.
    if(GameState.currentPhase === GAME_PHASES.PLAYING) {
         // store currentPhase?
         setPhase(GAME_PHASES.TUTORIAL); // Or MODAL_TUTORIAL
         // Need corresponding logic in handleTutorialClose to return to PLAYING
    }

}

// --- Persistence ---

/** Debounced function to save current attempt state. */
const _saveCurrentAttemptState = Utils.debounce(() => {
    if (GameState.currentPhase === GAME_PHASES.PLAYING || GameState.currentPhase === GAME_PHASES.BOARD_LOADING) { // Only save during active play/restore
         LocalStorage.saveCurrentAttempt(
            GameState.currentConfig.id,
            GameState.boardTiles,
            GameState.startTimestamp
        );
         console.log("Debounced state saved."); // Debug
    }
}, SAVE_STATE_DEBOUNCE);


// File: src/js/GameManager.js
