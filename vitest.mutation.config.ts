import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // Samostatná konfigurace zaručuje, že mutace nikdy nespustí databázové ani E2E testy.
    include: ['tests/unit/domain/**/*.test.ts', 'tests/unit/application/**/*.test.ts', 'tests/unit/cart/**/*.test.ts'],
    environment: 'node',
    env: { MAIL_DRIVER: 'memory' },
  },
})
