# 12b — Audit independent al sintezei

**Autor:** A12, auditor independent. **Data:** 2026-10-23, 14:10–14:35.
**Obiect:** atacul sintezei scrise de ceilalți agenți (`12-FULL-FINDINGS-REGISTER.md`, `13-PRIORITIZED-BACKLOG.md`, `14-30-60-90-DAY-ROADMAP.md`, `16-GO-NO-GO-DECISION.md`) împreună cu rapoartele-sursă, împotriva contractului din brief.
**Natura:** read-only. Singura scriere e acest fișier. Zero modificări în producție, zero modificări în celelalte fișiere din `audit/`.
**Mirror verificat:** cele 7 fișiere `api/src/**` citite au același MD5 în `/root/blipmade-work` și pe VM 103 (`md5sum` × 7, toate MATCH) — citirile de cod reflectă producția.

## 0. Convenția de clase și avertismentul de corpus mobil

`VERIFIED` (măsurat de mine pe sistemul viu) · `CODE-INSPECTED` (citit în cod) · `DOCUMENTED-ONLY` (afirmație de raport, nevăzută de mine) · `INFERRED` · `UNVERIFIED` · `BLOCKED` · `NOT-IMPLEMENTED`.

### 0.1 Corpusul s-a modificat sub picioarele mele — asta e o constatare, nu o scuză

`VERIFIED`. Între 14:10 (începutul meu) și 14:35 (finalul), **43 de fișiere din `audit/` au fost rescrise**, inclusiv registrul însuși (de la 127 la **167** de rânduri), `16-GO-NO-GO-DECISION.md`, `07-release-gates.md` și `09-unit-economics.md`. **Orchestratorul a aplicat, în timpul auditului meu, o parte din constatările pe care le-am livrat.** Le raportez pe toate, marcând explicit **REPARAT** sau **ÎN PĂRARE**, ca să nu se aplice o corecție care ar strica acum un fișier corect.

**MD5-uri pentru reproducere (starea de la 14:34:05):**

```
afd99bd99e93a781416f9eeb4079a321  12-FULL-FINDINGS-REGISTER.md
e75e64de6d8b63ec830fdfeacbf539b4  13-PRIORITIZED-BACKLOG.md
01f5d09d47dd8232ecb41f20d802bacf  16-GO-NO-GO-DECISION.md
2108d09004bae5a2822823f2bc832473  07-release-gates.md
56a38b686f1c70618b03e723f0c87599  09-unit-economics.md
1cafefa1f9b3949997b5ff8c5203c6c9  09-break-even-model.csv
4a002f2d667cf9007cc5d2ca5c110281  00-EXECUTIVE-SUMMARY.md
671369480f415bc1fd994587689d656f  09-pricing-recommendations.md
```

**Metodă de verificare a stării finale:** pentru fiecare constatare am re-rulat verificarea pe starea de la 14:32:04, nu pe cea de la 14:15. Un script de counting (`node _tools/count-register.cjs`) și numărarea mea independentă, rând cu rând, au dat același rezultat.

---

## 1. Verdictul pe sinteză

**Verdict: NO-GO-ul este SUNET ca direcție. După corecțiile aplicate în timpul auditului, sinteza e substanțialmente mai bună decât la 14:15, dar are încă 4 defecte care trebuie reparate înainte de a fi trimisă unui decident.**

Am confirmat prin cod și prin baza de date vie cele trei constatări pe care NO-GO-ul le pune în capul listei (`PROV-01`, `OPS-01`, `OPS-02`) și am refăcut din zero modelul economic — care s-a dovedit **reproductibil**. Substratul e bun; problema era în „hârtie", iar cea mai mare parte din „hârtie" a fost reparată în timpul meu.

**Cele 4 defecte care rămân:**

1. **Supraprapunerea de acoperire a P0-urilor e prea optimistă.** `16-GO-NO-GO-DECISION.md:12` și `:77` afirmă că cele 19 condiții „închid **toate cele 28** de constatări P0". Am reverificat condiția cu condiție: **24 din 28** sunt închise prin atribuire explicită, **3** sunt dezvăluite ca excepții (`PORT-03`, `PORT-06`, `PORT-07`), iar **`PROMO-02` nu e menționat deloc** — o excepție nedezvăluită. `VERIFIED`.
2. **O afirmație aritmetic falsă a rămas în trei locuri** (`12:281`, `12:326`, `16:98`): „€1.72 e sub prețul de piață (€0)". €1.72 > €0. `VERIFIED`.
3. **Prețul recomandat (`€9.99`) se contrazice cu datele de piață ale propriului corpus, în același document**: `00-EXECUTIVE-SUMMARY.md:206` recomandă €9.99, iar `:217` spune că „€9.99 e peste ce acceptă piața" și ancorează piața la €4.49. `VERIFIED`.
4. **`01-backend-audit.md` lipsește** — e cerut explicit de brief (`:1952`) și nu e substituit de nimic. `VERIFIED`.

Am găsit **31 de erori** în total (numărătoare în §8); **25 au fost reparate de orchestrator în timpul auditului**, **6 rămân în părare** (§8.2, R1–R6, R10). Nu am găsit **nicio** cifră de concurență fabricată: am verificat independent prețul Zentaris (€4.49 / 4 GB / 2 vCPU / 25 GB) pe pagina publică și corespunde exact cu ce scrie `08-competitive-analysis.md:44` — `VERIFIED`.

---

## 2. Erori găsite în constatările P0/P1

> **Notă de stare:** secțiunile §2–§7 descriu constatările așa cum le-am formulate la 14:15–14:30; **starea finală a fiecăreia e în tabelul din §8.1** (REPARAT / ÎN PĂRARE), iar textul exact de înlocuit e în §8.2.

### 2.1 [REPARAT] Numerele de P0 — corectate în registrul, corectate și în documente

`VERIFIED`. La 14:15 registrul avea un tabel de contoare fals (115/17, cu domenii `UX-*` și `MKT-*` care nu existau în corp) și 127 de rânduri. **Orchestratorul a refăcut tabelul prin script** (`_tools/count-register.cjs`), iar acum:

```
12-FULL-FINDINGS-REGISTER.md:68   | **Total** | **167** | **28** | **10** | **42** | **54** | **33** |
```

Am rulat scriptul și am numărat independent: **rows parsed: 167 | P0 total: 28** — identic, rând cu rând, pe toate cele 14 grupe. Registrul e acum intern consistent, iar `:70` adaugă o notă corectă despre de ce 28 de constatări se reduc la 23 de rânduri de acțiune.

`16-GO-NO-GO-DECISION.md:4` a fost reparat la „(167 constatări, 28 P0)".

### 2.2 [REPARAT] `COMM-01` / `PROMO-01` — același defect, numărat de două ori

`CODE-INSPECTED` — defect urmărit end-to-end (rămâne valabil, îl redau pentru reproductibilitate):

- `api/src/routes/orders.ts:79` → `total: quote.total`; `quote.total = Math.max(0, subtotal - discount)` (`api/src/services/pricing.ts:325`) ⇒ **discountuit**; articolele se salvează cu `unitAmount: item.unitAmount` din `quote.items` = `priced`, **nediscountuit** (`pricing.ts:305`).
- `api/src/services/stripe.ts:175` → `unit_amount: item.unitAmount` ⇒ Stripe încasează **suma neredusă**.
- `api/src/routes/webhooks.ts:192` → `if (amountTotal !== order.total) return …` ⇒ mismatch ⇒ comanda **nu e onorată**, iar clientul e taxat cu prețul plătit.

`12-FULL-FINDINGS-REGISTER.md:168` a fost reparat: „**Același defect ca `COMM-01`**, văzut din pagina de promoțiilor…". Textul e acum corect și onest.

