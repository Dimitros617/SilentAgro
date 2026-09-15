import { requireFarmer } from '@/infrastructure/auth/session'
import { ListAdminVarieties } from '@/application/use-cases/admin'
import { StockEditor } from '@/components/admin/stock-editor'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminStockPage() {
  await requireFarmer()
  const varieties = await new ListAdminVarieties({ uow: getContainer().uow }).execute()
  return <StockEditor varieties={varieties.filter((variety) => variety.isActive)} />
}
