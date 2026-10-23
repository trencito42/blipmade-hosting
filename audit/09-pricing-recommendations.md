# 09 — Recomandări de preț

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.**
**Sursă unică a numerelor:** `audit/09-financial-assumptions.md`.
**Convenție zecimală:** punct (`.`). Monedă: EUR. Cardul platformei este în unități minori (EUR cents).

> **Acesta este un set de SCENARII și de praguri, nu o prognoză de vânzări.** Platforma are `0` abonamente, `0` facturi, `0` plăți, iar checkout-ul răspunde `503 payments_unavailable`. Niciun preț de concurență nu poate fi verificat din sistem.

---

## 0. Ce intrări lipsesc

| document | status | ce se întâmplă fără el |
|---|---|---|
| `audit/08-competitive-analysis.md` | **NU EXISTĂ** | **Comparația cu piața este în așteptare.** Recomandarea de mai jos este ancorată **doar pe cost** și spune explicit ce trebuie verificat (§3). |
| `audit/08-product-portfolio.md` | **NU EXISTĂ** | Produsul recomandat este **presupus** de mine: `discord-bot`, singurul produs cu `deployable = true` (`00-BRIEFING.md` §12.3, `03-capacity-model.md` §2.2.1). Marcat `OPERATOR-INPUT` în fișierul de ipoteze. |
| `audit/08-product-launch-order.md` | **NU EXISTĂ** | Nu influențează prețul. |

> **Dacă `08-product-portfolio.md` apare și recomandă alt produs, formula rămâne valabilă, dar prețul trebuie re-emapat** pe configurația acelui produs: `preț = 149 + 105 + 40 + 18 = 312` (€3.12) pentru un produs cu minime 2048/2/10, de exemplu.

---

## 1. Pragurile de preț — cele trei linii care contează

Toate trei se calculează din aceleași variabile; diferă prin ce cerință exprimă.

| prag | formulă | valoare bază | cerința exprimată |
|---|---|---:|---|
| **`ARPU_FLOOR_EUR`** | `VC_fix / (1 − PAYMENT_FEE_PCT)` = `5.50 / 0.97` | **€5.67** | contribuția ≥ 0: clientul **nu distruge** valoare |
| **`PRICE_FLOOR_PAYBACK_12M_EUR`** | `(CAC/12 + VC_fix) / 0.97` = `(2.0833 + 5.50) / 0.97` | **€7.82** | clientul achiziționat la CAC 25 se amortizează în 12 luni |
| **`PRICE_FLOOR_FULL_ABSORPTION_16_EUR`** | `(FIXED/16 + VC_fix) / 0.97` = `(3.8125 + 5.50) / 0.97` | **€9.60** | prețul clientului își acoperă partea din costul fix la 16 clienți |
| `PRICE_FLOOR_PAYBACK_6M_EUR` | `(CAC/6 + VC_fix) / 0.97` | **€9.97** | amortizare în 6 luni |

**Cardul curent al platformei este 149–590 minor units (€1.49–€5.90) — integral sub pragul de €5.67.** Nu există niciun preț de pe card care să acopere măcar costul marginal al unui client.

---

## 2. Prețul recomandat

### 2.1 Produsul și configurația recomandate

| | alegere | motiv |
|---|---|---|
| **produs** | `discord-bot` | singurul cu `deployable = true`; celelalte 4 nu pot fi comandate (`VERIFIED`) |
| **configurație** | 512 MB / 1 vCPU / 5 GB | implicitul wizard-ului și configurația celor 3 instanțe reale (`Instance.ram = 512`, `cpu = 1`, `disk = 5`) |
| **vCPU** | **1** | 1 vCPU = **16 instanțe** pe nod; 2 vCPU = 8; 4 vCPU = 4. Prețul per vCPU scade cu configurația, deci singurul mix care maximizează numărul de clienți și minimizează costul fix pe client este **un vCPU per instanță** (`03-capacity-model.md` §2.8) |

### 2.2 Prețul recomandat: **€9.99/lună** pentru configurația implicită

Formula de la care pornește prețul nu e „din intuție", ci din **convergența a patru praguri independente**:

