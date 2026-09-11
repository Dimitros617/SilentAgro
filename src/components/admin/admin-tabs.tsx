'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Záložky jsou skutečné cesty, ne stav v paměti jako v prototypu. Farmář si tak
 * může konkrétní záložku uložit do oblíbených a obnovení stránky ho nevrátí na přehled.
 */
const TABS = [
  { href: '/admin', label: 'Přehled' },
  { href: '/admin/sklad', label: 'Sklad a ceny' },
  { href: '/admin/objednavky', label: 'Objednávky' },
  { href: '/admin/novinky', label: 'Novinky' },
] as const

export function AdminTabs() {
  const pathname = usePathname()

  return (
    <nav className="pill-group" aria-label="Sekce administrace">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="pill"
          aria-current={pathname === tab.href ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
