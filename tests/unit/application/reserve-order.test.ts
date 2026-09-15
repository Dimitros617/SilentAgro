import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { ReserveOrder, type ReserveOrderInput } from '@/application/use-cases/reserve-order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import { ConflictError, InsufficientStockError, ValidationError } from '@/domain/errors'
import {
  FakeMailer,
  RecordingLogger,
  SequentialTokenGenerator,
  fixedClock,
  makeBundle,
  TEST_DELIVERY_POLICY,
  makeOrderMailComposer,
  makeVariety,
} from './fakes'

const customer = {
  name: 'Jan Novák',
  email: 'jan@email.cz',
  phone: '+420777123456',
  note: '',
}

function reservationInput(overrides: Partial<ReserveOrderInput> = {}): ReserveOrderInput {
  return {
    requestKey: randomUUID(),
    customer,
    delivery: DeliveryMethod.PICKUP,
    payment: PaymentMethod.CASH,
    items: [{ varietyId: 1, quantityKg: 1 }],
    userId: null,
    ...overrides,
  }
}

const setup = (options: { varieties?: ReturnType<typeof makeVariety>[]; mailerFails?: boolean } = {}) => {
  const bundle = makeBundle({ varieties: options.varieties ?? [makeVariety({ stockKg: 10 })] })
  const mailer = new FakeMailer(options.mailerFails ?? false)
  const logger = new RecordingLogger()

  const useCase = new ReserveOrder({
    uow: bundle.uow,
    clock: fixedClock(),
    tokenGenerator: new SequentialTokenGenerator(),
    composer: makeOrderMailComposer(),
    deliveryPolicy: TEST_DELIVERY_POLICY,
  })

  return { ...bundle, mailer, logger, useCase }
}

const reserve = (
  useCase: ReserveOrder,
  items: { varietyId: number; quantityKg: number }[],
  overrides: Partial<{ delivery: DeliveryMethod; payment: PaymentMethod; note: string }> = {},
) =>
  useCase.execute(reservationInput({
    customer: { ...customer, note: overrides.note ?? '' },
    delivery: overrides.delivery ?? DeliveryMethod.PICKUP,
    payment: overrides.payment ?? PaymentMethod.CASH,
    items,
  }))

describe('ReserveOrder — identita opakovaného pokusu', () => {
  const requestKey = 'abcdef12-3456-7890-abcd-123456789abc'

  it.each(['', 'neplatný-klíč', `x${requestKey}`, `${requestKey}x`])('odmítne neplatný klíč %s před zápisem', async (key) => {
    const ctx = setup()
    await expect(ctx.useCase.execute(reservationInput({ requestKey: key }))).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Chybí platný identifikátor pokusu o rezervaci',
    })
    expect(ctx.orders.last()).toBeUndefined()
    expect(ctx.outbox.messages).toHaveLength(0)
  })

  it('opakování normalizovaných údajů zachová objednávku i sklad', async () => {
    const ctx = setup({ varieties: [makeVariety({ id: 1, stockKg: 10 }), makeVariety({ id: 2, stockKg: 10 })] })
    const input = reservationInput({
      requestKey,
      customer: { ...customer, note: 'U brány' },
      items: [{ varietyId: 1, quantityKg: 2 }, { varietyId: 2, quantityKg: 1 }],
    })
    const first = await ctx.useCase.execute(input)
    const repeated = await ctx.useCase.execute({
      ...input,
      requestKey: requestKey.toUpperCase(),
      customer: { ...customer, name: ` ${customer.name} `, phone: ` ${customer.phone} `, note: ' U brány ' },
      items: [{ varietyId: 2, quantityKg: 1 }, { varietyId: 1, quantityKg: 1 }, { varietyId: 1, quantityKg: 1 }],
    })
    expect(repeated).toEqual(first)
    expect(ctx.varieties.get(1)?.stock.value).toBe(8)
    expect(ctx.varieties.get(2)?.stock.value).toBe(9)
    expect(ctx.outbox.messages).toHaveLength(2)
    // Klíče už uložených pokusů musí zůstat kompatibilní s dalšími verzemi aplikace.
    expect([...ctx.reservationRequests.items.keys()]).toEqual([requestKey])
  })

  it('při chybějící původní objednávce nevytvoří náhradní rezervaci', async () => {
    const ctx = setup()
    const input = reservationInput({ requestKey })
    await ctx.useCase.execute(input)
    ctx.orders.items.clear()

    await expect(ctx.useCase.execute(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Původní rezervace nenalezena',
    })
    expect(ctx.orders.items.size).toBe(0)
    expect(ctx.varieties.get(1)?.stock.value).toBe(9)
    expect(ctx.outbox.messages).toHaveLength(2)
  })

  it.each<Partial<ReserveOrderInput>>([
    { customer: { ...customer, email: 'jiny@email.cz' } },
    { items: [{ varietyId: 1, quantityKg: 2 }] },
    { payment: PaymentMethod.BANK_TRANSFER },
    { delivery: DeliveryMethod.LOCAL_DELIVERY },
    { userId: 42 },
  ])('stejný klíč s jiným obsahem odmítne: %j', async (changed) => {
    const ctx = setup()
    const input = reservationInput({ requestKey })
    await ctx.useCase.execute(input)
    await expect(ctx.useCase.execute({ ...input, ...changed })).rejects.toThrow(ConflictError)
    expect(ctx.varieties.get(1)?.stock.value).toBe(9)
    expect(ctx.outbox.messages).toHaveLength(2)
  })
})

