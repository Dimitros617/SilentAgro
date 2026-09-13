# SilentAgro

Webová aplikace malé farmy pro přímý prodej brambor. Zákazník vidí skutečný stav skladu
a rezervuje si množství po půl kilogramu; rezervace sklad okamžitě odečte. Farmář spravuje
odrůdy, ceny, objednávky a novinky v administraci.

Vznikla podle prototypu ze služby Claude Design. Samotný prototyp v repozitáři není —
zdrojem pravdy je kód.

## Rozjezd

Potřebujete Docker. Nic jiného — Node ani databázi instalovat nemusíte.

```bash
cp .env.example .env
```

V `.env` vyplňte sekci **POVINNÉ** (je nahoře, ostatní má výchozí hodnoty):

| Proměnná | Jak ji získat |
|---|---|
| `MYSQL_ROOT_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"` |
| `MYSQL_PASSWORD` | totéž, jiná hodnota |
| `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
| `SEED_FARMER_PASSWORD` | vaše heslo do administrace, **alespoň 8 znaků** (kratší seed odmítne) |
| `BANK_ACCOUNT_IBAN` a `BANK_ACCOUNT_NUMBER` | účet farmy; předvyplněný je testovací |

Nemáte-li po ruce Node, hodnoty vygenerujete i v Dockeru:

```bash
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Pak už jen:

```bash
docker compose up -d --build
docker compose --profile seed run --rm seeder     # ukázková data
```

Aplikace běží na <http://localhost:3000>. Farmář se přihlásí adresou z `FARMER_EMAIL`
(výchozí `farma@silentagro.cz`) a heslem ze `SEED_FARMER_PASSWORD`.

Vzor míří poštu na Mailpit (`MAIL_DRIVER="mailpit"`, `SMTP_HOST="mailpit"`), ten se ale
spouští až profilem `mail`. Bez něj odesílání míří na neexistujícího hostitele a e-maily
se neodešlou — přidejte `--profile mail`, nebo přepněte na vlastní SMTP server.

Chybějící povinná proměnná sestavu **nenastartuje** a compose napíše, která to je —
tiše běžet s prázdným heslem nebude. Nesmyslná hodnota (třeba IBAN s překlepem)
zastaví aplikaci hned při startu; důvod najdete v `docker compose logs app`. Dřív se
takový překlep projevil až jako chybová stránka při každém požadavku.

Zapomenuté heslo do administrace se vrací seedem: změňte `SEED_FARMER_PASSWORD`
v `.env` a pusťte seeder znovu. Heslo se přepíše, případná deaktivace účtu zruší
a zároveň přestanou platit administrátorské session vydané do té chvíle — kdo byl
přihlášený, musí se přihlásit znovu. Bez toho by změna hesla útočníka s ukradenou
sušenkou z administrace nevyhodila: token je podepsaný na sedm dní.

Při podezření na únik samotného tokenu (ne hesla) zabere navíc rotace `AUTH_SECRET`
a restart aplikace. Podpisy přestanou sedět, takže naráz padnou úplně všechny session,
zákaznické i farmářovy. Zákazníky to nic nestojí — objednávat jde i bez účtu.

### Co si nastavíte bez zásahu do kódu

Všechno podstatné je v `.env`, rozdělené do sekcí:

- **Identita farmy** — název, firma, IČO, telefon, kontaktní e-mail. Promítne se
  do patičky, do hlavičky i do podpisu pod každým odeslaným e-mailem.
- **Pošta** — vlastní SMTP server, nebo Mailpit pro zkoušení bez odesílání.
- **Obchodní pravidla** — poplatek za rozvoz, hranice pro dopravu zdarma, dojezd
  v kilometrech, jak dlouho se rezervace drží.
- **Bankovní účet** — IBAN a číslo účtu pro QR platby.
- **Provoz** — veřejná adresa, port, limity pokusů o přihlášení.

Texty, které konfigurace nepokrývá, jsou v `src/app` (popisky sekcí) a
v `src/infrastructure/mail/templates.ts` (znění e-mailů). Novinky a odrůdy jsou data
v databázi: výchozí sadu zakládá seed, dál je farmář píše v administraci.

Chcete-li si prohlédnout odesílanou poštu, přidejte odchytávač:

```bash
docker compose --profile mail up -d      # Mailpit na http://localhost:8025
```

