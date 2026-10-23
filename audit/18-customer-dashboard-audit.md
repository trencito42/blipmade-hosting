# 18 — Auditul panoului de client

**Data auditului:** 2026-10-23.
**Natura:** audit read-only, a doua rundă, al zonei de client a platformei Blipmade (`trencito42/blipmade-hosting`, producție la `blipmade.com`) și al fluxurilor pe care acestea le pornesc.
**Autor:** auditor A20.
**Identificatori:** prefixul `DASH-`. Constatările din runda anterioară (`UX-01` … `UX-28`) **nu sunt repetate**: acolo unde le-am reconfirmat, indic id-ul lor și starea curentă (vezi §0.3).

---

## 0. Metodă

### 0.1 Obiect și convenții

Am auditat întregul panou de client și fluxurile pe care le pornește: `/app` (Overview), `/app/deploy`, `/app/instances` + detaliul de instanță (tab-urile Overview, Console, Files, Databases, Backups, Network, Startup, Schedules, Settings, Activity, Resources, Domains), `/app/domains`, `/app/billing`, `/app/tickets` + detaliul de tichetă, `/app/settings` (Profile, Password, Sessions, Notifications, Account) și paginile publice `/`, `/apps`, `/apps/<slug>`, `/docs`, `/status`.

Pentru fiecare vedere am verificat: alinierea și layout-ul, reutilizarea componentelor, comportamentul responsive, stările gol / încărcare / eroare / populată, acuratețea și prospețimea datelor, etichetele și destinațiile acțiunilor, permisiunile și impunerea lor pe server, feedback-ul la interacțiune și accesibilitatea, plus comportamentul de navigare și de istoric al browserului.

Severitățile și clasele de verificare sunt cele din `12-FULL-FINDINGS-REGISTER.md` §0.1–0.2 (`P0` / `Critical` / `High` / `Medium` / `Low-Info`; `VERIFIED` / `CODE-INSPECTED` / `DOCUMENTED-ONLY` / `INFERRED` / `UNVERIFIED` / `BLOCKED` / `NOT-IMPLEMENTED`).

### 0.2 Unde am măsurat

| Sursă | Ce am folosit | De ce |
|---|---|---|
| `/root/blipmade-work` | codul curent (`web/src`, `api/src`), HEAD `3948f7f` „Fix the price contract, the table layout and the deploy availability" | obiectul auditat |
| `audit/_tools/sweep-before.json` | măsurătoarea per-rută a build-ului de **producție, pre-fix** (1440 / 834 / 390 px; layout, tabele, a11y, rețea) | simptomele măsurate pe producție; **nu am re-rulat sweep-ul** |
| `http://10.77.0.13:30003` | stiva izolată cu **codul curent** și baza `blipmade_test` semănată | singurul loc unde pot executa codul nou |
| `https://blipmade.com/api/catalog/products` | citire publică, fără autentificare | răspunsul autoritativ al serverului pentru catalog |

Nu am creat ordine, tichete, instanțe, domenii sau orice altă dată. Nu am modificat niciun fișier din platformă. Singurul fișier scris este acest raport. Scripturile de măsurare au fost scrise în `/tmp` pe VM (resturi de lucru, în afara platformei).

**Sesiuni:** am folosit contul `qa.check@example.test`. Am făcut **două** autentificări prin browser (una reușită, una eșuată pe timeout) și **una** prin API; apoi am reutilizat cookie-ul de sesiune pentru restul măsurătorilor, ca să nu consum limita de 10 autentificări / 15 min. Nu am intrat niciodată pe `https://blipmade.com` cu un cont — producția e citită doar prin măsurători și prin endpoint-uri publice.

### 0.3 Starea constatărilor din runda anterioară

Nu repet aceste constatări ca `DASH-*`; le reiau doar pentru a delimita teritoriul.

