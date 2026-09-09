import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellRing, CalendarClock, CheckCircle2, RefreshCw, Search, Swords, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { friendService, getErrorMessage, routineService, trainingService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'
import { useAuthStore } from '../store/authStore'

type RoutineInvitation = {
  id: string
  routine_name: string
  from_username: string
  status: string
  message?: string | null
  created_at: string
}

type Friendship = {
  id: string
  friend_id: string
  friend_username: string
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
}

type Meetup = {
  id: string
  organizer_user_id: string
  invited_user_id: string
  meetup_date: string
  meetup_time?: string
  title: string
  notes?: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  organizer_username: string
  invited_username: string
}

type Tab = 'all' | 'friends' | 'routines' | 'meetups'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: 'friends', label: 'Amistad' },
  { value: 'routines', label: 'Rutinas' },
  { value: 'meetups', label: 'Quedadas' },
]

const REFRESH_INTERVAL_MS = 60_000

export default function Notifications() {
  const navigate = useNavigate()
  const currentUserId = useAuthStore((state) => state.user?.id)

  const [routineInvitations, setRoutineInvitations] = useState<RoutineInvitation[]>([])
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = useState(false)
  const previousPending = useRef<number | null>(null)

  const loadData = useCallback(
    async (silent = false, forceFresh = false) => {
      try {
        if (!silent) setLoading(true)
        setRefreshing(true)
        setError('')
        if (forceFresh) clearCacheByPrefix('gymesis:notifications:')

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
          { ttlMs: 25_000, version: 3 }
        )

        setRoutineInvitations(result.data.routineInvitations || [])
        setFriendships(result.data.friendships || [])
        setMeetups(result.data.meetups || [])

        const pending =
          (result.data.friendships || []).filter(
            (item: Friendship) => item.status === 'pending' && item.direction === 'incoming'
          ).length + (result.data.routineInvitations || []).filter((item: RoutineInvitation) => item.status === 'pending').length

        // Aviso del sistema sólo cuando el número CRECE respecto a lo ya visto.
        if (
          browserAlertsEnabled &&
          previousPending.current !== null &&
          pending > previousPending.current &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          new Notification('Gymesis', { body: `Tienes ${pending} solicitudes pendientes.` })
        }
        previousPending.current = pending

        if (result.stale) {
          emitFeedback({ kind: 'warning', title: 'Mostrando datos guardados', message: 'Conexión inestable.' })
        }
      } catch (err) {
        setError(getErrorMessage(err, 'No se han podido cargar las notificaciones.'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [browserAlertsEnabled]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') setBrowserAlertsEnabled(true)
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = window.setInterval(() => {
      if (!document.hidden) loadData(true, true)
    }, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoRefresh, loadData])

  const incomingFriendRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming'),
    [friendships]
  )

  const pendingRoutineInvites = useMemo(
    () => routineInvitations.filter((r) => r.status === 'pending'),
    [routineInvitations]
  )

  const pendingMeetups = useMemo(() => meetups.filter((m) => m.status === 'pending'), [meetups])

  const query = search.trim().toLowerCase()

  const friendFiltered = useMemo(
    () => (query ? incomingFriendRequests.filter((item) => item.friend_username.toLowerCase().includes(query)) : incomingFriendRequests),
    [incomingFriendRequests, query]
  )

  const routineFiltered = useMemo(
    () =>
      query
        ? pendingRoutineInvites.filter(
            (item) =>
              item.routine_name.toLowerCase().includes(query) || item.from_username.toLowerCase().includes(query)
          )
        : pendingRoutineInvites,
    [pendingRoutineInvites, query]
  )

  const meetupFiltered = useMemo(
    () => (query ? pendingMeetups.filter((item) => item.title.toLowerCase().includes(query)) : pendingMeetups),
    [pendingMeetups, query]
  )

  const totalPending = incomingFriendRequests.length + pendingRoutineInvites.length + pendingMeetups.length

  /** Toda acción pasa por aquí: errores visibles y caché invalidada siempre. */
  const runAction = async (id: string, action: () => Promise<unknown>, success: string) => {
    try {
      setBusyId(id)
      await action()
      clearCacheByPrefix('gymesis:notifications:')
      clearCacheByPrefix('gymesis:friends:')
      clearCacheByPrefix('gymesis:routines:')
      clearCacheByPrefix('gymesis:dashboard:')
      await loadData(true, true)
      emitFeedback({ kind: 'success', title: success })
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      emitFeedback({ kind: 'error', title: 'No ha sido posible', message })
    } finally {
      setBusyId('')
    }
  }

  const enableBrowserAlerts = async () => {
    if (!('Notification' in window)) {
      emitFeedback({ kind: 'warning', title: 'Tu navegador no admite avisos del sistema' })
      return
    }
    const permission = await Notification.requestPermission()
    setBrowserAlertsEnabled(permission === 'granted')
    emitFeedback(
      permission === 'granted'
        ? { kind: 'success', title: 'Avisos activados', message: 'Te avisaremos cuando lleguen solicitudes nuevas.' }
        : { kind: 'warning', title: 'Avisos no permitidos', message: 'Puedes cambiarlo en los permisos del navegador.' }
    )
  }

  const showFriends = tab === 'all' || tab === 'friends'
  const showRoutines = tab === 'all' || tab === 'routines'
  const showMeetups = tab === 'all' || tab === 'meetups'

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Bell className="title-icon" />}
          title="Centro de avisos"
          subtitle="Todo lo que espera tu respuesta, en un solo sitio."
          actions={
            <>
              <button className="btn-soft btn-sm" onClick={() => loadData(true, true)} disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Actualizar
              </button>
              <button
                className={`btn-soft btn-sm ${autoRefresh ? 'is-active' : ''}`}
                onClick={() => setAutoRefresh((value) => !value)}
                aria-pressed={autoRefresh}
                title="Comprueba si hay novedades cada minuto"
              >
                Auto {autoRefresh ? 'ON' : 'OFF'}
              </button>
              {!browserAlertsEnabled && (
                <button className="btn-soft btn-sm" onClick={enableBrowserAlerts}>
                  <BellRing size={14} />
                  Avisos del navegador
                </button>
              )}
            </>
          }
          meta={
            <>
              <span className={`tiny-badge ${totalPending > 0 ? 'tiny-badge-brand' : ''}`}>
                Pendientes: {totalPending}
              </span>
              <span className="tiny-badge">Amistad: {incomingFriendRequests.length}</span>
              <span className="tiny-badge">Rutinas: {pendingRoutineInvites.length}</span>
              <span className="tiny-badge">Quedadas: {pendingMeetups.length}</span>
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
          <div className="mobile-tabs">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`mobile-tab ${tab === item.value ? 'active' : ''}`}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto w-full md:w-72">
            <Search size={14} className="faint-text absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="field pl-8 pr-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrar por nombre o rutina"
              aria-label="Filtrar avisos"
            />
            {search && (
              <button
                type="button"
                className="btn-ghost absolute right-1 top-1/2 -translate-y-1/2 p-1.5"
                onClick={() => setSearch('')}
                aria-label="Limpiar filtro"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <SkeletonList count={4} />
        ) : totalPending === 0 ? (
          <div className="panel p-10 text-center">
            <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <h2 className="text-xl font-semibold">Todo al día</h2>
            <p className="section-subtitle mt-1">No tienes nada pendiente de responder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {showFriends && (
              <section className="panel p-5">
                <h2 className="mb-3 inline-flex items-center gap-2 text-xl font-semibold">
                  <UserPlus size={19} />
                  Solicitudes de amistad
                </h2>
                <div className="space-y-2">
                  {friendFiltered.map((friend) => (
                    <div key={friend.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => navigate(`/users/${friend.friend_id}`)}
                      >
                        <div className="truncate font-semibold">{friend.friend_username}</div>
                        <div className="soft-text text-sm">quiere ser tu amigo</div>
                      </button>
                      <div className="flex shrink-0 gap-2">
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => runAction(friend.id, () => friendService.acceptRequest(friend.id), 'Amistad aceptada')}
                          disabled={busyId === friend.id}
                        >
                          <CheckCircle2 size={14} />
                          Aceptar
                        </button>
                        <button
                          className="btn-soft btn-sm"
                          onClick={() => runAction(friend.id, () => friendService.rejectRequest(friend.id), 'Solicitud rechazada')}
                          disabled={busyId === friend.id}
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                  {friendFiltered.length === 0 && <div className="empty-state">Sin solicitudes de amistad.</div>}
                </div>
              </section>
            )}

            {showRoutines && (
              <section className="panel p-5">
                <h2 className="mb-3 inline-flex items-center gap-2 text-xl font-semibold">
                  <Swords size={19} />
                  Invitaciones de rutina
                </h2>
                <div className="space-y-2">
                  {routineFiltered.map((invitation) => (
                    <div key={invitation.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{invitation.routine_name}</div>
                        <div className="soft-text text-sm">Invitación de {invitation.from_username}</div>
                        {invitation.message && (
                          <div className="soft-text mt-1 text-xs italic">“{invitation.message}”</div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          className="btn-primary btn-sm"
                          onClick={() =>
                            runAction(
                              invitation.id,
                              () => routineService.answerInvitation(invitation.id, { action: 'accepted' }),
                              'Invitación aceptada'
                            )
                          }
                          disabled={busyId === invitation.id}
                        >
                          <CheckCircle2 size={14} />
                          Aceptar
                        </button>
                        <button
                          className="btn-soft btn-sm"
                          onClick={() =>
                            runAction(
                              invitation.id,
                              () => routineService.answerInvitation(invitation.id, { action: 'rejected' }),
                              'Invitación rechazada'
                            )
                          }
                          disabled={busyId === invitation.id}
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                  {routineFiltered.length === 0 && <div className="empty-state">Sin invitaciones de rutina.</div>}
                </div>
              </section>
            )}

            {showMeetups && (
              <section className={`panel p-5 ${tab === 'all' ? 'lg:col-span-2' : ''}`}>
                <h2 className="mb-3 inline-flex items-center gap-2 text-xl font-semibold">
                  <CalendarClock size={19} />
                  Quedadas de entrenamiento
                </h2>
                <div className="space-y-2">
                  {meetupFiltered.map((meetup) => {
                    const isOrganizer = meetup.organizer_user_id === currentUserId
                    return (
                      <div key={meetup.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{meetup.title}</div>
                          <div className="soft-text text-sm">
                            {new Date(`${meetup.meetup_date}T12:00:00`).toLocaleDateString('es-ES', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}
                            {meetup.meetup_time ? ` · ${meetup.meetup_time.slice(0, 5)}` : ''} ·{' '}
                            {isOrganizer ? `con ${meetup.invited_username}` : `propuesta por ${meetup.organizer_username}`}
                          </div>
                          {meetup.notes && <div className="soft-text mt-1 text-xs">{meetup.notes}</div>}
                        </div>
                        <div className="flex shrink-0 gap-2">
                          {isOrganizer ? (
                            <button
                              className="btn-danger btn-sm"
                              onClick={() =>
                                runAction(meetup.id, () => trainingService.respondMeetup(meetup.id, 'cancelled'), 'Quedada cancelada')
                              }
                              disabled={busyId === meetup.id}
                            >
                              Cancelar
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() =>
                                  runAction(meetup.id, () => trainingService.respondMeetup(meetup.id, 'accepted'), 'Quedada aceptada')
                                }
                                disabled={busyId === meetup.id}
                              >
                                <CheckCircle2 size={14} />
                                Aceptar
                              </button>
                              <button
                                className="btn-soft btn-sm"
                                onClick={() =>
                                  runAction(meetup.id, () => trainingService.respondMeetup(meetup.id, 'rejected'), 'Quedada rechazada')
                                }
                                disabled={busyId === meetup.id}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {meetupFiltered.length === 0 && <div className="empty-state">Sin quedadas pendientes.</div>}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  )
}
