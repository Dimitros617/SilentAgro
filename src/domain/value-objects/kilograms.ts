import { ValidationError } from '@/domain/errors'

const STEP = 0.5

/** Zaokrouhlení na nejbližší půl kilogramu bez chyby plovoucí čárky. */
const toStep = (value: number): number => Math.round(value * 2) / 2

/**
 * Množství brambor. Farma prodává po půl kilogramu, takže jiná hodnota nemá fyzický smysl.
 *
 * `of` je přísné a neplatnou hodnotu odmítne — používá se na hranici, kde chceme
 * zákazníkovi říct, že zadal nesmysl. `parse` je smířlivé a zaokrouhlí — používá se
 * pro živé přepisování políčka, kde by výjimka při každém stisku klávesy byla na obtíž.
 */
export class Kilograms {
  static readonly STEP = STEP

  private constructor(private readonly amount: number) {}

  static of(value: number): Kilograms {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError('Množství musí být číslo')
    }
    if (value < 0) {
      throw new ValidationError('Množství nesmí být záporné')
    }
    if (toStep(value) !== value) {
      throw new ValidationError('Množství musí být násobkem 0,5 kg')
    }
    return new Kilograms(value)
  }

  static parse(input: string | number): Kilograms {
    let raw: number

    if (typeof input === 'number') {
      raw = input
    } else {
      const text = String(input ?? '').trim()
      // Znaménko se musí posoudit dřív, než sanitizace odstraní nečíselné znaky —
      // jinak by se z "-5" stalo "5" a překlep by tiše objednal pět kilo.
      if (text.startsWith('-')) return new Kilograms(0)
      raw = Number.parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, ''))
    }

    if (!Number.isFinite(raw) || raw < 0) return new Kilograms(0)
    return new Kilograms(toStep(raw))
  }

  static zero(): Kilograms {
    return new Kilograms(0)
  }

  get value(): number {
    return this.amount
  }

  plus(other: Kilograms): Kilograms {
    return new Kilograms(toStep(this.amount + other.amount))
  }

  minus(other: Kilograms): Kilograms {
    const next = toStep(this.amount - other.amount)
    if (next < 0) throw new ValidationError('Výsledné množství by bylo záporné')
    return new Kilograms(next)
  }

  gte(other: Kilograms): boolean {
    return this.amount >= other.amount
  }

  gt(other: Kilograms): boolean {
    return this.amount > other.amount
  }

  isZero(): boolean {
    return this.amount === 0
  }

  equals(other: Kilograms): boolean {
    return this.amount === other.amount
  }
}
