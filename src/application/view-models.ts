import type { AdminVarietyView, BinView, FieldView, HarvestPointView, NewsView, OrderRowView, UserRowView, VarietyView } from '@/application/dto'
import type { Field, HarvestEntry, NewsPost, Order, User, Variety } from '@/domain/entities'
import { DELIVERY_SHORT_LABELS, FIELD_STATUS_LABELS, NEWS_TAG_LABELS, ORDER_STATUS_LABELS, PAYMENT_LABELS, UserRole, requiresTransfer } from '@/domain/enums'
import type { UserOrderStats } from '@/domain/ports/repositories'
import { Money } from '@/domain/value-objects/money'
import { formatCzk, formatCzkPerKg, formatDateCs, formatDateTimeCs, formatKg, formatArea } from '@/shared/format'

export function toOrderRow(order: Order): OrderRowView {
  return {
    id: order.id,
    code: order.code,
    customerName: order.customer.name,
    customerEmail: order.customer.email.value,
    customerPhone: order.customer.phone,
    note: order.customer.note,
    itemsLabel: order.itemsLabel,
    deliveryLabel: DELIVERY_SHORT_LABELS[order.delivery],
    paymentLabel: PAYMENT_LABELS[order.payment],
    totalLabel: formatCzkPerKg(order.total),
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    requiresTransfer: requiresTransfer(order.payment),
    isPaid: order.isPaid,
    paidAtLabel: order.paidAt ? formatDateCs(order.paidAt) : null,
    isCancelled: order.isCancelled,
    cancelledAtLabel: order.cancelledAt ? formatDateCs(order.cancelledAt) : null,
    cancellationReason: order.cancellationReason,
    createdAtLabel: formatDateTimeCs(order.createdAt),
  }
}

export function toVarietyView(variety: Variety): VarietyView {
  return {
    id: variety.id,
    slug: variety.slug,
    name: variety.name,
    tag: variety.tag,
    description: variety.description,
    colorHex: variety.color.value,
    priceCzk: variety.pricePerKg.czk,
    priceLabel: formatCzkPerKg(variety.pricePerKg),
    stockKg: variety.stock.value,
    stockLabel: variety.isSoldOut() ? 'vyprodáno' : formatKg(variety.stock),
    capacityKg: variety.capacity.value,
    fillPercent: variety.fillPercent(),
    available: !variety.isSoldOut(),
  }
}

/**
 * Zásobníky se škálují proti **největší kapacitě mezi odrůdami**, ne proti vlastní.
 * Sloupce v grafu se tak dají porovnávat mezi sebou — na rozdíl od `VarietyView.fillPercent`,
 * který odpovídá na jinou otázku: jak je plný tenhle konkrétní zásobník.
 */
export function toBins(varieties: Variety[]): BinView[] {
  const maxCapacity = Math.max(1, ...varieties.map((v) => v.capacity.value))

  return varieties.map((variety) => {
    const percent = Math.max(0, Math.min(100, Math.round((variety.stock.value / maxCapacity) * 100)))
    return {
      id: variety.id,
      name: variety.name,
      colorHex: variety.color.value,
      percent,
      percentLabel: `${percent} %`,
      kgLabel: formatKg(variety.stock),
    }
  })
}

export function toUserRow(
  user: User,
  stats: UserOrderStats | null | undefined,
): UserRowView {
  return {
    id: user.id,
    name: user.name,
    email: user.email.value,
    role: user.role,
    isFarmer: user.role === UserRole.FARMER,
    isVerified: user.isVerified,
    verifiedAtLabel: user.verifiedAt ? formatDateCs(user.verifiedAt) : null,
    isActive: user.isActive,
    deactivatedAtLabel: user.deactivatedAt ? formatDateCs(user.deactivatedAt) : null,
    registeredAtLabel: formatDateCs(user.createdAt),
    orderCount: stats?.orderCount ?? 0,
    cancelledCount: stats?.cancelledCount ?? 0,
    totalSpentLabel: formatCzk(stats?.totalSpent ?? Money.zero()),
    lastOrderAtLabel: stats?.lastOrderAt ? formatDateTimeCs(stats.lastOrderAt) : null,
  }
}

export function toAdminVarietyView(variety: Variety): AdminVarietyView {
  return { ...toVarietyView(variety), isActive: variety.isActive }
}

export function toNewsView(post: NewsPost): NewsView {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    tag: post.tag,
    tagLabel: NEWS_TAG_LABELS[post.tag],
    dateLabel: formatDateCs(post.publishedAt),
    imageUrl: post.imageUrl,
  }
}

export function toHarvestPoint(entry: HarvestEntry): HarvestPointView {
  return {
    dateLabel: new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(entry.date),
    dugKg: entry.dug.value,
    stockKg: entry.stock.value,
  }
}

export function toFieldView(field: Field): FieldView {
  return {
    id: field.id,
    name: field.name,
    varietyName: field.varietyName,
    areaLabel: formatArea(field.areaM2),
    status: field.status,
    statusLabel: FIELD_STATUS_LABELS[field.status],
    yieldLabel: `${field.isEstimate ? '~' : ''}${formatKg(field.yieldKg)}`,
  }
}
