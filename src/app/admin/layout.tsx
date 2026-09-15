import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { readFarmerSession } from '@/infrastructure/auth/session'
import { AdminTabs } from '@/components/admin/admin-tabs'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  /**
   * Druhá kontrola role, tentokrát proti databázi. Middleware přesměrovává prohlížeč,
   * ale spoléhat se jen na něj by znamenalo, že o přístupu rozhoduje vrstva, kterou lze
   * obejít přímým požadavkem — a která navíc na Edge nevidí do databáze, takže o
   * odebrané roli ani odvolané session neví.
   */
  const session = await readFarmerSession()
  if (!session) {
    redirect('/?prihlaseni=vyzadovano')
  }

  return (
    <div className="shell">
      <div className="admin__head">
        <div>
          <span className="eyebrow" style={{ color: 'var(--gold)', fontWeight: 600 }}>
            Administrace farmáře
          </span>
          <h1 className="display" style={{ fontSize: 36, margin: '6px 0 0' }}>
            Dobrý den, {session.name}
          </h1>
        </div>
        <AdminTabs />
      </div>

      <div style={{ marginTop: 26, paddingBottom: 70 }}>{children}</div>

      <p className="muted" style={{ paddingBottom: 24 }}>
        <Link href="/">← Zpět na web</Link>
      </p>
    </div>
  )
}
