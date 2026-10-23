# 09 — De la capacitate la venit: cât poate produce platforma

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.**
**Sursă unică a numerelor:** `audit/09-financial-assumptions.md`. Capacitatea vine din `audit/03-capacity-model.md`.
**Convenție zecimală:** punct (`.`). Monedă: EUR.

> **Toate sumele de mai jos sunt SCENARII, nu prognoze.** Ele arată ce se întâmplă **dacă** un anumit număr de clienți ar plăti un anumit preț — nu cât de mulți vor plăti. Există `0` abonamente, `0` facturi, `0` plăți, iar checkout-ul răspunde `503 payments_unavailable`. Nu există nicio cerere, nicio listă de așteptare, nicio statistică de ocupare.

---

## 1. De la resursă la număr de instanțe

```text
N_max(config) = min( SAFE_VCPU_POOL_PER_NODE / vcpu_per_instance,      ← 16 vCPU utilizabili (20 − 4 rezervă)
                     NODE_RAM_POOL_GB / ram_per_instance_gb,             ← 120 GiB
                     NODE_DISK_POOL_GB / disk_per_instance_gb )         ← 800 GB
```

| configurație | vCPU | N_max pe nodul 1 | RAM ocupată | disc ocupat | binding |
|---|---:|---:|---:|---:|---|
| 256 MB / 1 vCPU / 1 GB | 1 | **16** | 4 GiB | 16 GiB | vCPU |
| 512 MB / 1 vCPU / 5 GB | 1 | **16** | 8 GiB | 80 GiB | vCPU |
| 2048 MB / 2 vCPU / 10 GB | 2 | **8** | 16 GiB | 80 GiB | vCPU |
| 4096 MB / 2 vCPU / 19 GB | 2 | **8** | 32 GiB | 152 GiB | vCPU |
| 4096 MB / 2 vCPU / 22 GB | 2 | **8** | 32 GiB | 176 GiB | vCPU |
| 4096 MB / 4 vCPU / 49 GB | 4 | **4** | 16 GiB | 196 GiB | vCPU |

`03-capacity-model.md` §2.4 dă „16 sigur" **pentru instanțe de 1 vCPU**. Când prețul crește cu configurația, prețul per vCPU **scade**, deci și numărul de instanțe care încap scade. **Consecința financiară directă: venitul maxim al nodului este aproape plat pe întregul card.**

---

## 2. Venitul maxim al nodului la fiecare punct de preț

| preț | configurație | N_max | **venit maxim/lună** | față de cost fix 61.00 |
|---:|---|---:|---:|---|
| €1.49 | 256 MB / 1 / 1 GB | 16 | **€23.84** | −€37.16 |
| €1.72 | 512 MB / 1 / 5 GB | 16 | **€27.52** | −€33.48 |
| €3.12 | 2048 MB / 2 / 10 GB | 8 | **€24.96** | −€36.04 |
| €4.50 | 4096 MB / 2 / 19 GB | 8 | **€36.00** | −€25.00 |
| €4.52 | 4096 MB / 2 / 20 GB (API-only) | 8 | **€36.16** | −€24.84 |
| €4.56 | 4096 MB / 2 / 22 GB | 8 | **€36.48** | −€24.52 |
| €5.90 | 4096 MB / 4 / 49 GB | 4 | **€23.60** | −€37.40 |
| **€9.99 (recomandat)** | 512 MB / 1 / 5 GB, `baseAmount` 976 | 16 | **€159.84** | **+€98.84** |

> **Corectură necesară înainte de a folosi cifrele din alte documente:** `03-capacity-model.md` §2.8 afirmă „16 × 262 = **4 192 EUR/lună**". 262 sunt unități minori ⇒ `16 × 262 = 4 192 minor = **€41.92/lună**`. E exact eroarea de 100× pe care `05-pricing-consistency.md` §0 semnalează. **Plafonul real al nodului la lista proprie de prețuri este €23.84–€36.48/lună.** **Actualizare:** sursa a fost corectată în această rundă în `03-capacity-model.md` §2.8; cifra de mai sus rămâne cea corectă.

---

## 3. Platforma întreagă: de la venit la rezultat operațional

Structura de cost a platformei:

```text
rezultat_operational(n, P) = n × P − n × VC(P) − FIXED_COST_EUR_PER_MONTH
                           = n × contribution(P) − 61.00
```

**Platforma în sine nu adaugă cost marginal per client.** VM 103 folosește 752 MiB din 8 GiB și 2.86% din 4 vCPU (`03-capacity-model.md` §3.1); platforma este decuplată de nod (`VERIFIED`). Singurul cost fix este serverul fizic, pe care rulează toate cele 4 VM-uri. **Așadar, plafonul de venit al platformei = plafonul de venit al nodului**, iar costul platformei este deja în `FIXED_COST_EUR_PER_MONTH`.

