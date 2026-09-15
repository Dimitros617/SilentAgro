import type { Prisma, PrismaClient } from '@prisma/client'
import type { RepositoryBundle, TransactionRepositoryBundle } from '@/domain/ports/repositories'
import type { PrismaLike } from './types'
import { requireTransaction } from './transaction'
import { PrismaVarietyRepository } from './variety-repository'
import { PrismaOrderRepository } from './order-repository'
import { PrismaNewsRepository } from './news-repository'
import { PrismaUserRepository } from './user-repository'
import { PrismaFieldRepository } from './field-repository'
import { PrismaHarvestRepository } from './harvest-repository'
import { PrismaStorageReadingRepository } from './storage-reading-repository'
import { PrismaReservationRequestRepository } from './reservation-request-repository'
import { PrismaMailOutboxRepository } from './mail-outbox-repository'


export function createRepositories(db: PrismaClient): RepositoryBundle {
  return buildRepositories(db)
}

export function createTransactionRepositories(db: Prisma.TransactionClient): TransactionRepositoryBundle {
  requireTransaction(db)
  return buildRepositories(db)
}

function buildRepositories(db: PrismaLike): TransactionRepositoryBundle {
  return {
    varieties: new PrismaVarietyRepository(db),
    orders: new PrismaOrderRepository(db),
    news: new PrismaNewsRepository(db),
    users: new PrismaUserRepository(db),
    fields: new PrismaFieldRepository(db),
    harvest: new PrismaHarvestRepository(db),
    storage: new PrismaStorageReadingRepository(db),
    reservationRequests: new PrismaReservationRequestRepository(db),
    outbox: new PrismaMailOutboxRepository(db),
  }
}
