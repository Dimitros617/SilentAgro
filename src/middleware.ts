import { type NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

/**
 * Middleware běží na Edge runtime. Proto tu nejde použít `getContainer()` ani `env.ts` —
 * ty tahají Prisma a nodovské moduly, které Edge nemá. Ověření podpisu přes `jose`
 * na WebCrypto je jediné, co se tu dělá; obsah session se čte až na serveru.
 *
 * `process.env` se tu čte přímo. Je to jediná povolená výjimka z pravidla, že konfigurace
 * jde přes `config/env.ts`.
 */
const SESSION_COOKIE = 'silentagro_session'

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET

  // Bez tajemství nelze ověřit vůbec nic. Pustit dál by znamenalo otevřenou administraci,
  // takže se v takovém případě odmítá všechno.
  if (!secret || secret.length < 32) {
    return redirectToLogin(request)
  }

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

  return NextResponse.next()
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = new URL('/', request.url)
  url.searchParams.set('prihlaseni', 'vyzadovano')
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/admin/:path*'],
}
