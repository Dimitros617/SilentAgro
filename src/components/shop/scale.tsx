'use client'

import { useEffect, useRef, useState } from 'react'
import { useCart } from '@/components/cart/cart-provider'
import {
  MAX_POTATOES,
  panShift,
  potatoCount,
  potatoPlacement,
  tiltSequence,
  visiblePotatoes,
  weightCount,
} from './scale-model'

const BEAM_PIVOT_Y = 60

/**
 * Obrys pytle. Používá se třikrát — jako plátno, jako ořez pro brambory a nakonec
 * jako obrys nakreslený přes ně, aby silueta zůstala čitelná i u plného pytle.
 */
const SACK = 'M -31 37 C -36 12, -31 -12, -19 -22 L 19 -22 C 31 -12, 36 12, 31 37 Z'

const formatKg = (value: number) => String(value).replace('.', ',')

/** Krok dokmitu ramene i rozestup mezi sypajícími se bramborami. */
const TILT_STEP_MS = 320
const DROP_STAGGER_MS = 60
const LEAVE_MS = 520

function Potato({ index, delayMs, leaving }: Readonly<{ index: number; delayMs: number; leaving: boolean }>) {
  const { x, y, rotate, scale } = potatoPlacement(index)

  return (
    <g
      className={`scale__potato${leaving ? ' scale__potato--leaving' : ''}`}
      style={{
        transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`,
        animationDelay: leaving ? undefined : `${delayMs}ms`,
      }}
    >
      <ellipse rx="7" ry="5.2" fill="#c08b4e" />
      <ellipse cx="-1.6" cy="-1.4" rx="4.2" ry="2.6" fill="#d8a367" />
      <circle cx="2.4" cy="1.4" r="0.7" fill="#8d5f2c" />
      <circle cx="-2.8" cy="2" r="0.6" fill="#8d5f2c" />
    </g>
  )
}

export function Scale() {
  const { totalKg } = useCart()

  const target = visiblePotatoes(totalKg)
  const total = potatoCount(totalKg)

  // Brambory, které právě mizí, musí zůstat vykreslené, dokud dopadá animace.
  const [shown, setShown] = useState(target)
  const [enteredFrom, setEnteredFrom] = useState(0)
  const [leavingFrom, setLeavingFrom] = useState<number | null>(null)
  const [tilt, setTilt] = useState(0)
  const previousKg = useRef(totalKg)

  useEffect(() => {
    const delta = totalKg - previousKg.current
    previousKg.current = totalKg
    if (delta === 0) return

    const timers = tiltSequence(delta).map((angle, step) =>
      window.setTimeout(() => setTilt(angle), step * TILT_STEP_MS),
    )
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [totalKg])

  useEffect(() => {
    if (target >= shown) {
      setEnteredFrom(shown)
      setShown(target)
      setLeavingFrom(null)
      return
    }

    setLeavingFrom(target)
    const timer = window.setTimeout(() => {
      setShown(target)
      setLeavingFrom(null)
    }, LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [target, shown])

  const shift = panShift(tilt)
  const weights = weightCount(totalKg)

  return (
    <aside className="scale-panel" aria-labelledby="scale-title">
      <h2 id="scale-title" className="eyebrow" style={{ marginBottom: 10 }}>
        Vaše váha
      </h2>

      <svg className="scale" viewBox="0 0 250 224" role="img" aria-hidden="true">
        <defs>
          <clipPath id="scale-sack-clip">
            <path d={SACK} />
          </clipPath>
        </defs>

        {/* Stojan */}
        <path d="M 101 212 L 149 212 L 141 198 L 109 198 Z" fill="#8a6a44" />
        <rect x="121" y="58" width="8" height="142" rx="3" fill="#9c7a50" />
        <circle cx="125" cy="57" r="5" fill="var(--gold, #c79a3b)" />

        {/* Rameno se otáčí kolem čepu, misky jedou svisle s jeho konci. */}
        <g
          className="scale__beam"
          style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '125px 60px' }}
        >
          <rect x="45" y="57" width="160" height="6" rx="3" fill="var(--gold, #c79a3b)" />
          <circle cx="45" cy="60" r="3.4" fill="#8a6a44" />
          <circle cx="205" cy="60" r="3.4" fill="#8a6a44" />
        </g>

        {/* Levá miska: závaží. Závěsy jsou dlouhé schválně — obsah misky se
            skládá nahoru a s krátkými závěsy by přerostl vahadlo. */}
        <g
          className="scale__pan"
          style={{ transform: `translate(45px, ${BEAM_PIVOT_Y + shift.left}px)` }}
        >
          <path d="M 0 0 L -34 84 M 0 0 L 34 84" stroke="#8a6a44" strokeWidth="1.4" fill="none" />
          <ellipse cy="84" rx="38" ry="6" fill="var(--gold, #c79a3b)" />
          {Array.from({ length: weights }, (_, index) => (
            <path
              key={index}
              d="M -12 0 L 12 0 L 9 -9 L -9 -9 Z"
              transform={`translate(0, ${81 - index * 9})`}
              fill="#b8912f"
              stroke="#8a6a44"
              strokeWidth="0.8"
            />
          ))}
        </g>

        {/* Pravá miska: pytel */}
        <g
          className="scale__pan"
          style={{ transform: `translate(205px, ${BEAM_PIVOT_Y + shift.right}px)` }}
        >
          <path d="M 0 0 L -34 84 M 0 0 L 34 84" stroke="#8a6a44" strokeWidth="1.4" fill="none" />
          <ellipse cy="84" rx="38" ry="6" fill="var(--gold, #c79a3b)" />
          {/* Pytel stojí na misce, ne na čepu — proto posun. Ořez je uvnitř
              stejného posunu, takže brambory sedí s obrysem. */}
          <g transform="translate(0, 47)">
            <path d={SACK} fill="#e3d5b4" />
            <g clipPath="url(#scale-sack-clip)" data-testid="scale-potatoes">
              {Array.from({ length: shown }, (_, index) => (
                <Potato
                  key={index}
                  index={index}
                  delayMs={Math.max(0, index - enteredFrom) * DROP_STAGGER_MS}
                  leaving={leavingFrom !== null && index >= leavingFrom}
                />
              ))}
            </g>
            <path d={SACK} fill="none" stroke="#b39c66" strokeWidth="1.6" />
            {/* Hrdlo se kreslí až nad bramborami, jinak by ho plný pytel překryl
                a silueta by se změnila v hromadu. */}
            <path
              d="M -19 -22 L -14 -35 L 14 -35 L 19 -22 Z"
              fill="#d3c096"
              stroke="#b39c66"
              strokeWidth="1.4"
            />
            <rect x="-16" y="-30" width="32" height="4" rx="2" fill="#a98f57" />
          </g>
        </g>
      </svg>

      <p className="scale__total" role="status" data-testid="scale-total">
        {total === 0 ? (
          <span className="muted">Pytel je zatím prázdný</span>
        ) : (
          <>
            <strong>{formatKg(totalKg)} kg</strong>
            <span className="muted"> v košíku</span>
            {total > MAX_POTATOES ? (
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                pytel ukazuje prvních {MAX_POTATOES} brambor
              </span>
            ) : null}
          </>
        )}
      </p>
    </aside>
  )
}
