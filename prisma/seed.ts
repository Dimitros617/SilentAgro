import { PrismaClient, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
// Relativní cesta schválně: seed se spouští mimo Next.js, kde alias `@` nemusí
// být k dispozici. Pravidlo pro kód objednávky ale musí být sdílené, ne opsané.
import { orderCodeFor } from '../src/shared/order-code'

const dec = (value: number) => new Prisma.Decimal(value)
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const VARIETIES = [
  {
    slug: 'bernie',
    name: 'Bernie',
    tag: 'lahůdková, salátová, varný typ A',
    description:
      'Pevná žlutá dužnina, nerozvařuje se. Ideální na bramborový salát a vařené v páře s máslem.',
    colorHex: '#c98a2b',
    price: 22,
    stock: 148,
    capacity: 160,
  },
  {
    slug: 'marabel',
    name: 'Marabel',
    tag: 'polopozdní, varný typ AB',
    description:
      'Univerzálka do každé kuchyně — na kaši, hranolky i pečení. Skladuje se přes zimu bez problémů.',
    colorHex: '#8a9a3f',
    price: 17,
    stock: 132,
    capacity: 170,
  },
  {
    slug: 'red-anna',
    name: 'Red Anna',
    tag: 'červená slupka, varný typ B',
    description: 'Červená slupka, máslová chuť. Krásná pečená celá se solí a rozmarýnem.',
    colorHex: '#a9642e',
    price: 19,
    stock: 64,
    capacity: 140,
  },
  {
    slug: 'agria',
    name: 'Agria',
    tag: 'pozdní, varný typ B',
    description:
      'Poslední záhon sezóny. Vykopeme koncem září, čekáme kolem 150 kg.',
    colorHex: '#6f8f5a',
    price: 16,
    stock: 0,
    capacity: 150,
  },
] as const

const NEWS = [
  {
    title: 'Dnes jsme vykopali Bernie',
    body: 'Jsou to skvělé lahůdkové brambory na salát, té nejvyšší kvality — zasazené, pěstované a sklizené s největší láskou. Velikost hlíz je od 1 mm do velikosti pěsti středně vzrostlého muže.',
    tag: 'HARVEST' as const,
    publishedAt: day('2026-09-09'),
  },
  {
    title: 'Stodola je vychlazená na 6 °C',
    body: 'Dokoupili jsme čidla, teplotu i vlhkost teď hlídáme nepřetržitě. Brambory tak vydrží křupavé až do jara.',
    tag: 'STORAGE' as const,
    publishedAt: day('2026-09-05'),
  },
  {
    title: 'Agria potřebuje ještě tři týdny',
    body: 'Natě jsou pořád zelené, necháme hlízy dorůst. Předpokládaný výkop je kolem 25. září, čekáme kolem 150 kg.',
    tag: 'FIELD' as const,
    publishedAt: day('2026-09-01'),
  },
]

const FIELDS = [
  { name: 'Záhon za stodolou', varietyName: 'Bernie', areaM2: 180, status: 'HARVESTED' as const, yieldKg: 148, isEstimate: false },
  { name: 'Záhon u lesa', varietyName: 'Marabel', areaM2: 200, status: 'HARVESTED' as const, yieldKg: 132, isEstimate: false },
  { name: 'Nad potokem', varietyName: 'Red Anna', areaM2: 90, status: 'HARVESTING' as const, yieldKg: 64, isEstimate: false },
  { name: 'Dolní díl', varietyName: 'Agria', areaM2: 190, status: 'GROWING' as const, yieldKg: 150, isEstimate: true },
  { name: 'Kamenec', varietyName: 'Sadba 2027', areaM2: 60, status: 'GROWING' as const, yieldKg: 40, isEstimate: true },
]

const HARVEST: Array<[string, number, number]> = [
  ['2026-08-27', 0, 38],
  ['2026-08-28', 42, 74],
  ['2026-08-29', 0, 68],
  ['2026-08-30', 55, 118],
  ['2026-08-31', 0, 110],
  ['2026-09-01', 0, 97],
  ['2026-09-02', 48, 140],
  ['2026-09-03', 0, 131],
  ['2026-09-04', 62, 188],
  ['2026-09-05', 0, 174],
  ['2026-09-06', 36, 203],
  ['2026-09-07', 0, 191],
  ['2026-09-08', 0, 182],
  ['2026-09-09', 148, 344],
]

/**
 * Historické objednávky. Kódy se **nezapisují ručně** — odvodí se z `id` stejným
 * pravidlem, jaké používá aplikace. Dvě definice jednoho kódu by se dřív nebo
 * později rozešly.
 */
const ORDERS = [
  {
    customerName: 'Jiří Malý',
    customerEmail: 'jiri.maly@email.cz',
    customerPhone: '+420 605 111 222',
    note: '',
    deliveryMethod: 'PICKUP' as const,
    paymentMethod: 'CASH' as const,
    status: 'COLLECTED' as const,
    paid: true,
    items: [{ slug: 'bernie', quantity: 2.5 }],
  },
  {
    customerName: 'Restaurace U Lípy',
    customerEmail: 'objednavky@ulipy.cz',
    customerPhone: '+420 733 444 555',
    note: 'Fakturu prosím e-mailem.',
    deliveryMethod: 'LOCAL_DELIVERY' as const,
    paymentMethod: 'BANK_TRANSFER' as const,
    status: 'READY' as const,
    paid: true,
    items: [
      { slug: 'bernie', quantity: 20 },
      { slug: 'red-anna', quantity: 5 },
    ],
  },
  {
    customerName: 'Petra Dvořáková',
    customerEmail: 'petra.d@email.cz',
    customerPhone: '+420 776 888 999',
    note: 'Přijedu v sobotu dopoledne.',
    deliveryMethod: 'LOCAL_DELIVERY' as const,
    paymentMethod: 'QR_CODE' as const,
    status: 'NEW' as const,
    paid: false,
    items: [{ slug: 'marabel', quantity: 7.5 }],
  },
]

const FREE_DELIVERY_ABOVE = 600
const DELIVERY_FEE = 60

/**
 * Účet farmáře se zakládá na adresu z `FARMER_EMAIL`, ne na napevno zapsanou.
 * Jinak by si nový provozovatel nastavil svoji adresu a přihlašoval se pořád
 * pod cizí, kterou v konfiguraci nikde nevidí.
 */
const farmerEmail = (): string => process.env.FARMER_EMAIL ?? 'farma@silentagro.cz'
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

  const farmer = await prisma.user.upsert({
    where: { email },
    update: { name, role: 'FARMER', verifiedAt, passwordHash, deactivatedAt: null },
    create: { email, name, role: 'FARMER', verifiedAt, passwordHash },
  })

  return { id: farmer.id, email: farmer.email }
}

