'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { reserveOrderAction } from '@/app/actions/order'
import type { VarietyView } from '@/application/dto'
import { useCart } from '@/components/cart/cart-provider'
import {
  type CheckoutErrors,
  type CheckoutForm,
  hasErrors,
  validateCheckout,
} from '@/components/cart/checkout-validation'
import {
  DELIVERY_LABELS,
  DeliveryMethod,
  PAYMENT_LABELS,
  PaymentMethod,
} from '@/domain/enums'

const FREE_DELIVERY_ABOVE_CZK = 600
const DELIVERY_FEE_CZK = 60

const formatCzk = (value: number) =>
  `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: value % 1 === 0 ? 0 : 2, minimumFractionDigits: value % 1 === 0 ? 0 : 2 }).format(value)} Kč`

const formatKg = (value: number) =>
  `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1 }).format(value)} kg`

export function Checkout({ varieties }: { varieties: VarietyView[] }) {
  const { lines, dispatch } = useCart()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [serverError, setServerError] = useState('')

  const [form, setForm] = useState<CheckoutForm>({
    name: '',
    email: '',
    phone: '',
    note: '',
    delivery: DeliveryMethod.PICKUP,
    payment: PaymentMethod.QR_CODE,
  })

  const byId = useMemo(() => new Map(varieties.map((variety) => [variety.id, variety])), [varieties])

  const rows = lines
    .map((line) => {
      const variety = byId.get(line.varietyId)
      return variety ? { line, variety, total: variety.priceCzk * line.quantityKg } : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  const subtotal = rows.reduce((sum, row) => sum + row.total, 0)
  const totalKg = rows.reduce((sum, row) => sum + row.line.quantityKg, 0)

  /**
   * Souhrn na klientovi je jen náhled. Závazná částka je ta, kterou spočítá server
   * z vlastních cen — klientská čísla se do objednávky nikdy nedostanou.
   */
  const deliveryFee =
    form.delivery === DeliveryMethod.LOCAL_DELIVERY && subtotal <= FREE_DELIVERY_ABOVE_CZK
      ? DELIVERY_FEE_CZK
      : 0

  const update = (patch: Partial<CheckoutForm>) => setForm((current) => ({ ...current, ...patch }))

  /**
   * Záměrně bez `useTransition`: `router.push` volaný uvnitř přechodu se v App Routeru
   * ztratí — server action doběhne, košík se vyprázdní, ale k navigaci nedojde.
   * Vlastní příznak `pending` dělá totéž pro zablokování tlačítka a navigace proběhne
   * mimo přechod.
   */
  const submit = async () => {
    const found = validateCheckout(form)
    setErrors(found)
    setServerError('')
    if (hasErrors(found)) return

    setPending(true)
    try {
      const result = await reserveOrderAction({
        customer: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          note: form.note,
        },
        delivery: form.delivery,
        payment: form.payment,
        items: lines.map((line) => ({
          varietyId: line.varietyId,
          quantityKg: line.quantityKg,
        })),
      })

      if (!result.ok) {
        setServerError(result.error)
        return
      }

      dispatch({ type: 'clear' })
      router.push(`/rezervace/${result.value.token}`)
    } finally {
      setPending(false)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="card card--dashed">
        <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Košík je zatím prázdný</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Vyberte si odrůdu v burze.
        </p>
        <Link href="/burza" className="btn btn--primary" style={{ marginTop: 20 }}>
          Do burzy
        </Link>
      </div>
    )
  }

  return (
    <div className="cart">
      <div className="stack" style={{ gap: 16 }}>
        <div className="card card--flush">
          {rows.map(({ line, variety, total }) => (
            <div key={line.varietyId} className="cart__line">
              <span className="cart__bar" style={{ background: variety.colorHex }} aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{variety.name}</div>
                <div className="muted">
                  {variety.priceLabel}/kg · {formatKg(line.quantityKg)}
                </div>
              </div>
              <div className="display" style={{ fontWeight: 700, fontSize: 18 }}>
                {formatCzk(total)}
              </div>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => dispatch({ type: 'remove', varietyId: line.varietyId })}
                aria-label={`Odebrat ${variety.name} z košíku`}
              >
                odebrat
              </button>
            </div>
          ))}
        </div>

        <div className="card stack" style={{ gap: 16 }}>
          <h2 className="display h3">Kontakt</h2>
          <div className="form-grid">
            <label className="field">
              Jméno a příjmení
              <input
                className={errors.name ? 'input input--error' : 'input'}
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Jan Novák"
                autoComplete="name"
              />
              {errors.name ? <span className="error-text">{errors.name}</span> : null}
            </label>

            <label className="field">
              Telefon
              <input
                className={errors.phone ? 'input input--error' : 'input'}
                value={form.phone}
                onChange={(event) => update({ phone: event.target.value })}
                placeholder="+420 777 123 456"
                autoComplete="tel"
              />
              {errors.phone ? <span className="error-text">{errors.phone}</span> : null}
            </label>

            <label className="field field--span2">
              E-mail (sem přijde potvrzení)
              <input
                className={errors.email ? 'input input--error' : 'input'}
                value={form.email}
                onChange={(event) => update({ email: event.target.value })}
                placeholder="jan@email.cz"
                autoComplete="email"
                type="email"
              />
              {errors.email ? <span className="error-text">{errors.email}</span> : null}
            </label>
          </div>

          <h2 className="display h3">Převzetí</h2>
          <div className="chip-row">
            {Object.values(DeliveryMethod).map((method) => (
              <button
                key={method}
                type="button"
                className="chip"
                aria-pressed={form.delivery === method}
                onClick={() => update({ delivery: method })}
              >
                {DELIVERY_LABELS[method]}
              </button>
            ))}
          </div>

          <h2 className="display h3">Platba</h2>
          <div className="chip-row">
            {Object.values(PaymentMethod).map((method) => (
              <button
                key={method}
                type="button"
                className="chip"
                aria-pressed={form.payment === method}
                onClick={() => update({ payment: method })}
              >
                {PAYMENT_LABELS[method]}
              </button>
            ))}
          </div>

          <label className="field">
            Poznámka pro farmáře
            <textarea
              className="textarea"
              rows={2}
              value={form.note}
              onChange={(event) => update({ note: event.target.value })}
              placeholder="Přijedu v sobotu dopoledne…"
            />
          </label>
        </div>
      </div>

      <div className="card card--ink summary">
        <h2 className="display h3">Souhrn</h2>
        <div className="summary__row" style={{ marginTop: 18 }}>
          <span>Brambory</span>
          <span>{formatCzk(subtotal)}</span>
        </div>
        <div className="summary__row">
          <span>
            {form.delivery === DeliveryMethod.LOCAL_DELIVERY ? 'Rozvoz' : 'Osobní odběr'}
          </span>
          <span>{deliveryFee === 0 ? 'zdarma' : formatCzk(deliveryFee)}</span>
        </div>
        <hr className="rule" />
        <div className="summary__total">
          <span style={{ fontWeight: 600 }}>Celkem</span>
          <span className="summary__amount">{formatCzk(subtotal + deliveryFee)}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6 }}>
          {formatKg(totalKg)} celkem · {PAYMENT_LABELS[form.payment]}
        </p>

        {serverError ? (
          <p className="alert alert--error" role="alert" style={{ marginTop: 14 }}>
            {serverError}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn--gold btn--block btn--lg"
          style={{ marginTop: 20 }}
          onClick={() => void submit()}
          disabled={pending}
        >
          {pending ? 'Rezervuji…' : 'Závazně rezervovat'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 12, lineHeight: 1.5 }}>
          Potvrzení dorazí vám i farmáři e-mailem. Zboží držíme 5 dní.
        </p>
      </div>
    </div>
  )
}
