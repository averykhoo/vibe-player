import React, { useCallback } from 'react';
import { useDtmfStore } from '../stores/dtmf.store';

/**
 * @component ToneDisplay
 * @description A React component that displays the sequence of detected DTMF tones
 * by subscribing to the `useDtmfStore`.
 */
const ToneDisplay: React.FC = () => {
  /**
   * Subscribes to the `dtmf` array from the `useDtmfStore`.
   * The `dtmf` array holds the sequence of detected DTMF characters.
   * `useCallback` is used here for the selector to ensure stability if the component
   * were to be memoized or have other dependencies.
   */
  const detectedTones = useDtmfStore(useCallback(s => s.dtmf, []));

  return (
    <div className="p-4 my-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800 min-h-[60px]">
      <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">
        Detected DTMF Tones:
      </h3>
      {detectedTones && detectedTones.length > 0 ? (
        <p className="text-gray-900 dark:text-gray-100 font-mono text-lg tracking-wider" aria-live="polite">
          {/* Display tones separated by a space for readability */}
          {detectedTones.join(' ')}
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No tones detected yet.
        </p>
      )}
    </div>
  );
};

export default ToneDisplay;
