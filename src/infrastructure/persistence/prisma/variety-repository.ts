import type { PrismaLike } from './types'
import { Prisma } from '@prisma/client'
import type { Variety } from '@/domain/entities'
import type { TransactionVarietyRepository, NewVarietyInput } from '@/domain/ports/repositories'
import { toVariety, rawToVariety, type RawVarietyRow } from './mappers'
import { requireTransaction } from './transaction'

export class PrismaVarietyRepository implements TransactionVarietyRepository {
  constructor(private readonly db: PrismaLike) {}

  async findAllActive(): Promise<Variety[]> {
    const rows = await this.db.variety.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    })
    return rows.map(toVariety)
  }

  async findAll(): Promise<Variety[]> {
    const rows = await this.db.variety.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    return rows.map(toVariety)
  }

  async findById(id: number): Promise<Variety | null> {
    const row = await this.db.variety.findUnique({ where: { id } })
    return row ? toVariety(row) : null
  }

  async existingSlugs(): Promise<string[]> {
    const rows = await this.db.variety.findMany({ select: { slug: true } })
    return rows.map((row) => row.slug)
  }

  /**
   * Jeden zamykající dotaz, který rovnou vrátí data.
   *
   * Rozdělit to na `SELECT id … FOR UPDATE` a následný `findMany` by fungovalo taky,
   * ale jen díky tomu, že v REPEATABLE READ zamykající čtení nezakládá snapshot —
   * což je jemnost, na které nechceme stavět odečet skladu. Jedním dotazem otázka
   * odpadá: zamykající čtení vždy vidí poslední potvrzený stav řádku.
   *
   * Řazení podle `id` je prevence deadlocku: dvě objednávky na tytéž odrůdy v opačném
   * pořadí by se jinak zablokovaly navzájem.
   */
  async lockForUpdate(ids: number[]): Promise<Variety[]> {
    requireTransaction(this.db)
    if (ids.length === 0) return []

    const ordered = [...new Set(ids)].sort((a, b) => a - b)
    const rows = await this.db.$queryRaw<RawVarietyRow[]>`
      SELECT id, slug, name, tag, description, color_hex,
             price_per_kg_czk, stock_kg, capacity_kg, sort_order, is_active
      FROM varieties
      WHERE id IN (${Prisma.join(ordered)})
      ORDER BY id
      FOR UPDATE
    `
    return rows.map(rawToVariety)
  }

  async save(variety: Variety): Promise<Variety> {
    const row = await this.db.variety.update({
      where: { id: variety.id },
      data: {
        name: variety.name,
        tag: variety.tag,
        description: variety.description,
        colorHex: variety.color.value,
        pricePerKgCzk: new Prisma.Decimal(variety.pricePerKg.czk),
        stockKg: new Prisma.Decimal(variety.stock.value),
        capacityKg: new Prisma.Decimal(variety.capacity.value),
        sortOrder: variety.sortOrder,
        isActive: variety.isActive,
      },
    })
    return toVariety(row)
  }

  async create(input: NewVarietyInput): Promise<Variety> {
    const row = await this.db.variety.create({
      data: {
        slug: input.slug,
        name: input.name,
        tag: input.tag,
        description: input.description,
        colorHex: input.color.value,
        pricePerKgCzk: new Prisma.Decimal(input.pricePerKg.czk),
        stockKg: new Prisma.Decimal(input.stock.value),
        capacityKg: new Prisma.Decimal(input.capacity.value),
        sortOrder: input.sortOrder,
      },
    })
    return toVariety(row)
  }

  async deactivate(id: number): Promise<void> {
    await this.db.variety.update({ where: { id }, data: { isActive: false } })
  }
}
