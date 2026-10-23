# 05 — Promoții

**Data auditului:** 2026-10-23. **Audit READ-ONLY.**
**Sistemul de producție nu a fost modificat.** Nu s-a creat nicio promoție, nicio comandă, nicio plată, nicio scriere în DB.

---

## 0. Convenția unităților și starea actuală

> **Toate sumele sunt în unități minori întregi (EUR cents).** `149` = **€1.49** · `75` = **€0.75** · `74` = **€0.74**
> `api/src/lib/money.ts:2-3` · `api/src/services/pricing.ts:32-37` · `docs/API_CONTRACT.md:5`

**Starea de azi a campaniilor, în DB de producție (`VERIFIED`):**

```text
"Promotion"           0 rânduri
"PromotionRedemption" 0 rânduri
```

**Nicio promoție nu a existat vreodată pe platformă.** Codul promoțional este însă complet, testat unitar și legat de o campanie publică deja anunțată pe site (vezi §9).

---

## 1. Modelul de date

```text
api/prisma/schema.prisma:525-548
model Promotion {
  code           String        @unique
  type           PromotionType          // PERCENT | FIXED
  value          Int                     // basis points pentru PERCENT, minor units pentru FIXED
  maxRedemptions Int?                    // null = fără plafon
  maxPerUser     Int?                    // ← NICIODATĂ setabil, vezi §5.2
  usedCount      Int           @default(0)   ← incrementat doar la plată
  startsAt       DateTime?
  endsAt         DateTime?
  active         Boolean       @default(true)
  createdById    String?
}

api/prisma/schema.prisma:553-567
model PromotionRedemption {
  promotionId String
  userId      String
  orderId     String        @unique      ← o redempție per comandă
  amount      Int                       // reducerea, în minor units
}

api/prisma/schema.prisma:525-528   enum PromotionType { PERCENT  FIXED }
```

---

## 2. Tipurile de discount și aritmetica

```text
api/src/services/pricing.ts:266-276
export function applyPromotion(subtotal, promotion): number {
  if (!promotion) return 0;
  if (promotion.type === 'PERCENT') {
    // value is in basis points: 1000 = 10%.
    return Math.min(subtotal, normalizeAmount((subtotal * promotion.value) / 10_000));
  }
  return Math.min(subtotal, normalizeAmount(promotion.value));
}
```

| tip | unitatea lui `value` | exemplu | efect |
|---|---|---|---|
| `PERCENT` | **basis points** (1 bp = 0,01%) | `5000` = 50% | `round(subtotal × value / 10000)`, plafonat la `subtotal` |
| `FIXED` | **minor units** (cents) | `500` = €5.00 | `min(subtotal, value)` |

Trunchierea la `Math.min(subtotal, …)` este dublu protecție împreună cu `total = Math.max(0, subtotal - discount)` (`api/src/services/pricing.ts:324`). **Consecință: niciodată nu poate rezulta o sumă negativă, iar reducerea nu poate depăși subtotalul.**

Aritmetica reală pentru o campanie de 50% (`value = 5000`), calculată cu formula platformei:

```text
configurația minimă      subtotal 149 → discount round(149 × 5000/10000) = round(74.5) = 75 → total 74  = €0.74
configurația implicită   subtotal 172 → discount round(86.0)            = 86            → total 86  = €0.86
4 GB / 2 vCPU / 20 GB    subtotal 452 → discount round(226.0)           = 226           → total 226 = €2.26
```

`CODE-INSPECTED` (aritmetică derivată din `applyPromotion`; nu a fost executată, pentru că nu există nicio promoție în DB și n-am creat una).

**Atenție — `Math.round(74.5)` = 75:** o campanie de 50% pe o comandă de €1.49 dă **€0.74**, nu €0.745. Rotunjirea este la cent, în favoarea casei. Corect și previzibil.

---

## 3. Unde se aplică reducerea, server-side

