import { describe, expect, it } from 'vitest'
import {
  MarkUserVerified,
  ResendVerification,
  SendMessageToUser,
  SetUserActive,
  VerifyEmail,
  verificationExpiry,
} from '@/application/use-cases/users'
import { UserRole } from '@/domain/enums'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import {
  FakeUserNotifier,
  SequentialTokenGenerator,
  fixedClock,
  makeBundle,
} from './fakes'

const NOW = '2026-09-11T10:00:00Z'
const clock = fixedClock(NOW)

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
