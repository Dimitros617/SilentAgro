import type { Order } from '@/domain/entities/order'
import type { MailMessage } from './services'

/** Příprava zpráv bez síťového odesílání. Zprávy se uloží spolu s objednávkou. */
export interface OrderMailComposer {
  orderPlaced(order: Order): Promise<readonly MailMessage[]>
  orderCancelled(order: Order, reason: string): MailMessage
}

export interface ReservationRequestRepository {
  /** Zamkne klíč pokusu, odmítne jiný obsah a vrátí ID již dokončené objednávky. */
  claim(key: string, content: string): Promise<number | null>
  complete(key: string, orderId: number): Promise<void>
}

export interface MailOutboxRepository {
  enqueue(messageKey: string, message: MailMessage): Promise<void>
}

export interface MailLease {
  readonly id: number
  readonly leaseToken: string
  readonly attempts: number
}

export interface MailJob extends MailLease { readonly message: MailMessage }

/** Worker drží krátký pronájem záznamu; SMTP neběží uvnitř DB transakce. */
export interface MailQueue {
  claim(): Promise<MailJob | null>
  markSent(job: MailJob): Promise<void>
  retryLater(job: MailLease, error: string): Promise<void>
}
