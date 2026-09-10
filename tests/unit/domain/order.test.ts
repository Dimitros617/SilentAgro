import { describe, expect, it } from 'vitest'
import { Order, OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

const item = (name: string, czkPerKg: number, kg: number, varietyId = 1) =>
  OrderItem.create({
    varietyId,
    varietyName: name,
    unitPrice: Money.fromCzk(czkPerKg),
    quantity: Kilograms.of(kg),
  })

const order = (
  items: OrderItem[],
  delivery: DeliveryMethod = DeliveryMethod.PICKUP,
  overrides: Partial<{ status: OrderStatus; paidAt: Date | null }> = {},
) =>
  Order.rehydrate({
    id: 1,
    code: '#2610',
    publicToken: 'token'.repeat(6),
    customer: {
      name: 'Jan Novák',
      email: EmailAddress.of('jan@email.cz'),
      phone: '+420777123456',
      note: '',
    },
    items,
    delivery,
    payment: PaymentMethod.QR_CODE,
    status: overrides.status ?? OrderStatus.NEW,
    paidAt: overrides.paidAt ?? null,
    userId: null,
    createdAt: new Date('2026-09-10T18:00:00Z'),
  })

describe('OrderItem', () => {
  it('spočítá cenu řádku', () => {
    expect(item('Bernie', 22, 2.5).lineTotal.czk).toBe(55)
  })

  it('u půlkilového množství nezaokrouhluje chybně', () => {
    expect(item('Red Anna', 19, 0.5).lineTotal.czk).toBe(9.5)
  })
})

describe('Order.subtotal', () => {
  it('sečte všechny řádky', () => {
    expect(order([item('Bernie', 22, 2.5), item('Marabel', 17, 7.5, 2)]).subtotal.czk).toBe(182.5)
  })

  it('prázdná objednávka má nulový mezisoučet', () => {
    expect(order([]).subtotal.isZero()).toBe(true)
  })
})

describe('Order doprava', () => {
  it('u osobního odběru neúčtuje nic', () => {
    expect(order([item('Bernie', 22, 2.5)], DeliveryMethod.PICKUP).deliveryFee.czk).toBe(0)
  })

  it('u rozvozu účtuje 60 Kč pod hranicí', () => {
    expect(order([item('Bernie', 22, 2.5)], DeliveryMethod.LOCAL_DELIVERY).deliveryFee.czk).toBe(60)
  })

  it('u rozvozu je zdarma nad 600 Kč', () => {
    const big = order([item('Bernie', 22, 30)], DeliveryMethod.LOCAL_DELIVERY)
    expect(big.subtotal.czk).toBe(660)
    expect(big.deliveryFee.czk).toBe(0)
  })

  it('přesně na 600 Kč dopravu ještě účtuje', () => {
    // hranice je "nad 600", ne "od 600" — bez tohoto testu se to při refaktoru posune
    const exact = order([item('Marabel', 20, 30)], DeliveryMethod.LOCAL_DELIVERY)
    expect(exact.subtotal.czk).toBe(600)
    expect(exact.deliveryFee.czk).toBe(60)
  })

  it('celkem je mezisoučet plus doprava', () => {
    const o = order([item('Bernie', 22, 2)], DeliveryMethod.LOCAL_DELIVERY)
    expect(o.total.czk).toBe(104)
  })
})

describe('Order souhrny', () => {
  it('sečte celkovou hmotnost', () => {
    expect(order([item('Bernie', 22, 20), item('Red Anna', 19, 5, 3)]).totalKg.value).toBe(25)
  })

  it('složí popisek položek jako v prototypu', () => {
    expect(order([item('Bernie', 22, 20), item('Red Anna', 19, 5, 3)]).itemsLabel).toBe(
      'Bernie 20 kg · Red Anna 5 kg',
    )
  })

  it('popisek půlkilového množství používá českou čárku', () => {
    expect(order([item('Bernie', 22, 2.5)]).itemsLabel).toBe('Bernie 2,5 kg')
  })

  it('variabilní symbol je kód bez mřížky', () => {
    expect(order([item('Bernie', 22, 2.5)]).variableSymbol).toBe('2610')
  })
})

describe('Order stav zaplacení', () => {
  it('bez data platby není zaplacená', () => {
    expect(order([item('Bernie', 22, 1)]).isPaid).toBe(false)
  })

  it('s datem platby je zaplacená', () => {
    const paid = order([item('Bernie', 22, 1)], DeliveryMethod.PICKUP, {
      paidAt: new Date('2026-09-11T08:00:00Z'),
    })
    expect(paid.isPaid).toBe(true)
  })

  it('withPaidAt vrací novou instanci a stav objednávky nemění', () => {
    const before = order([item('Bernie', 22, 1)], DeliveryMethod.PICKUP, {
      status: OrderStatus.READY,
    })
    const after = before.withPaidAt(new Date('2026-09-11T08:00:00Z'))

    expect(after.isPaid).toBe(true)
    expect(after.status).toBe(OrderStatus.READY)
    expect(before.isPaid).toBe(false)
  })

  it('withStatus stav zaplacení nemění', () => {
    const paid = order([item('Bernie', 22, 1)], DeliveryMethod.PICKUP, {
      paidAt: new Date('2026-09-11T08:00:00Z'),
    })
    expect(paid.withStatus(OrderStatus.COLLECTED).isPaid).toBe(true)
  })
})

describe('Order.deliveryFeeFor', () => {
  it('je čistá funkce použitelná před vznikem objednávky', () => {
    expect(Order.deliveryFeeFor(DeliveryMethod.PICKUP, Money.fromCzk(100)).czk).toBe(0)
    expect(Order.deliveryFeeFor(DeliveryMethod.LOCAL_DELIVERY, Money.fromCzk(100)).czk).toBe(60)
    expect(Order.deliveryFeeFor(DeliveryMethod.LOCAL_DELIVERY, Money.fromCzk(600.5)).czk).toBe(0)
  })
})
