import { spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = new URL('../reports/quality/', import.meta.url)
mkdirSync(output, { recursive: true })
const report = openSync(new URL('trivy.json', output), 'w')
try {
  // Zdrojové soubory jsou připojené pouze pro čtení. Sken nevyžaduje Docker socket v kontejneru.
  const result = spawnSync('docker', [
    'run', '--rm',
    '--mount', `type=bind,source=${root},target=/project,readonly`,
    'aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969', 'fs',
    '--no-progress',
    '--timeout', '15m',
    '--scanners', 'vuln,misconfig', '--format', 'json',
    '--exit-code', '1', '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL',
    '--skip-dirs', '/project/node_modules,/project/.next,/project/.git,/project/dist,/project/coverage,/project/reports,/project/.stryker-tmp,/project/public/uploads',
    '--skip-files', '/project/.env,/project/.env.*',
    '/project',
  ], { cwd: root, stdio: ['ignore', report, 'inherit'] })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 2
} finally {
  closeSync(report)
}
