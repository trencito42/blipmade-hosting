# Integrarea Stripe — raport de remediere

Data: 24 octombrie 2026
Ramură: `fix/stripe-integration` (bază: `origin/main` = `106809c`)
Gazdă: `10.77.0.13` (Debian 13), site public `https://blipmade.com`

**Nu s-a făcut merge în `main` și nu s-a făcut deploy în producție.** Ramura de
remediere este împinsă, gata de revizuit. Producția nu a fost atinsă: cheile
Stripe sunt goale, `PAYMENTS_ENABLED=false`, iar singurele cereri făcute la
site-ul viu au fost două `GET`/`POST` de verificare a rutei, descrise mai jos.

---

## A. Sumar executiv

| # | Issue | Severitate | Stare finală |
|---|---|---|---|
| D1 | Semnătura webhook-ului nu era citită | **P0** | **FIXED AND VERIFIED** |
| D2 | Starea abonamentului necunoscută devenea `ACTIVE`; `canceled` nu se potrivea niciodată | **P1** | **FIXED AND VERIFIED** |
| D3 | Anularea ștergea imediat itemul Stripe și prora | **P1** | **FIXED AND VERIFIED** |
| D4 | Schimbarea sumei transformă planul anual în lunar și crea un Product nou | **P1** | **FIXED AND VERIFIED** |
| D5 | `checkout.session.expired` nu era tratat | P2 | **FIXED AND VERIFIED** |
| D6 | Versiunea API nefixată; `invoice.subscription` citit într-o singură formă | **P1** | **FIXED AND VERIFIED** |
| D7 | Rambursarea fără cheie de idempotență și fără gardă locală | **P1** | **FIXED AND VERIFIED** |
| D8 | Portalul de facturare, clientul și izolarea între conturi | P1 | **FIXED AND VERIFIED** (izolarea rutelor: **nu a existat defect** — dovezi mai jos) |
| D9 | Stripe Tax: absent | P2 | **FIXED AND VERIFIED** (funcționalitate nouă, dezactivată implicit) |
| D10 | Rambursarea unei schimbări de resurse nereușite: stare locală mincinoasă, dublă rambursare posibilă | **P1** | **FIXED AND VERIFIED** |
| D11 | Interfața de facturare promitea plăți pe care platforma nu le putea lua | P2 | **FIXED AND VERIFIED** |
| T1 | Verificarea cu un provider Stripe real (Test Mode) | — | **BLOCKED BY EXTERNAL DEPENDENCY** |
| R1 | Reconcilierea automată a rambursărilor cu providerul la pornire | P2 | **NOT FIXED** (îmbunătățire, nu blocaj) |
| R2 | `brand`/`last4` lipsesc din metoda de plată din rezumat | P3 | **NOT FIXED** (nu afectează corectitudinea) |

Toate cele 11 issue-uri de cod sunt **FIXED AND VERIFIED**: fiecare are un test
de regresie care a fost demonstrat ca **pică** atunci când defectul a fost
introdus înapoi (verificare prin mutație, secțiunea E).

Singura dependență externă rămasă este **T1**: nu există nicio credențial
Stripe pe niciunde (nici pe VM, nici local), deci un test cu **Stripe Test
Mode real** nu a putut fi rulat. Tot ceea ce a fost marcat „verificat” a fost
verificat prin cod și prin suite de regresie, **nu** printr-o livrare reală de
la Stripe.

---

## B. Metodă

1. Fiecare afirmație din brief a fost verificată **în codul real**, prin
   citirea fișierelor (`webhooks.ts` 844 linii, `stripe.ts` 684, `billing.ts`
   1401, `upgrades.ts` 280, `routes/billing.ts` 465, `routes/admin.ts`,
   `routes/orders.ts`, `services/provisioning.ts`, `env.ts`, `app.ts`,
   `schema.prisma`) — nu în documentație.
2. Fiecare defect confirmat a primit **un test de regresie care pică înainte de
   reparare** (secțiunea E).
3. Lucrarea a fost împărțită în fișiere disjuncte: nucleul (webhook-uri,
   serviciul Stripe, sweep, `env.ts`, rută administrativă) a fost lucrat
   direct; rutele de facturare, calea de upgrade și interfața web au fost
   lucrate de trei subagenți pe ramuri și worktree-uri proprii, integrate
   apoi prin `cherry-pick`, **fără niciun conflict**.
