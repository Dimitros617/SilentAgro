import { expect, test } from '@playwright/test'
import { addToCart, readStock } from './helpers'

test('domovská stránka ukazuje stav skladu a novinky z pole', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Rezervujte si brambory/ })).toBeVisible()
  await expect(page.getByText('Aktuálně na skladě')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Novinky z pole' })).toBeVisible()
})

test('zákazník si rezervuje brambory a dostane potvrzení', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 2.5)

  await page.getByRole('link', { name: /Košík/ }).click()

  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel(/E-mail/).fill('jan@email.cz')
  await page.getByRole('button', { name: 'Hotově při převzetí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page).toHaveURL(/\/rezervace\//)
  await expect(page.getByRole('heading', { name: /Rezervace #\d+ přijata/ })).toBeVisible()
  await expect(page.getByText('jan@email.cz').first()).toBeVisible()

  // Náhled obou odeslaných zpráv
  await expect(page.getByText('E-mail zákazníkovi')).toBeVisible()
  await expect(page.getByText('E-mail farmáři')).toBeVisible()
})

test('rezervace se okamžitě odečte ze skladu', async ({ page }) => {
  await page.goto('/burza')
  const before = await readStock(page, 'bernie')

  await addToCart(page, 'Bernie', 1)
  await page.getByRole('link', { name: /Košík/ }).click()
  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel(/E-mail/).fill('jan@email.cz')
  await page.getByRole('button', { name: 'Hotově při převzetí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()
  await expect(page).toHaveURL(/\/rezervace\//)

  await page.goto('/burza')
  expect(await readStock(page, 'bernie')).toBe(before - 1)
})

test('při QR platbě se zobrazí kód, číslo účtu i zpráva pro příjemce', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)

  await page.getByRole('link', { name: /Košík/ }).click()
  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel(/E-mail/).fill('jan@email.cz')
  await page.getByRole('button', { name: 'QR platba' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page).toHaveURL(/\/rezervace\//)
  await expect(page.getByRole('img', { name: /QR kód pro platbu/ })).toBeVisible()
  await expect(page.getByText('2000145399/0800')).toBeVisible()
  await expect(page.getByText(/^Agro:\d+$/)).toBeVisible()
  await expect(page.getByText(/Do zprávy pro příjemce/)).toBeVisible()
})

test('při platbě hotově se QR kód nezobrazí', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1)

  await page.getByRole('link', { name: /Košík/ }).click()
  await page.getByLabel('Jméno a příjmení').fill('Jan Novák')
  await page.getByLabel(/E-mail/).fill('jan@email.cz')
  await page.getByRole('button', { name: 'Hotově při převzetí' }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page).toHaveURL(/\/rezervace\//)
  await expect(page.getByRole('img', { name: /QR kód/ })).toHaveCount(0)
  await expect(page.getByText('Variabilní symbol')).toHaveCount(0)
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

  await page.getByRole('link', { name: /Košík/ }).click()
  await page.getByRole('button', { name: 'Závazně rezervovat' }).click()

  await expect(page.getByText('Vyplňte jméno a příjmení')).toBeVisible()
  await expect(page.getByText('Vyplňte e-mail')).toBeVisible()
  await expect(page).not.toHaveURL(/\/rezervace\//)
})

test('košík přežije obnovení stránky', async ({ page }) => {
  await page.goto('/burza')
  await addToCart(page, 'Bernie', 1.5)

  await page.reload()
  await expect(page.getByRole('link', { name: /Košík/ })).toContainText('1')
})
