import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/domain/errors'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

describe('Money', () => {
  it('sčítá bez chyby plovoucí čárky', () => {
    expect(Money.fromCzk(0.1).plus(Money.fromCzk(0.2)).czk).toBe(0.3)
  })

  it('drží částku v celých haléřích', () => {
    expect(Money.fromCzk(19.99).haleru).toBe(1999)
    expect(Money.fromCzk(22).haleru).toBe(2200)
  })

  it('násobí cenou za kilogram přesně i pro půlkila', () => {
    expect(Money.fromCzk(22).timesKg(Kilograms.of(2.5)).czk).toBe(55)
    expect(Money.fromCzk(17).timesKg(Kilograms.of(7.5)).czk).toBe(127.5)
    expect(Money.fromCzk(19).timesKg(Kilograms.of(0.5)).czk).toBe(9.5)
  })

  it('odčítá', () => {
    expect(Money.fromCzk(100).minus(Money.fromCzk(60)).czk).toBe(40)
  })

  it('odmítne odečtení pod nulu', () => {
    expect(() => Money.fromCzk(10).minus(Money.fromCzk(20))).toThrow(ValidationError)
  })

  it('odmítne zápornou částku a NaN', () => {
    expect(() => Money.fromCzk(-1)).toThrow(ValidationError)
    expect(() => Money.fromCzk(Number.NaN)).toThrow(ValidationError)
  })

  it('porovnává přes gt a gte', () => {
    expect(Money.fromCzk(601).gt(Money.fromCzk(600))).toBe(true)
    expect(Money.fromCzk(600).gt(Money.fromCzk(600))).toBe(false)
    expect(Money.fromCzk(600).gte(Money.fromCzk(600))).toBe(true)
  })

  it('sečte tisíc půlkilových položek bez driftu', () => {
    let total = Money.zero()
    for (let i = 0; i < 1000; i += 1) total = total.plus(Money.fromCzk(19).timesKg(Kilograms.of(0.5)))
    expect(total.czk).toBe(9500)
  })

  it('je neměnný', () => {
    const original = Money.fromCzk(100)
    original.plus(Money.fromCzk(50))
    expect(original.czk).toBe(100)
  })
})
