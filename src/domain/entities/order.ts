import type { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { DeliveryMethod as Delivery } from '@/domain/enums'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { formatKg } from '@/shared/format'

export interface OrderItemProps {
  readonly varietyId: number
  readonly varietyName: string
  readonly unitPrice: Money
  readonly quantity: Kilograms
}

/**
 * Řádek objednávky. `varietyName` a `unitPrice` jsou **snapshoty** z okamžiku rezervace —
 * když farmář později přejmenuje odrůdu nebo zdraží, historická objednávka musí zůstat
 * na původní částce a názvu.
 */
export class OrderItem {
  private constructor(private readonly props: OrderItemProps) {}

  static create(props: OrderItemProps): OrderItem {
    return new OrderItem(props)
  }

  get varietyId(): number {
    return this.props.varietyId
  }

  get varietyName(): string {
    return this.props.varietyName
  }

  get unitPrice(): Money {
    return this.props.unitPrice
  }

  get quantity(): Kilograms {
    return this.props.quantity
  }

  get lineTotal(): Money {
    return this.props.unitPrice.timesKg(this.props.quantity)
  }
}

export interface OrderCustomer {
  readonly name: string
  readonly email: EmailAddress
  readonly phone: string
  readonly note: string
}

export interface OrderProps {
  readonly id: number
  readonly code: string
  readonly publicToken: string
  readonly customer: OrderCustomer
  readonly items: readonly OrderItem[]
  readonly delivery: DeliveryMethod
  readonly payment: PaymentMethod
  readonly status: OrderStatus
  readonly paidAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  readonly userId: number | null
  readonly createdAt: Date
}

export class Order {
  /** Nad touto částkou je rozvoz zdarma. Hranice je ostrá: přesně 600 Kč se ještě účtuje. */
  static readonly FREE_DELIVERY_THRESHOLD = Money.fromCzk(600)
  static readonly DELIVERY_FEE = Money.fromCzk(60)

  private constructor(private readonly props: OrderProps) {}

  static rehydrate(props: OrderProps): Order {
    return new Order(props)
  }

  /**
   * Cena dopravy. Je to statická funkce, protože ji potřebuje spočítat i košík, kde
   * objednávka ještě neexistuje — a obě místa musí dojít ke stejnému číslu.
   */
  static deliveryFeeFor(delivery: DeliveryMethod, subtotal: Money): Money {
    if (delivery !== Delivery.LOCAL_DELIVERY) return Money.zero()
    return subtotal.gt(Order.FREE_DELIVERY_THRESHOLD) ? Money.zero() : Order.DELIVERY_FEE
  }

  get id(): number {
    return this.props.id
  }

  get code(): string {
    return this.props.code
  }

  get publicToken(): string {
    return this.props.publicToken
  }

  get customer(): OrderCustomer {
    return this.props.customer
  }

  get items(): readonly OrderItem[] {
    return this.props.items
  }

  get delivery(): DeliveryMethod {
    return this.props.delivery
  }

  get payment(): PaymentMethod {
    return this.props.payment
  }

  get status(): OrderStatus {
    return this.props.status
  }

  get paidAt(): Date | null {
    return this.props.paidAt
  }

  get cancelledAt(): Date | null {
    return this.props.cancelledAt
  }

  get cancellationReason(): string | null {
    return this.props.cancellationReason
  }

  /**
   * Zrušení je nezávislé na `status`: informace, v jakém stavu objednávka byla,
   * se tím nemá ztratit. Zároveň je to pojistka proti dvojímu vrácení skladu.
   */
  get isCancelled(): boolean {
    return this.props.cancelledAt !== null
  }

  get userId(): number | null {
    return this.props.userId
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get isPaid(): boolean {
    return this.props.paidAt !== null
  }

  get subtotal(): Money {
    return this.props.items.reduce((sum, item) => sum.plus(item.lineTotal), Money.zero())
  }

  get deliveryFee(): Money {
    return Order.deliveryFeeFor(this.props.delivery, this.subtotal)
  }

  get total(): Money {
    return this.subtotal.plus(this.deliveryFee)
  }

  get totalKg(): Kilograms {
    return this.props.items.reduce((sum, item) => sum.plus(item.quantity), Kilograms.zero())
  }

  /** `Bernie 20 kg · Red Anna 5 kg` — jeden řádek do e-mailu i do tabulky objednávek. */
  get itemsLabel(): string {
    return this.props.items
      .map((item) => `${item.varietyName} ${formatKg(item.quantity)}`)
      .join(' · ')
  }

  /** Variabilní symbol pro platbu: kód bez mřížky. */
  get variableSymbol(): string {
    return this.props.code.replace(/\D/g, '')
  }

  withStatus(status: OrderStatus): Order {
    return new Order({ ...this.props, status })
  }

  withPaidAt(paidAt: Date | null): Order {
    return new Order({ ...this.props, paidAt })
  }

  withCancellation(cancelledAt: Date, reason: string): Order {
    return new Order({ ...this.props, cancelledAt, cancellationReason: reason })
  }
}
