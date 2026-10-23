# Inventar funcțional — Blipmade

**Stare:** audit independent, efectuat pe ramura `audit/post-remediation`.
**Data efectuării:** 23 octombrie 2026, între orele 23:15 și 00:20 (UTC-4 / ora mașinii de audit).
**Autor:** agent de audit (rol `Worker`), fără modificări asupra codului sursă.

---

## 1. Antet

### 1.1 Ce a fost inventariat

Tot ce poate fi numit „funcție" a platformei Blipmade, identificat din cod și apoi confirmat prin
execuție pe stiva izolată:

| Domeniu | Volum inventariat |
|---|---|
| Rute front-end | 35 rute în `web/src/routes.tsx` (+ redirecționări și stări de eroare) |
| Componente de pagină | 30 fișiere în `web/src/pages`, `web/src/app`, `web/src/admin`, `web/src/home` |
| Endpoint-uri back-end | **151** rute HTTP în `api/src/routes/` (11 fișiere) |
| Modele și enum-uri Prisma | 30 modele, 16 enum-uri în `api/prisma/schema.prisma` |
| Permisiuni | 21 permisiuni în `api/src/lib/permissions.ts` |
| Cozi, worker și joburi programate | 2 cozi BullMQ, 5 timer-e în `api/src/worker.ts` |
| Integrări | Pterodactyl (panel + bridge + credentiale), SMTP/Resend, Stripe (+ poartă locală), DNS (TXT + gateway Caddy), scripturi de backup |

### 1.2 Unde

- **Codul citit:** `/root/blipmade-work` (copie locală, fără git — nu s-a rulat nicio comandă git).
- **Stiva izolată exercitată:** pe VM `debian@10.77.0.13` (`ssh -i /root/.ssh/blipmade_vm103`):
  - API: `http://127.0.0.1:3101`
  - Aplicație web: `http://127.0.0.1:30003`
  - Bază de date: `blipmade_test` (confirmat prin `DATABASE_URL` și `TEST_DATABASE_URL` ale procesului API)
  - Redis: `redis://localhost:6379` (**același Redis ca stiva de producție** — vezi §7)

### 1.3 Când

23.10.2026, 23:15–00:20 (est. locală). Toate măsurătorile din raport sunt din această fereastră;
`/tmp/bm-fn/` de pe VM păstrează scriptele și rapoartele brute.

### 1.4 Instrumente

- Lectură de cod: `read`, `grep`, `glob`, `bash` (doar citire; nicio scriere în cod).
- Enumerare programatică a rutelor: script Python (`re` pe `app.<verb>(`) → 151 rânduri în
  `/tmp/bm-fn/be-routes.tsv`.
- Enumerare a apelurilor din front-end: script Python pe literalele de șir → `/tmp/bm-fn/fe-all.txt`,
  apoi diferență set pe segment normalizat → lista endpoint-urilor fără apelant.
- Execuție API: `python3` + `requests` pe VM → `/tmp/bm-fn/ex2.py`, `ex3.py`, `ex4.py`, cu ieșire în
  `exercise.json`, `ex3.json`, `ex4.json`.
- Browser: `playwright-core` (`/opt/blipmade/tools/browser/node_modules/playwright-core/index.js`)
  + Chromium `/usr/bin/chromium`, rulat prin `xvfb-run -a node <script>.mjs`.
  Scripturi: `login.mjs`, `routes.mjs` (39 rute × 3 roluri), `admin-check.mjs`, `customer-check.mjs`,
  `deploy-check.mjs`. Rezultat: `/tmp/bm-fn/route-report.json`.
- Bază de date: `psql -h localhost -U blipmade -d blipmade_test` (doar `SELECT`, cu excepția
  creării celor două conturi de audit și a unor rânduri `StaffMember`).

### 1.5 Limitări

1. **Firefox și WebKit nu există pe VM.** Verificarea s-a făcut exclusiv în Chromium. Nicio afirmație
   din acest raport nu acoperă WebKit/Safari sau Firefox.
2. **Nicio comandă git nu a fost rulată** (nu există `.git` în copia de lucru și nici nu s-a accesat
   istoricul de pe VM). Raportul descrie starea fișierelor, nu istoricul de schimbări.
3. **Nu s-a rulat suita de teste** și nu s-a modificat `package.json`. Un proces `vitest` concurent
   (al altui agent) rulea între 23:34 și 23:37 și încă unul în jurul 23:43; acesta golește
   (`TRUNCATE`) toate tabelele din `blipmade_test` la fiecare fișier de test. Consecință: mai multe
   rezultate din prima parcurgere (sesiunile conturilor, unele ID-uri de rută) au devenit
   nevalabile în timpul măsurătorii și au fost repetate. Toate afirmațiile din coloana „verificat"
   de mai jos provin din rulări repetate cu o bază de date stabilă.
4. **Fluxul real Stripe nu poate fi exercitat** (nu există cheie). A fost exercitată doar poarta
   locală de test (`STRIPE_TEST_MODE=true`).
5. **Workerul nu rulează în stiva izolată**, deci provisionarea unei instânțe nu poate fi dusă până
   la capăt; s-a verificat până la crearea rândului `Instance` cu starea `pending`.
6. **SMTP nu este configurat** în stiva izolată (`SMTP_URL` gol): mesageria se scrie în fișiere.
7. **DNS real nu poate fi exercitat** (nu există un domeniu de test).
8. **Nu am atins niciodată baza de date de producție** (`blipmade`), containerele de producție
   (`blipmade-api-1`, `blipmade-worker-1`, `blipmade-postgres-1`) sau domeniul `blipmade.com`.

### 1.6 Regula de izolare

Singura bază de date scrisă a fost `blipmade_test` (baza stivei izolate). Scrierile au fost:
două conturi de audit (`qa.check@example.test`, `admin.check@example.test`), două rânduri
`StaffMember`, cinci produse de test (`audit-*`), câteva promoții (`EX3HALF`, `EX4PAID`,
`AUDIT10`, `AUDITFIX`, `AUDITPCT`), o serie de comenzi și bilete de test. Nu s-a scris niciodată în
`blipmade` (producție), nu s-a făcut niciun deploy și nu s-a autentificat niciodată pe
`blipmade.com`. Scripturile de browser au fost scrise **doar** în `/tmp/bm-fn` pe VM, nu în
repozitoriu.

---

## 2. Metodă

1. **Enumerare statică, fără presupoziții.** Toate rutele din `web/src/routes.tsx` au fost citite,
   apoi fiecare a fost vizitată în browser cu trei roluri (anonim, client, staff), capturând ruta
   finală, apelurile `/api/*` cu codurile lor, textul paginii, numărul de tabele/rânduri, erorile
   de consolă și de pagină (`route-report.json`, 39 rute × 3 roluri).
2. **Enumerare statică a API-ului.** Toate cele 151 de rute au fost extrase programatic cu
   metoda, calea, linia, permisiunea și gardul, apoi verificate manual pe codul sursă pentru a
   separa implementat de stub.
3. **Diferență între backend și front-end.** Toate literalele de cale din `web/src` au fost extrase
   și comparate cu rutele backend, segment cu segment, după normalizarea parametrilor. Rezultatul:
   **30 de endpoint-uri nu au niciun apelant în interfață** (listate în §4, secțiunea D).
4. **Execuție pe stiva izolată.** Fiecare funcție care putea fi exercitată a fost apelată prin
   HTTP cu rolurile potrivite, cu validarea codurilor de stare, a corpurilor de răspuns și a efectelor
   în baza de date.
5. **Verificarea permisiunilor pe rol.** Un membru cu rol `STAFF` a fost lăsat cu o singură
   permisiune (`audit.read`) și s-a repetat apelul pe toate endpoint-urile de admin; un membru cu rol
   `ADMIN` a fost tratat separat, pentru că rolul `ADMIN` ocolește lista de permisiuni prin
   proiectare.
6. **Auditul zonelor modificate recent** — disponibilitatea derivată a produsului, cartea de
   prețuri, tabelele, lista de sesiuni, limitele promoțiilor, ecranele de admin — a fost tratat ca
   temă distinctă, cu scenarii construite special (patru stări de disponibilitate, o promoție cu
   două limite, o plată simulată, o revizuire).
7. **Regula de onestitudine.** Fiecare rând al matricei spune dacă funcția a fost **exercitată**
   (marcat „exercitat") sau doar **citită** (marcat „citit"). Nimic nu este clasificat ca funcțional
   pe baza citirii singure.

---

## 3. Matrice de acoperire

Legendă clase: **F** = `IMPLEMENTED AND WORKING`, **B** = `IMPLEMENTED BUT BROKEN`,
**I** = `INTERFACE ONLY`, **BA** = `BACKEND ONLY`, **D** = `DEAD OR UNREACHABLE`,
**S** = `STUBBED`, **MP** = `MISLEADING PLACEHOLDER`, **PW** = `PARTIALLY WIRED`,
**M** = `MISSING`.

### 3.1 Site public (A)

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| A01 | Pagina de pornire | `web/src/pages/Home.tsx` + `home/*` (Hero, Catalog, Platform, Story, Studio, Ticker, Rest) | F | Browser, rulare la `/` pe stiva izolată | Text: „Apps from €1.00/mo", prețuri derivate din `GET /api/catalog/products`; zero erori de consolă | — |
| A02 | Catalog public | `/apps` → `home/Catalog.tsx` | F | Browser la `/apps` | 14 produse, filtre pe categorie, căutare; preț de pornire per produs | — |
| A03 | Pagina publică de produs | `/apps/:slug` → `app/ProductPage.tsx` | F | Browser la `/apps/audit-deployable` | Preț de pornire + „Minimum resources"; starea de disponibilitate afișată | FN-P1-01 |
| A04 | Documentație | `/docs` → `pages/Docs.tsx` (2 751 linii, 30 pagini) | F | Browser la `/docs` | Pagina de produs apare doar dacă produsul există în catalog (`availablePages`); pagina de produs WordPress randată | FN-P1-04 |
| A05 | Starea serviciului | `/status` → `pages/Status.tsx` | F | Browser la `/status` + `GET /api/status` | 10 componente, `overall` calculat corect; „Automation worker: Outage" (workerul nu rulează în stiva izolată) | — |
| A06 | Autentificare | `/login` → `pages/Login.tsx` | F | Browser (3 conectări) | `POST /api/auth/login` → 200, sesiune în cookie `bm_session` HttpOnly | — |
| A07 | Înregistrare | `/register` → `pages/Register.tsx` | F | API: `POST /api/auth/register` ×5 | 201, utilizator creat, e-mail scris în fișier (`mail.state=written-to-file`) | — |
| A08 | Parolă uitată | `/forgot-password` | F | Browser + API `POST /api/auth/forgot-password` | Formularul se afișează; resetarea trimite un e-mail (scris în fișier) | — |
| A09 | Resetare parolă | `/reset-password` | F | Browser | Formular cu token; backend `POST /api/auth/reset-password` | — |
| A10 | Verificare e-mail | `/verify-email` | F | Browser + API `POST /api/auth/verify-email` | Token cu hash, marcat `usedAt` | — |
| A11 | Alias public de deploy | `/deploy/:slug` | F | Browser | Redirecționează la `/login?next=…` (anonim) sau la `/app/deploy/:slug` (autentificat) | — |
| A12 | Pagina 404 | `pages/NotFound.tsx` | F | Browser la `/this-route-does-not-exist` | 227 caractere, fără crash | — |
| A13 | Simulator „Studio" | `home/Studio.tsx` | F | Citit + browser | Documentat explicit ca simulator: „nothing is created and nothing is billed"; prețurile vin din catalog | — |
| A14 | Secțiunea „Platform" de pe pagina de pornire | `home/Platform.tsx` | S | Citit | Mock declarat în cod („The mock is a picture"); date fictive | FN-P1-22 |