Máte-li 8025 obsazený, přenastavte `MAILPIT_UI_PORT`. Uvnitř sestavy se Mailpit
jmenuje `mailpit` — do `SMTP_HOST` patří tohle jméno, ne `localhost`; localhost je
uvnitř kontejneru kontejner sám a pošta by se nikam nedostala.

### Vývoj bez Dockeru

Potřebujete **Node 22** (`engines` v `package.json`, verze je i v `.nvmrc`).

```bash
docker run -d --name silentagro-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=silentagro \
  -e MYSQL_USER=silentagro -e MYSQL_PASSWORD=silentagro \
  -p 3307:3306 mysql:8.4

npm install
npx prisma migrate dev
SEED_FARMER_PASSWORD=vase-heslo npm run db:seed
npm run dev
```

Port **3307** schválně, aby kontejner nekolidoval s MySQL nainstalovanou na počítači.

`prisma migrate dev` si zakládá dočasnou „shadow" databázi, na což potřebuje právo
zakládat databáze:

```sql
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'silentagro'@'%';
```

V produkci to potřeba není — `prisma migrate deploy` shadow databázi nepoužívá.

## Architektura

Závislosti míří dovnitř. `domain` sahá nanejvýš na `shared`, `application` zná `domain`
a `shared`, `infrastructure` implementuje porty z `domain`, a stránky volají use-case přes
composition root.

```
src/
  domain/          entity, value objects, výčty, chyby, porty
  application/     use-cases a view modely
  infrastructure/  Prisma, SMTP, autentizace, platby, rate limit, nahrávání, konfigurace, DI
  app/             Next.js App Router: stránky, server actions, API routy
  components/      React komponenty
  shared/          Result, formátování cs-CZ, pravidlo pro kód objednávky
  middleware.ts    přesměrování nepřihlášených mimo administraci
  instrumentation.ts  ověření konfigurace při startu serveru
```

`shared` je jediná vrstva, na kterou smí sáhnout kdokoli: jsou v ní čisté funkce bez
závislostí, typicky české formátování čísel a dat. `domain` z ní bere `formatKg`,
`application` formátování do view modelů.

Hranici hlídá ESLint: import z `@/infrastructure/**` nebo `@prisma/client` je chyba, ne
varování. Pravidlo platí všude a výjimku mají jen `src/infrastructure`, `src/app`,
`src/components`, `prisma` a `tests`. Dopadá tedy i na `src/instrumentation.ts` — ten
konfiguraci načítá dynamickým `await import()`, který pravidlo nekontroluje. Statický
import by tam neprošel, a je to tak správně: hook běží až při startu serveru.

Během vývoje pravidlo zachytilo skutečné porušení — use-case si sáhl na šablony e-mailů
a tím věděl, jak se pošta vykresluje.

**Proč `src/app`, a ne `src/presentation/app`:** Next.js hledá App Router výhradně
v `app/` nebo `src/app/`. Prezentační vrstvu tedy tvoří `src/app` a `src/components`,
ostatní vrstvy leží vedle nich.

### Rezervace je jediné místo se skutečnou konkurencí

`ReserveOrder` běží v transakci se zámkem řádků (`SELECT … FOR UPDATE`). Celý košík se
ověří po získání zámku a teprve pak se sklad mění, takže nedostatek u druhé položky
nezmění ani tu první. Cena se bere vždy ze skladu — klient ji neposílá a poslat nemůže.

Že zámek skutečně funguje, ověřuje integrační test: dvě souběžné rezervace na poslední
kilogram, uspěje právě jedna. Test byl prověřen tak, že se `FOR UPDATE` dočasně odstranilo —
tehdy obě rezervace projdou a test spadne.

E-maily odcházejí až **po** commitu a jejich selhání objednávku neruší. Sklad je pravda,
pošta je notifikace.

## Konfigurace

Vše, co se nastavuje, je v `.env.example` i s vysvětlením. Jediná výjimka je
`UPLOAD_DIR`: cestu ke složce s fotkami určuje compose napevno, aby odpovídala
připojenému svazku — přepsatelná hodnota by ukládala mimo svazek a po restartu by
soubory zmizely.

Konfigurace se ověřuje **při startu serveru** (`src/instrumentation.ts`): chybná hodnota
kontejner zastaví a důvod napíše do logu. Kontrola běží jen v Node runtime, ne při
`next build` — ten běží bez produkčního prostředí a validace by ho shodila.

Podstatné proměnné:

| Proměnná | Význam |
|---|---|
| `APP_ENV` | `development` / `test` / `production`. Záměrně **není** odvozeno z `NODE_ENV`: standalone build Next.js si ho nastavuje natvrdo na `production`, takže by podle něj nešla rozlišit vývojová sestava. |
| `DATABASE_URL` | Připojení k MySQL. |
| `TEST_DATABASE_URL` | Databáze pro integrační testy. **Musí** být jiná než `DATABASE_URL` — testy mažou tabulky a helper se odmítne spustit, když se shodují. |
| `AUTH_SECRET` | Podpis session tokenu, alespoň 32 znaků. |
| `MAIL_DRIVER` | `mailpit` (vývoj), `smtp` (produkce), `memory` (testy, nic neodesílá). V produkci je `memory` zakázané. |
| `BANK_ACCOUNT_IBAN` | IBAN farmy pro QR platby. Ověřuje se mod-97 už při startu — překlep by posílal zákazníky platit na cizí účet. |
| `BANK_ACCOUNT_NUMBER` | Číslo účtu tak, jak ho má vidět zákazník. |
| `FARM_NAME`, `FARM_LEGAL_NAME`, `FARM_COMPANY_ID`, `FARM_PHONE` | Identita farmy v hlavičce, patičce a pod každým e-mailem. |
| `DELIVERY_FEE_CZK`, `FREE_DELIVERY_ABOVE_CZK` | Poplatek za rozvoz a hranice pro dopravu zdarma. Hranice je ostrá: přesně na této částce se ještě účtuje. |
| `DELIVERY_RADIUS_KM`, `RESERVATION_HOLD_DAYS` | Dojezd a doba držení rezervace; obojí se objeví v textech na webu i v e-mailu. |
| `PUBLIC_BASE_URL` | Veřejná adresa aplikace. **Výchozí hodnota ve vzoru je `http://localhost:3000`** a compose ji přijme — v produkci sem patří skutečná doména, jinak odkazy v potvrzovacích e-mailech míří zákazníkům na localhost. |
| `MAIL_FROM`, `FARMER_EMAIL` | Odesílatel zpráv a kontaktní adresa farmy. Bez výchozí hodnoty v kódu; produkční compose je vyžaduje. |
| `TRUST_PROXY` | Zapnout jen za reverzní proxy, která `X-Forwarded-For` skutečně nastavuje. Bez proxy si hlavičku nastaví kdokoli a rate limit podle IP jde obejít. |
| `RATE_LIMIT_LOGIN_PER_15MIN`, `RATE_LIMIT_REGISTER_PER_HOUR`, `RATE_LIMIT_ORDERS_PER_HOUR` | Limity pokusů. Klíčem je dvojice IP + účet, takže špatná hesla u jednoho účtu nezablokují ostatní. Bez důvěryhodné proxy je IP konstantní, takže limit fakticky běží na účet. |

Konfigurace se čte na jediném místě (`src/infrastructure/config/env.ts`) a ověřuje Zodem.
Chybová hláška vypisuje názvy klíčů a důvod, nikdy hodnoty.

Jedinou výjimkou je `src/middleware.ts`: běží na Edge runtime, kde Prisma ani modul
konfigurace nefungují, takže čte `process.env.AUTH_SECRET` přímo. Bez tajemství odmítá
všechno, místo aby pouštěl dál.

## QR platba

Při platbě převodem nebo QR kódem dostane zákazník kód podle českého standardu **SPAYD**:

```
SPD*1.0*ACC:CZ6508000000192000145399*AM:182.00*CC:CZK*X-VS:2610*MSG:Agro:2610
```

Generuje se lokálně, bez volání cizí služby. Zpráva pro příjemce má tvar `Agro:<číslo
objednávky>` a **stejnou instrukci dostane zákazník i slovy** — na stránce potvrzení
i v e-mailu, ze stejné šablony, aby se obě místa nerozešla. Kdo QR nenačte a vyplní
příkaz ručně, musí vědět, co napsat.

V e-mailu jde QR jako inline příloha s `Content-ID`, ne jako `data:` URI — to Gmail
i Outlook v `<img>` blokují. Číslo účtu, částka a variabilní symbol jsou vždy i v prostém
textu, takže zaplatit jde i s vypnutými obrázky.

Platbu potvrzuje člověk: v administraci má každá objednávka zaškrtávátko **Zaplaceno**,
které zapíše `orders.paid_at`. Je to datum, ne booleovská hodnota — farmář potřebuje vědět
nejen že je zaplaceno, ale i kdy. Opakované zaškrtnutí čas nepřepíše.

## Testy

