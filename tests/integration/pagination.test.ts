import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ListOrders } from '@/application/use-cases/orders'
import { GetUserDetail, ListUsers } from '@/application/use-cases/users'
import { OrderStatus } from '@/domain/enums'
import { disconnect, resetDatabase, testPrisma, testUow } from './helpers/db'

beforeEach(async () => {
  await resetDatabase()
  await testPrisma.user.createMany({ data: Array.from({ length: 56 }, (_, index) => ({
    email: `user${index}@example.cz`, name: `Zákazník ${index}`, passwordHash: 'test',
    verifiedAt: index % 2 === 0 ? new Date() : null,
  })) })
  await testPrisma.order.createMany({ data: Array.from({ length: 61 }, (_, index) => ({
    code: `test-${index}`, publicToken: `public-${index}`, customerName: `Objednávka ${index}`,
    customerEmail: 'objednavka@example.cz', customerPhone: '', note: '',
    deliveryMethod: 'PICKUP', paymentMethod: 'CASH', subtotalCzk: 20, deliveryFeeCzk: 0,
    totalCzk: 20, userId: index === 60 ? 2 : 1,
    status: index % 2 === 0 ? 'NEW' : 'READY',
  })) })
})
afterAll(disconnect)

describe('stránkování a filtry v databázi', () => {
  it('projde všechny objednávky bez překryvu a umožní zobrazit nejstarší', async () => {
    const list = new ListOrders({ uow: testUow })
    const first = await list.execute({ page: 1 })
    const second = await list.execute({ page: 2 })
    const third = await list.execute({ page: 3 })
    expect(first.total).toBe(61)
    expect([first.items.length, second.items.length, third.items.length]).toEqual([25, 25, 11])
    expect(new Set([...first.items, ...second.items, ...third.items].map((row) => row.id)).size).toBe(61)
    expect(third.items.at(-1)?.code).toBe('test-0')
  })

  it('filtruje před stránkováním včetně záznamů mimo první stránku', async () => {
    const result = await new ListOrders({ uow: testUow }).execute({}, { query: 'test-0', status: OrderStatus.NEW })
    expect(result.total).toBe(1)
    expect(result.items[0]?.code).toBe('test-0')
  })

  it('seznamy objednávek i uživatelů upraví mezery a délku filtru před dotazem', async () => {
    const name = 'Ž'.repeat(120)
    await testPrisma.order.update({ where: { id: 1 }, data: { customerName: name } })
    await testPrisma.user.update({ where: { id: 1 }, data: { name } })
    const query = `  ${name}přebytečný text  `

    const orders = await new ListOrders({ uow: testUow }).execute({}, { query, status: OrderStatus.NEW })
    const users = await new ListUsers({ uow: testUow }).execute({}, { query, onlyProblems: false })

    expect(orders.total).toBe(1)
    expect(orders.items[0]?.id).toBe(1)
    expect(users.total).toBe(1)
    expect(users.items[0]?.id).toBe(1)
  })

  it('omezuje velikost stránky a opravuje neplatná nebo příliš vysoká čísla', async () => {
    const list = new ListOrders({ uow: testUow })
    const huge = await list.execute({ page: 999, pageSize: 9999 })
    expect(huge.pageSize).toBe(100)
    expect(huge.page).toBe(1)
    expect((await list.execute({ page: -1, pageSize: -2 })).pageSize).toBe(25)
    const empty = await list.execute({ page: 100 }, { query: 'neexistuje' })
    expect(empty).toMatchObject({ total: 0, items: [], page: 1 })
  })

  it('stránkuje zákazníky a zachovává souhrny účtu přes celou historii', async () => {
    const list = new ListUsers({ uow: testUow })
    const third = await list.execute({ page: 3 })
    expect(third.total).toBe(56)
    expect(third.items).toHaveLength(6)
    const firstAccount = third.items.find((user) => user.id === 1)
    expect(firstAccount?.orderCount).toBe(60)
    expect(firstAccount?.totalSpentLabel).toContain('200')
    const filtered = await list.execute({}, { query: 'user1@', onlyProblems: true })
    expect(filtered.total).toBe(1)
    expect(filtered.items[0]?.email).toBe('user1@example.cz')
  })

  it('historie profilu nikdy nezahrne objednávky jiného účtu', async () => {
    const detail = await new GetUserDetail({ uow: testUow }).execute(1, { page: 3 })
    expect(detail.orderCount).toBe(60)
    expect(detail.ordersPage).toEqual({ page: 3, pageSize: 25, total: 60 })
    expect(detail.orders).toHaveLength(10)
    expect(detail.orders.some((order) => order.code === 'test-60')).toBe(false)
  })
})
