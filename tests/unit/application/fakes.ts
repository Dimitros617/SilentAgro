import { Field, HarvestEntry, NewsPost, Order, StorageReading, User, Variety } from '@/domain/entities'
import { OrderStatus, PaymentMethod, UserRole } from '@/domain/enums'
import { ConflictError, NotFoundError } from '@/domain/errors'
import type {
  FieldRepository,
  HarvestRepository,
  NewNewsPostInput,
  NewOrderInput,
  NewUserInput,
  NewVarietyInput,
  NewsRepository,
  OrderRepository,
  RepositoryBundle,
  StorageReadingRepository,
  UserOrderStats,
  UserRepository,
  VarietyRepository,
} from '@/domain/ports/repositories'
import type { Clock, Logger, MailMessage, Mailer, PasswordHasher, TokenGenerator } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
// Pravidlo pro kód objednávky má jednu definici; fake ji sdílí s produkčním
// repozitářem, aby test neověřoval kopii pravidla uvnitř fake implementace.
import { orderCodeFor } from '@/infrastructure/persistence/prisma/repositories'
import { MailOrderNotifier } from '@/infrastructure/mail/order-notifier'
import { Iban } from '@/domain/value-objects/iban'

export const makeVariety = (overrides: Partial<{
  id: number
  slug: string
  name: string
  stockKg: number
  capacityKg: number
  priceCzk: number
  isActive: boolean
}> = {}): Variety =>
  Variety.rehydrate({
    id: overrides.id ?? 1,
    slug: overrides.slug ?? 'bernie',
    name: overrides.name ?? 'Bernie',
    tag: 'lahůdková, salátová, varný typ A',
    description: 'Pevná žlutá dužnina, nerozvařuje se.',
    color: HexColor.of('#c98a2b'),
    pricePerKg: Money.fromCzk(overrides.priceCzk ?? 22),
    stock: Kilograms.of(overrides.stockKg ?? 10),
    capacity: Kilograms.of(overrides.capacityKg ?? 160),
    sortOrder: 0,
    isActive: overrides.isActive ?? true,
  })

export class InMemoryVarietyRepository implements VarietyRepository {
  readonly items = new Map<number, Variety>()
  private nextId = 100

  constructor(varieties: Variety[] = []) {
    for (const variety of varieties) this.items.set(variety.id, variety)
  }

  async findAllActive(): Promise<Variety[]> {
    return [...this.items.values()].filter((v) => v.isActive)
  }

  async findAll(): Promise<Variety[]> {
    return [...this.items.values()]
  }

  async findById(id: number): Promise<Variety | null> {
    return this.items.get(id) ?? null
  }

  async existingSlugs(): Promise<string[]> {
    return [...this.items.values()].map((v) => v.slug)
  }

  async lockForUpdate(ids: number[]): Promise<Variety[]> {
    return [...new Set(ids)]
      .sort((a, b) => a - b)
      .map((id) => this.items.get(id))
      .filter((v): v is Variety => v !== undefined)
  }

  async save(variety: Variety): Promise<Variety> {
    this.items.set(variety.id, variety)
    return variety
  }

  async create(input: NewVarietyInput): Promise<Variety> {
    const id = this.nextId++
    const variety = Variety.rehydrate({ ...input, id, isActive: true })
    this.items.set(id, variety)
    return variety
  }

  async deactivate(id: number): Promise<void> {
    const variety = this.items.get(id)
    if (variety) this.items.set(id, variety.with({ isActive: false }))
  }

  get(id: number): Variety | undefined {
    return this.items.get(id)
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly items = new Map<number, Order>()
  private nextId = 1

  async create(input: NewOrderInput): Promise<Order> {
    const id = this.nextId++
    const order = Order.rehydrate({
      id,
      code: orderCodeFor(id),
      publicToken: input.publicToken,
      customer: input.customer,
      items: [...input.items],
      delivery: input.delivery,
      deliveryFee: input.deliveryFee,
      payment: input.payment,
      status: OrderStatus.NEW,
      paidAt: null,
      cancelledAt: null,
      cancellationReason: null,
      userId: input.userId,
      createdAt: input.createdAt,
    })
    this.items.set(id, order)
    return order
  }

  async findById(id: number): Promise<Order | null> {
    return this.items.get(id) ?? null
  }

  async findByPublicToken(token: string): Promise<Order | null> {
    return [...this.items.values()].find((o) => o.publicToken === token) ?? null
  }

  async listRecent(limit: number): Promise<Order[]> {
    return [...this.items.values()].sort((a, b) => b.id - a.id).slice(0, limit)
  }

  async countByStatus(status: OrderStatus): Promise<number> {
    return [...this.items.values()].filter((o) => o.status === status).length
  }

  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = this.items.get(id)
    if (!order) throw new NotFoundError('Objednávka')
    const next = order.withStatus(status)
    this.items.set(id, next)
    return next
  }

  async setPaid(id: number, paidAt: Date | null): Promise<Order> {
    const order = this.items.get(id)
    if (!order) throw new NotFoundError('Objednávka')
    const next = order.withPaidAt(paidAt)
    this.items.set(id, next)
    return next
  }

