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

  it('obnovou hesla odvolá dosud vydané administrátorské session', async () => {
    // Token platí sedm dní a zneplatnit se sám neumí; bez tohohle razítka by
    // útočník s ukradenou sušenkou zůstal v administraci i po změně hesla.
    await seed(testPrisma, 'prvniHeslo123')
    expect((await farmer()).sessionsInvalidBefore).toBeNull()

    await seed(testPrisma, 'druheHeslo456')

    expect((await farmer()).sessionsInvalidBefore).not.toBeNull()
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

describe('veřejné tokeny demo objednávek', () => {
  const tokens = async () =>
    (
      await testPrisma.order.findMany({ orderBy: { id: 'asc' }, select: { publicToken: true } })
    ).map((order) => order.publicToken)

  it('nejdou odvodit z pořadí objednávky', async () => {
    // Token je jediné, co chrání /rezervace/<token>; odvoditelný token by dovolil
    // přečíst osobní údaje z cizí objednávky pouhým hádáním pořadí.
    await seed(testPrisma, 'prvniHeslo123')

    const seeded = await tokens()

    expect(seeded).toHaveLength(3)
    for (const token of seeded) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
    }
  })

  it('vyjdou při každém běhu jinak', async () => {
    // Tohle je ten skutečný regresní test: vzorec odvozený z indexu dá pokaždé
    // tytéž tři řetězce, takže by projít nemohl.
    await seed(testPrisma, 'prvniHeslo123')
    const first = await tokens()

    await resetDatabase()
    await seed(testPrisma, 'prvniHeslo123')
    const second = await tokens()

    expect(second.some((token) => first.includes(token))).toBe(false)
  })

  it('kódy objednávek zůstávají odvozené z id', async () => {
    // Náhodný token se nesmí dotknout pravidla pro kód objednávky.
    await seed(testPrisma, 'prvniHeslo123')

    const codes = (
      await testPrisma.order.findMany({ orderBy: { id: 'asc' }, select: { code: true } })
    ).map((order) => order.code)

    expect(codes).toEqual(['#2610', '#2611', '#2612'])
  })
})