```bash
npm run test              # unit, bez databáze a sítě
npm run test:integration  # proti MySQL, vyžaduje TEST_DATABASE_URL
npm run test:e2e          # Playwright proti běžící aplikaci
```

Unit sada sahá na disk na jediném místě: `tests/unit/config/compose-env.test.ts` čte
`env.ts`, `.env.example` a oba compose soubory a hlídá, že se konfigurace nerozejde.
Cesty jsou relativní, takže se sada pouští z kořene repozitáře.

**Integrační testy** potřebují databázi, která existuje a má nasazené migrace — helper
jen otevře spojení, sám nemigruje:

```bash
docker exec -i silentagro-mysql mysql -uroot -proot   -e "CREATE DATABASE IF NOT EXISTS silentagro_test; GRANT ALL ON silentagro_test.* TO 'silentagro'@'%';"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

**E2E** potřebují běžící aplikaci a nainstalovaný prohlížeč — `npm install` ho nestahuje:

```bash
npx playwright install --with-deps chromium
export E2E_FARMER_PASSWORD='…'   # stejná hodnota jako SEED_FARMER_PASSWORD
export FARMER_EMAIL='…'          # jen pokud jste si ji změnili proti výchozí
npm run test:e2e
```

Proměnné se čtou z prostředí procesu; `playwright.config.ts` žádný `.env` nenačítá,
takže mít je v souboru nestačí. Žádné heslo není v repozitáři.

Tři E2E scénáře jsou přeskočené (`test.describe.skip('váha', …)`): týkají se váhy na
burze, která je ze stránky dočasně sundaná. Zapnou se spolu s ní.

## Bezpečnost

- Hesla bcryptem (cost 12). `bcryptjs` místo nativního `bcrypt`, aby runtime image
  nepotřeboval `python3`, `make` a `g++` a build byl deterministický napříč platformami.
- Session je JWT (HS256, `jose`) v cookie `httpOnly`. `jose` proto, že middleware běží
  na Edge runtime, kde nodovská krypto knihovna není. Ověření vždy s explicitním seznamem
  algoritmů — bez něj by prošel token s `alg: none`.
- Přihlášení hlásí u špatného hesla i neznámého e-mailu totéž a i u neexistujícího účtu
  provede ověření proti pevnému hashi, aby se účet neprozradil rychlostí odpovědi.
- Administrace se kontroluje dvakrát: middleware přesměruje prohlížeč, ale server action
  se dá zavolat přímým POSTem, takže roli ověřuje znovu každá admin akce.
- Objednávka má dvě identity: `code` (`#2610`) pro lidi a `public_token` (24 náhodných
  bajtů) do veřejné URL potvrzení. Se sekvenčním kódem v URL by kdokoli vyjmenoval
  `/rezervace/2611` a přečetl jméno, e-mail a telefon cizího zákazníka.
- Nahrávané fotky: typ se určuje podle prvních bajtů souboru, ne podle `Content-Type`
  od klienta, jméno generuje server a nahrávat smí jen farmář.
- Chyby: uživateli se ukáže hláška jen u doménových chyb. Cokoli jiného dostane obecný
  text — hlášky databáze prozrazují hostitele, uživatele i strukturu schématu.
- Rate limit (`infrastructure/rate-limit`) na přihlášení, registraci a objednávky. Klíčem
  je dvojice IP + účet, ne samotná IP: s jedním společným klíčem by pět špatných hesel
  zamklo celou farmu. Limity se nastavují přes `RATE_LIMIT_*`, výchozí je 5 přihlášení
  za 15 minut, 3 registrace a 10 objednávek za hodinu.
