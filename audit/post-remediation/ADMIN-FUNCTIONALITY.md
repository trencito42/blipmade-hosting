# Audit funcțional al interfeței și al API-ului administrativ — Blipmade

**Document:** `audit/post-remediation/ADMIN-FUNCTIONALITY.md`
**Data testelor:** 23 octombrie 2026 (între 19:22 și 21:15 GMT−0400 / 23:22–01:15 UTC)
**Auditor:** agent independent, fără participare la remedierea anterioară
**Natura lucrării:** audit de funcționalitate și de limite de permisiune. **Nu s-a modificat niciun fișier sursă.** Singurul fișier scris de acest audit este acest raport.

---

## 1. Antet: ce a fost testat, unde, cum, cu ce limite

### 1.1 Ce a fost testat

Toate cele **12 ecrane administrative** din `/admin` (dashboard, customers, orders, services, catalog, pricing, promotions, infrastructure, support queue, audit log, staff, settings), împreună cu toate cele **34 de rute de administrare** din `api/src/routes/admin.ts` (40 de combinații metodă+rută incluzând variantele cu parametri de căutare și filtrare).

Pentru fiecare rută s-au verificat patru lucruri, în această ordine:

1. **Funcționalitatea** — ecranul se încarcă, arată date, acțiunea produce efect.
2. **Aplicarea permisiunii pe server** — un cont de personal cu un set de permisiuni limitat a fost folosit pentru a apela fiecare rută **direct prin API**, nu doar prin interfață.
3. **Traversarea obiectelor altcuiva (IDOR/BOLA)** — un cont cu o permisiune scrisă a fost pus să ajungă la obiecte care aparțin altor clienți.
4. **Jurnalizarea** — fiecare mutație a fost urmărită în jurnalul de audit (`GET /api/admin/audit`).

### 1.2 Unde

| Element | Valoare |
|---|---|
| Copia de lucru a codului (citită) | `/root/blipmade-work` (fără git; nu s-a rulat nicio comandă git) |
| Codul real al stivei izolate | `/opt/blipmade` pe `debian@10.77.0.13`, ramura `audit/post-remediation`, commit `29a86cc` |
| API testat | `http://127.0.0.1:3101` (proces node, `NODE_ENV=test`) |
| Interfață web testată | `http://127.0.0.1:30003` |
| Baza de date scrisă | `blipmade_test` (stiva comună a auditorilor) **și** `admfunc_test` (stivă proprie, creată de acest audit) |
| Baza de date de producție | `blipmade` — **nu a fost atinsă, nici scris, nici citit pentru date** (doar interogări de verificare a curățeniei, cu rol de citire) |
| Stack de producție | containerele `blipmade-api-1` (3100) și `blipmade-web-1` (3000) — **nu au fost apelate**; portul 30002 — **nu a fost folosit** |

**Regula respectată fără excepție:** s-a scris **exclusiv** pe stiva izolată (`blipmade_test`, portul 3101/30003) și pe o stivă proprie creată pentru acest audit (`admfunc_test`, API propriu pe `127.0.0.1:3121`). Nu s-a apelat niciodată `blipmade.com`, portul 3100, portul 30002 sau interfața de producție de pe `10.77.0.13:3000`. Nu s-a făcut niciun deploy. Nu s-a modificat niciun fișier din repository (verificat prin `md5sum -c` înainte și după: toate cele **17** fișiere verificate — `api/src/routes/admin.ts`, `api/src/lib/permissions.ts`, cele 13 fișiere din `web/src/admin/`, `web/src/admin/permissions.ts`, `web/src/routes.tsx` și `web/src/nav.ts` — au aceleași sume ca pe VM; `md5sum -c` raportează `OK` pentru toate).

### 1.3 Declarare explicită: scrieri în producție

**Acest audit NU a scris niciun rând în baza de date de producție `blipmade` și nu a efectuat niciun apel către producție.** Verificarea a fost făcută prin interogarea bazei de producție cu ajutorul tiparelor distinctive ale acestui audit:

| Interogare pe baza `blipmade` (producție) | Rezultat |
|---|---|
| `User` cu id sau e-mail care conține identificatorul de rulare al auditului (`r1792798`) | **0** |
| `AuditLog` cu `actorEmail`/`actorId` care conține `r1792798` | **0** |
| `Session` cu `userId` care conține `r1792798` | **0** |
| `StaffMember` cu `userId` care conține `r1792798` | **0** |
| `Product` cu slug de tip `probe-%`, `mut-%` sau cu `r1792798` | **0** |
| `Promotion` cu cod `MUT%`, `PROBE%` sau `DEBUG%` | **0** |
| `Ticket` cu id `bulk_tkt_%` sau cu subiectele de probă | **0** |
| `Order` cu id `bulk_ord_%` sau numere `BULK-%` / `AUD-00%` | **0** |
| `Instance` cu id `inst_audit_%` sau nume `audit-instance%` | **0** |
| `Invoice` cu id `inv_audit_%` sau numere `AUD-INV%` | **0** |

Toate adresele folosite de acest audit au fost create cu sufix de rulare (`admin.check.<rulare>@example.test`, `esc.staff.<rulare>@example.test`, `bulk.customer.<n>.<rulare>@example.test` etc.), iar căutarea lor în producție nu întoarce niciun rând. Scripturile mele nu conțin niciun alt URL decât `http://127.0.0.1:3101` (API-ul stivei izolate), `http://127.0.0.1:30003` (interfața stivei izolate) și `http://127.0.0.1:3121` (API-ul stivei proprie) (verificat prin căutare în toate scripturile, după toate rulările).

**Ce există în producție și NU îmi aparține** (raportat pentru curățare, găsit în timpul verificării de siguranță, nu creat de acest audit):

| Cont | Rol | Suspendat | Creat | Observație |
|---|---|---|---|---|
| `qa.headless.one@example.test` | CUSTOMER | da | 2026-10-23 01:53:56 | rest dintr-o rundă de audit anterioară; 209 intrări în jurnal |
| `qa.headless.two@example.test` | CUSTOMER | da | 2026-10-23 01:55:17 | rest dintr-o rundă de audit anterioară; 57 intrări în jurnal |
| `browser-customer@blipmade.test` | CUSTOMER | da | 2026-10-23 07:21:46 | rest dintr-o rundă de audit anterioară |
| `browser-admin@blipmade.test` | **ADMIN** | da | 2026-10-23 07:21:46 | **contul cu rol ADMIN și parolă cunoscută**, rest dintr-o rundă de audit anterioară |

Toate patru au deja `suspendedAt` setat și **0 sesiuni deschise**. În producție există și `steph@ripboyband.com` cu rolul **ADMIN** și `emailVerified=false`, creat la 2026-10-23 20:08:02 printr-o înregistrare publică (IP de margine `162.158.14.14`), apoi promovat manual: intrarea de jurnal `staff.role_changed` are `meta={"by":"operator","to":"ADMIN","from":"CUSTOMER"}` și un actor **null**, deci promovarea a fost făcută direct în baza de date, nu prin API-ul de administrare. **Nu este un rând creat de acest audit**, dar este o situație pe care conducătorul ar trebui s-o cunoască: un cont self-registrat cu rol ADMIN, încă nesuspendat.

### 1.3 Cum s-a verificat că stiva testată este codul citit

Sumele MD5 ale fișierelor din copia locală au fost comparate cu cele ale codului real:

| Fișier | MD5 | Stare |
|---|---|---|
| `api/src/routes/admin.ts` | `e8fe6f8119910336b317b08b4feb906c` | identic în copie, `/opt/blipmade` și build-ul care rula (`/tmp/api-check/src`) |
| `api/src/lib/permissions.ts` | `69e94446c45c98859f96495595dfec51` | identic |
| `web/src/admin/*.tsx` (13 fișiere) | — | toate identice între copie, `/opt/blipmade` și `/tmp/web-check/src` (build-ul servit pe 30003) |

Concluzie: ce s-a citit local este exact ce rulează pe stiva izolată.

### 1.4 Instrumentare

- **Node.js v22.23.2** pe VM, scripturi proprii în `/tmp/audit-admin/` (în afara repository-ului, conform regulii).
- **HTTP** prin `fetch` cu client propriu, care respectă cookie-ul de sesiune (`bm_session`) și dublul de trimitere CSRF (`bm_csrf` în `X-CSRF-Token`).
- **psql** (PostgreSQL 17) pentru pregătirea datelor de test și pentru citirea directă a tabelelor.
- **playwright-core** (`/opt/blipmade/tools/browser/node_modules/playwright-core`) + Chromium `/usr/bin/chromium`, rulat cu `xvfb-run -a`.
- **Nicio comandă git, nicio instalare npm, nicio modificare de `package.json`, nicio rulare a suitei complete de teste, nicio reconstruire a stivei comune.**

Scripturile folosite (toate în `/tmp/audit-admin/` pe VM):

| Script | Rol |
|---|---|
| `lib.mjs` | client HTTP, gestionarea cookie-ului/CSRF, pool de administratori |
| `00-setup-all.mjs` | creează conturile și datele de test, idempotent |
| `03-probe.mjs` | apelează cele 40 de rute cu 4 identități (ADMIN, STAFF cu toate permisiunile, STAFF cu `tickets.read` numai, CLIENT) |
| `04-security.mjs` | escaladare de privilegii, suspendarea conturilor, traversarea obiectelor altora, domeniul panoului |
| `05-mutations.mjs` | 18 mutații administrative + verificarea jurnalului |
| `06-truncation.mjs` | trunchierea listelor, căutare, filtrare, paginare, sortare, operații în masă |
| `07-escalation.mjs` | raza de acțiune a escaladării |
| `08-ratelimit.mjs`, `09-ratelimit2.mjs` | măsurarea exactă a limitei de semnare pe cont |
| `ownapi.sh`, `10-ownverify.mjs` | stivă proprie (`admfunc_test` + API pe 3121) și re-verificarea figurilor distructive |
| `browser.mjs` … `browser4.mjs` | cele 12 ecrane, 4 identități, dialoguri de confirmare, expunerea escaladării în interfață |

### 1.5 Limitări (declarate, ascunse și tratate separat)

