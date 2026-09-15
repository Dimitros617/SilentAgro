/** Název cookie sdílený serverem a Edge middlewarem; bez závislostí na Node.js. */
export const SESSION_COOKIE = 'silentagro_session'

/**
 * Životnost session. Jedna konstanta pro `maxAge` cookie i pro `exp` v podpisu tokenu.
 * Kdyby se ta čísla rozešla, jedna z hranic by platila déle než druhá: buď by prohlížeč
 * posílal token, který server už odmítá, nebo by cookie zmizela dřív, než podpis vyprší.
 */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600
