import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { middleware } from '@/middleware'

const SECRET = 'x'.repeat(32)
const original = process.env.AUTH_SECRET

const request = (path: string): NextRequest => new NextRequest(new URL(path, 'https://silentagro.cz'))

const isRedirect = (status: number): boolean => status >= 300 && status < 400

afterEach(() => {
  process.env.AUTH_SECRET = original
})

describe('middleware', () => {
  it('veřejnou stránku pustí dál a orazítkuje ji politikou s nonce', async () => {
    process.env.AUTH_SECRET = SECRET

    const response = await middleware(request('/burza'))
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(isRedirect(response.status)).toBe(false)
    expect(csp).toContain("script-src 'self' 'nonce-")
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'")
  })

  it('nonce předá i do požadavku, aby si ho Next našel', async () => {
    // Next čte nonce z hlavičky PŘÍCHOZÍHO požadavku; kdyby seděla jen na odpovědi,
    // bootstrap skript by se vykreslil bez nonce a prohlížeč by ho zablokoval
    process.env.AUTH_SECRET = SECRET

    const response = await middleware(request('/'))
    const forwarded = response.headers.get('x-middleware-request-content-security-policy')

    expect(forwarded).toContain("'nonce-")
    expect(forwarded).toBe(response.headers.get('content-security-policy'))
  })

  it('administraci bez přihlášení přesměruje', async () => {
    process.env.AUTH_SECRET = SECRET

    const response = await middleware(request('/admin/sklad'))

    expect(isRedirect(response.status)).toBe(true)
    expect(response.headers.get('location')).toContain('prihlaseni=vyzadovano')
  })

  it('chybějící AUTH_SECRET zamkne administraci, ne celý web', async () => {
    // pořadí kontrol: nejdřív cesta, pak tajemství. Obráceně by špatná konfigurace
    // shodila i veřejný obchod, který na session nestojí
    delete process.env.AUTH_SECRET

    expect(isRedirect((await middleware(request('/admin'))).status)).toBe(true)
    expect(isRedirect((await middleware(request('/'))).status)).toBe(false)
  })

  it('i na přesměrování z administrace posílá politiku', async () => {
    process.env.AUTH_SECRET = SECRET

    const response = await middleware(request('/admin'))

    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
  })
})
