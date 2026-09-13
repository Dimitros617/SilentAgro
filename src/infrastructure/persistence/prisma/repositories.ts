import { Prisma, type PrismaClient } from '@prisma/client'
import type { Field, HarvestEntry, NewsPost, Order, StorageReading, User, Variety } from '@/domain/entities'
import { OrderStatus, PaymentMethod } from '@/domain/enums'
import { ConflictError, NotFoundError } from '@/domain/errors'
import type {
  FieldRepository,
  HarvestRepository,
  NewNewsPostInput,
  NewOrderInput,
  NewUserInput,
  NewVarietyInput,
  NewsRepository,
  OrderRepository,
  RepositoryBundle,
  StorageReadingRepository,
  UserOrderStats,
  UserRepository,
  VarietyRepository,
} from '@/domain/ports/repositories'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { orderCodeFor } from '@/shared/order-code'
import {
  decimalToNumber,
  rawToVariety,
  toField,
  toHarvestEntry,
  toNewsPost,
  toOrder,
  toStorageReading,
  toUser,
  toVariety,
  type RawVarietyRow,
} from '@/infrastructure/persistence/prisma/mappers'

/** Uvnitř transakce má Prisma jiný typ klienta než mimo ni; repozitáře přijímají oba. */
export type PrismaLike = PrismaClient | Prisma.TransactionClient

export { ORDER_CODE_OFFSET, orderCodeFor } from '@/shared/order-code'

const orderInclude = { items: { orderBy: { id: 'asc' } } } as const

