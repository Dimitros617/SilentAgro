import { PrismaClient } from '@prisma/client'
import { ensureFarmer } from './seed'

/**
 * Založí účet farmáře a nic víc.
 *
 * V produkci je tohle jediné, co je po migracích potřeba: `prisma/seed.ts` by
 * kromě účtu nasypal do databáze ukázkové odrůdy, novinky a smyšlené objednávky.
 * Bez tohohle kroku běží prázdná databáze a do administrace se nedá přihlásit.
 *
 * Spouští se z migračního obrazu, který má `tsx` i Prisma CLI:
 *   docker compose -f docker-compose.prod.yml --profile farmer run --rm farmer
 *
 * Pustit se dá opakovaně — heslo se přepíše, takže takhle se řeší i zapomenuté
 * heslo do administrace.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const farmer = await ensureFarmer(prisma, process.env.SEED_FARMER_PASSWORD ?? '')
    console.info(`Účet farmáře je připravený: ${farmer.email}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
