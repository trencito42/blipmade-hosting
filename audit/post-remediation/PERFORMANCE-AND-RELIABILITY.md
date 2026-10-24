# Performanță și fiabilitate — audit post-remediere, Faza 11

**Platformă:** Blipmade (gaming hosting) — `api` (Fastify + Prisma + BullMQ), `web` (Vite SPA + `node server.mjs`), `postgres`, `redis`
**Data măsurătorilor:** 2026-10-23 → 2026-10-24 (UTC), pe gazda VM 103
**Commit auditat:** `2e1e78a` (branch `main`) — același cod ca în producție
**Mediu de măsurare:** stiva izolată de pe VM 103 — build de producție (`vite build` + `node server.mjs`), web `http://127.0.0.1:30003`, API `http://127.0.0.1:3101`, baza `blipmade_test`
**Nu s-a măsurat pe producție.** Nu s-a folosit niciodată portul 30002 și nu s-a accesat `blipmade.com` sau `http://10.77.0.13:3000`. Containerele de producție au fost citite doar cu `docker stats` / `docker inspect`.

---

## 1. Metadata, metodologie și ce nu s-a putut măsura

### 1.1 Hardware și mediu

| Element | Valoare | Sursă |
|---|---|---|
| Gazdă | Debian, kernel 7.0.14-25-pve, x86_64 | `uname -r` |
| Nuclee CPU | 4 | `nproc` |
| RAM | 7 947 MB (7.762 GiB), **swap 0 MB** | `free -m` |
| RAM folosit la măsurare | 2 958 MB (disponibil 5 394 MB) | `free -m` |
| Postgres | container `blipmade-postgres-1` | `docker ps` |
| Redis | container `blipmade-redis-1` | `docker ps` |
| Browser | Chromium `/usr/bin/chromium` + `playwright-core` | `ls /usr/bin` |

### 1.2 Standardul de măsurare

- **Latente API:** `curl -w '%{time_starttransfer} %{time_total}'`. Valorile brute sunt în **secunde**; în toate tabelele de mai jos sunt convertite explicit în **milisecunde**. 5 cereri de încălzire, apoi 15–30 cereri secventiale per endpoint; se raportează `min / p50 / p95 / max`.
- **Zgomot:** pe mașina de măsurare ruleau simultan alți auditori (stive pe porturile 3105, 3112, 3113, 3199 și API-ul comun de pe 3101). Un restart al API-ului de către un alt auditor în timpul primei rulări a invalidat măsurătoarea; **rerularea a fost făcută cu PID-ul procesului urmărit** (`_raw/perf11-api.txt`, PID notat în antet). Măsurătorile raportate mai jos provin din rularea validă.
- **Tranzacții DB per cerere:** diferența contorului `pg_stat_database.xact_commit` între două momente, împărțită la numărul de cereri. Contorul are o întârziere de ~1 s (`PGSTAT_MIN_INTERVAL`), de aceea scriptul doarme 2 s înainte de citirea de referință și 2 s după ultima cerere.
- **Blocuri citite:** delta `pg_stat_database.blks_read` / `blks_hit` pe 20 de cereri consecutive.
- **Interogări:** `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)` pe interogările reale ale serviciilor. Interogarea `UPDATE` din generatorul de numere de comandă a fost doar `EXPLAIN` (fără `ANALYZE`), pentru că `ANALYZE` ar executa o scriere.
- **Bundle:** dimensiuni brute, `gzip -9` și brotli pentru fiecare fișier. **Brotli nu este disponibil** pe gazdă (nici CLI, nici modul Python), deci rapoarele brotli sunt `n/a` — nu sunt estimate.
- **Rute:** Chromium real, context nou per rută, cache gol, așteptare `networkidle` + 600 ms. Contorizate toate cererile HTTP și dimensiunile corpurilor de răspuns.
- **Starea „populată":** bază de date **proprie** `blipmade_perf_test` (creată, populată și apoi eliminată de acest audit), cu volum realist: 5 001 utilizatori, 2 000 comenzi, 800 instanțe, 3 000 tichete, 50 506 intrări în jurnal, 800 abonamente, 32 MB. `blipmade_test` și baza de producție `blipmade` **nu au fost modificate**.

### 1.3 Ce NU s-a putut măsura (și de ce)

| Limită | Stare verificată | Consecință |
|---|---|---|
| **Lighthouse** | `which lighthouse` → nu este instalat; în `/opt/blipmade/tools` există doar `browser` | **Nu există scoruri Lighthouse** (Performance/Accessibility/SEO). Niciun scor nu este estimat sau inventat în acest raport. |
| **Core Web Vitals reali (INP, LCP, CLS)** | Nu există niciun instrument RUM în cod (`grep` pentru `web-vitals`, `gtag`, `clarity`, `sentry`, `datadog`, `newrelic` → zero rezultate) și nu există trafic real pe stiva izolată | **Nu pot fi produse valori reale de utilizator.** Cifrele de navigare din §3.2 sunt **sintetice, pe o mașină fără rețea lentă, fără 4G și fără concurență**; ele nu trebuie citite ca „INP/LCP/CLS de producție". |
| **Firefox și WebKit** | `ls /usr/bin` → doar `chromium`; `~/.cache/ms-playwright` nu există | Auditul de compatibilitate pe browsere nu a fost posibil; **nu există măsurători pe WebKit/Safari**. |
| **Test de încărcare / plafon de capacitate** | Nu a fost autorizat | **Nu există măsurătoare de plafon de capacitate.** Nu s-a putut stabili câți utilizatori simultani susține stiva. Ce s-a putut măsura: dimensiunea pool-ului (9 conexiuni/proces), numărul de tranzacții DB per cerere și comportamentul cozilor la gol — acestea sunt **proxy-uri**, nu înlocuiesc un test de sarcină. |
| **Compresie brotli a livrării** | `brotli` CLI și modulul Python lipsesc | Doar `gzip -9` este măsurat; rapoartele brotli din tabelul de bundle sunt `n/a`. |
| **`pg_stat_statements`** | `pg_extension` conține doar `plpgsql`; `shared_preload_libraries` este vid | **Nu există statistici per interogare** (apeluri, timp mediu per interogare). Numărul de interogări per cerere a fost dedus din contorul `xact_commit` și din planurile `EXPLAIN`, nu din `pg_stat_statements`. |
| **Trafic real pe producție** | Nu există acces la metrici Cloudflare sau la APM | **Nu se poate afirma ce procent din latenta reală a utilizatorilor provine din aplicație.** Toate valorile sunt din stiva izolată. |
| **Comportament în caz de panou Pterodactyl lent (nu indisponibil)** | Stiva izolată are panoul inaccesibil (refuz de conexiune) | S-a măsurat **doar** cazul „panou inaccesibil" (3,96 s). Comportamentul cu panou lent, dar răspunzând, **nu a fost măsurat**; limita de 20 s a clientului HTTP este însă stabilită din cod. |

---

## 2. Rezultate

### 2.1 Bundle și livrare

**Dimensiuni pe tip de fișier** (`_raw/perf11-bundle.txt`, §1.1)

| Tip | Fișiere | Brut | gzip (`-9`) | Observație |
|---|---|---|---|---|
| `js` | 36 | 754 872 B (737,2 KB) | 226 038 B (220,7 KB) | raport 29,9 % |
| `css` | 1 | 65 229 B (63,7 KB) | 12 242 B (12,0 KB) | raport 18,8 % |
| `html` | 1 | 850 B | — | |
| `woff2` | 11 | 146 868 B (143,4 KB) | — | fonturi self-hosted |
| `svg` | 1 | 1 491 B | — | favicon |
| **Total** | **50** | **969 310 B (946,6 KB)** | — | fără fonturi: 803,2 KB |

**Cele mai mari module** (`_raw/perf11-bundle.txt`, §1.3)

| Fișier | Brut | gzip | Ce conține |
|---|---|---|---|
| `assets/index-CmJkQ0sT.js` | 328 452 B (320,8 KB) | 95 332 B (93,1 KB) | bundle-ul principal (React, router, shell) |
| `assets/Docs-BejaFPi-.js` | 79 363 B (77,5 KB) | 22 668 B (22,1 KB) | parser markdown `marked` |
| `assets/InstanceDetail-Dxphuo_Q.js` | 69 375 B (67,7 KB) | 16 354 B (16,0 KB) | editor `ace` |
| `assets/index-B8mkGcfB.css` | 65 229 B | 12 242 B | Tailwind v4.3.3 |
| `assets/Deploy-D9c36LeY.js` | 20 370 B | 6 091 B | flux de deploy |
| `assets/logo-CHVIDgEH.js` | 15 803 B | 6 422 B | **chunk vendor comun** (React runtime), nu logo |
| `assets/Settings-BQs9IgjV.js` | 14 997 B | 4 406 B | setări client |
| `assets/Tickets-Cjv8ZRAh.js` | 13 781 B | 3 699 B | tichete client |

**Livrare — constatări directe**

| Verificare | Rezultat |
|---|---|
| `Accept-Encoding: gzip, br` pe bundle-ul principal | **Fără `Content-Encoding`**; `Content-Length: 328452` = dimensiunea brută (`_raw/perf11-bundle.txt` §1.6) |
| `Cache-Control` pe `/assets/*` | `public, max-age=31536000, immutable` — corect |
| `Cache-Control` pe `index.html` | `no-cache`, dar **fără `ETag` și fără `Last-Modified`** → nu există drum de `304` (`_raw/perf11-reliability.txt` §5.7) |
| Sourcemaps în `dist/` | 0 — corect pentru producție |
| Fonturi | **Self-hosted**, 11 fișiere `woff2`, toate cu `font-display: swap` — **nu blochează randarea** |
| Fonturi externe (http/https) | niciunul — corect |
| `<link rel="preload">` pentru fonturi | **niciunul** |
| Fonturi Proxima Nova | **3×404 garantat pe fiecare încărcare de pagină** (absente prin licență; confirmat și în build-ul de producție `/opt/blipmade/web/public/fonts/`) |
| Code splitting | 36 chunk-uri lazy, unul per rută — **funcționează corect**; `Overview-BaJz-G3s.js` (shell admin, 9,5 KB) e partajat de 12 rute admin |

### 2.2 Latenta pe rută (nivel de browser)

`_raw/perf11-routes.txt` — Chromium, context nou per rută, cache gol.

