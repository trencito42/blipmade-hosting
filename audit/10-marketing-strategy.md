# 10 — Strategie de marketing (go-to-market)

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nu s-a făcut nicio comandă, nicio plată, nicio campanie, nicio scriere în DB.
**Sursă unică a cifrelor economice:** `audit/09-financial-assumptions.md` (prin `audit/09-unit-economics.md` și `audit/09-pricing-recommendations.md`).
**Clase de verificare:** cele din `00-BRIEFING.md` §0; în plus, unde apare o cifră care depinde de o ipoteză a operatorului, e marcat `OPERATOR-INPUT` (convenție din `09-financial-assumptions.md` §0).

> **Acesta este un plan de SCENARII, nu o prognoză.** Platforma are `0` abonamente, `0` facturi, `0` plăți, `0` promoții. Nu există o singură observație de comportament de client. Orice procent de conversie, orice volum și orice sumă investită de mai jos este o **ipoteză explicită, etichetată**, nu o măsură.

---

## 1. Restricția de ordine — este coloana vertebrală a acestui plan

### 1.1 Faptul, într-un rând

**Platforma nu poate lua o plată, deci nu poate primi o comandă plătită, deci nu poate avea un canal de conversie cu venit.** `VERIFIED` — `POST /api/orders/:id/checkout` → `503 payments_unavailable` (`api/src/services/stripe.ts:150-153`; `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol — `00-BRIEFING.md` §5).

### 1.2 Ce se poate face **înainte** de poartă și ce nu

| activitate | înainte de poartă? | de ce | clasă |
|---|---|---|---|
| **Înregistrare cont** | ✅ **da** | `POST /auth/register` funcționează; **login-ul nu verifică `emailVerifiedAt`** (`api/src/routes/auth.ts:166-188`), deci un vizitator poate crea cont și intra în panou fără e-mail | `CODE-INSPECTED` |
| **Navigare în panou, ticket de suport** | ✅ **da** | 8 rute de tichete, 13+9 teste verzi, volum montat | `VERIFIED` (`00-current-state.md` §3.6) |
| **Comandă fără plată** | ⚠️ **da, dar fără rost** | `POST /api/orders` creează o comandă `PENDING`; nu se poate plăti, deci nu se produce instanța (creată doar în `fulfilOrder()`, `api/src/routes/webhooks.ts:151`) | `VERIFIED` |
| **Plată** | ❌ **nu** | `503 payments_unavailable` | `VERIFIED` |
| **Campanie cu cod de reducere** | ❌ **nu** | **B1**: reducerea nu ajunge la Stripe ⇒ comanda **eșuează** la `verifyAmount` (`stripe.ts:175` vs `orders.ts:79` vs `webhooks.ts:188-196`); și `maxPerUser` e cod mort ⇒ „primii 50 eligibili" nu e limitabil per cont | `CODE-INSPECTED` |
| **Campanie pe e-mail** | ❌ **nu** | `SMTP_URL` gol ⇒ transportul e `file`, mesajele ajung **pe disc**, `delivered:false`. Un e-mail de campanie nu ajunge la nimeni | `VERIFIED` (`00-BRIEFING.md` §5.2) |
| **Promisiune de reducere pe homepage** | ❌ **nu** | blocul „Founding users offer — 50% off your first month" există deja în cod (`web/src/home/Catalog.tsx:202-213`) și **nu poate fi onorat** | `CODE-INSPECTED` (`05-promotions.md` §9) |
| **„Primii 50 de clienți"** | ❌ **nu** | `maxRedemptions` există, dar `maxPerUser` nu poate fi setat nici din UI, nici din API (`05-promotions.md` §5.2) — deci „eligibili" nu înseamnă „unul per cont" | `CODE-INSPECTED` |
| **Plan anual / plată anticipată** | ❌ **nu** | **B7**: `YEARLY` nu are niciun rând și niciun cod care să-l creeze (`api/prisma/schema.prisma:209-212`, `api/src/services/pricing.ts:69-79`); plus **B4**: `renew()` fabrică facturi `PAID` pentru sume neîncasate | `NOT-IMPLEMENTED` + `CODE-INSPECTED` |

### 1.3 Ce trebuie reparat, în ordine, cu blocajul asociat

Ordinea este cea din `audit/05-commerce-and-billing.md` §9, completată cu porțile din `audit/07-release-gates.md`.

| ordine | blocaj | efectul lui asupra marketingului | clasă |
|---|---|---|---|
| **1** | **B1** — reducerea trebuie să ajungă la Stripe | **fără B1 nu există nicio campanie cu reducere**; blocul de pe homepage trebuie ascuns sau marcat „not running" | `CODE-INSPECTED` |
| **2** | **B5** — `invoice.paid` înainte de `checkout.session.completed` e consumat și nu reluat | o plată reală poate pierde definitiv documentul de facturare ⇒ **nu se poate vinde cu factură**, iar o campanie cu clienți reali expune bug-ul la 100% | `CODE-INSPECTED` |
| **3** | **B6** — o comandă anulată poate fi plătită și onorată ulterior | clientul primește serviciu pentru o comandă anulată, iar promoția e consumată | `CODE-INSPECTED` |
| **4** | **B3** — `applyUpgradeOrder()` nu verifică plata | latent azi; devine exploziv la primul upgrade plătit | `CODE-INSPECTED` |
| **5** | **B4** — `renew()` fabrică facturi `PAID` | orice metrică de retenție ar fi falsă ⇒ **niciun KPI de LTV/churn nu poate fi publicat** | `CODE-INSPECTED` |
| **6** | **B2** — prețul stocat ≠ prețul configurației, fără reconciliere | estimarea lunară a clientului e greșită; într-o campanie cu preț, e o plângere de tarif | `CODE-INSPECTED` + `VERIFIED` |
| **7** | **B9, B10** — unitatea nu e în contract; produs nou pornește cu `baseAmount = 0` | un produs nou poate fi vândut **gratuit**; B9 a produs deja o eroare de 100× în raportarea internă | `CODE-INSPECTED` |
| **8** | **B11, B12** — promoții nu se pot edita; counterul afișat ≠ counterul aplicat | o campanie greșită **nu poate fi oprită din interfață** | `CODE-INSPECTED` |
| **9** | **B8** — fără retenție la anulare | resurse ocupate la nesfârțit ⇒ orice campanie cu volum umple nodul cu clienți plecați | `VERIFIED` (DB: `Setting` = 0 rânduri) |
| **10** | **B7** — plan anual inexistent | nicio campanie cu „plată anuală, două luni gratis" | `NOT-IMPLEMENTED` |

### 1.4 Condițiile de poartă care blochează *canalul*, nu doar *produsul*

Din `audit/07-release-gates.md` §3, verdictul este **❌ NO-GO** (5 porți RED: fiabilitatea provisionării, produs vândut fără runtime verificat, lipsa recuperării în afara hostului, funcții de bază indisponibile, securitatea infrastructurii critice neverificată). Condițiile care au **impact direct de marketing**:

| condiție | impact de marketing | clasă |
|---|---|---|
| chei Stripe live + `PAYMENTS_ENABLED=true` + un checkout real + un webhook acceptat și unul falsificat refuzat | **deschide singurul canal de venit** | `VERIFIED` (poarta 2: calea live nu a fost executată niciodată) |
| `SMTP_URL` reală + e-mail de verificare și de resetare **livrate** | **deschide canalul de e-mail**; fără el, resetarea de parolă e un dead-end pentru orice client pierdut | `VERIFIED` (poarta 12) |
| backup programat + copie în afara hostului + drill de restaurare | deschide **vânzarea de date** — nu se poate promite păstrarea unei baze de date fără o copie în afara RAID 0 | `VERIFIED` (poarta 9) |
| un container care rulează efectiv, verificat de pe nod | deschide **promisiunea „rulează 24/7"** — azi panoul raportează `state = None` pe toate cele 5 servere | `VERIFIED` (poarta 7) |
| 20 de rulări consecutive comandă → plată → provisionare → activare, toate reușite | deschide **promisiunea „deploy instant"** și orice campanie de volum | `VERIFIED` (poarta 5: 30 joburi `failed` din 123) |
| rambursare cu alarmă + job de reconciliere cu Stripe | deschide **vânzarea cu garanție de înapoiere**, cerută de orice client B2B | `VERIFIED` (poarta 3) |

### 1.5 Consecința: **niciun canal cu venit nu poate porni înainte de poartă**

Aceasta nu e o recomandare de prudență; e o consecință aritmetică:

```text
la prețurile curente, contribuția este negativă la orice configurație
  → la €1.72 (prețul celor 3 instanțe vii): contribuție −€3.83/client/lună
  → fiecare client adăugat MĂRESCE pierderea
  → iar comanda lui nu poate fi plătită oricum (503)
```

`VERIFIED` — `audit/09-unit-economics.md` §3.4, §12.

---

## 2. Cele patru faze

| fază | obiectiv | ce se rulează | poarta care o deschide | venit așteptat |
|---|---|---|---|---|
| **F0 — Fundație (acum → poartă)** | **zero tranzacții, totuși totul pregătit** | SEO de fundație, conținut, comunitate, instrumentare, repararea bug-urilor de marketing | **nu are nevoie de poartă** | **€0** — prin construcție |
| **F1 — Primul client plătitor (după poartă)** | 15 clienți = break-even | toate canalele de conversie, prețul €9.99, campanii cu reducere (după B1) | condițiile 1–7 din `07-release-gates.md` §3 | până la €149,85/lună la 15 clienți |
| **F2 — Catalog real (după certificare)** | extinderea ARPU-ului și a cererii | conținut pe clusterul C3, ghiduri, recomandări | `audit/04-product-certification.md` §4.4 | crește peste €149,85/lună |
| **F3 — Game hosting (după backup + DDoS)** | deschiderea celui mai bine documentat segment | conținut pe clusterul C4, parteneriate cu comunități de joc | **backup off-host + protecție DDoS + un rând `Product` pentru `minecraft-paper` + certificare** | noul plafon de venit al nodului |

> **Faza F0 este singura care poate începe imediat** — și tocmai de aceea e cea care decide dacă F1 va reuși. Instrumentarea și conținutul se construiesc în lunile în care plățile sunt reparate, nu după.

### 2.1 Corespondența cu scenariile de decizie

`audit/16-GO-NO-GO-DECISION.md` §6 a ajuns, în aceeași sesiune, la trei scenarii care **se potrivesc exact** cu fazele de mai sus. Nu le contrazic — le confirmă:

| scenariu (`16-` §6) | verdictul lui | faza mea | campania mea |
|---|---|---|---|
| **A** — lansare comercială publică | ❌ **NO-GO** (5 porți RED) | — | niciuna |
| **B** — beta privat, plată manuală, max. 10 clienți, preț de fundare | ⚠️ **GO condiționat** — cele 9 condiții + 3 cerințe | **F1** | **Campania 2 „Founding Ten"** |
| **C** — waitlist și comunitate, fără încasare | ✅ **GO imediat** | **F0** | **Campania 1 „Blipmade Bot Builders"** |

**Trei alinieri importante, luate din `16-`:**

1. **Prețul de fundare se aplică manual**, nu prin codul de promoții — pentru că `COMM-01`/`PROMO-01` fac ca orice reducere să rupă checkout-ul. **Decizie:** campania F1 **nu folosește coduri promoționale**; prețul se negociază și se aplică manual, maximum 10 clienți. `VERIFIED` (`16-` §6, Scenariul B.2)
2. **„Operațiunea e manuală și declarată ca atare"**: contract de test cu fiecare client, backup manual pe fiecare instanță înainte de orice schimbare, și un canal de suport cu un timp de răspuns anunțat explicit. **Decizie:** Campania 2 primește trei precondiții în plus față de cele 13 pe care le aveam: contract de test semnat, backup manual documentat, și un timp de răspuns publicat. `VERIFIED` (`16-` §6, Scenariul B.3)
3. **Celelalte 4 produse ies din catalogul public**, cu „Coming soon" înlocuit de „indisponibil pe acest server" — pentru că un preț afișat pentru un serviciu inexistent e o promisiune neonorată. **Decizie:** și Campania 1 (F0) trebuie să înceapă cu curățarea catalogului, nu doar cu blocul „50% off". `VERIFIED` (`16-` §6, Scenariul B.1)

**O corecție de rational, cu dată:** eu consideram 15 clienți ținta Campaniei 2 (break-even-ul din `09-unit-economics.md` §13); `16-` §6 limitează Scenariul B la **maximum 10 clienți**, pentru că în beta operațiunea e manuală și un singur operator nu poate onora 15 clienți cu suport cu timp de răspuns anunțat. **Am aliniat Campania 2 la 10 clienți**, cu creșterea la 15 numai după ce canalul de suport devine susținabil.

---

## 3. Funnelul

### 3.1 Definiția etapelor

| etapă | eveniment | unde se poate măsura azi | instrument necesar |
|---|---|---|---|
| **E1 — descoperire** | vizitator ajunge pe o rută publică | ❌ **nu** — nicio analytics, niciun contor în interfață | Search Console + contor server-side |
| **E2 — interes** | vizitează `/apps` sau o pagină de produs | ❌ **nu** | idem |
| **E3 — cont** | creează cont (`POST /auth/register`) | ⚠️ **da, parțial** — `AuditLog` scrie evenimentele de auth (`auth.ts:178,184`) | `AuditLog` există și e complet (`VERIFIED`) — **singura pârghie de măsurare disponibilă azi** |
| **E4 — activare** | deschide o sesiune | ⚠️ **da** — `auth.login` în `AuditLog` | idem |
| **E5 — intenție de plată** | creează o comandă | ⚠️ **da** — `Order` cu status `PENDING` / `AWAITING_PAYMENT` | baza de date |
| **E6 — plată** | `Order.status = PAID` | ⚠️ **da** — dar **`0` rânduri** azi | baza de date |
| **E7 — activare serviciu** | instanța e provisionată și online | ⚠️ **da** — `InstanceEvent`, `ProvisioningJob`, `AuditLog` | baza de date |
| **E8 — retenție** | abonament activ la 30/60/90 de zile | ❌ **nu** — `0` abonamente, și **B4** ar fabrica metrici false | baza de date, după repararea lui B4 |
| **E9 — recomandare** | utilizatorul trimite altcineva | ❌ **nu** — nu există niciun mecanism de referral sau de cod de invitare (`grep` → zero rezultate) | de construit |

`VERIFIED` / `CODE-INSPECTED` — vezi `audit/10-growth-metrics.md` §2 pentru măsurarea efectivă a fiecăreia.

### 3.2 Ce înseamnă asta pentru strategia de canal

**În F0, singurele etape măsurabile sunt E3, E4, E5 și E7.** Înseamnă că **singura activitate de marketing care poate fi măsurată cu instrumentele existente este „a duce oameni în cont"** — nu „a genera venit". De aceea, F0 are un singur obiectiv măsurabil:

> **maximizarea numărului de conturi create de oameni reali, din canalele care nu costă bani** — pentru a avea, în momentul deschiderii plăților, o listă de oameni care **au întrebat deja** și o bază de clienți reali pe care se poate construi F1.

### 3.3 De ce nu există un „funnel de conversie" azi

| cauză | clasă |
|---|---|
| nicio bibliotecă de analytics în `web/package.json` (dependențe: `react`, `react-dom`, 2 fonturi) | `CODE-INSPECTED` |
| niciun contor, niciun `sendBeacon`, niciun `gtag`, `plausible`, `posthog`, `umami` în cod | `CODE-INSPECTED` (`grep` pe tot repo-ul) |
| `Setting` = 0 rânduri ⇒ niciun eveniment configurabil de tracking | `VERIFIED` |
| nu există niciun script de analiză a log-urilor Caddy | `CODE-INSPECTED` |

---

## 4. Canalele

### 4.1 Principiul de selecție

Un canal se alege pe baza a **două condiții simultane**:
1. **poate fi onorat?** — leadul trebuie să ajungă la un produs pe care platforma îl poate onora;
2. **poate fi măsurat?** — trebuie să existe un eveniment observabil în `AuditLog` sau în DB.

Un canal care încalcă (1) produce clienți furioși; un canal care încalcă (2) produce buget aruncat.

### 4.2 Matricea canalelor

| # | canal | etapă pe care o deservește | onorabil azi? | măsurabil azi? | cost | blocaj | clasă |
|---|---|---|---|---|---|---|---|
| **K1** | **SEO / conținut** (clusterul C1: Discord bot hosting) | E1, E2 | ✅ — conținut despre `discord-bot` e onest | ⚠️ **nu** (fără Search Console) | **timp** | niciunul pentru conținut; **pentru monetizare**: plățile | `CODE-INSPECTED` (`10-seo.md` §10.3) |
| **K2** | **SEO tehnic** (titluri, sitemap, canonical, OG, JSON-LD) | E1, E2 | ✅ | ⚠️ **nu**, dar e un prerequisite pentru ca Search Console să măsoare ceva | **timp** | niciunul | `CODE-INSPECTED` |
| **K3** | **Comunitate Discord** | E1, E2, E3 | ✅ — **nu necesită niciun cod și nicio plată** | ⚠️ **nu** (niciun contor) | **timp** | **serverul Discord nu există încă** și nu există niciun link social pe site (`grep` → zero rezultate) | `VERIFIED` (absență) |
| **K4** | **Discord-ul ca produs** (un bot Blipmade găzduit pe Blipmade) | E3 | ✅ — singurul produs real | ⚠️ **nu** | **timp** | același: serverul Discord nu există | `CODE-INSPECTED` |
| **K5** | **Outbound direct către utilizatorii existenți** (6 utilizatori, 12 tichete, toate `OPEN`) | E3, E4, E5 | ✅ | ✅ — **`AuditLog` + `Ticket` + `TicketMessage`** | **timp** | **e-mailul nu pleacă** (`SMTP_URL` gol) ⇒ trebuie folosit un canal manual | `VERIFIED` (`00-current-state.md` §3.6, §3.9) |
| **K6** | **Comunități de nișă** (forumuri și subreddit-uri de găzduire Discord / self-hosting) | E1 | ✅ | ❌ | **timp + reputație** | niciunul | `INFERRED` (raționament: canalul nu depinde de platformă) |
| **K7** | **E-mail** (secvența de 3 e-mailuri) | E3, E5 | ❌ — transportul e `file` | ❌ | — | **`SMTP_URL`** | `VERIFIED` |
| **K8** | **Campanie cu reducere / cod promoțional** | E5 | ❌ — **B1**: comanda eșuează; `maxPerUser` e cod mort | ❌ | — | **B1 + M2** | `CODE-INSPECTED` |
| **K9** | **Ads plătite** | E1 | ❌ — CPC-ul ar trebui să fie sub **€25,14** per client plătitor | ❌ | — | **plățile + prețul** | `VERIFIED` (calcul din `09-unit-economics.md` §5) |
| **K10** | **Program de afiliat** | E3 | ❌ — plafonul de comision la prețurile curente este **0%** | ❌ | — | **prețul** (la €9.99, plafonul e 20%, `09-unit-economics.md` §10) | `VERIFIED` |
| **K11** | **Program de recomandare / cod de invitare** | E9 | ❌ — **nu există** în cod | ❌ | — | **de construit** | `NOT-IMPLEMENTED` |
| **K12** | **SEO pe clusterul C4 (jocuri)** | E1 | ❌ — un server Minecraft plătit ar ajunge **fără backup** (lumea pierdută = client pierdut) și **fără DDoS**, deși toți cei 3 concurenți RO îl includ | ❌ | — | **backup + DDoS + produs + certificare** | `VERIFIED` |

### 4.3 Concluzia de selecție

**Canalele care pot porni în F0: K1, K2, K3, K4, K5, K6.** Toate sunt bazate pe **timp**, nu pe buget — exact ceea ce este disponibil înainte de venituri.

**Canalele care sunt blocate de plăți: K7, K8, K9, K10.** **Canalul blocat de rețea: K12.** **K11 trebuie construit.**

---

## 5. Alocarea bugetului — trei scenarii

> **Toate sumele sunt scenarii, nu prognoze.** `CAC_EUR = 25.00` este un `OPERATOR-INPUT` (placeholder: ~1,25 h de vânzare de fondator la 20 €/h) — `audit/09-financial-assumptions.md` §4, C1. Nu există nicio campanie, niciun canal și nicio statistică de achiziție în sistem.

### 5.1 Scenariul A — „Fundație" (F0, înainte de poartă)

**Premisă:** nicio tranzacție posibilă ⇒ **orice euro investit în achiziție se pierde**. Bugetul de marketing = **€0**, iar resursa reală e **timpul fondatorului**.

| linie | alocare | sumă | de ce |
|---|---|---:|---|
| Achiziție plătită (ads, sponsorizări, reclame) | **0%** | **€0.00** | nu se poate monetiza niciun lead; un CPC plătit fără conversie e o pierdere directă |
| Conținut + SEO de fundație (K1, K2) | timp | **€0.00** | singurele canale care nu depind de plăți |
| Comunitate + Discord (K3, K4) | timp | **€0.00** | zero dependențe tehnice; **creează și infrastructura de social link-uri care lipsește de pe site** |
| Instrumentare (Search Console, contor server-side, `PerformanceObserver`) | timp | **€0.00** | **prerequisite** pentru ca F1 să măsoare ceva |
| **Total achiziție plătită** | | **€0.00** | |

**Iesirea din scenariul A, măsurabilă:** numărul de conturi create (`AuditLog`, evenimentul de register), proveniența lor, și **o listă de oameni care au întrebat** (din tichete și din Discord). `AuditLog` are **528 rânduri** și scrie fiecare eveniment de autentificare (`api/src/routes/auth.ts:178,184`) — deci conturile se pot număra **azi**, fără nicio instrumentare nouă. `VERIFIED`

### 5.2 Scenariul B — „Break-even" (F1, după poartă)

**Premisă:** prețul adoptat este **€9.99/lună** pentru 512 MB / 1 vCPU / 5 GB (`baseAmount = 976`) — `audit/09-pricing-recommendations.md` §2.2. Obiectiv: **15 clienți**, numărul de break-even (`09-unit-economics.md` §13).

> **Atenție la două praguri diferite, care nu se contrazic:** **beta-ul privat (Scenariul B din `16-` §6) e plafonat la 10 clienți**, pentru că operațiunea e manuală și un singur operator nu poate onora 15 clienți cu un timp de răspuns anunțat. **15 clienți** e pragul economic de break-even, la care se ajunge **după** ce suportul devine susținabil. Acest scenariu bugetar descrie starea de la break-even, nu prima lună a beta-ului.

| linie | alocare | sumă | raționament |
|---|---|---:|---|
| Achiziție plătită (K9), plafon **CAC €25,14** | 60% | **€225.00** | 15 × €15 (sub plafonul de amortizare la 6 luni, `09-unit-economics.md` §8) |
| Reduceri de campanie | 25% | **€93.75** | plafonul neutral al primei luni e **€4.19/client** (41,9%); 15 × 4,19 = €62,85 — **restul e rezervă**, nu planificat |
| Instrumentare și conținut | 10% | **€37.50** | Search Console, contor, ghiduri |
| Rezervă (nu se cheltuiește fără decizie) | 5% | **€18.75** | |
| **Total buget de campanie** | | **€375.00** | = 15 × CAC €25 |
| **Plafonul absolut de promoție pe 12 luni** | | **€379.25** | `audit/09-pricing-recommendations.md` §5.2 — **bugetul recomandat e sub plafon** |
| **Venit la 15 clienți** | | **€149,85/lună** | 15 × €9.99; acoperă costul fix de €61 cu **+€4.19/client** |
| **Payback per client** | | **5,97 luni** | `audit/09-unit-economics.md` §5 |

**Verificare de coerență:** bugetul de campanie (€375) este plătit înainte ca venitul să existe. La 15 clienți, venitul lunar de €149,85 acoperă costul fix de €61 și lasă €88,85 de contribuție brută ⇒ ** recuperarea bugetului de campanie durează ≈4,2 luni de la break-even** (`INFERRED` din `09-unit-economics.md`).

### 5.3 Scenariul C — „Nod plin" (F1 matur, după certificarea produsului)

**Premisă:** 16 clienți (ocupare 100% a nodului, limitant vCPU), prețul €9.99, plus F2 (catalog real).

| linie | alocare | sumă | raționament |
|---|---|---:|---|
| Achiziție plătită | 55% | **€222.50** | 16 × €13.90 |
| Reduceri de campanie | 20% | **€80.91** | plafonul neutral rămâne €4.19/client; **procentul scade** deoarece contribuția trebuie reinvestită în retenție |
| Conținut pe clusterul C3 (WordPress/DB) | 15% | **€60.68** | acum posibil, pentru că produsele sunt certificate |
| Instrumentare și suport (SLA intern) | 10% | **€40.45** | **cu 16 clienți, suportul devine o cheltuială fixă reală**, nu o ipoteză |
| **Total** | | **€404.54** | = plafonul absolut de promoție pentru 16 clienți (`09-pricing-recommendations.md` §5.2) |
| **Venit la 16 clienți** | | **€159,84/lună** | `audit/09-capacity-and-revenue.md` §2 |
| **Rezultat operațional** | | **+€98,84/lună** | 16 × €4.19 − €61 |

**Observația de risc din acest scenariu:** cu 16 clienți la 15 min de suport/client/lună, costul de suport devine **€80/lună** (`09-unit-economics.md` §3.2). Într-un scenariu cu 16 clienți, **orice reducere a timpului de suport la 10 min/client eliberează ≈€13,33/lună** de contribuție (`INFERRED`, din formula `minutes_maxime(P)` din `09-unit-economics.md` §4.1). Aceasta e singura pârghie de cost pe care marketingul o poate folosi: **fiecare tichet rezolvat în self-service e mai mult decât un tichet rezolvat**.

### 5.4 Ce **nu** se face cu bugetul, în niciun scenariu

| acțiune | de ce nu |
|---|---|
| Ads cu destinație `/apps/wordpress` sau `/apps/postgresql` | 4 din 5 produse nu pot fi comandate; CPC-ul plătit pe o pagină care **refuză comanda cu 400** e pierdere garantată |
| Ads cu destinație către conținut de joc | fără backup și fără DDoS, într-o piață în care le includ toți concurenții ⇒ promisiune neonorabilă |
| Ofertă „50% off" | **B1**: comanda eșuează; și **€4.99 > €4.19** = contribuția primei luni, deci și după reparare, „50%" la €9.99 pierde **€0.80/client** în prima lună (`09-pricing-recommendations.md` §5.2) |
| Ofertă „primul an cu două luni gratis" | **B7**: planul anual nu există; **B4**: `renew()` fabrică facturi plătite false |
| Ofertă „trial gratuit" | **nu există** trial: `grep -rn "coupon\|Coupon\|trial" api/src` → zero rezultate; un trial ar adăuga €5,25 de cost înainte de orice venit, iar conversia minimă pentru amortizare în 12 luni e **60,2%** (`09-unit-economics.md` §9) |
| Program de afiliat la prețurile curente | plafonul de comision este **0%** (`09-unit-economics.md` §10) |
| Program de recomandare înainte de a exista | nu există mecanism; trebuie construit, cu un plafon de **20%** recurent la €9.99 |

---

## 6. Instrumente și măsurare

Detaliul complet este în `audit/10-growth-metrics.md`. Aici, doar ce schimbă decizii:

| instrument | când | ce măsoară | decizia pe care o dirijează |
|---|---|---|---|
| **Search Console** | F0, acum | interogări reale, clicuri, indexare | **ce cuvinte scriem** — și dacă efortul SEO merită |
| **Contor server-side** (endpoint propriu, fără cookie) | F0, acum | vizite pe rută, fără tracking de terțe părți | **unde se duce efortul de conținut** |
| **`AuditLog`** | **existent azi** | register, login, comenzi, provisionări | **dimensiunea reală a audienței**, fără niciun instrument nou |
| **`PerformanceObserver`** (LCP/INP) | F0 | CWV reale | **când să investești în pre-render** |
| **Contor Stripe** | F1 | comenzi plătite, refund-uri | **dacă bugetul de achiziție se închide** |
| **Analiză de loguri Caddy** | F0 | 404-uri reale, inclusiv soft-404-urile | **ce pagini trebuie reparate sau eliminate** |

> **De ce nu analytics cu cookie:** ar necesita consimțământ, banner, politică de confidențialitate și o analiză de conformitate GDPR care **nu a fost făcută** și care trebuie confirmată de un profesionist. Până atunci, instrumentarea de mai sus este fără cookie și fără date personale — și e suficientă pentru deciziile de pe faza F0.

---

## 7. Riscuri strategice

| risc | probabilitate | impact | mitigare |
|---|---|---|---|
| **Lansare cu cardul de preț curent** (€1.49–€5.90) | mare dacă nu se decide explicit | **fiecare client adăugat mărește pierderea** cu €4,05/lună | decizia de preț **€9.99** trebuie luată **înainte** de a deschide plățile, nu după |
| **Lansare cu promisiunea de brand „orice aplicație"** | mare | clienți frustrat + recomandări negative pe un brand cu **zero** recenzii și **zero** utilizatori | restrângerea mesajului la `discord-bot` până la certificare (`10-positioning.md` §7.2) |
| **Promisiune de uptime / SLA fără măsurătoare** | medie | **nu există niciun raport de uptime în sistem** | nicio afirmație de uptime până nu există un raport generat automat |
| **Suport neîncadrat** cu 16 clienți | medie | costul de suport devine fix real (€80/lună) | reducerea timpului de suport/client la ≤10 min prin autoajutorare; alternativa din `09-pricing-recommendations.md` §3 |
| **Trafic organic pe conținut blocat** (C3/C4) | medie | vizitatori pe pagini pentru care nu se poate onora comanda | **nu publica conținut C3/C4 înainte de certificare / rețea** |
| **Capcana „0 clienți, deci 0Metrică"** | mare | se pierde un ciclu complet de dezvoltare | există **528 rânduri de `AuditLog`** și **12 tichete** — există date azi, chiar dacă nu există clienți plătitori |
| **Comisioane greșite de partener / comunitate** | mic | reputație | comunitatea Discord e a fondatorului; partenerii plătiți se introduc doar după repararea lui B11 (promoții editabile) |

---

## 8. Rezumat

| întrebare | răspuns |
|---|---|
| **Se poate lansa o campanie cu venit azi?** | **Nu.** Plățile sunt oprite (`503`), reducerea rupe checkout-ul (B1), e-mailurile nu pleacă (`SMTP_URL` gol) ⇒ **niciun canal cu venit nu poate porni** |
| **Ce se poate face azi?** | F0: SEO de fundație, conținut, comunitate Discord, outbound către cei 6 utilizatori existenți, instrumentare. **€0 cheltuială de achiziție** |
| **Care e bugetul?** | **Scenariul A: €0** (F0) · **Scenariul B: €375** (15 clienți, break-even) · **Scenariul C: €404,54** (16 clienți, nod plin). Toate sub plafonul de promoție de €379,25 / €404,54 |
| **Care e prețul de poartă?** | **€9.99/lună** la 512 MB / 1 vCPU / 5 GB (`baseAmount = 976`) — aliniat cu `audit/09-pricing-recommendations.md` §2.2 |
| **Ce se măsoară azi?** | E3, E4, E5, E7 prin `AuditLog` și baza de date; E1/E2 **nu**; E8/E9 **nu** |
| **Ce trebuie reparat înainte de orice campanie cu reducere?** | **B1**, apoi **B5**, **B6**; iar pentru campanii limitate per cont: **M2** (`maxPerUser`) |
| **Ce trebuie reparat înainte de orice e-mail?** | `SMTP_URL` reală + livrare dovedită a unui e-mail de verificare și a unuia de resetare |
| **Ce blocaj nu este de marketing?** | **backup-ul off-host și protecția DDoS** — blocajele tehnice ale clusterului de jocuri; nu se rezolvă cu buget. *(Corecție față de redactarea inițială: DNAT-ul **nu** e blocajul — `provisioning.ts:218` preferă deja o alocare din blocul publicat `30000:39999`, deci serverul ar fi accesibil, pe un port neobișnuit.)* |
| **De ce F0 e cea mai importantă fază?** | pentru că e singura în care metricile de comportament pot fi construite **fără** cost și **înainte** de venit; după poartă, instrumentarea costă din contribuție |

> **Notă de conformitate:** nu este publicată nicio cotă de piață, niciun volum de căutare, niciun preț de concurență, nicio cifră de uptime, niciun număr de utilizatori în afara celor măsurate în sistem (`6` utilizatori, `0` abonamente, `0` plăți). Sumele de buget sunt scenarii construite pe `CAC_EUR = 25.00`, valoare `OPERATOR-INPUT` marcată ca atare.
