import 'server-only'
import { randomBytes } from 'node:crypto'
import type { OrderNotifier, OrderPresenter, UserNotifier } from '@/domain/ports/order-presentation'
import type {
  Clock,
  DeliveryPolicy,
  FarmIdentity,
  Logger,
  Mailer,
  PasswordHasher,
  TokenGenerator,
  TokenService,
} from '@/domain/ports/services'
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
  readonly farm: FarmIdentity
  readonly delivery: DeliveryPolicy
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
  const farm: FarmIdentity = {
    name: env.FARM_NAME,
    legalName: env.FARM_LEGAL_NAME,
    companyId: env.FARM_COMPANY_ID,
    email: env.FARMER_EMAIL,
    phone: env.FARM_PHONE,
  }

  const delivery: DeliveryPolicy = {
    feeCzk: env.DELIVERY_FEE_CZK,
    freeAboveCzk: env.FREE_DELIVERY_ABOVE_CZK,
    radiusKm: env.DELIVERY_RADIUS_KM,
    holdDays: env.RESERVATION_HOLD_DAYS,
  }

  const notifier = new MailOrderNotifier({
    mailer,
    logger: consoleLogger,
    bank,
    farm,
    delivery,
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
    farm,
    delivery,
    config: {
      farmerEmail: env.FARMER_EMAIL,
      publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
      uploadDir: env.UPLOAD_DIR,
      trustProxy: env.TRUST_PROXY,
    },
    limiters: {
      // Kapacita se plně doplní za uvedené okno.
      login: new TokenBucket(
        env.RATE_LIMIT_LOGIN_PER_15MIN,
        env.RATE_LIMIT_LOGIN_PER_15MIN / (15 * 60),
        systemClock,
      ),
      register: new TokenBucket(
        env.RATE_LIMIT_REGISTER_PER_HOUR,
        env.RATE_LIMIT_REGISTER_PER_HOUR / 3600,
        systemClock,
      ),
      order: new TokenBucket(
        env.RATE_LIMIT_ORDERS_PER_HOUR,
        env.RATE_LIMIT_ORDERS_PER_HOUR / 3600,
        systemClock,
      ),
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
