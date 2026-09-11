import bcrypt from 'bcryptjs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seed } from '../../prisma/seed'
import { disconnect, resetDatabase, testPrisma } from './helpers/db'

/**
 * Aplikace neumí změnit heslo. Seed je jediná cesta do administrace, takže
 * musí fungovat i podruhé — jinak si provozovatel změní SEED_FARMER_PASSWORD,
 * uvidí "Seed hotov" a přihlášení mu bude dál hlásit nesprávné heslo.
 */

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await disconnect()
})

const farmer = () =>
  testPrisma.user.findUniqueOrThrow({ where: { email: 'farma@silentagro.cz' } })

describe('seed', () => {
  it('nastaví heslo farmáře i při opakovaném spuštění', async () => {
    await seed(testPrisma, 'prvniHeslo123')
    expect(await bcrypt.compare('prvniHeslo123', (await farmer()).passwordHash)).toBe(true)

    await seed(testPrisma, 'druheHeslo456')
    const after = await farmer()

    expect(await bcrypt.compare('druheHeslo456', after.passwordHash)).toBe(true)
    expect(await bcrypt.compare('prvniHeslo123', after.passwordHash)).toBe(false)
  })

  it('vrátí deaktivovaného farmáře zpátky do provozu', async () => {
    // Kdo se omylem deaktivuje v administraci, se jinak do aplikace nedostane
    // vůbec — žádný jiný účet roli farmáře nemá.
    await seed(testPrisma, 'prvniHeslo123')
    await testPrisma.user.update({
      where: { email: 'farma@silentagro.cz' },
      data: { deactivatedAt: new Date() },
    })

    await seed(testPrisma, 'prvniHeslo123')

    expect((await farmer()).deactivatedAt).toBeNull()
  })

  it('odmítne krátké heslo, místo aby založilo účet, na který se dá uhodnout', async () => {
    await expect(seed(testPrisma, 'krátké')).rejects.toThrow('SEED_FARMER_PASSWORD')
  })
})
