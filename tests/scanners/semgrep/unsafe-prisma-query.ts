async function unsafeQueries(db, name) {
  // ruleid: unsafe-prisma-query
  await db.$queryRawUnsafe(`SELECT * FROM varieties WHERE name = '${name}'`)
  // ruleid: unsafe-prisma-query
  await db.$executeRawUnsafe('DELETE FROM orders')
  // ok: unsafe-prisma-query
  await db.$queryRaw`SELECT * FROM varieties WHERE name = ${name}`
  // ok: unsafe-prisma-query
  await db.variety.findUnique({ where: { id: 1 } })
}
