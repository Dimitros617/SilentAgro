import Link from 'next/link'
import { GetStockOverview, ListNews } from '@/application/use-cases/catalog'
import { NewsGrid } from '@/components/home/news-grid'
import { Bins } from '@/components/stock/bins'
import { getContainer } from '@/infrastructure/di/container'

/**
 * Stránka čte databázi, takže se nesmí předgenerovat při buildu — `docker build`
 * běží bez databáze i bez konfigurace a prerender by ho shodil. Stav skladu má být
 * navíc aktuální; ukázat kilogramy z doby sestavení image by bylo horší než pomalejší
 * odpověď.
 */
export const dynamic = 'force-dynamic'

const steps = (radiusKm: number) => [
  {
    number: '01',
    title: 'Podívejte se do skladu',
    body: 'Čísla jsou skutečná, aktualizujeme je po každém výkopu.',
  },
  {
    number: '02',
    title: 'Zarezervujte množství',
    body: 'Po půl kile, od 0,5 kg výš. Sklad se odečte hned.',
  },
  {
    number: '03',
    title: 'Přijde potvrzení',
    body: 'E-mail vám i farmáři, s termínem a QR platbou.',
  },
  {
    number: '04',
    title: 'Vyzvednutí či rozvoz',
    body: `Osobně na farmě, nebo dovezeme do ${radiusKm} km.`,
  },
]

export default async function HomePage() {
  const container = getContainer()

  const [overview, news] = await Promise.all([
    new GetStockOverview({ uow: container.uow, clock: container.clock }).execute(),
    new ListNews({ uow: container.uow }).execute(3),
  ])

  return (
    <div className="shell">
      <section className="hero">
        <div>
          <span className="badge badge--green" style={{ letterSpacing: '0.04em' }}>
            SKLIZEŇ 2026 BĚŽÍ
          </span>
          <h1 className="display hero__title">Rezervujte si brambory přímo z pole.</h1>
          <p className="hero__lead">
            Každý den vykopeme, zvážíme a hned zveřejníme, kolik je na skladě. Vy si
            zarezervujete množství, dokud zásoba stačí. Žádné mezičlánky, žádné sklady po
            půl roce.
          </p>
          <div className="hero__actions">
            <Link href="/burza" className="btn btn--primary btn--lg">
              Do burzy →
            </Link>
            <Link href="/sklad" className="btn btn--ghost btn--lg">
              Stav skladu
            </Link>
          </div>
        </div>

        <div className="hero__panel">
          <span className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
            Aktuálně na skladě
          </span>
          <div className="row row--baseline" style={{ gap: 10, marginTop: 6 }}>
            <span className="hero__number">{overview.totalKgLabel}</span>
            <span className="hero__unit">kg</span>
          </div>
          <hr className="rule" />
          <Bins bins={overview.bins} tone="ink" />
          <p className="muted" style={{ color: 'var(--ink-muted)', marginTop: 18 }}>
            Stav načten: {overview.updatedAtLabel}
          </p>
        </div>
      </section>

      <section className="section--tight">
        <div className="row row--between row--baseline" style={{ marginBottom: 20 }}>
          <h2 className="display h2">Novinky z pole</h2>
          <span className="muted">Píše farmář, obvykle večer po sklizni</span>
        </div>
        <NewsGrid posts={news} />
      </section>

      <section style={{ padding: '30px 0 70px' }}>
        <h2 className="display h3" style={{ fontSize: 22, margin: '0 0 16px' }}>
          Jak to funguje
        </h2>
        <div className="grid-auto grid-auto--narrow">
          {steps(container.delivery.radiusKm).map((step) => (
            <div key={step.number} className="card">
              <span
                className="display"
                style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}
              >
                {step.number}
              </span>
              <p style={{ fontWeight: 600, margin: '8px 0 0', fontSize: 16 }}>{step.title}</p>
              <p className="muted" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
