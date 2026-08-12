import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Users, XCircle } from 'lucide-react'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { trainingService } from '../services/api'

type TrainingDay = {
  day: string
  logs_count: number
  total_volume: string
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

function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function CalendarPage() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [trainingDays, setTrainingDays] = useState<TrainingDay[]>([])
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const loadCalendar = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await trainingService.getCalendar(month)
      setTrainingDays(response.data.trainingDays || [])
      setMeetups(response.data.meetups || [])
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo cargar el calendario')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCalendar().catch(() => undefined)
  }, [month])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2400)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const daysWithTraining = useMemo(() => new Set(trainingDays.map((item) => item.day)), [trainingDays])

  const respond = async (id: string, action: 'accepted' | 'rejected') => {
    try {
      await trainingService.respondMeetup(id, action)
      await loadCalendar()
      setStatusMessage(action === 'accepted' ? 'Quedada aceptada' : 'Quedada rechazada')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo responder la quedada')
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<CalendarDays className="title-icon" />}
          title="Calendario"
          subtitle="Días entrenados y quedadas con amigos en una sola vista."
          actions={
            <>
              <input type="month" className="field text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
            </>
          }
        />

        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}

        {loading ? (
          <div className="panel p-5 inline-flex items-center gap-2 soft-text"><span className="loader" />Cargando calendario...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
            <section className="panel p-5 stack-gap">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Días de entreno</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Array.from(daysWithTraining).map((day) => {
                  const row = trainingDays.find((item) => item.day === day)
                  return (
                    <div key={day} className="border border-emerald-400/35 bg-emerald-500/10 rounded p-2">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{day}</div>
                      <div className="text-xs soft-text">Sesiones: {row?.logs_count || 0}</div>
                      <div className="text-xs soft-text">Volumen: {Number(row?.total_volume || 0).toFixed(2)} kg</div>
                    </div>
                  )
                })}
                {trainingDays.length === 0 && <div className="empty-state col-span-2 md:col-span-3">No hay entrenos registrados en este mes.</div>}
              </div>
            </section>

            <section className="panel p-5 stack-gap">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Users size={18} />Quedadas</h2>
              <div className="space-y-2">
                {meetups.map((meetup) => (
                  <article key={meetup.id} className="border border-slate-400/30 dark:border-slate-700 rounded p-3 bg-white/40 dark:bg-slate-900/35">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{meetup.title}</div>
                        <div className="text-xs soft-text">{meetup.meetup_date}{meetup.meetup_time ? ` · ${meetup.meetup_time.slice(0, 5)}` : ''}</div>
                        <div className="text-xs soft-text">{meetup.organizer_username} con {meetup.invited_username}</div>
                        {meetup.notes && <div className="text-xs soft-text mt-1">{meetup.notes}</div>}
                      </div>
                      <span className="tiny-badge">{meetup.status}</span>
                    </div>
                    {meetup.status === 'pending' && (
                      <div className="flex gap-2 mt-2">
                        <button type="button" className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => respond(meetup.id, 'accepted')}><CheckCircle2 size={14} />Aceptar</button>
                        <button type="button" className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => respond(meetup.id, 'rejected')}><XCircle size={14} />Rechazar</button>
                      </div>
                    )}
                  </article>
                ))}
                {meetups.length === 0 && <div className="empty-state inline-flex items-center gap-1"><Clock3 size={14} />No hay quedadas para este mes.</div>}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