```text
1. Client scrie codul în wizard           web/src/app/Deploy.tsx:572-577
2. Client cere cotă cu cod                web/src/app/Deploy.tsx:184-188  → POST /catalog/quote {promotionCode}
3. Server: buildQuote(items, promotionCode)          api/src/routes/catalog.ts:135
      → resolvePromotion(code)                        api/src/services/pricing.ts:165-192
      → applyPromotion(subtotal, record)              api/src/services/pricing.ts:315
      → total = max(0, subtotal - discount)            api/src/services/pricing.ts:324
4. Client creează comanda cu același cod   web/src/app/Deploy.tsx:261     → POST /orders {promotionCode}
5. Server: buildQuote(items, promotionCode, user.id) api/src/routes/orders.ts:72
      → Order.total = quote.total, Order.discount = quote.discount,
        Order.promotionId = quote.promotionRecord?.id   api/src/routes/orders.ts:78-83
6. Server: reservePromotion(...)                     api/src/routes/orders.ts:106-113
      → creează rândul PromotionRedemption (rezervare, nu consum)  api/src/services/pricing.ts:245-252
7. La plată: markOrderPaid → promotionRedeemedAt + usedCount++       api/src/services/stripe.ts:263-268
8. La anulare: releasePromotionReservation(orderId)                  api/src/routes/orders.ts:175
   sau sweep după 48h: releaseStalePromotionReservations()           api/src/services/billing.ts:274-291
```

### 3.1 Poate un client modifica suma după cotă?

**Nu.** Clientul trimite doar `items` și `promotionCode`; **nicio sumă** nu este acceptată din payload (`api/src/routes/orders.ts:69`, `api/src/routes/catalog.ts:132`). `Order.total`, `Order.discount`, `Order.promotionId` și `OrderItem.unitAmount` sunt toate scrise din calculul serverului (`api/src/routes/orders.ts:78-90`). `CODE-INSPECTED`

### 3.2 Singura abatere: reducerea nu ajunge la Stripe

```text
api/src/services/stripe.ts:175     unit_amount: item.unitAmount   ← NEDISCOUNTUIT, trimis către Stripe
api/src/routes/orders.ts:79        total: quote.total              ← DISCOUNTUIT, ce i-a fost arătat clientului
api/src/routes/webhooks.ts:192     if (amountTotal !== order.total) → mismatch
```

Cu `discount > 0`, `amount_total` (nediscountuit) ≠ `order.total` (discountuit) → comanda devine `FAILED`, se scrie `order.amount_mismatch`, iar evenimentul webhook rămâne `failed` și este reîncercat la nesfârșit (`api/src/routes/webhooks.ts:218-228`, `api/src/routes/webhooks.ts:599-604`). **În plus, clientul ar fi fost taxat cu prețul fără reducere.** `CODE-INSPECTED`

Numerele pentru cazul de 50% de mai sus, la comanda de €1.49:

```text
clientul vede   subtotal 149, discount 75, total 74   (€0.74)
Stripe ar cere  unit_amount 149                        (€1.49)
verifyAmount:   149 !== 74  →  FAILED
```

### 3.3 Cotele publice și cele de comandă nu aplică aceleași reguli

```text
api/src/routes/catalog.ts:135   buildQuote(body.items, body.promotionCode)        ← fără userId
api/src/routes/orders.ts:72     buildQuote(body.items, body.promotionCode, user.id) ← cu userId
```

`resolvePromotion` verifică plafonul per-cont **doar dacă primește `userId`** (`api/src/services/pricing.ts:185-190`: `if (promotion.maxPerUser !== null && userId)`). Prin urmare, în cota publică limita per-cont **nu se verifică**; ea se verifică doar la crearea comenzii. Astăzi este inofensiv (`maxPerUser` nu poate fi setat — §5.2), dar **devine un bug imediat ce o activați**: clientul ar vedea „codul se aplică", ar completa comanda și abia la final ar primi „This code has already been used on your account."

**Remediu:** `POST /catalog/quote` să primească userId (deja autentificat) și să folosească același `resolvePromotion` cu `userId`.

---

## 4. Stacking

**Nu există stacking, prin construcție, și nici o cale de a-l crea.**

