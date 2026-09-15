import type { PrismaLike } from './types'
import { Prisma } from '@prisma/client'
import type { Order } from '@/domain/entities'
import { OrderStatus, PaymentMethod } from '@/domain/enums'
import { ConflictError, NotFoundError } from '@/domain/errors'
import type { TransactionOrderRepository, NewOrderInput } from '@/domain/ports/repositories'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { orderCodeFor } from '@/shared/order-code'
import { toOrder, decimalToNumber } from './mappers'
import { requireTransaction } from './transaction'
import type { OrderFilter, PageRequest } from '@/domain/ports/pagination'

const orderInclude = { items: { orderBy: { id: 'asc' } } } as const

export class PrismaOrderRepository implements TransactionOrderRepository {
  constructor(private readonly db: PrismaLike) {}

  async listPage(page: PageRequest, filter: OrderFilter): Promise<Order[]> {
    const rows = await this.db.order.findMany({
      where: this.whereFilter(filter), orderBy: { id: 'desc' },
      skip: (page.page - 1) * page.pageSize, take: page.pageSize, include: orderInclude,
    })
    return rows.map(toOrder)
  }

  async countFiltered(filter: OrderFilter): Promise<number> {
    return this.db.order.count({ where: this.whereFilter(filter) })
  }

  private whereFilter(filter: OrderFilter): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {}
    if (filter.userId !== undefined) where.userId = filter.userId
    if (filter.status) where.status = filter.status
    if (filter.cancelled !== undefined) {
      where.cancelledAt = filter.cancelled ? { not: null } : null
    }
    if (filter.query) {
      where.OR = [
        { code: { contains: filter.query } },
        { customerName: { contains: filter.query } },
        { customerEmail: { contains: filter.query } },
      ]
    }
    return where
  }

  /**
   * Vloží objednávku a teprve pak jí podle přiděleného `id` dopočte kód.
   *
   * Kód nejde spočítat dopředu: `COUNT(*) + 1` by dvěma souběžným transakcím vrátil
   * stejné číslo a druhý insert by spadl na UNIQUE. Dočasný kód je odvozený z veřejného
   * tokenu, takže je unikátní už při vkládání.
   */
  async create(input: NewOrderInput): Promise<Order> {
    requireTransaction(this.db)
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
        discountCzk: new Prisma.Decimal(input.discount.czk),
        pricingVersion: input.pricingVersion,
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

  async lockForUpdate(id: number): Promise<Order | null> {
    requireTransaction(this.db)
    // UnitOfWork používá ReadCommitted, takže následné čtení vidí stav po získání zámku.
    const rows = await this.db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM orders WHERE id = ${id} FOR UPDATE
    `
    if (rows.length === 0) return null
    return this.findById(id)
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
    return this.db.order.count({ where: { status, cancelledAt: null } })
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
      where: { order: { cancelledAt: null, status: { in: [OrderStatus.NEW, OrderStatus.READY] } } },
    })
    return Kilograms.parse(decimalToNumber(result._sum.quantityKg ?? 0))
  }

  async orderValueSince(since: Date): Promise<Money> {
    const result = await this.db.order.aggregate({
      _sum: { totalCzk: true },
      where: { cancelledAt: null, createdAt: { gte: since } },
    })
    return Money.fromCzk(decimalToNumber(result._sum.totalCzk ?? 0))
  }

  async countAwaitingPayment(since: Date): Promise<number> {
    return this.db.order.count({
      where: {
        paidAt: null,
        cancelledAt: null,
        createdAt: { gte: since },
        paymentMethod: { in: [PaymentMethod.BANK_TRANSFER, PaymentMethod.QR_CODE] },
      },
    })
  }
}
