import { describe, expect, it } from 'vitest'
import {
  GetUserDetail,
  MarkUserVerified,
  ResendVerification,
  SendMessageToUser,
  SetUserActive,
  VerifyEmail,
  verificationExpiry,
} from '@/application/use-cases/users'
import { OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, PaymentMethod, UserRole } from '@/domain/enums'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import {
  FakeUserNotifier,
  type InMemoryOrderRepository,
  SequentialTokenGenerator,
  fixedClock,
  makeBundle,
} from './fakes'

const NOW = '2026-09-11T10:00:00Z'
const clock = fixedClock(NOW)

/** Účet vznikne 5. 9.; objednávky kolem toho data rozhodují, co si ověření připíše. */
const REGISTERED_AT = new Date('2026-09-05T09:00:00Z')
const BEFORE_REGISTRATION = new Date('2026-09-01T08:00:00Z')
const AFTER_REGISTRATION = new Date('2026-09-08T08:00:00Z')

const placeOrder = (
  orders: InMemoryOrderRepository,
  options: { email: string; createdAt: Date; userId?: number | null },
) =>
  orders.create({
    customer: { name: 'Jan Novák', email: EmailAddress.of(options.email), phone: '', note: '' },
    items: [
      OrderItem.create({
        varietyId: 1,
        varietyName: 'Bernie',
        unitPrice: Money.fromCzk(20),
        quantity: Kilograms.of(1),
      }),
    ],
    delivery: DeliveryMethod.PICKUP,
    payment: PaymentMethod.CASH,
    subtotal: Money.fromCzk(20),
    deliveryFee: Money.zero(),
    total: Money.fromCzk(20),
    userId: options.userId ?? null,
    publicToken: `token-o-${options.createdAt.getTime()}-${options.userId ?? 'host'}`,
    createdAt: options.createdAt,
  })

const setup = async (
  options: { role?: UserRole; token?: string; expiresAt?: Date; verified?: boolean } = {},
) => {
  const bundle = makeBundle()
  const notifier = new FakeUserNotifier()

  let user = await bundle.users.create({
    email: EmailAddress.of('jan@email.cz'),
    name: 'Jan Novák',
    passwordHash: 'hash',
    role: options.role ?? UserRole.CUSTOMER,
    verificationToken: options.token ?? 'token-abc',
    verificationExpiresAt: options.expiresAt ?? verificationExpiry(new Date(NOW)),
    createdAt: REGISTERED_AT,
  })

  if (options.verified) {
    user = await bundle.users.save(user.withVerified(new Date('2026-09-01T10:00:00Z')))
  }

  return { ...bundle, notifier, user }
}

describe('VerifyEmail', () => {
  it('ověří účet platným tokenem', async () => {
    const ctx = await setup()
    const result = await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect(result.email).toBe('jan@email.cz')
    expect((await ctx.users.findById(ctx.user.id))?.isVerified).toBe(true)
  })

  it('po ověření token zahodí, aby starý odkaz neplatil napořád', async () => {
    const ctx = await setup()
    await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect((await ctx.users.findById(ctx.user.id))?.verificationToken).toBeNull()
    await expect(new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')).rejects.toThrow(
      NotFoundError,
    )
  })

  it('odmítne prošlý odkaz stejnou chybou jako neexistující', async () => {
    // odlišná hláška by prozradila, že token kdysi platil
    const ctx = await setup({ expiresAt: new Date('2026-09-01T10:00:00Z') })

    await expect(new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')).rejects.toThrow(
      NotFoundError,
    )
    expect((await ctx.users.findById(ctx.user.id))?.isVerified).toBe(false)
  })

  it('odmítne neznámý i prázdný token', async () => {
    const ctx = await setup()
    await expect(new VerifyEmail({ uow: ctx.uow, clock }).execute('nesmysl')).rejects.toThrow(
      NotFoundError,
    )
    await expect(new VerifyEmail({ uow: ctx.uow, clock }).execute('  ')).rejects.toThrow(
      NotFoundError,
    )
  })
})

describe('MarkUserVerified', () => {
  it('farmář ověří účet ručně', async () => {
    const ctx = await setup()
    const row = await new MarkUserVerified({ uow: ctx.uow, clock }).execute(ctx.user.id)

    expect(row.isVerified).toBe(true)
    expect(row.verifiedAtLabel).toBe('11. září 2026')
  })

  it('už ověřený účet znovu neověřuje', async () => {
    const ctx = await setup({ verified: true })
    await expect(
      new MarkUserVerified({ uow: ctx.uow, clock }).execute(ctx.user.id),
    ).rejects.toThrow(ConflictError)
  })

  it('ruční ověření připíše hostovské objednávky stejně jako odkaz', async () => {
    // farmář ověřuje účet zákazníkovi, který se k e-mailu nedostane — jinak by mu
    // dřívější objednávky zůstaly nepřiřazené
    const ctx = await setup()
    const order = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: BEFORE_REGISTRATION,
    })

    await new MarkUserVerified({ uow: ctx.uow, clock }).execute(ctx.user.id)

    expect((await ctx.orders.findById(order.id))?.userId).toBe(ctx.user.id)
  })
})

