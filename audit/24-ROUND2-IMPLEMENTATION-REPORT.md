# 24 — Runda a doua: audit și implementare pe panoul clientului și interfața de administrare

**Data:** 2026-10-23.
**Obiect:** platforma Blipmade (`trencito42/blipmade-hosting`, producție la `blipmade.com`).
**Natura:** audit **cu implementare**, pe toată interfața de client și pe toată interfața de administrare.
**Nicio modificare în producție:** niciun deploy, nicio scriere în baza de date a producției, nicio
comandă, bilet sau instanță creată acolo. Singurul lucru scris a fost în baza de test.

---

## 1. Rezumatul rundei

| | |
|---|---|
| Constatări înregistrate | **65** (3 P0 · 2 Critical · 15 High · 32 Medium · 13 Low/Info) |
| Reparate în cod și verificate | **44** |
| Reparate parțial (codul e reparat, mai rămâne o decizie de date sau de infrastructură) | **9** |
| Rămase deschise, cu motivul | **12** |
| Suite API | **269 teste / 28 fișiere — toate trec** |
| Suite web | **87 teste — toate trec** |
| Typecheck | API (src + teste) și web — curate |
| Build | `vite build` — reușit |
| Sweep de browser | 26 rute × 3 lățimi (1440 / 834 / 390) — **decalaj maxim al tabelelor 0 px** (era 701 px), zero overflow, zero probleme a11y |

Registrul complet, cu dovezile: `audit/23-ROUND2-FINDINGS-REGISTER.md`.
Contoarele sunt calculate de `_tools/count-register-round2.cjs`, nu numărate cu mâna.

---

## 2. Metoda

**Auditul.** Patru agenți de audit au lucrat în paralel, pe zone disjuncte, cu brief-ul complet al
rundei și cu instrucțiunea de a nu presupune cauzele: fiecare constatare trebuia dovedită cu
`file:line` sau cu ieșirea unei comenzi și clasificată după una dintre clasele de verificare
(`VERIFIED`, `CODE-INSPECTED`, `INFERRED`, `UNVERIFIED`, `NOT-IMPLEMENTED`).

| Raport | Subiect | Constatări |
|---|---|---|
| `18-customer-dashboard-audit.md` | Panoul clientului | 11 |
| `19-pricing-lifecycle-audit.md` | Ciclul de viață al prețului | 9 |
| `20-sessions-and-account-security.md` | Sesiunile și contul | 8 |
| `21-visual-consistency-contract.md` | Consistenta vizuală | 6 |
| `22-admin-interface-audit.md` | Interfața de administrare | 16 |

**Implementarea.** Patru agenți de implementare, pe fișiere disjuncte, plus munca proprie pe
disponibilitate, contractul de preț, tabele, plăți și pagina principală.

**Măsurarea.** Stivă izolată pe VM 103 (`/tmp/check`, API pe `127.0.0.1:3101`, web pe `30003`),
baza `blipmade_test`, catalog seeduit cu cele 5 produse, conturi QA create pentru măsurătoare.
Producția a fost citită, niciodată scrisă. Chromium prin `playwright-core` pe VM 103.

---

## 3. Ce s-a reparat, pe severitate

### 3.1 P0 — blocante

**`AVAIL-01` — `deployable` era un flag liber.** Un produs putea fi taxat și plătit fără mapping de
egg pe panou; provisionarea eșua la pasul `server_created`. *Cauză:* disponibilitatea era o
constată manuală, nu o consecință a datelor. *Reparare:* `api/src/services/availability.ts` —
`orderable = visible && deployable && eggId != null`, iar comanda este refuzată **server-side**
(`api/src/routes/pricing.ts`, `api/src/routes/admin.ts`). *Stare:* reparat în cod; valoarea din baza
de producție (`deployable=true`, `eggId=NULL` pentru WordPress) **nu a fost atinsă** — cere
aprobare.

