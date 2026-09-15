'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useReservation } from './use-reservation'
import { ReservationRecovery } from './reservation-recovery'
import type { VarietyView } from '@/application/dto'
import { formatCzkPerKg as formatCzk, formatKg } from '@/shared/format'
import { summarizeCheckout } from './checkout-summary'
import { useCart } from '@/components/cart/cart-provider'
import {
  type CheckoutErrors,
  type CheckoutForm,
  hasErrors,
  validateCheckout,
} from '@/components/cart/checkout-validation'
import {
  DELIVERY_LABELS,
  DeliveryMethod,
  PAYMENT_LABELS,
  PaymentMethod,
} from '@/domain/enums'

export interface CheckoutPolicy {
  feeCzk: number
  freeAboveCzk: number
  holdDays: number
}

export function Checkout({
  varieties,
  policy,
}: {
  readonly varieties: VarietyView[]
  readonly policy: CheckoutPolicy
}) {
  const { lines, dispatch } = useCart()
  const { attempt, restored, pending, serverError, reserve, startNewReservation } = useReservation()
  const [errors, setErrors] = useState<CheckoutErrors>({})

  const [form, setForm] = useState<CheckoutForm>({
    name: '',
    email: '',
    phone: '',
    note: '',
    delivery: DeliveryMethod.PICKUP,
    payment: PaymentMethod.QR_CODE,
  })

  // Klient a server sdílejí pravidla zaokrouhlení i dopravy. Server stále určuje ceny.
  const { rows, unavailableLines, subtotal, totalKg, deliveryFee, total } =
    summarizeCheckout(lines, varieties, form.delivery, policy)

  const update = (patch: Partial<CheckoutForm>) => setForm((current) => ({ ...current, ...patch }))

  async function submit(): Promise<void> {
    if (!restored || pending) return
    if (!attempt) {
      const found = validateCheckout(form)
      setErrors(found)
      if (hasErrors(found) || unavailableLines.length > 0) return
    }
    await reserve(form, lines)
  }

  if (attempt) {
    return (
      <ReservationRecovery
        attempt={attempt}
        pending={pending}
        error={serverError}
        onContinue={() => void submit()}
        onStartNew={startNewReservation}
      />
    )
  }

  if (lines.length === 0) {
    return (
      <div className="card card--dashed">
        <p className="empty-title">Košík je zatím prázdný</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Vyberte si odrůdu v burze.
        </p>
        <Link href="/burza" className="btn btn--primary" style={{ marginTop: 20 }}>
          Do burzy
        </Link>
      </div>
    )
  }

  return (
    <div className="cart">
      <div className="stack" style={{ gap: 16 }}>
        {unavailableLines.map((line) => (
          <div key={line.varietyId} className="alert alert--error">
            Odrůda z uloženého košíku už není v nabídce.
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => dispatch({ type: 'remove', varietyId: line.varietyId })}
            >
              Odebrat nedostupnou odrůdu
            </button>
          </div>
        ))}
        <div className="card card--flush">
          {rows.map(({ line, variety, total }) => (
            <div key={line.varietyId} className="cart__line">
              <span className="cart__bar" style={{ background: variety.colorHex }} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{variety.name}</div>
                <div className="muted">
                  {variety.priceLabel}/kg · {formatKg({ value: line.quantityKg })}
                </div>
              </div>
              <div className="display" style={{ fontWeight: 700, fontSize: 18 }}>
                {formatCzk(total)}
              </div>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => dispatch({ type: 'remove', varietyId: line.varietyId })}
                aria-label={`Odebrat ${variety.name} z košíku`}
              >
                odebrat
              </button>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ gap: 16 }}>
          <h2 className="display h3">Kontakt</h2>
          <div className="form-grid">
            <label className="field">
              Jméno a příjmení
              <input
                className={errors.name ? 'input input--error' : 'input'}
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Jan Novák"
                autoComplete="name"
              />
              {errors.name ? <span className="error-text">{errors.name}</span> : null}
            </label>

            <label className="field">
              Telefon
              <input
                className={errors.phone ? 'input input--error' : 'input'}
                value={form.phone}
                onChange={(event) => update({ phone: event.target.value })}
                placeholder="+420 123 456 789"
                autoComplete="tel"
              />
              {errors.phone ? <span className="error-text">{errors.phone}</span> : null}
            </label>

            <label className="field field--span2">
              E-mail (sem přijde potvrzení)
              <input
                className={errors.email ? 'input input--error' : 'input'}
                value={form.email}
                onChange={(event) => update({ email: event.target.value })}
                placeholder="jan@email.cz"
                autoComplete="email"
                type="email"
              />
              {errors.email ? <span className="error-text">{errors.email}</span> : null}
            </label>
          </div>

          <h2 className="display h3">Převzetí</h2>
          <div className="chip-row">
            {Object.values(DeliveryMethod).map((method) => (
              <button
                key={method}
                type="button"
                className="chip"
                aria-pressed={form.delivery === method}
                onClick={() => update({ delivery: method })}
              >
                {DELIVERY_LABELS[method]}
              </button>
            ))}
          </div>

          <h2 className="display h3">Platba</h2>
          <div className="chip-row">
            {Object.values(PaymentMethod).map((method) => (
              <button
                key={method}
                type="button"
                className="chip"
                aria-pressed={form.payment === method}
                onClick={() => update({ payment: method })}
              >
                {PAYMENT_LABELS[method]}
              </button>
            ))}
          </div>

          <label className="field">
            Poznámka pro farmáře
            <textarea
              className="textarea"
              rows={2}
              value={form.note}
              onChange={(event) => update({ note: event.target.value })}
              placeholder="Přijedu v sobotu dopoledne…"
            />
          </label>
        </div>
      </div>

      <div className="card card--ink summary">
        <h2 className="display h3">Souhrn</h2>
        <div className="summary__row" style={{ marginTop: 18 }}>
          <span>Brambory</span>
          <span>{formatCzk(subtotal)}</span>
        </div>
        <div className="summary__row">
          <span>
            {form.delivery === DeliveryMethod.LOCAL_DELIVERY ? 'Rozvoz' : 'Osobní odběr'}
          </span>
          <span>{deliveryFee.isZero() ? 'zdarma' : formatCzk(deliveryFee)}</span>
        </div>
        <hr className="rule" />
        <div className="summary__total">
          <span style={{ fontWeight: 600 }}>Celkem</span>
          <span className="summary__amount">{formatCzk(total)}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6 }}>
          {formatKg(totalKg)} celkem · {PAYMENT_LABELS[form.payment]}
        </p>

        {serverError ? (
          <p className="alert alert--error" role="alert" style={{ marginTop: 14 }}>
            {serverError}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn--gold btn--block btn--lg"
          style={{ marginTop: 20 }}
          onClick={() => void submit()}
          disabled={pending || unavailableLines.length > 0}
        >
          {pending ? 'Rezervuji…' : 'Závazně rezervovat'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 12, lineHeight: 1.5 }}>
          Potvrzení dorazí vám i farmáři e-mailem. Zboží držíme {policy.holdDays} dní.
        </p>
      </div>
    </div>
  )
}
