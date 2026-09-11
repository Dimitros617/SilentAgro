import type { UserRole } from '@/domain/enums'

/** Inline příloha e-mailu. S vyplněným `cid` na ni HTML odkazuje jako `cid:<hodnota>`. */
export interface MailAttachment {
  readonly filename: string
  readonly content: Buffer
  readonly contentType: string
  readonly cid?: string
}

export interface MailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
  readonly attachments?: readonly MailAttachment[]
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>
  verify(plain: string, hash: string): Promise<boolean>
}

export interface SessionPayload {
  readonly userId: number
  readonly role: UserRole
  readonly name: string
}

export interface TokenService {
  sign(payload: SessionPayload): Promise<string>
  verify(token: string): Promise<SessionPayload | null>
}

/**
 * Zdroj času. Existuje proto, aby testy mohly dosadit pevný okamžik — jinak by
 * `SetOrderPaid` nešlo otestovat jinak než porovnáním na toleranci.
 */
export interface Clock {
  now(): Date
}

export interface TokenGenerator {
  /** Nevypočitatelný identifikátor do veřejné URL potvrzení objednávky. */
  publicToken(): string
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/** Platební pokyn pro zákazníka. Prostá data — doména neví, jak vznikl QR kód. */
export interface PaymentInstruction {
  readonly accountNumber: string
  readonly iban: string
  readonly ibanFormatted: string
  readonly amountLabel: string
  readonly variableSymbol: string
  readonly recipientMessage: string
  readonly instruction: string
  /** `data:` URI s QR kódem, nebo `null`, když se nepodařilo vykreslit. */
  readonly qrDataUrl: string | null
}

export interface SentMailPreview {
  readonly kind: string
  readonly to: string
  readonly subject: string
  readonly body: string
}
