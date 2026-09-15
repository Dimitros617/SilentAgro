# Výsledky nástrojového review — 14. 9. 2026

Skenována byla aktuální pracovní kopie SilentAgro, včetně dosud necommitnutých změn.
Nálezy pocházejí ze statických analyzátorů a databází zranitelností. Interpretace,
priority a posouzení falešných poplachů jsou následné vyhodnocení asistenta.
SonarQube Cloud zatím neběžel: osobní účet nemá založenou organizaci ani projekt.
Lokální SonarJS není kompletní analýza SonarQube Server/Cloud.

Průběh oprav a jejich ověření je v [seznamu nápravných kroků](code-quality-remediation.md).
Výchozí měření před opravami je oddělené od aktuálního stavu níže.

## Aktuální stav po navazující kontrole — 15. 9. 2026

| Kontrola | Aktuální výsledek |
|---|---|
| SonarJS | 0 hlášení |
| Knip | Běžný 0; produkční 1 soubor a 6 exportů, stav `review` a skutečný exit 1. Důvody ponechání jsou v evidenci nápravy; `scale.tsx` je výslovně ignorovaná. |
| jscpd | 4 krátké shody, 27 řádků, 0,22 %; zbývající shody posouzené jednotlivě |
| Trivy | Poslední běh z první vlny: 0 zranitelností a 0 chybných konfigurací v `package-lock.json` a Dockerfile |
| npm audit | Poslední běh po aktualizaci závislostí: 0 zranitelností v produkčním i vývojovém stromu |
| Unit / V8 coverage | 415 testů; 92,40 % řádků, 83,15 % větví, 90,60 % funkcí; pouze doména a aplikační vrstva |
| ESLint / TypeScript / build | Prošly po změnách fronty a seznamů; Next i worker se sestavily |
| Worker | Sestavený proces zpracoval testovací zprávu přes memory odesílatele a potvrdil ji v oddělené DB |
| Integrační | 47 testů proti oddělené MySQL 8.4; včetně obnovy pronájmu zprávy, poškozené přílohy a textových filtrů |
| E2E | Poslední úspěšný běh z předchozí vlny: 45 aktivních scénářů, 3 scénáře váhy záměrně přeskočené. Nové spuštění testovacího webu odmítla automatická kontrola oprávnění („blocked by policy“), E2E nyní neopakovány. |

Aktuální raw reporty jsou generované v `reports/quality/`; výchozí kopie zůstává v
`reports/quality-baseline-20260914/`. Výsledky potvrzují stav pracovní kopie v době běhu,
ne certifikaci služby po nasazení.

Produkční Knip je informační pohled bez testových spotřebitelů. Celkový úspěšný
exit `quality:scan` může obsahovat stav `review`; není to tvrzení o nulových
nálezech. Porovnání coverage s původním Vitestem 3 navíc ovlivňuje změna výpočtu
ve Vitestu 4, nikoli pouze změny kódu nebo testů.

## Naměřené výsledky před opravami

| Kontrola | Výsledek | Rozsah |
|---|---|---|
| SonarJS 4.2.0 | 45 hlášení | Doporučená pravidla s informací o TS typech, zdroje `src`, `prisma`, `scripts` |
| jscpd 5.2.0 | 7 dvojic bloků, 57 duplicitních řádků, 0,48 % | 132 souborů / 11 887 řádků; minimum 50 tokenů a 5 řádků, bez testů a migrací |
| Knip 6.35.1 | 1 soubor, 26 exportů, 19 exportovaných typů | Celý projekt včetně testů a konfigurace; žádná nepoužitá závislost po správném nastavení vstupů |
| Knip production | 2 soubory, 19 exportů, 20 typů | Doplňkový pohled bez spotřebitelů v testech; výsledky se s běžným během překrývají |
| Trivy 0.74.0 | 15 záznamů: 5 HIGH, 9 MEDIUM, 1 LOW | 3 knihovny v `package-lock.json`; závislosti pro vývoj nejsou zahrnuté |
| Trivy Dockerfile | 27 úspěšných kontrol, 0 nálezů | Kontrola Dockerfile; tento lokální běh neskenoval OS hotového image |
| npm audit `--omit=dev` | 6 označených balíčků: 5 high, 1 moderate | Počítá i nadřazené balíčky ovlivněné tranzitivní závislostí; číslo nelze sčítat s Trivy |
| Unit testy / V8 coverage | 383 testů prošlo; 84,40 % řádků, 92,27 % větví | Jen doména a aplikační vrstva, nikoli celá aplikace |
| Stávající ESLint / TypeScript | Bez chyb | Včetně pravidel závislostí mezi vrstvami |

