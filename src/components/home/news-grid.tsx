import type { NewsView } from '@/application/dto'
import { NewsTag } from '@/domain/enums'

const TAG_CLASS: Record<NewsView['tag'], string> = {
  [NewsTag.HARVEST]: 'badge badge--green',
  [NewsTag.STORAGE]: 'badge badge--gold',
  [NewsTag.FIELD]: 'badge badge--muted',
}

export function NewsCard({ post }: Readonly<{ post: NewsView }>) {
  return (
    <article className="news-card">
      {post.imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- fotky z pole jsou nahrané
           za běhu do volume, takže je optimalizátor Next.js při buildu nezná */
        <img className="news-card__image" src={post.imageUrl} alt="" loading="lazy" />
      ) : null}

      <div className="news-card__body">
        <div className="news-card__meta">
          <span className={TAG_CLASS[post.tag]}>{post.tagLabel}</span>
          <span className="muted">{post.dateLabel}</span>
        </div>
        <h3 className="display h3">{post.title}</h3>
        <p className="news-card__text">{post.body}</p>
      </div>
    </article>
  )
}

export function NewsGrid({ posts }: Readonly<{ posts: NewsView[] }>) {
  if (posts.length === 0) {
    return <p className="muted">Farmář zatím nic nenapsal.</p>
  }

  return (
    <div className="grid-auto">
      {posts.map((post) => (
        <NewsCard key={post.id} post={post} />
      ))}
    </div>
  )
}
