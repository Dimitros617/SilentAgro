import { requireFarmer } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import { ImageStore } from '@/infrastructure/uploads/image-store'
import { toResultError } from '@/app/actions/errors'
import { ok } from '@/shared/result'

export const dynamic = 'force-dynamic'

/** Nahrávat smí jen farmář. Bez toho by šlo na server ukládat cokoli anonymně. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireFarmer()

    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return Response.json(toResultError(new Error('Chybí soubor')), { status: 400 })
    }

    const store = new ImageStore(getContainer().config.uploadDir)
    return Response.json(ok(await store.save(file)))
  } catch (error) {
    const result = toResultError(error)
    return Response.json(result, { status: result.code === 'FORBIDDEN' ? 403 : 400 })
  }
}
