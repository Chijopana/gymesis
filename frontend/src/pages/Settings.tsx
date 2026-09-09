import { useEffect, useState } from 'react'
import { Database, Eye, LayoutGrid, Save, Scale, Trash2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { useConfirm } from '../components/ConfirmDialog'
import { clearCacheByPrefix } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'
import {
  getTrainingSettings,
  getVisualSettings,
  saveTrainingSettings,
  saveVisualSettings,
  type DashboardView,
} from '../utils/settings'

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="list-row flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="soft-text block text-sm">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export default function Settings() {
  const { confirm, confirmDialog } = useConfirm()
  const [compactMode, setCompactMode] = useState(false)
  const [showTips, setShowTips] = useState(true)
  const [showReadinessScore, setShowReadinessScore] = useState(true)
  const [defaultDashboardView, setDefaultDashboardView] = useState<DashboardView>('overview')
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [restTimeSeconds, setRestTimeSeconds] = useState(90)

  useEffect(() => {
    const visual = getVisualSettings()
    setCompactMode(visual.compactMode)
    setShowTips(visual.showTips)
    setShowReadinessScore(visual.showReadinessScore)
    setDefaultDashboardView(visual.defaultDashboardView)

    const training = getTrainingSettings()
    setUnit(training.unit)
    setRestTimeSeconds(training.restTimeSeconds)
  }, [])

  // El modo compacto se aplica en vivo: se ve el efecto antes de guardar.
  useEffect(() => {
    document.documentElement.classList.toggle('compact-ui', compactMode)
  }, [compactMode])

  const saveAll = () => {
    saveVisualSettings({ compactMode, showTips, showReadinessScore, defaultDashboardView })
    saveTrainingSettings({ unit, restTimeSeconds })
    emitFeedback({ kind: 'success', title: 'Preferencias guardadas', message: 'Se aplicarán en toda la aplicación.' })
  }

  const clearLocalCache = async () => {
    const ok = await confirm({
      title: 'Vaciar datos guardados en este dispositivo',
      message:
        'Se borrarán las copias locales de rutinas, amigos e historial que la app usa para ir más rápido. No se pierde nada de tu cuenta: se volverán a descargar del servidor.',
      confirmLabel: 'Vaciar caché',
    })
    if (!ok) return

    clearCacheByPrefix('gymesis:')
    emitFeedback({ kind: 'info', title: 'Caché vaciada', message: 'Los datos se recargarán del servidor.' })
  }

  return (
    <>
      <Navbar />
      {confirmDialog}
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<LayoutGrid className="title-icon" />}
          title="Ajustes"
          subtitle="Cómo se ve la app y qué unidades usa al registrar entrenamientos."
          actions={
            <button type="button" className="btn-primary" onClick={saveAll}>
              <Save size={15} />
              Guardar cambios
            </button>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="panel space-y-3 p-5">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
              <Eye size={18} />
              Interfaz
            </h2>

            <ToggleRow
              label="Modo compacto"
              description="Menos espacio en blanco: cabe más información en pantalla."
              checked={compactMode}
              onChange={setCompactMode}
            />
            <ToggleRow
              label="Consejos diarios"
              description="Muestra un consejo de entrenamiento en el dashboard."
              checked={showTips}
              onChange={setShowTips}
            />
            <ToggleRow
              label="Nivel de preparación"
              description="Puntuación basada en tu constancia y frescura recientes."
              checked={showReadinessScore}
              onChange={setShowReadinessScore}
            />

            <div className="list-row space-y-2">
              <label className="field-label" htmlFor="defaultView">
                Vista inicial del dashboard
              </label>
              <select
                id="defaultView"
                className="field"
                value={defaultDashboardView}
                onChange={(event) => setDefaultDashboardView(event.target.value as DashboardView)}
              >
                <option value="overview">Resumen</option>
                <option value="insights">Analítica</option>
                <option value="actions">Acciones</option>
              </select>
            </div>
          </section>

          <div className="space-y-6">
            <section className="panel space-y-3 p-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Scale size={18} />
                Entrenamiento
              </h2>

              <div className="list-row space-y-2">
                <span className="field-label">Unidad de peso</span>
                <div className="flex gap-2">
                  {(['kg', 'lb'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn-soft flex-1 ${unit === value ? 'is-active' : ''}`}
                      onClick={() => setUnit(value)}
                      aria-pressed={unit === value}
                    >
                      {value === 'kg' ? 'Kilogramos (kg)' : 'Libras (lb)'}
                    </button>
                  ))}
                </div>
                <p className="soft-text text-xs">
                  Los datos siempre se guardan en kilogramos; esto sólo cambia cómo se muestran y se introducen.
                </p>
              </div>

              <div className="list-row space-y-2">
                <label className="field-label" htmlFor="restTime">
                  Descanso por defecto: {restTimeSeconds}s
                </label>
                <input
                  id="restTime"
                  type="range"
                  min={15}
                  max={300}
                  step={15}
                  value={restTimeSeconds}
                  onChange={(event) => setRestTimeSeconds(Number(event.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--brand)' }}
                />
                <div className="flex flex-wrap gap-2">
                  {[45, 60, 90, 120, 180].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`btn-soft btn-xs ${restTimeSeconds === value ? 'is-active' : ''}`}
                      onClick={() => setRestTimeSeconds(value)}
                    >
                      {value}s
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel space-y-3 p-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Database size={18} />
                Datos locales
              </h2>
              <p className="section-subtitle">
                La app guarda copias temporales para cargar más rápido y seguir funcionando con mala conexión.
              </p>
              <button type="button" className="btn-danger w-fit" onClick={clearLocalCache}>
                <Trash2 size={15} />
                Vaciar caché local
              </button>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
