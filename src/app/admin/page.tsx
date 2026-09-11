import { GetAdminOverview } from '@/application/use-cases/admin'
import { Bins } from '@/components/stock/bins'
import { HarvestChart } from '@/components/stock/harvest-chart'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  const container = getContainer()
  const overview = await new GetAdminOverview({
    uow: container.uow,
    clock: container.clock,
  }).execute()

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-auto grid-auto--narrow">
        {overview.kpis.map((kpi) => (
          <div key={kpi.label} className="card">
            <span className="eyebrow">{kpi.label}</span>
            <div className="display kpi__value" style={{ fontSize: 36 }}>
              {kpi.value}
            </div>
            <div className={kpi.tone === 'green' ? 'kpi__delta kpi__delta--green' : 'kpi__delta'}>
              {kpi.delta}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-two">
        <section className="card">
          <h2 className="display h3">Naplněnost zásobníků</h2>
          <div style={{ marginTop: 20 }}>
            <Bins bins={overview.bins} tone="light" height={210} showKg />
          </div>
        </section>

        <section className="card">
          <div className="row row--between row--baseline">
            <h2 className="display h3">Vývoj skladu</h2>
            <span className="muted">{overview.harvestSummary}</span>
          </div>
          <HarvestChart points={overview.harvest} height={180} />
          <p className="muted" style={{ marginTop: 10, color: 'var(--muted-strong)' }}>
            {overview.harvestLast}
          </p>
        </section>
      </div>
    </div>
  )
}
