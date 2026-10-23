# 09 — Ipotezele financiare: singura sursă a tuturor numerelor

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Sistemul de producție nu a fost modificat.
**Rol:** fluxul de lucru „finance" al auditului Blipmade.

**Convenție zecimală:** punct (`.`) — `9.99` = nouă euro și nouăzeci și nouă de centi. Convenția monetară a platformei este **unități minori întregi (EUR cents)** (`api/src/lib/money.ts:2-3`), deci `149` = **€1.49**. Toate sumele din acest pachet de documente sunt în **EUR major units**, cu excepția coloanelor `*_minor_units` și a formulelor marcate explicit.

**Regula de citire:** orice număr din `09-unit-economics.md`, `09-capacity-and-revenue.md`, `09-pricing-recommendations.md` și `09-break-even-model.csv` se reproduce din acest fișur. Dacă un număr nu se poate reduce la o variabilă de mai jos, este o eroare de redactare.

> **Toate proiecțiile din acest pachet sunt SCENARII, nu prognoze.** Nu există istoric de vânzări (`0` abonamente, `0` facturi, `0` plăți), nu există rată de conversie, nu există churn observat, nu există preț de concurență verificabil în sistem și `PAYMENTS_ENABLED=false` (checkout-ul răspunde `503 payments_unavailable`). Niciun număr din aceste documente nu prezice ce se va întâmpla; fiecare arată **ce ar trebui să fie adevărat** pentru ca modelul să se închidă.

---

## 0. Statusul intrărilor pe care le-am citit

| Fișier cerut | Status la 2026-10-23 | Efect asupra acestui model |
|---|---|---|
| `audit/00-BRIEFING.md` §12 | **citit**; conține **două cifre greșite** (corectate mai jos) | baseline-ul folosit aici este cel corectat |
| `audit/03-capacity-model.md` | **citit** | 16 instanțe sigure, vCPU limitant, 85.51 GiB liberi, al doilea nod 64 GiB |
| `audit/03-disaster-recovery.md` | **citit** | nu există backup off-host ⇒ cost de backup per client = **0,00 azi** |
| `audit/05-pricing-consistency.md` | **citit** | cardul de preț, corectarea baseline-ului |
| `audit/05-commerce-and-billing.md` | **citit** | calea banilor, `503`, reducerile care nu ajung la Stripe, absența planului anual |
| `audit/08-product-portfolio.md` | **NU EXISTĂ** la momentul scrierii | portofoliul recomandat este **presupus de mine**, marcat `OPERATOR-INPUT` |
| `audit/08-product-launch-order.md` | **NU EXISTĂ** la momentul scrierii | ordinea de lansare **nu** influențează acest model |
| `audit/08-competitive-analysis.md` | **NU EXISTĂ** la momentul scrierii | comparația cu piața este **în așteptare**; ancorarea se face **doar pe cost** |

> Dacă `08-product-portfolio.md` apare ulterior și recomandă un alt produs sau un alt plafon de preț decât cel derivat aici, **derivația de mai jos rămâne valabilă** (formulele sunt peste variabile), dar **produsul recomandat și prețul recomandat trebuie re-emapate** pe acel document. Secțiunea §3.1 de mai jos spune explicit care este produsul presupus.

---

## 1. Corectările de baseline obligatorii

Trei cifre din documentele de intrare erau greșite. Modelul le folosește **corectate**, cu sursa.

### 1.1 Prețul minim: **149 minor units = €1.49**, nu 229

`00-BRIEFING.md` §12.3 scrie „The smallest configuration of the one sellable product (512 MB, 1 vCPU, 5 GB) costs `149 + 60×0.5 + 40×1 + 2×5 = 229` cents = **€2.29 per month**". Formula aceia aplică supraclășugile **peste zero**. Motorul platformei le aplică **peste minimul produsului**:

```text
api/src/services/pricing.ts:39-53
extraRamGb = max(0, (config.ram - product.minRam) / 1024)
amount = price.baseAmount
       + normalizeAmount(extraRamGb * price.ramPerGb)
       + normalizeAmount(max(0, config.cpu - product.minCpu) * price.cpuPerUnit)
       + normalizeAmount(max(0, config.disk - product.minDisk) * price.diskPerGb)
       + sum(options.amount)
```

