import { expect, test } from '@playwright/test'
import { addToCart } from './helpers'

/**
 * Ukazatel skladu a váha vedle seznamu. Obojí jsou čísla převedená na pixely,
 * takže se dají zkontrolovat i bez oka — a bez toho by se rozbily tiše.
 */

const firstCard = (page: import('@playwright/test').Page) => page.getByRole('article').first()

test('ukazatel skladu ukáže, kolik rezervace ukrojí', async ({ page }) => {
  await page.goto('/burza')

  const card = firstCard(page)
  const name = (await card.getByRole('heading').innerText()).trim()

  // Před vložením je výplň v jednom kuse.
  await expect(card.locator('.meter__fill--cart')).toHaveCount(0)
  await expect(card.locator('.meter__fill--pending')).toHaveCount(1)

  await addToCart(page, name, 5)

  await expect(card.locator('.meter__fill--cart')).toHaveCount(1)
  await expect(card.locator('.meter__note')).toContainText('5 kg máte v košíku')

  const widths = await card.evaluate((el) => {
    const width = (selector: string) => {
      const found = el.querySelector(selector)
      return found ? (found as HTMLElement).getBoundingClientRect().width : 0
    }
    return {
      celek: width('.meter'),
      soucet:
        width('.meter__fill') + width('.meter__fill--cart') + width('.meter__fill--pending'),
    }
  })

  // Pásma nesmí přerůst lištu: košík ukazatel neprodlužuje, jen ho dělí.
  expect(widths.soucet).toBeLessThanOrEqual(widths.celek + 1)
})

test('u skladu se ukáže stav po odeslání košíku', async ({ page }) => {
  await page.goto('/burza')

  const card = firstCard(page)
  const name = (await card.getByRole('heading').innerText()).trim()
  const before = (await card.getByTestId(/^stock-/).first().innerText()).trim()

  await addToCart(page, name, 5)

  const after = card.locator('[data-testid^="stock-after-"]')
  await expect(after).toBeVisible()
  await expect(after).not.toHaveText(before)
})

/**
 * Váha je zatím ze stránky sundaná, dokud se nedodělá. Testy se nemažou —
 * popisují, jak se má chovat, a jsou hotové na chvíli, kdy se `<Scale />`
 * vrátí do `app/burza/page.tsx`. Čistá logika modelu se mezitím ověřuje dál
 * v `tests/unit/components/scale-model.test.ts`.
 */
test.describe.skip('váha', () => {
  test('váha nasype do pytle jednu bramboru za každé půl kilo', async ({ page }) => {
    await page.goto('/burza')

    const potatoes = page.locator('[data-testid="scale-potatoes"] .scale__potato')
    await expect(potatoes).toHaveCount(0)
    await expect(page.getByTestId('scale-total')).toContainText('prázdný')

    const card = firstCard(page)
    const name = (await card.getByRole('heading').innerText()).trim()
    await addToCart(page, name, 3)

    await expect(potatoes).toHaveCount(6)
    await expect(page.getByTestId('scale-total')).toContainText('3 kg')
  })

  test('rameno se po zhoupnutí vrátí do roviny', async ({ page }) => {
    await page.goto('/burza')

    const beam = page.locator('.scale__beam')
    const card = firstCard(page)
    const name = (await card.getByRole('heading').innerText()).trim()

    await addToCart(page, name, 2)
    // Hned po vložení klesne na stranu pytle…
    await expect(beam).toHaveAttribute('style', /rotate\(9deg\)/)
    // …a dorovná se. Bez dorovnání by rameno zůstalo viset a vypadalo rozbitě.
    await expect(beam).toHaveAttribute('style', /rotate\(0deg\)/, { timeout: 3000 })
  })

  test('miska s pytlem klesá na tu stranu, na kterou se nakloní rameno', async ({ page }) => {
    await page.goto('/burza')

    const card = firstCard(page)
    const name = (await card.getByRole('heading').innerText()).trim()
    await addToCart(page, name, 2)

    // Obálky misek se mezi sebou porovnat nedají — pytel je vyšší než sloupec
    // závaží. Čte se proto posun každé misky a otočení ramene, a to najednou,
    // než se rameno stihne dorovnat.
    await page.waitForTimeout(80)
    const state = await page.evaluate(() => {
      const shiftOf = (index: number) => {
        const element = document.querySelectorAll('.scale__pan')[index] as HTMLElement
        return Number.parseFloat(/translate\([^,]+,\s*([-\d.]+)px\)/.exec(element.style.transform)?.[1] ?? '0')
      }
      const beam = document.querySelector('.scale__beam') as HTMLElement
      return {
        rotace: Number.parseFloat(/rotate\(([-\d.]+)deg\)/.exec(beam.style.transform)?.[1] ?? '0'),
        zavazi: shiftOf(0),
        pytel: shiftOf(1),
      }
    })

    // Kladné otočení je v SVG po směru hodinových ručiček: pravý konec ramene
    // klesá. Pytel na něm visí, takže musí klesat taky — tedy mít větší `y` než
    // závaží. Obrácená znaménka rameno od misek odtrhnou.
    expect(state.rotace).toBeGreaterThan(0)
    expect(state.pytel).toBeGreaterThan(state.zavazi)
  })
})

test('nejde vložit víc, než kolik je skladem', async ({ page }) => {
  await page.goto('/burza')

  const card = firstCard(page)
  const name = (await card.getByRole('heading').innerText()).trim()
  const stock = Number.parseFloat(
    (await card.getByTestId(/^stock-/).first().innerText()).replace(/[^\d,]/g, '').replace(',', '.'),
  )

  const input = card.getByLabel(`Množství ${name} v kilogramech`)
  await input.fill(String(stock + 50))

  // Vstup se ořízne na sklad, ne na libovolné číslo.
  await expect(input).toHaveValue(String(stock).replace('.', ','))

  await card.getByRole('button', { name: 'Rezervovat' }).click()

  // Po vložení celého skladu už nezbývá nic, takže tlačítko nejde zmáčknout znovu.
  await expect(card.getByRole('button', { name: 'Rezervovat' })).toBeDisabled()
})
