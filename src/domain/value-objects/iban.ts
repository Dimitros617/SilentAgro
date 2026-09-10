import { ValidationError } from '@/domain/errors'

/**
 * Délka IBANu je dána zemí. Kontrolní číslice samy o sobě špatnou délku neodhalí,
 * takže bez této tabulky by prošel i IBAN, kterému chybí číslice.
 */
const LENGTH_BY_COUNTRY: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26,
  IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MT: 31, NL: 18, NO: 15, PL: 28,
  PT: 25, RO: 24, SE: 24, SI: 19, SK: 24,
}

const normalize = (raw: string): string =>
  String(raw ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()

/**
 * Kontrola podle ISO 13616: první čtyři znaky na konec, písmena na čísla (A=10 … Z=35),
 * výsledek modulo 97 musí být 1.
 *
 * Zbytek se počítá po částech, ne převodem na jedno číslo — český IBAN má po rozepsání
 * 24 číslic a maltský přes 40, což je daleko za `Number.MAX_SAFE_INTEGER`. Jedno velké
 * `Number(...)` by tiše ztratilo přesnost a validace by propouštěla překlepy.
 */
export function isValidIban(raw: string): boolean {
  const iban = normalize(raw)

  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false

  const country = iban.slice(0, 2)
  const expectedLength = LENGTH_BY_COUNTRY[country]
  if (expectedLength === undefined || iban.length !== expectedLength) return false

  const rearranged = iban.slice(4) + iban.slice(0, 4)

  let remainder = 0
  for (const character of rearranged) {
    const chunk =
      character >= 'A' && character <= 'Z'
        ? String(character.charCodeAt(0) - 55)
        : character
    for (const digit of chunk) {
      remainder = (remainder * 10 + Number(digit)) % 97
    }
  }

  return remainder === 1
}

export class Iban {
  private constructor(private readonly iban: string) {}

  static of(raw: string): Iban {
    const normalized = normalize(raw)
    if (!isValidIban(normalized)) {
      throw new ValidationError('IBAN nemá platný tvar nebo kontrolní číslice')
    }
    return new Iban(normalized)
  }

  /** Bez mezer — tak, jak ho vyžaduje SPAYD i bankovní příkaz. */
  get value(): string {
    return this.iban
  }

  /** Po čtveřicích, jak se IBAN píše pro člověka. */
  get formatted(): string {
    return this.iban.replace(/(.{4})/g, '$1 ').trim()
  }

  equals(other: Iban): boolean {
    return this.iban === other.iban
  }

  toString(): string {
    return this.iban
  }
}
