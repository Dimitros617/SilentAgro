# Review implementačního plánu — 2026-09-10

Adversariální review přes 9 hledisek. Každý nález se pokoušeli vyvrátit tři nezávislí
skeptici; potvrzený je ten, který přežil alespoň dva ze tří hlasů.

## Jak číst tato čísla

| | |
|---|---|
| Vznesených nálezů | 143 |
| Potvrzeno 3/3 hlasy | 11 |
| Ověřovatelé nedoběhli | 127 |

**Běh je neúplný.** Z 438 spuštěných agentů 54 dokončilo a 384 skončilo chybou —
převážně na limitu session, dvakrát na bezpečnostním filtru. Nálezy, jejichž
ověřovatelé spadli, se započítaly jako nepotvrzené, i když je nikdo neposoudil.
Seznam níže je proto rozdělený: potvrzené se opravují přednostně, neověřené
se posuzují ručně při implementaci.

## Potvrzené nálezy

### [critical] Seed v e2e jobu nemůže v produkčním image proběhnout — chybí tsx i bcryptjs a rootfs je read-only

**Kde:** Task 23, job `e2e`, krok `docker compose exec -T --env SEED_FARMER_PASSWORD=... app npx tsx prisma/seed.ts` (plus Task 22 Step 6, který má stejnou chybu)

**Problém:** Pořadí argumentů (`exec [options] SERVICE COMMAND`) je správné, problém je obsah runner image. Runner stage v Tasku 22 kopíruje z builderu jen `.next/standalone`, `.next/static`, `public`, `prisma` a z node_modules pouze `.prisma`, `@prisma` a `prisma`. `tsx` tam není vůbec, takže `npx tsx` by ho musel stáhnout z registru — jenže služba `app` má v compose `read_only: true` a zapisovatelný je jen tmpfs `/tmp`, takže npm cache v `/home/node/.npm` skončí na EROFS. I kdyby se tsx stáhl, `prisma/seed.ts` importuje `bcryptjs` (Task 7, hashování hesla farmáře) a ten v runner image také není.

**Důsledek:** Krok seedu spadne při úplně prvním běhu pipeline (buď `npm error EROFS`, nebo `ERR_MODULE_NOT_FOUND: bcryptjs`). Databáze zůstane prázdná, takže i kdyby se to obešlo, všechny e2e testy hledající odrůdu „Bernie“ a objednávku `#2609` padnou.

**Oprava:** Nespouštět seed uvnitř runtime image. Buď přidat do Dockerfile stage `seeder` odvozený z `builder` (má devDependencies včetně tsx i bcryptjs) a v CI použít `docker compose run --rm --no-deps seeder`, nebo v e2e jobu publikovat port DB (`docker-compose.ci.yml` s `db.ports: ["127.0.0.1:3306:3306"]`), přesunout `npm ci` před seed a spustit `DATABASE_URL=... npx tsx prisma/seed.ts` na hostiteli. Třetí varianta: zkompilovat seed při buildu do `prisma/seed.js` a v runneru volat `node prisma/seed.js` — pak je ale nutné doinstalovat `bcryptjs` do produkčních závislostí runneru.

**Upřesnění od ověřovatelů:** Oprava je směrem správná, ale nedotažená ve dvou bodech; navíc odpadá potřeba doinstalovávat bcryptjs (standalone ho už nese).

Doporučená varianta: seed nespouštět v runtime image, ale v jednorázovém kontejneru z `builder` stage — ten má devDependencies včetně `tsx` i vygenerovaného Prisma klienta.

1. V Dockerfile přidat `FROM builder AS seeder` s `CMD ["npx","tsx","prisma/seed.ts"]`.
2. Službu `seeder` NEDÁVAT do výchozího `docker-compose.yml` bez profilu — jinak by ji `docker compose up -d --build` spouštěl a rozbil invariant „přesně dva kontejnery“ z Tasku 22 a z Definice hotového. Buď `profiles: [seed]`, nebo samostatný `docker-compose.ci.yml` použitý přes `-f docker-compose.yml -f docker-compose.ci.yml`. Služba musí mít `networks: [internal]`, `build.target: seeder` a `DATABASE_URL: mysql://${MYSQL_USER:-silentagro}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE:-silentagro}`.
3. V CI (Task 23, job e2e) i v Tasku 22 Step 6 nahradit `exec` za:
   `docker compose --profile seed run --rm -e SEED_FARMER_PASSWORD="$SEED_FARMER_PASSWORD" seeder`
   (bez `--no-deps`, ať se `db` respektuje; DB už běží z předchozího `up -d`). Heslo brát z env/GITHUB_ENV, ne `grep`em z `.env`.

Pokud se místo toho zvolí seed na hostiteli přes publikovaný port DB (`docker-compose.ci.yml` s `db.ports: ["127.0.0.1:3306:3306"]`), nestačí jen přesunout `npm ci` před seed — je nutné před spuštěním seedu udělat i `npx prisma generate` (plán generování klienta všude dělá explicitně, viz job `quality`), jinak seed spadne na chybějícím vygenerovaném klientovi.

Třetí varianta (kompilace seedu do `prisma/seed.js` a `node prisma/seed.js` v runneru) je funkční a `bcryptjs` doinstalovávat netřeba, ale znamená tahat seed kód do produkčního image — proto ji nedoporučuji.

### [critical] docker-compose.yml nepředává MAIL_DRIVER, BANK_ACCOUNT_IBAN ani BANK_ACCOUNT_NUMBER — aplikace v e2e jobu spadne na validaci env

**Kde:** Task 23, job `e2e` (generovaný `.env`) ve spojení s Task 22 Step 4 (`services.app.environment`) a Dodatkem A (Task 1)

**Problém:** Dodatek A přidal do `Env` tři povinné klíče (`BANK_ACCOUNT_IBAN`, `BANK_ACCOUNT_NUMBER` bez defaultu, `MAIL_DRIVER` s defaultem `mailpit`) a průřezovou kontrolu `NODE_ENV === 'production' && MAIL_DRIVER !== 'smtp'` → chyba. Dodatek A ale neaktualizoval Task 22 (compose je z doby před dodatkem) ani Task 23. Runner image má v Dockerfile natvrdo `ENV NODE_ENV=production`, takže v kontejneru platí obě chyby zároveň: chybí BANK_ACCOUNT_* a MAIL_DRIVER je `mailpit` v produkci.

**Důsledek:** Při prvním čtení jakéhokoli klíče přes `env` Proxy vyletí `Neplatná konfigurace prostředí: BANK_ACCOUNT_IBAN..., MAIL_DRIVER: V produkci musí být MAIL_DRIVER=smtp`. Stránky `/burza`, `/kosik` a `/rezervace/[token]` vrátí 500. `/api/health` env nečte, takže krok „Počkat na health“ projde a job spadne až na e2e testech — falešně vypadá jako chyba testů, ne konfigurace. Navíc i s opraveným env by `SMTP_HOST` defaultoval na `mailpit`, který v CI neběží (je za profilem `mail`), takže odeslání potvrzení objednávky selže.

**Oprava:** Do `services.app.environment` v Tasku 22 doplnit `MAIL_DRIVER: ${MAIL_DRIVER:-mailpit}`, `BANK_ACCOUNT_IBAN: ${BANK_ACCOUNT_IBAN:?nastavte BANK_ACCOUNT_IBAN}`, `BANK_ACCOUNT_NUMBER: ${BANK_ACCOUNT_NUMBER:?nastavte BANK_ACCOUNT_NUMBER}` a v e2e jobu je zapsat do generovaného `.env`: `MAIL_DRIVER=memory`, `BANK_ACCOUNT_IBAN=CZ6508000000192000145399`, `BANK_ACCOUNT_NUMBER=2000145399/0800`. Protože `MAIL_DRIVER=memory` v produkci schéma zakazuje, musí e2e job zároveň přepsat `NODE_ENV` (compose `NODE_ENV: ${NODE_ENV:-production}` a v CI `NODE_ENV=test`), nebo compose musí startovat profil `mail` a nastavit `MAIL_DRIVER=smtp` + `SMTP_HOST=mailpit`. Druhá varianta je čistší, protože testuje reálnou cestu odesílání.

**Upřesnění od ověřovatelů:** Do `services.app.environment` v Tasku 22 doplnit: `MAIL_DRIVER: ${MAIL_DRIVER:-smtp}` (NE `:-mailpit` — viz níže), `BANK_ACCOUNT_IBAN: ${BANK_ACCOUNT_IBAN:?nastavte BANK_ACCOUNT_IBAN}`, `BANK_ACCOUNT_NUMBER: ${BANK_ACCOUNT_NUMBER:?nastavte BANK_ACCOUNT_NUMBER}`.

V e2e jobu Tasku 23 do generovaného `.env` přidat `BANK_ACCOUNT_IBAN=CZ6508000000192000145399`, `BANK_ACCOUNT_NUMBER=2000145399/0800`, `MAIL_DRIVER=smtp`, `SMTP_HOST=mailpit` a stack startovat jako `docker compose --profile mail up -d --build`.

Variantu „přepsat NODE_ENV na test" NEPOUŽÍVAT: Next.js `output: 'standalone'` generuje `server.js`, který má natvrdo `process.env.NODE_ENV = 'production'` (packages/next/src/build/utils.ts, copyTracedFiles). Compose `NODE_ENV: ${NODE_ENV:-production}` se tím přepíše dřív, než se poprvé čte `env`, takže superRefine `NODE_ENV === 'production' && MAIL_DRIVER !== 'smtp'` vystřelí i tak a `MAIL_DRIVER=memory` v kontejneru nikdy neprojde.

