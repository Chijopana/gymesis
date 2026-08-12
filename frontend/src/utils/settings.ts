type TrainingSettings = {
  unit: 'kg' | 'lb'
  restTimeSeconds: number
}

type ReminderSettings = {
  enabled: boolean
  minutes: number
  message: string
}

type VisualSettings = {
  compactMode: boolean
  showTips: boolean
  showReadinessScore: boolean
  defaultDashboardView: 'overview' | 'insights' | 'actions'
}

const TRAINING_SETTINGS_KEY = 'gymesis:training:settings:v1'
const DASHBOARD_AUTO_REFRESH_KEY = 'gymesis:dashboard:auto-refresh:v1'
const REMINDER_SETTINGS_KEY = 'gymesis:reminder:settings:v1'
const VISUAL_SETTINGS_KEY = 'gymesis:visual:settings:v1'

const defaultTrainingSettings: TrainingSettings = {
  unit: 'kg',
  restTimeSeconds: 90,
}

export function getTrainingSettings(): TrainingSettings {
  try {
    const raw = localStorage.getItem(TRAINING_SETTINGS_KEY)
    if (!raw) return defaultTrainingSettings
    const parsed = JSON.parse(raw) as Partial<TrainingSettings>
    return {
      unit: parsed.unit === 'lb' ? 'lb' : 'kg',
      restTimeSeconds:
        typeof parsed.restTimeSeconds === 'number' && parsed.restTimeSeconds > 0 && parsed.restTimeSeconds <= 600
          ? parsed.restTimeSeconds
          : defaultTrainingSettings.restTimeSeconds,
    }
  } catch {
    return defaultTrainingSettings
  }
}

export function saveTrainingSettings(settings: TrainingSettings) {
  localStorage.setItem(TRAINING_SETTINGS_KEY, JSON.stringify(settings))
}

export function getDashboardAutoRefresh() {
  const raw = localStorage.getItem(DASHBOARD_AUTO_REFRESH_KEY)
  if (raw === 'false') return false
  return true
}

export function saveDashboardAutoRefresh(value: boolean) {
  localStorage.setItem(DASHBOARD_AUTO_REFRESH_KEY, String(value))
}

const defaultReminderSettings: ReminderSettings = {
  enabled: false,
  minutes: 30,
  message: 'Revisa tus pendientes de Gymesis.',
}

export function getReminderSettings(): ReminderSettings {
  try {
    const raw = localStorage.getItem(REMINDER_SETTINGS_KEY)
    if (!raw) return defaultReminderSettings
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>
    return {
      enabled: Boolean(parsed.enabled),
      minutes:
        typeof parsed.minutes === 'number' && parsed.minutes > 0 && parsed.minutes <= 480
          ? parsed.minutes
          : defaultReminderSettings.minutes,
      message: typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message : defaultReminderSettings.message,
    }
  } catch {
    return defaultReminderSettings
  }
}

export function saveReminderSettings(settings: ReminderSettings) {
  localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings))
}

const defaultVisualSettings: VisualSettings = {
  compactMode: false,
  showTips: true,
  showReadinessScore: true,
  defaultDashboardView: 'overview',
}

export function getVisualSettings(): VisualSettings {
  try {
    const raw = localStorage.getItem(VISUAL_SETTINGS_KEY)
    if (!raw) return defaultVisualSettings
    const parsed = JSON.parse(raw) as Partial<VisualSettings>
    const defaultView = parsed.defaultDashboardView
    return {
      compactMode: Boolean(parsed.compactMode),
      showTips: parsed.showTips !== false,
      showReadinessScore: parsed.showReadinessScore !== false,
      defaultDashboardView: defaultView === 'insights' || defaultView === 'actions' ? defaultView : 'overview',
    }
  } catch {
    return defaultVisualSettings
  }
}

export function saveVisualSettings(settings: VisualSettings) {
  localStorage.setItem(VISUAL_SETTINGS_KEY, JSON.stringify(settings))
}
