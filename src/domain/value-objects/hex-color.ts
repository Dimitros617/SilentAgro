import { ValidationError } from '@/domain/errors'

// Přesně šest hexadecimálních číslic za mřížkou. Barva odrůdy se vkládá do atributu
// `style`, takže cokoli jiného by byla cesta, jak do stránky propašovat cizí CSS.
// Zkrácený tvar #abc schválně nepřijímáme — jedna varianta zápisu znamená jedno
// srovnání při zvýrazňování vybrané barvy v paletě.
const SHAPE = /^#[0-9a-f]{6}$/

export class HexColor {
  private constructor(private readonly hex: string) {}

  static of(raw: string): HexColor {
    const normalized = String(raw ?? '')
      .trim()
      .toLowerCase()

    if (!SHAPE.test(normalized)) {
      throw new ValidationError('Barva musí být ve tvaru #rrggbb')
    }
    return new HexColor(normalized)
  }

  static isValid(raw: string): boolean {
    return SHAPE.test(String(raw ?? '').trim().toLowerCase())
  }

  get value(): string {
    return this.hex
  }

  equals(other: HexColor): boolean {
    return this.hex === other.hex
  }

  toString(): string {
    return this.hex
  }
}
