import { useEffect, useMemo, useState } from 'react'
import { Check, CopyPlus, Dumbbell, Filter, Pencil, PlusCircle, RefreshCw, Search, Swords, Trash2, UserSearch } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { useIsLargeScreen } from '../hooks/useResponsive'
import { exerciseService, routineService, userService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'
import { setRoutineBridge } from '../utils/routineBridge'

type Routine = {
  id: string
  name: string
  description?: string
  owner_username?: string
}

type Exercise = {
  id: string
  name: string
  muscle_group: string
  sets: number
  reps: number
  rest_seconds: number
}

type ExerciseLibraryItem = {
  id: string
  name: string
  muscle_group: string
  primary_muscle?: string | null
  secondary_muscles?: string | null
  equipment?: string | null
  training_environment?: string | null
  difficulty_level?: string | null
  default_sets: number
  default_reps: number
  default_rest_seconds: number
}

type Invitation = {
  id: string
  routine_name: string
  from_username: string
  status: string
}

type SearchUser = { id: string; username: string }

const muscleOptions = [
  'Pecho', 'Espalda', 'Hombros', 'Biceps', 'Triceps', 'Cuadriceps', 'Femoral',
  'Gluteos', 'Pantorrilla', 'Core', 'Cardio', 'Full body'
]

export default function Routines() {
  const navigate = useNavigate()
  const isLargeScreen = useIsLargeScreen()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loadingRoutines, setLoadingRoutines] = useState(true)
  const [loadingExercises, setLoadingExercises] = useState(false)
  const [routineFilter, setRoutineFilter] = useState('')
  const [invitationFilter, setInvitationFilter] = useState<'all' | 'pending'>('all')
  const [exerciseFilter, setExerciseFilter] = useState('')
  const [sortExercisesAsc, setSortExercisesAsc] = useState(true)
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const [routineForm, setRoutineForm] = useState({ name: '', description: '' })
  const [exerciseForm, setExerciseForm] = useState({
    name: '',
    muscleGroup: '',
    sets: 3,
    reps: 8,
    restSeconds: 90,
  })

  const [editingExerciseId, setEditingExerciseId] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    muscleGroup: '',
    sets: 3,
    reps: 8,
    restSeconds: 90,
  })

  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState<SearchUser[]>([])
  const [inviteUserId, setInviteUserId] = useState('')
  const [mobileView, setMobileView] = useState<'builder' | 'exercises' | 'challenges'>('builder')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<ExerciseLibraryItem[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryMuscle, setLibraryMuscle] = useState('')
  const [libraryEnvironment, setLibraryEnvironment] = useState('')
  const [libraryOffset, setLibraryOffset] = useState(0)
  const [libraryHasMore, setLibraryHasMore] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [selectedLibraryExerciseId, setSelectedLibraryExerciseId] = useState('')

  const selectedRoutine = useMemo(
    () => routines.find((r) => r.id === selectedRoutineId) || null,
    [routines, selectedRoutineId]
  )

  const selectedRoutineExercises = useMemo(
    () => exercises.length,
    [exercises]
  )

  const filteredRoutines = useMemo(() => {
    if (!routineFilter.trim()) return routines
    const q = routineFilter.toLowerCase()
    return routines.filter((r) => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
  }, [routines, routineFilter])

  const shownInvitations = useMemo(() => {
    if (invitationFilter === 'pending') return invitations.filter((i) => i.status === 'pending')
    return invitations
  }, [invitations, invitationFilter])

  const shownExercises = useMemo(() => {
    return exercises
      .filter((e) => e.name.toLowerCase().includes(exerciseFilter.toLowerCase()) || e.muscle_group.toLowerCase().includes(exerciseFilter.toLowerCase()))
      .sort((a, b) => sortExercisesAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
  }, [exercises, exerciseFilter, sortExercisesAsc])

  const loadRoutines = async () => {
    setLoadingRoutines(true)
    const result = await getCachedOrFetch(
      'gymesis:routines:list',
      async () => routineService.getRoutines().then((response) => response.data.routines || []),
      { ttlMs: 30_000, version: 2 }
    )
    const items = result.data || []
    setRoutines(items)
    if (!selectedRoutineId && items.length > 0) {
      setSelectedRoutineId(items[0].id)
    }
    setLoadingRoutines(false)
    if (result.stale) {
      emitFeedback({ kind: 'warning', title: 'Rutinas desde caché', message: 'Se mostraron rutinas recientes sin volver a pedir todo al servidor.' })
    }
  }

  const loadInvitations = async () => {
    const result = await getCachedOrFetch(
      'gymesis:routines:invitations',
      async () => routineService.getInvitations().then((response) => response.data.invitations || []),
      { ttlMs: 20_000, version: 2 }
    )
    setInvitations(result.data || [])
    if (result.stale) {
      emitFeedback({ kind: 'warning', title: 'Invitaciones desde caché', message: 'Se recuperaron invitaciones recientes del almacenamiento local.' })
    }
  }

  const loadExercises = async (routineId: string) => {
    if (!routineId) return
    setLoadingExercises(true)
    const result = await getCachedOrFetch(
      `gymesis:routines:exercises:${routineId}`,
      async () => exerciseService.getByRoutine(routineId).then((response) => response.data.exercises || []),
      { ttlMs: 45_000, version: 2 }
    )
    setExercises(result.data || [])
    setLoadingExercises(false)
    if (result.stale) {
      emitFeedback({ kind: 'warning', title: 'Ejercicios recientes', message: 'Se cargó una copia local de ejercicios por conexión inestable.' })
    }
  }

  const loadLibrary = async (options?: { reset?: boolean }) => {
    const reset = options?.reset ?? false
    const targetOffset = reset ? 0 : libraryOffset
    setLoadingLibrary(true)
    try {
      const response = await exerciseService.getLibrary({
        q: libraryQuery,
        muscle: libraryMuscle || undefined,
        environment: libraryEnvironment || undefined,
        limit: 40,
        offset: targetOffset,
      })
      const items: ExerciseLibraryItem[] = response.data.exercises || []
      const paging = response.data.paging || { hasMore: false, offset: 0 }

      setLibraryItems((current) => (reset ? items : [...current, ...items]))
      setLibraryHasMore(Boolean(paging.hasMore))
      setLibraryOffset(targetOffset + items.length)
      if (reset) {
        setSelectedLibraryExerciseId(items[0]?.id || '')
      }
    } finally {
      setLoadingLibrary(false)
    }
  }

  const sendRoutineToTraining = (routineId: string, routineName?: string) => {
    setRoutineBridge(routineId, routineName)
    navigate(`/trainings?routine=${encodeURIComponent(routineId)}`)
    emitFeedback({ kind: 'success', title: 'Rutina enviada a entreno', message: 'La rutina quedó lista para registrar una sesión.' })
  }

  useEffect(() => {
    loadRoutines().catch(() => setError('No se pudieron cargar rutinas'))
    loadInvitations().catch(() => undefined)
  }, [])

  useEffect(() => {
    loadExercises(selectedRoutineId).catch(() => setExercises([]))
  }, [selectedRoutineId])

  useEffect(() => {
    if (inviteQuery.trim().length < 2) {
      setInviteResults([])
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.searchUsers(inviteQuery.trim())
        setInviteResults(response.data.users || [])
      } catch {
        setInviteResults([])
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [inviteQuery])

  useEffect(() => {
    if (!libraryOpen) return
    loadLibrary({ reset: true }).catch(() => {
      setLibraryItems([])
      setLibraryHasMore(false)
    })
  }, [libraryOpen, libraryQuery, libraryMuscle, libraryEnvironment])

  const createRoutine = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      clearCacheByPrefix('gymesis:routines:')
      await routineService.createRoutine(routineForm)
      setRoutineForm({ name: '', description: '' })
      await loadRoutines()
      setStatusMessage('Rutina creada correctamente.')
      emitFeedback({ kind: 'success', title: 'Rutina creada', message: 'La nueva rutina ya está disponible.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo crear rutina')
      emitFeedback({ kind: 'error', title: 'No se pudo crear la rutina', message: err.response?.data?.error || 'Revisa el formulario.' })
    }
  }

  const duplicateRoutine = async () => {
    if (!selectedRoutine) return
    if (selectedRoutine.name.toLowerCase().includes('(copia)')) {
      setStatusMessage('Ya estas en una copia; puedes editarla directamente.')
      return
    }
    try {
      clearCacheByPrefix('gymesis:routines:')
      const newRoutine = await routineService.createRoutine({
        name: `${selectedRoutine.name} (copia)`,
        description: selectedRoutine.description || '',
      })
      const newRoutineId = newRoutine.data.routine.id

      for (const ex of exercises) {
        await exerciseService.create({
          routineId: newRoutineId,
          name: ex.name,
          muscleGroup: ex.muscle_group,
          sets: ex.sets,
          reps: ex.reps,
          restSeconds: ex.rest_seconds,
        })
      }

      await loadRoutines()
      setSelectedRoutineId(newRoutineId)
      setStatusMessage('Rutina duplicada con sus ejercicios.')
      emitFeedback({ kind: 'success', title: 'Rutina duplicada', message: 'Se copió la rutina con sus ejercicios.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo duplicar la rutina')
      emitFeedback({ kind: 'error', title: 'No se pudo duplicar la rutina', message: err.response?.data?.error || 'Inténtalo de nuevo.' })
    }
  }

  const addExercise = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoutineId) return
    try {
      clearCacheByPrefix(`gymesis:routines:exercises:${selectedRoutineId}`)
      await exerciseService.create({ routineId: selectedRoutineId, ...exerciseForm })
      setExerciseForm({ name: '', muscleGroup: '', sets: 3, reps: 8, restSeconds: 90 })
      await loadExercises(selectedRoutineId)
      setStatusMessage('Ejercicio agregado a la rutina.')
      emitFeedback({ kind: 'success', title: 'Ejercicio agregado', message: 'El ejercicio se añadió correctamente a la rutina.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo agregar ejercicio')
      emitFeedback({ kind: 'error', title: 'No se pudo agregar el ejercicio', message: err.response?.data?.error || 'Revisa los campos.' })
    }
  }

  const addLibraryExerciseToRoutine = async (item: ExerciseLibraryItem) => {
    if (!selectedRoutineId) {
      setError('Selecciona una rutina antes de agregar ejercicios de biblioteca')
      return
    }

    try {
      clearCacheByPrefix(`gymesis:routines:exercises:${selectedRoutineId}`)
      await exerciseService.create({
        routineId: selectedRoutineId,
        name: item.name,
        muscleGroup: item.primary_muscle || item.muscle_group,
        sets: item.default_sets || 3,
        reps: item.default_reps || 8,
        restSeconds: item.default_rest_seconds || 90,
        notes: [item.training_environment, item.equipment, item.difficulty_level].filter(Boolean).join(' | '),
      })
      await loadExercises(selectedRoutineId)
      setStatusMessage(`Ejercicio agregado desde biblioteca: ${item.name}`)
      emitFeedback({ kind: 'success', title: 'Ejercicio agregado', message: 'Se anadio un ejercicio desde la biblioteca global.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo agregar ejercicio desde biblioteca')
    }
  }

  const selectedLibraryExercise = useMemo(
    () => libraryItems.find((item) => item.id === selectedLibraryExerciseId) || null,
    [libraryItems, selectedLibraryExerciseId]
  )

  const startEditExercise = (exercise: Exercise) => {
    setEditingExerciseId(exercise.id)
    setEditForm({
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      sets: exercise.sets,
      reps: exercise.reps,
      restSeconds: exercise.rest_seconds,
    })
  }

  const saveEditExercise = async () => {
    if (!editingExerciseId) return
    try {
      clearCacheByPrefix(`gymesis:routines:exercises:${selectedRoutineId}`)
      await exerciseService.update(editingExerciseId, editForm)
      setEditingExerciseId('')
      await loadExercises(selectedRoutineId)
      setStatusMessage('Ejercicio actualizado.')
      emitFeedback({ kind: 'success', title: 'Ejercicio actualizado', message: 'Los cambios se guardaron correctamente.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo actualizar ejercicio')
      emitFeedback({ kind: 'error', title: 'No se pudo actualizar el ejercicio', message: err.response?.data?.error || 'Verifica los datos.' })
    }
  }

  const deleteRoutine = async (id: string) => {
    clearCacheByPrefix('gymesis:routines:')
    await routineService.deleteRoutine(id)
    await loadRoutines()
    if (selectedRoutineId === id) {
      setSelectedRoutineId('')
      setExercises([])
    }
    setStatusMessage('Rutina eliminada.')
    emitFeedback({ kind: 'warning', title: 'Rutina eliminada', message: 'La rutina ya no está disponible.' })
  }

  const deleteExercise = async (id: string) => {
    if (!selectedRoutineId) return
    clearCacheByPrefix(`gymesis:routines:exercises:${selectedRoutineId}`)
    await exerciseService.remove(id)
    await loadExercises(selectedRoutineId)
    setStatusMessage('Ejercicio eliminado.')
    emitFeedback({ kind: 'warning', title: 'Ejercicio eliminado', message: 'El ejercicio fue retirado de la rutina.' })
  }

  const answerInvitation = async (invitationId: string, action: 'accepted' | 'rejected') => {
    clearCacheByPrefix('gymesis:routines:')
    await routineService.answerInvitation(invitationId, { action })
    await loadInvitations()
    await loadRoutines()
    setStatusMessage(action === 'accepted' ? 'Invitacion aceptada.' : 'Invitacion rechazada.')
    emitFeedback({
      kind: action === 'accepted' ? 'success' : 'info',
      title: action === 'accepted' ? 'Invitación aceptada' : 'Invitación rechazada',
      message: action === 'accepted' ? 'Ahora puedes trabajar con la rutina compartida.' : 'La invitación fue descartada.',
    })
  }

  const sendInvite = async () => {
    if (!selectedRoutineId || !inviteUserId.trim()) return
    try {
      clearCacheByPrefix('gymesis:routines:')
      await routineService.inviteToRoutine(selectedRoutineId, { toUserId: inviteUserId.trim() })
      setInviteQuery('')
      setInviteUserId('')
      setInviteResults([])
      setStatusMessage('Invitacion enviada.')
      emitFeedback({ kind: 'success', title: 'Invitación enviada', message: 'Se avisó al usuario seleccionado.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo enviar invitacion')
      emitFeedback({ kind: 'error', title: 'No se pudo enviar la invitación', message: err.response?.data?.error || 'Revisa el usuario destino.' })
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Dumbbell className="title-icon" />}
          title="Rutinas"
          subtitle="Diseña, duplica y comparte planes sin fricción."
          actions={
            <>
              <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => loadRoutines()}><RefreshCw size={14} />Actualizar</button>
            </>
          }
        />

        {error && <div role="alert" className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}
        <div className="sr-only" aria-live="polite">{statusMessage}</div>

        <section className="panel p-4 mb-4 stack-gap">
          <div className="flex flex-wrap gap-2">
            <span className="tiny-badge">Rutinas: {routines.length}</span>
            <span className="tiny-badge">Ejercicios: {exercises.length}</span>
            <span className="tiny-badge">Invitaciones: {invitations.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft text-sm" onClick={() => { setRoutineFilter(''); setInvitationFilter('all') }}>Limpiar filtros</button>
            {selectedRoutine && (
              <>
                <button className="btn-primary text-sm inline-flex items-center gap-1" onClick={() => sendRoutineToTraining(selectedRoutine.id, selectedRoutine.name)}>
                  <Dumbbell size={14} />Entrenar rutina
                </button>
                <button className="btn-soft text-sm" onClick={() => setRoutineBridge(selectedRoutine.id, selectedRoutine.name)}>Marcar como activa</button>
              </>
            )}
          </div>
          {selectedRoutine && (
            <div className="text-sm soft-text">
              Activa: <strong className="text-slate-900 dark:text-slate-100">{selectedRoutine.name}</strong> · {selectedRoutineExercises} ejercicios
            </div>
          )}
        </section>

        {!isLargeScreen && (
          <div className="mobile-tabs mb-4">
            <button className={`mobile-tab ${mobileView === 'builder' ? 'active' : ''}`} onClick={() => setMobileView('builder')}>Rutinas</button>
            <button className={`mobile-tab ${mobileView === 'exercises' ? 'active' : ''}`} onClick={() => setMobileView('exercises')}>Ejercicios</button>
            <button className={`mobile-tab ${mobileView === 'challenges' ? 'active' : ''}`} onClick={() => setMobileView('challenges')}>Retos</button>
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {(isLargeScreen || mobileView === 'builder') && (
          <aside className="panel p-5 space-y-4">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><PlusCircle size={20} />Nueva rutina</h2>
            <form onSubmit={createRoutine} className="space-y-3" aria-label="Formulario crear rutina">
              <label className="field-label" htmlFor="routineName">Nombre de rutina</label>
              <input
                id="routineName"
                className="field"
                placeholder="Upper strength, Push day..."
                value={routineForm.name}
                onChange={(e) => setRoutineForm((s) => ({ ...s, name: e.target.value }))}
                required
              />
              <label className="field-label" htmlFor="routineDesc">Descripcion</label>
              <textarea
                id="routineDesc"
                className="field"
                placeholder="Objetivo y enfoque de esta rutina"
                value={routineForm.description}
                onChange={(e) => setRoutineForm((s) => ({ ...s, description: e.target.value }))}
              />
              <button className="btn-primary inline-flex items-center gap-1"><PlusCircle size={14} />Crear rutina</button>
            </form>

            <h3 className="text-xl font-semibold pt-2 text-slate-900 dark:text-slate-100">Rutinas guardadas</h3>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className="field !pl-7" value={routineFilter} onChange={(e) => setRoutineFilter(e.target.value)} placeholder="Filtrar rutinas" />
            </div>
            {loadingRoutines && <div className="soft-text inline-flex items-center gap-2"><span className="loader" />Cargando rutinas...</div>}
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {filteredRoutines.map((r) => (
                <article key={r.id} className={`rounded-lg p-3 border ${selectedRoutineId === r.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-400/30 dark:border-slate-700'}`}>
                  <button className="text-left w-full" onClick={() => setSelectedRoutineId(r.id)} aria-label={`Seleccionar rutina ${r.name}`}>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</div>
                    <div className="text-xs soft-text">Owner: {r.owner_username || 'tu'}</div>
                  </button>
                  <div className="mt-2 flex gap-2">
                      <button
                      onClick={() => deleteRoutine(r.id)}
                      className="text-xs bg-red-600 text-white px-2 py-1 rounded inline-flex items-center gap-1"
                      aria-label={`Eliminar rutina ${r.name}`}
                    >
                      <Trash2 size={12} />Eliminar
                    </button>
                      <button
                        onClick={() => sendRoutineToTraining(r.id, r.name)}
                        className="text-xs btn-primary inline-flex items-center gap-1"
                        type="button"
                        aria-label={`Enviar rutina ${r.name} a entrenamiento`}
                      >
                        <Dumbbell size={12} />Entrenar
                      </button>
                    {selectedRoutineId === r.id && (
                      <button onClick={duplicateRoutine} className="text-xs btn-soft inline-flex items-center gap-1" type="button">
                        <CopyPlus size={12} />Duplicar
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {filteredRoutines.length === 0 && <div className="soft-text">No hay rutinas para ese filtro.</div>}
            </div>
          </aside>
          )}

          {(isLargeScreen || mobileView === 'exercises') && (
          <section className="panel p-5 lg:col-span-2">
            <h2 className="text-2xl font-semibold mb-1 text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Dumbbell size={20} />Ejercicios</h2>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="soft-text">Anade, edita y ajusta descansos.</p>
              <button type="button" className="btn-soft text-sm" onClick={() => setLibraryOpen(true)}>Biblioteca global</button>
            </div>

            {selectedRoutineId ? (
              <>
                {loadingExercises && <div className="soft-text mb-2 inline-flex items-center gap-2"><span className="loader" />Cargando ejercicios...</div>}
                <form onSubmit={addExercise} className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4" aria-label="Formulario agregar ejercicio">
                  <div className="md:col-span-2">
                    <label className="field-label">Ejercicio</label>
                    <input
                      className="field"
                      placeholder="Press banca"
                      value={exerciseForm.name}
                      onChange={(e) => setExerciseForm((s) => ({ ...s, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Musculo</label>
                    <input
                      list="muscle-options"
                      className="field"
                      placeholder="Pecho"
                      value={exerciseForm.muscleGroup}
                      onChange={(e) => setExerciseForm((s) => ({ ...s, muscleGroup: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="field-label">Sets</label>
                    <input
                      type="number"
                      min={1}
                      className="field"
                      value={exerciseForm.sets}
                      onChange={(e) => setExerciseForm((s) => ({ ...s, sets: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Reps</label>
                    <input
                      type="number"
                      min={1}
                      className="field"
                      value={exerciseForm.reps}
                      onChange={(e) => setExerciseForm((s) => ({ ...s, reps: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Descanso (seg)</label>
                    <input
                      type="number"
                      min={10}
                      step={5}
                      className="field"
                      value={exerciseForm.restSeconds}
                      onChange={(e) => setExerciseForm((s) => ({ ...s, restSeconds: Number(e.target.value) }))}
                    />
                  </div>
                  <button className="btn-primary md:col-span-6">Agregar ejercicio</button>
                </form>

                <datalist id="muscle-options">
                  {muscleOptions.map((m) => <option key={m} value={m} />)}
                </datalist>

                <div className="flex gap-2 flex-wrap mb-4" aria-label="Atajos de descanso">
                  {[30, 45, 60, 90, 120, 180].map((value) => (
                    <button
                      key={value}
                      onClick={() => setExerciseForm((s) => ({ ...s, restSeconds: value }))}
                      className={`px-3 py-1 text-sm rounded-full border ${exerciseForm.restSeconds === value ? 'bg-cyan-500/25 border-cyan-300' : 'border-slate-400/40 dark:border-slate-600/70'}`}
                      type="button"
                    >
                      {value}s
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mb-3">
                  <input className="field" value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)} placeholder="Filtrar ejercicios" />
                  <button type="button" className="btn-soft" onClick={() => setSortExercisesAsc((v) => !v)}>{sortExercisesAsc ? 'A-Z' : 'Z-A'}</button>
                  <button type="button" className="btn-soft" onClick={() => setLibraryOpen(true)}>Agregar desde biblioteca</button>
                </div>

                <div className="space-y-2" aria-label="Lista de ejercicios">
                  {shownExercises.map((e) => (
                    <article key={e.id} className="border border-slate-400/30 dark:border-slate-700 rounded-lg p-3 bg-white/40 dark:bg-slate-900/35">
                      {editingExerciseId === e.id ? (
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                          <div className="md:col-span-2">
                            <label className="field-label">Ejercicio</label>
                            <input className="field" value={editForm.name} onChange={(ev) => setEditForm((s) => ({ ...s, name: ev.target.value }))} />
                          </div>
                          <div>
                            <label className="field-label">Musculo</label>
                            <input className="field" value={editForm.muscleGroup} onChange={(ev) => setEditForm((s) => ({ ...s, muscleGroup: ev.target.value }))} />
                          </div>
                          <div>
                            <label className="field-label">Sets</label>
                            <input type="number" min={1} className="field" value={editForm.sets} onChange={(ev) => setEditForm((s) => ({ ...s, sets: Number(ev.target.value) }))} />
                          </div>
                          <div>
                            <label className="field-label">Reps</label>
                            <input type="number" min={1} className="field" value={editForm.reps} onChange={(ev) => setEditForm((s) => ({ ...s, reps: Number(ev.target.value) }))} />
                          </div>
                          <div>
                            <label className="field-label">Descanso</label>
                            <input type="number" min={10} className="field" value={editForm.restSeconds} onChange={(ev) => setEditForm((s) => ({ ...s, restSeconds: Number(ev.target.value) }))} />
                          </div>
                          <div className="md:col-span-6 flex gap-2">
                            <button className="btn-primary inline-flex items-center gap-1" type="button" onClick={saveEditExercise}><Check size={14} />Guardar cambios</button>
                            <button className="btn-soft" type="button" onClick={() => setEditingExerciseId('')}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{e.name}</div>
                            <div className="text-sm soft-text">
                              {e.muscle_group} | {e.sets} x {e.reps} | descanso {e.rest_seconds}s
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => startEditExercise(e)} className="btn-soft text-sm inline-flex items-center gap-1" aria-label={`Editar ejercicio ${e.name}`}>
                              <Pencil size={13} />Editar
                            </button>
                            <button onClick={() => deleteExercise(e.id)} className="bg-red-600 text-white px-3 py-1 rounded text-sm inline-flex items-center gap-1" aria-label={`Eliminar ejercicio ${e.name}`}>
                              <Trash2 size={13} />Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  {shownExercises.length === 0 && <p className="soft-text">No hay ejercicios para este filtro.</p>}
                </div>
              </>
            ) : (
              <div className="soft-text">Selecciona una rutina para ver y cargar ejercicios.</div>
            )}
          </section>
          )}
        </section>

        {(isLargeScreen || mobileView === 'challenges') && (
        <section className="mt-6 panel p-5">
          <h2 className="text-2xl font-semibold mb-3 text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Swords size={20} />Retos con amigos</h2>
          <p className="soft-text mb-3">Busca por username y selecciona a quien invitar sin copiar UUID manualmente.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="inline-flex items-center gap-1 soft-text"><Filter size={14} />Invitaciones:</div>
            <button type="button" className={`btn-soft text-sm ${invitationFilter === 'all' ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setInvitationFilter('all')}>Todas</button>
            <button type="button" className={`btn-soft text-sm ${invitationFilter === 'pending' ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => setInvitationFilter('pending')}>Pendientes</button>
          </div>

          <div className="space-y-2 mb-4">
            <label className="field-label inline-flex items-center gap-1"><UserSearch size={13} />Buscar atleta</label>
            <input
              className="field"
              value={inviteQuery}
              onChange={(e) => setInviteQuery(e.target.value)}
              placeholder="Escribe username del amigo"
            />
            {inviteResults.length > 0 && (
              <div className="border border-slate-400/30 dark:border-slate-700 rounded-lg max-h-48 overflow-auto">
                {inviteResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`w-full text-left px-3 py-2 hover:bg-sky-500/10 ${inviteUserId === u.id ? 'bg-sky-500/20' : ''}`}
                    onClick={() => {
                      setInviteUserId(u.id)
                      setInviteQuery(u.username)
                    }}
                  >
                    <div className="text-slate-900 dark:text-slate-100 font-semibold">{u.username}</div>
                    <div className="text-xs soft-text">{u.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {inviteUserId && (
            <div className="status-success mb-3 inline-flex items-center gap-2">
              <Check size={14} />Atleta seleccionado para invitar
            </div>
          )}

          <button onClick={sendInvite} className="btn-primary" disabled={!inviteUserId || !selectedRoutineId}>Enviar invitacion</button>

          <h3 className="text-xl font-semibold mb-3 mt-6 text-slate-900 dark:text-slate-100">Invitaciones a retos</h3>
          <div className="space-y-2">
            {shownInvitations.map((inv) => (
              <article key={inv.id} className="border border-slate-400/30 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between bg-white/40 dark:bg-slate-900/35">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{inv.routine_name}</div>
                  <div className="text-sm soft-text">Invitado por {inv.from_username}</div>
                  <div className="mt-1">
                    <span className={`tiny-badge ${inv.status === 'pending' ? '' : 'opacity-80'}`}>Estado: {inv.status}</span>
                  </div>
                </div>
                {inv.status === 'pending' && (
                  <div className="flex gap-2">
                    <button className="bg-emerald-600 text-white px-3 py-1 rounded" onClick={() => answerInvitation(inv.id, 'accepted')}>
                      Aceptar
                    </button>
                    <button className="btn-soft px-3 py-1" onClick={() => answerInvitation(inv.id, 'rejected')}>
                      Rechazar
                    </button>
                  </div>
                )}
              </article>
            ))}
            {shownInvitations.length === 0 && <div className="soft-text">No hay invitaciones en este filtro.</div>}
          </div>
        </section>
        )}

        {libraryOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-end" onClick={() => setLibraryOpen(false)}>
            <div className="h-full w-full max-w-4xl bg-slate-50 dark:bg-slate-950 border-l border-slate-300/40 dark:border-slate-700 p-4 overflow-auto" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Biblioteca global de ejercicios</h2>
                  <div className="soft-text text-sm">Usa la misma base de ejercicios que en entreno.</div>
                </div>
                <button type="button" className="btn-soft" onClick={() => setLibraryOpen(false)}>Cerrar</button>
              </div>

              <div className="panel p-4 mb-4 stack-gap">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input className="field" value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} placeholder="Buscar ejercicio" />
                  <input className="field" value={libraryMuscle} onChange={(e) => setLibraryMuscle(e.target.value)} placeholder="Musculo principal" />
                  <select className="field" value={libraryEnvironment} onChange={(e) => setLibraryEnvironment(e.target.value)}>
                    <option value="">Todos los entornos</option>
                    <option value="gym">Gym</option>
                    <option value="home">Casa</option>
                    <option value="calisthenics">Calistenia</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-soft" onClick={() => loadLibrary({ reset: true })}>Buscar</button>
                  <button type="button" className="btn-soft" onClick={() => { setLibraryQuery(''); setLibraryMuscle(''); setLibraryEnvironment('') }}>Limpiar</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="space-y-2 max-h-[62vh] overflow-auto pr-1">
                  {libraryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`w-full text-left border rounded p-3 clickable-row ${selectedLibraryExerciseId === item.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-400/30 dark:border-slate-700'}`}
                      onClick={() => setSelectedLibraryExerciseId(item.id)}
                    >
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</div>
                      <div className="text-xs soft-text">{item.primary_muscle || item.muscle_group} · {item.training_environment || 'gym'} · {item.equipment || 'n/a'}</div>
                    </button>
                  ))}
                  {loadingLibrary && <div className="soft-text inline-flex items-center gap-2"><span className="loader" />Cargando biblioteca...</div>}
                  {!loadingLibrary && libraryItems.length === 0 && <div className="empty-state">No hay ejercicios para ese filtro.</div>}
                  {libraryHasMore && !loadingLibrary && (
                    <button type="button" className="btn-soft w-full" onClick={() => loadLibrary({ reset: false })}>Cargar mas</button>
                  )}
                </div>

                <div className="panel p-4 stack-gap">
                  {selectedLibraryExercise ? (
                    <>
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedLibraryExercise.name}</h3>
                        <div className="text-sm soft-text">Principal: {selectedLibraryExercise.primary_muscle || selectedLibraryExercise.muscle_group}</div>
                        <div className="text-sm soft-text">Secundarios: {selectedLibraryExercise.secondary_muscles || 'N/A'}</div>
                        <div className="text-sm soft-text">Entorno: {selectedLibraryExercise.training_environment || 'gym'} · Equipo: {selectedLibraryExercise.equipment || 'n/a'}</div>
                        <div className="text-sm soft-text">Dificultad: {selectedLibraryExercise.difficulty_level || 'intermediate'}</div>
                      </div>
                      <div className="status-info">Plantilla: {selectedLibraryExercise.default_sets} x {selectedLibraryExercise.default_reps} · descanso {selectedLibraryExercise.default_rest_seconds}s</div>
                      <button type="button" className="btn-primary" onClick={() => addLibraryExerciseToRoutine(selectedLibraryExercise)}>Agregar a rutina</button>
                    </>
                  ) : (
                    <div className="empty-state">Selecciona un ejercicio de la lista.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
