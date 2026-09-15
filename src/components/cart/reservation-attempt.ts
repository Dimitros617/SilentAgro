import type { CheckoutForm } from './checkout-validation'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'

export interface ReservationAttempt {
  requestKey: string
  form: CheckoutForm
  items: { varietyId: number; quantityKg: number }[]
  token?: string
}

const STORAGE_KEY = 'silentagro:reservation-attempt:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isForm(value: unknown): value is CheckoutForm {
  if (!isRecord(value)) return false
  return typeof value.name === 'string' && typeof value.email === 'string'
    && typeof value.phone === 'string' && typeof value.note === 'string'
    && Object.values(DeliveryMethod).some((method) => method === value.delivery)
    && Object.values(PaymentMethod).some((method) => method === value.payment)
}

function isItem(value: unknown): value is ReservationAttempt['items'][number] {
  if (!isRecord(value)) return false
  return typeof value.varietyId === 'number' && Number.isSafeInteger(value.varietyId) && value.varietyId > 0
    && typeof value.quantityKg === 'number' && Number.isFinite(value.quantityKg) && value.quantityKg > 0
}

export function readAttempt(storage: Pick<Storage, 'getItem'>): ReservationAttempt | null {
  const value = storage.getItem(STORAGE_KEY)
  if (!value) return null
  try {
    const attempt: unknown = JSON.parse(value)
    if (!isRecord(attempt) || typeof attempt.requestKey !== 'string') return null
    if (!/^[0-9a-f-]{36}$/i.test(attempt.requestKey) || !isForm(attempt.form)) return null
    if (!Array.isArray(attempt.items) || !attempt.items.every(isItem)) return null
    if (attempt.token !== undefined && typeof attempt.token !== 'string') return null
    return {
      requestKey: attempt.requestKey, form: attempt.form, items: attempt.items,
      ...(attempt.token !== undefined ? { token: attempt.token } : {}),
    }
  } catch {
    return null
  }
}

export function saveAttempt(storage: Pick<Storage, 'setItem'>, attempt: ReservationAttempt): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(attempt))
}

export function clearAttempt(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY)
}
