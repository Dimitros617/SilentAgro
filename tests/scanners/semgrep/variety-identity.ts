async function varietyLookups(db, name, id, data) {
  // ruleid: variety-identity
  await db.variety.findFirst({ where: { name } })
  // ruleid: variety-identity
  await db.variety.findUnique({ where: { name: name }, select: { id: true } })
  // ruleid: variety-identity
  await db.variety.findUniqueOrThrow({ where: { name } })
  // ruleid: variety-identity
  await db.variety.findFirstOrThrow({ where: { name } })
  // Zápis je stejná identita jako čtení: po přejmenování zapíše jinam nebo nikam.
  // ruleid: variety-identity
  await db.variety.update({ where: { name }, data })
  // ruleid: variety-identity
  await db.variety.updateMany({ where: { name }, data })
  // ruleid: variety-identity
  await db.variety.upsert({ where: { name }, create: data, update: data })
  // ruleid: variety-identity
  await db.variety.delete({ where: { name } })
  // ruleid: variety-identity
  await db.variety.deleteMany({ where: { name } })
  // ruleid: variety-identity
  await db.variety.count({ where: { name } })
  // ruleid: variety-identity
  const badRelation = { variety: { connect: { name } } }
  // ruleid: variety-identity
  const badCreate = { variety: { connectOrCreate: { where: { name }, create: data } } }
  // ok: variety-identity
  await db.variety.findUnique({ where: { id } })
  // ok: variety-identity
  await db.variety.update({ where: { id }, data })
  // ok: variety-identity
  await db.variety.upsert({ where: { id }, create: data, update: data })
  // ok: variety-identity
  await db.variety.findMany({ where: { name: { contains: name } } })
  // ok: variety-identity
  const goodRelation = { variety: { connect: { id } }, varietyName: name }
}
