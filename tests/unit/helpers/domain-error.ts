import { expect } from 'vitest'
import type { DomainError } from '@/domain/errors'

/**
 * Ověří třídu chyby i její obsah.
 *
 * Samotné `toMatchObject` projde i na holém `Error`, kterému někdo dopsal `code` —
 * jenže hranice server action (`toResultError`) větví přes `instanceof DomainError`.
 * Kdyby use-case přestal házet doménovou třídu, uživatel dostane obecnou hlášku
 * „Něco se nepovedlo“ a test by o tom mlčel.
 */
export async function expectDomainError(
  promise: Promise<unknown>,
  expected: new (...args: never[]) => DomainError,
  shape: { readonly code: string; readonly message: string },
): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(expected)
  await expect(promise).rejects.toMatchObject(shape)
}
