# 05 — Comerț și facturare

**Data auditului:** 2026-10-23. **Audit READ-ONLY** (interogări `SELECT` pe DB-ul de producție, `GET`/`POST` pe API-uri publice fără efect, citire de cod sursă și de containere).
**Sistemul de producție nu a fost modificat.** Nu s-a creat nicio comandă, nu s-a făcut nicio plată, nu s-a apelat Stripe, nu s-a scris în DB.

---

## 0. Convenția unităților — citiți asta înainte de orice număr

**Toate sumele din acest raport și din API sunt în unități minori întregi (EUR cents).**

```text
api/src/lib/money.ts:2-3   "All monetary values are integer minor units (EUR cents)."
api/src/lib/money.ts:6     export const DEFAULT_CURRENCY = 'EUR';
api/src/services/pricing.ts:32-37   "All prices are integer minor units. The rate card is: ..."
```

Prin urmare, pentru produsul vândut:

| Valoare brută în DB / API | Bani reali |
|---:|---:|
| `149` | **€1.49** |
| `172` | **€1.72** |
| `229` | **€2.29** |
| `452` | **€4.52** |
| `590` | **€5.90** |

**Corectare necesară:** raportul de infrastructură al altui agent prezintă cardul de preț ca „172 EUR”. Este greșit de 100×: `172` minor units = **€1.72**.

### 0.1 Contractul API nu spune unitatea lângă câmp — finding de claritate

`GET /api/catalog/products` întoarce, pentru fiecare produs:

```json
"price": { "amount": 149, "currency": "EUR", "period": "MONTHLY" }
```

`api/src/routes/catalog.ts:59` — `price: price ? { amount: price.baseAmount, currency: price.currency, period: price.period } : null`.

Convenția **este** documentată, dar **o singură dată, la începutul contractului**:

```text
docs/API_CONTRACT.md:5   "Money is always an **integer number of minor units** (EUR cents). Never a float. Format on the client."
```

și **nu** este repetată pe câmpurile care contează:

```text
docs/API_CONTRACT.md:57   price: { amount, currency, period } | null,      // monthly base for the min config
docs/API_CONTRACT.md:60   QuoteItem = { productSlug, name, ram, cpu, disk, optionCodes, quantity, unitAmount, total, currency }
docs/API_CONTRACT.md:89   Invoice = { id, number, status, amount, tax, total, currency, hostedUrl, pdfUrl, createdAt, periodStart, periodEnd }
```

Un integrator terț care citește `amount: 149, currency: 'EUR'` ca „149 euro" greșește de 100×. Numele câmpului `amount` invită exact această greșeală. `api/src/routes/admin.ts:933` expune chiar un endpoint de ajutor (`GET /admin/money` → `{ example: { minorUnits: 312, majorUnits: money(312) } }`), dar acesta nu este în contract și nu ajută la integrarea publică.

**Impact de lansare:** mediu. Nu produce pierdere directă — toate calculele interne sunt corecte (doveză mai jos) — dar este exact tipul de ambiguitate care a produs deja o eroare de 100× în raportarea internă.

**Remediu exact:**
1. redenumește câmpul în `amountMinor` în payload-ul public (`api/src/routes/catalog.ts:59`) și în `docs/API_CONTRACT.md:57,60,89`; sau
2. măcar adaugă `// minor units (cents)` pe fiecare apariție a unui câmp monetar în contract; sau
3. ambele. Recomandarea: **ambele** — `amountMinor` este o schimbare de contract, deci se face împreună cu o versiune de contract, nu în trecere sub tăiță.

### 0.2 Stripe folosește aceleași unități minori — fără conversie

```text
api/src/services/stripe.ts:175   unit_amount: item.unitAmount,      // line item, mode subscription
api/src/services/stripe.ts:186   unit_amount: order.total,           // fallback (doar comenzi fără items)
```

`unit_amount` din Stripe API este nativ în unități minori, deci **nu există conversie și nu există loc de eroare** între prețul afișat și cel încărcat. `grep` pe tot `api/src` nu găsește niciun `* 100` sau `/ 100` aplicat unei sume monetare (singurele apariții sunt `cpu * 100` pentru limitele Pterodactyl — `api/src/services/provisioning.ts:472,479`, `api/src/services/upgrades.ts:131` — și `formatMoney` din `api/src/lib/money.ts:9`).

---

## 1. Motorul de preț

### 1.1 Formula unică

```text
api/src/services/pricing.ts:39-53
priceConfiguration(price, product, config, options):
  extraRamGb = max(0, (config.ram - product.minRam) / 1024)
  amount = price.baseAmount
         + normalizeAmount(extraRamGb * price.ramPerGb)
         + normalizeAmount(max(0, config.cpu - product.minCpu) * price.cpuPerUnit)
         + normalizeAmount(max(0, config.disk - product.minDisk) * price.diskPerGb)
         + sum(options.amount)
```

Consecință critică: **supraclășugile se aplică doar peste minimul produsului, nu peste zero.** Minimul produsului `discord-bot` este `minRam=256 / minCpu=1 / minDisk=1` (DB, `VERIFIED`), nu 512/1/5.

### 1.2 Corectarea numărului de bază din briefing

Briefing-ul secțiunii 12.3 scrie: „The smallest configuration of the one sellable product (512 MB, 1 vCPU, 5 GB) costs `149 + 60×0.5 + 40×1 + 2×5 = 229` cents = **€2.29 per month**."

Acea formulă aplică supraclășugile **peste zero** (0.5 GB de RAM, 1 CPU, 5 GB de disc). Motorul platformei aplică supraclășugile **peste minimul produsului**. Pentru configurația 512 MB / 1 vCPU / 5 GB, motorul produce:

```text
149 + ((512-256)/1024)*60 + (1-1)*40 + (5-1)*2
= 149 + 15 + 0 + 8
= 172 minor units = €1.72
```

Verificat pe sistemul viu:

```bash
$ curl -s -X POST https://blipmade.com/api/catalog/quote \
    -H 'content-type: application/json' -d '{"items":[{"productSlug":"discord-bot","ram":512,"cpu":1,"disk":5}]}'
{"items":[{...,"unitAmount":172,...}],"subtotal":172,"discount":0,"total":172,"currency":"EUR",...}
```

și confirmat de două ordine reale din DB (`BM-00002`…`BM-00005`, config `{"cpu":1,"ram":512,"disk":5}` → `OrderItem.unitAmount = 172`). **`VERIFIED`**

Numerele reale pentru produsul vândut:

| Configurație | Preț motor | Preț |
|---|---:|---:|
| **Minimul selectabil în wizard** (256 MB / 1 vCPU / 1 GB) | 149 | **€1.49** |
| **Implicitul (default)** (512 MB / 1 vCPU / 5 GB) | 172 | **€1.72** |
| Maximul selectabil în wizard (4096 MB / 4 vCPU / 49 GB) | 590 | **€5.90** |

### 1.3 Fiecare preț care ajunge la client și codul care îl recalculează

