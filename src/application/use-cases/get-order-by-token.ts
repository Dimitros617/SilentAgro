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

    // Náhled se skládá z týchž šablon, které zprávy skutečně odeslaly. Kdyby se text
    // na stránce formuloval podruhé, časem by se s e-mailem rozešel.
    const [payment, mails] = await Promise.all([
      this.deps.presenter.paymentInstructionFor(order),
      this.deps.presenter.sentMailPreviews(order),
    ])

    return {
      code: order.code,
      createdAtLabel: formatDateTimeCs(order.createdAt),
      customerName: order.customer.name,
      customerEmail: order.customer.email.value,
      itemsLabel: order.itemsLabel,
      lines: order.items.map((item) => ({
        varietyName: item.varietyName,
        quantityLabel: formatKg(item.quantity),
        unitPriceLabel: `${formatCzkPerKg(item.unitPrice)}/kg`,
        lineTotalLabel: formatCzkPerKg(item.lineTotal),
      })),
      totalKgLabel: formatKg(order.totalKg),
      subtotalLabel: formatCzkPerKg(order.subtotal),
      deliveryFeeLabel: order.deliveryFee.isZero() ? 'zdarma' : formatCzkPerKg(order.deliveryFee),
      totalLabel: formatCzkPerKg(order.total),
      deliveryLabel: DELIVERY_LABELS[order.delivery],
      paymentLabel: PAYMENT_LABELS[order.payment],
      payment,
      mails: [...mails],
    }
  }
}