**`PRICE-01` — prețul de pornire nu corespundea configurației pornite.** Catalogul arăta 1,49 €
(configurația minimă: 512 MB / 1 vCPU / 5 GB), iar configuratorul pornea de la 1 GB / 10 GB, adică
1,89 €. *Cauză:* catalogul și configuratorul calculau separat, cu date diferite. *Reparare:*
serverul trimite o **carte de prețuri** (`minimum` și `recommended`, fiecare cu configurația și
suma ei), calculată cu aceeași funcție care prețuiește o comandă; interfața nu mai calculează
nimic. *Stare:* reparat și verificat (vezi §4).

**`PLP-01` — WordPress se vindea, se taxa și se putea plăti, dar nu putea fi creat.** Aceeași cauză
ca `AVAIL-01`, măsurată în producție (DB + `POST /api/catalog/quote`). *Stare:* **parțial** —
codul este reparat, dar rămâne faptul că producția nu rulează încă build-ul reparat.

### 3.2 Critical

**`ADM-01` — rutele de bilete verificau doar rolul.** `GET/POST /tickets/:id`, `/replies`,
`/attachments` și `/status` cereau un rol de staff, nu `tickets.read` / `tickets.write`: orice staff
putea citi notele interne, răspunde clienților și închide bilete. *Reparare:*
`requireTicketPermission()` pe cele patru rute (`api/src/routes/tickets.ts`).

**`ADM-03` — „Retry provisioning" repunea în service o instanță vie.** Endpointul scria
`status='PROVISIONING'` înainte de coadă, ceea ce anula garda workerului; provisionarea crea un al
doilea server când panoul nu răspundea, orfanând datele clientului. *Reparare:* refuz pe instanță
`ONLINE` (`api/src/routes/admin.ts`) și oprire dacă panoul nu răspunde
(`api/src/services/provisioning.ts`).

### 3.3 High

| ID | Constatare | Reparare |
|---|---|---|
| `PRICE-02` | Fiecare strat își calcula suma | Contract comun: `priceBook()` pe server, `web/src/lib/pricing-contract.ts` pe client |
| `PRICE-03` | Estimarea se calcula în interfață | Citația vine de la server (`POST /catalog/quote`); interfața nu prețuiește nimic |
| `TBL-01` | `DataTable` punea `grid` pe `<tbody>` și distrugea modelul de coloane | Tabel real cu `<colgroup>`, `thead`/`tbody` din aceeași descriere de coloane |
| `TBL-02` | Tabela DNS scrisă de mână, decalaj de 1133 px | Tabel real, cu `colgroup` și coloane aliniate |
| `PAY-01` | Starea plăților nu era cerută niciodată: comanda se crea, checkout-ul eșua (4 comenzi `AWAITING_PAYMENT` în producție) | `GET /billing/payment-state`, iar interfața cere starea înainte să ofere plata |
| `PLP-07` | Promotia de 100% nu ajungea la Stripe: furnizorul primea prețul de listă, iar verificarea de sumă respingea comanda | `api/src/services/order-amounts.ts` — totalul comenzii este împărțit pe linii, iar suma încasată este exact suma cotată; o comandă acoperită integral este confirmată **fără** furnizor de plată |
| `SESS-01` | Adresa înregistrată era adresa proxy-ului (241 din 269 de sesiuni vii aveau o adresă Cloudflare) | `web/src/lib/client-address.mjs`: lanțul `X-Forwarded-For` e citit de la stânga, prima adresă care nu e proxy cunoscut; headerul e crezut doar de la un peer de încredere |
| `SESS-02` | Limita de 10 autentificări / 15 min era cheiată pe adresa edge-ului | A doua limită, **per cont**, pe e-mail normalizat, independentă de adresă (`api/src/routes/auth.ts`) |
| `ADM-02` | Escaladare de privilegii: `PUT /admin/staff/:userId` cerea doar `staff.write` | Serverul refuză (403) schimbarea rolului și a permisiunilor unui administrator de către un non-administrator |
| `ADM-04` | Interfața admin nu avea control pentru `eggId` | `EggForm` pe ambele randări (desktop și telefon) |
| `ADM-06` | Nu exista refund administrativ (`orders.write` era definit și nefolosit) | `POST /admin/orders/:id/refund`: cere `orders.write`, refuză o comandă neplătită sau fără intent de plată, 503 dacă plățile nu sunt configurate, idempotent, cu intrare în jurnal |
| `ADM-07` | `POST /auth/login` întorcea `permissions: []`; clientul păstra răspunsul de login | Răspunsul de login poartă permisiunile, iar `web/src/session.tsx` citește sesiunea după autentificare |

