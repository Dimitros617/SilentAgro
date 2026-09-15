import type { NewsTag } from '@/domain/enums'

export interface NewsPostProps {
  readonly id: number
  readonly title: string
  readonly body: string
  readonly tag: NewsTag
  readonly imageUrl: string | null
  readonly publishedAt: Date
  readonly authorId: number | null
}

export class NewsPost {
  private constructor(private readonly props: NewsPostProps) {}

  static rehydrate(props: NewsPostProps): NewsPost {
    return new NewsPost(props)
  }

  get id(): number { return this.props.id }
  get title(): string { return this.props.title }
  get body(): string { return this.props.body }
  get tag(): NewsTag { return this.props.tag }
  get imageUrl(): string | null { return this.props.imageUrl }
  get publishedAt(): Date { return this.props.publishedAt }
  get authorId(): number | null { return this.props.authorId }
  get hasImage(): boolean { return this.props.imageUrl !== null && this.props.imageUrl.length > 0 }
}