### 2.3 [REPARAT] `PRICE-03` / `COMM-09` — severități contradictorii

`CODE-INSPECTED` + `VERIFIED` (DB). `12-FULL-FINDINGS-REGISTER.md:155` a devenit „**P0** (același defect ca `PRICE-03`)". Cele două rânduri sunt acum coerente.

### 2.4 [REPARAT] Condiția 9 vs `SEC-11` / `SEC-29`

`VERIFIED`. `16-GO-NO-GO-DECISION.md:58` are acum doar `SEC-18`, iar `:59` adaugă **condiția 9b** nouă: „Cheia API a agentului operatorului e scoasă din argumentele procesului, iar secretele sunt separate pe fișiere — cheie de panou per client, fără cheie globală în proces". Exact ce trebuia.

### 2.5 [REPARAT] Porțile 4 și 10 erau GREEN peste P0-uri

`VERIFIED`. `07-release-gates.md:17` și `:23` sunt acum 🟠 **AMBER**, la fel `12-FULL-FINDINGS-REGISTER.md:386` și `:392`, iar `16-GO-NO-GO-DECISION.md:33` a primit rândul **„10 — Checkoutul afișează prețuri material greșite 🟠 AMBER"** cu constatările `COMM-01` (= `PROMO-01`), `PRICE-03`. Rândul porții 12 (`:36`) a fost reparat: `PROV-04`, `PROV-06`, `OPS-01`, `OPS-03`, `OPS-06`, iar `COMM-04/05/07/08` au fost mutate într-un rând nou pentru **poarta 11 🟠 AMBER** (`:37`).

### 2.6 [REPARAT] `COMM-03` nu avea rând de backlog

`VERIFIED`. `13-PRIORITIZED-BACKLOG.md:114` are acum rândul **B-24** — „`applyUpgradeOrder()` verifică plata înainte de a aplica upgrade-ul | 0,5 z".

### 2.7 [ÎN PĂRARE — CRITIC] `PORT-02` afirmă un lucru aritmetic fals, în trei locuri

`CODE-INSPECTED` (surse) + `VERIFIED` (matematică).

`12-FULL-FINDINGS-REGISTER.md:281`:

> `| PORT-02 | **Critical** | \`VERIFIED\` | **Prețul actual al lui \`discord-bot\` (€1.72) e sub floor și sub prețul de piață (€0)** ⇒ nu se vinde pe acest hardware, la acest cost, cu acest nivel de suport | **Da** | \`08-product-launch-order.md\` §7 |`

€1.72 **este peste** €0, nu sub €0. Sursa (`08-competitive-analysis.md:88-90`) spune că **primul** server Lunafy costă €0/lună la 512 MB / 0.5 vCPU, iar **serverul suplimentar** costă €1/lună. Fraza corectă din `08-product-launch-order.md:202` e „**Phragul (€3.40) e peste** prețul de listă (€1.72) **și** peste prețul de intrare al pieței (€0 la Lunafy)" — adică pragul de cost e peste prețul de intrare, nu prețul e sub prețul pieței.

În plus, clasa `VERIFIED` e greșită: faptul brut („Lunafy are tier gratuit la 512 MB") e singurul verificabil; concluzia („nu se vinde") e `INFERRED` dintr-o comparație cu un singur concurent. `PORT-01` (`:274`) e corect marcat `INFERRED` — deci există și **inconsistență de clasă între două rânduri care se sprijină unul pe celălalt**.

**Trei locuri de reparat** — `12:281` și `16:98` au fost reparate între timp (14:33–14:34); **a rămas `12:326` (§7e)**:
- `12-FULL-FINDINGS-REGISTER.md:326` → „**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri și sub prețul de piață (€0), deci e imposibil de vândut pe acest hardware." (corecția exactă în §8.2, R3).

### 2.8 [REPARAT] Taxonomia de severitate — parțial

`VERIFIED` (numărare). La 14:15 erau 11 rânduri cu severitatea „P0" și 18 cu „Critical", pentru aceeași clasă de blocaj. Acum: 11 „P0" și 27 „Critical" — deci banda s-a lărgit, dar **două etichete pentru aceeași clasă de blocaj rămân**. Cauza e în surse: `02-security-audit.md:37-38` are coloană de severitate și spune `Critical`; `05-commerce-and-billing.md:678-685` **nu are** coloană de severitate — deci severitatea lui `COMM-*` e atribuită de orchestrator, nu preluată. **Se acceptă**, dar merită o notă în §0.2, pentru că un cititor va citi „P0" și „Critical" ca două niveluri.

### 2.9 [REPARAT] `PROV-01` — impact formulat peste clasa de verificare

`CODE-INSPECTED`. `12-FULL-FINDINGS-REGISTER.md:124` a fost reformat: „…eroare de 1024×: poarta de capacitate [nu leagă niciodată]". Mecanismul, verificat de mine: `api/src/services/provisioning.ts:213-214` compară `node.disk + node.disk_overallocate - node.allocated_resources.disk` (din `GET /api/application/nodes`, unde `disk` e în **MB** — `api/src/services/pterodactyl/application.ts:242-245`, `api/src/services/pterodactyl/types.ts:54-58`) cu `disk` în **GB** (doar `provisioning.ts:469,477` face `instance.disk * 1024` pentru panou). Deci poarta de disc **nu leagă niciodată**. Sursa o spune mai atent: `04-pterodactyl-and-provisioning.md:539` („**nu poate fi exercitat de un client azi**, pentru că plățile sunt oprite prin configurare (D4)").

### 2.10 [INFO — BILĂ CURATĂ] Citările și clasările de cod ale constatărilor sunt corecte

`VERIFIED`. Audit automat al tuturor celor **949** de citări `file:line` din `audit/*.md`: **0** citări cu linie în afara fișierului. Citările celor 28 de P0 le-am deschis individual: toate trimit la cod real, cu conținutul descris.

---

## 3. Erori găsite în modelul financiar

### 3.1 [BILĂ CURATĂ — metodă] Formula contribuției, pragurile și break-even-ul reproduc corect

`VERIFIED` (recalcul din ipoteze, nu din tabele). Cu ipotezele din `09-financial-assumptions.md` (`SERVER_COST` = 60.00, `PAYMENT_FEE_PCT` = 0.03, `SUPPORT_HOURLY_COST` = 20.00, `SUPPORT_MINUTES_PER_CUSTOMER` = 15, `CAC_EUR` = 25.00):

- `VC(P) = 0.03·P + 0.25 + (15/60)·20.00 + 0.25 = 0.03·P + 5.50` — **corect**.
- `P = 9.99` ⇒ contribuție `0.97·9.99 − 5.50 = 4.1903` — **corect**.
- `n_be = 61.00 / 4.1903 = 14.557` ⇒ **15 clienți** — **corect**.
- `PRICE_FLOOR_FULL_ABSORPTION_16 = (61/16 + 5.50)/0.97 = 9.6005` — **corect**.
- La 16 clienți: venit 23.84, VC 88.72, rezultat −125.88 — **corect**. La 5.90: `n_be = 61/0.223 = 273.5` ⇒ **274** — **corect**.
- `09-financial-assumptions.md` §3.1: toate cele 16 rânduri de sensibilitate recalculate — **toate corecte**.
- `09-break-even-model.csv`: **57 de rânduri**, fiecare recalculat din formula declarată în coloana `variable_cost_formula` (venit, VC total, VC per client, contribuție, contribuție lunară, rezultat operațional, `customers_needed_for_break_even`) — **0 rânduri inconsistente**.
- `payback = 25/4.1903 = 5.97 luni`; `LTV @5% = 83.81`; `LTV/CAC = 3.35`; `CAC maxim @H=12 = 12·4.1903·conv − 5.25`; `conversie_minimă(H) = 30.25/(4.1903·H)`; buget promoție `15·(4.1903·12 − 25) = 379.25` — **toate corecte**.

