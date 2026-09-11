import { notFound } from 'next/navigation'
import { GetUserDetail } from '@/application/use-cases/users'
import { UserDetail } from '@/components/admin/user-detail'
import { NotFoundError } from '@/domain/errors'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const userId = Number.parseInt(id, 10)
  if (!Number.isInteger(userId) || userId <= 0) notFound()

  const detail = await new GetUserDetail({ uow: getContainer().uow })
    .execute(userId)
    .catch((error: unknown) => {
      if (error instanceof NotFoundError) notFound()
      throw error
    })

  return <UserDetail initial={detail} />
}
