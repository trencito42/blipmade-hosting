# 10 — SEO

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nu s-a făcut nicio scriere în DB, nicio modificare de config, nicio campanie.
**Metodă:** inspecție de cod în oglindă (`/root/blipmade-work/web`) + sondaje read-only pe producție (`curl` pe `https://blipmade.com`) + o sondă de browser pe Chromium, pe VM 103, **fără autentificare** (prin urmare fără a atinge limita de 10 logări / 15 min).
**Clase de verificare:** cele din `00-BRIEFING.md` §0.

> **Regula de citire a acestui raport:** tot ce urmează despre „cum arată pagina" este **măsurat pe site-ul public**, nu dedus. Cifrele de performanță sunt **observații de laborator** (agentul host, Chromium, viewport 1280×900, rețea către Cloudflare) și **nu** sunt valori de câmp pentru utilizatori reali — sunt etichete `VERIFIED` ca măsurare, dar `INFERRED` ca extrapolare la trafic real.

---

## 1. Rezumat — verdict tehnic SEO

| # | finding | severitate | clasă | dovadă |
|---|---|---|---|---|
| **SEO-01** | **Nu există niciun conținut în HTML.** Documentul servit are **850 octeți** (401 comprimat) și conține doar `<div id="root">` + 3 linkuri de asset. Orice crawler care nu execută JavaScript nu vede **niciun cuvânt** | 🔴 critic | `VERIFIED` | `curl -s https://blipmade.com/ \| wc -c` → **850**; `web/dist/index.html` |
| **SEO-02** | **Un singur `<title>` și un singur `<meta description>` pentru toate rutele** — identice pe `/`, `/apps`, `/apps/discord-bot`, `/docs`, `/status`, `/login` | 🔴 critic | `VERIFIED` | sondă de browser: `document.title` = „Blipmade — Pick an app. Deploy it." pe toate cele 6 rute |
| **SEO-03** | **Nu există `sitemap.xml`** — nici generator în cod, nici fișier static | 🔴 critic | `VERIFIED` | `grep -rn "sitemap" web/ api/ →` zero rezultate; `GET /sitemap.xml` → **HTTP 404** |
| **SEO-04** | **Nu există `robots.txt` al aplicației.** Singurul `robots.txt` răspuns este **generat de Cloudflare** | 🟠 mare | `VERIFIED` | `grep -rni "robots" web/ api/ →` zero rezultate; `GET /robots.txt` → 200, 2676 B, conține „BEGIN Cloudflare Managed Content" |
| **SEO-05** | **Nicio `link rel="canonical"`** pe nicio rută | 🔴 critic | `VERIFIED` | sondă: `document.querySelector('link[rel=canonical]')` → `null` pe toate rutele |
| **SEO-06** | **Zero date structurate (JSON-LD).** Niciun `application/ld+json`, nicio referință la `schema.org` în cod | 🟠 mare | `VERIFIED` | sondă: `script[type="application/ld+json"]` → **0** pe toate rutele; `grep -rni "ld+json\|schema.org" web/src →` zero rezultate |
| **SEO-07** | **Nu există Open Graph sau Twitter Card** — deci nicio carte de partizajare pe rețele sociale | 🔴 critic pentru distribuție | `VERIFIED` | `index.html:4-9` conține doar `charset`, `viewport`, `description`, `theme-color`, `icon` |
| **SEO-08** | **Soft 404 pe orice rută inexistentă.** `/this-does-not-exist`, `/apps/nonexistent-product`, `/nonexistent-page` → toate **HTTP 200** cu shell-ul SPA | 🟠 mare | `VERIFIED` | 3 × `curl -o /dev/null -w "%{http_code}"` → `200`; cauza: `web/server.mjs:176-179` — dacă `extname(pathname)` e gol, se servește `index.html` |
| **SEO-09** | **`/apps` nu are niciun `<h1>`** — singura rută publică fără titlu de nivel 1 | 🟠 mare | `VERIFIED` | sondă: `/apps` → `h1: []`, `h2: ['Explore the catalog.']` |
| **SEO-10** | **Inexistența oricărui mecanism de a seta titlu per rută.** Câmpul `title` al rutelor există, dar e folosit **doar** în headerul panoului | 🟠 mare | `CODE-INSPECTED` | `web/src/routes.tsx:56` (`title: string`), consumat la `web/src/routes.tsx:256` (`title={route.title}`); `grep -rn "document.title" web/src →` **zero rezultate** |
| **SEO-11** | **Pagina de produs este subțire**: ~570 de caractere de conținut propriu (h1 = numele produsului, un singur h2 „Minimum resources") | 🟡 mediu | `VERIFIED` | sondă: `/apps/discord-bot` → `bodyLen: 774` (din care navigația ≈200), `h2: ['Minimum resources']`, `h3: []` |
| **SEO-12** | **404 pe fonturi la fiecare încărcare de pagină** — 3 cereri eșuate pe `/`, 2 pe celelalte rute, cu erori în consolă | 🟡 mediu | `VERIFIED` | sondă: `failedReqs: ['…/fonts/proxima-nova-700.woff2 :: net::ERR_ABORTED', …600…', …400…']` |
| **SEO-13** | **Niciun header de securitate HTTP** pe origin: fără HSTS, fără CSP, fără `Referrer-Policy`, fără `X-Frame-Options` | 🟡 mediu | `VERIFIED` | `curl -sI https://blipmade.com/ \| grep -i "strict\|content-security\|x-frame\|referrer"` → **gol**; confirmat de `audit/03-network-and-ip-plan.md` („Nu există directive de limitare") |
| **SEO-14** | **Nicio variantă RO.** `lang="en"` unic, zero `hreflang`, zero infrastructură i18n | 🟡 mediu | `CODE-INSPECTED` + `VERIFIED` | `web/index.html:2` (`<html lang="en">`); `grep -rn "hreflang\|i18n\|useTranslation" web/src →` zero rezultate; sondă: `lang: "en"` pe toate rutele |
| **SEO-15** | **Niciun PWA / icon set**: `favicon.ico` 404, `apple-touch-icon.png` 404, `site.webmanifest` 404, `manifest.json` 404 | 🟢 mic | `VERIFIED` | 4 × `curl -o /dev/null -w "%{http_code}"` → toate **404**; singurul icon e `/favicon.svg` (`200`) |

---

## 2. Cum este livrat site-ul — cauza rădăcină a șase dintre cele cincisprezece finding-uri

```
web/server.mjs  ──serve──▶  dist/index.html   (850 octeți, shell gol)
                              │
                              ├─ /assets/index-*.js   318 678 B necomprimat / 97 464 B transfer
                              ├─ /assets/index-*.css   64 741 B
                              └─ 36 de chunk-uri lazy (rute)
```

| proprietate | valoare | clasă | dovadă |
|---|---|---|---|
| Tip de aplicație | SPA React 19 + Vite 8, router propriu în `web/src/router.tsx` | `CODE-INSPECTED` | `web/package.json` |
| Server-side rendering | **nu există** | `CODE-INSPECTED` | `web/vite.config.ts` — `defineConfig({ plugins: [react(), tailwindcss()] })`, fără plugin SSR; `web/package.json` — scriptul `build` este `tsc --noEmit && vite build` |
| Pre-render / SSG | **nu există** | `CODE-INSPECTED` | idem |
| HTML servit | **850 octeți**; comprimat cu brotli, **401 octeți** | `VERIFIED` | `curl -s https://blipmade.com/ \| wc -c` → 850; `curl -H "Accept-Encoding: br,gzip" -o /dev/null -w "%{size_download}"` → 401 |
| Cache-control pe HTML | `no-cache` | `VERIFIED` | `curl -sI https://blipmade.com/` |
| Cache-control pe `/assets/` | `public, max-age=31536000, immutable` | `CODE-INSPECTED` | `web/server.mjs:196` |
| JS care trebuie descărcat și executat înainte de orice text | **~97 KB** (chunk principal) | `VERIFIED` | `curl -H "Accept-Encoding: br,gzip" -o /dev/null -w "%{size_download}" https://blipmade.com/assets/index-ac3Dw9mq.js` → 97 464 |

**Consecința de indexare, spusă fără nuanțe:** un crawler care execută JavaScript (Googlebot, în general) vede conținutul. Un crawler care nu îl execută — și unele agregatoare, și orice cititor care descarcă pagina ca text — nu vede **nimic**. Pe lângă aceea, Google a folosit anterior „dynamic rendering" ca semnal negativ; un site care *depinde* de JS pentru tot conținutul este o poziție de vulnerabilitate, nu o poziție optimă.

---

## 3. Titluri, descrieri, canonical

### 3.1 Ce există azi

`web/index.html:4-9` este **singurul** loc unde se definește metadate:

```html
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>Blipmade — Pick an app. Deploy it.</title>
<meta name="description" content="Your favorite apps and databases, ready to run. No VPS setup, no complicated infrastructure. Start small and scale as you grow." />
<meta name="theme-color" content="#090A09" />
<link rel="icon" href="/favicon.svg" />
```

**Măsurat, pe 6 rute publice** (`/`, `/apps`, `/apps/discord-bot`, `/docs`, `/status`, `/login`):

| rută | `document.title` | `canonical` | JSON-LD | OG/Twitter | `lang` |
|---|---|---|---|---|---|
| `/` | Blipmade — Pick an app. Deploy it. | `null` | 0 | absent | `en` |
| `/apps` | *același* | `null` | 0 | absent | `en` |
| `/apps/discord-bot` | *același* | `null` | 0 | absent | `en` |
| `/docs` | *același* | `null` | 0 | absent | `en` |
| `/status` | *același* | `null` | 0 | absent | `en` |
| `/login` | *același* | `null` | 0 | absent | `en` |

`VERIFIED` — sondă de browser, Chromium pe VM 103, 2026-10-23.

### 3.2 De ce nu există titlu per rută

Există deja un câmp `title` în definiția de rute — **deci fixul e de o zi, nu de o arhitectură**:

```ts
// web/src/routes.tsx:56
interface RouteDef { pattern: string; component: ComponentType; title: string; … }
// web/src/routes.tsx:86-120
{ pattern: '/docs',   component: Docs,       title: 'Documentation' },
{ pattern: '/apps',   component: CatalogIndex, title: 'Catalog' },
{ pattern: '/apps/:slug', component: ProductPage, title: 'Product' },
// web/src/routes.tsx:256 — singurul consumator:
<title={route.title} … />
```

`grep -rn "document.title" web/src` → **zero rezultate**: câmpul e randat în headerul vizual al aplicației, nu în `<head>`. `CODE-INSPECTED`

### 3.3 Canonical

Nu există niciun `rel="canonical"` în cod și niciunul în DOM la runtime. Într-un SPA cu rute de forma `/apps/:slug`, absența canonicalului e o problemă *dublă*: crawlerul vede aceeași descriere pentru 5 URL-uri diferite și nu are niciun semnal despre care e varianta „adevărată". `VERIFIED` + `CODE-INSPECTED`

---

## 4. `robots.txt` și `sitemap.xml`

### 4.1 `robots.txt`

| constatare | clasă | dovadă |
|---|---|---|
| Aplicația **nu are** `robots.txt` și nu are generator | `CODE-INSPECTED` | `grep -rni "robots" web/ api/ scripts/ →` **zero rezultate** |
| `web/server.mjs` servește `index.html` pentru orice rută **fără extensie**, deci un `robots.txt` pus în `dist/` ar fi servit corect | `CODE-INSPECTED` | `web/server.mjs:176-179` |
| Singurul `robots.txt` public este **generat și controlat de Cloudflare** | `VERIFIED` | `GET https://blipmade.com/robots.txt` → 200, 2676 B, conține „# BEGIN Cloudflare Managed Content" / „# END Cloudflare Managed Content" |
| Cloudflare **permite** motoarele de căutare obișnuite | `VERIFIED` | în fișier: `User-agent: *` → `Content-Signal: search=yes,ai-train=no,use=reference` → `Allow: /` |
| Cloudflare **blochează** crawler-urile de antrenare AI | `VERIFIED` | `Disallow: /` pentru `Amazonbot`, `Applebot-Extended`, `Bytespider`, `CCBot`, `ClaudeBot`, `Diffbot`, `Google-Extended`, `GPTBot`, `omgili` și ~20 altele |

**Consecință operațională:** operatorul **nu deține** acest fișier din cod. Orice decizie despre directive trebuie luată în interfața Cloudflare, iar orice `robots.txt` pus în `dist/` **nu ar ajunge la crawlere**, fiind interceptat de Cloudflare. `CODE-INSPECTED` + `VERIFIED`

### 4.2 `sitemap.xml`

| constatare | clasă | dovadă |
|---|---|---|
| Nu există generator în cod | `CODE-INSPECTED` | `grep -rn "sitemap" web/ api/ scripts/ →` **zero rezultate** |
| Nu există fișier static | `VERIFIED` | `GET /sitemap.xml` → **HTTP 404**; `GET /sitemap_index.xml` → **HTTP 404** |
| Mecanismul serverului ar **refuza** orice `sitemap.xml` pus în `dist/` | `CODE-INSPECTED` | `web/server.mjs:177-179` — `if (extname(pathname)) return send(res, 404, 'Not found')`: orice cale cu extensie, dacă nu există pe disc, e 404; un fișier real s-ar servi, dar **nu există generator** care să-l mențină la zi |

**Verdict:** fără `sitemap.xml`, crawlerul trebuie să descopere singur URL-urile prin link-uri din pagină randate. În acest site, **singurele link-uri din pagină sunt butoane fără `href`** (navigația folosește `scrollToId(...)`, `web/src/home/Rest.tsx:57`, `web/src/home/Rest.tsx`), cu excepția a **4** link-uri reale: `/docs`, `/status`, `/login` și `/app`. `CODE-INSPECTED` — **URL-urile `/apps/:slug` nu sunt legate din nicio pagină** și nici nu apar în vreun sitemap: există, dar sunt nedescoperite.

---

## 5. Date structurate

Zero. Niciun `application/ld+json` în DOM pe niciuna dintre cele 6 rute măsurate, nicio referință la `schema.org` în cod. `VERIFIED`

Ce **ar** fi corect pentru acest produs, dacă datele ar fi adevărate:

| tip | de ce contează | blocat de |
|---|---|---|
| `SoftwareApplication` / `Product` (cu `offers`) | prețul e real, calculat server-side; `price` și `priceCurrency` pot fi emise din API | prețul trebuie mai întâi **ridicat** la €9.99 (`audit/09-pricing-recommendations.md` §2.2) — altfel schema ar declara un preț sub pragul de cost |
| `FAQPage` | secțiunea FAQ există și e bine scrisă (`web/src/home/Rest.tsx:33-42`, `web/src/data.ts:35-41`) | `FAQPage` a fost restrictionat de Google (2023) la situri de autoritate recunoscută — se aplică unui brand nou cu **zero** recenzii și **zero** utilizatori, deci câștigul e mic |
| `BreadcrumbList` | doar dacă există o ierarhie de pagini; azi rutele sunt plate | nu se aplică acum |
| `Organization` | doar cu date reale (adresă, contact) — **`@` real** și **formular de contact** | nu există pagină de contact/terms/privacy |

> **Blocaj de conformitate, nu de SEO:** `docs/BLIPMADE_DESIGN_PROMPT.md` cere „Zero fake success. … Never show live-looking numbers, stock counters or 'success' that no backend produced." Orice JSON-LD cu `aggregateRating` sau `review` ar încălca această regulă **și** ar fi fals. `aggregateRating` **nu** trebuie publicat niciodată cât timp nu există recenzii reale.

---

## 6. Structura heading-urilor

| rută | h1 | h2 | h3 | observație |
|---|---|---|---|---|
| `/` | „Pick an app. Deploy it." | 6 | — | corect: un h1, 6 secțiuni de nivel 2 |
| `/apps` | **[]** | „Explore the catalog." | — | 🔴 fără h1 pe o pagină comercială |
| `/apps/discord-bot` | „Discord Bot" | „Minimum resources" | — | subțire; conținut propriu ≈570 caractere |
| `/docs` | „WordPress" | 6 („What you get", „First run", „Environment variables", „Backups", „Upgrading", „Troubleshooting") | — | h1-ul este **titlul paginii de documentație selectate**, nu un h1 al paginii `/docs` |
| `/status` | „Service status" | — | — | corect |
| `/login` | „Welcomeback." | „Pick an app. Deploy it." | — | 🔴 **defect de copy**: „Welcomeback." — lipsește spațiul |

Toate valorile sunt din sondă: `VERIFIED`, 2026-10-23.

**Două observații care contează pentru SEO, dincolo de numărul de heading-uri:**

1. **`/docs` are h1 = „WordPress"** — adică pagina de documentație implicită deschisă este cea a unui produs **care nu poate fi comandat** (`deployable:false`, `audit/04-product-certification.md` §4.3). Navegația documentației listează **12 aplicații** (`WordPress, Ghost, Forgejo, Code Server, Uptime Kuma, Grafana, n8n, Discord Bot, PostgreSQL, MySQL, Redis, MongoDB` — `web/src/data.ts:19-30`), dintre care **7 nu există** în catalogul real (5 produse). `VERIFIED` (sondă: `bodyHead` al lui `/docs`) + `CODE-INSPECTED` (`web/src/data.ts:19-30`)
2. **h1-ul case-ului de pe mobil e ascuns.** Pe telefon, `<Headline as="h1" … className="… hidden … sm:block">` este `display:none`, iar textul vizibil vine dintr-un `<span className="sr-only sm:hidden">`. `CODE-INSPECTED` — `web/src/home/Hero.tsx:44-46`. Text ascuns prin CSS nu este text vizibil pentru motor; nu e „cheating" (textul e identic), dar nici nu ajută.

---

## 7. Core Web Vitals — ce s-a **măsurat**

Măsurătoare de laborator: Chromium pe VM 103, viewport 1280×900, `waitUntil: 'networkidle'`, 6 rute publice, **fără autentificare**. Valorile sunt **observații**, nu valori de câmp.

| rută | cereri | octeți transfer (sumă `content-length`) | `domContentLoaded` | `load` | first-paint | **FCP** | CLS observat |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 18 | 64 303 | 199 ms | 199 ms | 152 ms | **544 ms** | 0 |
| `/apps` | 14 | 57 961 | 250 ms | 255 ms | 168 ms | **572 ms** | 0 |
| `/apps/discord-bot` | 14 | 57 147 | 266 ms | 266 ms | 176 ms | **636 ms** | 0 |
| `/docs` | 14 | 56 049 | 373 ms | 374 ms | 220 ms | **848 ms** | 0 |
| `/status` | 13 | 57 206 | 238 ms | 239 ms | 176 ms | **432 ms** | 0 |
| `/login` | 14 | 58 183 | 323 ms | 324 ms | 164 ms | **832 ms** | 0 |

`VERIFIED` (măsurătoare) / `INFERRED` (extrapolare)

**Cum se citește:**

1. **CLS = 0 pe toate rutele.** `font-display: swap` (`web/src/index.css:20,27,34`) previne saltul de layout la încărcarea fontului. Acesta este un punct forte real și e dovedit.
2. **FCP e determinat de JavaScript, nu de HTML.** Pe toate rutele, FCP (432–848 ms) e **mai mare** decât `load` (199–374 ms): primul „first contentful paint" al consolei are loc **după** ce bundle-ul a fost descărcat, parsat și executat. Asta e consecța directă a SEO-01. `INFERRED` din `VERIFIED`
3. **FCP se degradează cu volumul bundle-ului lazy.** `/docs` (848 ms) și `/login` (832 ms) sunt cele mai lente; `/status` (432 ms) și `/` (544 ms) cele mai rapide. `/docs` încarcă chunk-ul `Docs` de **79 113 B** (`web/dist/assets/Docs-B7RlpAR7.js`), cel mai mare chunk de rută (`00-current-state.md` §3.10). `VERIFIED`
4. **INP nu a fost măsurat** — `INFERRED` din măsurătorile de interacție ale echipei (553 de verificări de browser verzi, `audit/07-release-gates.md` §4.2), dar **nicio** măsurătoare de latență de intrare nu există în acest audit. De aceea: **INP: `UNVERIFIED`**.
5. **LCP nu a fost măsurat** — instrumentul folosit nu a înregistrat `PerformanceObserver` LCP. **LCP: `UNVERIFIED`**, deși ordinea măsurătorilor (FP → FCP după JS) sugerează că LCP e după FCP. Nu afirm un număr.

**Ce e nevoie pentru un verdict CWV real:** un script de `PerformanceObserver` pentru LCP și INP, rulat de pe cel puțin 3 locații, pe o perioadă de 28 de zile, cu domeniul verificat în Search Console. Niciuna dintre aceste trei condiții este îndeplinită azi (vezi §11).

---

## 8. Alte verificări tehnice

| item | rezultat | clasă |
|---|---|---|
| Erori de consolă recurente | **3 cereri 404** pentru fonturile `proxima-nova-400/600/700.woff2` pe `/`; **2** pe celelalte rute (`net::ERR_ABORTED`) | `VERIFIED` (sondă) + `CODE-INSPECTED` (`web/src/index.css:15-35` definește fonturile absente; `web/server.mjs` le servește din `dist/fonts/`, unde nu există — consistent cu `00-BRIEFING.md` §5.3) |
| HSTS | absent | `VERIFIED` (`curl -sI`) |
| `Content-Security-Policy` | absent | `VERIFIED` |
| `Referrer-Policy` | absent | `VERIFIED` |
| `X-Frame-Options` / `frame-ancestors` | absent | `VERIFIED` |
| `X-Content-Type-Options: nosniff` | prezent | `VERIFIED` (`web/server.mjs:197`) |
| Cache-control pe HTML | `no-cache` | `VERIFIED` |
| Cache-control pe `/assets/` | `public, max-age=31536000, immutable` | `CODE-INSPECTED` (`web/server.mjs:196`) |
| Conținut raster (imagini) | **zero** — doar 3 `<img>` (logo-ul, `alt=""`) și SVG inline | `CODE-INSPECTED` |
| `alt` pe imagini | `alt=""` pe logo (corect: decorativ) | `CODE-INSPECTED` (`web/src/ui.tsx:76`, `web/src/ui-app.tsx:199,242`) |
| Fișiere de tip "Open Graph image" | **inexistent** | `VERIFIED` (nu există PNG/JPG în `web/`) |
| `manifest.webmanifest` / `apple-touch-icon.png` / `favicon.ico` | toate **404** | `VERIFIED` |
| Validare `lang` | `lang="en"`, corect pentru conținutul în engleză | `VERIFIED` |

---

## 9. Indexabilitate: ce ar putea fi indexat azi

| rută | indexabilă în principiu | indexabilă **efectiv** azi | de ce |
|---|---|---|---|
| `/` | da | **parțial** — shell gol, conținut doar după JS | SEO-01, SEO-02 |
| `/apps` | da | **nu** — fără h1, titlu duplicat cu `/`, 5 carduri de produs | SEO-02, SEO-09 |
| `/apps/:slug` | da (5 URL-uri) | **nu** — conținut subțire (≈570 caractere), titlu duplicat, fără canonical, **fără linkuri de intrare din pagină** | SEO-02, SEO-05, SEO-11, §4.2 |
| `/docs` | da | **parțial** — 12 subiecte documentate, 7 despre produse inexistente | SEO-02, §6 |
| `/status` | da (mică valoare) | da | SEO-02 |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | **nu** — pagini de autentificare | **nu se exclude în mod explicit**; nicio directivă `noindex` | SEO-04: `robots.txt` e generat de Cloudflare și nu conține `Disallow` pentru `User-agent: *` |
| `/app/**`, `/admin/**` | **nu** | **risc real**: shell-ul e același, deci un crawler care execută JS ajunge la gardul de sesiune; nu poate fi enumerat, dar nici nu e exclus | `web/src/routes.tsx` (`area: 'customer' \| 'admin'`, `auth-guard.ts`) |
| orice URL inexistent | **nu** | **da, ca 200** → soft 404: URL-uri infinite, indexate ca duplicate | SEO-08 |

---

## 10. Arhitectura de cuvinte-cheie

### 10.1 Regula, înainte de orice listă

> **Nu public niciun volum de căutare.** Nu există niciun export Search Console, nicio proprietate Search Console, niciun Keyword Planner, niciun instrument de volum în repository. Un volum scris aici ar fi inventat. În schimb, fiecare cluster primește **o prioritate relativă, derivată din faptele despre produs și din SERP-ul documentat**, nu din cerere: *cât de aproape e cuvântul de o achiziție reală, și poate platforma onora o comandă venită din el azi?*
>
> **Actualizare, cu dată:** `audit/08-competitive-analysis.md` a apărut ulterior în aceeași sesiune și documentează **SERP-ul** concurenților din segmentul de jocuri — cei care apar pe pagina de rezultate pentru interogările de Minecraft hosting în România. Îl folosesc în §10.5 și §10.6. Clasa lui pentru mine: `DOCUMENTED-ONLY` (citit de un agent sibling pe surse live, 2026-10-23).

### 10.2 Arborele de clusteruri

```
ROOT:   [subject] hosting  /  managed  /  self-hosted
        ├── C1  Discord bot hosting        ← singurul produs vândabil
        ├── C2  Node.js / bot hosting      ← același produs, alt unghi
        ├── C3  App & database hosting     ← 4 produse, toate necomandabile
        ├── C4  Game server hosting        ← niciun produs + porturi nepublicate
        └── C5  Brand + alternative-to-VPS ← fără concurent identificabil
```

### 10.3 Clusterul C1 — „Discord bot hosting" · **prioritate 1**

| element | conținut |
|---|---|
| **Intenție** | comercială, cu conținut: „găzduiesc un bot Discord permanent, fără PC-ul meu" |
| **De ce e clusterul 1** | este **singurul produs cu `deployable: true`** (`VERIFIED`, catalog live) și singurul cu egg real, cu provisionare dovedită (`audit/04-product-certification.md` §3.1) |
| **URL-uri țintă** | `/apps/discord-bot` (există), plus pagini noi: `/guides/discord-bot-hosting`, `/guides/discord-bot-nodejs`, `/guides/discord-bot-python` |
| **Termeni de acoperire** | „discord bot hosting", „host a discord bot", „discord bot server", „run discord bot 24/7", „discord bot vps", „discord bot node.js hosting", „discord bot python hosting" |
| **Starea actuală a indexabilității** | **nu indexabilă efectiv**: titlu duplicat, fără canonical, fără JSON-LD, ≈570 caractere de conținut, fără link de intrare din pagină |
| **Blocaj de business** | **plățile oprite** (`503 payments_unavailable`) — un vizitator din acest cluster **nu poate cumpăra**. Deci: **conținutul se poate publica acum, campania de conversie nu** |
| **Volum** | **`UNVERIFIED`** — nu există sursă. Metoda de obținere: §10.7 |

### 10.4 Clusterul C2 — „Node.js / bot hosting" · **prioritate 2**

| element | conținut |
|---|---|
| **Intenție** | comercială, mai largă: „găzduiesc o aplicație Node.js / Python" |
| **De ce e 2** | e **aceeași marfă de produs** (`discord-bot`, egg 15 „node.js generic"), dar cu cerere mai puțin specifică și, probabil, mai competitivă — deci prioritate inferioară |
| **URL-uri țintă** | `/guides/nodejs-app-hosting`, `/guides/run-nodejs-server` |
| **Blocaj** | același: plățile |
| **Risc de onestitate** | „Node.js hosting" trebuie să acopere **doar** ce se poate furniza: container, fișiere, loguri, upgrade de resurse. Nu „orice aplicație Node.js" — provisionarea are **24% eșec** (`audit/07-release-gates.md` poarta 5) |

### 10.5 Clusterul C3 — „app & database hosting" · **prioritate 3, blocată**

| element | conținut |
|---|---|
| **Termeni** | „wordpress managed hosting", „uptime kuma hosting", „postgresql managed hosting", „code server hosting" |
| **De ce e blocată** | toate cele 4 produse sunt `deployable:false`; comanda e respinsă server-side cu 400 (`VERIFIED`). Conținut pe aceste subiecte ar **atrage cerere pe care platforma nu o poate onora** |
| **Condiția de deblocare** | certificat un produs end-to-end (`audit/04-product-certification.md` §4.4: o comandă reală plătită, un container pornit și verificat, un restart, o degradare și o îmbunțătăre) |
| **Observație de arbitraj** | C3 e clusterul cu cea mai mare cerere *probabilă* și cu cea mai mare valoare per client (Preț recomandat de la €9.99, până la €14.17 la configurația maximă, `audit/09-pricing-recommendations.md` §2.3) — dar conținutul fără produs este o **capcană de reputație**, nu o oportunitate |

### 10.6 Clusterul C4 — „game server hosting" · **prioritate 4, blocată de două ori**

| element | conținut |
|---|---|
| **Termeni** | „minecraft server hosting", „cs2 server hosting", „rust server hosting", „teamspeak server hosting" |
| **De ce e cea mai mare eroare posibilă** | panoul chiar are egg-urile (Minecraft, CS:GO, Rust, Mumble, TeamSpeak — `00-BRIEFING.md` §12.1), deci **totul sugerează că se poate**. Dar: (1) niciun produs de joc în catalog (`08-product-portfolio.md` §10: E1/E2 sunt `LAUNCH-AFTER-FIX`); (2) **nu există backup**, iar produsele de joc sunt stateful — o lume pierdută înseamnă un client pierdut (`08-product-portfolio.md` §7); (3) **nu există DDoS**, deși toți cei trei concurenți RO îl includ la prețul de intrare (`08-competitive-analysis.md` §6.2) |
| **SERP-ul este deja ocupat, documentat** | pe interogările de Minecraft hosting în RO apar **Aternos (gratuit, cu DDoS și backup)**, **OVINETWORK €3.99**, **Zentaris €4.49** și **Torchbyte €4.74**; trei dintre patru au și **backup** și **anti-DDoS** la prețul de intrare (`08-competitive-analysis.md` §2–§3, `DOCUMENTED-ONLY`). ⇒ **nu se poate câștiga acest cluster pe preț, iar pe backup și DDoS Blipmade e în deficit** |
| **Corectură de fapt, verificată în cod** | afirmația „25565 nu e publicat, deci serverul ar fi inaccesibil" e **prea largă**: `api/src/services/provisioning.ts:218` face `free.find((a) => a.port >= 30000)`, adică preferă **deja** o alocare din blocul publicat `30000:39999`. Un server Minecraft ar fi **accesibil**, pe `node1.blipmade.com:30012` — port **neobișnuit**, nu absent (`08-product-portfolio.md` §6.3). `VERIFIED` |
| **Regula** | conținut pe acest cluster **nu se publică** până la repararea DNAT-ului + crearea produsului + certificarea lui |

### 10.7 Clusterul C5 — brand + „alternative to VPS" · **prioritate 5, dar cel mai ieftin de produs**

| element | conținut |
|---|---|
| **Termeni** | „blipmade", „blipmade hosting", „app hosting without vps", „managed app hosting", „host an app without a server" |
| **De ce contează** | e singurul cluster pe care platforma îl poate câștiga **fără concurență identificabilă** — dar nu îl poate câștiga pe volum |
| **Realitate concurențială** | în segmentul de jocuri, concurenții **există și sunt documentați** (Aternos €0, OVINETWORK €3.99, Zentaris €4.49, Torchbyte €4.74 — `DOCUMENTED-ONLY`, `08-competitive-analysis.md` §2–§3); în segmentul de **hosting de aplicații** pe care îl ocupă azi `discord-bot`, **nu există concurenți identificați** în acest audit (`grep` pe tot repo-ul → zero rezultate; niciun volum, nicio cotă) |

### 10.8 Cum se obțin volumele — metoda, nu numărul

| sursă | pas | cost | de ce nu e deja făcut |
|---|---|---|---|
| **Search Console** | proprietate pe `blipmade.com`, apoi „Performance" → interogări reale, pe 28 de zile | 0 | nu există proprietate; **site-ul are 0 vizitatori organici măsurabili azi** (niciun tracking, `10-growth-metrics.md` §2) |
| **Keyword Planner / autocomplete** | lista de seed-uri din C1–C5 → intervale de volum | 0 | necesită un cont Google Ads; **nu a fost creat niciun cont în acest audit** |
| **Serp API / tool extern** | export pe seed-uri | abonament | nu există cheie API în mediu |
| **PRESTARE manuală** | `grep` pe `AuditLog` + `Ticket` pentru limbajul real al clienților | 0 | se poate face azi: există 12 tichete și 528 rânduri de audit log — **utilizatori reali, dar 6 în total**, prea puțin pentru a extrage limbaj de căutare |

> **Concluție pe volum:** până când una dintre primele două surse e disponibilă, orice număr de volum într-un plan de marketing este o invenție. Planul de mai jos folosește **prioritate relativă** și **cost de efort**, ambele derivabile din repo.

### 10.9 Ordinea recomandată a conținutului

| # | acțiune | efort | blocaj de business | efect |
|---|---|---|---|---|
| 1 | Titlu + descriere per rută, `document.title` din `RouteDef.title` | **mic** | niciunul | deblokează 6 rute dintr-o dată |
| 2 | `robots.txt` cu `Sitemap:` + `sitemap.xml` generat din catalogul API | **mic** | niciunul | deblokează descoperirea `/apps/:slug` |
| 3 | `canonical` pe toate rutele | **mic** | niciunul | rezolvă duplicatele |
| 4 | Legături `<a href>` de la `/apps` la fiecare `/apps/:slug` | **mic** | niciunul | face descoperibile cele 5 URL-uri |
| 5 | OG + Twitter Card + `og:image` | **mediu** | niciunul | deblokează partizarea pe rețele |
| 6 | JSON-LD `Product` + `offers` pe `/apps/:slug` | **mediu** | **prețul** — nu se emite `price` sub pragul de cost | îmbunătățește rich results |
| 7 | Extinderea paginii de produs cu conținut real | **mediu** | **certificarea produsului** | face pagina indexabilă (≈570 → 1500+ caractere) |
| 8 | Ghiduri C1 (`/guides/discord-bot-hosting`) | **mare** | **conținut, nu vânzare** | singurul cluster cu cerere *și* produs |
| 9 | Pre-render / SSG sau SSR | **mare** | niciunul | rezolvă SEO-01 de la rădăcină |
| 10 | Versiune RO (`/ro/*`) cu `hreflang` | **mare** | **certificarea produsului** | dublează suprafața indexabilă |
| 11 | Clusterul C3 (WordPress/DB) | **mare** | **certificarea produselor** | cerere mare, onorabilă doar după certificare |
| 12 | Clusterul C4 (jocuri) | **mare** | **DNAT + produse + certificare** | cel mai mare volum, cel mai mare risc |

> **Observație de ordine, importantă:** pașii 1–6 și 9 nu au niciun blocaj de business. Pașii 7, 8, 10, 11, 12 sunt blocați de certificarea produsului sau de reparația rețelei. **Deci SEO-ul de fundație (titluri, sitemap, canonical, OG, JSON-LD) se poate construi acum, în paralel cu repararea plăților, fără niciun risc comercial.**

---

## 11. Ce trebuie instrumentat înainte de a măsura ceva

| instrument | de ce | unde intră | efort |
|---|---|---|---|
| **Search Console** | singura sursă de volum, de clicuri și de interogări reale | cont Google, proprietate pe `blipmade.com` + verificare DNS | mic |
| **„Performance" Search Console** (Core Web Vitals) | verdictul real LCP/INP/CLS pe trafic real | automat după ce există suficient trafic | 0 după pasul 1 |
| **`PerformanceObserver` pentru LCP și INP** | măsurătoarea de laborator de mai sus nu a prins LCP/INP | script în `scripts/ops/`, rulat periodic | mic |
| **Sitemap generat** | „URLs submitted vs indexed" | cod nou | mic |
| **Analiză de loguri Caddy** (VM 102) | singurul proxy de cereri care există azi; dă 404-uri reale, inclusiv soft-404-urile | `journalctl -u caddy` | 0 |
| **Nicio soluție de analytics cu cookie** | **nu se recomandă înainte de poartă**: implică GDPR, consimțământ, politica de confidențialitate și un banner — toate **absente** astăzi, iar conformitatea trebuie confirmată de un profesionist | — | — |

---

## 12. Limite și ce nu am putut verifica

| item | status | motiv | pasul sigur de deblocare |
|---|---|---|---|
| LCP | `UNVERIFIED` | instrumentul folosit nu a înregistrat LCP | re-rularea sondei cu `PerformanceObserver` de tip `largest-contentful-paint` |
| INP | `UNVERIFIED` | nicio măsurătoare de latență de interacție | `PerformanceObserver` de tip `event` + `first-input`, pe fluxuri reale |
| CLS pe trafic real | `UNVERIFIED` | măsurat 0 doar de laborator | raportul Search Console |
| Comportamentul crawler-elor | `UNVERIFIED` | nu am rulat niciun crawler (ar fi cerut acces la servicii terțe) | `curl` cu un user-agent de bot + inspecția în Search Console după indexare |
| Indexarea reală în Google | `UNVERIFIED` | fără proprietate Search Console | crearea proprietății |
| Volum de căutare | `UNVERIFIED` | fără sursă | §10.8 |
| Concurență pe SERP în segmentul de jocuri | `DOCUMENTED-ONLY` | documentată în `audit/08-competitive-analysis.md` §2–§3 (4 concurenți, prețuri, ce includ) — **eu nu am re-citit paginile** | citirea proprie a paginilor concurenților, sau Search Console după indexare |
| Concurență pe SERP în segmentul de aplicații | `UNVERIFIED` | nu e documentată în niciun fișier | analiza de concurență pe acest segment |
| Conținutul real al paginilor după JS, pentru fiecare rută | parțial `VERIFIED` | am măsurat 6 rute publice; rutele `/app/**` și `/admin/**` cer autentificare și **nu au fost atinse** (limita de logări) | reutilizarea unei sesiuni unice, ca în `audit/07-release-gates.md` |

---

## 13. Rezumat

| întrebare | răspuns |
|---|---|
| **Este site-ul indexabil astăzi?** | **parțial.** Conținutul există doar după execuția JavaScript; HTML-ul servit are 850 de octeți și zero text (`VERIFIED`) |
| **Câți `title` diferiți există?** | **unul**, identic pe toate rutele (`VERIFIED`, măsurat pe 6 rute) |
| **Există `sitemap.xml`?** | **nu** — și nici generator în cod (`VERIFIED`) |
| **Există `robots.txt` al aplicației?** | **nu** — singurul fișier e generat de Cloudflare; `User-agent: *` e permis, crawler-urile AI sunt blocate (`VERIFIED`) |
| **Există date structurate?** | **nu** — zero JSON-LD pe toate rutele (`VERIFIED`) |
| **Există OG/Twitter Card?** | **nu** (`VERIFIED`) |
| **Există `canonical`?** | **nu** (`VERIFIED`) |
| **Structura heading-urilor e corectă?** | **parțial** — `/apps` n-are h1; `/login` are „Welcomeback."; `/docs` are h1 = „WordPress", un produs necomandabil (`VERIFIED`) |
| **Ce e măsurat bine?** | **CLS = 0** pe toate rutele (font-display swap) și **caching corect** pe `/assets/` (`VERIFIED`) |
| **Ce e cea mai mare problemă?** | **SEO-01**: zero conținut în HTML, cu **~97 KB** de JavaScript de descărcat înainte de primul cuvânt (`VERIFIED`) |
| **Ce e veșnicile și se poate reparat acum, fără blocaj de business?** | titluri per rută, sitemap, canonical, linkuri către `/apps/:slug`, OG, JSON-LD, `robots.txt` controlat, pre-render (`CODE-INSPECTED` + `VERIFIED`) |
| **Ce e blocat?** | conținutul pe C3 (WordPress/DB) și C4 (jocuri) — de certificarea produsului și de repararea DNAT-ului (`VERIFIED`) |

> **Notă de conformitate:** nu sunt publicate în acest raport cote de piață, volume de căutare, prețuri de concurență, recenzii sau cifre de concurență — niciuna nu există în sistem, iar fiecare ar fi o invenție. Nu este publicat niciun `aggregateRating` sau date structurate de review, pentru că nu există recenzii reale și ar încălca regula „Zero fake success" din `docs/BLIPMADE_DESIGN_PROMPT.md`.
