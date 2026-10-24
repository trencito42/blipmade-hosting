# PHASE 13 — Retest independent al reparațiilor din faza 2

**Rol:** retester independent. Nu am implementat niciuna dintre reparațiile verificate.
Am citit codul, am rulat suita, am încercat ocolirile pe o stivă izolată proprie și am
revertit fiecare reparare într-o copie de lucru separată pentru a demonstra că testele
de regresie eșuează fără ea.

---

## 1. Metadate

| Câmp | Valoare |
|---|---|
| Data retestului | 2026-10-23 (America/New_York), sesiune inițiată 21:42 |
| Commit sub test | `a4fb004` — *„Let a corrected payment reach an order that was marked as failed"*. **Vârful ramurii s-a mutat în timpul retestului la `888a274`** (două commituri de documente de audit, adăugate de un terț); `git diff a4fb004..888a274 -- api/src api/tests web/src` este **gol**, deci codul măsurat e identic cu cel de la vârful curent |
| Bază de comparație | `e990776` (rama `main`) |
| Diff verificat | `git diff e990776..a4fb004` (54 fișiere; 10 fișiere de cod sursă + 5 fișiere de test) |
| Depozit | Git: `debian@10.77.0.13:/opt/blipmade` (VM 103), ramă `remediation/phase-2-critical-fixes`, arbore curat la început și la sfârșit (singurul fișier neversionat la final, `audit/post-remediation/_raw/phase14-proof-unpatched.txt`, **nu e al meu** — aparține unui auditor din faza 14 și l-am lăsat neatins) |
| Stivă de test | **Instanță proprie**, izolată: API `127.0.0.1:3102` (NODE_ENV=test) și API `127.0.0.1:3103` (NODE_ENV=production), ambele pe baza `retest_test` creată de mine |
| Baza de date | `retest_test` (creată de mine: `CREATE DATABASE retest_test OWNER blipmade`), suita rulează exclusiv pe aceasta |
| Stiva comună 30003/3101 | **neatininsă** — verificată la final, încă activă (`ss -ltnp`) |
| Producție | neatinsă: `blipmade` nu a fost scris; `blipmade_test` (comună) nu a fost trunchiată |

### Commande executate (esențiale)

```
# stare repo + diff
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && git status --short && git log --oneline -8 && git diff --stat e990776..a4fb004'

# bază de date proprie
ssh ... 'docker exec blipmade-postgres-1 psql -U blipmade -d postgres -c "CREATE DATABASE retest_test OWNER blipmade;"'

# suita completă, pe baza proprie
ssh ... 'cd /opt/blipmade && TEST_DB_NAME=retest_test bash scripts/run-tests.sh'

# copie de lucru separată pentru proba de revertire
ssh ... 'cd /opt/blipmade && git archive a4fb004 | tar -x -C /tmp/rt13/verify'
ssh ... 'cd /tmp/rt13/verify/api && npx prisma generate && npx tsc -p tsconfig.json'
```

### Dovezi brute păstrate

| Fișier | Ce conține |
|---|---|
| `_raw/rt13-diff-money.txt` | diff-ul complet pentru `stripe.ts`, `pricing.ts`, `webhooks.ts`, `orders.ts` |
| `_raw/rt13-diff-access.txt` | diff-ul complet pentru `admin.ts`, `permissions.ts`, `plugins/auth.ts`, `env.ts`, `routes/auth.ts`, `Billing.tsx`, `Deploy.tsx`, `api.ts`, `catalog.ts` |
| `_raw/rt13-diff-tests.txt` | diff-ul celor două fișiere de teste existente modificate |
| `_raw/rt13-bypass-run1.txt` | ieșirea brută a bateriei de ocolire, secțiunile A–E |
| `_raw/rt13-bypass-run2.txt` | ieșirea brută a bateriei de ocolire, secțiunile F–K |
| `_raw/rt13-revert-results.tgz` | arhivă cu ieșirea fiecărei probe de revertire și a celor două rulări de suita completă cu o reparație deconectată |
| `_raw/rt13-revert/` | aceeași ieșire, **extractedă ca text simplu**, câte un fișier pe caz: `FIN-P1-01.txt`, `FIN-P2-03.txt`, `BE-09-exact-base.txt`, `CJ-P1-01.txt`, `CJ-P1-02.txt`, `ADM-P1-01.txt`, `ADM-P1-02.txt`, `REGR-01.txt`, `SEC-P1-01.txt`, `SEC-P1-02.txt`, plus `FIN-P1-01-full-suite.txt` și `SEC-P1-02-full-suite.txt` |

**Două cazuri din arhivă au un rezultat „gol" și trebuie citite cu atenție:**
- `BE-09.txt` — **prima mea încercare de revertare, incompletă**: am eliminat doar blocul nou, fără linia de la bază `if (typeof amountTotal !== 'number') return null;`, așa că comparația `amountTotal !== order.total` refuza oricum `undefined` și testul **trecea oricum**. Concluzia ar fi fost greșită; cazul e **înlocuit** de `BE-09-exact-base.txt`, unde funcția e readusă la corpul exact de la bază — acolo testul **cade corect**.
- `SEC-P1-02.txt` — **rezultatul legitim**: cu `keyGenerator` scos din cele 6 rute, testul **trece**. Asta e chiar constatarea, nu o eroare de metodă: **reparația `SEC-P1-02` nu are niciun test care s-o apere** (confirmat și de rularea de suita completă: 366/366 verde).

Rezultatele probelor de limită de rată (§4.10, ocolirile 37–41) sunt citate **inline**, în textul raportului: rularea a fost făcută pe o instanță separată, cu `TRUSTED_PROXIES` modificat, iar ieșirea brută nu a fost arhivată separat.

---

## 2. Metodologie și standardul de dovadă

Pentru fiecare reparare am cerut patru lucruri și le-am înregistrate separat:

1. **Codul există și face ce se pretinde.** Am citit eu însu-mi diff-ul
   (`git diff e990776..a4fb004 -- <fișier>`), nu mesajele de commit. Am citit apoi
   funcția în întregime în arborele de la HEAD, nu doar fragmentul modificat.
2. **Regula se aplică pe server.** Pentru acces am încercat să o ocolesc: rol greșit,
   ca obiectiv contul propriu, permisiune lipsă, apel direct al endpointului, cerere
   scrisă de mână cu `curl`. O interfață care interzice ceva și o API care permite
   este un defect, nu o trecere.
3. **Testul de regresie este un test de regresie real.** L-am deschis și l-am întrebat:
   *ar eșua dacă repararea ar fi revertită?* Pentru cele patru reparări de bani și
   acces am **revertit efectiv** repararea într-o copie de lucru separată
   (`/tmp/rt13/verify`, obținută cu `git archive a4fb004`), am rulat testul și am capturat
   ieșirea înainte și după. Arborele de pe ramă nu a fost atins.
4. **Nu s-a stricat nimic altceva.** Suita completă rulează pe baza mea proprie.

**O observație care a schimbat metoda.** Stiva de revizie de pe `3101` rulează cod
**vechi**: procesul a pornit la `00:28:14`, iar cele patru commituri de reparație
(`8d138bb`…`3b7e98d`, `b44c0f5`, `a4fb004`) sunt din `01:18`–`01:42`. Am căutat în
`/tmp/api-check/dist` fiecare simbol nou și **nu există niciunul**
(`DEAD_ORDER_STATUSES`, `permissionsNotHeld`, `assertMayActOnAccount`,
`isProtectedSettingKey`, `rateLimitKey`, `writeOrderInvoice`, `orders/:id/confirm` →
0 potriviri fiecare). Prin urmare **nu am folosit stiva 3101/30003 pentru probele de
oclire**: am construit din ramă o instanță proprie (3102/3103) pe baza mea. Orice
concluzie obținută pe 3101 ar fi fost despre codul vechi, nu despre ramă.

---

## 3. Tabelul verdictului

