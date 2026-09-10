# SilentAgro — návrh systému

Datum: 2026-09-10
Zdroj: Claude Design projekt `392eff6a-f3c4-4a7e-a8eb-7bee0a63eebd`, soubor `SilentAgro.dc.html`

## 1. Co stavíme

Webová aplikace malé farmy (Silent Industries) pro přímý prodej brambor „z pole“.
Zákazník vidí reálný stav skladu a rezervuje si množství po půl kilogramu; rezervace
okamžitě odečte sklad. Farmář spravuje odrůdy, ceny, objednávky a novinky v administraci.

Prototyp je jednokomponentová SPA s veškerým stavem v paměti. Tento dokument popisuje
převod na produkční aplikaci s MySQL, SMTP, autentizací, kontejnerizací a CI/CD.

## 2. Stack

| Vrstva | Volba | Proč |
|---|---|---|
| Runtime / framework | Next.js 15 (App Router), React 19, TypeScript strict | SSR pro veřejné stránky (stav skladu má být rychlý a indexovatelný), server actions jako tenké adaptéry, jeden deploy artefakt |
| Databáze | MySQL 8 přes Prisma | Zadání; Prisma dává typované migrace a `$transaction` s row-level zámky |
| Mail | nodemailer (SMTP) s přepínatelným driverem | Potvrzení zákazníkovi + notifikace farmáři; ve vývoji Mailpit, v produkci vlastní SMTP |
| Auth | bcrypt + JWT (`jose`) v httpOnly cookie | Bez externí závislosti, role `CUSTOMER` / `FARMER` |
| Validace | Zod | Vstupy z formulářů i env proměnné |
| Testy | Vitest (unit + integrace), Playwright (E2E) | |
| Kontejner | Docker multi-stage, `output: 'standalone'` | Malý runtime image bez build závislostí |
| CI/CD | GitHub Actions | quality → integration → e2e → security → release |

## 3. Architektura

Závislosti míří **dovnitř**. `domain` nezná nikoho, `application` zná jen `domain`,
`infrastructure` implementuje porty z `domain`, `app`/`components` volají use-case přes
composition root.

```
src/
  domain/
    entities/        Variety, Order, OrderItem, NewsPost, Field, HarvestEntry, StorageReading, User
    value-objects/   Kilograms, Money, EmailAddress, HexColor, Slug
    enums/           OrderStatus, DeliveryMethod, PaymentMethod, NewsTag, FieldStatus, UserRole
    errors/          DomainError a potomci (InsufficientStockError, ...)
    ports/           repository + service interfaces
  application/
    use-cases/       jeden soubor = jeden use-case
    dto/             vstupní/výstupní tvary napříč hranicí
  infrastructure/
    config/          env.ts — Zod validace process.env, jediné místo čtení env
    persistence/prisma/  client, mappers, repository implementace
    mail/            NodemailerMailer + šablony
    auth/            BcryptPasswordHasher, JoseTokenService, session cookie
    di/              container.ts — composition root
  app/               Next.js App Router: stránky, layouty, route handlers, server actions
  components/        ui/ (primitiva) + feature komponenty
  shared/            Result, logger, formátování (cs-CZ)
```

**Proč `src/app` a ne `src/presentation/app`:** Next.js hledá App Router výhradně v
`app/` nebo `src/app/`. Presentation vrstvu tedy tvoří `src/app` + `src/components`;
ostatní vrstvy leží vedle nich.

### Porty (domain/ports)

- `VarietyRepository` — `findAllActive`, `findById`, `findAll`, `save`, `deactivate`, `lockForUpdate(ids, tx)`
- `OrderRepository` — `create`, `findByCode`, `listRecent`, `updateStatus`, `nextCode`
- `NewsRepository` — `listPublished`, `create`, `delete`
- `FieldRepository`, `HarvestRepository`, `StorageReadingRepository` — read-only přehledy
- `UserRepository` — `findByEmail`, `findById`, `create`
- `UnitOfWork` — `runInTransaction(fn)`; jediný způsob, jak se use-case dostane k transakci
- `Mailer` — `send(message)`
- `PasswordHasher` — `hash`, `verify`
- `TokenService` — `sign`, `verify`
- `Clock` — `now()`; testy dostávají fixní čas
- `Logger`

