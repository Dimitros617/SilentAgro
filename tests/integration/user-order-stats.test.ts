import { Prisma } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { UserRole } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { disconnect, resetDatabase, testPrisma, testUow } from './helpers/db'

/**
 * `orderStats` je syrové SQL, takže ho žádný testovací dvojník nepokryje — sémantiku
 * toho JOINu lze dokázat jedině proti skutečné databázi. Totéž platí pro
 * `claimGuestOrders`, který zapisuje hromadně přes `updateMany`.
 */

const REGISTERED_AT = new Date('2026-09-05T09:00:00Z')
const BEFORE_REGISTRATION = new Date('2026-09-01T08:00:00Z')
const AFTER_REGISTRATION = new Date('2026-09-08T08:00:00Z')

let orderSeq = 0

async function seedUser(email: string, createdAt: Date = REGISTERED_AT): Promise<number> {
  const row = await testPrisma.user.create({
    data: {
      email,
      name: 'Jan Novák',
      passwordHash: 'hash',
      createdAt,
      verifiedAt: new Date('2026-09-06T09:00:00Z'),
    },
  })
  return row.id
}

async function seedOrder(options: {
  email: string
  totalCzk: number
  createdAt: Date
  userId?: number | null
  cancelledAt?: Date | null
}): Promise<number> {
  orderSeq += 1
  const row = await testPrisma.order.create({
    data: {
      code: `#${2600 + orderSeq}`,
      publicToken: `token-${orderSeq}`,
      customerName: 'Jan Novák',
      customerEmail: options.email,
      customerPhone: '',
      note: '',
      deliveryMethod: 'PICKUP',
      paymentMethod: 'CASH',
      subtotalCzk: new Prisma.Decimal(options.totalCzk),
      deliveryFeeCzk: new Prisma.Decimal(0),
      totalCzk: new Prisma.Decimal(options.totalCzk),
      userId: options.userId ?? null,
      createdAt: options.createdAt,
      cancelledAt: options.cancelledAt ?? null,
    },
  })
  return row.id
}

const statsFor = async (userId: number) => {
  const rows = await testUow.repos.users.orderStats()
  return rows.find((row) => row.userId === userId)
}

beforeEach(async () => {
  await resetDatabase()
  orderSeq = 0
})

afterAll(async () => {
  await disconnect()
})

describe('orderStats proti skutečné databázi', () => {
  it('počítá jen objednávky přiřazené k účtu', async () => {
    // hostovskou objednávku na cizí adresu zadá kdokoli; kdyby se párovala přes
    // e-mail, nafoukla by cizímu účtu počet objednávek i útratu
    const userId = await seedUser('jan@email.cz')
    await seedOrder({ email: 'jan@email.cz', totalCzk: 100, createdAt: REGISTERED_AT, userId })
    await seedOrder({ email: 'jan@email.cz', totalCzk: 999, createdAt: AFTER_REGISTRATION })

    const stats = await statsFor(userId)

    expect(stats?.orderCount).toBe(1)
    expect(stats?.totalSpent.czk).toBe(100)
  })

  it('zrušené se do útraty nepočítají, ale vypisují se zvlášť', async () => {
    const userId = await seedUser('jan@email.cz')
    await seedOrder({ email: 'jan@email.cz', totalCzk: 100, createdAt: REGISTERED_AT, userId })
    await seedOrder({
      email: 'jan@email.cz',
      totalCzk: 250,
      createdAt: AFTER_REGISTRATION,
      userId,
      cancelledAt: new Date('2026-09-09T08:00:00Z'),
    })

    const stats = await statsFor(userId)

    expect(stats?.orderCount).toBe(2)
    expect(stats?.cancelledCount).toBe(1)
    expect(stats?.totalSpent.czk).toBe(100)
    expect(stats?.lastOrderAt).toEqual(AFTER_REGISTRATION)
  })

  it('objednávku nezapočítá dvěma účtům najednou', async () => {
    // přihlášený zákazník může do formuláře napsat cizí adresu — objednávka patří jemu
    const ownerId = await seedUser('jan@email.cz')
    const otherId = await seedUser('petr@email.cz')
    await seedOrder({ email: 'petr@email.cz', totalCzk: 100, createdAt: REGISTERED_AT, userId: ownerId })

    expect((await statsFor(ownerId))?.orderCount).toBe(1)
    expect((await statsFor(otherId))?.orderCount).toBe(0)
    expect((await statsFor(otherId))?.totalSpent.czk).toBe(0)
  })
})

describe('claimGuestOrders proti skutečné databázi', () => {
  it('připíše jen nepřiřazené objednávky na tutéž adresu z doby před registrací', async () => {
    const userId = await seedUser('jan@email.cz')
    const otherId = await seedUser('petr@email.cz')

    const claimed = await seedOrder({
      email: 'jan@email.cz',
      totalCzk: 100,
      createdAt: BEFORE_REGISTRATION,
    })
    const tooLate = await seedOrder({
      email: 'jan@email.cz',
      totalCzk: 100,
      createdAt: AFTER_REGISTRATION,
    })
    const foreignEmail = await seedOrder({
      email: 'petr@email.cz',
      totalCzk: 100,
      createdAt: BEFORE_REGISTRATION,
    })
    const alreadyOwned = await seedOrder({
      email: 'jan@email.cz',
      totalCzk: 100,
      createdAt: BEFORE_REGISTRATION,
      userId: otherId,
    })

    const count = await testUow.repos.orders.claimGuestOrders(
      userId,
      EmailAddress.of('jan@email.cz'),
      REGISTERED_AT,
    )

    expect(count).toBe(1)
    const owners = await testPrisma.order.findMany({
      where: { id: { in: [claimed, tooLate, foreignEmail, alreadyOwned] } },
      orderBy: { id: 'asc' },
      select: { userId: true },
    })
    expect(owners.map((row) => row.userId)).toEqual([userId, null, null, otherId])
  })

  it('po přiřazení se objednávka objeví ve statistikách i ve výpisu účtu', async () => {
    const userId = await seedUser('jan@email.cz')
    await seedOrder({ email: 'jan@email.cz', totalCzk: 100, createdAt: BEFORE_REGISTRATION })

    expect((await statsFor(userId))?.orderCount).toBe(0)

    await testUow.repos.orders.claimGuestOrders(
      userId,
      EmailAddress.of('jan@email.cz'),
      REGISTERED_AT,
    )

    expect((await statsFor(userId))?.orderCount).toBe(1)
    expect(await testUow.repos.orders.listForCustomer(userId)).toHaveLength(1)
  })
})

describe('čas vzniku účtu proti skutečné databázi', () => {
  it('uloží se hodnota z aplikace, ne výchozí z databáze', async () => {
    // proti tomuhle času se porovnává orders.created_at při přiřazení hostovských
    // objednávek; kdyby ho psala databáze, porovnávaly by se dvoje různé hodiny
    const created = await testUow.repos.users.create({
      email: EmailAddress.of('novy@email.cz'),
      name: 'Jan Novák',
      passwordHash: 'hash',
      role: UserRole.CUSTOMER,
      createdAt: BEFORE_REGISTRATION,
      verificationToken: null,
      verificationExpiresAt: null,
    })

    expect(created.createdAt).toEqual(BEFORE_REGISTRATION)

    const row = await testPrisma.user.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.createdAt).toEqual(BEFORE_REGISTRATION)
  })
})
