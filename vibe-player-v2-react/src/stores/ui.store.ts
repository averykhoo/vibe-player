// vibe-player-v2-react/src/stores/ui.store.ts
import { create } from 'zustand';
import type { UiState, Theme } from '@/types/ui.types'; // Corrected import path extension

const initialState: UiState = {
  theme: 'system', // Default theme
  isHelpModalOpen: false,
  isSettingsModalOpen: false,
  // activeTab: null,       // Example if added to UiState
  // isSidebarOpen: false,  // Example if added to UiState
};

export const useUiStore = create<UiState>((set) => ({
  ...initialState,
  // Actions
  setTheme: (theme: Theme) => set({ theme }),
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
//   persist<UiState>(
//     (set, get) => ({
//       ...initialState,
//       setTheme: (theme: Theme) => set({ theme }),
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
