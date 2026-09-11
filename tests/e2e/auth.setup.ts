import { expect, test as setup } from '@playwright/test'
import { FARMER_EMAIL, FARMER_STATE, farmerPassword } from './helpers'

/**
 * Přihlásí farmáře jednou a uloží session pro všechny admin testy.
 *
 * Přihlašovat se v každém testu znovu nejde: aplikace omezuje počet pokusů na pět
 * a šestý test by dostal „příliš mnoho pokusů". Zvyšovat limit kvůli testům by
 * znamenalo oslabit ochranu kvůli něčemu, co se dá vyřešit sdílenou session.
 */
setup('přihlásit farmáře', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Přihlásit' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('E-mail').fill(FARMER_EMAIL)
  await dialog.getByLabel('Heslo').fill(farmerPassword())
  await dialog.getByRole('button', { name: 'Přihlásit se' }).click()

  await expect(page.getByRole('link', { name: 'Administrace' })).toBeVisible()
  await page.context().storageState({ path: FARMER_STATE })
})
