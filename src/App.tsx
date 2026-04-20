import { useEffect } from 'react'
import { AppRouter } from './router/index'
import { useThemeStore } from './store/themeStore'

function App() {
  const themeMode = useThemeStore((state) => state.mode)

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  return <AppRouter />
}

export default App