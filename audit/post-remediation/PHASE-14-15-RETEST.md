# PHASE 14–15 — Retest independent al repararilor din fazele 14 și 15

**Rol:** retester independent. Nu am implementat niciuna dintre cele 11 reparări verificate.
Continui standardul din `PHASE-13-RETEST.md`: citesc diff-ul, încerc ocolirile pe o stivă
izolată proprie, **revert repararea într-o copie de lucru separată** ca să dovedesc că
testul de regresie eșuează fără ea, și dau un verdict strict.

Raportul anterior (`PHASE-13-RETEST.md`) **nu a fost rescris**; cele două documente stau
alături, iar identificatorii `RT-P1-xx` / `RT-P2-xx` / `RT-P3-xx` din el sunt cei pe care
îi verific aici.

---

## 1. Metadate

| Câmp | Valoare |
|---|---|
| Data retestului | 2026-10-23, sesiune inițiată 22:44 (America/New_York) |
| Commit sub test | `4969f4a` — *„Keep a dead order dead and the accounts of the platform guarded"* |
| Vârful anterior | `888a274` (vârful pe care l-am verificat în faza 13) |
| Baza de comparație pentru ramă | `e990776` (main); pentru acest retest, comparația relevantă e `888a274..4969f4a` |
| Diff verificat | `git diff 888a274..4969f4a` — 16 fișiere, **+754 / −113** (inclusiv ștergerea `api/tests/zz-probe3.test.ts`) |
| Commituri noi | `f8b2051` (faza 14 — adresa clientului), `4969f4a` (faza 15 — ciclul de viață al comenzii și conturile platformei) |
| Depozit | `debian@10.77.0.13:/opt/blipmade` (VM 103), ramă `remediation/phase-2-critical-fixes`, HEAD = `origin` = `4969f4a`, arbore curat |
| Stivă de test | **Instanță proprie**, construită din `4969f4a`: API `127.0.0.1:3102`; plus două copii de lucru (`/tmp/rt1415/new`, `/tmp/rt1415/old`) pentru probele de revertire |
| Baza de date | `rt1415_test` (creată de mine, ștersă la final) |
| Stiva comună 3101/30003 | **neatininsă** — rulează cod pre-remediere (raportat în faza 13 ca `RT-P2-06`) |
| Worktree-ul `bm-phase14` | **nefolosit și nemodificat** — aparține altui autor; am făcut copii proprii |
| Producție | neatinsă: `blipmade` nu a fost scris, `blipmade.com` nu a fost vizitat, panoul nu a fost atins |

### Comenzi esențiale

```bash
# ground truth
ssh ... 'cd /opt/blipmade && git rev-parse HEAD && git log --oneline -6 && git diff --stat 888a274..4969f4a'

# copii de lucru separate (ramă neatinsă)
ssh ... 'cd /opt/blipmade && git archive 4969f4a | tar -x -C /tmp/rt1415/new && git archive 888a274 | tar -x -C /tmp/rt1415/old'

# baza proprie
ssh ... 'docker exec blipmade-postgres-1 psql -U blipmade -d postgres -c "CREATE DATABASE rt1415_test OWNER blipmade;"'

# suita completă, pe baza mea
ssh ... 'cd /tmp/rt1415/new && TEST_DB_NAME=rt1415_test bash scripts/run-tests.sh'
```

---

## 2. Metodologie

Pentru fiecare dintre cele 11 afirmații am cerut:

1. **Codul există și face ce se pretinde** — am citit diff-ul `888a274..4969f4a` integral
   (text brut în `_raw/rt1415-diff-src.txt`) și apoi funcțiile în întregime.
2. **Regula se aplică pe server** — am încercat s-o ocolesc cu proxy neîncredincios, cu
   `X-Forwarded-For` falsificat, cu adrese diferite pe același cont și pe rutele noi
   (`/auth/login`, `/orders/:id/checkout`, `/orders/:id/cancel`, `/admin/orders/:id/refund`).
3. **Testul de regresie e real** — l-am rulat pe codul de la `4969f4a` **și pe codul de la
   `888a274`** (testele noi copiate explicit peste arborele vechi, ca măsurarea să aibă
   sens), apoi am revertit repararea în copie separată.
4. **Suita completă e verde**, plus o rulare cu o reparare deconectată, ca să văd **ce e
   acoperit și ce nu**.

