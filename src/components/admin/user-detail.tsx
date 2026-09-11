'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  markUserVerifiedAction,
  resendVerificationAction,
  sendUserMessageAction,
  setUserActiveAction,
} from '@/app/actions/admin'
import type { UserDetailView } from '@/application/dto'
import { useToast } from '@/components/layout/toast'
import { OrdersTable } from './orders-table'

export function UserDetail({ initial }: { initial: UserDetailView }) {
  const [user, setUser] = useState(initial)
  const [pending, setPending] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [messageError, setMessageError] = useState('')
  const { show } = useToast()

  const run = async (action: () => Promise<void>) => {
    setPending(true)
    try {
      await action()
    } finally {
      setPending(false)
    }
  }

  const verify = () =>
    run(async () => {
      const result = await markUserVerifiedAction(user.id)
      if (result.ok) {
        // Statistiky se ručním ověřením nemění, takže se přebírají jen údaje o účtu.
        setUser((current) => ({ ...current, ...result.value, orders: current.orders }))
        show('Účet ověřen')
      } else {
        show(result.error)
      }
    })

  const resend = () =>
    run(async () => {
      const result = await resendVerificationAction(user.id)
      show(result.ok ? 'Ověřovací e-mail odeslán' : result.error)
    })

  const toggleActive = () =>
    run(async () => {
      const result = await setUserActiveAction(user.id, !user.isActive)
      if (result.ok) {
        setUser((current) => ({ ...current, ...result.value, orders: current.orders }))
        show(result.value.isActive ? 'Účet aktivován' : 'Účet deaktivován')
      } else {
        show(result.error)
      }
    })

  const sendMessage = () =>
    run(async () => {
      setMessageError('')
      const result = await sendUserMessageAction(user.id, subject, body)

      if (result.ok) {
        setSubject('')
        setBody('')
        show('Zpráva odeslána')
      } else {
        // Chyba u zprávy se ukazuje u formuláře, ne jen v toastu — farmář musí
        // vidět, že se neodeslala, i když mezitím odešel pohledem jinam.
        setMessageError(result.error)
      }
    })

  return (
    <div className="stack" style={{ gap: 18 }}>
      <p className="muted">
        <Link href="/admin/uzivatele">← Zpět na seznam</Link>
      </p>

      <div className="grid-two" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <section className="card stack" style={{ gap: 12 }}>
          <div className="row row--between row--baseline">
            <h2 className="display h3">{user.name}</h2>
            <div className="row" style={{ gap: 6 }}>
              {user.isVerified ? (
                <span className="badge badge--green">Ověřen</span>
              ) : (
                <span className="badge badge--gold">Neověřen</span>
              )}
              {user.isActive ? null : (
                <span
                  className="badge"
                  style={{ background: 'var(--tint-clay)', color: 'var(--clay)' }}
                >
                  Deaktivován
                </span>
              )}
              {user.isFarmer ? <span className="badge badge--muted">Farmář</span> : null}
            </div>
          </div>

          <table className="payment__table">
            <tbody>
              <tr>
                <th scope="row">E-mail</th>
                <td>
                  <a href={`mailto:${user.email}`}>{user.email}</a>
                </td>
              </tr>
              <tr>
                <th scope="row">Registrace</th>
                <td>{user.registeredAtLabel}</td>
              </tr>
              <tr>
                <th scope="row">Ověřeno</th>
                <td>{user.verifiedAtLabel ?? '—'}</td>
              </tr>
              <tr>
                <th scope="row">Objednávek</th>
                <td>
                  {user.orderCount}
                  {user.cancelledCount > 0 ? ` (${user.cancelledCount} zrušeno)` : ''}
                </td>
              </tr>
              <tr>
                <th scope="row">Utraceno</th>
                <td>{user.totalSpentLabel}</td>
              </tr>
              <tr>
                <th scope="row">Poslední objednávka</th>
                <td>{user.lastOrderAtLabel ?? '—'}</td>
              </tr>
              {user.isActive ? null : (
                <tr>
                  <th scope="row">Deaktivován</th>
                  <td>{user.deactivatedAtLabel}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="row" style={{ gap: 8 }}>
            {user.isVerified ? null : (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void verify()}
                  disabled={pending}
                >
                  Ověřit ručně
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void resend()}
                  disabled={pending}
                >
                  Poslat ověření znovu
                </button>
              </>
            )}

            {user.isFarmer ? null : (
              <button
                type="button"
                className="btn btn--ghost"
                style={user.isActive ? { color: 'var(--clay)', borderColor: '#e8d4cd' } : undefined}
                onClick={() => void toggleActive()}
                disabled={pending}
              >
                {user.isActive ? 'Deaktivovat účet' : 'Aktivovat účet'}
              </button>
            )}
          </div>
        </section>

        <section className="card stack" style={{ gap: 12 }}>
          <h2 className="display h3">Napsat zprávu</h2>
          <p className="muted" style={{ margin: 0 }}>
            Odejde na {user.email} jako běžný e-mail od farmy.
          </p>

          <label className="field">
            Předmět
            <input
              className="input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Ohledně vaší objednávky"
            />
          </label>

          <label className="field">
            Text
            <textarea
              className="textarea"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Dobrý den, brambory máme připravené…"
            />
          </label>

          {messageError ? (
            <p className="alert alert--error" role="alert">
              {messageError}
            </p>
          ) : null}

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void sendMessage()}
            disabled={pending || subject.trim().length === 0 || body.trim().length === 0}
          >
            Odeslat zprávu
          </button>
        </section>
      </div>

      <section className="stack" style={{ gap: 10 }}>
        <h2 className="display h3">Objednávky</h2>
        {/*
          Tatáž tabulka jako v záložce Objednávky, jen omezená na tohoto zákazníka.
          Farmář tak má i z profilu k dispozici stejné operace — posun stavu,
          označení platby i zrušení — místo aby musel přepínat jinam a hledat řádek.
        */}
        <OrdersTable orders={user.orders} />
      </section>
    </div>
  )
}