`minRam = 256`, `minCpu = 1`, `minDisk = 1` pentru `discord-bot` (`VERIFIED`, DB). Deci:

```text
256 MB / 1 vCPU / 1 GB  →  149 + 0 + 0 + 0            = 149 minor = €1.49   ← minimul
512 MB / 1 vCPU / 5 GB  →  149 + 15 + 0 + 8            = 172 minor = €1.72   ← implicitul
4096 MB / 2 vCPU / 20 GB→  149 + 225 + 40 + 38        = 452 minor = €4.52   ← doar prin API
4096 MB / 2 vCPU / 22 GB→  149 + 225 + 40 + 42        = 456 minor = €4.56   ← selectabil în wizard
```

Confirmat de trei surse independente care concordă: 255/255 cote live (`05-pricing-consistency.md` §3), două ordine reale în DB cu `OrderItem.unitAmount = 172` (`05-commerce-and-billing.md` §1.2) și prețul stocat pe instanțele reale (`Instance.price = 172`).

### 1.2 O eroare de 100× în `03-capacity-model.md` §2.8

`03-capacity-model.md` §2.8 scria: „16 × 262 = **4 192 EUR/lună**". 262 sunt **unități minori** = €2.62, deci `16 × 262 = 4 192 minor units = **€41.92/lună**`. Este exact greșeala de 100× pe care `05-pricing-consistency.md` §0 și `05-commerce-and-billing.md` §0 semnalează pentru celelalte rapoarte — și pe care **modelul meu le folosește, deci le corectez aici explicit**. **Actualizare:** orchestratorul a corectat deja sursa în `03-capacity-model.md` §2.8 (textul acum spune „4 192 unități minori = 41,92 EUR/lună"); citirea de mai sus rămâne corectă.

Consecință: **plafonul de venit al nodului la lista proprie de prețuri este €23.84–€36.48/lună, nu mii de euro.** Un model care ar folosi „4 192 EUR/lună" ar inversa complet decizia de investiție.

### 1.3 Limitarea de vCPU schimbă plafonul de venit

`03-capacity-model.md` §2.4 dă „16 sigur" pentru instanțe de **1 vCPU**. Cardul de preț are însă și configurații de **2 vCPU** și **4 vCPU**, iar vCPU-ul este resursa limitantă (16 vCPU utilizabile după rezerva de 20%):

| Configurație | vCPU | Instanțe pe nodul 1 | RAM ocupat | Disc ocupat |
|---|---|---|---|---|
| 256 MB / 1 vCPU / 1 GB | 1 | **16** | 4 GiB | 16 GiB |
| 512 MB / 1 vCPU / 5 GB | 1 | **16** | 8 GiB | 80 GiB |
| 2048 MB / 2 vCPU / 10 GB | 2 | **8** | 16 GiB | 80 GiB |
| 4096 MB / 2 vCPU / 22 GB | 2 | **8** | 32 GiB | 176 GiB |
| 4096 MB / 4 vCPU / 49 GB | 4 | **4** | 16 GiB | 196 GiB |

**Prețul per vCPU scade cu configurația** (149 → 114 minor/vCPU la 4 GB/2 vCPU), deci venitul maxim al nodului este aproape **plat** pe întregul card: €23.84–€36.48/lună.

---

## 2. Variabilele: costuri fixe (lunare)

