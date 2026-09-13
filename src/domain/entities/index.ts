import type { FieldStatus, NewsTag, UserRole } from '@/domain/enums'
import { UserRole as Role } from '@/domain/enums'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import type { Kilograms } from '@/domain/value-objects/kilograms'

export { Variety, type VarietyProps } from '@/domain/entities/variety'
export {
  Order,
  OrderItem,
  type OrderCustomer,
  type OrderItemProps,
  type OrderProps,
} from '@/domain/entities/order'

/**
 * Zbývající entity nesou jen data — žádná pravidla, která by šlo porušit. Drží se
 * stejného tvaru jako `Variety` a `Order` (privátní konstruktor + `rehydrate`), aby
 * se nedaly složit z neúplných dat obejitím typu.
 */

export interface NewsPostProps {
  readonly id: number
  readonly title: string
  readonly body: string
  readonly tag: NewsTag
  readonly imageUrl: string | null
  readonly publishedAt: Date
  readonly authorId: number | null
}

export class NewsPost {
  private constructor(private readonly props: NewsPostProps) {}

  static rehydrate(props: NewsPostProps): NewsPost {
    return new NewsPost(props)
  }

  get id(): number { return this.props.id }
  get title(): string { return this.props.title }
  get body(): string { return this.props.body }
  get tag(): NewsTag { return this.props.tag }
  get imageUrl(): string | null { return this.props.imageUrl }
  get publishedAt(): Date { return this.props.publishedAt }
  get authorId(): number | null { return this.props.authorId }
  get hasImage(): boolean { return this.props.imageUrl !== null && this.props.imageUrl.length > 0 }
}

export interface FieldProps {
  readonly id: number
  readonly name: string
  readonly varietyName: string
  readonly areaM2: number
  readonly status: FieldStatus
  readonly yieldKg: Kilograms
  readonly isEstimate: boolean
  readonly sortOrder: number
}

export class Field {
  private constructor(private readonly props: FieldProps) {}

  static rehydrate(props: FieldProps): Field {
    return new Field(props)
  }

  get id(): number { return this.props.id }
  get name(): string { return this.props.name }
  get varietyName(): string { return this.props.varietyName }
  get areaM2(): number { return this.props.areaM2 }
  get status(): FieldStatus { return this.props.status }
  get yieldKg(): Kilograms { return this.props.yieldKg }
  get isEstimate(): boolean { return this.props.isEstimate }
  get sortOrder(): number { return this.props.sortOrder }
}

export interface HarvestEntryProps {
  readonly id: number
  readonly date: Date
  readonly dug: Kilograms
  readonly stock: Kilograms
}

export class HarvestEntry {
  private constructor(private readonly props: HarvestEntryProps) {}

  static rehydrate(props: HarvestEntryProps): HarvestEntry {
    return new HarvestEntry(props)
  }

  get id(): number { return this.props.id }
  get date(): Date { return this.props.date }
  get dug(): Kilograms { return this.props.dug }
  get stock(): Kilograms { return this.props.stock }
}

export interface StorageReadingProps {
  readonly id: number
  readonly recordedAt: Date
  readonly temperatureC: number
  readonly humidityPct: number
}

export class StorageReading {
  private constructor(private readonly props: StorageReadingProps) {}

  static rehydrate(props: StorageReadingProps): StorageReading {
    return new StorageReading(props)
  }

  get id(): number { return this.props.id }
  get recordedAt(): Date { return this.props.recordedAt }
  get temperatureC(): number { return this.props.temperatureC }
  get humidityPct(): number { return this.props.humidityPct }
}

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
   * Sloupec se zapisuje jen seedem, proto ho `PrismaUserRepository.save` nezná;
   * přidávat nepoužitou zápisovou cestu by byl mrtvý kód.
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
    return new User({ ...this.props, deactivatedAt: active ? null : now })
  }

  /**
   * Hash hesla je součástí entity, protože ho `LoginUser` potřebuje ověřit. Ven z aplikace
   * se nikdy nedostane — view modely ho neobsahují a entity se do klientských komponent
   * neposílají.
   */
  get passwordHash(): string { return this.props.passwordHash }

  isFarmer(): boolean {
    return this.props.role === Role.FARMER
  }
}
