import { describe, expect, it } from 'vitest'
import { ValidationError } from '@/domain/errors'
import { Kilograms } from '@/domain/value-objects/kilograms'

describe('Kilograms.of', () => {
  it('přijme násobky půl kilogramu', () => {
    expect(Kilograms.of(0).value).toBe(0)
    expect(Kilograms.of(0.5).value).toBe(0.5)
    expect(Kilograms.of(7).value).toBe(7)
    expect(Kilograms.of(148.5).value).toBe(148.5)
  })

  it('odmítne hodnotu mimo půlkilový krok', () => {
    expect(() => Kilograms.of(0.3)).toThrow(ValidationError)
    expect(() => Kilograms.of(1.25)).toThrow(/0,5/)
  })

  it('odmítne zápornou hodnotu', () => {
    expect(() => Kilograms.of(-1)).toThrow(ValidationError)
  })

  it('odmítne NaN a nekonečno', () => {
    expect(() => Kilograms.of(Number.NaN)).toThrow(ValidationError)
    expect(() => Kilograms.of(Number.POSITIVE_INFINITY)).toThrow(ValidationError)
  })
})

describe('Kilograms.parse', () => {
  it('rozumí českému i anglickému desetinnému oddělovači', () => {
    expect(Kilograms.parse('1,5').value).toBe(1.5)
    expect(Kilograms.parse('1.5').value).toBe(1.5)
    expect(Kilograms.parse(2.5).value).toBe(2.5)
  })

  it('zaokrouhlí na nejbližší půl kilogramu', () => {
    expect(Kilograms.parse('1,7').value).toBe(1.5)
    expect(Kilograms.parse('1,8').value).toBe(2)
    expect(Kilograms.parse('0,3').value).toBe(0.5)
    expect(Kilograms.parse('0,2').value).toBe(0)
  })

  it('z nesmyslného vstupu udělá nulu, nevyhodí výjimku', () => {
    expect(Kilograms.parse('abc').value).toBe(0)
    expect(Kilograms.parse('').value).toBe(0)
    expect(Kilograms.parse('-5').value).toBe(0)
  })

  it('odstraní jednotku napsanou za číslem', () => {
    expect(Kilograms.parse('2,5 kg').value).toBe(2.5)
  })
})

describe('Kilograms aritmetika', () => {
  it('sčítá bez chyby plovoucí čárky', () => {
    let acc = Kilograms.zero()
    for (let i = 0; i < 10; i += 1) acc = acc.plus(Kilograms.of(0.5))
    expect(acc.value).toBe(5)
  })

  it('odčítá', () => {
    expect(Kilograms.of(2).minus(Kilograms.of(0.5)).value).toBe(1.5)
    expect(Kilograms.of(2.5).minus(Kilograms.of(2.5)).isZero()).toBe(true)
  })

  it('odmítne odečtení pod nulu', () => {
    expect(() => Kilograms.of(1).minus(Kilograms.of(2))).toThrow(ValidationError)
  })

  it('porovnává přes gte a gt', () => {
    expect(Kilograms.of(2).gte(Kilograms.of(2))).toBe(true)
    expect(Kilograms.of(2).gt(Kilograms.of(2))).toBe(false)
    expect(Kilograms.of(1.5).gte(Kilograms.of(2))).toBe(false)
  })

  it('porovnává hodnotu, ne referenci', () => {
    expect(Kilograms.of(2).equals(Kilograms.of(2))).toBe(true)
    expect(Kilograms.of(2).equals(Kilograms.of(2.5))).toBe(false)
  })

  it('je neměnný — operace vrací novou instanci', () => {
    const original = Kilograms.of(5)
    original.plus(Kilograms.of(1))
    expect(original.value).toBe(5)
  })
})
