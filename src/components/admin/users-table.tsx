'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { UserRowView } from '@/application/dto'

function VerifiedBadge({ user }: { user: UserRowView }) {
  if (user.isVerified) {
    return (
      <span className="badge badge--green" title={`Ověřeno ${user.verifiedAtLabel ?? ''}`}>
        Ověřen
      </span>
    )
  }
  return <span className="badge badge--gold">Neověřen</span>
}

export function UsersTable({ users }: { users: UserRowView[] }) {
  const [query, setQuery] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(false)

  const filtered = users.filter((user) => {
    if (onlyProblems && user.isVerified && user.isActive) return false
    if (query.trim().length === 0) return true

    const needle = query.trim().toLowerCase()
    return user.name.toLowerCase().includes(needle) || user.email.includes(needle)
  })

  if (users.length === 0) {
    return (
      <div className="card card--dashed">
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Zatím se nikdo nezaregistroval</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Objednávat jde i bez účtu, takže seznam může chvíli zůstat prázdný.
        </p>
      </div>
    )
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hledat podle jména nebo e-mailu"
          aria-label="Hledat uživatele"
        />
        <label className="paid">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(event) => setOnlyProblems(event.target.checked)}
          />
          <span>Jen neověření a deaktivovaní</span>
        </label>
        <span className="muted">
          {filtered.length} z {users.length}
        </span>
      </div>

      <div className="card card--flush">
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: '20px 0' }}>
            Nic neodpovídá.
          </p>
        ) : (
          filtered.map((user) => (
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
                  <span
                    className="badge"
                    style={{ background: 'var(--tint-clay)', color: 'var(--clay)' }}
                  >
                    Deaktivován
                  </span>
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
