import type { AdminVarietyView } from '@/application/dto'

/** Paleta z prototypu — barvy odrůd, ne libovolný výběr. */
export const PALETTE = [
  { hex: '#c98a2b', name: 'Zlatá slupka' },
  { hex: '#c4a457', name: 'Sláma' },
  { hex: '#a9642e', name: 'Hlína' },
  { hex: '#b4553a', name: 'Cihlová' },
  { hex: '#8a9a3f', name: 'Nať' },
  { hex: '#6f8f5a', name: 'Šalvěj' },
  { hex: '#1f6f4a', name: 'Lesní zeleň' },
  { hex: '#7c6a4e', name: 'Kůra' },
] as const

export interface Draft {
  name: string
  tag: string
  description: string
  colorHex: string
  priceCzk: string
  stockKg: string
  capacityKg: string
}

export const toDraft = (variety: AdminVarietyView): Draft => ({
  name: variety.name,
  tag: variety.tag,
  description: variety.description,
  colorHex: variety.colorHex,
  priceCzk: String(variety.priceCzk),
  stockKg: String(variety.stockKg),
  capacityKg: String(variety.capacityKg),
})

export function toNumber(value: string): number {
  if (value.trim().length === 0) return Number.NaN
  return Number(value.trim().replace(',', '.'))
}
