# Kvalita kódu před review a nyní

Měření a vyhodnocení: 15. 9. 2026. Současný stav zahrnuje necommitnuté změny
po `c6836c7`, včetně zapojení tří dalších analyzátorů a zpracování Q12.

## Co přesně srovnáváme

Máme dva odlišné výchozí body:

1. **Skutečný první sken z 14. 9. 2026.** Reporty v
   `reports/quality-baseline-20260914/` zachycují tehdejší pracovní kopii před
   opravami nálezů. Již obsahovala předchozí ruční architektonické úpravy.
   Tento přesný mezistav nebyl samostatně commitnutý a nemáme jeho úplný zdrojový snapshot.
2. **Poslední starší commit `901d9e815a60b3fab354afdcde53d28c5a8f86c0`.**
   Ten lze obnovit. Změřili jsme jej znovu dnešními analyzátory a pravidly.
   Ještě předchází části ručních oprav, takže ukazuje širší změnu aplikace.

Zlepšení proto nelze celé připsat samotným skenerům. Část vznikla ručním review,
část aktualizací závislostí a část opravami nebo testy podle konkrétních nálezů.

## První skutečně naměřené nálezy versus současnost

| Kontrola | První sken 14. 9. | Poslední ověřený stav | Význam |
|---|---:|---:|---|
| SonarJS 4.2.0 | 45 hlášení | 0 | Stejná doporučená sada; opravené konstrukce, neměnnost props, zastaralé API a další nálezy. |
| Funkce nad limitem kognitivní složitosti 15 | 2 | 0 | Checkout měl 20, seed 18. Úpravy rozdělily odpovědnosti do menších funkcí. |
| jscpd: dvojice duplicitních bloků | 7 | 4 | Zůstaly krátké, jednotlivě posouzené shody. |
| jscpd: duplicitní řádky | 57 / 0,48 % | 27 / 0,22 % | O 30 duplicitních řádků méně, přibližně 53 %. |
| Knip: nepoužívané exporty / typy | 26 / 19 | 0 / 0 | Běžný pohled včetně testových spotřebitelů. |
| Knip production: soubory / exporty / typy | 2 / 19 / 20 | 1 / 6 / 0 | Zbylé položky mají odůvodnění; stav nadále `review`. |
| Trivy: záznamy zranitelností | 15 | 0 | Poslední běh Trivy je z 14. 9.; kontrola produkčních závislostí a Dockerfile. |
| npm audit produkčních závislostí | 6 označených balíčků | 0 | Poslední npm audit z 15. 9.; nelze sčítat s počtem záznamů Trivy. |
| Úspěšné unit testy | 383 | 443 | O 60 více od okamžiku prvního skutečného skenu. |

Pokles Knipu na nulu neznamená odstranění veškerého odloženého kódu: komponenta
`scale.tsx` je výslovně ignorovaná. `scale-model.ts` a šest exportů používaných
testy zůstává v produkčním reportu. Podrobnosti jsou v
[evidenci nápravy](code-quality-remediation.md).

Původní coverage 84,40 % řádků / 92,27 % větví pochází z Vitestu 3.2.7.
**Tato procenta nelze přímo porovnávat s dnešním Vitestem 4.1.11.** Pro srovnání
stejnou metodikou slouží nové měření staršího commitu níže.

## Starší commit měřený současnými nástroji

| Metrika | Commit `901d9e8` | Současný kód |
|---|---:|---:|
| SonarJS 4.2.0: hlášení | 46 | 0 |
| dependency-cruiser 18.3.1: porušení pravidel | 2 | 0 |
| Cykly závislostí / typová varování | 0 / 0 | 0 / 0 |
| Semgrep CE 1.177.0: nálezy čtyř projektových pravidel | 0 | 0 |
| jscpd 5.2.0: duplicitní bloky | 8 | 4 |
| jscpd: duplicitní řádky | 64 / 0,58 % | 27 / 0,22 % |
| Vitest 4.1.11: úspěšné unit testy | 316 | 443 |
| V8 coverage: řádky | 80,90 % (411/508) | 93,95 % (544/579) |
| V8 coverage: větve | 76,44 % (185/242) | 86,54 % (238/275) |
| V8 coverage: funkce | 73,54 % (189/257) | 90,97 % (242/266) |
| StrykerJS 10.0.0: mutační skóre | 83,08 % | 99,67 % |
| Odhalené mutace / všechny mutace | 221/266 | 299/300 |
| Přeživší mutace | 29 | 1 zdůvodněná ekvivalentní |
| Mutace bez pokrytí | 16 | 0 |

