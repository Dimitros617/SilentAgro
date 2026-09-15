import { PrismaClient } from '@prisma/client'
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/unit-of-work'

/**
 * Integrační testy mažou tabulky, takže **nesmí** běžet proti vývojové databázi —
 * jinak vývojáři po každém `npm run test:integration` zmizí seed a diví se, proč
 * je aplikace prázdná. `TEST_DATABASE_URL` je proto povinná a musí mířit jinam
 * než `DATABASE_URL`.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL

if (!testDatabaseUrl) {
  throw new Error(
    'Integrační testy vyžadují TEST_DATABASE_URL mířící na samostatnou databázi. ' +
      'Například: TEST_DATABASE_URL="mysql://silentagro:silentagro@localhost:3307/silentagro_test"',
  )
}

if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL se shoduje s DATABASE_URL. Testy mažou tabulky, takže by ' +
      'smazaly vývojová data.',
  )
}

export const testPrisma = new PrismaClient({ datasourceUrl: testDatabaseUrl })
export const testUow = new PrismaUnitOfWork(testPrisma)

/**
 * Pořadí podle cizích klíčů, bez `SET FOREIGN_KEY_CHECKS = 0`.
 *
 * `FOREIGN_KEY_CHECKS` je proměnná spojení, ale Prisma bere spojení z fondu — vypnutí
 * a mazání by mohly skončit na různých spojeních a kontrola by zůstala zapnutá.
 * Mazání ve správném pořadí je spolehlivé bez ohledu na to, kudy dotaz poteče.
 */
const DELETE_ORDER = [
  'mail_outbox',
  'reservation_requests',
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
