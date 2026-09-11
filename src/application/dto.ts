import type { DeliveryMethod, FieldStatus, NewsTag, OrderStatus, PaymentMethod } from '@/domain/enums'

/**
 * Tvary, které use-case vrací prezentační vrstvě.
 *
 * Jsou to prostá data, ne entity: stránky jsou serverové komponenty a entita s metodami
 * by se nedala poslat přes hranici serializace do klientské komponenty. Formátování
 * proto proběhne jednou na serveru a do prohlížeče jde hotový text.
 */

export interface VarietyView {
  id: number
  slug: string
  name: string
  tag: string
  description: string
  colorHex: string
  priceCzk: number
  priceLabel: string
  stockKg: number
  stockLabel: string
  fillPercent: number
  available: boolean
}

export interface BinView {
  name: string
  colorHex: string
  percent: number
  percentLabel: string
  kgLabel: string
}

export interface KpiView {
  label: string
  value: string
  delta: string
  tone: 'green' | 'muted'
}

export interface HarvestPointView {
  dateLabel: string
  dugKg: number
  stockKg: number
}

export interface FieldView {
  id: number
  name: string
  varietyName: string
  areaLabel: string
  status: FieldStatus
  statusLabel: string
  yieldLabel: string
}

export interface StockOverview {
  totalKg: number
  totalKgLabel: string
  bins: BinView[]
  kpis: KpiView[]
  harvest: HarvestPointView[]
  fields: FieldView[]
  updatedAtLabel: string
}

export interface NewsView {
  id: number
  title: string
  body: string
  tag: NewsTag
  tagLabel: string
  dateLabel: string
  imageUrl: string | null
}

export interface OrderLineView {
  varietyName: string
  quantityLabel: string
  unitPriceLabel: string
  lineTotalLabel: string
}

export interface PaymentView {
  accountNumber: string
  ibanFormatted: string
  amountLabel: string
  variableSymbol: string
  recipientMessage: string
  instruction: string
  /** `data:` URI s QR kódem, nebo `null`, když se nepodařilo vykreslit. */
  qrDataUrl: string | null
}

export interface MailPreview {
  kind: string
  to: string
  subject: string
  body: string
}

export interface OrderConfirmationView {
  code: string
  createdAtLabel: string
  customerName: string
  customerEmail: string
  itemsLabel: string
  lines: OrderLineView[]
  totalKgLabel: string
  subtotalLabel: string
  deliveryFeeLabel: string
  totalLabel: string
  deliveryLabel: string
  paymentLabel: string
  payment: PaymentView | null
  mails: MailPreview[]
}

export interface OrderRowView {
  id: number
  code: string
  customerName: string
  customerEmail: string
  customerPhone: string
  note: string
  itemsLabel: string
  deliveryLabel: string
  paymentLabel: string
  totalLabel: string
  status: OrderStatus
  statusLabel: string
  requiresTransfer: boolean
  isPaid: boolean
  paidAtLabel: string | null
  createdAtLabel: string
}

export interface AdminOverview {
  kpis: KpiView[]
  bins: BinView[]
  harvest: HarvestPointView[]
  harvestSummary: string
  harvestLast: string
}

export interface AdminVarietyView extends VarietyView {
  capacityKg: number
  isActive: boolean
}

export interface UpsertVarietyInput {
  id: number | null
  name: string
  tag: string
  description: string
  colorHex: string
  priceCzk: number
  stockKg: number
  capacityKg: number
}

export interface PublishNewsInput {
  title: string
  body: string
  tag: NewsTag
  imageUrl: string | null
  authorId: number
}

export interface AuthResult {
  userId: number
  name: string
  email: string
  role: 'CUSTOMER' | 'FARMER'
}

export type { DeliveryMethod, PaymentMethod }