**O observație de mediu, pentru corectitudine.** `web/server.mjs:80-83` păstrează comentariul
vechi („The chain of the header is read from the left"), care contrazice acum implementarea
(`web/src/lib/client-address.mjs:197-214`, care o citește **din dreapta**). E o inconsecvență
de comentariu, nu de cod — o semnalez pentru că un cititor s-ar putea orienta greșit.

**O corecție pe care am aplicat-o mie, după măsurare.** Două probe le-am făcut pe portul **3105**
(un proxy neîncredincios). La finalul sesiunii am verificat `ss -ltnp` și am descoperit că **3105
era ținut de instanța altui auditor** (`/tmp/uxaudit/api`, pid 892174) — deci **nu puteam
demonstra că instanța mea se legase pe acel port**, iar numerele ar fi putut fi ale altcuiva.
Am repetat probele pe portul **3110**, unde `ss -ltnp` arată explicit `pid=1037314` (al meu),
și am obținut **aceleași rezultate**:

```
limita de cotare cu proxy neîncredincios : atinsă după 121 cereri -> 429
alt vizitator, PE ALTĂ CONEXIUNE          -> 200 (nu e refuzat: contorul e per conexiune)
un cont, douăsprezece conexiuni diferite  : [401×10, 429, 429]
alt cont                                  : 401
```

În tabelul de mai jos folosesc **numerele de pe 3110**, care sunt singurele pe care le pot
atribui. Le raportez pe cele de pe 3105 pentru că le-am măsurat și pentru că **concurența
între auditori pe aceleași porturi e un hazard real** pe această mașină.

---

## 3. Tabelul verdictului

**Standardul verdictului.** `DA` = repararea face **pe server** exact ce se pretinde, am măsurat-o
pe o instanță proprie și am încercat s-o ocolesc. `PARȚIAL` = mecanismul e corect, dar afirmația
nu e îndeplinită în toate cazurile pe care le cuprinde. `NU` = nu e dovedită. **Coloana despre
test nu e aceeași cu verdictul**: o reparare reală fără test de regresie rămâne `DA` pe
reparare, dar generează un defect de acoperire separat (aici `RT-P2-07`).

| # | Afirmația | Verdict | Cod (file:line) | Test (file:line) | Testul eșuează fără reparare? | Ce am încercat și a eșuat | Observații |
|---|---|---|---|---|---|---|---|
| **1** | Lanțul `X-Forwarded-For` se citește din dreapta | **PARȚIAL** | `web/src/lib/client-address.mjs:197-214` | `web/tests/client-address.test.mjs:26-31,94-116` | **DA** — 3 din 13 cad pe resolverul vechi | Client falsificator `9.9.9.9`: web-ul **nou** înregistrează tot `9.9.9.9` dacă lanțul are un singur element | Mecanismul e corect și testul e real, dar Corecția valabilă **doar dacă edge-ul adaugă adresa clientului la sfârșitul lanțului**. Nu există Caddyfile în repo → convenția edge-ului e **neverificabilă din cod** (`RT-P2-07`) |
| **2** | `addressRateLimitKey`: adresa clientului, sau conexiunea | **DA** | `api/src/plugins/auth.ts` (`addressRateLimitKey`), folosit în `app.ts:81` | `api/tests/phase14-address-key.test.ts` (4 teste) | **DA**, dar **structural**: 3 cad cu `TypeError: addressRateLimitKey is not a function`; al 4-lea trece și pe codul vechi | Proxy neîncredincios → cheie per conexiune; proxy încredincios → adresa clientului | Reparația e reală; **acoperirea de test e formală, nu comportamentală** |
| **3** | Cele 6 rute cu limită de rată + limita globală folosesc cheia nouă | **DA** | `api/src/app.ts:81`; `catalog.ts:171`; `orders.ts:64`; `settings.ts:304,365,413,569` | — | **NU — suita completă rămâne verde** când cheia e scoasă | 121 cotări de la un vizitator → 429; **alt vizitator → 200** (pe codul vechi ar fi fost 429) | Închide `RT-P2-01`, dar **niciun test nu o acoperă** → `RT-P2-07` |
| **4** | Contorul de autentificare numără doar eșecurile; o reușită șterge contorul | **DA** | `api/src/lib/failed-attempts.ts`; `api/src/routes/auth.ts:145-165,244-247,288,300-315` | `api/tests/phase14-rate-limits.test.ts:76-151` | **DA** — 2 teste cad când garda veche (numără toate cererile) e pusă înapoi | 10 eșecuri pe un cont de la **10 adrese diferite** → a 11-a: **429**; 10 eșecuri pe **10 conturi de la o adresă** → a 11-a: **429**; proxy neîncredincios, 12 conexiuni → a 11-a: **429** | **Protecția de forță brută e intactă**, măsurată în toate cele trei forme |
| **5** | Două teste web existente rescrise (convenția schimbată) | **DA** (schimbare onestă) | `web/tests/client-address.test.mjs:9-14,26-31,94-116` | — | **DA** — 3 cad pe resolverul vechi, inclusiv cazul falsificatorului | — | Celelalte **10** teste din fișier sunt neatinse și trec. Intenția („adresa clientului e cea scrisă") e păstrată; **convenția** era defectul |
| **6** | `POST /orders/:id/checkout` refuză `CANCELLED`/`REFUNDED` | **DA** | `api/src/routes/orders.ts` (garda de checkout) | `api/tests/phase15-order-lifecycle.test.ts:104-127` | **DA** — 2 teste cad când garda e eliminată; cad și pe codul de la `888a274` | `cancel` → `checkout` → **409**; starea rămâne `CANCELLED`; evenimentul de plată → comanda rămâne `CANCELLED`, **0 instanțe, 0 facturi, 0 abonamente** | **Închide `RT-P1-01`** (era P0) |
| **7** | `POST /orders/:id/cancel` refuză `REFUNDED` | **DA** | `api/src/routes/orders.ts` (garda de anulare) | `api/tests/phase15-order-lifecycle.test.ts:129-137` | **DA** — 1 test cade pe codul vechi | `cancel` pe o comandă `REFUNDED` → **400**, starea rămâne `REFUNDED` | Închide `RT-P3-02` **pe ruta de anulare**; **nu** pe calea webhook-ului (`RT-P3-04`) |
| **8** | `markOrderPaid` verifică suma, fail-closed | **DA** | `api/src/services/stripe.ts` (verificarea sumei) | `api/tests/phase15-order-lifecycle.test.ts:151-160` | **DA** — 1 test cade când verificarea e eliminată | sumă greșită → `conflict`; fără sumă → `conflict`; suma corectă → `PAID` | **Calea de recuperare a operatorului nu e stricată**: `FAILED` + sumă corectată + replay → `PAID` + instanță + factură + abonament |
| **9** | `assertMayActOnAccount` acoperă și rolul `STAFF` | **DA** | `api/src/plugins/auth.ts:352-360` | `api/tests/phase15-order-lifecycle.test.ts:164-175` | **DA** — 1 test cade când regula `STAFF` e eliminată | personal suspendă alt personal → **403**; personal suspendă un client → **200** | Închide jumătatea „de personal" din `RT-P1-02` |
| **10** | Ruta de rambursare apelează `assertMayActOnAccount` | **DA** | `api/src/routes/admin.ts:454-465` | `api/tests/phase15-order-lifecycle.test.ts:190-205` | **DA** — 1 test cade; și dacă mut garda **după** verificarea „comanda e plătită", testul cade | personal rambursează comanda unui `ADMIN` → **403**; comanda unui client → **409** (nu 403 → cazul legitim e neatins) | Închide `RT-P2-04`; **efect secundar**: personalul nu-și mai poate rambursa propria comandă (`RT-P3-06`) |
| **11** | `api/tests/zz-probe3.test.ts` șters din ramă | **DA** | — | — | — | — | Confirmat: fișierul nu mai există; 38 fișiere de test = 36 + 3 − 1 |

**Rezultat: 10 `DA`, 1 `PARȚIAL`, 0 `NU`.**

---

## 4. Detaliu, reparare cu reparare

### 4.1 Repararea 1 — lanțul `X-Forwarded-For` citit din dreapta — **PARȚIAL**

`web/src/lib/client-address.mjs:197-214` citește lanțul de la dreapta și ia **ultimul element
care nu e proxy cunoscut**; dacă toate elementele sunt proxy-uri cunoscute sau nu există lanț,
folosește adresa socketului.

**Testul e un test de regresie real.** Am rulat fișierul de test **nou** peste resolverul
**vechi**:

```
not ok 1 - the last address of the chain is the address of the client
    expected: '198.51.100.7'
    actual:   '203.0.113.5'
not ok 11 - the chain of the header is read from the right, not from the left
not ok 12 - a client that forges the head of the chain does not choose its address
    expected: '198.51.100.7'
    actual:   '9.9.9.9'          <-- falsificarea câștigă
# pass 10
# fail 3
```
Pe resolverul **nou**: `13/13` trec.

**Ce am încercat, capcană de măsurat.** Am construit două servere web din același build — unul
cu resolverul nou (30103), unul cu resolverul vechi (30104) — și am observat **adresa pe care API-ul
o înregistrează** (tabela `AuditLog`, câmpul `ip`, scris de `auth.login_failed`):

| Cerere | web NOU (30103) | web VECH (30104) |
|---|---|---|
| `X-Forwarded-For: 9.9.9.9` | **9.9.9.9** | 9.9.9.9 |
| `X-Forwarded-For: 9.9.9.9, 8.8.8.8` | **8.8.8.8** | 9.9.9.9 |
| fără antet | 127.0.0.1 | 127.0.0.1 |

**Asta e măsurarea care contează, și e în două sensuri.** Când lanțul are **două elemente** — adică
atunci când edge-ul **adaugă** adresa reală a clientului la sfârșit — web-ul nou ia elementul
din dreapta (`8.8.8.8`, adresa reală) și cel vechi lua elementul falsificat din stânga
(`9.9.9.9`). **Reparația e reală și e dovedită.** Dar când lanțul are **un singur element** —
adică un client care trimite antetul direct, sau un edge care **nu adaugă** — ambele versiuni
cred valoarea falsificată.

**De ce e `PARȚIAL`, nu `DA`.** Afirmația spunea: „un client care trimite `X-Forwarded-For: 9.9.9.9`
era înregistrat și limitat după `9.9.9.9`". Am măsurat că **asta e în continuare adevărat** în
cazul lanțului cu un singur element, cu codul nou. Corecția depinde în întregime de convenția
edge-ului („edge-ul scrie adresa clientului la sfârșitul lanțului"), iar **repo-ul nu conține
niciun Caddyfile** — edge-ul rulează în afara proiectului, deci convenția lui **nu e
verificabilă din cod**. Am măsurat și consecința: prin web-ul nou, 121 de cotări cu adresa
falsificată `198.51.100.77` → 429; apoi o cotare cu **altă** adresă falsificată → **200**
(atacatorul evadează limita); iar adresa falsificată rămâne blocată (victima e închisă).
Prin web-ul vechi: exact aceleași rezultate — deci **noul cod nu a închis cazul lanțului scurt**.

### 4.2 Reparațiile 2 și 3 — cheia limitatorului și cele șase rute — **DA**

`api/src/plugins/auth.ts` expune `addressRateLimitKey`, care întoarce adresa clientului când
proxy-ul e încredincios și `adresa:portul` (per conexiune) când nu e. Ea e folosită acum de
**limita globală** (`api/src/app.ts:81`) și de cele șase rute: `catalog.ts:171`, `orders.ts:64`,
`settings.ts:304,365,413,569`.

**Măsurat, pe instanța mea:**
```
visitor A: limita e atinsă după 120 cereri -> 429
un vizitator DIFERIT                     -> 200 (contorul e per vizitator)
```
Pe codul vechi, contorul global al limitei globale ar fi refuzat și vizitatorul diferit — de
aceea am rulat **suita completă cu cheia deconectată** ca să văd dacă vreun test o apără (§6).

**Protecția de forță brută — măsurată în trei forme**, cu instanța care are `LOGIN_RATE_LIMIT_MAX=10`
(portul 3110, ownership verificat prin `ss` — vezi corecția de metodă din §2):
```
B4a  un cont, zece adrese diferite : [401×10, 429, 429]   <- contorul de CONT ține
B4a  alt cont                      : 401                   <- nu se împrăștie
B4b  zece conturi, o adresă         : [401×10, 429, 429]   <- contorul de ADRESĂ ține
B4c  o autentificare reușită       : 200
B4c  eșecul următor                : 401                   <- contorul contului a fost șters
B4c  a doua autentificare reușită  : 200
B5   proxy neîncredincios, 12 conexiuni: [401×10, 429, 429] <- contorul de CONT ține și aici
```
**Protecția împotriva ghirierii de parolă e intactă**, inclusiv prin adrese diferite pe același
cont, inclusiv când proxy-ul e neîncredincios. Semantica schimbată („numără doar eșecurile”)
funcționează cum e descrisă, iar plafonul de 30 cereri pe adresă lasă un client să se autentifice
repetat fără să fie refuzat.

### 4.3 Repararea 5 — cele două teste web rescrise — **DA (onest)**

Am comparat fișierul înainte și după. Diferențele sunt **două** teste al căror **nume** conține
convenția inversată și **unul nou** care fixează exact cazul falsificatorului:

```diff
-test('the first address of the chain is the address of the client', () => {
-  const address = resolveClientAddress('172.64.1.2', '203.0.113.5, 198.51.100.7', EDGE);
-  assert.equal(address, '203.0.113.5');
+test('the last address of the chain is the address of the client', () => {
+  const address = resolveClientAddress('172.64.1.2', '203.0.113.5, 198.51.100.7', EDGE);
+  assert.equal(address, '198.51.100.7');
```

Restul fișierului (10 teste) e neatins și trece în ambele versiuni. **Judecata:** intenția
originală — „adresa care se scrie e adresa clientului" — e păstrată; ceea ce s-a schimbat e
**care** element al lanțului e clientul, iar vechea convenție era chiar defectul pe care
constatarea îl descrie. Nu s-a început să se testeze altceva; s-a testat **același lucru, cu
convenția corectă**, plus cazul falsificatorului, care înainte nu era acoperit. **Schimbare onestă.**

### 4.4 Repararea 6 — garda de checkout — **DA**, închide `RT-P1-01` (era P0)

Măsurat pe instanța mea, cu ocolirea exactă din raportul fazei 13:
```
order ... state PENDING|149|0|0|0
cancel           -> 204
state             CANCELLED|149|0|0|0
checkout         -> 409 {"code":"conflict","message":"This order cannot be paid: its status is cancelled."}
state             CANCELLED|149|0|0|0
payment event    -> 200
FINAL state       CANCELLED|149|0|0|0     <- 0 instanțe, 0 facturi, 0 abonamente
```
Idem pentru o comandă `REFUNDED` → checkout **409**. **Ocolirea e moartă.** Revertirea gardei:
2 teste cad (`does not send a cancelled order to a checkout again`, `does not send a refunded order
to a checkout again`).

### 4.5 Repararea 7 — garda de anulare pentru `REFUNDED` — **DA**

```
cancel of a REFUNDED order -> 400 {"code":"bad_request","message":"This order was refunded and cannot be cancelled."}
state                       REFUNDED|149|0|0|0
```
Starea rambursării **nu mai e ștearsă** pe această cale. Revertire: 1 test cade.

**Observație importantă — rămâne un drum deschis.** Pe **calea webhook-ului**, o comandă
`REFUNDED` care primește un eveniment de plată **își schimbă starea în `CANCELLED`**:
```
state (REFUNDED)  REFUNDED|149|0|0|0
payment event    -> 200
FINAL state       CANCELLED|149|0|0|0
```
Cauza: `api/src/routes/webhooks.ts:350-353` — `handleCancelledOrderPayment` scrie
`status: refunded ? 'REFUNDED' : 'CANCELLED'`, iar în stiva izolată (fără Stripe live) rambursarea
nu se execută, deci se scrie `CANCELLED`. Pe un site live cu Stripe, rambursarea s-ar executa și
starea ar rămâne `REFUNDED`; dar dacă **rambursarea eșuează**, starea `REFUNDED` se pierde oricum.
Așadar: **`RT-P3-02` e închis pe ruta de anulare, nu pe ruta webhook-ului** → `RT-P3-04`.

### 4.6 Repararea 8 — `markOrderPaid` verifică suma — **DA**

```
amount 1   -> Order BM-00004 cannot be paid: the payment of 1 is not the 149 that was quoted.
no amount  -> Order BM-00004 cannot be paid: the payment carries no amount.
state      PENDING|149|0|0|0
amount 149 -> paid; state PAID|149|0|1|1
```
**Calea de recuperare a operatorului nu e stricată** — am măsurat-o pe endpointul real de reluare:
```
payment (wrong sum)     -> 500, starea FAILED|149|0|0|0
corecția comenzii (total=199)
replay after correction -> 200 {"replayed":[{"eventId":"evt_rt1415_recovery","ok":true}]}
FINAL state             PAID|199|1|1|1
```
O comandă `FAILED`, corectată și reluată, devine `PAID` cu instanță, factură și abonament.
Revertirea verificării: 1 test cade.

### 4.7 Reparațiile 9 și 10 — conturile platformei — **DA**

```
staff suspends another STAFF  -> 403 "Only an administrator can act on the account of a member of the staff."
staff suspends a CUSTOMER      -> 200
staff refunds the ADMIN order  -> 403 "Only an administrator can act on the account of an administrator."
staff refunds a CUSTOMER order -> 409 "This order is not paid..."   <- cazul legitim, neatins
```
Revertiri: regula `STAFF` eliminată → 1 test cade; garda mutată **după** verificarea „comanda e
plătită" → 1 test cade (deci testul e sensibil la **poziția** gardei, nu doar la existența ei).

### 4.8 Repararea 11 — ștergerea fișierului de sondaj — **DA**

`api/tests/zz-probe3.test.ts` nu mai există în `4969f4a`; numărul de fișiere de test API a mers de
la 36 la **38** (36 + 3 noi − 1 șters).

---

## 5. Încercări de ocolire

Toate pe instanțe proprii, construite din `4969f4a` (API 3102 cu proxy încredincios, API 3105 cu
proxy **neîncredincios**, web NOU 30103 și web VECH 30104), pe baza `rt1415_test`.
Ieșirea brută: `_raw/rt1415-probe-phase14.txt`, `_raw/rt1415-probe-phase15.txt`.

| # | Reparare | Ce am încercat | Răspuns | Verdict |
|---|---|---|---|---|
| 1 | **1** (lanțul) | Client falsificator, lanț cu **două** elemente (`9.9.9.9, 8.8.8.8`), prin web-ul nou | API-ul a înregistrat **8.8.8.8** (web-ul vechi: 9.9.9.9) | **corecția funcționează** |
| 2 | **1** (lanțul) | Client falsificator, lanț cu **un** element (`9.9.9.9`), prin web-ul nou | API-ul a înregistrat **9.9.9.9** — identic cu web-ul vechi | **OCOLIRE REUȘITĂ** (vezi `RT-P2-07`) |
| 3 | **1** (lanțul) | Același falsificator prin web-ul vechi, pentru comparație | 9.9.9.9 | comportament neschimbat în cazul lanțului scurt |
| 4 | **1** (lanțul) | 121 cotări cu o adresă falsificată, prin web-ul nou → apoi o cotare cu **altă** adresă falsificată | 429, apoi **200** — atacatorul evadează limita; adresa falsificată rămâne blocată (victima închisă) | **OCOLIRE REUȘITĂ** |
| 5 | **2**, **3** (cheia limitatorului) | 121 cotări de la un vizitator (proxy încredincios) | 429 la cererea 121 | limită atinsă |
| 6 | **2**, **3** | Un **alt** vizitator, imediat după | **200** — contorul e per vizitator, nu global | **corecția funcționează** |
| 7 | **2**, **3** | Același experiment pe instanța cu proxy **neîncredincios** | 429 la cererea 121; alt vizitator → 200 | contor per conexiune, nu de platformă |
| 8 | **2**, **3** | Falsificator direct la API (fără web): `X-Forwarded-For: 9.9.9.99` | contorul adresei falsificate se epuizează după 120 cereri; „victima" → **429**; un vizitator onest → 200 | **OCOLIRE REUȘITĂ la nivel de API** (aici e 9.9.9.9, nu 9.9.9.99 — textul etichetei e depășit, valoarea măsurată e cea raportată) |
| 9 | **4** (forță brută) | 10 eșecuri pe **un cont**, fiecare de la **altă adresă** | a 11-a: **429** | **protecția ține** |
| 10 | **4** | 10 eșecuri pe **10 conturi**, de la **o adresă** | a 11-a: **429** | **protecția ține** (contra credential stuffing) |
| 11 | **4** | Proxy **neîncredincios**, 12 eșecuri pe un cont, 12 conexiuni | a 11-a: **429** | **protecția ține** |
| 12 | **4** | O autentificare **reușită** după 9 eșecuri, apoi încă un eșec | reușita → 200; eșecul următor → **401** (contorul contului a fost șters) | **semantica nouă funcționează** |
| 13 | **4** | Două autentificări reușite consecutive pe același cont | 200, 200 — plafonul de 30 cereri nu mușcă | **comportamentul dorit** |
| 14 | **4** | Un cont, după ce a fost blocat, cu un alt contor | celălalt cont → 401 | contorii nu se amestecă |
| 15 | **6** (checkout) | `cancel` → `checkout` → eveniment de plată | checkout **409**; starea rămâne `CANCELLED`; evenimentul → comanda rămâne `CANCELLED`, 0/0/0 | **refuzat corect** |
| 16 | **6** | Comandă `REFUNDED` → `checkout` → eveniment de plată | checkout **409**; starea rămâne `REFUNDED` la momentul refuzului | **refuzat corect** |
| 17 | **7** (anulare) | `cancel` pe o comandă `REFUNDED` | **400**, starea rămâne `REFUNDED` | **refuzat corect** |
| 18 | **7** | Eveniment de plată pe o comandă `REFUNDED` | starea devine **CANCELLED** | **OCOLIRE REUȘITĂ pe calea webhook-ului** (`RT-P3-04`) |
| 19 | **8** (suma) | `markOrderPaid` cu suma 1 | `conflict` — „the payment of 1 is not the 149 that was quoted" | **refuzat corect** |
| 20 | **8** | `markOrderPaid` fără sumă | `conflict` — „the payment carries no amount" | **refuzat corect** |
| 21 | **8** | `markOrderPaid` pe o comandă **deja plătită**, fără sumă | **aruncă** `conflict` — contractul de idempotență al documentației e rupt pentru această formă de apel (`RT-P3-05`) | **observație** |
| 22 | **8** | Calea de recuperare: `FAILED` + sumă corectată + **replay pe endpointul real** | **200 ok:true** → `PAID` + instanță + factură + abonament | **nu e stricată** |
| 23 | **9** (rolul `STAFF`) | Personal suspendă alt personal | **403** | **refuzat corect** |
| 24 | **9** | Personal suspendă un client | **200** | cazul legitim neatins |
| 25 | **10** (rambursare) | Personal rambursează comanda unui `ADMIN` | **403** | **refuzat corect** |
| 26 | **10** | Personal rambursează comanda unui **client** | **409** („nu e plătită"), nu 403 | cazul legitim neatins |
| 27 | **10** | Personal rambursează **propria** comandă | **403** | **efect secundar** (`RT-P3-06`) |
| 28 | **3** (limita globală) | Limitele de pe celelalte șase rute (setări, comandă), cu proxy neîncredincios | cheie per conexiune; limitele nu mai sunt de platformă | comportamentul nou e consecvent |

---

## 6. Judecata asupra testelor noi

Am rulat **fișierele de test noi peste codul de la `888a274`** (testele copiate explicit peste
arborele vechi, ca măsurarea să aibă sens) și am notat **fiecare** test care cade:

```
 Test Files  3 failed (3)
      Tests  11 failed | 5 passed (16)
```

| Fișier | Test | Cade pe codul vechi? | De ce cade |
|---|---|---|---|
| `phase14-address-key.test.ts` | `is the address of the client when the proxy is trusted` | **DA** | `TypeError: addressRateLimitKey is not a function` — **structural**, nu comportamental |
| | `is not the address of the proxy when the proxy is not trusted` | **DA** | tot structural |
| | `gives two connections of the same proxy two counters` | **DA** | tot structural |
| | `keeps the counter of a client that speaks for itself` | **NU** | verifică `rateLimitKey`, care exista și înainte |
| `phase14-rate-limits.test.ts` | `is kept per visitor and not for the whole platform` | **NU** | folosește `/auth/resend-verification`, care **avea deja** cheia per vizitator din faza 13 |
| | `does not count a sign-in that worked` | **DA** | `expected 429 to be 200` — schimbarea de semantică, prinsă |
| | `counts the attempts that failed and refuses the next one` | **NU** | garda veche (10 cereri pe cont) refuza și ea a 11-a |
| | `forgets the attempts that failed when the sign-in works` | **DA** | `expected 429 to be 401` — schimbarea de semantică, prinsă |
| `phase15-order-lifecycle.test.ts` | `does not send a cancelled order to a checkout again` | **DA** | `expected 200 to be 409` |
| | `does not send a refunded order to a checkout again` | **DA** | `expected 200 to be 409` |
| | `keeps the trace of the refund when the order is cancelled` | **DA** | `expected 204 to be 400` |
| | `lets an order that failed be paid again` | **NU** | e invariantul care **nu trebuie** schimbat — corect |
| | `pays the order the sum it was quoted` | **DA** | promisiunea s-a rezolvat în loc să fie respinsă |
| | `does not let a member of the staff suspend another member of the staff` | **DA** | `expected 200 to be 403` |
| | `lets an administrator suspend a member of the staff` | **NU** | invariant, corect |
| | `does not let a member of the staff refund the order of an administrator` | **DA** | `expected 409 to be 403` — și pe codul vechi era refuzat, dar **din alt motiv**; testul cere 403, nu „nu 200", deci e strict |
| `web/tests/client-address.test.mjs` | `the last address of the chain is the address of the client` | **DA** | `expected '198.51.100.7', actual '203.0.113.5'` |
| | `the chain of the header is read from the right, not from the left` | **DA** | idem |
| | `a client that forges the head of the chain does not choose its address` | **DA** | `actual '9.9.9.9'` — **falsificarea câștigă pe codul vechi** |
| | celelalte 10 teste web | **NU** | neatinse, trec în ambele versiuni |

**Verdicte:**

- **`phase15-order-lifecycle.test.ts` — test de regresie real, complet.** 6 din 8 cad pe codul
  vechi, iar cele 2 care nu cad sunt **invariante** (care nu trebuie schimbate). Am reverificat
  și **sensibilitatea la poziție**: mutarea gardei de rambursare după verificarea „comanda e
  plătită" face testul să cadă → testul nu trece pentru motivul greșit. ✅
- **`phase14-rate-limits.test.ts` — parțial real.** Prinde schimbarea de semantică (2 teste).
  Dar **nu prinde `RT-P2-01`**: testul „is kept per visitor" folosește o rută care avea deja cheia
  corectă. ❌
- **`phase14-address-key.test.ts` — acoperire formală.** 3 din 4 cad doar pentru că simbolul
  `addressRateLimitKey` nu există în codul vechi; al patrulea trece peste ambele. Nu e un test
  comportamental al cheii. ⚠️
- **`web/tests/client-address.test.mjs` — test de regresie real**, cu un caz nou care fixează
  exact falsificarea. ✅

**Cea mai importantă măsurătoare: `RT-P2-01` nu are niciun test care s-o apere.** Am deconectat
cheia de pe limita globală și de pe cele șase rute și am rulat **suita completă**:

```
 Test Files  38 passed (38)
      Tests  380 passed (380)
```

**Verde.** Niciun test din toată suita nu observă schimbarea. La fel, **`phase14-address-key.test.ts`
e acoperire structurală**. Cele două împreună formează `RT-P2-07`.

---

## 7. Defecte rămase sau noi

Numerotarea continuă raportului fazei 13 (`RT-P1-01`, `RT-P1-02`, `RT-P2-01`…`RT-P2-06`,
`RT-P3-01`…`RT-P3-03`).

### `RT-P2-07` — P2 (medie) — Adresa clientului poate fi aleasă de client, în lanțul scurt

**Stare:** **nou** (nu era raportat în faza 13).
**Dovezi:**
- `web/src/lib/client-address.mjs:197-214` — pentru un lanț cu **un singur** element, codul
  întoarce acel element; nu există nicio verificare că edge-ul a construit lanțul.
- Măsurat, capcană de ocolire nr. 2: client falsificator `X-Forwarded-For: 9.9.9.9` → API-ul a
  înregistrat **9.9.9.9**, prin web-ul **nou** și prin web-ul **vechi**.
- Măsurat, capcană de ocolire nr. 4: 121 cotări cu adresa falsificată → 429; o cotare cu altă
  adresă falsificată → **200** (evadare); adresa falsificată rămâne blocată (victimă închisă).
- **Nu există Caddyfile în repo** → convenția edge-ului nu e verificabilă din cod.
- Corecția e reală **doar** când edge-ul adaugă adresa clientului la sfârșitul lanțului
  (măsurat: lanțul `9.9.9.9, 8.8.8.8` → API-ul a înregistrat `8.8.8.8` prin web-ul nou, `9.9.9.9`
  prin web-ul vechi).

**Impact:** dacă edge-ul **nu adaugă** adresa clientului la lanț (sau e absent), un client care
trimite antetul își alege adresa de contor: evadează limitele per-adresă și poate bloca un
vizitator real. Nu e o regresie (vechea versiune era la fel), dar nici nu e închis.
**Ce ar închide:** web-ul să nu creadă lanțul decât în forma în care edge-ul îl construiește
(de ex. edge-ul să **rescrie** antetul cu `{remote_host}`), sau o regulă explicită „lanțul cu un
singur element nu e de încredere".

### `RT-P2-08` — P2 (medie) — `RT-P2-01` e reparat, dar **nu e acoperit de niciun test**

**Dovezi:** cu `keyGenerator` scos de pe limita globală (`api/src/app.ts:81`) și de pe cele șase
rute (`catalog.ts:171`, `orders.ts:64`, `settings.ts:304,365,413,569`), suita completă rămâne
**38/38 fișiere, 380/380 teste — verde**. Niciun test nu observă schimbarea; iar testul nou
„is kept per visitor" folosește o rută care avea deja cheia corectă.

**Impact:** o regresie pe această rută (de ex. cineva care reia `request.ip` într-o rută nouă)
trece neobservată. **Recomandare:** un test pe `POST /api/catalog/quote` și pe `POST /api/orders`
care să verifice că doi vizitatori diferiți nu împart contorul.

### `RT-P2-09` — P2 (medie) — acoperirea lui `addressRateLimitKey` e formală, nu comportamentală

**Dovezi:** 3 din cele 4 teste din `api/tests/phase14-address-key.test.ts` cad pe codul vechi doar
pentru că simbolul nu există (`TypeError: addressRateLimitKey is not a function`); al patrulea
(`keeps the counter of a client that speaks for itself`) trece peste ambele coduri. Niciun test nu
compară cheia **calculată** între două cereri reale cu proxy-uri diferite.

### `RT-P3-04` — P3 (mică) — starea `REFUNDED` poate fi ștearsă încă pe calea webhook-ului

**Dovezi (măsurat):** comanda `REFUNDED` + eveniment de plată → starea devine `CANCELLED`.
`api/src/routes/webhooks.ts:350-353` scrie `status: refunded ? 'REFUNDED' : 'CANCELLED'`, iar
rambursarea nu se execută când providerul nu e live (sau când eșuează). `RT-P3-02` a fost închis
doar pe ruta de anulare.

### `RT-P3-05` — P3 (mică) — `markOrderPaid` nu mai e idempotentă fără sumă

**Dovezi (măsurat):** `markOrderPaid({orderId})` pe o comandă deja plătită **aruncă**
`conflict: the payment carries no amount`, în loc să întoarcă abonamentele. Niciun apelator de
producție nu face asta (`webhooks.ts` și `orders.ts` trimit mereu suma), dar contractul din
documentația funcției („calling it twice does not create a second subscription and does not change
a paid order") nu mai e adevărat pentru această formă de apel.

### `RT-P3-06` — P3 (mică) — un personal nu-și mai poate rambursa propria comandă

**Dovezi (măsurat):** `POST /admin/orders/:id/refund` pe propria comandă → **403**
(„Only an administrator can act on the account of a member of the staff"), pentru că garda e
`assertMayActOnAccount(actor, order.user.role)` și ambele roluri sunt `STAFF`. Efect secundar al
reparației 10.

### `RT-P3-07` — P3 (mică) — comentariu învechit în `web/server.mjs`

`web/server.mjs:80-83` spune în continuare „The chain of the header is read from the left, because
the first element of the chain is the client" — exact inversul implementării actuale
(`web/src/lib/client-address.mjs:197-214`). Un cititor s-ar orienta greșit.

### `RT-P3-08` — P3 (informativă) — contoarele de eșec sunt în memoria procesului

`api/src/lib/failed-attempts.ts` ține contoarele într-un `Map` în memorie. Limita de forță brută
e **per instanță** a API-ului. Nu e o regresie — vechea limită (@fastify/rate-limit fără un store
Redis, `api/src/app.ts`) era tot în memorie — dar la o scalare pe mai multe replica, limita
efectivă se înmulțește cu numărul de replici.

### `RT-P3-09` — P3 (informativă) — contorul de adresă nu se șterge niciodată

Contorul de **eșecuri pe adresă** se șterge doar la... nu se șterge deloc (se șterge doar contorul
de cont, printr-o autentificare reușită). Zece eșecuri de pe aceeași adresă în 15 minute blochează
adresa respectivă tot fereastra, chiar dacă utilizatorul autentifică corect între timp. Pentru un
clienți din spatele unui NAT partajat (un birou) e un efect de colateralitate.

### `RT-P2-06` — **ÎNCĂ DESCHIS** — stiva de revizie rulează cod vechi (și, la final, e oprită)

**Măsurat la începutul sesiunii:** procesul API de pe `127.0.0.1:3101` pornise la `00:28:14`; în
`/tmp/api-check/dist` nu există **niciunul** dintre simbolurile noi (`addressRateLimitKey`,
`loginGuardForAttempts`, `failed-attempts`) și nici cele din faza 13 (`orders/:id/confirm`,
`assertMayActOnAccount` — 0 potriviri fiecare); 13 fișiere din `/tmp/api-check/src` diferă de ramă.
Stiva pe care privește un revizor era **cu trei faze în urmă**.

**La finalul sesiunii stiva e oprită** (3101 și 30003 refuză conexiunea). Nu am oprit-o eu —
vezi detaliul în §10: la 02:55 a rulat o construcție și lansare docker completă a ramurii de
reparare (`/tmp/deploy-build.log`), în cadrul lucrării lead-ului. **Substanța constatării
rămâne neschimbată**: build-ul stivei (`/tmp/api-check/dist`) e în continuare din `23:21`, adică
**pre-remediere**. Nu s-a rezolvat — și, în plus, cineva trebuie să reconstruiască stiva din ramă
înainte ca pe ea să se dea orice verdict.

### `RT-P2-02` — **ÎNCĂ DESCHIS** — planul anual nu e accesibil din interfață

**Măsurat:** `web/src/app/Deploy.tsx:264-271` trimite cotarea **fără** `period`; serverul
aplică `MONTHLY`. Catalogul afișează `period=MONTHLY amount=149`. Cotarea cu `period=YEARLY`
scrisă de mână dă `1788` — deci API-ul e corect, **interfața nu ajunge niciodată acolo**.
Identic ca în faza 13: mecanismul e reparat, funcția de alegere nu există.

### `RT-P2-05` — **ÎNCĂ DESCHIS** — fișa unui cont `ADMIN` rămâne lizibilă de un personal

**Măsurat** (personal cu `customers.read`):
```
GET /api/admin/customers/<ADMIN> -> 200
{"customer":{"id":"...","email":"admin.rt1415@example.test","name":"T R","role":"admin",
 "createdAt":"...","emailVerified":true,"suspendedAt":null,"pterodactylUserId":null,
 "totalSpent":0,"instances":[],"invoices":[],"tickets":[],"orders":[...]}}
```
Garda `assertMayActOnAccount` e, prin construcție, pe **scrieri**; citirea rămâne deschisă.

### `RT-P3-03` — **ÎNCĂ DESCHIS** — două mecanisme paralele pentru `Secure`

`api/src/env.ts:144` calculează în continuare `env.cookieSecure` din `APP_ORIGIN`, iar
`env.cookieSecure` **nu e folosit de nimeni** în `api/src`. Repararea din faza 13 folosește
`resolveCookieSecure` (`api/src/plugins/auth.ts:58-64`). Inconsecvență de sursă, fără efect
funcțional, dar derutează un operator care citește `env.cookieSecure`.

---

## 8. Starea suitei complete

**Rularea oficială pe vârful `4969f4a`, pe baza mea `rt1415_test`:**

```
 Test Files  38 passed (38)
      Tests  380 passed (380)

# tests 89
# pass 89
# fail 0
```

Comparație cu vârful verificat în faza 13: **36 → 38** fișiere de test API (36 + 3 noi − 1 șters),
**366 → 380** teste, **87 → 89** teste web. Nimic nu s-a rupt.

### 8.1 Ce e acoperit și ce nu, măsurat prin deconectare

Am rulat **suita completă** pe copii de lucru cu o reparare deconectată:

| Copie de lucru | Rezultat | Ce înseamnă |
|---|---|---|
| **Pristin** (`4969f4a`) | 38/38 fișiere, **380/380 teste** | baza de comparație |
| **Limita per-adresă deconectată** (`keyGenerator` scos de pe limita globală și de pe cele șase rute) | 38/38 fișiere, **380/380 teste — VERDE** | **niciun test nu apără `RT-P2-01`** (`RT-P2-08`) |
| **Garda de checkout eliminată** | 1 fișier căzut; **2 teste căzute** | cele două teste care apelează checkout-ul |
| **Verificarea sumei din `markOrderPaid` eliminată** | 1 fișier căzut; **1 test căzut** | „pays the order the sum it was quoted" |
| **Regula `STAFF` eliminată** | 1 fișier căzut; **1 test căzut** | „does not let a member of the staff suspend another member of the staff" |
| **Garda de rambursare mutată după verificarea „comanda e plătită"** | 1 fișier căzut; **1 test căzut** | testul e sensibil la **poziția** gardei, nu doar la existența ei |
| **Garda de autentificare pusă înapoi la „numără toate cererile"** | 1 fișier căzut; **2 teste căzute** | „does not count a sign-in that worked", „forgets the attempts that failed when the sign-in works" |

Ieșirea fiecărui caz e în `_raw/rt1415-revert-results.tgz`.

---

## 9. Certificarea finală

**Ce este într-adevăr închis.** Din cele 11 afirmații, **10 sunt `DA`** și una este `PARȚIAL`.
Faza 15 a închis cele trei constatări pe care le-am raportat ca fiind încă deschise și grave:
`RT-P1-01` (era **P0** — ocolirea `cancel → checkout → plată` care producea o comandă `PAID` cu
infrastructură, factură și abonament) e **moartă**: checkout-ul refuză cu 409, iar comanda anulată
sau rambursată rămâne moartă chiar și când primește un eveniment de plată — am măsurat `0`
instanțe, `0` facturi, `0` abonamente. `RT-P1-02` e închis pe jumătatea „de personal"
(suspendarea unui personal de către un personal → 403), iar `RT-P2-04` e închis (rambursarea
comenzii unui administrator → 403, înainte de orice verificare de plată, deci și pentru o comandă
neplătită). `RT-P3-02` e închis pe ruta de anulare, `RT-P3-01` e închis (fișierul de sondaj e
șters, iar numărul de fișiere de test confirmă 36 + 3 − 1 = 38). `RT-P2-03` e închis: suma
dată de apelant e verificată fail-closed, **iar calea de recuperare a operatorului nu e stricată**
— am măsurat-o pe endpointul real de reluare: comandă `FAILED`, sumă corectată, replay → `PAID`
cu instanță, factură și abonament. Reparația 4 (faza 14) **nu a deschis o cale de forță brută**:
am măsurat toate cele trei forme de atac — zece eșecuri pe un cont de la zece adrese diferite,
zece eșecuri pe zece conturi de la o adresă, și zece eșecuri printr-un proxy neîncredincios cu
conexiuni noi — și în toate trei cazurile a 11-a încercare e refuzată cu 429. Reparațiile 2 și 3
închid `RT-P2-01`: contorul limitei de cotare e per vizitator, nu de platformă (un vizitator
diferent primește 200 imediat după ce primul a fost refuzat). Fișierul de test web rescris e
**o schimbare onestă**: intenția e păstrată, convenția inversată era chiar defectul, iar cazul
falsificatorului e acum acoperit **și prins de test** (pe resolverul vechi testul cade cu
`actual '9.9.9.9'`).

**Ce nu e închis.** Reparația 1 e `PARȚIAL`: mecanismul e corect și demonstrat (lanțul cu două
elemente → API-ul înregistrează adresa reală, `8.8.8.8`, nu cea falsificată), dar **lanțul cu un
singur element** — adică un client care trimite antetul direct, sau un edge care nu adaugă — e în
continuare credut de ambele versiuni: am măsurat că API-ul înregistrează `9.9.9.9` prin web-ul
**nou**, exact ca prin web-ul vechi, și că atacatorul evadează limita per-adresă și poate bloca
un vizitator real. Convenția edge-ului **nu e verificabilă din cod** (nu există Caddyfile în
repo) → `RT-P2-07`. În plus, două acoperiri de test sunt **slabe**, iar asta e măsurat, nu
susținut: `RT-P2-01` e reparat, dar cu cheia deconectată **suita completă rămâne verde
380/380** → niciun test nu o apără (`RT-P2-08`); iar `phase14-address-key.test.ts` cade pe codul
vechi doar fiindcă simbolul nu există, nu pentru că comportamentul e diferit (`RT-P2-09`). Trei
defecte mici noi: starea `REFUNDED` poate fi ștearsă încă **pe calea webhook-ului** (măsurat:
`REFUNDED` + eveniment de plată → `CANCELLED`, `RT-P3-04`); `markOrderPaid` nu mai e idempotentă
când e apelată fără sumă pe o comandă deja plătită (`RT-P3-05`); un personal nu-și mai poate
rambursa propria comandă (`RT-P3-06`). Plus `web/server.mjs:80-83`, care spune în continuare că
lanțul se citește din stânga (`RT-P3-07`).

**Cele patru afirmații „nu am reparat" — confirmate, toate încă deschise.** `RT-P2-02` (planul
anual nu e accesibil din interfață: `Deploy.tsx:264-271` trimite cotarea fără `period`; catalogul
arată `MONTHLY`/149; cotarea cu `period=YEARLY` scrisă de mână dă 1788). `RT-P2-05` (un personal
cu `customers.read` citește integral fișa unui `ADMIN` — 200, cu email, rol, comenzi, facturi și
total cheltuit). `RT-P2-06` (stiva de revizie de pe `3101`/`30003` rulează în continuare cod
pornit la `00:28:14`: **zero** potriviri pentru `addressRateLimitKey`, `loginGuardForAttempts`,
`failed-attempts`, `orders/:id/confirm` sau `assertMayActOnAccount` în `dist`, și 13 fișiere
diferite față de ramă — un revizor privește acum o stivă cu **trei faze în urmă**). `RT-P3-03`
(`env.cookieSecure` există în continuare la `env.ts:144` și nu e folosit de nimeni).

**Concluzia.** Cele două faze sunt, în fond, **bune**: fiecare dintre cele 11 afirmații are un
mecanism real, server-side, iar eu le-am verificat pe instanțe proprii, cu ocoliri, nu prin
citirea mesajelor de commit. Faza 15 închide constatarea P0 pe care o raportasem — șase ocoliri
reparate, măsurate, cu test de regresie care chiar eșuează fără reparare. Ce nu pot semna e că
**gata**: `RT-P2-01` e reparat fără niciun test care s-o apere, iar repararea 1 de adresa clientului
e corectă doar pentru convenția pe care edge-ul o respectă — iar acea convenție **nu e în repo**.
Recomandarea mea, în ordine: (1) fie se adaugă în repo configurația edge-ului, ca convenția
lanțului să fie o faptă verificabilă, fie se schimbă web-ul să nu creadă un lanț cu un singur
element; (2) adaugă două teste — unul pe `POST /api/catalog/quote` și unul pe `POST /api/orders` —
care să dovedească per vizitator, pentru ca `RT-P2-01` să nu se poată strica în tăcere; (3)
închide calea webhook-ului pentru starea `REFUNDED` (`RT-P3-04`); (4) reconstruiește stiva de
revizie `3101`/`30003` din ramă, sau pune un control care obligă la asta — altfel orice verdict
următor dat pe acea stivă e despre cod vechi. **Faza 14–15: aproape încheiată, cu trei găuri
mici, dintre care una (`RT-P2-07`) depinde de o convenție care nu e în cod.**

---

## 10. Anexă — reproducere și curățenie

```bash
# copii de lucru separate
cd /opt/blipmade && git archive 4969f4a | tar -x -C /tmp/rt1415/new
cd /opt/blipmade && git archive 888a274 | tar -x -C /tmp/rt1415/old
# testele noi puse peste arborele vechi, ca măsurarea să aibă sens
cp /tmp/rt1415/new/api/tests/phase1[45]-*.test.ts /tmp/rt1415/old/api/tests/
cp /tmp/rt1415/new/web/tests/client-address.test.mjs /tmp/rt1415/old/web/tests/

# suita pe baza proprie
cd /tmp/rt1415/new && TEST_DB_NAME=rt1415_test bash scripts/run-tests.sh

# ocolirea principală (faza 15)
#   POST /api/orders            -> o comandă
#   POST /api/orders/:id/cancel -> 204
#   POST /api/orders/:id/checkout -> 409, starea rămâne CANCELLED
#   POST /api/webhooks/stripe/test -> comanda rămâne CANCELLED, 0/0/0

# adresa clientului, capcană cu lanț scurt
curl -H 'X-Forwarded-For: 9.9.9.9' -d '{"email":"x@example.test","password":"wrong"}' \
     http://127.0.0.1:30103/api/auth/login    # apoi: SELECT ip FROM "AuditLog" ...
```

**Ce am lăsat în urmă:**
- Ramura `remediation/phase-2-critical-fixes`: **neatin**să de mine (`git status` curat). **Vârful s-a
  mutat din nou în timpul retestului**, la `fdd19d8` — dar `git diff 4969f4a..fdd19d8 -- api/src
  api/tests web/src api/prisma` este **gol**: s-au adăugat doar documente de audit. Verdictul de
  mai sus e valabil pentru vârful curent.
- Bazele mele (`rt1415_test`, `rt1415_old_test`, `rt1415b_test`) șterse.
- Instanțele mele (3102, 3105, 30103, 30104, 3110) oprite prin **PID exact**, toate verificate ca
  fiind ale mele prin `cwd` și `ss`.
- `/tmp/rt1415` și `/tmp/rt1415b` eliminate; clientul Prisma comun regenerat din repo.
- Worktree-ul `/home/debian/bm-phase14` **nemodificat**.
- **Stiva comună de revizie `3101`/`30003`: la începutul sesiunii era activă** (3101 → 200,
  30003 → 200) **și la final este oprită**. **Nu am oprit-o eu**: toate opririle mele au fost
  limitate la arborii mei (`case "$cwd" in *rt1415*)` și la porturile mele. Cei doi procese care o
  țineau (`/tmp/api-check/api` și `/tmp/web-check`) nu mai există; în schimb, la **02:55** a rulat
  `/tmp/deploy-build.log` — o **construcție și lansare docker completă** a ramurii de reparare
  (`blipmade-web`, `blipmade-api`, `blipmade-worker`), iar containerele docker au repornit la
  `02:55:56`. Deci stiva a fost oprită în cadrul **lucrării de lansare a lead-ului**, nu de mine.
  Nu am repornit-o: build-ul ei (`/tmp/api-check/dist`, din `23:21`) e în continuare
  **pre-remediere**, deci repornirea ar perpetua `RT-P2-06`; și o repornire în timpul unei
  lansări ar putea intra în conflict cu ea. **Recomandarea rămâne: reconstruiește stiva de
  revizie din ramă înainte de orice verdict dat pe ea.**

