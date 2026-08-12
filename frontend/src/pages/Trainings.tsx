import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Download, Dumbbell, Flame, Medal, Search, Shield, TimerReset, Trophy } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import MiniBarChart from '../components/MiniBarChart'
import { exerciseService, routineService, trainingService } from '../services/api'
import { getCachedOrFetch } from '../utils/cache'
import { computeWorkoutAnalytics } from '../utils/trainingAnalytics'
import { getTrainingSettings, saveTrainingSettings } from '../utils/settings'
import { clearRoutineBridge, getRoutineBridge, setRoutineBridge } from '../utils/routineBridge'

type Routine = { id: string; name: string }
type Exercise = { id: string; name: string; muscle_group: string }
type ExerciseLibraryItem = {
  id: string
  name: string
  muscle_group: string
  primary_muscle?: string | null
  secondary_muscles?: string | null
  image_url?: string | null
  video_url?: string | null
  default_sets: number
  default_reps: number
  default_rest_seconds: number
  notes?: string | null
}
type HistoryRow = {
  id: string
  date: string
  routine_name: string
  exercise_name: string
  total_volume: string
}

type WorkoutExercise = {
  localId: string
  exerciseId: string
  name: string
  muscleGroup: string
  repsInput: string
  weightsInput: string
  notes: string
}

type Unit = 'kg' | 'lb'

const repTemplates = {
  fuerza: { reps: '5,5,5,5', weights: '80,80,80,80' },
  hipertrofia: { reps: '12,10,8,8', weights: '40,45,50,50' },
  resistencia: { reps: '15,15,15', weights: '20,20,20' },
}