Coverage v obou sloupcích měří pouze `src/domain` a `src/application`.
Zvýšila se o **13,05 procentního bodu u řádků** a **10,10 bodu u větví**.
Mutační skóre vzrostlo o **16,59 bodu**, ale srovnávané verze mají odlišnou
funkcionalitu a různý počet mutací. Není to univerzální procento „kvality aplikace“.

Stryker v obou verzích mutoval stejné cesty: `Money`, `Kilograms`, `Order`,
`ReserveOrder` a `CancelOrder`. Starší verze má jednodušší tok rezervace,
proto vygenerovala 266 mutací. Při prvním zavedení Strykeru do novějšího kódu
bylo skóre 78,57 % nad 308 mutacemi; následně 91,56 % a po Q12 nynějších 99,67 %.
Tato průběžná měření nejsou měřením commitu `901d9e8`.

Zbývající mutace je doložená v
[posouzení Q12](architecture-scanners.md#posouzená-ekvivalentní-mutace).
Nebylo použito plošné vynechání mutátorů ani snížení hranice úspěchu.

## Co se změnilo pro člověka, který bude aplikaci upravovat

| Oblast | Dřívější stav | Současný stav |
|---|---|---|
| Směr závislostí | `shared/format.ts` typově importoval `Money` a `Kilograms` z domény. | Formátování přijímá malé strukturální typy; shared na doméně nezávisí. Obě vazby zachytil nový sken starého commitu. |
| Rezervace a oznámení | Po commitu se volal notifier, na jehož chování závisel úspěch celé operace vůči volajícímu. | Objednávka a zprávy se uloží v jedné transakci; odesílání zajišťuje samostatný worker s opakováním. |
| Opakování požadavku | Rezervace neměla identifikátor pokusu. | Stabilní klíč a normalizovaný obsah rozlišují opakování od nového nebo změněného nákupu. |
| Ceny a příprava slev | Celková částka se skládala z mezisoučtu a dopravy při načtení entity; chyběl samostatný uložený výsledek slevy. | Ukládají se částky a verze ocenění; historické ceny se při načtení nepřepočítávají. |
| Čitelnost větších funkcí | První scan označil složitý Checkout a seed. | Formulář, obnova rezervace a naplnění jednotlivých typů dat mají jasnější oddělené odpovědnosti. |
| Síla testů | Některé změny podmínek, parsování a zpráv testy neodhalily. | Testy pokrývají chybějící vazby, opakování, hranice množství, uložené ceny i doménové zprávy. |

Vztah položky objednávky k odrůdě používal `varietyId` už ve starším commitu.
Tady tedy netvrdíme přechod z názvu na ID; přibylo ověření přejmenování a historie
pomocí regresních testů. Nulové nálezy Semgrepu v obou verzích rovněž neznamenají,
že by stará verze měla stejné možnosti nebo stejnou spolehlivost jako dnešní.

## Metoda a podklady

- Starý commit byl vybalen přes `git archive` do izolované kopie pod
  `reports/quality-comparison/before-901d9e8/`. Jeho `src`, `prisma` a `tests`
  nebyly opravovány. Kopie neobsahuje pracovní `.env`.
- Pro porovnání byly přidány současné konfigurace analyzátorů a propojeny současné
  `node_modules`. Jde o starý zdrojový kód pod dnešními nástroji, nikoli rekonstrukci
  tehdejšího provozního prostředí a přesných tehdejších knihoven.
- Vitest použil samostatnou konfiguraci pro unit testy a stejný rozsah V8 coverage.
  Neběžely staré integrační testy, server ani databázové migrace.
- SonarJS má stejná pravidla a TypeScriptovou analýzu. V původním adresáři `scripts`
  nebyly JS/TS soubory; opakovaný běh proto použil `--no-error-on-unmatched-pattern`.
  Jeho výstup obsahuje 46 nálezů SonarJS, další 2 architektonické a 1 běžného ESLintu.
- Semgrep použil stejná čtyři lokální pravidla a stejný Docker image s připnutým
  digestem; běžel bez sítě. Jde o úzce vymezené projektové kontroly.
- Jscpd měl stejnou hranici 50 tokenů / 5 řádků a stejné zdrojové adresáře.
  Rozsah narostl z 93 na 135 souborů dle tohoto nástroje; menší počet duplicit tedy
  nevznikl pouhým zmenšením projektu.
- Aktuální zdroje pěti mutovaných souborů byly porovnány s obsahem posledního
  Stryker reportu a přesně odpovídají jeho měřenému stavu.

Strojový souhrn s hashi vstupních reportů je lokálně v
`reports/quality-comparison/comparison.json`. Vedle něj je spouštěcí skript
`run.mjs`, výstupy kontrol v `measurements/` a starý HTML/JSON mutační report
v kopii projektu. Tyto generované podklady jsou ignorované Gitem; tento dokument
zachovává výsledky a metodiku v repozitáři.