  async cancel(id: number, cancelledAt: Date, reason: string): Promise<Order> {
    const order = this.items.get(id)
    if (!order) throw new NotFoundError('Objednávka')
    if (order.isCancelled) throw new ConflictError('Objednávka už je zrušená')
    const next = order.withCancellation(cancelledAt, reason)
    this.items.set(id, next)
    return next
  }

  async listForCustomer(userId: number): Promise<Order[]> {
    return [...this.items.values()].filter((o) => o.userId === userId).sort((a, b) => b.id - a.id)
  }

  async claimGuestOrders(
    userId: number,
    email: EmailAddress,
    placedBefore: Date,
  ): Promise<number> {
    let claimed = 0
    for (const [id, order] of this.items) {
      if (order.userId !== null) continue
      if (order.customer.email.value !== email.value) continue
      if (order.createdAt >= placedBefore) continue

      // Order vazbu na účet měnit neumí, tak se objednávka poskládá znovu.
      this.items.set(
        id,
        Order.rehydrate({
          id: order.id,
          code: order.code,
          publicToken: order.publicToken,
          customer: order.customer,
          items: [...order.items],
          delivery: order.delivery,
          deliveryFee: order.deliveryFee,
          payment: order.payment,
          status: order.status,
          paidAt: order.paidAt,
          cancelledAt: order.cancelledAt,
          cancellationReason: order.cancellationReason,
          userId,
          createdAt: order.createdAt,
        }),
      )
      claimed += 1
    }
    return claimed
  }

  async reservedKg(): Promise<Kilograms> {
    return [...this.items.values()]
      .filter((o) => o.status !== OrderStatus.COLLECTED)
      .reduce((sum, o) => sum.plus(o.totalKg), Kilograms.zero())
  }

  async revenueSince(since: Date): Promise<Money> {
    return [...this.items.values()]
      .filter((o) => o.createdAt >= since)
      .reduce((sum, o) => sum.plus(o.total), Money.zero())
  }

  async countAwaitingPayment(since: Date): Promise<number> {
    return [...this.items.values()].filter(
      (o) =>
        !o.isPaid &&
        o.createdAt >= since &&
        (o.payment === PaymentMethod.BANK_TRANSFER || o.payment === PaymentMethod.QR_CODE),
    ).length
  }

  get(id: number): Order | undefined {
    return this.items.get(id)
  }

  last(): Order | undefined {
    return [...this.items.values()].at(-1)
  }
}

export class InMemoryNewsRepository implements NewsRepository {
  readonly items: NewsPost[] = []
  private nextId = 1

  async listPublished(limit: number): Promise<NewsPost[]> {
    return [...this.items]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit)
  }

  async create(input: NewNewsPostInput): Promise<NewsPost> {
    const post = NewsPost.rehydrate({ ...input, id: this.nextId++ })
    this.items.push(post)
    return post
  }

  async delete(id: number): Promise<void> {
    const index = this.items.findIndex((p) => p.id === id)
    if (index >= 0) this.items.splice(index, 1)
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly items: User[] = []
  private nextId = 1

  async findByEmail(email: EmailAddress): Promise<User | null> {
    return this.items.find((u) => u.email.value === email.value) ?? null
  }

  async findById(id: number): Promise<User | null> {
    return this.items.find((u) => u.id === id) ?? null
  }

  async create(input: NewUserInput): Promise<User> {
    const user = User.rehydrate({
      id: this.nextId++,
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      createdAt: input.createdAt,
      verifiedAt: null,
      verificationToken: input.verificationToken ?? null,
      verificationExpiresAt: input.verificationExpiresAt ?? null,
      deactivatedAt: null,
      sessionsInvalidBefore: null,
    })
    this.items.push(user)
    return user
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.items.find((u) => u.verificationToken === token) ?? null
  }

  async save(user: User): Promise<User> {
    const index = this.items.findIndex((u) => u.id === user.id)
    if (index >= 0) this.items[index] = user
    return user
  }

  async listAll(): Promise<User[]> {
    return [...this.items].sort((a, b) => b.id - a.id)
  }

  /**
   * Nulový zástupný výpočet. Skutečnou sémantiku `orderStats` drží syrové SQL, takže
   * se dokazuje v integračních testech (tests/integration/user-order-stats.test.ts);
   * počítat ji tady znovu by testovalo kopii pravidla, ne pravidlo samo.
   */
  async orderStats(): Promise<UserOrderStats[]> {
    return this.items.map((user) => ({
      userId: user.id,
      orderCount: 0,
      cancelledCount: 0,
      totalSpent: Money.zero(),
      lastOrderAt: null,
    }))
  }

  last(): User | undefined {
    return this.items.at(-1)
  }
}

export class InMemoryFieldRepository implements FieldRepository {
  constructor(readonly items: Field[] = []) {}
  async listAll(): Promise<Field[]> {
    return this.items
  }
}