describe('SetUserActive', () => {
  it('deaktivuje a zase aktivuje', async () => {
    const ctx = await setup()

    const off = await new SetUserActive({ uow: ctx.uow, clock }).execute(ctx.user.id, false)
    expect(off.isActive).toBe(false)
    expect(off.deactivatedAtLabel).toBe('11. září 2026')

    const on = await new SetUserActive({ uow: ctx.uow, clock }).execute(ctx.user.id, true)
    expect(on.isActive).toBe(true)
    expect(on.deactivatedAtLabel).toBeNull()
  })

  it('účet farmáře deaktivovat nelze', async () => {
    // jinak by si farmář zamkl vlastní přístup do administrace
    const ctx = await setup({ role: UserRole.FARMER })
    await expect(
      new SetUserActive({ uow: ctx.uow, clock }).execute(ctx.user.id, false),
    ).rejects.toThrow(/farmáře/)
  })

  it('u neexistujícího účtu skončí chybou', async () => {
    const ctx = await setup()
    await expect(new SetUserActive({ uow: ctx.uow, clock }).execute(999, false)).rejects.toThrow(
      NotFoundError,
    )
  })
})

describe('SendMessageToUser', () => {
  it('odešle zprávu na adresu účtu', async () => {
    const ctx = await setup()
    await new SendMessageToUser({ uow: ctx.uow, notifier: ctx.notifier }).execute(
      ctx.user.id,
      'Ohledně vaší objednávky',
      'Dobrý den, brambory máme připravené.',
    )

    expect(ctx.notifier.messages).toHaveLength(1)
    expect(ctx.notifier.messages[0]?.email).toBe('jan@email.cz')
    expect(ctx.notifier.messages[0]?.subject).toBe('Ohledně vaší objednávky')
  })

  it('odmítne prázdný předmět i text', async () => {
    const ctx = await setup()
    const useCase = new SendMessageToUser({ uow: ctx.uow, notifier: ctx.notifier })

    await expect(useCase.execute(ctx.user.id, '  ', 'text')).rejects.toThrow(ValidationError)
    await expect(useCase.execute(ctx.user.id, 'předmět', '  ')).rejects.toThrow(ValidationError)
  })

  it('selhání odeslání ohlásí, nepolyká ho', async () => {
    // u zprávy je odeslání celý účel akce — na rozdíl od potvrzení objednávky,
    // kde je pravdou sklad a e-mail jen notifikace
    const ctx = await setup()
    ctx.notifier.shouldFail = true

    await expect(
      new SendMessageToUser({ uow: ctx.uow, notifier: ctx.notifier }).execute(
        ctx.user.id,
        'Předmět',
        'Text',
      ),
    ).rejects.toThrow(/SMTP/)
  })
})

describe('ResendVerification', () => {
  const deps = (ctx: Awaited<ReturnType<typeof setup>>) => ({
    uow: ctx.uow,
    clock,
    tokenGenerator: new SequentialTokenGenerator(),
    notifier: ctx.notifier,
    config: { publicBaseUrl: 'https://silentagro.cz' },
  })

  it('vygeneruje nový token a pošle odkaz', async () => {
    const ctx = await setup()
    await new ResendVerification(deps(ctx)).execute(ctx.user.id)

    expect(ctx.notifier.verifications).toHaveLength(1)
    expect(ctx.notifier.verifications[0]?.url).toContain('https://silentagro.cz/overeni/token-1')
    expect((await ctx.users.findById(ctx.user.id))?.verificationToken).toBe('token-1')
  })

  it('už ověřenému účtu nic neposílá', async () => {
    const ctx = await setup({ verified: true })
    await expect(new ResendVerification(deps(ctx)).execute(ctx.user.id)).rejects.toThrow(
      ConflictError,
    )
    expect(ctx.notifier.verifications).toHaveLength(0)
  })
})

describe('VerifyEmail — přiřazení hostovských objednávek', () => {
  it('připíše účtu hostovskou objednávku z doby před registrací', async () => {
    const ctx = await setup()
    const order = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: BEFORE_REGISTRATION,
    })

    await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect((await ctx.orders.findById(order.id))?.userId).toBe(ctx.user.id)
  })

  it('objednávku zadanou až po registraci si nepřipíše', async () => {
    // e-mail na objednávce nikdo neověřuje, takže ji na tu adresu mohl zadat kdokoli cizí
    const ctx = await setup()
    const order = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: AFTER_REGISTRATION,
    })

    await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect((await ctx.orders.findById(order.id))?.userId).toBeNull()
  })

  it('objednávku patřící jinému účtu nepřebírá', async () => {
    const ctx = await setup()
    const order = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: BEFORE_REGISTRATION,
      userId: 99,
    })

    await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect((await ctx.orders.findById(order.id))?.userId).toBe(99)
  })

  it('objednávku na cizí adresu nepřipíše', async () => {
    const ctx = await setup()
    const order = await placeOrder(ctx.orders, {
      email: 'petr@email.cz',
      createdAt: BEFORE_REGISTRATION,
    })

    await new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')

    expect((await ctx.orders.findById(order.id))?.userId).toBeNull()
  })

  it('při neúspěšném ověření nepřipíše nic', async () => {
    const ctx = await setup({ expiresAt: new Date('2026-09-01T10:00:00Z') })
    const order = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: BEFORE_REGISTRATION,
    })

    await expect(new VerifyEmail({ uow: ctx.uow, clock }).execute('token-abc')).rejects.toThrow(
      NotFoundError,
    )
    expect((await ctx.orders.findById(order.id))?.userId).toBeNull()
  })
})

describe('GetUserDetail', () => {
  it('profil ukazuje jen objednávky přiřazené k účtu', async () => {
    const ctx = await setup()
    await placeOrder(ctx.orders, { email: 'jan@email.cz', createdAt: AFTER_REGISTRATION })
    const own = await placeOrder(ctx.orders, {
      email: 'jan@email.cz',
      createdAt: AFTER_REGISTRATION,
      userId: ctx.user.id,
    })

    const detail = await new GetUserDetail({ uow: ctx.uow }).execute(ctx.user.id)

    expect(detail.orders.map((order) => order.code)).toEqual([own.code])
  })
})
