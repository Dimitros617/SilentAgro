import type { Metadata } from 'next'
import { ListVarieties } from '@/application/use-cases/catalog'
import { Checkout } from '@/components/cart/checkout'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rezervace',
  robots: { index: false },
}

export default async function CartPage() {
  // Ceny a názvy se berou ze serveru, ne z košíku v prohlížeči — mezi vložením
  // do košíku a odesláním mohl farmář cenu změnit.
  const container = getContainer()
  const varieties = await new ListVarieties({ uow: container.uow }).execute()

  return (
    <div className="shell section" style={{ maxWidth: 1000 }}>
      <h1 className="display h1" style={{ marginBottom: 26 }}>
        Rezervace
      </h1>
      <Checkout
        varieties={varieties}
        policy={{
          feeCzk: container.delivery.feeCzk,
          freeAboveCzk: container.delivery.freeAboveCzk,
          holdDays: container.delivery.holdDays,
        }}
      />
    </div>
  )
}
