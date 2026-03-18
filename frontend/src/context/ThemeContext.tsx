import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type AppTheme = 'dark' | 'light' | 'security-fabric'

interface ThemeContextValue {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
})

const STORAGE_KEY = 'fs-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(
    () => (localStorage.getItem(STORAGE_KEY) as AppTheme) ?? 'security-fabric',
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme)
    document.documentElement.classList.remove('light', 'security-fabric')
    if (theme !== 'dark') {
      document.documentElement.classList.add(theme)
    }
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