### 3.2 Zona client (B)

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| B01 | Panou client | `/app` → `app/Overview.tsx` | F | Browser la `/app` | „SERVICES 1", „MONTHLY TOTAL €1.79", evenimente per instanță | — |
| B02 | Lista de instanțe | `/app/instances` | F | Browser | Tabel cu 1 rând, coloane INSTANCE/STATUS/LIMITS/PRICE/NODE | — |
| B03 | Instanță — fila Overview | `app/instance/OverviewTab.tsx` | F | Browser + API | Afișează limitele cumpărate (512 MB / 1 vCPU / 5 GB), nu consumul real | FN-P1-04 |
| B04 | Instanță — fila Console (WebSocket) | `app/instance/ConsoleTab.tsx` | PW | Citit + conexiune WS | Se conectează la `/api/instances/:id/console/stream`; fluxul nu a produs ieșire (consola depinde de panel) | FN-P1-23 |
| B05 | Instanță — fila Files | `app/instance/FilesTab.tsx` (739 linii) | PW | Citit + lista de rute | Există 12 endpoint-uri de fișiere (list/upload/rename/move/copy/chmod/compress/decompress/download/delete); UI-ul le apelează pe toate | — |
| B06 | Instanță — fila Databases | `app/instance/DatabasesTab.tsx` | PW | Citit | CRUD baze de date prin panel; dependinte de panel | FN-P1-23 |
| B07 | Instanță — fila Backups | `app/instance/BackupsTab.tsx` | PW | Citit | CRUD backup-uri prin panel (`listBackups/createBackup/restoreBackup/deleteBackup/downloadBackup`) | FN-P1-24 |
| B08 | Instanță — fila Network | `app/instance/NetworkTab.tsx` | PW | Citit | Alocări porturi din panel | FN-P1-23 |
| B09 | Instanță — fila Startup | `app/instance/StartupTab.tsx` | PW | Citit | Variabile de mediu + comandă de pornire; `PATCH /startup` este alias nefolosit de UI | FN-P1-23 |
| B10 | Instanță — fila Schedules | `app/instance/SchedulesTab.tsx` | PW | Citit | Cron-uri ale panelului | FN-P1-23 |
| B11 | Instanță — fila Settings | `app/instance/SettingsTab.tsx` | PW | Citit | Reinstall (`POST /settings/reinstall`), suspend (`POST /suspend`) | FN-P1-23 |
| B12 | Instanță — fila Activity | `app/instance/ActivityTab.tsx` | F | Browser + `GET /instances/:id/events` | Evenimente readuse; „No activity yet" pentru instanța nouă | — |
| B13 | Instanță — fila Resources (redimensionare) | `app/InstanceDetail.tsx:246-370` | F | Citit + API | `GET /instances/:id/resources/quote` + `PUT /instances/:id/resources`; diferența de preț e calculată de server | — |
| B14 | Instanță — fila Domains | `app/instance/DomainsTab.tsx` | PW | Citit | Atașare hostname cu TXT; dependent de DNS real | FN-P1-25 |
| B15 | Catalog de deploy | `/app/deploy` → `app/DeployCatalog.tsx` | F | Browser | „5 of 14 products can be deployed right now"; filtre pe starea de disponibilitate | — |
| B16 | Configurator de deploy | `/app/deploy/:slug` → `app/Deploy.tsx` (913 linii) | B | Browser + API | Preț estimat de server (`POST /catalog/quote` → 200); presetul „Recommended configuration" este identic cu minimul | FN-P1-01, FN-P1-14 |
| B17 | Domenii | `/app/domains` → `app/Domains.tsx` | PW | Browser + API | Listă goală, formular de adăugare; `GET /domains` → 200 | FN-P1-19 |
| B18 | Facturare | `/app/billing` → `app/Billing.tsx` | PW | Browser + API | Sumar, abonamente, facturi, metodă de plată; pagina ignoră parametrul `checkout` | FN-P1-03, FN-P1-26 |
| B19 | Bilete de suport | `/app/tickets` → `app/Tickets.tsx` | F | Browser + API | Tabel cu 1 rând (#819), buton „New ticket", categorii din API | — |
| B20 | Detaliu de bilet | `/app/tickets/:id` → `app/TicketDetail.tsx` | PW | Browser + API | Trimitere răspuns → 201; „atașamente" = doar metadate | FN-P1-02 |
| B21 | Setări — profil | `/app/settings` | F | Browser | Nume, e-mail, rol, data creării | — |
| B22 | Setări — parolă | `/app/settings` | F | Browser + API | `POST /settings/password`; invalidează celelalte sesiuni | — |
| B23 | Setări — lista de sesiuni | `/app/settings` | F | Browser + API | 5 sesiuni listate cu dispozitiv, IP, ultima activitate; „Close session" și „Close all other sessions" funcționează | FN-P1-27 |
| B24 | Setări — notificări | `/app/settings` | F | Browser + API | 5 preferințe, `PUT /settings/notifications` | — |
| B25 | Setări — închiderea contului | `/app/settings` | F | Browser + API | `POST /settings/account/closure` + `DELETE` | — |
| B26 | Comandă de resurse (upgrade) | `app/InstanceDetail.tsx:290-315` | F | Citit + API | `PUT /instances/:id/resources` returnează `requires_payment` + `checkoutUrl` | — |

### 3.3 Zona de admin (C)

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| C01 | Tabloul de bord | `/admin` → `admin/Overview.tsx` | F | Browser | 8 indicatori, „Go to" către fiecare listă | — |
| C02 | Lista de clienți | `/admin/customers` | F | Browser | Tabel, căutare, „Show e-mails" | — |
| C03 | Detaliu client | `/admin/customers/:id` | F | Browser + API | `GET /admin/customers/:id` → 200 cu instanțe, comenzi, bilete | — |
| C04 | Comenzi | `/admin/orders` | PW | Browser + API | Tabel cu filtre pe status și buton „Refund" | FN-P1-10 |
| C05 | Servicii (instanțe) | `/admin/services` | F | Browser | Tabel cu filtre pe status, „Retry provisioning" | — |
| C06 | Catalog produse | `/admin/products` | F | Browser + API | 11 produse; coloanele VISIBLE/DEPLOYABLE arată cele 4 stări și motivele blocajului | — |
| C07 | Prețuri | `/admin/pricing` | PW | Browser + API | 10 prețuri editabile (base/ram/cpu/disk); câmpuri pentru configurația recomandată inexistente | FN-P1-01 |
| C08 | Coada de suport | `/admin/tickets` | F | Browser | 3 bilete, selectare, „No ticket open" implicit | — |
| C09 | Promoții | `/admin/promotions` | PW | Browser + API | Creare/editare/limite; contorul afișat nu este cel impus | FN-P1-05 |
| C10 | Infrastructură | `/admin/infrastructure` | F | Browser + API | 1 nod, 16 ouă, „Sync panel" | — |
| C11 | Jurnal de audit | `/admin/audit` | F | Browser | 195 rânduri, căutare pe actor/acțiune/țintă | — |
| C12 | Personal și permisiuni | `/admin/staff` | F | Browser + API | 32 membri, 21 căsuțe de permisiuni, „Save permissions" | FN-P1-28 |
| C13 | Setări de platformă | `/admin/settings` | F | Browser + API | Tabel cheie/valoare (JSON), „Add a setting" | — |
| C14 | Retur manual de comandă | buton „Refund" în `admin/Orders.tsx` | B | API `POST /admin/orders/:id/refund` | 503 „Payments are not configured on this environment" | FN-P1-10 |

### 3.4 Funcții fără ecran (D) — backend only / moarte / stub-uri

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| D01 | `GET /admin/customers/:id/panel` | `admin.ts:218` | BA | API cu token de staff | 200, obține tokenul de acces la panel | FN-P1-12 |
| D02 | `POST /admin/customers/:id/panel/credential` | `admin.ts:254` | BA | API | 200, creează `PanelCredential` | FN-P1-12 |
| D03 | `DELETE /admin/customers/:id/panel/credential` | `admin.ts:287` | BA | Citit | Șterge credențialul | FN-P1-12 |
| D04 | `POST /admin/instances/reconcile-prices` | `admin.ts:367` | BA | API | 200 `{"checked":3,"corrected":0,"differences":[]}` | — |
| D05 | `POST /admin/invoices/:id/confirm-collection` | `admin.ts:381` | BA | API | 400 „reference: Required" — validare prea devreme, nu ajunge la logică | FN-P1-29 |
| D06 | `GET /admin/email/delivery` | `admin.ts:1131` | BA | API | 200: transport „file", `writtenToFile: 41`, contoare de coadă | FN-P1-07 |
| D07 | `POST /admin/instances/import` | `admin.ts:1173` | BA | API | 404 „Customer not found." — validare corectă | — |
| D08 | `GET /admin/money` | `admin.ts:1254` | S | API | 200 `{"example":{"minorUnits":312,"majorUnits":3.12}}` — valoare fixă, fără apelant | FN-P1-11 |
| D09 | `POST /auth/enroll-admin` | `auth.ts:353` | BA | API | 401 „The enrollment key is not correct." — mecanism de enrolare, fără ecran | FN-P1-12 |
| D10 | `POST /internal/prune-sessions` | `auth.ts:402` | D | Citit | Folosit de worker prin import direct, nu prin HTTP | — |
| D11 | `GET /internal/whoami` | `auth.ts:409` | D | Citit | Sonda internă | — |
| D12 | `GET /auth/require` | `auth.ts:414` | D | Citit | Sonda internă | — |
| D13 | `GET /internal/not-a-real-route` | `auth.ts:419` | D | Citit | Sonda „nu există"; înregistrează rute false | FN-P1-30 |
| D14 | `GET /billing/payment-state` | `billing.ts:119` | BA | API | 200 `{"enabled":false,"simulated":true,"reason":"…"}` | — |
| D15 | `POST /billing/quote` | `billing.ts:199` | BA | API | 200, identic cu `POST /catalog/quote` | FN-P1-14 |
| D16 | `POST /billing/subscriptions/:id/renew` | `billing.ts:262` | BA | Citit | Există, fără ecran | — |
| D17 | `GET /billing/instances/:id/export` | `billing.ts:298` | BA | API | 404 „Instance not found." (ID inexistent) | — |
| D18 | `GET /instances/:id/metrics` | `instances.ts:157` | BA | API | 404 „Instance not found." (ID inexistent); documentația promite o pagină de metrici | FN-P1-04 |
| D19 | `GET /instances/:id/console/stream` (WebSocket) | `instances.ts:214` | F | Citit + conexiune WS din UI | UI-ul se conectează; fluxul e dependent de panel | FN-P1-23 |
| D20 | `POST /orders/:id/cancel` | `orders.ts:198` | BA | API | 204 — funcționează, dar nu are ecran | FN-P1-31 |
| D21 | `POST /tickets/:id/attachments` | `tickets.ts:318` | BA | API | 400 „The file has to be sent as multipart form data." — backend complet, fără apelant | FN-P1-02 |
| D22 | `GET /tickets/:id/attachments/:attachmentId` | `tickets.ts:387` | BA | Citit | Descărcare cu verificare de rol | FN-P1-02 |
| D23 | `POST /instances/:id/files/archive` | `instance-server.ts:360` | D | Citit | Alias nefolosit de `/files/compress` | FN-P1-17 |
| D24 | `POST /instances/:id/files/unarchive` | `instance-server.ts:382` | D | Citit | Alias nefolosit de `/files/decompress` | FN-P1-17 |
| D25 | `GET /webhooks/stripe/failed` | `webhooks.ts:722` | BA | API | **200** cu corp `{"error":{"code":"unauthorized"}}` | FN-P1-08 |
| D26 | `POST /webhooks/stripe/replay` | `webhooks.ts:740` | BA | Citit | Replay manual al evenimentelor eșuate | — |
| D27 | `POST /webhooks/stripe` | `webhooks.ts:630` | F | Citit + poartă locală | Webhook cu verificare de semnătură; varianta locală procesată cu succes | — |
| D28 | `POST /webhooks/stripe/test` | `webhooks.ts:670` | BA | API cu `x-internal-token` | 200 `{"received":true}` — singurul mecanism care încheie o plată locală | FN-P1-03 |
| D29 | `GET /health` | `health.ts:39` | F | API | 200 cu `database`, `redis`, `mail`, `stripe`, `pterodactyl`, `panelKeyBridge` | — |
| D30 | Notificări de factură (implementare moartă) | `billing.ts:31-113` | D | `grep` | `notifyInvoicePaid` / `notifyInvoiceFailed` / `notifySubscriptionChange` nu sunt importate nicăieri | FN-P1-06 |

### 3.5 Integrări, cozi și infrastructură (E)

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| E01 | Panou Pterodactyl — citire noduri și ouă | `services/pterodactyl/*`, `admin.ts:886` | F | API + browser | 1 nod, 16 ouă, „Sync panel" | — |
| E02 | Provisionare (creare server) | `services/provisioning.ts` | PW | API + DB | După plată: rând `Instance` creat cu starea `pending`; workerul nu rulează în stiva izolată | FN-P1-23 |
| E03 | Bridge de identitate cu panoul | `services/panel/identity.ts` | PW | Citit | `pterodactylUserId` este completat de bridge, dar API-ul îl întoarce mereu `null` clientului | FN-P1-13 |
| E04 | Bridge de credentiale de panou | `services/panel/credentials.ts` | BA | API | Doar prin D01–D03, fără ecran | FN-P1-12 |
| E05 | Poștă (SMTP / Resend / fișier) | `lib/mailer.ts` | PW | API + fișiere | Transport „file", `SMTP_URL` gol; 41 mesaje scrise în `/var/backups/blipmade/mail` | FN-P1-07 |
| E06 | Coada de e-mail | `services/queue.ts:134` | PW | API | Contor vizibil doar pentru coada, nu pentru mesageria trimisă direct | FN-P1-07 |
| E07 | Stripe — calea reală | `services/stripe.ts:186` | PW | Citit | Fără cheie: `PAYMENTS_ENABLED=false`, `stripe=not_configured` | — |
| E08 | Poartă locală de plată | `services/stripe.ts:33,187` | F | API | Comandă → `checkout` → `POST /webhooks/stripe/test` → comandă `PAID`, instanță și abonament create | FN-P1-03 |
| E09 | DNS — verificare TXT | `services/dns.ts`, `routes/domains.ts:382` | PW | Citit | `resolveTxt` + `matchesToken` (comparare în timp constant); imposibil de verificat fără domeniu real | FN-P1-25 |
| E10 | Gateway Caddy (rutare hostname) | `services/gateway.ts` | PW | Citit | `applyCaddyRoute`; fără gateway → starea rămâne `PENDING_DNS` | FN-P1-25 |
| E11 | Coada de provisionare | `services/queue.ts:58` | PW | API | `getJobCounts` raportat în `/status`: „0 waiting" | FN-P1-23 |
| E12 | Worker — 5 timer-e | `api/src/worker.ts:197-201` | PW | Citit | `reconcile` 60s, `pruneQueue` 10min, `pruneSessions` 1h, `sweepBilling` 15min, `retryWebhooks` 5min; workerul nu rulează în stiva izolată | — |
| E13 | Redis | `api/src/redis.ts` | F | API | `redis: true` în `/health`; **shared cu stiva de producție** | FN-P1-32 |
| E14 | Scripturi de backup | `scripts/backup.sh`, `backup-offsite.sh`, `install-backup-timer.sh` | PW | Shell pe VM | Scripturile există; **timerul systemd nu este instalat**, fără cron, fără țintă off-site | FN-P1-09 |
| E15 | Drill de restaurare | `scripts/restore-drill.sh` | PW | Shell pe VM | Două arhive de drill din 22.10.2026, cu `.sha256` | FN-P1-09 |
| E16 | Numerotare comenzi | `services/order-numbers.ts` + `Setting("internal.order.sequence")` | F | API | `BM-00001`, `BM-00003` observate | — |

### 3.6 Funcții centrale verificate explicit (F) — domenii sensibile

| # | Funcție | Unde | Clasă | Cum a fost verificată | Evidență | Constatare |
|---|---|---|---|---|---|---|
| F01 | Disponibilitate derivată — 4 stări | `services/availability.ts` | F | API: 4 produse create cu combinații de `deployable`/`eggId`/`visible` | `DEPLOYABLE`, `COMING_SOON`, `TEMPORARILY_UNAVAILABLE` corecte; `UNPUBLISHED` absent din catalogul public; cotele refuză cu mesaj potrivit | — |
| F02 | Coerența stărilor în toate ecranele | `web/src/lib/pricing-contract.ts:availabilityState` | F | Browser pe `/apps`, `/apps/:slug`, `/app/deploy`, `/app/deploy/:slug`, `/admin/products` | Același cuvânt în toate locurile: „Ready to deploy", „Coming soon", „Temporarily unavailable", „Not published" | — |
| F03 | Carte de prețuri — minim | `services/pricing.ts:priceBook` | F | API | `pricing.minimum = {ram:512,cpu:1,disk:5,amount:500}` | — |
| F04 | Carte de prețuri — recomandat | `services/pricing.ts:priceBook` | S | API + browser | `pricing.recommended` este identic cu `minimum` la fiecare produs; linia din pagina de produs nu apare niciodată | FN-P1-01 |
| F05 | Coerența prețului între catalog, cotă și comandă | `services/pricing.ts` | F | API | Cotă 500 = `baseAmount`; comandă cu 2 bucăți = 1 000; prețul de pe pagina de produs = prețul minim | FN-P1-14 |
| F06 | Limitele unei promoții | `services/pricing.ts:207-341` | F | API | `maxRedemptions` și `maxPerUser` validate la creare; rezervare pe comandă; refuz „This code has already been used on your account." după plată | FN-P1-05 |
| F07 | Validarea promoțiilor | `admin.ts:811` | F | API | FIXED cu `value=0` → 400; PERCENT 200% → 400 | — |
| F08 | Lista de sesiuni | `settings.ts:468-529` | F | Browser + API | Listă cu dispozitiv/IP/activitate; revocare individuală (200) și de excludere reciprocă (204) | FN-P1-27 |
| F09 | Rotația și plafonarea sesiunilor | `plugins/auth.ts` | F | API | `MAX_SESSIONS_PER_USER=20`; plafonarea se aplică la autentificare | — |
| F10 | Permisiunile pe rol `STAFF` | `lib/permissions.ts`, `plugins/auth.ts:268` | F | API cu un membru STAFF redus la `audit.read` | 14 endpoint-uri → 403 cu mesaj precis; doar `/admin/audit` → 200 | FN-P1-28 |
| F11 | Blocarea zonei de admin pentru clienți | `routes.tsx:145` | F | Browser + API | Clientul primește „Staff access only" în UI și 403 „Staff access only." în API, pe toate cele 14 endpoint-uri | — |
| F12 | Protecția CSRF | `plugins/csrf.ts` | F | API | Fără `x-csrf-token`, cererile de scriere sunt refuzate cu 403 | — |
| F13 | Limitarea rate-ului la autentificare | `routes/auth.ts:86` | F | API | 429 „Too many requests. Try again shortly." după 10 încercări pe cont / 15 min | FN-P1-33 |
| F14 | Tabelele administrative | `web/src/lib/table.ts` | F | Browser | Un component comun, folosit în 8 pagini; `DataTable` randat corect (customers 10 rânduri, orders 4, products 11, tickets 3, promotions 11, audit 195) | FN-P1-19 |
| F15 | Audit log | `lib/audit.ts` | F | API + browser | 195 rânduri, actor/acțiune/țintă/ IP | — |

---

## 4. Constatări

### FN-P1-01 — Configurația „recomandată" a cărții de prețuri nu poate fi setată niciodată

- **Severitate:** High
- **Modul afectat:** `api/src/routes/admin.ts` (crearea produsului), `api/src/services/pricing.ts` (cartea de prețuri), `web/src/app/ProductPage.tsx`, `web/src/app/Deploy.tsx`, `web/src/home/Configurator.tsx`
- **Comportament observat:** `POST /api/admin/products` scrie `defaultRam: body.minRam, defaultCpu: body.minCpu, defaultDisk: body.minDisk` (`api/src/routes/admin.ts:612-614`). `PATCH /api/admin/products/:id` nu are câmpuri pentru ele (`admin.ts:636-651`). Prin urmare `Product.defaultRam === Product.minRam` pentru orice produs, iar `priceBook()` (`services/pricing.ts:88-113`) produce `recommended` identic cu `minimum`.
- **Comportament așteptat:** cartea de prețuri are două configurații distincte („the recommended configuration is a bigger one and it has its own price", `services/pricing.ts:76-78`); configurația recomandată ar trebui să fie configurabilă din zona de admin.
- **Pași de reproducere:**
  1. `POST /api/admin/products` cu `{"slug":"x","name":"X","category":"WEB_CMS","description":"...","baseAmount":500,"minRam":512,"minCpu":1,"minDisk":5,"maxRam":4096,"maxCpu":2,"maxDisk":50,"deployable":true,"eggId":3,"defaultRam":1024,"defaultCpu":2,"defaultDisk":20}` → 201.
  2. `GET /api/catalog/products/x` → `"pricing":{"minimum":{"ram":512,"cpu":1,"disk":5,"amount":500},"recommended":{"ram":512,"cpu":1,"disk":5,"amount":500}}` — `defaultRam` a fost ignorat.
  3. `PATCH /api/admin/products/<id>` cu `{"defaultRam":1024}` → valoarea este eliminată de schema Zod, deci nu se schimbă nimic.
  4. Browser la `/apps/x`: apare doar „Starting price, for the smallest configuration: 512 MB · 1 vCPU · 5 GB." — rândul despre configurația recomandată **nu apare**, pentru că `ProductPage.tsx:197` cere `!sameConfiguration(startConfiguration, recommendation)`.
  5. Browser la `/app/deploy/x`: singurul preset este „Recommended configuration — 512 MB · 1 vCPU · 5 GB disk — €1.99/mo", adică exact minimul și exact prețul de pornire.
- **Cauză root cause (confirmată):** lipsa câmpurilor `defaultRam/defaultCpu/defaultDisk` în schema de creare și de actualizare a produsului; valoarea este derivată automat din minim.
- **Evidență:** `api/src/routes/admin.ts:612-614`; `api/src/routes/admin.ts:636-651`; `api/src/services/pricing.ts:88-113`; `web/src/app/ProductPage.tsx:197-202`; `web/src/app/Deploy.tsx:512-522`; măsurători API §3.6 F04; captură browser `/app/deploy/audit-deployable` („PRESETS: [\"Recommended configuration512 MB · 1 vCPU · 5 GB disk€1.99/mo\"]").
- **Remediere propusă:** adaugă `defaultRam/defaultCpu/defaultDisk` (opțional, cu validare `min ≤ default ≤ max`) în schema Zod a `POST`/`PATCH /admin/products`, scrie-le în coloanele existente, și expune-le în `admin/Pricing.tsx` și `admin/Products.tsx`.
- **Criterii de verificare:** un produs creat cu `defaultRam=2048` afișează `pricing.recommended.ram = 2048` și un preț diferit; pagina publică arată rândul despre configurația recomandată; presetul de pe pagina de deploy este diferit de minim.

### FN-P1-02 — Atașamentele de la bilete sunt doar metadate; backend-ul real nu are niciun apelant

- **Severitate:** High
- **Modul afectat:** `web/src/app/TicketDetail.tsx`, `api/src/routes/tickets.ts`, modelul `Attachment`
- **Comportament observat:** formularul de răspuns citește fișierul și trimite doar `{name, size, type}` (`web/src/app/TicketDetail.tsx:90, 99-103`). Octeții nu părăsesc niciodată browserul. Serverul le stochează în `TicketMessage.attachmentMeta` (`api/src/routes/tickets.ts:279`). Endpoint-urile care transferă efectiv fișierul — `POST /tickets/:id/attachments` (multipart, cu stocare, sha256, eveniment și audit) și `GET /tickets/:id/attachments/:attachmentId` (descărcare cu verificare de rol) — nu sunt apelate de nicio pagină. În baza de date: 0 rânduri în `Attachment`, 1 `TicketMessage` cu `attachmentMeta` nevid.
- **Comportament așteptat:** fișierul atașat este real și poate fi descărcat de client și de agent.
- **Pași de reproducere:**
  1. `POST /api/tickets` (subiect, categorie, prioritate, corp) → 201, se obține ID-ul.
  2. `POST /api/tickets/<id>/replies` cu `{"body":"...","attachments":[{"name":"a.txt","size":10,"type":"text/plain"}]}` → 201; mesajul conține un element de atașament.
  3. `SELECT count(*) FROM "Attachment"` → `0`; `SELECT count(*) FROM "TicketMessage" WHERE "attachmentMeta" IS NOT NULL` → `1`.
  4. `GET /api/tickets/<id>` → mesajul listează „a.txt · 10 B · text/plain"; descărcarea imposibilă (nu există rând).
- **Cauză root cause (confirmată):** lipsa unui client de încărcare multipart în interfață; backend-ul complet există, dar nu este legat.
- **Evidență:** `web/src/app/TicketDetail.tsx:90,99-103`; `api/src/routes/tickets.ts:318-385` (încărcare) și `:387-406` (descărcare); interogare `Attachment` = 0.
- **Remediere propusă:** în `TicketDetail.tsx`, trimite fișierul prin `POST /tickets/:id/attachments` (multipart) și apoi referențiază ID-ul de atașament în răspuns; adaugă legătură de descărcare în firul de mesaj, atât pentru client, cât și pentru agent.
- **Criterii de verificare:** după trimiterea unui răspuns cu fișier, există un rând în `Attachment`, iar descărcarea prin `GET /tickets/:id/attachments/<id>` întoarce exact octeții trimiși (verificat prin `sha256`).

### FN-P1-03 — Pagina de facturare ignoră parametrul `checkout`; în poarta locală plată nu se finalizează niciodată

- **Severitate:** High
- **Modul afectat:** `web/src/app/Billing.tsx`, `web/src/app/Deploy.tsx`, `api/src/services/stripe.ts`, `api/src/routes/webhooks.ts`
- **Comportament observat:** `POST /orders/<id>/checkout` întoarce `{"url":"https://blipmade.com/app/billing?checkout=test_cs_<id>","testGateway":true}` și `Deploy.tsx:344-349` face `location.assign(checkout.url)`. `web/src/app/Billing.tsx` nu citește niciodată parametrul `checkout` (0 apariții ale cuvântului în fișier). Singurul mecanism care încheie plata locală este `POST /api/webhooks/stripe/test`, care cere un token intern și nu este apelat de nicio pagină. Rezultat: comanda rămâne `AWAITING_PAYMENT` la nesfârșit, iar clientul ajunge pe o pagină de factură fără nicio explicație. În producție, un checkout Stripe anulat (`?checkout=cancelled`) se întoarce tot pe aceeași pagină mută.
- **Comportament așteptat:** întoarcerea din plăti arată starea comenzii („plătit", „anulat", „în așteptare") și, în poarta locală, finalizează plata.
- **Pași de reproducere:**
  1. `POST /api/orders` (produs disponibil) → 201.
  2. `POST /api/orders/<id>/checkout` → 200, `url` cu `checkout=test_cs_<id>`.
  3. Deschide URL-ul în browser → apare pagina de factură; textul nu conține niciun cuvânt despre `checkout`, `plată`, `test` sau `anulat`.
  4. `GET /api/orders/<id>` → `status: AWAITING_PAYMENT` (nu se schimbă).
  5. Cu tokenul intern: `POST /api/webhooks/stripe/test` cu `{"orderId":"<id>","amount":199}` → 200 și comanda devine `PAID` — deci plata funcționează, dar nu există nicio cale de UI care s-o declanșeze.
- **Cauză root cause (confirmată):** lipsa tratamentului parametrului `checkout` în pagina de factură și lipsa unui client al porții locale de plată.
- **Evidență:** `web/src/app/Billing.tsx` (fără `checkout`); `web/src/app/Deploy.tsx:344-349`; `api/src/services/stripe.ts:187-192`; `api/src/routes/webhooks.ts:670-717`; măsurători `ex3.json` / `ex4.json`.
- **Remediere propusă:** în `Billing.tsx`, citește `checkout` din adresă, arată starea comenzii și, pentru `test_cs_*`, apelează `POST /webhooks/stripe/test` cu tokenul intern furnizat de server (sau un endpoint dedicat, cu rol și CSRF), apoi redirecționează la pagina comenzii.
- **Criterii de verificare:** după checkout, comanda trece în `PAID` fără intervenție manuală; un checkout anulat afișează un mesaj explicit pe pagina de factură.

### FN-P1-04 — Documentația promite o pagină de metrici care nu există

- **Severitate:** Medium
- **Modul afectat:** `web/src/pages/Docs.tsx` („Check the metrics", „Getting it wrong"), `web/src/app/InstanceDetail.tsx` (taburi), `api/src/routes/instances.ts:157`
- **Comportament observat:** documentația afirmă „The metrics page shows the memory, the CPU and the network of the instance" și „Watch the metrics page for a day before you resize. It shows the real memory and CPU use". Pagina instanței are 12 taburi (Overview, Console, Files, Databases, Backups, Network, Startup, Schedules, Settings, Activity, Resources, Domains) — **nu există tab de metrici**; fila Overview arată limitele cumpărate, nu consumul. `GET /api/instances/:id/metrics` există în API dar nu are niciun apelant.
- **Comportament așteptat:** fie există pagina de metrici, fie documentația nu o promite.
- **Pași de reproducere:** `GET /api/catalog/products` → lista produselor; pagină produs → „Check the metrics"; apoi pagina instanței → niciun tab de metrici; `grep "metrics" web/src` → doar textul din documentație.
- **Cauză root cause (confirmată):** endpointul de metrici a fost implementat, pagina care îl consumează nu.
- **Evidență:** `web/src/pages/Docs.tsx` secțiunile `check-the-metrics` și `getting-it-wrong`; `web/src/app/InstanceDetail.tsx:79-92`; `api/src/routes/instances.ts:157`.
- **Remediere propusă:** fie adaugă un tab „Metrics" care consumă `GET /instances/:id/metrics`, fie marchează promisiunea ca „Planned" în documentație, ca s-a făcut pentru cheile API și certificatele SSL.
- **Criterii de verificare:** pagina instanței afișează consumul real de memorie/CPU/rețea, sau documentația nu mai promite un lucru inexistent.

### FN-P1-05 — Contorul de redeem-uri afișat în admin nu este contorul care impune plafonul

- **Severitate:** Medium
- **Modul afectat:** `web/src/admin/Promotions.tsx`, `api/src/routes/admin.ts:801`, `api/src/services/pricing.ts:207-241`
- **Comportament observat:** tabelul de promoții afișează `Promotion.usedCount` (coloana „REDEMPTIONS"), iar antetul afirmă „Codes with the real redemption count against the real cap. Nothing here is a simulated counter." În realitate, plafonul este impus de numărarea rândurilor `PromotionRedemption`, care includ și **rezervările comenzilor neplătite din ultimele 48 de ore** (`effectiveRedemptions`, `services/pricing.ts:207-221`). `usedCount` se incrementează doar la plată.
- **Comportament așteptat:** numărul afișat în admin să fie cel comparat cu plafonul.
- **Pași de reproducere:**
  1. `POST /api/admin/promotions` cu `{"code":"EX3HALF","type":"PERCENT","value":5000,"maxRedemptions":3,"maxPerUser":1}` → 201.
  2. `POST /api/orders` cu `promotionCode:"EX3HALF"` → 201; apare 1 rând în `PromotionRedemption` (rezervare).
  3. `GET /api/admin/promotions` → rândul arată `usedCount: 0` („0 / 3"), dar codul este deja refuzat pentru contul respectiv: `POST /api/catalog/quote` cu același cod → `{"code":"EX3HALF","valid":false,"reason":"This code has already been used on your account."}`.
  4. După plata reală (prin poarta locală), `usedCount` devine 1 — deci diferența apare doar în faza de rezervare.
- **Cauză root cause (confirmată):** două mecanisme diferite de numărare a redeem-urilor, păstrate în paralelă.
- **Evidență:** `api/src/routes/admin.ts:801`; `api/src/services/pricing.ts:207-241, 273-340`; `api/src/services/stripe.ts:293`; măsurători `ex3.json` (`[PROMO] admin table row for EX3HALF` → `usedCount: 0` cu 1 rând în `PromotionRedemption`).
- **Remediere propusă:** expune în API ambele numere („plătite" și „rezervate, încă active") și compară în UI plafonul cu totalul efectiv; sau aliniază `usedCount` cu `countEffectiveRedemptions`.
- **Criterii de verificare:** numărul afișat în admin plus numărul de rezervări active însumează exact plafonul în momentul refuzului.

### FN-P1-06 — Implementare duplicată și moartă a notificărilor de factură

- **Severitate:** Medium
- **Modul afectat:** `api/src/routes/billing.ts:31-113`, `api/src/services/notifications.ts`
- **Comportament observat:** `api/src/routes/billing.ts` definește și exportă `notifyInvoicePaid`, `notifyInvoiceFailed`, `notifySubscriptionChange` plus helperul privat `sendBillingMail`. Niciuna nu este importată oriunde. Implementarea vie este `api/src/services/notifications.ts` (importată de `api/src/routes/webhooks.ts:13`), care adaugă respectarea preferințelor, cheie de idempotență și `kind` pentru contorul `/admin/email/delivery`.
- **Comportament așteptat:** o singură implementare a notificărilor de factură.
- **Pași de reproducere:** `grep -rn "notifyInvoicePaid" api/src` → doar definiția în `billing.ts:52` și cea din `services/notifications.ts:42`; niciun `import` din `billing.ts`. `grep -rn "sendBillingMail" api/src` → doar cele trei apeluri din același fișier.
- **Cauză root cause (confirmată):** cod mutat dintr-un modul în altul fără eliminarea vechii implementări.
- **Evidență:** `api/src/routes/billing.ts:31-113`; `api/src/routes/webhooks.ts:13,486,531`.
- **Remediere propusă:** șterge `billing.ts:31-113` (sau delegă către `services/notifications.ts`) și păstrează o singură variantă.
- **Criterii de verificare:** `grep -rn "notifyInvoicePaid" api/src` indică o singură definiție; mesajele de factură apar în contorul `/admin/email/delivery`.

### FN-P1-07 — Majoritatea mesajelor tranzacționale ocolesc coada de e-mail

- **Severitate:** Medium
- **Modul afectat:** `api/src/routes/settings.ts:332`, `api/src/routes/tickets.ts:455,470`, `api/src/services/notifications.ts` (5 apeluri), `api/src/routes/auth.ts:146,167`
- **Comportament observat:** doar e-mailurile de autentificare folosesc `dispatchEmail` (cu coadă, reîncercare, idempotență). Notificările clienților, confirmarea schimbării de e-mail și mesajele despre bilete trimit direct prin `sendMail`, în interiorul cererii. Consecințe: un eșec nu este reîncercat, contorul de coadă din `/admin/email/delivery` nu include aceste mesaje, iar latența cererii include trimiterea SMTP.
- **Comportament așteptat:** toate mesajele platformei să treacă prin coadă, ca cele de autentificare.
- **Pași de reproducere:** `grep -rn "sendMail\|dispatchEmail" api/src` → 8 apeluri la `sendMail` (5 în `notifications.ts`, 1 în `settings.ts`, 2 în `tickets.ts`) și 2 la `dispatchEmail` (în `auth.ts`); `GET /api/admin/email/delivery` → `queue.completed: 1`, `writtenToFile: 41` — coada a procesat un singur mesaj dintre cele 41 scrise.
- **Cauză root cause (confirmată):** `dispatchEmail` a fost introdus doar în modulul de autentificare.
- **Evidență:** enumerarea apelurilor de mai sus; `GET /api/admin/email/delivery` (măsurător `ex3.json`).
- **Remediere propusă:** înlocuiește toate apelurile directe la `sendMail` cu `dispatchEmail`, cu cheie de idempotență și `kind` corespunzătoare.
- **Criterii de verificare:** toate mesajele apar în contorul cozii; o coadă oprită nu blochează cererea HTTP.

### FN-P1-08 — `GET /webhooks/stripe/failed` răspunde 200 cu corp de eroare

- **Severitate:** Medium
- **Modul afectat:** `api/src/routes/webhooks.ts:722-728`
- **Comportament observat:** când tokenul intern lipsește sau e greșit, handlerul întoarce `{ error: { code: 'unauthorized', ... } }` **fără** `reply.code(401)`, deci statusul HTTP rămâne 200. Un client care verifică doar statusul consideră apelul reușit.
- **Comportament așteptat:** 401 pentru un token invalid.
- **Pași de reproducere:** `GET /api/webhooks/stripe/failed` fără `x-internal-token` → **HTTP 200**, corp `{"error":{"code":"unauthorized","message":"The internal token is required."}}`.
- **Cauză root cause (confirmată):** `return { error: ... }` în loc de `reply.code(401).send(...)` — diferit de celelalte handler-e din același fișier.
- **Evidență:** `api/src/routes/webhooks.ts:722-728`; măsurător `ex3.json` (`[BACKEND] GET /webhooks/stripe/failed :: 200 {'error': ...}`).
- **Remediere propusă:** `return reply.code(401).send({ error: { code: 'unauthorized', message: 'The internal token is required.' } })`.
- **Criterii de verificare:** status 401 și corp de eroare în formatul platformei.

### FN-P1-09 — Copiile de rezervă nu sunt programate pe gazdă

- **Severitate:** Medium
- **Modul afectat:** `scripts/backup.sh`, `scripts/backup-offsite.sh`, `scripts/install-backup-timer.sh`, `scripts/systemd/blipmade-backup.{service,timer}`
- **Comportament observat:** scripturile și unitățile systemd există în repo, dar pe gazda de producție `systemctl status blipmade-backup.timer` răspunde „Unit blipmade-backup.timer could not be found", `/etc/systemd/system/` nu conține nicio unitate `blipmade-*`, `/etc/cron.d/` conține doar `e2scrub_all`, iar în `.env` nu există nicio variabilă de țintă off-site. Singurele fișiere din `/var/backups/blipmade` sunt două arhive de drill din 22.10.2026 și directorul `mail/`. Scriptul avertizează chiar el că „The physical host uses RAID 0, so a local copy is not a backup."
- **Comportament așteptat:** copie zilnică programată (`install-backup-timer.sh` este conceput exact pentru asta) și o copie off-site.
- **Pași de reproducere:**
  1. `ssh … 'systemctl status blipmade-backup.timer'` → „could not be found".
  2. `ls /etc/systemd/system | grep blipmade` → fără rezultat.
  3. `ls -la /var/backups/blipmade` → doar `blipmade-drill-20261022T*.tar.gz` și `mail/`.
- **Cauză root cause:** instalatorul (`install-backup-timer.sh`) nu a fost executat pe gazdă.
- **Evidență:** ieșirile shell de mai sus; `scripts/backup.sh:1-8`; `scripts/install-backup-timer.sh:1-20`.
- **Remediere propusă:** executați `sudo scripts/install-backup-timer.sh` pe gazdă, configurați ținta off-site (`BACKUP_OFFSITE_*`) și verificați `systemctl list-timers | grep blipmade` plus o restaurare de probă.
- **Criterii de verificare:** timerul activ, o copie nouă în fiecare zi, o copie off-site și un drill de restaurare reușit.

### FN-P1-10 — Butonul „Refund" din comenzile de admin eșuează întotdeauna fără Stripe

- **Severitate:** Medium
- **Modul afectat:** `web/src/admin/Orders.tsx` (buton „Refund"), `api/src/routes/admin.ts:408`
- **Comportament observat:** tabelul comenzilor afișează butonul „Refund" pentru fiecare comandă plătită, dar `POST /admin/orders/:id/refund` răspunde 503 „Payments are not configured on this environment, so this order cannot be refunded from here." pe o platformă fără cheie Stripe.
- **Comportament așteptat:** butonul ascuns când plățile nu sunt configurate, sau un mesaj explicit înainte de acțiune.
- **Pași de reproducere:** `POST /api/admin/orders/<id>/refund` cu `{"reason":"audit refund"}` → 503 `{"code":"unavailable","message":"Payments are not configured on this environment…"}`.
- **Cauză root cause (confirmată):** butonul este randat necondiționat, în funcție doar de starea comenzii.
- **Evidență:** măsurător `ex4.json` (`[ORDER] admin refund :: 503`); captură browser `/admin/orders` (4 butoane „Refund").
- **Remediere propusă:** ascundeți butonul când `GET /billing/payment-state` raportează `enabled: false`, sau trimiteți un avertisment explicit.
- **Criterii de verificare:** butonul nu apare când plățile sunt oprite; când sunt active, returul produce efectul așteptat.

### FN-P1-11 — `GET /admin/money` este un stub cu valoare fixă

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/admin.ts:1254`
- **Comportament observat:** răspunsul este întotdeauna `{"example":{"minorUnits":312,"majorUnits":3.12}}`, fără legătură cu date reale și fără niciun apelant în interfață.
- **Comportament așteptat:** fie un utilitar real (de exemplu suma încasată pe perioadă), fie eliminarea lui.
- **Pași de reproducere:** `GET /api/admin/money` cu token de staff → 200 și același corp de fiecare dată.
- **Evidență:** măsurător `ex3.json`; `api/src/routes/admin.ts:1254`.
- **Remediere propusă:** înlocuiți cu o agregare reală sau eliminați endpointul.
- **Criterii de verificare:** corpul răspunsului reflectă datele curente sau endpointul nu mai există.

### FN-P1-12 — Mecanisme fără ecran: enrolarea de admin și credentialele de panou

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/auth.ts:353`, `api/src/routes/admin.ts:218,254,287`, `api/src/services/panel/credentials.ts`
- **Comportament observat:** `POST /auth/enroll-admin` cere o cheie de enrolare și este singura cale de a crea un administrator în afara intervenției manuale, dar nu are niciun formular. `GET/POST/DELETE /admin/customers/:id/panel[/credential]` sunt complete și corecte, dar nu sunt accesibile din nicio pagină; tabelul `PanelCredential` rămâne gol în practică.
- **Comportament așteptat:** sau există o interfață, sau sunt documentate ca operațiuni de operare.
- **Pași de reproducere:** `POST /api/auth/enroll-admin` cu o cheie greșită → 401 „The enrollment key is not correct."; `GET /api/admin/customers/<id>/panel` cu token de staff → 200 (funcțional).
- **Evidență:** `api/src/routes/auth.ts:353`; `api/src/routes/admin.ts:218,254,287`; `grep` pe `web/src` — niciun apelant.
- **Remediere propusă:** adăugați un formular de credentială de panou în detaliul clientului sau documentați procedura în README-ul de operare.
- **Criterii de verificare:** un operator poate obține un token de panou din interfață sau din documentație.

### FN-P1-13 — `pterodactylUserId` este completat, dar API-ul îl întoarce mereu `null` clientului

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/auth.ts:118` (`publicUser`), `api/src/services/panel/identity.ts:107,132,144`
- **Comportament observat:** coloana `User.pterodactylUserId` este scrisă de bridge-ul de identitate, dar `publicUser` are `pterodactylUserId: null` codificat fix. Doar zona de admin o citește (`admin.ts:165`). Clientul nu poate afla niciodată identitatea sa în panou.
- **Comportament așteptat:** fie valoarea reală, fie absența ei din răspuns (nu un `null` fals).
- **Pași de reproducere:** `GET /api/auth/session` → `"pterodactylUserId":null`; `SELECT "pterodactylUserId" FROM "User"` → valoare nenulă pentru conturile legate de panou.
- **Evidență:** `api/src/routes/auth.ts:118`; `api/src/services/panel/identity.ts:107`.
- **Remediere propusă:** întoarceți valoarea reală sau eliminați câmpul din `publicUser`.
- **Criterii de verificare:** `/api/auth/session` reflectă starea reală a legăturii cu panoul.

### FN-P1-14 — Cotă și listă: `quantity` este ignorată în cotă și onorată în comandă

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/catalog.ts` (răspunsul cotă), `api/src/routes/orders.ts` (creare comandă), `api/src/services/pricing.ts`
- **Comportament observat:** `POST /api/catalog/quote` cu `quantity: 3` întoarce pentru linie `quantity: 1` și `total: 1500` (suma e corectă, câmpul de cantitate nu). `POST /api/orders` cu aceeași cerere salvează corect `quantity: 2`. Așadar, același concept este calculat în două locuri, cu rezultate diferite; și există încă un al treilea loc, `POST /billing/quote`, care are aceeași limită.
- **Comportament așteptat:** cantitatea din cotă să fie cea cerută, în toate cele trei puncte.
- **Pași de reproducere:**
  1. `POST /api/catalog/quote` cu `{"items":[{"productSlug":"audit-deployable","ram":512,"cpu":1,"disk":5,"quantity":3}]}` → 200, `items[0].quantity = 1`, `subtotal = 1500`.
  2. `POST /api/orders` cu `quantity: 2` → 201, `items[0].quantity = 2`, `total = 1000`.
- **Cauză root cause (confirmată):** `api/src/routes/catalog.ts` fixează `quantity: 1` în serializarea liniei, în loc să preia `item.quantity`.
- **Evidență:** `api/src/routes/catalog.ts` (blocul `quote`); `api/src/routes/orders.ts:69-88`; măsurători `exercise.json` și `ex3.json`.
- **Remediere propusă:** serializați `quantity` din `buildQuote` în toate cele trei cotări.
- **Criterii de verificare:** cotarea și comanda raportează aceeași cantitate.

### FN-P1-15 — Ecranul de prețuri nu are câmpuri pentru configurația recomandată

- **Severitate:** Low-Info
- **Modul afectat:** `web/src/admin/Pricing.tsx`
- **Comportament observat:** ecranul editează doar `baseAmount`, `ramPerGb`, `cpuPerUnit`, `diskPerGb` per produs. Nu există niciun câmp pentru configurația recomandată — în acord cu FN-P1-01, valoarea nu ar avea de unde veni.
- **Comportament așteptat:** dacă FN-P1-01 se repară, ecranul de prețuri trebuie să ofere câmpurile `default*`.
- **Pași de reproducere:** browser la `/admin/pricing` → 10 carduri de preț, fiecare cu 4 câmpuri numerice; niciun câmp de resurse recomandate.
- **Evidență:** captură browser `/admin/pricing`; `web/src/admin/Pricing.tsx`.
- **Remediere propusă:** a se vedea FN-P1-01.
- **Criterii de verificare:** prețurile recomandate pot fi editate din interfață.

### FN-P1-16 — Costul unui „upgrade" nu poate fi plătit în mediul de test

- **Severitate:** Low-Info
- **Modul afectat:** `web/src/app/InstanceDetail.tsx:290-315`, `api/src/services/upgrades.ts`
- **Comportament observat:** la redimensionare în sus, serverul creează o comandă `UPGRADE` și întoarce `requires_payment` + `checkoutUrl`; pagina afișează un panou „Payment needed" cu un buton către URL. În stiva izolată URL-ul conduce la pagina de facturare, care nu finalizează plata (FN-P1-03).
- **Comportament așteptat:** idem FN-P1-03.
- **Pași de reproducere:** `PUT /api/instances/<id>/resources` cu o configurație mai mare → răspuns cu `requires_payment`; restul depinde de FN-P1-03.
- **Evidență:** `web/src/app/InstanceDetail.tsx:304-305,375-380`; `api/src/services/upgrades.ts`.
- **Remediere propusă:** se rezolvă odată cu FN-P1-03.
- **Criterii de verificare:** upgrade-ul se finalizează în stiva de test.

### FN-P1-17 — Aliasuri de rute nefolosite (`files/archive`, `files/unarchive`, `startup` PATCH)

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/instance-server.ts:360,382`, `api/src/routes/instances.ts`
- **Comportament observat:** există `POST /instances/:id/files/archive` și `/files/unarchive` ca aliasuri de `/files/compress` și `/files/decompress`, plus `PATCH /instances/:id/startup` ca alias de `PUT`. Interfața folosește doar variantele `compress`/`decompress`/`PUT`.
- **Comportament așteptat:** o singură cale per acțiune.
- **Pași de reproducere:** enumerarea literalelor de cale din `web/src` — `/files/compress`, `/files/decompress`; `/files/archive` și `/files/unarchive` nu apar.
- **Evidență:** `api/src/routes/instance-server.ts:360,382`; `/tmp/bm-fn/fe-all.txt`.
- **Remediere propusă:** eliminați aliasurile sau documentați-le ca API public.
- **Criterii de verificare:** o singură rută per acțiune, sau un document care enumeră API-ul public.

### FN-P1-18 — Mesajul de blocaj este inexact pentru un produs care nu are niciodată imagine

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/services/availability.ts:63-65`, `web/src/lib/pricing-contract.ts:orderBlockers`
- **Comportament observat:** un produs cu `deployable=false` și fără ou primește două blocaje: „It has not been validated for deployment yet." și „Its image is not installed on the panel yet." Al doilea mesaj sugerează că o imagine a existat cândva; în realitate produsul nu are nicio mapare către ou.
- **Comportament așteptat:** un mesaj care corespunde realității („nu are încă un ou asociat").
- **Pași de reproducere:** produsul „Mutation product" din catalogul de test afișează în `/apps` ambele mesaje pentru starea „Coming soon".
- **Evidență:** `api/src/services/availability.ts:60-65`; captură browser `/apps`.
- **Remediere propusă:** deosebiți „lipsă de ou" de „imagine neinstalată".
- **Criterii de verificare:** mesajul corespunde cauzei reale.

### FN-P1-19 — O pagină își construiește propriul tabel în loc de componenta comună

- **Severitate:** Low-Info
- **Modul afectat:** `web/src/app/Domains.tsx:286` vs `web/src/lib/table.ts` + `web/src/ui-app.tsx`
- **Comportament observat:** 8 pagini folosesc `DataTable`/`TableColumn` din componenta comună; `app/Domains.tsx` scrie `<table className="w-full border-separate …">` cu `<colgroup>` propriu.
- **Comportament așteptat:** un singur fel de tabel, ca „the tables" să fie coerente.
- **Pași de reproducere:** `grep -rln "<table" web/src` → `app/Domains.tsx` și `ui-app.tsx` (componenta comună).
- **Evidență:** `web/src/app/Domains.tsx:286-300`.
- **Remediere propusă:** migrați tabelul de domenii la `DataTable`.
- **Criterii de verificare:** un singur stil de tabel în interfață.

### FN-P1-20 — Lista de sesiuni numește „A browser" orice client care nu este un browser

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/settings.ts:468`, parserul de User-Agent
- **Comportament observat:** sesiunile create cu `python-requests` (User-Agent absent) sunt afișate ca „A browser", iar cele reale ca „Chrome on Linux". Documentația recomandă folosirea cookie-ului de sesiune în scripturi, deci scripturile vor apărea ca browsere.
- **Comportament așteptat:** „Unknown client" sau „Script" pentru clienți necunoscuți.
- **Pași de reproducere:** 5 sesiuni listate în `/app/settings`: una „Chrome on Linux / This Device", patru „A browser" cu IP-uri diferite.
- **Evidență:** captură browser `/app/settings`; măsurător `exercise.json` (`devices=['A browser', …]`).
- **Remediere propusă:** etichetați explicit clienții necunoscuți.
- **Criterii de verificare:** sesiunile de script sunt distincte de cele de browser.

### FN-P1-21 — `currentPeriodEnd` rămâne `null` pentru un abonament activ

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/billing.ts:124`, `web/src/app/Billing.tsx`
- **Comportament observat:** după o plată reușită, `GET /billing/summary` întoarce `monthlyEstimate: 179` și abonamentul „Active", dar `currentPeriodEnd: null`; pagina afișează „CURRENT PERIOD ENDS — Not available yet". Documentația descrie „The period end tells you when the current period closes and when a cancellation would take effect".
- **Comportament așteptat:** data de încheiere a perioadei curente.
- **Pași de reproducere:** `POST /orders` → plată prin poarta locală → `GET /billing/summary` → `currentPeriodEnd: null`.
- **Evidență:** măsurător `ex4.json`; captură browser `/app/billing`.
- **Remediere propusă:** calculați sau preluați sfârșitul perioadei din abonament.
- **Criterii de verificare:** suma de facturare afișează o dată pentru abonamentele active.

### FN-P1-22 — Secțiunea „Platform" de pe pagina de pornire este o machetă

- **Severitate:** Low-Info
- **Modul afectat:** `web/src/home/Platform.tsx`
- **Comportament observat:** panoul „Platform" afișează jurnale, fișiere și domenii fictive; codul spune explicit „The mock is a picture" și „Replaced by real dashboard screenshots at launch". Nu există nicio acțiune.
- **Comportament așteptat:** acceptabil, dar trebuie marcat.
- **Pași de reproducere:** browser la `/` → secțiunea arată date care nu provin de la nicio instanță.
- **Evidență:** `web/src/home/Platform.tsx:22-25`.
- **Remediere propusă:** niciuna obligatorie; mențineți marcajul până la înlocuire.
- **Criterii de verificare:** marcajul vizibil cât timp macheta este în uz.

### FN-P1-23 — Funcțiile de instanță care depind de panou nu au putut fi exercitate

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/instance-server.ts` (12 taburi), `services/provisioning.ts`, `services/pterodactyl/*`
- **Comportament observat:** consola, fișierele, bazele de date, rețeaua, programările, startup-ul și setările instanței sunt implementate în API și în UI, dar toate trec prin API-ul Pterodactyl. În stiva izolată panoul nu are o instanță creată, iar provisionarea nu poate fi dusă la capăt (workerul nu rulează). Comanda a ajuns în `PAID`, dar rândul `Instance` a rămas `pending`.
- **Comportament așteptat:** verificare de capăt.
- **Pași de reproducere:** comanda plătită → `GET /api/instances` → instanță `pending`; `GET /api/instances/<id>/console` → fără ieșire.
- **Evidență:** măsurători `ex4.json` (`instances created by the paid order :: 4`, `status: pending`).
- **Remediere propusă:** nu este o remediere de cod; recomandat un mediu cu panou și worker.
- **Criterii de verificare:** o instanță provisionată până la `online`, cu cele 12 taburi populate.

### FN-P1-24 — Documentația nu menționează fila „Backups" a instanței

- **Severitate:** Low-Info
- **Modul afectat:** `web/src/pages/Docs.tsx` (secțiunea „Backups"), `web/src/app/instance/BackupsTab.tsx`
- **Comportament observat:** documentația afirmă „Blipmade does not take automatic backups of your data yet", în două locuri, în timp ce pagina instanței are o filă „Backups" care creează, restaurează și descarcă arhive ale fișierelor containerului prin panou. Nu este o contradicție strictă („automatic" vs. manual), dar utilizatorul nu găsește în documentație funcția pe care o vede în interfață.
- **Comportament așteptat:** documentația să descrie fila existentă.
- **Pași de reproducere:** `/app/instances/<id>` → fila „Backups"; `/docs` → secțiunea „Backups" nu o menționează.
- **Evidență:** `web/src/pages/Docs.tsx` secțiunile `backups`; `web/src/app/instance/BackupsTab.tsx:26-32`.
- **Remediere propusă:** adăugați pagina de documentație „Backups and snapshots" cu instrucțiunile de utilizare.
- **Criterii de verificare:** documentația descrie funcția de backup existentă.

### FN-P1-25 — Starea domeniilor nu poate fi confirmată până la capăt fără DNS real

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/domains.ts:209-460`, `api/src/services/dns.ts`, `api/src/services/gateway.ts`
- **Comportament observat:** fluxul (reservare hostname → publicare TXT → verificare → rutare Caddy) este complet în cod; nu poate fi exercitat fără un domeniu real și fără gateway. Fără gateway, domeniul rămâne `PENDING_DNS` cu un mesaj explicit.
- **Comportament așteptat:** verificare de capăt cu un domeniu de test.
- **Pași de reproducere:** `GET /api/domains` → listă goală; fără instanță provisionată nu se poate crea un domeniu.
- **Evidență:** `api/src/services/dns.ts:60-88`; `api/src/routes/domains.ts:382-430`.
- **Remediere propusă:** nu este o remediere de cod; recomandat un domeniu de test și un gateway.
- **Criterii de verificare:** un hostname ajunge în `ACTIVE` cu o înregistrare TXT publicată.

### FN-P1-26 — Nu se poate vedea nicio factură după o plată

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/billing.ts:322`, `api/src/services/billing.ts` (sweep)
- **Comportament observat:** după plata unei comenzi, lista de facturi este goală („No invoices yet. Invoices appear here after your first payment") și `currentPeriodEnd` este `null`. Facturile sunt emise la închiderea perioadei, de către sweep-ul de facturare al workerului, care nu rulează în stiva izolată.
- **Comportament așteptat:** pentru o plată deja efectuată, măcar o factură cu „perioada curentă" ar fi utilă.
- **Pași de reproducere:** plată reușită → `GET /api/billing/invoices` → `{"invoices":[]}`.
- **Evidență:** măsurător `ex4.json`; captură browser `/app/billing`.
- **Remediere propusă:** emiterea unei facturi provizorii la plată, sau clarificarea textului.
- **Criterii de verificare:** clientul vede o factură asociată plății sale.

### FN-P1-27 — Lista de sesiuni afișează „no activity recorded" pentru o sesiune abia creată

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/settings.ts:468-487`
- **Comportament observat:** o sesiune creată prin API (fără cerere ulterioară) apare cu „no activity recorded", deși are un `lastSeenAt`. Doar sesiunile folosite primesc o activare.
- **Comportament așteptat:** data ultimei activități să fie afișată consecvent.
- **Pași de reproducere:** sesiune creată prin `POST /api/auth/login` fără cereri ulterioare → „no activity recorded".
- **Evidență:** captură browser `/app/settings` (sesiunea cu IP 10.77.250.1).
- **Remediere propusă:** inițializați `lastSeenAt` la creare sau afișați data creării.
- **Criterii de verificare:** fiecare sesiune are un timp de activitate.

### FN-P1-28 — Permisiunile nu au efect asupra membrilor cu rol `ADMIN`

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/lib/permissions.ts:39-45`, `web/src/admin/Staff.tsx`
- **Comportament observat:** `hasPermission()` întoarce `true` pentru orice permisiune dacă `role === 'ADMIN'`. Prin urmare, editarea listei de permisiuni a unui administrator prin `/admin/staff` nu schimbă nimic în ceea ce privește accesul acelui membru, deși interfața salvează lista. Ecranul arată totuși „— / 21" pentru administratori, deci există o incoerență vizuală între ce se salvează și ce se aplică.
- **Comportament așteptat:** fie lista de permisiuni să nu poată fi editată pentru administratori, fie editarea să aibă efect.
- **Pași de reproducere:** membru cu `role='ADMIN'` și `permissions=['audit.read']` → `GET /admin/products` → 200 (nu 403), spre deosebire de un membru `STAFF` cu aceeași listă → 403.
- **Cauză root cause (confirmată):** ocolirea pe rol este intenționată și documentată în `lib/permissions.ts:39`, dar nu este reflectată în interfața de personal.
- **Evidență:** `api/src/lib/permissions.ts:39-45`; măsurător `ex3.json` (ADMIN → 200) vs `ex4.json` (STAFF → 403).
- **Remediere propusă:** afișați explicit „Administratorii au toate permisiunile" și dezactivați editarea listei pentru ei.
- **Criterii de verificare:** interfața nu promite o setare care nu are efect.

### FN-P1-29 — Validarea mărește inutil unele erori

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/admin.ts:381` (`confirm-collection`), `api/src/routes/admin.ts:408` (`refund`)
- **Comportament observat:** `POST /admin/invoices/<id>/confirm-collection` cere un câmp `reference` și răspunde 400 „reference: Required" înainte de a verifica dacă factura există; `POST /admin/orders/<id>/refund` cere `reason`. Ambele sunt valide ca design, dar întâlnesc erori de validare înainte de cele de business, ceea ce ascunde cauza reală unui ID greșit.
- **Comportament așteptat:** verificarea existenței înaintea validării câmpurilor de formular, sau erori de validare care se referă la obiect, nu la formular.
- **Pași de reproducere:** `POST /api/admin/invoices/xx/confirm-collection` cu `{}` → 400 `{"fields":{"reference":"Required"}}`; cu `{"reference":"ref-1"}` → ar ajunge la „factura nu există".
- **Evidență:** măsurător `ex3.json`; `api/src/routes/admin.ts:381`.
- **Remediere propusă:** reordonarea validărilor.
- **Criterii de verificare:** un ID inexistent produce o eroare despre obiect, nu despre formular.

### FN-P1-30 — Sonda internă `/internal/not-a-real-route` este înregistrată ca rută reală

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/auth.ts:419`
- **Comportament observat:** înregistrarea unei rute care trebuie să nu existe are ca efect secundar un handler suplimentar în tabelul de rute al serverului. Nu are efect funcțional, dar mărește suprafața API-ului.
- **Comportament așteptat:** sondele de test să nu fie înregistrate în buildul de producție.
- **Pași de reproducere:** `GET /api/internal/not-a-real-route` → 404 cu forma de eroare a platformei (diferit de 404-ul necunoscut).
- **Evidență:** `api/src/routes/auth.ts:419`.
- **Remediere propusă:** înregistrați sondele doar când `env.isTest`.
- **Criterii de verificare:** sonda nu apare în tabela de rute a buildului de producție.

### FN-P1-31 — Anularea unei comenzi nu are niciun ecran

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/orders.ts:198`
- **Comportament observat:** `POST /orders/:id/cancel` este implementat și răspunde 204, dar nicio pagină nu îl apelează: clientul nu poate anula o comandă neplătită din interfață.
- **Comportament așteptat:** fie un buton „Cancel order" pe pagina comenzii, fie o notă în documentație.
- **Pași de reproducere:** `POST /api/orders/<id>/cancel` → 204; `grep` în `web/src` → niciun apelant.
- **Evidență:** măsurător `exercise.json`; `/tmp/bm-fn/fe-all.txt`.
- **Remediere propusă:** adăugați butonul pe pagina comenzii sau documentați intenția.
- **Criterii de verificare:** clientul poate anula o comandă neplătită din interfață, sau se documentă că nu se poate.

### FN-P1-32 — Stiva izolată folosește același Redis ca producția

- **Severitate:** Low-Info
- **Modul afectat:** mediul de test (`REDIS_URL=redis://localhost:6379`), `api/src/lib/rate-limit.ts`
- **Comportament observat:** containerul `blipmade-redis-1` publică `127.0.0.1:6379`, iar stiva izolată folosește tot `localhost:6379`. Limitarea de rată este în memorie (per-proces), dar Redisul este comun: cheile cozilor și ale limitatorului sunt comune cu producția. Pe lângă riscul de coliziune, stiva de test a împărțit contorul de limite cu cea de producție (observat: 429 pe autentificare în timp ce testele ruleau).
- **Comportament așteptat:** stiva izolată cu un Redis propriu.
- **Pași de reproducere:** `docker exec blipmade-redis-1 env | grep REDIS` vs. `/proc/<pid-api>/environ | grep REDIS_URL` → ambele `redis://…:6379`; `ss -ltnp | grep 6379` → un singur ascultător.
- **Evidență:** ieșirile shell de mai sus; `api/src/lib/rate-limit.ts` (cheia `request.ip:run`).
- **Remediere propusă:** alocați un Redis și o coadă separate pentru stiva de test.
- **Criterii de verificare:** stiva izolată nu mai atinge Redisul de producție.

### FN-P1-33 — Limita de autentificare numără și eșecurile, dar mesajul nu spune nimic

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/routes/auth.ts:86-95`, `api/src/lib/rate-limit.ts`
- **Comportament observat:** după 10 încercări pe cont în 15 minute, răspunsul este 429 „Too many requests. Try again shortly.", fără indicarea duratei de așteptare. Conturile de test au fost blocate în timpul auditului, ceea ce a impus crearea unor conturi noi pentru fiecare rundă.
- **Comportament așteptat:** un mesaj cu timpul de așteptare și un contor afișat (de exemplu „5 încercări rămase").
- **Pași de reproducere:** 11× `POST /api/auth/login` pe același cont → 429.
- **Evidență:** măsurător `exercise.json` (`[RETRY] … login cust=429`); `api/src/routes/auth.ts:86-95`.
- **Remediere propusă:** includeți timpul de așteptare în răspuns.
- **Criterii de verificare:** răspunsul 429 spune când se poate reîncerca.

### FN-P1-34 — Un produs „Coming soon" fără ou primește două mesaje de blocaj

- **Severitate:** Low-Info
- **Modul afectat:** `api/src/services/availability.ts:60-65`
- **Comportament observat:** pentru un produs cu `deployable=false` și fără ou, lista de blocaje conține două mesaje („It has not been validated for deployment yet." + „Its image is not installed on the panel yet."), iar interfața le afișează pe amândouă sub starea „Coming soon".
- **Comportament așteptat:** un singur mesaj, corespunzător cauzei dominante.
- **Pași de reproducere:** produsul „Mutation product" din catalog: starea „Coming soon" cu ambele mesaje.
- **Evidență:** `api/src/services/availability.ts:60-65`; captură browser `/apps`.
- **Remediere propusă:** afișați primul blocaj relevant, nu toate.
- **Criterii de verificare:** un singur mesaj pe produs.

---

## 5. Modele și permisiuni nefolosite

### 5.1 Modele de date

Niciun model din `api/prisma/schema.prisma` nu este complet nefolosit de API — toate sunt referite. Dar
**șase modele nu sunt accesibile din nicio interfață**, deci rămân goale în practică:

| Model | Stare | De ce nu e folosit |
|---|---|---|
| `Attachment` | gol (0 rânduri) | se populează doar prin `POST /tickets/:id/attachments`, pe care UI-ul nu îl apelează (FN-P1-02) |
| `PanelCredential` | gol | doar prin D01–D03, fără ecran (FN-P1-12) |
| `WebhookEvent` | gol în test | doar prin D25/D26 (fără ecran) și de `services/billing.ts:755` |
| `MailDelivery` | 5 rânduri | contorizat doar în `/health` și în `GET /admin/email/delivery` (fără ecran) |
| `ProvisioningJob` | gol în test | scris doar de worker; în stiva izolată workerul nu rulează |
| `Payment` | populat | apare în `GET /billing/summary` prin abonament — folosit |

Două **coloane** sunt în aceeași situație:

- `Promotion.usedCount` — este afișată în admin, dar nu este contorul care impune plafonul (FN-P1-05);
- `Product.defaultRam/defaultCpu/defaultDisk` — scrise o singură dată, la creare, egale cu minimul, și
  imposibil de modificat ulterior (FN-P1-01).

### 5.2 Permisiuni

Cele **21 de permisiuni** din `api/src/lib/permissions.ts` sunt toate protejate și toate au fost
verificate ca fiind aplicate unui membru cu rol `STAFF`:

| Permisiune | Unde e impusă | Verificat |
|---|---|---|
| `customers.read` | `GET /admin/overview`, `/admin/customers`, `/admin/customers/:id`, `/admin/customers/:id/panel` | 403 pentru STAFF redus |
| `customers.write` | `POST /admin/customers/:id/suspend` | citit |
| `orders.read` | `GET /admin/orders` | 403 |
| `orders.write` | `POST /admin/invoices/:id/confirm-collection`, `POST /admin/orders/:id/refund` | 403 |
| `services.read` | `GET /admin/services` | 403 |
| `services.write` | credentiale de panou, `/admin/instances/:id/retry`, `/admin/instances/import` | 403 |
| `products.read` | `GET /admin/products` | 403 |
| `products.write` | `POST/PATCH/DELETE /admin/products` | 403 |
| `pricing.read` | `GET /admin/pricing`, `GET /admin/money` | 403 |
| `pricing.write` | `PUT /admin/pricing/:id`, `POST /admin/instances/reconcile-prices` | 403 |
| `tickets.read` | `GET /admin/tickets`, biletele proprii | 403 |
| `tickets.write` | `POST /admin/tickets/:id/assign`, răspunsuri la bilete | 403 |
| `promotions.read` | `GET /admin/promotions` | 403 |
| `promotions.write` | `POST/PATCH /admin/promotions` | 403 |
| `infrastructure.read` | `GET /admin/infrastructure` | 403 |
| `infrastructure.write` | `POST /admin/infrastructure/sync` | citit |
| `audit.read` | `GET /admin/audit` | **200** (singura permisă păstrată) |
| `staff.read` | `GET /admin/staff` | 403 |
| `staff.write` | `PUT /admin/staff/:userId` | citit |
| `settings.read` | `GET /admin/settings`, `GET /admin/email/delivery` | 403 |
| `settings.write` | `PUT /admin/settings` | citit |

Observații:

1. **Nicio acțiune nu este fără permisiune.** Nu am găsit niciun endpoint de scriere care să fie
   protejat doar de `requireStaff` (fără o permisiune concretă). Singurele rute fără permisiune
   sunt interne (`/internal/*`), publice prin design (`/health`, `/status`, `/catalog/*`,
   `/webhooks/stripe`) sau publice prin clasa lor (`/tickets/:id/replies` folosește
   `requireTicketPermission`, care verifică rolul și proprietatea biletului).
2. **Rolul `ADMIN` ocolește toate cele 21 de permisiuni** prin proiectare și documentat
   (`lib/permissions.ts:39-42`). Lista de permisiuni a unui administrator nu are niciun efect
   (FN-P1-28).
3. **Două permisiuni acoperă arii neintuitive:** `customers.read` este necesară pentru tabloul de
   bord (`GET /admin/overview`), iar `settings.read` protejează și livrarea de e-mail
   (`GET /admin/email/delivery`). Nu există permisiuni dedicate pentru metrici, pentru backup-uri
   sau pentru infrastructura de e-mail.
4. **Blocajele de rol și de permisiune sunt distincte și amândouă sunt active:** un client primește
   „Staff access only." (rol), iar un membru STAFF fără permisiune primește „Your role does not allow
   \"products.read\"." (permisiune).

---

## 6. Funcții anunțate, neimplementate

### 6.1 Promisiuni ale documentației care nu au corespondent în interfață

| Promisiune | Unde e anunțată | Starea reală | Clasă |
|---|---|---|---|
| „The metrics page shows the memory, the CPU and the network of the instance" | `/docs` → „Check the metrics" | Nu există pagină de metrici; consumul nu e afișat nicăieri | M (FN-P1-04) |
| „Watch the metrics page for a day before you resize. It shows the real memory and CPU use" | `/docs` → „Getting it wrong" | idem | M (FN-P1-04) |
| Atașarea unui fișier la un bilet | interfața de bilet (selector de fișier) | Se transmite doar metadatele; fișierul nu ajunge nicăieri | MP (FN-P1-02) |
| „The period end tells you when the current period closes" | `/docs` → „The billing page" | `currentPeriodEnd` este `null` pentru abonamentele active | B (FN-P1-21) |
| Fila „Backups" a instanței | interfața, nemenționată în documentație | funcționează; documentația spune că platforma nu face backup-uri | PW (FN-P1-24) |

### 6.2 Funcții anunțate ca „Planned" (declarate corect, nu sunt defecte)

Documentația marchează explicit, ca platforma însăși o cere în mai multe locuri:

- **Chei API** — „Programmatic keys are *Planned*. The API does not expose key management." Nicio
  cheie, niciun model, niciun buton: comportamentul anunțat este exact cel real.
- **Certificate SSL automate** — „Automatic certificate issuance for attached hostnames is
  *Planned*. Blipmade does not hand out certificates yet." Nicio logică de emitere de certificate în
  cod: comportamentul anunțat este exact cel real.
- **Backup-uri automate** — „Blipmade does not take automatic backups of your data yet." Corect: nu
  există backup automat al datelor clienților (există însă scripturile de backup ale platformei,
  neprogramate — FN-P1-09).
- **Istoric de disponibilitate de 90 de zile** — „90-day uptime history is not available yet." Corect.
- **Cote pentru trafic, bilete, conturi, număr de instanțe** — enumerate ca „not available yet".
  Corect: nu există astfel de limite în cod.

### 6.3 Promisiuni ale paginii de pornire

- **„Apps from €1.00/mo Databases from €4.49/mo"** — derivat din catalog prin
  `useCatalogSummary()`; valoarea se schimbă odată cu catalogul. Corect.
- **Secțiunea „Platform"** — machetă declarată în cod (FN-P1-22).
- **Simulatorul „Studio"** — documentat explicit ca „preview: nothing is created and nothing is
  billed"; prețurile și disponibilitatea vin din catalog. Corect.
- **Butonul „Deploy"** — duce la primul produs real deployabil (`useDeployEntry()`), sau spune că
  nu există niciunul. Corect.

### 6.4 Funcții de backend fără corespondent în interfață (reitere)

Cele 30 de endpoint-uri fără apelant din §3.4 sunt, în esență, **funcții anunțate numai prin
cod**: există în API, sunt corecte, dar nimeni nu le poate ajunge. Cele mai notabile:

- `GET /admin/money` (stub cu valoare fixă);
- `POST /auth/enroll-admin` (crearea primului administrator);
- `GET/POST/DELETE /admin/customers/:id/panel[/credential]` (legătura cu panoul);
- `POST /tickets/:id/attachments` și `GET /tickets/:id/attachments/:attachmentId` (atașamentele reale);
- `GET /instances/:id/metrics` (metricile promise în documentație);
- `POST /orders/:id/cancel` (anularea unei comenzi);
- `GET /billing/payment-state`, `POST /billing/quote`, `POST /billing/subscriptions/:id/renew`,
  `GET /billing/instances/:id/export`;
- `GET /admin/email/delivery`, `GET /webhooks/stripe/failed`, `POST /webhooks/stripe/replay`,
  `POST /admin/instances/import`, `POST /admin/instances/reconcile-prices`,
  `POST /admin/invoices/:id/confirm-collection`.

---

## 7. Ce nu am putut verifica

| Zonă | De ce | Ce ar trebui făcut |
|---|---|---|
| Provisionarea până la `online` | Workerul nu rulează în stiva izolată; panoul nu are noduri utilizabile | Stivă cu worker + panou; rularea unui job `provision` complet |
| Cele 12 taburi ale instanței | Toate trec prin API-ul Pterodactyl și cer o instanță provisionată | Stivă cu panou și o instanță activă |
| WebSocket-ul consolei | Fără server, nu s-a primit niciun cadru; s-a verificat doar că clientul se conectează | Consolă pe o instanță provisionată |
| Stripe cu cheie reală | Nu există cheie; `stripe=not_configured` | Mediu cu cheie de test Stripe |
| Certificatele TLS ale domeniilor | Nu există domeniu de test | Un domeniu real + gateway Caddy |
| Livrarea e-mailului | `SMTP_URL` gol, transportul scrie în fișier | Un relay SMTP de test |
| Copiile de rezervă | Scripturile există, timerul nu e instalat, nu există țintă off-site | Instalarea timerului + drill de restaurare |
| Firefox / WebKit | Binarele nu există pe VM | Rulearea matricei pe celelalte două motoare |
| Istoricul de schimbări | Nu există `.git` în copia de lucru și nu s-a rulat git | Compararea cu ramura de referință |
| Comportamentul în sarcină | Nu s-a rulat nicio încărcare | Test de sarcină pe cotă, autentificare și cozi |
| Starea de producție | Interzis explicit; nu s-a citit și nu s-a scris în `blipmade` | — |
| Comportamentul după `TRUNCATE` | Baza a fost golită de un proces `vitest` concurent în timpul auditului; unele ID-uri de obiect au devenit invalide | Rulare într-o stivă dedicată, fără suita de teste concurentă |

---

## 8. Rezumat numeric

| Clasă | Număr de funcții |
|---|---|
| `IMPLEMENTED AND WORKING` (F) | 41 |
| `IMPLEMENTED BUT BROKEN` (B) | 4 |
| `INTERFACE ONLY` (I) | 0 |
| `BACKEND ONLY` (BA) | 20 |
| `DEAD OR UNREACHABLE` (D) | 5 |
| `STUBBED` (S) | 2 |
| `MISLEADING PLACEHOLDER` (MP) | 1 |
| `PARTIALLY WIRED` (PW) | 22 |
| `MISSING` (M) | 1 |
| **Total rânduri în matrice** | **96** |

| Severitate | Număr de constatări |
|---|---|
| Critical / P0 | 0 |
| High | 3 (FN-P1-01, FN-P1-02, FN-P1-03) |
| Medium | 7 (FN-P1-04 … FN-P1-10) |
| Low-Info | 24 (FN-P1-11 … FN-P1-34) |
| **Total** | **34** |

*Cele 34 de constatări includ și observații de coerență și de igienă (Low-Info); numai cele 10
constatări cu severitate High sau Medium reprezintă un defect de funcționare sau o promisiune
neîndeplinită.*