| ID | Reparare | Verificată? | Cod (file:line) | Test de regresie (file:line) | Testul eșuează fără reparare? | Ce am încercat și a eșuat (bypass) | Observații |
|---|---|---|---|---|---|---|---|
| **FIN-P1-01** | O comandă anulată/rambursată nu mai poate deveni `PAID` | **PARȚIAL** | `api/src/services/stripe.ts:286` (lista), `:308-312` (garda) | `api/tests/phase2-payment-safety.test.ts:134-150`, `:437-448` | **DA** — garda eliminată → testul eșuează | **NU — ocolirea A TREZIT**: `cancel` → `POST /orders/:id/checkout` → eveniment de plată → `PAID`, 1 instanță, 1 factură | Garda din `markOrderPaid` este reală, dar **incompletă**: ruta de checkout (`orders.ts:159-203`) resuscitează comanda anulată/rambursată în `AWAITING_PAYMENT` **înainte** ca garda să o vadă. Defectul original (P0, `FIN-P1-01`+`FIN-P2-04`) nu este închis. |
| **FIN-P2-03** | Perioada prețului trece din cotare în comandă | **DA** | `api/src/services/pricing.ts:418-424`; `api/src/routes/orders.ts:74,78,104`; `api/src/routes/catalog.ts:179,186,188`; `web/src/app/Deploy.tsx:339` | `api/tests/phase2-payment-safety.test.ts:198-281` | **DA** — cotarea și comanda anuale revertite → testele eșuează | Cotare `YEARLY` → 1788; comandă `YEARLY` → 1788 cu `config.period=YEARLY`; cotare fără perioadă → 149 | Mecanismul e corect și complet pe API. **Rest:** interfața nu trimite niciodată o perioadă (`Deploy.tsx:264-271`), deci planul anual nu e accesibil din UI (vezi `RT-P2-02`). |
| **BE-09** | Un eveniment de plată fără sumă este refuzat | **DA** | `api/src/routes/webhooks.ts:308-318` | `api/tests/phase2-payment-safety.test.ts:167-181` | **DA** — `verifyAmount` readus la codul exact de la bază (`e990776`) → testul eșuează | Eveniment fără `amount_total` → HTTP 500, comanda `FAILED`, 0 instanțe, rând `failed` în registru | Verificat și că un eveniment fără sumă **replayed** nu plătește o comandă `FAILED`. |
| **CJ-P1-01** | Pagina de facturare citește `checkout`, arată starea și confirmă plata | **DA** | `api/src/routes/orders.ts:219-249`; `web/src/app/Billing.tsx:87-92,120-138,176-199` | `api/tests/phase2-payment-safety.test.ts:285-358` | **DA** — ruta eliminată → testul eșuează | Comandă străină → 404; comandă anulată → 409; **în producție → 404** (ruta nu există); `amount` în corpul cererii → ignorat | Idempotent la a doua confirmare (`alreadyPaid: true`), o singură instanță. |
| **CJ-P1-02** | Comanda plătită este facturată cu suma încasată | **DA** | `api/src/services/stripe.ts:404`, `:428-464` | `api/tests/phase2-payment-safety.test.ts:362-405` | **DA** — apelul `writeOrderInvoice` eliminat → testul eșuează | Factură `BM-INV-*`, `PAID`, `total=149` egal cu suma colectată; al doilea eveniment → **o singură** factură | Factura se scrie cu `order.total`, nu cu `params.amount`; este echivalent doar datorită verificării din `BE-09` (vezi `RT-P2-03`). |
| **ADM-P1-01** | Un personal nu mai acordă permisiuni pe care nu le are și nu-și rescrie lista | **DA** | `api/src/routes/admin.ts:1109-1125`; `api/src/lib/permissions.ts:52-55` | `api/tests/phase2-access-control.test.ts:95-146` | **DA** — blocul revertit la forma de la bază → testul eșuează | 6 ocoliri, toate refuzate (403) | Singura reparare completă, fără rezervări. |
| **ADM-P1-02** | Un cont `ADMIN` poate fi acționat doar de un alt `ADMIN` | **PARȚIAL** | `api/src/plugins/auth.ts:332-337`; `api/src/routes/admin.ts:297,328,350,1242,1280` | `api/tests/phase2-access-control.test.ts:162-253` | **DA** — apelurile `assertMayActOnAccount` eliminate → testul eșuează | 4 rute de scriere protejate (suspendare, cheie de panou ×2, retry instanță, import); **4 ocoliri au trecut**: contul de personal e încă suspendabil, fișa administratorului e încă lizibilă, ruta de rambursare nu e acoperită | Constatarea originală spunea „un cont de **administrator sau de personal**"; jumătatea „de personal" rămâne deschisă (vezi `RT-P1-01`). |
| **REGR-01** | Setările interne nu sunt nici citibile, nici scriibile prin `/admin/settings` | **DA** | `api/src/routes/admin.ts:39-52`, `:1187-1207`, `:1214-1231` | `api/tests/phase2-access-control.test.ts:285-337` | **DA** — filtrul și blocul de refuz eliminate → testul eșuează | `GET` → doar `support_email`; `PUT` cu cheie protejată → 403; `PUT` mixt (normal + protejată) → **403 și cheia normală NU se scrie**; varianta de capital (`CANCELLED_INSTANCE_RETENTION`) creează o cheie nouă, **nu atinge înregistrarea reală** | Sigur. Singura observație: filtrul e pe prefixul `internal.` și pe cheia exactă — cheile viitoare trebuie să respecte convenția. |
| **SEC-P1-01** | Cookie-ul de sesiune e `Secure` în producție | **DA** | `api/src/plugins/auth.ts:58-64` | `api/tests/phase2-session-security.test.ts:107-131` | **DA** — `if (env.isProduction) return true;` eliminat → testul eșuează | Cookie în producție: `HttpOnly; Secure; SameSite=Lax`; în test: fără `Secure`; operatorul poate coborî cu `COOKIE_SECURE=false` | Corect, dar **doar pentru sesiune și CSRF**; `env.cookieSecure` (derivat din `APP_ORIGIN`) rămâne un mecanism paralel, nefolosit aici. |
| **SEC-P1-02** | Contorul limitării de rată nu mai e unul global | **PARȚIAL** | `api/src/plugins/auth.ts:83-97`; `api/src/routes/auth.ts:204,240,305,323,342,370` | `api/tests/phase2-session-security.test.ts:150-175` | **NU — testul trece și cu repararea deconectată** (cheia `keyGenerator` scoasă din cele 6 rute → suita rămâne verde) | Autentificare: 12 conturi diferite, proxy neîncredincios → niciun 429 mutual; **dar** `POST /catalog/quote` (fără `keyGenerator`) → 121 cereri → 429 și **un alt vizitator primește tot 429** | Reparația ajunge **numai la cele 6 rute de autentificare**. Celelalte 6 rute cu limită de rată (`catalog.ts:170`, `orders.ts:64`, `settings.ts:304,365,413,569`) păstrează `request.ip` (vezi `RT-P1-02`). |

**Legendă:** `DA` = repararea e reală, probată pe server și acoperită de un test de regresie care chiar eșuează fără ea.
`PARȚIAL` = codul există și funcționează în cazul pe care îl descrie, dar **nu închide** constatarea așa cum e formulată sau lasă un ocoli deschis.
`NU` = repararea nu e dovedită.

---

## 4. Detaliu, reparare cu reparare

### 4.1 `FIN-P1-01` — o comandă anulată sau rambursată nu mai poate deveni `PAID` — **PARȚIAL**

**Ce se pretinde.** „O comandă anulată sau rambursată nu mai poate deveni `PAID` și să primească infrastructură. Garda e în `markOrderPaid`."

**Ce face codul, în realitate.** `api/src/services/stripe.ts:286` definește o **listă de interdicții**:

```ts
const DEAD_ORDER_STATUSES = ['CANCELLED', 'REFUNDED'] as const;
```

iar `:308-312` aplică interdicția înainte de orice scriere:

```ts
if (!alreadyPaid && (DEAD_ORDER_STATUSES as readonly string[]).includes(order.status)) {
  throw conflict(`Order ${order.number} cannot be paid: its status is ${order.status}.`);
}
```

Garda este reală și se aplică **în serviciu**, nu în interfață — deci orice apelator (webhook, `POST /orders/:id/checkout`, `POST /orders/:id/confirm`) trece prin ea. Am confirmat și istoricul: în acest commit, `501277b` introdusese o listă de **admitere** (`PAYABLE_ORDER_STATUSES = ['PENDING','AWAITING_PAYMENT']`), iar `a4fb004` (ultimul commit al ramurii) a înlocuit-o cu lista de **interdicție** de mai sus, ca să rămână deschisă calea de recuperare a operatorului pentru o comandă `FAILED`. Îngustarea este documentată în cod (`stripe.ts:280-285`) și îmi apare **corectă în substanță**: am verificat mai jos că verificarea sumei rulează și pentru o comandă `FAILED`.

**Ce am încercat și ce am obținut.** Am construit comanda prin API, am anulat-o prin `POST /api/orders/:id/cancel` (204), apoi am apelat `POST /api/orders/:id/checkout` — ruta pe care constatarea originală o indica (`orders.ts:152-196`).

```
order created            : cmvlqz7wh0005dxokm3stuvyl total= 149
POST /orders/:id/cancel  : 204
state after cancel       : CANCELLED|149|f|0|0|0
POST /orders/:id/checkout: 200 {"url":"http://127.0.0.1:30103/app/billing?checkout=test_cs_cmvlqz7wh0005dxokm3stuvyl", ...}
state after checkout     : AWAITING_PAYMENT|149|f|0|0|0
webhook payment          : 200 {"received":true,"eventId":"evt_rt13_...","deferred":false}
FINAL state              : PAID|149|t|1|1|1
```

(coloanele stării: `status|total|paidAt|instante|facturi|abonamente`)

**Comanda anulată a ajuns `PAID`, cu o instanță, o factură și un abonament.** Același lucru pentru o comandă `REFUNDED`:

```
state (REFUNDED)         : REFUNDED|149|f|0|0|0
POST /orders/:id/checkout: 200
state after checkout     : AWAITING_PAYMENT|149|f|0|0|0
webhook payment          : 200
FINAL state              : PAID|149|t|1|1|1
```

**Cauza.** `api/src/routes/orders.ts:159-203` nu are **nicio** verificare de stare înainte de a face checkout: verifică doar `PAID`/`FULFILLED` (`:167`), apoi la `:199` scrie `status: 'AWAITING_PAYMENT'`. Așadar, garda din `markOrderPaid` vede deja o comandă `AWAITING_PAYMENT` — nu mai vede `CANCELLED` sau `REFUNDED`. Comanda este **resuscitată înainte de poartă**.

Am verificat că nu e o regresie introdusă de ramură: `git show e990776:api/src/routes/orders.ts` arată exact aceeași rută, fără gardă. Deci **defectul preexista și rămâne deschis**; ramura a adăugat o gardă care nu acoperă calea pe care constatarea o indica.

