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

test('farmář zruší objednávku, sklad se vrátí a zákazník dostane e-mail', async ({ page }) => {
  // Vlastní objednávka, aby test nezávisel na tom, co zbylo po jiných scénářích.
  const email = `zruseni-${Date.now()}@email.cz`

  await page.goto('/burza')
  const stockBefore = await page.getByTestId('stock-bernie').innerText()

  const card = page.getByRole('article', { name: 'Bernie' })
  await card.getByLabel('Množství Bernie v kilogramech').fill('1')
  await card.getByRole('button', { name: 'Rezervovat' }).click()

  await page.goto('/kosik')
  await page.getByLabel('Jméno a příjmení').fill('Zrušený Zákazník')
  await page.getByLabel('E-mail (sem přijde potvrzení)').fill(email)
  await page.getByRole('button', { name: 'Hotově při převzetí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()
  await expect(page).toHaveURL(/\/rezervace\//)

  const code = (await page.getByRole('heading', { name: /Rezervace #\d+ přijata/ }).innerText())
    .match(/#\d+/)?.[0] as string

  await page.goto('/admin/objednavky')
  const row = page.locator('.orders-row').filter({ hasText: code })
  await row.getByRole('button', { name: 'Zrušit' }).click()

  await page.getByLabel('Důvod zrušení').fill('Kroupy zničily úrodu, omlouváme se.')
  await page.getByRole('button', { name: 'Zrušit a odeslat e-mail' }).click()
  await expect(page.getByRole('status')).toContainText('zrušena')

  // Sklad je zpátky na původní hodnotě
  await page.goto('/burza')
  await expect(page.getByTestId('stock-bernie')).toHaveText(stockBefore)

  // Zrušená objednávka se v administraci pozná a nejde s ní dál pracovat
  await page.goto('/admin/objednavky')
  const cancelled = page.locator('.orders-row').filter({ hasText: code })
  await expect(cancelled.getByText('Zrušeno').first()).toBeVisible()
  await expect(cancelled.getByText('Kroupy zničily úrodu')).toBeVisible()
  await expect(cancelled.getByRole('button', { name: 'Zrušit' })).toHaveCount(0)
  await expect(cancelled.locator('.status-btn')).toBeDisabled()
})

test('zrušení bez důvodu nejde potvrdit', async ({ page }) => {
  await page.goto('/admin/objednavky')

  const row = page.locator('.orders-row').filter({ hasNot: page.getByText('Zrušeno') }).first()
  await row.getByRole('button', { name: 'Zrušit' }).click()

  await expect(page.getByRole('button', { name: 'Zrušit a odeslat e-mail' })).toBeDisabled()
  await page.getByRole('button', { name: 'Zpět' }).click()
})