| # | Variabilă | Valoare | Unitate | De unde vine valoarea | Clasă |
|---|---|---:|---|---|---|
| F1 | `SERVER_COST_EUR_PER_MONTH` | **60.00** | EUR/lună | **Nu se poate deduce din cod.** Niciun fișier, script, `.env` sau factură din repository nu conține costul serverului. Valoarea este un **placeholder de calcul** și nimic mai mult. | `OPERATOR-INPUT` |
| F2 | `DOMAIN_COST_EUR_PER_MONTH` | **1.00** | EUR/lună | `blipmade.com` + subdomenii. 12.00 EUR/an ÷ 12 luni. Prețul de reînnoire nu apare în repository. | `OPERATOR-INPUT` |
| F3 | `IP_EXTRA_COST_EUR_PER_MONTH` | **0.00** | EUR/lună | Cele 4 adrese publice (`193.34.214.20`, `.86`, `.87`, `.143`) sunt în același `/24`; cele 3 suplimentare sunt alias-uri pe `eth0` (`03-network-and-ip-plan.md`), deci cost marginal zero în cel mai probabil caz. De confirmat cu furnizorul. | `OPERATOR-INPUT` |
| F4 | `OFFSITE_BACKUP_PLATFORM_COST_EUR_PER_MONTH` | **0.00** | EUR/lună | **Nu există țintă off-host** (`03-disaster-recovery.md` §3.1-3.2: `pvesh get /cluster/backup` → `[]`, `OFFSITE_TARGET` neconfigurat, `rclone` absent). Azi costul este zero — și tot ce se vinde nu are nicio copie. | `VERIFIED` (absență) |
| **F** | **`FIXED_COST_EUR_PER_MONTH`** | **61.00** | **EUR/lună** | `F1 + F2 + F3 + F4` = 60.00 + 1.00 + 0.00 + 0.00 | derivată |

> **F1 este singurul număr din tot modelul care schimbă răspunsul final.** Formula de recalculare a oricărui rezultat:
>
> ```text
> FIXED_COST_EUR_PER_MONTH = SERVER_COST_EUR_PER_MONTH + 1.00 + 0.00 + 0.00
> ```
>
> Tabelul de sensibilitate din `09-capacity-and-revenue.md` §5 dă răspunsul pentru 30 / 45 / 60 / 75 / 90 / 120 EUR. **Operatorul trebuie să înlocuiască F1 cu valoarea reală a facturii înainte de a folosi orice concluzie din acest pachet.**

### 2.1 Varianta „server propriu" (dacă F1 nu e o închiriere)

Dacă operatorul **deține** hardware-ul, `SERVER_COST_EUR_PER_MONTH` trebuie descompus. Formula, cu valori `OPERATOR-INPUT`:

```text
SERVER_COST_EUR_PER_MONTH = preț_cumpărare / (HARDWARE_REFRESH_YEARS × 12)   ← amortisment
                           + POWER_COST_EUR_PER_MONTH                          ← curent
                           + BANDWIDTH_COST_EUR_PER_MONTH                      ← trafic
                           + F2 + F3 + F4
```

| Componentă | Variabilă | Valoare | Clasă | Justificare |
|---|---|---:|---|---|
| Preț de cumpărare | `SERVER_PURCHASE_PRICE_EUR` | **600.00** | `OPERATOR-INPUT` | Niciun preț de achiziție nu apare în repository. Placeholder. |
| Perioadă de reînnoire | `HARDWARE_REFRESH_YEARS` | **3** | `OPERATOR-INPUT` | `Xeon E5-2698 v4` este din 2016 (`00-BRIEFING.md` §2); la 3 ani, amortismentul = 600/36 = **16.67 EUR/lună**. La 5 ani = 10.00 EUR/lună. |
| Consum mediu | `SERVER_DRAW_WATTS` | **350** | `INFERRED` | 2 × 105 W TDP CPU = 210 W, plus ~140 W pentru placa de bază, 2 × 894 GB SSD enterprise, 256 GB DDR4 ECC, ventilație și pierderi de PSU. **Nu există măsurătoare de watt pe sistem** (nu există contor IPMI/PDU citit). Interval 300–450 W. |
| Preț energie | `POWER_PRICE_EUR_PER_KWH` | **0.25** | `OPERATOR-INPUT` | Tarif industrial; nu apare în repository. |
| Cost curent | `POWER_COST_EUR_PER_MONTH` | **63.00** | derivată | `0.35 kW × 720 h × 0.25 EUR/kWh` = **63.00 EUR/lună**. La 300 W = 54.00; la 450 W = 81.00. |
| Trafic | `BANDWIDTH_PRICE_EUR_PER_TB` | **5.00** | `OPERATOR-INPUT` | Niciun preț de trafic nu apare în repository. |
| Trafic lunar | `BANDWIDTH_COST_EUR_PER_MONTH` | **5.00** | derivată (placeholder) | 1 TB/lună × 5.00 EUR/TB. **Nu există măsurătoare de consum de trafic** pe niciuna dintre cele 4 adrese. |

