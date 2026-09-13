import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { UserRole } from '@/domain/enums'
import { BcryptPasswordHasher } from '@/infrastructure/auth/bcrypt-password-hasher'
import { JoseTokenService } from '@/infrastructure/auth/jose-token-service'

const secret = 'x'.repeat(32)
const payload = { userId: 7, role: UserRole.FARMER, name: 'Farmář Milan' }

describe('JoseTokenService', () => {
  it('podepíše a ověří token', async () => {
    const service = new JoseTokenService(secret)
    expect(await service.verify(await service.sign(payload))).toEqual({
      ...payload,
      issuedAt: expect.any(Date),
    })
  })

  it('vrátí okamžik vydání tokenu', async () => {
    // podle něj se pozná session vydaná ještě před odvoláním přístupu
    const service = new JoseTokenService(secret)
    const before = Math.floor(Date.now() / 1000)

    const verified = await service.verify(await service.sign(payload))

    expect(verified?.issuedAt.getTime()).toBeGreaterThanOrEqual(before * 1000)
    expect(verified?.issuedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('odmítne token bez okamžiku vydání', async () => {
    // odvolání session stojí na `iat`; token, který ho vynechá, by kontrolu obešel
    const forged = await new SignJWT({ role: UserRole.FARMER, name: 'Farmář Milan' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('7')
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(secret))

    expect(await new JoseTokenService(secret).verify(forged)).toBeNull()
  })

  it('odmítne token podepsaný jiným tajemstvím', async () => {
    const token = await new JoseTokenService(secret).sign(payload)
    expect(await new JoseTokenService('y'.repeat(32)).verify(token)).toBeNull()
  })

  it('odmítne prošlý token', async () => {
    const service = new JoseTokenService(secret, -10)
    expect(await service.verify(await service.sign(payload))).toBeNull()
  })

  it('odmítne poškozený řetězec', async () => {
    const service = new JoseTokenService(secret)
    expect(await service.verify('rozbite')).toBeNull()
    expect(await service.verify('')).toBeNull()
  })

  it('odmítne token s algoritmem none', async () => {
    // bez explicitního seznamu algoritmů by knihovna nechala útočníka určit si ho sám
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const body = Buffer.from(JSON.stringify({ sub: '7', role: 'FARMER' })).toString('base64url')
    expect(await new JoseTokenService(secret).verify(`${header}.${body}.`)).toBeNull()
  })

  it('odmítne token s neznámou rolí', async () => {
    // role z tokenu rozhoduje o přístupu do administrace, takže se nesmí vzít naslepo
    const service = new JoseTokenService(secret)
    const forged = await service.sign({ ...payload, role: 'SUPERADMIN' as never })
    expect(await service.verify(forged)).toBeNull()
  })

  it('odmítne token bez čitelného identifikátoru uživatele', async () => {
    const service = new JoseTokenService(secret)
    const forged = await service.sign({ ...payload, userId: Number.NaN })
    expect(await service.verify(forged)).toBeNull()
  })
})

describe('BcryptPasswordHasher', () => {
  it('hash neobsahuje původní heslo a ověření projde', async () => {
    const hasher = new BcryptPasswordHasher(4)
    const hash = await hasher.hash('brambory')

    expect(hash).not.toContain('brambory')
    expect(await hasher.verify('brambory', hash)).toBe(true)
  })

  it('odmítne špatné heslo', async () => {
    const hasher = new BcryptPasswordHasher(4)
    expect(await hasher.verify('mrkev', await hasher.hash('brambory'))).toBe(false)
  })

  it('stejné heslo dá pokaždé jiný hash', async () => {
    const hasher = new BcryptPasswordHasher(4)
    expect(await hasher.hash('brambory')).not.toBe(await hasher.hash('brambory'))
  })

  it('u poškozeného hashe vrátí false místo výjimky', async () => {
    // v databázi může skončit i nesmysl; přihlášení musí selhat, ne spadnout
    expect(await new BcryptPasswordHasher(4).verify('brambory', 'neni-hash')).toBe(false)
  })
})
