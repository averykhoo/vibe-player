// File: src/data/themes/theme_default.js

/**
 * @fileoverview Defines the default color theme for the application.
 * Keys should correspond to CSS variables (camelCase -> --kebab-case).
 */

export const theme_default = {
    id: 'default', // Theme identifier
    // Base Colors
    backgroundColor: '#f0f4f8', // Light grayish blue background
    textColor: '#212529',      // Dark text
    primaryColor: '#0d6efd',   // Standard Bootstrap Blue
    secondaryColor: '#6c757d', // Standard Bootstrap Gray
    // Components
    headerBg: '#ffffff',
    boardBg: '#dde1e7',      // Slightly darker than page bg
    squareBorder: '#b0b8c0',
    poolBg: '#e9ecef',        // Light gray
    // Tiles
    tileBg: '#fff8dc',        // Cream (Cornsilk)
    tileText: '#343a40',      // Dark gray for text
    tileBorder: '#d8c8a8',    // Darker beige border
    tileSelectedBorder: '#0d6efd', // Blue outline when selected
    // Buttons
    buttonPrimaryBg: '#0d6efd',
    buttonPrimaryText: '#ffffff',
    buttonDisabledBg: '#adb5bd',
    buttonDisabledText: '#6c757d',
    // Modals
    modalBackdropBg: 'rgba(0, 0, 0, 0.5)',
    modalContentBg: '#ffffff',
    // Validation/Feedback
    validWordBorder: '#198754', // Green
    invalidSubmitBorder: '#dc3545', // Red
    // Bonus Squares
    bonusDlBg: '#a7d7f9',      // Light Blue
    bonusTlBg: '#0d6efd',      // Primary Blue
    bonusDwBg: '#f8a7a7',      // Light Pink/Red
    bonusTwBg: '#dc3545',      // Red
    bonusStarBg: '#ffc107',    // Yellow/Gold
    bonusText: '#ffffff',      // White text on colored bonuses (adjust per color if needed)
    starText: '#b38600'        // Darker text/icon for star
};

// File: src/data/themes/theme_default.js