export async function seed(prisma: PrismaClient, farmerPassword: string): Promise<void> {
  const farmer = await ensureFarmer(prisma, farmerPassword)

  const varietyIdBySlug = new Map<string, number>()
  for (const [index, variety] of VARIETIES.entries()) {
    const row = await prisma.variety.upsert({
      where: { slug: variety.slug },
      update: {
        name: variety.name,
        tag: variety.tag,
        description: variety.description,
        colorHex: variety.colorHex,
        pricePerKgCzk: dec(variety.price),
        stockKg: dec(variety.stock),
        capacityKg: dec(variety.capacity),
        sortOrder: index,
        isActive: true,
      },
      create: {
        slug: variety.slug,
        name: variety.name,
        tag: variety.tag,
        description: variety.description,
        colorHex: variety.colorHex,
        pricePerKgCzk: dec(variety.price),
        stockKg: dec(variety.stock),
        capacityKg: dec(variety.capacity),
        sortOrder: index,
      },
    })
    varietyIdBySlug.set(variety.slug, row.id)
  }

  // Novinky, pole a historie výkopu nemají přirozený unikátní klíč kromě obsahu,
  // takže se zakládají jen tehdy, když tabulka je prázdná. Opakovaný seed pak
  // nevytvoří duplicity a nepřepíše, co farmář mezitím napsal.
  if ((await prisma.newsPost.count()) === 0) {
    for (const post of NEWS) {
      await prisma.newsPost.create({ data: { ...post, authorId: farmer.id, imageUrl: null } })
    }
  }

  if ((await prisma.field.count()) === 0) {
    for (const [index, field] of FIELDS.entries()) {
      await prisma.field.create({
        data: {
          name: field.name,
          varietyName: field.varietyName,
          areaM2: field.areaM2,
          status: field.status,
          yieldKg: dec(field.yieldKg),
          isEstimate: field.isEstimate,
          sortOrder: index,
        },
      })
    }
  }

  for (const [date, dug, stock] of HARVEST) {
    await prisma.harvestEntry.upsert({
      where: { date: day(date) },
      update: { dugKg: dec(dug), stockKg: dec(stock) },
      create: { date: day(date), dugKg: dec(dug), stockKg: dec(stock) },
    })
  }

  if ((await prisma.storageReading.count()) === 0) {
    await prisma.storageReading.create({
      data: {
        recordedAt: new Date('2026-09-09T19:42:00.000Z'),
        temperatureC: dec(6),
        humidityPct: 92,
      },
    })
  }

  if ((await prisma.order.count()) === 0) {
    for (const [index, order] of ORDERS.entries()) {
      const items = order.items.map((item) => {
        const variety = VARIETIES.find((v) => v.slug === item.slug)
        if (!variety) throw new Error(`Seed odkazuje na neznámou odrůdu: ${item.slug}`)
        return {
          varietyId: varietyIdBySlug.get(item.slug) ?? 0,
          varietyName: variety.name,
          unitPriceCzk: dec(variety.price),
          quantityKg: dec(item.quantity),
          lineTotalCzk: dec(variety.price * item.quantity),
        }
      })

      const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotalCzk), 0)
      const fee =
        order.deliveryMethod === 'LOCAL_DELIVERY' && subtotal <= FREE_DELIVERY_ABOVE
          ? DELIVERY_FEE
          : 0

      const created = await prisma.order.create({
        data: {
          code: `seed-tmp-${index}`,
          publicToken: `seed-token-${index + 1}-${Math.abs(index * 7919 + 13)}`,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          note: order.note,
          deliveryMethod: order.deliveryMethod,
          paymentMethod: order.paymentMethod,
          subtotalCzk: dec(subtotal),
          deliveryFeeCzk: dec(fee),
          totalCzk: dec(subtotal + fee),
          status: order.status,
          paidAt: order.paid ? new Date('2026-09-08T09:00:00.000Z') : null,
          createdAt: new Date(`2026-09-0${index + 6}T10:00:00.000Z`),
          items: { create: items },
        },
        select: { id: true },
      })

      await prisma.order.update({
        where: { id: created.id },
        data: { code: orderCodeFor(created.id) },
      })
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    await seed(prisma, process.env.SEED_FARMER_PASSWORD ?? '')
    const [varieties, news, orders] = await Promise.all([
      prisma.variety.count(),
      prisma.newsPost.count(),
      prisma.order.count(),
    ])
    console.info(
      `Seed hotov: ${varieties} odrůd, ${news} novinek, ${orders} objednávek, farmář ${farmerEmail()}`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

// Spuštěno přímo (`tsx prisma/seed.ts`), ne importováno testem.
if (process.argv[1]?.includes('seed')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
