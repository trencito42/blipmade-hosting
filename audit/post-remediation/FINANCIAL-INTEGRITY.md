# REVIEW INTEGRITATE FINANCIARĂ — Blipmade

**Audit post-remediere · runda 2 (independentă)**

---

## 1. Antet — ce a fost testat, unde, când, cu ce instrumente și limitări

### 1.1 Ce a fost testat

Corectitudineaeconomică a întregului lanț comercial: cotare → comandă → rezervare promoție → plată → factură → abonament → provisionare → compensare → rambursare → retenție/export → reconciliere. Auditul a urmărit în special **granularitatea tranzițiilor de stare ale comenzii**, **atomicitatea contoarelor și a numerelor de document**, **cursul sumei cotate vs. suma încasată**, **limitele campaniilor** și **compensația eșecului de provisionare**.

Nu am presupus că remedierea anterioară a funcționat. Fiecare afirmație din raportul anterior a fost re-testată fie pe cod, fie pe comportamentul observabil al stivei izolate.

### 1.2 Unde

| Componentă | Locație | Observații |
|---|---|---|
| Cod API (auditat) | `/root/blipmade-work/api` (copie locală) | Comparată hash cu `api/src` + `api/prisma` din repo-ul VM |
| Cod API (autoritativ) | `ssh debian@10.77.0.13:/opt/blipmade`, branch `audit/post-remediation`, commit `29a86cc` | Prezența unor **modificări necomise** în `api/src/env.ts` și `api/src/routes/auth.ts` (vezi §1.5) |
| Stivă izolată (deschisă de conducere) | API `127.0.0.1:3101`, web `127.0.0.1:30003`, DB `blipmade_test` | **Nu am scris în `blipmade_test` în faza finală a auditului**; vezi §1.6 |
| Stivă izolată proprie (folosită pentru teste) | API `127.0.0.1:3198` și `127.0.0.1:3199`, DB **`blipmade_audit_test`**, Redis DB 1 | Creată de mine, pe VM, cu `prisma migrate deploy` propriu. Fără impact pe producție |
| Producție (citire exclusivă) | containere `blipmade-api-1`, `blipmade-web-1`, `blipmade-worker-1`, `blipmade-postgres-1`, `blipmade-redis-1` | `docker ps`, `docker compose config`, `docker exec ... env` (doar **numele** variabilelor), `docker logs`, `SELECT` pe `blipmade` |

### 1.3 Când

23 octombrie 2026, ~19:25–20:05 EDT (23:25–00:05 UTC). Toate măsurătorile sunt reproductibile în fereastra descrisă; rata de limitare a worker-ului și starea cozilor sunt dependente de moment.

### 1.4 Instrumente

- `read` / `grep` / `glob` pentru inspecția codului (fără modificări).
- `ssh`, `docker ps|exec|logs|compose config`, `psql` (doar `SELECT` pe producție).
- `npm audit --json` (API și web) — fără `npm install`.
- Scripturi proprii în `/tmp/audit-sec/` pe VM: `seed.mjs`, `tests.mjs` … `tests5.mjs`, `start-api.mjs`.

**Nu am rulat** `scripts/run-tests.sh` (suita aparține conducătorului), **nu am rulat** `npm install`, **nu am modificat** niciun fișier sursă, **nu am făcut deploy**, **nu am rotit credențiale**, **nu am atins firewall-ul**, **nu am injectat defecte în producție**.

### 1.5 Limitări și divergențe

1. **Repo-ul s-a modificat în timpul sesiunii.** La prima inspecție, `git status` era curat; ~30 de minute mai târziu, `api/src/env.ts` și `api/src/routes/auth.ts` apăreau ca modificate **necomis** (variabila `LOGIN_RATE_LIMIT_MAX` a fost adăugată, iar limita de autentificare a devenit configurabilă din mediu). Am auditat **starea curentă** (inclusiv modificarea), dar constatările despre limitele de autentificare sunt marcate `CODE-INSPECTED` pentru cod și `VERIFIED` doar pentru configurația observată.
2. **Stiva izolată are `NODE_ENV=test` → coada BullMQ este dezactivată** (`isQueueEnabled = env.isProduction || env.NODE_ENV !== 'test'`). Prin urmare, **provisionarea reală (crearea containerului Pterodactyl) nu poate fi observată** în stiva izolată: se creează rândul `Instance`, dar nu se pornește niciun job. Concluzia despre poartă de plată este `CODE-INSPECTED` + confirmată prin testul de comportament al stării (`Instance` nu este creat pentru o comandă neplătită la nivelul aplicației).
3. **Nu există cheie Stripe în nicio stivă** (`STRIPE_SECRET_KEY` gol). Calea reală `stripeLive()` n-a putut fi exercitată; a fost exercitată calea `stripeTestGateway()`, care are aceleași funcții de stare (`markOrderPaid`, `upsertInvoice`, `fulfilOrder`), cu excepția verificării de semnătură.
4. **Nu am putut verifica** TLS-ul, configurația reverse-proxy-ului de la margine, DNS-ul, Proxmox, permisiunile Pterodactyl sau backup-urile reale — vezi §5.
5. **Restul bazei de date de test a fost trunchiată concurent** de suita conducătorului (`blipmade_test` a devenit gol în timpul primei seed-uiri). De aceea am mutat toate testele în `blipmade_audit_test`.

### 1.6 Declarație explicită privind scrierile în producție

**Nu am scris niciodată în baza de date de producție `blipmade`.** Nu am rulat migrări, `INSERT`, `UPDATE` sau `DELETE` pe această bază; nu m-am autentificat pe `blipmade.com`.

Verificare (citire): `SELECT email FROM "User" WHERE email LIKE '%@example.test'` pe `blipmade` → **doar** `qa.headless.one@example.test` și `qa.headless.two@example.test` (conturile rundei anterioare, **nu** ale mele). Conturile mele (`qa.check@`, `qa.other@`, `admin.check@`, `audit1..6@`) **nu există** în producție.

