export type HistoryEntry = {
  id: string
  date: string
  routine_name: string
  exercise_name: string
  muscle_group?: string | null
  total_volume: string | number
}

export type WorkoutAnalytics = {
  totalSessions: number
  sessionsLast7Days: number
  trainingDaysLast7Days: number
  totalVolumeKg: number
  volumeLast7DaysKg: number
  averageVolumePerSessionKg: number
  bestSessionVolumeKg: number
  volumeByMuscle: Record<string, number>
  dailyVolumeLast7Days: Array<{ label: string; volume: number; date: string }>
  achievements: string[]
}

/** Sólo para historiales antiguos en los que no se guardó el grupo muscular. */
const MUSCLE_KEYWORDS: Array<{ key: string; words: string[] }> = [
  { key: 'Pecho', words: ['press banca', 'pecho', 'inclinado', 'apertura', 'fondo', 'push up'] },
  { key: 'Espalda', words: ['remo', 'jalon', 'jalón', 'dominada', 'espalda', 'pull over'] },
  { key: 'Pierna', words: ['sentadilla', 'prensa', 'femoral', 'pierna', 'zancada', 'peso muerto', 'gluteo', 'glúteo'] },
  { key: 'Hombros', words: ['hombro', 'militar', 'lateral', 'face pull', 'pike'] },
  { key: 'Brazos', words: ['biceps', 'bíceps', 'triceps', 'tríceps', 'curl', 'extension', 'extensión'] },
  { key: 'Core', words: ['abdominal', 'core', 'plancha', 'crunch', 'hollow'] },
  { key: 'Cardio', words: ['cinta', 'bicicleta', 'sprint', 'comba', 'cardio'] },
]

/**
 * Convierte una fecha del backend a medianoche LOCAL.
 *
 * `new Date('2024-01-29')` la interpreta como UTC: en España eso es el día 29
 * a la 01:00, pero en México es el 28 a las 18:00, así que los entrenos se
 * contaban en el día anterior. Partiendo la cadena se evita esa deriva.
 */
export function parseLocalDate(value: string): Date {
  const dateOnly = String(value).slice(0, 10)
  const [year, month, day] = dateOnly.split('-').map(Number)
  if (!year || !month || !day) return new Date(NaN)
  return new Date(year, month - 1, day)
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function inferMuscle(entry: HistoryEntry): string {
  const stored = entry.muscle_group?.trim()
  if (stored) return stored

  const normalized = (entry.exercise_name || '').toLowerCase()
  return MUSCLE_KEYWORDS.find((row) => row.words.some((word) => normalized.includes(word)))?.key ?? 'Otros'
}

export function computeWorkoutAnalytics(history: HistoryEntry[]): WorkoutAnalytics {
  const today = startOfLocalDay(new Date())
  const weekStart = new Date(today)
  weekStart.setDate(weekStart.getDate() - 6)

  const withDates = history.map((entry) => ({ entry, day: startOfLocalDay(parseLocalDate(entry.date)) }))
  const valid = withDates.filter((row) => !Number.isNaN(row.day.getTime()))

  const totalVolumeKg = valid.reduce((sum, row) => sum + toNumber(row.entry.total_volume), 0)
  const lastWeek = valid.filter((row) => row.day >= weekStart && row.day <= today)
  const volumeLast7DaysKg = lastWeek.reduce((sum, row) => sum + toNumber(row.entry.total_volume), 0)

  const volumeByMuscle = valid.reduce<Record<string, number>>((acc, row) => {
    const muscle = inferMuscle(row.entry)
    acc[muscle] = (acc[muscle] || 0) + toNumber(row.entry.total_volume)
    return acc
  }, {})

  // Volumen por día natural de los últimos 7, incluyendo los días en blanco:
  // un hueco en la gráfica también es información.
  const dailyVolumeLast7Days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    const key = day.getTime()
    const volume = valid
      .filter((row) => row.day.getTime() === key)
      .reduce((sum, row) => sum + toNumber(row.entry.total_volume), 0)

    return {
      label: day.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
      date: day.toISOString().slice(0, 10),
      volume,
    }
  })

  // Volumen por sesión = por día, no por registro: un día con 6 ejercicios es
  // una sesión, no seis.
  const volumeByDay = valid.reduce<Record<number, number>>((acc, row) => {
    const key = row.day.getTime()
    acc[key] = (acc[key] || 0) + toNumber(row.entry.total_volume)
    return acc
  }, {})
  const dayTotals = Object.values(volumeByDay)

  const trainingDaysLast7Days = new Set(lastWeek.map((row) => row.day.getTime())).size

  const achievements: string[] = []
  if (dayTotals.length >= 10) achievements.push('Constancia: 10 días de entrenamiento registrados')
  if (totalVolumeKg >= 10000) achievements.push('Volumen total: 10.000 kg acumulados')
  if (trainingDaysLast7Days >= 3) achievements.push('Semana activa: 3+ días entrenados en la última semana')
  if (Object.keys(volumeByMuscle).length >= 4) achievements.push('Equilibrio: 4+ grupos musculares trabajados')
  if (dayTotals.length >= 30) achievements.push('Veterano: 30 días de entrenamiento')

  return {
    totalSessions: dayTotals.length,
    sessionsLast7Days: trainingDaysLast7Days,
    trainingDaysLast7Days,
    totalVolumeKg,
    volumeLast7DaysKg,
    averageVolumePerSessionKg: dayTotals.length > 0 ? totalVolumeKg / dayTotals.length : 0,
    bestSessionVolumeKg: dayTotals.length > 0 ? Math.max(...dayTotals) : 0,
    volumeByMuscle,
    dailyVolumeLast7Days,
    achievements,
  }
}
