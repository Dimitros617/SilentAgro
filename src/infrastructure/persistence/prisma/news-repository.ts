import type { PrismaLike } from './types'
import type { NewsPost } from '@/domain/entities'
import type { NewsRepository, NewNewsPostInput } from '@/domain/ports/repositories'
import { toNewsPost } from './mappers'

export class PrismaNewsRepository implements NewsRepository {
  constructor(private readonly db: PrismaLike) {}

  async listPublished(limit: number): Promise<NewsPost[]> {
    const rows = await this.db.newsPost.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })
    return rows.map(toNewsPost)
  }

  async create(input: NewNewsPostInput): Promise<NewsPost> {
    const row = await this.db.newsPost.create({
      data: {
        title: input.title,
        body: input.body,
        tag: input.tag,
        imageUrl: input.imageUrl,
        publishedAt: input.publishedAt,
        authorId: input.authorId,
      },
    })
    return toNewsPost(row)
  }

  async delete(id: number): Promise<void> {
    await this.db.newsPost.deleteMany({ where: { id } })
  }
}
