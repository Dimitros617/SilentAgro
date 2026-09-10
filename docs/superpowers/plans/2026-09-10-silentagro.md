# SilentAgro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Převést prototyp `SilentAgro.dc.html` na produkční aplikaci farmy pro rezervaci brambor — MySQL, SMTP, autentizace s rolemi, Docker, CI/CD.

**Architecture:** Next.js 15 App Router s clean architecture — `domain` (čisté entity, value objects, porty) ← `application` (use-cases) ← `infrastructure` (Prisma, SMTP, auth) a `app`/`components` jako presentation. Závislosti míří dovnitř; composition root je `src/infrastructure/di/container.ts`.

**Tech Stack:** Next.js 15, React 19, TypeScript 5 (strict), Prisma 6 + MySQL 8, nodemailer, jose, bcryptjs, Zod 4, Vitest 3, Playwright, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-10-silentagro-design.md`

## Global Constraints

- Node **22** (Docker image `node:22-alpine`); lokální vývoj Node ≥ 22.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Žádné `any` v `src/domain` a `src/application`.
- **Jazyk UI a e-mailů: čeština.** Identifikátory v kódu anglicky, uživatelské texty česky.
- **Peníze**: v doméně `Money` (celé haléře, `number`). V DB `DECIMAL(10,2)` v korunách. Nikdy `float` aritmetika nad korunami.
- **Množství**: v doméně `Kilograms` (kroky 0,5 kg). V DB `DECIMAL(10,2)`.
- `src/infrastructure/config/env.ts` je **jediné** místo, které čte `process.env`. Nikde jinde se `process.env` nepoužívá (kromě `next.config.ts` a skriptů v `prisma/`).
- Hesla: `bcryptjs`, cost **12**. Důvod pro `bcryptjs` místo `bcrypt`: nativní modul by v `node:22-alpine` vyžadoval `python3`+`make`+`g++` v build stagi a zvětšil image; čistě JS varianta drží runtime image malý a build deterministický.
- JWT: `jose` (HS256). Důvod: Next.js middleware běží na **Edge runtime**, kde `jsonwebtoken` ani `bcryptjs` nefungují. `jose` používá WebCrypto a na Edge běží. Middleware proto **jen ověřuje token**, nikdy nehashuje heslo.
- Barvy a typografie z prototypu jsou závazné: pozadí `#f6f3ec`, inkoust `#14201a`, zelená `#1f6f4a`, zlatá `#d9a227`, cihlová `#b4553a`, linka `#e3ddd0`, ztlumený text `#6f7a72`. Fonty `Space Grotesk` (nadpisy) + `IBM Plex Sans` (text) přes `next/font/google`.
- Každý task končí commitem. Formát: Conventional Commits, česky, bez trailerů.
- **Docker CLI na tomto stroji není v PATH.** Volat absolutní cestou: `"C:\Program Files\Docker\Docker\resources\bin\docker.exe"`. Ověřeno: Docker 29.1.3, Compose v2.40.3, daemon běží (linux/overlayfs).

---

## Odchylky od spec, které tento plán zavádí

1. **Veřejná URL potvrzení používá náhodný token, ne kód objednávky.** Spec počítal s `/rezervace/[code]` a předpokládal, že kód je nevypočitatelný. Kód `#2610` je ale sekvenční — kdokoli by mohl vyjmenovat `/rezervace/2611` a přečíst jméno, e-mail, telefon a poznámku cizího zákazníka (IDOR). Objednávka proto dostane dvě identity: `code` (`#2610`, pro lidi, e-maily a administraci) a `publicToken` (24 náhodných bajtů base64url, jen do URL).
2. **`code` se odvozuje z auto-increment `id` až po insertu, uvnitř téže transakce.** Spec psal „generováno v transakci“ bez detailu; počítání `COUNT(*)+1` je pod souběhem nespolehlivé i uvnitř transakce (dvě transakce vidí stejný stav a obě zapíšou stejný kód → porušení UNIQUE a zbytečné selhání objednávky).

---

## File Structure

```
prisma/
  schema.prisma                     Prisma schema, všech 8 tabulek
  seed.ts                           idempotentní seed z dat prototypu
src/
  shared/
    result.ts                       Result<T, E> pro hranici use-case → UI
    logger.ts                       Logger interface + konzolová implementace
    format.ts                       cs-CZ formátování kg, Kč, datumu
  domain/
    enums.ts                        OrderStatus, DeliveryMethod, PaymentMethod, NewsTag, FieldStatus, UserRole
    errors.ts                       DomainError + potomci
    value-objects/
      kilograms.ts                  Kilograms
      money.ts                      Money
      email-address.ts              EmailAddress
      hex-color.ts                  HexColor
    entities/
      variety.ts                    Variety (+ withdraw, hasStockFor, fillPercent)
      order.ts                      Order, OrderItem, deliveryFeeFor
      news-post.ts                  NewsPost
      field.ts                      Field
      harvest-entry.ts              HarvestEntry
      storage-reading.ts            StorageReading
      user.ts                       User
    ports/
      repositories.ts               VarietyRepository, OrderRepository, NewsRepository, UserRepository, FieldRepository, HarvestRepository, StorageReadingRepository, RepositoryBundle
      unit-of-work.ts               UnitOfWork
      services.ts                   Mailer, PasswordHasher, TokenService, Clock, TokenGenerator
  application/
    dto.ts                          vstupní/výstupní tvary napříč hranicí
    use-cases/
      list-varieties.ts
      get-stock-overview.ts
      list-news.ts
      get-order-by-token.ts
      reserve-order.ts              ← kritický tok
      register-user.ts
      login-user.ts
      list-orders.ts
      advance-order-status.ts
      upsert-variety.ts
      deactivate-variety.ts
      publish-news.ts
      delete-news.ts
  infrastructure/
    config/env.ts                   Zod validace process.env
    persistence/prisma/
      client.ts                     PrismaClient singleton
      mappers.ts                    řádek ↔ entita
      unit-of-work.ts               PrismaUnitOfWork
      repositories.ts               všech 7 Prisma repozitářů
    mail/
      nodemailer-mailer.ts
      templates.ts                  renderCustomerConfirmation, renderFarmerNotification
    auth/
      bcrypt-password-hasher.ts
      jose-token-service.ts
      session.ts                    čtení/zápis cookie (server-only)
      edge-session.ts               ověření tokenu pro middleware (Edge-safe)
    rate-limit/token-bucket.ts
    di/container.ts                 composition root
  app/
    layout.tsx, globals.css, page.tsx (domů)
    burza/page.tsx
    sklad/page.tsx
    kosik/page.tsx
    rezervace/[token]/page.tsx
    admin/layout.tsx, page.tsx, sklad/page.tsx, objednavky/page.tsx, novinky/page.tsx
    api/health/route.ts
    actions/                        server actions: auth.ts, order.ts, admin-stock.ts, admin-orders.ts, admin-news.ts
  components/
    ui/                             Button, Input, Textarea, Card, Badge, Chip, Pill, Field, Toast
    layout/                         SiteHeader, SiteFooter, AuthModal, ToastHost
    home/                           StockHero, BinChart, NewsGrid, HowItWorks
    shop/                           VarietyCard, QuantityStepper
    stock/                          KpiCard, BinBars, HarvestChart, FieldMap
    cart/                           CartProvider (localStorage), CartLines, CheckoutForm, OrderSummary
    admin/                          AdminTabs, StockRow, AddVarietyForm, OrdersTable, NewsComposer, NewsAdminList
  middleware.ts                     ochrana /admin (Edge)
tests/
  unit/                             Vitest, bez I/O
  integration/                      Vitest proti MySQL
  e2e/                              Playwright
docker/
  Dockerfile
  docker-compose.yml
  docker-compose.prod.yml
  .dockerignore                     (v rootu repa)
.github/
  workflows/ci.yml, release.yml
  dependabot.yml
```

---

### Task 1: Scaffold projektu, konfigurace prostředí, health endpoint

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.example`, `.nvmrc`
- Create: `src/infrastructure/config/env.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `src/app/api/health/route.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: nic (první task)
- Produces:
  - `env: Env` z `src/infrastructure/config/env.ts`, kde
    ```ts
    export interface Env {
      NODE_ENV: 'development' | 'test' | 'production'
      DATABASE_URL: string
      AUTH_SECRET: string            // min 32 znaků
      SMTP_HOST: string
      SMTP_PORT: number
      SMTP_SECURE: boolean
      SMTP_USER: string | undefined
      SMTP_PASSWORD: string | undefined
      MAIL_FROM: string              // "SilentAgro <farma@silentagro.cz>"
      FARMER_EMAIL: string
      PUBLIC_BASE_URL: string        // "http://localhost:3000"
      UPLOAD_DIR: string             // "./public/uploads"
    }
    export function loadEnv(source?: NodeJS.ProcessEnv): Env   // vyhodí ZodError s výpisem chybějících klíčů
    export const env: Env                                       // loadEnv(process.env), lazy přes getter
    ```

- [ ] **Step 1: Vytvořit projekt a nainstalovat závislosti**

```bash
npm init -y
npm i next@15 react@19 react-dom@19 @prisma/client zod nodemailer jose bcryptjs
npm i -D typescript @types/node @types/react @types/react-dom @types/nodemailer @types/bcryptjs \
        prisma eslint eslint-config-next @eslint/js typescript-eslint \
        vitest @vitest/coverage-v8 tsx
```

- [ ] **Step 2: `package.json` — skripty**

```json
{
  "name": "silentagro",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "tsx prisma/seed.ts"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

- [ ] **Step 3: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "incremental": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Napsat padající test pro `loadEnv`**

`tests/unit/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { loadEnv } from '@/infrastructure/config/env'

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'mysql://u:p@localhost:3306/silentagro',
  AUTH_SECRET: 'x'.repeat(32),
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'SilentAgro <farma@silentagro.cz>',
  FARMER_EMAIL: 'farma@silentagro.cz',
  PUBLIC_BASE_URL: 'http://localhost:3000',
}

describe('loadEnv', () => {
  it('načte platnou konfiguraci a převede typy', () => {
    const env = loadEnv(valid as NodeJS.ProcessEnv)
    expect(env.SMTP_PORT).toBe(1025)
    expect(env.SMTP_SECURE).toBe(false)
    expect(env.UPLOAD_DIR).toBe('./public/uploads')
  })

  it('odmítne krátký AUTH_SECRET a chybu pojmenuje', () => {
    expect(() => loadEnv({ ...valid, AUTH_SECRET: 'krátké' } as NodeJS.ProcessEnv))
      .toThrow(/AUTH_SECRET/)
  })

  it('odmítne chybějící DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid
    expect(() => loadEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
  })
})
```

- [ ] **Step 5: Spustit test, ověřit, že padá**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: FAIL — `Cannot find module '@/infrastructure/config/env'`

- [ ] **Step 6: Implementovat `src/infrastructure/config/env.ts`**

```ts
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL je povinná'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET musí mít alespoň 32 znaků'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  FARMER_EMAIL: z.string().email(),
  PUBLIC_BASE_URL: z.string().url(),
  UPLOAD_DIR: z.string().default('./public/uploads'),
})

export type Env = z.infer<typeof schema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ')
    throw new Error(`Neplatná konfigurace prostředí:\n  ${detail}`)
  }
  return parsed.data
}

let cached: Env | undefined
export const env: Env = new Proxy({} as Env, {
  get(_t, key: string) {
    cached ??= loadEnv()
    return cached[key as keyof Env]
  },
})
```

Proxy je tam proto, aby import `env` v modulu, který se načte při buildu (kde `DATABASE_URL` chybí), nespadl — validace proběhne až při prvním čtení klíče za běhu.

- [ ] **Step 7: Spustit test, ověřit, že prochází**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: PASS (3 testy)

- [ ] **Step 8: `.env.example`**

```dotenv
# --- Databáze ---
DATABASE_URL="mysql://silentagro:zmen_me@localhost:3306/silentagro"

# --- Autentizace ---
# Vygenerovat: openssl rand -base64 48
AUTH_SECRET="zmen_me_na_nahodny_retezec_o_delce_alespon_32_znaku"

# --- SMTP ---
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASSWORD=""
MAIL_FROM="SilentAgro <farma@silentagro.cz>"
FARMER_EMAIL="farma@silentagro.cz"

# --- Aplikace ---
PUBLIC_BASE_URL="http://localhost:3000"
UPLOAD_DIR="./public/uploads"

# --- Jen pro seed (není potřeba za běhu) ---
SEED_FARMER_PASSWORD=""
```

- [ ] **Step 9: `.gitignore`**

```gitignore
node_modules/
.next/
out/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
next-env.d.ts
.env
.env.*
!.env.example
public/uploads/*
!public/uploads/.gitkeep
```

- [ ] **Step 10: `next.config.ts` s bezpečnostními hlavičkami**

```ts
import type { NextConfig } from 'next'

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default config
```

`'unsafe-inline'` ve `script-src` je nutné, protože Next.js App Router vkládá inline bootstrap skript. Nonce-based CSP by vyžadovala middleware na každý požadavek — v tomto rozsahu neúměrné.

- [ ] **Step 11: `vitest.config.ts` se dvěma projekty**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: { provider: 'v8', include: ['src/domain/**', 'src/application/**'] },
  },
})
```

`fileParallelism: false` u integrace je záměr — testy sdílejí jednu databázi a mažou tabulky mezi běhy.

- [ ] **Step 12: Minimální `src/app/layout.tsx` + `globals.css` + `page.tsx`**

`layout.tsx` nastaví fonty a základní paletu; `page.tsx` zatím jen `<main>SilentAgro</main>` (skutečná homepage přijde v Tasku 17). Tohle je jen tolik, aby `next build` prošel.

```tsx
import type { Metadata } from 'next'
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google'
import './globals.css'

