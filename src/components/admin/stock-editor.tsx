'use client'

import { useState, useTransition } from 'react'
import { deactivateVarietyAction, upsertVarietyAction } from '@/app/actions/admin'
import type { AdminVarietyView } from '@/application/dto'
import { useToast } from '@/components/layout/toast'

/** Paleta z prototypu — barvy odrůd, ne libovolný výběr. */
const PALETTE = [
  { hex: '#c98a2b', name: 'Zlatá slupka' },
  { hex: '#c4a457', name: 'Sláma' },
  { hex: '#a9642e', name: 'Hlína' },
  { hex: '#b4553a', name: 'Cihlová' },
  { hex: '#8a9a3f', name: 'Nať' },
  { hex: '#6f8f5a', name: 'Šalvěj' },
  { hex: '#1f6f4a', name: 'Lesní zeleň' },
  { hex: '#7c6a4e', name: 'Kůra' },
] as const

const STOCK_STEP = 5

interface Draft {
  name: string
  tag: string
  description: string
  colorHex: string
  priceCzk: string
  stockKg: string
  capacityKg: string
}

const toDraft = (variety: AdminVarietyView): Draft => ({
  name: variety.name,
  tag: variety.tag,
  description: variety.description,
  colorHex: variety.colorHex,
  priceCzk: String(variety.priceCzk),
  stockKg: String(variety.stockKg),
  capacityKg: String(variety.capacityKg),
})

const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.')) || 0

function VarietyRow({ initial, onRemoved }: { initial: AdminVarietyView; onRemoved: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [expanded, setExpanded] = useState(false)
  const [pending, startTransition] = useTransition()
  const { show } = useToast()

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  /** Uložení je vědomý krok, ne auto-save — jinak by každý stisk klávesy šel na server. */
  const save = () => {
    startTransition(async () => {
      const result = await upsertVarietyAction({
        id: initial.id,
        name: draft.name,
        tag: draft.tag,
        description: draft.description,
        colorHex: draft.colorHex,
        priceCzk: toNumber(draft.priceCzk),
        stockKg: toNumber(draft.stockKg),
        capacityKg: toNumber(draft.capacityKg),
      })
      show(result.ok ? `${draft.name} uloženo` : result.error)
    })
  }

  const remove = () => {
    startTransition(async () => {
      const result = await deactivateVarietyAction(initial.id)
      if (result.ok) {
        show(`${initial.name} stažena z burzy`)
        onRemoved()
      } else {
        show(result.error)
      }
    })
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
          <button type="button" className="btn btn--primary" onClick={save} disabled={pending}>
            Uložit
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ color: 'var(--clay)', borderColor: '#e8d4cd' }}
            onClick={remove}
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

function AddVarietyForm({ onAdded }: { onAdded: (variety: AdminVarietyView) => void }) {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    tag: '',
    description: '',
    colorHex: PALETTE[0].hex,
    priceCzk: '18',
    stockKg: '150',
    capacityKg: '150',
  })
  const [pending, startTransition] = useTransition()
  const { show } = useToast()

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  const add = () => {
    startTransition(async () => {
      const stock = toNumber(draft.stockKg)
      const result = await upsertVarietyAction({
        id: null,
        name: draft.name,
        tag: draft.tag || 'nová odrůda',
        description: draft.description || 'Čerstvě přidaná odrůda z naší zahrady.',
        colorHex: draft.colorHex,
        priceCzk: toNumber(draft.priceCzk),
        stockKg: stock,
        // Bez zadané kapacity dává smysl vzít současný sklad: zásobník je zjevně
        // aspoň tak velký, jako to, co v něm právě je.
        capacityKg: Math.max(stock, toNumber(draft.capacityKg)),
      })

      if (result.ok) {
        onAdded(result.value)
        setDraft((current) => ({ ...current, name: '', tag: '', description: '' }))
        show('Odrůda přidána do burzy')
      } else {
        show(result.error)
      }
    })
  }

  return (
    <div className="card">
      <h2 className="display h3">Přidat odrůdu</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 110px 110px 130px',
          gap: 12,
          marginTop: 16,
          alignItems: 'end',
        }}
      >
        <label className="field">
          Název
          <input
            className="input"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
            placeholder="Adéla"
          />
        </label>
        <label className="field">
          Štítek
          <input
            className="input"
            value={draft.tag}
            onChange={(event) => update({ tag: event.target.value })}
            placeholder="raná, varný typ B"
          />
        </label>
        <label className="field">
          Sklad kg
          <input
            className="input"
            value={draft.stockKg}
            onChange={(event) => update({ stockKg: event.target.value })}
          />
        </label>
        <label className="field">
          Kč/kg
          <input
            className="input"
            value={draft.priceCzk}
            onChange={(event) => update({ priceCzk: event.target.value })}
          />
        </label>
        <button type="button" className="btn btn--primary" onClick={add} disabled={pending}>
          Přidat
        </button>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        Popis pro burzu
        <textarea
          className="textarea"
          rows={2}
          value={draft.description}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="Jaká je na chuť, na co se hodí…"
        />
      </label>
    </div>
  )
}

export function StockEditor({ varieties }: { varieties: AdminVarietyView[] }) {
  const [items, setItems] = useState(varieties)

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card card--flush">
        {items.length === 0 ? (
          <p className="muted" style={{ padding: '20px 0' }}>
            Zatím tu není žádná odrůda.
          </p>
        ) : (
          items.map((variety) => (
            <VarietyRow
              key={variety.id}
              initial={variety}
              onRemoved={() => setItems((current) => current.filter((item) => item.id !== variety.id))}
            />
          ))
        )}
      </div>

      <AddVarietyForm onAdded={(variety) => setItems((current) => [...current, variety])} />
    </div>
  )
}
