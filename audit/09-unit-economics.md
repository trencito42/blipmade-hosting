# 09 — Economia unitară a unui client

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nu s-a făcut nicio comandă, nicio plată, nicio scriere în DB.
**Sursă unică a numerelor:** `audit/09-financial-assumptions.md`. Fiecare cifră de mai jos este o funcție de o variabilă de acolo.
**Convenție zecimală:** punct (`.`). Monedă: EUR. Sumele de preț sunt în EUR major units; cardul platformei este în unități minori (EUR cents).

> **Acesta este un model de SCENARII, nu o prognoză.** Platforma are `0` abonamente, `0` facturi, `0` plăți, checkout-ul răspunde `503 payments_unavailable`. Nu există o singură observație de comportament de client pe care să se construiască o predicție. Ce urmează arată **ce ar trebui să fie adevărat** ca modelul să se închidă, și **unde se închide sau nu**.

---

## 1. Formula de bază, o singură dată

```text
price(MB, vCPU, GB) = baseAmount
                    + max(0, (MB − 256)/1024) × ramPerGb      ← 60
                    + max(0, vCPU − 1)     × cpuPerUnit      ← 40
                    + max(0, GB − 1)       × diskPerGb       ← 2
                                          [minor units = EUR cents]

VC(P) = 0.03 × P + 0.25 + 5.00 + 0.25 + 0.00 = 0.03 × P + 5.50   EUR/client/lună
contribution(P) = P − VC(P) = 0.97 × P − 5.50
margin(P) = contribution(P) / P
```

Sursele: `api/src/services/pricing.ts:39-53` (`VERIFIED`, 255/255 cote live), `09-financial-assumptions.md` §3.

---

## 2. Venitul pe client pe lună — trei configurații de pe card

| configurație | RAM | vCPU | disc | calcul (minor units) | preț | venit/lună |
|---|---|---|---|---|---:|---:|
| **minim** | 256 MB | 1 | 1 GB | `149 + 0 + 0 + 0` | 149 | **€1.49** |
| **implicit** (implicitul wizard-ului; configurația celor 3 instanțe reale) | 512 MB | 1 | 5 GB | `149 + 15 + 0 + 8` | 172 | **€1.72** |
| **intermediar** | 2048 MB | 2 | 10 GB | `149 + 105 + 40 + 18` | 312 | **€3.12** |
| **generos** (22 GB — **selectabil în wizard**) | 4096 MB | 2 | 22 GB | `149 + 225 + 40 + 42` | 456 | **€4.56** |
| generos (20 GB — **doar prin API**) | 4096 MB | 2 | 20 GB | `149 + 225 + 40 + 38` | 452 | €4.52 |
| maxim selectabil | 4096 MB | 4 | 49 GB | `149 + 225 + 120 + 96` | 590 | €5.90 |

**De ce €4.56 și nu €4.52 ca „configurație generoasă":** pasul de disc al wizard-ului este `ceil((50−1)/20) = 3`, deci valorile selectabile de disc sunt 1, 4, 7, 10, 13, 16, 19, 22, 25, … 50. **20 GB nu este selectabil**; 22 GB este. Un model de venit trebuie construit pe configurații pe care un client le poate **cumpăra acum** — altfel modelește o coadă de vânzări care nu se poate materializa. €4.52 rămâne în tabel ca valoare de referință (configurația „game server" folosită de `05-pricing-consistency.md` §8.3), marcată în CSV drept `API-only`.

**Produsul recomandat** (vezi ipoteza din §1 al fișierului de ipoteze): `discord-bot`, singurul produs cu `deployable = true`. **Prețul recomandat: €9.99/lună pentru configurația implicită** → implică `baseAmount` 149 → **976** pentru acest produs (detalii în `09-pricing-recommendations.md`).

---

## 3. Costul variabil pe client pe lună

### 3.1 Două tratamente, pentru două întrebări diferite