### 3.4 Medium — reparate

`AVAIL-02` (stările de disponibilitate în payload) · `TBL-03` (nowrap / aliniere / trunchiere) ·
`TBL-04` (încărcare și gol aliniate cu antetul) · `DASH-01`–`DASH-05` (stările goale trimit la
deploy; catalogul adevărat pe pagina principală, în meniu și în documentație) · `PLP-03`–`PLP-05`
(grila de opțiuni trăiește în contractul de preț: minimul, recomandatul și maximul sunt
selectabile; un singur format pentru memorie) · `PAY-03` (comanda cu total 0 nu mai trece prin
furnizorul de plată) · `SESS-03` (browserele iOS: `CriOS`, `EdgiOS`, `FxiOS`, `OPiOS`, plus
versiunea sistemului și modelul când user-agent-ul le are) · `SESS-04` (`lastSeenAt` cu scriere
amortizată la 5 minute, filtrarea sesiunilor expirate, ultima activitate în listă) · `SESS-05`
(rotirea sesiunii la autentificare, plafă de 20 pe cont care nu închide sesiunea curentă și scrie
în jurnal) · `SESS-06` (text corect, revogare decisă de răspunsul serverului, „close all other
sessions") · `CONS-01`–`CONS-06` (badge-urile, banda de filtrare, ierarhia de butoane și câmpurile
de mediu trec prin componenta comună) · `ADM-05` (randarea de desktop și cea de telefon au aceleași
comenzi) · `ADM-09` (jurnalul arată IP-ul sursă și motivul) · `ADM-10` (ecranul de prețuri are
gardă de permisiune și poate dezactiva un preț) · `ADM-15` (confirmări la scrierile din admin) ·
`NAV-01`, `NAV-02` (CTA-uri de stări goale).

### 3.5 Low / Info — reparate

`DASH-11` (textul repetat pe „Payment method") · `PLP-08` (contractul API descrie cartea de preț și
unitatea sumelor) · `UX-21` (o singură umbră pentru alerta „bad") · `CONS-06` (butonul secundar are
o singură variantă).

---

## 4. Verificările rulate

### 4.1 Teste

| Suite | Rezultat |
|---|---|
| API (vitest, 28 fișiere) | **269 / 269 trec** — rulat pe VM 103 cu `scripts/run-tests.sh` |
| Web (node:test, 5 suite) | **87 / 87 trec** — rulat și pe VM 103 |
| Typecheck API (`tsconfig.json`) | curat |
| Typecheck API teste (`tsconfig.test.json`) | curat |
| Typecheck web (`tsc --noEmit`) | curat |
| Build (`vite build`) | reușit |

Testele noi din această rundă: `api/tests/sessions.test.ts`,
`api/tests/admin-staff-permissions.test.ts`, `api/tests/admin-order-refund.test.ts`,
`api/tests/order-amounts.test.ts`, `api/tests/catalog-availability.test.ts` (adaptat),
`web/tests/client-address.test.mjs`, `web/tests/sessions.test.ts`, `web/tests/ui-components.test.ts`,
`web/tests/catalog-truth.test.ts`, `web/tests/admin-pricing-gates.test.ts`.

### 4.2 Măsurători în browser (sweep, 26 rute × 1440 / 834 / 390 px)

