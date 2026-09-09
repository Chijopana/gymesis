import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BellRing,
  Dumbbell,
  Flame,
  RefreshCw,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import MiniBarChart from '../components/MiniBarChart'
import PageHeader from '../components/PageHeader'
import { SkeletonCards } from '../components/Skeleton'
import { friendService, getErrorMessage, groupService, routineService, trainingService } from '../services/api'
import { getCachedOrFetch } from '../utils/cache'
import { computeWorkoutAnalytics, type HistoryEntry } from '../utils/trainingAnalytics'
import { getDashboardAutoRefresh, getVisualSettings, saveDashboardAutoRefresh } from '../utils/settings'
import { useAuthStore } from '../store/authStore'

type View = 'overview' | 'insights' | 'actions'

type Insights = {
  predictedNextWeekVolumeKg: number
  predictedNextSessionVolumeKg: number
  currentStreakDays: number
  daysSinceLastSession: number
  weeklyTrendPercent: number
  volumeLast7DaysKg: number
  confidence: 'low' | 'medium' | 'high'
  momentum: 'up' | 'stable' | 'down'
}

const EMPTY_INSIGHTS: Insights = {
  predictedNextWeekVolumeKg: 0,
  predictedNextSessionVolumeKg: 0,
  currentStreakDays: 0,
  daysSinceLastSession: 0,
  weeklyTrendPercent: 0,
  volumeLast7DaysKg: 0,
  confidence: 'low',
  momentum: 'stable',
}

const TIPS = [
  'Dedica 2 minutos a movilidad antes de cada sesión.',
  'Registra también los días flojos: la constancia real se mide con todo.',
  'Descansos consistentes hacen que tu progreso sea comparable entre semanas.',
  'Invita a alguien nuevo cada semana para mantener la motivación.',
  'Sube el peso sólo cuando completes todas las series objetivo.',
  'Dormir 7-8 h rinde más que cualquier suplemento.',
  'Anota cómo te sentiste: explica los picos y los bajones.',
]

const REFRESH_INTERVAL_MS = 60_000
const kg = (value: number) => `${value.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg`

