# Review čitelnosti a architektury

Datum: 14. 9. 2026. Rozsah: aplikační zdrojové soubory, Prisma schéma a migrace,
seed, testovací infrastruktura, konfigurace, Docker a workflow CI/CD.

Pozdější změny idempotence rezervací, trvalé fronty pošty, stránkování a historických
částek jsou v [navazujícím popisu](reliable-orders.md). Níže je historický stav prvního review.
Review probíhalo po vrstvách: doména → use-cases → persistence a adaptéry →
serverové vstupy → komponenty → provoz a ověření.

Pozdější opravy ochrany výsledku transakce, cílených statistik a kontroly importů
popisuje [druhý průchod architekturou](architecture-review.md). Počty testů níže
zachycují dokončení prvního průchodu.

Sonnet nebyl v této relaci dostupný. Review a úpravy proto provedl dostupný model
Codexu; nejde o výstup ověřený druhým modelem nebo nezávislým lidským reviewerem.

## Nejdůležitější nálezy a opravy

| Oblast | Původní problém | Výsledné chování |
| --- | --- | --- |
| Sklad | Otevřený formulář mohl uložit staré množství a přepsat mezitím dokončenou rezervaci. | `UpsertVariety` zamyká odrůdu a porovná skutečný sklad s `expectedStockKg`. Při konfliktu změnu odmítne. |
| Objednávky | Samotná transakce nezajišťovala, že souběžné akce přečtou aktuální stav. Dva kliky mohly přeskočit stav; opakované označení platby přepsat čas. | Změny nejdřív zamykají objednávku. Přechod porovnává očekávaný stav; opakované potvrzení platby zachová první čas. |
| Zrušení | Souhrny zahrnovaly zrušené rezervace; veřejná stránka stále nabízela platbu. | Aktivní souhrny zrušené vynechají, potvrzení ukáže důvod a nevytváří QR ani platební údaje. Vrácení skladu se provede právě jednou. |
| Identita | Riziko záměny názvu za vztah bylo potřeba prověřit v celé cestě objednávky. | Vztah nadále používá `varietyId`; integrační test přejmenuje odrůdu, změní cenu a ověří původní historii i vrácení zásoby podle ID. |
| Účty | Mutace profilu vracely view model s nulovými statistikami. Starý zákaznický token nebyl při běžném čtení session ověřován proti účtu. | Odpověď obsahuje skutečné statistiky; UI čte obnovená serverová data. Session ověřuje existenci, aktivitu, současnou roli a odvolání tokenu. |
| Opětovná aktivace | Znovu aktivovaný účet mohl přijmout token vydaný před deaktivací. | Deaktivace nastaví hranici odvolání session; aktivace ji nemaže. Úpravy účtu čtou pod zámkem. |
| Košík | Hydratace a zápis do localStorage mohly uložený košík přepsat prázdným. Chybějící odrůda se při sestavení řádků ztratila. | Ukládání čeká na dokončenou hydrataci. Nedostupný řádek je vidět a musí se odebrat před rezervací. |
| Peníze | Klient sčítal desetinná čísla jinak než server zaokrouhlující jednotlivé položky. | Souhrn používá `Money.timesKg` a stejnou funkci ceny dopravy jako objednávka. Seed používá stejné výpočty. |
| Vstupy | Částečně platné číslo se měnilo na platné; neplatné hodnoty mohly skončit jako nula. URL uživatele přijímala prefix typu `1junk`. | Formuláře parsují celé číslo, persistence vadnou hodnotu odmítne a ID v URL musí být celé kladné bezpečné číslo. |
| Zobrazení | Lokální kopie serverových seznamů zůstávaly po revalidaci staré. Síťové výjimky některých akcí neměly obsluhu. | Tabulky a detail používají přímo serverová props; lokální stav drží rozepsaný formulář a průběh akce. Chyba spojení se zobrazí. |
| Vrstvy | Hranice šly obejít relativním či dynamickým importem; `shared` typově odkazovalo zpět do domény. | ESLint kontroluje směry importů a přístup k prostředí v čistých vrstvách. `shared` přijímá malé strukturální typy. |
| Statistiky a grafy | Hodnota objednávek se nazývala tržby, všechny sklizně letošní sklizní a 14 záznamů 14 dny. Graf používal rozdílné měřítko osy a dat. | Popisky odpovídají dotazům; osa, sloupce a čára používají společné měřítko. |

