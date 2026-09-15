import type { RepositoryBundle, TransactionRepositoryBundle } from '@/domain/ports/repositories'

/**
 * Jediná cesta k databázové transakci. Use-case nesmí sáhnout na Prisma přímo — dostane
 * sadu repozitářů svázanou s transakcí a o technologii pod ní neví.
 *
 * `repos` mimo explicitní transakci slouží pro čtení a samostatné atomické operace,
 * například vložení novinky. Více souvisejících zápisů nebo změna na základě čteného
 * stavu (typicky odečet skladu) musí projít `runInTransaction`.
 */
export interface UnitOfWork {
  readonly repos: RepositoryBundle
  runInTransaction<T>(work: (repos: TransactionRepositoryBundle) => Promise<T>): Promise<T>
}
