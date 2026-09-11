import type { Metadata } from 'next'
import Link from 'next/link'
import { VerifyEmail } from '@/application/use-cases/users'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ověření e-mailu',
  robots: { index: false, follow: false },
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const container = getContainer()

  const result = await new VerifyEmail({ uow: container.uow, clock: container.clock })
    .execute(token)
    .then((value) => ({ ok: true as const, value }))
    // Neplatný i prošlý odkaz vypadá stejně — z hlášky nemá jít poznat,
    // jestli token někdy platil.
    .catch(() => ({ ok: false as const }))

  return (
    <div className="shell section" style={{ maxWidth: 640 }}>
      {result.ok ? (
        <>
          <div className="alert alert--success" style={{ padding: 30, borderRadius: 'var(--radius-xl)' }}>
            <h1 className="display" style={{ fontSize: 30 }}>
              E-mail potvrzen
            </h1>
            <p style={{ color: '#2f4a3a', margin: '10px 0 0', lineHeight: 1.6 }}>
              Děkujeme, {result.value.name}. Adresu <strong>{result.value.email}</strong> máme ověřenou.
            </p>
          </div>
          <div className="hero__actions">
            <Link href="/burza" className="btn btn--primary">
              Do burzy
            </Link>
            <Link href="/" className="btn btn--ghost">
              Na úvod
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="display h1">Odkaz už neplatí</h1>
          <p className="lead">
            Ověřovací odkaz je jednorázový a platí 48 hodin. Přihlaste se a nechte si
            poslat nový, nebo napište na farma@silentagro.cz.
          </p>
          <div className="hero__actions">
            <Link href="/" className="btn btn--primary">
              Na úvod
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
