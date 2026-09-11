import type { Order } from '@/domain/entities'
import type { PaymentInstruction, SentMailPreview } from '@/domain/ports/services'

/**
 * Odeslání notifikací o přijaté objednávce.
 *
 * Use-case zná jen tuhle jednu metodu. Že se pod ní skládají dva e-maily, generuje se
 * QR kód a řeší se, co dělat při výpadku SMTP, je věc infrastruktury — rezervace by se
 * kvůli změně formátu pošty neměla vůbec dotknout.
 */
export interface OrderNotifier {
  notifyOrderPlaced(order: Order): Promise<void>
}

/**
 * Podklady pro stránku potvrzení: platební pokyn a náhled toho, co bylo odesláno.
 */
export interface OrderPresenter {
  paymentInstructionFor(order: Order): Promise<PaymentInstruction | null>
  sentMailPreviews(order: Order): Promise<SentMailPreview[]>
}
