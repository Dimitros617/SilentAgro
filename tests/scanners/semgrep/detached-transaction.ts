async function transactions(db, work) {
  // ruleid: detached-transaction
  db.$transaction(work)
  // ok: detached-transaction
  await db.$transaction(work)
  // ok: detached-transaction
  const result = await db.$transaction(work)
  // ok: detached-transaction
  const pending = db.$transaction(work)
  await pending
  // ok: detached-transaction
  await Promise.all([db.$transaction(work)])
  // ok: detached-transaction
  return db.$transaction(work).then(result => result)
  // ok: detached-transaction
  return db.$transaction(work)
}
