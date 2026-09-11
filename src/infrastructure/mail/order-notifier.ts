import type { Order, User } from '@/domain/entities'
import type { OrderNotifier, OrderPresenter, UserNotifier } from '@/domain/ports/order-presentation'
import type {
  DeliveryPolicy,
  FarmIdentity,
  Logger,
  Mailer,
  PaymentInstruction,
  SentMailPreview,
} from '@/domain/ports/services'
import {
  renderCustomerConfirmation,
  renderFarmerMessage,
  renderFarmerNotification,
  renderOrderCancelled,
  renderVerification,
} from '@/infrastructure/mail/templates'
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
export class MailOrderNotifier implements OrderNotifier, OrderPresenter, UserNotifier {
  constructor(
    private readonly deps: {
      mailer: Mailer
      logger: Logger
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

  async notifyOrderPlaced(order: Order): Promise<void> {
    const payment = buildPaymentDetails(order, this.deps.bank)
    const qrPng = payment ? await tryRenderQrPng(payment.spayd) : null

    const messages = [
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

    // Obě zprávy najednou, ne za sebou. Sekvenčně by nedostupný SMTP server stál
    // dva timeouty a rezervace by tak dlouho nevrátila odpověď.
    //
    // Každá se ošetřuje zvlášť: když zákazníkova adresa odmítá poštu, farmář se
    // o objednávce musí dozvědět stejně.
    await Promise.all(
      messages.map((message) =>
        this.trySend(message.to, () => this.deps.mailer.send(message), order.code),
      ),
    )
  }

  async notifyOrderCancelled(order: Order, reason: string): Promise<void> {
    const message = renderOrderCancelled({ order, farm: this.deps.farm, reason })
    await this.trySend(message.to, () => this.deps.mailer.send(message), order.code)
  }

  /**
   * Ověřovací zpráva a zpráva od farmáře výjimku **nepolykají**.
   *
   * U potvrzení objednávky je pravdou sklad a e-mail je notifikace navíc. Tady je
   * ale zpráva celý účel akce — když se neodešle, farmář to musí vědět.
   */
  async sendVerification(user: User, verificationUrl: string): Promise<void> {
    await this.deps.mailer.send(
      renderVerification(this.deps.farm, user.name, user.email.value, verificationUrl),
    )
  }

  async sendMessage(user: User, subject: string, body: string): Promise<void> {
    await this.deps.mailer.send(
      renderFarmerMessage(this.deps.farm, user.name, user.email.value, subject, body),
    )
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
