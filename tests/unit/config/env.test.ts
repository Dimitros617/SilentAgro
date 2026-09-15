import { describe, expect, it } from 'vitest'
import { loadEnv } from '@/infrastructure/config/env'

const valid = {
  APP_ENV: 'development',
  DATABASE_URL: 'mysql://u:p@localhost:3306/silentagro',
  AUTH_SECRET: 'x'.repeat(32),
  MAIL_FROM: 'SilentAgro <farma@silentagro.cz>',
  FARMER_EMAIL: 'farma@silentagro.cz',
  BANK_ACCOUNT_IBAN: 'CZ65 0800 0000 1920 0014 5399',
  BANK_ACCOUNT_NUMBER: '2000145399/0800',
  PUBLIC_BASE_URL: 'http://localhost:3000',
} as unknown as NodeJS.ProcessEnv

describe('loadEnv — výchozí hodnoty', () => {
  it('doplní rozumné výchozí hodnoty pro vývoj', () => {
    const env = loadEnv(valid)
    expect(env.MAIL_DRIVER).toBe('mailpit')
    expect(env.SMTP_HOST).toBe('localhost')
    expect(env.SMTP_PORT).toBe(1025)
    expect(env.SMTP_SECURE).toBe(false)
    expect(env.UPLOAD_DIR).toBe('./public/uploads')
    expect(env.TRUST_PROXY).toBe(false)
  })

  it('převede číselné i logické hodnoty z řetězců', () => {
    const env = loadEnv({ ...valid, SMTP_PORT: '465', SMTP_SECURE: 'true', TRUST_PROXY: 'true' })
    expect(env.SMTP_PORT).toBe(465)
    expect(env.SMTP_SECURE).toBe(true)
    expect(env.TRUST_PROXY).toBe(true)
  })
})

describe('loadEnv — povinné hodnoty', () => {
  it('odmítne chybějící DATABASE_URL a chybu pojmenuje', () => {
    const rest = { ...valid }
    delete rest.DATABASE_URL
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
  })

  it('odmítne krátký AUTH_SECRET', () => {
    expect(() => loadEnv({ ...valid, AUTH_SECRET: 'krátké' })).toThrow(/AUTH_SECRET/)
  })

  it('odmítne chybějící bankovní účet', () => {
    const rest = { ...valid }
    delete rest.BANK_ACCOUNT_IBAN
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/BANK_ACCOUNT_IBAN/)
  })
})

describe('loadEnv — IBAN', () => {
  it('odstraní mezery a převede na velká písmena', () => {
    expect(loadEnv(valid).BANK_ACCOUNT_IBAN).toBe('CZ6508000000192000145399')
  })

  it('odmítne IBAN s překlepem v kontrolních číslicích', () => {
    // bez této kontroly by QR kódy posílaly peníze na cizí účet
    expect(() => loadEnv({ ...valid, BANK_ACCOUNT_IBAN: 'CZ6608000000192000145399' })).toThrow(
      /BANK_ACCOUNT_IBAN/,
    )
  })
})

describe('loadEnv — pojistka mailového driveru', () => {
  it('v produkci odmítne driver, který nic neodešle', () => {
    expect(() => loadEnv({ ...valid, APP_ENV: 'production', MAIL_DRIVER: 'memory' })).toThrow(
      /MAIL_DRIVER/,
    )
  })

  it('v produkci dovolí smtp', () => {
    const env = loadEnv({
      ...valid,
      APP_ENV: 'production',
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.seznam.cz',
      SMTP_PORT: '465',
    })
    expect(env.MAIL_DRIVER).toBe('smtp')
  })

  it('v produkci dovolí i mailpit, pokud si ho někdo vědomě zvolí', () => {
    // Mailpit je skutečný SMTP server; zakazujeme jen driver, který poštu zahazuje.
    expect(() => loadEnv({ ...valid, APP_ENV: 'production', MAIL_DRIVER: 'mailpit' })).not.toThrow()
  })

  it('mimo produkci memory projde', () => {
    expect(loadEnv({ ...valid, MAIL_DRIVER: 'memory' }).MAIL_DRIVER).toBe('memory')
  })

  it('při driveru smtp vyžaduje vyplněný SMTP_HOST', () => {
    expect(() => loadEnv({ ...valid, MAIL_DRIVER: 'smtp', SMTP_HOST: '' })).toThrow(/SMTP_HOST/)
  })
})

describe('loadEnv — chybová hláška', () => {
  it('vypíše všechny chybějící klíče najednou', () => {
    const message = (() => {
      try {
        loadEnv({ APP_ENV: 'development' } as unknown as NodeJS.ProcessEnv)
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : ''
      }
    })()

    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('AUTH_SECRET')
    expect(message).toContain('BANK_ACCOUNT_IBAN')
  })

  it('nevypíše hodnotu tajemství, jen název klíče', () => {
    const message = (() => {
      try {
        loadEnv({ ...valid, AUTH_SECRET: 'tajne-ale-kratke' })
        return ''
      } catch (error) {
        return error instanceof Error ? error.message : ''
      }
    })()

    expect(message).toContain('AUTH_SECRET')
    expect(message).not.toContain('tajne-ale-kratke')
  })
})