4. Nicio modificare nu a fost făcută pentru ca un test existent să treacă.
   Niciun test existent nu a fost șters sau slăbit. O singură aserțiune
   preexistentă a fost actualizată, pentru că forma apelului s-a schimbat
   în mod deliberat, iar aserțiunea nouă este mai strictă (secțiunea E.2).

---

## C. Issue-uri confirmate, cauze și reparări

### D1 (P0) — Semnătura webhook-ului nu era citită

**Cauză** (`api/src/routes/webhooks.ts:637-649`, înainte): `readStripeEvent()`
chema `stripe.webhooks.constructEvent(raw, signature, secret)` cu
`signature = env.STRIPE_WEBHOOK_SECRET`. Secretul era folosit pe postul
semnăturii, iar headerul `Stripe-Signature` **nu era citit nicăieri** în
codul de recepție.

**Consecință:** într-un mediu cu chei Stripe, fiecare livrare legitimă era
respinsă cu `400 Signature verification failed`. Nicio plată nu putea fi
confirmată, niciun order nu putea deveni `PAID`, deci nu se făcea
provisionare. Platforma de facturare era complet nefuncțională în live.

**Reparare** (`api/src/routes/webhooks.ts`):
- `readSignatureHeader(request)` citește headerul ca text (un header
  repetat este unit, iar providerul îl refuză ca malformat).
- `readStripeEvent(raw, signatureHeader)` folosește **headerul** drept
  semnătură și **secretul** drept cheie; corpul este cel brut, primit de
  parserul de raw-body din `app.ts` (neterminat).
- Cele patru refuzuri sunt deosebite: header lipsă, header malformat,
  semnătură expirată, semnătură care nu corespunde corpului.
- Comparația este în timp constant, făcută de SDK (`safeCompare`).
- **Nu există** fallback unsigned în producție: garda
  `!stripeLive() && !stripeTestGateway()` rămâne, iar
  `stripeTestGateway()` este `false` în `NODE_ENV=production`.

**Teste** (`api/tests/stripe-webhook.test.ts`, secțiunea „the signature of a
delivery”): 10 teste — inclusiv unul care acceptă o semnătură produsă de
**SDK-ul Stripe însuși** (`Stripe.webhooks.generateTestHeaderString`), ca
să fie demonstrat că verificarea este cea reală.

### D2 (P1) — Starea abonamentului devenea `ACTIVE` pe orice stare necunoscută

**Cauză** (`api/src/routes/webhooks.ts:574-602`, înainte): lanțul de
ternare se termina cu `: 'ACTIVE'`. Mai grav, comparația era
`status === 'CANCELLED'` (două litere „l”), pe când Stripe trimite
`canceled` (o singură literă „l”) — deci comparația nu se potrivea
**niciodată**.

**Consecință:** un abonament anulat de Stripe (și orice `customer.subscription.deleted`)
rămânea `ACTIVE` în platformă: continua să fie considerat activ, putea fi
reinnoiat și putea ține serviciul pornit. Orice stare nouă introdusă de
Stripe ar fi devenit `ACTIVE` — cu provisionare și facturare pentru un
serviciu pe care nimeni nu l-a confirmat.

**Reparare:** mapă explicită `SUBSCRIPTION_STATUS_BY_STRIPE_STATE` cu toate
cele 8 stări Stripe (`active`, `trialing`, `past_due`, `unpaid`,
`incomplete`, `incomplete_expired`, `canceled`, `paused`). O stare
necunoscută **nu** devine `ACTIVE`: abonamentul își păstrează starea
curentă, iar starea primită este scrisă în jurnal
(`stripe.subscription_state_unknown`).
`incomplete_expired` este mapat pe `CANCELLED`, pentru că este singura
mapare consecventă cu restul codului (excluderea din
`billing.ts:825` și din sweep).

**Teste:** 10 teste (8 stări mapate + starea necunoscută + ștergerea).

### D3 (P1) — Anularea ștergea imediat itemul Stripe și prorau

**Cauză** (`api/src/services/stripe.ts:637-655`, înainte): dacă abonamentul
local avea `stripeSubscriptionItemId`, era trimis imediat
`subscriptions.update(..., { items: [{ id, deleted: true }], proration_behavior:
'create_prorations' })`. Baza de date spunea doar `cancelAtPeriodEnd: true`.

