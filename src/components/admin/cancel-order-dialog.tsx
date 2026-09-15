'use client'

import { useEffect, useRef, useState } from 'react'
import type { OrderRowView } from '@/application/dto'

export interface CancelOrderDialogProps {
  readonly order: OrderRowView | null
  readonly pending: boolean
  readonly error: string
  readonly onConfirm: (reason: string) => void
  readonly onClose: () => void
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
      className="modal modal--wide"
      aria-labelledby="cancel-dialog-title"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
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
            maxLength={1000}
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
            style={{ flex: 1, whiteSpace: 'nowrap' }}
            onClick={onClose}
            disabled={pending}
          >
            Zpět
          </button>
          <button
            type="button"
            className="btn btn--primary"
            style={{ flex: 1, background: 'var(--clay)', whiteSpace: 'nowrap' }}
            onClick={() => onConfirm(reason)}
            disabled={pending || reason.trim().length < 3}
          >
            {/* Krátký popisek: že zákazníkovi odejde e-mail, říká text nad formulářem. */}
            {pending ? 'Ruším…' : 'Zrušit rezervaci'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
