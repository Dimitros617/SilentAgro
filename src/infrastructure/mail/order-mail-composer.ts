import type { Order } from '@/domain/entities'
import type { OrderPresenter } from '@/domain/ports/order-presentation'
import type { OrderMailComposer } from '@/domain/ports/order-delivery'
import type {
  DeliveryPolicy,
  FarmIdentity,
  MailMessage,
  PaymentInstruction,
  OrderMailPreview,
} from '@/domain/ports/services'
import {
  renderCustomerConfirmation,
  renderFarmerNotification,
  renderOrderCancelled,
} from '@/infrastructure/mail/templates'
import { tryRenderQrDataUrl, tryRenderQrPng } from '@/infrastructure/payment/qr-code'
import { type BankAccount, buildPaymentDetails } from '@/infrastructure/payment/spayd'

export interface OrderMailConfig {
  readonly farmerEmail: string
  readonly publicBaseUrl: string
}

/**
 * Připravuje obsah pro frontu i náhled na stránce potvrzení ze společných šablon.
 * Síťové odesílání zajišťuje samostatný worker.
 */
export class TemplateOrderMailComposer implements OrderMailComposer, OrderPresenter {
  constructor(
    private readonly deps: {
      bank: BankAccount
      farm: FarmIdentity
      delivery: DeliveryPolicy
      config: OrderMailConfig
    },
  ) {}

  private confirmationUrl(order: Order): string {
    return `${this.deps.config.publicBaseUrl}/rezervace/${order.publicToken}`
  }

  private adminUrl(): string {
    return `${this.deps.config.publicBaseUrl}/admin/objednavky`
  }

  async orderPlaced(order: Order): Promise<readonly MailMessage[]> {
    const payment = buildPaymentDetails(order, this.deps.bank, this.deps.delivery.holdDays)
    const qrPng = payment ? await tryRenderQrPng(payment.spayd) : null

    return [
      renderCustomerConfirmation({
        order,
        farm: this.deps.farm,
        delivery: this.deps.delivery,
        confirmationUrl: this.confirmationUrl(order),
        payment,
        qrPng,
      }),
      renderFarmerNotification({
        order,
        farm: this.deps.farm,
        farmerEmail: this.deps.config.farmerEmail,
        adminUrl: this.adminUrl(),
      }),
    ]
  }

  orderCancelled(order: Order, reason: string): MailMessage {
    return renderOrderCancelled({ order, farm: this.deps.farm, reason })
  }

  async paymentInstructionFor(order: Order): Promise<PaymentInstruction | null> {
    const payment = buildPaymentDetails(order, this.deps.bank, this.deps.delivery.holdDays)
    if (!payment) return null

    return {
      accountNumber: payment.accountNumber,
      iban: payment.iban,
      ibanFormatted: payment.ibanFormatted,
      amountLabel: payment.amountLabel,
      variableSymbol: payment.variableSymbol,
      recipientMessage: payment.recipientMessage,
      instruction: payment.instruction,
      qrDataUrl: await tryRenderQrDataUrl(payment.spayd),
    }
  }

  async mailPreviews(order: Order): Promise<OrderMailPreview[]> {
    const payment = buildPaymentDetails(order, this.deps.bank, this.deps.delivery.holdDays)

    const customer = renderCustomerConfirmation({
      order,
      farm: this.deps.farm,
      delivery: this.deps.delivery,
      confirmationUrl: this.confirmationUrl(order),
      payment,
      qrPng: null,
    })
    const farmer = renderFarmerNotification({
      order,
      farm: this.deps.farm,
      farmerEmail: this.deps.config.farmerEmail,
      adminUrl: this.adminUrl(),
    })

    return [
      { kind: 'E-mail zákazníkovi', to: customer.to, subject: customer.subject, body: customer.text },
      { kind: 'E-mail farmáři', to: farmer.to, subject: farmer.subject, body: farmer.text },
    ]
  }
}