const sans = IBM_Plex_Sans({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-sans' })
const display = Space_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'], variable: '--font-display' })

export const metadata: Metadata = {
  title: 'SilentAgro — brambory přímo z pole',
  description: 'Rezervujte si brambory přímo z pole. Aktuální stav skladu, žádné mezičlánky.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

`globals.css` obsahuje CSS proměnné z palety prototypu:
```css
:root{--bg:#f6f3ec;--surface:#fff;--ink:#14201a;--green:#1f6f4a;--gold:#d9a227;--clay:#b4553a;--line:#e3ddd0;--muted:#6f7a72;--muted-2:#4a5750;--sand:#faf8f2;--sand-2:#f0ece1;--tint-green:#e6f0e8;--tint-gold:#fdf3dc;--tint-clay:#f6ece9}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-sans),system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--green);text-decoration:none}
a:hover{color:var(--ink)}
input,select,textarea,button{font-family:inherit;font-size:inherit}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
```

- [ ] **Step 13: `src/app/api/health/route.ts`**

Zatím bez kontroly DB (Prisma přijde v Tasku 2); vrací `{ status: 'ok' }`. V Tasku 6 se rozšíří.

```ts
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
```

- [ ] **Step 14: Ověřit build a lint**

Run: `npm run typecheck && npm run lint && npm run build && npm run test`
Expected: vše projde; `next build` vypíše `.next/standalone`

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js projektu s validovanou konfigurací prostředí"
```

---

### Task 2: Prisma schema a první migrace

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/migrations/` (vygeneruje `prisma migrate dev`)
- Modify: `.env` (lokální, negitován) — `DATABASE_URL`

**Interfaces:**
- Consumes: `DATABASE_URL` z Tasku 1
- Produces: vygenerovaný `@prisma/client` s modely `User`, `Variety`, `Order`, `OrderItem`, `NewsPost`, `Field`, `HarvestEntry`, `StorageReading` a enumy `UserRole`, `OrderStatus`, `DeliveryMethod`, `PaymentMethod`, `NewsTag`, `FieldStatus`

- [ ] **Step 1: Spustit MySQL kontejner pro vývoj**

```bash
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" run -d --name silentagro-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=silentagro \
  -e MYSQL_USER=silentagro -e MYSQL_PASSWORD=silentagro \
  -p 3307:3306 mysql:8
```

Port **3307** navenek, aby nekolidoval s případnou lokální MySQL. `DATABASE_URL="mysql://silentagro:silentagro@localhost:3307/silentagro"`.

- [ ] **Step 2: Napsat `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  CUSTOMER
  FARMER
}

enum OrderStatus {
  NEW
  READY
  COLLECTED
}

enum DeliveryMethod {
  PICKUP
  LOCAL_DELIVERY
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  QR_CODE
}

enum NewsTag {
  HARVEST
  STORAGE
  FIELD
}

enum FieldStatus {
  GROWING
  HARVESTING
  HARVESTED
}

model User {
  id           Int        @id @default(autoincrement())
  email        String     @unique @db.VarChar(255)
  passwordHash String     @map("password_hash") @db.VarChar(255)
  name         String     @db.VarChar(120)
  role         UserRole   @default(CUSTOMER)
  createdAt    DateTime   @default(now()) @map("created_at")
  orders       Order[]
  newsPosts    NewsPost[]

  @@map("users")
}

model Variety {
  id            Int         @id @default(autoincrement())
  slug          String      @unique @db.VarChar(80)
  name          String      @db.VarChar(120)
  tag           String      @db.VarChar(160)
  description   String      @db.Text
  colorHex      String      @map("color_hex") @db.Char(7)
  pricePerKgCzk Decimal     @map("price_per_kg_czk") @db.Decimal(10, 2)
  stockKg       Decimal     @map("stock_kg") @db.Decimal(10, 2)
  capacityKg    Decimal     @map("capacity_kg") @db.Decimal(10, 2)
  sortOrder     Int         @default(0) @map("sort_order")
  isActive      Boolean     @default(true) @map("is_active")
  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")
  orderItems    OrderItem[]

  @@index([isActive, sortOrder])
  @@map("varieties")
}

model Order {
  id             Int            @id @default(autoincrement())
  code           String         @unique @db.VarChar(16)
  publicToken    String         @unique @map("public_token") @db.VarChar(64)
  customerName   String         @map("customer_name") @db.VarChar(120)
  customerEmail  String         @map("customer_email") @db.VarChar(255)
  customerPhone  String         @map("customer_phone") @db.VarChar(40)
  note           String         @db.Text
  deliveryMethod DeliveryMethod @map("delivery_method")
  paymentMethod  PaymentMethod  @map("payment_method")
  subtotalCzk    Decimal        @map("subtotal_czk") @db.Decimal(10, 2)
  deliveryFeeCzk Decimal        @map("delivery_fee_czk") @db.Decimal(10, 2)
  totalCzk       Decimal        @map("total_czk") @db.Decimal(10, 2)
  status         OrderStatus    @default(NEW)
  userId         Int?           @map("user_id")
  createdAt      DateTime       @default(now()) @map("created_at")
  user           User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  items          OrderItem[]

  @@index([status, createdAt])
  @@map("orders")
}

model OrderItem {
  id           Int     @id @default(autoincrement())
  orderId      Int     @map("order_id")
  varietyId    Int     @map("variety_id")
  varietyName  String  @map("variety_name") @db.VarChar(120)
  unitPriceCzk Decimal @map("unit_price_czk") @db.Decimal(10, 2)
  quantityKg   Decimal @map("quantity_kg") @db.Decimal(10, 2)
  lineTotalCzk Decimal @map("line_total_czk") @db.Decimal(10, 2)
  order        Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variety      Variety @relation(fields: [varietyId], references: [id], onDelete: Restrict)

  @@index([orderId])
  @@map("order_items")
}

model NewsPost {
  id          Int      @id @default(autoincrement())
  title       String   @db.VarChar(200)
  body        String   @db.Text
  tag         NewsTag
  imageUrl    String?  @map("image_url") @db.VarChar(300)
  publishedAt DateTime @map("published_at")
  authorId    Int?     @map("author_id")
  author      User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)

  @@index([publishedAt])
  @@map("news_posts")
}

model Field {
  id          Int         @id @default(autoincrement())
  name        String      @db.VarChar(120)
  varietyName String      @map("variety_name") @db.VarChar(120)
  areaM2      Int         @map("area_m2")
  status      FieldStatus
  yieldKg     Decimal     @map("yield_kg") @db.Decimal(10, 2)
  isEstimate  Boolean     @default(false) @map("is_estimate")
  sortOrder   Int         @default(0) @map("sort_order")

  @@map("fields")
}

model HarvestEntry {
  id      Int      @id @default(autoincrement())
  date    DateTime @unique @db.Date
  dugKg   Decimal  @map("dug_kg") @db.Decimal(10, 2)
  stockKg Decimal  @map("stock_kg") @db.Decimal(10, 2)

  @@map("harvest_entries")
}

model StorageReading {
  id            Int      @id @default(autoincrement())
  recordedAt    DateTime @map("recorded_at")
  temperatureC  Decimal  @map("temperature_c") @db.Decimal(4, 1)
  humidityPct   Int      @map("humidity_pct")

  @@index([recordedAt])
  @@map("storage_readings")
}
```

- [ ] **Step 3: Vygenerovat migraci a klienta**

Run: `npm run db:migrate -- --name init`
Expected: vznikne `prisma/migrations/<timestamp>_init/migration.sql`, klient se vygeneruje

- [ ] **Step 4: Ověřit, že migrace jde nasadit načisto**

```bash
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec silentagro-mysql \
  mysql -uroot -proot -e "DROP DATABASE silentagro; CREATE DATABASE silentagro;"
npm run db:deploy
```
Expected: `All migrations have been successfully applied`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Prisma schema a uvodni migrace pro MySQL"
```

---

### Task 3: Doménové value objects

**Files:**
- Create: `src/domain/errors.ts`, `src/domain/enums.ts`
- Create: `src/domain/value-objects/kilograms.ts`, `money.ts`, `email-address.ts`, `hex-color.ts`
- Test: `tests/unit/domain/kilograms.test.ts`, `money.test.ts`, `email-address.test.ts`

**Interfaces:**
- Consumes: nic
- Produces:
  ```ts
  // errors.ts
  export abstract class DomainError extends Error { abstract readonly code: string }
  export class ValidationError extends DomainError { readonly code = 'VALIDATION'; constructor(message: string) }
  export class InsufficientStockError extends DomainError {
    readonly code = 'INSUFFICIENT_STOCK'
    constructor(readonly varietyName: string, readonly availableKg: number, readonly requestedKg: number)
  }
  export class NotFoundError extends DomainError { readonly code = 'NOT_FOUND'; constructor(what: string) }
  export class AuthError extends DomainError { readonly code = 'AUTH'; constructor(message: string) }
  export class ForbiddenError extends DomainError { readonly code = 'FORBIDDEN'; constructor(message?: string) }
  export class ConflictError extends DomainError { readonly code = 'CONFLICT'; constructor(message: string) }

  // enums.ts
  export const OrderStatus = { NEW: 'NEW', READY: 'READY', COLLECTED: 'COLLECTED' } as const
  export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus]
  // stejný tvar pro DeliveryMethod (PICKUP | LOCAL_DELIVERY),
  // PaymentMethod (CASH | BANK_TRANSFER | QR_CODE), NewsTag (HARVEST | STORAGE | FIELD),
  // FieldStatus (GROWING | HARVESTING | HARVESTED), UserRole (CUSTOMER | FARMER)
  export const ORDER_STATUS_LABELS: Record<OrderStatus, string>       // 'Nová' | 'Připravena' | 'Vydána'
  export const DELIVERY_LABELS: Record<DeliveryMethod, string>        // 'Osobní odběr na farmě' | 'Rozvoz po okolí'
  export const PAYMENT_LABELS: Record<PaymentMethod, string>          // 'Hotově při převzetí' | 'Převodem na účet' | 'QR platba'
  export const NEWS_TAG_LABELS: Record<NewsTag, string>               // 'Sklizeň' | 'Sklad' | 'Pole'
  export const FIELD_STATUS_LABELS: Record<FieldStatus, string>       // 'Roste' | 'Sklízí se' | 'Vykopáno'
  export const NEXT_ORDER_STATUS: Record<OrderStatus, OrderStatus>    // NEW→READY→COLLECTED→NEW

  // kilograms.ts
  export class Kilograms {
    static readonly STEP = 0.5
    static of(value: number): Kilograms          // ValidationError při <0, NaN, nebo mimo krok 0,5
    static parse(input: string | number): Kilograms  // "1,5" i "1.5"; zaokrouhlí na nejbližší 0,5
    static zero(): Kilograms
    get value(): number
    plus(o: Kilograms): Kilograms
    minus(o: Kilograms): Kilograms               // ValidationError při záporném výsledku
    times(n: number): number
    gte(o: Kilograms): boolean
    isZero(): boolean
    equals(o: Kilograms): boolean
  }

  // money.ts — vnitřně celé haléře
  export class Money {
    static fromCzk(czk: number): Money           // ValidationError při NaN nebo <0
    static fromHaleru(h: number): Money
    static zero(): Money
    get czk(): number                            // s desetinami
    get haleru(): number
    plus(o: Money): Money
    minus(o: Money): Money
    timesKg(kg: Kilograms): Money                // haléře × kg, zaokrouhleno na celý haléř
    gt(o: Money): boolean
    gte(o: Money): boolean
    equals(o: Money): boolean
  }

  // email-address.ts
  export class EmailAddress {
    static of(raw: string): EmailAddress         // trim + lowercase; ValidationError při neplatném tvaru
    get value(): string
  }

  // hex-color.ts
  export class HexColor {
    static of(raw: string): HexColor             // "#rrggbb", case-insensitive → lowercase
    get value(): string
  }
  ```

- [ ] **Step 1: Napsat padající testy pro `Kilograms`**

`tests/unit/domain/kilograms.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { ValidationError } from '@/domain/errors'

describe('Kilograms', () => {
  it('přijme násobky půl kilogramu', () => {
    expect(Kilograms.of(0.5).value).toBe(0.5)
    expect(Kilograms.of(7).value).toBe(7)
  })

  it('odmítne hodnotu mimo půlkilový krok', () => {
    expect(() => Kilograms.of(0.3)).toThrow(ValidationError)
  })

  it('odmítne zápornou hodnotu', () => {
    expect(() => Kilograms.of(-1)).toThrow(ValidationError)
  })

  it('parsuje český desetinný oddělovač a zaokrouhlí na půl kila', () => {
    expect(Kilograms.parse('1,5').value).toBe(1.5)
    expect(Kilograms.parse('1,7').value).toBe(1.5)
    expect(Kilograms.parse('1,8').value).toBe(2)
    expect(Kilograms.parse('abc').value).toBe(0)
  })

  it('sčítá a odčítá bez chyby plovoucí čárky', () => {
    let acc = Kilograms.zero()
    for (let i = 0; i < 10; i++) acc = acc.plus(Kilograms.of(0.5))
    expect(acc.value).toBe(5)
    expect(Kilograms.of(2).minus(Kilograms.of(0.5)).value).toBe(1.5)
  })

  it('odmítne odečtení pod nulu', () => {
    expect(() => Kilograms.of(1).minus(Kilograms.of(2))).toThrow(ValidationError)
  })

  it('porovnává přes gte', () => {
    expect(Kilograms.of(2).gte(Kilograms.of(2))).toBe(true)
    expect(Kilograms.of(1.5).gte(Kilograms.of(2))).toBe(false)
  })
})
```

- [ ] **Step 2: Napsat padající testy pro `Money`**

`tests/unit/domain/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Money } from '@/domain/value-objects/money'
import { Kilograms } from '@/domain/value-objects/kilograms'

describe('Money', () => {
  it('sčítá bez chyby plovoucí čárky', () => {
    expect(Money.fromCzk(0.1).plus(Money.fromCzk(0.2)).czk).toBe(0.3)
  })

  it('násobí cenou za kilogram', () => {
    expect(Money.fromCzk(22).timesKg(Kilograms.of(2.5)).czk).toBe(55)
    expect(Money.fromCzk(17).timesKg(Kilograms.of(7.5)).czk).toBe(127.5)
  })

  it('drží haléře jako celé číslo', () => {
    expect(Money.fromCzk(19.99).haleru).toBe(1999)
  })

  it('odmítne zápornou částku', () => {
    expect(() => Money.fromCzk(-1)).toThrow()
  })
})
```

- [ ] **Step 3: Spustit testy, ověřit, že padají**

Run: `npx vitest run tests/unit/domain`
Expected: FAIL — moduly neexistují

- [ ] **Step 4: Implementovat `errors.ts` a `enums.ts`** podle signatur v bloku Interfaces výše.

- [ ] **Step 5: Implementovat `Kilograms`**

```ts
import { ValidationError } from '@/domain/errors'

const STEP = 0.5
const round = (n: number) => Math.round(n * 2) / 2

export class Kilograms {
  static readonly STEP = STEP
  private constructor(private readonly amount: number) {}

  static of(value: number): Kilograms {
    if (!Number.isFinite(value)) throw new ValidationError('Množství musí být číslo')
    if (value < 0) throw new ValidationError('Množství nesmí být záporné')
    if (round(value) !== value) {
      throw new ValidationError('Množství musí být násobkem 0,5 kg')
    }
    return new Kilograms(value)
  }

  static parse(input: string | number): Kilograms {
    const raw = typeof input === 'number' ? input : Number.parseFloat(
      input.replace(',', '.').replace(/[^0-9.]/g, ''),
    )
    if (!Number.isFinite(raw) || raw < 0) return new Kilograms(0)
    return new Kilograms(round(raw))
  }

  static zero(): Kilograms { return new Kilograms(0) }

  get value(): number { return this.amount }
  plus(o: Kilograms): Kilograms { return new Kilograms(round(this.amount + o.amount)) }
  minus(o: Kilograms): Kilograms {
    const next = round(this.amount - o.amount)
    if (next < 0) throw new ValidationError('Výsledné množství by bylo záporné')
    return new Kilograms(next)
  }
  times(n: number): number { return this.amount * n }
  gte(o: Kilograms): boolean { return this.amount >= o.amount }
  isZero(): boolean { return this.amount === 0 }
  equals(o: Kilograms): boolean { return this.amount === o.amount }
}
```

- [ ] **Step 6: Implementovat `Money`, `EmailAddress`, `HexColor`**

`Money` drží `haleru: number` (celé číslo). `fromCzk` = `Math.round(czk * 100)`. `timesKg` = `Math.round(this.haleru * kg.value)`. Tím je násobení půlkilem přesné.

- [ ] **Step 7: Spustit testy, ověřit průchod**

Run: `npx vitest run tests/unit/domain`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(domain): value objects pro mnozstvi, penize, e-mail a barvu"
```

---

### Task 4: Doménové entity

**Files:**
- Create: `src/domain/entities/variety.ts`, `order.ts`, `news-post.ts`, `field.ts`, `harvest-entry.ts`, `storage-reading.ts`, `user.ts`
- Test: `tests/unit/domain/variety.test.ts`, `tests/unit/domain/order.test.ts`

**Interfaces:**
- Consumes: `Kilograms`, `Money`, `EmailAddress`, `HexColor`, enumy a chyby z Tasku 3
- Produces:
  ```ts
  // variety.ts
  export interface VarietyProps {
    id: number; slug: string; name: string; tag: string; description: string
    color: HexColor; pricePerKg: Money; stock: Kilograms; capacity: Kilograms
    sortOrder: number; isActive: boolean
  }
  export class Variety {
    static rehydrate(props: VarietyProps): Variety
    readonly id: number; readonly slug: string; readonly name: string
    readonly tag: string; readonly description: string; readonly color: HexColor
    readonly pricePerKg: Money; readonly stock: Kilograms; readonly capacity: Kilograms
    readonly sortOrder: number; readonly isActive: boolean
    hasStockFor(q: Kilograms): boolean
    withdraw(q: Kilograms): Variety          // InsufficientStockError, jinak nová instance
    fillPercent(): number                     // 0–100, zaokrouhleno
    isSoldOut(): boolean
  }

  // order.ts
  export interface OrderItemProps {
    varietyId: number; varietyName: string; unitPrice: Money; quantity: Kilograms
  }
  export class OrderItem {
    static create(props: OrderItemProps): OrderItem
    readonly varietyId: number; readonly varietyName: string
    readonly unitPrice: Money; readonly quantity: Kilograms
    get lineTotal(): Money
  }
  export interface OrderCustomer {
    name: string; email: EmailAddress; phone: string; note: string
  }
  export interface OrderProps {
    id: number; code: string; publicToken: string; customer: OrderCustomer
    items: OrderItem[]; delivery: DeliveryMethod; payment: PaymentMethod
    status: OrderStatus; userId: number | null; createdAt: Date
  }
  export class Order {
    static readonly FREE_DELIVERY_THRESHOLD: Money   // 600 Kč
    static readonly DELIVERY_FEE: Money              // 60 Kč
    static deliveryFeeFor(delivery: DeliveryMethod, subtotal: Money): Money
    static rehydrate(props: OrderProps): Order
    readonly id: number; readonly code: string; readonly publicToken: string
    readonly customer: OrderCustomer; readonly items: readonly OrderItem[]
    readonly delivery: DeliveryMethod; readonly payment: PaymentMethod
    readonly status: OrderStatus; readonly userId: number | null; readonly createdAt: Date
    get subtotal(): Money
    get deliveryFee(): Money
    get total(): Money
    get totalKg(): Kilograms
    get itemsLabel(): string        // "Bernie 20 kg · Red Anna 5 kg"
    withStatus(next: OrderStatus): Order
  }

  // news-post.ts
  export interface NewsPostProps {
    id: number; title: string; body: string; tag: NewsTag
    imageUrl: string | null; publishedAt: Date; authorId: number | null
  }
  export class NewsPost { static rehydrate(p: NewsPostProps): NewsPost; /* readonly gettery */ }

  // field.ts
  export interface FieldProps {
    id: number; name: string; varietyName: string; areaM2: number
    status: FieldStatus; yieldKg: Kilograms; isEstimate: boolean; sortOrder: number
  }
  export class Field { static rehydrate(p: FieldProps): Field }

  // harvest-entry.ts
  export interface HarvestEntryProps { id: number; date: Date; dug: Kilograms; stock: Kilograms }
  export class HarvestEntry { static rehydrate(p: HarvestEntryProps): HarvestEntry }

  // storage-reading.ts
  export interface StorageReadingProps { id: number; recordedAt: Date; temperatureC: number; humidityPct: number }
  export class StorageReading { static rehydrate(p: StorageReadingProps): StorageReading }

  // user.ts
  export interface UserProps { id: number; email: EmailAddress; name: string; role: UserRole; passwordHash: string; createdAt: Date }
  export class User {
    static rehydrate(p: UserProps): User
    readonly id: number; readonly email: EmailAddress; readonly name: string
    readonly role: UserRole; readonly passwordHash: string; readonly createdAt: Date
    isFarmer(): boolean
  }
  ```

`rehydrate` místo `create` je záměr: identitu (`id`, `code`, `publicToken`) přiděluje databáze,
doména ji nevymýšlí. Nové objednávky proto skládá `ReserveOrder` z `OrderItem` a repozitář
vrátí hotový `Order` po insertu.

- [ ] **Step 1: Napsat padající test pro `Variety.withdraw`**

`tests/unit/domain/variety.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Variety } from '@/domain/entities/variety'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { HexColor } from '@/domain/value-objects/hex-color'
import { InsufficientStockError } from '@/domain/errors'

const bernie = (stockKg: number) =>
  Variety.rehydrate({
    id: 1, slug: 'bernie', name: 'Bernie', tag: 'lahůdková', description: 'Pevná žlutá dužnina.',
    color: HexColor.of('#c98a2b'), pricePerKg: Money.fromCzk(22),
    stock: Kilograms.of(stockKg), capacity: Kilograms.of(160), sortOrder: 0, isActive: true,
  })

describe('Variety', () => {
  it('odečte množství a vrátí novou instanci', () => {
    const before = bernie(10)
    const after = before.withdraw(Kilograms.of(2.5))
    expect(after.stock.value).toBe(7.5)
    expect(before.stock.value).toBe(10)
  })

  it('odmítne odběr nad stav skladu', () => {
    expect(() => bernie(2).withdraw(Kilograms.of(2.5))).toThrow(InsufficientStockError)
  })

  it('dovolí odebrat přesně celý sklad', () => {
    expect(bernie(2.5).withdraw(Kilograms.of(2.5)).stock.isZero()).toBe(true)
  })

  it('spočítá naplněnost zásobníku v procentech', () => {
    expect(bernie(80).fillPercent()).toBe(50)
    expect(bernie(0).fillPercent()).toBe(0)
  })

  it('označí vyprodanou odrůdu', () => {
    expect(bernie(0).isSoldOut()).toBe(true)
    expect(bernie(0.5).isSoldOut()).toBe(false)
  })
})
```

- [ ] **Step 2: Napsat padající test pro výpočty `Order`**

`tests/unit/domain/order.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { Order, OrderItem } from '@/domain/entities/order'
import { DeliveryMethod, OrderStatus, PaymentMethod } from '@/domain/enums'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'
import { EmailAddress } from '@/domain/value-objects/email-address'

const item = (name: string, czk: number, kg: number) =>
  OrderItem.create({ varietyId: 1, varietyName: name, unitPrice: Money.fromCzk(czk), quantity: Kilograms.of(kg) })

const order = (items: OrderItem[], delivery: DeliveryMethod) =>
  Order.rehydrate({
    id: 1, code: '#2610', publicToken: 't'.repeat(32),
    customer: { name: 'Jan Novák', email: EmailAddress.of('jan@email.cz'), phone: '', note: '' },
    items, delivery, payment: PaymentMethod.QR_CODE, status: OrderStatus.NEW,
    userId: null, createdAt: new Date('2026-09-10T18:00:00Z'),
  })

describe('Order', () => {
  it('sečte položky do mezisoučtu', () => {
    expect(order([item('Bernie', 22, 2.5), item('Marabel', 17, 7.5)], DeliveryMethod.PICKUP).subtotal.czk)
      .toBe(182.5)
  })

  it('u osobního odběru neúčtuje dopravu', () => {
    expect(order([item('Bernie', 22, 2.5)], DeliveryMethod.PICKUP).deliveryFee.czk).toBe(0)
  })

  it('u rozvozu účtuje 60 Kč do 600 Kč mezisoučtu', () => {
    expect(order([item('Bernie', 22, 2.5)], DeliveryMethod.LOCAL_DELIVERY).deliveryFee.czk).toBe(60)
  })

  it('u rozvozu je doprava zdarma nad 600 Kč mezisoučtu', () => {
    expect(order([item('Bernie', 22, 30)], DeliveryMethod.LOCAL_DELIVERY).deliveryFee.czk).toBe(0)
  })

  it('přesně na 600 Kč dopravu ještě účtuje', () => {
    // hranice je "nad 600", ne "od 600"
    expect(order([item('Marabel', 20, 30)], DeliveryMethod.LOCAL_DELIVERY).subtotal.czk).toBe(600)
    expect(order([item('Marabel', 20, 30)], DeliveryMethod.LOCAL_DELIVERY).deliveryFee.czk).toBe(60)
  })

  it('sečte celkovou hmotnost a složí popisek položek', () => {
    const o = order([item('Bernie', 22, 20), item('Red Anna', 19, 5)], DeliveryMethod.PICKUP)
    expect(o.totalKg.value).toBe(25)
    expect(o.itemsLabel).toBe('Bernie 20 kg · Red Anna 5 kg')
  })
})
```

- [ ] **Step 3: Spustit testy, ověřit, že padají**

Run: `npx vitest run tests/unit/domain`
Expected: FAIL — entity neexistují

- [ ] **Step 4: Implementovat entity**

`Variety.withdraw`:
```ts
withdraw(q: Kilograms): Variety {
  if (!this.hasStockFor(q)) {
    throw new InsufficientStockError(this.name, this.stock.value, q.value)
  }
  return Variety.rehydrate({ ...this.props, stock: this.stock.minus(q) })
}
hasStockFor(q: Kilograms): boolean { return this.stock.gte(q) }
fillPercent(): number {
  const cap = this.capacity.value
  if (cap <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((this.stock.value / cap) * 100)))
}
```

`Order.deliveryFeeFor`:
```ts
static readonly FREE_DELIVERY_THRESHOLD = Money.fromCzk(600)
static readonly DELIVERY_FEE = Money.fromCzk(60)

static deliveryFeeFor(delivery: DeliveryMethod, subtotal: Money): Money {
  if (delivery !== DeliveryMethod.LOCAL_DELIVERY) return Money.zero()
  return subtotal.gt(Order.FREE_DELIVERY_THRESHOLD) ? Money.zero() : Order.DELIVERY_FEE
}
```

`itemsLabel` formátuje množství přes `formatKg` ze `shared/format.ts` (`cs-CZ`, bez zbytečné
desetinné nuly): `this.items.map(i => `${i.varietyName} ${formatKg(i.quantity)}`).join(' · ')`.

- [ ] **Step 5: Spustit testy, ověřit průchod**

Run: `npx vitest run tests/unit/domain`
Expected: PASS

- [ ] **Step 6: Commit a push**

```bash
git add -A
git commit -m "feat(domain): entity odrudy, objednavky, novinky, pole a uzivatele"
git push
```

---

### Task 5: Doménové porty

**Files:**
- Create: `src/domain/ports/repositories.ts`, `src/domain/ports/unit-of-work.ts`, `src/domain/ports/services.ts`
- Create: `src/shared/result.ts`, `src/shared/logger.ts`, `src/shared/format.ts`
- Test: `tests/unit/shared/format.test.ts`

**Interfaces:**
- Consumes: entity a value objects z Tasků 3–4
- Produces:
  ```ts
  // repositories.ts
  export interface VarietyRepository {
    findAllActive(): Promise<Variety[]>
    findAll(): Promise<Variety[]>
    findById(id: number): Promise<Variety | null>
    lockForUpdate(ids: number[]): Promise<Variety[]>   // jen uvnitř transakce; řadí podle id
    save(variety: Variety): Promise<Variety>
    createNew(input: NewVarietyInput): Promise<Variety>
    deactivate(id: number): Promise<void>
  }
  export interface NewVarietyInput {
    slug: string; name: string; tag: string; description: string
    color: HexColor; pricePerKg: Money; stock: Kilograms; capacity: Kilograms
  }

  export interface NewOrderInput {
    customer: OrderCustomer; items: OrderItem[]
    delivery: DeliveryMethod; payment: PaymentMethod
    subtotal: Money; deliveryFee: Money; total: Money
    userId: number | null; publicToken: string; createdAt: Date
  }
  export interface OrderRepository {
    create(input: NewOrderInput): Promise<Order>       // přidělí id, dopočte a uloží code
    findByPublicToken(token: string): Promise<Order | null>
    findById(id: number): Promise<Order | null>
    listRecent(limit: number): Promise<Order[]>
    countByStatus(status: OrderStatus): Promise<number>
    updateStatus(id: number, status: OrderStatus): Promise<Order>
    reservedKgSince(since: Date): Promise<Kilograms>
    revenueSince(since: Date): Promise<Money>
  }

  export interface NewNewsPostInput {
    title: string; body: string; tag: NewsTag
    imageUrl: string | null; publishedAt: Date; authorId: number | null
  }
  export interface NewsRepository {
    listPublished(limit: number): Promise<NewsPost[]>
    create(input: NewNewsPostInput): Promise<NewsPost>
    delete(id: number): Promise<void>
  }

  export interface NewUserInput { email: EmailAddress; name: string; passwordHash: string; role: UserRole }
  export interface UserRepository {
    findByEmail(email: EmailAddress): Promise<User | null>
    findById(id: number): Promise<User | null>
    create(input: NewUserInput): Promise<User>
  }

  export interface FieldRepository { listAll(): Promise<Field[]> }
  export interface HarvestRepository { listRecent(days: number): Promise<HarvestEntry[]> }
  export interface StorageReadingRepository { latest(): Promise<StorageReading | null> }

  export interface RepositoryBundle {
    varieties: VarietyRepository
    orders: OrderRepository
    news: NewsRepository
    users: UserRepository
    fields: FieldRepository
    harvest: HarvestRepository
    storage: StorageReadingRepository
  }

  // unit-of-work.ts
  export interface UnitOfWork {
    readonly repos: RepositoryBundle                    // mimo transakci
    runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T>
  }

  // services.ts
  export interface MailMessage { to: string; subject: string; text: string }
  export interface Mailer { send(message: MailMessage): Promise<void> }
  export interface PasswordHasher { hash(plain: string): Promise<string>; verify(plain: string, hash: string): Promise<boolean> }
  export interface SessionPayload { userId: number; role: UserRole; name: string }
  export interface TokenService { sign(payload: SessionPayload): Promise<string>; verify(token: string): Promise<SessionPayload | null> }
  export interface Clock { now(): Date }
  export interface TokenGenerator { publicToken(): string }   // 24 náhodných bajtů base64url
  export interface Logger { info(msg: string, meta?: Record<string, unknown>): void; warn(...): void; error(...): void }
  ```

- [ ] **Step 1: Napsat padající test pro formátování**

`tests/unit/shared/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatCzk, formatKg, formatDateCs } from '@/shared/format'
import { Kilograms } from '@/domain/value-objects/kilograms'
import { Money } from '@/domain/value-objects/money'

describe('format', () => {
  it('formátuje kilogramy bez zbytečné nuly', () => {
    expect(formatKg(Kilograms.of(20))).toBe('20 kg')
    expect(formatKg(Kilograms.of(7.5))).toBe('7,5 kg')
  })

  it('formátuje koruny se zaokrouhlením a mezerou tisíců', () => {
    expect(formatCzk(Money.fromCzk(182.5))).toBe('183 Kč')
    expect(formatCzk(Money.fromCzk(6480))).toBe('6 480 Kč')
  })

  it('formátuje datum česky', () => {
    expect(formatDateCs(new Date('2026-09-09T12:00:00Z'))).toBe('9. září 2026')
  })
})
```

Pozn.: `Intl.NumberFormat('cs-CZ')` používá úzkou nedělitelnou mezeru (U+00A0). Test na
`'6 480 Kč'` musí obsahovat přesně ten znak — v implementaci proto oddělovač normalizuj
na obyčejnou nedělitelnou mezeru ` ` a v testu ji zapiš jako `'6 480 Kč'`.

- [ ] **Step 2: Spustit test, ověřit pád**

Run: `npx vitest run tests/unit/shared`
Expected: FAIL

- [ ] **Step 3: Implementovat `shared/format.ts`, `shared/logger.ts`, `shared/result.ts`**

```ts
// result.ts — hranice use-case → server action → UI
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E; readonly code?: string }
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E, code?: string): Result<never, E> =>
  code === undefined ? { ok: false, error } : { ok: false, error, code }
```

- [ ] **Step 4: Implementovat porty** — jen `interface` a `type`, žádná logika.

- [ ] **Step 5: Spustit testy a typecheck**

Run: `npx vitest run tests/unit && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit a push**

```bash
git add -A
git commit -m "feat(domain): porty repozitaru a sluzeb, sdilene utility"
git push
```

---

### Task 6: Prisma infrastruktura — klient, mappery, repozitáře, transakce

**Files:**
- Create: `src/infrastructure/persistence/prisma/client.ts`, `mappers.ts`, `repositories.ts`, `unit-of-work.ts`
- Modify: `src/app/api/health/route.ts` — přidat kontrolu databáze
- Test: `tests/integration/repositories.test.ts`, `tests/integration/helpers/db.ts`

**Interfaces:**
- Consumes: porty z Tasku 5, Prisma klient z Tasku 2
- Produces:
  - `prisma: PrismaClient` (singleton) z `client.ts`
  - `createRepositories(client: PrismaClient | Prisma.TransactionClient): RepositoryBundle`
  - `class PrismaUnitOfWork implements UnitOfWork`
  - mappery `toVariety`, `toOrder`, `toNewsPost`, `toField`, `toHarvestEntry`, `toStorageReading`, `toUser`

- [ ] **Step 1: Implementovat `client.ts` (singleton kvůli hot-reloadu)**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['warn', 'error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 2: Implementovat `unit-of-work.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client'
import type { RepositoryBundle } from '@/domain/ports/repositories'
import type { UnitOfWork } from '@/domain/ports/unit-of-work'
import { createRepositories } from './repositories'

export class PrismaUnitOfWork implements UnitOfWork {
  readonly repos: RepositoryBundle

  constructor(private readonly client: PrismaClient) {
    this.repos = createRepositories(client)
  }

  async runInTransaction<T>(work: (repos: RepositoryBundle) => Promise<T>): Promise<T> {
    return this.client.$transaction(
      async (tx: Prisma.TransactionClient) => work(createRepositories(tx)),
      { isolationLevel: 'ReadCommitted', timeout: 15_000 },
    )
  }
}
```

`ReadCommitted` je vědomá volba: výchozí `RepeatableRead` v MySQL by u `SELECT … FOR UPDATE`
vedl k tomu, že transakce po zámku čte starý snapshot z okamžiku svého začátku, a odečtení
skladu by pak vycházelo z neaktuální hodnoty. `ReadCommitted` po získání zámku přečte
aktuální řádek. To je nutná podmínka, aby race test v Tasku 12 prošel.

- [ ] **Step 3: Implementovat `lockForUpdate`**

Prisma nemá deklarativní `FOR UPDATE`; jde to jen přes raw dotaz. Zámek se drží do konce
transakce, takže po `$queryRaw` stačí data načíst normálně.

```ts
async lockForUpdate(ids: number[]): Promise<Variety[]> {
  if (ids.length === 0) return []
  const ordered = [...new Set(ids)].sort((a, b) => a - b)   // stabilní pořadí → bez deadlocku
  await this.client.$queryRaw`
    SELECT id FROM varieties WHERE id IN (${Prisma.join(ordered)}) ORDER BY id FOR UPDATE
  `
  const rows = await this.client.variety.findMany({ where: { id: { in: ordered } } })
  return rows.map(toVariety)
}
```

- [ ] **Step 4: Implementovat `OrderRepository.create` s bezpečným kódem**

```ts
async create(input: NewOrderInput): Promise<Order> {
  const created = await this.client.order.create({
    data: {
      code: `tmp-${input.publicToken.slice(0, 10)}`,   // dočasně unikátní, přepíše se níž
      publicToken: input.publicToken,
      customerName: input.customer.name,
      customerEmail: input.customer.email.value,
      customerPhone: input.customer.phone,
      note: input.customer.note,
      deliveryMethod: input.delivery,
      paymentMethod: input.payment,
      subtotalCzk: new Prisma.Decimal(input.subtotal.czk),
      deliveryFeeCzk: new Prisma.Decimal(input.deliveryFee.czk),
      totalCzk: new Prisma.Decimal(input.total.czk),
      userId: input.userId,
      createdAt: input.createdAt,
      items: {
        create: input.items.map((i) => ({
          varietyId: i.varietyId,
          varietyName: i.varietyName,
          unitPriceCzk: new Prisma.Decimal(i.unitPrice.czk),
          quantityKg: new Prisma.Decimal(i.quantity.value),
          lineTotalCzk: new Prisma.Decimal(i.lineTotal.czk),
        })),
      },
    },
    include: { items: true },
  })

  const withCode = await this.client.order.update({
    where: { id: created.id },
    data: { code: `#${ORDER_CODE_OFFSET + created.id}` },   // ORDER_CODE_OFFSET = 2609
    include: { items: true },
  })
  return toOrder(withCode)
}
```

Kód se odvozuje z auto-increment `id`, takže je unikátní bez ohledu na souběh. `COUNT(*)+1`
by dvěma souběžným transakcím vrátil stejné číslo.

- [ ] **Step 5: Test helper pro integrační testy**

`tests/integration/helpers/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'

export const testPrisma = new PrismaClient()

export async function resetDatabase(): Promise<void> {
  await testPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of [
    'order_items', 'orders', 'news_posts', 'varieties',
    'fields', 'harvest_entries', 'storage_readings', 'users',
  ]) {
    await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
  }
  await testPrisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1')
}
```

`TRUNCATE` resetuje i auto-increment, takže kódy objednávek začínají v každém testu od `#2610`.

