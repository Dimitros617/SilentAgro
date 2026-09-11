/**
 * Čistá logika váhy. Drží se mimo komponentu, aby se dala ověřit bez prohlížeče —
 * rozmístění brambor v pytli i náklon ramene jsou právě ty věci, které se snadno
 * rozbijí a v testu s myší by si toho nikdo nevšiml.
 */

/** Rezervuje se po půl kile, takže jedno půlkilo = jedna brambora. */
export const KG_PER_POTATO = 0.5

/**
 * Strop na počet vykreslených brambor. Deset kilo je dvacet kusů; bez stropu by
 * větší objednávka pytel přeplnila a animace by běžela několik sekund.
 * Nad stropem se pytel už jen tváří plný a skutečné číslo hlásí popisek.
 */
export const MAX_POTATOES = 20

/** Kolik brambor odpovídá množství v košíku. */
export function potatoCount(totalKg: number): number {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return 0
  return Math.round(totalKg / KG_PER_POTATO)
}

/** Kolik jich pytel skutečně ukáže. */
export function visiblePotatoes(totalKg: number): number {
  return Math.min(potatoCount(totalKg), MAX_POTATOES)
}

/** Závaží na levé misce: jedno na každý započatý kilogram, nejvýš šest. */
export const MAX_WEIGHTS = 6

export function weightCount(totalKg: number): number {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return 0
  return Math.min(Math.ceil(totalKg), MAX_WEIGHTS)
}

/**
 * Deterministický šum. `Math.random()` by se nedal použít: server a prohlížeč
 * by vykreslily jiné pytle a React by ohlásil hydratační chybu. Navíc by se
 * brambory přeskládaly při každém překreslení.
 */
function noise(seed: number): number {
  const value = Math.sin(seed * 127.1) * 43758.5453
  return value - Math.floor(value)
}

export interface PotatoPlacement {
  x: number
  y: number
  rotate: number
  scale: number
  /** Pořadí v řadě zdola; řídí zpoždění animace při sypání. */
  delayMs: number
}

const PER_ROW = 4
const ROW_HEIGHT = 9.5

/**
 * Brambory se skládají zdola po řadách a každá dostane vlastní odchylku, aby
 * hromada nevypadala jako mřížka. Souřadnice jsou v uživatelských jednotkách
 * SVG, počátek uprostřed dna pytle.
 */
export function potatoPlacement(index: number): PotatoPlacement {
  const row = Math.floor(index / PER_ROW)
  const column = index % PER_ROW

  return {
    x: -24.5 + column * 16.5 + (noise(index) * 8 - 4),
    y: 30 - row * ROW_HEIGHT + (noise(index + 97) * 4 - 2),
    rotate: noise(index + 13) * 70 - 35,
    scale: 0.82 + noise(index + 41) * 0.3,
    delayMs: index * 60,
  }
}

/**
 * Náklon ramene ve stupních.
 *
 * Váha je vážní stanice, ne porovnání: závaží vlevo vždycky odpovídají obsahu
 * pytle, takže v klidu stojí rovně. Rameno se rozhoupe jen při změně — dolů na
 * stranu pytle, když brambory přibudou, a opačně, když ubudou. Bez toho by
 * stálo napořád v jedné poloze a vypadalo rozbitě.
 */
export const TILT_DEGREES = 9

/** Poloviční délka ramene a výška čepu v jednotkách SVG. */
export const BEAM_HALF = 80
export const BEAM_PIVOT_Y = 60

/**
 * Svislý posun obou misek pro daný náklon ramene.
 *
 * V SVG roste `y` dolů, takže kladné otočení je po směru hodinových ručiček a
 * pravý konec ramene **klesá**. Miska s pytlem na něm visí, takže musí klesat
 * s ním. Původně měla každá miska znaménko naopak a rameno se naklánělo na
 * jednu stranu, zatímco pytel stoupal na druhou — jako by mezi nimi nic nebylo.
 */
export function panShift(tiltDegrees: number): { left: number; right: number } {
  const shift = BEAM_HALF * Math.sin((tiltDegrees * Math.PI) / 180)
  return { left: -shift, right: shift }
}

export function tiltSequence(delta: number): number[] {
  if (delta === 0) return [0]
  const direction = delta > 0 ? 1 : -1
  // Dokmit na opačnou stranu, pak klid — rameno se dorovná, ne zasekne.
  return [direction * TILT_DEGREES, direction * -TILT_DEGREES * 0.35, 0]
}
