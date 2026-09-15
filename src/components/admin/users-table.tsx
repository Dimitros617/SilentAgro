'use client'

import Link from 'next/link'
import type { UserRowView } from '@/application/dto'

function VerifiedBadge({ user }: Readonly<{ user: UserRowView }>) {
  if (user.isVerified) {
    return (
      <span className="badge badge--green" title={`Ověřeno ${user.verifiedAtLabel ?? ''}`}>
        Ověřen
      </span>
    )
  }
  return <span className="badge badge--gold">Neověřen</span>
}

export function UsersTable({ users }: Readonly<{ users: UserRowView[] }>) {
  if (users.length === 0) {
    return (
      <div className="card card--dashed">
        <p className="empty-title">Žádní uživatelé neodpovídají výběru</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Objednávat jde i bez účtu, takže seznam může chvíli zůstat prázdný.
        </p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card card--flush">
        {users.length === 0 ? (
          <p className="muted" style={{ padding: '20px 0' }}>
            Nic neodpovídá.
          </p>
        ) : (
          users.map((user) => (
            <div key={user.id} className="users-row">
              <div>
                <Link href={`/admin/uzivatele/${user.id}`} style={{ fontWeight: 600 }}>
                  {user.name}
                </Link>
                <div className="muted">{user.email}</div>
              </div>

              <div className="row" style={{ gap: 6 }}>
                <VerifiedBadge user={user} />
                {user.isFarmer ? <span className="badge badge--muted">Farmář</span> : null}
                {user.isActive ? null : (
                  <span className="badge badge--clay">Deaktivován</span>
                )}
              </div>

              <div className="muted">
                Registrace
                <div style={{ color: 'var(--ink)' }}>{user.registeredAtLabel}</div>
              </div>

              <div className="muted">
                Objednávky
                <div style={{ color: 'var(--ink)' }}>
                  {user.orderCount}
                  {user.cancelledCount > 0 ? (
                    <span style={{ color: 'var(--clay)' }}> ({user.cancelledCount} zrušeno)</span>
                  ) : null}
                </div>
              </div>

              <div className="muted">
                Utraceno
                <div className="display" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                  {user.totalSpentLabel}
                </div>
              </div>

              <Link href={`/admin/uzivatele/${user.id}`} className="btn btn--secondary">
                Profil
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
