import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Doména a aplikační vrstva nesmí sáhnout na process.env ani na Prisma přímo.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@prisma/client', '**/infrastructure/**'],
              message:
                'Vrstvy domain a application nesmí záviset na infrastruktuře. Použij port z @/domain/ports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infrastructure/**', 'src/app/**', 'src/components/**', 'prisma/**', 'tests/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
