import { describe, expect, it } from 'vitest'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import { InsufficientStockError, ValidationError } from '@/domain/errors'
import {
  FakeMailer,
  RecordingLogger,
  SequentialTokenGenerator,
  fixedClock,
  makeBundle,
  makeNotifier,
  makeVariety,
} from './fakes'

const customer = {
  name: 'Jan Novák',
  email: 'jan@email.cz',
  phone: '+420777123456',
  note: '',
}

const setup = (options: { varieties?: ReturnType<typeof makeVariety>[]; mailerFails?: boolean } = {}) => {
  const bundle = makeBundle({ varieties: options.varieties ?? [makeVariety({ stockKg: 10 })] })
  const mailer = new FakeMailer(options.mailerFails ?? false)
  const logger = new RecordingLogger()

  const useCase = new ReserveOrder({
    uow: bundle.uow,
    clock: fixedClock(),
    tokenGenerator: new SequentialTokenGenerator(),
    notifier: makeNotifier(mailer, logger),
  })

  return { ...bundle, mailer, logger, useCase }
}

const reserve = (
  useCase: ReserveOrder,
  items: { varietyId: number; quantityKg: number }[],
  overrides: Partial<{ delivery: DeliveryMethod; payment: PaymentMethod; note: string }> = {},
) =>
  useCase.execute({
    customer: { ...customer, note: overrides.note ?? '' },
    delivery: overrides.delivery ?? DeliveryMethod.PICKUP,
    payment: overrides.payment ?? PaymentMethod.CASH,
    items,
    userId: null,
  })

describe('ReserveOrder — úspěšná rezervace', () => {
  it('odečte sklad, uloží objednávku a odešle dva e-maily', async () => {
    const ctx = setup()
    const result = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 2.5 }])

    expect(result.code).toBe('#2610')
    expect(result.publicToken).toBe('token-1')
    expect(ctx.varieties.get(1)?.stock.value).toBe(7.5)
    expect(ctx.mailer.sent).toHaveLength(2)
    expect(ctx.mailer.sent[0]?.to).toBe('jan@email.cz')
    expect(ctx.mailer.sent[1]?.to).toBe('farma@silentagro.cz')
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
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('odmítne prázdný košík', async () => {
    const ctx = setup()
    await expect(reserve(ctx.useCase, [])).rejects.toThrow(ValidationError)
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
  it('selhání odesílání objednávku nezruší a zaloguje se', async () => {
    const ctx = setup({ mailerFails: true })
    const result = await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(result.code).toBe('#2610')
    expect(ctx.varieties.get(1)?.stock.value).toBe(9)
    // oba e-maily se zkoušejí samostatně, takže selhání obou dá dva záznamy
    expect(ctx.logger.errors).toHaveLength(2)
  })

  it('u QR platby nese e-mail zákazníkovi platební údaje', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }], {
      payment: PaymentMethod.QR_CODE,
    })

    expect(ctx.mailer.sent[0]?.text).toContain('2000145399/0800')
    expect(ctx.mailer.sent[0]?.text).toContain('Agro:2610')
  })

  it('u platby hotově platební údaje neposílá', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }], { payment: PaymentMethod.CASH })

    expect(ctx.mailer.sent[0]?.text).not.toContain('Variabilní symbol')
  })

  it('odkaz na potvrzení nese veřejný token, ne kód objednávky', async () => {
    const ctx = setup()
    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(ctx.mailer.sent[0]?.text).toContain('https://silentagro.cz/rezervace/token-1')
    expect(ctx.mailer.sent[0]?.text).not.toContain('/rezervace/2610')
  })

  it('selhání prvního e-mailu nezabrání odeslání druhého', async () => {
    // farmář se o objednávce musí dozvědět i tehdy, když zákazníkova adresa odmítá poštu
    const ctx = setup()
    let attempts = 0
    ctx.mailer.send = async (message) => {
      attempts += 1
      if (attempts === 1) throw new Error('adresát neexistuje')
      ctx.mailer.sent.push(message)
    }

    await reserve(ctx.useCase, [{ varietyId: 1, quantityKg: 1 }])

    expect(attempts).toBe(2)
    expect(ctx.mailer.sent).toHaveLength(1)
    expect(ctx.mailer.sent[0]?.to).toBe('farma@silentagro.cz')
  })
})
