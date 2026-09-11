import type {
  Field,
  HarvestEntry,
  NewsPost,
  Order,
  OrderCustomer,
  OrderItem,
  StorageReading,
  User,
  Variety,
} from '@/domain/entities'
import type {
  DeliveryMethod,
  NewsTag,
  OrderStatus,
  PaymentMethod,
  UserRole,
} from '@/domain/enums'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import type { HexColor } from '@/domain/value-objects/hex-color'
import type { Kilograms } from '@/domain/value-objects/kilograms'
import type { Money } from '@/domain/value-objects/money'

export interface NewVarietyInput {
  readonly slug: string
  readonly name: string
  readonly tag: string
  readonly description: string
  readonly color: HexColor
  readonly pricePerKg: Money
  readonly stock: Kilograms
  readonly capacity: Kilograms
  readonly sortOrder: number
}

export interface VarietyRepository {
  /** Odrůdy do burzy a na homepage — jen aktivní, seřazené podle `sortOrder`. */
  findAllActive(): Promise<Variety[]>
  /** Vše včetně deaktivovaných — pro administraci. */
  findAll(): Promise<Variety[]>
  findById(id: number): Promise<Variety | null>
  existingSlugs(): Promise<string[]>

  /**
   * Načte odrůdy se zámkem `SELECT … FOR UPDATE`. Volá se **výhradně uvnitř transakce**;
   * mimo ni zámek nemá co držet a odečet skladu by nebyl bezpečný.
   * Implementace řadí podle `id`, aby dvě souběžné objednávky na stejné odrůdy
   * v opačném pořadí nezpůsobily deadlock.
   */
  lockForUpdate(ids: number[]): Promise<Variety[]>

  save(variety: Variety): Promise<Variety>
  create(input: NewVarietyInput): Promise<Variety>
  deactivate(id: number): Promise<void>
}

export interface NewOrderInput {
  readonly customer: OrderCustomer
  readonly items: readonly OrderItem[]
  readonly delivery: DeliveryMethod
  readonly payment: PaymentMethod
  readonly subtotal: Money
  readonly deliveryFee: Money
  readonly total: Money
  readonly userId: number | null
  readonly publicToken: string
  readonly createdAt: Date
}

export interface OrderRepository {
  /** Vloží objednávku a přidělí jí `id` i `code`. Kód se odvozuje z `id`, ne z počtu řádků. */
  create(input: NewOrderInput): Promise<Order>
  findById(id: number): Promise<Order | null>
  findByPublicToken(token: string): Promise<Order | null>
  listRecent(limit: number): Promise<Order[]>
  countByStatus(status: OrderStatus): Promise<number>
  updateStatus(id: number, status: OrderStatus): Promise<Order>
  setPaid(id: number, paidAt: Date | null): Promise<Order>
  cancel(id: number, cancelledAt: Date, reason: string): Promise<Order>
  /**
   * Objednávky zákazníka. Hledá podle účtu **i podle e-mailu**: tentýž člověk mohl
   * nakoupit jako host dřív, než si účet založil, a farmáře zajímá celá jeho historie.
   */
  listForCustomer(userId: number, email: EmailAddress): Promise<Order[]>
  /** Množství rezervované v objednávkách, které ještě nebyly vydány. */
  reservedKg(): Promise<Kilograms>
  revenueSince(since: Date): Promise<Money>
  /** Objednávky placené převodem, které nemají zaznamenanou platbu. */
  countAwaitingPayment(since: Date): Promise<number>
}

export interface NewNewsPostInput {
  readonly title: string
  readonly body: string
  readonly tag: NewsTag
  readonly imageUrl: string | null
  readonly publishedAt: Date
  readonly authorId: number | null
}

export interface NewsRepository {
  listPublished(limit: number): Promise<NewsPost[]>
  create(input: NewNewsPostInput): Promise<NewsPost>
  delete(id: number): Promise<void>
}

export interface NewUserInput {
  readonly email: EmailAddress
  readonly name: string
  readonly passwordHash: string
  readonly role: UserRole
  readonly verificationToken: string | null
  readonly verificationExpiresAt: Date | null
}

/** Souhrn objednávek jednoho zákazníka pro seznam v administraci. */
export interface UserOrderStats {
  readonly userId: number
  readonly orderCount: number
  readonly cancelledCount: number
  readonly totalSpent: Money
  readonly lastOrderAt: Date | null
}

export interface UserRepository {
  findByEmail(email: EmailAddress): Promise<User | null>
  findById(id: number): Promise<User | null>
  findByVerificationToken(token: string): Promise<User | null>
  create(input: NewUserInput): Promise<User>
  save(user: User): Promise<User>
  listAll(): Promise<User[]>
  /**
   * Statistiky pro celý seznam najednou. Počítat je dotazem na uživatele by
   * znamenalo N+1 dotazů u tabulky, kterou farmář otevírá denně.
   */
  orderStats(): Promise<UserOrderStats[]>
}

export interface FieldRepository {
  listAll(): Promise<Field[]>
}

export interface HarvestRepository {
  /** Posledních `days` záznamů, seřazeno od nejstaršího — tak, jak se kreslí graf. */
  listRecent(days: number): Promise<HarvestEntry[]>
  totalDug(): Promise<Kilograms>
}

export interface StorageReadingRepository {
  latest(): Promise<StorageReading | null>
}

/**
 * Sada repozitářů. Use-case dostane celou sadu, ne jednotlivé repozitáře, protože
 * uvnitř transakce musí všechny sdílet totéž spojení — jinak by zámky držela jedna
 * transakce a zápisy probíhaly v jiné.
 */
export interface RepositoryBundle {
  readonly varieties: VarietyRepository
  readonly orders: OrderRepository
  readonly news: NewsRepository
  readonly users: UserRepository
  readonly fields: FieldRepository
  readonly harvest: HarvestRepository
  readonly storage: StorageReadingRepository
}
