import type { PageRequest } from '@/domain/ports/pagination'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

export function normalizePage(input: Partial<PageRequest> = {}): PageRequest {
  const page = positiveInteger(input.page, 1)
  const size = positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE)
  return { page, pageSize: Math.min(size, MAX_PAGE_SIZE) }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) return fallback
  return value
}

export function clampPage(request: PageRequest, total: number): PageRequest {
  const totalPages = Math.max(1, Math.ceil(total / request.pageSize))
  return { ...request, page: Math.min(request.page, totalPages) }
}