| tratament | ce include | întrebarea la care răspunde |
|---|---|---|
| **A — marginal** (contribuție) | comision de plată + suport + backup + trafic | „Cât costă **încă un** client?" → payback, LTV, CAC maxim |
| **B — absorbție completă** | A + cota partea clientului din costul fix al serverului | „Cât trebuie să plătească clientul ca să-și acopere partea?" → pragul de preț, break-even |

**Tratamentul A este cel corect pentru LTV și CAC.** Costul serverului este fix: nu crește cu al 17-lea client. Atribuirea lui per client este o convenție de calcul, nu un cost marginal.

### 3.2 Tratamentul A — costul marginal, pe client, pe lună

| componentă | formulă | valoare la P = €1.49 | valoare la P = €9.99 | sursă |
|---|---|---:|---:|---|
| comision de plată procentual | `0.03 × P` | 0.0447 | 0.2997 | `OPERATOR-INPUT` |
| comision de plată fix | fix | 0.2500 | 0.2500 | `OPERATOR-INPUT` |
| **suport** | `15 min / 60 × 20.00 EUR/h` | **5.0000** | **5.0000** | `OPERATOR-INPUT` |
| backup / stocare (așteptat) | fix | 0.2500 | 0.2500 | `OPERATOR-INPUT` (azi 0.00 — nu există backup) |
| trafic | fix | 0.0000 | 0.0000 | `OPERATOR-INPUT` |
| **TOTAL `VC(P)`** | `0.03 × P + 5.50` | **5.5447** | **5.7997** | derivată |

### 3.3 Tratamentul B — plus cota din costul serverului

```text
ALLOCATED_SERVER_COST_PER_INSTANCE = SERVER_COST_EUR_PER_MONTH / SAFE_INSTANCES_PER_NODE
                                    = 60.00 / 16 = 3.75 EUR/client/lună   (la ocupare 100%)
```

La ocupare parțială, costul fix se împarte între mai puțini clienți:

| clienți plătitori | ocupare pe 16 | cost fix pe client | `VC` total pe client (absorbție) la P = €9.99 |
|---:|---:|---:|---:|
| 4 | 25% | 15.2500 | 21.0497 |
| 8 | 50% | 7.6250 | 13.4247 |
| 12 | 75% | 5.0833 | 10.8830 |
| 16 | 100% | 3.7500 | 9.5497 |

> **Observație:** costul marginal al platformei în sine (VM 103) este ≈ 0 per client: 752 MiB folosiți din 8 GiB, 2.86% din 4 vCPU (`03-capacity-model.md` §3.1). Restricția este **exclusiv** în nodul de jocuri, prin vCPU.

### 3.4 Contribuția și marja

| P | VC(P) | contribuție | marjă | `PRICE_FLOOR` cu 16 clienți |
|---:|---:|---:|---:|---:|
| **1.49** | 5.5447 | **−4.0547** | **−272.1%** | 9.6005 |
| **1.72** | 5.5516 | **−3.8316** | **−222.8%** | 9.6005 |
| 3.12 | 5.5936 | −2.4736 | −79.3% | 9.6005 |
| 4.50 | 5.6368 | −1.0768 | −23.9% | 9.6005 |
| 4.56 | 5.6368 | −1.0768 | −23.6% | 9.6005 |
| 5.90 | 5.6770 | +0.2230 | +3.8% | 9.6005 |
| **9.99** | 5.7997 | **+4.1903** | **+41.9%** | 9.6005 |

---

## 4. Pragul de ARPU (break-even ARPU)

**Definiție:** ARPU-ul la care contribuția acoperă exact costul variabil.

```text
P = 0.03 × P + 5.50
0.97 × P = 5.50
P = 5.50 / 0.97 = 5.6701  EUR/lună
```

**`ARPU_FLOOR_EUR` = €5.67/lună.** Sub acest prag, fiecare client plătitor pierde bani pentru platformă.

La €1.49, contribuția de −4.0547 înseamnă că platforma **plătește 4.05 EUR/lună pentru fiecare client pe care îl servește**.

### 4.1 Câte minute de suport se pot permite fiecare preț

Rezolvând `contribution(P) ≥ 0` pentru suport:

```text
minutes_maxime(P) = ( P − 0.03×P − 0.25 − 0.25 − 0.00 ) / 20.00 × 60
```