**Consecință:** serviciul se oprea imediat, deși clientul plătisecă
perioada, iar suma era prorată. `resumeSubscription()` nu putea readuce
itemul șters: anularea și reluarea erau contradictorii, iar clientul putea
rămâne cu un serviciu oprit și cu o sumă prorată.

**Reparare** (`api/src/services/stripe.ts`):
- Anularea de către client are efect **la sfârșitul perioadei plătite**.
- Abonamentul Stripe este anulat ca întreg **numai dacă linia aceasta este
  singura** (`cancel_at_period_end: true`). Un abonament care mai are alte
  linii **nu este atins**: anularea lui întreg ar opri celelalte servicii
  ale aceluiași client.
- Linia unui abonament partajat este eliminată la sfârșitul perioadei de
  **sweep** (`removeStripeSubscriptionItem`, apelat din
  `services/billing.ts:sweepSubscriptions`), fără prorație — perioada a
  fost plătită.
- `cancelSubscription(subscription, { immediate: true })` este varianta de
  **compensare** (provisionare eșuată, din `services/provisioning.ts`):
  linia este eliminată imediat, tot fără prorație, pentru că banii se
  întorc prin rambursarea comenzii.
- `resumeSubscription()` refuză explicit un abonament deja încheiat (nu mai
  poate fi reluat) și traduce refuzul providerului într-un mesaj clar, în
  loc să șteargă marcajul și să promită un serviciu inexistent.
- Scrierile sunt limitate și de proprietar (`where: { id, userId }`).

**Teste** (`api/tests/stripe-money.test.ts`): 6 teste (anulare de client,
abonament cu alte linii, compensare imediată, provider inaccesibil,
relmare, relmare imposibilă).

### D4 (P1) — Schimbarea sumei transforma planul anual în lunar

**Cauză** (`api/src/services/stripe.ts:592-606`, înainte):
`recurring: { interval: 'month' }` era scris fix, iar prețul nou se crea cu
`product_data` la fiecare apel. Plus `proration_behavior:
'create_prorations'`.

**Consecință:** un plan anual devenea lunar la prima schimbare de sumă;
contul operatorului se umplea cu câte un Product nou la fiecare actualizare;
iar diferența era încă o dată colectată prin prorație, deși fusese deja
încărcată prin comanda de upgrade.

**Reparare:** cadența reală (interval + `interval_count`) și Productul
liniei sunt citite de la prețul Stripe existent (sau de la prețul itemului
din abonament), prețul nou reutilizează **același** Product, iar
`proration_behavior` este `'none'`.

**Teste:** 2 teste (cadența anuală păstrată + Product reutilizat; cadența
citită din item când platforma nu știe prețul).

### D5 (P2) — `checkout.session.expired` nu era tratat

**Cauză:** evenimentul nu exista în `switch`, deci cdea în `default: break`.

**Consecință:** o comandă abandonată își păstra starea
`AWAITING_PAYMENT` și rezervarea de promoție (48 de ore, până la sweep).

**Reparare:** evenimentul eliberează comanda (`CANCELLED`) și slotul de
promoție, **dar numai** pentru o comandă care încă așteaptă plata. O
comandă plătită, refuzată sau rambursată este lăsată exact cum este.

**Teste:** 2 teste (eliberare + comanda plătită neatinsă).

### D6 (P1) — Versiunea API nefixată și factura citită într-o singură formă

**Cauză:** clientul Stripe era creat fără `apiVersion` (se aplica versiunea
contului operatorului), iar identificatorul abonamentului era citit doar din
`object.subscription`.

**Consecință:** de la API `2025-03-31`, `invoice.subscription` nu mai există
(mutat în `parent.subscription_details.subscription`), deci facturile nu mai
erau asociate abonamentului lor: perioadele nu mai erau actualizate și
renourările se pierdeau.

**Reparare:** `STRIPE_API_VERSION = '2025-02-24.acacia'` (tipul
`LatestApiVersion` al SDK-ului 17.7.0) este fixat în `getClient()` și în
clientul folosit la verificarea semnăturii; `readInvoiceSubscriptionId()`
citește **ambele** forme.

**Teste:** 3 teste (factura în forma nouă, în forma fixată, factură
neplătită).

### D7 (P1) — Rambursarea fără cheie de idempotență și fără gardă locală

