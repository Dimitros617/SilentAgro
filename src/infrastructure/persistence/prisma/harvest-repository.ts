import type { PrismaLike } from './types'
import type { HarvestEntry } from '@/domain/entities'
import type { HarvestRepository } from '@/domain/ports/repositories'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { toHarvestEntry, decimalToNumber } from './mappers'

export class PrismaHarvestRepository implements HarvestRepository {
  constructor(private readonly db: PrismaLike) {}

  /** Vrací od nejstaršího k nejnovějšímu — tak, jak se kreslí graf zleva doprava. */
  async listRecent(limit: number): Promise<HarvestEntry[]> {
    const rows = await this.db.harvestEntry.findMany({ orderBy: { date: 'desc' }, take: limit })
    const oldestFirst = [...rows].reverse()
    return oldestFirst.map(toHarvestEntry)
  }

  async totalDug(): Promise<Kilograms> {
    const result = await this.db.harvestEntry.aggregate({ _sum: { dugKg: true } })
    return Kilograms.parse(decimalToNumber(result._sum.dugKg ?? 0))
  }
}