- [ ] **Step 6: Napsat integrační test mapování**

`tests/integration/repositories.test.ts` — pro každý repozitář zapiš entitu, načti ji zpět
a porovnej hodnoty (zejména `Decimal` → `Money`/`Kilograms` tam a zpět, `#2610` kód,
`publicToken` unikátní, `RESTRICT` brání smazání odrůdy s objednávkou).

- [ ] **Step 7: Spustit integrační testy**

Run: `npm run test:integration`
Expected: PASS (vyžaduje běžící MySQL z Tasku 2)

- [ ] **Step 8: Rozšířit `/api/health` o kontrolu databáze**

```ts
import { prisma } from '@/infrastructure/persistence/prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', database: 'up' })
  } catch {
    return Response.json({ status: 'degraded', database: 'down' }, { status: 503 })
  }
}
```

Chybová větev vědomě nevrací detail výjimky — hlášky MySQL prozrazují hostname a jméno
uživatele a health endpoint je veřejný.

- [ ] **Step 9: Commit a push**

```bash
git add -A
git commit -m "feat(infra): Prisma repozitare, transakcni jednotka prace a health check DB"
git push
```

---

### Task 7: Seed databáze daty z prototypu

**Files:**
- Create: `prisma/seed.ts`
- Test: `tests/integration/seed.test.ts`

**Interfaces:**
- Consumes: Prisma klient (Task 2), `bcryptjs`
- Produces: `seed(prisma: PrismaClient, farmerPassword: string): Promise<void>` — idempotentní přes `upsert` podle přirozených klíčů (`varieties.slug`, `users.email`, `harvest_entries.date`)

- [ ] **Step 1: Napsat seed**

Data 1:1 z prototypu:
- **Odrůdy**: `bernie` (Bernie, „lahůdková, salátová, varný typ A“, `#c98a2b`, 22 Kč, 148/160 kg), `marabel` (Marabel, „polopozdní, varný typ AB“, `#8a9a3f`, 17 Kč, 132/170), `red-anna` (Red Anna, „červená slupka, varný typ B“, `#a9642e`, 19 Kč, 64/140), `agria` (Agria, „pozdní, varný typ B“, `#6f8f5a`, 16 Kč, 0/150). Popisy z prototypu doslova.
- **Novinky**: 3 kusy s daty 9. 9., 5. 9. a 1. 9. 2026, tagy `HARVEST`, `STORAGE`, `FIELD`.
- **Pole**: 5 řádků (Záhon za stodolou / u lesa / Nad potokem / Dolní díl / Kamenec) se stavy `HARVESTED`, `HARVESTED`, `HARVESTING`, `GROWING`, `GROWING`; poslední dva mají `isEstimate: true`.
- **Historie výkopu**: 14 dní od 27. 8. do 9. 9. 2026 s dvojicemi `dug`/`stock` z prototypu.
- **Skladové čidlo**: jeden záznam 6,0 °C / 92 %.
- **Objednávky**: 3 historické (`#2607`–`#2609`) se stavy `COLLECTED`, `READY`, `NEW`.
- **Farmář**: `farma@silentagro.cz`, jméno „Farmář Milan“, role `FARMER`.

```ts
const password = process.env.SEED_FARMER_PASSWORD
if (!password || password.length < 8) {
  throw new Error(
    'SEED_FARMER_PASSWORD musí být nastavené a mít alespoň 8 znaků. ' +
    'Do repozitáře se žádné výchozí heslo nezapisuje.',
  )
}
```

Objednávky se sázejí přímo s `code` `#2607`–`#2609` a auto-increment se posune tak, aby
první objednávka z aplikace dostala `#2610` — po vložení tří řádků má poslední `id = 3`
a `ORDER_CODE_OFFSET + 4 = 2613`. Aby kódy navazovaly, seed vloží objednávky s explicitními
`id` 1–3 a kódy se dopočtou stejným vzorcem `#${2609 + id}`. Tím sedí seed i běh aplikace
na jednom pravidle a nikde není druhá definice.

- [ ] **Step 2: Napsat integrační test idempotence**

```ts
it('dvojí spuštění seedu nevytvoří duplicity', async () => {
  await seed(testPrisma, 'testovaci-heslo')
  await seed(testPrisma, 'testovaci-heslo')
  expect(await testPrisma.variety.count()).toBe(4)
  expect(await testPrisma.user.count()).toBe(1)
  expect(await testPrisma.harvestEntry.count()).toBe(14)
})

it('bez SEED_FARMER_PASSWORD skončí chybou', async () => {
  await expect(seed(testPrisma, '')).rejects.toThrow(/SEED_FARMER_PASSWORD/)
})
```

- [ ] **Step 3: Spustit seed a ověřit v databázi**

Run: `SEED_FARMER_PASSWORD=brambory123 npm run db:seed && npm run test:integration`
Expected: PASS

- [ ] **Step 4: Commit a push**

```bash
git add -A
git commit -m "feat(db): idempotentni seed daty z prototypu"
git push
```

---

### Task 8: Autentizační infrastruktura

**Files:**
- Create: `src/infrastructure/auth/bcrypt-password-hasher.ts`, `jose-token-service.ts`, `session.ts`, `edge-session.ts`
- Test: `tests/unit/auth/jose-token-service.test.ts`, `tests/unit/auth/bcrypt-password-hasher.test.ts`

**Interfaces:**
- Consumes: `PasswordHasher`, `TokenService`, `SessionPayload` z Tasku 5; `env` z Tasku 1
- Produces:
  ```ts
  export class BcryptPasswordHasher implements PasswordHasher   // cost 12
  export class JoseTokenService implements TokenService {
    constructor(secret: string, ttlSeconds = 7 * 24 * 3600)
  }
  // session.ts — server-only (Node runtime)
  export const SESSION_COOKIE = 'silentagro_session'
  export async function readSession(): Promise<SessionPayload | null>
  export async function writeSession(payload: SessionPayload): Promise<void>
  export async function clearSession(): Promise<void>
  export async function requireFarmer(): Promise<SessionPayload>   // ForbiddenError, jinak payload
  // edge-session.ts — Edge-safe, jen ověření
  export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null>
  ```

- [ ] **Step 1: Napsat padající test pro tokeny**

```ts
import { describe, expect, it } from 'vitest'
import { JoseTokenService } from '@/infrastructure/auth/jose-token-service'
import { UserRole } from '@/domain/enums'

const secret = 'x'.repeat(32)
const payload = { userId: 7, role: UserRole.FARMER, name: 'Farmář Milan' }

describe('JoseTokenService', () => {
  it('podepíše a ověří token', async () => {
    const svc = new JoseTokenService(secret)
    expect(await svc.verify(await svc.sign(payload))).toEqual(payload)
  })

  it('odmítne token podepsaný jiným tajemstvím', async () => {
    const token = await new JoseTokenService(secret).sign(payload)
    expect(await new JoseTokenService('y'.repeat(32)).verify(token)).toBeNull()
  })

  it('odmítne prošlý token', async () => {
    const svc = new JoseTokenService(secret, -1)
    expect(await svc.verify(await svc.sign(payload))).toBeNull()
  })

  it('odmítne nesmysl místo tokenu', async () => {
    expect(await new JoseTokenService(secret).verify('rozbite')).toBeNull()
  })

  it('odmítne token s algoritmem none', async () => {
    const forged = `${btoa('{"alg":"none"}')}.${btoa(JSON.stringify(payload))}.`
    expect(await new JoseTokenService(secret).verify(forged)).toBeNull()
  })
})
```