> **Atenție la dublarea costurilor:** dacă F1 este o **închiriere** (implicitul acestui model), curentul și traficul sunt deja incluse în F1. Nu se adună F1 cu 63.00 + 5.00. Regula: **fie F1 = cost complet (închirieri), fie F1 = cost de numerar și se folosește §2.1; niciodată amândouă.**

---

## 3. Variabilele: costuri variabile (per client, per lună)

Formula unică a costului variabil:

```text
VC_EUR_PER_CUSTOMER_PER_MONTH(P) = PAYMENT_FEE_PCT × P
                                 + PAYMENT_FEE_FIXED_EUR
                                 + SUPPORT_MINUTES_PER_CUSTOMER_PER_MONTH / 60 × FOUNDER_HOURLY_COST_EUR
                                 + BACKUP_COST_EUR_PER_CUSTOMER_PER_MONTH
                                 + BANDWIDTH_COST_EUR_PER_CUSTOMER_PER_MONTH
```

| # | Variabilă | Valoare | Unitate | De unde vine valoarea | Clasă |
|---|---|---:|---|---|---|
| V1 | `PAYMENT_FEE_PCT` | **0.03** | fracție | Comisioane Stripe. **Nu este în cod** — platforma nu are cheie Stripe, deci nu există niciun `fee` calculat sau stocat. Placeholder conservator; operatorul pune rata din contractul lui. | `OPERATOR-INPUT` |
| V2 | `PAYMENT_FEE_FIXED_EUR` | **0.25** | EUR/tranzacție | Comision fix per plată. Placeholder, aceeași sursă ca V1. | `OPERATOR-INPUT` |
| V3 | `SUPPORT_MINUTES_PER_CUSTOMER_PER_MONTH` | **15** | minute | **Nu există măsurătoare.** Proxy: 11 ticket-uri în DB pentru 6 utilizatori, viață întreagă a platformei (`00-BRIEFING.md` §6). Placeholder: 15 min/lună/client. **Este cea mai influentă ipoteză din model** — vezi tabelul de sensibilitate din §3.2. | `OPERATOR-INPUT` |
| V4 | `FOUNDER_HOURLY_COST_EUR` | **20.00** | EUR/oră | Cost-oportunitate al timpului fondatorului. Nu există payroll, nu există contract. Placeholder. | `OPERATOR-INPUT` |
| V5 | `SUPPORT_COST_EUR_PER_CUSTOMER_PER_MONTH` | **5.00** | EUR/lună | `15 / 60 × 20.00` = **5.00** | derivată din V3, V4 |
| V6 | `BACKUP_COST_EUR_PER_CUSTOMER_PER_MONTH` | **0.25** | EUR/lună | **Derivație, nu preț de piață:** `disk_gb × utilizare × retenție × preț_GB`. Pentru config. implicită: 5 GB × 50% umplere × 7 zile retenție zilnică ≈ 17.5 GB, comprimat ~50% ≈ 8.75 GB la 0.02 EUR/GB/lună ≈ 0.175 ⇒ rotit la **0.25**. **Ambele rate (utilizare, preț GB) sunt `OPERATOR-INPUT`.** Azi costul real este **0.00** — nu există backup (`03-disaster-recovery.md`). | `OPERATOR-INPUT` |
| V7 | `BANDWIDTH_COST_EUR_PER_CUSTOMER_PER_MONTH` | **0.00** | EUR/lună | Trafic nelimitat sau inclus în F1. Nu există măsurătoare de consum per client. | `OPERATOR-INPUT` |
| **V** | **`VC_EUR_PER_CUSTOMER_PER_MONTH(P)`** | **`0.03 × P + 5.50`** | **EUR/lună** | `0.03×P + 0.25 + 5.00 + 0.25 + 0.00` | derivată |

### 3.1 Contribuția și marginile (baza: F=61.00, V=15 min, CAC=25, churn 5%)

```text
contribution(P) = P − VC(P) = 0.97 × P − 5.50
margin(P)       = contribution(P) / P
```

