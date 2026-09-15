import type { KpiView } from '@/application/dto'

export function KpiGrid({ kpis, valueFontSize }: Readonly<{
  kpis: readonly KpiView[]
  valueFontSize?: number
}>) {
  return (
    <div className="grid-auto grid-auto--narrow">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="card">
          <span className="eyebrow">{kpi.label}</span>
          <div className="display kpi__value" style={{ fontSize: valueFontSize }}>
            {kpi.value}
          </div>
          <div className={kpi.tone === 'green' ? 'kpi__delta kpi__delta--green' : 'kpi__delta'}>
            {kpi.delta}
          </div>
        </div>
      ))}
    </div>
  )
}
