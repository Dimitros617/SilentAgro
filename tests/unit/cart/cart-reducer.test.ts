import { describe, expect, it } from 'vitest'
import { type CartLine, cartReducer } from '@/components/cart/cart-reducer'

describe('cartReducer — přidávání', () => {
  it('přidá novou položku', () => {
    expect(cartReducer([], { type: 'add', varietyId: 1, quantityKg: 2 })).toEqual([
      { varietyId: 1, quantityKg: 2 },
    ])
  })

  it('přidání téže odrůdy množství sečte', () => {
    const once = cartReducer([], { type: 'add', varietyId: 1, quantityKg: 2 })
    expect(cartReducer(once, { type: 'add', varietyId: 1, quantityKg: 1.5 })).toEqual([
      { varietyId: 1, quantityKg: 3.5 },
    ])
  })

  it('zaokrouhlí na půlkilový krok', () => {
    expect(cartReducer([], { type: 'add', varietyId: 1, quantityKg: 1.3 })).toEqual([
      { varietyId: 1, quantityKg: 1.5 },
    ])
  })

  it('zachová pořadí položek', () => {
    const state = cartReducer(
      cartReducer([], { type: 'add', varietyId: 1, quantityKg: 1 }),
      { type: 'add', varietyId: 2, quantityKg: 1 },
    )
    expect(state.map((line) => line.varietyId)).toEqual([1, 2])
  })
})

describe('cartReducer — změny a mazání', () => {
  it('nastaví množství', () => {
    const state: CartLine[] = [{ varietyId: 1, quantityKg: 2 }]
    expect(cartReducer(state, { type: 'setQty', varietyId: 1, quantityKg: 5 })).toEqual([
      { varietyId: 1, quantityKg: 5 },
    ])
  })

  it('nastavení na nulu řádek odstraní', () => {
    const state: CartLine[] = [{ varietyId: 1, quantityKg: 2 }]
    expect(cartReducer(state, { type: 'setQty', varietyId: 1, quantityKg: 0 })).toEqual([])
  })

  it('odebere řádek', () => {
    const state: CartLine[] = [
      { varietyId: 1, quantityKg: 2 },
      { varietyId: 2, quantityKg: 1 },
    ]
    expect(cartReducer(state, { type: 'remove', varietyId: 1 })).toEqual([
      { varietyId: 2, quantityKg: 1 },
    ])
  })

  it('vyprázdní košík', () => {
    const state: CartLine[] = [{ varietyId: 1, quantityKg: 2 }]
    expect(cartReducer(state, { type: 'clear' })).toEqual([])
  })

  it('neexistující řádek nic nerozbije', () => {
    expect(cartReducer([], { type: 'remove', varietyId: 99 })).toEqual([])
  })
})

describe('cartReducer — hydratace z localStorage', () => {
  it('zahodí poškozené řádky', () => {
    // obsah localStorage je pod kontrolou uživatele
    const state = cartReducer([], {
      type: 'hydrate',
      lines: [
        { varietyId: 1, quantityKg: 2 },
        { varietyId: 0, quantityKg: 5 },
        { varietyId: 2, quantityKg: -3 },
        { varietyId: 3, quantityKg: 0.3 },
        { varietyId: 'ctyri', quantityKg: 1 },
        { quantityKg: 1 },
        null,
        'nesmysl',
      ],
    })

    expect(state).toEqual([{ varietyId: 1, quantityKg: 2 }])
  })

  it('zahodí nesmyslně velké množství', () => {
    const state = cartReducer([], {
      type: 'hydrate',
      lines: [{ varietyId: 1, quantityKg: 999_999 }],
    })
    expect(state).toEqual([])
  })

  it('z hodnoty, která není pole, udělá prázdný košík', () => {
    expect(cartReducer([], { type: 'hydrate', lines: null })).toEqual([])
    expect(cartReducer([], { type: 'hydrate', lines: 'rozbite' })).toEqual([])
    expect(cartReducer([], { type: 'hydrate', lines: { varietyId: 1 } })).toEqual([])
  })
})
