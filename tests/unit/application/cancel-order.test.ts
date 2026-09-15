import { describe, expect, it } from 'vitest'
import { CancelOrder } from '@/application/use-cases/cancel-order'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import { expectDomainError } from '../helpers/domain-error'
import { OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import {
  FakeMailer,
  fixedClock,
  makeBundle,
  makeOrderMailComposer,
  makeVariety,
} from './fakes'

const clock = fixedClock('2026-09-11T10:00:00Z')

const setup = async (options: { stockKg?: number; orderKg?: number } = {}) => {
  const bundle = makeBundle({
    varieties: [makeVariety({ id: 1, stockKg: options.stockKg ?? 10, priceCzk: 22 })],
  })
  const mailer = new FakeMailer()

  await bundle.orders.create({
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
        quantity: Kilograms.of(options.orderKg ?? 2.5),
      }),
    ],
    delivery: DeliveryMethod.PICKUP,
    payment: PaymentMethod.CASH,
    subtotal: Money.fromCzk(55),
    deliveryFee: Money.zero(),
    total: Money.fromCzk(55),
    discount: Money.zero(),
    pricingVersion: 1,
    userId: null,
    publicToken: 'token-1',
    createdAt: new Date('2026-09-10T12:00:00Z'),
  })

  return {
    ...bundle,
    mailer,
    useCase: new CancelOrder({
      uow: bundle.uow,
      clock,
      composer: makeOrderMailComposer(),
    }),
  }
}

describe('CancelOrder', () => {
  it('vrátí množství zpět do skladu', async () => {
    const ctx = await setup({ stockKg: 10, orderKg: 2.5 })
    await ctx.useCase.execute(1, 'Kroupy zničily úrodu.')

    expect(ctx.varieties.get(1)?.stock.value).toBe(12.5)
  })

  it('označí objednávku jako zrušenou i s důvodem a časem', async () => {
    const ctx = await setup()
    await ctx.useCase.execute(1, 'Kroupy zničily úrodu.')

    const order = ctx.orders.get(1)
    expect(order?.isCancelled).toBe(true)
    expect(order?.cancellationReason).toBe('Kroupy zničily úrodu.')
    expect(order?.cancelledAt).toEqual(new Date('2026-09-11T10:00:00Z'))
  })

  it('stav objednávky nemění — informace, kde byla, se nemá ztratit', async () => {
    const ctx = await setup()
    await ctx.orders.updateStatus(1, OrderStatus.READY)
    await ctx.useCase.execute(1, 'Kroupy zničily úrodu.')

    expect(ctx.orders.get(1)?.status).toBe(OrderStatus.READY)
  })

  it('pošle zákazníkovi omluvný e-mail s důvodem', async () => {
    const ctx = await setup()
    await ctx.useCase.execute(1, 'Kroupy zničily úrodu.')

    expect(ctx.outbox.messages).toHaveLength(1)
    expect(ctx.outbox.messages[0]?.to).toBe('jan@email.cz')
    expect(ctx.outbox.messages[0]?.subject).toContain('byla zrušena')
    expect(ctx.outbox.messages[0]?.text).toContain('Kroupy zničily úrodu.')
    expect(ctx.outbox.messages[0]?.text).toContain('omlouváme')
  })

  it('druhé zrušení odmítne a sklad nevrátí podruhé', async () => {
    // bez téhle pojistky by dvojklik přičetl množství dvakrát
    const ctx = await setup({ stockKg: 10, orderKg: 2.5 })
    await ctx.useCase.execute(1, 'Kroupy zničily úrodu.')

    await expectDomainError(ctx.useCase.execute(1, 'Znovu'), ConflictError, {
      code: 'CONFLICT',
      message: 'Objednávka už je zrušená',
    })
    expect(ctx.varieties.get(1)?.stock.value).toBe(12.5)
  })

  it('odmítne prázdný důvod', async () => {
    const ctx = await setup()
    await expectDomainError(ctx.useCase.execute(1, '   '), ValidationError, {
      code: 'VALIDATION',
      message: 'Napište důvod zrušení — zákazník ho dostane e-mailem',
    })
    expect(ctx.orders.get(1)?.isCancelled).toBe(false)
  })

  it('odmítne příliš dlouhý důvod', async () => {
    const ctx = await setup()
    await expectDomainError(ctx.useCase.execute(1, 'a'.repeat(1001)), ValidationError, {
      code: 'VALIDATION',
      message: 'Důvod zrušení je příliš dlouhý',
    })
  })

  it.each([3, 1000])('přijme důvod přesně na hranici %i znaků', async (length) => {
    const ctx = await setup()
    const reason = 'a'.repeat(length)
    await ctx.useCase.execute(1, reason)
    expect(ctx.orders.get(1)?.cancellationReason).toBe(reason)
    expect(ctx.outbox.items.has('order:1:cancelled')).toBe(true)
  })

  it('u neexistující objednávky skončí chybou', async () => {
    const ctx = await setup()
    await expectDomainError(ctx.useCase.execute(999, 'Důvod'), NotFoundError, {
      code: 'NOT_FOUND',
      message: 'Objednávka nenalezena',
    })
  })

  it('při chybějící odrůdě objednávku nezruší ani nezařadí oznámení', async () => {
    const ctx = await setup()
    ctx.varieties.items.clear()

    await expectDomainError(ctx.useCase.execute(1, 'Zákazník si to rozmyslel.'), NotFoundError, {
      code: 'NOT_FOUND',
      message: 'Odrůda objednávky nenalezena',
    })
    expect(ctx.orders.get(1)?.isCancelled).toBe(false)
    expect(ctx.outbox.messages).toHaveLength(0)
  })

  it('vrátí i množství nad kapacitu zásobníku', async () => {
    // farmář mohl mezitím kapacitu snížit; odmítnout vrácení by znamenalo,
    // že brambory z evidence zmizí úplně
    const ctx = await setup({ stockKg: 159, orderKg: 2.5 })
    await ctx.useCase.execute(1, 'Zákazník si to rozmyslel.')

    expect(ctx.varieties.get(1)?.stock.value).toBe(161.5)
  })
})
