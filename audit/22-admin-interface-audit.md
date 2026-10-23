# Auditul interfeței administrative — platforma Blipmade

**Bază de cod:** `main` în `/root/blipmade-work` (mirror al aceluiași arbore de pe VM 103, `/opt/blipmade`).
**Data auditului:** 2026-10-23. **Regim:** read-only; singurul scris a fost acest fișier.
**Auditor:** A23 (a doua rundă, interfața administrativă).
**Clasele de verificare:** `VERIFIED`, `CODE-INSPECTED`, `DOCUMENTED-ONLY`, `INFERRED`, `UNVERIFIED`, `BLOCKED`, `NOT-IMPLEMENTED`.
**Severități:** `P0`, `Critical`, `High`, `Medium`, `Low / Info`.

---

## 1. Metodă

### 1.1 Ce s-a citit

- **Interfața:** toate cele 13 pagini din `web/src/admin/` (`Overview.tsx`, `Customers.tsx`, `CustomerDetail.tsx`, `Orders.tsx`, `Services.tsx`, `Products.tsx`, `Pricing.tsx`, `Tickets.tsx`, `Promotions.tsx`, `Infrastructure.tsx`, `Audit.tsx`, `Staff.tsx`, `Settings.tsx`), plus `web/src/router.tsx`, `web/src/routes.tsx`, `web/src/nav.ts`, `web/src/session.tsx`, `web/src/auth-guard.ts`, `web/src/ui-app.tsx`, `web/src/lib/api.ts`, `web/src/pages/Login.tsx`.
- **API-ul:** `api/src/routes/admin.ts` (integral, 956 de linii), `api/src/routes/tickets.ts`, `api/src/routes/orders.ts`, `api/src/routes/catalog.ts`, `api/src/routes/instances.ts`, `api/src/routes/settings.ts`, `api/src/routes/auth.ts`, `api/src/plugins/auth.ts`, `api/src/lib/permissions.ts`, `api/src/lib/audit.ts`, `api/src/services/availability.ts`, `api/src/services/pricing.ts`, `api/src/services/provisioning.ts`, `api/src/services/billing.ts`, `api/src/worker.ts`.
- **Corpusul existent:** `audit/00-BRIEFING.md`, `audit/02-security-audit.md`, `audit/01-backend-audit.md` și grupele `SEC-*` / `BE-*` din `audit/12-FULL-FINDINGS-REGISTER.md`. Constatările deja înregistrate **nu sunt repetate**: acolo unde le confirm, identificatorul lor este citat și se spune explicit dacă mai există în codul curent.

### 1.2 Ce s-a măsurat (fără efect pe stare)

| Instrument | Ce a produs | Unde |
|---|---|---|
| `sweep-before.json` (măsurătoarea deja existentă pe build-ul de producție, **nerulată din nou**) | numărul de rânduri, coloanele și textul fiecărei pagini administrative de pe producție | `audit/_tools/sweep-before.json` |
| Sondaje HTTP anonime pe stiva izolată | ce întoarce API-ul fără sesiune; starea produselor din catalogul public | `curl http://10.77.0.13:30003/api/catalog/products` |
| Sondaje cu sesiune de staff pe stiva izolată | diferența dintre `POST /auth/login` și `GET /auth/session` | `curl` pe stiva izolată |
| Sweep de browser (Playwright/Chromium pe VM) | apelurile de API ale fiecărei pagini administrative, stările DOM, rândurile de tabel, butoanele vizibile | `/tmp/a23/admin-audit.json`, `/tmp/a23/admin-detail.json` |
| `grep` pe `requirePermission(` | mapa rută → permisiune pentru toate cele 31 de rute administrative | `api/src/routes/admin.ts` |

### 1.3 Limitele declarate

- **Nicio scriere în platformă.** Nu s-a creat, modificat sau șters niciun rând din `blipmade_test` sau din producție; nu s-a declanșat niciun retry, suspendare, ștergere sau refund. Nu s-a rulat suita de teste și nu s-a aplicat nicio migrare.
- **Contoarele staff cu permisiuni limitate nu existau** în baza de test: cei doi membri staff din `blipmade_test` au rolul `ADMIN`. Prin urmare, constatările de tip „un staff fără permisiune poate face X" sunt `CODE-INSPECTED`: mecanismul (lipsa verificării de permisiune în `preHandler`) este concludent prin citirea codului, dar testul de execuție ar fi cerut **crearea unui cont staff**, adică o mutație — interzisă. Se vede în „Ce nu a putut fi verificat".
- Limitarea de rată a loginului (`max: 10` / 15 min per adresă, `api/src/routes/auth.ts:167`) a consumat câteva ferestre pe stiva izolată; măsurătoarea de browser a fost reluată după resetarea ferestrei. **Producția nu a fost atinsă** (niciun login, niciun `blipmade.com`).

---

## 2. Rezumatul constatărilor

