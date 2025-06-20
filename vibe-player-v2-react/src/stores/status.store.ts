// vibe-player-v2-react/src/stores/status.store.ts
import { create } from 'zustand';
import type { StatusState, NotificationType, FullStatusStore } from '@/types/status.types'; // Import FullStatusStore

// Re-export the main state type and NotificationType if they are directly used by components for typing props, etc.
export type { StatusState };
export type { NotificationType };

const initialState: StatusState = { // This is just the state part, actions are separate in create()
  message: null,
  type: null,
  isLoading: false,
  details: null,
  progress: null,
};

/**
 * @store useStatusStore
 * @description Zustand store for managing global application status, notifications, and loading states.
 *
 * @property {string | null} message - The main status message.
 * @property {NotificationType | null} type - The type of notification ('info', 'error', 'success', 'warning', 'loading').
 * @property {boolean} isLoading - Indicates if a global loading process is active.
 * @property {string | null} details - Optional additional details for the status message.
 * @property {number | null} progress - Optional progress value (0-100) for ongoing operations.
 *
 * @action setStatus - Sets a new status message, type, and details. Adjusts isLoading based on type.
 * @action setLoading - Specifically sets the loading state and an optional loading message.
 * @action setProgress - Updates the progress of an ongoing operation.
 * @action clearStatus - Resets the status to its initial empty/idle state.
 */
export const useStatusStore = create<FullStatusStore>((set) => ({
  ...initialState, // Spread initial state properties

  // Define actions
  setStatus: (
    message: string | null,
    type: NotificationType | null = 'info',
    details: string | null = null
  ) =>
    set({
      message,
      type,
      details,
      isLoading: type === 'loading',
      progress: null
    }),
  setLoading: (isLoading: boolean, message: string | null = 'Loading...') =>
    set({
      isLoading,
      message: isLoading ? message : null,
      type: isLoading ? 'loading' : null,
      details: null,
      progress: null
    }),
  setProgress: (progress: number | null, messageString?: string | null) =>
    set((state: StatusState) => ({ // state here is StatusState, not FullStatusStore
      ...state,
      progress,
      message: messageString !== undefined ? messageString : state.message,
      isLoading: progress !== null && progress < 100,
      type: (progress !== null && progress < 100) ? 'loading' : state.type
    })),
  clearStatus: () => set({ ...initialState, isLoading: false, type: null, message: null, details: null, progress: null }), // Ensure all relevant fields are reset
}));
