'use client'

import { useEffect } from 'react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // `digest` je jediné, co React o produkční chybě prozradí klientovi; podrobnost
    // zůstává v serverovém logu, kam patří.
    console.error('[silentagro] chyba stránky', error.digest ?? error.message)
  }, [error])

  return (
    <div className="shell section" style={{ maxWidth: 640 }}>
      <h1 className="display h1">Něco se nepovedlo</h1>
      <p className="lead">
        Zkuste to prosím znovu. Pokud potíže trvají, ozvěte se nám — kontakt najdete v patičce.
      </p>
      <div className="hero__actions">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Zkusit znovu
        </button>
      </div>
      {error.digest ? (
        <p className="muted" style={{ marginTop: 16 }}>
          Kód chyby: {error.digest}
        </p>
      ) : null}
    </div>
  )
}
