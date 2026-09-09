import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { applyTheme, getStoredTheme, watchSystemTheme, type Theme } from '../utils/theme'

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    // En modo "system" hay que repintar si el usuario cambia el tema del SO.
    if (theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: 'var(--line-strong)', background: 'var(--panel-sunken)' }}
      role="group"
      aria-label="Tema de la interfaz"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setTheme(value)}
          className="rounded-md px-2 py-1.5 transition-colors"
          style={
            theme === value
              ? { background: 'var(--brand-tint-strong)', color: 'var(--brand-strong)' }
              : { color: 'var(--text-faint)' }
          }
          aria-pressed={theme === value}
          title={`Tema: ${label}`}
        >
          <Icon size={15} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  )
}
