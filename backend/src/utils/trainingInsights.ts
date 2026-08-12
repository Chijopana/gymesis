export type TrainingHistoryEntry = {
  date: string
  total_volume: number | string
  exercise_name?: string
  routine_name?: string
}

export type TrainingInsights = {
  totalSessions: number
  currentStreakDays: number
  daysSinceLastSession: number
  volumeLast7DaysKg: number
  volumePrevious7DaysKg: number
  weeklyTrendPercent: number
  predictedNextWeekVolumeKg: number
  predictedNextSessionVolumeKg: number
  confidence: 'low' | 'medium' | 'high'
  momentum: 'up' | 'stable' | 'down'
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setUTCHours(0, 0, 0, 0)
  return value
}

function addDays(date: Date, amount: number) {
  const value = new Date(date)
  value.setUTCDate(value.getUTCDate() + amount)
  return value
}

function toDate(value: string) {
  return new Date(value)
}

function toVolume(value: number | string) {
  return Number(value || 0)
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

export function buildTrainingInsights(history: TrainingHistoryEntry[], referenceDate = new Date()): TrainingInsights {
  const ordered = [...history].sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime())
  const now = startOfDay(referenceDate)
  const sessionDays = new Set(ordered.map((entry) => dayKey(startOfDay(toDate(entry.date)))))

  const totalSessions = ordered.length

  const volumeForRange = (fromOffsetDays: number, toOffsetDays: number) => {
    const from = startOfDay(addDays(now, fromOffsetDays)).getTime()
    const to = startOfDay(addDays(now, toOffsetDays + 1)).getTime()
    return ordered
      .filter((entry) => {
        const time = startOfDay(toDate(entry.date)).getTime()
        return time >= from && time < to
      })
      .reduce((acc, entry) => acc + toVolume(entry.total_volume), 0)
  }

  const volumeLast7DaysKg = volumeForRange(-6, 0)
  const volumePrevious7DaysKg = volumeForRange(-13, -7)
  const weeklyTrendPercent = volumePrevious7DaysKg > 0
    ? ((volumeLast7DaysKg - volumePrevious7DaysKg) / volumePrevious7DaysKg) * 100
    : volumeLast7DaysKg > 0
      ? 100
      : 0

  const weeklyVolumes = [
    volumeForRange(-27, -21),
    volumeForRange(-20, -14),
    volumeForRange(-13, -7),
    volumeForRange(-6, 0),
  ]

  const weightedVolumes = weeklyVolumes
    .map((volume, index) => ({ volume, weight: index + 1 }))
    .filter((item) => item.volume > 0)

  const predictedNextWeekVolumeKg = weightedVolumes.length > 0
    ? weightedVolumes.reduce((acc, item) => acc + item.volume * item.weight, 0) /
      weightedVolumes.reduce((acc, item) => acc + item.weight, 0)
    : average(ordered.slice(-3).map((entry) => toVolume(entry.total_volume)))

  const predictedNextSessionVolumeKg = average(ordered.slice(-3).map((entry) => toVolume(entry.total_volume)))

  const latestSession = ordered[ordered.length - 1]
  let currentStreakDays = 0
  if (latestSession) {
    let cursor = startOfDay(toDate(latestSession.date))
    while (sessionDays.has(dayKey(cursor))) {
      currentStreakDays += 1
      cursor = addDays(cursor, -1)
    }
  }

  const daysSinceLastSession = latestSession
    ? Math.max(0, Math.round((now.getTime() - startOfDay(toDate(latestSession.date)).getTime()) / (24 * 60 * 60 * 1000)))
    : 0

  const confidence: TrainingInsights['confidence'] = totalSessions >= 10 ? 'high' : totalSessions >= 4 ? 'medium' : 'low'
  const momentum: TrainingInsights['momentum'] = weeklyTrendPercent > 8 ? 'up' : weeklyTrendPercent < -8 ? 'down' : 'stable'

  return {
    totalSessions,
    currentStreakDays,
    daysSinceLastSession,
    volumeLast7DaysKg,
    volumePrevious7DaysKg,
    weeklyTrendPercent,
    predictedNextWeekVolumeKg,
    predictedNextSessionVolumeKg,
    confidence,
    momentum,
  }
}