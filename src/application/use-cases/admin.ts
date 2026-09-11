import type {
  AdminOverview,
  AdminVarietyView,
  NewsView,
  OrderRowView,
  PublishNewsInput,
  UpsertVarietyInput,
} from '@/application/dto'
import { toVarietyView } from '@/application/use-cases/catalog'
import type { Order } from '@/domain/entities'
import {
  DELIVERY_SHORT_LABELS,
  NEWS_TAG_LABELS,
  NEXT_ORDER_STATUS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  requiresTransfer,
} from '@/domain/enums'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { formatCzk, formatCzkPerKg, formatDateCs, formatDateTimeCs, formatKg, formatKgNumber } from '@/shared/format'

const toOrderRow = (order: Order): OrderRowView => ({
  id: order.id,
  code: order.code,
  customerName: order.customer.name,
  customerEmail: order.customer.email.value,
  customerPhone: order.customer.phone,
  note: order.customer.note,
  itemsLabel: order.itemsLabel,
  deliveryLabel: DELIVERY_SHORT_LABELS[order.delivery],
  paymentLabel: PAYMENT_LABELS[order.payment],
  totalLabel: formatCzkPerKg(order.total),
  status: order.status,
  statusLabel: ORDER_STATUS_LABELS[order.status],
  requiresTransfer: requiresTransfer(order.payment),
  isPaid: order.isPaid,
  paidAtLabel: order.paidAt ? formatDateCs(order.paidAt) : null,
  createdAtLabel: formatDateTimeCs(order.createdAt),
})

export class ListOrders {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(limit = 50): Promise<OrderRowView[]> {
    const orders = await this.deps.uow.repos.orders.listRecent(limit)
    return orders.map(toOrderRow)
  }
}

export class AdvanceOrderStatus {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(orderId: number): Promise<OrderRowView> {
    // Čtení i zápis v jedné transakci: mezi nimi by jinak stihl projít druhý klik
    // z jiného tabu a stav by se posunul dvakrát.
    return this.deps.uow.runInTransaction(async (repos) => {
      const order = await repos.orders.findById(orderId)
      if (!order) throw new NotFoundError('Objednávka')

      const updated = await repos.orders.updateStatus(orderId, NEXT_ORDER_STATUS[order.status])
      return toOrderRow(updated)
    })
  }
}

export interface SetOrderPaidResult {
  readonly isPaid: boolean
  readonly paidAtLabel: string | null
}

export class SetOrderPaid {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(orderId: number, paid: boolean): Promise<SetOrderPaidResult> {
    return this.deps.uow.runInTransaction(async (repos) => {
      const order = await repos.orders.findById(orderId)
      if (!order) throw new NotFoundError('Objednávka')

      // Idempotence: už zaplacenou objednávku neoznačujeme znovu. Jinak by dvojklik
      // nebo druhý otevřený tab přepsal datum, kdy peníze skutečně dorazily.
      if (paid && order.isPaid) {
        return { isPaid: true, paidAtLabel: order.paidAt ? formatDateCs(order.paidAt) : null }
      }

      const updated = await repos.orders.setPaid(orderId, paid ? this.deps.clock.now() : null)
      return {
        isPaid: updated.isPaid,
        paidAtLabel: updated.paidAt ? formatDateCs(updated.paidAt) : null,
      }
    })
  }
}

/** `Růžová Adéla` → `ruzova-adela`. Diakritika se rozloží a zahodí. */
const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const uniqueSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export class UpsertVariety {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(input: UpsertVarietyInput): Promise<AdminVarietyView> {
    const name = input.name.trim()
    if (name.length === 0) throw new ValidationError('Vyplňte název odrůdy')

    const color = HexColor.of(input.colorHex)
    const pricePerKg = Money.fromCzk(input.priceCzk)
    const stock = Kilograms.parse(input.stockKg)
    const capacity = Kilograms.parse(input.capacityKg)

    if (stock.gt(capacity)) {
      throw new ValidationError('Sklad nemůže být větší než kapacita zásobníku')
    }

    // Uvnitř transakce: úprava skladu se jinak může potkat s probíhající rezervací
    // a absolutní hodnota z formuláře by odečet přepsala zpátky.
    return this.deps.uow.runInTransaction(async (repos) => {
      if (input.id !== null) {
        const existing = await repos.varieties.findById(input.id)
        if (!existing) throw new NotFoundError('Odrůda')

        // Slug zůstává: je v URL a odkazy na něj by se přejmenováním rozbily.
        const saved = await repos.varieties.save(
          existing.with({
            name,
            tag: input.tag.trim(),
            description: input.description.trim(),
            color,
            pricePerKg,
            stock,
            capacity,
          }),
        )
        return { ...toVarietyView(saved), capacityKg: saved.capacity.value, isActive: saved.isActive }
      }

      const taken = new Set(await repos.varieties.existingSlugs())
      const slug = uniqueSlug(slugify(name) || 'odruda', taken)

      const created = await repos.varieties.create({
        slug,
        name,
        tag: input.tag.trim(),
        description: input.description.trim(),
        color,
        pricePerKg,
        stock,
        capacity,
        sortOrder: taken.size,
      })
      return {
        ...toVarietyView(created),
        capacityKg: created.capacity.value,
        isActive: created.isActive,
      }
    })
  }
}