| Rută | Cereri | Octeți total | JS livrat | Fonturi (404) | TTFB | DOMContentLoaded | FCP | wall-clock |
|---|---|---|---|---|---|---|---|---|
| `/` (public) | **20** | 507 844 B | 347 018 B | 6 (3) | 7 ms | 219 ms | 628 ms | 2 444 ms |
| `/apps` | 14 | 484 875 B | 353 182 B | 4 (2) | 13 ms | 256 ms | 480 ms | 1 652 ms |
| `/apps/wordpress` | 14 | 479 788 B | 353 182 B | 4 (2) | 12 ms | 239 ms | 544 ms | 1 688 ms |
| `/docs` | 13 | 552 283 B | **426 381 B** | 4 (2) | 12 ms | 239 ms | 704 ms | 1 812 ms |
| `/status` | 13 | 474 819 B | 353 620 B | 4 (2) | 10 ms | 274 ms | 504 ms | **5 694 ms** |
| `/login` | 14 | 479 446 B | 353 544 B | 4 (2) | 13 ms | 350 ms | 960 ms | 2 112 ms |
| `/app` | 15 | 482 111 B | 355 170 B | 4 (2) | 10 ms | 236 ms | 420 ms | 1 932 ms |
| `/app/instances` | 13 | 474 743 B | 353 606 B | 4 (2) | 10 ms | 260 ms | 564 ms | 2 041 ms |
| `/app/billing` | 15 | 476 480 B | 355 383 B | 4 (2) | 7 ms | 209 ms | 424 ms | 1 938 ms |
| `/app/tickets` | 13 | 452 780 B | 355 392 B | 3 (2) | 12 ms | 255 ms | 524 ms | 1 903 ms |
| `/app/domains` | 13 | 454 691 B | 356 668 B | 3 (2) | 11 ms | 296 ms | 536 ms | 1 953 ms |
| `/app/settings` | 13 | 485 138 B | 362 015 B | 4 (2) | 24 ms | 258 ms | 472 ms | 1 986 ms |
| `/app/deploy` | 13 | 478 263 B | 352 164 B | 4 (2) | 11 ms | 248 ms | 596 ms | 2 071 ms |
| `/admin` | 13 | 477 378 B | 356 558 B | 4 (2) | 24 ms | 264 ms | 448 ms | 1 859 ms |
| `/admin/customers` | 14 | 485 146 B | 361 988 B | 4 (2) | 12 ms | 281 ms | 668 ms | 1 969 ms |
| `/admin/orders` | 14 | 484 807 B | 362 697 B | 4 (2) | 18 ms | 267 ms | 492 ms | 1 913 ms |
| `/admin/services` | 14 | 485 129 B | 364 097 B | 4 (2) | 13 ms | 226 ms | 452 ms | 1 850 ms |
| `/admin/products` | 14 | 500 348 B | 373 604 B | 4 (2) | 15 ms | 366 ms | 644 ms | 2 016 ms |
| `/admin/pricing` | 14 | 488 863 B | 365 386 B | 4 (2) | 9 ms | 207 ms | 428 ms | 1 812 ms |
| `/admin/tickets` | 15 | 504 375 B | 370 339 B | 4 (2) | 14 ms | 261 ms | 640 ms | 1 977 ms |
| `/admin/promotions` | 14 | 494 167 B | 372 845 B | 4 (2) | 8 ms | 268 ms | 504 ms | 1 856 ms |
| `/admin/infrastructure` | 14 | 491 989 B | 363 952 B | 4 (2) | 15 ms | 233 ms | 440 ms | 1 849 ms |
| `/admin/audit` | 14 | **558 048 B** | 361 755 B | 4 (2) | 13 ms | 378 ms | 588 ms | 2 016 ms |
| `/admin/staff` | 14 | 497 937 B | 363 925 B | 4 (2) | 11 ms | 252 ms | 504 ms | 1 916 ms |
| `/admin/settings` | 14 | 482 414 B | 361 708 B | 4 (2) | 13 ms | 425 ms | 688 ms | 2 047 ms |

**Observații**

- **TTFB-ul serverului este excelent: 7–24 ms** pe toate rutele. Problema nu este serverul, ci payloadul.
- Fiecare rută încarcă **352–426 KB de JavaScript necomprimat** (93,1 KB gzip pentru bundle-ul principal + chunk-uri).
- `/` (landing) face **20 de cereri**, dintre care **6× `GET /api/catalog/products` identice** (5 791 B fiecare) — 6 interogări identice în baza de date pentru aceeași pagină.
- Landing-ul trimite și un `POST /api/catalog/quote` care **răspunde 400** (157 B) — un calcul de preț fără elemente, cerut înainte ca utilizatorul să fi ales ceva.
- `/status` are un wall-clock de **5 694 ms**, dominat de `GET /api/status` (3,96 s — vezi §2.4).
- `/docs` și `/admin/audit` sunt cele mai grele rute (552 KB, respectiv 558 KB).
- Fiecare rută cere **3–6 fonturi**, dintre care **2–3 sunt 404** (Proxima Nova).

### 2.3 Latenta API pe stările relevante

**Starea „gol"/„mică"** — baza `blipmade_test` (10 produse, 44 utilizatori, 4 comenzi, 244 intrări în jurnal), 30 de cereri per endpoint (`_raw/perf11-api.txt` §3.1):

| Endpoint | min | p50 | p95 | max |
|---|---|---|---|---|
| `/api/auth/session` (fără sesiune) | 0,94 | 1,23 | 2,70 | 3,88 |
| `/api/health` | 3,19 | 3,38 | 12,66 | 12,87 |
| `/api/catalog/products` | 6,46 | 8,14 | 10,99 | 12,60 |
| `/api/catalog/products/wordpress` | 4,78 | 8,39 | 14,69 | 15,46 |
| `/api/auth/session` (client) | 6,58 | 10,41 | 20,14 | 25,74 |
| `/api/auth/session` (admin) | 6,41 | 8,18 | 9,36 | 16,24 |
| `/api/admin/overview` | 7,79 | 11,17 | 24,94 | 25,34 |
| `/api/admin/customers` | 8,07 | 11,32 | 18,85 | 20,07 |
| `/api/admin/orders` | 8,74 | 13,49 | 15,31 | 16,31 |
| `/api/admin/services` | 8,94 | 14,18 | 25,18 | 25,65 |
| `/api/admin/products` | 7,44 | 9,00 | 18,86 | 19,42 |
| `/api/admin/pricing` | 9,59 | 10,61 | 15,99 | 27,41 |
| `/api/admin/tickets` | 6,40 | 9,31 | 14,87 | 25,95 |
| `/api/admin/promotions` | 5,30 | 6,41 | 10,71 | 11,06 |
| `/api/admin/infrastructure` | 6,34 | 9,90 | 14,89 | 15,75 |
| `/api/admin/audit` | 19,39 | **23,49** | 24,97 | 25,43 |
| `/api/admin/staff` | 10,63 | 13,36 | 20,25 | 29,39 |
| `/api/admin/settings` | 6,20 | 7,76 | 8,62 | 8,64 |
| `/api/instances` (client) | 14,04 | 14,41 | 18,90 | 19,25 |
| `/api/orders` (client) | 6,08 | 8,86 | 16,87 | 32,71 |
| `/api/tickets` (client) | 5,53 | 6,20 | 9,78 | 9,96 |
| `/api/billing/invoices` (client) | 7,92 | 9,31 | 15,71 | 17,36 |
| **`/api/status` (public)** | **3 710** | **3 963** | **3 974** | **3 976** |

**Starea „încărcată" (loading)** — acoperită de măsurătoarea browserului: la fiecare navigare API-ul este apelat **în paralel cu** randarea skeleton-ului, deci timpul de încărcare nu adaugă latență server. Nu există endpoint care să blocheze randarea.

**Starea „populată"** — baza `blipmade_perf_test` (5 001 clienți, 2 000 comenzi, 50 506 intrări în jurnal), 15 cereri per endpoint (`_raw/perf11-populated2.txt` §6.5):

| Endpoint | p50 bază mică | p50 bază populată | Degradare |
|---|---|---|---|
| `/api/health` | 3,38 | 3,56 | ×1,1 |
| `/api/catalog/products` | 8,14 | 10,30 | ×1,3 |
| `/api/admin/staff` | 13,36 | 8,53 | ×0,6 |
| `/api/orders` (client) | 8,86 | 9,47 | ×1,1 |
| `/api/tickets` (client) | 6,20 | 10,27 | ×1,7 |
| `/api/instances` (client) | 14,41 | 14,22 | ×1,0 |
| **`/api/admin/overview`** | 11,17 | **21,40** | **×1,9** |
| **`/api/admin/audit`** | 23,49 | **34,36** | ×1,5 |
| **`/api/admin/orders`** | 13,49 | **41,69** | **×3,1** |
| **`/api/admin/tickets`** | 9,31 | **44,15** | **×4,7** |
| **`/api/admin/services`** | 14,18 | **54,16** | **×3,8** |
| **`/api/admin/customers`** | 11,32 | **65,19** | **×5,8** |

**Tranzacții de baza de date per cerere** (`_raw/perf11-api2.txt` §3.4, `_raw/perf11-populated2.txt` §6.5b):

| Endpoint | tranzacții/cerere (bază mică) | tranzacții/cerere (bază populată) | blocuri citite/cerere (bază mică) |
|---|---|---|---|
| `/api/health` | 0,40 | — | — |
| `/api/catalog/products` | 1,15 | — | 24,6 |
| `/api/auth/session` | 3,10 | — | — |
| `/api/tickets` (client) | 4,20 | — | — |
| `/api/orders` (client) | 4,15 | — | — |
| `/api/instances` (client) | 5,15 | — | — |
| `/api/admin/overview` | 4,75 | 3,35 | 64,5 |
| `/api/admin/customers` | 1,10 | **5,45** | 61,3 |
| `/api/admin/orders` | 6,55 | **8,80** | 45,5 |
| `/api/admin/services` | 5,20 | — | — |
| `/api/admin/tickets` | 7,35 | — | — |
| `/api/admin/audit` | **8,35** | 5,70 | **109,5** |

Pentru `/api/admin/customers`, numărul de tranzacții crește odată cu numărul de clienți returnați (1,10 pe 10 clienți, 5,45 pe 200), pentru că numărul de instanțe al fiecărui client se calculează printr-un sub-interogător corelat, executat **o dată pe rand** (vezi planul de mai jos: `SubPlan 1 … loops=200`).

**Calculul de preț (`POST /api/catalog/quote`)** — `_raw/perf11-api2.txt` §3.2ter, 15 cereri per variantă, cu token CSRF valid, sub limita de 120/min:

