import { describe, expect, it } from 'vitest'
import { GetAdminOverview } from '@/application/use-cases/admin-overview'
import { GetStockOverview, ListNews, ListVarieties } from '@/application/use-cases/catalog'
import { Field, HarvestEntry, StorageReading } from '@/domain/entities'
import { OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, FieldStatus, NewsTag, OrderStatus, PaymentMethod } from '@/domain/enums'
import type { NewOrderInput } from '@/domain/ports/repositories'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { fixedClock, makeBundle, makeVariety, SequentialTokenGenerator } from './fakes'

const clock = fixedClock('2026-09-14T12:00:00Z')
const orderTokens = new SequentialTokenGenerator()

function orderInput(overrides: Partial<NewOrderInput> = {}): NewOrderInput {
  return {
    customer: { name: 'Jan Novák', email: EmailAddress.of('jan@example.cz'), phone: '', note: '' },
    items: [OrderItem.create({ varietyId: 1, varietyName: 'Bernie', unitPrice: Money.fromCzk(22), quantity: Kilograms.of(1) })],
    delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
    subtotal: Money.fromCzk(22), deliveryFee: Money.zero(), discount: Money.zero(), total: Money.fromCzk(22),
    pricingVersion: 1, userId: null, publicToken: orderTokens.publicToken(), createdAt: clock.now(),
    ...overrides,
  }
}

