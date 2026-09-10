import type { RepositoryBundle } from '@/domain/ports/repositories'

/**
 * Jediná cesta k databázové transakci. Use-case nesmí sáhnout na Prisma přímo — dostane
 * sadu repozitářů svázanou s transakcí a o technologii pod ní neví.
 *
 * `repos` mimo transakci je pro čtení. Jakmile use-case něco mění na základě toho, co
 * přečetl (typicky odečet skladu), musí projít `runInTransaction`.
 */
export interface UnitOfWork {
  readonly repos: RepositoryBundle
  runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T>
}
