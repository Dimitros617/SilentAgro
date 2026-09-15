import type { OrderRowView } from '@/application/dto'
import { ConflictError, NotFoundError, ValidationError } from '@/domain/errors'
import type { OrderMailComposer } from '@/domain/ports/order-delivery'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { toOrderRow } from '@/application/view-models'

const MIN_REASON_LENGTH = 3
const MAX_REASON_LENGTH = 1000

export interface CancelOrderDeps {
  readonly uow: UnitOfWork
  readonly clock: Clock
  readonly composer: OrderMailComposer
}

/**
 * Zrušení objednávky farmářem.
 *
 * Množství se vrací do skladu, protože brambory, které si zákazník nevyzvedne,
 * může farmář prodat znovu. Vrácení proběhne **právě jednou**: pokus o zrušení
 * už zrušené objednávky skončí chybou, ne tichým druhým přičtením.
 */
export class CancelOrder {
  constructor(private readonly deps: CancelOrderDeps) {}

  async execute(orderId: number, reason: string): Promise<OrderRowView> {
    const trimmed = reason.trim()

    if (trimmed.length < MIN_REASON_LENGTH) {
      throw new ValidationError('Napište důvod zrušení — zákazník ho dostane e-mailem')
    }
    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new ValidationError('Důvod zrušení je příliš dlouhý')
    }

    const cancelled = await this.deps.uow.runInTransaction(async (repos) => {
      const order = await repos.orders.lockForUpdate(orderId)
      if (!order) throw new NotFoundError('Objednávka nenalezena')
      if (order.isCancelled) throw new ConflictError('Objednávka už je zrušená')

      // Zámek na odrůdy ze stejného důvodu jako u rezervace: souběžná objednávka
      // by jinak četla stav skladu, který se právě mění.
      const varietyIds = order.items.map((item) => item.varietyId)
      const locked = await repos.varieties.lockForUpdate(varietyIds)
      const byId = new Map(locked.map((variety) => [variety.id, variety]))

      for (const item of order.items) {
        const variety = byId.get(item.varietyId)
        // Chybějící vazba je poškození dat. Transakce nesmí potichu ztratit sklad.
        if (!variety) throw new NotFoundError('Odrůda objednávky nenalezena')
        byId.set(item.varietyId, variety.restock(item.quantity))
      }

      for (const variety of byId.values()) {
        await repos.varieties.save(variety)
      }

      // `cancel` mění jen řádky, které ještě zrušené nejsou — druhá pojistka
      // proti dvojímu vrácení skladu, tentokrát na úrovni databáze.
      const updated = await repos.orders.cancel(orderId, this.deps.clock.now(), trimmed)
      await repos.outbox.enqueue(`order:${orderId}:cancelled`, this.deps.composer.orderCancelled(updated, trimmed))
      return updated
    })

    return toOrderRow(cancelled)
  }
}
