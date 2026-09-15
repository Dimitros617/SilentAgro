'use client'

import { useState } from 'react'
import { useToast } from '@/components/layout/toast'
import { PALETTE, toNumber, type Draft } from './variety-draft'
import { upsertVarietyAction } from '@/app/actions/admin'

export function AddVarietyForm() {
  const [draft, setDraft] = useState<Draft>({
    name: '',
    tag: '',
    description: '',
    colorHex: PALETTE[0].hex,
    priceCzk: '18',
    stockKg: '150',
    capacityKg: '150',
  })
  const [pending, setPending] = useState(false)
  const { show } = useToast()

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }))

  const add = async () => {
    setPending(true)
    try {
      const stock = toNumber(draft.stockKg)
      const result = await upsertVarietyAction({
        id: null,
        expectedStockKg: null,
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
        setDraft((current) => ({ ...current, name: '', tag: '', description: '' }))
        show('Odrůda přidána do burzy')
      } else {
        show(result.error)
      }
    } catch {
      show('Spojení se serverem se přerušilo. Obnovte sklad a ověřte výsledek.')
    } finally {
      setPending(false)
    }
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
        <button type="button" className="btn btn--primary" onClick={() => void add()} disabled={pending}>
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
