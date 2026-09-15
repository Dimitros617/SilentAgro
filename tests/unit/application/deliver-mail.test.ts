import { describe, expect, it, vi } from 'vitest'
import { DeliverMail } from '@/application/use-cases/deliver-mail'
import type { MailJob, MailQueue } from '@/domain/ports/order-delivery'
import type { Mailer } from '@/domain/ports/services'

const job: MailJob = {
  id: 7,
  leaseToken: 'lease-7',
  attempts: 2,
  message: {
    messageId: '<order-7@example.test>',
    to: 'zakaznik@example.test',
    subject: 'Potvrzení rezervace',
    text: 'Vaše rezervace je uložená.',
  },
}

function setup() {
  const queue = {
    claim: vi.fn<MailQueue['claim']>().mockResolvedValue(job),
    markSent: vi.fn<MailQueue['markSent']>().mockResolvedValue(undefined),
    retryLater: vi.fn<MailQueue['retryLater']>().mockResolvedValue(undefined),
  }
  const mailer = { send: vi.fn<Mailer['send']>().mockResolvedValue(undefined) }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const worker = new DeliverMail({ queue, mailer, logger })
  return { queue, mailer, logger, worker }
}

describe('DeliverMail', () => {
  it('prázdnou frontu neoznačí za zpracovanou zprávu', async () => {
    const { worker, queue, mailer } = setup()
    queue.claim.mockResolvedValue(null)

    expect(await worker.execute()).toBe(false)
    expect(mailer.send).not.toHaveBeenCalled()
    expect(queue.markSent).not.toHaveBeenCalled()
    expect(queue.retryLater).not.toHaveBeenCalled()
  })

  it('potvrdí zprávu až po dokončení odeslání a zachová její Message-ID', async () => {
    const { worker, queue, mailer } = setup()
    let finishSending = () => {}
    const sending = new Promise<void>((resolve) => { finishSending = resolve })
    mailer.send.mockReturnValue(sending)

    const processing = worker.execute()
    await vi.waitFor(() => expect(mailer.send).toHaveBeenCalledExactlyOnceWith(job.message))
    expect(queue.markSent).not.toHaveBeenCalled()

    finishSending()
    expect(await processing).toBe(true)
    expect(queue.markSent).toHaveBeenCalledExactlyOnceWith(job)
    expect(queue.retryLater).not.toHaveBeenCalled()
  })

  it.each([new Error('SMTP unavailable'), 'SMTP unavailable'])(
    'po selhání SMTP uloží důvod a naplánuje nový pokus: %s',
    async (error) => {
      const { worker, queue, mailer } = setup()
      mailer.send.mockRejectedValue(error)

      expect(await worker.execute()).toBe(true)
      expect(queue.retryLater).toHaveBeenCalledExactlyOnceWith(job, 'SMTP unavailable')
      expect(queue.markSent).not.toHaveBeenCalled()
    },
  )

  it('při selhání odložení zprávy zachová v logu také původní chybu SMTP', async () => {
    const { worker, queue, mailer, logger } = setup()
    const databaseError = new Error('Databáze není dostupná')
    mailer.send.mockRejectedValue(new Error('SMTP unavailable'))
    queue.retryLater.mockRejectedValue(databaseError)

    await expect(worker.execute()).rejects.toBe(databaseError)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Odeslání zprávy'),
      expect.objectContaining({ id: job.id, attempts: job.attempts, error: 'SMTP unavailable' }),
    )
    expect(queue.markSent).not.toHaveBeenCalled()
  })

  it('po přijetí SMTP nezamění chybu potvrzení za neodeslanou zprávu a neuvolní pronájem', async () => {
    const { worker, queue, mailer, logger } = setup()
    const databaseError = new Error('Zápis potvrzení selhal')
    queue.markSent.mockRejectedValue(databaseError)

    await expect(worker.execute()).rejects.toBe(databaseError)
    expect(mailer.send).toHaveBeenCalledExactlyOnceWith(job.message)
    expect(queue.retryLater).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('potvrzení'),
      expect.objectContaining({ id: job.id, error: databaseError.message }),
    )
  })

  it('při chybě převzetí z fronty nic neodesílá', async () => {
    const { worker, queue, mailer } = setup()
    const databaseError = new Error('Převzetí zprávy selhalo')
    queue.claim.mockRejectedValue(databaseError)

    await expect(worker.execute()).rejects.toBe(databaseError)
    expect(mailer.send).not.toHaveBeenCalled()
    expect(queue.retryLater).not.toHaveBeenCalled()
  })

  it('odložení jednoho příjemce nebrání zpracování další zprávy', async () => {
    const { worker, queue, mailer } = setup()
    const nextJob: MailJob = {
      ...job, id: 8, leaseToken: 'lease-8', attempts: 1,
      message: { ...job.message, messageId: '<order-8@example.test>', to: 'farma@example.test' },
    }
    queue.claim.mockResolvedValueOnce(job).mockResolvedValueOnce(nextJob)
    mailer.send.mockRejectedValueOnce(new Error('Příjemce není dostupný'))

    expect(await worker.execute()).toBe(true)
    expect(await worker.execute()).toBe(true)
    expect(queue.retryLater).toHaveBeenCalledExactlyOnceWith(job, 'Příjemce není dostupný')
    expect(queue.markSent).toHaveBeenCalledExactlyOnceWith(nextJob)
  })
})
