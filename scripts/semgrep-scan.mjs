import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = new URL('../reports/quality/', import.meta.url)
const testRules = process.argv.includes('--test')
const image = 'semgrep/semgrep:1.177.0@sha256:acaac22ffc7b7cc5926de0751b223bce0b2491c33d18422fa72f632c78d81198'

// Připojujeme jen zdroje a pravidla; sken nepotřebuje .env, Git ani node_modules.
const mounts = []
for (const directory of ['src', 'scripts', 'prisma', 'semgrep', 'tests/scanners/semgrep']) {
  mounts.push('--mount', `type=bind,source=${join(root, directory)},target=/project/${directory},readonly`)
}

const args = [
  'run', '--rm', '--network', 'none', '--workdir', '/project', ...mounts,
  image, 'semgrep', 'scan', '--config', 'semgrep/rules',
  '--metrics', 'off', '--disable-version-check', '--json', '--strict',
]
if (testRules) args.push('--test', 'tests/scanners/semgrep')
else args.push('--error', 'src', 'scripts', 'prisma')

mkdirSync(output, { recursive: true })
const reportName = testRules ? 'semgrep-tests.json' : 'semgrep.json'
const result = spawnSync('docker', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
})
writeFileSync(new URL(reportName, output), result.stdout ?? '')
if (result.stderr) console.error(result.stderr.trim())
if (result.error) throw result.error
process.exitCode = result.status ?? 2
console.info(`Semgrep: exit ${process.exitCode}; reports/quality/${reportName}`)
