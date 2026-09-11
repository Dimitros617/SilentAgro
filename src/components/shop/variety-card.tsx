'use client'

import { useState } from 'react'
import type { VarietyView } from '@/application/dto'
import { useCart } from '@/components/cart/cart-provider'
import { useToast } from '@/components/layout/toast'

const STEP = 0.5
const DEFAULT_QUANTITY = 5

const toStep = (value: number) => Math.round(value * 2) / 2

const formatQuantity = (value: number) => String(value).replace('.', ',')

export function VarietyCard({ variety }: { variety: VarietyView }) {
  // Výchozích 5 kg se ořízne na sklad, aby nešlo odeslat víc, než je k dispozici.
  const [quantity, setQuantity] = useState(() => Math.min(DEFAULT_QUANTITY, variety.stockKg))
  const { dispatch } = useCart()
  const { show } = useToast()

  const clamp = (value: number) => Math.max(0, Math.min(variety.stockKg, toStep(value)))

  const add = () => {
    if (quantity < STEP) return
    dispatch({ type: 'add', varietyId: variety.id, quantityKg: quantity })
    show(`${variety.name} ${formatQuantity(quantity)} kg přidáno do košíku`)
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
          <span style={{ fontWeight: 600 }} data-testid={`stock-${variety.slug}`}>
            {variety.stockLabel}
          </span>
        </div>
        <div className="meter">
          <div
            className="meter__fill"
            style={{ width: `${variety.fillPercent}%`, background: variety.colorHex }}
          />
        </div>
      </div>

      {variety.available ? (
        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <div className="stepper">
            <button
              type="button"
              className="stepper__btn"
              onClick={() => setQuantity((value) => clamp(value - STEP))}
              disabled={quantity <= 0}
              aria-label={`Ubrat půl kilogramu ${variety.name}`}
            >
              −
            </button>
            <input
              className="stepper__input"
              value={formatQuantity(quantity)}
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
              disabled={quantity >= variety.stockKg}
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
            disabled={quantity < STEP}
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
