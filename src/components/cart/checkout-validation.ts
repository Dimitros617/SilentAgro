import { DeliveryMethod, type PaymentMethod } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'

export interface CheckoutForm {
  name: string
  email: string
  phone: string
  note: string
  delivery: DeliveryMethod
  payment: PaymentMethod
}

export type CheckoutErrors = Partial<Record<'name' | 'email' | 'phone', string>>

/**
 * Validace na klientovi je jen pro rychlou zpětnou vazbu. Server ji v `ReserveOrder`
 * dělá znovu a nikdy se na tuhle nespoléhá — klientský kód jde obejít.
 */
export function validateCheckout(form: CheckoutForm): CheckoutErrors {
  const errors: CheckoutErrors = {}

  if (form.name.trim().length === 0) errors.name = 'Vyplňte jméno a příjmení'

  if (form.email.trim().length === 0) {
    errors.email = 'Vyplňte e-mail'
  } else if (!EmailAddress.isValid(form.email)) {
    errors.email = 'E-mail nemá správný tvar'
  }

  if (form.delivery === DeliveryMethod.LOCAL_DELIVERY && form.phone.trim().length === 0) {
    errors.phone = 'U rozvozu potřebujeme telefon'
  }

  return errors
}

export const hasErrors = (errors: CheckoutErrors): boolean => Object.keys(errors).length > 0
