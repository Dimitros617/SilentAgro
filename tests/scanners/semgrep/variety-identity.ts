async function varietyLookups(db, name, id) {
  // ruleid: variety-identity
  await db.variety.findFirst({ where: { name } })
  // ruleid: variety-identity
  await db.variety.findUnique({ where: { name: name }, select: { id: true } })
  // ruleid: variety-identity
  const badRelation = { variety: { connect: { name } } }
  // ok: variety-identity
  await db.variety.findUnique({ where: { id } })
  // ok: variety-identity
  await db.variety.findMany({ where: { name: { contains: name } } })
  // ok: variety-identity
  const goodRelation = { variety: { connect: { id } }, varietyName: name }
}