### 3.1 Grila completă la cost fix 61.00, suport 15 min/client/lună

| preț | ocupare | clienți | venit | cost variabil | contribuție | cost fix | **rezultat operațional** |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1.49 | 25% | 4 | 5.96 | 22.18 | −16.22 | 61.00 | **−77.22** |
| 1.49 | 50% | 8 | 11.92 | 44.36 | −32.44 | 61.00 | **−93.44** |
| 1.49 | 75% | 12 | 17.88 | 66.54 | −48.66 | 61.00 | **−109.66** |
| 1.49 | 100% | 16 | 23.84 | 88.72 | −64.88 | 61.00 | **−125.88** |
| 1.72 | 25% | 4 | 6.88 | 22.21 | −15.33 | 61.00 | **−76.33** |
| 1.72 | 50% | 8 | 13.76 | 44.41 | −30.65 | 61.00 | **−91.65** |
| 1.72 | 75% | 12 | 20.64 | 66.62 | −45.98 | 61.00 | **−106.98** |
| 1.72 | 100% | 16 | 27.52 | 88.83 | −61.31 | 61.00 | **−122.31** |
| 3.12 | 25% | 4 | 12.48 | 22.37 | −9.89 | 61.00 | **−70.89** |
| 3.12 | 50% | 8 | 24.96 | 44.75 | −19.79 | 61.00 | **−80.79** |
| 3.12 | 100% | 8 (vCPU) | 24.96 | 44.75 | −19.79 | 61.00 | **−80.79** |
| 4.56 | 25% | 4 | 18.24 | 22.55 | −4.31 | 61.00 | **−65.31** |
| 4.56 | 50% | 8 | 36.48 | 45.09 | −8.61 | 61.00 | **−69.61** |
| 4.56 | 100% | 8 (vCPU) | 36.48 | 45.09 | −8.61 | 61.00 | **−69.61** |
| 5.90 | 25% | 4 | 23.60 | 22.71 | +0.89 | 61.00 | **−60.11** |
| 5.90 | 100% | 4 (vCPU) | 23.60 | 22.71 | +0.89 | 61.00 | **−60.11** |
| **9.99** | 25% | 4 | 39.96 | 23.20 | +16.76 | 61.00 | **−44.24** |
| **9.99** | 50% | 8 | 79.92 | 46.40 | +33.52 | 61.00 | **−27.48** |
| **9.99** | 75% | 12 | 119.88 | 69.60 | +50.28 | 61.00 | **−10.72** |
| **9.99** | 100% | 16 | 159.84 | 92.80 | +67.04 | 61.00 | **+6.04** |

*(Liniile de 75% și 100% pentru configurațiile de 2 și 4 vCPU sunt marcate în CSV ca limitate de vCPU: 8 instanțe, respectiv 4.)*

### 3.2 Răspunsul la întrebarea „cât produce platforma"

| întrebare | răspuns | cu ce preț |
|---|---|---|
| venit maxim al nodului la lista curentă | **€23.84–€36.48/lună** | €1.49–€5.90 |
| venit maxim al nodului la prețul recomandat | **€159.84/lună** (16 clienți) | €9.99 |
| contribuția după costul serverului, la ocupare plină, preț curent | **−€64.88/lună** (€1.49) | — |
| contribuția după costul serverului, la ocupare plină, preț recomandat | **+€67.04/lună** | €9.99 |
| rezultat operațional la ocupare plină, preț recomandat | **+€6.04/lună** | €9.99 |

---

## 4. Câți clienți sunt necesari pentru break-even

```text
n_be(P) = ceil( FIXED_COST_EUR_PER_MONTH / contribution(P) )
```

| preț | contribuție/client | **n_be** | încape în nodul de 16? | rezultat la 16 clienți |
|---:|---:|---:|:--:|---:|
| 1.49 | −4.0547 | **nu există** | — | −€125.88 |
| 1.72 | −3.8316 | **nu există** | — | −€122.31 |
| 3.12 | −2.4736 | **nu există** | — | −€100.58 |
| 4.50 | −1.0768 | **nu există** | — | −€79.16 |
| 4.52 | −1.0768 | **nu există** | — | −€78.85 |
| 4.56 | −1.0768 | **nu există** | — | −€78.23 |
| 5.90 | +0.2230 | **274** | ✗ (nodul are 4–16 sloturi) | −€57.43 |
| **9.99** | **+4.1903** | **15** | ✓ (15 din 16) | **+€6.04** |

