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
import type { OrderAmounts } from '@/domain/entities/order'
import type { MailOutboxRepository, ReservationRequestRepository } from './order-delivery'
import type { OrderFilter, PageRequest, UserFilter } from './pagination'

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

interface VarietyRepository {
  /** Odrůdy do burzy a na homepage — jen aktivní, seřazené podle `sortOrder`. */
  findAllActive(): Promise<Variety[]>
  /** Vše včetně deaktivovaných — pro administraci. */
  findAll(): Promise<Variety[]>
  findById(id: number): Promise<Variety | null>
  existingSlugs(): Promise<string[]>

  save(variety: Variety): Promise<Variety>
  create(input: NewVarietyInput): Promise<Variety>
  deactivate(id: number): Promise<void>
}

export interface TransactionVarietyRepository extends VarietyRepository {
  /**
   * Načte odrůdy se zámkem `SELECT … FOR UPDATE`. Volá se **výhradně uvnitř transakce**;
   * mimo ni zámek nemá co držet a odečet skladu by nebyl bezpečný.
   * Implementace řadí podle `id`, aby dvě souběžné objednávky na stejné odrůdy
   * v opačném pořadí nezpůsobily deadlock.
   */
  lockForUpdate(ids: number[]): Promise<Variety[]>
}

export interface NewOrderInput extends OrderAmounts {
  readonly customer: OrderCustomer
  readonly items: readonly OrderItem[]
  readonly delivery: DeliveryMethod
  readonly payment: PaymentMethod
  readonly userId: number | null
  readonly publicToken: string
  readonly createdAt: Date
}

interface OrderRepository {
  listPage(page: PageRequest, filter: OrderFilter): Promise<Order[]>
  countFiltered(filter: OrderFilter): Promise<number>
  findById(id: number): Promise<Order | null>
  findByPublicToken(token: string): Promise<Order | null>
  listRecent(limit: number): Promise<Order[]>
  countByStatus(status: OrderStatus): Promise<number>
  updateStatus(id: number, status: OrderStatus): Promise<Order>
  setPaid(id: number, paidAt: Date | null): Promise<Order>
  cancel(id: number, cancelledAt: Date, reason: string): Promise<Order>
  /**
   * Objednávky přiřazené k účtu. Shoda přes e-mail tu záměrně **není**: adresu na
   * objednávce nikdo neověřuje, takže by si kdokoli hostovskou objednávkou připsal
   * cizímu účtu historii i útratu. Vazba vzniká jedině zápisem `user_id` — při
   * objednávce z přihlášeného účtu, nebo při ověření e-mailu (`claimGuestOrders`).
   */
  listForCustomer(userId: number): Promise<Order[]>
  /**
   * Připíše účtu hostovské objednávky na jeho adresu, které vznikly před `placedBefore`.
   * Hranici určuje use-case, ne repozitář. Vrací počet přiřazených objednávek.
   */
  claimGuestOrders(userId: number, email: EmailAddress, placedBefore: Date): Promise<number>
  /** Množství rezervované v objednávkách, které ještě nebyly vydány. */
  reservedKg(): Promise<Kilograms>
  orderValueSince(since: Date): Promise<Money>
  /** Objednávky placené převodem, které nemají zaznamenanou platbu. */
  countAwaitingPayment(since: Date): Promise<number>
}

export interface TransactionOrderRepository extends OrderRepository {
  /** Vložení a přidělení kódu podle ID musí uspět nebo se vrátit společně. */
  create(input: NewOrderInput): Promise<Order>
  /** Čtení před změnou objednávky; zámek drží transakce. */
  lockForUpdate(id: number): Promise<Order | null>
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
  /**
   * Čas vzniku účtu posílá aplikace, ne databáze. Proti němu se porovnává
   * `orders.created_at` při přiřazení hostovských objednávek, a ten pochází
   * z portu `Clock` — jinak by hranici určovaly dvoje různé hodiny.
   */
  readonly createdAt: Date
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

interface UserRepository {
  listPage(page: PageRequest, filter: UserFilter): Promise<User[]>
  countFiltered(filter: UserFilter): Promise<number>
  orderStatsForUsers(userIds: readonly number[]): Promise<UserOrderStats[]>
  findByEmail(email: EmailAddress): Promise<User | null>
  findById(id: number): Promise<User | null>
  findByVerificationToken(token: string): Promise<User | null>
  create(input: NewUserInput): Promise<User>
  save(user: User): Promise<User>
  listAll(): Promise<User[]>
  /**
   * Statistiky pro celý seznam najednou. Počítat je dotazem na uživatele by
   * znamenalo N+1 dotazů u tabulky, kterou farmář otevírá denně.
   * Počítají se výhradně objednávky přiřazené k účtu přes `user_id`.
   */
  orderStats(): Promise<UserOrderStats[]>
  /** Statistiky jednoho účtu; detail ani změna účtu nemají agregovat všechny uživatele. */
  orderStatsForUser(userId: number): Promise<UserOrderStats | null>
}

export interface TransactionUserRepository extends UserRepository {
  /** Čtení před změnou účtu; zámek drží transakce. */
  lockForUpdate(id: number): Promise<User | null>
  lockByVerificationToken(token: string): Promise<User | null>
}

export interface FieldRepository {
  listAll(): Promise<Field[]>
}

export interface HarvestRepository {
  /** Posledních `limit` záznamů, seřazeno od nejstaršího — tak, jak se kreslí graf. */
  listRecent(limit: number): Promise<HarvestEntry[]>
  totalDug(): Promise<Kilograms>
}

export interface StorageReadingRepository {
  latest(): Promise<StorageReading | null>
}

/**
 * Repozitáře pro čtení a samostatné atomické operace. Zamykající čtení ani
 * vícekrokové vytvoření objednávky nejsou mimo transakci dostupné.
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

/** Repozitáře předané do transakce sdílejí stejné spojení a její dobu života. */
export interface TransactionRepositoryBundle extends RepositoryBundle {
  readonly varieties: TransactionVarietyRepository
  readonly orders: TransactionOrderRepository
  readonly users: TransactionUserRepository
  readonly reservationRequests: ReservationRequestRepository
  readonly outbox: MailOutboxRepository
}
