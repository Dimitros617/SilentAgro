import type { VarietyView } from '@/application/dto'
import { Order } from '@/domain/entities/order'
import type { DeliveryMethod } from '@/domain/enums'
import type { DeliveryPolicy } from '@/domain/ports/services'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import type { CartLine } from './cart-reducer'

interface CheckoutRow {
  line: CartLine
  variety: VarietyView
  total: Money
}

export function summarizeCheckout(
  lines: readonly CartLine[],
  varieties: readonly VarietyView[],
  delivery: DeliveryMethod,
  policy: Pick<DeliveryPolicy, 'feeCzk' | 'freeAboveCzk'>,
) {
  const byId = new Map(varieties.map((variety) => [variety.id, variety]))
  const rows: CheckoutRow[] = []
  const unavailableLines: CartLine[] = []
  let subtotal = Money.zero()
  let totalKg = Kilograms.zero()

  for (const line of lines) {
    const variety = byId.get(line.varietyId)
    if (!variety) {
      unavailableLines.push(line)
      continue
    }

    const quantity = Kilograms.of(line.quantityKg)
    const total = Money.fromCzk(variety.priceCzk).timesKg(quantity)
    rows.push({ line, variety, total })
    subtotal = subtotal.plus(total)
    totalKg = totalKg.plus(quantity)
  }

  const deliveryFee = Order.deliveryFeeFor(delivery, subtotal, policy)
  return { rows, unavailableLines, subtotal, totalKg, deliveryFee, total: subtotal.plus(deliveryFee) }
}
