import { useEffect, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'
import { listenFeedback, type FeedbackPayload } from '../utils/feedback'

const iconByKind = {
  success: CheckCircle2,
  error: XCircle,
  warning: TriangleAlert,
  info: Info,
}

const styleByKind = {
  success: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100',
  error: 'border-rose-400/40 bg-rose-500/15 text-rose-950 dark:text-rose-100',
  warning: 'border-amber-400/40 bg-amber-500/15 text-amber-950 dark:text-amber-100',
  info: 'border-sky-400/40 bg-sky-500/15 text-sky-950 dark:text-sky-100',
}

export default function GlobalFeedbackHost() {
  const [items, setItems] = useState<FeedbackPayload[]>([])

  useEffect(() => {
    return listenFeedback((payload) => {
      const id = payload.id || `${Date.now()}-${Math.random()}`
      const entry = { ...payload, id }
      setItems((current) => [entry, ...current].slice(0, 3))
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id))
      }, payload.durationMs ?? 3200)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[70] flex w-[min(92vw,340px)] flex-col gap-2 pointer-events-none">
      {items.map((item) => {
        const Icon = iconByKind[item.kind]
        return (
          <div key={item.id} className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${styleByKind[item.kind]}`}>
            <div className="flex items-start gap-3">
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{item.title}</div>
                {item.message && <div className="mt-1 text-sm opacity-90">{item.message}</div>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
