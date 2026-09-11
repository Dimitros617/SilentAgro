import { expect, type Page } from '@playwright/test'

export const FARMER_EMAIL = 'farma@silentagro.cz'

/** Soubor se session farmáře, který vyrobí `auth.setup.ts`. */
export const FARMER_STATE = 'tests/e2e/.auth/farmer.json'

/**
 * Heslo farmáře se bere z prostředí, stejné jako `SEED_FARMER_PASSWORD` při seedu.
 * Do repozitáře se žádné nezapisuje.
 */
export function farmerPassword(): string {
  const password = process.env.E2E_FARMER_PASSWORD
  if (!password) {
    throw new Error(
      'E2E testy vyžadují E2E_FARMER_PASSWORD se stejnou hodnotou, jakou dostal seed v SEED_FARMER_PASSWORD.',
    )
  }
  return password
}

/** Stav skladu odrůdy tak, jak ho ukazuje burza. */
export async function readStock(page: Page, slug: string): Promise<number> {
  const text = (await page.getByTestId(`stock-${slug}`).innerText()).trim()
  if (text === 'vyprodáno') return 0

  // "7,5 kg" i "1 234,5 kg" — nedělitelná i úzká mezera, česká čárka
  const normalized = text
    .replace(/[\s  ]/g, '')
    .replace('kg', '')
    .replace(',', '.')

  return Number.parseFloat(normalized)
}

export async function addToCart(page: Page, varietyName: string, kg: number): Promise<void> {
  const card = page.getByRole('article', { name: varietyName })
  await card.getByLabel(`Množství ${varietyName} v kilogramech`).fill(String(kg).replace('.', ','))
  await card.getByRole('button', { name: 'Rezervovat' }).click()
}

export interface CheckoutOptions {
  name?: string
  email?: string
  payment?: 'Hotově při převzetí' | 'Převodem na účet' | 'QR platba'
}

/** Projde košíkem až na stránku potvrzení. */
export async function checkout(page: Page, options: CheckoutOptions = {}): Promise<void> {
  await page.goto('/kosik')
  await page.getByLabel('Jméno a příjmení').fill(options.name ?? 'Jan Novák')
  await page.getByLabel(/E-mail/).fill(options.email ?? 'jan@email.cz')
  await page.getByRole('button', { name: options.payment ?? 'Hotově při převzetí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()
  await expect(page).toHaveURL(/\/rezervace\//)
}

/**
 * Hodnota z tabulky platebních údajů.
 *
 * Čte se přes řádek tabulky, ne `getByText` — číslo účtu i variabilní symbol se
 * na stránce objevují i v instrukci a v náhledu e-mailu, takže hledání podle textu
 * je nejednoznačné.
 */
export function paymentValue(page: Page, label: string) {
  return page.getByRole('row', { name: new RegExp(`^${label}`) }).locator('code')
}
