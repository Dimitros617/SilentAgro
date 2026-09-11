import type { OrderConfirmationView } from '@/application/dto'
import { DELIVERY_LABELS, PAYMENT_LABELS } from '@/domain/enums'
import { NotFoundError } from '@/domain/errors'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { renderCustomerConfirmation, renderFarmerNotification } from '@/infrastructure/mail/templates'
import { tryRenderQrDataUrl } from '@/infrastructure/payment/qr-code'
import { type BankAccount, buildPaymentDetails } from '@/infrastructure/payment/spayd'
import { formatCzkPerKg, formatDateTimeCs, formatKg } from '@/shared/format'

export class GetOrderByToken {
  constructor(
    private readonly deps: {
      uow: UnitOfWork
      bank: BankAccount
      config: { farmerEmail: string; publicBaseUrl: string }
    },
  ) {}

  async execute(token: string): Promise<OrderConfirmationView> {
    const order = await this.deps.uow.repos.orders.findByPublicToken(token)
    if (!order) throw new NotFoundError('Rezervace')

    const payment = buildPaymentDetails(order, this.deps.bank)
    const qrDataUrl = payment ? await tryRenderQrDataUrl(payment.spayd) : null
    const confirmationUrl = `${this.deps.config.publicBaseUrl}/rezervace/${order.publicToken}`

    // Náhled odeslaných e-mailů se skládá ze stejných šablon, které je skutečně odeslaly.
    // Kdyby se text psal na stránce znovu, časem by se s e-mailem rozešel.
    const customerMail = renderCustomerConfirmation({
      order,
      confirmationUrl,
      payment,
      qrPng: null,
    })
    const farmerMail = renderFarmerNotification({
      order,
      farmerEmail: this.deps.config.farmerEmail,
      adminUrl: `${this.deps.config.publicBaseUrl}/admin/objednavky`,
    })

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
      payment: payment
        ? {
            accountNumber: payment.accountNumber,
            ibanFormatted: payment.ibanFormatted,
            amountLabel: payment.amountLabel,
            variableSymbol: payment.variableSymbol,
            recipientMessage: payment.recipientMessage,
            instruction: payment.instruction,
            qrDataUrl,
          }
        : null,
      mails: [
        {
          kind: 'E-mail zákazníkovi',
          to: customerMail.to,
          subject: customerMail.subject,
          body: customerMail.text,
        },
        {
          kind: 'E-mail farmáři',
          to: farmerMail.to,
          subject: farmerMail.subject,
          body: farmerMail.text,
        },
      ],
    }
  }
}
