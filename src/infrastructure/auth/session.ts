import 'server-only'
import { cookies, headers } from 'next/headers'
import type { AuthResult } from '@/application/dto'
import { AuthorizeFarmerSession, AuthorizeSession } from '@/application/use-cases/auth'
import { ForbiddenError } from '@/domain/errors'
import type { SessionPayload, VerifiedSession } from '@/domain/ports/services'
import { SESSION_COOKIE } from '@/infrastructure/auth/session-cookie'
import { getEnv } from '@/infrastructure/config/env'
import { getContainer } from '@/infrastructure/di/container'

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600

async function readVerifiedSession(): Promise<VerifiedSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return getContainer().tokens.verify(token)
}

export async function readSession(): Promise<(AuthResult & { issuedAt: Date }) | null> {
  const session = await readVerifiedSession()
  if (!session) return null
  const user = await new AuthorizeSession({ uow: getContainer().uow }).execute(session)
  if (!user) return null
  return { ...user, issuedAt: session.issuedAt }
}

export async function writeSession(payload: SessionPayload): Promise<void> {
  const token = await getContainer().tokens.sign(payload)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().APP_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

/**
 * Farmářská session ověřená proti databázi.
 *
 * Role se nebere z tokenu: ten platí sedm dní, takže odebraná role, deaktivace ani
 * obnova hesla by se v něm neprojevily. Aktuální účet i roli ověřuje aplikační use-case.
 */
export async function readFarmerSession(): Promise<AuthResult | null> {
  const session = await readVerifiedSession()
  if (!session) return null
  return new AuthorizeFarmerSession({ uow: getContainer().uow }).execute(session)
}

/**
 * Kontrola role přímo v server action, ne jen v middleware.
 *
 * Middleware přesměrovává prohlížeč, ale server action se dá zavolat i přímým POSTem.
 * Bez téhle druhé kontroly by admin operace šla provést bez průchodu middlewarem.
 */
export async function requireFarmer(): Promise<AuthResult> {
  const farmer = await readFarmerSession()
  if (!farmer) throw new ForbiddenError('Tato akce je jen pro farmáře')
  return farmer
}

/**
 * Klíč pro rate limit.
 *
 * `X-Forwarded-For` se čte jen tehdy, když je před aplikací skutečně proxy — jinak
 * si hlavičku nastaví kdokoli a limit podle IP by šel obejít jedním polem v požadavku.
 *
 * `subject` (typicky e-mail) je druhá část klíče a je podstatná: bez důvěryhodné IP by
 * všichni sdíleli jeden kbelík a pět překlepů v hesle od jednoho člověka by na čtvrt
 * hodiny zamklo přihlášení celé farmě. Limit na účet chrání před hádáním hesla a
 * nikoho cizího nezablokuje.
 */
export async function rateLimitKey(subject = ''): Promise<string> {
  const ip = getContainer().config.trustProxy
    ? ((await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown')
    : 'no-proxy'

  return `${ip}|${subject.trim().toLowerCase()}`
}
