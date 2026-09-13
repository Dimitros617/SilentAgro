import { type NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { buildCsp, createNonce } from '@/shared/csp'

/**
 * Middleware běží na Edge runtime. Proto tu nejde použít `getContainer()` ani `env.ts` —
 * ty tahají Prisma a nodovské moduly, které Edge nemá. Ověření podpisu přes `jose`
 * na WebCrypto je jediné, co se tu z session dělá; role se pak potvrzuje proti databázi
 * na serveru (`readFarmerSession`), kam Edge nedohlédne.
 *
 * `process.env` se tu čte přímo. Je to jediná povolená výjimka z pravidla, že konfigurace
 * jde přes `config/env.ts`.
 *
 * Od nasazení nonce sem patří i hlavička CSP: nonce musí vzniknout na každý požadavek
 * zvlášť, a to umí jedině vrstva, která každý požadavek vidí.
 */
const SESSION_COOKIE = 'silentagro_session'

const isDev = process.env.NODE_ENV === 'development'

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const csp = buildCsp(isDev ? null : createNonce())

  // Pořadí kontrol je podstatné: nejdřív cesta, teprve pak tajemství. Obráceně by
  // chybějící AUTH_SECRET shodil i veřejný obchod, který na session vůbec nestojí.
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const denied = await denyAdmin(request)
    if (denied) return withCsp(denied, csp)
  }

  // Nonce musí dojít do dvou míst: do požadavku, odkud si ji Next bere pro svůj
  // bootstrap skript, a do odpovědi, kterou čte prohlížeč. `set`, ne `append` —
  // hlavičku poslanou klientem nesmí nic přežít.
  const headers = new Headers(request.headers)
  headers.set('content-security-policy', csp)

  return withCsp(NextResponse.next({ request: { headers } }), csp)
}

/** Vrací přesměrování, pokud požadavek do administrace nepatří, jinak `null`. */
async function denyAdmin(request: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.AUTH_SECRET

  // Bez tajemství nelze ověřit vůbec nic. Pustit dál by znamenalo otevřenou administraci,
  // takže se v takovém případě odmítá všechno.
  if (!secret || secret.length < 32) return redirectToLogin(request)

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return redirectToLogin(request)

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    })
    if (payload.role !== 'FARMER') return redirectToLogin(request)
  } catch {
    return redirectToLogin(request)
  }

  return null
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  return response
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = new URL('/', request.url)
  url.searchParams.set('prihlaseni', 'vyzadovano')
  return NextResponse.redirect(url)
}

/**
 * Projít musí každá HTML odpověď, ne jen administrace: `next.config.ts` už CSP neposílá,
 * takže co middleware mine, jde ven bez politiky. Statické soubory z `_next` se vynechávají
 * — ostatní bezpečnostní hlavičky na ně pořád sedí z `next.config.ts` a nonce by jim byla
 * k ničemu.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
