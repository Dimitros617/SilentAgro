import { requireFarmer } from '@/infrastructure/auth/session'
import { ListUsers } from '@/application/use-cases/users'
import { UsersTable } from '@/components/admin/users-table'
import { getContainer } from '@/infrastructure/di/container'
import { Pagination } from '@/components/admin/pagination'
import { pageParams, textParam, type ListSearchParams } from '../list-params'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({ searchParams }: Readonly<{ searchParams: Promise<ListSearchParams> }>) {
  await requireFarmer()
  const params = await searchParams
  const query = textParam(params, 'q')
  const onlyProblems = textParam(params, 'problems') === '1'
  const result = await new ListUsers({ uow: getContainer().uow }).execute(pageParams(params), { query, onlyProblems })
  return <>
    <form className="row" method="get" style={{ gap: 12, marginBottom: 16 }}>
      <input className="input" name="q" defaultValue={query} placeholder="Hledat podle jména nebo e-mailu" aria-label="Hledat uživatele" />
      <label className="paid"><input type="checkbox" name="problems" value="1" defaultChecked={onlyProblems} /> Jen neověření a deaktivovaní</label>
      <button className="btn btn--secondary" type="submit">Hledat</button>
    </form>
    <UsersTable users={result.items} />
    <Pagination page={result} basePath="/admin/uzivatele" filters={{ q: query, problems: onlyProblems ? '1' : '' }} />
  </>
}
