# Roadmap de funcționalități lipsă — Blipmade

**Faza:** 10 (matrice de funcționalități lipsă și roadmap), audit post-remediere
**Data:** 23–24 octombrie 2026
**Autor:** agent de audit (rol `Worker`), fără modificări asupra codului sursă
**Stare:** document viu — scris incremental, secțiune cu secțiune

---

## 1. Antet

### 1.1 Ce a stat la baza acestui roadmap

Acest document **nu inventariază** funcționalități. Inventarul există deja și a fost citit integral:

| Document-sursă | Ce am luat din el |
|---|---|
| `FUNCTIONAL-COVERAGE.md` | **Baza.** 934 de linii: 35 rute front-end, 151 endpoint-uri back-end, 30 modele Prisma, 21 permisiuni, 12 taburi de instanță, 14 rânduri de admin, 29 endpoint-uri fără apelant, 34 constatări `FN-P1-*`. Clasele de acoperire (F/B/I/BA/D/S/MP/PW/M) sunt sursa pentru coloana „Stare" |
| `PAYMENTER-FEATURE-PARITY.md` | 19 tabele de paritate pe domenii (D1–D19), 34 constatări `PAR-P1-*`, lista celor 10 gapuri care blochează un GO comercial. Marcajele „prezent / parțial / absent / defect deschis" |
| `COMPETITIVE-GAP-ANALYSIS.md` | Poziționarea față de 9 concurenți (WHMCS, FOSSBilling, Paymenter, Railway, Render, Coolify, Shockbyte/Nodecraft, Aternos, piața RO), segmentarea S1/S2/S3, secțiunea „ce NU ar trebui să construiască" |
| `PREVIOUS-FINDINGS-REVALIDATION.md` | Cele 182 de constatări anterioare, **revalidate**: 38 `VERIFIED FIXED`, 14 `PARTIALLY FIXED`, 80 `STILL BROKEN`, 48 `NOT VERIFIED`, 2 `INVALID`. Verdictele, nu vechiul registru, sunt sursa de adevăr |
| `_raw/LEAD-VERIFICATIONS.md` | A doua opinie a lead-ului: `ADM-01` → **INVALID**, `ADM-02` → încă defect, `DR-02` → reparat **prin acțiune de operator, nu prin cod**, `FIN-P2-01` → **INVALID**, `FIN-P1-01` și `FIN-P2-03` → confirmate |
| `_raw/PRODUCTION-STATE-2026-10-24.md` | Starea reală a producției: variabilele de operator neîndeplinite, catalogul real (doar `discord-bot` este vândabil), prețurile existente, tabelele goale |
| `ADMIN-FUNCTIONALITY.md` | 8 constatări `ADM-P1/P2/P3-*`, secțiunea „Funcții care lipsesc" (5.1 backend fără UI, 5.2 lipsă din ambele) |
| `CUSTOMER-JOURNEYS.md`, `UI-UX-REVIEW.md` | Călătoria clientului și defectele de interfață observate |
| `PERFORMANCE-AND-RELIABILITY.md` | Măsurătorile de latență, bundle, fiabilitate și deciziile de infrastructură |
| `INFRASTRUCTURE-AND-RECOVERY.md` | 23 constatări `INFRA-P1-*`, RTO/RPO măsurate, conținutul real al arhivei de backup |
| `SECURITY-REVIEW.md` | 8 constatări `SEC-P1…P4-*`, inclusiv cookie fără `Secure` și DoS global pe autentificare |
| `FINANCIAL-INTEGRITY.md` | 7 constatări `FIN-P1/P2/P3-*` (două invalidate de lead) |
| `SESSIONS-INVESTIGATION.md` | 14 constatări `SESS-P1-*`, inclusiv regresia `X-Forwarded-For` |

### 1.2 Ce **nu** am putut verifica (limite declarate)

1. **Nu am vizitat `blipmade.com`, `10.77.0.13:3000` sau orice adresă public** al platformei. Nu m-am autentificat niciodată pe site-ul public și nu am creat conturi acolo.
2. **Nu am modificat codul sursă.** Am citit, comparat și planificat. Nu am aplicat niciun patch.
3. **Nu am trunchiat `blipmade_test`** — baza de date a stivei izolate este împărțită cu alți auditori.
4. **Nu am exercitat fluxul real Stripe** — nu există cheie. Doar poarta locală de test (`STRIPE_TEST_MODE=true`) a fost observată, de către alți agenți.
5. **Nu am atins panoul Pterodactyl** cu operații de scriere; prin urmare cele 8 funcții de instanță dependente de panou (`FN-P1-23`) rămân „parțial conectate" și nu „nefuncționale" — diferența contează în matrice.
6. **Nu am rulat suita de teste** a proiectului și nu am cit istoricul git (mirrorul nu conține `.git`).
7. **Nu am făcut măsurători proprii de latență sau de încărcare** — folosesc cifrele deja măsurate de `PERFORMANCE-AND-RELIABILITY.md`, pe care le tratez ca fiind ale altui agent, nu ale mele.

### 1.3 Convenția de marcaj

| Marcaj | Semnificație |
|---|---|
| **LIPSA** | Platforma **nu are** capacitatea. Nu există cod, sau există doar un stub explicit |
| **PARȚIAL** | Capacitatea **există și e legată**, dar nu funcționează complet, sau funcționează doar pe o parte (clasa `PW`/`MP` din `FUNCTIONAL-COVERAGE.md`, sau „parțial" din matricea de paritate) |
| **ANUNȚAT ȘI ABSENT** | Platforma **promite** capacitatea în interfață, în documentație sau în catalog, dar nu o livrează. Cea mai periculoasă dintre cele trei |
| **EXISTĂ ȘI FUNCȚIONEAZĂ** | Nu e un gap. Se raportează separat, în §3.4, ca să nu fie confundat cu o lipsă |

Severitatea (`P0 / Critical / High / Medium / Low-Info`) este **comercială**: cât de mult blochează capacitatea o vânzare sau o operațiune în starea curentă. Efortul (`S / M / L`) este orientativ: `S` ≤ 1 zi, `M` ≤ 1 săptămână, `L` > 1 săptămână **sau** necesită decizie de operator.

---

## 2. Metodă și standardul de dovadă

### 2.1 Regula de trasabilitate

Fiecare rând al matricei poartă **o singură sursă primară** de dovadă — un `file:line` din mirrorul `/root/blipmade-work` sau un ID de constatare dintr-un raport al acestei runde. Nu am creat constatări noi; am **recodificat** constatările existente pe o singură axă (domeniu → lipsă → de ce contează → stare → severitate → efort → dependență → doveză → ordine).

### 2.2 Trei reguli de decizie

1. **O funcție „fără ecran" nu e automat o lipsă.** `FUNCTIONAL-COVERAGE.md` a identificat 29 de endpoint-uri fără apelant în interfață. Dacă backend-ul e complet și funcțional, rândul intră în §3.4 („există și funcționează"), cu o singură excepție: dacă *clientul nu poate ajunge la ea*, atunci e `PARȚIAL`, fiindcă „prezent" înseamnă „utilizabil de un client" (convenția din `PAYMENTER-FEATURE-PARITY.md:501`).
2. **Un defect deschis nu e o funcționalitate lipsă**, dar **înseamnă** că o funcționalitate existentă nu poate fi vândută. Le țin separate în matrice prin coloana „Stare" (`PARȚIAL` pentru defectele care lasă funcția inutilizabilă).
3. **Verdictul lead-ului are prioritate** asupra verdictului agentului atunci când se contrazic. `ADM-01` (verificarea permisiunilor pe bilete) și `FIN-P2-01` (numerotarea facturilor cu `count()+1`) au fost **invalid** de lead și **nu apar** ca rânduri de gap în matrice.

### 2.3 Ce am inclus și ce am exclus din matrice

- **Am inclus**: capacități lipsă din `FUNCTIONAL-COVERAGE.md` (clasele `M`, `S`, `MP`, `PW` și `D` cu efect vizibil), din cele 34 de constatări `PAR-P1-*`, din constatările administrative deschise, din constatările de infrastructură și securitate care au efect asupra vânzării, și din secțiunile „funcții care lipsesc" ale auditului de admin.
- **Am exclus**: constatările **de verificat** (`NOT VERIFIED`) din revalidare — nu putem afirma că o capacitate lipsește dacă n-am putut-o măsura; le-am marcat în nota de sub-capitol, ca limite. Am exclus și constatările **invalide** (două).
- **Nu am inventat** prețuri, termene, angajamente sau funcții care n-au sursă în cele opt rapoarte.

---

## 3. Matricea funcționalităților lipsă

### 3.1 Cum se citește matricea

| Coloană | Semnificație |
|---|---|
| **ID** | Identificator stabil al rândului, în ordinea domeniilor (nu în ordinea priorității) |
| **Domeniu** | `IDN` identificare · `PRD` produs · `PRE` preț · `CMD` comandă · `FAC` factură · `ABN` abonament · `SUP` suport · `ADM` administrare · `AUT` automatizare · `OPR` operațiuni · `EXT` extindibilitate |
| **Ce lipsește** | Capacitatea concretă, formulată ca o singură propoziție verificabilă |
| **De ce contează** | Cine se blochează, în termeni de client concret — nu de funcție tehnică |
| **Stare** | `LIPSA` / `PARȚIAL` / `ANUNȚAT ȘI ABSENT` |
| **Severitate** | `P0` (blochează vânzarea) · `Critical` · `High` · `Medium` · `Low-Info` |
| **Efort** | `S` ≤ 1 zi · `M` ≤ 1 săptămână · `L` > 1 săptămână sau necesită decizie de operator |
| **Dependențe** | `cod` · `operator` · `terț` — sunt notate toate cele care se aplică |
| **Dovadă** | `file:line` sau ID de constatare dintr-un raport al acestei runde |
| **Ordine** | Poziția în roadmap (1 = se atacă primul) |

**Notă de severitate.** Un rând `P0` înseamnă „fără asta nu se poate vinde nimic sau nu se poate onora ce s-a vândut". Un rând `Critical` înseamnă „pierdere de bani sau de încredere măsurabilă". Un rând `High` înseamnă „închide o vânzare sau o operațiune". Un rând `Medium` înseamnă „îngreunează operarea sau pierde o conversie". `Low-Info` înseamnă „igienă și consistență" — nu blochează nimic, dar se acumulează.

---

### 3.2 Domeniul `IDN` — Identificare, autentificare și sesiuni

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-01 | IDN | Autentificare în doi factori (TOTP) pentru conturile de client, staff și admin | Platforma deține cheie Stripe și token-uri de panou Pterodactyl; un client corporate care plătește cu cardul companiei cere 2FA înainte de a semna | LIPSA | Medium | M | cod | `PAYMENTER-FEATURE-PARITY.md` D10; `COMPETITIVE-GAP-ANALYSIS.md` COMP-P1-17 | 106 |
| MF-02 | IDN | Login social (Discord / GitHub / Google) | În gaming, login-ul cu Discord e așteptat și e un inhibitor de conversie pe telefon; vizitatorul care nu are cont de e-mail nu intră | LIPSA | Medium | M | cod + terț | PAR D18; PAR-P1-18 | 107 |
| MF-03 | IDN | `TRUSTED_PROXIES` neconfigurat: cookie de sesiune emis **fără `Secure`**, iar limitarea per-adresă devine limitare **globală** (un atac de autentificare blchează toți clienții deodată) | Orice client se poate autentifica printr-o rețea atacată prin proxy, iar un atacator poate bloca autentificarea tuturor clienților simultan. E o slăbiciune de credibilitate și o vulnerabilitate de DoS, nu o funcție lipsă | PARȚIAL | Critical | S | operator | `SECURITY-REVIEW.md` SEC-P1-01, SEC-P1-02; `SESSIONS-INVESTIGATION.md` SESS-P1-04; `PRODUCTION-STATE` §1 | 40 |
| MF-04 | IDN | Algoritmul de rezolvare a adresei citește lanțul `X-Forwarded-For` de la stânga și poate fi falsificat | Adresa afișată în lista de sesiuni nu poate fi folosită ca dovadă; limitarea per-adresă poate fi ocolită cu un header falsificat | PARȚIAL | High | S | cod | SESS-P1-03 | 43 |
| MF-05 | IDN | Schimbarea adresei de e-mail nu încheie sesiunile | Clientul își schimbă e-mailul (de exemplu după compromiterea lui) și sesiunile vechi rămân active | PARȚIAL | Medium | S | cod | SESS-P1-06 | 108 |
| MF-06 | IDN | Cererea de închidere a contului nu încheie sesiunile, și nu există instrument de administrare care să le închidă | Clientul care renunță crede că și-a închis contul; operatorul nu are pârgie | PARȚIAL | Medium | S | cod | SESS-P1-07 | 109 |
| MF-07 | IDN | Cursă la rotirea cookie-ului: două semnări simultane cu același cookie produc două sesiuni | Clientul vede în lista de sesiuni un rând duplicat pe care nu îl poate identifica | PARȚIAL | High | S | cod | SESS-P1-08 | 101 |
| MF-08 | IDN | Lista de sesiuni este trunchiată la 50 de rânduri fără niciun indicator | Clientul cu mai mult de 50 de sesiuni nu vede că lista e incompletă | PARȚIAL | Medium | S | cod | SESS-P1-09 | 27 |
| MF-09 | IDN | Interfața nu poate deosebi două sesiuni cu aceleași metadate; valorile de 16×16 px sunt trunchiate la 80 de celule | Clientul nu poate decide pe care sesiune să o închidă, iar închiderea greșită lasă o sesiune deschisă | PARȚIAL | Medium | S | cod | SESS-P1-10; `UI-UX-REVIEW.md` UX-P1-03, UX-P1-04 | 28 |
| MF-10 | IDN | Nu există expirare glisantă: o sesiune activă expiră la 14 zile de la ultima *autentificare* | Un client care folosește platforma zilnic e deconectat fără avertisment | LIPSA | Low-Info | M | cod | SESS-P1-12 | 122 |
| MF-11 | IDN | Limitarea de autentificare numără și tentativele **reușite**, și mesajul de 429 nu spune nimic | Un client care se conectează corect de mai multe ori (CI, script, telefon) se blochează, fără explicație | PARȚIAL | High | S | cod | SESS-P1-05; ADM-P2-06; FN-P1-33 | 22 |
| MF-12 | IDN | Nicio localizare; `locale='en-IE'` (irlandeză) e codificat în `money.ts`, `api.ts`, `Settings.tsx`, `common.tsx`, `Overview.tsx`, `InstanceDetail.tsx` | Formatarea banilor și a datelor e vizibil greșită pentru un client din România, iar interfața exclusiv engleză pierde o parte din clienți pe o piață care include România | LIPSA | High | M | cod + operator (decizie: traducere) | PAR-P1-07; COMP-P1-06; `api/src/lib/money.ts:8` | 102 |
| MF-13 | IDN | Mecanismul de enrolare a primului administrator (`POST /auth/enroll-admin`) nu are ecran | La o instalare nouă, primul administrator trebuie creat din SQL sau din API cu cheie internă | PARȚIAL | Low-Info | S | cod | FN-P1-12; D09 | 123 |

---

