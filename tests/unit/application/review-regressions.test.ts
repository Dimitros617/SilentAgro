import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { AuthorizeSession } from '@/application/use-cases/auth'
import { CancelOrder } from '@/application/use-cases/cancel-order'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { GetOrderByToken } from '@/application/use-cases/get-order-by-token'
import { AdvanceOrderStatus } from '@/application/use-cases/orders'
import { GetUserDetail, MarkUserVerified, SetUserActive } from '@/application/use-cases/users'
import { UpsertVariety } from '@/application/use-cases/varieties'
import { OrderItem, User } from '@/domain/entities'
import { DeliveryMethod, OrderStatus, PaymentMethod, UserRole } from '@/domain/enums'
import { ConflictError, ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { SequentialTokenGenerator, TEST_DELIVERY_POLICY, fixedClock, makeBundle, makeVariety, makeOrderMailComposer } from './fakes'

const now = new Date('2026-09-13T10:00:00Z')
const clock = fixedClock(now.toISOString())

async function createOrder(bundle: ReturnType<typeof makeBundle>) {
  return bundle.orders.create({
    customer: { name: 'Jan', email: EmailAddress.of('jan@example.cz'), phone: '', note: '' },
    items: [OrderItem.create({ varietyId: 1, varietyName: 'Bernie', unitPrice: Money.fromCzk(20), quantity: Kilograms.of(2) })],
    delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.QR_CODE,
    subtotal: Money.fromCzk(40), deliveryFee: Money.zero(), total: Money.fromCzk(40),
    discount: Money.zero(), pricingVersion: 1,
    userId: null, publicToken: 'review-token', createdAt: now,
  })
}

function createUser(): User {
  return User.rehydrate({
    id: 1, name: 'Jan', email: EmailAddress.of('jan@example.cz'), role: UserRole.CUSTOMER,
    passwordHash: 'unused', createdAt: now, verifiedAt: null, verificationToken: null,
    verificationExpiresAt: null, deactivatedAt: null, sessionsInvalidBefore: null,
  })
}

describe('regrese nalezené při review', () => {
  it('rezervace uloží požadavky na potvrzení bez odesílání v HTTP požadavku', async () => {
    const bundle = makeBundle({ varieties: [makeVariety({ stockKg: 10 })] })
    const reserve = new ReserveOrder({
      uow: bundle.uow, clock, composer: makeOrderMailComposer(),
      tokenGenerator: new SequentialTokenGenerator(), deliveryPolicy: TEST_DELIVERY_POLICY,
    })

    const result = await reserve.execute({
      requestKey: randomUUID(),
      customer: { name: 'Jan', email: 'jan@example.cz', phone: '', note: '' },
      items: [{ varietyId: 1, quantityKg: 2 }], userId: null,
      delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
    })

    expect(result.publicToken).toBe('token-1')
    expect(bundle.orders.last()?.publicToken).toBe(result.publicToken)
    expect(bundle.varieties.get(1)?.stock.value).toBe(8)
    expect(bundle.outbox.messages).toHaveLength(2)
  })

  it('zrušení uloží oznámení a vrátí sklad jen jednou', async () => {
    const bundle = makeBundle({ varieties: [makeVariety({ stockKg: 8 })] })
    const order = await createOrder(bundle)
    const cancel = new CancelOrder({ uow: bundle.uow, clock, composer: makeOrderMailComposer() })

    const result = await cancel.execute(order.id, 'Zákazník změnil plán')

    expect(result.isCancelled).toBe(true)
    expect(bundle.varieties.get(1)?.stock.value).toBe(10)
    expect(bundle.outbox.messages).toHaveLength(1)
    await expect(cancel.execute(order.id, 'Opakování')).rejects.toThrow(ConflictError)
    expect(bundle.outbox.messages).toHaveLength(1)
    expect(bundle.varieties.get(1)?.stock.value).toBe(10)
  })

  it.each(['detail', 'ověření', 'deaktivace'])('%s účtu nepočítá statistiky všech zákazníků', async (operation) => {
    const bundle = makeBundle()
    bundle.users.items.push(createUser())
    const allStats = vi.spyOn(bundle.users, 'orderStats').mockRejectedValue(new Error('Globální přepočet není potřeba'))
    const ownStats = vi.spyOn(bundle.users, 'orderStatsForUser').mockResolvedValue({
      userId: 1, orderCount: 7, cancelledCount: 2, totalSpent: Money.fromCzk(500), lastOrderAt: now,
    })

    let view
    if (operation === 'detail') view = await new GetUserDetail({ uow: bundle.uow }).execute(1)
    else if (operation === 'ověření') view = await new MarkUserVerified({ uow: bundle.uow, clock }).execute(1)
    else view = await new SetUserActive({ uow: bundle.uow, clock }).execute(1, false)

    expect(view.orderCount).toBe(7)
    expect(view.totalSpentLabel).toBe('500 Kč')
    expect(ownStats).toHaveBeenCalledWith(1)
    expect(allStats).not.toHaveBeenCalled()
  })

  it('starší formulář nepřepíše rezervovaný sklad ani popis odrůdy', async () => {
    const bundle = makeBundle({ varieties: [makeVariety({ stockKg: 8 })] })
    const input = {
      id: 1, expectedStockKg: 10, name: 'Nový název', tag: '', description: '', colorHex: '#c98a2b',
      stockKg: 15, capacityKg: 160, priceCzk: 22,
    }
    await expect(new UpsertVariety({ uow: bundle.uow }).execute(input)).rejects.toThrow(ConflictError)
    expect(bundle.varieties.get(1)?.stock.value).toBe(8)
    expect(bundle.varieties.get(1)?.name).toBe('Bernie')
  })

  it('uložení skladu odmítá neplatné půlkilo místo tichého zaokrouhlení', async () => {
    const bundle = makeBundle()
    await expect(new UpsertVariety({ uow: bundle.uow }).execute({
      id: null, expectedStockKg: null, name: 'Bernie', tag: '', description: '', colorHex: '#c98a2b',
      stockKg: 0.3, capacityKg: 10, priceCzk: 22,
    })).rejects.toThrow(ValidationError)
  })

  it('dva kliky ze stejného zobrazení posunou objednávku jen jednou', async () => {
    const bundle = makeBundle()
    const order = await createOrder(bundle)
    const advance = new AdvanceOrderStatus({ uow: bundle.uow })
    await advance.execute(order.id, OrderStatus.NEW)
    await expect(advance.execute(order.id, OrderStatus.NEW)).rejects.toThrow(ConflictError)
    expect(bundle.orders.get(order.id)?.status).toBe(OrderStatus.READY)
  })

  it('zrušená rezervace nevyzývá zákazníka k platbě ani negeneruje potvrzení', async () => {
    const bundle = makeBundle()
    const order = await createOrder(bundle)
    await bundle.orders.cancel(order.id, now, 'Zákazník zrušil rezervaci')
    const presenter = { paymentInstructionFor: vi.fn(), mailPreviews: vi.fn() }
    const view = await new GetOrderByToken({ uow: bundle.uow, presenter }).execute(order.publicToken)
    expect(view.isCancelled).toBe(true)
    expect(view.payment).toBeNull()
    expect(view.mails).toEqual([])
    expect(presenter.paymentInstructionFor).not.toHaveBeenCalled()
    expect(presenter.mailPreviews).not.toHaveBeenCalled()
  })

  it('změna stavu účtu zachová skutečné statistiky zákazníka', async () => {
    const bundle = makeBundle()
    bundle.users.items.push(createUser())
    vi.spyOn(bundle.users, 'orderStatsForUser').mockResolvedValue(
      { userId: 1, orderCount: 7, cancelledCount: 2, totalSpent: Money.fromCzk(500), lastOrderAt: now },
    )
    const view = await new SetUserActive({ uow: bundle.uow, clock }).execute(1, false)
    expect(view.orderCount).toBe(7)
    expect(view.cancelledCount).toBe(2)
    expect(view.totalSpentLabel).toBe('500 Kč')
  })

  it('reaktivace zákazníka neobnoví jeho odvolanou session', async () => {
    const bundle = makeBundle()
    bundle.users.items.push(createUser())
    const session = { userId: 1, name: 'Jan', role: UserRole.CUSTOMER, issuedAt: new Date(now.getTime() - 1000) }
    const authorize = new AuthorizeSession({ uow: bundle.uow })
    const setActive = new SetUserActive({ uow: bundle.uow, clock })
    expect(await authorize.execute(session)).not.toBeNull()
    await setActive.execute(1, false)
    expect(await authorize.execute(session)).toBeNull()
    await setActive.execute(1, true)
    expect(await authorize.execute(session)).toBeNull()
    expect(await authorize.execute({ ...session, issuedAt: new Date(now.getTime() + 1000) })).not.toBeNull()
  })
})
