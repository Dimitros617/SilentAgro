import type { AdminVarietyView } from '@/application/dto'
import { VarietyRow } from './variety-editor-row'
import { AddVarietyForm } from './add-variety-form'

export function StockEditor({ varieties }: Readonly<{ varieties: AdminVarietyView[] }>) {
  const items = varieties

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
            />
          ))
        )}
      </div>

      <AddVarietyForm />
    </div>
  )
}
