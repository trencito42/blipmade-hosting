# 10 — Metrici de creștere

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nu s-a rulat nicio interogare care să modifice ceva, nu s-a creat nicio sesiune, niciun cont, nicio comandă.
**Sursă unică a cifrelor economice:** `audit/09-financial-assumptions.md`.
**Clase de verificare:** cele din `00-BRIEFING.md` §0.

> **Acesta este un set de măsurători și de instrumente, nu un set de valori.** Platforma are `0` abonamente, `0` facturi, `0` plăți și **6** utilizatori. Niciuna dintre metricile de mai jos are o valoare astăzi. Ce se poate face azi este să se **construiască instrumentul** și să se dovedească că el funcționează — pentru că, în această platformă, **o metrică construită după lansare costă din contribuție**, iar una construită înainte costă doar timp.

---

## 1. Starea de azi a instrumentării

| instrument | există? | ce măsoară | clasă |
|---|---|---|---|
| Analytics cu script terț (Plausible, PostHog, GA, Umami, Segment) | ❌ **nu** | — | `CODE-INSPECTED` — `web/package.json` are doar `react`, `react-dom` și 2 fonturi; `grep` pe tot repo-ul pentru `gtag\|plausible\|posthog\|umami\|segment` → **zero rezultate** |
| Pixel sau beacon (`sendBeacon`, `navigator.sendBeacon`) | ❌ **nu** | — | `CODE-INSPECTED` |
| Tracking de conversie pe evenimente de checkout | ❌ **nu** | — | `CODE-INSPECTED` |
| UTM / `referer` captat | ❌ **nu** | — | `CODE-INSPECTED` — `grep -rn "referer\|utm_" api/src` → **zero rezultate** |
| `AuditLog` | ✅ **da** — **528 rânduri** | evenimentele de produs și de autentificare, cu `actorId`, `targetId`, `meta` și `ip` | `VERIFIED` (`api/prisma/schema.prisma:763-777`) |
| Baza de date | ✅ **da** | clienți, comenzi, abonamente, facturi, plăți, instanțe, tichete, joburi | `VERIFIED` |
| `AuditLog` al sesiunilor | ✅ **da** — **251 rânduri** | `ip` + `userAgent` per sesiune ⇒ estimare de vizitatori unici **doar pentru utilizatorii înregistrați** | `VERIFIED` (`api/prisma/schema.prisma:153-170`) |
| Tablou de venit în panoul de staff | ⚠️ **parțial** — vezi §2 | `revenueMonth` și `mrr`, calculate **local** din baza de date | `CODE-INSPECTED` (`api/src/routes/admin.ts:47-84`) |
| Job de reconciliere cu Stripe | ❌ **nu** | — | `VERIFIED` (poarta 3) |
| Istoric de uptime / SLO | ❌ **nu** | — | `NOT-IMPLEMENTED` |
| Jurnal de acces Caddy (VM 102) | ✅ **da**, dar **nefolosit** | fiecare cerere: cale, status, dimensiune, timp ⇒ **vizite pe rută fără cookie** | `CODE-INSPECTED` (`audit/03-network-and-ip-plan.md`) |
| Search Console | ❌ **nu** | — | `VERIFIED` (absență) |
| Instrumentare CWV (`PerformanceObserver` pentru LCP/INP) | ❌ **nu** | — | `UNVERIFIED` — măsurătorile din `audit/10-seo.md` §7 au prins doar FCP și CLS |

---

## 2. Divergență cu briefing-ul: există un minimum de raportare a venitului

**Briefing-ul (`00-BRIEFING.md`) și sarcinile spun „NO revenue reporting". Codul spune altceva, și codul câștigă.**

`GET /api/admin/overview` calculează și întoarce:

```ts
// api/src/routes/admin.ts:67-83
revenueMonth: order.aggregate({ where: { status: { in: ['PAID','FULFILLED'] }, createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
mrr: subscriptions.reduce((sum, s) => sum + s.amount, 0),   // abonamente ACTIVE, cancelAtPeriodEnd = false
// plus: customers, instances, activeInstances, openTickets, ordersToday, provisioningFailures, currency
```

