import { getContainer } from '@/infrastructure/di/container'
import { ImageStore } from '@/infrastructure/uploads/image-store'

export const dynamic = 'force-dynamic'

/**
 * Fotky se servírují vlastní cestou, ne ze složky `public/`.
 *
 * Next.js `output: 'standalone'` počítá se statickými soubory známými v době sestavení;
 * fotka nahraná za běhu do připojeného svazku tam nepatří. Vlastní route navíc dovolí
 * vynutit typ obsahu a odmítnout jméno, které neodpovídá tomu, co server sám vygeneroval.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params
  const store = new ImageStore(getContainer().config.uploadDir)
  const file = await store.read(name)

  if (!file) return new Response('Nenalezeno', { status: 404 })

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.contentType,
      // Jméno je náhodné a obsah se nikdy nemění, takže smí do dlouhé cache.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