Ze stejného důvodu je nutné opravit i samotný Dodatek A: uvnitř image nemůže `NODE_ENV` nabýt jiné hodnoty než `production`, takže hodnota `MAIL_DRIVER=mailpit` je v kontejneru trvale nepoužitelná a profil `mail` z Tasku 22 se s ní nedá spustit. Guard proto navázat na vlastní klíč, ne na NODE_ENV — přidat do `Env` `APP_ENV: z.enum(['development','test','production']).default('development')`, superRefine přepsat na `if (v.APP_ENV === 'production' && v.MAIL_DRIVER === 'memory')` a `APP_ENV: ${APP_ENV:-production}` předávat v compose. Pak `MAIL_DRIVER=mailpit` + profil `mail` funguje lokálně i v CI a produkční nasazení se `APP_ENV=production` chrání proti tichému zahazování pošty. Bez této úpravy je `MailDriver` hodnota `'mailpit'` v kontejnerizovaném běhu mrtvý kód.

Poznámky k nálezu, které je při zápisu potřeba opravit: e2e testy by kvůli nedostupnému `mailpit` nespadly — Task 12 obaluje obě `mailer.send` do try/catch a jen loguje. A protože Zod `.superRefine` běží až po úspěšném parse objektu, první boot vypíše jen chyby `BANK_ACCOUNT_IBAN`/`BANK_ACCOUNT_NUMBER`, ne obě chyby zároveň.

### [critical] `@playwright/test` není nikde v závislostech — `npm run test:e2e` i `npm run typecheck` spadnou

**Kde:** Task 23, job `e2e` (`npm ci && npx playwright install --with-deps chromium`, `npm run test:e2e`) a job `quality` (`npm run typecheck`); zdroj je Task 1 Step 1/2 a Task 24

**Problém:** Task 1 instaluje jen `vitest`, `@vitest/coverage-v8` a `tsx`; Task 24 zavádí skript `"test:e2e": "playwright test"` a `playwright.config.ts`, ale nikde v plánu není `npm i -D @playwright/test`. `npx playwright install --with-deps chromium` nainstaluje jen prohlížeče přes dočasně stažený balík, do `node_modules/.bin` nic trvale nepřidá.

**Důsledek:** Krok `npm run test:e2e` skončí na `sh: playwright: not found`. Ještě dřív spadne job `quality`: `tsconfig.json` má `include: ["**/*.ts"]`, takže `tsc --noEmit` narazí na `playwright.config.ts` s `Cannot find module '@playwright/test'` (snippet v Tasku 24 navíc nemá vůbec importy `defineConfig`/`devices`). Pipeline je červená hned na prvním běhu ve dvou jobech.

**Oprava:** Do Tasku 1 Step 1 přidat `@playwright/test` mezi devDependencies (`npm i -D @playwright/test`), aby byl v `package-lock.json`, a do `playwright.config.ts` doplnit `import { defineConfig, devices } from '@playwright/test'`. V e2e jobu pak stačí `npx playwright install --with-deps chromium` (bez `npm ci &&` v jednom řádku, ať je vidět, který krok selhal).

**Upřesnění od ověřovatelů:** Oprava je v jádru správná, ale poslední věta o CI je zavádějící a v doslovném čtení by job `e2e` rozbila jinak. Přesné znění opravy:

1. Task 1 Step 1 — přidat do devDependencies: `npm i -D @playwright/test` (musí být v `package-lock.json`, aby ho `npm ci` v CI nainstaloval).
2. Task 24 Step 1 — na začátek `playwright.config.ts` doplnit `import { defineConfig, devices } from '@playwright/test'`.
3. Task 24 Step 2/3 a Task 28 Step 7 — do snippetů spec souborů doplnit `import { test, expect } from '@playwright/test'` (jinak `tsc --noEmit` i `eslint .` spadnou na nedefinovaných `test`/`expect`).
4. Task 23, job `e2e` — `npm ci` se NESMÍ vypustit; bez něj v jobu neexistuje `node_modules` a `npm run test:e2e` selže. Jen rozdělit jeden řádek na dva samostatné kroky, aby bylo vidět, který spadl:
   - `- run: npm ci`
   - `- run: npx playwright install --with-deps chromium`
   (`npx playwright install` po instalaci `@playwright/test` použije lokální verzi, takže verze runneru a prohlížečů zůstanou v souladu.)

### [critical] QR platba se nikdy nedostane do potvrzovacího e-mailu — Task 26 nemění Task 12 ani Task 10

**Kde:** Task 26 (Dodatek A), krok 5; proti Tasku 12 (ReserveOrder.notify) a Tasku 10 (Container)

**Problém:** Task 26 mění signaturu `renderCustomerConfirmation(order, publicUrl, payment: PaymentDetails | null)` a testy ji volají s `await` (je nově async). Jediné místo, které tuto šablonu volá, je `ReserveOrder.notify()` v Tasku 12: `renderCustomerConfirmation(order, ...)` se dvěma argumenty a bez awaitu na výsledek renderu. Task 26 ani Dodatek A neuvádí `src/application/use-cases/reserve-order.ts` mezi měněnými soubory a seznam „mění tasky 1, 9 a 20“ Task 12 vůbec nezmiňuje. Navíc `ReserveOrderDeps.config` má jen `{ farmerEmail, publicBaseUrl }` a `Container.config` taktéž — `BANK_ACCOUNT_IBAN` a `BANK_ACCOUNT_NUMBER` se do use-case nemají jak dostat.

**Důsledek:** Buď typecheck spadne (2 vs. 3 argumenty), nebo — pokud je třetí parametr volitelný — se e-mail zákazníkovi odešle vždy bez platebního bloku a bez QR přílohy. Celý požadavek spec 5b („e-mail zákazníkovi — QR jako inline příloha s Content-ID“) tím zůstane nesplněný, aniž by to jakýkoli test odhalil, protože testy Tasku 26 volají šablonu přímo, ne přes ReserveOrder.

**Oprava:** Do Dodatku A doplnit změnu Tasku 10 a Tasku 12: `Container.config` rozšířit o `bank: { iban: Iban; accountNumber: string }` (sestavené z `env.BANK_ACCOUNT_IBAN` / `BANK_ACCOUNT_NUMBER`), `ReserveOrderDeps` o tentýž `bank`, a v `notify()` počítat `const payment = requiresTransfer(order.payment) ? buildPaymentDetails(order, this.deps.bank) : null` a předat ho do `renderCustomerConfirmation`. Přidat do Tasku 12 unit test „objednávka s QR platbou odešle e-mail s přílohou cid:qr@silentagro, objednávka na hotovost bez ní“.

**Upřesnění od ověřovatelů:** Navrzena oprava je spravna, jen ji doplnit o dva body, bez kterych se stejny typecheck pad zopakuje: (1) v Dodatku A explicitne prepsat i deklarovanou signaturu z Tasku 9 na `export function renderCustomerConfirmation(order: Order, publicUrl: string, payment: PaymentDetails | null): Promise<MailMessage>` (async, protoze QR PNG vznika az uvnitr sablony pres `renderQrPng`); (2) v `notify()` render awaitovat pred predanim do maileru — `await this.deps.mailer.send(await renderCustomerConfirmation(order, url, payment))`, nikoli `mailer.send(renderCustomerConfirmation(...))`, ktere by poslalo Promise. Zbytek (rozsireni `Container.config` a `ReserveOrderDeps` o `bank: { iban: Iban; accountNumber: string }` sestaveny z `env.BANK_ACCOUNT_IBAN` / `env.BANK_ACCOUNT_NUMBER`, vypocet `const payment = requiresTransfer(order.payment) ? buildPaymentDetails(order, this.deps.bank) : null` a unit test v Tasku 12 na prilohu `cid:qr@silentagro` u QR objednavky vs. zadna priloha u hotovosti) plati beze zmeny.

### [critical] Dodatek A rozšířil povinné proměnné prostředí, ale compose ani CI je nepředávají — aplikace v kontejneru nenastartuje

**Kde:** Dodatek A, změny Tasku 1; proti Tasku 22 (docker-compose.yml, krok 4) a Tasku 23 (ci.yml, joby integration a e2e)

**Problém:** Dodatek A přidává do `Env` povinné `BANK_ACCOUNT_IBAN` (bez defaultu, `.min(1)` + mod-97) a `BANK_ACCOUNT_NUMBER`, plus `superRefine`, který při `NODE_ENV=production` a `MAIL_DRIVER !== 'smtp'` konfiguraci odmítne. Dockerfile v Tasku 22 nastavuje `ENV NODE_ENV=production`, ale `environment:` bloku služby `app` v docker-compose.yml chybí `MAIL_DRIVER`, `BANK_ACCOUNT_IBAN` i `BANK_ACCOUNT_NUMBER`. Stejně tak `env:` blok jobu `integration` a příprava `.env` v jobu `e2e` v ci.yml. Dodatek A přitom tvrdí, že mění jen tasky 1, 9 a 20.

