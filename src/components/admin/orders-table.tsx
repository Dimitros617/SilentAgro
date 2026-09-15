'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  advanceOrderStatusAction,
  cancelOrderAction,
  setOrderPaidAction,
} from '@/app/actions/admin'
import type { OrderRowView } from '@/application/dto'
import { useToast } from '@/components/layout/toast'
import { OrderStatus } from '@/domain/enums'
import { CancelOrderDialog } from './cancel-order-dialog'

/** Inline SVG, ne ikonová knihovna — jedna ikona nestojí za další závislost. */
function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6M10 11v6M14 11v6" />
    </svg>
  )
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  [OrderStatus.NEW]: 'status-btn status-btn--new',
  [OrderStatus.READY]: 'status-btn status-btn--ready',
  [OrderStatus.COLLECTED]: 'status-btn',
}

function PaymentControl({
  row,
  pending,
  onToggle,
}: {
  readonly row: OrderRowView
  readonly pending: boolean
  readonly onToggle: (paid: boolean) => void
}): ReactNode {
  if (row.isCancelled) return <span className="muted">—</span>
  if (!row.requiresTransfer) return <span className="muted">hotově</span>
  return (
    <>
      <label className="paid">
        <input type="checkbox" checked={row.isPaid} disabled={pending} onChange={(event) => onToggle(event.target.checked)} />
        <span>Zaplaceno</span>
      </label>
      {row.isPaid && row.paidAtLabel ? <small className="muted" style={{ display: 'block', marginTop: 2 }}>{row.paidAtLabel}</small> : null}
    </>
  )
}

function OrderRow({
  row,
  onCancelRequest,
}: Readonly<{
  row: OrderRowView
  onCancelRequest: (order: OrderRowView) => void
}>) {
  const [pending, setPending] = useState(false)
  const { show } = useToast()

  const advance = async () => {
    setPending(true)
    try {
      const result = await advanceOrderStatusAction(row.id, row.status)
      if (!result.ok) show(result.error)
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte přehled a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  const togglePaid = async (paid: boolean) => {
    setPending(true)
    try {
      const result = await setOrderPaidAction(row.id, paid)
      if (!result.ok) show(result.error)
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte přehled a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="orders-row" data-cancelled={row.isCancelled ? 'true' : undefined}>
      <div>
        <span className="orders-row__code">{row.code}</span>
        {row.isCancelled ? (
          <div>
            <span className="badge badge--clay">
              Zrušeno
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <div style={{ fontWeight: 600 }}>{row.customerName}</div>
        <div className="muted">{row.customerEmail}</div>
        {row.customerPhone ? <div className="muted">{row.customerPhone}</div> : null}
      </div>

      <div style={{ fontSize: 14, color: 'var(--muted-strong)' }}>
        {row.itemsLabel}
        <div className="muted" style={{ marginTop: 2 }}>
          {row.deliveryLabel} · {row.paymentLabel}
        </div>
        {row.note ? (
          <div className="muted" style={{ marginTop: 4, fontStyle: 'italic' }}>
            „{row.note}“
          </div>
        ) : null}
        {row.isCancelled && row.cancellationReason ? (
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--clay)' }}>
            Zrušeno {row.cancelledAtLabel}: {row.cancellationReason}
          </div>
        ) : null}
      </div>

      <span className="display" style={{ fontWeight: 700, fontSize: 17 }}>
        {row.totalLabel}
      </span>

      <div><PaymentControl row={row} pending={pending} onToggle={(paid) => void togglePaid(paid)} /></div>

      <div className="orders-row__actions">
        <button
          type="button"
          className={STATUS_CLASS[row.status]}
          onClick={() => void advance()}
          disabled={pending || row.isCancelled}
          title={row.isCancelled ? 'Zrušená objednávka se už neposouvá' : undefined}
        >
          {row.statusLabel}
        </button>

        {row.isCancelled ? null : (
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => onCancelRequest(row)}
            disabled={pending}
            // Jen ikona: se stavem „Připravena“ se dvě textová tlačítka do sloupce nevejdou.
            // Popisek nese `aria-label` pro odečítač a `title` pro myš.
            aria-label={`Zrušit rezervaci ${row.code}`}
            title={`Zrušit rezervaci ${row.code}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  )
}

export function OrdersTable({ orders }: Readonly<{ orders: OrderRowView[] }>) {
  const { show } = useToast()
  const [targetId, setTargetId] = useState<number | null>(null)
  const target = orders.find((order) => order.id === targetId) ?? null
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const confirm = async (reason: string) => {
    if (!target) return

    setPending(true)
    setError('')
    try {
      const result = await cancelOrderAction(target.id, reason)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setTargetId(null)
      show(`Rezervace ${result.value.code} zrušena`)
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte přehled a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="card card--dashed">
        <p className="empty-title">Zatím žádné objednávky</p>
      </div>
    )
  }

  return (
    <>
      <div className="card card--flush">
        {orders.map((order) => (
          <OrderRow
            key={order.id}
            row={order}
            onCancelRequest={(row) => {
              setError('')
              setTargetId(row.id)
            }}
          />
        ))}
      </div>

      <CancelOrderDialog
        order={target}
        pending={pending}
        error={error}
        onConfirm={(reason) => void confirm(reason)}
        onClose={() => {
          if (!pending) setTargetId(null)
        }}
      />
    </>
  )
}
