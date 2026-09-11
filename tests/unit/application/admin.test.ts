import { describe, expect, it } from 'vitest'
import {
  AdvanceOrderStatus,
  DeactivateVariety,
  DeleteNews,
  ListOrders,
  PublishNews,
  SetOrderPaid,
  UpsertVariety,
} from '@/application/use-cases/admin'
import { DeliveryMethod, NewsTag, OrderStatus, PaymentMethod } from '@/domain/enums'
import { NotFoundError, ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { OrderItem } from '@/domain/entities/order'
import { fixedClock, makeBundle, makeVariety } from './fakes'

const clock = fixedClock('2026-09-10T18:30:00Z')

const seedOrder = async (
  bundle: ReturnType<typeof makeBundle>,
  payment: PaymentMethod = PaymentMethod.CASH,
) =>
  bundle.orders.create({
    customer: {
      name: 'Jan Novák',
      email: EmailAddress.of('jan@email.cz'),
      phone: '',
      note: '',
    },
    items: [
      OrderItem.create({
        varietyId: 1,
        varietyName: 'Bernie',
        unitPrice: Money.fromCzk(22),
        quantity: Kilograms.of(2.5),
      }),
    ],
    delivery: DeliveryMethod.PICKUP,
    payment,
    subtotal: Money.fromCzk(55),
    deliveryFee: Money.zero(),
    total: Money.fromCzk(55),
    userId: null,
    publicToken: 'token-1',
    createdAt: new Date('2026-09-10T12:00:00Z'),
  })

describe('AdvanceOrderStatus', () => {
  it('posouvá stav v cyklu', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle)
    const useCase = new AdvanceOrderStatus({ uow: bundle.uow })

    expect((await useCase.execute(1)).status).toBe(OrderStatus.READY)
    expect((await useCase.execute(1)).status).toBe(OrderStatus.COLLECTED)
    expect((await useCase.execute(1)).status).toBe(OrderStatus.NEW)
  })

  it('u neexistující objednávky skončí chybou', async () => {
    const bundle = makeBundle()
    await expect(new AdvanceOrderStatus({ uow: bundle.uow }).execute(999)).rejects.toThrow(
      NotFoundError,
    )
  })

  it('nemění stav zaplacení', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle)
    await bundle.orders.setPaid(1, new Date('2026-09-09T10:00:00Z'))

    await new AdvanceOrderStatus({ uow: bundle.uow }).execute(1)
    expect(bundle.orders.get(1)?.isPaid).toBe(true)
  })
})

describe('SetOrderPaid', () => {
  it('zaškrtnutí zapíše čas z hodin', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle)
    const result = await new SetOrderPaid({ uow: bundle.uow, clock }).execute(1, true)

    expect(result.isPaid).toBe(true)
    expect(result.paidAtLabel).toBe('10. září 2026')
    expect(bundle.orders.get(1)?.paidAt).toEqual(new Date('2026-09-10T18:30:00Z'))
  })

  it('odškrtnutí čas smaže', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle)
    await bundle.orders.setPaid(1, new Date('2026-09-01T10:00:00Z'))

    const result = await new SetOrderPaid({ uow: bundle.uow, clock }).execute(1, false)
    expect(result.isPaid).toBe(false)
    expect(result.paidAtLabel).toBeNull()
    expect(bundle.orders.get(1)?.paidAt).toBeNull()
  })

  it('opakované zaškrtnutí původní čas nepřepíše', async () => {
    // dvojklik nebo dva otevřené taby nesmí farmáři přepsat, kdy peníze dorazily
    const bundle = makeBundle()
    await seedOrder(bundle)
    const original = new Date('2026-09-01T10:00:00Z')
    await bundle.orders.setPaid(1, original)

    await new SetOrderPaid({ uow: bundle.uow, clock }).execute(1, true)
    expect(bundle.orders.get(1)?.paidAt).toEqual(original)
  })

  it('nemění stav objednávky', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle)
    await new SetOrderPaid({ uow: bundle.uow, clock }).execute(1, true)

    expect(bundle.orders.get(1)?.status).toBe(OrderStatus.NEW)
  })

  it('u neexistující objednávky skončí chybou', async () => {
    const bundle = makeBundle()
    await expect(
      new SetOrderPaid({ uow: bundle.uow, clock }).execute(999, true),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('ListOrders', () => {
  it('vypíše objednávky s popisky a stavem platby', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle, PaymentMethod.QR_CODE)

    const rows = await new ListOrders({ uow: bundle.uow }).execute(10)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.code).toBe('#2610')
    expect(rows[0]?.statusLabel).toBe('Nová')
    expect(rows[0]?.requiresTransfer).toBe(true)
    expect(rows[0]?.isPaid).toBe(false)
    expect(rows[0]?.paidAtLabel).toBeNull()
  })

  it('u platby hotově neoznačuje objednávku jako čekající na převod', async () => {
    const bundle = makeBundle()
    await seedOrder(bundle, PaymentMethod.CASH)

    const rows = await new ListOrders({ uow: bundle.uow }).execute(10)
    expect(rows[0]?.requiresTransfer).toBe(false)
  })
})