```text
contribution(9.99) = 0.97 × 9.99 − 5.50 = 4.1903 EUR/client/lună
payback            = CAC 25 / 4.1903                    = 5.97 luni        ≤ 6 luni  ✓
LTV @ churn 5%     = 4.1903 / 0.05                      = 83.81 EUR
LTV/CAC            = 83.81 / 25                         = 3.35             ≥ 3      ✓
prag amortizare    = 9.99 ≥ 9.97 (payback 6 luni)       ✓
prag absorbție     = 9.99 ≥ 9.60 (16 clienți)           ✓
prag contribuție   = 9.99 ≥ 5.67                        ✓
```

**Toate cele patru praguri sunt satisfăcute de €9.99, iar acesta este cel mai apropiat preț „curat" deasupra pragului celui mai restrictiv (€9.97).** Niciun preț mai mic de pe card nu trece vreunul.

### 2.3 Ce înseamnă asta în cod

Cardul de preț este liniar; prețul de intrare se schimbă prin `baseAmount` (ecranul admin de prețuri):

```text
baseAmount nou = preț_țintă − supraclășugile configurației
```

| produs | configurație | supraclășugi (minor) | `baseAmount` necesar | preț rezultat |
|---|---|---:|---:|---:|
| `discord-bot` | 512 MB / 1 / 5 GB | 15 + 0 + 8 = 23 | **976** | **€9.99** |
| `discord-bot` | 256 MB / 1 / 1 GB (minim) | 0 | 976 | €9.76 |
| `discord-bot` | 2048 MB / 2 / 10 GB | 105 + 40 + 18 = 163 | 976 | €11.39 |
| `discord-bot` | 4096 MB / 2 / 22 GB | 225 + 40 + 42 = 307 | 976 | €12.83 |
| `discord-bot` | 4096 MB / 4 / 49 GB (max) | 225 + 120 + 96 = 441 | 976 | €14.17 |

> **Atenție:** cu `baseAmount = 976`, configurația minimă (256 MB / 1 vCPU / 1 GB) ar costa €9.76 — cu 23 de centi mai mult decât configurația implicită, pentru 256 MB. **Recomandarea: minimul de produs se ridică la 512 MB / 5 GB** (sau configurația minimă se elimină din wizard), ca să nu existe o configurație mai ieftină fără motiv. Alternativa — un card „de podea" cu `baseAmount = 599` — este în §2.4.

### 2.4 Alternativa: card „de podea" cu `baseAmount = 599`

Dacă operatorul preferă un card cu pragul de intrare cât mai mic (cel mai apropiat de €5.67):

| configurație | `baseAmount` 599 | preț |
|---|---:|---:|
| 256 MB / 1 / 1 GB | 599 | €5.99 |
| 512 MB / 1 / 5 GB | 599 + 23 | €6.22 |
| 2048 MB / 2 / 10 GB | 599 + 163 | €7.62 |
| 4096 MB / 2 / 22 GB | 599 + 307 | €9.06 |
| 4096 MB / 4 / 49 GB | 599 + 441 | €10.40 |

**Verdict: acest card nu se închide.** La €6.22 (configurația implicită) contribuția este +€0.53/lună, payback 46.87 luni, break-even **115 clienți** pe un nod de 16. **Recomandarea rămâne €9.99 / `baseAmount = 976`**; `baseAmount = 599` este doar varianta de rezervă, dacă operatorul decide că suportul trebuie redus la 5 minute pe client (§5).

### 2.5 Pragul de implementare

| regulă | valoare | unde se aplică |
|---|---|---|
| `baseAmount` minim pentru **orice** produs | **567** minor (€5.67) | ecranul admin de prețuri; `api/src/routes/admin.ts:537-556` permite azi `0` |
| `baseAmount` recomandat pentru `discord-bot` | **976** minor (€9.99) | același ecran |
| codul de produs nou cu `baseAmount = 0` | **interzis** | `admin.ts:428,460` — `z.number().int().min(0).default(0)` face produsul **gratuit** (`B7` în fișierul de ipoteze) |

---

## 3. Prețul față de piață — comparația este **în așteptare**, regula de decizie este stabilită

`audit/08-competitive-analysis.md` **nu există**, iar în sistem nu există niciun preț de concurență. **Nu inventez prețuri de piață.** Ce pot face este să formulez **regula de decizie**, astfel încât recomandarea să fie rezolvată imediat ce documentul apare:

