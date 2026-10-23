# 06 — Matricea rutelor

**Data:** 2026-10-23 · **Sistem:** `https://blipmade.com`, commit `7df3973` · **Roluri măsurate:** anonim, client (`qa.headless.one@example.test`), staff (`browser-admin@blipmade.test`).

**Cum a fost măsurat:** fiecare rută a fost vizitată de trei ori, cu aceleași sesiuni (cookie `bm_session` reutilizat din `audit/_tools/session-bootstrap.mjs`), la 1280×900. Pentru fiecare rută s-au înregistrat: URL-ul final, apelurile de API cu statusurile lor, textul paginii, landmark-urile, starea goală, și **stările de eroare și de încărcare obținute prin anularea, respectiv întârzierea răspunsului API în browser** — serverul nu a fost atins. Scriptul: `audit/_tools/route-inventory.mjs`; raportul brut: `audit/_tools/route-report.json`.

**Acoperire:** `web/src/routes.tsx:85-121` declară **33 de tipare de rută**. Cu pagina de pornire `/` (`routes.tsx:225`) și pagina 404 (`routes.tsx:267-277`), sunt **35 de intrări de rută**. Au fost măsurate **36 de URL-uri** — cele 35 plus încă un slug al tiparului `/apps/:slug`, ca să fie văzută și pagina unui produs care nu se poate deploya.

---

## 1. Gardurile, măsurate

Gardurile sunt în `web/src/auth-guard.ts` și `web/src/routes.tsx:123-160`.

| Gard | Cod | Ce se întâmplă, măsurat |
|---|---|---|
| `guestOnly` | `routes.tsx:86-87` | autentificat → redirecționat: clientul ajunge la `/app`, staff-ul la `/admin`. Anonimul rămâne pe pagină. `VERIFIED` |
| `session` | `routes.tsx:97-106` | anonim → `/login?next=<calea originală, url-codată>`. Codificarea e corectă: `/login?next=%2Fapp%2Finstances%2Fcmvkbgm9h0001r18096ep5jzl`. `VERIFIED` |
| `staff` | `routes.tsx:108-120` | anonim → `/login?next=…`. Clientul (rol `CUSTOMER`) **rămâne pe URL** și vede starea de eroare „Staff access only — Your account does not have permission to open the admin area." `VERIFIED` |
| `none` | restul | deschis tuturor |

**`/deploy/:slug`** e în categoria „none" dar se comportă ca protejat: `DeployRedirect` (`routes.tsx:70-82`) cere o sesiune ca să poată crea o comandă, deci anonimul ajunge la `/login?next=%2Fapp%2Fdeploy%2Fdiscord-bot`. `VERIFIED`

**Trei observații despre garduri:**

1. **Zona de client nu cere rolul de client.** `area: 'customer'` verifică doar *există o sesiune* (`routes.tsx:97`), nu rolul. Un cont de staff poate deschide `/app`, `/app/instances`, `/app/billing` și vede acolo **contul său de client, gol** — nu o eroare. `VERIFIED` (contul staff a încărcat `/app` cu `GET /api/instances→200`).
2. **Butonul „Retry" al stării de acces interzis minte.** `ErrorState` (`web/src/ui-app.tsx:509-545`) are eticheta butonului **hard-codată** pe „Retry". Gardul îl folosește cu `onRetry={() => navigate('/app')}` — deci butonul care înseamnă „Reîncearcă" te duce de fapt în panoul client. `VERIFIED` (textul capturat în `route-report.json`: `err=['Retry']`).
3. **Staff-ul nu poate inspecta o instanță.** `/admin/services` nu are niciun link către o instanță (singurele linkuri sunt către clienți), și nu există rută `/admin/services/:id`. Singurul URL de instanță este în zona de client, unde API-ul aplică deținerea: `GET /api/instances/cmvkbgm9h0001r18096ep5jzl` → **404** pentru staff → „We could not load this instance — Instance not found." `VERIFIED`

---

## 2. Matricea completă

