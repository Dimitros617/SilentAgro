import { beforeEach, describe, expect, it, vi } from 'vitest'
import { User } from '@/domain/entities'
import type { UserProps } from '@/domain/entities/user'
import { UserRole } from '@/domain/enums'
import { ForbiddenError } from '@/domain/errors'
import { EmailAddress } from '@/domain/value-objects/email-address'
import { JoseTokenService } from '@/infrastructure/auth/jose-token-service'
import { readFarmerSession, readSession, requireFarmer } from '@/infrastructure/auth/session'
import { SESSION_COOKIE } from '@/infrastructure/auth/session-cookie'
import { makeBundle } from '../application/fakes'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }))
vi.mock('@/infrastructure/di/container', () => ({
  getContainer: () => ({ uow: bundle.uow, tokens }),
}))

const cookieStore = new Map<string, { value: string }>()
const tokens = new JoseTokenService('session-boundary-test-secret-value')
let bundle = makeBundle()

async function signIn(overrides: Partial<UserProps> = {}): Promise<User> {
  const user = User.rehydrate({
    id: 1, name: 'Farmář', email: EmailAddress.of('farma@example.cz'), role: UserRole.FARMER,
    passwordHash: 'unused', createdAt: new Date('2026-08-01T00:00:00Z'),
    verifiedAt: null, verificationToken: null, verificationExpiresAt: null,
    deactivatedAt: null, sessionsInvalidBefore: null, ...overrides,
  })
  bundle.users.items.push(user)
  // Token si ponechává původní roli, i když ji databáze už odebrala.
  cookieStore.set(SESSION_COOKIE, {
    value: await tokens.sign({ userId: user.id, role: UserRole.FARMER, name: 'Původní jméno' }),
  })
  return user
}

beforeEach(() => {
  cookieStore.clear()
  bundle = makeBundle()
})

describe('serverová hranice session', () => {
  it('bez cookie neudělí přístup', async () => {
    expect(await readSession()).toBeNull()
    expect(await readFarmerSession()).toBeNull()
    await expect(requireFarmer()).rejects.toThrow(ForbiddenError)
  })

  it('odmítne poškozený podpis před přístupem k účtu', async () => {
    await signIn()
    cookieStore.set(SESSION_COOKIE, { value: 'poskozeny-token' })
    expect(await readFarmerSession()).toBeNull()
  })

  it('vrátí aktuální účet farmáře a pro jeden požadavek jej načte jen jednou', async () => {
    const farmer = await signIn()
    const findUser = vi.spyOn(bundle.users, 'findById')

    expect(await requireFarmer()).toMatchObject({
      userId: farmer.id, name: 'Farmář', role: UserRole.FARMER,
    })
    expect(findUser).toHaveBeenCalledExactlyOnceWith(farmer.id)
  })

  it('po odebrání role zachová zákaznickou session, ale odmítne farmářskou akci', async () => {
    await signIn({ role: UserRole.CUSTOMER })

    expect(await readSession()).toMatchObject({ role: UserRole.CUSTOMER, issuedAt: expect.any(Date) })
    expect(await readFarmerSession()).toBeNull()
    await expect(requireFarmer()).rejects.toThrow(ForbiddenError)
  })

  it.each([
    { reason: 'deaktivaci', changes: { deactivatedAt: new Date('2026-08-01T00:00:00Z') } },
    { reason: 'odvolání tokenů', changes: { sessionsInvalidBefore: new Date('2100-01-01T00:00:00Z') } },
  ])('zneplatní běžnou i farmářskou session po $reason', async ({ changes }) => {
    await signIn(changes)
    expect(await readSession()).toBeNull()
    expect(await readFarmerSession()).toBeNull()
  })
})
