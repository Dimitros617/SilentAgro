import type { AdminVarietyView, UpsertVarietyInput } from '@/application/dto'
import { toAdminVarietyView } from '@/application/view-models'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { HexColor } from '@/domain/value-objects/hex-color'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

/** `Růžová Adéla` → `ruzova-adela`. Diakritika se rozloží a zahodí. */
const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter((part) => part.length > 0)
    .join('-')

const uniqueSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export class UpsertVariety {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(input: UpsertVarietyInput): Promise<AdminVarietyView> {
    const name = input.name.trim()
    if (name.length === 0) throw new ValidationError('Vyplňte název odrůdy')

    const color = HexColor.of(input.colorHex)
    const pricePerKg = Money.fromCzk(input.priceCzk)
    const stock = Kilograms.of(input.stockKg)
    const capacity = Kilograms.of(input.capacityKg)

    if (stock.gt(capacity)) {
      throw new ValidationError('Sklad nemůže být větší než kapacita zásobníku')
    }

    // Zámek chrání právě probíhající zápisy. Očekávaný sklad chrání i formulář
    // otevřený před rezervací, která už byla potvrzená.
    return this.deps.uow.runInTransaction(async (repos) => {
      if (input.id !== null) {
        const [existing] = await repos.varieties.lockForUpdate([input.id])
        if (!existing) throw new NotFoundError('Odrůda nenalezena')
        if (input.expectedStockKg === null || existing.stock.value !== input.expectedStockKg) {
          throw new ConflictError('Sklad se mezitím změnil. Obnovte stránku a zadejte úpravu znovu.')
        }

        // Slug zůstává: je v URL a odkazy na něj by se přejmenováním rozbily.
        const saved = await repos.varieties.save(
          existing.with({
            name,
            tag: input.tag.trim(),
            description: input.description.trim(),
            color,
            pricePerKg,
            stock,
            capacity,
          }),
        )
        return toAdminVarietyView(saved)
      }

      const taken = new Set(await repos.varieties.existingSlugs())
      const slug = uniqueSlug(slugify(name) || 'odruda', taken)

      const created = await repos.varieties.create({
        slug,
        name,
        tag: input.tag.trim(),
        description: input.description.trim(),
        color,
        pricePerKg,
        stock,
        capacity,
        sortOrder: taken.size,
      })
      return toAdminVarietyView(created)
    })
  }
}

export class ListAdminVarieties {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(): Promise<AdminVarietyView[]> {
    const varieties = await this.deps.uow.repos.varieties.findAll()
    return varieties.map(toAdminVarietyView)
  }
}

export class DeactivateVariety {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  /**
   * Deaktivace, ne smazání. Na odrůdu mohou existovat objednávky a databáze její
   * smazání blokuje cizím klíčem — historická objednávka musí zůstat čitelná.
   */
  async execute(id: number): Promise<void> {
    await this.deps.uow.runInTransaction(async (repos) => {
      const existing = await repos.varieties.findById(id)
      if (!existing) throw new NotFoundError('Odrůda nenalezena')
      await repos.varieties.deactivate(id)
    })
  }
}
