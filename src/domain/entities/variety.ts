import { InsufficientStockError } from '@/domain/errors'
import type { HexColor } from '@/domain/value-objects/hex-color'
import type { Kilograms } from '@/domain/value-objects/kilograms'
import type { Money } from '@/domain/value-objects/money'

export interface VarietyProps {
  readonly id: number
  readonly slug: string
  readonly name: string
  readonly tag: string
  readonly description: string
  readonly color: HexColor
  readonly pricePerKg: Money
  readonly stock: Kilograms
  readonly capacity: Kilograms
  readonly sortOrder: number
  readonly isActive: boolean
}

/**
 * Odrůda brambor i její zásobník. `stock` je jediný zdroj pravdy o tom, kolik je na skladě.
 *
 * Entita je neměnná: `withdraw` vrací novou instanci místo mutace. Odečet skladu probíhá
 * uvnitř databázové transakce a mutace na místě by při rollbacku zanechala v paměti objekt,
 * který už neodpovídá tomu, co je v databázi.
 *
 * Identitu (`id`) přiděluje databáze, proto `rehydrate` a ne `create` — doména si čísla
 * nevymýšlí.
 */
export class Variety {
  private constructor(private readonly props: VarietyProps) {}

  static rehydrate(props: VarietyProps): Variety {
    return new Variety(props)
  }

  get id(): number {
    return this.props.id
  }

  get slug(): string {
    return this.props.slug
  }

  get name(): string {
    return this.props.name
  }

  get tag(): string {
    return this.props.tag
  }

  get description(): string {
    return this.props.description
  }

  get color(): HexColor {
    return this.props.color
  }

  get pricePerKg(): Money {
    return this.props.pricePerKg
  }

  get stock(): Kilograms {
    return this.props.stock
  }

  get capacity(): Kilograms {
    return this.props.capacity
  }

  get sortOrder(): number {
    return this.props.sortOrder
  }

  get isActive(): boolean {
    return this.props.isActive
  }

  hasStockFor(quantity: Kilograms): boolean {
    return this.props.stock.gte(quantity)
  }

  isSoldOut(): boolean {
    return this.props.stock.isZero()
  }

  /** Naplněnost vlastního zásobníku v procentech, 0–100. */
  fillPercent(): number {
    const capacity = this.props.capacity.value
    if (capacity <= 0) return 0
    return Math.max(0, Math.min(100, Math.round((this.props.stock.value / capacity) * 100)))
  }

  /**
   * Vrátí množství zpět do skladu (zrušená objednávka).
   *
   * Kapacita se schválně nehlídá: farmář mohl mezitím kapacitu snížit a odmítnout
   * vrácení by znamenalo, že brambory zmizí z evidence úplně. `fillPercent`
   * si přetečení ořízne na sto procent.
   */
  restock(quantity: Kilograms): Variety {
    return new Variety({ ...this.props, stock: this.props.stock.plus(quantity) })
  }

  withdraw(quantity: Kilograms): Variety {
    if (!this.hasStockFor(quantity)) {
      throw new InsufficientStockError(this.props.name, this.props.stock.value, quantity.value)
    }
    return new Variety({ ...this.props, stock: this.props.stock.minus(quantity) })
  }

  with(changes: Partial<Omit<VarietyProps, 'id' | 'slug'>>): Variety {
    return new Variety({ ...this.props, ...changes })
  }
}
