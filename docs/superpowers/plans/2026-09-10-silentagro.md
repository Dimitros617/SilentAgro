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
