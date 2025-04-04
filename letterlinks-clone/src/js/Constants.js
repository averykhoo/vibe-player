// File: src/js/Constants.js

/**
 * @fileoverview Defines application-wide constants not specific to challenge configurations.
 * Includes game phases, local storage keys, default IDs, CSS classes, and timings.
 */

// --- Game Phases ---

/**
 * Enum for the different phases the game can be in.
 * @enum {string}
 */
export const GAME_PHASES = {
    LOADING: 'LOADING',                 // Initial loading of config/assets
    LOADING_FAILED: 'LOADING_FAILED',   // Critical asset failed to load
    DICTIONARY_LOADING: 'DICTIONARY_LOADING', // Waiting for dictionary fetch
    TUTORIAL: 'TUTORIAL',               // Showing the tutorial modal (first time users)
    BOARD_LOADING: 'BOARD_LOADING',     // Animating bonus squares onto the board
    PLAYING: 'PLAYING',                 // Main interactive game phase
    MODAL_WILDCARD: 'MODAL_WILDCARD',   // Wildcard letter selection modal is open
    MODAL_CONFIRM_SUBMIT: 'MODAL_CONFIRM_SUBMIT', // Submit confirmation modal is open
    SCORING: 'SCORING',                 // Score calculation is in progress after submit confirmation
    GAME_OVER: 'GAME_OVER',             // Game finished, showing results screen
    RESETTING: 'RESETTING',             // Brief state during midnight forced reset
};

// --- Local Storage Keys ---

/**
 * Keys used for storing data in the browser's localStorage.
 * @enum {string}
 */
export const LS_KEYS = {
    TUTORIAL_SHOWN: 'letterlinks_tutorial_shown',      // Boolean flag
    SETTINGS: 'letterlinks_settings',                  // Generic settings object (e.g., theme pref)
    ACHIEVEMENTS: 'letterlinks_achievements',          // Stored achievement status object
    GAME_HISTORY: 'letterlinks_game_history',          // Array of recent game result objects
    CURRENT_ATTEMPT_PREFIX: 'letterlinks_attempt_',    // Prefix for saving current game state (append challengeId)
    DICTIONARY_CACHE_PREFIX: 'letterlinks_dict_',      // Prefix for caching fetched dictionaries (append dictionaryPath)
};

// --- Achievement Definitions ---
// (Moved from AchievementManager for better separation of constants vs logic)

/**
 * Enum defining unique IDs for each achievement.
 * @enum {string}
 */
export const ACHIEVE_ID = {
    FIRST_GAME: 'FIRST_GAME',
    SCORE_BREAKER_200: 'SCORE_BREAKER_200',
    HIGH_SCORER_500: 'HIGH_SCORER_500',
    WORD_WHIZ_50: 'WORD_WHIZ_50',
    LEXICOGRAPHER_100: 'LEXICOGRAPHER_100',
    BONUS_HUNTER: 'BONUS_HUNTER',
    WILD_THING: 'WILD_THING',
    SPEED_THINKER_200_90S: 'SPEED_THINKER_200_90S',
    LIGHTNING_LINKS_400_180S: 'LIGHTNING_LINKS_400_180S',
    BLITZ_FINISH_30S: 'BLITZ_FINISH_30S',
};

/**
 * Display names and descriptions for achievements.
 * Used by UIController and potentially AchievementManager for logging.
 * @type {Record<string, {name: string, description: string}>}
 */
export const ACHIEVEMENT_DETAILS = {
    [ACHIEVE_ID.FIRST_GAME]: { name: "First Game", description: "Complete your first game." },
    [ACHIEVE_ID.SCORE_BREAKER_200]: { name: "Score Breaker", description: "Score over 200 points in a single game." },
    [ACHIEVE_ID.HIGH_SCORER_500]: { name: "High Scorer", description: "Score over 500 points in a single game." },
    [ACHIEVE_ID.WORD_WHIZ_50]: { name: "Word Whiz", description: "Score 50+ points with a single word." },
    [ACHIEVE_ID.LEXICOGRAPHER_100]: { name: "Lexicographer", description: "Score 100+ points with a single word." },
    [ACHIEVE_ID.BONUS_HUNTER]: { name: "Bonus Hunter", description: "Use DL, TL, DW, and TW squares in one game." },
    [ACHIEVE_ID.WILD_THING]: { name: "Wild Thing", description: "Use both wildcard tiles in one game." },
    [ACHIEVE_ID.SPEED_THINKER_200_90S]: { name: "Quick Thinker", description: "Score 200+ points in under 90 seconds." },
    [ACHIEVE_ID.LIGHTNING_LINKS_400_180S]: { name: "Lightning Links", description: "Score 400+ points in under 3 minutes." },
    [ACHIEVE_ID.BLITZ_FINISH_30S]: { name: "Blitz Finish", description: "Complete a game within 30 seconds." },
};


// --- Default Configuration IDs ---

/** Default board size if not specified by challenge. */
export const DEFAULT_BOARD_SIZE = 5;

/** Default bonus counts for 5x5 if not specified. */
export const DEFAULT_BONUS_COUNTS = { DL: 4, TL: 2, DW: 4, TW: 2 };