Legendă: **API** = apelurile măsurate în rețea. **Stări** = starea goală / starea de eroare / starea de încărcare, obținute pe calea reală (rândul „staff" e completat pentru toate rutele de staff; rândurile de client și anonim sunt completate unde e relevant).

### 2.1 Publice și de autentificare

| Rută | Componentă | Gard | API | Anonim | Autentificat | Stări | În navigație |
|---|---|---|---|---|---|---|---|
| `/` | `Home` (`routes.tsx:225`) | `none` | `GET /api/auth/session`, **`GET /api/catalog/products` × 5** | ✅ | ✅ | gol: niciun produs deployabil → „Not available yet"; eroare: `ErrorState`; încărcare: schelete | da (brand-ul) |
| `/login` | `pages/Login` | `guestOnly` | `GET /api/auth/session`, `GET /api/catalog/products` | ✅ | → `/app` (client) / `/admin` (staff) | gol: n/a; eroare: `role="alert"` sub câmp; încărcare: buton „Working…" | da, „Log in" |
| `/register` | `pages/Register` | `guestOnly` | `GET /api/auth/session`, `GET /api/catalog/products` | ✅ | → `/app` / `/admin` | ca la `/login` | da, „Get started" |
| `/forgot-password` | `pages/ForgotPassword` | `none` | `GET /api/auth/session`, `GET /api/catalog/products` | ✅ | ✅ (rămâne pe pagină) | eroare: `role="alert"`; trimiterea e blocată de transportul `file` | da, din `/login` |
| `/reset-password` | `pages/ResetPassword` | `none` | `GET /api/auth/session`, `GET /api/catalog/products` | ✅ | ✅ | eroare: `role="alert"` („That reset link is invalid or has expired") | nu |
| `/verify-email` | `pages/VerifyEmail` | `none` | `GET /api/auth/session`, `GET /api/catalog/products` | ✅ | ✅ | eroare: „This confirmation link is invalid or has expired." | nu (link din mail) |
| `/docs` | `pages/Docs` | `none` | `GET /api/auth/session`, `GET /api/catalog/products` × 2 | ✅ | ✅ | gol: n/a; eroare: `ErrorState`; încărcare: schelete | da, „Docs" |
| `/status` | `pages/Status` | `none` | `GET /api/auth/session`, `GET /api/status` | ✅ | ✅ | gol: „All systems operational"; eroare: `ErrorState`; încărcare: schelete | da, „Status" |
| `/apps` | `CatalogIndex` (`app/ProductPage.tsx:52`) | `none` | `GET /api/auth/session`, `GET /api/catalog/products` × 2 | ✅ | ✅ | **gol: catalogul arată 8 carduri goale, identice cu 8 carduri de produs**; eroare: `ErrorState`; încărcare: aceleași 8 carduri goale | da, „Apps" |
| `/apps/:slug` | `app/ProductPage` | `none` | `GET /api/auth/session`, `GET /api/catalog/products/:slug` | ✅ | ✅ | **404**: „This product does not exist."; eroare: `ErrorState` + „Back to the catalog"; încărcare: `LoadingBlock` „Loading the product" | da, din catalog |
| `/deploy/:slug` | `DeployRedirect` (`routes.tsx:70-82`) | `none` | `GET /api/auth/session`, `GET /api/catalog/products/:slug` | → `/login?next=%2Fapp%2Fdeploy%2Fdiscord-bot` | → `/app/deploy/:slug` | — | da, „Deploy" din catalog |

### 2.2 Zona de client

| Rută | Componentă | Gard | API | Anonim | Autentificat (client) | Stări | În navigație |
|---|---|---|---|---|---|---|---|
| `/app` | `app/Overview` | `session` | `GET /api/auth/session`, `GET /api/instances`, `GET /api/catalog/products`, `GET /api/instances/:id/events` | → `/login?next=%2Fapp` | ✅ | gol: „No apps yet" + CTA; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[0]` „Overview" |
| `/app/instances` | `app/Instances` | `session` | `GET /api/auth/session`, `GET /api/instances` | → `/login?next=…` | ✅ | gol: „No apps yet"; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[2]` „Apps & databases" |
| `/app/instances/:id` | `app/InstanceDetail` | `session` | `GET /api/auth/session`, `GET /api/instances/:id`, `…/events`, `…/resources` | → `/login?next=…` | ✅ | **404** (alt client): „We could not load this instance"; **eroare**: `ErrorState`; **încărcare**: schelete + `aria-busy` | din `/app/instances` |
| `/app/deploy` | `app/DeployCatalog` | `session` | `GET /api/auth/session`, `GET /api/catalog/products` | → `/login?next=…` | ✅ | gol: „Nothing is available yet"; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[1]` „Deploy" |
| `/app/deploy/:slug` | `app/Deploy` | `session` | `GET /api/auth/session`, `GET /api/catalog/products/:slug`, **`POST /api/catalog/quote`** | → `/login?next=…` | ✅ | **404**: „This product is not available."; eroare: `ErrorState`; încărcare: `LoadingBlock` „Loading the product" | din `/app/deploy` |
| `/app/domains` | `app/Domains` | `session` | `GET /api/auth/session`, `GET /api/domains`, `GET /api/instances` | → `/login?next=…` | ✅ | **gol**: „No domains yet"; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[3]` „Domains" |
| `/app/billing` | `app/Billing` | `session` | `GET /api/auth/session`, `GET /api/billing/subscriptions`, `…/invoices`, `…/summary` | → `/login?next=…` | ✅ | **gol**: „No subscriptions yet" + „No invoices yet"; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[4]` „Billing" |
| `/app/tickets` | `app/Tickets` | `session` | `GET /api/auth/session`, `GET /api/tickets/categories`, `GET /api/tickets` | → `/login?next=…` | ✅ | **gol**: „No tickets yet" + „Open your first ticket"; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[5]` „Support" |
| `/app/tickets/:id` | `app/TicketDetail` | `session` | `GET /api/auth/session`, `GET /api/tickets/:id` | → `/login?next=…` | ✅ | **404**: „This ticket does not exist."; eroare: `ErrorState`; încărcare: schelete | din `/app/tickets` |
| `/app/settings` | `app/Settings` | `session` | `GET /api/auth/session`, `GET /api/settings` | → `/login?next=…` | ✅ | gol: n/a; eroare: `ErrorState`; încărcare: schelete | `CUSTOMER_NAV[6]` „Settings" |

### 2.3 Zona de staff

Toate rutele de staff au același comportament de gard: **anonim → `/login?next=…`**; **client → starea „Staff access only"** (rămâne pe URL). Diferențele dintre ele sunt în date, în stări și în navigație.

| Rută | Componentă | API (staff) | Starea goală | Starea de eroare (API anulat) | Starea de încărcare (API întârzuit) | În navigație |
|---|---|---|---|---|---|---|
| `/admin` | `admin/Overview` | `GET /api/admin/overview` | „CUSTOMERS 4", „INSTANCES 3" + tabelul comenzilor gol („No orders yet") | `ErrorState` „Something went wrong" + buton „Retry" | schelete (`aria-busy="true"`, `role="status"`) | `ADMIN_NAV[0]` „Dashboard" |
| `/admin/customers` | `admin/Customers` | `GET /api/admin/customers` | „4 customers" — **necompletat**: contul de test are clienți | `ErrorState` | schelete | `ADMIN_NAV[1]` „Customers" |
| `/admin/customers/:id` | `admin/CustomerDetail` | `GET /api/admin/customers/:id` | „No invoices" + „No subscriptions" + „No instances" | `ErrorState` „This customer does not exist." (404) | schelete | din `/admin/customers` |
| `/admin/orders` | `admin/Orders` | `GET /api/admin/orders` | „5 orders" cu 5 rânduri; filtrul de stare „All" | `ErrorState` | schelete | `ADMIN_NAV[2]` „Orders" |
| `/admin/services` | `admin/Services` | `GET /api/admin/services` | „3 services" cu 3 rânduri; **fără niciun link către instanță** | `ErrorState` | schelete | `ADMIN_NAV[3]` „Services" |
| `/admin/products` | `admin/Products` | `GET /api/admin/products` | „5 products" | `ErrorState` | schelete | `ADMIN_NAV[4]` „Catalog" |
| `/admin/pricing` | `admin/Pricing` | `GET /api/admin/pricing` | „5 prices" | `ErrorState` | schelete | `ADMIN_NAV[5]` „Pricing" |
| `/admin/tickets` | `admin/Tickets` | `GET /api/admin/staff`, `GET /api/admin/tickets` | „14 tickets in the queue" / „No ticket open" | `ErrorState` | schelete | `ADMIN_NAV[6]` „Support queue" |
| `/admin/promotions` | `admin/Promotions` | `GET /api/admin/promotions` | **„0 promotions" / „No promotions yet"** | `ErrorState` | schelete | `ADMIN_NAV[7]` „Promotions" |
| `/admin/infrastructure` | `admin/Infrastructure` | `GET /api/admin/infrastructure` | **„0 nodes, 0 eggs"** | `ErrorState` | schelete | `ADMIN_NAV[8]` „Infrastructure" |
| `/admin/audit` | `admin/Audit` | `GET /api/admin/audit` | „300 audit entries" | `ErrorState` | schelete | `ADMIN_NAV[9]` „Audit log" |
| `/admin/staff` | `admin/Staff` | `GET /api/admin/staff` | „2 staff members" | `ErrorState` | schelete | `ADMIN_NAV[10]` „Staff" |
| `/admin/settings` | `admin/Settings` | `GET /api/admin/settings` | **„0 settings"** | `ErrorState` | schelete | `ADMIN_NAV[11]` „Settings" |
| `/` (404) | `pages/NotFound` (`routes.tsx:267-277`) | `GET /api/auth/session` | „This page does not exist." + „Back to the home page" | — | — | nu |

---

## 3. Ce nu se vede în tabel, dar contează

### 3.1 Catalogul de pe `/apps` arată gol cât timp se încarcă

Starea de încărcare a catalogului este **8 dreptunghiuri goale** (`Skeleton h-[190px]`), fără text și fără niciun indicator vizual. Sunt exact la fel ca 8 carduri de produs fără conținut. Timpul real de încărcare e sub un secundă (`firstText` 523–596 ms, măsurat de trei ori), deci problema **nu e viteza, ci starea de așteptare**. `VERIFIED` — `audit/screenshots/apps-catalog-loading-1280.png` (captură în starea de încărcare) vs. `audit/screenshots/apps-check-1280.png` (cu conținut).

### 3.2 Pagina de pornire cere de cinci ori același catalog

`GET /api/catalog/products` este cerut **de cinci ori** pe `/`, și de două ori pe `/apps`. `VERIFIED` (jurnalul de rețea, `route-report.json`).

Cauza e în `web/src/lib/pricing.ts:31-38`: cache-ul de module nu memorează **promisiunea în curs**, ci doar rezultatul. Patru montări de `useCatalogSummary()` (`home/Nav.tsx:24`, `home/Rest.tsx:20`, `home/Hero.tsx:12` și `home/Hero.tsx:37`) pornesc simultan, fiecare cu propriul `get()`, și niciunul nu îl vede pe celălalt; plus `home/Catalog.tsx:51` care are un `useAsync` propriu. `CODE-INSPECTED`

### 3.3 Zona de client nu cere rolul de client

`area: 'customer'` verifică existența unei sesiuni, nu rolul. Contul de staff deschide `/app` și vede contul lui de client, **gol** — un „Overview" fără nicio instanță, cu „No apps yet". Nu e o eroare, dar nici nu ar trebui să fie posibil. `VERIFIED`

### 3.4 Butonul „Retry" care nu reîncearcă

`ErrorState` are eticheta „Retry" hard-codată (`ui-app.tsx:532`). E corectă pentru o eroare de rețea, dar **greșită** când `onRetry` face altceva: gardul de staff pune `onRetry={() => navigate('/app')}` și butonul devine „Retry" care te duce în panoul client. Se vede pe toate cele 13 rute de staff, pentru orice client. `VERIFIED` — `route-report.json`, câmpul `errorHits` al rolului „customer" pe rutele `/admin*`: `['Retry']`.

### 3.5 Staff-ul nu poate ajunge la o instanță

- `/admin/services` listează 3 servicii, cu coloana „PTERODACTYL ID" și o acțiune „Retry provisioning" — dar **niciun link către instanță**. Singurele linkuri de pe pagină sunt către clienți. `VERIFIED`
- Nu există rută `/admin/services/:id` sau `/admin/instances/:id` (`routes.tsx:85-121`). `CODE-INSPECTED`
- Singurul URL de instanță este în zona de client, unde API-ul aplică deținerea: `loadInstance(user.id, id)` → **404** pentru staff. `VERIFIED`

Deci pasul „inspectează o instanță" din călătoria de staff **nu are traseu**. Staff-ul vede ID-ul de Pterodactyl și starea, și atât.

### 3.6 Tabelul de prețuri arată identificatori interni

`/admin/pricing` expune câmpurile cu id-ul în hash: `base-cmvjyo5yh0003dxtl58rz6pjt`, `ram-cmvjyo60r0005dxylmhc0bnr`, `cpu-…`, `disk-…`. E funcțional, dar e singurul loc din interfață unde se vede un identificator intern de bază de date. `VERIFIED` — `audit/screenshots/journey-j9-admin-pricing.png`.

### 3.7 Un apel inutil pe `/admin/tickets`

Pagina de coadă de tichete cere și `GET /api/admin/staff`, deși nu afișează nimic despre personal. `VERIFIED` (jurnalul de rețea).

---

## 4. Stările, pe scurt

| Stare | Cum arată | Unde e corectă | Unde lipsește |
|---|---|---|---|
| **încărcare** | `Skeleton` cu `aria-busy="true"` și `role="status"`, plus `LoadingBlock` cu etichetă („Loading the product") | toate rutele de client și de staff | `/apps`: scheletele arată ca un catalog gol |
| **golă** | `EmptyState` cu un titlu, o explicație și o acțiune | 9 din 10 rute de client; 6 din 13 de staff | — |
| **eroare** | `ErrorState` cu `role="alert"`, titlu, mesaj, buton „Retry" și `requestId` | toate rutele | eticheta „Retry" minte în starea de acces interzis |
| **succes** | toast (`ToastProvider`) + reîncărcarea paginii | creare de ticket, răspuns, schimbare de nume | — |

**Verificarea stărilor de eroare și de încărcare s-a făcut prin anularea, respectiv întârzierea răspunsului API în browser.** Serverul a răspuns normal la toate cererile reale; nicio cerere de scriere n-a fost făcută.

---

## 5. Rezumat numeric

| | |
|---|---|
| tipare de rută în `web/src/routes.tsx` | **33** |
| intrări de rută (cu `/` și 404) | **35** |
| URL-uri măsurate | **36** |
| rute deschise cu succes, autentificat | **36 / 36** |
| rute deschise cu succes, anonim | **12 / 36**; celelalte **24** redirecționează corect (23 protejate + `/deploy/:slug`, care cere o sesiune ca să poată crea o comandă) |
| redirecționări corecte la `/login?next=…` | **24 / 24**, cu `next` url-codat |
| redirecționări corecte din `guestOnly` | **2 / 2** (clientul → `/app`, staff-ul → `/admin`) |
| rute de staff blocate corect pentru un client | **13 / 13** („Staff access only") |
| rute de client **neblocate** pentru un cont de staff | **10 / 10** (vezi §3.3) |
| stări de eroare măsurate | **36 / 36** |
| stări de încărcare măsurate | **36 / 36** |
| stări goale măsurate | **5 / 36** (`/app/domains`, `/app/billing`, `/app/tickets` pentru contul de staff, `/admin/customers/:id`, `/admin/promotions`) |
| rute de staff fără traseu către o instanță | **1** (`/admin/services`) |
| apeluri identice repetate pe pagina de pornire | **5 ×** `GET /api/catalog/products` |

---

## 6. Fișierele de măsură

| Fișier | Ce conține |
|---|---|
| `audit/_tools/route-list.mjs` | lista celor 36 de URL-uri măsurate, cu componenta și gardul |
| `audit/_tools/route-inventory.mjs` | parcurgerea în trei roluri, cu stările de eroare și de încărcare |
| `audit/_tools/route-report.json` | raportul brut, per rută și per rol |
| `audit/screenshots/{anonymous,customer,staff}-*.png` | capturile de la 1280 px ale fiecărei rute |
| `audit/screenshots/{error,loading}-*.png` | capturile stărilor de eroare și de încărcare |
| `audit/_tools/staffinst.mjs` | verificarea că `/admin/services` nu are link către instanță |
