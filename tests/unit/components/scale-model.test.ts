import { describe, expect, it } from 'vitest'
import {
  MAX_POTATOES,
  MAX_WEIGHTS,
  TILT_DEGREES,
  potatoCount,
  potatoPlacement,
  tiltSequence,
  visiblePotatoes,
  weightCount,
} from '@/components/shop/scale-model'

describe('brambory v pytli', () => {
  it('jedna brambora za každé půlkilo', () => {
    expect(potatoCount(0)).toBe(0)
    expect(potatoCount(0.5)).toBe(1)
    expect(potatoCount(5)).toBe(10)
  })

  it('nepočítá záporné ani nesmyslné množství', () => {
    expect(potatoCount(-3)).toBe(0)
    expect(potatoCount(Number.NaN)).toBe(0)
  })

  it('vykreslených je nejvýš strop', () => {
    // Bez stropu by se pytel u větší objednávky přeplnil a animace by běžela
    // několik sekund.
    expect(visiblePotatoes(100)).toBe(MAX_POTATOES)
    expect(visiblePotatoes(3)).toBe(6)
  })
})

describe('rozmístění v pytli', () => {
  it('je stejné při každém volání', () => {
    // Náhoda by rozešla server s prohlížečem a React by ohlásil hydratační chybu.
    expect(potatoPlacement(7)).toEqual(potatoPlacement(7))
  })

  it('se liší kus od kusu, aby hromada nevypadala jako mřížka', () => {
    const first = potatoPlacement(0)
    const second = potatoPlacement(1)

    expect(first.x).not.toBeCloseTo(second.x)
    expect(first.rotate).not.toBeCloseTo(second.rotate)
  })

  it('drží všechny kusy uvnitř pytle', () => {
    for (let index = 0; index < MAX_POTATOES; index += 1) {
      const { x, y, scale } = potatoPlacement(index)
      // Vnitřek pytle: u dna ±31, nahoře se zužuje; svisle -22 až 37.
      expect(Math.abs(x)).toBeLessThan(31)
      expect(y).toBeLessThan(37)
      expect(y).toBeGreaterThan(-22)
      expect(scale).toBeGreaterThan(0.5)
    }
  })

  it('skládá se zdola nahoru', () => {
    // První řada leží na dně, další jsou nad ní — v SVG tedy níž na ose y.
    expect(potatoPlacement(0).y).toBeGreaterThan(potatoPlacement(20).y)
  })
})

describe('závaží na levé misce', () => {
  it('jedno za každý započatý kilogram', () => {
    expect(weightCount(0)).toBe(0)
    expect(weightCount(0.5)).toBe(1)
    expect(weightCount(2)).toBe(2)
    expect(weightCount(2.5)).toBe(3)
  })

  it('má strop, aby sloupec nepřerostl misku', () => {
    expect(weightCount(50)).toBe(MAX_WEIGHTS)
  })
})

describe('náklon ramene', () => {
  it('bez změny stojí rovně', () => {
    expect(tiltSequence(0)).toEqual([0])
  })

  it('při přidání klesne na stranu pytle a dorovná se', () => {
    const [first, second, last] = tiltSequence(2)

    expect(first).toBe(TILT_DEGREES)
    expect(second).toBeLessThan(0)
    expect(Math.abs(second as number)).toBeLessThan(TILT_DEGREES)
    expect(last).toBe(0)
  })

  it('při ubrání se nakloní na opačnou stranu', () => {
    expect(tiltSequence(-2)[0]).toBe(-TILT_DEGREES)
  })
})
