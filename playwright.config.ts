import { defineConfig, devices } from '@playwright/test'
import { FARMER_STATE } from './tests/e2e/helpers'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  /**
   * Scénáře sdílejí jednu databázi a navzájem si mění sklad i objednávky, takže
   * běží po jednom. Paralelní běh by dělal výsledky závislé na pořadí.
   */
  fullyParallel: false,
  workers: 1,

  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],

  use: {
    baseURL,
    locale: 'cs-CZ',
    timezoneId: 'Europe/Prague',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Jedno přihlášení pro všechny admin testy. Aplikace omezuje počet pokusů na pět,
    // takže přihlašovat se v každém testu by narazilo na rate limit.
    { name: 'prihlaseni', testMatch: /auth\.setup\.ts/ },

    {
      name: 'navstevnik',
      testMatch: /(nakup|pristup)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'farmar',
      testMatch: /admin\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: FARMER_STATE },
      dependencies: ['prihlaseni'],
    },
  ],
})
