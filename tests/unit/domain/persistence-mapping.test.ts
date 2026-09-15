import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { decimalToNumber, rawToVariety } from '@/infrastructure/persistence/prisma/mappers'

describe('hranice databáze a domény', () => {
  it.each([22.5, '22.5', new Prisma.Decimal('22.5')])('převede platný DECIMAL %s', (value) => {
    expect(decimalToNumber(value)).toBe(22.5)
  })

  it.each([null, undefined, '', '12kg', false, {}, Number.NaN, Infinity])('neplatné číslo %s nenahradí nulou', (value) => {
    expect(() => decimalToNumber(value)).toThrow()
  })

  it('neplatné uložené množství nezaokrouhlí', () => {
    expect(() => rawToVariety({
      id: 1, slug: 'bernie', name: 'Bernie', tag: '', description: '', color_hex: '#c98a2b',
      price_per_kg_czk: 20, stock_kg: 0.3, capacity_kg: 10, sort_order: 0, is_active: 1,
    })).toThrow(/0,5/)
  })
})
