'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import { RateLimitError, ValidationError } from '@/domain/errors'
import { rateLimitKey, readSession } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import { type Result, ok } from '@/shared/result'
import { toResultError } from './errors'

/**
 * Vstup z klienta se ověřuje na hranici. Server přebírá jen `varietyId` a `quantityKg`;
 * cenu, název odrůdy ani stav skladu klient neposílá a poslat je nemůže.
 */
const payloadSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(120),
    email: z.string().min(1).max(255),
    phone: z.string().max(40).default(''),
    note: z.string().max(2000).default(''),
  }),
  delivery: z.enum([DeliveryMethod.PICKUP, DeliveryMethod.LOCAL_DELIVERY]),
  payment: z.enum([PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.QR_CODE]),
  items: z
    .array(
      z.object({
        varietyId: z.number().int().positive(),
        quantityKg: z.number().positive().max(1000),
      }),
    )
    .min(1, 'Košík je prázdný')
    .max(50),
})

export type ReserveOrderPayload = z.input<typeof payloadSchema>

export async function reserveOrderAction(
  payload: unknown,
): Promise<Result<{ token: string }, string>> {
  const container = getContainer()

  try {
    if (!container.limiters.order.tryConsume(await rateLimitKey())) {
      throw new RateLimitError('Příliš mnoho rezervací za sebou. Zkuste to prosím za chvíli.')
    }

    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? 'Objednávka nemá správný tvar',
      )
    }

    // Identita se bere ze session, nikdy z těla požadavku — jinak by si kdokoli
    // přiřadil objednávku cizímu účtu.
    const session = await readSession()

    const result = await new ReserveOrder({
      uow: container.uow,
      clock: container.clock,
      tokenGenerator: container.tokenGenerator,
      notifier: container.notifier,
    }).execute({
      customer: parsed.data.customer,
      delivery: parsed.data.delivery,
      payment: parsed.data.payment,
      items: parsed.data.items,
      userId: session?.userId ?? null,
    })

    // Stav skladu se změnil, takže stránky, které ho ukazují, musí přestat platit.
    revalidatePath('/')
    revalidatePath('/burza')
    revalidatePath('/sklad')
    revalidatePath('/admin/objednavky')

    return ok({ token: result.publicToken })
  } catch (error) {
    return toResultError(error)
  }
}