```text
Piață ≥ 9.60  →  acceptă prețul recomandat (€9.99); plafonul de cost este acoperit
9.60 > Piață ≥ 7.82  →  acceptă prețul pieței, dar reduceri suportul la ≤ 10 min/client
                     (pragul de amortizare CAC 12 luni devine 6.10 EUR)
Piață < 7.82  →  NU vinde acest produs pe acest hardware la acest nivel de suport.
                     Trei ieșiri posibile, în ordinea preferinței:
                     (a) reduceri costul de suport (self-service: produsul trebuie să nu
                         genereze ticket-uri — de exemplu, un server de joc cu panou,
                         nu un bot care cere ajutor la fiecare deployment)
                     (b) adaugă un cost unic de setup (vezi §6.3) care amortizează CAC-ul
                         fără să taxeze ARPU-ul recurent
                     (c) schimbă hardware-ul (mai multe vCPU per client ⇒ mai puțini
                         clienți pe server ⇒ cost fix pe client mai mare, nu mai mic)
```

> **Observația care schimbă cadrul:** cu 1 vCPU per instanță, serverul are 16 sloturi. Prețul de €9.99 este **sub plafonul de vCPU** (prețul per vCPU scade cu configurația, deci un client cu 4 GB plătește €14.17 pentru 4 vCPU-uri = €3.54/vCPU, față de €9.99/vCPU la 1 vCPU). **Platforma nu are o problemă de „preț prea mic pentru hardware" la capătul de sus al cardului — are o problemă de „card prea jos" la capătul de jos, unde prețul per vCPU e cel mai mare și marja pe hardware e cea mai bună.** Ridicarea prețului de intrare folosește exact capacitatea care azi se vinde sub preț.

---

## 4. Efectul unei reduceri pentru plata anticipată anuală

> **Stare: PROPUNERE, nu capabilitate.** Nu există plan anual în sistem: `BillingPeriod` are `MONTHLY | YEARLY` (`schema.prisma:209-212`) dar toate rândurile sunt `MONTHLY` și nu există cod care creeze un preț `YEARLY` (`pricing.ts:69-79`). În plus, `renew()` fabrică facturi `PAID` pentru sume neîncasate (`billing.ts:248`) — deci înainte de reparare, o campanie anuală ar produce **facturi plătite care nu au fost plătite**. **Ordinea corectă: repară `renew()`, apoi construiește planul anual, abia apoi îl vinde.**

### 4.1 Efectul asupra fluxului de numerar

```text
Plan anual cu 2 luni gratuite:  12 × 9.99 × (1 − 2/12) = 99.90 EUR în luna 0
Echivalent lunar:                99.90 / 12 = 8.3250 EUR/lună
```

| | plată lunară | plată anticipată anual |
|---|---:|---:|
| numerar în luna 0 (15 clienți) | 149.85 | **1 498.50** |
| numerar pe 12 luni | 1 798.20 | 1 498.50 |
| luni de cost fix acoperite cu numerarul din luna 0 | 2.5 | **24.6** |
| NPV la 12%/an | 112.44 (anuitate 11.2551 × 9.99) | 99.90 (integral în luna 0) |
| **costul economic al reducerii** | — | **12.54 EUR/client** (11.2% din NPV-ul planului lunar) |

**Ce cumpără reducerea anuală:** 12.54 EUR de valoare economică per client, în schimbul a **24.6 luni de runway de numerar** și a unei **sigure de 12 luni de venit** (un client lunar cu churn 5% supraviețuiește 12 luni cu probabilitatea `0.95^12 = 0.5404` — deci aproape jumătate din clienți pleacă înainte de un an, iar plata anticipată transformă acea probabilitate în venit garantat).

**Ce costă:** reducerea se finanțează din contribuție: `2 × 4.1903 = 8.3806 EUR` per client, iar **break-even-ul urcă de la 15 la 24 de clienți**:

```text
contribution(8.3250) = 0.97 × 8.3250 − 5.50 = 2.5753
n_be = ceil(61.00 / 2.5753) = ceil(23.69) = 24
```

