import type { Order, User } from '@/domain/entities'
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
  /** Omluvný e-mail zákazníkovi s důvodem, proč byla rezervace zrušena. */
  notifyOrderCancelled(order: Order, reason: string): Promise<void>
}

/**
 * Zprávy směřované na účet, ne na objednávku.
 *
 * Na rozdíl od potvrzení objednávky se tyhle chyby **nepolykají**: když se farmáři
 * neodešle zpráva zákazníkovi, musí se to dozvědět — na rozdíl od potvrzení, kde
 * je pravdou sklad a e-mail jen notifikace.
 */
export interface UserNotifier {
  sendVerification(user: User, verificationUrl: string): Promise<void>
  sendMessage(user: User, subject: string, body: string): Promise<void>
}

/**
 * Podklady pro stránku potvrzení: platební pokyn a náhled toho, co bylo odesláno.
 */
export interface OrderPresenter {
  paymentInstructionFor(order: Order): Promise<PaymentInstruction | null>
  sentMailPreviews(order: Order): Promise<SentMailPreview[]>
}
