import { describe, expect, it } from 'vitest'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { formatCzk, formatCzkPerKg, formatDateCs, formatKg, formatKgNumber } from '@/shared/format'

const NBSP = ' '

describe('formatKg', () => {
  it('vynechá zbytečnou desetinnou nulu', () => {
    expect(formatKg(Kilograms.of(20))).toBe('20 kg')
  })

  it('napíše půlkilo českým oddělovačem', () => {
    expect(formatKg(Kilograms.of(7.5))).toBe('7,5 kg')
  })

  it('odděluje tisíce nedělitelnou mezerou', () => {
    expect(formatKgNumber(1234.5)).toBe(`1${NBSP}234,5`)
  })
})

describe('formatCzk', () => {
  it('zaokrouhlí na celé koruny', () => {
    expect(formatCzk(Money.fromCzk(182.5))).toBe('183 Kč')
    expect(formatCzk(Money.fromCzk(182.4))).toBe('182 Kč')
  })

  it('odděluje tisíce nedělitelnou mezerou', () => {
    expect(formatCzk(Money.fromCzk(6480))).toBe(`6${NBSP}480 Kč`)
  })

  it('cenu za kilogram píše bez zaokrouhlení na celé koruny', () => {
    expect(formatCzkPerKg(Money.fromCzk(22))).toBe('22 Kč')
    expect(formatCzkPerKg(Money.fromCzk(19.5))).toBe('19,50 Kč')
  })
})

describe('formatDateCs', () => {
  it('formátuje datum česky', () => {
    expect(formatDateCs(new Date('2026-09-09T12:00:00Z'))).toBe('9. září 2026')
  })

  it('používá pražské pásmo bez ohledu na časové pásmo stroje', () => {
    // 23:30 UTC je v Praze už 10. září; CI běží v UTC, vývojář v Europe/Prague
    expect(formatDateCs(new Date('2026-09-09T23:30:00Z'))).toBe('10. září 2026')
  })

  it('zvládne přelom roku', () => {
    expect(formatDateCs(new Date('2026-12-31T23:30:00Z'))).toBe('1. ledna 2027')
  })
})
