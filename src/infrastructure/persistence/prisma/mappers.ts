import type {
  Field as FieldRow,
  HarvestEntry as HarvestRow,
  NewsPost as NewsRow,
  Order as OrderRow,
  OrderItem as OrderItemRow,
  StorageReading as StorageRow,
  User as UserRow,
  Variety as VarietyRow,
} from '@prisma/client'
import {
  Field,
  HarvestEntry,
  NewsPost,
  Order,
  OrderItem,
  StorageReading,
  User,
  Variety,
} from '@/domain/entities'
import type {
  DeliveryMethod,
  FieldStatus,
  NewsTag,
  OrderStatus,
  PaymentMethod,
  UserRole,
} from '@/domain/enums'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

/**
 * Prisma vrací DECIMAL jako `Prisma.Decimal`, ale surové dotazy podle ovladače
 * i jako řetězec nebo číslo. Jeden převod pro všechny tři případy je bezpečnější
 * než spoléhat na to, který z nich zrovna přijde.
 */
export const decimalToNumber = (value: unknown): number => {
  if (value === null || value === undefined || typeof value === 'boolean') {
    throw new Error('Databáze vrátila neplatné číslo')
  }
  const text = String(value).trim()
  const number = Number(text)
  if (text.length === 0 || !Number.isFinite(number)) {
    throw new Error('Databáze vrátila neplatné číslo')
  }
  return number
}

/**
 * Uložené množství musí splňovat stejná pravidla jako rezervace. Poškozená data
 * se nesmí tiše zaokrouhlit nebo zaměnit za nulu.
 */
const toKilograms = (value: unknown): Kilograms => Kilograms.of(decimalToNumber(value))

const toMoney = (value: unknown): Money => Money.fromCzk(decimalToNumber(value))

export const toVariety = (row: VarietyRow): Variety =>
  Variety.rehydrate({
    id: row.id,
    slug: row.slug,
    name: row.name,
    tag: row.tag,
    description: row.description,
    color: HexColor.of(row.colorHex),
    pricePerKg: toMoney(row.pricePerKgCzk),
    stock: toKilograms(row.stockKg),
    capacity: toKilograms(row.capacityKg),
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  })

/** Řádek ze surového zamykajícího dotazu — sloupce nesou názvy z databáze. */
export interface RawVarietyRow {
  id: number
  slug: string
  name: string
  tag: string
  description: string
  color_hex: string
  price_per_kg_czk: unknown
  stock_kg: unknown
  capacity_kg: unknown
  sort_order: number
  is_active: number | boolean
}

export const rawToVariety = (row: RawVarietyRow): Variety =>
  Variety.rehydrate({
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    tag: row.tag,
    description: row.description,
    color: HexColor.of(row.color_hex),
    pricePerKg: toMoney(row.price_per_kg_czk),
    stock: toKilograms(row.stock_kg),
    capacity: toKilograms(row.capacity_kg),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
  })

const toOrderItem = (row: OrderItemRow): OrderItem =>
  OrderItem.rehydrate({
    varietyId: row.varietyId,
    varietyName: row.varietyName,
    unitPrice: toMoney(row.unitPriceCzk),
    quantity: toKilograms(row.quantityKg),
    lineTotal: toMoney(row.lineTotalCzk),
  })

export const toOrder = (row: OrderRow & { items: OrderItemRow[] }): Order =>
  Order.rehydrate({
    id: row.id,
    code: row.code,
    publicToken: row.publicToken,
    customer: {
      name: row.customerName,
      email: EmailAddress.of(row.customerEmail),
      phone: row.customerPhone,
      note: row.note,
    },
    items: row.items.map(toOrderItem),
    delivery: row.deliveryMethod as DeliveryMethod,
    deliveryFee: toMoney(row.deliveryFeeCzk),
    subtotal: toMoney(row.subtotalCzk),
    discount: toMoney(row.discountCzk),
    total: toMoney(row.totalCzk),
    pricingVersion: row.pricingVersion,
    payment: row.paymentMethod as PaymentMethod,
    status: row.status as OrderStatus,
    paidAt: row.paidAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    userId: row.userId,
    createdAt: row.createdAt,
  })

export const toNewsPost = (row: NewsRow): NewsPost =>
  NewsPost.rehydrate({
    id: row.id,
    title: row.title,
    body: row.body,
    tag: row.tag as NewsTag,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt,
    authorId: row.authorId,
  })

export const toField = (row: FieldRow): Field =>
  Field.rehydrate({
    id: row.id,
    name: row.name,
    varietyName: row.varietyName,
    areaM2: row.areaM2,
    status: row.status as FieldStatus,
    yieldKg: toKilograms(row.yieldKg),
    isEstimate: row.isEstimate,
    sortOrder: row.sortOrder,
  })

export const toHarvestEntry = (row: HarvestRow): HarvestEntry =>
  HarvestEntry.rehydrate({
    id: row.id,
    date: row.date,
    dug: toKilograms(row.dugKg),
    stock: toKilograms(row.stockKg),
  })

export const toStorageReading = (row: StorageRow): StorageReading =>
  StorageReading.rehydrate({
    id: row.id,
    recordedAt: row.recordedAt,
    temperatureC: decimalToNumber(row.temperatureC),
    humidityPct: row.humidityPct,
  })

export const toUser = (row: UserRow): User =>
  User.rehydrate({
    id: row.id,
    email: EmailAddress.of(row.email),
    name: row.name,
    role: row.role as UserRole,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    verifiedAt: row.verifiedAt,
    verificationToken: row.verificationToken,
    verificationExpiresAt: row.verificationExpiresAt,
    deactivatedAt: row.deactivatedAt,
    sessionsInvalidBefore: row.sessionsInvalidBefore,
  })