**Singurele rânduri scrise de mine în afara propriei baze au fost în `blipmade_test`** (baza izolată comună), înainte de a-mi crea baza proprie, și sunt enumerate în §5.4 pentru curățare. **Nu am folosit niciodată portul 30002 și nu am accesat `https://blipmade.com`.**

---

## 2. Metodă

### 2.1 Comenzi concrete

```bash
# a) paritatea codului auditat cu repo-ul autoritativ
find api/src api/prisma -type f | sort | xargs md5sum          # local
ssh debian@10.77.0.13 'cd /opt/blipmade && find api/src api/prisma -type f | sort | xargs md5sum'

# b) starea de pe VM
ssh debian@10.77.0.13 'docker ps --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"'
ssh debian@10.77.0.13 'docker exec blipmade-api-1 env | cut -d= -f1 | sort'   # doar nume
ssh debian@10.77.0.13 'docker logs blipmade-api-1 --tail 400 | grep -o "\"ip\":...'
ssh debian@10.77.0.13 'ss -ltnp | grep -E "3100|3101|30003"'

# c) dependințe (fără instalare)
cd api && npm audit --json > /tmp/audit-api.json
cd web && npm audit --json > /tmp/audit-web.json
```

### 2.2 Stiva de test proprie

```bash
# baza de date proprie, cu nume conform regulii de izolare
docker exec -e PGPASSWORD="$PW" blipmade-postgres-1 psql -U blipmade -d postgres \
  -c "create database blipmade_audit_test;"
cd /opt/blipmade/api && \
  DATABASE_URL="postgresql://blipmade:${PW}@localhost:5432/blipmade_audit_test?schema=public" \
  ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
# două instanțe API, cu configurații de proxy diferite
node /tmp/audit-sec/start-api.mjs      # :3199  TRUSTED_PROXIES gol   (ca în producție)
node /tmp/audit-sec/start-api-b.mjs    # :3198  TRUSTED_PROXIES=127.0.0.1,::1
```

### 2.3 Scripturi de test

| Script | Ce face |
|---|---|
| `/tmp/audit-sec/seed.mjs` | Creează catalogul (4 produse, prețuri MONTHLY + YEARLY), 9 conturi și 3 promoții. **Refuză explicit** orice bază care nu se termină în `_test`/`_check`/`_audit` |
| `/tmp/audit-sec/tests.mjs` | FIN-T1…FIN-T9, SEC-T1…SEC-T10 (atomicitate, promoții, anulare, IDOR, CSRF, cookies, limitare, SQLi, traversal, semnătură webhook, scurgere de erori) |
| `/tmp/audit-sec/tests2.mjs` | FIN-T10…FIN-T16, SEC-T11…SEC-T14 (plăți pe comenzi anulate/rambursate, prăbușirea limitatorului per-IP, flag-ul `Secure`, webhookul fără semnătură accesibil din LAN, rutele interne) |
| `/tmp/audit-sec/tests3.mjs` | FIN-T17…FIN-T22 (calea gratuită, abatere de sumă, secvența numerelor, reconcilierea prețurilor) |
| `/tmp/audit-sec/tests4.mjs` | FIN-T23…FIN-T26 (comenzile **cu total 0**: ce rânduri se scriu, anulare, rambursare) |
| `/tmp/audit-sec/tests5.mjs` | FIN-T27…FIN-T31 (upgrade-uri neplătite, retenție/export, cursa contorului de promoție, mașina de stări a comenzii) |

### 2.4 Cereri HTTP reprezentative

```bash
# 25 comenzi concurente -> numerele de comandă
for i in $(seq 1 25); do curl -s -X POST http://127.0.0.1:3198/api/orders \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -b "$JAR" \
  -H "X-Forwarded-For: 198.51.100.$i" \
  -d '{"items":[{"productSlug":"wordpress","ram":1024,"cpu":1,"disk":10}]}' & done; wait

# 15 rezervări concurente ale aceleiași campanii (maxRedemptions=2)
#   -> acceptate=2, respinse=13, rezervări în baza=2

# 12 creări concurente de factură prin calea upsertInvoice()
#   -> introduse=3, respinse=9 cu P2002 pe (`number`)

# comandă anulată apoi "plătită" prin calea locală (total 0)
curl -X POST http://127.0.0.1:3198/api/orders/$ID/checkout
#   -> order.status: CANCELLED -> PAID ; instances: 0 -> 1
```

---

## 3. Verificarea afirmațiilor remediării

**Legendă:** `VERIFIED` = reprodus pe comportamentul observabil · `CODE-INSPECTED` = confirmat prin lectură de cod, fără test dinamic · `INFERRED` = deducție solidă din cod și configurație · `UNVERIFIED` = nu am reușit să verific · `STILL BROKEN` / `PARTIALLY FIXED` / `REGRESSION INTRODUCED` = stările negative.

