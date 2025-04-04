// File: src/main.js

/**
 * @fileoverview Main entry point for the LetterLinks Clone application.
 * Imports the GameManager and initializes the application when the DOM is ready.
 */

import { init as initGameManager } from './js/GameManager.js';

/**
 * Initializes the application once the DOM is fully loaded.
 */
function main() {
    console.log("DOM Loaded. Initializing Application...");
    // Kick off the asynchronous initialization process in GameManager
    initGameManager().catch(error => {
        // Catch any top-level errors during initialization
        console.error("Unhandled Initialization Error in main.js:", error);
        // Try to display a user-friendly message if UIController might be partially available
        // Or just alert as a last resort.
        try {
             // Assuming UIController might have basic error display setup
             const errorDisplay = document.querySelector('#error-display');
             if(errorDisplay) {
                errorDisplay.textContent = `Critical Error: ${error.message}. Please refresh.`;
                errorDisplay.classList.add('visible');
             } else {
                 alert(`Critical Error: ${error.message}. Please refresh.`);
             }
        } catch (uiError) {
             alert(`Critical Error: ${error.message}. Please refresh.`);
        }
    });
}

// --- Execute ---

// Wait for the DOM to be fully loaded before initializing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    // DOMContentLoaded has already fired
    main();
}

// File: src/main.js
