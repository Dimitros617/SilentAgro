import 'server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ValidationError } from '@/domain/errors'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const ALLOWED = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/webp', ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
] as const

/** Jméno vygenerované serverem: UUID a přípona z whitelistu, nic jiného. */
const STORED_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/

const startsWith = (buffer: Buffer, magic: readonly number[]): boolean =>
  magic.every((byte, index) => buffer[index] === byte)

/**
 * Typ souboru se určuje podle **obsahu**, ne podle toho, co tvrdí prohlížeč.
 * Hlavičku `Content-Type` i příponu si odesílatel volí sám, takže bez kontroly
 * prvních bajtů by šlo nahrát cokoli pod jménem `.jpg`.
 */
function detectType(buffer: Buffer): (typeof ALLOWED)[number] {
  const match = ALLOWED.find((type) => startsWith(buffer, type.magic))
  if (!match) throw new ValidationError('Nahrát lze jen fotku ve formátu JPEG, PNG nebo WebP')

  // WebP má stejné první čtyři bajty jako každý RIFF kontejner (třeba AVI),
  // takže se ověří i značka formátu na osmé pozici.
  if (match.mime === 'image/webp' && buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new ValidationError('Soubor není platný WebP obrázek')
  }

  return match
}

export class ImageStore {
  constructor(private readonly directory: string) {}

  private get root(): string {
    return resolve(this.directory)
  }

  async save(file: File): Promise<{ url: string }> {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new ValidationError('Fotka je větší než 5 MB')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const type = detectType(buffer)

    // Jméno od klienta se nepoužije vůbec — obsahuje cokoli, včetně `../` a dvojitých přípon.
    const name = `${randomUUID()}.${type.ext}`

    await mkdir(this.root, { recursive: true })
    await writeFile(join(this.root, name), buffer)

    return { url: `/api/uploads/${name}` }
  }

  async read(name: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (!STORED_NAME.test(name)) return null

    const type = ALLOWED.find((allowed) => name.endsWith(`.${allowed.ext}`))
    if (!type) return null

    // I když jméno prošlo vzorem, cesta se ještě ověří proti kořeni — obrana v hloubce
    // pro případ, že by se vzor někdy uvolnil.
    const path = resolve(join(this.root, name))
    if (!path.startsWith(this.root)) return null

    try {
      return { body: await readFile(path), contentType: type.mime }
    } catch {
      return null
    }
  }
}
