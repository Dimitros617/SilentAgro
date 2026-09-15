import type { NewsView, PublishNewsInput } from '@/application/dto'
import { toNewsView } from '@/application/view-models'
import { ValidationError } from '@/domain/errors'
import type { Clock } from '@/domain/ports/services'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'

export class PublishNews {
  constructor(private readonly deps: { uow: UnitOfWork; clock: Clock }) {}

  async execute(input: PublishNewsInput): Promise<NewsView> {
    const title = input.title.trim()
    if (title.length === 0) throw new ValidationError('Napište titulek novinky')

    const post = await this.deps.uow.repos.news.create({
      title,
      body: input.body.trim(),
      tag: input.tag,
      imageUrl: input.imageUrl,
      publishedAt: this.deps.clock.now(),
      authorId: input.authorId,
    })

    return toNewsView(post)
  }
}

export class DeleteNews {
  constructor(private readonly deps: { uow: UnitOfWork }) {}

  async execute(id: number): Promise<void> {
    await this.deps.uow.repos.news.delete(id)
  }
}
