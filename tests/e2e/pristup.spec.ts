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

test('špatné heslo farmáře nepustí dál', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Přihlásit' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill('farma@silentagro.cz')
  await dialog.getByLabel('Heslo').fill('rozhodne-spatne-heslo')
  await dialog.getByRole('button', { name: 'Přihlásit se' }).click()

  // Stejná hláška jako u neexistujícího účtu — jinak by šlo vyjmenovat registrované adresy.
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