| # | Afirmația rundei anterioare | Cum am verificat | Rezultat | Evidență |
|---|---|---|---|---|
| R1 | **„Provisionarea se face doar pentru comenzi plătite"** | Lectura porții de plată din serviciu + testul comenzii neplătite | **VERIFIED** | `services/provisioning.ts:87` (`orderIsPaid`), poarta în `services/provisioning.ts:1090` — în **serviciu**, nu în rută; `worker.ts:104` nu reîncarcă decât instanțe cu ordin `PAID`/`FULFILLED`. FIN-T7: comandă `PENDING` → 0 instanțe, 0 joburi. **Rezervă:** poarta este corectă, dar poate fi ocolită printr-o comandă marcată `PAID` fără bani (FIN-P1-01) |
| R2 | **„Numărul de comandă este atomic"** | 25 `POST /orders` concurente + inspecția SQL a secvenței | **VERIFIED** | `services/order-numbers.ts` (actualizare cu `GREATEST(...) + 1` într-o singură instrucțiune); FIN-T1: 25/25 create, 25 numere distincte, 0 duplicate; FIN-T20: 128 comenzi, 0 duplicate |
| R3 | **„Numerele de factură folosesc același contor atomic"** | 12 `upsertInvoice()` concurente + inspecția codului | **STILL BROKEN** | `services/stripe.ts:475` folosește în continuare `invoice.count() + 1`; contorul atomic `nextInvoiceNumber()` există (`services/order-numbers.ts:104`) și e folosit în `services/billing.ts:635,938`, **dar nu aici**. FIN-T06: 12 cereri → 3 introduse, **9 eșuate cu P2002 pe (`number`)** |
| R4 | **„Nu se fabrică facturi plătite"** | Test cu abatere de sumă; test cu comandă gratuită | **PARTIALLY FIXED** | Nicio factură (`Invoice`) nu e creată fără bani: FIN-T19 (abatere → `FAILED`, 0 facturi) și FIN-T23 (comandă gratuită → 0 facturi). **Dar** se scrie un rând `Payment` cu `status='SUCCEEDED'` și `amount=0` (FIN-T23) — o înregistrare de plată "reușită" fără bani |
| R5 | **„Evenimentele webhook amânate sunt reluate"** | Lectura codului + ledger-ul `WebhookEvent` | **VERIFIED** (cod) | `routes/webhooks.ts:60` (`MAX_ATTEMPTS=12`), `DeferredWebhookError` → `markDeferred`, reluat de worker la 5 min (`worker.ts:201`); evenimentele reușite au `attempts=0`, `status='processed'` |
| R6 | **„O comandă anulată nu este onorată niciodată"** | Test pe calea webhook **și** pe calea locală de checkout | **STILL BROKEN** | Calea webhook: **corectă** — `routes/webhooks.ts:383` refuză `CANCELLED`/`REFUNDED`; FIN-T10: comandă anulată + plată → rămâne `CANCELLED`, 0 instanțe. **Dar calea locală nu are gardă:** `routes/orders.ts:160` verifică doar `PAID`/`FULFILLED`. FIN-T03/FIN-T04: `CANCELLED`/`REFUNDED` → checkout → `AWAITING_PAYMENT`. **FIN-T24: comandă anulată cu total 0 → `PAID` → 1 instanță + 1 abonament** |
| R7 | **„O creștere de resurse se aplică doar dacă e plătită"** | Test pe rută + test direct pe serviciu | **VERIFIED** | `services/upgrades.ts:124` refuză orice ordin care nu e `PAID`/`FULFILLED`. FIN-T27: `PUT /instances/:id/resources` → `requires_payment`, ordin `AWAITING_PAYMENT`, **instanța neatinsă** (RAM 1024). FIN-T28: `applyUpgradeOrder` → `applied=false`, motiv „nu a fost plătit" |
| R8 | **„Reconcilierea prețurilor"** | Test pe endpointul de admin | **VERIFIED** | `POST /api/admin/instances/reconcile-prices` → HTTP 200, `{checked:2, corrected:0, differences:[]}`; worker-ul rulează și `reconcileWithProvider()` + `reconcileInvoicesWithProvider()` la fiecare 15 min (`worker.ts:200`) |
| R9 | **„Planul anual"** | Cotare YEARLY vs. creare de comandă | **STILL BROKEN** | `POST /api/billing/quote` cu `period:'YEARLY'` → **1890**; `POST /api/orders` pentru aceeași configurație → **189**; `config.period` al liniei de comandă este mereu `MONTHLY`. Cauză: `services/pricing.ts:422` — `buildQuote` apelează `priceItems(items)` **fără perioada**. FIN-T16 |
| R10 | **„Retenția și exportul"** | Test pe export + inspecția codului retenției | **PARTIALLY FIXED** | Exportul e disponibil la cerere, înainte și după anulare (FIN-T29: HTTP 200, chei `customer,instance,product,order,subscription,invoices,payments,events,domains,tickets`). **Dar** la anulare `deletionScheduledFor=null` și `exportAvailable=false`: înregistrarea de retenție se scrie doar la **sfârșitul perioadei plătite** (`withdraw()`), nu la anulare |
| R11 | **„Limitile campaniei sunt atomice"** | 15 rezervări concurente, 6 conturi, `maxRedemptions=2` | **VERIFIED** | `services/pricing.ts:297` — `SELECT ... FOR UPDATE` pe rândul campaniei în interiorul tranzacției. FIN-T02: acceptate=2, respinse=13, rezervări=2, motivul refuzului „a atins limita" |
| R12 | **„Promoția se consumă doar la plată"** | Inspecție + test al cursei | **PARTIALLY FIXED** | Limitele reale sunt respectate (rezervările se numără din `PromotionRedemption`, nu din `usedCount`). **Dar** contorul denormalizat `usedCount` se dublează la două webhook-uri concurente: FIN-T30 → `usedCount=2` cu 1 singură redemption |
| R13 | **„Compensarea la eșecul provisionării"** | Lectura codului + verificarea semanticilor BullMQ | **VERIFIED** (cod) | `services/queue.ts:42` (`isLastAttempt`) e corect pentru BullMQ 5.81.5 (`attemptsMade` se incrementează **după** eșec — `node_modules/bullmq/dist/cjs/classes/job.js:498,580`); `worker.ts:50` transmite `final`; `services/provisioning.ts:992` compensează (șterge serverul, eliberează adresa, rambursează). Rambursarea e protejată de o preluare atomică (`updateMany` pe `status in ('PAID','FULFILLED')`, `services/provisioning.ts:922`) → **rambursare dublă imposibilă**. `services/queue.ts:120` curăță joburile eșuate la 10 min → istoricul BullMQ nu e un dead-letter permanent (ledgerul `WebhookEvent` și `InstanceEvent` sunt) |
| R14 | **„O comandă anulată nu lasă infrastructură orfană"** | Test + inspecția scrierii retenției | **PARTIALLY FIXED** | Compensarea șterge serverul (`services/provisioning.ts:1031`), dar înregistrările de retenție sunt scrise prin **read-modify-write al întregului obiect JSON** în tabela `Setting` (`services/billing.ts:346-352`, fără tranzacție sau blocaj) → pierdere de actualizare la scrieri concurente (FIN-P3-01) |
| R15 | **„Nicio factură duplicată la o livrare repetată a aceluiași eveniment"** | Test de concurență pe calea de onorare | **VERIFIED** (parțial) | `provisioningKey` este unic → nu se creează **două** instanțe; dar `fulfilOrder` face găsire-apoi-creare (`routes/webhooks.ts:263` vs `:266`) → la două livrări concurente una aruncă P2002 (FIN-T08, reprodus: `Unique constraint failed on the fields: (provisioningKey)`). Fără provisionare dublă, dar cu eroare ne tratată (FIN-P2-02) |

