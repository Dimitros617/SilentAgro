import 'server-only'
import { randomBytes } from 'node:crypto'
import type { OrderNotifier, OrderPresenter, UserNotifier } from '@/domain/ports/order-presentation'
import type { Clock, Logger, Mailer, PasswordHasher, TokenGenerator, TokenService } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { Iban } from '@/domain/value-objects/iban'
import { BcryptPasswordHasher } from '@/infrastructure/auth/bcrypt-password-hasher'
import { JoseTokenService } from '@/infrastructure/auth/jose-token-service'
import { getEnv } from '@/infrastructure/config/env'
import { createMailer, describeMailer } from '@/infrastructure/mail/create-mailer'
import { MailOrderNotifier } from '@/infrastructure/mail/order-notifier'
import { prisma } from '@/infrastructure/persistence/prisma/client'
import { PrismaUnitOfWork } from '@/infrastructure/persistence/prisma/unit-of-work'
import { TokenBucket } from '@/infrastructure/rate-limit/token-bucket'
import type { BankAccount } from '@/infrastructure/payment/spayd'

export interface Container {
  readonly uow: UnitOfWork
  readonly mailer: Mailer
  readonly notifier: OrderNotifier
  readonly presenter: OrderPresenter
  readonly userNotifier: UserNotifier
  readonly hasher: PasswordHasher
  readonly tokens: TokenService
  readonly clock: Clock
  readonly tokenGenerator: TokenGenerator
  readonly logger: Logger
  readonly bank: BankAccount
  readonly config: {
    readonly farmerEmail: string
    readonly publicBaseUrl: string
    readonly uploadDir: string
    readonly trustProxy: boolean
  }
  readonly limiters: {
    readonly login: TokenBucket
    readonly register: TokenBucket
    readonly order: TokenBucket
  }
}

const systemClock: Clock = { now: () => new Date() }

const consoleLogger: Logger = {
  info: (message, meta) => console.info(`[silentagro] ${message}`, meta ?? ''),
  warn: (message, meta) => console.warn(`[silentagro] ${message}`, meta ?? ''),
  error: (message, meta) => console.error(`[silentagro] ${message}`, meta ?? ''),
}

/** 24 bajtů z kryptografického generátoru — 192 bitů, nevyjmenovatelné. */
const tokenGenerator: TokenGenerator = {
  publicToken: () => randomBytes(24).toString('base64url'),
}

function build(): Container {
  const env = getEnv()

  const mailerConfig = {
    driver: env.MAIL_DRIVER,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM,
  }

  consoleLogger.info(`Pošta: ${describeMailer(mailerConfig)}`)

  const mailer = createMailer(mailerConfig)
  const bank = {
    iban: Iban.of(env.BANK_ACCOUNT_IBAN),
    accountNumber: env.BANK_ACCOUNT_NUMBER,
  }
  const notifier = new MailOrderNotifier({
    mailer,
    logger: consoleLogger,
    bank,
    config: { farmerEmail: env.FARMER_EMAIL, publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, '') },
  })

  return {
    uow: new PrismaUnitOfWork(prisma),
    mailer,
    notifier,
    presenter: notifier,
    userNotifier: notifier,
    hasher: new BcryptPasswordHasher(),
    tokens: new JoseTokenService(env.AUTH_SECRET),
    clock: systemClock,
    tokenGenerator,
    logger: consoleLogger,
    bank,
    config: {
      farmerEmail: env.FARMER_EMAIL,
      publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
      uploadDir: env.UPLOAD_DIR,
      trustProxy: env.TRUST_PROXY,
    },
    limiters: {
      // 5 pokusů, plná kapacita zpět za 15 minut
      login: new TokenBucket(5, 5 / (15 * 60), systemClock),
      register: new TokenBucket(3, 3 / (60 * 60), systemClock),
      order: new TokenBucket(10, 10 / (60 * 60), systemClock),
    },
  }
}

/**
 * Kontejner se drží v `globalThis`, aby ho hot-reload ve vývoji nestavěl znovu při každé
 * změně souboru — jinak by se s každou úpravou otevíralo nové SMTP spojení a rate limit
 * by se resetoval.
 */
const globalForContainer = globalThis as unknown as { silentAgroContainer?: Container }

export function getContainer(): Container {
  globalForContainer.silentAgroContainer ??= build()
  return globalForContainer.silentAgroContainer
}