> **Un singur punct de preț de pe cardul curent produce un break-even realizabil, și acesta este imposibil de atins:** la €5.90 ar trebui 274 de clienți pe un nod care ține 16. **La prețul recomandat de €9.99, break-even-ul este 15 clienți** — 93.75% din capacitatea sigură a nodului.

### 4.1 Prețul de break-even în funcție de ocupare

```text
PRICE_FLOOR(n) = ( FIXED_COST_EUR_PER_MONTH / n + VC_fix ) / (1 − PAYMENT_FEE_PCT)
               = ( 61.00 / n + 5.50 ) / 0.97
```

| clienți | ocupare pe 16 | **preț de break-even** |
|---:|---:|---:|
| 4 | 25% | **€21.39** |
| 8 | 50% | **€13.53** |
| 12 | 75% | **€10.91** |
| 16 | 100% | **€9.60** |

Aceasta este cea mai utilă tabelă din document pentru o decizie de preț: **cu cât mai puțini clienți, cu atât trebuie să coste clientul.** La 25% ocupare, prețul de break-even este **mai mare decât cel mai scump preț de pe card**.

---

## 5. Sensibilitatea la costul serverului

`SERVER_COST_EUR_PER_MONTH` este singura ipoteză pe care operatorul trebuie să o înlocuiască obligatoriu (§2.1 din fișierul de ipoteze). Formula:

```text
FIXED(X) = X + 1.00 (domeniu) + 0.00 (IP-uri) + 0.00 (backup platformă)
n_be(X, P) = ceil( FIXED(X) / ( 0.97 × P − 5.50 ) )
PRICE_FLOOR(X, n) = ( FIXED(X) / n + 5.50 ) / 0.97
```

| `SERVER_COST` | cost fix | **n_be @ €9.99** | n_be @ €5.90 | n_be @ €1.49–€4.56 | preț break-even la 16 clienți | preț break-even la 8 clienți |
|---:|---:|---:|---:|:--:|---:|---:|
| 30.00 | 31.00 | **8** | 140 | nu există | 7.67 | 9.66 |
| 45.00 | 46.00 | **11** | 207 | nu există | 8.63 | 11.60 |
| **60.00 (bază)** | **61.00** | **15** | **274** | **nu există** | **9.60** | **13.53** |
| 75.00 | 76.00 | **19** | 341 | nu există | 10.57 | 15.46 |
| 90.00 | 91.00 | **22** | 409 | nu există | 11.53 | 17.40 |
| 120.00 | 121.00 | **29** | 543 | nu există | 13.47 | 21.26 |

**Două concluzii care nu depind de valoarea aleasă:**

1. **Sensibilitatea la costul serverului este liniară și mare**: dublarea costului serverului (60 → 120) dublează aproape numărul de clienți necesar (15 → 29). Un server dublu scump nu este „la fel de rentabil", ci **înjumătățește** platforma.
2. **Niciun cost al serverului, oricât de mic, nu face cardul curent să funcționeze.** Chiar și la 30.00 EUR/lună, contribuția rămâne negativă la €1.49–€4.56, pentru că **costul serverului nu e problema** — prețul e sub prag.

---

## 6. Câți clienți încap înainte de a fi necesară o extindere

### 6.1 Situația actuală — un singur nod

| resursă | total | angajat | liber | sursă |
|---|---:|---:|---:|---|
| CPU logic | 80 | 28 | **52** | `qm config` |
| RAM pentru angajamente noi | 251.77 GiB | 166.26 GiB (24.26 host + 142 VM-uri) | **85.51 GiB** | `pvesh` + `qm config` |
| Stocare | 1 725 GiB | 41.55 GiB | **1 683 GiB** | `pvesh` |

`03-capacity-model.md` §4.2: un al doilea nod **identic** (20 vCPU / 128 GiB) **NU încape** — lipsește 42.49 GiB de RAM.

### 6.2 Al doilea nod — 64 GiB, nu 128 GiB

| specificație | CPU | RAM | disc | încape? |
|---|---:|---:|---:|---|
| 20 vCPU / 128 GiB (identic cu nodul 1) | 52 ≥ 20 ✓ | 85.51 < 128 ✗ | ✓ | **NU** — lipsește 42.49 GiB |
| 20 vCPU / 96 GiB | ✓ | 85.51 < 96 ✗ | ✓ | **NU** — lipsește 10.49 GiB |
| 20 vCPU / 80 GiB | ✓ | ✓ (marjă 5.51 GiB) | ✓ | da, marjă prea mică |
| **20 vCPU / 64 GiB** | ✓ | ✓ (marjă 21.51 GiB) | ✓ | **DA — configurația recomandată** |

