import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { CancelOrder } from '@/application/use-cases/cancel-order'
import { AdvanceOrderStatus, SetOrderPaid } from '@/application/use-cases/orders'
import { UpsertVariety } from '@/application/use-cases/varieties'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { ConflictError, InsufficientStockError } from '@/domain/errors'
import type { Clock, MailMessage, Mailer, TokenGenerator } from '@/domain/ports/services'
import { Iban } from '@/domain/value-objects/iban'
import { TemplateOrderMailComposer } from '@/infrastructure/mail/order-mail-composer'
import { disconnect, resetDatabase, testPrisma, testUow } from './helpers/db'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { GetOrderByToken } from '@/application/use-cases/get-order-by-token'
import { makeOrderMailComposer } from '../unit/application/fakes'

class CollectingMailer implements Mailer {
  readonly sent: MailMessage[] = []
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}

const clock: Clock = { now: () => new Date('2026-09-10T18:00:00Z') }

let tokenCounter = 0
const tokenGenerator: TokenGenerator = {
  publicToken: () => `token-${++tokenCounter}`,
}

const bank = { iban: Iban.of('CZ6508000000192000145399'), accountNumber: '2000145399/0800' }

const makeUseCase = (uow: UnitOfWork = testUow) =>
  new ReserveOrder({
    uow,
    clock,
    tokenGenerator,
    composer: new TemplateOrderMailComposer({
      bank,
      farm: {
        name: 'SilentAgro',
        legalName: 'Silent Industries',
        companyId: '12345678',
        email: 'farma@silentagro.cz',
        phone: '+420 777 123 456',
      },
      delivery: { feeCzk: 60, freeAboveCzk: 600, radiusKm: 20, holdDays: 5 },
      config: { farmerEmail: 'farma@silentagro.cz', publicBaseUrl: 'https://silentagro.cz' },
    }),
    deliveryPolicy: { feeCzk: 60, freeAboveCzk: 600, radiusKm: 20, holdDays: 5 },
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
  requestKey: randomUUID(),
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
  it('opakování stejného pokusu vrátí původní objednávku i po vyprodání a změně nabídky', async () => {
    const varietyId = await seedVariety(1)
    const input = orderInput(varietyId, 1)
    const first = await makeUseCase().execute(input)
    await testPrisma.variety.update({ where: { id: varietyId }, data: { name: 'Nový název', pricePerKgCzk: 999, isActive: false } })

    expect(await makeUseCase().execute(input)).toEqual(first)
    expect(await testPrisma.order.count()).toBe(1)
    expect(await testPrisma.mailOutbox.count()).toBe(2)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(0)
  })

  it('pět souběžných stejných pokusů vytvoří jednu objednávku a jednu sadu zpráv', async () => {
    const varietyId = await seedVariety(10)
    const input = orderInput(varietyId, 2)
    const results = await Promise.all(Array.from({ length: 5 }, () => makeUseCase().execute(input)))
    expect(new Set(results.map((result) => result.publicToken)).size).toBe(1)
    expect(await testPrisma.order.count()).toBe(1)
    expect(await testPrisma.mailOutbox.count()).toBe(2)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(8)
  })

  it('stejný klíč s jiným obsahem nepřiřadí ani nezmění původní rezervaci', async () => {
    const varietyId = await seedVariety(10)
    const input = orderInput(varietyId, 1)
    await makeUseCase().execute(input)
    await expect(makeUseCase().execute({ ...input, customer: { ...input.customer, email: 'cizi@example.cz' } })).rejects.toThrow(ConflictError)
    await expect(makeUseCase().execute({ ...input, items: [{ varietyId, quantityKg: 2 }] })).rejects.toThrow(ConflictError)
    expect(await testPrisma.order.count()).toBe(1)
    expect(await testPrisma.mailOutbox.count()).toBe(2)
  })

  it('chyba po vložení zprávy vrátí sklad, objednávku, outbox i klíč pokusu', async () => {
    const varietyId = await seedVariety(10)
    const input = orderInput(varietyId, 2)
    const failingUow: UnitOfWork = {
      repos: testUow.repos,
      runInTransaction(work) {
        return testUow.runInTransaction((repos) => work({
          ...repos,
          outbox: {
            async enqueue(key, message) {
              await repos.outbox.enqueue(key, message)
              throw new Error('Simulovaný pád před commitem')
            },
          },
        }))
      },
    }
    await expect(makeUseCase(failingUow).execute(input)).rejects.toThrow('Simulovaný pád')
    expect(await testPrisma.order.count()).toBe(0)
    expect(await testPrisma.mailOutbox.count()).toBe(0)
    expect(await testPrisma.reservationRequest.count()).toBe(0)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(10)
    await makeUseCase().execute(input)
    expect(await testPrisma.order.count()).toBe(1)
  })

  it('načítá účtované částky a slevu bez přepočtu podle aktuálních pravidel', async () => {
    const varietyId = await seedVariety(10)
    const result = await makeUseCase().execute(orderInput(varietyId, 2))
    // Příklad historické objednávky s jiným zaokrouhlením řádku a slevou.
    await testPrisma.orderItem.updateMany({ data: { lineTotalCzk: '37.51' } })
    await testPrisma.order.update({ where: { publicToken: result.publicToken }, data: {
      subtotalCzk: '37.51', discountCzk: '7.51', totalCzk: '30.00', pricingVersion: 2,
    } })
    await testPrisma.variety.update({ where: { id: varietyId }, data: { pricePerKgCzk: 999 } })
    const order = await testUow.repos.orders.findByPublicToken(result.publicToken)
    expect(order?.items[0]?.lineTotal.czk).toBe(37.51)
    expect(order?.subtotal.czk).toBe(37.51)
    expect(order?.discount.czk).toBe(7.51)
    expect(order?.total.czk).toBe(30)
    expect(order?.pricingVersion).toBe(2)
    const view = await new GetOrderByToken({ uow: testUow, presenter: makeOrderMailComposer() }).execute(result.publicToken)
    expect(view.totalLabel).toBe('30 Kč')
    expect(view.discountLabel).toContain('7,51')
  })

  it('uloží objednávku, položky a odečte sklad', async () => {
    const varietyId = await seedVariety(10, 22)
    const mailer = new CollectingMailer()

    const result = await makeUseCase().execute(orderInput(varietyId, 2.5))

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
    expect(mailer.sent).toHaveLength(0)
    expect(await testPrisma.mailOutbox.count()).toBe(2)
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

describe('souběh administrace a rezervací', () => {
  const notifier = {
    orderPlaced: async () => [],
    orderCancelled: () => ({ to: 'jan@example.cz', subject: 'Zrušení', text: 'Zrušení rezervace' }),
  }

  it('dvě souběžná zrušení vrátí sklad právě jednou', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute(orderInput(varietyId, 2))
    const cancel = new CancelOrder({ uow: testUow, clock, composer: notifier })
    const results = await Promise.allSettled([cancel.execute(1, 'První zrušení'), cancel.execute(1, 'Druhé zrušení')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(10)
  })

  it('souběžné označení platby zachová čas prvního zápisu', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute(orderInput(varietyId, 2))
    let tick = 0
    const changingClock = { now: () => new Date(clock.now().getTime() + ++tick * 1000) }
    const paid = new SetOrderPaid({ uow: testUow, clock: changingClock })
    await Promise.all([paid.execute(1, true), paid.execute(1, true), paid.execute(1, true)])
    expect(tick).toBe(1)
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: 1 } })).paidAt)
      .toEqual(new Date(clock.now().getTime() + 1000))
  })

  it('souběžné kliky se stejným očekávaným stavem provedou jediný přechod', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute(orderInput(varietyId, 2))
    const advance = new AdvanceOrderStatus({ uow: testUow })
    const results = await Promise.allSettled([
      advance.execute(1, OrderStatus.NEW), advance.execute(1, OrderStatus.NEW),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: 1 } })).status).toBe(OrderStatus.READY)
  })

  it('starý formulář nepřepíše sklad po potvrzené rezervaci', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute(orderInput(varietyId, 2))
    await expect(new UpsertVariety({ uow: testUow }).execute({
      id: varietyId, expectedStockKg: 10, name: 'Přejmenováno', tag: '', description: '', colorHex: '#c98a2b',
      stockKg: 20, capacityKg: 200, priceCzk: 20,
    })).rejects.toThrow(ConflictError)
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(8)
  })

  it('zrušená objednávka zmizí ze všech aktivních souhrnů', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute({ ...orderInput(varietyId, 2), payment: PaymentMethod.QR_CODE })
    const since = new Date('2026-09-01T00:00:00Z')
    expect((await testUow.repos.orders.reservedKg()).value).toBe(2)
    expect((await testUow.repos.orders.orderValueSince(since)).czk).toBe(40)
    expect(await testUow.repos.orders.countAwaitingPayment(since)).toBe(1)
    await new CancelOrder({ uow: testUow, clock, composer: notifier }).execute(1, 'Zákazník zrušil rezervaci')
    expect((await testUow.repos.orders.reservedKg()).value).toBe(0)
    expect((await testUow.repos.orders.orderValueSince(since)).czk).toBe(0)
    expect(await testUow.repos.orders.countAwaitingPayment(since)).toBe(0)
    expect(await testUow.repos.orders.countByStatus(OrderStatus.NEW)).toBe(0)
  })

  it('přejmenování odrůdy nezmění historii a zrušení vrátí sklad podle ID', async () => {
    const varietyId = await seedVariety(10)
    await makeUseCase().execute(orderInput(varietyId, 2))
    await testPrisma.variety.update({ where: { id: varietyId }, data: { name: 'Nový název', pricePerKgCzk: 99 } })
    const order = await testUow.repos.orders.findById(1)
    expect(order?.items[0]?.varietyName).toBe('Bernie')
    expect(order?.total.czk).toBe(40)
    await new CancelOrder({ uow: testUow, clock, composer: notifier }).execute(1, 'Zákazník zrušil rezervaci')
    expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: varietyId } })).stockKg)).toBe(10)
  })
})
