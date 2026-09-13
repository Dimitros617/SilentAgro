import type { NextConfig } from 'next'

/**
 * CSP tady schválně není. Nese nonce, která musí vzniknout na každý požadavek zvlášť,
 * takže ji staví middleware (`src/middleware.ts` nad `src/shared/csp.ts`). Statická
 * politika by kvůli bootstrap skriptu App Routeru musela pouštět `'unsafe-inline'`,
 * což je ve `script-src` přesně to, čemu má CSP bránit.
 *
 * Ostatní hlavičky zůstávají tady: nezávisí na požadavku a takhle sedí i na statických
 * souborech z `_next`, které middleware schválně míjí.
 */

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
