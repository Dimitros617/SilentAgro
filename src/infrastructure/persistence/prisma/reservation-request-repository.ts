import { createHash } from 'node:crypto'
import { ConflictError } from '@/domain/errors'
import type { ReservationRequestRepository } from '@/domain/ports/order-delivery'
import type { PrismaLike } from './types'
import { requireTransaction } from './transaction'

export class PrismaReservationRequestRepository implements ReservationRequestRepository {
  constructor(private readonly db: PrismaLike) {}

  async claim(key: string, content: string): Promise<number | null> {
    requireTransaction(this.db)
    const fingerprint = createHash('sha256').update(content).digest('hex')
    // Unikátní klíč serializuje i dvě souběžná první odeslání. Při rollbacku nezůstane obsazený.
    await this.db.$executeRaw`
      INSERT INTO reservation_requests (request_key, fingerprint)
      VALUES (${key}, ${fingerprint})
      ON DUPLICATE KEY UPDATE request_key = request_key
    `
    const request = await this.db.reservationRequest.findUniqueOrThrow({ where: { key } })
    if (request.fingerprint !== fingerprint) {
      throw new ConflictError('Tento pokus o rezervaci už obsahuje jiné údaje. Dokončete původní pokus.')
    }
    return request.orderId
  }

  async complete(key: string, orderId: number): Promise<void> {
    requireTransaction(this.db)
    await this.db.reservationRequest.update({ where: { key }, data: { orderId } })
  }
}
