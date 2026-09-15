import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeliverMail } from '@/application/use-cases/deliver-mail'
import { PrismaMailQueue } from '@/infrastructure/persistence/prisma/mail-queue'
import { MemoryMailer } from '@/infrastructure/mail/create-mailer'
import type { Logger, MailMessage } from '@/domain/ports/services'
import { disconnect, resetDatabase, testPrisma, testUow } from './helpers/db'

const logger: Logger = { info() {}, warn() {}, error() {} }
const message: MailMessage = {
  to: 'test@example.cz', subject: 'Potvrzení', text: 'Uložený obsah', html: '<p>Uložený obsah</p>',
  attachments: [{ filename: 'qr.png', content: new Uint8Array([0, 128, 255]), contentType: 'image/png', cid: 'qr' }],
}

beforeEach(resetDatabase)
afterAll(disconnect)

async function enqueue(key: string) {
  await testUow.runInTransaction((repos) => repos.outbox.enqueue(key, message))
}

describe('trvalá fronta pošty', () => {
  it.each([
    { reason: 'neplatná struktura', payload: { invalid: true } },
    {
      reason: 'poškozené base64 přílohy',
      payload: {
        to: 'test@example.cz', subject: 'Potvrzení', text: 'Obsah',
        attachments: [{ filename: 'qr.png', content: '###', contentType: 'image/png' }],
      },
    },
  ])('poškozený obsah odloží a pokračuje další zprávou: $reason', async ({ payload }) => {
    await enqueue('broken')
    await enqueue('valid')
    await testPrisma.mailOutbox.update({ where: { messageKey: 'broken' }, data: { payload } })
    const queue = new PrismaMailQueue(testPrisma)
    await expect(queue.claim()).rejects.toThrow('Neplatný obsah zprávy')
    const broken = await testPrisma.mailOutbox.findUniqueOrThrow({ where: { messageKey: 'broken' } })
    expect(broken.lastError).toBe('Neplatný obsah uložené zprávy')
    expect(broken.lockedUntil).toBeNull()
    expect((await queue.claim())?.message.text).toBe(message.text)
  })

  it('po restartu odesílatele přečte uloženou zprávu včetně binární přílohy', async () => {
    await enqueue('placed:customer')
    const mailer = new MemoryMailer()
    const worker = new DeliverMail({ queue: new PrismaMailQueue(testPrisma), mailer, logger })
    expect(await worker.execute()).toBe(true)
    expect(mailer.sent[0]?.text).toBe(message.text)
    expect([...mailer.sent[0]!.attachments![0]!.content]).toEqual([0, 128, 255])
    expect(mailer.sent[0]?.messageId).toContain('@silentagro.local>')
    expect((await testPrisma.mailOutbox.findFirstOrThrow()).sentAt).not.toBeNull()
    expect(await worker.execute()).toBe(false)
  })

  it('dva workery nepřevezmou stejnou zprávu současně', async () => {
    await enqueue('one')
    const results = await Promise.all([new PrismaMailQueue(testPrisma).claim(), new PrismaMailQueue(testPrisma).claim()])
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('nedostupné SMTP ponechá zprávu pro další pokus a neblokuje druhého příjemce', async () => {
    await enqueue('customer')
    await enqueue('farmer')
    let attempts = 0
    const sent: MailMessage[] = []
    const worker = new DeliverMail({ queue: new PrismaMailQueue(testPrisma), logger, mailer: {
      async send(mail) {
        if (++attempts === 1) throw new Error('SMTP unavailable')
        sent.push(mail)
      },
    } })
    await worker.execute()
    await worker.execute()
    const failed = await testPrisma.mailOutbox.findUniqueOrThrow({ where: { messageKey: 'customer' } })
    expect(failed.sentAt).toBeNull()
    expect(failed.attempts).toBe(1)
    expect(failed.lastError).toBe('SMTP unavailable')
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now())
    expect(sent).toHaveLength(1)
    await testPrisma.mailOutbox.update({ where: { id: failed.id }, data: { availableAt: new Date(0) } })
    await worker.execute()
    expect(sent).toHaveLength(2)
    expect(await testPrisma.mailOutbox.count({ where: { sentAt: { not: null } } })).toBe(2)
  })

  it('po pádu workeru převezme vypršelý záznam a odmítne dokončení starým pronájmem', async () => {
    await enqueue('restart')
    const firstQueue = new PrismaMailQueue(testPrisma)
    const first = (await firstQueue.claim())!
    await testPrisma.mailOutbox.update({ where: { id: first.id }, data: { lockedUntil: new Date(0) } })
    const secondQueue = new PrismaMailQueue(testPrisma)
    const second = (await secondQueue.claim())!
    expect(second.id).toBe(first.id)
    expect(second.leaseToken).not.toBe(first.leaseToken)
    expect(second.message.messageId).toBe(first.message.messageId)
    await firstQueue.markSent(first)
    await firstQueue.retryLater(first, 'old worker')
    const row = await testPrisma.mailOutbox.findUniqueOrThrow({ where: { id: first.id } })
    expect(row.sentAt).toBeNull()
    expect(row.leaseToken).toBe(second.leaseToken)
    await secondQueue.markSent(second)
    expect((await testPrisma.mailOutbox.findUniqueOrThrow({ where: { id: first.id } })).sentAt).not.toBeNull()
  })

  it('po selhání potvrzení zachová pronájem a obnoví zprávu až po jeho vypršení', async () => {
    await enqueue('acknowledgement-failure')
    const queue = new PrismaMailQueue(testPrisma)
    const databaseError = new Error('Zápis potvrzení selhal')
    vi.spyOn(queue, 'markSent').mockRejectedValueOnce(databaseError)
    const mailer = new MemoryMailer()
    const worker = new DeliverMail({ queue, mailer, logger })

    await expect(worker.execute()).rejects.toBe(databaseError)

    const pending = await testPrisma.mailOutbox.findFirstOrThrow()
    expect(pending.sentAt).toBeNull()
    expect(pending.leaseToken).not.toBeNull()
    expect(pending.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    expect(mailer.sent).toHaveLength(1)
    expect(await new PrismaMailQueue(testPrisma).claim()).toBeNull()

    await testPrisma.mailOutbox.update({ where: { id: pending.id }, data: { lockedUntil: new Date(0) } })
    expect(await worker.execute()).toBe(true)
    expect(mailer.sent).toHaveLength(2)
    const firstMessageId = mailer.sent[0]?.messageId
    expect(firstMessageId).toEqual(expect.any(String))
    expect(mailer.sent[1]?.messageId).toBe(firstMessageId)
    expect((await testPrisma.mailOutbox.findUniqueOrThrow({ where: { id: pending.id } })).sentAt).not.toBeNull()
  })
})
