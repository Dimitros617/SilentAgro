/**
 * Kód objednávky se odvozuje z auto-increment `id`, takže je unikátní i pod souběhem.
 * `COUNT(*) + 1` by dvěma soubežným transakcím vrátilo stejné číslo.
 *
 * Modul stojí sám a nic neimportuje, aby ho mohl použít i seed spouštěný mimo aplikaci —
 * pravidlo tak má jednu jedinou definici.
 */
export const ORDER_CODE_OFFSET = 2609

export const orderCodeFor = (id: number): string => `#${ORDER_CODE_OFFSET + id}`

/** `#2610` → `2610`, tedy variabilní symbol platby. */
export const variableSymbolFor = (code: string): string => code.replace(/\D/g, '')
