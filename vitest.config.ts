import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': src },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': src } },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          env: { MAIL_DRIVER: 'memory' },
        },
      },
      {
        resolve: { alias: { '@': src } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integrační testy sdílejí jednu databázi a mažou tabulky mezi běhy,
          // takže musí běžet po jednom souboru.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