Zámky se používají uvnitř `UnitOfWork`, jehož izolace je `ReadCommitted`.
Zrušení zamkne objednávku před odrůdami, odrůdy se zamykají ve vzestupném pořadí ID.
To omezuje riziko deadlocku; nejde o tvrzení, že každý možný deadlock zmizel.
Rozdíl běžného a zamykajícího čtení popisuje
[dokumentace MySQL](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

## Průchod moduly a třídami

Tabulka popisuje rozhodnutí po kontrole. „Ponecháno“ znamená, že se pro danou
odpovědnost nenašel důvod k přepisu; nezaručuje absenci všech možných chyb.

| Soubory / třídy | Rozhodnutí |
| --- | --- |
| `domain/entities/order.ts`: `Order`, `OrderItem` | Ponechány neměnné entity a snapshot ceny/názvu; součty zpřehledněny a pravidlo variabilního symbolu sdílené. |
| `domain/entities/variety.ts`: `Variety` | Ponechána pravidla odečtu a vrácení zásoby. Vrácení může překročit později sníženou kapacitu; fyzické množství se nesmí ztratit. |
| `domain/entities/user.ts`: `User` | Vyčleněno ze společného indexu; opraveno odvolání session při deaktivaci. |
| `domain/entities/{news-post,field,harvest-entry,storage-reading}.ts` | Každá entita má vlastní pojmenovaný soubor; jejich index pouze reexportuje. |
| `domain/value-objects/{money,kilograms,email-address,hex-color,iban}.ts` | Ponechány malé objekty s validací. Tolerantní parsování kg patří k uživatelskému nastavování množství, nikoli načítání DB. |
| `domain/{enums,errors}.ts`, `domain/ports/*` | Ponechány doménové typy a porty; odstraněny nepoužité obecné enum helpery. Port přílohy používá `Uint8Array`, převod na Node `Buffer` provádí adaptér. |
| `application/use-cases/admin.ts` | Původní směs oblastí je nyní pouze exportní rozcestník. |
| `application/use-cases/orders.ts`: `ListOrders`, `AdvanceOrderStatus`, `SetOrderPaid` | Odděleno od skladu a novinek; doplněno zamykání a očekávaný stav. |
| `application/use-cases/varieties.ts`: `UpsertVariety`, `ListAdminVarieties`, `DeactivateVariety` | Odděleno; sklad je chráněný proti starému formuláři, slug se přejmenováním nemění, deaktivace zachová historii. |
| `application/use-cases/news.ts`, `admin-overview.ts` | Vlastní tematické soubory; souhrny a mapování mají pojmenovanou odpovědnost. |
| `application/use-cases/{reserve-order,cancel-order,get-order-by-token}.ts` | Prověřena validace celého košíku, ceny ze serveru, transakce, ID, zrušení a notifikace po commitu. Chybějící odrůda při vrácení skladu vyvolá chybu. |
| `application/use-cases/auth.ts` | Sdílená autorizace aktuálního účtu; drahé hashování hesla probíhá před transakcí. |
| `application/use-cases/users.ts` | Změny účtu pod zámkem, skutečné statistiky, společná doba ověření. Odesílání zpráv zůstává mimo DB transakci. |
| `application/use-cases/catalog.ts`, `application/{dto,view-models,verification-policy}.ts` | DTO a jejich čisté mapování jsou společné pro čtecí use-cases. Doba platnosti ověření má jeden zdroj. |
| `infrastructure/persistence/prisma/*-repository.ts` | Velký společný soubor rozdělen podle repozitářů. SQL a Prisma zůstávají pouze zde; veřejná API používají doménové typy. |
| `infrastructure/persistence/prisma/{repositories,types,client,unit-of-work}.ts` | Továrna pouze skládá repozitáře; transakce předá adaptéry navázané na stejný transakční klient. |
| `infrastructure/persistence/prisma/mappers.ts` | Jediný převod DB → doména. Neplatné desetinné hodnoty se nezaměňují za nulu ani tiše nezaokrouhlují na půlkilogramy. |
| `infrastructure/auth/*` | Zachován bcrypt a podepisování JWT; čtení session nově ověřuje současný účet pro všechny role. |
| `infrastructure/mail/*`, `infrastructure/payment/*` | Zachováno oddělení prezentace, QR/SPAYD a skutečného odeslání. Odstraněny zbytečné callbacky a dvojí pravidlo variabilního symbolu. |
| `infrastructure/{config,di,rate-limit,uploads}/*` | Prověřena konfigurace a DI, klíče limiteru, souborové názvy, limity a typy uploadu. Implementace zůstávají za adaptéry. |
| `app/actions/*` | Vstupní validace a autorizace před use-case; aktualizace dotčených admin stránek přes revalidaci. Chyby infrastruktury se neposílají klientovi. |
| `app/admin/**/page.tsx`, `app/admin/layout.tsx` | Kontrola farmáře také před čtením dat na jednotlivých stránkách; layout a middleware nejsou jedinou autorizační hranicí. |
| `app/{page,layout,error,not-found}.tsx`, `app/{burza,sklad,kosik}/page.tsx` | Prověřeno načítání dat a skladové popisky; stránky skládají komponenty a závislosti. |
| `app/rezervace/[token]/page.tsx`, `app/overeni/[token]/page.tsx` | Zrušená rezervace bez platby; neplatný ověřovací odkaz se odliší od interní chyby serveru. |
| `app/api/health/route.ts`, `app/api/uploads/**/route.ts` | Prověřeny provozní a souborové routy; upload vrací odpovídající kód pro validaci, zákaz a interní chybu. |
| `middleware.ts`, `instrumentation.ts` | Zachovány jako vstupní body Edge a Node runtime; middleware neposkytuje databázovou autorizaci. |
| `components/admin/{stock-editor,variety-editor-row,add-variety-form,variety-draft}.tsx/ts` | Seznam, editor existující odrůdy, přidání a převod formuláře odděleny. Rozepsaný formulář má vlastní stav; seznam používá data ze serveru. |
| `components/admin/{orders-table,cancel-order-dialog}.tsx` | Dialog drží ID cíle, nikoli funkce v React state. Zrušení má validaci důvodu, ochranu zavření během akce a obsluhu síťových chyb. |
| `components/admin/{user-detail,users-table,news-composer,admin-tabs}.tsx` | Odstraněny kopie serverových výsledků v state; vyhledávání normalizuje dotaz jednou. Novinky obsluhují chyby spojení. |
| `components/cart/*` | Hydratace, reducer, validace, výpočet a vykreslení mají oddělené odpovědnosti. Zachované jednoduché `map` slouží k převodu řádků. |
| `components/shop/{variety-card,meter-model,scale,scale-model}.tsx/ts` | Prověřena identita řádků, množství a modely grafiky. Měřič skladu zvládne vrácení nad kapacitu. Váha zůstává připravená, ale není zapojená do burzy. |
| `components/stock/{bins,harvest-chart}.tsx` | Zásobníky mají stabilní ID pro React klíč; graf má sjednocené měřítko výkopu a zásoby. |
| `components/layout/*`, `components/home/news-grid.tsx` | Prověřeny navigace, přihlášení, modal, toast a novinky; malé samostatné komponenty ponechány. |
| `shared/{format,order-code,result,csp}.ts` | Čisté pomocné funkce; odstraněna obrácená typová závislost formátování na doméně. |
| `app/{globals,ui}.css` | Ponechány společné tokeny a pojmenované sekce stylů; opraven neexistující radius token a nepravdivý úvodní komentář. |
| `prisma/schema.prisma`, `prisma/migrations/*` | Prověřeny PK, FK, unikátní tokeny, ID objednávek a indexy. Schéma se funkčně nemění; nová migrace není potřeba. |
| `prisma/{seed,seed-data,ensure-farmer,create-farmer}.ts` | Demo data a obnova farmáře mají vlastní moduly. Seed nepropouští chybějící ID jako `0` a sdílí cenová pravidla. |
| ESLint, TypeScript, Next, Vitest, Playwright, `package*.json` | Přidáno a otestováno pravidlo závislostí; žádná další knihovna ani plošná aktualizace balíčků. |
| `Dockerfile`, oba Compose soubory, `.github/workflows/*`, ignore soubory, `.env.example` | Prověřeny build/migrace/runtime, prostředí a CI. Do Docker kontextu se neposílají dočasné soubory review. |
| `tests/unit/*`, `tests/integration/*`, `tests/e2e/*` | Zachována existující sada a přidány regrese chování, transakcí a hranic vrstev. Ověření níže. |

## Vztahy a historická data

- `OrderItem.varietyId` je cizí klíč na odrůdu. `varietyName` a cena jsou snapshot
  z objednání; přejmenování či zdražení nesmí přepisovat historii.
- `Order.userId` je vztah k účtu. Běžné seznamy ani statistiky nepárují objednávky
  podle jména či e-mailu.
- Výjimkou je existující jednorázové převzetí hostovských objednávek při ověření
  adresy. Vyhledá jen nepřiřazené objednávky před vznikem účtu, potom zapíše `userId`.
  Ověření adresy samo nedokazuje, kdo původní hostovskou objednávku zadal. Tato
  obchodní politika byla zachována a je popsána přímo u `claimGuestOrders`.
- `Field.varietyName` je text popisující osázení včetně plánů mimo katalog, například
  „Sadba 2027“. Není použit k JOIN ani dohledávání odrůdy. Pokud vznikne skutečná
  vazba pole na katalog, potřebuje vlastní `varietyId` a migraci dat.
- Slug je unikátní veřejný identifikátor katalogu; při změně názvu zůstává.
  Číslo objednávky je označení pro člověka, veřejný token slouží k přístupu na potvrzení.

## Pravidla pro další změny

1. U nové metody musí být z názvu zřejmá odpovědnost. Rozvětvenou logiku napište
   po krocích a pomocný krok pojmenujte. Jednoduché `map`, `filter` či callback události
   jsou čitelné a není nutné je plošně nahrazovat.
2. Sdílejte obchodní pravidla, ne náhodně podobný tvar kódu. Zvlášť pravidla peněz,
   množství, identifikátorů a expirace nesmějí mít dvě nezávislé implementace.
3. Novou SQL/Prisma závislost přidejte do adaptéru; use-case dostane port. React
   komponentě předejte DTO a serverové operace zpřístupněte autorizovanou akcí.
4. U změny existujícího záznamu určete, co se stane se souběžným požadavkem.
   Transakce sama nestačí; podle operace potřebujete zámek nebo kontrolu verze/stavu.
5. Na serveru validujte skutečný vstup. Neplatná čísla nepřevádějte na nulu a
   řetězcové prefixy na ID. Formulář předává ID, server si dohledá ceny a stav.
6. Data vrácená serverem nekopírujte do React state bez konkrétního důvodu.
   Rozepsaný formulář takový důvod má; obnovený seznam nebo statistika obvykle ne.
7. U regresí peněz, oprávnění a souběhu přidejte test pozorovatelného chování.
   Pro přesun souboru nebo jednoduché přejmenování stačí typová kontrola a stávající testy.

## Ověření

- ESLint: bez chyb a varování.
- TypeScript: `tsc --noEmit` prošel; kontrola typů proběhla i v produkčním buildu.
- Unit: **349 / 349** testů, 31 souborů; původní výchozí sada měla 316 testů.
  Také běh s `--coverage` používaný v CI prošel: 85,51 % řádků a 93 % větví
  v měřených vrstvách `domain` a `application`. Tato čísla nezahrnují celou aplikaci.
- Integrace: **26 / 26** testů, 3 soubory, skutečná MySQL 8.4 v odděleném kontejneru.
- Produkční `next build`: úspěch.
- Playwright: **44 prošlo, 3 přeskočeny**, 47 scénářů včetně přihlášení. Přeskočené
  testy patří k váze, která už před review nebyla zapojená do burzy. Ověřen byl i
  sklad otevřený ve dvou záložkách, opakovaná hydratace košíku a zrušené potvrzení.

První opakování unit sady narazilo na limit při studeném načtení Next.js ESLint
presets. Inicializace je nyní v `beforeAll` s vlastním limitem; testy samotných
importů zůstávají krátké. Následující plný běh prošel.

E2E test označení platby původně vyžadoval synchronní přepnutí checkboxu přímo
při kliku. Nyní vyčká na potvrzení serveru a ověří hodnotu i po obnovení stránky.
Po této úpravě prošel cílený i celý E2E běh.

## Praktické hranice a navazující rozhodnutí

- Souběžná editace popisků či ceny téže odrůdy má nadále pravidlo posledního zápisu;
  `expectedStockKg` chrání množství, není univerzální verzí celého záznamu.
- Dvě souběžná založení stejného slugu chrání DB unikátní klíč. Druhé může skončit
  obecnou chybou; automatické zopakování s jiným suffixem zatím není součástí operace.
- Rezervace nemá idempotency key pro opakovaný HTTP požadavek po ztrátě odpovědi.
  UI během odesílání blokuje tlačítko a při výpadku vyzve ke kontrole potvrzení.
  Pro automatické opakování je potřeba návrh klíče a databázová migrace.
- Notifikace po commitu jsou best-effort. Zaručené pozdější doručení by vyžadovalo
  frontu/outbox a opakování. Testy používají paměťovou poštu; skutečné SMTP doručení
  ani bankovní převod toto review neověřuje.
- Seznamy uživatelů a jejich souhrny zatím nemají stránkování. Při růstu dat je vhodné
  přidat stránkování a filtrované statistiky; lokální token bucket se nesdílí mezi
  více instancemi aplikace.
- Proběhl lokální build a testy. Produkční nasazení, dostupnost externích služeb,
  zátěžový test a kompletní audit přístupnosti nebyly součástí provedeného ověření.
