import type { OrderConfirmationView } from '@/application/dto'
import { DELIVERY_LABELS, PAYMENT_LABELS } from '@/domain/enums'
import { NotFoundError } from '@/domain/errors'
import type { OrderPresenter } from '@/domain/ports/order-presentation'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { formatCzkPerKg, formatDateTimeCs, formatKg } from '@/shared/format'

export class GetOrderByToken {
  constructor(private readonly deps: { uow: UnitOfWork; presenter: OrderPresenter }) {}

  async execute(token: string): Promise<OrderConfirmationView> {
    const order = await this.deps.uow.repos.orders.findByPublicToken(token)
    if (!order) throw new NotFoundError('Rezervace')

    // Náhled sdílí aktuální šablony s přípravou pošty. Stav doručení tím neověřujeme.
    const [payment, mails] = await Promise.all([
      order.isCancelled ? null : this.deps.presenter.paymentInstructionFor(order),
      order.isCancelled ? [] : this.deps.presenter.mailPreviews(order),
    ])

    return {
      isCancelled: order.isCancelled,
      cancellationReason: order.cancellationReason,
      code: order.code,
      createdAtLabel: formatDateTimeCs(order.createdAt),
      customerName: order.customer.name,
      customerEmail: order.customer.email.value,
      itemsLabel: order.itemsLabel,
      lines: order.items.map((item) => ({
        varietyId: item.varietyId,
        varietyName: item.varietyName,
        quantityLabel: formatKg(item.quantity),
        unitPriceLabel: `${formatCzkPerKg(item.unitPrice)}/kg`,
        lineTotalLabel: formatCzkPerKg(item.lineTotal),
      })),
      totalKgLabel: formatKg(order.totalKg),
      subtotalLabel: formatCzkPerKg(order.subtotal),
      discountLabel: order.discount.isZero() ? null : formatCzkPerKg(order.discount),
      deliveryFeeLabel: order.deliveryFee.isZero() ? 'zdarma' : formatCzkPerKg(order.deliveryFee),
      totalLabel: formatCzkPerKg(order.total),
      deliveryLabel: DELIVERY_LABELS[order.delivery],
      paymentLabel: PAYMENT_LABELS[order.payment],
      payment,
      mails: [...mails],
    }
  }
}
