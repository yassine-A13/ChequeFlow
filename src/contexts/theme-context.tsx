import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme } from './theme-context-core'

export type { Theme } from './theme-context-core'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('chequeflow-theme') ?? localStorage.getItem('cheque-reminder-theme')
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  })

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
      root.style.colorScheme = root.classList.contains('dark') ? 'dark' : 'light'
    }
    localStorage.setItem('chequeflow-theme', theme)
    localStorage.removeItem('cheque-reminder-theme')
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