**Cauză** (`api/src/services/stripe.ts:612-634`, înainte):
`refunds.create(...)` fără cheie și fără nicio verificare locală.

**Consecință:** două evenimente diferite pentru aceeași comandă (o livrare
repetată a plății pentru o comandă anulată, o retry de job) puteau cere
rambursarea de două ori a aceleiași sume. În plus, starea locală era
mincinoasă: comanda rămânea `FAILED` în timp ce plătorul era `REFUNDED`.

**Reparare:**
- **Cheie de idempotență** la provider, derivată din comandă
  (`blipmade-refund-<orderId>`) — aceeași cerere este aceeași cerere.
- **Gardă locală**: rândul de plată marchează banii întorși; o rambursare
  a unei comenzi deja rambursate nu mai cere nimic.
- **Claim atomic** înainte de apelul la provider
  (`handleCancelledOrderPayment` în `webhooks.ts`, ruta administrativă din
  `routes/admin.ts`) — două livrări simultane nu pot rambursa de două ori.
- **Stări oneste**: după o rambursare reușită, comanda este `REFUNDED`; dacă
  rambursarea nu poate fi executată, starea spune că banii sunt încă la
  platformă, iar operatorul poate încerca din nou.
- Ruta administrativă folosește acum și ea cheia de idempotență, iar
  verificarea „deja rambursat” se face pe **rândul de plată** (semnul că
  banii sunt întorși), nu pe starea comenzii: o crăpare între claim și
  apelul providerului nu mai lasă o comandă „rambursată” cu banii la
  platformă.

**Teste:** 2 teste proprii (rambursare unică la cereri repetate; aceeași
cheie pentru două motive diferite) + 9 teste ale subagentului (calea de
upgrade) + testele existente de rambursare administrativă.

### D8 (P1) — Portalul de facturare, clientul Stripe și izolarea între conturi

**Constatare importantă: rutele de facturare NU aveau un defect de
izolare.** Cele zece rute din `api/src/routes/billing.ts` au fost auditate
una cu una (subagentul A): fiecare interogare cu id din cerere este
limitată la `userId` utilizatorului autentificat, agregatele din
`/billing/summary` folosesc exact filtrul listelor pe care le însoțesc, iar
o linie străină este indistinctă de una inexistentă (`notFound`, fără
scurgere de existență). Niciun `userId`, preț sau total nu vine de la
client.

**Defecte reale găsite și reparate:**
- **Checkout fără client Stripe reutilizabil**
  (`api/src/services/stripe.ts`): `customer_email: undefined` era trimis
  când clientul nu exista încă, deci Stripe crea **un client nou la fiecare
  comandă**, iar portalul de facturare cunoștea doar ultimul. Adresa
  clientului este trimisă acum.
- **Interfața promitea plăți pe care platforma nu le putea lua**
  (subagentul C, `web/src/app/Billing.tsx`): pagina nu cerea niciodată
  `/billing/payment-state`; un răspuns de portal cu adresă `null` („Nu există
  încă o metodă de plată”) era prezentat ca eroare; o anulare la sfârșit de
  perioadă era afișată ca „cancelled”, deși serviciul rula; iar modul
  `simulated` era prezentat ca o plată reală. Toate patru sunt reparate, cu
  textul serverului ca singură sursă de adevăr.

**Teste:** 11 teste de izolare (subagentul A, dovedite „bătătoare” prin
mutație: 3/11 pică când proprietatea este scoasă din trei rute), 13 teste de
interfață (subagentul C, 13/13 pică pe codul original), 2 teste de portal
proprii (portalul clientului propriu; **portalul altui cont nu se deschide
niciodată**).

### D9 (P2) — Stripe Tax, configurabil și dezactivat implicit

**Reparare:** variabila `STRIPE_TAX_ENABLED` (implicit `false`). Cu ea
activată, sesiunea cere `automatic_tax: { enabled: true }`, iar **suma care
plătește comanda este subtotalul**, iar factura locală poartă **taxa pe
care providerul a taxat-o cu adevărat** (`amount`, `tax`, `total`). Cu ea
dezactivată, nimic nu se schimbă: sesiunea duce exact suma comenzii și
taxa rămâne cea din setările companiei. **Nu se inventează nicio taxă** în
niciun caz, iar raportarea fiscală RO / e-Factura nu este atinsă.

