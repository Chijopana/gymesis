import { useEffect, useState } from 'react'
import { Eye, LayoutGrid, Save } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { getVisualSettings, saveVisualSettings } from '../utils/settings'

export default function Settings() {
  const [compactMode, setCompactMode] = useState(false)
  const [showTips, setShowTips] = useState(true)
  const [showReadinessScore, setShowReadinessScore] = useState(true)
  const [defaultDashboardView, setDefaultDashboardView] = useState<'overview' | 'insights' | 'actions'>('overview')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const settings = getVisualSettings()
    setCompactMode(settings.compactMode)
    setShowTips(settings.showTips)
    setShowReadinessScore(settings.showReadinessScore)
    setDefaultDashboardView(settings.defaultDashboardView)
  }, [])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2200)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const saveAll = () => {
    saveVisualSettings({ compactMode, showTips, showReadinessScore, defaultDashboardView })
    if (compactMode) {
      document.documentElement.classList.add('compact-ui')
    } else {
      document.documentElement.classList.remove('compact-ui')
    }
    setStatusMessage('Preferencias guardadas')
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<LayoutGrid className="title-icon" />}
          title="Settings"
          subtitle="Ajustes visuales y de uso para mostrar solo lo útil."
        />

        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}

        <section className="panel p-5 stack-gap max-w-2xl">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Eye size={18} />Visual</h2>

          <label className="flex items-center justify-between gap-3 border border-slate-400/30 dark:border-slate-700 rounded p-3">
            <span className="text-sm">Modo compacto (menos espacio y bloques más densos)</span>
            <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-3 border border-slate-400/30 dark:border-slate-700 rounded p-3">
            <span className="text-sm">Mostrar tips diarios</span>
            <input type="checkbox" checked={showTips} onChange={(e) => setShowTips(e.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-3 border border-slate-400/30 dark:border-slate-700 rounded p-3">
            <span className="text-sm">Mostrar score de preparación</span>
            <input type="checkbox" checked={showReadinessScore} onChange={(e) => setShowReadinessScore(e.target.checked)} />
          </label>

          <div className="stack-gap border border-slate-400/30 dark:border-slate-700 rounded p-3">
            <div className="text-sm">Vista por defecto en Dashboard</div>
            <select className="field" value={defaultDashboardView} onChange={(e) => setDefaultDashboardView(e.target.value as 'overview' | 'insights' | 'actions')}>
              <option value="overview">Resumen</option>
              <option value="insights">Insights</option>
              <option value="actions">Acciones</option>
            </select>
          </div>

          <button type="button" className="btn-primary inline-flex items-center gap-1 w-fit" onClick={saveAll}><Save size={14} />Guardar cambios</button>
        </section>
      </main>
    </>
  )
}