| # | Sursă | Ce valoare | Unde se calculează | Cine decide |
|---|---|---|---|---|
| 1 | `GET /catalog/products` → `price.amount` | `baseAmount` (prețul minimului) | `catalog.ts:39,59` | server |
| 2 | `GET /catalog/products/:slug` → `price.amount` | `baseAmount` | `catalog.ts:111-130` | server |
| 3 | `POST /catalog/quote` → `items[].unitAmount`, `subtotal`, `discount`, `total` | prețul configurației | `pricing.ts:299-331` | server |
| 4 | `GET /instances/:id/resources/quote` → `currentPrice`, `newPrice`, `priceDelta`, `requiresPayment` | prețul configurației noi | `upgrades.ts:37-60` | server |
| 5 | `PUT /instances/:id/resources` → `price` | `quote.newPrice` | `instances.ts:289,307` | server |
| 6 | `GET /billing/summary` → `monthlyEstimate` | **suma valorilor stocate** `instance.price` | `api/src/routes/billing.ts:116` | **valoare stocată, nu recalculată** |
| 7 | `GET /billing/subscriptions` → `amount` | `item.total` (nediscountuit) | `stripe.ts:313,321` | server, la plata |
| 8 | `GET /billing/invoices` → `amount`, `tax`, `total` | din evenimentul Stripe | `stripe.ts:398-444` | server, din Stripe |
| 9 | `GET /admin/pricing` → `baseAmount`, `ramPerGb`, `cpuPerUnit`, `diskPerGb` | cardul de tarife | `admin.ts:517-534` | server |
| 10 | `GET /admin/products` → `prices[].baseAmount` | `baseAmount` | `admin.ts:361-405` | server |
| 11 | `GET /admin/services` → `price` | **valoare stocată** `instance.price` | `admin.ts:351` | **valoare stocată** |
| 12 | `GET /instances` → `price` | **valoare stocată** `instance.price` | `instances.ts:44` | **valoare stocată** |

### 1.4 Serverul decide, browserul doar afișează — cu două excepții

**Calea de comandă este corectă.** Calculatorul de preț al clientului (`web/src/lib/pricing.ts`) **nu** calculează prețuri: el doar citește `product.price.amount` din payload și formatează. Wizard-ul de deploy cere prețul serverului la fiecare schimbare de configurație (`POST /catalog/quote`) și randă `quote.total` (`web/src/app/Deploy.tsx:521`, `:608`, `:615`, `:622`, `:650`). Textul din UI spune explicit „Priced by the server on every change." (`Deploy.tsx:536`) și „every quote is priced by the server, never by this page" (`web/src/admin/Pricing.tsx:62-63`). `docs/API_CONTRACT.md:63`: „Pricing is computed **server-side only**."

**Excepția 1 — simulatorul de marketing.** `web/src/data.ts:45-47`:

```ts
/** Illustrative rate card: the app's starting price plus whatever is added above its minimum. */
export const priceOf = (a: App, mb: number, cpu: number, disk: number) =>
  a.from + Math.max(0, (mb - a.mb) / 1024) * 0.6 + (cpu - 1) * 0.4 + Math.max(0, disk - a.disk) * 0.02;
```

Este un calculator **client-side, în float euro**, cu 12 aplicații hardcodate în `APPS` (`data.ts:8-27`), dintre care **7 nu există în catalogul real** (Ghost, Forgejo, Grafana, n8n, MySQL, MongoDB, Redis). Este folosit doar de `web/src/home/Studio.tsx` și `web/src/home/Story.tsx` (pagine de marketing, nu de comandă). `priceOf` nu ajunge niciodată în coș și nu intră într-un `Order`. **Risc mic, dar real:** un vizitator poate calcula în browser un preț pentru „MySQL" sau „Redis", produse pe care platforma nu le vinde. Recomandare: eliminarea aplicațiilor inexistente din cardul ilustrativ sau marcarea explicită a paginilor ca simulatoare.

**Excepția 2 — prețul stocat al instanței.** Vezi secțiunea 6. `instance.price` este o valoare **stocată**, iar estimarea lunară din `GET /billing/summary` este suma acestor valori stocate (`api/src/routes/billing.ts:116`), nu suma prețurilor recalculate. Aici serverul nu recalculează nimic la citire.

### 1.5 Unde se aleg prețurile pentru o comandă

```text
api/src/services/pricing.ts:69-79   loadPrice(productId, 'MONTHLY') → cea mai nouă price activă pentru perioada
api/src/services/pricing.ts:91-134  priceItems() → singurul loc unde se calculează prețul unui item
api/src/services/pricing.ts:104     if (!product.deployable) throw badRequest(`${product.name} is not available to order yet.`)
api/src/services/pricing.ts:106     validateConfiguration() → respinge orice configurație în afara minimului/maximului
```

`validateConfiguration` (`pricing.ts:55-67`) verifică doar `min ≤ valoare ≤ max`; nu verifică dacă valoarea este una **selectabilă în wizard**. De aceea există configurații pe care API-ul le prețuiește, dar wizard-ul nu le poate oferi (vezi 2.4).

### 1.6 Cards de prețuri aprobate și aprobate la greșeală

```text
api/src/routes/admin.ts:537-556   PUT /admin/pricing/:id
  baseAmount/ramPerGb/cpuPerUnit/diskPerGb: z.number().int().min(0)
```

