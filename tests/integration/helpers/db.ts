import { PrismaClient } from '@prisma/client'
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/unit-of-work'

export const testPrisma = new PrismaClient()
export const testUow = new PrismaUnitOfWork(testPrisma)

/**
 * Pořadí podle cizích klíčů, bez `SET FOREIGN_KEY_CHECKS = 0`.
 *
 * `FOREIGN_KEY_CHECKS` je proměnná spojení, ale Prisma bere spojení z fondu — vypnutí
 * a mazání by mohly skončit na různých spojeních a kontrola by zůstala zapnutá.
 * Mazání ve správném pořadí je spolehlivé bez ohledu na to, kudy dotaz poteče.
 */
const DELETE_ORDER = [
  'order_items',
  'orders',
  'news_posts',
  'varieties',
  'fields',
  'harvest_entries',
  'storage_readings',
  'users',
] as const

export async function resetDatabase(): Promise<void> {
  for (const table of DELETE_ORDER) {
    await testPrisma.$executeRawUnsafe(`DELETE FROM \`${table}\``)
    // DELETE auto-increment neresetuje; bez toho by kódy objednávek mezi testy narůstaly
    // a test na konkrétní kód by byl závislý na pořadí běhu.
    await testPrisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`)
  }
}

export async function disconnect(): Promise<void> {
  await testPrisma.$disconnect()
}
