import type { Metadata } from 'next'
import { GetStockOverview } from '@/application/use-cases/catalog'
import { Bins } from '@/components/stock/bins'
import { HarvestChart } from '@/components/stock/harvest-chart'
import { KpiGrid } from '@/components/stock/kpi-grid'
import { FieldStatus } from '@/domain/enums'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sklad',
  description: 'Vše, co je vykopané, zvážené a uložené ve stodole. Čísla v reálném čase.',
}

const FIELD_TONE: Record<FieldStatus, { background: string; badge: string }> = {
  [FieldStatus.HARVESTED]: { background: '#fbfaf6', badge: 'badge badge--green' },
  [FieldStatus.HARVESTING]: { background: '#fdf9ee', badge: 'badge badge--gold' },
  [FieldStatus.GROWING]: { background: 'var(--surface)', badge: 'badge badge--muted' },
}

export default async function StockPage() {
  const container = getContainer()
  const overview = await new GetStockOverview({
    uow: container.uow,
    clock: container.clock,
  }).execute()

  return (
    <div className="shell section stack">
      <div>
        <h1 className="display h1">Sklad v reálném čase</h1>
        <p className="lead">Vše, co je vykopané, zvážené a uložené ve stodole.</p>
      </div>

      <KpiGrid kpis={overview.kpis} />

      <div className="grid-two">
        <section className="card">
          <h2 className="display h3">Zásobníky podle odrůd</h2>
          <div style={{ marginTop: 22 }}>
            <Bins bins={overview.bins} tone="light" height={230} showKg />
          </div>
        </section>

        <section className="card">
          <h2 className="display h3">Výkop a sklad — poslední záznamy</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Sloupce = výkop, čára = stav skladu
          </p>
          <HarvestChart points={overview.harvest} />
        </section>
      </div>

      <section className="card">
        <h2 className="display h3">Mapa polí</h2>
        <div className="grid-auto grid-auto--narrow" style={{ marginTop: 18 }}>
          {overview.fields.map((field) => {
            const tone = FIELD_TONE[field.status]
            return (
              <div
                key={field.id}
                className="card"
                style={{ background: tone.background, borderRadius: 'var(--radius-lg)', padding: 16 }}
              >
                <div className="row row--between">
                  <span style={{ fontWeight: 600 }}>{field.name}</span>
                  <span className={tone.badge}>{field.statusLabel}</span>
                </div>
                <p className="muted" style={{ margin: '8px 0 0', color: 'var(--muted-strong)' }}>
                  {field.varietyName} · {field.areaLabel}
                </p>
                <div className="display" style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>
                  {field.yieldLabel}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