**Verdict:** plata anticipată anuală este un instrument de **finanțare**, nu de **rentabilitate**. Ea face platforma solvabilă mai devreme, dar micșorează contribuția cu 39%. **La 24 de clienți pe 16 sloturi, planul anual nu încape în capacitate.** Deci: plata anticipată anuală este fezabilă doar cu **al doilea nod** (32 sloturi).

---

## 5. Ce costă o reducere pe prima lună, la volumele curente, și ce cumpără

### 5.1 La volumele curente

| măsurătoare | valoare | sursă |
|---|---:|---|
| clienți plătitori | **0** | `0` abonamente, `0` facturi, `0` plăți (`VERIFIED`) |
| comenzi plătite | **0** | `05-commerce-and-billing.md` §3.2 |
| checkout funcțional | **nu** | `503 payments_unavailable` |
| **cost al campaniei anunțate („50% off your first month", „primii 50 de clienți eligibili")** | **€0.00** | nu plătește nimeni |
| **beneficiu al campaniei** | **nemăsurabil** | nu există conversie, nu există trial, nu există coupon Stripe |

**Și mai mult: campania nici nu e livrabilă azi.** Reducerea nu ajunge la Stripe (`stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:192`) ⇒ comanda cu cod eșuează la `verifyAmount` și intră în reîncercare infinită. `maxPerUser` nu poate fi setat nici din UI nici din API (`05-promotions.md` §5.2), deci „primii 50 eligibili" nu e limitat per cont. Iar „doar prima lună" nu are nicio implementare: `grep -rn "coupon\|Coupon\|trial" api/src` → zero rezultate.

### 5.2 Costul după repararea defectului (scenariul de buget)

Prețul recomandat, €9.99:

```text
reducere 50% pe prima lună = 4.995 EUR
luna 1 = 9.99 − 4.995 − 5.7997 = −0.8047   ← prima lună devine pierdere
```

| volum | pierdere creată | buget maxim pentru o campanie **neutră** (discount ≤ contribuția) |
|---|---:|---:|
| 16 redempțri (ocupare plină) | −12.88 EUR | 16 × 4.19 = **67.04 EUR** |
| 50 redempțri (campania anunțată) | −40.23 EUR | 50 × 4.19 = **209.50 EUR** |

**Bugetul total de campanie pe 12 luni** (nu doar prima lună), la prețul recomandat:

```text
buget_promo_max = N_clienți × ( contribution × 12 − CAC )
```

| clienți | calcul | buget maxim 12 luni | pe client |
|---:|---|---:|---:|
| 15 (numărul de break-even) | 15 × (4.1903 × 12 − 25.00) | **€379.25** | €25.28 |
| 16 (ocupare plină) | 16 × (4.1903 × 12 − 25.00) | **€404.54** | €25.28 |

**Ce cumpără o reducere de 50%?** La prețul recomandat, ea **distruge** contribuția primei luni (−0.80 EUR/client). Reducerea maximă care lasă prima lună neutră este **€4.19 (41.9%)**. O campanie cu 50% nu este finanțabilă nici măcar la prețul recomandat.

### 5.3 La prețurile curente

La €1.49 contribuția este deja −4.05/lună, deci **nu există niciun buget de promoție**: orice reducere agravează o pierdere preexistentă. **În această stare, campania de pe homepage nu este o problemă de buget, ci o problemă de model de business.**

---

## 6. Prețul minim viabil — sub care un client nu merită să existe

### 6.1 Formula

Un client **nu merită** să existe dacă:

```text
(a) contribution(P) ≤ 0          → clientul distruge valoare chiar dacă nu costă nimic
(b) CAC / contribution(P) > H     → nu se amortizează în orizontul rezonabil
(c) P < FIXED/N + VC_fix         → nu își acoperă partea din costul fix
```

Rezolvând (a): **`P ≥ 5.67 EUR/lună`**. Rezolvând (b) cu H = 12: **`P ≥ 7.82 EUR/lună`**. Rezolvând (c) la N = 16: **`P ≥ 9.60 EUR/lună`**.

### 6.2 De ce — aritmetica, fără adjective

**La €1.49, costul de suport singur (€5.00/lună) este de 3.36× mai mare decât tot venitul clientului (€1.49).**

```text
venit client:        1.4900
suport:             −5.0000   ← 15 min × 20.00 EUR/h
comision plată:     −0.2947   ← 3% + 0.25
backup:             −0.2500
────────────────────────────
contribuție:        −4.0547 EUR/lună
```