Poslední test je podstatný: `jwtVerify` se volá s `{ algorithms: ['HS256'] }`, jinak by
knihovna přijala token, který si algoritmus určí sám.

- [ ] **Step 2: Spustit test, ověřit pád**

Run: `npx vitest run tests/unit/auth`
Expected: FAIL

- [ ] **Step 3: Implementovat `JoseTokenService`**

```ts
import { SignJWT, jwtVerify } from 'jose'
import type { SessionPayload, TokenService } from '@/domain/ports/services'

export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array
  constructor(secret: string, private readonly ttlSeconds = 7 * 24 * 3600) {
    this.key = new TextEncoder().encode(secret)
  }

  async sign(payload: SessionPayload): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    return new SignJWT({ role: payload.role, name: payload.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(payload.userId))
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.key)
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] })
      const userId = Number(payload.sub)
      if (!Number.isInteger(userId)) return null
      return { userId, role: payload.role as UserRole, name: String(payload.name ?? '') }
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Implementovat cookie helpery**

```ts
export const SESSION_COOKIE = 'silentagro_session'

export async function writeSession(payload: SessionPayload): Promise<void> {
  const token = await tokenService().sign(payload)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  })
}
```

- [ ] **Step 5: Test hashování hesla**

```ts
it('ověří správné heslo a odmítne špatné', async () => {
  const h = new BcryptPasswordHasher()
  const hash = await h.hash('brambory')
  expect(hash).not.toContain('brambory')
  expect(await h.verify('brambory', hash)).toBe(true)
  expect(await h.verify('mrkev', hash)).toBe(false)
})
```

- [ ] **Step 6: Spustit testy**

Run: `npx vitest run tests/unit/auth`
Expected: PASS

- [ ] **Step 7: Commit a push**

```bash
git add -A
git commit -m "feat(auth): hashovani hesel bcrypt a JWT session pres jose"
git push
```

---

### Task 9: Mailová infrastruktura

**Files:**
- Create: `src/infrastructure/mail/nodemailer-mailer.ts`, `src/infrastructure/mail/templates.ts`
- Test: `tests/unit/mail/templates.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `MailMessage` z Tasku 5; `Order` z Tasku 4; `env` z Tasku 1
- Produces:
  ```ts
  export class NodemailerMailer implements Mailer {
    constructor(config: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string })
  }
  export function renderCustomerConfirmation(order: Order, publicUrl: string): MailMessage
  export function renderFarmerNotification(order: Order, farmerEmail: string, adminUrl: string): MailMessage
  ```

- [ ] **Step 1: Napsat padající test šablon**

```ts
it('e-mail zákazníkovi obsahuje kód, položky, částku a odkaz', () => {
  const mail = renderCustomerConfirmation(sampleOrder, 'https://silentagro.cz/rezervace/abc123')
  expect(mail.to).toBe('jan@email.cz')
  expect(mail.subject).toBe('Potvrzení rezervace #2610 — SilentAgro')
  expect(mail.text).toContain('Bernie 2,5 kg')
  expect(mail.text).toContain('55 Kč')
  expect(mail.text).toContain('https://silentagro.cz/rezervace/abc123')
  expect(mail.text).toContain('Zboží držíme 5 dní')
})

it('e-mail farmáři jde na adresu farmy a nese poznámku zákazníka', () => {
  const mail = renderFarmerNotification(sampleOrder, 'farma@silentagro.cz', 'https://silentagro.cz/admin/objednavky')
  expect(mail.to).toBe('farma@silentagro.cz')
  expect(mail.subject).toBe('Nová rezervace #2610 (2,5 kg)')
  expect(mail.text).toContain('jan@email.cz')
  expect(mail.text).toContain('Přijedu v sobotu')
})

it('prázdná poznámka se vypíše jako pomlčka', () => {
  const mail = renderFarmerNotification(orderWithoutNote, 'farma@silentagro.cz', '#')
  expect(mail.text).toContain('Poznámka: —')
})
```

Texty vycházejí doslova z prototypu (`emails` v `renderVals`), jen doplněné o odkaz
na potvrzení, který prototyp neměl.

- [ ] **Step 2: Spustit, ověřit pád; implementovat šablony; spustit znovu**

Run: `npx vitest run tests/unit/mail`
Expected: nejdřív FAIL, po implementaci PASS

- [ ] **Step 3: Implementovat `NodemailerMailer`**

Transport se vytváří jednou v konstruktoru. Autentizace se předá jen tehdy, když je
`user` neprázdný — Mailpit ve vývoji žádnou nechce a prázdné `auth` by spojení shodilo.

```ts
this.transport = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.secure,
  ...(config.user ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
})
```

- [ ] **Step 4: Commit a push**

```bash
git add -A
git commit -m "feat(mail): SMTP odesilatel a sablony potvrzeni objednavky"
git push
```

---

### Task 10: Composition root

**Files:**
- Create: `src/infrastructure/di/container.ts`
- Create: `src/infrastructure/rate-limit/token-bucket.ts`
- Test: `tests/unit/rate-limit/token-bucket.test.ts`

**Interfaces:**
- Consumes: vše z Tasků 5–9
- Produces:
  ```ts
  export interface Container {
    uow: UnitOfWork
    mailer: Mailer
    hasher: PasswordHasher
    tokens: TokenService
    clock: Clock
    tokenGenerator: TokenGenerator
    logger: Logger
    config: { farmerEmail: string; publicBaseUrl: string }
  }
  export function getContainer(): Container       // líný singleton
  export class TokenBucket {
    constructor(capacity: number, refillPerSecond: number, clock: Clock)
    tryConsume(key: string, cost?: number): boolean
  }
  export const loginLimiter: TokenBucket          // 5 pokusů / 15 min na IP
  export const orderLimiter: TokenBucket          // 10 objednávek / hod na IP
  ```

- [ ] **Step 1: Napsat padající test token bucketu**

```ts
it('propustí do kapacity a pak odmítne', () => {
  const clock = { now: () => new Date('2026-09-10T10:00:00Z') }
  const bucket = new TokenBucket(3, 1 / 60, clock)
  expect([1, 2, 3].map(() => bucket.tryConsume('1.2.3.4'))).toEqual([true, true, true])
  expect(bucket.tryConsume('1.2.3.4')).toBe(false)
})

it('doplní tokeny s časem', () => {
  let t = new Date('2026-09-10T10:00:00Z')
  const bucket = new TokenBucket(1, 1 / 60, { now: () => t })
  expect(bucket.tryConsume('a')).toBe(true)
  expect(bucket.tryConsume('a')).toBe(false)
  t = new Date('2026-09-10T10:01:00Z')
  expect(bucket.tryConsume('a')).toBe(true)
})

it('drží klíče odděleně', () => {
  const bucket = new TokenBucket(1, 0, { now: () => new Date('2026-09-10T10:00:00Z') })
  expect(bucket.tryConsume('a')).toBe(true)
  expect(bucket.tryConsume('b')).toBe(true)
})
```

`TokenBucket` bere `Clock` jako závislost právě proto, aby šel takhle testovat bez čekání.

- [ ] **Step 2: Implementovat bucket a kontejner; spustit testy**

Kontejner drží stav v `globalThis`, aby hot-reload ve vývoji nezakládal nové SMTP spojení
při každé změně souboru. Mapa v `TokenBucket` se čistí líně — při každém `tryConsume`
se zahodí záznamy starší než `capacity / refillPerSecond`, jinak by rostla bez omezení.

Run: `npx vitest run tests/unit/rate-limit`
Expected: PASS

- [ ] **Step 3: Commit a push**

```bash
git add -A
git commit -m "feat(infra): composition root a token bucket pro rate limit"
git push
```

---

### Task 11: Čtecí use-cases

**Files:**
- Create: `src/application/dto.ts`
- Create: `src/application/use-cases/list-varieties.ts`, `get-stock-overview.ts`, `list-news.ts`, `get-order-by-token.ts`
- Test: `tests/unit/application/get-stock-overview.test.ts`, `tests/unit/application/fakes.ts`

**Interfaces:**
- Consumes: porty (Task 5), entity (Task 4)
- Produces:
  ```ts
  export interface VarietyView {
    id: number; slug: string; name: string; tag: string; description: string
    colorHex: string; priceCzk: number; priceLabel: string
    stockKg: number; stockLabel: string; fillPercent: number
    available: boolean
  }
  export interface BinView { name: string; colorHex: string; percent: number; percentLabel: string; kgLabel: string }
  export interface KpiView { label: string; value: string; delta: string; tone: 'green' | 'muted' }
  export interface HarvestPointView { dateLabel: string; dugKg: number; stockKg: number }
  export interface FieldView { name: string; varietyName: string; areaLabel: string; status: FieldStatus; statusLabel: string; yieldLabel: string }
  export interface StockOverview {
    totalKg: number; totalKgLabel: string
    bins: BinView[]; kpis: KpiView[]
    harvest: HarvestPointView[]; fields: FieldView[]
    updatedAtLabel: string
  }
  export interface NewsView { id: number; title: string; body: string; tag: NewsTag; tagLabel: string; dateLabel: string; imageUrl: string | null }
  export interface OrderView {
    code: string; totalKgLabel: string; totalLabel: string; customerEmail: string
    itemsLabel: string; deliveryLabel: string; paymentLabel: string
    customerMail: { kind: string; to: string; subject: string; body: string }
    farmerMail: { kind: string; to: string; subject: string; body: string }
  }

  export class ListVarieties { constructor(deps: { uow: UnitOfWork }); execute(): Promise<VarietyView[]> }
  export class GetStockOverview { constructor(deps: { uow: UnitOfWork; clock: Clock }); execute(): Promise<StockOverview> }
  export class ListNews { constructor(deps: { uow: UnitOfWork }); execute(limit?: number): Promise<NewsView[]> }
  export class GetOrderByToken { constructor(deps: { uow: UnitOfWork; config: { farmerEmail: string; publicBaseUrl: string } }); execute(token: string): Promise<OrderView> }
  ```

Use-case vrací **view model**, ne entitu. Důvod: stránky jsou server komponenty a entita
s metodami by se nedala poslat přes hranici serializace do klientských komponent.
Formátování (`priceLabel`, `stockLabel`) proto probíhá na serveru, jednou, ve `shared/format.ts`.

- [ ] **Step 1: Napsat in-memory fakes**

`tests/unit/application/fakes.ts` — `InMemoryVarietyRepository`, `InMemoryOrderRepository`,
`InMemoryNewsRepository`, `InMemoryUserRepository`, `InMemoryFieldRepository`,
`InMemoryHarvestRepository`, `InMemoryStorageReadingRepository`, `FakeUnitOfWork`
(`runInTransaction` prostě zavolá `work(this.repos)`), `FakeMailer` (sbírá zprávy do pole),
`FakeClock` (fixní datum), `FakeTokenGenerator` (vrací předvídatelné tokeny `token-1`, `token-2`, …).

`FakeUnitOfWork` **nesmí** simulovat rollback — testy, které rollback ověřují, patří
do integrace (Task 12, krok s race testem). Unit testy ověřují rozhodovací logiku.

- [ ] **Step 2: Napsat padající test `GetStockOverview`**

```ts
it('sečte sklad napříč odrůdami a složí zásobníky', async () => {
  const uow = fakeUow({ varieties: [bernie(148, 160), marabel(132, 170), agria(0, 150)] })
  const view = await new GetStockOverview({ uow, clock }).execute()
  expect(view.totalKg).toBe(280)
  expect(view.totalKgLabel).toBe('280')
  expect(view.bins.map((b) => b.percent)).toEqual([87, 78, 0])
})

it('při nulové kapacitě nevydělí nulou', async () => {
  const uow = fakeUow({ varieties: [bernie(0, 0)] })
  const view = await new GetStockOverview({ uow, clock }).execute()
  expect(view.bins[0]?.percent).toBe(0)
})
```

Procenta zásobníků se počítají proti **největší kapacitě mezi odrůdami**, ne proti vlastní
kapacitě — přesně jako prototyp (`maxCap`), aby byly sloupce vzájemně porovnatelné.
V `VarietyView.fillPercent` (burza) se naopak počítá proti **vlastní** kapacitě, protože
tam jde o naplněnost jedné odrůdy. Dvě různá procenta, dvě různé otázky — nezaměňovat.

- [ ] **Step 3: Spustit, ověřit pád, implementovat, spustit znovu**

Run: `npx vitest run tests/unit/application`
Expected: nejdřív FAIL, po implementaci PASS

- [ ] **Step 4: Commit a push**

```bash
git add -A
git commit -m "feat(app): ctecі use-cases pro burzu, sklad, novinky a potvrzeni"
git push
```

---

### Task 12: ReserveOrder — kritický tok

**Files:**
- Create: `src/application/use-cases/reserve-order.ts`
- Test: `tests/unit/application/reserve-order.test.ts`, `tests/integration/reserve-order.test.ts`

**Interfaces:**
- Consumes: `UnitOfWork`, `Mailer`, `Clock`, `TokenGenerator`, `Logger` (Task 5); `Order`, `OrderItem`, `Variety` (Task 4); šablony (Task 9)
- Produces:
  ```ts
  export interface ReserveOrderInput {
    customer: { name: string; email: string; phone: string; note: string }
    delivery: DeliveryMethod
    payment: PaymentMethod
    items: ReadonlyArray<{ varietyId: number; quantityKg: number }>
    userId: number | null
  }
  export interface ReserveOrderResult { code: string; publicToken: string }
  export class ReserveOrder {
    constructor(deps: {
      uow: UnitOfWork; mailer: Mailer; clock: Clock
      tokenGenerator: TokenGenerator; logger: Logger
      config: { farmerEmail: string; publicBaseUrl: string }
    })
    execute(input: ReserveOrderInput): Promise<ReserveOrderResult>
  }
  ```

- [ ] **Step 1: Napsat padající unit testy**

```ts
import { describe, expect, it } from 'vitest'
import { ReserveOrder } from '@/application/use-cases/reserve-order'
import { DeliveryMethod, PaymentMethod } from '@/domain/enums'
import { InsufficientStockError, ValidationError } from '@/domain/errors'

const customer = { name: 'Jan Novák', email: 'jan@email.cz', phone: '+420777123456', note: '' }

describe('ReserveOrder', () => {
  it('odečte sklad, uloží objednávku a odešle dva e-maily', async () => {
    const ctx = makeContext({ varieties: [bernie(10, 160, 22)] })
    const result = await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.QR_CODE,
      items: [{ varietyId: 1, quantityKg: 2.5 }], userId: null,
    })

    expect(result.code).toBe('#2610')
    expect(ctx.varieties.get(1)?.stock.value).toBe(7.5)
    expect(ctx.mailer.sent).toHaveLength(2)
    expect(ctx.mailer.sent[0]?.to).toBe('jan@email.cz')
    expect(ctx.mailer.sent[1]?.to).toBe('farma@silentagro.cz')
  })

  it('odmítne objednávku nad stav skladu a sklad nezmění', async () => {
    const ctx = makeContext({ varieties: [bernie(2, 160, 22)] })
    await expect(ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [{ varietyId: 1, quantityKg: 2.5 }], userId: null,
    })).rejects.toThrow(InsufficientStockError)
    expect(ctx.varieties.get(1)?.stock.value).toBe(2)
    expect(ctx.mailer.sent).toHaveLength(0)
  })

  it('ignoruje cenu poslanou klientem a použije cenu ze skladu', async () => {
    const ctx = makeContext({ varieties: [bernie(10, 160, 22)] })
    // vstup vůbec neobsahuje cenu — kontrolujeme, že výsledek sedí na 22 Kč/kg
    await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [{ varietyId: 1, quantityKg: 2 }], userId: null,
    })
    expect(ctx.orders.last()?.total.czk).toBe(44)
  })

  it('účtuje rozvoz 60 Kč a nad 600 Kč zdarma', async () => {
    const ctx = makeContext({ varieties: [bernie(100, 160, 22)] })
    await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.LOCAL_DELIVERY, payment: PaymentMethod.BANK_TRANSFER,
      items: [{ varietyId: 1, quantityKg: 2 }], userId: null,
    })
    expect(ctx.orders.last()?.total.czk).toBe(104)

    await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.LOCAL_DELIVERY, payment: PaymentMethod.BANK_TRANSFER,
      items: [{ varietyId: 1, quantityKg: 40 }], userId: null,
    })
    expect(ctx.orders.last()?.total.czk).toBe(880)
  })

  it('sloučí dva řádky se stejnou odrůdou', async () => {
    const ctx = makeContext({ varieties: [bernie(10, 160, 22)] })
    await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [{ varietyId: 1, quantityKg: 1 }, { varietyId: 1, quantityKg: 1.5 }], userId: null,
    })
    expect(ctx.orders.last()?.items).toHaveLength(1)
    expect(ctx.varieties.get(1)?.stock.value).toBe(7.5)
  })

  it('odmítne prázdný košík', async () => {
    const ctx = makeContext({ varieties: [bernie(10, 160, 22)] })
    await expect(ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [], userId: null,
    })).rejects.toThrow(ValidationError)
  })

  it('odmítne neaktivní odrůdu', async () => {
    const ctx = makeContext({ varieties: [inactive(1, 10)] })
    await expect(ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [{ varietyId: 1, quantityKg: 1 }], userId: null,
    })).rejects.toThrow(/není v nabídce/)
  })

  it('selhání odesílání e-mailu objednávku nezruší', async () => {
    const ctx = makeContext({ varieties: [bernie(10, 160, 22)], mailerFails: true })
    const result = await ctx.useCase.execute({
      customer, delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
      items: [{ varietyId: 1, quantityKg: 1 }], userId: null,
    })
    expect(result.code).toBe('#2610')
    expect(ctx.varieties.get(1)?.stock.value).toBe(9)
    expect(ctx.logger.errors).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Spustit, ověřit pád**

Run: `npx vitest run tests/unit/application/reserve-order.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Implementovat `ReserveOrder`**

```ts
export class ReserveOrder {
  constructor(private readonly deps: ReserveOrderDeps) {}

  async execute(input: ReserveOrderInput): Promise<ReserveOrderResult> {
    const customer = {
      name: input.customer.name.trim(),
      email: EmailAddress.of(input.customer.email),
      phone: input.customer.phone.trim(),
      note: input.customer.note.trim(),
    }
    if (customer.name.length === 0) throw new ValidationError('Vyplňte prosím jméno')

    // sloučení řádků se stejnou odrůdou; klient může poslat duplicity
    const merged = new Map<number, Kilograms>()
    for (const line of input.items) {
      const qty = Kilograms.of(line.quantityKg)
      if (qty.isZero()) continue
      merged.set(line.varietyId, (merged.get(line.varietyId) ?? Kilograms.zero()).plus(qty))
    }
    if (merged.size === 0) throw new ValidationError('Košík je prázdný')

    const order = await this.deps.uow.runInTransaction(async (repos) => {
      const ids = [...merged.keys()]
      const locked = await repos.varieties.lockForUpdate(ids)
      const byId = new Map(locked.map((v) => [v.id, v]))

      const items: OrderItem[] = []
      for (const [varietyId, quantity] of merged) {
        const variety = byId.get(varietyId)
        if (!variety || !variety.isActive) {
          throw new ValidationError('Jedna z odrůd už není v nabídce')
        }
        const withdrawn = variety.withdraw(quantity)   // vyhodí InsufficientStockError
        await repos.varieties.save(withdrawn)
        items.push(OrderItem.create({
          varietyId: variety.id,
          varietyName: variety.name,
          unitPrice: variety.pricePerKg,               // cena ze serveru, ne z klienta
          quantity,
        }))
      }

      const subtotal = items.reduce((acc, i) => acc.plus(i.lineTotal), Money.zero())
      const deliveryFee = Order.deliveryFeeFor(input.delivery, subtotal)

      return repos.orders.create({
        customer, items,
        delivery: input.delivery, payment: input.payment,
        subtotal, deliveryFee, total: subtotal.plus(deliveryFee),
        userId: input.userId,
        publicToken: this.deps.tokenGenerator.publicToken(),
        createdAt: this.deps.clock.now(),
      })
    })

    // až po commitu; mail je notifikace, sklad je pravda
    await this.notify(order)

    return { code: order.code, publicToken: order.publicToken }
  }

  private async notify(order: Order): Promise<void> {
    const { publicBaseUrl, farmerEmail } = this.deps.config
    try {
      await this.deps.mailer.send(
        renderCustomerConfirmation(order, `${publicBaseUrl}/rezervace/${order.publicToken}`),
      )
      await this.deps.mailer.send(
        renderFarmerNotification(order, farmerEmail, `${publicBaseUrl}/admin/objednavky`),
      )
    } catch (error) {
      this.deps.logger.error('Odeslání potvrzení selhalo, objednávka zůstává platná', {
        orderCode: order.code,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
```

