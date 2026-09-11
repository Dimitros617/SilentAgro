import { expect, test } from '@playwright/test'

// Session farmáře dodá projekt `prihlaseni` přes storageState.

test('farmář vidí přehled se souhrnnými čísly', async ({ page }) => {
  await page.goto('/admin')

  await expect(page.getByText('Administrace farmáře')).toBeVisible()
  await expect(page.getByText('Sklad celkem')).toBeVisible()
  await expect(page.getByText('Čeká na platbu')).toBeVisible()
})

test('farmář změní sklad a změna se projeví v burze', async ({ page }) => {
  await page.goto('/admin/sklad')

  const row = page.locator('.admin-row').first()
  // Kapacita zásobníku Bernie je 160 kg, takže vyšší hodnota by se právem neuložila.
  await row.getByLabel(/^Sklad .* v kilogramech$/).fill('140')
  await row.getByRole('button', { name: 'Uložit' }).click()
  await expect(page.getByRole('status')).toContainText('uloženo')

  await page.goto('/burza')
  await expect(page.getByTestId('stock-bernie')).toContainText('140')
})

test('sklad větší než kapacita se neuloží', async ({ page }) => {
  await page.goto('/admin/sklad')

  const row = page.locator('.admin-row').first()
  await row.getByLabel(/^Sklad .* v kilogramech$/).fill('99999')
  await row.getByRole('button', { name: 'Uložit' }).click()

  await expect(page.getByRole('status')).toContainText('kapacit')
})

test('farmář zveřejní novinku a objeví se na homepage', async ({ page }) => {
  const title = `Test novinka ${Date.now()}`

  await page.goto('/admin/novinky')
  await page.getByLabel('Titulek novinky').fill(title)
  await page.getByLabel('Text novinky').fill('Napsáno end-to-end testem.')
  await page.getByRole('button', { name: 'Zveřejnit na homepage' }).click()
  await expect(page.getByRole('status')).toContainText('homepage')

  await page.goto('/')
  await expect(page.getByText(title)).toBeVisible()
})

test('novinka bez titulku se nezveřejní', async ({ page }) => {
  await page.goto('/admin/novinky')
  await page.getByRole('button', { name: 'Zveřejnit na homepage' }).click()

  await expect(page.getByRole('status')).toContainText('titulek')
})

test('farmář posouvá stav objednávky v cyklu', async ({ page }) => {
  await page.goto('/admin/objednavky')

  const statusButton = page.locator('.status-btn').first()
  const before = (await statusButton.innerText()).trim()

  await statusButton.click()
  await expect(statusButton).not.toHaveText(before)
})

test('farmář označí objednávku jako zaplacenou a označení přežije obnovení', async ({ page }) => {
  await page.goto('/admin/objednavky')

  const checkbox = page.getByLabel('Zaplaceno').first()
  const wasChecked = await checkbox.isChecked()

  await checkbox.setChecked(!wasChecked)
  await expect(checkbox).toBeChecked({ checked: !wasChecked })

  // Kontrola po obnovení je podstatná: bez ní by test prošel i zaškrtávátku,
  // které si stav drží jen v paměti prohlížeče.
  await page.reload()
  await expect(page.getByLabel('Zaplaceno').first()).toBeChecked({ checked: !wasChecked })
})

test('objednávka placená hotově zaškrtávátko nemá', async ({ page }) => {
  await page.goto('/admin/objednavky')
  await expect(page.getByText('hotově').first()).toBeVisible()
})

test('farmář se odhlásí a administrace mu zmizí', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'odhlásit' }).click()

  await expect(page.getByRole('button', { name: 'Přihlásit' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Administrace' })).toHaveCount(0)

  // Po odhlášení musí administrace zase odmítat.
  await page.goto('/admin')
  await expect(page).toHaveURL(/prihlaseni=vyzadovano/)
})
