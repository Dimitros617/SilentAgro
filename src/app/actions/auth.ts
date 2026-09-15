'use server'

import { revalidatePath } from 'next/cache'
import type { AuthResult } from '@/application/dto'
import { LoginUser, RegisterUser } from '@/application/use-cases/auth'
import { RateLimitError } from '@/domain/errors'
import { clearSession, rateLimitKey, writeSession } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import type { Result } from '@/shared/result'
import { asResult } from './guards'

/** Vydá session a zneplatní vykreslené stránky, které se liší podle přihlášení. */
async function completeLogin(user: AuthResult): Promise<AuthResult> {
  await writeSession({ userId: user.userId, role: user.role, name: user.name })
  revalidatePath('/', 'layout')
  return user
}

export async function loginAction(
  _previous: unknown,
  formData: FormData,
): Promise<Result<AuthResult, string>> {
  const container = getContainer()
  const email = String(formData.get('email') ?? '')

  return asResult(async () => {
    if (!container.limiters.login.tryConsume(await rateLimitKey(email))) {
      throw new RateLimitError('Příliš mnoho pokusů o přihlášení. Zkuste to prosím za chvíli.')
    }

    const result = await new LoginUser({
      uow: container.uow,
      hasher: container.hasher,
    }).execute({
      email,
      password: String(formData.get('password') ?? ''),
    })

    return completeLogin(result)
  })
}

export async function registerAction(
  _previous: unknown,
  formData: FormData,
): Promise<Result<AuthResult, string>> {
  const container = getContainer()
  const email = String(formData.get('email') ?? '')

  return asResult(async () => {
    if (!container.limiters.register.tryConsume(await rateLimitKey(email))) {
      throw new RateLimitError('Příliš mnoho registrací. Zkuste to prosím za chvíli.')
    }

    const result = await new RegisterUser({
      uow: container.uow,
      hasher: container.hasher,
      clock: container.clock,
      tokenGenerator: container.tokenGenerator,
      notifier: container.userNotifier,
      logger: container.logger,
      config: { publicBaseUrl: container.config.publicBaseUrl },
    }).execute({
      name: String(formData.get('name') ?? ''),
      email,
      password: String(formData.get('password') ?? ''),
    })

    return completeLogin(result)
  })
}

export async function logoutAction(): Promise<void> {
  await clearSession()
  revalidatePath('/', 'layout')
}
