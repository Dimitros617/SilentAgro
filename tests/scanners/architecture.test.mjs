import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { before, test } from 'node:test'

let violations
let validationExitCode
before(() => {
  const binary = fileURLToPath(new URL('../../node_modules/dependency-cruiser/bin/dependency-cruiser.mjs', import.meta.url))
  const config = fileURLToPath(new URL('../../.dependency-cruiser.mjs', import.meta.url))
  const fixture = fileURLToPath(new URL('./architecture', import.meta.url))
  const result = spawnSync(process.execPath, [binary, '--config', config, '--output-type', 'json', 'src'], {
    cwd: fixture, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  })
  assert.ifError(result.error)
  // JSON reporter vrací 0 i s nálezy. Blokující CLI používá err-long.
  assert.equal(result.status, 0, result.stderr)
  violations = JSON.parse(result.stdout).summary.violations
  const validation = spawnSync(process.execPath, [binary, '--config', config, '--output-type', 'err-long', 'src'], {
    cwd: fixture, encoding: 'utf8',
  })
  assert.ifError(validation.error)
  validationExitCode = validation.status
})

test('zachytí přímý import infrastruktury do domény', () => {
  assert(violations.some(item => item.rule.name === 'domain-dependencies' && item.from === 'src/domain/invalid.ts'))
})

test('zachytí infrastrukturu dosažitelnou nepřímo přes doménu', () => {
  assert(violations.some(item => item.rule.name === 'core-has-no-external-dependencies' && item.from === 'src/application/indirect.ts'))
})

test('zachytí cyklus za běhu', () => {
  assert(violations.some(item => item.rule.name === 'no-circular-at-runtime'))
})

test('povolí čistou doménu, DTO typy a server actions', () => {
  assert(!violations.some(item => ['src/domain/valid.ts', 'src/components/valid.ts'].includes(item.from)))
})

test('odmítne import hodnot z DTO do komponent', () => {
  assert(violations.some(item => item.rule.name === 'components-import-dto-as-types' && item.from === 'src/components/invalid.ts'))
})

test('chybná architektura ukončí blokující kontrolu nenulovým kódem', () => {
  assert.equal(typeof validationExitCode, 'number')
  assert(validationExitCode > 0)
})
