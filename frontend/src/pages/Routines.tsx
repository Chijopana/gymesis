import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  CopyPlus,
  Dumbbell,
  Globe,
  Library,
  Lock,
  Pencil,
  PlusCircle,
  RefreshCw,
  Search,
  Swords,
  Trash2,
  UserSearch,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { SkeletonList } from '../components/Skeleton'
import { useConfirm } from '../components/ConfirmDialog'
import { useIsLargeScreen } from '../hooks/useResponsive'
import { exerciseService, getErrorMessage, routineService, userService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'
import { setRoutineBridge } from '../utils/routineBridge'

type Routine = {
  id: string
  name: string
  description?: string
  owner_username?: string
  is_owner?: boolean
  is_public?: boolean
  exercises_count?: number
  difficulty_level?: string | null
  duration_weeks?: number | null
}

type Exercise = {
  id: string
  name: string
  muscle_group: string
  sets: number
  reps: number
  rest_seconds: number
  notes?: string | null
}

type LibraryItem = {
  id: string
  name: string
  muscle_group: string
  primary_muscle?: string | null
  secondary_muscles?: string | null
  equipment?: string | null
  training_environment?: string | null
  difficulty_level?: string | null
  image_url?: string | null
  default_sets: number
  default_reps: number
  default_rest_seconds: number
}

type Invitation = { id: string; routine_name: string; from_username: string; status: string }
type SearchUser = { id: string; username: string }

const MUSCLE_OPTIONS = [
  'Pecho', 'Espalda', 'Hombros', 'Biceps', 'Triceps', 'Cuadriceps',
  'Femoral', 'Gluteos', 'Pantorrilla', 'Core', 'Cardio', 'Full body',
]

const REST_SHORTCUTS = [30, 45, 60, 90, 120, 180]
const EMPTY_EXERCISE = { name: '', muscleGroup: '', sets: 3, reps: 8, restSeconds: 90 }

export default function Routines() {
  const navigate = useNavigate()
  const isLargeScreen = useIsLargeScreen()
  const { confirm, confirmDialog } = useConfirm()

  const [routines, setRoutines] = useState<Routine[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loadingRoutines, setLoadingRoutines] = useState(true)
  const [loadingExercises, setLoadingExercises] = useState(false)
  const [busy, setBusy] = useState('')
  const [routineFilter, setRoutineFilter] = useState('')
  const [exerciseFilter, setExerciseFilter] = useState('')
  const [error, setError] = useState('')

  const [routineForm, setRoutineForm] = useState({ name: '', description: '', isPublic: false })
  const [exerciseForm, setExerciseForm] = useState(EMPTY_EXERCISE)
  const [editingExerciseId, setEditingExerciseId] = useState('')
  const [editForm, setEditForm] = useState(EMPTY_EXERCISE)

  const [inviteQuery, setInviteQuery] = useState('')
  const [inviteResults, setInviteResults] = useState<SearchUser[]>([])
  const [inviteUserId, setInviteUserId] = useState('')
  const [mobileView, setMobileView] = useState<'builder' | 'exercises' | 'challenges'>('builder')

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryMuscle, setLibraryMuscle] = useState('')
  const [libraryEnvironment, setLibraryEnvironment] = useState('')
  const [libraryOffset, setLibraryOffset] = useState(0)
  const [libraryHasMore, setLibraryHasMore] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === selectedRoutineId) ?? null,
    [routines, selectedRoutineId]
  )
  const canEditSelected = selectedRoutine?.is_owner !== false

  const loadRoutines = useCallback(
    async (forceFresh = false) => {
      // try/finally: antes, si la petición fallaba, el spinner se quedaba girando
      // para siempre porque nunca se apagaba el estado de carga.
      try {
        setLoadingRoutines(true)
        setError('')
        if (forceFresh) clearCacheByPrefix('gymesis:routines:list')

        const result = await getCachedOrFetch(
          'gymesis:routines:list',
          () => routineService.getRoutines().then((response) => response.data.routines || []),
          { ttlMs: 30_000, version: 3 }
        )

        const items: Routine[] = result.data || []
        setRoutines(items)
        setSelectedRoutineId((current) => (current && items.some((r) => r.id === current) ? current : items[0]?.id || ''))
      } catch (err) {
        setError(getErrorMessage(err, 'No se han podido cargar las rutinas.'))
      } finally {
        setLoadingRoutines(false)
      }
    },
    []
  )

  const loadInvitations = useCallback(async () => {
    try {
      const response = await routineService.getInvitations()
      setInvitations(response.data.invitations || [])
    } catch {
      // Las invitaciones son secundarias: un fallo aquí no debe bloquear la página.
    }
  }, [])

  const loadExercises = useCallback(async (routineId: string) => {
    if (!routineId) {
      setExercises([])
      return
    }
    try {
      setLoadingExercises(true)
      const response = await exerciseService.getByRoutine(routineId)
      setExercises(response.data.exercises || [])
    } catch (err) {
      setExercises([])
      setError(getErrorMessage(err, 'No se han podido cargar los ejercicios.'))
    } finally {
      setLoadingExercises(false)
    }
  }, [])

  const loadLibrary = useCallback(
    async (reset: boolean) => {
      try {
        setLoadingLibrary(true)
        const offset = reset ? 0 : libraryOffset
        const response = await exerciseService.getLibrary({
          q: libraryQuery,
          muscle: libraryMuscle || undefined,
          environment: libraryEnvironment || undefined,
          limit: 40,
          offset,
        })
        const items: LibraryItem[] = response.data.exercises || []
        setLibraryItems((current) => (reset ? items : [...current, ...items]))
        setLibraryHasMore(Boolean(response.data.paging?.hasMore))
        setLibraryOffset(offset + items.length)
      } catch (err) {
        emitFeedback({ kind: 'error', title: 'Biblioteca no disponible', message: getErrorMessage(err) })
      } finally {
        setLoadingLibrary(false)
      }
    },
    [libraryEnvironment, libraryMuscle, libraryOffset, libraryQuery]
  )

  useEffect(() => {
    loadRoutines()
    loadInvitations()
  }, [loadRoutines, loadInvitations])

  useEffect(() => {
    loadExercises(selectedRoutineId)
  }, [selectedRoutineId, loadExercises])

  useEffect(() => {
    const query = inviteQuery.trim()
    if (query.length < 2) {
      setInviteResults([])
      return
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.searchUsers(query)
        setInviteResults(response.data.users || [])
      } catch {
        setInviteResults([])
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [inviteQuery])

  useEffect(() => {
    if (!libraryOpen) return
    const timer = window.setTimeout(() => loadLibrary(true), 250)
    return () => window.clearTimeout(timer)
    // loadLibrary cambia con cada filtro; sólo queremos reaccionar a los filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryOpen, libraryQuery, libraryMuscle, libraryEnvironment])

  const invalidate = () => {
    clearCacheByPrefix('gymesis:routines:')
    clearCacheByPrefix('gymesis:dashboard:')
  }

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    try {
      setBusy(key)
      setError('')
      await action()
      invalidate()
      emitFeedback({ kind: 'success', title: success })
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      emitFeedback({ kind: 'error', title: 'No ha sido posible', message })
      throw err
    } finally {
      setBusy('')
    }
  }

  const createRoutine = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await runAction('create', () => routineService.createRoutine(routineForm), 'Rutina creada')
      setRoutineForm({ name: '', description: '', isPublic: false })
      await loadRoutines(true)
    } catch {
      /* ya notificado */
    }
  }

  /** Usa el endpoint de clonado del servidor: una petición, todo o nada. */
  const duplicateRoutine = async () => {
    if (!selectedRoutine) return
    try {
      const response = await routineService.cloneRoutine(selectedRoutine.id)
      invalidate()
      const newId = response.data?.routine?.id
      await loadRoutines(true)
      if (newId) setSelectedRoutineId(newId)
      emitFeedback({
        kind: 'success',
        title: 'Rutina duplicada',
        message: `Se han copiado ${response.data?.copiedExercises ?? 0} ejercicios.`,
      })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido duplicar', message: getErrorMessage(err) })
    }
  }

  const addExercise = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedRoutineId) return
    try {
      await runAction(
        'add-exercise',
        () => exerciseService.create({ routineId: selectedRoutineId, ...exerciseForm }),
        'Ejercicio añadido'
      )
      setExerciseForm(EMPTY_EXERCISE)
      await loadExercises(selectedRoutineId)
    } catch {
      /* ya notificado */
    }
  }

  const addFromLibrary = async (item: LibraryItem) => {
    if (!selectedRoutineId) {
      emitFeedback({ kind: 'warning', title: 'Elige una rutina primero' })
      return
    }
    try {
      await runAction(
        `lib:${item.id}`,
        () =>
          exerciseService.create({
            routineId: selectedRoutineId,
            name: item.name,
            muscleGroup: item.primary_muscle || item.muscle_group,
            sets: item.default_sets,
            reps: item.default_reps,
            restSeconds: item.default_rest_seconds,
            notes: [item.training_environment, item.equipment, item.difficulty_level].filter(Boolean).join(' · '),
          }),
        `Añadido: ${item.name}`
      )
      await loadExercises(selectedRoutineId)
    } catch {
      /* ya notificado */
    }
  }

  const startEdit = (exercise: Exercise) => {
    setEditingExerciseId(exercise.id)
    setEditForm({
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      sets: exercise.sets,
      reps: exercise.reps,
      restSeconds: exercise.rest_seconds,
    })
  }

  const saveEdit = async () => {
    if (!editingExerciseId) return
    try {
      await runAction('edit', () => exerciseService.update(editingExerciseId, editForm), 'Ejercicio actualizado')
      setEditingExerciseId('')
      await loadExercises(selectedRoutineId)
    } catch {
      /* ya notificado */
    }
  }

  const deleteRoutine = async (routine: Routine) => {
    const isOwner = routine.is_owner !== false
    const ok = await confirm({
      title: isOwner ? `Eliminar "${routine.name}"` : `Salir de "${routine.name}"`,
      message: isOwner
        ? 'Se borrarán la rutina, sus ejercicios y el historial asociado. Esta acción no se puede deshacer.'
        : 'Dejarás de participar en esta rutina compartida. La rutina seguirá existiendo para su propietario.',
      confirmLabel: isOwner ? 'Eliminar rutina' : 'Salir',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await runAction(routine.id, () => routineService.deleteRoutine(routine.id), isOwner ? 'Rutina eliminada' : 'Has salido de la rutina')
      if (selectedRoutineId === routine.id) setSelectedRoutineId('')
      await loadRoutines(true)
    } catch {
      /* ya notificado */
    }
  }

  const deleteExercise = async (exercise: Exercise) => {
    const ok = await confirm({
      title: `Eliminar "${exercise.name}"`,
      message: 'Se quitará este ejercicio de la rutina.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
    })
    if (!ok) return

    try {
      await runAction(exercise.id, () => exerciseService.remove(exercise.id), 'Ejercicio eliminado')
      await loadExercises(selectedRoutineId)
    } catch {
      /* ya notificado */
    }
  }

  const answerInvitation = async (invitationId: string, action: 'accepted' | 'rejected') => {
    try {
      await runAction(
        invitationId,
        () => routineService.answerInvitation(invitationId, { action }),
        action === 'accepted' ? 'Invitación aceptada' : 'Invitación rechazada'
      )
      await Promise.all([loadInvitations(), loadRoutines(true)])
    } catch {
      /* ya notificado */
    }
  }

  const sendInvite = async () => {
    if (!selectedRoutineId || !inviteUserId) return
    try {
      await runAction('invite', () => routineService.inviteToRoutine(selectedRoutineId, { toUserId: inviteUserId }), 'Invitación enviada')
      setInviteQuery('')
      setInviteUserId('')
      setInviteResults([])
    } catch {
      /* ya notificado */
    }
  }

  const startTraining = (routine: Routine) => {
    setRoutineBridge(routine.id, routine.name)
    navigate(`/trainings?routine=${encodeURIComponent(routine.id)}`)
  }

  const filteredRoutines = useMemo(() => {
    const query = routineFilter.trim().toLowerCase()
    if (!query) return routines
    return routines.filter(
      (routine) =>
        routine.name.toLowerCase().includes(query) || (routine.description || '').toLowerCase().includes(query)
    )
  }, [routines, routineFilter])

  const shownExercises = useMemo(() => {
    const query = exerciseFilter.trim().toLowerCase()
    if (!query) return exercises
    return exercises.filter(
      (exercise) =>
        exercise.name.toLowerCase().includes(query) || exercise.muscle_group.toLowerCase().includes(query)
    )
  }, [exercises, exerciseFilter])

  const pendingInvitations = invitations.filter((invitation) => invitation.status === 'pending')

  return (
    <>
      <Navbar />
      {confirmDialog}
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Dumbbell className="title-icon" />}
          title="Rutinas"
          subtitle="Diseña tus planes, compártelos y llévalos directo al entrenamiento."
          actions={
            <>
              <button className="btn-soft btn-sm" onClick={() => loadRoutines(true)} disabled={loadingRoutines}>
                <RefreshCw size={14} className={loadingRoutines ? 'animate-spin' : ''} />
                Actualizar
              </button>
              {selectedRoutine && (
                <button className="btn-primary btn-sm" onClick={() => startTraining(selectedRoutine)}>
                  <Dumbbell size={14} />
                  Entrenar esta rutina
                </button>
              )}
            </>
          }
          meta={
            <>
              <span className="tiny-badge">Rutinas: {routines.length}</span>
              {selectedRoutine && (
                <span className="tiny-badge">
                  {selectedRoutine.name} · {exercises.length} ejercicios
                </span>
              )}
              {pendingInvitations.length > 0 && (
                <span className="tiny-badge tiny-badge-warning">Invitaciones: {pendingInvitations.length}</span>
              )}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        {!isLargeScreen && (
          <div className="mobile-tabs mb-4">
            {(
              [
                ['builder', 'Rutinas'],
                ['exercises', 'Ejercicios'],
                ['challenges', 'Retos'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`mobile-tab ${mobileView === value ? 'active' : ''}`}
                onClick={() => setMobileView(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {(isLargeScreen || mobileView === 'builder') && (
            <aside className="space-y-4 lg:col-span-1">
              <section className="panel space-y-3 p-5">
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <PlusCircle size={19} />
                  Nueva rutina
                </h2>
                <form onSubmit={createRoutine} className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="routineName">
                      Nombre
                    </label>
                    <input
                      id="routineName"
                      className="field"
                      placeholder="Push day, Full body A..."
                      value={routineForm.name}
                      onChange={(event) => setRoutineForm((state) => ({ ...state, name: event.target.value }))}
                      required
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="routineDesc">
                      Descripción
                    </label>
                    <textarea
                      id="routineDesc"
                      className="field"
                      placeholder="Objetivo y enfoque de esta rutina"
                      value={routineForm.description}
                      onChange={(event) => setRoutineForm((state) => ({ ...state, description: event.target.value }))}
                    />
                  </div>
                  <label className="soft-text flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={routineForm.isPublic}
                      onChange={(event) => setRoutineForm((state) => ({ ...state, isPublic: event.target.checked }))}
                    />
                    Pública: otros podrán verla y copiarla desde tu perfil
                  </label>
                  <button className="btn-primary w-full" disabled={busy === 'create'}>
                    <PlusCircle size={15} />
                    Crear rutina
                  </button>
                </form>
              </section>

              <section className="panel space-y-3 p-5">
                <h3 className="text-lg font-semibold">Tus rutinas</h3>
                <div className="relative">
                  <Search size={14} className="faint-text absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    className="field pl-8"
                    value={routineFilter}
                    onChange={(event) => setRoutineFilter(event.target.value)}
                    placeholder="Filtrar rutinas"
                    aria-label="Filtrar rutinas"
                  />
                </div>

                {loadingRoutines ? (
                  <SkeletonList count={3} />
                ) : filteredRoutines.length === 0 ? (
                  <div className="empty-state">
                    {routines.length === 0 ? 'Crea tu primera rutina arriba.' : 'Ninguna rutina coincide con el filtro.'}
                  </div>
                ) : (
                  <div className="max-h-[28rem] space-y-2 overflow-auto pr-1">
                    {filteredRoutines.map((routine) => (
                      <article
                        key={routine.id}
                        className={`list-row ${selectedRoutineId === routine.id ? 'is-selected' : ''}`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setSelectedRoutineId(routine.id)}
                          aria-pressed={selectedRoutineId === routine.id}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold">{routine.name}</span>
                            <span className="tiny-badge shrink-0">
                              {routine.is_public ? <Globe size={11} /> : <Lock size={11} />}
                              {routine.is_public ? 'Pública' : 'Privada'}
                            </span>
                          </div>
                          <div className="soft-text mt-0.5 text-xs">
                            {routine.exercises_count ?? 0} ejercicios
                            {routine.is_owner === false ? ` · de ${routine.owner_username}` : ''}
                          </div>
                        </button>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button className="btn-soft btn-xs" type="button" onClick={() => startTraining(routine)}>
                            <Dumbbell size={12} />
                            Entrenar
                          </button>
                          {selectedRoutineId === routine.id && (
                            <button className="btn-soft btn-xs" type="button" onClick={duplicateRoutine}>
                              <CopyPlus size={12} />
                              Duplicar
                            </button>
                          )}
                          <button
                            className="btn-danger btn-xs"
                            type="button"
                            onClick={() => deleteRoutine(routine)}
                            disabled={busy === routine.id}
                          >
                            <Trash2 size={12} />
                            {routine.is_owner === false ? 'Salir' : 'Eliminar'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          )}

          {(isLargeScreen || mobileView === 'exercises') && (
            <section className="panel p-5 lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                    <Dumbbell size={19} />
                    Ejercicios
                  </h2>
                  <p className="section-subtitle">
                    {selectedRoutine ? `Editando "${selectedRoutine.name}"` : 'Elige una rutina para editar sus ejercicios.'}
                  </p>
                </div>
                <button type="button" className="btn-soft btn-sm" onClick={() => setLibraryOpen(true)}>
                  <Library size={14} />
                  Biblioteca global
                </button>
              </div>

              {!selectedRoutineId ? (
                <div className="empty-state">Selecciona una rutina en el panel de la izquierda.</div>
              ) : !canEditSelected ? (
                <div className="status-info">
                  Esta rutina es de {selectedRoutine?.owner_username}. Puedes entrenarla, pero sólo su propietario puede
                  editarla. Duplícala para tener tu propia copia editable.
                </div>
              ) : (
                <>
                  <form onSubmit={addExercise} className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-6">
                    <div className="md:col-span-2">
                      <label className="field-label">Ejercicio</label>
                      <input
                        className="field"
                        placeholder="Press banca"
                        value={exerciseForm.name}
                        onChange={(event) => setExerciseForm((state) => ({ ...state, name: event.target.value }))}
                        required
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="field-label">Músculo</label>
                      <input
                        list="muscle-options"
                        className="field"
                        placeholder="Pecho"
                        value={exerciseForm.muscleGroup}
                        onChange={(event) => setExerciseForm((state) => ({ ...state, muscleGroup: event.target.value }))}
                        required
                        maxLength={50}
                      />
                    </div>
                    <div>
                      <label className="field-label">Series</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className="field"
                        value={exerciseForm.sets}
                        onChange={(event) => setExerciseForm((state) => ({ ...state, sets: Number(event.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Reps</label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        className="field"
                        value={exerciseForm.reps}
                        onChange={(event) => setExerciseForm((state) => ({ ...state, reps: Number(event.target.value) }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Descanso (s)</label>
                      <input
                        type="number"
                        min={0}
                        max={3600}
                        step={5}
                        className="field"
                        value={exerciseForm.restSeconds}
                        onChange={(event) =>
                          setExerciseForm((state) => ({ ...state, restSeconds: Number(event.target.value) }))
                        }
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5 md:col-span-6">
                      {REST_SHORTCUTS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`btn-soft btn-xs ${exerciseForm.restSeconds === value ? 'is-active' : ''}`}
                          onClick={() => setExerciseForm((state) => ({ ...state, restSeconds: value }))}
                        >
                          {value}s
                        </button>
                      ))}
                    </div>

                    <button className="btn-primary md:col-span-6" disabled={busy === 'add-exercise'}>
                      <PlusCircle size={15} />
                      Añadir ejercicio
                    </button>
                  </form>

                  <datalist id="muscle-options">
                    {MUSCLE_OPTIONS.map((muscle) => (
                      <option key={muscle} value={muscle} />
                    ))}
                  </datalist>

                  {exercises.length > 3 && (
                    <input
                      className="field mb-3"
                      value={exerciseFilter}
                      onChange={(event) => setExerciseFilter(event.target.value)}
                      placeholder="Filtrar ejercicios"
                      aria-label="Filtrar ejercicios"
                    />
                  )}

                  {loadingExercises ? (
                    <SkeletonList count={3} />
                  ) : shownExercises.length === 0 ? (
                    <div className="empty-state">
                      {exercises.length === 0
                        ? 'Esta rutina no tiene ejercicios. Añade uno arriba o usa la biblioteca.'
                        : 'Ningún ejercicio coincide con el filtro.'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shownExercises.map((exercise, index) => (
                        <article key={exercise.id} className="list-row">
                          {editingExerciseId === exercise.id ? (
                            <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-6">
                              <div className="md:col-span-2">
                                <label className="field-label">Ejercicio</label>
                                <input
                                  className="field"
                                  value={editForm.name}
                                  onChange={(event) => setEditForm((state) => ({ ...state, name: event.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="field-label">Músculo</label>
                                <input
                                  className="field"
                                  value={editForm.muscleGroup}
                                  onChange={(event) =>
                                    setEditForm((state) => ({ ...state, muscleGroup: event.target.value }))
                                  }
                                />
                              </div>
                              <div>
                                <label className="field-label">Series</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={50}
                                  className="field"
                                  value={editForm.sets}
                                  onChange={(event) => setEditForm((state) => ({ ...state, sets: Number(event.target.value) }))}
                                />
                              </div>
                              <div>
                                <label className="field-label">Reps</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  className="field"
                                  value={editForm.reps}
                                  onChange={(event) => setEditForm((state) => ({ ...state, reps: Number(event.target.value) }))}
                                />
                              </div>
                              <div>
                                <label className="field-label">Descanso</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={3600}
                                  className="field"
                                  value={editForm.restSeconds}
                                  onChange={(event) =>
                                    setEditForm((state) => ({ ...state, restSeconds: Number(event.target.value) }))
                                  }
                                />
                              </div>
                              <div className="flex gap-2 md:col-span-6">
                                <button className="btn-primary btn-sm" type="button" onClick={saveEdit} disabled={busy === 'edit'}>
                                  <Check size={14} />
                                  Guardar
                                </button>
                                <button className="btn-soft btn-sm" type="button" onClick={() => setEditingExerciseId('')}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold">
                                  <span className="faint-text mr-1.5 tabular-nums">{index + 1}.</span>
                                  {exercise.name}
                                </div>
                                <div className="soft-text text-sm">
                                  {exercise.muscle_group} · {exercise.sets} × {exercise.reps} · descanso{' '}
                                  {exercise.rest_seconds}s
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  onClick={() => startEdit(exercise)}
                                  className="btn-soft btn-sm"
                                  aria-label={`Editar ${exercise.name}`}
                                >
                                  <Pencil size={13} />
                                  Editar
                                </button>
                                <button
                                  onClick={() => deleteExercise(exercise)}
                                  className="btn-danger btn-sm"
                                  disabled={busy === exercise.id}
                                  aria-label={`Eliminar ${exercise.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {(isLargeScreen || mobileView === 'challenges') && (
          <section className="panel mt-6 space-y-4 p-5">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Swords size={19} />
                Retos con amigos
              </h2>
              <p className="section-subtitle">
                Invita a un amigo aceptado a seguir la rutina seleccionada y comparad progreso.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="field-label inline-flex items-center gap-1.5" htmlFor="inviteSearch">
                  <UserSearch size={13} />
                  Buscar atleta
                </label>
                <input
                  id="inviteSearch"
                  className="field"
                  value={inviteQuery}
                  onChange={(event) => {
                    setInviteQuery(event.target.value)
                    setInviteUserId('')
                  }}
                  placeholder="Escribe su nombre de usuario"
                />

                {inviteResults.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-md" style={{ border: '1px solid var(--line)' }}>
                    {inviteResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left clickable-row ${inviteUserId === user.id ? 'is-selected' : ''}`}
                        onClick={() => {
                          setInviteUserId(user.id)
                          setInviteQuery(user.username)
                          setInviteResults([])
                        }}
                      >
                        <span className="font-semibold">{user.username}</span>
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={sendInvite}
                  className="btn-primary"
                  disabled={!inviteUserId || !selectedRoutineId || busy === 'invite'}
                >
                  Enviar invitación
                </button>
                {!selectedRoutineId && <p className="soft-text text-xs">Selecciona antes una rutina.</p>}
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Invitaciones recibidas</h3>
                {invitations.length === 0 ? (
                  <div className="empty-state">No tienes invitaciones.</div>
                ) : (
                  invitations.map((invitation) => (
                    <article key={invitation.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{invitation.routine_name}</div>
                        <div className="soft-text text-sm">De {invitation.from_username}</div>
                      </div>
                      {invitation.status === 'pending' ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => answerInvitation(invitation.id, 'accepted')}
                            disabled={busy === invitation.id}
                          >
                            Aceptar
                          </button>
                          <button
                            className="btn-soft btn-sm"
                            onClick={() => answerInvitation(invitation.id, 'rejected')}
                            disabled={busy === invitation.id}
                          >
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="tiny-badge shrink-0">
                          {invitation.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                        </span>
                      )}
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        <Modal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          variant="drawer"
          title="Biblioteca global de ejercicios"
          description={
            selectedRoutine ? `Los ejercicios se añadirán a "${selectedRoutine.name}"` : 'Selecciona antes una rutina'
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                className="field"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Buscar ejercicio"
                aria-label="Buscar en la biblioteca"
              />
              <input
                className="field"
                value={libraryMuscle}
                onChange={(event) => setLibraryMuscle(event.target.value)}
                placeholder="Músculo principal"
                aria-label="Filtrar por músculo"
              />
              <select
                className="field"
                value={libraryEnvironment}
                onChange={(event) => setLibraryEnvironment(event.target.value)}
                aria-label="Filtrar por entorno"
              >
                <option value="">Todos los entornos</option>
                <option value="gym">Gimnasio</option>
                <option value="home">Casa</option>
                <option value="calisthenics">Calistenia</option>
              </select>
            </div>

            <div className="space-y-2">
              {libraryItems.map((item) => (
                <div key={item.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{item.name}</div>
                    <div className="soft-text text-xs">
                      {item.primary_muscle || item.muscle_group} · {item.training_environment || 'gym'} ·{' '}
                      {item.equipment || 'sin equipo'} · {item.default_sets}×{item.default_reps}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-sm shrink-0"
                    onClick={() => addFromLibrary(item)}
                    disabled={!selectedRoutineId || !canEditSelected || busy === `lib:${item.id}`}
                  >
                    Añadir
                  </button>
                </div>
              ))}

              {loadingLibrary && <SkeletonList count={4} />}

              {!loadingLibrary && libraryItems.length === 0 && (
                <div className="empty-state">Ningún ejercicio coincide con esos filtros.</div>
              )}

              {libraryHasMore && !loadingLibrary && (
                <button type="button" className="btn-soft w-full" onClick={() => loadLibrary(false)}>
                  Cargar más
                </button>
              )}
            </div>
          </div>
        </Modal>
      </main>
    </>
  )
}
