import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CheckCircle2, Clock3, Filter, RefreshCw, Search, ShieldAlert, Swords, UserPlus, Users } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { friendService, routineService, trainingService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'
import { getReminderSettings, saveReminderSettings } from '../utils/settings'

type RoutineInvitation = {
  id: string
  routine_name: string
  from_username: string
  status: string
}

type Friendship = {
  id: string
  friend_username: string
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
}

type Meetup = {
  id: string
  meetup_date: string
  meetup_time?: string
  title: string
  notes?: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  organizer_username: string
  invited_username: string
}

export default function Notifications() {
  const [routineInvitations, setRoutineInvitations] = useState<RoutineInvitation[]>([])
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'friends' | 'routines'>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [processingBulk, setProcessingBulk] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false)
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState(30)
  const [reminderMessage, setReminderMessage] = useState('Revisa tus pendientes de Gymesis.')
  const [reminderStatus, setReminderStatus] = useState('')
  const previousCounts = useRef({ friends: 0, routines: 0 })
  const reminderTimerRef = useRef<number | null>(null)

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      setRefreshing(true)
      setError('')
      const result = await getCachedOrFetch(
        'gymesis:notifications:bundle',
        async () => {
          const [routine, friends, calendar] = await Promise.all([
            routineService.getInvitations(),
            friendService.getFriends(),
            trainingService.getCalendar(),
          ])
          return {
            routineInvitations: routine.data.invitations || [],
            friendships: friends.data.friendships || [],
            meetups: calendar.data.meetups || [],
          }
        },
        { ttlMs: 20_000, version: 2 }
      )

      setRoutineInvitations(result.data.routineInvitations || [])
      setFriendships(result.data.friendships || [])
      setMeetups(result.data.meetups || [])

      const currentCounts = {
        friends: (result.data.friendships || []).filter((item: Friendship) => item.status === 'pending' && item.direction === 'incoming').length,
        routines: (result.data.routineInvitations || []).filter((item: RoutineInvitation) => item.status === 'pending').length,
      }

      if (
        browserAlertsEnabled &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (currentCounts.friends > previousCounts.current.friends || currentCounts.routines > previousCounts.current.routines)
      ) {
        new Notification('Gymesis', {
          body: `Tienes ${currentCounts.friends} solicitudes de amistad y ${currentCounts.routines} invitaciones de rutina pendientes.`,
        })
      }

      previousCounts.current = currentCounts

      if (result.stale) {
        emitFeedback({ kind: 'warning', title: 'Mostrando datos recientes', message: 'Se ha usado caché local por conexión inestable.' })
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudieron cargar notificaciones')
      emitFeedback({ kind: 'error', title: 'No se pudieron cargar notificaciones', message: err.response?.data?.error || 'Revisa tu conexión.' })
    } finally {
      if (!silent) setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      setBrowserAlertsEnabled(true)
    }
  }, [])

  useEffect(() => {
    const settings = getReminderSettings()
    setReminderEnabled(settings.enabled)
    setReminderMinutes(settings.minutes)
    setReminderMessage(settings.message)
  }, [])

  useEffect(() => {
    saveReminderSettings({ enabled: reminderEnabled, minutes: reminderMinutes, message: reminderMessage })
  }, [reminderEnabled, reminderMinutes, reminderMessage])

  useEffect(() => {
    if (reminderTimerRef.current !== null) {
      window.clearTimeout(reminderTimerRef.current)
      reminderTimerRef.current = null
    }

    if (!reminderEnabled) return

    reminderTimerRef.current = window.setTimeout(() => {
      const finalMessage = reminderMessage.trim() || 'Revisa tus pendientes de Gymesis.'
      if (browserAlertsEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Gymesis: recordatorio', { body: finalMessage })
      }
      emitFeedback({ kind: 'warning', title: 'Recordatorio disparado', message: finalMessage })
      setReminderStatus(`Recordatorio enviado: ${finalMessage}`)
      reminderTimerRef.current = null
    }, reminderMinutes * 60 * 1000)

    return () => {
      if (reminderTimerRef.current !== null) {
        window.clearTimeout(reminderTimerRef.current)
        reminderTimerRef.current = null
      }
    }
  }, [browserAlertsEnabled, reminderEnabled, reminderMinutes, reminderMessage])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      loadData(true)
    }, 30000)
    return () => window.clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2800)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
  if (event.key.toLowerCase() === 'r') loadData(true)
      if (event.key.toLowerCase() === 'f') setTab('friends')
      if (event.key.toLowerCase() === 'g') setTab('routines')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const incomingFriendRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming'),
    [friendships]
  )

  const pendingRoutineInvites = useMemo(
    () => routineInvitations.filter((r) => r.status === 'pending'),
    [routineInvitations]
  )

  const friendFiltered = useMemo(() => {
    const base = incomingFriendRequests
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter((item) => item.friend_username.toLowerCase().includes(q))
  }, [incomingFriendRequests, search])

  const routineFiltered = useMemo(() => {
    const base = pendingRoutineInvites
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter((item) => item.routine_name.toLowerCase().includes(q) || item.from_username.toLowerCase().includes(q))
  }, [pendingRoutineInvites, search])

  const acceptRoutine = async (id: string) => {
    clearCacheByPrefix('gymesis:notifications:')
    await routineService.answerInvitation(id, { action: 'accepted' })
    await loadData()
    setStatusMessage('Reto aceptado')
    emitFeedback({ kind: 'success', title: 'Reto aceptado', message: 'La invitación de rutina fue procesada.' })
  }

  const rejectRoutine = async (id: string) => {
    clearCacheByPrefix('gymesis:notifications:')
    await routineService.answerInvitation(id, { action: 'rejected' })
    await loadData()
    setStatusMessage('Reto rechazado')
    emitFeedback({ kind: 'info', title: 'Reto rechazado', message: 'La invitación de rutina se descartó.' })
  }

  const acceptFriend = async (id: string) => {
    clearCacheByPrefix('gymesis:notifications:')
    await friendService.acceptRequest(id)
    await loadData()
    setStatusMessage('Solicitud de amistad aceptada')
    emitFeedback({ kind: 'success', title: 'Amistad aceptada', message: 'Se confirmó una nueva relación.' })
  }

  const rejectFriend = async (id: string) => {
    clearCacheByPrefix('gymesis:notifications:')
    await friendService.rejectRequest(id)
    await loadData()
    setStatusMessage('Solicitud de amistad rechazada')
    emitFeedback({ kind: 'info', title: 'Solicitud rechazada', message: 'La solicitud de amistad fue descartada.' })
  }

  const acceptAllFriends = async () => {
    if (friendFiltered.length === 0) return
    setProcessingBulk(true)
    try {
      clearCacheByPrefix('gymesis:notifications:')
      for (const item of friendFiltered) {
        await friendService.acceptRequest(item.id)
      }
      await loadData(true)
      setStatusMessage('Todas las solicitudes visibles fueron aceptadas')
      emitFeedback({ kind: 'success', title: 'Solicitudes aceptadas', message: 'Se procesaron todas las solicitudes visibles.' })
    } finally {
      setProcessingBulk(false)
    }
  }

  const rejectAllRoutines = async () => {
    if (routineFiltered.length === 0) return
    setProcessingBulk(true)
    try {
      clearCacheByPrefix('gymesis:notifications:')
      for (const item of routineFiltered) {
        await routineService.answerInvitation(item.id, { action: 'rejected' })
      }
      await loadData(true)
      setStatusMessage('Todas las invitaciones visibles fueron rechazadas')
      emitFeedback({ kind: 'info', title: 'Invitaciones descartadas', message: 'Se rechazaron todas las invitaciones visibles.' })
    } finally {
      setProcessingBulk(false)
    }
  }

  const respondMeetup = async (id: string, action: 'accepted' | 'rejected') => {
    try {
      await trainingService.respondMeetup(id, action)
      await loadData(true)
      setStatusMessage(action === 'accepted' ? 'Quedada aceptada' : 'Quedada rechazada')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo responder la quedada')
    }
  }

  const enableBrowserAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setError('Tu navegador no soporta notificaciones del sistema')
      return
    }

    const permission = await Notification.requestPermission()
    setBrowserAlertsEnabled(permission === 'granted')
    if (permission === 'granted') {
      emitFeedback({ kind: 'success', title: 'Avisos activados', message: 'Recibirás alertas del navegador cuando lleguen pendientes nuevas.' })
    } else {
      emitFeedback({ kind: 'warning', title: 'Avisos desactivados', message: 'No se concedió permiso para notificaciones del navegador.' })
    }
  }

  const stopReminder = () => {
    if (reminderTimerRef.current !== null) {
      window.clearTimeout(reminderTimerRef.current)
      reminderTimerRef.current = null
    }
    setReminderEnabled(false)
    setReminderStatus('Recordatorio detenido')
    emitFeedback({ kind: 'info', title: 'Recordatorio detenido', message: 'No se enviará la alerta programada.' })
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Bell className="title-icon" />}
          title="Centro de notificaciones"
          subtitle="Resuelve solicitudes pendientes en un solo lugar."
          actions={
            <>
              <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => loadData(true)}>
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refrescar
              </button>
              <button className={`btn-soft text-sm ${autoRefresh ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setAutoRefresh((v) => !v)}>
                Actualizar cada 30s {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button className="btn-soft text-sm" onClick={enableBrowserAlerts}>
                {browserAlertsEnabled ? 'Avisos del navegador ON' : 'Activar avisos del navegador'}
              </button>
            </>
          }
          meta={
            <div className="flex flex-wrap gap-2 items-center">
              <span className="tiny-badge"><Users size={12} />Amistad: {incomingFriendRequests.length}</span>
              <span className="tiny-badge"><Swords size={12} />Rutinas: {pendingRoutineInvites.length}</span>
            </div>
          }
        />

        <div className="soft-text text-sm mb-3">Esta opción revisa nuevas solicitudes cada 30 segundos para que no tengas que recargar la página.</div>

        <section className="panel p-4 mb-4 stack-gap">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Clock3 size={18} />Recordatorio</h2>
            <span className="tiny-badge">Pestaña abierta</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="field-label">Minutos</label>
              <input className="field" type="number" min={1} max={480} value={reminderMinutes} onChange={(e) => setReminderMinutes(Number(e.target.value))} />
            </div>
            <div className="md:col-span-2">
              <label className="field-label">Mensaje</label>
              <input className="field" value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} placeholder="Revisa tus pendientes." />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[15, 30, 45, 60].map((value) => (
              <button key={value} type="button" className={`btn-soft text-sm ${reminderMinutes === value ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setReminderMinutes(value)}>
                {value} min
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className={`btn-primary ${reminderEnabled ? 'opacity-90' : ''}`} onClick={() => setReminderEnabled(true)}>
              {reminderEnabled ? 'Recordatorio activo' : 'Activar recordatorio'}
            </button>
            <button type="button" className="btn-soft" onClick={stopReminder}>Detener</button>
            <button type="button" className="btn-soft" onClick={() => setReminderStatus('Recordatorio listo para programarse')}>Preparar</button>
          </div>
          {reminderStatus && <div className="status-info">{reminderStatus}</div>}
        </section>

        <div className="panel p-4 mb-4 flex flex-wrap gap-2 items-center">
          <div className="inline-flex items-center gap-1 soft-text"><Filter size={14} />Vista</div>
          <button className={`btn-soft text-sm ${tab === 'all' ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setTab('all')}>Todo</button>
          <button className={`btn-soft text-sm ${tab === 'friends' ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setTab('friends')}>Amistad</button>
          <button className={`btn-soft text-sm ${tab === 'routines' ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setTab('routines')}>Rutinas</button>
          <div className="relative ml-auto w-full md:w-72">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="field !pl-7"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por nombre o rutina"
            />
          </div>
          <button className="btn-soft text-sm" onClick={() => setSearch('')}>Limpiar</button>
          <span className="tiny-badge">R / F / G</span>
        </div>

        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}
        <div className="sr-only" aria-live="polite">{statusMessage}</div>

        {loading ? (
          <div className="panel p-6 inline-flex items-center gap-3 soft-text">
            <span className="loader" />Cargando notificaciones...
          </div>
        ) : (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(tab === 'all' || tab === 'friends') && (
              <div className="panel p-5 panel-hover">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><UserPlus size={20} />Solicitudes de amistad</h2>
                  <button disabled={processingBulk || friendFiltered.length === 0} className="btn-soft text-sm" onClick={acceptAllFriends}>Aceptar visibles</button>
                </div>
                <div className="space-y-2">
                  {friendFiltered.map((f) => (
                    <div key={f.id} className="border border-slate-500/30 dark:border-slate-700 rounded p-3 flex justify-between bg-white/40 dark:bg-slate-900/35">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{f.friend_username}</div>
                        <div className="text-sm soft-text">quiere agregarte como amigo</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-3 py-1 rounded" onClick={() => acceptFriend(f.id)}><CheckCircle2 size={14} />Aceptar</button>
                        <button className="btn-soft px-3 py-1" onClick={() => rejectFriend(f.id)}>Rechazar</button>
                      </div>
                    </div>
                  ))}
                  {friendFiltered.length === 0 && <div className="empty-state">No hay solicitudes pendientes.</div>}
                </div>
              </div>
            )}

            {(tab === 'all' || tab === 'routines') && (
              <div className="panel p-5 panel-hover">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Swords size={20} />Invitaciones de rutina</h2>
                  <button disabled={processingBulk || routineFiltered.length === 0} className="btn-soft text-sm" onClick={rejectAllRoutines}>Rechazar visibles</button>
                </div>
                <div className="space-y-2">
                  {routineFiltered.map((inv) => (
                    <div key={inv.id} className="border border-slate-500/30 dark:border-slate-700 rounded p-3 flex justify-between bg-white/40 dark:bg-slate-900/35">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{inv.routine_name}</div>
                        <div className="text-sm soft-text">reto enviado por {inv.from_username}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-3 py-1 rounded" onClick={() => acceptRoutine(inv.id)}><CheckCircle2 size={14} />Aceptar</button>
                        <button className="btn-soft px-3 py-1" onClick={() => rejectRoutine(inv.id)}>Rechazar</button>
                      </div>
                    </div>
                  ))}
                  {routineFiltered.length === 0 && <div className="empty-state inline-flex items-center gap-1"><ShieldAlert size={14} />No hay invitaciones pendientes.</div>}
                </div>
              </div>
            )}

            {tab === 'all' && (
              <div className="panel p-5 panel-hover lg:col-span-2">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2 mb-3"><Clock3 size={20} />Quedadas de entrenamiento</h2>
                <div className="space-y-2">
                  {meetups.map((meetup) => (
                    <div key={meetup.id} className="border border-slate-500/30 dark:border-slate-700 rounded p-3 flex flex-wrap items-center justify-between gap-2 bg-white/40 dark:bg-slate-900/35">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{meetup.title}</div>
                        <div className="text-sm soft-text">{meetup.meetup_date}{meetup.meetup_time ? ` · ${meetup.meetup_time.slice(0, 5)}` : ''} · {meetup.organizer_username} con {meetup.invited_username}</div>
                        {meetup.notes && <div className="text-xs soft-text">{meetup.notes}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tiny-badge">{meetup.status}</span>
                        {meetup.status === 'pending' && (
                          <>
                            <button type="button" className="btn-soft text-sm" onClick={() => respondMeetup(meetup.id, 'accepted')}>Aceptar</button>
                            <button type="button" className="btn-soft text-sm" onClick={() => respondMeetup(meetup.id, 'rejected')}>Rechazar</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {meetups.length === 0 && <div className="empty-state">No hay quedadas pendientes.</div>}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  )
}
