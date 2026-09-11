import { z } from 'zod'
import { isValidIban } from '@/domain/value-objects/iban'

export const MAIL_DRIVERS = ['mailpit', 'smtp', 'memory'] as const
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
    FARMER_EMAIL: z.string().email('musí být platný e-mail'),

    BANK_ACCOUNT_IBAN: z
      .string()
      .min(1, 'je povinná')
      .transform((value) => value.replace(/\s+/g, '').toUpperCase())
      .refine(isValidIban, 'nemá platný tvar nebo kontrolní číslice'),
    BANK_ACCOUNT_NUMBER: z.string().min(1, 'je povinná'),

    PUBLIC_BASE_URL: z.string().url('musí být platná URL'),
    UPLOAD_DIR: z.string().default('./public/uploads'),

    /**
     * Zapnout jen tehdy, když před aplikací skutečně stojí reverzní proxy, která
     * `X-Forwarded-For` nastavuje. Bez proxy si hlavičku nastaví kdokoli a rate limit
     * podle IP by šel obejít jedním hlavičkovým polem.
     */
    TRUST_PROXY: booleanFromString,
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