### 3.3 Domeniul `PRD` — Produse și catalog

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-14 | PRD | **4 din 5 produse nu au nici imagine, nici ou** — nu pot fi provisionate; doar `discord-bot` este într-adevăr vândabil | Clientul care deschide catalogul vede 5 produse și poate comanda doar unul; celelalte patru sunt afișate ca vândabile | LIPSA | P0 | M (cod) + L (conținut) | operator + cod | `_raw/PRODUCTION-STATE-2026-10-24.md` §2; PAR-P1-04; OPS-01 | 1 |
| MF-15 | PRD | `wordpress` este marcat `deployable = true` în baza de date, dar nu are imagine și nu are ou | `wordpress` e produsul care apare pe pagina de start și în materialul de marketing. Marcajul din catalog **nu corespunde realității** — exact inversul promisiunii de onestitudine pe care platforma o revendică | ANUNȚAT ȘI ABSENT | P0 | S | operator + cod | PRODUCTION-STATE §2; OPS-01; PLP-01 | 2 |
| MF-16 | PRD | **Niciun produs de joc în catalog** (`enum Category` nu are categorie de jocuri; `grep -riE "minecraft\|game server"` → 0 potriviri) | Blipmade nu intră pe singura piață pentru care infrastructura lui e dimensionată. Nu e o funcție lipsă — e o **piață absentă** | LIPSA | P0 | M + L | operator + cod | COMP-P1-01; `api/prisma/seed.ts:55-171`; `schema.prisma:205-212` | 3 |
| MF-17 | PRD | Containerul provisionat primește o aplicație **generică** (`starter-apps.ts:53-91`), nu aplicația produsului vândut | Clientul plătește și primește un „Hello world" care răspunde 200 pe `/health`, nu WordPress. Fiecare vânzare devine un risc de rambursare | PARȚIAL | P0 | M | cod + operator | OPS-01; PAR-P1-04; `api/src/services/starter-apps.ts:53-91` | 4 |
| MF-18 | PRD | Configurația „recomandată" a cărții de prețuri nu poate fi setată niciodată: `defaultRam/defaultCpu/defaultDisk` sunt scrise o singură dată, egale cu minimul, și `PATCH /admin/products` nu le acceptă | Configuratorul de deploy oferă un singur preset, identic cu minimul; pagina de produs nu afișează niciodată rândul despre configurația recomandată. Pierdere directă de conversie: clientul nu vede ce i se recomandă | PARȚIAL | High | S | cod | FN-P1-01; FN-P1-15; F04; `admin.ts:612-614,636-651`; `pricing.ts:88-113` | 9 |
| MF-19 | PRD | Un produs nou creat prin administrare pornește cu preț `0` | O eroare de operator devine o vânzare gratuită, cu factură de 0 și venit numărat | ANUNȚAT ȘI ABSENT | High | S | cod | COMM-10 | 10 |
| MF-20 | PRD | Limită per utilizator per produs (`maxPerUser` există doar pe `Promotion`) | Un client poate cumpăra oricâte servere; când nodul se umple, nu există o regulă de afișare a limitei | LIPSA | Medium | S | cod | PAR-P1-19; D1 | 110 |
| MF-21 | PRD | Stoc / inventory per produs | Nu se poate vinde un plan cu „max 10 servere disponibile" — limita reală e doar cea a nodului, necunoscută clientului | LIPSA | Medium | S | cod | PAR D1; `schema.prisma:219-263` | 111 |
| MF-22 | PRD | `deployable` și `eggId` sunt expuse în răspunsul **public** al catalogului | Nu blochează vânzarea, dar dă informație de arhitectură concurenților și confirmă public că produsele nu sunt livrabile | PARȚIAL | Low-Info | S | cod | ADM-14; `api/src/routes/catalog.ts:54-55,88-89` | 35 |
| MF-23 | PRD | Un produs „Coming soon" fără ou primește **două** mesaje de blocaj | Clientul vede două explicații contradictorii pentru aceeași situație | PARȚIAL | Low-Info | S | cod | FN-P1-34 | 36 |
| MF-24 | PRD | Mesajul de blocaj e inexact pentru un produs care nu are niciodată imagine | Clientul primește un motiv greșit pentru un produs pe care nu-l poate cumpăra | PARȚIAL | Low-Info | S | cod | FN-P1-18 | 37 |

---