### Use-cases (application/use-cases)

Veřejné: `ListVarieties`, `GetStockOverview`, `ListNews`, `ReserveOrder`, `GetOrderByCode`
Admin: `ListOrders`, `AdvanceOrderStatus`, `SetOrderPaid`, `UpsertVariety`, `DeactivateVariety`, `PublishNews`, `DeleteNews`, `GetAdminOverview`
Auth: `RegisterUser`, `LoginUser`, `GetCurrentUser`

## 4. Datový model (MySQL)

| Tabulka | Sloupce (podstatné) | Poznámka |
|---|---|---|
| `users` | `id`, `email` UNIQUE, `password_hash`, `name`, `role` ENUM(CUSTOMER,FARMER), `created_at` | |
| `varieties` | `id`, `slug` UNIQUE, `name`, `tag`, `description`, `color_hex`, `price_per_kg_czk` DECIMAL(10,2), `stock_kg` DECIMAL(10,2), `capacity_kg` DECIMAL(10,2), `sort_order`, `is_active`, timestamps | `stock_kg` je jediný zdroj pravdy o skladu |
| `orders` | `id`, `code` UNIQUE, `public_token` UNIQUE, `customer_name`, `customer_email`, `customer_phone`, `note`, `delivery_method` ENUM, `payment_method` ENUM, `subtotal_czk`, `delivery_fee_czk`, `total_czk`, `status` ENUM(NEW,READY,COLLECTED), `paid_at` DATETIME NULL, `user_id` FK NULL, `created_at` | `user_id` NULL = host bez účtu; dvě identity — viz níž; `paid_at` = kdy farmář platbu odškrtl |
| `order_items` | `id`, `order_id` FK CASCADE, `variety_id` FK RESTRICT, `variety_name`, `unit_price_czk`, `quantity_kg`, `line_total_czk` | `variety_name` a `unit_price_czk` jsou **snapshoty** |
| `news_posts` | `id`, `title`, `body`, `tag` ENUM(HARVEST,STORAGE,FIELD), `image_url` NULL, `published_at`, `author_id` FK | |
| `fields` | `id`, `name`, `variety_name`, `area_m2`, `status` ENUM(GROWING,HARVESTING,HARVESTED), `yield_kg`, `is_estimate` | mapa polí |
| `harvest_entries` | `id`, `date` UNIQUE, `dug_kg`, `stock_kg` | 14denní graf |
| `storage_readings` | `id`, `recorded_at`, `temperature_c`, `humidity_pct` | KPI „Teplota stodoly“ |

**Snapshot ceny a názvu v `order_items`** je záměrný: když farmář později přepíše cenu
odrůdy, historická objednávka musí zůstat na původní částce. `RESTRICT` na `variety_id`
brání smazání odrůdy, na kterou existují objednávky — místo mazání se nastaví `is_active = false`.

Peníze jsou `DECIMAL(10,2)` v korunách, v aplikaci `Money` (celé haléře v `number`).
Množství je `DECIMAL(10,2)` v kilogramech, v aplikaci `Kilograms` (kroky po 0,5 kg).

## 5. Kritický tok: ReserveOrder

```
1. Validace vstupu (Zod → DTO): neprázdný košík, jméno, e-mail, každá položka ≥ 0,5 kg
2. UnitOfWork.runInTransaction:
     a. SELECT ... FOR UPDATE nad dotčenými varieties (seřazeno podle id → prevence deadlocku)
     b. pro každou položku: stock_kg >= quantity_kg, jinak InsufficientStockError(varietyName, available)
     c. přepočet cen ze serverových dat (klientská cena se ignoruje)
     d. UPDATE varieties SET stock_kg = stock_kg - qty
     e. INSERT orders + order_items
3. COMMIT
4. Teprve po commitu: 2 e-maily (zákazník, farmář) — best effort v try/catch
```

