import type { ReservationAttempt } from './reservation-attempt'

interface ReservationRecoveryProps {
  readonly attempt: ReservationAttempt
  readonly pending: boolean
  readonly error: string
  readonly onContinue: () => void
  readonly onStartNew: () => void
}

export function ReservationRecovery({ attempt, pending, error, onContinue, onStartNew }: ReservationRecoveryProps) {
  const heading = attempt.token ? 'Rezervace je potvrzená' : 'Dokončení rezervace'
  const continueLabel = attempt.token ? 'Zobrazit potvrzení' : 'Znovu ověřit rezervaci'

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <h2 className="display h3">{heading}</h2>
      <p>Rezervace pro {attempt.form.name} ({attempt.form.email}). Při opakování použijeme stejné údaje.</p>
      {error ? <p className="alert alert--error" role="alert">{error}</p> : null}
      <button type="button" className="btn btn--primary" disabled={pending} onClick={onContinue}>
        {pending ? 'Ověřuji rezervaci…' : continueLabel}
      </button>
      <button type="button" className="btn btn--secondary" disabled={pending} onClick={onStartNew}>
        Začít novou rezervaci
      </button>
    </div>
  )
}
