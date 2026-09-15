import type { PrismaLike } from './types'
import type { Field } from '@/domain/entities'
import type { FieldRepository } from '@/domain/ports/repositories'
import { toField } from './mappers'

export class PrismaFieldRepository implements FieldRepository {
  constructor(private readonly db: PrismaLike) {}

  async listAll(): Promise<Field[]> {
    const rows = await this.db.field.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
    return rows.map(toField)
  }
}
