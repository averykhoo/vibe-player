// vibe-player-v2-react/src/types/ui.types.ts

/**
 * @type Theme
 * @description Defines the possible UI themes for the application.
 * - 'light': Light mode.
 * - 'dark': Dark mode.
 * - 'system': Follows the operating system's theme preference.
 */
export type Theme = 'light' | 'dark' | 'system';

/**
 * @interface UiState
 * @description Defines the shape of the state for UI-related concerns,
 * such as theme selection and modal visibility.
 */
export interface UiState {
  /** The currently active theme. */
  theme: Theme;
  /** True if the help modal is currently open, false otherwise. */
  isHelpModalOpen: boolean;
  /** True if the settings modal is currently open, false otherwise. */
  isSettingsModalOpen: boolean;

  // Examples of other UI-specific state properties:
  /** Identifier for the currently active tab in a tabbed interface, if any. */
  // activeTab?: string | null;
  /** True if a sidebar (e.g., navigation) is currently open. */
  // isSidebarOpen?: boolean;
}
