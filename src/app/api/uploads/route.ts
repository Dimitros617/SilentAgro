import { requireFarmer } from '@/infrastructure/auth/session'
import { getContainer } from '@/infrastructure/di/container'
import { ImageStore } from '@/infrastructure/uploads/image-store'
import { toResultError } from '@/app/actions/errors'
import { ok } from '@/shared/result'
import { ValidationError } from '@/domain/errors'

export const dynamic = 'force-dynamic'

/** Nahrávat smí jen farmář. Bez toho by šlo na server ukládat cokoli anonymně. */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireFarmer()

    const form = await request.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      throw new ValidationError('Vyberte fotku k nahrání')
    }

    const store = new ImageStore(getContainer().config.uploadDir)
    return Response.json(ok(await store.save(file)))
  } catch (error) {
    const result = toResultError(error)
    let status = 400
    if (result.code === 'FORBIDDEN') status = 403
    if (result.code === 'UNEXPECTED') status = 500
    return Response.json(result, { status })
  }
}