| P | VC(P) | contribution(P) | margin | payback (CAC 25) | clienți pt. break-even |
|---:|---:|---:|---:|---|---|
| 1.49 | 5.5447 | **−4.0547** | −272.1% | **nu există** | **nu există** |
| 1.72 | 5.5516 | **−3.8316** | −222.8% | **nu există** | **nu există** |
| 3.12 | 5.5936 | **−2.4736** | −79.3% | **nu există** | **nu există** |
| 4.56 | 5.6368 | **−1.0768** | −23.6% | **nu există** | **nu există** |
| 5.90 | 5.6770 | **+0.2230** | +3.8% | 112.11 luni | 274 ( imposibil: nodul are 16 sloturi) |
| **9.99** | **5.7997** | **+4.1903** | **+41.9%** | **5.97 luni** | **15** |

### 3.2 Sensibilitatea la V3 (minute de suport) — **cea mai importantă tabelă din model**

| V3 (min/client/lună) | VC fix | prag marginal | preț pt. payback ≤12 luni | preț pt. payback ≤6 luni | preț full-absorption @16 | contribuție @€1.49 | contribuție @€1.72 | contribuție @€4.56 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 2.1667 | 2.23 | 4.38 | 6.53 | 6.16 | −0.72 | −0.50 | **+2.26** |
| 10 | 3.8333 | 3.95 | 6.10 | 8.25 | 7.88 | −2.39 | −2.16 | +0.59 |
| **15 (bază)** | **5.5000** | **5.67** | **7.82** | **9.97** | **9.60** | **−4.05** | **−3.83** | **−1.08** |
| 20 | 7.1667 | 7.39 | 9.54 | 11.68 | 11.32 | −5.72 | −5.50 | −2.74 |
| 30 | 10.5000 | 10.82 | 12.97 | 15.12 | 14.76 | −9.05 | −8.83 | −6.08 |

**Concluzia care rezistă la orice valoare a V3 ≥ 5 minute: la €1.49 și €1.72 contribuția este negativă.** Doar la **5 minute** de suport pe client apare un preț de pe card la care contribuția devine pozitivă (€4.56).

---

## 4. Variabilele: comerciale