| P | minute de suport admise pe client pe lună | verdict la 15 min (bază) |
|---:|---:|---|
| **1.49** | **2.84 min** | ✗ deficit de 12.16 min |
| **1.72** | **3.51 min** | ✗ deficit de 11.49 min |
| 3.12 | 7.58 min | ✗ deficit de 7.42 min |
| 4.50 | 11.60 min | ✗ deficit de 3.40 min |
| 4.56 | 11.77 min | ✗ deficit de 3.23 min |
| 5.90 | 15.67 min | ✓ (cu 0.67 min de marjă) |
| **9.99** | **27.57 min** | ✓ cu 12.57 min de marjă |

---

## 5. CAC și perioada de amortizare (payback)

**Ipoteză:** `CAC_EUR = 25.00` (`OPERATOR-INPUT`; nicio campanie nu a existat, deci nu există bază empirică).

```text
payback_luni = CAC / contribution(P)
max_CAC(H)   = contribution(P) × H
```

| P | contribuție | payback la CAC 25 | CAC maxim la H = 6 luni | CAC maxim la H = 12 luni |
|---:|---:|---:|---:|---:|
| **1.49** | −4.0547 | **nu există** | **0.00** (contribuție negativă) | **0.00** |
| **1.72** | −3.8316 | **nu există** | 0.00 | 0.00 |
| 3.12 | −2.4736 | **nu există** | 0.00 | 0.00 |
| 4.56 | −1.0768 | **nu există** | 0.00 | 0.00 |
| 5.90 | +0.2230 | 112.11 luni | 1.34 | 2.68 |
| **9.99** | **+4.1903** | **5.97 luni** | **25.14** | **50.28** |

La €9.99, `CAC maxim la 6 luni` = 4.1903 × 6 = **€25.14**, adică practic egal cu CAC-ul presupus (€25) — **orice cost de achiziție mai mare face ca un client nou să distrugă valoare chiar dacă prețul este corect**. La 12 luni, maximul este **€50.28**.

---

## 6. LTV — trei scenarii explicite de churn

Formula cerută, scrisă în două forme echivalente:

```text
LTV = ARPU × contribution_margin / churn
    = ARPU × (contribution(P) / ARPU) / churn
    = contribution(P) / churn
```

> **Atenție la unitate:** `churn` este o rată **lunară** în fracție (0.05 = 5%/lună), nu un procent.

| scenariu churn | churn | LTV la P = €1.49 | LTV la P = €1.72 | LTV la P = €5.90 | **LTV la P = €9.99** | LTV/CAC la €9.99 |
|---|---:|---:|---:|---:|---:|---:|
| **conservator** | 2% | −202.73 | −191.58 | 11.15 | **104.76** | 4.19 |
| **bază** | 5% | −81.09 | −76.63 | 4.46 | **83.81** | 3.35 |
| **pesimist** | 10% | −40.55 | −38.32 | 2.23 | **41.90** | 1.68 |

Calculul pentru scenariul de bază la prețul recomandat:

```text
LTV = 0.97 × 9.99 − 5.50) / 0.05 = 4.1903 / 0.05 = 83.81 EUR
```

**La €1.49, LTV este negativ la orice rată de churn.** Formula `LTV = ARPU × marjă / churn` devine `1.49 × (−2.721) / churn` — un număr negativ, adică **platforma pierde bani cu fiecare client, proporțional cu cât de mult trăiește**. Nu există churn, tarif sau campanie care să repare asta: singura lege este prețul.

---

## 7. Sensibilitatea la churn (tabel complet)

`LTV = contribution(P) / churn`, la CAC 25:

### La prețul recomandat **€9.99** (contribuție +4.1903)

| churn/lună | LTV (EUR) | LTV/CAC @ CAC 25 | CAC maxim dacă se cere LTV/CAC ≥ 3 |
|---:|---:|---:|---:|
| 1% | 419.03 | 16.76 | 139.68 |
| 2% | 209.52 | 8.38 | 69.84 |
| 3% | 139.68 | 5.59 | 46.56 |
| **5% (bază)** | **83.81** | **3.35** | **27.94** |
| 8% | 52.38 | 2.10 | 17.46 |
| 12% | 34.92 | 1.40 | 11.64 |

