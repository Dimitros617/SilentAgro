import { z } from 'zod'
import { isValidIban } from '@/domain/value-objects/iban'

const MAIL_DRIVERS = ['mailpit', 'smtp', 'memory'] as const
export type MailDriver = (typeof MAIL_DRIVERS)[number]

const booleanFromString = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1')

const schema = z
  .object({
    /**
     * Prostředí aplikace. Záměrně **není** odvozeno z `NODE_ENV`: Next.js `output: 'standalone'`
     * si `NODE_ENV=production` nastavuje natvrdo, takže by na něj navázaná pravidla platila
     * i ve vývojové sestavě v kontejneru a nešla vypnout.
     */
    APP_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1, 'je povinná'),
    AUTH_SECRET: z.string().min(32, 'musí mít alespoň 32 znaků'),

    MAIL_DRIVER: z.enum(MAIL_DRIVERS).default('mailpit'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: booleanFromString,
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(1, 'je povinná'),
    FARMER_EMAIL: z.email('musí být platný e-mail'),

    /**
     * Identita farmy. Objevuje se v patičce, v hlavičce a pod každým odeslaným
     * e-mailem — kdyby byla v kódu, musel by ji nový provozovatel hledat
     * na deseti místech.
     */
    FARM_NAME: z.string().min(1).default('SilentAgro'),
    FARM_LEGAL_NAME: z.string().min(1).default('Silent Industries'),
    FARM_COMPANY_ID: z.string().default(''),
    FARM_PHONE: z.string().default(''),

    /**
     * Obchodní pravidla. Poplatek i hranice pro dopravu zdarma se u každé farmy
     * liší, takže patří do konfigurace, ne mezi konstanty v doméně.
     */
    DELIVERY_FEE_CZK: z.coerce.number().min(0).default(60),
    FREE_DELIVERY_ABOVE_CZK: z.coerce.number().min(0).default(600),
    DELIVERY_RADIUS_KM: z.coerce.number().int().positive().default(20),
    RESERVATION_HOLD_DAYS: z.coerce.number().int().positive().default(5),

    BANK_ACCOUNT_IBAN: z
      .string()
      .min(1, 'je povinná')
      .transform((value) => value.replace(/\s+/g, '').toUpperCase())
      .refine(isValidIban, 'nemá platný tvar nebo kontrolní číslice'),
    BANK_ACCOUNT_NUMBER: z.string().min(1, 'je povinná'),

    PUBLIC_BASE_URL: z.url('musí být platná URL'),
    UPLOAD_DIR: z.string().default('./public/uploads'),

    /**
     * Zapnout jen tehdy, když před aplikací skutečně stojí reverzní proxy, která
     * `X-Forwarded-For` nastavuje. Bez proxy si hlavičku nastaví kdokoli a rate limit
     * podle IP by šel obejít jedním hlavičkovým polem.
     */
    TRUST_PROXY: booleanFromString,

    /**
     * Limity jsou politika, ne konstanta v kódu. Produkce si nechá výchozí hodnoty;
     * testovací sestava je zvedne, aby šlo sadu pustit vícekrát za sebou — jinak by
     * druhý běh narazil na ochranu, která dělá přesně to, co má.
     */
    RATE_LIMIT_LOGIN_PER_15MIN: z.coerce.number().int().positive().default(5),
    RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().positive().default(3),
    RATE_LIMIT_ORDERS_PER_HOUR: z.coerce.number().int().positive().default(10),
  })
  .superRefine((value, ctx) => {
    if (value.APP_ENV === 'production' && value.MAIL_DRIVER === 'memory') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_DRIVER'],
        message:
          'v produkci nesmí být "memory" — potvrzení objednávek by se tiše zahazovala',
      })
    }
    if (value.MAIL_DRIVER === 'smtp' && value.SMTP_HOST.trim().length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'při MAIL_DRIVER=smtp je povinný',
      })
    }
  })

export type Env = z.infer<typeof schema>

/**
 * Načte a ověří konfiguraci. Chybová hláška vypisuje **jen názvy klíčů a důvod**,
 * nikdy hodnoty — konfigurace obsahuje tajemství a chyba při startu se běžně objeví
 * v logu, který čte víc lidí než jen ten, kdo ji nastavoval.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(kořen)'}: ${issue.message}`)
      .join('\n  ')
    throw new Error(`Neplatná konfigurace prostředí:\n  ${detail}`)
  }

  return parsed.data
}

let cached: Env | undefined

/**
 * Konfigurace se ověří při prvním čtení, ne při načtení modulu. Během `next build`
 * se moduly vyhodnocují bez produkčního prostředí a validace při importu by build shodila.
 */
export function getEnv(): Env {
  cached ??= loadEnv()
  return cached
}

/** Jen pro testy — zahodí uloženou konfiguraci. */
export function resetEnvCache(): void {
  cached = undefined
}
