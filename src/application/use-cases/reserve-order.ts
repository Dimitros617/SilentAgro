import { Order, OrderItem } from '@/domain/entities'
import { DeliveryMethod, type PaymentMethod } from '@/domain/enums'
import { NotFoundError, ValidationError } from '@/domain/errors'
import type { OrderMailComposer } from '@/domain/ports/order-delivery'
import type { Clock, DeliveryPolicy, TokenGenerator } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'

export interface ReserveOrderInput {
  readonly requestKey: string
  readonly customer: {
    readonly name: string
    readonly email: string
    readonly phone: string
    readonly note: string
  }
  readonly delivery: DeliveryMethod
  readonly payment: PaymentMethod
  readonly items: ReadonlyArray<{ varietyId: number; quantityKg: number }>
  readonly userId: number | null
}

export interface ReserveOrderResult {
  readonly code: string
  readonly publicToken: string
}

export interface ReserveOrderDeps {
  readonly uow: UnitOfWork
  readonly clock: Clock
  readonly tokenGenerator: TokenGenerator
  readonly composer: OrderMailComposer
  /** Ceník dopravy z konfigurace, ne konstanta v doméně. */
  readonly deliveryPolicy: DeliveryPolicy
}

/**
 * Rezervace, která okamžitě odečte sklad.
 *
 * Celý odečet i vložení objednávky probíhá v jedné transakci se zámkem řádků odrůd.
 * Bez toho by dvě souběžné objednávky na poslední kilo obě prošly a sklad by spadl
 * do mínusu.
 */
export class ReserveOrder {
  constructor(private readonly deps: ReserveOrderDeps) {}

  async execute(input: ReserveOrderInput): Promise<ReserveOrderResult> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestKey)) {
      throw new ValidationError('Chybí platný identifikátor pokusu o rezervaci')
    }
    const requestKey = input.requestKey.toLowerCase()
    const customer = this.validateCustomer(input)
    const requested = this.mergeItems(input.items)
    // Normalizované údaje a identita ze session. Stejný klíč nesmí zpřístupnit jiný nákup.
    const content = JSON.stringify({
      customer: { ...customer, email: customer.email.value },
      delivery: input.delivery, payment: input.payment, userId: input.userId,
      items: [...requested].sort(([a], [b]) => a - b).map(([id, quantity]) => [id, quantity.value]),
    })

    const order = await this.deps.uow.runInTransaction(async (repos) => {
      const existingId = await repos.reservationRequests.claim(requestKey, content)
      if (existingId !== null) {
        const existing = await repos.orders.findById(existingId)
        if (!existing) throw new NotFoundError('Původní rezervace')
        return existing
      }
      const locked = await repos.varieties.lockForUpdate([...requested.keys()])
      const byId = new Map(locked.map((variety) => [variety.id, variety]))

      const items: OrderItem[] = []

      for (const [varietyId, quantity] of requested) {
        const variety = byId.get(varietyId)
        if (!variety || !variety.isActive) {
          throw new ValidationError('Jedna z odrůd už není v nabídce')
        }

        // Vyhodí InsufficientStockError dřív, než se cokoli zapíše — po zámku
        // se tedy ověří celý košík a teprve pak se sklad mění.
        const withdrawn = variety.withdraw(quantity)
        byId.set(varietyId, withdrawn)

        items.push(
          OrderItem.create({
            varietyId: variety.id,
            varietyName: variety.name,
            // Cena vždy ze skladu. Klient ji vůbec neposílá a poslat by ji nemohl.
            unitPrice: variety.pricePerKg,
            quantity,
          }),
        )
      }

      for (const variety of byId.values()) {
        await repos.varieties.save(variety)
      }

      const subtotal = Order.subtotalFor(items)
      const deliveryFee = Order.deliveryFeeFor(input.delivery, subtotal, this.deps.deliveryPolicy)
      const amounts = Order.calculateAmounts(subtotal, deliveryFee)

      const created = await repos.orders.create({
        customer,
        items,
        delivery: input.delivery,
        payment: input.payment,
        ...amounts,
        userId: input.userId,
        publicToken: this.deps.tokenGenerator.publicToken(),
        createdAt: this.deps.clock.now(),
      })
      const messages = await this.deps.composer.orderPlaced(created)
      for (const [index, message] of messages.entries()) {
        await repos.outbox.enqueue(`order:${created.id}:placed:${index}`, message)
      }
      await repos.reservationRequests.complete(requestKey, created.id)
      return created
    })

    return { code: order.code, publicToken: order.publicToken }
  }

  private validateCustomer(input: ReserveOrderInput) {
    const name = input.customer.name.trim()
    if (name.length === 0) throw new ValidationError('Vyplňte jméno a příjmení')

    const email = EmailAddress.of(input.customer.email)
    const phone = input.customer.phone.trim()

    if (input.delivery === DeliveryMethod.LOCAL_DELIVERY && phone.length === 0) {
      throw new ValidationError('U rozvozu potřebujeme telefon')
    }

    return { name, email, phone, note: input.customer.note.trim() }
  }

  /**
   * Klient může poslat tutéž odrůdu na víc řádcích. Sloučení je nutné, aby se sklad
   * kontroloval proti celkovému požadovanému množství, ne proti jednotlivým řádkům.
   */
  private mergeItems(items: ReserveOrderInput['items']): Map<number, Kilograms> {
    const merged = new Map<number, Kilograms>()

    for (const line of items) {
      // `of` je přísné schválně: 0,3 kg se neprodává a tiché zaokrouhlení by
      // zákazníkovi změnilo objednávku, aniž by se to dozvěděl.
      const quantity = Kilograms.of(line.quantityKg)
      if (quantity.isZero()) continue

      merged.set(line.varietyId, (merged.get(line.varietyId) ?? Kilograms.zero()).plus(quantity))
    }

    if (merged.size === 0) throw new ValidationError('Košík je prázdný')
    return merged
  }
}
