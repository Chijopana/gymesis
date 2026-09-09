import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react'
import { listenFeedback, type FeedbackPayload } from '../utils/feedback'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
}

const TONE_VAR = {
  success: '--success',
  error: '--danger',
  warning: '--warning',
  info: '--info',
} as const

const MAX_VISIBLE = 4

export default function GlobalFeedbackHost() {
  const [items, setItems] = useState<FeedbackPayload[]>([])

  const dismiss = useCallback((id?: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const timers = new Set<number>()

    const unsubscribe = listenFeedback((payload) => {
      const id = payload.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setItems((current) => [{ ...payload, id }, ...current].slice(0, MAX_VISIBLE))

      // Los errores se quedan hasta que se cierran: desaparecer solos hace que
      // se pierda justo el mensaje que hacia falta leer.
      if (payload.kind === 'error') return

      const timer = window.setTimeout(() => dismiss(id), payload.durationMs ?? 3600)
      timers.add(timer)
    })

    return () => {
      unsubscribe()
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [dismiss])

  if (items.length === 0) return null

  return (
    <div
      className="fixed right-4 top-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2"
      role="region"
      aria-label="Notificaciones"
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind]
        const tone = `var(${TONE_VAR[item.kind]})`
        return (
          <div
            key={item.id}
            className="animate-in flex items-start gap-3 rounded-lg p-3.5"
            style={{
              background: 'var(--panel)',
              border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
              borderLeft: `3px solid ${tone}`,
              boxShadow: 'var(--shadow-lg)',
            }}
            role={item.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon size={18} className="mt-0.5 shrink-0" style={{ color: tone }} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight">{item.title}</div>
              {item.message && <div className="soft-text mt-1 text-sm leading-snug">{item.message}</div>}
            </div>
            <button
              type="button"
              className="btn-ghost btn-xs shrink-0"
              onClick={() => dismiss(item.id)}
              aria-label="Cerrar aviso"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