---

## 4. Constatări

### FIN-P1-01 — Comandă anulată/rambursată resuscitată și onorată prin calea locală de checkout

- **Severitate:** P0 / Critical
- **Modul afectat:** `api/src/routes/orders.ts`, `api/src/services/stripe.ts`, `api/src/routes/webhooks.ts`
- **Comportament observat:** `POST /api/orders/:id/checkout` nu verifică starea comenzii înainte de a o marca `PAID`. Pentru o comandă cu **total 0** (complet acoperită de o promoție), calea locală `markOrderPaid()` → `fulfilOrder()` înlocuiește statusul `CANCELLED` sau `REFUNDED` cu `PAID` și creează infrastructură.
  - FIN-T24: comandă `CANCELLED`, total 0 → după checkout: `status=PAID`, `fulfillmentStatus=PROVISIONING`, **1 instanță**, **1 abonament**, 1 plată.
  - FIN-T25: comandă `REFUNDED`, total 0 → după checkout: `status=PAID` (**starea de rambursare este distrusă**), **1 instanție nouă**, 1 plată.
  - FIN-T31: `PENDING → AWAITING_PAYMENT → CANCELLED → AWAITING_PAYMENT → CANCELLED`.
- **Comportament așteptat:** o comandă `CANCELLED` sau `REFUNDED` nu poate fi plătită și nu poate genera infrastructură. Tranziția `CANCELLED|REFUNDED → PAID` trebuie să fie imposibilă **în serviciu**, nu doar în handlerul de webhook.
- **Reproducere:**
  ```bash
  # 1. promoție 100% (value=10000 în baza de puncte)
  # 2. POST /api/orders  {items:[...], promotionCode:'<100%>'}   -> total=0
  # 3. POST /api/orders/{id}/cancel                              -> status=CANCELLED
  # 4. POST /api/orders/{id}/checkout                            -> status=PAID, instances=1
  ```
- **Cauză rădăcină (confirmată):** `services/stripe.ts:279` `markOrderPaid()` nu are o gardă de tranziție. La `:286` se calculează `alreadyPaid = status==='PAID' || status==='FULFILLED'`; orice altă stare (inclusiv `CANCELLED`, `REFUNDED`, `FAILED`) trece în `prisma.order.update({ data: { status: 'PAID' } })` la `:301`. Garda din `routes/webhooks.ts:383` acoperă **doar** calea webhook-ului. Calea locală `routes/orders.ts:167-169` apelează `markOrderPaid()` direct, fără nicio verificare.
- **Dovezi:** FIN-T24, FIN-T25, FIN-T31 (harness `/tmp/audit-sec/tests4.mjs`, `tests5.mjs`); cod `services/stripe.ts:279-303`, `routes/orders.ts:160-185`.
- **Impact:** după o rambursare, infrastructura este recreată și clientul primește din nou un serviciu fără să fi plătit; înregistrarea financiară a rambursării este suprascrisă. Poarta de provisionare (`services/provisioning.ts:1090`) este corectă, dar devine irelevantă: comanda *este* `PAID` în acel moment.
- **Remediere propusă:**
  1. În `markOrderPaid()` (și în `settleFreeUpgradeOrder`, `services/upgrades.ts:260`): acceptă doar stările `PENDING` / `AWAITING_PAYMENT` / `INCOMPLETE`; pentru `CANCELLED` / `REFUNDED` / `FULFILLED` / `FAILED` aruncă un conflict și **nu** scrie.
  2. În `routes/orders.ts:160`: respinge explicit `CANCELLED`, `REFUNDED`, `FAILED`, `AWAITING_PAYMENT`.
  3. În `services/billing.ts:1120` (marcarea unui ordin plătit la colectarea unei facturi): aceeași listă de stări.
  4. Adăugă o constrângere de **integritate în baza de date** (vedem FIN-P3-02) care să prevină tranziția din `CANCELLED`/`REFUNDED` în `PAID`.
- **Criterii de verificare:** FIN-T24 și FIN-T25 revin `PASS` (starea rămâne `CANCELLED`/`REFUNDED`, 0 instanțe, 0 abonamente, 0 plăți); FIN-T31 arată `PENDING → AWAITING_PAYMENT → CANCELLED` și o încercare de checkout după anulare întoarce HTTP 409/400 fără nicio scriere.

---

### FIN-P2-01 — Numerele de factură se calculează cu `count() + 1`: pierdere de factură la evenimente concurente

