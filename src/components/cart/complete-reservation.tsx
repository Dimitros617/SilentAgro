'use client'

import { useEffect } from 'react'
import { clearAttempt, readAttempt } from './reservation-attempt'

/** Po zobrazení potvrzení už není potřeba držet podklady pro obnovu navigace. */
export function CompleteReservation({ token }: { token: string }) {
  useEffect(() => {
    try {
      if (readAttempt(localStorage)?.token === token) clearAttempt(localStorage)
    } catch { /* Potvrzená rezervace platí i při nedostupném úložišti. */ }
  }, [token])
  return null
}
