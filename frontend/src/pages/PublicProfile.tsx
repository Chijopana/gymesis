import { useEffect, useMemo, useState } from 'react'
import { CopyPlus, Dumbbell, Images, UserPlus, UserRoundCheck, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { groupService, routineService, trainingService, userService } from '../services/api'

type PublicRoutine = {
  id: string
  name: string
  description?: string
  exercises_count?: number
}

type PublicGroup = {
  id: string
  name: string
  description?: string
  group_image_url?: string
  members_count?: number
}

type PublicPhoto = {
  id: string
  image_url: string
  caption?: string
  taken_at?: string
}

type PublicProfileResponse = {
  user: {
    id: string
    username: string
    first_name?: string
    last_name?: string
    favorite_muscle?: string
    profile_image_url?: string
    bio?: string
  }
  routines: PublicRoutine[]
  groups: PublicGroup[]
  photos: PublicPhoto[]
  social: {
    isSelf: boolean
    isFollowing: boolean
    followersCount: number
    followingCount: number
  }
}

export default function PublicProfile() {
  const navigate = useNavigate()
  const { userId = '' } = useParams()
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [meetupForm, setMeetupForm] = useState({ meetupDate: '', meetupTime: '', title: 'Entreno juntos', notes: '' })

  const fullName = useMemo(() => {
    const first = profile?.user.first_name?.trim() || ''
    const last = profile?.user.last_name?.trim() || ''
    return `${first} ${last}`.trim()
  }, [profile])

  const loadProfile = async () => {
    if (!userId) return
    try {
      setLoading(true)
      setError('')
      const response = await userService.getUserById(userId)
      setProfile(response.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo cargar el perfil')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile().catch(() => undefined)
  }, [userId])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2600)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const toggleFollow = async () => {
    if (!profile || profile.social.isSelf) return
    try {
      setBusyAction('follow')
      if (profile.social.isFollowing) {
        await userService.unfollowUser(profile.user.id)
        setStatusMessage('Has dejado de seguir a este perfil')
      } else {
        await userService.followUser(profile.user.id)
        setStatusMessage('Ahora sigues a este perfil')
      }
      await loadProfile()
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo actualizar seguimiento')
    } finally {
      setBusyAction('')
    }
  }

  const cloneRoutine = async (routine: PublicRoutine) => {
    try {
      setBusyAction(`clone:${routine.id}`)
      await routineService.cloneRoutine(routine.id)
      setStatusMessage(`Rutina copiada: ${routine.name}`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo copiar la rutina')
    } finally {
      setBusyAction('')
    }
  }

  const requestJoinGroup = async (group: PublicGroup) => {
  try {
    setBusyAction(`group:${group.id}`)
    await groupService.requestJoin(group.id)
    setStatusMessage(`Solicitud enviada. El creador del grupo "${group.name}" debe aprobarla.`)
  } catch (err: any) {
    setError(err.response?.data?.error || 'No se pudo solicitar ingreso al grupo')
  } finally {
    setBusyAction('')
  }
}

  const scheduleMeetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile || profile.social.isSelf) return
    if (!meetupForm.meetupDate || !meetupForm.title.trim()) {
      setStatusMessage('Completa fecha y título para la quedada')
      return
    }
    try {
      setBusyAction('meetup')
      await trainingService.createMeetup({
        invitedUserId: profile.user.id,
        meetupDate: meetupForm.meetupDate,
        meetupTime: meetupForm.meetupTime || undefined,
        title: meetupForm.title.trim(),
        notes: meetupForm.notes.trim() || undefined,
      })
      setMeetupForm({ meetupDate: '', meetupTime: '', title: 'Entreno juntos', notes: '' })
      setStatusMessage('Quedada enviada. Se verá en el calendario y notificaciones.')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo crear la quedada')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<UserRoundCheck className="title-icon" />}
          title="Perfil público"
          subtitle="Sigue atletas, copia rutinas y solicita acceso a sus grupos."
          actions={
            <>
              <button className="btn-soft text-sm" onClick={() => navigate('/friends')}>Volver a amigos</button>
              {profile?.social.isSelf && <button className="btn-soft text-sm" onClick={() => navigate('/profile')}>Editar mi perfil</button>}
            </>
          }
        />

        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}

        {loading ? (
          <div className="panel p-5 inline-flex items-center gap-2 soft-text"><span className="loader" />Cargando perfil...</div>
        ) : profile ? (
          <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
            <section className="panel p-5 stack-gap">
              <div className="flex items-start gap-3">
                <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-400/30 dark:border-slate-700 bg-slate-200 dark:bg-slate-800">
                  {profile.user.profile_image_url ? (
                    <img src={profile.user.profile_image_url} alt={profile.user.username} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{fullName || profile.user.username}</h2>
                  <div className="text-sm soft-text">@{profile.user.username}</div>
                  {profile.user.favorite_muscle && <div className="tiny-badge mt-2">Favorito: {profile.user.favorite_muscle}</div>}
                </div>
              </div>
              {profile.user.bio && <div className="soft-text">{profile.user.bio}</div>}

              <div className="flex flex-wrap gap-2">
                <span className="tiny-badge">Seguidores: {profile.social.followersCount}</span>
                <span className="tiny-badge">Siguiendo: {profile.social.followingCount}</span>
                <span className="tiny-badge">Rutinas: {profile.routines.length}</span>
                <span className="tiny-badge">Grupos: {profile.groups.length}</span>
              </div>

              {!profile.social.isSelf && (
                <button className="btn-primary inline-flex items-center gap-1 w-fit" onClick={toggleFollow} disabled={busyAction === 'follow'}>
                  <UserPlus size={14} />{profile.social.isFollowing ? 'Dejar de seguir' : 'Seguir'}
                </button>
              )}
            </section>

            <section className="grid grid-cols-1 gap-6">
              <article className="panel p-5 stack-gap">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Dumbbell size={18} />Rutinas</h3>
                <div className="space-y-2">
                  {profile.routines.map((routine) => (
                    <div key={routine.id} className="border border-slate-400/30 dark:border-slate-700 rounded p-3 bg-white/40 dark:bg-slate-900/35 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{routine.name}</div>
                        <div className="text-xs soft-text">{routine.description || 'Sin descripción'} · Ejercicios: {routine.exercises_count || 0}</div>
                      </div>
                      <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => cloneRoutine(routine)} disabled={busyAction === `clone:${routine.id}`}>
                        <CopyPlus size={14} />Copiar rutina
                      </button>
                    </div>
                  ))}
                  {profile.routines.length === 0 && <div className="empty-state">Este atleta aún no tiene rutinas publicadas.</div>}
                </div>
              </article>

              <article className="panel p-5 stack-gap">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Users size={18} />Grupos</h3>
                <div className="space-y-2">
                  {profile.groups.map((group) => (
                    <div key={group.id} className="border border-slate-400/30 dark:border-slate-700 rounded p-3 bg-white/40 dark:bg-slate-900/35 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{group.name}</div>
                        <div className="text-xs soft-text">{group.description || 'Sin descripción'} · Miembros: {group.members_count || 0}</div>
                      </div>
                      <button className="btn-soft text-sm" onClick={() => requestJoinGroup(group)} disabled={busyAction === `group:${group.id}`}>Solicitar unirme</button>
                    </div>
                  ))}
                  {profile.groups.length === 0 && <div className="empty-state">Este atleta aún no tiene grupos visibles.</div>}
                </div>
              </article>

              <article className="panel p-5 stack-gap">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Images size={18} />Galería de progreso</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {profile.photos.map((photo) => (
                    <figure key={photo.id} className="rounded overflow-hidden border border-slate-400/30 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50">
                      <img src={photo.image_url} alt={photo.caption || 'Progreso'} className="w-full h-32 object-cover" />
                      <figcaption className="p-2 text-xs soft-text">{photo.caption || 'Sin descripción'}</figcaption>
                    </figure>
                  ))}
                  {profile.photos.length === 0 && <div className="empty-state col-span-2 md:col-span-3">No hay fotos de progreso todavía.</div>}
                </div>
              </article>

              {!profile.social.isSelf && (
                <article className="panel p-5 stack-gap">
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Organizar quedada</h3>
                  <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={scheduleMeetup}>
                    <input type="date" className="field" value={meetupForm.meetupDate} onChange={(e) => setMeetupForm((s) => ({ ...s, meetupDate: e.target.value }))} required />
                    <input type="time" className="field" value={meetupForm.meetupTime} onChange={(e) => setMeetupForm((s) => ({ ...s, meetupTime: e.target.value }))} />
                    <input className="field md:col-span-2" value={meetupForm.title} onChange={(e) => setMeetupForm((s) => ({ ...s, title: e.target.value }))} placeholder="Título" required />
                    <input className="field md:col-span-2" value={meetupForm.notes} onChange={(e) => setMeetupForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Notas (opcional)" />
                    <button className="btn-primary w-fit" type="submit" disabled={busyAction === 'meetup'}>Enviar propuesta</button>
                  </form>
                </article>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </>
  )
}