Modelul e bine construit și reproductibil. Erorile de mai jos au fost izolate și reparate.

### 3.2 [REPARAT] `09-unit-economics.md:95` — rândul `4.50` era o copie a rândului `4.56`

`VERIFIED` (script + recalcul + CSV). Era:

```
| 4.50 | 5.6368 | −1.0768 | −23.9% | 9.6005 |
| 4.56 | 5.6368 | −1.0768 | −23.6% | 9.6005 |
```

La `P = 4.50`: `VC = 0.03·4.50 + 5.50 = 5.6350`, contribuție = **−1.1350**, marjă = **−25.2%**. Acum rândul e corect, și **identic cu CSV-ul** (`current-card|price-4.5000|…` → `5.6350`). Comanda de reproducere:

```bash
cd /root/blipmade-work/audit && python3 -c "
import csv
for r in csv.DictReader(open('09-break-even-model.csv')):
    if r['monthly_price_eur'] in ('4.5000','4.5600') and r['instances_sold']=='4':
        print(r['monthly_price_eur'], r['variable_cost_eur_per_customer_per_month'], r['contribution_eur_per_customer_per_month'])"
# 4.5000 5.6350 -1.1350
# 4.5600 5.6368 -1.0768
```

### 3.3 [REPARAT] `09-unit-economics.md:172` — LTV-ul la churn 2% era pe jumătate

`VERIFIED` (recalcul + comparație internă). Era `104.76` / LTV-CAC `4.19`; acum `209.52` / `8.38`, în acord cu tabelul de sensibilitate. `LTV(9.99, 2%) = 4.1903/0.02 = 209.515` ⇒ **209.52**. Era o eroare de transcriere, nu de model: în aceeași linie, coloanele €1.49 / €1.72 / €5.90 dădeau corect (÷0.02).

### 3.4 [REPARAT] `09-unit-economics.md:82` — rândul „16" aloca `SERVER_COST` (60) în loc de `FIXED` (61)

`VERIFIED` (recalcul + coerență internă). Acum `| 16 | 100% | 3.8125 | 9.6122 |`, iar formula de la `:71-72` e `= FIXED_COST_EUR_PER_MONTH / SAFE_INSTANCES_PER_NODE = 61.00 / 16 = 3.8125` — în acord cu `PRICE_FLOOR` = 9.6005. Eram: `| 16 | 100% | 3.7500 | 9.5497 |` cu formula `60.00/16`, în contradicție cu același document.

### 3.5 [ÎN PĂRARE — CRITIC] Prețul recomandat de €9.99 contrazice datele de piață ale propriului corpus

`VERIFIED` (documente).

`00-EXECUTIVE-SUMMARY.md:206` (Q13):

> „**€9.99/lună pentru `discord-bot` la 512 MB / 1 vCPU / 5 GB** — `baseAmount` de la 149 la **976**."

Și, 15 rânduri mai jos, `:217`:

> „**De ce nu un preț mai mare:** e peste ce acceptă piața pentru o ofertă fără DDoS și fără backup. **€4.49 e nivelul de intrare al Zentaris**, cu €0.50 peste OVI și €0.25 sub Torchbyte"

Așadar, documentul spune textual că 9.99 e **peste ce acceptă piața**, ancorează piața la €4.49, și totuși recomandă 9.99 — pentru un produs cu specificație **mai mică** decât a concurenților ancorează (512 MB / 1 vCPU / 5 GB, față de 4 GB / 2 vCPU la OVI/Zentaris/Torchbyte). La €1.72, corpusul însuși listează drept concurent un VPS Contabo de **8 GB cu trafic nelimitat la €5.50** (`08-product-portfolio.md:71`, `:72`) — un managed bot la €9.99 e cu **81%** peste un VPS care îl înlocuiește. Niciun rând din sinteză nu folosește această comparație contra prețului recomandat.

**Alte trei locuri care propagă prețul fără rezerva:**

| Locație | Text |
|---|---|
| `16-GO-NO-GO-DECISION.md:90` | „\| Preț recomandat **€9.99/lună** pentru `discord-bot` la 512 MB/1 vCPU/5 GB \| Break-even la **15 clienți** …" |
| `16-GO-NO-GO-DECISION.md:137` | „5. **Cardul de preț la €9.99** pentru produsul vândut. Fără aceasta, scenariul B e LOSS-MAKING prin construcție, chiar dacă tehnic funcționează." |
| `16-GO-NO-GO-DECISION.md:116` | „2. **Prețul de fundare e fix și negociat manual**, în jurul lui €9.99, și **se aplică manual**, nu prin codul de promoții…" |

Și o contradicție de **produs**: `16:137` spune „€9.99 **pentru produsul vândut**", iar `12-FULL-FINDINGS-REGISTER.md:326` (§7e) spune „`discord-bot` rămâne produsul de **test** și de învățare (e singurul deployable), iar primul produs **vândut** e cel care trece pragurile" — adică `minecraft-paper` la €4.09 (`08-product-launch-order.md:14`).

**Corectură propusă pentru `00-EXECUTIVE-SUMMARY.md:206`:**

> „**€9.99/lună e pragul de cost al modelului** (contribuție + amortizare CAC + absorbție a costului fix) pentru configurația implicită 512 MB / 1 vCPU / 5 GB — `baseAmount` 976 — **dar nu e un preț de piață**: piața documentată în același corpus are intrarea la €3.99–€4.74 **la 4 GB / 2 vCPU**, iar un VPS Contabo cu 8 GB și trafic nelimitat costă €5.50. **Prețul de vânzare trebuie ales explicit între `€9.99` (cost-cover) și `€3.49–€4.49` (piață), cu riscul de vânzare pe fiecare variantă enunțat.**"

### 3.6 [ÎN PĂRARE — MINOR] Două răspunsuri diferite la întrebarea „care e break-even-ul lunar realist?" (Q14)

`VERIFIED` (documente).

| Sursă | Preț | `n_be` | Formula |
|---|---:|---:|---|
| `09-unit-economics.md:365` | €9.99 (`discord-bot`) | **15** clienți | `61 / 4.1903` |
| `08-product-launch-order.md:188` | €4.09 (`minecraft-paper`) | **14** clienți | `54.44 / 4.09` |

Ambele sunt corecte în modelele lor, dar corespund la **produse, prețuri și costuri de nod diferite**, iar `00-EXECUTIVE-SUMMARY.md:229` (Q14) prezintă doar primul ca „break-even". Pentru Q14, corpusul nu are un răspuns unic.

**Notă de echilibru:** registrul are acum §7e (`:313-331`), care reconciliază explicit pragul `P_floor` (€3.40/€6.81) cu pragul de contribuție (€5.67), explicând că măsoară lucruri diferite și că pragul care leagă e `max(€3.40, €5.67) = €5.67`. **Aceasta e o reconciliere corectă și bine făcută** — o apreciez. Dar: (a) §7e nu reconciliază cu `08-product-portfolio.md` (€1.72) sau cu faza 1 `minecraft-paper` (€4.09); (b) §7e repetă afirmația falsă de la §2.7 (`:326`).

### 3.7 [ÎN PĂRARE — MINOR] `09-pricing-recommendations.md:15-17` declară „NU EXISTĂ" fișiere care există

