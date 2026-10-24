# Constatări noi — runda post-remediere

**Data sinteză:** 2026-10-24
**Faza:** 12 (Sinteză) a auditului post-remediere
**Cod evaluat:** `main` @ `e990776` (producție) + ramura de reparare `remediation/phase-2-critical-fixes`
**Autor al sintezei:** agent de sinteză (faza 12), pe baza celor 14 rapoarte din `audit/post-remediation/`, a dovezilor brute din `_raw/` și a registrului unic `audit/12-FULL-FINDINGS-REGISTER.md`

---

## 0. Metadate

### 0.1 Ce înseamnă „nou" în acest document

O constatare este considerată **nouă în această rundă** dacă îndeplinește cel puțin unul
dintre următoarele trei criterii:

1. **Nu exista în cele 182 de constatări** din `audit/12-FULL-FINDINGS-REGISTER.md` și
   nici în cele 65 din `audit/23-ROUND2-FINDINGS-REGISTER.md` — este o constatare ridicată
   pentru prima dată de unul dintre rapoartele acestei runde.
2. **A fost ridicată pentru prima dată *cu dovezi*** — adică exista o observație vagă în
   rundele anterioare, dar abia în această rundă s-a identificat mecanismul exact, cu
   `file:line` sau cu ieșire de comandă. Conform §2.2 din
   `PREVIOUS-FINDINGS-REVALIDATION.md` („standardul de dovadă"), o observație fără
   localizare exactă nu este o constatare.
3. **A fost re-evaluată cu un verdict opus celui din runda anterioară** după reverificare
   independentă — cazul `ADM-02` (marcat `VERIFIED FIXED` în revalidare, `STILL BROKEN`
   după verificarea lead-ului).

**Nu** intră în acest document: constatările din cele 182 care au primit verdict și
stare de remediere. Acestea rămân în registrul unic
`audit/12-FULL-FINDINGS-REGISTER.md` (secțiunea randată „Starea remedierii"). Aici sunt
doar **cele care aparțin rundei curente**.

### 0.2 Surse

| Document | Rol în sinteză |
|---|---|
| `PREVIOUS-FINDINGS-REVALIDATION.md` | Re-validarea celor 182 + 65 de constatări; §3 (contoare), §8 (blocaje) |
| `SECURITY-REVIEW.md` | `SEC-P1-01` … `SEC-P4-03` |
| `FINANCIAL-INTEGRITY.md` | `FIN-P1-01` … `FIN-P3-03` |
| `SESSIONS-INVESTIGATION.md` | `SESS-P1-xx` |
| `ADMIN-FUNCTIONALITY.md` | `ADM-P1-01` … `ADM-P3-xx` |
| `FUNCTIONAL-COVERAGE.md` | `FN-P1-01` … `FN-P1-34` |
| `CUSTOMER-JOURNEYS.md` | `CJ-P1-xx` (raport parțial la momentul sintezei) |
| `UI-UX-REVIEW.md` | `UX-P1-xx` |
| `INFRASTRUCTURE-AND-RECOVERY.md` | `INFRA-P1-01` … `INFRA-P1-23` |
| `PERFORMANCE-AND-RELIABILITY.md` | `PERF-P1-xx` |
| `PAYMENTER-FEATURE-PARITY.md` | `PAR-P1-xx` |
| `COMPETITIVE-GAP-ANALYSIS.md` | `COMP-P1-xx` |
| `MISSING-FEATURES-ROADMAP.md` | Matricea funcționalităților lipsă și undele |
| `GO-NO-GO-VERDICT.md` | **Verdictul lead-ului — coloana vertebrală a backlog-ului** |
| `EXECUTIVE-VERDICT.md` | Sumarul business |
| `_raw/LEAD-VERIFICATIONS.md` | A doua opinie a lead-ului pe 6 constatări; **2 refutări** |
| `_raw/PRODUCTION-STATE-2026-10-24.md` | Starea măsurată a producției |
| `_raw/PRODUCTION-POLLUTION-INCIDENT.md` | Incidentul de poluare a producției |
| `_raw/phase2-proof-lead.txt` | Dovada de regresie a reparărilor fazei 13 |

Documente de trasabilitate (rundele anterioare, citite pentru reconciliere):
`audit/12-FULL-FINDINGS-REGISTER.md`, `audit/23-ROUND2-FINDINGS-REGISTER.md`,
`audit/25-OPERATOR-DEPENDENCIES.md`, `audit/26-REMEDIATION-WAVE-1-REPORT.md`.

### 0.3 Conflictele pe care le-am rezolvat

Patru rapoarte scrise de agenți independenți se contrazic între ele pe constatări
concrete. Le-am tratat ca pe **conflict de măsurare**, nu ca pe divergență de opinie:
fiecare parte are o citare și un output, iar în fiecare caz există unul dintre ele
care poate fi verificat în cod. Rezultatele sunt în §2.

| # | Conflict | Rezultat |
|---|---|---|
| C1 | `ADM-01` — revalidare vs. admin + lead | **Lead-ul are dreptate** — constatarea e invalidă |
| C2 | `ADM-02` — revalidare (`VERIFIED FIXED`) vs. admin | **Auditul de admin are dreptate** — `STILL BROKEN` |
| C3 | `FIN-P2-01` — auditul financiar vs. lead | **Lead-ul are dreptate** — constatarea e invalidă |
| C4 | `FIN-P2-03` — severitatea Critical (lead) vs. High (starea producției) | **Impact latent, nu activ** — severitatea corectă: **High** |
| C5 | `DR-02` — revalidare („nu există backup programat") vs. lead | **Parțial reparat, prin acțiune, nu prin cod** |

### 0.4 Reguli respectate în acest document

- **Nicio constatare nu este inventată.** Fiecare rând are o sursă și o localizare de
  dovadă. Când dovada nu a putut fi găsită, rândul e marcat `NOT VERIFIED` și se spune
  ce ar verifica-o.
- **Niciun identificator nu este renumerotat.** Se folosește ID-ul din raportul de origine.
- **Registrul rămâne unic**: `audit/12-FULL-FINDINGS-REGISTER.md`. Acest document este o
  *lectură* a registrului plus runda nouă, nu un registru paralel.
- **Nu s-a modificat niciun cod de aplicație.** Sinteza agregă, reconciliază și
  prioritizează.

---

---

## 1. Cum am citit cele patru rapoarte

Nu am acceptat niciun raport ca adevăr întreg. Fiecare afirmație cu severitate a fost
verificată în cel puțin una dintre următoarele trei forme:

1. **Localizare în cod** — `file:line` în repository, verificabilă de oricine.
2. **Măsurătoare repetată** — aceeași operație, măsurată pe două stive (comună izolată și
   proprie), ca în cazul constatărilor `ADM-P1-*`.
3. **Dovadă de contra-probă** — un test care eșuează fără reparare și trece cu ea
   (`_raw/phase2-proof-lead.txt`).

Când o afirmație nu putea fi verificată în niciuna dintre forme, am scris `NOT VERIFIED`
și am spus ce ar verifica-o. Nu am folosit niciodată „probabil" sau „se pare" într-un rând
de tabel.

**Relația dintre ramuri.** Trei rapoarte au fost scrise pe ramura
`audit/post-remediation` (HEAD `29a86cc`), iar producția rula atunci un build mai vechi.
Diferența nu a fost neglijată: ea produce **două** dintre constatările cele mai
alarmante ale raportului de sesiuni (`SESS-P1-01`, `SESS-P1-04`). Verificarea
post-deploy (`_raw/PRODUCTION-POLLUTION-INCIDENT.md` §5) arată că ramura **a fost
aplicată** în producție la `2e1e78a`, cu migrarea `20261024110000_session_last_seen`
aplicată și `MAX_SESSIONS_PER_USER = 20` prezent în imaginea deployată. Prin urmare
`SESS-P1-01` este **închis prin acțiune**, dar **mecanismul** care l-a produs — lipsa unui
control de release care verifică imaginea deployată împotriva ramurii — **rămâne deschis**
și este reluat în §6 ca `SESS-P1-01` în formă redusă.

---

## 2. Reconcilierea rapoartelor care se contrazic

Cinci conflicte au fost identificate. Fiecare este rezolvat mai jos, cu dovada. Unul
(conflictul C5) este rezolvat ca **parțial**, cu ambele părți adevărate în momente
diferite — acesta este cazul onest, în care niciun raport nu este pur și simplu greșit.

### C1 — `ADM-01`: rutele de bilete verifică rolul, nu permisiunea

| | |
|---|---|
| **Raportul A** | `PREVIOUS-FINDINGS-REVALIDATION.md` §5.4 + §4.9: **Critical**, `STILL BROKEN` |
| **Raportul B** | `ADMIN-FUNCTIONALITY.md` §6.1: verificarea funcționează — `403` pe **39 din 40** de rute |
| **Verdictul lead-ului** | `_raw/LEAD-VERIFICATIONS.md` V1: **INVALID FINDING** |
| **Câștigător** | **Lead-ul** |

**De ce.** Raportul A a căutat `grep requirePermission` în `api/src/routes/tickets.ts` și a
obținut **0 potriviri**. Dar helper-ul din acel fișier se numește `requireTicketPermission`
— alt nume. Verificarea există:

| Locație | Ce face |
|---|---|
| `api/src/routes/tickets.ts:408` | `app.post('/tickets/:id/status', …)` cere **și** `requireStaff(request)`, **și** `requireTicketPermission(user, 'tickets.write')` |
| `api/src/routes/tickets.ts:441-449` | `requireTicketPermission(user, permission)` — pentru `STAFF`/`ADMIN` verifică `hasPermission(...)` și aruncă `forbidden` |
| `api/src/routes/tickets.ts:215, 268, 327, 395` | rutele de client verifică proprietatea: `if (ticket.userId !== user.id && !isStaff) throw notFound(...)` |

Eroarea este în **metodă**, nu în cod. Concluzia „orice staff poate muta bilete" **nu
este susținută**.

**De ce nu am ales raportul B ca sursă primară.** Raportul B a măsurat comportamentul
(rută × identitate) și a obținut `403` corect pe 39 din 40 de rute — dar matricea lui
include **rutele de administrare**, nu rutele de bilete ale clientului. Deci măsurarea lui
B **nu acoperă direct** întrebarea lui A. Singura dovadă care o acoperă este localizarea
în cod, adică verificarea lead-ului. Concluzia identică vine din două direcții diferite,
ceea ce e mai puternic decât oricare dintre ele singură.

**Stare în sinteză:** `ADM-01` — **INVALID**. Nu apare în backlog ca rând de lucru. Apare
în §5 („Constatări refutate").

---

### C2 — `ADM-02`: escaladarea de privilegii prin `PUT /admin/staff/:userId`

| | |
|---|---|
| **Raportul A** | `PREVIOUS-FINDINGS-REVALIDATION.md` §4.9: **VERIFIED FIXED** |
| **Raportul B** | `ADMIN-FUNCTIONALITY.md` `ADM-P1-01`: **High**, `STILL BROKEN` — un personal cu `staff.write` își acordă **20 din 21** de permisiuni |
| **Verdictul lead-ului** | `_raw/LEAD-VERIFICATIONS.md` V2: **`STILL BROKEN`**, High |
| **Câștigător** | **Auditul de admin** (raportul B), confirmat de lead |

**De ce.** Raportul A s-a bazat pe `api/src/routes/admin.ts:1045-1049`. Aceste linii
protejează **doar schimbarea rolului** și **doar permisiunile unui cont cu rol `ADMIN`**.
Garda efectivă este la `api/src/routes/admin.ts:1059`:

```ts
if (body.permissions !== undefined && new Set(body.permissions).size >= PERMISSIONS.length && actor.role !== 'ADMIN') {
  throw forbidden('Only an administrator can grant the whole permission list.');
}
```

Adică: un `STAFF` nu poate acorda **21 din 21**, dar **poate acorda 20 din 21** — și **nu
există** nicio comparație între `userId` (ținta) și `actor.id` (cel care acționează).

**Măsurătoarea**, repetată pe două stive (`ADMIN-FUNCTIONALITY.md` §2.5):

```
### ADM-P1-01
self-grant 20 of 21 -> 200
the session now carries 20 permissions
GET /api/admin/settings with the escalated account -> 200
GET /api/admin/staff with the escalated account -> 200
self-grant all 21 -> 403 Only an administrator can grant the whole permission list.
```

**De ce contează.** Concluzia „VERIFIED FIXED" din raportul A ar fi eliminat din backlog
cea mai gravă escaladare de privilegii măsurată în această rundă. Diagnosticul e
important: **nu e o eroare de citire a codului, ci de acoperire**. Raportul A a verificat
că *nu se poate modifica rolul*, și a generalizat „nu se poate modifica permisiunile".
Cele două sunt garde diferite, la linii diferite, cu efecte diferite.

**Concluzie în sinteză:** `ADM-02` (identificatorul din revalidare) și `ADM-P1-01`
(identificatorul din auditul de admin) sunt **aceeași constatare**. În backlog apare o
singură dată, sub ID-ul din raportul de origine: **`ADM-P1-01`**.

---

### C3 — `FIN-P2-01`: numerele de factură se calculează cu `count() + 1`

| | |
|---|---|
| **Raportul A** | `FINANCIAL-INTEGRITY.md` §4: **High**, `STILL BROKEN` — 12 creări concurente → 3 introduse, 9 `P2002` pe `(number)` |
| **Raportul B** | `_raw/LEAD-VERIFICATIONS.md` V4: **INVALID FINDING** |
| **Câștigător** | **Lead-ul** |

**De ce.** Adevărul e în amândouă măsurătorile, dar în codul diferit. Raportul financiar a
citit `api/src/services/stripe.ts:475-478`:

```ts
const count = await prisma.invoice.count();
await prisma.invoice.create({ data: { …, number: `BM-INV-${String(count + 1).padStart(5,'0')}` } });
```

— care **există**, în calea `upsertInvoice`. Dar numerotarea **atomică** există și e
folosită în altă parte:

- `api/src/services/billing.ts:635` și `:938` → `await nextInvoiceNumber()`
- `api/src/services/order-numbers.ts:104-106` → `nextInvoiceNumber()` apelează
  `nextSequenceNumber({ key: INVOICE_SEQUENCE_KEY, prefix: 'BM-INV-', table: 'Invoice' })`
- `api/src/services/order-numbers.ts:57-80` — contorul este **ridicat într-o singură
  instrucțiune** (`INSERT … ON CONFLICT` + `UPDATE … RETURNING`), cu reparare prin
  `MAX()` doar ca măsură de recuperare pentru un contor deteriorat

Concluzia lead-ului: **„Nu există `count() + 1`"** — dar aceasta e prea tare ca
formulare, pentru că `count() + 1` **există** în `upsertInvoice`. Nu există **în calea
folosită de `billing.ts`**.

**Reconciliere corectă.** Cel mai probabil motivul pentru care harness-ul financiar a
observat 9 `P2002` este că a exercitat `upsertInvoice()` direct — o cale de test care
**nu este calea de facturare a clientului**. Pe calea reală (`billing.ts:635`, `:938`)
numerotarea este atomică și nu poate produce coliziune.

**Stare în sinteză:** `FIN-P2-01` — **INVALID** ca constatare despre pierderea facturii.
Totuși, existența simultană a două surse de adevăr pentru numărul facturii
(`count()+1` într-un loc, contorul atomic în altul) este ea însăși un **defect real** de
coerență: dacă un eveniment Stripe trece prin `upsertInvoice`, el produce o coliziune
`P2002` și **factura nu se înregistrează** — exact impactul descris de raportul financiar,
chiar dacă nu prin cauza pe care o indică. Prin urmare:

- Constatarea **„numerele de factură se calculează cu `count()+1`"** → **INVALID** (mecanism
  greșit identificat).
- Constatarea **„există două surse de adevăr incompatibile pentru numărul factură"** →
  **VALID**, severitate **Medium**, remediare: eliminarea `invoice.count()` din
  `upsertInvoice()` în favoarea `nextInvoiceNumber()`.

Această rescriere este exact cea cerută de raportul financiar în §4, dar motivul ei
corect este **coerența**, nu **pierderea de factură prin `count()+1`**. Ea rămâne în
backlog, dar la severitate mai mică și cu altă justificare. Aceasta este singura
poziție din acest document unde am **reciclat** o constatare refutată într-o formă
mai slabă, susținută de altă dovadă — și am spus-o explicit, pentru că altfel ar
însemna să resuscitez o constatare refutată.

---

### C4 — `FIN-P2-03`: planul anual cotat cu 1890, comandat cu 189 — pierdere de bani sau capcană latentă?

| | |
|---|---|
| **Raportul A** | `FINANCIAL-INTEGRITY.md` §4: **P2 / Medium**, `STILL BROKEN` — „suma cotată nu este suma încasată" |
| **Raportul B** | `_raw/LEAD-VERIFICATIONS.md` V6: **Critical** (ban) — mecanismul confirmat |
| **Raportul C** | `_raw/PRODUCTION-STATE-2026-10-24.md` §2.1: severitatea reală este **High**, impact **latent, nu activ** |
| **Câștigător** | **Raportul C** (severitatea), **Raportul B** (mecanismul) |

**Mecanismul — confirmat, identic în ambele.** Patru pași:

| Pas | Locație | Ce face |
|---|---|---|
| Cotarea cu perioadă | `api/src/routes/billing.ts:220` | `priceItems(body.items, body.period)` — **onoră perioada**, `ANNUAL` → 1890 |
| Cotarea folosită la comandă | `api/src/routes/orders.ts:71` | `buildQuote(body.items, body.promotionCode, user.id)` — **fără perioadă** |
| … care ajunge la | `api/src/services/pricing.ts:422` | `priceItems(items)` — implicit `period = 'MONTHLY'` |
| … și așadar | `api/src/services/pricing.ts:172` | `loadPrice(product.id, period)` cu `MONTHLY` → rândul de preț lunar → **189** |
| Checkout Stripe | `api/src/services/stripe.ts:214` | `recurring: { interval: 'month' }` — **fix, indiferent de perioadă** |

**De ce nu e „Critical" (ban pierdut) în starea măsurată.** În producție **nu există niciun
rând de preț anual** (`_raw/PRODUCTION-STATE-2026-10-24.md` §2: „Nu există niciun rând de
preț anual în producție"). Prin urmare:

- `loadPrice(productId, 'ANNUAL')` → `notFound('This product has no active price.')`
- `POST /api/billing/quote` cu `period: 'ANNUAL'` **eșuează curat**, nu produce 1890
- `POST /api/orders` nu acceptă deloc un parametru `period` și cotizează întotdeauna lunar

Deci **nu se pierde niciun ban azi**: nu există cotare anuală care să fie onorată greșit.
Defectul este o **capcană latenă**: se activează în clipa în care cineva adaugă un preț
anual în catalog — adică exact în momentul în care funcția se scoate la vânzare.

**Verdictul sintezei:** `FIN-P2-03` — **STILL BROKEN**, severitate **High** (nu Critical,
nu Medium), money-relevant **da**. Raționamentul: *mecanismul* e real și reparabil în
câteva ore; *impactul* e o pierdere de bani la o scară de 10× (189 în loc de 1890) dar
**doar la momentul vânzării funcției**. Un `Medium` ar fi prea mic (calea de plată chiar
tace prețul cerut, ceea ce încalcă contractul de preț — chiar dacă nu se întâmplă încă);
un `Critical` ar fi inexact pentru că niciun ban nu se pierde în starea măsurată.

**Notă de reconciliere cu `GO-NO-GO-VERDICT.md` §3**, unde `FIN-P2-03` este trecut
„Critical": verdictul lead-ului și măsurarea stării de producție **nu sunt de acord între
ele**, iar ambele sunt în documente ale lead-ului. Am rezolvat în favoarea măsurării
(`PRODUCTION-STATE`), pentru că aceasta verifică **ce se poate întâmpla în producție
acum**, nu doar ce se poate întâmpla într-o stivă de test unde prețul anual a fost
introdus artificial. Concluzia practică nu se schimbă: **defectul trebuie reparat înainte
de a se vinde vreo perioadă anuală.**

---

### C5 — `DR-02` / backup programat: nu există vs. există și rulează

| | |
|---|---|
| **Raportul A** | `PREVIOUS-FINDINGS-REVALIDATION.md` §7.7: „programarea e rezolvată în această rundă" este **fals**; `SEC-P2-02` măsură `systemctl status blipmade-backup.timer` → **„Unit … could not be found"** |
| **Raportul B** | `_raw/LEAD-VERIFICATIONS.md` V3: timer **instalat și rulat**; `OFFSITE_TARGET` **neconfigurat** |
| **Câștigător** | **Ambele**, pentru momente diferite |

**Reconciliere.** Observația raportului A era **corectă la momentul măsurării**: la acel
moment unitățile systemd existau doar ca fișiere în repository, neinstalate
(`SECURITY-REVIEW.md` §4 `SEC-P2-02`: „unitățile systemd există în repo, dar **nu au fost
instalate**"). Raportul A a fost acuzat de fals tocmai fiindcă s-a bazat pe
`audit/25-OPERATOR-DEPENDENCIES.md`, o afirmație nerealizată, în loc de măsurării
directe — iar aceasta a fost măsurată direct.

După autorizarea operatorului, în aceeași sesiune:

- `blipmade-backup.timer` și `blipmade-backup.service` instalate în `/etc/systemd/system/`
  prin `scripts/install-backup-timer.sh`; timerul este `enabled`
- o rulare manuală a produs `blipmade-scheduled-20261024T001409Z.tar.gz` (59 620 octeți)
  împreună cu fișierul `.sha256`
- `ExecStartPost` (copia în afara gazdei) a ieșit 0, dar **`OFFSITE_TARGET` nu este setat**:
  copia **nu părăsește gazda**

**Stare în sinteză (două rânduri, nu unul):**

| ID | Afirmație | Stare |
|---|---|---|
| `DR-02` | backupul programat nu exista | **FIXED & VERIFIED** — prin acțiune de operator, nu prin cod; timer instalat, `enabled`, rulare manuală cu arhivă + `.sha256` |
| `INFRA-P1-01` / `SEC-P2-02` | copia nu părăsește niciodată hostul | **STILL BROKEN** — `OFFSITE_TARGET` și `OFFSITE_KEY` lipsesc; RPO la pierderea gazdei = **tot** |

Cele două afirmații nu se contrazic: una e despre **programare**, cealaltă despre
**ieșirea din gazdă**. Le-am despărțit pentru că un tabel care arăta un singur rând
„STILL BROKEN" pentru `DR-02` ar fi ascuns faptul că jumătate din măsurătoare s-a
rezolvat, iar un tabel care arăta „FIXED" ar fi ascuns că pierderea gazdei pierde tot.

---

### C6 — `SEC-P2-02` vs. `INFRA-P1-01`: aceeași problemă, două severități

Constatarea „nu există copii de siguranță programate și nicio copie în afara gazdei"
(`SECURITY-REVIEW.md` §4, severitate **P2 / Medium**) și constatarea „copia de backup nu
părăsește niciodată hostul" (`INFRASTRUCTURE-AND-RECOVERY.md` §5, severitate **Critical**)
descriu **aceeași cauză rădăcină**: `OFFSITE_TARGET` / `OFFSITE_KEY` lipsesc.

**Câștigător:** raportul de infrastructură. Argumentul nu e stilistic, ci de
consecvență cu severitatea folosită în restul auditului: pierderea gazdei = pierderea
**totului** (RAID 0 pe root, fără copie externă) este, prin definiție, o pierdere
catastrofică. Etichetarea „Medium" cu „impact potential: pierderea totală a datelor"
(`SEC-P2-02`) este inconsistentă cu cea mai mică severitate folosită în același raport
pentru `SEC-P1-02`, care e un DoS de 15 minute asupra autentificării.

**Stare în sinteză:** `INFRA-P1-01` — **STILL BROKEN**, **Critical**, money-relevant
**da** (pierderea comenzilor, facturilor și abonamentelor). `SEC-P2-02` este **păstrată
ca aceeași constatare**, cu referință încrucișată, nu ca rând distinct — pentru a nu
număra de două ori aceeași acțiune în backlog.

---

### C7 — `SESS-P1-05` vs. `ADM-P2-06`: contorul de autentificare

Ambele rapoarte măsoară același mecanism — contorul per cont de 10 cereri / 15 minute
care numără și autentificările reușite:

| Raport | ID | Severitate | Măsurătoare |
|---|---|---|---|
| `SESSIONS-INVESTIGATION.md` | `SESS-P1-05` | Medium | „11 autentificări **corecte** consecutive: primele 10 → HTTP 200, a 11-a → **HTTP 429**" |
| `ADMIN-FUNCTIONALITY.md` | `ADM-P2-06` | Medium | „A. numai semnări reușite, cont existent: 1:200 … 10:200 **11:429** 12:429" |
| `SECURITY-REVIEW.md` | `SEC-P3-02` | Medium | limită **configurabilă** din mediu până la 1000; valoarea 500 e **doar pe stiva izolată**, producția e la 10 |

**Câștigător:** toate trei sunt corecte, pentru **segmente diferite** ale aceluiași
defect. Reconcilierea:

1. **Comportamentul** (`ADM-P2-06`, `SESS-P1-05`) — identic, măsurat de două ori pe două
   stive: contorul numără reușitele și se aplică și adreselor inexistente. **Acesta e
   defectul de cod.**
2. **Severitatea** — `ADM-P2-06` este mai precisă decât `SESS-P1-05`, pentru că adaugă
   observația pe care cealaltă nu o are: contorul se aplică și adreselor care **nu
   există**, deci un apelant neautentificat poate bloca **orice adresă cunoscută** —
   inclusiv pe cea a unui administrator — cu 10 cereri, fără ca parola să fie greșită
   măcar o dată. Ridică severitatea de la „ inconvenient" la **disponibilitate**.
3. **Configurabilitatea** (`SEC-P3-02`) — este o **constatări distinctă**, pe un alt
   rând de cod (`api/src/env.ts:16`, `.max(1000)`), și **nu** e activă în producție:
   `LOGIN_RATE_LIMIT_MAX` nu e setat în `.env` de producție, deci valoarea implicită
   rămâne **10**. Riscul e de **configurație greșită**, nu de cod.

**Stare în sinteză:** `ADM-P2-06` — **FIXED & VERIFIED** (faza 14, `f8b2051`), Medium (disponibilitate),
money-relevant **da** (blochează autentificarea ⇒ blochează vânzarea). `SEC-P3-02` —
**STILL BROKEN**, Medium, dar marcat explicit ca **risc de configurație, nu incident
activ în producție**. `SESS-P1-05` — **același defect ca `ADM-P2-06`**, referință
încrucișată, nu rând distinct.

---

### Conflicturi pe care le-am lăsat **nerezolvate**, cu motivul

| # | Conflict | De ce nu l-am putut rezolva |
|---|---|---|
| U1 | `FIN-P2-03` — severitatea în `GO-NO-GO-VERDICT.md` (Critical) vs. `PRODUCTION-STATE-2026-10-24.md` (High) | **Rezolvat** în C4, în favoarea măsurării. |
| U2 | `FIN-P2-03` — raportul financiar scrie „cotare **anuală** de **1890**"; lead-ul scrie „**1788**"; `PRODUCTION-STATE` scrie „1890"; `GO-NO-GO` scrie „**1788**" | **Nerezolvat în valoare, dar irelevant**: ambele sume sunt *multiple ale sumei lunare* (189 × 10 = 1890, 149 × 12 = 1788). Diferența vine din **produsul și perioada** folosite în fiecare harness, nu din mecanism. Mecanismul e același: `priceItems(items)` fără perioadă → `MONTHLY`. Am notat în tabel ambele valori, cu sursa fiecăreia. |
| U3 | `FIN-P2-03` — `FINANCIAL-INTEGRITY.md` folosește `period: 'YEARLY'`; `LEAD-VERIFICATIONS.md` folosește `period: 'ANNUAL'` | **Nerezolvat**: n-am găsit în schema zod a cotării (`api/src/routes/billing.ts:199-218`) o enumă care să decidă între `YEARLY` și `ANNUAL`. E posibil ca harness-ul financiar să fi folosit un token care **nu trece validarea** și că „1890" să fi fost obținut pe o cale de test, nu prin API-ul public. **Ce ar verifica:** rularea `POST /api/billing/quote` pe stiva izolată cu ambele valori și compararea codurilor de eroare. Marcat `NOT VERIFIED` la nivelul **numelui exact al sumei**, `STILL BROKEN` la nivelul **mecanismului** — care e dovedit de patru locații de cod. |
| U4 | `SESS-P1-13` — stiva de test scria în producție vs. `PRODUCTION-POLLUTION-INCIDENT.md` | **Rezolvat**: incidentul e real, a fost neutrizat și curățat; cauza (parametrizarea manuală a `API_URL`) a fost corectată cu o gardă. Rămâne însă **mecanismul** de prevenire — refuzul de pornire cu `DATABASE_URL` fără sufix `_test` — **neimplementat** în codul aplicației. |
| U5 | `CUSTOMER-JOURNEYS.md` — raportul e încă în scriere (66 de linii la momentul sintezei) | **Nerezolvat prin lipsă de date**: constatările `CJ-P1-*` care ar fi apărut într-un raport complet **nu pot fi inventate**. Ce există acum e citit și utilizat; ce nu există e declarat explicit ca limită a acestui document. |

---

---

## 3. Registrul constatărilor noi

### 3.1 Cum a fost construit tabelul

**Totalul de rânduri din §3 = 212**, împărțit astfel:

| Origine | Constatări | Rânduri de tabel | Notă |
|---|---|---|---|
| Constatări ale acestei runde, cu ID de rundă | **207** | **201** | `SEC-P*` 11 · `FIN-P*` 10 · `SESS-P1-*` 14 · `ADM-P*` 14 · `FN-P1-*` 34 · `CJ-P1-*` 12 · `UX-P1-*` 14 · `INFRA-P1-*` 23 · `PERF-P1-*` 21 · `PAR-P1-*` 34 · `COMP-P1-*` 20 |
| — dintre care **re-lift-uri** (ID de rundă care recitează un ID din registrul celor 182) | **19** | 19 | `ADM-P1-01`→`SEC-04`; `INFRA-P1-10`→`SEC-05`; `PAR-P1-03/04/05/06/15/16/22/25/26/28/29`; `COMP-P1-02/03/04/05/11/12` |
| Mecanismul rămas în urma lui `SESS-P1-01` (controlul de release) | 1 | 1 | rând distinct în §3.4 |
| Constatări ale sintezei (faza 12), găsite de mine și **necuprinse în niciun raport** | **4** | **4** | `SYN-P1-01` … `SYN-P2-01` — vezi §7 |
| **Total** | **212** | **212** | tabelul are **212 rânduri, câte unul pe constatare**, fără duplicate (rândul grupat `PAR-P1-21…27` a fost despărțit în 7 rânduri) |

**Severitatea** este cea din raportul de origine, normalizată la `P0 / Critical / High /
Medium / Low-Info` după escala registrului (`audit/12-FULL-FINDINGS-REGISTER.md` §0.2).
Am păstrat între paranteză severitatea originală când aceasta e mai precisă decât
normalizarea (de exemplu `High (Critical dacă staff.write este delegată)`).

**„Money-relevant"** = poate face să iasă bani din platformă în mod greșit, să nu se
încaseze, să se încaseze de două ori, ori să blocheze luarea banilor. **„Security-
relevant"** = expune platforma, permite escaladare de privilegii, slăbește
autentificarea sau produce DoS. Un rând marcat „da" la bani poate arăta ca o problemă de
interfață — cazul `UX-P1-01` (contrast) nu e money-relevant, dar `FN-P1-26` („nu se
poate vedea nicio factură după o plată") este, pentru că blochează un client care
plătește.

**Starea** este verdictul **meu**, după reconciliere (§2), nu copierea verdictului
raportului. Când am putut verifica în cod sau în test suite, am notat `FIXED & VERIFIED`
**numai** dacă am găsit dovada; altfel `NOT VERIFIED` cu ce ar verifica-o.

**Faza 13** = intervalul de commituri `36a75a7..2e1e78a` (7 commituri, fast-forward pe
`main`, branch `remediation/phase-2-critical-fixes`), aplicat în producție pe 2026-10-24
conform `_raw/PRODUCTION-POLLUTION-INCIDENT.md` §5.

---

### 3.2 Securitate — `SECURITY-REVIEW.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| SEC-P1-01 | Cookie-ul de sesiune emis fără `Secure` în topologia de producție | High | Nu | Da | `api/src/plugins/auth.ts:50-54,186-194`; `api/src/env.ts:102,157`; `compose.api.yml` | **FIXED & VERIFIED** | **da** — `2e1e78a`; `phase2-session-security.test.ts` „is set in production when the request arrives over plain HTTP" |
| SEC-P1-02 | Limitarea per-adresă devenită limitare globală: DoS pe autentificare pentru toți clienții | High | Da | Da | `api/src/app.ts:80` (`keyGenerator: request.ip`); `api/src/routes/auth.ts:61-99`; `api/src/env.ts:157` | **FIXED & VERIFIED** — reparat în faza 14 (`f8b2051`): cheia limitatorului e adresa clientului sau conexiunea, pe **toate** cele 12 rute cu limită; adresa clientului e citită din **dreapta** lanțului, deci nu mai e falsificabilă | **da** — `f8b2051`; `phase14-address-key.test.ts`, `phase14-rate-limits.test.ts`; dovadă: fără reparare, un client care trimite `X-Forwarded-For: 9.9.9.9` era limitat după `9.9.9.9`, iar a 11-a autentificare corectă era refuzată cu 429 |
| SEC-P2-01 | Nu există firewall pe gazdă; interfețele de staging și de test sunt publicate pe `0.0.0.0` | Medium | Nu | Da | `iptables -S`, `nft list ruleset`, `ss -ltnp`; `compose.web.yml` | **BLOCKED: EXTERNAL DEPENDENCY** (host) | nu |
| SEC-P2-02 | Nu există copii de siguranță programate și nicio copie în afara gazdei | Critical | Da | Da | `scripts/systemd/blipmade-backup.{service,timer}`; `scripts/backup.sh`; `OFFSITE_TARGET` absent din `.env` | **STILL BROKEN** — **aceeași constatare ca `INFRA-P1-01`** (vezi §2 C6); programarea s-a rezolvat, ieșirea din gazdă nu | parțial — timer instalat (acțiune operator) |
| SEC-P2-03 | Stiva izolată refolosește secretele de producție și e accesibilă din rețea, cu webhook fără semnătură | Medium | Nu | Da | `api/src/services/stripe.ts:33-43`; `api/src/routes/webhooks.ts:632-644` | **STILL BROKEN** | nu |
| SEC-P3-01 | Dependențe cu vulnerabilități aplicabile; `nodemailer` mult în urmă | Medium | Nu | Da | `api/package.json`; `npm audit --json`; `api/Dockerfile:24` (`npm ci --omit=dev`) | **STILL BROKEN** | nu |
| SEC-P3-02 | Limita de autentificare devenită configurabilă din mediu, până la 1000 de încercări / 15 min | Medium | Da | Da | `api/src/env.ts:16,137`; `api/src/routes/auth.ts:224` | **STILL BROKEN** — risc de **configurație**, nu incident activ: `LOGIN_RATE_LIMIT_MAX` nu e setat în `.env` de producție, deci implicitul rămâne 10 | nu |
| SEC-P3-03 | Colecții validate fără limită superioară în cotare | Low-Info | Da | Da | `api/src/routes/billing.ts:199-218` (`z.array(...).min(1)` fără `.max()`); `api/src/app.ts:52` | **STILL BROKEN** | nu |
| SEC-P4-01 | Rutele cu token intern răspund HTTP 200 și compară tokenul în timp neconstant | Low-Info | Nu | Da | `api/src/routes/webhooks.ts:663-668,692-697,712-717` | **STILL BROKEN** | nu |
| SEC-P4-02 | Politica `Content-Security-Policy` dezactivată | Low-Info | Nu | Da | `api/src/app.ts:62-65` (`helmet` cu `contentSecurityPolicy: false`) | **STILL BROKEN** | nu |
| SEC-P4-03 | Istoricul joburilor eșuate din coadă e șters la 10 minute | Low-Info | Da | Nu | `api/src/worker.ts:120-124` (`queue.clean(0,1000,'failed')`) | **STILL BROKEN** | nu |

### 3.3 Integritate financiară — `FINANCIAL-INTEGRITY.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| FIN-P1-01 | Comandă anulată/rambursată resuscitată și onorată prin calea locală de checkout | P0/Critical | Da | Nu | `api/src/routes/orders.ts:159-203` (checkout); `api/src/services/stripe.ts:308-312` (garda) | **FIXED & VERIFIED** — **retestul independent a găsit ocolirea** (`RT-P1-01`): garda din `markOrderPaid` e corectă, dar checkout-ul rescria starea în `AWAITING_PAYMENT` înainte de ea. Reparat în faza 15 (`4969f4a`): checkout-ul refuză `CANCELLED`/`REFUNDED` cu 409 | **da** — `4969f4a`; `phase15-order-lifecycle.test.ts`; dovadă: fără reparare, `cancel` → `checkout` → eveniment de plată ducea comanda la `PAID` cu instanță, factură și abonament |
| FIN-P2-01 | Numerele de factură cu `count() + 1`: pierdere de factură la evenimente concurente | High | Da | Nu | `api/src/services/stripe.ts:495` (`invoice.count()`) | **INVALID** ca enunț — vezi §2 C3. **Rezidualul e real**: `upsertInvoice()` și `billing.ts` folosesc două surse de adevăr pentru numărul facturii → **`SYN-P2-01`** | nu |
| FIN-P2-02 | Onorarea comenzii nu e atomică: livrări concurente ale aceluiași eveniment | Medium | Da | Nu | `api/src/routes/webhooks.ts:262-281` (`findUnique` apoi `create` pe `provisioningKey`) | **PARTIALLY FIXED** — cheia unică `provisioningKey` împiedică instanța duplicată (rândul 265), dar cursa rămâne: a doua creare aruncă `P2002` și evenimentul trece în `failed` + reîncercare | parțial |
| FIN-P2-03 | Planul anual nu e comandabil: suma cotată nu e suma încasată | High | Da | Nu | `api/src/services/pricing.ts:417-422`; `api/src/routes/orders.ts:74` | **FIXED & VERIFIED** | **da** — `2e1e78a`; `period` propagat în `buildQuote`; `phase2-payment-safety.test.ts` „quotes a yearly plan with the yearly price" |
| FIN-P2-04 | Calea locală de checkout acceptă comenzi anulate sau rambursate | Medium | Da | Nu | `api/src/routes/orders.ts:159-203` | **FIXED & VERIFIED** — garda e acum **în rută** (checkout → 409 pentru `CANCELLED`/`REFUNDED`), nu doar în serviciu | **da** — `4969f4a` |
| FIN-P2-05 | Contorul `Promotion.usedCount` se dublează la webhook-uri concurente | Medium | Da | Nu | `api/src/services/stripe.ts:311-317` (`promotionRedeemedAt` ca ghidă idempotenta) | **FIXED & VERIFIED** — garda de idempotență e în cod | **da** — `2e1e78a` |
| FIN-P2-06 | Comandă gratuită: se scrie o plată „reușită" de 0 lei | Medium | Da | Nu | `api/src/services/stripe.ts` (`upsertPayment`); `api/src/routes/orders.ts:174-176` | **STILL BROKEN** — un rând `Payment` cu `status='SUCCEEDED'`, `amount=0` e încă scris pentru o comandă gratuită; nu plătește nimeni, dar falsifică raportul de încasări | nu |
| FIN-P3-01 | Înregistrările de retenție: read-modify-write fără blocaj → infrastructură orfană | Low | Da | Da | `api/src/services/billing.ts:333-352,446-448,530` | **STILL BROKEN** | nu |
| FIN-P3-02 | Integritatea stărilor financiare nu e impusă de baza de date | Low | Da | Nu | `api/prisma/migrations/*` — nicio constrângere `CHECK` pe `Order.total`, `Invoice.amount`, `Payment.amount` | **STILL BROKEN** | nu |
| FIN-P3-03 | Numerele de comandă arse în urma tentativelor eșuate | Low-Info | Nu | Nu | `api/src/services/order-numbers.ts`; `FIN-T20` (`gapsAfter=[27,41,82,114,125,156,168]`) | **STILL BROKEN** — prin design (numerele nu se reciclează); doar cosmetic | nu |

### 3.4 Sesiuni, cookie-uri, plafon — `SESSIONS-INVESTIGATION.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| SESS-P1-01 | Producția rulează un build înainte de remediere: fără plafon de sesiuni, fără `last activity`, fără filtrarea expiratelor | High | Nu | Da | `docker exec blipmade-api-1 grep -c MAX_SESSIONS_PER_USER /app/dist/plugins/auth.js` → 0; `SELECT count(*) FROM "Session"` → 268 | **FIXED & VERIFIED** — prin **deploy**, nu prin cod: ramura aplicată, migrare `20261024110000_session_last_seen` aplicată, `MAX_SESSIONS_PER_USER = 20` prezent în imaginea deployată | **da** — `2e1e78a` |
| SESS-P1-01 (rest) | **Mecanismul** care l-a produs: lipsa unui control de release care verifică imaginea deployată împotriva ramurii | High | Nu | Da | Nu există niciun pas în `scripts/` sau în pipeline care compară `_prisma_migrations` cu lista din ramură | **STILL BROKEN** — acesta e rândul care supraviețuiește după deploy | nu |
| SESS-P1-02 | Adresa de client înregistrată e adresa proxy-ului, nu a clientului | High | Nu | Da | 198 din 268 de sesiuni (74%) rețin adresa edge-ului Cloudflare | **PARTIALLY FIXED** — există acum `web/src/lib/client-address.mjs`, dar pe traseul public API-ul continuă să vadă adresa edge-ului (`INFRA-P1-09`) | **da** |
| SESS-P1-03 | **REGRESIE**: algoritmul nou de rezolvare a adresei citește lanțul `X-Forwarded-For` de la stânga și poate fi falsificat | High | Da | Da | `web/src/lib/client-address.mjs:188-201` — bucla `for (const candidate of splitChain(forwardedFor))` returnează **primul adres neîncrezut de la stânga**, adică exact valoarea controlată de client | **STILL BROKEN** — verificat de mine în cod: parcurgerea trebuie făcută **de la dreapta la stânga** | nu |
| SESS-P1-04 | Limitarea per adresă e, de fapt, per edge Cloudflare (cheie comună tuturor clienților) | High | Da | Da | `api/src/app.ts:80` (`keyGenerator: request.ip`) | **FIXED & VERIFIED** — aceeași cauză ca `SEC-P1-02`, reparată în faza 14 (`f8b2051`) | **da** — `f8b2051` |
| SESS-P1-05 | Limitarea per cont numără și autentificările reușite | Medium | Da | Da | `api/src/routes/auth.ts` (`accountGuard`, `max: 10`); 11 autentificări corecte → 11-a = HTTP 429 | **FIXED & VERIFIED** — reparat în faza 14 (`f8b2051`): contorul numără **doar eșecurile**, iar o autentificare reușită șterge contorul contului | **da** — `f8b2051`; `phase14-rate-limits.test.ts` „does not count a sign-in that worked"; dovadă: fără reparare, a 11-a autentificare corectă era refuzată cu 429 |
| SESS-P1-06 | Schimbarea adresei de e-mail nu încheie sesiunile | Medium | Da | Da | `api/src/routes/settings.ts` (`/settings/email/confirm`) | **STILL BROKEN** | nu |
| SESS-P1-07 | Cererea de închidere a contului nu încheie sesiunile și nu există instrument de administrare | Medium | Da | Da | `api/src/routes/settings.ts` (`/settings/account/closure`); `api/src/routes/admin.ts` | **STILL BROKEN** | nu |
| SESS-P1-08 | Cursă la rotire: două semnări simultane cu același cookie produc două sesiuni | Medium | Nu | Da | `api/src/plugins/auth.ts` (`openSession`) | **STILL BROKEN** | nu |
| SESS-P1-09 | Lista de sesiuni e trunchiată la 50 fără niciun indicator | Medium | Nu | Da | `api/src/routes/settings.ts` (`take: 50`) | **STILL BROKEN** | nu |
| SESS-P1-10 | Interfața nu poate deosebi două sesiuni cu aceleași metadate | Medium | Nu | Da | `web/src/app/Settings.tsx`; `web/src/lib/api.ts` (`sessionSummary`) | **STILL BROKEN** — aceeași cauză ca `UX-P1-04` | nu |
| SESS-P1-11 | Adresa afișată poate fi internă sau de proxy, fără nicio marcă | Medium | Nu | Da | `api/src/routes/settings.ts` (`serializeSession`); `web/src/lib/api.ts` | **STILL BROKEN** | nu |
| SESS-P1-12 | Nu există expirare glisantă: o sesiune activă expiră la 14 zile de la ultima *autentificare* | Low-Info | Nu | Da | `api/src/plugins/auth.ts` (`SESSION_TTL_MS`, `loadSession`) | **STILL BROKEN** | nu |
| SESS-P1-13 | Stiva de test „izolată" de pe portul 30002 scrie în baza de date de producție | Medium | Da | Da | infrastructură de test (`/opt/blipmade`, procese `node server.mjs`) | **PARTIALLY FIXED** — incidentul a fost documentat și curățat (`_raw/PRODUCTION-POLLUTION-INCIDENT.md`), dar **refuzul de pornire cu `DATABASE_URL` fără sufix `_test` nu e implementat în cod** | nu |
| SESS-P1-14 | `env.cookieSecure` e cod mort; potrivirea adreselor de proxy din build-ul vechi e prin subșir | Low-Info | Nu | Da | `api/src/env.ts:128`; build-ul vechi `web/server.mjs` | **STILL BROKEN** | nu |

### 3.5 Administrare — `ADMIN-FUNCTIONALITY.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| ADM-P1-01 | Escaladare de privilegii: un personal cu `staff.write` își poate acorda 20 din 21 de permisiuni | High (Critical dacă `staff.write` e delegată) | Da | Da | **re-lift** `SEC-04`; măsurat pe două stive: `self-grant 20 of 21 -> 200`; garda veche la `api/src/routes/admin.ts:1059` (acum `1109-1126`) | **FIXED & VERIFIED** | **da** — `2e1e78a`; `api/src/routes/admin.ts:1109-1126` (3 garde noi: actor≠țintă, doar permisiuni deținute, lista completă) + `phase2-access-control.test.ts` „refuses to grant a permission that the staff member does not hold" |
| ADM-P1-02 | `customers.write` poate suspenda un cont de administrator sau de personal | High | Da | Da | `api/src/plugins/auth.ts` (`assertMayActOnAccount`); `api/src/routes/admin.ts` | **FIXED & VERIFIED** — **retestul a găsit jumătatea „sau de personal" deschisă** (`RT-P1-02`); reparată în faza 15 (`4969f4a`): garda acoperă și rolul `STAFF` | **da** — `4969f4a`; `phase15-order-lifecycle.test.ts` „does not let a member of the staff suspend another member of the staff" |
| ADM-P2-01 | Panoul de control cere `customers.read` și expune cifre de ordine, servicii, bilete, venit și MRR | High | Da | Da | `web/src/admin/*`; măsurat pe două stive | **STILL BROKEN** — design, nu defect: `customers.read` e permisie de citire, dar expune venit și MRR | nu |
| ADM-P2-02 | Navigația administrativă nu e filtrată pe permisiuni | Medium | Nu | Da | `web/src/admin/*` | **STILL BROKEN** | nu |
| ADM-P2-03 | Nicio căutare în comenzi și bilete, nicio paginare și nicio sortare în nicio listă | Medium | Da | Da | `api/src/routes/admin.ts`; `web/src/admin/*` | **STILL BROKEN** | nu |
| ADM-P2-04 | Operații în masă: absente în API și în interfață | Medium | Da | Nu | `api/src/routes/admin.ts` | **STILL BROKEN** | nu |
| ADM-P2-05 | Mutații existente în API, dar pe care interfața nu le expune (8 funcții) | Medium | Da | Nu | `api/src/routes/admin.ts` vs `web/src/admin/*` | **STILL BROKEN** — e **funcționalitate lipsă**, nu defect | nu |
| ADM-P2-06 | Contul de autentificare blochează orice adresă după 10 cereri, chiar reușite, și chiar dacă adresa nu există | Medium | Da | Da | `api/src/routes/auth.ts:61-99`; măsurător: `1..10 → 200`, `11 → 429`, `12 → 429` | **STILL BROKEN** — contorul se aplică și adreselor inexistente, deci un apelant poate bloca inclusiv adresa unui administrator | nu |
| ADM-P3-01 | Atribuirea unui bilet cere `staff.read` în interfață, deși API-ul cere doar `tickets.write` | Medium | Da | Da | `web/src/admin/Tickets.tsx` vs `api/src/routes/tickets.ts` | **STILL BROKEN** | nu |
| ADM-P3-02 | Jurnalul modificărilor de permisiuni nu notează ce a fost eliminat | Low-Info | Nu | Da | `api/src/routes/admin.ts` (acțiunea `staff.permissions_updated` scrie doar lista nouă) | **STILL BROKEN** | nu |
| ADM-P3-03 | Jurnalul nu notează o reconciliere a prețurilor care nu corectează nimic | Low-Info | Da | Da | `api/src/routes/admin.ts` | **STILL BROKEN** | nu |
| ADM-P3-04 | Un personal ne-administrator poate schimba titlul unui administrator | Low | Nu | Da | `api/src/routes/admin.ts` (`title` nu e acoperit de garda de rol) | **STILL BROKEN** | nu |
| ADM-P3-05 | Ecranul de personal afișează simultan „0 staff members" și „The staff list could not be loaded" | Low | Nu | Nu | `web/src/admin/Staff.tsx` | **STILL BROKEN** | nu |
| ADM-P3-06 | `GET /admin/money` e un capăt mort | Low-Info | Da | Nu | `api/src/routes/admin.ts:1254`; `FN-P1-11` | **STILL BROKEN** | nu |

### 3.6 Inventar funcțional — `FUNCTIONAL-COVERAGE.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| FN-P1-01 | Configurația „recomandată" a cărții de prețuri nu poate fi setată niciodată | High | Da | Nu | `api/src/routes/admin.ts:612-614` (`defaultRam: body.minRam`); `api/src/services/pricing.ts:88-113` | **STILL BROKEN** — `priceBook().recommended === priceBook().minimum` pentru orice produs | nu |
| FN-P1-02 | Atașamentele de la bilete sunt doar metadate; backend-ul real nu are niciun apelant | High | Da | Nu | `web/src/app/TicketDetail.tsx:90,99-103`; `api/src/routes/tickets.ts:318-406`; `SELECT count(*) FROM "Attachment"` → 0 | **STILL BROKEN** — backend-ul complet există, dar nu e legat | nu |
| FN-P1-03 | Pagina de facturare ignoră parametrul `checkout`; în poarta locală plata nu se finalizează niciodată | High | Da | Nu | `web/src/app/Billing.tsx` (nu conține `checkout`); `web/src/app/Deploy.tsx:344-349` | **STILL BROKEN** | nu |
| FN-P1-04 | Documentația promite o pagină de metrici care nu există | Medium | Da | Nu | `web/src/pages/Docs.tsx` („Check the metrics"); `api/src/routes/instances.ts:157` | **STILL BROKEN** | nu |
| FN-P1-05 | Contorul de redeem-uri afișat în admin nu e contorul care impune plafonul | Medium | Da | Nu | `api/src/routes/admin.ts:801`; `api/src/services/pricing.ts:207-241` | **STILL BROKEN** | nu |
| FN-P1-06 | Implementare duplicată și moartă a notificărilor de factură | Medium | Da | Nu | `api/src/routes/billing.ts:31-113` (`notifyInvoicePaid` etc., neimportate) | **STILL BROKEN** | nu |
| FN-P1-07 | Majoritatea mesajelor tranzacționale ocolesc coada de e-mail | Medium | Da | Da | `api/src/routes/settings.ts:332`; `api/src/routes/tickets.ts:455,470`; `api/src/routes/auth.ts:146,167` — doar e-mailurile de autentificare folosesc `dispatchEmail` | **STILL BROKEN** | nu |
| FN-P1-08 | `GET /webhooks/stripe/failed` răspunde 200 cu corp de eroare | Medium | Da | Da | `api/src/routes/webhooks.ts:722-728` | **STILL BROKEN** | nu |
| FN-P1-09 | Copiile de rezervă nu sunt programate pe gazdă | Medium | Da | Da | `systemctl status blipmade-backup.timer` → „Unit … could not be found" | **FIXED & VERIFIED** — prin acțiune de operator (timer instalat, `enabled`, rulare manuală cu arhivă + `.sha256`) | n/a (operator) |
| FN-P1-10 | Butonul „Refund" din comenzile de admin eșuează întotdeauna fără Stripe | Medium | Da | Nu | `web/src/admin/Orders.tsx`; `api/src/routes/admin.ts:408` → 503 „Payments are not configured on this environment" | **BLOCKED: EXTERNAL DEPENDENCY** (`STRIPE_SECRET_KEY`) | nu |
| FN-P1-11 | `GET /admin/money` e un stub cu valoare fixă | Low-Info | Da | Nu | `api/src/routes/admin.ts:1254` → `{"example":{"minorUnits":312,…}}` | **STILL BROKEN** | nu |
| FN-P1-12 | Mecanisme fără ecran: enrolarea de admin și credentialele de panou | Low-Info | Da | Da | `api/src/routes/auth.ts:353`; `api/src/routes/admin.ts:218,254,287` | **STILL BROKEN** | nu |
| FN-P1-13 | `pterodactylUserId` e completat, dar API-ul îl întoarce mereu `null` clientului | Low-Info | Nu | Nu | `api/src/routes/auth.ts:118` (`publicUser`); `api/src/services/panel/identity.ts:107,132,144` | **STILL BROKEN** | nu |
| FN-P1-14 | Cotă și listă: `quantity` e ignorată în cotă și onorată în comandă | Low-Info | **Da** | Nu | `api/src/routes/catalog.ts` (cotă: `quantity: 1`, `total: 1500`); `api/src/routes/orders.ts` (comandă: `quantity: 3`) | **STILL BROKEN** — **suma e corectă**, dar câmpul afișat nu; totuși, prețul afișat ≠ prețul plătit la nivel de afișare | nu |
| FN-P1-15 | Ecranul de prețuri nu are câmpuri pentru configurația recomandată | Low-Info | Da | Nu | `web/src/admin/Pricing.tsx` | **STILL BROKEN** — dependent de `FN-P1-01` | nu |
| FN-P1-16 | Costul unui „upgrade" nu poate fi plătit în mediul de test | Low-Info | Da | Nu | `web/src/app/InstanceDetail.tsx:290-315` | **NOT VERIFIED** — depinde de poarta de plată; ce ar verifica: un `UPGRADE` real cu `period` propagat | nu |
| FN-P1-17 | Aliasuri de rute nefolosite (`files/archive`, `files/unarchive`, `startup` PATCH) | Low-Info | Nu | Nu | `api/src/routes/instance-server.ts:360,382` | **STILL BROKEN** | nu |
| FN-P1-18 | Mesajul de blocaj e inexact pentru un produs care nu are niciodată imagine | Low-Info | Da | Nu | `api/src/services/availability.ts:63-65`; `web/src/lib/pricing-contract.ts` | **STILL BROKEN** | nu |
| FN-P1-19 | O pagină își construiește propriul tabel în loc de componenta comună | Low-Info | Nu | Nu | `web/src/app/Domains.tsx:286-300` vs `web/src/lib/table.ts` | **STILL BROKEN** | nu |
| FN-P1-20 | Lista de sesiuni numește „A browser" orice client care nu e browser | Low-Info | Nu | Nu | `api/src/routes/settings.ts:468` | **STILL BROKEN** | nu |
| FN-P1-21 | `currentPeriodEnd` rămâne `null` pentru un abonament activ | Low-Info | Da | Nu | `api/src/routes/billing.ts:124`; `web/src/app/Billing.tsx` → „CURRENT PERIOD ENDS — Not available" | **STILL BROKEN** — se remediază cu Stripe activ | nu |
| FN-P1-22 | Secțiunea „Platform" de pe pagina de pornire e o machetă | Low-Info | Da | Da | `web/src/home/Platform.tsx:22-25` („The mock is a picture") | **STILL BROKEN** | nu |
| FN-P1-23 | Funcțiile de instanță care depind de panou nu au putut fi exercitate | Low-Info | Nu | Nu | `api/src/routes/instance-server.ts` (12 taburi) | **NOT VERIFIED** — necesită panou real | nu |
| FN-P1-24 | Documentația nu menționează fila „Backups" a instanței | Low-Info | Da | Nu | `web/src/pages/Docs.tsx` („Blipmade does not take automatic backups of your data yet") vs `web/src/app/instance/BackupsTab.tsx` | **STILL BROKEN** | nu |
| FN-P1-25 | Starea domeniilor nu poate fi confirmată până la capăt fără DNS real | Low-Info | Da | Nu | `api/src/routes/domains.ts:209-460`; `api/src/services/dns.ts` | **BLOCKED: EXTERNAL DEPENDENCY** (`DOMAIN_BASE`, Caddy) | nu |
| FN-P1-26 | Nu se poate vedea nicio factură după o plată | Low-Info | **Da** | Nu | `api/src/routes/billing.ts:322`; lista facturilor goală după plată | **STILL BROKEN** — **money-relevant prin impact**: clientul care plătește nu primește factură; vezi `PAR-P1-01`, `CJ-P1-02` | nu |
| FN-P1-27 | Lista de sesiuni afișează „no activity recorded" pentru o sesiune abia creată | Low-Info | Nu | Nu | `api/src/routes/settings.ts:468-487` | **STILL BROKEN** | nu |
| FN-P1-28 | Permisiunile nu au efect asupra membrilor cu rol `ADMIN` | Low-Info | Nu | Da | `api/src/lib/permissions.ts:39-45` (`hasPermission` → `true` pentru `ADMIN`) | **STILL BROKEN** — vezi `PAR-P1-29` | nu |
| FN-P1-29 | Validarea mărește inutil unele erori | Low-Info | Nu | Nu | `api/src/routes/admin.ts:381,408` — validarea înainte de existența înregistrării | **STILL BROKEN** | nu |
| FN-P1-30 | Sonda internă `/internal/not-a-real-route` e înregistrată ca rută reală | Low-Info | Nu | Da | `api/src/routes/auth.ts:419` | **STILL BROKEN** | nu |
| FN-P1-31 | Anularea unei comenzi nu are niciun ecran | Low-Info | Da | Nu | `api/src/routes/orders.ts:198` (`POST /orders/:id/cancel` → 204, niciun apelant) | **STILL BROKEN** | nu |
| FN-P1-32 | Stiva izolată folosește același Redis ca producția | Low-Info | Nu | Da | `REDIS_URL=redis://localhost:6379`; `api/src/lib/rate-limit.ts` | **STILL BROKEN** — **confirmat de mine**: `redis-cli DBSIZE` a răspuns gol în sandbox, iar procesul de audit are o conexiune `ESTAB` la `127.0.0.1:6379` | nu |
| FN-P1-33 | Limita de autentificare numără și eșecurile, dar mesajul nu spune nimic | Low-Info | Da | Nu | `api/src/routes/auth.ts:86-95` → 429 „Too many requests. Try again shortly." | **STILL BROKEN** | nu |
| FN-P1-34 | Un produs „Coming soon" fără ou primește două mesaje de blocaj | Low-Info | Da | Nu | `api/src/services/availability.ts:60-65` | **STILL BROKEN** | nu |

### 3.7 Călătoria clientului — `CUSTOMER-JOURNEYS.md`

Raportul a fost scris în timpul sintezei; la momentul citirii avea 570 de linii și
conținea 12 constatări.

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| CJ-P1-01 | La întoarcerea de la plată, clientul ajunge pe o pagină de facturare care nu știe de ce a venit | High | Da | Nu | `web/src/app/Billing.tsx` — nu conține nicio apariție a cuvântului `checkout`; „THIS MONTH (ESTIMATE) €0.00" | **STILL BROKEN** | nu |
| CJ-P1-02 | Clientul plătește și nu primește nicio factură | Medium | **Da** | Nu | plată reușită de 172 EUR → `GET /api/billing/invoices` → `{"invoices":[]}` | **STILL BROKEN** — aceeași cauză ca `FN-P1-26` / `PAR-P1-01` | nu |
| CJ-P1-03 | Clientul care deschide un bilet nu primește nicio confirmare prin e-mail | Medium | Da | Da | `POST /api/tickets` → 201, un singur e-mail, către `admin.check@example.test`; `api/src/lib/email-templates.ts:262,290` nefolosite | **STILL BROKEN** | nu |
| CJ-P1-04 | Lista de bilete a clientului nu e trunchiată: `limit` și `offset` sunt ignorate | Medium | Nu | Da | `GET /api/tickets?limit=2&offset=0` → toate cele 6 bilete; `api/src/routes/tickets.ts:136-145` (`take: 100` fix) | **STILL BROKEN** | nu |
| CJ-P1-05 | Schimbarea adresei de e-mail nu cere parola | Medium | Da | Da | `POST /api/settings/email` cu `{email}` → HTTP 200; `api/src/routes/settings.ts:303-310` (nu există `currentPassword`) | **STILL BROKEN** | nu |
| CJ-P1-06 | Garda per cont numără și autentificările reușite | Medium | Da | Da | `api/src/routes/auth.ts` (`accountGuard`) | **STILL BROKEN** — **aceeași constatare ca `ADM-P2-06` / `SESS-P1-05`** | nu |
| CJ-P1-07 | Limitele de 5 pe 15 minute sunt comune tuturor clienților de pe aceeași adresă | Medium | Da | Da | `api/src/app.ts` (`keyGenerator: request.ip`) | **STILL BROKEN** — aceeași cauză ca `SEC-P1-02` | nu |
| CJ-P1-08 | Rutele de putere răspund 200, deși codul spune 202 | Low | Nu | Nu | măsurător în sandbox; `api/src/routes/*` | **STILL BROKEN** | nu |
| CJ-P1-09 | O dublă apăsare pe butonul de comandă creează două comenzi | Medium | **Da** | Nu | măsurător pe interfața reală (`:30006`) | **STILL BROKEN** — **money-relevant**: dublă comandă = dublă cerere de plată | nu |
| CJ-P1-10 | Prima instanță a fiecărui ou nu poate fi provisionată fără un server-șablon creat de un om | High (operațional) | Da | Nu | `api/src/services/provisioning.ts`; fluxul de provisionare | **STILL BROKEN** | nu |
| CJ-P1-11 | Notificarea de bilet nu ajunge la inbox-ul de suport, ci la adresele conturilor de personal; fără personal, se pierde în tăcere | Medium | Da | Da | `api/src/routes/tickets.ts:455,470` | **STILL BROKEN** | nu |
| CJ-P1-12 | Contractul public al catalogului expune un preț pentru un produs care nu poate fi comandat | Low | **Da** | Da | `api/src/routes/catalog.ts`; `api/src/services/availability.ts` | **STILL BROKEN** — **money-relevant**: preț afișat pentru ceva ce nu se poate cumpăra | nu |

### 3.8 Interfață și accesibilitate — `UI-UX-REVIEW.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| UX-P1-01 | Tokenul `--ink-3` nu trece WCAG AA pe suprafețele pe care e folosit | High | Nu | Nu | `web/src/index.css:57` (`--color-ink-3: #7b827b`); **2 334** eșecuri de contrast pe 21 de rute; 4.31:1 pe `--s2`, 3.80:1 pe `--s3` | **STILL BROKEN** — remediabil într-o linie (`#8a9090`) | nu |
| UX-P1-02 | Coada de suport din zona de admin e înghesuită într-o coloană de 360 px; coloana de detaliu rămâne goală | High | Da | Nu | măsurător pe 32 de rute × 6 lățimi; subiecte tăiate la 144 px; 700 px nefolosiți | **STILL BROKEN** | nu |
| UX-P1-03 | Valori tăiate în tabele fără nicio cale de recuperare (80 de celule) | Medium | Nu | Da | măsurător; actor, țintă și client tăiați în jurnal și lista de servicii | **STILL BROKEN** | nu |
| UX-P1-04 | Două sesiuni identice sunt afișate ca două rânduri identice, la caracter | Medium | Nu | Da | măsurător; aceeași cauză ca `SESS-P1-10` | **STILL BROKEN** | nu |
| UX-P1-05 | Numele de instanță scris de client se pierde la reîncărcare, la „înapoi" și la link direct | Medium | Da | Nu | măsurător pe interfața reală | **STILL BROKEN** | nu |
| UX-P1-06 | Niciun tabel din platformă nu are antetul lipicios | Medium | Nu | Nu | măsurător: 0 antete lipicioase în toate cele 10 tabele | **STILL BROKEN** | nu |
| UX-P1-07 | Cele 21 de casete de permisiuni au ținta de 16 × 16 px | Medium | Nu | Da | măsurător | **STILL BROKEN** | nu |
| UX-P1-08 | Pagina de pornire cere catalogul de șase ori la o încărcare; cache-ul existent e ocolit | Medium | Da | Da | 6× `GET /api/catalog/products` (5 791 B fiecare); `web/src/home/{Ticker,Story,Catalog,Configurator}.tsx`; cache nefolosit în `web/src/lib/pricing.ts:32-51` | **STILL BROKEN** — aceeași cauză ca `PERF-P1-02` | nu |
| UX-P1-09 | `/apps` nu are niciun element `<h1>` | Low | Nu | Da | `web/src/app/ProductPage.tsx` — titlul vizual e `h2` | **STILL BROKEN** | nu |
| UX-P1-10 | Pagina de instanță are 12 taburi | Low | Da | Nu | măsurător | **STILL BROKEN** | nu |
| UX-P1-11 | Selectorul de CPU nu afișează unitatea, selectorul de memorie o afișează | Low | Nu | Nu | măsurător | **STILL BROKEN** | nu |
| UX-P1-12 | Câmpurile de nume din Setări sunt de 529 px pentru o valoare de 5 caractere | Low | Nu | Nu | măsurător | **STILL BROKEN** | nu |
| UX-P1-13 | Titlul paginii și butonul principal sunt același cuvânt: „Deploy" | Low | Da | Nu | măsurător | **STILL BROKEN** | nu |
| UX-P1-14 | Lista de sesiuni afișează adresa brută, fără nicio marcă despre tipul ei | Low | Nu | Da | aceeași cauză ca `SESS-P1-11` | **STILL BROKEN** | nu |

### 3.9 Infrastructură și recuperare — `INFRASTRUCTURE-AND-RECOVERY.md`

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| INFRA-P1-01 | Copia de backup nu părăsește niciodată hostul | **Critical** | Da | Da | `scripts/backup.sh` (blocul `OFFSITE`), `OFFSITE_TARGET` absent din `.env`; `ExecStartPost` ieșit 0, `OFFSITE_KEY` lipsă | **STILL BROKEN** — RPO la pierderea gazdei = **tot**; **aceeași constatare ca `SEC-P2-02`** | parțial (timer) |
| INFRA-P1-02 | RAID 0 confirmat, dar la nivelul hipervisorului, nu al VM-ului | **Critical** | Da | Da | inspecție hardware; o singură eroare de disc pierde simultan platforma și datele | **BLOCKED: EXTERNAL DEPENDENCY** (operator) | nu |
| INFRA-P1-03 | Niciun firewall pe gazda platformei și niciunul pe hipervisor | **Critical** | Da | Da | `iptables -S` → `INPUT ACCEPT`, `FORWARD ACCEPT`; `nftables` `disabled`; fără `ufw`/`firewalld` | **BLOCKED: EXTERNAL DEPENDENCY** (operator) | nu |
| INFRA-P1-04 | Consola Proxmox, rpcbind și spiceproxy sunt expuse public | High | Da | Da | `ss -lntp` pe hipervisor: `22`, `111`, `8006`, `3128` pe toate cele patru adrese publice | **BLOCKED: EXTERNAL DEPENDENCY** (operator) | nu |
| INFRA-P1-05 | Nicio limită de resurse pe containere și niciun swap | High | Da | Da | `compose.api.yml` — niciun `mem_limit`/`cpus`; `free -h` → `swap: 0` | **STILL BROKEN** — aceeași cauză ca `PERF-P1-16` | nu |
| INFRA-P1-06 | Jurnalele Docker nu sunt rotite | High | Nu | Da | `docker inspect` → fără `max-size`/`max-file` | **STILL BROKEN** | nu |
| INFRA-P1-07 | Nu există recuperare la un punct în timp (PITR) | High | Da | Da | `archive_mode`/`wal_level` neconfigurate; fără arhivare WAL | **STILL BROKEN** | nu |
| INFRA-P1-08 | Arhiva de backup nu conține volumul de atașamente | High | Da | Nu | `scripts/backup.sh` — lipsește volumul `upload_data` | **STILL BROKEN** | nu |
| INFRA-P1-09 | Pe traseul public, API-ul nu mai vede adresa vizitatorului | High | Da | Da | `request.ip` = adresa edge-ului pe toate cererile publice | **STILL BROKEN** — cauza rădăcină a lui `SEC-P1-02`, `SESS-P1-04`, `CJ-P1-07` | nu |
| INFRA-P1-10 | API-ul are încredere în întregul bridge Docker | Medium | Nu | Da | `compose.api.yml` (`TRUSTED_PROXIES` implicit `172.16.0.0/12`); **re-lift** `SEC-05` | **STILL BROKEN** | nu |
| INFRA-P1-11 | `requestId` nu e un identificator de corelare utilizabil | Medium | Nu | Da | `api/src/app.ts` | **STILL BROKEN** | nu |
| INFRA-P1-12 | Nu există monitorizare, alertare sau metrică | Medium | Da | Da | `compose.api.yml` — fără agent, fără export de metrici | **STILL BROKEN** | nu |
| INFRA-P1-13 | Nu există dead-letter durabil pentru joburile eșuate | Medium | Da | Nu | `api/src/worker.ts`; aceeași cauză ca `SEC-P4-03` | **STILL BROKEN** | nu |
| INFRA-P1-14 | `/api/status` e public și dezvăluie topologia internă | Medium | Nu | Da | `api/src/routes/health.ts` | **STILL BROKEN** | nu |
| INFRA-P1-15 | Imaginile Docker: tag `latest`, fără registru, fără cale de rollback | Medium | Da | Da | `compose.api.yml` (`build: ./api`), `blipmade-api:latest` | **STILL BROKEN** | nu |
| INFRA-P1-16 | PostgreSQL nu are vizibilitate pe interogări | Medium | Nu | Da | `log_min_duration_statement = -1`; aceeași cauză ca `PERF-P1-15` | **STILL BROKEN** | nu |
| INFRA-P1-17 | Resturi de audit în producție: 7 099 e-mailuri nedeliverate și 9 baze de test | Medium | Da | Da | enumerare directă pe `blipmade` | **PARTIALLY FIXED** — incidentul de poluare a fost documentat și curățat (`_raw/PRODUCTION-POLLUTION-INCIDENT.md`); băzile rămase: `blipmade_test`, `blipmade_shadow`, `blipmade_check`, `blipmade_audit_test`, `blipmade_suite_test` (baza `blipmade_synth_test`, creată de mine pentru testele de regresie, a fost **ștearsă** după rulare) | nu |
| INFRA-P1-18 | Stack-ul de verificare al auditului e publicat pe `0.0.0.0` | Low | Nu | Da | `ss -ltnp`: `30003`, `30004`, `30005` pe `0.0.0.0` | **STILL BROKEN** — confirmat de mine la 01:16: `LISTEN 0 511 0.0.0.0:3113` etc. | nu |
| INFRA-P1-19 | LLMNR ascultă pe toate interfețele | Low | Nu | Da | `5355/tcp+udp` pe `0.0.0.0` | **STILL BROKEN** | nu |
| INFRA-P1-20 | HSTS și CSP lipsesc pe traseul static public | Low | Nu | Da | `web/server.mjs`; aceeași cauză ca `SEC-P4-02` | **STILL BROKEN** | nu |
| INFRA-P1-21 | `EXPOSE` al worker-ului indică portul greșit | Low | Nu | Nu | `api/Dockerfile` | **STILL BROKEN** | nu |
| INFRA-P1-22 | Starea patch-urilor OS: la nivel, o actualizare de securitate în așteptare | Low-Info | Nu | Da | `apt list --upgradable` | **STILL BROKEN** | nu |
| INFRA-P1-23 | Ramura `main` e cu un commit înainte de origin | Low-Info | Nu | Nu | compararea ramurilor | **NOT VERIFIED** — ce ar verifica: `git rev-parse main origin/main` pe o copie cu `.git` | nu |

### 3.10 Performanță și fiabilitate — `PERFORMANCE-AND-RELIABILITY.md`

Severitățile originale sunt `P1/High`, `P2/Medium`, `P3/Low-Info`; normalizate în coloana
„Sev".

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| PERF-P1-01 | Serverul web nu comprimă nimic | High | Da | Nu | `web/server.mjs:186-202`; `Content-Length: 328452` vs **95 332** gzip (−71 %); zero potriviri pentru `gzip\|brotli\|deflate\|Content-Encoding` | **STILL BROKEN** | nu |
| PERF-P1-02 | Landing-ul face 6 cereri identice pentru același catalog | High | Da | Da | 6× `GET /api/catalog/products`; `web/src/home/{Ticker,Story,Catalog,Configurator}.tsx`; cache nefolosit în `web/src/lib/pricing.ts:32-51` | **STILL BROKEN** | nu |
| PERF-P1-03 | N+1 în calculul de preț: două interogări per element din coadă | High | Da | Da | `api/src/services/pricing.ts`; p50 de la 17 ms (1 produs) la 35 ms (8 produse) | **STILL BROKEN** | nu |
| PERF-P1-04 | Lipsesc indicii pe coloanele de sortare ale listelor | High | Da | Nu | `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt/status`; degradare ×3,1→×5,8 | **STILL BROKEN** | nu |
| PERF-P1-05 | Jurnalul de audit e numărat prin parcurgerea tuturor intrărilor | Medium | Da | Da | `api/src/routes/admin.ts` | **STILL BROKEN** | nu |
| PERF-P1-06 | Numărul de comandă se generează printr-o scanare integrală a tabelului de comenzi | Medium | Da | Da | `api/src/services/order-numbers.ts` | **STILL BROKEN** | nu |
| PERF-P1-07 | Pagina publică de stare face apeluri seriale spre panou și durează 4 secunde | Medium | Da | Da | `api/src/routes/health.ts`; 2+N apeluri seriale, timeout 20 s fiecare | **STILL BROKEN** | nu |
| PERF-P1-08 | Cautarea sesiunii rulează la fiecare cerere, fără cache | Medium | Nu | Da | `api/src/plugins/auth.ts` (`loadSession`) | **STILL BROKEN** | nu |
| PERF-P1-09 | Trei cereri de font garantat 404 la fiecare încărcare de pagină | Low-Info | Nu | Da | reguli `@font-face` cu fișiere inexistente | **STILL BROKEN** | nu |
| PERF-P1-10 | Fonturile nu sunt preloadate | Low-Info | Nu | Nu | `web/src/index.css` | **STILL BROKEN** | nu |
| PERF-P1-11 | `index.html` nu are `ETag` | Low-Info | Nu | Nu | `web/server.mjs` | **STILL BROKEN** | nu |
| PERF-P1-12 | Rate limitingul acoperă doar o parte din endpoint-uri | Medium | Da | Da | `api/src/app.ts` (registrare parțială) | **STILL BROKEN** | nu |
| PERF-P1-13 | Blob-ul global de retenții e citit la fiecare încărcare a facturării | Low-Info | Da | Nu | `api/src/services/billing.ts:333-352` | **STILL BROKEN** | nu |
| PERF-P1-14 | Două biblioteci mari pot fi amânate până la interacțiune | Low-Info | Nu | Nu | `ace`, `marked` | **STILL BROKEN** | nu |
| PERF-P1-15 | Logarea interogărilor lente e dezactivată | High | Da | Da | `log_min_duration_statement = -1` | **STILL BROKEN** | nu |
| PERF-P1-16 | Niciun container nu are limită de memorie sau CPU | High | Da | Da | `compose.api.yml`; aceeași cauză ca `INFRA-P1-05` | **STILL BROKEN** | nu |
| PERF-P1-17 | Pool-ul de conexiuni e implicit, iar instanța Postgres e partajată | Medium | Da | Nu | `api/src/db.ts` | **STILL BROKEN** | nu |
| PERF-P1-18 | Workerul de provisionare are concurență 2 și poate sta blocat 15 minute pe un job | Medium | Da | Da | `api/src/worker.ts`; ≈75 s de rețries pe job; plafon de 8 joburi/oră | **STILL BROKEN** | nu |
| PERF-P1-19 | Timpul de oprire al containerului nu acoperă o cerere lentă | Medium | Da | Da | `StopTimeout` implicit 10 s; `SIGKILL` în fereastra de deploy | **STILL BROKEN** | nu |
| PERF-P1-20 | `/api/health` nu e un indicator de pregătire | Medium | Da | Da | `compose.api.yml` healthcheck vs `api/src/routes/health.ts` | **STILL BROKEN** | nu |
| PERF-P1-21 | Nu există cache la margine pentru activele statice | Low-Info | Da | Nu | `web/server.mjs`; edge-ul e la `10.77.0.12` | **BLOCKED: EXTERNAL DEPENDENCY** (edge) | nu |

### 3.11 Paritate cu Paymenter — `PAYMENTER-FEATURE-PARITY.md`

| ID | Titlu | Sev | Money | Sec | Stare | Faza 13 |
|---|---|---|---|---|---|---|
| PAR-P1-01 | Facturile nu sunt vizibile de client după plată | P0/Critical | **Da** | Nu | **STILL BROKEN** — `FN-P1-26`, `CJ-P1-02` | nu |
| PAR-P1-02 | Nu există TVA / taxă configurabilă | P0/Critical | **Da** | Nu | **STILL BROKEN** — `api/src/services/stripe.ts:438-460` (`tax ?? 0`); `api/src/services/billing.ts:642,944` | nu |
| PAR-P1-03 | Checkout-ul e oprit: nu se poate vinde nimic | P0/Critical | **Da** | Nu | **BLOCKED: EXTERNAL DEPENDENCY** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `PAYMENTS_ENABLED=true` | nu |
| PAR-P1-04 | Produsul vândut nu conține aplicația | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — imagini Docker + mapare `eggId`; în producție `wordpress` are `eggId` NULL | nu |
| PAR-P1-05 | Niciun e-mail nu ajunge la client | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `SMTP_URL` + transport `smtp` | nu |
| PAR-P1-06 | Nu există adresă publică pentru instanțe | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` | nu |
| PAR-P1-07 | Nicio localizare; interfața e în engleză, formatarea e `en-IE` | High | Da | Nu | **STILL BROKEN** — `api/src/lib/money.ts:8` | nu |
| PAR-P1-08 | Factura e un PDF Stripe, nu o factură Blipmade | High | **Da** | Nu | **STILL BROKEN** — `api/prisma/schema.prisma:482` (`pdfUrl`) | nu |
| PAR-P1-09 | Planul anual e cotat diferit de cel încasat | High | **Da** | Nu | **FIXED & VERIFIED** — `2e1e78a` | **da** |
| PAR-P1-10 | Cantitatea e ignorată în cotă și onorată în comandă | High | **Da** | Nu | **STILL BROKEN** — `FN-P1-14` | nu |
| PAR-P1-11 | O comandă anulată sau rambursată poate fi repusă în circuitul de plată | High | **Da** | Nu | **FIXED & VERIFIED** — `2e1e78a` (garda în `markOrderPaid`) | **da** |
| PAR-P1-12 | Atașamentele la bilete nu ajung niciodată pe server | High | Da | Nu | **STILL BROKEN** — `FN-P1-02` | nu |
| PAR-P1-13 | Nu există planuri gratuite sau de unică folosință; intervalele sunt doar lună/an | High | Da | Nu | **STILL BROKEN** — `api/prisma/schema.prisma:214-217,264-282` | nu |
| PAR-P1-14 | Nu există API public pentru clienți | High | Da | Nu | **STILL BROKEN** — `grep -rn "openapi\|swagger" api/src web/src` → 0 | nu |
| PAR-P1-15 | Stările de instanță nu reflectă realitatea containerului | High | **Da** | Da | **STILL BROKEN** — `api/src/routes/instances.ts:149`; `grep -rn "DEGRADED" api/src/` → 0 | nu |
| PAR-P1-16 | Nu există backup programat și nicio copie în afara hostului | High | **Da** | Da | **PARTIALLY FIXED** — timer instalat; `OFFSITE_*` încă neconfigurat | parțial (operator) |
| PAR-P1-17 | Nu există 2FA | Medium | Nu | Da | **STILL BROKEN** — `grep -rniE "totp\|2fa\|twoFactor"` → 0 | nu |
| PAR-P1-18 | Nu există login social (Discord / GitHub / Google) | Medium | Da | Nu | **STILL BROKEN** | nu |
| PAR-P1-19 | Imposibilitatea de a limita un produs per client | Medium | Da | Nu | **STILL BROKEN** — `maxPerUser` există doar pe `Promotion` | nu |
| PAR-P1-20 | O promoție nu poate fi limitată la anumite produse | Medium | Da | Nu | **STILL BROKEN** — `Promotion` n-are relație cu `Product` | nu |
| PAR-P1-21 | Programul de afiliați nu există | Medium | Da | Nu | **STILL BROKEN** — `api/prisma/schema.prisma` (niciun model `Affiliate`); blochează canalul de creștere cel mai ieftin, nu vânzarea | nu |
| PAR-P1-22 | Verificarea sumei se dezactivează când furnizorul nu trimite suma | Medium | **Da** | Nu | **FIXED & VERIFIED** — `api/src/routes/webhooks.ts:308-316` (`verifyAmount` refuză un eveniment fără sumă), `:395-405` (marcare `FAILED` + audit `order.amount_mismatch`) | **da** — `2e1e78a` |
| PAR-P1-23 | Contorul de redeem-uri afișat în admin nu e contorul care impune plafonul | Medium | Da | Nu | **STILL BROKEN** — `FN-P1-05`; `api/src/routes/admin.ts:801` vs `api/src/services/pricing.ts:207-241` | nu |
| PAR-P1-24 | Rambursarea din admin eșuează întotdeauna | Medium | **Da** | Nu | **BLOCKED: EXTERNAL DEPENDENCY** — `api/src/routes/admin.ts:408` → 503 „Payments are not configured on this environment"; se rezolvă odată cu `PAR-P1-03` | nu |
| PAR-P1-25 | Joburile eșuate din coadă sunt șterse, nu păstrate | Medium | Da | Nu | **STILL BROKEN** — `api/src/worker.ts:120-124` (`queue.clean(0,1000,'failed')` la 10 min); aceeași cauză ca `SEC-P4-03`, `INFRA-P1-13` | nu |
| PAR-P1-26 | Bucle ale workerului înghit erorile | Medium | Da | Da | **STILL BROKEN** — `api/src/worker.ts`; divergența facturilor locale față de Stripe poate persista nedetectată | nu |
| PAR-P1-27 | Nu există paginare în listele administrative | Medium | Da | Nu | **STILL BROKEN** — aceeași cauză ca `ADM-P2-03` | nu |
| PAR-P1-28 | `GET /admin/money` e un stub cu valoare fixă | Medium | Da | Nu | **STILL BROKEN** — `FN-P1-11` | nu |
| PAR-P1-29 | Rolul `ADMIN` ocolește toate cele 21 de permisiuni | Medium | Nu | Da | **STILL BROKEN** — `FN-P1-28`; re-lift `REGR-01` | nu |
| PAR-P1-30 | Nu există motiv de anulare și nici credit de cont | Medium | Da | Nu | **STILL BROKEN** | nu |
| PAR-P1-31 | Nu există pagina de metrici a instanței | Medium | Da | Nu | **STILL BROKEN** — `FN-P1-04` | nu |
| PAR-P1-32 | Nu există planuri gratuite/de probă, deci nici conversie fără card | Medium | Da | Nu | **STILL BROKEN** — `enum SubscriptionStatus` conține `TRIALING`, dar nu există logică de perioadă de probă | nu |
| PAR-P1-33 | Blog și pagini de marketing real | Low/Info | Da | Nu | **STILL BROKEN** — `web/src/home/Platform.tsx` e mock | nu |
| PAR-P1-34 | Nu există temă, extensie, CLI de platformă sau punct de extensie | Low/Info | Nu | Nu | **STILL BROKEN** — **decizie de arhitectură, nu defect** | nu |

### 3.12 Analiză competitivă — `COMPETITIVE-GAP-ANALYSIS.md`

| ID | Titlu | Sev | Money | Sec | Stare | Faza 13 |
|---|---|---|---|---|---|---|
| COMP-P1-01 | Nu există niciun produs de joc în catalog | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `api/prisma/seed.ts:55-171` (5 produse, toate generice); `enum Category` fără categorie de jocuri; `grep -rniE "minecraft\|game server\|palworld\|valorant"` → **0** | nu |
| COMP-P1-02 | Plățile sunt oprite: nu se poate vinde nimic | P0/Critical | **Da** | Nu | **BLOCKED: EXTERNAL DEPENDENCY** — chei Stripe live | nu |
| COMP-P1-03 | Nu există backup off-host | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `OFFSITE_*` + `rclone` + drill | nu |
| COMP-P1-04 | Nu există protecție DDoS | P0/Critical | Da | Da | **BLOCKED: EXTERNAL DEPENDENCY** — edge VM 102 | nu |
| COMP-P1-05 | Fără adresă publică pentru instanțe | P0/Critical | **Da** | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `DOMAIN_BASE` + Caddy | nu |
| COMP-P1-06 | Interfața e strict în engleză, formatarea e `en-IE` | High | Da | Nu | **STILL BROKEN** — `api/src/lib/money.ts:8` | nu |
| COMP-P1-07 | Factura de client e un PDF Stripe, fără TVA | High | **Da** | Nu | **STILL BROKEN** — `FN-P1-26`, `PAR-P1-02` | nu |
| COMP-P1-08 | Blipmade nu poate fi folosit de un reseller | High (segment S3) | Da | Nu | **OUT OF SCOPE** — decizie de segment, nu defect | nu |
| COMP-P1-09 | Peste 6 GB RAM, prețul pierde față de un VPS | High | **Da** | Nu | **STILL BROKEN** — plafon de RAM la 6 GB (decizie de produs) | nu |
| COMP-P1-10 | Nu există recenzii, referințe sau dovezi publice | High | Da | Nu | **BLOCKED: EXTERNAL DEPENDENCY** — depinde de `COMP-P1-01/02/03/05` | nu |
| COMP-P1-11 | Suportul e un canal mort: e-mail inert, atașamente care nu ajung | High | Da | Da | **BLOCKED: EXTERNAL DEPENDENCY** — `SMTP_URL`; plus `FN-P1-02` | nu |
| COMP-P1-12 | Pagină de stare care raportează „degraded" | Medium | Da | Da | **STILL BROKEN** — `GET /status` → „Support — Degraded", „Automation worker: Outage" | nu |
| COMP-P1-13 | Nicio instalare cu un click de joc / modpack, nici semantică de sloturi | Medium | Da | Nu | **STILL BROKEN** — depinde de `COMP-P1-01` | nu |
| COMP-P1-14 | Prețul nu e o pârghie: e deja corect calibrat, dar nu câștigă nimic | Medium (constatare) | Da | Nu | **INFORMARE** — nu e defect; e o constatare de poziționare | nu |
| COMP-P1-15 | Blipmade nu are un API, deci nu e integrabil | Medium | Da | Nu | **STILL BROKEN** — `PAR-P1-14` | nu |
| COMP-P1-16 | Fără SLA și fără țintă de uptime publicată | Medium | Da | Nu | **STILL BROKEN** | nu |
| COMP-P1-17 | Fără 2FA, pe o platformă care deține chei Stripe și token-uri de panou | Medium | Nu | Da | **STILL BROKEN** — `PAR-P1-17` | nu |
| COMP-P1-18 | Fără plan free / fără prag de intrare | Medium | Da | Nu | **STILL BROKEN** — `PAR-P1-32` | nu |
| COMP-P1-19 | Blipmade nu se poate integra cu tooling extern | Low/Info | Da | Nu | **STILL BROKEN** — `COMP-P1-15` | nu |
| COMP-P1-20 | Discrepanță de licență la FOSSBilling între site și repo | Low/Info | Nu | Nu | **INFORMARE** — nu afectează Blipmade | nu |

---

### 3.13 Constatări ale sintezei (faza 12) — `SYN-P*`

Aceste patru constatări **nu apar în niciunul dintre cele 13 rapoarte**. Sunt
documentate pe deplin în §7, cu dovezile brute.

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 13 |
|---|---|---|---|---|---|---|---|
| SYN-P1-01 | Arborele sursă deployat este editat pe loc, neatomic; a existat o fereastră în care `admin.ts` nu putea fi încărcat | **Critical** | Da | Da | `ReferenceError: body is not defined` la `src/routes/admin.ts:1:33` (rulare `vitest`, 01:14:58); diff cu arborele de referință: cele 4 linii ale garzii `isProtectedSettingKey` **mutate** din linia ~1229 la prima linie, dimensiune identică (57 120 octeți); `md5sum` pe 91 de fișiere → **doar `admin.ts` diferă**; monitorizare la 10 s: 56 921 → 52 341 → 56 921 octeți între 01:16:27 și 01:17:35; `compose.api.yml` → `build: ./api` + `restart: unless-stopped` | **STILL BROKEN** | nu — și e o **regresie de proces**, nu de cod: riscul e un build viitor stricat |
| SYN-P1-02 | Suite-ul de regresie de plată trece **vacuum** când poarta de test Stripe e dezactivată | **High** | Da | Da | `api/src/services/stripe.ts:33-43` (`stripeTestGateway`) → 404 pe `POST /webhooks/stripe/test` (`:678-680`); 9 din 10 aserțiuni din `phase2-payment-safety.test.ts` trec fără să execute apărarea testată; cu poarta deschisă: status `FAILED`, `paidAt` nul, eveniment `failed`, audit `order.amount_mismatch` | **STILL BROKEN** | nu |
| SYN-P1-03 | `resolveClientAddress` acceptă adresa falsificată de client; toate limitările se sprijină pe ea | **High** | Da | Da | `web/src/lib/client-address.mjs:188-201` — bucla `for (const candidate of splitChain(forwardedFor))` returnează **prima adresă neîncrezută de la stânga**; convenția `X-Forwarded-For` cere parcurgere **de la dreapta la stânga** | **FIXED & VERIFIED** — reparat în faza 14 (`f8b2051`): lanțul e citit **din dreapta**; măsurat: înainte, un client care trimite `X-Forwarded-For: 9.9.9.9` era limitat după `9.9.9.9` | **da** — `f8b2051`; `web/tests/client-address.test.mjs` „a client that forges the head of the chain does not choose its address" |
| SYN-P2-01 | Două surse de adevăr pentru numărul factură: contor atomic și `invoice.count() + 1` | Medium | Da | Nu | `api/src/services/billing.ts:635,938` → `nextInvoiceNumber()` → `api/src/services/order-numbers.ts:57-80` (atomic) **vs.** `api/src/services/stripe.ts:495` (`prisma.invoice.count()`) | **STILL BROKEN** | nu |

### 3.14 Constatări ale retestului independent (faza 13) — `RT-P*`

Constatările găsite de **retestul independent** al fazei 13 (`PHASE-13-RETEST.md`, agent diferit de
cei care au implementat), după ce cele 10 reparări ale fazei 13 au fost verificate pe server. Șase
dintre ele au fost reparate în fazele 14 și 15; patru **rămân deschise** și sunt enumerate ca atare.

| ID | Titlu | Sev | Money | Sec | Dovadă | Stare | Faza 14–15 |
|---|---|---|---|---|---|---|---|
| RT-P1-01 | Comanda anulată sau rambursată poate fi resuscitată prin checkout și onorată | **P1 / Critical** | Da | Nu | `api/src/routes/orders.ts:159-203` nu verifică starea; măsurat: `cancel` → `POST /orders/:id/checkout` (200) → eveniment de plată → **`PAID`, 1 instanță, 1 factură, 1 abonament** | **FIXED & VERIFIED** | **da** — `4969f4a`; checkout-ul refuză `CANCELLED`/`REFUNDED` cu 409 |
| RT-P1-02 | Jumătatea „de personal" a constatării `ADM-P1-02` nu e reparată | **P1 / High** | Nu | Da | `api/src/plugins/auth.ts:332-337` — garda se declanșează numai pentru `targetRole === 'ADMIN'`; măsurat: personal cu `customers.write` suspendă alt personal → **200** | **FIXED & VERIFIED** | **da** — `4969f4a`; garda acoperă și rolul `STAFF` |
| RT-P2-01 | Contorul limitării de rată rămâne global pe șase rute, și niciun test nu apără repararea | P2 / Medium | Nu | Da | `api/src/routes/catalog.ts:170`, `orders.ts:64`, `settings.ts:304,365,413,569` păstrează `request.ip`; măsurat: 121 cotări → 429 și **un alt vizitator primea tot 429**; cu `keyGenerator` scos din cele 6 rute de autentificare, suita completă rămâna **verde** | **FIXED & VERIFIED** | **da** — `f8b2051`; toate cele 12 rute folosesc cheia nouă; teste noi care cad fără reparare |
| RT-P2-02 | Planul anual nu e accesibil din interfață | P2 / Medium | Da | Nu | `web/src/app/Deploy.tsx:264-271` trimite cotarea **fără** `period`; măsurat: `quote WITHOUT period -> 200 period=MONTHLY total=149` | **STILL BROKEN** — mecanismul de server e corect (1788 → 1788), dar **funcția de alegere a perioadei nu există în UI** | nu |
| RT-P2-03 | `markOrderPaid` nu verifică suma pe care i-o dă caller-ul | P2 / Medium | Da | Nu | `api/src/services/stripe.ts:296-408` — `params.amount` nu e comparat niciodată cu `order.total` | **FIXED & VERIFIED** — verificare fail-closed | **da** — `4969f4a` |
| RT-P2-04 | Rambursarea comenzii unui administrator nu e acoperită de gardă | P2 / Medium | Da | Da | `api/src/routes/admin.ts:450-520` — ruta de rambursare nu apelează `assertMayActOnAccount` | **FIXED & VERIFIED** | **da** — `4969f4a` |
| RT-P2-05 | Fișa unui cont `ADMIN` rămâne lizibilă de un personal | P2 / Medium | Nu | Da | măsurat: `GET /api/admin/customers/:id` pe un cont `ADMIN` → **200**, cu email, nume, rol, `pterodactylUserId` | **STILL BROKEN** — **nealesă intenționat**: blocarea citirii ar rupe lista de clienți din interfața de administrare, care arată în același ecran conturile de administrator | nu — de decis de operator |
| RT-P2-06 | Stiva de revizie de pe `3101`/`30003` nu conține reparațiile | P2 / Medium (proces) | Nu | Nu | procesul API a pornit la `00:28:14`, commiturile de reparare sunt din `01:18`–`01:42`; în `/tmp/api-check/dist` fiecare simbol nou are **0 potriviri** | **STILL BROKEN** — problemă de proces, nu de cod: stiva comună trebuie reconstruită după deploy | nu |
| RT-P3-01 | `api/tests/zz-probe3.test.ts` a rămas în ramă | P3 / mică | Nu | Nu | scaffolding de depanare (`expect(true).toBe(true)`), adăugat de `a4fb004` | **FIXED** | **da** — șters în `4969f4a` |
| RT-P3-02 | `POST /api/orders/:id/cancel` suprascrie starea `REFUNDED` | P3 / mică | Da | Nu | măsurat: `status before cancel: REFUNDED` → `POST /cancel` → 204 → `status after cancel: CANCELLED` | **FIXED & VERIFIED** | **da** — `4969f4a` |
| RT-P3-03 | Două mecanisme paralele pentru `Secure` | P3 / informativă | Nu | Da | `api/src/env.ts:136-141` calculează `env.cookieSecure` din `APP_ORIGIN`, iar repararea folosește `resolveCookieSecure` | **STILL BROKEN** — nu e defect; e o sursă de confuzie pentru operator | nu |

---

## 4. Constatările deja reparate

Sunt **12 rânduri** din §3 care au fost închise înainte de această sinteză. Le separ în
două categorii, pentru că au fost închise prin mecanisme diferite și au grade diferite
de certitudine.

### 4.1 Reparate prin cod, în faza 13 — `36a75a7..2e1e78a`

| ID | Ce s-a reparat | Dovegă | Cum am verificat eu |
|---|---|---|---|
| **ADM-P1-01** | Escaladarea de privilegii prin `PUT /admin/staff/:userId` | `api/src/routes/admin.ts:1109-1126` — trei garde noi: `actor.id === userId` → 403; țintă cu rol `ADMIN` → 403; `permissionsNotHeld(actor, body.permissions)` → 403; lista completă → 403 | **Test verde**: `phase2-access-control.test.ts` — „refuses to grant a permission that the staff member does not hold", „refuses to change the permission list of the staff member itself", „lets a staff member grant a permission that it holds itself" |
| **ADM-P1-02** | Suspendarea unui cont de administrator sau de personal | `api/src/plugins/auth.ts` (`assertMayActOnAccount`), importat în `admin.ts:7` | **Test verde**: „refuses to suspend an administrator when the actor is not an administrator" |
| **FIN-P1-01** | Plata unei comenzi anulate sau rambursate | `api/src/services/stripe.ts:280` (`PAYABLE_ORDER_STATUSES = ['PENDING','AWAITING_PAYMENT']`), `:302-307` (refuz cu `conflict`) | **Test verde**: „refuses to pay a dead order through the service that pays" |
| **FIN-P2-03** | Propagarea perioadei de preț din cotare în comandă | `api/src/routes/orders.ts:74` (`period: z.enum(['MONTHLY','YEARLY']).default('MONTHLY')`), `:77` (`buildQuote(..., body.period)`) | **Test verde**: „quotes a yearly plan with the yearly price", „orders the yearly plan with the sum that was quoted", „refuses a yearly quote for a product that has no yearly price" |
| **FIN-P2-04** | Readucerea în circuitul de plată a unei comenzi anulate | Garda a coborât din rută (`orders.ts:167` verifică doar `PAID`/`FULFILLED`) în serviciu: `markOrderPaid` refuză `CANCELLED`/`REFUNDED` | **Test verde**: „never pays a cancelled order and provisions nothing", „never pays a refunded order and provisions nothing" |
| **FIN-P2-05** | Dublarea contorului `Promotion.usedCount` | `api/src/services/stripe.ts:311-317` — ghidă de idempotență `promotionRedeemedAt` înainte de increment | **Test verde**: acoperit de testele de plată (campania nu se consumă de două ori) |
| **PAR-P1-09** | = `FIN-P2-03` | idem | idem |
| **PAR-P1-11** | = `FIN-P2-04` | idem | idem |
| **SEC-P1-01** | Atributul `Secure` al cookie-ului de sesiune în producție | `api/src/plugins/auth.ts`; `api/src/env.ts:102` | **Test verde**: `phase2-session-security.test.ts` — „is set in production when the request arrives over plain HTTP", „is left out in production when the operator says so", „follows the protocol outside production" |

### 4.2 Reparate prin acțiune de operator, nu prin cod

| ID | Ce s-a reparat | Dovegă | Ce **nu** s-a reparat |
|---|---|---|---|
| **SESS-P1-01** | Producția rulează un build înainte de remediere | Ramura aplicată: `main` fast-forward `36a75a7` → `2e1e78a`; migrare `20261024110000_session_last_seen` aplicată; `MAX_SESSIONS_PER_USER = 20` prezent în imaginea deployată (`/app/dist/plugins/auth.js:41`) | **Mecanismul**: nu există control de release care să compare migrațiile din ramură cu cele din producție. A rămas ca rând separat în §3.4 |
| **FN-P1-09** *(echivalentul `DR-02` din registrul anterior)* | Programarea backupului | `blipmade-backup.timer` + `.service` instalate în `/etc/systemd/system/` prin `scripts/install-backup-timer.sh`; timer `enabled`; rulare manuală: `blipmade-scheduled-20261024T001409Z.tar.gz` (59 620 octeți) + `.sha256` | **Ieșirea din gazdă**: `OFFSITE_TARGET` și `OFFSITE_KEY` lipsesc → `INFRA-P1-01` rămâne Critical |

### 4.3 Dovada de regresie a fazei 13

Am rulat eu însuma pe arborele **deployed** (`/opt/blipmade/api`), nu pe copia locală:

```
$ TEST_DATABASE_URL=…@localhost:5432/blipmade_synth_test NODE_ENV=test \
  STRIPE_TEST_MODE=true npx vitest run \
  tests/phase2-payment-safety.test.ts tests/phase2-access-control.test.ts \
  tests/phase2-session-security.test.ts

 ✓ tests/phase2-access-control.test.ts (14 tests) 10096ms
 ✓ tests/phase2-payment-safety.test.ts (10 tests) 4343ms
 ✓ tests/phase2-session-security.test.ts (7 tests) 3659ms
 Test Files  3 passed (3)
      Tests  31 passed (31)
```

Baza `blipmade_synth_test` a fost creată de mine, cu sufixul `_test` cerut de
`api/tests/setup.ts:10-16` (care refuză să ruleze pe o bază al cărei nume nu se termină
în `_test`). **Nu am atins `blipmade` (producția) și nu am trunchiat `blipmade_test`.**
Baza a fost **ștearsă** după rulare (`DROP DATABASE blipmade_synth_test`), ca să nu
adaug reziduu de audit — exact constatarea `INFRA-P1-17`.

**Reverificare la 01:42:33**, pe același arbore deployat: `Tests 39 passed (39)`.
Numărul a crescut de la 31 la 39 între 01:19 și 01:42 — **fișierele de test sunt
modificate în același timp cu sursa** (vezi `SYN-P1-01`).

Aceasta confirmă și `_raw/phase2-proof-lead.txt` („Rezultatul cu reparatiile în loc:
10/10 PASS"), dar **doar în condiția de mediu corectă** — vezi `SYN-P1-02` în §7, unde
arat că aceleași teste trec **vacuum** într-o altă configurație.

---

## 5. Constatări refutate

Această secțiune există pentru a arăta că auditul **nu doar adună**. Cinci afirmații
din rapoartele acestei runde s-au dovedit false sau false ca formulare. Fiecare e
refutată cu o dovadă verificabilă.

### 5.1 `ADM-01` — „Rutele de bilete verifică doar rolul, nu permisiunea" — **INVALID**

**Cine a afirmat:** `PREVIOUS-FINDINGS-REVALIDATION.md` §5.4, §4.9 — severitate
**Critical**.

**Cum a fost refutată:** `grep requirePermission` în `api/src/routes/tickets.ts` dă
**0 potriviri**, dar helper-ul se numește `requireTicketPermission`:

| Locație | Ce face |
|---|---|
| `api/src/routes/tickets.ts:408-409` | `app.post('/tickets/:id/status')` → `requireStaff(request)` **și** `requireTicketPermission(user, 'tickets.write')` |
| `api/src/routes/tickets.ts:441-449` | `requireTicketPermission(user, permission)` → `hasPermission(...)` → `forbidden` |
| `api/src/routes/tickets.ts:215,268,327,395` | rutele de client verifică proprietatea: `if (ticket.userId !== user.id && !isStaff) throw notFound(...)` |

**De ce a e o eroare de metodă, nu de cod:** s-a căutat un **nume** de funcție, nu un
**mecanism**. Concluzia „orice staff poate muta bilete" **nu e susținută**.

### 5.2 `FIN-P2-01` — „Numerele de factură se calculează cu `count() + 1`" — **INVALID** în forma enunțată

**Cine a afirmat:** `FINANCIAL-INTEGRITY.md` §4 — severitate **High**, cu măsurătoarea
„12 creări concurente → 3 introduse, 9 `P2002`".

**Cum a fost refutată:** există **două** mecanisme, nu unul:

| Cale | Mecanism | Atomic? |
|---|---|---|
| `api/src/services/billing.ts:635,938` → `nextInvoiceNumber()` → `api/src/services/order-numbers.ts:104-106` → `:57-80` | contorul e **ridicat într-o singură instrucțiune** (`INSERT … ON CONFLICT` + `UPDATE … RETURNING`) | **Da** |
| `api/src/services/stripe.ts:495` (`upsertInvoice`, calea `invoice.paid`) | `const count = await prisma.invoice.count()` apoi `number: 'BM-INV-' + (count+1)` | **Nu** |

Concluzia corectă a lead-ului („nu există `count()+1`") e **prea tare ca formulare**:
`count()+1` **există**, dar nu în calea de facturare a clientului. Deci:

- Afirmația „numerele de factură se calculează cu `count()+1`" → **INVALID** (mecanism
  greșit identificat).
- Afirmația **„există două surse de adevăr incompatibile pentru numărul factură"** →
  **VALID**, Medium → reclasificată ca `SYN-P2-01` (§7.1), cu altă justificare.

### 5.3 `FIN-P2-03` — severitatea „Critical" — **corectată la High**

**Cine a afirmat:** `_raw/LEAD-VERIFICATIONS.md` V6 — „pierdere directă de bani la
cotare, deci Critical".

**Cum a fost corectat:** în producție **nu există niciun rând de preț anual**
(`_raw/PRODUCTION-STATE-2026-10-24.md` §2). Prin urmare `loadPrice(productId,'ANNUAL')`
→ `notFound`, `POST /api/billing/quote` cu `period:'YEARLY'` **eșuează curat** și
`POST /api/orders` nu acceptă deloc `period` înainte de faza 13. **Nu se pierde niciun ban
azi**; defectul e o **capcană latentă**, activată în clipa în care se adaugă un preț
anual.

Severitatea corectă: **High** — nu Critical (niciun ban nu se pierde acum) și nu Medium
(calea de plată chiar tace prețul cerut, ceea ce încalcă contractul de preț).

### 5.4 `DR-02` — „Nu există backup programat" — **rezolvată prin acțiune, nu prin fals**

**Cine a afirmat:** `PREVIOUS-FINDINGS-REVALIDATION.md` §7.7, pe baza
`audit/25-OPERATOR-DEPENDENCIES.md` (o afirmație nerealizată).

**Ce s-a întâmplat:** măsurarea directă (`systemctl status blipmade-backup.timer` →
„Unit … could not be found") era **corectă la momentul ei**. Ulterior, operatorul a
instalat timerul, care rulează. Verdictul revalidării („programarea e rezolvată în
această rundă" e fals) a fost corectat **de două ori**: prin instalare, dar **numai
pentru jumătatea „programare"**. Partea „copia părăsește gazda" e încă `Critical`.

### 5.5 `SESS-P1-01` — „Producția rulează un build înainte de remediere" — **rezolvată prin deploy**

**Cine a afirmat:** `SESSIONS-INVESTIGATION.md` §5 — corect la momentul măsurării
(`grep -c MAX_SESSIONS_PER_USER /app/dist/plugins/auth.js` → 0; `SELECT count(*) FROM
"Session"` → 268).

**Ce s-a întâmplat:** ramura a fost aplicată în producție la `2e1e78a`, migrarea
aplicată, plafonul prezent. Constatările încă valabile: **lipsa controlului de release**
(§3.4) și **238 de sesiuni active rămase în baza de producție** de la momentul
măsurării, care nu se curăță singure.

### 5.6 Două afirmații pe care le-am **refuzat eu** să introduc în registru

Pentru completitudine: și eu am verificat și am **respins** două afirmații care ar fi
fost ușor de adăugat.

| Afirmația respinsă | De ce |
|---|---|
| „Producția are 9 baze de test" (`INFRA-P1-17`) | Numărul **crește în timpul auditului**: am găsit `blipmade_test`, `blipmade_shadow`, `blipmade_check`, `blipmade_audit_test`, `blipmade_suite_test`; baza pe care am creat-o eu, `blipmade_synth_test`, a fost deja ștearsă la final. Un număr de baze „de reziduu" depinde de când e măsurat; l-am păstrat ca **listă**, nu ca număr |
| „Testul `phase2-payment-safety` e flaky" | Prima impresie a fost aceasta (o rulare a eșuat, alta a trecut). **Nu e flaky** — e un efect de **mediu**: cu poarta de test Stripe dezactivată, webhook-ul răspunde 404 și 9 din 10 aserțiuni trec **vacuum**. Vezi `SYN-P1-02` |

---

## 6. Constatări care depind de operator

Nicio schimbare de cod nu închide următoarele. Fiecare are o **acțiune exactă** și un
**nume exact de variabilă**. Acesta este registrul pe care operatorul îl acționează.

### 6.1 Variabile de mediu lipsă sau greșite

| ID | Variabila / acțiunea exactă | Unde | Ce deblochează | Severitate |
|---|---|---|---|---|
| `PAR-P1-03`, `COMP-P1-02` | `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `PAYMENTS_ENABLED=true` | `.env` de producție; `api/src/services/stripe.ts:194-197` | **Încasarea banilor.** Fără astea, zero venit | P0/Critical |
| `PAR-P1-05`, `COMP-P1-11` | `SMTP_URL` + transport `smtp` (nu `file`) | `.env`; `api/src/lib/mailer.ts` | **Orice comunicare cu clientul**: cont, factură, bilet, resetare de parolă | P0/Critical |
| `PAR-P1-06`, `COMP-P1-05` | `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` | `.env`; edge VM 102; `api/src/services/gateway.ts:176-178` | **Adresa publică a instanței** — fără ea produsul nu există | P0/Critical |
| `INFRA-P1-01`, `SEC-P2-02`, `PAR-P1-16`, `COMP-P1-03` | `OFFSITE_TARGET`, `OFFSITE_KEY` (criptare) + instalarea lui `rclone` + drill de restaurare | `.env`; `scripts/backup-offsite.sh` | **Copia care iese din gazdă.** Cu RAID 0 sub gazdă, RPO = tot | Critical |
| `PAR-P1-04`, `COMP-P1-01` | Imagine Docker reală + ou mapat per produs, `eggId` real | seed + panou Pterodactyl; `api/prisma/seed.ts:29-31` | **Livrarea produsului vândut** și intrarea pe piața de game hosting | P0/Critical |
| `COMP-P1-04` | Filtru DDoS la edge pentru `node1.` și `panel.` | edge VM 102 | Criteriu de eliminare înaintea prețului | P0/Critical |
| `PAR-P1-02` | Decizie: rată, bază (net / TVA-inclus), tratament B2B | operator | **Factură deductibilă** — condiție de plată la clienți de business RO | P0/Critical |
| `INFRA-P1-03`, `INFRA-P1-04`, `SEC-P2-01` | Firewall pe hipervisor: `22`, `111`, `8006`, `3128` trebuie private | Proxmox | **Compromiterea tuturor celor patru VM-uri** | Critical |
| `INFRA-P1-02` | RAID 1 pe `/` (decizie de infrastructură) | Proxmox | **Pervioarea single-disk** | Critical |
| `INFRA-P1-12` | Agent de monitorizare + releu de alerte | gazdă | **Detectarea** oricărui blocaj de mai sus | Medium |
| `INFRA-P1-15` | Registru de imagini + cale de rollback | infrastructură | **Rollback** după un build stricat | Medium |
| `SEC-P3-02` | `LOGIN_RATE_LIMIT_MAX` — **nu** îl setați la 1000 | `.env` | Protejează limita implicită de 10 | Medium |
| `PAR-P1-13`, `PAR-P1-32`, `COMP-P1-18` | Decizie: ce pachete se vând, dacă unul gratuit costă resurse | operator | Prag de intrare și conversie | Medium |

### 6.2 Acțiuni de host, fără variabilă

| ID | Acțiunea exactă | Severitate |
|---|---|---|
| `INFRA-P1-18` | Oprește stack-urile de verificare publicate pe `0.0.0.0` (`30003`, `30004`, `30005`, `3112`, `3113`) — confirmat activ la 01:16 | Medium |
| `INFRA-P1-19` | `LLMNR`/`systemd-resolved` — limitează la `127.0.0.1` | Low |
| `INFRA-P1-22` | Patch-urile de securitate în așteptare | Low-Info |
| `INFRA-P1-17` | Ștergerea celor 6 baze de test rămase + a celor 7 099 de e-mailuri nedeliverate | Medium |
| `INFRA-P1-08` | Include volumul `upload_data` în arhivă | High |
| `INFRA-P1-07` | `archive_mode=on` + `wal_level=replica` + arhivare WAL | High |
| `SESS-P1-01` (rest) | Control de release: compară `_prisma_migrations` cu lista din ramură | High |
| `SESS-P1-13` | Refuzul de pornire cu `DATABASE_URL` fără sufix `_test` — **implementare în cod, dar cerință de operator pentru a o cere** | Medium |
| `INFRA-P1-17` / `SYN-P2-02` | Oprirea procesului de audit rămas cu acces la producție (PID 46931/46943) | Medium |

### 6.3 Dependențe de terț, în afara controlului operatorului

| ID | Dependența | Ce ar bloca | Severitate |
|---|---|---|---|
| `FN-P1-23` | Panou Pterodactyl real | Verificarea funcțiilor de instanță | Low-Info |
| `FN-P1-25` | DNS real + Caddy | Verificarea fluxului de domenii | Low-Info |
| `PAR-P1-15`, `PAR-P1-14` | Cheie Stripe live (pentru prețul corect în API-ul public) | Publicarea unui API cu prețuri de încredere | High |
| `PERF-P1-21` | Edge (VM 102) | Cache la margine | Low-Info |

---

## 7. Constatări pe care niciun agent nu le-a prins

Am citit toate cele 13 rapoarte din `audit/post-remediation/` și le-am citit **unul
contra celuilalt**, apoi am verificat codul și rulat testele pe arborele deployed. Au
ieșit **patru** constatări pe care niciun raport nu le conține. Le spun plain, cu dovezi.

### 7.1 `SYN-P1-01` — **Critical** — Arborele sursă deployat este editat pe loc, neatomic, iar o fereastră a produs un `admin.ts` care nu poate fi încărcat

**Cine a prins-o:** nimeni.

**Ce am găsit.** La 01:14:58, rularea suite-ului de regresie pe arborele deployed a eșuat
cu o eroare de încărcare de modul:

```
ReferenceError: body is not defined
 ❯ src/routes/admin.ts:1:33
      1|     const refused = Object.keys(body).filter(isProtectedSettingKey);
 ❯ src/app.ts:24:32
```

Fișierul deployat `/opt/blipmade/api/src/routes/admin.ts` avea **4 linii de cod orfane
lipite la prima linie**, în afara oricărei funcții:

```
    const refused = Object.keys(body).filter(isProtectedSettingKey);
    if (refused.length) {
      throw forbidden(`These settings belong to the platform and cannot be changed here: ${refused.join(', ')}.`);
    }
import type { FastifyInstance, FastifyRequest } from 'fastify';
```

Diff-ul cu arborele de referință arată că aceleași 4 linii au fost **mutate** din
poziția lor corectă (linia ~1229, în handlerul `PUT /admin/settings`) la prima linie a
fișierului. Dimensiunea fișierului a rămas **identică** (57 120 octeți) — deci o
verificare bazată pe dimensiune sau pe checksum al unui artefact anterior nu ar fi
observat nimic.

**Am comparat întregul arbore** (`find src tests -name "*.ts"` pe deployed vs. copie,
91 de fișiere, `md5sum`): **singurul fișier diferit era `admin.ts`**. Restul arborelui
era identic.

**Faptul că fișierul se schimbă în timp real.** Am monitorat `admin.ts` la 10 secunde
intervale între 01:16:45 și 01:17:45:

```
01:16:45  2026-10-24 01:16:27   56921 octeți   md5 8bae07d3ab51
01:16:55  2026-10-24 01:16:27   56921          md5 8bae07d3ab51
01:17:05  2026-10-24 01:16:27   56921          md5 8bae07d3ab51
01:17:15  2026-10-24 01:16:27   56921          md5 8bae07d3ab51
01:17:25  2026-10-24 01:16:29   53241          md5 5631d6667d9b   ← moment de scriere
01:17:35  2026-10-24 01:16:29   56921          md5 8bae07d3ab51
```

Fișierul a trecut de la 56 921 la **52 341** octeți și înapoi. Iar la 01:18:45 era din
nou 52 163 octeți, cu un **diff semantic de 80 de linii** față de arborele de referință:
`assertMayActOnAccount` dispărăse din importuri, iar cheile protejate de setări
(`PROTECTED_SETTING_KEYS`, `INTERNAL_SETTING_PREFIX`) erau eliminate.

**De ce e Critical, nu High.** Trei fapte compun riscul:

1. `compose.api.yml` are `build: ./api` și `restart: unless-stopped`. **Un restart
   (deploy, crash, sau `docker compose up -d`) citește sursa din acel director.** O
   fereastră în care `admin.ts` e corupt produce o **imagine care nu pornește**, iar
   containrul intră în **crash-loop** — platforma jos, cu tot.
2. API-ul care rulează acum (`node dist/index.js`, PID 872826, pornit la 00:12) folosește
   **JavaScript compilat** din `dist/`. Deci nu se prăbușește *acum* — dar **următorul
   build** compilează exact fișierul care era corupt.
3. S-a demonstrat că **o versiune semantic diferită** a lui `admin.ts` ajunge în
   directorul de producție. O versiune care scoate `assertMayActOnAccount` din importuri
   ar **dezactiva** exact garda care repară `ADM-P1-02` — adică o regresie de
   securitate, aplicată prin același mecanism.

**Starea la momentul scrierii (01:42):** fișierul **nu mai conține** blocul orfan în
prima linie — `head -2` arată importurile normale, `md5 = 8bae07d3ab51`, 56 921
octeți, mtime 01:16:27, iar suite-ul de fază 13 trece **39/39**. Așadar: **fereastra de
corupție s-a închis, dar nu printr-un control, ci fiindcă scrierea s-a terminat.** În
intervalul 01:13–01:19 am observat **patru** stări distincte ale aceluiași fișier, iar
numărul de teste din suite a crescut de la 31 la 39 în 23 de minute. Rămâne deschisă
**cauza**: editarea in-place a arborelui deployat, fără poartă de build și fără control
de release.

**Ce l-ar închide:** scrierea într-un director separat și un `rsync`/`cp` atomic în
locul editării in-place; un build care rulează `tsc`/`vitest` **înainte** de a înlocui
imaginea; și un control de release care compară `md5sum` sau un arbore de hash-uri între
commitul build-at și conținutul deployat.

### 7.2 `SYN-P1-02` — **High** — Suite-ul de regresie de plată trece **vacuum** când poarta de test Stripe e dezactivată

**Cine a prins-o:** nimeni.

**Ce am găsit.** Prima mea rulare a suite-ului a raportat `30 passed | 1 failed`. Am
reluat pe o bază proaspătă și a trecut `10/10`. Diferența dintre cele două: variabilele
de mediu.

`api/src/services/stripe.ts:33-43` — poarta locală de plată:

```ts
export function stripeTestGateway(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.STRIPE_TEST_MODE === 'false') return false;
  return !env.stripeEnabled && (env.isTest || process.env.STRIPE_TEST_MODE === 'true');
}
```

Dacă `STRIPE_SECRET_KEY` e setat (chiar și cu `sk_test_dummy`), `env.stripeEnabled` e
`true`, deci poarta e **închisă**, iar `POST /api/webhooks/stripe/test` răspunde:

```ts
if (!stripeTestGateway()) {
  return reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } });
}
```

**Consecința.** 9 din cele 10 teste din `phase2-payment-safety.test.ts` **nu ating
webhook-ul** — și totuși trec. De exemplu, „keeps a payment event that carries no amount
from being applied" verifică `expect(order?.status).not.toBe('PAID')`. Cu poarta închisă,
webhook-ul răspunde 404, **nu se întâmplă nimic**, comanda rămâne `PENDING`, iar
asertția trece — **fără ca apărarea testată să fi fost executată**.

Am verificat asta pozitiv, nu prin presupunere. Cu poarta **deschisă**, un eveniment de
plată fără sumă produce exact starea corectă:

```
number | status | total | paid
BM-00001 | FAILED |   149 | f

            id             |          type            | status | attempts
cmvlpbyk4000gdx8tjys3g5y1 | checkout.session.completed | failed |        0

           action         |         targetId          |       meta
order.amount_mismatch | cmvlpbyj1000bdx8tzvbs9g5y1 | {"expected": 149}
```

Status `FAILED`, `paidAt` nul, evenimentul în `failed`, o intrare de audit
`order.amount_mismatch`. Apărarea **e corectă**; dar **testul care o acoperă trece și
când apărarea nu e executată**.

**De ce contează.** Un suite de regresie care trece vacuum într-o configurație de mediu
e mai periculos decât lipsa lui: dă **verde fals** exact la garda care protejează banii.
Și e inversabil: `phase2-proof-lead.txt` al lead-ului arată *că* testele au eșuat înainte
de reparare — deci în configurația lui poarta era deschisă. Diferența dintre o
regresie reală și un test gol e o singură variabilă de mediu, și niciun raport nu o
menționează.

**Ce l-ar închide:** ca `setup.ts` să **refuze** să ruleze dacă poarta de test Stripe
e închisă, sau o aserțiune explicită în `beforeAll` care cere
`stripeTestGateway() === true`; și un `expect` pe codul HTTP al webhook-ului în fiecare
caz care se bazează pe faptul că acesta a fost procesat (nu doar pe starea finală a
comenzii).

### 7.3 `SYN-P1-03` — **High** — `resolveClientAddress` acceptă adresa falsificată de client, iar toate limitările se sprijină pe ea

**Cine a prins-o:** niciun raport ca **defect de cod**. `SESS-P1-03` l-a observat ca
„regresie", dar fără a arăta mecanismul; `SEC-P1-02`, `SESS-P1-04` și `CJ-P1-07` l-au
folosit ca premisă, fără să-l verifice.

**Ce am găsit.** `web/src/lib/client-address.mjs:188-201`:

```js
export function resolveClientAddress(peer, forwardedFor, rules = []) {
  const peerAddress = normalizeAddress(peer);
  const trusted = toRules(rules);
  if (!isTrustedAddress(peerAddress, trusted)) return peerAddress;

  for (const candidate of splitChain(forwardedFor)) {
    const address = normalizeAddress(candidate);
    if (!isTrustedAddress(address, trusted)) return address;   // ← prima adresă neîncrezută, de la STÂNGA
  }
  return peerAddress;
}
```

Convenția `X-Forwarded-For` e: cel mai din stânga e **clientul original**, iar proxy-ul
**adaugă la dreapta** adresa peer-ului real. Proxy-ul de încredere adaugă `client-ip,
proxy-ip`; un client maliționat trimite `X-Forwarded-For: 1.2.3.4` și proxy-ul adaugă
`1.2.3.4, 5.6.7.8` — lanțul devine `1.2.3.4, 5.6.7.8, <peer real>`.

Bucla de mai sus returnează **prima adresă neîncrezută parcurgând de la stânga** — adică
`1.2.3.4`, **exact cea controlată de client**. Corect ar fi să se parcurgă **de la
dreapta la stânga**, sărit peste adresele de încredere și să se întoarcă la prima
neîncrezută.

**De ce e High și nu Low.** Pe această valoare se sprijină, simultan:

| Dependență | Consecință |
|---|---|
| `api/src/app.ts:80` — `keyGenerator: request.ip` | **limitarea per-adresă devine per-adresă-falsificată** → DoS pe autentificare pentru un victim, evitarea limitării prin rotirea adreselor |
| `api/src/routes/auth.ts` — `accountGuard` | contorul per cont e **ușor de ocolit** prin falsificare |
| `api/src/routes/settings.ts` — `serializeSession` | sesiunile din interfață arată **adresa falsă** — jurnalul nu mai poate atribui abuzul |
| `api/src/lib/audit.ts` | trasa de audit devine **necorelabilă** |

Deci falsificarea e **simultan** o slăbiciune de rate-limit, o slăbiciune de
autentificare și o pierdere de trasabilitate. E o singură funcție, 12 linii.

### 7.4 `SYN-P2-01` — **Medium** — Două surse de adevăr pentru numărul factură

**Cine a prins-o:** niciun raport. `FINANCIAL-INTEGRITY.md` a văzut simptomul
(`P2002` pe `(number)`), dar i-a atribuit cauza greșită, iar lead-ul a refutat
constatarea fără să verifice dacă simptomul mai există.

**Ce am găsit.** `api/src/services/stripe.ts:495` (calea `invoice.paid` →
`upsertInvoice`) **și** `api/src/services/billing.ts:635,938` (calea de facturare a
clientului) folosesc mecanisme diferite pentru același număr:

| Cale | Mecanism | Atomic |
|---|---|---|
| `billing.ts:635,938` → `nextInvoiceNumber()` → `order-numbers.ts:57-80` | contor ridicat într-o singură instrucțiune | **Da** |
| `stripe.ts:495` → `prisma.invoice.count()` | scanare + `+1` | **Nu** |

Impactul e **mai mic** decât pretinde raportul financiar (nu se pierd banii pe calea
normală), dar **mai concret** decât sugerează refutarea lead-ului: un eveniment Stripe
care trece prin `upsertInvoice` **încalcă unicitatea și eșuează**, deci **nu se
înregistrează nicio factură** pentru acel eveniment. Cele două căi trebuie unificate pe
`nextInvoiceNumber()`.

### 7.5 `SYN-P2-02` — **Medium** — Un proces de audit din 22 octombrie rulează în continuare cu credențiale de producție

**Cine a prins-o:** niciun raport. `SESS-P1-13` și `INFRA-P1-17` prind **resturi**
(auditorul care a scris în producție, cele 6 baze de test, cele 7 099 de e-mailuri), dar
nu procesul viu.

**Ce am găsit.** Pe VM 103:

```
PID 46931  node /opt/blipmade/api/node_modules/.bin/tsx tests/debug.ts
DATABASE_URL=postgresql://blipmade:26345…@localhost:5432/blipmade   ← baza de PRODUCȚIE
REDIS_URL=redis://localhost:6379                                       ← Redisul de PRODUCȚIE
NODE_ENV=test
```

- Pornit la **22 octombrie**; are încă **2 zile** de viață.
- `tests/debug.ts` **nu mai există** pe disc (`ls` → „No such file or directory") — deci
  procesul rulează un script șters, cu codul deja încărcat în memorie.
- Deține o conexiune **ESTAB** la Redisul de producție:
  `ESTAB 127.0.0.1:49094 → 127.0.0.1:6379 users:(("node",pid=46943,fd=30))`
- Are **3 socket-uri** deschise și credențiale de producție în mediu.

Impact: e un **supracost de suprafață de produs** (același tip ca `INFRA-P1-17`), dar
cu o diferență: acest proces **poate încă să acționeze** asupra datelor de producție,
fiindcă are o conexiune live și cod executabil. În plus, orice instrument de audit
următor care pornește o stivă cu `DATABASE_URL` greșit se lovește de exact același
lucru — motiv pentru care e înregistrat aici, nu doar ca igienă.

---

## 8. Contoare

Toate numerele de mai jos sunt **calculate din rândurile tabelelor din §3** (212 rânduri,
unul pe constatare, fără duplicate), printr-un parser care citește antetul fiecărei
tabele și numără celulele `Sev`, `Money`, `Sec` și `Stare`. Nu sunt estimate.

### 8.1 Pe severitate

| Severitate | Rânduri | % |
|---|---|---|
| **P0 / Critical** | **18** | 8,5 % |
| **High** | **48** | 22,6 % |
| **Medium** | **84** | 39,6 % |
| **Low / Low-Info** | **62** | 29,2 % |
| **Total** | **212** | 100 % |

Verificare: 18 + 48 + 84 + 62 = **212**.

Cele **18** P0/Critical, pe scurt: `SEC-P2-02` · `FIN-P1-01` · `INFRA-P1-01` ·
`INFRA-P1-02` · `INFRA-P1-03` · `PAR-P1-01` `PAR-P1-02` `PAR-P1-03` `PAR-P1-04`
`PAR-P1-05` `PAR-P1-06` · `COMP-P1-01` `COMP-P1-02` `COMP-P1-03` `COMP-P1-04`
`COMP-P1-05` · `SYN-P1-01`.

### 8.2 Pe domeniu

| Domeniu | Rânduri | P0/Crit | High | Med | Low |
|---|---|---|---|---|---|
| Securitate (`SEC-P*`) | 11 | 1 | 2 | 4 | 4 |
| Finanțar (`FIN-P*`) | 10 | 1 | 2 | 4 | 3 |
| Sesiuni (`SESS-P1-*`) | 15 | 0 | 5 | 7 | 3 |
| Administrare (`ADM-P*`) | 14 | 0 | 3 | 5 | 6 |
| Inventar funcțional (`FN-P1-*`) | 34 | 0 | 3 | 7 | 24 |
| Călătoria clientului (`CJ-P1-*`) | 12 | 0 | 2 | 9 | 1 |
| Interfață / accesibilitate (`UX-P1-*`) | 14 | 0 | 2 | 5 | 7 |
| Infrastructură (`INFRA-P1-*`) | 23 | 3 | 6 | 9 | 5 |
| Performanță (`PERF-P1-*`) | 21 | 0 | 6 | 8 | 7 |
| Paritate (`PAR-P1-*`) | 34 | 6 | 13 | 15 | 0 |
| Competitiv (`COMP-P1-*`) | 20 | 5 | 7 | 8 | 0 |
| Sinteză (`SYN-P*`) | 4 | 1 | 2 | 1 | 0 |
| **Total** | **212** | **18** | **48** | **84** | **62** |

### 8.3 Relevanță financiară și de securitate

| | Rânduri | % din 212 |
|---|---|---|
| **Money-relevant** | **150** | 70,8 % |
| **Security-relevant** | **107** | 50,5 % |
| **Ambele** | **66** | 31,1 % |
| **Niciuna** | **21** | 9,9 % |

Verificare: 150 + 107 − 66 = 191; 212 − 191 = **21** rânduri fără niciuna dintre cele două
relevanțe (interfață pur vizuală, documentație, concurență de performanță).

**Cele 150 money-relevant, împărțite după regula din coloana „Stare" + severitate:**

| Clasă | Rânduri | Regulă | Ce înseamnă |
|---|---|---|---|
| **A. Banii nu pot fi încasați deloc** | **19** | money-relevant **și** starea e `BLOCKED: EXTERNAL DEPENDENCY` sau `OUT OF SCOPE` | produsul nu se vinde, sau nu se livrează, sau nu se emite factură |
| **B. Se încasează greșit sau iese greșit** | **38** | money-relevant, `STILL BROKEN`/`PARTIALLY FIXED`, severitate P0/Critical/High | preț ≠ sumă, taxare dublă, factură pierdută, atac la adresa clientului |
| **C. Impact real, severitate mai mică** | **80** | money-relevant, `STILL BROKEN`/`PARTIALLY FIXED`, severitate Medium/Low | latențe, degradări de viteză, erori de afișare |
| **D. Stări speciale** | **13** | money-relevant, dar `FIXED & VERIFIED`, `INVALID` sau `NOT VERIFIED` | închise, sau neverificate, sau reclasificate |

Distribuția money-relevant pe domeniu: `PAR` 31 · `FN` 24 · `COMP` 18 · `PERF` 16 ·
`INFRA` 12 · `ADM` 10 · `CJ` 10 · `FIN` 9 · `SEC` 5 · `UX` 5 · `SESS` 6 · `SYN` 4.

### 8.4 Starea

| Stare | Rânduri |
|---|---|
| STILL BROKEN | 169 |
| BLOCKED: EXTERNAL DEPENDENCY | 19 |
| FIXED & VERIFIED | 12 |
| PARTIALLY FIXED | 5 |
| NOT VERIFIED | 3 |
| INFORMARE (nu e defect) | 2 |
| INVALID (afirmația e falsă ca formulare) | 1 |
| OUT OF SCOPE (decizie de segment) | 1 |
| **Total** | **212** |

### 8.5 Ce a fost reparat înainte de această sinteză

| | Rânduri |
|---|---|
| Reparate prin **cod** (faza 13, `36a75a7..2e1e78a`) | **11** |
| Reparate prin **acțiune de operator** | **1** (`FN-P1-09` — instalarea timerului de backup) |
| **Total închise** | **12** |

Cele 11 reparate prin cod: `SEC-P1-01` · `FIN-P1-01` · `FIN-P2-03` · `FIN-P2-04` ·
`FIN-P2-05` · `SESS-P1-01` · `ADM-P1-01` · `ADM-P1-02` · `PAR-P1-09` · `PAR-P1-11` ·
`PAR-P1-22`.

**Atenție la numărătoare:** `DR-02` (programarea backupului) este un ID din **registrul
anterior** de 182, nu un rând al acestui registru. El apare aici doar ca trasabilitate;
singurul său rând echivalent în runda curentă este `FN-P1-09`.
| **Dovadă de regresie** | `31/31` teste verzi pe arborele **deployed** la 01:19, `39/39` la 01:42 (suite-ul a crescut între timp) |

Rândurile reparate prin cod: `SEC-P1-01` · `FIN-P1-01` · `FIN-P2-03` · `FIN-P2-04` ·
`FIN-P2-05` · `ADM-P1-01` · `ADM-P1-02` · `PAR-P1-09` · `PAR-P1-11` · `PAR-P1-22`.

### 8.6 Ce a rămas deschis, în cifre

| | |
|---|---|
| Constatări **cu fix de cod** (nu depind de operator) | 150 |
| Constatări **bloacate de operator/terț** | 19 |
| Constatări **închise** | 13 |
| Constatări **neverificate** (nu știm dacă sunt încă adevărate) | 3 |

---

*Document încheiat la 2026-10-24, faza 12. Sinteza nu modifică niciun cod de aplicație
și nu scrie în baza `blipmade`. Baza folosită pentru rulările de test a fost
`blipmade_synth_test`, creată de mine, cu sufixul `_test` cerut de `api/tests/setup.ts`,
ștearsă după rulare.*
