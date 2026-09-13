/**
 * Politika obsahu (CSP). Modul je schválně bez jediného importu: staví ji middleware,
 * který běží na Edge runtime, kam `config/env.ts` ani nic z `infrastructure` nedosáhne.
 *
 * Politika se skládá na každý požadavek, protože `script-src` nese nonce. Dřív byla
 * statická v `next.config.ts` a musela kvůli bootstrap skriptu App Routeru pouštět
 * `'unsafe-inline'` — což je ve `script-src` přesně to, proti čemu CSP existuje.
 */

/** 16 bajtů = 128 bitů. Nonce se nesmí dát uhodnout dopředu, jinak nechrání před ničím. */
const NONCE_BYTES = 16

/**
 * Nonce v base64. Tvar není kosmetika: Next si ji z hlavičky čte regulárním výrazem
 * (`app-render/get-script-nonce-from-header`) a při neshodě ji **mlčky zahodí** —
 * stránka by se pak vykreslila bez skriptů a nikde by se neobjevila chyba.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * `nonce === null` je vývojový režim: `next dev` používá pro hot reload `eval` a vkládá
 * vlastní inline skripty, takže tam se `'unsafe-inline'` a `'unsafe-eval'` nechávají.
 * Produkce dostane nonce a tuhle větev nikdy neuvidí.
 *
 * `style-src` zůstává inline schválně — aplikace má stovky `style={{…}}` props a nonce
 * na atribut `style` neplatí. Zpřísnit to znamená přepsat je do tříd, což je jiná změna.
 */
export function buildCsp(nonce: string | null): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'"

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    // Fonty si `next/font` stáhne při sestavení a hostí je sám, proto žádný gstatic.
    "font-src 'self'",
    // `data:` kvůli QR kódu platby (src/infrastructure/payment/qr-code.ts).
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ')
}
