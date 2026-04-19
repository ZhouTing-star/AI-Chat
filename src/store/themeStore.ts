import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

/**
 * 主题状态接口
 * 定义主题状态和操作方法
 * 暂时还没有实现这个功能
 */
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
