import { describe, expect, it } from 'vitest'
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
