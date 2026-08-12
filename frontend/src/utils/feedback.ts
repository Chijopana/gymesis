export type FeedbackKind = 'success' | 'error' | 'warning' | 'info'

export type FeedbackPayload = {
  id?: string
  kind: FeedbackKind
  title: string
  message?: string
  durationMs?: number
}

const FEEDBACK_EVENT = 'gymesis-feedback'

export function emitFeedback(payload: FeedbackPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FEEDBACK_EVENT, { detail: payload }))
}

export function listenFeedback(handler: (payload: FeedbackPayload) => void) {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<FeedbackPayload>
    handler(customEvent.detail)
  }
  window.addEventListener(FEEDBACK_EVENT, listener)
  return () => window.removeEventListener(FEEDBACK_EVENT, listener)
}
