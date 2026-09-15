import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))

/**
 * Nastavení jednotkových testů. Sdílí ho i `vitest.mutation.config.ts`, aby mutační běh
 * nemohl jet proti jinému výběru souborů ani jinému prostředí než CI — jinak by mutanty
 * zabité testem, který Stryker nevidí, hlásil jako přeživší.
 */
export const unitProject = {
  resolve: { alias: { '@': src } },
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node' as const,
    env: { MAIL_DRIVER: 'memory' },
  },
}

export default defineConfig({
  resolve: {
    alias: { '@': src },
  },
  test: {
    projects: [
      unitProject,
      {
        resolve: { alias: { '@': src } },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integrační testy sdílejí jednu databázi a mažou tabulky mezi běhy, takže
          // musí běžet po jednom souboru. Vitest 4 nabízí serializaci přímo projektem.
          pool: 'forks',
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