**Důsledek:** `docker compose up -d --build` skončí tak, že kontejner `app` při prvním čtení `env` vyhodí „Neplatná konfigurace prostředí: BANK_ACCOUNT_IBAN…“ a spadne do restart smyčky; healthcheck nikdy neprojde. Tím padá Definice hotového („dva kontejnery, oba healthy“), padá job `e2e` i závěrečné ověření v Tasku 24 krok 5. Job `integration` spadne na prvním testu, který sáhne na `getContainer()`.

**Oprava:** Do Dodatku A doplnit sekci „Změny v Tasku 22 a 23“: v `docker-compose.yml` přidat `MAIL_DRIVER: ${MAIL_DRIVER:-smtp}`, `BANK_ACCOUNT_IBAN: ${BANK_ACCOUNT_IBAN:?nastavte BANK_ACCOUNT_IBAN}`, `BANK_ACCOUNT_NUMBER: ${BANK_ACCOUNT_NUMBER:?...}`; v `docker-compose.prod.yml` totéž. V ci.yml do `env:` jobu `integration` přidat `MAIL_DRIVER: memory`, `BANK_ACCOUNT_IBAN: CZ6508000000192000145399`, `BANK_ACCOUNT_NUMBER: 2000145399/0800` a do generovaného `.env` v jobu `e2e` tytéž tři klíče (s `MAIL_DRIVER=smtp`, protože image běží s NODE_ENV=production).

**Upřesnění od ověřovatelů:** Oprava zůstává v podstatě tak, jak je navržena; doplnil bych dvě věci a opravil bych popis důsledku.

1) Do Dodatku A přidat sekci „Změny v Tasku 22 a 23“ a v `docker-compose.yml` (a stejně v `docker-compose.prod.yml`) do `environment:` služby `app` doplnit:
   MAIL_DRIVER: ${MAIL_DRIVER:-smtp}
   BANK_ACCOUNT_IBAN: ${BANK_ACCOUNT_IBAN:?nastavte BANK_ACCOUNT_IBAN}
   BANK_ACCOUNT_NUMBER: ${BANK_ACCOUNT_NUMBER:?nastavte BANK_ACCOUNT_NUMBER}
   (Nestačí je mít v `.env` — ten compose používá jen k interpolaci, do kontejneru nic nepředává.)
   Zároveň doplnit i `.env.example` o `MYSQL_ROOT_PASSWORD`/`MYSQL_PASSWORD`, které Task 22 krok 5 předpokládá, a v Tasku 22 kroku 5 doplnit poznámku, že se vyplní i `BANK_ACCOUNT_*`.

2) V `ci.yml` do `env:` jobu `integration` přidat `BANK_ACCOUNT_IBAN: CZ6508000000192000145399` a `BANK_ACCOUNT_NUMBER: 2000145399/0800` (`MAIL_DRIVER` tam být nemusí — Task 25 krok 4 už ho vynucuje přes `test.env` ve `vitest.config.ts`; když se přidá, musí to být `memory`). Do generovaného `.env` v jobu `e2e` přidat tytéž dva klíče plus `MAIL_DRIVER=smtp`.

3) Aby se stejná díra neopakovala u dalšího klíče, přidat do Tasku 22 kroku 5 (a do Definice hotového) ověření, které skutečně sáhne na `env` — samotný `/api/health` nestačí, protože čte jen databázi:
   curl -fsS http://localhost:3000/ > /dev/null   # homepage jde přes getContainer(), tj. přes env
   Alternativně rozšířit `/api/health` o `env.PUBLIC_BASE_URL` (nebo `loadEnv()` v try/catch) a vracet `config: 'ok' | 'invalid'`, aby chybná konfigurace shodila healthcheck místo aby se projevila až 500 na uživatelských stránkách.

Popis důsledku v nálezu opravit: kontejner nastartuje a bude `healthy` (validace je lazy přes Proxy, `/api/health` na `env` nesahá), žádná restart smyčka nenastane; selhání se projeví až 500 na každé stránce jdoucí přes `getContainer()` / platební blok, tedy v Playwright testech jobu `e2e` a v jobu `integration`.

### [high] E2E job nikdy nenastaví `E2E_FARMER_PASSWORD`, který e2e testy vyžadují

**Kde:** Task 23, job `e2e`, krok `npm run test:e2e`; Task 24 Step 3 („Heslo farmáře v E2E se bere z `E2E_FARMER_PASSWORD`, stejné jako `SEED_FARMER_PASSWORD` v CI“)

**Problém:** Vygenerované heslo se zapíše do `.env` a předá jen dovnitř kontejneru při seedu. Krok, který spouští Playwright na hostiteli, žádný `env:` blok nemá, takže `process.env.E2E_FARMER_PASSWORD` je `undefined`.

**Důsledek:** `loginAsFarmer(page)` odešle prázdné nebo `undefined` heslo, přihlášení selže a testy `admin.spec.ts` a Task 28 Step 7 (příznak zaplaceno) padnou. Kvůli `retries: 2` v CI se to navíc opakuje třikrát a chybová hláška vypadá jako problém autentizace, ne konfigurace.

**Oprava:** Vygenerovat heslo jednou do prostředí jobu místo dodatečného vytahování z `.env`: v přípravném kroku `PW=$(openssl rand -hex 12); echo "::add-mask::$PW"; echo "SEED_FARMER_PASSWORD=$PW" >> "$GITHUB_ENV"; echo "E2E_FARMER_PASSWORD=$PW" >> "$GITHUB_ENV"; echo "SEED_FARMER_PASSWORD=$PW" >> .env`, a v kroku seedu použít `--env SEED_FARMER_PASSWORD="$SEED_FARMER_PASSWORD"`.

**Upřesnění od ověřovatelů:** Zavrit obe poloviny — CI i lokalni beh — protoze Playwright `.env` nenacita sam.

(a) V Tasku 23, job `e2e`, nahradit pripravny krok tak, aby heslo vzniklo jednou a slo do prostredi jobu:

```yaml
      - name: Připravit .env a heslo farmáře
        run: |
          PW="$(openssl rand -hex 12)"
          echo "::add-mask::$PW"
          {
            echo "MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)"
            echo "MYSQL_PASSWORD=$(openssl rand -hex 16)"
            echo "AUTH_SECRET=$(openssl rand -base64 48)"
            echo "SEED_FARMER_PASSWORD=$PW"
          } >> .env
          {
            echo "SEED_FARMER_PASSWORD=$PW"
            echo "E2E_FARMER_PASSWORD=$PW"
          } >> "$GITHUB_ENV"
```

a krok seedu zjednodusit na
`- run: docker compose exec -T --env SEED_FARMER_PASSWORD="$SEED_FARMER_PASSWORD" app npx tsx prisma/seed.ts`
(hodnoty z `GITHUB_ENV` jsou dostupne v nasledujicich krocich, takze seed i `npm run test:e2e` je uvidi).

(b) V Tasku 24 Step 1 doplnit do `playwright.config.ts` nacteni `.env`, aby fungoval i lokalni `npm run test:e2e` z Task 24 Step 5:

```ts
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '.env') })
```

a do `.env.example` (Task 1 Step 8) pridat radek `E2E_FARMER_PASSWORD=""` s poznamkou, ze musi odpovidat `SEED_FARMER_PASSWORD` pouzitemu pri seedu. `dotenv` pridat do `devDependencies`.

(c) V Tasku 24 pridat helper `tests/e2e/helpers/auth.ts`, ktery pri chybejicim hesle spadne s jasnou hlaskou misto neuspesneho prihlaseni:

```ts
export async function loginAsFarmer(page: Page) {
  const password = process.env.E2E_FARMER_PASSWORD
  if (!password) throw new Error('E2E_FARMER_PASSWORD není nastavené — E2E přihlášení farmáře nelze provést.')
  // ...
}
```
Tim se pripadny budouci vypadek konfigurace projevi jako chyba konfigurace, ne jako selhani autentizace opakovane trikrat kvuli `retries: 2`.

### [high] Job integration nemá env proměnné přidané Dodatkem A — loadEnv vyhodí chybu

**Kde:** Task 23, job `integration`, blok `env:`

**Problém:** `env:` obsahuje sedm klíčů z původního Tasku 1. Dodatek A přidal `BANK_ACCOUNT_IBAN` a `BANK_ACCOUNT_NUMBER` jako povinné (`z.string().min(1)`, bez `.default()`), takže `loadEnv` na nich selže. Integrační testy z Tasku 12 (`makeReserveOrder()` proti reálné `PrismaUnitOfWork`) a z Tasku 26/27 (potvrzovací e-mail s `PaymentDetails`) vedou na kód, který `env` čte.

**Důsledek:** Jakmile se v integračním běhu poprvé sáhne na `env`, vyletí `Neplatná konfigurace prostředí: BANK_ACCOUNT_IBAN: Required`. Job spadne, aniž by to mělo cokoli společného s testovanou logikou. Navíc s `MAIL_DRIVER` nenastaveným se použije default `mailpit` a mailer se pokusí spojit na `SMTP_HOST=localhost:1025`, kde v tomto jobu nic neposlouchá.

**Oprava:** Do `env:` bloku integration jobu doplnit `MAIL_DRIVER: memory`, `BANK_ACCOUNT_IBAN: CZ6508000000192000145399`, `BANK_ACCOUNT_NUMBER: 2000145399/0800`. Zároveň v Dodatku A doplnit poznámku, že Task 23 (job integration) je jeho změnou dotčen — dodatek dnes uvádí jen tasky 1, 9 a 20.