Ca un client la €1.49 să fie breakeven pe cost marginal, ar trebui să consume **mai puțin de 2.84 minute de suport pe lună** — mai puțin de un răspuns pe lună, într-o platformă care are deja 11 ticket-uri pentru 6 utilizatori și un singur operator.

**Prin urmare: sub €5.67/lună, un client nu este ieftin — este un cost.** Și aceasta este o proprietate a **prețului**, nu a marketingului, a ocupării sau a numărului de clienți: adăugarea de clienți la €1.49 crește pierderea cu 4.05 EUR pe client pe lună.

### 6.3 A treia ieșire: cost unic de setup

Niciun client cu contribuție pozitivă nu trebuie neapărat plătit să rămână — poate fi plătit să **intre**:

```text
setup_fee ≥ CAC + (luni de suport din trial) − contribuția lunară × luni
```

Un cost unic de **€12–15** ar acoperi CAC-ul (€25) amortizat pe 6–12 luni și ar permite un ARPU recurent mai mic fără pierdere. **Capabilitate inexistentă:** `Order.kind = NEW | UPGRADE` și `OrderItem.unitAmount` există, dar checkout-ul Stripe este `mode: 'subscription'` (`stripe.ts:172-179`) — nu există model de „plată unică + abonament". **Necesită dezvoltare**; nu este o modificare de configurare.

---

## 7. Sensibilitatea marjei de contribuție la preț

`contribution(P) = 0.97 × P − 5.50` · `margin = contribution / P` · `payback = CAC 25 / contribution` · `n_be = ceil(61.00 / contribution)`

| preț | VC | contribuție | marjă | payback @CAC 25 | n_be |
|---:|---:|---:|---:|---:|---:|
| 1.49 | 5.5447 | −4.0547 | −272.1% | — | — |
| 1.72 | 5.5516 | −3.8316 | −222.8% | — | — |
| 2.29 | 5.5687 | −3.2787 | −143.2% | — | — |
| 2.99 | 5.5897 | −2.5997 | −86.9% | — | — |
| 3.12 | 5.5936 | −2.4736 | −79.3% | — | — |
| 3.49 | 5.6047 | −2.1147 | −60.6% | — | — |
| 3.99 | 5.6197 | −1.6297 | −40.8% | — | — |
| 4.49 | 5.6347 | −1.1447 | −25.5% | — | — |
| 4.56 | 5.6368 | −1.0768 | −23.6% | — | — |
| 4.99 | 5.6497 | −0.6597 | −13.2% | — | — |
| 5.49 | 5.6647 | −0.1747 | −3.2% | — | — |
| **5.67 (prag)** | 5.6701 | 0.0000 | 0.0% | — | — |
| 5.90 | 5.6770 | +0.2230 | +3.8% | 112.11 luni | 274 |
| 5.99 | 5.6797 | +0.3103 | +5.2% | 80.57 luni | 197 |
| 6.22 | 5.6866 | +0.5334 | +8.6% | 46.87 luni | 115 |
| 6.49 | 5.6947 | +0.7953 | +12.3% | 31.43 luni | 77 |
| 6.99 | 5.7097 | +1.2803 | +18.3% | 19.53 luni | 48 |
| 7.49 | 5.7247 | +1.7653 | +23.6% | 14.16 luni | 35 |
| **7.82 (prag payback 12 luni)** | 5.7346 | +2.0854 | +26.7% | 11.99 luni | 30 |
| 7.99 | 5.7397 | +2.2503 | +28.2% | 11.11 luni | 28 |
| 8.49 | 5.7547 | +2.7353 | +32.2% | 9.14 luni | 23 |
| 8.99 | 5.7697 | +3.2203 | +35.8% | 7.76 luni | 19 |
| 9.49 | 5.7847 | +3.7053 | +39.0% | 6.75 luni | 17 |
| **9.60 (prag absorbție @16)** | 5.7880 | +3.8120 | +39.7% | 6.56 luni | 17 |
| **9.97 (prag payback 6 luni)** | 5.7991 | +4.1709 | +41.8% | 5.99 luni | 15 |
| **9.99 (RECOMANDAT)** | **5.7997** | **+4.1903** | **+41.9%** | **5.97 luni** | **15** |
| 10.99 | 5.8297 | +5.1603 | +47.0% | 4.84 luni | 12 |
| 11.99 | 5.8597 | +6.1303 | +51.1% | 4.08 luni | 10 |
| 12.99 | 5.8897 | +7.1003 | +54.7% | 3.52 luni | 9 |
| 13.99 | 5.9197 | +8.0703 | +57.7% | 3.10 luni | 8 |
| 14.17 (max cu base 976) | 5.9251 | +8.2449 | +58.2% | 3.03 luni | 8 |
| 14.40 | 5.9320 | +8.4680 | +58.8% | 2.95 luni | 8 |

