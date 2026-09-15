import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = new URL('../reports/quality/', import.meta.url)
mkdirSync(output, { recursive: true })

const checks = [
  {
    name: 'dependency-cruiser',
    args: ['node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', '--config', '.dependency-cruiser.mjs', '--output-type', 'json', 'src'],
    report: 'architecture.json',
  },
  {
    name: 'SonarJS',
    args: ['node_modules/eslint/bin/eslint.js', 'src', 'scripts', 'prisma', '--config', 'eslint.quality.config.mjs', '--format', 'json'],
    report: 'sonarjs.json',
  },
  {
    name: 'jscpd',
    args: ['node_modules/jscpd/run-jscpd.js', 'src', 'scripts', 'prisma', '--config', '.jscpd.json'],
  },
  {
    name: 'Knip',
    args: ['node_modules/knip/bin/knip.js', '--reporter', 'json'],
    report: 'knip.json',
  },
  {
    name: 'Knip production',
    // Exporty používané pouze testy vyžadují posouzení. Nálezy zůstávají v reportu
    // i s původním exit kódem; selhání samotného nástroje vždy shodí celý běh.
    reviewFindings: true,
    args: ['node_modules/knip/bin/knip.js', '--production', '--reporter', 'json'],
    report: 'knip-production.json',
  },
]

function hasKnipFindings(output) {
  try {
    const report = JSON.parse(output)
    return Array.isArray(report.issues) && report.issues.length > 0
  } catch {
    return false
  }
}

function architectureStatus(output) {
  // JSON reporter dependency-cruiseru má vždy exit 0; nálezy jsou v summary.
  const { summary } = JSON.parse(output)
  if (!(summary.totalCruised > 0) || !Number.isInteger(summary.error) || !Number.isInteger(summary.warn)) {
    throw new Error('Neplatný nebo prázdný report architektury')
  }
  if (summary.error > 0) return 'failed'
  return summary.warn > 0 ? 'review' : 'passed'
}

const results = []
for (const check of checks) {
  console.info(`Running ${check.name}...`)
  const result = spawnSync(process.execPath, check.args, {
    cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  })
  if (check.report) writeFileSync(new URL(check.report, output), result.stdout ?? '')
  if (result.stderr) console.error(result.stderr.trim())
  if (result.error) console.error(result.error.message)
  const exitCode = result.status ?? 2
  let status = exitCode === 0 ? 'passed' : 'failed'
  if (check.name === 'dependency-cruiser' && exitCode === 0) {
    try {
      status = architectureStatus(result.stdout)
    } catch (error) {
      console.error(error.message)
      status = 'failed'
    }
  }
  if (check.reviewFindings && exitCode === 1 && !result.error && hasKnipFindings(result.stdout)) {
    status = 'review'
  }
  results.push({ tool: check.name, exitCode, status })
  console.info(`${check.name}: ${status} (exit ${exitCode})`)
}

writeFileSync(new URL('runs.json', output), JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2))
console.info('Reports: reports/quality/. Status "review" means findings remain and require assessment.')
if (results.some((result) => result.status === 'failed')) process.exitCode = 1