| Variantă | min | p50 | p95 | max |
|---|---|---|---|---|
| 1 produs | 8,65 | **17,03** | 24,50 | 28,30 |
| 2 produse | 15,90 | **18,47** | 22,84 | 24,41 |
| 4 produse | 16,01 | **23,74** | 27,69 | 36,63 |
| 8 produse | 22,82 | **34,79** | 46,48 | 58,40 |
| 1 produs + cod promo inexistent | 10,91 | **16,33** | 22,46 | 22,88 |

Creșterea este de **≈ +2,5 ms per produs în coadă** (17,03 → 34,79 ms între 1 și 8 produse) — semnătura unui **N+1 în bucla de calcul** (`api/src/services/pricing.ts:162-175`).

**Costul prin proxy-ul web (30003) față de API direct (3101)** — `_raw/perf11-api.txt` §3.3. Suprapunere mediană: `/api/catalog/products` 12,13 vs 8,14 ms (+4,0 ms), `/api/admin/overview` 12,65 vs 11,17 (+1,5 ms), `/api/admin/audit` 23,93 vs 23,49 (+0,4 ms). Proxy-ul adaugă ~1,5–4 ms; **nu este un vinovat**.

### 2.4 Planuri de interogare și costul în baza de date

**Planuri pe baza populată** (`_raw/perf11-populated2.txt` §6.6):

| Interogare | Plan | Execution | Planning |
|---|---|---|---|
| `admin.audit` lista (`take 300`) | `Index Scan Backward using "AuditLog_createdAt_idx"` | **0,48 ms** | 4,14 ms |
| `admin.audit` `count(*)` (50 506 rânduri) | `Index Only Scan using "AuditLog_targetType_targetId_idx"` — parcurge toate cele 50 508 intrări | **11,36 ms** | 3,55 ms |
| `admin.customers` lista (`take 200`) | `Seq Scan on "User"` (5 000 rânduri) + `Sort` + **`SubPlan 1` cu `loops=200`** | **10,19 ms** | 7,72 ms |
| `admin.customers` `count(*)` | `Index Only Scan using "User_role_idx"` | 1,45 ms | 3,39 ms |
| `admin.orders` lista (`take 200`) | `Hash Join` (`Seq Scan on "User"` 5 001) + `Seq Scan on "Order"` 2 000 + `Sort` | **10,93 ms** | 12,48 ms |
| `admin.overview` — clienți | `Index Only Scan using "User_role_idx"` | 1,45 ms | 3,43 ms |
| `admin.overview` — venitul lunii | `Seq Scan on "Order"` (fără index pe `createdAt`) | 1,30 ms | 5,49 ms |
| `admin.overview` — comenzi de azi | `Seq Scan on "Order"` | 1,01 ms | 4,07 ms |
| `admin.overview` — tichete deschise | `Seq Scan on "Ticket"` | — | 3,44 ms |
| `catalog` (produse + prețuri + opțiuni) | `Hash Left Join` ×2 | 1,51 ms | **11,15 ms** |
| `tickets` client (`take 100`) | `Index Scan using "Ticket_userId_status_idx"` | 0,61 ms | 4,76 ms |
| **secvența numerelor de comandă** | **`Seq Scan on "Order"` + `regexp_replace`** | **8,28 ms** | 6,10 ms |

**Constatări din planuri**

1. **Timpul de planificare depășește timpul de execuție** pentru interogările mici: 3,4–12,5 ms de *planning* contra 0,5–1,5 ms de *execution*. Cauza: schema are ~200 de indicii, iar fiecare interogare Prisma simplă le cunoaște pe toate la planificare (`Buffers: shared hit=403`–`483` în faza de planning).
2. **Lipsește indexul pe `User.createdAt`** — `admin.customers` face `Seq Scan` + `Sort` pe 5 000 de rânduri.
3. **Lipsește indexul pe `Order.createdAt`** — `admin.orders` sortează 2 000 de rânduri, iar agregatele panoului (`comenzi de azi`, `venitul lunii`) scanează tabelul.
4. **N+1 la nivel SQL în `admin.customers`**: `SubPlan 1` cu `loops=200` — câte un sub-interogator pentru numărul de instanțe al fiecărui client, unul per rand returnat. La 200 de clienți, 200 de sub-interogatoare.
5. **Generatorul de numere de comandă scanează întregul tabel `Order`** cu `regexp_replace`, de **două ori** la fiecare creare de comandă (`order-numbers.ts:47-80`). La 2 000 de comenzi: 8,28 ms; costul crește liniar cu numărul de comenzi.

**Indici existenți pe tabelele calde** (`_raw/perf11-db.txt` §4.4 + interogare directă `pg_indexes`): `Session_tokenHash_key`, `AuditLog_createdAt_idx`, `ProductPrice_productId_period_active_idx`, `ProductOption_code_key`, `Order_userId_status_idx`, `Order_status_idx`, `User_role_idx`, `Instance_userId_status_idx`, `Ticket_userId_status_idx`, `Subscription_status_idx`. **Nu există** pe `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt`, `Ticket.status`.

### 2.5 Baza de date și containere

**Starea bazei** (`_raw/perf11-db.txt` §4.1–4.8)

| Parametru | Valoare | Observație |
|---|---|---|
| `max_connections` | 100 | `superuser_reserved_connections = 3` |
| `shared_buffers` | 16 384 × 8 kB = 128 MB | 1,6 % din RAM-ul gazdei |
| `effective_cache_size` | 524 288 × 8 kB = 4 GB | 50 % din RAM — optimist, dar acceptabil |
| `work_mem` | 4 096 kB | implicit |
| `random_page_cost` | 4 | implicit (SSD) — duce planificatorul spre scanări secvențiale |
| `effective_io_concurrency` | 1 | implicit |
| `log_min_duration_statement` | **−1 (dezactivat)** | **nu există logare de interogări lente** |
| `log_statement` / `log_duration` | `none` / `off` | |
| `autovacuum` | `on`, `naptime 60s`, `max_workers 3`, `vacuum_scale_factor 0.2` | |
| Cache ratio (`blipmade_test`) | **99,73 %** (70 290 165 hit / 192 957 read) | excelent |
| Temp files | 0 B | |
| Tabele cu `n_dead_tup > 0` | toate | `last_vacuum = -` pe toate (doar autovacuum a rulat) |

**Scanări pe tabelele cu trafic** (`_raw/perf11-db.txt` §4.2): `Subscription` 60 222 `seq_scan` / 3 438 `idx_scan`; `Order` 56 389 / —; `Instance` 47 886 / —; **`AuditLog` 31 345 `seq_scan` vs 193 `idx_scan`** — jurnalul este citit aproape exclusiv prin scanare secvențială pe bazele mici, iar pe baza populată planificatorul trece la `Index Scan Backward` (0,48 ms).

**Conexiuni** — `blipmade_test`: `active = 1`, `idle = 9`; pe întreaga instanță: `cj_test = 7`, `blipmade_test = 10`, `uxaudit_test = 8`, `blipmade = 5`. Există **9 procese Node** cu bază de date, fiecare cu propriul pool Prisma; pool-ul implicit Prisma = `num_cpus × 2 + 1` = **9 conexiuni/proces** pe o gazdă cu 4 nuclee.

**Containere** (`_raw/perf11-reliability.txt` §5.4 — citire pe containerele de producție):

| Container | CPU | Memorie | PIDS | `Memory` | `MemorySwap` | `CpuQuota` | `PidsLimit` | Restart |
|---|---|---|---|---|---|---|---|---|
| `blipmade-web-1` | 0,00 % | 16,38 MiB | 11 | **0** | 0 | 0 | — | `unless-stopped` |
| `blipmade-api-1` | 0,00 % | 49,54 MiB | 17 | **0** | 0 | 0 | — | `unless-stopped` |
| `blipmade-worker-1` | 0,00 % | 38,61 MiB | 16 | **0** | 0 | 0 | — | `unless-stopped` |
| `blipmade-postgres-1` | 0,22 % | **1,411 GiB** | 42 | **0** | 0 | 0 | — | `unless-stopped` |
| `blipmade-redis-1` | 1,06 % | 11,31 MiB | 6 | **0** | 0 | 0 | — | `unless-stopped` |

**Niciun container nu are limită de memorie, CPU sau PIDs.** Postgres folosește 1,411 GiB din 7,762 GiB (18 %); **swap = 0**. Cei mai mici doi mari consumatori (api + worker) folosesc împreună 88 MiB.

### 2.6 Fiabilitate

**Coada BullMQ** (`_raw/perf11-extra.txt` §8.1): `blipmade.provision` — `wait = active = delayed = failed = 0`; `blipmade.email` — 2 chei de job stocate, `wait = active = delayed = failed = 0`. **Coada este goală**, deci comportamentul la suprasarcină **nu a putut fi observat direct**; configurația a fost citită din cod.

**Configurația cozilor** (`api/src/services/queue.ts`):

| Coadă | `attempts` | `backoff` | `concurrency` | `lockDuration` | Curățare |
|---|---|---|---|---|---|
| `blipmade.provision` | 5 (linie 63) | `exponential`, 5 000 ms (linia 64) | **2** (linia 94) | **120 000 ms** (linia 95) | `removeOnComplete/Fail: {count: 500}` |
| `blipmade.email` | 4 (linie 141) | `exponential`, 10 000 ms (linia 142) | 5 (linie 232) | 60 000 ms (linie 233) | `removeOnComplete/Fail: {count: 500}` |

**Oprire blanda (`SIGTERM`) cu cerere în curs** (`_raw/perf11-reliability.txt` §5.6) — masurătoare pe o **instantă proprie** (port 3127), fără a atinge stiva comună:

- cerere `GET /api/status` pornită; `SIGTERM` trimis la 981 ms după începerea cererii;
- logul procesului: `shutting down` la t+981 ms, apoi `request completed statusCode: 200 responseTime: 4015,74 ms` la t+4 022 ms;
- cererea s-a încheiat cu **HTTP 200, cu răspuns complet**, la 3 045 ms după `SIGTERM`;
- procesul s-a oprit curat după terminarea cererii.

**Deci `app.close()` așteaptă cererile în curs — corect.** Dar `docker inspect` arată `StopTimeout=<nil>` (implicit Docker: **10 s**), iar o cerere poate depăși ușor 10 s (`/api/status` cu panoul inaccesibil: 4,0 s măsurat aici; cu panoul lent: până la 6 s + 20 s + N×20 s conform limitei clientului HTTP).

