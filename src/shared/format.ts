import type { Kilograms } from '@/domain/value-objects/kilograms'
import type { Money } from '@/domain/value-objects/money'

/**
 * Farma je česká, takže se formátuje výhradně v `cs-CZ` a v pražském pásmu — bez ohledu
 * na časové pásmo serveru. Bez pevného `timeZone` by kontejner v UTC vypsal u objednávky
 * přijaté v 1:30 ráno předchozí den a testy by padaly podle toho, kde běží.
 */
const TIME_ZONE = 'Europe/Prague'
const LOCALE = 'cs-CZ'

const quantityFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })
const wholeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const preciseFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
})
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

/** Číslo v kilogramech bez jednotky: `1 234,5`. */
export const formatKgNumber = (value: number): string => quantityFormat.format(value)

/** Množství s jednotkou: `7,5 kg`. */
export const formatKg = (quantity: Kilograms): string => `${formatKgNumber(quantity.value)} kg`

/** Celková částka zaokrouhlená na koruny: `6 480 Kč`. */
export const formatCzk = (money: Money): string => `${wholeFormat.format(money.czk)} Kč`

/**
 * Cena za kilogram. Haléře se ukazují jen tehdy, když nějaké jsou — `22 Kč`, ale `19,50 Kč`.
 * Zaokrouhlit ji na celé koruny nelze: násobí se množstvím, takže by se chyba propsala
 * do celkové částky.
 */
export const formatCzkPerKg = (money: Money): string =>
  money.haleru % 100 === 0
    ? `${wholeFormat.format(money.czk)} Kč`
    : `${preciseFormat.format(money.czk)} Kč`

/** Datum česky: `9. září 2026`. */
export const formatDateCs = (date: Date): string => dateFormat.format(date)

/** Datum s časem: `9. září 19:42`. */
export const formatDateTimeCs = (date: Date): string => dateTimeFormat.format(date)

/** Procento pro popisky grafů. */
export const formatPercent = (value: number): string => `${Math.round(value)} %`

/** Plocha pole: `180 m²`. */
export const formatArea = (squareMeters: number): string =>
  `${wholeFormat.format(squareMeters)} m²`