describe('UpsertVariety', () => {
  const input = {
    id: null,
    name: 'Růžová Adéla',
    tag: 'raná',
    description: 'Popis',
    colorHex: '#c98a2b',
    priceCzk: 18,
    stockKg: 150,
    capacityKg: 150,
  }

  it('nová odrůda dostane slug bez diakritiky', async () => {
    const bundle = makeBundle()
    const view = await new UpsertVariety({ uow: bundle.uow }).execute(input)
    expect(view.slug).toBe('ruzova-adela')
  })

  it('kolidující slug dostane číselnou příponu', async () => {
    const bundle = makeBundle({ varieties: [makeVariety({ id: 1, slug: 'bernie' })] })
    const view = await new UpsertVariety({ uow: bundle.uow }).execute({ ...input, name: 'Bernie' })
    expect(view.slug).toBe('bernie-2')
  })

  it('úprava existující odrůdy slug nemění', async () => {
    const bundle = makeBundle({ varieties: [makeVariety({ id: 1, slug: 'bernie' })] })
    const view = await new UpsertVariety({ uow: bundle.uow }).execute({
      ...input,
      id: 1,
      name: 'Bernie Extra',
    })
    expect(view.slug).toBe('bernie')
    expect(view.name).toBe('Bernie Extra')
  })

  it('odmítne prázdný název', async () => {
    const bundle = makeBundle()
    await expect(
      new UpsertVariety({ uow: bundle.uow }).execute({ ...input, name: '  ' }),
    ).rejects.toThrow(ValidationError)
  })

  it('odmítne zápornou cenu', async () => {
    const bundle = makeBundle()
    await expect(
      new UpsertVariety({ uow: bundle.uow }).execute({ ...input, priceCzk: -1 }),
    ).rejects.toThrow(ValidationError)
  })

  it('odmítne sklad nad kapacitu', async () => {
    const bundle = makeBundle()
    await expect(
      new UpsertVariety({ uow: bundle.uow }).execute({ ...input, stockKg: 200, capacityKg: 150 }),
    ).rejects.toThrow(/kapacit/i)
  })

  it('odmítne neplatnou barvu', async () => {
    const bundle = makeBundle()
    await expect(
      new UpsertVariety({ uow: bundle.uow }).execute({ ...input, colorHex: 'cervena' }),
    ).rejects.toThrow(ValidationError)
  })

  it('odmítne úpravu neexistující odrůdy', async () => {
    const bundle = makeBundle()
    await expect(
      new UpsertVariety({ uow: bundle.uow }).execute({ ...input, id: 999 }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('DeactivateVariety', () => {
  it('odrůdu deaktivuje místo smazání', async () => {
    // na odrůdu mohou existovat objednávky; smazání by rozbilo jejich historii
    const bundle = makeBundle({ varieties: [makeVariety({ id: 1 })] })
    await new DeactivateVariety({ uow: bundle.uow }).execute(1)

    expect(bundle.varieties.get(1)?.isActive).toBe(false)
  })

  it('u neexistující odrůdy skončí chybou', async () => {
    const bundle = makeBundle()
    await expect(new DeactivateVariety({ uow: bundle.uow }).execute(999)).rejects.toThrow(
      NotFoundError,
    )
  })
})

describe('PublishNews', () => {
  it('zveřejní novinku s časem z hodin', async () => {
    const bundle = makeBundle()
    const view = await new PublishNews({ uow: bundle.uow, clock }).execute({
      title: 'Dnes jsme vykopali Bernie',
      body: 'Povedlo se.',
      tag: NewsTag.HARVEST,
      imageUrl: null,
      authorId: 1,
    })

    expect(view.title).toBe('Dnes jsme vykopali Bernie')
    expect(view.dateLabel).toBe('10. září 2026')
    expect(view.tagLabel).toBe('Sklizeň')
  })

  it('odmítne novinku bez titulku', async () => {
    const bundle = makeBundle()
    await expect(
      new PublishNews({ uow: bundle.uow, clock }).execute({
        title: '   ',
        body: 'x',
        tag: NewsTag.HARVEST,
        imageUrl: null,
        authorId: 1,
      }),
    ).rejects.toThrow(/titulek/i)
  })
})

describe('DeleteNews', () => {
  it('novinku smaže', async () => {
    const bundle = makeBundle()
    const created = await bundle.news.create({
      title: 'Test',
      body: 'x',
      tag: NewsTag.HARVEST,
      imageUrl: null,
      publishedAt: new Date('2026-09-10T10:00:00Z'),
      authorId: 1,
    })

    await new DeleteNews({ uow: bundle.uow }).execute(created.id)
    expect(bundle.news.items).toHaveLength(0)
  })
})
