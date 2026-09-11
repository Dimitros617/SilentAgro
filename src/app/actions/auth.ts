'use server'

import { revalidatePath } from 'next/cache'
import type { AuthResult } from '@/application/dto'
import { LoginUser, RegisterUser } from '@/application/use-cases/auth'
import { RateLimitError } from '@/domain/errors'
import { clearSession, rateLimitKey, writeSession } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import { type Result, ok } from '@/shared/result'
import { toResultError } from './errors'

export async function loginAction(
  _previous: unknown,
  formData: FormData,
): Promise<Result<AuthResult, string>> {
  const container = getContainer()

  try {
    if (!container.limiters.login.tryConsume(await rateLimitKey())) {
      throw new RateLimitError('Příliš mnoho pokusů o přihlášení. Zkuste to prosím za chvíli.')
    }

    const result = await new LoginUser({
      uow: container.uow,
      hasher: container.hasher,
    }).execute({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    })

    await writeSession({ userId: result.userId, role: result.role, name: result.name })
    revalidatePath('/', 'layout')

    return ok(result)
  } catch (error) {
    return toResultError(error)
  }
}

export async function registerAction(
  _previous: unknown,
  formData: FormData,
): Promise<Result<AuthResult, string>> {
  const container = getContainer()

  try {
    if (!container.limiters.register.tryConsume(await rateLimitKey())) {
      throw new RateLimitError('Příliš mnoho registrací. Zkuste to prosím za chvíli.')
    }

    const result = await new RegisterUser({
      uow: container.uow,
      hasher: container.hasher,
    }).execute({
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
    })

    await writeSession({ userId: result.userId, role: result.role, name: result.name })
    revalidatePath('/', 'layout')

    return ok(result)
  } catch (error) {
    return toResultError(error)
  }
}

export async function logoutAction(): Promise<void> {
  await clearSession()
  revalidatePath('/', 'layout')
}