- `Order.promotionId` este un singur scalar (`api/prisma/schema.prisma:365`); `Order.discount` este un singur număr.
- `PromotionRedemption.orderId` este `@unique` (`schema.prisma:559`): o comandă poate avea **cel mult o** redempție.
- `buildQuote` acceptă **un singur** `promotionCode` (`api/src/services/pricing.ts:299-331`).
- `reservePromotion` întoarce imediat dacă există deja o redempție pentru comandă (`api/src/services/pricing.ts:209-210`), deci **nici același cod nu poate fi aplicat de două ori aceleiași comenzi**.

**O promoție poate fi însă aplicată la comenzi nelimitate de același client**, pentru că `maxPerUser` nu poate fi setat (vezi §5.2).

---

## 5. Limitele, eligibilitatea și expirarea

### 5.1 Ce se verifică

```text
api/src/services/pricing.ts:165-192   resolvePromotion(code, userId)
  170  promotion = findUnique({ code: code.trim().toUpperCase() })   ← normalizare: spații + majuscule
  171  !promotion          → „This code is not valid."
  172  !promotion.active   → „This code is no longer active."
  173  startsAt > now      → „This code is not active yet."
  176  endsAt < now        → „This code has expired."
  179  maxRedemptions      → countEffectiveRedemptions(promotion.id) >= max  → „…reached its redemption limit."
  185  maxPerUser (dacă userId) → countEffectiveRedemptions(promotion.id, userId) >= max → „…already been used on your account."
```

**Ce NU se verifică:** produsul, categoria, suma minimă a comenzii, segmentul de clienți, numărul de instanțe deja deținute, vechimea contului. **Singura eligibilitate este temporală și globală.** `CODE-INSPECTED`

### 5.2 `maxPerUser` este cod mort

Coloana există (`schema.prisma:532`), logica de aplicare există (`pricing.ts:185-190`, `:228-243`), dar **nu există niciun scriitor**:

```text
grep -rn "maxPerUser" api/src web/src
  api/src/services/pricing.ts:185, 187, 228, 240     ← doar lectura
```

- `POST /admin/promotions` (`api/src/routes/admin.ts:630-639`) **nu acceptă** `maxPerUser` în corpul validat.
- Ecranul de administrare (`web/src/admin/Promotions.tsx:149-179`) **nu are câmp** pentru el.
- Prisma crează rândul cu `maxPerUser = null` (implicitul câmpului).

**Consecință: limita per-cont nu poate fi activată prin nicio interfață și nu poate fi activată nici măcar direct în DB fără o scriere manuală.** Iar copy-ul public promite tocmai asta (§9). `CODE-INSPECTED` + `VERIFIED` (DB: 0 promoții, deci valoarea nu e confirmabilă runtime)

### 5.3 Expirare

- `endsAt` este verificat la fiecare cotă (`pricing.ts:176-178`) — o campanie expirată încetează să se aplice imediat.
- **Nu există validare la creare că `startsAt < endsAt`** (`api/src/routes/admin.ts:636-637` acceptă orice două datetime-uri) → o campanie cu fereastră inversată este mereu invalidă, fără niciun avertisment.
- **`checkout.session.expired` nu este tratat** (`api/src/routes/webhooks.ts:395-396` — `default: break`) → o sesiune Stripe expirată lasă comanda în `AWAITING_PAYMENT` la nesfârșit, iar rezervarea de promoție rămâne ocupată până la sweep-ul de 48h.

### 5.4 Cum se numără consumul

```text
api/src/services/pricing.ts:148-163   countEffectiveRedemptions(promotionId, userId?)
  numără rândurile PromotionRedemption unde:
    - order.status IN ('PAID','FULFILLED')                    ← consumate
    - SAU order.status IN ('PENDING','AWAITING_PAYMENT')
      ȘI order.createdAt >= now − 48h                        ← rezervări încă valide
```

O rezervare ține slotul **48 de ore** (`PROMOTION_RESERVATION_MS`, `pricing.ts:141`), apoi sweep-ul o șterge (`api/src/services/billing.ts:274-291`). Designul e rezonabil: un checkout abandonat nu ține campania în brațe.

