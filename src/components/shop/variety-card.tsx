'use client'

import { useState } from 'react'
import type { VarietyView } from '@/application/dto'
import { useCart } from '@/components/cart/cart-provider'
import { useToast } from '@/components/layout/toast'
import { meterSegments } from './meter-model'

const STEP = 0.5
const DEFAULT_QUANTITY = 5

const toStep = (value: number) => Math.round(value * 2) / 2

const formatQuantity = (value: number) => String(value).replace('.', ',')

export function VarietyCard({ variety }: { variety: VarietyView }) {
  // Výchozích 5 kg se ořízne na sklad, aby nešlo odeslat víc, než je k dispozici.
  const [quantity, setQuantity] = useState(() => Math.min(DEFAULT_QUANTITY, variety.stockKg))
  const { dispatch, quantityOf } = useCart()
  const { show } = useToast()

  const inCart = quantityOf(variety.id)

  /**
   * Strop je sklad **zmenšený o košík**, ne celý sklad. Reducer množství sčítá,
   * takže dvakrát přidaných pět kilo dá deset — při skladu osmi kilo by košík
   * obsahoval brambory, které neexistují, a odhalil by to až server při odeslání.
   */
  const room = Math.max(0, toStep(variety.stockKg - inCart))

  const clamp = (value: number) => Math.max(0, Math.min(room, toStep(value)))

  /**
   * Košík se načítá z `localStorage` až po prvním vykreslení, takže se zbytek
   * může zmenšit pod hodnotu, kterou má vstup ve stavu. Zobrazuje i odesílá se
   * proto ořezané množství, ne to ve stavu.
   */
  const amount = Math.min(quantity, room)

  /** Kolik ze skladu ubude, když se košík odešle i s právě nastaveným množstvím. */
  const taken = Math.min(inCart + amount, variety.stockKg)

  const segments = meterSegments({
    stockKg: variety.stockKg,
    capacityKg: variety.capacityKg,
    inCartKg: inCart,
    pendingKg: amount,
  })

  const add = () => {
    if (amount < STEP) return
    dispatch({ type: 'add', varietyId: variety.id, quantityKg: amount })
    show(`${variety.name} ${formatQuantity(amount)} kg přidáno do košíku`)
    // Nové výchozí množství proti zbytku, který na odrůdě ještě zůstal.
    setQuantity(Math.min(DEFAULT_QUANTITY, Math.max(0, toStep(room - amount))))
  }

  return (
    <article className="card variety" aria-labelledby={`variety-${variety.id}`}>
      <div className="variety__head">
        <div>
          <div className="variety__name">
            <span className="swatch" style={{ background: variety.colorHex }} aria-hidden="true" />
            <h2 id={`variety-${variety.id}`} className="display h3" style={{ fontSize: 22 }}>
              {variety.name}
            </h2>
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {variety.tag}
          </p>
        </div>
        <div>
          <div className="variety__price">{variety.priceLabel}</div>
          <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
            za kilogram
          </div>
        </div>
      </div>

      <p style={{ margin: 0, color: 'var(--muted-strong)', lineHeight: 1.55, fontSize: 14 }}>
        {variety.description}
      </p>

      <div>
        <div className="row row--between" style={{ fontSize: 13, marginBottom: 6 }}>
          <span className="muted">Na skladě</span>
          <span className="row" style={{ gap: 6 }}>
            <span
              className={taken > 0 ? 'meter__before' : undefined}
              style={{ fontWeight: 600 }}
              data-testid={`stock-${variety.slug}`}
            >
              {variety.stockLabel}
            </span>
            {taken > 0 ? (
              <span className="meter__after" data-testid={`stock-after-${variety.slug}`}>
                → {formatQuantity(toStep(variety.stockKg - taken))} kg
              </span>
            ) : null}
          </span>
        </div>
        <div className="meter">
          <div
            className="meter__fill"
            style={{ width: `${segments.remainingPercent}%`, background: variety.colorHex }}
          />
          {segments.cartPercent > 0 ? (
            <div
              className="meter__fill meter__fill--cart"
              style={{ width: `${segments.cartPercent}%`, background: variety.colorHex }}
            />
          ) : null}
          {segments.pendingPercent > 0 ? (
            <div
              className="meter__fill meter__fill--pending"
              style={{ width: `${segments.pendingPercent}%`, background: variety.colorHex }}
            />
          ) : null}
        </div>
        {inCart > 0 ? (
          <p className="meter__note">
            <span className="meter__key meter__key--cart" style={{ background: variety.colorHex }} />
            {formatQuantity(inCart)} kg máte v košíku
          </p>
        ) : null}
      </div>

      {variety.available ? (
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <div className="stepper">
            <button
              type="button"
              className="stepper__btn"
              onClick={() => setQuantity((value) => clamp(value - STEP))}
              disabled={amount <= 0}
              aria-label={`Ubrat půl kilogramu ${variety.name}`}
            >
              −
            </button>
            <input
              className="stepper__input"
              value={formatQuantity(amount)}
              onChange={(event) =>
                setQuantity(
                  clamp(Number.parseFloat(event.target.value.replace(',', '.')) || 0),
                )
              }
              inputMode="decimal"
              aria-label={`Množství ${variety.name} v kilogramech`}
            />
            <button
              type="button"
              className="stepper__btn"
              onClick={() => setQuantity((value) => clamp(value + STEP))}
              disabled={amount >= room}
              aria-label={`Přidat půl kilogramu ${variety.name}`}
            >
              +
            </button>
          </div>
          <span className="muted">kg</span>
          <button
            type="button"
            className="btn btn--primary"
            style={{ flex: 1 }}
            onClick={add}
            disabled={amount < STEP}
          >
            Rezervovat
          </button>
        </div>
      ) : (
        <p className="soldout">Vyprodáno — čekáme na další výkop</p>
      )}
    </article>
  )
}
