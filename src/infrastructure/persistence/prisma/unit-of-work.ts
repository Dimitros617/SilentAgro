import type { Prisma, PrismaClient } from '@prisma/client'
import type { RepositoryBundle } from '@/domain/ports/repositories'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { createRepositories } from '@/infrastructure/persistence/prisma/repositories'

export class PrismaUnitOfWork implements UnitOfWork {
  readonly repos: RepositoryBundle

  constructor(private readonly client: PrismaClient) {
    this.repos = createRepositories(client)
  }

  /**
   * `ReadCommitted` místo výchozího `RepeatableRead`.
   *
   * Zamykající čtení (`FOR UPDATE`) vidí poslední potvrzený stav v obou úrovních, ale
   * v `RepeatableRead` by každé další běžné čtení uvnitř téže transakce četlo ze snapshotu.
   * `ReadCommitted` tuhle nejednoznačnost odstraňuje: každý příkaz vidí to, co je právě
   * v databázi. Pro rezervaci, která čte stav skladu a hned ho odečítá, je to jediné
   * chování, které dává smysl.
   *
   * `timeout` je vyšší než výchozích 5 s, protože transakce zahrnuje vložení objednávky
   * i všech jejích položek a pod souběhem může čekat na zámek.
   */
  async runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx: Prisma.TransactionClient) => work(createRepositories(tx)),
      { isolationLevel: 'ReadCommitted', timeout: 15_000, maxWait: 10_000 },
    )
  }
}