### 3.4 Domeniul `PRE` — Preț și perioade de facturare

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-25 | PRE | **Există două drumuri de cotare cu semantică diferită**: `POST /billing/quote` onorează `period`, `POST /api/orders` nu acceptă perioadă și cotizează mereu lunar; `stripe.ts:214` fixează `interval: 'month'` | Clientul care cotă un plan anual primește 1890 și, la comandă, e taxat 189. **Suma cotată nu e suma încasată** — exact inversul promisiunii contractului de preț. *În producție impactul e latent, nu activ: nu există niciun rând de preț `ANNUAL`, deci `POST /billing/quote` cu `period:'ANNUAL'` eșuează curat. Devine pierdere de bani în clipa în care se adaugă un preț anual* | PARȚIAL | High | S | cod | FIN-P2-03 (confirmat de lead, V6); PAR-P1-09; `pricing.ts:422`; `orders.ts:71`; PRODUCTION-STATE §2.1 | 11 |
| MF-26 | PRE | `quantity` e **ignorată în cotă** și **onorată în comandă** | Clientul vede un preț și plătește altul. Dispute pe banii clientului | PARȚIAL | High | S | cod | FN-P1-14; PAR-P1-10 | 12 |
| MF-27 | PRE | Nu există niciun rând de preț `ANNUAL` în producție | Clientul care întreabă „cât costă un an?" primește „nu avem". Anul e așteptat în hosting cu abonament | LIPSA | Medium | S | operator | PRODUCTION-STATE §2 | 112 |
| MF-28 | PRE | Tipuri de plan: `ProductPrice` are doar `period` + sume; nu există Free / One Time / Recurring | Se pierd cele două instrumente de conversie cele mai ieftine: planul de probă și pachetul de unică folosință | LIPSA | High | M | cod + operator (ce pachete se vând) | PAR-P1-13; `schema.prisma:264-282` | 103 |
| MF-29 | PRE | Intervalele de facturare sunt doar `MONTHLY` / `YEARLY` | Pentru jucători, pachetele scurte (1 zi, 7 zile) sunt **formatul standard** al pieței. Nu se poate vinde un server de weekend | LIPSA | High | M | cod | PAR-P1-13; PAR D2; `schema.prisma:214-217` | 104 |
| MF-30 | PRE | Multi-monedă: `ProductPrice.currency` e un câmp de etichetă cu o singură valoare folosită; `DEFAULT_CURRENCY='EUR'` unic; nu există model `Currency` | Clientul din afara zonei EUR plătește în EUR și suportă costul de conversie. *(Decizie de scope: piața țintă tranzacționează în EUR — vezi §6, „do not build")* | LIPSA | Medium | M | cod | PAR D15; `api/src/lib/money.ts:6` | 113 |
| MF-31 | PRE | Taxă de setup (fee de unică folosință) | Modelul de preț e rigid: plata = abonament. Nu se poate taxa efortul de provisionare | LIPSA | Low-Info | S | cod | PAR D2 | 124 |
| MF-32 | PRE | Peste 6 GB RAM, prețul pierde față de un VPS (la 8 GB / 2 vCPU / 50 GB: **€7,39** calculat, față de un VPS de 8 GB / 4 vCPU la **€5,50**) | Clientul compară și pleacă. E un plafon de **portofoliu**, nu un defect de cod | ANUNȚAT ȘI ABSENT | High | S | operator (decizie de produs) | COMP-P1-09; `audit/08-competitive-analysis.md` §6.2 | 23 |

---

### 3.5 Domeniul `CMD` — Comandă și checkout

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-33 | CMD | **Plățile sunt oprite**: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY` goale | Zero venit. Fiecare zi cu platele oprite e o zi de vânzare pierdută, iar orice campanie de marketing produce comenzi eșuate, nu clienți | LIPSA | P0 | S | **operator** | PAR-P1-03; COMP-P1-02; OPS-05; `stripe.ts:194-197`; PRODUCTION-STATE §1 | 5 |
| MF-34 | CMD | Pagina de facturare **ignoră parametrul `checkout`** (0 apariții ale cuvântului în `Billing.tsx`); singurul mecanism care încheie plata locală (`POST /webhooks/stripe/test`) nu e apelat de nicio pagină | Clientul vine din Stripe pe o pagină de factură fără nicio explicație („plătit", „anulat", „în așteptare"). În producție, un checkout anulat (`?checkout=cancelled`) se întoarce tot pe aceeași pagină mută | ANUNȚAT ȘI ABSENT | High | S | cod | FN-P1-03; `web/src/app/Billing.tsx`; `web/src/app/Deploy.tsx:344-349`; `webhooks.ts:670-717` | 13 |
| MF-35 | CMD | Interfața nu consumă `GET /billing/payment-state` (`grep "payment-state" web/src` → 0); `Deploy.tsx:778` afișează „Checkout is not available" ca stare statică | Clientul primește un mesaj static în locul motivului real („plățile nu sunt configurate pe acest mediu"). Nu blochează vânzarea, dar ascunde de ce nu se poate plăti | PARȚIAL | Medium | S | cod | PAY-01; PAR D3 | 29 |
| MF-36 | CMD | Garda de checkout acceptă doar `PAID` și `FULFILLED`; o comandă `CANCELLED` sau `REFUNDED` trece și primește **o nouă sesiune de plată** | **Dublu taxare** a clientului, cu comisioane și refund ulterior. Risc financiar direct | PARȚIAL | Critical | S | cod | FIN-P1-01 (confirmat de lead, V5); PAR-P1-11; `api/src/routes/orders.ts:160`; `stripe.ts:279-306` | 8 |
| MF-37 | CMD | Butonul „Refund" din comenzile de admin eșuează întotdeauna cu 503 „Payments are not configured on this environment" | Rambursarea nu e posibilă cât timp Stripe nu e pornit. În faza de test n-ar conta; în faza comercială, da | PARȚIAL | Medium | S | operator (Stripe) | FN-P1-10; PAR-P1-24 | 17 |
| MF-38 | CMD | Coș și comandă cu mai multe produse (`grep -ri cart` → 0; nu există model `Cart`/`CartItem`) | Clientul trebuie să cumpere **un produs per comandă**. Pentru hobbyist e suficient; pentru un client cu 3 servere, e 3 fluxuri | LIPSA | Medium | M | cod | PAR D3 | 114 |
| MF-39 | CMD | Checkout oaspete (fără cont) | Există o frunză de conversie pierdută la fiecare vizitator: `/deploy/:slug` redirecționează anonimul la `/login?next=…` | LIPSA | Medium | M | cod | PAR D3; A11 | 115 |
| MF-40 | CMD | Anularea unei comenzi (`POST /orders/:id/cancel`) nu are niciun ecran | Clientul care a greșit produsul nu se poate corecta; operatorul nu are pârghie de anulare din interfață | PARȚIAL | Medium | S | cod | FN-P1-31; D20 | 30 |
| MF-41 | CMD | Comanda de upgrade e creată **înainte** de checkout (`instances.ts:298-302`); dacă `createCheckout` aruncă 503, comanda rămâne `PENDING` | Clientul vede comenzi orfane în istoricul lui și nu înțelege de ce | PARȚIAL | Medium | S | cod | PROV-08 | 31 |
| MF-42 | CMD | Upgrade-ul nu verifică capacitatea nodului (`services/upgrades.ts` — nicio referință la `nodeCapacity`) | Un upgrade acceptat poate eșua la provisionare pentru că nodul nu are resurse. Se termină în compensare — cost operațional și bilet | PARȚIAL | Medium | M | cod | PROV-09 | 32 |

---

### 3.6 Domeniul `FAC` — Facturare, facturi și taxe

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-43 | FAC | **Nu se poate vedea nicio factură după o plată**: rândul se creează, dar pagina de facturare nu îl afișează; `checkout` e ignorat | Clientul de business cere factură și nu o primește. În UE, o firmă fără factură refuză plata. Nu e o funcție „de lux" — e o **condiție de plată** | LIPSA | P0 | M | cod + operator (Stripe activ) | FN-P1-26; FN-P1-03; PAR-P1-01; B18 (`FUNCTIONAL-COVERAGE.md:221`) | 6 |
| MF-44 | FAC | **Nu există TVA / rată de taxă configurabilă**: `tax ?? 0` în `stripe.ts:438-460`, `tax: 0` literal în `billing.ts:642,944` | Factura nu poate fi deductibilă; nu se poate vinde „cu TVA inclus" pe piață UE. Pe piața RO, unde facturile se emit în lei cu TVA, e o condiție de plată, nu un detaliu | LIPSA | P0 | M | **operator** (rată, bază net/TVA-inclus, tratament B2B) + cod | PAR-P1-02; COMP-P1-07 | 7 |
| MF-45 | FAC | Factura e **PDF-ul Stripe** (`Invoice.pdfUrl` populat din payload-ul `invoice_pdf`), nu o factură Blipmade | Factura Stripe nu are TVA, nu are datele fiscale ale emitentului și nu e în limba clientului. La o tranzacție cu o firmă românească, e **neutilizabilă fiscal** | PARȚIAL | High | M | cod (depinde de MF-43, MF-44) | PAR-P1-08; `schema.prisma:482`; `billing.ts:769,790` | 14 |
| MF-46 | FAC | Verificarea sumei **se dezactivează** când furnizorul nu trimite suma (`if (typeof amountTotal !== 'number') return null`) | O livrare fără sumă trece nevalidată — pierdere financiară posibilă, pe exact traseul unde suma cotată și cea încasată pot diverge (MF-25) | PARȚIAL | High | S | cod | BE-09; PAR-P1-22; `api/src/routes/webhooks.ts:303-304` | 15 |
| MF-47 | FAC | Livrările concurente ale aceluiași eveniment de plată sunt procesate de două ori (`BE-03` — reparat parțial: prima livrare e mascată, a doua nu) | Fără plată dublă azi, dar cu **mascarea unei erori** în ledger — divergența dintre facturile locale și Stripe poate persista nedetectată | PARȚIAL | High | M | cod | BE-03; FIN-P2-02; revalidare §5.3, §7.4 | 16 |
| MF-48 | FAC | O comandă integral promoționată scrie un `Payment` cu `status='SUCCEEDED'` și `amount=0` — **se numără ca venit** | Contabilitate murdură: venit de 0 în raportul de MRR. Operatorul nu poate avea încredere în propria cifră de afaceri | PARȚIAL | Medium | S | cod | FIN-P2-06 | 18 |
| MF-49 | FAC | Credit de cont (sold pozitiv) — `grep -rn "credit" api/src` → 2 comentarii, zero model | Platforma nu poate credita un client (de exemplu, pentru un incident) și nu poate compensa un downgrade | LIPSA | Medium | M | cod | PAR-P1-30; PAR D4 | 116 |
| MF-50 | FAC | Motiv de anulare (`cancellationReason` — 0 potriviri) | Blipmade cere anularea, dar **nu întreabă de ce**. Pierde feedback-ul de calitate și nu poate raporta motivul de churn | LIPSA | Medium | M | cod | PAR-P1-30; PAR D5 | 117 |
| MF-51 | FAC | Contorul `Promotion.usedCount` se **dublează** la webhook-uri concurente (citit în afara tranzacției, `stripe.ts:288-295`) | Nu afectează plafonul (se numără din `PromotionRedemption`), dar indicatorul de business e greșit | PARȚIAL | Medium | S | cod | FIN-P2-05 | 57 |
| MF-52 | FAC | Snapshot de factură, tranzacții și note de ajustare | Fără istoric de ajustări, o corectare se face prin rambursare + refacere — proces care, la rândul lui, e defectat (MF-36) | LIPSA | Low-Info | M | cod | PAR D4 | 91 |
| MF-53 | FAC | Facturile nu au ecran propriu în admin; `POST /admin/invoices/:id/confirm-collection` (confirmarea unei încasări locale) nu e expusă în interfață | Operatorul nu poate marca o încasare manuală și nu are unde vedea facturile | PARȚIAL | Medium | S | cod | ADM §5.1; D05 | 58 |

---

### 3.7 Domeniul `ABN` — Abonament și ciclu de viață al serviciului

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-54 | ABN | **Pagina de metrici a instanței este promisă în documentație, dar nu există**: endpointul există și e legat, interfața nu îl expune | Clientul plătește un server și nu poate vedea niciodată consumul de CPU/RAM. Pentru un jucător, lipsa metricilor e motivul principal de a cere ajutor deși serverul merge bine | ANUNȚAT ȘI ABSENT | Medium | M | cod | FN-P1-04; PAR-P1-31; D18; `api/src/routes/instances.ts` (endpoint) | 33 |
| MF-55 | ABN | `currentPeriodEnd` rămâne `null` pentru un abonament activ, deși documentația afirmă „The period end tells you when the current period closes" | Clientul nu vede când se reînnoiește abonamentul. E o promisiune explicită, în documentația de produs, pe care interfața nu o onorează | ANUNȚAT ȘI ABSENT | High | S | cod | FN-P1-21; `FUNCTIONAL-COVERAGE.md` §6.1 | 24 |
| MF-56 | ABN | **Ștergerea reală a instanței la anulare e dezactivată implicit**: `auto_delete_cancelled_instances.enabled === true`, implicitul e `false` | Nu blochează vânzarea, dar e un **pericol GDPR** (dăți clienților reținute fără temei legală) și o creștere a costului de stocare | PARȚIAL | Medium | M | cod + operator (decizie de retenție) | COMM-08 (PARTIALLY FIXED); PAR D5; `billing.ts:482-530,281-289` | 59 |
| MF-57 | ABN | Credit la degradare: `services/upgrades.ts` nu creditează clientul fără abonament | Clientul plătește un serviciu care nu funcționează și **nu primește nimic înapoi** | LIPSA | Medium | M | cod | PROV-12; PAR-P1-30 | 60 |
| MF-58 | ABN | **Stările instanței nu reflectă realitatea containerului**: `instances.ts:149` scrie `RESTARTING` și nu resetează starea; `grep -rn "DEGRADED" api/src` → 0 potriviri | Clientul plătește un serviciu pe care nu îl poate folosi, **fără niciun semnal**. Consecință directă: bilet, refund, reputație | PARȚIAL | High | M | cod + operator (acces la panou) | PROV-05; PAR-P1-15; `api/src/routes/instances.ts:149` | 25 |

---

### 3.8 Domeniul `SUP` — Suport, bilete și e-mail

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-59 | SUP | **`SMTP_URL` gol**: transportul scrie în fișier (`mail.state=written-to-file`), `/health` raportează `mail: file, configured:false`, `/status` raportează „Support — Degraded" | Niciun e-mail nu pleacă: nici confirmare de cont, nici resetare de parolă, nici notificare de bilet, nici factură. **Suportul prin e-mail nu există deloc** | LIPSA | P0 | S | **operator** | PAR-P1-05; COMP-P1-11; OPS-03; `api/src/lib/mailer.ts`; PRODUCTION-STATE §1 | 20 |
| MF-60 | SUP | **Atașamentele de la bilete nu ajung niciodată pe server**: interfața trimite doar `{name,size,type}`; `Attachment` are **0 rânduri** în baza de date | În practică, un bilet de suport pentru un server de joc **conține un log**. Fără atașament, suportul se întoarce prin chat, iar fiecare bilet fără log devine un bilet rezolvat prin refuz | ANUNȚAT ȘI ABSENT | High | M | cod | FN-P1-02; PAR-P1-12; `web/src/app/TicketDetail.tsx:90,99-103`; `api/src/routes/tickets.ts:318-406` | 26 |
| MF-61 | SUP | Majoritatea mesajelor tranzacționale **ocolesc coada de e-mail** și trimit direct | E-mailul nu poate fi retry-at, monitorizat sau pus în coadă înaintea unui vârf de trafic | PARȚIAL | Medium | S | cod | FN-P1-07; E06 | 61 |
| MF-62 | SUP | Implementare **duplicată și moartă** a notificărilor de factură: `notifyInvoicePaid` / `notifyInvoiceFailed` / `notifySubscriptionChange` (`billing.ts:31-113`) nu sunt importate nicăieri | Există două implementări ale aceleiași funcții, dintre care una e moartă. Modificările se fac în cea greșită și nu se vede | PARȚIAL | Medium | S | cod | FN-P1-06; D30 | 62 |
| MF-63 | SUP | `GET /webhooks/stripe/failed` răspunde **HTTP 200** cu corp de eroare | Un monitor de sănătate sau un client care verifică codul HTTP consideră eșuatul o livrare reușită | PARȚIAL | Medium | S | cod | FN-P1-08; D25 | 19 |
| MF-64 | SUP | Raportul de livrare a e-mailului (`GET /admin/email/delivery`) nu are ecran | Operatorul nu vede starea, numărul de încercări și ultima clasă de eroare a fiecărui mesaj | PARȚIAL | Medium | S | cod | ADM §5.1; D06; `FUNCTIONAL-COVERAGE.md:760-764` | 34 |
| MF-65 | SUP | Nu există model de notificare **în aplicație** — doar preferințe de notificare | Clientul trebuie să deschidă e-mailul ca să afle că i-a răspuns cineva la bilet | LIPSA | Medium | M | cod | PAR D13; `schema.prisma:117` | 118 |
| MF-66 | SUP | Email piping (IMAP → bilet) | *(Decizie de scope: un operator, trei bilete — vezi §6)* | LIPSA | Low-Info | M | cod + operator | PAR D8 | 125 |

---

### 3.9 Domeniul `ADM` — Administrare, roluri și operațiuni interne

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-67 | ADM | `pterodactylUserId` este completat la provisionare, dar **întors mereu `null`** în răspunsul API | Operatorul nu poate lega un client de contul său din Pterodactyl, deci nu poate verifica sau repara provisionarea manual. Nu blochează vânzarea, dar e o funcție de administrare care nu livrează | PARȚIAL | Low-Info | S | cod | FN-P1-13; E03 | 92 |
| MF-68 | ADM | **Escaladare de privilegii**: un personal cu `staff.write` își poate acorda singur **20 din cele 21 de permisiuni**; garda din `admin.ts:1059` verifică doar că nu le ia pe toate, și nu compară `userId`-ul țintei cu actorul | Un angajat cu o singură permisiune ajunge administrator de facto. Verdictul lead-ului: `ADM-02` e `STILL BROKEN`, nu `VERIFIED FIXED` | PARȚIAL | High | S | cod | ADM-P1-01; `_raw/LEAD-VERIFICATIONS.md` V2 | 44 |
| MF-69 | ADM | `customers.write` poate **suspenda un cont de administrator sau de personal** | Un staff poate bloca accesul altui staff și al administratorului | PARȚIAL | High | S | cod | ADM-P1-02 | 45 |
| MF-70 | ADM | Exportul de conformitate al clienților (PII) ajunge în lista generică de setări, editabilă prin `PUT /admin/settings` | Date personale ale clienților într-un răspuns API generic. Nu e o problemă de vânzare, e o problemă de **GDPR** — și poate opri o lansare | PARȚIAL | High | S | cod | REGR-01; revalidare §6.1 | 46 |
| MF-71 | ADM | Rolul `ADMIN` **ocolește toate cele 21 de permisiuni** prin proiectare (`lib/permissions.ts:39-42`) | „Least privilege" nu se aplică la nivelul maxim. Combinat cu MF-70, e o zonă de expunere | LIPSA | Medium | M | cod | FN-P1-28; PAR-P1-29 | 63 |
| MF-72 | ADM | Tabloul de bord cere `customers.read` și totuși expune cifrele de afaceri (MRR, venit, comenzi, bilete) | Un operator fără acces la clienți vede cifrele de afaceri ale companiei | PARȚIAL | Medium | S | cod | ADM-P2-01; `api/src/routes/admin.ts:50,370,386` | 64 |
| MF-73 | ADM | Navigația administrativă **nu e filtrată pe permisiuni** | Un staff fără permisiune vede în meniu ecrane pe care nu le poate deschide — deci fie erori, fie încercări inutilizate | PARȚIAL | Medium | S | cod | ADM-P2-02 | 65 |
| MF-74 | ADM | **8 rute API de admin nu au ecran**: maparea contului de panel, stocarea/uitarea cheii de panou, reconcilierea prețurilor, confirmarea încasării, importul de server de panel, raportul de livrare e-mail, `GET /admin/money` | Operatorul lucrează cu `psql` pentru operații pe care API-ul le știe deja. Cheia de panou stocată manual e singura cale prin care operatorul ia o instanță când podul de chei nu e instalat | PARȚIAL | Medium | M | cod | ADM §5.1; D01–D03, D04, D05, D06, D07, D08 | 66 |
| MF-75 | ADM | **Paginare și sortare absente** din toate listele administrative (`page`, `limit`, `take`, `offset`, `cursor`, `pageSize`, `sort`, `orderBy`, `order` — toate ignorate); lista întoarce mereu primele 200 de rânduri | Peste 200 de clienți, adminul nu vede tot — și crește după lansare. Interogările se degradează liniar: la 5 000 de clienți, ×3,1 până la ×5,8 față de baza de test | LIPSA | High | M | cod | ADM-P2-03; ADM §5.2; PAR-P1-27; PERF §5.3 | 47 |
| MF-76 | ADM | **Căutare în comenzi și în bilete absentă** (`?search=` e ignorat; măsurat: căutarea „BULK-0259" a întors toate cele 264 de comenzi) | Operatorul pierde timp căutând manual într-un tabel; la 200 de rânduri afișate, un client nu e găsit deloc | LIPSA | Medium | M | cod | ADM-P2-03; ADM §5.2 | 67 |
| MF-77 | ADM | Operații în masă absente (`POST /api/admin/{customers,orders,tickets,products}/bulk` → toate `404`) | O acțiune de comunicare în masă (de exemplu, notify la 300 de clienți cu o instare afectată) implică 300 de operații manuale | LIPSA | Medium | M | cod | ADM-P2-04; ADM §5.2 | 68 |
| MF-78 | ADM | `GET /admin/money` e un **stub cu valoare fixă** (`{"example":{"minorUnits":312,"majorUnits":3.12}}`), fără apelant | Operatorul nu poate săra peste MRR real → nu poate decide prețuri, nu poate evalua dacă o promoție a meritat | ANUNȚAT ȘI ABSENT | Medium | M | cod | FN-P1-11; PAR-P1-28; ADM-P3-06 | 69 |
| MF-79 | ADM | Contorul de redeem-uri afișat în admin (`Promotion.usedCount`) **nu e contorul care impune plafonul** (cel e numărarea rândurilor `PromotionRedemption`, care include rezervările neplătite din ultimele 48 h), deși antetul afirmă „Nothing here is a simulated counter" | Operatorul vede un număr greșit și nu-și dă seama câte locuri mai are la o campanie. Afirmația din interfață e opusul realității | ANUNȚAT ȘI ABSENT | Medium | S | cod | FN-P1-05; PAR-P1-23; `admin.ts:801`; `pricing.ts:207-241` | 70 |
| MF-80 | ADM | O promoție nu poate fi limitată la anumite produse (`Promotion` n-are relație cu `Product`) | Nu se poate lansa „reducere 20% doar la Minecraft" — exact campania de conversie pe produs nou | LIPSA | Medium | S | cod | PAR-P1-20; PAR D7 | 71 |
| MF-81 | ADM | Cron / sweep-urile workerului nu raportează dacă chiar rulează | Divergența facturilor locale față de Stripe poate persista nedetectată, fără niciun semn | LIPSA | Medium | S | cod | PAR D11 | 72 |
| MF-82 | ADM | Jurnalul nu notează **ce permisiuni au fost eliminate** la o modificare de rol | Operatorul nu poate reconstitui cine a avut ce acces, în cazul unei anchete interne | PARȚIAL | Low-Info | S | cod | ADM-P3-02 | 93 |
| MF-83 | ADM | Reconcilierea prețurilor care **nu corectează nimic** nu e journalizată | Jurnalul arată că s-a întâmplat ceva, dar nu ce — exact când operatorul are nevoie de urmă | PARȚIAL | Low-Info | S | cod | ADM-P3-03 | 94 |
| MF-84 | ADM | Import de server de panel (`POST /admin/instances/import`) și confirmarea unei încasări locale nu au ecran | Migrarea manuală a unui client de pe altă platformă se face din SQL | PARȚIAL | Medium | S | cod | ADM §5.1; D05, D07 | 73 |
| MF-85 | ADM | Impersonarea unui client — căutare în `api/src` și `web/src` pentru `impersonat`, `impersonate`, `loginAs`, `switchToCustomer`, `su` → **nicio potrivire** | Operatorul nu poate vedea ce vede clientul. Într-o platformă cu un singur operator, e o lipsă reală de diagnosticare | LIPSA | Low-Info | M | cod | ADM §5.2 | 95 |

---

### 3.10 Domeniul `AUT` — Automatizare: provisionare, terminare, suspendare

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-86 | AUT | **Joburile eșuate din coadă sunt șterse**, nu păstrate: `worker.ts:123` → `queue.clean(0, 1000, 'failed')`; istoricul e șters la 10 minute | Pierderea diagnosticului și lipsa reluării automate. Un eșec de provisionare repetat devine un ticket fără cauză identificabilă | PARȚIAL | Medium | S | cod | BE-07; PROV-03; PAR-P1-25; SEC-P4-03 | 74 |
| MF-87 | AUT | **Bucle ale workerului înghit erorile**: `sweepBilling()` apelează `reconcileWithProvider().catch(() => undefined)`, `reconcileInvoicesWithProvider().catch(() => null)`, `releaseStalePromotionReservations().catch(() => undefined)` | Reconcilierea eșuată dispare fără urmă. O eroare recurentă devine permanentă și invizibilă | PARȚIAL | Medium | S | cod | BE-08; PAR-P1-26 | 75 |
| MF-88 | AUT | Provisionarea blocată ține blocaj **30 de minute** pe rândul jobului, fără cale de eludare | Un panou lent blochează coada și clientul așteaptă fără știre | PARȚIAL | Medium | M | cod | BE-06 | 76 |
| MF-89 | AUT | Lipsa mapping-ului de ou → pasul raportat în jurnal este greșit (`server_created`) | Diagnostic greșit pentru operator: caută în jurnal un pas care nu a fost niciodată atins | PARȚIAL | Low-Info | S | cod | PROV-10 | 96 |
| MF-90 | AUT | **O singură alocare per server** (`pterodactylServerId` unic); nu există model pentru alocări multiple | Blochează produsele de gaming care vriu alocări multiple per client — structura standard a unui server de joc cu sloturi și submotor | LIPSA | Medium | M | cod | OPS-08; PAR D12 | 119 |
| MF-91 | AUT | Nu există **dead-letter durabil** pentru joburile eșuate, la nivel de infrastructură | Aceeași problemă ca MF-86, dar măsurată la nivelul cozii: pierderea diagnosticului e o proprietate a configurației, nu doar a unei linii de cod | LIPSA | Medium | M | cod | INFRA-P1-13 | 77 |

---

### 3.11 Domeniul `OPR` — Operațiuni, infrastructură, fiabilitate și securitate

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-92 | OPR | **Nu există adresă publică pentru instanțe**: `DOMAIN_BASE` neconfigurat, `CADDY_ADMIN_URL` / `CADDY_ADMIN_TOKEN` neconfigurate ⇒ `gateway.ts:176-178` fals | Un server de joc fără adresă publică **nu e un produs**. Niciun concurent verificat nu vinde fără adresă publică | LIPSA | P0 | L | **operator** (edge VM 102 + credențiale Caddy) | PAR-P1-06; COMP-P1-05; OPS-04 (`STILL BROKEN`); `api/src/services/gateway.ts:176-178` | 21 |
| MF-93 | OPR | **Nu există nicio copie a datelor în afara gazdei**: `OFFSITE_TARGET` / `OFFSITE_KEY` lipsesc, `rclone` nu e instalat. Timerul de backup e programat și rulează, dar `ExecStartPost` iese 0 fără să mute nimic | Produsele de joc sunt stateful: o lume pierdută = client pierdut + recenzie negativă. `SESSION_SECRET` e ireversibil — pierderea hostului pierde toate datele clienților și secretele | PARȚIAL | P0 | S | **operator** | INFRA-P1-01; COMP-P1-03; DR-02 (lead V3: „parțial reparat, prin acțiune, nu prin cod") | 38 |
| MF-94 | OPR | **Volumul de root e RAID 0**, confirmat la nivelul hipervizorului | Un disc pierdut pierde platforma. E o decizie de infrastructură cu downtime aprobat | LIPSA | Critical | L | **operator** | INFRA-P1-02; INF-01; CAP-04 | 41 |
| MF-95 | OPR | **Nu există firewall** pe gazda platformei și nici pe hipervisor; interfețele de staging și de test sunt publicate pe `0.0.0.0` | Suprafața de expunere e nelimitată. E un blocaj înaintea oricărei rotații de parole sau a oricărui audit de conformitate | LIPSA | Critical | M | **operator** | INFRA-P1-03; SEC-P2-01 | 42 |
| MF-96 | OPR | Consola Proxmox (`*:8006`), `rpcbind` (`0.0.0.0:111`) și `spiceproxy` sunt expuse public | Compromisul hipervizorului e compromisul total: `root` cu parolă, acces la toate mașinile virtuale | LIPSA | High | M | **operator** | INFRA-P1-04; SEC-01, SEC-02, SEC-28 | 48 |
| MF-97 | OPR | **Nu există limite de resurse pe containere și nici swap** | O singură scurgere de memorie într-un container poate opri Postgres și, odată cu el, toată platforma | LIPSA | High | S | **operator** | INFRA-P1-05; PERF §5.7; PERF-P1-16 | 49 |
| MF-98 | OPR | **Nu există recuperare la un punct în timp (PITR)** | Singura copie e un tarball; orice corupție din ultimele 24 h e irecuperabilă | LIPSA | High | M | **operator** | INFRA-P1-07 | 50 |
| MF-99 | OPR | **Arhiva de backup nu conține volumul de atașamente** | Backupul trece, dar nu conține ce contează: fișierele clientului. E un backup care pare să funcționeze | LIPSA | High | M | cod + operator | INFRA-P1-08 | 51 |
| MF-100 | OPR | **Nu există monitorizare, alertare sau metrică** | Nimeni nu e anunțat când platforma cade. RTO-ul măsurat (≈3 s la restore) e valabil doar dacă cineva observă | LIPSA | High | M | operator + cod | INFRA-P1-12; PERF §5.6 | 52 |
| MF-101 | OPR | Pe traseul public, **API-ul nu mai vede adresa vizitatorului**; `COOKIE_SECURE` e dedus din protocol, iar cu proxy-ul neîncrezut rezultă cookie fără `Secure` | Session hijacking pe o conexiune de rețea publică. *(Infrastructura cauzei e aceeași ca la MF-03 — acolo e efectul de DoS)* | LIPSA | High | S | **operator** | INFRA-P1-09; PRODUCTION-STATE §1 | 53 |
| MF-102 | OPR | API-ul are încredere în **întregul bridge Docker** | Un container compromis în aceeași rețea poate impersona utilizatorul | PARȚIAL | Medium | M | cod + operator | INFRA-P1-10 | 78 |
| MF-103 | OPR | **Jurnalele Docker nu sunt rotite** | Un disk plin blochează scrierea în Postgres și oprește platforma | LIPSA | High | S | **operator** | INFRA-P1-06 | 54 |
| MF-104 | OPR | **Nu există protecție DDoS** la edge pentru `node1.` și `panel.` | Fiecare concurent verificat pune protecția în planul de intrare (OVI 1 Tbps, Zentaris inclus, Shockbyte inclus, Aternos gratuit). Vinderea unui server public fără filtrare, într-o piață care o include peste tot, e o **vulnerabilitate de vânzare**, nu o poziționare. *Notă de honestitate: `PORT-03` e `NOT VERIFIED` — auditorii n-au avut acces la edge; constatarea se bazează pe poziționarea internă și pe faptul că toți concurenții o includ* | LIPSA | P0 | L | **operator** (edge, VM 102) | COMP-P1-04; COMP §8 acțiunea 4; COMP §11.1 | 39 |
| MF-105 | OPR | **Stiva izolată de audit refolosește secretele de producție** și e accesibilă din rețea, cu webhook acceptat fără semnătură | Un stack de test deschis public, cu cheile de producție, e o cale directă spre producție | PARȚIAL | High | S | **operator** | SEC-P2-03 | 55 |
| MF-106 | OPR | Dependențe cu vulnerabilități aplicabile; `nodemailer` e mult în urmă | Suprafață de atac cunoscută în bibliotecile folosite efectiv | LIPSA | High | M | **operator** (actualizare) | SEC-P3-01 | 56 |
| MF-107 | OPR | Rutele cu token intern răspund **HTTP 200** și compară tokenul în **timp neconstant** | Un scanner vede „200" și consideră calea accesibilă; o comparație nonconstantă e un canal secundar de timp | PARȚIAL | Medium | S | cod | SEC-P4-01; SEC-16 | 79 |
| MF-108 | OPR | **Colecții validate fără limită superioară** în cotare | O cerere cu mii de elemente încorporează un volum mare de date necontrolat | PARȚIAL | Medium | S | cod | SEC-P3-03 | 80 |
| MF-109 | OPR | Politica `Content-Security-Policy` e dezactivată; **HSTS și CSP lipsesc** pe traseul static public | Fără CSP, un XSS într-un șir de admin devine execuție de cod | LIPSA | Medium | S | cod | SEC-P4-02; INFRA-P1-20 | 81 |
| MF-110 | OPR | **Nu există compresie** gzip/brotli în `web/server.mjs`: fiecare încărcare transferă 452–558 KB, din care 347–426 KB JavaScript brut, pentru un bundle principal de 93,1 KB gzip | Cel mai mare cost măsurabil pentru un client pe mobil — și nu necesită nicio decizie de infrastructură | LIPSA | Medium | S | cod | PERF-P1-01; PERF §5.1 | 82 |
| MF-111 | OPR | **Landing-ul face 6 cereri identice** pentru același catalog, la fiecare încărcare | Fiecare vizitator plătește 5 cereri redundante pe cea mai vizitată pagină | LIPSA | Medium | S | cod | PERF-P1-02; UX-P1-08 | 83 |
| MF-112 | OPR | Lipsa indicilor pe `User.createdAt`, `Order.createdAt`, `Ticket.updatedAt/status` | Interogările listei admin se degradează liniar cu volumul; la 10 000 de clienți, panoul devine inutilizabil | LIPSA | Medium | M | cod + migrare | PERF-P1-04; PERF §5.3 | 84 |
| MF-113 | OPR | `priceItems` face **2 interogări per element** de cotă (p50 de 17 ms la 1 produs, 35 ms la 8 produse); același cod rulează la crearea comenzii | Latenta cotării crește liniar cu numărul de elemente — și cotarea e pe traseul de conversie | PARȚIAL | Low-Info | S | cod | PERF-P1-03; PERF §5.4 | 97 |
| MF-114 | OPR | `/api/status` durează **4 secunde** și face 2+N apeluri seriale spre panou, fiecare cu timeout de 20 s | Pe pagina publică de stare, un panou lent alungește răspunsul spre zeci de secunde. Aceeași pagină mai raportează „Support — Degraded" și „Automation worker: Outage" permanent | PARȚIAL | Medium | S | cod | PERF-P1-07; OPS-06; COMP-P1-12 | 85 |
| MF-115 | OPR | **Imaginile Docker: tag `latest`, fără registru, fără cale de rollback** | Un deploy stricat nu poate fi revertit la o versiune anterioară funcțională | LIPSA | Medium | M | **operator** | INFRA-P1-15 | 86 |
| MF-116 | OPR | **PostgreSQL nu are vizibilitate pe interogări** (`log_min_duration_statement = -1`) | Nicio optimizare viitoare nu poate fi justificată cu date, iar o regresie rămâne nedetectată | LIPSA | Medium | S | **operator** | INFRA-P1-16; PERF-P1-15 | 87 |
| MF-117 | OPR | Resturi de audit în producție: **7 099 de e-mailuri nedeliverate și 9 baze de test** | Rupe GDPR-ul, umple spațiul și arată o platformă neglijată — vizibil înainte de prima plată | LIPSA | Medium | S | **operator** | INFRA-P1-17 | 88 |
| MF-118 | OPR | `/api/status` este public și dezvăluie topologia internă (nume de componente, starea integrărilor) | Ajută un atacator să-și facă o hartă înainte de a încerca ceva | LIPSA | Medium | S | cod | INFRA-P1-14 | 89 |
| MF-119 | OPR | `requestId` nu e un identificator de corelare utilizabil | Un client care raportează o eroare nu poate fi ajutat: identificatorul nu corelează între cerere, log și răspuns | LIPSA | Medium | S | cod | INFRA-P1-11 | 90 |
| MF-120 | OPR | Stiva de verificare a auditului e publicată pe `0.0.0.0`; `LLMNR` ascultă pe toate interfețele | Suprafață de expunere inutilă, într-o rețea unde orice e suficient | LIPSA | Low-Info | S | **operator** | INFRA-P1-18; INFRA-P1-19 | 98 |
| MF-121 | OPR | Nivelul patch-urilor OS: în general la nivel, o actualizare de securitate în așteptare | Suprafață de atac în fereastra dintre detectare și aplicare | LIPSA | Low-Info | S | **operator** | INFRA-P1-22 | 99 |
| MF-122 | OPR | Ramura `main` e cu un commit înainte de `origin`; `EXPOSE` al worker-ului indică portul greșit | Derivație între codul auditat și codul deployat — deci „ce e în repo" nu garantează „ce rulează" | LIPSA | Low-Info | S | **operator** | INFRA-P1-23; INFRA-P1-21 | 100 |

---

### 3.12 Domeniul `EXT` — Extensibilitate, integrare și creștere

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-123 | EXT | **Niciun API public** pentru clienți: 0 potriviri pentru `openapi`/`swagger`, niciun model `ApiKey` | Blipmade nu poate fi integrat: reseller, Discord bot, n8n, Zapier, monitorare externă. Un client care își automatizează infrastructura **nu poate** cu Blipmade. *(Decizie de scope: se face un API read-only mic, nu unul de 48 de operații — vezi §6)* | LIPSA | High | M | cod | PAR-P1-14; COMP-P1-15; PAR D18 | 105 |
| MF-124 | EXT | Nicio **CLI de administrare** a platformei (există doar scripturi shell de backup și de test) | Operatorul folosește `psql` pentru operații de platformă — o sursă de eroare umană pe operații de scriere | LIPSA | Medium | M | cod | PAR D18 | 120 |
| MF-125 | EXT | Program de **afiliați** (0 modele) | Nu blochează o vânzare; blochează creșterea prin recomandare — cel mai ieftin canal de vânzare pentru o platformă nouă | LIPSA | Medium | M | cod | PAR-P1-21; PAR D16 | 121 |
| MF-126 | EXT | Niciun **punct de extensie**, hook de lifecycle, temă sau marketplace | Într-o platformă fără extensii, fiecare funcție nouă e o modificare a nucleului. Nu e o problemă azi; e o **decizie arhitecturală** de documentat | LIPSA | Low-Info | L | cod | PAR-P1-34; PAR D14; PAR D19 | 126 |
| MF-127 | EXT | Platformă **multi-tenant** (mai mulți operatori pe o instalare) | Segmentul reseller (S3) nu e ținta. Decizie de scope, nu de gap | LIPSA | Low-Info | L | cod | PAR D19; COMP-P1-08 | 127 |
| MF-128 | EXT | Blog și pagini de marketing real — secțiunea „Platform" de pe pagina de start e un **mock declarat în cod** („The mock is a picture") | Fără conținut, nu există SEO și nu există organic search. Nu blochează vânzarea; consumă buget de la operațiuni | PARȚIAL | Low-Info | M | operator | FN-P1-22; A14; PAR-P1-33 | 128 |

---

### 3.13 Domeniul `DIFF` — Diferențiatori concurențiali (ce ar trebui construit **după** ce platforma e vândabilă)

| ID | Domeniu | Ce lipsește | De ce contează (cine se blochează) | Stare | Sev. | Efort | Dep. | Dovadă | Ordine |
|---|---|---|---|---|---|---|---|---|---|
| MF-129 | DIFF | **Backup cu cotă inclus în planul de intrare**, ca la Torchbyte (50 GB zilnic la €4,74) și Shockbyte | Concurenții pun backupul în planul de intrare. Fără el, prețul nu justifică cotă și clientul compară cu un VPS | LIPSA | P0 | M | operator + cod | COMP §7.2; COMP-P1-14 | 129 |
| MF-130 | DIFF | **Protecție DDoS declarată explicit în planul de intrare** (nu ascunsă în textul împreună cu backupul) | Clienții de gaming compară pe fila „DDoS inclus". Prezența lui în tabelul de preț e un argument de vânzare, nu doar o funcție | LIPSA | Medium | S | **operator** | COMP-P1-04; COMP §7.2 | 131 |
| MF-131 | DIFF | **Instalare cu un click a jocului / modpack-urilor** și semantică de sloturi | E în tabelul de comparație al fiecărui concurent RO și internațional. Fără ea, un client de gaming nu vede de ce Blipmade și nu un VPS | LIPSA | Medium | M–L | cod (depinde de ou-ul produsului) | COMP-P1-13; U16, U21, U23 | 132 |
| MF-132 | DIFF | **Zero recenzii, zero referințe, zero studii de caz** (Nodecraft: 4,9/5 din 1800+ recenzii; Shockbyte: 4,7/5) | Recenzia e cel mai puternic activ din set. Cu 0 clienți, prima recenzie negativă nu e compensată de nimic. **Depinde de primii clienți nominali, nu se construiește** | LIPSA | High | M | **operator** (clienți nominali) | COMP-P1-10; U17–U19 | 130 |
| MF-133 | DIFF | **Nicio țintă de uptime publicată, niciun SLA** (Shockbyte: 99,9%; OVI: 99,95%) | În fața unui client care compară, absența promisiunii e o promisiune mai slabă. Dar promisiunea trebuie să fie credibilă — deci depinde de backup și de monitorizare | LIPSA | Medium | S | **operator** | COMP-P1-16; U17, U20 | 133 |
| MF-134 | DIFF | **Fără plan free / fără prag de intrare** (Aternos: €0, cu DDoS și backup) | Un vizitator care nu vrea să plătească nu are nicio treaptă. `SubscriptionStatus` conține deja `TRIALING`, dar nu există logică de perioadă de probă | LIPSA | Medium | M | cod + **operator** (dacă un trial costă bani, costă și resurse) | COMP-P1-18; PAR-P1-32; `schema.prisma:416` | 134 |
| MF-135 | DIFF | **Platforma nu poate fi folosită de un reseller**: niciun `ApiKey`, niciun `openapi`, `Setting` unic fără multi-tenant | Un reseller instalează Pterodactyl + Paymenter/FOSSBilling într-o oră și obține catalog, facturare, ticketing și provisionare. Blipmade nu îi oferă niciuna dintre primele trei. **Decizie de scope, nu de gap**: segmentul S3 nu e ținta | LIPSA | Low-Info | — | — (decizie de scope) | COMP-P1-08; PAR-P1-14 | 135 |

---

### 3.14 Capacități care **există și funcționează** — de ce acest document nu e o listă de dezastre

Un roadmap care enumeră doar lipsurile ar misrepresenta platforma. **38 din cele 182 de constatări anterioare sunt `VERIFIED FIXED`** (conform revalidării), iar remedierea a închis **25 din cele 41 de constatări relevante pentru plată** — poarta de plată, compensarea la provisionare eșuată, numerotarea comenzilor, promoțiile și cotarea. **Niciuna din cele 182 nu e o regresie.**

Capacitățile de mai jos **funcționează azi** și nu au fost incluse în matrice ca gap-uri. Unele sunt chiar **avantaje față de concurenți**:

| Capacitate | Stare | De ce contează |
|---|---|---|
| Compensation după provisionare eșuată (`PROV-02`) | Funcționează | Clientul nu e lăsat să plătească un server inexistent. E un **avantaj real** față de multe platforme |
| Prețul de pornire corespunde configurației (`PRICE-01`) | Funcționează | Copy-ul public nu mai promite un preț pe care nu-l poți obține |
| Un singur contract comun de preț (`PRICE-02`, `PRICE-05` — 6 surse de preț unificate) | Funcționează | Elimină o clasă întreagă de dispute de facturare |
| Cotația verifică limita per cont și plafonul promoției (`PROMO-07`), rezervarea slotului e atomică (`PROMO-03`) | Funcționează | Corectitudine financiară în concurență |
| Comanda anulată nu poate fi plătită **și onorată** (`COMM-06`) | Funcționează | Prevenirea dublei taxări |
| `invoice.paid` înainte de `checkout.session.completed` nu se pierde (`COMM-05`) | Funcționează | Nicio plată ratată |
| Numerotarea comenzilor și facturilor e atomică (`PROV-07`, `BE-14`) | Funcționează | Nicio factură duplicată |
| Ledgerul webhook e protejat la livrările repetate (`BE-10`) | Funcționează | Idempotență |
| Limita de login e per cont **și** per adresă (`SEC-07`) | Funcționează | Protecție reală contra atacului de autentificare |
| Escaladarea de rol prin `PUT /admin/staff/:userId` e blocată (`SEC-04`) | Funcționează | *(dar vezi MF-68: escaladarea rămâne posibilă pe calea `PATCH`)* |
| Catalogul e cerut **o singură dată** pe pagina de pornire (`UX-06`) | Funcționează | *(dar vezi MF-111: pe landing rămân 6 cereri paralele)* |
| Copy-ul public nu mai promite reduceri nerealizabile (`MKT-08`, `PROMO-10`, `PRICE-06`) | Funcționează | **Aliniere între marketing și realitate** — baza onestității de marketing |
| `AuditLog` există ca registru de pâlnie (`MKT-05`) | Funcționează | Jurnalizare pentru conformitate |
| Retenția la anulare e confirmată explicit (`OPS-09`), chiar dacă implicitul e `false` | Funcționează | *(dar vezi MF-56: ștergerea e o decizie, nu un accident)* |
| Codul rulează în containere cu `read_only`, `no-new-privileges` (`SEC-13` — parțial) | Funcționează parțial | Runtime izolat |
| Provisionarea e condiționată de plată (`OPS-02`) | Funcționează | Niciun server plătit neplătit |

**Concluția acestei secțiuni:** platforma nu e o cochilie goală. Are o **coadă de plată, un model de preț și o zonă de administrare cu adâncime reală**. Ce lipsește nu e miezul — e **exteriorul**: cheia de Stripe, produsul de joc, adresa publică, e-mailul, backupul în afara gazdei și apărarea hipervizorului.

### 3.15 Capacități care **există, dar nu sunt terminate** — ce înseamnă „parțial"

Celelalte **14 constatări** din revalidare sunt `PARTIALLY FIXED`: defectul de bază e rezolvat, dar rămâne **scoarță, caz de margine sau lipsă de test**. Nu sunt „funcționalități lipsă" în sens strict, dar sunt **capacități pe care clientul sau operatorul nu le poate folosi încă**. În matrice au fost marcate `PARȚIAL` și împărțite în trei categorii:

**1. Capacitate prezentă, automatizare incompletă**

| ID | Ce e aproape gata | Ce lipsește |
|---|---|---|
| MF-86 / MF-91 | Coada de joburi există, cu retry | Joburile eșuate sunt **șterse**, nu păstrate → diagnostic pierdut |
| MF-87 | Reconcilierea există | Bucle cu `.catch(() => undefined)` → eșecul e invizibil |
| MF-16 / MF-17 | Produsele au ou și `deployable` | 4 din 5 nu au imagine; containerul primește o aplicație **generică** |
| MF-47 | Ledgerul webhook are unicitate | A doua livrare concurentă nu e mascată → divergență local/Stripe posibilă |
| MF-62 | Notificările de factură există | Implementare **duplicată**, cea folosită e moartă |
| MF-74 | Cele 8 rute API de admin există și au teste | Niciuna nu are ecran |

**2. Capacitate prezentă, izolare incompletă**

| ID | Ce e aproape gata | Ce lipsește |
|---|---|---|
| MF-03 / MF-101 | `TRUSTED_PROXIES` există ca variabilă (`env.ts:102`, implicit `127.0.0.1,::1`) | Nu e **setată** în producție → cookie fără `Secure` + limitare per-adresă devenită globală |
| MF-04 | Adresa e rezolvată, cu `TRUSTED_PROXIES` | Lanțul real de proxy-uri nu e încrezut, iar rezolvarea citește `X-Forwarded-For` de la stânga |
| MF-71 | 21 de permisiuni, modelate corect | Rolul `ADMIN` le ocolește pe toate |
| MF-68 / MF-69 | Verificări de rol există pe calea `PUT` | Calea `PATCH` nu verifică, iar `customers.write` poate suspenda un admin |

**3. Capacitate prezentă, acoperire de test sau caz de margine lipsă**

| ID | Ce e aproape gata | Ce lipsește |
|---|---|---|
| MF-46 | Verificarea sumei există | Se **dezactivează** când furnizorul nu trimite suma |
| MF-36 | Garda de checkout există | Acceptă și `CANCELLED`/`REFUNDED` |
| MF-79 | Contorul de promoții există | Indicatorul afișat ≠ cel care impune plafonul |
| MF-19 | Produsul nou se creează | Pornește cu preț `0` |
| MF-18 | Configuratorul de deploy are un preset | Presetul e mereu minimul și nu e editabil |
| MF-56 | Retenția e o **decizie** explicită | Implicitul (`false`) ascunde o decizie de conformitate |
| MF-28 | `SubscriptionStatus` conține `TRIALING` | Nu există logică de perioadă de probă |

**Observație de fond, cu un singur rând de import:** `DR-02` (backup în afara gazdei) a fost marcat „programarea e rezolvată" într-o rundă anterioară. Verificarea lead-ului (`_raw/LEAD-VERIFICATIONS.md`, V3) a arătat că **programarea e reparată, dar nu și copia în afara gazdei** — deci verdictul corect e `PARTIALLY FIXED`, prin **acțiune de operator, nu prin cod**. E un exemplu al tipului de eroare care se repetă: „remediat" înseamnă adesea „codul e scris", nu „funcționează în producție".

---

## 4. Narațiunea fiecărui domeniu — cum arată domeniul când e complet

### 4.1 `IDN` — Identificare

Când domeniul e complet: un vizitator își creează cont în **mai puțin de un minut**, pe telefon, în română, și primește un e-mail care chiar ajunge. Are opțiunea să intre cu Discord sau cu un cod de un singură utilizator. Contul lui e protejat cu 2FA pe telefon. Când se conectează de pe un computer nou, vede în lista de sesiuni **dispozitivul, ora, adresa reală și un identificator de acțiune** — poate închide o sesiune individuală. Când își schimbă e-mailul sau își închide contul, **sesiunile vechi mor în același moment**. Limitele de autentificare numără doar eșecurile. O sesiune care începe e activă în continuare cât timp clientul o folosește. E un domeniu în care **nimic nu se întâmple în tăcere** — fiecare schimbare de stare de autentificare e explicată și e reversibilă.

### 4.2 `PRD` — Produs și catalog

Când domeniul e complet: catalogul are **trei produse reale** — unul de joc, unul de aplicație self-hosted, unul comunitar — fiecare cu imagine, ou, limită de resurse și un conținut de pornire care chiar e aplicația vândută. Fiecare produs afișează configurația recomandată, iar configuratorul de deploy pornește de la ea. Prețul vine dintr-un singur loc, iar limita de `maxPerUser` e vizibilă înainte de plată. Un produs nou creat de operator nu poate ajunge în vânzare cu preț `0`. Când un produs nu e livrabil, **spune exact de ce** — „imagine în pregătire", „limită de capacitate atinsă" — nu dă mesaje contradictorii și nu expune identificatori interni. Cele 4 produse fără conținut de azi dispar din paginile publice până când au ou.

### 4.3 `PRE` — Preț

Când domeniul e complet: prețul afișat, prețul cotat și prețul încasat sunt **același număr**, indiferent de perioadă, cantitate sau promoție. Există **trei tipuri de plan** (gratuit/de probă, de unică folosință, abonament) și **patru intervale** (zi, săptămână, lună, an), pentru că în gaming pachetele scurte sunt norma, nu excepția. Taxa de TVA e configurabilă și apare pe factură. Există un plafon de tip „un plan per produs per client", vizibil înainte de plată. Prețul e afișat în euro, cu formatare românească, și ține cont de TVA la afișare, nu doar la factură.

### 4.4 `CMD` — Comandă și checkout

Când domeniul e complet: clientul alege produsul, perioada și cantitatea, vede **un singur preț final**, plătește, și aterizează pe o pagină care spune clar ce s-a întâmplat — „plată reușită", „plată anulată", „plată în așteptare" — cu link direct spre factură. Dacă Stripe nu e configurat, pagina spune **exact** „plățile nu sunt configurate pe acest mediu", nu un mesaj static. O comandă anulată sau rambursată **nu poate fi plătită din nou**. Există coș, există comandă multi-produs, există checkout de oaspete. Butonul de refund funcționează. Upgrade-ul trece printr-o coadă coerentă, verifică capacitatea nodului și nu lasă comenzi orfane.

### 4.5 `FAC` — Factură

Când domeniul e complet: după plată, clientul vede **factura lui Blipmade** — nu PDF-ul Stripe — cu numărul de ordin, data, emitentul, TVA, perioada de serviciu și suma în lei. Factura e descărcabilă în PDF și trimisă pe e-mail. Un client care plătește prin transfer sau în avans poate vedea factură și poate confirma plata manual din admin. Verificarea sumei **nu se dezactivează niciodată**: dacă furnizorul nu trimite suma, plata e pusă în carantină, nu acceptată orbește. Livrările webhook concurente sunt idempotente. O promoție care acoperă tot prețul produce **factură de 0**, nu venit de 0. Există credit de cont și motiv de anulare, iar fiecare ajustare e într-un registru de tranzacții.

### 4.6 `ABN` — Abonament și ciclu de viață al serviciului

Când domeniul e complet: clientul vede **data la care se reînnoiește abonamentul** și cât are de facturat, iar consola de administrare arată la fel. Starea instanței sale corespunde realității: dacă panoul nu răspunde, platforma spune „instanciță degradată" și **nu** „funcționează". Un client care e degradat fără să știe primește o notificare și un credit; o degradare prea lungă oprește automat serviciul și generează o notificare. Există o pagină de metrici a instanței, cu CPU, RAM și disc, la care clientul poate ajunge. Politica de retenție la anulare e **publicată**, nu implicită.

### 4.7 `SUP` — Suport

Când domeniul e complet: un client care scrie un bilet primește confirmare pe e-mail, poate atașa un fișier — și fișierul **ajunge efectiv la operator**. Răspunsul se vede și în aplicație, nu doar în e-mail. Există o coadă de e-mail cu retry și un raport de livrare pe care operatorul îl poate deschide. E-mailurile de tranzacție (factură, plată eșuată, parolă resetată) trec prin aceeași coadă și sunt monitorizate. Un bilet rezolvat iese din coada operatorului și lasă un istoric. Pentru un operator cu un ticket pe zi, e suficient; pentru un operator cu 30, e începutul unui eșec.

### 4.8 `ADM` — Administrare

Când domeniul e complet: **fiecare rută de admin are un ecran** — cele 8 fără interfață sunt ecranate. Listele au **paginare, sortare, căutare și operații în masă**. Căutarea în comenzi și bilete găsește ce caută. Un rol de personal poate face exact ce i se dă și nimic mai mult: `PATCH /admin/staff/:userId` nu îi permite să se auto-învestească, `customers.write` nu suspendă un administrator, rolul `ADMIN` nu ocolește automat toate permisiunile, iar navigația e filtrată pe ce poate face. Tabloul de bord arată numere reale, inclusiv MRR, calculat din date reale — nu dintr-un stub. Reconcilierea de prețuri raportează ce a schimbat. Jurnalul spune cine a făcut ce, inclusiv ce permisiuni au fost retrase. Există un mod de a vedea interfața unui client, pentru diagnosticare.

### 4.9 `AUT` — Automatizare

Când domeniul e complet: un job eșuat **nu dispare** — stă într-o stare de eșec vizibilă, cu motivul și ultima eroare, și poate fi reluat. Un eșec recurent de reconciliere **se vede** într-un indicator, nu se pierde într-un `.catch()`. Provisionarea are un timeout mai mic de 30 de minute, cu o cale de eludare și cu un mesaj pentru client în așteptare. Alocările multiple pe server sunt posibile, pentru că e formatul standard al unui server de joc. Și, la fel de important: **nu se creează un server care nu poate fi pornit** — capacitatea nodului se verifică înainte de a se accepta un upgrade.

### 4.10 `OPR` — Operațiuni

Când domeniul e complet: datele clienților există în **două locuri** — pe gazdă și în afara ei — și există un drill de restaurare executat, nu doar un timer instalat. Gazda are firewall. Hipervizorul nu e accesibil din internet. Containerele au limite de resurse. Există un volum de atașamente în backup. Există monitorizare care **anunță** cineva. Există retenție și recuperare la un punct în timp. Jurnalele se rotesc și discul nu se umple niciodată. Imaginile au versiuni și pot fi readuse la o versiune anterioară. PostgreSQL arată interogările lente. Pe traseul public, cookie-ul de sesiune poartă `Secure` și limita per-adresă e per-adresă. `/api/status` e util pentru operator și mut pentru public. Și `/api/status` **nu raportează „degraded" permanent** — un status care spune mereu „degradat" e un status pe care nimeni nu îl mai citește.

### 4.11 `EXT` — Extensibilitate

Când domeniul e complet: există un **API public mic și documentat** (read-only pentru clienți, cu chei API) — suficiente pentru ca un client să-și automatizeze infrastructura și pentru ca un integrator să construiască un bot de Discord. Există o **CLI de administrare** pentru operațiile pe care operatorul le face acum din `psql`. Există un program de afiliați, pentru că e cel mai ieftin canal de vânzare al unei platforme noi. Punctele de extensie (hookuri de lifecycle, evenimente publice, temă) sunt documentate ca **intenție**, chiar dacă nu sunt implementate — pentru ca un dezvoltator să știe ce poate și ce nu poate face.

### 4.12 `DIFF` — Diferențiatori

Când domeniul e complet: Blipmade nu câștigă prin preț — prețul e deja calibrat corect, cu €0,50 peste OVI și €0,25 sub Torchbyte, iar coborârea lui ar distruge marja. Câștigă prin **două lucruri concrete** pe care concurenții le pun în plan: backup cu cotă și protecție DDoS. La acestea se adaugă trei lucruri pe care Blipmade le are sau le poate avea mai ieftine decât restul pieței: o interfață în română, un preț transparent cu TVA inclus, și **compensare automată** la provisionare eșuată — pe care majoritatea concurenților de nișă nu o au. Există o recenzie, cel puțin una, publicată de un client care chiar a folosit serviciul. Există o țintă de uptime publicată și **credibilă**. Există o treaptă gratuită, ca la Aternos. Și există instalare cu un click a jocului, ca la Zentaris și Shockbyte — pentru că e în tabelul de comparație al fiecărui concurent.

---

## 5. Undele — drumul de la „nu pot lua bani" la „pot crește"

Undele nu sunt grupe tehnice. Fiecare undă se termină într-un **fapt pe care un client sau un operator îl poate simți**. Un val care trece prin checkout nu e un val care trece prin review.

### 5.1 Undele într-o privire

| Undă | Întrebarea la care răspunde | Efort total | Natură dominantă | Durată realistă |
|---|---|---|---|---|
| **0 — Poate lua banii?** | „Pot să iau bani pentru ceva?" | ~3 săptămâni | **operator** (2/3) + cod (1/3) | 3 săptămâni |
| **1 — Poate clientul folosi ce a plătit?** | „Dacă a plătit, funcționează?" | ~4 săptămâni | cod + operator (adresă, SMTP) | 3–4 săptămâni |
| **2 — Poate operatorul să o ruleze?** | „Pot să o opriu și să o pornesc din nou?" | ~4 săptămâni | **operator** (2/3) + cod (1/3) | 4–6 săptămâni (paralel cu 1) |
| **3 — Poate afacerea să crească?** | „Pot să iau mai mulți clienți fără să mor de muncă?" | ~6 săptămâni | cod | 6–8 săptămâni |
| **4 — De ce eu și nu altcineva?** | „De ce clientul alege Blipmade?" | ~4 săptămâni | operator + cod | după primii clienți |

Undele 1 și 2 pot rula **în paralel** cu un singur operator, pentru că 2 e dominată de infrastructură (un alt tip de lucru) și 1 de aplicație.

---

### 5.2 Unda 0 — „Poate platforma să ia banii cuiva?"

**De ce e prima:** până când `PAYMENTS_ENABLED=true` și există un produs cu imagine, **tot restul e teorie**. Niciun client nu poate plăti, deci niciun bug de mai sus nu poate fi prins de un client real, deci nicio valoare de pe undele următoare nu poate fi confirmată.

**Conținut (19 rânduri):**

| Ce | Rânduri | Tip |
|---|---|---|
| Pornirea plăților: chei Stripe, `PAYMENTS_ENABLED=true`, webhook activ | MF-33 | **operator** |
| Catalog vândabil: imaginile și ourile celor 4 produse lipsă | MF-14 | **operator** (conținut) |
| Corectarea marcajului `deployable` pentru `wordpress` | MF-15 | operator + cod |
| Introducerea unui produs de joc real în catalog | MF-16 | **operator** |
| Containerul primește aplicația produsului vândut, nu un starter generic | MF-17 | cod |
| Parametrul `checkout` e respectat; pagina spune ce s-a întâmplat | MF-34 | cod |
| Factura devine vizibilă după plată | MF-43 | cod |
| Taxa de TVA: rată, bază (net/TVA-inclus), tratament B2B | MF-44 | **operator** + cod |
| Factura e a Blipmade, cu TVA și date fiscale, nu PDF-ul Stripe | MF-45 | cod |
| Cotația și încasarea folosesc aceeași perioadă | MF-25 | cod |
| `quantity` e onorată în cotă, nu doar în comandă | MF-26 | cod |
| O comandă anulată/rambursată nu mai poate fi plătită | MF-36 | cod |
| Verificarea sumei nu se dezactivează când suma lipsește | MF-46 | cod |
| Un produs nou nu pornește cu preț `0` | MF-19 | cod |
| O promoție integrală produce factură de 0, nu venit de 0 | MF-48 | cod |
| Configurația recomandată e reală și editabilă | MF-18 | cod |
| Refund-ul din admin funcționează | MF-37 | operator (Stripe) |
| Webhook-ul de plată eșuată răspunde cu cod de eroare | MF-63 | cod |
| Livrările webhook concurente sunt idempotente | MF-47 | cod |

**Ce deblochează:** prima tranzacție reală, prima factură reală, primul bilet real, prima recenzie reală. Toate celelalte 4 unde depind de existența unui client care a plătit — inclusiv MF-132 (recenzii), care e imposibil înainte de asta.

**Efort:** ~3 săptămâni. **~40% operator** (chei, decizii de catalog, prețuri, TVA, conținut de ou), **~60% cod**.

**Criteriu de ieșire — măsurabil:**
> 1. Un client nou se înregistrează, alege `discord-bot` (și un produs de joc, dacă e livrat în undă), plătește **cu card real**, primește **factură cu TVA vizibilă**, și vede **ambele** pe pagina lui de facturare.
> 2. Stripe arată un `payment_intent` și un `checkout.session` pentru aceeași comandă, în aceeași sumă, cu aceeași perioadă — verificabil în dashboard-ul Stripe.
> 3. Un cod de reducere care acoperă 100% produce **factură de 0** și **MRR neafectat**.
> 4. O comandă anulată, încercată din nou la checkout, **e respinsă** cu un mesaj explicit.
> 5. Zero produse cu `deployable=true` fără imagine și fără ou — **verificabil prin interogare directă în baza de date**, nu prin ochi.
> 6. Un client nou care primește un container știe că e aplicația pe care a cumpărat-o — nu un „Hello world".

---

### 5.3 Unda 1 — „Poate clientul să folosească ce a plătit?"

**De ce e a doua:** plata e doar jumătate. Un server fără adresă publică, fără e-mail și cu stări mincinoase e un produs plătit și inutilizabil — și produce exact tipul de bilet și de recenzie negativă care omoară o platformă nouă.

**Conținut (18 rânduri):**

| Ce | Rânduri | Tip |
|---|---|---|
| **Adresă publică pentru instanță** (`DOMAIN_BASE`, Caddy admin, rutare) | MF-92 | **operator** |
| **SMTP funcțional** (`SMTP_URL`, transport real) | MF-59 | **operator** |
| Stările instanței corespund realității (inclusiv „degradat") | MF-58 | cod + operator (acces la panou) |
| Atașamentele de bilet ajung pe server | MF-60 | cod |
| Pagina de metrici a instanței (promisă în docs) | MF-54 | cod |
| Data de încheiere a perioadei e afișată clientului | MF-55 | cod |
| Limita per-adresă numără doar eșecurile | MF-11 | cod |
| Lista de sesiuni arată device, oră, adresă reală și permite închiderea individuală | MF-08, MF-09 | cod |
| `GET /billing/payment-state` e consumat de interfață | MF-35 | cod |
| Upgrade-ul verifică capacitatea nodului | MF-42 | cod |
| Upgrade-ul nu lasă comenzi orfane | MF-41 | cod |
| Anularea comenzii are ecran | MF-40 | cod |
| Raportul de livrare e-mail are ecran | MF-64 | cod |
| Catalog: mesaje de blocaj necontradictorii, fără expunere de `eggId` | MF-22, MF-23, MF-24 | cod |
| Prețul nu pierde față de un VPS peste 6 GB RAM | MF-32 | **operator** (decizie de portofoliu) |

**Ce deblochează:** primul client care spune „funcționează" în loc de „am plătit și nu merge". Și, indirect, **onestitatea stărilor** — baza pentru creditul la degradare (MF-57, unda 2) și pentru orice promisiune de SLA (MF-133, unda 4).

**Efort:** ~3–4 săptămâni, predominant cod. Cele două rânduri operator (adresă publică, SMTP) sunt **mici ca efort și mari ca efect** — MF-92 e `L` ca efort doar pentru că implică un edge la distanță.

**Criteriu de ieșire — măsurabil:**
> 1. Un server provisionat primește o **adresă publică reală** care rezolvă DNS și răspunde — verificabil din afara rețelei interne.
> 2. Un e-mail de confirmare de cont **ajunge efectiv** în inbox (nu în fișier) — dovedit de un `SMTP_URL` real și de o livrare confirmată.
> 3. Un bilet cu un fișier atașat ajunge la operator, iar fișierul **poate fi descărcat** de pe server.
> 4. Dacă panoul devine inaccesibil, starea instanței devine **„degradată"**, nu „în funcțiune" — reprodus manual o dată.
> 5. Un client își vede data de reînnoire a abonamentului, iar valoarea afișată **nu e `null`**.
> 6. Clientul vede pagina de metrici a instanței cu valori reale.
> 7. Limitarea de autentificare nu se declanșează la logins **reușite** repetate.

---

### 5.4 Unda 2 — „Poate operatorul să o știe ruleze, s-o oprească și s-o repornescă?"

**De ce e a treia:** până când datele nu ies din gazdă, până când hipervizorul e încuiat și până când nimeni nu e anunțat când cade, **fiecare euro încasat e o promisiune de încredere fără contrapartire**. E valoarea minimă pe care o cere orice client care plătește lunar, și e cea care separă „am construit o platformă" de „am construit o afacere".

**Conținut (63 de rânduri, în patru blocuri):**

**A. Supraviețuirea datelor — 6 rânduri**
MF-93 (copie în afara gazdei — **operator**, `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` + `rclone`), MF-94 (RAID 0 pe `/`), MF-97 (limite de resurse + swap), MF-98 (PITR), MF-99 (volumul de atașamente în backup), MF-103 (rotația jurnalelor Docker).

**B. Securitatea perimetrului — 10 rânduri**
MF-95 (firewall — **operator**), MF-96 (consola Proxmox, `rpcbind`, `spiceproxy` — **operator**), MF-03 (`TRUSTED_PROXIES` — **operator**, o variabilă, efect de cookie + de DoS pe autentificare), MF-04 (rezolvarea adresei din `X-Forwarded-For`), MF-101 (adresa vizitatorului pe traseul public), MF-102 (încrederea în bridge-ul Docker), MF-107 (rutele cu token intern: 200 + comparație în timp neconstant), MF-108 (limite superioare pe colecții), MF-109 (CSP + HSTS), MF-106 (dependențe cu vulnerabilități).

**C. Vizibilitatea și operația — 16 rânduri**
MF-100 (monitorizare + alertare), MF-116 (vizibilitate PostgreSQL), MF-117 (curățarea celor 7 099 de e-mailuri nedeliverate și a celor 9 baze de test), MF-114 (`/api/status` în 4 s), MF-118 (`/api/status` nu dezvăluie topologia), MF-119 (`requestId` corelabil), MF-115 (versiuni de imagini + rollback), MF-120 (stack pe `0.0.0.0`, LLMNR), MF-121 (patch-uri OS), MF-122 (derivație `main`/`origin`), MF-111 (6 cereri identice pe landing), MF-112 (indici lipsă), MF-113 (N+1 în `priceItems`), MF-110 (compresie gzip/brotli), MF-104 (DDoS — **operator**, edge VM 102), MF-105 (stack de test cu secretele de producție).

**D. Administrarea și automatizarea — 31 rânduri**
MF-68, MF-69, MF-70, MF-71, MF-72, MF-73 (izolare și corectitudine la nivelul rolurilor), MF-74 (8 rute fără ecran), MF-75 (paginare și sortare), MF-76 (căutare), MF-77 (operații în masă), MF-78 (`/admin/money` real), MF-79 (contorul de promoții), MF-80 (promoții pe produse), MF-81 (cronurile raportează dacă rulează), MF-82, MF-83 (jurnalul complet), MF-84 (import + confirmare încasare), MF-85 (impersonare), MF-67 (maparea contului de panel), MF-86, MF-87, MF-88, MF-89, MF-91 (joburi eșuate păstrate, bucle care nu înghit erori, timeout de provisionare, mapping de ou, dead-letter), MF-51 (`usedCount`), MF-52 (registru de tranzacții), MF-53 (facturi în admin), MF-56 (politica de retenție la anulare), MF-57 (creditul la degradare), MF-61 (notificări de factură), MF-62 (webhook-ul de plată eșuată).

**Ce deblochează:** onestitatea față de clientul care plătește lunar (MF-93, MF-98), posibilitatea de a vinde către clienți B2B și către piața RO (MF-70 — GDPR), și **credibilitatea** oricărei promisiuni de uptime (MF-133, unda 4).

**Efort:** ~4–6 săptămâni. **~60% operator** — efortul e în infrastructură (edge, firewall, backup off-host, resurse), nu în cod.

**Criteriu de ieșire — măsurabil:**
> 1. **Un drill de restaurare executat, cu succes, pe o copie off-host**: se ia o copie, se pierde volumul principal, se restaurează într-o instanță separată, iar un fișier de test al unui client e prezent și corect. Data și rezultatul sunt scrise în registru.
> 2. `ss -lntp` pe hipervizor arată **doar** porturile necesare; `pve-firewall status` → `enabled`; `iptables -S INPUT` → nu mai e `ACCEPT` pe toate.
> 3. Cookie-ul de sesiune emis prin traseul public poartă `Secure`, iar **două logins reușite de la aceeași adresă** nu declanșează limitarea.
> 4. Un volum Docker cu o limită de memorie setată se oprește la limită, **fără** să oprească Postgres.
> 5. Un container oprit de o eroare produce un **alert** în canalul stabilit, în sub 5 minute.
> 6. Toate cele 8 rute de admin fără ecran au un ecran; listele paginate; căutarea în comenzi întoarce **doar** comenzile care se potrivesc.
> 7. Un rol de personal cu `staff.write` **nu** reușește să-și extindă singur permisiunile; `customers.write` **nu** suspendă un cont de admin.
> 8. `GET /admin/money` întoarce MRR calculat, nu un stub.

---

### 5.5 Unda 3 — „Poate afacerea să crească?"

**De ce e a patra:** după ce platforma ia bani, funcționează și e sigură, următoarea întrebare e dacă **costul marginal al următorului client e sub pragul lui**. Asta înseamnă conversie (probă gratuită, checkout oaspete, coș, pachete scurte), cost operațional (API public, CLI, notificări în aplicație) și acoperire de piață (română, Discord, 2FA).

**Conținut (28 rânduri):**

| Bloc | Ce | Rânduri |
|---|---|---|
| **Conversie** | Trei tipuri de plan (gratuit / unică folosință / abonament); intervale de zi și săptămână | MF-28, MF-29, MF-134 (MF-134 e în unda 4 ca diferențiator, dar depinde de MF-28) |
| **Conversie** | Coș și comandă multi-produs; checkout de oaspete | MF-38, MF-39 |
| **Conversie** | Plan gratuit de probă legat de perioada de facturare | MF-134 |
| **Piață** | Localizare în română, formatare monetară corectă | MF-12 |
| **Piață** | Login social (Discord, GitHub, Google) | MF-02 |
| **Credibilitate** | 2FA pentru client, staff și admin | MF-01 |
| **Operare** | API public mic, cu chei | MF-123 |
| **Operare** | CLI de administrare | MF-124 |
| **Operare** | Notificări în aplicație; email piping; credit de cont; motiv de anulare | MF-65, MF-66, MF-49, MF-50 |
| **Operare** | Session management completă: rotire fără cursă, e-mail schimbat închide sesiunile, cont închis închide sesiunile, expirare glisantă | MF-07, MF-05, MF-06, MF-10 |
| **Operare** | Ecran de enrolare a primului administrator (bootstrap fără SQL) | MF-13 |
| **Catalog** | Preț anual real; limită per utilizator per produs; stoc; taxă de setup | MF-27, MF-20, MF-21, MF-31 |
| **Catalog** | Alocări multiple pe server; instalare cu un click și modpack-uri | MF-90, MF-131 (MF-131 e în unda 4) |
| **Creștere** | Program de afiliați | MF-125 |
| **Extensibilitate** | Puncte de extensie documentate (hookuri de lifecycle, evenimente publice) — ca intenție, nu ca implementare | MF-126 |
| **Extensibilitate** | Multi-tenant — **decizie de scope**: nu se construiește | MF-127 |
| **Conținut** | Blog și secțiune „Platform" reală în locul mock-ului | MF-128 |
| **Infra** | Multi-monedă | MF-30 |

**Ce deblochează:** canalul de recomandare (afiliați), vânzarea către clienti B2B la preț mic (API), și un **cost operațional per client care scade**.

**Efort:** ~6–8 săptămâni, practic toate în cod.

**Criteriu de ieșire — măsurabil:**
> 1. Există un plan **gratuit** și un plan de **7 zile**; un client le poate cumpăra fără card, iar perioada se încheie corect.
> 2. Interfața e integral în **română**, cu formate de dată și sumă românești; `locale='en-IE'` nu mai apare în cod.
> 3. Un utilizator poate **pune 2FA** și se poate autentifica cu **Discord**.
> 4. Un client poate obține o **cheie API**, apela un endpoint documentat și vedea starea instanței lui.
> 5. Un bilet răspuns în aplicație **fără** să deschidă e-mailul.
> 6. Un client poate cumpăra **două produse într-o singură comandă**.
> 7. Sesiunile unui cont închis **mor** în același moment.

---

### 5.6 Unda 4 — „De ce clientul alege Blipmade și nu un VPS sau un concurent?"

**De ce e ultima:** nu pentru că e lipsă de importanță, ci pentru că **depinde de cei trei vali anteriori**. O recenzie nu se scrie înainte de a exista clienți reali; o țintă de uptime nu se publică înainte de a exista backup și monitorizare; un backup cu cotă în planul de intrare nu se vinde înainte de a exista backupul. Construirea acestor lucruri înaintea momentului potrivit ar fi **activitate fără efect**.

**Conținut (7 rânduri):** MF-129 (backup cu cotă în planul de intrare), MF-130 (DDoS declarat explicit în planul de intrare), MF-131 (instalare cu un click + semantică de sloturi), MF-132 (recenzii, referințe, studiu de caz), MF-133 (țintă de uptime publicată și credibilă), MF-134 (treaptă gratuită — acționează în unda 3, se **vinde** în unda 4), MF-135 (utilizabilitate reseller — **decizie de scope**: nu se construiește, se documentează).

**Ce deblochează:** poziționarea. Prețul nu e pârghia (e deja calibrat: €4,49 pentru 4 GB / 2 vCPU — la nivelul Zentaris, cu €0,50 peste OVI și €0,25 sub Torchbyte). Câștigul vine din **backup + DDoS**, singurele două lucruri pe care concurenții le pun în plan și pe care Blipmade le poate executa mai ieftin și mai onest.

**Efort:** ~4 săptămâni, după primii clienți.

**Criteriu de ieșire — măsurabil:**
> 1. Planul de intrare publicat include **explicit** backup zilnic cu cotă și **explicit** protecție DDoS — vizibile pe pagina de preț, nu în nota de subsol.
> 2. Există **cel puțin o recenzie publică** de la un client care a folosit efectiv serviciul, și **cel puțin un studiu de caz** scris de un client nominal.
> 3. Pe pagina de preț apare o **țintă de uptime publicată**, iar valoarea ei e susținută de un backup funcțional și de monitorizare care alertează.
> 4. Un vizitator nou poate crea un cont și porni un server **gratuit**, fără card.
> 5. Un produs de joc oferă instalare cu un click a unui modpack, cu sloturi.

---

## 6. Ce NU trebuie construit — și ce se pierde în schimb

O platformă mică care copiază WHMCS pierde. Lista de mai jos preia, verifică și rafinează cele 10 poziții din `COMPETITIVE-GAP-ANALYSIS.md` §6, cu **numele trăducerii explicite** pentru fiecare. Fiecare rând spune ce se **cedează** — pentru că o decizie fără cost declarat nu e o decizie.

| # | Ce **NU** să construiești | De ce | Ce se **cedează** (trăduirea) | Ce faci în schimb |
|---|---|---|---|---|
| 1 | **Un clone de WHMCS** — dunning, facturi draft, gestionarea disputelor, ofertări, 20 de gateway-uri | WHMCS costă $34,95/lună și are 500+ integrații; FOSSBilling e **gratuit** și are facturi PDF, multi-monedă și chei API; Paymenter e **MIT**. Reproducerea setului e ani de lucru și n-ar ajunge la nivelul pieței | **Clienții B2B cu proces formal de facturare** (facturi cu aprobare, termene de plată, dispute) — pe care platforma nu îi poate deservi | Un motor de facturare existent ca motor intern, dacă va fi nevoie; concentrarea pe **provisionare**, unde e singura activitate cu adevărat |
| 2 | **Multi-monedă cu sincronizarea cursului** | Toți cei trei concurenți RO afișează prețul în **EUR**; OVI plătește în lei la BNR+2%, dar afișează EUR. Moneda unică e **coerentă cu piața** | **Clienții din afara zonei EUR** care ar plăti în moneda lor | O monedă, afișată corect; pentru clienții RO: **factură în lei**, preț în EUR (MF-30 rămâne, dar e Low-Info, nu urgent) |
| 3 | **Sistem de teme și marketplace de extensii** | Nu există ecosistem, nu există bază de utilizatori, nu există terți. Un marketplace gol e un eșec **public** | **Personalizarea** de către clienți și **extensibilitatea** terților — și ocazional, un argument de vânzare „ecosistem" | Un design system intern, bine făcut — care există deja (`web/src/ui-app.tsx`) |
| 4 | **Departamente de ticketing, ticketing prin IMAP, chat live** | Un operator, trei bilete. Zentaris a renunțat explicit la suportul tehnic pe planurile de joc și continuă să câștige | **Volumul** de suport și timpul de răspuns la incidente — acceptabil ca preț al unei platforme cu un singur operator | Un formular de bilet care funcționează, **cu atașament** (MF-60) — un singur lucru, bine făcut |
| 5 | **Motor de cupoane avansat, gift cards, loyalty, cashback** | `Promotion` cu procent/fix, plafon, per-utilizator și fereastră de validitate există și sunt suficiente pentru o campanie de lansare | **Loyalitatea pe termen lung** și campanii complexe de tip „cumpără 3, primește 1" | Folosim ce există: o campanie Discord e realizabilă mecanic (`PROMO-02/03/07` sunt `VERIFIED FIXED`) |
| 6 | **Module de reseller VPS** (Proxmox, Hetzner, Linode — ca în marketplace-ul Paymenter) | E altă piață, altă marjă, alt model de cost. Nodul Blipmade e un nod de jocuri; un VPS pe același nod are un cost de calcul și un risc de vecinătate diferite | **Segmentul de revânzare VPS** — și, implicit, diversificarea veniturilor | **Zero.** Dacă diversificarea e dorită, e o decizie de business separată, nu o funcție de platformă |
| 7 | **Un API public REST complet, cu 48 de endpoint-uri** (ca Paymenter) | Blipmade nu are contract de preț stabilizat public și nu are consumatori. Un API mare, înainte de a exista consumatori, e întreținere pură | **Integrarea avansată** (automatizări complexe, reselleri, agregatori) | Un **API read-only mic** (servicii, facturi, instanțe, bilete) — dar **după** ce plățile și catalogul funcționează (MF-123, efort M, în unda 3) |
| 8 | **Blog, SEO și marketing automation ca platformă** | Nu blochează o vânzare și consumă buget de la operațiuni — iar bugetul de operații e cel mai strâns resursă din acest moment | **Traficul organic** — un canal de vânzare care ar necesita fonduri | O pagină de produs corectă și, mai târziu, conținut (MF-128, Low-Info, în unda 3) |
| 9 | **MFA complet, SSO, SCIM, RBAC avansat** | Nu e cerință de segment pe piața țintă. Dar **2FA singur** e altă chestie: platforma deține chei Stripe și token-uri de panou, iar costă o zi | **Federarea enterprise** și **provizionarea automată de utilizatori** | **Doar 2FA (TOTP)** pentru conturile staff și admin (MF-01, efort M, în unda 3) |
| 10 | **Servirea simultană a segmentelor S1 (gaming), S2 (self-hosted) și S3 (reseller)** | Resursele sunt limitate; un produs cu 4 GB nu-i place nici pe S1 (prea scump) nici pe S2 (prea puțin). Răspunsul corect e **un plan de 2–6 GB optimizat pentru 4 GB** | **Cea mai mare parte a pieței** — pe care o platformă cu un singur operator nu o poate servi oricum | Un singur produs de intrare bine calibrat, plus un upgrade clar (MF-32) |
| 11 | **Consolidarea serviciului într-un singur plan de 2 GB** | E o economie de 0,04 €/lună la nivel de preț — deci **nu e o economie**, e o regresie de produs. Clientul de gaming care plătește 4 GB nu are alternative la 2 GB pe aceeași platformă | **Nimic.** | Nu se face. Se **cresc** dimensiunile planului de intrare la 4 GB, cu preț calibrat |
| 12 | **Dezinstalarea nodului de joc ca „funcție"** | E o sarcină de infrastructură care înseamnă Daemon pe Docker, permisiuni Unix și dealocare de fișiere — cu tot cu riscul de ștergere accidentală a datelor clientului | **Capacitatea de a muta un client în afara platformei**, automat | Manual, cu operator prezent. Poate deveni funcție mai târziu, după ce apare o cerere reală |

**Regula de aur, reformulată pentru acest roadmap:** *fiecare funcție nouă trebuie să închidă un gol pe care un concurent îl acoperă deja și care apare **înainte de momentul plății**.* Funcțiile care nu se potrivesc intră în coadă, oricât de elegant ar fi.

**Ce *nu* e pe listă, pentru că se poziționează greșit:** **niciuna dintre cele 38 de constatări reparate nu trebuie „mbunătățită" înainte de lansare.** Ele sunt deja în cod, cu teste. Cheltuielile se fac pe ce nu e livrat, nu pe ce e livrat.

---

## 7. Harta dependențelor — operator vs. cod

### 7.1 Principiul

Dintre cele **135 de rânduri** din matrice:

| Dependență | Rânduri | Ce înseamnă |
|---|---:|---|
| **Doar operator** | 28 | Nu se poate rezolva scriind cod. E nevoie de o cheie, o decizie, o achiziție sau o configurație într-un sistem extern |
| **Operator + cod** | 16 | Operatorul deblochează, codul livrează. Niciunul nu e suficient singur |
| **Doar cod** | 90 | Se poate scrie și livra fără intervenție externă |
| **Decizie de scope (nu se construiește)** | 1 | MF-135 (utilizabilitate reseller) — documentat, nu acționat |
| **Total** | **135** | **44 de rânduri (33%) au o componentă de operator** |

Aceasta e cea mai importantă cifră din tot documentul: **unul din trei gapuri nu poate fi închis de un dezvoltator.** Un plan de roadmap care arată doar 90 de rânduri de cod ar ascunde jumătate din timpul real de deblocare.

### 7.2 Cele 44 de dependențe de operator — acțiunea exactă

Fiecare rând de mai jos e o acțiune concretă. „Variabila" înseamnă variabila de mediu exactă; „acțiunea" înseamnă ce trebuie făcut manual.

#### 7.2.1 Blocul „dezblochează vânzarea" — 8 acțiuni, ~3 zile de operator

| ID | Ce e nevoie | Variabila / acțiunea exactă | Unde | Efort |
|---|---|---|---|---|
| MF-33 | Chei Stripe + pornirea plăților | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_ENABLED=true`; înregistrarea endpoint-ului de webhook în Stripe | `/opt/blipmade/.env` + contul Stripe | S |
| MF-44 | Politica de TVA | **Decizie**: rată, bază (net sau TVA-inclus), tratamentul B2B/reverse-charge; apoi valoare în config | operator + `stripe.ts:438-460` | M |
| MF-14 | Imaginile și ourile celor 4 produse lipsă | **Achiziție/editare de conținut**: imagine, descriere, `eggId` valid per produs | catalog + panou | L (conținut) |
| MF-16 | Un produs de joc real | **Decizie + conținut**: ce joc (ex. `minecraft-paper`), ou, limită de resurse, starter app | catalog + panou | M + L |
| MF-17 | Starter app pe produs | **Conținut**: aplicația reală în `starter-apps.ts` pentru fiecare produs vândut | repo | M |
| MF-15 | Corectarea marcajului `deployable` | **Decizie**: `deployable=false` până când produsul are imagine și ou | baza de date | S |
| MF-37 | Refund funcțional | Dispune de cheile Stripe (depinde de MF-33) + **decizie** de politică de rambursare | operator | S |
| MF-32 | Plafonul de portofoliu peste 6 GB | **Decizie de produs**: se păstrează 6 GB sau se extinde; dacă se extinde, se recalculează prețul | operator | S |

#### 7.2.2 Blocul „dezblochează folosirea" — 3 acțiuni, ~1 săptămână de operator

| ID | Ce e nevoie | Variabila / acțiunea exactă | Unde | Efort |
|---|---|---|---|---|
| MF-92 | Adresă publică pentru instanțe | `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`; plus un **rDNS/record A** pentru subdomeniul de instanță și un test de rutare real | `.env` pe VM 103 + edge Caddy pe VM 102 + DNS | L (include accesul la edge) |
| MF-59 | E-mail funcțional | `SMTP_URL` (cu user/parolă sau token); apoi verificarea livrării în inbox, nu doar în fișier | `.env` pe VM 103 | S |
| MF-58 | Stările realiste ale instanței | **Acces la panoul Pterodactyl** pentru ca API-ul să verifice starea containerului, nu s-o presupună | acces operator la panou | M |

#### 7.2.3 Blocul „dezblochează operarea" — 19 acțiuni

| ID | Ce e nevoie | Variabila / acțiunea exactă | Efort |
|---|---|---|---|
| MF-93 | Copie în afara gazdei | `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY`; **instalarea lui `rclone`** pe VM 103; apoi un drill de restaurare | S |
| MF-94 | RAID pe `/` | **Decizie de infrastructură**: RAID 1 pe volumele de root, cu downtime aprobat | L |
| MF-95 | Firewall | **Decizie de infrastructură**: `pve-firewall` pe hipervizor + `iptables`/`nftables` pe gazda platformei; ambele erau `ACCEPT` pe toate | M |
| MF-96 | Hipervizorul închis din exterior | **Decizie**: blocarea lui `*:8006`, a lui `rpcbind` (`0.0.0.0:111`) și a lui `spiceproxy`; reconfigurarea accesului la panou | M |
| MF-101 | Adresa vizitatorului pe traseul public | `TRUSTED_PROXIES` — **cea mai ieftină acțiune din tot roadmap-ul**: o variabilă, efect de cookie `Secure` + de DoS pe autentificare | S |
| MF-102 | Încrederea în bridge-ul Docker | `TRUSTED_PROXIES` + `DOCKER_SUBNET`; restricționarea regulilor iptables pe bridge | M |
| MF-97 | Limite de resurse pe containere | `mem_limit` / `cpus` / `memory` în compose; **plus swap pe gazdă** | S |
| MF-98 | PITR | **Decizie**: WAL archiving + `pgbackrest`/`barman`, sau acceptarea explicită a pierderii de până la 24 h | M |
| MF-99 | Volumul de atașamente în backup | **Decizie**: montarea volumului de atașamente în același job de backup | M |
| MF-100 | Monitorizare și alertare | **Decizie + achiziție**: un agent de monitorizare și un canal de alertare (e-mail sau telefon) | M |
| MF-103 | Rotirea jurnalelor Docker | Configurarea `max-size` / `max-file` în `daemon.json` + un job de curățare | S |
| MF-104 | Protecție DDoS | **Achiziție**: un edge cu filtrare la VM 102, undeva înainte de `node1.` și `panel.` | L |
| MF-105 | Stiva de audit izolată | **Decizie**: secretele proprii pentru stiva de test + restricționarea la `127.0.0.1`; webhook cu semnătură | S |
| MF-106 | Dependențe actualizate | `npm outdated` + `npm audit fix`; `nodemailer` e mult în urmă | M |
| MF-107 | Politica de retenție la anulare | **Decizie**: cât timp se păstrează datele unui client anulat (GDPR) | S |
| MF-115 | Versiuni de imagini | **Decizie**: registru de imagini sau etichetare cu hash, plus o cale de rollback | M |
| MF-116 | Vizibilitate PostgreSQL | `log_min_duration_statement` — de la `-1` la o valoare prag | S |
| MF-117 | Curățarea producției | **Curățare manuală**: 7 099 de e-mailuri nedeliverate în coadă + 9 baze de test | S |
| MF-120 / MF-121 / MF-122 | Igienă de infrastructură | Publicarea stivei de audit doar pe `127.0.0.1`; dezactivarea LLMNR; aplicarea patch-ului de securitate în așteptare; sincronizarea ramurii `main` cu `origin` | S |

#### 7.2.4 Blocul „creștere și poziționare" — 9 acțiuni

| ID | Ce e nevoie | Ce e nevoie concret | Efort |
|---|---|---|---|
| MF-27 | Preț anual | **Decizie comercială**: cât costă un an, pentru ce plan | S |
| MF-28 | Tipuri de plan | **Decizie comercială**: care planuri se vând (Free / One Time / Recurring) și ce preț | S |
| MF-12 | Localizare în română | **Decizie**: traducerea se face acum sau mai târziu (e un cost de traducere, nu de cod) | M |
| MF-16 / MF-129 | Planul de intrare cu backup + DDoS | **Decizie comercială**: ce intră explicit în prețul afișat | M |
| MF-130 | DDoS declarat în preț | **Decizie de ambalare** a aceleiași capacități (MF-104) | S |
| MF-132 | Recenzii și studiu de caz | **Acțiune comercială**: identificarea și obținerea unui studiu de caz de la primii clienți — nu se poate scrie | M |
| MF-133 | Țintă de uptime | **Decizie**: ce țintă se publică; trebuie susținută de backup (MF-93) și monitorizare (MF-100) | S |
| MF-134 | Plan gratuit | **Decizie**: dacă un trial consumă resurse reale, el costă și trebuie taxat | M |
| MF-66 | Email piping | **Decizie**: se acceptă că un răspuns pe e-mail ajunge în bilet prin IMAP | M |

### 7.3 Dependențe de terț — ce trebuie să existe înainte ca o linie de cod să fie utilă

| Furnizor | Ce depinde de el | De ce nu se poate evita |
|---|---|---|
| **Stripe** | MF-33, MF-37, MF-43, MF-44, MF-46, MF-47, MF-48 | Singurul provider de plată din stack |
| **Furnizor SMTP** | MF-59 | E-mailul e canalul de suport și de factură |
| **Edge / Caddy (VM 102)** | MF-92, MF-104 | Singurul punct prin care trece traficul public |
| **DNS** | MF-92 | Adresa publică a instanței |
| **`rclone` + țintă off-host** | MF-93, MF-99 | Singura copie care supraviețuiește pierderii gazdei |
| **Pterodactyl (panel)** | MF-17, MF-58, MF-77, MF-81 | Provisionarea, stările, consola, fișierele |
| **Docker registry** | MF-115 | Versiuni și rollback |
| **GitHub** | MF-122 | Sursa codului deployat |

### 7.4 Calea critică a operatorului — ce se poate face în primele 72 de ore

Toate acestea sunt efort `S` și sunt **pure acțiuni de operator**, fără scris de cod:

1. `STRIPE_*` + `PAYMENTS_ENABLED=true` → **MF-33**
2. `SMTP_URL` → **MF-59**
3. `DOMAIN_BASE` + `CADDY_ADMIN_*` → **MF-92**
4. `TRUSTED_PROXIES` → **MF-101**, cu efect de cookie `Secure` și de eliminare a DoS-ului pe autentificare
5. `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` + `rclone` → **MF-93**
6. `deployable=false` pentru `wordpress` → **MF-15**

**Six acțiuni, un efort total de câteva ore, care deblochează 9 dintre cele 12 rânduri `P0`** și scoate platforma din starea „nu poate lua bani". Niciuna nu necesită scris de cod. Aceasta e cea mai importantă observație din tot roadmap-ul: **platforma nu e blocată de un dezvoltator, e blocată de o listă de secrete lipsă.**

### 7.5 Dependențe de cod — grupate tematic

Nu le repet pe rând; sunt în matrice. Gruparea arată unde se concentrează efortul de dezvoltare:

| Temă | Rânduri | Observație |
|---|---|---|
| **Finanțiar** — cotă, comandă, factură, webhook, promoție | MF-25, MF-26, MF-36, MF-37, MF-43, MF-45, MF-46, MF-47, MF-48, MF-49, MF-50, MF-51, MF-52 | **13 rânduri** — cel mai mare bloc. E aici jumătate din riscul de plată |
| **Administrare** — roluri, liste, ecrane lipsă, navigație | MF-66…MF-85 (parțial) | **20 de rânduri** — dominat de izolarea rolurilor și de listele fără paginare |
| **Infrastructură** — backup, limite, logare, metrici | MF-96…MF-123 (parțial) | **28 de rânduri**, din care majoritatea au și componentă de operator |
| **Catalog și preț** | MF-14…MF-32 | **19 rânduri** — dominat de conținut, nu de cod |
| **Experiență client** — sesiuni, e-mail, bilete, metrici | MF-03…MF-11, MF-58…MF-65 | **18 rânduri** |
| **Automatizare** — coadă, worker, provisionare | MF-86…MF-91 | **6 rânduri** — mici, dar fiecare e un „nu știm de ce a eșuat" |

---

## 8. Evaluarea onestă — ce este Blipmade **astăzi**

### 8.1 Cele șapte fapte măsurate

1. **Plățile sunt oprite.** `PAYMENTS_ENABLED=false`, cheile Stripe sunt goale. Venitul realizat e **zero**, și e zero de la început: nicio instanță nu a fost servită vreodată unui client real.
2. **Un singur produs e vândabil.** `discord-bot` are imagine și ou. `wordpress` e marcat `deployable=true` **fără** imagine. Celelalte trei nu au nici una. Catalogul arată cinci produse; platforma poate onora unul.
3. **Niciun produs de joc.** `enum Category` nu are categorie de jocuri. Infrastructura e dimensionată pentru hosting de jocuri, iar catalogul nu conține jocuri.
4. **Niciun e-mail nu pleacă.** `SMTP_URL` e gol; transportul scrie în fișier (`mail.state = written-to-file`). Confirmările de cont, resetările de parolă, notificările de bilet și facturile — toate se opresc la coadă.
5. **Nu există adresă publică.** `DOMAIN_BASE` și credențialele Caddy neconfigurate ⇒ `gateway.ts:176-178` e fals. Un server fără adresă nu e un produs.
6. **Nu există copie în afara gazdei.** `OFFSITE_TARGET` și `OFFSITE_ENCRYPTION_KEY` lipsesc, `rclone` nu e instalat. Timerul de backup rulează și **nu mută nimic**: `ExecStartPost` iese 0. RPO la pierderea hostului: **∞**. RAID 0 pe `/` înseamnă că pierderea unui disc pierde tot.
7. **Hipervizorul e descchis.** `pve-firewall` e `disabled`, `iptables -S INPUT` dă `-P INPUT ACCEPT`, `pveproxy` ascultă pe `*:8006`, `rpcbind` pe `0.0.0.0:111`, `spiceproxy` la fel. Root cu parolă, accesibil.

### 8.2 Ce funcționează — și trebuie spus, pentru că e real

Nu e o cochilie. **38 din 182 de constatări sunt `VERIFIED FIXED`, iar 25 din cele 41 relevante pentru plată sunt reparate.** Calea banului e tranzacțională (`BE-01` reparat), numerotarea comenzilor e atomică, provisionarea e condiționată de plată, o comandă anulată nu poate fi plătită și onorată, `invoice.paid` înainte de `checkout.session.completed` nu se pierde, copierea promoției ajunge la Stripe, prețul de pornire corespunde configurației, și există un singur contract de preț în tot sistemul.

Latentele sunt bune: `/api/auth/session` (fără sesiune) p50 **1,23 ms**, `/api/catalog/products` p50 **8,14 ms**, `/api/admin/overview` p50 **11,17 ms**. Doar `/api/status` e lent — p50 **3 963 ms**, pentru că face 2+N apeluri seriale spre panou.

RTO-ul de restaurare a bazei de date e **≈ 3 s** (măsurat, cu drill), repornirea stivei din imaginile existente **≈ 46 s** (măsurat), iar refacerea după pierderea hostului e **„ore, nu minute"** — și, mai exact, **∞ pentru datele clienților**, pentru că nu există backup al volumelor și nici al secretelor.

### 8.3 Pentru cine funcționează azi

**Funcționează, astăzi, pentru:**
- **Un operator unic** care administrează totul manual prin SQL și shell, într-o rețea privată, cu un catalog de un produs. Nu e un produs de hosting; e un **tool intern de provisioning**.
- **Un client de Discord** care primește un server, dacă acceptă că nu primește e-mail și că factura nu se vede.
- **Un dezvoltator** care folosește stiva ca platformă pe care să construiască — caz în care cele 90 de rânduri de cod din acest roadmap sunt exact ce trebuie.

**Nu funcționează pentru:**
- **Un client care plătește.** Nu există plată.
- **Un client care are nevoie de o adresă publică.** Nu există.
- **Un client B2B din UE.** Nu există factură cu TVA.
- **Un client care are nevoie de date sigure.** Nu există copie în afara gazdei.
- **Un client care are nevoie de un server de joc.** Nu există produs de joc.
- **O platformă care cere încredere.** Nicio recenzie, nicio referință, nicio țintă de uptime publicată.

### 8.4 Ce se interpune între „azi" și „vândabil"

În ordine, fără nicio scurtătură:

1. **O cheie Stripe și `PAYMENTS_ENABLED=true`** — câteva minute.
2. **Un produs cu imagine și ou** care să poată fi cumpărat, și **un produs de joc** — câteva zile de conținut.
3. **O factură vizibilă, cu TVA** — câteva zile de cod plus o decizie fiscală.
4. **O adresă publică** pentru instanțe — o zi de operator, cu acces la edge.
5. **Un e-mail care pleacă** — o zi de operator.
6. **O copie în afara gazdei, cu un drill executat** — o zi de operator, plus decizia de RAID.
7. **Un perimetru închis** (firewall, hipervizor, `TRUSTED_PROXIES`) — câteva zile de operator.
8. **Stări oneste și suport care ajunge la cineva** — câteva zile de cod.

Astea opt puncte **în ordine** reprezintă, după estimarea efortului din acest document, **4–6 săptămâni de lucru efectiv**, dintre care **aproximativ jumătate e de operator** — deci nu poti fi accelerate de un dezvoltator.

### 8.5 Ce nu e spus, pentru că ar fi o minciune

- Nu putem afirma că platforma a fost vândută unui client. **Nu a fost.** Nu există niciun client, nicio comandă, nicio factură, niciun bilet, nicio tranzacție în baza de producție.
- Nu putem afirma că backupul funcționează. **Nu funcționează ca protecție.** Funcționează ca *job programat*.
- Nu putem afirma că protecția DDoS lipsește cu certitudine: `PORT-03` e `NOT VERIFIED` — auditorii n-au avut acces la edge. Ce e cert: platforma nu are nicio protecție DDoS configurată, iar fiecare concurent verificat o include în planul de intrare.
- Nu putem afirma că interfața e „gata". Există 29 de endpoint-uri fără apelant în UI, 8 rute de admin fără ecran, și 5 constatări de regresie în zona de administrare.
- Nu putem afirma că „38 de 182 sunt reparate" înseamnă „38 de 182 sunt în funcțiune". Reparate **în cod**, cu dovezi. `DR-02` e exemplul care avertizează: programarea backupului e reparată, **copia nu**.

### 8.6 Concluzia în cinci rânduri

Blipmade nu e o platformă de hosting cu câteva bug-uri. E **o platformă de hosting în care lipsește ultima mile a comercializării** — și ultima mile e, în proporție surprinzătoare, **operațională, nu tehnică**. Platforma are adâncime reală acolo unde era greu: coada de plată, modelul de preț, provisionarea, izolarea rolurilor. Ce nu are, e stratul de **livrare**: produsul, adresa, e-mailul, factura, backupul, perimetrul. Toate acestea au fost identificate, sunt măsurate, au un efort estimat și, în 33% din cazuri, **necesită o cheie sau o decizie, nu un commit**.

E o platformă care merită să fie vândută — **după** ce se întâmplă lucrurile din primele 72 de ore. Nu înainte.

---

## 9. Cele cinci lucruri care schimbă cel mai mult maturitatea comercială

Ordinea de mai jos nu e după severitate și nici după efort. E după **câte ieșiri comerciale blochează fiecare** și **cât de repede se deblochează**. Un lucru ieftin care deblochează zece alte lucruri stă înaintea unuia scump care deblochează unul.

---

### 1. `MF-33` — Pornirea plăților

**Ce e:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` setate și `PAYMENTS_ENABLED=true`; endpoint-ul de webhook înregistrat în Stripe.

**De ce e primul:** fără el, **tot restul e teorie**. Nu există client, nu există factură, nu există bilet, nu există recenzie, nu există produs de gaming pe care să-l testeze cineva. E o cheie, nu o funcție. E singurul element din tot roadmap-ul care transformă **toate celelalte** din teoretic în testabil.

**Cum se măsoară:** o plată reală ajunge în Stripe, cu `payment_intent` și `checkout.session` pentru aceeași comandă, în aceeași sumă.

**Cine și cât:** operator, `S`. În plus, trei rânduri de cod care se pot face în paralel (MF-34, MF-36, MF-46) — dar niciunul nu contează până când plățile sunt pornite.

---

### 2. `MF-14` + `MF-16` + `MF-17` — Catalogul vândabil și onest

**Ce e:** imagini și ouri pentru cele 4 produse lipsă, `deployable=false` pentru `wordpress` până când e real, **un produs de joc adăugat**, și conținutul de pornire care să fie aplicația vândută, nu un „Hello world".

**De ce e al doilea:** chiar cu Stripe pornit, catalogul afișează cinci produse și onorează unul. Un client care plătește pentru `wordpress` primește un container generic — și **fiecare astfel de vânzare devine un risc de rambursare**. Iar fără produs de joc, infrastructura e folosită pentru altceva decât fusese dimensionată.

**De ce e al doilea, nu al treilea:** de aceeași rațiune ca la punctul 1 — înainte de a avea ceva de vândut, niciun e-mail, nicio factură și nicio adresă publică nu își dovedesc valoarea.

**Cum se măsoară:** interogare directă în baza de date — **zero produse cu `deployable=true` fără imagine și fără ou**. Plus: un client provisionează produsul și obține aplicația, nu un starter.

**Cine și cât:** operator (conținut + decizie de produs) și cod (starter apps). Efort `M` de cod, `L` de conținut.

---

### 3. `MF-43` + `MF-44` — Factură vizibilă, cu TVA

**Ce e:** rândul de factură apare în interfața clientului, și există o rată de TVA configurabilă cu tratament B2B.

**De ce e al treilea:** plata fără factură nu e o vânzare pentru un client de business. În UE, o firmă fără factură cu TVA **refuză plata** sau plătește pe cont, cu toată întârzerea și incertitudinea pe care o introduce. În plus, factura Stripe n-are datele fiscale ale emitentului și nu e în limba clientului — e utilizabilă poate de un hobbyist, sigur nu de o firmă.

**De ce nu e primul:** pentru primii doi clienți — hobbyiști care plătesc cu cardul — plata fără factură vizibilă *merge*, doar cu un bilet. Nu e un blocaj absolut, e un blocaj de **calitate a vânzării** și de **piață**.

**Cum se măsoară:** după o plată, clientul vede factura lui, cu TVA, pe pagina lui. Un client B2B primește ceva ce poate duce la contabilitate.

**Cine și cât:** cod (`M`) + **decizie fiscală de operator** (`M` — rată, bază, B2B). Dacă e nevoie de factură cu antet fiscal și serie, e un proiect separat de `M`–`L`.

---

### 4. `MF-92` + `MF-59` — Adresă publică și e-mail care pleacă

**Ce e:** `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` plus rutarea unui subdomeniu real; și `SMTP_URL` cu o livrare confirmată în inbox.

**De ce e al patrulea:** acestea sunt cele două lucruri care transformă „a plătit" în „funcționează". Fără adresă, un server de joc e un proces într-un container. Fără e-mail, clientul nu află nici măcar că a plătit, și biletele lui nu ajung nicăieri.

**De ce nu e mai sus:** un client poate, în teorie, să primească accesul la server prin alt canal (Discord, telefon) — și asta chiar se întâmplă în infrastructurile mici. Dar e un workaround, nu un produs, și nu supraviețuiește primului client care pierde parola.

**Cum se măsoară:** o adresă publică care rezolvă și răspunde; un e-mail de confirmare de cont ajuns efectiv în inbox, nu în fișier.

**Cine și cât:** **doi operatori**, `S` pentru SMTP, `L` pentru adresa publică (implică acces la edge-ul de pe VM 102 și un test de rutare).

> **De semnalat, fiindcă e cel mai ieftin `Critical` din tot documentul:** `MF-101` — setarea lui `TRUSTED_PROXIES` — costă **o variabilă** și repară simultan un cookie de sesiune fără `Secure` și un DoS global pe autentificare. E `Critical`, e `S`, și e operator. Dacă se face **un singur lucru** din acest document în afara celor cinci, acesta e.

---

### 5. `MF-93` + `MF-95` — Date în afara gazdei și perimetru închis

**Ce e:** `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` + `rclone` + un drill de restaurare executat; și `pve-firewall` activ, `iptables` cu reguli explicite, `pveproxy`/`rpcbind`/`spiceproxy` închise din exterior.

**De ce e al cincilea, nu primul:** un client care plătește și folosește serverul **chiar acum** nu simte diferența dintre backup-ul care merge și cel care nu merge — până când îl pierde. Un client care plătește și folosește serverul **chiar acum** nu simte nici firewall-ul — până când cineva intră.

**De ce e al cincilea, nu lăsat la sfârșit:** acestea sunt cele două rânduri care închid întrebarea „ce se întâmple dacă pierdem tot?". RPO-ul curent la pierderea hostului este **∞**, RAID-ul e **0**, iar hipervizorul are **root cu parolă, accesibil din internet**. Un singur incident transformă „platformă nouă" în „platformă pierdută" — și niciun client nu are șanse să se întoarcă după o astfel de pierdere, pentru că datele lui nu mai există nicăieri.

**Cum se măsoară:** un drill de restaurare executat cu succes pe o copie off-host, cu data și rezultatul în registru; `ss -lntp` pe hipervizor arătând doar porturile necesare.

**Cine și cât:** **operator**, `S` pentru backup și `M` pentru perimetru. Plus o decizie de infrastructură cu downtime (`MF-94`, RAID 1 pe `/`).

---

### 9.1 De ce nu intră altceva în top 5

| Rând | De ce nu e în top 5 |
|---|---|
| `MF-104` (DDoS) | E `P0` și e un diferențiator major — dar **presupune o achiziție și o decizie de edge**, și platforma nu poate vinde un server public fără el. Se pune în unda 2, imediat după ce platforma e vândabilă; în top 5 ar fi o decizie de buget, nu de prioritate |
| `MF-36` (comandă anulată plătibilă) | E `Critical` pentru **banii** clientului — dar nu blochează vânzarea. E `S` și se face oricum, în unda 0 |
| `MF-66`/`MF-67` (escaladare de privilegii) | Sunt `High` și reale, dar devin urgente abia când există **mai mulți oameni** cu roluri diferite. Cu un singur operator, riscul e teoretic |
| `MF-73`/`MF-74` (paginare, căutare) | Se simt abia peste 200 de clienți sau peste primele 50 de bilete. Nu blochează nimic azi |
| `MF-12` (română) | E `High` pentru piața RO, dar e o **optimizare de conversie**, nu un blocaj |
| `MF-132` (recenzii) | E `High` și e cel mai puternic activ concurențial — dar **nu se poate construi**. Se obține din clienți, deci vine după punctele 1–5 |

---

## 10. Note finale de metodă

- **Documentul nu conține prețuri, termene sau angajamente inventate.** Toate cifrele provin din cele opt rapoarte ale acestei runde și din `_raw/PRODUCTION-STATE-2026-10-24.md`.
- **Nu am vizitat `blipmade.com` și nu am creat conturi pe platforma publică.** Nu am modificat codul sursă și nu am trunchiat `blipmade_test`.
- **Cele 48 de constatări `NOT VERIFIED` din revalidare nu apar ca rânduri de gap.** Nu putem afirma că o capacitate lipsește fără măsurare; apar doar în notele de sub-capitol, ca limite ale acestui document.
- **Cele două constatări invalidate de lead** (`ADM-01` — verificarea permisiunilor pe bilete; `FIN-P2-01` — numerotarea facturilor cu `count()+1`) **nu apar** în matrice.
- **Verdictele contradictorii au fost rezolvate în favoarea lead-ului**, ca în `ADM-02` (`STILL BROKEN`, nu reparat) și `DR-02` (parțial reparat, **prin acțiune de operator**).
- **Numărătoarele finale ale matricei:** 135 de rânduri — 70 `LIPSA`, 56 `PARȚIAL`, 9 `ANUNȚAT ȘI ABSENT`; 12 `P0`, 4 `Critical`, 33 `High`, 65 `Medium`, 21 `Low-Info`; 44 de rânduri cu componentă de operator (28 doar-operator, 16 operator+cod), 90 doar-cod, 1 decizie de scope.
- **Domeniile cu cele mai multe gapuri:** `OPR` (31) — infrastructura e domeniul cel mai întârziat; `ADM` (19); `IDN` (13); `PRD` (11); `FAC` (11); `CMD` (10).

**Dacă rețineți un singur rând din tot acest document, acesta e acesta:** *platforma nu e blocată de lipsă de funcții, e blocată de o listă de secrete neconfigurate.* `STRIPE_*`, `SMTP_URL`, `DOMAIN_BASE`, `CADDY_ADMIN_*`, `OFFSITE_TARGET`, `TRUSTED_PROXIES` — șase variabile, câteva ore de operator, și 9 din cele 12 rânduri `P0` se deblochează.
