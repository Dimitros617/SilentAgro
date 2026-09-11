import type { BinView } from '@/application/dto'

/**
 * Sloupce zásobníků. `tone="ink"` je varianta pro tmavý panel na homepage,
 * `tone="light"` pro bílé karty na stránce skladu a v administraci.
 */
export function Bins({
  bins,
  tone = 'ink',
  height = 140,
  showKg = false,
}: {
  bins: BinView[]
  tone?: 'ink' | 'light'
  height?: number
  showKg?: boolean
}) {
  if (bins.length === 0) {
    return <p className="muted">Zatím žádná odrůda na skladě.</p>
  }

  return (
    <div className="bins" style={{ height }}>
      {bins.map((bin) => (
        <div key={bin.name} className="bin">
          <span className={tone === 'ink' ? 'bin__value' : 'bin__value bin__value--light'}>
            {showKg ? bin.kgLabel : bin.percentLabel}
          </span>
          <div className={tone === 'ink' ? 'bin__track' : 'bin__track bin__track--light'}>
            <div
              className="bin__fill"
              style={{ height: `${bin.percent}%`, background: bin.colorHex }}
            />
          </div>
          <span className="bin__label">{bin.name}</span>
        </div>
      ))}
    </div>
  )
}
