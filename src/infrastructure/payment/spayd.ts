import type { Order } from '@/domain/entities'
import { requiresTransfer } from '@/domain/enums'
import type { Iban } from '@/domain/value-objects/iban'
import type { Money } from '@/domain/value-objects/money'
import { formatCzkPerKg } from '@/shared/format'
import { variableSymbolFor } from '@/shared/order-code'

interface SpaydInput {
  readonly iban: string
  readonly amount: Money
  readonly variableSymbol: string
  readonly message: string
}

export interface BankAccount {
  readonly iban: Iban
  readonly accountNumber: string
}

export interface PaymentDetails {
  readonly accountNumber: string
  readonly iban: string
  readonly ibanFormatted: string
  readonly amountLabel: string
  readonly variableSymbol: string
  /** Přesně to, co má zákazník napsat do zprávy pro příjemce. */
  readonly recipientMessage: string
  /** Celá věta pro zákazníka. Jedna definice pro e-mail i pro web. */
  readonly instruction: string
  readonly spayd: string
}

const MESSAGE_MAX_LENGTH = 60

/**
 * `*` odděluje pole a `%` uvozuje kódování, takže obojí musí být zakódované.
 * Pořadí je podstatné: procento se kóduje první, jinak by se zakódovalo i to,
 * které vzniklo z hvězdičky, a výsledek by nešel přečíst zpět.
 */
const escapeSpaydValue = (raw: string): string =>
  raw.replace(/%/g, '%25').replace(/\*/g, '%2A')

/**
 * Zpráva pro příjemce. Diakritika se odstraňuje, protože ji banky v tomto poli
 * běžně komolí nebo nahrazují otazníky, a farmář pak platbu nespáruje.
 */
const sanitizeMessage = (raw: string): string =>
  escapeSpaydValue(
    raw
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[\r\n]/g, '')
      .trim(),
  ).slice(0, MESSAGE_MAX_LENGTH)

/** `#2610` → `Agro:2610`. Farmář podle ní páruje platbu i bez variabilního symbolu. */
export const buildRecipientMessage = (orderCode: string): string =>
  `Agro:${variableSymbolFor(orderCode)}`

/**
 * Short Payment Descriptor — český standard pro platební QR kódy.
 *
 * Dvojtečka uvnitř hodnoty je v pořádku: pole se dělí na **první** dvojtečce,
 * takže `MSG:Agro:2610` se přečte jako klíč `MSG` a hodnota `Agro:2610`.
 */
export function buildSpayd(input: SpaydInput): string {
  return [
    'SPD',
    '1.0',
    `ACC:${input.iban}`,
    `AM:${input.amount.czk.toFixed(2)}`,
    'CC:CZK',
    `X-VS:${input.variableSymbol}`,
    `MSG:${sanitizeMessage(input.message)}`,
  ].join('*')
}

/**
 * Lhůta se bere z konfigurace, ne z napevno zapsaného čísla. Tentýž e-mail jinde
 * píše „Zboží držíme X dní" podle `RESERVATION_HOLD_DAYS`; se zadrátovanou pětkou
 * si zpráva při jiném nastavení protiřečila sama se sebou.
 */
const INSTRUCTION = (
  amount: string,
  account: string,
  vs: string,
  message: string,
  holdDays: number,
): string =>
  `Částku ${amount} pošlete na účet ${account}, variabilní symbol ${vs}. ` +
  `Do zprávy pro příjemce prosím napište ${message} — podle ní platbu spárujeme. ` +
  `Peníze čekáme do ${holdDays} dní, do té doby brambory držíme.`

/**
 * Platební údaje objednávky, nebo `null` u platby hotově.
 *
 * Částka se formátuje přes `formatCzkPerKg`, který haléře zachovává. `formatCzk`
 * zaokrouhluje na celé koruny a u půlkilových objednávek by vypsal jinou částku,
 * než jakou nese QR kód.
 */
export function buildPaymentDetails(
  order: Order,
  bank: BankAccount,
  holdDays: number,
): PaymentDetails | null {
  if (!requiresTransfer(order.payment)) return null

  const recipientMessage = buildRecipientMessage(order.code)
  const amountLabel = formatCzkPerKg(order.total)

  return {
    accountNumber: bank.accountNumber,
    iban: bank.iban.value,
    ibanFormatted: bank.iban.formatted,
    amountLabel,
    variableSymbol: order.variableSymbol,
    recipientMessage,
    instruction: INSTRUCTION(
      amountLabel,
      bank.accountNumber,
      order.variableSymbol,
      recipientMessage,
      holdDays,
    ),
    spayd: buildSpayd({
      iban: bank.iban.value,
      amount: order.total,
      variableSymbol: order.variableSymbol,
      message: recipientMessage,
    }),
  }
}