| ID precedent | Stare în codul curent | Unde |
|---|---|---|
| UX-01 (tabelele nu-și aliniază antetul cu corpul) | **Reparat** în componenta comună `DataTable` (`web/src/ui-app.tsx:1056-1089`: `border-separate`, `borderSpacing: '0 6px'`, `<colgroup>` explicit, `<tbody>` fără `grid`) — **dar a rămas un rest într-o tabelă scrisă manual**: vezi **DASH-03** | `web/src/app/Domains.tsx:314` |
| UX-02 („No public URL yet") | **Încă prezent** | `web/src/app/Overview.tsx:340`, `web/src/app/InstanceDetail.tsx:680` |
| UX-03 (două stări contrazicătoare) | **Nu se mai reproduce în zona de client**: toate vederile folosesc `StatusPill status={instance.status}` dintr-o singură sursă (`web/src/app/Overview.tsx:260,318`) | — |
| UX-05 (zidul de plată) | **Parțial reparat**: interfața gestionează starea „billing neconfigurat" (`web/src/app/Billing.tsx:123-131`, mesajul din `web/src/app/Deploy.tsx`); backend-ul Stripe e încă neconfigurat în producție | — |
| UX-06 (catalogul cerut de cinci ori) | **Reparat** — cererea e memorată (`web/src/lib/pricing.ts:40-51`) | — |
| UX-07 (catalogul pare gol în încărcare) | **Reparat** — schelet cu `animate-pulse` (`web/src/home/Catalog.tsx:36`) | — |
| UX-08 (butonul „Retry") | **Încă prezent** — eticheta e codificată în `ErrorState`, iar în guardul de staff butonul trimite la `/app` (`web/src/routes.tsx:151`) | — |
| UX-09 (`--ink-3` fără contrast) | **Încă prezent** — `--color-ink3: #7b827b` (`web/src/index.css:49`) | — |
| UX-10 (text alb pe roșu) | **Încă prezent** (`web/src/ui-app.tsx:895`, `web/src/ui-app.tsx:1024`) | — |
| UX-11 (parametrii de pornire lipsesc din formularul de deploy) | **Încă prezent** | `web/src/app/Deploy.tsx` |
| UX-12 (zona de client nu cere rolul) | **Încă prezent** — `web/src/routes.tsx:145` | — |
| UX-14 („CURRENT PERIOD ENDS —") | **Reparat** (`web/src/app/Billing.tsx:162`, subtitlul „Not available yet") | — |
| UX-15 (niciun avertisment pentru adresa neverificată) | **Încă prezent** — `web/src/app/Overview.tsx` nu conține nicio referință la `emailVerified` | — |
| UX-17, UX-19 | neschimbate | — |
| UX-18 (câmpuri fără indicator de focus) | **Încă prezent**, plus o a treia instanță: `web/src/home/Studio.tsx:203` (consola) | `web/src/home/Catalog.tsx:136`, `web/src/home/Studio.tsx:149` |
| UX-20 (fonturile 404) | **Încă prezent** — 2 cereri 404 la fiecare încărcare | — |
| UX-21 (`bg-bad/10` vs `/12`) | **Încă prezent** în 9 fișiere cu față de client | — |
| UX-22, UX-23, UX-24, UX-25, UX-26, UX-27, UX-28 | neschimbate; în afara secțiunilor 1, 2 și 6 | — |

### 0.4 Consistența disponibilității produselor — ce a fost reparat

Problema pe care o urmărește brief-ul („WordPress este descris ca indisponibil în propria descriere, dar este prezentat ca deployabil în altă parte") **este reparată în zona de client**, pe codul curent:

- Contractul de server (`api/src/services/availability.ts:56-79`) calculează cele patru stări dintr-un singur loc: `DEPLOYABLE` (deployable + egg), `COMING_SOON` (!deployable), `TEMPORARILY_UNAVAILABLE` (deployable fără `eggId`), `UNPUBLISHED` (!visible).
- Clientul reproduce exact aceeași regulă (`web/src/lib/pricing-contract.ts:186-230`), deci interfața și serverul răspund la fel.
- Interfața publică, catalogul de client și pagina de produs **blochează** produsul indisponibil și **nu** duc la un coș funcțional.
- Impunerea pe server există și în coș: `api/src/services/pricing.ts:167-168` aruncă `badRequest` la `priceItems`, folosit de `POST /api/catalog/quote` și de `POST /api/orders` (`api/src/routes/orders.ts:72`).

Măsurătoarea pe stiva izolată (catalogue re-sematat, cu toate cele patru stări):

```
code-server   -> {"state":"COMING_SOON","enabled":false,"installable":false,"visible":true,"orderable":false,
                  "blockers":["It has not been validated for deployment yet.","Its image is not installed on the panel yet."]}
discord-bot   -> {"state":"DEPLOYABLE","enabled":true,"installable":true,"visible":true,"orderable":true,"blockers":[]}
postgresql    -> {"state":"COMING_SOON",...}
uptime-kuma   -> {"state":"COMING_SOON",...}
wordpress     -> {"state":"TEMPORARILY_UNAVAILABLE","enabled":true,"installable":false,"visible":true,"orderable":false,
                  "blockers":["Its image is not installed on the panel yet."]}
```

Ce a rămas necuplat se găsește în **DASH-04** și **DASH-05**: paginile care nu citesc acest contract.

---

## 1. Tabelul constatărilor

| id | rută și componentă | simptom | severitate | clasă | unde e dovedit |
|---|---|---|---|---|---|
| DASH-01 | `/app/domains` — `EmptyState` „No instances yet" | CTA „Go to your dashboard" trimite la `/app`, nu la fluxul de deploy | Medium | `VERIFIED` | `web/src/app/Domains.tsx:140-149`; text și CTA capturate în browser |
| DASH-02 | `/app/billing` — `EmptyState` „No subscriptions yet" | CTA „Go to your dashboard" trimite la `/app`, nu la fluxul de deploy | Low | `VERIFIED` | `web/src/app/Billing.tsx:212-221`; text și CTA capturate în browser |
| DASH-03 | `/app/domains` — tabela înregistrărilor DNS | antetul e decalat cu până la **1133 px** față de corp; rândurile nu se aliniază nici între ele | **High** | `VERIFIED` | `web/src/app/Domains.tsx:314`; măsurătoare în DOM-ul aplicației vii |
| DASH-04 | `/` — `home/Studio.tsx` | 12 aplicații hardcodate, cu preț și buton activ „Deploy WordPress", deși serverul răspunde `TEMPORARILY_UNAVAILABLE` | Medium | `VERIFIED` | `web/src/data.ts:18-30`, `web/src/home/Studio.tsx:2,27,46,108,118-121`; măsurătoare browser |
| DASH-05 | `/`, `/apps`, `/docs` — meniu, blurb-uri, pagini de documentație | 7 produse care nu există în catalog sunt prezentate ca ofertă și au pagină de documentație | Medium | `VERIFIED` | `web/src/home/Nav.tsx:15-20`, `web/src/pages/Docs.tsx:2,75`; măsurătoare browser |
| DASH-06 | `/app/instances/:id` — tab-urile | tab-ul activ nu e în URL: fără intrare în istoric, fără link partajabil, reîncărcarea revine la „Overview" | Medium | `CODE-INSPECTED` | `web/src/app/InstanceDetail.tsx:593,704,706` |
| DASH-07 | `/app/instances/:id` — `SettingsPanel` | al doilea panou „Settings" vizibil permanent, sub tab-panel, lângă tabul „Settings" | Medium | `CODE-INSPECTED` | `web/src/app/InstanceDetail.tsx:497,536,721-725`; `web/src/app/instance/SettingsTab.tsx:93-102` |
| DASH-08 | `/app/instances/:id` → Databases, Network | `window.prompt` nativ pentru parolă (în clar) și pentru alias | Medium | `CODE-INSPECTED` | `web/src/app/instance/DatabasesTab.tsx:83`, `web/src/app/instance/NetworkTab.tsx:78` |
| DASH-09 | `/app/instances/:id` → Network | formularul cere IP și port pe care clientul nu le poate afla din interfață; contrazice comentariul propriu al modulului | Medium | `CODE-INSPECTED` | `web/src/app/instance/NetworkTab.tsx:28-34,154-169` |
| DASH-10 | `/app/instances/:id` → Schedules | acțiunea „Power" trimite întotdeauna `restart`; clientul nu poate alege start/stop | Low | `CODE-INSPECTED` | `web/src/app/instance/SchedulesTab.tsx:38,64` |
| DASH-11 | `/app/billing` — `StatTile` „Payment method" | același text apare de două ori, ca valoare și ca subtitlu | Low | `VERIFIED` | `web/src/app/Billing.tsx:71-72,164-168`; text capturat în browser |

**Total: 11 constatări — 0 P0, 0 Critical, 1 High, 7 Medium, 3 Low.**

Nicio constatare nouă în zona `admin/*` (în afara secțiunilor 1, 2 și 6 ale brief-ului).

---

## 2. Constatările

### DASH-01 · Starea goală a paginii „Domains" trimite clientul înapoi în panou, nu în fluxul de deploy

**Rută și componentă:** `/app/domains`, `EmptyState` din `web/src/app/Domains.tsx`.
**Severitate:** Medium · **Clasă:** `VERIFIED` · **Fișier:** `web/src/app/Domains.tsx:140-149`

**Simptom observat.** Cu zero instanțe, pagina Domains afișează panoul „Add a domain" și, dedesubt, starea goală „No instances yet" cu descrierea „Deploy an app or database first, then attach a domain to it." și butonul „Go to your dashboard" care duce la `/app`.

**Cauza root confirmată.** În `web/src/app/Domains.tsx:140-149` starea goală primește ca `action` un link către panoul de start:

```tsx
) : !instances.length ? (
  <EmptyState
    title="No instances yet"
    description="Deploy an app or database first, then attach a domain to it."
    action={
      <Link to="/app" className={linkButton}>
        Go to your dashboard
      </Link>
    }
  />
```

Destinația `/app` este generică; pasul următor real (alegerea unui produs) se află la `/app/deploy`. Contextul face situația mai asimetrică: domeniul **nu poate fi adăugat deloc** fără o instanță, deci clientul e blocat pe această pagină, iar singurul CTA îl întoarce într-un punct unde încă nu poate rezolva blocajul. Comparația cu aceeași componentă din `web/src/app/Instances.tsx` arată că pattern-ul corect există în codebase: acolo starea goală oferă „Choose a product" → `/app/deploy` și „Browse the public catalog" → `/apps`.

**Dovezi.** Text și CTA capturate din aplicația vie (stiva izolată, cod curent):

```
=== /app overflow= False
HEADINGS: ['H1:Domains', 'H2:Add a domain', 'H2:Your domains']
TEXT: ... Add a domain Claim a hostname for one of your instances. ... No instances yet
      Deploy an app or database first, then attach a domain to it. Go to your dashboard
      Your domains No domains yet ...
```

CTA-ul extras ca link: `{'tag':'a','label':'Go to your dashboard','href':'/app','disabled':false}`.

**Impact pentru client.** Un client nou nu poate înțelege că trebuie mai întâi să facă un deploy. Face un clic, ajunge în Overview, trebuie să recunoască secțiunea „Deploy your first app" și abia apoi să ajungă la catalog. E un pas în plus pe un flux pe care clientul tocmai l-a deschis; pe un telefon, în plus, e în plus un scroll.

**Fix recomandat.** În `web/src/app/Domains.tsx:141-149`, înlocuiește `action`-ul cu un `Link to="/app/deploy"` cu eticheta „Deploy your first app" (textul exact al CTA-ului din `web/src/app/Instances.tsx`), și păstrează „Go to your dashboard" doar ca link secundar, cu `text-[14px]`, ca în `web/src/routes.tsx:153-157`. Nu e nevoie de text nou; reutilizează `DeployAction` sau helperul de buton existent, ca butonul să arate la fel ca restul aplicației.

---

### DASH-02 · Starea goală a paginii „Billing" trimite clientul înapoi în panou, nu în fluxul de deploy

**Rută și componentă:** `/app/billing`, `EmptyState` din `web/src/app/Billing.tsx`.
**Severitate:** Low · **Clasă:** `VERIFIED` · **Fișier:** `web/src/app/Billing.tsx:212-221`

**Simptom observat.** Cu zero abonamente, secțiunea „Subscriptions" afișează „No subscriptions yet", descrierea „Subscriptions appear here as soon as you deploy an instance." și butonul „Go to your dashboard" → `/app`.

**Cauza root confirmată.** `web/src/app/Billing.tsx:212-221`, exact același tipar ca la DASH-01:

```tsx
) : !subscriptions.length ? (
  <EmptyState
    title="No subscriptions yet"
    description="Subscriptions appear here as soon as you deploy an instance."
    action={
      <Link to="/app" className={linkButton}>
        Go to your dashboard
      </Link>
    }
  />
```

Textul descriptiv spune corect care e pasul următor („deploy an instance"), dar butonul nu îl duce acolo: merge la `/app`. Pașii următori („Billing with no subscriptions should state the next actionable step") sunt deci întrerupți de un buton care nu conține pasul.

**Dovezi.** Captură din aplicația vie (stiva izolată, cod curent):

```
=== /app/billing overflow= False
HEADINGS: ['H1:Billing', 'H2:Payment method', 'H2:Subscriptions', 'H2:Invoices']
TEXT: ... Subscriptions One subscription per instance. No subscriptions yet
      Subscriptions appear here as soon as you deploy an instance. Go to your dashboard
      Invoices No invoices yet Invoices appear here after your first payment.
```

CTA: `{'tag':'a','label':'Go to your dashboard','href':'/app','disabled':false}`.

**Impact pentru client.** Impact mai mic decât la DASH-01, pentru că textul descrie deja pasul; clientul care citește textul înțelege ce are de făcut, dar cel care apasă butonul ajunge într-un punct generic.

**Fix recomandat.** În `web/src/app/Billing.tsx:212-221`, înlocuiește `action`-ul cu `Link to="/app/deploy"` / „Deploy your first app", ca la DASH-01, și păstrează „Go to your dashboard" ca link secundar. Dacă panoul de deploy nu e potrivit pentru un client care are deja instanțe fără abonament (cazul "cancel at period end"), ține cont că același buton apare și pentru clienții existenți: atunci textul butonului ar trebui să fie „See your instances" → `/app/instances`.

---

### DASH-03 · Tabela înregistrărilor DNS din „Domains" păstrează mecanismul lui UX-01: antetul e decalat cu 1133 px față de corp

**Rută și componentă:** `/app/domains`, tabela înregistrărilor DNS (tabel scris manual, nu `DataTable`).
**Severitate:** High · **Clasă:** `VERIFIED` · **Fișier:** `web/src/app/Domains.tsx:296-337`, în special `:314`

**Simptom observat.** În tabela înregistrărilor DNS, antetul coloanelor nu se suprapune peste coloanele rândurilor. Măsurătoarea în DOM-ul aplicației vii, la 1440 px:

```
domainsCurrent: tbodyDisplay = "grid"
  headerLefts = [0, 1121, 1244, 1388]
  rowLefts    = [[0, 133, 160, 255], [0, 140, 198, 345]]
  maxDelta    = 1133
dataTableFixed: tbodyDisplay = "table-row-group"
  headerLefts = [2, 471, 665, 1159]
  rowLefts    = [[2, 471, 665, 1159], [2, 471, 665, 1159]]
  maxDelta    = 0
```

Antetul „Type" stă la x = 1121 px, iar valoarea „A" din corp stă la x = 133 px. Mai grav, cele două rânduri nu sunt aliniate nici între ele (133 / 160 / 255 față de 140 / 198 / 345): fiecare rând e o tabelă independentă, cu coloane auto-dimensionate după conținut.

**Cauza root confirmată.** `web/src/app/Domains.tsx:314` — `<tbody className="grid gap-1.5">` într-un `<table className="w-full border-collapse">` scris manual. Mecanismul e exact cel documentat în UX-01: un `tbody` cu `display:grid` nu mai e grup de rânduri de tabel, deci fiecare `<tr>` devine o tabelă anonimă separată, iar browserul calculează lățimile antetului și lățimile corpului separat.

Componenta comună `DataTable` **a fost reparată** — `web/src/ui-app.tsx:1056-1089` folosește acum `border-separate`, `borderSpacing: '0 6px'`, un `<colgroup>` explicit și un `<tbody>` fără `grid`, deci antetul și corpul împart aceleași coloane (`maxDelta = 0`, măsurat). Tabela DNS din Domains **nu trece prin `DataTable`** și a rămas pe markup-ul vechi: este un rest al lui UX-01, în singurul loc unde mai există în zona de client.

**Dovezi.**
1. Cod: `web/src/app/Domains.tsx:297` (`<table className="w-full border-collapse text-left">`) și `web/src/app/Domains.tsx:314` (`<tbody className="grid gap-1.5">`), cu celulele la `:317-320` (`break-all`, fără lățimi fixe) și antetul la `:300-311`.
2. Măsurătoare: reproducerea markup-ului exact al componentei (`Domains.tsx:296-336`) în DOM-ul aplicației vii, cu CSS-ul real compilat, la 1440 px — ieșirea de mai sus. `tbodyDisplay` calculat = `"grid"`.
3. Contrast, în aceeași sesiune, cu marcajul componentei reparate (`border-separate` + `colgroup`): `maxDelta = 0`.
4. `grep` pe tot `web/src`: `tbody className="grid"` apare **doar** la `web/src/app/Domains.tsx:314`. Toate celelalte tabele din zona de client folosesc `DataTable`.

**Impact pentru client.** Clientul care adaugă un domeniu citește înregistrările DNS ca să le creeze la furnizor. Cu antetul decalat, nu poate lega valoarea de tipul ei: „A" pare să fie coloana „Value", iar valoarea reală pare să fie coloana „Actions". O asociere greșită înseamnă o înregistrare DNS greșită, deci un domeniu care nu rezolvă — exact funcția pentru care există pagina. E o cădere de funcție la o acțiune realistă (configurarea unui domeniu nou).

**De ce `High` și nu `Critical`:** UX-01 a fost clasat `Critical` pentru căsădea 9 rute și pentru că rândul lung ieșea 479 px din cutia lui, rupând și fundalul. Aici mecanismul e identic, dar e limitat la o singură tabelă dintr-o singură rută, iar conținutul rămâne lizibil; impactul e o asociere greșită de coloane, nu pierderea de date.

**Fix recomandat.** În `web/src/app/Domains.tsx:296-337`, înlocuiește tabelul scris manual cu `DataTable` din `web/src/ui-app.tsx` (acceptă `TableColumn<T>` din `web/src/lib/table.ts` și are deja `CardList` pentru telefon, ca în `web/src/app/instance/DatabasesTab.tsx:217-236`); coloanele: `Name` (`break-all`), `Type`, `Value` (`break-all`), `Actions` (butonul „Copy", cu `aria-label` ca azi). Dacă varianta cu `DataTable` e prea restrictivă pentru cele patru coloane, alternativa minimă e `border-separate` + `borderSpacing: '0 6px'` + un `<colgroup>` cu cele patru lățimi, ca în `ui-app.tsx:1056-1089` — și, obligatoriu, `grid` scos de pe `<tbody>`. Verificarea e cea din UX-01: decalajul antet–corp trebuie să fie **0**.

---

### DASH-04 · Pagina de pornire prezintă 12 aplicații hardcodate și un buton activ „Deploy WordPress" pentru un produs pe care serverul îl refuză

**Rută și componentă:** `/` (pagina publică), secțiunea „Studio" din `web/src/home/Studio.tsx`, randată de `web/src/home/Hero.tsx:69`.
**Severitate:** Medium · **Clasă:** `VERIFIED` · **Fișier:** `web/src/data.ts:18-30`, `web/src/home/Studio.tsx:2,27,46,108,118-121`, `web/src/home/Hero.tsx:69`

**Simptom observat.** Configuratorul de pe pagina de pornire listează 12 aplicații cu preț și un buton de deploy **activ**, fără nicio verificare de disponibilitate. Măsurătoare în browser pe codul curent:

```
radios: ["WordPress 512 MB · 5 GB disk €1.49", "Ghost 512 MB · 5 GB disk €1.99",
         "Forgejo 1 GB · 5 GB disk €2.49", "Code Server 1 GB · 5 GB disk €2.99",
         "Uptime Kuma 256 MB · 5 GB disk €1.49", "Grafana 512 MB · 5 GB disk €2.49",
         "n8n 1 GB · 5 GB disk €2.99", "Discord Bot 256 MB · 5 GB disk €1.49",
         "PostgreSQL 1 GB · 5 GB disk €4.49", "MySQL 1 GB · 5 GB disk €4.49",
         "Redis 512 MB · 1 GB disk €4.49", "MongoDB 1 GB · 5 GB disk €4.99"]
deployBtns: [{ "label": "Deploy WordPress", "disabled": false }]
```

Serverul răspunde, pentru același produs: `"state":"TEMPORARILY_UNAVAILABLE","orderable":false,"blockers":["Its image is not installed on the panel yet."]`.

**Cauza root confirmată.** Lista de pe pagina de pornire nu vine de la `GET /api/catalog/products`. E o constantă hardcodată:

- `web/src/data.ts:18-30` — `export const APPS: App[] = [ … ]`, 12 obiecte cu `from`, `mb`, `disk`;
- `web/src/home/Studio.tsx:2` — `import { APPS, … } from '../data'`;
- `web/src/home/Studio.tsx:27` — `useState<App>(APPS[0])` (implicit, primul element, WordPress);
- `web/src/home/Studio.tsx:46` — filtrarea listei pe `APPS`;
- `web/src/home/Studio.tsx:108` — numărul per categorie, `APPS.length` / `APPS.filter(...)`;
- `web/src/home/Studio.tsx:118-121` — butonul `Deploy {app.name}`, fără nicio verificare de stare.

Consecința: componenta nu poate ști că WordPress nu e instalabil pe panel, pentru că nu consultă contractul de disponibilitate (`api/src/services/availability.ts:56-79`) și nici măcar catalogul. E exact simptomul pe care îl descrie brief-ul — „WordPress este descris ca indisponibil în propria descriere, dar este prezentat ca deployabil în altă parte" — iar diferența față de catalogul public este că acolo starea **e** verificată (`web/src/home/Catalog.tsx:101,166` folosesc `isOrderable` / `orderBlockers`).

**Dovezi.**
1. Măsurătoare browser de mai sus (cod curent, stiva izolată).
2. Răspunsul serverului: `curl http://10.77.0.13:30003/api/catalog/products` → `wordpress → {"state":"TEMPORARILY_UNAVAILABLE","orderable":false,…}`.
3. `grep` pe `web/src`: `APPS` e importat în `web/src/home/Studio.tsx:2` și `web/src/pages/Docs.tsx:2`; nu apare în `web/src/home/Catalog.tsx`, `web/src/app/DeployCatalog.tsx` sau `web/src/app/ProductPage.tsx`, care toate citesc catalogul de la API.
4. Contrast, pe aceeași stivă și cu același client: `/apps/wordpress` afișează „This product is temporarily unavailable. Its image is not installed on the panel yet." și **niciun** buton de deploy; `/app/deploy/wordpress` afișează „Not available to deploy" cu aceleași blocaje.

**Impact pentru client.** Un client care intră pe pagina de pornire vede o ofertă de 12 produse și un buton „Deploy WordPress" activ. Doar 5 dintre cele 12 există în catalog, iar unul singur dintre acestea e comandabil. Nu se pierde plată — butonul rulează o simulare, iar disclaimerul de la `web/src/home/Studio.tsx:225` („Simulated preview. Nothing is created or billed. Prices are illustrative.") spune asta — dar interfața prezintă un produs indisponibil ca fiind cel maiieftin și cel mai la îndemână, iar clientul care încearcă să-l cumpere descoperă abia apoi, pe pagina de produs, că nu poate fi comandat.

**Fix recomandat.** În `web/src/home/Studio.tsx`, înlocuiește `APPS` (importul de la `web/src/data.ts:2`) cu catalogul real: folosește același cârlig cu cache ca restul aplicației (`useCatalogProducts` din `web/src/lib/pricing.ts:40-51`, care cere catalogul o singură dată) și filtrează cu `isOrderable` din `web/src/lib/pricing-contract.ts:186`, ca în `web/src/home/Catalog.tsx:101`. Butonul devine „Deploy {app.name}" doar pentru produsele comandabile și, pentru celelalte, textul blocajului din `orderBlockers` (`web/src/lib/pricing-contract.ts:192`). Cele 12 intrări din `web/src/data.ts:18-30` se pot păstra doar ca text de marketing, dar nu pot mai fi etichetate ca ofertă cu preț; dacă lista rămâne, prețurile trebuie scoase sau marcate ca ilustrative, ca disclaimerul de la `Studio.tsx:225` să fie adevărat și pentru preț, nu doar pentru deploy.

---

### DASH-05 · Meniul public și documentația prezintă 7 produse care nu există în catalog

**Rută și componentă:** `/`, `/apps`, `/apps/<slug>`, `/docs` — meniul public (`web/src/home/Nav.tsx`) și paginile de documentație (`web/src/pages/Docs.tsx`).
**Severitate:** Medium · **Clasă:** `VERIFIED` · **Fișier:** `web/src/home/Nav.tsx:15-20`, `web/src/pages/Docs.tsx:2,75`

**Simptom observat.** Pe toate paginile publice, meniul listează explicit produse care nu sunt în catalog:

```
Web & CMS      WordPress, Ghost and other site builders
Developer Tools  Git forges and cloud editors
Monitoring       Uptime, metrics and dashboards
Automation       Workflows that run themselves
Bots             Discord and chat bots, always on
Databases        PostgreSQL, MySQL, Redis, MongoDB
```

Catalogul serverului are 5 produse: `wordpress`, `code-server`, `discord-bot`, `uptime-kuma`, `postgresql`. „Ghost", „MySQL", „Redis" și „MongoDB" nu există deloc. Mai mult, `/docs` publică **pagini de documentație complete** pentru 12 produse:

```
docLinks: ["/docs?p=getting-started", "/docs?p=first-app", "/docs?p=wordpress", "/docs?p=ghost",
           "/docs?p=forgejo", "/docs?p=code-server", "/docs?p=uptime-kuma", "/docs?p=grafana",
           "/docs?p=n8n", "/docs?p=discord-bot", "/docs?p=postgresql", "/docs?p=mysql",
           "/docs?p=redis", "/docs?p=mongodb", …]
```

Șapte dintre acestea documentează produse care nu pot fi comandate (Ghost, Forgejo, Grafana, n8n, MySQL, Redis, MongoDB), iar șase nu există deloc în catalog.

**Cauza root confirmată.** Aceleași două surse hardcodate ca la DASH-04:
- `web/src/home/Nav.tsx:15-20` — dicționarul `CATEGORY_BLURBS` cu text fix per categorie, folosit în `web/src/home/Nav.tsx:120` și `:145`; nu este construit din categoriile catalogului.
- `web/src/pages/Docs.tsx:2` — `import { APPS, fmtMb, type App } from '../data'`; `web/src/pages/Docs.tsx:75` — `const app = APPS.find((a) => a.name === name)`, adică pagina de documentație a unui produs își ia descrierea, dimensiunile și prețul tot din lista hardcodată.

**Dovezi.**
1. Măsurătoare browser pe `/docs` (cod curent): lista de mai sus cu cele 14 linkuri de documentație pentru aplicații.
2. Măsurătoare pe `/apps` (cod curent): textul meniului „Web & CMS WordPress, Ghost and other site builders … Databases PostgreSQL, MySQL, Redis, MongoDB", iar contorul din meniu este acum corect („5 APPS AND DATABASES", luat din API) — deci problema e limitată la textele fixe, nu la număr.
3. Catalogul serverului (5 produse) — vezi §0.4.
4. `grep` pe `web/src`: `APPS` nu este folosit în nicio componentă care consultă catalogul.

**Impact pentru client.** Documentația pentru „Ghost" descrie un produs care nu se poate cumpăra și nu există; clientul care citește `/docs?p=ghost` și apoi caută produsul în catalog găsește un buton „Deploy this app" pe pagina `/apps/ghost` care întoarce „This product does not exist." Pe aceeași rută, meniul promite MySQL și MongoDB care nu sunt oferite.

**Fix recomandat.** În `web/src/home/Nav.tsx:15-20`, scoate dicționarul fix și construiește blurb-urile din categoriile care vin de la API (același hook de catalog ca în `web/src/home/Catalog.tsx`), păstrând un text generic per categorie („Databases" → „Relational and non-relational databases"). În `web/src/pages/Docs.tsx`, paginile de aplicație ar trebui generate din catalog: doar produsele publicate primesc pagină, iar cele `COMING_SOON` / `TEMPORARILY_UNAVAILABLE` primesc o notă „not available yet" folosind `availabilityLabel` din `web/src/lib/pricing-contract.ts:221`. Ca soluție minimă, paginile pentru produsele inexistente se scoat din `Docs.tsx` și din lista din `web/src/data.ts:18-30`.

---

### DASH-06 · Tab-ul activ al paginii de instanță nu e în URL: nu există istoric de browser și nici link partajabil

**Rută și componentă:** `/app/instances/:id` — tab-urile (12 în total), `web/src/app/InstanceDetail.tsx`.
**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Fișier:** `web/src/app/InstanceDetail.tsx:593,704,706`

**Simptom observat.** Tab-ul activ e stare locală de componentă, nu o parte a adresei. Consecințe:
- comutarea între taburi **nu creează o intrare în istoric**: butonul „înapoi" al browserului părăsește pagina instanței în loc să revină la tabul anterior;
- reîncărcarea paginii (F5) sau trimiterea linkului către un coleg revine întotdeauna la „Overview";
- un link către „tabul Backups" nu poate fi construit și nu poate fi copiat.

**Cauza root confirmată.** `web/src/app/InstanceDetail.tsx:593`:

```tsx
const [tab, setTab] = useState<Tab>('overview');
```

și `web/src/app/InstanceDetail.tsx:704`:

```tsx
<Segmented options={TABS} value={tab} onChange={setTab} ariaLabel="Instance sections" />
```

Fișierul **nu importă** `useRouter` și nu conține niciun apel la `navigate`: `grep -n "useRouter\|navigate\|search\|query\|useState<Tab>" web/src/app/InstanceDetail.tsx` întoarce doar două rânduri — linia 101 (numele pictogramei `search` din lista de iconițe) și linia 593 (starea locală a tabului). Routerul aplicației (`web/src/router.tsx`) susține deja sincronizarea adresei, iar **aceeași aplicație o folosește deja în alt loc**: pagina publică `/docs` își ține secțiunea curentă în adresă (`web/src/pages/Docs.tsx:2450` citește `query`, `web/src/pages/Docs.tsx:2519-2523` scrie `navigate("/docs?p=${id}")`). Deci infrastructura există și tab-ul pur și simplu nu o folosește.

**Dovezi.**
1. Cod: `web/src/app/InstanceDetail.tsx:593` (stare locală), `:704` (consumatorul stării), `:706` (`<section role="tabpanel">` fără `id` și fără `aria-labelledby`, deci nici relația ARIA dintre tab și panel nu e legată de adresă).
2. Lipsa oricărui import de router în fișier — confirmat prin `grep`.
3. Contrast, în aceeași aplicație: `/docs` face exact sincronizarea care lipsește aici — citește secțiunea din adresă (`web/src/pages/Docs.tsx:2450`) și scrie în adresă la comutare (`web/src/pages/Docs.tsx:2519-2523`); la fel, vrăjitoria de deploy citește `query` (`web/src/app/Deploy.tsx:173`). Routerul are și `navigate` cu `replace` și `scrollTo(0,0)` (`web/src/router.tsx`), deci există mecanismul necesar.
4. Verificarea istoricului de browser pentru **navigarea prin linkurile din meniu** a fost făcută și e corectă: după clic pe „Billing" adresa devine `/app/billing`, iar „înapoi" revine la `/app`. Defectul e limitat la tab-urile paginii de instanță.

**Impact pentru client.** Tab-urile sunt funcția principală a paginii de instanță (12 secțiuni: Console, Files, Databases, Backups, Network, Startup, Schedules, Settings, Activity, Resources, Domains). Clientul care lucrează cu „Backups" și apoi apasă „înapoi" pierde locul și iese din pagină. Suportul nu poate primi un link către secțiunea exactă.

**Fix recomandat.** În `web/src/app/InstanceDetail.tsx`, citește tab-ul din adresă (ex. `?tab=backups`) cu `useRouter()`, și scrie-l la comutare cu `navigate(\`?tab=${value}\`, { replace: false })`, ca fiecare tab să aibă propria intrare în istoric. Tab-ul implicit („overview") se normalizează la adresa curată, ca linkul să nu fie niciodată duplicat. Adăugați și `id` pe `<section role="tabpanel">` și `aria-labelledby` pe tab, ca relația ARIA să fie corectă.

---

### DASH-07 · Pagina de instanță arată două panouri „Settings" diferite, unul vizibil permanent sub tab-uri

**Rută și componentă:** `/app/instances/:id` — `SettingsPanel` (`web/src/app/InstanceDetail.tsx:497-536`, randat la `:721-725`) și tabul „Settings" (`web/src/app/instance/SettingsTab.tsx`).
**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Fișier:** `web/src/app/InstanceDetail.tsx:497,536,706-725`; `web/src/app/instance/SettingsTab.tsx:93-102`

**Simptom observat.** Pe pagina instanței există două interfețe diferite, ambele cu titlul „Settings":
1. tabul „Settings" (al 9-lea dintre 12) conține panoul „Settings" (`web/src/app/instance/SettingsTab.tsx:93`), panoul „Name and description — What the server is called on the panel." (`:102`), panoul „What the panel knows" (`:125`), panoul „Operations that cannot be undone" (`:148`) și panoul „The instance" (`:183`);
2. sub tab-panel, **pe orice tab**, `SettingsPanel` (`:721-725`) randează un `<Panel title="Settings">` (`:536`) cu câmpul „Instance name", butonul „Save name" și butonul periculos „Cancel instance".

Cele două gestionează **nume diferite**: `SettingsTab` schimbă numele serverului **pe panel** (prin `updateSettings`), `SettingsPanel` schimbă numele **instanței în Blipmade** (prin `POST /instances/:id/rename`, `web/src/app/InstanceDetail.tsx:511`). Clientul vede două câmpuri „nume", două butoane de salvare și un pericol („Cancel instance") vizibil pe orice tab, inclusiv pe „Overview".

**Cauza root confirmată.** `web/src/app/InstanceDetail.tsx:721-725` randă `SettingsPanel` **în afara** secțiunii de tab-uri:

```tsx
<section role="tabpanel" aria-label={TABS.find((entry) => entry.value === tab)?.label ?? 'Instance section'}>
  {tab === 'overview' && <OverviewTab … />}
  …
  {tab === 'settings' && <SettingsTab instance={instance} onGoTo={setTab} />}
  …
</section>

<SettingsPanel instance={instance} onUpdated={…} onCancelled={reload} />
```

Nu există nicio condiție `tab === 'settings'` în jurul lui `SettingsPanel`, deci panoul e permanent. Iar `SettingsPanel` își are propriul `<Panel title="Settings">` (`web/src/app/InstanceDetail.tsx:536`), care produce al doilea titlu identic cu cel din `SettingsTab.tsx:93`.

**Dovezi.**
1. Cod: `web/src/app/InstanceDetail.tsx:721-725` (randare necondiționată), `:536` (`<Panel title="Settings">`), `:507-514` (rename-ul instanței), `:516-519` (cancel-ul); `web/src/app/instance/SettingsTab.tsx:93` (primul „Settings"), `:102-123` (numele serverului de pe panel), `:46` (`updateSettings`).
2. Semantica celor două butoane de salvare e diferită, din cod: `updateSettings` (panel) vs `POST /instances/:id/rename` (Blipmade) — deci nu e o dublură de etichetă, sunt două obiecte diferite puse sub același titlu.
3. Măsurătoarea pe build-ul de producție (pre-fix) confirmă prezența acestor butoane pe pagina instanței: CTA-urile paginii `/app/instances/:id` din `audit/_tools/sweep-before.json` includ `button 'Save name'` și `button 'Cancel instance'`.

**Impact pentru client.** Clientul care vrea să schimbe numele instanței are două câmpuri cu același concept; dacă îl schimbă pe cel din tabul „Settings", modifică numele de pe panel și nu pe cel din Blipmade, și vede confuzie („am salvat, dar numele nu s-a schimbat"). „Cancel instance" e vizibil pe fiecare tab, fără ca vizitatorul să fi intrat în secțiunea de setări.

**Fix recomandat.** Mută `SettingsPanel` în tabul „Settings" (`web/src/app/InstanceDetail.tsx:715`, lângă `<SettingsTab …>`), ca singurul loc unde se schimbă numele instanței și se anulează instanța. Dacă panoul trebuie să rămână accesibil din orice tab, scoate-i titlul „Settings" (devine „Instance name"), ca să nu existe două titluri identice pe același ecran, și mută „Cancel instance" în tabul „Settings", lângă operațiile ireversibile din `SettingsTab.tsx:148`.

---

### DASH-08 · Două dialoguri native `window.prompt` în tab-urile instanței, unul pentru o parolă afișată în clar

**Rută și componentă:** `/app/instances/:id` → tab-urile „Databases" și „Network".
**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Fișier:** `web/src/app/instance/DatabasesTab.tsx:83`, `web/src/app/instance/NetworkTab.tsx:78`

**Simptom observat.** Două acțiuni de editare ies din sistemul de design și folosesc dialogul nativ al browserului:

```tsx
// web/src/app/instance/DatabasesTab.tsx:83
const password = window.prompt('The new password of the database.');
```

```tsx
// web/src/app/instance/NetworkTab.tsx:78
const alias = window.prompt('The name of this address.', current ?? '');
```

`grep -rn "window\.prompt|window\.confirm|window\.alert" web/src` întoarce exact aceste două apariții.

**Cauza root confirmată.** `web/src/app/instance/DatabasesTab.tsx:83` și `web/src/app/instance/NetworkTab.tsx:78` apelează `window.prompt` direct, în loc de componentele `TextInput` și `ConfirmDialog` pe care restul aplicației le folosește pentru exact aceleași operații. Concret, `window.prompt` nu are câmp `type="password"`: **parola nouă a bazei de date e scrisă în clar** pe ecran, pe când formularul de creare din același fișier folosește corect `type="password"` (`web/src/app/instance/DatabasesTab.tsx:171-177`). Dialogul nativ nici nu poate fi stilat, nici nu respectă designul (barele, fonturile, contrastul), nici nu e localizat, iar pe un telefon blochează interfața cu un control al browserului.

**Dovezi.**
1. Cod: `web/src/app/instance/DatabasesTab.tsx:83` (prompt pentru parolă) vs `:171-177` (`TextInput type="password"` pentru creare); `web/src/app/instance/NetworkTab.tsx:78` (prompt pentru alias); `web/src/app/instance/DatabasesTab.tsx:264-275` și `web/src/app/instance/NetworkTab.tsx:231-242` arată că `ConfirmDialog` e deja folosit corect pentru acțiunile periculoase din aceleași tab-uri.
2. `grep -rn "window\.prompt|window\.confirm|window\.alert" web/src` → doar aceste două apariții; restul aplicației nu folosește dialoguri native.

**Impact pentru client.** Parola bazei de date e vizibilă în clar într-un prompt al browserului (pe un ecran partajat sau într-o captură de ecran rămâne acolo), în contrast cu restul aplicației, care o ascunde. În plus, dialogul nativ nu oferă niciun feedback structurat: erorile API ajung doar ca toast, iar valoarea introdusă se pierde la închidere.

**Fix recomandat.** În `web/src/app/instance/DatabasesTab.tsx:82-92`, înlocuiește `window.prompt` cu un formular inline în `Panel` (ca cel de creare, `:154-204`), cu `TextInput type="password"` și regulile parolei; trimite schimbarea doar când formularul e valid. În `web/src/app/instance/NetworkTab.tsx:77-86`, folosește același tipar pentru alias. Dacă se păstrează dialogul nativ pentru alias, măcar pentru parolă trebuie înlocuit — e singurul loc din aplicație unde o secretă e tipată în clar.

---

### DASH-09 · Formularul „Add an address" cere IP și port pe care clientul nu le poate afla din interfață

**Rută și componentă:** `/app/instances/:id` → tabul „Network" (`web/src/app/instance/NetworkTab.tsx`).
**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Fișier:** `web/src/app/instance/NetworkTab.tsx:28-34,151-177`

**Simptom observat.** Pentru a adăuga o adresă, formularul cere trei câmpuri libere: „Address" (ex. `10.77.0.11`), „Port" (ex. `30000`) și „Name". Adresa și portul sunt valori pe care platforma le deține (panelul le alocă), nu valori pe care clientul le poate inventa. Singura adresă pe care clientul o vede în interfață este cea a instanței, în tabul „Network", la rândul de mai jos, și e deja ocupată de container.

**Cauza root confirmată.** Contradicția e în interiorul aceluiași fișier: comentariul de contract al modulului spune că portul nu se scrie niciodată manual, iar formularul îl scrie manual.

```tsx
// web/src/app/instance/NetworkTab.tsx:28-34 (comentariul de contract)
/**
 * The addresses of the instance.
 *
 * The port the service listens on is the one the panel assigned. It is read
 * from the panel and never written by hand, so the address here is the
 * address the customer really uses.
 */
```

```tsx
// web/src/app/instance/NetworkTab.tsx:154-169 (formularul)
<TextInput label="Address" value={form.ip} … placeholder="10.77.0.11" … />
<TextInput label="Port" type="number" value={form.port} … placeholder="30000" … />
```

`createAllocation` trimite `ip` și `port` către panel (`web/src/app/instance/NetworkTab.tsx:51-55`), care acceptă doar alocări existente în pool-ul nodului; altfel eroarea vine înapoi ca text (`formError`, `:178-181`). Clientul nu are de unde afla un IP liber și un port liber: nu există nicio listă de adresă disponibilă în interfață.

**Dovezi.**
1. Cod: `web/src/app/instance/NetworkTab.tsx:28-34` vs `:154-169` vs `:51-55` (creare cu `ip`/`port` libere) vs `:198-202` (starea goală: „The panel assigns an address to every server").
2. `web/src/app/instance/NetworkTab.tsx:122` arată că singurul indicator de adresă primară e `row.is_default`, adică pool-ul de alocări nu e expus.

**Impact pentru client.** Acțiunea realistă „adaugă o adresă secundară pentru un alt port" nu poate fi dusă la capăt cu informațiile din interfață: clientul trebuie să ghicească IP-ul nodului și un port liber, într-un formular care nu spune de unde vin valorile. Fără un astfel de port, aplicația nu poate fi accesată pe un alt port.

**Fix recomandat.** În `web/src/app/instance/NetworkTab.tsx:151-177`, înlocuiește câmpurile libere de IP și port cu o listă de adresă disponibile, adusă de la API (extinde `web/src/lib/instance-api.ts` cu un `listAvailableAllocations`), și lasă clientul să aleagă din `Select`. Păstrează doar câmpul „Name" liber. Ca variantă minimă, cere doar portul și preia IP-ul de la panel, iar corectează comentariul de la `:28-34` dacă modelul rămâne manual.

---

### DASH-10 · Acțiunea de planificare „Power" trimite întotdeauna o repornire

**Rută și componentă:** `/app/instances/:id` → tabul „Schedules" (`web/src/app/instance/SchedulesTab.tsx`).
**Severitate:** Low · **Clasă:** `CODE-INSPECTED` · **Fișier:** `web/src/app/instance/SchedulesTab.tsx:38,64`

**Simptom observat.** Lista de acțiuni oferă „Power", dar la salvare se trimite mereu o repornire: clientul nu poate programa o oprire sau o pornire, ci doar o repornire.

**Cauza root confirmată.** `web/src/app/instance/SchedulesTab.tsx:38` definește opțiunea `{ value: 'power', label: 'Power' }`, iar `web/src/app/instance/SchedulesTab.tsx:64` mapează fix:

```tsx
if (form.action === 'power') payload.signal = 'restart';
```

Nu există niciun control în formular care să aleagă între `start`, `stop` și `restart`, iar lista afișează eticheta generică „Power" (`web/src/app/instance/SchedulesTab.tsx:38`, redată ca `String(row.action).replace(/_/g,' ')` în listă). Payload-ul e trimis transparent către panel (`web/src/lib/instance-api.ts:419-422` → `api/src/routes/instance-server.ts:855-876`), care îl transmite mai departe; deci restricția e în interfață, nu în backend.

**Dovezi.** Cod: `web/src/app/instance/SchedulesTab.tsx:38`, `:64`, `:50` (valoarea implicită `action: 'power'`), `:74` (resetarea formularului) și `:238` (descrierea „A schedule runs a power action, a command or a backup…").

**Impact pentru client.** Clientul care programează „Power" crede că poate alege ce face panoul; în realitate doar repornește. Un client care vrea să oprească serverul noaptea pentru a economisi resurse nu poate exprima asta.

**Fix recomandat.** În `web/src/app/instance/SchedulesTab.tsx`, adaugă un `Select` cu „Start" / „Stop" / „Restart" care scrie `payload.signal` corespunzător (valorile sunt cele acceptate de panel: `start`, `stop`, `restart`), și etichetează lista cu valoarea efectivă (ex. „Restart") în loc de „Power", ca lista să spună ce se va întâmpla.

---

### DASH-11 · Textul „No payment method on file" apare de două ori în panoul de plată

**Rută și componentă:** `/app/billing` — `StatTile` „Payment method".
**Severitate:** Low · **Clasă:** `VERIFIED` · **Fișier:** `web/src/app/Billing.tsx:71-72,164-168`

**Simptom observat.** În secțiunea de sus a paginii Billing, textul apare de două ori, imediat unul după altul: ca valoare a indicatorului și ca subtitlu al lui.

**Cauza root confirmată.** `web/src/app/Billing.tsx:71-72` întoarce șirul „No payment method on file" când nu există metodă de plată:

```tsx
function describePaymentMethod(method: PaymentMethod | null | undefined): string {
  if (!method) return 'No payment method on file';
```

iar `web/src/app/Billing.tsx:164-168` folosește simultan funcția ca valoare și un alt șir ca subtitlu:

```tsx
<StatTile
  label="Payment method"
  value={describePaymentMethod(summary.paymentMethod)}
  hint={summary.paymentMethod ? undefined : 'No payment method on file.'}
/>
```

**Dovezi.** Captură din aplicația vie (stiva izolată, cod curent):

```
=== /app/billing
TEXT: ... PAYMENT METHOD No payment method on file No payment method on file.
      Payment method Manage the card or payment method used for your subscriptions. …
```

**Impact pentru client.** Redundanță vizibilă pe pagina de facturare, într-o zonă unde clientul încearcă să înțeleagă dacă are sau nu o metodă de plată. Impact redus, dar e pe prima zonă vizibilă a paginii.

**Fix recomandat.** În `web/src/app/Billing.tsx:167`, păstrează subtitlul doar când valoarea spune altceva: fie `hint="Add a payment method to be able to pay your invoices."`, fie elimină subtitlul și lasă valoarea să singură. Alternativ, ca valoare folosește „—" (sau „None"), iar mesajul complet rămâne în subtitlu.

---

## 3. Ce nu am putut verifica

| Item | Motiv |
|---|---|
| **Stările populate ale panoului** (tabel cu instanțe, lista de abonamente, lista de tichete, detaliul de instanță cu rânduri, detaliul de tichetă cu mesaje, lista de domenii cu rânduri) | Baza `blipmade_test` are 0 instanțe, 0 abonamente, 0 facturi, 0 tichete, 0 domenii, 0 comenzi și 0 noduri, și nu am creat date. Doar stările goale ale acestor rute au putut fi executate. Pentru stările populate am folosit măsurătoarea de pe build-ul de producție din `audit/_tools/sweep-before.json` (care e build-ul **pre-fix**, deci descrie simptomele vechi) și inspecția codului curent. |
| **Verificarea end-to-end a celor 12 tab-uri ale instanței** | Nu există instanță în stiva izolată, deci tab-urile nu s-au putut executa. DASH-06, DASH-07, DASH-08, DASH-09 și DASH-10 sunt `CODE-INSPECTED`: mecanismele sunt confirmate în cod, dar comportamentul în execuție nu a fost măsurat. |
| **DASH-03 pe pagina reală** | Tabela DNS apare doar când există un domeniu, iar baza de test nu are domenii. Măsurătoarea e o **reproducere în DOM-ul aplicației vii**, cu markup-ul exact al componentei (`Domains.tsx:296-336`) și CSS-ul real compilat la 1440 px; nu e o captură a paginii populate. |
| **Starea produselor pe producție** | API-ul de producție rulează build-ul **pre-fix**: `curl https://blipmade.com/api/catalog/products` întoarce produse fără `eggId` și fără `availability` (cheile existente: `category, defaultCpu, defaultDisk, defaultRam, deployable, description, docsUrl, icon, id, maxCpu, maxDisk, maxRam, minCpu, minDisk, minRam, name, options, price, slug, visible`). Contractul cu cele patru stări e implementat în cod, dar **nu e încă deployat în producție**; l-am verificat pe stiva izolată, care rulează codul curent. |
| **Comportamentul real al formularului de deploy până la coș** | Nu am creat nicio comandă și niciun preț nu a fost cerut cu o combinație plătibilă; blocajele de indisponibilitate sunt însă confirmate pe server (`api/src/services/pricing.ts:167-168`) și în interfață. |
| **Comportamentul plăților** | Stripe nu e configurat în niciuna dintre mediile verificate (`/api/health` → `"stripe":"test"` pe stiva izolată, neconfigurat în producție). Calea de plată nu a putut fi executată. |
| **Fluxul de recuperare a parolei, schimbarea e-mailului, închiderea unei sesiuni, trimiterea unui răspuns într-o tichetă** | Toate ar crea date; nu au fost executate. Verificarea e limitată la cod. |
| **Comportamentul responsive al paginilor populate** | La 390 px și 834 px am măsurat doar rutele fără date, plus `/`, `/apps`, `/docs`, `/status`. Măsurătoarea pe 390 px din `sweep-before.json` e pre-fix. |
| **`UX-03` (două stări contrazicătoare pe pagina instanței)** | Nu se mai reproduce în cod pentru zona de client (toate vederile folosesc `StatusPill` dintr-o singură sursă), dar n-am putut-o executa pe o instanță reală. |
| **Ecranele cu erori** | Erorile de rețea au fost urmărite doar pasiv (răspunsuri HTTP ≥ 400), fără blocarea rețelei; stările de eroare au fost verificate prin inspecția codului (`ErrorState`, `ApiErrorState`). |
| **Regulile de permisiuni din zona de client** | `UX-12` (zona de client nu cere rolul) e reconfirmat în cod (`web/src/routes.tsx:145`) și e încă prezent; n-am putut verifica izolat, fiindcă rolul se deduce din `Session` și ar necesita un cont staff suplimentar. |

---

*Raport redactat de auditor A20, 2026-10-23. Platforma a fost citită fără modificări; singurul fișier scris este acest raport.*
