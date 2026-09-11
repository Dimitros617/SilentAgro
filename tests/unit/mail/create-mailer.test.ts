import { describe, expect, it } from 'vitest'
import { MemoryMailer, NodemailerMailer, createMailer, describeMailer } from '@/infrastructure/mail/create-mailer'

const base = {
  host: 'localhost',
  port: 1025,
  secure: false,
  user: undefined,
  password: undefined,
  from: 'SilentAgro <farma@silentagro.cz>',
} as const

describe('createMailer', () => {
  it('driver memory vrátí paměťový odesílatel', () => {
    expect(createMailer({ ...base, driver: 'memory' })).toBeInstanceOf(MemoryMailer)
  })

  it('driver mailpit vrátí SMTP odesílatel', () => {
    expect(createMailer({ ...base, driver: 'mailpit' })).toBeInstanceOf(NodemailerMailer)
  })

  it('driver smtp vrátí SMTP odesílatel', () => {
    expect(
      createMailer({ ...base, driver: 'smtp', host: 'smtp.seznam.cz', port: 465, secure: true }),
    ).toBeInstanceOf(NodemailerMailer)
  })
})

describe('describeMailer', () => {
  it('u mailpitu hlásí, že se nepřihlašuje', () => {
    expect(describeMailer({ ...base, driver: 'mailpit', host: 'mailpit' })).toBe(
      'mailpit://mailpit:1025 (bez přihlášení)',
    )
  })

  it('u smtp uvede jméno uživatele', () => {
    expect(
      describeMailer({
        ...base,
        driver: 'smtp',
        host: 'smtp.seznam.cz',
        port: 465,
        secure: true,
        user: 'farma',
        password: 'tajne',
      }),
    ).toBe('smtp://smtp.seznam.cz:465 (přihlášen jako farma)')
  })

  it('nikdy nevypíše heslo', () => {
    // popis jde do logu při startu, který čte víc lidí než ten, kdo heslo nastavoval
    const description = describeMailer({
      ...base,
      driver: 'smtp',
      user: 'farma',
      password: 'tajne-heslo',
    })
    expect(description).not.toContain('tajne-heslo')
  })

  it('u memory řekne, že se nic neodesílá', () => {
    expect(describeMailer({ ...base, driver: 'memory' })).toBe('memory (nic se neodesílá)')
  })
})

describe('MemoryMailer', () => {
  it('sbírá odeslané zprávy', async () => {
    const mailer = new MemoryMailer()
    await mailer.send({ to: 'a@b.cz', subject: 'Test', text: 'x' })

    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]?.to).toBe('a@b.cz')
  })

  it('jde vyprázdnit mezi testy', async () => {
    const mailer = new MemoryMailer()
    await mailer.send({ to: 'a@b.cz', subject: 'Test', text: 'x' })
    mailer.clear()

    expect(mailer.sent).toHaveLength(0)
  })
})