- **Severitate:** P1 / High
- **Modul afectat:** `api/src/services/stripe.ts` (`upsertInvoice`), calea webhook `invoice.paid`
- **Comportament observat:** 12 creări concurente de factură prin calea folosită de webhook-ul `invoice.paid` → **3 facturi introduse, 9 eșuate** cu `Unique constraint failed on the fields: (number)` (P2002).
- **Comportament așteptat:** fiecare factură primește un număr unic și unic; un eveniment de plată nu se poate pierde din cauza unei coliziuni de numere.
- **Reproducere:** `Promise.allSettled` pe 12 apeluri `upsertInvoice({stripeInvoiceId: 'audit-inv-<uniq>-<i>', ...})` pe aceeași stivă → 9 `PrismaClientKnownRequestError` P2002.
- **Cauză rădăcină (confirmată):** `services/stripe.ts:475-478`:
  ```ts
  const count = await prisma.invoice.count();
  await prisma.invoice.create({ data: { ...data, number: `BM-INV-${String(count + 1).padStart(5,'0')}` } });
  ```
  Contorul atomic `nextInvoiceNumber()` există deja (`services/order-numbers.ts:104`) și este folosit în `services/billing.ts:635` și `:938` — **dar nu în `upsertInvoice`**. Contorul `Setting` este, așadar, o sursă de adevăr, iar `count()+1` o a doua, incompatibilă.
- **Dovezi:** FIN-T06; cod `services/stripe.ts:475`.
- **Impact:** în producție, două facturi Stripe plătite care sosesc simultan produc una dintre ele eșuat cu HTTP 500. Webhook-ul este marcat `failed` și reîncercat (până la 12 ori, `routes/webhooks.ts:60`), dar aceeași coliziune se reproduce la fiecare reîncercare → **evenimentul ajunge în dead-letter și factura nu este înregistrată**. Clientul a plătit și nu are factură.
- **Remediere propusă:** în `upsertInvoice()` folosește `number: await nextInvoiceNumber()` (import existent în `services/order-numbers.ts`), la fel ca `services/billing.ts`. Elimină complet `invoice.count()` din tot codul. Adaugă un test de concurență în suita API cu 20 de `upsertInvoice()` paralele.
- **Criterii de verificare:** FIN-T06 revine `PASS` (12/12 introduse, 0 erori, 0 numere duplicate); niciun `P2002` pe `number` în logurile API.

---

### FIN-P2-02 — Onorarea comenzii nu este atomică: livrări concurente ale aceluiași eveniment

- **Severitate:** P2 / Medium
- **Modul afectat:** `api/src/routes/webhooks.ts` (`fulfilOrder`, `claimEvent`)
- **Comportament observat:** `fulfilOrder()` verifică existența instanței și apoi o creează, fără tranzacție (`routes/webhooks.ts:263` și `:266`). Două apeluri concurente pentru aceeași comandă → ambele trec verificarea → al doilea `create` aruncă P2002 pe `provisioningKey`. Eroarea **nu este tratată**: propagă până la handler-ul webhook-ului, care marchează evenimentul `failed` și returnează HTTP 500.
- **Comportament așteptat:** onorarea repetată a aceleiași comenzi este idempotentă și nu produce eroare.
- **Reproducere:** `Promise.all([fulfilOrder(id), fulfilOrder(id)])` după `markOrderPaid` → `PrismaClientKnownRequestError P2002 meta.target=['provisioningKey']` (FIN-T08). Consecință secundară: `fulfillmentStatus` nu ajunge la `PROVISIONING` și clientul vede un eșec la checkout.
- **Cauză rădăcină (confirmată):** găsire-apoi-creare fără tranzacție. Restricția de unicitate **previne corect** provisionarea dublă (așa cum cere remediația), dar transformă cursa într-o eroare.
- **Dovezi:** FIN-T08; cod `routes/webhooks.ts:262-281`.
- **Remediere propusă:** înlocuiește verificarea+crearea cu `prisma.instance.upsert({ where: { provisioningKey }, create: {...}, update: {} })` sau cu `createMany({ skipDuplicates: true })`, și tratează P2002 ca un succes idempotent. Separat: în `claimEvent()`, evenimentele cu starea `received` sunt considerate „abandonate" **imediat** (`routes/webhooks.ts:99`), fără a se aștepta `STALE_ATTEMPT_MS` — două livrări concurente ale aceluiași eveniment sunt astfel procesate simultan. Marchează evenimentul `processing` la preluare.
- **Criterii de verificare:** FIN-T08 nu mai aruncă P2005/P2002; `instances=1`, `subscriptions=1`; niciun eveniment `failed` în ledger după o livrare duplicată.

---

### FIN-P2-03 — Planul anual nu este comandabil: suma cotată nu este suma încasată

- **Severitate:** P2 / Medium
- **Modul afectat:** `api/src/services/pricing.ts` (`buildQuote`), `api/src/routes/orders.ts`
- **Comportament observat:** cotarea acceptă perioada (`POST /api/billing/quote`, `period:'YEARLY'` → 1890), dar crearea comenzii o **ignoră**: `POST /api/orders` pentru aceeași configurație încarcă **189** (prețul lunar), iar `config.period` al liniei este `MONTHLY`.
- **Comportament așteptat:** perioada aleasă de client să fie cea cotată și cea încasată; planul anual să fie disponibil prin comanda obișnuită.
- **Reproducere:** FIN-T16 — `yearlyQuote=1890`, `orderTotal=189`, `itemPeriod="MONTHLY"`.
- **Cauză rădăcină (confirmată):** `services/pricing.ts:422` — `const priced = await priceItems(items);` fără al doilea argument; semnătura `priceItems(items, period='MONTHLY')` pierde perioada. `POST /api/orders` (`routes/orders.ts:68`) nu acceptă și nu transmite `period`.
- **Dovezi:** FIN-T16; cod `services/pricing.ts:417-424`.
- **Impact:** dacă interfața afișează o cotare anuală și apoi plasează comanda, **suma încasată este cea lunară** — o eroare directă de „sumă cotată vs. sumă strănsă". Reține că numai calea de **reînnoire** (`createLocalRenewal`) suportă `YEARLY`.
- **Remediere propusă:** adaugă `period` în schema `POST /api/orders` (`z.enum(['MONTHLY','YEARLY']).default('MONTHLY')`), propagă-l în `buildQuote(items, promotionCode, userId, period)` și în `priceItems(items, period)`. Verifică explicit că `item.price.period` din cotare este cel al perioadei cerute.
- **Criterii de verificare:** FIN-T16 revine `PASS`: cotarea YEARLY și totalul comenzii sunt egale, iar `config.period` este `YEARLY`; perioada abonamentului (`currentPeriodEnd - currentPeriodStart`) este de ~12 luni.