| Măsurătoare | Înainte (build-ul din producție) | După (build-ul reparat) |
|---|---|---|
| Decalaj maxim antet–corp în tabele | **701 px** | **0 px** |
| Tabele măsurate | 39 | 12 (restul rutelor din stiva izolată nu au tabel) |
| Overflow orizontal | 0 | 0 |
| Imagini fără `alt` / butoane fără nume / câmpuri fără etichetă | 0 / 0 / 0 | 0 / 0 / 0 |
| Erori de consolă | 404 pentru fonturile Proxima Nova | 404 pentru fonturile Proxima Nova |

Cele trei fișiere de font lipsă (`proxima-nova-400/600/700.woff2`) sunt singurele erori de rețea
din tot sweep-ul. Ele sunt un defect preexistent (`UX-20` din runda 1) și **nu** au fost reparate în
această rundă: fonturile nu sunt în repository.

### 4.3 Verificări punctuale, cu dovezi

- **Contractul de preț:** prețul de pornire = prețul configurației minime; estimarea din
  configurator = suma din cotatia serverului; CTA-ul de preț de pornire deschide configurația
  minimă; o produs indisponibil nu are CTA și nici nu poate fi comandat (refuzul este pe server).
- **Configurația rezistă la navigare:** configurația, regiunea și resursele trăiesc în adresă, deci
  o reîmprospătare, un „înapoi" sau un link direct reface aceeași configurație.
- **Disponibilitatea:** WordPress (fără egg) → „temporarily unavailable"; `code-server` (validat
  fără egg) → „coming soon"; `discord-bot` → CTA activ.
- **Adresa clientului:** rezolutorul este testat cu 11 cazuri (lanț multi-salt, lanț de adrese de
  încredere, header falsificat, header gol, listă neconfigurată, CIDR, IPv4 încastrat).

---

## 5. Ce rămâne nefinalizat

### 5.1 Necesită aprobare (nu s-a atins producția)

| ID | Ce trebuie | De ce nu s-a făcut |
|---|---|---|
| `PLP-01` | WordPress are `deployable=true` cu `eggId=NULL` în DB-ul de producție | Scriere în date de producție — interzis fără aprobare. Modelul derivat îl afișează corect, dar rămâne necomandabil |
| `PLP-07` | Campania `LAUNCH` este 100% cu `maxPerUser=NULL` | Decizie de business: plafonul per cont. Codul a fost reparat, limita nu poate fi inventată de un audit |
| `SESS-01`, `SESS-02`, `SESS-08` | Gateway-ul Caddy de pe VM 102 înlocuiește `X-Forwarded-For`; `TRUSTED_PROXIES` trebuie îngustat la adresa containerului `web` | Infrastructură și configurație de producție. **Codul e reparat și configurabil** (`TRUSTED_PROXIES` în compose, `TRUSTED_PROXY_IPS` în web); până la schimbarea gateway-ului, adresa înregistrată rămâne adresa proxy-ului |
| `PLP-02` | Deploy-ul build-ului reparat | Fără deploy, prin cerință |

### 5.2 Rămase deschise, în afara razei acestei runde

