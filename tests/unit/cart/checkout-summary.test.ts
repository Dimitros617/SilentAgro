import { describe, expect, it } from 'vitest'
import { summarizeCheckout } from '@/components/cart/checkout-summary'
import { cartReducer } from '@/components/cart/cart-reducer'
import { toVarietyView } from '@/application/view-models'
import { DeliveryMethod } from '@/domain/enums'
import { makeVariety } from '../application/fakes'

const policy = { feeCzk: 60, freeAboveCzk: 600 }

describe('souhrn košíku', () => {
  it('zaokrouhlí každý řádek stejně jako objednávka na serveru', () => {
    const varieties = [
      toVarietyView(makeVariety({ id: 1, priceCzk: 19.99 })),
      toVarietyView(makeVariety({ id: 2, priceCzk: 19.99 })),
    ]
    const summary = summarizeCheckout([
      { varietyId: 1, quantityKg: 0.5 }, { varietyId: 2, quantityKg: 0.5 },
    ], varieties, DeliveryMethod.PICKUP, policy)
    expect(summary.subtotal.czk).toBe(20)
    expect(summary.total.czk).toBe(20)
  })

  it('přesně na hranici účtuje dopravu, nad hranicí je zdarma', () => {
    const varieties = [toVarietyView(makeVariety({ priceCzk: 20 }))]
    const exact = summarizeCheckout([{ varietyId: 1, quantityKg: 30 }], varieties, DeliveryMethod.LOCAL_DELIVERY, policy)
    const above = summarizeCheckout([{ varietyId: 1, quantityKg: 30.5 }], varieties, DeliveryMethod.LOCAL_DELIVERY, policy)
    expect(exact.total.czk).toBe(660)
    expect(above.total.czk).toBe(610)
  })

  it('nedostupnou odrůdu zachová pro zobrazení a odebrání z košíku', () => {
    const line = { varietyId: 99, quantityKg: 2 }
    const summary = summarizeCheckout([line], [], DeliveryMethod.PICKUP, policy)
    expect(summary.rows).toEqual([])
    expect(summary.unavailableLines).toEqual([line])
  })

  it('uložené duplicitní řádky sloučí podle ID, nikoli názvu', () => {
    expect(cartReducer([], { type: 'hydrate', lines: [
      { varietyId: 1, quantityKg: 2 }, { varietyId: 1, quantityKg: 3 }, { varietyId: 2, quantityKg: 1 },
    ] })).toEqual([{ varietyId: 1, quantityKg: 5 }, { varietyId: 2, quantityKg: 1 }])
  })

  it('neplatné číslo nepřenese do stavu košíku', () => {
    const state = [{ varietyId: 1, quantityKg: 2 }]
    expect(cartReducer(state, { type: 'setQty', varietyId: 1, quantityKg: Number.NaN })).toEqual(state)
  })
})
