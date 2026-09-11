import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'
import { CartProvider } from '@/components/cart/cart-provider'
import { SiteHeader } from '@/components/layout/site-header'
import { ToastProvider } from '@/components/layout/toast'
import { readSession } from '@/infrastructure/auth/session'
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

export const metadata: Metadata = {
  title: {
    default: 'SilentAgro — brambory přímo z pole',
    template: '%s — SilentAgro',
  },
  description:
    'Rezervujte si brambory přímo z pole. Každý den vykopeme, zvážíme a hned zveřejníme, kolik je na skladě.',
}

export const viewport: Viewport = {
  themeColor: '#f6f3ec',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await readSession()

  return (
    <html lang="cs" className={`${sans.variable} ${display.variable}`}>
      <body>
        <ToastProvider>
          <CartProvider>
            <div className="page">
              <SiteHeader
                session={session ? { name: session.name, role: session.role } : null}
              />
              <main>{children}</main>
              <footer className="footer">
                <div className="footer__inner">
                  <span>SilentAgro by Silent Industries · IČO 12345678</span>
                  <span>farma@silentagro.cz · +420 777 123 456</span>
                </div>
              </footer>
            </div>
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