class PrismaVarietyRepository implements VarietyRepository {
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

class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly db: PrismaLike) {}

  /**
   * Vloží objednávku a teprve pak jí podle přiděleného `id` dopočte kód.
   *
   * Kód nejde spočítat dopředu: `COUNT(*) + 1` by dvěma souběžným transakcím vrátil
   * stejné číslo a druhý insert by spadl na UNIQUE. Dočasný kód je odvozený z veřejného
   * tokenu, takže je unikátní už při vkládání.
   */
  async create(input: NewOrderInput): Promise<Order> {
    const created = await this.db.order.create({
      data: {
        code: `tmp-${input.publicToken.slice(0, 20)}`,
        publicToken: input.publicToken,
        customerName: input.customer.name,
        customerEmail: input.customer.email.value,
        customerPhone: input.customer.phone,
        note: input.customer.note,
        deliveryMethod: input.delivery,
        paymentMethod: input.payment,
        subtotalCzk: new Prisma.Decimal(input.subtotal.czk),
        deliveryFeeCzk: new Prisma.Decimal(input.deliveryFee.czk),
        totalCzk: new Prisma.Decimal(input.total.czk),
        userId: input.userId,
        createdAt: input.createdAt,
        items: {
          create: input.items.map((item) => ({
            varietyId: item.varietyId,
            varietyName: item.varietyName,
            unitPriceCzk: new Prisma.Decimal(item.unitPrice.czk),
            quantityKg: new Prisma.Decimal(item.quantity.value),
            lineTotalCzk: new Prisma.Decimal(item.lineTotal.czk),
          })),
        },
      },
      select: { id: true },
    })

    const row = await this.db.order.update({
      where: { id: created.id },
      data: { code: orderCodeFor(created.id) },
      include: orderInclude,
    })
    return toOrder(row)
  }

  async findById(id: number): Promise<Order | null> {
    const row = await this.db.order.findUnique({ where: { id }, include: orderInclude })
    return row ? toOrder(row) : null
  }

  async findByPublicToken(token: string): Promise<Order | null> {
    const row = await this.db.order.findUnique({
      where: { publicToken: token },
      include: orderInclude,
    })
    return row ? toOrder(row) : null
  }

  async listRecent(limit: number): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      include: orderInclude,
    })
    return rows.map(toOrder)
  }

  async countByStatus(status: OrderStatus): Promise<number> {
    return this.db.order.count({ where: { status } })
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const existing = await this.db.order.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new NotFoundError('Objednávka')

    const row = await this.db.order.update({
      where: { id },
      data: { status },
      include: orderInclude,
    })
    return toOrder(row)
  }

  /**
   * Zruší objednávku. `updateMany` s podmínkou `cancelledAt: null` je pojistka proti
   * dvojímu zrušení: druhý pokus změní nula řádků, takže se sklad nevrátí dvakrát.
   */
  async cancel(id: number, cancelledAt: Date, reason: string): Promise<Order> {
    const changed = await this.db.order.updateMany({
      where: { id, cancelledAt: null },
      data: { cancelledAt, cancellationReason: reason },
    })

    if (changed.count === 0) {
      const existing = await this.db.order.findUnique({ where: { id }, select: { id: true } })
      if (!existing) throw new NotFoundError('Objednávka')
      throw new ConflictError('Objednávka už je zrušená')
    }

    const row = await this.db.order.findUniqueOrThrow({ where: { id }, include: orderInclude })
    return toOrder(row)
  }

  async listForCustomer(userId: number): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      include: orderInclude,
    })
    return rows.map(toOrder)
  }

  /**
   * Zápis jednoho sloupce hromadně, bez průchodu entitou — stejně jako `setPaid`
   * nebo `cancel`. Tři podmínky drží pravidlo úzké: nepřiřazená objednávka, shoda
   * s ověřenou adresou a vznik před hranicí, kterou předává use-case.
   */
  async claimGuestOrders(
    userId: number,
    email: EmailAddress,
    placedBefore: Date,
  ): Promise<number> {
    const result = await this.db.order.updateMany({
      where: { userId: null, customerEmail: email.value, createdAt: { lt: placedBefore } },
      data: { userId },
    })
    return result.count
  }

  async setPaid(id: number, paidAt: Date | null): Promise<Order> {
    const existing = await this.db.order.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new NotFoundError('Objednávka')

    const row = await this.db.order.update({
      where: { id },
      data: { paidAt },
      include: orderInclude,
    })
    return toOrder(row)
  }

  async reservedKg(): Promise<Kilograms> {
    const result = await this.db.orderItem.aggregate({
      _sum: { quantityKg: true },
      where: { order: { status: { in: [OrderStatus.NEW, OrderStatus.READY] } } },
    })
    return Kilograms.parse(decimalToNumber(result._sum.quantityKg ?? 0))
  }

  async revenueSince(since: Date): Promise<Money> {
    const result = await this.db.order.aggregate({
      _sum: { totalCzk: true },
      where: { createdAt: { gte: since } },
    })
    return Money.fromCzk(decimalToNumber(result._sum.totalCzk ?? 0))
  }

  async countAwaitingPayment(since: Date): Promise<number> {
    return this.db.order.count({
      where: {
        paidAt: null,
        createdAt: { gte: since },
        paymentMethod: { in: [PaymentMethod.BANK_TRANSFER, PaymentMethod.QR_CODE] },
      },
    })
  }
}

class PrismaNewsRepository implements NewsRepository {
  constructor(private readonly db: PrismaLike) {}

  async listPublished(limit: number): Promise<NewsPost[]> {
    const rows = await this.db.newsPost.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })
    return rows.map(toNewsPost)
  }

  async create(input: NewNewsPostInput): Promise<NewsPost> {
    const row = await this.db.newsPost.create({
      data: {
        title: input.title,
        body: input.body,
        tag: input.tag,
        imageUrl: input.imageUrl,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      },
    })
    return toNewsPost(row)
  }

  async delete(id: number): Promise<void> {
    await this.db.newsPost.deleteMany({ where: { id } })
  }
}

