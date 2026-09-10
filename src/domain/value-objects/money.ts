import { ValidationError } from '@/domain/errors'
import type { Kilograms } from '@/domain/value-objects/kilograms'

/**
 * Peněžní částka v korunách, vnitřně držená jako celý počet haléřů.
 *
 * Důvod: `0.1 + 0.2 !== 0.3` v plovoucí čárce. Košík se sčítá z desítek položek
 * a rozdíl by se nasčítal do částky, kterou zákazník zaplatí. Celá čísla ten problém
 * nemají, převod na koruny je jediné dělení a proběhne až při čtení.
 */
export class Money {
  private constructor(private readonly hellers: number) {}

  static fromCzk(czk: number): Money {
    if (typeof czk !== 'number' || !Number.isFinite(czk)) {
      throw new ValidationError('Částka musí být číslo')
    }
    if (czk < 0) throw new ValidationError('Částka nesmí být záporná')
    return new Money(Math.round(czk * 100))
  }

  static fromHellers(hellers: number): Money {
    if (!Number.isInteger(hellers) || hellers < 0) {
      throw new ValidationError('Částka v haléřích musí být nezáporné celé číslo')
    }
    return new Money(hellers)
  }

  static zero(): Money {
    return new Money(0)
  }

  get czk(): number {
    return this.hellers / 100
  }

  get haleru(): number {
    return this.hellers
  }

  plus(other: Money): Money {
    return new Money(this.hellers + other.hellers)
  }

  minus(other: Money): Money {
    const next = this.hellers - other.hellers
    if (next < 0) throw new ValidationError('Výsledná částka by byla záporná')
    return new Money(next)
  }

  /**
   * Cena za kilogram × množství. Násobí se haléře, takže půlkilo dává přesný výsledek
   * (2200 × 2,5 = 5500 haléřů = 55 Kč) místo hromadění chyby v desetinné části.
   */
  timesKg(quantity: Kilograms): Money {
    return new Money(Math.round(this.hellers * quantity.value))
  }

  gt(other: Money): boolean {
    return this.hellers > other.hellers
  }

  gte(other: Money): boolean {
    return this.hellers >= other.hellers
  }

  isZero(): boolean {
    return this.hellers === 0
  }

  equals(other: Money): boolean {
    return this.hellers === other.hellers
  }
}