- Hlavičky na každé odpovědi (`next.config.ts`): CSP, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` a HSTS. CSP je uzavřená na vlastní původ, takže
  externí skript, font nebo `fetch` na cizí doménu prohlížeč tiše zablokuje — počítejte
  s tím, než něco takového přidáte.

## Docker

Sestava je dvoukontejnerová: `app` a `db`, propojené přímo po interní síti jako `db:3306`.
Port databáze se na hostitele nepublikuje, port aplikace jen na `127.0.0.1`.

`migrator` je jednorázový kontejner ze stage `builder` — nasadí migrace a skončí.
Migrace nejde spustit z runtime image: `output: 'standalone'` v něm nenechá `prisma` CLI
a `read_only` rootfs by nedovolil `npx` stáhnout ho za běhu.

Aplikace běží pod uid 1000 s `read_only` kořenovým systémem, `cap_drop: ALL`
a `no-new-privileges`. Zapisovatelné jsou jen tmpfs `/tmp`, `/app/.next/cache`
a svazek s fotkami.

Fotky se servírují cestou `/api/uploads/[name]`, ne ze složky `public/` — standalone build
počítá se statickými soubory známými v době sestavení, ne s těmi, které přibyly za běhu.

### Produkční nasazení

`docker-compose.prod.yml` obsahuje **jen aplikaci** — databáze se očekává externí,
spravovaná. Provozovat MySQL v kontejneru vedle aplikace znamená starat se o zálohy,
aktualizace a přežití restartu hostitele; u spravované databáze to dělá poskytovatel.

Vydání vzniká značkou v gitu: `git tag -a v0.0.2 -m "…" && git push origin v0.0.2`
spustí workflow Release, které sestaví, podepíše a zveřejní oba obrazy.

```bash
cp .env.example .env.prod
```

V `.env.prod` doplňte:

| Proměnná | Pozor na |
|---|---|
| `DATABASE_URL` | připojení ke spravované databázi |
| `AUTH_SECRET` | ve vzoru je **prázdný**; prázdnou hodnotu compose odmítne stejně jako chybějící |
| `PUBLIC_BASE_URL` | ve vzoru je `localhost` a compose ho **přijme** — odkazy v e-mailech by pak zákazníkům nefungovaly |
| `MAIL_DRIVER`, `SMTP_*`, `MAIL_FROM` | `mailpit` v produkci nedává smysl, patří sem vlastní server |
| `FARMER_EMAIL`, `SEED_FARMER_PASSWORD` | přihlášení do administrace; heslo alespoň 8 znaků |
| `GHCR_REPOSITORY` | název **malými písmeny**, i když je repozitář na GitHubu psaný velkými — Docker jiný odmítne hláškou `repository name must be lowercase` |
| `APP_VERSION` | verze bez úvodního `v`: značka `v0.0.2` publikuje obrazy `0.0.2` a `0.0` |

Pokud je balíček v GHCR privátní (výchozí stav), přihlaste se k registru. Jinak stahování
skončí na `unauthorized`:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u VASE_JMENO --password-stdin
```

Pak migrace, účet farmáře a start:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile migrate run --rm migrator
docker compose -f docker-compose.prod.yml --env-file .env.prod --profile farmer  run --rm farmer
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Krok `farmer` zakládá účet do administrace. Produkční sestava schválně nemá `seeder` jako
vývojová — ten sype do databáze ukázkové odrůdy, novinky a smyšlené objednávky. Bez kroku
`farmer` by po migracích běžela prázdná databáze a nebylo by se čím přihlásit. Pustit se
dá opakovaně: heslo se přepíše, takže takhle se řeší i zapomenuté heslo.

Migrace jsou **samostatný krok**, ne součást startu aplikace. Automatické migrace při
startu vypadají pohodlně, ale při návratu na starší verzi je schéma už změněné a vrátit
se není kam.

Migrátor používá jiný image než aplikace (`:<verze>-migrator`): runtime image je
`output: 'standalone'` a `prisma` CLI v něm schválně není. Release workflow publikuje
oba ze stejného vydání.

Verze se zadává konkrétní, ne `latest` — restart kontejneru nikdy nesmí tiše přinést
jinou verzi, než jaká běžela před ním.

## CI/CD

| Úloha | Co dělá |
|---|---|
| `quality` | eslint, `tsc --noEmit`, unit testy s pokrytím |
| `integration` | MySQL jako service container, migrace, integrační testy |
| `e2e` | celá sestava v Dockeru, seed, Playwright |
| `security` | audit produkčních závislostí, gitleaks, Trivy sken image |

Vydání je samostatný workflow `release.yml` s úlohou `publish`, ne součást `ci.yml`.
Spouští se značkou `v*` a dělá build a push obou obrazů do GHCR, SBOM a podpis přes
cosign.

## Co záměrně nemá

- Platební bránu — QR platba je pokyn k převodu, což k modelu „přijeďte na farmu" sedí
- Frontu na e-maily — jedna farma, jednotky objednávek denně
- Sdílený rate limit — jedna instance; při škálování bude potřeba společné úložiště
- Vícejazyčnost — zákazníci jsou z okolí

## Dokumentace

- `docs/superpowers/specs/` — návrh systému
- `docs/superpowers/plans/` — implementační plán
- `docs/superpowers/reviews/` — nálezy z review plánu, včetně toho, které části běhu neproběhly
