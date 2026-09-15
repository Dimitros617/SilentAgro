import type { HarvestPointView } from '@/application/dto'
import { formatKgNumber } from '@/shared/format'

const WIDTH = 620
const HEIGHT = 190
const HEADROOM = 1.15

/**
 * Sloupce = denní výkop, čára = stav skladu. Vykresluje se na serveru jako obyčejné SVG,
 * bez knihovny a bez klientského JavaScriptu — data se během prohlížení stránky nemění,
 * takže by knihovna přidala jen kilobajty a další vrstvu, která může selhat.
 */
export function HarvestChart({ points, height = HEIGHT }: Readonly<{ points: HarvestPointView[]; height?: number }>) {
  if (points.length === 0) {
    return <p className="muted">Zatím není co vykreslit.</p>
  }

  const maxValue = Math.max(...points.map((point) => Math.max(point.stockKg, point.dugKg)), 1)
  const tickTop = Math.max(100, Math.ceil((maxValue * HEADROOM) / 100) * 100)
  const step = WIDTH / points.length
  const y = (value: number) => HEIGHT - (value / tickTop) * HEIGHT

  const bars = points.map((point, index) => ({
    key: point.dateLabel,
    x: index * step + step * 0.22,
    width: step * 0.56,
    y: y(point.dugKg),
    height: Math.max(0, HEIGHT - y(point.dugKg)),
  }))

  const line = points
    .map((point, index) => `${(index * step + step / 2).toFixed(1)},${y(point.stockKg).toFixed(1)}`)
    .join(' ')

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => y(tickTop * fraction))
  const axisLabels = [1, 0.75, 0.5, 0.25, 0].map((fraction) => Math.round(tickTop * fraction))
  const visibleLabels = points.filter((_, index) => index % 3 === 0)

  const last = points.at(-1)
  const summary = `Denní výkop a stav skladu za posledních ${points.length} dní. Naposledy ${formatKgNumber(last?.stockKg ?? 0)} kg na skladě.`

  return (
    <>
      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch" aria-hidden="true" />
          Denní výkop
        </span>
        <span className="legend__item">
          <span className="legend__line" aria-hidden="true" />
          Stav skladu
        </span>
      </div>

      <div className="chart">
        <div className="chart__axis" style={{ height }}>
          {axisLabels.map((label) => (
            <span key={label}>{label} kg</span>
          ))}
        </div>

        <div className="chart__plot">
          {/* Bez textového popisu je graf pro odečítač obrazovky prázdný obrázek. */}
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height, display: 'block' }}
            role="img"
            aria-label={summary}
          >
            <title>{summary}</title>
            {gridLines.map((gridY) => (
              <line
                key={gridY}
                x1="0"
                y1={gridY}
                x2={WIDTH}
                y2={gridY}
                stroke="#f0ebdf"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {bars.map((bar) => (
              <rect
                key={bar.key}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill="#e0d5b8"
              />
            ))}
            <polyline
              points={line}
              fill="none"
              stroke="#1f6f4a"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="chart__labels">
            {visibleLabels.map((point) => (
              <span key={point.dateLabel}>{point.dateLabel}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
