import { requireFarmer } from '@/infrastructure/auth/session'
import { ListOrders } from '@/application/use-cases/admin'
import { OrdersTable } from '@/components/admin/orders-table'
import { getContainer } from '@/infrastructure/di/container'
import { Pagination } from '@/components/admin/pagination'
import { OrderStatus, ORDER_STATUS_LABELS } from '@/domain/enums'
import { pageParams, textParam, type ListSearchParams } from '../list-params'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage({ searchParams }: Readonly<{ searchParams: Promise<ListSearchParams> }>) {
  await requireFarmer()
  const params = await searchParams
  const query = textParam(params, 'q')
  const selected = textParam(params, 'status')
  const status = Object.values(OrderStatus).find((value) => value === selected)
  const result = await new ListOrders({ uow: getContainer().uow }).execute(pageParams(params), {
    query, ...(status ? { status, cancelled: false } : {}),
    ...(selected === 'cancelled' ? { cancelled: true } : {}),
  })
  return <>
    <form className="row" method="get" style={{ gap: 12, marginBottom: 16 }}>
      <input className="input" name="q" defaultValue={query} placeholder="Kód, jméno nebo e-mail" aria-label="Hledat objednávky" />
      <select className="input" name="status" defaultValue={selected} aria-label="Stav objednávky">
        <option value="">Všechny stavy</option>
        {Object.values(OrderStatus).map((value) => <option key={value} value={value}>{ORDER_STATUS_LABELS[value]}</option>)}
        <option value="cancelled">Zrušené</option>
      </select>
      <button className="btn btn--secondary" type="submit">Hledat</button>
    </form>
    <OrdersTable orders={result.items} />
    <Pagination page={result} basePath="/admin/objednavky" filters={{ q: query, status: selected }} />
  </>
}
