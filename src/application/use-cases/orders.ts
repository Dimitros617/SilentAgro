import type { OrderRowView } from '@/application/dto'
import { toOrderRow } from '@/application/view-models'
import { NEXT_ORDER_STATUS, type OrderStatus } from '@/domain/enums'
import { ConflictError, NotFoundError } from '@/domain/errors'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { formatDateCs } from '@/shared/format'
import type { OrderFilter, Page, PageRequest } from '@/domain/ports/pagination'
import { clampPage, normalizePage } from '@/application/pagination'
import { normalizeListText } from '@/application/list-query'

export class ListOrders {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(
    input: Partial<PageRequest> = {},
    filter: OrderFilter = { query: '' },
  ): Promise<Page<OrderRowView>> {
    const repository = this.deps.uow.repos.orders
    const normalized = { ...filter, query: normalizeListText(filter.query) }
    const total = await repository.countFiltered(normalized)
    const page = clampPage(normalizePage(input), total)
    const orders = await repository.listPage(page, normalized)
    return { ...page, total, items: orders.map(toOrderRow) }
  }
}

export class AdvanceOrderStatus {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(orderId: number, expectedStatus: OrderStatus): Promise<OrderRowView> {
    // Zámek serializuje zápisy; očekávaný stav odmítne druhý klik ze staršího zobrazení.
    return this.deps.uow.runInTransaction(async (repos) => {
      const order = await repos.orders.lockForUpdate(orderId)
      if (!order) throw new NotFoundError('Objednávka nenalezena')
      if (order.isCancelled) throw new ConflictError('Zrušená objednávka se už neposouvá')
      if (order.status !== expectedStatus) {
        throw new ConflictError('Stav objednávky se mezitím změnil. Obnovte přehled.')
      }

      const updated = await repos.orders.updateStatus(orderId, NEXT_ORDER_STATUS[order.status])
      return toOrderRow(updated)
    })
  }
}

export interface SetOrderPaidResult {
  readonly isPaid: boolean
  readonly paidAtLabel: string | null
}

export class SetOrderPaid {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(orderId: number, paid: boolean): Promise<SetOrderPaidResult> {
    return this.deps.uow.runInTransaction(async (repos) => {
      const order = await repos.orders.lockForUpdate(orderId)
      if (!order) throw new NotFoundError('Objednávka nenalezena')
      if (order.isCancelled) throw new ConflictError('Zrušená objednávka se už neoznačuje')

      // Idempotence: už zaplacenou objednávku neoznačujeme znovu. Jinak by dvojklik
      // nebo druhý otevřený tab přepsal datum, kdy peníze skutečně dorazily.
      if (paid && order.isPaid) {
        return { isPaid: true, paidAtLabel: order.paidAt ? formatDateCs(order.paidAt) : null }
      }

      const updated = await repos.orders.setPaid(orderId, paid ? this.deps.clock.now() : null)
      return {
        isPaid: updated.isPaid,
        paidAtLabel: updated.paidAt ? formatDateCs(updated.paidAt) : null,
      }
    })
  }
}
