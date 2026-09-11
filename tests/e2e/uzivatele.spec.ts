import { expect, test } from '@playwright/test'

// Session farmáře dodá projekt `prihlaseni` přes storageState.

test('seznam uživatelů ukazuje stav ověření a počet objednávek', async ({ page }) => {
  await page.goto('/admin/uzivatele')

  await expect(page.getByRole('link', { name: 'Uživatelé' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const farmerRow = page.locator('.users-row').filter({ hasText: 'farma@silentagro.cz' })
  await expect(farmerRow).toBeVisible()
  // `exact`, jinak by vzor sedl i na jméno „Farmář Milan“
  await expect(farmerRow.getByText('Farmář', { exact: true })).toBeVisible()
  await expect(farmerRow.getByText('Ověřen', { exact: true })).toBeVisible()
})

test('hledání zúží seznam', async ({ page }) => {
  await page.goto('/admin/uzivatele')
  const total = await page.locator('.users-row').count()

  await page.getByLabel('Hledat uživatele').fill('farma@silentagro.cz')
  await expect(page.locator('.users-row')).toHaveCount(1)

  await page.getByLabel('Hledat uživatele').fill('')
  await expect(page.locator('.users-row')).toHaveCount(total)
})

test('profil farmáře nenabízí deaktivaci', async ({ page }) => {
  // farmář by si tím zamkl vlastní přístup do administrace
  await page.goto('/admin/uzivatele')
  await page
    .locator('.users-row')
    .filter({ hasText: 'farma@silentagro.cz' })
    .getByRole('link', { name: 'Profil' })
    .click()

  await expect(page.getByRole('button', { name: 'Deaktivovat účet' })).toHaveCount(0)
})

test('farmář pošle zákazníkovi zprávu', async ({ page }) => {
  await page.goto('/admin/uzivatele')
  await page
    .locator('.users-row')
    .filter({ hasText: 'farma@silentagro.cz' })
    .getByRole('link', { name: 'Profil' })
    .click()

  await page.getByLabel('Předmět').fill('Zpráva z testu')
  await page.getByLabel('Text').fill('Text zprávy z end-to-end testu.')
  await page.getByRole('button', { name: 'Odeslat zprávu' }).click()

  await expect(page.getByRole('status')).toContainText('odeslána')
})

test('zpráva bez předmětu nejde odeslat', async ({ page }) => {
  await page.goto('/admin/uzivatele')
  await page
    .locator('.users-row')
    .filter({ hasText: 'farma@silentagro.cz' })
    .getByRole('link', { name: 'Profil' })
    .click()

  await page.getByLabel('Text').fill('Jen text bez předmětu.')
  await expect(page.getByRole('button', { name: 'Odeslat zprávu' })).toBeDisabled()
})

test('neexistující profil vrátí rozcestník', async ({ page }) => {
  const response = await page.goto('/admin/uzivatele/999999')
  expect(response?.status()).toBe(404)
})
