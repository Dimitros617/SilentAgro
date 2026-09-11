import { describe, expect, it } from 'vitest'
import { TokenBucket } from '@/infrastructure/rate-limit/token-bucket'

const clockAt = (start: string) => {
  let current = new Date(start)
  return {
    clock: { now: () => current },
    advance: (seconds: number) => {
      current = new Date(current.getTime() + seconds * 1000)
    },
  }
}

describe('TokenBucket', () => {
  it('propustí do kapacity a pak odmítne', () => {
    const { clock } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(3, 1 / 60, clock)

    expect([1, 2, 3].map(() => bucket.tryConsume('1.2.3.4'))).toEqual([true, true, true])
    expect(bucket.tryConsume('1.2.3.4')).toBe(false)
  })

  it('doplní tokeny s časem', () => {
    const { clock, advance } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(1, 1 / 60, clock)

    expect(bucket.tryConsume('a')).toBe(true)
    expect(bucket.tryConsume('a')).toBe(false)

    advance(60)
    expect(bucket.tryConsume('a')).toBe(true)
  })

  it('nedoplní nad kapacitu', () => {
    const { clock, advance } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(2, 1, clock)

    expect(bucket.tryConsume('a')).toBe(true)
    advance(3600)

    expect(bucket.tryConsume('a')).toBe(true)
    expect(bucket.tryConsume('a')).toBe(true)
    expect(bucket.tryConsume('a')).toBe(false)
  })

  it('drží klíče odděleně', () => {
    const { clock } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(1, 0, clock)

    expect(bucket.tryConsume('a')).toBe(true)
    expect(bucket.tryConsume('b')).toBe(true)
    expect(bucket.tryConsume('a')).toBe(false)
  })

  it('zahodí dlouho nečinné klíče, aby mapa nerostla bez omezení', () => {
    const { clock, advance } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(1, 1 / 60, clock)

    bucket.tryConsume('stara-ip')
    advance(3600)

    // po úklidu je klíč jako nový a má plnou kapacitu
    expect(bucket.tryConsume('stara-ip')).toBe(true)
  })

  it('umí odečíst víc tokenů najednou', () => {
    const { clock } = clockAt('2026-09-10T10:00:00Z')
    const bucket = new TokenBucket(5, 0, clock)

    expect(bucket.tryConsume('a', 3)).toBe(true)
    expect(bucket.tryConsume('a', 3)).toBe(false)
    expect(bucket.tryConsume('a', 2)).toBe(true)
  })
})
