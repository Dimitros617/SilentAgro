import type { OrderStatus } from '@/domain/enums'

export interface PageRequest {
  readonly page: number
  readonly pageSize: number
}

export interface Page<T> extends PageRequest {
  readonly items: T[]
  readonly total: number
}

export interface UserFilter {
  readonly query: string
  readonly onlyProblems: boolean
}

export interface OrderFilter {
  readonly query: string
  readonly status?: OrderStatus
  readonly cancelled?: boolean
  readonly userId?: number
}