**Proč mail až po commitu a bez rollbacku:** sklad je pravda, mail je notifikace.
Výpadek SMTP nesmí zrušit platnou rezervaci; selhání se loguje a objednávka je
v administraci vidět tak jako tak.

Řazení zámků podle `id` je nutné — dvě souběžné objednávky na stejnou dvojici odrůd
v opačném pořadí by se jinak zablokovaly navzájem.

Doprava: `Rozvoz po okolí` = 60 Kč, zdarma nad 600 Kč mezisoučtu. `Osobní odběr` = 0 Kč.

**Objednávka má dvě identity.** `code` (`#2610`) je lidský štítek do e-mailů a administrace;
odvozuje se z auto-increment `id` (`#${2609 + id}`) až po insertu, uvnitř téže transakce —
`COUNT(*)+1` by dvěma souběžným transakcím vrátil stejné číslo. `public_token` (24 náhodných
bajtů base64url) je to jediné, co jde do veřejné URL potvrzení. Kdyby v URL byl sekvenční
kód, kdokoli by vyjmenoval `/rezervace/2611` a přečetl jméno, e-mail, telefon a poznámku
cizího zákazníka.

## 5a. Přepínání mailového driveru

`MAIL_DRIVER` volí, kam odchází pošta. Aplikace se nikdy nedozví rozdíl — všechny tři
varianty implementují stejný port `Mailer`.

| `MAIL_DRIVER` | Chování | Kdy |
|---|---|---|
| `mailpit` | SMTP na `SMTP_HOST` (výchozí `mailpit`), port `1025`, bez TLS, bez přihlášení. Zprávy se nikam neodešlou, čtou se v UI na `http://localhost:8025`. | Vývoj a ruční testování — **výchozí hodnota** |
| `smtp` | Skutečný SMTP server z `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD`. Vyžaduje vyplněný host; s `SMTP_USER` se posílá i přihlášení. | Produkce |
| `memory` | Nic neodesílá, zprávy si drží v poli. | Unit testy a CI, kde žádný kontejner neběží |

Volba driveru je věc konfigurace, ne kódu: `container.ts` podle `MAIL_DRIVER` sestaví
odpovídající implementaci `Mailer` a zbytek aplikace o tom neví. Kdyby driver rozhodoval
až v odesílajícím kódu, prosákla by konfigurace do use-case.

Ochrana proti omylu: při `NODE_ENV=production` a `MAIL_DRIVER` jiném než `smtp` aplikace
nenastartuje. Produkce, která tiše zahazuje potvrzení objednávek, je horší než produkce,
která nenaběhne.

Mailpit běží v compose za profilem `mail` (`docker compose --profile mail up`), takže
výchozí sestava zůstává dvoukontejnerová a Mailpit se přidá jen, když ho chcete.

## 5b. QR platba

Farma inkasuje převodem. Když si zákazník zvolí platbu `QR platba` nebo `Převodem na účet`,
aplikace mu vygeneruje český QR kód podle standardu **SPAYD** (Short Payment Descriptor, ČBA).

```
SPD*1.0*ACC:CZ6508000000192000145399*AM:182.00*CC:CZK*X-VS:2610*MSG:Agro:2610
```

- `ACC` — IBAN z `BANK_ACCOUNT_IBAN`, bez mezer
- `AM` — celková částka na dvě desetinná místa
- `CC` — vždy `CZK`
- `X-VS` — variabilní symbol = číselná část kódu objednávky (`#2610` → `2610`)
- `MSG` — **zpráva pro příjemce ve tvaru `Agro:<číslo objednávky>`**, tedy `Agro:2610`.
  Krátká, bez diakritiky, bez mezer — banky delší zprávy komolí a farmář podle ní páruje
  platbu s objednávkou i tehdy, když zákazník zapomene variabilní symbol.

**Zákazník platící ručním převodem musí dostat stejnou instrukci slovy.** Na stránce
potvrzení i v e-mailu proto stojí věta: „Do zprávy pro příjemce prosím napište
`Agro:2610` — podle ní platbu spárujeme.“ Kdo QR nenačte a vyplní příkaz ručně, jinak
odešle platbu bez jakéhokoli identifikátoru.

