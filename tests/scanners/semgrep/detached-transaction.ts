async function transactions(db, work, cleanup, log) {
  // ruleid: detached-transaction
  db.$transaction(work)
  // ruleid: detached-transaction
  void db.$transaction(work)
  // ruleid: detached-transaction
  db.$transaction(work).catch(log)
  // ruleid: detached-transaction
  db.$transaction(work).finally(cleanup)
  // Vazba bez await je opuštěná transakce; pozdější await pravidlo nedohledá,
  // takže se hlásí i tvar, který by za běhu dopadl dobře.
  // ruleid: detached-transaction
  const pending = db.$transaction(work)
  await pending
  // ok: detached-transaction
  await db.$transaction(work)
  // ok: detached-transaction
  const result = await db.$transaction(work)
  // ok: detached-transaction
  await Promise.all([db.$transaction(work)])
  // ok: detached-transaction
  return db.$transaction(work)
}

async function chained(db, work) {
  // ok: detached-transaction
  return db.$transaction(work).then(result => result)
}
