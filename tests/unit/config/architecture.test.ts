import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const eslint = new ESLint()

async function violations(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result?.messages.filter((message) => message.ruleId === 'architecture/layer-dependencies') ?? []
}

describe('hranice vrstev', () => {
  // První načtení ESLintu zahrnuje celý Next.js preset. Oddělíme jeho start
  // od krátkých testů jednotlivých importů, zejména pro pomalejší disk na Windows.
  beforeAll(async () => {
    await eslint.calculateConfigForFile('src/domain/example.ts')
  }, 60_000)

  it.each([
    ["import type { Container } from '@/infrastructure/di/container'", 'src/domain/example.ts'],
    ["export { getEnv } from '../infrastructure/config/env'", 'src/application/example.ts'],
    ["const adapter = import('../infrastructure/config/env')", 'src/domain/example.ts'],
    ["import type { Money } from '@/domain/value-objects/money'", 'src/shared/example.ts'],
    ["import { getContainer } from '@/infrastructure/di/container'", 'src/components/example.tsx'],
    ["const config = process['env']", 'src/application/example.ts'],
    ["import fs from 'node:fs'", 'src/domain/example.ts'],
    ["import { PrismaClient } from '@prisma/client'", 'src/components/example.tsx'],
    ["import { createTransport } from 'nodemailer'", 'src/components/example.tsx'],
    ["import fs from 'fs/promises'", 'src/components/example.tsx'],
    ["import { cookies } from 'next/headers'", 'src/components/example.tsx'],
    ["import { ReserveOrder } from '@/application/use-cases/reserve-order'", 'src/components/example.tsx'],
    ["export { ReserveOrder } from '../application/use-cases/reserve-order'", 'src/components/example.tsx'],
    ["type Infrastructure = import('@/infrastructure/config/env').Env", 'src/application/example.ts'],
    ["const { env } = process", 'src/domain/example.ts'],
    ["const config = process.env", 'src/components/example.tsx'],
  ])('odmítne %s ve %s', async (code, filename) => {
    expect(await violations(code, filename)).toHaveLength(1)
  })

  it.each([
    ["import { Money } from '@/domain/value-objects/money'", 'src/application/example.ts'],
    ["import { reserveOrderAction } from '@/app/actions/order'", 'src/components/example.tsx'],
    ["import type { VarietyView } from '@/application/dto'", 'src/components/example.tsx'],
    ["import { type VarietyView } from '../application/dto'", 'src/components/example.tsx'],
    ["type VarietyView = import('@/application/dto').VarietyView", 'src/components/example.tsx'],
    ["import { useState } from 'react'", 'src/components/example.tsx'],
    ["import { useRouter } from 'next/navigation'", 'src/components/example.tsx'],
  ])('povolí %s ve %s', async (code, filename) => {
    expect(await violations(code, filename)).toHaveLength(0)
  })
})
