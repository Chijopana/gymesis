import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck,
  ClipboardCopy,
  Dumbbell,
  ImagePlus,
  Images,
  Mail,
  Trash2,
  UserCircle2,
  UserRound,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { Skeleton } from '../components/Skeleton'
import { useConfirm } from '../components/ConfirmDialog'
import { getErrorMessage, userService } from '../services/api'
import { emitFeedback } from '../utils/feedback'
import { useAuthStore } from '../store/authStore'

type ProfileData = {
  user: {
    id: string
    username: string
    email: string
    firstName?: string | null
    lastName?: string | null
    favoriteMuscle?: string | null
    bio?: string | null
    profileImageUrl?: string | null
    createdAt?: string
  }
  // El backend devuelve estas colecciones en snake_case, tal cual salen de SQL.
  routines: Array<{ id: string; name: string; description?: string; is_public?: boolean; exercises_count?: number }>
  groups: Array<{ id: string; name: string; description?: string; routine_name?: string | null; members_count?: number }>
  photos: Array<{ id: string; image_url: string; caption?: string; taken_at?: string }>
  stats?: { completedTrainings?: number; trainingDays?: number; totalVolumeKg?: number }
  social?: { followersCount?: number; followingCount?: number }
}

const MUSCLE_OPTIONS = ['Pecho', 'Espalda', 'Hombros', 'Biceps', 'Triceps', 'Pierna', 'Gluteos', 'Core']
const BIO_MAX = 240