**Upřesnění od ověřovatelů:** Jádro opravy (doplnit do `env:` bloku jobu `integration` v Tasku 23) je správné:

```yaml
      BANK_ACCOUNT_IBAN: CZ6508000000192000145399   # mod-97 platný, shodný s testy Tasku 26
      BANK_ACCOUNT_NUMBER: 2000145399/0800
```

Tři korekce oproti navržené opravě:

1. `MAIL_DRIVER: memory` do CI env patří jen jako pojistka, ne jako hlavní řešení — Task 25 Step 4 už předepisuje `test.env: { MAIL_DRIVER: 'memory' }` ve `vitest.config.ts`. Pozor ale: `unit` i `integration` jsou v Tasku 1 inline projekty v `test.projects` a root-level `test`/`resolve` options se do inline projektů dědí automaticky (`extends: true`) až od Vitest 5; ve Vitest 4 se nedědí. Bezpečné je dát `env: { MAIL_DRIVER: 'memory' }` přímo do obou projektů (nebo jim explicitně nastavit `extends: true`) — což zároveň řeší i root `resolve.alias` pro `@/`, který má tentýž problém dědičnosti.

2. Stejnou dírou trpí i Task 22, `docker-compose.yml`, služba `app` — v `environment:` chybí `BANK_ACCOUNT_IBAN` i `BANK_ACCOUNT_NUMBER`, takže kontejner spadne při prvním čtení `env`; s ním spadne i job `e2e` v Tasku 23, který aplikaci startuje přes compose a generuje `.env` jen se čtyřmi proměnnými. Doplnit:

```yaml
      MAIL_DRIVER: ${MAIL_DRIVER:-smtp}
      BANK_ACCOUNT_IBAN: ${BANK_ACCOUNT_IBAN:?nastavte BANK_ACCOUNT_IBAN}
      BANK_ACCOUNT_NUMBER: ${BANK_ACCOUNT_NUMBER:?nastavte BANK_ACCOUNT_NUMBER}
```

a do generovaného `.env` v e2e jobu přidat `BANK_ACCOUNT_IBAN=CZ6508000000192000145399` a `BANK_ACCOUNT_NUMBER=2000145399/0800`.

3. U compose pozor na kolizi s `superRefine` z Dodatku A: Dockerfile v Tasku 22 pevně nastavuje `ENV NODE_ENV=production`, takže pravidlo „v produkci musí být MAIL_DRIVER=smtp" shodí kontejner při jakémkoli jiném driveru. Buď e2e job musí do `.env` dát `MAIL_DRIVER=smtp` se `SMTP_HOST` mířícím na mailpit profil, nebo pravidlo vázat na samostatný `APP_ENV`/`PUBLIC_BASE_URL` místo `NODE_ENV`.

A do Dodatku A doplnit, že mění i Task 22 a Task 23, ne jen tasky 1, 9 a 20.

### [high] Job security je zelený jen na veřejném repozitáři s GitHub Advanced Security; upload-sarif a gitleaks jinak selžou

**Kde:** Task 23, job `security`, kroky `gitleaks/gitleaks-action@v2` a `github/codeql-action/upload-sarif@v3`

**Problém:** Logika kroků je správná — Trivy s `exit-code: "1"` report zapíše a teprve pak skončí nenulově, takže následný `upload-sarif` s `if: always()` se opravdu spustí. Blokuje to ale prostředí: `upload-sarif` na privátním repozitáři bez GHAS vrátí 403 „Advanced Security must be enabled for this repository to use code scanning“, a u PR z forku je `GITHUB_TOKEN` jen pro čtení, takže `security-events: write` nelze udělit. `gitleaks-action@v2` navíc u repozitářů vlastněných organizací vyžaduje `GITLEAKS_LICENSE` a bez něj krok padá s licenční hláškou.

**Důsledek:** Na privátním repozitáři farmy (nejpravděpodobnější varianta) je job `security` červený při každém běhu bez ohledu na to, co se najde. Tým si zvykne pipeline ignorovat — přesně to, čemu se plán snaží vyhnout u `ignore-unfixed`.

**Oprava:** Rozhodnout viditelnost repozitáře už v plánu. Pro privátní bez GHAS: nahradit `upload-sarif` výstupem `format: table` do logu plus `actions/upload-artifact` se SARIFem, a krok `upload-sarif` obalit `if: github.event.repository.private == false`. Pro gitleaks buď doplnit `GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}` a krok podmínit `if: secrets.GITLEAKS_LICENSE != ''`, nebo action vyměnit za volání binárky (`gitleaks detect --source . --redact`), které licenci nevyžaduje.

**Upřesnění od ověřovatelů:** Nalez plati, ale opravu je treba upravit ve trech bodech:

1) `if: secrets.GITLEAKS_LICENSE != ''` NEFUNGUJE - kontext `secrets` neni v step-level `if` dostupny (povoleno je jen github, needs, strategy, matrix, job, runner, env, vars, steps, inputs). Secret je nutne nejdriv promitnout do env na urovni jobu a testovat env:

```yaml
  security:
    runs-on: ubuntu-latest
    permissions: { contents: read, actions: read, security-events: write }
    env:
      GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
    steps:
      ...
      - name: Gitleaks
        if: env.GITLEAKS_LICENSE != ''
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_LICENSE: ${{ env.GITLEAKS_LICENSE }}
```

Robustnejsi (a doporucena) varianta je action uplne vynechat a volat binarku, ktera licenci nikdy nevyzaduje - odpada tim i podminka:

```yaml
      - name: Gitleaks
        run: |
          curl -sSfL -o gitleaks.tar.gz \
            https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz
          tar -xzf gitleaks.tar.gz gitleaks
          ./gitleaks detect --source . --redact --no-banner --exit-code 1
```

2) Podminka `if: github.event.repository.private == false` neni spolehliva sama o sobe - u `pull_request` z forku je sice `github.event.repository` base repozitar, ale token je stejne read-only, takze upload spadne i na verejnem repu. Podminka musi pokryt oba pripady:

```yaml
      - name: Nahrat SARIF do code scanningu
        if: always() && github.event.repository.private == false && github.event.pull_request.head.repo.fork != true
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: trivy.sarif }
```

3) K `permissions` jobu je nutne pridat `actions: read` (viz blok vyse). GitHub Docs "Uploading a SARIF file to GitHub" ho pro privatni repozitare vyzaduje vedle `security-events: write` a `contents: read`; bez nej upload-sarif skonci na "Resource not accessible by integration" i tam, kde je Code Security zaplaceny. Tohle plati bez ohledu na to, jak se rozhodne o viditelnosti repozitare, takze to patri do planu tak jako tak.

Doplnkove: SARIF je vzdy uzitecne archivovat nezavisle na code scanningu, aby byl vysledek k dispozici i na privatnim repu bez GHAS:

```yaml
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: trivy-sarif, path: trivy.sarif, if-no-files-found: warn }
```

`if-no-files-found: warn` je tam zamerne - kdyz spadne `docker build`, soubor neexistuje a krok by jinak shodil job podruhe z jineho duvodu.

A v Tasku 23 Step 4 nahradit "zkontrolovat, ze vsechny ctyri joby prosly" explicitnim rozhodnutim o viditelnosti repozitare (verejny = code scanning zdarma a gitleaks bez licence pri osobnim vlastnictvi; privatni = SARIF jen jako artefakt + `format: table` do logu).

### [high] Adresář public/ nikdy nevznikne — Docker build spadne na COPY

**Kde:** Task 1 (chybí krok vytvářející public/), Task 22 krok 1 (Dockerfile), .gitignore v Tasku 1 kroku 9

**Problém:** .gitignore obsahuje `public/uploads/*` a `!public/uploads/.gitkeep`, ale žádný krok soubor `public/uploads/.gitkeep` (ani adresář `public/`) nevytváří. Dockerfile přitom obsahuje `COPY --from=builder --chown=node:node /app/public ./public`. Git prázdné adresáře neverzuje, takže v čerstvém klonu `public/` neexistuje.

**Důsledek:** `docker compose up --build` i `docker build -t silentagro:scan .` v jobu `security` selžou hláškou „COPY failed: file not found in build context or excluded by .dockerignore: stat /app/public: file does not exist“. Padne Task 22, Task 23 (security i e2e) a Definice hotového. Sekundárně: lokální `POST /api/uploads` s `UPLOAD_DIR=./public/uploads` selže na ENOENT, protože cílový adresář neexistuje.

**Oprava:** Do Tasku 1 přidat krok „vytvořit `public/uploads/.gitkeep`“ (a případně `public/favicon.ico`) a explicitně ho commitnout. Alternativně v Dockerfile před COPY přidat `RUN mkdir -p ./public/uploads`. V `/api/uploads` (Task 21) navíc před zápisem volat `fs.mkdir(env.UPLOAD_DIR, { recursive: true })`.

