import type { AuthResult } from '@/application/dto'
import { requireFarmer } from '@/infrastructure/auth/session'
import { type Result, ok } from '@/shared/result'
import { toResultError } from './errors'

/**
 * Obal hranice server action: výjimku nepustí ven, vrátí `Result`.
 *
 * Soubor nemá direktivu 'use server' schválně — platí tu totéž co pro `errors.ts`:
 * v takovém souboru smí být exportované jen asynchronní funkce volatelné z klienta,
 * a tohle jsou obyčejné pomocné funkce, které server actions importují.
 */
export async function asResult<T>(run: () => Promise<T>): Promise<Result<T, string>> {
  try {
    return ok(await run())
  } catch (error) {
    return toResultError(error)
  }
}

/**
 * Totéž, ale roli ověří dřív, než pustí tělo akce ke slovu.
 *
 * Kontrola je tady, a ne jen v middlewaru: ten přesměrovává prohlížeč, kdežto server
 * action se dá zavolat přímým POSTem. Tím, že se `requireFarmer` volá uvnitř obalu,
 * ji nejde v nové akci zapomenout — pokud akce používá `asFarmer`, kontrola proběhla.
 */
export async function asFarmer<T>(
  run: (session: AuthResult) => Promise<T>,
): Promise<Result<T, string>> {
  return asResult(async () => run(await requireFarmer()))
}
