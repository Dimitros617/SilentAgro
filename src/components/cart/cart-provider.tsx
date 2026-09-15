'use client'

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react'
import { CART_STORAGE_KEY, type CartAction, type CartLine, cartReducer } from './cart-reducer'

interface CartContextValue {
  lines: CartLine[]
  count: number
  totalKg: number
  dispatch: (action: CartAction) => void
  quantityOf: (varietyId: number) => number
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [lines, dispatch] = useReducer(cartReducer, [])

  /**
   * Hydratace proběhne až po prvním vykreslení. Číst `localStorage` už při inicializaci
   * reduceru nejde: na serveru neexistuje, takže by se serverový a klientský výstup
   * lišily a React by ohlásil hydratační chybu.
   */
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CART_STORAGE_KEY)
      if (stored) dispatch({ type: 'hydrate', lines: JSON.parse(stored) })
    } catch {
      // Poškozený nebo nedostupný localStorage znamená prázdný košík, ne pád stránky.
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    // Zápis se přeskočí, dokud hydratace neproběhla. Jinak by prázdný počáteční stav
    // přepsal uložený košík dřív, než se stihne načíst.
    if (!hydrated) return

    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Plné nebo zakázané úložiště nesmí rozbít nákup.
    }
  }, [lines, hydrated])

  const quantityOf = useCallback(
    (varietyId: number) => lines.find((line) => line.varietyId === varietyId)?.quantityKg ?? 0,
    [lines],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.length,
      totalKg: lines.reduce((sum, line) => sum + line.quantityKg, 0),
      dispatch,
      quantityOf,
    }),
    [lines, quantityOf],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart musí být uvnitř CartProvider')
  return context
}