**Observația de formă a curbei:** marja **crește** cu prețul (54% la €13, 59% la €14.40), pentru că comisionul de plată este procentual. **Creșterea prețului nu doar produce bani, ci și îmbunătățește marja procentuală** — efectul opus celui de pe un card cu preț fix, unde marja crește mai lent.

---

## 8. Ce trebuie reparat **înainte** de a se vinde orice

Niciuna dintre recomandările de mai sus este executabilă în codul de azi. Ordinea:

| # | blocaj | de ce blochează prețul | fișier/linie |
|---|---|---|---|
| 1 | **Nu se poate plăti** (`503 payments_unavailable`) | fără plată nu există venit, deci nu există LTV, CAC sau churn măsurabil | `stripe.ts:150-153`; `PAYMENTS_ENABLED=false` |
| 2 | **Reducerea nu ajunge la Stripe** | orice campanie eșuează la checkout și distruge comenzi | `stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:192` |
| 3 | **`renew()` fabrică facturi `PAID`** pentru sume neîncasate | orice plan anual sau metrică de retenție ar fi falsă | `billing.ts:96-142`, `billing.ts:248` |
| 4 | **Nu există plan anual** | plata anticipată anuală nu poate fi vândută | `schema.prisma:209-212`, `pricing.ts:69-79` |
| 5 | **Produs nou = gratuit** (`baseAmount` implicit 0) | un produs nou poate fi vândut cu preț 0 | `admin.ts:428,460` |
| 6 | **Nicio logică de taxă** | dacă se colectează TVA, venitul net scade cu rata (necunoscută) | `05-commerce-and-billing.md` §4 |
| 7 | **Nu există backup off-host** | vânzarea de date fără nicio copie în afara RAID 0 este un risc de insolvență și de răspundere, nu doar tehnic | `03-disaster-recovery.md` §1, §6 Etapa 0 |
| 8 | **Nu există `maxPerUser`** | „primii 50 eligibili" nu e limitabil per cont | `05-promotions.md` §5.2 |
| 9 | **Nicio politică de retenție** (`Setting` = 0 rânduri) | clienții anulați ocupă disc la nesfârșit; LTV-ul calculat e optimist | `billing.ts:30-34` |

---

## 9. Rezumat

| întrebare | răspuns |
|---|---|
| **Preț recomandat** | **€9.99/lună** pentru configurația implicită 512 MB / 1 vCPU / 5 GB a produsului `discord-bot` ⇒ `baseAmount = 976` |
| Pragul de contribuție-zero | **€5.67** |
| Pragul de amortizare CAC 12 luni | **€7.82** |
| Pragul de acoperire a costului fix la 16 clienți | **€9.60** |
| **Preț minim viabil** | **€5.67** — sub acest prag, chiar și un client cu cost de achizițare zero distruge valoare |
| Compararea cu piața | **în așteptare** (`08-competitive-analysis.md` nu există); regula de decizie e în §3 |
| Plata anticipată anuală | **propunere**: cash +24.6 luni runway, n_be 15 → **24**, cost economic 12.54 EUR/client |
| Reducere prima lună la volumele curente | **0.00 EUR** cost, **0** beneficiu măsurabil, și **nu e livrabilă** (defect B2) |
| Reducere maximă neutră la €9.99 | **€4.19** (41.9%); un „50% off" pierde **0.80 EUR** în prima lună |
| **Sensibilitatea marjei** | marja crește de la **−272.1%** la €1.49 la **+41.9%** la €9.99 și **+58.8%** la €14.40 |