După crearea nodului 2: RAM liber rămas 21.51 GiB, CPU-uri libere rămase 32.

### 6.3 Capacitatea comercială și ce înseamnă ea în bani

| scenariu | clienți (1 vCPU) | venit @ €9.99 | contribuție | cost fix | **rezultat** |
|---|---:|---:|---:|---:|---:|
| nodul 1 (azi) | 16 | 159.84 | 67.04 | 61.00 | **+€6.04/lună** |
| nodul 1 + nodul 2 (64 GiB) | **32** | 319.68 | 134.09 | **61.00** | **+€73.09/lună** |
| al treilea nod | — | — | — | — | **imposibil**: 32 CPU-uri libere < 20+ necesare pentru un al treilea nod de 20 vCPU, și 21.51 GiB RAM liber < 64 GiB |

> **Observația comercială cea mai importantă din acest document:** al doilea nod este **o VM pe aceeași mașină fizică**, adică folosește CPU și RAM **pe care platforma le plătește deja oricum**. Prin urmare **nu adaugă niciun euro de cost fix** — adaugă doar €73.09/lună de contribuție la prețul recomandat. Extinderea în capacity este, la acest hardware, **gratuită în cost fix**.
>
> Consecință: **nu există o "nevoie de extindere" până la 32 de clienți.** Când apare nevoia de extindere, înseamnă că hardware-ul fizic s-a terminat.

### 6.4 Al doilea server fizic — peste 32 de clienți

| scenariu | cost fix | **n_be @ €9.99** | rezultat la 32 de clienți | rezultat la 29 de clienți |
|---|---:|---:|---:|---:|
| un server (azi) | 61.00 | **15** | +€6.04 | +€1.85 |
| al doilea server (32 clienți) | 121.00 | **29** | **+€13.09** | **+€0.52** |

**La 32 de clienți, al doilea server fizic aduce €13.09/lună de rezultat** — cu alte cuvinte, un server de €60/lună aduce cu tot ~€2.000/an de marjă la 16 clienți suplimentari. **Un al doilea server fizic este economic justificabil abia peste ~30 de clienți, iar până la 32 de clienți se poate folosi capacitatea deja plătită.**

---

## 7. Sensibilitatea la ocupare — ce se întâmplă dacă nu se umple nodul

La prețul recomandat de €9.99 (contribuție +4.1903/client/lună):

| ocupare | clienți | contribuție totală/lună | rezultat operațional | verdict |
|---:|---:|---:|---:|---|
| 25% | 4 | +16.76 | −44.24 | pierdere; fiecare client nou reduce pierderea cu 4.19 |
| 50% | 8 | +33.52 | −27.48 | pierdere; fiecare client nou reduce pierderea cu 4.19 |
| 75% | 12 | +50.28 | −10.72 | pierdere; **la 15 clienți se atinge break-even-ul** |
| **93.75%** | **15** | **+62.85** | **+€1.85** | **break-even atins** (contribuția lunară acoperă costul fix) |
| 100% | 16 | +67.04 | **+€6.04** | +€6.04/lună peste break-even |

**Punctul de break-even are o condiție dublă:** 15 clienți **și** preț de €9.59 sau mai mult. La 14 clienți, rezultatul este −€2.34/lună; la 15, +€1.85.

---

## 8. Ce nu se poate calcula din acest sistem

| mărsurătoare | de ce nu există |
|---|---|
| rata de ocupare reală | 3 instanțe în DB, 5 servere în panou, **toate create de teste**; niciun client plătitor |
| cerere (backlog) | 0 comenzi plătite; `PAYMENTS_ENABLED=false` ⇒ checkout-ul nu produce comenzi |
| distribuția configurațiilor dorite | nicio cotă reală |
| rata de conversie | 0 plăți |
| churn | 0 abonamente |
| dimensiunea pieței | `08-competitive-analysis.md` nu există |

---

## 9. Cum se citește `09-break-even-model.csv`

Fișierul are **57 rânduri de scenariu** + un rând de antet, pe 19 coloane. Fiecare rând este un scenariu complet, reprodusibil din coloanele de lângă el.

