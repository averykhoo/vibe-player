// vibe-player-v2-react/src/components/StatusMessages.tsx
import { useStatusStore } from '../stores/status.store';

export default function StatusMessages() {
  const { isLoading, message, type, details, progress } = useStatusStore(state => ({
    isLoading: state.isLoading,
    message: state.message,
    type: state.type,
    details: state.details,
    progress: state.progress,
  }));

  // Do not render if no message and not loading, or if message is "Ready" (handled elsewhere)
  if (!isLoading && (!message || message === "Ready")) {
    return null;
  }

  return (
    <div className="p-2 space-y-1">
      {isLoading && (
        <div data-testid="status-loading" className="text-sm text-blue-600 bg-blue-100 p-3 rounded-md">
          <p>{message || 'Loading...'}</p>
          {typeof progress === 'number' && (
            <div className="w-full bg-blue-200 rounded-full h-2.5 mt-1">
              <div
                className="bg-blue-500 h-2.5 rounded-full"
                style={{ width: `${(progress * 100).toFixed(0)}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {!isLoading && type === 'error' && message && (
        <div data-testid="status-error" className="text-sm text-red-700 bg-red-100 p-3 rounded-md">
          <p className="font-semibold">Error: {message}</p>
          {details && <p className="text-xs mt-1">Details: {details}</p>}
        </div>
      )}

      {!isLoading && type === 'success' && message && message !== 'Ready' && (
        <div data-testid="status-success" className="text-sm text-green-700 bg-green-100 p-3 rounded-md">
          <p>{message}</p>
        </div>
      )}

      {!isLoading && type === 'info' && message && message !== 'Ready' && (
         <div data-testid="status-info" className="text-sm text-sky-700 bg-sky-100 p-3 rounded-md">
          <p>{message}</p>
        </div>
      )}
    </div>
  );
}
