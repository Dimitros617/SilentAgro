import 'server-only'
import { cookies, headers } from 'next/headers'
import { UserRole } from '@/domain/enums'
import { ForbiddenError } from '@/domain/errors'
import type { SessionPayload } from '@/domain/ports/services'
import { getEnv } from '@/infrastructure/config/env'
import { getContainer } from '@/infrastructure/di/container'

export const SESSION_COOKIE = 'silentagro_session'

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return getContainer().tokens.verify(token)
}

export async function writeSession(payload: SessionPayload): Promise<void> {
  const token = await getContainer().tokens.sign(payload)

  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().APP_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearSession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}

/**
 * Kontrola role přímo v server action, ne jen v middleware.
 *
 * Middleware přesměrovává prohlížeč, ale server action se dá zavolat i přímým POSTem.
 * Bez téhle druhé kontroly by admin operace šla provést bez průchodu middlewarem.
 */
export async function requireFarmer(): Promise<SessionPayload> {
  const session = await readSession()
  if (!session || session.role !== UserRole.FARMER) {
    throw new ForbiddenError('Tato akce je jen pro farmáře')
  }
  return session
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