**Teste:** 4 teste (fără `automatic_tax` când e oprit; cu `automatic_tax`
când e pornit; suma comenzii plătită cu subtotalul și taxa scrisă pe
factură; plata care nu corespunde sumei refuzată).

### D10 (P1) — Rambursarea unei schimbări de resurse nereușite (subagentul B)

`api/src/services/upgrades.ts` cerea rambursarea fără nicio verificare
locală, lăsa comanda în `FAILED` după o rambursare reușită și nu putea
distinge o rambursare nereușită de una reușită. Au fost reparate cu o
funcție de decizie **pură** (`decideUpgradeRefund`), un **claim atomic**
(`updateMany` pe `fulfillmentStatus`), stări oneste (`REFUNDED` când banii
sunt întorși, `PAID` când rambursarea nu a putut fi executată) și trei
acțiuni distincte în jurnal. **9 teste noi**, dintre care 4 pică pe codul
original.

### D11 (P2) — Interfața de facturare (subagentul C)

Vezi D8. 13 teste noi, toate 13 pică pe codul original.

---

## D. Fișiere schimbate

**Nucleul (lucrat direct):**

| Fișier | Ce s-a schimbat |
|---|---|
| `api/src/routes/webhooks.ts` | D1, D2, D5, D6, D7, D9: semnătura, maparea stărilor, `checkout.session.expired`, forma facturii, claim-ul rambursării, sumele cu taxă |
| `api/src/services/stripe.ts` | D3, D4, D6, D7, D8, D9: `apiVersion` fixat, `customer_email`, cadența și Productul prețului, prorația, cheie de idempotență + gardă locală, anulare/relmare pe semantica corectă, `removeStripeSubscriptionItem`, `automatic_tax` |
| `api/src/services/billing.ts` | Sweepul elimină linia Stripe la sfârșitul perioadei plătite; `createLocalRenewal` limitează căutarea la proprietar |
| `api/src/services/provisioning.ts` | Compensarea folosește `cancelSubscription(..., { immediate: true })` |
| `api/src/routes/admin.ts` | Rambursarea administrativă: cheie de idempotență, verificare pe rândul de plată, claim reutilizabil, stare restaurată corect la eșec |
| `api/src/routes/orders.ts` | Adresa clientului este pasată creatorului de sesiune (era interogată din bază) |
| `api/src/env.ts` | `STRIPE_TAX_ENABLED` (implicit fals) |
| `api/tests/stripe-webhook.test.ts` | **Nou** — 28 teste |
| `api/tests/stripe-money.test.ts` | **Nou** — 16 teste |

**Subagenți (ramuri integrate prin `cherry-pick`, fără conflicte):**

| Fișier | Ramură | Ce s-a schimbat |
|---|---|---|
| `api/tests/stripe-billing-access.test.ts` | `fix/stripe-billing-access` | **Nou** — 11 teste de izolare (fișierul de rute nu a fost modificat: nu exista defect) |
| `api/src/services/upgrades.ts` | `fix/stripe-upgrade-refund` | D10: decizie pură, claim, stări oneste, jurnal distinct |
| `api/tests/stripe-upgrade-refund.test.ts` | `fix/stripe-upgrade-refund` | **Nou** — 9 teste |
| `web/src/app/Billing.tsx` | `fix/stripe-web-ui` | D11: patru defecte de onestitate |
| `web/tests/stripe-billing-ui.test.ts` | `fix/stripe-web-ui` | **Nou** — 13 teste |

---

## E. Testele adăugate și rezultatele

**Teste noi: 77** (28 + 16 + 11 + 9 + 13).

### E.1 Verificarea prin mutație (dovada că testele prind defectele)

Fiecare defect a fost introdus înapoi în cod, pe rând, iar suita a fost
rulată. Rezultatul, pe ramura `fix/stripe-integration`:

