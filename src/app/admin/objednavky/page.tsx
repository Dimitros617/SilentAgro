import { ListOrders } from '@/application/use-cases/admin'
import { OrdersTable } from '@/components/admin/orders-table'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage() {
  const orders = await new ListOrders({ uow: getContainer().uow }).execute(100)
  return <OrdersTable orders={orders} />
}