1. **Firefox și WebKit nu sunt disponibile.** Toate verificările de interfață s-au făcut doar în Chromium. Problemele de randare specifice celorlalte două motoare nu au fost căutate.
2. **Stackul izolat este resetat de alți auditori.** Baza `blipmade_test` a fost golită de mai multe ori în timpul auditului, de un proces `vitest` al altui agent. Conturile, produsele și datele de test au dispărut de două ori în mijlocul măsurătorilor. Fiecare măsurătoare a fost repetată pe un set de adrese nou, la fiecare rulare (`AUDIT_RUN`), iar rezultatele raportate sunt cele ale rulărilor reușite. Conturile create sunt șterse la final (doar cele ale rândului curent; datele celorlalți auditori nu au fost atinse).
3. **Limita de 10 semnări pe cont în 15 minute nu a fost ridicată** pe stiva izolată. Doar limita pe adresă (`LOGIN_RATE_LIMIT_MAX=500`) a fost ridicată; `accountGuard(app, 10)` din `api/src/routes/auth.ts:182` este codificat la 10. Prin urmare fiecare rulare a folosit adrese unice, pentru a nu fi blocat. Limita a fost **măsurată exact** (vezi ADM-P2-06), dar comportamentul ei în producție — unde limita pe adresă este cea reală — nu a fost măsurat.
4. **Plățile nu pot fi testate de capăt în cap.** Furnizorul de plăți nu este activ în stiva izolată (`STRIPE_TEST_MODE=true`). `POST /admin/orders/:id/refund` răspunde corect cu `409` („This order carries no Stripe payment intent"), dar **calea completă a rambursării nu a fost executată**.
5. **Importul de server de panel nu poate ajunge la final** în lipsa panoului: `POST /admin/instances/import` răspunde `500` pentru un administrator și `400` („Only an administrator can import a server.") pentru un personal ne-administrator. S-a verificat **poarta de rol**, nu efectul final.
6. **Stiva izolată nu este stiva de producție.** `STRIPE_TEST_MODE=true`, `NODE_ENV=test`, rate limit per cont cu sufix de rulare. Comportamentul în producție al limitelor de autentificare și al plăților nu a fost măsurat.
7. **Nu am verificat infrastructura de pe VM 102/103**, TLS-ul, backup-urile, monitorizarea sau panoul Pterodactyl — obiectul acestui audit este exclusiv interfața și API-ul administrativ.

---


### 1.6 Rezumatul constatărilor

| ID | Severitate | Titlu | Clasă de evidență |
|---|---|---|---|
| ADM-P1-01 | High | Escaladare de privilegii: un personal cu `staff.write` își poate acorda 20 din 21 de permisiuni | VERIFIED (două stive) |
| ADM-P1-02 | High | `customers.write` poate suspenda un cont de administrator sau de personal | VERIFIED (două stive) |
| ADM-P2-01 | High | Panoul de control cere `customers.read` și expune venit, MRR, comenzi, bilete și servicii | VERIFIED (două stive) |
| ADM-P2-02 | Medium | Navigația administrativă nu este filtrată pe permisiuni | VERIFIED |
| ADM-P2-03 | Medium | Nicio căutare în comenzi și bilete, nicio paginare, nicio sortare | VERIFIED |
| ADM-P2-04 | Medium | Operațiile în masă lipsesc din API și din interfață | VERIFIED |
| ADM-P2-05 | Medium | 8 funcții administrative existente în API nu sunt expuse în interfață | VERIFIED |
| ADM-P2-06 | Medium | Contorul de autentificare blochează orice adresă după 10 cereri, inclusiv reușite și inexistente | VERIFIED |
| ADM-P3-01 | Medium | Atribuirea unui bilet cere `staff.read` în interfață, dar doar `tickets.write` în API | VERIFIED |
| ADM-P3-02 | Low-Info | Jurnalul modificărilor de permisiuni nu notează ce a fost eliminat | VERIFIED |
| ADM-P3-03 | Low-Info | Jurnalul nu notează o reconciliere a prețurilor care nu corectează nimic | VERIFIED |
| ADM-P3-04 | Low | Un personal ne-administrator poate schimba titlul unui administrator | VERIFIED |
| ADM-P3-05 | Low | Ecranul de personal arată simultan 0 staff members și o eroare de încărcare | VERIFIED |
| ADM-P3-06 | Low-Info | `GET /admin/money` este un capăt mort | VERIFIED |

## 2. Metodă

### 2.1 Identitățile folosite

Toate conturile au fost create **direct în `blipmade_test`** (nu prin API), pentru că API-ul limitează semnările la 10 pe cont în 15 minute. Parola a fost generată cu aceeași funcție a platformei (`hashPassword` din `api/src/lib/password.ts`, importată din build-ul care rulează), deci autentificarea trece prin exact același cod de producție.

| Cont (sufix de rulare) | Rol | Permisiuni | Scop |
|---|---|---|---|
| `admin.check.<RUN>` | ADMIN | toate 21 | administrator |
| `adm1..8.pool.<RUN>` | ADMIN | toate 21 | pool, ca să nu se atingă limita de semnare |
| `full.staff.<RUN>` | STAFF | toate 21 | personal cu toate permisiunile, **fără** rol ADMIN |
| `limited.staff.<RUN>` | STAFF | `tickets.read` | contul cu set minim, cerut de brief |
| `esc.staff.<RUN>` | STAFF | `tickets.read`, `staff.write` | test de escaladare |
| `rw.staff.<RUN>` | STAFF | `customers.read/write`, `tickets.read/write` | traversare de obiecte |
| `ord.staff.<RUN>` | STAFF | `orders.read/write` | rambursare |
| `custonly.staff.<RUN>` | STAFF | `customers.read` | domeniul panoului de control |
| `staffrw.staff.<RUN>` | STAFF | `staff.read`, `staff.write` | expunerea escaladării în interfață |
| `qa.check.<RUN>` | CLIENT | — | client obișnuit |
| `owner.one/two/three.<RUN>` | CLIENT | — | clienți ai obiectelor vizate |

### 2.2 Cererile concrete

**Matricea de permisiuni** — fiecare dintre cele 40 de rute a fost apelată cu fiecare dintre cele patru identități, cu `Accept: application/json`, `Cookie: bm_session=…`, `X-CSRF-Token: bm_csrf` pentru metodele nesigure, și corp JSON validat de `zod` în server:

```
GET    /api/admin/overview                          GET    /api/admin/pricing
GET    /api/admin/customers                         PUT    /api/admin/pricing/:id
GET    /api/admin/customers?search=…                GET    /api/admin/tickets
GET    /api/admin/customers/:id                     GET    /api/admin/tickets?status=OPEN
GET    /api/admin/customers/:id/panel               POST   /api/admin/tickets/:id/assign
POST   /api/admin/customers/:id/panel/credential    GET    /api/admin/promotions
DELETE /api/admin/customers/:id/panel/credential    POST   /api/admin/promotions
POST   /api/admin/customers/:id/suspend             PATCH  /api/admin/promotions/:id
GET    /api/admin/orders                            GET    /api/admin/infrastructure
GET    /api/admin/orders?status=PAID                POST   /api/admin/infrastructure/sync
POST   /api/admin/instances/reconcile-prices        GET    /api/admin/audit
POST   /api/admin/invoices/:id/confirm-collection   GET    /api/admin/audit?action=product
POST   /api/admin/orders/:id/refund                 GET    /api/admin/staff
GET    /api/admin/services                          PUT    /api/admin/staff/:userId
GET    /api/admin/services?status=ONLINE            GET    /api/admin/settings
GET    /api/admin/services?search=…                 GET    /api/admin/email/delivery
GET    /api/admin/products                          PUT    /api/admin/settings
POST   /api/admin/products                          POST   /api/admin/instances/:id/retry
PATCH  /api/admin/products/:id                      POST   /api/admin/instances/import
DELETE /api/admin/products/:id                      GET    /api/admin/money
```

**Escaladare** — `PUT /api/admin/staff/:userId` cu corpuri de permisiuni de 20, 21 și 21+dubluri, cu `userId` egal cu propriul cont, cu al altui cont de personal și cu al unui administrator.

**Suspendare** — `POST /api/admin/customers/:id/suspend` cu `id` de client, de personal și de administrator.

**Traversare de obiecte** — `GET /api/admin/customers/:id` al unui client străin; `POST /api/admin/tickets/:id/assign` pe un bilet al altui client, cu un personal și cu un client drept țintă; `POST /api/admin/orders/:id/refund` pe o comandă a altui client.

**Trunchiere** — au fost inserate 260 de clienți, 260 de comenzi și 260 de bilete suplimentare în `blipmade_test`, apoi s-au măsurat lungimea listelor, câmpul `total`, parametrii de paginare (`page`, `limit`, `take`, `offset`, `cursor`, `pageSize`), cei de sortare (`sort`, `orderBy`, `order`) și acuratețea căutării.

**Interfață** — Playwright/Chromium: 4 identități × 12 ecrane, cu extragerea textului paginii, a numărului de rânduri, a mesajelor de eroare și a apelurilor API interceptate; plus capturarea dialogurilor de confirmare pentru ștergerea unui produs și pentru suspendarea unui client, și a stării controalelor pe ecranul de personal.

### 2.3 Verificarea jurnalului

Jurnalul a fost citit înainte și după fiecare grup de mutații, filtrat pe acțiunile apărute între cele două citiri, și s-a comparat fiecare intrare cu mutația care o producea (acțiune, tipul țintei, id-ul țintei, conținutul câmpului `meta`).

### 2.4 Stiva proprie, pentru figurile distructive

Măsurătorile de escaladare de privilegii, de schimbare de rol, de suspendare de cont și de modificare a prețurilor au fost **repete pe o stivă complet separată**, ca să nu depindă de starea comună `blipmade_test` (care este resetată de alți auditori) și ca figurile distructive să nu fie aplicate peste datele altora:

- baza de date `admfunc_test`, creată de zero, cu migrările aplicate de acest audit (`prisma migrate deploy` cu `DATABASE_URL` către `admfunc_test`; baza `blipmade` și `blipmade_test` nu au fost atinse);
- un proces API propriu, pornit din același build (`/tmp/api-check/dist/index.js`), pe `127.0.0.1:3121`, cu `REDIS_URL` pe o bază Redis separată (`/8`);
- scriptul `10-ownverify.mjs`, care repetă cele trei constatări grave și reia matricea de permisiuni pe 16 rute.

Rezultatele re-verificării sunt în secțiunea 2.5 și sunt marcate ca **VERIFIED** în constatările corespunzătoare.

Stiva proprie a fost **oprită și baza `admfunc_test` a fost ștearsă** imediat după măsurători; API-ul propriu nu mai ascultă pe 3121, iar stiva comună (3101/30003) a rămas neatinsă și funcțională.

### 2.5 Rezultatele re-verificării pe stiva proprie

```
API under test: http://127.0.0.1:3121
database under test: admfunc_test

### ADM-P1-01
self-grant 20 of 21 -> 200
the session now carries 20 permissions
GET /api/admin/settings with the escalated account -> 200
GET /api/admin/staff with the escalated account -> 200
self-grant all 21 -> 403 Only an administrator can grant the whole permission list.

### ADM-P1-02
STAFF(customers.write) suspends the administrator -> 200
the administrator can no longer sign in -> 401 This account is suspended.
undo by another administrator -> 200

### ADM-P2-01
staff with only customers.read -> 200 {"overview":{"customers":1,"instances":1,"activeInstances":1,
  "openTickets":0,"ordersToday":1,"revenueMonth":5000,"provisioningFailures":0,"mrr":5000,"currency":"EUR"}}
the same staff on /api/admin/pricing -> 403 Your role does not allow "pricing.read".

### the permission matrix still holds on the private instance
a staff with only tickets.read: 1 allowed, 15 refused; unexpected answers: none
a customer on /api/admin/customers -> 403 Staff access only.
```

---

## 3. Matricea de acoperire

Legendă: **Int.** = ecran în interfață; **API** = rută existentă; **Funcț.** = funcționează; **Perm. server** = permisiunea aplicată pe server, măsurată cu un cont limitat; **Jurnal** = mutația este journalizată.

| # | Funcție administrativă (rută) | Permisiune | Int. | API | Funcț. | Perm. server | Jurnal |
|---|---|---|---|---|---|---|---|
| 1 | Panou de control — `GET /admin/overview` | `customers.read` | Da | Da | **Da, cu rezerva** (vezi ADM-P2-01) | Da | n/a (citire) |
| 2 | Lista clienți — `GET /admin/customers` | `customers.read` | Da | Da | Da | Da | n/a |
| 3 | Lista clienți cu căutare — `?search=` | `customers.read` | Da | Da | Da | Da | n/a |
| 4 | Fișa client — `GET /admin/customers/:id` | `customers.read` | Da | Da | Da | Da | n/a |
| 5 | Mapare panel client — `GET /admin/customers/:id/panel` | `customers.read` | **Nu** | Da | Da | Da | n/a |
| 6 | Salvează cheia de panel — `POST /admin/customers/:id/panel/credential` | `services.write` | **Nu** | Da | Da | Da | Da (`customer.panel_credential_stored`) |
| 7 | Uită cheia de panel — `DELETE /admin/customers/:id/panel/credential` | `services.write` | **Nu** | Da | Da | Da | Da (`customer.panel_credential_forgotten`) |
| 8 | Suspendă / reactivează client — `POST /admin/customers/:id/suspend` | `customers.write` | Da | Da | **Da, cu defect** (ADM-P1-02) | **Parțial** | Da (`customer.suspended` / `customer.reinstated`) |
| 9 | Lista comenzilor — `GET /admin/orders` | `orders.read` | Da | Da | Da | Da | n/a |
| 10 | Filtru comenzi — `?status=` | `orders.read` | Da | Da | Da | Da | n/a |
| 11 | Căutare comenzi | — | **Nu** | **Nu** | — | — | — |
| 12 | Reconciliază prețurile instantelor — `POST /admin/instances/reconcile-prices` | `pricing.write` | **Nu** | Da | Da | Da | Da, numai dacă corectează ceva (ADM-P3-03) |
| 13 | Confirmă încasare locală — `POST /admin/invoices/:id/confirm-collection` | `orders.write` | **Nu** | Da | Da | Da | Da (`invoice.collection_confirmed`) |
| 14 | Rambursează comandă — `POST /admin/orders/:id/refund` | `orders.write` | Da | Da | **Netestabil de capăt în cap** (fără furnizor) | Da | Da (`order.refunded`) |
| 15 | Lista serviciilor — `GET /admin/services` | `services.read` | Da | Da | Da | Da | n/a |
| 16 | Filtru servicii — `?status=` / `?search=` | `services.read` | Da | Da | Da | Da | n/a |
| 17 | Lista catalogului — `GET /admin/products` | `products.read` | Da | Da | Da | Da | n/a |
| 18 | Creează produs — `POST /admin/products` | `products.write` | Da | Da | Da | Da | Da (`product.created`) |
| 19 | Modifică produs — `PATCH /admin/products/:id` | `products.write` | Da | Da | Da | Da | Da (`product.updated`) |
| 20 | Șterge produs — `DELETE /admin/products/:id` | `products.write` | Da | Da | Da | Da | Da (`product.deleted`) |
| 21 | Lista prețurilor — `GET /admin/pricing` | `pricing.read` | Da | Da | Da | Da | n/a |
| 22 | Modifică preț — `PUT /admin/pricing/:id` | `pricing.write` | Da | Da | Da | Da | Da (`pricing.updated`) |
| 23 | Lista biletelor — `GET /admin/tickets` | `tickets.read` | Da | Da | Da | Da | n/a |
| 24 | Filtru bilete — `?status=` | `tickets.read` | Da | Da | Da | Da | n/a |
| 25 | Căutare bilete | — | **Nu** | **Nu** | — | — | — |
| 26 | Atribuie bilet — `POST /admin/tickets/:id/assign` | `tickets.write` | Da | Da | Da | Da | Da (`ticket.assigned`) |
| 27 | Lista promoțiilor — `GET /admin/promotions` | `promotions.read` | Da | Da | Da | Da | n/a |
| 28 | Creează promoție — `POST /admin/promotions` | `promotions.write` | Da | Da | Da | Da | Da (`promotion.created`) |
| 29 | Modifică promoție — `PATCH /admin/promotions/:id` | `promotions.write` | Da | Da | **Doar `maxPerUser`** (vezi secțiunea 6) | Da | Da (`promotion.updated`) |
| 30 | Infrastructură — `GET /admin/infrastructure` | `infrastructure.read` | Da | Da | Da | Da | n/a |
| 31 | Sincronizează infrastructura — `POST /admin/infrastructure/sync` | `infrastructure.write` | Da | Da | Da | Da | Da (`infrastructure.synced`) |
| 32 | Jurnal — `GET /admin/audit` | `audit.read` | Da | Da | Da | Da | n/a |
| 33 | Filtrare jurnal — `?actor=` / `?action=` / `?targetType=` | `audit.read` | Da | Da | Da | Da | n/a |
| 34 | Lista personalului — `GET /admin/staff` | `staff.read` | Da | Da | Da | Da | n/a |
| 35 | Modifică permisiuni / rol — `PUT /admin/staff/:userId` | `staff.write` | Da (doar pentru ADMIN) | Da | **Da, cu defect** (ADM-P1-01) | **Nu** | Da (`staff.permissions_updated`, `staff.title_updated`) |
| 36 | Setări — `GET /admin/settings` | `settings.read` | Da | Da | Da | Da | n/a |
| 37 | Scrie setări — `PUT /admin/settings` | `settings.write` | Da | Da | Da | Da | Da (`settings.updated`) |
| 38 | Raport de livrare e-mail — `GET /admin/email/delivery` | `settings.read` | **Nu** | Da | Da | Da | n/a |
| 39 | Reluează provisionarea — `POST /admin/instances/:id/retry` | `services.write` | Da | Da | Da | Da | Da (`instance.retry_requested`) |
| 40 | Importă server de panel — `POST /admin/instances/import` | `services.write` **+ rol ADMIN** | **Nu** | Da | Da (poarta de rol) | Da | Da (`instance.imported`) |
| 41 | Exemplu de format monetar — `GET /admin/money` | `pricing.read` | **Nu** | Da | Da (fără valoare reală) | Da | n/a |
| 42 | Operații în masă (oricare listă) | — | **Nu** | **Nu** | — | — | — |
| 43 | Paginare / sortare (oricare listă) | — | **Nu** | **Nu** | — | — | — |
| 44 | Impersonare client | — | **Nu** | **Nu** | — | — | — |

### 3.1 Rezumat numeric

| Categorie | Număr |
|---|---|
| Funcții administrative existente, care funcționează | **34** din 40 de rute API |
| Funcții parțial conectate (API există, interfața nu expune sau expune incomplet) | **6** (nr. 5, 6, 7, 12, 13, 38, 40, 41 — 8 rânduri, din care 6 sunt complet absente din interfață) |
| Funcții complet lipsă (nici API, nici interfață) | **4** (căutare în comenzi, căutare în bilete, operații în masă, impersonare) |
| Rute API care nu apar deloc în interfață | **8** (nr. 5, 6, 7, 12, 13, 38, 40, 41) |
| Rute API cu defect de aplicare a permisiunii | **2** (nr. 1 — domeniu prea larg; nr. 35 — escaladare) |
| Ecrane care nu se încarcă deloc pentru un cont fără permisiune | **0** |

---

## 4. Constatări

### ADM-P1-01 — Escaladare de privilegii: un personal cu `staff.write` își poate acorda 20 din cele 21 de permisiuni

**Severitate:** High (Critical dacă `staff.write` este delegată în producție)
**Clasă de evidență:** **VERIFIED** (măsurat de două ori: pe stiva comună izolată și pe stiva proprie `admfunc_test` — secțiunea 2.5)
**Rută afectată:** `PUT /api/admin/staff/:userId` — `api/src/routes/admin.ts:1022`
**Interfață:** `web/src/admin/Staff.tsx:60`

**Comportament observat.** Un cont cu rolul `STAFF` și permisiunile `['tickets.read','staff.write']` a primit `200` la cererea de a-și acorda sieși 20 din cele 21 de permisiuni (toate în afară de `audit.read`). Escaladarea a fost **imediat activă**: la cererea următoare, același cont a citit `GET /api/admin/settings` cu `200` și a scris `PUT /api/admin/settings` cu `200`. Aceleași 20 de permisiuni au putut fi acordate și **unui alt cont de personal**, tot cu `200`. Singura combinație refuzată a fost cea de 21 de permisiuni unice (`403`, „Only an administrator can grant the whole permission list."), respectiv 21+dubluri (`403`, același mesaj).

```
### A. STAFF with staff.write granting permissions to itself
self-grant 20 of 21 permissions -> 200
session now carries permissions: ["customers.read","customers.write","orders.read","orders.write",
  "services.read","services.write","products.read","products.write","pricing.read","pricing.write",
  "tickets.read","tickets.write","promotions.read","promotions.write","infrastructure.read",
  "infrastructure.write","staff.read","staff.write","settings.read","settings.write"]
GET /api/admin/settings with the escalated account -> 200
GET /api/admin/staff with the escalated account -> 200

### A2.
self-grant all 21 -> 403 "Only an administrator can grant the whole permission list."
self-grant 21 + duplicates -> 403 "Only an administrator can grant the whole permission list."
```

Pe stiva proprie (`admfunc_test`, API propriu pe 3121), rezultatul este identic:

```
self-grant 20 of 21 -> 200
the session now carries 20 permissions
GET /api/admin/settings with the escalated account -> 200
GET /api/admin/staff with the escalated account -> 200
self-grant all 21 -> 403 Only an administrator can grant the whole permission list.
```

**Comportament așteptat.** Modificarea permisiunilor și a rolului unui membru de personal este o operație de administrator. Interfața spune exact asta — `web/src/admin/Staff.tsx:60` (`const mayEdit = staff?.role === 'ADMIN';`) și textul „Only an administrator can change a role or the permissions of an administrator. You see the list read-only." Măsurarea în interfață a confirmat că toate cele **714** casete de selectare sunt `disabled` pentru un cont cu `staff.read`+`staff.write`. **Serverul nu reproduce această restricție**, iar un apel direct prin API o ocolește.

**Cauză rădăcină (confirmată în cod).** `api/src/routes/admin.ts:1059`:

```ts
if (body.permissions !== undefined && new Set(body.permissions).size >= PERMISSIONS.length && actor.role !== 'ADMIN') {
  throw forbidden('Only an administrator can grant the whole permission list.');
}
```

Singura poartă pentru un non-administrator este „nu acorda lista întreagă". Nu există nicio poartă care să impună rolul ADMIN, niciuna care să interzică modificarea propriului cont, niciuna care să impună ca modificarea să nu crească numărul de permisiuni.

**Reproducere.**
1. Creează un personal cu rolul `STAFF` și permisiunile `tickets.read`, `staff.write`.
2. `PUT /api/admin/staff/<propriul userId>` cu corpul `{"permissions": [<20 de permisiuni>]}`. → `200`.
3. `GET /api/auth/session` → lista de permisiuni conține cele 20.
4. `GET /api/admin/settings` → `200`; `PUT /api/admin/settings` → `200`.

**Impact.** Un cont de personal căruia i s-a delegat `staff.write` poate ajunge la controlul administrativ aproape complet, alegând singur cea de 21 de permisiuni pe care o lasă afară. Poate modifica prețuri, catalogul, setările platformei, comenzile, clienții, personalul și infrastructura. Poate face acest lucru pentru sine sau pentru orice alt personal, ceea ce permite și escaladarea unui al doilea cont (de exemplu, unul deja compromis, folosit ca pivot).

**Remediere propusă.**
1. În `PUT /api/admin/staff/:userId`, cere rolul ADMIN pentru **orice** modificare a câmpului `permissions` sau `role`, indiferent de câte permisiuni se schimbă. Astfel, interfața și serverul spun același lucru.
2. Interzice explicit modificarea propriului cont (`actor.id === userId`) prin acest capăt; un administrator care își schimbă propriile drepturi o face printr-o cale separată, journalizată distinct.
3. Dacă delegarea către personal trebuie păstrată, limiteaz-o la o listă explicită de permisiuni „delegabile" (de exemplu doar `tickets.*`, `orders.read`), menținută într-un singur loc, folosită și de server și de interfață.

**Criterii de verificare.**
- `PUT /api/admin/staff/:userId` cu `permissions` de mărime 20, cu rolul `STAFF` → `403`, indiferent de țintă (inclusiv propria).
- Același lucru cu rolul `ADMIN` → `200`, cu intrare în jurnal.
- `PUT` cu rolul `STAFF` pe o listă de 21 → `403`.
- Test de regresie: un personal cu `staff.write` nu poate ajunge la `settings.write`, `products.write`, `pricing.write` nici printr-un apel direct.
- Interfața și serverul trebuie să răspundă la aceeași întrebare, în același mod.

**Notă privind rapoartele anterioare.** Registrul de constatări (`audit/12-FULL-FINDINGS-REGISTER.md`) marchează `SEC-04` drept „FIXED & VERIFIED" cu descrierea „Serverul refuza (403) schimbarea rolului si a permisiunilor unui administrator de catre un non-administrator". Acea afirmație este **corectă doar pentru liniile unui administrator**: schimbarea rolului este refuzată (`403`, „Only an administrator can change the role of a staff member.") și schimbarea permisiunilor unui **administrator** este refuzată (`403`, „Only an administrator can change the permissions of an administrator."). Ambele au fost re-measure și confirmate. Dar remedierea **nu** a închis calea de escaladare descrisă mai sus: permisiunile unui membru de personal rămân modificabile de către orice personal cu `staff.write`. Constatarea `SEC-04` este deci **parțial rezolvată**, nu rezolvată.

---

### ADM-P1-02 — `customers.write` poate suspenda un cont de administrator sau de personal

**Severitate:** High
**Clasă de evidență:** **VERIFIED** (măsurat de două ori: pe stiva comună izolată și pe stiva proprie `admfunc_test` — secțiunea 2.5)
**Rută afectată:** `POST /api/admin/customers/:id/suspend` — `api/src/routes/admin.ts:302`

**Comportament observat.** Un cont cu rolul `STAFF` și permisiunile `customers.read`, `customers.write`, `tickets.read`, `tickets.write` a suspendat contul de administrator (`admin.check.<RUN>`) cu `200`:

```
STAFF(rw) suspends the ADMIN account -> 200 {"customer":{"id":"usr_admin_check_...","suspended":true}}
the admin session still works: 200 no
```

Pe stiva proprie, cu un administrator nou la fiecare rulare:

```
STAFF(customers.write) suspends the administrator -> 200
the administrator can no longer sign in -> 401 This account is suspended.
undo by another administrator -> 200
```

Contul de administrator a fost blocat: autentificarea a răspuns `403` cu „This account is suspended." și toate sesiunile sale au fost șterse (următoarea cerere pe sesiunea existentă a răspuns `{ user: null }`). Același cont de personal a putut suspenda și un alt membru de personal (`200`).

**Comportament așteptat.** O permisiune despre clienți nu ar trebui să poată opri un cont de administrator. Suspendarea unui cont de personal trebuie să fie o operație de administrator, iar suspendarea clienților trebuie să fie limitată la conturile cu rol `CUSTOMER`.

**Cauză rădăcină (confirmată în cod).** `api/src/routes/admin.ts:307-314`:

```ts
const customer = await prisma.user.findUnique({ where: { id } });
if (!customer) throw notFound('Customer not found.');
await prisma.$transaction([
  prisma.user.update({ where: { id }, data: { suspendedAt: suspended ? new Date() : null } }),
  ...(suspended ? [prisma.session.deleteMany({ where: { userId: id } })] : []),
]);
```

Nu există niciun filtru pe rol. Calea este numită „customers", dar identificatorul poate fi al oricărui cont.

**Reproducere.**
1. Autentifică-te ca personal cu `customers.write`.
2. `GET /api/admin/staff` → obține `userId`-ul contului de administrator.
3. `POST /api/admin/customers/<userId-ul administratorului>/suspend` cu `{"suspended": true, "reason": "..."}` → `200`.
4. `POST /api/auth/login` cu administratorul → `403`, „This account is suspended."

**Impact.** Doi administratori (unul suspendat, celălalt folosit drept pivot) pot fi blocați de un cont de personal cu o permisiune despre clienți. Dacă este suspendat singurul administrator, platforma rămâne fără administrator: singura cale de revenire este o intervență directă în baza de date. Mecanismul de blocare (ștergerea sesiunilor) este, de altfel, corect implementat — problema este cine îl poate declanșa.

**Remediere propusă.**
1. În `POST /api/customers/:id/suspend`, respinge cu `403` orice `id` al cărui rol nu este `CUSTOMER`.
2. Adaugă un capăt separat, cu rol ADMIN obligatoriu, pentru suspendarea conturilor de personal (cu jurnal propriu).
3. Ca măsură de adâncime, cere rolul ADMIN pentru suspendarea unui cont care are rolul `STAFF` sau `ADMIN`, chiar dacă rămâne pe același capăt.

**Criterii de verificare.**
- `POST /api/admin/customers/<id de personal>` cu `customers.write` → `403`.
- `POST /api/admin/customers/<id de client>` cu `customers.write` → `200`, cu intrare în jurnal.
- `POST /api/admin/customers/<id de administrator>` cu `customers.write` → `403`.

---

### ADM-P2-01 — Panoul de control cere `customers.read` și expune cifre de ordine, servicii, bilete, venit și MRR

**Severitate:** High
**Clasă de evidență:** **VERIFIED** (măsurat de două ori: pe stiva comună izolată și pe stiva proprie `admfunc_test` — secțiunea 2.5)
**Rută afectată:** `GET /api/admin/overview` — `api/src/routes/admin.ts:50`
**Interfață:** `web/src/admin/Overview.tsx:340`

**Comportament observat.** Un cont cu rolul `STAFF` și **doar** `customers.read` a primit `200` pe `GET /api/admin/overview`, cu acest răspuns:

```json
{"overview":{"customers":9,"instances":3,"activeInstances":2,"openTickets":2,
 "ordersToday":4,"revenueMonth":2190,"provisioningFailures":0,"mrr":2190,"currency":"EUR"}}
```

Același cont a fost refuzat pe toate listele care stau la originea acestor cifre:

```
/api/admin/orders    -> 403 "Your role does not allow \"orders.read\"."
/api/admin/services  -> 403 "Your role does not allow \"services.read\"."
/api/admin/tickets   -> 403 "Your role does not allow \"tickets.read\"."
/api/admin/pricing   -> 403 "Your role does not allow \"pricing.read\"."
```

Pe stiva proprie, cu o comandă plătită și un abonament activ, cifrele nu sunt nule:

```
staff with only customers.read -> 200 {"overview":{"customers":1,"instances":1,"activeInstances":1,
  "openTickets":0,"ordersToday":1,"revenueMonth":5000,"provisioningFailures":0,"mrr":5000,"currency":"EUR"}}
the same staff on /api/admin/pricing -> 403 Your role does not allow "pricing.read".
```

Interfața arată exact aceleași cifre aceluiași cont (captură de ecran, Chromium):

```
CUSTOMERS            10    Accounts with the customer role.
INSTANCES             3    Every instance on the platform.
ACTIVE INSTANCES      2    Online, provisioning or restarting.
OPEN TICKETS          2    Not closed.
ORDERS TODAY          4    Placed since midnight.
REVENUE THIS MONTH    €21.90 / month
MONTHLY RECURRING REVENUE  €21.90 / month
PROVISIONING FAILURES 0
```

**Comportament așteptat.** Un cont care nu poate citi comenzile, prețurile, biletele și serviciile nu ar trebui să vadă cifra de venit, cea de MRR, numărul comenzilor sau numărul biletelor deschise. Cifrele de pe panou sunt agregate din aceleași tabele pe care contul nu le poate citi.

**Cauză rădăcină (confirmată în cod).** Singura poartă a capătului este `requirePermission('customers.read')`, în timp ce interogarea adună `instance.count`, `ticket.count`, `order.count` și sumele din `Order` și `Subscription`. Nu există niciun `requirePermission` suplimentar și nicio filtrare a cifrelor după permisiunile celui care întreabă.

**Reproducere.**
1. Cont `STAFF` cu permisiunile `['customers.read']`.
2. `GET /api/admin/overview` → `200`, cu `revenueMonth` și `mrr` populate.
3. `GET /api/admin/pricing` → `403`.
4. Deschide `/admin` în interfață cu același cont → cifrele de venit și MRR sunt afișate.

**Observație legată de rapoartele anterioare.** Brief-ul și raportul `22-admin-interface-audit.md` semnalau deja această nepotrivire. **Este încă prezentă și nu a fost remediată.** Nu am găsit în registrul de constatări nicio intrare care să declare rezolvat acest punct; verificarea de mai sus arată că nepotrivirea rămâne.

**Remediere propusă.**
1. Fie ceri un set explicit de permisiuni pentru panou (`requireAnyPermission(['orders.read','services.read','tickets.read','pricing.read'])`) și fie — preferabil — descompune panoul în două: un panou de citire a clienților (`customers.read`) și un panou financiar și operațional (`orders.read` + `pricing.read` + `services.read` + `tickets.read`), cu cifrele ascunse atunci când permisiunea lipsește (valoarea afișată ar trebui să fie „—", nu o estimare, în acord cu nota de la josul ecranului).
2. În varianta minimă, ascunde fiecare grup de cifre în funcție de permisiunea care îl justifică: `revenueMonth`/`mrr` → `pricing.read` + `orders.read`; `instances` → `services.read`; `openTickets` → `tickets.read`; `ordersToday` → `orders.read`.

**Criterii de verificare.**
- Cont cu numai `customers.read` → `GET /api/admin/overview` fie refuzat, fie cu cifrele care nu-i aparțin înlocuite cu „—".
- Cont cu `orders.read` + `pricing.read` → vede cifra de venit și MRR.
- Ecranul panoului nu afișează nicio cifră pe care contul nu o poate obține și din API.

---

### ADM-P2-02 — Navigația administrativă nu este filtrată pe permisiuni

**Severitate:** Medium (Low-Info dacă se consideră doar o problema de navigare)
**Clasă de evidență:** **VERIFIED**
**Fișiere:** `web/src/nav.ts` (lista `ADMIN_NAV`), `web/src/routes.tsx:108-120`

**Comportament observat.** La autentificarea ca personal cu numai `tickets.read`, pagina a expus toate cele 12 legături administrative:

```
nav links visible to a limited staff member: ["/admin","/admin/customers","/admin/orders","/admin/services",
"/admin/products","/admin/pricing","/admin/tickets","/admin/promotions","/admin/infrastructure","/admin/audit",
"/admin/staff","/admin/settings","/admin","/admin/customers","/admin/tickets","/admin/audit"]
```

Unsprezece dintre aceste legături duc la un ecran care răspunde „Your role does not allow \"X.read\"." Serverul este corect; interfața promite ceea ce nu poate oferi.

**Comportament așteptat.** Navigation should reflect what the account can do, or at least the entry points should be visibly disabled. The platform already has the helper for this (`web/src/admin/permissions.ts`, funcția `can`), folosit pe toate ecranele.

**Cauză rădăcină (confirmată în cod).** `ADMIN_NAV` este o listă statică, fără nicio legătură cu permisiunile contului.

**Reproducere.** Autentificare cu un cont `STAFF` cu `tickets.read` → inspectarea linkurilor din `nav` → 12 legături, dintre care 11 duc la ecrane inaccesibile.

**Remediere propusă.** Filtrarea listei `ADMIN_NAV` cu `can(staff, '<permișunea ecranului>')`, folosind o singură mapă ecran→permișune, folosită și de `routes.tsx` pentru a nu naviga nici la ecrane nepermise. Alternativ, păstrarea listei complete dar marcând explicit intrările nepermise, pentru ca operatorul să vadă că funcția există.

**Criterii de verificare.**
- Cont cu `tickets.read` → navigarea conține doar ecranele pe care le poate deschide.
- Un cont nou, cu un set nou de permisiuni, vede o navigare coerentă cu ce poate face.

---

### ADM-P2-03 — Nicio căutare în comenzi și în bilete, nicio paginare și nicio sortare în nicio listă

**Severitate:** Medium
**Clasă de evidență:** **VERIFIED**
**Rută afectate:** `GET /admin/orders` (`api/src/routes/admin.ts:328`), `GET /admin/tickets` (`api/src/routes/admin.ts:730`), și toate celelalte liste
**Interfață:** `web/src/admin/Orders.tsx`, `web/src/admin/Tickets.tsx`

**Comportament observat.**

1. **Căutarea nu există** în comenzi și bilete. `GET /admin/orders?search=BULK-0259` a întors **toate cele 264** de comenzi (`total=264`), nu doar comanda căutată. `GET /admin/tickets?search=Bulk%20ticket%20259` a întors **toate cele 263** de bilete. Căutarea funcționează doar pe clienți (`GET /admin/customers?search=bulk.customer.259` → 1 rezultat, `total=1`) și pe servicii.
2. **Niciun parametru de paginare sau de sortare nu este onorat.** Aceeași listă de 200 de rânduri a fost întorsă pentru `page=2`, `limit=10`, `take=10`, `offset=10`, `cursor=abc`, `sort=name`, `orderBy=name`, `order=asc`, `pageSize=5` — toate cu 200 de rânduri și cu aceleași rânduri.
3. **Trunchierea este anunțată, nu este tăcută.** API-ul întoarce `total`, iar interfața afișează „Showing the first 200 of 264. The API returns the first rows only, so the older entries are not in this list." (componenta `TruncationNote`, `web/src/admin/Overview.tsx:175`).

```
customers    rows=200   total=269    truncated=YES
orders       rows=200   total=264    truncated=YES
tickets      rows=200   total=263    truncated=YES
services     rows=3     total=3      truncated=no
audit        rows=187   total=187    truncated=no
staff        rows=32    total=undefined truncated=no
promotions   rows=11    total=11     truncated=no
products     rows=11    total=undefined truncated=no
pricing      rows=10    total=undefined truncated=no
```

**Comportament așteptat.** O coadă de suport și o listă de comenzi fără căutare sunt greu de folosit când platforma are sute de obiecte; trunchierea fără posibilitatea de a trece la pagina următoare face ca unele obiecte să fie inaccesibile prin interfață. Interfața nu oferă niciun câmp de căutare pe aceste două ecrane (doar un filtru de stare), deci și acolo lipsește funcția.

**Cauză rădăcină (confirmată în cod).** Schema de validare a interogării acceptă doar starea:

```ts
const query = z.object({ status: z.string().optional() }).parse(request.query ?? {});   // admin.ts:329 (comenzi)
const query = z.object({ status: z.string().optional() }).parse(request.query ?? {});   // admin.ts:731 (bilete)
```

Parametrii necunoscuți sunt ignorați de `zod` fără eroare (`.parse` nu respinge chei necunoscute, iar obiectul `query` nu este folosit decât pentru `status`). Căutarea există doar în `admin.ts:94` (clienți) și `admin.ts:481` (servicii).

**Reproducere.**
1. `GET /api/admin/orders?search=orice` → 200, lista completă, `total` = numărul total.
2. `GET /api/admin/orders?page=2&limit=10` → 200, tot 200 de rânduri, aceleași ca fără parametri.

**Remediere propusă.**
1. Adaugă `search` la comanda de validare a lui `GET /admin/orders` și `GET /admin/tickets` (numărul comenzii, e-mailul clientului, subiectul biletului) și câmpul de căutare în interfață, pe modelul ecranului de clienți (debounce 300 ms — `web/src/admin/Customers.tsx:37`).
2. Adaugă paginare pe offset (`?offset=&limit=`) cu un plafon maxim, și propagă parametrii în interfață.
3. Pentru listele care ating plafonul (200 pentru comenzi, clienți și bilete; 300 pentru servicii și jurnal), păstrează `total` și întoarce un indicator explicit (`truncated: true`) pe lângă el.

**Criterii de verificare.**
- `GET /api/admin/orders?search=<număr>` întoarce doar comenzile care se potrivesc.
- `GET /api/admin/orders?offset=200&limit=200` întoarce următoarele rânduri.
- Ecranul de comenzi și cel de bilete au un câmp de căutare care schimbă cererea trimisă.

---

### ADM-P2-04 — Operații în masă: absente în API și în interfață

**Severitate:** Medium (Low-Info dacă nu sunt cerute de modelul de business)
**Clasă de evidență:** **VERIFIED**
**Rută afectate:** toate listele administrative

**Comportament observat.** Patru încercări de operație în masă, toate refuzate cu `404`:

```
POST /api/admin/customers/bulk -> 404 "No such endpoint."
POST /api/admin/orders/bulk    -> 404 "No such endpoint."
POST /api/admin/tickets/bulk   -> 404 "No such endpoint."
POST /api/admin/products/bulk  -> 404 "No such endpoint."
```

Nicio listă din interfață nu oferă selectare multiplă și nicio acțiune în masă.

**Comportament așteptat.** Depinde de cerința de business; nu este o funcție anunțată în specificație. Se raportează pentru că brief-ul cere inventarul funcțiilor administrative și starea efectivă a lor.

**Cauză rădăcină.** Nu există astfel de capete în `api/src/routes/admin.ts`.

**Remediere propusă.** Dacă operațiile în masă sunt cerute (de exemplu, suspendarea în masă a clienților cu datorii sau ștergerea în masă a promoțiilor expirat), trebuie proiectate cu o singură operație de server care trece prin aceeași poartă de permisiune și **scrie o intrare de jurnal pentru fiecare obiect**, nu una pentru grup. Dacă nu sunt cerute, se poate considera închis.

**Criterii de verificare.** Dacă se implementează: un apel în masă cu un cont lipsit de permisiune este refuzat integral; fiecare obiect modificat produce propria intrare de jurnal.

---

### ADM-P2-05 — Mutații existente în API, dar pe care interfața nu le expune

**Severitate:** Medium (funcționalitate lipsă pentru operator)
**Clasă de evidență:** **VERIFIED**
**Rută afectate:** 8 capete — vezi secțiunea 6

**Comportament observat.** Opt funcții administrative reale nu au nicio urmă în interfață. Dintre ele, două sunt operații pe care un operator le are nevoie în cursul normal:

- `POST /admin/customers/:id/panel/credential` — stocarea cheii de client a panoului, descrisă în cod drept „the way in when the key bridge of the panel is not installed yet". Interfața nu cere și nu afișează niciodată această cheie. Când podul de chei nu este instalat, operatorul **nu are nicio cale prin interfață** de a preda o instanță.
- `POST /admin/instances/import` — importarea unui server de panel existent, pentru o platformă care a fost deja în funcțiune. Numai prin API.
- `GET /admin/email/delivery` — raportul stării livrării e-mailului (număr de mesaje, încercări, ultima clasă de eroare). Nu are ecran; singura urmă în interfață este textul „Email delivery" din pagina de setări, fără nicio legătură la acest capăt.
- `GET /admin/customers/:id/panel` — maparea dintre contul clientului și contul de panel (`pterodactylUserId`, `externalId`, dacă există o cheie stocată). Ecranul clientului nu o arată.

**Comportament așteptat.** Capacitățile de administrare pe care API-ul le oferă ar trebui să fie accesibile operatorului prin interfață, cel puțin când sunt singura cale de a îndeplini o sarcină.

**Remediere propusă.** Pentru cele patru capete cu valoare operațională (cheia de panel, importul, maparea de panel, raportul de e-mail), adaugă secțiuni pe ecranele existente: fișa clientului (cheie și mapare de panel), ecranul infrastructurii (import) și ecranul setărilor (livrarea e-mailului). Fiecare trebuie să folosească aceeași poartă de permisiune ca API-ul.

**Criterii de verificare.** Fiecare funcție de mai sus are un control în interfață, produce efectul așteptat și este journalizată.

---

### ADM-P3-01 — Atribuirea unui bilet cere `staff.read` în interfață, deși API-ul cere doar `tickets.write`

**Severitate:** Medium
**Clasă de evidență:** **VERIFIED**
**Interfață:** `web/src/admin/Tickets.tsx:107`, `:384`, `:397`, `:411`
**API:** `POST /api/admin/tickets/:id/assign` — `api/src/routes/admin.ts:768`

**Comportament observat.** Controalele de atribuire din panoul de bilete sunt dezactivate pentru un cont fără `staff.read`, iar interfața explică: „Your role does not hold „staff.read", so the list of staff cannot be read and a ticket cannot be assigned from here." API-ul, în schimb, cere numai `tickets.write` — un cont cu `tickets.write` fără `staff.read` **poate** atribui un bilet printr-un apel direct, și atribuirea este journalizată.

**Comportament așteptat.** Cele două căi trebuie să ceară aceleași lucruri. Ori interfața trebuie să umple lista de personal dintr-o sursă pe care un cont cu `tickets.write` o poate citi, ori API-ul trebuie să ceară și `staff.read`.

**Cauză rădăcină.** Lista de personal este luată de la `GET /admin/staff`, care cere `staff.read`. Condiția din interfață (`mayReadStaff`) este corectă pentru endpoint-ul pe care îl apelează, dar endpointul ales nu este cel potrivit pentru rolul „tickets.write".

**Reproducere.** `POST /api/admin/tickets/:id/assign` cu `{"userId": "<un personal>"}` de către un cont cu `tickets.write` fără `staff.read` → `200`, cu intrare `ticket.assigned` în jurnal. În interfață, același cont găsește butonul dezactivat.

**Remediere propusă.** Cea mai mică schimbare: adaugă un capânt dedicat, de exemplu `GET /admin/staff/assignable` (doar `userId`, nume, rol), cu permisiunea `tickets.read`, folosit de interfață. Alternativ, cere `staff.read` și în API, dacă lista de personal este într-adevăr informație pe care un rol de suport nu trebuie să o aibă.

**Criterii de verificare.** Un cont cu `tickets.write` și fără `staff.read` poate atribui un bilet și din interfață, și prin API, cu aceeași poartă de permisiune.

---

### ADM-P3-02 — Jurnalul modificărilor de permisiuni nu notează ce a fost eliminat

**Severitate:** Low-Info
**Clasă de evidență:** **VERIFIED**
**Rută:** `PUT /api/admin/staff/:userId` — `api/src/routes/admin.ts:1022`

**Comportament observat.** Intrarea de jurnal conține **lista nouă**, nu diferența:

```
staff.permissions_updated actor=esc.staff.<RUN> target=user:usr_rw_staff_<RUN>
  meta={"permissions":["customers.read","customers.write","orders.read", ... "settings.read","settings.write"]}
```

O revizuire a drepturilor unui membru de personal arată, în jurnal, drepturile pe care le are acum. Ce a fost **eliminat** se poate deduce numai comparând două intrări succesive ale aceluiași ținte.

**Comportament așteptat.** O intrare de jurnal despre o schimbare de privilegii ar trebui să spună și ce s-a pierdut; o revizuie după o revizuire este o urmărire manuală.

**Cauză rădăcină.** `api/src/routes/admin.ts:1063-1071` scrie în `meta` doar lista primită. Interfața știe să calculeze diferența (`changesOf`, `web/src/admin/Staff.tsx:78`) și o arată în dialogul de confirmare, dar nu și serverul.

**Remediere propusă.** Adaugă în `meta` câmpurile `added` și `removed`, calculate pe server din starea anterioară citită înainte de scriere.

**Criterii de verificare.** O intrare `staff.permissions_updated` conține explicit lista câștigată și lista pierdută.

---

### ADM-P2-06 — Contul de autentificare blochează orice adresă după 10 cereri, chiar reușite, și chiar dacă adresa nu există

**Severitate:** Medium (disponibilitate)
**Clasă de evidență:** **VERIFIED**
**Rută:** `POST /auth/login` — `api/src/routes/auth.ts:223`, poarta `accountGuard(app, 10)` din `api/src/routes/auth.ts:182`

**Comportament observat.** Trei măsurători exacte, făcute pe adrese distincte, pe stiva izolată:

```
A. numai semnări reușite, cont existent
   1:200 2:200 3:200 4:200 5:200 6:200 7:200 8:200 9:200 10:200 11:429 12:429

B. cinci parolă greșită, apoi una corectă, apoi alte parolă greșite
   w1:401 w2:401 w3:401 w4:401 w5:401 good:200 w-after-1:401 w-after-2:401 w-after-3:401
   w-after-4:401 w-after-5:429 w-after-6:429

C. aceeași cerere pe o adresă care nu există deloc
   1:401 2:401 3:401 4:401 5:401 6:401 7:401 8:401 9:401 10:401 11:429
```

Trei consecințe:

1. **Contorul numără și autentificările reușite.** A zecea semnare reușită trece, a unsprezecea este refuzată cu `429 rate_limited`. Un operator care își reînnoiește sesiunea de mai multe ori, sau doi operatori care folosesc același cont de personal, se blochează singuri.
2. **Contorul nu se resetează la o autentificare reușită.** După cinci încercări greșite și una reușită, contorul ajunge la 6; refuzul vine la a zecea cerere în total, nu la a zecea greșită.
3. **Contorul se aplică și adreselor care nu există.** Un apelant neautentificat poate bloca orice adresă cunoscută — inclusiv pe cea a unui administrator — cu **10 cereri**, pentru 15 minute. Nu este necesar ca adresa să existe și nici ca parola să fie greșită în mod convingător.

**Comportament așteptat.** O limită care există ca protecție contra ghicirii parolelor nu ar trebui să blocheze conturi existente la autentificări reușite, nici să poată fi declanșată la întâmplare împotriva unei adrese inexistente. Contorul pe cont ar trebui să numere doar încercările **eșuate**, iar blocarea unui cont valid ar trebui să aibă un prag mai mare sau să fie legată de o combinație de adresă și cont.

**Cauză rădăcină (confirmată în cod).** `api/src/routes/auth.ts:86-99`:

```ts
function accountGuard(app: FastifyInstance, max: number) {
  const limiter = app.createRateLimit({ max, timeWindow: ACCOUNT_ATTEMPTS_WINDOW, keyGenerator: accountKey });
  return async (request: FastifyRequest) => {
    const result = await limiter(request);
    if (result.isAllowed) return;
    if (!result.isExceeded) return;
    throw tooMany();
  };
}
```

`accountKey` (linia 70) cheamă `request.body.email` — deci contorul este pe adresa trimisă în corp, indiferent dacă adresa există sau dacă parola a fost corectă — și contorul este folosit înainte ca autentificarea să fie încercată, așa că și un `200` îl consumă.

**Reproducere.**
1. `POST /api/auth/login` cu `{ "email": "<orice adresă>", "password": "..." }`, de 11 ori, cu aceeași adresă.
2. A 11-a cerere răspunde `429` cu `{"error":{"code":"rate_limited"}}`.
3. Fă aceeași cerere de 11 ori pe adresa unui administrator cunoscut: administratorul nu se mai poate autentifica până la trecerea ferestrei.

**Observație privind brief-ul.** Brief-ul afirma că „limita de semnare pe stiva izolată a fost ridicată (500 pe 15 minute)". Măsurătorile arată că doar **limita pe adresă** a fost ridicată (`LOGIN_RATE_LIMIT_MAX=500`); **limita pe cont a rămas la 10**, așa cum este codificată în `accountGuard(app, 10)`. Stiva izolată se comportă, așadar, ca producția din acest punct.

**Remediere propusă.**
1. Numără doar autentificările **eșuate** în contorul pe cont; o autentificare reușită nu trebuie să consume limita.
2. Nu aplica contorul pe adrese care nu corespund unui cont existent (verificarea existenței contului înainte de a crea cheia contorului), sau folosește un prag separat, mult mai mare, pentru adresele inexistente.
3. Rezervă separat contorul pe **adresă + cont**, cu un prag mai mare, astfel încât un apelant să nu poată bloca un cont cunoscut de la mai multe adrese.
4. La refuz, un mesaj care să nu dezvălui dacă adresa există sau nu.

**Criterii de verificare.**
- 15 semnări reușite consecutive cu același cont → toate `200`.
- 10 parole greșite apoi una corectă → autentificarea reușită.
- 15 cereri pe o adresă inexistentă → toate `401`, niciuna `429` pe contul inexistent.
- Un cont de administrator rămâne accesibil după un val de cereri pe adresa lui de la altă adresă de proveniență.

---

### ADM-P3-03 — Jurnalul nu notează o reconciliere a prețurilor care nu corectează nimic

**Severitate:** Low-Info
**Clasă de evidență:** **VERIFIED**
**Rută:** `POST /admin/instances/reconcile-prices` — `api/src/routes/admin.ts:367`

**Comportament observat.** La prima rulare, reconcilierea a corectat o instanță și a produs două intrări: `billing.instance_prices_reconciled` (cu `{"checked":3,"corrected":1}`) și `instance.price_reconciled` (cu diferența, prețul nou și cel vechi). La a doua rulare, când nu mai era nimic de corectat, **nu a apărut nicio intrare**.

**Comportament așteptat.** O operație de reconciliere este o trecere periodică; faptul că nu a găsit nimic de corectat este un rezultat, nu o lipsă. Înregistrarea lui ar permite operatorului să distingă „am rulat și nu era nimic" de „nu am rulat".

**Cauză rădăcină (confirmată în cod).** `api/src/services/billing.ts`, funcția `reconcileInstancePrices`, scrie în jurnal numai pentru fiecare instanță corectată; pentru paseul în ansamblu există o intrare doar când `corrected > 0`.

**Remediere propusă.** Scrie întotdeauna intrarea `billing.instance_prices_reconciled`, cu `checked` și `corrected` (de exemplu `corrected: 0`), ca în cazul cu corecții.

**Criterii de verificare.** Două rulări consecutive, a doua fără corecții, produc tot două intrări în jurnal.

---

### ADM-P3-04 — Un personal ne-administrator poate schimba titlul unui administrator

**Severitate:** Low
**Clasă de evidență:** **VERIFIED**
**Rută:** `PUT /api/admin/staff/:userId` — `api/src/routes/admin.ts:1022`

**Comportament observat.** `PUT /api/admin/staff/<userId-ul unui administrator>` cu `{"title": "x"}`, de către un personal cu rolul `STAFF` și toate cele 21 de permisiuni → `200`. Aceeași cerere cu `{"permissions": [...]}` → `403` („Only an administrator can change the permissions of an administrator."). Protecția acoperă permisiunile, nu și titlul.

**Comportament așteptat.** Un cont care nu poate schimba drepturile unui administrator nu ar trebui nici să-i modifice metadatele administrative, chiar dacă metadatele par inofensive: titlul este afișat în interfață în dreptul administratorului.

**Remediere propusă.** Extinde interdicția de la câmpul `permissions` la întreaga operație, atunci când ținta are rolul `ADMIN`, cu excepția modificării propriului titlu de către un administrator.

**Criterii de verificare.** Un personal ne-administrator primește `403` la orice modificare a unui administrator.

---

### ADM-P3-05 — Ecranul de personal afișează simultan „0 staff members" și „The staff list could not be loaded"

**Severitate:** Low
**Clasă de evidență:** **VERIFIED**
**Interfață:** `web/src/admin/Staff.tsx:178-182`

**Comportament observat.** Pentru un cont fără `staff.read`, ecranul arată în antetul live „0 staff members" și, imediat mai jos, blocul de eroare „The staff list could not be loaded / Your role does not allow „staff.read"." Cele două mesaje se contrazic.

**Comportament așteptat.** Fie un singur mesaj (numărul membrilor, sau motivul pentru care lista nu a putut fi citită), fie o distincție clară între „nu există membri" și „nu ai voie să vezi lista".

**Cauză rădăcină.** `LiveRegion` (linia 154) anunță `members.length`, iar `members` este lista goală în caz de eroare; blocul de eroare este randat separat.

**Remediere propusă.** Nu anunța numărul când lista nu a fost încărcată; afișează mesajul de eroare sau un text explicit de restricție.

**Criterii de verificare.** Ecranul nu afișează simultan un număr și o eroare de încărcare.

---

### ADM-P3-06 — `GET /admin/money` este un capăt mort

**Severitate:** Low-Info
**Clasă de evidență:** **VERIFIED**
**Rută:** `api/src/routes/admin.ts:1254`

**Comportament observat.** `GET /admin/money` întoarce `{"example":{"minorUnits":312,"majorUnits":"3.12"}}` — un exemplu de formatare, fără nicio valoare de business. Nu este apelat de nicio interfață și nu este folosit de niciun alt cod din `api/src`.

**Comportament așteptat.** Un capăt administrativ ar trebui să aibă o funcție sau să fie eliminat.

**Remediere propusă.** Elimină capătul, sau înlocuiește-l cu unul real (de exemplu, un raport al sumelor încasate, cu `pricing.read`), cu un ecran corespunzător.

**Criterii de verificare.** Nu mai există capete administrative fără apelator și fără valoare.

---

## 5. Funcții care lipsesc

### 5.1 Funcții pe care API-ul le oferă, dar interfața nu le expune

Verificat prin compararea apelurilor din `web/src/admin/*.tsx` cu lista rutelor din `api/src/routes/admin.ts` și prin capturarea traficului de rețea în Chromium.

| Funcție | Rută API | Permisiune | Ce face | Ecran unde ar trebui să stea |
|---|---|---|---|---|
| Maparea contului de panel | `GET /admin/customers/:id/panel` | `customers.read` | Arată `pterodactylUserId`, `externalId`, dacă există o cheie stocată și dacă podul de chei este activ | Fișa clientului (`CustomerDetail.tsx`) |
| Stocarea cheii de panel | `POST /admin/customers/:id/panel/credential` | `services.write` | Singura cale prin care operatorul preia o instanță când podul de chei nu este instalat | Fișa clientului |
| Uitarea cheii de panel | `DELETE /admin/customers/:id/panel/credential` | `services.write` | Șterge cheia stocată | Fișa clientului |
| Reconcilierea prețurilor | `POST /admin/instances/reconcile-prices` | `pricing.write` | Corectează prețul stocat al unei instanțe cu prețul configurației sale | Ecranul de prețuri sau cel de servicii |
| Confirmarea unei încasări | `POST /admin/invoices/:id/confirm-collection` | `orders.write` | Marchează o factură locală drept încasată | Ecranul comenzilor (facturile nu au ecran propriu) |
| Importul unui server de panel | `POST /admin/instances/import` | `services.write` + rol ADMIN | Importă o instanță existentă din Pterodactyl | Ecranul infrastructurii |
| Raportul de livrare a e-mailului | `GET /admin/email/delivery` | `settings.read` | Starea, numărul de încercări și ultima clasă de eroare a fiecărui mesaj | Ecranul setărilor |
| Exemplul de format monetar | `GET /admin/money` | `pricing.read` | Un exemplu gol, fără valoare | — (de eliminat) |

**Dovada că lipsesc:** niciunul dintre aceste șiruri nu apare în `web/src/admin/*.tsx` (verificat prin căutare după fiecare traseu); traficul de rețea capturat în Chromium pe cele 12 ecrane nu conține niciuna dintre aceste cereri.

### 5.2 Funcții pe care nici API-ul, nici interfața nu le oferă

| Funcție | Stare | Dovada |
|---|---|---|
| **Impersonarea unui client** | **Nu este implementată** | Căutare în `api/src` și `web/src` pentru `impersonat`, `impersonate`, `loginAs`, `switchToCustomer`, `su` — **nicio potrivire**. Nicio rută de administrare nu emite un act de identitate în numele unui client. Prin urmare: **nu există impersonare**, nici prin interfață, nici prin API |
| Căutare în lista comenzilor | Absentă | `GET /admin/orders` acceptă numai `status` (`admin.ts:329`); `?search=` este ignorat — măsurat: căutarea „BULK-0259" a întors toate cele 264 de comenzi |
| Căutare în coada de suport | Absentă | `GET /admin/tickets` acceptă numai `status` (`admin.ts:731`); `?search=` este ignorat — măsurat: căutarea a întors toate cele 263 de bilete |
| Operații în masă | Absentă | `POST /api/admin/{customers,orders,tickets,products}/bulk` → toate `404` |
| Paginare | Absentă | `page`, `limit`, `take`, `offset`, `cursor`, `pageSize` sunt toate ignorate; lista întoarce mereu primele 200 de rânduri |
| Sortare | Absentă | `sort`, `orderBy`, `order` sunt ignorate |
| Export al listei | Absentă | Niciun capăt de export în `api/src/routes/admin.ts` |
| Reactivarea unui client suspendat prin interfață | **Da, există** | `POST /admin/customers/:id/suspend` cu `suspended: false` este acționat din fișa clientului |
| Anularea unei rambursări | Absentă | `POST /admin/orders/:id/refund` este de o singură direcție; nu există o cale de anulare |
| Schimbarea rolului unui personal prin API | Restrânsă, dar prezentă | `403` pentru non-administratori (`admin.ts:1048`) |

---

## 6. Ce funcționează (măsurări pozitive)

Acestea sunt rezultate măsurate, nu presupuneri:

1. **Aplicarea permisiunilor pe server este solidă pe toate cele 40 de rute.** Un cont cu `tickets.read` a primit `403` pe 39 dintre 40 (`"Your role does not allow \"X.read\""` / `"...write\""`) și `200` pe exact cele două rute pe care le are voie (`GET /admin/tickets`, `GET /admin/tickets?status=OPEN`). Un client a primit `403 "Staff access only."` pe toate cele 40 de rute. Un personal cu toate cele 21 de permisiuni și rolul `STAFF` (nu ADMIN) a trecut peste tot, cu excepția capătului de import, care cere rolul ADMIN.
2. **Toate cele 18 mutații executate au produs o intrare în jurnal**, cu acțiunea, tipul țintei, id-ul țintei și un `meta` corespunzător: `product.created`, `product.updated`, `product.deleted`, `pricing.updated`, `promotion.created`, `promotion.updated`, `ticket.assigned`, `customer.suspended`, `customer.reinstated`, `staff.title_updated`, `staff.permissions_updated`, `settings.updated`, `instance.retry_requested`, `infrastructure.synced`, `customer.panel_credential_stored`, `customer.panel_credential_forgotten`, `invoice.collection_confirmed`. Singura mutație fără intrare a fost reconcilierea prețurilor, care nu a avut ce corecta (vezi ADM-P3-03).
3. **Trunchierea listelor este anunțată, nu tăcută.** API-ul întoarce `total`, iar interfața scrie „Showing the first X of Y. The API returns the first rows only, so the older entries are not in this list."
4. **Căutarea funcționează unde există** — pe clienți și pe servicii, cu debounce și cu `total` corect.
5. **Filtrele de stare funcționează** pe comenzi (`?status=PAID` → toate rândurile au starea `paid`) și pe bilete (`?status=CLOSED` → 1 rând).
6. **Acțiunile distructive sunt confirmate și explicate.** Ștergerea unui produs cere tastarea numelui exact („Type Audit audit-temp to confirm"), spune ce se întâmplă („Products that still have instances are refused by the API — hide the product instead") și este o acțiune distinctă de ascunderea produsului. Suspendarea unui client cere un motiv obligatoriu, explică efectul („ends every session of this account now and blocks new sign-ins. Their 0 instances keep running") și spune că este înregistrată în jurnal.
7. **Căutarea și filtrarea biletelor nu scurg către clienți.** `GET /tickets/:id` filtrează mesajele interne pentru cei care nu sunt personal (`tickets.ts:217-218`), iar un client primește `404` pentru un bilet care nu îi aparține (`tickets.ts:215`).
8. **Atribuirea unui bilet către un cont care nu este personal este respinsă** cu `400` („That person is not a staff member.").
9. **Toate cele 12 ecrane se încarcă pentru un administrator**, cu date: Clients 9 rânduri, Comenzi 4, Servicii 3, Catalog 11, Bilete 3, Promoții 11, Infrastructură 17, Jurnal 189, Personal 32.
10. **Un client nu poate deschide aria administrativă**: toate cele 12 adrese răspund „Your account does not have permission to open the admin area." și redirecționează în aria clientului.
11. **Modificările de preț, de rol și de permisiuni sunt protejate corect în cea mai mare parte**: schimbarea rolului este refuzată pentru non-administratori (`403`), iar schimbarea permisiunilor unui administrator este refuzată (`403`).
12. **Fișierele de font lipsă (`/fonts/proxima-nova-*.woff2`, 404 pe fiecare pagină) nu sunt un defect** — sunt documentate în `web/fonts.mjs`: tipografia nu este licențiată pentru web, iar stiva de rezervă rămâne în loc.

---

## 7. Ce nu am putut verifica, și de ce

| Nu am putut verifica | De ce | Ce ar trebui făcut |
|---|---|---|
| **Calea completă a rambursării** (`POST /admin/orders/:id/refund`) | Furnizorul de plăți nu este activ în stiva izolată; comanda nu are un `paymentIntent` de la Stripe, iar API-ul răspunde corect `409`. Nu s-a putut observa ce scrie în jurnal după o rambursare reală | Rulare cu un furnizor de plăți în modul de test, pe o comandă plătită |
| **Efectul final al importului de server** (`POST /admin/instances/import`) | Panoul Pterodactyl nu este accesibil; API-ul răspunde `500` pentru administrator și `400` pentru un personal ne-administrator | Verificare pe o stivă cu panoul pornit |
| **Limita de autentificare în producție** (10 pe cont în 15 minute) | Pe stiva izolată, contorul este în Redis și supraviețuiește resetului bazei de date; de aceea fiecare rulare a folosit adrese noi. **Observație importantă:** brief-ul spune că limita a fost ridicată la 500 pe 15 minute pe stiva izolată; în cod, ridicarea privește doar limita pe adresă (`LOGIN_RATE_LIMIT_MAX`), iar limita **pe cont** este codificată la `10` (`api/src/routes/auth.ts:182`, `accountGuard(app, 10)`). Pe stiva izolată am **măsurat exact** comportamentul (vezi ADM-P2-06): a 11-a cerere pe aceeași adresă este refuzată cu `429`, chiar dacă cele 10 anterioare au fost autentificări reușite, și chiar dacă adresa nu există — deci **limita pe cont nu a fost ridicată** | Măsurare pe stiva de producție, cu cont dedicate |
| **Comportamentul în producție al limitelor, al plăților și al e-mailului** | Stiva izolată rulează cu `NODE_ENV=test`, `STRIPE_TEST_MODE=true` | Audit pe o stivă de test identică cu producția |
| **Firefox și WebKit** | Nu sunt instalate pe VM | Instalare și repetarea verificărilor de interfață |
| **Randarea pe ecrane mici (telefon, tabletă)** | Scriptul a folosit doar 1440×1000 și 1500×1200 | Verificare cu dimensiuni mici |
| **Navigarea cu tastatura și accesibilitatea controalelor** | Verificarea a fost vizuală și de rețea, nu de comportament | Audit de accesibilitate separat |
| **Rezultatul reconcilierii când corectează ceva, în interfață** | Ecranul nu expune capătul | După implementarea din ADM-P2-05 |
| **Stabilitatea măsurătorilor** | Baza `blipmade_test` a fost resetată de două ori în timpul auditului de un proces `vitest` al altui agent; o măsurătoare (crearea unui produs de probă) a eșuat cu `500` pe o cursă între reset și ștergerea utilizatorului | Stivă de test dedicată, cu o singură rundă de teste la un moment dat |
| **Încadrarea în producție a celor 34 de rute** | Nu s-a făcut niciun apel pe stiva de producție (port 3100 / 3000), conform regulii | Un audit de implementare, fără apeluri reale |
| **Comportamentul când Redis sau baza de date cad** | Nu s-a tulburat stiva comună | Injectare de erori, într-o stivă proprie |

---

## 8. Concluzie

**Siguranța mediului.** Acest audit a scris exclusiv pe baza `blipmade_test` (stiva izolată comună) și pe o stivă proprie, `admfunc_test`, cu un proces API propriu pe `127.0.0.1:3121`. **Nu a scris niciun rând în baza de producție `blipmade` și nu a apelat producția** (nici `blipmade.com`, nici portul 3100, nici portul 30002, nici interfața de pe `10.77.0.13:3000`). Verificarea cu tiparele distinctive ale auditului în baza de producție întoarce zero pe toate cele zece tabele verificate (secțiunea 1.3).

Cadrul de permisiuni al platformei este, în general, **aplicat corect pe server**: toate cele 40 de rute refuză corect un cont fără permisiune, toate mutațiile măsurate sunt journalizate, iar acțiunile distructive sunt confirmate cu motiv. Cele trei probleme grave nu sunt în aplicarea de bază a permisiunilor, ci în **ceea ce o permisiune permisă**:

1. **`staff.write` este o escaladare de privilegii** — un cont de personal cu două permisiuni poate ajunge la 20 din cele 21 de permisiuni, pentru sine sau pentru orice alt personal, în timp ce interfața interzice explicit această operație. (ADM-P1-01)
2. **`customers.write` poate opri administratorii** — suspendarea nu verifică rolul țintei și șterge sesiunile, deci poate bloca singurul administrator al platformei. (ADM-P1-02)
3. **Panoul de control scurge cifre financiare** către un cont care nu poate citi nici comenzile, nici prețurile — o nepotrivire semnalată înainte și încă ne-remediată. (ADM-P2-01)

În rest, platforma are o acoperire funcțională bună a ariei administrative: 34 de funcții din 34 de rute API funcționează, 8 funcții administrative reale nu sunt expuse în interfață (două dintre ele sunt singura cale prin care un operator poate preda o instanță sau migra una), iar căutarea, paginarea și operațiile în masă lipsesc cu totul din arie.

O a patra problemă de severitate medie merită menționată alături de cele trei grave: **contorul de autentificare** numără și autentificările reușite și se aplică și adreselor inexistente, așa că zece cereri blochează orice adresă timp de 15 minute — inclusiv pe cea a unui administrator (ADM-P2-06).