Un operator poate pune `baseAmount = 0` (produs gratuit) — nu există plafon. Poate și `ramPerGb = 0`, ceea ce face ca RAM-ul suplimentar să fie gratuit. Ecranul de administrare avertizează textual (`Pricing.tsx:92`: „Use whole cents only. 0 is allowed.") dar nu blochează.

```text
api/src/routes/admin.ts:406-467   POST /admin/products
  baseAmount: z.number().int().min(0).default(0)
  prices: { create: { period: 'MONTHLY', baseAmount: body.baseAmount, currency: 'EUR' } }
```

Un produs nou creat prin UI pornește cu **preț 0** (implicitul lui `baseAmount`) și cu supraclășugile din schema (`ramPerGb=60`, `cpuPerUnit=40`, `diskPerGb=2`, `api/prisma/schema.prisma:267-269`). Dacă operatorul nu intră imediat în ecranul de prețuri, produsul este **gratuit**. **Finding.**

---

## 2. Ciclul de viață al comenzii

### 2.1 Modelele

```text
api/prisma/schema.prisma:348-386   Order     status, kind, fulfillmentStatus, total, currency, discount,
                                    promotionId, promotionRedeemedAt, stripeCheckoutSessionId, paidAt
api/prisma/schema.prisma:388-408   OrderItem quantity, unitAmount, total, currency, config (JSON înghețat)
api/prisma/schema.prisma:420-450   Subscription  amount, currency, status, currentPeriodStart/End, cancelAtPeriodEnd,
                                    stripeSubscriptionId, stripeSubscriptionItemId
api/prisma/schema.prisma:461-492   Invoice   number, amount, tax, total, status, stripeInvoiceId, hostedUrl, pdfUrl
api/prisma/schema.prisma:496-519   Payment   amount, currency, status, stripePaymentIntentId, stripeInvoiceId
```

Enums: `OrderStatus` = `PENDING | AWAITING_PAYMENT | PAID | FULFILLED | FAILED | CANCELLED | REFUNDED` (`schema.prisma:323-331`); `OrderKind` = `NEW | UPGRADE` (`334-337`); `FulfillmentStatus` = `NOT_STARTED | PROVISIONING | FULFILLED | FAILED` (`341-346`); `InvoiceStatus` = `DRAFT | OPEN | PAID | VOID | UNCOLLECTIBLE`; `PaymentStatus` = `PENDING | SUCCEEDED | FAILED | REFUNDED`.

### 2.2 Tranzițiile

```text
POST /orders                              → Order PENDING, fulfillmentStatus NOT_STARTED, total = quote.total
POST /orders/:id/checkout                 → Order AWAITING_PAYMENT  (numai dacă createCheckout a întors un URL)
POST /orders/:id/cancel                   → Order CANCELLED         (refuză dacă PAID sau FULFILLED)
webhook checkout.session.completed        → Order PAID  (markOrderPaid, stripe.ts:270-279)
                                           + fulfillmentStatus PROVISIONING (webhooks.ts:178-181)
provisioning is done                       → Order FULFILLED + fulfillmentStatus FULFILLED (provisioning.ts:646-654)
webhook cu sumă necorespunzătoare         → Order FAILED + audit order.amount_mismatch (webhooks.ts:219-228)
webhook async_payment_failed              → Order FAILED + Payment FAILED (webhooks.ts:241-248)
```

Observații:

- **Plata și onorarea sunt stări separate.** `fulfillmentStatus` urmărește serviciile, `status` urmărește banii. O comandă `PAID` cu `fulfillmentStatus=NOT_STARTED` este posibilă și este normală (plata a venit, provisionarea nu a început).
- **O comandă `CANCELLED` poate fi plătită și onorată ulterior.** `POST /orders/:id/cancel` (`orders.ts:165-178`) respinge doar `FULFILLED` și `PAID`; o comandă `CANCELLED` poate trece în continuare prin `POST /orders/:id/checkout` (`orders.ts:150` respinge doar `PAID`/`FULFILLED`), iar webhook-ul o poate marca `PAID` și o poate onora. `CODE-INSPECTED`
- **O comandă `CANCELLED` consumă în continuare promoția.** `markOrderPaid` (`stripe.ts:263-268`) incrementează `usedCount` și pune `promotionRedeemedAt` înainte de a verifica `alreadyPaid`, cu singura condiție `!order.promotionRedeemedAt`. O comandă anulată apoi plătită consumă slotul de campanie. `CODE-INSPECTED`

### 2.3 Trace: cotă → comandă → plată → factură

```text
1. Client          POST /api/catalog/quote  {items:[...], promotionCode?}      → subtotal, discount, total
2. Client          POST /api/orders         {items:[...], promotionCode?}      → 201 order
3. Server          buildQuote(items, promotionCode, user.id)                   pricing.ts:299
                   priceItems()  → unitAmount per item (NEDISCOUNTUIT)          pricing.ts:115-127
                   resolvePromotion() → valid/invalid + reason                 pricing.ts:165-192
                   applyPromotion(subtotal, promotion) → discount              pricing.ts:266-276
                   total = max(0, subtotal - discount)                          pricing.ts:324
4. Server          Order(total=quote.total, discount=quote.discount,
                         promotionId=quote.promotionRecord?.id)                 orders.ts:78-90
                   OrderItem(unitAmount=item.unitAmount, total=item.total)     orders.ts:84-90  ← NEDISCOUNTUIT
5. Server          reservePromotion({promotionId, userId, orderId, amount})    orders.ts:106-113
                   → creează PromotionRedemption (rezervare, nu consum)        pricing.ts:199-254
6. Client          POST /api/orders/:id/checkout                               orders.ts:142
                   createCheckout(order)                                        stripe.ts:142-209
7. Stripe          Checkout Session (mode subscription)                        stripe.ts:195-206
8. Webhook        checkout.session.completed                                  webhooks.ts:202-239
                   verifyAmount(orderId, object.amount_total)                   webhooks.ts:188-196
                   markOrderPaid(...) → Order PAID, Payment SUCCEEDED,
                                         Subscription per OrderItem             stripe.ts:252-342
                   fulfilOrder(orderId) → Instance per unit + enqueue          webhooks.ts:132-182
9. Worker          provisionInstance → Pterodactyl server                       provisioning.ts
                   Order → FULFILLED                                           provisioning.ts:646-654
10. Webhook       invoice.paid → Invoice local (status PAID)                    webhooks.ts:263-314
                   → Subscription.status ACTIVE + perioada reală din Stripe      webhooks.ts:316-330
```

### 2.4 Punctele în care suma poate diferi de cea afișată clientului

| # | Punct | Ce se întâmplă | Clasă |
|---|---|---|---|
| **P1** | `createCheckout` trimite `item.unitAmount` (nediscountuit) către Stripe, în timp ce `order.total` este discountuit | `stripe.ts:175` vs `orders.ts:79` | `CODE-INSPECTED` |
| **P2** | `verifyAmount` compară `amount_total` cu `order.total` | `webhooks.ts:188-196` | `CODE-INSPECTED` |
| **P3** | `OrderItem.unitAmount` este **nediscountuit**, `Order.total` este **discountuit** | `orders.ts:84-90` vs `:79` | `CODE-INSPECTED` |
| **P4** | `Subscription.amount` = `item.total` (nediscountuit) | `stripe.ts:313,321` | `CODE-INSPECTED` |
| **P5** | `Payment.amount` = `amount_total` de la Stripe (nediscountuit) | `stripe.ts:349` | `CODE-INSPECTED` |
| **P6** | `instance.price` = `item.unitAmount` (nediscountuit) | `webhooks.ts:162` | `CODE-INSPECTED` |
| **P7** | `serializeOrder` arată clientului `total` și, lângă el, `item.unitAmount` | `orders.ts:38-55` | `CODE-INSPECTED` |

**P1 + P2 = defect blocant de lansare.** Cu orice promoție nenulă:

```text
subtotal      = Σ item.unitAmount × quantity          (ce trimite Stripe)
order.total   = subtotal − discount                   (ce i-a arătat clientului)
amount_total  = subtotal                              (ce a strâns Stripe)
verifyAmount: amount_total !== order.total  →  true    webhooks.ts:192
→ Order status FAILED + audit order.amount_mismatch + throw   webhooks.ts:220-227
→ evenimentul webhook rămâne 'failed' → Stripe reîncearcă la nesfârșit
```

Cu alte cuvinte: **o promoție face ca fiecare checkout cu cod să eșueze definitiv** (și încă se reîncearcă), iar clientul ar fi fost taxat cu suma **fără reducere**, nu cu suma redusă afișată. Doar ramura de fallback `stripe.ts:181-193` (comenzi fără `items`) folosește `order.total`; o comandă `NEW` are întotdeauna cel puțin un item (`orders.ts:69` — `.min(1, 'Choose at least one app.')`), deci **reducerea nu ajunge niciodată la Stripe**.

### 2.5 Upgrade: cum se plătește și cum se aplică

```text
GET  /instances/:id/resources/quote   → quoteResourceChange()            upgrades.ts:37-60
PUT  /instances/:id/resources
     priceDelta > 0  → createUpgradeOrder() + createCheckout() → 503 în producție
     priceDelta ≤ 0  → createUpgradeOrder() + applyUpgradeOrder() imediat  instances.ts:278-293
```

`createUpgradeOrder` (`upgrades.ts:66-98`) pune `total = max(0, priceDelta)` și `discount = |priceDelta| pentru delta negativ`. O **downgrade** este aplicată imediat și **înlocuiește suma** cu `order.total` (`:186`), adică 0. Comanda rămâne `PENDING` pentru tot restul vieții sale, cu `fulfillmentStatus` ajuns la `FULFILLED` — nu există nicio cale care să o marcheze `PAID`/`FULFILLED`/`CANCELLED`. `CODE-INSPECTED`

`applyUpgradeOrder` (`upgrades.ts:106-175`) actualizează **mai întâi panoul**, abia apoi DB-ul; dacă panoul refuză, DB-ul nu este atins, plata este rambursată (`upgrades.ts:147-152`) și comanda devine `FAILED`. Design corect. Dar scrie `price: newPrice` **fără opțiunile de plată** (l.169 → `priceConfiguration(price, instance.product, request)` cu `options = []` implicit), deci o instanță cu add-on-uri plătite ar pierde costul add-on-urilor la orice resize. Latent: `ProductOption` are 0 rânduri în DB. `CODE-INSPECTED`

---

## 3. Integrarea Stripe

### 3.1 Cifre și verificare de semnătură — starea actuală a gardului

**Garda există în cod și în containerul care rulează acum:**

```text
api/src/services/stripe.ts:32-42
export function stripeTestGateway(): boolean {
  if (process.env.NODE_ENV === 'production') return false;      // ← linia 39
  if (process.env.STRIPE_TEST_MODE === 'false') return false;   // ← linia 40
  return !env.stripeEnabled && (env.isTest || process.env.STRIPE_TEST_MODE === 'true');
}
```

Verificat în **containerul de producție care rulează acum**, nu doar în sursă:

```bash
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 \
    'docker exec blipmade-api-1 sh -lc "grep -n NODE_ENV /app/dist/services/stripe.js"'
36:    if (process.env.NODE_ENV === 'production')
```

`VERIFIED` (runtime)

Starea mediului de producție (doar tipul și lungimea, nicio valoare de secret):

```bash
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker exec blipmade-api-1 sh -lc \
   "printf \"NODE_ENV=%s\nSTRIPE_TEST_MODE=%s\nPAYMENTS_ENABLED=%s\nSTRIPE_SECRET_KEY_len=%s\nSTRIPE_WEBHOOK_SECRET_len=%s\n\" ..."'
NODE_ENV=production
STRIPE_TEST_MODE=false
PAYMENTS_ENABLED=false
STRIPE_SECRET_KEY_len=0
STRIPE_WEBHOOK_SECRET_len=0
```

`VERIFIED` (runtime)

Consecințe:

- `stripeLive()` = `env.stripeEnabled` = `STRIPE_SECRET_KEY.startsWith('sk_')` → **false** (`api/src/env.ts:127`).
- `stripeTestGateway()` → **false** (două condiții independente: `NODE_ENV=production` la `stripe.ts:39` și `STRIPE_TEST_MODE=false` la `stripe.ts:40`).
- `GET/POST /webhooks/stripe` → `stripeLive() && stripeTestGateway()` ambele false → `webhooks.ts:451-454` răspunde `200 { received: false, reason: 'Stripe is not configured.' }`. **Nu acceptă nimic.**
- Calea de parsare **fără verificare de semnătură** (`webhooks.ts:440-444`, `JSON.parse` orb) este **inaccesibilă**: este plasată după garda de la `webhooks.ts:451`, care întoarce înainte. `CODE-INSPECTED`
- Când `stripeLive()` este adevărat, semnătura **este** verificată cu `stripe.webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET)` (`webhooks.ts:429-439`), iar lipsa secretului → `400 'The webhook secret is not configured.'` (`webhooks.ts:431`). `CODE-INSPECTED`
- Endpointul de test `/webhooks/stripe/test` (`webhooks.ts:488-534`) → `404` când `stripeTestGateway()` este fals (`webhooks.ts:489-491`) și, chiar dacă ar exista, cere `x-internal-token` (`webhooks.ts:492-495`).

**Concluzie: defectul găsit de sesiunea anterioară („gateway-ul local pornea sub `NODE_ENV=production` și lăsa webhook-ul să accepte payload-uri nesemnate") este închis în codul care rulează acum.** `VERIFIED` (runtime, containerul de producție)

### 3.2 Dar fereastra în care a fost deschis este mărturia din DB

Gateway-ul de test a fost **real folosit în producție**, după o comandă reală:

```text
OrderItem  BM-00001 … BM-00005   →  stripeCheckoutSessionId = "test_cs_<orderId>"
                                     (webhooks.ts/stripe.ts:144 → `test_cs_${order.id}`)
AuditLog   order.checkout_started  2026-10-23 01:38:32, 03:03:21, 04:21:00, 06:51:17
```

`test_cs_` este prefixul generat **doar** de ramura de test gateway (`api/src/services/stripe.ts:143-148`). Cele 4 evenimente `order.checkout_started` arată că un cont real (`stefan@xodo.ro`) a ajuns până la „checkout started" între orele 01:38 și 06:51 UTC pe 2026-10-23. Containerul curent de API a fost construit la **06:56:11 UTC** (`docker images --format '{{.CreatedAt}}'` → `blipmade-api:latest 2026-10-23 06:56:11`), deci garda a ajuns în producție **după** ultima utilizare a gateway-ului. `VERIFIED` (runtime + DB)

Consecințe reale: **nicio plată nu a fost pierdută** (0 ordine plătite dintre cele 5, 0 `Payment`, 0 `Invoice`), **nicio instanță nu a fost provisionată** din acele comenzi, și **niciun client nu a fost taxat** — gateway-ul de test nu încasează. Dar timpul în care un atacator putea trimite un eveniment `checkout.session.completed` nesemnat, cu `client_reference_id` al unei comenzi existente, a fost deschis public, cu `order.paid` și provisionare ca urmare. Faptul că acest lucru **s-a întâmplat în producție** arată că garda trebuia tratată ca o urgență, nu ca o observație de igienă.

### 3.3 Idempotență — ledgerul `WebhookEvent`

```text
api/src/routes/webhooks.ts:59-95   claimEvent()
  create() cu unique (provider, eventId) → 'claimed'
  existing.status === 'processed'            → 'duplicate' (ignorat, 200)
  existing.status === 'failed' || 'received' sau lastAttemptAt mai vechi de 5 min → 'retry'
  altfel                                    → 'duplicate' (altă livrare lucrează)
```

`api/prisma/schema.prisma:785+` — `WebhookEvent` cu `@@unique([provider, eventId])`. Livrarea este înregistrată **înainte** de procesare (`webhooks.ts:66-68`), deci o livrare nu se pierde.

Idempotența la nivel de ordine este reală: `markOrderPaid` este idempotent (`stripe.ts:259 alreadyPaid`, `stripe.ts:304 upsert` pe `orderItemId`), iar provisionarea folosește o cheie de idempotență per instanță (`webhooks.ts:147` — `order:${order.id}:item:${item.id}:unit:${unit}`).

### 3.4 Evenimente tratate și ignorate

```text
TRATATE:
  checkout.session.completed              webhooks.ts:202-239
  checkout.session.async_payment_succeeded webhooks.ts:203
  checkout.session.async_payment_failed    webhooks.ts:241-248
  payment_intent.payment_failed            webhooks.ts:250-261
  invoice.paid                             webhooks.ts:263-332
  invoice.payment_failed                   webhooks.ts:334-362
  customer.subscription.updated            webhooks.ts:364-392
  customer.subscription.deleted            webhooks.ts:365
IGNORATE (default: break, apoi audit):    webhooks.ts:395-396
  checkout.session.expired
  invoice.created
  invoice.finalized
  customer.updated / customer.deleted
  charge.refunded
  dispute.created
  payment_intent.succeeded
  account.updated
  ...
```

`checkout.session.expired` **nefiind tratat**, o sesiune Stripe expirată lasă comanda în `AWAITING_PAYMENT` pentru totdeauna, iar rezervarea de promoție rămâne ocupată până la sweep-ul de 48h (`api/src/services/billing.ts:274-291`). Recomandare: tratarea lui ca `CANCELLED` + eliberarea rezervării.

### 3.5 Reconcilierea dintre evenimentul Stripe și comanda locală

`verifyAmount` (`webhooks.ts:188-196`) compară `object.amount_total` cu `order.total`:

```text
if (typeof amountTotal !== 'number') return null;      ← dacă amount_total lipsește, NU se verifică nimic
if (!order) return 'The order does not exist.';
if (amountTotal !== order.total) return `Stripe collected ${amountTotal} but the order total is ${order.total}.`;
```

Observații:

- Verificarea este **exactă** (egalitate strictă), fără toleranță pentru impozit sau rotunjiri. Un cent diferit → comandă `FAILED`. `CODE-INSPECTED`
- Când `amount_total` lipsește din payload, verificarea este **sărită** și comanda este marcată plătită oricât. `CODE-INSPECTED`
- Suma verificată este cea **brută**, fără reducere → vezi P1/P2 din 2.4.

### 3.6 Eveniment duplicat, eveniment în afara ordinii, eveniment pentru o comandă necunoscută

| Scenariu | Comportament | Clasă |
|---|---|---|
| **Duplicat** (același `eventId`, deja `processed`) | `claimEvent` → `duplicate` → `200 { received: true, duplicate: true }`, fără efect (`webhooks.ts:464-466`) | `CODE-INSPECTED` |
| **Duplicat** (același `eventId`, încă în `received`/`processing`) | marcat `abandoned` dacă `status==='received'` sau `lastAttemptAt` > 5 min → re-procesat (`webhooks.ts:81-91`) | `CODE-INSPECTED` |
| **Același eveniment livrat de două ori în paralel** | al doilea vede `status='processing'` → `duplicate` → ignorat. Corect. | `CODE-INSPECTED` |
| **Eveniment pentru o comandă inexistentă** | `DeferredWebhookError` → `markDeferred` → `200 { deferred: true }`; rămâne în ledger și poate fi reluat de operator prin `POST /webhooks/stripe/replay` (`webhooks.ts:558-592`) sau prin `GET /webhooks/stripe/failed` (`webhooks.ts:540-552`). **Nu este reluat automat de worker** (`retryFailedWebhookEvents` reia doar `failed`, `webhooks.ts:599-604`). | `CODE-INSPECTED` |
| **Eveniment în afara ordinii** (ex. `invoice.paid` înainte de `checkout.session.completed`) | `invoice.paid` caută abonamentul după `stripeSubscriptionId`; dacă nu există încă, `userId` rămâne `null` și **nu se creează nicio factură local** (`webhooks.ts:270-280`). Evenimentul este marcat `processed` și nu mai este reluat. **Factura se pierde definitiv.** | `CODE-INSPECTED` |

Ultimul rând este defectul clasic de „eveniment pierdut". Un `invoice.paid` ajuns înainte de `markOrderPaid` este **consumat ca procesat** și nu mai există nicio cale de recuperare: `upsertInvoice` nu se mai apelează pentru acel `stripeInvoiceId`. `Payment` rămâne fără `stripeInvoiceId`, deci și pagina de factură a clientului nu va arăta nimic legat de acel document.

### 3.7 `applyUpgradeOrder()` nu verifică `order.status === 'PAID'`

Confirmat, în sursă:

```text
api/src/services/upgrades.ts:106-119
export async function applyUpgradeOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { instance: { include: { product: true } } } });
  if (!order) return { applied: false, reason: 'Order not found.' };
  if (order.kind !== 'UPGRADE') return { applied: false, reason: 'This order is not a resource change.' };
  if (!order.instance) return { applied: false, reason: 'The instance of this order no longer exists.' };
  if (order.fulfillmentStatus === 'FULFILLED') return { applied: true, reason: null };
  const request = (order.requestedConfig ?? {}) as unknown as ResourceRequest;
  if (!request.ram || !request.cpu || !request.disk) return { applied: false, reason: 'The order does not carry a resource configuration.' };
  ...
```

**Nu există nicio verificare de plată.** Docstring-ul funcției spune „Applies a **paid** resource change" (`upgrades.ts:100`), dar codul nu verifică niciodată `order.status`.

**Ce ar declanșa-o efectiv:**

1. `api/src/routes/instances.ts:282` — în ramura `!quote.requiresPayment`, adică `priceDelta ≤ 0` → comanda are `total = max(0, priceDelta) = 0`. Aici lipsa verificării este **inofensivă**: o downgrade e gratuită prin definiție. `CODE-INSPECTED`
2. `api/src/routes/webhooks.ts:137` — prin `fulfilOrder()`, apelat la `webhooks.ts:237`, **după** `markOrderPaid()` la `webhooks.ts:230`, deci comanda este deja `PAID`. `CODE-INSPECTED`

**Deci blast radius-ul este astăzi zero pe calea de produs** — dar numai datorită unei condiții din *caller*, nu din funcție.

**503-ul NU îl apără.** `503 payments_unavailable` vine din `api/src/services/stripe.ts:150-153` (`if (!env.paymentsEnabled) throw paymentsUnavailable()`), adică din `createCheckout`. Efectul lui este: ramura de upgrade **plătit** nu poate porni, iar comanda rămâne `PENDING` fără `applyUpgradeOrder`. Asta apără ramura corectă, dar **nu apără funcția**: `applyUpgradeOrder` rămâne o funcție publică de serviciu care aplică un upgrade fără să ceară plată, iar orice apel nou (retry de admin, coadă, un „resume upgrade" scris peste noapte) ar da resurse gratuite. Recomandare: adăugați în `upgrades.ts:106` verificarea `if (order.status !== 'PAID' && order.total > 0) return { applied: false, reason: 'The order has not been paid.' }` — o linie, care închide clasa de defecte.

### 3.8 Defectul de reconciliere al sweep-ului local

```text
api/src/services/billing.ts:248
if (stripeTestGateway() || !stripeLive()) { renewed += await renew(record.id); }
```

`renew()` (`api/src/services/billing.ts:96-142`) marchează abonamentul `ACTIVE`, avansează perioada cu `PERIOD_MS = 30 * 24 * 3600 * 1000` (`api/src/services/billing.ts:27`) și **scrie o factură locală `status: 'PAID'`, `paidAt: now`, `stripeInvoiceId: null`** — pentru o sumă care nu a fost încasată.

Condiția `!stripeLive()` este adevărată **în producția de azi** (nu există cheie Stripe). Așadar, dacă ar exista un singur abonament, sweep-ul (rulează la fiecare 15 minute, `api/src/worker.ts:168`) ar fabrică o factură plătită fără bani. Azi sunt **0 abonamente**, deci nu s-a întâmplat. Iar când Stripe va fi real, condiția devine falsă și sweep-ul **nu mai reînnoiește local** — reînnoirea este delegată integral evenimentului `invoice.paid` (`webhooks.ts:316-330`), care aduce perioada reală de la Stripe.

**Așadar: „mecanismul de reînnoire" real este 100% în Stripe; funcția locală `renew()` este o reînnoire falsă, folosită doar în test.** Risc: dacă un operator activează vreodată `STRIPE_TEST_MODE=true` într-un mediu cu abonamente, apar facturi `PAID` fabricate. `CODE-INSPECTED`

### 3.9 Numerotarea facturilor

```text
api/src/services/stripe.ts:440-443
const count = await prisma.invoice.count();
await prisma.invoice.create({ data: { ...data, number: `BM-INV-${String(count + 1).padStart(5, '0')}` } });
```

`count()` apoi `create()` nu este atomic: două evenimente `invoice.paid` concurente pot calcula același număr → violare de unicitate → excepție → evenimentul webhook eșuează și este reluat (unde `count` vede deja 1). Recuperabil, dar zgomotos. `CODE-INSPECTED`

---

## 4. Monedă și taxă

- **Moneda:** `ProductPrice.currency` default `'EUR'` (`schema.prisma:268`); toate cele 5 rânduri din DB sunt `EUR` (`VERIFIED`, DB). Cotă: `currency = priced[0]?.currency ?? 'EUR'` (`pricing.ts:306`). Clientul plătește în `item.currency.toLowerCase()` → `'eur'` (`stripe.ts:174`).
- **Amestec de monede:** `buildQuote` **nu verifică** că toate item-urile au aceeași monedă; suma subtotalului este adunată peste `priced[0].currency`. Cu un singur produs și doar EUR, situația nu apare. Latent, dar o cale de corupție a sumelor. `CODE-INSPECTED`
- **Taxă / TVA:** în întreaga aplicație **nu există** logică de taxă. Fără `automatic_tax`, fără `tax_behavior`, fără calcul de rată (`grep -rn "automatic_tax\|tax_behavior" api/src` → zero rezultate). `Invoice.tax` (`schema.prisma:472`) este scris **mereu 0**, pentru că `upsertInvoice` primește `tax` doar dacă este pasat explicit, iar singurul apelant (`webhooks.ts:281-293`) nu îl pasează (`stripe.ts:415` → `tax = params.tax ?? 0`).
- **Efectul practic:** Stripe încasează **exact** suma afișată (`unit_amount` fără taxă automată). Așadar, *în lipsa promoțiilor*, prețul afișat = prețul încasat. Ecranul de factură arată `amount` și `tax 0` (`web/src/app/Billing.tsx:322-325`).
- **Ceea ce nu pot afirma:** dacă Blipmade este plătitor de TVA și dacă prețurile trebuie să fie cu TVA inclus. Nu există niciun document în repo care să stabilească regimul fiscal; nu inventez o rată. `BLOCKED` — pasul de deblocare sigur: decizia fiscală a CFO-ului, apoi o ramură `tax` în `upsertInvoice` și `automatic_tax` în `createCheckout` dacă se decide colectarea de la client.

---

## 5. Reînnoire și anulare

### 5.1 Reînnoire

- Cu Stripe real: reînnoirea este **delegată complet lui Stripe** (`mode: 'subscription'`, `recurring: { interval: 'month' }` la `stripe.ts:176`). Evenimentul `invoice.paid` actualizează perioada reală (`webhooks.ts:316-330`), iar `retrieveStripeSubscription` (`stripe.ts:215-229`) citește perioada direct de la Stripe ca „the local period dates are never an approximation of a month" (`stripe.ts:212-213`).
- Fără Stripe (adică acum, și în test): reînnoirea este **falsă** — vezi 3.8.
- **Nu există un plan anual.** `BillingPeriod` are `MONTHLY | YEARLY` (`schema.prisma:209-212`), dar toate rândurile sunt `MONTHLY` și nu există niciun cod care creeze o preț `YEARLY` (`loadPrice` caută `MONTHLY` implicit în `priceItems`).
- **Suspensia pentru neplată** există: `sweepSubscriptions` (`api/src/services/billing.ts:181-266`) oprește containerul (`stopInstance`, `billing.ts:44-56`), marchează instanța `SUSPENDED` și abonamentul `PAST_DUE` după 7 zile de grație (`GRACE_PERIOD_DAYS = 7`, `billing.ts:24`; `billing.ts:218-244`).

### 5.2 Anulare

```text
POST /billing/subscriptions/:id/cancel  → cancelSubscription()  stripe.ts:496-514
  - dacă există stripeSubscriptionItemId → se șterge doar acea linie din abonamentul Stripe
  - altfel → cancel_at_period_end = true
  - local: cancelAtPeriodEnd = true
POST /billing/subscriptions/:id/resume  → resumeSubscription()  stripe.ts:516-526
```

Anularea este **la sfârșitul perioadei plătite**, nu imediat. Sweep-ul (`api/src/services/billing.ts:181-266`) retrage abonamentul la `currentPeriodEnd`:

```text
withdraw()  api/src/services/billing.ts:59-93
  → stopInstance(instance) + instance.status = 'CANCELLED' + cancelledAt
  → serverul Pterodactyl este șters DOAR dacă setarea
    'auto_delete_cancelled_instances' este activă (billing.ts:30-34, :80-85)
```

Setarea nu există în DB (`"Setting"` = 0 rânduri, `VERIFIED`) → `autoDeleteEnabled()` întoarce `false` (lipsa rândului → `billing.ts:32`) → **serverul Pterodactyl și datele lui rămân pe nod**.

**Experiența clientului la anulare:** containerul se oprește, instanța trece în `CANCELLED`, dar **datele rămân pe disc, pe nod, fără o politică de retenție, fără backup la momentul anulării și fără un termen de ștergere**. Clientul pierde accesul la date fără să știe că datele există în continuare; resursele nodului rămân ocupate. Pentru o platformă cu un singur operator, recomandarea este un termen explicit de retenție și un export înainte de ștergere.

---

## 6. Prețul stocat și configurația reală

### 6.1 Fenomenul, măsurat

```text
id                            ram  cpu  disk  price  currency  orderId                      owner
cmvkbgm9h0001r18096ep5jzl     512   1    5     172    EUR       cmvkbgm4k0008r1011in2sa3u   qa.headless.one@example.test    ← ONLINE
cmvkbichh0003r180pj33xwom     512   1    5     172    EUR       cmvkbicg7000lr101n3xt83w7   qa.headless.two@example.test    ← STOPPED
cmvkn67g90003psd841h9qc3g     512   1    5     149    EUR       (null)                      browser-customer@blipmade.test ← ONLINE
```

(`VERIFIED`, DB producție)

> **Unitate.** Coloana `price` este stocată în **unități minori (sutimi)** cu `currency = EUR`: `172` = **€1.72**, `149` = **€1.49**. Valorile de mai jos sunt copia brută a rândurilor, așa cum le stochează baza de date; nu trebuie citite ca euro fără împărțire la 100.

**Același „Browser instance" cu 512 MB / 1 vCPU / 5 GB este stocat la două prețuri diferite: 172 și 149.** Prețul corect pentru configurația 512/1/5, conform motorului, este **172** (149 + 15 + 0 + 8). Instanța a treia (fără `orderId`, creată pentru contul `browser-customer@blipmade.test`) este stocată la **149**, adică la prețul **minimului** produsului (256/1/1).

### 6.2 Corecția necesară asupra cifrelor din mesajul de coordonare

Mesajul de coordonare afirma că „172 minor units este prețul unei configurații 768 MB / 1 vCPU / 9 GB" și că minimul produsului ar fi 512 MB. **Ambele afirmații sunt greșite**, pentru că minimul produsului `discord-bot` în DB este `minRam=256`, `minCpu=1`, `minDisk=1` (`VERIFIED`, DB și `GET /catalog/products`):

```text
768 MB / 1 vCPU / 9 GB  →  149 + ((768-256)/1024)*60 + 0 + (9-1)*2  =  149 + 30 + 16  =  195
512 MB / 1 vCPU / 5 GB  →  149 + ((512-256)/1024)*60 + 0 + (5-1)*2  =  149 + 15 +  8  =  172  ← cele două ordini reale
256 MB / 1 vCPU / 1 GB  →  149 + 0 + 0 + 0  =  149  ← prețul minimului
```

Deci: **172 este prețul configurației 512/1/5** (configurația implicită), iar **mecanismul real este importul de instanță**, nu o eroare de tarif.

### 6.3 Cauza: `POST /admin/instances/import`

```text
api/src/routes/admin.ts:896-916
const price = await prisma.productPrice.findFirst({ where: { productId: product.id, period: 'MONTHLY', active: true }, orderBy: { createdAt: 'desc' } });
const instance = await prisma.instance.create({
  data: {
    ram: server.limits.memory,                                   // limitele reale ale serverului Pterodactyl
    cpu: Math.max(1, Math.round(server.limits.cpu / 100)),
    disk: Math.max(1, Math.round(server.limits.disk / 1024)),
    price: price?.baseAmount ?? 0,                               // ← prețul MINIMULUI, nu prețul configurației
    ...
```

Importul copiază resursele reale de la panou, dar scrie `price = baseAmount`, adică **prețul configurației minime**, oricare ar fi configurația reală importată. Pentru serverul importat cu 512 MB / 1 vCPU / 5 GB rezultă `price = 149` în loc de `172` — exact diferența observată. `CODE-INSPECTED` + `VERIFIED` (DB)

### 6.4 Poate un client ajunge în această stare prin produsul însuși?

Am urmărit **toate** căile care schimbă `ram`, `cpu` sau `disk` pe o instanță:

| Cale | Schimbă resursele? | Recalculează prețul? | Clasă |
|---|---|---|---|
| `PATCH /instances/:id/settings` (`instance-server.ts:972-1005`) | **Nu** — acceptă doar `name` și `description` | n/a | `CODE-INSPECTED` |
| `PUT /instances/:id/resources` cu `priceDelta > 0` (`instances.ts:296-311`) | Da, dar numai după plată | Da — `applyUpgradeOrder` scrie `price: newPrice` (`upgrades.ts:172-175`) | `CODE-INSPECTED` |
| `PUT /instances/:id/resources` cu `priceDelta ≤ 0` (downgrade) (`instances.ts:278-293`) | Da, imediat | **Da** — `upgrades.ts:174` scrie noul preț | `CODE-INSPECTED` |
| Calea de provisionare (`webhooks.ts:151-166`) | Setează resursele la creare | Da — `price: item.unitAmount` (`webhooks.ts:162`) | `CODE-INSPECTED` |
| `provisioning.ts` (worker) | Nu schimbă resursele | **Nu scrie prețul deloc** | `CODE-INSPECTED` |
| `POST /admin/instances/:id/retry` (`admin.ts:845-858`) | Nu schimbă resursele | Nu — doar reenqueue-ează provisionarea | `CODE-INSPECTED` |
| `POST /admin/instances/import` (`admin.ts:864-931`) | **Da** — copiază limitele reale | **Nu** — scrie `baseAmount` | `CODE-INSPECTED` |
| Panoul Pterodactyl / `panel-bridge` | Limitele se stabilesc la crearea serverului (`provisioning.ts:466-481`); bridge-ul nu atinge alocările de CPU/RAM/disc | n/a | `CODE-INSPECTED` |

**Răspuns: un client nu poate ajunge în această stare prin produsul însuși.** Singura cale care produce abaterea este `POST /admin/instances/import`, o acțiune de operator. Iarabaterea este **în favoarea clientului** (preț mai mic decât datorat), nu în defavoarea lui.

**Downgrade-ul nu scade prețul în virtutea lui:** `applyUpgradeOrder` scrie întotdeauna `price: newPrice` recalculat (`upgrades.ts:164-175`), deci un client nu poate reduce resursele fără ca prețul să urmeze. **Exceptie latentă:** `newPrice` se calculează fără `ProductOption` (`upgrades.ts:168-170` → `priceConfiguration(price, instance.product, request)` cu `options = []`), deci o instanță cu add-on-uri plătite ar pierde costul acestora la orice resize. `ProductOption` are 0 rânduri azi. `CODE-INSPECTED`

### 6.5 Nu există reconciliere programată

Job-urile worker-ului (`api/src/worker.ts:164-169`):

```text
reconcile()            → reconcileInterruptedInstances()   (provisioning)     la 60 s
pruneQueue()                                                                     la 10 min
pruneSessions()                                                                   la 60 min
sweepBilling()          → sweepSubscriptions() + reconcileWithProvider()
                          + releaseStalePromotionReservations()                la 15 min
retryWebhooks()        → retryFailedWebhookEvents()                           la 5 min
```

**Niciunul nu compară `instance.price` cu `priceConfiguration(price, product, instance)`.** `reconcileWithProvider()` (`billing.ts`) sincronizează abonamentele cu Stripe, nu prețurile instanțelor. `CODE-INSPECTED`

### 6.6 Efectul asupra clientului și asupra operatorului

- `GET /billing/summary` → `monthlyEstimate = Σ instance.price` (`api/src/routes/billing.ts:116`) — estimarea lunară afișată clientului este **suma valorilor stocate**, deci pentru instanța importată este **under-reportată cu 23 minor units (€0.23/lună)**. `CODE-INSPECTED`
- Ecranul de administrare `web/src/admin/Services.tsx:199-201,252-254` afișează `service.price` **lângă** `ram / cpu / disk` (`:109`), deci un operator *poate* vedea abaterea, dar nu există niciun semnal, nicio coloană „calculat", nicio alertă. Ecranul `web/src/admin/Pricing.tsx` afișează doar cardul de tarife, nu prețurile instanțelor. `CODE-INSPECTED`
- Reconcilierea cu Stripe se bazează pe `subscription.amount`, nu pe `instance.price` (`stripe.ts:185`, `upgrades.ts:182`), deci abaterea nu ajunge la factură — dar nici nu este detectată.

**Recomandare:** adăugați în `sweepBilling()` o verificare zilnică care recalculează prețul fiecărei instanței din configurația curentă și emite un `audit` (`instance.price_mismatch`) când diferă; corectați `POST /admin/instances/import` să folosească `priceConfiguration(...)` în loc de `baseAmount`; și afișați în `web/src/admin/Services.tsx` prețul recalculat alături de cel stocat.

---

## 7. Starea banilor astăzi

Sursa: DB de producție, interogări `SELECT` read-only, 2026-10-23.

```text
"Product"          5 rânduri   (wordpress, code-server, discord-bot, uptime-kuma, postgresql)
"ProductPrice"     5 rânduri   (toate MONTHLY, active, EUR)
"ProductOption"    0 rânduri
"Promotion"        0 rânduri
"PromotionRedemption" 0 rânduri
"Order"            5 rânduri
"OrderItem"        5 rânduri
"Payment"          0 rânduri
"Invoice"          0 rânduri
"Subscription"     0 rânduri
"WebhookEvent"     8 rânduri   (toate evt_verify_*, status 'received', attempts 0)
```

### 7.1 Cele 5 comenzi

| număr | status | kind | total | discount | config | `stripeCheckoutSessionId` | `paidAt` | ce s-a întâmplat |
|---|---|---|---:|---:|---|---|---|---|
| BM-00001 | AWAITING_PAYMENT | NEW | 470 | 0 | 2048/4/49 | `test_cs_cmvkawsrg0025o701uj171559` | — | checkout pornit prin gateway-ul de test; niciodată plătită |
| BM-00002 | AWAITING_PAYMENT | NEW | 172 | 0 | 512/1/5 | `test_cs_cmvkbgm4k0008r1011in2sa3u` | — | checkout pornit la 06:51:17; niciodată plătită |
| BM-00003 | PENDING | NEW | 172 | 0 | 512/1/5 | — | — | comandă creată, checkout nepor-nit |
| BM-00004 | AWAITING_PAYMENT | NEW | 172 | 0 | 512/1/5 | `test_cs_cmvkdxv2v0005lk01b5e5ho5d` | — | checkout pornit prin gateway-ul de test; niciodată plătită |
| BM-00005 | AWAITING_PAYMENT | NEW | 172 | 0 | 512/1/5 | `test_cs_cmvkgpqh5001hnv01lwf5hsbp` | — | checkout pornit prin gateway-ul de test; niciodată plătită |

Aritmetica (verificată împotriva formulei din `pricing.ts:39-53`):

```text
BM-00001  149 + ((2048-256)/1024)*60 + (4-1)*40 + (49-1)*2 = 149 + 105 + 120 + 96 = 470  ✓
BM-00002..05  149 + ((512-256)/1024)*60 + (1-1)*40 + (5-1)*2  = 149 +  15 +   0 +   8 = 172  ✓
```

### 7.2 Ce cale comercială a fost exercitată efectiv

| Cale | Exercitată? | Dovadă |
|---|---|---|
| Cotă server-side | **Da** — endpointul a răspuns corect la 255 de interogări (sweep live al acestui audit, plus apelurile din wizard) | 255/255 răspunsuri 200, toate identice cu formula motorului |
| Creare de comandă | **Da**, de 13 ori (8 șterse + 5 rămase) | `AuditLog` `order.created` × 13 |
| Checkout prin gateway-ul de test | **Da**, de 4 ori | `AuditLog` `order.checkout_started` × 4 + prefixul `test_cs_` |
| **Plată reală prin Stripe** | **Nu, niciodată** | 0 `Payment`, 0 `Invoice`, 0 `Subscription`, 0 `order.paid` pentru aceste comenzi |
| **Webhook Stripe cu semnătură** | **Nu, niciodată** | 0 evenimente Stripe reale; cele 8 rânduri din `WebhookEvent` sunt `evt_verify_*` |
| Abonament / reînnoire | **Nu, niciodată** | 0 `Subscription` |
| Factură locală | **Nu, niciodată** | 0 `Invoice` |
| Refund | **Nu, niciodată** | `refundPayment` nu are niciun apelator real |
| Upgrade plătit | **Nu, niciodată** | 0 comenzi `kind='UPGRADE'` |
| Upgrade neplătit (downgrade) | **Nu, niciodată** | 0 comenzi `kind='UPGRADE'` |
| Promoție | **Nu, niciodată** | 0 `Promotion`, 0 `PromotionRedemption` |

**Cele 8 intrări `order.paid` din `AuditLog` sunt sintetice**, produse de `scripts/verify-provisioning.py` (2026-10-22 20:03–20:17), care creează o comandă și o plătește prin `/api/webhooks/stripe/test` cu tokenul intern (`scripts/verify-provisioning.py:212-237`). Ordinele respective au fost șterse ulterior; cele 8 rânduri din `WebhookEvent` au rămas în starea `received`, cu `attempts=0` — scriptul le-a inserat, nu le-au procesat prin rută.

**Concluzia fermă: calea comercială nu a rulat niciodată cu bani. Niciun euro nu a intrat, niciun euro nu a ieșit, nicio factură nu a fost emisă, niciun abonament nu a fost creat. Singurul lucru care a fost „plătit" a fost o comandă marcată plătită de un script de test, cu o cheie de token intern, pe o instanță de test.**

### 7.3 Starea plăților în producție

```bash
$ curl -s -o /dev/null -w "%{http_code}\n" -X POST https://blipmade.com/api/orders/<id>/checkout
503
```

`api/src/services/stripe.ts:150-153` → `paymentsUnavailable()` → `AppError(503, 'payments_unavailable', ...)` (`stripe.ts:115`). `VERIFIED` (runtime)

Cele 5 comenzi rămase sunt, așadar, în stări terminale practice: `PENDING` și `AWAITING_PAYMENT` nu se mai pot transforma în `PAID` fără Stripe.

---

## 8. Defecte comerciale blocante de lansare

| # | Defect | Fișă | Clasă | Efect |
|---|---|---|---|---|
| **B1** | **Reducerea de promoție nu ajunge la Stripe și rupe checkout-ul.** `createCheckout` trimite `item.unitAmount` (nediscountuit) ca `unit_amount`; `order.total` este discountuit; `verifyAmount` compară `amount_total` cu `order.total` → mismatch → `FAILED` + buclă de reîncercări Stripe. | `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:188-196,218-228` | `CODE-INSPECTED` | Orice comandă cu cod de promoție eșuează la plată; clientul ar fi taxat cu prețul **fără reducere** |
| **B2** | **Prețul stocat al instanței poate fi diferit de configurație și nu este reconciliat niciodată.** Importul scrie `baseAmount` în loc de prețul configurației. | `api/src/routes/admin.ts:912` | `CODE-INSPECTED` + `VERIFIED` (DB) | Estimarea lunară a clientului (`api/src/routes/billing.ts:116`) e greșită; nicio alarmă |
| **B3** | **`applyUpgradeOrder()` nu verifică plata.** | `api/src/services/upgrades.ts:106-119` | `CODE-INSPECTED` | Latent azi (singurul apelant neplătit are `total=0`), dar funcția e o bombă cu ceas pentru orice apel nou |
| **B4** | **`renew()` fabrică facturi `PAID` fără încasare** când Stripe nu e live; în producția de azi condiția `!stripeLive()` e adevărată. | `api/src/services/billing.ts:248`, `:96-142` | `CODE-INSPECTED` | Dacă apare un singur abonament într-un mediu fără Stripe, sweep-ul scrie o factură plătită fictivă |
| **B5** | **Un `invoice.paid` ajuns înainte de `checkout.session.completed` este consumat ca procesat și nu mai e reluat** — factura nu se mai creează niciodată. | `api/src/routes/webhooks.ts:270-280`, `:395-399`, `:599-604` | `CODE-INSPECTED` | Pierdere definitivă a documentului de facturare |
| **B6** | **O comandă anulată poate fi plătită și onorată ulterior**; o comandă anulată consumă promoția. | `api/src/routes/orders.ts:150,165-178`; `api/src/services/stripe.ts:263-268` | `CODE-INSPECTED` | Clientul primește servicii pentru o comandă pe care o declară anulată; slotul de campanie e consumat |
| **B7** | **Nu există mecanism real de reînnoire local, și nu există plan anual.** Reînnoirea e delegată 100% Stripe; `YEARLY` nu e folosit nicăieri. | `api/src/services/stripe.ts:176`; `api/prisma/schema.prisma:209-212` | `NOT-IMPLEMENTED` (pentru YEARLY) / `CODE-INSPECTED` | Clientul nu are alternativă; un plan anual nu poate fi vândut |
| **B8** | **Nu există retenție a datelor la anulare.** Serverul Pterodactyl rămâne pe nod, fără termen, fără export. | `api/src/services/billing.ts` (withdraw); setare `auto_delete_cancelled_instances` absentă din DB | `VERIFIED` (DB: `Setting` = 0 rânduri) | Resurse ocupate, date ale clienților fără politica de ștergere |
| **B9** | **Câmpul `price.amount` nu spune că e în minor units**, iar convenția apare o singură dată în tot contractul. | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md:5,57,60,89` | `CODE-INSPECTED` | A produs deja o eroare de 100× în raportarea internă; risc similar pentru integrare |
| **B10** | **Un produs nou creat prin admin pornește cu `baseAmount = 0`** → gratuit, până când operatorul intră în ecranul de prețuri. | `api/src/routes/admin.ts:428,460`; `api/prisma/schema.prisma:259-273` | `CODE-INSPECTED` | Serviciu gratuit oferit accidental |
| **B11** | **Nu se poate edita sau dezactiva o promoție.** Există doar `GET` și `POST /admin/promotions`; niciun `PATCH`, niciun `DELETE`. | `api/src/routes/admin.ts:610-660`; `web/src/admin/Promotions.tsx` | `CODE-INSPECTED` | O campanie greșită nu poate fi oprită din interfață |
| **B12** | **Counterul afișat de operator nu este counterul aplicat.** Ecranul arată `promotion.usedCount` (incrementat doar la plată, `stripe.ts:266`), dar plafonul se aplică pe `countEffectiveRedemptions` (rezervări + plăți, `pricing.ts:148-163`). | `web/src/admin/Promotions.tsx:260,302`; `api/src/services/pricing.ts:148-163` | `CODE-INSPECTED` | Operatorul vede „3 / 50" când 49 sloturi sunt rezervate; descrierea ecranului („the real redemption count against the real cap") e falsă |

---

## 9. Recomandări în ordine

1. **Înainte de a activa plățile:** B1 (discountul trebuie să ajungă la Stripe — de exemplu, un singur `line_item` cu `unit_amount = order.total`, sau un `coupon`/discount pe sesiune), apoi B5 și B6.
2. **Închideți clasa de defecte de plată:** B3 (o verificare `order.status === 'PAID'` în `upgrades.ts:106`).
3. **Eliminați falsul din sweep:** B4 — fie `renew()` se elimină, fie devine explicit "do nothing but warn".
4. **Preț stocat = preț calculat:** B2 — corectați importul, apoi adăugați reconcilierea zilnică din 6.6.
5. **Taxă:** decizia CFO + ramură `tax` în `upsertInvoice` + `automatic_tax` în `createCheckout` dacă se decide.
6. **Clienți:** B9 (contract), B10 (implicitul `baseAmount`), B11 + B12 (promoții).
7. **Înainte de lansare publică:** B8 (retenție la anulare), B7 (plan anual sau decizie explicită de a nu-l oferi).

---

## 10. Ce n-am putut verifica

| Subiect | Status | Motiv | Pasul de deblocare sigur |
|---|---|---|---|
| Comportamentul real al webhook-ului Stripe cu o cheie reală | `BLOCKED` | Nu există cheie Stripe; nu am creat cont și nu am făcut apeluri Stripe | Crearea unui cont Stripe **de test**, în afara mediului de producție, și rularea unui flux complet pe un stack local |
| Comportamentul real al plății cu o promoție | `BLOCKED` | Checkout-ul răspunde 503 | Idem, plus crearea unei promoții pe mediul local |
| Regimul fiscal / TVA | `BLOCKED` | Nu există document în repo; nu inventez rată | Decizia CFO-ului |
| Comportamentul după 3 luni de la anulare | `BLOCKED` | Nu există instanțe anulate și nu există retenție implementată | Implementarea unei politici de retenție, apoi un test controlat |

Nu am făcut: nicio comandă, nicio plată, niciun apel Stripe, nicio scriere în DB, nicio modificare de cod în producție, nicio activare de test mode, nicio captură de ecran, nicio schimbare de configurație.