- [ ] **Step 4: Spustit unit testy**

Run: `npx vitest run tests/unit/application/reserve-order.test.ts`
Expected: PASS (8 testů)

- [ ] **Step 5: Napsat integrační race test**

`tests/integration/reserve-order.test.ts`:
```ts
it('dvě souběžné rezervace na poslední kilogram: uspěje právě jedna', async () => {
  await resetDatabase()
  await seedSingleVariety({ stockKg: 1, priceCzk: 20 })

  const useCase = makeReserveOrder()   // proti reálné PrismaUnitOfWork
  const attempt = () => useCase.execute({
    customer: { name: 'Jan', email: 'jan@email.cz', phone: '', note: '' },
    delivery: DeliveryMethod.PICKUP, payment: PaymentMethod.CASH,
    items: [{ varietyId: 1, quantityKg: 1 }], userId: null,
  })

  const results = await Promise.allSettled([attempt(), attempt()])
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  expect(fulfilled).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError)

  const variety = await testPrisma.variety.findUniqueOrThrow({ where: { id: 1 } })
  expect(Number(variety.stockKg)).toBe(0)
  expect(await testPrisma.order.count()).toBe(1)
})

it('objednávky dostávají navazující kódy', async () => {
  await resetDatabase()
  await seedSingleVariety({ stockKg: 100, priceCzk: 20 })
  const useCase = makeReserveOrder()
  const first = await useCase.execute(order1)
  const second = await useCase.execute(order2)
  expect([first.code, second.code]).toEqual(['#2610', '#2611'])
})

it('neúspěšná objednávka nezanechá řádek ani neodečte sklad', async () => {
  await resetDatabase()
  await seedSingleVariety({ stockKg: 1, priceCzk: 20 })
  const useCase = makeReserveOrder()
  await expect(useCase.execute({ ...base, items: [{ varietyId: 1, quantityKg: 5 }] }))
    .rejects.toThrow(InsufficientStockError)
  expect(await testPrisma.order.count()).toBe(0)
  expect(Number((await testPrisma.variety.findUniqueOrThrow({ where: { id: 1 } })).stockKg)).toBe(1)
})
```

Tenhle test je hlavní důvod, proč `UnitOfWork` existuje. Kdyby se sklad odečítal mimo
transakci nebo bez `FOR UPDATE`, obě rezervace projdou a sklad spadne do mínusu.

- [ ] **Step 6: Spustit integrační testy**

Run: `npm run test:integration`
Expected: PASS

- [ ] **Step 7: Commit a push**

```bash
git add -A
git commit -m "feat(app): rezervace objednavky s transakcnim odectem skladu"
git push
```

---

### Task 13: Autentizační use-cases

**Files:**
- Create: `src/application/use-cases/register-user.ts`, `login-user.ts`
- Test: `tests/unit/application/auth.test.ts`

**Interfaces:**
- Consumes: `UserRepository`, `PasswordHasher`, `UnitOfWork` (Task 5); `User` (Task 4)
- Produces:
  ```ts
  export interface AuthResult { userId: number; name: string; email: string; role: UserRole }
  export class RegisterUser {
    constructor(deps: { uow: UnitOfWork; hasher: PasswordHasher })
    execute(input: { name: string; email: string; password: string }): Promise<AuthResult>
  }
  export class LoginUser {
    constructor(deps: { uow: UnitOfWork; hasher: PasswordHasher })
    execute(input: { email: string; password: string }): Promise<AuthResult>
  }
  ```

- [ ] **Step 1: Napsat padající testy**

```ts
describe('RegisterUser', () => {
  it('založí zákazníka s hashovaným heslem', async () => {
    const ctx = makeAuthContext()
    const result = await ctx.register.execute({ name: 'Jan Novák', email: 'JAN@Email.cz ', password: 'tajneheslo' })
    expect(result.role).toBe(UserRole.CUSTOMER)
    expect(result.email).toBe('jan@email.cz')          // normalizace na malá písmena a trim
    expect(ctx.users.last()?.passwordHash).not.toBe('tajneheslo')
  })

  it('odmítne krátké heslo', async () => {
    await expect(makeAuthContext().register.execute({ name: 'X', email: 'x@y.cz', password: 'krat' }))
      .rejects.toThrow(/alespoň 8 znaků/)
  })

  it('odmítne již registrovaný e-mail', async () => {
    const ctx = makeAuthContext({ existing: [{ email: 'jan@email.cz' }] })
    await expect(ctx.register.execute({ name: 'Jan', email: 'jan@email.cz', password: 'tajneheslo' }))
      .rejects.toThrow(ConflictError)
  })

  it('registrací nelze získat roli farmáře', async () => {
    const ctx = makeAuthContext()
    const result = await ctx.register.execute({
      name: 'Podvodník', email: 'farmar@utok.cz', password: 'tajneheslo',
      // i kdyby server action předala role, use-case ji nepřijímá — typ ji nemá
    } as never)
    expect(result.role).toBe(UserRole.CUSTOMER)
  })
})

describe('LoginUser', () => {
  it('přihlásí při správném heslu', async () => {
    const ctx = makeAuthContext({ existing: [{ email: 'farma@silentagro.cz', password: 'brambory', role: UserRole.FARMER }] })
    expect((await ctx.login.execute({ email: 'farma@silentagro.cz', password: 'brambory' })).role)
      .toBe(UserRole.FARMER)
  })

  it('u špatného hesla i neznámého e-mailu hlásí totéž', async () => {
    const ctx = makeAuthContext({ existing: [{ email: 'jan@email.cz', password: 'spravne' }] })
    const wrongPassword = await ctx.login.execute({ email: 'jan@email.cz', password: 'spatne' }).catch((e) => e)
    const unknownEmail = await ctx.login.execute({ email: 'nikdo@email.cz', password: 'spravne' }).catch((e) => e)
    expect(wrongPassword.message).toBe(unknownEmail.message)
    expect(wrongPassword.message).toBe('Nesprávný e-mail nebo heslo')
  })

  it('u neznámého e-mailu stejně provede ověření hesla', async () => {
    const ctx = makeAuthContext()
    await ctx.login.execute({ email: 'nikdo@email.cz', password: 'cokoliv' }).catch(() => {})
    expect(ctx.hasher.verifyCalls).toBe(1)
  })
})
```

Poslední dva testy chrání proti dvěma reálným únikům: shodná hláška brání vyjmenování
registrovaných e-mailů, a ověření proti pevnému „dummy“ hashi i pro neexistujícího
uživatele srovnává dobu odpovědi, aby útočník nepoznal existující účet podle rychlosti.

- [ ] **Step 2: Spustit, ověřit pád, implementovat, spustit znovu**

`LoginUser` při nenalezeném uživateli zavolá `hasher.verify(password, DUMMY_HASH)`
a výsledek zahodí. `DUMMY_HASH` je konstanta — bcrypt hash řetězce, který nikdo nepoužívá.

Run: `npx vitest run tests/unit/application/auth.test.ts`
Expected: PASS

- [ ] **Step 3: Commit a push**

```bash
git add -A
git commit -m "feat(app): registrace a prihlaseni uzivatele"
git push
```

---

### Task 14: Administrační use-cases

**Files:**
- Create: `src/application/use-cases/list-orders.ts`, `advance-order-status.ts`, `upsert-variety.ts`, `deactivate-variety.ts`, `publish-news.ts`, `delete-news.ts`, `get-admin-overview.ts`
- Test: `tests/unit/application/admin.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface OrderRowView {
    id: number; code: string; customerName: string; customerEmail: string
    itemsLabel: string; deliveryLabel: string; paymentLabel: string
    totalLabel: string; status: OrderStatus; statusLabel: string
  }
  export interface AdminOverview { kpis: KpiView[]; bins: BinView[]; harvest: HarvestPointView[]; harvestSummary: string; harvestLast: string }
  export interface UpsertVarietyInput {
    id: number | null; name: string; tag: string; description: string
    colorHex: string; priceCzk: number; stockKg: number; capacityKg: number
  }

  export class ListOrders { constructor(deps: { uow: UnitOfWork }); execute(limit?: number): Promise<OrderRowView[]> }
  export class AdvanceOrderStatus { constructor(deps: { uow: UnitOfWork }); execute(orderId: number): Promise<OrderStatus> }
  export class UpsertVariety { constructor(deps: { uow: UnitOfWork }); execute(input: UpsertVarietyInput): Promise<VarietyView> }
  export class DeactivateVariety { constructor(deps: { uow: UnitOfWork }); execute(id: number): Promise<void> }
  export class PublishNews { constructor(deps: { uow: UnitOfWork; clock: Clock }); execute(input: { title: string; body: string; tag: NewsTag; imageUrl: string | null; authorId: number }): Promise<NewsView> }
  export class DeleteNews { constructor(deps: { uow: UnitOfWork }); execute(id: number): Promise<void> }
  export class GetAdminOverview { constructor(deps: { uow: UnitOfWork; clock: Clock }); execute(): Promise<AdminOverview> }
  ```

- [ ] **Step 1: Napsat padající testy**

```ts
it('posouvá stav objednávky v cyklu', async () => {
  const ctx = makeAdminContext({ orders: [orderWith(OrderStatus.NEW)] })
  expect(await ctx.advance.execute(1)).toBe(OrderStatus.READY)
  expect(await ctx.advance.execute(1)).toBe(OrderStatus.COLLECTED)
  expect(await ctx.advance.execute(1)).toBe(OrderStatus.NEW)
})

it('nová odrůda dostane slug odvozený z názvu bez diakritiky', async () => {
  const ctx = makeAdminContext()
  const view = await ctx.upsert.execute({ id: null, name: 'Růžová Adéla', tag: 'raná', description: '', colorHex: '#c98a2b', priceCzk: 18, stockKg: 150, capacityKg: 150 })
  expect(view.slug).toBe('ruzova-adela')
})

it('kolidující slug dostane číselnou příponu', async () => {
  const ctx = makeAdminContext({ varieties: [bernie(10, 160, 22)] })   // slug 'bernie'
  const view = await ctx.upsert.execute({ id: null, name: 'Bernie', tag: '', description: '', colorHex: '#c98a2b', priceCzk: 20, stockKg: 10, capacityKg: 10 })
  expect(view.slug).toBe('bernie-2')
})

it('úprava existující odrůdy slug nemění', async () => {
  const ctx = makeAdminContext({ varieties: [bernie(10, 160, 22)] })
  const view = await ctx.upsert.execute({ id: 1, name: 'Bernie Extra', tag: '', description: '', colorHex: '#c98a2b', priceCzk: 25, stockKg: 10, capacityKg: 160 })
  expect(view.slug).toBe('bernie')
})

it('odmítne zápornou cenu i sklad nad kapacitu', async () => {
  const ctx = makeAdminContext()
  await expect(ctx.upsert.execute({ ...base, priceCzk: -1 })).rejects.toThrow(ValidationError)
  await expect(ctx.upsert.execute({ ...base, stockKg: 200, capacityKg: 150 })).rejects.toThrow(/kapacit/)
})

it('odrůdu s objednávkou deaktivuje místo smazání', async () => {
  const ctx = makeAdminContext({ varieties: [bernie(10, 160, 22)] })
  await ctx.deactivate.execute(1)
  expect(ctx.varieties.get(1)?.isActive).toBe(false)
})

it('odmítne novinku bez titulku', async () => {
  await expect(makeAdminContext().publishNews.execute({ title: '  ', body: 'x', tag: NewsTag.HARVEST, imageUrl: null, authorId: 1 }))
    .rejects.toThrow(/titulek/i)
})
```

- [ ] **Step 2: Spustit, ověřit pád, implementovat, spustit znovu**

Slug: `name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')`.
Kolize se řeší v cyklu `slug`, `slug-2`, `slug-3`, … dotazem na existující slugy.

Run: `npx vitest run tests/unit/application/admin.test.ts`
Expected: PASS

- [ ] **Step 3: Commit a push**

```bash
git add -A
git commit -m "feat(app): administracni use-cases pro sklad, objednavky a novinky"
git push
```

---

### Task 15: Server actions, middleware a ochrana administrace

**Files:**
- Create: `src/app/actions/auth.ts`, `order.ts`, `admin-stock.ts`, `admin-orders.ts`, `admin-news.ts`
- Create: `src/middleware.ts`
- Test: `tests/unit/actions/mapping.test.ts`

**Interfaces:**
- Consumes: use-cases (Tasky 11–14), `getContainer()` (Task 10), session helpery (Task 8)
- Produces:
  ```ts
  // všechny server actions vracejí Result, nikdy nevyhazují do UI
  export async function loginAction(_prev: unknown, formData: FormData): Promise<Result<AuthResult>>
  export async function registerAction(_prev: unknown, formData: FormData): Promise<Result<AuthResult>>
  export async function logoutAction(): Promise<void>
  export async function reserveOrderAction(input: ReserveOrderPayload): Promise<Result<{ token: string }>>
  export async function upsertVarietyAction(input: UpsertVarietyInput): Promise<Result<VarietyView>>
  export async function deactivateVarietyAction(id: number): Promise<Result<null>>
  export async function advanceOrderStatusAction(id: number): Promise<Result<OrderStatus>>
  export async function publishNewsAction(formData: FormData): Promise<Result<NewsView>>
  export async function deleteNewsAction(id: number): Promise<Result<null>>
  export function toResultError(error: unknown): Result<never>   // DomainError → česká hláška + code
  ```

- [ ] **Step 1: Napsat test převodu chyb**

```ts
it('převede doménovou chybu na uživatelskou hlášku', () => {
  const r = toResultError(new InsufficientStockError('Bernie', 2, 5))
  expect(r.ok).toBe(false)
  expect(r.error).toBe('Bernie: na skladě zbývá jen 2 kg')
  expect(r.code).toBe('INSUFFICIENT_STOCK')
})

it('u neznámé chyby nevypustí vnitřní detail', () => {
  const r = toResultError(new Error('Prisma: Access denied for user root@10.0.0.5'))
  expect(r.error).toBe('Něco se nepovedlo. Zkuste to prosím znovu.')
  expect(r.error).not.toContain('root@')
})
```

Druhý test hlídá, že se do prohlížeče nedostanou hlášky databáze — ty prozrazují jména
uživatelů a hostitelů.

- [ ] **Step 2: Implementovat server actions**

Každá admin action začíná `const session = await requireFarmer()` — nespoléhá se na
middleware. Middleware je první obrana (přesměruje prohlížeč), kontrola v action je druhá
(server action se dá zavolat přímo POSTem, middleware ji nemusí zachytit).

`reserveOrderAction` a `loginAction` navíc volají rate limiter s klíčem z hlavičky:
```ts
const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
if (!orderLimiter.tryConsume(ip)) {
  return err('Příliš mnoho pokusů. Zkuste to prosím za chvíli.', 'RATE_LIMITED')
}
```

Po úspěšné mutaci se volá `revalidatePath` na dotčené cesty (`/`, `/burza`, `/sklad`, `/admin/...`),
jinak by SSR stránky ukazovaly starý stav skladu z cache.

- [ ] **Step 3: Implementovat `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionToken } from '@/infrastructure/auth/edge-session'
import { UserRole } from '@/domain/enums'

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('silentagro_session')?.value
  const session = token ? await verifySessionToken(token, process.env.AUTH_SECRET ?? '') : null

  if (!session || session.role !== UserRole.FARMER) {
    const url = new URL('/', request.url)
    url.searchParams.set('prihlaseni', 'vyzadovano')
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*'] }
```

Middleware sahá na `process.env` přímo, protože běží na Edge runtime, kde se modul
`env.ts` (a jeho `zod` závislost) nemusí načíst stejně jako v Node. Je to jediná
povolená výjimka z pravidla „env jen v `config/env.ts`“ a je tu okomentovaná v kódu.

- [ ] **Step 4: Ověřit typecheck a testy; commit a push**

```bash
npm run typecheck && npx vitest run tests/unit
git add -A
git commit -m "feat(app): server actions, prevod chyb a ochrana administrace"
git push
```

---

### Task 16: UI primitiva a plášť aplikace

**Files:**
- Create: `src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`, `chip.tsx`, `pill.tsx`, `field.tsx`
- Create: `src/components/layout/site-header.tsx`, `site-footer.tsx`, `auth-modal.tsx`, `toast-host.tsx`, `session-provider.tsx`
- Modify: `src/app/layout.tsx` — vložit plášť
- Create: `src/components/ui/*.module.css` (CSS Modules)

**Interfaces:**
- Produces:
  ```ts
  export function Button(props: { variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger'; size?: 'sm' | 'md' | 'lg' } & ButtonHTMLAttributes<HTMLButtonElement>): JSX.Element
  export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element
  export function Field(props: { label: string; children: ReactNode; hint?: string; error?: string }): JSX.Element
  export function Card(props: { children: ReactNode; padding?: 'sm' | 'md' | 'lg'; tone?: 'surface' | 'ink' | 'sand' }): JSX.Element
  export function Badge(props: { children: ReactNode; tone: 'green' | 'gold' | 'clay' | 'muted' }): JSX.Element
  export function Chip(props: { active: boolean; children: ReactNode; onClick: () => void }): JSX.Element
  export function Pill(props: { active: boolean; children: ReactNode; onClick: () => void }): JSX.Element
  export function SiteHeader(props: { session: SessionPayload | null }): JSX.Element   // klientská, drží stav modalu
  export function AuthModal(props: { open: boolean; onClose: () => void }): JSX.Element
  export function useToast(): { show: (message: string) => void }
  ```

Styly: **CSS Modules**, ne inline `style` jako v prototypu. Inline styly se nedají
theme-ovat, nejdou přes CSP bez `unsafe-inline` a duplikují se v každé instanci komponenty.
Hodnoty barev se berou výhradně z CSS proměnných definovaných v Tasku 1.

- [ ] **Step 1: Napsat primitiva**

`Button` mapuje `variant` na třídu; `primary` = zelené pozadí `var(--green)` s bílým textem
a hoverem na `var(--ink)`, `gold` = `var(--gold)` s tmavým textem (tlačítko „Závazně rezervovat“),
`danger` = průhledné s textem `var(--clay)` (odkazy „odebrat“, „smazat“).

- [ ] **Step 2: `SiteHeader` podle prototypu**

Logo + název + „by Silent Industries“, navigace Domů / Burza / Sklad se zvýrazněním
aktivní položky (`usePathname()`), tlačítko Košík s počtem řádků z `useCart()`,
a podle session buď „Přihlásit“, nebo jméno + „odhlásit“, plus zlaté tlačítko
„Administrace“ pro roli `FARMER`.

- [ ] **Step 3: `AuthModal`**