**Upřesnění od ověřovatelů:** Hlavni oprava v nalezu je spravna: do Tasku 1 pridat krok, ktery vytvori `public/uploads/.gitkeep` a explicitne ho commitne (`git add -f public/uploads/.gitkeep` neni nutne — pravidla `public/uploads/*` + `!public/uploads/.gitkeep` negaci umoznuji, protoze zadny rodicovsky adresar neni ignorovany). Alternativa v nalezu je ale chybna: `RUN mkdir -p ./public/uploads` „v Dockerfile pred COPY" nepomuze, pokud je v `runner` stagi — build padne uz pri rozliseni ZDROJE `/app/public` ve stagi `builder`. Spravne varianty jsou: (a) v `builder` stagi za `COPY . .` pridat `RUN mkdir -p /app/public`, nebo (b) COPY zmenit na tolerantni tvar `COPY --from=builder --chown=node:node /app/publi[c] ./public` (glob, ktery se pri neexistenci zdroje nevyhodnoti jako chyba), pripadne radek uplne vypustit, kdyz aplikace zadna verzovana statika v `public/` nema. V Tasku 21 (`src/app/api/uploads/route.ts`) navic pred zapisem volat `await fs.mkdir(env.UPLOAD_DIR, { recursive: true })` — to plati bez ohledu na zvolenou variantu.

### [high] Seed uvnitř produkčního image nepůjde spustit — `npx tsx` v standalone runneru s read_only FS

**Kde:** Task 22 krok 6, Task 23 ci.yml job `e2e` (krok se seedem), proti Tasku 22 kroku 1 (runner stage)

**Problém:** Plán seeduje kontejner příkazem `docker compose exec app npx tsx prisma/seed.ts`. Runner stage kopíruje jen `.next/standalone` (což je node_modules oříznuté Next tracingem), `.prisma`, `@prisma` a `prisma`. `tsx` je devDependency a v runneru není. `npx` by ho zkusil stáhnout do `~/.npm`, jenže služba `app` má `read_only: true` a zapisovatelný má jen `/tmp` a volume s uploady.

