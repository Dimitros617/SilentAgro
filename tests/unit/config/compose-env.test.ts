import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Hlídá, že každá proměnná ze schématu konfigurace opravdu dorazí do kontejneru.
 *
 * Třikrát po sobě se stalo, že proměnná vznikla v `env.ts` i v `.env.example`,
 * ale nikdo ji nepřidal do `docker-compose.yml` — aplikace pak tiše běžela
 * na výchozích hodnotách a provozovatel si myslel, že si ji nastavil.
 * Ručně to neuhlídá nikdo; tenhle test ano.
 */

const read = (path: string) => readFileSync(path, 'utf8')

/** Klíče deklarované v Zod schématu konfigurace. */
function schemaKeys(): string[] {
  const source = read('src/infrastructure/config/env.ts')
  // Schéma je zapsané jako `const schema = z` a na dalším řádku `.object({`,
  // takže se hledá samotné `.object({`.
  const body = source.slice(source.indexOf('.object({'), source.indexOf('.superRefine'))

  return [...body.matchAll(/^\s{4}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] as string)
}

/** Klíče, které compose službě `app` skutečně předává. */
function composeAppKeys(path: string): string[] {
  const source = read(path)
  const start = source.indexOf('  app:')
  const environment = source.indexOf('environment:', start)
  const section = source.slice(environment, source.indexOf('\n    ports:', environment))

  return [...section.matchAll(/^\s{6}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1] as string)
}

function exampleKeys(): string[] {
  return [...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (match) => match[1] as string,
  )
}

/**
 * Proměnné, které se do kontejneru aplikace nepředávají záměrně.
 *
 * `DATABASE_URL` skládá compose sám z `MYSQL_*`, takže hodnota z `.env` by jen
 * mátla. `APP_ENV` compose předává pod vlastním výchozím nastavením.
 */
const NOT_PASSED_TO_APP = new Set(['DATABASE_URL'])

/**
 * Proměnné, které se do `.env.example` záměrně nepíšou.
 *
 * `UPLOAD_DIR` má compose nastavené napevno, protože cesta musí odpovídat
 * připojenému svazku. Kdyby šla přepsat z `.env`, nahrané fotky by se ukládaly
 * mimo svazek a po restartu kontejneru by zmizely.
 */
const FIXED_BY_COMPOSE = new Set(['UPLOAD_DIR'])

describe('konfigurace dorazí do kontejneru', () => {
  it('schéma má klíče, které umíme přečíst', () => {
    // Pojistka proti tomu, že se změní tvar souboru a test začne kontrolovat prázdno.
    const keys = schemaKeys()
    expect(keys.length).toBeGreaterThan(15)
    expect(keys).toContain('AUTH_SECRET')
    expect(keys).toContain('FARM_NAME')
  })

  it('docker-compose.yml předává aplikaci každou proměnnou ze schématu', () => {
    const passed = new Set(composeAppKeys('docker-compose.yml'))
    const missing = schemaKeys().filter((key) => !NOT_PASSED_TO_APP.has(key) && !passed.has(key))

    expect(missing).toEqual([])
  })

  it('docker-compose.prod.yml předává aplikaci každou proměnnou ze schématu', () => {
    const passed = new Set(composeAppKeys('docker-compose.prod.yml'))
    const missing = schemaKeys().filter((key) => !NOT_PASSED_TO_APP.has(key) && !passed.has(key))

    expect(missing).toEqual([])
  })

  it('.env.example dokumentuje každou proměnnou ze schématu', () => {
    const documented = new Set(exampleKeys())
    const missing = schemaKeys().filter(
      (key) => !FIXED_BY_COMPOSE.has(key) && !documented.has(key),
    )

    expect(missing).toEqual([])
  })

  it.each(['docker-compose.yml', 'docker-compose.prod.yml'])(
    '.env.example obsahuje proměnné, které vyžaduje %s',
    (file) => {
      // MYSQL_ROOT_PASSWORD, GHCR_REPOSITORY a spol. nejsou ve schématu aplikace,
      // ale bez nich sestava nenastartuje — kolega je musí najít v šabloně.
      // Produkční soubor se kontroluje taky: GHCR_REPOSITORY a APP_VERSION v ní
      // chyběly a při nasazení se na to přišlo až z hlášky compose.
      const documented = new Set(exampleKeys())
      const required = [...read(file).matchAll(/\$\{([A-Z][A-Z0-9_]*):\?/g)].map(
        (match) => match[1] as string,
      )

      const missing = [...new Set(required)].filter((key) => !documented.has(key))
      expect(missing).toEqual([])
    },
  )
})