Kód se generuje **jednou v aplikaci**, ne přes externí službu — poslat částku a číslo účtu
zákazníka na cizí API kvůli obrázku je zbytečný únik dat i závislost na cizí dostupnosti.

Zobrazuje se na dvou místech:
- **Stránka potvrzení** `/rezervace/[token]` — jako `data:` URI přímo v `<img>`, vedle
  čitelného výpisu čísla účtu, částky a variabilního symbolu (QR nesmí být jediná cesta k údajům)
- **E-mail zákazníkovi** — jako **inline příloha s `Content-ID`** (`cid:qr@silentagro`).
  `data:` URI v `<img>` Gmail i Outlook blokují, proto musí jít přílohou. Textová část
  e-mailu obsahuje stejné údaje slovy, aby platba šla i bez načtení obrázků.

Při platbě `Hotově při převzetí` se QR negeneruje ani nezobrazuje.

### Označení objednávky jako zaplacené

Farma nemá napojení na bankovní API, takže platbu potvrzuje člověk. V administraci má
proto každý řádek objednávky **zaškrtávátko „Zaplaceno“**. Zaškrtnutí zapíše
`orders.paid_at = NOW()`, odškrtnutí ho vrátí na `NULL`.

`paid_at` je záměrně čas, ne booleovská hodnota: farmář se potřebuje podívat, kdy platba
dorazila, a `NULL` versus datum nese obojí — příznak i časové razítko — v jednom sloupci.

Stav zaplacení je **nezávislý na `status`**. Objednávka může být `Vydána` a nezaplacená
(platba hotově, kterou farmář zapomněl odškrtnout) i `Nová` a zaplacená (zákazník poslal
peníze hned po rezervaci). Míchat je do jednoho výčtu by znamenalo šest kombinací tam,
kde stačí dva nezávislé údaje.

Nové proměnné prostředí:

| Proměnná | Význam |
|---|---|
| `BANK_ACCOUNT_IBAN` | IBAN farmy, mezery povolené a při načtení se odstraní; validuje se mod-97 |
| `BANK_ACCOUNT_NUMBER` | Lidsky čitelné číslo účtu (`2000145399/0800`) pro výpis v e-mailu a na stránce |

Bez `BANK_ACCOUNT_IBAN` aplikace nenastartuje — nabízet převod bez čísla účtu nedává smysl.

## 6. Stránky

| Cesta | Obsah | Přístup |
|---|---|---|
| `/` | Hero, živý stav skladu, zásobníky, novinky, „jak to funguje“ | veřejné |
| `/burza` | Karty odrůd, výběr množství, přidání do košíku | veřejné |
| `/sklad` | KPI, zásobníky, 14denní graf výkopu, mapa polí | veřejné |
| `/kosik` | Položky, kontakt, převzetí, platba, souhrn, odeslání | veřejné |
| `/rezervace/[token]` | Potvrzení + náhled obou odeslaných e-mailů | veřejné přes náhodný token |
| `/admin` | Taby: Přehled / Sklad a ceny / Objednávky / Novinky | role `FARMER` |
| `/api/health` | Liveness + kontrola DB | veřejné |

Košík žije v `localStorage` na klientovi (nepřihlášený zákazník musí umět nakoupit bez účtu);
server ho při odeslání celý přepočítá a nevěří ničemu z klienta kromě `varietyId` + `quantityKg`.

## 7. Bezpečnost

