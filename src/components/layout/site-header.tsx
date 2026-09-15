'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useCallback, useState } from 'react'
import { logoutAction } from '@/app/actions/auth'
import { useCart } from '@/components/cart/cart-provider'
import { AuthModal, useAuthPrompt } from './auth-modal'

export interface HeaderSession {
  name: string
  role: 'CUSTOMER' | 'FARMER'
}

export interface HeaderFarm {
  name: string
  legalName: string
}

const PUBLIC_NAV = [
  { href: '/', label: 'Domů' },
  { href: '/burza', label: 'Burza' },
  { href: '/sklad', label: 'Sklad' },
] as const

const ADMIN_NAV = { href: '/admin', label: 'Administrace' } as const

/** Vlastní komponenta, protože `useSearchParams` vyžaduje Suspense hranici. */
function AuthPrompt({ onOpen }: Readonly<{ onOpen: () => void }>) {
  useAuthPrompt(onOpen)
  return null
}

export function SiteHeader({ farm, session }: Readonly<{ farm: HeaderFarm; session: HeaderSession | null }>) {
  const pathname = usePathname()
  const { count } = useCart()
  const [authOpen, setAuthOpen] = useState(false)

  const openAuth = useCallback(() => setAuthOpen(true), [])
  const closeAuth = useCallback(() => setAuthOpen(false), [])

  return (
    <header className="header">
      <div className="header__inner">
        <Link href="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            {farm.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <span className="brand__name">{farm.name}</span>
            <span className="brand__sub" style={{ display: 'block' }}>
              by {farm.legalName}
            </span>
          </span>
        </Link>

        {/*
          Administrace je běžná položka navigace, ne samostatné výrazné tlačítko:
          farmář ji používá stejně často jako ostatní sekce a odlišná grafika
          jen odváděla pozornost. Zákazníkovi se nezobrazí vůbec.
        */}
        <nav className="nav" aria-label="Hlavní navigace">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav__link"
              aria-current={pathname === item.href ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}

          {session?.role === 'FARMER' ? (
            <Link
              href={ADMIN_NAV.href}
              className="nav__link nav__link--admin"
              // Zvýrazněná i na podstránkách administrace, ne jen na /admin.
              aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            >
              {ADMIN_NAV.label}
            </Link>
          ) : null}
        </nav>

        <div className="header__spacer" />

        <Link href="/kosik" className="btn btn--secondary">
          Košík
          <span
            className="badge badge--green"
            style={{ background: 'var(--green)', color: '#fff', minWidth: 22, textAlign: 'center' }}
          >
            {count}
          </span>
        </Link>

        {session ? (
          <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{session.name}</div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="btn btn--danger"
                style={{ color: 'var(--muted)', padding: 0 }}
              >
                odhlásit
              </button>
            </form>
          </div>
        ) : (
          <button type="button" className="btn btn--dark" onClick={openAuth}>
            Přihlásit
          </button>
        )}
      </div>

      <Suspense fallback={null}>
        <AuthPrompt onOpen={openAuth} />
      </Suspense>
      <AuthModal open={authOpen} onClose={closeAuth} />
    </header>
  )
}
