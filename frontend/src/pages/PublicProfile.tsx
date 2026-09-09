import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus, CopyPlus, Dumbbell, Images, UserCheck, UserPlus, UserRoundCheck, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { friendService, getErrorMessage, groupService, routineService, trainingService, userService } from '../services/api'
import { emitFeedback } from '../utils/feedback'

type PublicRoutine = { id: string; name: string; description?: string; exercises_count?: number }
type PublicGroup = { id: string; name: string; description?: string; members_count?: number }
type PublicPhoto = { id: string; image_url: string; caption?: string; taken_at?: string }

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
    friendshipStatus: 'none' | 'pending' | 'accepted' | 'blocked'
    friendRequestSentByMe: boolean
  }
  stats?: { completedTrainings?: number; trainingDays?: number; totalVolumeKg?: number }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function PublicProfile() {
  const navigate = useNavigate()
  const { userId = '' } = useParams()
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [meetupForm, setMeetupForm] = useState({ meetupDate: '', meetupTime: '', title: 'Entrenamos juntos', notes: '' })

  const fullName = useMemo(() => {
    const first = profile?.user.first_name?.trim() || ''
    const last = profile?.user.last_name?.trim() || ''
    return `${first} ${last}`.trim()
  }, [profile])

  const loadProfile = useCallback(async () => {
    if (!userId) return
    try {
      setLoading(true)
      setError('')
      const response = await userService.getUserById(userId)
      setProfile(response.data)
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido cargar el perfil.'))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const runAction = async (key: string, action: () => Promise<void>, successTitle: string) => {
    try {
      setBusyAction(key)
      await action()
      await loadProfile()
      emitFeedback({ kind: 'success', title: successTitle })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No ha sido posible', message: getErrorMessage(err) })
    } finally {
      setBusyAction('')
    }
  }

  const toggleFollow = () => {
    if (!profile || profile.social.isSelf) return
    const following = profile.social.isFollowing
    runAction(
      'follow',
      async () => {
        if (following) await userService.unfollowUser(profile.user.id)
        else await userService.followUser(profile.user.id)
      },
      following ? 'Has dejado de seguir a este perfil' : 'Ahora sigues a este perfil'
    )
  }

  const sendFriendRequest = () => {
    if (!profile) return
    runAction('friend', async () => {
      await friendService.sendRequest(profile.user.id)
    }, 'Solicitud de amistad enviada')
  }

  const cloneRoutine = (routine: PublicRoutine) =>
    runAction(
      `clone:${routine.id}`,
      async () => {
        await routineService.cloneRoutine(routine.id)
      },
      `Rutina copiada: ${routine.name}`
    )

  const requestJoinGroup = (group: PublicGroup) =>
    runAction(
      `group:${group.id}`,
      async () => {
        await groupService.requestJoin(group.id)
      },
      `Solicitud enviada al grupo "${group.name}"`
    )

  const scheduleMeetup = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profile || profile.social.isSelf) return

    await runAction(
      'meetup',
      async () => {
        await trainingService.createMeetup({
          invitedUserId: profile.user.id,
          meetupDate: meetupForm.meetupDate,
          meetupTime: meetupForm.meetupTime || undefined,
          title: meetupForm.title.trim(),
          notes: meetupForm.notes.trim() || undefined,
        })
        setMeetupForm({ meetupDate: '', meetupTime: '', title: 'Entrenamos juntos', notes: '' })
      },
      'Propuesta de quedada enviada'
    )
  }

  const isFriend = profile?.social.friendshipStatus === 'accepted'
  const friendPending = profile?.social.friendshipStatus === 'pending'

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<UserRoundCheck className="title-icon" />}
          title={loading ? 'Cargando perfil...' : fullName || profile?.user.username || 'Perfil'}
          subtitle="Sigue a otros atletas, copia sus rutinas y organiza entrenos juntos."
          actions={
            <>
              <button className="btn-soft btn-sm" onClick={() => navigate(-1)}>
                Volver
              </button>
              {profile?.social.isSelf && (
                <button className="btn-soft btn-sm" onClick={() => navigate('/profile')}>
                  Editar mi perfil
                </button>
              )}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <section className="panel h-fit space-y-4 p-5 xl:sticky xl:top-20">
              <div className="flex items-start gap-4">
                <div
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-full"
                  style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-elev)' }}
                >
                  {profile.user.profile_image_url ? (
                    <img
                      src={profile.user.profile_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-2xl font-bold"
                      style={{ color: 'var(--brand-strong)' }}
                    >
                      {profile.user.username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">{fullName || profile.user.username}</h2>
                  <div className="soft-text text-sm">@{profile.user.username}</div>
                  {profile.user.favorite_muscle && (
                    <span className="tiny-badge mt-2">Favorito: {profile.user.favorite_muscle}</span>
                  )}
                </div>
              </div>

              {profile.user.bio && <p className="soft-text leading-relaxed">{profile.user.bio}</p>}

              <div className="kpi-strip">
                <span className="tiny-badge">Seguidores: {profile.social.followersCount}</span>
                <span className="tiny-badge">Siguiendo: {profile.social.followingCount}</span>
                <span className="tiny-badge">Días entrenados: {profile.stats?.trainingDays ?? 0}</span>
                <span className="tiny-badge">
                  Volumen: {Math.round(profile.stats?.totalVolumeKg ?? 0).toLocaleString('es-ES')} kg
                </span>
              </div>

              {!profile.social.isSelf && (
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={toggleFollow} disabled={busyAction === 'follow'}>
                    {profile.social.isFollowing ? <UserCheck size={15} /> : <UserPlus size={15} />}
                    {profile.social.isFollowing ? 'Siguiendo' : 'Seguir'}
                  </button>

                  {isFriend ? (
                    <span className="tiny-badge tiny-badge-success">
                      <UserCheck size={12} />
                      Sois amigos
                    </span>
                  ) : friendPending ? (
                    <span className="tiny-badge tiny-badge-warning">Solicitud pendiente</span>
                  ) : (
                    <button className="btn-soft" onClick={sendFriendRequest} disabled={busyAction === 'friend'}>
                      <UserPlus size={15} />
                      Enviar solicitud de amistad
                    </button>
                  )}
                </div>
              )}

              {!profile.social.isSelf && !isFriend && (
                <p className="soft-text text-xs">
                  Para organizar quedadas necesitáis ser amigos aceptados.
                </p>
              )}
            </section>

            <div className="space-y-6">
              <article className="panel space-y-3 p-5">
                <h3 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <Dumbbell size={18} />
                  Rutinas públicas
                </h3>
                {profile.routines.length > 0 ? (
                  <div className="space-y-2">
                    {profile.routines.map((routine) => (
                      <div key={routine.id} className="list-row flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{routine.name}</div>
                          <div className="soft-text text-xs">
                            {routine.description || 'Sin descripción'} · {routine.exercises_count ?? 0} ejercicios
                          </div>
                        </div>
                        <button
                          className="btn-soft btn-sm"
                          onClick={() => cloneRoutine(routine)}
                          disabled={busyAction === `clone:${routine.id}`}
                        >
                          <CopyPlus size={14} />
                          Copiar a mis rutinas
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Este atleta no tiene rutinas públicas.</div>
                )}
              </article>

              <article className="panel space-y-3 p-5">
                <h3 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <Users size={18} />
                  Grupos
                </h3>
                {profile.groups.length > 0 ? (
                  <div className="space-y-2">
                    {profile.groups.map((group) => (
                      <div key={group.id} className="list-row flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">{group.name}</div>
                          <div className="soft-text text-xs">
                            {group.description || 'Sin descripción'} · {group.members_count ?? 0} miembros
                          </div>
                        </div>
                        {!profile.social.isSelf && (
                          <button
                            className="btn-soft btn-sm"
                            onClick={() => requestJoinGroup(group)}
                            disabled={busyAction === `group:${group.id}`}
                          >
                            Solicitar unirme
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Este atleta no pertenece a ningún grupo visible.</div>
                )}
              </article>

              <article className="panel space-y-3 p-5">
                <h3 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <Images size={18} />
                  Galería de progreso
                </h3>
                {profile.photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {profile.photos.map((photo) => (
                      <figure key={photo.id} className="list-row overflow-hidden !p-0">
                        <img
                          src={photo.image_url}
                          alt={photo.caption || 'Foto de progreso'}
                          className="h-32 w-full object-cover"
                          loading="lazy"
                        />
                        <figcaption className="soft-text truncate p-2 text-xs">
                          {photo.caption || 'Sin descripción'}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Todavía no hay fotos de progreso.</div>
                )}
              </article>

              {!profile.social.isSelf && isFriend && (
                <article className="panel space-y-3 p-5">
                  <h3 className="inline-flex items-center gap-2 text-xl font-semibold">
                    <CalendarPlus size={18} />
                    Proponer una quedada
                  </h3>
                  <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={scheduleMeetup}>
                    <div>
                      <label className="field-label" htmlFor="meetupDate">
                        Fecha
                      </label>
                      <input
                        id="meetupDate"
                        type="date"
                        className="field"
                        min={todayIso()}
                        value={meetupForm.meetupDate}
                        onChange={(event) => setMeetupForm((state) => ({ ...state, meetupDate: event.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="meetupTime">
                        Hora (opcional)
                      </label>
                      <input
                        id="meetupTime"
                        type="time"
                        className="field"
                        value={meetupForm.meetupTime}
                        onChange={(event) => setMeetupForm((state) => ({ ...state, meetupTime: event.target.value }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label" htmlFor="meetupTitle">
                        Título
                      </label>
                      <input
                        id="meetupTitle"
                        className="field"
                        value={meetupForm.title}
                        onChange={(event) => setMeetupForm((state) => ({ ...state, title: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="field-label" htmlFor="meetupNotes">
                        Notas (opcional)
                      </label>
                      <input
                        id="meetupNotes"
                        className="field"
                        placeholder="Gimnasio, hora exacta, qué toca..."
                        value={meetupForm.notes}
                        onChange={(event) => setMeetupForm((state) => ({ ...state, notes: event.target.value }))}
                      />
                    </div>
                    <button className="btn-primary w-fit" type="submit" disabled={busyAction === 'meetup'}>
                      Enviar propuesta
                    </button>
                  </form>
                </article>
              )}
            </div>
          </div>
        ) : null}
      </main>
    </>
  )
}
