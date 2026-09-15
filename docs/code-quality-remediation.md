# Zpracování nálezů code quality

Výchozí audit: [14. 9. 2026](code-quality-review.md). Opravy probíhají po skupinách;
hotová skupina musí mít uvedené skutečně provedené ověření. Hlášení skeneru samo
o sobě není důvodem ke změně obchodního pravidla nebo přidání obecné abstrakce.

Původní strojové reporty jsou lokálně zachované v `reports/quality-baseline-20260914/`.
Nové běhy zapisují do `reports/quality/`. Oba adresáře jsou generované a ignorované Gitem;
tento dokument a původní shrnutí auditu zachovávají výsledky v repozitáři.

| ID | Skupina | Stav | Ověření / zbývající práce |
|---|---|---|---|
| Q1 | Zranitelné závislosti: Nodemailer, PostCSS, deepmerge-ts | Hotovo | Produkční `npm audit` 0; build, Prisma config/migrace, unit, integrace a SMTP smoke prošly. Overrides zůstávají dočasně dokumentované. |
| Q2 | Složitost Checkout a seedu | Hotovo | Obě funkce rozděleny; SonarJS složitost 0, seed regresní test a build prošly. |
| Q3 | Další nálezy SonarJS | Hotovo | SonarJS 0; readonly props, aktuální Zod API, bezpečnější regexy, pojmenované podmínky a ověřené dialogy. |
| Q4 | Nepoužívaný kód a exporty | Opraveno; evidované výjimky | Běžný Knip 0. Produkční Knip stále hlásí 1 soubor a 6 exportů; důvody jejich ponechání jsou níže. Jeho stav je `review`, nikoli čistý scan. |
| Q5 | Duplicity | Opraveno; posouzený zbytek | Sjednocen seed, dokončení přihlášení, KPI komponenta a úprava textových filtrů. Zbývají 4 shody / 27 řádků / 0,22 %; jednotlivě posouzené níže. |
| Q6 | Pokrytí přehledu administrace a katalogu | Doplněno o hraniční případy | Po Q12 celkem 443 unit testů; pokrytí domény a aplikace 93,95 % řádků a 86,54 % větví. Limity novinek, neaktivní odrůdy, třicetidenní hranice, uložená sleva i autorizace mají regresní scénáře. Nejde o pokrytí celé aplikace. |
| Q7 | Zranitelnost vývojového Vitestu | Hotovo | Vitest a coverage provider `3.2.7 → 4.1.11`; úplný i produkční audit 0, unit testy a coverage prošly. |
| Q8 | Čitelnost a chybové stavy poštovní fronty | Hotovo | Odděleno odeslání a potvrzení, zachována původní chyba při selhání odložení. Pojmenované převody příloh a validace Base64. 17 nových unit scénářů, 2 další integrační případy a běh sestaveného workeru s memory odesílatelem. |
| Q9 | Validace a čitelnost seznamů | Hotovo | Jedno pravidlo trim/120 znaků v aplikační vrstvě, pojmenované limity stránek, čitelnější načítání uživatelů a navigace. Nový integrační test ověřuje oba seznamy se stejným dlouhým filtrem. |
| Q10 | dependency-cruiser, Semgrep, Stryker a CI | Zapojeno a lokálně ověřeno | Architektura 0, Semgrep 0; testy pravidel prošly. Stryker po Q12: 300 mutací v 5 souborech. [Návod a rozsah](architecture-scanners.md). |
| Q11 | Mezery v testech z prvního mutačního běhu | Hotovo | První vlna: 19 nových unit scénářů, tehdy 434 testů celkem. Mutační skóre 78,57 → 91,56 % při nezměněném rozsahu a hranici. Peníze, identita rezervace, storno a uložené ceny. |
| Q12 | Zbylé mutace a síla testů obranných větví | Zpracováno; 1 zdůvodněná ekvivalentní mutace | 9 dalších scénářů, 443 testů celkem. Stryker 99,67 %: 299 odhalených, 1 ekvivalentní, 0 bez pokrytí. [Odůvodnění poslední mutace](architecture-scanners.md#posouzená-ekvivalentní-mutace); žádné potlačení skeneru. |

## Záznam oprav

- 15. 9. 2026, zpracování Q12: doplněny chybějící vazby při rezervaci/stornu,
  záporné a malé číselné vstupy, prázdná hodnota parseru, texty doménových chyb
  a kanonický klíč pro uložení rezervace. Test pro číselné `-0` nejprve odhalil
  formátování „-0 kg“; parser nyní vrací běžnou nulu. Typ parseru přiznává
  dosavadní zpracování `null`/`undefined`, dvě redundantní kontroly `typeof`
  byly odstraněny. Mutační běh: 299/300 odhalených, 1 konkrétní ekvivalentní
  mutace s odůvodněním, 0 bez pokrytí. Pravidla ani hranice nejsou oslabené.
  Všech 443 unit testů, lint, typecheck a statická analýza prošly.

- 15. 9. 2026: zapojeny tři nové nástroje a jejich CI kroky. Mapa vrstev je společná
  pro ESLint a dependency-cruiser. Lokální pravidla Semgrepu mají pozitivní i negativní
  ukázky; jejich první verze odhalila falešné poplachy u zpracovaných transakcí,
  které byly opravené v pravidle, nikoli potlačením hlášení ve zdrojích.
  Stryker běží pouze nad unit testy v dočasné kopii. Jeho první skóre 78,57 %
  bylo pod hranicí 80 %; po doplnění testů má 91,56 %. Zbytek je evidovaný jako Q12.
  Úzký override `typed-rest-client.qs` na 6.16.0 opravil dvě nová hlášení auditu
  vývojových závislostí; aktuální úplný i produkční audit mají 0 nálezů.

- 14. 9. 2026: založena evidence postupu a zachovány výchozí raw reporty.
  SonarQube Cloud stále není aktivovaný; podkladem jsou lokální deterministické skenery.

- 14. 9. 2026: dokončeny skupiny Q1–Q4 a Q7. Před doplněním testů měl unit běh
  383 testů, 82,57 % řádků, 75,81 % větví a 77,35 % funkcí. Integrační běh:
  44 testů v 5 souborech. Audit běžných nálezů SonarJS, Knipu a produkčního npm
  auditu byl čistý. Navazující kontrola níže doplňuje posouzení produkčních exportů,
  duplicit a hloubky testů; původní průchod nebyl důkazem úplnosti review.

- 14. 9. 2026: doplněno 5 testů pro katalog a přehledy (Q6); unit běh má 388 testů
  a 90,84 % řádků. Aktuální Trivy nad `package-lock.json` a Dockerfile nenašel
  zranitelnost ani chybnou konfiguraci. `quality:scan` po dokončení oprav vrací
  exit kód 0 i při nálezech produkčního Knipu. Tento způsob vykazování byl následně
  zpřesněn: report nyní zachovává skutečný návratový kód skeneru a stav `review`.

- 14. 9. 2026, navazující kontrola: `readFarmerSession` používá skutečný aplikační
  `AuthorizeFarmerSession`; kontrola role již není podruhé v infrastruktuře. Název
  cookie sdílí server a Edge middleware z modulu bez Node závislostí. Šest testů
  serverové hranice ověřuje podpis, odebrání role, deaktivaci, odvolání tokenu a
  jediný dotaz na účet. Úspěch přihlášení i registrace dokončuje soukromá funkce
  `completeLogin`; chyby zápisu cookie stále zachytí příslušná server action.
- Katalogové testy nyní pracují se sedmi různě datovanými novinkami, více odrůdami
  a patnácti sklizněmi. Admin test odlišuje hranici 30 dní od předchozí milisekundy,
  hotovost, nezaplacený převod/QR, zaplacení a storno. Součet používá uloženou cenu
  po slevě, nikoli dnešní cenu odrůdy. Jde o aplikační testy s in-memory repozitáři;
  neprokazují počet SQL dotazů ani implementaci SQL filtrů.
- Veřejný sklad a administrace sdílejí prezentační `KpiGrid`; jejich původní
  velikosti písma zůstávají zachované. Výpočty nadále zajišťují aplikační use-cases.
- Ověření navazujících změn: 398 unit testů v 35 souborech, SonarJS 0, běžný Knip 0,
  ESLint a TypeScript bez chyb, produkční Next build úspěšný. Po sjednocení KPI
  prošel znovu build i skeny; po zpřesnění testovacích tokenů všech 9 katalogových testů.
- V tomto navazujícím běhu není dostupný Docker daemon. Integrační, E2E a
  Trivy výsledky pocházejí z předchozí vlny; nebyly znovu ověřeny na těchto změnách.

### Kontrola poštovní fronty a seznamů — 14.–15. 9. 2026

- Regresní testy prokázaly dvě chyby v `DeliverMail`: selhání zápisu potvrzení
  se považovalo za chybu odeslání a předčasně uvolnilo pronájem; při souběžné
  chybě odesílatele a zápisu odložení se původní důvod nedostal do logu.
  Odeslání a potvrzení nyní mají samostatnou obsluhu chyb. Use-case používá porty
  `Mailer`, `MailQueue` a `Logger`; SQL, časování běhové smyčky i SMTP zůstávají vně.
- Test příloh prokázal, že `Buffer.from` přijme poškozený Base64 řetězec a může
  z něj vytvořit prázdný obsah. Validace uloženého formátu nyní proběhne před
  převodem; poškozený záznam se odloží a další zpráva se může zpracovat.
  Dvě pojmenované funkce nahrazují vnořené anonymní převody příloh.
- `normalizeListText` sjednocuje úpravu textových parametrů URL a filtrů
  `ListOrders`/`ListUsers`. `usersOnPage`, `userIds` a `statsByUserId` výslovně
  popisují rozsah dat. Nevznikl obecný repozitář ani framework pro validaci.
- Architektonický přehled nyní ukazuje aktuální tok přes outbox, současné
  rozdělení mailových portů a stav původních pěti omezení. Historické výsledky
  zůstávají označené; vyřešené body nejsou prezentované jako dosud chybějící funkce.
- Docker byl spuštěn a ověřena oddělená databáze `silentagro_review_test` na
  `127.0.0.1:3318`. Prošlo **415 unit testů a 47 integračních testů**. Coverage
  domény a aplikace: 92,40 % řádků, 83,15 % větví, 90,60 % funkcí.
  Prošly SonarJS, běžný Knip, ESLint, TypeScript, Next build i sestavení workeru.
- Samostatný `dist/mail-worker.cjs --once` zpracoval jednu testovací zprávu přes
  `MAIL_DRIVER=memory`, potvrdil ji v databázi a uvolnil pronájem. Raw výsledek je
  v `reports/quality/worker-smoke.json`. Testovací data byla následně znovu připravena
  pro E2E; nejde o ověření skutečného SMTP doručení.
- Nový E2E běh se neuskutečnil: automatická kontrola oprávnění odmítla spuštění
  testovacího webu na `127.0.0.1:3019` s důvodem pouze „blocked by policy“.
  Poslední úspěšných 45 E2E scénářů proto stále patří předchozí vlně.

### Ponechané nálezy produkčního Knipu

| Soubor / export | Posouzení |
|---|---|
| `scale-model.ts` | Model používají testy a dosud nezapojená komponenta Scale. Samotná `scale.tsx` je již v `ignoreFiles`. Budoucí návrat nebo odstranění váhy zůstává produktovým rozhodnutím. |
| `env.ts`: `loadEnv`, `resetEnvCache` | Přímé testování validace konfigurace a izolace její cache. `loadEnv` se používá i uvnitř produkčního `getEnv`. |
| `create-mailer.ts`: `MemoryMailer`, `NodemailerMailer` | Konstrukce adaptérů a kontrola jejich chování v testech; produkční kód je vytváří přes `createMailer`. |
| `spayd.ts`: `buildRecipientMessage`, `buildSpayd` | Cílené testy formátu platby. Produkční `buildPaymentDetails` je volá uvnitř stejného modulu. Nepotřebný export typu `SpaydInput` je odstraněný. |

Těchto šest exportů tedy není šest nepoužívaných implementací. Nejsou kvůli nim
přidané plošné ignorovací vzory. `quality:scan` ponechává produkční pohled informační:
platný JSON s nálezy a exit kódem 1 znamená `review`. Chyba spuštění, jiný chybový kód
nebo nečitelný report běh shodí. Běžný Knip zůstává blokující. Celkový exit 0 proto
sám neznamená nulové nálezy; rozhodující jsou i stavy v `reports/quality/runs.json`.

### Posouzení zbývajících duplicit

- Dva skenovací skripty sdílejí importy a přípravu adresáře pro reporty. Krátký
  technický úvod zatím nepotřebuje samostatnou knihovnu.
- `loginAction` a `registerAction` mají podobnou signaturu a čtení formuláře,
  ale vlastní limiter, vstupy a chybové zprávy. Společné vytvoření session už
  má jednu implementaci; obě akce zůstávají čitelné samostatně.
- `AdvanceOrderStatus` a `SetOrderPaid` zamykají objednávku a odmítají storno.
  Každý use-case drží vlastní transakci a konkrétní pravidlo pro danou operaci.
- `updateStatus` a `setPaid` opakují krátký postup Prisma existence → update → mapování.
  Jejich úzké metody vyjadřují povolený zápis; obecný update s libovolnými poli
  by tento kontrakt zbytečně rozšířil.

### První skupina: závislosti a složitost

- Nodemailer `7.0.13 → 10.0.9`; odstraněny samostatné `@types/nodemailer`, protože
  nová verze dodává vlastní typy. Projekt používá Node 22 nebo novější, a splňuje tak
  požadavek Node 20 z [oficiálního changelogu](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md).
- Next.js 15.5.25 stále požaduje PostCSS 8.4.31. Úzký `overrides.next.postcss`
  jej nahrazuje verzí 8.5.28 ve stejné hlavní řadě. Viz
  [vydání PostCSS](https://github.com/postcss/postcss/releases/tag/8.5.28).
- Prisma 6.19.3 stále požaduje deepmerge-ts 7.1.5. Úzký
  `overrides["@prisma/config"]["deepmerge-ts"]` používá 8.0.2. Prisma volá export
  `deepmerge` při načítání konfigurace; změny slučování hodnot `Map` a interních
  typových názvů z [verze 8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
  tento projekt nevyužívá. Ověření zahrnuje generování klienta, migrace a integrace.
- Oba overrides jsou dočasné: odstranit je, jakmile odpovídající verze Next/Prisma
  přímo používá opravenou podzávislost; potom znovu spustit audit, build a integrační testy.
- Seed nyní pouze řídí pojmenované kroky pro odrůdy, novinky, pole, výkop, měření a
  objednávky. Create/update odrůdy sdílejí data. Regresní test kontroluje stabilní ID,
  nezměněné objednávky a zachování upravené novinky při opakování seedu.
- `Checkout` se stará o formulář a jeho validaci. `useReservation` spravuje uložení,
  opakování a odeslání téhož pokusu; `ReservationRecovery` zobrazuje jeho obnovení.
  Ceny a další obchodní pravidla zůstávají ve stávající doméně a aplikační vrstvě.

### Opravený nález ve vývojových závislostech

První úplný audit označil `vitest`, `@vitest/mocker` a `@vitest/coverage-v8` kvůli
[advisory GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).
Vitest i coverage provider byly aktualizovány z 3.2.7 na 4.1.11. Úplný audit po
aktualizaci má 0 nálezů; prošel unit i sériový integrační běh. Toto původně otevřené
zjištění je vyřešené, nikoli vynechané produkčním filtrem auditu.

Coverage se měří jen pro `src/domain` a `src/application`. Výsledky Vitestu 3 a 4
nejsou přímým srovnáním kvůli změně výpočtu pokrytí. Při stejném Vitestu 4.1.11
doplnění hraničních testů zvýšilo pokrytí větví z 80,50 % na 81,94 %; řádky zůstaly
na 90,84 %. Refaktoring klientského Checkout tento rozsah coverage neměří.