**Důsledek:** Seed v kontejneru skončí chybou (npx nemá kam zapsat cache / nemá registry). Tím padá krok 6 Tasku 22 i celý job `e2e` v CI, protože všechny E2E scénáře (přihlášení farmáře, odrůda Bernie, objednávka #2609 v Tasku 28) předpokládají naseedovaná data.

**Oprava:** Seed nepouštět přes tsx za běhu. V builder stage přeložit seed do JS (`npx tsx --build` nebo `esbuild prisma/seed.ts --bundle --platform=node --outfile=prisma/seed.mjs`) a do runneru kopírovat `prisma/seed.mjs`; seedovat pak `docker compose exec app node prisma/seed.mjs`. Odpovídajícím způsobem upravit `package.json` (`"prisma": { "seed": ... }`) a krok seedu v ci.yml.

**Upřesnění od ověřovatelů:** Nepokoušet se v produkčním read-only runneru vůbec spouštět TypeScript. Dvě varianty, obě lepší než `npx tsx --build`:

Varianta A (doporučená, žádný build seedu): přidat do `docker-compose.yml` jednorázovou službu `seeder` postavenou z `builder` stage, která má kompletní `node_modules` včetně `tsx`, a nemá `read_only`:

```yaml
  seeder:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder
    profiles: [seed]
    depends_on:
      db: { condition: service_healthy }
    environment:
      DATABASE_URL: mysql://${MYSQL_USER:-silentagro}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE:-silentagro}
      SEED_FARMER_PASSWORD: ${SEED_FARMER_PASSWORD:?nastavte SEED_FARMER_PASSWORD}
    networks: [internal]
    command: ["npm", "run", "db:seed"]
```

Task 22 krok 6 pak zní `"$DOCKER" compose --profile seed run --rm seeder`, v ci.yml stejně (`docker compose --profile seed run --rm seeder`). `package.json` zůstane beze změny (`"db:seed": "tsx prisma/seed.ts"`, `"prisma": { "seed": "tsx prisma/seed.ts" }`), takže lokální běh v Tasku 7 kroku 3 dál funguje. Výchozí sestava zůstává dvoukontejnerová, protože služba je pod profilem.

Varianta B (pokud musí seed žít v runtime image): v `builder` stage přeložit seed přes esbuild s externím Prisma klientem
`RUN npx esbuild prisma/seed.ts --bundle --platform=node --format=esm --target=node22 --external:@prisma/client --outfile=prisma/seed.mjs`
(esbuild respektuje `paths` z `tsconfig.json`, takže import `ORDER_CODE_OFFSET` z `@/...` se vyřeší), do runneru kopírovat `--from=builder /app/prisma/seed.mjs ./prisma/seed.mjs` a seedovat `docker compose exec -e SEED_FARMER_PASSWORD=... app node prisma/seed.mjs`. `package.json` NEMĚNIT.

Součástí téže opravy musí být `docker/entrypoint.sh`: `npx prisma migrate deploy` selže ze stejného důvodu (`node_modules/.bin/` ve standalone výstupu není, npx by prisma stahoval na read-only FS). Nahradit přímým voláním, které nepotřebuje `.bin` ani npm cache:

```sh
node node_modules/prisma/build/index.js migrate deploy
```

### [medium] `npm audit --audit-level=high` bez omezení na produkční závislosti shodí celou pipeline kvůli devDependencies

**Kde:** Task 23, job `security`, krok „Audit závislostí“

**Problém:** `npm audit --audit-level=high` vrací nenulový kód pro jakoukoli HIGH/CRITICAL zranitelnost včetně těch, které jsou jen v devDependencies (eslint, vitest, playwright, prisma CLI) a včetně těch, pro které neexistuje oprava. Je to nekonzistentní s vědomým rozhodnutím u Trivy, kde `ignore-unfixed: true` přesně tuhle situaci řeší.

**Důsledek:** Job `security` zčervená kvůli advisory v transitivní vývojové závislosti, která se nikdy nedostane do produkčního image (runner stage nese jen standalone build a Prisma). Buildy blokuje něco, co s běžící aplikací nesouvisí, a náprava často neexistuje.

**Oprava:** Krok rozdělit: `npm audit --audit-level=high --omit=dev` jako blokující (to je to, co je v image) a `npm audit --audit-level=moderate || true` jako informativní výpis. Aktualizace devDependencies nechat na `dependabot.yml` ze Step 3.

**Upřesnění od ověřovatelů:** Rozdeleni na blokujici a informativni krok je spravne, ale samotne `--omit=dev` vytvori slepe misto: v Task 1 se `prisma` (CLI) instaluje jako **devDependency** (`npm i -D ... prisma ...`), zatimco Dockerfile v Task 22 kopiruje `node_modules/prisma` do runner stage a entrypoint spousti `npx prisma migrate deploy` pri kazdem startu kontejneru. Prisma CLI tedy V PRODUKCNIM IMAGE JE a bezi tam, ale `npm audit --omit=dev` by ji preskocil.

Doporucena podoba kroku:

```yaml
      - name: Audit produkcnich zavislosti (blokujici)
        run: npm audit --audit-level=high --omit=dev
      - name: Audit prisma CLI (je v runtime image, ale je devDependency)
        run: npm audit --audit-level=high --package-lock-only --omit=dev --json > /dev/null || true
      - name: Audit vsech zavislosti (informativni)
        run: npm audit --audit-level=moderate || true
```

Cistsi varianta, ktera slepe misto odstrani uplne misto obchazeni: presunout `prisma` z devDependencies do `dependencies` v package.json (Task 1, Step 1 — `npm i prisma` misto `npm i -D prisma`). Je to konzistentni s tim, ze ji Dockerfile do image kopiruje zamerne, a `npm audit --omit=dev` ji pak pokryje bez dalsiho kroku. Zbytek opravy (informativni `npm audit --audit-level=moderate || true` a ponechani dev aktualizaci na `dependabot.yml` ze Step 3) plati beze zmeny.

## Neověřené nálezy — k ručnímu posouzení

Vzneseny, ale ověřovatelé nedoběhli. Seřazeno podle hlediska.

### konzistence

- renderCustomerConfirmation má v plánu dva neslučitelné tvary (2 vs 3 parametry, sync vs async) a volající Task 12 se neaktualizuje
- Kódy objednávek v seedu si protiřečí sami se sebou i s testy (#2607–#2609 vs #2610–#2612 vs #2613)
- Aplikace v Dockeru i v CI nenastartuje: chybí MAIL_DRIVER a BANK_ACCOUNT_* v compose a workflow, a NODE_ENV=production zakazuje výchozí driver
- Soubor create-mailer.ts nikdo nevytváří, přesto z něj test importuje
- MailMessage má v plánu dvě neslučitelné definice a dodatek neříká, který soubor se mění
- NodemailerMailer má jiný konstruktor v Tasku 9 než v Tasku 25 a chybí mu deklarovaná metoda describe()
- Bankovní konfigurace (IBAN, číslo účtu) nemá cestu z env do use-case ani na stránku
- OrderView nenese platební metodu ani platební údaje, takže PaymentBlock na potvrzení nemá z čeho renderovat
- Částka v QR kódu a částka vypsaná slovy se u půlkilových objednávek liší
- PaymentDetails je definován dvakrát a druhá definice ruší pole z první
- KPI „Nezaplacené převodem" vyžaduje dotaz, který žádný port neumí
- Server action reserveOrderAction používá typ ReserveOrderPayload, který nikde neexistuje
- Logger je deklarovaný ve dvou modulech současně
- Dodatek B mění Task 15, ale v hlavičce ho mezi měněnými tasky nejmenuje
- SiteHeader v Tasku 16 volá useCart, který vznikne až v Tasku 18
- Balík @playwright/test se nikde neinstaluje, přestože skript i CI ho spouštějí
- Seed uvnitř kontejneru přes `npx tsx` nemůže fungovat s definovaným runtime image
- Sekce File Structure neobsahuje soubory zavedené dodatky A a B
- Testovací fixtura loadEnv v Tasku 1 neobsahuje klíče, které dodatek A zavádí jako povinné
- Variety.withdraw v implementační ukázce používá this.props, které deklarované rozhraní nemá
- SetOrderPaid předává do formatDateCs hodnotu typu Date | null

### bezpecnost

- AUTH_SECRET v .env.example projde validací → kdokoli si podepíše FARMER session
- Rate limit klíčovaný přes x-forwarded-for: buď jeden globální kbelík, nebo obejitelný jednou hlavičkou
- Server actions nemají žádnou runtime validaci vstupu a berou identitu z klientského payloadu
- Platný cizí IBAN jako výchozí hodnota v .env.example — QR kódy zákazníkům míří na cizí účet
- Dodatek A přidal povinné env proměnné, ale compose a CI je nepředávají — produkční sestava nenastartuje
- Registrace: žádný rate limit a odlišná hláška u existujícího e-mailu → volná enumerace účtů
- CSP se `script-src 'unsafe-inline'` je jen dekorace, přestože middleware pro nonce už existuje
- Rezervace okamžitě odečte sklad, ale neexistuje strop množství ani cesta ho vrátit
- read_only rootfs + `npx prisma migrate deploy` v entrypointu: hardening shodí start kontejneru
- Middleware ověřuje token proti prázdnému klíči, když AUTH_SECRET chybí

### soubeh

- UpsertVariety přepíše sklad absolutní hodnotou z formuláře a smaže proběhlé rezervace
- lockForUpdate: zámek a čtení jsou dva různé dotazy, správnost visí jen na ReadCommitted — a zdůvodnění v plánu je fakticky chybné
- Žádné ošetření deadlocku, lock wait timeoutu ani vyčerpání connection poolu
- Instrukce k platbě uvádí jinou částku než QR kód — formatCzk zaokrouhluje na celé koruny
- Stránka potvrzení nemá z čeho postavit PaymentDetails — dodatek A neaktualizoval GetOrderByToken
- resetDatabase: SET FOREIGN_KEY_CHECKS a TRUNCATE mohou skončit na různých spojeních z poolu
- Sklad nemá na úrovni DB žádné omezení — záporné hodnoty i množství mimo půlkilový krok projdou a shodí čtecí cestu
- OrderRepository.create není atomický sám o sobě — uniklý dočasný kód dá nesmyslný variabilní symbol
- SetOrderPaid a AdvanceOrderStatus dělají read-modify-write bez zámku řádku — deklarovaná idempotence pod souběhem neplatí
- Seed si v Tasku 7 protiřečí v číslování objednávek a rozbíjí E2E test z Dodatku B
- Dodatek A rozšířil Env o povinné klíče, ale nechal testovací fixturu z Tasku 1 nedotčenou
- revalidate = 30 na homepage vynutí prerender při buildu, kde podle Tasku 22 nesmí být databáze

### nextjs

- "type": "module" v package.json rozbije standalone server na Next 15
- npx prisma a npx tsx v runner image nemají co spustit
- Stránky čtoucí DB se v Next 15 prerenderují při buildu — docker build nemá ani env, ani databázi
- toResultError se nesmí exportovat ze souboru se 'use server'; direktiva navíc v plánu chybí úplně
- params na /rezervace/[token] jsou v Next 15 Promise — plán to nikde neříká
- CSP bez 'unsafe-eval' zablokuje next dev, kde plán předepisuje ruční ověření v prohlížeči
- Fotky nahrané za běhu do public/uploads produkční server neservíruje
- revalidate = 30 na homepage je neúčinné, pokud root layout čte session cookie
- CartProvider: efekt zapisující do localStorage přepíše košík dřív, než ho hydratační efekt stihne přečíst
- JSX.Element v signaturách UI primitiv neprojde typecheckem s @types/react 19
- Rate limiter klíčovaný podle x-forwarded-for je v compose sestavě jeden globální kbelík
- Ruční návrat optimistického stavu u zaškrtávátka „Zaplaceno“ nefunguje, když je stav z useOptimistic

### docker

- Compose nepředává aplikaci proměnné z Dodatku A — kontejner nastartuje, ale každá stránka spadne
- NODE_ENV=production v image a pravidlo „v produkci jen smtp“ znemožňují dokumentovanou vývojovou sestavu s Mailpitem
- `npx prisma migrate deploy` v entrypointu selže — v runtime image chybí node_modules/.bin a rootfs je read-only
- Seed uvnitř kontejneru nemůže fungovat — `tsx` je devDependency a v runtime image není
- Nahrané fotky z volume nebude Next.js standalone servírovat — seznam souborů v `public/` se čte jen při startu
- `read_only: true` je v rozporu s `export const revalidate = 30` — ISR si potřebuje zapsat do .next
- Runner stage nemá `openssl` — Prisma engine na Alpine nemusí načíst libssl.so.3
- Adresář pro volume uploads se v image nevytváří — volume vznikne jako root:root a uid 1000 do něj nezapíše
- `docker-compose.prod.yml` je jen jmenován, obsah nikde není
- Healthcheck MySQL nedělá to, co plán tvrdí — v exec formě se `$$MYSQL_ROOT_PASSWORD` neexpanduje
- Entrypoint vypisuje „Čekám na databázi…“, ale nečeká — po výpadku DB se aplikace zacyklí v restartech
- Tři různé verze MySQL napříč plánem: `mysql:8` ve vývoji, `mysql:8.4` v compose i CI
- Build stage nemá DATABASE_URL, ale `/`, `/burza` i `/sklad` čtou databázi a žádná z nich neopouští statické renderování
- Kontejnery běží v UTC — data objednávek a `paid_at` se budou v české sezóně zobrazovat o den vedle
- Závěrečné ověření maže volume a hned pouští e2e bez seedu
- `next/font/google` vyžaduje při `docker build` přístup na Google Fonts
- Detaily Dockerfilu, které zbytečně zhoršují cache a velikost image

### testy

- Race test v Tasku 12 neprokáže FOR UPDATE — projde i bez něj
- Task 4 dostává v Dodatku B povinné `paidAt`, ale žádná testovací fixture se neupravuje
- Task 26 mění signaturu `renderCustomerConfirmation` na tříparametrovou a asynchronní, testy Tasku 9 zůstávají synchronní
- Dodatek A přidává povinné env klíče, ale neaktualizuje testovací fixture, CI ani compose
- E2E test publikace novinky nevyplní titulek, který use-case vyžaduje
- Unit test `result.code === '#2610'` testuje in-memory fake, ne produkční generování kódu
- Test formátování částky obsahuje obyčejnou mezeru místo U+00A0, který sám plán vyžaduje
- Zaokrouhlení `formatCzk` se rozchází s částkou v QR kódu a žádný test to nepokrývá
- Regex na diakritiku v testu SPAYD nepokrývá znaky, které jsou přímo v testovaném řetězci
- Chybí jakýkoli test autorizace administrace, přestože je označena za bezpečnostní opatření
- Nahrávání fotek nemá žádný test, přestože jde o bezpečnostní hranici
- Test „registrací nelze získat roli farmáře" žádnou eskalaci netestuje
- Test „odmítne token s algoritmem none" projde i bez `algorithms: ['HS256']`
- Rollback vícepoložkové rezervace není otestovaný ani v unit, ani v integraci
- Selhání prvního e-mailu potlačí druhý; test to nezachytí
- E2E běží paralelně nad jednou sdílenou databází a jednotlivé specy si přepisují data
- E2E selektory nemají oporu v tascích, které dané komponenty zavádějí
- `/burza` a `/sklad` nemají určenou strategii renderování, na které stojí E2E test odečtu skladu
- Kilograms.of odmítne 0,3 kg od klienta, ale chování není otestované ani namapované na hlášku
- Test seedu si protiřečí s ukázanou implementací a kontroluje jen tři z osmi tabulek
- Krok seedu v e2e jobu nemůže v runtime image proběhnout
- E2E test zaplacení může udělat reload dřív, než server action doběhne
- Produkční pojistky mailového driveru nemají test a jedna z nich je mrtvý kód
- Test v Tasku 25 importuje modul, který sekce Files nevytváří

### pokryti

- Zod validace na hranici server actions ze spec sekce 7 nemá v žádném tasku realizaci
- Stránka potvrzení nemá z čeho postavit PaymentBlock — GetOrderByToken vrací view model bez platebních dat
- eslint.config.mjs a .nvmrc jsou v seznamu souborů Tasku 1, ale žádný krok nedefinuje jejich obsah
- @playwright/test se nikde neinstaluje, přesto `npm run test:e2e` spouští `playwright test`
- E2E_FARMER_PASSWORD se v CI nikde nenastavuje, přihlášení farmáře v E2E selže
- Rate limit na registraci ze spec sekce 7 chybí
- Dodatek A umisťuje Task 25 před Task 10, ale Task 25 modifikuje soubor, který Task 10 teprve vytváří
- KPI „Sklizeno letos“ a „Nezaplacené převodem“ nemají oporu v portech repozitářů
- Chybí error.tsx, not-found.tsx, loading.tsx a favicon — App Router bez nich padá do výchozích neošetřených stavů
- docker-compose.prod.yml je v Files Tasku 22, ale žádný krok nedefinuje jeho obsah
- Root layout musí číst session, čímž zruší cache homepage — a plán neurčuje, odkud SiteHeader session bere
- Dodatek B v hlavičce neuvádí Task 15, přestože do něj přidává server action
- Sekce File Structure nesedí na to, co tasky skutečně vytvářejí
- logoutAction nemá popsané chování ani test — po odhlášení může hlavička dál zobrazovat přihlášeného uživatele
- E2E selektory předpokládají role a popisky, které tasky s UI nikde nedefinují

### platba-mail

- Docker compose a CI nepředávají nové proměnné z dodatku A — kontejner nenastartuje
- Task 26 mění signaturu mailové šablony, ale nemění jediného volajícího — QR se do e-mailu nikdy nedostane
- Task 1 používá `isValidIban`, který vzniká až v Tasku 26 — první task nejde dokončit
- Konflikt konstruktoru NodemailerMailer mezi Taskem 9 a Taskem 25 + nedeklarované `describe()`
- Kontrola `SMTP_HOST.length === 0` je mrtvý kód kvůli výchozí hodnotě `mailpit`
- Testovací fixture env a `test.env` neobsahují nové povinné klíče — job `quality` bude červený
- MSG `Agro:2610` používá malá písmena, která nejsou v povolené znakové množině SPAYD
- SPAYD escapování: hvězdička se má kódovat jako `%2A`, ne mazat, a `%` musí být `%25`
- Selhání generování QR shodí celou stránku potvrzení objednávky
- `margin: 2` porušuje povinnou klidovou zónu QR kódu (4 moduly)
- `test.env` a `resolve.alias` na kořenové úrovni se do `projects` nemusí zdědit
- Idempotence `SetOrderPaid` není souběhově bezpečná — transakce bez zámku nestačí
- E2E test v Tasku 28 filtruje na `#2609`, který podle vzorce kódů neexistuje
- KPI „Nezaplacené převodem" schová právě ty objednávky, které je potřeba řešit
- Optimistické zaškrtávátko čte `e.target.checked` až po `await` a datum platby se do UI nedostane
- Dvojkolejná migrace `paid_at` — návod pro prázdný repozitář si protiřečí s krokem 1

## Vyvrácené nálezy

- **Dodatek A nedotáhl testovací fixture v Tasku 1 — unit test `env.test.ts` padne a shodí job quality** (ci) — Ověřil jsem obě místa v plánu.

Co je fakticky pravda: fixture `valid` v Tasku 1 Step 4 (řádky ~240–250) opravdu neobsahuje `BANK_ACCOUNT_IBAN` ani `BANK_ACCOUNT_NUMBER` a Dodatek A (ř. 3434–3457) obě přidává jako povinné (`z.string().min(1)`, bez `.default()`). Mechanicky by tedy první test „načte platnou konfiguraci“ spadl na `Required`. (Ostatní dva testy projdou i tak — `toThrow(/AUTH_SECRET/)` a `/DATABASE_URL/` matchují i v souhrnné hlášce, protože `loadEnv` slepuje všechny issues do jednoho stringu.)

Proč nález přesto neobstojí v hledisku „reálné dopady za běhu“:

1. **Nulový runtime dopad.** Jde o literál v unit testu, ne o kód aplikace. Za běhu se `loadEnv` volá nad `process.env`, které `.env.example` v Dodatku A oba klíče poskytuje (ř. 3486–3490) a CI job `integration` i `e2e` si env sestavují samy. Aplikace se nerozbije, nic není nebezpečné ani neudržovatelné.

2. **Důsledek „job quality je červený na prvním běhu pipeline“ je nepravdivý.** Plán má uvnitř Tasku 1 dvě explicitní verifikační brány *před* commitem: Step 7 („Run: `npx vitest run tests/unit/env.test.ts`, Expected: PASS (3 testy)“) a Step 14 („`npm run typecheck && npm run lint && npm run build && npm run test`, Expected: vše projde“). Teprve Step 15 je commit. Aby se to dostalo do Tasku 23 (o 22 tasků dál), musel by implementátor obě brány vědomě ignorovat. Selhání navíc pojmenuje přesný chybějící klíč (`BANK_ACCOUNT_IBAN: Required`) — oprava je jeden řádek v fixture, do minuty.

3. **Je to inherentní vlastnost TDD zápisu plánu, ne opomenutí.** Každý task v plánu je „napiš padající test → implementuj → zezelenej“. Dodatek mění schéma; že se s ním mění i fixture, je přímý TDD důsledek, který se projeví červeným testem — přesně tím signálem, o který TDD smyčka opírá. Stejnou logikou by šlo označit i změnu `MailMessage` v Dodatku A (Task 9) nebo změny v Dodatku B, které také nevypisují seznam dotčených testovacích literálů.

4. **Task 1 se podle Dodatku A stejně nedá copy-pastovat.** Zod schéma v Dodatku volá `isValidIban`, jenže `src/domain/value-objects/iban.ts` vzniká až v Tasku 26. Implementátor Tasku 1 tedy nutně obě zdrojová místa aktivně slučuje a píše kód navíc — nejde o slepé opsání Step 4. (To je mimochodem podstatnější mezera Dodatku A než literál ve fixture, ale je to jiný nález.)

Závažnost „high“ je tedy neopodstatněná; jde nanejvýš o kosmetickou nekonzistenci dokumentu, kterou plán sám zachytí vlastní verifikací uvnitř téhož tasku. Navržená oprava (doplnit klíče do fixture + testy na mod-97 a `superRefine`) je věcně neškodná a plán by mírně zlepšila, ale nález jako takový nesplňuje kritérium „vedlo by to k rozbité, nebezpečné nebo neudržovatelné aplikaci“.
- **Tajemství generovaná v e2e jobu nejsou maskovaná a vytahují se křehkým `grep | cut`** (ci) — Nález stojí na dvou technických tvrzeních; obě neobstojí.

1) „grep | cut je křehký a u AUTH_SECRET by hodnotu uřízl" — fakticky mylné. `openssl rand -base64 48` NEPRODUKUJE `=`: base64 přidává padding jen když počet bajtů není dělitelný 3, a 48 % 3 == 0 (48 B → přesně 64 znaků, bez paddingu). Ověřeno empiricky (5 běhů, `grep -c '=' == 0`, délka 64 znaků, bez zalomení — limit řádku je 76). Uvedený protipříklad tedy neexistuje. Navíc plán AUTH_SECRET přes `grep|cut` vůbec nečte — čte jen `SEED_FARMER_PASSWORD`, což je `openssl rand -hex 12`, tedy čistý hex bez `=`. Kód, jak je v plánu napsaný, funguje správně. Chybějící `^` v grepu také nic nerozbíjí: `.env` v tomto jobu obsahuje právě ty 4 řádky (MYSQL_ROOT_PASSWORD, MYSQL_PASSWORD, AUTH_SECRET, SEED_FARMER_PASSWORD) a žádný jiný klíč neobsahuje `SEED_FARMER_PASSWORD` jako podřetězec. Jde o domněnku o hypotetické budoucí změně, ne o vadu plánu.

2) „Únik hesel v logu = bezpečnostní dopad" — nepodložené v důsledku. Je pravda, že hodnoty generované za běhu runner sám nemaskuje (auto-maskuje jen `secrets` kontext), ale tato tajemství jsou jednorázová, vygenerovaná pro jeden běh, a patří kontejnerům, které s koncem jobu zaniknou (MySQL v ephemeral compose stacku, AUTH_SECRET a farmářské heslo v ephemeral app instanci). Neotevírají přístup k ničemu, co běh přežije. Samotný scénář „`docker compose logs` vypíše DATABASE_URL s heslem" je navíc nedoložený: `compose logs` tiskne stdout/stderr kontejnerů, ne jejich env; MySQL entrypoint heslo neechuje a Prisma v chybách o připojení credentials neuvádí v plaintextu. Nález scénář tvrdí, ale nedokládá.

