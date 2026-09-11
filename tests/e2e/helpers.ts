import { expect, type Page } from '@playwright/test'

export const FARMER_EMAIL = 'farma@silentagro.cz'

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

export async function loginAsFarmer(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Přihlásit' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill(FARMER_EMAIL)
  await dialog.getByLabel('Heslo').fill(farmerPassword())
  await dialog.getByRole('button', { name: 'Přihlásit se' }).click()

  // Po přihlášení farmáře aplikace přesměruje rovnou do administrace.
  await expect(page.getByRole('link', { name: 'Administrace' })).toBeVisible()
}

/** Stav skladu odrůdy tak, jak ho ukazuje burza. */
export async function readStock(page: Page, slug: string): Promise<number> {
  const text = (await page.getByTestId(`stock-${slug}`).innerText()).trim()
  if (text === 'vyprodáno') return 0

  // "7,5 kg" i "1 234,5 kg" — nedělitelná mezera i čárka
  const normalized = text
    .replace(/\s| | /g, '')
    .replace('kg', '')
    .replace(',', '.')

  return Number.parseFloat(normalized)
}

export async function addToCart(page: Page, varietyName: string, kg: number): Promise<void> {
  const card = page.getByRole('article', { name: varietyName })
  await card.getByLabel(`Množství ${varietyName} v kilogramech`).fill(String(kg).replace('.', ','))
  await card.getByRole('button', { name: 'Rezervovat' }).click()
}
