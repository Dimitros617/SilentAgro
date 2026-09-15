'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { reserveOrderAction } from '@/app/actions/order'
import { useCart } from './cart-provider'
import type { CartLine } from './cart-reducer'
import type { CheckoutForm } from './checkout-validation'
import { clearAttempt, readAttempt, saveAttempt, type ReservationAttempt } from './reservation-attempt'

/** Obnova a odeslání jednoho pokusu; formulář validuje volající před novou rezervací. */
export function useReservation() {
  const router = useRouter()
  const { dispatch } = useCart()
  const [attempt, setAttempt] = useState<ReservationAttempt | null>(null)
  const [restored, setRestored] = useState(false)
  const [pending, setPending] = useState(false)
  const [serverError, setServerError] = useState('')
  const submitting = useRef(false)

  useEffect(() => {
    try {
      setAttempt(readAttempt(localStorage))
    } catch {
      // Úložiště může být v prohlížeči zakázané.
    }
    setRestored(true)
  }, [])

  async function reserve(form: CheckoutForm, items: readonly CartLine[]): Promise<void> {
    if (!restored || submitting.current) return
    if (attempt?.token) {
      router.push(`/rezervace/${attempt.token}`)
      return
    }

    submitting.current = true
    setPending(true)
    setServerError('')
    try {
      const current = attempt ?? {
        requestKey: crypto.randomUUID(),
        form: { ...form },
        items: items.map((item) => ({ ...item })),
      }
      // Uložit před síťovým požadavkem. Po nejasném výsledku se posílá tentýž obsah.
      saveAttempt(localStorage, current)
      setAttempt(current)
      const result = await reserveOrderAction({
        requestKey: current.requestKey,
        customer: {
          name: current.form.name,
          email: current.form.email,
          phone: current.form.phone,
          note: current.form.note,
        },
        delivery: current.form.delivery,
        payment: current.form.payment,
        items: current.items,
      })

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      const completed = { ...current, token: result.value.token }
      setAttempt(completed)
      saveAttempt(localStorage, completed)
      dispatch({ type: 'clear' })
      // Navigace mimo useTransition: potvrzení musí následovat i po vyprázdnění košíku.
      router.push(`/rezervace/${result.value.token}`)
    } catch {
      setServerError('Rezervaci se nepodařilo potvrdit. Zkuste původní pokus znovu. Pokud prohlížeč blokuje ukládání dat webu, povolte ho pro obnovení rezervace.')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  function startNewReservation(): void {
    if (!attempt || submitting.current) return
    if (!attempt.token) {
      const confirmed = window.confirm('Původní rezervace již může být uložená. Její opuštění ji nezruší. Opravdu chcete začít novou rezervaci?')
      if (!confirmed) return
    }
    try {
      clearAttempt(localStorage)
      setAttempt(null)
      setServerError('')
    } catch {
      setServerError('Původní pokus nelze odstranit. Povolte v prohlížeči ukládání dat webu.')
    }
  }

  return { attempt, restored, pending, serverError, reserve, startNewReservation }
}
