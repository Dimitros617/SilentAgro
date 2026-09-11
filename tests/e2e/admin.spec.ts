import { expect, test } from '@playwright/test'
import { loginAsFarmer } from './helpers'

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

test('špatné heslo farmáře nepustí dál a neprozradí, že účet existuje', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Přihlásit' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill('farma@silentagro.cz')
  await dialog.getByLabel('Heslo').fill('rozhodne-spatne-heslo')
  await dialog.getByRole('button', { name: 'Přihlásit se' }).click()

  await expect(dialog.getByText('Nesprávný e-mail nebo heslo')).toBeVisible()
})

test('farmář se přihlásí a vidí přehled', async ({ page }) => {
  await loginAsFarmer(page)

  await expect(page).toHaveURL(/\/admin/)
  await expect(page.getByText('Administrace farmáře')).toBeVisible()
  await expect(page.getByText('Sklad celkem')).toBeVisible()
})

test('farmář změní sklad a změna se projeví v burze', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/admin/sklad')

  const row = page.locator('.admin-row').first()
  await row.getByLabel(/^Sklad .* v kilogramech$/).fill('222')
  await row.getByRole('button', { name: 'Uložit' }).click()
  await expect(page.getByRole('status')).toContainText('uloženo')

  await page.goto('/burza')
  await expect(page.getByTestId('stock-bernie')).toContainText('222')
})

test('farmář zveřejní novinku a objeví se na homepage', async ({ page }) => {
  const title = `Test novinka ${Date.now()}`

  await loginAsFarmer(page)
  await page.goto('/admin/novinky')

  await page.getByLabel('Titulek novinky').fill(title)
  await page.getByLabel('Text novinky').fill('Napsáno end-to-end testem.')
  await page.getByRole('button', { name: 'Zveřejnit na homepage' }).click()
  await expect(page.getByRole('status')).toContainText('homepage')

  await page.goto('/')
  await expect(page.getByText(title)).toBeVisible()
})

test('farmář posouvá stav objednávky v cyklu', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/admin/objednavky')

  const statusButton = page.locator('.status-btn').first()
  const before = (await statusButton.innerText()).trim()

  await statusButton.click()
  await expect(statusButton).not.toHaveText(before)
})

test('farmář označí objednávku jako zaplacenou a označení přežije obnovení', async ({ page }) => {
  await loginAsFarmer(page)
  await page.goto('/admin/objednavky')

  const checkbox = page.getByLabel('Zaplaceno').first()
  const wasChecked = await checkbox.isChecked()

  await checkbox.setChecked(!wasChecked)
  await expect(checkbox).toBeChecked({ checked: !wasChecked })

  // Bez kontroly po obnovení by test prošel i zaškrtávátku, které si stav drží
  // jen v paměti prohlížeče.
  await page.reload()
  await expect(page.getByLabel('Zaplaceno').first()).toBeChecked({ checked: !wasChecked })
})

test('farmář se odhlásí a administrace mu zmizí', async ({ page }) => {
  await loginAsFarmer(page)

  await page.getByRole('button', { name: 'odhlásit' }).click()
  await expect(page.getByRole('button', { name: 'Přihlásit' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Administrace' })).toHaveCount(0)
})
