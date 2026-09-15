import type { Order, User } from '@/domain/entities'
import type { PaymentInstruction, OrderMailPreview } from '@/domain/ports/services'

/**
 * Zprávy směřované na účet, ne na objednávku.
 *
 * Odesílá přímo; při chybě dostane volající informaci o neúspěchu.
 * Potvrzení a zrušení objednávky mají samostatnou trvalou frontu.
 */
export interface UserNotifier {
  sendVerification(user: User, verificationUrl: string): Promise<void>
  sendMessage(user: User, subject: string, body: string): Promise<void>
}

/**
 * Podklady pro stránku potvrzení: platební pokyn a náhled zpráv z aktuálních šablon.
 * Náhled nedokládá stav doručení ani nenahrazuje uložený obsah ve frontě.
 */
export interface OrderPresenter {
  paymentInstructionFor(order: Order): Promise<PaymentInstruction | null>
  mailPreviews(order: Order): Promise<OrderMailPreview[]>
}
