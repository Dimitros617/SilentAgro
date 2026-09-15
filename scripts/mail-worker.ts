import { PrismaClient } from '@prisma/client'
import { setTimeout } from 'node:timers/promises'
import { DeliverMail } from '@/application/use-cases/deliver-mail'
import { getEnv } from '@/infrastructure/config/env'
import { createMailer } from '@/infrastructure/mail/create-mailer'
import { PrismaMailQueue } from '@/infrastructure/persistence/prisma/mail-queue'

const IDLE_DELAY_MS = 1000
const FAILURE_DELAY_MS = 5000

async function main() {
  const env = getEnv()
  const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL })
  const mailer = createMailer({
    driver: env.MAIL_DRIVER,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM,
  })
  const worker = new DeliverMail({ queue: new PrismaMailQueue(db), mailer, logger: console })
  const runOnce = process.argv.includes('--once')
  let stopping = false
  process.on('SIGTERM', () => { stopping = true })
  process.on('SIGINT', () => { stopping = true })
  console.info('[silentagro] Mail worker spuštěn')
  try {
    do {
      try {
        const processed = await worker.execute()
        if (runOnce) break
        if (!processed) await setTimeout(IDLE_DELAY_MS)
      } catch (error) {
        console.error('[silentagro] Zpracování poštovní fronty selhalo', error)
        if (runOnce) throw error
        await setTimeout(FAILURE_DELAY_MS)
      }
    } while (!stopping)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[silentagro] Mail worker skončil s chybou', error)
  process.exitCode = 1
})
