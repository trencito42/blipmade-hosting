# Auditul ciclului de viață al prețurilor — Blipmade Hosting (runda 2, auditor A21)

**Data:** 2026-10-23 · **Domeniu:** `trencito42/blipmade-hosting` · **Producție:** blipmade.com
**Arbore de lucru analizat:** `/root/blipmade-work` (commit `3948f7f`, 2026-10-23T20:10:46Z)
**Producție (VM 103):** `/opt/blipmade` (același commit) · **Stack izolat:** `http://10.77.0.13:30003`

---

## 1. Metodă

### 1.1 Convenția monetară (o singură conversie, folosită peste tot în raport)

În cod și în baza de date sumele sunt **numere întregi în unități minori (cenți)**:
`149` = **1,49 €**, `189` = **1,89 €**, `172` = **1,72 €**, `1` = **0,01 €**.
`api/src/lib/money.ts:1-15` — `normalizeAmount()` rotunjește la întreg și taie negativele la 0.
Niciun loc din lanțul de preț nu face aritmetică pe un float (`api/src/services/pricing.ts:47-53`).

### 1.2 Modelul de preț (inspectat înainte de orice concluzie despre 1,49 € → 1,89 €)

`api/src/services/pricing.ts:40-54`:

```
price = baseAmount
      + normalizeAmount(max(0, (ram - minRam)/1024) * ramPerGb)
      + normalizeAmount(max(0, cpu - minCpu) * cpuPerUnit)
      + normalizeAmount(max(0, disk - minDisk) * diskPerGb)
      + options
```

Consecință structurală: **prețul configurației minime este întotdeauna exact `baseAmount`**
(suplimentele sunt calculate peste minim). Tarife live (EUR, lunar): `ramPerGb 60`, `cpuPerUnit 40`, `diskPerGb 2`.

### 1.3 Ce am citit și ce am rulat

| Pas | Actiune | Rezultat |
|---|---|---|
| 1 | Lectură: `audit/00-BRIEFING.md`, `05-pricing-consistency.md`, `05-commerce-and-billing.md`, `05-promotions.md`, `12-FULL-FINDINGS-REGISTER.md` (grupele `PRICE-*`, `COMM-*`, `PROMO-*`) | reper pentru a nu repeta constatările din runda 1 |
| 2 | `api/src/services/pricing.ts`, `routes/catalog.ts`, `routes/orders.ts`, `routes/webhooks.ts`, `routes/instances.ts`, `routes/admin.ts`, `routes/billing.ts`, `services/stripe.ts`, `services/upgrades.ts`, `services/availability.ts`, `services/provisioning.ts`, `lib/money.ts` | codul lanțului de preț |
| 3 | `web/src/lib/pricing-contract.ts`, `lib/pricing.ts`, `app/Deploy.tsx`, `app/DeployCatalog.tsx`, `app/ProductPage.tsx`, `app/Overview.tsx`, `app/Instances.tsx`, `app/InstanceDetail.tsx`, `home/Catalog.tsx`, `home/Studio.tsx`, `data.ts`, `admin/Pricing.tsx` | interfața |
| 4 | SQL read-only pe `blipmade` (producție): `Product`, `ProductPrice`, `ProductOption`, `Promotion`, `Instance`, `Order`, `OrderItem`, `Subscription`, `Payment`, `Invoice` | datele reale |
| 5 | `curl` pe API-ul public de producție: `GET /api/catalog/products`, `POST /api/catalog/quote` (cu cookie + header CSRF) | prețurile live |
| 6 | Chromium (playwright-core, pe VM) pe paginile publice de producție: `/`, `/apps/wordpress`, `/apps/discord-bot` — **fără autentificare** | comportamentul vizibil |
| 7 | Chromium pe build-ul curent (izolat, cu răspunsuri API simulate): configuratorul pentru `discord-bot` | comportamentul codului curent |
| 8 | Calcul cu build-ul curent (`/tmp/api-check/dist`, care conține `priceBook`) pe valorile reale din DB | cartea de prețuri a codului curent |

### 1.4 Reguli respectate

- Nu am creat nicio comandă, plată, promoție sau rând în baza de date. Am folosit **o singură** autentificare (pe stack-ul izolat, contul `qa.check@example.test`); pe `blipmade.com` **nu m-am autentificat niciodată**.
- Nu am rulat suita de teste și nu am atins `blipmade_test` (instruction-level: rulează testele doar pe `blipmade_check`).
- Nu am modificat niciun fișier din afara acestui raport. Nu am făcut deploy/rebuild/commit/push.
- Stack-ul izolat a fost folosit **numai cu răspunsuri API simulate în browser**, ca nicio cerere de scriere să nu ajungă undeva.
- **Atenție, pericol de mediu:** web-ul izolat de pe `:30002` (`/tmp/web-check`) are `API_URL=http://127.0.0.1:3100`, adică proxy către **containerul API de producție** (`blipmade-api-1`, baza `blipmade`), în timp ce API-ul izolat de pe `:30003` (`/tmp/api-check`) folosește `blipmade_test`. De aceea, în testele de browser am interceptat **toate** cererile `/api/**` în browser, ca nimic să nu ajungă în producție. Nu am creat și nu am modificat nimic acolo.

### 1.5 Despre diferența 1,49 € → 1,89 €

**Nu este un defect de calcul.** Este, prin construcție, prețul configurației *recomandate* față de prețul configurației *minime*:

| Produs | minim | preț minim | recomandat | preț recomandat |
|---|---|---|---|---|
| wordpress | 512 MB / 1 vCPU / 5 GB | **149** (1,49 €) | 1024 MB / 1 vCPU / 10 GB | **189** (1,89 €) |
| code-server | 1024 / 1 / 5 | **299** (2,99 €) | 2048 / 1 / 10 | **369** (3,69 €) |
| discord-bot | 256 / 1 / 1 | **149** (1,49 €) | 512 / 1 / 5 | **172** (1,72 €) |
| uptime-kuma | 256 / 1 / 5 | **149** (1,49 €) | 512 / 1 / 10 | **174** (1,74 €) |
| postgresql | 1024 / 1 / 5 | **449** (4,49 €) | 1024 / 1 / 10 | **459** (4,59 €) |

*Sursă: calcul cu build-ul curent, pe valorile reale din DB (§1.3 pasul 8).*

Verificarea live (API de producție) confirmă aceleași numere pentru configurațiile minime:
`discord-bot 256/1/1 → unitAmount 149`, `wordpress 512/1/5 → 149`, `wordpress 1024/1/10 → 189`, `discord-bot 512/1/5 → 172`.

**Notă de corectură față de briefing:** `discord-bot` are `minDisk = 1` GB (nu 5), iar `uptime-kuma` are `minDisk = 5` GB (nu 1). Valoarea live este cea din tabel; m-am bazat pe DB, nu pe enunț.

---

## 2. Tabelul constatărilor

| id | unde | simptom | severitate | clasă | unde e dovedit |
|---|---|---|---|---|---|
| **PLP-01** | producție: `POST /api/catalog/quote` (wordpress) · DB `Product` | WordPress e taxat cu 149 și e comandabil, dar n-are `eggId` ⇒ plata se acceptă pentru un serviciu care nu poate fi creat | **P0** | `VERIFIED` (DB + API live) | §3.1 |
| **PLP-02** | producție: `GET /api/catalog/products`, `/apps/wordpress` | Build-ul în serviciu e mai vechi decât fixul de contract de preț: API-ul nu trimite `pricing`/`availability`, iar CTA-ul de preț de pornire nu duce configurația | **High** | `VERIFIED` (API live + conținut container + git) | §3.2 |
| **PLP-03** | izolat: configuratorul, `discord-bot` | Configurația recomandată (5 GB) cade în afara grilei de pas a sliderului ⇒ sliderul arată 4 GB, se taxează 5 GB | **Medium** | `VERIFIED` (Chromium) | §3.3 |
| **PLP-04** | izolat: configuratorul, `discord-bot` | Stocarea maximă anunțată (50 GB) nu e comandabilă: sliderul se oprește la 49 GB | **Medium** | `VERIFIED` (Chromium + DB) | §3.4 |
| **PLP-05** | izolat: configuratorul | Memoria minimă (256 MB) e afișată „0,3 GB" în copy-ul care numește configurația prețului | **Low / Info** | `VERIFIED` (Chromium) | §3.5 |
| **PLP-06** | `api/src/routes/catalog.ts:49` vs `api/src/services/pricing.ts:130-140` | Catalogul poate calcula prețul anunțat (și întreaga carte de preț) dintr-un alt rând de preț decât cel care prețuiește comanda | **Low / Info** | `CODE-INSPECTED` (latent) | §3.6 |
| **PLP-07** | producție: `Promotion` LAUNCH + `Order` BM-00006 | Campania live e 100% fără plafon per cont; prima comandă există deja cu `total 0`; reducerea nu ajunge la Stripe | **High** | `VERIFIED` (DB) + `CODE-INSPECTED` | §3.7 |
| **PLP-08** | `docs/API_CONTRACT.md:53-59` | Contractul API nu descrie cartea de preț nouă și câmpurile de sumă nu își spun unitatea | **Low / Info** | `CODE-INSPECTED` | §3.8 |
| **PLP-09** | `web/src/data.ts:18-31` | Simulatorul de marketing: Discord Bot „256 MB · 5 GB · 1,49 €", dar 1,49 € cumperi 1 GB; 7 din 12 aplicații nu există în catalog | **Low / Info** | `CODE-INSPECTED` | §3.9 |

**Total: 9 constatări — P0: 1 · High: 2 · Medium: 2 · Low/Info: 4.**

---

## 3. Constatările, una câte una

### 3.1 PLP-01 — P0 — WordPress se vinde, se taxează și se plătește, dar nu poate fi creat

**Simptom observat.** API-ul public de producție acceptă și prețuiește o comandă WordPress, deși produsul nu are mapping de egg pe panou:

```
$ curl -s -X POST https://blipmade.com/api/catalog/quote -H 'content-type: application/json' \
    -H "x-csrf-token: $CSRF" \
    -d '{"items":[{"productSlug":"wordpress","ram":512,"cpu":1,"disk":5}]}'
{"items":[{"productSlug":"wordpress","name":"WordPress","ram":512,"cpu":1,"disk":5,"optionCodes":[],"quantity":1,
 "unitAmount":149,"total":149,"currency":"EUR"}],"subtotal":149,"discount":0,"total":149,"currency":"EUR","promotion":null}
```

DB de producție (read-only):

```
 slug     | deployable | eggId |            dockerImage |          updatedAt
-----------+------------+-------+----------------------+------------------------
 wordpress | t          |       |                      | 2026-10-23 18:39:09.818
 discord-bot | t        | 15    | ghcr.io/ptero-eggs/yolks:nodejs_25 | 2026-10-23 04:15:01.845
```

**Cauză root confirmată.** Verificarea existenței egg-ului **nu există în build-ul aflat în serviciu**. Ea a fost introdusă în commit-ul `3948f7f` (`api/src/services/availability.ts:56-71` — `installable = product.eggId !== null`, starea `TEMPORARILY_UNAVAILABLE` altfel), dar containerul care deservește producția nu o conține:

```
$ docker exec blipmade-api-1 grep -c priceBook /app/dist/services/pricing.js /app/dist/routes/catalog.js
/app/dist/services/pricing.js:0
/app/dist/routes/catalog.js:0

$ docker exec blipmade-api-1 grep -n "deployable\|available to order" /app/dist/services/pricing.js
58:        if (!product.deployable)
59:            throw badRequest(`${product.name} is not available to order yet.`);
```

Singura poartă din build-ul viu e `product.deployable`, iar rândul WordPress are `deployable = true` (pus la 18:39:09 pe 23.10, după ce corpusul de audit din runda 1 l-a consemnat ca `false`). Deci fluxul live este: preț 149 → comandă → Stripe → plată → provisionare → `api/src/services/provisioning.ts:234-236` aruncă `WordPress has no egg mapping yet.` la pasul `server_created`. Banul e încasat, serverul nu există.

Cine a deblocat produsul: `api/src/routes/admin.ts:508-513` **refuză** `deployable = true` fără egg, dar doar pe calea API; rândul a fost modificat direct în DB (nu există o migrare sau o regulă de integritate care să prevină asta).

**Severitate / clasă:** P0 (o plată reală este acceptată pentru un serviciu care nu poate fi livrat) · `VERIFIED`.

**Impact monetar.** 1,49 €/lună pe fiecare comandă WordPress plătită. Există deja o comandă WordPress în DB (BM-00006, 189) ⇒ fluxul de comandare e accesibil public.