3) Deklarovaný důsledek „seed projde s jiným heslem, než se kterým se přihlašuje Playwright" je sice reálné riziko v tomto jobu, ale z úplně jiné příčiny, než nález uvádí — ne z oříznutí přes `cut`, ale proto, že job u `npm run test:e2e` vůbec nenastavuje `E2E_FARMER_PASSWORD` (řádek 3362 plánu: „Heslo farmáře v E2E se bere z `E2E_FARMER_PASSWORD`, stejné jako `SEED_FARMER_PASSWORD` v CI", ale v ci.yml se ta proměnná nikde neexportuje). Kauzální řetězec nálezu je tedy chybný; skutečná mezera je jinde a je to jiný nález.

Z hlediska technické správnosti tedy: pipeline jak je napsaná funguje, uvedený protipříklad je fakticky nesprávný a bezpečnostní důsledek je nadhodnocený u efemérních run-scoped hodnot. `::add-mask::` je legitimní hygienické vylepšení, ne vada, která by vedla k rozbité nebo nebezpečné aplikaci.
- **`release.yml` je v plánu jen prózou, bez YAML a bez propojení digestu na cosign** (ci) — Přečetl jsem Task 23 Step 2 (plán, ř. 3273–3277). Text skutečně popisuje `release.yml` prózou místo YAML — to je jediná pravdivá část nálezu. Věcné argumenty, kterými nález odůvodňuje závažnost „medium / vydání se rozbije", ale neobstojí:

