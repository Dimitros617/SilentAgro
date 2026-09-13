import { describe, expect, it } from 'vitest'
import { buildCsp, createNonce } from '@/shared/csp'

const directive = (csp: string, name: string): string =>
  csp.split('; ').find((part) => part.startsWith(`${name} `)) ?? ''

describe('buildCsp', () => {
  it('s nonce pustí skripty jen proti němu', () => {
    expect(directive(buildCsp('abc123'), 'script-src')).toBe("script-src 'self' 'nonce-abc123'")
  })

  it('bez nonce povolí inline i eval, protože vývojový server je potřebuje', () => {
    // ve vývoji Next používá eval pro hot reload; produkce dostane nonce a tuhle
    // větev nikdy neuvidí
    const csp = buildCsp(null)

    expect(directive(csp, 'script-src')).toContain("'unsafe-inline'")
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'")
  })

  it('styly nechává inline schválně', () => {
    // nonce platí na <style> a <script>, ne na atribut style; aplikace má stovky
    // style={{…}} props, takže zpřísnit style-src by byla úplně jiná změna
    expect(directive(buildCsp('abc123'), 'style-src')).toContain("'unsafe-inline'")
  })

  it('nechává data: v img-src kvůli QR kódu', () => {
    // QR pro platbu se vykresluje jako data URI (src/infrastructure/payment/qr-code.ts)
    expect(directive(buildCsp('abc123'), 'img-src')).toContain('data:')
  })

  it('neuvádí zdroje, na které se aplikace neptá', () => {
    // next/font si fonty stáhne při sestavení a hostí je sám, blob: se nikde nepoužívá
    const csp = buildCsp('abc123')

    expect(csp).not.toContain('fonts.googleapis.com')
    expect(csp).not.toContain('fonts.gstatic.com')
    expect(directive(csp, 'img-src')).not.toContain('blob:')
  })

  it('drží zbytek politiky uzavřený na vlastní původ', () => {
    const csp = buildCsp('abc123')

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
  })
})

describe('createNonce', () => {
  it('vyhoví vzoru, kterým si Next čte nonce z hlavičky', () => {
    // Next nonce zahodí mlčky, když neprojde jeho regulárním výrazem
    // (next/dist/server/app-render/get-script-nonce-from-header.js) — stránka by
    // pak zůstala bez skriptů a nikdo by se nedozvěděl proč
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/)
  })

  it('dá pokaždé jinou hodnotu', () => {
    expect(createNonce()).not.toBe(createNonce())
  })
})