### La prețul curent minim **€1.49** (contribuție −4.0547)

| churn/lună | LTV (EUR) | LTV/CAC @ CAC 25 |
|---:|---:|---:|
| 1% | −405.47 | −16.22 |
| 2% | −202.73 | −8.11 |
| 3% | −135.16 | −5.41 |
| 5% | −81.09 | −3.24 |
| 8% | −50.68 | −2.03 |
| 12% | −33.79 | −1.35 |

> **Sensibilitatea la churn este secundară.** Churn-ul schimbă *cât* de repede se pierde valoarea, nu *semnul* ei. La €1.49 semnul este negativ la orice churn, de la 1% la 12%.

---

## 8. Pragul de plățibilitate al CAC — și ce înseamnă el

| regulă | formulă | valoare la P = €9.99 | valoare la P = €1.49 |
|---|---|---:|---:|
| amortizare în 6 luni | `CAC ≤ contribution × 6` | **25.14** | 0.00 (nerealizabil) |
| amortizare în 12 luni | `CAC ≤ contribution × 12` | **50.28** | 0.00 |
| LTV/CAC ≥ 3 (la churn 5%) | `CAC ≤ LTV/3` | **27.94** | negativ |

**Plafonul efectiv de CAC la prețul recomandat este ~€25–€27**, adică aproximativ valoarea presupusă. La prețul curent minim, **plafonul de CAC este 0.00** — nu „mic", ci **zero**, pentru că valoarea creată de client este negativă.

---

## 9. Sensibilitatea la conversia trial → plătitor

**Precondiție, verificată:** platforma **nu are trial**. `grep -rn "coupon\|Coupon\|trial" api/src` → zero rezultate (`05-promotions.md` §9). C3 este o ipoteză de planificare pentru o funcționalitate inexistentă.

Modelul unui trial de 1 lună:

```text
CAC_efectiv_per_client_plătitor = ( CAC + TRIAL_PERIOD_COST ) / conversie
                                  = ( 25.00 + 5.25 ) / conversie
payback_luni = CAC_efectiv / contribution(P)
```

### La P = €9.99 (contribuție +4.1903)

| conversie trial → plătitor | CAC efectiv | payback | CAC maxim la H = 12 luni | CAC maxim la H = 6 luni |
|---:|---:|---:|---:|---:|
| 20% | 151.25 | 36.1 luni | 4.81 | −0.22 (imposibil) |
| **30% (bază)** | 100.83 | 24.1 luni | 9.84 | 2.29 |
| 50% | 60.50 | 14.4 luni | 19.89 | 7.32 |
| 60% | 50.42 | 12.0 luni | 24.92 | 9.84 |
| 70% | 43.21 | 10.3 luni | 29.95 | 12.35 |
| 80% | 37.81 | 9.0 luni | 34.98 | 14.86 |

**Conversia minimă pentru un payback acceptabil:**

```text
conversie_minimă(H) = ( CAC + TRIAL_PERIOD_COST ) / ( contribution × H )
```

| orizontă | conversie minimă la P = €9.99 |
|---|---:|
| 12 luni | **60.2%** |
| 6 luni | **120.3%** — imposibil |

### La P = €1.49 și €4.56

Contribuția este negativă ⇒ **nicio rată de conversie, oricât de mare, nu face modelul să se închidă.** Un trial la 100% conversie și cost de achiziție zero ar produce totun clienți cu contribuție de −4.05 EUR/lună.

> **De ce un trial agravează situația aici:** trialul adaugă un cost de serviciu (5.25 EUR) înainte de orice venit, iar rata de conversie multiplică costul de achiziție. La 30% conversie, costul efectiv per client plătitor este 100.83 EUR — de patru ori CAC-ul nominal.

---

## 10. Plafonul de payout pentru afiliat

Un afiliat plătit din venitul clientului **reduce contribuția**. Trei plafoane, de la cel mai lax la cel mai restrictiv:

```text
(1) plafon de contribuție zero:   pct_max = contribution / ARPU
(2) plafon de amortizare 12 luni (comision recurent): pct_max = (contribution − CAC/12) / ARPU
(3) plafon de amortizare 6 luni:   pct_max = (contribution − CAC/6) / ARPU
```

| P | contribuție | (1) plafon contribuție-zero | (2) plafon 12 luni | (3) plafon 6 luni | bounty unic maxim (EUR) |
|---:|---:|---:|---:|---:|---:|
| **1.49** | −4.0547 | **0%** | 0% | 0% | 0.00 |
| **1.72** | −3.8316 | **0%** | 0% | 0% | 0.00 |
| 3.12 | −2.4736 | **0%** | 0% | 0% | 0.00 |
| 4.56 | −1.0768 | **0%** | 0% | 0% | 0.00 |
| 5.90 | +0.2230 | 3.8% | −31.5% (nerealizabil) | nerealizabil | negativ |
| **9.99** | **+4.1903** | **41.9%** | **21.1%** | **0.2%** | **25.28** |

**Plafonul recomandat pentru un program de afiliat: 20% recurent la prețul de €9.99** (sub plafonul de 21.1% pentru amortizare în 12 luni). **La prețurile curente, plafonul este 0%** — un afiliat pe o platformă care pierde bani pe fiecare client agravează pierderea.

---

## 11. Bugetul maxim de promoție care nu distruge contribuția

### 11.1 Pe client

```text
discount_maxim_neutral = contribution(P)          (prima lună nu pierde bani)
```

| P | contribuție | discount maxim pe prima lună | ca % din prima lună | la prețul recomandat |
|---:|---:|---:|---:|---|
| 1.49 | −4.0547 | **niciunul** | — | contribuția e deja negativă |
| 1.72 | −3.8316 | **niciunul** | — | idem |
| 4.56 | −1.0768 | **niciunul** | — | idem |
| **9.99** | **+4.1903** | **€4.19** | **41.9%** | — |

La €9.99, o reducere de **50%** pe prima lună (€4.995) **depășește contribuția**:

```text
luna 1 = 9.99 − 4.995 − 5.7997 = −0.8047   ← prima lună devine pierdere
× 50 de redempțri = −40.23 EUR distruși
× 16 de redempțri = −12.88 EUR distruși
```

### 11.2 Bugetul total de campanie

```text
buget_promo_max = N_clienți × ( contribution × 12 − CAC )
```

| scenariu | calcul | buget maxim 12 luni | pe client |
|---|---|---:|---:|
| 15 clienți (numărul de break-even) | 15 × (4.1903 × 12 − 25.00) | **€379.25** | €25.28 |
| 16 clienți (ocupare plină) | 16 × (4.1903 × 12 − 25.00) | **€404.54** | €25.28 |

### 11.3 Costul promoției **așa cum funcționează azi** (defectul B1/B2)

> **Regula de modelare impusă de defect:** o reducere **nu ajunge la Stripe**. `createCheckout` trimite `item.unitAmount` **nediscountuit** (`stripe.ts:175`), `order.total` este discountuit (`orders.ts:79`), `verifyAmount` compară strict (`webhooks.ts:188-196`) ⇒ `Order FAILED` + `audit order.amount_mismatch` + reîncercare infinită Stripe.

| scenariu | ce plătește clientul | ce se întâmplă | costul real pentru platformă |
|---|---|---|---|
| **azi, așa cum e codul** | **prețul integral** (reducerea nu ajunge la Stripe) | comanda **eșuează** la `verifyAmount`; nicio instanță nu e provisionată | **0.00 EUR** în numerar — dar **comanda e distrusă**: campania produce pierderi de clienți, nu reduceri |
| **după repararea defectului** | prețul redus | comanda trece | costul real = discountul, **finanțat din contribuție**: €4.99 la 50% pe €9.99 |

