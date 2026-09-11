import bcrypt from 'bcryptjs'
import type { PasswordHasher } from '@/domain/ports/services'

const DEFAULT_COST = 12

/**
 * Hashování hesel přes `bcryptjs` místo nativního `bcrypt`.
 *
 * Nativní modul by v `node:22-alpine` vyžadoval `python3`, `make` a `g++` v build stagi
 * a musel by se kompilovat pro konkrétní architekturu. Čistě JS varianta je pomalejší,
 * ale u přihlášení jde o jednotky stovek milisekund a image zůstane malý a build
 * deterministický napříč platformami.
 */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost: number = DEFAULT_COST) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost)
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plain, hash)
    } catch {
      // Poškozený hash v databázi znamená neúspěšné přihlášení, ne pád aplikace.
      return false
    }
  }
}
