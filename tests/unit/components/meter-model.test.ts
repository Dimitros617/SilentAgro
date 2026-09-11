import { describe, expect, it } from 'vitest'
import { meterSegments } from '@/components/shop/meter-model'

/** Zásobník na 200 kg, ve kterém leží 100 kg — výplň zabírá půlku ukazatele. */
const bin = { stockKg: 100, capacityKg: 200 }

describe('pásma ukazatele skladu', () => {
  it('bez košíku je celá výplň sytá', () => {
    expect(meterSegments({ ...bin, inCartKg: 0, pendingKg: 0 })).toEqual({
      remainingPercent: 50,
      cartPercent: 0,
      pendingPercent: 0,
    })
  })

  it('košík a nastavené množství ukrajují ze stejné výplně', () => {
    const segments = meterSegments({ ...bin, inCartKg: 20, pendingKg: 10 })

    expect(segments).toEqual({ remainingPercent: 35, cartPercent: 10, pendingPercent: 5 })
    // Součet pásem je pořád celá výplň: ukazatel nesmí narůst tím, že si někdo
    // něco vloží do košíku.
    const sum = segments.remainingPercent + segments.cartPercent + segments.pendingPercent
    expect(sum).toBeCloseTo(50)
  })

  it('nepřeteče, když je v košíku víc, než kolik zbylo na skladě', () => {
    // Košík žije v prohlížeči a může být starší než sklad — odrůdu mezitím
    // koupil někdo jiný.
    const segments = meterSegments({ ...bin, inCartKg: 150, pendingKg: 30 })

    expect(segments.cartPercent).toBe(50)
    expect(segments.pendingPercent).toBe(0)
    expect(segments.remainingPercent).toBe(0)
  })

  it('ignoruje záporné vstupy', () => {
    expect(meterSegments({ ...bin, inCartKg: -5, pendingKg: -1 })).toEqual({
      remainingPercent: 50,
      cartPercent: 0,
      pendingPercent: 0,
    })
  })

  it('nedělí nulou, když odrůda nemá kapacitu', () => {
    expect(meterSegments({ stockKg: 0, capacityKg: 0, inCartKg: 0, pendingKg: 0 })).toEqual({
      remainingPercent: 0,
      cartPercent: 0,
      pendingPercent: 0,
    })
  })
})
