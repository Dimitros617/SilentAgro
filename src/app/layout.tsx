import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'
import { CartProvider } from '@/components/cart/cart-provider'
import { SiteHeader } from '@/components/layout/site-header'
import { ToastProvider } from '@/components/layout/toast'
import { readSession } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import './globals.css'
import './ui.css'

const sans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const display = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

/**
 * `generateMetadata` místo statického objektu: název farmy je v konfiguraci,
 * takže ho nejde zapsat do konstanty vyhodnocené při sestavení.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { farm } = getContainer()
  return {
    title: {
      default: `${farm.name} — brambory přímo z pole`,
      template: `%s — ${farm.name}`,
    },
    description:
      'Rezervujte si brambory přímo z pole. Každý den vykopeme, zvážíme a hned zveřejníme, kolik je na skladě.',
  }
}

export const viewport: Viewport = {
  themeColor: '#f6f3ec',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await readSession()
  const { farm } = getContainer()

  return (
    <html lang="cs" className={`${sans.variable} ${display.variable}`}>
      <body>
        <ToastProvider>
          <CartProvider>
            <div className="page">
              <SiteHeader
                farm={{ name: farm.name, legalName: farm.legalName }}
                session={session ? { name: session.name, role: session.role } : null}
              />
              <main>{children}</main>
              <footer className="footer">
                <div className="footer__inner">
                  <span>
                    {[`${farm.name} by ${farm.legalName}`, farm.companyId && `IČO ${farm.companyId}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span>{[farm.email, farm.phone].filter(Boolean).join(' · ')}</span>
                </div>
              </footer>
            </div>
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
