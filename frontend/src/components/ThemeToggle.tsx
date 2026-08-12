import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getInitialTheme, type Theme } from '../utils/theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <button
      type="button"
      onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-400/40 text-xs md:text-sm text-slate-700 bg-white/70 hover:bg-white dark:text-slate-100 dark:bg-slate-900 dark:border-slate-600"
      aria-label="Cambiar modo oscuro"
      aria-pressed={theme === 'dark'}
      title="Cambiar tema"
    >
      {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
      <span>{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
    </button>
  )
}
