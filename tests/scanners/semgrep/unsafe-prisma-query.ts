import { Prisma } from '@prisma/client'

async function unsafeQueries(db, name, ids) {
  // ruleid: unsafe-prisma-query
  await db.$queryRawUnsafe(`SELECT * FROM varieties WHERE name = '${name}'`)
  // ruleid: unsafe-prisma-query
  await db.$executeRawUnsafe('DELETE FROM orders')
  // ruleid: unsafe-prisma-query
  await db.$queryRaw(Prisma.raw(`SELECT * FROM varieties WHERE name = '${name}'`))
  // ok: unsafe-prisma-query
  await db.$queryRaw`SELECT * FROM varieties WHERE name = ${name}`
  // ok: unsafe-prisma-query
  await db.$queryRaw`SELECT * FROM varieties WHERE id IN (${Prisma.join(ids)})`
  // ok: unsafe-prisma-query
  await db.$queryRaw(Prisma.sql`SELECT * FROM varieties WHERE name = ${name}`)
  // ok: unsafe-prisma-query
  await db.variety.findUnique({ where: { id: 1 } })
}

async function destructured(db, sql) {
  const { $queryRawUnsafe, $executeRawUnsafe } = db
  // ruleid: unsafe-prisma-query
  await $queryRawUnsafe(sql)
  // ruleid: unsafe-prisma-query
  await $executeRawUnsafe(sql)
}
