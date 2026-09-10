import { describe, expect, it } from 'vitest'
import { Variety } from '@/domain/entities/variety'
import { InsufficientStockError } from '@/domain/errors'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

const bernie = (stockKg: number, capacityKg = 160) =>
  Variety.rehydrate({
    id: 1,
    slug: 'bernie',
    name: 'Bernie',
    tag: 'lahůdková, salátová, varný typ A',
    description: 'Pevná žlutá dužnina, nerozvařuje se.',
    color: HexColor.of('#c98a2b'),
    pricePerKg: Money.fromCzk(22),
    stock: Kilograms.of(stockKg),
    capacity: Kilograms.of(capacityKg),
    sortOrder: 0,
    isActive: true,
  })

describe('Variety.withdraw', () => {
  it('odečte množství a vrátí novou instanci', () => {
    const before = bernie(10)
    const after = before.withdraw(Kilograms.of(2.5))

    expect(after.stock.value).toBe(7.5)
    expect(before.stock.value).toBe(10)
  })

  it('zachová ostatní vlastnosti', () => {
    const after = bernie(10).withdraw(Kilograms.of(2.5))
    expect(after.id).toBe(1)
    expect(after.name).toBe('Bernie')
    expect(after.pricePerKg.czk).toBe(22)
  })

  it('dovolí odebrat přesně celý sklad', () => {
    expect(bernie(2.5).withdraw(Kilograms.of(2.5)).stock.isZero()).toBe(true)
  })

  it('odmítne odběr nad stav skladu', () => {
    expect(() => bernie(2).withdraw(Kilograms.of(2.5))).toThrow(InsufficientStockError)
  })

  it('v chybě uvede název, dostupné i požadované množství', () => {
    try {
      bernie(2).withdraw(Kilograms.of(2.5))
      expect.unreachable('withdraw měl vyhodit výjimku')
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError)
      const stockError = error as InsufficientStockError
      expect(stockError.varietyName).toBe('Bernie')
      expect(stockError.availableKg).toBe(2)
      expect(stockError.requestedKg).toBe(2.5)
    }
  })

  it('odmítne odběr z vyprodané odrůdy', () => {
    expect(() => bernie(0).withdraw(Kilograms.of(0.5))).toThrow(InsufficientStockError)
  })
})

describe('Variety.fillPercent', () => {
  it('spočítá naplněnost proti vlastní kapacitě', () => {
    expect(bernie(80, 160).fillPercent()).toBe(50)
    expect(bernie(160, 160).fillPercent()).toBe(100)
    expect(bernie(0, 160).fillPercent()).toBe(0)
  })

  it('při nulové kapacitě nevydělí nulou', () => {
    expect(bernie(0, 0).fillPercent()).toBe(0)
  })

  it('sklad nad kapacitou ořízne na sto procent', () => {
    // farmář může nasypat víc, než kolik zásobník podle evidence pojme
    expect(bernie(200, 160).fillPercent()).toBe(100)
  })
})

describe('Variety stavy', () => {
  it('pozná vyprodanou odrůdu', () => {
    expect(bernie(0).isSoldOut()).toBe(true)
    expect(bernie(0.5).isSoldOut()).toBe(false)
  })

  it('hasStockFor je pravdivé i pro přesně celý sklad', () => {
    expect(bernie(2.5).hasStockFor(Kilograms.of(2.5))).toBe(true)
    expect(bernie(2.5).hasStockFor(Kilograms.of(3))).toBe(false)
  })
})