/** Default minimum distance between bonus squares. */
export const DEFAULT_MIN_BONUS_DISTANCE = 1;

/** Default target number of tiles (before wildcards) if not specified. */
export const DEFAULT_TOTAL_TILES_TARGET = 35; // Results in 37 total tiles with 2 wildcards

/** Default ID for the English dictionary path/data. */
export const DEFAULT_DICTIONARY_ID = 'en';

/** Default ID for the English Scrabble tile set values/frequencies. */
export const DEFAULT_TILE_SET_ID = 'en_scrabble';

/** Default ID for the visual theme. */
export const DEFAULT_THEME_ID = 'default';

/** Default options for word filtering during tile list generation. */
export const DEFAULT_WORD_FILTER_OPTIONS = { minLength: 3, maxLength: 8 };

/** How many recent games to store in history. */
export const GAME_HISTORY_LIMIT = 20;

// --- Bonus Types ---

/**
 * Enum for bonus square types.
 * @enum {string}
 */
export const BONUS_TYPES = {
    DL: 'DL', // Double Letter
    TL: 'TL', // Triple Letter
    DW: 'DW', // Double Word
    TW: 'TW', // Triple Word
    STAR: 'STAR' // Center Star (not technically a score bonus)
};

// --- CSS Classes ---

/**
 * CSS class names used for styling and DOM manipulation.
 * @enum {string}
 */
export const CSS_CLASSES = {
    // Layout & Core
    APP_CONTAINER: 'app-container',
    HEADER: 'game-header',
    SCORE_DISPLAY: 'score-display',
    COUNTDOWN_DISPLAY: 'countdown-display',
    MENU_BUTTON: 'menu-button',
    BOARD_AREA: 'board-area',
    TILE_POOL_AREA: 'tile-pool-area',
    ACTIONS_AREA: 'actions-area',
    // Board
    BOARD: 'game-board',
    SQUARE: 'board-square',
    BONUS_DL: 'bonus-dl',
    BONUS_TL: 'bonus-tl',
    BONUS_DW: 'bonus-dw',
    BONUS_TW: 'bonus-tw',
    BONUS_STAR: 'bonus-star',
    // Tiles
    TILE: 'letter-tile',
    TILE_LETTER: 'tile-letter',
    TILE_VALUE: 'tile-value',
    TILE_POOL: 'tile-pool', // Specific style for tiles in the pool
    TILE_BOARD: 'tile-board', // Specific style for tiles on the board
    TILE_DRAGGING: 'tile-dragging', // Applied while dragging a tile
    TILE_GHOST: 'tile-ghost', // Optional: for drag preview
    // States & Validation
    TILE_SELECTED_POOL: 'tile-selected-pool',
    VALID_WORD_TILE: 'tile-valid-word',
    INVALID_SUBMIT_TILE: 'tile-invalid-submit',
    INVALID_SUBMIT_STAR: 'star-invalid-submit',
    SUBMIT_BUTTON: 'submit-button',
    SUBMIT_DISABLED: 'submit-disabled',
    // Modals
    MODAL_BACKDROP: 'modal-backdrop',
    MODAL_CONTAINER: 'modal-container',
    MODAL_OPEN: 'modal-open', // Applied to body or app container when modal is open
    MODAL_TUTORIAL: 'modal-tutorial',
    MODAL_WILDCARD: 'modal-wildcard',
    MODAL_CONFIRM: 'modal-confirm-submit',
    MODAL_GAME_OVER: 'modal-game-over',
    MODAL_LOADING: 'modal-loading', // For dictionary/init loading
    MODAL_ERROR: 'modal-error', // For critical errors
    // Specific Modal Content
    WILDCARD_GRID: 'wildcard-grid',
    WILDCARD_BUTTON: 'wildcard-button',
    CONFIRM_PREVIEW_BOARD: 'confirm-preview-board',
    GAMEOVER_SCORE: 'gameover-score',
    GAMEOVER_BOARD: 'gameover-board',
    ACHIEVEMENT_UNLOCKED_DISPLAY: 'achievement-unlocked-display', // Temporary notification
    // Menu
    MENU_OVERLAY: 'menu-overlay',
    MENU_ITEM: 'menu-item',

    ACHIEVEMENT_DISPLAY_GAMEOVER: 'achievement-display-gameover', // Added ID from index.html

};

// --- Animation Timings ---

/**
 * Durations for various animations in milliseconds.
 * @enum {number}
 */
export const ANIMATION_DURATIONS = {
    TILE_FLY: 300,
    BONUS_LOAD_ITEM: 100, // Duration for each bonus marker animation
    BONUS_LOAD_DELAY: 50,  // Delay between each bonus marker animation start
    MODAL_FADE: 200,
    ACHIEVEMENT_FADE: 300, // Fade in/out for unlocked notification
    ACHIEVEMENT_DISPLAY: 3000, // How long notification stays visible
};

// --- Other Constants ---

/** Debounce time for saving game state to localStorage in milliseconds. */
export const SAVE_STATE_DEBOUNCE = 750;

/** Interval for updating the countdown timer in milliseconds. */
export const COUNTDOWN_UPDATE_INTERVAL = 1000;

// File: src/js/Constants.js
