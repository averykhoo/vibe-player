// File: src/js/WordValidator.js

/**
 * @fileoverview Handles loading the dictionary (from cache or fetch) and
 * validating words against it.
 */

import * as LocalStorage from './LocalStorageManager.js';

// --- Module State ---

/** @type {Set<string>} The currently loaded dictionary word set. */
let currentDictionary = new Set();
/** @type {boolean} Flag indicating if a load operation is currently in progress. */
let isLoading = false;
/** @type {boolean} Flag indicating if a dictionary has been successfully loaded. */
let isLoaded = false;
/** @type {string | null} Path of the currently loaded dictionary (for cache keying). */
let currentDictionaryPath = null;

// --- Public Methods ---

/**
 * Asynchronously loads the dictionary for the given path, prioritizing localStorage cache.
 * Updates module state (isLoading, isLoaded, currentDictionary).
 * @param {string} dictionaryPath Path to the .txt dictionary file (should include version param for cache invalidation).
 * @returns {Promise<boolean>} Promise resolving to true if loading succeeded, false otherwise.
 */
export async function loadDictionary(dictionaryPath) {
    // Don't reload if already loaded for the same path
    if (isLoaded && dictionaryPath === currentDictionaryPath) {
        console.log(`Dictionary already loaded for: ${dictionaryPath}`);
        return true;
    }
    // Prevent concurrent loads
    if (isLoading) {
        console.warn(`Dictionary loading already in progress for: ${currentDictionaryPath || dictionaryPath}. Aborting new request.`);
        // How to handle this? Wait for existing promise? For now, just return false.
        return false; // Or return a promise that resolves when current load finishes? Keep simple.
    }

    isLoading = true;
    isLoaded = false; // Reset loaded status until success
    currentDictionaryPath = dictionaryPath; // Store path we are trying to load
    currentDictionary = new Set(); // Clear previous dictionary data
    console.log(`Attempting to load dictionary for: ${dictionaryPath}`);

    // 1. Try loading from cache first
    try {
        const cachedSet = LocalStorage.loadDictionaryCache(dictionaryPath);
        if (cachedSet instanceof Set) {
            console.log("Dictionary loaded from localStorage cache.");
            currentDictionary = cachedSet;
            isLoaded = true;
            isLoading = false;
            return true;
        }
    } catch (cacheError) {
        // Log cache loading errors but proceed to fetch
        console.error("Error loading dictionary from cache:", cacheError);
    }


    // 2. If not cached, fetch from network
    console.log(`Dictionary not cached, fetching from network: ${dictionaryPath}`);
    try {
        const response = await fetch(dictionaryPath);
        if (!response.ok) {
            // Log specific HTTP error status
            throw new Error(`HTTP error! status: ${response.status} for ${dictionaryPath}`);
        }
        const text = await response.text();
        const words = text.split(/\r?\n/); // Split by new line
        const wordSet = new Set();
        let validWords = 0;
        for (const word of words) {
            // Normalize to uppercase and trim whitespace
            const trimmedWord = word.trim().toUpperCase();
            // Add only non-empty strings
            if (trimmedWord.length > 0) {
                wordSet.add(trimmedWord);
                validWords++;
            }
        }

        // Check if any words were actually added
        if (validWords === 0) {
             throw new Error(`Fetched dictionary file seems empty or invalid: ${dictionaryPath}`);
        }

        currentDictionary = wordSet;
        isLoaded = true;
        console.log(`Dictionary fetched successfully: ${currentDictionary.size} words.`);

        // 3. Save to cache on successful fetch
        LocalStorage.saveDictionaryCache(dictionaryPath, currentDictionary);

        return true;
    } catch (error) {
        console.error("Failed to fetch or parse dictionary:", error);
        // Ensure state reflects failure
        currentDictionary = new Set();
        isLoaded = false;
        currentDictionaryPath = null; // Reset path as load failed
        return false;
    } finally {
        isLoading = false; // Ensure loading flag is reset regardless of outcome
    }
}

/**
 * Checks if the dictionary has finished its *last loading attempt* (successfully or not).
 * Useful for waiting in GameManager.init.
 * @returns {boolean} True if not currently in the middle of a fetch/parse operation.
 */
export function dictionaryIsReady() {
    return !isLoading;
}

/**
 * Checks if a dictionary was successfully loaded and is ready for use.
 * @returns {boolean} True if a dictionary is loaded.
 */
export function dictionaryLoadSucceeded() {
    return isLoaded;
}

/**
 * Checks if a word exists in the currently loaded dictionary.
 * Performs case-insensitive check by converting input word to uppercase.
 * Returns false if the dictionary isn't loaded successfully.
 * @param {string} word The word to check.
 * @returns {boolean} True if the word is valid according to the loaded dictionary.
 */
export function isValid(word) {
    // Ensure dictionary is loaded and word is a non-empty string
    if (!isLoaded || !word || typeof word !== 'string' || word.trim().length === 0) {
        return false;
    }
    // Check against the Set (assuming Set contains uppercase words)
    return currentDictionary.has(word.toUpperCase());
}

// File: src/js/WordValidator.js
