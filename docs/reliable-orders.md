# Spolehlivé rezervace, pošta a historické ceny

Navazující úpravy z 14. 9. 2026 řeší body 1, 2, 3 a 5 z architektonického review.
Provoz více instancí webu a sdílení limiteru/uploadů zůstává samostatným tématem.

## Hranice vrstev

Doména obsahuje cenová pravidla, entity a rozhraní repozitářů, fronty a přípravy pošty.
Aplikační use-cases řídí rezervaci, zrušení a doručování přes tato rozhraní.
Prisma a SMTP zůstávají v infrastruktuře; implementace se propojují v kontejneru webu
a ve vstupním skriptu workeru. HTTP akce ověřují vstup a identitu, komponenty zobrazují
výsledek. Kontroly závislostí a transakčních portů brání obcházení těchto hranic.

## Opakované odeslání rezervace

Prohlížeč před odesláním uloží náhodné UUID a obsah pokusu do místního úložiště.
Po ztrátě odpovědi nebo obnovení stránky nabídne dokončení téhož pokusu. Po úspěchu
uchová i veřejný token, dokud zákazník neuvidí potvrzení. Opuštění nejasného pokusu
vyžaduje výslovné rozhodnutí; původní rezervaci tím zákazník neruší.

`ReserveOrder` normalizuje kontakt, sloučí a seřadí položky podle ID a zahrne identitu
ze serverové session. `ReservationRequestRepository` uloží hash tohoto obsahu.
Unikátní klíč a zápis uvnitř transakce serializují i souběžná první odeslání.
Stejný klíč a obsah vrací původní objednávku před kontrolou aktuálního skladu.
Jiný obsah nebo jiná identita skončí konfliktem. Nový klíč znamená novou rezervaci.

Klíč, objednávka, odečet skladu a požadavky na poštu se potvrzují společně. Rollback
nezanechá obsazený klíč ani částečnou rezervaci. Klíče nejsou automaticky mazány:
jejich odstranění by umožnilo starému požadavku vytvořit další objednávku.

## Trvalá fronta potvrzení a zrušení objednávky

`TemplateOrderMailComposer` připravuje obsah bez SMTP. Use-case uloží každou zprávu
do `mail_outbox` v transakci objednávky. Ukládá hotový text, HTML a přílohy, takže
pozdější změna objednávky, šablon či konfigurace nemění již zařazené potvrzení.
Zákazník a farmář mají samostatné záznamy. Opakovaný pokus o rezervaci je nezařazuje znovu.

`DeliverMail` běží v samostatném procesu. Adaptér převezme jeden záznam krátkou
transakcí s `FOR UPDATE SKIP LOCKED`, potom transakci ukončí a teprve odesílá SMTP.
Pronájem trvá dvě minuty. Po pádu procesu lze záznam převzít znovu; token pronájmu
brání starému workeru přepsat výsledek nového. Po chybě následuje další pokus za
30 sekund, s prodlužováním až na hodinu. Chyba a počet pokusů zůstávají v DB.
Poškozený obsah se také odloží a nezablokuje další příjemce.

Odeslání a potvrzení ve frontě jsou samostatné kroky. Při chybě odesílatele se
nejdříve zaznamená původní chyba a pak naplánuje další pokus. Pokud selže i zápis
odložení, chyba se předá běhové smyčce a původní důvod zůstává v logu.
Pokud odesílatel zprávu přijme, ale zápis potvrzení selže, worker tuto situaci
výslovně zaloguje a pronájem předčasně neuvolní. Obnova nastane po jeho vypršení.

Binární přílohy se ukládají jako Base64 a při čtení procházejí validací formátu.
Neplatný řetězec se považuje za poškozený záznam; nepřevede se tiše na prázdnou
přílohu. Validace neověřuje věcný obsah souboru, například platnost obrázku PNG.

Doručování má vlastnost **alespoň jednou**. Pád po přijetí zprávy SMTP serverem,
ale před zápisem `sent_at`, může způsobit opakované doručení. Zpráva má stabilní
`Message-ID`, ten však sám nezaručuje deduplikaci u příjemce. Nedostupná nebo neplatná
adresa nemá zaručené doručení; zpráva zůstane k opakování a diagnostice.

Fronta se týká potvrzení a zrušení objednávky. Ověřování účtů a ručně psané zprávy
nadále používají samostatný `MailUserNotifier` s dosavadním chováním chyb.

Přehled čekající pošty lze získat například:

```sql
SELECT id, attempts, available_at, locked_until, last_error
FROM mail_outbox
WHERE sent_at IS NULL
ORDER BY id
LIMIT 100;
```

## Stránkování administrace