Raw reporty jsou v `reports/quality/`; HTML detektoru duplicit je v
`reports/quality/duplicates/jscpd-report.html`, coverage v `coverage/index.html`.
Tyto generované výstupy nejsou součástí commitu. Skeny nejsou automatická certifikace
správnosti architektury ani důkaz, že každá hlášená knihovní chyba je dosažitelná přes web.

## Co opravit přednostně

### 1. Závislosti — oddělená aktualizace s regresními testy

| Knihovna | Instalovaná verze | Nálezy Trivy | Posouzení v projektu |
|---|---|---|---|
| Nodemailer | 7.0.13 | 10: 2 HIGH, 7 MEDIUM, 1 LOW | Používá jej web i mail worker. Aktualizaci řešit jako první. |
| PostCSS | 8.4.31 | 4: 2 HIGH, 2 MEDIUM | Přichází přes Next.js; skener zmiňuje práci se source mapami a CSS. |
| deepmerge-ts | 7.1.5 | 1 HIGH | Přichází přes konfiguraci Prisma; v ověřeném standalone výstupu webu není přítomný. |

Nodemailer hlásí například čtení souborů/SSRF přes `raw`, pomalé zpracování adres,
práci s hlavičkami a validaci cílové domény. Adaptér předává vybraná pole zprávy;
uživatelé nemohou zadat `raw`, `envelope.size`, OAuth2 nebo libovolné transportní volby.
Adresy navíc procházejí validací délky a znaků. To omezuje dosah konkrétních nálezů,
ale nenahrazuje aktualizaci knihovny. Viz například
[advisory k raw](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) a
[advisory k parseru adres](https://github.com/advisories/GHSA-2x7j-588g-ccc2).

PostCSS zpracovává vlastní styly projektu; přijetí škodlivého CSS nebo source mapy
od zákazníka nebylo v tomto review prokázáno. Přesto jde o starou tranzitivní knihovnu.
Deepmerge může vyčerpat zásobník při rekurzivních vstupech, ale jeho cesta vede přes
Prisma tooling. Viz [advisory deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

Automatické `npm audit fix --force` nebylo spuštěno: doporučené zásahy zahrnují změny
hlavních verzí i downgrade Prisma. Opravy vyžadují volbu kompatibilních verzí,
ověření migrací, mail workeru a sestavení. Čísla oprav v raw reportu patří vždy
k jednotlivým advisories; nejnižší uvedená opravená verze neřeší nutně všechny ostatní.

### 2. Čitelnost — dvě funkce a několik konstrukcí

- [Checkout](../src/components/cart/checkout.tsx), řádek 31: kognitivní složitost **20** při hranici **15**.
  Rozdělit řízení obnovy rezervace a zobrazení běžného formuláře při zachování stejných stavů.
- [Seed](../prisma/seed.ts), řádek 18: složitost **18**. Oddělit naplnění jednotlivých typů dat
  do pojmenovaných funkcí a sdílet data pro create/update odrůdy.
- Vnořené ternární výrazy v `orders-table.tsx:116`, `auth-modal.tsx:130` a `templates.ts:80`.
  Vyjádřit mezivýsledky pojmenovanými proměnnými nebo krátkými funkcemi.
- 29 doporučení `prefer-read-only-props`: vyjádřit neměnnost vstupních React props v typech.
  Jde o udržovatelnost kontraktu, nikoli o 29 prokázaných chyb uživatelského rozhraní.
- 3 deprecated API: `z.string().uuid()`, `.email()` a `.url()`; přejít na aktuální zápis Zod.
- Dále jeden vnořený template literal, zjednodušení zápisu regexu a čitelnější umístění `.reverse()`.

Tři hlášení potenciálně pomalých regexů jsou v tvorbě slugu a dvakrát v odstraňování
koncových lomítek konfigurační URL. URL pochází z konfigurace, slug upravuje farmář;
nejde o prokázaný veřejně dosažitelný DoS. Zjednodušení ale zároveň odstraní duplicitu
normalizace URL v kontejneru.

### 3. Nepoužívaný kód a exporty

Knip potvrdil nepoužívanou komponentu [Scale](../src/components/shop/scale.tsx).
`scale-model.ts` používají jen testy, takže se objeví navíc v produkčním běhu.
Tři již vynechané prohlížečové scénáře animace váhy odpovídají tomuto stavu.
Rozhodnout, zda váhu vrátit do UI, nebo odstranit komponentu společně s nepotřebnými testy.

Další výsledky znamenají často jen zbytečné `export`, nikoli nepoužitou funkci:
například konstanty, interní typy a lokálně používané pomocné metody. Re-exporty
`ORDER_CODE_OFFSET` a `orderCodeFor` z Prisma repozitářů už nemají odběratele.
Produkční běh navíc ukazuje `AuthorizeFarmerSession`, který spotřebovávají testy.
Nemaže se automaticky podle samotného počtu hlášení.

### 4. Duplicity a pokrytí

Duplicita 0,48 % je při zvolené citlivosti malá. Bloky se objevují v seedu,
login/register akcích, vykreslení KPI, zámku objednávky a aktualizaci repozitáře.
Jeden blok je společný úvod dvou nových diagnostických skriptů.
Krátký podobný postup ve dvou use-cases s jiným obchodním významem sám o sobě
neodůvodňuje novou obecnou hierarchii. Přednost má odstranění opakovaných pravidel.

Coverage ukazuje málo unit ověření přehledu administrace (13,55 %) a katalogu (0 %).
`DeliverMail` má v unit reportu také 0 %, ale je ověřován integračními scénáři fronty;
unit číslo tedy neznamená, že nebyl testován. Celkové prohlížečové a integrační
pokrytí tento LCOV report neslučuje. Cloud s širším rozsahem zdrojů může ukázat
nižší procento než zde uvedených 84,40 %.

## Ověřené falešné poplachy a nastavení nástrojů

SonarJS dvakrát tvrdí, že `event.target === dialogRef.current` bude vždy false
(`cancel-order-dialog.tsx:49`, `auth-modal.tsx:60`). V prohlížeči bylo ověřeno,
že cílem kliknutí může být přímo dialog a porovnání vrací true. Doporučení skeneru
přejít na `==` se nemá přijmout. Hlášení zůstávají v nezměněném raw reportu.

Knip má explicitní vstupy pro mail worker, seed, Playwright auth setup a typové testy.
Bez nich chybně označoval soubory používané frameworkem. Úzké výjimky jsou:

- `@vitest/coverage-v8`: poskytovatel načítaný Vitestem podle konfigurace.
- `eslint-config-next`: načítá jej `FlatCompat.extends`; Knip tuto vazbu nedohledal.
- binární `tsx`: seed hook Prisma 6 jej hlásí i v produkčním režimu, který nezapočítává devDependencies.

Žádné pravidlo SonarJS nebylo vypnuto kvůli zlepšení počtu nálezů.

## Opakování a cloudový dashboard

```bash
npm ci
npx prisma generate
npm run quality:scan
npm run quality:trivy
npm test -- --coverage
```

`quality:scan` spustí všechny tři analyzátory i při nálezech předchozího. Nenulový
exit code zůstává viditelný. Jednotlivě lze použít `quality:sonar`, `quality:duplicates`
a `quality:unused`. Trivy vyžaduje Docker a přístup k databázi advisories; zdroje
připojuje pouze pro čtení, neprovádí síťové odesílání zdrojového kódu do Sonaru.

Workflow **Code quality review** lze po pushi spustit ručně v GitHub Actions;
reporty uchovává jako artifact i při nálezech. Dosavadní CI zůstává aktivní.
Lokální běhy zde nejsou dokladem, že nové workflow už proběhlo na GitHubu.

Pro osobní projekt lze začít s SonarQube Cloud Free. Podle
[aktuálních plánů Sonaru](https://docs.sonarsource.com/sonarqube-cloud/administering-sonarcloud/managing-subscription/subscription-plans)
zahrnuje veřejné projekty a až 50 000 LOC soukromého kódu. Organizace v Sonaru
je logické seskupení projektů; nevyžaduje tým zaměstnanců. Vlastní quality profiles
a gates jsou omezené tarifem; lokální konfigurace na tarifu nezávisí.

1. Přihlásit se do evropské instance [SonarQube Cloud](https://sonarcloud.io/) přes osobní GitHub účet
   a připojit `Dimitros617/SilentAgro` podle průvodce. Zvolit Free a zaznamenat organization key a project key.
2. Zvolit analýzu přes GitHub Actions a vypnout Automatic Analysis, aby neběžely dvě různé analýzy téhož projektu.
3. V repozitáři přidat Actions variables `SONAR_ORGANIZATION`, `SONAR_PROJECT_KEY`
   a Actions secret `SONAR_TOKEN` z průvodce Sonaru.
4. Pushnout ověřené změny. Připravený workflow **SonarQube Cloud** importuje LCOV,
   analyzuje `main` a vlastní PR do `main` a čeká na výsledek quality gate.

Bez nastavených klíčů je cloudový job vynechaný; bez tokenu po aktivaci selže.
Návaznost a parametry odpovídají
[oficiální integraci GitHub Actions](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/ci-based-analysis/github-actions-for-sonarcloud).