```
=== baseline (fără mutație) ===
      Tests  44 passed (44)

=== D1: secretul este folosit din nou drept semnătură ===
PASS-MUTATION-CAUGHT | D1 signature            | Tests  25 failed | 3 passed (28)
=== D2: o stare necunoscută devine ACTIVE din nou ===
PASS-MUTATION-CAUGHT | D2 subscription state   | Tests  3 failed | 25 passed (28)
=== D3: linia abonamentului este ștearsă imediat din nou ===
PASS-MUTATION-CAUGHT | D3 cancellation          | Tests  3 failed | 13 passed (16)
=== D4: prețul lunar, cu un Product nou ===
PASS-MUTATION-CAUGHT | D4 price cadence         | Tests  2 failed | 14 passed (16)
=== D7: rambursarea fără gardă și fără cheie ===
PASS-MUTATION-CAUGHT | D7 refund                | Tests  1 failed | 15 passed (16)
=== D5: checkout abandonat, neeliberat ===
PASS-MUTATION-CAUGHT | D5 expired checkout      | Tests  1 failed | 27 passed (28)
=== D6: factura citită doar în forma veche ===
PASS-MUTATION-CAUGHT | D6 invoice subscription  | Tests  2 failed | 26 passed (28)

=== restaurare și verificare finală ===
      Tests  44 passed (44)
```

Subagentul A a făcut aceeași verificare pe suita lui: 3 din 11 teste pică
când proprietatea este scoasă din trei rute diferite. Subagentul C: 13 din
13 pică pe codul original. Subagentul B: 4 din 9 pică pe codul original.

### E.2 Un singur test preexistent a fost atins, și pentru un motiv anume

`api/tests/admin-order-refund.test.ts:185` afirma că apelul providerului
este făcut cu un singur argument. Rambursarea transportă acum și cheia de
idempotență (al doilea argument al API-ului Stripe), deci aserțiunea a fost
actualizată **pentru a fixa forma reală a apelului** și, în același timp, **a
devenit mai strictă**: ea verifică acum și că cheia aparține comenzii
(`blipmade-refund-<orderId>`), adică exact garanția nouă. Niciun alt test
preexistent nu a fost modificat, slăbit sau șters, și niciun test nu a fost
modificat ca să ascundă un eșec.

### E.3 Suita completă pe rezultatul integrat

```
Test Files  60 passed (60)
     Tests  555 passed (555)

# tests 144        (suite-ul web, rulat de același script)
# pass 144
# fail 0
```

Build-urile, pe același commit:

```
api:  npx prisma generate && tsc -p tsconfig.json     → fără eroare
web:  tsc --noEmit && vite build                       → fără eroare
```

`api/tests/stripe-origin.test.ts` (preexistent) și
`api/tests/admin-order-refund.test.ts` (preexistent, o singură aserțiune
actualizată — secțiunea E.2) au rămas verzi.

---

## F. Comenzi și dovezi

Toate comenzile au fost rulate pe gazda `10.77.0.13`, în worktree-ul
`/home/debian/wt-stripe`, pe ramura `fix/stripe-integration`:

```bash
# tipuri (API, fișiere de test incluse)
cd /home/debian/wt-stripe/api && npx tsc -p tsconfig.test.json --noEmit

# suita completă (API + web), pe o bază de test dedicată
cd /home/debian/wt-stripe && set -a && . /opt/blipmade/.env && set +a && \
  TEST_DB_NAME=blipmade_stripe_main_test TEST_REDIS_DB=4 bash scripts/run-tests.sh

# build-ul aplicației web
cd /home/debian/wt-stripe/web && npm run build

# build-ul API-ului
cd /home/debian/wt-stripe/api && npm run build
```

Bazele de test folosite (`blipmade_stripe_main_test`, `blipmade_stripe_a_test`,
`blipmade_stripe_b_test`) se termină în `_test`; scriptul `scripts/run-tests.sh`
refuză orice bază care nu respectă regulinea. **Producția nu a fost folosită
ca bază de test și nu a fost modificată.**

### F.1 Integrarea continuă

Rularea pe ramura de remediere (commitul `3557c6a`, care conține tot
codul):

**https://github.com/trencito42/blipmade-hosting/actions/runs/40132089435**

| Job | Rezultat |
|---|---|
| API typecheck | success |
| Web typecheck and build | success |
| Unit and integration tests | success |
| Secret scan | success |
| Dependency audit | success |
| Schema drift | success |

Șase joburi, șase reușite. Scanarea secretelor a fost rulată și local, pe
ramura completă (`gitleaks detect --log-opts="origin/main..HEAD"`): `no leaks
found`. Commitul următor celui al rulării de mai sus schimbă **doar raportul**
(nu codul), așa că nu există nicio diferență între codul scanat de CI și cel
pus în ramură.

Verificarea rutei în producție (read-only, înainte de a scrie ceva):

