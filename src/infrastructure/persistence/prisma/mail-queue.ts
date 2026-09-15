import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { MailJob, MailLease, MailQueue } from '@/domain/ports/order-delivery'
import { decodeMail } from '@/infrastructure/mail/mail-payload'

export class PrismaMailQueue implements MailQueue {
  constructor(private readonly db: PrismaClient) {}

  async claim(): Promise<MailJob | null> {
    const row = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM mail_outbox
        WHERE sent_at IS NULL AND available_at <= CURRENT_TIMESTAMP(3)
          AND (locked_until IS NULL OR locked_until <= CURRENT_TIMESTAMP(3))
        ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
      `
      const first = rows[0]
      if (!first) return null
      const leaseToken = randomUUID()
      await tx.$executeRaw`
        UPDATE mail_outbox SET lease_token = ${leaseToken},
          locked_until = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 2 MINUTE), attempts = attempts + 1
        WHERE id = ${first.id}
      `
      return tx.mailOutbox.findUniqueOrThrow({ where: { id: first.id } })
    })
    if (!row) return null
    if (!row.leaseToken) throw new Error('Zpráva nemá přidělený pronájem')
    const messageId = `<${createHash('sha256').update(row.messageKey).digest('hex')}@silentagro.local>`
    const lease = { id: row.id, leaseToken: row.leaseToken, attempts: row.attempts }
    try {
      return { ...lease, message: decodeMail(row.payload, messageId) }
    } catch {
      // Poškozený záznam nesmí vytvořit horkou smyčku ani blokovat další zprávy.
      await this.retryLater(lease, 'Neplatný obsah uložené zprávy')
      throw new Error(`Neplatný obsah zprávy ${row.id}`)
    }
  }

  async markSent(job: MailJob): Promise<void> {
    await this.db.$executeRaw`
      UPDATE mail_outbox SET sent_at = CURRENT_TIMESTAMP(3), locked_until = NULL,
        lease_token = NULL, last_error = NULL
      WHERE id = ${job.id} AND lease_token = ${job.leaseToken} AND sent_at IS NULL
    `
  }

  async retryLater(job: MailLease, error: string): Promise<void> {
    const delaySeconds = Math.min(3600, 30 * 2 ** Math.min(job.attempts - 1, 7))
    const detail = error.slice(0, 1000)
    await this.db.$executeRaw`
      UPDATE mail_outbox SET available_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ${delaySeconds} SECOND),
        locked_until = NULL, lease_token = NULL, last_error = ${detail}
      WHERE id = ${job.id} AND lease_token = ${job.leaseToken} AND sent_at IS NULL
    `
  }
}
