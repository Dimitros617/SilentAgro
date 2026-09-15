'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { loginAction, registerAction } from '@/app/actions/auth'
import type { AuthResult } from '@/application/dto'
import type { Result } from '@/shared/result'

type Mode = 'login' | 'register'

const initialState: Result<AuthResult, string> | null = null

/**
 * Nativní `<dialog>` otevřený přes `showModal()`, ne vlastní překryv.
 *
 * Hlavička má `backdrop-filter`, a ta z ní dělá containing block pro potomky
 * s `position: fixed`. Vlastní překryv uvnitř hlavičky se proto nepozicoval podle
 * okna prohlížeče, ale podle sedmdesátipixelové hlavičky, a okno vylétlo nad
 * viditelnou plochu. `<dialog>` se vykresluje v top layer, kde na containing block
 * nenarazí, a navíc sám drží fokus a zavírá se Escapem.
 */
export function AuthModal({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const [mode, setMode] = useState<Mode>('login')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    mode === 'login' ? loginAction : registerAction,
    initialState,
  )
  let submitLabel = 'Přihlásit se'
  if (mode === 'register') submitLabel = 'Vytvořit účet'
  if (pending) submitLabel = 'Pracuji…'

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (state?.ok) {
      onClose()
      // Hlavička a případná administrace se mění podle role, takže se stránka
      // musí načíst znovu ze serveru — klientský stav o session nic neví.
      router.refresh()
      if (state.value.role === 'FARMER') router.push('/admin')
    }
  }, [state, onClose, router])

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby="auth-modal-title"
      // Zachytí i zavření Escapem, které si dialog obslouží sám.
      onClose={onClose}
      onClick={(event) => {
        // Kliknutí do ztmavení hlásí jako cíl samotný dialog; kliknutí dovnitř
        // obsahu hlásí vnořený prvek.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal__content">
        <h2 id="auth-modal-title" className="visually-hidden">
          Přihlášení a registrace
        </h2>

        <div className="pill-group" role="tablist">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              className="pill"
              style={{ flex: 1 }}
              aria-selected={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'login' ? 'Přihlášení' : 'Registrace'}
            </button>
          ))}
        </div>

        <form action={formAction} className="stack" style={{ gap: 12, marginTop: 20 }}>
          {mode === 'register' ? (
            <label className="field">
              Jméno a příjmení
              <input
                className="input"
                name="name"
                autoComplete="name"
                placeholder="Jan Novák"
                required
              />
            </label>
          ) : null}

          <label className="field">
            E-mail
            <input
              className="input"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="jan@email.cz"
              required
            />
          </label>

          <label className="field">
            Heslo
            <input
              className="input"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
          </label>

          {state && !state.ok ? (
            <p className="alert alert--error" role="alert">
              {state.error}
            </p>
          ) : null}

          <button type="submit" className="btn btn--dark btn--block btn--lg" disabled={pending}>
            {submitLabel}
          </button>

          <button type="button" className="btn btn--danger" onClick={onClose}>
            Zavřít
          </button>
        </form>
      </div>
    </dialog>
  )
}

/** Otevře okno, když middleware přesměroval z chráněné stránky. */
export function useAuthPrompt(openModal: () => void): void {
  const params = useSearchParams()

  useEffect(() => {
    if (params.get('prihlaseni') === 'vyzadovano') openModal()
  }, [params, openModal])
}