- Hesla: bcrypt, cost 12. Nikdy se nevrací z API.
- Session: JWT (HS256, `jose`) v cookie `httpOnly`, `secure` v produkci, `sameSite=lax`, TTL 7 dní.
- Admin: middleware kontroluje roli `FARMER` na `/admin/**` a každý admin use-case ji ověří znovu (defense in depth).
- Vstupy: Zod na hranici; server nikdy nepřebírá cenu ani stav skladu od klienta.
- Rate limit na přihlášení, registraci a odeslání objednávky (in-memory token bucket; stačí pro jednu instanci).
- Bezpečnostní hlavičky přes `next.config.ts`: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`, HSTS.
- Žádný secret v repozitáři ani v image; `.env.example` obsahuje jen tvary hodnot.
- Nahrávané fotky k novinkám: whitelist MIME + limit velikosti, ukládá se do volume, název generuje server.

## 8. Docker

Multi-stage `deps → builder → runner`:
- `node:22-alpine`, runner spouští `USER node` (uid 1000), nikdy root
- `output: 'standalone'` → runtime image obsahuje jen server a potřebné `node_modules`
- `read_only: true` root filesystem, zapisovatelné jen tmpfs `/tmp` a volume pro uploads
- `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`
- `HEALTHCHECK` na `/api/health`
- `.dockerignore` vylučuje `.git`, `node_modules`, `.env*`, testy

`docker-compose.yml` je **dvoukontejnerový**: `app` (Next.js) a `db` (MySQL 8.4), propojené
přímo přes interní bridge síť jako `db:3306`. Port databáze se na hostitele nepublikuje;
port aplikace jen na `127.0.0.1:3000`. Odchytávač e-mailů Mailpit je za profilem `mail`
(`docker compose --profile mail up`), takže výchozí sestava zůstává přesně dvoukontejnerová.
Migrace se pouštějí v entrypointu při startu, ne při buildu — build nemá mít přístup k DB.
`docker-compose.prod.yml` počítá s externí DB a SMTP, `.env` mimo image.

## 9. CI/CD (GitHub Actions)

| Job | Kroky |
|---|---|
| `quality` | `npm ci` → eslint → `tsc --noEmit` → `vitest run --coverage` (unit) |
| `integration` | service `mysql:8` + `mailpit` → `prisma migrate deploy` → integrační testy repozitářů a `ReserveOrder` proti reálné DB |
| `e2e` | `docker compose up` → Playwright |
| `security` | `npm audit --audit-level=high`, Trivy scan image (fail na HIGH/CRITICAL), gitleaks, CodeQL |
| `release` (na tag `v*`) | build + push GHCR, SBOM (syft), podpis (cosign) |

Dependabot pro npm, GitHub Actions i Docker base image.

## 10. Testy

**Unit** (rychlé, bez I/O):
- `Kilograms` — zaokrouhlení na půl kila, odmítnutí záporných hodnot
- `Money` — sčítání bez plovoucí chyby, formát `cs-CZ`
- `ReserveOrder` s in-memory fakes — prodej nad sklad → `InsufficientStockError`;
  doprava 60 Kč / zdarma nad 600 Kč; přepočet ceny ze serveru, ne z klienta;
  selhání maileru objednávku nezruší
- `AdvanceOrderStatus` — cyklus `NEW → READY → COLLECTED → NEW`

**Integrační** (proti MySQL):
- mapování repozitářů tam a zpět
- **race test**: 1 kg na skladě, dvě souběžné rezervace po 1 kg → právě jedna uspěje,
  druhá dostane `InsufficientStockError`, `stock_kg` skončí na 0

**E2E** (Playwright):
- domů → burza → přidat do košíku → vyplnit kontakt → rezervovat → potvrzení
- přihlášení farmáře → admin → změna skladu → publikace novinky → novinka na homepage
- nepřihlášený na `/admin` → přesměrování

## 11. Seed

Data z prototypu: 4 odrůdy (Bernie, Marabel, Red Anna, Agria), 3 novinky, 5 polí,
14 dní historie výkopu, 3 objednávky, farmář `farma@silentagro.cz`.
Heslo farmáře se bere z `SEED_FARMER_PASSWORD`; bez ní seed skončí chybou (žádné
zapečené demo heslo v repozitáři).

## 12. Co záměrně neděláme (YAGNI)

- Platební brána — QR platba je jen text v e-mailu, sedí to k modelu „přijeďte na farmu“
- Fronta / outbox pro e-maily — jedna farma, jednotky objednávek denně
- i18n — aplikace je česky, zákazníci jsou z okolí
- Redis / distribuovaný rate limit — jedna instance