1) „`cosign sign` musí dostat digest, jinak podepíše něco jiného nebo skončí chybou" — nepravda. Ověřeno v sigstore/cosign PR #2313 a v release notes: cosign při referenci tagem pouze VYPÍŠE varování („Added warning when users refer to images to sign by tag... This will be required in a future release"), tag si sám resolvne na digest a podepíše digest. Nejde o chybu ani o podpis jiného obsahu; jediné reálné riziko je race, kdy někdo přepíše tag mezi push a sign — v tag-triggered jobu, kde build i sign běží v jednom kroku za sebou, teoretická situace.

2) „Nikde není `id-token: write` u konkrétního kroku, workflow selže" — technicky nemožný požadavek. Podle GitHub Docs (Assigning permissions to jobs / Controlling permissions for GITHUB_TOKEN) se `permissions` dá nastavit VÝHRADNĚ na úrovni workflow nebo jobu, nikdy na úrovni kroku. A plán `permissions: { contents: read, packages: write, id-token: write }` explicitně uvádí — tedy právě to, na čem keyless podpis skutečně padá, plán řeší.

3) „Chybí `COSIGN_EXPERIMENTAL`" — zastaralé. `COSIGN_EXPERIMENTAL=1` bylo nutné pro cosign 1.x; od cosign 2.0 je keyless podpis GA a proměnná se pro `cosign sign` nepoužívá. `sigstore/cosign-installer`, který plán jmenuje, instaluje v2.

Zbývá tedy jen výtka „krok je popsaný prózou, ne YAMLem" — to je otázka míry detailu plánu, ne technická vada vedoucí k rozbité či nebezpečné aplikaci. Plán navíc jmenuje všechny potřebné akce (`docker/login-action` implicitně v „přihlášení do GHCR", `docker/build-push-action` s cache, `anchore/sbom-action`, `sigstore/cosign-installer`, `cosign sign --yes`) i bezpečnostně kritický `permissions` blok. Doporučení podepisovat přes `steps.build.outputs.digest` je legitimní hardening (a je to best practice), ale ne důvod tvrdit, že Task 23 Step 2 „nelze provést" nebo že se vydání rozbije. Nález stojí na spekulaci („s vysokou pravděpodobností") podepřené dvěma věcně mylnými tvrzeními a jedním obsoletním.
- **Vitest inline projects nedědí kořenový `resolve.alias` ani `test.env` — alias `@/` a `MAIL_DRIVER=memory` v CI nezaberou** (ci) — Ověřoval jsem tři věci: (1) chování `test.projects` v jednotlivých verzích Vitestu, (2) jakou verzi plán skutečně instaluje, (3) zda by absence `MAIL_DRIVER=memory` opravdu vedla na síť.

1) Dědičnost inline projektů — nález popisuje Vitest 3 správně, ale plán tuto verzi nepoužije.
Dokumentace v3.2.4 (docs/guide/projects.md) skutečně říká „None of the configuration options are inherited from the root-level config file“ a v příkladu má komentář „won't inherit any options from this config / this is the default behaviour“ u `extends: false`. Takže pro v3/v4 by tvrzení platilo. Jenže Task 1 Step 1 instaluje `npm i -D vitest` BEZ pinu (na rozdíl od `next@15`, `react@19`), a `https://registry.npmjs.org/vitest/latest` dnes vrací **5.0.0**. Migrační dokumentace Vitest 5 má vlastní sekci „Inline Projects Inherit the Root Config by Default — The `extends` option now defaults to `true`: every project defined as an inline configuration in `test.projects` inherits all options from the root configuration“, a aktuální vitest.dev/guide/projects to potvrzuje („controlled by the `extends` option, which is enabled by default since Vitest 5.0“). Při doslovném provedení plánu tedy `resolve.alias` i `test.env` do obou projektů dojdou a popsaný pád (`Failed to resolve import '@/…'`, červený job `quality` na prvním běhu) nenastane. Řádek „Vitest 3“ v Tech Stacku je jediná opora nálezu a je to nekonzistence hlavičky, ne instrukce, kterou implementátor spouští. Navíc navržená oprava „připnout `vitest@^3.2`“ je kontraproduktivní — právě ona by projekt vrátila do verze, kde `extends` defaultuje na `false`.

2) Druhá polovina dopadu je věcně mylná bez ohledu na verzi.
Tvrzení „unit testy mailu se pokusí sáhnout na síť na `mailpit:1025`, což skončí timeoutem po `testTimeout`“ neodpovídá testům v plánu. Testy `createMailer` (Task 25 Step 1) předávají driver a host explicitně v objektu `base`, nikoli z `env`, a jen kontrolují `instanceof` a `describe()` — žádný test nevolá `send()` na `NodemailerMailer`. Grep přes celý plán ukazuje, že `getContainer()` se používá výhradně v `src/app/**` (např. `HomePage`), v žádném testu v `tests/unit/**` ani `tests/integration/**`. `test.env: { MAIL_DRIVER: 'memory' }` je tak v této fázi pojistka, ne nosný mechanismus; jeho případné nepropsání nezpůsobí ani síťový pokus, ani timeout. (Nemluvě o tom, že nodemailer navazuje SMTP spojení až při `sendMail`, ne v `createTransport`.)

3) Zbytek nálezu si sám přiznává, že je v pořádku (`npm run test -- --coverage`, `coverage` jako root-only volba) — to sedí.

Podotek mimo tento nález: `extends: true` je stejně levná pojistka a v v5 je no-op, takže doplnit ho škodit nemůže; a plán má u aliasu jiný, skutečný problém — Task 1 pouští `npx vitest run tests/unit/env.test.ts` ve Stepech 5 a 7, tedy dřív, než ve Step 11 vůbec vznikne `vitest.config.ts`, takže `@/` se v té chvíli nerozresolvuje z úplně jiného důvodu (chybí konfigurace, ne dědičnost). To je ale jiný nález než posuzovaný.

Závěr: mechanismus platí jen pro verzi, kterou plán neinstaluje, polovina popsaného dopadu je prokazatelně nepravdivá a navržená oprava by problém teprve vytvořila. Vyvráceno.
- **Use-case GetCurrentUser ze spec sekce 3 v plánu vůbec není** (pokryti) — Ověřeno proti oběma dokumentům.

Co je fakticky pravda: `GetCurrentUser` se ve spec (řádek 78) objevuje, v plánu ani jednou (grep přes celý plán = 0 výskytů), Task 13 (řádky 2279–2300) opravdu vytváří jen `register-user.ts` a `login-user.ts`, a `UserRepository.findById` (Task 5, řádek 1250) nemá v plánu žádného konzumenta — grep na `users.findById` nevrací nic.

Proč to nalez přesto neobstojí:

1. Popsaný dopad nemá v plánu žádnou oporu. Plán neobsahuje jedinou funkci, která by uživatele smazala, změnila mu roli nebo jméno. Admin use-cases (Task 14, ř. 2378–2470 + Task 28) jsou `ListOrders`, `AdvanceOrderStatus`, `SetOrderPaid`, `UpsertVariety`, `DeactivateVariety`, `PublishNews`, `DeleteNews`, `GetAdminOverview` — žádná správa uživatelů. Není profil zákazníka ani stránka „moje objednávky“ (Task 20 zná jen `/kosik` a `/rezervace/[token]`). Jediný FARMER účet vzniká seedem (Task 7); registrace roli farmáře přidělit nemůže a je to explicitně testováno (Task 13, test „registrací nelze získat roli farmáře“). Scénář „farmář sníží roli / smaže účet a token ještě 7 dní platí“ tedy v aplikaci nemá průchod — je to hypotéza, ne vada plánu.

2. Tvrzení „SiteHeader ani administrace nemá odkud vzít aktuální jméno“ je věcně mylné. `SessionPayload` (ř. 1278) nese `name`, `SiteHeader(props: { session: SessionPayload | null })` (ř. 2587) i `AdminHeader userName={session.name}` (ř. 2887) jméno mají. Chybí jen po změně jména — a změna jména v plánu neexistuje.

3. `readSession()` (Task 8) JE v tomto plánu ekvivalent `GetCurrentUser`. Stateless JWT v httpOnly cookie je vědomé rozhodnutí spec sekce 2 („bcrypt + JWT (jose) v httpOnly cookie“) i Tasku 8 (TTL 7 dní, HS256, `algorithms: ['HS256']`, ochrana proti `alg: none`). Plán navíc u spec use-cases běžně provádí přejmenování/nahrazení (`GetOrderByCode` → `GetOrderByToken`, viz sekce „Odchylky od spec“); doslovná shoda se seznamem use-cases ze spec není kritérium technické správnosti.

4. Navržená oprava by problém neřešila tam, kde by nejvíc bolel: `middleware.ts` (Task 15, ř. 2536–2546) běží na Edge runtime a s Prisma 6 + MySQL přes TCP tam do DB sáhnout nelze (Prisma docs: pro edge je nutný `@prisma/client/edge`/Accelerate nebo driver adapter) — první obrana `/admin` by roli proti DB stejně neověřila. Zároveň by přidala DB dotaz do každého renderu layoutu a každé admin akce kvůli scénáři, který aplikace neumí vyvolat.

Jediné, co ze nálezu reálně zbývá, je mrtvá metoda portu `UserRepository.findById` bez konzumenta — kosmetika, nikoli „high“ bezpečnostní díra, a rozhodně ne stav, který by vedl k rozbité aplikaci. Podle zadání (při nejistotě a u domněnky bez opory vyvracet) vracím refuted=true.