Taby Přihlášení / Registrace, pole podle režimu, chybová hláška z `Result`.
Otevírá se i automaticky, když URL nese `?prihlaseni=vyzadovano` (přesměrování z middleware).

Demo box z prototypu („Demo: farmář farma@silentagro.cz / heslo brambory“) se **nepřenáší** —
v produkční aplikaci by to bylo zveřejněné přihlašovací heslo.

- [ ] **Step 4: Ověřit build a commit**

```bash
npm run build
git add -A
git commit -m "feat(ui): primitiva, hlavicka, paticka, prihlasovaci modal a toasty"
git push
```

---

### Task 17: Homepage

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/home/stock-hero.tsx`, `bin-chart.tsx`, `news-grid.tsx`, `how-it-works.tsx`

**Interfaces:**
- Consumes: `GetStockOverview`, `ListNews` (Task 11)
- Produces: server komponenta `HomePage`, která si oba use-case zavolá paralelně přes `Promise.all`

- [ ] **Step 1: Implementovat stránku**

```tsx
export const revalidate = 30   // stav skladu smí být 30 s starý; delší cache mate zákazníka

export default async function HomePage() {
  const c = getContainer()
  const [overview, news] = await Promise.all([
    new GetStockOverview({ uow: c.uow, clock: c.clock }).execute(),
    new ListNews({ uow: c.uow }).execute(3),
  ])
  return (
    <>
      <StockHero overview={overview} />
      <NewsGrid posts={news} />
      <HowItWorks />
    </>
  )
}
```

`StockHero` reprodukuje tmavý panel z prototypu: velké číslo `totalKgLabel`, zlaté „kg“,
sloupce zásobníků z `overview.bins` a řádek „Poslední aktualizace“.

Texty hero sekce, „Jak to funguje“ (4 kroky) a popisky přebírají znění prototypu doslova.

- [ ] **Step 2: Ověřit v prohlížeči**

Run: `npm run dev`, otevřít `http://localhost:3000`
Expected: stránka ukazuje seedovaná data — 344 kg, 4 zásobníky, 3 novinky

- [ ] **Step 3: Commit a push**

```bash
git add -A
git commit -m "feat(web): homepage se stavem skladu a novinkami z pole"
git push
```

---

### Task 18: Burza a košík na klientovi

**Files:**
- Create: `src/app/burza/page.tsx`
- Create: `src/components/shop/variety-card.tsx`, `quantity-stepper.tsx`
- Create: `src/components/cart/cart-provider.tsx`
- Modify: `src/app/layout.tsx` — obalit `CartProvider`
- Test: `tests/unit/cart/cart-reducer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CartLine { varietyId: number; quantityKg: number }
  export type CartAction =
    | { type: 'add'; varietyId: number; quantityKg: number }
    | { type: 'setQty'; varietyId: number; quantityKg: number }
    | { type: 'remove'; varietyId: number }
    | { type: 'clear' }
    | { type: 'hydrate'; lines: CartLine[] }
  export function cartReducer(state: CartLine[], action: CartAction): CartLine[]
  export function useCart(): { lines: CartLine[]; dispatch: Dispatch<CartAction>; count: number }
  export const CART_STORAGE_KEY = 'silentagro.cart.v1'
  ```

- [ ] **Step 1: Napsat padající testy reduceru**

```ts
it('přidání téže odrůdy množství sečte', () => {
  const s = cartReducer(cartReducer([], { type: 'add', varietyId: 1, quantityKg: 2 }), { type: 'add', varietyId: 1, quantityKg: 1.5 })
  expect(s).toEqual([{ varietyId: 1, quantityKg: 3.5 }])
})

it('nastavení množství na nulu řádek odstraní', () => {
  expect(cartReducer([{ varietyId: 1, quantityKg: 2 }], { type: 'setQty', varietyId: 1, quantityKg: 0 })).toEqual([])
})

it('hydratace zahodí poškozené řádky z localStorage', () => {
  const s = cartReducer([], { type: 'hydrate', lines: [
    { varietyId: 1, quantityKg: 2 },
    { varietyId: 0, quantityKg: 5 },        // neplatné id
    { varietyId: 2, quantityKg: -3 },       // záporné množství
    { varietyId: 3, quantityKg: 0.3 },      // mimo půlkilový krok
  ] as CartLine[] })
  expect(s).toEqual([{ varietyId: 1, quantityKg: 2 }])
})
```

Třetí test je podstatný: `localStorage` je pod kontrolou uživatele, takže obsah se validuje
při načtení, ne jen při zápisu. Server si stejně všechno přepočítá, ale poškozený stav
by jinak shodil vykreslení košíku.

- [ ] **Step 2: Spustit, ověřit pád, implementovat, spustit znovu**

`CartProvider` je klientská komponenta: `useReducer` + `useEffect` na zápis do `localStorage`
+ jednorázová hydratace v `useEffect` (ne při inicializaci — na serveru `localStorage` není
a rozdíl by způsobil hydratační chybu Reactu).

- [ ] **Step 3: Implementovat `/burza`**

Server komponenta načte `ListVarieties`, karty jsou klientské kvůli stepperu.
Vyprodaná odrůda ukazuje místo ovládání hlášku „Vyprodáno — čekáme na další výkop“.
Stepper krokuje po 0,5 kg, dolní mez 0, horní mez je stav skladu.

- [ ] **Step 4: Commit a push**

```bash
git add -A
git commit -m "feat(web): burza s kosikem v localStorage"
git push
```

---

### Task 19: Stránka Sklad s grafy

**Files:**
- Create: `src/app/sklad/page.tsx`
- Create: `src/components/stock/kpi-card.tsx`, `bin-bars.tsx`, `harvest-chart.tsx`, `field-map.tsx`

**Interfaces:**
- Consumes: `GetStockOverview` (Task 11)
- Produces: `HarvestChart(props: { points: HarvestPointView[] })` — inline SVG, žádná knihovna

- [ ] **Step 1: Implementovat `HarvestChart`**

Graf je přímý přepis prototypu: `viewBox="0 0 620 190"`, sloupce = denní výkop (`#e0d5b8`),
lomená čára = stav skladu (`--green`, `stroke-width: 3`, `vector-effect="non-scaling-stroke"`).
Osa se škáluje na `Math.ceil(maxStock / 100) * 100`, mřížka po čtvrtinách.

```tsx
const W = 620, H = 190
const maxStock = Math.max(...points.map((p) => p.stockKg), 1)
const tickTop = Math.ceil(maxStock / 100) * 100
const step = W / points.length
const y = (v: number) => H - (v / (maxStock * 1.15)) * H
```

Graf je **server-rendered SVG** — žádný `useEffect`, žádná knihovna. Data se nemění za běhu
stránky, takže klientská knihovna by přidala jen kilobajty a vrstvu, která může selhat.

Přístupnost: `<svg role="img">` s `<title>` shrnujícím data slovy („Denní výkop a stav skladu
za posledních 14 dní, aktuálně 344 kg“) — jinak je graf pro odečítač obrazovky prázdný.

- [ ] **Step 2: Implementovat KPI, zásobníky a mapu polí**

KPI hodnoty pocházejí z `GetStockOverview`: „Na skladě“ (součet), „Rezervováno“
(`orders.reservedKgSince` za posledních 30 dní ve stavu `NEW`), „Sklizeno letos“
(součet `harvest_entries.dugKg`), „Teplota stodoly“ (poslední `StorageReading`).

Prototyp měl tato čísla natvrdo; tady se počítají z dat. Pokud čidlo nemá záznam,
karta ukáže „—“ místo vymyšlené hodnoty.

- [ ] **Step 3: Ověřit v prohlížeči a commit**

```bash
git add -A
git commit -m "feat(web): stranka skladu s KPI, grafem vykopu a mapou poli"
git push
```

---

### Task 20: Košík, objednání a potvrzení

**Files:**
- Create: `src/app/kosik/page.tsx`, `src/app/rezervace/[token]/page.tsx`
- Create: `src/components/cart/cart-lines.tsx`, `checkout-form.tsx`, `order-summary.tsx`, `mail-preview.tsx`
- Test: doplnit `tests/unit/cart/checkout-validation.test.ts`

**Interfaces:**
- Consumes: `reserveOrderAction` (Task 15), `GetOrderByToken` (Task 11), `useCart` (Task 18), `ListVarieties`
- Produces: `validateCheckout(form: CheckoutForm): Record<string, string>` — mapa pole → česká hláška

- [ ] **Step 1: Napsat padající test validace formuláře**

```ts
it('vyžaduje jméno a e-mail', () => {
  const errors = validateCheckout({ name: '', email: '', phone: '', note: '', delivery: 'PICKUP', payment: 'CASH' })
  expect(errors.name).toBe('Vyplňte jméno a příjmení')
  expect(errors.email).toBe('Vyplňte e-mail')
})

it('odmítne e-mail bez zavináče', () => {
  expect(validateCheckout({ ...valid, email: 'jan.email.cz' }).email).toBe('E-mail nemá správný tvar')
})

it('u rozvozu vyžaduje telefon', () => {
  expect(validateCheckout({ ...valid, delivery: 'LOCAL_DELIVERY', phone: '' }).phone)
    .toBe('U rozvozu potřebujeme telefon')
})

it('platný formulář nemá chyby', () => {
  expect(validateCheckout(valid)).toEqual({})
})
```

Validace na klientovi je jen pro rychlou zpětnou vazbu. Server ji dělá znovu v `ReserveOrder` —
klientská validace se dá obejít a nikdy se na ni nespoléhá.

- [ ] **Step 2: Implementovat `/kosik`**

Prázdný košík ukazuje přerušovaný rámeček s tlačítkem „Do burzy“ (jako prototyp).
Naplněný má dva sloupce: vlevo řádky + kontakt + převzetí + platba + poznámka,
vpravo lepivý tmavý souhrn s tlačítkem „Závazně rezervovat“.

Souhrn počítá mezisoučet, dopravu a celkem **na klientovi jen pro zobrazení**; závazná
částka je ta, kterou vrátí server. Po úspěchu se košík vyprázdní a stránka přesměruje
na `/rezervace/<token>`.

Chyba `INSUFFICIENT_STOCK` ze serveru se zobrazí u konkrétního řádku a nabídne snížení
množství — mezi vložením do košíku a odesláním mohl někdo jiný sklad vyprodat.

- [ ] **Step 3: Implementovat `/rezervace/[token]`**

Zelený panel „Rezervace #2610 přijata“, pod ním dvě karty s náhledem odeslaných e-mailů
(jako prototyp) a tlačítko zpět na úvod. Neexistující token → `notFound()`.

`export const dynamic = 'force-dynamic'` — potvrzení nesmí být v cache; obsahuje osobní údaje.

- [ ] **Step 4: Commit a push**

```bash
git add -A
git commit -m "feat(web): kosik, zavazna rezervace a stranka potvrzeni"
git push
```

---

### Task 21: Administrace

**Files:**
- Create: `src/app/admin/layout.tsx`, `page.tsx`, `sklad/page.tsx`, `objednavky/page.tsx`, `novinky/page.tsx`
- Create: `src/components/admin/admin-tabs.tsx`, `stock-row.tsx`, `add-variety-form.tsx`, `orders-table.tsx`, `news-composer.tsx`, `news-admin-list.tsx`
- Create: `src/app/api/uploads/route.ts`

**Interfaces:**
- Consumes: admin use-cases (Task 14), admin server actions (Task 15)
- Produces: `POST /api/uploads` → `Result<{ url: string }>`; přijímá jen `image/jpeg`, `image/png`, `image/webp` do 5 MB

- [ ] **Step 1: `admin/layout.tsx` s ověřením role**

```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession()
  if (!session || session.role !== UserRole.FARMER) redirect('/?prihlaseni=vyzadovano')
  return (
    <section>
      <AdminHeader userName={session.name} />
      <AdminTabs />
      {children}
    </section>
  )
}
```

Taby prototypu jsou tady skutečné cesty (`/admin`, `/admin/sklad`, `/admin/objednavky`,
`/admin/novinky`) místo stavu v paměti. Farmář si tak může záložku uložit a obnovení
stránky ho nevrátí na přehled.

- [ ] **Step 2: Tab Sklad a ceny**

Řádek na odrůdu: název, sklad se stepperem ±5 kg, kapacita, cena, tlačítko „Smazat“
(volá `deactivateVarietyAction`), rozbalovací část se štítkem, paletou osmi barev
z prototypu a popisem. Uložení je explicitní tlačítko na řádku, ne auto-save při psaní —
auto-save by posílal request na každý stisk klávesy.

Pod tabulkou formulář „Přidat odrůdu“ podle prototypu.

- [ ] **Step 3: Tab Objednávky**

Tabulka `#kód / zákazník+e-mail / položky+doprava+platba / celkem / stav`.
Tlačítko stavu posouvá `NEW → READY → COLLECTED → NEW` přes `advanceOrderStatusAction`,
s optimistickým překreslením přes `useOptimistic`.

- [ ] **Step 4: Tab Novinky + nahrávání fotek**

Vlevo formulář (titulek, text, výběr tagu, nahrání fotky, tlačítko „Zveřejnit na homepage“),
vpravo seznam publikovaných s možností smazat.

`POST /api/uploads`:
```ts
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024
// jméno souboru generuje server: crypto.randomUUID() + přípona odvozená z MIME,
// nikdy ne file.name — ten je pod kontrolou útočníka (../../ i dvojité přípony)
```

Endpoint vyžaduje roli `FARMER`. Bez toho by šlo na server nahrávat cokoli anonymně.

- [ ] **Step 5: Commit a push**

```bash
git add -A
git commit -m "feat(admin): sprava skladu, objednavek a novinek vcetne nahravani fotek"
git push
```

---

### Task 22: Kontejnerizace — dva kontejnery, propojené

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-compose.prod.yml`
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Produces: compose se **dvěma službami** — `app` (Next.js) a `db` (MySQL 8) — které se propojí přímo na interní síti. Mailpit je volitelný a startuje jen s profilem `mail`, aby výchozí sestava zůstala přesně dvoukontejnerová.

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache tini

# standalone výstup nese jen to, co server opravdu potřebuje
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Prisma engine + schema pro `migrate deploy` při startu
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
```

`tini` jako PID 1 je tam kvůli sklízení zombie procesů a správnému předání `SIGTERM` —
bez něj Node jako PID 1 signály neobslouží a `docker stop` skončí až timeoutem po 10 s.

- [ ] **Step 2: `docker/entrypoint.sh`**

```sh
#!/bin/sh
set -e
echo "Čekám na databázi…"
npx prisma migrate deploy
echo "Migrace nasazeny."
exec "$@"
```

Migrace se pouští při startu kontejneru, ne při buildu — build nemá (a nesmí mít)
přístup k produkční databázi.

- [ ] **Step 3: `.dockerignore`**

```
.git
.github
node_modules
.next
coverage
playwright-report
test-results
tests
docs
.env
.env.*
!.env.example
**/*.md
```

- [ ] **Step 4: `docker-compose.yml` — dvě služby**

```yaml
name: silentagro

services:
  db:
    image: mysql:8.4
    restart: unless-stopped
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?nastavte MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-silentagro}
      MYSQL_USER: ${MYSQL_USER:-silentagro}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?nastavte MYSQL_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql
    networks: [internal]
    security_opt: ["no-new-privileges:true"]
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-u", "root", "-p$$MYSQL_ROOT_PASSWORD"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: mysql://${MYSQL_USER:-silentagro}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE:-silentagro}
      AUTH_SECRET: ${AUTH_SECRET:?nastavte AUTH_SECRET}
      SMTP_HOST: ${SMTP_HOST:-mailpit}
      SMTP_PORT: ${SMTP_PORT:-1025}
      SMTP_SECURE: ${SMTP_SECURE:-false}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASSWORD: ${SMTP_PASSWORD:-}
      MAIL_FROM: ${MAIL_FROM:-SilentAgro <farma@silentagro.cz>}
      FARMER_EMAIL: ${FARMER_EMAIL:-farma@silentagro.cz}
      PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-http://localhost:3000}
      UPLOAD_DIR: /app/public/uploads
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - uploads:/app/public/uploads
    networks: [internal]
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]

  # Volitelné: `docker compose --profile mail up` přidá odchytávač e-mailů.
  # Bez profilu běží přesně dva kontejnery.
  mailpit:
    image: axllent/mailpit:latest
    profiles: [mail]
    restart: unless-stopped
    ports:
      - "127.0.0.1:8025:8025"
    networks: [internal]
    security_opt: ["no-new-privileges:true"]

volumes:
  db-data:
  uploads:

networks:
  internal:
    driver: bridge
```

Bezpečnostní rozhodnutí, která tu stojí za vysvětlení:
- **Port databáze se nepublikuje.** `app` se k ní dostane po interní síti jako `db:3306`. Vystavený 3306 na hostiteli je zbytečná plocha útoku.
- **`ports: "127.0.0.1:3000:3000"`** místo `"3000:3000"` — bez prefixu Docker obchází firewall Windows i Linuxu a aplikace visí na všech rozhraních.
- **`${VAR:?zpráva}`** u tajemství: compose odmítne nastartovat, když proměnná chybí, místo aby tiše použil prázdné heslo.
- **`read_only: true`** u aplikace: Next.js standalone si za běhu do svého adresáře nic nezapisuje; zápis potřebuje jen `/tmp` a volume s fotkami.
- Heslo root MySQL je oddělené od hesla aplikačního uživatele — aplikace root nikdy nepoužije.

- [ ] **Step 5: Spustit a ověřit**

```bash
DOCKER="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
cp .env.example .env    # doplnit AUTH_SECRET, MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD
"$DOCKER" compose up -d --build
"$DOCKER" compose ps
curl -fsS http://localhost:3000/api/health
"$DOCKER" compose exec app node -e "console.log(process.getuid())"   # očekáváme 1000, ne 0
```
Expected: obě služby `healthy`, health vrací `{"status":"ok","database":"up"}`, uid `1000`

- [ ] **Step 6: Seed uvnitř kontejneru**

```bash
"$DOCKER" compose exec -e SEED_FARMER_PASSWORD=zvolene-heslo app npx tsx prisma/seed.ts
```

- [ ] **Step 7: Commit a push**

```bash
git add -A
git commit -m "feat(docker): dvoukontejnerova sestava aplikace a MySQL"
git push
```

---

### Task 23: CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`

- [ ] **Step 1: `ci.yml`**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }

permissions:
  contents: read

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: coverage, path: coverage/ }

  integration:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: silentagro_test
        ports: ["3306:3306"]
        options: >-
          --health-cmd="mysqladmin ping -h 127.0.0.1 -uroot -proot"
          --health-interval=10s --health-timeout=5s --health-retries=10
    env:
      DATABASE_URL: mysql://root:root@127.0.0.1:3306/silentagro_test
      AUTH_SECRET: ci-secret-ci-secret-ci-secret-1234
      SMTP_HOST: localhost
      SMTP_PORT: "1025"
      MAIL_FROM: SilentAgro <farma@silentagro.cz>
      FARMER_EMAIL: farma@silentagro.cz
      PUBLIC_BASE_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test:integration

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Připravit .env pro compose
        run: |
          {
            echo "MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16)"
            echo "MYSQL_PASSWORD=$(openssl rand -hex 16)"
            echo "AUTH_SECRET=$(openssl rand -base64 48)"
            echo "SEED_FARMER_PASSWORD=$(openssl rand -hex 12)"
          } >> .env
      - run: docker compose up -d --build
      - name: Počkat na health
        run: |
          for i in $(seq 1 60); do
            curl -fsS http://localhost:3000/api/health && exit 0
            sleep 3
          done
          docker compose logs --no-color
          exit 1
      - run: docker compose exec -T --env SEED_FARMER_PASSWORD="$(grep SEED_FARMER_PASSWORD .env | cut -d= -f2)" app npx tsx prisma/seed.ts
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        run: docker compose logs --no-color
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report/ }

  security:
    runs-on: ubuntu-latest
    permissions: { contents: read, security-events: write }
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Audit závislostí
        run: npm audit --audit-level=high
      - name: Gitleaks
        uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }
      - name: Sestavit image pro sken
        run: docker build -t silentagro:scan .
      - name: Trivy
        uses: aquasecurity/trivy-action@0.28.0
        with:
          image-ref: silentagro:scan
          format: sarif
          output: trivy.sarif
          severity: HIGH,CRITICAL
          exit-code: "1"
          ignore-unfixed: true
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: trivy.sarif }
```

`ignore-unfixed: true` je vědomý ústupek: bez něj build padá na zranitelnostech base image,
pro které ještě neexistuje oprava, a tým si zvykne pipeline ignorovat. Opravitelné
HIGH/CRITICAL nálezy build shodí.

`permissions: contents: read` na úrovni workflow je záměr — výchozí `GITHUB_TOKEN`
má jinak zápis do repozitáře, což žádný z těchto jobů nepotřebuje.

- [ ] **Step 2: `release.yml`**

Spouští se na tag `v*`: přihlášení do GHCR, `docker/build-push-action` s cache,
`anchore/sbom-action` (syft → SPDX), `sigstore/cosign-installer` + `cosign sign --yes`
s keyless podpisem přes OIDC. `permissions: { contents: read, packages: write, id-token: write }`.

- [ ] **Step 3: `dependabot.yml`** — týdenní aktualizace pro `npm`, `github-actions` a `docker`.

- [ ] **Step 4: Commit a push, ověřit běh pipeline**

```bash
git add -A
git commit -m "ci: pipeline kvality, integrace, e2e, bezpecnosti a vydani"
git push
```

Po pushi zkontrolovat na GitHubu, že všechny čtyři joby prošly.

---

### Task 24: E2E testy a závěrečné ověření

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/nakup.spec.ts`, `tests/e2e/admin.spec.ts`, `tests/e2e/pristup.spec.ts`
- Create: `README.md`

- [ ] **Step 1: `playwright.config.ts`**

```ts
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 2: `tests/e2e/nakup.spec.ts`**

```ts
test('zákazník si rezervuje brambory a dostane potvrzení', async ({ page }) => {
  await page.goto('/burza')
  const card = page.getByRole('article', { name: /Bernie/ })
  await card.getByRole('button', { name: 'Rezervovat' }).click()

  await page.getByRole('button', { name: /Košík/ }).click()
  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel(/E-mail/).fill('jan@email.cz')
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page).toHaveURL(/\/rezervace\//)
  await expect(page.getByText(/Rezervace #\d+ přijata/)).toBeVisible()
  await expect(page.getByText('jan@email.cz')).toBeVisible()
})

test('rezervace sníží stav skladu na burze', async ({ page }) => {
  await page.goto('/burza')
  const before = await readStock(page, 'Bernie')
  await reserve(page, 'Bernie', 2.5)
  await page.goto('/burza')
  expect(await readStock(page, 'Bernie')).toBe(before - 2.5)
})
```

- [ ] **Step 3: `tests/e2e/admin.spec.ts` a `pristup.spec.ts`**

```ts
test('nepřihlášený návštěvník se do administrace nedostane', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/prihlaseni=vyzadovano/)
})

test('farmář změní sklad a zveřejní novinku', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/admin/sklad')
  await page.getByLabel('Sklad (kg)').first().fill('200')
  await page.getByRole('button', { name: 'Uložit' }).first().click()

  await page.goto('/admin/novinky')
  await page.getByPlaceholder(/Dnes jsme vykopali/).fill('Test novinka z E2E')
  await page.getByRole('button', { name: 'Zveřejnit na homepage' }).click()

  await page.goto('/')
  await expect(page.getByText('Test novinka z E2E')).toBeVisible()
})
```

Heslo farmáře v E2E se bere z `E2E_FARMER_PASSWORD`, stejné jako `SEED_FARMER_PASSWORD`
v CI. Žádné heslo v repozitáři.

- [ ] **Step 4: Napsat `README.md`**

Rozjezd na tři příkazy (`cp .env.example .env`, vyplnit tajemství, `docker compose up -d --build`),
popis architektury odkazem na spec, tabulka proměnných prostředí, jak pustit testy,
jak nasadit (`docker-compose.prod.yml`).

- [ ] **Step 5: Závěrečné ověření celé sestavy**

```bash
DOCKER="C:\Program Files\Docker\Docker\resources\bin\docker.exe"
npm run lint && npm run typecheck && npm run test
npm run test:integration
"$DOCKER" compose down -v && "$DOCKER" compose up -d --build
curl -fsS http://localhost:3000/api/health
npm run test:e2e
```
Expected: všechno zelené; do zprávy uživateli se píše skutečný výstup, ne domněnka

- [ ] **Step 6: Commit a push**

```bash
git add -A
git commit -m "test: E2E scenare nakupu a administrace, README"
git push
```

---

## Pořadí a závislosti

```
1 scaffold
├─ 2 prisma schema
│  ├─ 6 prisma infra ── 7 seed
│  └─ 22 docker
├─ 3 value objects ── 4 entity ── 5 porty
│                                 ├─ 6 prisma infra
│                                 ├─ 8 auth infra ─┐
│                                 ├─ 9 mail infra ─┼─ 10 DI
│                                 └─ 11 čtecí UC   │
│                                    12 ReserveOrder (potřebuje 6, 9, 10)
│                                    13 auth UC (potřebuje 8, 10)
│                                    14 admin UC (potřebuje 10)
├─ 15 actions + middleware (potřebuje 11–14)
└─ 16 UI plášť ── 17 domů ── 18 burza ── 19 sklad ── 20 košík ── 21 admin
                                                                  └─ 23 CI ── 24 E2E
```

Tasky 3–5 a 22 jdou dělat souběžně s 2 a 6. Tasky 17–21 jdou souběžně po dokončení 16.

## Definice hotového

- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:integration`, `npm run test:e2e` procházejí
- `docker compose up -d --build` rozjede dva kontejnery, oba `healthy`
- `/api/health` vrací `{"status":"ok","database":"up"}`
- Aplikace v kontejneru běží pod uid 1000 s `read_only` kořenovým systémem
- Žádné tajemství v repozitáři ani v image; `.env.example` obsahuje jen tvary hodnot
- Pipeline na GitHubu je zelená ve všech čtyřech jobech

---

## Dodatek A — přepínatelný mailový driver a QR platba

Tyto dva požadavky přišly po sepsání tasků 1–24. Mění tři existující tasky a přidávají dva
nové. Změny existujících tasků jsou vypsané tady; kdo dělá Task 1, 9 nebo 20, musí si přečíst
i tento dodatek.

### Změny v existujících tascích

**Task 1 — `Env` se rozšiřuje o pět klíčů:**

```ts
export type MailDriver = 'mailpit' | 'smtp' | 'memory'

export interface Env {
  // ... vše dosavadní ...
  MAIL_DRIVER: MailDriver           // default 'mailpit'
  BANK_ACCOUNT_IBAN: string         // bez mezer, validováno mod-97
  BANK_ACCOUNT_NUMBER: string       // "2000145399/0800", jen k zobrazení
}
```

Zod schéma přidá:
```ts
MAIL_DRIVER: z.enum(['mailpit', 'smtp', 'memory']).default('mailpit'),
BANK_ACCOUNT_IBAN: z.string().min(1).transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine(isValidIban, 'BANK_ACCOUNT_IBAN nemá platné kontrolní číslice'),
BANK_ACCOUNT_NUMBER: z.string().min(1),
```
a nakonec průřezovou kontrolu:
```ts
.superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && v.MAIL_DRIVER !== 'smtp') {
    ctx.addIssue({ code: 'custom', path: ['MAIL_DRIVER'],
      message: 'V produkci musí být MAIL_DRIVER=smtp, jinak by se potvrzení objednávek tiše zahazovala' })
  }
  if (v.MAIL_DRIVER === 'smtp' && v.SMTP_HOST.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'Při MAIL_DRIVER=smtp je SMTP_HOST povinný' })
  }
})
```

`SMTP_HOST` a `SMTP_PORT` dostávají výchozí hodnoty `'mailpit'` a `1025`, aby vývojová
konfigurace nemusela vyplňovat nic navíc.

**`.env.example` se rozšiřuje:**

```dotenv
# --- Pošta ---
# mailpit = odchytávač ve vývoji (nic se reálně neodešle, UI na http://localhost:8025)
# smtp    = skutečný SMTP server (povinné v produkci)
# memory  = nic neodesílá, drží zprávy v paměti (testy, CI)
MAIL_DRIVER="mailpit"
SMTP_HOST="mailpit"
SMTP_PORT="1025"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASSWORD=""
MAIL_FROM="SilentAgro <farma@silentagro.cz>"
FARMER_EMAIL="farma@silentagro.cz"

# --- Bankovní účet pro QR platbu ---
# IBAN farmy; mezery jsou povolené, aplikace je odstraní. Kontrolní číslice se ověřují.
BANK_ACCOUNT_IBAN="CZ65 0800 0000 1920 0014 5399"
# Číslo účtu tak, jak ho má vidět zákazník v e-mailu a na stránce
BANK_ACCOUNT_NUMBER="2000145399/0800"
```

**Task 9 — `MailMessage` dostává přílohy:**

```ts
export interface MailAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid?: string          // vyplněné = inline obrázek odkazovaný z HTML jako cid:<hodnota>
}
export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: MailAttachment[]
}
```

Existující volání se nemění — `html` i `attachments` jsou volitelné.

**Task 20 — stránka potvrzení** navíc zobrazuje platební blok, viz Task 26.

---

### Task 25: Mailové drivery

**Files:**
- Create: `src/infrastructure/mail/memory-mailer.ts`
- Modify: `src/infrastructure/mail/nodemailer-mailer.ts` — podpora příloh
- Modify: `src/infrastructure/di/container.ts` — výběr driveru podle `env.MAIL_DRIVER`
- Test: `tests/unit/mail/driver-selection.test.ts`

**Interfaces:**
- Consumes: `Mailer`, `MailMessage`, `MailAttachment` (Task 5 + dodatek), `env` (Task 1)
- Produces:
  ```ts
  export class MemoryMailer implements Mailer {
    readonly sent: MailMessage[]
    send(message: MailMessage): Promise<void>
    clear(): void
  }
  export function createMailer(config: {
    driver: MailDriver
    host: string; port: number; secure: boolean
    user: string | undefined; password: string | undefined
    from: string
  }): Mailer
  ```

- [ ] **Step 1: Napsat padající test výběru driveru**

```ts
import { describe, expect, it } from 'vitest'
import { createMailer } from '@/infrastructure/mail/create-mailer'
import { MemoryMailer } from '@/infrastructure/mail/memory-mailer'
import { NodemailerMailer } from '@/infrastructure/mail/nodemailer-mailer'

const base = { host: 'mailpit', port: 1025, secure: false, user: undefined, password: undefined, from: 'f@x.cz' }

describe('createMailer', () => {
  it('driver memory vrátí paměťový odesílatel', () => {
    expect(createMailer({ ...base, driver: 'memory' })).toBeInstanceOf(MemoryMailer)
  })

  it('driver mailpit vrátí SMTP odesílatel bez přihlášení', () => {
    const mailer = createMailer({ ...base, driver: 'mailpit', user: 'ignorovat', password: 'ignorovat' })
    expect(mailer).toBeInstanceOf(NodemailerMailer)
    expect((mailer as NodemailerMailer).describe()).toBe('mailpit://mailpit:1025 (bez přihlášení)')
  })

  it('driver smtp předá přihlašovací údaje', () => {
    const mailer = createMailer({ ...base, driver: 'smtp', host: 'smtp.seznam.cz', port: 465, secure: true, user: 'farma', password: 'tajne' })
    expect((mailer as NodemailerMailer).describe()).toBe('smtp://smtp.seznam.cz:465 (přihlášen jako farma)')
  })

  it('popis driveru neobsahuje heslo', () => {
    const mailer = createMailer({ ...base, driver: 'smtp', host: 'smtp.seznam.cz', port: 465, secure: true, user: 'farma', password: 'tajne' })
    expect((mailer as NodemailerMailer).describe()).not.toContain('tajne')
  })
})

it('paměťový odesílatel sbírá zprávy a jde vyprázdnit', async () => {
  const mailer = new MemoryMailer()
  await mailer.send({ to: 'a@b.cz', subject: 'Test', text: 'x' })
  expect(mailer.sent).toHaveLength(1)
  mailer.clear()
  expect(mailer.sent).toHaveLength(0)
})
```