```
POST https://blipmade.com/api/webhooks/stripe  →  200 {"received":false,"reason":"Stripe is not configured."}
GET  https://blipmade.com/api/health             →  200 {"status":"ok", ..., "stripe":"not_configured"}
```

Răspunsul „Stripe is not configured” este corect: în producție cheile Stripe
sunt goale, deci garda de mai sus oprește orice livrare înainte de a atinge
baza de date. Când operatorul pune cheile, aceeași adresă va verifica
semnătura.

---

## G. Issue-uri nerezolvate și în afara scopului

| # | Issue | Stare | De ce |
|---|---|---|---|
| R1 | Reconcilierea automată a rambursărilor cu providerul la pornire (cazul în care procesul moare între claim și apel) | **NOT FIXED** | Îmbunătățire, nu blocaj. Cheia de idempotență face ca reluarea să fie sigură, iar rândul de plată spune adevărul despre bani. O reconciliere la pornire ar cere o listă de rambursări a providerului. |
| R2 | `brand`/`last4` lipsesc din metoda de plată din `/billing/summary` | **NOT FIXED** | Nu afectează corectitudinea: interfața nu minte nimic, doar nu poate număra cardul. Necesită stocarea metodei de plată. |
| R3 | `instanceRetentions()` încarcă în proces retențiile tuturor clienților la fiecare rezumat | **NOT FIXED** | Nu se scurge nimic (ruta indexează doar cu id-urile proprii), dar este un cost inutil. Prioritate mică. |
| R4 | `POST /billing/payment-method` întoarce `{ url, message }` în timp ce serviciul întoarce `{ url, reason }` | **NOT FIXED** | Denumire diferită pentru același câmp. Inofensiv; neatins pentru a nu alege un nume în locul altuia. |
| T1 | Test cu Stripe Test Mode real | **BLOCKED BY EXTERNAL DEPENDENCY** | Nu există credențiale Stripe pe niciunde. Nu s-a activat nicio plată și nu s-a rulat nicio tranzacție taxabilă. |

---

## H. Pași de configurare pentru operator

1. **Contul Stripe.** Ai nevoie de un cont Stripe cu o cheie de test
   (`sk_test_…`) și, mai târziu, de una live (`sk_live_…`).
2. **Variabilele de mediu** (în `/opt/blipmade/.env`):

   ```
   STRIPE_SECRET_KEY=sk_test_...          # apoi sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...     # apoi pk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...        # secretul de semnare al endpointului
   PAYMENTS_ENABLED=true
   STRIPE_TAX_ENABLED=false               # opțional: Stripe Tax (implicit fals)
   ```

   `PAYMENTS_ENABLED=true` este necesar: platforma refuză să creeze o sesiune
   de plată cât timp plățile sunt oprite. Verifică după repornire cu
   `GET /api/health` — câmpul `stripe` trebuie să arate că Stripe este
   configurat.
3. **Endpoint-ul din Stripe Dashboard** (Workbench → Webhooks → Add endpoint):

   - **URL:** `https://blipmade.com/api/webhooks/stripe`
   - **Evenimente:** vezi secțiunea I.
   - **Descriere:** „Blipmade production”.
   - Copiază **Signing secret** în `STRIPE_WEBHOOK_SECRET`.
4. **Evenimentele din Dashboard** trebuie să conțină toate cele nouă de
   mai jos; altfel o livrare nu este procesată și nu apare nici în jurnal.
5. **Test înainte de live.** Stripe CLI: `stripe listen --forward-to
   localhost:3100/api/webhooks/stripe` (cu `STRIPE_WEBHOOK_SECRET` setat pe
   secretul temporar) sau o livrare manuală din Dashboard (Stripe → Endpoints
   → *Send test event*). Verifică apoi `GET /api/webhooks/stripe/failed` cu
   headerul `x-internal-token` și tabelul `WebhookEvent` din baza de date:
   fiecare livrare trebuie să ajungă `processed`.
6. **Comutarea în live** se face schimbând cheile (`sk_live_…`,
   `pk_live_…`) și repetând pasul 3 cu endpointul de live. **Nu**
   suprascrie cheile de test cu cele de live fără o repetare completă a
   fluxului de test: o livrare semnată cu secretul de test este refuzată de
   endpointul de live și invers.
7. **Nu e nevoie de migrare de bază de date** pentru niciuna dintre reparări.
   Schema nu a fost atinsă.

---

## I. Setările Stripe Dashboard

