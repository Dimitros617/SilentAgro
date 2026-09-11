import QRCode from 'qrcode'

/**
 * Úroveň korekce `M` je kompromis ověřený praxí platebních QR: `L` selhává při focení
 * z displeje pod úhlem, `H` zahustí mřížku natolik, že na ni mobil hůř zaostří.
 * `margin: 2` je minimum, které čtečky spolehlivě zvládnou — bez klidové zóny
 * splyne kód s okolním textem.
 */
const OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  width: 320,
  color: { dark: '#14201aff', light: '#ffffffff' },
} as const

export const renderQrPng = (payload: string): Promise<Buffer> =>
  QRCode.toBuffer(payload, { ...OPTIONS, type: 'png' })

export const renderQrDataUrl = (payload: string): Promise<string> =>
  QRCode.toDataURL(payload, OPTIONS)

/**
 * Varianty, které při chybě vrací `null` místo výjimky.
 *
 * QR kód je pohodlí, ne jediná cesta k platbě — číslo účtu, částka a variabilní symbol
 * jsou vždycky i v textu. Selhání vykreslení proto nesmí shodit potvrzení objednávky
 * ani odeslání e-mailu.
 */
export async function tryRenderQrPng(payload: string): Promise<Buffer | null> {
  try {
    return await renderQrPng(payload)
  } catch {
    return null
  }
}

export async function tryRenderQrDataUrl(payload: string): Promise<string | null> {
  try {
    return await renderQrDataUrl(payload)
  } catch {
    return null
  }
}
