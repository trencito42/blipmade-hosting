# Audit de fază 7 — Revizuire vizuală și UX completă (post-remediere)

**Blipmade** — platformă de găzduire · fază 7 din auditul post-remediere

---

## 1. Metadate

| Câmp | Valoare |
|---|---|
| **Data** | 23 octombrie 2026 (America/New_York) |
| **Commit** | `2e1e78a` („Keep the audit tooling away from the production database") — ramura `main`, repo `/opt/blipmade` pe VM 103 |
| **Oglindă (mirror)** | `/root/blipmade-work` (fără git) |
| **Stivă testată** | Stivă izolată proprie: baza de date **`uxaudit_test`**, API pe **127.0.0.1:3105**, web pe **127.0.0.1:30005** (VM 103) |
| **Browser folosit** | Chromium (`/usr/bin/chromium`), `playwright-core` din `/opt/blipmade/tools/browser/node_modules/playwright-core/index.js`, rulat cu `xvfb-run -a node` pe VM 103 |
| **Browsere care NU au putut fi testate** | **Firefox și WebKit NU sunt instalate pe această mașină și NU au putut fi testate.** Nicio afirmație din acest raport despre Firefox sau WebKit nu este măsurată. Unde comportamentul depinde de motor (derulare CSS, `scroll-behavior`, sticky, `:focus-visible`, aspect ratio al controlului de range), rămâne **neverificat** și este declarat în §8. |
| **Conturi folosite** | client `qa.check@example.test` / `CorrectHorseBattery9` · personal `admin.check@example.test` / `CorrectHorseBattery9` |
| **Lățimi testate** | 320, 375, 768, 1024, 1440, 1920 px (înălțime 900 px) |
| **Rute testate** | 32 rute: 10 publice · 9 client (inclusiv 2 pagini de detaliu) · 13 admin (inclusiv 1 pagină de detaliu) |
| **Măsurători efectuate** | 192 perechi rută × lățime · 13 058 elemente de text verificate pentru contrast · 60 de tabele măsurate cu date populate |

### 1.1 Izolarea mediului — declarație

- **Nu s-a scris niciodată în baza de date `blipmade` (producție).** Toate scrierile au fost în `uxaudit_test`.
- **Portul 30002 nu a fost folosit** ( este mort) și niciun URL public sau de margine (`blipmade.com`, `10.77.0.13:3000`) nu a fost vizitat.
- Stiva proprie a fost construită din copii de build (`/tmp/api-check`, `/tmp/web-check`) în `/tmp/uxaudit/`, cu `DATABASE_URL` către `uxaudit_test`, `API_URL=http://127.0.0.1:3105` — deci pagina web nu poate ajunge la API-ul de producție (3100).
- **Nu s-a trunchiat `blipmade_test`**, baza de date comună a celorlalți auditori. Nu s-a șters niciun rând din baza ei.
- Singurele scrieri făcute de acest audit: conturi, sesiuni, bilete, comenzi, instanțe, promoții și rânduri de jurnal **create** în `uxaudit_test`, prin Prisma, cu o guardă care refuză orice bază de date care nu se termină în `_test` sau `_check`.
- Fișierele de captură sunt scrise **doar** în `/tmp` pe VM; **niciun binar nu intră în repository**.
- **Verificare read-only a izolării, după audit:** `SELECT count(*) FROM "User"` pe baza de producție `blipmade`, filtrând pe cele două adrese folosite de acest audit, returnează **0**. Toate cele 22 de conturi, 14 bilete și 33 de sesiuni create de acest audit sunt în `uxaudit_test`.
- **Stiva proprie a rămas pornită** pe VM (API 3105, web 30005, baza `uxaudit_test`), pentru ca orice reverificare să poată fi reluată fără a reconstrui nimic. Se poate opri cu `kill` pe PID-urile de pe porturile 3105 și 30005; baza se șterge cu `dropdb uxaudit_test`.
- **Datele brute au fost arhivate** în `audit/post-remediation/_raw/phase7-*.json` (sweep, focus, states, deploy ×2), ca text — fără binare.

### 1.2 Corpurile de date folosite

Pentru ca verdictele despre tabele să fie luate pe **date populate**, nu pe stări goale, stiva a fost populată cu: 5 produse cu prețuri, **22 de conturi** (21 de clienți cu nume și adrese de lungimi diferite, inclusiv caractere diacritice, plus 1 cont de personal), 6 instanțe, 8 comenzi în toate stările (PAID, PENDING, FAILED, CANCELLED, REFUNDED), **14 bilete** cu subiecte de la 8 la 137 de caractere, 3 promoții, 12 rânduri de jurnal și 12 sesiuni (din care **două create identice**, cu același IP, același User-Agent, același moment la minut și fără `lastSeenAt`).

---

## 2. Metodologie

### 2.1 Instrumentarul

| Script (pe VM, în `/tmp`) | Ce măsoară | Fișier brut |
|---|---|---|
| `uxaudit-sweep.mjs` | sweep-ul principal: 32 rute × 6 lățimi | `/tmp/uxaudit-sweep.json` |
| `uxaudit-focus.mjs` | parcurgerea focusului cu `Tab`, vizibilitatea indicatorului, numele accesibil | `/tmp/uxaudit-focus.json` |
| `uxaudit-states.mjs` | stările de încărcare / eroare / gol / populat (rulare API întârziată, API cu 500) | `/tmp/uxaudit-states.json` |
| `uxaudit-deploy.mjs`, `uxaudit-deploy2.mjs` | persistența configuratorului de deploy, prețul afișat vs. prețul cotat | `/tmp/uxaudit-deploy.json`, `/tmp/uxaudit-deploy2.json` |
| `uxaudit-tableprobe.mjs`, `uxaudit-ticketprobe.mjs`, `uxaudit-truncation.mjs` | geometria tabelelor, celulele tăiate, recuperabilitatea valorii | ieșire pe consolă |
| `uxaudit-motion-cards.mjs` | `prefers-reduced-motion`, lista de carduri de pe telefon | ieșire pe consolă |
| `uxaudit-net.mjs`, `uxaudit-home.mjs`, `uxaudit-extra.mjs`, `uxaudit-modal.mjs`, `uxaudit-final.mjs` | cereri de rețea, geometria paginii de pornire, casete de permisiuni, dialoguri, distanțe | ieșire pe consolă |
| `uxaudit-shots.mjs` | capturi de ecran (18 fișiere) | `/tmp/uxaudit-shots/` |

Toate măsurătorile sunt **DOM/CSS calculate în browser**, nu inspecție vizuală. Scriptul sweep este o adaptare a `audit/_tools/dashboard-sweep.mjs`, extinsă cu: lifting-ul temporar al lui `overflow-x: hidden` (vezi §2.2), decalajul pe coloană, trunchierea, țintele mici, contrastul, tipografia și densitatea.

### 2.2 Metode de măsurare și criterii de trecere

| Verificare | Metodă | Prag de **OK** |
|---|---|---|
| Depășire orizontală | Se ridică temporar `overflow-x: hidden` de pe `html` și `body` (ascunde defectul), apoi se citește `documentElement.scrollWidth` și se identifică elementele care depășesc `window.innerWidth` | `scrollWidth − innerWidth ≤ 1 px` |
| Aliniere antet ↔ corp | Pentru fiecare coloană: `|x(thead thᵢ) − x(tbody tr₁ tdᵢ)|` | `maxOffset ≤ 1 px` la **fiecare** lățime, cu date populate |
| Trunchiere | `td.scrollWidth > td.clientWidth + 1`; separat: existența unui `title` în celulă sau în descendenții ei | 0 celule tăiate fără valoare recuperabilă |
| Antet lipicios | `getComputedStyle(thead).position` și `getComputedStyle(th).position` | `sticky` pe listele cu peste 10 rânduri |
| Ținte de atingere | `getBoundingClientRect()` pentru `a[href], button, input, select, [role=button]` vizibile | `≥ 24 × 24 px` (WCAG 2.5.8) |
| Focus vizibil | `Tab` real prin Chromium, apoi `outline` / `box-shadow` / `--tw-ring-shadow` pe elementul activ | cel puțin unul din cele trei, la fiecare oprire |
| Contrast | luminanță relativă WCAG 2.x, fundalul compus peste părinți cu alfa | `≥ 4.5:1` text normal, `≥ 3:1` text mare (≥ 24 px sau ≥ 18,66 px bold) |
| Semantică | numărul de `h1`, `main`, `nav`, `header`, `footer` | exact un `h1` și un `main` pe pagină |
| Stări | rulare API cu 6 s întârziere / cu 500 / date reale | fiecare stare trebuie să existe și să fie distinctă de celelalte |
| Preț vs. cotă | `POST /api/catalog/quote` cu token CSRF, pentru exact configurația din adresa paginii | egalitate exactă |

**Limitări ale instrumentului, declarate:** măsurătoarea de contrast verifică cel mult **400** de elemente de text pe pagină (pagina cea mai densă, `/admin/customers`, are 219 — sub prag); lista de ținte mici este **trunchiată la 12 elemente pe pagină**, deci numărul din matrice este o **limită inferioară**, nu valoarea reală.

### 2.3 Disciplină: preferință vs. defect

Criteriul folosit: un element este **defect** dacă produce o măsură obiectivă în afara pragului (decalaj, depășire, raport de contrast, țintă sub 24 px, valoare irecuperabilă, stare lipsă). Un element este **preferință estetică** dacă este măsurabil, dar în afara pragurilor WCAG/AA și fără un criteriu de funcționalitate violat. Secțiunea 5 separă total cele două categorii; nicio afirmație din §5 nu este folosită ca motiv de blocaj.

---

## 3. Matricea rezumat — rută × lățime

Numărul este **numărul de instanțe de defect măsurate** (eșecuri de contrast + ținte mici + celule tăiate). `OK` = nicio instanță măsurată.

| Rută | 320 | 375 | 768 | 1024 | 1440 | 1920 |
|---|---|---|---|---|---|---|
| `/` | 30 | 30 | 32 | 32 | 34 | 34 |
| `/apps` | OK | OK | OK | OK | OK | OK |
| `/apps/wordpress` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/apps/discord-bot` | 1 | 1 | 1 | 1 | 1 | 1 |
| `/docs` | OK | OK | OK | OK | OK | OK |
| `/status` | OK | OK | OK | OK | OK | OK |
| `/login` | OK | OK | OK | OK | OK | OK |
| `/register` | OK | OK | OK | OK | OK | OK |
| `/forgot-password` | OK | OK | OK | OK | OK | OK |
| `/this-route-does-not-exist` | OK | OK | 1 | 1 | 1 | 1 |
| `/app` | 19 | 19 | 19 | 19 | 19 | 19 |
| `/app/deploy` | 15 | 15 | 15 | 15 | 15 | 15 |
| `/app/instances` | 6 | 6 | 8 | 8 | 8 | 8 |
| `/app/domains` | OK | OK | OK | OK | OK | OK |
| `/app/billing` | 6 | 6 | 6 | 6 | 6 | 6 |
| `/app/tickets` | 3 | 3 | 6 | 6 | 6 | 6 |
| `/app/settings` | 15 | 15 | 15 | 15 | 15 | 15 |
| `/app/instances/:id` | 9 | 9 | 9 | 9 | 9 | 9 |
| `/app/tickets/:id` | 5 | 5 | 5 | 5 | 5 | 5 |
| `/admin` | 24 | 24 | 24 | 24 | 24 | 24 |
| `/admin/customers` | 126 | 126 | 42 | 42 | 42 | 42 |
| `/admin/orders` | 24 | 24 | 16 | 16 | 16 | 16 |
| `/admin/services` | 42 | 42 | 24 | 24 | 24 | 24 |
| `/admin/products` | 40 | 40 | 20 | 20 | 15 | 15 |
| `/admin/pricing` | 45 | 45 | 45 | 45 | 45 | 45 |
| `/admin/tickets` | 28 | 28 | 26 | 26 | 26 | 26 |
| `/admin/promotions` | 21 | 21 | 3 | 3 | 3 | 3 |
| `/admin/infrastructure` | 8 | 8 | 8 | 8 | 8 | 8 |
| `/admin/audit` | 90 | 90 | 45 | 45 | 45 | 19 |
| `/admin/staff` | 14 | 14 | 14 | 14 | 14 | 14 |
| `/admin/settings` | OK | OK | OK | OK | OK | OK |
| `/admin/customers/:id` | 10 | 10 | 10 | 10 | 10 | 10 |
| **Total** | **829** | **829** | **700** | **700** | **697** | **697** |

**Rezultate pozitive importante, măsurate:**

- **Zero depășiri orizontale** în toate cele **192** de perechi rută × lățime (`scrollWidth − innerWidth = 0 px`). Confirmă că UX-16, UX-17 și UX-28 rămân remediate, la 320 px ca și la 1920 px.
- **Zero decalaje antet ↔ corp** în toate cele **60** de măsurători de tabel, cu date populate (21 de clienți, 14 bilete, 27 de rânduri de jurnal, 8 comenzi, 6 servicii). Remedierea UX-01 (colgroup) **ține**.
- **Zero indicatori de focus invizibili** în toate cele **54** de parcurgeri cu `Tab` (27 rute × 2 lățimi).
- **Zero butoane fără nume accesibil**, **zero imagini fără `alt`**, **zero câmpuri fără etichetă**.
- **Zero animații rămase** sub `prefers-reduced-motion: reduce` (pagina de pornire: 14 animații normal → **0** sub `reduce`).

---

## 4. Constatări

### 4.1 Defecte transversale (valabile la toate lățimile)

---

#### UX-P1-01 — Tokenul `--ink-3` nu trece WCAG AA pe suprafețele pe care este folosit

| | |
|---|---|
| **Rută** | toate cele 32 de rute |
| **Lățime** | 320 / 375 / 768 / 1024 / 1440 / 1920 |
| **Severitate** | **High** |
| **Comportament observat** | Textul secundar (`text-ink3`) este desenat în `rgb(123, 130, 123)` = `#7b827b`. Pe `--s2` (`#1a1d1a`) raportul este **4.31:1**, pe `--s3` (`#232823`) **3.80:1**, pe `--acc-bg` (`#12291b`) **3.92:1** — sub pragul de 4.5:1. |
| **Comportament așteptat** | ≥ 4.5:1 pentru text de mărime normală, pe orice suprafață pe care tokenul apare. |
| **Măsurătoare** | 13 058 elemente de text verificate pe sweep; **2 334 eșecuri**, **toate** provenind din același token. Distribuție: 741 × 4.31:1, 636 × 4.31:1, 246 × 4.31:1, 214 × 4.31:1, 123 × 3.80:1, 120 × 3.80:1, 98 × 4.31:1, 84 × 4.31:1, 25 × 4.31:1, 18 × 4.31:1, 12 × 4.31:1, 6 × 3.80:1, 6 × 3.92:1, 5 × 3.92:1. Cel mai mare număr de eșecuri pe o pagină: `/admin/pricing` — **45**; apoi `/admin/customers` — **42**; `/` — **34**. |
| **Cauză** | `web/src/index.css:57` — `--color-ink-3: #7b827b;`. Tokenul este folosit pe 8 clase diferite (`text-ink3`, `text-[12.5px].text-ink3`, `text-[11px].uppercase`, `font-mono.text-[12.5px].text-ink3` etc.), pe toate suprafețele `s2`, `s3` și `acc-bg`. |
| **Remediere propusă** | O singură linie: `--color-ink-3: #8a9090`. Ratificările calculate: pe `--s2` **5.24:1**, pe `--s3` **4.63:1**, pe `--acc-bg` **4.76:1** — toate peste prag. Pentru rezerve, `#8f958f` dă 5.56 / 4.91 / 5.05. |
| **Criteriu de verificare** | Sweep-ul pe cele 32 de rute × 6 lățimi raportează **0** eșecuri de contrast; `--ink-3` peste 4.5:1 pe `bg`, `s1`, `s2`, `s3`, `acc-bg`. |
| **Captură** | — (defect global, valabil peste tot) |

> **Notă de revalidare:** constatarea anterioară `UX-09` a fost marcată „NOT VERIFIED" în `PREVIOUS-FINDINGS-REVALIDATION.md` §4.8. **Aici este reverificată și confirmată, cu măsurătoare.** Remedierea este o linie de CSS, fără impact pe layout.

---

#### UX-P1-02 — Coada de suport din zona de admin este înghesuită într-o coloană de 360 px, iar coloana de detaliu rămâne goală

| | |
|---|---|
| **Rută** | `/admin/tickets` |
| **Lățime** | 1024 / 1440 / 1920 (de la `lg:` încolo) |
| **Severitate** | **High** |
| **Comportament observat** | Grila paginii este `lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]`. Panoul „Queue" primește **360 px**, iar coloana a doua (detaliul biletului) este un panou gol cu textul „No ticket open". Tabelul are `min-width: 640px` într-un container `overflow-x: auto` de **320 px**. Rezultatul: la 1440 px, **subiectul biletului este tăiat la 144 px** (conținut real 174 px pentru un rând, până la **1 117 px** pentru altul), iar **coloana „Assigned" nu este vizibilă** fără derulare orizontală în interiorul cutiei. Aproximativ **700 px** din fereastră rămân nefolosiți. |
| **Comportament așteptat** | Când niciun bilet nu este selectat, coada ocupă toată lățimea disponibilă; când unul este selectat, grila trece la două coloane. |
| **Măsurătoare** | La 1440 px: `wrapperWidth = 320 px`, `tableWidth = 640 px`, `minWidth = 640 px`, celula „Ticket" `clientWidth = 144 px` vs. `scrollWidth = 1 117 px` pentru cel mai lung subiect; 12/42 celule tăiate; coloana „Assigned" la `x = 480…656 px`, în afara cutiei vizibile de 320 px. La 768 px, lățimea containerului este 670 px — **mai bună decât la 1440 px**, deci defectul apare tocmai când ecranul e suficient de lat. |
| **Cauză** | `web/src/admin/Tickets.tsx:148` — `className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"` și `web/src/admin/Tickets.tsx:150` — `<div className={selectedId ? 'hidden lg:block' : 'block'}>`; când `selectedId` este null, prima coloană este `block`, dar **grila rămâne cu două coloane**. |
| **Remediere propusă** | Grila trebuie să aibă coloana 2 **doar când există un bilet selectat**: `className={selectedId ? 'grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]' : 'grid gap-4'}`; iar în starea fără selecție, coada trebuie să primească lățimea completă. Alternativ, coada rămâne în 360 px, dar subiectul trebuie să se înfășoare (fără `truncate`) și coloana „Assigned" să fie mutată în cardul de detaliu. |
| **Criteriu de verificare** | La 1440 px, lățimea containerului tabelului ≥ 1 000 px când niciun bilet nu este selectat; celula „Ticket" nu mai trunchiază; coloana „Assigned" e vizibilă fără derulare. |
| **Captură** | `/tmp/uxaudit-shots/01-admin-tickets-1440.png` (și `02-admin-tickets-1440-full.png`) — se vede subjects tăiate („#41 Please help me m", „#40 The weekly invc") și jumătatea dreaptă a ecranului goală. |

> **Observație privind tabelul de suport din zona de client:** `/app/tickets` este corect — tabelul primește 1 070 px la 1440, decalajul antet/corp este 0 px, iar singurele 3 celule tăiate sunt pe coloana „Subject", care are `title` pe link (`web/src/app/Tickets.tsx:159`). **Complicația originală a tabelului de suport este rezolvată în zona de client, dar persistă în zona de admin.**

---

#### UX-P1-03 — Valori tăiate în tabele fără nicio cale de recuperare (80 de celule)

| | |
|---|---|
| **Rută** | `/admin/audit`, `/admin/services` |
| **Lățime** | toate (tabelul e ascuns sub 768 px, deci celulele există de la 768 px încolo) |
| **Severitate** | **Medium** |
| **Comportament observat** | Celulele trunchiate cu `max-w-0 truncate` **nu au** niciun atribut `title`, nici pe celulă, nici pe vreun descendent. Valoarea afișată este un fragment, iar valoarea completă nu există în DOM și nu poate fi obținută nici măcar la hover. |
| **Comportament așteptat** | Contractul propriu al design system-ului spune că „The full value stays in the title of the cell, so nothing is lost" (`web/src/lib/table.ts:29-31`). Contractul trebuie respectat **oriunde** se folosește `truncate: true`. |
| **Măsurătoare** | `/admin/audit`: **74 din 222 celule** tăiate — coloana „Actor" (37 celule, 152 px de conținut în 109 px) și coloana „Target" (37 celule, 264 px de conținut în 122 px). **Toate 74 fără `title`.** `/admin/services`: **6 din 42 celule** tăiate în coloana „Customer" (152 px în 100 px), **toate fără `title`**. Total: **80 de celule** cu valoare irecuperabilă. Prin comparație, `/admin/tickets` are 12 celule tăiate, dar **toate 12** au `title` (`web/src/admin/Tickets.tsx:180`). |
| **Cauză** | `web/src/admin/Audit.tsx:175` (coloana „Actor") și `web/src/admin/Audit.tsx:187` (coloana „Target") folosesc `truncate: true` fără `title` pe span-ul interior; `web/src/admin/Services.tsx:201` (coloana „Customer") la fel. `web/src/ui-app.tsx:1158` aplică `cellClass(column, …)`, care adaugă `max-w-0 truncate`, dar **nu adaugă** `title` — atributul e responsibility fiecărei componente de render. |
| **Remediere propusă** | Două opțiuni, ambele compatibile cu stilul deja folosit în `/admin/tickets`: (a) fiecare span trunchiat primește `title={valoarea completă}`; (b) `DataTable` ia un câmp opțional `titleFor?: (row) => string` pe coloană și pune automat `title` pe celulă. Varianta (b) elimină definitiv clasa de defect. |
| **Criteriu de verificare** | Pentru fiecare tabel, **0 celule** cu `scrollWidth > clientWidth` care să nu conțină un `title` pe celulă sau pe descendenți. |
| **Captură** | `/tmp/uxaudit-shots/06-admin-audit-1440.png` |

---

#### UX-P1-04 — Două sesiuni identice sunt afișate ca două rânduri identice, la caracter

| | |
|---|---|
| **Rută** | `/app/settings` |
| **Lățime** | toate |
| **Severitate** | **Medium** |
| **Comportament observat** | Lista de sesiuni afișează pentru fiecare rând: `${ip} · signed in on ${formatMoment(createdAt)} · ${sessionActivity(lastSeenAt)}`. `formatMoment` (`web/src/lib/api.ts:161-171`) afișează **doar până la minut**, fără secunde. Două sesiuni cu același IP, același User-Agent, create în același minut și fără `lastSeenAt` produc **rânduri identice la caracter**. |
| **Comportament așteptat** | Fiecare rând să poată fi recunoscut și să poată fi închis cu certitudine. |
| **Măsurătoare** | Pe stiva de test, două sesiuni identice (IP `198.51.100.24`, același Chrome/Windows, `createdAt = 2026-10-20T09:15:00Z`, `lastSeenAt = null`) au produs două rânduri **byte-identice**:<br>`Chrome on Windows 10 198.51.100.24 · signed in on 20 Oct 2026, 09:15 · no activity recorded Close session`<br>Identic pe ambele rânduri, cu aceleași 108 caractere. Din cele 13 rânduri ale listei, 12 sunt distincte; **1 pereche este identică**. |
| **Cauză** | `web/src/lib/api.ts:202-205` (`sessionSummary`), `web/src/lib/api.ts:161-171` (`formatMoment`), `web/src/lib/api.ts:193-196` (`sessionActivity` → „no activity recorded"), `web/src/app/Settings.tsx:483-497` (randarea). Lipsesc din UI: secunda, un identificator scurt al sesiunii, un marcaj „dispozitiv nou" și o etichetă pentru tipul adresei. |
| **Remediere propusă** | Ca propunerea deja formulată în `SESSIONS-INVESTIGATION.md` §6.1, dar **strict la nivel de UI**: (a) `createdAt` cu secundele; (b) `lastSeenAt` cu secundele, iar pentru o sesiune nefolosită „never used after signing in" în loc de „no activity recorded"; (c) un identificator scurt (`id.slice(0,4) + '…' + id.slice(-3)`) care poate fi comunicat suportului; (d) un marcaj „New device" pentru o sesiune a cărei combinație IP + User-Agent nu apare în ultimele 30 de zile. **Fără deduplicare** — rândul trebuie să poarte informație discriminatorie, nu să fie ascuns. |
| **Criteriu de verificare** | Două sesiuni cu aceleași metadate sunt vizibil diferite pe ecran, iar fiecare rând poate fi închis individual fără riscul de a închide una dintre două sesiuni asemănătoare. |
| **Captură** | `/tmp/uxaudit-shots/09-settings-sessions-1440.png` |

---

#### UX-P1-05 — Numele de instanță scris de client se pierde la reîncărcare, la „înapoi" și la link direct

| | |
|---|---|
| **Rută** | `/app/deploy/:slug` |
| **Lățime** | toate |
| **Severitate** | **Medium** |
| **Comportament observat** | Configurația de resurse trăiește în adresa paginii (`?ram=2048&cpu=1&disk=5`) și supraviețuiește corect. **Numele instanței nu trăiește în adresă**: este stare React (`useState`), inițializată cu `product.slug`. Un nume scris de client este **discardat fără avertisment** la reîncărcare, la navigarea „înapoi/înainte" și la deschiderea directă a linkului. |
| **Comportament așteptat** | Ce a scris clientul rămâne, sau cel puțin este anunțat că s-a pierdut. |
| **Măsurătoare** | Scris `audit-shop-01` în câmpul „Instance name", apoi: reîncărcare → `nameValue = "wordpress"`; „înapoi" → `"wordpress"`; link direct pe adresa anterioară → `"wordpress"`. Adresa s-a păstrat exact (`ram=2048&cpu=1&disk=5`) în toate cele trei cazuri. |
| **Cauză** | `web/src/app/Deploy.tsx:167` — `const [name, setName] = useState('')`; `web/src/app/Deploy.tsx:196-200` — `useEffect` care resetează `name` la `product.slug` la fiecare montare. `deployPathFor` (`web/src/lib/pricing-contract.ts:247-255`) scrie în adresă doar `ram`, `cpu`, `disk`, `opts`, `step`, `order`. |
| **Remediere propusă** | Fie `name` intră în adresă (ca `opts` și `step`), fie pagina păstrează valoarea în `sessionStorage` la scriere și o citește la montare. Varianta cu adresa este preferabilă: face linkul de deploy complet reproductibil, exact ca restul configurației. |
| **Criteriu de verificare** | Un nume scris de client apare identic după reîncărcare, după „înapoi/înainte" și după deschiderea linkului direct. |

---

#### UX-P1-06 — Niciun tabel din platformă nu are antetul lipicios

| | |
|---|---|
| **Rută** | toate rutele cu tabel (`/app/instances`, `/app/tickets`, `/admin/customers`, `/admin/orders`, `/admin/services`, `/admin/products`, `/admin/tickets`, `/admin/promotions`, `/admin/audit`, `/admin/staff`) |
| **Lățime** | toate |
| **Severitate** | **Medium** |
| **Comportament observat** | La derularea în jos, antetul tabelului iese din ecran și nu se mai vede ce coloană se citește. Listele lungi sunt exact cele care au nevoie: `/admin/customers` (21 rânduri), `/admin/audit` (27 rânduri), `/admin/tickets` (14). |
| **Comportament așteptat** | Antetul tabelului rămâne vizibil în timpul derulării, într-o listă cu peste 10 rânduri. |
| **Măsurătoare** | `getComputedStyle(thead).position = static` și `getComputedStyle(th).position = static` în **60 din 60** de măsurători de tabel (10 rute × 6 lățimi). Niciun element `position: sticky` în interiorul vreunui `table`. Antelele **orizontale** ale paginilor (`header.sticky.top-0.z-20`) și bara laterală (`aside.sticky.top-0`) sunt, în schimb, lipicioase — deci mecanismul există și e folosit, doar nu în tabele. |
| **Cauză** | `web/src/ui-app.tsx:1145-1153` — `<thead>` nu primește nicio clasă de poziție. Lipsește `sticky top-0` pe `thead th`, cu un `z-index` sub antetul paginii (care e `z-20`) și o fundal opac (tokenul `--s1`) ca să nu transpară. |
| **Remediere propusă** | `thead` cu `sticky top-[<înălțimea antetului paginii>] z-10` și `th` cu `bg-s1` (fundalul panoului) + `shadow-[0_1px_0_var(--color-line)]` pe linia de jos. |
| **Criteriu de verificare** | La `/admin/customers` și `/admin/audit`, antetul rămâne vizibil după ce pagina a fost derulată sub jumătate. |

---

#### UX-P1-07 — Cele 21 de casete de permisiuni au ținta de 16 × 16 px

| | |
|---|---|
| **Rută** | `/admin/staff` |
| **Lățime** | toate |
| **Severitate** | **Medium** |
| **Comportament observat** | Toate cele **21** de casete de permisiuni au o țintă de **16 × 16 px**. Sunt etichetate corect (`customers.read` etc.), dar ținta e sub minimul de 24 × 24 px cerut de WCAG 2.5.8, iar distanța dintre ele nu e suficientă pentru a compensa. |
| **Comportament așteptat** | țintă de cel puțin 24 × 24 px (sau un `padding` care ridică suprafața clicabilă la 24 px, păstrând pătratul vizual mic). |
| **Măsurătoare** | `/admin/staff`: `checkboxes = 21`, `smallCheckboxes = 21` (adică **100%**), `checkboxSize = "16x16"`. Detectat și la toate celelalte 5 lățimi ale aceleiași rute. |
| **Cauză** | `web/src/admin/Staff.tsx` — casetele de permisiuni folosesc o clasă de dimensiune fixă `16x16`; nu există un `padding` suplimentar și nu există o etichetă cu suprafață de atingere mărită. |
| **Remediere propusă** | O clasă: `h-4 w-4` → `h-4 w-4` vizual, dar înfășurată într-un `label` cu `inline-flex h-6 w-6 items-center justify-center` (sau `p-2 -m-2`), care ridică ținta reală la 32 × 32 px fără să schimbe desenul. |
| **Criteriu de verificare** | Toate cele 21 de ținte au `width ≥ 24` și `height ≥ 24`. |
| **Captură** | `/tmp/uxaudit-shots/07-admin-staff-375.png` |

---

#### UX-P1-08 — Pagina de pornire cere catalogul de șase ori la o încărcare; cache-ul existent este ocolit

| | |
|---|---|
| **Rută** | `/` |
| **Lățime** | toate (măsurătoare la 1440) |
| **Severitate** | **Medium** |
| **Comportament observat** | O încărcare a paginii de pornire emite **6 cereri identice** `GET /api/catalog/products`, plus 2 `POST /api/catalog/quote`. Cache-ul de 60 de secunde existent în cod este folosit doar de unele componente; celelalte five îl ocolesc și cer catalogul direct. |
| **Comportament așteptat** | O cerere de catalog pe încărcare, indiferent de câte componente au nevoie de el. |
| **Măsurătoare** | La `/`: 21 cereri totale, 9 către API → `1× GET /api/auth/session`, **`6× GET /api/catalog/products`**, `2× POST /api/catalog/quote`. Pentru comparație: `/apps` face **2×**, iar `/app` face **1×**. Transfer total: 488 KB la `/`, cu 1 043 noduri DOM. |
| **Cauză** | Cache-ul: `web/src/lib/pricing.ts:31-53` (`cached`, `pending`, TTL 60 s) — folosit de `useCatalogSummary`/`useCatalogProducts`. Ocoliți de: `web/src/home/Catalog.tsx:54`, `web/src/home/Studio.tsx:57`, `web/src/home/Story.tsx:126`, `web/src/home/Ticker.tsx:24`, `web/src/home/Configurator.tsx:33` — toate apelează `get('/catalog/products')` direct. |
| **Remediere propusă** | Toate cele șase componente să consume `useCatalogProducts` din `lib/pricing.ts`. O singură cerere, fără schimbare de comportament vizibil. |
| **Criteriu de verificare** | O încărcare a paginii de pornire emite exact **1** cerere `GET /api/catalog/products`. |
| **Notă de revalidare** | `UX-06` a fost marcată „FIXED & VERIFIED" în `PREVIOUS-FINDINGS-REVALIDATION.md` §4.8, pe baza mecanismului de cache din `lib/pricing.ts`. **Măsurătoarea de rețea arată că remedierea nu acoperă pagina de pornire.** |

---

### 4.2 Defecte specifice unei rute

---

#### UX-P1-09 — `/apps` nu are niciun element `<h1>`

| | |
|---|---|
| **Rută** | `/apps` |
| **Lățime** | toate |
| **Severitate** | **Low** |
| **Comportament observat** | Pagina nu are niciun `h1`. Titlul vizual („Explore the catalog.") este un `h2`. |
| **Comportament așteptat** | Exact un `h1` pe pagină, care să fie titlul vizual principal. |
| **Măsurătoare** | `h1: []`, `h2: ["Explore\nthe catalog."]`, `main: 1`. Celelalte 31 de rute au câte un `h1`. |
| **Cauză** | `web/src/app/ProductPage.tsx` — secțiunea de catalog folosește `h2` pentru titlul principal. |
| **Remediere propusă** | `h2` → `h1` pe titlul paginii (vizual identic: se păstrează clasele de stil). |
| **Criteriu de verificare** | `/apps` are exact un `h1`, cu textul „Explore the catalog." |
| **Captură** | `/tmp/uxaudit-shots/17-apps-1440.png` |

---

#### UX-P1-10 — Pagina de instanță are 12 taburi

| | |
|---|---|
| **Rută** | `/app/instances/:id` |
| **Lățime** | toate |
| **Severitate** | **Low** |
| **Comportament observat** | Bara de taburi a instanței conține **12** elemente cu `role="tab"`: Overview, Console, Files, Databases, Backups, Network, Startup, Schedules, Settings, Activity, Resources, Domains. |
| **Comportament așteptat** | Un grup de 4–7 taburi, cu restul în grupuri secundare. |
| **Măsurătoare** | `[role="tab"]` → 12 elemente; `role="tablist"` conține toate cele 12 într-un singur șir. |
| **Cauză** | `web/src/app/instance/OverviewTab.tsx` și taburile surori — fiecare definește câte un `role="tab"` în același `tablist`. |
| **Remediere propusă** | Grupare: „Manage" (Console, Files, Databases, Backups), „Configure" (Network, Startup, Schedules, Resources) și „Details" (Activity, Settings, Domains), cu 3–4 taburi pe nivel. |
| **Criteriu de verificare** | Cel mult 7 taburi la primul nivel. |
| **Notă** | Reverificare a constatării anterioare `UX-12` („instanța are 12 taburi"), care era „NOT VERIFIED". **Numărul de 12 se confirmă.** |

---

#### UX-P1-11 — Selectorul de CPU nu afișează unitatea, selectorul de memorie o afișează

| | |
|---|---|
| **Rută** | `/app/deploy/:slug` |
| **Lățime** | toate |
| **Severitate** | **Low** |
| **Comportament observat** | Butoanele de memorie sunt „512 MB", „1 GB", „2 GB", „4 GB", „8 GB"; cele de CPU sunt „1", „2", „4", fără unitate. Unitatea „vCPU" apare doar ca sufix mic lângă eticheta „CPU" a grupei. |
| **Comportament așteptat** | Aceeași regulă în ambele controluri: unitatea pe fiecare opțiune, sau unitatea în eticheta grupului. |
| **Măsurătoare** | Butoane măsurate: `["512 MB","1 GB","2 GB","4 GB","8 GB"]` pentru memorie; `["1","2","4"]` pentru CPU. |
| **Cauză** | `web/src/app/Deploy.tsx` — grupul CPU folosește etichete brute, fără `memLabel`-ul echivalent (`memLabel` există deja în `web/src/lib/pricing.ts` pentru memorie). |
| **Remediere propusă** | Aplicați `vCPU` fiecărei opțiuni CPU, ca `memLabel` o face pentru memorie. |
| **Criteriu de verificare** | Toate opțiunile CPU afișează „vCPU". |
| **Captură** | `/tmp/uxaudit-shots/11-deploy-375.png` |

---

#### UX-P1-12 — Câmpurile de nume din Setări sunt de 529 px pentru o valoare de 5 caractere

| | |
|---|---|
| **Rută** | `/app/settings` |
| **Lățime** | ≥ 768 (la 320/375 câmpurile sunt full-width, deci problema dispare) |
| **Severitate** | **Low** |
| **Comportament observat** | Câmpul „Last name" (valoarea „Check") are **529 px** lățime; „First name" (valoarea „QA") ~**837 px**. Butonul „Save the name" este aliniat la marginea dreaptă a câmpului (ambele la `x = 1386`), deci alinierea e corectă — problema este doar disproportionarea câmpului față de date. |
| **Comportament așteptat** | Câmpurile unui nume să aibă o lățime potrivită cu datele, cu restul rândului folosit pentru alte informații. |
| **Măsurătoare** | `lastName: {x: 857, right: 1386, width: 529}`, valoare „Check" (5 caractere). `saveButton: {x: 1242, right: 1386}` — marginea dreaptă coincide cu cea a câmpului (aliniere corectă). |
| **Cauză** | `web/src/app/Settings.tsx` — grila formularului distribuie egal lățimea între două câmpuri, pe un container de 1 110 px. |
| **Remediere propusă** | `max-w-[280px]` pe câmpurile de nume (sau o grilă `sm:grid-cols-[260px_260px_1fr]`), ca restul rândului să poată găzdui informații utile. |
| **Criteriu de verificare** | Câmpul „Last name" ≤ 300 px la 1440. |
| **Captură** | `/tmp/uxaudit-shots/09-settings-sessions-1440.png` |

---

#### UX-P1-13 — Titlul paginii și butonul principal sunt același cuvânt: „Deploy"

| | |
|---|---|
| **Rută** | `/app/deploy/:slug` |
| **Lățime** | toate |
| **Severitate** | **Low** |
| **Comportament observat** | În antetul paginii apar, alături, titlul „Deploy" (`h1`) și butonul verde „Deploy". Două elemente cu același text, cu roluri diferite, pe aceeași linie. |
| **Comportament așteptat** | Titlul să fie diferit de eticheta acțiunii (de exemplu „Configure" / „Deploy"), ca cititorul să le distingă. |
| **Măsurătoare** | `h1 = "Deploy"`; butoane în `header` = `["Deploy"]`; în restul paginii `["Deploy","Deploy","Review order","Review order"]` (două perechi — una dintre ele e în blocul răspuns la telefon). |
| **Cauză** | `web/src/app/Deploy.tsx` — titlul paginii vine din numele rutei; butonul principal repetă același cuvânt. |
| **Remediere propusă** | Titlul paginii: „Configure" (pasul 1 din 4) sau „New deployment"; butonul rămâne „Deploy". |
| **Criteriu de verificare** | Titlul și eticheta butonului diferă pe `/app/deploy/:slug`. |
| **Captură** | `/tmp/uxaudit-shots/11-deploy-375.png` |

---

#### UX-P1-14 — Lista de sesiuni afișează adresa brută, fără nicio marcă despre tipul ei

| | |
|---|---|
| **Rută** | `/app/settings` |
| **Lățime** | toate |
| **Severitate** | **Low** |
| **Comportament observat** | Adresa afișată este cea brută din baza de date. În stiva de test, sesiunile create prin browser arată `127.0.0.1` — o adresă de loopback, prezentată lângă adrese publice, fără nicio distincție. Clientul nu poate judeca dacă e adresa lui reală sau o adresă internă a platformei. |
| **Comportament așteptat** | Adresa să fie etichetată: „adresă internă", „adresă privată", „adresă publică" — și să nu fie prezentată ca locație. |
| **Măsurătoare** | Randări măsurate: `127.0.0.1 · signed in on 24 Oct 2026, 00:32 · active just now`, `198.51.100.24 · signed in on 22 Oct 2026, 00:19 · active 1 hour ago`, `203.0.113.7 · signed in on 20 Oct 2026, 00:19 · active 2 hours ago` — trei tipuri de adresă, nicio marcă. |
| **Cauză** | `web/src/lib/api.ts:202-205` — `const address = session.ip ?? 'Unknown address'`; `api/src/routes/settings.ts:100-122` (`serializeSession`) trimite `ip` brut, fără clasificare. |
| **Remediere propusă** | Adăugați `ipKind: 'public' | 'private' | 'loopback' | 'unknown'` în `serializeSession` și afișați eticheta în UI. Nu se afișează nicio localizare, pentru că nu există o sursă legitimă de geo-IP. |
| **Criteriu de verificare** | O adresă privată sau de loopback e marcată explicit și nu poate fi confundată cu adresa clientului. |
| **Notă** | Complement vizual al constatării `SESS-P1-11` din `SESSIONS-INVESTIGATION.md`; acolo e tratată latura API, aici latura de afișare. |

---

## 5. Preferințe estetice, nu defecte

**Această secțiune nu conține severități și nu conține remediări.** Sunt observații de aspect, măsurate, care **nu** încalcă niciun criteriu de funcționalitate, accesibilitate sau compatibilitate. Sunt enumerate pentru a fi luate în calcul de echipa de design, nu pentru a fi tratate ca blocaje.

| # | Observație | Măsurătoare |
|---|---|---|
| P-1 | Pagina de pornire este foarte lungă: 7 secțiuni, **10 883 px** la 1440 și **12 635 px** la 375 — aproximativ 12 ecrane la desktop și 14 pe telefon. Secțiunea „From pick to online in three moves" măsoară singură **2 785 px** (2 748 px la 375). | `section` heights la 1440: 1 573 / 2 785 / 1 670 / 1 051 / 1 608 / 1 136 / 669 px; la 375: 1 441 / 2 748 / 2 293 / 1 360 / 2 577 / 1 424 / 391 px. Măsurătoare făcută după ce catalogul s-a încărcat complet |
| P-2 | Adâncimea de îmbinare a suprafețelor ajunge la **5 niveluri** pe pagina de pornire (bg → s1 → s2 → s3 → accent) și 4 în restul aplicației; 322 de containere rotunjite pe pagina de pornire, 172 pe `/admin/customers`. | `maxSurfaceDepth`, număr de elemente cu `rounded-*` |
| P-3 | Pagina de pornire are **66** de elemente interactive la 1440, cu „Explore apps" repetat de **3** ori (la y = 228, 529 și 10 523 — adică în hero, la mijloc și în subsol) și „Deploy" de **3** ori, pe trei carduri de produs (toate la y = 5 256). | numărare pe DOM la 1440, după încărcarea completă |
| P-4 | Zona de client afișează acțiunea „Deploy" de **două** ori pe `/app` (butonul din antet și „Add a service" din al patrulea card KPI). Pe `/app/deploy` eticheta „Deploy" apare de **6** ori. | `cta.repeated` |
| P-5 | Butonul „Save price" se repetă de **5** ori pe `/admin/pricing`, „Reset" de 5 ori, „Save the egg" de 5 ori pe `/admin/products`, „Retry provisioning" de 6 ori pe `/admin/services`, „Refund" de 4 ori pe `/admin/orders`, „Close session" de 12 ori pe `/app/settings`. | `cta.repeated` la 1440 |
| P-6 | Panoul „Recent activity" din `/app` rămâne un bloc gol de **410 × 160 px** pentru textul „No activity yet." | captură `/tmp/uxaudit-shots/16-app-1440.png` |
| P-7 | Valoarea implicită a câmpului „Instance name" este **slug-ul produsului** („wordpress"), nu un nume prietenos. | valoarea inputului măsurată |
| P-8 | Tipografia de afișaj este consecventă: `h1` = 19 px la ≤ 375 px și 22 px la ≥ 768 px, `root font-size` = 16 px la toate lățimile. **Nu există** salt de tipografie între 375 și 768 px. | `getComputedStyle` pe h1 și pe `html` la 6 lățimi |

**Observații de tipografie, marcate separat deoarece sunt o alegere, nu o încălcare:** `h1`-ul paginii de pornire măsoară **176 px** la 1440 și **137 px** la 1024 (scară proporțională cu lățimea) și **60 px** la 320/375. E un efect de afișaj, nu o eroare; dacă echipa îl consideră prea agresiv, e o decizie de design.

---

## 6. Statut în gol, încărcare, eroare, populat

Metodă: `uxaudit-states.mjs` — API-ul de date este întârziat cu 6 s (starea de încărcare), respectiv întoarce 500 (starea de eroare), pe 14 rute (7 client + 7 admin). Cererea `/api/auth/session` nu e interceptată, pentru ca verificarea sesiunii să treacă și starea proprie a vederii să fie atinsă.

| Rută | Gol | Încărcare | Eroare | Populat |
|---|---|---|---|---|
| `/app` | — | ✅ „Loading your dashboard", `role="status"`, `aria-busy` | ✅ „We could not load your dashboard" + **Retry** | ✅ 2 servicii |
| `/app/instances` | — | ✅ `aria-busy`, bloc cu schelet | ✅ + **Retry** | ✅ 2 rânduri |
| `/app/domains` | ✅ lista de domenii goală, formularul de adăugare prezent | ✅ `aria-busy` | ✅ + **Retry** | ✅ formular + selector de instanță |
| `/app/billing` | ✅ „No payment method on file. Add one…" | ✅ „Loading your billing summary" | ✅ „Could not load your billing summary" + **Retry** | ✅ |
| `/app/tickets` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 3 bilete |
| `/app/settings` | — | ✅ „Loading your account" | ✅ „Your account could not be loaded" + **Retry** | ✅ 13 sesiuni |
| `/app/deploy/wordpress` | — | ✅ „Loading the product" | ✅ „Could not load this product" + **Retry** | ✅ |
| `/admin` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ |
| `/admin/customers` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 21 clienți |
| `/admin/orders` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 8 comenzi |
| `/admin/services` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 6 servicii |
| `/admin/tickets` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 14 bilete |
| `/admin/audit` | — | ✅ `aria-busy` | ✅ + **Retry** | ✅ 27 intrări |
| `/admin/settings` | ✅ „No settings stored. Add one to configure the platform." | ✅ `aria-busy` | ✅ + **Retry** | ✅ |

**Verdict: cele patru stări există și sunt distincte.** Nu s-a găsit nicio vedere în care una dintre stări să lipsească sau să fie confundabilă cu alta.

Detalii de calitate, măsurate:

- **Starea de încărcare** folosește `LoadingBlock` (`web/src/ui-app.tsx:474-486`): `role="status"`, `aria-live="polite"`, `aria-busy="true"` și o etichetă `sr-only` specifică („Loading your dashboard", „Loading the billing summary"…). Scheletul e o bară statică `bg-s3` (`Skeleton`, `ui-app.tsx:470-472`), **fără animație** — deci e distinct de starea golă prin formă, nu doar prin culoare.
- **Starea de eroare** are mesaj + buton **Retry** pe toate cele 14 rute. Mesajele sunt concrete: „We could not load your dashboard", „Your account could not be loaded", „Could not load this product".
- **Starea goală** există pe `/admin/settings` („No settings stored."), `/app/billing` („No payment method on file.") și în listele goale.
- **Observație de rigoare, ne-defect:** pe rutele de admin, când API-ul eșuează, contorul de lângă titlu afișează „0 customers", „0 orders", „0 tickets", în timp ce textul de eroare e prezent. Numărul „0" e corect ca valoare a listei (nicio dată n-a venit), dar poate fi citit ca „nu avem clienți". **Low-Info**, remediere opțională: ascunderea contorului când lista e în eroare.

---

## 7. Accesibilitate

### 7.1 Focus și navigare cu tastatura

| Verificare | Rezultat | Măsurătoare |
|---|---|---|
| Indicator de focus vizibil | ✅ **0** eșecuri | 54 de parcurgeri cu `Tab` (27 rute × 375 px și 1440 px), **1 204 opriri** în total; fiecare oprire verifică `outline`, `box-shadow` și `--tw-ring-shadow` |
| Focusul adus în ecran de browser | ✅ **0** eșecuri | Re-testat cu pauză de 260 ms după `Tab`, pentru a permite finalizarea derulării suave (`html { scroll-behavior: smooth }`): `/admin/orders`, `/admin/products`, `/app/deploy/wordpress` la 375 px → 0 opriri în afara ecranului |
| Nume accesibil al controalelor | ✅ | 0 butoane fără nume, 0 câmpuri fără etichetă (la 1440 px); numele sunt verificate pe celulă, pe descendenți și pe `label[for]` |
| Ordinea focusului | ✅ | Ordinea de citire a meniului lateral → conținut → acțiuni se păstrează; bară fixă inferioară pe telefon e ultimul grup |
| `Escape` închide dialogurile | ⚠️ parțial | Componenta `ConfirmDialog` (`web/src/ui-app.tsx:983-1040`) implementează corect `Escape` + blocarea focusului. Dar dialogul folosit pe `/app/settings` **nu este un dialog**: confirmarea „Close all other sessions" e **inline** (`web/src/app/Settings.tsx:511-530`) — butonul e înlocuit cu „Cancel" + „Close the other sessions". La apăsare, butonul apăsat este scos din DOM, deci **focusul e pierdut** (devine `body`) și nu se mută pe „Cancel"; un utilizator de tastatură trebuie să reia navigarea de la început. **Low**, remediere: `ref` pe butonul de confirmare + `focus()` pe „Cancel" la deschidere. |

### 7.2 Contrast

Rezultatul complet este în **UX-P1-01**. Suplimentar:

- Tokenurile principale respectă pragul: `--ink` 13.78–18.20:1, `--ink2` 5.03–8.05:1, `--acc` 7.83–12.55:1, `--bad` 4.46–7.28:1, `--warn` 6.56–10.70:1.
- **Singurul token care eșuează este `--ink-3`** (`#7b827b`) — 4.31:1 pe `--s2`, 3.80:1 pe `--s3`, 3.92:1 pe `--acc-bg`.
- **Nu s-a găsit niciun eșec pe text mare**: toate cele 2 334 eșecuri sunt pe text de mărime normală (11 px – 22 px).
- **Nu s-a găsit niciun eșec pe butonul de acțiune**: `--on-acc` pe `--acc` dă 10.76:1; textul alb pe `--bad` **nu** apare în măsurători (constatarea `UX-10` anterioară nu se reproduce pe stiva curentă — dialogul de confirmare periculos folosește `text-bad` pe `bg-bad/10`, nu alb pe `bg-bad`).
- **Focusul pe `--acc` (`#6be598`)** e vizibil pe toate suprafețele întunecate (9.50:1 pe `--s3`).

### 7.3 Semantică și structură

| Verificare | Rezultat |
|---|---|
| Exact un `<h1>` pe pagină | ✅ pe 31 de 32 de rute; ❌ pe `/apps` (vezi UX-P1-09) |
| Exactly un `<main>` | ✅ pe toate rutele |
| `nav` / `header` / `footer` | ✅ prezente pe toate rutele |
| `alt` pe imagini | ✅ 0 imagini fără `alt` |
| Etichete pe câmpuri | ✅ 0 câmpuri fără etichetă (la 1440 px) |
| Tinte de atingere | ❌ 21 de ținte de 16 × 16 px pe `/admin/staff` (UX-P1-07) |
| `role="status"` / `aria-live` pe stările asincrone | ✅ `LoadingBlock` și `LiveRegion` (`web/src/admin/Overview.tsx:205-206`) |
| `aria-pressed` pe filtre | ✅ (`Segmented`, `Preset` în deploy) |
| `scope="col"` pe antetele tabelului | ✅ (`web/src/ui-app.tsx:1148`) |
| `prefers-reduced-motion` | ✅ **0** animații active sub `reduce` (pagină de pornire: 14 → 0). Rămân 156 de tranziții, toate de culoare/opacitate, nu de deplasare |

### 7.4 Mișcare și performanță

- **Animații active** pe pagina de pornire: 14 (normal) → **0** (`reduce`). Pe `/app` și `/app/instances`: 0 în ambele regimuri. Reverifică și închide `UX-19` (anterior „NOT VERIFIED").
- **Cereri pe încărcare**: vezi UX-P1-08. Costul total al paginii de pornire: 488 KB transfer, 1 043 noduri DOM, `DOMContentLoaded` la 255 ms, `load` la 255 ms (pe stiva locală, fără rețea lentă).
- **Interacțiune**: tranzițiile de stare sunt de 180 ms (`transition-colors duration-[180ms]`) — sub pragul de 300 ms recomandat pentru răspuns la interacțiune.

---

## 8. Ce nu am putut verifica (și de ce)

1. **Firefox și WebKit — NU au putut fi testate.** Nu sunt instalate pe această mașină (`/usr/bin/chromium` este singurul browser disponibil; `playwright-core` nu are binare Firefox/WebKit în `PLAYWRIGHT_PATH`). Nicio măsurătoare din acest raport nu acoperă aceste două motoare. **Consecințe concrete, neacoperite:** comportamentul lui `position: sticky` în interiorul unui tabel (UX-P1-06 depinde de el); `scroll-behavior: smooth` și fereastra de focus (UX-P1-04); aspectul și valoarea implicită a controlului `input[type=range]` folosit pentru stocare în configuratorul de deploy; `:focus-visible` în Safari; `text-wrap`/`line-clamp` pe care le folosește interfața.
2. **Edge-ul public (Cloudflare/Caddy), TLS, HTTP/2–3, cache-ul de la margine, Lighthouse/Core Web Vitals pe rețea reală.** Nu s-a vizitat niciun URL public sau de margine, conform regulii de mediu. Toate măsurătorile de performanță sunt pe loopback.
3. **Safari/iOS (WebKit) și dispozitive tactile reale.** Comportamentul hover-ului (atributul `title`) — singura cale de recuperare a valorilor tăiate de la UX-P1-03 — **nu poate fi exercitat pe telefon**. De aceea acea constatare este separată de UX-P1-03 (unde valoarea nu e recuperabilă nici la hover) și de UX-P1-02 (unde există `title`).
4. **Panoul Pterodactyl.** Nu s-a atins panoul. Prin urmare: adresa publică a unei instanțe, consola, fișierele, backup-urile și programările nu au putut fi verificate vizual. Ecranul arată „No public URL yet" pentru instanțele din stivă — în stiva de test e corect (nu există server provisionat în panou), deci **nu** e raportat ca defect. `UX-02` rămâne în afara acestei faze.
5. **Fluxul de plată complet.** Plățile sunt oprite (`STRIPE_TEST_MODE`), deci pașii de checkout și de plată nu au putut fi parcurși vizual. Am putut verifica cota (`POST /api/catalog/quote`) și coerența ei cu prețul afișat (vezi §9), nu și pagina de plată.
6. **Starea golă a zonelor cu date populate.** Fixtures-ul acoperă cu date zonele de client și de admin; stările goale au fost verificate pe `/admin/settings` și `/app/billing`, nu pe toate cele 32 de rute.
7. **Comportamentul cu conținut extrem de lung în interiorul unui rând de tabel** (de exemplu 5 000 de caractere). Fixtures-ul are un subiect de 137 de caractere — suficient pentru a trunchia, dar nu pentru o cădere de layout în limite.
8. **Multi-limbă / RTL.** Interfața este în engleză; nu s-a testat nicio limbă RTL sau cu text bidirecțional.
9. **Navigarea cu mouse prin toate elementele.** Focusul a fost parcurs exhaustiv cu `Tab`, dar acțiunile de *drag* (sliderul de stocare) și meniurile contextuale nu au fost exercițate.
10. **Concurența reală în browserul de audit.** Alți auditori lucrau simultan pe aceeași mașină; măsurătorile s-au făcut pe stiva proprie (`uxaudit_test`, porturile 3105/30005) pentru a nu interfera cu ei. Interferențe posibile: consumul de CPU al VM poate fi mai mare decât în mod normal, ceea ce afectează măsurătorile de timp, dar nu pe cele de geometrie.

---

## 9. Constatările care blochează un GO comercial

În ordinea impactului asupra conversiei și a încrederii în produs. **Nu există P0**: nu s-a găsit pierdere de date, blocaj de flux obligatoriu sau problemă de securitate în dimensiunea vizuală și de UX.

| # | ID | De ce blochează |
|---|---|---|
| 1 | **UX-P1-01** | Contrastul sub prag pe **2 334** de elemente de text, pe 21 de rute. Este o singură linie de CSS și e remediabil în același sprint ca orice altă constatare. Nu se poate lansa un produs B2B cu text secundar ilizibil pe 40% dintre suprafețe. |
| 2 | **UX-P1-02** | Coada de suport din zona de admin este cea mai strâmtă zonă a produsului, pe ecranele cele mai mari: subiecte tăiate la 144 px, coloana „Assigned" invizibilă, 700 px nefolosiți. Suportul lucrează în coadă toată ziua. |
| 3 | **UX-P1-03** | 80 de celule cu valoare **irecuperabilă** (actor, țintă, client). În jurnal și în lista de servicii, personalul nu poate citi la cine se referă o înregistrare. Încalcă și contractul intern al design system-ului. |
| 4 | **UX-P1-04** | Două rânduri de sesiune identice la caracter: clientul nu poate decide pe care să închidă, iar închiderea greșită lasă o sesiune deschisă. Afectează direct încrederea în siguranța contului. |
| 5 | **UX-P1-05** | Numele de instanță scris de client se pierde la reîncărcare. E un flux de 4 pași în care clientul și-a ales un nume și l-a pierdut — defect de încredere, nu de estetică. |
| 6 | **UX-P1-06** | Lipsa antetului lipicios în toate cele 10 tabele. În listele de 21 și 27 de rânduri, coloana citită se pierde după primele 10 rânduri. |
| 7 | **UX-P1-07** | 21 de ținte de 16 × 16 px în ecranul de permisiuni. Se poate remedia într-o singură clasă. |
| 8 | **UX-P1-08** | 6 cereri identice de catalog la fiecare încărcare a paginii de pornire. Remedierea `UX-06` acoperă doar un subset de componente — la lansare, fiecare vizitator plătește 5 cereri redundante. |
| 9 | **UX-P1-09 … UX-P1-14** | Defecte mici, fiecare cu un remediu de câteva minute. Nu blochează GO-ul, dar intră în același sprint, fiindcă sunt ieftine și vizibile. |

### 9.1 Ce **nu** blochează (verificări pozitive, măsurate)

- Zero depășiri orizontale în 192 de perechi rută × lățime.
- Zero decalaje antet ↔ corp în 60 de tabele, cu date populate — **remedierea UX-01 ține**.
- Indicator de focus vizibil la **zero** eșecuri; zero controale fără nume accesibil.
- Zero animații sub `prefers-reduced-motion`.
- Cele patru stări (gol, încărcare, eroare, populat) există și sunt distincte pe toate cele 14 rute verificate.
- Prețul afișat în configuratorul de deploy este **exact** prețul cotat de server: pagina arată **€2.39**, `POST /api/catalog/quote` pentru exact aceeași configurație (`ram=2048, cpu=1, disk=5`) întoarce `total: 239` EUR. Coerența prețului e **corectă**.
- Configurația de resurse a deployului supraviețuiește reîncărcării, butonului „înapoi" și linkului direct — adresa rămâne `?ram=2048&cpu=1&disk=5` în toate cele trei cazuri.
- Tabelul de suport din **zona de client** (`/app/tickets`) este corect: 1 070 px la 1440, decalaj 0 px, valorile tăiate au `title`.

### 9.2 Recomandare

Niciuna dintre cele 8 constatări blocante nu necesită redesign. Doi dintre ele (UX-P1-01, UX-P1-07) sunt corecții de **o linie de CSS**, unul (UX-P1-08) este un **import în plus**, iar UX-P1-02, UX-P1-03, UX-P1-04 și UX-P1-05 sunt schimbări structurale mici, localizate, în fișiere deja cunoscute. Pragul realist pentru un GO comercial este: **UX-P1-01, UX-P1-02, UX-P1-03, UX-P1-04, UX-P1-05, UX-P1-06, UX-P1-07, UX-P1-08 închise și reverificate cu același harness.**

---

## Anexă A — Capturi de ecran

Toate capturile sunt pe VM, în `/tmp/uxaudit-shots/` (copii de lucru în `/tmp/uxshots/`). **Niciun binar nu a intrat în repository.**

| Fișier | Ce arată |
|---|---|
| `/tmp/uxaudit-shots/01-admin-tickets-1440.png` | Coada de suport înghesuită în 360 px, subiecte tăiate, jumătate din ecran goală (UX-P1-02) |
| `/tmp/uxaudit-shots/02-admin-tickets-1440-full.png` | Aceeași pagină, integral |
| `/tmp/uxaudit-shots/03-admin-tickets-375.png` | Aceeași coadă pe telefon (lista de carduri) |
| `/tmp/uxaudit-shots/04-admin-customers-320.png` | Lista de clienți pe telefon, 21 de carduri (UX-P1-03, validare) |
| `/tmp/uxaudit-shots/05-admin-customers-1440.png` | Lista de clienți la 1440 px |
| `/tmp/uxaudit-shots/06-admin-audit-1440.png` | Coloanele „Actor" și „Target" trunchiate fără `title` (UX-P1-03) |
| `/tmp/uxaudit-shots/07-admin-staff-375.png` | Cele 21 de casete de permisiuni de 16 × 16 px (UX-P1-07) |
| `/tmp/uxaudit-shots/08-admin-pricing-1440.png` | „Save price" repetat de 5 ori (P-5) |
| `/tmp/uxaudit-shots/09-settings-sessions-1440.png` | Lista de sesiuni cu rânduri identice; câmpuri de nume de 529 px (UX-P1-04, UX-P1-12) |
| `/tmp/uxaudit-shots/10-app-375.png` | Panoul clientului pe telefon, cu bara fixă inferioară |
| `/tmp/uxaudit-shots/11-deploy-375.png` | Configuratorul pe telefon: titlu și buton cu același cuvânt, CPU fără unitate (UX-P1-11, UX-P1-13) |
| `/tmp/uxaudit-shots/12-deploy-1440.png` | Configuratorul la 1440 px |
| `/tmp/uxaudit-shots/13-app-tickets-1440.png` | Tabelul de suport din zona de client — corect, 1 070 px |
| `/tmp/uxaudit-shots/14-home-1440.png` | Pagina de pornire la 1440 px |
| `/tmp/uxaudit-shots/15-home-375-full.png` | Pagina de pornire integrală pe telefon (12 635 px) |
| `/tmp/uxaudit-shots/16-app-1440.png` | Panoul clientului la 1440 px |
| `/tmp/uxaudit-shots/17-apps-1440.png` | `/apps` — titlu în `h2`, fără `h1` (UX-P1-09) |
| `/tmp/uxaudit-shots/18-admin-infrastructure-1440.png` | Infrastructura: noduri și ouă, confirmarea că nu există concept de regiune |

## Anexă B — Date brute

| Fișier | Conținut |
|---|---|
| `audit/post-remediation/_raw/phase7-uxaudit-sweep.json` | 192 de intrări, cu măsurătorile complete (deplasare, tabele, ținte, contrast, tipografie, densitate, CTA, stări) |
| `audit/post-remediation/_raw/phase7-uxaudit-focus.json` | 54 de parcurgeri de focus, cu opririle și indicatorii |
| `audit/post-remediation/_raw/phase7-uxaudit-states.json` | 14 rute × 4 stări, cu textul redat |
| `audit/post-remediation/_raw/phase7-uxaudit-deploy.json`, `…-deploy2.json` | Configuratorul de deploy, pas cu pas (inclusiv comparația cu cota serverului) |

Copii de lucru ale datelor brute au fost păstrate și în `/tmp/` pe mașina de audit, alături de cele 18 capturi.
