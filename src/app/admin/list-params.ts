import { normalizeListText } from '@/application/list-query'

export type ListSearchParams = Record<string, string | string[] | undefined>

export function textParam(params: ListSearchParams, key: string): string {
  const value = params[key]
  return typeof value === 'string' ? normalizeListText(value) : ''
}

export function pageParams(params: ListSearchParams) {
  return { page: Number(textParam(params, 'page')), pageSize: Number(textParam(params, 'pageSize')) }
}
