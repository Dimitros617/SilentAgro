/**
 * Doménové chyby. Každá nese strojově čitelný `code`, podle kterého prezentační
 * vrstva vybere českou hlášku a stavový kód — nikdy se uživateli neukazuje `message`
 * z jiné než doménové chyby, aby neunikly detaily databáze nebo konfigurace.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION'
}

export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK'

  constructor(
    readonly varietyName: string,
    readonly availableKg: number,
    readonly requestedKg: number,
  ) {
    super(`${varietyName}: požadováno ${requestedKg} kg, na skladě ${availableKg} kg`)
  }
}

/**
 * Hláška se předává celá, ne jen podstatné jméno: koncovka „nenalezen“ se v češtině
 * řídí rodem (`Uživatel nenalezen`, ale `Objednávka nenalezena`) a šablona ji uhodnout
 * neumí. Text jde přímo uživateli, tak ať je správně.
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND'
}

export class AuthError extends DomainError {
  readonly code = 'AUTH'
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN'

  constructor(message = 'K této části nemáte přístup') {
    super(message)
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT'
}

export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMITED'

  constructor(message = 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.') {
    super(message)
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError
