import type { AuthResult } from '@/application/dto'
import type { User } from '@/domain/entities'
import { UserRole } from '@/domain/enums'
import { AuthError, ConflictError, ValidationError } from '@/domain/errors'
import type { PasswordHasher } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { EmailAddress } from '@/domain/value-objects/email-address'

const MIN_PASSWORD_LENGTH = 8

/**
 * Hash řetězce, který nikdo nepoužívá. Slouží k tomu, aby přihlášení neexistujícího
 * účtu stálo stejně času jako přihlášení existujícího — bez toho by šlo podle rychlosti
 * odpovědi zjistit, které e-maily jsou registrované.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.cdCIhL2JwBMC4b8JQd8s1XWRhMxLrgy'

const INVALID_CREDENTIALS = 'Nesprávný e-mail nebo heslo'

const toAuthResult = (user: User): AuthResult => ({
  userId: user.id,
  name: user.name,
  email: user.email.value,
  role: user.role,
})

export interface RegisterUserInput {
  readonly name: string
  readonly email: string
  readonly password: string
}

export class RegisterUser {
  constructor(private readonly deps: { uow: UnitOfWork; hasher: PasswordHasher }) {}

  /**
   * Role ve vstupu záměrně není. Registrace vytváří výhradně zákazníka; farmáře
   * zakládá seed. Kdyby šla role poslat z formuláře, kdokoli by si otevřel administraci.
   */
  async execute(input: RegisterUserInput): Promise<AuthResult> {
    const name = input.name.trim()
    if (name.length === 0) throw new ValidationError('Vyplňte jméno a příjmení')

    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Heslo musí mít alespoň ${MIN_PASSWORD_LENGTH} znaků`)
    }

    const email = EmailAddress.of(input.email)

    return this.deps.uow.runInTransaction(async (repos) => {
      const existing = await repos.users.findByEmail(email)
      if (existing) throw new ConflictError('Tento e-mail už je zaregistrovaný')

      const user = await repos.users.create({
        email,
        name,
        passwordHash: await this.deps.hasher.hash(input.password),
        role: UserRole.CUSTOMER,
      })

      return toAuthResult(user)
    })
  }
}

export interface LoginUserInput {
  readonly email: string
  readonly password: string
}

export class LoginUser {
  constructor(private readonly deps: { uow: UnitOfWork; hasher: PasswordHasher }) {}

  async execute(input: LoginUserInput): Promise<AuthResult> {
    if (input.password.length === 0) throw new ValidationError('Vyplňte heslo')

    // Neplatný tvar e-mailu se vyhodnotí stejně jako neexistující účet — jinak by
    // odlišná hláška napověděla, že platný tvar znamená existující účet.
    let email: EmailAddress
    try {
      email = EmailAddress.of(input.email)
    } catch {
      await this.deps.hasher.verify(input.password, DUMMY_HASH)
      throw new AuthError(INVALID_CREDENTIALS)
    }

    const user = await this.deps.uow.repos.users.findByEmail(email)

    const matches = user
      ? await this.deps.hasher.verify(input.password, user.passwordHash)
      : await this.deps.hasher.verify(input.password, DUMMY_HASH)

    if (!user || !matches) throw new AuthError(INVALID_CREDENTIALS)

    return toAuthResult(user)
  }
}

export class GetCurrentUser {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(userId: number): Promise<AuthResult | null> {
    const user = await this.deps.uow.repos.users.findById(userId)
    return user ? toAuthResult(user) : null
  }
}
