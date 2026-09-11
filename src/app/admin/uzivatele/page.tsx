import { ListUsers } from '@/application/use-cases/users'
import { UsersTable } from '@/components/admin/users-table'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await new ListUsers({ uow: getContainer().uow }).execute()
  return <UsersTable users={users} />
}
