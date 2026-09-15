import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sonarjs from 'eslint-plugin-sonarjs'
import base from './eslint.config.mjs'

// Samostatný úplný audit. Běžný lint nadále hlídá již zavedená pravidla.
const config = [
  ...base,
  {
    ...sonarjs.configs.recommended,
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'prisma/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
  },
]

export default config
