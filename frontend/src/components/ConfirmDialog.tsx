import { useCallback, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import Modal from './Modal'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void }

/**
 * Confirmación para acciones destructivas.
 *
 * Antes, borrar una rutina o un ejercicio ocurría al primer clic, sin vuelta
 * atrás y sin avisar. `window.confirm` habría servido, pero bloquea el hilo y
 * se sale del estilo de la app; esto es una promesa que se resuelve al elegir.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve })
      }),
    []
  )

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value)
      setPending(null)
    },
    [pending]
  )

  const dialog = pending ? (
    <Modal
      open
      onClose={() => settle(false)}
      title={pending.title}
      maxWidth="26rem"
      footer={
        <>
          <button type="button" className="btn-soft" onClick={() => settle(false)}>
            {pending.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            className={pending.tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={() => settle(true)}
          >
            {pending.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        {pending.tone === 'danger' && (
          <TriangleAlert size={20} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
        )}
        <p className="soft-text leading-relaxed">{pending.message}</p>
      </div>
    </Modal>
  ) : null

  return { confirm, confirmDialog: dialog }
}
