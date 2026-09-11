import type { NextConfig } from 'next'

/**
 * `'unsafe-inline'` ve `script-src` je ústupek: App Router vkládá do stránky inline
 * bootstrap skript a nonce by vyžadovala middleware na každém požadavku, včetně
 * statických stránek. `data:` v `img-src` je nutné pro QR kód, který se na stránku
 * potvrzení vykresluje jako data URI.
 *
 * Ve vývoji Next používá `eval` pro hot-reload, takže tam se `'unsafe-eval'` přidává —
 * v produkčním sestavení ne.
 */
const isDev = process.env.NODE_ENV === 'development'

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const config: NextConfig = {
  // Runtime image pak obsahuje jen server a nezbytné moduly, ne celé node_modules.
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default config
