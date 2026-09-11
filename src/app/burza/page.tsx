import type { Metadata } from 'next'
import { ListVarieties } from '@/application/use-cases/catalog'
import { VarietyCard } from '@/components/shop/variety-card'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Burza',
  description: 'Rezervace brambor přímo z pole. Co je pryč, je pryč — do další sklizně.',
}

export default async function ShopPage() {
  const varieties = await new ListVarieties({ uow: getContainer().uow }).execute()

  return (
    <div className="shell section">
      <h1 className="display h1">Burza</h1>
      <p className="lead" style={{ marginBottom: 30 }}>
        Rezervace se odečítá ze skladu okamžitě. Co je pryč, je pryč — do další sklizně.
      </p>

      {varieties.length === 0 ? (
        <div className="card card--dashed">
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Zatím tu nic není</p>
          <p className="muted" style={{ marginTop: 8 }}>
            Farmář ještě nic nevykopal. Zkuste to za pár dní.
          </p>
        </div>
      ) : (
        <div className="grid-auto">
          {varieties.map((variety) => (
            <VarietyCard key={variety.id} variety={variety} />
          ))}
        </div>
      )}
    </div>
  )
}
