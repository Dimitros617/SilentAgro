import type { Order } from '@/domain/entities'
import type { OrderNotifier, OrderPresenter } from '@/domain/ports/order-presentation'
import type { Logger, Mailer, PaymentInstruction, SentMailPreview } from '@/domain/ports/services'
import { renderCustomerConfirmation, renderFarmerNotification } from '@/infrastructure/mail/templates'
import { tryRenderQrDataUrl, tryRenderQrPng } from '@/infrastructure/payment/qr-code'
import { type BankAccount, buildPaymentDetails } from '@/infrastructure/payment/spayd'

export interface OrderMailConfig {
  readonly farmerEmail: string
  readonly publicBaseUrl: string
}

/**
 * Skládá a odesílá obě zprávy o nové objednávce a umí z týchž šablon vyrobit náhled
 * pro stránku potvrzení. Náhled se **nepíše zvlášť** — kdyby se text na stránce
 * formuloval podruhé, časem by se s odeslaným e-mailem rozešel.
 */
export class MailOrderNotifier implements OrderNotifier, OrderPresenter {
  constructor(
    private readonly deps: {
      mailer: Mailer
      logger: Logger
      bank: BankAccount
      config: OrderMailConfig
    },
  ) {}

  private confirmationUrl(order: Order): string {
    return `${this.deps.config.publicBaseUrl}/rezervace/${order.publicToken}`
  }

  private adminUrl(): string {
    return `${this.deps.config.publicBaseUrl}/admin/objednavky`
  }

  async notifyOrderPlaced(order: Order): Promise<void> {
    const payment = buildPaymentDetails(order, this.deps.bank)
    const qrPng = payment ? await tryRenderQrPng(payment.spayd) : null

    const messages = [
      renderCustomerConfirmation({
        order,
        confirmationUrl: this.confirmationUrl(order),
        payment,
        qrPng,
      }),
      renderFarmerNotification({
        order,
        farmerEmail: this.deps.config.farmerEmail,
        adminUrl: this.adminUrl(),
      }),
    ]

    // Každá zpráva zvlášť: když zákazníkova adresa odmítá poštu, farmář se
    // o objednávce musí dozvědět stejně.
    for (const message of messages) {
      await this.trySend(message.to, () => this.deps.mailer.send(message), order.code)
    }
  }

  async paymentInstructionFor(order: Order): Promise<PaymentInstruction | null> {
    const payment = buildPaymentDetails(order, this.deps.bank)
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

  async sentMailPreviews(order: Order): Promise<SentMailPreview[]> {
    const payment = buildPaymentDetails(order, this.deps.bank)

    const customer = renderCustomerConfirmation({
      order,
      confirmationUrl: this.confirmationUrl(order),
      payment,
      qrPng: null,
    })
    const farmer = renderFarmerNotification({
      order,
      farmerEmail: this.deps.config.farmerEmail,
      adminUrl: this.adminUrl(),
    })

    return [
      { kind: 'E-mail zákazníkovi', to: customer.to, subject: customer.subject, body: customer.text },
      { kind: 'E-mail farmáři', to: farmer.to, subject: farmer.subject, body: farmer.text },
    ]
  }

  /** Výpadek SMTP nesmí zrušit platnou rezervaci — sklad je pravda, mail je notifikace. */
  private async trySend(recipient: string, send: () => Promise<void>, orderCode: string) {
    try {
      await send()
    } catch (error) {
      this.deps.logger.error('Odeslání potvrzení selhalo, objednávka zůstává platná', {
        orderCode,
        recipient,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
