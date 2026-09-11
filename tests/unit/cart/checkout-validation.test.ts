import { describe, expect, it } from 'vitest'
import { type CheckoutForm, hasErrors, validateCheckout } from '@/components/cart/checkout-validation'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'

const valid: CheckoutForm = {
  name: 'Jan Novák',
  email: 'jan@email.cz',
  phone: '+420777123456',
  note: '',
  delivery: DeliveryMethod.PICKUP,
  payment: PaymentMethod.CASH,
}

describe('validateCheckout', () => {
  it('platný formulář nemá chyby', () => {
    expect(validateCheckout(valid)).toEqual({})
    expect(hasErrors(validateCheckout(valid))).toBe(false)
  })

  it('vyžaduje jméno', () => {
    expect(validateCheckout({ ...valid, name: '   ' }).name).toBe('Vyplňte jméno a příjmení')
  })

  it('vyžaduje e-mail', () => {
    expect(validateCheckout({ ...valid, email: '' }).email).toBe('Vyplňte e-mail')
  })

  it('odmítne e-mail bez zavináče', () => {
    expect(validateCheckout({ ...valid, email: 'jan.email.cz' }).email).toBe(
      'E-mail nemá správný tvar',
    )
  })

  it('u osobního odběru telefon nevyžaduje', () => {
    expect(validateCheckout({ ...valid, phone: '' }).phone).toBeUndefined()
  })

  it('u rozvozu telefon vyžaduje', () => {
    expect(
      validateCheckout({ ...valid, delivery: DeliveryMethod.LOCAL_DELIVERY, phone: '' }).phone,
    ).toBe('U rozvozu potřebujeme telefon')
  })

  it('u rozvozu s telefonem projde', () => {
    expect(
      hasErrors(validateCheckout({ ...valid, delivery: DeliveryMethod.LOCAL_DELIVERY })),
    ).toBe(false)
  })

  it('nahlásí všechny chyby najednou', () => {
    const errors = validateCheckout({
      ...valid,
      name: '',
      email: '',
      phone: '',
      delivery: DeliveryMethod.LOCAL_DELIVERY,
    })

    expect(Object.keys(errors).sort()).toEqual(['email', 'name', 'phone'])
  })
})
