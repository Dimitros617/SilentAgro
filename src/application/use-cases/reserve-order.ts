import { Order, OrderItem } from '@/domain/entities'
import { DeliveryMethod, type PaymentMethod } from '@/domain/enums'
import { ValidationError } from '@/domain/errors'
import type { OrderNotifier } from '@/domain/ports/order-presentation'
import type { Clock, DeliveryPolicy, TokenGenerator } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

export interface ReserveOrderInput {
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
  /**
   * Jediné, co use-case o notifikacích ví. Že se pod tím skládají dva e-maily
   * a generuje QR kód, je věc infrastruktury.
   */
  readonly notifier: OrderNotifier
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
    const customer = this.validateCustomer(input)
    const requested = this.mergeItems(input.items)

    const order = await this.deps.uow.runInTransaction(async (repos) => {
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

      const subtotal = items.reduce((sum, item) => sum.plus(item.lineTotal), Money.zero())
      const deliveryFee = Order.deliveryFeeFor(input.delivery, subtotal, this.deps.deliveryPolicy)

      return repos.orders.create({
        customer,
        items,
        delivery: input.delivery,
        payment: input.payment,
        subtotal,
        deliveryFee,
        total: subtotal.plus(deliveryFee),
        userId: input.userId,
        publicToken: this.deps.tokenGenerator.publicToken(),
        createdAt: this.deps.clock.now(),
      })
    })

    // Až po commitu. Sklad je pravda, e-mail je notifikace — výpadek SMTP nesmí
    // zrušit platnou rezervaci, takže si selhání ošetřuje notifier sám.
    await this.deps.notifier.notifyOrderPlaced(order)

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
