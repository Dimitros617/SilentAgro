import { prisma } from '@/infrastructure/persistence/prisma/client'

export const dynamic = 'force-dynamic'

/**
 * Liveness i kontrola databáze. Chybová větev **nevrací detail výjimky** — hlášky MySQL
 * prozrazují hostitele i jméno uživatele a tenhle endpoint je veřejný.
 */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', database: 'up' })
  } catch {
    return Response.json({ status: 'degraded', database: 'down' }, { status: 503 })
  }
}
