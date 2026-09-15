import type { AdminOverview } from '@/application/dto'
import { toBins, toHarvestPoint } from '@/application/view-models'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { formatCzk, formatCzkPerKg, formatKg, formatKgNumber } from '@/shared/format'

export class GetAdminOverview {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(): Promise<AdminOverview> {
    const { varieties, harvest, orders } = this.deps.uow.repos
    const monthAgo = new Date(this.deps.clock.now().getTime() - 30 * 24 * 3600 * 1000)

    const [activeVarieties, harvestEntries, newCount, orderValue, awaitingPayment] = await Promise.all([
      varieties.findAllActive(),
      harvest.listRecent(14),
      orders.countByStatus('NEW'),
      orders.orderValueSince(monthAgo),
      orders.countAwaitingPayment(monthAgo),
    ])

    const totalKg = activeVarieties.reduce((sum, variety) => sum + variety.stock.value, 0)
    const dugTotal = harvestEntries.reduce((sum, entry) => sum.plus(entry.dug), Kilograms.zero())
    const lastEntry = harvestEntries.at(-1)

    const averagePrice =
      activeVarieties.length > 0
        ? Money.fromCzk(
            activeVarieties.reduce((sum, v) => sum + v.pricePerKg.czk, 0) / activeVarieties.length,
          )
        : Money.zero()

    return {
      kpis: [
        {
          label: 'Sklad celkem',
          value: `${formatKgNumber(totalKg)} kg`,
          delta: `napříč ${activeVarieties.length} odrůdami`,
          tone: 'green',
        },
        {
          label: 'Nové objednávky',
          value: String(newCount),
          delta: 'čekají na přípravu',
          tone: 'muted',
        },
        {
          label: 'Čeká na platbu',
          value: String(awaitingPayment),
          delta: 'převodem, nezaplaceno',
          tone: awaitingPayment > 0 ? 'green' : 'muted',
        },
        {
          label: 'Objednáno za 30 dní',
          value: formatCzk(orderValue),
          delta: `průměr ${formatCzkPerKg(averagePrice)}/kg`,
          tone: 'muted',
        },
      ],
      bins: toBins(activeVarieties),
      harvest: harvestEntries.map(toHarvestPoint),
      harvestSummary: `${formatKg(dugTotal)} vykopáno v posledních ${harvestEntries.length} záznamech`,
      harvestLast: lastEntry ? `naposledy ${formatKg(lastEntry.stock)} na skladě` : '—',
    }
  }
}
