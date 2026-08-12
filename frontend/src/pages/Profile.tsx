import { useEffect, useState } from 'react'
import { BadgeCheck, ClipboardCopy, Dumbbell, Mail, UserCircle2, UserRound, ImagePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { userService } from '../services/api'

interface ProfileData {
  user: {
    id: string
    username: string
    email: string
    firstName?: string
    lastName?: string
    favoriteMuscle?: string
    bio?: string
    profileImageUrl?: string
  }
  routines: Array<{ id: string; name: string; description?: string }>
  groups: Array<{ id: string; name: string; description?: string; groupImageUrl?: string; routineName?: string }>
  photos: Array<{ id: string; image_url: string; caption?: string; taken_at?: string }>
  stats?: { completedTrainings?: number }
}

export default function Profile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    favoriteMuscle: '',
    bio: '',
    profileImageUrl: '',
  })
  const [photoForm, setPhotoForm] = useState({ imageUrl: '', caption: '', takenAt: '' })

  const loadProfile = async () => {
    try {
      setLoading(true)
      const response = await userService.getProfile()
      const data = response.data as ProfileData
      setProfile(data)
      setForm({
        firstName: data.user.firstName || '',
        lastName: data.user.lastName || '',
        favoriteMuscle: data.user.favoriteMuscle || '',
        bio: data.user.bio || '',
        profileImageUrl: data.user.profileImageUrl || '',
      })
      setError('')
      setStatusMessage('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo cargar el perfil')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2600)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      await userService.updateProfile(form)
      await loadProfile()
      setStatusMessage('Perfil actualizado correctamente')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo actualizar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    if (!profile) return
    setForm({
      firstName: profile.user.firstName || '',
      lastName: profile.user.lastName || '',
      favoriteMuscle: profile.user.favoriteMuscle || '',
      bio: profile.user.bio || '',
      profileImageUrl: profile.user.profileImageUrl || '',
    })
    setStatusMessage('Cambios descartados')
  }

  const completionItems = [form.firstName, form.lastName, form.favoriteMuscle, form.bio]
  const completion = Math.round((completionItems.filter((x) => x.trim().length > 0).length / completionItems.length) * 100)

  const copySummary = async () => {
    if (!profile) return
    const text = `Atleta: ${profile.user.username} | Rutinas: ${profile.routines.length} | Grupos: ${profile.groups.length}`
    try {
      await navigator.clipboard.writeText(text)
      setStatusMessage('Resumen copiado al portapapeles')
    } catch {
      setStatusMessage('No se pudo copiar el resumen')
    }
  }

  const addPhoto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!photoForm.imageUrl.trim()) {
      setStatusMessage('Debes indicar una URL de imagen para la galería')
      return
    }
    try {
      await userService.addProgressPhoto(photoForm)
      setPhotoForm({ imageUrl: '', caption: '', takenAt: '' })
      await loadProfile()
      setStatusMessage('Foto agregada a tu galería')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo agregar la foto')
    }
  }

  const removePhoto = async (photoId: string) => {
    try {
      await userService.deleteProgressPhoto(photoId)
      await loadProfile()
      setStatusMessage('Foto eliminada de tu galería')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo eliminar la foto')
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<UserCircle2 className="title-icon" />}
          title="Perfil atleta"
          subtitle="Tu identidad deportiva, tus grupos y tus rutinas activas en un solo lugar."
          actions={
            <>
              {profile?.user.id && <button className="btn-soft text-sm" onClick={() => navigate(`/users/${profile.user.id}`)}>Ver perfil público</button>}
            </>
          }
        />
        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}
        <section className="panel p-4 mb-6 stack-gap">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="soft-text">Completitud de perfil: <strong className="text-slate-900 dark:text-slate-100">{completion}%</strong></div>
            <div className="tiny-badge">Entrenos completados: {profile?.stats?.completedTrainings || 0}</div>
            <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={copySummary}><ClipboardCopy size={14} />Copiar resumen</button>
          </div>
          <div className="text-sm soft-text">Perfil simple: completa lo esencial, guarda y sigue entrenando.</div>
          <div className="w-full rounded-full h-2 bg-slate-300/50 dark:bg-slate-700 mt-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-500" style={{ width: `${completion}%` }} />
          </div>
        </section>

        {loading ? (
          <div className="soft-text inline-flex items-center gap-2"><span className="loader" />Cargando perfil...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
            <form onSubmit={saveProfile} className="panel p-6 space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><BadgeCheck size={20} />Datos personales</h2>
              <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4 items-start">
                <div className="panel p-3 stack-gap items-center text-center">
                  <div className="w-28 h-28 rounded-full overflow-hidden border border-slate-400/30 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 mx-auto">
                    {form.profileImageUrl ? (
                      <img src={form.profileImageUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500">
                        <UserCircle2 size={44} />
                      </div>
                    )}
                  </div>
                  <div className="text-xs soft-text">Pega una URL de imagen para tu foto de perfil.</div>
                </div>
                <div className="stack-gap">
                  <label className="field-label inline-flex items-center gap-1"><ImagePlus size={14} />Foto de perfil</label>
                  <input
                    value={form.profileImageUrl}
                    onChange={(e) => setForm((s) => ({ ...s, profileImageUrl: e.target.value }))}
                    className="field"
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Nombre</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((s) => ({ ...s, firstName: e.target.value }))}
                    className="field"
                  />
                </div>
                <div>
                  <label className="field-label">Apellido</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((s) => ({ ...s, lastName: e.target.value }))}
                    className="field"
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Musculo favorito</label>
                <input
                  list="muscle-pref-options"
                  value={form.favoriteMuscle}
                  onChange={(e) => setForm((s) => ({ ...s, favoriteMuscle: e.target.value }))}
                  className="field"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {['Pecho', 'Espalda', 'Pierna', 'Core'].map((m) => (
                    <button key={m} type="button" className="btn-soft text-xs" onClick={() => setForm((s) => ({ ...s, favoriteMuscle: m }))}>{m}</button>
                  ))}
                </div>
                <datalist id="muscle-pref-options">
                  {['Pecho', 'Espalda', 'Hombros', 'Biceps', 'Triceps', 'Pierna', 'Core'].map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="field-label">Bio</label>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm((s) => ({ ...s, bio: e.target.value }))}
                  className="field min-h-24"
                />
                <div className="soft-text text-xs mt-1">{form.bio.length}/240 caracteres</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Guardar perfil'}
                </button>
                <button type="button" className="btn-soft" onClick={resetForm}>Revertir</button>
              </div>
            </form>

            <section className="panel p-6 stack-gap">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Galería de progreso</h2>
              <form onSubmit={addPhoto} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className="field" placeholder="URL de imagen" value={photoForm.imageUrl} onChange={(e) => setPhotoForm((s) => ({ ...s, imageUrl: e.target.value }))} required />
                <input className="field" placeholder="Descripción (opcional)" value={photoForm.caption} onChange={(e) => setPhotoForm((s) => ({ ...s, caption: e.target.value }))} />
                <div className="flex gap-2">
                  <input type="date" className="field" value={photoForm.takenAt} onChange={(e) => setPhotoForm((s) => ({ ...s, takenAt: e.target.value }))} />
                  <button className="btn-primary" type="submit">Agregar</button>
                </div>
              </form>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(profile?.photos || []).map((photo) => (
                  <article key={photo.id} className="border border-slate-400/30 dark:border-slate-700 rounded overflow-hidden bg-white/50 dark:bg-slate-900/35">
                    <img src={photo.image_url} alt={photo.caption || 'Progreso'} className="w-full h-32 object-cover" />
                    <div className="p-2 stack-gap">
                      <div className="text-xs soft-text">{photo.caption || 'Sin descripción'}</div>
                      <div className="text-xs soft-text">{photo.taken_at ? String(photo.taken_at).slice(0, 10) : 'Sin fecha'}</div>
                      <button type="button" className="btn-soft text-xs" onClick={() => removePhoto(photo.id)}>Eliminar</button>
                    </div>
                  </article>
                ))}
                {(profile?.photos || []).length === 0 && <div className="empty-state col-span-2 md:col-span-3">Aún no tienes fotos en tu galería.</div>}
              </div>
            </section>
            </div>

            <div className="panel p-6 space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Resumen</h2>
              <div>
                <div className="text-sm soft-text inline-flex items-center gap-1"><UserRound size={13} />Usuario</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{profile?.user.username}</div>
              </div>
              <div>
                <div className="text-sm soft-text inline-flex items-center gap-1"><Mail size={13} />Email</div>
                <div className="font-semibold break-all text-slate-900 dark:text-slate-100">{profile?.user.email}</div>
              </div>
              <div>
                <div className="text-sm soft-text inline-flex items-center gap-1"><Dumbbell size={13} />Rutinas activas</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{profile?.routines.length || 0}</div>
              </div>
              <div>
                <div className="text-sm soft-text">Grupos</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{profile?.groups.length || 0}</div>
              </div>
              <div>
                <div className="text-sm soft-text mb-1">Rutinas</div>
                <ul className="text-sm space-y-1">
                  {(profile?.routines || []).slice(0, 5).map((r) => (
                    <li key={r.id} className="text-slate-800 dark:text-slate-200">• {r.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-sm soft-text mb-1">Grupos</div>
                <ul className="text-sm space-y-1">
                  {(profile?.groups || []).slice(0, 5).map((g) => (
                    <li key={g.id} className="text-slate-800 dark:text-slate-200">
                      • {g.name}{g.routineName ? ` · ${g.routineName}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