---

### FIN-P2-04 — Calea locală de checkout acceptă comenzi anulate sau rambursate: posibilitatea unei a doua încasări

- **Severitate:** P2 / Medium
- **Modul afectat:** `api/src/routes/orders.ts:152-196`
- **Comportament observat:** garda de la `routes/orders.ts:160` respinge doar `PAID` și `FULFILLED`. O comandă `CANCELLED` sau `REFUNDED` trece și primește **o nouă sesiune de plată**, iar statusul ei este suprascris cu `AWAITING_PAYMENT` (FIN-T03, FIN-T04).
- **Comportament așteptat:** o comandă anulată sau rambursată nu poate fi repusă în circuitul de plată.
- **Reproducere:** FIN-T03 (`CANCELLED → checkout → AWAITING_PAYMENT`), FIN-T04 (`REFUNDED → checkout → AWAITING_PAYMENT`), FIN-T31.
- **Cauză rădăcină (confirmată):** lipsa unei liste explicite de stări admise în `routes/orders.ts:160`.
- **Dovezi:** FIN-T03, FIN-T04, FIN-T31.
- **Impact:** în fluxul Stripe real, clientul ar fi **taxat a doua oară** pentru aceeași comandă; banii ar fi întorși ulterior de `handleCancelledOrderPayment` (`routes/webhooks.ts:383` → `routes/webhooks.ts:340`), dar cu comisioane de plată și refund, și cu starea comenzii suprascrisă între timp.
- **Remediere propusă:** în `routes/orders.ts:160`, acceptă doar `PENDING` și `INCOMPLETE`; orice altă stare → `conflict`. (Remedierea este acoperită parțial de FIN-P1-01; tranziția din `services/stripe.ts` trebuie reparată **în plus**.)
- **Criterii de verificare:** FIN-T03/FIN-T04 revin `PASS` cu HTTP 409/400 și fără creare de sesiune de plată.

---

### FIN-P2-05 — Contorul `Promotion.usedCount` se dublează la webhook-uri concurente

- **Severitate:** P2 / Medium (contor denormalizat, fără efect asupra limitelor)
- **Modul afectat:** `api/src/services/stripe.ts:288-295`
- **Comportament observat:** două apeluri concurente ale lui `markOrderPaid()` pentru aceeași comandă cu promoție → `Promotion.usedCount = 2`, deși există **o singură** linie în `PromotionRedemption`.
- **Comportament așteptat:** contorul să reflecte numărul de redemptions reale.
- **Reproducere:** FIN-T30 — `Promise.all([markOrderPaid(id), markOrderPaid(id)])` → `usedCount=2`, `redemptions=1`.
- **Cauză rădăcină (confirmată):** `services/stripe.ts:288` citește `order.promotionRedeemedAt` **în afara tranzacției**, apoi `:290-294` execută un `$transaction` necondiționat. Nu există un `updateMany` cu `where: { promotionRedeemedAt: null }` care să facă verificarea și scrierea atomice.
- **Dovezi:** FIN-T30; cod `services/stripe.ts:288-295`.
- **Impact:** **limitele reale nu sunt afectate** (se numără din `PromotionRedemption`, `services/pricing.ts:309-325`), dar `usedCount` este afișat în interfața de admin și se poate folosi pentru raportare → indicatori greși. De asemenea, `releaseCancelledOrderPromotion` decrementează același contor, deci poate exista o **diferență permanentă** față de numărul real de redemptions.
- **Remediere propusă:** înlocuiește verificarea+incrementarea cu o singură operație atomică:
  ```ts
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, promotionRedeemedAt: null, promotionId: { not: null } },
    data: { promotionRedeemedAt: new Date() },
  });
  if (claimed.count === 1) await prisma.promotion.update({ where: { id: order.promotionId }, data: { usedCount: { increment: 1 } } });
  ```
  sau, mai bine, **elimine `usedCount` din toate calculele și din interfață**, folosind exclusiv `PromotionRedemption`.
- **Criterii de verificare:** FIN-T30 revine `PASS` (`usedCount=1`).

---

### FIN-P2-06 — Comandă gratuită: se scrie o plată „reușită" de 0 lei

- **Severitate:** P2 / Medium
- **Modul afectat:** `api/src/services/stripe.ts` (`upsertPayment`), `api/src/routes/orders.ts:167`
- **Comportament observat:** o comandă acoperită integral de o promoție (total 0) trece prin `markOrderPaid({amount: 0})` → se scrie un rând `Payment` cu `status='SUCCEEDED'`, `amount=0`, `currency='EUR'`. Nicio factură nu se creează (corect).
- **Comportament așteptat:** o comandă fără plată nu ar trebui să producă un înregistrări de plată cu stare „reușită", sau cel puțin starea ar trebui să fie distinctă (`FREE`/`SETTLED`), cu sumă 0, ca să nu fie numărată ca venit.
- **Reproducere:** FIN-T23 — `payments=[{s:'SUCCEEDED',a:0,c:'EUR'}]`, `invoices=0`, `status=PAID`, `instances=1`, `subscriptions=1`.
- **Cauză rădăcină (confirmată):** `services/stripe.ts:279` → `upsertPayment(order, params)` este apelat fără să distingă „plătit" de „acoperit de promoție".
- **Dovezi:** FIN-T23.
- **Impact:** sumele de plată raportate din tabela `Payment` includ ordine cu 0 lei marcate drept reușite; într-un raport de reconciliere cu furnizorul, o astfel de linie nu are corespondent la Stripe și poate fi tratată ca „factură lipsă" sau „plată fără factură".
- **Remediere propusă:** în calea `total === 0`, marchează comanda plătită fără a crea un `Payment` cu stare `SUCCEEDED` (de exemplu, un rând cu `status='FREE'`, sau deloc, cu un câmp explicit `settlement='PROMOTION'`); și asigură-te că raportul de venit exclude suma 0 și tipărește separat „comenzi acoperite de promoție".
- **Criterii de verificare:** FIN-T23 revine `PASS` cu `payments=0` (sau cu o stare distinctă, documentată).