`CODE-INSPECTED`

**Starea corectă, formulată exact:**

> Există un **afișaj de venit în panoul de staff**, calculat **local din baza de date**. **Nu** există un raport de venit **reconciliat cu Stripe**, și nu există istoric de venit pe perioadă. Valoarea curentă este **€0**, pentru că nu a existat niciodată o plată. Iar până când **B4** nu e reparat, cifra poate fi **umflată de facturi `PAID` fabricate** de `renew()` (`api/src/services/billing.ts:248`) — deci **cifra nu trebuie publicată și nu trebuie folosită ca metrică de creștere până la repararea lui B4 și până la reconcilierea cu Stripe.**

`VERIFIED` + `CODE-INSPECTED`

**Notă suplimentară:** ruta `GET /api/admin/money` este un **stub** — întoarce `{ example: { minorUnits: 312, majorUnits: money(312) } }`, adică o valoare de exemplu, nu un raport. `CODE-INSPECTED` — `api/src/routes/admin.ts:933`

---

## 3. Cele trei niveluri de măsurare

| nivel | ce presupune | efort | când |
|---|---|---|---|
| **N1 — fără cod nou** | interogări SQL pe `AuditLog` și pe tabelele de domeniu; jurnale Caddy; `GET /api/status` | **ore** | **acum** |
| **N2 — cod minim** | captarea UTM/`referer` la register; un contor de vizite fără cookie; un job de reconciliere Stripe; istoric de status | **1–3 zile** | în F0, în paralel cu repararea plăților |
| **N3 — după poartă** | metrici de cohortă, churn, LTV, payback pe canal | **zile** | în F1, când există clienți plătitori |

---

## 4. Metricile

### 4.1 Nivel N1 — măsurabile **azi**, fără niciun cod nou

Toate se calculează din `AuditLog` (528 rânduri) și din tabelele de domeniu. Interogările sunt scrise **agregat**, fără a expune date personale.