export class InMemoryHarvestRepository implements HarvestRepository {
  constructor(readonly items: HarvestEntry[] = []) {}
  async listRecent(days: number): Promise<HarvestEntry[]> {
    return this.items.slice(-days)
  }
  async totalDug(): Promise<Kilograms> {
    return this.items.reduce((sum, e) => sum.plus(e.dug), Kilograms.zero())
  }
}

export class InMemoryStorageReadingRepository implements StorageReadingRepository {
  constructor(private readonly reading: StorageReading | null = null) {}
  async latest(): Promise<StorageReading | null> {
    return this.reading
  }
}

/**
 * Transakce se v unit testech nesimuluje — jen předá tytéž repozitáře. Rollback
 * patří do integračních testů proti skutečné databázi; tady se ověřuje rozhodovací
 * logika use-case, ne chování MySQL.
 */
export class FakeUnitOfWork implements UnitOfWork {
  constructor(readonly repos: RepositoryBundle) {}

  async runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    return work(this.repos)
  }
}

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = []
  failures = 0

  constructor(private readonly shouldFail = false) {}

  async send(message: MailMessage): Promise<void> {
    if (this.shouldFail) {
      this.failures += 1
      throw new Error('SMTP nedostupné')
    }
    this.sent.push(message)
  }
}

export class FakePasswordHasher implements PasswordHasher {
  verifyCalls = 0

  async hash(plain: string): Promise<string> {
    return `hash:${plain}`
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    this.verifyCalls += 1
    return hash === `hash:${plain}`
  }
}

export class RecordingLogger implements Logger {
  readonly infos: string[] = []
  readonly warns: string[] = []
  readonly errors: string[] = []

  info(message: string): void {
    this.infos.push(message)
  }
  warn(message: string): void {
    this.warns.push(message)
  }
  error(message: string): void {
    this.errors.push(message)
  }
}

export const fixedClock = (iso = '2026-09-10T18:00:00Z'): Clock => ({ now: () => new Date(iso) })

export class SequentialTokenGenerator implements TokenGenerator {
  private counter = 0
  publicToken(): string {
    this.counter += 1
    return `token-${this.counter}`
  }
}

export interface FakeBundleOptions {
  varieties?: Variety[]
  users?: User[]
  fields?: Field[]
  harvest?: HarvestEntry[]
  storage?: StorageReading | null
}

export function makeBundle(options: FakeBundleOptions = {}) {
  const varieties = new InMemoryVarietyRepository(options.varieties ?? [])
  const orders = new InMemoryOrderRepository()
  const news = new InMemoryNewsRepository()
  const users = new InMemoryUserRepository()
  const fields = new InMemoryFieldRepository(options.fields ?? [])
  const harvest = new InMemoryHarvestRepository(options.harvest ?? [])
  const storage = new InMemoryStorageReadingRepository(options.storage ?? null)

  const repos: RepositoryBundle = { varieties, orders, news, users, fields, harvest, storage }

  return { repos, uow: new FakeUnitOfWork(repos), varieties, orders, news, users, fields, harvest, storage }
}

export const FARMER_ROLE = UserRole.FARMER


export class FakeUserNotifier {
  readonly verifications: Array<{ email: string; url: string }> = []
  readonly messages: Array<{ email: string; subject: string; body: string }> = []
  shouldFail = false

  async sendVerification(user: User, verificationUrl: string): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP nedostupné')
    this.verifications.push({ email: user.email.value, url: verificationUrl })
  }

  async sendMessage(user: User, subject: string, body: string): Promise<void> {
    if (this.shouldFail) throw new Error('SMTP nedostupné')
    this.messages.push({ email: user.email.value, subject, body })
  }
}

/** Identita farmy použitá v testech. */
export const TEST_FARM = {
  name: 'SilentAgro',
  legalName: 'Silent Industries',
  companyId: '12345678',
  email: 'farma@silentagro.cz',
  phone: '+420 777 123 456',
} as const

/** Ceník použitý v testech; odpovídá výchozím hodnotám z konfigurace. */
export const TEST_DELIVERY_POLICY = {
  feeCzk: 60,
  freeAboveCzk: 600,
  radiusKm: 20,
  holdDays: 5,
} as const

export const TEST_BANK = {
  iban: Iban.of('CZ6508000000192000145399'),
  accountNumber: '2000145399/0800',
}

/**
 * Notifier postavený nad skutečnými šablonami a falešným odesílatelem.
 *
 * Testy tak pořád ověřují obsah odeslané pošty, ale `ReserveOrder` zná jen port —
 * stub, který by jen zaznamenal „notifikace proběhla“, by nic užitečného netvrdil.
 */
export function makeNotifier(mailer: Mailer, logger: Logger) {
  return new MailOrderNotifier({
    mailer,
    logger,
    bank: TEST_BANK,
    farm: TEST_FARM,
    delivery: TEST_DELIVERY_POLICY,
    config: { farmerEmail: 'farma@silentagro.cz', publicBaseUrl: 'https://silentagro.cz' },
  })
}