---

### FIN-P3-01 — Înregistrările de retenție: read-modify-write fără blocaj → infrastructură orfană

- **Severitate:** P3 / Low (fereastră mică, proces unic)
- **Modul afectat:** `api/src/services/billing.ts:333-352, 446-448, 530`
- **Comportament observat:** toate înregistrările de retenție sunt ținute în **un singur rând** `Setting` cu cheia de retenție, ca un obiect JSON. `instanceRetentions()` citește întregul obiect, `writeRetentionRecords()` scrie întregul obiect înapoi — **fără tranzacție, fără `FOR UPDATE`, fără comparație de versiune**.
- **Comportament așteptat:** două retrageri simultane (sau o retragere + orice altă scriere a aceleiași chei) să nu se piardă reciproc.
- **Reproducere (analitică):** `services/billing.ts:446-448` (în `withdraw`) și `:530` (în `processCancelledInstances`) — ambele citesc→modifică→scriu același obiect.
- **Cauză rădăcină (confirmată):** modelul „read-modify-write" pe un blob JSON într-o singură linie.
- **Dovezi:** cod `services/billing.ts:333-352`; `FIN-T29` arată că înregistrarea de retenție **nu există** la anulare (doar la sfârșitul perioadei plătite).
- **Impact:** o actualizare pierdută înseamnă că un serviciu anulat nu primește termenul de retenție → **serverul lui rămâne pe nod** (infrastructură orfană) și datele clientului nu sunt șterse la termen.
- **Remediere propusă:** o linie pe instanță (tabelă `InstanceRetention` cu `instanceId` unic) în loc de un blob; sau, dacă se păstrează blob-ul, scrierea într-o tranzacție cu `SELECT ... FOR UPDATE` pe rândul `Setting`, cu reluare în caz de conflict.
- **Criterii de verificare:** test cu două retrageri simultane pe două instanțe distincte → ambele înregistrări prezente după scriere.

---

### FIN-P3-02 — Integritatea stărilor financiare nu este impusă de baza de date

- **Severitate:** P3 / Low (defect de întărire)
- **Modul afectat:** `api/prisma/schema.prisma`, `api/prisma/migrations/*`
- **Comportament observat:** nicio migrare din `api/prisma/migrations` nu conține o constrângere `CHECK`. Coloanele `Order.total`, `Order.discount`, `Invoice.amount`, `Invoice.total`, `Payment.amount` sunt `Int` fără limită inferioară; nu există o enumerare de stări impusă la nivel de bază de date pentru `Order.status`.
- **Comportament așteptat:** o bază de date care nu poate reprezenta sume negative, și tranziții imposibile blocate la nivelul datelor, nu doar al codului.
- **Reproducere:** `grep -rn "CHECK" api/prisma/migrations/` → **niciun rezultat**.
- **Cauză rădăcină (confirmată):** modelul de date folosește `String` pentru stări, fără `enum` Prisma, fără constrângeri SQL.
- **Dovezi:** `api/prisma/migrations/` (11 migrări, 39 de referințe `FOREIGN KEY`, 0 `CHECK`).
- **Impact:** tranziția `CANCELLED → PAID` (FIN-P1-01) nu este împiedicată de baza de date; o eroare de cod sau un import direct poate produce sume negative sau stări iliceite.
- **Remediere propusă:** adaugă `CHECK (total >= 0)`, `CHECK (discount >= 0)`, `CHECK (amount >= 0)` pe tabelele financiare și o constrângere `CHECK (status IN (...))` pe `Order.status`, cu o migrare care normaliză mai întâi datele existente. Ideal, un `enum OrderStatus` Prisma.
- **Criterii de verificare:** o inserare cu `total = -1` sau cu `status='CANCELLED'` urmat de o tranziție directă în `PAID` este respinsă de baza de date.

---

### FIN-P3-03 — Numerele de comandă arse în urma tentativelor eșuate

- **Severitate:** P4 / Low-Info
- **Modul afectat:** `api/src/services/order-numbers.ts`
- **Comportament observat:** contorul avansează la fiecare încercare, inclusiv pentru comenzi care ulterior sunt șterse (de exemplu, când rezervarea promoției eșuează, `routes/orders.ts:120` șterge comanda). Secvența observată: 128 comenzi, numere de la `BM-00001` la `BM-00180`, cu 7 goluri.
- **Comportament așteptat:** fără goluri, sau goluri documentate și acceptate.
- **Dovezi:** FIN-T20 — `gapsAfter=[27,41,82,114,125,156,168]`, `duplicates=[]`.
- **Cauză rădăcină:** contorul este alocat înainte de a știe dacă comanda se va încheia.
- **Impact:** **neglijabil** — numerele sunt unice și monotone; golurile nu încalcă nicio regulă. Se semnalează pentru că o campanie de numerotare fără goluri e mai ușor de auditat.
- **Remediere propusă:** niciuna necesară; dacă se dorește continuitatea, alocă numărul în aceeași tranzacție cu crearea comenzii.
- **Criterii de verificare:** nu se aplică (informativ).

