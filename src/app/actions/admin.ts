'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { AdminVarietyView, NewsView, OrderRowView, UserRowView } from '@/application/dto'
import {
  AdvanceOrderStatus,
  DeactivateVariety,
  DeleteNews,
  PublishNews,
  SetOrderPaid,
  type SetOrderPaidResult,
  UpsertVariety,
} from '@/application/use-cases/admin'
import { CancelOrder } from '@/application/use-cases/cancel-order'
import {
  MarkUserVerified,
  ResendVerification,
  SendMessageToUser,
  SetUserActive,
} from '@/application/use-cases/users'
import { NewsTag, OrderStatus } from '@/domain/enums'
import { ValidationError } from '@/domain/errors'
import { getContainer } from '@/infrastructure/di/container'
import type { Result } from '@/shared/result'
import { asFarmer } from './guards'

const idSchema = z.number().int().positive()

// Hlášky jsou české, protože se uživateli ukazují přímo — Zod by jinak poslal
// do administrace anglickou technickou větu o délce řetězce.
const varietySchema = z.object({
  id: z.number().int().positive().nullable(),
  expectedStockKg: z.number().nonnegative().nullable(),
  name: z.string().min(1, 'Vyplňte název odrůdy').max(120, 'Název je příliš dlouhý'),
  tag: z.string().max(160, 'Štítek je příliš dlouhý').default(''),
  description: z.string().max(4000, 'Popis je příliš dlouhý').default(''),
  colorHex: z.string().max(7, 'Barva musí být ve tvaru #rrggbb'),
  priceCzk: z.number().min(0, 'Cena nesmí být záporná').max(100_000, 'Cena je nesmyslně vysoká'),
  stockKg: z.number().min(0, 'Sklad nesmí být záporný').max(1_000_000, 'Sklad je nesmyslně velký'),
  capacityKg: z
    .number()
    .min(0, 'Kapacita nesmí být záporná')
    .max(1_000_000, 'Kapacita je nesmyslně velká'),
})

const newsSchema = z.object({
  title: z.string().min(1, 'Napište titulek novinky').max(200, 'Titulek je příliš dlouhý'),
  body: z.string().max(8000, 'Text je příliš dlouhý').default(''),
  tag: z.enum([NewsTag.HARVEST, NewsTag.STORAGE, NewsTag.FIELD]),
  imageUrl: z.string().max(300).nullable().default(null),
})

const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Neplatný vstup')
  }
  return parsed.data
}

const revalidateAdmin = (): void => revalidatePath('/admin', 'layout')

// Sklad se změnil, takže stránky, které ho ukazují, musí přestat platit.
const revalidateCatalog = (): void => {
  revalidatePath('/')
  revalidatePath('/burza')
  revalidatePath('/sklad')
  revalidateAdmin()
}

const revalidateNews = (): void => {
  revalidatePath('/')
  revalidatePath('/admin/novinky')
}

const revalidateUsers = (): void => revalidatePath('/admin/uzivatele', 'layout')

export async function advanceOrderStatusAction(
  orderId: unknown,
  expectedStatus: unknown,
): Promise<Result<OrderRowView, string>> {
  return asFarmer(async () => {
    const row = await new AdvanceOrderStatus({ uow: getContainer().uow }).execute(
      parse(idSchema, orderId),
      parse(z.enum(OrderStatus), expectedStatus),
    )
    revalidateAdmin()
    return row
  })
}

export async function setOrderPaidAction(
  orderId: unknown,
  paid: unknown,
): Promise<Result<SetOrderPaidResult, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    const result = await new SetOrderPaid({
      uow: container.uow,
      clock: container.clock,
    }).execute(parse(idSchema, orderId), parse(z.boolean(), paid))

    revalidateAdmin()
    return result
  })
}

export async function upsertVarietyAction(
  input: unknown,
): Promise<Result<AdminVarietyView, string>> {
  return asFarmer(async () => {
    const view = await new UpsertVariety({ uow: getContainer().uow }).execute(
      parse(varietySchema, input),
    )
    revalidateCatalog()
    return view
  })
}

export async function deactivateVarietyAction(id: unknown): Promise<Result<null, string>> {
  return asFarmer(async () => {
    await new DeactivateVariety({ uow: getContainer().uow }).execute(parse(idSchema, id))
    revalidateCatalog()
    return null
  })
}

export async function publishNewsAction(input: unknown): Promise<Result<NewsView, string>> {
  return asFarmer(async (session) => {
    const container = getContainer()

    const view = await new PublishNews({ uow: container.uow, clock: container.clock }).execute({
      ...parse(newsSchema, input),
      authorId: session.userId,
    })

    revalidateNews()
    return view
  })
}

export async function deleteNewsAction(id: unknown): Promise<Result<null, string>> {
  return asFarmer(async () => {
    await new DeleteNews({ uow: getContainer().uow }).execute(parse(idSchema, id))
    revalidateNews()
    return null
  })
}

export async function cancelOrderAction(
  orderId: unknown,
  reason: unknown,
): Promise<Result<OrderRowView, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    const row = await new CancelOrder({
      uow: container.uow,
      clock: container.clock,
      composer: container.orderMailComposer,
    }).execute(parse(idSchema, orderId), parse(z.string().max(1000), reason))

    revalidateCatalog()
    return row
  })
}

export async function markUserVerifiedAction(userId: unknown): Promise<Result<UserRowView, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    const row = await new MarkUserVerified({
      uow: container.uow,
      clock: container.clock,
    }).execute(parse(idSchema, userId))

    revalidateUsers()
    return row
  })
}

export async function setUserActiveAction(
  userId: unknown,
  active: unknown,
): Promise<Result<UserRowView, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    const row = await new SetUserActive({
      uow: container.uow,
      clock: container.clock,
    }).execute(parse(idSchema, userId), parse(z.boolean(), active))

    revalidateUsers()
    return row
  })
}

export async function sendUserMessageAction(
  userId: unknown,
  subject: unknown,
  body: unknown,
): Promise<Result<null, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    await new SendMessageToUser({
      uow: container.uow,
      notifier: container.userNotifier,
    }).execute(
      parse(idSchema, userId),
      parse(z.string().max(200), subject),
      parse(z.string().max(8000), body),
    )

    return null
  })
}

export async function resendVerificationAction(userId: unknown): Promise<Result<null, string>> {
  return asFarmer(async () => {
    const container = getContainer()

    await new ResendVerification({
      uow: container.uow,
      clock: container.clock,
      tokenGenerator: container.tokenGenerator,
      notifier: container.userNotifier,
      config: { publicBaseUrl: container.config.publicBaseUrl },
    }).execute(parse(idSchema, userId))

    revalidateUsers()
    return null
  })
}
