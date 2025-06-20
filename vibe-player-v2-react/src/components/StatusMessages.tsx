import React, { useCallback } from 'react';
import { useStatusStore } from '../stores/status.store';
// import type { NotificationType } from '../types/status.types'; // Unused import

/**
 * @component StatusMessages
 * @description Displays global status, error, loading messages, or progress updates
 * from the `useStatusStore`. Messages can be styled based on their type and
 * are dismissible (unless it's a loading message).
 */
const StatusMessages: React.FC = () => {
  // Select state properties for display
  const { message, type, details, isLoading, progress } = useStatusStore(
    useCallback(
      (s) => ({
        message: s.message,
        type: s.type,
        details: s.details,
        isLoading: s.isLoading,
        progress: s.progress,
      }),
      [],
    ),
  );
  // Select the action. Actions returned from create() are part of the store's API.
  const clearStatusAction = useStatusStore(store => store.clearStatus); // Corrected: use 'store' to refer to the whole store API

  // Do not render if there's no message, or if it's just an idle loading state without a message
  if (!message && !isLoading) {
    return null;
  }
  if (!message && isLoading && type !== 'loading') { // Only show loading if type is 'loading' or a message is present
      return null;
  }


  /**
   * Determines the background color class based on the notification type.
   * @returns {string} Tailwind CSS background color class.
   */
  const getBackgroundColor = (): string => {
    // Ensure type is not null before switching
    const currentType = isLoading && !type ? 'loading' : type; // Prioritize isLoading for background if type isn't set
    switch (currentType) {
      case 'error':
        return 'bg-red-500 dark:bg-red-700';
      case 'success':
        return 'bg-green-500 dark:bg-green-700';
      case 'warning':
        return 'bg-yellow-500 dark:bg-yellow-600';
      case 'info':
        return 'bg-blue-500 dark:bg-blue-700';
      case 'loading':
        return 'bg-gray-500 dark:bg-gray-600'; // Consistent loading appearance
      default:
        return 'bg-gray-300 dark:bg-gray-500'; // Fallback, should ideally not be hit if type is always set
    }
  };

  const effectiveType = isLoading && !type ? 'loading' : type;


  return (
    <div
      className={`fixed top-4 right-4 p-4 rounded-md shadow-lg text-white ${getBackgroundColor()} max-w-sm sm:max-w-md z-50 transition-all duration-300 ease-in-out`}
      role="alert"
      aria-live={effectiveType === 'error' || effectiveType === 'warning' ? 'assertive' : 'polite'}
    >
      <div className="flex justify-between items-start">
        <div className="flex-grow">
          {message && <p className="font-semibold">{message}</p>}
          {details && <p className="text-sm mt-1 opacity-90">{details}</p>}

          {/* Display loading text or progress bar */}
          {isLoading && effectiveType === 'loading' && !progress && (
            <p className="text-sm mt-1 opacity-90">Loading, please wait...</p>
          )}
          {isLoading && effectiveType === 'loading' && typeof progress === 'number' && (
            <div className="mt-2">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full"
                  style={{ width: `${progress}%` }}
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ></div>
              </div>
              <p className="text-xs text-right mt-0.5">{progress.toFixed(0)}%</p>
            </div>
          )}
        </div>
        {/* Show dismiss button only if not a persistent loading message without progress */}
        {(!isLoading || typeof progress === 'number') && (
          <button
            onClick={clearStatusAction} // Use the selected action
            className="ml-3 -mt-1 -mr-1 p-1 rounded-full text-current hover:bg-black hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 transition-colors"
            aria-label="Dismiss message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default StatusMessages;