| # | metrică | definiție exactă | sursă | decizia pe care o dirijează |
|---|---|---|---|---|
| **M1** | **Conturi create** | `count(AuditLog where action='auth.register')` pe zi/lună | `AuditLog` | **dimensiunea reală a audienței** — singura metrică de top disponibilă azi |
| **M2** | **Rată de activare** | `count(distinct actorId where action='auth.login') / count(distinct actorId where action='auth.register')` | `AuditLog` | **problema e onboarding sau e problema e produsul?** |
| **M3** | **Comenzi create** | `count(action='order.created')`; valoarea în `meta.total` | `AuditLog` | **cine ajunge la intentie de plată** |
| **M4** | **Intenție de plată** | `count(action='order.checkout_started')` | `AuditLog` | **checkout-ul e descoperit și funcționează?** — dacă M3 ≫ M4,CTA-ul e greșit |
| **M5** | **Conversie la plată** | `count(action='order.paid') / count(action='order.checkout_started')` | `AuditLog` | **verificarea plăților lucrează?** — un rate mic aici înseamnă un defect de webhook (B5), nu o problemă de marketing |
| **M6** | **Eșec de plată** | `count(action='order.amount_mismatch')` | `AuditLog` | **B1 se manifestă?** — dacă apare după o campanie cu cod, reducerea nu ajunge la Stripe |
| **M7** | **Comenzi anulate** | `count(action='order.cancelled')` | `AuditLog` | **unde se pierde clientul** — înainte de plată sau la checkout |
| **M8** | **Instanțe provisionate** | `count(action='instance.provisioned')` | `AuditLog` | **livrarea funcționează pe calea de cumpărare?** |
| **M9** | **Eșec de provisionare** | `count(action='instance.provision_failed')` | `AuditLog` + `ProvisioningJob` | **sănătatea produsului** — 30 `failed` din 123 azi (24%) |
| **M10** | **Clienți plătitori (MRR)** | `sum(Subscription.amount where status='ACTIVE' and cancelAtPeriodEnd=false)` | baza de date | **sursa de adevăr pentru venit** — identică cu `admin/overview`, dar cu istoric |
| **M11** | **Venit recurent nou** | MRR la sfârșit de lună − MRR la început de lună | baza de date | **creșterea e reală sau e doar că un client a plătit o factură?** |
| **M12** | **Tichete deschise** | `count(Ticket where status != 'CLOSED')`; rata per client | baza de date | **suportul costă prea mult?** — la €9,99, peste 15,67 min/client/lună contribuția devine negativă |
| **M13** | **Timp de suport per client** | `(sum(TicketMessage.createdAt − Ticket.createdAt)) / nr clienți` | baza de date | **același prag ca M12** |
| **M14** | **Rambursări** | `count(Payment where status='REFUNDED')` | baza de date | **funcționează garanția?** — `stripe.ts:490-491` înghite erorile de rambursare |
| **M15** | **Anulări de cont** | `count(action='settings.account_closure_requested')` | `AuditLog` | **semnal de nemulțumire** |
| **M16** | **Utilizatori activi** | `count(distinct Session.userId)` pe 7/30 de zile | baza de date | **produsul e folosit, sau e doar găzduit?** |
| **M17** | **Upgrade-uri comandate / aplicate** | `count(action='instance.upgrade_ordered')` vs `count(action='instance.upgrade_applied')` | `AuditLog` | **diferența e exact bug-ul B3** (aplicare fără plată) |
| **M18** | **Nume de domenii cerute** | `count(action='domain.claimed')` | `AuditLog` | **cerere reală pentru domenii** — singurul indicator al unei funcții care azi e blocată |
| **M19** | **Încercări de autentificare eșuate** | `count(action='auth.login_failed')` pe IP | `AuditLog` | **securitate** (auditul `02-security-audit.md` are 3 IP-uri de confirmat) — și **uzabilitatea** formularului de login |
| **M20** | **Starea componentelor** | `GET /api/status` — 10 componente, fiecare măsurată | endpoint | **suport pe „e jos"?** — azi `overall: degraded`, `support: degraded` din cauza lui `SMTP_URL` gol |

### 4.2 Nivel N2 — ce trebuie **instrumentat** ca să devină măsurabil

