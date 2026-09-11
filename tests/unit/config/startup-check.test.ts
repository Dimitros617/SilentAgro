import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '@/infrastructure/config/env'
import { register } from '@/instrumentation'

/**
 * Špatná konfigurace musí kontejner zastavit, ne ho nechat běžet a vracet
 * chybu 500 na každý požadavek. Provozovatel pak vidí důvod v `docker logs`
 * hned při startu, ne až když si někdo stěžuje, že web nejede.
 */

const valid = {
  // `NODE_ENV` vyžaduje typ ProcessEnv; aplikace se jím neřídí, čte APP_ENV.
  NODE_ENV: 'test',
  NEXT_RUNTIME: 'nodejs',
  DATABASE_URL: 'mysql://u:p@db:3306/x',
  AUTH_SECRET: 'x'.repeat(32),
  BANK_ACCOUNT_IBAN: 'CZ6508000000192000145399',
  BANK_ACCOUNT_NUMBER: '2000145399/0800',
  FARMER_EMAIL: 'farma@example.cz',
  MAIL_FROM: 'Farma <farma@example.cz>',
  PUBLIC_BASE_URL: 'http://localhost:3000',
}

function withEnv(overrides: Record<string, string>) {
  const previous = process.env
  process.env = { ...valid, ...overrides } as unknown as NodeJS.ProcessEnv
  resetEnvCache()
  return () => {
    process.env = previous
    resetEnvCache()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  resetEnvCache()
})

describe('kontrola konfigurace při startu', () => {
  it('zastaví aplikaci, když je konfigurace neplatná', async () => {
    const restore = withEnv({ BANK_ACCOUNT_IBAN: 'CZ0603000000000087654322' })
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await register()

    expect(exit).toHaveBeenCalledWith(1)
    // Hláška musí říct, který klíč je špatně, a kde se opravuje.
    const message = log.mock.calls.flat().join('\n')
    expect(message).toContain('BANK_ACCOUNT_IBAN')
    expect(message).toContain('.env.example')
    // Nikdy nesmí vypsat hodnotu — konfigurace obsahuje tajemství.
    expect(message).not.toContain(valid.AUTH_SECRET)

    restore()
  })

  it('nechá aplikaci naběhnout, když je konfigurace v pořádku', async () => {
    const restore = withEnv({})
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await register()

    expect(exit).not.toHaveBeenCalled()
    restore()
  })

  it('nesahá na proces mimo Node runtime', async () => {
    // V Edge runtime `process.exit` neexistuje; hook tam nesmí nic zkoušet.
    const restore = withEnv({ NEXT_RUNTIME: 'edge', BANK_ACCOUNT_IBAN: 'nesmysl' })
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)

    await register()

    expect(exit).not.toHaveBeenCalled()
    restore()
  })
})
