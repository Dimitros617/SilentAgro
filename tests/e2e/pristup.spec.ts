import { expect, test } from '@playwright/test'

test('nepřihlášený návštěvník se do administrace nedostane', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/prihlaseni=vyzadovano/)
})

test('nepřihlášený návštěvník se nedostane ani do podstránek administrace', async ({ page }) => {
  for (const path of ['/admin/sklad', '/admin/objednavky', '/admin/novinky']) {
    await page.goto(path)
    await expect(page).toHaveURL(/prihlaseni=vyzadovano/)
  }
})

test('přesměrování z administrace otevře přihlašovací okno', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('špatné přihlašovací údaje nepustí dál', async ({ page }) => {
  /*
   * Pokaždé jiná adresa. Aplikace omezuje pokusy na účet (pět za čtvrt hodiny)
   * a opakované spuštění sady na jedné adrese by narazilo na limit — tedy na
   * ochranu, která funguje, ne na chybu.
   *
   * Že *existující* účet se špatným heslem hlásí totéž co neznámý e-mail,
   * ověřuje unit test; ten se o rate limit opřít nemůže.
   */
  const email = `neznamy-${Date.now()}@email.cz`

  await page.goto('/')
  await page.getByRole('button', { name: 'Přihlásit' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill(email)
  await dialog.getByLabel('Heslo').fill('rozhodne-spatne-heslo')
  await dialog.getByRole('button', { name: 'Přihlásit se' }).click()

  await expect(dialog.getByRole('alert')).toContainText('Nesprávný e-mail nebo heslo')
  await expect(page.getByRole('link', { name: 'Administrace' })).toHaveCount(0)
})

test('neexistující stránka vrátí rozcestník', async ({ page }) => {
  const response = await page.goto('/tahle-stranka-neexistuje')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Tady nic není' })).toBeVisible()
})

test('neplatný token rezervace nic neprozradí', async ({ page }) => {
  const response = await page.goto('/rezervace/tenhle-token-nikdy-neexistoval')
  expect(response?.status()).toBe(404)
})
