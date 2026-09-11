'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useActionState, useEffect, useState } from 'react'
import { loginAction, registerAction } from '@/app/actions/auth'
import type { AuthResult } from '@/application/dto'
import type { Result } from '@/shared/result'

type Mode = 'login' | 'register'

const initialState: Result<AuthResult, string> | null = null

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('login')
  const router = useRouter()

  const [state, formAction, pending] = useActionState(
    mode === 'login' ? loginAction : registerAction,
    initialState,
  )

  useEffect(() => {
    if (state?.ok) {
      onClose()
      // Hlavička a případná administrace se mění podle role, takže se stránka
      // musí načíst znovu ze serveru — klientský stav o session nic neví.
      router.refresh()
      if (state.value.role === 'FARMER') router.push('/admin')
    }
  }, [state, onClose, router])

  if (!open) return null

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onClick={onClose}
    >
      {/* Kliknutí uvnitř okna nesmí probublat na překryv, jinak by se okno zavřelo */}
      <div className="modal" onClick={(event) => event.stopPropagation()}>
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

        <form action={formAction} style={{ display: 'grid', gap: 12, marginTop: 20 }}>
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
            {pending
              ? 'Pracuji…'
              : mode === 'register'
                ? 'Vytvořit účet'
                : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  )
}

/** Otevře modal, když middleware přesměroval z chráněné stránky. */
export function useAuthPrompt(openModal: () => void): void {
  const params = useSearchParams()

  useEffect(() => {
    if (params.get('prihlaseni') === 'vyzadovano') openModal()
  }, [params, openModal])
}