**Supraviețuirea sesiunii la repornirea procesului** (`_raw/perf11-extra.txt` §8.2) — instanță proprie (port 3133), `SESSION_SECRET` constant:

- înainte de repornire: `/api/auth/session` → `{"user":{"id":"cmvlm6sku014gdxm7mp6puua6",...}}`
- după `SIGTERM` + pornire nouă: `/api/auth/session` → **aceeași sesiune, validă**, cu același cookie `bm_session`.

**Sesiunile supraviețuiesc repornirii containerului**, cât timp `SESSION_SECRET` rămâne constant. `Session` are 73 de rânduri în baza de test; cookie-ul este semnat HMAC cu secretul din mediu (`api/src/plugins/auth.ts`).

**Adevărul endpoint-urilor de sănătate**

| Endpoint | Răspuns | Spune adevărul? |
|---|---|---|
| `GET /api/health` | `{"status":"ok",...,"database":true,"redis":true,"mail":"file","stripe":"test","pterodactyl":"configured"}` | **Nu, ca indicator de pregătire.** Raportează `status: ok` și `pterodactyl: configured` deși panoul este inaccesibil (în același moment `/api/status` raportează `overall: major_outage`). Este un **liveness probe**, nu un readiness probe. |
| `GET /healthz` (web) | `{"status":"ok","fonts":{...,"installed":false,"missing":[3 fișiere]}}` | **Verifică doar containerul web**; nu atinge API-ul (`web/server.mjs:108-116`). Nu poate spune dacă aplicația e funcțională. |
| `GET /api/status` (public) | agregat pe 10 componente, fiecare măsurată separat | **Da** — este singurul care nu minte, dar costă 3,96 s (§2.3). |

**Adevărul cozilor la recreare**: cheile BullMQ sunt în Redis, deci joburile supraviețuiesc recreării workerului; un job în lucru este preluat de alt worker după expirarea lock-ului (120 s pentru provisionare).

---

## 3. Constatări

### 3.1 Schimbări de cod (sigure pentru faza următoare)

---

#### PERF-P1-01 — Serverul web nu comprimă nimic
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | `web/server.mjs` — livrare de fișiere statice |
| **Comportament observat** | `Accept-Encoding: gzip, deflate, br` este ignorat. `Content-Length: 328452` = dimensiunea brută a bundle-ului principal. Nu există `Content-Encoding`, nici `gzip`, nici brotli, nici variante pre-comprimate în `dist/`. |
| **Comportament așteptat** | Fișierele text (`.js`, `.css`, `.html`, `.svg`) se trimit comprimate; `br` pentru clienți moderni, `gzip` ca rezervă. |
| **Măsurătoare** | Bundle principal: **328 452 B livrat** vs **95 332 B gzip** (−71 %). Total JS pe o rută: **352–373 B brut** (măsurat în browser) vs **≈105–115 KB gzip** (suma valorilor gzip din tabelul per-fișier pentru chunk-urile acelei rute). Total pe rută (browser): **452–558 KB**; cu compresie ≈ **150–185 KB**. |
| **Cauză** | `web/server.mjs:186-202` — `createReadStream(filename).pipe(res)` fără nicio etapă de compresie; o căutare în `server.mjs` pentru `gzip`, `brotli`, `deflate`, `compress` sau `Content-Encoding` → **zero potriviri**. |
| **Remediere propusă** | (a) varianta minimă: în `server.mjs`, la trimiterea fișierelor cu `Content-Type` text, wrap-ul în `zlib.createGzip()`; (b) varianta preferată: generarea de `*.gz` / `*.br` la build (`vite-plugin-compression` sau pas post-build) și servirea lor condiționat de `Accept-Encoding`, cu `Vary: Accept-Encoding`. |
| **Câștig așteptat** | −65…−71 % din octeții JS/CSS transferați; pe ruta `/docs` (552 KB) se ajunge sub ~200 KB. |
| **Criteriu de verificare** | `curl -H 'Accept-Encoding: gzip' -D- http://127.0.0.1:30003/assets/<hash>.js` → `Content-Encoding: gzip` și `Content-Length` ≈ 95 332; retragerea în browser scade sub 200 KB pe `/`. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-02 — Landing-ul face 6 cereri identice pentru același catalog
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | `web/src/home/*` — secțiunile landing-ului |
| **Comportament observat** | `GET /api/catalog/products` este cerut **de 6 ori** la o singură încărcare a paginii `/` (trasă de rețea: 6 cereri identice, 5 791 B fiecare). Fiecare cerere ajunge în baza de date (`product.findMany` + relații). |
| **Comportament așteptat** | O singură cerere pe încărcare a paginii; componentele consumă același rezultat. |
| **Măsurătoare** | `/` → **20 cereri**, dintre care 6× `catalog/products`; `/api/catalog/products` = **1,15 tranzacții/cerere** → 6 cereri = **6,9 tranzacții identice pentru aceleași 8 produse**. În plus, landing-ul trimite un `POST /api/catalog/quote` care **răspunde 400** (fără elemente în coadă). |
| **Cauză** | Patru componente apelează direct `get('/catalog/products')`, ocolind cache-ul deja existent în modul: `web/src/home/Ticker.tsx:24`, `web/src/home/Story.tsx:126`, `web/src/home/Catalog.tsx:54`, `web/src/home/Configurator.tsx:33`; `web/src/home/Hero.tsx:12` și `:37` folosesc corect `useCatalogSummary()`. Cache-ul nefolosit: `web/src/lib/pricing.ts:32-51` (`pending` + TTL 60 000 ms la linia 36). |
| **Remediere propusă** | Exportă `loadCatalog()` din `web/src/lib/pricing.ts` (își are deja cache-ul și deduplicarea promisiunii) și folosește-l în cele patru componente; sau ridicați `useCatalogSummary()` la nivel de landing. |
| **Câștig așteptat** | −5 cereri HTTP și −5 tranzacții DB identice la fiecare vizită a landing-ului; latenta perceived a landing-ului scade cu timpul celei mai lente cereri duplicate. |
| **Criteriu de verificare** | Traseu de rețea pe `/`: `GET /api/catalog/products` apare **o singură dată**. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-03 — N+1 în calculul de preț: două interogări per element din coadă
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | `api/src/services/pricing.ts` — `priceItems` / `buildQuote` |
| **Comportament observat** | Fiecare element din coada unui calcul de preț declanșează **două interogări** (`loadPrice` + `loadOptions`). Latenta crește liniar cu numărul de elemente, iar fiecare cerere de calcul de preț înseamnă `1 + 2N` interogări. |
| **Comportament așteptat** | Prețurile și opțiunile se încarcă în bloc, cu una sau două interogări independente de numărul de elemente. |
| **Măsurătoare** | `POST /api/catalog/quote`: 1 produs **p50 17,03 ms** → 2: 18,47 → 4: 23,74 → 8: **34,83 ms**. Creștere ≈ **+2,5 ms per element**. La 8 elemente: **17 interogări** pentru un singur calcul de preț. |
| **Cauză** | `api/src/services/pricing.ts:162` — bucla `for (const item of items)`; `api/src/services/pricing.ts:172` — `const price = await loadPrice(product.id, period)`; `api/src/services/pricing.ts:174` — `const options = await loadOptions(product.id, optionCodes)`. |
| **Remediere propusă** | Extrage listele de `productId` și de `optionCodes` din coadă, apoi: un `productPrice.findMany({where: {productId: {in: ids}, period, active: true}})` și un `productOption.findMany({where: {code: {in: codes}, active: true}})`, grupate în memorie. |
| **Câștig așteptat** | Latenta unui calcul de preț cu 8 elemente: de la **34,8 ms la ~18 ms** (întoarcere la costul unei singure interogări); de la 17 interogări la 3. |
| **Criteriu de verificare** | `EXPLAIN`/log Prisma: un `quote` cu 8 elemente produce **≤ 4** interogări; p50 ≤ 20 ms pentru 8 elemente. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-04 — Lipsesc indicii pe coloanele de sortare ale listelor
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | `api/prisma/schema.prisma` — indici; listele admin |
| **Comportament observat** | Listele admin sortează pe coloane fără index: `admin.customers` → `Seq Scan on "User"` (5 000 de rânduri) + `Sort`; `admin.orders` → `Hash Join` cu `Seq Scan on "User"` (5 001) + `Seq Scan on "Order"` (2 000) + `Sort`; agregatele panoului scanează `Order` fără index pe `createdAt`. |
| **Comportament așteptat** | Index pe coloana de sortare; planul folosește `Index Scan`/`Index Only Scan` și evită sortarea în memorie. |
| **Măsurătoare** | `admin.customers` lista: **10,19 ms** execuție (bază populată) vs 0,92 ms înainte de populare → **degradare ×5,8** pe endpoint (11,32 → 65,19 ms p50). `admin.orders` lista: **10,93 ms** execuție. Lipsesc indici pe `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt`, `Ticket.status`. |
| **Cauză** | `api/prisma/schema.prisma` — modelele `User`, `Order`, `Ticket` nu au `@@index([createdAt])` / `@@index([updatedAt])`; interogările din `api/src/routes/admin.ts:93` (customers), `:328` (orders), `:730` (tickets) și `api/src/routes/health.ts` (overview) ordonează pe aceste coloane. |
| **Remediere propusă** | Adaugă `@@index([createdAt])` pe `User` și `Order`, `@@index([updatedAt])` pe `Ticket`, `@@index([status])` pe `Ticket`; migrare `prisma migrate`. |
| **Câștig așteptat** | `admin.customers` p50: de la **65 ms la sub 25 ms**; `admin.orders` p50: de la **42 ms la sub 25 ms**; eliminarea sortării în memorie la volum mare. |
| **Criteriu de verificare** | `EXPLAIN (ANALYZE)` pe baza populată: planurile conțin `Index Scan using "..._createdAt_idx"` și **nu** mai conțin `Sort` pe 5 000+ de rânduri. |
| **Autorizare necesară** | **Nu** (migrare de schemă — implică un `migrate deploy` în faza de remediere) |

---

