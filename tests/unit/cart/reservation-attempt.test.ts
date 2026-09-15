import { describe, expect, it } from 'vitest'
import { clearAttempt, readAttempt, saveAttempt, type ReservationAttempt } from '@/components/cart/reservation-attempt'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'

function storage() {
  const items = new Map<string, string>()
  return {
    getItem(key: string) { return items.get(key) ?? null },
    setItem(key: string, value: string) { items.set(key, value) },
    removeItem(key: string) { items.delete(key) },
  }
}

const attempt: ReservationAttempt = {
  requestKey: 'fd803ef1-bc0e-4e40-b11c-aefab1b659fe',
  form: { name: 'Jan', email: 'jan@example.cz', phone: '', note: '', delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH },
  items: [{ varietyId: 1, quantityKg: 2 }],
}

describe('obnova pokusu o rezervaci', () => {
  it.each(['null', '{}', '{"requestKey":"bad","form":1,"items":[null]}', 'not-json'])(
    'poškozený záznam nezablokuje košík: %s', (value) => {
      expect(readAttempt({ getItem: () => value })).toBeNull()
    },
  )
  it('obnoví stejný klíč i obsah po novém načtení stránky', () => {
    const saved = storage()
    saveAttempt(saved, attempt)
    expect(readAttempt(saved)).toEqual(attempt)
  })

  it('uchová úspěšný výsledek při neúspěšné navigaci', () => {
    const saved = storage()
    saveAttempt(saved, { ...attempt, token: 'confirmation-token' })
    expect(readAttempt(saved)?.token).toBe('confirmation-token')
    clearAttempt(saved)
    expect(readAttempt(saved)).toBeNull()
  })
})
