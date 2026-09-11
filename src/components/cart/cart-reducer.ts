export interface CartLine {
  readonly varietyId: number
  readonly quantityKg: number
}

export type CartAction =
  | { type: 'add'; varietyId: number; quantityKg: number }
  | { type: 'setQty'; varietyId: number; quantityKg: number }
  | { type: 'remove'; varietyId: number }
  | { type: 'clear' }
  | { type: 'hydrate'; lines: unknown }

export const CART_STORAGE_KEY = 'silentagro.cart.v1'

const STEP = 0.5
const MAX_KG = 1000

const toStep = (value: number): number => Math.round(value * 2) / 2

const isValidLine = (line: unknown): line is CartLine => {
  if (typeof line !== 'object' || line === null) return false
  const candidate = line as Record<string, unknown>

  return (
    Number.isInteger(candidate.varietyId) &&
    (candidate.varietyId as number) > 0 &&
    typeof candidate.quantityKg === 'number' &&
    Number.isFinite(candidate.quantityKg) &&
    candidate.quantityKg > 0 &&
    candidate.quantityKg <= MAX_KG &&
    toStep(candidate.quantityKg as number) === candidate.quantityKg
  )
}

const withQuantity = (state: CartLine[], varietyId: number, quantityKg: number): CartLine[] => {
  const normalized = Math.min(MAX_KG, toStep(quantityKg))

  if (normalized < STEP) return state.filter((line) => line.varietyId !== varietyId)

  const exists = state.some((line) => line.varietyId === varietyId)
  if (!exists) return [...state, { varietyId, quantityKg: normalized }]

  return state.map((line) =>
    line.varietyId === varietyId ? { varietyId, quantityKg: normalized } : line,
  )
}

/**
 * Košík žije v `localStorage`, aby si zákazník mohl nakoupit bez účtu.
 *
 * `hydrate` proto validuje každý řádek: obsah `localStorage` je pod kontrolou uživatele
 * a poškozený zápis by jinak shodil vykreslení. Server si stejně všechno přepočítá —
 * tahle kontrola chrání jen prohlížeč.
 */
export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const current = state.find((line) => line.varietyId === action.varietyId)
      return withQuantity(
        state,
        action.varietyId,
        (current?.quantityKg ?? 0) + action.quantityKg,
      )
    }
    case 'setQty':
      return withQuantity(state, action.varietyId, action.quantityKg)
    case 'remove':
      return state.filter((line) => line.varietyId !== action.varietyId)
    case 'clear':
      return []
    case 'hydrate':
      return Array.isArray(action.lines) ? action.lines.filter(isValidLine) : []
    default:
      return state
  }
}
