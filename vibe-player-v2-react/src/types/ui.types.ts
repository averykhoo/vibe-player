// vibe-player-v2-react/src/types/ui.types.ts
export type Theme = 'light' | 'dark' | 'system';

export interface UiState {
  theme: Theme;
  isHelpModalOpen: boolean;
  isSettingsModalOpen: boolean; // Example, if a settings modal is planned
  // Add other UI-specific state properties here as needed
  // For example:
  // activeTab: string | null;
  // isSidebarOpen: boolean;
}