**La volumele curente (0 clienți, 0 plăți, checkout `503`), costul campaniei anunțate pe homepage („50% off your first month", „primii 50 de clienți eligibili") este 0.00 EUR și beneficiul ei este **nemăsurabil** — nu există nicio conversie, niciun trial, niciun coupon Stripe.** În plus, campania nici nu e livrabilă: `maxPerUser` nu poate fi setat nici din UI nici din API (`05-promotions.md` §5.2, M2), iar „50% off your first month" nu este implementabil cu motorul actual (nu există noțiunea de „prima perioadă", `grep "coupon\|trial"` → zero rezultate).

---

## 12. Ce înseamnă concret prețul curent de €1.49/lună

Punctul cerut de audit, spus fără atenuări:

1. **Contribuția este −4.05 EUR/lună pe client.** La 16 clienți (ocupare plină a nodului): venit €23.84, cost variabil €88.72, **rezultat operațional −€125.88/lună** față de cost fix de €61.00.
2. **Suportul singur (€5.00/lună) depășește tot venitul clientului (€1.49).** Ca să nu piardă bani, un client la €1.49 ar trebui să consume **mai puțin de 2.84 minute de suport pe lună** — adică un răspuns pe lună, fără follow-up, la o platformă unde există deja 11 ticket-uri pentru 6 utilizatori.
3. **LTV este negativ** (−81.09 la churn 5%), deci **LTV/CAC este negativ** și **CAC maxim = 0.00**. Orice efort de vânzare la €1.49 accelerează pierderea.
4. **Nu există niciun preț de pe cardul curent care să funcționeze**, nici la ocupare plină: la €5.90 (configurația maximă) contribuția este +0.22/lună, payback 112 luni, iar break-even-ul ar necesita **274 de clienți** pe un nod care ține 16.
5. **Plafonul de preț al platformei este sub pragul ei de cost**: pragul de contribuție-zero este €5.67, pragul de amortizare CAC 12 luni este €7.82, pragul de acoperire a costului fix la 16 clienți este €9.60 — **toate deasupra cardului curent (€1.49–€5.90)**.

> **Prin urmare: la prețurile curente, fiecare client adăugat crește pierderea.** Nu este o problemă de vânzări, de marketing sau de ocupare. Este o problemă de **preț**, rezolvată prin schimbarea prețului, prin reducerea costului de suport (self-service) sau printr-un cost unic de setup — nu prin „mai mulți clienți".

---

## 13. Rezumatul cifrelor-cheie

| măsurătoare | valoare bază | ipoteze pe care stă |
|---|---:|---|
| Venit/client/lună la minim | **€1.49** | card `149` |
| Venit/client/lună la implicit | **€1.72** | card `172` |
| Venit/client/lună la generos (selectabil) | **€4.56** | card `456` |
| **Venit/client/lună recomandat** | **€9.99** | `baseAmount` 976 pentru `discord-bot` |
| Cost variabil/client/lună @ €9.99 | **€5.80** | V1–V7 |
| Contribuție @ €9.99 | **+€4.19** (41.9%) | — |
| **Prag ARPU (break-even)** | **€5.67** | V1–V7 |
| Prag payback 12 luni | **€7.82** | + CAC 25 |
| Prag full-absorption @16 | **€9.60** | + FIXED 61 |
| **Break-even platformă** | **15 clienți @ €9.99 = €149.85/lună** | F=61, V=15 min, CAC 25 |
| **Payback la €9.99, CAC 25** | **5.97 luni** | — |
| **CAC maxim (12 luni)** | **€50.28** (efectiv ~€25–27 cu regula LTV/CAC ≥ 3) | — |
| **LTV @ €9.99, churn 5%** | **€83.81** (LTV/CAC 3.35) | — |
| Conversie trial minimă (12 luni) | **60.2%** | C1, C3, C5 |
| Plafon afiliat recomandat | **20% recurent** (max 21.1%) | — |
| Buget promoție 12 luni | **€379.25** (15 clienți) / **€404.54** (16) | — |
| Discount maxim prima lună | **€4.19** (41.9%) la €9.99 | — |

Toate valorile sunt reproduce de `audit/09-break-even-model.csv` prin coloanele `variable_cost_formula` și `variable_cost_eur_per_customer_per_month`.
