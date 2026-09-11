import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { GetOrderByToken } from '@/application/use-cases/get-order-by-token'
import { NotFoundError } from '@/domain/errors'
import { getContainer } from '@/infrastructure/di/container'

/** Stránka nese osobní údaje, takže nesmí skončit v žádné cache. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rezervace přijata',
  robots: { index: false, follow: false },
}

export default async function ConfirmationPage({
  params,
}: {
  // V Next 15 jsou parametry cesty Promise.
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const container = getContainer()

  const order = await new GetOrderByToken({
    uow: container.uow,
    presenter: container.presenter,
  })
    .execute(token)
    .catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound()
      throw error
    })

  return (
    <div className="shell section rise" style={{ maxWidth: 1000 }}>
      <div className="alert alert--success" style={{ padding: 30, borderRadius: 'var(--radius-xl)' }}>
        <h1 className="display" style={{ fontSize: 32, letterSpacing: '-0.02em' }}>
          Rezervace {order.code} přijata
        </h1>
        <p style={{ color: '#2f4a3a', margin: '10px 0 0', lineHeight: 1.6 }}>
          Odečetli jsme {order.totalKgLabel} ze skladu. Odesláno potvrzení na{' '}
          <strong>{order.customerEmail}</strong> a upozornění farmáři.
        </p>
      </div>

      {order.payment ? (
        <section className="card" style={{ marginTop: 20 }}>
          <h2 className="display h3">Platba převodem</h2>
          <div className="payment" style={{ marginTop: 18 }}>
            {order.payment.qrDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- QR se generuje
                 za běhu jako data URI, optimalizátor Next.js s ním nemá co dělat */
              <img
                className="payment__qr"
                src={order.payment.qrDataUrl}
                alt={`QR kód pro platbu ${order.payment.amountLabel}`}
                width={220}
                height={220}
              />
            ) : null}

            <div>
              {/* Údaje jsou čitelné i bez QR kódu — ten je zkratka, ne jediná cesta. */}
              <table className="payment__table">
                <tbody>
                  <tr>
                    <th scope="row">Číslo účtu</th>
                    <td>
                      <code className="payment__value">{order.payment.accountNumber}</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">IBAN</th>
                    <td>
                      <code className="payment__value">{order.payment.ibanFormatted}</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Částka</th>
                    <td>
                      <code className="payment__value">{order.payment.amountLabel}</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Variabilní symbol</th>
                    <td>
                      <code className="payment__value">{order.payment.variableSymbol}</code>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Zpráva pro příjemce</th>
                    <td>
                      <code className="payment__value">{order.payment.recipientMessage}</code>
                    </td>
                  </tr>
                </tbody>
              </table>

              <p style={{ color: 'var(--muted-strong)', lineHeight: 1.6, marginTop: 14 }}>
                {order.payment.instruction}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid-auto" style={{ marginTop: 20 }}>
        {order.mails.map((mail) => (
          <article key={mail.kind} className="news-card">
            <div
              style={{
                padding: '12px 18px',
                background: 'var(--sand)',
                borderBottom: '1px solid var(--line)',
              }}
            >
              <span className="eyebrow">{mail.kind}</span>
            </div>
            <div className="news-card__body">
              <p className="muted" style={{ margin: 0 }}>
                Komu: <strong style={{ color: 'var(--ink)' }}>{mail.to}</strong>
              </p>
              <h3 className="display h3">{mail.subject}</h3>
              <p className="news-card__text" style={{ fontSize: 14 }}>
                {mail.body}
              </p>
            </div>
          </article>
        ))}
      </section>

      <Link href="/" className="btn btn--ghost" style={{ marginTop: 24 }}>
        Zpět na úvod
      </Link>
    </div>
  )
}