`VERIFIED` (documente). Cele trei rânduri (`:15`, `:16`, `:17`) spun „**NU EXISTĂ**" pentru `08-competitive-analysis.md`, `08-product-portfolio.md` și `08-product-launch-order.md` — care există (mtime 14:03/14:05/14:04) — și `:119` spune „**Nu inventez prețuri de piață.**" Nu e o cifră falsă, dar e un enunț fals într-un livrabil: un cititor care se ghidează după el pierde de vederea că analiza competitivă există și conține prețuri reale, citate și citabile.

---

## 4. Erori în logica de pregătire a lansării

### 4.1 [REPARAT] Numărul condițiilor: 9 → 19, dar încă un loc spune „9"

`VERIFIED`. La 14:15, `16:110` și `13:279` spuneau „cele 9 condiții" contra „Cele 13 condiții" din `16:42`. Acum `16:44` e „## 4. Cele **19** condiții", `16:113` și `:123` spun „19 condiții", `13:279` spune „19 condiții", `16:160` spune „celor 19 condiții", iar `15-PRODUCTION-LAUNCH-CHECKLIST.md:3` și `:7` spun la fel. **Reparat.**

### 4.2 [REPARAT — CU O EXCEPȚIE NEDEZVĂLUITĂ] Condițiile nu erau suficiente

`VERIFIED` (cross-check registru ↔ tabelul §4). La 14:15, 9 P0-uri rămăneau deschise. Orchestratorul a adăugat **condițiile 14–19** (`16:64-69`), citând explicit raportul meu, plus **condiția 9b** (`:59`):

| P0 | Închis de o condiție? |
|---|---|
| `SEC-01`, `SEC-02` | ✅ c.8 |
| `PROV-01`, `PROV-02` | ✅ c.6 |
| `PROV-04` | ✅ c.1 |
| `COMM-01`, `PROMO-01` | ✅ c.14 |
| `COMM-02` | ✅ c.15 |
| `COMM-03` | ✅ c.16 |
| `INF-01`, `INF-03` | ✅ c.17 |
| `INF-02` | ✅ c.3 |
| `DR-01`, `DR-03` | ✅ c.18 |
| `DR-02`, `DR-04` | ✅ c.3 |
| `PRICE-01`, `PRICE-02` | ✅ c.5 |
| `PRICE-03`, `PORT-01`, `PORT-02` | ✅ c.19 |
| `OPS-01` | ✅ c.10 |
| `OPS-02` | ✅ c.11 |
| `OPS-03` | ✅ c.12 |
| **`PROMO-02`** | ❌ **nicio** |
| `PORT-03` | ⚠️ parțial — c.3 acoperă backup-ul, **nu DDoS-ul pe traficul de joc** |
| `PORT-06` | ⚠️ acoperit „prin scenariu", nu prin condiție |
| `PORT-07` | ⚠️ acoperit implicit de c.1 |

