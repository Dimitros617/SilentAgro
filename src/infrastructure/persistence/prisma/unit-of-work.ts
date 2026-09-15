import type { Prisma, PrismaClient } from '@prisma/client'
import type { RepositoryBundle, TransactionRepositoryBundle } from '@/domain/ports/repositories'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { createRepositories, createTransactionRepositories } from '@/infrastructure/persistence/prisma/repositories'

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
   * `ReadCommitted` zajišťuje, že následné běžné čtení vidí potvrzená data k okamžiku
   * daného příkazu. Můžeme tak po získání zámku ID načíst aktuální entitu přes Prisma.
   * Samotná izolace nenahrazuje explicitní zámky před změnou stavu.
   *
   * `timeout` je vyšší než výchozích 5 s, protože transakce zahrnuje vložení objednávky
   * i všech jejích položek a pod souběhem může čekat na zámek.
   */
  async runInTransaction<T>(work: (repos: TransactionRepositoryBundle) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx: Prisma.TransactionClient) => work(createTransactionRepositories(tx)),
      { isolationLevel: 'ReadCommitted', timeout: 15_000, maxWait: 10_000 },
    )
  }
}