class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaLike) {}

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email: email.value } })
    return row ? toUser(row) : null
  }

  async findById(id: number): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } })
    return row ? toUser(row) : null
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { verificationToken: token } })
    return row ? toUser(row) : null
  }

  async create(input: NewUserInput): Promise<User> {
    const row = await this.db.user.create({
      data: {
        email: input.email.value,
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: input.createdAt,
        verificationToken: input.verificationToken,
        verificationExpiresAt: input.verificationExpiresAt,
      },
    })
    return toUser(row)
  }

  async save(user: User): Promise<User> {
    const row = await this.db.user.update({
      where: { id: user.id },
      data: {
        name: user.name,
        verifiedAt: user.verifiedAt,
        verificationToken: user.verificationToken,
        verificationExpiresAt: user.verificationExpiresAt,
        deactivatedAt: user.deactivatedAt,
      },
    })
    return toUser(row)
  }

  async listAll(): Promise<User[]> {
    const rows = await this.db.user.findMany({ orderBy: { id: 'desc' } })
    return rows.map(toUser)
  }

  /**
   * Statistiky všech zákazníků jedním dotazem.
   *
   * Počítají se jen objednávky přiřazené k účtu přes `user_id`. E-mail na objednávce
   * je neověřený údaj z formuláře, takže párovat přes něj by znamenalo, že si kdokoli
   * hostovskou objednávkou nafoukne cizímu účtu útratu. Hostovské objednávky z doby
   * před založením účtu se k němu připíšou při ověření e-mailu; pozdější už ne.
   * Zrušené se do útraty nepočítají, ale
   * vypisují se zvlášť — farmáře zajímá, kdo často ruší.
   */
  async orderStats(): Promise<UserOrderStats[]> {
    const rows = await this.db.$queryRaw<
      Array<{
        user_id: number
        order_count: bigint | number
        cancelled_count: bigint | number
        total_spent: unknown
        last_order_at: Date | null
      }>
    >`
      SELECT u.id AS user_id,
             COUNT(o.id) AS order_count,
             COALESCE(SUM(o.cancelled_at IS NOT NULL), 0) AS cancelled_count,
             COALESCE(SUM(CASE WHEN o.cancelled_at IS NULL THEN o.total_czk ELSE 0 END), 0) AS total_spent,
             MAX(o.created_at) AS last_order_at
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
    `

    return rows.map((row) => ({
      userId: Number(row.user_id),
      orderCount: Number(row.order_count),
      cancelledCount: Number(row.cancelled_count),
      totalSpent: Money.fromCzk(decimalToNumber(row.total_spent)),
      lastOrderAt: row.last_order_at,
    }))
  }
}

class PrismaFieldRepository implements FieldRepository {
  constructor(private readonly db: PrismaLike) {}

  async listAll(): Promise<Field[]> {
    const rows = await this.db.field.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    return rows.map(toField)
  }
}

class PrismaHarvestRepository implements HarvestRepository {
  constructor(private readonly db: PrismaLike) {}

  /** Vrací od nejstaršího k nejnovějšímu — tak, jak se kreslí graf zleva doprava. */
  async listRecent(days: number): Promise<HarvestEntry[]> {
    const rows = await this.db.harvestEntry.findMany({ orderBy: { date: 'desc' }, take: days })
    return rows.reverse().map(toHarvestEntry)
  }

  async totalDug(): Promise<Kilograms> {
    const result = await this.db.harvestEntry.aggregate({ _sum: { dugKg: true } })
    return Kilograms.parse(decimalToNumber(result._sum.dugKg ?? 0))
  }
}

class PrismaStorageReadingRepository implements StorageReadingRepository {
  constructor(private readonly db: PrismaLike) {}

  async latest(): Promise<StorageReading | null> {
    const row = await this.db.storageReading.findFirst({ orderBy: { recordedAt: 'desc' } })
    return row ? toStorageReading(row) : null
  }
}

export const createRepositories = (db: PrismaLike): RepositoryBundle => ({
  varieties: new PrismaVarietyRepository(db),
  orders: new PrismaOrderRepository(db),
  news: new PrismaNewsRepository(db),
  users: new PrismaUserRepository(db),
  fields: new PrismaFieldRepository(db),
  harvest: new PrismaHarvestRepository(db),
  storage: new PrismaStorageReadingRepository(db),
})
