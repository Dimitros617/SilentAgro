import { describe, expect, it } from 'vitest'
import { AuthorizeFarmerSession } from '@/application/use-cases/auth'
import { User } from '@/domain/entities'
import { LoginUser, RegisterUser } from '@/application/use-cases/auth'
import { UserRole } from '@/domain/enums'
import { AuthError, ConflictError, ValidationError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import {
  FakePasswordHasher,
  FakeUserNotifier,
  RecordingLogger,
  SequentialTokenGenerator,
  fixedClock,
  makeBundle,
} from './fakes'

const setup = async (existing: { email: string; password: string; role?: UserRole }[] = []) => {
  const bundle = makeBundle()
  const hasher = new FakePasswordHasher()
  const notifier = new FakeUserNotifier()

  for (const entry of existing) {
    await bundle.users.create({
      email: EmailAddress.of(entry.email),
      name: 'Existující',
      passwordHash: await hasher.hash(entry.password),
      role: entry.role ?? UserRole.CUSTOMER,
      createdAt: new Date('2026-09-01T09:00:00Z'),
      verificationToken: null,
      verificationExpiresAt: null,
    })
  }

  return {
    ...bundle,
    hasher,
    notifier,
    register: new RegisterUser({
      uow: bundle.uow,
      hasher,
      clock: fixedClock(),
      tokenGenerator: new SequentialTokenGenerator(),
      notifier,
      logger: new RecordingLogger(),
      config: { publicBaseUrl: 'https://silentagro.cz' },
    }),
    login: new LoginUser({ uow: bundle.uow, hasher }),
  }
}

describe('RegisterUser', () => {
  it('založí zákazníka s hashovaným heslem', async () => {
    const ctx = await setup()
    const result = await ctx.register.execute({
      name: 'Jan Novák',
      email: '  JAN@Email.CZ ',
      password: 'tajneheslo',
    })

    expect(result.role).toBe(UserRole.CUSTOMER)
    expect(result.email).toBe('jan@email.cz')
    expect(ctx.users.last()?.passwordHash).not.toBe('tajneheslo')
  })

  it('registrací nelze získat roli farmáře', async () => {
    // role není součástí vstupu; kdyby ji šlo poslat, kdokoli by si otevřel administraci
    const ctx = await setup()
    const result = await ctx.register.execute({
      name: 'Kdokoli',
      email: 'kdokoli@email.cz',
      password: 'tajneheslo',
    })

    expect(result.role).toBe(UserRole.CUSTOMER)
  })

  it('odmítne krátké heslo', async () => {
    const ctx = await setup()
    await expect(
      ctx.register.execute({ name: 'Jan', email: 'jan@email.cz', password: 'krat' }),
    ).rejects.toThrow(/alespoň 8 znaků/)
  })

  it('odmítne prázdné jméno', async () => {
    const ctx = await setup()
    await expect(
      ctx.register.execute({ name: '  ', email: 'jan@email.cz', password: 'tajneheslo' }),
    ).rejects.toThrow(ValidationError)
  })

  it('odmítne neplatný e-mail', async () => {
    const ctx = await setup()
    await expect(
      ctx.register.execute({ name: 'Jan', email: 'jan.email.cz', password: 'tajneheslo' }),
    ).rejects.toThrow(ValidationError)
  })

  it('odmítne již registrovaný e-mail', async () => {
    const ctx = await setup([{ email: 'jan@email.cz', password: 'tajneheslo' }])
    await expect(
      ctx.register.execute({ name: 'Jan', email: 'jan@email.cz', password: 'jineheslo' }),
    ).rejects.toThrow(ConflictError)
  })

  it('pozná už registrovaný e-mail i v jiné velikosti písmen', async () => {
    const ctx = await setup([{ email: 'jan@email.cz', password: 'tajneheslo' }])
    await expect(
      ctx.register.execute({ name: 'Jan', email: 'JAN@EMAIL.CZ', password: 'jineheslo' }),
    ).rejects.toThrow(ConflictError)
  })
  it('razítkuje registraci časem z hodin aplikace', async () => {
    // hranice pro přiřazení hostovských objednávek porovnává orders.created_at
    // s users.created_at; kdyby druhý čas psala databáze, šlo by o jiné hodiny
    const ctx = await setup()
    await ctx.register.execute({ name: 'Jan Novák', email: 'jan@email.cz', password: 'tajneheslo' })

    expect(ctx.users.last()?.createdAt).toEqual(new Date('2026-09-10T18:00:00Z'))
  })
})

describe('AuthorizeFarmerSession', () => {
  const ISSUED_AT = new Date('2026-09-11T10:00:00Z')

  const farmerWith = async (
    overrides: { role?: UserRole; sessionsInvalidBefore?: Date | null; deactivatedAt?: Date | null } = {},
  ) => {
    const bundle = makeBundle()
    const created = await bundle.users.create({
      email: EmailAddress.of('farma@silentagro.cz'),
      name: 'Farmář Milan',
      passwordHash: 'hash',
      role: overrides.role ?? UserRole.FARMER,
      createdAt: new Date('2026-08-01T09:00:00Z'),
      verificationToken: null,
      verificationExpiresAt: null,
    })

    await bundle.users.save(
      User.rehydrate({
        id: created.id,
        email: created.email,
        name: created.name,
        role: overrides.role ?? UserRole.FARMER,
        passwordHash: created.passwordHash,
        createdAt: created.createdAt,
        verifiedAt: new Date('2026-08-01T10:00:00Z'),
        verificationToken: null,
        verificationExpiresAt: null,
        deactivatedAt: overrides.deactivatedAt ?? null,
        sessionsInvalidBefore: overrides.sessionsInvalidBefore ?? null,
      }),
    )

    return {
      bundle,
      userId: created.id,
      authorize: new AuthorizeFarmerSession({ uow: bundle.uow }),
      session: { userId: created.id, role: UserRole.FARMER, name: 'Farmář Milan', issuedAt: ISSUED_AT },
    }
  }

  it('pustí farmáře s tokenem vydaným po obnově hesla', async () => {
    const ctx = await farmerWith({ sessionsInvalidBefore: new Date('2026-09-11T09:00:00Z') })

    expect((await ctx.authorize.execute(ctx.session))?.userId).toBe(ctx.userId)
  })

  it('odmítne token vydaný před obnovou hesla', async () => {
    // obnova hesla farmáře je jediná cesta, jak odvolat živou administrátorskou session
    const ctx = await farmerWith({ sessionsInvalidBefore: new Date('2026-09-11T11:00:00Z') })

    expect(await ctx.authorize.execute(ctx.session)).toBeNull()
  })

  it('odmítne token vydaný ve stejnou vteřinu jako obnova', async () => {
    // `iat` má vteřinovou přesnost, takže shoda se musí zahodit — jinak by token
    // vydaný těsně před obnovou mohl přežít
    const ctx = await farmerWith({ sessionsInvalidBefore: ISSUED_AT })

    expect(await ctx.authorize.execute(ctx.session)).toBeNull()
  })

  it('bez odvolání pustí i starý token', async () => {
    const ctx = await farmerWith()

    expect((await ctx.authorize.execute(ctx.session))?.role).toBe(UserRole.FARMER)
  })

  it('roli bere z databáze, ne z tokenu', async () => {
    // token tvrdí FARMER, ale účet už farmářem není
    const ctx = await farmerWith({ role: UserRole.CUSTOMER })

    expect(await ctx.authorize.execute(ctx.session)).toBeNull()
  })

  it('odmítne deaktivovaný účet', async () => {
    const ctx = await farmerWith({ deactivatedAt: new Date('2026-09-10T10:00:00Z') })

    expect(await ctx.authorize.execute(ctx.session)).toBeNull()
  })

  it('odmítne session smazaného účtu', async () => {
    const ctx = await farmerWith()

    expect(await ctx.authorize.execute({ ...ctx.session, userId: 999 })).toBeNull()
  })
})

describe('LoginUser', () => {
  it('přihlásí při správném heslu', async () => {
    const ctx = await setup([
      { email: 'farma@silentagro.cz', password: 'brambory', role: UserRole.FARMER },
    ])
    const result = await ctx.login.execute({ email: 'farma@silentagro.cz', password: 'brambory' })

    expect(result.role).toBe(UserRole.FARMER)
    expect(result.email).toBe('farma@silentagro.cz')
  })

  it('u špatného hesla i neznámého e-mailu hlásí totéž', async () => {
    // odlišná hláška by dovolila vyjmenovat registrované adresy
    const ctx = await setup([{ email: 'jan@email.cz', password: 'spravne' }])

    const wrongPassword = await ctx.login
      .execute({ email: 'jan@email.cz', password: 'spatne' })
      .catch((error: Error) => error)
    const unknownEmail = await ctx.login
      .execute({ email: 'nikdo@email.cz', password: 'spravne' })
      .catch((error: Error) => error)

    expect(wrongPassword).toBeInstanceOf(AuthError)
    expect(unknownEmail).toBeInstanceOf(AuthError)
    expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message)
    expect((wrongPassword as Error).message).toBe('Nesprávný e-mail nebo heslo')
  })

  it('u neznámého e-mailu stejně provede ověření hesla', async () => {
    // bez toho by neexistující účet odpověděl znatelně rychleji a prozradil se
    const ctx = await setup()
    await ctx.login.execute({ email: 'nikdo@email.cz', password: 'cokoliv' }).catch(() => {})

    expect(ctx.hasher.verifyCalls).toBe(1)
  })

  it('odmítne prázdné heslo bez dotazu do databáze', async () => {
    const ctx = await setup()
    await expect(ctx.login.execute({ email: 'jan@email.cz', password: '' })).rejects.toThrow(
      ValidationError,
    )
  })

  it('neplatný tvar e-mailu neodhalí, jestli účet existuje', async () => {
    const ctx = await setup()
    await expect(ctx.login.execute({ email: 'nesmysl', password: 'heslo123' })).rejects.toThrow(
      AuthError,
    )
  })
})
