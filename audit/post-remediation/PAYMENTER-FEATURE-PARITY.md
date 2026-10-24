# Paritate funcțională — Blipmade vs. Paymenter

**Document:** analiză de paritate a funcțiilor dintre platforma Blipmade și Paymenter
(https://paymenter.org), în faza 8 a auditului post-remediere.
**Data cercetării:** 23 octombrie 2026.
**Autor:** agent de audit (rol `Worker`). Audit independent, fără modificări asupra codului sursă.
**Baza de comparație:** mirrorul local `/root/blipmade-work` (fără git) + rapoartele de audit din
`/root/blipmade-work/audit/post-remediation/`.
**Limba:** română tehnică; numele produselor, ale funcțiilor, citatele și URL-urile rămân în limba
originală.

---

## 1. Antet

### 1.1 Ce a fost cercetat

Compararea funcțională dintre:

- **Blipmade** — platformă de găzduire de servere de joc, self-hosted, construită pe Pterodactyl +
  Docker, vândută ca serviciu găzduit la `blipmade.com`, cu prețuri în EUR, stivă
  Node/Fastify + React/TypeScript, PostgreSQL și Redis, facturare prin Stripe.
- **Paymenter** — https://paymenter.org / https://github.com/Paymenter/Paymenter — platformă de
  facturare/hosting open-source, cu extensii de provisionare pentru Pterodactyl, Convoy, cPanel etc.

Cele două produse **nu sunt de același tip**, iar raportul tratează această diferență ca un
rezultat central, nu ca o notă de subsol: Paymenter este o *platformă de facturare cu extensii de
provisionare*, Blipmade este o *platformă de găzduire cu facturare integrată*. Fiecare domeniu
din tabele este însoțit de o notă despre **diferența arhitecturală** care explică de ce apare
diferența.

### 1.2 Surse folosite

Toate URL-urile de mai jos au fost **accesate efectiv** și au răspuns HTTP 200 în data menționată.
Pentru fiecare afirmație din document există o referință la URL-ul de unde a fost extrasă.

| # | Sursă | URL | Cum a fost folosită |
|---|---|---|---|
| S1 | Paymenter — site oficial (home) | https://paymenter.org/ | poziționare, natură open-source, licență MIT |
| S2 | Paymenter — sitemap (arborele complet al documentației și al marketplace-ului) | https://paymenter.org/sitemap.xml | inventarul paginilor: ghiduri, extensii, marketplace, note de lansare |
| S3 | Paymenter — Introduction | https://paymenter.org/docs/getting-started/introduction | ce este produsul, cerințe, natură |
| S4 | Paymenter — Products | https://paymenter.org/docs/guides/products/ | **stoc, limită per client, cantitate, tipuri de plan, interval de facturare, preț per monedă, taxă de setup, tabul de upgrade, legarea de o extensie de server** |
| S5 | Paymenter — Config Options | https://paymenter.org/docs/guides/products/config-options | opțiuni configurabile per produs |
| S6 | Paymenter — Servers | https://paymenter.org/docs/guides/servers/ | modelul de server provisionat |
| S7 | Paymenter — Tickets | https://paymenter.org/docs/guides/tickets/ | departamente, închidere de către client, **email piping (IMAP)** |
| S8 | Paymenter — Gateways | https://paymenter.org/docs/guides/gateways/ | lista de gateway-uri documentate |
| S9 | Paymenter — Stripe | https://paymenter.org/docs/extensions/stripe | instalarea gateway-ului Stripe |
| S10 | Paymenter — Pterodactyl | https://paymenter.org/docs/extensions/pterodactyl | extensia de provisionare Pterodactyl |
| S11 | Paymenter — Convoy | https://paymenter.org/docs/extensions/convoy | extensia de provisionare Convoy |
| S12 | Paymenter — cPanel | https://paymenter.org/docs/extensions/cpanel | extensia de provisionare cPanel |
| S13 | Paymenter — Enhance | https://paymenter.org/docs/extensions/enhance | extensia de provisionare Enhance |
| S14 | Paymenter — Single Sign On (OAuth) | https://paymenter.org/docs/guides/OAuth | login social (Discord, GitHub, Google) ca **client** |
| S15 | Paymenter — WHMCS Importer | https://paymenter.org/docs/guides/whmcs-importer | ce date se pot migrare; confirmare că importul e o funcție de primă clasă |
| S16 | Paymenter — Migrate | https://paymenter.org/docs/guides/migrate | procedura de migrare, backup al bazei de date |
| S17 | Paymenter — CLI | https://paymenter.org/docs/guides/cli | comenzile `app:*` (cron, extensii, temă, utilizator, setări, telemetrie) |
| S18 | Paymenter — FAQ | https://paymenter.org/docs/guides/FAQ | resetarea parolei, proxy, CAPTCHA, reverto la tema implicită |
| S19 | Paymenter — Installation | https://paymenter.org/docs/installation/install | cerințe (PHP 8.3, Composer, Nginx/Apache, MariaDB), cron, queue worker, mențiunea variantei găzduite `paas.paymenter.org` |
| S20 | Paymenter — Extensions (dezvoltare) | https://paymenter.org/development/extensions/ | cele trei tipuri de extensie (Gateways, Servers, Others), hookuri de lifecycle, configurare proprie |
| S21 | Paymenter — Extensions — Configuration | https://paymenter.org/development/extensions/configuration | schema de configurare a unei extensii |
| S22 | Paymenter — Event hooks | https://paymenter.org/development/event-list | evenimentele de model, hookurile `navigation.*`, `pages.home`, `head`/`body`/`footer` |
| S23 | Paymenter — OAuth (dezvoltare) | https://paymenter.org/development/OAuth | OAuth ca **furnizor** |
| S24 | Paymenter — Creating a Theme | https://paymenter.org/development/theme/ | structura unei teme, override-uri de view-uri de extensie, configurare de temă în admin |
| S25 | Paymenter — Releases v1.5 | https://paymenter.org/releases/v1.5-release | note de lansare |
| S26 | Paymenter — Marketplace | https://paymenter.org/marketplace/ | catalogul de extensii (nume, ca indice de existență) |
| S27 | Paymenter — Docs and Translations | https://paymenter.org/docs/contribute/docs-translations | procesul de traducere a documentației |
| S28 | Paymenter — GitHub README | https://raw.githubusercontent.com/Paymenter/Paymenter/main/README.md | descrierea oficială, cerințe, licență MIT |
| S29 | Paymenter — GitHub Releases | https://github.com/Paymenter/Paymenter/releases | istoricul de lansări |
| S30 | Paymenter — OpenAPI (spec) | https://paymenter.org/openapi.json | **11 tag-uri, 22 rute, 48 operații**, securitate `bearer` |
| S31 | Paymenter — API (pagina Scalar) | https://paymenter.org/api/ | confirmarea existenței API-ului public versionat |
| S32 | Paymenter — repo: metadate | `https://api.github.com/repos/Paymenter/Paymenter` | ramura implicită `master`, licență **MIT**, 2.784 stele, ultim push 2026-10-23 |
| S33 | Paymenter — repo: modele | `https://api.github.com/repos/Paymenter/Paymenter/contents/app/Models` | **54 modele** (`Coupon`, `TaxRate`, `Currency`, `Cart`, `Credit`, `Plan`, `Price`, `ConfigOption`, `ServiceCancellation`, `OauthClient`, `ApiKey`, `Notification*`…) |
| S34 | Paymenter — repo: arbore complet | `https://api.github.com/repos/Paymenter/Paymenter/git/trees/master?recursive=1` | 1.703 căi; `extensions/Others/{Affiliates,Announcements,DiscordNotifications}`; `extensions/Servers/*`; `extensions/Gateways/*`; `themes/`; `lang/`; 24 localizări |

### 1.3 Surse care nu au putut fi accesate

| Sursă | URL tentat | Rezultat |
|---|---|---|
| Paymenter — indexul documentației | `https://paymenter.org/docs/` | **HTTP 404**; arborele a fost obținut din `sitemap.xml` (S2) |
| Paymenter — „Extensions → Introduction" | `https://paymenter.org/docs/extensions/introduction` | **HTTP 404**; pagina reală e `/development/extensions/` (S20) |
| Paymenter — „Configuration" la nivel de `/docs/` | `https://paymenter.org/docs/configuration/` | **HTTP 404**; pagina reală e `/development/extensions/configuration` (S21) |
| Paymenter — „OAuth" la nivel de `/docs/` | `https://paymenter.org/docs/oauth/introduction` | **HTTP 404**; paginile reale sunt `/development/OAuth` (S23) și `/docs/guides/OAuth` (S14) |
| Paymenter — instalare Docker | `https://paymenter.org/docs/installation/docker` | **nu a fost accesată** — nu s-a folosit pentru nicio afirmație |
| Paymenter — paginile de descriere ale extensiilor de marketplace | `/marketplace/<id>-<slug>` | **nu au fost accesate**; s-a folosit **doar numele** din catalog (S26), ca indice de existență — nu ca descriere a funcționalității |
| API publică Paymenter | `https://api.paymenter.org` | nu a fost accesată — nu e nevoie: spec-ul OpenAPI (S30) e suficient |

Vezi §7 „Ce nu am putut verifica" — acolo este explicit separată diferența dintre
„produsul nu are asta" și „nu am găsit documentație pentru asta".

---

## 2. Metodă

1. **Nicio interacțiune cu platforma Blipmade în producție.** Nu s-a vizitat `blipmade.com`, nu
   s-a creat cont, nu s-a autentificat, nu s-a făcut nicio cerere pe adresele publice ale platformei.
   Singurele surse despre Blipmade sunt mirrorul de cod și rapoartele de audit deja scrise.
2. **Inventarul Blipmade nu a fost re-făcut.** Baza de adevăr este
   `audit/post-remediation/FUNCTIONAL-COVERAGE.md` (117 funcții clasificate, 34 constatări
   `FN-P1-01`…`FN-P1-34`), completat cu `PREVIOUS-FINDINGS-REVALIDATION.md`,
   `FINANCIAL-INTEGRITY.md`, `SECURITY-REVIEW.md`, `INFRASTRUCTURE-AND-RECOVERY.md`,
   `ADMIN-FUNCTIONALITY.md` și `SESSIONS-INVESTIGATION.md`. Fiecare afirmație din tabele este
   însoțită de o referință `file:line` în mirror sau de un ID de constatare dintr-un raport.
3. **Lista de referință Paymenter a fost construită din surse oficiale**, în ordinea: arbore
   documentație → README oficial → note de lansare. Documentația oficială este sursa autoritativă
   pentru funcționalitate; README-ul și notele de lansare sunt folosite pentru a confirma
   maturitatea și pentru funcțiile adăugate recent.
4. **Vocabular fix de clasificare**, folosit identic în ambele tabele:
   - **prezent** — există și poate fi folosit de un client (inclusiv prin backend-ul fără UI, dacă
     funcția este accesibilă prin API și documentată ca atare);
   - **parțial** — există o parte din funcție, dar fie nu e legată în interfață, fie acoperă doar
     o parte a domeniului, fie este legată de un sistem extern neconfigurat;
   - **absent** — nu există nicio implementare în cod.
   Distincția cerută de brief este respectată: dacă o funcție există în Paymenter dar nu am găsit
   documentație pentru ea, rândul este marcat **„neverificat"**, nu „absent".
5. **Severitatea este comercială, nu tehnică.** O funcție lipsă primește severitate în funcție de
   efectul asupra vânzării, nu de dificultatea implementării.
6. **Data este fixată la 23.10.2026.** Aceste produse se schimbă; afirmațiile despre Paymenter
   descriu starea documentată în această dată.

---

## 3. Diferența de arhitectură — lectura obligatorie înaintea tabelelor

Aceasta este constatarea care organizează întreg raportul.

| | **Paymenter** | **Blipmade** |
|---|---|---|
| Ce este | platformă de **facturare** pentru companii de găzduire | platformă de **găzduire** cu facturare integrată |
| Ce știe să facă bine | factură, recurență, taxe, cupoane, multi-monedă, extensii | provisionează servere de joc pe un cluster Pterodactyl |
| Cum livrează serviciul | **nu livrează** — extensiile `extensions/Servers/*` punc un bridge către Pterodactyl, Convoy, cPanel, DirectAdmin, Enhance, Plesk, Virtfusion, Virtualizor | **delivrează** — provisionarea e în cod: `api/src/services/provisioning.ts`, coada BullMQ din `api/src/worker.ts` |
| Ce consumator vizează | un administrator de găzduire care are deja panoul și vrea doar facturarea | un jucător / comunitate mică care vrea un server gata în câteva minute |
| Stack | PHP 8.3 + Laravel + MariaDB + Filament (README oficial) | Node/Fastify + React/TS + PostgreSQL + Redis |
| Licență | MIT | proprietary (repo intern) |
| Distribuție | self-host + `paas.paymenter.org` (cloud găzduit, menționat în ghidul de instalare) | self-host + `blipmade.com` (serviciu găzduit) |

**Consecința pentru analiză:** o lipsă din Blipmade este un *defect* doar dacă Blipmade
*promite* acea funcție sau dacă funcția e **necesară pentru a vinde servere de joc**. Dacă
Paymenter are un modul pe care Blipmade nu-l are, iar modulul nu e în drumul de vânzare al unui
server de joc, diferența e **de scope**, nu de calitate.

Prin urmare, fiecare rând din tabele poartă o marcare:

- **[A]** — **diferență arhitecturală**, nu defect. Blipmade nu trebuie să construiască asta ca
  să fie o platformă de găzduire bună.
- **[D]** — **defect sau decalaj real** în raport cu promisiunea Blipmade sau cu drumul de vânzare.
- **[C]** — **avantaj al Blipmade**: funcția există în Blipmade și este mai bine făcută decât în
  Paymenter, sau n-are echivalent în Paymenter.

Regula de decizie pentru severitate: **P0/Critical** dacă lipsa blochează *o vânzare* sau *o
operațiune* în starea curentă; **High** dacă blochează o vânzare într-un segment concret; **Medium**
dacă blochează o operațiune sau o încredere; **Low/Info** dacă e ergonomică.

---

## 4. Tabelele de paritate pe domenii

Convenție de marcaj: **prezent** / **parțial** / **absent** / **neverificat** (vezi §2, punctul 4).
Dovezile Blipmade sunt `file:line` în mirrorul `/root/blipmade-work` sau un ID de constatare
dintr-un raport de audit din `audit/post-remediation/`.

### 4.1 D1 — Produse și catalog

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| CRUD produs cu slug, descriere, imagine, categorie | **prezent** | `api/prisma/schema.prisma:219` (`Product`: `slug`, `name`, `category`, `description`, `icon`), `api/src/routes/admin.ts` (`POST/PATCH/DELETE /admin/products`), `FUNCTIONAL-COVERAGE.md:242` (C06, clasă F) | — | — |
| Categorii de produs | **prezent** | `api/prisma/schema.prisma:205` (`enum Category`, 6 valori), `web/src/home/Catalog.tsx` (filtre pe categorie), `FUNCTIONAL-COVERAGE.md:186` | — | — |
| **Stoc / inventory per produs** | **absent** | `grep -i stock api/src web/src api/prisma/schema.prisma` → **0 potriviri**; câmpul nu există în `Product` (`schema.prisma:219-263`) | Nu blochează: Blipmade vinde resurse partajate, nu sloturi finite. Dar nu poate vinde un plan cu "max 10 servere disponibile" | [A] |
| **Limită per utilizator per produs** | **absent** | `maxPerUser` există **doar** pe `Promotion` (`schema.prisma:537`), nu pe `Product` | Nu blochează vânzarea hobbyistului. Blochează **anti-abuz la nivel de produs** (un client poate cumpăra N de servere fără limită) | [D] |
| **Cantitate pe comandă** | **parțial** | `FN-P1-14` — `quantity` e **ignorată în cotă** și **onorată în comandă** (`api/src/services/pricing.ts` vs `api/src/routes/orders.ts`) | Clientul poate vedea un preț și poate plăti altul. **Provoacă dispute de preț** — severitate comercială reală, chiar dacă e o singură funcție | [D] |
| Email template per produs (credențiale de pornire) | **absent** | `grep -i "emailTemplate" api/prisma/schema.prisma` → 0; `Product` nu are câmp | Blipmade are în schimb `panel-bridge/` (mint de chei API Pterodactyl) — mecanism alternativ, mai bun, dar neexistent în forma asta în cod | [A] |
| Ascunde produs din magazin | **prezent** | `schema.prisma:250` (`visible`), `web/src/admin/Products.tsx` (coloana VISIBLE), `FUNCTIONAL-COVERAGE.md:242` | — | — |
| Produs cu „Coming soon" | **parțial** | `FN-P1-34` — un produs „Coming soon" fără ou primește **două** mesaje de blocaj | Nu blochează vânzarea; strică încrederea | [D] |
| **Legare produs de o extensiune de server** | **parțial** | Paymenter: produsul e legat de o *extensie* (`extensions/Servers/*`). Blipmade: legătura e de tip fix, `eggId`/`eggUuid`/`dockerImage` pe `Product` (`schema.prisma:224-228`) | Blipmade nu poate vinde simultan „Pterodactyl" și „Convoy" la același produs. Acceptabil: e un produs unic | [A] |
| **Catalogo public care expune intern** | **parțial** | `ADM-14` — `api/src/routes/catalog.ts:54-55,88-89` expune `deployable` și `eggId` în răspunsul **public** | Nu blochează vânzarea, dar dă informație de arhitectură concurenților și confirmă public că produsele nu sunt livrabile | [D] |

### 4.2 D2 — Prețuri și perioade de facturare

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Planuri cu tip: Free / One Time / Recurring | **absent** | `api/prisma/schema.prisma:264` (`ProductPrice`) are doar `period` + sume; nu există tip de plan. `enum BillingPeriod` (`schema.prisma:214`) = `MONTHLY`, `YEARLY` | Blipmade nu poate vinde un plan **gratuit** sau **de unica folosinta**. Un plan free e cel mai ieftin instrument de conversie — **lipsă reală de instrument comercial** | [D] |
| Interval de facturare: zile / săptămâni / luni / ani | **parțial** | `BillingPeriod` are doar `MONTHLY`/`YEARLY` (`schema.prisma:214-217`) | Nu se poate vinde „7 zile" sau „3 luni". Pentru jucători, pachetele scurte (1 zi, 7 zile) sunt **formatul standard** al pieței | [D] |
| Multiplicator de perioadă (ex. „la 3 luni") | **absent** | Nu există câmp de perioadă multiplicată în `ProductPrice` | — | [D] |
| Preț per monedă (multi-currency) | **absent** | `ProductPrice.currency` există (`schema.prisma:279`) dar `DEFAULT_CURRENCY = 'EUR'` unic (`api/src/lib/money.ts:6`); nu există model `Currency` | Blipmade nu poate vinde în RON/LTC fără schimbare de cod. Pe o piață românească, **factura în lei este un argument de vânzare**, nu un detaliu | [D] |
| Taxă de setup (one-time) | **absent** | `grep -i "setupFee\|setup_fee"` → **0 potriviri** | Model de preț rigid: plata = abonament. Nu se poate taxa un „setup fee" pentru un produs cu efort de provisionare | [A] |
| Preț pe unitate de resursă (RAM/CPU/disk) | **prezent — mai bine** | `api/prisma/schema.prisma:264-282` (`ramPerGb`, `cpuPerUnit`, `diskPerGb`); contract de preț unic: `api/src/services/pricing.ts:86-113` (`priceBook`) și `:152-180` (`priceItems`) folosesc **aceeași** funcție `priceConfiguration` (`PRICE-02`, `PRICE-05` → `VERIFIED FIXED`) | — | **[C]** |
| Prețul din interfață = prețul din comandă | **prezent — remediat** | `PRICE-03` → `VERIFIED FIXED`: `web/src/home/Configurator.tsx:79` citește `POST /api/catalog/quote`; contract comun `web/src/lib/pricing-contract.ts` + test `web/tests/pricing-contract.test.ts` | — | **[C]** |
| **Plan anual cotat ≠ plan anual încasat** | **defect deschis** | `FIN-P2-03` — cotarea acceptă `period:'YEARLY'` (1890) dar `POST /api/orders` încarcă **189** (prețul lunar); cauză: `api/src/services/pricing.ts:422` apelează `priceItems(items)` fără al doilea argument, iar `api/src/routes/orders.ts:68` nu acceptă `period` | **Vânzare greșită.** Clientul vede prețul anual, plătește prețul lunar, sau invers. E o problemă de încredere și de conformitate, nu de ergonomie | [D] |
| Upgrade / downgrade pe planuri | **parțial** | Blipmade are *resizing* de resurse pe instanță existentă (`B13`, `B26` în `FUNCTIONAL-COVERAGE.md:216,229`; `api/src/routes/instances.ts:298-302`), nu ierarhii de planuri legate de produs | Adequat pentru hosting de joc; insuficient pentru „Basic/Pro/Premium" | [A] |
| Preț recomandat distinct | **prezent — remediat** | `PRICE-04` → `VERIFIED FIXED`, `api/src/services/pricing.ts:103-112` | — | **[C]** |

### 4.3 D3 — Comenzi și checkout

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Catalog cu preț de pornire | **prezent** | `FUNCTIONAL-COVERAGE.md:186` (A02, F), `:187` (A03, F) | — | — |
| Configurator cu preț estimat de server | **prezent** | `FUNCTIONAL-COVERAGE.md:219` (B16) — `POST /catalog/quote` → 200; dar `FN-P1-01`: presetul „Recommended configuration" e **identic cu minimul** și nu poate fi setat | Degradare minoră de conversie: clientul nu vede o configurație „recomandată" diferită | [D] |
| **Stare de disponibilitate derivată din realitate** | **prezent — înainte de referință** | `AVAIL-01` → `VERIFIED FIXED`: `api/src/services/availability.ts` + gardă pe `egg`; produs cu `eggId=null` ⇒ catalog `TEMPORARILY_UNAVAILABLE`, `orderable:false`, cotă **400**, comandă **400**. `AVAIL-02` → `GET /catalog/products` → `availability:{state,enabled,installable,visible,orderable,blockers}` | — | **[C]** |
| Flux de checkout cu coș / mai multe produse | **absent** | `grep -ri cart api/src web/src api/prisma/schema.prisma` → **0 potriviri**; nu există model `Cart`/`CartItem` | Clientul trebuie să cumpere **un produs per comandă**. Pentru hobbyist e suficient; pentru un reseller cu 5 servere, e 5 fluxuri | [D] |
| Checkout oaspete (fără cont) | **absent** | `api/src/routes/orders.ts` cere autentificare; `A11` din `FUNCTIONAL-COVERAGE.md:195` redirecționează anonimul la `/login?next=…` | Există o frunză de conversie pierdută la fiecare vizitator | [D] |
| Gateway de plată | **parțial — oprit** | `OPS-05` → `STILL BROKEN`: `api/src/services/stripe.ts:194-197` → `paymentsUnavailable()`; `.env`: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` unset | **Nu se poate vinde nimic astăzi.** `PORT-07` → `STILL BROKEN`: „niciun produs nu poate fi vândut azi" — **P0 de lansare** | [D] |
| Interfața nu consumă starea de plată | **parțial** | `PAY-01` → `PARTIALLY FIXED`: ruta există (`api/src/routes/billing.ts:119` `/billing/payment-state`), dar `grep -rn "payment-state" web/src/` → **0 potriviri**; `web/src/app/Deploy.tsx:778` afișează „Checkout is not available" ca stare statică | Nu blochează vânzarea (blocajul e în backend), dar **ascunde** de ce nu se poate plăti — clientul primește un mesaj static, nu un motiv | [D] |
| Plată fără furnizor pentru comandă de 0 | **prezent** | `PAY-03` → `VERIFIED FIXED`, `api/src/routes/orders.ts:167-169` — `order.total === 0` ⇒ `markOrderPaid` + `fulfilOrder`, fără furnizor; test `api/tests/order-amounts.test.ts:199` | — | [C] |
| **Comandă anulată/rambursată poate fi repusă în circuitul de plată** | **defect deschis** | `FIN-P2-04`: garda din `api/src/routes/orders.ts:160` respinge doar `PAID` și `FULFILLED`; `CANCELLED`/`REFUNDED` trec și primesc o **nouă sesiune de plată** (FIN-T03, FIN-T04) | **Dublu taxare** a clientului, cu comisioane și refund. Risc financiar direct | [D] |
| Rambursare manuală din admin | **parțial** | `ADM-06` → `VERIFIED FIXED` (ruta există, `api/src/routes/admin.ts:408`), dar `FN-P1-10`: butonul „Refund" din `web/src/admin/Orders.tsx` **eșuează întotdeauna** cu 503 „Payments are not configured on this environment" | Rambursarea nu e posibilă cât timp Stripe nu e pornit. În faza de test n-ar conta; în faza comercială, da | [D] |

### 4.4 D4 — Facturare, facturi și taxe

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Factură cu număr unic | **prezent** | `api/prisma/schema.prisma:467` (`number` cu `@unique`), număr generat atomic: `api/src/services/order-numbers.ts:104` (`nextInvoiceNumber`) → consumat în `api/src/services/billing.ts:635,938` | — | [C] |
| **Numerotare atomică a facturilor** | **prezent — înainte de referință** | `BE-14` → `VERIFIED FIXED`: contor atomic în `Setting` cu `FOR UPDATE` (`api/src/services/order-numbers.ts:47-98`); `FIN-P2-01` (pierdere de factură la `count()+1`) e închis. Atenție: `REGR-02` — contorul trăiește în același rând `Setting` cu retenția | — | **[C]** |
| **Factură vizibilă de client după plată** | **defect deschis** | `FN-P1-26` („Nu se poate vedea nicio factură după o plată"); `FN-P1-03` („Pagina de facturare ignoră parametrul `checkout`; în poarta locală plată nu se finalizează niciodată"); `B18` în `FUNCTIONAL-COVERAGE.md:221` — clasa **PW** (parțial conectat) | **Blocaj de vânzare pentru clienți de business.** Un client care cere factură nu o primește. În UE, clientul B2B refuză plata fără factură. Nu e o funcție "de lux" — e o condiție de plată | [D] |
| PDF de factură | **parțial — împrumutat de la Stripe** | `api/prisma/schema.prisma:482` (`pdfUrl`), populat din payload-ul Stripe `invoice_pdf` (`api/src/services/billing.ts:769,790`); interfața leagă direct (`web/src/app/Billing.tsx:342-399`) | Funcțional, dar **factura e a Stripe, nu a Blipmade**: nu are TVA românesc, nu are datele fiscale ale emitentului, nu e în limba clientului. La o tranzacție cu o firmă românească, factură fără TVA și fără cod fiscal = **neutilizabilă fiscal** | [D] |
| **Taxe (TVA) configurabile** | **absent** | `TaxRate` există în Paymenter (`app/Models/TaxRate.php`, `app/Admin/Resources/TaxRateResource.php`, migrare `database/migrations/2024_07_02_190049_create_tax_rates_table.php`). În Blipmade: `grep -rn "tax" api/src` → doar `api/src/services/stripe.ts:438-460` (`tax ?? 0`) și două `tax: 0` literal în `api/src/services/billing.ts:642,944` | **Blocaj de vânzare B2B în UE și de conformitate fiscală.** O factură fără TVA nu poate fi deductibilă. Nu se poate vinde cu cotă „cu TVA inclus" | [D] |
| **Multi-monedă (factură în altă monedă)** | **absent** | `Currency.php` + `CurrencyResource.php` + `CurrencySwitch.php` în Paymenter; în Blipmade doar `currency String @default("EUR")` (`schema.prisma:479,508,281`) | Nu se poate factura în lei, dolari sau USDT | [D] |
| Credit de cont (sold pozitiv) | **absent** | Paymenter: `app/Models/Credit.php` + `app/Livewire/Components/Credits.php` + tag API `Credits` (5 operații). Blipmade: `grep -rn "credit" api/src` → 2 potriviri, ambele comentarii despre upgrade (`api/src/services/upgrades.ts:255,275`) | Blipmade nu poate credita un client (de exemplu, pentru un incident) și nici compensa un downgrade. Relevant mai ales pentru că `PROV-12` cere credit la degradare | [D] |
| Factură ca șablon editabil (invoice templates) | **absent în nucleu / extindere în Paymenter** | În Paymenter e extindere de marketplace (`/marketplace/110050-invoiceforge`, `79253-invoicesplus`, `93284-invoice-templates-manager`) | Nu e o diferență de nucleu | [A] |
| Snapshot de factură, tranzacții, note de ajustare | **absent** | Paymenter: `InvoiceSnapshot.php`, `InvoiceTransaction.php`, `AdjustmentNote.php`; Blipmade: `Invoice` are doar `amount/tax/total` (`schema.prisma:479-482`) | Fără istoric de ajustări, o corecție de factură se face prin rambursare + refacere | [D] |
| **Verificarea sumei se dezactivează dacă furnizorul nu trimite suma** | **defect deschis** | `BE-09` → `STILL BROKEN`: `api/src/routes/webhooks.ts:303-304` → `if (typeof amountTotal !== 'number') return null;` | **Risc financiar**: o livrare fără sumă trece nevalidată. În plus, `FIN-P2-03` (plan anual ≠ încasat) arată că suma cotată și cea încasată pot diverge | [D] |
| Impozit de tranzacție / ajustări pe factură | **absent** | Paymenter are `InvoiceTransaction` + `PaymentMethodAdjustments` (extindere marketplace) | — | [A] |

### 4.5 D5 — Abonamente și ciclu de viață al serviciului

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Abonament legat de o instanță | **prezent** | `api/prisma/schema.prisma:425` (`Subscription` cu `instanceId @unique`), `SubscriptionStatus` la `:415` (`TRIALING/ACTIVE/PAST_DUE/PAUSED/CANCELLED/INCOMPLETE/INCOMPLETE_EXPIRED`) | — | — |
| **Factură de reînnoire generată de sistem** | **parțial** | `api/src/routes/billing.ts:258-280` scrie factura de reînnoire; dar `FIN-P2-03` notează că **doar calea de reînnoire** (`createLocalRenewal`) suportă `YEARLY` | Reînnoierea există; dar planul anual nu e comandabil, deci **nu se poate subscrie anual prin calea normală** — doar prin reînnoire | [D] |
| Anulare / reziliere cu motiv | **parțial** | `api/src/routes/instances.ts` + retenție (`api/src/services/billing.ts:421-448` scrie termenul și exportul); `ServiceCancellation.php` + `ServiceCancellationReason` în Paymenter. Blipmade: `grep -i "cancellationReason\|cancellation_reason"` → **0 potriviri** | Blipmade cere anularea, dar **nu întreabă de ce**. Pierde feedback-ul de calitate și nu poate raporta motivul de churn | [D] |
| Upgrade de resurse cu preț | **prezent** | `B13`/`B26` (`FUNCTIONAL-COVERAGE.md:216,229`), `api/src/routes/instances.ts:298-302`; `GET /instances/:id/resources/quote` + `PUT /instances/:id/resources` | — | — |
| **Credit la degradare** | **absent** | `PROV-12` → `STILL BROKEN`: `api/src/services/upgrades.ts` nu creditează clientul fără abonament | Risc reputațional: clientul plătește un serviciu care nu funcționează și nu primește nimic înapoi | [D] |
| **Stările de instanță reflectă realitatea** | **defect deschis** | `PROV-05` → `STILL BROKEN`: `api/src/routes/instances.ts:149` scrie `RESTARTING` și nu resetează starea; `grep -rn "DEGRADED" api/src/` → **0 potriviri** | Clientul plătește un serviciu pe care nu îl poate folosi, **fără niciun semnal**. Consecință directă: bilete, refund, reputație | [D] |
| **Ștergerea reală la anulare e dezactivată implicit** | **defect deschis** | `COMM-08` → `PARTIALLY FIXED`: `api/src/services/billing.ts:482-530` cere `auto_delete_cancelled_instances.enabled === true`, implicitul e `false` (`:281-289`) | Nu blochează vânzarea, dar e un **pericol GDPR** și o creștere a costului de stocare | [D] |
| Număr de perioade configurabile (ex. „3 luni") | **absent** | vezi D2 | — | [D] |

### 4.6 D6 — Metode de plată și gateway-uri

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Stripe | **parțial — cod scris, neactivat** | `api/src/services/stripe.ts` complet; `OPS-05` → `STILL BROKEN` (`PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` unset); `docs/PRODUCTION_READINESS.md:83` („The Stripe keys are missing — **operator**") | **P0.** Fără cheie Stripe nu există venit | [D] |
| PayPal, Mollie | **absent** | Paymenter: `extensions/Gateways/{PayPal,PayPal_IPN,Mollie}`. Blipmade: `api/src/services/stripe.ts` este singurul furnizor; `schema.prisma:466-492` are exclusiv câmpuri `stripe*` | **Pătrundere pe piață** — în RO și UE, PayPal e așteptat; în unele piețe, plată locală. Dar blocajul real e Stripe-ul, nu PayPal | [D] |
| Portofel / crypto | **absent** | Marketplace Paymenter: BTCPay, CoinGate, Coinbase (via URL docs), Lemon Squeezy, Paddle, NOWPayments, OxaPay | — | [A] |
| **Plată manuală / transfer bancar** | **absent** | Marketplace Paymenter: `83697-manual-bank-transfer-payment-gateway`, `66919-gerbangpembayaranmanual`, `62784-manualmultipay-gateway` | Blipmade nu are **niciun** mod de a încasa bani în afara lui Stripe. Dacă Stripe e blocat, **nu există venit deloc**. E un risc de concentrare pe un singur furnizor, într-o platformă care are încă o singură integrație | [D] |
| Billing portal Stripe (client) | **parțial** | `schema.prisma:508` (`stripeCustomerId` — "the billing portal needs it"), `api/src/routes/billing.ts` | — | — |
| Metode de plată configurabile per plan | **absent** | Paymenter: `app/Livewire/Components/PaymentMethods.php` | — | [A] |

### 4.7 D7 — Cupoane și promoții

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Cupon cu procent sau sumă fixă | **prezent** | `api/prisma/schema.prisma:525` (`enum PromotionType { PERCENT, FIXED }`), `:530` (`Promotion` cu `code`, `type`, `value`), `C09` în `FUNCTIONAL-COVERAGE.md:245` (clasa PW) | — | — |
| **Plafon de utilizări** | **prezent — remediat, dar contorul afișat e altul** | `FN-P1-05`: contorul afișat în admin (`Promotion.usedCount`) **nu e** contorul care impune plafonul; plafonul se impune din `PromotionRedemption` (`api/src/services/pricing.ts:309-325`) | Mecanismul e corect; **afișarea e mincinoasă** — operatorul vede un număr greșit de redeem-uri și nu-și dă seama câte locuri mai are | [D] |
| Limită per utilizator | **prezent** | `schema.prisma:537` (`maxPerUser`), `api/src/services/pricing.ts:263-265,318-322` | — | — |
| Fereastră de valabilitate | **prezent** | `schema.prisma:540-542` (`startsAt`, `endsAt`) | — | — |
| **Promoție aplicabilă unor produse anume** | **absent** | Paymenter: `app/Models/CouponProduct.php` + migrare `2025_09_20_185200_add_applies_to_to_coupons.php`. Blipmade: `Promotion` n-are relație cu `Product` — se aplică global | Blipmade nu poate face „reducere 20% doar la Minecraft". Pierde **campanii pe produse noi**, care sunt exact campaniile de conversie utile | [D] |
| **Campanie care rezervă și eliberează slotul** | **prezent — înainte de referință** | `api/src/services/pricing.ts:273-340` (`reservePromotion` cu blocaj pe rând, `PROMOTION_RESERVATION_MS = 48h`), `releaseStalePromotionReservations` în `api/src/worker.ts:145`; `PROMO-02/03/07` → `VERIFIED FIXED`; `FIN-T10`: 15 rezervări concurente cu `maxRedemptions=2` ⇒ acceptate 2, respinse 13 | — | **[C]** |
| Contor `usedCount` se dublează la webhook-uri concurente | **defect deschis** | `FIN-P2-05`: `api/src/services/stripe.ts:288-295` citește `promotionRedeemedAt` **în afara tranzacției** ⇒ `usedCount=2` cu 1 redemption (FIN-T30) | Nu afectează plafonul (se numără din `PromotionRedemption`), dar **indicatorul de business e greșit** | [D] |
| Comandă integral promoționată | **prezent, cu un efect nedorit** | `PAY-03` → `VERIFIED FIXED` (comanda de 0 nu merge la furnizor), dar `FIN-P2-06`: `markOrderPaid({amount: 0})` scrie un `Payment` cu `status='SUCCEEDED'`, `amount=0` — **se numără ca venit** | Contabilitate murdară: venit de 0 în raportul MRR | [D] |
| Gift cards | **absent** | Marketplace Paymenter: `112179-giftcards`, `114986-couponlink` | — | [A] |
| Program de loialitate / puncte | **absent** | Marketplace Paymenter: `124029-infinity-customer-rewards` | — | [A] |

### 4.8 D8 — Suport și ticketing

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Bilete cu fir, evenimente, atribuire | **prezent** | `api/prisma/schema.prisma:708` (`Ticket`), `:734` (`TicketMessage`), `:752` (`TicketEvent`); `C08` (`FUNCTIONAL-COVERAGE.md:244`), `B19`/`B20` (`:222-223`) | — | — |
| Categorii de bilete | **prezent** | `schema.prisma:700` (`enum TicketCategory`), `:693` (`TicketPriority`) | — | — |
| **Departamente de bilete** | **absent** | Paymenter: „Departments" în `Admin → Settings → Tickets` (docs `/docs/guides/tickets/`). Blipmade: `grep -i department api/src web/src api/prisma/schema.prisma` → **0 potriviri** | Cu un singur operator, departamentele nu sunt necesare. Nu blochează azi | [A] |
| Interfață de operator pentru bilete | **prezent** | `web/src/admin/Tickets.tsx` (coadă, selectare), `C08` | — | — |
| **Permisiuni pe bilete verificate efectiv** | **defect deschis** | `ADM-01` → `STILL BROKEN`: `api/src/routes/tickets.ts` → `grep requirePermission` → **0 potriviri**; rutele folosesc `requireAuth`/`requireStaff` (`:409`), fără `tickets.read`/`tickets.write` | **Problema de operare și de încredere**, nu de vânzare: un operator STAFF fără permisiune vede și scrie în bilete. Dar e un defect de severitate reală | [D] |
| **Atașamente la bilete** | **defect deschis** | `FN-P1-02` (High): `web/src/app/TicketDetail.tsx:90,99-103` trimite doar `{name,size,type}`; `Attachment` are **0 rânduri** în DB (`FUNCTIONAL-COVERAGE.md:760`) | În practică, un ticket de suport pentru un server de joc **conține un log**. Fără atașament, suportul se întoarce prin chat. **Fiecare bilet fără log devine un bilet rezolvat prin refuz** | [D] |
| **Email piping (IMAP → bilet)** | **absent** | Paymenter: docs `/docs/guides/tickets/` → secțiunea „Email piping" + `php artisan app:fetch-emails`. Blipmade: `grep -i "imap\|piping"` → **0 potriviri** | — | [A] |
| **Canalul de suport e inert** | **defect deschis** | `OPS-03` → `STILL BROKEN`: `SMTP_URL` unset ⇒ transport `file`; `GET /api/health` → `"mail":"file","configured":false`; `OPS-06`: `/status` raportează „Support — Degraded" | **P0 pentru încredere.** Clientul nu primește niciun e-mail: nici confirmare de cont, nici factură, nici notificare de bilet. Supportul prin e-mail nu există deloc | [D] |
| Majoritatea mesajelor tranzacționale ocolesc coada de e-mail | **defect deschis** | `FN-P1-07` (Medium) | — | [D] |
| Chat live | **absent** | Marketplace Paymenter: `77019-discord-live-chat`, `77591-jivochat`, `98786-paymenter-chatwoot-integration` | — | [A] |

### 4.9 D9 — Personal, roluri și operațiuni interne

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Membri staff cu roluri | **prezent** | `api/prisma/schema.prisma:190` (`StaffMember`), `:17` (`enum Role`), `C12` (`FUNCTIONAL-COVERAGE.md:248` — 32 membri, 21 căsuțe de permisiuni) | — | — |
| **21 permisiuni fine-grained** | **prezent** | `api/src/lib/permissions.ts`; tabelul complet în `FUNCTIONAL-COVERAGE.md:778-800`, toate verificate ca fiind aplicate unui STAFF redus (403) | — | [C] |
| **Rolul ADMIN ocolește toate permisiunile** | **decalaj de proiectare** | `FN-P1-28`: `api/src/lib/permissions.ts:39-42` — lista de permisiuni a unui administrator nu are niciun efect | Nu e un defect *de vânzare*, dar e o slăbiciune de model de rol: „least privilege" nu se aplică la nivelul maxim | [D] |
| Jurnal de audit | **prezent** | `api/prisma/schema.prisma:768` (`AuditLog`), `C11` (195 rânduri, căutare pe actor/acțiune/țintă) | — | [C] |
| **Audit trail al clienților exportat prin `GET /admin/settings`** | **defect deschis (regresie)** | `REGR-01` (High) — `api/src/routes/admin.ts` → `GET /admin/settings` include exportul de conformitate al clienților; `SEC-16`: eșecul de autorizare al endpoint-urilor interne răspunde **HTTP 200** | Expunere de date personale într-un răspuns de setări. **Nu e o problemă de vânzare, e o problemă de GDPR** și poate opri o lansare | [D] |
| Pagina de start a adminului cere `customers.read` dar arată cifra de afaceri | **defect deschis** | `ADM-08` → `STILL BROKEN`: `api/src/routes/admin.ts:50` (`requirePermission('customers.read')`) și `:370,386` calculează „Monthly recurring revenue" | Frontieră de permisiune: un operator fără acces la clienți vede MRR-ul companiei | [D] |
| Jurnal și liste plafonate fără paginare | **parțial** | `ADM-09`/`ADM-12` → `PARTIALLY FIXED`: `api/src/routes/admin.ts:490,984` → `take: 300`/`take: 200`; există `TruncationNote`, nu paginare | La >200 clienți, adminul nu vede tot. **Crește după lansare** | [D] |
| Statistici de business (MRR) | **parțial — parțial stub** | `FN-P1-11`: `GET /admin/money` e un **stub cu valoare fixă** | Operatorul nu poate săra peste MRR real → nu poate decide prețuri. Nu blochează vânzarea, blochează **conducerea** | [D] |
| Import / export de clienți, reconciliere de prețuri fără ecran | **absent (UI)** | `ADM-13` → `STILL BROKEN`: `api/src/routes/admin.ts` are cheia de client a panoului, importul, exportul, reconcilierea de prețuri, dar `web/src/admin/` nu are pagină | — | [D] |
| Telemetrie anonimă / cron de monitorizare | **absent** | Paymenter: `php artisan app:cron-job`, `app:telemetry`, `CronStat.php`. Blipmade: `api/src/worker.ts` are sweep-uri, dar fără statistică de execuție | — | [A] |
| Ecrane cu operații fără confirmare | **remediat** | `ADM-15` → `VERIFIED FIXED`, `web/src/admin/Infrastructure.tsx:342`, `Pricing.tsx:334`, `Products.tsx:407,433` (`ConfirmDialog`) | — | [C] |

### 4.10 D10 — Self-service pentru client

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Panou client, liste, detalii | **prezent** | `B01`–`B16` (`FUNCTIONAL-COVERAGE.md:204-219`) | — | — |
| **Controlul serverului din interfață** | **prezent, dependent de panou** | `B04`–`B11` (`:207-214`): Console, Files, Databases, Backups, Network, Startup, Schedules, Settings — toate **PW** (parțial conectate) | Funcționalitatea există; **gradul de conectare depinde de panoul Pterodactyl**, la care auditorii n-au acces. Verificarea e `NOT VERIFIED` (`FN-P1-23`) | — |
| **Preț și configurare ca „un server, tot ce ai nevoie"** | **prezent — înainte de referință** | Contractul de preț (`web/src/lib/pricing-contract.ts`), preț estimat de server, `availability.orderable` — vezi D2/D3 | — | **[C]** |
| Redimensionare (upgrade) fără operator | **prezent** | `B13`, `B26` | — | [C] |
| Preferințe de notificare | **prezent** | `api/prisma/schema.prisma:117` (`NotificationPreference`), `B24` (`FUNCTIONAL-COVERAGE.md:227` — 5 preferințe) | — | — |
| Lista și închiderea sesiunilor | **prezent** | `B23` (`:226`); `SESSIONS-INVESTIGATION.md` | — | — |
| **2FA (TOTP)** | **absent** | Paymenter: `app/Livewire/Components/Tfa.php`; extindere marketplace `119533-email-otp-2fa`. Blipmade: `grep -rniE "totp\|2fa\|twoFactor" api/src web/src api/prisma/schema.prisma` → **0 potriviri** | Pentru o platformă care deține token-uri de panou Pterodactyl și cheie Stripe, absența 2FA e o slăbiciune de **credibilitate** la clienți corporate. Nu blochează vânzarea | [D] |
| Credit de cont în self-service | **absent** | vezi D4 | — | [D] |
| Anulare serviciu de către client | **parțial** | `api/src/routes/instances.ts` — retenția există (`COMM-08`), dar motivul nu se cere | — | [D] |
| **Pagina de metrici a instanței** | **absent** | `FN-P1-04` (Medium): niciun tab de metrici între cele 12 taburi; `GET /instances/:id/metrics` n-are apelant; dar `/docs` promite „Check the metrics" | Clientul nu poate vedea consumul de resurse. Pentru gaming, resursele sunt *motivul* subscrierii | [D] |
| Facturi și istoric de plată în panoul client | **parțial** | `B18` (PW) + `FN-P1-03` + `FN-P1-26` — vezi D4 | **Blocaj de vânzare B2B** | [D] |
| Transfer / gestiune de cont de către client | **absent** | Paymenter are management de cont; Blipmade: `POST /settings/account/closure` există (`B25`), dar nu transfer | — | [A] |

### 4.11 D11 — Automatizare: provisionare, terminare, suspendare

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| **Provisionare reală a serverului** | **prezent — nucleul diferențiator** | `api/src/services/provisioning.ts` (~15 apeluri la panou, ~20 scrieri în DB), coada BullMQ `api/src/worker.ts`; panou-ul Pterodactyl e integrat prin `api/src/services/pterodactyl/client.ts` și `panel-bridge/` | Paymenter **nu livrează** servere — face bridge. Blipmade livrează. **Aceasta e cea mai mare diferență de produs dintre cele două** | **[C]** |
| Provisionare condiționată de plată | **prezent — remediat** | `OPS-02` → `VERIFIED FIXED`: poarta `refuseUnpaidProvisioning` e apelată înainte de orice mutare pe panou; `api/src/worker.ts:48-58` transformă `PaymentRequiredError` în `UnrecoverableError` (nu reîncearcă); test `api/tests/provisioning-safety.test.ts:427,449,456` | — | **[C]** |
| **Compensare pe provisionare eșuată** | **prezent** | `api/src/services/provisioning.ts` — `beginProvisioning`/`completeStep` cu `provisionStep` (`:1001,1351,1356`); idempotență prin `findServerAttempt`/`recordServerAttempt` (`:477-500`), `BE-02` → `VERIFIED FIXED` | — | **[C]** |
| Suspendare | **prezent** | `B11` — `POST /suspend` prin panou (`app/instance/SettingsTab.tsx`); `api/src/routes/admin.ts` `POST /admin/customers/:id/suspend` (permisiune `customers.write`) | — | — |
| Terminare / distrugere cu retenție | **parțial** | `api/src/services/billing.ts:421-448` scrie termenul + exportul; ștergerea reală e condiționată (`COMM-08`) | — | [D] |
| **Joburi eșuate șterse din coadă** | **defect deschis** | `BE-07`/`PROV-03` → `STILL BROKEN`: `api/src/worker.ts:123` → `queue.clean(0, 1000, 'failed')` | Un job eșuat e **șters**, nu reținut: pierderea diagnosticului și lipsa reluării | [D] |
| **Bucle ale workerului înghit erorile** | **defect deschis** | `BE-08` → `STILL BROKEN`: `api/src/worker.ts:135` → `sweepBilling()` apelează `reconcileWithProvider().catch(() => undefined)`, `reconcileInvoicesWithProvider().catch(() => null)`, `releaseStalePromotionReservations().catch(() => undefined)` | Reconcilierea eșuată **dispare fără urmă**. Înseamnă că divergența dintre facturile locale și Stripe poate persista nedetectată | [D] |
| Provisionare blocată ține blocaj 30 de minute | **defect deschis** | `BE-06` → `STILL BROKEN`: `api/src/services/provisioning.ts:1075` aruncă `ProvisioningError`; blocajul e pe rândul de job, expirare 30 min, fără cale de eludare | — | [D] |
| Upgrade-ul nu verifică capacitatea nodului | **defect deschis** | `PROV-09` → `STILL BROKEN`: `api/src/services/upgrades.ts` — nicio referință la `nodeCapacity` | Un upgrade acceptat poate eșua la provisionare, fiindcă nodul nu are resurse. Se termină în compensare — cost operațional | [D] |
| **Comanda UPGRADE creată înainte de checkout** | **defect deschis** | `PROV-08` → `STILL BROKEN`: `api/src/routes/instances.ts:298-302` — comanda rămâne `PENDING` dacă `createCheckout` aruncă 503 | Comenzi orfane în istoricul clientului | [D] |
| **Lipsește mapping-ul de ou → pas greșit în jurnal** | **defect deschis** | `PROV-10` → `STILL BROKEN`: `api/src/services/provisioning.ts:439,456` raportează lipsa mapping-ului la pasul `server_created` | Diagnostic greșit pentru operator | [D] |
| Cron programat | **parțial** | Blipmade: `api/src/worker.ts` pornește sweep-uri; Paymenter: `php artisan app:cron-job` cu `CronStat.php` (statistică de execuție) | Blipmade nu raportează dacă cron-ul chiar rulează | [D] |
| Log de evenimente al instanței | **prezent** | `api/prisma/schema.prisma:640` (`InstanceEvent`), `B12` (`:215`) | — | — |

### 4.12 D12 — Extensii de serviciu (Pterodactyl / Convoy / cPanel)

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Pterodactyl | **prezent, prin integrare proprie** | `api/src/services/pterodactyl/client.ts`, `api/src/services/provisioning.ts`, `panel-bridge/BlipmadeBridgeServiceProvider.php` (mint de chei API pentru clienți) | — | **[C]** |
| **Convoy** | **absent** | Paymenter: `extensions/Servers/Convoy`. Blipmade: `grep -ri convoy api/src web/src` → 0 | Blipmade nu poate servi clienți care folosesc Convoy. **Diferență de segment**, nu de defect | [A] |
| **cPanel / DirectAdmin / Plesk / Enhance / Virtfusion / Virtualizor** | **absent** | Paymenter: `extensions/Servers/{CPanel,DirectAdmin,Plesk,Enhance,Virtfusion,Virtualizor}` | Blipmade e **doar** găzduire de servere de joc. Extinderea către web hosting e o altă piață, cu altă concurență (cPanel/WHMCS) și alt model de cost. **Decizie de scope, nu de gap** | [A] |
| Reseller de VPS (Proxmox, Hetzner, Linode, Datalix) | **absent** | Marketplace Paymenter: `66657-paymenter-proxmox`, `74561-hetzner-cloud-module`, `90255-linode-vps-reseller-plus`, `69593-datalix-vps-reseller` | — | [A] |
| **O singură alocare per server** | **defect deschis** | `OPS-08` → `STILL BROKEN`: `api/src/services/provisioning.ts` — o singură alocare per server (`pterodactylServerId` unic); nu există model pentru alocări multiple | **Blochează produsele de gaming** care vriu alocări multiple per client | [D] |
| **Produsul vândut nu conține aplicația** | **defect deschis** | `OPS-01`/`PRICE-04` → `PARTIALLY FIXED`: containerul primește o aplicație **generică** (`api/src/services/starter-apps.ts:53-91,112-118`), nu aplicația produsului; `api/prisma/seed.ts:29-31,72-73,96-97,146-147,170-171` → `dockerImage: null` pentru 4 din 5 produse; în producție `wordpress` are `eggId` **NULL** | **P0 de vânzare.** Nu se poate vinde ceea ce nu se livrează: clientul primește un „Hello world" care răspunde 200 pe `/health`, nu WordPress | [D] |

### 4.13 D13 — E-mail și notificări

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Tranzacționale (cont, comandă, plată, factură) | **parțial — neconfigurat** | `api/src/lib/email-templates.ts` (template-uri existente: confirmare e-mail, factură plătită, factură eșuată), `api/src/lib/mailer.ts`; dar `OPS-03`: `SMTP_URL` unset ⇒ transport `file` | **P0 pentru încredere.** Nimic nu ajunge la client | [D] |
| Șablon editabil per produs | **absent** | vezi D1 | — | [A] |
| Preferințe de notificare per client | **prezent** | `schema.prisma:117`, `B24` | — | — |
| Log de livrare e-mail | **prezent** | `api/prisma/schema.prisma:72` (`MailDelivery`), `GET /admin/email/delivery` (fără ecran) | — | [D] |
| Notificări Discord | **absent** | Paymenter: `extensions/Others/DiscordNotifications` (bundled) | — | [A] |
| Campanii de e-mail (broadcasting) | **absent** | Marketplace Paymenter: `86897-advanced-broadcasting` | — | [A] |
| Notificări în aplicație | **parțial** | `api/prisma/schema.prisma:117` — preferințe, dar nu am găsit un model `Notification` în Blipmade | — | [D] |

### 4.14 D14 — Theming și localizare

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Sistem de teme | **absent** | Paymenter: `themes/<name>/{views,resources,vite.config.js,theme.php}`, `php artisan app:theme:create`, overrid-uri de view-uri de extensie (`vendor/<type>/<name>/<view>`), configurație de temă în admin (`theme.php` → `primary_color`, `custom_css`). Blipmade: un singur set de componente React în `web/src/ui-app.tsx` | Blipmade e un produs cu o identitate unică; temele sunt o **funcție de platformă-distribuitor**, nu de produs | [A] |
| **Localizare / limbă** | **absent** | Paymenter: `lang/` cu **24 localizări** (`ar, bn, da, de, en, es, fi, fr, he, hi, hu, id, it, ko, lv, nl, no, pl, pt, sr, sv, tr, uk, zh`), plus `app/Livewire/Components/LanguageSwitch.php` și `LocaleSwitch.php`. Blipmade: **nicio** localizare — `locale='en-IE'` e **codificat** în `api/src/lib/money.ts:8`, `web/src/lib/api.ts:164`, `web/src/ui-app.tsx`, `web/src/app/Settings.tsx:62`, `web/src/app/instance/common.tsx:76,89`, `web/src/app/Overview.tsx:57`, `web/src/app/InstanceDetail.tsx:147,153` | **Argument de vânzare direct, pentru piața țintă.** Un hosting cu interfață exclusiv în engleză, pe o piață românească, pierde o parte din clienți. „en-IE" e chiar limba **irlandeză** — un accident de localizare, vizibil în formatarea banilor și a datelor | [D] |
| Formatare locală a banilor și datelor | **parțial — fixată** | `api/src/lib/money.ts:8-9` — `Intl.NumberFormat(locale, {style:'currency', currency})` cu `locale='en-IE'` implicit | Funcția e corectă, **argumentei** sunt fixați. Un pas mic: `locale` din profilul utilizatorului sau din `Accept-Language` | [D] |

### 4.15 D15 — Multi-monedă

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Model de monedă administrabil | **absent** | Paymenter: `app/Models/Currency.php`, `app/Admin/Resources/CurrencyResource.php` (Create/Edit/List), `app/Livewire/Components/CurrencySwitch.php`, `themes/default/views/components/currency-switch.blade.php`, test `tests/Feature/CartCurrencyTest.php`. Blipmade: `grep -rn "model Currency" api/prisma/schema.prisma` → **0 potriviri** | — | [D] |
| Prețuri per monedă | **absent** | Paymenter: prețul e per plan **și** per monedă (docs `/docs/guides/products/` → „Prices are set in the next section, where you can set different prices for different currencies"). Blipmade: `ProductPrice.currency` (`schema.prisma:279`) e un câmp de **etichetă**, cu o singură valoare folosită | Un client din afara zonei EUR trebuie să plătească în EUR și să suporte costul de conversie. În piața RO, e invers: **factura în lei e ce ar trebui să existe** | [D] |
| Comutator de monedă | **absent** | — | — | [D] |
| **Moneda implicită unică, corectă pentru piața țintă** | **prezent** | `api/src/lib/money.ts:6` → `DEFAULT_CURRENCY = 'EUR'` | Decizia „EUR" e **definită și consecventă** în toate locurile (`ProductPrice`, `Invoice`, `Payment`, `Promotion`-derived). E o platformă **single-currency, coerentă** — nu o platformă cu monedă spartă | [C] |

### 4.16 D16 — Afiliere

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Program de afiliați | **absent** | Paymenter: `extensions/Others/Affiliates` (bundled în repo) — `Models/Affiliate.php`, `Models/AffiliateOrder.php`, `Listeners/{AssociateOrderWithAffiliate,IncreamentAffiliateSignups,RewardAffiliate}.php`, `Policies/AffiliatePolicy.php`, `Middleware/AffiliatesMiddleware.php`; plus API: tag `Affiliates` cu 5 operații (`/v1/admin/affiliates`) | Nu blochează o vânzare. Blochează **creșterea prin recomandare**, care e canalul de vânzare cel mai ieftin pentru o platformă nouă | [D] |
| **Recompensă automată la comandă plătită** | **absent** | — | — | [D] |

### 4.17 D17 — Anunțuri și blog

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Anunțuri în panou | **absent** | Paymenter: `extensions/Others/Announcements` (bundled) — `Models/Announcement.php`, `Livewire/Components/Announcements/{Index,Show,Widget}.php`, `routes/web.php`, widget pe pagină | O platformă nouă, fără clienți, nu are nevoie de anunțuri. **Niciun cost, nicio pierdere** | [A] |
| Blog / pagini de marketing | **absent** | Paymenter: extindere marketplace `77560-blogs-for-paymenter`. Blipmade: `web/src/pages/Docs.tsx` (30 pagini de documentație), `web/src/home/{Story,Rest,Platform}.tsx` — **dar** `home/Platform.tsx` e un **mock declarat în cod** („The mock is a picture"), `A14`/`FN-P1-22` | Blipmade are un site de marketing; nu are un blog. Pentru SEO și căutare de organic, e o lipsă reală, dar nu blochează vânzarea | [D] |
| SEO / sitemap | **neverificat** | Blipmade: `MKT-01` → `NOT VERIFIED` (nu s-a vizitat adresa publică), `MKT-04` → `NOT VERIFIED`. Paymenter: marketplace `82265-sitemapgenerator-boost-your-seo`, `78766` etc. | Nu se poate afirma o lipsă fără verificare | — |

### 4.18 D18 — API pentru dezvoltatori și evenimente

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| **API REST public, versionat, cu cheie** | **absent** | Paymenter: `https://paymenter.org/openapi.json` (OpenAPI 3.1.0) — **22 rute, 48 operații**, 11 tag-uri (Affiliates, Categories, Users, Products, Orders, Services, Credits, Invoices, InvoiceItems, Tickets, Ticket Messages), securitate `bearer`, server `/api`, cu operațiuni CRUD complete. Blipmade: `grep -rn "openapi\|swagger" api/src web/src` → **0 potriviri**; niciun `ApiKey` în `api/prisma/schema.prisma` | Blipmade **nu poate fi integrat** cu tooling extern (Zapier, n8n, Discord bot, un panou reseller). Pentru un client care vrea să-și automatizeze infrastructura, e un blocaj real de integrare | [D] |
| OAuth ca furnizor | **absent** | Paymenter: `app/Models/OauthClient.php` + docs `/development/OAuth` + `/docs/guides/OAuth` (Discord, GitHub, Google ca **login**). Blipmade: `grep -ni "oauth\|discord\|social" api/src/routes/auth.ts` → **0 potriviri** | Două lucruri: (a) Blipmade nu oferă client OAuth niciunei aplicații; (b) **nu are login social** (Discord/GitHub/Google) — în gaming, login-ul cu Discord e **așteptat** și e un inhibitor de conversie pe telefon | [D] |
| Sistem de evenimente / hookuri | **parțial** | Paymenter: `Event::listen()` pe evenimente de model (Auth, Cart, CartItem, Invoice, InvoiceItem, Order, Property, Service, ServiceCancellation, ServiceUpgrade, Setting, Ticket, TicketMessage, User) + hookuri `navigation.*`, `pages.home`, `head`/`body`/`footer` (`/development/event-list`). Blipmade: `api/prisma/schema.prisma:790` (`WebhookEvent`) — webhookuri **de intrare** de la Stripe; și `api/src/lib/audit.ts` scrie evenimente (`auth.register`, `order.created`, `order.paid`, `stripe.checkout.*`) | Blipmade are **jurnal de audit**, nu **sistem de extensie**. Nu are extensibilitate nici prin cod, nici prin temă, nici prin API | [D] |
| CLI de administrare | **absent** | Paymenter: `php artisan app:cron-job`, `app:extension:create`, `app:extension:disable`, `app:fetch-emails`, `app:init`, `app:logs`, `app:settings:change`, `app:telemetry`, `app:theme:create`, `app:upgrade`, `app:user:create`, `app:user:password-reset` (`/docs/guides/cli`). Blipmade: scripturi shell în `scripts/` (backup, run-tests, verify-provisioning), dar **nicio interfață de operare a platformei** | Operatorul trebuie să folosească SQL/psql pentru operații de platformă | [D] |

### 4.19 D19 — Marketplace de extensii și multi-tenant

| Funcție (Paymenter) | Blipmade | Dovezi | Consecință comercială | Marcaj |
|---|---|---|---|---|
| Marketplace de extensii | **absent** | Paymenter: `https://paymenter.org/marketplace/` — sute de extensii (gateways, server bridges, teme, module de reseller VPS, `knowledgebase`, `waitlist`, `product-trials`, `dunning`, `advance-renewal`, `lost-cart-mails`, `socialproof`, `google-analytics`, `term-acceptance` etc.) | Blipmade nu are ecosistem. **Nu e o problemă acum** — un marketplace la zero e gol. E o **opțiune de acum 12-24 luni**, nu un GO | [A] |
| Platformă multi-tenant (mai multe operatori pe o instalare) | **absent** | Paymenter: `paas.paymenter.org` — variantă cloud găzduită, menționată în ghidul de instalare („fully managed, cloud-hosted version"). Blipmade: o singură instalare, un singur set de setări (`api/prisma/schema.prisma:809` `Setting`) | — | [A] |
| **Extensibilitate prin cod, oricare ar fi tipul** | **absent** | Paymenter: `php artisan app:extension:create`, trei tipuri (Gateways, Servers, Others), hookuri de lifecycle (`boot/enabled/disabled/updated/installed/uninstalled/upgraded`), configurare proprie per extensie, override-uri de view per temă. Blipmade: cod monolit, fără puncte de extensie | Architectural. **Explică de ce multe rânduri de mai sus sunt „absent"**: într-o platformă fără extensii, fiecare funcție nouă e o modificare a nucleului | [A] |

---

## 5. Unde Blipmade este **mai bun** decât Paymenter

Raportul nu este unilateral. Cinci lucruri le face Blipmade **mai bine** sau **diferit și mai potrivit**:

| # | Punct | De ce e mai bun | Dovezi |
|---|---|---|---|
| 1 | **Contractul de preț și consistența prețului** | Paymenter are *planuri* cu preț per monedă și opțiuni de configurare; prețul afișat și cel facturat pot diverge prin configurare. Blipmade are o funcție unică de calcul (`priceConfiguration`) folosită de catalog, cotă și comandă | `api/src/services/pricing.ts:86-113,152-180`; `PRICE-02`, `PRICE-05` → `VERIFIED FIXED`; `web/tests/pricing-contract.test.ts` |
| 2 | **Disponibilitatea derivată din realitate, nu dintr-un flag** | `deployable` a fost un flag liber, acum e derivat: produs fără ou ⇒ `TEMPORARILY_UNAVAILABLE`, `orderable:false`, cotă **400**, comandă **400** | `AVAIL-01` → `VERIFIED FIXED`; `api/src/services/availability.ts`; `api/tests/catalog-availability.test.ts:116-187` |
| 3 | **Compensare pe provisionare eșuată + idempotență** | Paymenter nu livrează servere, deci nu are această problemă; în hostingul cu adevărat, e un diferențiator de încredere | `api/src/services/provisioning.ts:477-500` (`BE-02`), `api/src/services/starter-apps.ts:112-118` |
| 4 | **Numerotare atomică a documentelor** | Paymenter are numerotare de facturi, dar Blipmade a fost reparat explicit la contor atomic cu `FOR UPDATE` | `api/src/services/order-numbers.ts:47-98,104`; `BE-14` → `VERIFIED FIXED`; `FIN-P2-01` închis |
| 5 | **Rezervarea atomică a campaniei, cu eliberare la abandon** | Mecanism de promoție cu blocaj pe rând și expirare la 48h — testat concurent | `api/src/services/pricing.ts:273-340`; `FIN-T10`: 15 rezervări concurente ⇒ 2 acceptate, 13 respinse |

A mai sunt două avantaje **de produs**, nu de cod:

- **Blipmade este *headless*.** Interfața e a Blipmade; panoul Pterodactyl e doar backend. Paymenter face bridge către panoul existent, deci utilizatorul final vede interfața Paymenter + extensia, nu un produs unitar.
- **Instalare pe un host, patru mașini** — control plane (VM 103), panou (100), nod (101), edge (102). Paymenter self-hosted e un stack LAMP/LEMP pe o mașină.

---

## 6. Constatări

Severitatea este **comercială**: cât de mult blochează funcția lipsă o vânzare sau o operațiune în starea curentă.
`Efort` = S (≤1 zi) / M (≤1 săptămână) / L (>1 săptămână, sau necesită decizie de operator).
`Dependență` = ce blochează executia în afara codului.

| ID | Titlu | Severitate | Consecință comercială | Dovezi | Acțiune recomandată | Efort | Dependență |
|---|---|---|---|---|---|---|---|
| **PAR-P1-01** | **Facturile nu sunt vizibile de client după plată** | **P0 / Critical** | Blochează **orice client de business** și orice client care cere factură. În UE, o firmă fără factură nu plătește. E o condiție de plată, nu o funcție secundară | `FN-P1-26`, `FN-P1-03`; `FUNCTIONAL-COVERAGE.md:221` (B18 = PW) | Să se emită și să se afișeze o factură proprie (număr, perioadă, total, TVA) după plată; înlocuirea linkului Stripe cu o pagină proprie | M | Stripe activ (cheie + webhook) |
| **PAR-P1-02** | **Nu există TVA / taxă configurabilă** | **P0 / Critical** | Factura nu poate fi deductibilă; nu se poate vinde „cu TVA inclus" pe piață UE. Blochează facturarea B2B și e risc de conformitate fiscală | `api/src/services/stripe.ts:438-460` (`tax ?? 0`); `api/src/services/billing.ts:642,944` (`tax: 0`); Paymenter are `app/Models/TaxRate.php` + `TaxRateResource` | Model `TaxRate` + `Tax` pe factură + etichetă pe total; valoare implicită **0** până când operatorul o configurează | M | Decizie de operator: rată, bază (net/TVA-inclus), tratament pentru clienți B2B |
| **PAR-P1-03** | **Checkout-ul este oprit: nu se poate vinde nimic** | **P0 / Critical** | Zero venit. Fiecare zi cu `PAYMENTS_ENABLED=false` e o zi de vânzare pierdută | `OPS-05` → `STILL BROKEN`; `api/src/services/stripe.ts:194-197`; `docs/PRODUCTION_READINESS.md:83`; `PORT-07` → `STILL BROKEN` | Chei Stripe (test → live), `PAYMENTS_ENABLED=true`, webhook configurat, un checkout real de probă cu confirmarea facturii | S | **Operator**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |
| **PAR-P1-04** | **Produsul vândut nu conține aplicația** | **P0 / Critical** | Clientul plătește și primește un „Hello world" care răspunde 200 pe `/health`. Fiecare vânzare e un risc de rambursare și de reputație. Nu se poate vinde ceea ce nu se livrează | `OPS-01`/`PRICE-04` → `PARTIALLY FIXED`; `api/prisma/seed.ts:29-31,72-73,96-97,146-147,170-171` (`dockerImage: null`); `api/src/services/starter-apps.ts:53-91`; producție: `wordpress` are `eggId` NULL | Decizie per produs: imagine reală + comandă + health-check al **applicației**; apoi `POST /admin/infrastructure/sync` și maparea `eggId` | M | **Operator**: imagini Docker + mapare egg |
| **PAR-P1-05** | **Niciun e-mail nu ajunge la client** | **P0 / Critical** | Nu se trimit confirmări de cont, facturi, notificări de bilete sau de abonament. Supportul prin e-mail nu există. Orice flux care depinde de e-mail (resetare de parolă, verificare) e rupt în practică | `OPS-03` → `STILL BROKEN` (`SMTP_URL` unset, transport `file`); `OPS-06` (`/status` → „Support — Degraded"); `docs/PRODUCTION_READINESS.md:89` | Configurarea SMTP + transport `smtp` + un test de livrare end-to-end + supravegherea în `/status` | S | **Operator**: `SMTP_URL` |
| **PAR-P1-06** | **Nu există adresă publică pentru instanțe** | **P0 / Critical** | Produsul nu are adresă. Un server de joc fără adresă publică nu e un produs vandabil | `OPS-04` → `STILL BROKEN` (`DOMAIN_BASE` unset, `CADDY_ADMIN_URL`/`CADDY_ADMIN_TOKEN` unset ⇒ `api/src/services/gateway.ts:176-178` fals); `docs/PRODUCTION_READINESS.md:94` | Configurarea Caddy edge + `DOMAIN_BASE` + test de rutare a unui subdomeniu real | S | **Operator**: acces la edge (VM 102) + credențiale Caddy admin |
| **PAR-P1-07** | **Nicio localizare; interfața e în engleză, formatarea e `en-IE`** | **High** | Argument de vânzare direct pentru piața țintă: un client care nu vorbește engleză nu se înscrie. În plus, `en-IE` e **irlandeză** — formatarea banilor și a datelor e vizibil greșită pentru un client RO | `api/src/lib/money.ts:8` (`locale = 'en-IE'`); `web/src/lib/api.ts:164`; `web/src/app/Settings.tsx:62`; `web/src/app/instance/common.tsx:76,89`; Paymenter: `lang/` cu 24 localizări | i18n cu `ro` + `en`; `locale` din profil sau din `Accept-Language`; `Intl.NumberFormat` per locale | M | Decizie de operator: textele în română |
| **PAR-P1-08** | **Factura e un PDF Stripe, nu o factură Blipmade** | **High** | Factura Stripe nu are TVA, nu are datele fiscale ale emitentului și nu e în limba clientului. Nu e suficientă pentru contabilitatea unui client B2B | `api/prisma/schema.prisma:482` (`pdfUrl`); `api/src/services/billing.ts:769,790` (din `invoice_pdf` Stripe); `web/src/app/Billing.tsx:342-399` | Factură proprie (PDF generat server-side, cu TVA, număr fiscal, date emitent) | M | Depinde de PAR-P1-01 și PAR-P1-02 |
| **PAR-P1-09** | **Planul anual e cotat diferit de cel încasat** | **High** | Clientul vede un preț și plătește altul. E o problemă de încredere și de conformitate, nu de ergonomie | `FIN-P2-03`; `api/src/services/pricing.ts:422`; `api/src/routes/orders.ts:68` | Propagarea lui `period` din `POST /api/orders` în `buildQuote`/`priceItems` | S | — |
| **PAR-P1-10** | **Cantitatea e ignorată în cotă și onorată în comandă** | **High** | Prețul afișat ≠ prețul plătit. Dispute pe banii clientului | `FN-P1-14` | Propagarea lui `quantity` în `buildQuote` | S | — |
| **PAR-P1-11** | **O comandă anulată sau rambursată poate fi repusă în circuitul de plată** | **High** | Dublu taxare a clientului, cu comisioane și refund ulterior. Risc financiar direct | `FIN-P2-04`; `api/src/routes/orders.ts:160` | Acceptarea doar a stărilor `PENDING` și `INCOMPLETE` la checkout | S | — |
| **PAR-P1-12** | **Atașamentele la bilete nu ajung niciodată pe server** | **High** | Fiecare bilet de suport fără log se rezolvă prin refuz. E o pierdere directă de clienți plătitori | `FN-P1-02` (High); `web/src/app/TicketDetail.tsx:90,99-103`; `Attachment` = 0 rânduri (`FUNCTIONAL-COVERAGE.md:760`) | Upload real multipart + stocare + descărcare; `Attachment` trebuie să primească bytes | M | — |
| **PAR-P1-13** | **Nu există planuri gratuite sau de unică folosință; intervalele sunt doar lună/an** | **High** | Pierderea celor două instrumente de conversie cele mai ieftine: plan free (de probă) și pachet scurt (1 zi, 7 zile — **formatul standard** în hosting de joc). În plus, un client RO nu poate fi facturat în lei | `api/prisma/schema.prisma:214-217` (`enum BillingPeriod`), `:264-282` (`ProductPrice` fără tip de plan); Paymenter: `Plan.php` (Free / One Time / Recurring) + `Time Interval` (Days/Weeks/Months/Years) | `PlanType` în `ProductPrice` + extensia `BillingPeriod` la zile/săptămâni + un preț `ONE_TIME` | M | Decizie de operator: ce pachete se vând |
| **PAR-P1-14** | **Niciun API public pentru clienți** | **High** | Blipmade nu poate fi integrat: reseller, Discord bot, n8n, Zapier, monitorare externă. Un client care își automatizează infrastructura **nu poate** cu Blipmade | `grep -rn "openapi\|swagger" api/src web/src` → **0 potriviri**; niciun `ApiKey` în `schema.prisma`; Paymenter: 22 rute / 48 operații (`https://paymenter.org/openapi.json`) | Cheie API + un subset REST documentat (read: servicii, facturi, instanțe, bilete) | M | Depinde de stabilizarea contractului de preț |
| **PAR-P1-15** | **Stările de instanță nu reflectă realitatea containerului** | **High** | Clientul plătește un serviciu pe care nu îl poate folosi, fără niciun semnal. Bilete, refund, reputație | `PROV-05` → `STILL BROKEN`; `api/src/routes/instances.ts:149`; `grep -rn "DEGRADED" api/src/` → **0 potriviri** | Citirea stării din panou la fiecare încărcare a paginii de instanță, cu mapare explicită `online→ONLINE` / `offline→DEGRADED` | M | Acces la panoul Pterodactyl |
| **PAR-P1-16** | **Nu există backup programat și nicio copie în afara hostului** | **High** | Pierderea unui disc pierde platforma; pierderea hostului pierde toate datele clienților și secretele (`SESSION_SECRET` e ireversibil). Pentru un client care plătește lunar, e o condiție de încredere | `DR-02`/`INF-01`/`INF-02`; `PREVIOUS-FINDINGS-REVALIDATION.md:602-629`; `docs/PRODUCTION_READINESS.md:102` | Programarea timerului + `OFFSITE_TARGET`/`OFFSITE_ENCRYPTION_KEY` + instalarea lui `rclone` + drill de restaurare | S | **Operator**: instalare pe VM 103, `rclone`, decizie RAID 1 pe `/` |
| **PAR-P1-17** | **Nu există 2FA** | **Medium** | Platforma deține token-uri de panou Pterodactyl și cheie Stripe. Absența 2FA e o slăbiciune de credibilitate la clienți corporate, deși nu blochează vânzarea | `grep -rniE "totp\|2fa\|twoFactor" api/src web/src api/prisma/schema.prisma` → **0 potriviri**; Paymenter: `app/Livewire/Components/Tfa.php` | TOTP cu `otplib`, cheie de recuperare, obligatoriu pentru rolul ADMIN | M | — |
| **PAR-P1-18** | **Nu există login social (Discord / GitHub / Google)** | **Medium** | În gaming, login-ul cu Discord e așteptat; absența lui e un inhibitor de conversie pe telefon. Paymenter îl are documentat pas-cu-pas | `grep -ni "oauth\|discord\|social" api/src/routes/auth.ts` → **0 potriviri**; Paymenter: `/docs/guides/OAuth` | OAuth2 ca furnizor (client_id/secret per provider) | M | — |
| **PAR-P1-19** | **Imposibilitatea de a limita un produs per client** | **Medium** | Un client poate cumpăra oricâte servere; când nodul se umple, nu există o regulă de afișare a limitei | `maxPerUser` există doar pe `Promotion` (`schema.prisma:537`), nu pe `Product` | Câmp `perUserLimit` pe `Product`, aplicat în `buildQuote` | S | — |
| **PAR-P1-20** | **O promoție nu poate fi limitată la anumite produse** | **Medium** | Nu se poate lansa „reducere 20% doar la Minecraft" — exact campania de conversie pe produs nou | `Promotion` n-are relație cu `Product` (`schema.prisma:530-556`); Paymenter: `app/Models/CouponProduct.php` + migrare `2025_09_20_185200_add_applies_to_to_coupons.php` | Tabel de joncțiune promoție↔produs | S | — |
| **PAR-P1-21** | **Programul de afiliați nu există** | **Medium** | Nu blochează o vânzare, dar închide canalul de creștere cel mai ieftin pentru o platformă nouă. La 20% comision, e un instrument de vânzare, nu un extra | Paymenter: `extensions/Others/Affiliates` (bundled) + API `Affiliates`; Blipmade: 0 modele | Model `Affiliate` + `AffiliateOrder` + atribuire la comandă plătită | M | — |
| **PAR-P1-22** | **Verificarea sumei se dezactivează când furnizorul nu trimite suma** | **Medium** | O livrare fără sumă trece nevalidată — pierdere financiară posibilă | `BE-09` → `STILL BROKEN`; `api/src/routes/webhooks.ts:303-304` | Refuzarea livrării fără sumă, în loc de a o accepta | S | — |
| **PAR-P1-23** | **Contorul de redeem-uri afișat în admin nu e contorul care impune plafonul** | **Medium** | Operatorul vede un număr greșit și nu-și dă seama câte locuri mai are la o campanie | `FN-P1-05`; `api/src/services/pricing.ts:309-325` vs. `Promotion.usedCount` (`schema.prisma:535`) | Afișarea contorului din `PromotionRedemption`; eliminarea lui `usedCount` din toate calculele | S | — |
| **PAR-P1-24** | **Rambursarea din admin eșuează întotdeauna** | **Medium** | Rambursarea nu e posibilă cât timp Stripe nu e pornit; după pornire, funcționează (ruta există) | `FN-P1-10`; `ADM-06` → `VERIFIED FIXED` (ruta există, `api/src/routes/admin.ts:408`); `web/src/admin/Orders.tsx` | E defect al mediului, nu al codului — se rezolvă odată cu PAR-P1-03 | S | Stripe activ |
| **PAR-P1-25** | **Joburile eșuate din coadă sunt șterse, nu păstrate** | **Medium** | Pierderea diagnosticului și lipsa reluării automate | `BE-07`/`PROV-03` → `STILL BROKEN`; `api/src/worker.ts:123` → `queue.clean(0, 1000, 'failed')` | TTL explicit pe joburile `failed` + sweep de retenție pornit | S | — |
| **PAR-P1-26** | **Bucle ale workerului înghit erorile** | **Medium** | Reconcilierea eșuată dispare fără urmă; divergența facturilor locale față de Stripe poate persista nedetectată | `BE-08` → `STILL BROKEN`; `api/src/worker.ts:135` | Logare cu nivel + contor de eșec în `/health` | S | — |
| **PAR-P1-27** | **Nu există paginare în listele administrative** | **Medium** | Peste 200 clienți, adminul nu vede tot — și crește după lansare | `ADM-09`/`ADM-12` → `PARTIALLY FIXED`; `api/src/routes/admin.ts:490,984` | Paginare cu `limit`/`offset` pe listele plafonate | M | — |
| **PAR-P1-28** | **`GET /admin/money` e un stub cu valoare fixă** | **Medium** | Operatorul nu poate săra peste MRR real, deci nu poate decide prețuri — exact deciziile `PORT-01`/`PORT-02` | `FN-P1-11` | Calcul real din `Invoice`/`Subscription` pe perioadă | M | — |
| **PAR-P1-29** | **Rolul `ADMIN` ocolește toate cele 21 de permisiuni** | **Medium** | „Least privilege" nu se aplică la nivelul maxim; combinat cu `SEC-16` (endpointurile interne răspund 200 la eșecul de autorizare), e o zonă de expunere | `FN-P1-28`; `api/src/lib/permissions.ts:39-42`; `REGR-01` (export de clienți prin `GET /admin/settings`) | Tratarea lui `ADMIN` ca superutilizator explicit, cu excepții denumerate; filtrarea răspunsului de setări | M | — |
| **PAR-P1-30** | **Nu există motiv de anulare și nici credit de cont** | **Medium** | Nu se poate măsura *de ce* clienții pleacă, și nu se poate credita un client pentru un incident | `grep -i "cancellationReason\|cancellation_reason"` → **0 potriviri**; `grep -rn "credit" api/src` → 2 comentarii; Paymenter: `ServiceCancellation.php`, `Credit.php` | `CancellationReason` pe instanță + model `Credit` cu operații | M | — |
| **PAR-P1-31** | **Nu există pagina de metrici a instanței** | **Medium** | Clientul nu vede consumul de resurse — iar resursele sunt *motivul* subscrierii | `FN-P1-04`; `GET /instances/:id/metrics` fără apelant; dar `/docs` promite „Check the metrics" | Tab de metrici cu consumul real și istoricul | M | — |
| **PAR-P1-32** | **Nu există planuri gratuite/de probă, deci nici conversie fără card** | **Medium** | Fără plan free nu există prag de intrare: un vizitator care nu vrea să plătească nu are nicio treaptă | `enum SubscriptionStatus` conține `TRIALING` (`schema.prisma:416`) dar nu există logică de perioadă de probă; Paymenter: `119472-product-trials` (extindere) | Un plan `FREE` sau o perioadă de probă de N zile, legată de perioada de facturare | M | Decizie de operator (dacă un trial costă bani, el costă și resurse) |
| **PAR-P1-33** | **Blog și pagini de marketing real** | **Low / Info** | Fără blog, fără organic search, fără conținut care răspunde întrebărilor „cum configurez un server Minecraft" — dar nu blochează vânzarea | `web/src/pages/Docs.tsx` (30 pagini) există; `home/Platform.tsx` e un **mock** (`A14`, `FN-P1-22`) | Un blog real, cu pagini de produs generate din catalog | M | — |
| **PAR-P1-34** | **Nu există temă, extensie, CLI de platformă sau punct de extensie** | **Low / Info** | Nu e o problemă azi: fiecare funcție nouă se scrie în nucleu. Devine o problemă când echipa crește sau când cineva vrea să adauge un gateway | Paymenter: `app:extension:create`, trei tipuri de extensie, hookuri de lifecycle; Blipmade: cod monolit | Nu se face acum. Se documentează ca **decizie arhitecturală** | — | — |

---

## 7. Ce nu am putut verifica

Această secțiune separă explicit **„produsul nu are asta"** de **„nu am găsit dovezi pentru asta"**.
Niciun rând marcat „neverificat" în tabele **nu** trebuie citit ca o lacună a produsului.

### 7.1 Despre Paymenter

| Ce | De ce nu s-a putut verifica | Ce am făcut în schimb |
|---|---|---|
| Comportamentul efectiv al interfeței de admin Paymenter | Nu am creat cont și nu am folosit `demo.paymenter.org` (n-ar fi relevant: instanța demo e goală, iar instalarea locală a unui stack Laravel+MariaDB nu intră în bugetul fazei) | Am citit **codul sursă oficial** (repo-ul public) și **documentația oficială** |
| Funcționarea extensiei `Pterodactyl` la runtime | Extensiile rulează pe o instalare Paymenter + o instanță Pterodactyl; nu am montat asta | Am citit `extensions/Servers/Pterodactyl` din repo-ul oficial și pagina de documentație `/docs/extensions/pterodactyl` |
| Prețul hostingului gestionat `paas.paymenter.org` | Pagina nu apare în sitemap ca documentație; n-am extras-o un tarif din surse neoficiale | Am raportat doar existența serviciului, menționată în ghidul de instalare oficial |
| Extensiile de marketplace (sute) | Nu le-am citit pe toate; am folosit **numele lor din marketplace**, care e o sursă oficială de catalog | Citite: `knowledgebase`, `blogs-for-paymenter`, `product-trials`, `dunning`, `advance-renewal`, `coupon-engine`, `gift-cards`, `112179`, `waitlist`, `google-analytics`, `manual-bank-transfer-payment-gateway`, `socialproof`, `reviews-plus`, `lost-cart-mails`, `term-acceptance`, `discord-notifications`, extensiile de server (`Proxmox`, `Datalix`, `Hetzner`, `Linode`) |
| Conținutul paginilor individuale ale marketplace-ului | Fiecare e o pagină de produs cu descrierea vânzătorului | Am folosit **numele** ca indice de existență, nu descrierea lor |
| Statutul exact al fiecărei extensii de marketplace | Marketplace-ul are versiuni, prețuri și data actualizării; n-am intrat în fiecare | Sunt enumerate în §7.1 ca **existență în catalog**, nu ca funcționalitate verificată |
| Serverele Paymenter / Plesk / DirectAdmin / Enhance / Virtfusion / Virtualizor | Niciunul nu e relevant pentru găzduire de joc; documentația lor există însă | Citite: paginile de documentație ale fiecăruia din arbore |
| Dacă `demo.paymenter.org` e sincronizat cu `master` | Nu am comparat | Nu am folosit demo-ul |

### 7.2 Despre Blipmade

| Ce | De ce nu s-a putut verifica | Ce am făcut în schimb |
|---|---|---|
| **Starea live a checkout-ului** | Nu am vizitat `blipmade.com` și nu m-am autentificat. Starea e luată din `.env` și din cod | `OPS-05` → `STILL BROKEN` |
| **Starea live a catalogului** | Idem | `OPS-01`/`PRICE-04`, `PLP-01` → `wordpress` are `eggId` NULL în producție |
| **Comportamentul real al funcțiilor de instanță** | Nu am atins panoul Pterodactyl (ca să nu se creeze instanțe reale) | `FN-P1-23` — 8 funcții marcate `PW` (parțial conectate), dependente de panou |
| **Dacă backup-ul programat e activ** | E o decizie de operator; unitățile systemd nu erau instalate la momentul verificării | `DR-02`/`INF-01`/`INF-02` |
| **Starea reală a cheii Stripe** | `STRIPE_SECRET_KEY` unset | `OPS-05`; calea de plată reală n-a putut fi exercitată (s-a folosit poarta locală de test) |
| **Comportamentul interfeței în browser** | Nu am rulat sweep-uri de browser (e instrumentul fazei 1) | M-am bazat pe clasele de acoperire din `FUNCTIONAL-COVERAGE.md` |
| **Starea reală a resurselor nodului** | Nu am acces la panou | `PROV-09`, `CAP-*` rămân `NOT VERIFIED` |
| **SEO, indexare, `robots.txt`** | `MKT-01`, `MKT-04` → `NOT VERIFIED`; adresa publică nu a fost vizitată | Nu se afirmă nicio lacună de SEO |

### 7.3 Despre însăși metoda de paritate

- **Corespondența funcție-by-funcție nu e perfectă.** Paymenter e o platformă de facturare
  generică; Blipmade e specializată. Am inclus rânduri din Paymenter care **nu au sens** pentru
  Blipmade (de exemplu „DirectAdmin") — de dragul de a arăta explicit că e o **decizie de
  scope**, nu o lacună.
- **„Prezent" înseamnă „utilizabil de un client"**, nu „există un cod". Un backend fără UI
  (de exemplu `/billing/payment-state`) e **parțial**, pentru că nu e accesibil clientului.
- **Severitățile sunt comerciale**, nu tehnice. `PAR-P1-16` (backup) e High pentru că
  condiționează încrederea unui client care plătește lunar, deși e o problemă de infrastructură.
- **Nu am măsurat** cât de mult efort ar cere fiecare funcție în arhitectura **Blipmade**.
  Estimările de efort sunt orientative.

---

## 8. Gapurile care blochează un GO comercial

În ordine strictă. Un GO comercial cere ca **toate** P0-urile de mai jos să fie închise.

| # | Gap | De ce blochează | Ce trebuie întâmplat | Dependență |
|---|---|---|---|---|
| 1 | **PAR-P1-03 — checkout oprit** | Fără plată nu există venit. Zero venit | Chei Stripe + `PAYMENTS_ENABLED=true` + webhook + un checkout real de probă | **Operator** |
| 2 | **PAR-P1-04 — produsul vândut nu e produsul** | Nu se poate vinde ceea ce nu se livrează; risc de rambursare și de reputație | Imagine reală per produs + comandă + health-check al aplicației + mapare `eggId` | **Operator** (imagini + ou) |
| 3 | **PAR-P1-06 — fără adresă publică** | Server de joc fără adresă = produs inexistent | Caddy edge + `DOMAIN_BASE` + test de rutare | **Operator** (edge, VM 102) |
| 4 | **PAR-P1-01 — facturi invizibile după plată** | Blochează clienții de business și orice client care cere factură | Factură proprie, emisă și afișată după plată | Stripe activ (dep. de #1) |
| 5 | **PAR-P1-02 — fără TVA** | Factura nu e deductibilă; nu se poate vinde „cu TVA inclus" | Model `TaxRate` + TVA pe factură | **Decizie de operator** (rată, bază) |
| 6 | **PAR-P1-05 — niciun e-mail** | Nimic nu ajunge la client: cont, factură, bilet, abonament | `SMTP_URL` + transport `smtp` + test de livrare | **Operator** |
| 7 | **PAR-P1-16 — fără backup în afara hostului** | Un client care plătește lunar are dreptul la recuperare; `SESSION_SECRET` e ireversibil | Timer + `OFFSITE_*` + `rclone` + drill | **Operator** |
| 8 | **PAR-P1-09 — plan anual ≠ sumă încasată** | Se vinde un preț și se încasează altul | Propagarea lui `period` | — |
| 9 | **PAR-P1-11 — comandă anulată poate fi repusă în plată** | Dublu taxare | Gardă de stări la checkout | — |
| 10 | **PAR-P1-15 — stările de instanță nu reflectă realitatea** | Client plătește și nu poate folosi | Resincronizare cu panoul | Acces la panou |

**Observație de sinteză.** Șase din cele zece sunt **dependințe de operator**, nu de cod.
Partea de cod (raportată aici ca diferențe față de Paymenter) este deja în mare parte în
rundă — contractul de preț, disponibilitatea, numerotarea atomică, rezervarea de campanie,
compensarea pe provisionare. **Blipmade nu are o problemă de funcționalitate; are o problemă de
pornire.** Cele șase dependințe de operator sunt, în esență, un checklist de lansare, nu un
backlog de dezvoltare.

### 8.1 Ce **nu** blochează GO (dar e adesea temă de echipă)

| Funcție lipsă | De ce nu blochează |
|---|---|
| Afiliere | Nu blochează o vânzare; blochează creșterea |
| Blog / SEO | Nu blochează o vânzare; blochează vânzarea organică |
| 2FA | Nu blochează o vânzare; e o cerință de conformitate pentru clienți corporate |
| Multi-monedă | Blipmade vinde în EUR; clienții își pot plăti în EUR |
| Temă / extensii / CLI | Nu blochează o vânzare; e o decizie arhitecturală |
| Credit de cont, motiv de anulare | Nu blochează o vânzare; blochează măsurarea churn-ului |
| Planuri gratuite | Nu blochează o vânzare **dacă** există un plan de intrare foarte ieftin (1,49 €/lună există) |
| Ticket-uri prin e-mail (IMAP) | Nu blochează o vânzare; e confort pentru client |

---

## 9. Sumar într-un rând pe domeniu

| Domeniu | Starea de paritate | Liniștea comercială |
|---|---|---|
| D1 Produse și catalog | **apropiat** | lipsesc stoc, limită per client, cantitate corectă |
| D2 Prețuri și perioade | **deficit** | lipsesc tipuri de plan, intervale scurte, monedă; **planul anual e rupt** |
| D3 Comenzi și checkout | **blocat** | **plățile sunt oprite**; coș și checkout oaspete lipsesc |
| D4 Facturare și taxe | **deficit critic** | facturi invizibile, TVA absent, factură = PDF Stripe |
| D5 Abonamente și ciclu de viață | **apropiat** | credit la degradare și stări realiste lipsesc |
| D6 Metode de plată | **deficit** | un singur furnizor, neactivat; **nicio metodă alternativă** |
| D7 Cupoane și promoții | **apropiat** | contorul afișat e greșit; promoția nu se limitează la produse |
| D8 Suport | **critic** | **e-mailul nu merge**; atașamentele nu ajung; permisiuni neaplicate |
| D9 Personal și operațiuni | **bun**, cu decalaje | export de clienți în `GET /admin/settings`; MRR e stub |
| D10 Self-service | **bun** | facturi, metrici și 2FA lipsesc |
| D11 Automatizare | **cel mai bun domeniu** | provisionare reală, compensare, reținere; stările nu reflectă realitatea |
| D12 Extensii de serviciu | **specializat, corect** | doar Pterodactyl — corect pentru scope |
| D13 E-mail și notificări | **critic** | **nimic nu ajunge** |
| D14 Theming și localizare | **deficit** | **nicio localizare; `en-IE` codificat** |
| D15 Multi-monedă | **deficit** | EUR unic, consecvent |
| D16 Afiliere | **absent** | nu blochează |
| D17 Anunțuri și blog | **absent** | nu blochează |
| D18 API și evenimente | **absent** | blochează integrarea, nu vânzarea directă |
| D19 Marketplace | **absent, corect** | corect pentru o platformă de dimensiunea asta |

**Concluzia de o linie:** Blipmade nu e în urmă față de Paymenter pe *funcționalitate de
găzduire* — e **înainte** pe contractul de preț, pe disponibilitatea derivată din realitate, pe
numerotare și pe compensare. E în urmă pe *funcționalitate de facturare* (factură, taxă,
multi-monedă, coș, API) — exact domeniile în care Paymenter a fost construit ca produs
principal. **Și e blocată de operator** pe șase dependințe care țin de chei, imagini, adresă
publică, e-mail și backup, nu de cod.
