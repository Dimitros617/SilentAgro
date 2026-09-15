import type { MailOutboxRepository } from '@/domain/ports/order-delivery'
import type { MailMessage } from '@/domain/ports/services'
import { encodeMail } from '@/infrastructure/mail/mail-payload'
import type { PrismaLike } from './types'
import { requireTransaction } from './transaction'

export class PrismaMailOutboxRepository implements MailOutboxRepository {
  constructor(private readonly db: PrismaLike) {}

  async enqueue(messageKey: string, message: MailMessage): Promise<void> {
    requireTransaction(this.db)
    await this.db.mailOutbox.create({ data: { messageKey, payload: encodeMail(message) } })
  }
}
