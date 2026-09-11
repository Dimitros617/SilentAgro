import { Prisma } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import { InsufficientStockError } from '@/domain/errors'
import type { Clock, Logger, MailMessage, Mailer, TokenGenerator } from '@/domain/ports/services'
import { Iban } from '@/domain/value-objects/iban'
import { MailOrderNotifier } from '@/infrastructure/mail/order-notifier'
import { disconnect, resetDatabase, testPrisma, testUow } from './helpers/db'

class CollectingMailer implements Mailer {
  readonly sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} }
const clock: Clock = { now: () => new Date('2026-09-10T18:00:00Z') }

let tokenCounter = 0
const tokenGenerator: TokenGenerator = {
  publicToken: () => `token-${++tokenCounter}`,
}

const bank = { iban: Iban.of('CZ6508000000192000145399'), accountNumber: '2000145399/0800' }

const makeUseCase = (mailer: Mailer = new CollectingMailer()) =>
  new ReserveOrder({
    uow: testUow,
    clock,
    tokenGenerator,
    notifier: new MailOrderNotifier({
      mailer,
      logger: silentLogger,
      bank,
      config: { farmerEmail: 'farma@silentagro.cz', publicBaseUrl: 'https://silentagro.cz' },
    }),
  })

async function seedVariety(stockKg: number, priceCzk = 20): Promise<number> {
  const row = await testPrisma.variety.create({
    data: {
      slug: 'bernie',
      name: 'Bernie',
      tag: 'lahůdková',
      description: 'Popis',
      colorHex: '#c98a2b',
      pricePerKgCzk: new Prisma.Decimal(priceCzk),
      stockKg: new Prisma.Decimal(stockKg),
      capacityKg: new Prisma.Decimal(200),
      sortOrder: 0,
    },
  })
  return row.id
}

const orderInput = (varietyId: number, quantityKg: number) => ({
  customer: { name: 'Jan Novák', email: 'jan@email.cz', phone: '+420777123456', note: '' },
  delivery: DeliveryMethod.PICKUP,
  payment: PaymentMethod.CASH,
  items: [{ varietyId, quantityKg }],
  userId: null,
})

beforeEach(async () => {
  await resetDatabase()
  tokenCounter = 0
})

afterAll(async () => {
  await disconnect()
})

describe('ReserveOrder proti skutečné databázi', () => {
  it('uloží objednávku, položky a odečte sklad', async () => {
    const varietyId = await seedVariety(10, 22)
    const mailer = new CollectingMailer()

    const result = await makeUseCase(mailer).execute(orderInput(varietyId, 2.5))

    expect(result.code).toBe('#2610')

    const stored = await testPrisma.order.findUniqueOrThrow({
      where: { code: '#2610' },
      include: { items: true },
    })
    expect(Number(stored.totalCzk)).toBe(55)
    expect(stored.items).toHaveLength(1)
    expect(Number(stored.items[0]?.quantityKg)).toBe(2.5)
    expect(stored.items[0]?.varietyName).toBe('Bernie')

    const variety = await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })
    expect(Number(variety.stockKg)).toBe(7.5)
    expect(mailer.sent).toHaveLength(2)
  })

  it('dvě souběžné rezervace na poslední kilogram: uspěje právě jedna', async () => {
    // Tohle je jediný důvod, proč UnitOfWork a lockForUpdate existují.
    const varietyId = await seedVariety(1, 20)
    const useCase = makeUseCase()

    const results = await Promise.allSettled([
      useCase.execute(orderInput(varietyId, 1)),
      useCase.execute(orderInput(varietyId, 1)),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError)

    const variety = await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })
    expect(Number(variety.stockKg)).toBe(0)
    expect(await testPrisma.order.count()).toBe(1)
  })

  it('pět souběžných rezervací po kilu na tři kila projde přesně třikrát', async () => {
    const varietyId = await seedVariety(3, 20)
    const useCase = makeUseCase()

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => useCase.execute(orderInput(varietyId, 1))),
    )

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(0)
    expect(await testPrisma.order.count()).toBe(3)
  })

  it('neúspěšná rezervace nezanechá řádek ani neodečte sklad', async () => {
    const varietyId = await seedVariety(1, 20)

    await expect(makeUseCase().execute(orderInput(varietyId, 5))).rejects.toThrow(
      InsufficientStockError,
    )

    expect(await testPrisma.order.count()).toBe(0)
    expect(await testPrisma.orderItem.count()).toBe(0)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(1)
  })

  it('při nedostatku u druhé odrůdy se transakce vrátí celá', async () => {
    const first = await seedVariety(10, 20)
    const second = await testPrisma.variety.create({
      data: {
        slug: 'marabel',
        name: 'Marabel',
        tag: 'polopozdní',
        description: 'Popis',
        colorHex: '#8a9a3f',
        pricePerKgCzk: new Prisma.Decimal(17),
        stockKg: new Prisma.Decimal(1),
        capacityKg: new Prisma.Decimal(100),
        sortOrder: 1,
      },
    })

    await expect(
      makeUseCase().execute({
        ...orderInput(first, 2),
        items: [
          { varietyId: first, quantityKg: 2 },
          { varietyId: second.id, quantityKg: 5 },
        ],
      }),
    ).rejects.toThrow(InsufficientStockError)

    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: first } })).stockKg)).toBe(10)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: second.id } })).stockKg)).toBe(1)
    expect(await testPrisma.order.count()).toBe(0)
  })

  it('objednávky dostávají navazující kódy a různé veřejné tokeny', async () => {
    const varietyId = await seedVariety(100, 20)
    const useCase = makeUseCase()

    const first = await useCase.execute(orderInput(varietyId, 1))
    const second = await useCase.execute(orderInput(varietyId, 1))

    expect([first.code, second.code]).toEqual(['#2610', '#2611'])
    expect(first.publicToken).not.toBe(second.publicToken)

    // dočasný kód použitý při vkládání nesmí v databázi zůstat
    const leftovers = await testPrisma.order.count({ where: { code: { startsWith: 'tmp-' } } })
    expect(leftovers).toBe(0)
  })

  it('veřejný token dohledá objednávku, kód objednávky ne', async () => {
    const varietyId = await seedVariety(10, 20)
    const result = await makeUseCase().execute(orderInput(varietyId, 1))

    expect(await testPrisma.order.findUnique({ where: { publicToken: result.publicToken } })).not.toBeNull()
    expect(await testPrisma.order.findUnique({ where: { publicToken: '2610' } })).toBeNull()
  })
})
