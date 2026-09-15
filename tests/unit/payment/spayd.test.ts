import { describe, expect, it } from 'vitest'
import { Order, OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Iban } from '@/domain/value-objects/iban'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import {
  buildPaymentDetails,
  buildRecipientMessage,
  buildSpayd,
} from '@/infrastructure/payment/spayd'

const IBAN = 'CZ6508000000192000145399'
const bank = { iban: Iban.of(IBAN), accountNumber: '2000145399/0800' }

const base = {
  iban: IBAN,
  amount: Money.fromCzk(182),
  variableSymbol: '2610',
  message: 'Agro:2610',
}

const orderWith = (payment: PaymentMethod, kg = 2.5, czkPerKg = 22) =>
  Order.create({
    id: 1,
    code: '#2610',
    publicToken: 'token'.repeat(6),
    customer: {
      name: 'Jan Novák',
      email: EmailAddress.of('jan@email.cz'),
      phone: '',
      note: '',
    },
    items: [
      OrderItem.create({
        varietyId: 1,
        varietyName: 'Bernie',
        unitPrice: Money.fromCzk(czkPerKg),
        quantity: Kilograms.of(kg),
      }),
    ],
    delivery: DeliveryMethod.PICKUP,
    deliveryFee: Money.zero(),
    payment,
    status: OrderStatus.NEW,
    paidAt: null,
    cancelledAt: null,
    cancellationReason: null,
    userId: null,
    createdAt: new Date('2026-09-10T18:00:00Z'),
  })

describe('buildRecipientMessage', () => {
  it('složí zprávu ve tvaru Agro:číslo', () => {
    expect(buildRecipientMessage('#2610')).toBe('Agro:2610')
  })

  it('odstraní mřížku, mezery i jiné nečíselné znaky', () => {
    expect(buildRecipientMessage('2611')).toBe('Agro:2611')
    expect(buildRecipientMessage('# 2612 ')).toBe('Agro:2612')
  })
})

describe('buildSpayd', () => {
  it('složí řetězec v pořadí předepsaném standardem', () => {
    expect(buildSpayd(base)).toBe(
      `SPD*1.0*ACC:${IBAN}*AM:182.00*CC:CZK*X-VS:2610*MSG:Agro:2610`,
    )
  })

  it('částku píše vždy na dvě desetinná místa s tečkou', () => {
    expect(buildSpayd({ ...base, amount: Money.fromCzk(1234.5) })).toContain('*AM:1234.50*')
    expect(buildSpayd({ ...base, amount: Money.fromCzk(60) })).toContain('*AM:60.00*')
  })

  it('dvojtečka uvnitř zprávy zůstává — pole se dělí na první dvojtečce', () => {
    const parts = buildSpayd(base).split('*')
    expect(parts.filter((part) => part.startsWith('MSG:'))).toEqual(['MSG:Agro:2610'])
  })

  it('odstraní ze zprávy diakritiku', () => {
    const spayd = buildSpayd({ ...base, message: 'Příliš žluťoučký kůň úpěl ďábelské ódy' })
    expect(spayd).not.toMatch(/[ěščřžýáíéůúďťňĚŠČŘŽÝÁÍÉŮÚŇŤĎ]/)
  })

  it('zprávu delší než 60 znaků zkrátí', () => {
    const spayd = buildSpayd({ ...base, message: 'a'.repeat(120) })
    const message = spayd.split('*MSG:')[1] ?? ''
    expect(message.length).toBe(60)
  })

  it('hvězdičku ve zprávě zakóduje, aby nerozbila oddělovače polí', () => {
    // '*' je v SPAYD oddělovač; nezakódovaná by vyrobila nové, nesmyslné pole
    const spayd = buildSpayd({ ...base, message: 'a*b' })
    expect(spayd.split('*').filter((part) => part.startsWith('MSG:'))).toEqual(['MSG:a%2Ab'])
  })

  it('procento zakóduje dřív než hvězdičku, aby kódování šlo zpětně přečíst', () => {
    expect(buildSpayd({ ...base, message: '50%' })).toContain('*MSG:50%25')
  })

  it('odstraní ze zprávy konce řádků', () => {
    expect(buildSpayd({ ...base, message: 'a\nb\r\nc' })).toContain('*MSG:abc')
  })
})

/** Lhůta z konfigurace; instrukce ji má opsat, ne mít vlastní číslo. */
const HOLD_DAYS = 7

describe('buildPaymentDetails', () => {
  it('u QR platby složí kompletní údaje', () => {
    const details = buildPaymentDetails(orderWith(PaymentMethod.QR_CODE), bank, HOLD_DAYS)

    expect(details).not.toBeNull()
    expect(details?.accountNumber).toBe('2000145399/0800')
    expect(details?.ibanFormatted).toBe('CZ65 0800 0000 1920 0014 5399')
    expect(details?.variableSymbol).toBe('2610')
    expect(details?.recipientMessage).toBe('Agro:2610')
    expect(details?.spayd).toContain('*MSG:Agro:2610')
  })

  it('u převodu na účet údaje také složí', () => {
    expect(buildPaymentDetails(orderWith(PaymentMethod.BANK_TRANSFER), bank, HOLD_DAYS)).not.toBeNull()
  })

  it('u platby hotově nevrací nic', () => {
    expect(buildPaymentDetails(orderWith(PaymentMethod.CASH), bank, HOLD_DAYS)).toBeNull()
  })

  it('instrukce obsahuje číslo účtu, variabilní symbol i zprávu pro příjemce', () => {
    const details = buildPaymentDetails(orderWith(PaymentMethod.QR_CODE), bank, HOLD_DAYS)

    expect(details?.instruction).toContain('2000145399/0800')
    expect(details?.instruction).toContain('2610')
    expect(details?.instruction).toContain('Agro:2610')
  })

  it('částka v instrukci se shoduje s částkou v QR kódu', () => {
    // 0,5 kg × 19 Kč = 9,50 Kč; zaokrouhlení na celé koruny by poslalo jinou částku,
    // než jakou nese QR, a platba by seděla o padesátník vedle
    const details = buildPaymentDetails(orderWith(PaymentMethod.QR_CODE, 0.5, 19), bank, HOLD_DAYS)

    expect(details?.spayd).toContain('*AM:9.50*')
    expect(details?.amountLabel).toBe('9,50 Kč')
    expect(details?.instruction).toContain('9,50 Kč')
  })

  it('celá částka se píše bez zbytečných haléřů', () => {
    const details = buildPaymentDetails(orderWith(PaymentMethod.QR_CODE, 2.5, 22), bank, HOLD_DAYS)
    expect(details?.amountLabel).toBe('55 Kč')
    expect(details?.spayd).toContain('*AM:55.00*')
  })
})
