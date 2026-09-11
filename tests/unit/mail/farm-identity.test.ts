import { describe, expect, it } from 'vitest'
import { Order, OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import type { FarmIdentity, MailMessage } from '@/domain/ports/services'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Iban } from '@/domain/value-objects/iban'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import {
  renderCustomerConfirmation,
  renderFarmerMessage,
  renderOrderCancelled,
  renderVerification,
} from '@/infrastructure/mail/templates'
import { buildPaymentDetails } from '@/infrastructure/payment/spayd'

/**
 * Žádná šablona nesmí mít identitu farmy zapsanou natvrdo.
 *
 * Stalo se to v textové verzi zprávy farmáře: HTML podepisovalo podle konfigurace,
 * prostý text pořád jménem původní farmy. Kdo si projde jen HTML náhled, nic
 * nepozná — a zákazník dostane obojí.
 */

// Záměrně nic společného s výchozími hodnotami v env.ts ani v .env.example.
const FARM: FarmIdentity = {
  name: 'Bramborárna Dvořák',
  legalName: 'Dvořák s.r.o.',
  companyId: '87654321',
  email: 'sef@bramborarna.cz',
  phone: '+420 601 202 303',
}

const DELIVERY = { feeCzk: 89, freeAboveCzk: 900, radiusKm: 35, holdDays: 7 } as const
const bank = { iban: Iban.of('CZ6508000000192000145399'), accountNumber: '2000145399/0800' }

/** Stopy po původní farmě, které se do žádné zprávy nesmí dostat. */
const FOREIGN = ['SilentAgro', 'Silent Industries', 'farma@silentagro.cz', '+420 777 123 456']

const order = Order.rehydrate({
  id: 1,
  code: '#2610',
  publicToken: 'abc123',
  customer: {
    name: 'Jan Novák',
    email: EmailAddress.of('jan@email.cz'),
    phone: '+420777123456',
    note: '',
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
  payment: PaymentMethod.QR_CODE,
  status: OrderStatus.NEW,
  paidAt: null,
  cancelledAt: null,
  cancellationReason: null,
  userId: null,
  createdAt: new Date('2026-09-10T18:00:00Z'),
})

const bodies = (message: MailMessage) => [message.text, message.html]

describe('identita farmy v e-mailech', () => {
  const messages: Array<[string, MailMessage]> = [
    [
      'potvrzení zákazníkovi',
      renderCustomerConfirmation({
        order,
        farm: FARM,
        delivery: DELIVERY,
        confirmationUrl: 'https://bramborarna.cz/rezervace/abc123',
        payment: buildPaymentDetails(order, bank, DELIVERY.holdDays),
        qrPng: null,
      }),
    ],
    [
      'zrušení objednávky',
      renderOrderCancelled({ order, farm: FARM, reason: 'Sklizeň nevyšla.' }),
    ],
    [
      'ověření registrace',
      renderVerification(FARM, 'Jan', 'jan@example.cz', 'https://bramborarna.cz/overit?t=x'),
    ],
    [
      'zpráva od farmáře',
      renderFarmerMessage(FARM, 'Jan', 'jan@example.cz', 'Dotaz', 'Tělo zprávy.'),
    ],
  ]

  it.each(messages)('%s nese jméno z konfigurace v textu i v HTML', (_name, message) => {
    for (const body of bodies(message)) {
      expect(body).toContain(FARM.name)
    }
  })

  it.each(messages)('%s neobsahuje původní farmu', (_name, message) => {
    for (const body of bodies(message)) {
      for (const trace of FOREIGN) {
        expect(body).not.toContain(trace)
      }
    }
  })
})

describe('lhůta v platebním pokynu', () => {
  it('opisuje nastavenou dobu držení, ne vlastní číslo', () => {
    const details = buildPaymentDetails(order, bank, 7)

    expect(details?.instruction).toContain('do 7 dní')
    expect(details?.instruction).not.toContain('do 5 dn')
  })

  it('se shoduje s lhůtou, kterou píše potvrzovací e-mail', () => {
    // Obojí končí v téže zprávě; rozejít se nesmí.
    const mail = renderCustomerConfirmation({
      order,
      farm: FARM,
      delivery: DELIVERY,
      confirmationUrl: 'https://bramborarna.cz/rezervace/abc123',
      payment: buildPaymentDetails(order, bank, DELIVERY.holdDays),
      qrPng: null,
    })

    expect(mail.text).toContain(`Zboží držíme ${DELIVERY.holdDays} dní`)
    expect(mail.text).toContain(`do ${DELIVERY.holdDays} dní`)
  })
})