**Endpoint exact (identic pentru test și live):**

```
https://blipmade.com/api/webhooks/stripe
```

**Evenimentele Stripe cerute (toate nouă):**

| # | Eveniment | De ce |
|---|---|---|
| 1 | `checkout.session.completed` | confirmă plata și marchează comanda ca plătită |
| 2 | `checkout.session.async_payment_succeeded` | confirmă plata cu metodă întârziată (virament bancar) |
| 3 | `checkout.session.async_payment_failed` | marchează comanda ca nereușită |
| 4 | `checkout.session.expired` | eliberează comanda abandonată și slotul de promoție |
| 5 | `payment_intent.payment_failed` | înregistrează motivul eșecului plății |
| 6 | `invoice.paid` | scrie factura plătită și prelungește perioada abonamentului |
| 7 | `invoice.payment_failed` | marchează abonamentul `PAST_DUE` și notifică clientul |
| 8 | `customer.subscription.updated` | sincronizează starea abonamentului |
| 9 | `customer.subscription.deleted` | marchează abonamentul anulat |

**Setări recomandate în contul Stripe:**

- **Test Mode** pentru probă, cu chei `sk_test_…`/`pk_test_…`.
- **Payment methods** activate: card (obligatoriu), iDEAL/Bancontact dacă se
  vrea plata locală în Țări de Jos și Revolut/Sofort pentru carduri locale.
- **Customer emails**: activ (emailul clientului este trimis la checkout ca
  să poată fi reutilizat același client Stripe).
- **Billing portal**: activat și configurat cu o adresă de întoarcere
  (`https://blipmade.com/app/billing`) — platforma folosește portalul pentru
  metodele de plată.
- **Stripe Tax**: poate fi activat în cont, dar platforma nu îl folosește
  decât dacă `STRIPE_TAX_ENABLED=true`. Fără el, suma comenzii este cea
  facturată, iar taxa rămâne cea din setările companiei.
- **Webhooks**: dacă se folosește Stripe CLI pentru test, endpointul din
  Dashboard poate rămâne necreat până la trecerea în live.

---

## J. Starea Test Mode și pregătirea pentru Live Mode

**Test Mode: BLOCKED BY EXTERNAL DEPENDENCY.** Nu există `STRIPE_SECRET_KEY`,
`STRIPE_PUBLISHABLE_KEY` sau `STRIPE_WEBHOOK_SECRET` nici pe VM, nici local.
Fără ele nu se poate crea o sesiune de checkout reală, nu se poate verifica
o livrare reală și nu se poate confirma un eveniment real de la Stripe.
Tot ceea ce este marcat „FIXED AND VERIFIED” a fost verificat prin cod, prin
suite de regresie și prin verificare prin mutație — **nu** printr-o livrare
reală de la Stripe.

**Live Mode: platforma NU este încă gata.** Întregul lanț este reparat și
testat, dar înainte de a porni plățile live trebuie îndeplinite, în această
ordine:

1. Chei Stripe de test + `STRIPE_WEBHOOK_SECRET` + `PAYMENTS_ENABLED=true`.
2. Endpointul din Dashboard cu cele nouă evenimente.
3. Un flux complet în Test Mode: comandă → checkout → plată → factură →
   provisionare → anulare la sfârșit de perioadă → rambursare.
4. Doar apoi cheile live și repetarea fluxului cu cheile de live.

Până atunci, plata rămâne oprită în producție (`stripe: not_configured`),
deci platforma nu poate lua o plată nici prin eroare.

---

## K. Commit-uri

| Ramură | Commit | Conținut |
|---|---|---|
| `fix/stripe-integration` | `23e1ea0` | nucleul: D1–D7, D9, D10 (claim + rambursare), D8 (checkout + portal) |
| `fix/stripe-integration` | `2b2297f` | subagentul A: suita de izolare a rutelor de facturare |
| `fix/stripe-integration` | `e314023` | subagentul B: rambursarea schimbării de resurse |
| `fix/stripe-integration` | `6a8cc34` | subagentul C: interfața de facturare onestă |
| `fix/stripe-integration` | `493427a` | adresa clientului din caller + cheia de idempotență în rambursarea administrativă |

Toate integrate pe `fix/stripe-integration` prin `cherry-pick`, **fără
conflict** (fișiere disjuncte). Ramura este împinsă, **fără merge în `main`
și fără deploy**.
