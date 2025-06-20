import React, { useRef, useCallback } from 'react';
import { audioOrchestrator } from '../services/AudioOrchestrator.service';
// import { Button } from './ui/button'; // Removed: shadcn/ui Button not available
// import { Label } from './ui/label'; // Removed: shadcn/ui Label not available

/**
 * @component FileLoader
 * @description A React functional component that provides a user interface for selecting
 * local audio files. Once a file is selected, it uses the AudioOrchestrator service
 * to load and analyze the audio.
 */
const FileLoader: React.FC = () => {
  /**
   * Reference to the file input element.
   */
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handles the change event of the file input.
   * When a file is selected, it retrieves the file and passes it to the
   * AudioOrchestrator service for processing.
   * Uses `useCallback` for memoization, though dependencies are stable here.
   * @param {React.ChangeEvent<HTMLInputElement>} event - The file input change event.
   */
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        console.log('[FileLoader] File selected:', file.name);
        audioOrchestrator.loadFileAndAnalyze(file).catch((error) => {
          console.error("[FileLoader] Error during loadFileAndAnalyze:", error);
          // Optionally, update a global error state here via a store
        });
      }
      // Reset the input value to allow selecting the same file again
      if (event.target) {
        event.target.value = '';
      }
    },
    [], // audioOrchestrator is a stable singleton instance
  );

  /**
   * Handles the click event of the "Select File" button.
   * Programmatically clicks the hidden file input to open the file dialog.
   */
  const handleButtonClick = () => {
    // Programmatically click the hidden file input
    fileInputRef.current?.click();
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
      <label
        htmlFor="audio-file-input-styled"
        className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        Load Audio File
      </label>
      {/* Hidden file input that will be triggered by the button */}
      <input
        type="file"
        id="audio-file-input-actual" // Keep this id for the actual input if needed for other logic
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="audio/*"
        className="hidden" // Visually hidden
        aria-hidden="true"
      />
      {/* Button that users will interact with */}
      <button
        id="audio-file-input-styled" // This ID can be used for the label's htmlFor
        onClick={handleButtonClick}
        type="button" // Important for non-form buttons
        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:border-gray-600"
      >
        Select File
      </button>
      {/*
        Optional: Could display the selected file name or loading status here by
        subscribing to relevant parts of `usePlayerStore` or `useStatusStore`.
        For example:
        const fileName = usePlayerStore(state => state.fileName);
        const status = useStatusStore(state => state.message);
        ...
        {fileName && <p className="mt-2 text-xs text-gray-500">Selected: {fileName}</p>}
        {status && <p className="mt-2 text-xs text-blue-500">{status}</p>}
      */}
    </div>
  );
};

export default FileLoader;