---

## 5. Ce nu am putut verifica

1. **Comportamentul real al Stripe** (`stripeLive()`): nicio stivă nu are `STRIPE_SECRET_KEY`. Nu am putut exercita `createCheckout` cu Stripe real, deduplicarea după `stripePaymentIntentId` pe fluxul real, `proration_behavior='create_prorations'` la schimbarea sumei abonamentului, sau rambursarea reală prin API-ul Stripe. Căile de stare testate (`markOrderPaid`, `upsertInvoice`, `fulfilOrder`, `verifyAmount`) sunt aceleași funcții.
2. **Provisionarea reală** (crearea serverului Pterodactyl, alocarea adresei, `panel-keymint`): `NODE_ENV=test` dezactivează coada (`services/queue.ts:110`), iar stiva izolată nu are un worker. Am verificat doar crearea rândului `Instance` și porțile de cod. **Comportamentul panoului Pterodactyl și permisiunile sale nu au fost verificate.**
3. **Rambursarea prin `compensateFailedProvisioning`** am verificat-o **doar prin cod** (inclusiv atomicitatea preluării la `services/provisioning.ts:922`); nu am produs un eșec real de provisionare cu 5 încerceri, pentru că asta ar necesita un panou care să eșueze.
4. **Reconcilierea cu furnizorul** (`reconcileWithProvider`, `reconcileInvoicesWithProvider`): rulează doar când Stripe este viu; fără cheie, nu am putut-o executa. Am verificat doar reconcilierea **prețurilor de instanță** (endpointul de admin) și am citit codul celorlalte două.
5. **Retenția și ștergerea efective**: nicio instanță din stiva mea nu are abonament, deci `withdraw()` (unicul scriitor al înregistrării de retenție) nu se execută. Am verificat exportul la cerere și am citit calea de ștergere (`services/billing.ts:481-524`).
6. **Comportamentul în timp** al sweep-ului de facturare (15 min), al reconcilierii de evenimente (5 min) și al curățării cozii (10 min): am citit programarea din `worker.ts:197-201`; nu am așteptat cicluri complete.
7. **Migrațiile neaplicate / schema din producție**: am rulat `prisma migrate deploy` doar pe `blipmade_audit_test`. Nu am comparat structura live a bazei de producție cu `schema.prisma` (ar fi cerut acces de scriere, pentru `migrate diff`).
8. **Front-end-ul**: nu am verificat ce perioadă trimite interfața la `/api/orders` (nu există un parametru `period` în contract), deci **nu pot afirma că utilizatorul vede o cotare anuală**. Am constatat că *serverul* nu onorează o perioadă la crearea comenzii; impactul asupra UI-ului este `INFERRED`.
9. **Suma încasată vs. cea cotată prin API-ul Stripe**: n-am putut compara cu valoarea reală de pe Stripe.

### 5.4 Rândurile mele din baza izolată comună `blipmade_test` (pentru curățare)

Le-am creat înainte de a-mi face baza proprie; baza a fost trunchiată concurent de suita conducătorului, dar câteva rânduri au supraviețuit. Enumerare exactă, măsurată la 23:59 UTC:

| Tabelă | Rânduri | Cum se identifică |
|---|---|---|
| `User` | `qa.check@example.test`, `admin.check@example.test` | e-mailuri create de mine (conturile `audit1..6@` și `qa.other@` au fost trunchiate) |
| `Order` | `BM-00002`, `BM-00003`, `BM-00004` | aparțin utilizatorului `qa.check@example.test` |
| `OrderItem` | 4 rânduri | cele ale comenzilor de mai sus |
| `Instance` | `cmvlmabek017ddxm76zn9la7k` | `provisioningKey` = `order:cmvlmabae016wdxm7vbovd8v1:item:cmvlmabae016ydxm7tdv7orae:unit:0` |
| `Subscription` | 1 rând | legat de instanța de mai sus |
| `PromotionRedemption` | 2 rânduri | legate de comenzile mele |
| `WebhookEvent` | `evt_test_cmvlmabae016wdxm7vbovd8v1_1792799085051`, `evt_lan_1792799185415` | primul e evenimentul plății mele, al doilea e cel din testul de semnătură |

**Nu am creat** în `blipmade_test` nicio promoție care să mai existe acum: `AUDIT10`, `EX3HALF`, `EX4PAID` **nu sunt ale mele** (eu am folosit `AUDIT100`, `AUDITONE`, `AUDITHALF`, `AUDITFREE`, `AUDIT100PCT`, `AUDITRACE`, toate trunchiate ulterior). Rândurile din `Session` și `AuditLog` nu pot fi atribuite individual, fiind amestecate cu ale celorlalți auditori.

---

## 6. Concluzie

Rundei anterioare i se confirmă **6 afirmații** (R1, R2, R5, R7, R8, R11), **1 este confirmată parțial** (R13, pe baza codului), **1 rămâne parțială** (R10, R12, R14), **2 sunt încă rupte** (R3 — numerele de factură; R9 — planul anual) și **1 este ruptă prin o zonă pe care remedierea nu a acoperit-o** (R6 — o comandă anulată sau rambursată poate fi onorată pe calea locală de checkout).

Cele trei probleme care contează cel mai mult:

1. **FIN-P1-01** — lipsa unei tranziții de stare valide în `markOrderPaid()` permite ca o comandă anulată sau rambursată să devină `PAID` și să primească infrastructură. Poarta de plată a provisionării e corectă, dar poate fi ocolită.
2. **FIN-P2-01** — numerele de factură se calculează cu `count() + 1`; două evenimente `invoice.paid` simultane produc o excepție P2002 și factura se pierde în dead-letter.
3. **FIN-P2-03** — comanda nu onorează perioada: o cotare anuală de 1890 produce o comandă de 189. Suma cotată nu este suma încasată.
