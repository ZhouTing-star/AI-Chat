import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
}

export const useThemeStore = create(
  persist<ThemeState>(
    (set, get) => ({
      mode: 'light',
      setMode: (mode: ThemeMode) => set({ mode }),
      toggleMode: () => set({ mode: get().mode === 'light' ? 'dark' : 'light' }),
    }),
    {
      name: 'theme-store',
    }
  )
)
