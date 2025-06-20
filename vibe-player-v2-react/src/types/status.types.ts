// vibe-player-v2-react/src/types/status.types.ts
// vibe-player-v2/src/lib/types/status.types.ts

/**
 * @type NotificationType
 * @description Defines the possible types for status notifications, including a general loading state.
 */
export type NotificationType = "info" | "error" | "success" | "warning" | "loading";

/**
 * @interface StatusState
 * @description Defines the shape of the state for global status messages,
 * loading indicators, and progress tracking within the application.
 */
export interface StatusState {
  /** The main status message to display. Null if no message. */
  message: string | null;
  /** The type of notification, determining its visual style (e.g., color). */
  type: NotificationType | null;
  /** General loading indicator for the application. True if any global process is loading. */
  isLoading: boolean;
  /** Optional field for more detailed messages or technical error information. */
  details?: string | null;
  /** Optional progress value (0-100) for operations that support progress tracking, like file loading. */
  progress?: number | null;
}

/**
 * @interface StatusStoreActions
 * @description Defines the actions available on the status store.
 */
export interface StatusStoreActions {
  setStatus: (message: string | null, type?: NotificationType | null, details?: string | null) => void;
  setLoading: (isLoading: boolean, message?: string | null) => void;
  setProgress: (progress: number | null, messageString?: string | null) => void;
  clearStatus: () => void;
}

/**
 * @interface FullStatusStore
 * @description Combines StatusState with StatusStoreActions for the complete store type.
 */
export type FullStatusStore = StatusState & StatusStoreActions;