---

## 6. Atomicitatea counterului și cursa „ultima redempție"

### 6.1 Ce se incrementează și când

```text
api/src/services/stripe.ts:263-268
if (order.promotionId && !order.promotionRedeemedAt) {
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { promotionRedeemedAt: new Date() } }),
    prisma.promotion.update({ where: { id: order.promotionId }, data: { usedCount: { increment: 1 } } }),
  ]);
}
```

`usedCount` este incrementat **atomic** (tranzacție cu două declarații) și **o singură dată per comandă** (pătratul `!order.promotionRedeemedAt`).

### 6.2 Dar `usedCount` nu este counterul aplicat

| | `usedCount` | `countEffectiveRedemptions` |
|---|---|---|
| unde | `promotion.usedCount` | `prisma.promotionRedemption.count(...)` |
| când crește | **la plata** (`stripe.ts:266`) | la **rezervare** (`pricing.ts:245-252`) |
| cine îl aplică | nu plafonează nimic | **plafonul efectiv** (`pricing.ts:181`, `:223`) |
| ce arată operatorul | **da** (`web/src/admin/Promotions.tsx:260`, `:302`) | nu |

**Ecranul arată un counter care nu e cel aplicat.** Descrierea lui spune explicit „Codes with the real redemption count against the real cap. Nothing here is a simulated counter." (`web/src/admin/Promotions.tsx:108`) — afirmație **falsă**: `usedCount` numără doar plățile, iar plafonul se consumă la rezervare. Cu 49 de rezervări în vâjâial și 1 plată, ecranul arată „1 / 50" și, în realitate, 49 de sloturi sunt ocupate. `CODE-INSPECTED`

### 6.3 Cursa: două comenzi iau ultima redempție în același moment

```text
api/src/services/pricing.ts:208-253   reservePromotion()
  await prisma.$transaction(async (tx) => {
    existing = tx.promotionRedemption.findUnique({ where: { orderId } })   // idempotență per comandă
    if (existing) return;
    if (maxRedemptions !== null) {
      used = tx.promotionRedemption.count({ ... })                          // ← CITIRE
      if (used >= maxRedemptions) throw badRequest('…reached its redemption limit.');
    }
    if (maxPerUser !== null) { … }
    await tx.promotionRedemption.create({ … });                             // ← SCRIERE
  });
```

**Nu există niciun mecanism de serializare:** nici `SELECT … FOR UPDATE` pe rândul promoției, nici nivel de izolare `Serializable`, nici o constrângere unică pe `(promotionId, userId)`. Citirea și scrierea sunt separate de un alt CITIRE în aceeași tranzacție (`READ COMMITTED`, implicitul Postgres).

**Rezultat (`INFERRED`, din absența blocajelor de mai sus):** două tranzacții concurente pot amândouă să numere `N < max` și amândouă să insereze → **plafonul `maxRedemptions` este depășit cu numărul concurenților**. Pentru o campanie „primii 50 de clienți" cu 50% reducere, 51+ clienți pot primi reducerea.

Al doilea mod de depășire, **determinist**: rezervarea ține slotul 48 de ore (`pricing.ts:159`), dar dacă clientul plătește în ora 49, `markOrderPaid` transformă rezervarea în consum (`stripe.ts:263-268`) și slotul e ocupat **după ce fusese liberat** și, probabil, acordat altcuiva. `CODE-INSPECTED` + `INFERRED`

### 6.4 Remedii

1. `maxRedemptions` aplicat pe **rândul `Promotion`**, cu `UPDATE … SET used = used + 1 WHERE id = ? AND used < max` într-o singură instrucțiune condiționată — numărătoarea devine atomică prin construcție.
2. `maxPerUser` pe o constrângere/tabelă de tip „redempții per cont", aplicat la fel.
3. Reducerea rezervării la 48h → 15 min, sau marcarea rezervării ca „definitivă" la crearea sesiunii Stripe.