`describe()` existuje kvůli logu při startu („Pošta: mailpit://mailpit:1025“) — poslední
test hlídá, že se do logu nikdy nedostane heslo.

- [ ] **Step 2: Spustit, ověřit pád**

Run: `npx vitest run tests/unit/mail`
Expected: FAIL

- [ ] **Step 3: Implementovat**

```ts
export function createMailer(config: CreateMailerConfig): Mailer {
  if (config.driver === 'memory') return new MemoryMailer()

  // mailpit nikdy nepoužívá přihlášení ani TLS, i kdyby je konfigurace obsahovala
  const auth = config.driver === 'smtp' && config.user
    ? { user: config.user, password: config.password ?? '' }
    : undefined

  return new NodemailerMailer({
    driver: config.driver,
    host: config.host,
    port: config.port,
    secure: config.driver === 'smtp' ? config.secure : false,
    auth,
    from: config.from,
  })
}
```

`NodemailerMailer.send` mapuje `attachments` na tvar nodemaileru
(`{ filename, content, contentType, cid, contentDisposition: 'inline' }` pro přílohy s `cid`).

- [ ] **Step 4: Zapojit do kontejneru; testy pouštět s `MAIL_DRIVER=memory`**

`vitest.config.ts` dostane `test.env: { MAIL_DRIVER: 'memory' }`, aby žádný test omylem
nesahal na síť.

- [ ] **Step 5: Spustit testy, commit a push**

```bash
npx vitest run tests/unit/mail
git add -A
git commit -m "feat(mail): prepinatelny driver mailpit / smtp / memory"
git push
```

---

### Task 26: QR platba podle standardu SPAYD

**Files:**
- Create: `src/domain/value-objects/iban.ts`
- Create: `src/infrastructure/payment/spayd.ts`, `src/infrastructure/payment/qr-code.ts`
- Modify: `src/infrastructure/mail/templates.ts` — QR do e-mailu
- Modify: `src/app/rezervace/[token]/page.tsx` — platební blok
- Create: `src/components/cart/payment-block.tsx`
- Test: `tests/unit/payment/iban.test.ts`, `tests/unit/payment/spayd.test.ts`

**Interfaces:**
- Consumes: `Order` (Task 4), `Money`, `env` (Task 1 + dodatek)
- Produces:
  ```ts
  export function isValidIban(raw: string): boolean          // mod-97, délka podle země
  export class Iban {
    static of(raw: string): Iban                             // ValidationError při neplatném
    get value(): string                                      // bez mezer, velká písmena
    get formatted(): string                                  // po čtveřicích: "CZ65 0800 0000 1920 0014 5399"
  }

  export interface SpaydInput {
    iban: string; amount: Money; variableSymbol: string; message: string
  }
  export function buildSpayd(input: SpaydInput): string

  export async function renderQrPng(payload: string): Promise<Buffer>
  export async function renderQrDataUrl(payload: string): Promise<string>

  export interface PaymentDetails {
    accountNumber: string; iban: string; ibanFormatted: string
    amountLabel: string; variableSymbol: string; message: string
    spayd: string
  }
  export function buildPaymentDetails(order: Order, bank: { iban: Iban; accountNumber: string }): PaymentDetails
  export function requiresTransfer(payment: PaymentMethod): boolean   // QR_CODE | BANK_TRANSFER
  ```

Nová závislost: `npm i qrcode` + `npm i -D @types/qrcode`.

- [ ] **Step 1: Napsat padající testy IBANu**

```ts
import { describe, expect, it } from 'vitest'
import { Iban, isValidIban } from '@/domain/value-objects/iban'
import { ValidationError } from '@/domain/errors'

describe('Iban', () => {
  it('přijme platný český IBAN s mezerami i bez', () => {
    expect(Iban.of('CZ6508000000192000145399').value).toBe('CZ6508000000192000145399')
    expect(Iban.of('cz65 0800 0000 1920 0014 5399').value).toBe('CZ6508000000192000145399')
  })

  it('naformátuje po čtveřicích', () => {
    expect(Iban.of('CZ6508000000192000145399').formatted).toBe('CZ65 0800 0000 1920 0014 5399')
  })

  it('odmítne překlep v kontrolních číslicích', () => {
    // změněna jedna číslice → mod-97 neprojde
    expect(() => Iban.of('CZ6608000000192000145399')).toThrow(ValidationError)
  })

  it('odmítne špatnou délku pro danou zemi', () => {
    expect(isValidIban('CZ650800000019200014539')).toBe(false)   // o znak kratší
  })

  it('odmítne nesmysl', () => {
    expect(isValidIban('rozbite')).toBe(false)
    expect(isValidIban('')).toBe(false)
  })
})
```

Kontrola mod-97: přesuň první čtyři znaky na konec, písmena nahraď `A=10 … Z=35`, výsledné
číslo počítej po částech (`BigInt` nebo postupné `% 97`, protože číslo je delší než `Number.MAX_SAFE_INTEGER`),
platný IBAN dává zbytek 1.

- [ ] **Step 2: Napsat padající testy SPAYD**

```ts
import { describe, expect, it } from 'vitest'
import { buildSpayd } from '@/infrastructure/payment/spayd'
import { Money } from '@/domain/value-objects/money'

describe('buildSpayd', () => {
  it('složí řetězec v pořadí předepsaném standardem', () => {
    expect(buildSpayd({
      iban: 'CZ6508000000192000145399',
      amount: Money.fromCzk(182),
      variableSymbol: '2610',
      message: 'SilentAgro rezervace 2610',
    })).toBe('SPD*1.0*ACC:CZ6508000000192000145399*AM:182.00*CC:CZK*X-VS:2610*MSG:SilentAgro rezervace 2610')
  })

  it('částku píše vždy na dvě desetinná místa s tečkou', () => {
    expect(buildSpayd({ ...base, amount: Money.fromCzk(1234.5) })).toContain('*AM:1234.50*')
    expect(buildSpayd({ ...base, amount: Money.fromCzk(60) })).toContain('*AM:60.00*')
  })

  it('odstraní z MSG diakritiku a zkrátí na 60 znaků', () => {
    const spayd = buildSpayd({ ...base, message: 'Příliš žluťoučký kůň úpěl ďábelské ódy a ještě něco navíc dlouhého' })
    const msg = spayd.split('*MSG:')[1] ?? ''
    expect(msg).not.toMatch(/[ěščřžýáíéůúďťňĚŠČŘŽÝÁÍÉŮÚ]/)
    expect(msg.length).toBeLessThanOrEqual(60)
  })

  it('odstraní hvězdičku z MSG, aby nerozbila oddělovače', () => {
    expect(buildSpayd({ ...base, message: 'a*b' })).toContain('*MSG:ab')
  })
})
```

Poslední test řeší skutečnou past: `*` je v SPAYD oddělovač polí. Poznámka zákazníka se do
`MSG` nedostává, ale název farmy nebo kód objednávky by hvězdičku obsahovat mohl a rozbil by
celý řetězec — banka by pak přečetla nesmysl.

- [ ] **Step 3: Spustit, ověřit pád, implementovat, spustit znovu**

```ts
const sanitizeMessage = (raw: string): string =>
  raw.normalize('NFD').replace(/\p{Diacritic}/gu, '')
     .replace(/[*\r\n]/g, '')
     .trim()
     .slice(0, 60)

export function buildSpayd(input: SpaydInput): string {
  return [
    'SPD', '1.0',
    `ACC:${input.iban}`,
    `AM:${input.amount.czk.toFixed(2)}`,
    'CC:CZK',
    `X-VS:${input.variableSymbol}`,
    `MSG:${sanitizeMessage(input.message)}`,
  ].join('*')
}
```

Variabilní symbol vzniká z kódu objednávky odstraněním `#`: `order.code.replace(/\D/g, '')`.

Run: `npx vitest run tests/unit/payment`
Expected: PASS

- [ ] **Step 4: QR generátor**

```ts
import QRCode from 'qrcode'

const OPTIONS = { errorCorrectionLevel: 'M', margin: 2, width: 320 } as const

export const renderQrPng = (payload: string): Promise<Buffer> =>
  QRCode.toBuffer(payload, { ...OPTIONS, type: 'png' })

export const renderQrDataUrl = (payload: string): Promise<string> =>
  QRCode.toDataURL(payload, OPTIONS)
```

Úroveň korekce `M` je kompromis: `L` selhává při focení z displeje pod úhlem, `H` zvětší
mřížku natolik, že se na mobilu hůř zaostřuje.

- [ ] **Step 5: Zapojit do e-mailu (Task 9 šablony)**

`renderCustomerConfirmation` dostane třetí parametr `payment: PaymentDetails | null`.
Když je `null` (platba hotově), e-mail zůstává beze změny.

Když není, textová část dostane blok:
```
Platba převodem
  Číslo účtu:       2000145399/0800
  IBAN:             CZ65 0800 0000 1920 0014 5399
  Částka:           182 Kč
  Variabilní symbol: 2610

QR kód pro platbu je v příloze tohoto e-mailu.
```

HTML část odkazuje QR přes `<img src="cid:qr@silentagro" alt="QR kód pro platbu 182 Kč" width="220">`
a příloha se přidá jako
```ts
attachments: [{ filename: 'qr-platba.png', content: qrPng, contentType: 'image/png', cid: 'qr@silentagro' }]
```

Údaje jsou v textu **slovy i v QR**. Kdo má v klientovi vypnuté obrázky nebo čte prostý
text, musí zaplatit stejně snadno — QR je zkratka, ne jediná cesta.

- [ ] **Step 6: Zapojit do stránky potvrzení**

`PaymentBlock` na `/rezervace/[token]`: vlevo QR jako `data:` URI (`renderQrDataUrl`
na serveru, žádný klientský JS), vpravo tabulka čísla účtu, IBANu, částky a variabilního
symbolu, každý údaj v `<code>` s tlačítkem „zkopírovat“.

Při `Hotově při převzetí` se blok nevykreslí vůbec.

- [ ] **Step 7: Testy šablony s platbou**

```ts
it('e-mail s převodem nese QR přílohu i údaje v textu', async () => {
  const mail = await renderCustomerConfirmation(orderQr, url, paymentDetails)
  expect(mail.attachments?.[0]?.cid).toBe('qr@silentagro')
  expect(mail.attachments?.[0]?.contentType).toBe('image/png')
  expect(mail.text).toContain('2000145399/0800')
  expect(mail.text).toContain('Variabilní symbol: 2610')
  expect(mail.html).toContain('cid:qr@silentagro')
})

it('e-mail při platbě hotově QR neobsahuje', async () => {
  const mail = await renderCustomerConfirmation(orderCash, url, null)
  expect(mail.attachments ?? []).toHaveLength(0)
  expect(mail.text).not.toContain('Variabilní symbol')
})
```

- [ ] **Step 8: Rozšířit E2E (Task 24)**

```ts
test('při QR platbě se na potvrzení zobrazí kód i číslo účtu', async ({ page }) => {
  await reserveWithPayment(page, 'QR platba')
  await expect(page.getByRole('img', { name: /QR kód pro platbu/ })).toBeVisible()
  await expect(page.getByText('2000145399/0800')).toBeVisible()
  await expect(page.getByText(/Variabilní symbol/)).toBeVisible()
})

test('při platbě hotově se QR nezobrazí', async ({ page }) => {
  await reserveWithPayment(page, 'Hotově při převzetí')
  await expect(page.getByRole('img', { name: /QR kód/ })).toHaveCount(0)
})
```

- [ ] **Step 9: Commit a push**

```bash
npx vitest run tests/unit && npm run typecheck
git add -A
git commit -m "feat(platba): QR kod dle SPAYD do e-mailu i na stranku potvrzeni"
git push
```

---

## Aktualizované pořadí

Task 25 patří hned za Task 9 (mail) a před Task 10 (kontejner).
Task 26 patří za Task 20 (stránka potvrzení), protože do ní zasahuje; jeho doménová část
(`Iban`, `buildSpayd`) se ale dá udělat kdykoli po Tasku 3.

---

## Dodatek B — zpráva pro příjemce, instrukce k převodu, příznak zaplaceno

Tři upřesnění, která přišla po sepsání dodatku A. Mění tasky 2, 4, 5, 14, 21, 24 a 26.
Kdo dělá kterýkoli z nich, musí si přečíst i tento dodatek.

### Změny v existujících tascích

**Task 2 — `orders` dostává sloupec `paid_at`:**

```prisma
model Order {
  // ... vše dosavadní ...
  paidAt DateTime? @map("paid_at")

  @@index([status, createdAt])
  @@index([paidAt])
  @@map("orders")
}
```

`DateTime?` místo `Boolean`: farmář potřebuje vědět nejen *že* je zaplaceno, ale i *kdy*.
Dva sloupce (`is_paid` + `paid_at`) by šly rozejít — příznak `true` s prázdným datem.

**Task 4 — `Order` dostává `paidAt`:**

```ts
export interface OrderProps {
  // ... vše dosavadní ...
  paidAt: Date | null
}
export class Order {
  readonly paidAt: Date | null
  get isPaid(): boolean          // paidAt !== null
  withPaidAt(paidAt: Date | null): Order
}
```

**Task 5 — `OrderRepository` dostává metodu:**

```ts
setPaid(id: number, paidAt: Date | null): Promise<Order>
```

**Task 14 — `OrderRowView` dostává dvě pole a přibývá use-case:**

```ts
export interface OrderRowView {
  // ... vše dosavadní ...
  isPaid: boolean
  paidAtLabel: string | null      // "10. září 2026" nebo null
}

export class SetOrderPaid {
  constructor(deps: { uow: UnitOfWork; clock: Clock })
  execute(orderId: number, paid: boolean): Promise<{ isPaid: boolean; paidAtLabel: string | null }>
}
```

**Task 15 — přibývá server action:**

```ts
export async function setOrderPaidAction(id: number, paid: boolean): Promise<Result<{ isPaid: boolean; paidAtLabel: string | null }>>
```

Jako každá admin action začíná `await requireFarmer()`.

---

### Task 27: Zpráva pro příjemce a instrukce k ručnímu převodu

**Files:**
- Modify: `src/infrastructure/payment/spayd.ts` — `buildPaymentDetails` skládá `Agro:<VS>`
- Modify: `src/infrastructure/mail/templates.ts` — instrukční věta v textu i HTML
- Modify: `src/components/cart/payment-block.tsx` — instrukční věta na stránce
- Test: rozšířit `tests/unit/payment/spayd.test.ts`, `tests/unit/mail/templates.test.ts`

**Interfaces:**
- Consumes: `buildSpayd`, `PaymentDetails` (Task 26), `Order` (Task 4)
- Produces:
  ```ts
  export interface PaymentDetails {
    accountNumber: string; iban: string; ibanFormatted: string
    amountLabel: string; variableSymbol: string
    recipientMessage: string          // "Agro:2610" — přesně to, co má zákazník napsat
    instruction: string               // celá věta pro zákazníka, stejná v mailu i na webu
    spayd: string
  }
  export function buildRecipientMessage(orderCode: string): string   // "#2610" → "Agro:2610"
  export const TRANSFER_INSTRUCTION_TEMPLATE: string
  ```

- [ ] **Step 1: Napsat padající testy**

```ts
import { describe, expect, it } from 'vitest'
import { buildRecipientMessage, buildPaymentDetails } from '@/infrastructure/payment/spayd'

describe('buildRecipientMessage', () => {
  it('složí zprávu ve tvaru Agro:cislo', () => {
    expect(buildRecipientMessage('#2610')).toBe('Agro:2610')
  })

  it('odstraní mřížku i jiné nečíselné znaky', () => {
    expect(buildRecipientMessage('2611')).toBe('Agro:2611')
    expect(buildRecipientMessage('# 2612 ')).toBe('Agro:2612')
  })
})

describe('buildPaymentDetails', () => {
  it('vloží zprávu pro příjemce do SPAYD i do instrukce', () => {
    const details = buildPaymentDetails(orderQr, bank)
    expect(details.recipientMessage).toBe('Agro:2610')
    expect(details.spayd).toContain('*MSG:Agro:2610')
    expect(details.instruction).toContain('Agro:2610')
    expect(details.instruction).toContain('2000145399/0800')
    expect(details.instruction).toContain('2610')      // variabilní symbol
  })

  it('dvojtečka ve zprávě přežije, hvězdička ne', () => {
    // ':' je v SPAYD běžný uvnitř hodnoty, oddělovač polí je '*'
    expect(buildPaymentDetails(orderQr, bank).spayd.split('*').filter((p) => p.startsWith('MSG:')))
      .toEqual(['MSG:Agro:2610'])
  })
})
```

Druhý test je tu proto, že `Agro:2610` obsahuje dvojtečku. V SPAYD odděluje klíč od hodnoty
právě dvojtečka, takže `MSG:Agro:2610` má **dvě** dvojtečky. Standard to dovoluje — dělí se
na první výskyt — ale naivní parser (i ten náš, kdyby se psal) by to rozbil. Test to zafixuje.

- [ ] **Step 2: Spustit, ověřit pád**

Run: `npx vitest run tests/unit/payment`
Expected: FAIL

- [ ] **Step 3: Implementovat**

```ts
export const buildRecipientMessage = (orderCode: string): string =>
  `Agro:${orderCode.replace(/\D/g, '')}`

export const TRANSFER_INSTRUCTION_TEMPLATE =
  'Částku {amount} pošlete na účet {account}, variabilní symbol {vs}. ' +
  'Do zprávy pro příjemce prosím napište {message} — podle ní platbu spárujeme. ' +
  'Peníze čekáme do 5 dnů, do té doby brambory držíme.'
```

`instruction` vzniká dosazením do šablony. Jedna definice pro e-mail i web — kdyby si obě
místa formulovala větu zvlášť, časem se rozejdou a zákazník dostane dvě různá zadání.

- [ ] **Step 4: Zapojit do e-mailu**

Textová část potvrzení dostane pod výpis údajů odstavec `details.instruction`.
HTML část totéž, se zvýrazněnou zprávou v `<strong><code>Agro:2610</code></strong>`.

Rozšířit test z Tasku 26:
```ts
it('e-mail nese instrukci ke zprávě pro příjemce', async () => {
  const mail = await renderCustomerConfirmation(orderQr, url, paymentDetails)
  expect(mail.text).toContain('Do zprávy pro příjemce prosím napište Agro:2610')
  expect(mail.html).toContain('Agro:2610')
})
```

- [ ] **Step 5: Zapojit do stránky potvrzení**

`PaymentBlock` pod tabulkou údajů vypíše `details.instruction` a řádek „Zpráva pro příjemce“
s hodnotou `Agro:2610` a tlačítkem „zkopírovat“, stejně jako u čísla účtu a VS.

- [ ] **Step 6: Spustit testy, commit a push**

```bash
npx vitest run tests/unit
git add -A
git commit -m "feat(platba): zprava pro prijemce Agro:cislo a instrukce k prevodu"
git push
```

---

### Task 28: Příznak zaplaceno v administraci

**Files:**
- Modify: `prisma/schema.prisma` — `paidAt` (viz změny výše), nová migrace
- Modify: `src/domain/entities/order.ts`, `src/domain/ports/repositories.ts`
- Modify: `src/infrastructure/persistence/prisma/repositories.ts`, `mappers.ts`
- Create: `src/application/use-cases/set-order-paid.ts`
- Modify: `src/application/use-cases/list-orders.ts`, `get-admin-overview.ts`
- Modify: `src/app/actions/admin-orders.ts`
- Modify: `src/components/admin/orders-table.tsx`
- Test: `tests/unit/application/set-order-paid.test.ts`, rozšířit `tests/integration/repositories.test.ts`

**Interfaces:**
- Consumes: `OrderRepository.setPaid`, `Clock`, `UnitOfWork`
- Produces: `SetOrderPaid`, `setOrderPaidAction` (signatury viz změny výše)

- [ ] **Step 1: Vygenerovat migraci**

Run: `npm run db:migrate -- --name order_paid_at`
Expected: `ALTER TABLE orders ADD COLUMN paid_at DATETIME NULL` + index

Migrace je aditivní a sloupec je nullable, takže existující objednávky zůstanou nezaplacené —
což je správný výchozí stav, ne domněnka.

- [ ] **Step 2: Napsat padající testy**

```ts
import { describe, expect, it } from 'vitest'
import { SetOrderPaid } from '@/application/use-cases/set-order-paid'
import { NotFoundError } from '@/domain/errors'

const clock = { now: () => new Date('2026-09-10T18:30:00Z') }

describe('SetOrderPaid', () => {
  it('zaškrtnutí zapíše čas z hodin', async () => {
    const ctx = makeAdminContext({ orders: [orderWith(OrderStatus.NEW)] })
    const result = await new SetOrderPaid({ uow: ctx.uow, clock }).execute(1, true)
    expect(result.isPaid).toBe(true)
    expect(result.paidAtLabel).toBe('10. září 2026')
    expect(ctx.orders.get(1)?.paidAt).toEqual(new Date('2026-09-10T18:30:00Z'))
  })

  it('odškrtnutí čas smaže', async () => {
    const ctx = makeAdminContext({ orders: [orderPaidAt(new Date('2026-09-01T10:00:00Z'))] })
    const result = await new SetOrderPaid({ uow: ctx.uow, clock }).execute(1, false)
    expect(result.isPaid).toBe(false)
    expect(result.paidAtLabel).toBeNull()
    expect(ctx.orders.get(1)?.paidAt).toBeNull()
  })

  it('opakované zaškrtnutí čas nepřepíše', async () => {
    const original = new Date('2026-09-01T10:00:00Z')
    const ctx = makeAdminContext({ orders: [orderPaidAt(original)] })
    await new SetOrderPaid({ uow: ctx.uow, clock }).execute(1, true)
    expect(ctx.orders.get(1)?.paidAt).toEqual(original)
  })

  it('neexistující objednávka skončí NotFoundError', async () => {
    const ctx = makeAdminContext({ orders: [] })
    await expect(new SetOrderPaid({ uow: ctx.uow, clock }).execute(999, true)).rejects.toThrow(NotFoundError)
  })

  it('zaplacení nemění stav objednávky', async () => {
    const ctx = makeAdminContext({ orders: [orderWith(OrderStatus.NEW)] })
    await new SetOrderPaid({ uow: ctx.uow, clock }).execute(1, true)
    expect(ctx.orders.get(1)?.status).toBe(OrderStatus.NEW)
  })
})
```

Třetí test je podstatný: dvojklik na zaškrtávátko nebo dva otevřené taby nesmí posunout
datum platby na dnešek. Idempotence tady není kosmetika — farmář by přišel o informaci,
kdy peníze skutečně dorazily.

- [ ] **Step 3: Spustit, ověřit pád, implementovat, spustit znovu**

```ts
async execute(orderId: number, paid: boolean) {
  return this.deps.uow.runInTransaction(async (repos) => {
    const order = await repos.orders.findById(orderId)
    if (!order) throw new NotFoundError('Objednávka')

    // idempotence: už zaplacenou objednávku znovu neoznačujeme
    if (paid && order.isPaid) {
      return { isPaid: true, paidAtLabel: formatDateCs(order.paidAt) }
    }

    const updated = await repos.orders.setPaid(orderId, paid ? this.deps.clock.now() : null)
    return {
      isPaid: updated.isPaid,
      paidAtLabel: updated.paidAt ? formatDateCs(updated.paidAt) : null,
    }
  })
}
```

- [ ] **Step 4: UI v tabulce objednávek**

Řádek objednávky dostane šestý sloupec. Zaškrtávátko je `<input type="checkbox">` uvnitř
`<label>` s textem „Zaplaceno“, aby šlo kliknout i na popisek a aby ho odečítač obrazovky
přečetl. Pod ním, když je zaplaceno, drobným písmem datum.

```tsx
<label className={styles.paid}>
  <input
    type="checkbox"
    checked={optimisticPaid}
    disabled={pending}
    onChange={(e) => startTransition(async () => {
      setOptimisticPaid(e.target.checked)
      const result = await setOrderPaidAction(order.id, e.target.checked)
      if (!result.ok) {
        setOptimisticPaid(!e.target.checked)   // vrátit zpět, server nepotvrdil
        toast.show(result.error)
      }
    })}
  />
  <span>Zaplaceno</span>
</label>
{optimisticPaid && paidAtLabel ? <small>{paidAtLabel}</small> : null}
```

Optimistický stav se při chybě vrací zpět. Bez toho by zaškrtávátko ukazovalo „zaplaceno“
i tehdy, když zápis do databáze selhal — a farmář by vydal brambory za nic.

- [ ] **Step 5: KPI „Nezaplacené převodem“ v přehledu**

`GetAdminOverview` přidá pátou kartu: počet objednávek s platbou převodem nebo QR,
které nemají `paid_at` a nejsou starší než 30 dní. To je přesně seznam, který farmář
každé ráno potřebuje projít.

- [ ] **Step 6: Integrační test sloupce**

```ts
it('paid_at přežije uložení a načtení', async () => {
  const order = await repo.create(sampleOrderInput)
  expect(order.isPaid).toBe(false)
  const paid = await repo.setPaid(order.id, new Date('2026-09-10T18:30:00Z'))
  expect(paid.paidAt?.toISOString()).toBe('2026-09-10T18:30:00.000Z')
  const unpaid = await repo.setPaid(order.id, null)
  expect(unpaid.paidAt).toBeNull()
})
```

- [ ] **Step 7: E2E**

```ts
test('farmář označí objednávku jako zaplacenou a označení přežije obnovení stránky', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/admin/objednavky')
  const row = page.getByRole('row').filter({ hasText: '#2609' })
  await row.getByLabel('Zaplaceno').check()
  await expect(row.getByLabel('Zaplaceno')).toBeChecked()

  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: '#2609' }).getByLabel('Zaplaceno')).toBeChecked()
})
```

Kontrola po `reload()` je tam schválně — zaškrtávátko, které si stav drží jen v paměti
prohlížeče, by test bez ní prošel.

- [ ] **Step 8: Commit a push**

```bash
npx vitest run tests/unit && npm run test:integration && npm run typecheck
git add -A
git commit -m "feat(admin): oznaceni objednavky jako zaplacene s casovym razitkem"
git push
```

---

## Aktualizované pořadí (po dodatcích A a B)

- Task 25 (mailové drivery) patří za Task 9, před Task 10.
- Task 26 (QR platba) — doménová část (`Iban`, `buildSpayd`) kdykoli po Tasku 3;
  napojení na e-mail a stránku až po Tasku 20.
- Task 27 (zpráva pro příjemce) navazuje přímo na Task 26.
- Task 28 (příznak zaplaceno) sahá do schématu, takže migrace patří k Tasku 2,
  ale zbytek se dělá až po Tasku 21 (administrace).

Kdo staví od nuly, může sloupec `paid_at` zahrnout rovnou do úvodní migrace v Tasku 2
a Task 28 pak začne krokem 2. Samostatná migrace má smysl jen tehdy, když už aplikace běží.
