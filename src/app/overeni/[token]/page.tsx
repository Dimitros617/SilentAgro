import type { Metadata } from 'next'
import Link from 'next/link'
import { VerifyEmail } from '@/application/use-cases/users'
import { VERIFICATION_TTL_HOURS } from '@/application/verification-policy'
import { NotFoundError } from '@/domain/errors'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ověření e-mailu',
  robots: { index: false, follow: false },
}

export default async function VerifyPage({ params }: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const container = getContainer()

  let verified: { name: string; email: string } | null = null
  try {
    verified = await new VerifyEmail({ uow: container.uow, clock: container.clock }).execute(token)
  } catch (error) {
    // Výpadek databáze patří do chybové stránky, ne mezi neplatné odkazy.
    if (!(error instanceof NotFoundError)) throw error
  }

  return (
    <div className="shell section" style={{ maxWidth: 640 }}>
      {verified ? (
        <>
          <div className="alert alert--success" style={{ padding: 30, borderRadius: 'var(--radius-xl)' }}>
            <h1 className="display" style={{ fontSize: 30 }}>
              E-mail potvrzen
            </h1>
            <p style={{ color: '#2f4a3a', margin: '10px 0 0', lineHeight: 1.6 }}>
              Děkujeme, {verified.name}. Adresu <strong>{verified.email}</strong> máme ověřenou.
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
            Ověřovací odkaz je jednorázový a platí {VERIFICATION_TTL_HOURS} hodin.
            Pro nový odkaz napište na {container.farm.email}.
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
