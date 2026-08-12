export type HistoryEntry = {
  id: string
  date: string
  routine_name: string
  exercise_name: string
  total_volume: string
}

export type WorkoutAnalytics = {
  totalSessions: number
  sessionsLast7Days: number
  totalVolumeKg: number
  volumeLast7DaysKg: number
  averageVolumePerSessionKg: number
  volumeByMuscle: Record<string, number>
  dailyVolumeLast7Days: Array<{ label: string; volume: number }>
  achievements: string[]
}

const muscleKeywords: Array<{ key: string; words: string[] }> = [
  { key: 'Pecho', words: ['press banca', 'pecho', 'inclinado', 'aperturas'] },
  { key: 'Espalda', words: ['remo', 'jalon', 'dominada', 'espalda'] },
  { key: 'Piernas', words: ['sentadilla', 'prensa', 'femoral', 'pierna', 'zancada', 'peso muerto'] },
  { key: 'Hombros', words: ['hombro', 'shoulder', 'press militar', 'laterales'] },
  { key: 'Brazos', words: ['biceps', 'triceps', 'curl', 'extension'] },
  { key: 'Core', words: ['abdominal', 'core', 'plank', 'crunch'] },
]

function toTimestamp(date: string) {
  const value = new Date(date).getTime()
  return Number.isFinite(value) ? value : 0
}

function inferMuscle(exerciseName: string): string {
  const normalized = exerciseName.toLowerCase()
  const found = muscleKeywords.find((row) => row.words.some((word) => normalized.includes(word)))
  return found?.key ?? 'Otros'
}

function getDayLabel(date: Date) {
  return date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
}

export function computeWorkoutAnalytics(history: HistoryEntry[]): WorkoutAnalytics {
  const now = Date.now()
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000

  const totalVolumeKg = history.reduce((acc, item) => acc + Number(item.total_volume || 0), 0)
  const sessionsLast7Days = history.filter((item) => toTimestamp(item.date) >= weekAgo).length
  const volumeLast7DaysKg = history
    .filter((item) => toTimestamp(item.date) >= weekAgo)
    .reduce((acc, item) => acc + Number(item.total_volume || 0), 0)

  const volumeByMuscle = history.reduce<Record<string, number>>((acc, item) => {
    const muscle = inferMuscle(item.exercise_name || '')
    acc[muscle] = (acc[muscle] || 0) + Number(item.total_volume || 0)
    return acc
  }, {})

  const dailyVolumeLast7Days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now - (6 - index) * 24 * 60 * 60 * 1000)
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)
    const total = history
      .filter((item) => {
        const itemTime = toTimestamp(item.date)
        return itemTime >= start.getTime() && itemTime <= end.getTime()
      })
      .reduce((acc, item) => acc + Number(item.total_volume || 0), 0)

    return {
      label: getDayLabel(day),
      volume: total,
    }
  })

  const averageVolumePerSessionKg = history.length > 0 ? totalVolumeKg / history.length : 0

  const achievements: string[] = []
  if (history.length >= 10) achievements.push('Constancia: 10 sesiones registradas')
  if (totalVolumeKg >= 10000) achievements.push('Volumen total: 10,000 kg acumulados')
  if (sessionsLast7Days >= 3) achievements.push('Semana activa: 3+ sesiones en 7 dias')
  if (Object.keys(volumeByMuscle).length >= 4) achievements.push('Balance: 4+ grupos musculares trabajados')

  return {
    totalSessions: history.length,
    sessionsLast7Days,
    totalVolumeKg,
    volumeLast7DaysKg,
    averageVolumePerSessionKg,
    volumeByMuscle,
    dailyVolumeLast7Days,
    achievements,
  }
}
