'use client'

import { useState, useTransition } from 'react'
import { advanceOrderStatusAction, setOrderPaidAction } from '@/app/actions/admin'
import type { OrderRowView } from '@/application/dto'
import { useToast } from '@/components/layout/toast'
import { OrderStatus } from '@/domain/enums'

const STATUS_CLASS: Record<OrderStatus, string> = {
  [OrderStatus.NEW]: 'status-btn status-btn--new',
  [OrderStatus.READY]: 'status-btn status-btn--ready',
  [OrderStatus.COLLECTED]: 'status-btn',
}

function OrderRow({ initial }: { initial: OrderRowView }) {
  const [row, setRow] = useState(initial)
  const [pending, startTransition] = useTransition()
  const { show } = useToast()

  const advance = () => {
    startTransition(async () => {
      const result = await advanceOrderStatusAction(row.id)
      if (result.ok) setRow(result.value)
      else show(result.error)
    })
  }

  const togglePaid = (paid: boolean) => {
    const previous = { isPaid: row.isPaid, paidAtLabel: row.paidAtLabel }
    // Optimistické překreslení: zaškrtávátko musí reagovat hned, ale při chybě
    // se vrátí zpět. Bez návratu by tvrdilo „zaplaceno“ i po neúspěšném zápisu
    // a farmář by vydal brambory za nic.
    setRow((current) => ({ ...current, isPaid: paid, paidAtLabel: paid ? '…' : null }))

    startTransition(async () => {
      const result = await setOrderPaidAction(row.id, paid)
      if (result.ok) {
        setRow((current) => ({ ...current, ...result.value }))
      } else {
        setRow((current) => ({ ...current, ...previous }))
        show(result.error)
      }
    })
  }

  return (
    <div className="orders-row">
      <span className="orders-row__code">{row.code}</span>

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
      </div>

      <span className="display" style={{ fontWeight: 700, fontSize: 17 }}>
        {row.totalLabel}
      </span>

      <div>
        {row.requiresTransfer ? (
          <>
            <label className="paid">
              <input
                type="checkbox"
                checked={row.isPaid}
                disabled={pending}
                onChange={(event) => togglePaid(event.target.checked)}
              />
              <span>Zaplaceno</span>
            </label>
            {row.isPaid && row.paidAtLabel ? (
              <small className="muted" style={{ display: 'block', marginTop: 2 }}>
                {row.paidAtLabel}
              </small>
            ) : null}
          </>
        ) : (
          <span className="muted">hotově</span>
        )}
      </div>

      <button type="button" className={STATUS_CLASS[row.status]} onClick={advance} disabled={pending}>
        {row.statusLabel}
      </button>
    </div>
  )
}

export function OrdersTable({ orders }: { orders: OrderRowView[] }) {
  if (orders.length === 0) {
    return (
      <div className="card card--dashed">
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Zatím žádné objednávky</p>
      </div>
    )
  }

  return (
    <div className="card card--flush">
      {orders.map((order) => (
        <OrderRow key={order.id} initial={order} />
      ))}
    </div>
  )
}
