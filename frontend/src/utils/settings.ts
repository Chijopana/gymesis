export type DashboardView = 'overview' | 'insights' | 'actions'

export type TrainingSettings = {
  unit: 'kg' | 'lb'
  restTimeSeconds: number
}

export type ReminderSettings = {
  enabled: boolean
  minutes: number
  message: string
}

export type VisualSettings = {
  compactMode: boolean
  showTips: boolean
  showReadinessScore: boolean
  defaultDashboardView: DashboardView
}

const TRAINING_SETTINGS_KEY = 'gymesis:training:settings:v1'
const DASHBOARD_AUTO_REFRESH_KEY = 'gymesis:dashboard:auto-refresh:v1'
const REMINDER_SETTINGS_KEY = 'gymesis:reminder:settings:v1'
const VISUAL_SETTINGS_KEY = 'gymesis:visual:settings:v1'

/** Lee JSON de localStorage tolerando almacenamiento bloqueado o datos corruptos. */
function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Partial<T>) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* modo incógnito o cuota llena: la preferencia sólo dura esta sesión */
  }
}

const defaultTrainingSettings: TrainingSettings = { unit: 'kg', restTimeSeconds: 90 }

export function getTrainingSettings(): TrainingSettings {
  const parsed = readJson<TrainingSettings>(TRAINING_SETTINGS_KEY)
  if (!parsed) return defaultTrainingSettings

  return {
    unit: parsed.unit === 'lb' ? 'lb' : 'kg',
    restTimeSeconds:
      typeof parsed.restTimeSeconds === 'number' && parsed.restTimeSeconds > 0 && parsed.restTimeSeconds <= 600
        ? parsed.restTimeSeconds
        : defaultTrainingSettings.restTimeSeconds,
  }
}

export function saveTrainingSettings(settings: TrainingSettings) {
  writeJson(TRAINING_SETTINGS_KEY, settings)
}

export function getDashboardAutoRefresh(): boolean {
  try {
    return localStorage.getItem(DASHBOARD_AUTO_REFRESH_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveDashboardAutoRefresh(value: boolean) {
  try {
    localStorage.setItem(DASHBOARD_AUTO_REFRESH_KEY, String(value))
  } catch {
    /* almacenamiento bloqueado */
  }
}

const defaultReminderSettings: ReminderSettings = {
  enabled: false,
  minutes: 30,
  message: 'Revisa tus pendientes de Gymesis.',
}

export function getReminderSettings(): ReminderSettings {
  const parsed = readJson<ReminderSettings>(REMINDER_SETTINGS_KEY)
  if (!parsed) return defaultReminderSettings

  return {
    enabled: Boolean(parsed.enabled),
    minutes:
      typeof parsed.minutes === 'number' && parsed.minutes > 0 && parsed.minutes <= 480
        ? parsed.minutes
        : defaultReminderSettings.minutes,
    message:
      typeof parsed.message === 'string' && parsed.message.trim()
        ? parsed.message.slice(0, 200)
        : defaultReminderSettings.message,
  }
}

export function saveReminderSettings(settings: ReminderSettings) {
  writeJson(REMINDER_SETTINGS_KEY, settings)
}

const defaultVisualSettings: VisualSettings = {
  compactMode: false,
  showTips: true,
  showReadinessScore: true,
  defaultDashboardView: 'overview',
}

export function getVisualSettings(): VisualSettings {
  const parsed = readJson<VisualSettings>(VISUAL_SETTINGS_KEY)
  if (!parsed) return defaultVisualSettings

  const view = parsed.defaultDashboardView
  return {
    compactMode: Boolean(parsed.compactMode),
    showTips: parsed.showTips !== false,
    showReadinessScore: parsed.showReadinessScore !== false,
    defaultDashboardView: view === 'insights' || view === 'actions' ? view : 'overview',
  }
}

export function saveVisualSettings(settings: VisualSettings) {
  writeJson(VISUAL_SETTINGS_KEY, settings)
}
