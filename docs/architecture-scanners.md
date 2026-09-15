# Kontroly architektury a kvality testů

Projekt používá dependency-cruiser 18.3.1, StrykerJS 10.0.0 a Semgrep CE 1.177.0.
Verze npm nástrojů jsou připnuté v `package-lock.json`; Semgrep používá konkrétní
Docker image včetně SHA256. Není potřeba účet u žádné cloudové služby.

## Spuštění

Z kořene projektu, s Node.js 22 nebo 24:

```sh
npm ci
npm run db:generate
npm run quality:architecture
npm run quality:architecture:test
npm run quality:semgrep:test
npm run quality:semgrep
npm run quality:mutation
```

Semgrep potřebuje běžící Docker. První spuštění stáhne image; samotný kontejner
skenuje bez sítě. Dostane jen zdroje, pravidla a testovací ukázky, připojené pro čtení.
Stryker používá unit testy s paměťovými náhradami; databázové a E2E testy nejsou
součástí jeho konfigurace. Mutace provádí v dočasné kopii `.stryker-tmp/`.

| Příkaz | Výstup |
|---|---|
| `quality:architecture` | Čitelný seznam porušení a nenulový exit při chybě |
| `quality:scan` | Stávající statické analyzátory a nově `reports/quality/architecture.json` |
| `quality:semgrep:test` | `reports/quality/semgrep-tests.json` |
| `quality:semgrep` | `reports/quality/semgrep.json`; nález nebo chyba ukončí příkaz nenulovým kódem |
| `quality:mutation` | `reports/quality/mutation/index.html` a `mutation.json`; skóre pod 80 % způsobí chybu |

`quality:scan` zůstává rychlejším během bez Dockeru a mutací. Semgrep a Stryker mají
v CI vlastní úlohy, takže jejich výsledky lze posuzovat samostatně. Ručně spouštěný
workflow **Code quality review** spouští všechny kontroly a uchovává reporty.
Konfigurace GitHub Actions je součástí změny; místní ověření není výsledkem běhu na GitHubu.

## Pravidla architektury

ESLint i dependency-cruiser používají společnou mapu v
[`architecture/layers.mjs`](../architecture/layers.mjs). Detailní kontroly
ESLintu nad AST zůstávají zachované. Dependency-cruiser navíc sestaví celý graf:

- Zakazuje nepovolený směr importů, nerozpoznané importy a produkční import vývojové závislosti.
- Kontroluje i nepřímou cestu z domény, aplikace či shared do infrastruktury nebo externí knihovny.
- Cykly za běhu jsou chyby. Cykly obsahující typovou vazbu jsou varování k posouzení.
- Komponenty mohou používat server actions a pouze typy z aplikačního DTO.
- Vrstva `app` sestavuje aplikaci a může importovat jednotlivé vrstvy.

Typové importy se analyzují; nejsou plošně vynechané. Cizí balíčky zůstávají
viditelné jako závislosti, jejich vnitřní graf se neprochází. Šest regresních
testů kontroluje povolené i zakázané vazby, cyklus a blokující návratový kód.

Pozor na chování nástroje: JSON reporter dependency-cruiseru vrací 0 i při
porušení pravidel. `quality:scan` proto čte `summary.error` a `summary.warn`:
chyby jsou `failed`, varování `review`. Samostatný blokující příkaz používá
reporter `err-long`. Neplatný nebo prázdný report není považovaný za úspěšný sken.

## Pravidla Semgrepu

Pravidla jsou lokální a verzovaná v [`semgrep/rules`](../semgrep/rules).
V tomto zapojení se nenačítají obecné sady z registry ani placená analýza napříč soubory.

| Pravidlo | Co zachytí |
|---|---|
| `unsafe-prisma-query` | Volání `$queryRawUnsafe` a `$executeRawUnsafe`; parametrizované SQL šablony jsou povolené. |
| `variety-identity` | Vyhledání jedné odrůdy podle názvu nebo `variety.connect` podle názvu. Hromadné textové hledání a snapshot názvu jsou povolené. |
| `detached-transaction` | Samostatné volání `$transaction` bez čekání, vrácení nebo předání Promise k dalšímu zpracování. |
| `unverified-session` | Volání `decodeJwt` z `jose`, včetně přejmenovaného importu; pro session se ověřuje podpis pomocí `jwtVerify`. |

Každé pravidlo má chybnou i správnou ukázku v `tests/scanners/semgrep`.
Ukázky se nekompilují jako aplikace. Pravidla rozpoznávají konkrétní syntaktické
vzory; například transakční pravidlo nedokazuje, že uložený Promise bude později
skutečně zpracován, a pravidlo identity neposoudí libovolně napsaný SQL dotaz.

## Rozsah mutací

Mutuje se pět souborů: `Money`, `Kilograms`, `Order`/`OrderItem`, `ReserveOrder`
a `CancelOrder`. To zahrnuje částky, množství, dopravu, slevový základ, uložené
ceny, opakování rezervace a storno. Nejde o skóre celé aplikace.

Všechny standardní druhy mutací zůstávají zapnuté, včetně textů výjimek.
Přeživší mutace tedy mohou znamenat chybějící test, ale také změnu bez vlivu na
chování nebo neověřovaný text. Cílem není měnit správný kód jen kvůli skóre.
Minimální hranice je 80 %, doporučená úroveň 90 %. Běh má dva pracovní procesy
a CI limit 15 minut.

## První měření – 15. 9. 2026

První běh Strykeru: **78,57 %**, 308 mutací, 242 odhalených, 42 přeživších,
24 bez pokrytí, žádný timeout ani chyba mutantu. Běh správně skončil chybou pod
hranicí 80 %. Výchozí JSON je lokálně uložen v `reports/quality/mutation-baseline/`.

