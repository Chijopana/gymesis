import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Download,
  Dumbbell,
  Library,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shield,
  TimerReset,
  Trash2,
  Trophy,
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import MiniBarChart from '../components/MiniBarChart'
import Modal from '../components/Modal'
import { SkeletonList } from '../components/Skeleton'
import { exerciseService, getErrorMessage, routineService, trainingService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { computeWorkoutAnalytics, type HistoryEntry } from '../utils/trainingAnalytics'
import { getTrainingSettings, saveTrainingSettings } from '../utils/settings'
import { emitFeedback } from '../utils/feedback'
import { clearRoutineBridge, getRoutineBridge, setRoutineBridge } from '../utils/routineBridge'

type Routine = { id: string; name: string; is_owner?: boolean }
type Exercise = { id: string; name: string; muscle_group: string }
type LibraryItem = {
  id: string
  name: string
  muscle_group: string
  primary_muscle?: string | null
  image_url?: string | null
  video_url?: string | null
  default_sets: number
  default_reps: number
  default_rest_seconds: number
  notes?: string | null
}
type LeaderboardRow = { user_id: string; username: string; total_volume: number | string; sessions?: number }

type WorkoutExercise = {
  localId: string
  exerciseId: string
  name: string
  muscleGroup: string
  repsInput: string
  weightsInput: string
}

type Unit = 'kg' | 'lb'
type View = 'session' | 'stats' | 'history'

const TEMPLATES = {
  fuerza: { label: 'Fuerza', reps: '5,5,5,5', weights: '80,80,80,80' },
  hipertrofia: { label: 'Hipertrofia', reps: '12,10,8,8', weights: '40,45,50,50' },
  resistencia: { label: 'Resistencia', reps: '15,15,15', weights: '20,20,20' },
} as const

const LB_PER_KG = 2.2046226218
const todayIso = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Escapa un campo para CSV: comillas, comas, saltos de línea y fórmulas. */
function csvCell(value: unknown): string {
  const text = String(value ?? '')
  // Un campo que empieza por = + - @ lo ejecuta Excel como fórmula.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export default function Trainings() {
  const navigate = useNavigate()
  const location = useLocation()

  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [date, setDate] = useState(todayIso)
  const [unit, setUnit] = useState<Unit>('kg')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyQuery, setHistoryQuery] = useState('')
  const [mainView, setMainView] = useState<View>('session')

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryOffset, setLibraryOffset] = useState(0)
  const [libraryHasMore, setLibraryHasMore] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)

  /**
   * `restPreference` es el descanso configurado y `timerSeconds` la cuenta atrás.
   * Antes eran la misma variable, así que cada tic del temporizador guardaba el
   * valor decreciente como preferencia: al terminar un descanso, tu ajuste
   * quedaba en 0 s (y escribía en localStorage una vez por segundo).
   */
  const [restPreference, setRestPreference] = useState(90)
  const [timerSeconds, setTimerSeconds] = useState(90)
  const [timerRunning, setTimerRunning] = useState(false)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [sessionRunning, setSessionRunning] = useState(false)
  const settingsLoaded = useRef(false)

  const toKg = useCallback((value: number) => (unit === 'kg' ? value : value / LB_PER_KG), [unit])
  const fromKg = useCallback((value: number) => (unit === 'kg' ? value : value * LB_PER_KG), [unit])

  const loadRoutines = useCallback(async () => {
    try {
      const response = await routineService.getRoutines()
      setRoutines(response.data.routines || [])
    } catch (err) {
      setError(getErrorMessage(err, 'No se han podido cargar las rutinas.'))
    }
  }, [])

  const loadHistory = useCallback(async (forceFresh = false) => {
    try {
      setLoadingHistory(true)
      if (forceFresh) clearCacheByPrefix('gymesis:trainings:history')
      const result = await getCachedOrFetch(
        'gymesis:trainings:history',
        () => trainingService.getHistory().then((response) => response.data.history || []),
        { ttlMs: 30_000, version: 3 }
      )
      setHistory(result.data)
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido cargar el historial.'))
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const loadExercises = useCallback(async (routineId: string) => {
    if (!routineId) {
      setExercises([])
      return
    }
    try {
      const response = await exerciseService.getByRoutine(routineId)
      setExercises(response.data.exercises || [])
    } catch {
      setExercises([])
    }
  }, [])

  const loadLeaderboard = useCallback(async (routineId: string) => {
    if (!routineId) {
      setLeaderboard([])
      return
    }
    try {
      const response = await trainingService.getProgress(routineId)
      setLeaderboard(response.data.leaderboard || [])
    } catch {
      setLeaderboard([])
    }
  }, [])

  const loadLibrary = useCallback(
    async (reset: boolean) => {
      try {
        setLoadingLibrary(true)
        const offset = reset ? 0 : libraryOffset
        const response = await exerciseService.getLibrary({ q: libraryQuery, limit: 40, offset })
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
    [libraryOffset, libraryQuery]
  )

  // Arranque: preferencias guardadas y rutina que llega desde la pantalla anterior.
  useEffect(() => {
    const settings = getTrainingSettings()
    setUnit(settings.unit)
    setRestPreference(settings.restTimeSeconds)
    setTimerSeconds(settings.restTimeSeconds)
    settingsLoaded.current = true

    loadRoutines()
    loadHistory()

    const params = new URLSearchParams(location.search)
    const bridge = getRoutineBridge()
    const routineId = params.get('routine') || bridge.routineId
    if (routineId) {
      setSelectedRoutineId(routineId)
      if (bridge.routineName) setSessionTitle(bridge.routineName)
    }
    // Sólo al montar: después el usuario manda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Se guarda sólo lo que el usuario elige, nunca la cuenta atrás en curso.
  useEffect(() => {
    if (!settingsLoaded.current) return
    saveTrainingSettings({ unit, restTimeSeconds: restPreference })
  }, [unit, restPreference])

  useEffect(() => {
    loadExercises(selectedRoutineId)
    loadLeaderboard(selectedRoutineId)
    if (selectedRoutineId) setRoutineBridge(selectedRoutineId)
  }, [selectedRoutineId, loadExercises, loadLeaderboard])

  useEffect(() => {
    if (!libraryOpen) return
    const timer = window.setTimeout(() => loadLibrary(true), 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryOpen, libraryQuery])

  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimerSeconds((previous) => {
        if (previous <= 1) {
          setTimerRunning(false)
          emitFeedback({ kind: 'info', title: 'Descanso terminado', message: 'A por la siguiente serie.' })
          return 0
        }
        return previous - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning])

  useEffect(() => {
    if (!sessionRunning) return
    const interval = window.setInterval(() => setSessionSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(interval)
  }, [sessionRunning])

  const parseSets = useCallback((item: WorkoutExercise) => {
    const reps = item.repsInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
    const weights = item.weightsInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0)
    return { reps, weights }
  }, [])

  const volumeOf = useCallback(
    (item: WorkoutExercise) => {
      const { reps, weights } = parseSets(item)
      return reps.reduce((sum, rep, index) => sum + rep * toKg(weights[index] ?? 0), 0)
    },
    [parseSets, toKg]
  )

  const addExerciseToWorkout = (exercise: Exercise) => {
    setWorkoutExercises((current) => [
      ...current,
      {
        localId: `${exercise.id}-${Date.now()}-${current.length}`,
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        repsInput: TEMPLATES.hipertrofia.reps,
        weightsInput: TEMPLATES.hipertrofia.weights,
      },
    ])
  }

  const addAllRoutineExercises = () => {
    const existing = new Set(workoutExercises.map((item) => item.exerciseId))
    const toAdd = exercises.filter((exercise) => !existing.has(exercise.id))
    if (toAdd.length === 0) return

    setWorkoutExercises((current) => [
      ...current,
      ...toAdd.map((exercise, index) => ({
        localId: `${exercise.id}-${Date.now()}-${index}`,
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        repsInput: TEMPLATES.hipertrofia.reps,
        weightsInput: TEMPLATES.hipertrofia.weights,
      })),
    ])
    emitFeedback({ kind: 'success', title: `${toAdd.length} ejercicios añadidos a la sesión` })
  }

  const addLibraryExercise = async (item: LibraryItem) => {
    if (!selectedRoutineId) {
      emitFeedback({ kind: 'warning', title: 'Elige antes una rutina' })
      return
    }
    try {
      const created = await exerciseService.create({
        routineId: selectedRoutineId,
        name: item.name,
        muscleGroup: item.primary_muscle || item.muscle_group,
        sets: item.default_sets,
        reps: item.default_reps,
        restSeconds: item.default_rest_seconds,
      })
      const exercise = created.data.exercise as Exercise
      setExercises((current) => [...current, exercise])
      addExerciseToWorkout(exercise)
      emitFeedback({ kind: 'success', title: `Añadido: ${exercise.name}` })
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido añadir', message: getErrorMessage(err) })
    }
  }

  const updateWorkoutExercise = (localId: string, patch: Partial<WorkoutExercise>) => {
    setWorkoutExercises((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)))
  }

  const adjustSets = (localId: string, delta: 1 | -1) => {
    setWorkoutExercises((current) =>
      current.map((item) => {
        if (item.localId !== localId) return item
        const reps = item.repsInput.split(',').map((value) => value.trim()).filter(Boolean)
        const weights = item.weightsInput.split(',').map((value) => value.trim()).filter(Boolean)

        if (delta === 1) {
          return {
            ...item,
            repsInput: [...reps, reps[reps.length - 1] ?? '10'].join(','),
            weightsInput: [...weights, weights[weights.length - 1] ?? '20'].join(','),
          }
        }
        return {
          ...item,
          repsInput: (reps.length > 1 ? reps.slice(0, -1) : reps).join(','),
          weightsInput: (weights.length > 1 ? weights.slice(0, -1) : weights).join(','),
        }
      })
    )
  }

  const clearWorkout = () => {
    setWorkoutExercises([])
    setWorkoutNotes('')
    setSessionTitle('')
    setSessionRunning(false)
    setSessionSeconds(0)
  }

  const submitWorkout = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!selectedRoutineId) {
      setError('Selecciona una rutina para registrar la sesión.')
      return
    }
    if (workoutExercises.length === 0) {
      setError('Añade al menos un ejercicio a la sesión.')
      return
    }

    for (const item of workoutExercises) {
      const { reps, weights } = parseSets(item)
      if (reps.length === 0 || weights.length === 0) {
        setError(`"${item.name}" necesita repeticiones y pesos válidos.`)
        return
      }
      if (reps.length !== weights.length) {
        setError(`"${item.name}" debe tener el mismo número de repeticiones que de pesos.`)
        return
      }
    }

    setSaving(true)
    const failed: string[] = []
    let saved = 0

    try {
      for (const item of workoutExercises) {
        const { reps, weights } = parseSets(item)
        const notes = [sessionTitle && `Sesión: ${sessionTitle}`, workoutNotes].filter(Boolean).join(' · ')

        try {
          await trainingService.logSession({
            routineId: selectedRoutineId,
            exerciseId: item.exerciseId,
            date,
            setsCompleted: reps.length,
            repsPerSet: reps,
            // Siempre se guarda en kg; la unidad es sólo de presentación.
            weightsPerSet: weights.map((weight) => Number(toKg(weight).toFixed(2))),
            notes: notes || undefined,
          })
          saved += 1
        } catch (err) {
          failed.push(`${item.name}: ${getErrorMessage(err)}`)
        }
      }

      if (saved > 0) {
        clearCacheByPrefix('gymesis:trainings:')
        clearCacheByPrefix('gymesis:dashboard:')
        await Promise.all([loadHistory(true), loadLeaderboard(selectedRoutineId)])
        clearRoutineBridge()
        emitFeedback({
          kind: 'success',
          title: 'Sesión guardada',
          message: `${saved} ${saved === 1 ? 'ejercicio registrado' : 'ejercicios registrados'}.`,
        })
        if (failed.length === 0) clearWorkout()
      }

      if (failed.length > 0) {
        setError(`No se guardaron ${failed.length} ejercicios: ${failed.slice(0, 2).join(' | ')}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const filteredHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    if (!query) return history
    return history.filter(
      (item) =>
        item.exercise_name.toLowerCase().includes(query) || item.routine_name.toLowerCase().includes(query)
    )
  }, [history, historyQuery])

  const analytics = useMemo(() => computeWorkoutAnalytics(history), [history])

  const sessionVolume = useMemo(
    () => workoutExercises.reduce((sum, item) => sum + volumeOf(item), 0),
    [workoutExercises, volumeOf]
  )

  const exportHistoryCsv = () => {
    const rows = [
      ['fecha', 'rutina', 'ejercicio', 'musculo', 'series', 'volumen_kg'].map(csvCell).join(','),
      ...filteredHistory.map((item) =>
        [
          String(item.date).slice(0, 10),
          item.routine_name,
          item.exercise_name,
          item.muscle_group ?? '',
          (item as { sets_completed?: number }).sets_completed ?? '',
          item.total_volume,
        ]
          .map(csvCell)
          .join(',')
      ),
    ]
    // El BOM (U+FEFF) hace que Excel abra el CSV como UTF-8 y respete las tildes.
    const utf8Bom = String.fromCharCode(0xfeff)
    const blob = new Blob([utf8Bom + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gymesis-historial-${todayIso()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    emitFeedback({ kind: 'success', title: 'CSV exportado' })
  }

  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId)

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Shield className="title-icon" />}
          title="Entrenamiento"
          subtitle="Registra tus series, controla el descanso y mira cómo progresas."
          actions={
            <>
              <div className="flex gap-1">
                {(['kg', 'lb'] as const).map((value) => (
                  <button
                    key={value}
                    className={`btn-soft btn-sm ${unit === value ? 'is-active' : ''}`}
                    onClick={() => setUnit(value)}
                    aria-pressed={unit === value}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <button className="btn-soft btn-sm" onClick={() => navigate('/routines')}>
                Ir a rutinas
              </button>
            </>
          }
          meta={
            <>
              <span className="tiny-badge">Días entrenados: {analytics.totalSessions}</span>
              <span className="tiny-badge">
                Volumen total: {Math.round(fromKg(analytics.totalVolumeKg)).toLocaleString('es-ES')} {unit}
              </span>
              {selectedRoutine && <span className="tiny-badge tiny-badge-brand">Rutina: {selectedRoutine.name}</span>}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        <div className="mobile-tabs mb-5">
          {(
            [
              ['session', 'Sesión'],
              ['stats', 'Analítica'],
              ['history', 'Historial'],
            ] as Array<[View, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`mobile-tab ${mainView === value ? 'active' : ''}`}
              onClick={() => setMainView(value)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="mobile-tab" onClick={() => setLibraryOpen(true)}>
            <Library size={13} className="mr-1 inline" />
            Biblioteca
          </button>
        </div>

        {mainView === 'session' && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <form onSubmit={submitWorkout} className="space-y-5">
              <div className="panel space-y-4 p-5">
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <Dumbbell size={19} />
                  Sesión de hoy
                </h2>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="field-label" htmlFor="routine">
                      Rutina
                    </label>
                    <select
                      id="routine"
                      value={selectedRoutineId}
                      onChange={(event) => setSelectedRoutineId(event.target.value)}
                      className="field"
                    >
                      <option value="">Selecciona una rutina</option>
                      {routines.map((routine) => (
                        <option key={routine.id} value={routine.id}>
                          {routine.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="sessionTitle">
                      Título (opcional)
                    </label>
                    <input
                      id="sessionTitle"
                      className="field"
                      value={sessionTitle}
                      onChange={(event) => setSessionTitle(event.target.value)}
                      placeholder="Pierna pesada"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="date">
                      Fecha
                    </label>
                    <input
                      id="date"
                      type="date"
                      className="field"
                      max={todayIso()}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </div>
                </div>

                {selectedRoutineId && (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Ejercicios de la rutina</h3>
                      <button type="button" className="btn-soft btn-xs" onClick={addAllRoutineExercises}>
                        Añadir todos
                      </button>
                    </div>
                    {exercises.length === 0 ? (
                      <div className="empty-state">
                        Esta rutina no tiene ejercicios todavía. Añádelos desde Rutinas o la biblioteca.
                      </div>
                    ) : (
                      <div className="grid max-h-48 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                        {exercises.map((exercise) => (
                          <button
                            key={exercise.id}
                            type="button"
                            onClick={() => addExerciseToWorkout(exercise)}
                            className="list-row clickable-row text-left"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold">{exercise.name}</span>
                              <Plus size={14} className="shrink-0" />
                            </div>
                            <div className="soft-text text-xs">{exercise.muscle_group}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="panel space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">En curso ({workoutExercises.length})</h3>
                    <p className="soft-text text-sm">
                      Escribe las repeticiones y los pesos separados por comas, una cifra por serie.
                    </p>
                  </div>
                  {workoutExercises.length > 0 && (
                    <button type="button" className="btn-soft btn-xs" onClick={clearWorkout}>
                      Vaciar
                    </button>
                  )}
                </div>

                {workoutExercises.length === 0 ? (
                  <div className="empty-state">
                    Tu sesión está vacía. Añade ejercicios de la rutina o de la biblioteca.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workoutExercises.map((item, index) => {
                      const { reps, weights } = parseSets(item)
                      const mismatch = reps.length !== weights.length
                      return (
                        <article key={item.localId} className="list-row space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold">
                                <span className="faint-text mr-1.5 tabular-nums">{index + 1}.</span>
                                {item.name}
                              </div>
                              <div className="soft-text text-xs">
                                {item.muscleGroup} · {reps.length} {reps.length === 1 ? 'serie' : 'series'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn-danger btn-xs shrink-0"
                              onClick={() =>
                                setWorkoutExercises((current) => current.filter((row) => row.localId !== item.localId))
                              }
                              aria-label={`Quitar ${item.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div>
                              <label className="field-label">Repeticiones</label>
                              <input
                                className={`field ${mismatch ? 'field-error' : ''}`}
                                value={item.repsInput}
                                onChange={(event) => updateWorkoutExercise(item.localId, { repsInput: event.target.value })}
                                placeholder="10,8,6"
                                inputMode="numeric"
                              />
                            </div>
                            <div>
                              <label className="field-label">Pesos ({unit})</label>
                              <input
                                className={`field ${mismatch ? 'field-error' : ''}`}
                                value={item.weightsInput}
                                onChange={(event) =>
                                  updateWorkoutExercise(item.localId, { weightsInput: event.target.value })
                                }
                                placeholder={unit === 'kg' ? '20,22.5,25' : '45,50,55'}
                                inputMode="decimal"
                              />
                            </div>
                          </div>

                          {mismatch && (
                            <p className="text-xs" style={{ color: 'var(--danger)' }}>
                              Hay {reps.length} repeticiones y {weights.length} pesos: deben coincidir.
                            </p>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="tiny-badge">
                              Volumen: {fromKg(volumeOf(item)).toLocaleString('es-ES', { maximumFractionDigits: 1 })}{' '}
                              {unit}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(TEMPLATES).map(([key, template]) => (
                                <button
                                  key={key}
                                  type="button"
                                  className="btn-soft btn-xs"
                                  onClick={() =>
                                    updateWorkoutExercise(item.localId, {
                                      repsInput: template.reps,
                                      weightsInput: template.weights,
                                    })
                                  }
                                >
                                  {template.label}
                                </button>
                              ))}
                              <button type="button" className="btn-soft btn-xs" onClick={() => adjustSets(item.localId, 1)}>
                                + serie
                              </button>
                              <button type="button" className="btn-soft btn-xs" onClick={() => adjustSets(item.localId, -1)}>
                                − serie
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}

                <div>
                  <label className="field-label" htmlFor="workoutNotes">
                    Notas de la sesión
                  </label>
                  <textarea
                    id="workoutNotes"
                    className="field min-h-20"
                    value={workoutNotes}
                    onChange={(event) => setWorkoutNotes(event.target.value)}
                    placeholder="Cómo te has sentido, molestias, objetivos..."
                  />
                </div>

                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-4"
                  style={{ background: 'var(--brand-tint)', border: '1px solid color-mix(in srgb, var(--brand) 25%, transparent)' }}
                >
                  <div>
                    <div className="soft-text text-sm">Volumen total de la sesión</div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--brand-strong)' }}>
                      {fromKg(sessionVolume).toLocaleString('es-ES', { maximumFractionDigits: 1 })} {unit}
                    </div>
                  </div>
                  <button className="btn-primary" type="submit" disabled={saving || workoutExercises.length === 0}>
                    {saving ? (
                      <>
                        <span className="loader" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar sesión'
                    )}
                  </button>
                </div>
              </div>
            </form>

            <aside className="h-fit space-y-5 xl:sticky xl:top-20">
              <section className="panel p-5">
                <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold">
                  <TimerReset size={18} />
                  Descanso
                </h2>
                <div
                  className="mb-3 text-center text-5xl font-bold tabular-nums"
                  style={{ color: timerSeconds === 0 ? 'var(--success)' : 'var(--brand-strong)' }}
                >
                  {formatTime(timerSeconds)}
                </div>
                <div className="mb-3 flex flex-wrap justify-center gap-1.5">
                  {[30, 60, 90, 120, 180].map((value) => (
                    <button
                      key={value}
                      className={`btn-soft btn-xs ${restPreference === value ? 'is-active' : ''}`}
                      type="button"
                      onClick={() => {
                        setRestPreference(value)
                        setTimerSeconds(value)
                        setTimerRunning(false)
                      }}
                    >
                      {value}s
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary flex-1"
                    onClick={() => {
                      if (timerSeconds === 0) setTimerSeconds(restPreference)
                      setTimerRunning((value) => !value)
                    }}
                  >
                    {timerRunning ? <Pause size={15} /> : <Play size={15} />}
                    {timerRunning ? 'Pausar' : 'Iniciar'}
                  </button>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => {
                      setTimerRunning(false)
                      setTimerSeconds(restPreference)
                    }}
                    aria-label="Reiniciar descanso"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </section>

              <section className="panel p-5">
                <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold">
                  <Clock3 size={18} />
                  Duración
                </h2>
                <div className="mb-3 text-center text-3xl font-bold tabular-nums">{formatTime(sessionSeconds)}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-soft flex-1"
                    onClick={() => setSessionRunning((value) => !value)}
                  >
                    {sessionRunning ? <Pause size={15} /> : <Play size={15} />}
                    {sessionRunning ? 'Pausar' : 'Iniciar'}
                  </button>
                  <button
                    type="button"
                    className="btn-soft"
                    onClick={() => {
                      setSessionRunning(false)
                      setSessionSeconds(0)
                    }}
                    aria-label="Reiniciar duración"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
              </section>

              <section className="panel p-5">
                <h2 className="mb-3 inline-flex items-center gap-2 text-lg font-semibold">
                  <Trophy size={18} />
                  Ranking de la rutina
                </h2>
                {leaderboard.length === 0 ? (
                  <div className="empty-state">
                    {selectedRoutineId ? 'Sin datos todavía.' : 'Selecciona una rutina.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaderboard.map((row, index) => (
                      <div key={row.user_id} className="list-row flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className="faint-text mr-1.5 tabular-nums">{index + 1}.</span>
                          {row.username}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--brand-strong)' }}>
                          {Math.round(fromKg(Number(row.total_volume))).toLocaleString('es-ES')} {unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </section>
        )}

        {mainView === 'stats' && (
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <MiniBarChart
              title="Volumen de los últimos 7 días"
              subtitle="Trabajo total registrado cada día."
              valueSuffix={` ${unit}`}
              precision={0}
              items={analytics.dailyVolumeLast7Days.map((item) => ({
                label: item.label,
                value: fromKg(item.volume),
              }))}
              emptyLabel="Aún no hay volumen esta semana."
            />
            <MiniBarChart
              title="Volumen por grupo muscular"
              subtitle="Reparto de todo tu historial."
              valueSuffix={` ${unit}`}
              precision={0}
              items={Object.entries(analytics.volumeByMuscle)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, value]) => ({ label, value: fromKg(value) }))}
              emptyLabel="Aún no hay datos por grupo muscular."
            />
          </section>
        )}

        {mainView === 'history' && (
          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                  <CalendarDays size={19} />
                  Historial
                </h2>
                <p className="section-subtitle">{filteredHistory.length} registros</p>
              </div>
              <button
                type="button"
                className="btn-soft btn-sm"
                onClick={exportHistoryCsv}
                disabled={filteredHistory.length === 0}
              >
                <Download size={14} />
                Exportar CSV
              </button>
            </div>

            <div className="relative mb-3 w-full md:w-80">
              <Search size={14} className="faint-text absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                className="field pl-8"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder="Filtrar por rutina o ejercicio"
                aria-label="Filtrar historial"
              />
            </div>

            {loadingHistory ? (
              <SkeletonList count={5} />
            ) : filteredHistory.length === 0 ? (
              <div className="empty-state">
                {history.length === 0 ? 'Todavía no has registrado ningún entrenamiento.' : 'Nada coincide con el filtro.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                      <th className="py-2 text-left font-semibold">Fecha</th>
                      <th className="py-2 text-left font-semibold">Rutina</th>
                      <th className="py-2 text-left font-semibold">Ejercicio</th>
                      <th className="py-2 text-right font-semibold">Volumen ({unit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td className="py-2 tabular-nums">{String(item.date).slice(0, 10)}</td>
                        <td className="py-2">{item.routine_name}</td>
                        <td className="py-2">{item.exercise_name}</td>
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--brand-strong)' }}>
                          {fromKg(Number(item.total_volume)).toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <Modal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          variant="drawer"
          title="Biblioteca de ejercicios"
          description={
            selectedRoutine
              ? `Se añadirán a "${selectedRoutine.name}" y a la sesión actual`
              : 'Selecciona antes una rutina'
          }
        >
          <div className="space-y-4">
            <input
              className="field"
              value={libraryQuery}
              onChange={(event) => setLibraryQuery(event.target.value)}
              placeholder="Buscar ejercicio, músculo o material"
              aria-label="Buscar en la biblioteca"
            />

            <div className="space-y-2">
              {libraryItems.map((item) => (
                <div key={item.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{item.name}</div>
                    <div className="soft-text text-xs">
                      {item.primary_muscle || item.muscle_group} · {item.default_sets}×{item.default_reps} · descanso{' '}
                      {item.default_rest_seconds}s
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {item.video_url && (
                      <a className="btn-soft btn-sm" href={item.video_url} target="_blank" rel="noreferrer noopener">
                        Vídeo
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => addLibraryExercise(item)}
                      disabled={!selectedRoutineId}
                    >
                      Añadir
                    </button>
                  </div>
                </div>
              ))}

              {loadingLibrary && <SkeletonList count={4} />}

              {!loadingLibrary && libraryItems.length === 0 && (
                <div className="empty-state">Ningún ejercicio coincide con la búsqueda.</div>
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