describe('katalog a přehledy', () => {
  it('vynechá neaktivní odrůdu a vyprodanou zobrazí jako nedostupnou', async () => {
    const bundle = makeBundle({ varieties: [
      makeVariety({ id: 1, name: 'Bernie', stockKg: 12 }),
      makeVariety({ id: 2, name: 'Skrytá', stockKg: 30, isActive: false }),
      makeVariety({ id: 3, name: 'Vyprodaná', stockKg: 0 }),
    ] })

    const result = await new ListVarieties({ uow: bundle.uow }).execute()

    expect(result).toEqual([
      expect.objectContaining({ id: 1, name: 'Bernie', stockKg: 12, available: true, priceLabel: '22 Kč' }),
      expect.objectContaining({ id: 3, name: 'Vyprodaná', stockKg: 0, available: false, stockLabel: 'vyprodáno' }),
    ])
  })

  it.each([
    { limit: undefined, expectedDays: [14, 13, 12, 11, 10, 9] },
    { limit: 2, expectedDays: [14, 13] },
    { limit: 0, expectedDays: [] },
  ])('vrátí nejnovější novinky v sestupném pořadí při limitu $limit', async ({ limit, expectedDays }) => {
    const bundle = makeBundle()
    for (const day of [13, 11, 14, 9, 12, 10, 8]) {
      await bundle.news.create({
        title: `Výkop ${day}`, body: 'Dnes jsme sklízeli.', tag: NewsTag.HARVEST,
        imageUrl: null, publishedAt: new Date(Date.UTC(2026, 8, day, 10)), authorId: null,
      })
    }

    const result = await new ListNews({ uow: bundle.uow }).execute(limit)

    expect(result).toEqual(expectedDays.map(day => expect.objectContaining({
      title: `Výkop ${day}`, tagLabel: 'Sklizeň',
    })))
  })

  it('sestaví skladový přehled včetně polí, sklizně, čidla a rezervace', async () => {
    const bundle = makeBundle({
      varieties: [makeVariety({ stockKg: 12, capacityKg: 20 })],
      fields: [Field.rehydrate({
        id: 1, name: 'Severní pole', varietyName: 'Bernie', areaM2: 100,
        status: FieldStatus.GROWING, yieldKg: Kilograms.of(18), isEstimate: true, sortOrder: 0,
      })],
      harvest: [HarvestEntry.rehydrate({
        id: 1, date: new Date('2026-09-13T00:00:00Z'), dug: Kilograms.of(8), stock: Kilograms.of(12),
      })],
      storage: StorageReading.rehydrate({
        id: 1, recordedAt: new Date('2026-09-14T11:00:00Z'), temperatureC: 6, humidityPct: 80,
      }),
    })
    await bundle.orders.create(orderInput())

    const result = await new GetStockOverview({ uow: bundle.uow, clock }).execute()

    expect(result.totalKgLabel).toBe('12')
    expect(result.kpis.map((kpi) => kpi.value)).toEqual(['12 kg', '1 kg', '8 kg', '6 °C'])
    expect(result.fields[0]).toMatchObject({ name: 'Severní pole', yieldLabel: '~18 kg' })
    expect(result.updatedAtLabel).toBe('14. září v 14:00')
  })

  it('prázdný sklad nepředstírá data ze sklizně ani čidla', async () => {
    const bundle = makeBundle()

    const result = await new GetStockOverview({ uow: bundle.uow, clock }).execute()

    expect(result.totalKg).toBe(0)
    expect(result.harvest).toEqual([])
    expect(result.kpis[0]?.delta).toBe('—')
    expect(result.kpis[3]).toMatchObject({ value: '—', delta: 'čidlo nehlásí' })
  })

  it('prázdný admin přehled má nulové částky a nepočítá průměr dělením nulou', async () => {
    const bundle = makeBundle()
    const result = await new GetAdminOverview({ uow: bundle.uow, clock }).execute()

    expect(result.kpis).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Sklad celkem', value: '0 kg' }),
      expect.objectContaining({ label: 'Nové objednávky', value: '0' }),
      expect.objectContaining({ label: 'Čeká na platbu', value: '0' }),
      expect.objectContaining({ label: 'Objednáno za 30 dní', value: '0 Kč', delta: 'průměr 0 Kč/kg' }),
    ]))
    expect(result.harvestSummary).toBe('0 kg vykopáno v posledních 0 záznamech')
    expect(result.harvestLast).toBe('—')
  })

  it('admin přehled rozlišuje nové objednávky, nezaplacené převody a uložené částky za 30 dní', async () => {
    const bundle = makeBundle({ varieties: [
      makeVariety({ id: 1, stockKg: 10, priceCzk: 20 }),
      makeVariety({ id: 2, stockKg: 5, priceCzk: 30 }),
      makeVariety({ id: 3, stockKg: 100, priceCzk: 200, isActive: false }),
    ] })
    const boundary = new Date('2026-08-15T12:00:00Z')
    // Přesná hranice patří do období; jedna milisekunda před ní už ne.
    await bundle.orders.create(orderInput({ payment: PaymentMethod.BANK_TRANSFER, createdAt: boundary }))
    await bundle.orders.create(orderInput({ payment: PaymentMethod.BANK_TRANSFER, createdAt: new Date(boundary.getTime() - 1) }))
    await bundle.orders.create(orderInput({ payment: PaymentMethod.QR_CODE }))
    await bundle.orders.create(orderInput({ payment: PaymentMethod.CASH }))
    const paid = await bundle.orders.create(orderInput({ payment: PaymentMethod.BANK_TRANSFER }))
    await bundle.orders.setPaid(paid.id, clock.now())
    const cancelled = await bundle.orders.create(orderInput({ payment: PaymentMethod.BANK_TRANSFER }))
    await bundle.orders.cancel(cancelled.id, clock.now(), 'Zákazník zrušil rezervaci')
    const ready = await bundle.orders.create(orderInput({
      payment: PaymentMethod.BANK_TRANSFER, discount: Money.fromCzk(2), total: Money.fromCzk(20),
    }))
    await bundle.orders.updateStatus(ready.id, OrderStatus.READY)

    const result = await new GetAdminOverview({ uow: bundle.uow, clock }).execute()

    expect(result.kpis).toEqual([
      expect.objectContaining({ label: 'Sklad celkem', value: '15 kg', delta: 'napříč 2 odrůdami' }),
      expect.objectContaining({ label: 'Nové objednávky', value: '5' }),
      expect.objectContaining({ label: 'Čeká na platbu', value: '3', tone: 'green' }),
      expect.objectContaining({ label: 'Objednáno za 30 dní', value: '108 Kč', delta: 'průměr 25 Kč/kg' }),
    ])
  })

  it('graf a admin souhrn zahrnou posledních 14 sklizní, celková sklizeň i starší záznam', async () => {
    const entries: HarvestEntry[] = []
    for (let id = 1; id <= 15; id += 1) {
      entries.push(HarvestEntry.rehydrate({
        id, date: new Date(Date.UTC(2026, 7, id)), dug: Kilograms.of(id), stock: Kilograms.of(id * 2),
      }))
    }
    const bundle = makeBundle({ harvest: entries })

    const admin = await new GetAdminOverview({ uow: bundle.uow, clock }).execute()
    const stock = await new GetStockOverview({ uow: bundle.uow, clock }).execute()

    expect(admin.harvest).toHaveLength(14)
    expect(admin.harvest[0]).toMatchObject({ dugKg: 2, stockKg: 4 })
    expect(admin.harvest.at(-1)).toMatchObject({ dugKg: 15, stockKg: 30 })
    expect(admin.harvestSummary).toBe('119 kg vykopáno v posledních 14 záznamech')
    expect(admin.harvestLast).toBe('naposledy 30 kg na skladě')
    expect(stock.harvest).toEqual(admin.harvest)
    expect(stock.kpis[2]).toMatchObject({ value: '120 kg' })
  })
})