**Testul de regresie.** `api/tests/phase2-payment-safety.test.ts:134-150` („refuses to pay a dead order through the service that pays") apelează `markOrderPaid` direct pe o comandă `CANCELLED` și cere o excepție. Am eliminat garda din copia de lucru și testul **a eșuat**:

```
FAIL  tests/phase2-payment-safety.test.ts > the state of an order when the money arrives > refuses to pay a dead order through the service that pays
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
```

Deci testul **este** un test de regresie real — dar acoperă **serviciul**, nu calea de checkout pe care constatarea o descrie. Testul `:97-116` („never pays a cancelled order and provisions nothing") trimite direct evenimentul pe o comandă `CANCELLED` și ar fi trecut **și înaintea** reparării (ramura webhook-ului interceptează deja `CANCELLED`/`REFUNDED` la `webhooks.ts:390`).

**Verdict: PARȚIAL.** Garda e reală și e dovedită de un test de regresie care chiar eșuează fără ea. Dar constatarea, așa cum e formulată („nu mai poate deveni `PAID` și să primească infrastructură”), **nu este închisă**: există o ocolire de un pas, prin endpointul de checkout, care duce la `PAID` + infrastructură. Pentru o comandă deja rambursată, platforma ar deține simultan rambursarea și o factură `PAID` nouă.

---

### 4.2 `FIN-P2-03` — perioada prețului trece din cotare în comandă — **DA**

**Ce face codul.** Cotarea (`catalog.ts:179`) acceptă `period`, îl transmite către `buildQuote` (`catalog.ts:186`) și îl întoarce în răspuns (`catalog.ts:188`). Comanda (`orders.ts:74,78`) acceptă `period` și îl transmite la `buildQuote` (`pricing.ts:418-424` → `priceItems(items, period)`, `pricing.ts:152-172`). Perioada ajunge și în configurația liniei de comandă (`orders.ts:104`: `period: item.price.period`). Interfața trimite perioada cotării la comandă (`web/src/app/Deploy.tsx:339`).

**Ce am măsurat pe instanța proprie:**

```
quote MONTHLY  -> 200 period=MONTHLY total=149
order MONTHLY  -> 201 total=149   config.period=MONTHLY
quote YEARLY   -> 200 period=YEARLY total=1788
order YEARLY   -> 201 total=1788  config.period=YEARLY
```

Exact suma din enunțul constatării: cotarea anuală de **1788** produce acum o comandă de **1788**, nu de 149.

**Testul de regresie.** `phase2-payment-safety.test.ts:198-281` — patru cazuri (cotare anuală, comandă anuală, sumă lunară păstrată, refuzul unei cotări anuale pentru un produs fără preț anual). Am revertat propagarea (cotarea și comanda) în copia de lucru:

```
FAIL  tests/phase2-payment-safety.test.ts > the period of the price travels with the order > quotes a yearly plan with the yearly price
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
```

**Observație care nu blochează verdictul.** Interfața nu poate ajunge în scenariul anual: `web/src/app/Deploy.tsx:264-271` trimite cotarea **fără** câmpul `period`, deci serverul aplică implicit `MONTHLY` (măsurat: `quote WITHOUT period -> 200 period=MONTHLY total=149`). Planul anual e, așadar, accesibil doar prin API. Mecanismul reparat e corect; **funcția de alegere a perioadei în UI nu există** (vezi `RT-P2-02`).

**Verdict: DA** — repararea e reală, se aplică pe server și e acoperită de un test de regresie care eșuează fără ea.

---

### 4.3 `BE-09` — un eveniment de plată fără sumă este refuzat — **DA**

**Ce face codul.** `api/src/routes/webhooks.ts:308-318`:

```ts
if (typeof amountTotal !== 'number' || !Number.isFinite(amountTotal)) {
  return 'The payment event does not carry the amount that was collected.';
}
```

**Ce am încercat.** Eveniment fără `amount_total`, prin portul intern de test al webhook-ului:

```
webhook (no amount)      : 500 {"received":false,"reason":"The event could not be processed and will be retried."}
state                    : FAILED|149|f|0|0|0
ledger row               : failed|The payment event does not carry the amount that was collected.
```

Comanda nu e plătită, nu are instanță, iar evenimentul rămâne în registru ca `failed`, cu motivul. Corect.

**Testul de regresie — cu o corectură de metodă, importantă.** Prima mea încercare de a reverifica a fost incompletă: am eliminat doar blocul nou, dar în codul de la bază exista o linie `if (typeof amountTotal !== 'number') return null;` care lăsa evenimentul să treacă. Fără ea, comparația `amountTotal !== order.total` ar fi refuzat oricum `undefined`, deci testul trecea oricum — și ar fi o concluzie greșită. Am refăcut proba readucând `verifyAmount` la **corpul exact de la bază** (`e990776`):

```
FAIL  tests/phase2-payment-safety.test.ts > the state of an order when the money arrives > keeps a payment event that carries no amount from being applied
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
```

Testul **este** un test de regresie real.

**Verdict: DA.**

---

### 4.4 `CJ-P1-01` — confirmarea plății prin poarta locală — **DA**

**Ce face codul.** `api/src/routes/orders.ts:219-249` adaugă `POST /api/orders/:id/confirm`, care: refuză dacă poarta locală nu e în uz (`stripeTestGateway()` → `notFound`, `orders.ts:222-224`); caută comanda **cu `userId`** (`:225`, deci alt client → `notFound`); refuză orice stare diferită de `PENDING`/`AWAITING_PAYMENT` (`:232-234`, `conflict`); apelează `markOrderPaid({ orderId, amount: order.total })` — **suma vine din comandă, nu din cerere** — apoi `fulfilOrder`. Interfața (`web/src/app/Billing.tsx:87-92`) citește parametrul `checkout`, deduce comanda din identificatorul sesiunii locale (`test_cs_<orderId>`) și confirmă o singură dată (`:120-138`); pentru `checkout=cancelled` afișează „Payment cancelled" (`:88`, `:176-186`).

**Ce am încercat:**

```
confirm own order        : 200 {"order":{...,"status":"PAID","total":149},"alreadyPaid":false}
state                    : PAID|149|t|1|1|1
confirm twice            : 200 {...,"alreadyPaid":true}
state                    : PAID|149|t|1|1|1
confirm with amount body : 200 {...,"total":149}          <- suma trimisă de client, ignorată
confirm foreign order    : 404
confirm on PRODUCTION    : 404 {"error":{"code":"not_found","message":"This order cannot be confirmed here."}}
cancel then confirm      : 409 {"code":"conflict","message":"This order is CANCELLED and cannot be confirmed."}
```

Pe instanța de **producție** (`NODE_ENV=production`) ruta **nu există** — un client nu poate marca o comandă ca plătită din browser pe un site live. Idempotența e corectă: a doua confirmare întoarce `alreadyPaid: true` și **nu** creează a doua instanță.

**Testul de regresie.** `phase2-payment-safety.test.ts:285-358` (patru cazuri). Am eliminat ruta din copia de lucru:

```
FAIL  tests/phase2-payment-safety.test.ts > the customer comes back from the payment > confirms the payment through the local gateway and provisions the order
 Tests  1 failed | 17 skipped (18)
```

**Verdict: DA.**

---

### 4.5 `CJ-P1-02` — comanda plătită este facturată cu suma încasată — **DA**

**Ce face codul.** `api/src/services/stripe.ts:404` apelează `writeOrderInvoice(order, subscriptions, params)` (`:428-464`), care scrie o factură `PAID` cu `amount = total = order.total`, `stripeInvoiceId: null`, `periodStart/periodEnd` din provider sau, prin lipsă, o lună.

**Ce am încercat:**

```
webhook payment          : 200
state                    : PAID|149|t|1|1|1
invoice row              : BM-INV-00011|PAID|149|149|EUR|
invoices after 2 events  : 1
```

O singură factură, cu suma cotată și cu suma efectiv încasată (în acest flux cele două sunt egale **datorită** verificării din `BE-09`).

**Observație.** Factura se scrie cu `order.total`, nu cu `params.amount` (suma raportată de provider). Cele două sunt egale doar pentru că `verifyAmount` a refuzat orice abatere înainte de `markOrderPaid`. În calea `POST /orders/:id/confirm` suma transmisă este tot `order.total` (`orders.ts:236`), deci nici acolo nu apare o abatere. Diferența ar apărea doar dacă un alt apelator ar apela `markOrderPaid` cu o sumă diferită — nu există unul astfel de apelator în cod (`webhooks.ts:407`, `orders.ts:175`, `orders.ts:236`), dar nici `markOrderPaid` nu verifică suma primită. E o **fragilitate**, nu un defect demonstrat (vezi `RT-P2-03`).

**Testul de regresie.** `phase2-payment-safety.test.ts:362-405`. Am eliminat apelul la `writeOrderInvoice`:

```
FAIL  tests/phase2-payment-safety.test.ts > the customer is invoiced for what they paid > writes an invoice with the sum of the order when the payment arrives
 Tests  1 failed | 17 skipped (18)
```

**Verdict: DA.**

---

### 4.6 `ADM-P1-01` — personalul nu acordă permisiuni pe care nu le are și nu-și rescrie lista — **DA**

**Ce face codul.** `api/src/routes/admin.ts:1109-1125` (pentru un actor care nu e `ADMIN`): interzice modificarea **propriei** liste (`:1110-1112`), interzice modificarea listei unui `ADMIN` (`:1113-1115`), calculează `permissionsNotHeld(actor.role, actor.permissions, body.permissions)` (`api/src/lib/permissions.ts:52-55`) și refuză dacă lista cerută conține permisiuni pe care actorul nu le are (`:1116-1119`), și păstrează interdicția de a acorda întreaga listă (`:1122-1124`). Totul e în **ruta de server**, nu în interfață.

**Ce am încercat (6 ocoliri, toate refuzate):**

| Ocolire | Răspuns |
|---|---|
| acordă `audit.read`, pe care nu-l are | `403 — You can only grant permissions that you hold yourself. These are not yours: audit.read.` |
| acordă `customers.write`, pe care-l are | `200` — lista țintă devine `{customers.write}` |
| își rescrie propria listă | `403 — You cannot change your own permissions. Only an administrator can do that.` |
| își rescrie propria listă + `title` în același corp | `403` (aceeași) |
| își acordă rolul `ADMIN` | `403 — Only an administrator can change the role of a staff member.` |
| acordă rolul `ADMIN` unui alt membru | `403` — rolul a rămas `STAFF` |
| acordă întreaga listă (21 de 21) | `403` |
| `ADMIN` acordă orice | `200` — lista țintă devine `{customers.read, settings.write}` |

Nicio escaladare.

**Testul de regresie.** `phase2-access-control.test.ts:95-146`. Am readus blocul la forma de la bază (doar interdicția pentru `ADMIN` și interdicția listei complete):

```
FAIL  tests/phase2-access-control.test.ts > the permission list of a staff member > refuses to grant a permission that the staff member does not hold
 Tests  1 failed | 13 skipped (14)
```

**Verdict: DA** — singura reparare completă, fără rezervări.

---

### 4.7 `ADM-P1-02` — un cont `ADMIN` poate fi acționat doar de un alt `ADMIN` — **PARȚIAL**

**Ce face codul.** `api/src/plugins/auth.ts:332-337`:

```ts
export function assertMayActOnAccount(actor: AuthUser, targetRole: string): void {
  if (actor.role === 'ADMIN') return;
  if (targetRole === 'ADMIN') throw forbidden('Only an administrator can act on the account of an administrator.');
}
```

apelată în `admin.ts` la `:297` (stocarea cheii de panou), `:328` (ștergerea cheii de panou), `:350` (suspendare), `:1242` (retry instanță), `:1280` (import instanță).

**Ce am încercat și a eșuat:**

```
suspend an ADMIN         : 403 {"code":"forbidden","message":"Only an administrator can act on the account of an administrator."}
forget the panel key     : 403 (aceeași)
store a panel key        : 403 (aceeași)
import an instance for ADMIN: 400 {"code":"bad_request","message":"Only an administrator can import a server."}
suspend a CUSTOMER       : 200
```

**Ce a trecut (4 ocoliri):**

```
READ the ADMIN record    : 200 {"customer":{"id":"...","email":"admin.retest@example.test","role":"admin", ...}}
staff suspends another STAFF member: 200 {"customer":{...,"suspended":true}}
the staff member is suspended now: t
staff changes the TITLE of the ADMIN: 200 {"staff":{"userId":"...","role":"admin",...}}
```

- **Citirea** contului de administrator (`GET /api/admin/customers/:id`) e permisă unui personal cu `customers.read`. Garda e, prin construcția ei, doar pe **scrieri** — și comentariul din cod o spune explicit („the rule is checked on the routes that write to the account of a customer").
- **Suspendarea unui cont de personal** de către un alt personal rămâne permisă. Constatarea originală (`ADMIN-FUNCTIONALITY.md`, `ADM-P1-02`) spunea „`customers.write` poate suspenda un cont de **administrator sau de personal**". Jumătatea „de personal" **nu** e reparată.
- **Titlul** unui administrator poate fi schimbat de un personal (constatarea `ADM-P3-04`, severitate mică, deja marcată „STILL BROKEN" în registru — nu e o regresie, dar n-a fost atinsă).
- **Ruta de rambursare** (`POST /admin/orders/:id/refund`) **nu** apelează `assertMayActOnAccount`: un personal cu `orders.write` poate, pe un site live, să ramburseze comanda unui administrator. Nu am putut să o reproducă local: ruta refuză înainte de orice scriere când `stripeLive()` e fals (`admin.ts:468-470`), iar stiva izolată nu are cheie Stripe. Am confirmat prin cod că garda lipsește; **limitare de mediu, semnalată explicit**.

**Testul de regresie.** `phase2-access-control.test.ts:162-253`. Am eliminat apelurile la `assertMayActOnAccount`:

```
FAIL  tests/phase2-access-control.test.ts > the account of an administrator > refuses to suspend an administrator when the actor is not an administrator
 Tests  1 failed | 13 skipped (14)
```

**Verdict: PARȚIAL** — clauza din enunț („un cont cu rolul `ADMIN` poate fi acționat doar de un alt `ADMIN`") e adevărată pentru cele cinci rute de scriere acoperite, dar **constatarea originală** (administrator *sau personal*) e acoperită doar pe jumătate, iar citirea contului de administrator rămâne deschisă.

---

### 4.8 `REGR-01` — setările interne nu sunt citibile sau scriibile prin `/admin/settings` — **DA**

**Ce face codul.** `admin.ts:39-52` definește cheile protejate: `cancelled_instance_retention` și orice cheie cu prefixul `internal.`. `GET /admin/settings` (`:1187-1207`) filtrează la nivel de interogare (`notIn` + `not: { startsWith }`); `PUT /admin/settings` (`:1214-1231`) **refuză întreaga cerere** dacă conține o cheie protejată.

**Ce am încercat** (tabelul `Setting` curățat și repopulat cu cele trei chei):

```
GET /admin/settings       : 200
body                     : {"settings":{"support_email":"help@blipmade.test"}}
leaks the retention record: false
leaks an internal. key   : false
leaks the customer export: false

PUT retention record     : 403 {"message":"These settings belong to the platform and cannot be changed here: cancelled_instance_retention."}
retention value now      : {"customers": [{"email": "leak@blipmade.test", "orders": [{"total": 1999}]}]}   <- neatinsă
PUT internal key         : 403
PUT mixed (normal+internal): 403   <- și support_email NU s-a scris ("help@blipmade.test")
PUT case-variant key     : 200   <- creează o cheie nouă; înregistrarea reală neatinsă
PUT an ordinary key      : 200
```

Observație de metodă: la o primă rulare a mea, un control automat a raportat „scurgere" — era **fals pozitiv**, produs de propria mea cheie `CANCELLED_INSTANCE_RETENTION` creată în testul de variantă de capital. După curățarea tabelului, controlul repetat e negativ. Raportez astfel cum a rămas.

**Testul de regresie.** `phase2-access-control.test.ts:285-337`. Am eliminat filtrul de citire:

```
FAIL  tests/phase2-access-control.test.ts > the settings of the platform > does not show the internal settings
 Tests  1 failed | 13 skipped (14)
```

**Verdict: DA.**

---

### 4.9 `SEC-P1-01` — cookie-ul de sesiune e `Secure` în producție — **DA**

**Ce face codul.** `api/src/plugins/auth.ts:58-64`:

```ts
if (env.COOKIE_SECURE === 'true') return true;
if (env.COOKIE_SECURE === 'false') return false;
if (env.isProduction) return true;      // <- linia nouă
return request.protocol === 'https';
```

`resolveCookieSecure` e folosit pentru cookie-ul de sesiune (`auth.ts:233`) și pentru cel CSRF (`plugins/csrf.ts:49`). `env.isProduction` vine din `NODE_ENV` (`env.ts:127`).

**Ce am încercat** (login real, cookie real):

```
PRODUCTION cookie        : bm_session=<redacted>; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax
  has Secure             : true
TEST cookie              : bm_session=<redacted>; Path=/; Expires=...; HttpOnly; SameSite=Lax
  has Secure             : false
```

Cererea a venit pe **HTTP simplu** de la un proxy neîncredincios — exact cazul pe care-l descrie comentariul din cod — și cookie-ul a fost totuși marcat `Secure`.

**Testul de regresie.** `phase2-session-security.test.ts:107-131`. Am eliminat linia `if (env.isProduction) return true;`:

```
FAIL  tests/phase2-session-security.test.ts > the Secure attribute of the session cookie > is set in production when the request arrives over plain HTTP
 Tests  1 failed | 6 skipped (7)
```

**Verdict: DA.**

---

### 4.10 `SEC-P1-02` — contorul limitării de rată nu mai e unul global — **PARȚIAL**

**Ce face codul.** `api/src/plugins/auth.ts:83-97` introduce `rateLimitKey(request)`: dacă adresa clientului a fost rezolvată printr-un proxy încredincios, cheia e adresa clientului; dacă nu, cheia e **conexiunea** (`adresa:portul`). `api/src/routes/auth.ts` aplică `keyGenerator: addressKey` pe **6 rute**: `:204` (register), `:240` (login), `:305` (resend-verification), `:323` (forgot-password), `:342` (reset-password), `:370` (enroll-admin).

**Ce am încercat.** Pe o instanță cu `TRUSTED_PROXIES=10.99.99.99` (deci peer-ul `127.0.0.1` **nu** e încredincios):

```
K1 connection #1, 12 different accounts: [401,401,401,401,401,401,401,401,401,401,401,401]
K1 connection #2 (new socket), new account: 401
```

Niciun vizitator nu blochează alt vizitator pe rutele de autentificare: contorul de cont rămâne per cont, iar cel de adresă nu e unul global. **Pe aceste rute, repararea funcționează.**

**Dar aceeași instanță, pe o rută fără `keyGenerator`:**

```
K2 visitor A quote        : 200
K2 quote limit reached after 121 requests -> 429
a DIFFERENT visitor (new client, new connection): 429     <- blocat de vizitatorul A
```

Aceeași rută, pe instanța al cărei peer **este** în lista de proxy-uri încredincioase:

```
K3 quote limit reached after 121 requests -> 429
a DIFFERENT visitor (the peer is trusted, so the client is known): 200
```

Deci diferența nu e în reparare, ci în lista `TRUSTED_PROXIES`. Rutele **fără** `keyGenerator` — `catalog.ts:170` (`POST /catalog/quote`), `orders.ts:64` (`POST /orders`), `settings.ts:304,365,413,569` — păstrează cheia globală `request.ip` (`app.ts:80`), care devine adresa proxy-ului când proxy-ul nu e în listă. `POST /catalog/quote` e un endpoint **anonim**; `POST /orders` e limitat înainte de autentificare.

**Testul de regresie — aici e problema.** Am deconectat repararea de comportament, scoțând `keyGenerator: addressKey` din cele 6 rute, și am rulat fișierul de test al fazei:

```
@@NOTE removed 6 keyGenerator uses from api/src/routes/auth.ts (the SEC-P1-02 wiring)
@@CASE SEC-P1-02 exit=0
@@RESULT SEC-P1-02 TEST-STILL-PASSES (NOT A REGRESSION TEST)
 Test Files  1 passed (1)
      Tests  3 passed | 4 skipped (7)
```

Testele din `phase2-session-security.test.ts:150-175` verifică **funția `rateLimitKey` în izolare**, cu cereri fabricate; nu verifică niciodată că rutele o folosesc. Deci **nu există niciun test care să apere această reparație**.

**Verdict: PARȚIAL** — comportamentul pe rutele de autentificare e corect și dovedit live, dar (a) nu e acoperit de un test de regresie, (b) celelalte 6 rute cu limită de rată nu au fost atinse și rămân cu contorul global.

---

## 5. Încercări de ocolire

Toate cererile au fost scrise de mână, pe instanța proprie construită din ramă
(`127.0.0.1:3102`, `NODE_ENV=test`) și pe o instanță de producție (`127.0.0.1:3103`,
`NODE_ENV=production`), pe baza `retest_test`. Ieșirea brută e în
`_raw/rt13-bypass-run1.txt`, `_raw/rt13-bypass-run2.txt`.

| # | Reparare | Ce am încercat | Răspuns | Verdict al ocolirii |
|---|---|---|---|---|
| 1 | FIN-P1-01 | `POST /api/orders/:id/cancel` apoi `POST /api/orders/:id/checkout` pe comanda anulată | checkout **200**, comanda devine `AWAITING_PAYMENT` | **OCOLIRE REUȘITĂ** |
| 2 | FIN-P1-01 | idem, apoi eveniment de plată cu suma comenzii | eveniment **200**, comanda `PAID`, 1 instanță, 1 factură, 1 abonament | **OCOLIRE REUȘITĂ — comanda anulată e onorată** |
| 3 | FIN-P1-01 | comanda forțată `REFUNDED`, apoi checkout + eveniment | **200** → `PAID`, 1 instanță | **OCOLIRE REUȘITĂ** |
| 4 | FIN-P1-01 | comanda rambursată **și deja onorată** (1 instanță), apoi checkout + eveniment | checkout 200, eveniment **500**, comanda rămâne `PAID`, facturi: 1, instanțe: 1 | ocolire parțială: nu se dublează infrastructura, dar comanda rambursată revine `PAID` și rămâne facturată `PAID` |
| 5 | FIN-P1-01 | `POST /api/orders/:id/confirm` pe o comandă anulată | **409** `conflict — This order is CANCELLED and cannot be confirmed.` | refuzat corect |
| 6 | BE-09 | eveniment de plată fără `amount_total` | **500**, comanda `FAILED`, 0 instanțe, registru `failed` | refuzat corect |
| 7 | BE-09 / garda îngustată | eveniment fără sumă, apoi **replay** al evenimentului | replay 200 `ok:false`, comanda rămâne `FAILED` | refuzat corect — **îngustarea nu redeschide gaura** |
| 8 | BE-09 / garda îngustată | eveniment cu sumă greșită (order FAILED), apoi replay **fără corecție** | replay `ok:false`, comanda rămâne `FAILED`, 0 instanțe | refuzat corect |
| 9 | BE-09 / garda îngustată | eveniment cu sumă greșită, operatorul corectează comanda, replay | replay `ok:true`, comanda `PAID`, 1 instanță, 1 factură, 1 abonament | **corect prin design** — calea de recuperare a operatorului rămâne deschisă |
| 10 | CJ-P1-01 | `POST /api/orders/:id/confirm` pe comanda altui client | **404** | refuzat corect |
| 11 | CJ-P1-01 | aceeași rută pe instanța de **producție** | **404** `This order cannot be confirmed here.` | refuzat corect — ruta nu există pe un site live |
| 12 | CJ-P1-01 | corp cu `"amount": 1` la confirmare | **200**, totalul rămâne 149 — suma din corp e ignorată | refuzat corect |
| 13 | CJ-P1-01 | confirmare de două ori | a doua: **200** `alreadyPaid: true`, 1 instanță | idempotent |
| 14 | CJ-P1-02 | al doilea eveniment de plată pentru aceeași comandă | 1 factură în total | fără dublare |
| 15 | ADM-P1-01 | personal acordă `audit.read` (nu-l are) | **403** `You can only grant permissions that you hold yourself...` | refuzat corect |
| 16 | ADM-P1-01 | personal își rescrie propria listă | **403** `You cannot change your own permissions.` | refuzat corect |
| 17 | ADM-P1-01 | propriul id ca țintă + `title` în același corp | **403** | refuzat corect |
| 18 | ADM-P1-01 | personal își acordă `role: "ADMIN"` | **403** `Only an administrator can change the role...`; rolul a rămas `STAFF` | refuzat corect |
| 19 | ADM-P1-01 | personal acordă `role: "ADMIN"` altui membru | **403**; rolul a rămas `STAFF` | refuzat corect |
| 20 | ADM-P1-01 | personal acordă lista completă (21/21) | **403** | refuzat corect |
| 21 | ADM-P1-02 | personal suspendă un `ADMIN` | **403** | refuzat corect |
| 22 | ADM-P1-02 | personal șterge cheia de panou a unui `ADMIN` | **403** | refuzat corect |
| 23 | ADM-P1-02 | personal stochează cheia de panou a unui `ADMIN` | **403** | refuzat corect |
| 24 | ADM-P1-02 | personal reia o instanță a unui `ADMIN` | **403** (măsurat în testul ramurii) | refuzat corect |
| 25 | ADM-P1-02 | personal importă o instanță pentru un `ADMIN` | **400** `Only an administrator can import a server.` | refuzat (ruta e oricum doar de administrator) |
| 26 | ADM-P1-02 | personal **citește** fișa unui `ADMIN` | **200** cu email, rol, `pterodactylUserId` | **OCOLIRE REUȘITĂ (citire)** |
| 27 | ADM-P1-02 | personal **suspendă un alt membru de personal** | **200**, membrul e suspendat | **OCOLIRE REUȘITĂ** — constatarea originală spunea „administrator **sau de personal**" |
| 28 | ADM-P1-02 | personal schimbă **titlul** unui `ADMIN` | **200** | **OCOLIRE REUȘITĂ** (`ADM-P3-04`, severitate mică, deja deschisă) |
| 29 | ADM-P1-02 | personal rambursează comanda unui `ADMIN` | **neverificabil local** — ruta refuză înainte de orice scriere când `stripeLive()` e fals (`admin.ts:468-470`); stiva izolată nu are cheie Stripe. **Din cod: garda lipsește** de pe această rută** | **neverificat — limitare de mediu** |
| 30 | REGR-01 | `GET /admin/settings` cu cheile interne populate | **200** `{"settings":{"support_email":"help@blipmade.test"}}` — fără înregistrarea de retenție, fără cheie `internal.`, fără exportul clienților | refuzat corect |
| 31 | REGR-01 | `PUT /admin/settings` cu `cancelled_instance_retention` | **403**, înregistrarea neatinsă | refuzat corect |
| 32 | REGR-01 | `PUT /admin/settings` cu `internal.order.sequence` | **403**, valoarea a rămas 42 | refuzat corect |
| 33 | REGR-01 | `PUT /admin/settings` cu **o cheie normală și una protejată** | **403**, iar cheia normală **nu** s-a scris | refuzat corect — cererea întreagă e refuzată |
| 34 | REGR-01 | `PUT /admin/settings` cu `CANCELLED_INSTANCE_RETENTION` (doar capitalizare diferită) | **200** — creează o cheie nouă; **înregistrarea reală e neatinsă** | fără impact asupra înregistrării reale |
| 35 | SEC-P1-01 | login pe instanța de producție, cerere pe HTTP simplu de la proxy neîncredincios | cookie `HttpOnly; Secure; SameSite=Lax` | corect |
| 36 | SEC-P1-01 | login pe instanța de test | cookie fără `Secure` | corect (nu e producție) |
| 37 | SEC-P1-02 | 12 logări cu **12 conturi diferite**, proxy neîncredincios | toate `401`, niciun `429` mutual | **corect pe rutele de autentificare** |
| 38 | SEC-P1-02 | contorul limitării pe un cont, de la adrese diferite | `429` la a 9-a încercare, contul e blocat | contorul de cont funcționează |
| 39 | SEC-P1-02 | alt cont, altă adresă, în timp ce primul e blocat | `401` — nu e blocat | contorul de cont nu se extinde |
| 40 | SEC-P1-02 | 121 cotări cu proxy neîncredincios, apoi un vizitator complet diferit | **429** pentru vizitatorul diferit | **OCOLIRE REUȘITĂ — contorul global rămâne pe rutele fără `keyGenerator`** |
| 41 | SEC-P1-02 | aceeași rută, cu peer-ul în lista de proxy-uri încredincioase | după 121 cereri → 429, **vizitator diferit → 200** | comportamentul corect depinde de `TRUSTED_PROXIES` |

---

## 6. Teste schimbate — judecata mea

Două fișiere de teste existente au fost modificate pe ramă. Le-am citit pe amândouă, înainte și după
(`git diff e990776..a4fb004 -- api/tests/webhooks.test.ts api/tests/admin-staff-permissions.test.ts`,
text integral în `_raw/rt13-diff-tests.txt`).

### 6.1 `api/tests/webhooks.test.ts` — **modificare onestă, intenția păstrată**

**Ce s-a schimbat.** Doar **șase** evenimente de plată au primit câmpul `amount`, cu valoarea **totalului propriu al comenzii**:

```diff
   const webhook = makeClient(app);
-  const event = { id: 'evt_test_duplicate', type: 'checkout.session.completed', orderId, subscriptionId: 'sub_dup' };
+  const event = { id: 'evt_test_duplicate', type: 'checkout.session.completed', orderId, subscriptionId: 'sub_dup', amount: orderResponse.body.order.total };
```

plus patru cazuri identice (`evt_test_multi`, `evt_test_quantity`, `evt_test_payment`, `evt_test_order`,
`evt_test_order_2`). S-a adăugat și un comentariu în capul fișierului:

```ts
/**
 * The events of this file carry the sum that was collected.
 *
 * A payment event without an amount cannot be compared with the order, so it
 * is refused: a check that lets the missing amount through is not a check.
 */
```

**Testele pe care mi s-a cerut să le judec — nu au fost atinse:**

```diff
   it('refuses a payment that does not match the order and keeps the event for a replay', async () => {
     ...
     const response = await webhook.request('POST', '/api/webhooks/stripe/test', {
       id: 'evt_test_mismatch',
       type: 'checkout.session.completed',
       orderId,
       amount: 9999,
     }, internal);
     expect(response.status).toBe(500);
     expect(event?.status).toBe('failed');
     expect(event?.error).toBeTruthy();
     expect(instances).toHaveLength(0);
```

și

```diff
   it('replays a failed event', async () => {
     ...
     await webhook.request('POST', '/api/webhooks/stripe/test', {
       id: 'evt_test_replay', ..., amount: 9999,
     }, internal);
     await prisma.order.update({ where: { id: orderId }, data: { total: 9999 } });
     const replay = await webhook.request('POST', '/api/webhooks/stripe/replay', { eventId: 'evt_test_replay' }, internal);
     expect(replay.status).toBe(200);
     expect(event?.status).toBe('processed');
     expect(instances).toHaveLength(1);
```

Am verificat în fișierul actual de la HEAD (`_raw` și sursa locală): **ambele teste trimit și azi `amount: 9999`**, care nu e suma comenzii, și amândouă își păstrează toate aserțiunile. Primul dovedește în continuare că o plată care nu corespunde comenzii e refuzată **și** că evenimentul e păstrat pentru reluare; al doilea dovedește în continuare calea de recuperare (corectarea comenzii + reluare din registru → eveniment `processed`, o singură instanță).

**Judecata mea.** Argumentul lead-ului — „un eveniment de plată fără sumă nu poate fi comparat cu comanda, deci vechea verificare (care-l lăsa să treacă) era exact defectul `BE-09`" — este **corect din punctul de vedere al contractului**: după reparaare, un eveniment fără sumă **trebuie** respins, deci un test care trimite un asemenea eveniment și așteaptă succes ar fi un test care cere explicit comportamentul vechi. Modificarea este **de adaptare la un contract nou**, nu de slăbire: suma introdusă este suma reală a comenzii (deci evenimentul e realist și verificabil), iar testele noi au **mai multe** aserțiuni, nu mai puține. Niciun test nu a fost slăbit, eliminat sau transformat într-un `expect(true)`. Singurul lucru pierdut e **acoperirea implicită** a căii „eveniment fără sumă", care nu mai e dorită; în schimb, un test nou și explicit o acoperă (`phase2-payment-safety.test.ts:167-181`), iar acesta **eșuează** când `verifyAmount` e readus la codul de la bază (probat în §4.3).

**Concluzie: modificare onestă.** Nu e o regresie ascunsă.

### 6.2 `api/tests/admin-staff-permissions.test.ts` — **modificare onestă, cu o observație**

```diff
   it('lets a staff member with staff.write change the permissions of another staff member', async () => {
-    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
+    // The staff member may only hand out the permissions that it holds
+    // itself, so it holds the two permissions it hands out.
+    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write', 'customers.read', 'tickets.read']);
     const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);
     const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: ['customers.read', 'tickets.read'] });
```

**Ce a rămas în test:** același nume, același țel, aceeași acțiune (un personal schimbă lista **altui** personal), aceleași aserțiuni (200 + lista țintă devine cea cerută). S-a schimbat doar **precondiția**: actorul trebuie să aibă permisiunile pe care le înmânează — exact regula nouă.

**Judecata mea.** Testul original afirma, implicit, „un personal cu `staff.write` poate acorda orice permisiune oricărui personal". Sub regula nouă, asta e intenționat fals, deci **fixture-ul trebuia adaptat**; altfel testul ar cere un comportament pe care reparația îl interzice. Modificarea e documentată în comentariu, păstrează intenția testului („un personal poate schimba lista altui personal”) și **nu ascunde** nicio regresie: regula nouă e acoperită separat, în `phase2-access-control.test.ts:95-146`, cu trei cazuri dedicate — inclusiv cazul pozitiv „lets a staff member grant a permission that it holds itself" (`:126-134`), care e **mai strict** decât testul original.

**Concluzie: modificare onestă.** Singura observație: testul original și cel nou se suprapun parțial; mentinerea ambilor e însă justificată — unul e testul de comportament al editorului de personal, celălalt e testul de **regulă**.

### 6.3 Un fișier de test **nou** care nu-și are locul în ramă

`api/tests/zz-probe3.test.ts` (62 de linii, adăugat de `a4fb004`) e **scaffolding de depanare**: `console.log('T1 DELIVERY', ...)`, `console.log('T2 LEDGER', ...)`, un caz care se termină cu `expect(true).toBe(true)` și un `expect(delivery.status).toBe(200)` fără nicio aserțiune despre platformă. Nu verifică nimic despre reparările fazei. E în branch-ul sub test și rulează în suita completă. Nu e o regresie, dar e gunoi într-un branch destinat certificării — și e exact tipul de test pe care un auditor nu trebuie să-l numere drept acoperire. (Vezi `RT-P3-01`.)

---

## 7. Defecte rămase sau noi

Numerotare proprie, `RT-P1-xx` / `RT-P2-xx` / `RT-P3-xx`. Severități: **P1 = ridicată**,
**P2 = medie**, **P3 = mică / informativă**.

### `RT-P1-01` — P1 (critică) — Comanda anulată sau rambursată poate fi resuscitată prin checkout și onorată

**Stare:** **defect preexistent, NE închis** de `FIN-P1-01` / `FIN-P2-04`.
**Dovezi:**
- `api/src/routes/orders.ts:159-203` — ruta de checkout verifică doar `PAID`/`FULFILLED` (`:167`) și scrie `status: 'AWAITING_PAYMENT'` (`:199`), fără nicio verificare de stare moartă.
- `api/src/services/stripe.ts:308-312` — garda se aplică, dar vede deja `AWAITING_PAYMENT`.
- Măsurat: `cancel` → `POST /api/orders/:id/checkout` (200) → eveniment de plată (200) → **`PAID`, 1 instanță, 1 factură, 1 abonament**.
- Măsurat, identic, pentru o comandă `REFUNDED`.
- `git show e990776:api/src/routes/orders.ts` — aceeași rută, fără gardă: **nu e regresia ramurii, e o gașă pe care ramura nu a închis-o**.
- Constatarea din registru (`NEW-FINDINGS.md`, rândurile `FIN-P1-01` **P0/Critical** și `FIN-P2-04`) indica **explicit** `api/src/routes/orders.ts:152-196` / `:160,167` drept calea de resuscitare — adică exact ruta pe care ramura nu a atins-o.

**Impact:** un client care își anulează comanda (sau al cărui administrator o rambursează) poate relua checkout-ul și poate obține infrastructură pentru o comandă pe care platforma o consideră moartă. Pentru o comandă rambursată, platforma ar deține simultan rambursarea **și** o factură `PAID` nouă (`BM-INV-*`), cu o stare de comandă `PAID` care contrazice rambursarea.

**Ce ar închide:** o verificare de stare în `POST /orders/:id/checkout` (cel puțin `CANCELLED`/`REFUNDED`/`FAILED`), sau o listă de **admitere** (`PENDING`/`AWAITING_PAYMENT`) aplicată **înainte** de rescrierea stării — exact forma pe care `501277b` o avea și pe care `a4fb004` a înlocuit-o.

### `RT-P1-02` — P1 (ridicată) — Jumătatea „de personal" a constatării `ADM-P1-02` nu e reparată

**Stare:** reparare parțială.
**Dovezi:**
- Constatarea originală (`ADMIN-FUNCTIONALITY.md` → `ADM-P1-02`, preluată în `NEW-FINDINGS.md`): „`customers.write` poate suspenda un cont de **administrator sau de personal**".
- `api/src/plugins/auth.ts:332-337` — garda se declanșează **numai** pentru `targetRole === 'ADMIN'`.
- Măsurat: personal cu `customers.write` suspendă un alt membru de personal → **200**, contul e suspendat.

**Impact:** un personal poate bloca accesul unui alt personal, ceea ce era jumătate din constatarea originală.

### `RT-P2-01` — P2 (medie) — Contorul limitării de rată rămâne global pe șase rute, și niciun test nu apără reparația

**Stare:** lacună de acoperire + lacună de aplicare.
**Dovezi:**
- `api/src/routes/auth.ts:204,240,305,323,342,370` — `keyGenerator: addressKey` pe **doar 6** rute.
- `api/src/app.ts:80` — cheia globală rămâne `request.ip`; rutele fără `keyGenerator` o folosesc: `api/src/routes/catalog.ts:170` (`POST /catalog/quote`, **anonim**), `api/src/routes/orders.ts:64` (`POST /orders`, limitat **înainte** de autentificare), `api/src/routes/settings.ts:304,365,413,569`.
- Măsurat (proxy neîncredincios): 121 cotări → 429, iar **un vizitator complet diferit** primește tot 429. Pe instanța al cărei peer e în `TRUSTED_PROXIES`, același experiment dă 200 pentru vizitatorul diferit. Diferența e **exclusiv** lista de proxy-uri încredincioase.
- **Niciun test nu apără repararea:** cu `keyGenerator` scos din cele 6 rute, `phase2-session-security.test.ts` **trece în continuare** (`Tests 3 passed | 4 skipped`), pentru că testele din `:150-175` verifică funcția `rateLimitKey` în izolare, cu cereri fabricate, și nu verifică niciodată că rutele o folosesc.

**Impact (condiționat):** când proxy-ul din fața API-ului nu e în `TRUSTED_PROXIES`, un vizitator anonim poate epuiza limita de cotare (120/min) sau de comandă (30/10 min) pentru **toți** ceilalți vizitatori. Expunerea reală depinde de configurația operatorului: `compose.api.yml` folosește implicit `TRUSTED_PROXIES=127.0.0.1,::1,172.16.0.0/12`, deci containerul web e încredincios în configurația implicită. Ramura a documentat riscul în `api/src/env.ts` (`:98-110`), dar nu a aplicat cheia nouă și rutelor rămase.

### `RT-P2-02` — P2 (medie) — Planul anual nu e accesibil din interfață

**Dovezi:** `web/src/app/Deploy.tsx:264-271` trimite cotarea **fără** câmpul `period`; serverul aplică implicit `MONTHLY` (`api/src/routes/catalog.ts:179`). Măsurat: `quote WITHOUT period -> 200 period=MONTHLY total=149`. Prin urmare `quote.period` (`Deploy.tsx:339`) e întotdeauna `MONTHLY`, iar comanda e întotdeauna lunară. Nu există niciun selector de perioadă în fluxul de comandă.

**Impact:** mecanismul reparat e corect și dovedit prin API (1788 → 1788), dar **funcția pe care o descrie constatarea — „planul anual cotat cu 1788 și comandat cu 149" — nu mai poate fi produsă nici prin interfață, nici prin API**. Interfața n-a fost adaptată: rămâne afișată doar suma lunară.

### `RT-P2-03` — P2 (medie) — `markOrderPaid` nu verifică suma pe care i-o dă caller-ul

**Dovezi:** `api/src/services/stripe.ts:296-408` — funcția primește `params.amount` și nu îl compară niciodată cu `order.total`; singura verificare e în `verifyAmount` (`api/src/routes/webhooks.ts:308-318`), adică **înainte** de apel. Factura scrisă la `:439-455` folosește `order.total`, nu suma raportată de provider.

**Impact (ipotetic, nedemonstrat ca exploatare):** orice viitor apelator care ar apela `markOrderPaid` cu o sumă diferită de cea a comenzii ar marca comanda plătită cu o sumă necorespunzătoare, iar factura ar purta tot `order.total`. Astăzi nu există un asemenea apelator (`webhooks.ts:407`, `orders.ts:175`, `orders.ts:236`), deci **nu am demonstrat o exploatare** — rămâne o fragilitate.

### `RT-P2-04` — P2 (medie) — Rambursarea comenzii unui administrator nu e acoperită de gardă

**Dovezi (cod):** `api/src/routes/admin.ts:450-520` (ruta de rambursare) **nu** apelează `assertMayActOnAccount`; lista apelurilor e la `:297,328,350,1242,1280` și nu include ruta de rambursare. Un personal cu `orders.write` ar putea, pe un site live, să ramburseze comanda unui administrator.
**Limitare explicită:** **neverificat în execuție** — ruta refuză înainte de orice scriere când `stripeLive()` e fals (`admin.ts:468-470`), iar stiva izolată nu are cheie Stripe. Nu pot da un rezultat măsurat, doar o lectură de cod.

### `RT-P2-05` — P2 (medie) — Fișa unui cont `ADMIN` rămâne lizibilă de un personal

**Dovezi:** măsurat — `GET /api/admin/customers/:id` cu un cont `ADMIN` → **200**, cu email, nume, rol, `pterodactylUserId`. Garda e construită doar pentru scrieri (vezi comentariul din `api/src/plugins/auth.ts:326-331`). Pentru enunțul „un cont cu rolul `ADMIN` poate fi acționat doar de un alt `ADMIN`", citirea e o acțiune asupra contului și **nu e acoperită**.

### `RT-P2-06` — P2 (medie, proces) — Stiva de revizie de pe `3101`/`30003` nu conține reparațiile

**Dovezi:** procesul API de pe `127.0.0.1:3101` a pornit la `00:28:14`; commiturile de reparație sunt din `01:18`–`01:42`. În `/tmp/api-check/dist` fiecare simbol nou (`DEAD_ORDER_STATUSES`, `permissionsNotHeld`, `assertMayActOnAccount`, `isProtectedSettingKey`, `rateLimitKey`, `writeOrderInvoice`, `orders/:id/confirm`) are **0 potriviri**. Codul sursă de sub `/tmp/api-check/src` diferă de cel al ramurii în toate cele 10 fișiere modificate.

**Impact:** orice revizor care se uită la interfața de pe `30003` sau la API-ul de pe `3101` judecă **codul vechi**. Pentru o certificare e un risc direct de fals verdict. De aceea am construit o instanță proprie.

### `RT-P3-01` — P3 (mică) — `api/tests/zz-probe3.test.ts` a rămas în ramă

Scaffolding de depanare (`console.log`, `expect(true).toBe(true)`), adăugat de `a4fb004` — ultimul commit al ramurii. Nu verifică nimic despre reparațiile fazei și rulează în suita completă. Nu e o regresie, e gunoi într-un branch destinat certificării.

### `RT-P3-02` — P3 (mică) — `POST /api/orders/:id/cancel` suprascrie starea `REFUNDED`

**Dovezi (măsurat):**
```
status before cancel : REFUNDED
POST /cancel on a REFUNDED order -> 204
status after cancel  : CANCELLED
```
`api/src/routes/orders.ts:256-257` refuză doar `FULFILLED` și `PAID`. Astfel, marcarea „banii au fost întorși" e ștearsă din starea comenzii, ceea ce slăbește atât urmărirea, cât și garda din `RT-P1-01` (care se bazează pe starea comenzii).

### `RT-P3-03` — P3 (informativă) — Două mecanisme paralele pentru `Secure`

`api/src/env.ts:136-141` calculează `env.cookieSecure` din `APP_ORIGIN`, iar repararea folosește `resolveCookieSecure` (`api/src/plugins/auth.ts:58-64`), bazat pe `NODE_ENV` și pe `COOKIE_SECURE`. `env.cookieSecure` nu e folosit de reparare. Nu e defect, dar e o sursă de confuzie: un operator care citește `env.cookieSecure` poate crede că a controlat cookie-ul.

---

## 8. Starea suitei complete pe ramă

**Rularea oficială, pe o bază de date proprie** (`TEST_DB_NAME=retest_test`, `bash scripts/run-tests.sh`):

```
 Test Files  36 passed (36)
      Tests  366 passed (366)
   Duration  183.35s (transform 2.68s, setup 843ms, collect 8.78s, tests 167.98s, environment 1ms, prepare 205ms)

==> Running the web tests
1..76
# tests 87
# suites 5
# pass 87
# fail 0
```

Așadar, **API 366/366 în 36 de fișiere, web 87/87** — reproduce de mine, pe baza mea, nu pe cea comună.

**Rularea de confirmare pe vârful curent al ramurii** (`888a274`, baza `rt13_final_test` proprie), după toate probele de revertire:

```
 Test Files  36 passed (36)
      Tests  366 passed (366)

# tests 87
# pass 87
# fail 0
```

**Verde și la vârful curent.** Vârful ramurii s-a mutat în timpul retestului de la `a4fb004` la `888a274` (două commituri de documente de audit adăugate de un terț). Am verificat că `git diff a4fb004..HEAD -- api/src api/tests web/src` este **gol** — deci codul și testele pe care le-am măsurat sunt identice cu cele de la vârful curent.

### 8.1 Două rulări de suita completă cu o reparație deconectată

Am rulat **suita completă** (nu doar un fișier de test) pe două copii de lucru, ca să văd **ce protejează de fapt** fiecare reparație:

| Copie de lucru | Rezultat | Ce înseamnă |
|---|---|---|
| **Pristin** (HEAD) | 36/36 fișiere, **366/366 teste** | baza de comparație — din rularea oficială (§8), **nu** din rularea „de bază" contaminată de mai jos |
| **`SEC-P1-02` deconectat** (cele 6 `keyGenerator: addressKey` scoase din `api/src/routes/auth.ts`) | 36/36 fișiere, **366/366 teste — VERDE** | **niciun test din toată suita nu apără repararea `SEC-P1-02`** |
| **`FIN-P1-01` deconectat** (garda `DEAD_ORDER_STATUSES` eliminată) | 1 fișier căzut, 35/36; **2 teste căzute, 364/366** | **doar** cele două teste care apelează `markOrderPaid` direct cad. Niciun alt test din toată suita nu acoperă calea de resuscitare prin checkout (`RT-P1-01`) |

Cele două teste care cad la deconectarea lui `FIN-P1-01`:

```
 FAIL  tests/phase2-payment-safety.test.ts > the state of an order when the money arrives > refuses to pay a dead order through the service that pays
 FAIL  tests/phase2-payment-safety.test.ts > a payment that did not match can still be applied after a correction > still refuses a cancelled order even when the sum matches
```

**Caveat de metodă, declarat.** O primă rulare „de bază" a ieșit cu 71 de teste căzute, dar **nu o folosesc ca dovadă**: două rulări paralele s-au suprapus pe același arbore de lucru în timp ce o rulare cu `SEC-P1-02` deconectat era în curs, iar rondul meu „de bază" a măsurat un arbore modificat. Am reluat strict secvențial, pe un arbore curat, și numai acele rezultate sunt de folosit. Nu ascund rezultatul greșit: îl menționez pentru că ar fi putut conduce la o concluzie greșită în sens invers.

### 8.2 Cuprinderea testelor de regresie, pe scurt

| Reparare | Testul eșuează fără reparare? | Cum am obținut răspunsul |
|---|---|---|
| `FIN-P1-01` | **DA** | garda eliminată → testul eșuează |
| `FIN-P2-03` | **DA** | propagarea perioadei eliminată → testele eșuează |
| `BE-09` | **DA** | `verifyAmount` readus la **corpul exact** de la bază → testul eșuează |
| `CJ-P1-01` | **DA** | ruta de confirmare eliminată → testul eșuează |
| `CJ-P1-02` | **DA** | apelul `writeOrderInvoice` eliminat → testul eșuează |
| `ADM-P1-01` | **DA** | blocul de permisiuni readus la forma de la bază → testul eșuează |
| `ADM-P1-02` | **DA** | apelurile `assertMayActOnAccount` eliminate → testul eșuează |
| `REGR-01` | **DA** | filtrul de citire eliminat → testul eșuează |
| `SEC-P1-01` | **DA** | `if (env.isProduction) return true;` eliminat → testul eșuează |
| `SEC-P1-02` | **NU** | `keyGenerator` scos din cele 6 rute → **suita completă rămâne verde** |

---

## 9. Certificarea finală

**Cele șase reparări care sunt într-adevăr închise:** `ADM-P1-01` (integral, cu șase ocoliri refuzate), `REGR-01` (integral: setările interne nu se citesc, nu se scriu, iar o cerere mixtă e refuzată în întregime), `SEC-P1-01` (cookie `Secure` în producție chiar și pe cerere HTTP de la un proxy neîncredincios), `BE-09` (un eveniment fără sumă e refuzat, iar replay-ul lui nu plătește nici o comandă `FAILED`), `CJ-P1-01` (ruta de confirmare e server-side, e idempotentă, refuză comanda străină și **nu există deloc** în producție) și `CJ-P1-02` (factura se scrie cu suma cotată și nu se dublează la reluare). La toate acestea am probat că testul de regresie **eșuează** când repararea e revertată într-o copie de lucru separată, iar suita completă e verde: **API 366/366 în 36 de fișiere, web 87/87**, pe o bază de date proprie.

**Cele trei care NU sunt închise.** `FIN-P1-01` e **doar pe jumătate**: garda din `markOrderPaid` există, e reală și e dovedită de un test de regresie — dar **nu împiedică** ceea ce trebuia împiedicat. Un client își anulează comanda (sau al cărui administrator o rambursează), apelează `POST /api/orders/:id/checkout` — care nu verifică nicio stare moartă și rescrie comanda în `AWAITING_PAYMENT` — și apoi plătește: **comanda ajunge `PAID`, cu o instanță, o factură și un abonament**. Am măsurat-o de două ori, pentru `CANCELLED` și pentru `REFUNDED`. Constatarea originală, care era **P0/Critical** și care indica *explicit* `orders.ts:152-196` drept calea de resuscitare, **rămâne deschisă**; iar când am deconectat garda și am rulat **suita completă**, au căzut doar cele două teste care apelează serviciul direct — **niciun test din toată suita nu acoperă calea prin checkout**. `ADM-P1-02` e **doar pe jumătate**: cele cinci rute de scriere asupra unui cont `ADMIN` sunt protejate și ocolirile sunt refuzate, dar constatarea originală spunea „administrator **sau de personal**", iar un personal poate în continuare să suspendă un alt membru de personal (măsurat, 200), poate citi fișa unui administrator (măsurat, 200) și **ruta de rambursare nu are deloc garda** (neverificabil local, pentru că stiva izolată nu are cheie Stripe — e o limitare de mediu, nu o probă). `SEC-P1-02` e **doar pe rutele de autentificare**: cele 6 rute de care se ocupă sunt corect separate (am probat că 12 conturi diferite, prin același proxy neîncredincios, nu se blochează reciproc), dar celelalte 6 rute cu limită de rată — inclusiv `POST /api/catalog/quote`, anonim, și `POST /orders`, limitat **înainte** de autentificare — păstrează contorul global, iar când proxy-ul nu e în `TRUSTED_PROXIES` **un vizitator blochează toți ceilalți** (măsurat: 121 cotări → 429, iar un vizitator complet diferit primește tot 429).

**Trei observații care nu sunt despre reparări, dar schimbă verdictul de încredere.** (1) **Niciun test din toată suita nu apără `SEC-P1-02`**: cu reparația deconectată, suita e **verde, 366/366**. Verde, așadar, **nu înseamnă acoperit**. (2) **Stiva de revizie de pe `3101`/`30003` nu conține reparațiile** — procesul a pornit înaintea celor patru commituri de remediere și niciun simbol nou nu există în `dist`; orice revizor care se uită acolo judecă codul vechi. De aceea am construit o instanță proprie. (3) **Vârful ramurii s-a mutat în timpul retestului**, de la `a4fb004` la `888a274`; am verificat că `git diff a4fb004..HEAD -- api/src api/tests web/src` este **gol** — s-au adăugat doar documente de audit — deci verdictul de mai sus e valabil pentru vârful curent.

**Cele două fișiere de teste modificate nu ascund regresii.** `webhooks.test.ts` primește doar suma reală a comenzii în șase evenimente; testele pe care le-am verificat cu lupa — „refuses a payment that does not match the order and keeps the event for a replay" și „replays a failed event" — **nu au fost atinse** și își păstrează toate aserțiunile; schimbarea e de adaptare la un contract nou, iar comportamentul nou e acoperit de un test dedicat care eșuează la revertare. `admin-staff-permissions.test.ts` își schimbă doar fixture-ul (actorul trebuie să aibă permisiunile pe care le înmânează), cu un comentariu care explică de ce; intenția testului e păstrată, iar regula nouă e acoperită separat, cu un caz pozitiv și unul negativ. **Verdictul meu: ambele modificări sunt oneste.** Am semnalat însă `api/tests/zz-probe3.test.ts` — scaffolding de depanare cu `expect(true).toBe(true)`, rămas în ramă de la ultimul commit.

**Concluzia certification.** Faza 2 **nu poate fi numită încheiată**. Șapte din zece reparări sunt dovedite pe server, cu ocoliri refuzate și teste de regresie care chiar eșuează fără ele — acolo merită încredere. **Dar constatarea de severitate P0 (`FIN-P1-01` / `FIN-P2-04`) rămâne deschisă printr-o ocolire de un pas, prin chiar endpointul pe care constatarea îl indica**, `ADM-P1-02` e acoperit pe jumătate față de textul original, iar `SEC-P1-02` e corect doar pe o parte din rute și **nu are niciun test care s-o apere**. Recomandarea mea, în ordine: (1) închideți `RT-P1-01` — o verificare de stare în `POST /orders/:id/checkout` **înainte** de rescrierea în `AWAITING_PAYMENT` (sau o listă de admitere, ca în `501277b`), cu un test care să parcurgă chiar ruta de checkout; (2) decideți dacă `ADM-P1-02` se încheie pe „doar `ADMIN`" sau pe „administrator **sau personal**", și acoperiți rambursarea; (3) aplicați `addressKey` și celorlalte 6 rute cu limită de rată și **adăugați un test care eșuează când cheia e scoasă**; (4) reparați stiva de revizie `3101`/`30003` ca să conțină ramă, sau fixați un control care obligă la reconstruirea ei. Până atunci, certificarea fazei 2 este **parțială**, nu plină.

---

## 10. Anexă — cum se repetă probele

Toate comenzile presupun acces pe VM 103 (`ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13`).

**1. Baza de date proprie**
```bash
docker exec blipmade-postgres-1 psql -U blipmade -d postgres \
  -c "CREATE DATABASE retest_test OWNER blipmade;"
```

**2. Copie de lucru separată, la HEAD (nu se atinge arborele testat)**
```bash
mkdir -p /tmp/rt13/verify && cd /opt/blipmade
git archive a4fb004 | tar -x -C /tmp/rt13/verify
ln -s /opt/blipmade/api/node_modules /tmp/rt13/verify/api/node_modules
cd /tmp/rt13/verify/api && npx prisma generate && npx tsc -p tsconfig.json
```

**3. Instanță API proprie, pe baza proprie**
```bash
# port 3102: NODE_ENV=test (poarta locală activă)
# port 3103: NODE_ENV=production (ruta de confirmare trebuie să lipsească)
NODE_ENV=test HOST=127.0.0.1 PORT=3102 LOGIN_RATE_LIMIT_MAX=1000 node dist/index.js
```

**4. Bateria de ocolire**
Scriptul complet e în `_raw/rt13-bypass-run1.txt` și `_raw/rt13-bypass-run2.txt` (ieșire),
iar pașii reproducibili sunt în secțiunile §4 și §5. Pentru ocolirea principală (`FIN-P1-01`):
```bash
# 1. creează o comandă        POST /api/orders
# 2. anuleaz-o                POST /api/orders/:id/cancel      -> 204
# 3. reia checkout-ul         POST /api/orders/:id/checkout   -> 200, starea devine AWAITING_PAYMENT
# 4. plătește                 POST /api/webhooks/stripe/test { orderId, amount: <totalul comenzii> } -> 200
# 5. verifică                 SELECT status FROM "Order" ...  -> PAID, cu instanță și factură
```

**5. Proba de revertire** (pentru fiecare reparație): editarea textuală a fișierului din
`/tmp/rt13/verify/api/src`, apoi rularea testului țintă pe o bază proprie:
```bash
cd /tmp/rt13/verify/api && npx vitest run tests/phase2-payment-safety.test.ts \
  -t 'refuses to pay a dead order through the service that pays'
```
Rezultatele sunt în `_raw/rt13-revert-results.tgz` (arhiva cu ieșirea fiecărei cazuri).

**6. Curățenia mediului**
- Instanțele mele (3102/3103/3104) au fost oprite prin PID exact; stiva comună `30003`/`3101`
  a rămas activă (`ss -ltnp`).
- Bazele `retest_test`, `retest_revert_test`, `rt13_final_test` au fost șterse; `blipmade` și
  `blipmade_test` nu au fost atinse.
- `git status` în `/opt/blipmade` a rămas **curat**, la același commit.
