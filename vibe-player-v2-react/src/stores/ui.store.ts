// vibe-player-v2-react/src/stores/ui.store.ts
import { create } from 'zustand';
import type { UiState as UiStateType, Theme as ThemeType } from '@/types/ui.types'; // Corrected import path extension

// Re-export types
export type { UiStateType as UiState };
export type { ThemeType as Theme };

const initialState: UiStateType = {
  theme: 'system', // Default theme
  isHelpModalOpen: false,
  isSettingsModalOpen: false,
  // activeTab: null,       // Example if added to UiState
  // isSidebarOpen: false,  // Example if added to UiState
};

export const useUiStore = create<UiStateType>((set) => ({
  ...initialState,
  // Actions
  setTheme: (theme: ThemeType) => set({ theme }),
  toggleHelpModal: (isOpen?: boolean) =>
    set((state) => ({ isHelpModalOpen: isOpen === undefined ? !state.isHelpModalOpen : isOpen })),
  toggleSettingsModal: (isOpen?: boolean) =>
    set((state) => ({ isSettingsModalOpen: isOpen === undefined ? !state.isSettingsModalOpen : isOpen })),
  // Example for other actions:
  // setActiveTab: (activeTab: string | null) => set({ activeTab }),
  // toggleSidebar: (isOpen?: boolean) =>
  //   set((state) => ({ isSidebarOpen: isOpen === undefined ? !state.isSidebarOpen : isOpen })),
}));

// Optional: Persist parts of the UI store, like the theme preference
// import { persist, createJSONStorage } from 'zustand/middleware';
// export const useUiStore = create(
//   persist<UiStateType>(
//     (set, get) => ({
//       ...initialState,
//       setTheme: (theme: ThemeType) => set({ theme }),
//       toggleHelpModal: (isOpen?: boolean) =>
//         set((state) => ({ isHelpModalOpen: isOpen === undefined ? !state.isHelpModalOpen : isOpen })),
//       toggleSettingsModal: (isOpen?: boolean) =>
//         set((state) => ({ isSettingsModalOpen: isOpen === undefined ? !state.isSettingsModalOpen : isOpen })),
//     }),
//     {
//       name: 'ui-storage', // unique name
//       storage: createJSONStorage(() => localStorage),
//       partialize: (state) => ({ theme: state.theme }), // Only persist the theme
//     }
//   )
// );
