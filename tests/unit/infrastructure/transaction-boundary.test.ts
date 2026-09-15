import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import type { NewOrderInput, TransactionRepositoryBundle } from '@/domain/ports/repositories'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { createTransactionRepositories } from '@/infrastructure/persistence/prisma/repositories'
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/unit-of-work'

// Žádný dotaz nemá odejít. Neplatné volání se musí odmítnout před připojením.
const client = new PrismaClient({
  datasourceUrl: 'mysql://unused:unused@127.0.0.1:1/transaction_contract_test',
})
const uow = new PrismaUnitOfWork(client)
const transactionRequired = 'Tato operace vyžaduje UnitOfWork.runInTransaction'

// Záměrně obcházíme typy: ověřujeme pojistku pro přímé použití adaptéru nebo JavaScript.
const repos = uow.repos as TransactionRepositoryBundle

afterEach(() => vi.restoreAllMocks())
afterAll(() => client.$disconnect())

describe('transakční hranice repozitářů', () => {
  it.each([
    ['odrůda', () => repos.varieties.lockForUpdate([1])],
    ['prázdný seznam odrůd', () => repos.varieties.lockForUpdate([])],
    ['objednávka', () => repos.orders.lockForUpdate(1)],
    ['uživatel', () => repos.users.lockForUpdate(1)],
    ['ověřovací token', () => repos.users.lockByVerificationToken('token')],
  ])('odmítne zámek mimo transakci: %s', async (_label, lock) => {
    const query = vi.spyOn(client, '$queryRaw').mockRejectedValue(new Error('Neočekávaný SQL dotaz'))

    await expect(lock()).rejects.toThrow(transactionRequired)

    expect(query).not.toHaveBeenCalled()
  })

  it('nevloží objednávku s dočasným kódem mimo transakci', async () => {
    const insert = vi.spyOn(client.order, 'create').mockRejectedValue(new Error('Neočekávaný INSERT'))
    const item = OrderItem.create({
      varietyId: 1,
      varietyName: 'Bernie',
      unitPrice: Money.fromCzk(20),
      quantity: Kilograms.of(1),
    })
    const input: NewOrderInput = {
      customer: { name: 'Jan', email: EmailAddress.of('jan@example.cz'), phone: '777123456', note: '' },
      items: [item],
      delivery: DeliveryMethod.PICKUP,
      payment: PaymentMethod.CASH,
      subtotal: item.lineTotal,
      deliveryFee: Money.zero(),
      total: item.lineTotal,
      discount: Money.zero(),
      pricingVersion: 1,
      userId: null,
      publicToken: 'transaction-test',
      createdAt: new Date('2026-09-14T08:00:00Z'),
    }

    await expect(repos.orders.create(input)).rejects.toThrow(transactionRequired)

    expect(insert).not.toHaveBeenCalled()
  })

  it('odmítne sestavení transakčních repozitářů z běžného klienta', () => {
    // PrismaClient je strukturálně kompatibilní s TransactionClient; samotný typ nestačí.
    expect(() => createTransactionRepositories(client)).toThrow(transactionRequired)
  })
})
