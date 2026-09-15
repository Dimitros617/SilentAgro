import type { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { DeliveryMethod as Delivery } from '@/domain/enums'
import type { DeliveryPolicy } from '@/domain/ports/services'
import type { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { formatKg } from '@/shared/format'
import { variableSymbolFor } from '@/shared/order-code'

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
  private constructor(private readonly props: OrderItemProps & { readonly lineTotal: Money }) {}

  static create(props: OrderItemProps): OrderItem {
    return new OrderItem({ ...props, lineTotal: props.unitPrice.timesKg(props.quantity) })
  }

  static rehydrate(props: OrderItemProps & { readonly lineTotal: Money }): OrderItem {
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
    return this.props.lineTotal
  }
}

export interface OrderCustomer {
  readonly name: string
  readonly email: EmailAddress
  readonly phone: string
  readonly note: string
}

/** Uložený výsledek ocenění; načítání objednávky tato pravidla znovu nespouští. */
export interface OrderAmounts {
  readonly subtotal: Money
  readonly deliveryFee: Money
  readonly discount: Money
  readonly total: Money
  readonly pricingVersion: number
}

export interface OrderProps extends OrderAmounts {
  readonly id: number
  readonly code: string
  readonly publicToken: string
  readonly customer: OrderCustomer
  readonly items: readonly OrderItem[]
  readonly delivery: DeliveryMethod
  /**
   * Poplatek **tak, jak byl účtován**, ne dopočítaný z aktuálního ceníku.
   * Když provozovatel později dopravu zdraží, historická objednávka musí zůstat
   * na původní částce — stejně jako cena odrůdy v položkách.
   */
  readonly deliveryFee: Money
  readonly payment: PaymentMethod
  readonly status: OrderStatus
  readonly paidAt: Date | null
  readonly cancelledAt: Date | null
  readonly cancellationReason: string | null
  readonly userId: number | null
  readonly createdAt: Date
}

export class Order {
  private constructor(private readonly props: OrderProps) {}

  static rehydrate(props: OrderProps): Order {
    return new Order(props)
  }

  /** Výpočet pro novou objednávku. Historická data procházejí výhradně rehydrate. */
  static create(props: Omit<OrderProps, 'subtotal' | 'total' | 'discount' | 'pricingVersion'> & { discount?: Money }): Order {
    const subtotal = Order.subtotalFor(props.items)
    const amounts = Order.calculateAmounts(subtotal, props.deliveryFee, props.discount)
    return new Order({ ...props, ...amounts })
  }

  static subtotalFor(items: readonly OrderItem[]): Money {
    let subtotal = Money.zero()
    for (const item of items) subtotal = subtotal.plus(item.lineTotal)
    return subtotal
  }

  /** Sleva se vztahuje na položky a nesmí překročit jejich cenu. */
  static calculateAmounts(subtotal: Money, deliveryFee: Money, discount = Money.zero()): OrderAmounts {
    const total = subtotal.minus(discount).plus(deliveryFee)
    return { subtotal, deliveryFee, discount, total, pricingVersion: 1 }
  }

  /**
   * Cena dopravy podle platných pravidel. Statická funkce, protože ji potřebuje
   * spočítat i košík, kde objednávka ještě neexistuje — a obě místa musí dojít
   * ke stejnému číslu.
   *
   * Hranice je ostrá: přesně na hodnotě `freeAboveCzk` se ještě účtuje.
   */
  static deliveryFeeFor(
    delivery: DeliveryMethod,
    subtotal: Money,
    policy: Pick<DeliveryPolicy, 'feeCzk' | 'freeAboveCzk'>,
  ): Money {
    if (delivery !== Delivery.LOCAL_DELIVERY) return Money.zero()
    return subtotal.gt(Money.fromCzk(policy.freeAboveCzk))
      ? Money.zero()
      : Money.fromCzk(policy.feeCzk)
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
    return this.props.subtotal
  }

  get discount(): Money {
    return this.props.discount
  }

  get pricingVersion(): number {
    return this.props.pricingVersion
  }

  get deliveryFee(): Money {
    return this.props.deliveryFee
  }

  get total(): Money {
    return this.props.total
  }

  get totalKg(): Kilograms {
    let total = Kilograms.zero()
    for (const item of this.props.items) total = total.plus(item.quantity)
    return total
  }

  /** `Bernie 20 kg · Red Anna 5 kg` — jeden řádek do e-mailu i do tabulky objednávek. */
  get itemsLabel(): string {
    return this.props.items
      .map((item) => `${item.varietyName} ${formatKg(item.quantity)}`)
      .join(' · ')
  }

  /** Variabilní symbol pro platbu: kód bez mřížky. */
  get variableSymbol(): string {
    return variableSymbolFor(this.props.code)
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
