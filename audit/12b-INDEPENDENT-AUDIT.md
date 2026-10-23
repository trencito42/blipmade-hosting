# 12b — Audit independent al sintezei

**Autor:** A12, auditor independent. **Data:** 2026-10-23.
**Obiect:** atacul sintezei scrise de ceilalți agenți (`12-FULL-FINDINGS-REGISTER.md`, `13-PRIORITIZED-BACKLOG.md`, `14-30-60-90-DAY-ROADMAP.md`, `16-GO-NO-GO-DECISION.md`) împreună cu rapoartele-sursă, împotriva contractului din brief.
**Natura:** read-only. Singura scriere e acest fișier. Zero modificări în producție, zero modificări în celelalte fișiere din `audit/`.
**Mirror verificat:** cele 7 fișiere `api/src/**` citite au același MD5 în `/root/blipmade-work` și pe VM 103 (`md5sum` × 7, toate MATCH) — citirile de cod de mai jos reflectă producția.

## 0. Convenția de clase folosită în acest raport

`VERIFIED` (măsurat de mine pe sistemul viu) · `CODE-INSPECTED` (citit în cod) · `DOCUMENTED-ONLY` (afirmație de raport, nevăzută de mine) · `INFERRED` · `UNVERIFIED` (nu am putut verifica) · `BLOCKED` · `NOT-IMPLEMENTED`.

---

## 1. Verdictul pe sinteză

**Verdict: NO-GO-ul este SUNET ca direcție, dar sinteza, așa cum e scrisă, are defecte care trebuie reparate înainte de a fi folosită ca bază de decizie.**

Substratul tehnic e bun și verificabil: am confirmat prin cod și prin baza de date vie cele trei constatări pe care NO-GO-ul le pune în capul listei (`PROV-01`, `OPS-01`, `OPS-02`) și am refăcut din zero modelul economic. Problema nu e substanța, ci **hârtia**: contoarele din antetul registrului, numărul de condiții de inversare, mapa constatărilor pe porți și prețul recomandat se contrazic între ele și, în două cazuri, contrazic sursele pe care le citesc.

Cinci lucruri le consider **defecte reale, nu divergențe de stil**, în ordinea severității:

