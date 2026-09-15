import { describe, expect, it } from 'vitest'
import { toResultError } from '@/app/actions/errors'
import {
  AuthError,
  ForbiddenError,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from '@/domain/errors'

describe('toResultError', () => {
  it('u nedostatku skladu složí hlášku se zbývajícím množstvím', () => {
    const result = toResultError(new InsufficientStockError('Bernie', 2, 5))

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Bernie: na skladě zbývá jen 2 kg')
    expect(result.code).toBe('INSUFFICIENT_STOCK')
  })

  it('doménovou hlášku předá beze změny', () => {
    expect(toResultError(new ValidationError('Vyplňte jméno a příjmení')).error).toBe(
      'Vyplňte jméno a příjmení',
    )
  })

  it('zachová kód chyby, aby na něj UI mohlo reagovat', () => {
    expect(toResultError(new NotFoundError('Rezervace nenalezena')).code).toBe('NOT_FOUND')
    expect(toResultError(new ForbiddenError()).code).toBe('FORBIDDEN')
    expect(toResultError(new AuthError('Nesprávný e-mail nebo heslo')).code).toBe('AUTH')
  })

  it('u neznámé chyby nevypustí vnitřní detail', () => {
    // hlášky databáze prozrazují jména hostitelů, uživatelů i strukturu schématu
    const result = toResultError(new Error('Prisma: Access denied for user root@10.0.0.5'))

    expect(result.error).toBe('Něco se nepovedlo. Zkuste to prosím znovu.')
    expect(result.error).not.toContain('root@')
    expect(result.code).toBe('UNEXPECTED')
  })

  it('poradí si i s vyhozenou hodnotou, která není chyba', () => {
    expect(toResultError('rozbilo se to').error).toBe('Něco se nepovedlo. Zkuste to prosím znovu.')
    expect(toResultError(null).error).toBe('Něco se nepovedlo. Zkuste to prosím znovu.')
  })
})
