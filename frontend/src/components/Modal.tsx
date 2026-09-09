import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  /** `panel` centra un diálogo; `drawer` entra desde la derecha (biblioteca). */
  variant?: 'panel' | 'drawer'
  maxWidth?: string
}

/**
 * Diálogo accesible: cierra con Escape, atrapa el foco dentro mientras está
 * abierto y lo devuelve al elemento que lo abrió. Los antiguos "modales" eran
 * divs sueltos sin nada de esto: con teclado se navegaba por detrás del overlay.
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'panel',
  maxWidth = '42rem',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusables = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => element.offsetParent !== null)

    focusables()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const isDrawer = variant === 'drawer'

  return (
    <div
      className={`fixed inset-0 z-[60] bg-slate-950/55 backdrop-blur-sm flex ${
        isDrawer ? 'justify-end' : 'items-center justify-center p-4'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={description ? 'modal-description' : undefined}
        className={`animate-in flex flex-col ${isDrawer ? 'h-full w-full' : 'max-h-[88vh] w-full rounded-xl'}`}
        style={{
          maxWidth: isDrawer ? '56rem' : maxWidth,
          background: 'var(--panel)',
          borderLeft: isDrawer ? '1px solid var(--line)' : undefined,
          border: isDrawer ? undefined : '1px solid var(--line)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-5 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="min-w-0">
            <h2 id="modal-title" className="text-xl font-semibold">
              {title}
            </h2>
            {description && (
              <p id="modal-description" className="section-subtitle mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>

        {footer && (
          <footer
            className="flex flex-wrap justify-end gap-2 px-5 py-3"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
