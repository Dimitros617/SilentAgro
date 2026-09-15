/**
 * Výčty sdílené s databází. Hodnoty musí doslova odpovídat enumům v `prisma/schema.prisma` —
 * mapují se přímo, bez převodní tabulky. Popisky jsou oddělené, aby přejmenování textu
 * v UI nikdy neznamenalo migraci databáze.
 */

export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  FARMER: 'FARMER',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const OrderStatus = {
  NEW: 'NEW',
  READY: 'READY',
  COLLECTED: 'COLLECTED',
} as const
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]

export const DeliveryMethod = {
  PICKUP: 'PICKUP',
  LOCAL_DELIVERY: 'LOCAL_DELIVERY',
} as const
export type DeliveryMethod = (typeof DeliveryMethod)[keyof typeof DeliveryMethod]

export const PaymentMethod = {
  CASH: 'CASH',
  BANK_TRANSFER: 'BANK_TRANSFER',
  QR_CODE: 'QR_CODE',
} as const
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod]

export const NewsTag = {
  HARVEST: 'HARVEST',
  STORAGE: 'STORAGE',
  FIELD: 'FIELD',
} as const
export type NewsTag = (typeof NewsTag)[keyof typeof NewsTag]

export const FieldStatus = {
  GROWING: 'GROWING',
  HARVESTING: 'HARVESTING',
  HARVESTED: 'HARVESTED',
} as const
export type FieldStatus = (typeof FieldStatus)[keyof typeof FieldStatus]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Nová',
  READY: 'Připravena',
  COLLECTED: 'Vydána',
}

/** Cyklus tlačítka stavu v administraci: Nová → Připravena → Vydána → Nová. */
export const NEXT_ORDER_STATUS: Record<OrderStatus, OrderStatus> = {
  NEW: 'READY',
  READY: 'COLLECTED',
  COLLECTED: 'NEW',
}

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: 'Osobní odběr na farmě',
  LOCAL_DELIVERY: 'Rozvoz po okolí',
}

/** Zkrácený tvar do souhrnu a tabulek, kde se nevejde celý popisek. */
export const DELIVERY_SHORT_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: 'Osobní odběr',
  LOCAL_DELIVERY: 'Rozvoz',
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Hotově při převzetí',
  BANK_TRANSFER: 'Převodem na účet',
  QR_CODE: 'QR platba',
}

export const NEWS_TAG_LABELS: Record<NewsTag, string> = {
  HARVEST: 'Sklizeň',
  STORAGE: 'Sklad',
  FIELD: 'Pole',
}

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  GROWING: 'Roste',
  HARVESTING: 'Sklízí se',
  HARVESTED: 'Vykopáno',
}

/** Platba, u které zákazník posílá peníze předem a potřebuje číslo účtu a QR kód. */
export const requiresTransfer = (payment: PaymentMethod): boolean =>
  payment === PaymentMethod.BANK_TRANSFER || payment === PaymentMethod.QR_CODE
