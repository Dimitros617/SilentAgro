import { describe, expect, it } from 'vitest'
import { Order, OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Iban } from '@/domain/value-objects/iban'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { renderCustomerConfirmation, renderFarmerNotification } from '@/infrastructure/mail/templates'
import { buildPaymentDetails } from '@/infrastructure/payment/spayd'

const bank = { iban: Iban.of('CZ6508000000192000145399'), accountNumber: '2000145399/0800' }
const FARM = {
  name: 'SilentAgro',
  legalName: 'Silent Industries',
  companyId: '12345678',
  email: 'farma@silentagro.cz',
  phone: '+420 777 123 456',
} as const
const DELIVERY = { feeCzk: 60, freeAboveCzk: 600, radiusKm: 20, holdDays: 5 } as const

const CONFIRM_URL = 'https://silentagro.cz/rezervace/abc123'
const ADMIN_URL = 'https://silentagro.cz/admin/objednavky'

const makeOrder = (payment: PaymentMethod, note = 'Přijedu v sobotu dopoledne') =>
  Order.create({
    id: 1,
    code: '#2610',
    publicToken: 'abc123',
    customer: {
      name: 'Jan Novák',
      email: EmailAddress.of('jan@email.cz'),
      phone: '+420777123456',
      note,
    },
    items: [
      OrderItem.create({
        varietyId: 1,
        varietyName: 'Bernie',
        unitPrice: Money.fromCzk(22),
        quantity: Kilograms.of(2.5),
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

const qrPng = Buffer.from('fake-png-bytes')

describe('renderCustomerConfirmation', () => {
  it('adresuje zákazníkovi a nese kód, položky i částku', () => {
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order: makeOrder(PaymentMethod.CASH),
      confirmationUrl: CONFIRM_URL,
      payment: null,
      qrPng: null,
    })

    expect(mail.to).toBe('jan@email.cz')
    expect(mail.subject).toBe('Potvrzení rezervace #2610 — SilentAgro')
    expect(mail.text).toContain('Bernie 2,5 kg')
    expect(mail.text).toContain('55 Kč')
    expect(mail.text).toContain(CONFIRM_URL)
    expect(mail.text).toContain('Zboží držíme 5 dní')
  })

  it('u platby hotově neobsahuje platební údaje ani přílohu', () => {
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order: makeOrder(PaymentMethod.CASH),
      confirmationUrl: CONFIRM_URL,
      payment: null,
      qrPng: null,
    })

    expect(mail.attachments ?? []).toHaveLength(0)
    expect(mail.text).not.toContain('Variabilní symbol')
  })

  it('u QR platby nese přílohu s QR kódem a odkazuje na ni přes cid', () => {
    const order = makeOrder(PaymentMethod.QR_CODE)
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order,
      confirmationUrl: CONFIRM_URL,
      payment: buildPaymentDetails(order, bank, DELIVERY.holdDays),
      qrPng,
    })

    expect(mail.attachments?.[0]?.cid).toBe('qr@silentagro')
    expect(mail.attachments?.[0]?.contentType).toBe('image/png')
    expect(mail.html).toContain('cid:qr@silentagro')
  })

  it('platební údaje jsou i v prostém textu, ne jen v QR kódu', () => {
    // kdo má vypnuté obrázky nebo čte text, musí zaplatit stejně snadno
    const order = makeOrder(PaymentMethod.BANK_TRANSFER)
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order,
      confirmationUrl: CONFIRM_URL,
      payment: buildPaymentDetails(order, bank, DELIVERY.holdDays),
      qrPng: null,
    })

    expect(mail.text).toContain('2000145399/0800')
    expect(mail.text).toContain('CZ65 0800 0000 1920 0014 5399')
    expect(mail.text).toContain('Variabilní symbol: 2610')
    expect(mail.text).toContain('Agro:2610')
  })

  it('při nedostupném QR obrázku se e-mail pošle bez přílohy, ale s údaji', () => {
    const order = makeOrder(PaymentMethod.QR_CODE)
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order,
      confirmationUrl: CONFIRM_URL,
      payment: buildPaymentDetails(order, bank, DELIVERY.holdDays),
      qrPng: null,
    })

    expect(mail.attachments ?? []).toHaveLength(0)
    expect(mail.text).toContain('Agro:2610')
    expect(mail.html).not.toContain('cid:qr@silentagro')
  })

  it('do HTML nepropustí neošetřený obsah od zákazníka', () => {
    const order = makeOrder(PaymentMethod.CASH, '<script>alert(1)</script>')
    const mail = renderCustomerConfirmation({
      farm: FARM,
      delivery: DELIVERY,
      order,
      confirmationUrl: CONFIRM_URL,
      payment: null,
      qrPng: null,
    })

    expect(mail.html).not.toContain('<script>')
  })
})

describe('renderFarmerNotification', () => {
  it('míří na adresu farmy a nese kontakt i položky', () => {
    const mail = renderFarmerNotification({
      farm: FARM,
      order: makeOrder(PaymentMethod.CASH),
      farmerEmail: 'farma@silentagro.cz',
      adminUrl: ADMIN_URL,
    })

    expect(mail.to).toBe('farma@silentagro.cz')
    expect(mail.subject).toBe('Nová rezervace #2610 (2,5 kg)')
    expect(mail.text).toContain('Jan Novák')
    expect(mail.text).toContain('jan@email.cz')
    expect(mail.text).toContain('Bernie 2,5 kg')
    expect(mail.text).toContain(ADMIN_URL)
  })

  it('nese poznámku zákazníka', () => {
    const mail = renderFarmerNotification({
      farm: FARM,
      order: makeOrder(PaymentMethod.CASH),
      farmerEmail: 'farma@silentagro.cz',
      adminUrl: ADMIN_URL,
    })
    expect(mail.text).toContain('Přijedu v sobotu dopoledne')
  })

  it('prázdnou poznámku vypíše jako pomlčku', () => {
    const mail = renderFarmerNotification({
      farm: FARM,
      order: makeOrder(PaymentMethod.CASH, ''),
      farmerEmail: 'farma@silentagro.cz',
      adminUrl: ADMIN_URL,
    })
    expect(mail.text).toContain('Poznámka: —')
  })

  it('upozorní, že objednávka čeká na platbu převodem', () => {
    const mail = renderFarmerNotification({
      farm: FARM,
      order: makeOrder(PaymentMethod.QR_CODE),
      farmerEmail: 'farma@silentagro.cz',
      adminUrl: ADMIN_URL,
    })
    expect(mail.text).toContain('čeká na platbu')
  })
})