export default function Profile() {
  const navigate = useNavigate()
  const { confirm, confirmDialog } = useConfirm()
  const updateUser = useAuthStore((state) => state.updateUser)

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ firstName: '', lastName: '', favoriteMuscle: '', bio: '', profileImageUrl: '' })
  const [photoForm, setPhotoForm] = useState({ imageUrl: '', caption: '', takenAt: '' })
  const [addingPhoto, setAddingPhoto] = useState(false)

  const fillForm = (data: ProfileData) => {
    setForm({
      firstName: data.user.firstName ?? '',
      lastName: data.user.lastName ?? '',
      favoriteMuscle: data.user.favoriteMuscle ?? '',
      bio: data.user.bio ?? '',
      profileImageUrl: data.user.profileImageUrl ?? '',
    })
  }

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await userService.getProfile()
      const data = response.data as ProfileData
      setProfile(data)
      fillForm(data)
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido cargar el perfil.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      const response = await userService.updateProfile(form)
      // El navbar muestra el avatar: se actualiza sin recargar la sesión entera.
      if (response.data?.user) updateUser(response.data.user)
      await loadProfile()
      emitFeedback({ kind: 'success', title: 'Perfil actualizado' })
    } catch (err) {
      const message = getErrorMessage(err, 'No se ha podido actualizar el perfil.')
      setError(message)
      emitFeedback({ kind: 'error', title: 'No se ha podido guardar', message })
    } finally {
      setSaving(false)
    }
  }

  const addPhoto = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!photoForm.imageUrl.trim()) return

    try {
      setAddingPhoto(true)
      await userService.addProgressPhoto({
        imageUrl: photoForm.imageUrl.trim(),
        caption: photoForm.caption.trim() || undefined,
        takenAt: photoForm.takenAt || undefined,
      })
      setPhotoForm({ imageUrl: '', caption: '', takenAt: '' })
      await loadProfile()
      emitFeedback({ kind: 'success', title: 'Foto añadida a tu galería' })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido añadir la foto', message: getErrorMessage(err) })
    } finally {
      setAddingPhoto(false)
    }
  }

  const removePhoto = async (photoId: string) => {
    const ok = await confirm({
      title: 'Eliminar foto',
      message: 'Esta foto desaparecerá de tu galería de progreso. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await userService.deleteProgressPhoto(photoId)
      await loadProfile()
      emitFeedback({ kind: 'info', title: 'Foto eliminada' })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido eliminar', message: getErrorMessage(err) })
    }
  }

  const copySummary = async () => {
    if (!profile) return
    const text = `${profile.user.username} en Gymesis · ${profile.routines.length} rutinas · ${profile.groups.length} grupos · ${profile.stats?.trainingDays ?? 0} días entrenados`
    try {
      await navigator.clipboard.writeText(text)
      emitFeedback({ kind: 'info', title: 'Resumen copiado' })
    } catch {
      emitFeedback({ kind: 'warning', title: 'No se ha podido copiar', message: 'Tu navegador ha bloqueado el portapapeles.' })
    }
  }

  const completionFields = [form.firstName, form.lastName, form.favoriteMuscle, form.bio, form.profileImageUrl]
  const completion = Math.round((completionFields.filter((value) => value.trim().length > 0).length / completionFields.length) * 100)

  return (
    <>
      <Navbar />
      {confirmDialog}
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<UserCircle2 className="title-icon" />}
          title="Tu perfil"
          subtitle="Tu identidad deportiva, tus grupos y tu galería de progreso."
          actions={
            <>
              <button className="btn-soft btn-sm" onClick={copySummary}>
                <ClipboardCopy size={14} />
                Copiar resumen
              </button>
              {profile?.user.id && (
                <button className="btn-soft btn-sm" onClick={() => navigate(`/users/${profile.user.id}`)}>
                  Ver como lo ven otros
                </button>
              )}
            </>
          }
          meta={
            !loading && profile ? (
              <>
                <span className="tiny-badge">Días entrenados: {profile.stats?.trainingDays ?? 0}</span>
                <span className="tiny-badge">
                  Volumen total: {Math.round(profile.stats?.totalVolumeKg ?? 0).toLocaleString('es-ES')} kg
                </span>
                <span className="tiny-badge">Seguidores: {profile.social?.followersCount ?? 0}</span>
                <span className="tiny-badge">Siguiendo: {profile.social?.followingCount ?? 0}</span>
              </>
            ) : null
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        <section className="panel mb-6 p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="soft-text text-sm">
              Perfil completo al <strong style={{ color: 'var(--text-main)' }}>{completion}%</strong>
            </span>
            {completion < 100 && <span className="soft-text text-xs">Completa los campos vacíos para destacar</span>}
          </div>
          <div className="meter" role="img" aria-label={`Perfil completo al ${completion}%`}>
            <span style={{ width: `${completion}%` }} />
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <form onSubmit={saveProfile} className="panel space-y-4 p-6">
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <BadgeCheck size={19} />
                  Datos personales
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-[150px_1fr]">
                  <div className="panel-sunken flex flex-col items-center gap-2 p-3 text-center">
                    <div
                      className="h-24 w-24 overflow-hidden rounded-full"
                      style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-elev)' }}
                    >
                      {form.profileImageUrl ? (
                        <img
                          src={form.profileImageUrl}
                          alt="Vista previa de tu foto de perfil"
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="faint-text flex h-full w-full items-center justify-center">
                          <UserCircle2 size={42} />
                        </div>
                      )}
                    </div>
                    <p className="faint-text text-xs">Vista previa</p>
                  </div>

                  <div>
                    <label className="field-label inline-flex items-center gap-1" htmlFor="avatar">
                      <ImagePlus size={13} />
                      URL de tu foto de perfil
                    </label>
                    <input
                      id="avatar"
                      className="field"
                      type="url"
                      placeholder="https://..."
                      value={form.profileImageUrl}
                      onChange={(event) => setForm((state) => ({ ...state, profileImageUrl: event.target.value }))}
                    />
                    <p className="faint-text mt-1 text-xs">
                      Pega el enlace de una imagen alojada en internet (debe empezar por https://).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="firstName">
                      Nombre
                    </label>
                    <input
                      id="firstName"
                      className="field"
                      value={form.firstName}
                      onChange={(event) => setForm((state) => ({ ...state, firstName: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="lastName">
                      Apellido
                    </label>
                    <input
                      id="lastName"
                      className="field"
                      value={form.lastName}
                      onChange={(event) => setForm((state) => ({ ...state, lastName: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="favoriteMuscle">
                    Músculo favorito
                  </label>
                  <input
                    id="favoriteMuscle"
                    list="muscle-options"
                    className="field"
                    value={form.favoriteMuscle}
                    onChange={(event) => setForm((state) => ({ ...state, favoriteMuscle: event.target.value }))}
                  />
                  <datalist id="muscle-options">
                    {MUSCLE_OPTIONS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MUSCLE_OPTIONS.slice(0, 6).map((muscle) => (
                      <button
                        key={muscle}
                        type="button"
                        className={`btn-soft btn-xs ${form.favoriteMuscle === muscle ? 'is-active' : ''}`}
                        onClick={() => setForm((state) => ({ ...state, favoriteMuscle: muscle }))}
                      >
                        {muscle}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="field-label" htmlFor="bio">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    className="field min-h-24"
                    maxLength={BIO_MAX}
                    placeholder="Tus objetivos, tu deporte, lo que te mueve..."
                    value={form.bio}
                    onChange={(event) => setForm((state) => ({ ...state, bio: event.target.value }))}
                  />
                  <div
                    className="mt-1 text-right text-xs"
                    style={{ color: form.bio.length > BIO_MAX - 20 ? 'var(--warning)' : 'var(--text-faint)' }}
                  >
                    {form.bio.length}/{BIO_MAX}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? (
                      <>
                        <span className="loader" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar perfil'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => profile && fillForm(profile)}
                    disabled={saving}
                  >
                    Descartar cambios
                  </button>
                </div>
              </form>

              <section className="panel space-y-4 p-6">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                    <Images size={19} />
                    Galería de progreso
                  </h2>
                  <p className="section-subtitle">Guarda fotos para ver tu evolución a lo largo del tiempo.</p>
                </div>

                <form onSubmit={addPhoto} className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1.5fr_auto]">
                  <input
                    className="field"
                    type="url"
                    placeholder="URL de la imagen"
                    value={photoForm.imageUrl}
                    onChange={(event) => setPhotoForm((state) => ({ ...state, imageUrl: event.target.value }))}
                    required
                    aria-label="URL de la imagen"
                  />
                  <input
                    className="field"
                    placeholder="Descripción (opcional)"
                    value={photoForm.caption}
                    onChange={(event) => setPhotoForm((state) => ({ ...state, caption: event.target.value }))}
                    aria-label="Descripción de la foto"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="field"
                      value={photoForm.takenAt}
                      onChange={(event) => setPhotoForm((state) => ({ ...state, takenAt: event.target.value }))}
                      aria-label="Fecha de la foto"
                    />
                    <button className="btn-primary" type="submit" disabled={addingPhoto}>
                      Añadir
                    </button>
                  </div>
                </form>

                {profile && profile.photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {profile.photos.map((photo) => (
                      <figure key={photo.id} className="list-row overflow-hidden !p-0">
                        <img
                          src={photo.image_url}
                          alt={photo.caption || 'Foto de progreso'}
                          className="h-32 w-full object-cover"
                          loading="lazy"
                        />
                        <figcaption className="space-y-1.5 p-2">
                          <div className="soft-text truncate text-xs">{photo.caption || 'Sin descripción'}</div>
                          <div className="faint-text text-xs">
                            {photo.taken_at ? String(photo.taken_at).slice(0, 10) : 'Sin fecha'}
                          </div>
                          <button type="button" className="btn-danger btn-xs w-full" onClick={() => removePhoto(photo.id)}>
                            <Trash2 size={12} />
                            Eliminar
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Todavía no has subido ninguna foto de progreso.</div>
                )}
              </section>
            </div>

            <aside className="panel h-fit space-y-4 p-6 lg:sticky lg:top-20">
              <h2 className="text-xl font-semibold">Resumen</h2>

              <div>
                <div className="soft-text inline-flex items-center gap-1.5 text-sm">
                  <UserRound size={13} />
                  Usuario
                </div>
                <div className="font-semibold">{profile?.user.username}</div>
              </div>

              <div>
                <div className="soft-text inline-flex items-center gap-1.5 text-sm">
                  <Mail size={13} />
                  Email
                </div>
                <div className="break-all font-semibold">{profile?.user.email}</div>
                <p className="faint-text mt-0.5 text-xs">Sólo tú ves tu email; nunca aparece en tu perfil público.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="panel-sunken p-3">
                  <div className="soft-text inline-flex items-center gap-1 text-xs">
                    <Dumbbell size={12} />
                    Rutinas
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{profile?.routines.length ?? 0}</div>
                </div>
                <div className="panel-sunken p-3">
                  <div className="soft-text text-xs">Grupos</div>
                  <div className="text-2xl font-bold tabular-nums">{profile?.groups.length ?? 0}</div>
                </div>
              </div>

              {profile && profile.routines.length > 0 && (
                <div>
                  <div className="soft-text mb-1.5 text-sm font-semibold">Tus rutinas</div>
                  <ul className="space-y-1 text-sm">
                    {profile.routines.slice(0, 6).map((routine) => (
                      <li key={routine.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{routine.name}</span>
                        <span className="tiny-badge shrink-0">{routine.is_public ? 'Pública' : 'Privada'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {profile && profile.groups.length > 0 && (
                <div>
                  <div className="soft-text mb-1.5 text-sm font-semibold">Tus grupos</div>
                  <ul className="space-y-1 text-sm">
                    {profile.groups.slice(0, 6).map((group) => (
                      // routine_name viene en snake_case del backend: antes se leía
                      // como routineName y nunca se mostraba nada.
                      <li key={group.id} className="truncate">
                        {group.name}
                        {group.routine_name ? ` · ${group.routine_name}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </>
  )
}
