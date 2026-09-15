import nodemailer, { type Transporter } from 'nodemailer'
import type { MailMessage, Mailer } from '@/domain/ports/services'
import type { MailDriver } from '@/infrastructure/config/env'

export interface MailerConfig {
  readonly driver: MailDriver
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user: string | undefined
  readonly password: string | undefined
  readonly from: string
}

/** Odesílatel pro testy a CI: zprávy si drží v paměti a nikam je neposílá. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }

  clear(): void {
    this.sent.length = 0
  }
}

export class NodemailerMailer implements Mailer {
  private readonly transport: Transporter

  constructor(
    config: Omit<MailerConfig, 'driver'> & { auth: { user: string; pass: string } | undefined },
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      // Omezené čekání uvolní worker pro další zprávy a ukončí i ruční odeslání
      // z administrace, když SMTP server není dostupný.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
      // Prázdné `auth` shodí spojení na serverech, které přihlášení nevyžadují
      // (typicky Mailpit ve vývoji), proto se klíč přidává jen když je co poslat.
      ...(config.auth ? { auth: config.auth } : {}),
    })
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      ...(message.messageId ? { messageId: message.messageId } : {}),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments && message.attachments.length > 0
        ? {
            attachments: message.attachments.map((attachment) => ({
              filename: attachment.filename,
              content: Buffer.from(attachment.content),
              contentType: attachment.contentType,
              ...(attachment.cid
                ? { cid: attachment.cid, contentDisposition: 'inline' as const }
                : {}),
            })),
          }
        : {}),
    })
  }
}

/**
 * Vybere implementaci podle konfigurace. Zbytek aplikace zná jen port `Mailer`,
 * takže o driveru neví — přepnutí mezi Mailpitem a ostrým SMTP je věc prostředí,
 * ne kódu.
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.driver === 'memory') return new MemoryMailer()

  // Mailpit přihlášení ani TLS nepoužívá; kdyby konfigurace nějaké nesla, ignorují se,
  // aby se vývojová sestava nedala rozbít zapomenutými produkčními hodnotami.
  const auth =
    config.driver === 'smtp' && config.user
      ? { user: config.user, pass: config.password ?? '' }
      : undefined

  return new NodemailerMailer(
    {
      host: config.host,
      port: config.port,
      secure: config.driver === 'smtp' ? config.secure : false,
      user: config.user,
      password: config.password,
      from: config.from,
      auth,
    },
    config.from,
  )
}

/**
 * Popis pro log při startu. Je to samostatná funkce, ne metoda na odesílateli —
 * port `Mailer` ji nedeklaruje a přidávat ji tam jen kvůli logu by znamenalo,
 * že o ní musí vědět i doména.
 */
export function describeMailer(config: MailerConfig): string {
  if (config.driver === 'memory') return 'memory (nic se neodesílá)'

  const auth =
    config.driver === 'smtp' && config.user
      ? `přihlášen jako ${config.user}`
      : 'bez přihlášení'

  return `${config.driver}://${config.host}:${config.port} (${auth})`
}
