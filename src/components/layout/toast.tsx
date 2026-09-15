'use client'

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface ToastContextValue {
  show: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VISIBLE_MS = 2600

export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((next: string) => {
    if (timer.current) clearTimeout(timer.current)
    setMessage(next)
    timer.current = setTimeout(() => setMessage(''), VISIBLE_MS)
  }, [])

  // Bez úklidu by časovač po odpojení komponenty sáhl na stav, který už neexistuje.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* `role="status"` a `aria-live` zajistí, že hlášku přečte i odečítač obrazovky */}
      <div role="status" aria-live="polite">
        {message ? <div className="toast">{message}</div> : null}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast musí být uvnitř ToastProvider')
  return context
}
