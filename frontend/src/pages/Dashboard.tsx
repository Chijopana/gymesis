import { useEffect, useState } from 'react'
import { BellRing, Dumbbell, Flame, RefreshCw, Swords, Target, TrendingUp, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import MiniBarChart from '../components/MiniBarChart'
import PageHeader from '../components/PageHeader'
import { friendService, groupService, routineService, trainingService } from '../services/api'
import { getCachedOrFetch } from '../utils/cache'
import { computeWorkoutAnalytics } from '../utils/trainingAnalytics'
import { getDashboardAutoRefresh, getVisualSettings, saveDashboardAutoRefresh } from '../utils/settings'

export default function Dashboard() {
  const [mainView, setMainView] = useState<'overview' | 'insights' | 'actions'>(getVisualSettings().defaultDashboardView)
  const [stats, setStats] = useState({ routines: 0, friends: 0, trainings: 0, groups: 0 })
  const [pending, setPending] = useState({ friendRequests: 0, routineInvites: 0 })
  const [analytics, setAnalytics] = useState({
    sessionsLast7Days: 0,
    volumeLast7DaysKg: 0,
    averageVolumePerSessionKg: 0,
    achievements: [] as string[],
    topMuscles: [] as Array<[string, number]>,
    dailyVolumeLast7Days: [] as Array<{ label: string; volume: number }>,
  })
  const [insights, setInsights] = useState({
    predictedNextWeekVolumeKg: 0,
    predictedNextSessionVolumeKg: 0,
    currentStreakDays: 0,
    daysSinceLastSession: 0,
    weeklyTrendPercent: 0,
    confidence: 'low' as 'low' | 'medium' | 'high',
    momentum: 'stable' as 'up' | 'stable' | 'down',
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState('')
  const [error, setError] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(() => getDashboardAutoRefresh())
  const [cacheNotice, setCacheNotice] = useState('')
  const visualSettings = getVisualSettings()

  const tips = [
    'Haz 2 minutos de movilidad antes de cada sesion.',
    'Registra tambien dias ligeros para medir consistencia real.',
    'Un descanso mas estricto mejora la comparacion de progreso.',
    'Invita a alguien nuevo cada semana para mantener motivacion.',
  ]

  const loadDashboard = async (silent = false) => {
    try {
      setError('')
      setCacheNotice('')
      if (!silent) setLoading(true)
      setRefreshing(true)
      const [routines, friends, trainings, insightData, groups] = await Promise.all([
        getCachedOrFetch(
          'gymesis:dashboard:routines',
          async () => {
            const [routinesRes, invitationsRes] = await Promise.all([routineService.getRoutines(), routineService.getInvitations()])
            return {
              routines: routinesRes.data.routines || [],
              invitations: invitationsRes.data.invitations || [],
            }
          },
          { ttlMs: 60_000, version: 2 }
        ),
        getCachedOrFetch('gymesis:dashboard:friends', async () => friendService.getFriends().then((r) => r.data.friendships || []), {
          ttlMs: 30_000,
          version: 2,
        }),
        getCachedOrFetch('gymesis:dashboard:history', async () => trainingService.getHistory().then((r) => r.data.history || []), {
          ttlMs: 30_000,
          version: 2,
        }),
        getCachedOrFetch('gymesis:dashboard:insights', async () => trainingService.getInsights().then((r) => r.data.insights || null), {
          ttlMs: 45_000,
          version: 1,
        }),
        getCachedOrFetch('gymesis:dashboard:groups', async () => groupService.getGroups().then((r) => r.data.groups || []), {
          ttlMs: 45_000,
          version: 2,
        }),
      ])

      const acceptedFriends = (friends.data || []).filter((f: any) => f.status === 'accepted')
      const pendingFriends = (friends.data || []).filter((f: any) => f.status === 'pending' && f.direction === 'incoming')
      const pendingRoutineInvites = (routines.data.invitations || []).filter((i: any) => i.status === 'pending')
      const computed = computeWorkoutAnalytics(trainings.data || [])
      const topMuscles = Object.entries(computed.volumeByMuscle).sort((a, b) => b[1] - a[1]).slice(0, 3)

      setStats({
        routines: (routines.data.routines || []).length,
        friends: acceptedFriends.length,
        trainings: (trainings.data || []).length,
        groups: (groups.data || []).length,
      })

      setPending({
        friendRequests: pendingFriends.length,
        routineInvites: pendingRoutineInvites.length,
      })

      setAnalytics({
        sessionsLast7Days: computed.sessionsLast7Days,
        volumeLast7DaysKg: computed.volumeLast7DaysKg,
        averageVolumePerSessionKg: computed.averageVolumePerSessionKg,
        achievements: computed.achievements,
        topMuscles,
        dailyVolumeLast7Days: computed.dailyVolumeLast7Days,
      })

      if (insightData.data) {
        setInsights({
          predictedNextWeekVolumeKg: insightData.data.predictedNextWeekVolumeKg || 0,
          predictedNextSessionVolumeKg: insightData.data.predictedNextSessionVolumeKg || 0,
          currentStreakDays: insightData.data.currentStreakDays || 0,
          daysSinceLastSession: insightData.data.daysSinceLastSession || 0,
          weeklyTrendPercent: insightData.data.weeklyTrendPercent || 0,
          confidence: insightData.data.confidence || 'low',
          momentum: insightData.data.momentum || 'stable',
        })
      }

      if (routines.stale || friends.stale || trainings.stale || insightData.stale || groups.stale) {
        setCacheNotice('Sin conexion estable: se muestran datos locales recientes.')
      }

      setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setError('No se pudo actualizar el dashboard')
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => loadDashboard(true), 30000)
    return () => window.clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    saveDashboardAutoRefresh(autoRefresh)
  }, [autoRefresh])

  const readinessScore = Math.min(100, stats.routines * 12 + stats.friends * 8 + stats.trainings * 5 + stats.groups * 10)
  const tipOfTheDay = tips[new Date().getDate() % tips.length]
  const streakEstimate = Math.max(1, Math.min(30, Math.round(stats.trainings / 2)))

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<TrendingUp className="title-icon" />}
          title="Tu centro de rendimiento"
          subtitle="Todo lo importante de hoy: progreso, equipo y siguientes acciones."
          actions={
            <>
              <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => loadDashboard(true)}>
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Actualizar
              </button>
              <button className={`btn-soft text-sm ${autoRefresh ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setAutoRefresh((v) => !v)}>
                Actualizar cada 30s {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </>
          }
          meta={
            <div className="flex flex-wrap gap-2 items-center">
              <span className="tiny-badge">Actualizado: {lastUpdated || '--:--'}</span>
              <span className="tiny-badge"><Flame size={12} />Racha: {streakEstimate} d</span>
            </div>
          }
        />

        {error && <div className="mb-4 status-error">{error}</div>}
        <div className="soft-text text-sm mb-3">La actualización automática refresca métricas sin que pulses "Actualizar" manualmente.</div>

        {loading && (
          <div className="panel p-6 inline-flex items-center gap-3 soft-text mb-6">
            <span className="loader" />Cargando resumen...
          </div>
        )}

        <div className="mobile-tabs mb-4">
          <button type="button" className={`mobile-tab ${mainView === 'overview' ? 'active' : ''}`} onClick={() => setMainView('overview')}>Resumen</button>
          <button type="button" className={`mobile-tab ${mainView === 'insights' ? 'active' : ''}`} onClick={() => setMainView('insights')}>Insights</button>
          <button type="button" className={`mobile-tab ${mainView === 'actions' ? 'active' : ''}`} onClick={() => setMainView('actions')}>Acciones</button>
        </div>

        {mainView === 'overview' && (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="panel panel-hover p-6">
            <div className="soft-text text-sm font-semibold uppercase inline-flex items-center gap-1"><Dumbbell size={14} />Rutinas</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 mt-2">{stats.routines}</div>
            <Link to="/routines" className="text-sky-500 text-sm mt-4 hover:underline">Ver rutinas →</Link>
          </div>

          <div className="panel panel-hover p-6">
            <div className="soft-text text-sm font-semibold uppercase inline-flex items-center gap-1"><Users size={14} />Amigos</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 mt-2">{stats.friends}</div>
            <Link to="/friends" className="text-sky-500 text-sm mt-4 hover:underline">Ver amigos →</Link>
          </div>

          <div className="panel panel-hover p-6">
            <div className="soft-text text-sm font-semibold uppercase inline-flex items-center gap-1"><Target size={14} />Entrenamientos</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 mt-2">{stats.trainings}</div>
            <Link to="/trainings" className="text-sky-500 text-sm mt-4 hover:underline">Historial →</Link>
          </div>

          <div className="panel panel-hover p-6">
            <div className="soft-text text-sm font-semibold uppercase inline-flex items-center gap-1"><Swords size={14} />Grupos</div>
            <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 mt-2">{stats.groups}</div>
            <Link to="/groups" className="text-sky-500 text-sm mt-4 hover:underline">Ver grupos →</Link>
          </div>
        </div>

        <section className="panel p-4 mb-6 stack-gap">
          <div className="flex flex-wrap gap-2">
            <span className="tiny-badge">Pendientes totales: {pending.friendRequests + pending.routineInvites}</span>
            <span className="tiny-badge">Actividad total: {stats.routines + stats.trainings + stats.groups}</span>
            <span className="tiny-badge">Base social: {stats.friends}</span>
            <span className="tiny-badge">Sesiones 7d: {analytics.sessionsLast7Days}</span>
            <span className="tiny-badge">Volumen 7d: {analytics.volumeLast7DaysKg.toFixed(1)} kg</span>
            <span className="tiny-badge">Promedio/sesion: {analytics.averageVolumePerSessionKg.toFixed(1)} kg</span>
          </div>
          <div className="text-sm soft-text">Resumen rápido antes de entrar al detalle.</div>
        </section>

        {cacheNotice && <div className="mb-4 status-info">{cacheNotice}</div>}

        {visualSettings.showReadinessScore && (
        <section className="panel p-6 mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Nivel de preparacion</h2>
          <p className="section-subtitle mb-2">Puntuacion simple basada en actividad social y de entrenamiento.</p>
          <div className="w-full rounded-full h-3 bg-slate-300/50 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-500" style={{ width: `${readinessScore}%` }} />
          </div>
          <div className="mt-2 text-sm soft-text">Score actual: <strong className="text-slate-900 dark:text-slate-100">{readinessScore}/100</strong></div>
        </section>
        )}
        </>
        )}

        {mainView === 'insights' && (
        <>
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <MiniBarChart
            title="Volumen de la ultima semana"
            subtitle="Trabajo total por dia en los ultimos 7 dias."
            valueSuffix=" kg"
            items={analytics.dailyVolumeLast7Days.map((item) => ({
              label: item.label,
              value: item.volume,
            }))}
            emptyLabel="Aun no hay volumen registrado esta semana."
          />

          <MiniBarChart
            title="Grupos musculares dominantes"
            subtitle="Donde se concentra tu volumen total acumulado."
            valueSuffix=" kg"
            items={analytics.topMuscles.map(([label, value]) => ({ label, value }))}
            emptyLabel="Aun no hay volumen por grupo muscular."
          />
        </section>
        
        <section className="panel p-4 mt-2 mb-6">
          <div className="text-sm soft-text mb-2">Top grupos musculares por volumen</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {analytics.topMuscles.map(([muscle, volume]) => (
              <span key={muscle} className="tiny-badge">{muscle}: {volume.toFixed(1)} kg</span>
            ))}
            {analytics.topMuscles.length === 0 && <span className="soft-text">Aun sin datos de volumen.</span>}
          </div>
          <div className="text-sm soft-text mb-1">Logros desbloqueables</div>
          <div className="space-y-1">
            {analytics.achievements.length > 0 ? analytics.achievements.map((item) => (
              <div key={item} className="status-success">{item}</div>
            )) : <div className="soft-text">Sigue registrando entrenamientos para desbloquear logros.</div>}
          </div>
        </section>

        <section className="panel p-6 mb-6 border border-cyan-500/20 bg-gradient-to-br from-white/80 to-cyan-50/70 dark:from-slate-950/70 dark:to-slate-900/60">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Prediccion simple</h2>
              <p className="section-subtitle">Se estima a partir de tu historial reciente y la tendencia de volumen.</p>
            </div>
            <span className="tiny-badge">Confianza: {insights.confidence}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-500/20 bg-white/60 dark:bg-slate-900/40 p-4">
              <div className="soft-text text-sm">Volumen previsto 7d</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{insights.predictedNextWeekVolumeKg.toFixed(0)} kg</div>
            </div>
            <div className="rounded-xl border border-slate-500/20 bg-white/60 dark:bg-slate-900/40 p-4">
              <div className="soft-text text-sm">Siguiente sesion estimada</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{insights.predictedNextSessionVolumeKg.toFixed(0)} kg</div>
            </div>
            <div className="rounded-xl border border-slate-500/20 bg-white/60 dark:bg-slate-900/40 p-4">
              <div className="soft-text text-sm">Racha actual</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{insights.currentStreakDays} d</div>
            </div>
            <div className="rounded-xl border border-slate-500/20 bg-white/60 dark:bg-slate-900/40 p-4">
              <div className="soft-text text-sm">Tendencia</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{insights.weeklyTrendPercent.toFixed(0)}%</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <span className={`tiny-badge ${insights.momentum === 'up' ? 'ring-1 ring-emerald-400/40' : insights.momentum === 'down' ? 'ring-1 ring-amber-400/40' : ''}`}>
              Momento: {insights.momentum === 'up' ? 'subiendo' : insights.momentum === 'down' ? 'bajando' : 'estable'}
            </span>
            <span className="tiny-badge">Dias desde la ultima sesion: {insights.daysSinceLastSession}</span>
          </div>
        </section>
        </>
        )}

        {mainView === 'actions' && (
        <>
        <section className="panel p-5">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Acciones rapidas</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Link to="/routines" className="block w-full text-center btn-primary py-3">Rutinas</Link>
            <Link to="/friends" className="block w-full text-center btn-soft py-3">Amigos</Link>
            <Link to="/trainings" className="block w-full text-center btn-soft py-3">Entrenar</Link>
          </div>
        </section>

        <section className="panel p-5 mt-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2 inline-flex items-center gap-2"><BellRing size={18} />Pendientes</h2>
          <p className="section-subtitle mb-3">Acciones que te desbloquean progreso social y retos.</p>
          <div className="status-success mb-3 inline-flex items-center gap-2">
            <span>Total pendientes:</span>
            <strong>{pending.friendRequests + pending.routineInvites}</strong>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-slate-500/30 dark:border-slate-700 rounded-lg p-4 bg-white/40 dark:bg-slate-900/35">
              <div className="soft-text text-sm">Solicitudes de amistad</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{pending.friendRequests}</div>
            </div>
            <div className="border border-slate-500/30 dark:border-slate-700 rounded-lg p-4 bg-white/40 dark:bg-slate-900/35">
              <div className="soft-text text-sm">Invitaciones de rutina</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{pending.routineInvites}</div>
            </div>
          </div>
          <Link to="/notifications" className="inline-block mt-4 btn-primary">Abrir centro de notificaciones</Link>
        </section>

        {visualSettings.showTips && (
        <section className="panel p-4 mt-6">
          <div className="text-sm soft-text">Tip del dia</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{tipOfTheDay}</div>
        </section>
        )}
        </>
        )}
      </main>
    </>
  )
}
