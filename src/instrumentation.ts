/**
 * Ověří konfiguraci hned při startu serveru.
 *
 * Konfigurace se jinak čte líně, až když ji někdo potřebuje — během `next build`
 * produkční prostředí neexistuje a ověřování při načtení modulu by build shodilo.
 * Důsledek ale byl, že překlep v `.env` se projevil až jako chyba 500 na každém
 * požadavku: provozovatel viděl prázdnou chybovou stránku a skutečný důvod musel
 * hledat v logu kontejneru.
 *
 * Tenhle hook běží při startu serveru a ne při sestavení, takže je to jediné místo,
 * kde se dá spadnout nahlas a včas.
 */
export async function register(): Promise<void> {
  // Hook se volá i pro Edge runtime, kde `process.exit` není k dispozici.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { getEnv } = await import('@/infrastructure/config/env')

  try {
    getEnv()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    console.error(
      [
        '',
        'Aplikace nenastartuje, protože konfigurace nedává smysl:',
        '',
        reason,
        '',
        'Hodnoty se berou ze souboru .env vedle docker-compose.yml.',
        'Vzor se všemi klíči i vysvětlením je v .env.example.',
        '',
      ].join('\n'),
    )

    process.exit(1)
  }
}
