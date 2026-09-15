'use client'

import { useState } from 'react'
import { useToast } from '@/components/layout/toast'
import { PALETTE, toNumber, type Draft } from './variety-draft'
import { deactivateVarietyAction, upsertVarietyAction } from '@/app/actions/admin'
import type { AdminVarietyView } from '@/application/dto'
import { toDraft } from './variety-draft'

const STOCK_STEP = 5

export function VarietyRow({ initial }: Readonly<{ initial: AdminVarietyView }>) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [expectedStockKg, setExpectedStockKg] = useState(initial.stockKg)
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState(false)
  const { show } = useToast()

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  /** Uložení je vědomý krok, ne auto-save — jinak by každý stisk klávesy šel na server. */
  const save = async () => {
    setPending(true)
    try {
      const result = await upsertVarietyAction({
        id: initial.id,
        expectedStockKg,
        name: draft.name,
        tag: draft.tag,
        description: draft.description,
        colorHex: draft.colorHex,
        priceCzk: toNumber(draft.priceCzk),
        stockKg: toNumber(draft.stockKg),
        capacityKg: toNumber(draft.capacityKg),
      })
      if (result.ok) {
        setExpectedStockKg(result.value.stockKg)
        setDraft(toDraft(result.value))
        show(`${result.value.name} uloženo`)
      } else {
        show(result.error)
      }
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte sklad a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  const remove = async () => {
    setPending(true)
    try {
      const result = await deactivateVarietyAction(initial.id)
      if (result.ok) {
        show(`${initial.name} stažena z burzy`)
      } else {
        show(result.error)
      }
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte sklad a ověřte výsledek.')
    } finally {
      setPending(false)
    }
  }

  const shiftStock = (delta: number) =>
    update({ stockKg: String(Math.max(0, toNumber(draft.stockKg) + delta)) })

  return (
    <div className="admin-row">
      <div className="admin-row__grid">
        <div className="row" style={{ alignItems: 'flex-end', gap: 10, flexWrap: 'nowrap' }}>
          <span
            className="swatch"
            style={{ background: draft.colorHex, marginBottom: 13 }}
            aria-hidden="true"
          />
          <label style={{ flex: 1 }}>
            <span className="admin-label">Název odrůdy</span>
            <input
              className="input input--sm"
              style={{ fontWeight: 600, fontSize: 16 }}
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>
        </div>

        <div>
          <span className="admin-label">Sklad (kg)</span>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button
              type="button"
              className="btn btn--secondary"
              style={{ width: 34, height: 38, padding: 0 }}
              onClick={() => shiftStock(-STOCK_STEP)}
              aria-label={`Ubrat ${STOCK_STEP} kg`}
            >
              −
            </button>
            <input
              className="input input--sm"
              style={{ width: 84, textAlign: 'center', fontWeight: 600 }}
              value={draft.stockKg}
              onChange={(event) => update({ stockKg: event.target.value })}
              aria-label={`Sklad ${initial.name} v kilogramech`}
            />
            <button
              type="button"
              className="btn btn--secondary"
              style={{ width: 34, height: 38, padding: 0 }}
              onClick={() => shiftStock(STOCK_STEP)}
              aria-label={`Přidat ${STOCK_STEP} kg`}
            >
              +
            </button>
          </div>
        </div>

        <label>
          <span className="admin-label">Kapacita (kg)</span>
          <input
            className="input input--sm"
            value={draft.capacityKg}
            onChange={(event) => update({ capacityKg: event.target.value })}
          />
        </label>

        <label>
          <span className="admin-label">Cena (Kč/kg)</span>
          <input
            className="input input--sm"
            style={{ fontWeight: 600 }}
            value={draft.priceCzk}
            onChange={(event) => update({ priceCzk: event.target.value })}
          />
        </label>

        <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
          <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={pending}>
            Uložit
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ color: 'var(--clay)', borderColor: '#e8d4cd' }}
            onClick={() => void remove()}
            disabled={pending}
          >
            Smazat
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn--danger"
        style={{ alignSelf: 'flex-start', color: 'var(--green)', textDecoration: 'none' }}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? '▲  Skrýt' : '▼  Upravit'} popisky a barvu
      </button>

      {expanded ? (
        <div className="card card--sand" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 16 }}>
          <div className="stack" style={{ gap: 14 }}>
            <label>
              <span className="admin-label">Krátký štítek (vedle názvu v burze)</span>
              <input
                className="input input--sm"
                value={draft.tag}
                onChange={(event) => update({ tag: event.target.value })}
                placeholder="lahůdková, varný typ A"
              />
            </label>

            <div>
              <span className="admin-label">Barva odrůdy</span>
              <div className="palette">
                {PALETTE.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    className="palette__swatch"
                    style={{ background: color.hex }}
                    title={color.name}
                    aria-label={color.name}
                    aria-pressed={draft.colorHex === color.hex}
                    onClick={() => update({ colorHex: color.hex })}
                  />
                ))}
              </div>
            </div>
          </div>

          <label>
            <span className="admin-label">Popis v burze</span>
            <textarea
              className="textarea"
              rows={5}
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