`DASH-06` (tab-urile paginii de instanță nu sunt în adresă) · `DASH-07` (al doilea panou „Settings")
· `DASH-08` (`window.prompt` pentru parolă și alias) · `DASH-09` (formularul de rețea cere IP și
port necunoscute clientului) · `DASH-10` (acțiunea „Power" trimite întotdeauna `restart`) ·
`PAY-02` (mesajul „Checkout is not available" rămâne inaccesibil în configurator) ·
`PLP-06` (divergență latentă între rândul de preț folosit de catalog și cel care prețuiește
comanda) · `ADM-08` (ecranul de început al adminului cere `customers.read`, dar expune cifra de
afaceri) · `ADM-11` (ruta dedicată `GET /admin/staff/assignable` pentru atribuirea fără
`staff.read`) · `ADM-12` (paginare reală; azi există doar indicarea de trunchiere) · `ADM-13` (patru
operații ale API-ului fără interfață) · `ADM-14` (catalogul public expune `deployable`, `eggId` și
mesajele interne de blocaj) · `ADM-16` (butonul „Show e-mails" nu lasă urmă în jurnal) ·
`SESS-07` (nu există al doilea factor — funcția nu există în cod) · `UX-20` (fonturile Proxima Nova
lipsesc din repository).

### 5.3 Limitările mediului

- **Safari / WebKit nu este disponibil** pe VM 103: există doar Chromium. Comportamentul pe iOS și
  Safari a fost verificat pe cod și pe user-agent-urile reale din producție, nu în browser.
- Verificările pe trei lățimi sunt făcute pe Chromium; în Safari/WebKit rămân de verificat.

---

## 6. Fișierele schimbate în această rundă

**Server (API).** `api/src/services/availability.ts` · `api/src/services/pricing.ts` ·
`api/src/services/order-amounts.ts` **(nou)** · `api/src/services/stripe.ts` ·
`api/src/services/provisioning.ts` · `api/src/routes/catalog.ts` · `api/src/routes/orders.ts` ·
`api/src/routes/billing.ts` · `api/src/routes/auth.ts` · `api/src/routes/settings.ts` ·
`api/src/routes/tickets.ts` · `api/src/routes/admin.ts` · `api/src/routes/webhooks.ts` ·
`api/src/plugins/auth.ts` · `api/src/app.ts` · `api/src/env.ts` ·
`api/prisma/schema.prisma` + `api/prisma/migrations/20261024110000_session_last_seen/` **(nou)**

**Client (web).** `web/src/lib/pricing-contract.ts` · `web/src/lib/table.ts` ·
`web/src/lib/client-address.mjs` **(nou)** · `web/src/lib/api.ts` · `web/src/lib/pricing.ts` ·
`web/src/ui-app.tsx` · `web/src/session.tsx` · `web/src/data.ts` · `web/server.mjs` ·
`web/src/app/{Deploy,DeployCatalog,ProductPage,Overview,Instances,Billing,Domains,Settings}.tsx` ·
`web/src/app/instance/{SettingsTab,StartupTab}.tsx` · `web/src/home/{Studio,Story,Nav,Hero,Configurator,Ticker,Catalog}.tsx` ·
`web/src/pages/Docs.tsx` · `web/src/admin/{Overview,Products,Orders,Pricing,Staff,Tickets,Audit,Promotions,Infrastructure,Services,Customers,CustomerDetail,Settings}.tsx` ·
`web/src/admin/permissions.ts` **(nou)**

**Infrastructură și documentație.** `web/Dockerfile` (modulul rezolvării adresei ajunge în
imagine) · `compose.api.yml` (`TRUSTED_PROXIES` explicit, cu valoarea implicită de azi) ·
`docs/API_CONTRACT.md` (cartea de preț, stările de disponibilitate, comanda cu total 0).

**Audit.** `audit/18`–`audit/22` (rapoartele agenților) · `audit/23-ROUND2-FINDINGS-REGISTER.md`
**(nou)** · `audit/24-ROUND2-IMPLEMENTATION-REPORT.md` (acest document) ·
`audit/_tools/dashboard-sweep.mjs` · `audit/_tools/count-register-round2.cjs` ·
`audit/_tools/seed-check-accounts.mjs` **(nou)** · `audit/_tools/sweep-after2.json` **(nou)**

---

## 7. Commit-urile rundei

| Commit | Cuprins |
|---|---|
| `210a677` | Modelul de disponibilitate, igiena sesiunilor, stările goale, permisiunile biletelor, retry-ul și provisionarea |
| (următorul) | Contractul de preț între catalog și furnizorul de plată, adresa clientului, limitele per cont, refund-ul administrativ, catalogul adevărat pe site, componentele comune |

Niciun commit nu conține o modificare a datelor de producție și niciunul nu a fost aplicat în
producție.
