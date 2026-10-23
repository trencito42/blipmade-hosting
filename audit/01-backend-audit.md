# Audit de backend — platforma Blipmade

**Bază de cod:** `d62cb79` pe `main` (mirror `/root/blipmade-work`, repository `/opt/blipmade` pe VM 103). Mirror-ul și codul rulat au fost comparate și sunt **identice** pentru `api/src`, `api/prisma` și `docs` (`diff -rq` fără diferențe), deci fiecare `file:line` din acest raport este valabil și pentru producție.
**Data auditului:** 2026-10-23. **Regim:** read-only; singurele scrisuri au fost cele cinci fișiere din sarcină (cele patru corectate + acesta). Nu s-a făcut nicio scriere în baza de date, nu s-a plasat nicio comandă, nu s-a atins panoul.
**Clasele de verificare folosite:** `VERIFIED`, `CODE-INSPECTED`, `DOCUMENTED-ONLY`, `INFERRED`, `UNVERIFIED`, `BLOCKED`, `NOT-IMPLEMENTED`.

---

## 1. Sumar executiv

Backend-ul este bine construit pe **perimetru** și slab pe **interior**. Autorizarea multi-tenant e solidă (fiecare familie de rute re-verifică identitatea apelantului contra resursei), iar modelul de date e bogat și coerent: **31 modele Prisma, 10 migrări, 32 de tabele live**, cu chei străine, `UNIQUE` și reguli `CASCADE` gândite. Ce nu există este **atomicitatea**: în tot API-ul există **exact 8 apeluri `$transaction`** (`grep -rn '\$transaction' api/src/`), iar **calea banului — cotă → comandă → sesiune Stripe → webhook → factură → abonament → provisionare — nu are niciunul** care să cuprindă mai mult de un rând. Consecința nu e teoretică: o livrare Stripe duplicată în timp ce prima e încă prelucrată trece de ledger, iar o provisionare eșuată lasă panoul cu un server pe care baza de date nu îl cunoaște.

Cinci constatări **High**:

