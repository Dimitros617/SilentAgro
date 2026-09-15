import { requireFarmer } from '@/infrastructure/auth/session'
import { GetAdminOverview } from '@/application/use-cases/admin'
import { Bins } from '@/components/stock/bins'
import { HarvestChart } from '@/components/stock/harvest-chart'
import { KpiGrid } from '@/components/stock/kpi-grid'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminOverviewPage() {
  await requireFarmer()
  const container = getContainer()
  const overview = await new GetAdminOverview({
    uow: container.uow,
    clock: container.clock,
  }).execute()

  return (
    <div className="stack" style={{ gap: 18 }}>
      <KpiGrid kpis={overview.kpis} valueFontSize={36} />

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