describe('ReserveOrder — úspěšná rezervace', () => {
  it('odečte sklad, uloží objednávku a zařadí dva e-maily do fronty', async () => {
    const ctx = setup()
    const result = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 2.5 }])

    expect(result.code).toBe('#2610')
    expect(result.publicToken).toBe('token-1')
    expect(ctx.varieties.get(1)?.stock.value).toBe(7.5)
    expect(ctx.outbox.messages).toHaveLength(2)
    expect(ctx.outbox.messages[0]?.to).toBe('jan@email.cz')
    expect(ctx.outbox.messages[1]?.to).toBe('farma@silentagro.cz')
  })

  it('používá cenu ze skladu, ne od klienta', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 10, priceCzk: 22 })] })
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 2 }])

    expect(ctx.orders.last()?.total.czk).toBe(44)
  })

  it('sloučí dva řádky se stejnou odrůdou do jedné položky', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [
      { varietyId: 1, quantityKg: 1 },
      { varietyId: 1, quantityKg: 1.5 },
    ])

    expect(ctx.orders.last()?.items).toHaveLength(1)
    expect(ctx.varieties.get(1)?.stock.value).toBe(7.5)
  })

  it('objednávky dostávají navazující kódy', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 100 })] })
    const first = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])
    const second = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect([first.code, second.code]).toEqual(['#2610', '#2611'])
  })

  it('každá objednávka dostane jiný veřejný token', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 100 })] })
    const first = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])
    const second = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(first.publicToken).not.toBe(second.publicToken)
  })

  it('odečte sklad u více odrůd najednou', async () => {
    const ctx = setup({
      varieties: [
        makeVariety({ id: 1, stockKg: 10 }),
        makeVariety({ id: 2, slug: 'marabel', name: 'Marabel', stockKg: 20, priceCzk: 17 }),
      ],
    })
    await reserve(ctx.useCase, [
      { varietyId: 1, quantityKg: 2 },
      { varietyId: 2, quantityKg: 3 },
    ])

    expect(ctx.varieties.get(1)?.stock.value).toBe(8)
    expect(ctx.varieties.get(2)?.stock.value).toBe(17)
  })
})

describe('ReserveOrder — doprava', () => {
  it('u rozvozu účtuje 60 Kč', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 100, priceCzk: 22 })] })
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 2 }], {
      delivery: DeliveryMethod.LOCAL_DELIVERY,
    })

    expect(ctx.orders.last()?.total.czk).toBe(104)
  })

  it('u rozvozu nad 600 Kč je doprava zdarma', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 100, priceCzk: 22 })] })
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 40 }], {
      delivery: DeliveryMethod.LOCAL_DELIVERY,
    })

    expect(ctx.orders.last()?.total.czk).toBe(880)
  })
})

