import type { Prisma, PrismaClient } from '@prisma/client'

export type PrismaLike = PrismaClient | Prisma.TransactionClient