export class ListAdminVarieties {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(): Promise<AdminVarietyView[]> {
    const varieties = await this.deps.uow.repos.varieties.findAll()
    return varieties.map((variety) => ({
      ...toVarietyView(variety),
      capacityKg: variety.capacity.value,
      isActive: variety.isActive,
    }))
  }
}

export class DeactivateVariety {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  /**
   * Deaktivace, ne smazání. Na odrůdu mohou existovat objednávky a databáze její
   * smazání blokuje cizím klíčem — historická objednávka musí zůstat čitelná.
   */
  async execute(id: number): Promise<void> {
    await this.deps.uow.runInTransaction(async (repos) => {
      const existing = await repos.varieties.findById(id)
      if (!existing) throw new NotFoundError('Odrůda')
      await repos.varieties.deactivate(id)
    })
  }
}

export class PublishNews {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(input: PublishNewsInput): Promise<NewsView> {
    const title = input.title.trim()
    if (title.length === 0) throw new ValidationError('Napište titulek novinky')

    const post = await this.deps.uow.repos.news.create({
      title,
      body: input.body.trim(),
      tag: input.tag,
      imageUrl: input.imageUrl,
      publishedAt: this.deps.clock.now(),
      authorId: input.authorId,
    })

    return {
      id: post.id,
      title: post.title,
      body: post.body,
      tag: post.tag,
      tagLabel: NEWS_TAG_LABELS[post.tag],
      dateLabel: formatDateCs(post.publishedAt),
      imageUrl: post.imageUrl,
    }
  }
}

export class DeleteNews {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(id: number): Promise<void> {
    await this.deps.uow.repos.news.delete(id)
  }
}

export class GetAdminOverview {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(): Promise<AdminOverview> {
    const { varieties, harvest, orders } = this.deps.uow.repos
    const monthAgo = new Date(this.deps.clock.now().getTime() - 30 * 24 * 3600 * 1000)

    const [activeVarieties, harvestEntries, newCount, revenue, awaitingPayment] = await Promise.all([
      varieties.findAllActive(),
      harvest.listRecent(14),
      orders.countByStatus('NEW'),
      orders.revenueSince(monthAgo),
      orders.countAwaitingPayment(monthAgo),
    ])

    const totalKg = activeVarieties.reduce((sum, variety) => sum + variety.stock.value, 0)
    const maxCapacity = Math.max(1, ...activeVarieties.map((v) => v.capacity.value))
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
          label: 'Tržby za 30 dní',
          value: formatCzk(revenue),
          delta: `průměr ${formatCzkPerKg(averagePrice)}/kg`,
          tone: 'muted',
        },
      ],
      bins: activeVarieties.map((variety) => {
        const percent = Math.max(
          0,
          Math.min(100, Math.round((variety.stock.value / maxCapacity) * 100)),
        )
        return {
          name: variety.name,
          colorHex: variety.color.value,
          percent,
          percentLabel: `${percent} %`,
          kgLabel: formatKg(variety.stock),
        }
      }),
      harvest: harvestEntries.map((entry) => ({
        dateLabel: `${entry.date.getDate()}.${entry.date.getMonth() + 1}.`,
        dugKg: entry.dug.value,
        stockKg: entry.stock.value,
      })),
      harvestSummary: `${formatKg(dugTotal)} vykopáno za 14 dní`,
      harvestLast: lastEntry ? `naposledy ${formatKg(lastEntry.stock)} na skladě` : '—',
    }
  }
}