#### PERF-P1-05 — Jurnalul de audit este numărat prin parcurgerea tuturor intrărilor
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/routes/admin.ts:972` — `GET /admin/audit` |
| **Comportament observat** | Pe lângă lista de 300 de intrări, endpointul cere și `count(*)` pe întregul jurnal. Pe baza populată, `count(*)` parcurge toate cele 50 506 intrări prin `Index Only Scan`. |
| **Comportament așteptat** | Numărul total este estimat sau calculat periodic, nu la fiecare cerere. |
| **Măsurătoare** | `count(*)` pe `AuditLog` (50 506 rânduri): **11,36 ms** execuție — **de ~24× costul listei** (0,48 ms). Contribuție: `/api/admin/audit` = **8,35 tranzacții/cerere**, **109,5 blocuri citite/cerere**, p50 **23,49 ms** (bază mică) / **34,36 ms** (bază populată), payload **75 639 B** per răspuns. |
| **Cauză** | `api/src/routes/admin.ts:972-1004` — `prisma.auditLog.count()` în aceeași cerere cu `findMany({take: 300})`. |
| **Remediere propusă** | (a) numărul total se calculează într-un agregat zilnic/cron și se servește din cache; (b) paginarea cursor-based cu `hasMore` în loc de total; (c) cel puțin, se evită `count()` când lista e goală. |
| **Câștig așteptat** | −11 ms și −50 000 de intrări parcurse per cerere; p50 `/api/admin/audit` sub 15 ms. |
| **Criteriu de verificare** | `EXPLAIN` pe `count(*)` nu mai parcurge tabelul; p50 scade sub 15 ms. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-06 — Numărul de comandă se generează printr-o scanare integrală a tabelului de comenzi
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/services/order-numbers.ts` — `nextSequenceNumber` |
| **Comportament observat** | La fiecare creare de comandă, secvența se calculează cu `MAX(... regexp_replace(o."number", '^BM-', '') ...)` peste **întregul** tabel `Order`, de **două ori** (o dată pentru `INSERT ... ON CONFLICT`, o dată pentru `UPDATE`-ul din bucla de retry). |
| **Comportament așteptat** | Secvența provine dintr-un contor (`Setting`) incrementat atomic, cu scanarea tabelului doar la reconciliere. |
| **Măsurătoare** | `EXPLAIN ANALYZE`: `Seq Scan on "Order"` (2 000 de rânduri) + `regexp_replace` → **8,28 ms** execuție. Costul crește **liniar** cu numărul de comenzi; la 100 000 de comenzi ar fi de ordinul sutelor de milisecunde, de două ori pe comandă. |
| **Cauză** | `api/src/services/order-numbers.ts:47` (`nextSequenceNumber`), `:56` (bucla de până la 3 încercări), `:62` (statement-ul `INSERT ... jsonb_build_object('value', COALESCE(MAX(...)))`), `:80` (statement-ul `SELECT MAX(...)` din `UPDATE`). |
| **Remediere propusă** | Numărul de comandă devine o secvență cu `Setting` (contor) incrementat atomic într-o singură tranzacție; `MAX(...)` rămâne doar ca procedură de reconciliere la pornire. |
| **Câștig așteptat** | Eliminarea a două scanări integrale per comandă; la 2 000 de comenzi, −16 ms per comandă; la volum mare, eliminarea unei dependențe liniare. |
| **Criteriu de verificare** | `EXPLAIN` pe statementul de secvență: **nu** mai conține `Seq Scan on "Order"`; crearea unei comenzi nu mai atinge tabelul `Order` înainte de `INSERT`. |
| **Autorizare necesară** | **Nu** (include atenție la corectitudinea numerotării — de verificat împreună cu `FINANCIAL-INTEGRITY.md`) |

---

#### PERF-P1-07 — Pagina publică de stare face apeluri seriale spre panou și durează 4 secunde
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/routes/health.ts` — `GET /status`, `nodeState`, `allocatorState` |
| **Comportament observat** | `GET /api/status` durează **3,96 s** (p50) și este cauza unui wall-clock de **5 694 ms** pe pagina `/status`. Pagina face `listNodes()` **de două ori** (o dată în `nodeState`, o dată în `allocatorState`) și apoi `listAllocations(nod)` **într-o buclă serială**, câte un apel per nod. |
| **Comportament așteptat** | Starea este măsurată în paralel, cu rezultat memorat (cache) pe un interval scurt; pagina publică răspunde în sub 1 s. |
| **Măsurătoare** | `/api/status`: min **3 710 ms**, p50 **3 963 ms**, p95 **3 974 ms**, max **3 976 ms** (3 măsurători consecutive: 3,9577 / 3,9715 / 3,9733 s). Contrast: `/api/health` = **3,5–6,0 ms**. Numărul de cereri spre panou = **2 + N** (N = numărul de noduri), fiecare cu timeout de **20 000 ms** (`api/src/services/pterodactyl/client.ts:175`), plus `ping()` cu timeout 6 000 ms. |
| **Cauză** | `api/src/routes/health.ts:107` (`nodeState` → `ptero.listNodes()`), `api/src/routes/health.ts:120` (`allocatorState` → `ptero.listNodes()` + bucla `for (const node of nodes) { await ptero.listAllocations(node.id) }`), `api/src/routes/health.ts:145` (`app.get('/status')`). Timeout-uri: `api/src/services/pterodactyl/client.ts:175` (implicit 20 000 ms) și `application.ts:346` (`ping` cu 6 000 ms). |
| **Remediere propusă** | (a) cache cu TTL de 15–30 s pentru rezultatul agregat; (b) `listNodes()` o singură dată, reutilizat; (c) `listAllocations()` în paralel cu `Promise.all` și cu timeout propriu mai mic; (d) servirea unei versiuni cache-uite din UI, cu reîmprospătare în fundal. |
| **Câștig așteptat** | Pagina `/status` de la **5,7 s la sub 1 s**; cu panoul inaccesibil, endpointul nu mai ocupă un slot de request timp de minute. |
| **Criteriu de verificare** | p50 `/api/status` < 500 ms cu panoul inaccesibil; numărul de apeluri spre panou pe cerere ≤ 2. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-08 — Cautarea sesiunii rulează la fiecare cerere, fără cache
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/plugins/auth.ts` — cârligul `onRequest` / `loadSession` |
| **Comportament observat** | Fiecare cerere care poartă cookie de sesiune rulează trei interogări (sesiune + utilizator + membru staff) înainte ca handlerul să înceapă. Nu există cache de sesiune. |
| **Comportament așteptat** | Sesiunea se rezolvă o dată per cerere și este reutilizată (cache scurt, sau un cache distribuitor în Redis). |
| **Măsurătoare** | `/api/auth/session` cu sesiune validă: **3,10 tranzacții/cerere**, p50 **10,41 ms** (client) / **8,18 ms** (admin), față de **1,23 ms** fără sesiune. Adăugat la fiecare cerere paginată: `admin/audit` ajunge la **8,35 tranzacții/cerere**. |
| **Cauză** | `api/src/plugins/auth.ts` — cârlig `onRequest` care apelează `loadSession(request)` la fiecare cerere; interogarea sesiunii este `findUnique` pe `tokenHash` (index `Session_tokenHash_key`, corect), dar **urmată de două interogări suplimentare** (utilizator + staff). |
| **Remediere propusă** | Cache de sesiune în Redis cu TTL scurt (30–60 s), invalidat la schimbarea parolei/rolului; sau cel puțin unificarea celor trei interogări într-una singură, cu `include`. |
| **Câștig așteptat** | −2 interogări la fiecare cerere autentificată; p50 `/api/auth/session` sub 4 ms; `admin/audit` de la 8,35 la ~6 tranzacții/cerere. |
| **Criteriu de verificare** | Tranzacții/cerere pentru `/api/auth/session` ≤ 1 (cu cache) sau ≤ 1 interogare (cu `include`); p50 < 5 ms. |
| **Autorizare necesară** | **Nu** (cache-ul de sesiune trebuie invalidat corect la logout/revocare — de coordonat cu `SESSIONS-INVESTIGATION.md`) |

---

#### PERF-P1-09 — Trei cereri de font garantat 404 la fiecare încărcare de pagină
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | `web/src/index.css` — regulile `@font-face` Proxima Nova |
| **Comportament observat** | CSS-ul declară trei `@font-face` pentru `/fonts/proxima-nova-{400,600,700}.woff2`, dar fișierele nu există în build (nici în cel izolat, nici în build-ul de producție) — **3× HTTP 404 la fiecare încărcare de pagină**. |
| **Comportament așteptat** | Fie fonturile există, fie regulile `@font-face` lipsesc până la instalarea lor. |
| **Măsurătoare** | `curl` pe cele trei căi → **404** (toate trei). `web/public/fonts/` conține doar `README.md`. `dist/fonts/` conține doar `README.md`. Din trasa de rețea: 3–6 cereri de font pe rută, dintre care 3 sunt 404. |
| **Cauză** | `web/src/index.css:16-31` (cele trei reguli `@font-face`), `web/src/index.css:62` (`--font-sans: "Proxima Nova", ...`), `web/fonts.mjs` (utilitarul care numește lipsurile). |
| **Remediere propusă** | Fie se publică fișierele woff2 cu licență web, fie se elimină cele trei reguli `@font-face` până la instalare (fallback-ul Geist rămâne). Varianta fără riscuri: **eliminarea regulilor**. |
| **Câștig așteptat** | −3 cereri HTTP (404) per încărcare de pagină; −3 intrări inutile în logurile de acces. |
| **Criteriu de verificare** | Trasa de rețea pe `/`: **0** răspunsuri 404. |
| **Autorizare necesară** | **Nu** (pentru eliminarea regulilor) / **Da** (pentru publicarea fonturilor — decizie de licențiere) |

---

