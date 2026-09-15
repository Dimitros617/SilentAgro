import type { NewsView, StockOverview, VarietyView } from '@/application/dto'
import { toBins, toFieldView, toHarvestPoint, toNewsView, toVarietyView } from '@/application/view-models'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { formatArea, formatDateTimeCs, formatKg, formatKgNumber } from '@/shared/format'

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

    return posts.map(toNewsView)
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
          label: 'Sklizeno celkem',
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
      harvest: harvestEntries.map(toHarvestPoint),
      fields: allFields.map(toFieldView),
      updatedAtLabel: formatDateTimeCs(this.deps.clock.now()),
    }
  }
}
