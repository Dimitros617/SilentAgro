import Link from 'next/link'
import type { PageInfo } from '@/application/dto'

export function Pagination({ page, basePath, filters = {} }: Readonly<{
  page: PageInfo
  basePath: string
  filters?: Record<string, string>
}>) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize))

  function pageHref(pageNumber: number): string {
    const params = new URLSearchParams({
      ...filters,
      page: String(pageNumber),
      pageSize: String(page.pageSize),
    })
    return `${basePath}?${params}`
  }

  return (
    <nav className="row row--between" aria-label="Stránkování" style={{ margin: '16px 0', gap: 16 }}>
      {page.page > 1 ? (
        <Link className="btn btn--secondary" href={pageHref(page.page - 1)}>Předchozí</Link>
      ) : <span />}
      <span className="muted">Strana {page.page} z {totalPages} · Celkem {page.total}</span>
      {page.page < totalPages ? (
        <Link className="btn btn--secondary" href={pageHref(page.page + 1)}>Další</Link>
      ) : <span />}
    </nav>
  )
}
