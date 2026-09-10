import { ValidationError } from '@/domain/errors'

// Záměrně nekopírujeme RFC 5322 — plná gramatika propustí adresy, které žádný
// poštovní server nepřijme, a stejně nezaručí doručitelnost. Tohle odchytí překlepy;
// jestli adresa existuje, ukáže až odeslaný e-mail.
const SHAPE = /^[^\s@,;:<>"()[\]\\]+@[^\s@,;:<>"()[\]\\]+\.[a-z0-9-]{2,}$/i

export class EmailAddress {
  private constructor(private readonly address: string) {}

  static of(raw: string): EmailAddress {
    const normalized = String(raw ?? '')
      .trim()
      .toLowerCase()

    if (normalized.length === 0) throw new ValidationError('Vyplňte e-mail')
    if (normalized.length > 255) throw new ValidationError('E-mail je příliš dlouhý')
    if (!SHAPE.test(normalized)) throw new ValidationError('E-mail nemá správný tvar')

    return new EmailAddress(normalized)
  }

  static isValid(raw: string): boolean {
    try {
      EmailAddress.of(raw)
      return true
    } catch {
      return false
    }
  }

  get value(): string {
    return this.address
  }

  equals(other: EmailAddress): boolean {
    return this.address === other.address
  }

  toString(): string {
    return this.address
  }
}