Doplněno 19 unit scénářů a několik hraničních tvrzení ve stávajících testech:
haléře a porovnání peněz, neplatné a opakované rezervace, změna obsahu pod stejným
klíčem, normalizace pořadí a údajů, hranice důvodu storna a historická cena položky.
Produkční obchodní pravidla se při tom neměnila.

Aktuální výsledky jsou shrnuté v [evidenci nástrojového review](code-quality-review.md).

Opakovaný běh: **91,56 %**, 282 odhalených mutací, 23 přeživších a 3 bez pokrytí,
bez timeoutů a chyb. Pět souborů se stejnými 308 mutacemi; pravidla ani hranice
80 % nebyly kvůli výsledku oslabeny. Samotné `Order`/`OrderItem` mají 100 %.
Celá unit sada má 434 úspěšných testů; coverage domény a aplikace je 93,95 % řádků,
85,66 % větví, 90,97 % funkcí a 92,01 % příkazů.

### Zpracování zbývajících mutací – Q12

Před tímto krokem zbývalo 23 přeživších mutací a 3 bez pokrytí. Výchozí report
je lokálně zachovaný v `reports/quality/mutation-before-remediation/mutation.json`.
Každá skupina byla zpracovaná:

| Skupina | Výsledek |
|---|---|
| Chybějící odrůda při stornu | Nový test kontroluje kód `NOT_FOUND`, srozumitelnou zprávu, nezrušenou objednávku a prázdnou frontu oznámení. |
| Chybějící původní rezervace | Nový test ověřuje doménovou chybu a že nevznikne náhradní objednávka, další odečet skladu ani duplicitní e-mail. |
| Kanonický klíč rezervace | Test opakování nově ověřuje uložený klíč malými písmeny. Nestačí, že dvě po sobě jdoucí volání jedné verze aplikace použijí stejný tvar. |
| Číselný a textový vstup kilogramů | Testy pokrývají záporné číslo, velmi malou hodnotu `1e-7`, kladné znaménko před číslem a `null`/`undefined`. Dosavadní přijímání prázdných hodnot je nyní výslovné v typu metody. |
| Nulová hmotnost | Původní domněnka o ekvivalenci `< 0` a `<= 0` neplatila pro číselné `-0`: formátovalo se jako „-0 kg“. Regresní test nejprve selhal a po normalizaci nuly prochází. |
| 13 textů výjimek | Testy nově ověřují konkrétní zprávu i doménový typ nebo kód. `toResultError` tyto zprávy přímo zobrazuje uživateli, takže jejich vyprázdnění je pozorovatelná změna. Totéž platí pro dva nově pokryté texty při chybějících záznamech. |
| Dvě redundantní kontroly typu | `Number.isFinite` již odmítá nečíselné hodnoty bez konverze. Podmínky v `Money.fromCzk` a `Kilograms.of` byly zjednodušené. |

Přibylo 9 unit scénářů a tvrzení ve stávajících testech. Pravidla Strykeru,
rozsah pěti souborů ani hranice 80 % se neměnily. Počet generovaných mutací
klesl po zjednodušení kódu z 308 na 300; procenta proto nejsou pouze měřením
přidaných testů nad totožným zdrojovým kódem.

Výsledek po zpracování Q12: **99,67 %**, 299 odhalených mutací, jedna přeživší
ekvivalentní mutace, **0 bez pokrytí**, 0 timeoutů a 0 chyb. Všech 443 unit testů
prošlo. Coverage domény a aplikace: 93,95 % řádků, 86,54 % větví, 90,97 % funkcí,
92,31 % příkazů. U větví se změnil i jmenovatel po odstranění redundantních podmínek.

### Posouzená ekvivalentní mutace

V `Kilograms.parse` může Stryker změnit náhradní prázdný řetězec v
`input ?? ''` na `"Stryker was here!"`. Náhrada se použije pouze pro `null`
a `undefined`, pro které jsou nyní testy. Oba řetězce po odstranění nečíselných
znaků vedou na prázdný text, `parseFloat` vrátí `NaN` a parser vrátí nulu.
Tato konkrétní mutace tedy výsledek nemění.

V reportu tohoto běhu jde o mutaci `216` na řádku 40 v
`src/domain/value-objects/kilograms.ts`. Oba testy prázdného vstupu ji skutečně
provedly (`testsCompleted: 2`); nejde o nepokrytý kód. ID a řádek se mohou při
další úpravě zdrojů změnit, důvod posouzení se vztahuje k uvedenému výrazu.

Zůstává viditelná v reportu jako přeživší. Nejde o plošnou výjimku pro textové
mutace: nepoužíváme `excludedMutations` ani komentáře `Stryker disable`.

## Podzávislost Strykeru

Stryker 10.0.0 používá `typed-rest-client` 2.3.1, který připíná `qs` 6.15.1.
Instalace původně přinesla dvě hlášení `npm audit` (přímý nález v `qs` a jeho
přenos na klienta). Úzký override `typed-rest-client.qs` používá opravené 6.16.0
ve stejné hlavní řadě. Po aktualizaci má úplný audit 0 nálezů.
Override odstranit, až nadřazený balíček přejde na opravenou verzi.

## Dokumentace nástrojů

- [dependency-cruiser: pravidla](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Stryker: konfigurace](https://stryker-mutator.io/docs/stryker-js/configuration/)
- [Stryker: Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/)
- [Semgrep: vlastní pravidla](https://docs.semgrep.dev/writing-rules/overview/)
