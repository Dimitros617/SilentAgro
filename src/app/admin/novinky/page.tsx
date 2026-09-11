import { ListNews } from '@/application/use-cases/catalog'
import { NewsComposer } from '@/components/admin/news-composer'
import { getContainer } from '@/infrastructure/di/container'

export const dynamic = 'force-dynamic'

export default async function AdminNewsPage() {
  const posts = await new ListNews({ uow: getContainer().uow }).execute(30)
  return <NewsComposer initial={posts} />
}