export default function Trainings() {
  const navigate = useNavigate()
  const location = useLocation()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([])
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState('')
  const [repsInput, setRepsInput] = useState('10,8,6')
  const [weightsInput, setWeightsInput] = useState('20,22.5,25')
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([])
  const [workoutNotes, setWorkoutNotes] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [unit, setUnit] = useState<Unit>('kg')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState<Array<{ username: string; total_volume: string }>>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historySortDesc, setHistorySortDesc] = useState(true)
  const [historyCacheNotice, setHistoryCacheNotice] = useState('')
  const [routineHint, setRoutineHint] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryMuscleFilter, setLibraryMuscleFilter] = useState('all')
  const [libraryMuscleOptions, setLibraryMuscleOptions] = useState<string[]>([])
  const [selectedLibraryExerciseId, setSelectedLibraryExerciseId] = useState('')
  const [libraryPage, setLibraryPage] = useState(1)
  const [libraryOffset, setLibraryOffset] = useState(0)
  const [libraryHasMore, setLibraryHasMore] = useState(false)
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [newExerciseForm, setNewExerciseForm] = useState({ name: '', muscleGroup: '', sets: 3, reps: 8, restSeconds: 90, notes: '' })
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [mainView, setMainView] = useState<'session' | 'stats' | 'history'>('session')
  const libraryPageSize = 24

  const [timerSeconds, setTimerSeconds] = useState(90)
  const [timerRunning, setTimerRunning] = useState(false)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [sessionRunning, setSessionRunning] = useState(false)

  const loadRoutines = async () => {
    const response = await routineService.getRoutines()
    const data = response.data.routines || []
    setRoutines(data)
  }

  const loadExerciseLibrary = async (reset = true) => {
    setLoadingLibrary(true)
    const response = await exerciseService.getLibrary({
      q: libraryQuery.trim() || undefined,
      muscle: libraryMuscleFilter !== 'all' ? libraryMuscleFilter : undefined,
      limit: 50,
      offset: reset ? 0 : libraryOffset,
    })
    const next = response.data.exercises || []
    const paging = response.data.paging || { hasMore: false }
    setExerciseLibrary((current) => (reset ? next : [...current, ...next]))
    setLibraryOffset((reset ? 0 : libraryOffset) + next.length)
    setLibraryHasMore(Boolean(paging.hasMore))
    setLoadingLibrary(false)
  }

  const loadLibraryMeta = async () => {
    const response = await exerciseService.getLibraryMeta()
    const muscles = response.data.muscles || []
    setLibraryMuscleOptions(['all', ...muscles])
  }

  const applyRoutineSelection = (routineId: string, routineName?: string) => {
    if (!routineId) return
    setSelectedRoutineId(routineId)
    if (routineName) {
      setRoutineHint(`Rutina cargada: ${routineName}`)
      setSessionTitle((current) => current || routineName)
    }
    setRoutineBridge(routineId, routineName)
  }

  const parsedWorkoutItem = (item: WorkoutExercise) => {
    const reps = item.repsInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value) && value > 0)
    const weights = item.weightsInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value) && value >= 0)
    return { reps, weights }
  }

  const addExerciseToWorkout = (exercise: Exercise) => {
    setWorkoutExercises((current) => {
      if (current.some((item) => item.exerciseId === exercise.id)) return current
      return [
        ...current,
        {
          localId: `${exercise.id}-${Date.now()}`,
          exerciseId: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscle_group,
          repsInput: repsInput,
          weightsInput: weightsInput,
          notes: '',
        },
      ]
    })
  }

  const addLibraryExerciseToWorkout = async (item: ExerciseLibraryItem) => {
    if (!selectedRoutineId) {
      setError('Selecciona una rutina antes de añadir ejercicios de la biblioteca')
      return
    }
    try {
      const created = await exerciseService.create({
        routineId: selectedRoutineId,
        name: item.name,
        muscleGroup: item.muscle_group,
        sets: item.default_sets,
        reps: item.default_reps,
        restSeconds: item.default_rest_seconds,
        notes: item.notes || '',
      })
      const exercise = created.data.exercise as Exercise
      setExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name)))
      addExerciseToWorkout(exercise)
      setStatusMessage(`Ejercicio añadido: ${exercise.name}`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo añadir el ejercicio de la biblioteca')
    }
  }

  const splitTokens = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)

  const rebuildTokens = (values: string[]) => values.join(',')

  const addSetToWorkoutExercise = (localId: string) => {
    setWorkoutExercises((current) => current.map((item) => {
      if (item.localId !== localId) return item
      const repsTokens = splitTokens(item.repsInput)
      const weightTokens = splitTokens(item.weightsInput)
      const lastReps = repsTokens[repsTokens.length - 1] || '10'
      const lastWeight = weightTokens[weightTokens.length - 1] || '20'
      return {
        ...item,
        repsInput: rebuildTokens([...repsTokens, lastReps]),
        weightsInput: rebuildTokens([...weightTokens, lastWeight]),
      }
    }))
  }

  const removeSetFromWorkoutExercise = (localId: string) => {
    setWorkoutExercises((current) => current.map((item) => {
      if (item.localId !== localId) return item
      const repsTokens = splitTokens(item.repsInput)
      const weightTokens = splitTokens(item.weightsInput)
      return {
        ...item,
        repsInput: rebuildTokens(repsTokens.length > 1 ? repsTokens.slice(0, -1) : repsTokens),
        weightsInput: rebuildTokens(weightTokens.length > 1 ? weightTokens.slice(0, -1) : weightTokens),
      }
    }))
  }

  const duplicateWorkoutExercise = (localId: string) => {
    const current = workoutExercises.find((item) => item.localId === localId)
    if (!current) return
    setWorkoutExercises((items) => [
      ...items,
      { ...current, localId: `${current.exerciseId}-${Date.now()}` },
    ])
  }

  const createCustomExerciseAndAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRoutineId) {
      setError('Selecciona una rutina para crear el ejercicio')
      return
    }
    if (!newExerciseForm.name.trim() || !newExerciseForm.muscleGroup.trim()) {
      setError('Nombre y grupo muscular son obligatorios')
      return
    }
    try {
      const created = await exerciseService.create({
        routineId: selectedRoutineId,
        name: newExerciseForm.name.trim(),
        muscleGroup: newExerciseForm.muscleGroup.trim(),
        sets: newExerciseForm.sets,
        reps: newExerciseForm.reps,
        restSeconds: newExerciseForm.restSeconds,
        notes: newExerciseForm.notes.trim(),
      })
      const exercise = created.data.exercise as Exercise
      setExercises((current) => [...current, exercise].sort((a, b) => a.name.localeCompare(b.name)))
      addExerciseToWorkout(exercise)
      setNewExerciseForm({ name: '', muscleGroup: '', sets: 3, reps: 8, restSeconds: 90, notes: '' })
      setStatusMessage('Ejercicio creado y agregado a la sesión')
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo crear el ejercicio')
    }
  }

  const addAllRoutineExercises = () => {
    if (exercises.length === 0) return
    setWorkoutExercises((current) => {
      const next = [...current]
      exercises.forEach((exercise, index) => {
        if (next.some((item) => item.exerciseId === exercise.id)) return
        next.push({
          localId: `${exercise.id}-${Date.now()}-${index}`,
          exerciseId: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscle_group,
          repsInput: repTemplates.hipertrofia.reps,
          weightsInput: repTemplates.hipertrofia.weights,
          notes: '',
        })
      })
      return next
    })
    setStatusMessage('Rutina añadida a la sesión.')
  }

  const fillWorkoutFromRoutine = () => {
    if (exercises.length === 0) return
    setWorkoutExercises(
      exercises.map((exercise, index) => ({
        localId: `${exercise.id}-${Date.now()}-${index}`,
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscle_group,
        repsInput: index === 0 ? repsInput : repTemplates.hipertrofia.reps,
        weightsInput: index === 0 ? weightsInput : repTemplates.hipertrofia.weights,
        notes: '',
      }))
    )
    setStatusMessage('La rutina quedó cargada como sesión.')
  }

  const updateWorkoutExercise = (localId: string, patch: Partial<WorkoutExercise>) => {
    setWorkoutExercises((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)))
  }

  const removeWorkoutExercise = (localId: string) => {
    setWorkoutExercises((current) => current.filter((item) => item.localId !== localId))
  }

  const clearWorkout = () => {
    setWorkoutExercises([])
    setWorkoutNotes('')
    setSessionTitle('')
    setSessionRunning(false)
    setSessionSeconds(0)
    setStatusMessage('Sesión vaciada')
  }

  const loadHistory = async () => {
    setLoadingHistory(true)
    const result = await getCachedOrFetch('gymesis:trainings:history', async () => {
      const response = await trainingService.getHistory()
      return response.data.history || []
    }, { ttlMs: 30_000, version: 2 })
    setHistory(result.data)
    setHistoryCacheNotice(result.stale ? 'Mostrando historial local por conexion inestable.' : '')
    setLoadingHistory(false)
  }

  const loadExercises = async (routineId: string) => {
    if (!routineId) return
    const response = await exerciseService.getByRoutine(routineId)
    const items = response.data.exercises || []
    setExercises(items)
  }

  const loadProgress = async (routineId: string) => {
    if (!routineId) {
      setProgress([])
      return
    }
    const response = await trainingService.getProgress(routineId)
    setProgress(response.data.leaderboard || [])
  }

  useEffect(() => {
    const settings = getTrainingSettings()
    setUnit(settings.unit)
    setTimerSeconds(settings.restTimeSeconds)
    loadRoutines().catch(() => setError('No se pudieron cargar rutinas'))
    loadLibraryMeta().catch(() => undefined)
    loadExerciseLibrary(true).catch(() => undefined)
    loadHistory().catch(() => undefined)

    const params = new URLSearchParams(location.search)
    const routineFromQuery = params.get('routine') || ''
    const bridge = getRoutineBridge()
    const routineId = routineFromQuery || bridge.routineId
    if (routineId) {
      setSelectedRoutineId(routineId)
      setRoutineHint(`Rutina cargada: ${bridge.routineName || routineFromQuery || routineId}`)
    }
  }, [])

  useEffect(() => {
    saveTrainingSettings({ unit, restTimeSeconds: timerSeconds })
  }, [unit, timerSeconds])

  useEffect(() => {
    if (selectedRoutineId) {
      setRoutineBridge(selectedRoutineId)
    }
  }, [selectedRoutineId])

  useEffect(() => {
    loadExercises(selectedRoutineId).catch(() => setExercises([]))
    loadProgress(selectedRoutineId).catch(() => setProgress([]))
  }, [selectedRoutineId])

  useEffect(() => {
    if (exerciseLibrary.length === 0) {
      setSelectedLibraryExerciseId('')
      return
    }
    if (!exerciseLibrary.some((item) => item.id === selectedLibraryExerciseId)) {
      setSelectedLibraryExerciseId(exerciseLibrary[0].id)
    }
  }, [exerciseLibrary, selectedLibraryExerciseId])

  useEffect(() => {
    loadExerciseLibrary(true).catch(() => undefined)
  }, [libraryQuery, libraryMuscleFilter])

  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval)
          setTimerRunning(false)
          setStatusMessage('Descanso terminado. Siguiente set.')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning])

  useEffect(() => {
    if (!sessionRunning) return
    const interval = window.setInterval(() => {
      setSessionSeconds((value) => value + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [sessionRunning])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2500)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const toKg = (value: number) => (unit === 'kg' ? value : value * 0.453592)
  const fromKg = (value: number) => (unit === 'kg' ? value : value * 2.20462)

  const submitWorkout = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedRoutineId) {
      setError('Selecciona una rutina para registrar la sesión')
      return
    }

    if (workoutExercises.length === 0) {
      setError('Añade al menos un ejercicio a la sesión')
      return
    }

    for (const item of workoutExercises) {
      const parsedItem = parsedWorkoutItem(item)
      if (parsedItem.reps.length === 0 || parsedItem.weights.length === 0) {
        setError(`El ejercicio ${item.name} necesita reps y pesos válidos`)
        return
      }
      if (parsedItem.reps.length !== parsedItem.weights.length) {
        setError(`El ejercicio ${item.name} debe tener la misma cantidad de reps y pesos`)
        return
      }
    }

    try {
      setError('')
      let savedCount = 0
      const failedItems: string[] = []

      for (const [index, item] of workoutExercises.entries()) {
        let resolvedExerciseId = item.exerciseId
        if (!exercises.some((exercise) => exercise.id === item.exerciseId)) {
          try {
            const created = await exerciseService.create({
              routineId: selectedRoutineId,
              name: item.name,
              muscleGroup: item.muscleGroup,
              sets: parsedWorkoutItem(item).reps.length || 3,
              reps: parsedWorkoutItem(item).reps[0] || 8,
              restSeconds: timerSeconds || 90,
              notes: item.notes || '',
            })
            const createdExercise = created.data.exercise as Exercise
            resolvedExerciseId = createdExercise.id
            setExercises((current) => [...current, createdExercise])
          } catch {
            failedItems.push(`${item.name}: no se pudo enlazar con la rutina`) 
            continue
          }
        }

        const parsedItem = parsedWorkoutItem(item)
        const weightsInKg = parsedItem.weights.map((w) => Number(toKg(w).toFixed(2)))
        const notes = [sessionTitle ? `Sesión: ${sessionTitle}` : '', workoutNotes, item.notes, `Orden: ${index + 1}`]
          .filter(Boolean)
          .join(' · ')

        try {
          await trainingService.logSession({
            routineId: selectedRoutineId,
            exerciseId: resolvedExerciseId,
            date,
            setsCompleted: parsedItem.reps.length,
            repsPerSet: parsedItem.reps,
            weightsPerSet: weightsInKg,
            notes,
          })
          savedCount += 1
        } catch {
          failedItems.push(`${item.name}: error al guardar`) 
        }
      }

      if (savedCount > 0) {
        await loadHistory()
        await loadProgress(selectedRoutineId)
        setStatusMessage(`Sesión guardada: ${savedCount} ejercicios registrados.`)
        clearRoutineBridge()
      }

      if (failedItems.length > 0) {
        setError(`Algunos ejercicios no se guardaron: ${failedItems.slice(0, 3).join(' | ')}`)
      }
      if (savedCount === 0 && failedItems.length === 0) {
        setError('No se pudo registrar entrenamiento')
      }
    } catch {
      setError('No se pudo registrar entrenamiento')
    }
  }

  const filteredHistory = useMemo(() => {
    if (!historyQuery.trim()) return history
    const q = historyQuery.toLowerCase()
    return history.filter((item) => item.exercise_name.toLowerCase().includes(q) || item.routine_name.toLowerCase().includes(q))
  }, [history, historyQuery])

  const sortedHistory = useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      const left = a.date || ''
      const right = b.date || ''
      return historySortDesc ? right.localeCompare(left) : left.localeCompare(right)
    })
  }, [filteredHistory, historySortDesc])

  const filteredTotalVolumeKg = sortedHistory.reduce((acc, item) => acc + Number(item.total_volume || 0), 0)
  const analytics = useMemo(() => computeWorkoutAnalytics(sortedHistory), [sortedHistory])

  const libraryMuscles = useMemo(() => {
    if (libraryMuscleOptions.length > 0) return libraryMuscleOptions
    const items = exerciseLibrary.map((item) => item.primary_muscle || item.muscle_group)
    return ['all', ...Array.from(new Set(items)).sort()]
  }, [exerciseLibrary, libraryMuscleOptions])

  const filteredLibrary = useMemo(() => {
    return exerciseLibrary
  }, [exerciseLibrary])

  const librarySlice = useMemo(() => filteredLibrary.slice(0, libraryPage * libraryPageSize), [filteredLibrary, libraryPage])
  const selectedLibraryExercise = filteredLibrary.find((item) => item.id === selectedLibraryExerciseId) || filteredLibrary[0] || null

  const applyTemplate = (template: keyof typeof repTemplates) => {
    setRepsInput(repTemplates[template].reps)
    setWeightsInput(repTemplates[template].weights)
    setStatusMessage(`Plantilla aplicada: ${template}`)
  }

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  const exportHistoryCsv = () => {
    const lines = [
      'fecha,rutina,ejercicio,volumen_kg',
      ...filteredHistory.map((h) => `${h.date?.slice(0, 10)},${h.routine_name},${h.exercise_name},${h.total_volume}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `gymesis-history-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setStatusMessage('CSV exportado correctamente')
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Shield className="title-icon" />}
          title="Entrenamiento"
          subtitle="Registra sets, plantillas y descanso en un solo lugar."
          actions={
            <>
              <button className="btn-soft text-sm" onClick={() => navigate('/routines')}>Ir a rutinas</button>
              <button className="btn-soft text-sm" onClick={() => clearRoutineBridge()}>Limpiar rutina activa</button>
            </>
          }
        />

        {routineHint && <div className="status-info mb-4">{routineHint}</div>}

        {error && <div role="alert" className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}
        <div className="sr-only" aria-live="polite">{statusMessage}</div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" className={`mobile-tab ${mainView === 'session' ? 'active' : ''}`} onClick={() => setMainView('session')}>Sesión</button>
          <button type="button" className={`mobile-tab ${mainView === 'stats' ? 'active' : ''}`} onClick={() => setMainView('stats')}>Analítica</button>
          <button type="button" className={`mobile-tab ${mainView === 'history' ? 'active' : ''}`} onClick={() => setMainView('history')}>Historial</button>
          <button type="button" className="mobile-tab" onClick={() => setLibraryOpen(true)}>Biblioteca</button>
        </div>

        {mainView === 'session' && (
          <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
            <form onSubmit={submitWorkout} className="panel p-5 space-y-4" aria-label="Registrar sesion de entrenamiento">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Dumbbell size={20} />Sesión activa</h2>
                  <p className="soft-text">Lo esencial primero. La biblioteca y el catálogo viven aparte.</p>
                </div>
                <button type="button" className="btn-soft" onClick={() => setLibraryOpen(true)}>Abrir biblioteca</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Rutina</label>
                  <select value={selectedRoutineId} onChange={(e) => applyRoutineSelection(e.target.value, routines.find((r) => r.id === e.target.value)?.name)} className="field">
                    <option value="">Selecciona rutina</option>
                    {routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Título de sesión</label>
                  <input className="field" value={sessionTitle} onChange={(e) => setSessionTitle(e.target.value)} placeholder="Push fuerte, Pierna pesada..." />
                </div>
                <div>
                  <label className="field-label">Fecha</label>
                  <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => setDate(new Date().toISOString().slice(0, 10))}><CalendarDays size={13} />Hoy</button>
                    <button type="button" className="btn-soft text-sm inline-flex items-center gap-1" onClick={() => { const yesterday = new Date(Date.now() - 86400000); setDate(yesterday.toISOString().slice(0, 10)) }}><Clock3 size={13} />Ayer</button>
                  </div>
                </div>
              </div>

              <div className="panel p-4 stack-gap">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm soft-text">Duración de la sesión</div>
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{formatTime(sessionSeconds)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={() => setSessionRunning(true)}>Iniciar</button>
                    <button type="button" className="btn-soft" onClick={() => setSessionRunning(false)}>Pausar</button>
                    <button type="button" className="btn-soft" onClick={() => { setSessionRunning(false); setSessionSeconds(0) }}>Reset</button>
                  </div>
                </div>
              </div>

              {selectedRoutineId && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-soft text-sm" onClick={() => navigate(`/routines?routine=${encodeURIComponent(selectedRoutineId)}`)}>Ver rutina</button>
                  <button type="button" className="btn-soft text-sm" onClick={fillWorkoutFromRoutine}>Cargar rutina completa</button>
                  <button type="button" className="btn-soft text-sm" onClick={addAllRoutineExercises}>Añadir rutina</button>
                </div>
              )}

              <div className="panel p-4 stack-gap">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ejercicios de la rutina</h3>
                  <button type="button" className="btn-soft text-xs" onClick={addAllRoutineExercises}>Añadir todos</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-auto pr-1">
                  {exercises.map((exercise) => (
                    <button key={exercise.id} type="button" onClick={() => addExerciseToWorkout(exercise)} className="w-full text-left border border-slate-400/30 dark:border-slate-700 rounded p-3 clickable-row">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{exercise.name}</div>
                      <div className="text-xs soft-text">{exercise.muscle_group}</div>
                    </button>
                  ))}
                  {exercises.length === 0 && <div className="empty-state">Selecciona una rutina para ver sus ejercicios.</div>}
                </div>
              </div>

              <div className="panel p-4 stack-gap">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sesión en curso</h3>
                    <p className="soft-text text-sm">Solo la cola y los controles rápidos.</p>
                  </div>
                  <button type="button" className="btn-soft text-xs" onClick={clearWorkout}>Vaciar</button>
                </div>
                <div className="space-y-3 max-h-[42vh] overflow-auto pr-1">
                  {workoutExercises.map((item, index) => {
                    const parsedItem = parsedWorkoutItem(item)
                    const exerciseVolume = parsedItem.reps.reduce((acc, reps, setIndex) => acc + reps * toKg(parsedItem.weights[setIndex] || 0), 0)
                    return (
                      <article key={item.localId} className="border border-slate-400/30 dark:border-slate-700 rounded p-3 stack-gap bg-white/40 dark:bg-slate-900/35">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-slate-100">{index + 1}. {item.name}</div>
                            <div className="text-xs soft-text">{item.muscleGroup}</div>
                          </div>
                          <button type="button" className="btn-soft text-xs" onClick={() => removeWorkoutExercise(item.localId)}>Quitar</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="field-label">Reps</label>
                            <input className="field" value={item.repsInput} onChange={(e) => updateWorkoutExercise(item.localId, { repsInput: e.target.value })} placeholder="10,8,6" />
                          </div>
                          <div>
                            <label className="field-label">Pesos ({unit})</label>
                            <input className="field" value={item.weightsInput} onChange={(e) => updateWorkoutExercise(item.localId, { weightsInput: e.target.value })} placeholder={unit === 'kg' ? '20,22.5,25' : '45,50,55'} />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center justify-between">
                          <div className="tiny-badge">Volumen: {Number(fromKg(exerciseVolume)).toFixed(2)} {unit}</div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-soft text-xs" onClick={() => updateWorkoutExercise(item.localId, { repsInput: repTemplates.hipertrofia.reps, weightsInput: repTemplates.hipertrofia.weights })}>Hipertrofia</button>
                            <button type="button" className="btn-soft text-xs" onClick={() => updateWorkoutExercise(item.localId, { repsInput: repTemplates.fuerza.reps, weightsInput: repTemplates.fuerza.weights })}>Fuerza</button>
                            <button type="button" className="btn-soft text-xs" onClick={() => addSetToWorkoutExercise(item.localId)}>+ Serie</button>
                            <button type="button" className="btn-soft text-xs" onClick={() => removeSetFromWorkoutExercise(item.localId)}>- Serie</button>
                            <button type="button" className="btn-soft text-xs" onClick={() => duplicateWorkoutExercise(item.localId)}>Duplicar</button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                  {workoutExercises.length === 0 && <div className="empty-state">Tu sesión está vacía.</div>}
                </div>
              </div>

              <div className="panel p-4 stack-gap">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-soft inline-flex items-center gap-1" onClick={() => applyTemplate('fuerza')}><Flame size={14} />Fuerza</button>
                  <button type="button" className="btn-soft inline-flex items-center gap-1" onClick={() => applyTemplate('hipertrofia')}><Trophy size={14} />Hipertrofia</button>
                  <button type="button" className="btn-soft inline-flex items-center gap-1" onClick={() => applyTemplate('resistencia')}><Medal size={14} />Resistencia</button>
                  <button type="button" className="btn-soft" onClick={() => setLibraryOpen(true)}>Abrir biblioteca</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Notas generales</label>
                    <textarea className="field min-h-24" value={workoutNotes} onChange={(e) => setWorkoutNotes(e.target.value)} placeholder="Cómo te sentiste, molestias, objetivo..." />
                  </div>
                  <div className="stack-gap">
                    <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-3">
                      <div className="text-sm soft-text">Volumen estimado de la sesión</div>
                      <div className="text-2xl font-bold text-sky-700 dark:text-cyan-200">{Number(fromKg(workoutExercises.reduce((acc, item) => acc + parsedWorkoutItem(item).reps.reduce((sum, reps, index) => sum + reps * toKg(parsedWorkoutItem(item).weights[index] || 0), 0), 0))).toFixed(2)} {unit}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary" type="submit">Guardar sesión</button>
                      <button type="button" className="btn-soft" onClick={() => { clearWorkout(); setRepsInput('10,8,6'); setWeightsInput(unit === 'kg' ? '20,22.5,25' : '45,50,55'); setStatusMessage('Sesión reiniciada') }}>Reiniciar</button>
                    </div>
                  </div>
                </div>
              </div>
            </form>

            <aside className="panel p-5 space-y-4 xl:sticky xl:top-4 h-fit">
              <section>
                <h2 className="text-2xl font-semibold mb-2 text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><TimerReset size={20} />Temporizador</h2>
                <div className="text-4xl font-bold text-sky-700 dark:text-cyan-200 mb-3">{formatTime(timerSeconds)}</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[30, 60, 90, 120].map((sec) => <button key={sec} className="btn-soft" type="button" onClick={() => setTimerSeconds(sec)}>{sec}s</button>)}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" onClick={() => setTimerRunning(true)}>Start</button>
                  <button type="button" className="btn-soft" onClick={() => setTimerRunning(false)}>Pause</button>
                  <button type="button" className="btn-soft" onClick={() => { setTimerRunning(false); setTimerSeconds(90) }}>Reset</button>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Trophy size={18} />Ranking</h2>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {progress.map((p, index) => (
                    <div key={`${p.username}-${index}`} className="border border-slate-400/30 dark:border-slate-700 rounded px-3 py-2 flex justify-between bg-white/40 dark:bg-slate-900/35">
                      <span className="text-slate-900 dark:text-slate-100">{index + 1}. {p.username}</span>
                      <span className="font-semibold text-sky-700 dark:text-cyan-200">{Number(fromKg(Number(p.total_volume))).toFixed(2)} {unit}</span>
                    </div>
                  ))}
                  {progress.length === 0 && <div className="soft-text">Sin datos de progreso aún.</div>}
                </div>
              </section>
            </aside>
          </section>
        )}

        {mainView === 'stats' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MiniBarChart
              title="Volumen semanal"
              subtitle="Comparación diaria del volumen total registrado en la última semana."
              valueSuffix=" kg"
              items={analytics.dailyVolumeLast7Days.map((item) => ({ label: item.label, value: item.volume }))}
              emptyLabel="Todavía no hay volumen semanal suficiente para mostrar gráfica."
            />

            <MiniBarChart
              title="Volumen por grupo muscular"
              subtitle="Distribución de todo tu historial filtrado."
              valueSuffix=" kg"
              items={Object.entries(analytics.volumeByMuscle).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))}
              emptyLabel="Aún no hay grupos musculares para analizar."
            />
          </section>
        )}

        {mainView === 'history' && (
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><CalendarDays size={20} />Historial de sesiones</h2>
                <p className="soft-text">Lo dejo aparte para no contaminar la pantalla principal.</p>
              </div>
              <button type="button" className="btn-soft text-sm inline-flex items-center gap-1" onClick={exportHistoryCsv}><Download size={14} />Exportar CSV</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <div className="relative w-full md:w-72">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="field !pl-7" value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Filtrar por rutina o ejercicio" />
              </div>
              <button type="button" className="btn-soft" onClick={() => setHistorySortDesc((v) => !v)}>{historySortDesc ? 'Más reciente' : 'Más antiguo'}</button>
              <span className="tiny-badge">Volumen filtrado (kg): {filteredTotalVolumeKg.toFixed(2)}</span>
            </div>
            {historyCacheNotice && <div className="status-info mb-3">{historyCacheNotice}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Historial de entrenamientos">
                <thead>
                  <tr className="text-left border-b border-slate-600/40">
                    <th className="py-2 text-slate-700 dark:text-slate-200">Fecha</th>
                    <th className="text-slate-700 dark:text-slate-200">Rutina</th>
                    <th className="text-slate-700 dark:text-slate-200">Ejercicio</th>
                    <th className="text-slate-700 dark:text-slate-200">Volumen ({unit})</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHistory.map((h) => (
                    <tr key={h.id} className="border-b border-slate-700/20">
                      <td className="py-2 text-slate-800 dark:text-slate-100">{h.date?.slice(0, 10)}</td>
                      <td className="text-slate-800 dark:text-slate-100">{h.routine_name}</td>
                      <td className="text-slate-800 dark:text-slate-100">{h.exercise_name}</td>
                      <td className="font-semibold text-sky-700 dark:text-cyan-200">{Number(fromKg(Number(h.total_volume))).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {loadingHistory && <div className="soft-text mt-2 inline-flex items-center gap-2"><span className="loader" />Cargando historial...</div>}
              {!loadingHistory && filteredHistory.length === 0 && <div className="soft-text mt-2">Aún no hay entrenamientos registrados para este filtro.</div>}
            </div>
          </section>
        )}

        {libraryOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex justify-end" onClick={() => setLibraryOpen(false)}>
            <div className="h-full w-full max-w-3xl bg-slate-50 dark:bg-slate-950 border-l border-slate-300/40 dark:border-slate-700 p-4 overflow-auto" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Biblioteca</h2>
                  <p className="soft-text">Solo aparece cuando la abres. Menos ruido en la sesión.</p>
                </div>
                <button type="button" className="btn-soft" onClick={() => setLibraryOpen(false)}>Cerrar</button>
              </div>

              <div className="panel p-4 stack-gap mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Buscar ejercicio</h3>
                    <div className="text-sm soft-text">Búsqueda, músculo y detalle en una sola vista.</div>
                  </div>
                  <input className="field md:w-72" value={libraryQuery} onChange={(e) => { setLibraryPage(1); setLibraryOffset(0); setLibraryQuery(e.target.value) }} placeholder="Buscar ejercicio" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {libraryMuscles.map((muscle) => (
                    <button key={muscle} type="button" className={`btn-soft text-xs ${libraryMuscleFilter === muscle ? 'ring-2 ring-cyan-400' : ''}`} onClick={() => { setLibraryPage(1); setLibraryOffset(0); setLibraryMuscleFilter(muscle) }}>
                      {muscle === 'all' ? 'Todos' : muscle}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
                  {librarySlice.map((item) => (
                    <button key={item.id} type="button" className={`w-full text-left border rounded p-3 clickable-row ${selectedLibraryExerciseId === item.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-400/30 dark:border-slate-700'}`} onClick={() => setSelectedLibraryExerciseId(item.id)}>
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-10 rounded overflow-hidden bg-slate-200 dark:bg-slate-800 shrink-0">
                          {item.image_url ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</div>
                          <div className="text-xs soft-text">Principal: {item.primary_muscle || item.muscle_group}</div>
                          <div className="text-xs soft-text line-clamp-1">Secundarios: {item.secondary_muscles || 'N/A'}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                  {loadingLibrary && <div className="soft-text inline-flex items-center gap-2"><span className="loader" />Cargando biblioteca...</div>}
                  {libraryHasMore && <button type="button" className="btn-soft w-full" onClick={() => { setLibraryPage((page) => page + 1); loadExerciseLibrary(false).catch(() => undefined) }}>Cargar más</button>}
                </div>

                <div className="panel p-4 stack-gap">
                  {selectedLibraryExercise ? (
                    <>
                      <div className="w-full aspect-video rounded overflow-hidden bg-slate-200 dark:bg-slate-800">
                        {selectedLibraryExercise.image_url ? <img src={selectedLibraryExercise.image_url} alt={selectedLibraryExercise.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center soft-text">Sin imagen</div>}
                      </div>
                      <div>
                        <h4 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedLibraryExercise.name}</h4>
                        <div className="text-sm soft-text">Principal: {selectedLibraryExercise.primary_muscle || selectedLibraryExercise.muscle_group}</div>
                        <div className="text-sm soft-text">Secundarios: {selectedLibraryExercise.secondary_muscles || 'N/A'}</div>
                        <div className="text-sm soft-text">Plantilla: {selectedLibraryExercise.default_sets} series · {selectedLibraryExercise.default_reps} reps · {selectedLibraryExercise.default_rest_seconds}s</div>
                        {selectedLibraryExercise.notes && <div className="text-sm mt-2">{selectedLibraryExercise.notes}</div>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" onClick={() => addLibraryExerciseToWorkout(selectedLibraryExercise)}>Añadir a sesión</button>
                        {selectedLibraryExercise.video_url && <a className="btn-soft" href={selectedLibraryExercise.video_url} target="_blank" rel="noreferrer">Ver video</a>}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">Selecciona un ejercicio para ver sus detalles.</div>
                  )}
                </div>
              </div>

              <form onSubmit={createCustomExerciseAndAdd} className="panel p-4 stack-gap mt-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Crear ejercicio nuevo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input className="field" placeholder="Nombre" value={newExerciseForm.name} onChange={(e) => setNewExerciseForm((current) => ({ ...current, name: e.target.value }))} />
                  <input className="field" placeholder="Grupo muscular" value={newExerciseForm.muscleGroup} onChange={(e) => setNewExerciseForm((current) => ({ ...current, muscleGroup: e.target.value }))} />
                  <input className="field" type="number" min={1} placeholder="Series" value={newExerciseForm.sets} onChange={(e) => setNewExerciseForm((current) => ({ ...current, sets: Number(e.target.value) }))} />
                  <input className="field" type="number" min={1} placeholder="Reps" value={newExerciseForm.reps} onChange={(e) => setNewExerciseForm((current) => ({ ...current, reps: Number(e.target.value) }))} />
                  <input className="field" type="number" min={0} placeholder="Descanso (s)" value={newExerciseForm.restSeconds} onChange={(e) => setNewExerciseForm((current) => ({ ...current, restSeconds: Number(e.target.value) }))} />
                  <input className="field" placeholder="Notas" value={newExerciseForm.notes} onChange={(e) => setNewExerciseForm((current) => ({ ...current, notes: e.target.value }))} />
                </div>
                <button type="submit" className="btn-primary">Crear y añadir a la sesión</button>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