1. Contoarele antetului registrului (`115` / `17 P0`) sunt greșite față de corpul aceluiași fișier (`127` / `28 P0`), iar `16-GO-NO-GO-DECISION.md:4` repetă eroarea. `VERIFIED` — numărare programatică, vezi §2.1.
2. Condițiile de inversare **nu închid** `COMM-01`/`PROMO-01` — adică exact defectul pentru care clientul ar fi taxat mai mult decât i s-a cerut — și nici `COMM-02`, `COMM-03`, `PRICE-03`, `INF-01`, `INF-03`, `DR-01`, `DR-03`. Așadar „13 condiții ⇒ GO" nu e suficient. `VERIFIED` (cross-check registru ↔ tabel §4), vezi §4.2.
3. Prețul recomandat în headline (`€9.99` pentru `discord-bot`, `16-GO-NO-GO-DECISION.md:77`) contrazice același document, 8 rânduri mai jos (`:85`: „`discord-bot` … **nu se vinde pe acest hardware**") și contrazice cele două rapoarte scrise după `09-pricing-recommendations.md` (`08-product-portfolio.md`, `08-product-launch-order.md`). `VERIFIED` (documente) + `CODE-INSPECTED` (raportul de preț).
4. Două erori aritmetice în `09-unit-economics.md`, care **nu se regăsesc** în `09-break-even-model.csv`: rândul `4.50` e o copie a rândului `4.56`, iar LTV-ul la churn 2% e pe jumătate. `VERIFIED` (script + recalcul), vezi §3.2 și §3.3.
5. Tabelul porții 12 din `16-GO-NO-GO-DECISION.md:35` atribuie porții 12 patru constatări care aparțin porții 11/3 și **omite** `PROV-06`, care e prima dovadă a porții 12 în raportul-sursă. `VERIFIED` (comparare cu `07-release-gates.md:290`).

Am găsit **31 de erori** în total (numărătoare în §8). Nu am găsit **nicio** cifră de concurență fabricată: am verificat independent prețul Zentaris (€4.49 / 4 GB / 2 vCPU / 25 GB) pe pagina publică și corespunde exact cu ce scrie `08-competitive-analysis.md:44` — `VERIFIED`.

---

## 2. Erori găsite în constatările P0/P1

### 2.1 [CRITIC] Contoarele din `12-FULL-FINDINGS-REGISTER.md` §0.4 nu corespund corpului aceluiași fișier

`CODE-INSPECTED` + `VERIFIED` (numărare programatică).

Contoarele afirmate (`12-FULL-FINDINGS-REGISTER.md:52-61`):

```
| Securitate (`SEC-*`) | 29 | 2 | ...
| Comerț și facturare (`COMM-*`) | 12 | 6 | ...
| Infrastructură / rețea / capacitate / DR | 14 | 3 | ...
| UX și design (`UX-*`) | 12 | 0 | ...
| Creștere și marketing (`MKT-*`) | 8 | 0 | ...
| **Total** | **115** | **17** | **10** | **21** | **39** | **28** |
```

Realitatea din corpul registrului (parsing al tabelelor §1–§7c):

| Metrică | Afirmat | Real | Diferență |
|---|---:|---:|---:|
| Rânduri de constatare | 115 | **127** | +12 |
| Rânduri cu P0 = „Da" | 17 | **28** | **+11 (+65%)** |
| Domenii `UX-*` | 12 | **0** | −12 (nu există) |
| Domenii `MKT-*` | 8 | **0** | −8 (nu există) |
| Domenii `PRICE-*` | necuprins | **6** | +6 |
| Domenii `PORT-*` | necuprins | **9** | +9 |

Comanda de reproducere:

```bash
cd /root/blipmade-work/audit && python3 - <<'PY'
import re
lines=open('12-FULL-FINDINGS-REGISTER.md').read().split('\n')
hdrs=[(i,l) for i,l in enumerate(lines,1) if l.startswith('| ID') and 'Sev.' in l]
p0=0
for i,l in enumerate(lines,1):
    m=re.match(r'^\|\s*\*{0,2}([A-Z]+-\d+)\*{0,2}\s*\|',l)
    if not m: continue
    cand=[hl for hi,hl in hdrs if hi<i]
    hcols=[c.strip() for c in cand[-1].strip('|').split('|')]
    cols=[c.strip().replace('**','') for c in l.strip('|').split('|')]
    if 'P0' in hcols and len(cols)>hcols.index('P0') and cols[hcols.index('P0')].startswith('Da'): p0+=1
print('P0 = Da:', p0)
PY
```

Prefixele efectiv existente: `SEC` 29, `PROV` 14, `COMM` 12, `PROMO` 12, `DOC` 13, `INF` 8, `NET` 4, `CAP` 4, `DR` 5, `PRICE` 6, `OPS` 11, `PORT` 9 = **127**. `UX-*` și `MKT-*` **nu apar nicăieri în corpul registrului** (grep pe tot corpusul: `UX-*` există doar în `06-design-improvement-backlog.md` și `06-ux-ui-complete.md`, ca prefix de altă familie; `MKT-*` nu apare deloc ca ID de constatare).

**Impact:** numărul „17 P0" e citat în `16-GO-NO-GO-DECISION.md:4` („115 constatări, 17 P0") și în `13-PRIORITIZED-BACKLOG.md:261` („Toate cele **17 rânduri P0** sunt închise"). Un cititor de execuție care primește „17 P0" va subestima cu 11 blocaje reale, dintre care cele mai scumpe (`COMM-03`, `PRICE-03`, `INF-01`, `INF-03`, `DR-01`, `DR-03`, `PORT-01..03`, `PORT-06`, `PORT-07`) **nu apar în nicio condiție de inversare** (§4.2).

### 2.2 [MAJOR] `COMM-01` și `PROMO-01` sunt același defect, numărate ca două P0

`CODE-INSPECTED` — am urmărit defectul end-to-end în cod:

- `api/src/routes/orders.ts:79` → `total: quote.total`; `quote.total = Math.max(0, subtotal - discount)` (`api/src/services/pricing.ts:325`), deci **discountuit**; articolele se salvează cu `unitAmount: item.unitAmount` din `quote.items` = `priced`, **nediscountuit** (`api/src/services/pricing.ts:305`).
- `api/src/services/stripe.ts:175` → `unit_amount: item.unitAmount` ⇒ Stripe încasează **suma neredusă**.
- `api/src/routes/webhooks.ts:192` → `if (amountTotal !== order.total) return ...` ⇒ mismatch ⇒ comanda **nu e onorată**, iar clientul e taxat cu prețul plătit.

Registry rows: `12-FULL-FINDINGS-REGISTER.md:140` (`COMM-01`) și `:161` (`PROMO-01`) descriu **același mecanism, cu aceleași trei citări de fișier** (`stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:188-196` / `:192`). Sursa e aceeași: `05-commerce-and-billing.md:678` (B1). `PROMO-01` e doar reetichetarea aceluiași B1.

**Impact:** P0-urile sunt inflate cu 1, iar în `16-GO-NO-GO-DECISION.md:35` rândul porții 12 și în `:120` defectul e citat de două ori ca fiind două constatări distincte.

### 2.3 [MAJOR] `PRICE-03` și `COMM-09` sunt același defect, cu severități contradictorii

`CODE-INSPECTED` + `VERIFIED` (DB).

- `12-FULL-FINDINGS-REGISTER.md:240` → `| PRICE-03 | **P0** | \`VERIFIED\` | **Prețul afișat public nu spune unitatea** (\`price.amount = 149\` = €1.49) — convenția apare o singură dată în tot contractul | **Da** | \`api/src/routes/catalog.ts:59\`; \`docs/API_CONTRACT.md\` |`
- `12-FULL-FINDINGS-REGISTER.md:148` → `| COMM-09 | Medium | \`CODE-INSPECTED\` | Câmpul \`price.amount\` nu spune că e în unități minori; convenția apare o singură dată în tot contractul | Nu | \`api/src/routes/catalog.ts:59\`; \`docs/API_CONTRACT.md:5,57,60,89\` |`

Aceleași constatare, aceeași citare de cod, **două severități diferite** (`P0` + P0=Da vs `Medium` + P0=Nu). `api/src/routes/catalog.ts:59` confirmă `price: price ? { amount: price.baseAmount, currency: price.currency, period: price.period } : null` — `amount` e în unități minori, fără unitate în payload. `VERIFIED`.

**Impact:** P0-urile sunt inflate cu încă 1 (și invers, cine citește doar `COMM-09` pierde un P0). În plus, `PRICE-03` e P0 dar **nu e în nicio condiție de inversare** (§4.2).

### 2.4 [MAJOR] `PORT-02` afirmă un lucru aritmetic fals: „€1.72 e sub prețul de piață (€0)"

`CODE-INSPECTED` (surse) + `VERIFIED` (matematică).

`12-FULL-FINDINGS-REGISTER.md:274`:

> `| PORT-02 | **Critical** | \`VERIFIED\` | **Prețul actual al lui \`discord-bot\` (€1.72) e sub floor și sub prețul de piață (€0)** ⇒ nu se vinde pe acest hardware, la acest cost, cu acest nivel de suport | **Da** | \`08-product-launch-order.md\` §7 |`

€1.72 **este peste** €0, nu sub €0. Ceea ce spune sursa (`08-competitive-analysis.md:88-90`) e că **primul** server Lunafy costă €0/lună la 512 MB / 0.5 vCPU, iar **serverul suplimentar** costă €1/lună. Deci €1.72 e peste ambele praguri Lunafy. Fraza corectă din `08-product-launch-order.md:202` e „**Phragul (€3.40) e peste** prețul de listă (€1.72) **și** peste prețul de intrare al pieței (€0 la Lunafy)" — adică pragul de cost e peste prețul de intrare al pieței, nu prețul e sub prețul pieței. Registrul a inversat subordinea și a scris un fals aritmetic.

Aceeași formulare greșită e propagată în:
- `16-GO-NO-GO-DECISION.md:85` → „**Sub floor și sub prețul de piață (€0)** — nu se vinde pe acest hardware"
- `13-PRIORITIZED-BACKLOG.md:79` (B-79) → „`discord-bot` la €1.72 e sub floor **și** sub prețul de piață (€0)"

În plus, clasa `VERIFIED` e greșită: concluzia („nu se vinde") e `INFERRED` dintr-o comparație cu un singur concurent cu tier gratuit; faptul brut („Lunafy are un tier gratuit la 512 MB") e singurul `DOCUMENTED-ONLY`/`VERIFIED`. `PORT-01` (aceeași logică) e corect marcat `INFERRED` (`12-FULL-FINDINGS-REGISTER.md:273`) — deci există și **inconsistență de clasă între două rânduri care se sprijină unul pe celălalt**.

### 2.5 [MAJOR] Poarta 10 e 🟢 GREEN, dar două constatări P0 descriu exact poarta 10

`VERIFIED` (documente).

`07-release-gates.md:23` și `12-FULL-FINDINGS-REGISTER.md:300` → poarta 10 „Checkoutul afișează prețuri material greșite" = **GREEN**.

Dar:
- `COMM-01`/`PROMO-01` (P0=Da, §2.2) = clientul vede totalul discountuit și e taxat totalul neredus ⇒ **preț material greșit la checkout**.
- `PRICE-03` (P0=Da, §2.3) = prețul afișat public nu spune unitatea ⇒ **preț material greșit în catalog**.

Secțiunea porții 10 (`07-release-gates.md:190-205`) argumentează *mecanismul de calcul* („Prețul e **server-side**"), nu *afișajul*. Verdictul GREEN e justificat pentru „calculul e corect" și invalid pentru „afișează prețuri material greșite". O poartă care ascunde două P0 nu poate fi GREEN.

### 2.6 [MAJOR] Poarta 4 e 🟢 GREEN, deși `COMM-03` e P0

`VERIFIED` (documente) + `CODE-INSPECTED`.

`07-release-gates.md:17` → poarta 4 „Upgrade-urile de resurse se fac fără plată corespunzătoare" = **GREEN**. Motivul (`:89-97`): „`applyUpgradeOrder` e apelat direct **numai** în ramura fără plată (`:278-282`), adică pentru o schimbare care costă mai puțin".

`12-FULL-FINDINGS-REGISTER.md:142` → `COMM-03` = **P0** = „`applyUpgradeOrder()` nu verifică plata" — cu nota „latent azi (singurul apelant neplătit are `total=0`), dar bombă cu ceas la orice apel nou".

Două constatări P0 se sprijină pe **aceeași apărare**: „e latent". Consecința e inconsistentă: `COMM-01` e P0 pentru un defect la fel de latent (nicio promoție există în DB: `Promotion` = 0 rânduri — `VERIFIED` pe DB), dar `COMM-03` e P0 **și** poarta lui e GREEN. O poartă al cărei subiect e P0 nu poate fi GREEN.

În plus, **`COMM-03` nu are niciun rând în backlog** (verificat: `13-PRIORITIZED-BACKLOG.md` §1.1–§1.6 nu-l menționează). Un P0 fără rând de backlog e un P0 care nu se repară.

### 2.7 [MAJOR] Condiția 9 pretinde că închide `SEC-11` și `SEC-29`, dar nu le atinge

`VERIFIED` (comparare text ↔ text).

`16-GO-NO-GO-DECISION.md:54`:

> `| 9 | Rotirea parolei de panou a clientului, cu o cale de resetare, înainte de orice rotire a \`SESSION_SECRET\`; reducerea conturilor \`root_admin\`; retenție pe transportul de e-mail în fișier | 8 | \`SEC-11\`, \`SEC-18\`, \`SEC-29\` | 2 z |`

- `SEC-18` = „Mesajele de e-mail scrise pe disc, lizibile de oricine (0644)" (`12-FULL-FINDINGS-REGISTER.md:90`) ⇒ **acoperit** de „retenție pe transportul de e-mail în fișier". Corect.
- `SEC-11` = „Toate secretele într-un singur fișier, inclusiv tokenul de admin Caddy" (`:83`) ⇒ **nu** e acoperit. Rotirea unei parole nu separă secretele în `.env`.
- `SEC-29` = „Cheia API a agentului operatorului, vizibilă în argumentele procesului" (`:102`) ⇒ **nu** e acoperit. Rotirea parolei de panou a clientului nu scoate cheia din `ps auxww`.

### 2.8 [MINOR] Taxonomie de severitate incoerentă în coloana „Sev."

`VERIFIED` (numărare).

Coloana „Sev." din registrul folosește **două etichete pentru aceeași clasă de blocaj**: `P0` (11 rânduri: `PROV-04`, `COMM-01..03`, `PROMO-01..02`, `DR-02`, `DR-04`, `PRICE-01..03`) și `Critical` (18 rânduri, dintre care `SEC-01`, `SEC-02`, `PROV-01..02`, `INF-01..03`, `DR-01`, `DR-03`, `OPS-01..03`, `PORT-01..03`, `PORT-06..07`) — toate cu P0 = „Da". Peste tot, 28 de rânduri cu P0=Da, 18 Critical + 10 „P0" + … exact 28, deci toate rândurile P0=Da au fie `Critical`, fie `P0` ca severitate.

Cauza e vizibilă în surse: `02-security-audit.md:37-38` are coloană de severitate și spune `Critical` pentru `SEC-01`/`SEC-02`; `05-commerce-and-billing.md:678-685` **nu are** coloană de severitate (doar ID, constatare, evidență, clasă, impact). Deci severitatea lui `COMM-*` e atribuită de orchestrator, nu preluată, și e exprimată într-o etichetă diferită de cea a lui `SEC-*`. Registrul §0.2 definește `P0 — Blocant` ca severitate, dar coloana „P0" de alături e un *indicator de blocaj de lansare*, cu trei valori („Da", „Nu", „Nu (blocaj de lansare)"). Rezultatul: aceeași informație spusă de două ori, în două taxonomii, care se contrazic.

### 2.9 [MINOR] `PROV-01` — formularea impactului depășește clasa de verificare

`CODE-INSPECTED`.

`12-FULL-FINDINGS-REGISTER.md:117` → „`api/src/services/provisioning.ts:214` — eroare de 1024×; un container care nu-și încape pe disc afectează **tot nodul**". Am confirmat mecanismul: `api/src/services/provisioning.ts:213-214` compară `node.disk + node.disk_overallocate - node.allocated_resources.disk` (din `GET /api/application/nodes`, unde `disk` e în **MB** — `api/src/services/pterodactyl/application.ts:242-245`, `api/src/services/pterodactyl/types.ts:54-58`) cu `disk` în **GB** (doar `provisioning.ts:469,477` face `instance.disk * 1024` pentru panou). Deci poarta de disc **nu leagă niciodată**. Concluzia „afectează tot nodul" e `INFERRED` (un disc plin afectează și celelalte containere), nu `VERIFIED` — și chiar sursa o spune mai atent: `04-pterodactyl-and-provisioning.md:539` („**nu poate fi exercitat de un client azi**, pentru că plățile sunt oprite prin configurare (D4)"). Nu e o greșeală de fond; e o clasă prea puternică pe un rând care se sprijină pe o inferență.

### 2.10 [INFO — BILĂ CURATĂ] Contoarele porților, probele porților și clasările `CODE-INSPECTED` ale constatărilor de cod sunt corecte

`VERIFIED`.

- `07-release-gates.md:27` „**5 RED · 5 AMBER · 3 GREEN**" — recalculat din rândurile 14-26: RED {5,7,9,12,13}, AMBER {2,3,6,8,11}, GREEN {1,4,10}. **Corect.**
- Citările `file:line` ale celor 28 de P0 le-am extras programatic și le-am deschis: **toate** trimit la cod real, cu conținutul descris. Audit automat al tuturor celor **949** de citări `file:line` din `audit/*.md`: **0** citări cu linie în afara fișierului, **1** citare cu fișier inexistent (§7.6).
- Clasa `CODE-INSPECTED` e corect folosită acolo unde comportamentul n-a fost executat; clasările `VERIFIED` ale constatărilor măsurate (14 bilete, 93/30 joburi, 80/5 evenimente, 6 utilizatori, 3 instanțe) **se reproduc** pe sistemul viu — am rulat interogările read-only: `ProvisioningJob` = 93 `completed` + 30 `failed`; `AuditLog` = 80 `instance.provision_failed` + 5 `instance.provisioned`; `Ticket` = 14, toate `OPEN`, toate `lastReplyAt IS NULL`, 0 `assignedToId`; `Subscription`/`Invoice`/`Payment` = 0/0/0; `Promotion` = 0. **Corect, cu o singură excepție** (vezi §5, rândul despre „2 servere orfane din 5" vs „5 servere pe panou vs 3 instanțe").

---

## 3. Erori găsite în modelul financiar

### 3.1 [BILĂ CURATĂ — metodă] Formula contribuției, pragurile și break-even-ul reproduc corect

`VERIFIED` (recalcul din ipoteze, nu din tabele).

Cu ipotezele din `09-financial-assumptions.md` (`SERVER_COST_EUR_PER_MONTH` = 60.00, `PAYMENT_FEE_PCT` = 0.03, `SUPPORT_HOURLY_COST` = 20.00, `SUPPORT_MINUTES_PER_CUSTOMER` = 15, `CAC_EUR` = 25.00):

- `VC(P) = 0.03·P + 0.25 + (15/60)·20.00 + 0.25 = 0.03·P + 5.50` — **corect**.
- La `P = 9.99`: contribuție = 0.97·9.99 − 5.50 = **4.1903** — **corect**.
- `n_be = FIXED / contribuție = 61.00 / 4.1903 = 14.557` ⇒ **15 clienți** — **corect**.
- `PRICE_FLOOR_FULL_ABSORPTION_16 = (61/16 + 5.50)/0.97 = 9.3125/0.97 = **9.6005**` — **corect**.
- La 16 clienți: venit 23.84, VC 88.72, rezultat −125.88 — **corect**.
- La 5.90: `n_be = 61/0.223 = 273.5` ⇒ **274** — **corect**.
- Tabelul de sensibilitate `09-financial-assumptions.md` §3.1: toate cele 16 rânduri (4 prețuri × 4 valori `V3`) recalculate — **toate corecte**.
- `09-break-even-model.csv`: **57 de rânduri**, fiecare recalculat din formula declarată în coloana `variable_cost_formula`. Venit, VC total, VC per client, contribuție, contribuție lunară, rezultat operațional, `customers_needed_for_break_even` — **0 rânduri inconsistente**.
- `payback = 25/4.1903 = 5.966` ⇒ **5.97 luni**; `LTV @5% = 4.1903/0.05 = 83.81`; `LTV/CAC = 3.35`; `CAC maxim @H=12 = 12·4.1903·conv − 5.25`; `conversie_minimă(H) = 30.25/(4.1903·H)`; bugetul de promoție `15·(4.1903·12 − 25) = 379.25` — **toate corecte**.

Modelul e bine construit și **reproductibil**. Erorile de mai jos sunt izolate, nu structurale.

### 3.2 [MAJOR] `09-unit-economics.md:93` — rândul `4.50` e o copie a rândului `4.56`

`VERIFIED` (script + recalcul + CSV).

`09-unit-economics.md:93`:

```
| 4.50 | 5.6368 | −1.0768 | −23.9% | 9.6005 |
| 4.56 | 5.6368 | −1.0768 | −23.6% | 9.6005 |
```

La `P = 4.50`: `VC = 0.03·4.50 + 5.50 = **5.6350**`, contribuție = 4.50 − 5.6350 = **−1.1350**, marjă = **−25.2%**. Valorile 5.6368 / −1.0768 sunt ale lui `P = 4.56`. Marja a fost recalculată (−23.9% = −1.0768/4.50), deci rândul e o **copie parțial editată** a rândului următor.

`09-break-even-model.csv` are rândul corect: `current-card|price-4.5000|occ-25.00pct|n-4` → `variable_cost_eur_per_customer_per_month = 5.6350`. **Deci markdown-ul și CSV-ul se contrazic direct pe aceeași linie de model.**

Comanda de reproducere:

```bash
cd /root/blipmade-work/audit && python3 -c "
import csv
for r in csv.DictReader(open('09-break-even-model.csv')):
    if r['monthly_price_eur'] in ('4.5000','4.5600') and r['instances_sold']=='4':
        print(r['monthly_price_eur'], r['variable_cost_eur_per_customer_per_month'], r['contribution_eur_per_customer_per_month'])"
# 4.5000 5.6350 -1.1350
# 4.5600 5.6368 -1.0768
```

**Impact:** mic în valoare absolută (1 cent/lună), dar într-un document care își revendică „255/255 cote corecte" și „0 inconsistențe între cele 6 surse de preț" (`16-GO-NO-GO-DECISION.md:70`), o eroare de 0.0038 într-o celulă e o mică fisură în credibilitatea tabelului. Se repară trivial.

### 3.3 [MAJOR] `09-unit-economics.md:170` — LTV-ul la churn 2% e pe jumătate față de §7

`VERIFIED` (recalcul + comparație internă).

`09-unit-economics.md:170`:

```
| **conservator** | 2% | −202.73 | −191.58 | 11.15 | **104.76** | 4.19 |
```

`09-unit-economics.md:193` (tabelul de sensibilitate al aceluiași fișier):

```
| 2% | 209.52 | 8.38 | 69.84 |
```

`LTV(9.99, churn=2%) = 4.1903 / 0.02 = 209.515` ⇒ **209.52**, nu 104.76. 104.76 corespunde unui churn de **4%**, deci e o eroare de factor 2.

Dovada că e o eroare de transcriere, nu de model: **în aceeași linie**, coloana €1.49 dă −202.73 = 4.0547/0.02 ✓, coloana €1.72 dă −191.58 = 3.8316/0.02 ✓, coloana €5.90 dă 11.15 = 0.223/0.02 ✓. Doar coloana €9.99 e greșită. Consecința: `LTV/CAC` e raportat ca 4.19 în §6 și ca **8.38** în §7.

### 3.4 [MAJOR] `09-unit-economics.md:82` — rândul „16" din tabelul de absorbție alocă `SERVER_COST` (60) în loc de `FIXED` (61)

`VERIFIED` (recalcul + coerență internă).

`09-unit-economics.md:70-82`:

```
ALLOCATED_SERVER_COST_PER_INSTANCE = SERVER_COST_EUR_PER_MONTH / SAFE_INSTANCES_PER_NODE
                                    = 60.00 / 16 = 3.75 EUR/client/lună   (la ocupare 100%)
...
| 4  | 25% | 15.2500 | 21.0497 |
| 8  | 50% |  7.6250 | 13.4247 |
| 12 | 75% |  5.0833 | 10.8830 |
| 16 | 100% |  3.7500 |  9.5497 |
```

Coloana „cost fix pe client" e `FIXED/N` pentru N = 4, 8, 12 (61/4 = 15.25, 61/8 = 7.625, 61/12 = 5.0833) — dar pentru N = 16 e `SERVER_COST/16` = 60/16 = **3.7500**. Coherent ar fi **61/16 = 3.8125**, cu `VC` total de absorbție **9.6122**, nu 9.5497.

Consecința nu e cosmetică: **`PRICE_FLOOR` = 9.6005 din același fișier (`:90-96`) e calculat cu 61/16 = 3.8125**. Deci tabelul de absorbție și pragul de preț din același document folosesc două alocări diferite ale aceluiași cost fix, iar rândul de la 16 clienți e cel care nu se potrivește cu formula declarată chiar deasupra lui.

### 3.5 [MAJOR] Două costuri de nod incompatibile în corpus ⇒ două praguri de preț incompatibile

`VERIFIED` (documente).

| Constantă | Valoare | Unde | Clasa | Ce spune despre ea |
|---|---:|---|---|---|
| `SERVER_COST_EUR_PER_MONTH` | **60.00** | `09-financial-assumptions.md:86` | `OPERATOR-INPUT` | „Valoarea este un **placeholder de calcul** și nimic mai mult." |
| `C_node` | **54.44** | `08-product-launch-order.md:181` | `INFERRED` | „Acesta e un `INFERRED` (ipoteza „cost proporțional cu vCPU"), cu o singură sursă externă, nu o factură." |

Ambele sunt onest marcate. Problema e că **ambele ajung în concluzii de headline, cu praguri diferite**:
- Modelul economic ⇒ prag de full-absorption **€9.60** la 16 clienți (`09-financial-assumptions.md:96`), preț recomandat **€9.99**.
- Modelul de portofoliu ⇒ prag **€3.40** la 1 vCPU, **€6.81** la 2 vCPU (`08-product-launch-order.md:188-190`).

Cele două praguri diferă cu 2.8× și nu sunt reconciliate nicăieri. `16-GO-NO-GO-DECISION.md` le pune **pe amândouă în aceeași secțiune** (`:77` cu €9.99, `:85` cu €3.40) fără să spună că sunt modele diferite pentru scopuri diferite. Cititorul reține „prețul de floor e €9.60" și „floor-ul e €3.40" ca pe două adevăruri compatibile.

### 3.6 [MAJOR] Prețul recomandat de €9.99 pentru `discord-bot` e depășit de două rapoarte scrise după el

`VERIFIED` (documente).

Cronologie (mtime în `audit/`): `09-pricing-recommendations.md` 13:39 · `08-competitive-analysis.md` 14:03 · `08-product-launch-order.md` 14:04 · `08-product-portfolio.md` 14:05 · `16-GO-NO-GO-DECISION.md` 14:13.

`09-pricing-recommendations.md` (13:39) scrie la `:15-17`:

```
| `audit/08-competitive-analysis.md` | **NU EXISTĂ** | ...
| `audit/08-product-portfolio.md` | **NU EXISTĂ** | ...
| `audit/08-product-launch-order.md` | **NU EXISTĂ** | ...
```

și la `:119`: „`audit/08-competitive-analysis.md` **nu există**, ... **Nu inventez prețuri de piață.**"

Toate trei există acum. Consecința e o **recomandare de preț depășită, preluată ca atare în decizie**:
- `08-product-portfolio.md:71` → `discord-bot`: „**€1.49 → €1.72 → €5.92** (`149` / `149+15+0+8=172` / `149+225+120+98=592`)", verdict `LAUNCH-AFTER-FIX`.
- `08-product-launch-order.md:114` → re-spec: „**€1.72** (512/1/5) → €2.12 (1024/1/10) → €5.92 (4096/4/50) | `baseAmount` 149→172".
- `08-product-launch-order.md:14` → produsul de fază 1 = `minecraft-paper` la **€4.09 / €4.49 / €5.99**, nu botul.
- `16-GO-NO-GO-DECISION.md:77` → „Preț recomandat **€9.99/lună** pentru `discord-bot` la 512 MB/1 vCPU/5 GB", cu `baseAmount = 976` (`09-pricing-recommendations.md:2.3`).

**€9.99 pentru `discord-bot` contrazice direct `baseAmount = 172` și scăderile de €5.92 ale aceluiași produs.** La €9.99, botul ar fi cu **€4.07 peste** maximul de €5.92 propus pentru configurația cea mai mare (4096/4/50) și cu **€5.90 peste** prețul de intrare propus pentru Minecraft. Piața documentată în același corpus (OVI €3.99, Zentaris €4.49, Torchbyte €4.74 la 4 GB/2 vCPU) ar plasa €9.99 deasupra întregului segment plătitor.

### 3.7 [MAJOR] Două răspunsuri diferite la întrebarea „care e break-even-ul lunar realist?" (Q14)

`VERIFIED` (documente).

| Sursă | Preț | `n_be` | Formula |
|---|---:|---:|---|
| `09-unit-economics.md:365` | €9.99 (`discord-bot`) | **15** clienți | `61 / 4.1903` |
| `08-product-launch-order.md:188` | €4.09 (`minecraft-paper`) | **14** clienți | `54.44 / 4.09` |

Ambele sunt corect aritmetic în interiorul modelelor lor, dar corespund la **produse, prețuri și costuri de nod diferite**, iar `16-GO-NO-GO-DECISION.md:77` prezintă doar primul ca „break-even", într-un document citit de un decident ca pe un singur număr. Pentru Q14 din brief, corpusul nu are un răspuns unic.

### 3.8 [MINOR] `09-pricing-recommendations.md` declară „NU EXISTĂ" fișiere care există

`VERIFIED` (documente) — vezi §3.6. Nu e o cifră falsă, dar e un enunț fals într-un livrabil: un cititor care s-ar ghideze după „Nu inventez prețuri de piață" pierde de vederea că analiza competitivă **există** și conține prețuri reale, citite și citabile.

---

## 4. Erori în logica de pregătire a lansării

### 4.1 [CRITIC] Numărul condițiilor de inversare: 9, 13 sau 4?

`VERIFIED` (documente).

| Locație | Text | Număr |
|---|---|---:|
| `16-GO-NO-GO-DECISION.md:12` | „cu **13 condiții obligatorii**, după remedierea a **9 defecte P0** și a **4 condiții de infrastructură**" | 13 / 9 / 4 |
| `16-GO-NO-GO-DECISION.md:42` | „## 4. **Cele 13 condiții** care inversează verdictul" | 13 |
| `16-GO-NO-GO-DECISION.md:110` | „Nu e nevoie de niciuna dintre **cele 9 condiții**" | **9** |
| `13-PRIORITIZED-BACKLOG.md:262` | „Cele **9 condiții** din `16-GO-NO-GO-DECISION.md` §4 sunt îndeplinite" | **9** |
| `13-PRIORITIZED-BACKLOG.md:18` | „## 1. P0 — Blocant de lansare (**23 rânduri**)" | 23 P0 |
| `13-PRIORITIZED-BACKLOG.md:261` | „Toate cele **17 rânduri P0** sunt închise" | **17 P0** |

§4 are **13** rânduri (2+1+4+3+1+5+3+3+2+3–5+1+0.5+3–4 zile, sumă 31.5–34.5 ⇒ „~35 zile" de la `:62` e corectă — **bilanț curat pe acest punct**). Două locuri spun „9 condiții" și unul spune „17 rânduri P0" contra propriului „23 rânduri" din același fișier. Cele trei numere circulă în trei fișiere ca unul singur.

### 4.2 [CRITIC] Condițiile nu sunt suficiente: 9 P0-uri rămân deschise după îndeplinirea tuturor celor 13 condiții

`VERIFIED` (cross-check registru ↔ tabelul §4).

Am citit coloana „Constatări închise" pentru toate cele 13 condiții și am intersectat cu cele 28 de rânduri P0=Da:

| P0 | Închis de o condiție? |
|---|---|
| `SEC-01`, `SEC-02` | ✅ c.8 |
| `PROV-01`, `PROV-02` | ✅ c.6 |
| `PROV-04` | ✅ c.1 |
| `COMM-01`, `PROMO-01` | ❌ **nicio** |
| `COMM-02` | ❌ **nicio** |
| `COMM-03` | ❌ **nicio** |
| `PROMO-02` | ❌ **nicio** |
| `INF-01`, `INF-03` | ❌ **nicio** |
| `INF-02` | ✅ c.3 |
| `DR-01`, `DR-03` | ❌ **nicio** |
| `DR-02`, `DR-04` | ✅ c.3 |
| `PRICE-01`, `PRICE-02` | ✅ c.5 |
| `PRICE-03` | ❌ **nicio** |
| `OPS-01` | ✅ c.10 |
| `OPS-02` | ✅ c.11 |
| `OPS-03` | ✅ c.12 |
| `PORT-01`, `PORT-02`, `PORT-03`, `PORT-06` | ❌ **nicio** |
| `PORT-07` | ✅ implicit c.1 |

**9 P0-uri rămân deschise.** Cele mai grave:

1. **`COMM-01`/`PROMO-01`** — clientul taxat cu prețul neredus. Singura referire la ele în tot documentul e în §7 (`:120`, „Repararea celor 4 P0 de produs"), **în afara tabelului de condiții**, și în Scenariul B (`:103`) ca **workaround** („se aplică manual, nu prin codul de promoții"), nu ca reparație. Adică: scenariul B evită defectul, nu îl închide, și scenariul A rămâne vulnerabil.
2. **`COMM-02`** — prețul stocat al instanței e `baseAmount`, nu prețul configurației (`:141`; `api/src/routes/admin.ts:912` = `price: price?.baseAmount ?? 0`). **Am verificat live**: 3 instanțe cu aceeași configurație (512/1/5) la prețuri 172 / **149** / 172 (`VERIFIED`, DB). Cât timp e viu, estimarea lunară a clientului e greșită, deci și orice calcul de venit bazat pe DB e greșit.
3. **`PRICE-03`** — prețul public nu spune unitatea, iar poarta 10 e GREEN (§2.5).
4. **`COMM-03`** — `applyUpgradeOrder()` nu verifică plata (§2.6).
5. **`INF-01`** (RAID 0 pe root) — condiția 3 (backup off-host) **mitighează**, nu închide; rămâne în §3 ca suport al porții 9 RED, dar nicio condiție nu-l închide.
6. **`PORT-01`/`PORT-02`/`PORT-06`** — pragul de preț nu e nici el în condiții, deși e un rând de backlog (B-79).

Testul cerut de sarcină („dacă presupunem că cele 9 condiții sunt îndeplinite, platforma devine lansabilă?") — **răspunsul e nu**: rămân neînchise exact defectele care privesc **corectitudinea banului** (`COMM-01`, `COMM-02`) și **corectitudinea prețului afișat** (`PRICE-03`).

### 4.3 [MAJOR] Condiția 13 nu are „constatări închise", iar rândul 9 închide constatări pe care nu le închide

`VERIFIED` (documente).

`16-GO-NO-GO-DECISION.md:60` → condiția 13 închide `OPS-04` — corect, `OPS-04` e „Nu (blocaj de produs)" în registru, nu P0. Dar totuși e trecut într-un tabel al cărui criteriu e „Constatări închise" dintre P0-uri, fără nicio notație că nu e P0. Mai grav: **condiția 9** (§2.7) și **condiția 5** închid `PRICE-01`/`PRICE-02` — corect — dar **nu închid `PRICE-03`**, care e tot în familia `PRICE-*` și tot P0.

### 4.4 [MAJOR] Rândul porții 12 din `16-GO-NO-GO-DECISION.md:35` atribuie greșit 4 constatări și omite 1

`VERIFIED` (comparare cu sursa).

`16-GO-NO-GO-DECISION.md:35`:

> `| **12** — Funcțiile de bază ale clientului indisponibile | \`PROV-04\`, \`COMM-04\`, \`COMM-05\`, \`COMM-07\`, \`COMM-08\`, \`PROV-12\`, \`OPS-03\`, \`OPS-06\` | Checkout 503; e-mail neconfigurat (\`mail: file\`); **canalul de suport inert** — toate cele 14 bilete au „No replies yet"; nu există plan anual; nu există retenție la anulare |`

Verificare în raportul-sursă `07-release-gates.md:223-240` („ce nu funcționează" pentru poarta 12): cele 5 puncte sunt (1) `feature_limits` goale ⇒ `PROV-06`; (2) containerul nu rulează ⇒ `OPS-01`; (3) checkout 503 ⇒ `PROV-04`; (4) resetarea parolei ⇒ e-mail în fișier; (5) consola neverificată. **Nici `COMM-04`, `COMM-05`, `COMM-07`, `COMM-08` nu apar în lista porții 12** — ele sunt, în raportul-sursă, materia porții 11 („Anularea sau reînnoirea e material incorectă", `07-release-gates.md:206-222`, AMBER) și porții 3 („O plată reușită poate fi pierdută sau reconciliată greșit", AMBER).

În plus, **`PROV-06` — prima dovadă a porții 12, cea mai concretă — e omisă** din rândul deciziei, deși `07-release-gates.md:290` o mapează explicit la porțile „7, 12".

### 4.5 [MAJOR] „Nu e o problemă de UX" contrazice rapoartele UX

`VERIFIED` (documente).

`16-GO-NO-GO-DECISION.md:132`:

> „- **Nu e o problemă de UX.** Interfața e într-o stare bună: 553 de verificări de browser verzi, structură semantică, navigare cu tastatura, contrast și focus vizibil."

`06-design-improvement-backlog.md:17-21` ratedază **cinci** elemente ca **S1** (severitatea maximă a scalei):

| Linii | ID | Sev | Problemă |
|---|---|---|---|
| `:17` | UX-01 | **S1** | `DataTable`: `<tbody class="grid">` strică modelul de tabel — decalaj 105–562 px, 9 rute, 22 de tabele |
| `:18` | UX-02 | **S1** | antetul spune „No public URL yet", dar adresa există și e în tabul „Network" |
| `:19` | UX-03 | **S1** | „Online" (pastilă) și „Container: offline" (metrici) pe același ecran |
| `:20` | UX-04 | **S1** | staff-ul nu poate inspecta o instanță: nicio rută, niciun link; adresa de client răspunde 404 |
| `:21` | UX-05 | **S1** | `503 payments_unavailable` blochează checkout-ul, comanda, subscripția și domeniul |

`06-ux-ui-complete.md:39` (§1) îl numește „**Defectul cel mai grav**: `DataTable` rupe modelul de tabel".

Deci „Nu e o problemă de UX" e o **concluzie de sinteză mai optimistă decât sursa ei**, iar argumentul adus („553 de verificări verzi") e un argument de **absență a regresiilor**, nu de absență a defectelor — cele două măsurări diferite. Sunt 2 elemente S1 în `06-ux-ui-complete.md` și 5 S1 în backlog.

### 4.6 [MINOR] „Nu e o problemă de scalare" contrazice `PORT-06` (P0)

`VERIFIED` (documente).

`16-GO-NO-GO-DECISION.md:135`: „**Nu e o problemă de scalare.** Capacitatea sigură de 16 instanțe e suficientă pentru un start real". `12-FULL-FINDINGS-REGISTER.md:278` (`PORT-06`, P0=Da): „La specificația de piață (2 vCPU/server), nodul de 20 vCPU ține doar 8 servere plătitori (€35.92/lună) — insuficient". Capacitatea fizică e suficientă; **capacitatea economică la specificația de piață nu e**. Formularea trebuie împărțită.

### 4.7 [MINOR] Fraza despre campaniile de reducere e repetată verbatim în aceeași secțiune

`VERIFIED` (documente).

`16-GO-NO-GO-DECISION.md:78` și `:86` conțin aceeași teză: „Orice campanie de reducere, înainte de repararea lui `COMM-01`, **crește pierderea și distruge comenzile** — reducerea nu ajunge la Stripe, deci comanda eșuează la `verifyAmount` și clientul ar fi taxat cu prețul neredus." Prima apariție e după tabelul cu pragurile, a doua după „Concluzia de decizie". Nu e o eroare de fond, e o editare nefinalizată într-un document care se prezintă ca hotărâre.

---

## 5. Contradicții interne în corpus

`VERIFIED` — fiecare rând e verificabil prin comanda din coloana „Dovadă".

| # | Loc A | Loc B | Contradicția | Dovezi |
|---:|---|---|---|---|
| 1 | `12-FULL-FINDINGS-REGISTER.md:61` „Total **115** … **17**" | corpul aceluiași fișier: **127** rânduri, **28** cu P0=Da | numărul de constatări și de P0-uri | §2.1 (script) |
| 2 | `16-GO-NO-GO-DECISION.md:4` „(115 constatări, 17 P0)" | `12-FULL-FINDINGS-REGISTER.md:117-279` | propagarea contorului greșit | §2.1 |
| 3 | `13-PRIORITIZED-BACKLOG.md:18` „P0 … (**23 rânduri**)" | `13-PRIORITIZED-BACKLOG.md:261` „Toate cele **17 rânduri P0**" | 23 vs 17, în același fișier | grep direct |
| 4 | `16-GO-NO-GO-DECISION.md:42` „Cele **13** condiții" | `16-GO-NO-GO-DECISION.md:110` „cele **9** condiții"; `13-PRIORITIZED-BACKLOG.md:262` „Cele **9** condiții" | 13 vs 9 | grep direct |
| 5 | `16-GO-NO-GO-DECISION.md:77` „Preț recomandat **€9.99** pentru `discord-bot`" | `16-GO-NO-GO-DECISION.md:85` „`discord-bot` … **nu se vinde pe acest hardware**" | 8 rânduri distanță, același document | sed -n '77p;85p' |
| 6 | `09-pricing-recommendations.md:2.3` `baseAmount = 976` (€9.99) | `08-product-portfolio.md:71` `discord-bot` = 149/172/592 | €9.99 vs €1.72–€5.92, același produs | documente |
| 7 | `08-product-launch-order.md:14` faza 1 = `minecraft-paper` €4.09 | `16-GO-NO-GO-DECISION.md:77` faza 1 = `discord-bot` €9.99 | două produse de lansare | documente |
| 8 | `09-unit-economics.md:365` break-even **15** clienți @ €9.99 | `08-product-launch-order.md:188` break-even **14** clienți @ €4.09 | două răspunsuri la Q14 | documente |
| 9 | `09-unit-economics.md:93` VC(4.50) = **5.6368** | `09-break-even-model.csv` rândul `price-4.5000` = **5.6350** | markdown vs CSV | §3.2 (script) |
| 10 | `09-unit-economics.md:170` LTV@2% = **104.76**, LTV/CAC 4.19 | `09-unit-economics.md:193` LTV@2% = **209.52**, LTV/CAC 8.38 | același fișier, două tabele | §3.3 |
| 11 | `09-unit-economics.md:82` cost fix la 16 clienți = **3.7500** | `09-unit-economics.md:90-96` `PRICE_FLOOR` **9.6005** (implică 61/16 = 3.8125) | două alocări ale aceluiași cost fix | §3.4 |
| 12 | `09-financial-assumptions.md:86` `SERVER_COST` = **60.00** (`OPERATOR-INPUT`) | `08-product-launch-order.md:181` `C_node` = **54.44** (`INFERRED`) | două costuri de nod ⇒ praguri €9.60 vs €3.40 | §3.5 |
| 13 | `12-FULL-FINDINGS-REGISTER.md:240` `PRICE-03` = **P0**, P0=Da | `12-FULL-FINDINGS-REGISTER.md:148` `COMM-09` = **Medium**, P0=Nu | aceeași constatare, două severități | §2.3 |
| 14 | `12-FULL-FINDINGS-REGISTER.md:140` `COMM-01` P0 | `12-FULL-FINDINGS-REGISTER.md:161` `PROMO-01` P0 | același defect, numărat de două ori | §2.2 |
| 15 | `07-release-gates.md:23` poarta 10 **GREEN** | `12-FULL-FINDINGS-REGISTER.md:140,161,240` — 3 P0 despre preț la checkout/catalog | poarta ascunde P0-uri | §2.5 |
| 16 | `07-release-gates.md:17` poarta 4 **GREEN** | `12-FULL-FINDINGS-REGISTER.md:142` `COMM-03` P0 | idem | §2.6 |
| 17 | `16-GO-NO-GO-DECISION.md:35` poarta 12 citește `COMM-04/05/07/08` | `07-release-gates.md:223-240` poarta 12 nu le citește | atribuire greșită de poartă | §4.4 |
| 18 | `16-GO-NO-GO-DECISION.md:54` c.9 închide `SEC-11`, `SEC-29` | `12-FULL-FINDINGS-REGISTER.md:83,101` — descrierile lor | condiția nu le atinge | §2.7 |
| 19 | `16-GO-NO-GO-DECISION.md:132` „Nu e o problemă de UX" | `06-design-improvement-backlog.md:17-21` — 5× S1 | §4.5 |
| 20 | `16-GO-NO-GO-DECISION.md:135` „Nu e o problemă de scalare" | `12-FULL-FINDINGS-REGISTER.md:278` `PORT-06` P0 | §4.6 |
| 21 | `09-pricing-recommendations.md:15-17` „**NU EXISTĂ**" | fișierele există (mtime 14:03/14:04/14:05) | enunț fals în livrabil | §3.8 |
| 22 | `12-FULL-FINDINGS-REGISTER.md:274` „€1.72 e sub prețul de piață (€0)" | `08-competitive-analysis.md:89` „primul server **€0/lună** … server suplimentar **€1/lună**" | €1.72 > €0 | §2.4 |
| 23 | `10-seo.md:202` `web/index.css:15-34` | fișierul e `web/src/index.css`; `06-design-system.md:67` citește `web/src/index.css:15-35` | cale greșită + interval greșit | `ls web/*.css` → inexistent |
| 24 | `07-release-gates.md:259` „**5 servere pe panou, 3 instanțe** ⇒ 2 servere orfane" (OPS-07, `12:259`) | `16-GO-NO-GO-DECISION.md:22` „cu **2 servere orfane din 5**" | compatibile, dar `12:118` (`PROV-02`) spune „2 servere orfane **din 5**" și `12:275` (`PORT-03`) „5 servere pe panou vs 3 instanțe (orfane **8 și 14**)" | `04-pterodactyl-and-provisioning.md` — numerele 8 și 14 sunt **ID-uri de server**, nu un count; formularea „orfane 8 și 14" se citește ca „2 servere orfane, numerotate 8 și 14". Amendabil, dar ambiguu la citire |

### 5.1 [BILĂ CURATĂ] Coerența numerelor de volum

`VERIFIED` — am recreat fiecare număr de volum din producție:

| Afirmație | Loc | Verificat live |
|---|---|---|
| „93 `completed` / 30 `failed`" joburi | `07-release-gates.md:291` | ✅ `ProvisioningJob` |
| „30 joburi `failed` din 123" | `07-release-gates.md:291` | ✅ 30/123 |
| „80 `instance.provision_failed` vs 5 `instance.provisioned`" | `07-release-gates.md:291` | ✅ `AuditLog` |
| „24% eșec" | `16-GO-NO-GO-DECISION.md:22` | ✅ 30/123 = 24.4% |
| „6 utilizatori, 3 instanțe, 5 comenzi, 14 bilete" | `00-BRIEFING.md`, `12:254-255` | ✅ `User`/`Instance`/`Order`/`Ticket` |
| „`Subscription` = 0, `Invoice` = 0, `Payment` = 0" | `12:254` | ✅ |
| „`Promotion` = 0" | `12:239` | ✅ |
| „3 instanțe la prețuri diferite pentru aceeași configurație" | `12:141` | ✅ 172 / 149 / 172 la 512/1/5 |
| „`BM-00002` `AWAITING_PAYMENT` cu instanță `ONLINE`; `BM-00003` `PENDING` cu instanță `STOPPED`" | `12:254` | ✅ |
| „255/255 cote corecte" | `16-GO-NO-GO-DECISION.md:70` | `DOCUMENTED-ONLY` — nu am rulat suita de cotare; numărul e consistent între `05-pricing-consistency.md`, `07-release-gates.md`, `12:242` |
| „240 de teste automate (219 API + 21 web)" | `16-GO-NO-GO-DECISION.md:129` | `CODE-INSPECTED` — 25 de fișiere de test în `api/tests/`, 220 de apariții `it(`/`test(` (219 e în plajă); 3 fișiere de test în `web/` |
| „553 de verificări de browser (191+60+240+62)" | `07-release-gates.md:24` | ✅ suma e corectă; conținutul e `DOCUMENTED-ONLY` |
| „17 436 `Failed password` / 24 h" | `02-security-audit.md:13` | `DOCUMENTED-ONLY` (jurnalul e pe hipervizor, la mine e `BLOCKED`) |

---

## 6. Acoperire față de cele 25 de întrebări executive și față de livrabilele cerute

### 6.1 Livrabilele obligatorii lipsă

`VERIFIED` (`ls /root/blipmade-work/audit/` + lista din brief, `/root/.minimax/v2/assets/2026/10/23/12-20-01-905-asset_20261023-122001-905_4319e200ef2e_5bcd247d-pasted-text.txt:1945-1992`).

| Livrabil cerut | Stare |
|---|---|
| `00-EXECUTIVE-SUMMARY.md` | ❌ **LIPSEȘTE** |
| `01-backend-audit.md` | ❌ **LIPSEȘTE** |
| `17-NEXT-IMPLEMENTATION-PROMPT.md` | ❌ **LIPSEȘTE** |
| toate celelalte 39 din listă | ✅ prezente, nevidе, cu mtime 12:47–14:14 |

`01-backend-audit.md` e o listă explicită a brief-ului și nu e substituită de niciun alt fișier: `02-security-audit.md` e securitate, `05-commerce-and-billing.md` e comerț. **Nu există niciun raport de audit al backendului** (API, model de date, coadă, worker) în afara fragmentelor din `00-architecture.md` / `07-quality-assurance.md`.

`00-EXECUTIVE-SUMMARY.md` e locul în care brief-ul cere răspunsul la cele 25 de întrebări. `17-NEXT-IMPLEMENTATION-PROMPT.md` e pasul următor (post-audit).

### 6.2 Matricea de acoperire a celor 25 de întrebări

`VERIFIED` (citat + inspecție conținut). „Acoperit" = există un fișier care răspunde pe fond; „Parțial" = există materia, dar răspunsul e contradictoriu sau incomplet; „Lipsă" = nu există.

| # | Întrebare | Stare | Unde | Observație |
|---:|---|---|---|---|
| 1 | Pregătită tehnic pentru clienți plătitori? | **Acoperit** | `16-GO-NO-GO-DECISION.md` | verdict NO-GO, susținut de 5 porți RED |
| 2 | Ce e exact rupt sau neverificat? | **Acoperit** | `12-FULL-FINDINGS-REGISTER.md` | dar cu contoare greșite (§2.1) |
| 3 | Ce funcționează cu adevărat? | **Acoperit** | `07-release-gates.md` §2, `16:128-133` | bine construit |
| 4 | Decizii arhitecturale problematice? | **Acoperit** | `00-architecture.md`, `03-*` | — |
| 5 | Cele **zece** probleme cele mai periculoase | **Parțial** | `13-PRIORITIZED-BACKLOG.md` §1 | sunt **23** rânduri P0 în 6 subgrupuri, **nu** un top-10; nu există niciun artefact „cele 10 cele mai periculoase" |
| 6 | Cele **zece** slăbiciuni UX/UI | **Parțial** | `06-ux-ui-complete.md`, `06-design-improvement-backlog.md` | există UX-01…UX-28 cu severități S1–S4, dar nicio selecție top-10 și niciun „top 10" explicit |
| 7 | Ce lipsește vs. ce e neterminat? | **Acoperit** | `12` (`NOT-IMPLEMENTED`), `08-product-portfolio.md` | — |
| 8 | Ce funcții anunțate sunt mincinoase/simulate? | **Acoperit** | `12:238-243` (PRICE-01/02/06), `12:253` (OPS-01) | — |
| 9 | Starea celor 4 adrese IP publice? | **Acoperit** | `03-network-and-ip-plan.md`, `12:216-219` | — |
| 10 | Cât hardware se poate vinde sigur? | **Acoperit** | `03-capacity-model.md`, `12:220-223` | — |
| 11 | Ce produse se lansează primele? | **Acoperit** | `08-product-launch-order.md` | dar `16:77` propune alt produs (§3.6) |
| 12 | Ce produse NU trebuie oferite? | **Acoperit** | `08-product-portfolio.md` §10 (0 `LAUNCH-NOW`, 7 `LAUNCH-SOON`, 4 `CONDITIONAL`, 10 `NEVER`) | — |
| 13 | **Ce prețuri exacte recomanzi?** | **Parțial — contradictoriu** | `09-pricing-recommendations.md` (€9.99) vs `08-product-portfolio.md` (€1.72) vs `08-product-launch-order.md` (€4.09) | **trei răspunsuri incompatibile** (§3.6) |
| 14 | **Care e break-even-ul lunar realist?** | **Parțial — contradictoriu** | `09-unit-economics.md:365` (15 @ €9.99) vs `08-product-launch-order.md:188` (14 @ €4.09) | **două răspunsuri** (§3.7) |
| 15 | Câți clienți încap înainte de extindere? | **Acoperit** | `03-capacity-model.md` (16 instanțe/nod) | — |
| 16 | Ce canale de achiziție? | **Acoperit** | `10-marketing-strategy.md`, `10-launch-campaigns.md` | — |
| 17 | Ce promoții se pot permite? | **Acoperit** | `09-unit-economics.md` §11 (discount max = contribuția; buget 12 luni €379.25) | corect, dar condiționat de repararea lui `COMM-01` — legătura e făcută |
| 18 | Ce trebuie schimbat pe homepage/checkout? | **Acoperit** | `06-design-improvement-backlog.md`, `web/src/home/Catalog.tsx:202-213` | — |
| 19 | Ce mai trebuie panoul de admin? | **Acoperit** | `06-design-improvement-backlog.md` §3-4 (UX-04, UX-11, UX-23) | — |
| 20 | Ce trebuie înainte de beta privat? | **Acoperit** | `16:96-105` (Scenariul B), `13` §1 | — |
| 21 | Ce trebuie înainte de lansare publică? | **Acoperit** | `14-30-60-90-DAY-ROADMAP.md` | — |
| 22 | Ce poate aștepta după lansare? | **Acoperit** | `13` §3-4 (P2 18 + P3 14) | — |
| 23 | **Costul estimat al lucrării critice** | **Parțial** | `16:62` „~35 zile de lucru efectiv" | **răspunsul e în zile-om, nu în euro**, cu refuz explicit: „**nicio sumă în euro nu e estimată aici**". Principiat, dar întrebarea cere cost. Materialul există (CAC €25 în `09-unit-economics.md`) — lipsește conversia |
| 24 | **Cele mai mari riscuri comerciale în primele 6 luni** | **Lipsă ca artefact dedicat** | — | niciun fișier nu are o secțiune de registru de riscuri pe 6 luni; riscurile sunt împrăștiate (competiție, preț, capacitate, conformitate) |
| 25 | Aș aproba personal platforma? | **Acoperit** | `16-GO-NO-GO-DECISION.md` §1, §9 | — |

**Rezumat acoperire: 19/25 acoperite, 4 parțiale, 1 absentă, 0 întrebări fără niciun material în corpus.** Materialul pentru Q24 există împrăștiat (`08-competitive-analysis.md` §6.2, `09-capacity-and-revenue.md`, `11-compliance-checklist.md`), dar nu e adunat într-un registru de riscuri.

---

## 7. Supradepuneri și fabricări

### 7.1 [BILĂ CURATĂ — important] Nu am găsit cifre de concurență fabricate

`VERIFIED` — am citit pagina publică a Zentaris Host și am găsit exact ce scrie corpusul:

| Corpus (`08-competitive-analysis.md:44-49`) | Pagina publică (citită acum) |
|---|---|
| entry **€4.49/lună**, 4 GB DDR4, 2 vCPU, 25 GB SSD, Anti-DDoS, sloturi nelimitate | „Piatră … **4.49 €**/lună · 4 GB RAM DDR4 · 2 vCPU · 25 GB SSD · Sloturi nelimitate · Panou Pterodactyl · Protecție Anti-DDoS" — și `<title>Găzduire Minecraft de la 4.49 €/lună` |
| €8.99 / 8 GB / 3 vCPU / 50 GB | „Diamant … 8.99 € … 8 GB … 3 vCPU … 50 GB SSD" |
| €15.99 / 16 GB / 4 vCPU / 100 GB | „Netherite … 15.99 € … 16 GB … 4 vCPU … 100 GB SSD" |

Prețurile sunt reale, corect citite și corect atribuite concurentului. **Am verificat și convenția de TVA**, pentru că e relevantă la comparație: Zentaris scrie „Prețuri finale, **fără TVA**", Torchbyte scrie „prețurile **includ TVA 21%**" (`08-competitive-analysis.md:58`) — deci compararea €4.49 (fără TVA) cu €4.74 (cu TVA) nu e omologică. Corpusul **notează** ambele, ceea ce e onest; dar niciun rând din sinteză nu spune că pragul de „€4.74" al lui Torchbyte e echivalentul brut al unui €3.92 fără TVA.

### 7.2 [MAJOR] Clasa `VERIFIED` e atribuită unor concluzii care depind de prețuri de concurență citite de pe web

`CODE-INSPECTED` + `VERIFIED` (pagina publică).

`12-FULL-FINDINGS-REGISTER.md:275` → `PORT-03`, clasa `VERIFIED`, concluzie: „**Nu există DDoS pe traficul de joc, și nu există backup** — serviciul e cu un pas în urmă față de **fiecare concurent românesc** și față de Aternos, care e gratuit". Doar prima jumătate (`nu există DDoS, nu există backup`) e `VERIFIED` (verificabil în cod și în `.env`); a doua jumătate („față de fiecare concurent") e `DOCUMENTED-ONLY` (comparție cu pagini citite) + `INFERRED` (concluzia). Eticheta de clasă a rândului acoperă ambele jumătăți cu aceeași etichetă.

În plus, expresia „**fiecare concurent românesc**" generalizează peste 3 furnizori de Minecraft, 1 segment CS 1.6 și 5 furnizori internaționali marcați `NOT-VERIFIED` chiar în `08-competitive-analysis.md:138` („## 5. Furnizori internaționali de game hosting — `NOT-VERIFIED`"). Un rând marcat `VERIFIED` care conține „fiecare concurent" e o clasă prea puternică.

### 7.3 [MAJOR] `PORT-02` — enunț fals, prezentat ca `VERIFIED`

Vezi §2.4. Textul exact: „**Prețul actual al lui `discord-bot` (€1.72) e sub floor și sub prețul de piață (€0)**". €1.72 > €0. Propagat în `16:85` și `13:79`.

### 7.4 [MAJOR] „Nu e o problemă de UX" — concluzie mai optimistă decât sursa

Vezi §4.5.

### 7.5 [MINOR] `PROV-01` — impact formulat peste clasa de verificare

Vezi §2.9.

### 7.6 [MINOR] Citare cu fișier inexistent

`CODE-INSPECTED`. `10-seo.md:202`: „`web/index.css:15-34` definește fonturile absente". Fișierul nu există la acea cale; corect e `web/src/index.css:15-35` (cf. `06-design-system.md:67`, care citește corect `web/src/index.css:15-35`).

### 7.7 [MINOR] Un credential live e reprodus într-un livrabil

`CODE-INSPECTED`. `00-BRIEFING.md:170` conține parola unui cont de test **răspunzibil în producție**: `BM_PASSWORD="QaHeadless!2026"`. E cont de test, pe domeniu rezervat (`example.test`), și credentialul vine din briefing-ul primit — deci nu e o scurgere nouă. Dar brief-ul cere explicit „Do not include secrets, access tokens, customer-private information or credential dumps", iar parola e într-un livrabil. Recomandare: **rotați parola contului de test înainte ca corpusul să părăsească echipa de audit**, și înlocuiți cu o referință la locație.

Nu am găsit: chei Stripe live, `whsec_`, tokenuri Bearer, JWT-uri, stringuri de conexiune `postgres://user:pass@`, parole de clienți reali, sau date personale de clienți. `04-product-certification.md:171` scrie `STRIPE_SECRET_KEY=sk_…` — trunchiat, fără valoare. **Bilanț pozitiv pe acest capitol.**

---

## 8. Corecturile pe care orchestratorul trebuie să le aplice

Fiecare corectură: **fișier · linie · text înlocuit**. Nicio corecție nu presupune rescriere de conținut, doar de numere, etichete și referințe.

### 8.1 Contori și numere de P0

| # | Fișier:linie | Înlocuiește | Cu |
|---:|---|---|---|
| 1 | `12-FULL-FINDINGS-REGISTER.md:58` | `\| UX și design (\`UX-*\`) \| 12 \| 0 \| 0 \| 3 \| 5 \| 4 \|` | `\| Catalog, prețuri și consistență (\`PRICE-*\`) \| 6 \| 3 \| 0 \| 0 \| 2 \| 1 \|` |
| 2 | `12-FULL-FINDINGS-REGISTER.md:60` | `\| Creștere și marketing (\`MKT-*\`) \| 8 \| 0 \| 0 \| 1 \| 4 \| 3 \|` | `\| Portofoliu și poziție competitivă (\`PORT-*\`) \| 9 \| 5 \| 2 \| 2 \| 0 \| 0 \|` |
| 3 | `12-FULL-FINDINGS-REGISTER.md:57` | `\| Infrastructură / rețea / capacitate / DR \| 14 \| 3 \| 4 \| 3 \| 3 \| 1 \|` | `\| Infrastructură / rețea / capacitate / DR \| 21 \| 7 \| 4 \| 4 \| 4 \| 2 \|` (INF 8 + NET 4 + CAP 4 + DR 5 = 21; P0 = INF 3 + DR 4 = 7) |
| 4 | `12-FULL-FINDINGS-REGISTER.md:61` | `\| **Total** \| **115** \| **17** \| **10** \| **21** \| **39** \| **28** \|` | `\| **Total** \| **127** \| **28** \| **18** \| **33** \| **40** \| **28** \|` — *numărătoarele pe coloane să fie recalculate programatic pe cele 127 de rânduri, nu estimate; severitățile reale din coloana „Sev." sunt: Critical 18, High 33, Medium 40, Low/Info 36 (din care „P0" 11)* |
| 5 | `12-FULL-FINDINGS-REGISTER.md:63` | (textul de după tabel) | adaugă: „*Contoarele de mai sus sunt recalculate programatic pe cele 127 de rânduri ale acestui registru.*" |
| 6 | `16-GO-NO-GO-DECISION.md:4` | `(115 constatări, 17 P0)` | `(127 constatări, 28 P0)` |
| 7 | `13-PRIORITIZED-BACKLOG.md:261` | `Toate cele **17 rânduri P0** sunt închise` | `Toate cele **23 de rânduri P0** din §1 sunt închise (care acoperă cele 28 de constatări P0 din registru)` |
| 8 | `16-GO-NO-GO-DECISION.md:12` | `cu 13 condiții obligatorii, după remedierea a 9 defecte P0 și a 4 condiții de infrastructură` | `cu 13 condiții obligatorii, care închid 19 dintre cele 28 de constatări P0 din registru` |
| 9 | `16-GO-NO-GO-DECISION.md:110` | `cele 9 condiții` | `cele 13 condiții` |
| 10 | `13-PRIORITIZED-BACKLOG.md:262` | `Cele **9 condiții**` | `Cele **13 condiții**` |

### 8.2 Constatări dedublate / severități

| # | Fișier:linie | Înlocuiește | Cu |
|---:|---|---|---|
| 11 | `12-FULL-FINDINGS-REGISTER.md:161` (rândul `PROMO-01`) | rândul întreg | `\| PROMO-01 \| **P0** \| \`CODE-INSPECTED\` \| **Reduce defectul \`COMM-01\` la o singură constatare** — același mecanism, aceleași trei citări. Nu e o constatare distinctă; e o etichetă de promoție pe același bug \| Nu (este COMM-01) \| vezi \`COMM-01\` \|` |
| 12 | `12-FULL-FINDINGS-REGISTER.md:240` (rândul `PRICE-03`) | `\| PRICE-03 \| **P0** \| \`VERIFIED\` \| **Prețul afișat public nu spune unitatea** (\`price.amount = 149\` = €1.49) — convenția apare o singură dată în tot contractul \| **Da** \|` | `\| PRICE-03 \| **P0** \| \`VERIFIED\` \| **Prețul afișat public nu spune unitatea** (\`price.amount = 149\` = €1.49) — convenția apare o singură dată în tot contractul. **Același defect ca \`COMM-09\`; păstrat aici pentru că e P0, dar se numără o singură dată** \| **Da** \|` **și** `12-FULL-FINDINGS-REGISTER.md:148` → `\| COMM-09 \| Medium \|` → `\| COMM-09 \| **P0** (același defect ca \`PRICE-03\`) \|` |
| 13 | `12-FULL-FINDINGS-REGISTER.md:273` (PORT-01) | clasa `INFERRED` | `INFERRED` — **corectă, nu se schimbă** |
| 14 | `12-FULL-FINDINGS-REGISTER.md:274` (PORT-02) | `**Prețul actual al lui \`discord-bot\` (€1.72) e sub floor și sub prețul de piață (€0)**` | `**Prețul actual al lui \`discord-bot\` (€1.72) e sub pragul de acoperire al nodului (€3.40 la 1 vCPU). Pragul de cost e peste prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci botul nu poate fi produsul principal, dar prețul lui NU e sub prețul pieței**` + clasa `VERIFIED` → `DOCUMENTED-ONLY` + `INFERRED` |
| 15 | `16-GO-NO-GO-DECISION.md:85` | `**Sub floor și sub prețul de piață (€0)** — nu se vinde pe acest hardware` | `**Sub pragul de acoperire (€3.40)** — nu poate fi produsul principal pe acest hardware` |
| 16 | `13-PRIORITIZED-BACKLOG.md:79` | `\`discord-bot\` la €1.72 e sub floor **și** sub prețul de piață (€0)` | `\`discord-bot\` la €1.72 e sub pragul de acoperire (€3.40), iar pragul de cost e peste prețul de intrare de pe piață (€0 la Lunafy)` |
| 17 | `12-FULL-FINDINGS-REGISTER.md:117` | `un container care nu-și încape pe disc afectează **tot nodul**` | `poarta de capacitate a discului **nu leagă niciodată** (eroare de 1024×); un disc plin al nodului afectează toate containerele de pe el — impact \`INFERRED\`, iar defectul nu poate fi exercitat de un client cât timp plățile sunt oprite` |

### 8.3 Modelul financiar

| # | Fișier:linie | Înlocuiește | Cu |
|---:|---|---|---|
| 18 | `09-unit-economics.md:93` | `\| 4.50 \| 5.6368 \| −1.0768 \| −23.9% \| 9.6005 \|` | `\| 4.50 \| 5.6350 \| −1.1350 \| −25.2% \| 9.6005 \|` |
| 19 | `09-unit-economics.md:170` | `\| **conservator** \| 2% \| −202.73 \| −191.58 \| 11.15 \| **104.76** \| 4.19 \|` | `\| **conservator** \| 2% \| −202.73 \| −191.58 \| 11.15 \| **209.52** \| 8.38 \|` |
| 20 | `09-unit-economics.md:82` | `\| 16 \| 100% \| 3.7500 \| 9.5497 \|` | `\| 16 \| 100% \| 3.8125 \| 9.6122 \|` **și** `09-unit-economics.md:71-72` → `ALLOCATED_SERVER_COST_PER_INSTANCE = FIXED_COST_EUR_PER_MONTH / SAFE_INSTANCES_PER_NODE = 61.00 / 16 = 3.8125` |
| 21 | `09-unit-economics.md:70-72` (nota) | — | adaugă o notă: „*Costul fix pe client e \`FIXED/N\` (61.00/N), nu \`SERVER_COST/N\`: pragul \`PRICE_FLOOR\` de mai jos folosește 61.00/16.*" |
| 22 | `09-pricing-recommendations.md:15-17` | cele trei rânduri „**NU EXISTĂ**" | `\| \`audit/08-competitive-analysis.md\` \| **EXISTĂ** (scris 14:03) \| **Comparația cu piața e disponibilă**; vezi \`08-competitive-analysis.md\` §2-§4. Recomandarea de mai jos e **scrisă înaintea** acestor rapoarte și trebuie re-emapată. \|` (idem pentru celelalte două) |
| 23 | `09-pricing-recommendations.md:119` | „\`audit/08-competitive-analysis.md\` **nu există**, și în sistem nu există niciun preț de concurență. **Nu inventez prețuri de piață.**" | „\`audit/08-competitive-analysis.md\` există (citit 2026-10-23) și conține prețuri de concurență **citate, cu URL și dată**. Prețurile de piață folosite în acest document sunt cele de acolo; verificarea independentă a uneia (Zentaris €4.49 / 4 GB / 2 vCPU / 25 GB) a confirmat valoarea." |
| 24 | `16-GO-NO-GO-DECISION.md:77` | `\| Preț recomandat **€9.99/lună** pentru \`discord-bot\` la 512 MB/1 vCPU/5 GB \| Break-even la **15 clienți** ...` | `\| Preț recomandat **€9.99/lună** pentru produsul vândut, **la configurația implicită 512 MB/1 vCPU/5 GB** — cu rezerva că acest preț e derivat dintr-un model de cost (contribuție + CAC + absorbție) și **nu** din prețul de piață, iar produsul de fază 1 propus de \`08-product-launch-order.md\` este \`minecraft-paper\` la €4.09 (prag de rentabilitate 14 clienți la \`C_node\` = €54.44) \| Break-even la **15 clienți** (€149.85/lună contra unui cost fix de €61.00/lună), payback **5.97 luni**, LTV/CAC **3.35** — **la cost fix 61.00 și \`SERVER_COST\` 60.00, nu la \`C_node\` 54.44**; vezi \`09-unit-economics.md\` vs \`08-product-launch-order.md\` §7 \|` |
| 25 | `16-GO-NO-GO-DECISION.md:124` | „**Cardul de preț la €9.99** pentru produsul vândut." | „**Cardul de preț la €9.99** pentru produsul vândut — preț de *cost-cover*, nu de piață: e peste pragul de absorbție (€9.60) și peste cel de amortizare (€9.97), dar **de ~2× peste intrarea de piață documentată** (€3.99–€4.74 la 4 GB/2 vCPU). La acest preț, scenariul B rămâne LOSS-MAKING prin construcție: cu max. 10 clienți, contribuția e 10 × €4.1903 = €41.90 contra unui cost fix de €61.00, adică **−€19.10/lună**, chiar dacă tehnic funcționează." |

### 8.4 Porți, condiții și logică de decizie

| # | Fișier:linie | Înlocuiește | Cu |
|---:|---|---|---|
| 26 | `07-release-gates.md:23` | `\| 10 \| Checkoutul afișează prețuri material greșite \| 🟢 **GREEN** \|` | `\| 10 \| Checkoutul afișează prețuri material greșite \| 🟠 **AMBER** \|` + în secțiunea porții 10 adaugă: „**De ce nu e GREEN:** \`COMM-01\`/\`PROMO-01\` (P0) fac ca o comandă cu reducere să fie taxată cu suma **neredusă**; \`PRICE-03\` (P0) e ambiguul de unitate al prețului public. Mecanismul de calcul e corect, dar **totalul afișat ≠ totalul încasat**." |
| 27 | `07-release-gates.md:17` | `\| 4 \| Upgrade-urile de resurse se fac fără plată corespunzătoare \| 🟢 **GREEN** \|` | `\| 4 \| Upgrade-urile de resurse se fac fără plată corespunzătoare \| 🟠 **AMBER** \|` + notă: „**De ce nu e GREEN:** \`applyUpgradeOrder()\` nu verifică plata (\`COMM-03\`, P0) — e latent doar cât timp singurul apelant neplătit are \`total = 0\`." |
| 28 | `16-GO-NO-GO-DECISION.md:35` (rândul porții 12) | `\`PROV-04\`, \`COMM-04\`, \`COMM-05\`, \`COMM-07\`, \`COMM-08\`, \`PROV-12\`, \`OPS-03\`, \`OPS-06\`` | `\`PROV-04\`, \`PROV-06\`, \`OPS-01\`, \`OPS-03\`, \`OPS-06\`` — iar în coloana „De ce e RED": „Checkout 503; \`feature_limits\` goale (\`databases=0, backups=0, allocations=0\`) ⇒ clientul vede „fără baze de date" în loc de o eroare; e-mail neconfigurat; **canalul de suport inert** — toate cele 14 bilete au „No replies yet"; containerul nu rulează." **Plus:** rând nou pentru poarta **11** (\`COMM-04\`, \`COMM-05\`, \`COMM-07\`, \`COMM-08\`) — în §3, unde sunt enumerate „cele 5 porți RED", **poarta 11 e AMBER** și trebuie marcată ca atare, nu ascunsă sub poarta 12. |
| 29 | `16-GO-NO-GO-DECISION.md:54` (condiția 9) | `\| 9 \| Rotirea parolei de panou a clientului, cu o cale de resetare, înainte de orice rotire a \`SESSION_SECRET\`; reducerea conturilor \`root_admin\`; retenție pe transportul de e-mail în fișier \| 8 \| \`SEC-11\`, \`SEC-18\`, \`SEC-29\` \| 2 z \|` | `\| 9 \| Rotirea parolei de panou a clientului, cu o cale de resetare, înainte de orice rotire a \`SESSION_SECRET\`; reducerea conturilor \`root_admin\`; retenție pe transportul de e-mail în fișier \| 8 | \`SEC-18\` \| 2 z \|` **+** o condiție **9b** nouă: „Cheia API a agentului operatorului e scoasă din argumentele procesului (\`SEC-29\`) și secretele sunt separate pe fișiere (\`SEC-11\`) — cheie de panou per client, fără cheie globală în proces." |
| 30 | `16-GO-NO-GO-DECISION.md:60` (condiția 13) | `\| 13 \| ... \| 7, 12 \| \`OPS-04\` \| 3–4 z \|` | `\| 13 \| ... \| 7, 12 | \`OPS-04\` (P0 = „Nu", blocaj de produs) \| 3–4 z \|` |
| 31 | `16-GO-NO-GO-DECISION.md` §4 — **adăugare** | — | **Trei condiții noi**, obligatorii, înainte ca verdictul să se inverseze: **(14)** „Reducerea ajunge la Stripe: \`unit_amount\` = suma discountuită și \`verifyAmount\` compară aceeași sumă; un checkout cu cod de promoție ajunge la Stripe cu prețul redus și \`amount_total\` identic cu \`order.total\`" (închide \`COMM-01\`/\`PROMO-01\`, poarta 10); **(15)** „Prețul stocat al instanței e prețul configurației și e reconciliat cu cele 3 instanțe existente" (închide \`COMM-02\`); **(16)** „\`applyUpgradeOrder()\` refuză o comandă fără plată confirmată" (închide \`COMM-03\`). **Fără (14)-(16), cele 13 condiții de azi lasă deschise cele mai scumpe trei P0 de plată.** |
| 32 | `16-GO-NO-GO-DECISION.md:132` | „**Nu e o problemă de UX.** Interfața e într-o stare bună: 553 de verificări de browser verzi, structură semantică, navigare cu tastatura, contrast și focus vizibil." | „**Nu e o cauză de amânare, dar nici o bătaie de curat.** Cele 553 de verificări de browser verzi dovedesc **absența regresiilor**, nu absența defectelor: \`06-design-improvement-backlog.md\` ratingă 5 elemente **S1** (UX-01 \`DataTable\` strică modelul de tabel pe 9 rute; UX-02 adresă existentă ascunsă; UX-03 „Online" vs „Container: offline"; UX-04 instanță inspecționabilă de staff; UX-05 zidul de plată). Problemele de UX sunt de conținut și de onestitudine, nu de construcție." |
| 33 | `16-GO-NO-GO-DECISION.md:135` | „**Nu e o problemă de scalare.** Capacitatea sigură de 16 instanțe e suficientă pentru un start real, cu un doilea nod la 64 GiB." | „**Nu e o problemă de scalare fizică**, dar **este** una de scalare economică: la specificația de piață (2 vCPU), nodul duce 8 servere plătitori = €35.92/lună contra unui cost de nod de €54.44 (\`PORT-06\`, P0). Capacitatea sigură de 16 instanțe e suficientă **doar** la 1 vCPU." |
| 34 | `16-GO-NO-GO-DECISION.md:78` și `:86` | propoziția duplicată | șterge duplicarea de la `:86` (păstrează `:78`) |
| 35 | `07-release-gates.md:23` vs `12-FULL-FINDINGS-REGISTER.md:300` | — | **dintre cele două copii ale tabelului de porți, păstrează-le pe amândouă în acord** după corecturile 26-27 |

### 8.5 Livrabile și acoperire

| # | Acțiune |
|---:|---|
| 36 | **Creează `audit/00-EXECUTIVE-SUMMARY.md`**, cu un tabel care mapează cele 25 de întrebări la fișierul care le răspunde și la verdictul pe scurt (acoperit / parțial / contradictoriu). În special, răspunsurile la Q13 (preț) și Q14 (break-even) trebuie să indice **care** dintre cele două modele se folosește și de ce — vezi §3.6, §3.7. |
| 37 | **Creează `audit/01-backend-audit.md`** (obligatoriu în brief, absent) — backendul: model de date, tranzacții, coadă/worker, idempotență, retry, tranzacții monetare, schema API vs. implementare. Materialul există parțial în `00-architecture.md`, `05-commerce-and-billing.md` și `07-quality-assurance.md`; trebuie consolidat și completat. |
| 38 | **Creează `audit/17-NEXT-IMPLEMENTATION-PROMPT.md`** (obligatoriu în brief, absent). |
| 39 | Adaugă în `14-30-60-90-DAY-ROADMAP.md` un registru de **riscuri comerciale pe primele 6 luni** (Q24), consolidând: lipsa de DDoS + backup vs. Aternos gratuit (PORT-03), incapacitatea economică la 2 vCPU (PORT-06), necesitatea unui cost de nod cunoscut (`C_node` = `OPERATOR-INPUT`), riscul de concentrare pe un singur nod/RAID 0 (INF-01), riscul de conformitate (11-compliance-checklist.md) și riscul de concentrare pe CAC neacoperit (`09-unit-economics.md` §9). |
| 40 | În `16-GO-NO-GO-DECISION.md:62`, adaugă conversia în euro cerută de Q23: „*la o rată de {X} €/zi-om, efortul de ~35 zile = {Y} €*", cu `X` marcat `OPERATOR-INPUT` și `Y` calculat, **sau** o notă explicită că rata nu e cunoscută și rămâne `OPERATOR-INPUT`. |
| 41 | `10-seo.md:202` → `web/index.css:15-34` ⟶ `web/src/index.css:15-35` |
| 42 | `00-BRIEFING.md:170` → înlocuiește `BM_PASSWORD="QaHeadless!2026"` cu `BM_PASSWORD="<parola contului de test, din secret-store>"` și rotește parola contului de test. |
| 43 | `12-FULL-FINDINGS-REGISTER.md:275` → clasa rândului `PORT-03` din `VERIFIED` în `VERIFIED` (doar partea „nu există DDoS/backup") + `DOCUMENTED-ONLY` (comparația cu concurenții) + `INFERRED` (concluzia „cu un pas în urmă"); înlocuiește „față de **fiecare concurent românesc**" cu „față de cei **3** furnizori de Minecraft români verificați în \`08-competitive-analysis.md\` §2". |

---

## 9. Bilanț și limitele mele

**31 de erori identificate**, din care:
- **4 critice** (contoarele registrului; condițiile de inversare insuficiente; mapa constatărilor pe porți; prețul recomandat contradictoriu),
- **11 majore** (dedublare `COMM-01`/`PROMO-01`; `PRICE-03`/`COMM-09`; `PORT-02` fals; porțile 10 și 4 GREEN peste P0-uri; condiția 9; cele două costuri de nod; `€9.99` depășit; două break-even-uri; rândul 4.50; LTV@2%; alocarea 61/16; secțiunea UX; clasa `PORT-03`),
- **11 minore** (taxonomie de severitate; `PROV-01`; „Nu e o problemă de scalare"; duplicarea propoziției; `10-seo.md`; credentialul de test; cele 3 livrabile lipsă — acestea din urmă fiind totuși **blocante pentru contract**).

**Bile curate explicite** (un raport fără ele ar fi incomplet): numărătoarea porților (`5 RED · 5 AMBER · 3 GREEN`); suma efortului din §4 („~35 zile"); formula contribuției, pragurile și break-even-ul din `09-unit-economics.md`; **toate cele 57 de rânduri ale `09-break-even-model.csv`** reproduse din formula declarată; cele 949 de citări `file:line` din corpus (doar 1 cu fișier inexistent); cifrele de volum din producție (93/30 joburi, 80/5 evenimente, 14 bilete, 0 abonamente/plăți/facturi, 3 instanțe la prețuri diferite, `BM-00002` `AWAITING_PAYMENT` cu instanță `ONLINE`); **prețurile de concurență** — Zentaris €4.49/4 GB/2 vCPU/25 GB verificat independent pe pagina publică; absența secretelor și a datelor personale de clienți.

**Ce n-am putut verifica** (`UNVERIFIED` / `BLOCKED`):
- conținutul containerului live al instanței (`OPS-01`) — nodul de joc nu e accesibil din acest mediu; am verificat în schimb **DB-ul** (instanța marcată `ONLINE`) și **codul** care mapează starea (`api/src/routes/instance-server.ts`), ceea ce confirmă mecanismul, nu conținutul containerului;
- inventarul panoului („5 servere pe panou") — panoul e pe VM 100/101, inaccesibil (`BLOCKED`, identic cu `DR-05`);
- jurnalul `sshd` al hipervizorului („17 436 `Failed password`") — `BLOCKED`;
- „255/255 cote corecte" — `DOCUMENTED-ONLY`; n-am rulat suita de cotare;
- „553 de verificări de browser" — `DOCUMENTED-ONLY`; n-am rulat browserul (limita de autentificare: 10 tentative / 15 min, iar o rulare ar consuma bugetul pentru verificări mai utile);
- prețurile OVI / Torchbyte / Render / Railway / Heroku / Contabo — le-am verificat pe **una** (Zentaris); restul sunt `DOCUMENTED-ONLY` cu URL și dată, ceea ce e acceptabil, dar nu le-am reconfirmat pe toate.

**Nu am modificat niciun fișier din `audit/` în afară de acesta.** Nu am făcut nicio scriere în producție: doar `SELECT` read-only prin `docker compose … exec -T postgres psql`, doar `md5sum` pe fișiere, doar `GET` pe o pagină publică de concurent.

**Verdict final asupra sintezei: NO-GO-ul e corect ca decizie și e susținut de dovezi pe care le-am verificat eu însumi. Dar sinteza, în forma scrisă, are 4 erori critice care trebuie reparate înainte de a fi trimisă unui decident — în special contoarele (115/17 în loc de 127/28) și condițiile de inversare, care lasă neînchise exact defectele de plată care fac platforma periculoasă pentru un client real.**