| # | Variabilă | Valoare | Unitate | De unde vine valoarea | Clasă |
|---|---|---:|---|---|---|
| C1 | `CAC_EUR` | **25.00** | EUR | Cost de achiziție per client plătitor. **Nu există nicio campanie, niciun canal și nicio statistică de achiziție** în sistem (0 plăți, 0 promoții, `Promotion` = 0 rânduri). Placeholder: ~1.25 h de timp de vânzare al fondatorului la 20.00 EUR/h. | `OPERATOR-INPUT` |
| C2 | `CHURN_MONTHLY_PCT` | **5.0** | %/lună | **Nu există nicio observație** — 0 abonamente, 0 facturi, 0 plăți. Placeholder pentru un serviciu de găzduire cu suport uman. **Intervalul 1%–12% este explorat în tabelul de sensibilitate**; nu este o estimare. | `OPERATOR-INPUT` |
| C3 | `TRIAL_TO_PAID_CONVERSION_PCT` | **30.0** | % | **Platforma nu are trial.** `grep -rn "coupon\|Coupon\|trial" api/src` → zero rezultate (`05-promotions.md` §9). Orice cifră este o ipoteză de planificare pentru o funcționalitate care **nu există și trebuie construită**. | `OPERATOR-INPUT` |
| C4 | `TRIAL_LENGTH_MONTHS` | **1** | luni | Placeholder. Nu există trial în cod. | `OPERATOR-INPUT` |
| C5 | `TRIAL_PERIOD_COST_EUR` | **5.25** | EUR | Costul servitului unui client în timpul trialului: suport 15 min (5.00) + backup (0.25). Fără comision de plată (nu se încasează în trial). | derivată din V5, V6 |
| C6 | `ANNUAL_PREPAY_MONTHS` | **12** | luni | Politică propusă. **Capabilitate inexistentă:** `BillingPeriod` are `MONTHLY | YEARLY` (`schema.prisma:209-212`) dar toate rândurile sunt `MONTHLY` și nu există cod care creeze un preț `YEARLY` (`05-commerce-and-billing.md` §5.1). | `OPERATOR-INPUT` |
| C7 | `ANNUAL_PREPAY_DISCOUNT_MONTHS` | **2** | luni | Politică propusă („2 luni gratuite"). Nu există coupon Stripe, nu există trial (`05-promotions.md` §9). | `OPERATOR-INPUT` |
| C8 | `ANNUAL_DISCOUNT_RATE_PCT` | **12.0** | %/an | Rata de actualizare pentru NPV. Nu există un cost de capital documentat. Placeholder. | `OPERATOR-INPUT` |
| C9 | `AFFILIATE_COMMISSION_PCT` | **derivat** | % | Nu există program de afiliere în cod. **Plafonul se calculează**, nu se presupune: vezi `09-unit-economics.md` §8. | derivată |

---

## 5. Variabilele: capacitate (toate `VERIFIED`)

| # | Variabilă | Valoare | Unitate | Sursă | Clasă |
|---|---|---:|---|---|---|
| K1 | `SAFE_INSTANCES_PER_NODE` | **16** | instanțe | `03-capacity-model.md` §2.4 (rezerva de 20% vCPU). Tavan teoretic 20. | `VERIFIED` |
| K2 | `SAFE_VCPU_POOL_PER_NODE` | **16** | vCPU | 20 vCPU pe nod − 4 vCPU rezervă (20%). | `VERIFIED` |
| K3 | `NODE_DISK_POOL_GB` | **800** | GB | Pool de alocări al panoului. | `VERIFIED` |
| K4 | `NODE_RAM_POOL_GB` | **120** | GiB | `memory=122880 MB` în panou. | `VERIFIED` |
| K5 | `FREE_RAM_ON_HYPERVISOR_GB` | **85.51** | GiB | 251.77 − 24.26 (host) − 142 (VM-uri). | `VERIFIED` |
| K6 | `FREE_LOGICAL_CPUS` | **52** | CPU | 80 − 28 angajate. | `VERIFIED` |
| K7 | `SECOND_NODE_RAM_GB` | **64** | GiB | 128 **nu încape** (lipsă 42.49 GiB); 64 încape cu marjă 21.51 GiB. | `VERIFIED` |
| K8 | `SECOND_NODE_SAFE_INSTANCES` | **16** | instanțe | 20 vCPU proprii, limita de vCPU rămâne limitantă. | `VERIFIED` |
| K9 | `PLATFORM_VM_MARGINAL_COST_PER_CUSTOMER` | **≈0** | EUR/lună | VM 103 folosește 752 MiB din 8 GiB și 2.86% din 4 vCPU (`03-capacity-model.md` §3.1); nu este restricționant. | `VERIFIED` |

**Regula de calcul a instanțelor pentru o configurație:**

```text
N_max(config) = min( SAFE_VCPU_POOL_PER_NODE / vcpu_per_instance,      ← limitant în toate cazurile
                     NODE_RAM_POOL_GB / ram_per_instance_gb,
                     NODE_DISK_POOL_GB / disk_per_instance_gb )
```

---

## 6. Pragurile derivate (funcții ale celor de mai sus)

| Prag | Formulă | Valoare bază | Ce înseamnă |
|---|---|---:|---|
| `ARPU_FLOOR_EUR` | `VC_fix / (1 − PAYMENT_FEE_PCT)` | **5.6701** | Prețul la care contribuția devine **0**. Sub acest prag, fiecare client **distruge** valoare. |
| `PRICE_FLOOR_PAYBACK_12M_EUR` | `(CAC/12 + VC_fix) / (1 − PAYMENT_FEE_PCT)` | **7.8179** | Prețul minim la care un client achiziționat la CAC 25 se amortizează în 12 luni. |
| `PRICE_FLOOR_PAYBACK_6M_EUR` | `(CAC/6 + VC_fix) / (1 − PAYMENT_FEE_PCT)` | **9.9656** | Idem, în 6 luni. |
| `PRICE_FLOOR_FULL_ABSORPTION_16_EUR` | `(FIXED/16 + VC_fix) / (1 − PAYMENT_FEE_PCT)` | **9.6005** | Prețul la care prețul clientului își acoperă **partea sa din costul fix**, la 16 clienți (100% ocupare). |
| `ALLOCATED_SERVER_COST_PER_INSTANCE_EUR` | `SERVER_COST / 16` | **3.75** | Partea din costul serverului atribuită fiecărui client la ocupare plină. |

Formula generală a pragului, în funcție de numărul de clienți plătitori `N` (serverul nu își schimbă costul):

```text
PRICE_FLOOR(N) = ( FIXED_COST_EUR_PER_MONTH / N + VC_fix ) / (1 − PAYMENT_FEE_PCT)
```

| N clienți | ocupare pe 16 | `PRICE_FLOOR(N)` bază |
|---:|---:|---:|
| 4 | 25% | **21.3918** |
| 8 | 50% | **13.5309** |
| 12 | 75% | **10.9107** |
| 16 | 100% | **9.6005** |

---

## 7. Defectele de comerț care schimbă comportamentul efectiv al modelului

Acestea nu sunt ipoteze; sunt **fapte verificate** din `05-commerce-and-billing.md` și `05-promotions.md` care modifică ce înseamnă „vânzare" și „reținere" în model.

| # | Fapt | Clasă | Efect în model |
|---|---|---|---|
| B1 | **Nu există plată.** `STRIPE_SECRET_KEY` gol, `PAYMENTS_ENABLED=false`, checkout-ul răspunde `503 payments_unavailable` (`api/src/services/stripe.ts:150-153`). | `VERIFIED` | Venitul din toate scenariile este **proiecție**, nu istoric. Prin urmare **niciun CAC, niciun churn, niciun LTV nu are bază empirică**. |
| B2 | **O reducere nu ajunge la Stripe.** `createCheckout` trimite `item.unitAmount` **nediscountuit** (`stripe.ts:175`), `order.total` este discountuit (`orders.ts:79`), iar `verifyAmount` compară strict (`webhooks.ts:188-196`) ⇒ mismatch ⇒ `Order FAILED` + `audit order.amount_mismatch` + reîncercare infinită. | `CODE-INSPECTED` | **Orice scenariu cu promoție trebuie prețuat ca și cum reducerea NU este onorată.** Azi: clientul nu plătește și nu primește serviciu — campania distruge comenzile pe care vrea să le creeze. |
| B3 | **Nu există plan anual.** Toate prețurile sunt `MONTHLY`; `loadPrice` caută `MONTHLY` (`schema.prisma:209-212`, `pricing.ts:69-79`). | `VERIFIED` | Scenariul de plată anticipată este **propunere**, nu capabilitate. |
| B4 | **Reînnoirea locală fabrică facturi plătite.** `renew()` marchează abonamentul `ACTIVE` și scrie o factură `status:'PAID'` pentru o sumă neîncasată (`billing.ts:96-142`), iar sweep-ul o apelează când `!stripeLive()` — adică **azi, în producție** (`billing.ts:248`). | `CODE-INSPECTED` | Cu 0 abonamente nu s-a întâmplat. Când se activează Stripe, condiția devine falsă și reînnoirea trece integral la evenimentul Stripe. Modelul de LTV presupune că o plată înseamnă bană reală — **B4 încalcă această presupunere dacă Stripe rămâne neconfigurat**. |
| B5 | **Nicio politică de retenție.** Tabelul `Setting` = 0 rânduri ⇒ `auto_delete_cancelled_instances` = false ⇒ **datele clienților anulați rămân pe nod la nesfârșit** (`billing.ts:30-34`, `05-commerce-and-billing.md` §5.2). | `VERIFIED` | Modelul de LTV presupune o **ieșire curată**. În realitate, un client anulat consumă în continuare disc (5–49 GB din 800 GB) și generează ticket-uri. **LTV-ul calculat este optimistic.** |
| B6 | **Nu există backup off-host.** `pvesh get /cluster/backup` → `[]`; backup-ul Pterodactyl dezactivat (`feature_limits.backups = 0`); singurele arhive sunt pe același RAID 0 (`03-disaster-recovery.md`). | `VERIFIED` | Costul de backup per client din model (V6 = 0.25) este un **cost viitor**, nu un cost curent. Riscul de pierdere totală a datelor pe RAID 0 este **necuantificat** (nu există probabilitate de incident și nu există clientă). |
| B7 | **Un produs creat din admin cu `baseAmount = 0` este gratuit.** `admin.ts:428,460`, `z.number().int().min(0).default(0)`. | `CODE-INSPECTED` | Prețul zero nu este o opțiune de model fără avertisment: un produs nou pornește **gratuit**. |
| B8 | **Nu există logică de taxă.** `Invoice.tax` scris mereu 0, fără `automatic_tax` (`05-commerce-and-billing.md` §4). | `VERIFIED` | Dacă se decide colectarea TVA-ului, venitul net scade. Rata este `BLOCKED` (decizie CFO). La 19% pe un preț brut de 9.99: net 8.3950, contribuție 2.6431, break-even 24 clienți, pragul brut devine **6.75**. |

---

## 8. Cum se schimbă răspunsul dacă operatorul înlocuiește o ipoteză

Fiecare linie de mai jos este o **regulă de recalculare**, nu o observație.

| Operatorul schimbă | Ce trebuie recalculat | Unde se vede |
|---|---|---|
| `SERVER_COST_EUR_PER_MONTH` | `FIXED = SERVER + 1.00`; apoi `n_be = FIXED / (P − VC(P))` și `PRICE_FLOOR(N)` | `09-capacity-and-revenue.md` §5 |
| `SUPPORT_MINUTES_PER_CUSTOMER_PER_MONTH` | `VC_fix = 0.25 + V3/60 × 20.00 + 0.25`; apoi toate pragurile și contribuțiile | `09-unit-economics.md` §2, tabelul §3.2 de mai sus |
| `FOUNDER_HOURLY_COST_EUR` | la fel — intră liniar în `VC_fix` | idem |
| `PAYMENT_FEE_PCT` / `PAYMENT_FEE_FIXED_EUR` | `VC(P)`; pragurile `(… + VC_fix)/(1 − pct)` | idem |
| `CAC_EUR` | doar payback, LTV/CAC și pragurile de payback (nu și break-even-ul contabil) | `09-unit-economics.md` §6-§7 |
| `CHURN_MONTHLY_PCT` | doar LTV și LTV/CAC | `09-unit-economics.md` §7 |
| `SERVER_DRAW_WATTS` / `POWER_PRICE_EUR_PER_KWH` | doar dacă serverul e propriu (F1 devine cost de numerar) | §2.1 |

---

## 9. Ce **nu** este în acest model, și de ce

| Absent | Motive |
|---|---|
| Preț de concurență, cotă de piață, volum de căutare | Nu există în sistem; `08-competitive-analysis.md` nu există. **Nu inventez.** |
| Rată de conversie observată | 0 plăți, 0 abonamente, checkout-ul este `503`. |
| Churn observat | idem |
| Scurgere (churn) pe cohortă | Nicio cohortă nu există. |
| TVA efectiv | `BLOCKED` — decizie fiscală, §7 B8. |
| Amortizare fiscală, impozit pe profit | Nu există entitate contabilă declarată în repository. |
| Costul de licențiere Pterodactyl / software | Nu apare în repository; `0` implicit (open source). |
| Venit din opțiuni plătite (`ProductOption`) | Tabelul `ProductOption` = 0 rânduri. |
| Efectul de revânzare la upgrade | `priceDelta ≤ 0` se aplică imediat, fără cost (`instances.ts:278-293`); upgrade-ul plătit nu poate porni cât timp Stripe e neconfigurat. |

---

## 10. Rezumat într-un rând

> La ipotezele de bază, **costul fix al platformei este 61.00 EUR/lună**, **costul variabil al unui client este 0.03 × P + 5.50 EUR/lună**, și **pragul de preț este 5.67 EUR/lună** (contribuție ≥ 0), **7.82 EUR/lună** (amortizare CAC în 12 luni) și **9.60 EUR/lună** (acoperirea costului fix la 16 clienți). Prețul curent al platformei, **1.49–5.90 EUR/lună**, este **sub toate cele trei praguri**.
