import { InsufficientStockError, isDomainError } from '@/domain/errors'
import { type Failure, err } from '@/shared/result'
import { formatKgNumber } from '@/shared/format'

/**
 * Převod výjimky na výsledek pro UI.
 *
 * Uživateli se ukáže `message` **jen u doménových chyb** — ty jsou psané pro něj.
 * Cokoli jiného (chyba Prismy, výpadek sítě, chyba v kódu) dostane obecnou hlášku;
 * hlášky databáze totiž prozrazují jména hostitelů, uživatelů i strukturu schématu.
 *
 * Soubor nemá direktivu 'use server' schválně: je to obyčejný modul, který server
 * actions importují. V souboru s 'use server' smí být exportované jen asynchronní
 * funkce, takže by tahle synchronní nešla vyvézt.
 */
export function toResultError(error: unknown): Failure<string> {
  if (error instanceof InsufficientStockError) {
    return err(
      `${error.varietyName}: na skladě zbývá jen ${formatKgNumber(error.availableKg)} kg`,
      error.code,
    )
  }

  if (isDomainError(error)) {
    return err(error.message, error.code)
  }

  console.error('[silentagro] neočekávaná chyba v server action', error)
  return err('Něco se nepovedlo. Zkuste to prosím znovu.', 'UNEXPECTED')
}
