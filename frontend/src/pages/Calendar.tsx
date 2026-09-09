import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Users, XCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { getErrorMessage, trainingService } from '../services/api'
import { emitFeedback } from '../utils/feedback'
import { useAuthStore } from '../store/authStore'

type TrainingDay = {
  day: string
  logs_count: number
  total_volume: number | string
  exercises_count?: number
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

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const STATUS_LABEL: Record<Meetup['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
}

const STATUS_CLASS: Record<Meetup['status'], string> = {
  pending: 'tiny-badge-warning',
  accepted: 'tiny-badge-success',
  rejected: '',
  cancelled: '',
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function CalendarPage() {
  const currentUserId = useAuthStore((state) => state.user?.id)
  const [month, setMonth] = useState(currentMonth)
  const [trainingDays, setTrainingDays] = useState<TrainingDay[]>([])
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await trainingService.getCalendar(month)
      setTrainingDays(response.data.trainingDays || [])
      setMeetups(response.data.meetups || [])
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido cargar el calendario.'))
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    loadCalendar()
  }, [loadCalendar])

  const trainingByDay = useMemo(
    () => new Map(trainingDays.map((item) => [item.day, item])),
    [trainingDays]
  )

  const meetupsByDay = useMemo(() => {
    const map = new Map<string, Meetup[]>()
    meetups.forEach((meetup) => {
      const list = map.get(meetup.meetup_date) ?? []
      list.push(meetup)
      map.set(meetup.meetup_date, list)
    })
    return map
  }, [meetups])

  /** Rejilla de lunes a domingo con los huecos del mes anterior/siguiente vacíos. */
  const grid = useMemo(() => {
    const [year, monthNumber] = month.split('-').map(Number)
    const firstDay = new Date(year, monthNumber - 1, 1)
    const daysInMonth = new Date(year, monthNumber, 0).getDate()
    // getDay() da 0 para domingo; aquí la semana empieza en lunes.
    const leading = (firstDay.getDay() + 6) % 7

    const cells: Array<{ key: string; date: string | null; dayNumber: number | null }> = []
    for (let index = 0; index < leading; index += 1) {
      cells.push({ key: `blank-${index}`, date: null, dayNumber: null })
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${month}-${String(day).padStart(2, '0')}`
      cells.push({ key: date, date, dayNumber: day })
    }
    return cells
  }, [month])

  const monthTotals = useMemo(() => {
    const volume = trainingDays.reduce((sum, item) => sum + Number(item.total_volume || 0), 0)
    return { days: trainingDays.length, volume }
  }, [trainingDays])

  const respond = async (id: string, action: 'accepted' | 'rejected' | 'cancelled') => {
    try {
      await trainingService.respondMeetup(id, action)
      await loadCalendar()
      emitFeedback({
        kind: action === 'accepted' ? 'success' : 'info',
        title:
          action === 'accepted' ? 'Quedada aceptada' : action === 'rejected' ? 'Quedada rechazada' : 'Quedada cancelada',
      })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido responder', message: getErrorMessage(err) })
    }
  }

  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const selectedTraining = selectedDay ? trainingByDay.get(selectedDay) : null
  const selectedMeetups = selectedDay ? (meetupsByDay.get(selectedDay) ?? []) : []
  const today = todayKey()

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<CalendarDays className="title-icon" />}
          title="Calendario"
          subtitle="Tus días entrenados y las quedadas con amigos, mes a mes."
          actions={
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-soft btn-icon"
                onClick={() => setMonth((value) => shiftMonth(value, -1))}
                aria-label="Mes anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                className="field w-auto text-sm"
                value={month}
                onChange={(event) => event.target.value && setMonth(event.target.value)}
                aria-label="Mes mostrado"
              />
              <button
                type="button"
                className="btn-soft btn-icon"
                onClick={() => setMonth((value) => shiftMonth(value, 1))}
                aria-label="Mes siguiente"
              >
                <ChevronRight size={16} />
              </button>
              <button type="button" className="btn-soft btn-sm ml-1" onClick={() => setMonth(currentMonth())}>
                Hoy
              </button>
            </div>
          }
          meta={
            <>
              <span className="tiny-badge">Días entrenados: {monthTotals.days}</span>
              <span className="tiny-badge">
                Volumen del mes: {monthTotals.volume.toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg
              </span>
              <span className="tiny-badge">Quedadas: {meetups.length}</span>
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="panel p-5">
            {/* first-letter, no capitalize: si no, sale "Septiembre De 2026". */}
            <h2 className="mb-4 text-xl font-semibold first-letter:uppercase">{monthLabel}</h2>

            {loading ? (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 35 }, (_, index) => (
                  <Skeleton key={index} className="aspect-square" />
                ))}
              </div>
            ) : (
              <>
                <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day, index) => (
                    <div key={`${day}-${index}`} className="faint-text py-1 text-center text-xs font-bold">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {grid.map((cell) => {
                    if (!cell.date) return <div key={cell.key} />

                    const training = trainingByDay.get(cell.date)
                    const dayMeetups = meetupsByDay.get(cell.date) ?? []
                    const isToday = cell.date === today
                    const isSelected = cell.date === selectedDay

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => setSelectedDay(isSelected ? null : cell.date)}
                        className="relative flex aspect-square flex-col items-center justify-center rounded-md border p-1 transition-colors"
                        style={{
                          borderColor: isSelected
                            ? 'var(--brand)'
                            : isToday
                              ? 'color-mix(in srgb, var(--brand) 45%, transparent)'
                              : 'var(--line)',
                          background: training
                            ? 'var(--brand-tint-strong)'
                            : isSelected
                              ? 'var(--brand-tint)'
                              : 'var(--panel-sunken)',
                          fontWeight: training ? 700 : 500,
                        }}
                        aria-label={`${cell.dayNumber} — ${
                          training ? `${training.logs_count} registros` : 'sin entreno'
                        }${dayMeetups.length ? `, ${dayMeetups.length} quedada(s)` : ''}`}
                        aria-pressed={isSelected}
                      >
                        <span className={`text-sm ${isToday ? 'underline underline-offset-2' : ''}`}>
                          {cell.dayNumber}
                        </span>
                        <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                          {training && (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--chart-bar)' }} />
                          )}
                          {dayMeetups.length > 0 && (
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--warning)' }} />
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="kpi-strip mt-4 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--chart-bar)' }} />
                    Día entrenado
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: 'var(--warning)' }} />
                    Quedada
                  </span>
                </div>
              </>
            )}

            {selectedDay && (
              <div className="animate-in panel-sunken mt-4 p-4">
                <h3 className="font-semibold">
                  {new Date(`${selectedDay}T12:00:00`).toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </h3>
                {selectedTraining ? (
                  <div className="kpi-strip mt-2">
                    <span className="tiny-badge">Registros: {selectedTraining.logs_count}</span>
                    <span className="tiny-badge">
                      Volumen: {Number(selectedTraining.total_volume).toLocaleString('es-ES', { maximumFractionDigits: 0 })} kg
                    </span>
                    {selectedTraining.exercises_count != null && (
                      <span className="tiny-badge">Ejercicios: {selectedTraining.exercises_count}</span>
                    )}
                  </div>
                ) : (
                  <p className="soft-text mt-1 text-sm">Sin entrenamientos registrados este día.</p>
                )}
                {selectedMeetups.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {selectedMeetups.map((meetup) => (
                      <li key={meetup.id} className="soft-text">
                        · {meetup.title} {meetup.meetup_time ? `(${meetup.meetup_time.slice(0, 5)})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section className="panel space-y-3 p-5">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
              <Users size={18} />
              Quedadas
            </h2>

            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : meetups.length === 0 ? (
              <div className="empty-state">
                <Clock3 size={18} className="mx-auto mb-2 opacity-60" />
                No hay quedadas este mes. Propón una desde el perfil de un amigo.
              </div>
            ) : (
              <div className="space-y-2">
                {meetups.map((meetup) => {
                  const isOrganizer = meetup.organizer_user_id === currentUserId
                  return (
                    <article key={meetup.id} className="list-row">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold">{meetup.title}</div>
                          <div className="soft-text text-xs">
                            {new Date(`${meetup.meetup_date}T12:00:00`).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                            })}
                            {meetup.meetup_time ? ` · ${meetup.meetup_time.slice(0, 5)}` : ''}
                          </div>
                          <div className="soft-text text-xs">
                            {isOrganizer ? `Has invitado a ${meetup.invited_username}` : `${meetup.organizer_username} te ha invitado`}
                          </div>
                          {meetup.notes && <div className="soft-text mt-1 text-xs">{meetup.notes}</div>}
                        </div>
                        <span className={`tiny-badge ${STATUS_CLASS[meetup.status]}`}>
                          {STATUS_LABEL[meetup.status]}
                        </span>
                      </div>

                      {meetup.status === 'pending' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {isOrganizer ? (
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              onClick={() => respond(meetup.id, 'cancelled')}
                            >
                              <XCircle size={14} />
                              Cancelar
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn-primary btn-sm"
                                onClick={() => respond(meetup.id, 'accepted')}
                              >
                                <CheckCircle2 size={14} />
                                Aceptar
                              </button>
                              <button
                                type="button"
                                className="btn-soft btn-sm"
                                onClick={() => respond(meetup.id, 'rejected')}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
