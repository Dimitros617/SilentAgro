import type { Clock } from '@/domain/ports/services'

interface Bucket {
  tokens: number
  lastRefill: number
}

/**
 * Token bucket pro omezení počtu pokusů.
 *
 * Stav je v paměti procesu, což pro jednu instanci stačí. Při škálování na víc replik
 * by každá měla vlastní kbelík a skutečný limit by se znásobil — tehdy je potřeba
 * sdílené úložiště. Pro farmu s jednou instancí je to zbytečná složitost.
 *
 * `Clock` je závislost proto, aby šlo doplňování tokenů otestovat bez čekání.
 */
export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>()
  private readonly maxIdleMs: number

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly clock: Clock,
  ) {
    // Jak dlouho trvá prázdnému kbelíku doplnit se na plnou kapacitu. Déle nečinný
    // záznam je k nerozeznání od nového, takže se dá zahodit.
    this.maxIdleMs =
      refillPerSecond > 0 ? (capacity / refillPerSecond) * 1000 : 60 * 60 * 1000
  }

  tryConsume(key: string, cost = 1): boolean {
    const now = this.clock.now().getTime()
    this.evictStale(now)

    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefill: now }

    const elapsedSeconds = Math.max(0, (now - bucket.lastRefill) / 1000)
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond)
    bucket.lastRefill = now

    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket)
      return false
    }

    bucket.tokens -= cost
    this.buckets.set(key, bucket)
    return true
  }

  /** Bez úklidu by mapa rostla s každou novou IP adresou, dokud proces neskončí. */
  private evictStale(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > this.maxIdleMs) this.buckets.delete(key)
    }
  }

  reset(): void {
    this.buckets.clear()
  }
}
