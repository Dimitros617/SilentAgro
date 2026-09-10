/**
 * Výsledek na hranici mezi use-case a UI.
 *
 * Server actions nikdy nevyhazují výjimku ven — React by ji v produkci nahradil obecnou
 * hláškou a uživatel by nevěděl, co se stalo. Místo toho vracejí `Result`, který jde
 * bezpečně serializovat a vykreslit.
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly code?: string }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = (error: string, code?: string): Result<never, string> =>
  code === undefined ? { ok: false, error } : { ok: false, error, code }
