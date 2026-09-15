import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'
import architecture from './eslint/architecture.mjs'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'reports/**',
      '.scannerwork/**',
      '.stryker-tmp/**',
      'tests/scanners/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'temp/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { architecture },
    rules: { 'architecture/layer-dependencies': 'error' },
  },
]


export default config
