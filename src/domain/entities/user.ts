import { UserRole } from '@/domain/enums'
import type { EmailAddress } from '@/domain/value-objects/email-address'

export interface UserProps {
  readonly id: number
  readonly email: EmailAddress
  readonly name: string
  readonly role: UserRole
  readonly passwordHash: string
  readonly createdAt: Date
  readonly verifiedAt: Date | null
  readonly verificationToken: string | null
  readonly verificationExpiresAt: Date | null
  readonly deactivatedAt: Date | null
  readonly sessionsInvalidBefore: Date | null
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static rehydrate(props: UserProps): User {
    return new User(props)
  }

  get id(): number { return this.props.id }
  get email(): EmailAddress { return this.props.email }
  get name(): string { return this.props.name }
  get role(): UserRole { return this.props.role }
  get createdAt(): Date { return this.props.createdAt }
  get verifiedAt(): Date | null { return this.props.verifiedAt }
  get verificationToken(): string | null { return this.props.verificationToken }
  get verificationExpiresAt(): Date | null { return this.props.verificationExpiresAt }
  get deactivatedAt(): Date | null { return this.props.deactivatedAt }
  get sessionsInvalidBefore(): Date | null { return this.props.sessionsInvalidBefore }

  get isVerified(): boolean { return this.props.verifiedAt !== null }

  /** Deaktivovaný účet se nepřihlásí, ale jeho objednávky zůstávají čitelné. */
  get isActive(): boolean { return this.props.deactivatedAt === null }

  /** Platí ověřovací odkaz? Prošlý token se chová jako neexistující. */
  canVerifyAt(now: Date): boolean {
    if (this.props.verificationToken === null) return false
    if (this.props.verificationExpiresAt === null) return false
    return this.props.verificationExpiresAt.getTime() > now.getTime()
  }

  /**
   * Platí ještě token vydaný v `issuedAt`? Odvolání (obnova hesla farmáře) zneplatní
   * všechno vydané dřív. Porovnává se neostře: `iat` má vteřinovou přesnost, takže
   * token vydaný ve stejnou vteřinu jako odvolání padá taky — radši odhlásit navíc
   * než nechat žít session, kterou měla obnova hesla zabít.
   *
   * Session odvolává obnova hesla i deaktivace účtu.
   */
  acceptsTokenIssuedAt(issuedAt: Date): boolean {
    const invalidBefore = this.props.sessionsInvalidBefore
    return invalidBefore === null || issuedAt.getTime() > invalidBefore.getTime()
  }

  /** Ověření token zahazuje — odkaz ze staré zprávy nesmí platit napořád. */
  withVerified(at: Date): User {
    return new User({
      ...this.props,
      verifiedAt: at,
      verificationToken: null,
      verificationExpiresAt: null,
    })
  }

  withVerificationToken(token: string, expiresAt: Date): User {
    return new User({ ...this.props, verificationToken: token, verificationExpiresAt: expiresAt })
  }

  withActive(active: boolean, now: Date): User {
    if (active === this.isActive) return this
    return new User({
      ...this.props,
      deactivatedAt: active ? null : now,
      sessionsInvalidBefore: active ? this.props.sessionsInvalidBefore : now,
    })
  }

  /**
   * Hash hesla je součástí entity, protože ho `LoginUser` potřebuje ověřit. Ven z aplikace
   * se nikdy nedostane — view modely ho neobsahují a entity se do klientských komponent
   * neposílají.
   */
  get passwordHash(): string { return this.props.passwordHash }

  isFarmer(): boolean {
    return this.props.role === UserRole.FARMER
  }
}