| coloană | semnificație | cum se calculează |
|---|---|---|
| `scenario` | identificator unic al rândului | `family\|price-…\|occ-…pct\|n-…` |
| `scenario_family` | familia de scenariu | `current-card`, `recommended`, `floor-ladder-base599`, `support-5min`, `annual-prepay-2mo-proposal`, `first-month-50pct-postfix`, `server-cost-sensitivity` |
| `monthly_price_eur` | prețul lunar pe client, în EUR | 4 zecimale, ca prețurile derivate (8.3250, 9.5738) să fie exacte |
| `configuration` | configurația vândută | include prețul și resursele |
| `vcpu_per_instance` | vCPU per instanță | **determină câte instanțe încap** |
| `instances_sold` | numărul de clienți din scenariu | limitat de `16 / vcpu_per_instance` |
| `occupancy_pct_of_16` | ocuparea, ca procent din 16 | `instances_sold / 16 × 100` |
| `revenue_eur_per_month` | venitul scenariului | `instances_sold × monthly_price_eur` |
| `variable_cost_eur_per_month` | costul variabil total | `instances_sold × variable_cost_eur_per_customer_per_month` |
| `variable_cost_eur_per_customer_per_month` | costul variabil per client | `0.03 × preț + 0.25 + minute/60 × 20.00 + 0.25 + 0.00` |
| `contribution_eur_per_customer_per_month` | contribuția per client | `monthly_price_eur − variable_cost_eur_per_customer_per_month` |
| `contribution_eur_per_month` | contribuția totală | `revenue_eur_per_month − variable_cost_eur_per_month` |
| `fixed_cost_eur_per_month` | costul fix | `server_cost_eur_per_month + 1.00 + 0.00 + 0.00` |
| `operating_result_eur_per_month` | rezultatul operațional | `contribution_eur_per_month − fixed_cost_eur_per_month` |
| `customers_needed_for_break_even` | clienți necesari pentru break-even | `ceil( fixed_cost_eur_per_month / contribution_eur_per_customer_per_month )`; **`-1` = nu există break-even** (contribuție ≤ 0) |
| `server_cost_eur_per_month` | `SERVER_COST_EUR_PER_MONTH` folosit în acel rând | 60.00 în toate scenariile, cu excepția familiei `server-cost-sensitivity` |
| `support_minutes_per_customer_per_month` | `SUPPORT_MINUTES_PER_CUSTOMER_PER_MONTH` folosit | 15, cu excepția familiei `support-5min` |
| `variable_cost_formula` | formula explicită a costului variabil | redă exact valorile din coloana de cost variabil per client |
| `notes` | observații, inclusiv limitările de vCPU | — |

**Regulile de rotunjire:** coloanele monetare sunt rotunjite la 2 zecimale, cele per-client la 4. `contribution_eur_per_month` și `operating_result_eur_per_month` se calculează **din valorile deja rotunjite** ale coloanelor alăturate, deci **fișierul se adună exact așa cum este tipărit** (posibilă o diferență de 1 cent între contribuția totală și `contribuția per client × numărul de clienți`, prin rotunjire).

**Cum se reproduce tot fișierul:**

```text
fixed_cost              = server_cost_eur_per_month + 1.00 + 0.00 + 0.00
variable_cost_per_cust  = 0.03 × monthly_price_eur + 0.25 + support_minutes/60 × 20.00 + 0.25 + 0.00
contribution_per_cust   = monthly_price_eur − variable_cost_per_cust
revenue                 = instances_sold × monthly_price_eur
contribution_total      = revenue − instances_sold × variable_cost_per_cust
operating_result        = contribution_total − fixed_cost
customers_for_break_even = ceil( fixed_cost / contribution_per_cust )   sau -1 dacă contribution_per_cust ≤ 0
```

---

## 10. Rezumatul cifrelor-cheie

| măsurătoare | valoare | ipoteze |
|---|---:|---|
| Instanțe sigure pe nod | **16** (tavan 20) | `VERIFIED` |
| Venit maxim al nodului la cardul curent | **€23.84–€36.48/lună** | prețuri `VERIFIED` |
| Venit maxim al nodului la €9.99 | **€159.84/lună** | — |
| **Break-even (preț recomandat)** | **15 clienți × €9.99 = €149.85/lună** | F=61, V=15 min, CAC 25 |
| Break-even la cardul curent | **nu există** (274 clienți ar fi necesari la €5.90) | — |
| Preț de break-even @ 16 clienți | **€9.60** | — |
| Preț de break-even @ 8 clienți | **€13.53** | — |
| Clienți până la extindere (al doilea nod, 64 GiB) | **32** — cu cost fix **zero** suplimentar | `VERIFIED` |
| Al treilea nod pe aceeași mașină | **imposibil** (32 CPU libere, 21.51 GiB RAM) | `VERIFIED` |
| Al doilea server fizic | peste ~30 clienți; cost fix 121.00 ⇒ n_be **29** | — |
