/**
 * Rozdělení ukazatele skladu na tři pásma.
 *
 * Ukazatel odpovídá na otázku „jak plný je tenhle zásobník", takže celá šířka
 * je kapacita. Uvnitř výplně se zprava ukrajuje to, co ze skladu zmizí: nejdřív
 * množství, které zákazník právě nastavuje, pod ním to, co už má v košíku.
 * Odebíraná část je vpravo schválně — je to ta, která z ukazatele zmizí.
 */
export interface MeterSegments {
  /** Co na skladě zůstane, když se košík odešle. */
  remainingPercent: number
  /** Co už leží v košíku. */
  cartPercent: number
  /** Co přidá právě nastavené číslo ve vstupu. */
  pendingPercent: number
}

export interface MeterInput {
  stockKg: number
  capacityKg: number
  inCartKg: number
  pendingKg: number
}

/**
 * Pásma se ořezávají na skutečný sklad. Košík je stav v prohlížeči a může být
 * starší než sklad — odrůdu mezitím mohl koupit někdo jiný. Bez ořezu by pásmo
 * přeteklo mimo lištu a ukazatel by tvrdil, že je skladu víc, než kolik ho je.
 */
export function meterSegments({
  stockKg,
  capacityKg,
  inCartKg,
  pendingKg,
}: MeterInput): MeterSegments {
  if (capacityKg <= 0) {
    return { remainingPercent: 0, cartPercent: 0, pendingPercent: 0 }
  }

  const stock = Math.max(0, stockKg)
  const cart = Math.min(Math.max(0, inCartKg), stock)
  const pending = Math.min(Math.max(0, pendingKg), stock - cart)
  // Vrácená rezervace smí překročit nově sníženou kapacitu. Graf zůstává v liště.
  const scaleKg = Math.max(capacityKg, stock)
  const share = (kg: number) => (kg / scaleKg) * 100

  return {
    remainingPercent: share(stock - cart - pending),
    cartPercent: share(cart),
    pendingPercent: share(pending),
  }
}
