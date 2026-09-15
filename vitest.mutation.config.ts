import { defineConfig } from 'vitest/config'
import { unitProject } from './vitest.config'

export default defineConfig({
  resolve: unitProject.resolve,
  test: {
    // Bez `projects`: mutace tak nikdy nespustí databázové ani E2E testy. Výběr souborů
    // i prostředí se dědí z jednotkového projektu, aby se nerozešly s tím, co jede v CI.
    ...unitProject.test,
  },
})