| # | metrică | de ce nu e măsurabilă acum | ce trebuie construit | efort | decizia |
|---|---|---|---|---|---|
| **M21** | **Vizite pe rută** | nicio analytics, niciun contor; singurul proxy de cereri e Caddy, dar jurnalul nu e folosit | **cel mai ieftin drum: un raport zilnic pe jurnalul de acces Caddy**, cu `path` și `status`. Zero cookie, zero terțe părți | 2–4 h | **unde se duce efortul de conținut** |
| **M22** | **Vizitatori unici** | `Session` are `ip` + `userAgent`, dar **doar pentru utilizatorii înregistrați** | agregare pe `ip`+`userAgent` din `Session` — **limita inferioară**, nu numărul real | 2 h | **dimensiunea reală a audienței**, versus cea a bazei de clienți |
| **M23** | **Originea traficului (sursă)** | **niciun `referer` și niciun UTM nu e captat** (`grep` → zero rezultate) | **cel mai mic cod cu cel mai mare efect:** la `POST /auth/register`, salvează `request.headers.referer` și parametrii `utm_*` în `meta`; și un cookie de primă parte, fără tracking, scris de interfață la prima vizită, care transmite UTM-ul la register | **4–8 h** | **ce canal merită buget** — decizia centrală de GTM |
| **M24** | **Căi de conversie** | `AuditLog` are acțiuni, dar **nu are o ierarhie de evenimente** (nu există un eveniment „vizită" de legat) | evenimentul de vizită din M21 + un identificator de vizitare (`visitorId` de primă parte, în `meta`) | 4–8 h (dependent de M23) | **unde se pierde vizitatorul** |
| **M25** | **CAC pe canal** | nu se poate atribui un client unui canal | M23 + `CAC_EUR` real per canal, în locul placeholder-ului de €25,00 | 0 h după M23 | **alocarea de buget** — valoarea cea mai mare a întregului set |
| **M26** | **Churn lunar și LTV real** | `Subscription` = 0 rânduri; **și B4** fabrică facturi `PAID` false, deci orice calcul de retenție ar fi fals | B4 reparat + un job de reconciliere cu Stripe + cohort-uri pe `Subscription.createdAt` | 1–3 zile | **cât poate crește platforma înainte de a fi nevoie de un al doilea nod** |
| **M27** | **Payback pe canal** | nu există atribuire | M25 + contribuția reală per client (€4,19 la €9,99) | 0 h după M25 | **dacă un canal e profitabil sau doar ieftin** |
| **M28** | **Venit reconciliat cu Stripe** | `admin/overview` calculează doar din baza de date; nu există job de reconciliere | jobul descris în poarta 3 din `audit/07-release-gates.md` | 1–2 zile | **încrederea în cifră de venit** — fără el, MRR-ul e o opinie |
| **M29** | **Timp de răspuns la tichet** | `TicketEvent` există, dar nu există un raport | agregare pe `TicketEvent` (created → assigned → first reply) | 2–4 h | **dacă promisiunea de suport din copy e onestă** |
| **M30** | **Istoric de uptime / SLO** | `/api/status` măsoară **la momentul cererii**, fără istoric; `uptimeSeconds` e uptime-ul **procesului**, nu al serviciului | un job care scrie rezultatul măsurătorii într-un tabel zilnic | 0,5–1 zi | **dacă se poate publica o cifră de uptime** — până atunci, nu se publică niciuna |
| **M31** | **NPS / satisfacție** | nu există nicio sondă, niciun mecanism de feedback | sondă în panou, cu 1 întrebare | 2–4 h | **calitatea produsului** — dar utilă doar peste ~30 de clienți |

### 4.3 Nivel N3 — posibile abia după poartă

| # | metrică | precondiție |
|---|---|---|
| M32 | LTV pe cohortă | M26 |
| M33 | Churn pe cohortă și pe canal | M26 + M25 |
| M34 | Rata de conversie pe pagină de produs | M24 + catalogul real |
| M35 | Occupancy rate al nodului (ca metrică de vânzări) | 16 sloturi, deci devine utilă doar peste ~8 clienți |
| M36 | Coeficientul de viralitate (K-factor) | **nu există niciun mecanism de recomandare** — trebuie construit întâi (`10-marketing-strategy.md`, K11) |
| M37 | ARPU pe segment | M26 + suficiente clienți pe segment |

---

## 5. Funnelul, etapă cu etapă, cu interogările exacte

Toate interogările sunt **agregate**. Niciuna nu selectează `email`, `actorEmail` sau `ip` — astfel încât raportul să nu conțină date personale de clienți reali.

```sql
-- M1 · Conturi create, pe zi
SELECT date_trunc('day', "createdAt") AS zi, count(*) AS conturi
FROM "AuditLog" WHERE action = 'auth.register'
GROUP BY 1 ORDER BY 1 DESC;

-- M2 · Activare: câte conturi s-au logat cel puțin o dată
WITH r AS (SELECT DISTINCT "actorId" FROM "AuditLog" WHERE action='auth.register'),
     l AS (SELECT DISTINCT "actorId" FROM "AuditLog" WHERE action='auth.login')
SELECT (SELECT count(*) FROM r) AS inregistrari,
       (SELECT count(*) FROM l) AS activat,
       ROUND(100.0 * (SELECT count(*) FROM l) / NULLIF((SELECT count(*) FROM r),0), 1) AS rata_pct;

-- M4 → M5 · Funnelul plății, pe același actor
SELECT 'order.created'          AS etapa, count(*) AS n FROM "AuditLog" WHERE action='order.created'
UNION ALL SELECT 'order.checkout_started', count(*) FROM "AuditLog" WHERE action='order.checkout_started'
UNION ALL SELECT 'order.paid',              count(*) FROM "AuditLog" WHERE action='order.paid'
UNION ALL SELECT 'order.cancelled',         count(*) FROM "AuditLog" WHERE action='order.cancelled';

-- M6 · Neconcordanțe de sumă (semnul lui B1)
SELECT count(*) AS neconcordante FROM "AuditLog" WHERE action='order.amount_mismatch';

-- M9 · Sănătatea livrării
SELECT status, count(*) FROM "ProvisioningJob" GROUP BY 1;

-- M10 · MRR, calculat independent de panoul de staff
SELECT count(*) AS abonamente, COALESCE(sum(amount),0) AS mrr_minor
FROM "Subscription" WHERE status='ACTIVE' AND "cancelAtPeriodEnd"=false;

-- M11 · MRR nou (creșterea lunară)
SELECT date_trunc('month', "createdAt") AS luna,
       count(*) AS abonamente_noi,
       COALESCE(sum(amount),0) AS mrr_noi_minor
FROM "Subscription" WHERE status='ACTIVE' GROUP BY 1 ORDER BY 1 DESC;

-- M12 · Suport: rata per client, nu numărul brut
SELECT count(DISTINCT t."userId") AS clienti,
       count(*) FILTER (WHERE t.status <> 'CLOSED') AS tichete_deschise
FROM "Ticket" t;

-- M16 · Utilizatori activi (sau clienți, sau clienți în panou)
SELECT date_trunc('week', "createdAt") AS saptamana, count(DISTINCT "userId") AS sesiuni_active
FROM "Session" WHERE "createdAt" > now() - interval '30 days' GROUP BY 1 ORDER BY 1 DESC;

-- M19 · Tentative de autentificare eșuate, pe IP (fără a afișa IP-ul)
SELECT count(*) AS esuate, count(DISTINCT ip) AS adrese_distincte
FROM "AuditLog" WHERE action='auth.login_failed' AND "createdAt" > now() - interval '1 day';
```

`CODE-INSPECTED` — interogările derivă din coloanele reale ale modelului `AuditLog` (`api/prisma/schema.prisma:763-777`) și din acțiunile confirmate în cod (`auth.register` la `api/src/routes/auth.ts:156`, `order.created` la `api/src/routes/orders.ts:115`, `order.checkout_started` la `api/src/routes/orders.ts:160`, `order.paid` la `api/src/services/stripe.ts:334`).

---

## 6. Ce este **nemăsurabil** azi — lista onestă

> Această listă este răspunsul direct la întrebarea „ce metrici de creștere pot urmări acum?". Fiecare item e nemăsurabil **nu pentru că instrumentul lipsește**, ci pentru că **nu există încă un eveniment** pe care să-l măsoare.

| metrică | status | motiv exact | ce ar trebui să se întâmple |
|---|---|---|---|
| **Vizite, vizitatori unici, pageviews** | `NOT-MEASURABLE` | nicio analytics, niciun contor; `AuditLog` nu începe cu o vizită, ci cu un eveniment de autentificare | M21 (jurnal Caddy) sau un contor server-side |
| **Rata de conversie (oricare)** | `NOT-MEASURABLE` | **nu există numărător** ⇒ nu există numitor | M21 + M24 |
| **CAC real** | `NOT-MEASURABLE` | `CAC_EUR = 25.00` e un `OPERATOR-INPUT` (placeholder: ~1,25 h de vânzare de fondator la 20 €/h) — **nu** o măsură | M25 |
| **Cost pe canal, ROAS, payback pe canal** | `NOT-MEASURABLE` | nu există atribuire | M23 + M25 |
| **MRR, ARR, venit recurent, LTV** | **0**, măsurabil începând cu prima plată | `0` abonamente, `0` facturi, `0` plăți | o comandă reală plătită |
| **Churn** | `NOT-MEASURABLE` | niciun abonament; **și B4** ar fabrica facturi `PAID` false, deci orice calcul ar fi fals | B4 + M26 |
| **Retenție pe cohortă** | `NOT-MEASURABLE` | nu există coadă de clienți | M26 |
| **Timp de plată la decizie** | `NOT-MEASURABLE` | niciun eveniment de checkout cu succes | M4 + M5 |
| **Abandonul căsuței de plată** | `NOT-MEASURABLE` | Stripe nu e activ, deci nu există sesiuni de checkout de abandonat | o cheie Stripe + un eveniment `checkout.session.expired` (M8 din `05-promotions.md`) |
| **Uptime, SLA, disponibilitate** | `NOT-MEASURABLE` | `/api/status` măsoară **la momentul cererii**, fără istoric; `uptimeSeconds` e uptime-ul **procesului**, nu al serviciului | M30 |
| **NPS, satisfacție, churn voluntar** | `NOT-MEASURABLE` | nu există sondă și nu există suficientă bază | M31 |
| **Viralitate, K-factor, recomandări** | `NOT-IMPLEMENTED` | **nu există mecanism de recomandare** în cod | construirea lui, apoi M36 |
| **Originea traficului** | `NOT-MEASURABLE` | **niciun `referer` și niciun UTM nu e captat** | M23 |
| **Comportamentul în checkout (heatmap, abandon pe câmp)** | `NOT-MEASURABLE` | fără tracking de evenimente; în plus, checkout-ul e `503` | M24 + deschiderea plăților |
| **Numărul de utilizatori „mulțumiți"** | `NOT-IMPLEMENTED` | nicio recenzie, niciun testimonial, niciun sondaj — și **nu trebuie inventat** | M31 |
| **SEO: poziții, clicuri, interogări** | `NOT-MEASURABLE` | nu există proprietate Search Console | proprietatea Search Console |
| **SEO: erori de indexare, URL-uri indexate** | `NOT-MEASURABLE` | nu există `sitemap.xml` și niciun contor de crawling | generarea sitemap-ului + Search Console |
| **Costul de suport per client, din timpul real al operatorului** | `NOT-MEASURABLE` | `TicketEvent` există, dar nu există un raport și nu există un model de „timp petrecut" | M29 + un câmp de timp estimat pe tichet |

---

## 7. Ce trebuie instrumentat **prima dată**, în ordine

| ordine | ce | de ce e prima | efort | risc dacă nu se face |
|---|---|---|---|---|
| **1** | **Raport zilnic pe jurnalul de acces Caddy**: cereri pe rută, pe status, pe zi | dă **vizite fără cookie și fără terțe părți**; nu scrie nimic în producție; există deja | 2–4 h | nu se știe niciodată cât e traficul, deci nu se poate măsura niciun efect |
| **2** | **Captarea UTM + `referer` la `auth.register`**, în `AuditLog.meta` | este singura modificare care face **măsurabilă** atribuirea canalelor; 4–8 h; fără tabele noi | 4–8 h | **CAC rămâne un placeholder**, deci decizia de buget rămâne o presupunere |
| **3** | **Instrumentare CWV** (`PerformanceObserver` pentru LCP și INP) în `scripts/ops/` | știm deja că FCP e 432–848 ms și CLS e 0; LCP și INP sunt necunoscute | 2–4 h | nu se poate decide **când** să se investească în pre-render |
| **4** | **Search Console** (proprietate + verificare) | singura sursă de interogări reale; **costă zero** | 30 min | niciun volum, nicio poziție, niciun clic — deci niciun cluster de cuvinte-cheie nu poate fi evaluat (`10-seo.md` §10.8) |
| **5** | **Generator de `sitemap.xml` + `robots.txt` controlat** | fără el, Search Console nu vede URL-urile `/apps/:slug`, care **nici nu sunt linkate** din pagină | 3–5 h | URL-urile de produs rămân nedescoperite |
| **6** | **Job de reconciliere cu Stripe** | fără el, MRR-ul e calculat local și **B4** îl poate umfla | 1–2 zile | cifra de venit nu e de încredere, deci nu poate fi folosită într-o decizie |
| **7** | **Raport de suport** (tichete per client, timp până la primul răspuns) | la €9,99, 15,67 min/client/lună este **pragul de contribuție zero**; peste el, fiecare client distruge valoare | 2–4 h | costul de suport rămâne o ipoteză de €5,00 (`OPERATOR-INPUT`) |
| **8** | **Istoric de stare a componentelor** | fără el nu se poate publica nicio cifră de uptime | 0,5–1 zi | niciun SLA, nicio cifră de uptime — **corect, pentru azi** |
| **9** | **Cohorte de retenție** | doar după ce există clienți plătitori | 1 zi | churn și LTV rămân nemăsurabile — **corect, pentru azi** |
| **10** | **Mecanism de recomandare** (cod de invitare, cu plafon) | fără el, K-factor-ul nu există | 3–5 zile | nu există canal de creștere din utilizatori |

**Observație de ordine, importantă:** pașii **1–5** nu au niciun blocaj de business și pot fi făcuți **în paralel cu repararea plăților**. Sunt exact lucrurile care trebuie gata **înainte** de lansare, ca F1 să poată măsura ceva. Pașii 6–10 se fac în F1.

---

## 8. Metrici de sănătate a platformei — care trebuie urmărite **înainte** de orice metrică de creștere

O metrică de creștere măsurată pe o platformă nesigură este o metrică care măsoară **defectele**, nu creșterea. Din `audit/07-release-gates.md`:

| metrică de sănătate | prag | cum se măsoară azi | clasa |
|---|---|---|---|
| **Rata de eșec a provisionării** | < 5% (nu 24%) | `ProvisioningJob`: `failed` vs `completed` | `VERIFIED` — 30/123 = 24% |
| **Rata de provisionare eșuată din `AuditLog`** | — | `instance.provision_failed` vs `instance.provisioned` — azi **80 vs 5** | `VERIFIED` |
| **Servere orfane pe panou vs instanțe în DB** | 0 | panoul are **5** servere, DB-ul are **3** instanțe; serverele 8 și 14 sunt orfane | `VERIFIED` |
| **Comenzi plătite fără instanță** | 0 | `Order.status='PAID'` fără `Instance.orderId` | `CODE-INSPECTED` |
| **Tichete deschise per client** | < 1 | 12 tichete, toate `OPEN`, pentru 6 utilizatori | `VERIFIED` |
| **Neconcordanțe de sumă la plată** | 0 | `order.amount_mismatch` | `VERIFIED` (acțiune existentă) |
| **Componente `degraded` în `/api/status`** | 0 | azi `overall: degraded`, `support: degraded` (din cauza lui `SMTP_URL` gol) | `VERIFIED` |
| **Rambursări înghițite** | 0 | `stripe.ts:490-491` prinde și aruncă eroarea; nu există alarmă | `CODE-INSPECTED` |
| **Joburi de provisionare eșuate în coadă** | 0 | `worker.ts:95-99` le curăță; nu există alarmă și nu există reluare automată | `CODE-INSPECTED` |

---

## 9. Ce **nu** trebuie măsurat ca „creștere"

| metrică | de ce e o capcană |
|---|---|
| **„Numărul de promoții create"** | `promotion.created` măsoară **activitatea operatorului**, nu a clienților. Și în starea curentă, o promoție rupe checkout-ul (B1) |
| **„Redempțări de cod"** | contorul afișat (`usedCount`) **nu e** contorul aplicat (`countEffectiveRedemptions`) — `05-promotions.md` §6.2. Măsurarea ar fi falsă |
| **„Conturi create"** ca succes, înainte de plăți | 6 utilizatori, dintre care 2 sunt conturi de test create de `scripts/ops/seed-browser-account.mjs` ⇒ **numărul real de clienți e mai mic decât 6** |
| **„Tichete închise"** ca metrică de sănătate | poate crește prin închiderea fără răspuns; metrică bună e **timpul până la primul răspuns** și **tichete deschise per client** |
| **„Prețul mediu"** | cu 5 produse și 3 instanțe, media e o statistică pe 3 puncte |
| **„Trafic pe `/apps/wordpress"`** înainte de certificare | atrage vizitatori pe o pagină care **nu poate fi comandată** — deci măsoară o **frustrare**, nu o creștere |
| **„Uptime de 99,9%"** | nu există istoric; o cifră fără istoric e o promisiune, nu o metrică |

---

## 10. Tabloul de bord minim

**Un singur tablou, un singur loc, actualizat zilnic.** Nu un dashboard cu 40 de grafice: unul cu 9 rânduri, fiecare cu o decizie asociată.

| rând | metrică | sursă | decizia |
|---|---|---|---|
| 1 | Vizite pe `/` și pe `/apps/:slug` (ziua precedentă) | jurnal Caddy | conținut |
| 2 | Conturi create (7 zile) | `AuditLog` | dimensiunea audienței |
| 3 | Conturi create **pe sursă** | `AuditLog.meta` (M23) | **alocarea de buget** |
| 4 | Comenzi create → checkout început → plătite | `AuditLog` | unde se pierde clientul |
| 5 | MRR + MRR nou | `Subscription` | creșterea reală |
| 6 | Venit lunar **reconciliat** cu Stripe | job de reconciliere (M28) | încrederea în cifră |
| 7 | Tichete deschise per client | baza de date | pragul de suport |
| 8 | Rata de eșec a provisionării | `ProvisioningJob` | sănătatea livrării |
| 9 | Componente `degraded` | `/api/status` | ce anunțăm înainte de o lansare |

**Unde stă:** un raport zilnic generat de un script din `scripts/ops/`, scris într-un fișier — **nu** într-un tracker cu cookie, nu într-un serviciu terț, fără banner de consimțământ. Un raport intern, cu date agregate, nu implică transfer de date către terți; orice publicare a cifrelor în afara echipei trebuie însă confirmată profesional pentru GDPR și protecția datelor.

---

## 11. Limite

| item | status | motiv |
|---|---|---|
| valori reale pentru M1–M20 | **0** | nu există clienți plătitori; `0` abonamente, `0` facturi, `0` plăți |
| vizitatori unici reali | `NOT-MEASURABLE` | nu există contor de vizite; singurele proxy-uri sunt `Session.ip` (doar pentru utilizatori înregistrați) și jurnalul Caddy (nefolosit) |
| volum de căutare | `UNVERIFIED` | fără Search Console, fără Keyword Planner; `audit/08-competitive-analysis.md` (§2–§3) documentează **prețuri** de concurență, nu volume |
| concurență | `UNVERIFIED` | niciun preț sau nume de concurent nu există în sistem |
| CWV de câmp (LCP/INP) | `UNVERIFIED` | măsurătorile de laborator din `audit/10-seo.md` §7 au prins doar FCP și CLS |
| efectul real al unui canal | `NOT-MEASURABLE` | nu există atribuire; `CAC_EUR = 25.00` e `OPERATOR-INPUT` |
| conformitate GDPR a oricărei metrici care conține IP-uri | **necesită confirmare profesională** | `AuditLog.ip` și `Session.ip` sunt date personale; agregarea reduce riscul, dar nu îl elimină |
| dreptul de a comunica cu clienții existenți | **necesită confirmare profesională** | `NotificationPreference` există (per-model), dar nu există nicio listă de marketing și niciun mecanism de unsubscribe |

**Ce nu am făcut:** nu am rulat niciuna dintre interogările de mai sus în producție (le-am derivat din schema și din cod, ca să poată fi rulate imediat după lansare); nu am creat niciun cont, nicio sesiune și nicio comandă; nu am extras și nici publicat nicio adresă de e-mail, niciun IP și nicio valoare personală de client real.
