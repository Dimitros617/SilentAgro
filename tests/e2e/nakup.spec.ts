import { expect, test } from '@playwright/test'
import { addToCart, checkout, paymentValue, readStock } from './helpers'

test('po ztracené odpovědi a obnovení stránky nevytvoří druhou rezervaci', async ({ page }) => {
  await page.goto('/burza')
  const before = await readStock(page, 'bernie')
  await addToCart(page, 'Bernie', 1)
  await page.goto('/kosik')
  await page.getByLabel('Jméno a příjmení').fill('Obnova rezervace')
  await page.getByLabel('E-mail (sem přijde potvrzení)').fill(`obnova-${Date.now()}@example.cz`)
  await page.getByRole('button', { name: 'Hotově při převzetí' }).click()
  let loseResponse = true
  await page.route('**/kosik', async (route) => {
    if (loseResponse && route.request().headers()['next-action']) {
      loseResponse = false
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      // Server už požadavek dokončil; prohlížeč výsledek nedostal.
      await route.abort('failed')
    } else {
      await route.continue()
    }
  })
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Znovu ověřit rezervaci' }).click()
  await expect(page).toHaveURL(/\/rezervace\//)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('silentagro:reservation-attempt:v1'))).toBeNull()
  await page.goto('/burza')
  expect(await readStock(page, 'bernie')).toBe(before - 1)
})

test('domovská stránka ukazuje stav skladu a novinky z pole', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Rezervujte si brambory/ })).toBeVisible()
  await expect(page.getByText('Aktuálně na skladě')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Novinky z pole' })).toBeVisible()
})

test('burza ukazuje odrůdy a vyprodanou označí', async ({ page }) => {
  await page.goto('/burza')

  await expect(page.getByRole('article', { name: 'Bernie' })).toBeVisible()
  await expect(page.getByText('Vyprodáno — čekáme na další výkop')).toBeVisible()
})

test('zákazník si rezervuje brambory a dostane potvrzení', async ({ page }) => {
  const email = `potvrzeni-${Date.now()}@email.cz`

  await page.goto('/burza')
  await addToCart(page, 'Bernie', 2.5)
  await checkout(page, { email })

  await expect(page.getByRole('heading', { name: /Rezervace #\d+ přijata/ })).toBeVisible()
  await expect(page.getByText(email).first()).toBeVisible()

  // Náhled obou odeslaných zpráv
  await expect(page.getByText('E-mail zákazníkovi')).toBeVisible()
  await expect(page.getByText('E-mail farmáři')).toBeVisible()
})

test('rezervace se okamžitě odečte ze skladu', async ({ page }) => {
  await page.goto('/burza')
  const before = await readStock(page, 'bernie')

  await addToCart(page, 'Bernie', 1)
  await checkout(page)

  await page.goto('/burza')
  expect(await readStock(page, 'bernie')).toBe(before - 1)
})

test('při QR platbě se zobrazí kód i platební údaje', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)
  await checkout(page, { payment: 'QR platba' })

  await expect(page.getByRole('img', { name: /QR kód pro platbu/ })).toBeVisible()
  await expect(paymentValue(page, 'Číslo účtu')).toHaveText('2000145399/0800')
  await expect(paymentValue(page, 'IBAN')).toHaveText('CZ65 0800 0000 1920 0014 5399')
  await expect(paymentValue(page, 'Zpráva pro příjemce')).toHaveText(/^Agro:\d+$/)
  // Stejná věta je i v náhledu e-mailu, proto se hledá jen v platební sekci.
  const paymentSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Platba převodem' }) })
  await expect(paymentSection.getByText(/Do zprávy pro příjemce prosím napište/)).toBeVisible()
})

test('variabilní symbol odpovídá číslu objednávky', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)
  await checkout(page, { payment: 'Převodem na účet' })

  const heading = await page.getByRole('heading', { name: /Rezervace #\d+ přijata/ }).innerText()
  const code = heading.replace(/\D/g, '')

  await expect(paymentValue(page, 'Variabilní symbol')).toHaveText(code)
  await expect(paymentValue(page, 'Zpráva pro příjemce')).toHaveText(`Agro:${code}`)
})

test('při platbě hotově se QR kód nezobrazí', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)
  await checkout(page, { payment: 'Hotově při převzetí' })

  await expect(page.getByRole('img', { name: /QR kód/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Platba převodem' })).toHaveCount(0)
})

test('prázdný košík nabídne cestu do burzy', async ({ page }) => {
  await page.goto('/kosik')
  await expect(page.getByText('Košík je zatím prázdný')).toBeVisible()

  await page.getByRole('link', { name: 'Do burzy' }).click()
  await expect(page).toHaveURL(/\/burza/)
})

test('objednávka bez jména a e-mailu neprojde', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)

  await page.goto('/kosik')
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page.getByText('Vyplňte jméno a příjmení')).toBeVisible()
  await expect(page.getByText('Vyplňte e-mail')).toBeVisible()
  await expect(page).not.toHaveURL(/\/rezervace\//)
})

test('u rozvozu je potřeba telefon', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)

  await page.goto('/kosik')
  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel('E-mail (sem přijde potvrzení)').fill('jan@email.cz')
  await page.getByRole('button', { name: 'Rozvoz po okolí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page.getByText('U rozvozu potřebujeme telefon')).toBeVisible()
})

test('košík přežije opakované obnovení stránky včetně množství', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1.5)

  await page.reload()
  await expect(page.getByRole('link', { name: /Košík/ })).toContainText('1')
  await page.reload()
  await page.goto('/kosik')
  await expect(page.locator('.cart__line').filter({ hasText: 'Bernie' })).toContainText('1,5 kg')
})

test('stránka skladu ukazuje graf a mapu polí', async ({ page }) => {
  await page.goto('/sklad')

  await expect(page.getByRole('heading', { name: 'Sklad v reálném čase' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Denní výkop a stav skladu/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mapa polí' })).toBeVisible()
})
