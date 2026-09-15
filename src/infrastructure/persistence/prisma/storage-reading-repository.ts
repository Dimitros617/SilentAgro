import type { PrismaLike } from './types'
import type { StorageReading } from '@/domain/entities'
import type { StorageReadingRepository } from '@/domain/ports/repositories'
import { toStorageReading } from './mappers'

export class PrismaStorageReadingRepository implements StorageReadingRepository {
  constructor(private readonly db: PrismaLike) {}

  async latest(): Promise<StorageReading | null> {
    const row = await this.db.storageReading.findFirst({ orderBy: { recordedAt: 'desc' } })
    return row ? toStorageReading(row) : null
  }
}
