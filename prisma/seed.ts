import { randomBytes } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { VARIETIES, NEWS, FIELDS, HARVEST, ORDERS } from './seed-data'
import { ensureFarmer, farmerEmail } from './ensure-farmer'
export { ensureFarmer } from './ensure-farmer'
// Relativní cesta schválně: seed se spouští mimo Next.js, kde alias `@` nemusí
// být k dispozici. Pravidlo pro kód objednávky ale musí být sdílené, ne opsané.
import { orderCodeFor } from '../src/shared/order-code'
import { Order } from '../src/domain/entities/order'
import { Kilograms } from '../src/domain/value-objects/kilograms'
import { Money } from '../src/domain/value-objects/money'

const dec = (value: number) => new Prisma.Decimal(value)
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

const DEMO_DELIVERY_POLICY = { freeAboveCzk: 600, feeCzk: 60 }

export async function seed(prisma: PrismaClient, farmerPassword: string): Promise<void> {
  const farmer = await ensureFarmer(prisma, farmerPassword)
  const varietyIdBySlug = await seedVarieties(prisma)
  await seedNews(prisma, farmer.id)
  await seedFields(prisma)
  await seedHarvest(prisma)
  await seedStorageReading(prisma)
  await seedOrders(prisma, varietyIdBySlug)
}

async function seedVarieties(prisma: PrismaClient): Promise<Map<string, number>> {
  const varietyIdBySlug = new Map<string, number>()
  for (const [index, variety] of VARIETIES.entries()) {
    const data = {
      name: variety.name,
      tag: variety.tag,
      description: variety.description,
      colorHex: variety.colorHex,
      pricePerKgCzk: dec(variety.price),
      stockKg: dec(variety.stock),
      capacityKg: dec(variety.capacity),
      sortOrder: index,
      isActive: true,
    }
    const row = await prisma.variety.upsert({
      where: { slug: variety.slug },
      update: data,
      create: { ...data, slug: variety.slug },
    })
    varietyIdBySlug.set(variety.slug, row.id)
  }
  return varietyIdBySlug
}

async function seedNews(prisma: PrismaClient, authorId: number): Promise<void> {
  // Novinky, pole a historie výkopu nemají přirozený unikátní klíč kromě obsahu,
  // takže se zakládají jen tehdy, když tabulka je prázdná. Opakovaný seed pak
  // nevytvoří duplicity a nepřepíše, co farmář mezitím napsal.
  if ((await prisma.newsPost.count()) === 0) {
    for (const post of NEWS) {
      await prisma.newsPost.create({ data: { ...post, authorId, imageUrl: null } })
    }
  }
}

async function seedFields(prisma: PrismaClient): Promise<void> {
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
}

async function seedHarvest(prisma: PrismaClient): Promise<void> {
  for (const [date, dug, stock] of HARVEST) {
    await prisma.harvestEntry.upsert({
      where: { date: day(date) },
      update: { dugKg: dec(dug), stockKg: dec(stock) },
      create: { date: day(date), dugKg: dec(dug), stockKg: dec(stock) },
    })
  }
}

async function seedStorageReading(prisma: PrismaClient): Promise<void> {
  if ((await prisma.storageReading.count()) === 0) {
    await prisma.storageReading.create({
      data: {
        recordedAt: new Date('2026-09-09T19:42:00.000Z'),
        temperatureC: dec(6),
        humidityPct: 92,
      },
    })
  }
}

async function seedOrders(prisma: PrismaClient, varietyIdBySlug: ReadonlyMap<string, number>): Promise<void> {
  if ((await prisma.order.count()) === 0) {
    for (const [index, order] of ORDERS.entries()) {
      const items = order.items.map((item) => {
        const variety = VARIETIES.find((v) => v.slug === item.slug)
        const varietyId = varietyIdBySlug.get(item.slug)
        if (!variety || varietyId === undefined) {
          throw new Error(`Seed odkazuje na neznámou odrůdu: ${item.slug}`)
        }
        const unitPrice = Money.fromCzk(variety.price)
        const quantity = Kilograms.of(item.quantity)
        return {
          varietyId,
          varietyName: variety.name,
          unitPriceCzk: dec(variety.price),
          quantityKg: dec(item.quantity),
          lineTotalCzk: dec(unitPrice.timesKg(quantity).czk),
        }
      })

      let subtotal = Money.zero()
      for (const item of items) {
        subtotal = subtotal.plus(Money.fromCzk(item.lineTotalCzk.toNumber()))
      }
      const fee = Order.deliveryFeeFor(order.deliveryMethod, subtotal, DEMO_DELIVERY_POLICY)

      const created = await prisma.order.create({
        data: {
          code: `seed-tmp-${index}`,
          // Token je jediné, co chrání /rezervace/<token>. Odvoditelný token by dovolil
          // přečíst osobní údaje z cizí objednávky hádáním pořadí, tak ho i demo data
          // berou stejně náhodný jako aplikace (src/infrastructure/di/container.ts).
          publicToken: randomBytes(24).toString('base64url'),
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          note: order.note,
          deliveryMethod: order.deliveryMethod,
          paymentMethod: order.paymentMethod,
          subtotalCzk: dec(subtotal.czk),
          deliveryFeeCzk: dec(fee.czk),
          totalCzk: dec(subtotal.plus(fee).czk),
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
