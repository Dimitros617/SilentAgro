import type { PrismaLike } from './types'
import { Prisma } from '@prisma/client'
import type { User } from '@/domain/entities'
import type { TransactionUserRepository, NewUserInput, UserOrderStats } from '@/domain/ports/repositories'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { Money } from '@/domain/value-objects/money'
import { toUser, decimalToNumber } from './mappers'
import { requireTransaction } from './transaction'
import type { PageRequest, UserFilter } from '@/domain/ports/pagination'

export class PrismaUserRepository implements TransactionUserRepository {
  constructor(private readonly db: PrismaLike) {}

  async listPage(page: PageRequest, filter: UserFilter): Promise<User[]> {
    const rows = await this.db.user.findMany({
      where: this.whereFilter(filter), orderBy: { id: 'desc' },
      skip: (page.page - 1) * page.pageSize, take: page.pageSize,
    })
    return rows.map(toUser)
  }

  async countFiltered(filter: UserFilter): Promise<number> {
    return this.db.user.count({ where: this.whereFilter(filter) })
  }

  private whereFilter(filter: UserFilter): Prisma.UserWhereInput {
    const conditions: Prisma.UserWhereInput[] = []
    if (filter.query) conditions.push({ OR: [
      { name: { contains: filter.query } }, { email: { contains: filter.query } },
    ] })
    if (filter.onlyProblems) conditions.push({ OR: [{ verifiedAt: null }, { deactivatedAt: { not: null } }] })
    return { AND: conditions }
  }

  async orderStatsForUsers(userIds: readonly number[]): Promise<UserOrderStats[]> {
    if (userIds.length === 0) return []
    return this.queryOrderStats(userIds)
  }

  async findByEmail(email: EmailAddress): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { email: email.value } })
    return row ? toUser(row) : null
  }

  async findById(id: number): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } })
    return row ? toUser(row) : null
  }

  async lockForUpdate(id: number): Promise<User | null> {
    requireTransaction(this.db)
    const rows = await this.db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM users WHERE id = ${id} FOR UPDATE
    `
    if (rows.length === 0) return null
    return this.findById(id)
  }

  async lockByVerificationToken(token: string): Promise<User | null> {
    requireTransaction(this.db)
    const rows = await this.db.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM users WHERE verification_token = ${token} FOR UPDATE
    `
    if (rows.length === 0) return null
    return this.findByVerificationToken(token)
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
        sessionsInvalidBefore: user.sessionsInvalidBefore,
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
    return this.queryOrderStats()
  }

  async orderStatsForUser(userId: number): Promise<UserOrderStats | null> {
    const rows = await this.queryOrderStats([userId])
    return rows[0] ?? null
  }

  private async queryOrderStats(userIds?: readonly number[]): Promise<UserOrderStats[]> {
    const filter = userIds === undefined ? Prisma.empty : Prisma.sql`WHERE u.id IN (${Prisma.join([...userIds])})`
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
      ${filter}
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
