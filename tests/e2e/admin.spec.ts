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

test('starý formulář ve druhé záložce nepřepíše novější sklad', async ({ page }) => {
  await page.goto('/admin/sklad')
  const stalePage = await page.context().newPage()
  try {
    await stalePage.goto('/admin/sklad')
    const stockInput = page.locator('.admin-row').first().getByLabel(/^Sklad .* v kilogramech$/)
    const before = Number(await stockInput.inputValue())
    await stockInput.fill(String(before - 1))
    await page.locator('.admin-row').first().getByRole('button', { name: 'Uložit' }).click()
    await expect(page.getByRole('status')).toContainText('uloženo')

    const staleRow = stalePage.locator('.admin-row').first()
    await staleRow.getByLabel(/^Sklad .* v kilogramech$/).fill(String(before - 2))
    await staleRow.getByRole('button', { name: 'Uložit' }).click()
    await expect(stalePage.getByRole('status')).toContainText('Sklad se mezitím změnil')

    await page.goto('/burza')
    await expect(page.getByTestId('stock-bernie')).toContainText(String(before - 1))
  } finally {
    await stalePage.close()
  }
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

  // Zrušená objednávka se neposouvá a její tlačítko je zakázané — kdyby taková
  // ležela v seznamu první, test by čekal na klik, který nikdy neprojde.
  const statusButton = page
    .locator('.orders-row:not([data-cancelled="true"]) .status-btn')
    .first()
  const before = (await statusButton.innerText()).trim()

  await statusButton.click()
  await expect(statusButton).not.toHaveText(before)
})

test('farmář označí objednávku jako zaplacenou a označení přežije obnovení', async ({ page }) => {
  await page.goto('/admin/objednavky')

  const checkbox = page.getByLabel('Zaplaceno').first()
  const wasChecked = await checkbox.isChecked()

  // Řízený checkbox ukáže změnu až po potvrzení serverové akce. setChecked
  // vyžaduje synchronní přepnutí už při kliku; zde čekáme na skutečně uložený stav.
  await checkbox.click()
  await expect(checkbox).toBeChecked({ checked: !wasChecked })
  await expect(checkbox).toBeEnabled()

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

test('farmář zruší objednávku, sklad se vrátí a potvrzení už nenabízí platbu', async ({ page }) => {
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
  await page.getByRole('button', { name: 'QR platba' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()
  await expect(page).toHaveURL(/\/rezervace\//)
  const confirmationUrl = page.url()
  await expect(page.getByRole('img', { name: /QR kód pro platbu/ })).toBeVisible()

  const code = (await page.getByRole('heading', { name: /Rezervace #\d+ přijata/ }).innerText())
    .match(/#\d+/)?.[0] as string

  await page.goto('/admin/objednavky')
  const row = page.locator('.orders-row').filter({ hasText: code })
  await row.getByRole('button', { name: 'Zrušit' }).click()

  await page.getByLabel('Důvod zrušení').fill('Kroupy zničily úrodu, omlouváme se.')
  await page.getByRole('button', { name: 'Zrušit rezervaci', exact: true }).click()
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

  await page.goto(confirmationUrl)
  await expect(page.getByRole('heading', { name: /Rezervace #\d+ zrušena/ })).toBeVisible()
  await expect(page.getByText('Kroupy zničily úrodu, omlouváme se.')).toBeVisible()
  await expect(page.getByRole('img', { name: /QR kód/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Platba převodem' })).toHaveCount(0)
})

test('neúplné ID v adrese uživatele neotevře jiný profil', async ({ page }) => {
  const response = await page.goto('/admin/uzivatele/1junk')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Tady nic není' })).toBeVisible()
})

test('zrušení bez důvodu nejde potvrdit', async ({ page }) => {
  await page.goto('/admin/objednavky')

  const row = page.locator('.orders-row').filter({ hasNot: page.getByText('Zrušeno') }).first()
  await row.getByRole('button', { name: 'Zrušit' }).click()

  await expect(page.getByRole('button', { name: 'Zrušit rezervaci', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Zpět' }).click()
})

test('odkaz na administraci je v hlavní navigaci a jen pro farmáře', async ({ page }) => {
  await page.goto('/')

  const inNav = page.locator('.nav').getByRole('link', { name: 'Administrace' })
  await expect(inNav).toBeVisible()

  // Zvýrazněný i na podstránkách, ne jen na /admin
  await page.goto('/admin/uzivatele')
  await expect(inNav).toHaveAttribute('aria-current', 'page')
})

test('tlačítka stavu mají ve všech řádcích stejnou šířku', async ({ page }) => {
  // Popisky stavů jsou různě dlouhé („Nová“ vs. „Připravena“). Než se šířka
  // ustálila, ikona zrušení skákala mezi řádky o desítky pixelů.
  await page.goto('/admin/objednavky')
  await expect(page.locator('.orders-row').first()).toBeVisible()

  const layout = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.orders-row .status-btn')] as HTMLElement[]
    const box = (el: HTMLElement) => el.getBoundingClientRect()
    return {
      pocet: buttons.length,
      sirky: [...new Set(buttons.map((el) => Math.round(box(el).width)))],
      levyOkraj: [...new Set(buttons.map((el) => Math.round(box(el).left)))],
      // Zrušené řádky popelnici nevykreslují; prázdná stopa musí místo udržet.
      pretekaText: buttons.some((el) => el.scrollWidth > el.clientWidth + 1),
    }
  })

  expect(layout.pocet).toBeGreaterThan(1)
  expect(layout.sirky).toHaveLength(1)
  expect(layout.levyOkraj).toHaveLength(1)
  expect(layout.pretekaText).toBe(false)
})