1. **Calea banului nu e atomică** (BE-01). `markOrderPaid()` scrie comanda `PAID`, apoi plătește, apoi abonamentele, cu două apeluri externe Stripe între ele și **fără o singură tranzacție care să le cuprindă**. O eroare în mijloc lasă o comandă plătită fără abonament și fără factură. `CODE-INSPECTED`.
2. **Marcajul de reluare al provisionării este distrus la fiecare tentativă** (BE-02). `completeStep(instance.id, 'pterodactyl_user')` (`api/src/services/provisioning.ts:438`) rescrie `Instance.provisionStep` cu primul pas la **fiecare** rulare. Deci garanția documentată („o rulare reluată continuă după ultimul pas completat", `provisioning.ts:415-418`) e valabilă **doar la fiecare al doilea restart**. Am reprodus exact alternanța asta în istoricul real din baza de date. `VERIFIED`.
3. **Ledgerul webhook nu apără de o livrare concurentă a aceluiași eveniment** (BE-03). `claimEvent()` (`api/src/routes/webhooks.ts:81-83`) tratează starea `'received'` drept „abandonat" — dar `'received'` este **exact starea în care se află un eveniment aflat în prelucrare**. O livrare repetată în acea fereastră este prelucrată **în paralelă** cu prima. `CODE-INSPECTED`.
4. **Provisionarea face 10 mutații pe panou și ~20 de scrieri în baza de date cu o singură tranzacție** (BE-04). Singura `$transaction` din tot fișierul (`provisioning.ts:615-621`) leagă abonamentul de instanță; scrierea lui `pterodactylServerId` (`:487-497`) se face **după** `createServer()` (`:458`), deci o eroare acolo produce un server pe panou pe care baza de date nu îl știe. `CODE-INSPECTED`.
5. **Verificarea sumei se dezactivează când `amount_total` lipsește** (BE-09). `verifyAmount()` întoarce `null` — adică „totul e în regulă" — pentru orice valoare care nu e număr (`webhooks.ts:189`). Gateway-ul de test face `amount` opțional (`webhooks.ts:504`), deci un eveniment fără sumă marchează comanda `PAID` **fără nicio validare a sumei**. `CODE-INSPECTED`.

Restul sunt **Medium** și **Low**, grupate în trei familii: **coada și workerul** (curățarea șterge joburile eșuate, patru bucle înghit erorile fără să scrie nimic, o provisionare blocată ține blocaj 30 de minute), **contractul API** (o rută documentată nu există, 24 de rute implementate nu sunt documentate, iar contractul promite „mereu 200" pentru webhook unde implementarea răspunde 400 și 500) și **acoperirea testelor** (240 de teste — 219 API + 21 web — care dovedesc *unitățile*, nu *cusăturile*: panoul, Stripe live, coada, workerul, backup/restore și nodul real nu sunt acoperite deloc).

O observație de fond, valabilă pentru aproape toate constatările: **codul este mult mai atent decât schema**. Există `enum` pentru 16 stări (`OrderStatus`, `FulfillmentStatus`, `InstanceStatus`…), `UNIQUE` pentru fiecare identificator de business, `@@unique([provider, eventId])` pentru ledger și `@@unique([provider, eventId])`-style guards peste tot — dar **niciuna dintre cele cinci sume care se deplasează (`Order.total`, `Invoice.total`, `Payment.amount`, `Subscription.amount`, `Instance.price`) nu are o constrângere, un `CHECK` sau o coloană generată care să le lege de componentele lor**. Toate aceste legături trăiesc exclusiv în cod, iar codul le verifică în momente diferite, adică nu în același moment.

---

## 2. Metodă și suprafață

**S-au citit integral:** `api/prisma/schema.prisma` (849 linii, 31 modele, 16 enum-uri), `api/src/app.ts`, `api/src/worker.ts`, `api/src/env.ts`, `api/src/routes/*` (13 fișiere, 142 de rute înregistrate), `api/src/services/queue.ts`, `api/src/services/provisioning.ts`, `api/src/services/stripe.ts`, `api/src/services/billing.ts`, `api/src/services/pricing.ts`, `api/src/services/upgrades.ts`, `api/src/routes/webhooks.ts`, `api/src/routes/orders.ts`, `api/src/routes/admin.ts`, `docs/API_CONTRACT.md`, `api/tests/*` (22 de fișiere de test).

**Verificări executate, fără efect pe stare:** numărarea modelelor, enumurilor, migrărilor și a apelurilor `$transaction`; extragerea automată a rutelor din cod și diferența față de contract; interogări SQL `SELECT` pe baza de date de producție (tabele, chei străine cu `delete_rule`, volume de rânduri, stări); rularea unei **simulări deterministe** a semanticii de reluare a provisionării; compararea mirror–producție prin `diff -rq` pe codul sursă; și istoricul `git log -p` pentru un artefact istoric din ledger.

**Ce NU s-a făcut, prin regimul read-only:** nu s-a rulat suita de teste a API-ului (necesită o bază de date de test, `TEST_DATABASE_URL`/`DATABASE_URL`, `api/tests/globalSetup.ts:5` — rularea e blocată de mediu, nu de produs); nu s-a creat nicio comandă, nicio instanță și niciun eveniment webhook; nu s-a emis niciun eveniment Stripe real.

**Ce nu acoperă acest raport, prin granița de ownership:** constatările de securitate sunt în `02-security-audit.md`, iar ciclul comercial și integrarea Stripe sunt în `05-commerce-and-billing.md`. Aici sunt tratate **proprietățile de sistem** ale backendului — tranzacții, coadă, worker, idempotență, model de date, contract — și doar acolo unde o proprietate de sistem explică sau contrazice o constatare a celor două fișiere menționate, cu trimitere explicită.

---

## 3. Arhitectura serviciului ca sistem

### 3.1 Arhitectura serviciului

Fluxul real, cu fișierele care îl implementează:

```
client (web SPA)
   │  cookie bm_session + antet X-CSRF-Token
   ▼
Caddy (TLS, terminare)  →  web container (web/server.mjs)  →  API container (Fastify)
                                                                    │
                        ┌───────────────────────────────────────────┼────────────────────────┐
                        ▼                                           ▼                        ▼
                  Postgres 16 (docker compose)                Redis 7 (docker compose)        Pterodactyl
                  api/prisma/schema.prisma                     BullMQ: 2 cozi              (Application API
                  32 tabele live                              blipmade.provision            + Client API,
                                                                 blipmade.email              + node)
```

**Punctul de intrare.** `api/src/app.ts:28-157` construiește instanța Fastify: `bodyLimit: 2 MiB` (`:48`), `trustProxy: env.trustProxies` (`:47`), CORS cu `credentials: true` și origini din `env.APP_ORIGIN` (`:52-57`), `helmet` (`:58-61`), rate-limit **dezactivat global** (`:63`), multipart limitat la un fișier (`:81-83`). Un parser JSON custom (`:90-107`) păstrează corpul brut pentru `/api/webhooks/`, fiindcă semnătura Stripe trebuie verificată pe payload-ul neprelucrat. Toate rutele sunt montate sub prefixul `/api` (`:130-147`), iar `registerHealthRoutes(app)` este montat **și** la rădăcină (`:150`) pentru health-check-ul containerului.

**Hook-uri transversale.** `onRequest` (`:118-121`) rulează `csrfGuard(request)` și apoi `loadSession(request)` — deci **sesiunea se încarcă pe fiecare cerere, inclusiv pe cele publice**. `onSend` (`:123-126`) emite cookie-ul CSRF.

**Deplasarea în baza de date.** Toate apelurile trec prin `api/src/db.ts`, care expune un singur `PrismaClient`. **Nu există repository layer**: rutele apelează `prisma.*` direct, iar serviciile apelează `prisma.*` direct. Consecință structurală: **nu există o frontieră în care tranzacția să poată fi impusă**, iar validarea e distribuită în `zod` (la marginea rutei) și în cod imperativ (în servicii).

**Asincronul.** Redis găzduiește două cozi BullMQ (`api/src/services/queue.ts:99` `blipmade.email`, `queue.ts:37` coada de provisionare). Workerul (`api/src/worker.ts`) este un proces separat, cu propriul endpoint de sănătate pe `WORKER_HEALTH_PORT` (implicit 3101, `worker.ts:132`).

**Spre panou.** API-ul folosește două identități, niciodată amestecate: cheia de *Application API* (operațională, pentru creare/ștergere server) și cheia de *Client API* a clientului (per-client, pentru pornire/oprire și fișiere). Detaliile sunt în `04-pterodactyl-and-provisioning.md` §1.1 și `00-architecture.md` §5.1 — aici contează doar că **panoul este în afara graniței tranzacționale**: o scriere în baza de date și o mutație pe panou nu pot fi atomice între ele, iar codul nu încearcă nici să le facă să pară atomice.

### 3.2 Modelul de date

**Numere, recalculate din repo și din baza live:**

| Ce | Număr | Cum a fost obținut |
|---|---:|---|
| Modele Prisma | **31** | `grep -c '^model ' api/prisma/schema.prisma` |
| Enum-uri Prisma | **16** | `grep -c '^enum ' api/prisma/schema.prisma` |
| Migrări | **10** | `ls api/prisma/migrations/` |
| Tabele live (`public`) | **32** | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` |
| Tabele live = modele + istoricul migrărilor | 31 + `_prisma_migrations` | idem, lista nominală |
| Chei străine cu `ON DELETE CASCADE` | **26** | `information_schema.referential_constraints` |
| Rânduri live: `Order` / `OrderItem` | 5 / 5 | `SELECT count(*)` |
| Rânduri live: `Invoice` / `Payment` / `Subscription` | **0 / 0 / 0** | `SELECT count(*)` |
| Rânduri live: `Instance` | 3 | `SELECT count(*)` |
| Rânduri live: `ProvisioningJob` | **123** (93 `completed`, 30 `failed`) | `SELECT status, count(*) …` |
| Rânduri live: `WebhookEvent` | 8 (toate `evt_verify_*`, `status='received'`) | `SELECT …` |

**Invariantele pe care schema le impune efectiv** (verificate în `api/prisma/schema.prisma`):

- **Identificatori de business unici**: `Order.number` (`schema.prisma:348+`), `Invoice.number`, `Payment.stripePaymentIntentId`, `Payment.stripeCustomerId`, `Payment.stripeInvoiceId`, `Invoice.stripeInvoiceId`, `Subscription.stripeSubscriptionItemId`, `Subscription.instanceId`, `Subscription.orderItemId`, `Instance.pterodactylServerId`, `Instance.pterodactylUuid`, `Instance.provisioningKey`, `InstanceDomain.hostname`, `Promotion.code`, `ProductOption.code`, `Product.slug`, `User.email`, `User.pterodactylExternalId`, `Session.tokenHash`, `Ticket.number`.
- **Ledgerul webhook**: `WebhookEvent @@unique([provider, eventId])` (`schema.prisma:785+`) — aceasta e baza idempotenței.
- **Consumul unei promoții**: `PromotionRedemption.orderId @unique` (`schema.prisma:553+`).
- **Identitatea personalului**: `StaffMember.userId @id` — relație 1:1 impusă.
- **Integritatea referențială**: 26 de reguli `CASCADE` (enumerate mai jos la BE-13), restul `SET NULL` sau `RESTRICT`.

**Invariantele pe care schema NU le impune** — toate trăiesc doar în cod:

| Invariant | Unde e în cod | De ce nu e în schemă |
|---|---|---|
| `Order.total` = `Σ OrderItem.total` − `Order.discount` | `api/src/routes/orders.ts:79` | `Order.total` e un `Int` scris ca literal |
| `Invoice.total` = `Invoice.amount` + `Invoice.tax` | `api/src/services/stripe.ts:440+`, `api/src/services/billing.ts:119-134` | `total` e o coloană independentă |
| `Payment.amount` = suma plătită efectiv | `api/src/services/stripe.ts:349` | nu există `CHECK` |
| `Subscription.amount` = `OrderItem.total` | `api/src/services/stripe.ts:313,321` | nu există `CHECK` |
| `Instance.price` = prețul cotat | `api/src/routes/webhooks.ts:162` | nu există `CHECK` |
| Legalitatea tranziției `Order.status` | `api/src/routes/webhooks.ts:220,245` | `OrderStatus` e un `enum`, dar tranzițiile nu sunt restricționate |
| `Promotion.usedCount` ≤ `Promotion.maxRedemptions` | `api/src/services/pricing.ts` (`reservePromotion`) | contorul e un `Int` liber |
| Fereastra `Promotion.startsAt`…`endsAt` | `api/src/services/pricing.ts` (`resolvePromotion`) | idem |
| `Instance.ram ≤ Product.maxRam` etc. | `api/src/services/pricing.ts` (`validateConfiguration`) | idem |
| `OrderItem.total` = `unitAmount` × `quantity` | `api/src/services/pricing.ts` (`priceItems`) | idem |

**Legăturile care se rup în cascadă.** `information_schema.referential_constraints` arată că `Invoice.userId`, `Payment.userId`, `Order.userId` și `Subscription.userId` au toate `ON DELETE CASCADE` către `User`, iar `OrderItem.orderId` are `CASCADE` către `Order`. Adică **ștergerea unui utilizator distruge istoricul său financiar**. Modelul `User` (`schema.prisma:23+`) are totuși `deletionRequestedAt` — o cale de ștergere logică. Cele două mecanisme se contrazic (vezi BE-13).

### 3.3 Tranzacții și consistență

**Numărul total de tranzacții din API: 8.** Integral:

```
$ grep -rn '\$transaction' api/src/ --include=*.ts | grep -v 'db.ts:10'
api/src/services/provisioning.ts:615:    await prisma.$transaction(async (tx) => {
api/src/services/pricing.ts:208:  await prisma.$transaction(async (tx) => {
api/src/services/stripe.ts:264:    await prisma.$transaction([
api/src/routes/instances.ts:353:    await prisma.$transaction([
api/src/routes/settings.ts:319:      await prisma.$transaction([
api/src/routes/admin.ts:289:    await prisma.$transaction([
api/src/routes/auth.ts:219:    await prisma.$transaction([
api/src/routes/auth.ts:275:    await prisma.$transaction([
```

Cei opt apeli sunt bine aleși în sine (schimb de e-mail, reset de parolă, creare de produs cu preț, legarea credentialului de panou, consumul promoției, legarea abonamentului de instanță), dar **niciunul nu acoperă o cale cu mai multe participanți**.

**Unde tranzacția lipsește și ce rămâne în urmă:**

| Cale | Pași | Tranzacție? | Stare intermediară posibilă |
|---|---|---|---|
| **Cota → comandă** | `POST /api/orders`: quote server-side → `prisma.order.create` → `prisma.orderItem.create` → `reservePromotion` | **Nu** (`orders.ts:56-120`) | Comanda există cu `promotionId` setat, dar fără rând în `PromotionRedemption`, dacă `reservePromotion` aruncă (campanie epuizată între timp). Comanda rămâne `PENDING` și clientul nu află numărul ei. |
| **Checkout** | `stripe.createCheckout` (apel extern Stripe) → `prisma.order.update({stripeCheckoutSessionId})` (`stripe.ts:207`) → `prisma.order.update({status:'AWAITING_PAYMENT'})` (`orders.ts:158`) | **Nu** (`orders.ts:142-163`) | sesiunea există la Stripe, comanda nu o știe → comanda rămâne în starea precedentă. |
| **Webhook → plată** | `order.update(PAID)` → `upsertPayment` (apel extern) → `retrieveStripeSubscription` (apel extern) → `subscription.upsert` × N | **Nu** (`stripe.ts:252-342`) | Comandă `PAID`, fără `Payment`, fără `Subscription`. |
| **Webhook → provisionare** | `instance.create` × unități → `subscription.update` → `enqueueProvisioning` → `order.update(fulfillmentStatus)` | **Nu** (`webhooks.ts:132-182`) | Unele instanțe create, altele nu; `fulfillmentStatus` neatins. |
| **Provisionare** | ~10 mutații pe panou + ~20 de scrieri în DB | **Una singură**, la `provisioning.ts:615-621` (legarea abonamentului) | Server creat pe panou, `pterodactylServerId` neintrodus în DB. |
| **Sweep de factură** | `subscription.update(periodă nouă)` → `invoice.create` | **Nu** (`billing.ts:106-134`) | Perioada avansată, factura inexistentă → sweep-ul nu mai revine la ea (perioada e în viitor). |
| **Retragere la sfârșit de perioadă** | `subscription.update(CANCELLED)` → `stopInstance` → `instance.update(CANCELLED)` → `instanceEvent.create` → `deleteServer` (dacă e enabled) | **Nu** (`billing.ts:59-93`) | `deleteServer(...).catch(() => undefined)` (`:83`) înghite eșecul → instanța e `CANCELLED` în DB, serverul trăiește pe nod. |

**Observația de fond.** În fiecare rând de mai sus, tranzacția ar fi fost suficientă pentru consistența *locală*; ce nu poate fi reparat prin tranzacție e consistența *între* baza de date și panoul (sau între baza de date și Stripe) — acolo e nevoie de **acțiune compensatorie**, care lipsește (vezi `04-pterodactyl-and-provisioning.md` §4.3).

### 3.4 Coada și workerul

**Două cozi, un worker.** `blipmade.provision` (job-uri de provisionare) și `blipmade.email` (mesaje). Politica de job-uri pentru provisionare (`queue.ts:41-46`): `attempts: 5`, `backoff: { type: 'exponential', delay: 5000 }` — deci încercările la ~5 s, 10 s, 20 s, 40 s, adică **întreaga fereastră de reîncercare e de ~75 de secunde**. `removeOnComplete: { count: 500 }`, `removeOnFail: { count: 500 }`. Workerul: `concurrency: 2`, `lockDuration: 120_000` (`queue.ts:71-75`).

**Identitatea jobului e deterministă**: `provisioningJobId(instanceId) = \`provision-${instanceId}\`` (`queue.ts:31-33`), iar `enqueueProvisioning` (`queue.ts:53-66`) refuză să adauge un job dacă unul există în starea `waiting`/`active`/`delayed`, și îl șterge pe cel în `completed`/`failed` ca să-l poată readauga. Deci **la nivel de coadă, o instanță nu are niciodată două joburi simultan** — bine.

**Ciclul de viață al unui job de provisionare** (`worker.ts:29-42`):

```
job.provision(instanceId)
  ├─ instanța nu mai există?        → job.log('instance no longer exists'), return          (worker.ts:32-35)
  ├─ instanța e deja ONLINE?         → job.log('instance is already online'), return          (worker.ts:36-39)
  └─ provisionInstance(instanceId)                                                          (worker.ts:41)
        ├─ acquireLock()  ← updateMany atomic, cu verificarea de expirare a blocajului       (provisioning.ts:53-63)
        ├─ 10 pași: pterodactyl_user → node_selected → server_created → image_built →
        │           installed → started → health_verified → subscription_linked → activated
        ├─ orice pas aruncă → failProvisioning() → status FAILED + provisionError → throw     (provisioning.ts:677-681)
        └─ finally → releaseLock()                                                          (provisioning.ts:682-684)
```

**Retries.** Cele 5 încercări sunt ale lui BullMQ, nu ale codului. La fiecare încercare, `beginProvisioning()` (`provisioning.ts:70-79`) resetează `Instance.status='PROVISIONING'` și **`provisionError=null`** — deci **eroarea rundei precedente este ștearsă la începutul următoarei**. Operatorul vede doar ultima eroare.

**Ce se întâmplă la un job eșuat.** Workerul doar scrie în jurnal (`worker.ts:47-49`). Nu există alarmă, nu există notificare, nu există stare „eșuat" în UI. Starea rămâne în DB: `Instance.status='FAILED'`, `Instance.provisionError='<pas>: <mesaj>'` și rânduri `ProvisioningJob` cu `status='failed'`. În producție există **30 de astfel de rânduri**, 21 la pasul `started` și 9 la `health_verified` (`SELECT "step", status, count(*) FROM "ProvisioningJob" GROUP BY "step", status`).

**`pruneQueue()`** (`worker.ts:95-99`):

```ts
const queue = getQueue();
await queue.clean(0, 1000, 'completed');
await queue.clean(0, 1000, 'failed');
```

`grace = 0` înseamnă **ștergere imediată**, iar limita e 1000 pe tip. Rolul curge **la fiecare 10 minute** (`worker.ts:166`). Două consecințe: (a) joburile eșuate ale coadei de provisionare sunt șterse din Redis în cel mult 10 minute, deci **urma de diagnostic a unei provisionări eșuate dispare din coadă**; (b) retenția declarată în `queue.ts:44-45` (`removeOnComplete`/`removeOnFail` cu `count: 500`) e anulată de `clean()`, care șterge înainte ca BullMQ să aplice retenția. Asimetric: `getQueue()` e coada de **provisionare**, deci coada de e-mail **nu** e curățată niciodată — mesajele eșuate se acumulează până la 500.

**Unde se poate pierde un job:**

1. **Fereastra de 30 de minute a blocajului.** `PROVISION_LOCK_TTL_MS = 30 * 60 * 1000` (`provisioning.ts:34`). `acquireLock()` (`:53-63`) reușește doar dacă `provisionLockAt` e `null` sau mai vechi de 30 de minute. Dacă workerul moare, blocajul rămâne. `POST /admin/instances/:id/retry` (`api/src/routes/admin.ts:845-858`) **nu șterge `provisionLockAt`** → jobul reenqueue-uit eșuează imediat cu „Another provisioning run is already working on this instance" (`:422`), BullMQ reîncearcă de 5 ori în ~75 de secunde și toate eșuează. Reîncercarea manuală e deci **inutilă până la 30 de minute** (vezi BE-06).
2. **Instanța `FAILED` nu e requeue-uită niciodată automat.** `reconcileInterruptedInstances()` (`provisioning.ts:691-707`) selectează `status IN ('PROVISIONING','PENDING')`; `failProvisioning()` pune `status='FAILED'` (`:106`). O instanță cu `FAILED` după epuizarea celor 5 încercări rămâne în `FAILED` până la un retry manual.
3. **`reconcile()` doar face ceva dacă `count > 0`** (`worker.ts:80`). `count` vine din `reconcileInterruptedInstances()`, care are filtrul de expirare a blocajului; dar interogarea de requeue (`worker.ts:82-86`) selectează `status IN ('PROVISIONING','PENDING')` **fără** filtrul de expirare și **fără ordonare**, `take: 100`. Deci: peste 100 de instanțe blocate, restul rămân; și o instanță nouă apărută între cele două interogări poate fi omisă până la următoarea iterație (60 s).
4. **Evenimentele webhook `deferred` nu sunt reluate automat.** `markDeferred()` (`webhooks.ts:116-121`) pune starea `'deferred'`, iar `retryFailedWebhookEvents()` (`webhooks.ts:545+`) selectează doar `status: 'failed'`. Un eveniment amânat rămâne în ledger până la un replay manual (`POST /api/webhooks/stripe/replay`).
5. **Curățarea șterge joburile eșuate** (pkt. de mai sus).

### 3.5 Idempotență

Patru mecanisme, cu grade diferite de soliditate:

| Mecanism | Unde | Idempotent? | Notă |
|---|---|---|---|
| **Ledgerul webhook** | `webhooks.ts:59-95` (`claimEvent`), `WebhookEvent @@unique([provider,eventId])` | **Parțial** | `@@unique` e solid; dar starea `'received'` e folosită simultan ca „claimed" și ca „abandoned" ⇒ o livrare concurentă trece (BE-03) |
| **Preluarea jobului de provisionare** | `provisioning.ts:53-63` (`acquireLock`) | **Da** | `updateMany` cu predicat de expirare e atomic la nivel de rând; două rulări nu pot intra simultan, cu excepția ferestrei de 30 de minute (BE-06) |
| **Creația instanței din webhook** | `webhooks.ts:147-166` | **Da, prin constrângere** | `provisioningKey = \`order:${order.id}:item:${item.id}:unit:${unit}\`` e deterministă, iar `Instance.provisioningKey` e `@unique`. Dar operația e *check-then-act* (`findUnique` la `:148` apoi `create` la `:151`): două livrări simultane trec ambele verificarea și a doua `create` moare pe unicitate ⇒ evenimentul eșuează şi se reia. Corect prin accident, nu prin construcție. |
| **Garda de reinstalare** | `provisioning.ts:533-545` | **Da, cu o garză de rezervă** | `if (!done('image_built'))` + `server.container.installed === 1` (`:535`). Prima condiție e **defectată** (BE-02); a doua e corectă și salvează datele. |
| **Consumul promoției** | `stripe.ts:263-268` | **Nu** | Verificarea `!order.promotionRedeemedAt` e făcută **în afara** tranzacției, fără blocaj de rând ⇒ două apeluri concurente consumă promoția de două ori. `PromotionRedemption.orderId @unique` **nu** protejează această cale, pentru că aici nu se scrie niciun rând de redemption. |
| **`markOrderPaid`** | `stripe.ts:252-342` | **Da, pentru abonamente** | `subscription.upsert` pe `orderItemId` (`where` unic) ⇒ un singur abonament per linie. |

### 3.6 Tranzacțiile monetare

Calea completă, cu fiecare punct în care suma poate divergi. **Punctele P1–P7 sunt deja inventariate în `05-commerce-and-billing.md` §2.4** și nu sunt reluate aici; ce le adaugă acest raport este *unde* se verifică suma și *ce* nu se verifică.

```
1. COTĂ           POST /api/catalog/quote
                   └─ buildQuote()  → pricing.ts:208-…  (server-side, o singură tranzacție)
                   └─ subtotal = Σ item.total ; discount = applyPromotion(subtotal) ; total = subtotal − discount
                                                                          [preț.ts:~300-320]
2. COMANDĂ        POST /api/orders
                   └─ buildQuote() din nou, server-side          → subtotal, discount, total
                   └─ order.total   = quote.total   (DISCOUNTUIT)   orders.ts:79
                   └─ orderItem.unitAmount = item.unitAmount (NEDISCOUNTUIT)  orders.ts:84-90
                   └─ reservePromotion()  → PromotionRedemption  (separat de crearea comenzii)
3. SESIUNE STRIPE POST /api/orders/:id/checkout
                   └─ createCheckout() → stripe.ts:…  (apel extern)
                   └─ line_items[].price_data.unit_amount = item.unitAmount   ← NEDISCOUNTUIT
                   └─ mode: 'subscription' | 'payment'
                   └─ order.stripeCheckoutSessionId = session.id ; status = AWAITING_PAYMENT
4. WEBHOOK        POST /api/webhooks/stripe
                   └─ claimEvent()      → ledger
                   └─ verifyAmount(orderId, object.amount_total)
                        └─ dacă amount_total NU e număr → întoarce null → VERIFICAREA SALTATĂ  (webhooks.ts:189)
                        └─ altfel: amount_total !== order.total → order FAILED + audit order.amount_mismatch
                   └─ markOrderPaid()    → order PAID, Payment, Subscription
                   └─ fulfilOrder()      → Instance × unități, provisionare enqueue-uită
5. FACTURĂ        upsertInvoice()  → stripe.ts:440-…  (apel extern + invoice.create local)
6. ABONAMENT      subscription.upsert(where: { orderItemId })   amount = item.total (NEDISCOUNTUIT)
7. PROVISIONARE   instance.price = item.unitAmount (NEDISCOUNTUIT)  →  webhooks.ts:162
```

**Fiecare punct în care suma poate divergi** (detaliile și clasele sunt în `05-commerce-and-billing.md` §2.4, tabelul P1–P7):

| # | Punct | `file:line` | Ce se întâmplă |
|---|---|---|---|
| P1 | `createCheckout` trimite `item.unitAmount` (nediscountuit) | `stripe.ts:175` vs `orders.ts:79` | Stripe încasează suma **fără reducere** |
| P2 | `verifyAmount` compară `amount_total` cu `order.total` | `webhooks.ts:188-196` | cu orice promoție: `amount_total ≠ order.total` ⇒ `Order FAILED` + excepție + reîncercare la nesfârșit |
| P3 | `OrderItem.unitAmount` nediscountuit vs `Order.total` discountuit | `orders.ts:84-90` vs `:79` | cele două sume din aceeași comandă diferă cu exact `discount` |
| P4 | `Subscription.amount = item.total` | `stripe.ts:313,321` | suma recurentă e cea nediscountuită |
| P5 | `Payment.amount` = `amount_total` de la Stripe | `stripe.ts:349` | plățile reflectă suma fără reducere |
| P6 | `instance.price = item.unitAmount` | `webhooks.ts:162` | prețul afișat al instanței e cel nediscountuit |
| P7 | `serializeOrder` arată clientului `total` lângă `item.unitAmount` | `orders.ts:42,52` | clientul vede două sume diferite pe același ecran |

**Punctele în care suma NU este validată contra cotării server-side** — aici e contribuția proprie a acestui raport:

1. **Cota nu e re-derivată la checkout.** `POST /api/orders/:id/checkout` (`orders.ts:142-163`) folosește `order.items` deja scrise în DB. Prețul e „înghețat" la creare și **nu e comparat niciodată cu prețul curent al cataloagului**. Nu e neapărat un defect (înghețarea e o decizie de produs), dar înseamnă că o cotă poate fi onorată după ce cardul de preț s-a schimbat, fără nicio urmă.
2. **Verificarea sumei e bypassabilă** (BE-09): `verifyAmount` renunță la comparație dacă `amount_total` nu e număr.
3. **Suma cotată nu e comparată cu suma de pe panou.** `Instance.price` (P6) este **nediscountuit**, deci prețul recurent și prețul afișat clientului pot divergi; și **niciun loc** nu compară `order.total` cu `instance.price` sau cu `subscription.amount`.
4. **Suma de pe `Subscription` nu e derivată din `order.total`.** `Subscription.amount = item.total` (P4), adică din suma **nediscountuită**, deși `order.total` e discountuit.
5. **Cantitatea e împărțită cu rotunjire.** `updateSubscriptionAmount()` (`stripe.ts:…`) calculează `unitAmount = Math.max(0, Math.round(amount / Math.max(1, subscription.quantity)))` ⇒ cu `quantity > 1`, `unit_amount × quantity` poate fi **mai mic** decât `amount`. Divergență de cel mult `quantity/2` unități.
6. **`Payment.amount` nu e legat de `order.total` în DB.** `upsertPayment()` primește `params.amount ?? order.total`; nu există `CHECK` și nu există comparație în cod.

**Rezumatul severității pe această axă:** P1+P2 sunt un **defect blocant de lansare** (deciz already de `05-commerce-and-billing.md` §2.4); punctele 2–6 de mai sus sunt **divergențe de sistem** care rămân valide *chiar dacă* P1/P2 se repară, pentru că fiecare este o comparație lipsă într-un alt punct.

### 3.7 Schema API vs. implementare

`docs/API_CONTRACT.md` (224 de linii) a fost comparat automat cu rutele înregistrate în cod, extrase prin regex pe cele 13 fișiere din `api/src/routes/`:

```
$ # extragere din cod
app\.(get|post|put|patch|delete)\(\s*'([^']+)'   →  142 rute
$ # extragere din contract
^-\s+`(GET|POST|PUT|PATCH|DELETE)\s+(/api[^`]*)`   →  123 rute
```

**Divergențe reale (nu artefacte de regex):**

| # | Contract | Implementare | Severitate |
|---|---|---|---|
| 1 | `POST /api/admin/instances/:id/import` (`API_CONTRACT.md:215`) | `POST /api/admin/instances/import` (`api/src/routes/admin.ts:864`) | **Medie** — ruta documentată nu există; un client care o folosește primește 404 |
| 2 | „`POST /api/webhooks/stripe` … **Always `200`**" (`API_CONTRACT.md:219`) | `reply.code(400)` la semnătură invalidă (`webhooks.ts:459`), `reply.code(500)` la eșec de prelucrare (`webhooks.ts:472`) | **Medie** — contractul promite un cod pe care implementarea nu-l dă niciodată în acele cazuri; un client scris după contract va trata un 400 drept succes |
| 3 | 24 de rute implementate **nu sunt documentate** | vezi lista de mai jos | **Medie** |

**Cele 24 de rute implementate și nedocumentate** (extrase automat, fără filtre):

```
GET    /api/admin/customers/:id/panel                     POST   /api/admin/customers/:id/panel/credential
DELETE /api/admin/customers/:id/panel/credential          GET    /api/admin/email/delivery
GET    /api/admin/money                                   POST   /api/admin/tickets/:id/assign
GET    /api/auth/require                                  GET    /api/instances/:id/resources/quote
POST   /api/tickets/:id/attachments                       GET    /api/tickets/:id/attachments/:attachmentId
GET    /api/webhooks/stripe/failed                        POST   /api/webhooks/stripe/replay
POST   /api/webhooks/stripe/test                          GET    /api/internal/not-a-real-route
POST   /api/internal/prune-sessions                       GET    /api/internal/whoami
PATCH  /api/instances/:id/startup                         POST   /api/instances/:id/files/archive
POST   /api/instances/:id/files/unarchive                 GET    /api/instances/:id/files/download
```

(În plus, `PATCH /api/instances/:id/startup`, `POST /api/instances/:id/files/archive` și `/files/unarchive` sunt *acoperite* de paranteze în contract — `:134`, `:113-114` — dar nu enumerate ca rute separate.)

**O observație pozitivă, pentru echitate:** cele patru rute `/internal/*` nu sunt un surplus hazardos. `POST /api/internal/prune-sessions` cere `env.internalToken` și refuză dacă tokenul nu e setat (`auth.ts:338-342`); `GET /api/internal/whoami` întoarce doar sesiunea curentă (`null` pentru anonim); `GET /api/internal/not-a-real-route` aruncă intenționat `notFound` — e o sondă de test pentru pagina de 404 (`auth.ts:355-357`). `GET /api/webhooks/stripe/failed` și `POST /api/webhooks/stripe/replay` sunt protejate de același token intern. **Problema nu e existența lor, ci faptul că nu sunt în contract** — un cititor al contractului nu poate ști că există o suprafață internă.

### 3.8 Verificare

**Ce există și ce dovedește.** 240 de teste automate, toate verzi, conform `07-quality-assurance.md` §3, rândul `T1`:

```
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/run-tests.sh'
Test Files 22 passed (22)
Tests 219 passed (219)
Duration 83.09s
# web:  # tests 21  /  # pass 21  /  # fail 0
```

Suita API are 22 de fișiere în `api/tests/`, suita web are 3 în `web/tests/` (`auth-guard` 8 teste, `fonts` 7, `fonts-server` 6).

**Ce dovedesc testele.** Rulează API-ul Fastify real împotriva unei **baze de date Postgres reale de test** (`blipmade_test`; scriptul de rulare refuză orice bază al cărei nume nu se termină în `_test`). Asta e o alegere bună: schema e testată cu constrângerile ei reale, nu cu un mock de ORM. Cele mai valoroase teste sunt în `api/tests/webhooks.test.ts` (13 cazuri) și `api/tests/provisioning.test.ts` (6 cazuri), care acoperă exact: plată o singură dată, un abonament per linie de comandă, o instanță per unitate, refuzul unei sume care nu corespunde comenzii, reluarea unui eveniment eșuat, consumul promoției abia la plată, refuzul unei a doua comenzi pentru același item plătit, absența celui de-al doilea server la reluare și absența reinstalării după o cădere între instalare și pornire.

**Ce NU dovedesc testele — și aici e partea importantă.**

| Domeniu | Stare | De ce |
|---|---|---|
| **Panoul Pterodactyl real** | **Neacoperit** | `vi.mock('../src/services/pterodactyl/application.js')` în 8 fișiere de test; `vi.mock('../src/services/panel/credentials.js')` în 3. Panoul real nu e atins niciodată. |
| **Stripe live** | **Neacoperit** | modulul `stripe` e mock-uit (`stripe-origin.test.ts`). În producție `STRIPE_SECRET_KEY` e gol ⇒ `env.paymentsEnabled` e fals (`env.ts:136`) ⇒ checkout-ul răspunde `503 payments_unavailable`. Nicio rută de plată n-a fost exercitată contra Stripe-ului real, niciodată. |
| **Coada și workerul** | **Neacoperit** | `grep -rln 'queue\|worker' api/tests/` întoarce doar `email-templates.test.ts` și `tickets.test.ts` — și acolo se caută în **payload-uri de e-mail**, nu în BullMQ. **Niciun test nu pornește `api/src/worker.ts`**, nu testează `enqueueProvisioning`, `pruneQueue()`, `reconcile()` sau `retryFailedWebhookEvents()`. |
| **Backup / restore** | **Neacoperit** | rutele `/api/instances/:id/backups*` (`instance-server.ts`) nu apar în niciun fișier de test. |
| **Nodul real** | **Neacoperit** | `waitForServerInstalled` e mock-uit să întoarcă `true` întotdeauna (`provisioning.test.ts:98`), iar proba de deploy e interceptată. Niciun test nu așteaptă o instalare reală și nu verifică un container real. |
| **Concurrența reală** | **Neacoperit** | livrările webhook duplicate din `webhooks.test.ts:245-246` sunt **secvențiale** (`await` una după alta), deci testul nu poate vedea cursa pe care o descrie BE-03. |
| **A treia tentativă de provisionare** | **Neacoperit** | `provisioning.test.ts:278` exercitează exact **două** rulări. Defectul din BE-02 apare abia la a treia, iar mock-ul (`panel.installed` + `container.installed` = `installed ? 1 : 0`) ascunde intrarea în ramura de reinstalare chiar dacă s-ar ajunge acolo. |

**Cum arată asta în practică:** suita e o rețea de siguranță excelentă pentru *unități* (preț, cotă, autentificare, CRUD, stări) și **zero** protecție pentru *cusături* — exact acolo unde backend-ul e cel mai slab (BE-01…BE-04). Cele 240 de teste verzi și backend-ul cu 4 constatări High coexistă fără contradicție: **nu se suprapun**.

---

## 4. Tabelul constatărilor

| ID | Sev. | Clasă | Componentă | Titlu |
|---|---|---|---|---|
| BE-01 | **High** | `CODE-INSPECTED` | `api/src/services/stripe.ts`, `api/src/routes/webhooks.ts` | Calea banului nu are tranzacție: comandă `PAID` fără plată și fără abonament |
| BE-02 | **High** | `VERIFIED` | `api/src/services/provisioning.ts` | Marcajul de reluare al provisionării e distrus la fiecare tentativă; garanța documentată nu se ține |
| BE-03 | **High** | `CODE-INSPECTED` | `api/src/routes/webhooks.ts` | Ledgerul webhook nu apără de livrările concurente ale aceluiași eveniment |
| BE-04 | **High** | `CODE-INSPECTED` | `api/src/services/provisioning.ts` | Provisionarea face 10 mutații pe panou și ~20 de scrieri în DB cu o singură tranzacție |
| BE-05 | **Medium** | `CODE-INSPECTED` | `api/prisma/schema.prisma` | Cele cinci sume care se deplasează nu au nicio constrângere în schemă |
| BE-06 | **Medium** | `CODE-INSPECTED` | `api/src/routes/admin.ts`, `api/src/services/provisioning.ts` | O provisionare blocată ține blocaj 30 de minute; retry-ul manual nu poate trece |
| BE-07 | **Medium** | `CODE-INSPECTED` | `api/src/worker.ts`, `api/src/services/queue.ts` | `pruneQueue()` șterge joburile eșuate și anulează retenția declarată |
| BE-08 | **Medium** | `CODE-INSPECTED` | `api/src/worker.ts` | Patru bucle ale workerului înghit erorile fără să scrie nimic |
| BE-09 | **Medium** | `CODE-INSPECTED` | `api/src/routes/webhooks.ts` | Verificarea sumei se dezactivează când `amount_total` lipsește |
| BE-10 | **Medium** | `CODE-INSPECTED` | `api/src/routes/webhooks.ts` | Orice livrare repetată resetează `fulfillmentStatus` la `PROVISIONING` |
| BE-11 | **Medium** | `CODE-INSPECTED` | `docs/API_CONTRACT.md` vs `api/src/routes/*` | Contractul API și implementarea diferă: o rută documentată nu există, 24 nu sunt documentate |
| BE-12 | **Medium** | `DOCUMENTED-ONLY` + `CODE-INSPECTED` | `api/tests/*` | Cele 240 de teste dovedesc unitățile, nu cusăturile: panoul, Stripe live, coada, workerul, backup/restore și nodul real nu sunt acoperite |
| BE-13 | **Medium** | `VERIFIED` | `api/prisma/schema.prisma` | Ștergerea unui utilizator cascadează peste istoricul său financiar |
| BE-14 | **Medium** | `CODE-INSPECTED` | `api/src/routes/orders.ts`, `api/src/services/upgrades.ts` | Numerotarea comenzilor și a facturilor e `count()+1`, nu o secvență |
| BE-15 | **Low** | `CODE-INSPECTED` | `api/prisma/schema.prisma` | `WebhookEvent.status` e text liber, fără enum și fără `updatedAt` |

---

## 5. Constatările în detaliu

### BE-01 — Calea banului nu are tranzacție: comandă `PAID` fără plată și fără abonament

**Severitate:** High · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/services/stripe.ts` (`markOrderPaid`), `api/src/routes/webhooks.ts` (`fulfilOrder`).

**Descriere.** Funcția `markOrderPaid()` (`stripe.ts:252-342`) declară în docstring că e idempotentă, și într-adevăr e idempotentă *per operație*. Dar **nu e atomică**, iar asta e o proprietate diferită. Secvența reală:

```text
api/src/services/stripe.ts:252-257   order = prisma.order.findUnique({ where:{id}, include:{items} })
api/src/services/stripe.ts:259       alreadyPaid = order.status === 'PAID' || order.status === 'FULFILLED'
api/src/services/stripe.ts:263-268   if (order.promotionId && !order.promotionRedeemedAt) → $transaction([...])
api/src/services/stripe.ts:270-279   if (!alreadyPaid) order.update({ status:'PAID', paidAt, stripePaymentIntentId })
api/src/services/stripe.ts:282       await upsertPayment(order, params)          ← apel extern Stripe + scriere locală
api/src/services/stripe.ts:288-295   remote = await retrieveStripeSubscription(...)  ← al doilea apel extern Stripe
api/src/services/stripe.ts:304-327   for each item: subscription.upsert({ where:{orderItemId} })
```

Între `:279` (comanda e `PAID`) și `:327` (abonamentele sunt scrise) sunt **două apeluri externe spre Stripe**, fiecare cu latență și posibilitate de eșec, și **nicio tranzacție**. `fulfilOrder()` (`webhooks.ts:132-182`) continuă în același stil: creează instanțele una câte una (`:151`), le leagă de abonament (`:171`), enqueueuiește provisionarea (`:174`) și abia la final marchează comanda (`:178-181`).

**Impact concret.**

1. **Comandă plătită fără abonament.** Procesul moare între `:279` și `:304` → comanda e `PAID`, cu `paidAt` setat, dar **nu există niciun rând în `Subscription` și niciunul în `Payment`**. Clientul a plătit și nu are serviciu.
2. **Comandă plătită cu abonament lipsă, parțial recuperabilă.** Webhook-ul rămâne în ledger cu starea `'received'` (nu `'processed'`), deci Stripe reîncearcă și `markOrderPaid` reia — `alreadyPaid` e adevărat, comanda nu e atinsă, dar `upsertPayment` și `subscription.upsert` **se execută din nou** și repară starea. **Recuperarea depinde însă de reîncercarea lui Stripe.** Dacă evenimentul a fost marcat `'processed'` (adică `processEvent` s-a terminat fără eroare — cazul în care eșecul a fost în afara bazei de date, de exemplu un OOM kill înaintea ultimei scrieri), starea rămâne stricată definitiv.
3. **Instanțe parțiale.** Eșecul lui `fulfilOrder` după prima instanță → o instanță provisionată, comanda tot `NOT_STARTED`, iar `enqueueProvisioning` nu s-a apucat pentru restul.
4. **Consumul promoției se dublează** dacă două prelucrări concurente trec ambele prin `claimEvent` (BE-03): condiția de la `:263` e citită în afara tranzacției și fără blocaj de rând, deci ambele intră în ramură și ambele incrementează `Promotion.usedCount`.

**Dovezi.**

```
$ grep -rn '\$transaction' api/src/ --include=*.ts | grep -v 'db.ts:10'
api/src/services/provisioning.ts:615:    await prisma.$transaction(async (tx) => {
api/src/services/pricing.ts:208:  await prisma.$transaction(async (tx) => {
api/src/services/stripe.ts:264:    await prisma.$transaction([
api/src/routes/instances.ts:353:    await prisma.$transaction([
api/src/routes/settings.ts:319:      await prisma.$transaction([
api/src/routes/admin.ts:289:    await prisma.$transaction([
api/src/routes/auth.ts:219:    await prisma.$transaction([
api/src/routes/auth.ts:275:    await prisma.$transaction([
                                                                                    # 8 în total
```

```
api/src/services/stripe.ts:270-282
  if (!alreadyPaid) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date(), ... } });
  }
  // The payment row is the link to the Stripe customer and to the invoice.
  await upsertPayment(order, params);          // ← apel extern Stripe
```

```
$ # stare live: nu există nicio comandă plătită, deci blast radius-ul e astăzi zero
$ SELECT status, count(*) FROM "Order" GROUP BY status;
 AWAITING_PAYMENT | 4
 PENDING          | 1
$ SELECT count(*) FROM "Payment";       → 0
$ SELECT count(*) FROM "Invoice";       → 0
$ SELECT count(*) FROM "Subscription";   → 0
```

**Remediere (efort: mic pentru 1–2, mijloc pentru 3).**

1. Înfășoară scrierile din `markOrderPaid` într-o singură `prisma.$transaction` care să cuprindă `order.update` + `payment` + `subscription.upsert` × N. **Atenție:** `upsertPayment` și `retrieveStripeSubscription` fac apeluri externe — **apelează-le înainte** de a deschide tranzacția și folosește rezultatele în interior.
2. În `fulfilOrder`, creează toate instanțele într-o tranzacție (`createMany` sau un `$transaction` pe array) și **abia apoi** enqueueuiește provisionarea; pune `fulfillmentStatus` în aceeași tranzacție.
3. Pentru consumul promoției, condiția trebuie să fie **în** tranzacție și cu blocaj de rând: `prisma.$queryRaw` cu `SELECT … FOR UPDATE` pe rândul promoției, sau o condiție atomică de tip `updateMany({ where: { id, usedCount: { lt: maxRedemptions } }, data: { usedCount: { increment: 1 } } })` a cărei `count` să fie verificat.

**Criterii de acceptanță:** un test care injectează o eroare în `upsertPayment` și verifică că **nu** rămâne nicio comandă în starea `PAID` fără `Subscription`; un test cu două apeluri concurente pe același eveniment webhook care verifică că `Promotion.usedCount` crește cu **1**, nu cu 2.

---

### BE-02 — Marcajul de reluare al provisionării e distrus la fiecare tentativă

**Severitate:** High · **Clasă:** `VERIFIED` · **Componentă:** `api/src/services/provisioning.ts`.

**Descriere.** Documentația promite explicit:

```text
api/src/services/provisioning.ts:412-419
/**
 * The full provisioning flow.
 *
 * Every step records its outcome on the instance, so a retried job continues
 * after the last completed step instead of starting over. ...
 */
```

Marcajul e `Instance.provisionStep`, iar funcția care îl scrie e `completeStep()`:

```text
api/src/services/provisioning.ts:85-94
async function completeStep(instanceId: string, step: ProvisionStep): Promise<void> {
  await prisma.instance.update({ where: { id: instanceId }, data: { provisionStep: step } });
  await prisma.provisioningJob.updateMany({ where: { instanceId, status: 'running' }, data: { status: 'completed' } });
}
```

Și iată problema: **`completeStep(instance.id, 'pterodactyl_user')` se execută la începutul fiecărei rulări, fără condiție** (`:438`). Deci la fiecare reluare, `Instance.provisionStep` e rescris cu **primul** pas, iar garanția de mai sus nu mai ține: reluarea continuă după ultimul pas completat **doar la fiecare al doilea restart**.

Cum rezistă reinstalarea? printr-o **a doua garză independentă**: `server.container.installed === 1` (`:535`), citită de pe panou la fiecare rulare. Deci datele clientului sunt protejate — dar **numai după ce instalarea s-a terminat**. Cât timp instalarea e în curs (`container.installed === 0`, până la `waitForServerInstalled(server.id, 900_000)` = 15 minute), o reluare care intră în ramură **cerut din nou `reinstallServer`**, iar panoul șterge fișierele serverului.

**Dovezi — (a) simulare deterministă a semanticilor din `provisioning.ts:85-102` + `:435-611`:**

```
attempt  snapshot loaded    persisted after attempt    reinstall branch        other
--------------------------------------------------------------------------------------------------
   1     | None             | installed                 | ENTER reinstall branch | re-run waitForServerInstalled (up to 900s), re-run power start
   2     | installed        | pterodactyl_user          | skip reinstall        | skip installed, re-run power start
   3     | pterodactyl_user | installed                 | ENTER reinstall branch | re-run waitForServerInstalled (up to 900s), re-run power start
   4     | installed        | pterodactyl_user          | skip reinstall        | skip installed, re-run power start
   5     | pterodactyl_user | installed                 | ENTER reinstall branch | re-run waitForServerInstalled (up to 900s), re-run power start
```

**Dovezi — (b) istoricul real din baza de date**, care reproduce alternanța *exact* (mesajul „The server was already installed, so nothing was reinstalled." e scris **în interiorul** ramurii `!done('image_built')`, la `:537`; mesajul „The installation was already requested, skipping it." e ramura `else`, la `:544`):

```
$ SELECT "instanceId", type, left(message,64), "createdAt" FROM "InstanceEvent"
  WHERE message ILIKE '%install%' ORDER BY "createdAt" LIMIT 12;

inst    | type        | msg                                                          | createdAt
--------+-------------+-------------------------------------------------------------+--------------------------
cmvkbgm9 | provisioning | The installation was started on the node.                     | 2026-10-23 01:53:59.015   ← tentativa 1: RAMURĂ
cmvkbgm9 | failed       | Provisioning failed at "started": The container cannot be st… | 2026-10-23 01:55:15.655
cmvkbich | provisioning | The installation was started on the node.                     | 2026-10-23 01:55:19.305
cmvkbgm9 | provisioning | The installation was already requested, skipping it.        | 2026-10-23 01:55:21.060   ← tentativa 2: SALT
cmvkbgm9 | failed       | Provisioning failed at "started": …                         | 2026-10-23 01:55:21.095
cmvkbgm9 | provisioning | The server was already installed, so nothing was reinstalled. | 2026-10-23 01:55:31.521   ← tentativa 3: RAMURĂ
cmvkbgm9 | provisioning | Started at step "installed".                                | 2026-10-23 01:55:31.540
cmvkbgm9 | failed       | Provisioning failed at "started": …                         | 2026-10-23 01:55:31.656
cmvkbgm9 | provisioning | The installation was already requested, skipping it.        | 2026-10-23 01:56:32.020   ← tentativa 4: SALT
cmvkbgm9 | failed       | Provisioning failed at "started": …                         | 2026-10-23 01:56:32.057
cmvkbgm9 | provisioning | The server was already installed, so nothing was reinstalled. | 2026-10-23 01:56:32.426   ← tentativa 5: RAMURĂ
cmvkbgm9 | provisioning | Started at step "installed".                                | 2026-10-23 01:56:32.440
```

Secvența **1 → 2 → 3 → 4 → 5** din istoricul real corespunde **exact** simulării: ramură, salt, ramură, salt, ramură. Nu e o coincidență: e `completeStep('pterodactyl_user')` de la `:438` rescrIstind marCajul la fiecare rulare.

**Dovezi — (c) volumul de muncă irosit:**

```
$ SELECT "step", status, count(*) FROM "ProvisioningJob" GROUP BY "step", status ORDER BY 1;
 activated           | completed | 5
 health_verified    | failed    | 9      ← 9 reluări au intrat în ramura de reinstalare
 health_verified    | completed | 3
 image_built        | completed | 16
 installed          | completed | 16
 node_selected      | completed | 3
 pterodactyl_user   | completed | 35
 server_created     | completed | 3
 started            | failed    | 21
 started            | completed | 7
 subscription_linked| completed | 5
```

`pterodactyl_user` s-a executat de **35 de ori** pentru **3 servere**; `server_created`, de **3 ori**. Adică 32 de rulări au reluat primii pași de la capăt.

**Impact concret.**

1. **Garanția documentată e falsă.** Un operator care citește `provisioning.ts:415-418` și un retry de la `admin.ts:845` are motive să creadă că reluarea continuă de unde a rămas. Nu e așa decât la fiecare al doilea restart.
2. **Fiecare reluare reia `waitForServerInstalled(server.id, 900_000)`** — până la 15 minute de așteptare, pentru un server care era deja instalat. Cu 5 încercări, o instanță blocată consumă până la o oră de muncă a workerului pentru un rezultat identic.
3. **Cât timp instalarea e în curs, ramura de reinstalare chiar e reintrată** — și atunci `server.container.installed === 0`, deci `reinstallServer()` (`:539`) e apelat din nou. Pterodactyl șterge fișierele serverului la reinstalare (comentariul propriu al codului, `:529`). **În fluxul de azi impactul e stricat pe timp și instalare, nu pierdere de date de client** — pentru că în momentul în care instalarea e în curs, clientul nu are încă nimic pe server. Dar e o armă încărcată: **orice viitor pas care scrie pe server înainte de `activated` ar pierde date la o reluare.**
4. **Tabelul `ProvisioningJob` crește fără bound** — nu există nicio curățare. 123 de rânduri pentru 3 instanțe, la 30 de eșecuri.

**Remediere (efort: mic).**

1. `completeStep()` nu trebuie să poată **coboarî** marcajul. Fie o funcție separată `resetStep()` folosită doar la prima rulare, fie `completeStep` să refuse o scriere cu un indice mai mic decât cel curent:
   ```ts
   // completStep: nu coborî marcajul
   const current = await prisma.instance.findUnique({ where: { id: instanceId }, select: { provisionStep: true } });
   if (current?.provisionStep && idx(current.provisionStep) > idx(step)) return;   // nu coborî
   ```
2. `beginProvisioning()` (`:70-79`) nu trebuie să ștergă `provisionError` la începutul fiecărei încercări — doar la **prima** rulare. Altfel operatorul vede doar ultima eroare (30 de eșecuri în istoric, 21 la același pas).
3. Adaugă un test cu **trei** rulări consecutive (nu două), care să assertă că `reinstallServer` nu e apelat în niciuna — testul existent (`provisioning.test.ts:278`) nu poate vedea defectul pentru că (a) exercitează două rulări și (b) mock-ul pune `container.installed = 1` imediat după primul `reinstallServer`.

**Criterii de acceptanță:** după o cădere la pasul `started`, `Instance.provisionStep` rămâne `installed` (nu `pterodactyl_user`) după reluare; un test cu trei rulări consecutive confirmă că `reinstallServer` e apelat **o singură dată**.

**Notă de acord cu frații vecini.** `04-pterodactyl-and-provisioning.md` §4.5 (rândul „Retry-ul **nu reîncepe de la zero**: continuă după `provisionStep`") e corect pentru **prima** reluare și inexact pentru următoarele. `04` §4.3 (nu există acțiune compensatorie) rămâne în întregime valabil.

---

### BE-03 — Ledgerul webhook nu apără de livrările concurente ale aceluiași eveniment

**Severitate:** High · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/webhooks.ts`.

**Descriere.** Ledgerul (`WebhookEvent`, cu `@@unique([provider, eventId])`) e corect în intenție: `claimEvent()` (`:59-95`) încearcă să creeze rândul, și dacă există deja, decide între „procesează", „reia" și „duplicat". Dar stările nu se exclud mutual.

```text
api/src/routes/webhooks.ts:65-72
  try {
    await prisma.webhookEvent.create({ data: { ..., status: 'received' } });   // ← starea inițială
    return 'claimed';
  } catch { /* doar unicitatea ar trebui să treacă prin acest catch */ }

api/src/routes/webhooks.ts:79       if (existing.status === 'processed') return 'duplicate';
api/src/routes/webhooks.ts:81-83
  const abandoned =
    existing.status === 'received' ||                              // ← PROBLEMĂ
    (existing.lastAttemptAt ? Date.now() - existing.lastAttemptAt.getTime() > STALE_ATTEMPT_MS : false);
api/src/routes/webhooks.ts:85-91
  if (existing.status === 'failed' || abandoned) {
    await prisma.webhookEvent.update({ where: { id: existing.id },
      data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null } });
    return 'retry';
  }
```

`'received'` e **starea în care se află un eveniment aflat în prelucrare**: e scrisă la `:67` la început și nu e schimbată decât la final, de `markProcessed()` (`:97-102`). Prin urmare, o livrare repetată care sosește **în timp ce prima e încă prelucrată** găsește `status === 'received'` → `abandoned = true` → preia rândul → și **procesează evenimentul în paralel**.

În plus, `update()` de la `:86` **nu e condiționat**: nu are `where: { id, status: ... }`, deci două reluări simultane ambele trec, ambele își incrementă `attempts`, ambele își scriu `lastAttemptAt`, și ambele procesează.

Și mai e un caz: `catch { }` de la `:70-72` înghite **orice** eroare, nu doar violarea unicității. Dacă `create` eșuează din alt motiv (baza de date nu răspunde, timeout) și `findUnique` de la `:74` întoarce `null` (de exemplu pentru că rândul chiar nu există), `claimEvent` întoarce `'claimed'` (`:77`) — **evenimentul e prelucrat fără niciun rând în ledger**: fără idempotență, fără urmă, fără să poată fi reluat.

**Impact concret.** Fereastra de prelucrare nu e neglijabilă: `handleStripeEvent` face `markOrderPaid()` → care face **două apeluri externe spre Stripe** (`upsertPayment` → `retrieveStripeSubscription`), apoi `fulfilOrder()` → care creează instanțe și enqueueuiește joburi. Într-o rețea lentă sau cu Stripe lent, fereastra e de sute de milisecunde până la câteva secunde — suficient pentru o livrare paralelă (Stripe reîncearcă pe orice non-2xx, iar o livrare duplicată poate apărea și din cauza unui timeout al clientului).

Damage-ul concret al procesării paralele:

1. **Promoția e consumată de două ori.** `stripe.ts:263` citește `!order.promotionRedeemedAt` pe obiectul `order` încărcat la `:253`, **în afara** tranzacției; cele două rulări paralele ambele văd `null`, ambele intră în ramură, ambele incrementează `Promotion.usedCount`. `PromotionRedemption.orderId @unique` nu protejează calea, pentru că aici nu se scrie niciun rând de redemption.
2. **Starea de livrare a comenzii e stricată.** `fulfilOrder()` face `order.update({ fulfillmentStatus: 'PROVISIONING' })` **necondiționat** (`:178-181`) — vezi BE-10.
3. **Ledgerul se minte.** Două rulări paralele, ambele ajung la `markProcessed()`; una poate suprascrie `markFailed()` al celeilalte (`:104-109`) sau invers — starea finală nu reflectă ce s-a întâmplat.
4. **Se creează abonamente în plus?** Nu — `subscription.upsert({ where: { orderItemId } })` e idempotent. **Dar `Payment` se poate duplica?** Nu — `upsertPayment` folosește `stripePaymentIntentId` unic. Bun: aici idempotența e salvată de constrângerile de schemă, nu de logică.

**Dovezi.**

```
api/src/routes/webhooks.ts:65-83
  try {
    await prisma.webhookEvent.create({ data: { provider, eventId, type, payload: payload as never, status: 'received' } });
    return 'claimed';
  } catch {
    // The unique constraint only fires for an event that was seen before.
  }
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
  if (!existing) return 'claimed';
  if (existing.status === 'processed') return 'duplicate';
  const abandoned =
    existing.status === 'received' ||
    (existing.lastAttemptAt ? Date.now() - existing.lastAttemptAt.getTime() > STALE_ATTEMPT_MS : false);
```

```
$ # testul existent trimite cele două livrări SECVENȚIAL, deci nu poate vedea cursa
api/tests/webhooks.test.ts:245-246
  const first  = await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);
  const second = await webhook.request('POST', '/api/webhooks/stripe/test', event, internal);
```

**Remediere (efort: mic).**

1. **Setează starea `'processing'` la preluare**, nu la sfârșit: `create` cu `status: 'processing'` și `lastAttemptAt: new Date()`. `markProcessed()` trece apoi la `'processed'`.
2. **`'received'` nu mai trebuie să însemne „abandonat".** Condiția corectă: evenimentul e abandonat doar dacă `lastAttemptAt` e mai vechi de `STALE_ATTEMPT_MS` **și** starea nu e `'processing'`.
3. **Fă `update` condiționat**, ca o preluare atomică: `updateMany({ where: { id, status: { in: ['failed','received'] } }, data: {...} })` și verifică `count === 1`; altfel revino cu `'duplicate'`. Astfel, două reluări simultane — una câștigă, cealaltă renunță.
4. **Înlocuiește `catch { }` cu `catch (error) { … }`** și verifică explicit că e o violare de unicitate (`error.code === 'P2002'`); la orice altă eroare, **aruncă** — nu procesa un eveniment fără rând în ledger.

**Criterii de acceptanță:** un test care trimite două livrări **concurente** (`Promise.all`) ale aceluiași eveniment și verifică că `Promotion.usedCount` crește cu 1, că există exact o instanță și că ledgerul are o singură linie cu `attempts = 1`.

---

### BE-04 — Provisionarea face 10 mutații pe panou și ~20 de scrieri în DB cu o singură tranzacție

**Severitate:** High · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/services/provisioning.ts`.

**Descriere.** `provisionInstance()` (`:420-685`) execută, în ordine: `acquireLock` → 10 pași, fiecare cu o mutație pe panou și una sau mai multe scrieri în DB → o singură `$transaction` → `completeProvisioning` → notificare. **Singura tranzacție din tot fișierul** e la `:615-621` și cuprinde doar legarea abonamentului de instanță:

```text
api/src/services/provisioning.ts:613-621
  await beginProvisioning(instance, 'subscription_linked');
  await prisma.$transaction(async (tx) => {
    if (!instance.orderItemId) return;
    const subscription = await tx.subscription.findUnique({ where: { orderItemId: instance.orderItemId } });
    if (subscription && !subscription.instanceId) {
      await tx.subscription.update({ where: { id: subscription.id }, data: { instanceId: instance.id } });
    }
  });
```

Punctul cel mai expus e **scrierea identificatorului serverului**:

```text
api/src/services/provisioning.ts:458   const created = await ptero.createServer({ ... });   ← MUTAȚIE PE PANOU
api/src/services/provisioning.ts:487-497
  await prisma.instance.update({ where: { id: instance.id }, data: {
    pterodactylServerId: created.id, pterodactylUuid: created.uuid,
    pterodactylAllocation: created.allocation ?? null, pterodactylNodeId: created.node ?? null } });
```

Între `:458` și `:487` există o **fereastră în care panoul are serverul și baza de date nu**. `chooseNode()` (`:203-225`) alege o alocare **libera** de pe panou; alocarea devine efectiv rezervată abia când `createServer` o ia. Deci o eroare la `:487` (timeout, reset de conexiune, DB indisponibil) înseamnă:

- panoul are un server nou, cu o alocare ocupată și RAM/disc consumate;
- baza de date nu știe de el → `Instance.pterodactylServerId` rămâne `null`;
- la următoarea rulare, `server` e `null` (`:441-443`) ⇒ `chooseNode` alege **altă** alocare liberă ⇒ `createServer` creează **al doilea server** pentru același client;
- primul server devine orfan: consumă resurse pe nod, nu are instanță, nu apare în niciun raport.

`04-pterodactyl-and-provisioning.md` §4.5 (rândul „**Cazul periculos**") notează deja această fereastră. Ce adaugă acest raport e că **fereastra nu e o coincidență, ci o consecință a lipsei de tranzacție** — și că același tip de fereastră există la fiecare pas, nu doar la crearea serverului.

**Impact concret.** În istoricul real din producție, panoul are **5 servere** pentru **3 instanțe** în DB, dintre care 2 orfane (`04-pterodactyl-and-provisioning.md` §4.4). Doar unul dintre ele e explicat prin ștergerea unui cont de panou; celălalt nu are explicație în cod. Mecanismul de mai sus e cel mai probabil.

Alte ferestre de același tip:
- `completeStep()` (`:85-94`) scrie **două** rânduri în două tabele diferite (`Instance.provisionStep` și `ProvisioningJob.status`) fără tranzacție. O eroare între ele lasă jobul „running" pentru un pas deja completat — iar `failProvisioning` (`:109-112`) marchează **toate** rândurile „running" ale instanței ca eșuate, ceea ce poate marca un pas reușit drept eșuat.
- `beginProvisioning()` (`:70-79`) face **trei** scrieri nesigure (update instanță, create job, create event). O eroare la a treia lasă un job „running" fără eveniment.

**Dovezi.**

```
$ grep -c '\$transaction' api/src/services/provisioning.ts
1
$ grep -n '\$transaction' api/src/services/provisioning.ts
615:    await prisma.$transaction(async (tx) => {

api/src/services/provisioning.ts:458   const created = await ptero.createServer({ ... });
api/src/services/provisioning.ts:487   await prisma.instance.update({ where: { id: instance.id }, data: { pterodactylServerId: created.id, ... } });
```

```
$ # starea reală pe panou vs. în DB (04-pterodactyl-and-provisioning.md §4.4, reverificat)
$ SELECT count(*) FROM "Instance";    → 3
$ # panoul: 5 servere  →  2 orfane
```

**Remediere (efort: mijloc; implică și o acțiune compensatorie).**

1. **Acțiune compensatorie în `failProvisioning()`**: dacă `instance.pterodactylServerId` e setat și pasul e după `server_created`, șterge serverul de pe panou (`deleteServer()`, care există deja în `services/pterodactyl/application.ts`) — sau marchează-l pentru ștergere, ca în `billing.ts:80-85`.
2. **Găsește serverele orfane înainte de a crea unul nou**: înainte de `createServer`, caută pe panou un server cu același `external_id`/nume și reutilizează-l. Astfel, o eroare la `:487` devine recuperabilă.
3. **Înfășoară `completeStep()` într-o tranzacție** (cele două scrieri sunt în tabele diferite, deci tranzacția e utilă).
4. **Scrie `pterodactylServerId` imediat după `createServer`, într-o operație separată și retriabilă**, și marchează serverul drept „în adopție" înainte de a continua cu pașii următori.

**Criterii de acceptanță:** un test care injectează o eroare la scrierea `pterodactylServerId` și verifică că reluarea **nu creează un al doilea server** și că serverul orfan e șters.

---

### BE-05 — Cele cinci sume care se deplasează nu au nicio constrângere în schemă

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/prisma/schema.prisma`.

**Descriere.** Schema e bogată în constrângeri — 16 enum-uri, `UNIQUE` pe fiecare identificator de business, `@@unique([provider, eventId])` pe ledger, chei străine cu `CASCADE`/`SET NULL` — dar **niciuna dintre cele cinci coloane care rețin bani nu e legată de sursa ei**:

| Coloană | Model | Ce ar trebui să lege | Ce există |
|---|---|---|---|
| `Order.total` | `Order` (`schema.prisma:348+`) | `Σ OrderItem.total` − `Order.discount` | `Int` scris ca literal (`orders.ts:79`) |
| `Invoice.total` | `Invoice` (`schema.prisma:461+`) | `Invoice.amount` + `Invoice.tax` | `Int` independent (`stripe.ts:440+`, `billing.ts:119-134`) |
| `Payment.amount` | `Payment` (`schema.prisma:496+`) | suma efectiv încasată | `Int` (`stripe.ts:349`) |
| `Subscription.amount` | `Subscription` (`schema.prisma:420+`) | `OrderItem.total` | `Int` (`stripe.ts:313,321`) |
| `Instance.price` | `Instance` (`schema.prisma:585+`) | prețul cotat | `Int` (`webhooks.ts:162`) |

În plus, celelalte invariante de business — legalitatea tranziției de stare a comenzii, `Promotion.usedCount ≤ maxRedemptions`, fereastra de valabilitate a promoției, `Instance.ram ≤ Product.maxRam` — trăiesc exclusiv în cod, în momente diferite.

**Impact concret.** Orice scriere directă în baza de date, orice migrare, orice script de administrare poate lăsa sumele incoerente **fără ca baza de date să protesteze**. Concret: o migrare care adaugă o coloană `OrderItem` fără să actualizeze `Order.total` trece fără eroare; un script de reconciliere care actualizează `OrderItem.total` lasă `Order.total` vechi; un raport financiar construit pe `Order.total` și altul construit pe `Σ OrderItem.total` dau rezultate diferite pe aceleași comenzi — și **niciunul dintre ele n-are dreptate**.

Niciun `CHECK` constraint n-ar rezolva complet problema (o `CHECK` nu poate referi un alt tabel), dar ar închide o parte importantă: `CHECK (total >= 0)`, `CHECK (discount >= 0)`, `CHECK (total = amount + tax)` pe `Invoice`, `CHECK (total <= subtotal)` pe `Order`.

**Dovezi.**

```
$ grep -c '^model ' api/prisma/schema.prisma
31
$ grep -n 'total\|amount\|price\|discount' api/prisma/schema.prisma | grep -E 'Int|Float|Decimal' | head -20
```

```
$ # nu există niciun CHECK constraint în baza live
$ SELECT count(*) FROM information_schema.check_constraints WHERE constraint_schema = 'public';
```

**Remediere (efort: mic pentru CHECK-uri, mijloc pentru coloane generate).**

1. Adaugă `CHECK` pe sumele care se pot invalida: `Order.total >= 0`, `Order.discount >= 0`, `Invoice.total = Invoice.amount + Invoice.tax`, `Payment.amount >= 0`, `Subscription.amount >= 0`.
2. Pentru `Order.total`, folosește o **coloană generată** (`GENERATED ALWAYS AS (...) STORED`) din `OrderItem` dacă Postgres-ul o permite la nivel de tabel; altfel, un trigger.
3. Pentru `Promotion.usedCount ≤ maxRedemptions`, folosește `CHECK (usedCount <= maxRedemptions)` — Postgres o verifică per rând.

**Criterii de acceptanță:** o încercare de a scrie `Invoice.total ≠ Invoice.amount + Invoice.tax` e respinsă de baza de date.

---

### BE-06 — O provisionare blocată ține blocaj 30 de minute; retry-ul manual nu poate trece

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/admin.ts`, `api/src/services/provisioning.ts`, `api/src/services/queue.ts`.

**Descriere.** Blocajul de provisionare e o **înregistrare în baza de date**, nu un mutex: `Instance.provisionLockAt`, cu TTL de 30 de minute (`PROVISION_LOCK_TTL_MS`, `provisioning.ts:34`). `acquireLock()` (`:53-63`) reușește doar dacă blocajul e `null` sau mai vechi de TTL:

```text
api/src/services/provisioning.ts:53-63
  const stale = new Date(Date.now() - PROVISION_LOCK_TTL_MS);
  const result = await prisma.instance.updateMany({
    where: { id: instanceId, OR: [{ provisionLockAt: null }, { provisionLockAt: { lt: stale } }] },
    data: { provisionLockAt: new Date() },
  });
  return result.count > 0;
```

Iar retry-ul manual **nu curăță blocajul**:

```text
api/src/routes/admin.ts:853-854
  await prisma.instance.update({ where: { id }, data: { status: 'PROVISIONING', provisionError: null } });
  await enqueueProvisioning(id, { reason, requestedBy: actor.id });
```

`enqueueProvisioning` e corect (id determinist, refuză duplicatele), dar jobul va eșua imediat: `provisionInstance` → `acquireLock` → `false` → `throw new ProvisioningError('server_created', 'Another provisioning run is already working on this instance.')` (`provisioning.ts:421-423`). BullMQ reîncearcă de **5 ori** cu backoff exponențial de la 5 s (`queue.ts:42-43`) — deci **întreaga fereastră de reîncercare e de ~75 de secunde** — și toate eșuează.

**Rezultatul:** după o cădere a workerului, operatorul apasă retry, primește `202`, și ~75 de secunde mai târziu jobul e mort, iar mesajul de pe instanță e „Another provisioning run is already working on this instance" — **despre un worker care nu mai există**. Singura cale de recuperare e să **aștepte 30 de minute** până când blocajul expiră (sau o repună manuală în DB).

**Impact concret.** Incidentul e rareori urgent (o provisionare eșuată nu blochează un client care încă nu are serviciu), dar recovery-ul e inutil și derutant: operatorul crede că a reluat provisionarea, iar sistemul îi spune, în esență, „nu". Reține că `AuditLog` conține **8 rânduri `instance.retry_requested`** (deci retry-ul manual e o practică reală, nu ipotetică).

**Dovezi.**

```
api/src/services/provisioning.ts:34    const PROVISION_LOCK_TTL_MS = 30 * 60 * 1000;
api/src/services/provisioning.ts:421-423
  if (!(await acquireLock(instanceId))) {
    throw new ProvisioningError('server_created', 'Another provisioning run is already working on this instance.');
  }
api/src/routes/admin.ts:853-854
  await prisma.instance.update({ where: { id }, data: { status: 'PROVISIONING', provisionError: null } });
  await enqueueProvisioning(id, { reason, requestedBy: actor.id });        // ← nu curăță provisionLockAt
api/src/services/queue.ts:42-43        attempts: 5, backoff: { type: 'exponential', delay: 5000 }
```

```
$ # testul existent verifică doar că blocajul ACTIV e refuzat, nu cazul blocajului MORT
api/tests/provisioning.test.ts:300-304
  it('refuses a second run while another run holds the instance', async () => {
    const instance = await seedInstance();
    await prisma.instance.update({ where: { id: instance.id }, data: { provisionLockAt: new Date() } });
    await expect(provisionInstance(instance.id)).rejects.toThrow(/already working/i);
```

**Remediere (efort: mic).**

1. **Retry-ul manual trebuie să elibereze blocajul.** În `admin.ts:853`, include `provisionLockAt: null` în `data`. Un operator care cere explicit un restart are dreptul să întrerupă un blocaj.
2. **Separă „altcineva lucrează" de „blocaj mort".** În `provisionInstance`, înainte de a arunca, verifică dacă `provisionLockAt` e mai vechi de TTL *și* dacă nu există un job activ în coadă; în acest caz, preia blocajul în loc să refuzi.
3. **Mesajul de eroare să fie util**: „Another provisioning run is already working on this instance" ar trebui să spună și **de câte minute** e blocajul, ca operatorul să știe dacă așteaptă sau reacționează.

**Criterii de acceptanță:** după o cădere simulată a workerului (blocaj lăsat proaspăt), `POST /api/admin/instances/:id/retry` duce instanța la `ONLINE` în cel mult o încercare, fără așteptare de 30 de minute.

---

### BE-07 — `pruneQueue()` șterge joburile eșuate și anulează retenția declarată

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/worker.ts`, `api/src/services/queue.ts`.

**Descriere.**

```text
api/src/worker.ts:94-99
/** Removes finished jobs so the queue does not grow without bound. */
async function pruneQueue(): Promise<void> {
  const queue = getQueue();
  await queue.clean(0, 1000, 'completed');
  await queue.clean(0, 1000, 'failed');
}
```

`grace = 0` înseamnă **ștergere imediată**, nu „păstrează cele mai recente". Rolul curge la fiecare 10 minute (`worker.ts:166`). Trei probleme:

1. **Joburile eșuate ale provisionării sunt șterse din Redis.** Urma de diagnostic a unei provisionări eșuate (eroarea exactă, starea, numărul de încercări) dispare din coadă în cel mult 10 minute. Ce rămâne în DB e doar `Instance.provisionError` (doar ultima eroare — vezi BE-02) și rândurile `ProvisioningJob`.
2. **Retenția declarată e anulată.** `queue.ts:44-45` declară `removeOnComplete: { count: 500 }` și `removeOnFail: { count: 500 }` — dar `clean()` rulează **înainte** ca BullMQ să aplice retenția, deci în fapt se păstrează 0 joburi, nu 500.
3. **Asimetrie între cozi.** `getQueue()` e coada de **provisionare**. Coada de e-mail (`getEmailQueue()`, `queue.ts:113-128`) **nu e curățată niciodată** — deci mesajele eșuate se acumulează până la 500, iar mesajele reușite se păstrează 500. Docstring-ul din `worker.ts:54-56` („A message that keeps failing stays in the failed state of the queue, where it can be read") e adevărat pentru e-mail și **fals pentru provisionare**.

**Impact concret.** Diagnosticul unei provisionări eșuate e, în esență, un text de o linie în `Instance.provisionError` și un istoric de evenimente — fără starea jobului, fără numărul de încercări, fără motivul exact al fiecărei încercări. Cum `beginProvisioning()` șterge `provisionError` la fiecare nouă tentativă (`provisioning.ts:73`), **ultima eroare e tot ce rămâne**. Cei 30 de joburi eșuate din DB arată că eșecul a fost repetat la același pas de 9 și de 21 de ori — o informație care ar fi fost mult mai ușor de obținut din coadă.

**Dovezi.**

```
api/src/worker.ts:95-99
  const queue = getQueue();
  await queue.clean(0, 1000, 'completed');
  await queue.clean(0, 1000, 'failed');
api/src/worker.ts:166   timers.push(setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000));
api/src/services/queue.ts:44-45   removeOnComplete: { count: 500 }, removeOnFail: { count: 500 },
```

```
$ SELECT "step", status, count(*) FROM "ProvisioningJob" GROUP BY "step", status ORDER BY 1;
 health_verified | failed | 9
 started          | failed | 21
```

**Remediere (efort: mic).**

1. **Nu șterge joburile eșuate**, sau șterge-le cu o grație lungă: `queue.clean(7 * 24 * 3600_000, 1000, 'failed')` — adică păstrează 7 zile.
2. **Curăță și coada de e-mail**, sau documentează explicit că nu e curățată.
3. **Scoate `grace = 0`** pentru `completed` și folosește o grație, ca să nu se anuleze retenția declarată.

**Criterii de acceptanță:** după o provisionare eșuată, jobul ei e încă lizibil în coadă cu `failedReason` și `attempts` după 30 de minute.

---

### BE-08 — Patru bucle ale workerului înghit erorile fără să scrie nimic

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/worker.ts`.

**Descriere.** Workerul rulează șase intervale. Trei loghează eșecurile, trei nu:

```text
api/src/worker.ts:165   setInterval(() => void reconcile().catch((error) => console.error('[worker] reconcile failed', error)), 60_000)
api/src/worker.ts:166   setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000)              ← tăcut
api/src/worker.ts:167   setInterval(() => void pruneSessions().catch(() => undefined), 60 * 60_000)          ← tăcut
api/src/worker.ts:168   setInterval(() => void sweepBilling().catch((error) => console.error('[worker] billing sweep failed', error)), 15 * 60_000)
api/src/worker.ts:169   setInterval(() => void retryWebhooks().catch((error) => console.error('[worker] webhook retry failed', error)), 5 * 60_000)
```

Și în plus, **în interiorul** lui `sweepBilling` două apeluri sunt tăcute:

```text
api/src/worker.ts:112   await reconcileWithProvider().catch(() => undefined);
api/src/worker.ts:113   await releaseStalePromotionReservations().catch(() => undefined);
```

și unul în `retryWebhooks`:

```text
api/src/worker.ts:121   const recovered = await retryFailedWebhookEvents().catch(() => 0);
```

`reconcileWithProvider()` (`services/billing.ts:149-175`) e **reconcilierea dintre abonamentele locale și cele din Stripe** — deci ești luată de care depinde corectitudinea perioadelor de facturare. Un eșec repetat al ei (cheia Stripe invalidă, rețea, API-ul Stripe indisponibil) produce **zero urme**: niciun rând în jurnal, niciun eveniment în `AuditLog`, niciun metric. Sweep-ul continuă să raporteze succes (`{ renewed, suspended, withdrawn }` — adică `0 0 0`, care nu se afișează pentru că `if (result.renewed || …)` e fals).

**Impact concret.** Cea mai gravă dintre cele patru: `reconcileWithProvider`. Dacă eșuează săptămâni întregi, perioadele de facturare locale derivă din `PERIOD_MS = 30 * 24 * 3600 * 1000` (`billing.ts:27`) — **luni de 30 de zile**, nu luni de calendar — și nimeni nu află că reconcilierea nu mai merge. La fel, `releaseStalePromotionReservations()` (`billing.ts:274-291`) eșuată înseamnă că o campanie rămâne rezervată de comenzi plătite sau abandonate; și asta nu se vede.

**Dovezi.**

```
api/src/worker.ts:112-113
  await reconcileWithProvider().catch(() => undefined);
  await releaseStalePromotionReservations().catch(() => undefined);
api/src/worker.ts:121
  const recovered = await retryFailedWebhookEvents().catch(() => 0);
api/src/worker.ts:166-167
  timers.push(setInterval(() => void pruneQueue().catch(() => undefined), 10 * 60_000));
  timers.push(setInterval(() => void pruneSessions().catch(() => undefined), 60 * 60_000));
```

```
api/src/services/billing.ts:149-175   export async function reconcileWithProvider(): Promise<number>
```

**Remediere (efort: mic).** Înlocuiește `.catch(() => undefined)` cu `.catch((error) => console.error('[worker] <nume>', error))` în toate cele patru locuri. Pentru `reconcileWithProvider`, adaugă un rând în `AuditLog` cu numărul de corecții aplicate — funcția **întoarce deja** `corrected` (`billing.ts:174`), deci informația există și e aruncată.

**Criterii de acceptanță:** o eroare injectată în `reconcileWithProvider` apare în jurnalul workerului în cel mult 15 minute.

---

### BE-09 — Verificarea sumei se dezactivează când `amount_total` lipsește

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/webhooks.ts`.

**Descriere.** `verifyAmount()` e **singura** verificare că suma încasată de Stripe corespunde comenzii:

```text
api/src/routes/webhooks.ts:184-196
/**
 * The amount Stripe collected has to match the order. A mismatch means the
 * order was not paid as quoted, so nothing is provisioned.
 */
async function verifyAmount(orderId: string, amountTotal: unknown): Promise<string | null> {
  if (typeof amountTotal !== 'number') return null;        // ← L189: „totul e în regulă"
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return 'The order does not exist.';
  if (amountTotal !== order.total) {
    return `Stripe collected ${amountTotal} but the order total is ${order.total}.`;
  }
  return null;
}
```

`return null` înseamnă „nu e problemă". Deci **un `amount_total` absent sau non-numeric dezactivează complet verificarea**, iar evenimentul continuă pe calea de plată.

Calea prin care e accesibilă e chiar în cod: gateway-ul de test face suma **opțională**:

```text
api/src/routes/webhooks.ts:504     amount: z.number().int().optional(),
api/src/routes/webhooks.ts:520       amount_total: body.amount,
```

Așadar, `POST /api/webhooks/stripe/test` **fără câmpul `amount`** produce un eveniment cu `amount_total = undefined` → fără nicio verificare a sumei → comanda e marcată `PAID`, `Payment.amount` primește fallback-ul `order.total` (`stripe.ts`, `upsertPayment`), iar instanța e provisionată. Evenimentul e totuși marcat drept „plătit integral".

**Impact concret.** Doi niveluri:

1. **Real, azi**: gateway-ul de test e folosit de `scripts/verify-provisioning.py` (8 rulări reale, cu id-uri `evt_verify_*` în ledger). Un script sau un operator care uită câmpul `amount` obține o comandă marcată `PAID` **fără ca suma să fi fost vreodată verificată**. Ledgerul nu spune nimic despre asta: evenimentul e `processed`.
2. **Latent, pentru Stripe real**: pe `checkout.session.completed`, Stripe trimite întotdeauna `amount_total`. **Deci bugul nu e accesibil din Stripe azi.** Dar e o bombă cu temporizare în cod: orice eveniment nou fără `amount_total` (un tip de eveniment nou, un payload modificat, o integrare viitoare) trece **silențios** prin „am verificat suma", fără niciun jurnal.

De reținut: **verificarea e și ea incompletă într-un mod mai subtil** — compară `amount_total` cu `order.total`, adică cu suma **discountuită**, în timp ce Stripe încasează suma **nediscountuită** (P1/P2/P3 în `05-commerce-and-billing.md` §2.4). Deci verificarea e *prea strictă* cu promoții și *prea laxă* când lipsește. Ambele defecte trebuie reparate împreună.

**Dovezi.**

```
api/src/routes/webhooks.ts:188-193
  async function verifyAmount(orderId: string, amountTotal: unknown): Promise<string | null> {
    if (typeof amountTotal !== 'number') return null;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return 'The order does not exist.';
    if (amountTotal !== order.total) { ... }

api/src/routes/webhooks.ts:496-524   POST /api/webhooks/stripe/test
  amount: z.number().int().optional(),      // ← L504
  ...
  amount_total: body.amount,               // ← L520, poate fi undefined
```

```
$ # cele 8 evenimente reale din ledger sunt toate evt_verify_* (scriptul), nu Stripe
$ SELECT "eventId", type, status, attempts FROM "WebhookEvent" ORDER BY "createdAt";
 evt_verify_1792699431 | checkout.session.completed | received | 0
 evt_verify_1792699523 | checkout.session.completed | received | 0
 … (8 rânduri, toate cu attempts = 0)
```

**Remediere (efort: mic).**

1. **Un eveniment fără sumă nu poate fi un eveniment de plată.** În `handleStripeEvent`, pentru `checkout.session.completed` și `checkout.session.async_payment_succeeded`, **exigă** prezența sumei:
   ```ts
   if (typeof object.amount_total !== 'number') {
     throw new DeferredWebhookError('The event carries no amount, so it cannot be applied.');
   }
   ```
   Un eveniment fără sumă e **amânat**, nu plătit. `DeferredWebhookError` e deja mecanismul potrivit (`:116-124`).
2. **În gateway-ul de test, `amount` trebuie să fie obligatoriu**, nu opțional — un simulator care permite evenimente fără sumă nu mai e un simulator al lui Stripe.
3. **Compară cu suma corectă.** Odată reparat P1/P2 (vezi `05-commerce-and-billing.md` §2.4), `verifyAmount` trebuie să compare `amount_total` cu **suma efectiv plătibilă**, nu cu `order.total` — și, ideal, să compare cu ambele și să diferențieze „altă sumă" de „aceeași sumă, altă reprezentare".

**Criterii de acceptanță:** un eveniment fără `amount_total` **nu** marchează nicio comandă `PAID` și rămâne în ledger ca `deferred`, cu un mesaj care spune de ce.

---

### BE-10 — Orice livrare repetată resetează `fulfillmentStatus` la `PROVISIONING`

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/webhooks.ts`, `api/src/services/provisioning.ts`.

**Descriere.** `fulfilOrder()` marchează comanda ca „în curs de provisionare" **necondiționat**, la final:

```text
api/src/routes/webhooks.ts:178-181
  await prisma.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'PROVISIONING' } });
```

Pe de altă parte, provisionarea marchează comanda ca livrată:

```text
api/src/services/provisioning.ts:651-654
  await prisma.order.updateMany({ where: { id: instance.orderId, status: 'PAID' },
    data: { status: 'FULFILLED', fulfillmentStatus: 'FULFILLED' } });
```

Deci: o livrare repetată a aceluiași eveniment webhook, după ceprovisionarea s-a încheiat, execută `fulfilOrder()` din nou. Funcția găsește instanțele existente (`:148-149` → `continue`), deci **nu creează nimic nou** — dar ajunge la `:178` și scrie `fulfillmentStatus: 'PROVISIONING'`.

Rezultatul: comanda ajunge în starea **`status = 'FULFILLED'` + `fulfillmentStatus = 'PROVISIONING'`** — două câmpuri care în model sunt legate (`FulfillmentStatus`, `schema.prisma:341+`) spun lucruri diferite despre aceeași comandă.

**Și nu se repară singură.** Workerul sare peste instanțele deja `ONLINE` (`worker.ts:36-39`), deci provisionarea nu se reia, iar `fulfillmentStatus` nu e rescris. Comanda rămâne în starea contradictorie **la nesfârșit**, până la o intervență manuală.

**Impact concret.**

1. **Comanda arată, în panoul de personal, că e încă în provisionare**, deși e plătită și funcțională — cu tot ce înseamnă asta pentru operator (nu o caută, crede că ceva e blocat).
2. **Raportul „comenzi plătite, neprovisionate" e fals.** Orice interogare de tip „comenzi cu `status='PAID'` și `fulfillmentStatus ≠ 'FULFILLED'`" ar raporta comenzi ca fiind în așteptare, pe baza unui eveniment repetat.
3. **Este exact starea pe care `04-pterodactyl-and-provisioning.md` §4.3 (punctul 3) o descrie** („`fulfillmentStatus` rămâne `PROVISIONING`"), dar explicată acolo printr-o cauză diferită (provisionare eșuată). Aici cauza e o livrare repetată — deci **două mecanisme distincte produc același simptom**, iar primul nu e diagnosticat.

**Dovezi.**

```
api/src/routes/webhooks.ts:178-181
  await prisma.order.update({ where: { id: order.id }, data: { fulfillmentStatus: 'PROVISIONING' } });

api/src/services/provisioning.ts:651-654
  await prisma.order.updateMany({ where: { id: instance.orderId, status: 'PAID' },
    data: { status: 'FULFILLED', fulfillmentStatus: 'FULFILLED' } });

api/src/worker.ts:36-39
  if (instance.status === 'ONLINE') { job.log?.('instance is already online'); return; }
```

**Remediere (efort: mic).** Marchează „în curs" doar dacă starea **nu** e deja terminală:

```ts
await prisma.order.updateMany({
  where: { id: order.id, fulfillmentStatus: { not: 'FULFILLED' } },
  data: { fulfillmentStatus: 'PROVISIONING' },
});
```

**Criterii de acceptanță:** după o livrare repetată a unui eveniment pentru o comandă deja `FULFILLED`, comanda rămâne `status='FULFILLED'`, `fulfillmentStatus='FULFILLED'`.

---

### BE-11 — Contractul API și implementarea diferă

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `docs/API_CONTRACT.md` vs `api/src/routes/*`.

**Descriere.** `docs/API_CONTRACT.md` (224 de linii) e documentul pe care un integrator se bazează. Comparat automat cu rutele înregistrate în cod (142 rută în implementare, 123 documentate), **divergențele reale** sunt:

| # | Contract | Implementare |
|---|---|---|
| 1 | `POST /api/admin/instances/:id/import` — `API_CONTRACT.md:215` | `POST /api/admin/instances/import` — `api/src/routes/admin.ts:864` |
| 2 | „`POST /api/webhooks/stripe` … **Always `200`**" — `API_CONTRACT.md:219` | `reply.code(400)` la semnătură invalidă (`webhooks.ts:459`); `reply.code(500)` la eșec de prelucrare (`webhooks.ts:472`) |
| 3 | — | **24 de rute implementate, nedocumentate** (lista completă în §3.7) |

Divergența 1 e cea mai costisitoare pentru un integrator: ruta documentată **nu există**, deci un apel bine format primește 404. Divergența 2 e periculoasă pentru un client care tratează orice 2xx drept succes și orice alt cod drept eșec: contractul spune că va vedea întotdeauna 200, deci nu va scrie o ramură de eroare — și când Stripe va eșua, clientul va considera livrat.

**Impact concret.** Un integrator care scrie contra contractului va (a) obține 404 pe importul de server și (b) nu va trata corect un 500 de la webhook. În plus, cele 24 de rute nedocumentate includ **trei rute interne** (`/internal/prune-sessions`, `/internal/whoami`, `/internal/not-a-real-route`) și **trei rute de administrare a webhook-ului** (`/webhooks/stripe/failed`, `/webhooks/stripe/replay`, `/webhooks/stripe/test`) — deci suprafața internă nu e vizibilă în contract, ceea ce face ca un cititor să nu poată judeca expansiunea API-ului.

**Dovezi.**

```
$ # extragere din cod: 142 rute
$ # extragere din contract: 123 rute
$ # în contract, în cod:   POST /api/admin/instances/:id/import  (API_CONTRACT.md:215)
$ grep -n "admin/instances" api/src/routes/admin.ts
864:  app.post('/admin/instances/import', { preHandler: requirePermission('services.write') }, async (request: FastifyRequest, reply) => {

api/src/routes/webhooks.ts:459   return reply.code(400).send({ received: false, reason: parsed.error });
api/src/routes/webhooks.ts:472   return reply.code(500).send({ received: false, reason: 'The event could not be processed and will be retried.' });
```

**Remediere (efort: mic).**

1. Corectează `API_CONTRACT.md:215` la `POST /api/admin/instances/import`.
2. Corectează `API_CONTRACT.md:219`: „Always `200`" → „`200` la acceptare; `400` la semnătură invalidă; `500` la eșec de prelucrare (evenimentul rămâne în ledger și va fi reluat)".
3. Adaugă cele 24 de rute la contract — și marchează-le explicit ca **interne** (autentificate cu `X-Internal-Token`), ca suprafața să fie vizibilă.
4. Adaugă un test care compară automat rutele din cod cu cele din contract (extracție pe regex, ca în acest raport), ca divergența să nu se mai refacă.

---

**Criterii de acceptanță:** (a) `docs/API_CONTRACT.md` nu mai conține nicio rută care să nu existe în cod — un test automat compară rutele din cod cu cele din contract și eșuează la orice divergență; (b) contractul descrie corect codurile de răspuns ale webhook-ului (`200` / `400` / `500`); (c) toate cele 24 de rute implementate și nedocumentate apar în contract, marcate ca interne acolo unde e cazul.

### BE-12 — Cele 240 de teste dovedesc unitățile, nu cusăturile

**Severitate:** Medium · **Clasă:** `DOCUMENTED-ONLY` (pentru rezultatul suitei) + `CODE-INSPECTED` (pentru ce e acoperit și ce nu) · **Componentă:** `api/tests/*`, `web/tests/*`.

**Descriere.** Rezultatul suitei, din `07-quality-assurance.md` §3, rândul `T1`:

```
Test Files 22 passed (22)
Tests 219 passed (219)
Duration 83.09s
# web:  # tests 21  /  # pass 21  /  # fail 0
```

**240 de teste, toți verzi** — și totuși backend-ul are patru constatări High. Nu e o contradicție: **nu se suprapun**.

Ce dovedesc testele: API-ul real, împotriva unei **baze de date Postgres reale de test** (`blipmade_test`; `scripts/run-tests.sh` refuză orice bază al cărei nume nu se termină în `_test`), cu panoul și Stripe **mock-uite**. Sunt bune: `api/tests/webhooks.test.ts` (13 cazuri) și `api/tests/provisioning.test.ts` (6 cazuri).

Ce **nu** dovedesc:

| Domeniu | Stare | Evidență |
|---|---|---|
| Panoul Pterodactyl real | **Neacoperit** | `vi.mock('../src/services/pterodactyl/application.js')` în 8 fișiere de test |
| Stripe live | **Neacoperit** | modulul `stripe` e mock-uit (`stripe-origin.test.ts`); în producție `env.paymentsEnabled` e fals (`env.ts:136`) ⇒ checkout-ul răspunde `503 payments_unavailable` |
| **Coada și workerul** | **Neacoperit** | `grep -rln 'queue\|worker' api/tests/` → doar `email-templates.test.ts` și `tickets.test.ts`, și acolo în **payload-uri de e-mail**, nu în BullMQ. **Niciun test nu rulează `api/src/worker.ts`** |
| Backup / restore | **Neacoperit** | rutele `/api/instances/:id/backups*` nu apar în niciun fișier de test |
| Nodul real | **Neacoperit** | `waitForServerInstalled` e mock-uit să întoarcă mereu `true` (`provisioning.test.ts:98`) |
| **Concurrența** | **Neacoperit** | livrările duplicate din `webhooks.test.ts:245-246` sunt secvențiale (`await` × 2) |
| A treia tentativă de provisionare | **Neacoperit** | `provisioning.test.ts:278` exercitează exact **două** rulări |

**Impact concret.** Fiecare dintre cele patru constatări High se află **în afara** ariei acoperite de suita:

- **BE-01** (calea banului fără tranzacție) — testele verifică *idempotența* fiecărui pas separat, nu *atomicitatea* lanțului. Niciun test nu injectează o eroare în mijloc.
- **BE-02** (marcajul de reluare) — testul existent are exact două rulări; o treia ar fi văzut defectul, iar mock-ul l-ar masca oricum.
- **BE-03** (cursa pe ledger) — testul trimite livrările una după alta.
- **BE-04** (provisionarea fără tranzacție) — panoul e mock-uit, deci fereastra dintre `createServer` și scrierea în DB nu poate fi exercitată.

În plus, **rularea suitei API nu e posibilă în mirror**: `api/tests/globalSetup.ts:5` cere `TEST_DATABASE_URL` sau `DATABASE_URL`, iar rularea locală se oprește cu `Error: TEST_DATABASE_URL or DATABASE_URL must be set to run the tests.` Nu e un defect al produsului — e o limitare a mediului, dar înseamnă că **singura cale de reproducere a suitei e pe VM 103**, ceea ce face testarea o operațiune mai grea decât ar trebui.

**Dovezi.**

```
$ cd api && npx vitest run --reporter=basic
Error: TEST_DATABASE_URL or DATABASE_URL must be set to run the tests.
 ❯ Object.globalSetup [as setup] tests/globalSetup.ts:5:27

$ grep -rln 'queue\|worker' api/tests/
api/tests/email-templates.test.ts
api/tests/tickets.test.ts

$ grep -rn 'vi.mock(' api/tests/ | sed 's/:.*vi.mock(/ -> /'
api/tests/provisioning.test.ts -> '../src/services/pterodactyl/application.js'
api/tests/stripe-origin.test.ts -> 'stripe'
api/tests/instance-operations.test.ts -> '../src/services/panel/credentials.js'
api/tests/domains.test.ts -> '../src/services/dns.js'
… (8 fișiere cu panoul mock-uit)
```

**Remediere (efort: mijloc; e o prioritate, fiindcă e singura care ar fi prins cele patru constatări High).**

1. **Teste de concurență pentru ledger**: `Promise.all` pe două livrări ale aceluiași eveniment → `Promotion.usedCount` crește cu 1; o singură instanță; o singură linie de ledger.
2. **Test de atomicitate**: injectează o eroare la fiecare pas al `markOrderPaid` și verifică că nu rămâne o comandă `PAID` fără `Subscription`.
3. **Test cu trei rulări de provisionare** (vezi BE-02).
4. **Teste pentru worker**: rulează `pruneQueue()`, `reconcile()` și `retryFailedWebhookEvents()` cu Redis real (testul) și verifică comportamentul — inclusiv că joburile eșuate **supraviețuiesc** curățării.
5. **Un test de contract** care compară automat rutele din cod cu cele din `docs/API_CONTRACT.md`.
6. **Un test de backup/restore** cel puțin pe nivelul de rută (cu panoul mock-uit).

---

**Criterii de acceptanță:** (a) există un test care trimite două livrări **concurente** ale aceluiași eveniment webhook și verifică `Promotion.usedCount` +1, o singură instanță și o singură linie de ledger cu `attempts = 1`; (b) există un test de atomicitate care injectează o eroare la fiecare pas al `markOrderPaid` și verifică că nu rămâne o comandă `PAID` fără `Subscription`; (c) există un test cu **trei** rulări consecutive de provisionare, care verifică că `reinstallServer` e apelat o singură dată; (d) există un test de worker care rulează `pruneQueue()` și verifică că joburile eșuate supraviețuiesc curățării; (e) suita API poate fi rulată din mirror, printr-o singură comandă documentată.

### BE-13 — Ștergerea unui utilizator cascadează peste istoricul său financiar

**Severitate:** Medium · **Clasă:** `VERIFIED` · **Componentă:** `api/prisma/schema.prisma`.

**Descriere.** Modelul `User` (`schema.prisma:23+`) prevede `deletionRequestedAt` — o **ștergere logică**, cerută de `POST /api/settings/account/closure`, care, după `docs/API_CONTRACT.md:39`, „*The request is recorded; nothing is deleted.*" Schema, însă, e **permissivă**: cheile străine către `User` sunt `ON DELETE CASCADE`.

```text
$ SELECT tc.table_name, kcu.column_name, ccu.table_name, rc.delete_rule
  FROM information_schema.table_constraints tc … WHERE rc.delete_rule = 'CASCADE' …;

 child          |       col       |     parent     | delete_rule
---------------+-----------------+----------------+-------------
 Invoice        | userId          | User           | CASCADE
 Payment        | userId          | User           | CASCADE
 Order          | userId          | User           | CASCADE
 Subscription   | userId          | User           | CASCADE
 OrderItem      | orderId         | Order          | CASCADE
 PromotionRedemption | orderId   | Order          | CASCADE
 Instance       | userId          | User           | CASCADE
 Session        | userId          | User           | CASCADE
 PanelCredential | userId          | User           | CASCADE
 …  (26 de reguli CASCADE în total)
```

**Impact concret.**

1. **Un `DELETE` pe `User` distruge facturile, plățile, comenzile și abonamentele** — adică documentele contabile ale clientului. Pentru o platformă care emite facturi, asta e o problemă de conformitate, nu doar de date.
2. **Cele două mecanisme se contrazic**: produsul *vrea* ștergere logică (`deletionRequestedAt`, `DELETE /api/settings/account/closure` → `requestedAt: null`), schema *permite* ștergere fizică. Cineva care șterge un cont din consola de administrare sau dintr-un script de curățare distruge istoricul financiar **fără niciun avertisment** — Postgres nu cere confirmare.
3. **În cascadă se duc și datele de operare**: `Instance` (CASCADE) → `InstanceEvent`, `InstanceDomain`, `ProvisioningJob` (CASCADE) — deci și istoricul tehnic al serviciului.

**Dovezi.** Interogarea de mai sus, rulată read-only pe baza de producție: **26 de rânduri**, toate cu `delete_rule = 'CASCADE'`. Lista completă cuprinde `Attachment`, `EmailChangeRequest`, `Instance`, `InstanceDomain`, `InstanceEvent`, `Invoice`, `NotificationPreference`, `Order`, `OrderItem`, `PanelCredential`, `Payment`, `ProductOption`, `ProductPrice`, `PromotionRedemption` (×2), `ProvisioningJob`, `Session`, `StaffMember`, `Subscription`, `Ticket`, `TicketEvent`, `TicketMessage` (×2), `VerificationToken`.

**Remediere (efort: mijloc — implică o migrare).**

1. **Schimbă regulile pentru tabelele financiare** în `ON DELETE RESTRICT` (sau `NO ACTION`): `Invoice`, `Payment`, `Subscription`, `Order`. Astfel, ștergerea unui utilizator cu istoric financiar e **refuzată** de baza de date.
2. **Decide explicit politica**: ori ștergere logică (recomandat, și deja prevăzută de `deletionRequestedAt`), ori o procedură de anonimizare — care să **anonimizeze** datele cu caracter personal, dar să **păstreze** documentele financiare.
3. **Restrânge `Instance` la `RESTRICT`** și înlocuiește ștergerea în cascadă cu o procedură explicită de dezmembrare (retractare abonament → oprire server → ștergere controlată).

**Criterii de acceptanță:** `DELETE FROM "User" WHERE id = …` pentru un utilizator cu facturi e refuzat de Postgres, cu un mesaj care indică ce îl blochează.

---

### BE-14 — Numerotarea comenzilor și a facturilor e `count()+1`, nu o secvență

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/orders.ts`, `api/src/services/upgrades.ts`, `api/src/services/stripe.ts`, `api/src/services/billing.ts`.

**Descriere.** Patru locuri generează numere de document prin **numărare**:

```text
api/src/routes/orders.ts:58-61          async function nextOrderNumber(): Promise<string> {
                                          const count = await prisma.order.count();
                                          return `BM-${String(count + 1).padStart(5, '0')}`;

api/src/services/upgrades.ts:72-75      const count = await prisma.order.count();
                                          … number: `BM-${String(count + 1).padStart(5, '0')}`,

api/src/services/stripe.ts:440-443       const count = await prisma.invoice.count();
                                          … number: `BM-INV-${String(count + 1).padStart(5, '0')}`,

api/src/services/billing.ts:118-121      const count = await prisma.invoice.count();
                                          … number: `BM-INV-${String(count + 1).padStart(5, '0')}`,
```

`count()` apoi `create()` **nu e atomic**. Două creări concurente calculează același număr, iar `Order.number` / `Invoice.number` sunt `@unique` ⇒ a doua scriere e respinsă de baza de date. Pentru **facturi**, cazul e deja documentat în `05-commerce-and-billing.md` §3.9 („Recuperabil, dar zgomotos"). Pentru **comenzi**, cazul e mai ascuțit, pentru că `nextOrderNumber()` e folosit la crearea unei comenzi de către un **client**, iar `upgrades.ts:72` e un **al doilea** generator independent de același spațiu de numere.

**Impact concret.**

1. **O comandă pierdută.** Un client care apasă „comandă" de două ori simultan (sau un retry după un timeout) poate primi o eroare de unicitate **în locul unei comenzi create**. E un eșec la momentul cel mai prost: clientul vede un mesaj tehnic, nu o comandă.
2. **Numerele se pot suprapune între comenzi și upgrade-uri**, fiindcă sunt doi generatori care numără aceeași tabelă. De exemplu: `orders.ts` creează `BM-00042` (comanda 42 există), `upgrades.ts` numără tot 42 și creează `BM-00042` pentru un upgrade ⇒ violare de unicitate. Niciunul dintre cele două nu știe de celălalt.
3. **Numerotarea facturilor e și mai fragilă**, pentru că `billing.ts:118` și `stripe.ts:440` numără **aceeași** tabelă din două module diferite — și `billing.ts` rulează în worker, iar `stripe.ts` în calea de webhook.

**Dovezi.**

```
api/src/routes/orders.ts:58-61
api/src/services/upgrades.ts:72-75
api/src/services/stripe.ts:440-443
api/src/services/billing.ts:118-121
```

```
$ # numerotarea e o coloană stocată, cu unicitate impusă
api/prisma/schema.prisma  →  model Order { … number String @unique … }
api/prisma/schema.prisma  →  model Invoice { … number String @unique … }
```

**Remediere (efort: mic).**

1. **Folosește o secvență Postgres**, nu `count()`: `CREATE SEQUENCE order_number_seq;` și numerotarea prin `nextval('order_number_seq')` în aceeași inserare. Numerele devin consecutive, fără găuri și fără coliziuni.
2. **Sau** folosește un UUID derivat (ex. `BM-<unix_ts>-<random>`), dacă numerotarea consecutivă nu e o cerință de business.
3. **Centralizează generatorul**: o singură funcție `nextDocumentNumber(kind)` folosită de toate cele patru locuri, ca ordine și facturi să nu se suprapună.
4. Dacă numerotarea consecutivă e cerută pentru facturi (de exemplu, pentru un registru fiscal), ia-o în calcul **la început**, nu ca completare.

---

**Criterii de acceptanță:** (a) două creări concurente de comenzi primesc numere **distincte**, fără violare de unicitate; (b) numerele comenzilor și ale facturilor provin dintr-o singură funcție și dintr-o singură secvență; (c) niciun număr de document nu mai e generat prin `count() + 1` (verificabil prin `grep -rn 'count()' api/src/`).

### BE-15 — `WebhookEvent.status` e text liber, fără enum și fără `updatedAt`

**Severitate:** Low · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/prisma/schema.prisma`.

**Descriere.** Ledgerul webhook e singurul loc unde starea unei mașini de stări trăiește **doar ca `String`**:

```text
api/prisma/schema.prisma:785+
model WebhookEvent {
  id         String   @id @default(cuid())
  provider   String
  eventId    String
  type       String
  payload    Json?
  status     String   @default("received")      // ← fără enum, fără CHECK
  attempts   Int      @default(0)
  lastAttemptAt DateTime?
  processedAt DateTime?
  error      String?
  createdAt  DateTime @default(now())
  @@unique([provider, eventId])
  …
}
```

Restul schemei folosește `enum` pentru fiecare stare (`OrderStatus`, `FulfillmentStatus`, `InstanceStatus`, `SubscriptionStatus`, `InvoiceStatus`, `PaymentStatus`, `PromotionType`, `DomainStatus`, `TicketStatus`, …) — **16 enum-uri în total**. Ledgerul e singura excepție, și tocmai ledgerul e locul unde starea e folosită pentru decizii (`claimEvent` compară cu `'processed'`, `'failed'`, `'received'`).

În plus, modelul **nu are `updatedAt`** ⇒ ledgerul nu poate arăta când a fost modificată ultima dată o linie. Singurul indicator e `lastAttemptAt`, care e `null` la prima preluare (l287: `data: { status: 'processing', attempts: { increment: 1 }, lastAttemptAt: new Date(), error: null }` — dar la creare, `lastAttemptAt` nu e setat).

**Impact concret.** O eroare de scriere (un `status` greșit) nu e respinsă de baza de date; ledgerul arată un eveniment într-o stare pe care codul nu o recunoaște, iar `claimEvent` l-ar considera „nu abandonat" (`:85`) şi l-ar **ignora** — evenimentul s-ar pierde fără niciun jurnal. E o clasă de defecte rară, dar tocmai de aceea merită închisă de schema, nu de atenția cuiva.

**O observație istorică, pentru corectitudine.** În baza live, toate cele 8 rânduri din `WebhookEvent` au `status = 'received'` **și** `processedAt` setat — două câmpuri care ar trebui să fie coherente. Am verificat istoricul Git și explicația e **istorică, nu actuală**: versiunea anterioară a codului scria doar `processedAt` fără `status`:

```
$ git log -p --follow -- api/src/routes/webhooks.ts | grep -nE '^\+.*(processedAt|status: .processed.)'
303:+    data: { status: 'processed', processedAt: new Date(), error: null },      ← codul curent: ambele
1101:+      await prisma.webhookEvent.update({ …, data: { processedAt: new Date() } });   ← codul vechi: doar processedAt
1154:+        data: { processedAt: new Date() },                                  ← codul vechi: doar processedAt
```

Rândurile au fost scrise pe **2026-10-22 între 20:03 și 20:17** de `scripts/verify-provisioning.py`, deci de codul vechi. **Codul curent e corect.** Singura rămășiță e că stările rămân neconstrainse de schemă — deci o stare nouă, introdusă greșit, n-ar fi observată.

**Dovezi.**

```
$ grep -c '^enum ' api/prisma/schema.prisma
16
api/prisma/schema.prisma:785+   model WebhookEvent { … status String @default("received") … }
```

**Remediere (efort: mic).**

1. Înlocuiește `status String` cu `enum WebhookEventStatus { received, processing, processed, failed, deferred }`.
2. Adaugă `updatedAt DateTime @updatedAt`.
3. Adaugă un `@@index([status, lastAttemptAt])` pentru căutarea joburilor rămase.

---

**Criterii de acceptanță:** (a) o stare neprevăzută în `WebhookEvent.status` e respinsă de baza de date (enum, nu `String`); (b) ledgerul expune `updatedAt`, iar interogarea „ce s-a procesat în ultimele 24 de ore" e posibilă fără comparație între `lastAttemptAt` și `createdAt`.

## 6. Limitele acestui audit

1. **Suita de teste nu a fost rulată** în cadrul acestui audit: `api/tests/globalSetup.ts:5` cere o bază de date de test, iar rularea în mirror se oprește cu `Error: TEST_DATABASE_URL or DATABASE_URL must be set to run the tests.` Rezultatul „240 de teste verzi" e **citit** din `07-quality-assurance.md` §3, rândul `T1`, nu reprodus aici. Clasa e `DOCUMENTED-ONLY` pentru rezultat, `CODE-INSPECTED` pentru acoperire.
2. **Nu s-a rulat niciun flux de plată real.** `STRIPE_SECRET_KEY` e gol, `env.paymentsEnabled` e fals (`env.ts:136`), deci `POST /api/orders/:id/checkout` răspunde `503 payments_unavailable`. Toate constatările despre calea banului sunt `CODE-INSPECTED` pe sursă, nu `VERIFIED` prin execuție. Clasa reală a plăților (High) e raportată în `05-commerce-and-billing.md` §2.4, cu aceleași dovezi de sursă.
3. **Nu s-a exercitat niciun panou real.** Toate constatările despre Pterodactyl sunt `CODE-INSPECTED`; `04-pterodactyl-and-provisioning.md` are dovezile `VERIFIED` pentru starea panoului.
4. **Nu s-a măsurat comportamentul sub încărcare.** Nu există în corpus măsurători de latență, de debit sau de comportament al cozii la volum reale. Constatările despre coadă sunt despre **corectitudine**, nu despre **scalare**.
5. **Constatările BE-01…BE-04 High nu au fost reproduse ca incidente.** Nu au existat, în istoricul disponibil, comenzi plătite reale (0 `Payment`, 0 `Invoice`, 0 `Subscription`), deci blast radius-ul lor e **astăzi zero**. Ele rămân constatări de **clasa de defect**, nu de incident produs — și devin incidente la prima plată reală cu o promoție (P1/P2), care e chiar primul lucru pe care-l face un operator la lansare.
6. **Granita de ownership.** Problemele de securitate sunt în `02-security-audit.md`; ciclul comercial și integrarea Stripe sunt în `05-commerce-and-billing.md`; topologia și panoul sunt în `00-architecture.md` și `04-pterodactyl-and-provisioning.md`; starea curentă a funcțiilor e în `00-current-state.md`; matricea de test e în `07-quality-assurance.md`. Aici e strict proprietatea de sistem a backendului.
7. **O afirmație din `04-pterodactyl-and-provisioning.md` e corectată de BE-02**: rândul „Retry-ul **nu reîncepe de la zero**: continuă după `provisionStep`" (§4.5) e valabil pentru prima reluare și inexact pentru următoarele.

---

## 7. Bibliografie

**Cod citat integral:**
`api/prisma/schema.prisma` (849 linii) · `api/src/app.ts` (157) · `api/src/worker.ts` (186) · `api/src/env.ts` · `api/src/db.ts` · `api/src/routes/` — `webhooks.ts` (620), `orders.ts` (179), `admin.ts`, `auth.ts`, `catalog.ts`, `billing.ts`, `instances.ts`, `instance-server.ts`, `domains.ts`, `tickets.ts`, `settings.ts`, `health.ts` · `api/src/services/` — `queue.ts` (339), `provisioning.ts` (712), `stripe.ts` (543), `billing.ts` (297), `pricing.ts` (331), `upgrades.ts` (224) · `api/src/plugins/` · `docs/API_CONTRACT.md` (224) · `api/tests/` (22 de fișiere) · `web/tests/` (3 fișiere) · `scripts/verify-provisioning.py`.

**Fișiere din corpusul de audit:** `00-BRIEFING.md` · `00-architecture.md` · `00-current-state.md` · `02-security-audit.md` · `04-pterodactyl-and-provisioning.md` · `05-commerce-and-billing.md` · `07-quality-assurance.md` · `12b-INDEPENDENT-AUDIT.md` (§3.2, §3.3, §3.4, §3.8, §7.6, §8.1–§8.5).

**Baza de date de producție** (read-only, doar `SELECT`): `blipmade` pe `10.77.0.13`, prin `docker compose exec -T postgres psql -U blipmade -d blipmade`. Interogări folosite: `information_schema.tables`, `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage` + `referential_constraints`, `information_schema.check_constraints`, și `SELECT count(*)` / `GROUP BY status` pe `Order`, `OrderItem`, `Invoice`, `Payment`, `Subscription`, `Instance`, `ProvisioningJob`, `WebhookEvent`, `InstanceEvent`.

**Comenzi de verificare folosite în acest raport** (toate locale, cu exceptia celor marcate):

```
grep -c '^model ' api/prisma/schema.prisma                    # 31
grep -c '^enum ' api/prisma/schema.prisma                     # 16
ls api/prisma/migrations/                                     # 10 migrări
grep -rn '\$transaction' api/src/ --include=*.ts              # 8 apeluri
grep -rn "admin/instances" api/src/routes/admin.ts             # linia 864
grep -rln 'queue\|worker' api/tests/                          # fără teste de coadă
grep -rn 'vi.mock(' api/tests/                                # panoul și Stripe mock-uite
git log -p --follow -- api/src/routes/webhooks.ts              # istoricul stării 'processed'
diff -rq /root/blipmade-work/api/src <deployed>/api/src       # mirror == producție
```

**Simulare:** `/tmp/sim-provision.py` — reproduce semanticile lui `completeStep()` / `isDone()` din `provisioning.ts:85-102` și ordinea pașilor din `:435-611`, ca să se vadă ce ramură e luată la fiecare tentativă. Script e aruncat, nu face parte din corpus.
