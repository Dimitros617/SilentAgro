import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="shell section" style={{ maxWidth: 640 }}>
      <h1 className="display h1">Tady nic není</h1>
      <p className="lead">
        Stránka, kterou hledáte, neexistuje — nebo už vypršel odkaz na rezervaci.
      </p>
      <div className="hero__actions">
        <Link href="/" className="btn btn--primary">
          Zpět na úvod
        </Link>
        <Link href="/burza" className="btn btn--ghost">
          Do burzy
        </Link>
      </div>
    </div>
  )
}
