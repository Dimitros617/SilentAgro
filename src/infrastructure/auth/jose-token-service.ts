import { SignJWT, jwtVerify } from 'jose'
import { UserRole } from '@/domain/enums'
import type { SessionPayload, TokenService } from '@/domain/ports/services'

const ALGORITHM = 'HS256'
const DEFAULT_TTL_SECONDS = 7 * 24 * 3600

const isKnownRole = (value: unknown): value is UserRole =>
  value === UserRole.CUSTOMER || value === UserRole.FARMER

/**
 * Session token. Používá `jose` místo `jsonwebtoken`, protože middleware Next.js běží
 * na Edge runtime, kde nejsou dostupné nodovské krypto moduly — `jose` staví na WebCrypto
 * a běží v obou prostředích stejně.
 */
export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array

  constructor(
    secret: string,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ) {
    this.key = new TextEncoder().encode(secret)
  }

  async sign(payload: SessionPayload): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000)

    return new SignJWT({ role: payload.role, name: payload.name })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(String(payload.userId))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      // Seznam algoritmů je povinný. Bez něj by knihovna přijala token, který si
      // algoritmus určí sám — včetně "none", tedy zcela bez podpisu.
      const { payload } = await jwtVerify(token, this.key, { algorithms: [ALGORITHM] })

      const userId = Number(payload.sub)
      if (!Number.isInteger(userId) || userId <= 0) return null

      // Role z tokenu otevírá administraci. Neznámou hodnotu nelze propustit dál,
      // i kdyby byl podpis v pořádku.
      if (!isKnownRole(payload.role)) return null

      return { userId, role: payload.role, name: String(payload.name ?? '') }
    } catch {
      return null
    }
  }
}
