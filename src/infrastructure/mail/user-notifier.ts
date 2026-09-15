import type { User } from '@/domain/entities'
import type { UserNotifier } from '@/domain/ports/order-presentation'
import type { FarmIdentity, Mailer } from '@/domain/ports/services'
import { renderFarmerMessage, renderVerification } from './templates'

/** Přímé zprávy účtu vracejí chybu odeslání volajícímu. */
export class MailUserNotifier implements UserNotifier {
  constructor(private readonly deps: { mailer: Mailer; farm: FarmIdentity }) {}

  async sendVerification(user: User, url: string): Promise<void> {
    await this.deps.mailer.send(renderVerification(this.deps.farm, user.name, user.email.value, url))
  }

  async sendMessage(user: User, subject: string, body: string): Promise<void> {
    await this.deps.mailer.send(renderFarmerMessage(this.deps.farm, user.name, user.email.value, subject, body))
  }
}