#### PERF-P1-10 — Fonturile nu sunt preloadate, deci sunt descoperite după randare
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | `web/index.html`, `web/src/index.css` |
| **Comportament observat** | Fonturile sunt servite corect (self-hosted, `font-display: swap`, subset-uri `unicode-range`), dar `index.html` nu conține niciun `<link rel="preload">` pentru fonturi. Browserul le descoperă abia după ce parsează CSS-ul și randează textul → salt vizual (FOUT). |
| **Comportament așteptat** | Preload doar pentru subset-ul necesare (latin), nu pentru toate cele 11. |
| **Măsurătoare** | 11 fișiere `woff2` = **146 868 B (143,4 KB)**; subset-urile `latin` + `latin-ext` pentru Geist și Geist Mono = **83 736 B**. Trasa de rețea arată 3–6 cereri de font pe rută, **toate după** primul byte de JS. |
| **Cauză** | `web/index.html` (build-ul produce doar `modulepreload` pentru `logo-*.js` și `api-*.js`); `web/src/index.css` — 14 reguli `@font-face`. |
| **Remediere propusă** | `<link rel="preload" as="font" type="font/woff2" crossorigin>` pentru cele două subset-uri `latin` (29 400 B + 23 128 B). `crossorigin` este obligatoriu pentru fonturi. |
| **Câștig așteptat** | Eliminarea saltului vizual la prima randare; cu compresie, ~53 KB în plus transferați înaintea textului. |
| **Criteriu de verificare** | Cererea de font apare **înaintea** cererii principale de JS în ordinea traseului de rețea. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-11 — `index.html` nu are `ETag`, deci nu există drum de validare (`304`)
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | `web/server.mjs:195-200` |
| **Comportament observat** | `index.html` primește `Cache-Control: no-cache` (corect) dar **nu** `ETag` și **nu** `Last-Modified`. `If-None-Match` pe `index.html` nu produce `304`; browserul reia descărcarea integrală la fiecare navigare. |
| **Comportament așteptat** | `no-cache` + `ETag` ⇒ `304 Not Modified` la fiecare revenire pe site. |
| **Măsurătoare** | `ETag primit: niciunul`. Cost actual: **850 B** pe navigare — neglijabil în volum, dar înseamnă că fiecare vizitator reia întregerea fișierului de intrare. |
| **Cauză** | `web/server.mjs:195-200` — ramura non-`/assets/` scrie `Cache-Control: no-cache` fără `ETag`; ramura `/fonts/` (linia 182) **are** deja suport `ETag`/`304`, deci mecanismul există și nu e folosit pentru `index.html`. |
| **Remediere propusă** | Reutilizează logica de `ETag` de la linia 182 pentru `index.html` și activează `304`. |
| **Câștig așteptat** | −850 B per navigare + eliminarea unei cereri de revalidare complete. |
| **Criteriu de verificare** | `curl -H 'If-None-Match: <etag>'` pe `index.html` → `304`. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-12 — Rate limitingul acoperă doar o parte din endpoint-uri
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/app.ts` — `@fastify/rate-limit`; `api/src/routes/*` |
| **Comportament observat** | Limitatorul global este dezactivat (`global: false`); sunt limitate doar rutele cu `config.rateLimit` explicit — autentificare, `catalog/quote`, creare de comandă, setări. **Toate rutele de citire** (catalog, panou, listele admin) sunt nelimitate. |
| **Comportament așteptat** | Un plafon pe rutele de citire publice și pe listele admin, cu limite separate pentru utilizator autentificat și pentru client extern. |
| **Măsurătoare** | `POST /api/catalog/quote` → **429 după 120 cereri/min** (măsurat: rularea a produs `429` după 175 cereri). Rutele de citire nu au plafon: nu există măsurătoare de plafon (nu s-a autorizat test de încărcare), dar limitarea lipsește din cod, deci un consumator poate cere `/api/catalog/products` sau `/api/admin/audit` fără limită. |
| **Cauză** | `api/src/app.ts` (configurarea rate-limit-ului cu `global: false`) și absența `config.rateLimit` din `api/src/routes/catalog.ts`, `api/src/routes/admin.ts`, `api/src/routes/instances.ts`, `api/src/routes/tickets.ts`. |
| **Remediere propusă** | Limitare pe `catalog/products` (de ex. 60/min per IP cu cache), pe listele admin (de ex. 120/min per utilizator) și pe `auth/session`; plafon global ca plasa de siguranță (de ex. 300/min per IP). |
| **Câștig așteptat** | Protejează baza de date și pool-ul de 9 conexiuni la un consumator abuziv; nu crește latenta utilizatorului normal. |
| **Criteriu de verificare** | Niciuna dintre rutele de citire nu acceptă cereri nelimitate; apare `429` după plafon. |
| **Autorizare necesară** | **Nu** (alegerea limitelor este decizie de operator, dar implementarea este în cod) |

---

#### PERF-P1-13 — Blob-ul global de retenții este citit la fiecare încărcare a facturării
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | `api/src/services/billing.ts:333` — `instanceRetentions`; `api/src/routes/billing.ts` — `GET /billing/summary` |
| **Comportament observat** | `GET /billing/summary` citește, pe lângă agregatele sale, un rând `Setting` care conține **toate** retențiile clienților, ca un singur document JSON, de fiecare dată. Este o valoare globală, nu per-client. |
| **Comportament așteptat** | Blob-ul global se citește o dată și se ține în memorie cu invalidare la scriere. |
| **Măsurătoare** | `GET /billing/summary` = **4,15 tranzacții/cerere** (baza mică). Ponderea exactă a citirii `Setting` nu a fost izolată separat. |
| **Cauză** | `api/src/services/billing.ts:333-338` (`prisma.setting.findUnique({where: {key: RETENTION_SETTING_KEY}})`), apelat din `api/src/routes/billing.ts` în `GET /billing/summary`. |
| **Remediere propusă** | Cache în proces cu invalidare la scriere (`writeRetentionRecords`, `billing.ts:346`). |
| **Câștig așteptat** | −1 interogare per cerere pe panoul de facturare. |
| **Criteriu de verificare** | Tranzacții/cerere pentru `/api/billing/summary` scade cu 1. |
| **Autorizare necesară** | **Nu** |

---

#### PERF-P1-14 — Două biblioteci mari pot fi amânate până la interacțiune
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | `web/src/pages/Docs.tsx` (chunk `Docs-BejaFPi-.js`), `web/src/app/InstanceDetail.tsx` (chunk `InstanceDetail-Dxphuo_Q.js`) |
| **Comportament observat** | Chunk-ul de documentație conține parserul markdown `marked` (77,5 KB brut / 22,1 KB gzip) și chunk-ul de detaliu de instanță conține editorul `ace` (67,7 KB brut / 16,0 KB gzip). Amândoi sunt încărcați la intrarea pe rută, deși sunt necesari doar când utilizatorul deschide efectiv documentația, respectiv consola. |
| **Comportament așteptat** | `ace` se încarcă la deschiderea filei de terminal, nu la deschiderea paginii de detaliu. |
| **Măsurătoare** | `/docs` = **552 283 B** (cel mai greu traseu, cu 426 381 B JS); `/app/instances/:id` = 426 381 B JS. Cu compresie: `/docs` ≈ 185 KB. |
| **Cauză** | `web/src/pages/Docs.tsx:2452` (importul bibliotecii markdown la nivel de modul); `web/src/app/InstanceDetail.tsx` (import `ace` la nivel de modul). |
| **Remediere propusă** | `import()` dinamic al bibliotecii `ace` la deschiderea consolei; pentru `marked`, evaluarea dacă markdown-ul poate fi pre-rendered la build (fiind conținut static, editabil de operator). |
| **Câștig așteptat** | −67,7 KB brut (−16,0 KB gzip) pe `/app/instances/:id` la deschiderea inițială. |
| **Criteriu de verificare** | Trasa de rețea pe `/app/instances/:id` nu mai conține chunk-ul `InstanceDetail` la încărcarea inițială, ci doar la interacțiune. |
| **Autorizare necesară** | **Nu** |

---

### 3.2 Decizii de infrastructură și de operator

---

#### PERF-P1-15 — Logarea interogărilor lente este dezactivată
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | PostgreSQL — `log_min_duration_statement` |
| **Comportament observat** | `log_min_duration_statement = -1ms` (dezactivat), `log_statement = none`, `log_duration = off`. Nu se știe ce interogări sunt lente în producție. |
| **Comportament așteptat** | Prag de 200–500 ms, cu `log_line_prefix` care include durata și `application_name`. |
| **Măsurătoare** | `log_min_duration_statement = -1ms`; `log_line_prefix = %m [%p] ` (fără `%d` — durata nu e înregistrată). |
| **Cauză** | Configurația serverului Postgres (`compose.yml` / inițializarea containerului) — **nu** este cod de aplicație. |
| **Remediere propusă** | `ALTER SYSTEM SET log_min_duration_statement = '250ms'` + `ALTER SYSTEM SET log_line_prefix = '%m [%p] %d %a '` și `log_duration = on`; întoarcerea la valoarea curentă după o lună, cu revizuirea periodică a logului. |
| **Câștig așteptat** | face **măsurabilă** orice regresie de interogare viitoare; este condiția precedentă pentru orice optimizare viitoare bazată pe date. |
| **Criteriu de verificare** | `SHOW log_min_duration_statement` → `250ms`; o interogare artificială lentă apare în log cu durata. |
| **Autorizare necesară** | **Da** — modifică configurația serverului Postgres din producție |
| **Observație încrucișată** | `INFRASTRUCTURE-AND-RECOVERY.md` (raportul de infrastructură din aceeași rundă) tratează deja acest punct; nu se dublează acțiunea, ci rămâne blocantul comun. |

---

#### PERF-P1-16 — Niciun container nu are limită de memorie sau CPU
| | |
|---|---|
| **Severitate** | **P1 / High** |
| **Componentă** | Compose / Docker pe VM 103 |
| **Comportament observat** | `Memory=0`, `MemorySwap=0`, `NanoCpus=0`, `CpuQuota=0`, `PidsLimit` neSetat pentru **toate cele 5** containere. `swap = 0` pe gazdă. Postgres consumă 1,411 GiB din 7,762 GiB (18 %); api + worker împreună 88 MiB. Un container care intră într-o buclă de alocare poate consuma toată memoria gazdei și opri Postgres. |
| **Comportament așteptat** | Limite per container, cu o rezervă explicită pentru Postgres și Redis, plus `memory.high` pentru avertizare timpurie. |
| **Măsurătoare** | `docker inspect`: valorile de mai sus. `docker stats`: consumul actual. `free -m`: 7 947 MB total, **0 MB swap**. |
| **Cauză** | `compose.yml` — secțiunile `deploy.resources`/`mem_limit` lipsesc sau sunt ignorate în modul `docker compose up` fără `--compatibility`. |
| **Remediere propusă** | `mem_limit` per container (de ex. api 512 MB, worker 512 MB, web 256 MB, redis 256 MB, postgres 3 GB) + `mem_reservation`; `cpus` pentru worker; păstrarea unei rezerve de ~1,5 GB pentru gazdă și OOM killer. |
| **Câștig așteptat** | Un container cu scurgere de memorie este oprit și repornit, în loc să omoare Postgres și să taie plată de toți clienții. |
| **Criteriu de verificare** | `docker inspect` arată limite nenule pe toate containerele; `docker stats` rămâne sub plafon la sarcină normală. |
| **Autorizare necesară** | **Da** — modifică parametrizarea containerelor de producție |
| **Observație încrucișată** | `INFRASTRUCTURE-AND-RECOVERY.md` tratează deja limitele de memorie. |

---

#### PERF-P1-17 — Pool-ul de conexiuni este implicit, iar instanța Postgres este partajată
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/db.ts` (Prisma), configurația Postgres |
| **Comportament observat** | Fiecare proces Node are propriul pool Prisma, dimensionat implicit (`num_cpus × 2 + 1` = **9** pe o gazdă cu 4 nuclee). Sunt **9 procese Node** cu acces la baza de date. `max_connections = 100`, deja împărțit între 4 baze (`cj_test = 7`, `blipmade_test = 10`, `uxaudit_test = 8`, `blipmade = 5`). În producție: api (9) + worker (9) = 18. |
| **Comportament așteptat** | Pool dimensionat explicit și separat pentru API și worker; baza de producție cu un server Postgres dedicat, cu limite per rol. |
| **Măsurătoare** | `blipmade_test`: `active = 1`, `idle = 9` (pool-ul API-ului). `max_connections = 100`, `superuser_reserved_connections = 3`. **Pe gazda măsurată erau 9 procese Node cu acces la baza de date** (stiva comună de audit + stivele izolate ale celorlalți auditori); în producție sunt **2** (api + worker), adică 18 conexiuni. Blocat la 4 nuclee, un pool implicit de 9/proces înseamnă 9 × 9 = **81 de conexiuni posibile** înainte de a lovi plafonul de 100. |
| **Cauză** | `api/src/db.ts` — `new PrismaClient()` fără `connection_limit` în `DATABASE_URL`; `compose.yml` — un singur container Postgres pentru producție și mai multe baze de test. |
| **Remediere propusă** | `connection_limit` explicit în URL (api 10, worker 4); eliminarea bazelor de test rămase din instanța de producție (cele 9 baze `_test`); `max_connections` dimensionat pentru api + worker + migrați. |
| **Câștig așteptat** | Determinism: plafonul devine explicabil, iar un vârf de trafic nu se lovește de `max_connections` prin surprise; eliberarea conexiunilor din bazele de test. |
| **Criteriu de verificare** | `SELECT count(*) FROM pg_stat_activity WHERE datname='blipmade'` rămâne sub 40; pool-ul apare explicit în `DATABASE_URL`. |
| **Autorizare necesară** | **Da** — implică eliminarea de baze de date și reconfigurarea pool-ului în producție |

---

#### PERF-P1-18 — Workerul de provisionare are concurență 2 și poate sta blocat 15 minute pe un job
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/services/queue.ts:94-95`, `api/src/services/provisioning.ts` |
| **Comportament observat** | Workerul de provisionare rulează cu `concurrency: 2` și `lockDuration: 120000`. Un job poate aștepta până la **900 000 ms (15 minute)** instalarea serverului (`provisioning.ts:1260`; implicitul din client este 600 000 ms, `pterodactyl/application.ts:228`). La eșec, backoff-ul este exponențial de la 5 000 ms, cu 5 încercări — în total ≈ **75 s de rețries pe job**. Cu `concurrency: 2`, **două eșucuri simultane blochează întreaga coadă**, iar în cazul maxim (o instalare care nu se termină) fiecare slot de worker rămâne ocupat 15 minute — un plafon de **2 joburi la 15 minute, adică 8 pe oră**. |
| **Comportament așteptat** | Concurență dimensionată la volumul așteptat de provisionări; timeout pe așteptarea instalării sub limita de `lockDuration`; backoff cu plafon și circuit breaker pe panou. |
| **Măsurătoare** | Configurație: `concurrency: 2`, `lockDuration: 120000`, `attempts: 5`, `backoff: {type:'exponential', delay:5000}`. Timeout per apel HTTP spre panou: **20 000 ms** (`pterodactyl/client.ts:175`). Coada măsurată: **goală** (`wait = active = delayed = failed = 0`) — comportamentul la suprasarcină **nu a fost observat direct**, fiindcă nu există sarcină reală. |
| **Cauză** | `api/src/services/queue.ts:94` (`concurrency: 2`), `:95` (`lockDuration: 120_000`), `:63-64` (`attempts`, `backoff`); `api/src/services/provisioning.ts:1260` (`waitForServerInstalled(server.id, 900_000)`), `:619`/`:625`/`:632` (probe la 8 000 ms); `api/src/services/pterodactyl/application.ts:228` (implicit 600 000 ms). |
| **Remediere propusă** | `concurrency` 4–6 pentru provisionare; timeout pe `waitForServerInstalled` sub 120 s (sub `lockDuration`), cu reluare de la ultimul pas reușit prin `provisionStep`; circuit breaker pe panou (nu se mai reîncearcă în panou indisponibil) și metrică pe rata de eșec. |
| **Câștig așteptat** | Randamentul cozii de provisionare crește de 2 la 4–6 joburi concurente; un panou lent/oprit nu mai ține coada oprită 75 s pe job. |
| **Criteriu de verificare** | `concurrency` crescut în cod; coada nu rămâne cu `active = 2` și `wait > 0` când panoul nu răspunde. |
| **Autorizare necesară** | **Da** — schimbă comportamentul cozii în producție (impact asupra comportamentului de retry) |

---

#### PERF-P1-19 — Timpul de oprire al containerului nu acoperă o cerere lentă
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | Docker (`StopTimeout`), `api/src/index.ts` (`shutdown`) |
| **Comportament observat** | `app.close()` așteaptă corect cererile în curs (verificat: cererea a răspuns **HTTP 200** după 3 045 ms de la `SIGTERM`). Dar `docker inspect` arată `StopTimeout=<nil>` → implicit Docker **10 s**. Orice cerere care depășește 10 s este ucisă cu `SIGKILL` în timpul unui deploy, fără răspuns pentru client. |
| **Comportament așteptat** | `stop_grace_period` în compose mai mare decât cel mai lent răspuns posibil, sau un timeout de oprire explicit în cod. |
| **Măsurătoare** | Cerere în curs la oprire: **HTTP 200, răspuns complet, 3 045 ms după `SIGTERM`** (`_raw/perf11-reliability.txt` §5.6). `StopTimeout=<nil>` pentru api și worker. Cea mai lentă cerere măsurată: `/api/status` = **3,96 s**; cea mai lentă *posibilă* cu panoul inaccesibil: `ping` 6 s + `listNodes` 20 s + N × `listAllocations` 20 s. |
| **Cauză** | `api/src/index.ts:9-20` — `shutdown()` apelează `app.close()` fără timeout; `compose.yml` — lipseste `stop_grace_period`; `docker inspect` → `StopTimeout=<nil>`. |
| **Remediere propusă** | `stop_grace_period: 60s` pentru api și worker; timeout explicit în `shutdown()` (de ex. 45 s) care, la depășire, închide conexiunile și iese curat; reducerea în paralel a lui `/api/status` (PERF-P1-07). |
| **Câștig așteptat** | În deploy, cererile în curs primesc răspuns în loc de a fi întrerupte; eliminarea erorilor 502 din fereastra de deploy. |
| **Criteriu de verificare** | `docker inspect` arată `StopTimeout` nenul; un deploy în timp ce `/api/status` rulează produce un răspuns complet, nu o conexiune întreruptă. |
| **Autorizare necesară** | **Da** — parametrizare de container în producție |

---

#### PERF-P1-20 — `/api/health` nu este un indicator de pregătire
| | |
|---|---|
| **Severitate** | **P2 / Medium** |
| **Componentă** | `api/src/routes/health.ts` — `GET /health`; `web/server.mjs:108` — `/healthz` |
| **Comportament observat** | `/api/health` raportează `{"status":"ok", ...}` și se bazează doar pe `database` și `redis`; **nu verifică panoul**, chiar dacă îl declară `"pterodactyl":"configured"`. În momentul măsurătorii, panoul era inaccesibil, `/api/health` raporta `status: ok`, iar `/api/status` raporta `overall: major_outage`. `/healthz` al containerului web verifică doar existența fonturilor — nu atinge API-ul. |
| **Comportament așteptat** | Un endpoint de pregătire (`/ready`) care verifică baza de date **și** Redis **și** panoul, folosit de orchestrator; unul de viabilitate (`/health`) separat. |
| **Măsurătoare** | `/api/health` = 3,5–6,0 ms și `"status":"ok"` în timp ce `/api/status` = 3,96 s și `"overall":"major_outage"` — **cele două răspunduri diferit în aceeași secundă**. `/healthz` (web) = `{"status":"ok","fonts":{...,"installed":false,...}}`. |
| **Cauză** | `api/src/routes/health.ts` (statusul e `database ? 'ok' : 'degraded'`; Redis și panoul apar doar ca câmpuri informative); `web/server.mjs:108-116` (răspuns static, fără apel la API). |
| **Remediere propusă** | Adaugă `/ready` care verifică baza de date, Redis și panoul, cu un timeout scurt, și folosește-l în `healthcheck`-ul Docker; păstrează `/health` ca liveness probe. Pentru web: `/healthz` rămâne liveness; adaugă un readiness care verifică proxy-ul spre API. |
| **Câștig așteptat** | Containerele cu dependențe rupte sunt retrase din rotație înainte de a primi trafic; `restart: unless-stopped` nu mai reanimă un container cu panoul mort. |
| **Criteriu de verificare** | `GET /ready` → `503` când panoul este inaccesibil, `200` când totul e ok. |
| **Autorizare necesară** | **Da** — modifică `healthcheck`-urile și comportamentul de repornire în producție |

---

#### PERF-P1-21 — Nu există cache la margine pentru activele statice
| | |
|---|---|
| **Severitate** | **P3 / Low-Info** |
| **Componentă** | Cloudflare / web `server.mjs` |
| **Comportament observat** | Activele cu hash primesc `immutable` de 1 an de la serverul de origine, dar **nu există un CDN la margine** care să le servească: fiecare vizitator nou descarcă activele de la origine. De asemenea, `index.html` nu poate fi servit din cache la margine (corect, `no-cache`). |
| **Comportament așteptat** | Activele statice servite din cache la margine, cu origine doar la modificare. |
| **Măsurătoare** | Fiecare rută încarcă **347–426 KB de JS necomprimat de la origine**; nu există `ETag`/`Age`/`cf-cache-status` pe activele statice în stack-ul izolat (nu este proxy-at prin Cloudflare). |
| **Cauză** | Arhitectura de livrare (web → Cloudflare → origine) — decizie de operator. |
| **Remediere propusă** | Cache la margine pentru `/assets/*` și `/fonts/*`; în paralel, compresie la origine (PERF-P1-01) ca măsură independentă de rețea. |
| **Câștig așteptat** | Originea nu mai servește activele statice repetat; TTFB perceput pentru vizitatorii noi scade la latența marginii. |
| **Criteriu de verificare** | `curl -I https://blipmade.com/assets/<hash>.js` → `cf-cache-status: HIT` și `Age` crescător. |
| **Autorizare necesară** | **Da** — configurare Cloudflare |

---

### 3.3 Tabel de prioritizare

Scor: **Câștig (1–5)** ÷ (**Efort (1–5)** × **Risc (1–5)**). Raport mai mare = se atacă primul. „Efort" include scrierea codului, testul și revizia; „Risc" este riscul de regresie (1 = foarte mic).

| # | ID | Optimizare | Câștig | Efort | Risc | Raport | Tip |
|---|---|---|---|---|---|---|---|
| 1 | PERF-P1-01 | Compresie (gzip/brotli) în `web/server.mjs` | 5 | 2 | 2 | **1,25** | cod |
| 2 | PERF-P1-02 | Landing-ul cere catalogul o singură dată | 4 | 1 | 1 | **4,00** | cod |
| 3 | PERF-P1-03 | `priceItems`: încărcare în bloc a prețurilor/opțiunilor | 5 | 2 | 2 | **1,25** | cod |
| 4 | PERF-P1-04 | Indici pe `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt/status` | 5 | 2 | 2 | **1,25** | cod (+migrare) |
| 5 | PERF-P1-07 | Cache + paralelism pentru `/api/status` | 5 | 2 | 2 | **1,25** | cod |
| 6 | PERF-P1-15 | `log_min_duration_statement = 250ms` | 5 | 1 | 1 | **5,00** | infrastructură |
| 7 | PERF-P1-16 | Limite de memorie/CPU per container | 5 | 2 | 3 | **0,83** | infrastructură |
| 8 | PERF-P1-06 | Contor atomic pentru numerele de comandă | 4 | 3 | 4 | **0,33** | cod |
| 9 | PERF-P1-05 | `count(*)` pe jurnal, fără parcurgere totală | 4 | 2 | 2 | **1,00** | cod |
| 10 | PERF-P1-18 | Concurență worker + circuit breaker pe panou | 4 | 2 | 4 | **0,50** | infrastructură |
| 11 | PERF-P1-08 | Cache de sesiune / interogare unică | 3 | 3 | 3 | **0,33** | cod |
| 12 | PERF-P1-17 | `connection_limit` explicit + curățarea bazelor de test | 3 | 2 | 4 | **0,38** | infrastructură |
| 13 | PERF-P1-19 | `stop_grace_period` + timeout de oprire | 3 | 1 | 3 | **1,00** | infrastructură |
| 14 | PERF-P1-20 | Endpoint `/ready` real | 3 | 2 | 2 | **0,75** | infrastructură |
| 15 | PERF-P1-12 | Rate limiting pe rutele de citire | 3 | 2 | 1 | **1,50** | cod |
| 16 | PERF-P1-09 | Eliminarea celor 3 reguli `@font-face` cu fișiere inexistente | 2 | 1 | 1 | **2,00** | cod |
| 17 | PERF-P1-10 | Preload pentru subset-urile `latin` | 2 | 1 | 1 | **2,00** | cod |
| 18 | PERF-P1-11 | `ETag` pe `index.html` | 1 | 1 | 1 | **1,00** | cod |
| 19 | PERF-P1-21 | Cache la margine pentru activele statice | 3 | 2 | 2 | **0,75** | infrastructură |
| 20 | PERF-P1-13 | Cache în proces pentru blob-ul de retenții | 1 | 1 | 2 | **0,50** | cod |
| 21 | PERF-P1-14 | `import()` dinamic pentru `ace` și `marked` | 2 | 2 | 1 | **1,00** | cod |

**Ordinea de atac recomandată:** PERF-P1-02 → PERF-P1-15 → PERF-P1-01 → PERF-P1-03 → PERF-P1-04 → PERF-P1-07 → PERF-P1-16 → PERF-P1-19. Primele șase sunt fie cod de frontend/backend fără infrastructură, fie o singură linie de configurare; aduc cea mai mare reducere a timpului perceput și a încărcării bazei de date.

---

## 4. Ce nu am putut măsura

Rezumat al limitelor, cu verificarea făcută pentru fiecare (detalii în §1.3):

1. **Niciun scor Lighthouse** — Lighthouse nu este instalat pe gazdă (`which lighthouse` → gol). Nu există scoruri Lighthouse (Performance/Accessibility/SEO/Best Practices) în acest raport și niciunul nu a fost estimat.
2. **Nicio valoare reală de Core Web Vitals (INP, LCP, CLS)** — nu există instrument RUM în cod și nu există trafic real pe stiva izolată. Timpii de navigare din §2.2 sunt **sintetici**, măsurați pe Chromium pe o mașină fără throttling și fără concurență; **nu** trebuie prezentați ca valori de utilizator.
3. **Nicio măsurătoare pe Firefox sau WebKit** — doar Chromium este instalat. Comportamentul pe Safari/WebKit nu a fost verificat.
4. **Niciun plafon de capacitate** — nu a fost autorizat test de încărcare. Nu se poate afirma numărul de utilizatori simultani suportați. Ce s-a măsurat în schimb: pool de 9 conexiuni/proces, tranzacții DB per cerere (0,40 – 8,80) și blocuri citite per cerere (24,6 – 109,5) — **proxy-uri de încărcare, nu un plafon**.
5. **Nicio măsurătoare de compresie brotli** — brotli nu este disponibil (CLI și modul Python lipsesc); tabelul de bundle raportează doar `gzip -9`, iar coloana brotli este `n/a`.
6. **Nicio statistică per interogare** (`pg_stat_statements` nu este instalat; `shared_preload_libraries` vid). Numărul de interogări per cerere a fost dedus din contorul `xact_commit` și din planurile `EXPLAIN`.
7. **Niciun comportament măsurat la suprasarcină a cozilor** — ambele cozi BullMQ erau goale. Configurația (concurență, backoff, `lockDuration`) e citită din cod; comportamentul la suprasarcină e **inferat din configurare, nu observat**.
8. **Niciun comportament măsurat cu panoul Pterodactyl lent** — doar cazul „inaccesibil" (3,96 s). Limita de 20 s a clientului HTTP e stabilită din cod.
9. **Nicio latență reală de utilizator pe producție** — nu există acces la metrici Cloudflare sau APM; nu se poate atribui procentual latența reală aplicației versus rețea.
10. **Nicio măsurătoare a consumului de memorie sub sarcină** — `docker stats` reflectă o platformă fără trafic real (api 49,54 MiB, worker 38,61 MiB, postgres 1,411 GiB). **Aceste valori nu descriu comportamentul la sarcină.**
11. **Nicio măsurătoare a impactului unui deploy asupra joburilor în lucru** — comportamentul e dedus din configurarea BullMQ (`lockDuration` 120 s, chei în Redis), nu observat pe un restart cu job activ.
12. **Nu s-a măsurat impactul limitării rate asupra utilizatorului real** — pragul de 120/min pe `catalog/quote` a fost atins artificial; distribuția reală a traficului pe acest endpoint nu este cunoscută.

---

## 5. Blocaje de performanță pentru un GO comercial

1. **Payloadul necomprimat.** Fiecare încărcare de pagină transferă 452–558 KB, din care 352–426 KB sunt JavaScript brut, pentru un bundle principal care ar fi 93,1 KB gzip. Pentru un client pe mobil, acesta este cel mai mare cost măsurabil și **nu necesită nicio decizie de infrastructură** — se rezolvă în cod (`web/server.mjs`).
2. **Landing-ul face 6 interogări identice pentru același catalog** — de 6 ori pe fiecare vizită, pe cea mai vizitată pagină a site-ului. Remediere de 4 componente, câștig imediat.
3. **Interogările listei admin se degradează liniar cu volumul** (×3,1 până la ×5,8 între baza de test și o bază de 5 000 de clienți / 50 000 de intrări în jurnal), din cauza indicilor lipsă și a sub-interogătorului executat per rand în `admin.customers` (200 de sub-interogatoare la 200 de clienți). La 10 000 de clienți, acest panou devine inutilizabil.
4. **Calculul de preț face 2 interogări per element** — p50 de la 17 ms (1 produs) la 35 ms (8 produse); același cod rulează la crearea comenzii.
5. **`/api/status` durează 4 secunde** și face 2+N apeluri seriale spre panou, fiecare cu timeout de 20 s. Pe pagina publică de stare, un panou lent alungește răspunsul spre **zecile de secunde**.
6. **Nicio observabilitate a interogărilor lente** (`log_min_duration_statement = -1`) — fără ea, nicio optimizare viitoare nu poate fi justificată cu date, iar o regresie rămâne nedetectată.
7. **Nicio limită de resurse pe containere, fără swap** — o singură scurgere de memorie într-un container poate opri Postgres și, odată cu el, toată platforma.
8. **Oprirea la deploy nu garantează finalizarea cererilor** (`StopTimeout` implicit 10 s) — o cerere lentă e întreruptă cu `SIGKILL` în fereastra de deploy.
9. **Coada de provisionare are concurență 2**: un panou indisponibil produce ≈ **75 s de rețries pe job**, iar o instalare care nu se termină ocupă slotul de worker **15 minute** (plafon de 8 joburi pe oră). O incidentă scurtă la panou se transformă într-o coadă blocată de ordinul minutelor.
10. **Nu există un plafon de capacitate măsurat.** Nimeni nu poate răspunde astăzi la întrebarea „câte comenzi simultane susține platforma?". Fără un test de încărcare autorizat, această întrebare rămâne deschisă — **și este o întrebare de risc comercial**, nu doar de inginerie.

---

*Toate cifrele din acest raport provin din comenzi executate în timpul acestei sesiuni; ieșirile brute sunt în `/root/blipmade-work/audit/post-remediation/_raw/`: `perf11-bundle.txt`, `perf11-routes.txt`, `perf11-api.txt`, `perf11-api2.txt`, `perf11-buf.txt`, `perf11-db.txt`, `perf11-populated.txt`, `perf11-populated2.txt`, `perf11-reliability.txt`, `perf11-extra.txt`, alături de `perf-baseline.txt` (baseline-ul preexistent) și `README.md` (convențiile de unități).*