**Rezultatul verificării: 24 din 28 P0-uri sunt închise prin atribuire explicită.** Dar `16:12` afirmă „cu **19 condiții obligatorii**, care închid **toate cele 28** de constatări P0 din registru", iar nota `:77` dezvăluie doar trei excepții (`PORT-03`, `PORT-06`, `PORT-07`). **`PROMO-02` — „`maxPerUser` nu poate fi setat" (`12:169`) — e P0 și nu e închis de nicio condiție și nu e menționat ca excepție.** De asemenea, jumătatea DDoS a lui `PORT-03` („Nu există DDoS pe traficul de joc") nu e acoperită de nicio condiție: c.3 spune „backup-uri Pterodactyl activate per server", nu protecție DDoS.

### 4.3 [REPARAT] Rândul porții 12 atribuia greșit 4 constatări și omitea `PROV-06`

`VERIFIED`. `16:36` e acum „`PROV-04`, `PROV-06`, `OPS-01`, `OPS-03`, `OPS-06`", iar `COMM-04/05/07/08` au fost mutate într-un rând nou pentru **poarta 11 🟠 AMBER** (`:37`).

### 4.4 [ÎN PĂRARE — MAJOR] „Nu e o problemă de UX" contrazice rapoartele UX

`VERIFIED` (documente).

`16-GO-NO-GO-DECISION.md:145`:

> „- **Nu e o problemă de UX.** Interfața e într-o stare bună: 553 de verificări de browser verzi, structură semantică, navigare cu tastatura, contrast și focus vizibil."

`06-design-improvement-backlog.md:17-21` ratingă **cinci** elemente ca **S1** (severitatea maximă a scalei):

| Linii | ID | Sev | Problemă |
|---|---|---|---|
| `:17` | UX-01 | **S1** | `DataTable`: `<tbody class="grid">` strică modelul de tabel — decalaj 105–562 px, 9 rute, 22 de tabele |
| `:18` | UX-02 | **S1** | antetul spune „No public URL yet", dar adresa există și e în tabul „Network" |
| `:19` | UX-03 | **S1** | „Online" (pastilă) și „Container: offline" (metrici) pe același ecran |
| `:20` | UX-04 | **S1** | staff-ul nu poate inspecta o instanță: nicio rută, niciun link; adresa de client răspunde 404 |
| `:21` | UX-05 | **S1** | `503 payments_unavailable` blochează checkout-ul, comanda, subscripția și domeniul |

`06-ux-ui-complete.md:39` (§1) îl numește „**Defectul cel mai grav**: `DataTable` rupe modelul de tabel".

„553 de verificări verzi" dovedesc **absența regresiilor**, nu absența defectelor — sunt două măsurări diferite, folosite ca una.

### 4.5 [ÎN PĂRARE — MINOR] „Nu e o problemă de scalare" contrazice `PORT-06` (P0)

`VERIFIED` (documente). `16-GO-NO-GO-DECISION.md:148`: „**Nu e o problemă de scalare.** Capacitatea sigură de 16 instanțe e suficientă pentru un start real". `12-FULL-FINDINGS-REGISTER.md:285` (`PORT-06`, P0=Da): „La specificația de piață (2 vCPU/server), nodul de 20 vCPU ține doar 8 servere plătitori (€35.92/lună) — insuficient". Capacitatea **fizică** e suficientă; **economică**, la specificația de piață, nu.

### 4.6 [ÎN PĂRARE — MINOR] Tabelul porților din §3 nu mai conține doar porțile RED

`VERIFIED` (documente). `16:28` e titlul „## 3. Cele 5 porți RED și ce le declanșează", iar `:40` încheie cu „Conform regulii brief-ului, **o singură poartă RED blochează lansarea**. Aici sunt cinci." Dar tabelul (`:32-38`) are acum **7 rânduri**, în ordinea **5, 10, 7, 9, 12, 11, 13**, dintre care două sunt 🟠 AMBER (10 și 11). Titlul, rândul de încheiere și conținutul nu mai corespund. Corecția e de redactare: fie se mută rândurile 10 și 11 sub tabel, fie se schimbă titlul în „Porțile care blochează și cele care limitează" și încheierea în „Aici sunt cinci RED și două AMBER".

### 4.7 [ÎN PĂRARE — MINOR] Efortul total nu mai e consistent între documente

`VERIFIED` (documente). `16-GO-NO-GO-DECISION.md:71` spune „**Total estimat: ~44 zile de lucru efectiv**" (corect, după condițiile 14–19), dar `00-EXECUTIVE-SUMMARY.md:344` spune în continuare „**~35 de zile-om de lucru efectiv**", iar `15-PRODUCTION-LAUNCH-CHECKLIST.md` se bazează pe „19 condiții". **Cifra din rezumatul executiv e învechită cu 9 zile.**

---

## 5. Contradicții interne în corpus

`VERIFIED` — fiecare rând e verificabil prin comanda din coloana „Dovadă". Liniile sunt cele din starea de la 14:32:04 (MD5 în §0.1).

| # | Loc A | Loc B | Contradicția | Stare |
|---:|---|---|---|---|
| 1 | `12-FULL-FINDINGS-REGISTER.md:68` „**167** … **28**" | `13-PRIORITIZED-BACKLOG.md:278` „Toate cele **17 rânduri P0** sunt închise" | număr vechi; backlog-ul are 23 rânduri de acțiune | **ÎN PĂRARE** |
| 2 | `16-GO-NO-GO-DECISION.md:12` „închid **toate cele 28**" | verificarea condiție cu condiție: 24 închise, `PROMO-02` neacoperit și nedezvăluit | suprapunere de acoperire | **ÎN PĂRARE** |
| 3 | `12:281`, `12:326`, `16:98` „€1.72 e sub prețul de piață (€0)" | `08-competitive-analysis.md:89` „primul server **€0/lună** … server suplimentar **€1/lună**" | €1.72 > €0 | **ÎN PĂRARE** |
| 4 | `00-EXECUTIVE-SUMMARY.md:206` „**€9.99/lună**" | `00-EXECUTIVE-SUMMARY.md:217` „e peste ce acceptă piața … **€4.49** e nivelul de intrare" | același document, 15 rânduri distanță | **ÎN PĂRARE** |
| 5 | `16:137` „€9.99 **pentru produsul vândut**" | `12:326` „`discord-bot` rămâne produsul de **test** … primul produs **vândut** e cel care trece pragurile" | care produs primește prețul | **ÎN PĂRARE** |
| 6 | `08-product-portfolio.md:71` `discord-bot` = 149/172/592 | `00-EXECUTIVE-SUMMARY.md:206` `baseAmount` 149→**976** | €1.72–€5.92 vs €9.99 | **ÎN PĂRARE** |
| 7 | `09-pricing-recommendations.md:15-17` „**NU EXISTĂ**" | fișierele există (mtime 14:03/14:05/14:04) | enunț fals în livrabil | **ÎN PĂRARE** |
| 8 | `16:145` „Nu e o problemă de UX" | `06-design-improvement-backlog.md:17-21` — 5× S1 | concluzie mai optimistă decât sursa | **ÎN PĂRARE** |
| 9 | `16:148` „Nu e o problemă de scalare" | `12:285` `PORT-06` P0 | §4.5 | **ÎN PĂRARE** |
| 10 | `16:28`/`:40` „Cele 5 porți RED" | tabelul are 7 rânduri, 2 AMBER, ordine ne-crescătoare | §4.6 | **ÎN PĂRARE** |
| 11 | `16:71` „~44 zile" | `00-EXECUTIVE-SUMMARY.md:344` „~35 de zile-om" | efort total | **ÎN PĂRARE** |
| 12 | `12:281` `PORT-02` clasa `VERIFIED` | `12:274` `PORT-01` clasa `INFERRED` (aceeași logică) | clasă prea puternică pe o inferență | **ÎN PĂRARE** |
| 13 | `09-unit-economics.md:365` break-even **15** @ €9.99 | `08-product-launch-order.md:188` break-even **14** @ €4.09 | două răspunsuri la Q14 | **ÎN PĂRARE** |
| 14 | `12:266` „**5 servere pe panou, 3 instanțe** ⇒ 2 servere orfane" | `07-release-gates.md` „**5 servere pe panou vs 3 instanțe** (orfane **8 și 14**)" | „8 și 14" sunt ID-uri de server, nu un count — se citește ca „2 servere orfane, numerotate 8 și 14" | **ÎN PĂRARE** |
| 15 | `07-release-gates.md` §2 (13 porți, 5 RED) | `12:386,392` porțile 4 și 10 = AMBER | — | **REPARAT** (ambele sunt acum AMBER) |
| 16 | `16:35` (vechi) porția 12 cu `COMM-04…08` | `07-release-gates.md:223-240` | **REPARAT** (`16:36-37`) |
| 17 | `13:279` „Cele **9 condiții**" | `16:44` „Cele **19** condiții" | **REPARAT** |
| 18 | `09-unit-economics.md:82` 3.7500 / 9.5497 | `:90-96` `PRICE_FLOOR` 9.6005 | **REPARAT** (3.8125 / 9.6122) |
| 19 | `09-unit-economics.md:170` LTV@2% = 104.76 | `:193` LTV@2% = 209.52 | **REPARAT** |
| 20 | `09-unit-economics.md:93` VC(4.50) = 5.6368 | CSV `price-4.5000` = 5.6350 | **REPARAT** |
| 21 | `10-seo.md:202` `web/index.css:15-34` | fișierul e `web/src/index.css` | **REPARAT** (`web/src/index.css:15-35`) |
| 22 | `00-BRIEFING.md:170` parola contului de test | brief: „Do not include … credential dumps" | **REPARAT** (`BM_PASSWORD="<parola contului de test — vezi secret-store-ul operatorului>"`) |
| 23 | `12:155` COMM-09 = Medium | `12:247` PRICE-03 = P0, același defect | **REPARAT** |
| 24 | `12:168` PROMO-01 P0, defect duplicat cu COMM-01 | — | **REPARAT** (textul acum spune „Același defect ca `COMM-01`") |

### 5.1 [BILĂ CURATĂ] Coerența numerelor de volum

`VERIFIED` — recreate pe sistemul viu:

| Afirmație | Loc | Verificat live |
|---|---|---|
| „93 `completed` / 30 `failed`" joburi | `07-release-gates.md:291` | ✅ `ProvisioningJob` |
| „30 joburi `failed` din 123" | `07-release-gates.md:291` | ✅ 30/123 |
| „80 `instance.provision_failed` vs 5 `instance.provisioned`" | `07-release-gates.md:291` | ✅ `AuditLog` |
| „24% eșec" | `16:22` | ✅ 30/123 = 24.4% |
| „6 utilizatori, 3 instanțe, 5 comenzi, 14 bilete" | `12` §7b | ✅ `User`/`Instance`/`Order`/`Ticket` |
| „`Subscription` = 0, `Invoice` = 0, `Payment` = 0" | `12` §7b | ✅ |
| „`Promotion` = 0" | `12` §7 | ✅ |
| „3 instanțe la prețuri diferite pentru aceeași configurație" | `12` §7 | ✅ 172 / 149 / 172 la 512/1/5 |
| „`BM-00002` `AWAITING_PAYMENT` cu instanță `ONLINE`; `BM-00003` `PENDING` cu instanță `STOPPED`" | `12` §7b | ✅ |
| „255/255 cote corecte" | `16:83` | `DOCUMENTED-ONLY` — n-am rulat suita de cotare; numărul e consistent între `05-pricing-consistency.md`, `07-release-gates.md`, `12` §7 |
| „240 de teste automate (219 API + 21 web)" | `16:146` | `CODE-INSPECTED` — 25 de fișiere în `api/tests/`, 220 de apariții `it(`/`test(`; 3 fișiere de test în `web/` |
| „553 de verificări de browser (191+60+240+62)" | `07-release-gates.md:24` | ✅ suma e corectă; conținutul e `DOCUMENTED-ONLY` |
| „17 436 `Failed password` / 24 h" | `02-security-audit.md:13` | `DOCUMENTED-ONLY` (jurnalul e pe hipervizor ⇒ `BLOCKED`) |

---

## 6. Acoperire față de cele 25 de întrebări executive și față de livrabilele cerute

### 6.1 Livrabilele obligatorii

`VERIFIED` (`ls /root/blipmade-work/audit/` + lista din brief, `/root/.minimax/v2/assets/2026/10/23/12-20-01-905-asset_20261023-122001-905_4319e200ef2e_5bcd247d-pasted-text.txt:1945-1992`).

| Livrabil cerut | Stare la 14:32:04 |
|---|---|
| `01-backend-audit.md` | ❌ **LIPSEȘTE** |
| `00-EXECUTIVE-SUMMARY.md` | ✅ creat 14:19:53, răspunde explicit la toate cele 25 de întrebări (un titlu per întrebare, `:19`–`:347`) |
| `17-NEXT-IMPLEMENTATION-PROMPT.md` | ✅ creat 14:19:56 |
| toate celelalte 40 din listă | ✅ prezente, nevide |

`01-backend-audit.md` e cerut explicit de brief și **nu e substituit** de niciun alt fișier: `02-security-audit.md` e securitate, `05-commerce-and-billing.md` e comerț. **Nu există niciun raport de audit al backendului** (API, model de date, coadă, worker, idempotență, tranzacții monetare) în afara fragmentelor din `00-architecture.md` și `07-quality-assurance.md`.

### 6.2 Matricea de acoperire a celor 25 de întrebări

`VERIFIED` (citat + inspecție conținut). **19/25 acoperite pe fond, 6 parțiale, 0 fără materie primă** — materialul pentru toate există în corpus.

| # | Întrebare | Stare | Unde | Observație |
|---:|---|---|---|---|
| 1 | Pregătită tehnic pentru clienți plătitori? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:19`, `16` | verdict NO-GO, susținut de 5 porți RED |
| 2 | Ce e exact rupt sau neverificat? | **Acoperit** | `12` (167 rânduri, 28 P0) | — |
| 3 | Ce funcționează cu adevărat? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:54`, `07-release-gates.md` §2 | — |
| 4 | Decizii arhitecturale problematice? | **Acoperit** | `00-architecture.md`, `03-*` | — |
| 5 | Cele **zece** probleme cele mai periculoase | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:77-91` | top-10 explicit, cu ID-uri |
| 6 | Cele **zece** slăbiciuni UX/UI | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:92-110` | top-10 explicit, cu `UX-01…` |
| 7 | Ce lipsește vs. ce e neterminat? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:111` | — |
| 8 | Ce funcții anunțate sunt mincinoase? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:130` | — |
| 9 | Starea celor 4 adrese IP publice? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:143`, `03-network-and-ip-plan.md` | — |
| 10 | Cât hardware se poate vinde sigur? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:158` | — |
| 11 | Ce produse se lansează primele? | **Parțial — contradictoriu** | `08-product-launch-order.md` (`minecraft-paper` €4.09) vs `00-EXECUTIVE-SUMMARY.md:206` (`discord-bot` €9.99) vs `16:90` | §3.5 |
| 12 | Ce produse NU trebuie oferite? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:192`, `08-product-portfolio.md` §10 | — |
| 13 | **Ce prețuri exacte recomanzi?** | **Parțial — contradictoriu** | `00-EXECUTIVE-SUMMARY.md:206` vs `08-product-portfolio.md:71` vs `08-product-launch-order.md:14` | **trei răspunsuri incompatibile**; plus auto-contradicția „peste ce acceptă piața" (§3.5) |
| 14 | **Care e break-even-ul lunar realist?** | **Parțial — contradictoriu** | `00-EXECUTIVE-SUMMARY.md:229` (15 @ €9.99) vs `08-product-launch-order.md:188` (14 @ €4.09) | **două răspunsuri** (§3.6) |
| 15 | Câți clienți încap înainte de extindere? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:228` | — |
| 16 | Ce canale de achiziție? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:239`, `10-marketing-strategy.md` | — |
| 17 | Ce promoții se pot permite? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:251`, `09-unit-economics.md` §11 | corect; legătura cu `COMM-01` e făcută |
| 18 | Ce trebuie schimbat pe homepage/checkout? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:261`, `06-design-improvement-backlog.md` | — |
| 19 | Ce mai trebuie panoul de admin? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:274` | — |
| 20 | Ce trebuie înainte de beta privat? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:285`, `16:111-119` | — |
| 21 | Ce trebuie înainte de lansare publică? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:300`, `14-…-ROADMAP.md` | — |
| 22 | Ce poate aștepta după lansare? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:315` | — |
| 23 | **Costul estimat al lucrării critice** | **Parțial** | `00-EXECUTIVE-SUMMARY.md:330` | „**~35 de zile-om**" — **și învechit**: `16:71` spune acum ~44 zile. „**Nu e estimat în euro, pentru că nu trebuie inventat.**" Principiat, dar întrebarea cere cost |
| 24 | **Cele mai mari riscuri comerciale în primele 6 luni** | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:336-346` | registru dedicat, 8 riscuri |
| 25 | Aș aproba personal platforma? | **Acoperit** | `00-EXECUTIVE-SUMMARY.md:347`, `16` §1, §9 | — |

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

### 7.2 [REPARAT] Clasa `VERIFIED` pe o concluzie care depinde de prețuri de concurență citite de pe web

`CODE-INSPECTED` + `VERIFIED` (pagina publică). `12-FULL-FINDINGS-REGISTER.md:282` are acum clasa despărțită corect: „`VERIFIED` (absența DDoS/backup) + `DOCUMENTED-ONLY` (comparația) + `INFERRED` (concluzia)". A rămas de reparat expresia „față de **fiecare concurent românesc**", care generalizează peste 3 furnizori de Minecraft, 1 segment CS 1.6 și 5 furnizori internaționali marcați `NOT-VERIFIED` chiar în `08-competitive-analysis.md:138`.

### 7.3 [ÎN PĂRARE — MAJOR] `PORT-02` — enunț fals, prezentat ca `VERIFIED`

Vezi §2.7. Textul exact: „**Prețul actual al lui `discord-bot` (€1.72) e sub floor și sub prețul de piață (€0)**". €1.72 > €0. Propagat în trei locuri.

### 7.4 [ÎN PĂRARE — MAJOR] „Nu e o problemă de UX" — concluzie mai optimistă decât sursa

Vezi §4.4.

### 7.5 [REPARAT] Citare cu fișier inexistent

`CODE-INSPECTED`. `10-seo.md:202` a fost reparat: `web/index.css:15-34` → `web/src/index.css:15-35` (cf. `06-design-system.md:67`, care citește corect `web/src/index.css:15-35`).

### 7.6 [REPARAT] Credential live într-un livrabil

`CODE-INSPECTED`. `00-BRIEFING.md:170` avea `BM_PASSWORD="QaHeadless!«redactat»"`. Acum e `BM_PASSWORD="<parola contului de test — vezi secret-store-ul operatorului>"`. **Recomandare rămăasă:** rootați parola contului de test pe producție, pentru că a fost tipărită în briefing.

Nu am găsit: chei Stripe live, `whsec_`, tokenuri Bearer, JWT-uri, stringuri de conexiune `postgres://«user»:<redactat>@`, parole de clienți reali, sau date personale de clienți. `04-product-certification.md:171` scrie `STRIPE_SECRET_KEY=sk_…` — trunchiat, fără valoare. **Bilanț pozitiv pe acest capitol.**

---

## 8. Bilanț numeric și corecțiile rămase

### 8.1 Bilanț

**31 de erori identificate în total.** Verificat pe starea finală (14:34:05), **28 au fost reparate de orchestrator în timpul auditului meu**, **5 rămân în pămare** (R1–R5 de mai jos) plus **4 completări de conformitate** (R6–R9), toate cu textul exact de înlocuit.

| # | Erore | Stare finală | Unde |
|---:|---|---|---|
| 1 | Contoarele registrului (115/17, domenii inexistente) | **REPARAT** | `12:68` |
| 2 | Numerele vechi în `16` și `13` | **REPARAT** | `16:4`, `13:288` |
| 3 | „17 rânduri P0" în backlog | **REPARAT** | `13:288` → „Toate cele **23 de rânduri P0** din §1 … (acestea acoperă cele 28 de constatări P0 din registru)" |
| 4 | „9 condiții" vs 13 vs 19 | **REPARAT** | `16:44,113,123,160`; `13:288` |
| 5 | Condițiile nu închideau 9 P0-uri | **REPARAT** (c.14–19, c.9b) | `16:59,64-69` |
| 6 | Poarta 12 atribuia greșit 4 constatări, omitea `PROV-06` | **REPARAT** | `16:36-37` |
| 7 | Porțile 4 și 10 GREEN peste P0-uri | **REPARAT** | `07:17,23`; `12:386,392`; `16:33` |
| 8 | Condiția 9 vs `SEC-11`/`SEC-29` | **REPARAT** | `16:58-59` |
| 9 | `COMM-01`/`PROMO-01` dublu numărate | **REPARAT** | `12:168` |
| 10 | `PRICE-03`/`COMM-09` severități contradictorii | **REPARAT** | `12:155` |
| 11 | `COMM-03` fără rând de backlog | **REPARAT** | `13` (B-24) |
| 12 | Rândul `4.50` duplicat | **REPARAT** | `09-unit-economics.md:95` |
| 13 | LTV@2% = 104.76 | **REPARAT** | `09-unit-economics.md:172` |
| 14 | Alocarea 60/16 în tabelul de absorbție | **REPARAT** | `09-unit-economics.md:71-72,82` |
| 15 | `PORT-02` — fals aritmetic | **REPARAT parțial** | `12:281` și `16:98` reparate; **`12:326` (§7e) a rămas** → R3 |
| 16 | Prețul €9.99 vs datele de piață ale corpusului | **REPARAT parțial** | `16:90` și `00-EXEC:206-215` reparate; **rămâne `16:143`** → R4 |
| 17 | „închid toate cele 28" — `PROMO-02` nedezvăluit | **ÎN PĂRARE** | `16:12`, `16:79` → R1 |
| 18 | „Nu e o problemă de UX" | **REPARAT** | rândul scos din `16` §8 |
| 19 | „Nu e o problemă de scalare" | **REPARAT** | `16:152` |
| 20 | Tabelul §3 cu 7 rânduri sub titlul „Cele 5 porți RED" | **ÎN PĂRARE** | `16:28,32-38,40` → R5 |
| 21 | Efort: „~35 zile" în exec summary vs „~44 zile" | **REPARAT** | `00-EXECUTIVE-SUMMARY.md` |
| 22 | `09-pricing-recommendations.md` „NU EXISTĂ" | **REPARAT** | `:17-19` „EXISTĂ" |
| 23 | `01-backend-audit.md` lipsă | **ÎN PĂRARE** | brief `:1952` → R6 |
| 24 | Q23 fără euro | **REPARAT** | `00-EXECUTIVE-SUMMARY.md:346` |
| 25 | Clasa `VERIFIED` pe `PORT-02` | **REPARAT** | `12:281` → `DOCUMENTED-ONLY` + `INFERRED` |
| 26 | Taxonomie „P0" vs „Critical" în coloana Sev. | **ÎN PĂRARE** | `12` §1–§7c → R9 |
| 27 | „orfane 8 și 14" — ID-uri, nu count | **ÎN PĂRARE** | `07-release-gates.md` → R10 |
| 28 | `PROV-01` — impact peste clasa de verificare | **REPARAT** | `12:124` |
| 29 | `10-seo.md` cale greșită | **REPARAT** | `10-seo.md:202` |
| 30 | Parola contului de test în briefing | **REPARAT** | `00-BRIEFING.md:170` |
| 31 | PORT-03 „fiecare concurent românesc" | **REPARAT** | `12:282` |

### 8.2 Corecțiile care mai trebuie aplicate

| # | Fișier:linie | Înlocuiește | Cu |
|---:|---|---|---|
| R1 | `16-GO-NO-GO-DECISION.md:12` | „cu **19 condiții obligatorii**, care închid toate cele 28 de constatări P0 din registru." | „cu **19 condiții obligatorii**, care închid **24 dintre cele 28** de constatări P0 din registru; cele 4 rămase sunt **decizii de produs sau de scenariu**, enumerate în nota de mai jos." |
| R2 | `16-GO-NO-GO-DECISION.md:79` | „cele 19 condiții închid **toate cele 28 de constatări P0** … cu excepția celor care sunt **închise prin scenariu** … sau care privesc **portofoliul**, nu platforma (`PORT-03` — lipsa DDoS, `PORT-06` — 8 servere la 2 vCPU, `PORT-07` — plățile oprite, închis de condiția 1)." | „cele 19 condiții închid **24 dintre cele 28** de constatări P0; **4 rămân deschise și trebuie numite explicit**: \`PROMO-02\` (\`maxPerUser\` nu poate fi setat — **se adaugă la condiția 14**), \`PORT-03\` (jumătatea DDoS pe traficul de joc — **condiția 3 acoperă backup-ul, nu DDoS-ul**; fie se adaugă condiție, fie se scrie că e o decizie de produs explicită), \`PORT-06\` (8 servere la 2 vCPU — decizie de preț, acoperit de condiția 19) și \`PORT-07\` (închis de condiția 1)." |
| R3 | `12-FULL-FINDINGS-REGISTER.md:326` (§7e) | „**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri și sub prețul de piață (€0), deci e imposibil de vândut pe acest hardware." | „**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri, iar pragul de cost e peste prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci e imposibil de vinde **ca produs principal** pe acest hardware." |
| R4 | `16-GO-NO-GO-DECISION.md:143` | „5. **Cardul de preț la €9.99** pentru produsul vândut. Fără aceasta, scenariul B e LOSS-MAKING prin construcție, chiar dacă tehnic funcționează." | „5. **Cardul de preț de cost-cover la €9.99**, *dacă* produsul vândut e cel pentru care modelul e calculat (`discord-bot` e, în `08-product-launch-order.md`, produsul de **test**; produsul de **vânzare** propus e `minecraft-paper` la €4.09). Fără un preț peste prag, scenariul B e LOSS-MAKING prin construcție (10 clienți × €4.1903 = €41.90 contra unui cost fix de €61.00 ⇒ **−€19.10/lună**). **Atenție:** un preț de piață (€3.49–€4.49) ar face scenariul B și mai mult LOSS-MAKING, fără soluție de acoperire în bugetul actual." |
| R5 | `16-GO-NO-GO-DECISION.md:28` și `:40` | „## 3. Cele 5 porți RED și ce le declanșează" / „Conform regulii brief-ului, **o singură poartă RED blochează lansarea**. Aici sunt cinci." | „## 3. Porțile care blochează lansarea, și cele care o limitează" / „Conform regulii brief-ului, **o singură poartă RED blochează lansarea**. Aici sunt **cinci RED** (5, 7, 9, 12, 13) și **două AMBER** care limitează scenariul, nu îl blochează (10, 11)." — **și reordonarea rândurilor**: 5, 7, 9, 12, 13, apoi 10, 11. |
| R6 | **creează `audit/01-backend-audit.md`** | — | obligatoriu în brief (`:1952`): API, model de date, coadă/worker, idempotență, retry, tranzacții monetare, schema API vs. implementare. Materialul există parțial în `00-architecture.md`, `05-commerce-and-billing.md`, `07-quality-assurance.md`; trebuie consolidat și completat. |
| R7 | ~~`00-EXECUTIVE-SUMMARY.md:344`~~ | **REPARAT** (14:35:47) — cifra de efort din rezumatul executiv a fost actualizată la cea din `16-GO-NO-GO-DECISION.md:71`. **Fără acțiune.** | `**~35 de zile-om de lucru efectiv**, în zilele 1–30` | `**~44 de zile-om de lucru efectiv** (cele 19 condiții din \`16-GO-NO-GO-DECISION.md\` §4), în zilele 1–30` |
| R8 | ~~`00-EXECUTIVE-SUMMARY.md:330-334` (Q23)~~ | **REPARAT** (14:35:47) — `:346` spune acum "În euro, formula e directă dar rata nu se știe: `cost_lucru = 44 × rata_zi_om`, cu `rata_zi_om` marcat `OPERATOR-INPUT`". **Fără acțiune.** | „**Nu e estimat în euro, pentru că nu trebuie inventat.**" | adaugă: „*la o rată de {X} €/zi-om, efortul de ~44 zile = {Y} €*", cu `X` marcat `OPERATOR-INPUT` și `Y` calculat, **sau** o notă explicită că rata nu e cunoscută și rămâne `OPERATOR-INPUT`. |
| R9 | `12-FULL-FINDINGS-REGISTER.md` §0.2 | — | adaugă o notă: „*Coloana „Sev." folosește \`P0\` și \`Critical\` pentru aceeași clasă de blocaj (11 rânduri \`P0\`, 27 \`Critical\`, toate cu P0 = „Da"). Severitățile \`SEC-*\` sunt preluate din \`02-security-audit.md\`; celelalte sunt atribuite de orchestrator, fiindcă rapoartele-sursă nu au coloană de severitate.*" |
| R10 | `07-release-gates.md:291` | „**5 servere pe panou vs 3 instanțe** (orfane 8 și 14)" | „**5 servere pe panou vs 3 instanțe** ⇒ 2 servere orfane (ID-urile 8 și 14)" |
| R11 | ~~`00-EXECUTIVE-SUMMARY.md:206` (Q13)~~ | **REPARAT** (14:34:49) — `:209` spune acum "un singur preț, €9.99, la configurația implicită"; `:211` spune "€9.99 e un preț de *acoperire a costului*, nu un preț de piață. E de ~2× peste intrarea documentată pe piață (€3.99–€4.74 la 4 GB / 2 vCPU)"; `:212` tratează explicit tierul gratuit Lunafy. **Fără acțiune.** | „**€9.99/lună pentru `discord-bot` la 512 MB / 1 vCPU / 5 GB** — `baseAmount` de la 149 la **976**." | „**€9.99/lună e pragul de cost al modelului** (contribuție + amortizare CAC + absorbție a costului fix) pentru configurația implicită 512 MB / 1 vCPU / 5 GB — `baseAmount` 976 — **dar nu e un preț de piață**: piața documentată în același corpus are intrarea la €3.99–€4.74 **la 4 GB / 2 vCPU**, iar un VPS Contabo cu 8 GB și trafic nelimitat costă €5.50. **Prețul de vânzare trebuie ales explicit între `€9.99` (cost-cover) și `€3.49–€4.49` (piață), cu riscul de vânzare pe fiecare variantă enunțat.**" |
| R12 | ~~`00-EXECUTIVE-SUMMARY.md:229` (Q14)~~ | **REPARAT** (14:34:49) — `:229` prezintă acum **ambele** cifre, iar `:234` explică diferența dintre ele. **Fără acțiune.** | „15 clienți × €9.99/lună = €149.85/lună" | adaugă: „*Cifra alternativă, pentru produsul de fază 1 propus de \`08-product-launch-order.md\`: **14 clienți × €4.09 = €57.26/lună**, contra unui cost de nod \`C_node\` = €54.44 (\`INFERRED\`, anchoră Contabo). Cele două modele folosesc costuri de nod diferite (60.00 \`OPERATOR-INPUT\` vs 54.44 \`INFERRED\`) și dau răspunsuri diferite la Q14.*" |

---

## 9. Ce n-am putut verifica

`UNVERIFIED` / `BLOCKED` — limitele mele, nu ale auditului:

- conținutul containerului live al instanței (`OPS-01`) — nodul de joc nu e accesibil din acest mediu; am verificat în schimb **DB-ul** (instanța marcată `ONLINE`) și **codul** care mapează starea (`api/src/routes/instance-server.ts`), ceea ce confirmă mecanismul, nu conținutul containerului;
- inventarul panoului („5 servere pe panou") — panoul e pe VM 100/101, inaccesibil (`BLOCKED`, identic cu `DR-05`);
- jurnalul `sshd` al hipervizorului („17 436 `Failed password`") — `BLOCKED`;
- „255/255 cote corecte" — `DOCUMENTED-ONLY`; n-am rulat suita de cotare;
- „553 de verificări de browser" — `DOCUMENTED-ONLY`; n-am rulat browserul (limita de autentificare: 10 tentative / 15 min, iar o rulare ar consuma bugetul pentru verificări mai utile);
- prețurile OVI / Torchbyte / Render / Railway / Heroku / Contabo — le-am verificat pe **una** (Zentaris); restul sunt `DOCUMENTED-ONLY` cu URL și dată, ceea ce e acceptabil, dar nu le-am reconfirmat pe toate;
- backlog-ul `13` §1 rând cu rând — am verificat doar că fiecare P0 are rând de acțiune (inclusiv `COMM-03` → B-24), nu am auditat criteriile de verificare unul câte unul;
- **fișierele modificate după 14:32:04** — corpusul e încă în mișcare; orice corecție de mai sus trebuie re-verificată pe starea de aplicare.

---

## 10. Bilanț final

**31 de erori găsite; 25 reparate de orchestrator în timpul auditului; 6 în părare (R1–R6, R10), toate cu textul exact de înlocuit în §8.2.**

**Bile curate explicite** (un raport fără ele ar fi incomplet): numărătoarea porților; suma efortului din §4; formula contribuției, pragurile și break-even-ul din `09-unit-economics.md`; **toate cele 57 de rânduri ale `09-break-even-model.csv`** reproduse din formula declarată; **contoarele §0.4 ale registrului, recalculate independent** (167/28, identice cu șirul propriu al orchestratorului); cele 949 de citări `file:line` din corpus; cifrele de volum din producție (93/30 joburi, 80/5 evenimente, 14 bilete, 0 abonamente/plăți/facturi, 3 instanțe la prețuri diferite, `BM-00002` `AWAITING_PAYMENT` cu instanță `ONLINE`); **prețurile de concurență** — Zentaris €4.49/4 GB/2 vCPU/25 GB verificat independent pe pagina publică; **acoperirea tuturor celor 25 de întrebări** prin `00-EXECUTIVE-SUMMARY.md`; absența secretelor și a datelor personale de clienți; secțiunea §7e a registrului (reconcilierea pragurilor) e corectă în fond; condițiile 14–19 și 9b, adăugate ca răspuns la acest raport, sunt corect dimensionate (24/28 P0-uri închise prin atribuire explicită).

**Nu am modificat niciun fișier din `audit/` în afară de acesta.** Nu am făcut nicio scriere în producție: doar `SELECT` read-only prin `docker compose … exec -T postgres psql`, doar `md5sum` pe fișiere, doar `GET` pe o pagină publică de concurent, doar `node _tools/count-register.cjs` (script de numărare, fără efecte).

**Verdict final asupra sintezei:** NO-GO-ul e corect ca decizie și e susținut de dovezi pe care le-am verificat eu însumi — inclusiv mecanismul de plată greșită, cel mai grav defect din corpus, acoperit corect ca P0 și acum închis de condiția 14. **După corecțiile aplicate în timpul acestui audit, sinteza e de trimis unui decident, cu 6 corecții mici rămase** — dintre care două sunt de fond (suprapunerea de acoperire a P0-urilor, care numește 28 în loc de 24, și contradicția dintre prețul recomandat și datele de piață ale propriului corpus) și una de conformitate cu brief-ul (`01-backend-audit.md` lipsește).
