'use client'

import { useEffect, useRef, useState } from 'react'
import type { OrderRowView } from '@/application/dto'

export interface CancelOrderDialogProps {
  order: OrderRowView | null
  pending: boolean
  error: string
  onConfirm: (reason: string) => void
  onClose: () => void
}

/**
 * Nativní `<dialog>` ze stejného důvodu jako přihlašovací okno: vykresluje se
 * v top layer, drží fokus a zavírá se Escapem.
 */
export function CancelOrderDialog({
  order,
  pending,
  error,
  onConfirm,
  onClose,
}: CancelOrderDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (order && !dialog.open) {
      setReason('')
      dialog.showModal()
    }
    if (!order && dialog.open) dialog.close()
  }, [order])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="cancel-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="modal__content stack" style={{ gap: 14 }}>
        <h2 id="cancel-dialog-title" className="display h3">
          Zrušit rezervaci {order?.code}
        </h2>

        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
          {order?.customerName} · {order?.itemsLabel}
        </p>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--muted-strong)' }}>
          Zákazník dostane omluvný e-mail s důvodem, který napíšete. Brambory se vrátí
          zpět do nabídky.
        </p>

        <label className="field">
          Důvod zrušení
          <textarea
            className="textarea"
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Kroupy zničily úrodu, omlouváme se…"
            autoFocus
          />
        </label>

        {error ? (
          <p className="alert alert--error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ flex: 1 }}
            onClick={onClose}
            disabled={pending}
          >
            Zpět
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ flex: 1, background: 'var(--clay)' }}
            onClick={() => onConfirm(reason)}
            disabled={pending || reason.trim().length === 0}
          >
            {pending ? 'Ruším…' : 'Zrušit a odeslat e-mail'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
