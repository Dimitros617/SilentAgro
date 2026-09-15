import { requireFarmer } from '@/infrastructure/auth/session'
import { notFound } from 'next/navigation'
import { GetUserDetail } from '@/application/use-cases/users'
import { UserDetail } from '@/components/admin/user-detail'
import { NotFoundError } from '@/domain/errors'
import { getContainer } from '@/infrastructure/di/container'
import { Pagination } from '@/components/admin/pagination'
import { pageParams, type ListSearchParams } from '../../list-params'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>
  searchParams: Promise<ListSearchParams>
}>) {
  await requireFarmer()
  const { id } = await params
  const userId = Number(id)
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(userId) || userId <= 0) notFound()

  const detail = await new GetUserDetail({ uow: getContainer().uow })
    .execute(userId, pageParams(await searchParams))
    .catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound()
      throw error
    })

  return <><UserDetail initial={detail} /><Pagination page={detail.ordersPage} basePath={`/admin/uzivatele/${userId}`} /></>
}
