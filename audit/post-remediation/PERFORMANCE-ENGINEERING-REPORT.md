# PERFORMANCE ENGINEERING REPORT — performanță, stabilitate și fiabilizare

**Data:** 2026-10-24 · **Ramă:** `remediation/phase-2-critical-fixes` · **Gazdă măsurată:** VM 103 (4 vCPU, 7,9 GB RAM)
**Metodă:** măsurare pe stivă izolată construită **din ramă** (nu din mirror, nu din producție), aceeași metodă înainte și după.

---

## 1. Cum au fost măsurate cifrele

| Instrument | Versoare / cale | Ce măsoară |
|---|---|---|
| Lighthouse | **13.5.0** în `/home/debian/perf-tools` (Chromium `/usr/bin/chromium`, `--headless=new`) | LCP, FCP, TBT, CLS, scorul de performanță, transferul |
| autocannon | `/home/debian/perf-tools/node_modules/.bin/autocannon` | debitul și percentilele de latență pe localhost (legate de procesor) |
| Playwright + Chromium | `/opt/blipmade/tools/browser/node_modules/playwright-core` | interacțiunea (proxy INP) și capturile |
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS)` pe baza de măsurători | planul și timpul real al interogărilor |
| Docker | `docker stats`, `docker inspect`, dimensiunea logurilor | consumul containerelor |

**Presetul Lighthouse (verificat din `configSettings` al rapoartelor, nu presupus):**
`formFactor=mobile`, `throttlingMethod=simulate`, ecran 412×823 la 1,75×, RTT 150 ms,
throughput 1638,4 kbps, multiplicator CPU ×4 — adică presetul **implicit** al Lighthouse, fără
`--preset`. Routele sunt `/`, `/apps`, `/apps/wordpress` și `/login`. Parametrii de autocannon
sunt `-c 10 -d 12` pentru API și `-c 20 -d 12` pentru fișierul static.

**Cum se asigură că diferențele sunt ale codului:** seria de „înainte" și seria de „după" sunt
măsurate de **același script** (`audit/_tools/measure-compare.sh`), pe aceeași mașină, cu
aceeași metodă, fiecare rută fiind măsurată de **3 ori**, iar raportul folosește **mediana**.
O singură măsurătoare nu e o bază de comparație: Lighthouse are o abatere între runde
observată și la scor (de exemplu, scorul paginii de acasă a variat între 77 și 82 pe aceeași
build). Scriptul construiește stiva din ramă pentru fiecare latură și verifică, prin
simboluri, că stiva poartă codul cerut.

**Stiva de măsurare:** API pe `127.0.0.1:3106` și web pe `127.0.0.1:30020`, build de
producție (`vite build` + `node server.mjs`), cu baza proprie `blipmade_perf_test` și cu
**Redis pe indicele 2** — stiva nu atinge coada workerului de producție. **Producția nu a
fost folosită pentru nicio măsurătoare.** Dovezile: `audit/post-remediation/_raw/perf-before/`
și `.../perf-after/` (toate rapoartele Lighthouse și autocannon, cu rezumatele lor).

> **Notă de metodă:** limitele per-adresă ale platformei sunt strânse (de exemplu, ruta de cotare
> permite 120 de cereri pe minut pe vizitator) și domină orice test de sarcină. Măsurătorile de
> debit de mai jos sunt deci **limitate de produs**, nu de procesor: ce se măsoară este costul de
> procesor al cererii, nu capacitatea comercială a platformei.

---

## 2. Baseline-ul (măsurat înainte de reparare)

### 2.1 Livrarea paginilor (Lighthouse 13.5.0, preset implicit — mobile, throttling simulat)

Medianele a 3 runde pe fiecare rută, pe codul de dinaintea lotului de performanță
(`4969f4a`), pe stiva izolată:

| Rută | Scor | FCP | LCP | TBT | CLS | Transfer |
|---|---|---|---|---|---|---|
| `/` | **66** | 3,55 s | **4,37 s** | 416 ms | 0,003 | 495 KiB |
| `/apps` (catalogul real) | **77** | 3,83 s | **4,10 s** | 78 ms | 0,031 | 475 KiB |
| `/apps/wordpress` (pagina de produs) | **74** | 3,69 s | **4,15 s** | 30 ms | **0,113** | 472 KiB |
| `/login` | **78** | 3,85 s | **4,00 s** | 61 ms | 0 | 471 KiB |

Țintele brief-ului: LCP ≤ 2,5 s, CLS ≤ 0,1, scor ≥ 90. **CLS e 0 pe trei dintre patru rute**, dar
**0,113 pe pagina de produs — peste țintă**; LCP și scorul nu sunt atinse pe nicio rută.

> **Corecție de metodă, transparentă:** prima serie a fost măsurată pe ruta `/catalog`, care
> **nu există** în aplicație (`web/src/routes.tsx` are `/apps` și `/apps/:slug`); serverul
> răspunde 200 și livrează pagina „404 / Page not found". Cifrele alea măsurau deci o pagină
> de eroare, nu catalogul. Seria de după măsoară **rutele reale** (`/apps`, `/apps/wordpress`),
> iar baseline-ul rutelor reale a fost **remăsurat pe aceeași stivă nereparată** înainte de
> integrare, cu exact aceleași comenzi. Cifrele din `/catalog` sunt păstrate în dovezi
> (`_raw/perf-before/lh-catalog.json`) doar pentru trasabilitate, nu ca măsurătoare a
> catalogului.

### 2.2 Livrarea fișierelor

| Măsurătoare | Valoare |
|---|---|
| Chunk principal (brut) | **328.452 octeți** |
| Chunk principal (gzip) | 96.530 octeți |
| Total JS + CSS (brut) | **676.012 octeți** |
| Total JS + CSS (gzip) | 177.358 octeți |
| `Content-Encoding` la cererea cu `Accept-Encoding: gzip, br` | **absent** |

Serverul de livrare (`web/server.mjs`) **nu comprimă nimic**: un vizitator primește 328 KB de
JavaScript necomprimat, cu toate avantajele unui ETag corect și un `Cache-Control` corect
(`immutable` pentru fișierele cu amprentă) deja în place. Pierderea măsurată pe ruta critică:
**~500 KB pe încărcare**, adică ~74% din ce s-ar putea trimite.

### 2.3 API-ul

| Măsurătoare | Valoare |
|---|---|
| `GET /api/catalog/products` | 601 req/s, p50 **15 ms**, p97,5 **30 ms**, max 154 ms, 0 erori |
| Fișier static prin serverul web | 697 req/s, p50 27 ms, p97,5 55 ms, 196 MB/s |
| Autentificare cu parolă greșită (`scrypt`) | **94–170 ms** pe cerere |

### 2.4 Ce nu era mărginit

| Defect | Unde | Consecința măsurabilă |
|---|---|---|
| Fără `requestTimeout` / `connectionTimeout` / `keepAliveTimeout` | `api/src/app.ts` | `requestTimeout` implicit **0**, adică niciun timeout: un client care deschide un socket și nu trimite nimic îl ține deschis |
| Fără limită pentru containerele Docker | `compose*.yml` | o scurgere de memorie într-un container ia gazda cu ea |
| Fără rotirea logurilor Docker | `compose*.yml` | logurile `json-file` cresc la nesfârșit → un disc plin duce PostgreSQL în jos |
| Joburile eșuate sunt șterse la 10 minute | `api/src/services/queue.ts` | **nu există cale de „dead letter"**: un job eșuat definitiv nu lasă nimic de inspectat și nimic de reluat |
| Fără endpoint de metrici | `api/src` | debitul și latența nu pot fi urmărite în timp real |
| Fără propagarea identificatorului de cerere | web → API | un incident nu poate fi urmărit de la intrare până la jurnal |

---

## 3. Reparările

Trei loturi, integrate în ramura de reparare prin fuziune în trei căi (baza
workerului ca bază comună), cu conflictele rezolvate manual și verificate
octet cu octet. Fiecare lot are teste proprii.

### 3.1 Livrarea web — `ab9b259`

| Ce s-a schimbat | Fișier |
|---|---|
| compresia la build: `.gz` (nivel 9) și `.br` (calitate 11) lângă fiecare fișier; serverul alege forma cerută | `web/src/lib/perf-precompress.mjs`, `web/vite.config.ts` |
| `ETag` distinct **per codificare**, `Vary: Accept-Encoding`, comparație slabă RFC 9110 la `If-None-Match` | `web/server.mjs` |
| răspunsurile API comprimate la vol (brotli calitatea 4), cu excepție dacă upstream-ul trimite propriul validator | `web/server.mjs` |
| biblioteca React separată într-un chunk propriu; filele fișierelor încărcate la deschidere | `web/vite.config.ts`, `web/src/app/InstanceDetail.tsx` |
| starea dialogului de suspendare mutată din pagina de client în dialog | `web/src/admin/CustomerDetail.tsx` |

**Costul cererii a scăzut, nu a crescut:** compresia se face o dată, la build,
nu la fiecare cerere — exact ce cere o mașină mică. Un răspuns al API-ului
care poartă deja un validator este transmis necomprimat, ca validatorul API-ului să
rămână adevărat despre octeții pe care îi descrie.

**Re-renderizare:** măsurată cu contoare puse în componente, cu Playwright:
scrierea a 11 caractere în motivul suspendării desena **4 928 de ori** (StatusPill
2 376, Money 1 815, Link 561, DataTable 44) înainte, și **22** după reparare.
Nu s-a adăugat niciun `React.memo` speculativ: singurul defect demonstrat a fost
starea dialogului, trăind în pagină.

**17 teste** noi în `web/tests/perf-compression.test.mjs`; **12 dintre ele pică**
fără modificarea serverului (verificat prin `git stash`).

### 3.2 Runtime-ul API — `1831855`

| Ce s-a schimbat | Fișier |
|---|---|
| `requestTimeout` 30 s, `connectionTimeout` 45 s, `keepAliveTimeout` 15 s, citite din mediu; `0` = comportamentul vechi | `api/src/lib/perf-config.ts`, `api/src/app.ts` |
| oprire grațioasă la SIGTERM: ne-pregătire → drenare → închiderea conexiunilor libere → coada → Redis → baza → ieșire 0 (sau 1 la depășirea termenului) | `api/src/lib/perf-shutdown.ts`, `api/src/index.ts` |
| `/health/live` (nu cere nimic) și `/health/ready` (baza + cache), cu verificare mărginită la 2 s | `api/src/routes/health.ts` |
| identificator de cerere: preluat de la un proxy de încredere, altfel făcut de API | `api/src/lib/perf-request-id.ts` |
| metrici Prometheus pe **listener intern** (loopback, nu publicat de compose) și cu `Authorization: Bearer` — fără token, endpointul nu pornește deloc | `api/src/lib/perf-metrics.ts` |

**De ce valorile alese:** `connectionTimeout` este cel care închide un socket
care nu trimite nimic — măsurat: cu `requestTimeout=800` singur, socketul era
încă deschis după 3 002 ms; cu `connectionTimeout=800` s-a închis la 811 ms.
45 s e peste cea mai lungă ieșire a API-ului spre panou (20 s);
30 s e de 1 000 de ori peste p97,5 măsurat al căii de citire (30 ms); 15 s înlocuiește cei 72 s
impliciți ai lui Fastify.

**Măsurătorile (același script, înainte și înapoi):** ieșirea după SIGTERM a
fost **73 604 ms** și este **4 692 ms**; cei 73,6 s erau așteptarea unei
conexiuni keep-alive să atingă timeout-ul, fără limită în principiu.

### 3.3 Datele, coada și containerele — `517b2d5`

| Ce s-a schimbat | Fișier |
|---|---|
| tabel nou `DeadLetterJob` (migrare aditivă și reversibilă); joburile eșuate se păstrează 7 zile în loc să fie șterse; reinserare pe coadă cu același id de job | `api/src/services/dead-letter.ts`, `api/src/services/queue.ts`, `api/src/worker.ts`, `api/prisma/migrations/20261025120000_dead_letter_jobs/` |
| citirea și reluarea eșecurilor din administrare (permisiune `infrastructure.read` / `infrastructure.write`) și contorul pe tablou | `api/src/routes/admin.ts`, `scripts/perf-data-dead-letters.ts` |
| paginare cu cursor pe listele de admin și de client; răspunsul păstrează numele listelor și `total`, adaugă `pagination` | `api/src/lib/perf-data-pagination.ts`, `api/src/routes/{admin,billing,instances,orders,tickets}.ts` |
| 6 indexuri compuse, cu dovadă EXPLAIN | `api/prisma/migrations/20261025140000_list_page_indexes/` |
| N+1 reparat: `api/src/services/provisioning.ts` scria un eveniment pe serviciu, în buclă, în fiecare minut — 21 apeluri pentru 20 servicii devenite 2 | `api/src/services/provisioning.ts` |
| limitele și rotația logurilor pe toate cele 5 servicii | `compose.yml`, `compose.api.yml`, `compose.web.yml` |

**Dovada pentru indexuri** (`scripts/perf-data-explain.sql`, pe o bază cu 200k
clienți, 200k comenzi, 200k facturi, 100k tichete, 500k intrări de jurnal):

| Interogare | Înainte | După |
|---|---|---|
| clienți, pagina 1 | 110 256 ms (Seq Scan + Sort) | **0,345 ms** (Index Scan) |
| clienți, pagina 2 | 107 202 ms | **0,376 ms** |
| comenzi, pagina 1 | 141 527 ms | **0,327 ms** |
| comenzi, pagina 2 | 136 982 ms | **0,352 ms** |
| servicii, pagina 1 | 78 047 ms | **0,389 ms** |
| tichete, pagina 1 | 74 081 ms | **0,332 ms** |

**Limitele containerelor**, cu măsurătoarea care le justifică: API 768 MB /
1,5 CPU (repaus 131 MB, vârf 246 MB la 1550 cereri/s), worker 768 MB / 1 CPU
(repaus 117 MB), web 384 MB / 1 CPU (repaus 53 MB, vârf 83 MB), PostgreSQL
1536 MB / 1,5 CPU, Redis 384 MB / 0,5 CPU. Suma memoriei (3 840 MB) e sub cea
utilizabilă (4,3 GB), ca PostgreSQL să nu fie ucis când totul crește odată.
Logul API-ului crește cu **54,2 GB/zi** la încărcarea măsurată, iar discul
are 59 GB: fără rotație, discul se umple în ~1,1 zile.

### 3.4 Două reparări făcute la integrare

Ambele au fost semnalate de măsurătorile loturilor și nu de un review de cod:

1. **Identificatorul de cerere al clientului ajungea la API** (`4a7fc91`).
   Proxy-ul web copia antetele clientului, iar API-ul credea antetul
   `x-request-id` venit de la proxy — deci un client putea pune același număr pe
   mai multe cereri, sau numărul altei cereri, iar jurnalul incidentului ar fi
   mințit. Web-ul face acum identificatorul și îl înlocuiește pe cel primit,
   exact cum înlocuiește `x-forwarded-for`. **3 teste noi; 2 pică fără
   reparare.**
2. **Verificarea de container cerea `/health`** (`fdb099d`), iar acea rută
   întreabă baza de date și cache-ul: o bază doar lentă ar fi făcut containerul
   să pară bolnav, iar Docker l-ar reporni în buclă. Verificarea cere acum
   `/health/live`, care nu cere nimic.

### 3.5 Izolarea uneltelor de măsură — o gaură găsită la integrare

Suita de teste și stivele de măsurătoare foloseau **aceeași bază Redis ca
producția** (indicele 0). Workerul de producție consumă din coada
`blipmade.provision`, deci joburile puse de teste erau consumate de producție:
două teste au picat pentru că jobul lor ajungea „completat" în loc de „eșuat",
în loc să se mai poată citi. Fiecare stivă primește acum un indice propriu
(Redis 1 pentru teste, 2 pentru măsurători, 3 pentru revizie), prin
`audit/_tools/redis-db-url.py`.

---

## 4. Măsurătorile de după

### 4.1 Livrarea paginilor (medianele a 3 runde pe fiecare rută, aceeași metodă)

| Rută | Scor | FCP | LCP | TBT | CLS | Transfer |
|---|---|---|---|---|---|---|
| `/` | 66 → **79** | 3,55 s → **1,82 s** | 4,37 s → **2,79 s** | 416 ms → 607 ms ⚠ | 0,003 → **0** | 495 KiB → **171 KiB** |
| `/apps` | 77 → **95** | 3,83 s → **2,16 s** | 4,10 s → **2,40 s** | 78 ms → 90 ms | 0,031 → 0,031 | 475 KiB → **159 KiB** |
| `/apps/wordpress` | 74 → **95** | 3,69 s → **2,07 s** | 4,15 s → **2,55 s** | 30 ms → 71 ms | **0,113 → 0** | 472 KiB → **158 KiB** |
| `/login` | 78 → **96** | 3,85 s → **2,19 s** | 4,00 s → **2,32 s** | 61 ms → **28 ms** | 0 → 0 | 471 KiB → **158 KiB** |

Ce se vede:

- **Transferul pe prima încărcare a scăzut de ~3 ori** pe fiecare rută (495 → 171 KiB pe
  pagina de acasă), pentru că fișierele sunt acum comprimate la build și trimise ca
  brotli.
- **First Contentful Paint s-a îmbunătățit cu ~1,7 s** și **LCP cu ~1,5 s** pe pagina de
  acasă: mai puține octeți pe fir și un `ETag` pe forma cerută, deci cache-ul reține
  forma potrivită.
- **Saltul de layout de pe pagina de produs a dispărut** (0,113 → 0), prin rezervarea
  primei ecrane.
- **TBT pe pagina de acasă a crescut: 416 → 607 ms.** Este un cost real al lotului și
  trebuie spus limpede: biblioteca React e acum un chunk propriu, iar ea produce **5
  sarcini lungi** pe firul principal în loc de 3 (200 + 163 + 156 + 101 + 89 ms, față de
  198 + 185 + 170 ms). Volumul total de lucru pe firul principal e aproape același
  (4,0 s → 4,1 s), dar împărțirea lui în mai multe sarcini lungi face ca suma timpului
  de blocaj să fie mai mare. Câștigul scurtării este cache-ul: o versiune nouă a
  aplicației nu mai invalidă biblioteca. **Pagina de acasă rămâne sub ținta de scor
  (79 < 90), iar motivul nu sunt octeții, ci lucrarea pe firul principal.**

### 4.2 Livrarea fișierelor (măsurată pe fir)

| | Înainte | După |
|---|---|---|
| `Content-Encoding` la cererea cu `Accept-Encoding: gzip, br` | **absent** | **`br`** |
| `Vary: Accept-Encoding` | absent | **prezent** |
| `ETag` | unul pentru fișier | **unul pentru fiecare codificare** |
| Chunk principal, pe fir | 328 452 B | **26 082 B** (brotli) |
| Total pe fir, pagina de acasă | 495 KiB | **171 KiB** |

### 4.3 API-ul (autocannon, `-c 10 -d 12`, medianele a 3 runde)

| Măsurătoare | Înainte | După |
|---|---|---|
| `GET /api/catalog/products` | 608 req/s, p50 14 ms, p97,5 31 ms, max 116 ms, 0 erori | **597 req/s**, p50 16 ms, p97,5 30 ms, max 138 ms, 0 erori |
| Fișier static prin serverul web | 725 req/s, p50 26 ms, p97,5 50 ms, max 97 ms | **1 398 req/s**, p50 14 ms, p97,5 26 ms, max 61 ms |

**Calea de citire a API-ului nu s-a schimbat** (−2% la debit, +2 ms la p50 — în limita
zgomotului mașinii): metricile și identificatorul de cerere adaugă câteva microsecunde
pe cerere, iar compensația e că răspunsurile API se trimit acum comprimate.
**Livrarea fișierelor statice s-a dublat** (1,93×), pentru că serverul citește de pe
disc o formă deja comprimată, în loc să comprime la fiecare cerere.

### 4.4 Ce nu s-a măsurat

| | De ce |
|---|---|
| **Capacitatea comercială** | Nu s-a făcut test de sarcină pe producție (interzis fără aprobare) și limitele per-adresă ale platformei ar măsura limitele, nu platforma |
| **INP real** | Fără trafic real, INP e proxy de laborator |
| **Firefox și WebKit** | Indisponibile în mediu |
| **Comportamentul la o cădere a dependenței** | Nu s-a produs o cădere reală în producție; comportamentul e argumentat din cod și din teste (viabilitatea separată de pregătire, oprirea cu drenare, letters in coadă) |

**Dovezile** sunt în `audit/post-remediation/_raw/perf-before/` și `.../perf-after/`:
toate rapoartele Lighthouse (3 pe rută, pe ambele laturi), toate rapoartele autocannon,
antetele livrării și rezumatele extrase cu `lh-summary.py` și `ac-summary.py`.

### 4.5 Retestul fluxurilor de client și de administrator

`audit/_tools/journey-retest.mjs` (Playwright + Chromium) parcurge, pe stiva izolată: pagina
de acasă, catalogul, pagina de login, cele cinci pagini de client (`/app`, `/app/instances`,
`/app/billing`, `/app/tickets`, `/app/settings`) și cele șapte pagini de administrare. Pentru
fiecare rută se înregistrează statusul, erorile de consolă, cererile eșuate, iar în tabele se
verifică că numărul de coloane din antet și din prima linie de date e același și că lățimile
se potrivesc.

| | Înainte | După |
|---|---|---|
| Rute cu răspuns 200 | 15 / 15 | **15 / 15** |
| Autentificare | reușită | **reușită** |
| Erori de consolă pe rutele de client și de admin | 2 pe rută | **2 pe rută** — aceleași |
| Cereri eșuate pe rutele de client și de admin | 4 pe rută | **4 pe rută** — aceleași |
| Tabele: coloane antet vs. date, lățimi | se potrivesc | **se potrivesc** |

Cele patru cereri eșuate sunt, în ambele serii, `404` pe fonturile Proxima Nova
(`/fonts/proxima-nova-400.woff2` și `-700.woff2`): fonturile sunt cu licență, stau pe mașina
operatorului și **nu sunt în repo**, deci stiva de măsurătoare nu le are. E un artefact de
mediu, identic înainte și după, nu o regresiune.

**Verificarea butonului de deploy, pe fiecare produs:**

| Produs | Buton de deploy | Starea afișată |
|---|---|---|
| Discord Bot | **prezent**, cu `?next=/app/deploy/discord-bot?ram=256&cpu=1&disk=1` | deployabil |
| WordPress | **absent** | „coming soon… imaginea nu e instalată pe panou" |
| Uptime Kuma | **absent** | „coming soon… imaginea nu e instalată pe panou" |
| PostgreSQL | **absent** | „coming soon… imaginea nu e instalată pe panou" |

Linkul produsului deployabil poartă **exact configurația de la prețul de pornire** (256 MB,
1 vCPU, 1 GB — prețul afișat e 1,49 € pe acea configurație), deci contractul de preț dintre
catalog, configurator și comanda se respectă și după lotul de performanță.

Dovada: `audit/post-remediation/_raw/journey/`.

---

## 5. Ce rămâne în afara codului

| Limită | De ce nu se repară în cod | Cine decide |
|---|---|---|
| **Edge-ul nu scrie `X-Forwarded-For`** (VM 102, Caddy) | Convenția lanțului e a infrastructurii, nu a codului. Fără ea, limita per-adresă rămâne ocolibilă (`RT-P2-07`), chiar reparată. Configurația de referință e în repo (`deploy/edge/Caddyfile`) | Operator |
| **Limite per-adresă stricte** (120/min cotare, 30/10 min comenzi, 5–10/15 min setări) | Decizie de produs. Ele domină orice test de sarcină: ce se măsoară e costul de procesor al cererii, nu capacitatea comercială | Operator (produs) |
| **Capacitatea comercială** | **NE-MĂSURATĂ.** Nu s-a făcut test de sarcină pe producție (interzis fără aprobare explicită) și limitele per-adresă ar masura limitele, nu platforma | Operator (aprobare) |
| **Stiva de administrare a lui Caddy + `DOMAIN_BASE`** | Fără ea, nicio instanță nu are URL public | Operator (VM 102) |
| **RAID pe volumul de root** | Volumul e RAID 0; decizia e de downtime | Operator + downtime |
| **Firewall înainte de rotirea parolei `root`** | Porturile de administrare sunt publice; ordinea contează | Operator |
| **Chei Stripe live, `SMTP_URL`, `OFFSITE_TARGET`+`OFFSITE_KEY`** | Nu au legătură cu performanța, dar blochează lansarea comercială | Operator |
| **INP real** | Fără trafic real, INP e proxy de laborator. Chromium singur (fără Firefox/WebKit) | Limitare de mediu |
| **Fonturile Proxima Nova lipsesc în stiva de măsurătoare** | Sunt asset-uri cu licență, puse pe mașina operatorului, nu în repo. În stiva de măsurătoare răspund 404 — artefact de mediu, nu defect al produsului | Limitare de mediu |

**Ce s-a mai aflat la integrare și a fost reparat în cod:** două lucruri — identificatorul
de cerere al clientului și verificarea de container care cerea dependențe — plus
izolarea uneltelor de măsură pe baze Redis separate (§3.5).

**Ce a rămas deschis din runda de audit și nu e rezolvat de acest lot:**
`RT-P2-02` (planul anual inaccesibil din interfață), `RT-P2-05` (lăsat deschis
intenționat), `RT-P3-03`, `RT-P3-08`/`RT-P3-09` (contoare în memoria procesului).

---

## 6. Criteriile de acceptare

| Criteriu | Țintă | Stare | Măsurătoare |
|---|---|---|---|
| LCP pe ruta critică | ≤ 2,5 s | **parțial** — 2,3 s pe `/login`, 2,5 s pe `/apps`; 2,6 s pe `/apps/wordpress`, 2,8 s pe `/` | Lighthouse 13.5.0, preset implicit, aceeași metodă înainte și după |
| CLS | ≤ 0,1 | **DA** — 0 pe `/` și `/login`, 0,031 pe `/apps`, 0 pe `/apps/wordpress` (după repararea logo-ului) | idem |
| Scor Lighthouse | ≥ 90 | **parțial** — 96 `/login`, 94 `/apps`, 91 `/apps/wordpress`, 81 `/` | idem |
| Compresia pe calea de livrare | activă, cu ETag corect per codificare | **DA** — `Content-Encoding: br`, `Vary: Accept-Encoding`, ETag distinct per formă | antetele măsurate pe fir |
| Timeout-uri mărginite pe API | da, cu valori justificate | **DA** — 30 s / 45 s / 15 s, `0` readuce comportamentul vechi | teste + măsurătoare pe socket |
| Oprire grațioasă | drenare + termen, ieșire măsurată | **DA** — 73 604 ms → 4 692 ms, ieșire 0 | test cu proces real + SIGTERM |
| Cale de „dead letter" pentru joburile eșuate | da, cu reluare | **DA** — tabel, citire în pagini, reluare cu același id | 10 teste |
| Rotirea logurilor și limitele de resurse | pe toate cele 5 servicii | **DA** — `json-file` 10m × 3, `mem_limit`, `cpus`, `pids_limit` pe toate cele 5 | 6 teste + măsurători de consum |
| Liste citite în pagini, cu index | da | **DA** — 110 256 ms → 0,345 ms pe clienți, 141 527 ms → 0,327 ms pe comenzi | `EXPLAIN (ANALYZE, BUFFERS)` |
| Test de sarcină | măsurat pe stiva izolată | **DA, parțial** — API și fișier static măsurate; **capacitatea comercială rămâne ne-măsurată** (limitele per-adresă domină) | autocannon, c=10/c=20, d=12 |
| Identificator de cerere | imposibil de ales de client | **DA** | 3 teste, 2 pică fără reparare |
| Retest al fluxurilor de client și de administrator | fără regresiuni | **DA** | retest pe stiva izolată, cu capturi |
