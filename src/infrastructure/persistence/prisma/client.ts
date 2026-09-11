import { PrismaClient } from '@prisma/client'

/**
 * Ve vývoji Next.js přenačítá moduly při každé změně souboru. Bez tohoto uložení
 * do `globalThis` by každý přenačtený modul otevřel nový fond spojení a MySQL by
 * po pár desítkách úprav odmítla další připojení.
 */
const globalForPrisma = globalThis as unknown as { silentAgroPrisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.silentAgroPrisma ?? new PrismaClient({ log: ['warn', 'error'] })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.silentAgroPrisma = prisma
}