describe('ReserveOrder — odmítnuté vstupy', () => {
  it('odmítne objednávku nad stav skladu a sklad nezmění', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 2 })] })

    await expect(reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 2.5 }])).rejects.toThrow(
      InsufficientStockError,
    )
    expect(ctx.varieties.get(1)?.stock.value).toBe(2)
    expect(ctx.outbox.messages).toHaveLength(0)
  })

  it('odmítne prázdný košík', async () => {
    const ctx = setup()
    await expect(reserve(ctx.useCase, [])).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Košík je prázdný',
    })
  })

  it('odmítne košík, kde jsou jen nulové položky', async () => {
    const ctx = setup()
    await expect(reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 0 }])).rejects.toThrow(
      ValidationError,
    )
  })

  it('odmítne množství mimo půlkilový krok místo tichého zaokrouhlení', async () => {
    // tiché zaokrouhlení by zákazníkovi změnilo objednávku bez jeho vědomí
    const ctx = setup()
    await expect(reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 0.3 }])).rejects.toThrow(
      /0,5 kg/,
    )
  })

  it('odmítne neexistující odrůdu', async () => {
    const ctx = setup()
    await expect(reserve(ctx.useCase, [{ varietyId: 999, quantityKg: 1 }])).rejects.toThrow(
      /není v nabídce/,
    )
  })

  it('odmítne deaktivovanou odrůdu', async () => {
    const ctx = setup({ varieties: [makeVariety({ stockKg: 10, isActive: false })] })
    await expect(reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])).rejects.toThrow(
      /není v nabídce/,
    )
  })

  it('odmítne chybějící jméno', async () => {
    const ctx = setup()
    await expect(
      ctx.useCase.execute({
        requestKey: randomUUID(),
        customer: { ...customer, name: '   ' },
        delivery: DeliveryMethod.PICKUP,
        payment: PaymentMethod.CASH,
        items: [{ varietyId: 1, quantityKg: 1 }],
        userId: null,
      }),
    ).rejects.toThrow(/jméno/i)
  })

  it('odmítne neplatný e-mail', async () => {
    const ctx = setup()
    await expect(
      ctx.useCase.execute({
        requestKey: randomUUID(),
        customer: { ...customer, email: 'jan.email.cz' },
        delivery: DeliveryMethod.PICKUP,
        payment: PaymentMethod.CASH,
        items: [{ varietyId: 1, quantityKg: 1 }],
        userId: null,
      }),
    ).rejects.toThrow(/e-mail/i)
  })

  it('u rozvozu vyžaduje telefon', async () => {
    const ctx = setup()
    await expect(
      ctx.useCase.execute({
        requestKey: randomUUID(),
        customer: { ...customer, phone: '' },
        delivery: DeliveryMethod.LOCAL_DELIVERY,
        payment: PaymentMethod.CASH,
        items: [{ varietyId: 1, quantityKg: 1 }],
        userId: null,
      }),
    ).rejects.toThrow(/telefon/i)
  })

  it('při nedostatku u druhé položky nezmění sklad ani u první', async () => {
    // ve skutečné databázi to zařídí rollback; tady ověřujeme, že se use-case
    // o odečet nepokusí dřív, než ověří celý košík
    const ctx = setup({
      varieties: [
        makeVariety({ id: 1, stockKg: 10 }),
        makeVariety({ id: 2, slug: 'marabel', name: 'Marabel', stockKg: 1 }),
      ],
    })

    await expect(
      reserve(ctx.useCase, [
        { varietyId: 1, quantityKg: 2 },
        { varietyId: 2, quantityKg: 5 },
      ]),
    ).rejects.toThrow(InsufficientStockError)

    expect(ctx.varieties.get(1)?.stock.value).toBe(10)
    expect(ctx.varieties.get(2)?.stock.value).toBe(1)
    expect(ctx.orders.items.size).toBe(0)
  })
})

describe('ReserveOrder — e-maily', () => {
  it('uložení rezervace nezávisí na dostupnosti odesílatele', async () => {
    const ctx = setup({ mailerFails: true })
    const result = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(result.code).toBe('#2610')
    expect(ctx.varieties.get(1)?.stock.value).toBe(9)
    expect(ctx.outbox.messages).toHaveLength(2)
    expect(ctx.mailer.failures).toBe(0)
  })

  it('u QR platby nese e-mail zákazníkovi platební údaje', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }], {
      payment: PaymentMethod.QR_CODE,
    })

    expect(ctx.outbox.messages[0]?.text).toContain('2000145399/0800')
    expect(ctx.outbox.messages[0]?.text).toContain('Agro:2610')
  })

  it('u platby hotově platební údaje neposílá', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }], { payment: PaymentMethod.CASH })

    expect(ctx.outbox.messages[0]?.text).not.toContain('Variabilní symbol')
  })

  it('odkaz na potvrzení nese veřejný token, ne kód objednávky', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(ctx.outbox.messages[0]?.text).toContain('https://silentagro.cz/rezervace/token-1')
    expect(ctx.outbox.messages[0]?.text).not.toContain('/rezervace/2610')
  })

  it('každý příjemce má vlastní záznam a nic se neodesílá přímo', async () => {
    // farmář se o objednávce musí dozvědět i tehdy, když zákazníkova adresa odmítá poštu
    const ctx = setup()
    let attempts = 0
    ctx.mailer.send = async (message) => {
      attempts += 1
      if (attempts === 1) throw new Error('adresát neexistuje')
      ctx.outbox.messages.push(message)
    }

    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(attempts).toBe(0)
    expect(ctx.outbox.messages).toHaveLength(2)
    expect(ctx.outbox.messages[1]?.to).toBe('farma@silentagro.cz')
  })
})