function StatCard({
  icon: Icon,
  label,
  value,
  to,
  linkLabel,
}: {
  icon: typeof Dumbbell
  label: string
  value: number | string
  to: string
  linkLabel: string
}) {
  return (
    <Link to={to} className="panel panel-hover block p-5">
      <div className="soft-text flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-2 text-4xl font-bold tabular-nums">{value}</div>
      <span className="mt-3 inline-block text-sm font-semibold" style={{ color: 'var(--brand-strong)' }}>
        {linkLabel} →
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const visualSettings = useMemo(() => getVisualSettings(), [])
  const username = useAuthStore((state) => state.user?.username)
  const [mainView, setMainView] = useState<View>(visualSettings.defaultDashboardView)
  const [stats, setStats] = useState({ routines: 0, friends: 0, trainings: 0, groups: 0 })
  const [pending, setPending] = useState({ friendRequests: 0, routineInvites: 0 })
  const [analytics, setAnalytics] = useState(() => computeWorkoutAnalytics([]))
  const [insights, setInsights] = useState<Insights>(EMPTY_INSIGHTS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(getDashboardAutoRefresh)
  const [cacheNotice, setCacheNotice] = useState('')

  /**
   * Contador de peticiones en vuelo. Con dos cargas solapadas (el doble montaje
   * de StrictMode, o el auto-refresco pisando a un "Actualizar" manual), la que
   * terminaba antes escribia sus resultados encima de la mas reciente: se veian
   * los datos bien y a la vez un banner de error de la carga anterior.
   */
  const requestId = useRef(0)

  const loadDashboard = useCallback(async (silent = false) => {
    const thisRequest = ++requestId.current
    const isStale = () => thisRequest !== requestId.current

    try {
      setError('')
      setCacheNotice('')
      if (!silent) setLoading(true)
      setRefreshing(true)

      const [routines, friends, trainings, insightData, groups] = await Promise.all([
        getCachedOrFetch(
          'gymesis:dashboard:routines',
          async () => {
            const [routinesRes, invitationsRes] = await Promise.all([
              routineService.getRoutines(),
              routineService.getInvitations(),
            ])
            return {
              routines: routinesRes.data.routines || [],
              invitations: invitationsRes.data.invitations || [],
            }
          },
          { ttlMs: 60_000, version: 3 }
        ),
        getCachedOrFetch('gymesis:dashboard:friends', () => friendService.getFriends().then((r) => r.data.friendships || []), {
          ttlMs: 45_000,
          version: 3,
        }),
        getCachedOrFetch('gymesis:dashboard:history', () => trainingService.getHistory().then((r) => r.data.history || []), {
          ttlMs: 45_000,
          version: 3,
        }),
        getCachedOrFetch('gymesis:dashboard:insights', () => trainingService.getInsights().then((r) => r.data.insights || null), {
          ttlMs: 45_000,
          version: 2,
        }),
        getCachedOrFetch('gymesis:dashboard:groups', () => groupService.getGroups().then((r) => r.data.groups || []), {
          ttlMs: 60_000,
          version: 3,
        }),
      ])

      // Otra carga mas reciente ya ha empezado: estos datos van con retraso.
      if (isStale()) return

      const friendships = friends.data as Array<{ status: string; direction: string }>
      const history = trainings.data as HistoryEntry[]
      const computed = computeWorkoutAnalytics(history)

      setStats({
        routines: (routines.data.routines || []).length,
        friends: friendships.filter((f) => f.status === 'accepted').length,
        trainings: computed.totalSessions,
        groups: (groups.data as unknown[]).length,
      })

      setPending({
        friendRequests: friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming').length,
        routineInvites: (routines.data.invitations || []).filter((i: { status: string }) => i.status === 'pending').length,
      })

      setAnalytics(computed)

      if (insightData.data) {
        setInsights({ ...EMPTY_INSIGHTS, ...insightData.data })
      }

      if (routines.stale || friends.stale || trainings.stale || insightData.stale || groups.stale) {
        setCacheNotice('Sin conexión estable: se muestran los últimos datos guardados en este dispositivo.')
      }

      setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      if (isStale()) return
      setError(getErrorMessage(err, 'No se ha podido actualizar el dashboard.'))
    } finally {
      // Sólo la última carga apaga los indicadores.
      if (!isStale()) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      if (!document.hidden) loadDashboard(true)
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoRefresh, loadDashboard])

  useEffect(() => {
    saveDashboardAutoRefresh(autoRefresh)
  }, [autoRefresh])

  const topMuscles = useMemo(
    () =>
      Object.entries(analytics.volumeByMuscle)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [analytics.volumeByMuscle]
  )

  /**
   * Puntuación de preparación a partir de señales reales de entrenamiento
   * (constancia, frescura, tendencia), no de cuántas rutinas o grupos tengas:
   * antes crear cuatro grupos vacíos ya te daba un 100.
   */
  const readiness = useMemo(() => {
    const consistency = Math.min(40, analytics.trainingDaysLast7Days * 10)
    const freshness = Math.max(0, 30 - insights.daysSinceLastSession * 6)
    const streak = Math.min(15, insights.currentStreakDays * 3)
    const trend = insights.momentum === 'up' ? 15 : insights.momentum === 'stable' ? 9 : 3
    return Math.round(Math.min(100, consistency + freshness + streak + trend))
  }, [analytics.trainingDaysLast7Days, insights.currentStreakDays, insights.daysSinceLastSession, insights.momentum])

  const readinessLabel =
    readiness >= 75 ? 'En racha' : readiness >= 45 ? 'En marcha' : readiness > 0 ? 'Retomando' : 'Sin datos aún'

  const tipOfTheDay = TIPS[new Date().getDate() % TIPS.length]
  const totalPending = pending.friendRequests + pending.routineInvites
  const MomentumIcon = insights.momentum === 'down' ? TrendingDown : TrendingUp

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<TrendingUp className="title-icon" />}
          title={username ? `Hola, ${username}` : 'Tu centro de rendimiento'}
          subtitle="Progreso, equipo y siguientes pasos, todo en una pantalla."
          actions={
            <>
              <button className="btn-soft btn-sm" onClick={() => loadDashboard(true)} disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Actualizar
              </button>
              <button
                className={`btn-soft btn-sm ${autoRefresh ? 'is-active' : ''}`}
                onClick={() => setAutoRefresh((value) => !value)}
                aria-pressed={autoRefresh}
                title="Refresca las métricas cada minuto sin recargar la página"
              >
                Auto {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </>
          }
          meta={
            <>
              <span className="tiny-badge">Actualizado: {lastUpdated || '--:--'}</span>
              <span className={`tiny-badge ${insights.currentStreakDays > 0 ? 'tiny-badge-success' : ''}`}>
                <Flame size={12} />
                Racha: {insights.currentStreakDays} {insights.currentStreakDays === 1 ? 'día' : 'días'}
              </span>
              {insights.daysSinceLastSession > 2 && (
                <span className="tiny-badge tiny-badge-warning">
                  Sin entrenar hace {insights.daysSinceLastSession} días
                </span>
              )}
              {totalPending > 0 && (
                <Link to="/notifications" className="tiny-badge tiny-badge-brand">
                  <BellRing size={12} />
                  {totalPending} pendiente{totalPending === 1 ? '' : 's'}
                </Link>
              )}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}
        {cacheNotice && <div className="status-info mb-4">{cacheNotice}</div>}

        <div className="mobile-tabs mb-5" role="tablist">
          {(
            [
              ['overview', 'Resumen'],
              ['insights', 'Analítica'],
              ['actions', 'Acciones'],
            ] as Array<[View, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mainView === value}
              className={`mobile-tab ${mainView === value ? 'active' : ''}`}
              onClick={() => setMainView(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {mainView === 'overview' && (
          <div className="animate-in space-y-6">
            {loading ? (
              <SkeletonCards count={4} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={Dumbbell} label="Rutinas" value={stats.routines} to="/routines" linkLabel="Ver rutinas" />
                <StatCard icon={Users} label="Amigos" value={stats.friends} to="/friends" linkLabel="Ver amigos" />
                <StatCard icon={Target} label="Días entrenados" value={stats.trainings} to="/trainings" linkLabel="Historial" />
                <StatCard icon={Swords} label="Grupos" value={stats.groups} to="/groups" linkLabel="Ver grupos" />
              </div>
            )}

            {visualSettings.showReadinessScore && (
              <section className="panel p-6">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Nivel de preparación</h2>
                    <p className="section-subtitle">
                      Combina días entrenados esta semana, frescura, racha y tendencia de volumen.
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{readiness}</div>
                    <div className="soft-text text-xs font-semibold uppercase">{readinessLabel}</div>
                  </div>
                </div>
                <div className="meter" role="img" aria-label={`Preparación: ${readiness} de 100`}>
                  <span style={{ width: `${readiness}%` }} />
                </div>
              </section>
            )}

            <section className="panel p-5">
              <div className="kpi-strip">
                <span className="tiny-badge">Días entrenados (7d): {analytics.trainingDaysLast7Days}</span>
                <span className="tiny-badge">Volumen 7d: {kg(analytics.volumeLast7DaysKg)}</span>
                <span className="tiny-badge">Media por día: {kg(analytics.averageVolumePerSessionKg)}</span>
                <span className="tiny-badge">Mejor día: {kg(analytics.bestSessionVolumeKg)}</span>
                <span className="tiny-badge">Volumen total: {kg(analytics.totalVolumeKg)}</span>
              </div>
            </section>
          </div>
        )}

        {mainView === 'insights' && (
          <div className="animate-in space-y-6">
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <MiniBarChart
                title="Volumen de los últimos 7 días"
                subtitle="Trabajo total levantado cada día."
                valueSuffix=" kg"
                precision={0}
                items={analytics.dailyVolumeLast7Days.map((item) => ({ label: item.label, value: item.volume }))}
                emptyLabel="Aún no has registrado volumen esta semana."
              />
              <MiniBarChart
                title="Volumen por grupo muscular"
                subtitle="Dónde se concentra tu trabajo acumulado."
                valueSuffix=" kg"
                precision={0}
                items={topMuscles.map(([label, value]) => ({ label, value }))}
                emptyLabel="Registra entrenamientos para ver tu reparto muscular."
              />
            </section>

            <section className="panel p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Previsión</h2>
                  <p className="section-subtitle">Estimada a partir de tu historial reciente y la tendencia semanal.</p>
                </div>
                <span className="tiny-badge">
                  Confianza:{' '}
                  {insights.confidence === 'high' ? 'alta' : insights.confidence === 'medium' ? 'media' : 'baja'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  { label: 'Volumen previsto (7d)', value: kg(insights.predictedNextWeekVolumeKg) },
                  { label: 'Próxima sesión', value: kg(insights.predictedNextSessionVolumeKg) },
                  { label: 'Racha actual', value: `${insights.currentStreakDays} d` },
                  { label: 'Tendencia semanal', value: `${insights.weeklyTrendPercent > 0 ? '+' : ''}${insights.weeklyTrendPercent.toFixed(0)}%` },
                ].map((item) => (
                  <div key={item.label} className="panel-sunken p-4">
                    <div className="soft-text text-xs font-semibold uppercase tracking-wide">{item.label}</div>
                    <div className="mt-1 text-2xl font-bold tabular-nums">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="kpi-strip mt-4">
                <span
                  className={`tiny-badge ${
                    insights.momentum === 'up'
                      ? 'tiny-badge-success'
                      : insights.momentum === 'down'
                        ? 'tiny-badge-warning'
                        : ''
                  }`}
                >
                  <MomentumIcon size={12} />
                  {insights.momentum === 'up' ? 'Subiendo' : insights.momentum === 'down' ? 'Bajando' : 'Estable'}
                </span>
                <span className="tiny-badge">Días desde la última sesión: {insights.daysSinceLastSession}</span>
              </div>

              {insights.confidence === 'low' && (
                <p className="soft-text mt-3 text-sm">
                  Con pocos entrenamientos la previsión es orientativa. Registra unas cuantas sesiones más para afinarla.
                </p>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="mb-3 inline-flex items-center gap-2 text-xl font-semibold">
                <Sparkles size={18} />
                Logros
              </h2>
              {analytics.achievements.length > 0 ? (
                <ul className="space-y-2">
                  {analytics.achievements.map((item) => (
                    <li key={item} className="status-success">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state">Sigue registrando entrenamientos para desbloquear logros.</div>
              )}
            </section>
          </div>
        )}

        {mainView === 'actions' && (
          <div className="animate-in space-y-6">
            <section className="panel p-5">
              <h2 className="mb-3 text-xl font-semibold">Acciones rápidas</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Link to="/trainings" className="btn-primary justify-center py-3">
                  <Dumbbell size={16} />
                  Registrar entreno
                </Link>
                <Link to="/routines" className="btn-soft justify-center py-3">
                  Crear rutina
                </Link>
                <Link to="/friends" className="btn-soft justify-center py-3">
                  Buscar amigos
                </Link>
              </div>
            </section>

            <section className="panel p-5">
              <h2 className="mb-1 inline-flex items-center gap-2 text-xl font-semibold">
                <BellRing size={18} />
                Pendientes
              </h2>
              <p className="section-subtitle mb-4">Lo que otras personas están esperando de ti.</p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="panel-sunken p-4">
                  <div className="soft-text text-sm">Solicitudes de amistad</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">{pending.friendRequests}</div>
                </div>
                <div className="panel-sunken p-4">
                  <div className="soft-text text-sm">Invitaciones de rutina</div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">{pending.routineInvites}</div>
                </div>
              </div>

              <Link to="/notifications" className="btn-primary mt-4 inline-flex">
                Abrir centro de avisos
              </Link>
            </section>

            {visualSettings.showTips && (
              <section className="panel p-5">
                <div className="soft-text text-xs font-bold uppercase tracking-wide">Consejo del día</div>
                <p className="mt-1 text-lg font-semibold">{tipOfTheDay}</p>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