Objednávky, uživatelé a historie jednoho účtu používají standardně 25 řádků na stránku,
maximálně 100. Řazení podle unikátního ID je jednoznačné. Vyhledávání a filtry probíhají
v databázi před stránkováním; jejich hodnoty jsou v URL a zachovají se při přechodu
na další stránku. Příliš vysoké číslo stránky se omezí na poslední dostupnou.

Statistiky seznamu se počítají jedním dotazem pouze pro ID na zobrazené stránce.
Statistiky profilu nadále zahrnují celou historii daného účtu, i když výpis objednávek
je stránkovaný. Dotazy neodvozují vztahy z názvu ani e-mailu.

Používá se offsetové stránkování. Při souběžném vkládání se mohou hranice stránek
posunout; nejde o zmrazený export databáze. Pro současnou administraci je řešení
jednoduché a nevyžaduje kurzorový protokol.

## Historické ceny a příprava na slevy

`OrderItem.create` počítá cenu nové položky. `OrderItem.rehydrate` přijímá uložený
`line_total_czk`. Obdobně `Order.rehydrate` používá uložený mezisoučet, dopravu,
slevu a celkovou částku; při načítání se nic nepřepočítává.

Nové sloupce `discount_czk` a `pricing_version` mají pro stávající objednávky hodnoty
0 a 1. Migrace nemění dosavadní součty. `Order.create` umí spočítat novou objednávku
s pevnou slevou z položek a odmítne slevu vyšší než jejich hodnota. API zatím klientovi
nedovoluje zadávat cenu ani slevu. Pravidla kuponů, procentních slev a jejich kombinací
zůstávají budoucí obchodní funkcí.

Budoucí výpočet musí při vytvoření uložit výsledné částky a svou verzi. Web, statistiky,
šablony a platební pokyny pak čtou uložené výsledky. Změny stavu, platby a přiřazení
účtu historické částky nemění.

`Order.calculateAmounts` je společné místo pro výpočet celku a přidělení verze.
Rezervace i vytvoření doménové objednávky používají totéž pravidlo. Repozitář vyžaduje
všechny částky včetně slevy a verze; pouze je uloží a neurčuje jejich výchozí hodnoty.

## Spuštění a nasazení

Nejdříve nasadit migraci `20260914120000_reliable_orders`, potom novou aplikaci a worker
ze stejného vydání. Existující běžící aplikace se úpravou zdrojových souborů neaktualizuje.
Lokální ověření migrace proběhlo pouze na oddělené testovací databázi.

Docker sestavy nyní obsahují službu `mail-worker`. Používá stejný image a konfiguraci
jako web, bez publikovaného portu a bez přístupu ke svazku uploadů.

Pro vývoj mimo Docker, se stejnou `.env` jako web:

```bash
npm run db:deploy
npm run worker:build
npm run worker
```

Web se spouští obvyklým `npm run dev`. Worker musí běžet jako samostatný proces;
bez něj se zprávy bezpečně hromadí v databázi. `npm run worker -- --once` zpracuje
nanejvýš jednu zprávu a skončí, což slouží pro provozní ověření.

## Ověření

Navazující kontrola 15. 9. 2026: 415 unit a 47 integračních testů, úspěšné
sestavení webu i workeru a samostatný worker smoke test proti testovací DB s memory
odesílatelem. Ověřena také chyba potvrzení po přijetí zprávy, obnova až po vypršení
pronájmu, validace Base64 a sjednocená úprava filtrů. Aktuální výsledky a omezení
nového E2E běhu eviduje [postup nápravy](code-quality-remediation.md).

Integrační scénáře pokrývají souběžné stejné požadavky, změnu obsahu klíče, rollback
po vložení zprávy, nezávislé příjemce, obnovení po pádu workeru, starý token pronájmu,
stránkování a uchování částek po změně cen a pravidel. Prohlížečový scénář zahodí
odpověď až po dokončení rezervace na serveru, obnoví stránku a opakuje původní pokus.

Historické výsledky původního lokálního ověření 14. 9. 2026:

- 383 unit testů prošlo; po závěrečném přejmenování portu znovu prošlo 63 relevantních testů.
- 43 integračních testů prošlo proti oddělenému MySQL 8.4.
- 45 prohlížečových testů prošlo nad produkčním standalone výstupem; 3 existující
  scénáře animace váhy zůstávají explicitně vynechané.
- ESLint, kontrola typů a produkční sestavení prošly. Worker se úspěšně sestavil
  a samostatně spustil s testovací poštou; obě Docker Compose konfigurace prošly validací.

Produkční databáze ani skutečné doručování přes SMTP nebyly součástí tohoto ověření.
