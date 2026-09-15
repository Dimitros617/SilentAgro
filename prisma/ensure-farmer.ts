import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

/**
 * Účet farmáře se zakládá na adresu z `FARMER_EMAIL`, ne na napevno zapsanou.
 * Jinak by si nový provozovatel nastavil svoji adresu a přihlašoval se pořád
 * pod cizí, kterou v konfiguraci nikde nevidí.
 */
export const farmerEmail = (): string => process.env.FARMER_EMAIL ?? 'farma@silentagro.cz'
const farmerName = (): string => process.env.SEED_FARMER_NAME ?? 'Farmář'

/**
 * Založí nebo obnoví účet farmáře. Odděleně od ukázkových dat, protože
 * v produkci je potřeba jen tohle — demo odrůdy a smyšlené objednávky by tam
 * byly na obtíž. `docker-compose.prod.yml` tuhle cestu volá profilem `farmer`.
 */
export async function ensureFarmer(
  prisma: PrismaClient,
  farmerPassword: string,
): Promise<{ id: number; email: string }> {
  if (!farmerPassword || farmerPassword.length < 8) {
    throw new Error(
      'SEED_FARMER_PASSWORD musí být nastavené a mít alespoň 8 znaků. ' +
        'Do repozitáře se žádné výchozí heslo nezapisuje.',
    )
  }

  // Účet farmy je ověřený rovnou: adresu zná provozovatel a posílat si ověřovací
  // odkaz sám sobě nedává smysl.
  const verifiedAt = new Date('2026-08-01T08:00:00.000Z')

  const email = farmerEmail()
  const name = farmerName()

  // Heslo se přepisuje i při opakovaném spuštění. Aplikace změnu hesla nenabízí,
  // takže tohle je jediná cesta, jak se do administrace dostat — a když by si
  // `update` heslo nechal, provozovatel by si ho v `.env` změnil, skript by
  // ohlásil úspěch a přihlášení by dál padalo na "Nesprávné heslo".
  const passwordHash = await bcrypt.hash(farmerPassword, 12)

  // Obnova hesla zároveň odvolá dosud vydané session. Token je podepsaný na sedm dní
  // a zneplatnit se sám neumí, takže bez tohohle razítka by útočník s ukradenou
  // sušenkou zůstal v administraci i po změně hesla. Zakládaný účet razítko nepotřebuje
  // — není co odvolávat.
  const farmer = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: 'FARMER',
      verifiedAt,
      passwordHash,
      deactivatedAt: null,
      sessionsInvalidBefore: new Date(),
    },
    create: { email, name, role: 'FARMER', verifiedAt, passwordHash },
  })

  return { id: farmer.id, email: farmer.email }
}
