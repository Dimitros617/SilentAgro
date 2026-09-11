/**
 * Výsledek na hranici mezi use-case a UI.
 *
 * Server actions nikdy nevyhazují výjimku ven — React by ji v produkci nahradil obecnou
 * hláškou a uživatel by nevěděl, co se stalo. Místo toho vracejí `Result`, který jde
 * bezpečně serializovat a vykreslit.
 */
export interface Success<T> {
  readonly ok: true
  readonly value: T
}

export interface Failure<E = string> {
  readonly ok: false
  readonly error: E
  readonly code?: string
}

export type Result<T, E = string> = Success<T> | Failure<E>

export const ok = <T>(value: T): Success<T> => ({ ok: true, value })

/**
 * Vrací `Failure`, ne `Result`. Volající se tak dostane k `error` bez zužování typu —
 * u funkce, která nikdy neuspěje, je zúžení jen šum.
 */
export const err = (error: string, code?: string): Failure<string> =>
  code === undefined ? { ok: false, error } : { ok: false, error, code }