---

## 7. Poate o promoție să producă un preț negativ, să depășească 100% sau să fie aplicată de două ori?

| întrebare | răspuns | unde se blochează | clasă |
|---|---|---|---|
| **Preț negativ?** | **Nu.** Dublu plafon: `Math.min(subtotal, discount)` (`pricing.ts:273,275`) și `Math.max(0, subtotal - discount)` (`pricing.ts:324`). | `api/src/services/pricing.ts:273,275,324` | `CODE-INSPECTED` |
| **Reducere > 100%?** | **Nu.** Pentru `PERCENT`, serverul respinge `value > 10_000` la creare (`admin.ts:642`), iar `applyPromotion` plafonează la subtotal oricum. | `api/src/routes/admin.ts:642` + `pricing.ts:273` | `CODE-INSPECTED` |
| **Aplicată de două ori la aceeași comandă?** | **Nu.** `Order.promotionId` singular, `PromotionRedemption.orderId` `@unique`, `reservePromotion` iese imediat dacă există deja rândul. | `schema.prisma:365,559`; `pricing.ts:209-210` | `CODE-INSPECTED` |
| **O comandă gratuită (total 0)?** | **Da, posibil.** `FIXED` cu `value ≥ subtotal` → discount = subtotal → total = 0. Serverul nu plafonează `FIXED` la valoarea subtotalului, pentru că nu îl cunoaște la creare. | `pricing.ts:275` (clamp) + `admin.ts:634` (`value` doar ≥ 0) | `CODE-INSPECTED` |
| **Aceeași reducere pe comenzi nelimitate ale aceluiași client?** | **Da.** `maxPerUser` nu poate fi setat (§5.2), iar plafonul global poate fi `null` („Empty means no cap.", `Promotions.tsx:167`). | `admin.ts:635` (`maxRedemptions` nullable) + lipsa lui `maxPerUser` | `CODE-INSPECTED` |

---

## 8. Ce poate crea operatorul din interfața de administrare

### 8.1 Câmpurile disponibile

```text
web/src/admin/Promotions.tsx:122-214
  Code            (text, 2-40 caractere, transformat la majuscule)
  Type            (Percentage | Fixed amount)
  Value           (text, doar cifre; eticheta spune „basis points, 1000 = 10%" sau „cents")
  Redemption cap  (text, doar cifre; „Empty means no cap.")
  Starts at       (datetime-local, opțional)
  Ends at         (datetime-local, opțional)
  Active          (toggle)
```

### 8.2 Validarea reală

| strat | validare | fișă |
|---|---|---|
| client | cod ≥ 2 caractere; `value` și `cap` doar cifre | `Promotions.tsx:71-78` |
| server | `code`: 2-40 caractere, regex nespecificat, uppercased | `admin.ts:632` |
| server | `type`: `PERCENT \| FIXED` | `admin.ts:633` |
| server | `value`: întreg **≥ 0** | `admin.ts:634` |
| server | `maxRedemptions`: întreg **≥ 1** sau null | `admin.ts:635` |
| server | `PERCENT` cu `value > 10000` → respins | `admin.ts:642` |
| server | cod duplicat → conflict | `admin.ts:643-644` |

### 8.3 Poate produce o sumă negativă sau zero?

| caz | rezultat | clasă |
|---|---|---|
| `value = 0` (oricare tip) | promoție fără efect, acceptată (`value ≥ 0`) | `CODE-INSPECTED` |
| `FIXED` cu `value` mare | discount plafonat la subtotal → **total 0** → comandă gratuită | `CODE-INSPECTED` |
| `FIXED` cu `value` negativ | **respins** (`min(0)`) | `CODE-INSPECTED` |
| `PERCENT` cu `value > 10000` | **respins** cu mesaj clar | `CODE-INSPECTED` |
| `startsAt` după `endsAt` | **acceptat**, promoția e mereu invalidă | `CODE-INSPECTED` |
| `maxRedemptions` gol | acceptat = **fără plafon** | `CODE-INSPECTED` |
| cod cu spații | normalizat: `trim()` + `toUpperCase()` (`pricing.ts:170`, `admin.ts:632`) | `CODE-INSPECTED` |

### 8.4 Operațiuni lipsă

```text
api/src/routes/admin.ts:610-660
  GET  /admin/promotions     ← listare
  POST /admin/promotions     ← creare
  (nici PATCH, nici DELETE)
```

**O promoție creată nu poate fi modificată, dezactivată sau ștearsă din interfață.** Singura pârghie este `active: false`, disponibilă **la creare**, nu după. Codul promoției este `@unique` pe viață (`schema.prisma:527`), deci nici măcar nu poate fi refolosit pentru o campanie nouă cu același nume.

Pentru un operator singur, asta înseamnă: **o campanie cu data de expirare greșită sau cu o valoare greșită rămâne activă până când cineva intervine direct în DB** — iar singurele câmpuri care o opresc sunt `active` și `endsAt`, ambele setate o singură dată. `CODE-INSPECTED`

---

## 9. Ce conține catalogul acum — și ce promite pagina de start

```text
"Promotion"           0 rânduri      ← VERIFIED, DB producție
"PromotionRedemption" 0 rânduri      ← VERIFIED
```

În schimb, homepage-ul anunță o campanie:

```text
web/src/home/Catalog.tsx:202-213
  <Eyebrow>Founding users offer</Eyebrow>
  <h3>Your first deployment, for less.</h3>
  <p>Get 50% off your first month. Available for the first 50 eligible customers.</p>
  <Button to="/login">Claim at checkout</Button>
  …
  <p>Campaign proposal. The promotion engine is in place — a campaign with a limit and a code per account can be
  created from the admin area — but no campaign is running yet, so no discount is applied.</p>
```

Două probleme în acest copy, ambele verificabile:

1. **„a code per account can be created from the admin area"** — **fals.** `maxPerUser` nu poate fi setat nici din interfață, nici din API (§5.2). Promisiunea „disponibil pentru primii 50 de clienți **eligibili**" (una per cont) nu este implementabilă așa cum e scris. `CODE-INSPECTED`
2. **„50% off your first month"** — **nu este implementabil cu motorul actual.** Modelul `Promotion` nu are nicio noțiune de „prima perioadă" (`schema.prisma:525-548`); reducerea se aplică sumei comenzii, iar sesiunea Stripe se creează cu `recurring: { interval: 'month' }` și `unit_amount` **nediscountuit** (`api/src/services/stripe.ts:172-179`). În plus, `grep -rn "coupon\|Coupon\|trial" api/src` → **zero rezultate**: nu există niciun coupon Stripe, niciun trial. O reducere „doar pentru prima lună" ar cere fie un `coupon` cu `duration: 'once'`, fie altă construcție a sesiunii.

În plus, chiar dacă campania ar fi creată și codul ar funcționa, **clientul ar fi taxat cu prețul întreg** (§3.2) — și comanda ar eșua. `CODE-INSPECTED`

---

## 10. Politica de promoții sigură pentru un operator singur

Aceasta este o **politică**, nu o campanie. Designul campaniei (cod, segment, mesaj, buget) îi revine agentului de creștere.

### 10.1 Ce să activați

| element | decizie | motiv |
|---|---|---|
| Tipul discountului | **doar `PERCENT`** | `FIXED` produce dependență de valoarea subtotalului și poate duce la total 0; procentul are o valoare relativă stabilă când se schimbă tariful |
| Plafon de procent | **maxim 5000 bp (50%)** | plafon fix în cod, nu doar în UI; 50% e deja limita implicită pe care o asumă copy-ul site-ului |
| Cod | **un cod unic, creat o singură dată** | codul e `@unique` pe viață; nu există editare, deci codul trebuie ales definitiv |
| `maxRedemptions` | **obligatoriu, niciodată null** | „fără plafon" + „maxPerUser nefuncțional" = campanie nelimitată pe o platformă cu un singur operator |
| `maxPerUser` | **= 1**, după ce câmpul este adăugat la API și UI | altfel un client poate folosi codul pe oricâte comenzi |
| `startsAt` / `endsAt` | **ambele obligatorii** | o fereastră închisă e singura apărare practică împotriva „nu pot opri campania" |
| `active` | `true` la creare | — |

### 10.2 Ce să interzicăți

1. **Reducere de 100%** (`value = 10000`) și orice `FIXED` cu `value ≥ subtotal` — până când Stripe-ul primește reducerea, o comandă gratuită e o pierdere reală de cost de provisionare.
2. **Stacking** — deja imposibil; nu adăugați un al doilea câmp de cod.
3. **Reduceri pe comenzi de upgrade** — calea de upgrade (`api/src/services/upgrades.ts:66-98`) nu are câmp de promoție și `Stripe` folosește `mode: 'payment'`. Nu adăugați până când reducerile ajung la Stripe.
4. **Promoții recurente („prima lună gratuită", „50% permanent")** — nu există coupon Stripe, nu există trial, iar `recurring.unit_amount` e nediscountuit. Nu promiteți ce nu poate fi livrat.
5. **Câmpuri de eligibilitate care nu există** (produs, categorie, sumă minimă, „primul client", „primul abonament") — până când `Promotion` nu le are, copy-ul nu le poate promite.

### 10.3 Ce trebuie schimbat în cod înainte de a rula orice campanie

| # | schimbare | fișă | de ce |
|---|---|---|---|
| M1 | **Reducerea trebuie să ajungă la Stripe** | `api/src/services/stripe.ts:162-193` | altfel campania e o cursă cu eșec garantat și cu taxare greșită (§3.2) |
| M2 | **Adăugați `maxPerUser` în API și UI**, cu valoarea implicită 1 | `api/src/routes/admin.ts:630-639`; `web/src/admin/Promotions.tsx:149-179` | altfel „primii 50 eligibili" nu e limitat per cont |
| M3 | **Atomicizarea plafonului** (counter pe rândul `Promotion`, increment condiționat) | `api/src/services/pricing.ts:208-253` | altfel curse la limita campaniei (§6.3) |
| M4 | **`PATCH`/`DELETE` pentru promoții** (sau cel puțin `active` toggle) | `api/src/routes/admin.ts:610-660` | altfel o campanie greșită nu poate fi oprită (§8.4) |
| M5 | **Afișați counterul real** (`countEffectiveRedemptions`) în loc de `usedCount` | `api/src/routes/admin.ts:619`; `web/src/admin/Promotions.tsx:260,302` | altfel operatorul vede alt număr decât cel aplicat (§6.2) |
| M6 | **Validați `startsAt < endsAt`** și respingeți `value = 0` | `api/src/routes/admin.ts:630-642` | altfel promoții moarte sau fereastre inversate |
| M7 | **Cota publică să primească `userId`** | `api/src/routes/catalog.ts:135` | altfel clientul vede un cod valid pe care comanda îl refuză (§3.3) |
| M8 | **Tratați `checkout.session.expired`** → comanda `CANCELLED` + eliberarea rezervării | `api/src/routes/webhooks.ts:395-396` | altfel rezervări ocupate 48h după checkout abandonat |
| M9 | **Plafonați `FIXED` la o sumă maximă** (ex. cel mai mic subtotal din catalog) | `api/src/routes/admin.ts:642` | altfel `FIXED` poate produce total 0 |

### 10.4 Ce trebuie monitorat

- `countEffectiveRedemptions(promotionId)` vs `maxRedemptions` — zilnic, cu alertă la 80%.
- Comenzi `FAILED` cu `order.amount_mismatch` — **orice apariție înseamnă că M1 nu e gata**.
- Comenzi cu `total = 0` — orice apariție înseamnă că un `FIXED` prea mare a trecut.

---

## 11. Recapitularea defectelor

| # | defect | fișă | clasă | impact |
|---|---|---|---|---|
| **PR1** | Reducerea nu ajunge la Stripe → comanda eșuează la `verifyAmount`, iar clientul ar fi taxat cu prețul neredus | `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:192` | `CODE-INSPECTED` | **blocant** — nicio campanie nu poate rula |
| **PR2** | `maxPerUser` nu poate fi setat → campania nu e limitată per cont, în ciuda promise-ului public | `api/src/routes/admin.ts:630-639`; `web/src/admin/Promotions.tsx:149-179` | `CODE-INSPECTED` | **blocant** pentru „primii 50 eligibili" |
| **PR3** | Plafonul nu este aplicat atomic → curse la limită | `api/src/services/pricing.ts:208-253` | `CODE-INSPECTED` + `INFERRED` | **blocant** pentru o campanie cu buget fix |
| **PR4** | Nu există editare/dezactivare/ștergere a unei promoții | `api/src/routes/admin.ts:610-660` | `CODE-INSPECTED` | **blocant operațional** |
| **PR5** | Ecranul arată `usedCount`, plafonul se aplică pe `countEffectiveRedemptions`; descrierea ecranului mințește | `web/src/admin/Promotions.tsx:108,260,302` vs `api/src/services/pricing.ts:148-163` | `CODE-INSPECTED` | operatorul ia decizii greșite |
| **PR6** | `FIXED` fără plafon → poate produce o comandă cu total 0 | `api/src/routes/admin.ts:634`; `api/src/services/pricing.ts:275` | `CODE-INSPECTED` | pierdere de cost de provisionare |
| **PR7** | Cota publică nu verifică limita per cont | `api/src/routes/catalog.ts:135` vs `api/src/routes/orders.ts:72` | `CODE-INSPECTED` | clientul vede un cod valid, comanda e refuzată |
| **PR8** | Nu se validează `startsAt < endsAt`; `value = 0` e acceptat | `api/src/routes/admin.ts:636-637,634` | `CODE-INSPECTED` | campanii moarte, fereastre inversate |
| **PR9** | `checkout.session.expired` netratat → rezervare ținută 48h | `api/src/routes/webhooks.ts:395-396` | `CODE-INSPECTED` | sloturi de campanie blocate |
| **PR10** | Copy-ul public promite „50% off your first month" și „code per account", niciunul realizabil | `web/src/home/Catalog.tsx:206,210-213` | `CODE-INSPECTED` | **promisiune publică neonorată** dacă se rulează campania azi |
| **PR11** | Simulatorul de marketing arată un preț de 50% care nu e ce l-ar taxa clientul (€1.49 vs €0.74) | `web/src/home/Catalog.tsx:202-209` | `CODE-INSPECTED` | neconcordanță între marketing și realitate |
| **PR12** | `PromotionRedemption.amount` e scris, dar nu e citit nicăieri | `api/prisma/schema.prisma:561-562`; `api/src/services/pricing.ts:250` | `CODE-INSPECTED` | nu e o problemă, dar e o câmp mort care dă impresia unui audit trail al reducerilor |

---

## 12. Ce n-am putut verifica

| Subiect | Status | Motiv | Pasul de deblocare sigur |
|---|---|---|---|
| Comportamentul unei promoții reale end-to-end | `BLOCKED` | Nu există cheie Stripe; checkout-ul răspunde 503; n-am creat promoții | Stack local + cheie Stripe de test + o promoție de test creată **doar** acolo |
| Dacă Stripe acceptă o reducere pe o sesiune cu `mode: 'subscription'` fără coupon | `BLOCKED` | Nu am făcut apeluri Stripe și nu pot crea cont | Cont Stripe de test, în afara producției |
| Concurența reală la `reservePromotion` | `INFERRED` (nu `VERIFIED`) | Ar necesita două comenzi simultane pe producție — interzis | Test local cu două cereri paralele pe o promoție de test |
| Politica fiscală a reducerilor (TVA pe discount) | `BLOCKED` | Nu există decizie fiscală și nu există logică de taxă | Decizia CFO-ului |

Nu am făcut: nicio promoție, nicio comandă, nicio plată, niciun apel Stripe, nicio scriere în DB, nicio modificare de cod în producție.
