'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { AdminVarietyView, NewsView, OrderRowView } from '@/application/dto'
import {
  AdvanceOrderStatus,
  DeactivateVariety,
  DeleteNews,
  PublishNews,
  SetOrderPaid,
  type SetOrderPaidResult,
  UpsertVariety,
} from '@/application/use-cases/admin'
import { NewsTag } from '@/domain/enums'
import { ValidationError } from '@/domain/errors'
import { requireFarmer } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import { type Result, ok } from '@/shared/result'
import { toResultError } from './errors'

const idSchema = z.number().int().positive()

// Hlášky jsou české, protože se uživateli ukazují přímo — Zod by jinak poslal
// do administrace anglickou technickou větu o délce řetězce.
const varietySchema = z.object({
  id: z.number().int().positive().nullable(),
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

const revalidateCatalog = (): void => {
  revalidatePath('/')
  revalidatePath('/burza')
  revalidatePath('/sklad')
  revalidatePath('/admin', 'layout')
}

export async function advanceOrderStatusAction(
  orderId: unknown,
): Promise<Result<OrderRowView, string>> {
  try {
    // Kontrola role i tady, ne jen v middleware: server action se dá zavolat přímo.
    await requireFarmer()
    const row = await new AdvanceOrderStatus({ uow: getContainer().uow }).execute(
      parse(idSchema, orderId),
    )
    revalidatePath('/admin/objednavky')
    return ok(row)
  } catch (error) {
    return toResultError(error)
  }
}

export async function setOrderPaidAction(
  orderId: unknown,
  paid: unknown,
): Promise<Result<SetOrderPaidResult, string>> {
  try {
    await requireFarmer()
    const container = getContainer()

    const result = await new SetOrderPaid({
      uow: container.uow,
      clock: container.clock,
    }).execute(parse(idSchema, orderId), parse(z.boolean(), paid))

    revalidatePath('/admin/objednavky')
    revalidatePath('/admin')
    return ok(result)
  } catch (error) {
    return toResultError(error)
  }
}

export async function upsertVarietyAction(
  input: unknown,
): Promise<Result<AdminVarietyView, string>> {
  try {
    await requireFarmer()
    const view = await new UpsertVariety({ uow: getContainer().uow }).execute(
      parse(varietySchema, input),
    )
    revalidateCatalog()
    return ok(view)
  } catch (error) {
    return toResultError(error)
  }
}

export async function deactivateVarietyAction(id: unknown): Promise<Result<null, string>> {
  try {
    await requireFarmer()
    await new DeactivateVariety({ uow: getContainer().uow }).execute(parse(idSchema, id))
    revalidateCatalog()
    return ok(null)
  } catch (error) {
    return toResultError(error)
  }
}

export async function publishNewsAction(input: unknown): Promise<Result<NewsView, string>> {
  try {
    const session = await requireFarmer()
    const container = getContainer()

    const view = await new PublishNews({ uow: container.uow, clock: container.clock }).execute({
      ...parse(newsSchema, input),
      authorId: session.userId,
    })

    revalidatePath('/')
    revalidatePath('/admin/novinky')
    return ok(view)
  } catch (error) {
    return toResultError(error)
  }
}

export async function deleteNewsAction(id: unknown): Promise<Result<null, string>> {
  try {
    await requireFarmer()
    await new DeleteNews({ uow: getContainer().uow }).execute(parse(idSchema, id))
    revalidatePath('/')
    revalidatePath('/admin/novinky')
    return ok(null)
  } catch (error) {
    return toResultError(error)
  }
}
