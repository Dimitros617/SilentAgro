import type { BinView, NewsView, StockOverview, VarietyView } from '@/application/dto'
import type { Variety } from '@/domain/entities'
import { FIELD_STATUS_LABELS, NEWS_TAG_LABELS } from '@/domain/enums'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { formatArea, formatCzkPerKg, formatDateCs, formatDateTimeCs, formatKg, formatKgNumber } from '@/shared/format'

export const toVarietyView = (variety: Variety): VarietyView => ({
  id: variety.id,
  slug: variety.slug,
  name: variety.name,
  tag: variety.tag,
  description: variety.description,
  colorHex: variety.color.value,
  priceCzk: variety.pricePerKg.czk,
  priceLabel: formatCzkPerKg(variety.pricePerKg),
  stockKg: variety.stock.value,
  stockLabel: variety.isSoldOut() ? 'vyprodáno' : formatKg(variety.stock),
  capacityKg: variety.capacity.value,
  fillPercent: variety.fillPercent(),
  available: !variety.isSoldOut(),
})

/**
 * Zásobníky se škálují proti **největší kapacitě mezi odrůdami**, ne proti vlastní.
 * Sloupce v grafu se tak dají porovnávat mezi sebou — na rozdíl od `VarietyView.fillPercent`,
 * který odpovídá na jinou otázku: jak je plný tenhle konkrétní zásobník.
 */
const toBins = (varieties: Variety[]): BinView[] => {
  const maxCapacity = Math.max(1, ...varieties.map((v) => v.capacity.value))

  return varieties.map((variety) => {
    const percent = Math.max(0, Math.min(100, Math.round((variety.stock.value / maxCapacity) * 100)))
    return {
      name: variety.name,
      colorHex: variety.color.value,
      percent,
      percentLabel: `${percent} %`,
      kgLabel: formatKg(variety.stock),
    }
  })
}

export class ListVarieties {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(): Promise<VarietyView[]> {
    const varieties = await this.deps.uow.repos.varieties.findAllActive()
    return varieties.map(toVarietyView)
  }
}

export class ListNews {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(limit = 6): Promise<NewsView[]> {
    const posts = await this.deps.uow.repos.news.listPublished(limit)

    return posts.map((post) => ({
      id: post.id,
      title: post.title,
      body: post.body,
      tag: post.tag,
      tagLabel: NEWS_TAG_LABELS[post.tag],
      dateLabel: formatDateCs(post.publishedAt),
      imageUrl: post.imageUrl,
    }))
  }
}

export class GetStockOverview {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(): Promise<StockOverview> {
    const { varieties, fields, harvest, storage, orders } = this.deps.uow.repos

    const [activeVarieties, allFields, harvestEntries, latestReading, reserved, totalDug] =
      await Promise.all([
        varieties.findAllActive(),
        fields.listAll(),
        harvest.listRecent(14),
        storage.latest(),
        orders.reservedKg(),
        harvest.totalDug(),
      ])

    const totalKg = activeVarieties.reduce((sum, variety) => sum + variety.stock.value, 0)
    const lastEntry = harvestEntries.at(-1)
    const totalArea = allFields.reduce((sum, field) => sum + field.areaM2, 0)

    return {
      totalKg,
      totalKgLabel: formatKgNumber(totalKg),
      bins: toBins(activeVarieties),
      kpis: [
        {
          label: 'Na skladě',
          value: `${formatKgNumber(totalKg)} kg`,
          delta: lastEntry ? `+${formatKgNumber(lastEntry.dug.value)} kg naposledy` : '—',
          tone: 'green',
        },
        {
          label: 'Rezervováno',
          value: formatKg(reserved),
          delta: 'čeká na vydání',
          tone: 'muted',
        },
        {
          label: 'Sklizeno letos',
          value: formatKg(totalDug),
          delta: totalArea > 0 ? `z ${formatArea(totalArea)}` : '—',
          tone: 'muted',
        },
        {
          label: 'Teplota stodoly',
          value: latestReading ? `${latestReading.temperatureC} °C` : '—',
          // Bez záznamu z čidla se ukáže pomlčka. Vymyšlená hodnota by tvrdila něco,
          // co aplikace neví.
          delta: latestReading ? `vlhkost ${latestReading.humidityPct} %` : 'čidlo nehlásí',
          tone: 'muted',
        },
      ],
      harvest: harvestEntries.map((entry) => ({
        dateLabel: `${entry.date.getDate()}.${entry.date.getMonth() + 1}.`,
        dugKg: entry.dug.value,
        stockKg: entry.stock.value,
      })),
      fields: allFields.map((field) => ({
        id: field.id,
        name: field.name,
        varietyName: field.varietyName,
        areaLabel: formatArea(field.areaM2),
        status: field.status,
        statusLabel: FIELD_STATUS_LABELS[field.status],
        yieldLabel: `${field.isEstimate ? '~' : ''}${formatKg(field.yieldKg)}`,
      })),
      updatedAtLabel: formatDateTimeCs(this.deps.clock.now()),
    }
  }
}
