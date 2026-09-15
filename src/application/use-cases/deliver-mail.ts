import type { MailQueue } from '@/domain/ports/order-delivery'
import type { Logger, Mailer } from '@/domain/ports/services'

export class DeliverMail {
  constructor(private readonly deps: { queue: MailQueue; mailer: Mailer; logger: Logger }) {}

  async execute(): Promise<boolean> {
    const job = await this.deps.queue.claim()
    if (!job) return false

    try {
      await this.deps.mailer.send(job.message)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      // Log vznikne i tehdy, když následně selže zápis nového pokusu do databáze.
      this.deps.logger.error('Odeslání zprávy selhalo; plánuje se další pokus', {
        id: job.id, attempts: job.attempts, error: detail,
      })
      await this.deps.queue.retryLater(job, detail)
      return true
    }

    try {
      await this.deps.queue.markSent(job)
    } catch (error) {
      // Odesílatel zprávu už přijal. Pronájem neuvolňujeme jako po chybě odeslání;
      // po jeho vypršení se uplatní běžná obnova fronty, která může zprávu zopakovat.
      this.deps.logger.error('Odesílatel zprávu přijal, ale zápis potvrzení do fronty selhal', {
        id: job.id,
        attempts: job.attempts,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }

    return true
  }
}