**Corectare recomandată.**
1. `api/src/services/availability.ts` — deploy-ul build-ului curent (nu e o schimbare de cod, e o acțiune de lansare) **și** păstrarea verificării egg-ului în `priceItems` (`api/src/services/pricing.ts:152-175`).
2. `api/src/routes/catalog.ts:49-57` — `serializeProduct` trebuie să folosească `deploymentAvailability`, nu doar `product.deployable` (fixul există deja în sursă la `catalog.ts:52-57`).
3. Corectarea datelor: `UPDATE "Product" SET deployable = false WHERE "eggId" IS NULL` — și o regulă de integritate (constraint DB sau o migrare) care să nu lase `deployable = true` fără `eggId`.
4. `api/src/routes/admin.ts:508-513` — păstrarea interdicției pe calea API **plus** o verificare la citire (`serializeProduct` nu trebuie să declare „deployable" un produs fără egg).

---

### 3.2 PLP-02 — High — Prețul de pornire anunțat nu e legat de configurația pe care se pornește, pentru că fixul nu e în serviciu

**Simptom observat.** Catalogul public de producție nu conține cartea de prețuri, deci interfața nu poate spune ce configurație reprezintă 1,49 €:

```
$ curl -s https://blipmade.com/api/catalog/products | jq '.products[] | select(.slug=="discord-bot")'
{
  "id": "cmvjyo5z00004dxtlpy0h5smc", "slug": "discord-bot", "name": "Discord Bot", ...
  "minRam": 256, "minCpu": 1, "minDisk": 1, "defaultRam": 512, "defaultCpu": 1, "defaultDisk": 5,
  "maxRam": 4096, "maxCpu": 4, "maxDisk": 50, "visible": true, "deployable": true,
  "price": { "amount": 149, "currency": "EUR", "period": "MONTHLY" },
  "options": []
}
```

Lipsește complet `pricing` și `availability`. Pagina publică de produs (`https://blipmade.com/apps/wordpress`, citită cu Chromium, fără autentificare) afișează:

> „€1.49 per month — **Starting price.** The resources are chosen on the next screen. — **Deploy this app**"

și linkul CTA este `/login?next=%2Fapp%2Fdeploy%2Fwordpress` — **fără niciun parametru de configurație**. Deci: prețul anunțat e 1,49 € (configurația minimă 512/1/5), iar configuratorul pornește de la configurația recomandată 1024/1/10 = **1,89 €**, fără ca interfața să spună că a ales o configurație mai mare decât cea anunțată.

**Cauză root confirmată.** Build-ul din serviciu precede fixul de contract de preț:

```
$ cd /opt/blipmade && git log -3 --format="%h %cI %s"
3948f7f 2026-10-23T20:10:46Z Fix the price contract, the table layout and the deploy availability
79a228a 2026-10-23T18:55:59Z Downscale the review captures to their current size

$ docker exec blipmade-web-1 grep -c pricing /app/dist/assets/Deploy-*.js
0
```

Fixul există **în sursă** (nu e o lipsă de cod):
- `api/src/routes/catalog.ts:61-100` — `serializeProduct` trimite `pricing: { currency, period, minimum, recommended }` și `availability`;
- `api/src/services/pricing.ts:86-114` — `priceBook()` calculează minimul și recomandatul **cu aceeași funcție** care prețuiește comanda;
- `web/src/lib/pricing-contract.ts:77-94` — `startingConfiguration()` / `startingPrice()` folosesc cartea, cu fallback pe câmpurile produsului;
- `web/src/app/DeployCatalog.tsx:135`, `app/ProductPage.tsx:145-150`, `app/Overview.tsx:219`, `app/Instances.tsx:101` — CTA-ul duce configurația minimă în adresă (`deployPathFor(slug, startingConfiguration(product))`);
- `web/src/app/Deploy.tsx:651-663` — copy-ul care leagă explicit prețul de configurația sa.

Fixul e complet în cod **și are teste** (`api/tests/catalog-pricing.test.ts` 145 linii, `api/tests/catalog-availability.test.ts` 188 linii, `web/tests/pricing-contract.test.ts` 183 linii, toate adăugate în `3948f7f`). Nu am rulat suita (instrucțiune: rulează doar pe `blipmade_check`); constatarea e despre **deploy**, nu despre cod.

**Severitate / clasă:** High · `VERIFIED`.

**Impact monetar.** Pe site-ul viu, un client care pleacă de la „1,49 €" ajunge la 1,89 € fără ca prețul anunțat să fie legat de o configurație. Diferența pentru WordPress e 0,40 €/lună (40 unități minori). Pentru discord-bot, 0,23 €/lună (23 unități).

**Corectare recomandată.**
1. Rebuild + deploy al imaginilor `api` și `web` din `3948f7f` (acțiune de lansare; nu e nevoie de cod nou).
2. `api/src/routes/catalog.ts:145,157` — după deploy, `GET /api/catalog/products` trebuie să conțină `pricing.minimum` și `availability`; adăugați un gate de release care să verifice acest lucru (altfel aceeași decalajare se poate repeta).
3. `docs/API_CONTRACT.md:53-59` — descrie payload-ul nou (vezi PLP-08).

---

### 3.3 PLP-03 — Medium — Configurația recomandată nu poate fi reprezentată de slider: se taxează 5 GB, se afișează 4 GB

**Simptom observat** (build-ul curent, izolat, răspunsuri API simulate; Chromium):

```
=== AFTER RECOMMENDED CLICK ===
RANGES: [{"min":"1","max":"50","step":"3","value":"4"}]
URL2: http://10.77.0.13:30002/app/deploy/discord-bot?ram=512&cpu=1&disk=5
QUOTES: [{"req":[{"productSlug":"discord-bot","ram":512,"cpu":1,"disk":5}],"total":172}]
TEXT: ... Recommended configuration 0.5 GB · 1 vCPU · 5 GB disk €1.72/mo ... Storage 5 GB ...
```

URL-ul și prețul sunt pentru **5 GB**, eticheta din pagină scrie „Storage 5 GB", dar **sliderul de stocare arată 4** — browserul sanitizează valoarea la cel mai apropiat pas valid. Verificare independentă a semanticii HTML:

```
RANGE sanitized(5 on min1 max50 step3): 4
```

**Cauză root confirmată.** Grila de pași a stocării e calculată independent de valorile reale ale produsului:
`web/src/app/Deploy.tsx:274` → `const diskStep = Math.max(1, Math.ceil((product.maxDisk - product.minDisk) / 20));`
Pentru `discord-bot` (min 1 GB, max 50 GB) → `diskStep = 3` ⇒ grila este 1, 4, 7, …, 49. **5 GB (recomandat) nu e pe grilă.**
Presetarea e aplicată fără snapping: `web/src/app/Deploy.tsx:232-234` (`applyConfig` → `navigate(address(...))`) → `web/src/lib/pricing-contract.ts:113-124` (`configurationFromQuery` doar limitează la `[min, max]`, nu aliniază la grilă).

**Severitate / clasă:** Medium · `VERIFIED`.

**Impact monetar.** 0,02 €/lună (1 GB × `diskPerGb 2` = 2 unități minori) — dar interfața nu reprezintă configurația taxată: clientul vede un slider care nu corespunde sumei plătite și nu poate reveni la 5 GB prin tragere.

**Corectare recomandată.**
1. `web/src/app/Deploy.tsx:274` — grila trebuie să conțină obligatoriu `minDisk`, `defaultDisk` și `maxDisk`; de exemplu, se alege un pas `d` cu `(defaultDisk - minDisk) % d === 0` și `(maxDisk - minDisk) % d === 0` (cazuri: discord-bot 1→5→50, uptime-kuma 5→10→50, postgresql 5→10→200, wordpress 5→10→100, code-server 5→10→100).
2. `web/src/lib/pricing-contract.ts:113-124` — `configurationFromQuery` trebuie să alinieze disk-ul la grilă (sau serverul să o facă).
3. `api/src/services/pricing.ts:116-128` — `validateConfiguration` acceptă acum orice `disk` între min și max (inclusiv valori imposibile de ales); pentru coerența preț–interfață, grila ar trebui să fie definiția serverului.

---

### 3.4 PLP-04 — Medium — Stocarea maximă anunțată nu e comandabilă (50 GB devine 49 GB)

**Simptom observat** (Chromium, build curent): glisarea sliderului la capătul maxim produce `disk=49`, nu 50:

```
AFTER MAX: {"url":".../discord-bot?ram=512&cpu=1&disk=49",
            "quotes":[{"req":[{...,"disk":49}],"total":260}],
            "range":{"max":"50","value":"49"}}
```

Textul paginii promite „Between 1 GB and 50 GB.", iar limita din DB e `maxDisk = 50`. Prețul configurației de 50 GB (1,72 € + 2 × 49 × 0,02 = **2,62 €**) nu poate fi obținut niciodată prin interfață.

**Cauză root confirmată.** Aceeași grilă ca la PLP-03: `web/src/app/Deploy.tsx:274` + limita HTML `max={product.maxDisk}` / `step={diskStep}` (`:582-591`). Browserul nu poate atinge 50 cu pasul 3 pornind de la 1.

**Severitate / clasă:** Medium · `VERIFIED`.

**Impact monetar.** 0,02 €/lună (2 unități minori) pierdute pentru orice client care vrea maximul; plus promisiune încălcată („Between 1 GB and 50 GB").

**Sursă secundară în DB.** Comanda de producție BM-00001 a fost cu `disk: 49` — exact maximul real accesibil, deși catalogul anunță 50.

**Corectare recomandată.** Aceeași ca la PLP-03 (grila trebuie să conțină `maxDisk`); plus `web/src/app/Deploy.tsx:592` — textul limitei („Between X and Y") trebuie să fie derivat din valorile **accesibile**, nu din `maxDisk`/`minDisk` brute.

---

### 3.5 PLP-05 — Low/Info — Memoria minimă e anunțată „0,3 GB" (256 MB) în copy-ul care numește configurația prețului

**Simptom observat** (Chromium, build curent, la configurația minimă):

```
Starting price €1.49/mo for the smallest configuration: 0.3 GB · 1 vCPU · 1 GB disk.
```

și în selector: „Memory 0.3 GB 0.5 GB 1 GB 2 GB 4 GB"; în recapitulare: „Memory 0.3 GB".

**Cauză root confirmată.** `web/src/app/Deploy.tsx:102-105`:

```
function formatGb(value: number, scale: number): string {
  const gb = value / scale;
  return Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
}
```

256 / 1024 = 0,25 → `toFixed(1)` → „0,3" ⇒ se anunță 307 MB pentru o configurație de 256 MB. În restul interfeței aceeași valoare apare corect („256 MB", prin `memLabel` din `web/src/lib/pricing.ts`).

**Severitate / clasă:** Low/Info · `VERIFIED`.

**Impact monetar.** Niciunul. Dar copy-ul care *numește* configurația prețului de pornire spune un număr de resurse pe care platforma nu le vinde — exact textul care trebuie să fie fără echivoc.

**Corectare recomandată.** `web/src/app/Deploy.tsx:102-105` — `formatGb` trebuie să arate MB sub 1024 (`${value} MB`) și GB (cel mult o zecimală) peste 1024; la fel `web/src/app/Deploy.tsx:660` și `:787`.

---

### 3.6 PLP-06 — Low/Info — Catalogul poate anunța un preț calculat dintr-alt rând de preț decât cel care prețuiește comanda

**Simptom.** Două selectări diferite pentru „rândul de preț al produsului":

- `api/src/routes/catalog.ts:49` → `product.prices.find((p) => p.active && p.period === 'MONTHLY') ?? product.prices.find((p) => p.active)`, peste un `include` **fără ordine** (`:145`, `:157`);
- `api/src/services/pricing.ts:130-140` (`loadPrice`, folosit de cotă și de comandă) → `findFirst({ where: { productId, period, active: true }, orderBy: { createdAt: 'desc' } })`.

Cu două rânduri active `MONTHLY` pe același produs, catalogul ar anunța rândul A (și ar calcula din el **întreaga carte de preț**, `catalog.ts:61-100`), iar comanda ar fi prețuită cu rândul B. Varianta conexă: dacă singurul preț activ nu e `MONTHLY`, catalogul afișează o sumă anuală drept „preț de pornire", iar cotația aruncă `notFound('This product has no active price.')` (`pricing.ts:138`).

**Stare actuală:** latent. DB de producție:

```
 slug     | price_rows | active_rows | periods
 code-server | 1 | 1 | {MONTHLY}
 discord-bot | 1 | 1 | {MONTHLY}
 postgresql | 1 | 1 | {MONTHLY}
 uptime-kuma | 1 | 1 | {MONTHLY}
 wordpress | 1 | 1 | {MONTHLY}
```

**Severitate / clasă:** Low/Info · `CODE-INSPECTED` (latent, fără impact azi).

**Impact monetar.** Niciunul azi. Dacă se întâmplă: catalogul anunță un preț, clientul plătește altul — diferența maximă e `baseAmount` + tarife.

**Corectare recomandată.** `api/src/routes/catalog.ts:145,157` — ordonează `prices` descrescător după `createdAt` și aplică aceeași regulă de selecție ca `loadPrice` (ideal: un singur helper folosit de ambele, ca în `api/src/services/pricing.ts:130-140`); `api/src/routes/catalog.ts:49` — fallback-ul pe un preț non-`MONTHLY` trebuie să fie eliminat sau marcat explicit ca atare.

---

### 3.7 PLP-07 — High — Campania live e 100% fără plafon per cont, iar prima comandă există deja cu total 0; reducerea nu ajunge niciodată la Stripe

**Simptom observat** (DB de producție, read-only):

```
 id             | code   | type   | value | maxRedemptions | usedCount |       endsAt        | active | maxPerUser
----------------+--------+--------+-------+----------------+-----------+---------------------+--------+------------
 cmvlbc406000…  | LAUNCH | PERCENT | 10000 |             25 |         0 | 2027-06-01 18:38:00 | t      |

 number | status | kind | total | discount | currency | fulfillmentStatus
 BM-00006 | PENDING | NEW | 0 | 189 | EUR | NOT_STARTED

 number |   name    | unitAmount | total | config
 BM-00006 | WordPress | 189 | 189 | {"cpu": 1, "ram": 1024, "disk": 10, "optionCodes": []}
```

`value = 10000` bps = **100%** (`api/src/services/pricing.ts:330-340` — procentul e stocat în puncte bazale). `maxPerUser` e `NULL`, deci campania nu e limitată per cont (25 de redemptions globale, fiecare repetabil). Prima comandă cu campania e deja acolo: subtotal 189, discount 189, **total 0**.

**Cauză root confirmată.** `api/src/routes/orders.ts:72-101` scrie `total: quote.total` (discountuit, 0) dar păstrează `items[].unitAmount` = 189 (nediscountuit). `api/src/services/stripe.ts:171-179` construiește linia Stripe cu `unit_amount: item.unitAmount` ⇒ Stripe întreabă **1,89 €**, deși comanda e înregistrată cu **0,00 €**. `api/src/routes/webhooks.ts:188-196` (`verifyAmount`) compară `amount_total` cu `order.total` ⇒ diferenţă ⇒ `api/src/routes/webhooks.ts:220` marchează comanda `FAILED` și nu provisionează nimic. Dacă Stripe ar taxa 0 (total 0), comanda s-ar onora gratuit — costul de provisionare e pierdut, plafonul campaniei e consumat degeaba.

Mecanismele sunt aceleași ca în runda 1: **`COMM-01`** (reducerea nu ajunge la Stripe), **`PROMO-02`** (`maxPerUser` nu poate fi setat — `maxPerUser` nu apare deloc în `api/src/routes/admin.ts`, deși coloana există în `api/prisma/schema.prisma`), **`PROMO-06`** (o promoție fără plafon poate produce `total = 0`). **Noul element față de runda 1:** campania există și rulează, iar comanda cu `total 0` există deja în DB.

**Severitate / clasă:** High · `VERIFIED` (DB) + `CODE-INSPECTED` (cod).

**Impact monetar.** Două ieșiri, ambele rele:
- plata reală pentru o comandă care ajunge `FAILED` (banii intrați, serviciul nu se livrează);
- până la 25 × prețul integral al unei comenzi serviciu gratuit (cost de provisionare pierdut), repetabil de același client (fără `maxPerUser`).

**Corectare recomandată.**
1. `api/src/services/stripe.ts:171-179` — `unit_amount` trebuie să fie suma **discountuită** pe linie (aceeași sumă pe care o scrie `order.total`), nu `item.unitAmount`; altfel `verifyAmount` nu are cum să coincidă.
2. `api/src/routes/orders.ts:79-89` — păstrează `unitAmount` (prețul de listă, pentru documentare) dar plătește `item.total`; dacă `total = 0`, comanda trebuie tratată **fără** Stripe (marcată `PAID` direct sau refuzată explicit).
3. `api/src/routes/admin.ts` (creare promoție) — acceptă și persistă `maxPerUser` (coloana există: `api/prisma/schema.prisma`, `Promotion.maxPerUser`), și plafonează valoarea procentuală la sub 100% pentru o campanie de lansare.
4. `api/src/services/pricing.ts:330-340` — plafonul discountului la subtotal e deja corect; se adaugă decizia explicită pentru `total = 0`.
5. Date: campania `LAUNCH` (100%, `maxPerUser NULL`) trebuie corectată sau oprită înainte de lansare.

---

### 3.8 PLP-08 — Low/Info — Contractul API nu descrie cartea de preț, iar câmpurile de sumă nu își spun unitatea

**Simptom.** `docs/API_CONTRACT.md:53-59` descrie produsul ca:

```
price: { amount, currency, period } | null,      // monthly base for the min config
```

Nu există `pricing` (minimum/recommended) și nu există `availability`, deși build-ul curent le trimite (`api/src/routes/catalog.ts:92-100`). Convenția unității apare o singură dată în tot contractul (`docs/API_CONTRACT.md:5`: „Money is always an integer number of minor units (EUR cents)"), iar câmpul `amount` nu o repetă.

**Cauză root confirmată.** Documentația nu a fost actualizată odată cu fixul de contract de preț din `3948f7f` (git: `3948f7f` vs. `docs/API_CONTRACT.md` nemodificat în acel commit — `git show 3948f7f --stat` nu listează `docs/`).

**Severitate / clasă:** Low/Info · `CODE-INSPECTED`.

**Impact monetar.** Niciunul direct. Integratorii citesc `price.amount` drept „prețul" fără să știe că există o carte separată min/recomandat și nici că suma e în cenuți.

**Corectare recomandată.** `docs/API_CONTRACT.md:53-59` — adaugă `pricing: { currency, period, minimum: {ram,cpu,disk,amount}, recommended: {...} }` și `availability: { state, orderable, blockers }`; marchează fiecare câmp de sumă cu „minor units (EUR cents)". Starea `PRICE-03`/`COMM-09` rămâne „parțial mitigată": unitatea e declarată global, nu pe câmp.

---

### 3.9 PLP-09 — Low/Info — Simulatorul de marketing anunțată resurse pe care 1,49 € nu le cumpără

**Simptom.** `web/src/data.ts:26`:

```
{ name: 'Discord Bot', cat: 'Bots', blurb: '...', from: 1.49, mb: 256, disk: 5, icon: 'bot' },
```

În simulator, 1,49 € înseamnă „256 MB · 5 GB disk". În catalogul real, 1,49 € este configurația **256 MB · 1 GB** (`minDisk = 1`). Diferența: 4 GB de stocare promises gratuit. În plus, 7 dintre cele 12 "aplicații" din `APPS` (Ghost, Forgejo, Grafana, n8n, MySQL, Redis, MongoDB) nu există în catalog.

Protecțiile existente (și de ce e `Low/Info`, nu `High`): `web/src/data.ts:8-17` are avertismentul „These entries are illustrative only… Never present an amount or an app from this list as the offer of the platform", iar interfața spune „Simulated preview. Nothing is created or billed. Prices are illustrative." (`web/src/home/Studio.tsx:225`). Prețurile din simulator folosesc tariful real (0,60 €/GB, 0,40 €/vCPU, 0,02 €/GB — `web/src/data.ts:46-47`).

**Severitate / clasă:** Low/Info · `CODE-INSPECTED`.

**Impact monetar.** Niciunul direct (nimic nu se facturéază din simulator). Risc de așteptare: un client poate citi „1,49 € cu 5 GB" și aștepta un preț pe care platforma nu îl vinde.

**Corectare recomandată.** `web/src/data.ts:18-31` — aliniază rândurile existente la catalogul real (`discord-bot.disk: 1`) și marchează explicit cele 7 aplicații inexistente; sau, mai bine, generează simulatorul din `GET /api/catalog/products` (ca `web/src/home/Catalog.tsx:21-26` face deja pentru catalogul real).

---

## 4. Traseul complet al ciclului de viață al prețului

Notă: coloana „abateri posibile" e verificată pe **codul curent din `/root/blipmade-work`**; starea live (producția) e în PLP-01/PLP-02.

| # | Etapă | Unde se calculează suma | Suma | Poate devia? |
|---|---|---|---|---|
| 1 | **Catalog (DB)** | `Product` (min/default/max) + `ProductPrice` (baseAmount, tarife) | `baseAmount` = 149 / 299 / 149 / 149 / 449 | Nu — sursă unică |
| 2 | **Catalog (API)** | `api/src/routes/catalog.ts:91` (`price.amount = price.baseAmount`), `:92-99` (`pricing.minimum/recommended` via `api/src/services/pricing.ts:86-114`) | 149 … 189 | **Da** — selecția rândului de preț diferă de cea a comenzii (PLP-06) |
| 3 | **Interfață: prețul de pornire** | `web/src/lib/pricing-contract.ts:91-94` (`startingPrice` → `pricing.minimum.amount`) | 149 | Nu — aceeași funcție ca la comanda |
| 4 | **Interfață: CTA-ul** | `web/src/app/DeployCatalog.tsx:135`, `app/ProductPage.tsx:145-150`, `app/Overview.tsx:219`, `app/Instances.tsx:101` → `deployPathFor(slug, startingConfiguration(product))` | — | **Da, în live**: CTA-ul nu duce configurația (PLP-02) |
| 5 | **Configurator: configurația inițială** | `web/src/lib/pricing-contract.ts:113-124` (`configurationFromQuery` → limitată la `[min,max]`, **nu aliniată la grilă**) | — | **Da**: sliderul poate afișa altă valoare decât cea taxată (PLP-03) și maximul e inaccesibil (PLP-04) |
| 6 | **Configurator: estimarea** | `POST /api/catalog/quote` → `api/src/routes/catalog.ts:176` → `buildQuote` → `priceItems` (`api/src/services/pricing.ts:152-175`) → `loadPrice` (`:130-140`) + `priceConfiguration` (`:40-54`) | 149 (256/1/1), 189 (1024/1/10) | **Da**: cotația publică nu primește `userId` ⇒ plafonul per cont nu se verifică (`PROMO-07`, prezent) |
| 7 | **Recapitulare (pasul 2)** | `web/src/app/Deploy.tsx:744-765` (Subtotal / Discount / Total din quote) | 149 / 172 / 189 | Nu — tot din server |
| 8 | **Plată (pasul 3)** | `web/src/app/Deploy.tsx:790-792` arată `quote.total` | 149 | **Da**: Stripe va cere `unitAmount` nediscountuit (PLP-07 / `COMM-01`) |
| 9 | **Comandă** | `POST /api/orders` → `api/src/routes/orders.ts:72-101`: `total = quote.total` (discountuit), `items[].unitAmount` = preț de listă; promoția se **rezervă** (`:106-113`) | total 0 (LAUNCH) / 149 | **Da, aici se naște** divergența `total` vs `unitAmount` (PLP-07) |
| 10 | **Stripe Checkout** | `api/src/services/stripe.ts:162-193`: `unit_amount: item.unitAmount`, `mode: 'subscription'` (comandă nouă) / `'payment'` (upgrade) | 189 (nu 0) | **Da** — `COMM-01`: suma cerută ≠ suma comenzii |
| 11 | **Abonament (Stripe)** | itemul Stripe creat cu `unit_amount` nediscountuit ⇒ **recură lunar la prețul de listă** | 189 | **Da** — discountul nu se propagă la recurență |
| 12 | **Abonament (local)** | `api/src/services/stripe.ts:304-316`: `Subscription.amount = item.total` (discountuit) | 0 | **Da** — pagina de facturare arată altă sumă decât cea încasată de Stripe (`billing.ts:132-138`) |
| 13 | **Factură** | `api/src/routes/webhooks.ts:281-291`: `upsertInvoice({ amount: paid })` din evenimentul Stripe | 0 în DB azi | Nu — vine de la Stripe |
| 14 | **Verificarea sumei** | `api/src/routes/webhooks.ts:188-196` + `:218-227` | — | **Da** — orice abatere (9 vs 10) ⇒ `FAILED` |
| 15 | **Provisionare / prețul instanței** | `api/src/routes/webhooks.ts:162`: `price: item.unitAmount` (nediscountuit) | 189 | **Da** — prețul stocat ≠ suma plătită și ≠ prețul configurației |
| 16 | **Estimarea lunară (client)** | `api/src/routes/billing.ts:116`: suma prețurilor stocate, **nerecalculată** | — | **Da** (`COMM-02`): instanța „Browser instance" (512/1/5) e stocată la 149, valoarea reală 172 |
| 17 | **Upgrade (resize)** | `api/src/services/upgrades.ts:37-60`: `priceDelta = newPrice - instance.price`; `newPrice` fără opțiuni (`:168-170`) | — | **Da**: delta e calculată față de prețul stocat (deci ereditatea erorii de la pasul 15/16) și add-on-urile se pierd (latent, 0 `ProductOption` în DB) |
| 18 | **Upgrade: comanda** | `api/src/services/upgrades.ts:81-82`: `total = max(0, priceDelta)`, `discount = |priceDelta|` dacă e negativ; downgrade aplicat imediat (`api/src/routes/instances.ts:278-293`) | 0 la downgrade | Comanda de downgrade rămâne `PENDING` cu total 0 pe toată durata vieții sale (documentat în runda 1, `05-commerce-and-billing.md:282`) |

**Concluzia traseului:** în codul curent, lanțul este coerent de la catalog până la estimare și recapitulare (un singur model, o singură funcție de calcul). Divergențele se produc la trei puncte: (a) **selecția prețului** (pasul 2, PLP-06), (b) **promoția vs Stripe** (pașii 9–14, PLP-07 / `COMM-01`), (c) **prețul stocat vs prețul configurației** (pașii 15–17, `COMM-02`). Punctul (c) este *confirmat în producție* printr-o instanță stocată la 149 pentru o configurație care costă 172.

---

## 5. Confirmări ale constatărilor din runda 1 (nu sunt repetate ca PLP-)

| id din runda 1 | stare în codul curent | dovadă |
|---|---|---|
| `COMM-01` — reducerea nu ajunge la Stripe | **ÎN SFATȘIT** | `api/src/services/stripe.ts:175` (`unit_amount: item.unitAmount`) vs `api/src/routes/orders.ts:79` (`total: quote.total`) vs `api/src/routes/webhooks.ts:192` |
| `COMM-02` — prețul stocat al instanței | **ÎN SFATȘIT** | `api/src/routes/admin.ts:932` (`price: price?.baseAmount ?? 0`); în producție: instanța „Browser instance" 512/1/5 la **149** (valoarea reală 172) |
| `PRICE-01`/`PRICE-02` — doar 1 din 5 produse e provisionabil | **ÎN SFATȘIT, dar starea s-a schimbat** | `discord-bot` are egg 15; celelalte 4 nu au egg. **WordPress are acum `deployable = true` fără egg** ⇒ în build-ul viu e comandabil (PLP-01) |
| `PRICE-03`/`COMM-09` — unitatea sumelor | **PARȚIAL MITIGAT** | unitatea e declarată în `docs/API_CONTRACT.md:5`, dar câmpul `price.amount` nu o repetă (PLP-08) |
| `PROMO-02` — `maxPerUser` nu poate fi setat | **ÎN SFATȘIT** | `maxPerUser` nu apare în `api/src/routes/admin.ts`; rândul live `LAUNCH` îl are `NULL` |
| `PROMO-06` — promoție fără plafon ⇒ total 0 | **ÎN SFATȘIT, cu efect produs** | `api/src/services/pricing.ts:330-340`; comanda live BM-00006 are `total = 0` (PLP-07) |
| `PROMO-07` — cota publică nu verifică plafonul per cont | **ÎN SFATȘIT** | `api/src/routes/catalog.ts:176` (`buildQuote(body.items, body.promotionCode)` — fără `userId`) vs `api/src/routes/orders.ts:72` |
| `PRICE-05` — 255/255 cotații live conforme formulei | **CONFIRMAT** | re-verificat azi: `discord-bot 256/1/1 → 149`, `512/1/5 → 172`, `wordpress 512/1/5 → 149`, `1024/1/10 → 189`; `BM-00001` (2048/4/49 → 470) confirmă formula |

---

## 6. Ce nu a putut fi verificat

1. **Stack-ul izolat nu are catalog.** `GET http://10.77.0.13:30003/api/catalog/products` → `{"products":[]}` (HTTP 200, listă goală), iar `blipmade_test` conține un singur produs, `draft-bot`, cu `visible = false`, `deployable = false` și fără preț. Verificările de browser ale configuratorului au fost făcute pe build-ul curent cu **răspunsuri API simulate** (mecanica UI e cea reală; valoarea estimatului a fost injectată, dar aceeași valoare a fost confirmată independent de API-ul live și de build-ul curent).
2. **Nu am creat nicio comandă, plată sau abonament**, deci pașii 10–13 (Stripe Checkout, factură, abonament, webhook) sunt doar `CODE-INSPECTED`, nu `VERIFIED`: în producție `Subscription`, `Payment` și `Invoice` au **0 rânduri**. Nicio plată reală nu a fost acceptată vreodată pe platformă.
3. **Nu am verificat Stripe în modul live** (`STRIPE_SECRET_KEY` gol / `stripe: "test"` în stack-ul izolat, `stripeLive()` fals ⇒ `api/src/services/billing.ts:248` nu produce facturi reale). Comportamentul Stripe a fost urmărit în cod, nu în sandbox.
4. **Starea reală a prețurilor după lansare** — dacă operatorul schimbă tariful prin `PUT /admin/pricing/:id` (`api/src/routes/admin.ts:557-574`, actualizare *in place*), prețul noilor comenzi se schimbă imediat, dar **prețul stocat al instanțelor existente nu se recalculează niciodată** (`api/src/services/billing.ts:116` citește `instance.price`; nu există job de reconciliere). Nu am putut măsura impactul, fiindcă tariful nu a fost schimbat în producție în timpul auditului.
5. **Add-on-urile (opțiunile plătite)** nu pot fi verificate end-to-end: `ProductOption` are **0 rânduri**, deci `options` în preț e mereu vid și pierderea lor la resize (`api/src/services/upgrades.ts:168-170`) rămâne latentă.
6. **Nodul Pterodactyl /provisionarea reală** — pentru `discord-bot` există egg 15, dar nu am declanșat nicio provisionare (nu se creează nimic); starea „server_created" pentru un produs fără egg e dedusă din cod (`api/src/services/provisioning.ts:234-236`), nu observată.
7. **Planul anual (`YEARLY`) și `COMM-07`** — nu există rânduri de preț `YEARLY` în DB; ramura de cod rămâne neacoperită de teste.
8. **Izolatul nu e izolat de jos în sus**: web-ul de pe `:30002` trimite către API-ul de producție (vezi §1.4). Prin urmare, verificările de browser au fost făcute cu interceptare completă a `/api/**`; nu am putut verifica comportamentul UI pe date reale din `blipmade_test`, pentru că acel stack are catalogul gol.
9. **Așirul cu „Build-ul de pe VM"**: `git status` pe `/opt/blipmade` e curat, iar sursa conține fixul (`grep -c priceBook` = 1/2 în sursă), dar containerul nu-l conține — am verificat conținutul build-ului (`/app/dist/...`), nu un proces de deploy care ar putea explica *de ce*.
10. **Nu am rulat suita de teste API** (instrucțiune explicită: rulează doar pe `blipmade_check`), deci nu am confirmat din green suite comportamentul lui `priceBook`.
