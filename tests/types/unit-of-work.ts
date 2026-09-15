import type { NewOrderInput } from '@/domain/ports/repositories'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'

/** Kontroluje tsc; funkce se nespouští a neprovádí databázové operace. */
export async function checkTransactionContract(uow: UnitOfWork, order: NewOrderInput): Promise<void> {
  // @ts-expect-error Zámky nejsou dostupné mimo transakci.
  await uow.repos.varieties.lockForUpdate([1])
  // @ts-expect-error Zámky nejsou dostupné mimo transakci.
  await uow.repos.orders.lockForUpdate(1)
  // @ts-expect-error Zámky nejsou dostupné mimo transakci.
  await uow.repos.users.lockForUpdate(1)
  // @ts-expect-error Zámek ověřovacího tokenu také vyžaduje transakci.
  await uow.repos.users.lockByVerificationToken('token')
  // @ts-expect-error Vložení objednávky a přidělení kódu vyžaduje transakci.
  await uow.repos.orders.create(order)

  await uow.repos.orders.findById(1)
  await uow.runInTransaction(async (repos) => {
    await repos.varieties.lockForUpdate([1])
    await repos.orders.lockForUpdate(1)
    await repos.users.lockForUpdate(1)
    await repos.users.lockByVerificationToken('token')
    await repos.orders.create(order)
  })
}