| ID | Rută și componentă | Simptom | Sev. | Clasă | Unde e dovedit |
|---|---|---|---|---|---|
| ADM-01 | `/admin/tickets` → `web/src/admin/Tickets.tsx` + `api/src/routes/tickets.ts` | Coada de suport folosește rutele面向 client: firul, răspunsul și starea sunt verificate doar pe **rol**, nu pe `tickets.read` / `tickets.write` → orice staff (chiar fără nicio permisiune) citește orice bilet cu notele interne, **trimite e-mailuri clienților** și închide bilete | **Critical** | `CODE-INSPECTED` | `tickets.ts:192`, `:248-265`, `:401-414` vs. `admin.ts:611` |
| ADM-02 | `/admin/staff` → `web/src/admin/Staff.tsx` + `admin.ts:813` | **Escaladare de privilegii** (confirmă `SEC-04`, încă prezentă): `PUT /admin/staff/:userId` cere doar `staff.write`; interfața limitează editorul la `role === 'ADMIN'` — control **doar de client** | **High** | `CODE-INSPECTED` | `admin.ts:813-832`, `Staff.tsx:44` |
| ADM-03 | `/admin/services` → `web/src/admin/Services.tsx` + `admin.ts:865` | „Retry provisioning" apare pe **orice** instanță, inclusiv `ONLINE`; serverul nu verifică starea, iar singura apărare a workerului este anulată de endpoint → instanța e repusă în provisionare și, dacă panoul nu răspunde, e **repunctată pe un server nou** | **Critical** | `CODE-INSPECTED` | `Services.tsx:223-236`, `admin.ts:865-877`, `worker.ts:36-39`, `provisioning.ts:441-443`, `:487-497` |
| ADM-04 | `/admin/products` → `web/src/admin/Products.tsx` | Interfața nu are **niciun control pentru `eggId`** → un produs nou nu poate fi deschis pentru comandă (400) și un produs `TEMPORARILY_UNAVAILABLE` nu poate fi reparat decât prin scriere directă în baza de date | **High** | `VERIFIED` + `CODE-INSPECTED` | DOM pe stiva izolată (rândul WordPress), `Products.tsx:411-428`, `admin.ts:418`, `:442-444`, `:508-513`, `:750-762` |
| ADM-05 | `/admin/products` (desktop vs. telefon) | Pentru un produs blocat, tabelul de pe desktop **nu are** comutatorul „Stop ordering" (pila „Blocked" îl înlocuiește), iar lista de carduri de pe telefon îl are → cele două randări ale aceleiași liste nu corespund | Medium | `VERIFIED` | `Products.tsx:227-234` vs. `:305-327`; `ui-app.tsx:1055`, `:1101`; DOM măsurat |
| ADM-06 | `/admin/orders` → `web/src/routes/admin.ts` | **Nu există refund administrativ**: permisiunea `orders.write` e definită dar nu e folosită de nicio rută; clientul nu poate anula o comandă plătită → o plată greșită nu poate fi înapoiată prin platformă | **High** | `CODE-INSPECTED` | `permissions.ts:7`, `grep requirePermission('orders.write')` → 0 rezultate, `orders.ts:171` |
| ADM-07 | toată interfața admin, după autentificare | `POST /auth/login` întoarce `permissions: []`, `GET /auth/session` întoarce lista reală; clientul păstrează răspunsul de login și nu reîmprosptează sesiunea → **un staff cu permisiuni limitate se autentifică și vede întreaga interfață admin în read-only** până la reîncărcarea manuală a paginii | **High** | `VERIFIED` (API) + `CODE-INSPECTED` (client) | `auth.ts:70` vs. `auth.ts:205-210`; `session.tsx:72-76`; `Login.tsx:39-42`; `Overview.tsx:39-43` |
| ADM-08 | `/admin` (dashboard) | Pagina de început a adminului e poartă cu `customers.read`, dar expune **cifra de afaceri**: venitul lunii și MRR, plus numărul de comenzi și de bilete; invers, un staff cu doar `orders.read` primește 403 pe `/admin` | Medium | `CODE-INSPECTED` + `VERIFIED` | `admin.ts:48`, `:76-87`; `Overview.tsx:269-276`; textul capturat în browser |
| ADM-09 | `/admin/audit` | Jurnalul administrativ e plafonat la **300 de rânduri fără paginare** (în producție e deja saturat), nu conține **IP-ul sursă** al acțiunilor admin și nu afișează `meta` (motivul scris la suspendare/retry) | Medium | `VERIFIED` + `CODE-INSPECTED` | `admin.ts:779`, `:790`; sweep producție: 300 rânduri; `Audit.tsx:23`, `:126-158` |
| ADM-10 | `/admin/pricing` | Ecranul de prețuri nu are **nicio verificare de permisiune** (un staff cu `pricing.read` primește formular editabil + „Save price" → 403) și **nu poate dezactiva un preț** (`active` e afișat, nu editabil), deși serverul îl acceptă | Medium | `VERIFIED` + `CODE-INSPECTED` | `Pricing.tsx` (fără `can()`), `:78-83`, `:125`; `admin.ts:566`; `catalog.ts:131`; `pricing.ts:135-138` |
| ADM-11 | `/admin/tickets` (atribuire) | Meniul de atribuire se populează din `GET /admin/staff` (`staff.read`), apelat **necondiționat** → un staff cu `tickets.write` dar fără `staff.read` nu poate atribui niciun bilet, fără mesaj de eroare | Medium | `CODE-INSPECTED` | `Tickets.tsx:104`, `:213`; `admin.ts:796` |
| ADM-12 | listele administrative | Toate listele sunt plafonate server-side (200/300) **fără paginare și fără nicio indicație** că lista e trunchiată | Medium | `VERIFIED` + `CODE-INSPECTED` | `admin.ts:111`, `:316`, `:342`, `:589`, `:631`, `:779` |
| ADM-13 | `/admin/customers/:id`, `/admin/services` | Patru operații pe care API-ul le oferă **nu au interfață**: salvarea/ștergerea cheii de client a panoului, importul unei servere existente, raportul de livrare a e-mailului | Medium | `CODE-INSPECTED` | `admin.ts:236`, `:268`, `:849`, `:884`; `grep` în `web/src` → 0 apeluri |
| ADM-14 | `GET /api/catalog/products` (anonim) | Catalogul public, fără sesiune, expune `deployable`, `eggId` și mesajele interne de blocaj („Its image is not installed on the panel yet") | Low / Info | `VERIFIED` | `catalog.ts:114`, `:152`; răspunsul public capturat |
| ADM-15 | `/admin/infrastructure`, `/admin/pricing`, `/admin/staff`, `/admin/promotions` | **Patru acțiuni de scriere fără confirmare**: „Sync panel", „Save price", „Save permissions", crearea unei promoții | Low / Info | `VERIFIED` + `CODE-INSPECTED` | `Infrastructure.tsx:86`; `Pricing.tsx:215`; `Staff.tsx:206-210`; `Promotions.tsx:79` |
| ADM-16 | listele administrative (afișarea e-mailurilor) | Butonul „Show e-mails" dezvăluie adresele clienților în zona staff **fără nicio urmă în jurnal**, deși acțiunea e acțiune de administrare | Low / Info | `CODE-INSPECTED` | `Customers.tsx:13-15`, `Audit.tsx:74` |

---

## 3. Constatările, pe rând

### ADM-01 — Coada de suport: firul, răspunsul și starea sunt verificate pe rol, nu pe permisiune

**Simptom observat.** Ecranul `/admin/tickets` este construit peste **rutele orientate spre client**: lista vine din `GET /api/admin/tickets` (corect, `tickets.read`), dar firul de discuție, răspunsul și schimbarea stării vin din `/tickets/:id`, `/tickets/:id/replies`, `/tickets/:id/status` — rute în care singura verificare este „ești staff?". Concretințe:

- orice cont staff (rol `STAFF`) citește **orice bilet**, inclusiv notele interne și numele autorilor, chiar dacă lista sa de permisiuni e goală;
- orice cont staff **trimite un răspuns public** în numele suportului: `notifyReply()` trimite e-mailul la client (`tickets.ts:293-295`), iar starea biletului trece automat în `AWAITING_CUSTOMER` (`tickets.ts:278-282`);
- orice cont staff **schimbă starea** oricărui bilet, inclusiv închiderea lui (`tickets.ts:401-412`);
- orice cont staff poate încărca un atașament pe orice bilet (`tickets.ts:314-321`).

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/tickets.ts:192   app.get('/tickets/:id', …)            → requireAuth (fără tickets.read)
api/src/routes/tickets.ts:214-215  const isStaff = …; if (ticket.userId !== user.id && !isStaff) throw notFound(…)
api/src/routes/tickets.ts:220   .filter((message) => isStaff || !message.internal)   ← notele interne, pentru orice staff
api/src/routes/tickets.ts:248   app.post('/tickets/:id/replies', …)   → requireAuth + isStaff        (fără tickets.write)
api/src/routes/tickets.ts:263   const isStaff = user.role === 'STAFF' || user.role === 'ADMIN';
api/src/routes/tickets.ts:401   app.post('/tickets/:id/status', …)    → requireStaff                 (fără tickets.write)
```

Compară cu singura rută administrativă echivalentă, care e corectă:

```
api/src/routes/admin.ts:611     app.post('/admin/tickets/:id/assign', { preHandler: requirePermission('tickets.write') })
```

și cu helperul de permisiuni, care există și e folosit peste tot în `admin.ts`:

```
api/src/plugins/auth.ts:144-152   requirePermission(permission) → requireStaff(request) + hasPermission(...)
api/src/lib/permissions.ts:38-41  hasPermission(role, granted, permission)
```

Interfața **ascunde** acțiunile, dar nu le impune: `web/src/admin/Tickets.tsx:390` (selectorul de stare) și `:485` (butonul „Send reply", `disabled={reply.pending || !mayWrite}`) apar doar când `can(staff,'tickets.write')` — un control de client, fără corespondent pe server. Singurul lucru care se întâmplă e că răspunsul e **auditat** (`ticket.replied` la `tickets.ts:291`, `ticket.status_changed` la `tickets.ts:414`), deci abaterea e vizibilă în jurnal — dar nu e o apărare.

**Severitate: `Critical`. Clasă: `CODE-INSPECTED`** (mecanismul e concludent; testul de execuție ar necesita crearea unui cont staff, deci o mutație — interzisă).

**Impact (cine ajunge și ce poate face).** Un cont staff creat pentru un rol de suport de nivel 1, cu permisiunea `tickets.read` sau deloc, poate: (a) citi toate biletele platformei și notele interne ale colegilor; (b) trimite, din adresa Blipmade, mesaje către clienți care pretind că sunt suportul — cu acțiunea înregistrată în jurnal, dar în afara modelului de permisiuni; (c) închide sau bloca bilete, ceea ce schimbă starea de SLA a fiecărui client. Pierderea este de **control** și de **conformitate** (comunicare cu clienții din afara modelului de autorizare).

**Corectare recomandată (fără cod scris).**
1. `api/src/routes/tickets.ts`: înlocuiește `requireAuth`/`requireStaff` din cele patru rute cu `requirePermission('tickets.read')` / `requirePermission('tickets.write')` (`api/src/plugins/auth.ts:144`); păstrează verificarea de proprietar (`ticket.userId !== user.id`) doar pe rutele de client.
2. Dacă zona staff trebuie să rămână pe rute separate, creează `GET/POST /admin/tickets/:id[/replies|/status]` cu aceleași `preHandler: requirePermission(...)` ca lista din `admin.ts:578`, și schimbă `web/src/admin/Tickets.tsx:115` și `:270` să apeleze acele rute.
3. Adaugă în `api/src/lib/audit.ts` un câmp `permission` în `meta`, ca jurnalul să areste exact permisiunea folosită.

---

### ADM-02 — `PUT /admin/staff/:userId`: escaladare de privilegii (confirmă `SEC-04`; încă prezentă)

**Simptom observat.** Pe `/admin/staff`, un staff care are doar permisiunea `staff.write` poate, prin API, să își acorde lui însuși (sau oricărui membru staff) lista completă de 21 de permisiuni. Interfața nu arată nimic: editorul e randat doar pentru `role === 'ADMIN'`.

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/admin.ts:813   app.put('/admin/staff/:userId', { preHandler: requirePermission('staff.write') }, …)
api/src/routes/admin.ts:814   const actor = await requireStaff(request);      // ← acceptă și rolul STAFF
api/src/routes/admin.ts:826   ...(body.permissions ? { permissions: body.permissions } : {}),
web/src/admin/Staff.tsx:44    const mayEdit = staff?.role === 'ADMIN';       // ← control doar de client
```

Contrastul din același fișier arată că autorul știa unde trebuie verificat rolul: `admin.ts:886` — `if (actor.role !== 'ADMIN') throw badRequest('Only an administrator can import a server.')`. Verificarea lipsește doar pe ruta care acordă permisiunile.

**Starea în registru.** `SEC-04` (High, `CODE-INSPECTED`, `api/src/routes/admin.ts`) — **încă prezentă, fără remediere**. Ceea ce este nou: interfața ascunde butonul (deci diferența interfață↔server e acum demonstrabilă), iar acțiunea **este** auditată (`admin.ts:830`, `staff.permissions_updated`), deci abaterea este lizibilă în jurnal.

**Severitate: `High`. Clasă: `CODE-INSPECTED`.**

**Impact.** Un staff cu `staff.write` obține control deplin: `customers.write` (suspendă orice client, `admin.ts:282`), `settings.write` (vezi ADM-16/SEC-26: poate activa `auto_delete_cancelled_instances`, `api/src/services/billing.ts:29-34` → ștergerea serverelor clienților anulați), `audit.read` (citirea jurnalului), `staff.write` (se menține). Nu poate modifica rolul (doar lista de permisiuni), dar lista completă e echivalentă cu rolul ADMIN pentru tot ce e permis.

**Corectare recomandată.** `api/src/routes/admin.ts:813`: înlocuiește preHandler-ul cu `requireStaff` + verificarea explicită `if (actor.role !== 'ADMIN') throw forbidden('Only an administrator can change permissions.')`; alternativ, cere `staff.write` **și** `actor.role === 'ADMIN'`, ca la `admin.ts:886`. Adaugă în interfață, în `web/src/admin/Staff.tsx`, o notă explicită că serverul cere rolul ADMIN (nu doar permisiunea), ca interfața și serverul să spună același lucru.

---

### ADM-03 — „Retry provisioning" pe o instanță sănătoasă: instanța e repusă în provisionare, cu risc de repunere pe alt server

**Simptom observat.** Pe `/admin/services`, coloana „Action" conține butonul „Retry provisioning" pe **fiecare** rând, fără nicio condiție legată de stare; coloana „Status" din stânga arată că unele rânduri sunt `online`. Serverul acceptă reluarea indiferent de stare.

**Cauza root — confirmată, cu `file:line`.**

```
web/src/admin/Services.tsx:223-236   coloana „Action" este randată pentru toate serviciile, fără filtrare pe stare
api/src/routes/admin.ts:865           app.post('/admin/instances/:id/retry', { preHandler: requirePermission('services.write') })
api/src/routes/admin.ts:873           await prisma.instance.update({ … data: { status: 'PROVISIONING', provisionError: null } });
api/src/routes/admin.ts:874           await enqueueProvisioning(id, { reason, requestedBy: actor.id });
```

Singura apărare existentă în sistem este în worker, și ea este **anulată de endpoint**:

```
api/src/worker.ts:36-39     if (instance.status === 'ONLINE') { job.log?.('instance is already online'); return; }
```

Endpointul a scris deja `status = 'PROVISIONING'` înainte de a introduce jobul în coadă, deci workerul nu mai vede `ONLINE` și continuă fluxul de provisionare pe o instanță a cărei server este pornit și funcțional.

Ce urmează, în ordine:

1. `provisioning.ts:435-438` — `beginProvisioning()` (`:70-74`) scrie din nou `status: 'PROVISIONING'` și `ensurePterodactylUser()` e apelat; clientul vede instanța ca „provisioning" în loc de „online" (ambele zone folosesc aceeași stare: `admin.ts:348` și `instances.ts:39`).
2. `provisioning.ts:441-443` — serverul existent e căutat prin `ptero.getServer(...).catch(() => null)`: **orice eșec de comunicare cu panoul** (restart, rețea, 404) întoarce `null`, iar `if (!server)` (`:447`) intră în ramura de creare.
3. `provisioning.ts:458-497` — se creează un **server nou** pe panou și `pterodactylServerId`/`pterodactylUuid` sunt rescrise pe instanță. Serverul vechi, cu datele clientului, rămâne pe nod, neadministrat de platformă și încă consumând resurse.
4. Dacă orice pas eșuează, `provisioning.ts:677-681` → `failProvisioning()` (`:104-107`) scrie `status: 'FAILED'` pe o instanță al cărei container funcționează.

**Nicio apărare la declanșare dublă.** Endpointul nu are niciun marcaj de idempotență: două clicuri (două file, doi operatori) produc două joburi; al doilea lovește blocajul (`provisioning.ts:421-422`, „Another provisioning run is already working on this instance") și iese pe `failProvisioning` → `FAILED`. Blocajul ține 30 de minute (`PROVISION_LOCK_TTL_MS`), deci până atunci reluarea manuală nu poate trece (`BE-06`).

**Severitate: `Critical`. Clasă: `CODE-INSPECTED`** (mecanismul e determinist; nu s-a declanșat nicio reluare, nici pe stiva izolată).

**Impact.** Un click de operator pe o instanță `online` produce: (a) indisponibilitatea percepută a unui server funcțional; (b) în cazul panelului-neaccesibil, **pierderea accesului clientului la datele sale** (serverul nou e gol, cel vechi e orfan) plus cost dublu de resurse; (c) în cazul unui pas eșuat, starea `FAILED` pe un server care merge. Relativ la `BE-02` (marcajul de reluare distrus la fiecare tentativă) și `BE-06` (blocajul de 30 de minute).

**Corectare recomandată.**
1. `api/src/routes/admin.ts:865`: înainte de `update`, verifică starea și refuză cu `409` stările `ONLINE`, `STOPPED` sau `RESTARTING` — păstrează doar `FAILED`/`PROVISIONING` depășite. Adaugă un marcaj de idempotență (ex. `provisionRequestedAt` + comparație cu `provisionLockAt`) și întoarce `202` fără a reintroduce jobul dacă o reluare e deja în curs.
2. `api/src/worker.ts:36`: verifică starea **din job** și din istoricul jobului, nu doar din rând, ca o reluare să nu anuleze o instanție deja online.
3. `web/src/admin/Services.tsx:223`: randează butonul „Retry provisioning" doar pentru stările `FAILED` (și `PROVISIONING` expirată), iar în coloana „Status" adaugă un indicator al ultimei reluări.
4. `api/src/services/provisioning.ts:441-443`: când `pterodactylServerId` există și `getServer` eșuează, **nu** crea un server nou — aruncă o eroare explicită („the panel did not answer about the existing server") și cere intervență manuală.

---

### ADM-04 — Catalogul administrativ nu are control pentru `eggId`: un produs nu poate fi deschis pentru comandă din interfață

**Simptom observat (măsurat în browser, pe stiva izolată).** În catalogul public, produsul **WordPress** este `visible: true, deployable: true, eggId: null` → starea `TEMPORARILY_UNAVAILABLE`, cu motivul „Its image is not installed on the panel yet." În catalogul administrativ, același produs apare cu pastila „Blocked" și **nu are niciun comutator de „deployable"**. În plus, formularul de produs nou nu are câmp pentru egg.

```
GET /api/catalog/products  (public, fără sesiune)
  wordpress | visible True | deployable True | eggId None | state TEMPORARILY_UNAVAILABLE | orderable False
  blockers ['Its image is not installed on the panel yet.']
```

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/admin.ts:418   eggId: z.number().int().positive().nullable().optional()      ← serverul îl acceptă la POST
api/src/routes/admin.ts:442-444   if (body.deployable && (body.eggId == null)) throw badRequest('Set the panel egg of the product before it can be ordered.')
api/src/routes/admin.ts:488   eggId: … optional()                                           ← serverul îl acceptă la PATCH
api/src/routes/admin.ts:508-513   aceeași poartă, la PATCH
web/src/admin/Products.tsx:411-428   payload-ul formularului de produs nou: slug, name, category, description,
                                     icon, dockerImage, min/max ram/cpu/disk, baseAmount, visible, deployable
                                     ↑ fără eggId
web/src/admin/Products.tsx:60-92     comutatorul de pe rând trimite doar { visible } sau { deployable }
```

Așadar, **singura stare pe care interfața o poate seta (`deployable: true`) este refuzată de server** cu un 400, iar comutatorul care ar dezactiva produsul pentru un produs blocat **nu există** în tabel (vezi ADM-05). Nici „Sync panel" nu repară situația: sincronizarea umple tabelele `Node` și `Egg` (`admin.ts:714-766`) și **nu mapează niciodată egg-urile pe produse** — singurul loc unde `Product.eggId` se scrie este `POST`/`PATCH /admin/products`, ale căror forme de UI nu trimit câmpul.

**Severitate: `High`. Clasă: `VERIFIED` (stările și lipsa controlului, măsurate) + `CODE-INSPECTED` (drumul `eggId` în cod).**

**Impact.** Din interfață nu se poate: (a) crea un produs vândabil — operatorul primește „Set the panel egg of the product before it can be ordered"; (b) repara un produs `TEMPORARILY_UNAVAILABLE` (cazul WordPress, măsurat); (c) repoziționa un produs după o reinstalare de egg pe panou. Singura cale rămasă e o scriere directă în baza de date, adică o operație în afara auditului.

**Corectare recomandată.**
1. `web/src/admin/Products.tsx`: adaugă în formularul de produs un selector „Panel egg", alimentat din `GET /api/admin/infrastructure` (ruta există, `admin.ts:682`, și întoarce `eggs`), și include `eggId` în payload (`:412-428`); adaugă-l și în PATCH, ca butonul „Stop ordering"/„Allow ordering" să-l anuleze.
2. `api/src/routes/admin.ts:479-522`: serverul acceptă deja `eggId: null` la PATCH (`:488`) — ce lipsește e doar comanda din UI. În plus, întoarce starea rezultată (`deploymentAvailability`) în răspuns, ca interfața să nu trebuiască să o recalculeze și să nu poată diverge de server.
3. `web/src/admin/Products.tsx:227-234`: arată starea din `availability.state` (cele patru stări) ca etichetă, nu doar „Blocked".

---

### ADM-05 — Catalogul: pe desktop niciun comutator pentru un produs blocat, pe telefon există

**Simptom observat (DOM capturat în browser la 1440 px și la 390 px).**

```
desktop (1440), rândurile tabelului:
  Code Server   visibleButtons ['Visible', 'Not deployable', 'Delete']
  Discord Bot   visibleButtons ['Visible', 'Deployable',      'Delete']
  PostgreSQL    visibleButtons ['Visible', 'Not deployable', 'Delete']
  Uptime Kuma   visibleButtons ['Visible', 'Not deployable', 'Delete']
  WordPress     visibleButtons ['Visible', 'Delete']            ← fără comutator
telefon (390), lista de carduri:
  ['Hide','Allow ordering','Delete', 'Hide','Stop ordering','Delete', 'Hide','Allow ordering','Delete',
   'Hide','Allow ordering','Delete', 'Hide','Stop ordering','Delete']      ← „Stop ordering" există
```

**Cauza root — confirmată, cu `file:line`.**

```
web/src/admin/Products.tsx:227-234   if (state && state !== 'DEPLOYABLE' && product.deployable)
                                   → randează <StatusPill status="blocked" …/> în locul butonului de comutare
web/src/admin/Products.tsx:305-327   lista de carduri (telefon) randează mereu butonul
                                     {product.deployable ? 'Stop ordering' : 'Allow ordering'}
web/src/ui-app.tsx:1055              DataTable: „hidden … md:block"   → vizibilă pe desktop
web/src/ui-app.tsx:1101              CardList:  „… md:hidden"          → vizibilă doar pe telefon
```

**Severitate: `Medium`. Clasă: `VERIFIED`.**

**Impact.** Operatorul de pe desktop nu poate scoate din vânzare un produs blocat: singura acțiune disponibilă e „Hide" (care îl face `UNPUBLISHED`, nu „nu se mai comandă"). Pe telefon aceeași listă oferă „Stop ordering". Două randări ale aceleiași liste, cu un set diferit de acțiuni — exact clasa de defect cerut de brief („acțiunea nu trebuie să lipsească într-o parte și să existe în cealaltă").

**Corectare recomandată.** `web/src/admin/Products.tsx:227-234`: înlocuiește ramura „Blocked" cu pastila **plus** butonul de comutare (eticheta „Stop ordering"), iar textul pastilei să spună motivul (`availability.blockers[0]`). Alternativ, extrage un singur component `DeployableToggle` folosit atât în tabel, cât și în card, ca cele două randări să nu poată divergi.

---

### ADM-06 — Nu există refund administrativ, iar `orders.write` este o permisiune moartă

**Simptom observat.** Ecranul `/admin/orders` este strict de citire (doar coloane, fără acțiuni); filtrul de stare include „Refunded" (adică platforma știe starea), dar nu există nicio cale prin care personalul să returneze o plată. La nivel de API, `orders.write` este definită în modelul de permisiuni și **nu este cerută de nicio rută**.

```
api/src/lib/permissions.ts:7        'orders.write',
$ grep -rn "requirePermission('orders.write')" api/src/     → 0 rezultate
api/src/routes/admin.ts:307-331    GET /admin/orders (orders.read) — singura rută de comenzi; nu are ramură de acțiune
api/src/routes/orders.ts:171       if (order.status === 'PAID') throw badRequest('A paid order cannot be cancelled. Cancel the subscription instead.');
api/src/services/upgrades.ts:147   singurul apel de refund din cod: refundul automat al unui upgrade eșuat
```

**Cauza root — confirmată, cu `file:line`.** Nu există `POST /admin/orders/:id/refund`; singurele rute de comandă sunt cele de client (`api/src/routes/orders.ts`), iar clientul nu poate anula o comandă plătită. Prin urmare, **nu există niciun punct de intrare administrativ pentru returnarea banilor**.

**Severitate: `High`. Clasă: `CODE-INSPECTED`.**

**Impact.** Un client care a plătit pentru un serviciu care nu se poate provisiona (frecvent, având în vedere `OPS-01`/`OPS-02`) nu poate fi rambursat prin platformă: operatorul trebuie să facă refund-ul în afara sistemului (dashboard Stripe), iar **operația nu intră în jurnalul de audit** și nu ajunge în starea comenzii. Pierderea este de **ban** și de **înregistrare**.

**Corectare recomandată.** Adaugă `POST /admin/orders/:id/refund` cu `preHandler: requirePermission('orders.write')`, un `ConfirmWithReason` cu motiv obligatoriu (ca la suspendare, `web/src/admin/CustomerDetail.tsx:552-574`), tranziția `REFUNDED` în starea comenzii, apelul `refundPayment()` din `api/src/services/stripe.ts:471` și o intrare `order.refunded` în audit. Adaugă pe `/admin/orders` o coloană „Action" cu butonul, afișat doar cu `can(staff,'orders.write')`. Până atunci, cel puțin un drum manual documentat (și notat în jurnal) trebuie să existe.

---

### ADM-07 — După autentificare, interfața administrativă a unui staff cu permisiuni limitate este read-only

**Simptom observat (măsurat pe API).** Cele două capete ale aceleiași resurse — sesiunea — răspund diferit:

```
POST /api/auth/login   → {"user":{…,"role":"ADMIN","permissions":[]}}
GET  /api/auth/session → {"user":{…,"role":"ADMIN","permissions":["customers.read","orders.read", … 17 permisiuni]}}
```

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/auth.ts:53-71    publicUser(user) → … permissions: []      ← codare fixă, lista nu e citită din baza de date
api/src/routes/auth.ts:186      POST /auth/login → { user: publicUser(user) }
api/src/routes/auth.ts:205-210  GET  /auth/session → { ...publicUser(user), permissions: user.staff?.permissions ?? [] }
web/src/session.tsx:72-76       login(): setUser(data.user)               ← obține utilizatorul din răspunsul de login
web/src/session.tsx:61-63      refresh() (apelul /auth/session) rulează DOAR la montarea providerului
web/src/pages/Login.tsx:39-42  navigate(postLoginTarget(...))             ← navigare SPA (router.tsx:32-55, pushState), fără reîncărcare
web/src/admin/Overview.tsx:39-43  can(user, p) → dacă role === 'ADMIN' → true; altfel (user.permissions ?? []).includes(p)
```

Deci, după autentificare, obiectul de sesiune din client are `permissions: []`. `can()` nu consultă baza de date; pentru rolul `ADMIN` scăpa printr-o ramură specială (`Overview.tsx:41`) — **de aceea defectul e invizibil pentru administrator și invizibil și pentru auditorii care folosesc un cont ADMIN**, cum e cazul conturilor de test din `blipmade_test` (ambele sunt `ADMIN`). Pentru un cont cu rolul `STAFF` și o listă reală de permisiuni, `can()` întoarce `false` pentru toate → ascunde butoanele de scriere și afișează notițile „Your role does not hold X" (`Products.tsx:336`, `CustomerDetail.tsx:248`, `Tickets.tsx:489`, `Infrastructure.tsx:130`, `Settings.tsx`).

**Singura rețea care repară situația** este reîncărcarea manuală a paginii (F5), care re-remontează providerul și reia `GET /auth/session`.

**Severitate: `High`. Clasă: `VERIFIED` (discrepanța API, măsurată cu `curl` pe stiva izolată) + `CODE-INSPECTED` (consecința în client).**

**Impact.** Primul lucru pe care încearcă un operator cu permisiuni limitate, imediat după autentificare, e o acțiune de scriere — și interfața spune că nu o are. În plus, e o contradicție între interfață și server în sensul **opus** celui din ADM-01: serverul ar permite acțiunea, interfața o refuză. Consecința practică: operatorul ajunge să creadă că nu are permisiunea (sau, mai grav, cere un rol mai mare decât are nevoie).

**Corectare recomandată.**
1. `api/src/routes/auth.ts:53-71`: `publicUser()` trebuie să primească permisiunile din `staff` (extinde `select` cu `staff: true` și întoarce `user.staff?.permissions ?? []`), ca `POST /auth/login`, `POST /auth/register` și `GET /auth/session` să răspundă identic.
2. `web/src/session.tsx:72-76`: după `login()`/`register()`, apelează `refresh()` (sau setează direct lista din răspunsul corectat) înainte de a naviga.
3. `api/src/lib/permissions.ts:33-36`: folosește `staffPermissions(role, granted)` în payload (funcția există dar nu e apelată nicăieri), ca rolul `ADMIN` să raporteze lista completă și clienții să nu depindă de o ramură specială în `can()`.

---

### ADM-08 — Dashboard-ul administrativ: poartă `customers.read`, conținut financiar

**Simptom observat (captură de browser, stiva izolată).** Textul paginii `/admin`, pentru un staff care are `customers.read`:

```
… OPEN TICKETS 0 …  ORDERS TODAY 0 …  REVENUE THIS MONTH €0.00 / month
   Paid and fulfilled orders this month.  MONTHLY RECURRING REVENUE €0.00 / month …
```

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/admin.ts:48    app.get('/admin/overview', { preHandler: requirePermission('customers.read') })
api/src/routes/admin.ts:76-87   răspunsul: customers, instances, activeInstances, openTickets, ordersToday,
                                revenueMonth, provisioningFailures, mrr
web/src/admin/Overview.tsx:264-295  tile-urile: Customers, Instances, Active instances, Open tickets, Orders today,
                                   Revenue this month, Monthly recurring revenue, Provisioning failures
```

În sens invers: un staff cu `orders.read` sau `tickets.read`, dar fără `customers.read`, primește **403 pe pagina de început a zonei administrative**, iar navigarea (`web/src/nav.ts:22-35`) e o listă statică: toate cele 12 rute sunt arătate oricărui staff, fără filtrare pe permisiune (măsurat: `['/admin','/admin/customers','/admin/orders','/admin/services','/admin/products','/admin/pricing','/admin/tickets','/admin/promotions','/admin/infrastructure','/admin/audit','/admin/staff','/admin/settings']`, plus tab-urile de telefon `['/admin','/admin/customers','/admin/tickets','/admin/audit']`).

**Severitate: `Medium`. Clasă: `CODE-INSPECTED` + `VERIFIED` (tile-urile capturate, lista de navigație capturată).**

**Impact.** (a) Un staff cu permisiunea cea mai puțin sensibilă din zonă (`customers.read`) vede cifra de afaceri a platformei (venit lunar, MRR, număr de comenzi, bilete deschise) — informație care nu are legătură cu clienții. (b) Un staff cu `orders.read` sau `tickets.read` nu poate deschide deloc interfața administrativă: prima pagină e o eroare 403, iar meniul îl trimite spre alte pagini care răspund la fel.

**Corectare recomandată.** (1) `api/src/routes/admin.ts:48`: fie descompuneți dashboard-ul în endpointuri per domeniu cu permisiunea corespunzătoare (`/admin/overview/ops` cu `infrastructure.read`, `/admin/overview/finance` cu `orders.read`), fie cere o permisiune de agregat (`staff.read`) și păstrați cifrele financiare într-un tile separat. (2) `web/src/nav.ts`: filtrează `ADMIN_NAV` după `can(staff, …)`, ca un staff să nu vadă linkuri pe care va primi 403; și `web/src/routes.tsx` să nu afișeze pagina de start dacă permisiunea lipsește (să ofere un mesaj explicit).

---

### ADM-09 — Jurnalul de audit: plafonat la 300, fără IP, fără motiv

**Simptom observat (măsurătoarea de producție, deja existentă).** Pe `https://blipmade.com/admin/audit`, tabelul are **exact 300 de rânduri** — plafonul serverului:

```
sweep-before.json → /admin/audit → tables: [{ headers: 4, rows: 300 }], text: "… Audit log 300 audit entries …"
```

și coloanele sunt `Time | Actor | Action | Target` — nici `ip`, nici `meta`.

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/admin.ts:768-795   GET /admin/audit … take: 300     (fără skip/cursor în schema de query: :769-771)
api/src/routes/admin.ts:790        ip: log.ip                       (coloana există și e returnată)
api/src/lib/audit.ts:18-33        audit(input) — acceptă ip, dar …
api/src/routes/admin.ts            niciuna dintre cele ~13 apeluri audit({…}) din fișier nu trimite ip
                                  (spre deosebire de api/src/routes/auth.ts:156,178,184,192,223,251,281,331, care trimit request.ip)
web/src/admin/Audit.tsx:23        interfața declară ip: string | null
web/src/admin/Audit.tsx:126-158   tabelul afișează doar Time, Actor, Action, Target → meta nu e afișat
web/src/admin/CustomerDetail.tsx:563  „Reason (required) … It is written to the audit log." (motivul se scrie, nu se citește)
web/src/admin/Services.tsx:97         idem pentru motivul reluării
```

**Severitate: `Medium`. Clasă: `VERIFIED` (plafonul atins în producție, măsurat) + `CODE-INSPECTED` (IP, `meta`).**

**Impact.** (a) Traseul de audit al acțiunilor administrative **nu poate fi urmărit**: nu există adresă de origine, deci nu se poate atribui acțiunea unui punct de acces, iar coloana `ip` rămâne `null` pentru toate intrările admin. (b) Motivul pe care operatorul îl scrie la suspendare sau la reluare e în baza de date, dar **nu apare nicăieri în interfață** — singura urmă a unei decizii e un rând fără context. (c) Jurnalul e plafonat la 300 de intrări, fără paginare și fără niciun mesaj: în producție e deja saturat, deci intrările mai vechi sunt inaccesibile prin interfață — și asta e exact perioada în care se caută un incident. (Înrădăcinat în `SEC-24`, care consemnează că IP-ul nu e înregistrat la eșecul de autentificare; aici e aceeași cauză aplicată acțiunilor administrative.)

**Corectare recomandată.** (1) `api/src/routes/admin.ts`: adaugă `ip: request.ip` la fiecare apel `audit()` din fișier (13 locuri) și, pentru o urmărire completă, și la `audit()`-urile din `tickets.ts`. (2) `api/src/routes/admin.ts:768-795`: acceptă `cursor`/`limit` și întoarce un cursor; `web/src/admin/Audit.tsx`: paginează și arată „showing the newest N of M". (3) `web/src/admin/Audit.tsx:126-158`: adaugă o coloană „Details" care arată `meta` (motivul, IP-ul, cheia modificată) într-un rând expandabil.

---

### ADM-10 — Ecranul de prețuri: fără verificare de permisiune și fără posibilitatea de a dezactiva un preț

**Simptom observat (DOM capturat).**

```
/admin/pricing, 5 prețuri:
  inputs: [{id:'base-cmvlfhnpo0003…', disabled:false, value:'299'}, {id:'ram-…', disabled:false, value:'60'},
           {id:'cpu-…', disabled:false, value:'40'}, {id:'disk-…', disabled:false, value:'2'}, …]
  butoane vizibile: ['Save price','Reset','Save price','Reset', …]
  controale pentru starea „active": []
```

**Cauza root — confirmată, cu `file:line`.**

```
web/src/admin/Pricing.tsx      fișierul NU conține nici `can(`, nici `useStaffUser`, nici `mayWrite`
                               (spre deosebire de Products/Services/Customers/Tickets/Infrastructure/Settings)
web/src/admin/Pricing.tsx:77-84 save(): put('/admin/pricing/{id}', { baseAmount, ramPerGb, cpuPerUnit, diskPerGb })   ← fără `active`
web/src/admin/Pricing.tsx:125   <StatusPill status={price.active ? 'active' : 'draft'} label={price.active ? 'Active' : 'Inactive'} />
api/src/routes/admin.ts:557-576 PUT /admin/pricing/:id (pricing.write) — schema acceptă `active: z.boolean().optional()` (:566)
api/src/routes/catalog.ts:131    where: { visible: true, prices: { some: { active: true } } }   ← active decide apartenența la catalog
api/src/services/pricing.ts:135-138  where: { productId, period, active: true } → „This product has no active price."
```

**Severitate: `Medium`. Clasă: `VERIFIED` (input-uri active, lipsa controlului `active`) + `CODE-INSPECTED` (absența verificării de permisiune în fișier).**

**Impact.** Două goluri în același ecran:
1. **O acțiune oferită fără drept:** un staff cu doar `pricing.read` primește un formular complet editabil și un buton „Save price"; la salvare serverul răspunde 403 și interfața arată doar un mesaj de eroare — nu un mesaj că acțiunea nu îi aparține. Celelalte 8 ecrane admin au mesajul explicit „Your role does not hold …"; acesta nu îl are.
2. **O stare pe care operatorul o vede dar nu o poate schimba:** `active` decide dacă produsul apare în catalogul public și dacă poate fi cotat. Ecranul îl afișează, serverul îl acceptă la PUT, dar interfața nu îl trimite și nu are niciun control pentru el. **Consecință:** un preț nu poate fi scos din vânzare din interfață (nici prin dezactivare, nici prin ștergere — `DELETE /admin/pricing/:id` nu există), iar un nivel de preț nou nu poate fi creat.

**Corectare recomandată.** `web/src/admin/Pricing.tsx`: (a) aplică modelul din celelalte ecrane — `const staff = useStaffUser(); const mayWrite = can(staff, 'pricing.write');` și dezactivează input-urile și butonul când `!mayWrite`, cu mesajul „Your role does not hold \"pricing.write\""; (b) adaugă un comutator „Active/ inactive" per preț care trimite `active` în același PUT (serverul îl acceptă deja, `admin.ts:566`); (c) cere confirmare înainte de salvarea unui preț (vezi ADM-15).

---

### ADM-11 — Atribuirea unui bilet depinde de `staff.read`, nu de `tickets.write`

**Simptom observat (cod).** Coada de suport apelează `GET /api/admin/staff` **necondiționat**, la fiecare încărcare a paginii, ca să umple meniul „Assign to":

```
web/src/admin/Tickets.tsx:104   const staffList = useAsync((signal) => get<{ staff: StaffMember[] }>('/admin/staff', undefined, signal), []);
web/src/admin/Tickets.tsx:213   staffList={staffList.data?.staff ?? []}          ← eroarea e înghițită
api/src/routes/admin.ts:796     GET /admin/staff → requirePermission('staff.read')
```

**Cauza root — confirmată, cu `file:line`.** Lista de personal este o resursă cu `staff.read`; pagina care o consumă cere `tickets.write` pentru atribuire. Lipsa permisiunii produce un 403 al cărui rezultat e înghițit (`?? []`), deci meniul e gol **fără niciun mesaj**, iar operatorul nu poate atribui niciun bilet.

**Severitate: `Medium`. Clasă: `CODE-INSPECTED`.**

**Impact.** Un staff de suport cu `tickets.read`+`tickets.write`, dar fără `staff.read` — combinația firească pentru un rol de suport — poate citi și răspunde, dar **nu poate atribui**, fără explicație. Pe lângă asta, când permisiunea lipsește, browserul trimite oricum cererea și primește 403 pentru un endpoint pe care pagina nu are voie să-l folosească.

**Corectare recomandată.** (1) `api/src/routes/admin.ts`: adaugă o rută restrânsă, `GET /admin/staff/assignable`, cu `requirePermission('tickets.write')`, care întoarce doar `userId` + numele afișabil; folosește-o în `web/src/admin/Tickets.tsx:104`. (2) În `web/src/admin/Tickets.tsx:213`, afișează starea de eroare a încărcării listei („The list of staff could not be loaded — you cannot assign tickets") în loc de o listă goală.

---

### ADM-12 — Listele administrative sunt plafonate fără paginare și fără nicio indicație de trunchiere

**Simptom observat (producție).** `/admin/audit` are exact 300 de rânduri = plafonul serverului. Celelalte liste sunt încă sub plafon (3 clienți, 6 comenzi, 3 servicii, 14 bilete), dar plafonul există și nu e comunicat.

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/admin.ts:111    GET /admin/customers   take: 200
api/src/routes/admin.ts:316    GET /admin/orders      take: 200
api/src/routes/admin.ts:342    GET /admin/services    take: 300
api/src/routes/admin.ts:589    GET /admin/tickets     take: 200
api/src/routes/admin.ts:631    GET /admin/promotions  take: 200
api/src/routes/admin.ts:779    GET /admin/audit       take: 300
api/src/routes/admin.ts:136-139  în detaliul clientului: invoices/tickets/orders/payments → take: 50 fiecare
```

Niciuna dintre aceste șase șablonuri de query (`admin.ts:92`, `:308`, `:334`, `:579`, `:769`) nu acceptă `page`, `cursor`, `offset` sau `limit`, deci **nu există nicio cale de a ajunge la rândurile mai vechi**. Filtrele și căutarea sunt, în schimb, corect server-side: căutarea clienților (`admin.ts:92-104`, declanșată cu debounce de 300 ms din `web/src/admin/Customers.tsx:36-44`) și filtrele de stare (`admin.ts:308`, `:334`, `:579`) se aplică în baza de date, nu în interfață.

**Severitate: `Medium`. Clasă: `VERIFIED` (saturația măsurată în producție) + `CODE-INSPECTED` (absența paginării).**

**Impact.** Când platforma trece de 200 de clienți / 200 de comenzi / 300 de instanțe, listele admin încep să arate cele mai noi 200/300 de rânduri și să tacă în rest, fără niciun mesaj. Asta se întâmplă **acum** cu jurnalul de audit (300/300). Listele sunt ordonate descrescător (`createdAt desc`), deci un operator caută un client sau o comandă veche și nu o găsește — și nu află de ce.

**Corectare recomandată.** `api/src/routes/admin.ts`: adaugă `limit` (max 100) și `cursor` (createdAt+id) la cele șase liste și întoarce `nextCursor`; `web/src/admin/*.tsx`: adaugă controlul de paginare și textul „showing N of M" (sau măcar un indicator „there are older entries"). Pentru `/admin/audit`, prioritatea e maximă: e singura listă deja saturată.

---

### ADM-13 — Patru operații administrative existente în API nu au interfață

**Simptom observat (cod).** API-ul oferă patru operații pe care interfața nu le expune: salvarea și ștergerea cheii de client a panoului, importul unei servere existente în platformă și raportul de livrare a e-mailului.

```
api/src/routes/admin.ts:236   POST   /admin/customers/:id/panel/credential   (services.write) — "the way in when the key bridge is not installed"
api/src/routes/admin.ts:268   DELETE /admin/customers/:id/panel/credential
api/src/routes/admin.ts:884   POST   /admin/instances/import                 (doar ADMIN) — importă o serveră Pterodactyl
api/src/routes/admin.ts:849   GET    /admin/email/delivery                  (settings.read) — starea livrării e-mailurilor
$ grep -rn "instances/import|email/delivery|panel/credential" web/src/   → 0 apeluri
```

În schimb, `web/src/admin/CustomerDetail.tsx:196-197` afișează `pterodactylUserId`-ul clientului, iar `web/src/admin/Infrastructure.tsx` n-are nicio legătură cu importul.

**Severitate: `Medium`. Clasă: `CODE-INSPECTED`.**

**Impact.** (a) Când bridge-ul de chei al panoului nu e instalat (situația pentru care rutele sunt scrise), **nu există nicio interfață prin care operatorul să introducă cheia de client** → provisionarea rămâne blocată la pasul care cere cheia de client, iar operatorul trebuie să apele API-ul cu `curl`. (b) Importul unei servere existente (5 servere pe panou, 3 instanțe în DB — `OPS-07`) nu e accesibil: cele două servere orfane nu pot fi reconciliate din interfață. (c) Raportul de livrare a e-mailurilor e invizibil: operatorul nu poate vedea de ce nu s-au livrat notificările (relevant pentru `OPS-03`: canalul de suport e inert).

**Corectare recomandată.** `web/src/admin/CustomerDetail.tsx`: adaugă un panou „Panel access" cu formularul de cheie (`POST /admin/customers/:id/panel/credential`) și butonul de ștergere, cu `ConfirmWithReason`; `web/src/admin/Infrastructure.tsx`: adaugă acțiunea „Import an existing server" (doar pentru rolul ADMIN, ca în `admin.ts:886`), cu confirmare și listă de servere disponibile; `web/src/admin/Settings.tsx`: adaugă secțiunea „E-mail delivery" care citește `GET /admin/email/delivery`.

---

### ADM-14 — Catalogul public, fără sesiune, expune starea internă a panoului

**Simptom observat (măsurat cu `curl`, fără sesiune).**

```
GET http://10.77.0.13:30003/api/catalog/products
  {"products":[{"slug":"wordpress", … "deployable":true,"eggId":null,
    "availability":{"state":"TEMPORARILY_UNAVAILABLE","installable":false,"orderable":false,
    "blockers":["Its image is not installed on the panel yet."]}}, …]}
```

**Cauza root — confirmată, cu `file:line`.**

```
api/src/routes/catalog.ts:114-150  GET /catalog/products — fără `requireAuth`; include: { prices: { where: { active: true } }, options: … }
api/src/routes/catalog.ts:152-175  GET /catalog/products/:slug — la fel
api/src/services/availability.ts:63-65  blockers: „It has not been validated for deployment yet." / „Its image is not installed on the panel yet."
```

**Severitate: `Low / Info`. Clasă: `VERIFIED`.**

**Impact.** Un vizitator anonim află care produse au un egg pe panou și care nu (`eggId`), care sunt marcate „deployable" de operator, și mesajele interne de blocaj. Nu e o scurgere de date personale și nici de secret; e însă o informație de configurare a infrastructurii care ajută la identificarea produselor neexploatabile. Observație: aceleași mesaje apar și în interfața de client (prin design, `availability.blockers` e textul adresat clientului) — deci expunerea e în principal a identificatorului `eggId` și a drivelor de interne ale stării.

**Corectare recomandată.** `api/src/routes/catalog.ts`: nu trimite `eggId` și `deployable` în payloadul public (păstrează `availability.state`, `orderable` și `blockers`, care sunt textul de client); și limitează `includeHidden` (`:131`) la rolul ADMIN, nu la orice staff — azi `GET /catalog/products?includeHidden=1` e deschis oricărui cont staff, chiar unuia fără `products.read`.

---

### ADM-15 — Patru acțiuni de scriere fără confirmare

**Simptom observat.** În zona admin, confirmarea e folosită consecvent pentru acțiunile asupra clienților și al catalogului (suspendare cu motiv obligatoriu — `CustomerDetail.tsx:552-574`; ștergere produs cu numele produsului tastat — `Products.tsx:368-381`; comutare vizibilitate/„deployable" — `Products.tsx:342-366`; reluare cu motiv obligatoriu — `Services.tsx:299-318`). Patru acțiuni de scriere **nu** au confirmare:

```
web/src/admin/Infrastructure.tsx:86    „Sync panel"   → POST /admin/infrastructure/sync  (scrie Node + Egg)
web/src/admin/Pricing.tsx:215          „Save price"   → PUT  /admin/pricing/:id          (scrie prețul)
web/src/admin/Staff.tsx:206-210        „Save permissions" → PUT /admin/staff/:userId   (scrie permisiunile)
web/src/admin/Promotions.tsx:79        crearea promoției → POST /admin/promotions      (crează un cod de reducere)
```

**Severitate: `Low / Info`. Clasă: `VERIFIED` (absența dialogului, capturată în browser pe paginile de prețuri și personal) + `CODE-INSPECTED`.**

**Impact.** Un singur clic schimbă prețul unui produs sau permisiunile unui membru staff, fără o fereastră în care operatorul să vadă ce schimbă. Toate cele patru **sunt** scrise în jurnal (`admin.ts:764`, `:574`, `:830`, și `promotion.created`), deci urma există; ce lipsește e împiedicarea greșelii, nu urma. Pentru „Sync panel" impactul e mic (operația e un upsert idempotent), pentru „Save price" și „Save permissions" e relevant.

**Corectare recomandată.** `web/src/admin/Infrastructure.tsx`, `Pricing.tsx`, `Staff.tsx`, `Promotions.tsx`: învelește acțiunile în `ConfirmDialog` (existent în `web/src/ui-app.tsx`), arătând ce se schimbă (de ex. prețul vechi → cel nou, lista de permisiuni înainte → după). Pentru „Save permissions", cere o confirmare care să conțină lista exactă a permisiunilor adăugate și eliminate.

---

### ADM-16 — Dezvăluirea adreselor de e-mail ale clienților nu este consemnată

**Simptom observat (cod).** Listele administrative maschează adresele prin defaul și oferă un comutator „Show e-mails". Interfața spune chiar că reveals-ul nu e înregistrat:

```
web/src/admin/Customers.tsx:13-15   „E-mail addresses are masked by default. Revealing one is a local view toggle only:
                                      the API has no endpoint that records a reveal, so nothing is written to the audit log …"
web/src/admin/Audit.tsx:74           „Revealing addresses is a local view change. The API has no endpoint that records a reveal."
```

**Severitate: `Low / Info`. Clasă: `CODE-INSPECTED`.**

**Impact.** Sunt înregistrate acțiunile administrative, dar nu și **citirea** datelor personale ale clienților. Pentru un registru de activitate administrativă (contabilitate, art. 30 GDPR, trasabilitate internă), faptul că un operator a dezarhivat adresa unui client nu e urmărit, deși interfața promite explicit că nu va fi urmărit. Nu e o scurgere (adresa e deja în payloadul API-ului pentru cei cu `customers.read`), ci o lacună de trasabilitate.

**Corectare recomandată.** `api/src/routes/admin.ts:91-128`: adaugă o înregistrare de citire (`GET /admin/customers/:id/reveal` sau un eveniment la prima dezvăluire a unei adrese) care să scrie în jurnal `personal_data.revealed` cu `targetId` și `fields`; în `web/src/admin/Customers.tsx` și `Orders.tsx`, încarcă adresele doar la cerere explicită („Show e-mail"), ca acțiunea să poată fi auditată.

---

## 4. Matricea rutelor administrative vs. permisiunile aplicate server-side

Liniile marcate **GAP** sunt acțiuni sau rute la care serverul verifică doar rolul, nu permisiunea, sau la care permisiunea cerută nu e cea care ar trebui.

| Rută / acțiune din interfață | Endpoint | Permisiune impusă **server-side** | Stare | Observație |
|---|---|---|---|---|
| `/admin` — dashboard | `GET /admin/overview` | `customers.read` | **GAP** | expune venitul lunii și MRR (`admin.ts:76-87`); invers, un staff fără `customers.read` nu poate deschide adminul → ADM-08 |
| `/admin/customers` — listă + căutare | `GET /admin/customers` | `customers.read` | OK | plafon 200, fără paginare → ADM-12 |
| `/admin/customers/:id` — fișa clientului | `GET /admin/customers/:id` | `customers.read` | OK | expune `pterodactylUserId` |
| — cheie de panou (stocare/ștergere) | `POST`/`DELETE /admin/customers/:id/panel/credential` | `services.write` | **FĂRĂ UI** | niciun apel în `web/src` → ADM-13 |
| Suspendă / reactivează clientul | `POST /admin/customers/:id/suspend` | `customers.write` | OK | confirmare + motiv obligatoriu + audit (`admin.ts:282-305`) |
| `/admin/orders` — listă + filtru | `GET /admin/orders` | `orders.read` | OK | fără acțiuni; `orders.write` nu e cerută de nicio rută → ADM-06 |
| — refund | — | — | **LIPSEȘTE** | nu există rută → ADM-06 |
| `/admin/services` — listă | `GET /admin/services` | `services.read` | OK | expune `pterodactylServerId` |
| „Retry provisioning" | `POST /admin/instances/:id/retry` | `services.write` | **GAP** | fără verificare de stare, fără idempotență, oferit și pe instanțe `ONLINE` → ADM-03 |
| — import server existent | `POST /admin/instances/import` | `services.write` + `role === 'ADMIN'` (în handler) | **FĂRĂ UI** | → ADM-13 |
| `/admin/products` — listă | `GET /admin/products` | `products.read` | OK | stările corespund cu cele publice (același `deploymentAvailability`) |
| creează produs | `POST /admin/products` | `products.write` | **GAP** | formularul nu are `eggId` → comutatorul „deployable" primește mereu 400 → ADM-04 |
| comută vizibil / deployable | `PATCH /admin/products/:id` | `products.write` | **GAP** | pe desktop nu există comutatorul pentru un produs blocat → ADM-05 |
| șterge produs | `DELETE /admin/products/:id` | `products.write` | OK | confirmare cu numele tastat; serverul refuză dacă există instanțe; audit |
| `/admin/pricing` — listă | `GET /admin/pricing` | `pricing.read` | OK | |
| salvează preț | `PUT /admin/pricing/:id` | `pricing.write` | **GAP (UI)** | interfața nu verifică permisiunea → 403 la salvare; `active` nu e editabil → ADM-10 |
| `/admin/tickets` — coada | `GET /admin/tickets` | `tickets.read` | OK | plafon 200 |
| — firul de discuție | `GET /tickets/:id` | **niciuna — doar rolul** | **GAP** | orice staff citește orice bilet + notele interne → ADM-01 |
| — răspuns / notă internă | `POST /tickets/:id/replies` | **niciuna — doar rolul** | **GAP** | trimite e-mail clientului → ADM-01 |
| — schimbă starea | `POST /tickets/:id/status` | **niciuna — doar rolul** | **GAP** | → ADM-01 |
| — atașament | `POST /tickets/:id/attachments` | **niciuna — doar rolul** | **GAP** | → ADM-01 |
| atribuie bilet | `POST /admin/tickets/:id/assign` | `tickets.write` | OK | UI-ul depinde de `staff.read` pentru meniu → ADM-11 |
| `/admin/promotions` — listă | `GET /admin/promotions` | `promotions.read` | OK | fără editare/dezactivare (`COMM-11`/`PROMO-04`, încă prezent) |
| creează promoție | `POST /admin/promotions` | `promotions.write` | OK | fără confirmare → ADM-15 |
| `/admin/infrastructure` | `GET /admin/infrastructure` | `infrastructure.read` | OK | panoul e gol (`PROV-11`, încă prezent) |
| „Sync panel" | `POST /admin/infrastructure/sync` | `infrastructure.write` | OK | fără confirmare → ADM-15 |
| `/admin/audit` | `GET /admin/audit` | `audit.read` | OK | plafon 300 saturat; fără IP, fără `meta` → ADM-09 |
| `/admin/staff` — listă | `GET /admin/staff` | `staff.read` | OK | |
| schimbă permisiunile | `PUT /admin/staff/:userId` | `staff.write` | **GAP** | fără verificare de rol → escaladare (`SEC-04`) → ADM-02 |
| `/admin/settings` — listă | `GET /admin/settings` | `settings.read` | OK | |
| salvează setările | `PUT /admin/settings` | `settings.write` | **GAP** | `z.record(z.unknown())` → mass assignment (`SEC-26`); UI-ul permite orice cheie → poate activa `auto_delete_cancelled_instances` (`billing.ts:29-34`) |
| — stare a livrării e-mailului | `GET /admin/email/delivery` | `settings.read` | **FĂRĂ UI** | → ADM-13 |
| — exemplu de formatare monedă | `GET /admin/money` | `pricing.read` | **FĂRĂ UI** | rută de dezvoltare rămasă în producție (`admin.ts:953`) |

**Rezumatul matricei:** din cele 31 de rute administrative, **26 cer corect o permisiune specifică**; **5 sunt verificate doar pe rol** (cele patru rute de bilet plus, implicit, orice rută de client folosită din zona staff) și **3 verifică o permisiune, dar una alta decât cea pe care acțiunea o cere** (`orders.write` nefolosită, `tickets.read`/`tickets.write` nefolosite pe rutele de bilet, `staff.write` folosit în locul rolului ADMIN). **Patru rute existente nu au interfață**, iar **una lipsește cu totul** (refundul).

---

## 5. Ce nu a putut fi verificat

1. **Testul de execuție al constatărilor de tip „un staff fără permisiune poate face X"** (ADM-01, ADM-02, ADM-10, ADM-11). Baza `blipmade_test` conține **doar conturi cu rolul `ADMIN`** (ambii membri staff din `GET /admin/staff` au `role: admin`), iar crearea unui cont staff ar fi o scriere în baza de date — interzisă de regimul read-only. Mecanismul e concludent prin cod (`preHandler` = `requireStaff` / `requireAuth` + `isStaff`), dar **nu a fost executat**.
2. **Comportamentul clientului după autentificare pentru un cont STAFF** (ADM-07). Discrepanța dintre cele două capete ale sesiunii e măsurată (`curl`), dar consecința în interfață (ascunderea controalelor) n-a putut fi observată, pentru aceeași cauză. Pentru un cont ADMIN efectul e nul (ramura specială din `Overview.tsx:41`), ceea ce explică de ce nu s-a văzut în măsurătoarea de producție.
3. **Declanșarea efectivă a unui retry** (ADM-03). Nu s-a executat niciun retry, pe nicio instanță, pe nicio stivă. Mecanismul e urmărit în cod până la `failProvisioning` și până la ramura de creare a serverului; ce nu e măsurat e efectul asupra panoului real.
4. **Deblocarea limitării de rată a loginului pe stiva izolată** a consumat câteva ferestre de 15 minute (`max: 10`, `api/src/routes/auth.ts:167`); măsurătoarea de browser a fost reluată după resetare. **Producția nu a fost atinsă**: zero cereri de autentificare pe `blipmade.com`, zero apeluri la API-ul de producție.
5. **Comportamentul pe lățimi mici** al listei administrative a produselor a fost observat la o singură lățime (390 px) și numai pe stiva izolată; măsurătoarea de producție din `sweep-before.json` conține doar 1440 px pentru zona admin.
6. **Verificările de accesibilitate și de layout** ale zonei administrative nu au fost repetate: măsurătoarea existentă (`sweep-before.json`) nu arată niciun overflow orizontal și nicio încălcare evidentă pe rutele admin, iar erorile de font (404 pe `/fonts/proxima-nova-*.woff2`) sunt deja înregistrate ca `UX-20`. Nicio constatare nouă de a11y nu e raportată aici.
7. **Nu am putut verifica în runtime** cele patru operații fără interfață (ADM-13) — existența lor în cod e sigură, dar utilizabilitatea lor (de ex. dacă importul unei servere funcționează cu panoul curent) nu a fost testată, ca să nu se scrie nimic.
8. **Starea producției după remediile intermediare**: constatările `SEC-04`, `SEC-26`, `COMM-11`/`PROMO-04`, `PROV-11`, `BE-02`, `BE-06`, `UX-04` au fost verificate **doar în codul curent**; nu s-a făcut nicio măsurătoare nouă pe producție, conform briefului.
