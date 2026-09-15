import type { PrismaLike } from './types'

/** Prisma předává do transakce klienta bez metody pro zahájení další transakce. */
export function requireTransaction(db: PrismaLike): void {
  if ('$transaction' in db) {
    throw new Error('Tato operace vyžaduje UnitOfWork.runInTransaction')
  }
}
