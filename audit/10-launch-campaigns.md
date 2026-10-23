# 10 — Campaniile de lansare

**Data auditării:** 2026-10-23 · **Audit READ-ONLY.** Nicio campanie n-a fost rulată, niciun cod promoțional n-a fost creat, nicio comandă, nicio plată.
**Sursă unică a cifrelor economice:** `audit/09-financial-assumptions.md` (prin `audit/09-unit-economics.md` și `audit/09-pricing-recommendations.md`).
**Clase de verificare:** cele din `00-BRIEFING.md` §0; `OPERATOR-INPUT` pentru ipotezele de buget și de timp.

> **Regula acestui document:** fiecare campanie are o **precondiție de pregătire** care e verificabilă, nu o impresie. O campanie fără precondiție verificabilă e o campanie care va arde buget și încredere. Toate cele trei sunt **scenarii**, nu prognoze: nu se prezică numărul de participanți, de clienți sau de euro câștigați.

---

## 0. Pregătirea comună, obligatorie pentru toate cele trei campanii

### 0.1 Decizii de produs care preced orice campanie

| # | decizie | valoare | de ce | clasă |
|---|---|---|---|---|
| **D1** | **Prețul adoptat** | **€9.99/lună** la 512 MB / 1 vCPU / 5 GB ⇒ `baseAmount = 976` pentru `discord-bot` | singurul preț care trece toate cele patru praguri (contribuție €5,67 · payback 12 luni €7,82 · absorbție @16 €9,60 · payback 6 luni €9,97) | `VERIFIED` (`09-pricing-recommendations.md` §2.2) |
| **D2** | **Eliminarea ofertei „50% off / primii 50"** de pe homepage | blocul `web/src/home/Catalog.tsx:202-213` dispare sau devine „campaign not running" | **B1**: orice comandă cu cod eșuează la `verifyAmount`; `maxPerUser` e cod mort ⇒ „primii 50 eligibili" nu e limitabil per cont | `CODE-INSPECTED` (`05-promotions.md` §9) |
| **D3** | **Prețul minim al produsului, ridicat la 512 MB / 5 GB** (sau configurația minimă eliminată din wizard) | cu `baseAmount = 976`, configurația de 256 MB ar costa €9,76 — **mai mult** decât cea implicită | alternativă recomandată în `09-pricing-recommendations.md` §2.3 | `VERIFIED` (formula) |
| **D4** | **Fără plan anual în copy** | nicio mențiune de „annual" | **B7**: `YEARLY` nu există ca produs; **B4**: `renew()` fabrică facturi `PAID` false | `NOT-IMPLEMENTED` |
| **D5** | **Fără promisiuni de uptime / SLA / „24/7 support"** | — | nu există raport de uptime, nu există echipă de suport, `SMTP_URL` gol ⇒ niciun e-mail nu ajunge | `VERIFIED` |
| **D6** | **Blocul „Files, logs and domains included"** din planul de preț (`web/src/home/Rest.tsx:26`) se corectează | „domains" → se scoate sau se marchează „in beta" | `InstanceDomain` = 0 rânduri; API-ul Caddy nu a fost chemat niciodată ⇒ **niciun domeniu de client n-a fost rutat vreodată** | `VERIFIED` (`00-current-state.md` §3.4) |

### 0.2 Resursele existente pe care campaniile se pot baza

| resursă | stare | clasă |
|---|---|---|
| **3 instanțe `discord-bot` vii** (512 MB / 1 vCPU / 5 GB) | există, create de operator | `VERIFIED` (DB) |
| **`AuditLog` cu 528 rânduri** | scrie register, login, comenzi, provisionări, schimbări de credential | `VERIFIED` |
| **12 tichete deschise, 12 mesaje** de la 6 utilizatori | limbaj real al clienților, disponibil pentru mesajare | `VERIFIED` |
| **`/apps/discord-bot`** | pagină publică de produs, cu preț și resurse minime | `VERIFIED` (live) |
| **`/docs`** cu pagina de documentare a lui `discord-bot` | conținut real despre produs | `VERIFIED` (live: h1 „WordPress" implicit; pagina de produs e la `/docs`) |
| **Endpoint `/api/status`** cu 10 componente, fiecare măsurată | poate alimenta un panou de stare în comunitate | `VERIFIED` (`00-current-state.md` §3.12) |
| **Un server Discord** | **nu există**; și pe site nu există niciun link social (`grep` → zero rezultate) | `VERIFIED` (absență) |
| **Un mecanism de captare a lead-urilor** | **nu există**: niciun model `Lead`/`Waitlist`/`Newsletter` în cele 31 modele Prisma | `CODE-INSPECTED` (`api/prisma/schema.prisma`) |

---

## Campania 1 — **„Blipmade Bot Builders"** · ✅ **poate porni ÎNAINTE de repararea plăților**

> **De ce e sigură:** nu atinge niciun sistem de plată, nu folosește e-mail, nu generează reducere și nu promite un produs care nu poate fi cumpărat. Singurul efect al ei este **creșterea numărului de oameni reali în community și a numărului de conturi create** — ambele măsurabile azi, prin `AuditLog`.

### 1.1 Mecanică

Un **server Discord** al proiectului, cu trei niveluri de implicare, plus un **bot demonstrativ găzduit chiar pe Blipmade**:

| nivel | ce primește | cum intră | ce se măsoară |
|---|---|---|---|
| **Spectator** | canalul `#anunțuri`, un canal de prezentare a proiectului | link în subsolul site-ului, în `web/src/home/Rest.tsx:65` | înscrieri în server |
| **Participant** | canal `#ajutor`, un bot de welcome care trimite **fișierul de pornire** al botului | mesaj în `#ajutor` | mesaje, participanți |
| **Contribuitor** | canal `#construiește`, un thread săptămânal „unde e botul tău acum?" | postare în thread | **conturi Blipmade create** din linkul din thread → `AuditLog` |

**Botul demonstrativ:** una dintre cele 3 instanțe `discord-bot` deja vii (512 MB / 1 vCPU / 5 GB) este folosită ca „living demo" — botul de pe serverul Discord, cu link spre pagina lui de produs. Nu e nevoie de infrastructură nouă. `VERIFIED` (DB) + `INFERRED` (rolul în campanie)

**Regula de aur a campaniei:** în canalul Discord se spune **exact** ce se poate onora azi:

> „Blipmade găzduiește acum un singur tip de serviciu: un bot Node.js/Python. Nu găzduiesc încă jocuri, nici WordPress, nici baze de date — și nu vreau să vă vând ceva ce nu livrez."

### 1.2 Public țintă

| segment | caracteristici | de ce e ținta | clasă |
|---|---|---|---|
| **P1** — autor de bot Discord cu un proiect personal | are deja un bot; problema e că nu are unde să-l țină | e **singurul** segment cu un produs real (`deployable: true`) | `VERIFIED` |
| **P2** — autor de bot Discord cu un proiect de comunitate | same, dar cu mai mulți utilizatori ⇒ valoare mai mare a unui server permanent | idem | `INFERRED` |
| **P3** — persoană care a încercat VPS și a renunțat | a fost învățată de costul de configurare; e publicul vizat de promisiunea „No VPS" | promisiunea de brand (`web/src/home/Hero.tsx:56`) | `CODE-INSPECTED` |

**Ce NU e ținta:** jucători (niciun produs, porturi nepublicate), cei care caută WordPress/DB (necomandabile), cei care caută „găzduire ieftină" la €1.49 (contribuție negativă).

### 1.3 Ofertă

| element | oferit | de ce e onest |
|---|---|---|
| **Community** | gratuit, pentru tot timpul | nu costă nimic platformei |
| **Fișier de pornire** (cod, `package.json`, `Dockerfile`, ghid de deploy) | gratuit, în canal | e **singurul** produs real, deci ghidul e adevărat |
| **Prioritate la deschiderea plăților** | „când se deschid plățile, anunțăm înaintea listei" | **nu** e o reducere, e o **coadă** — implementabilă fără cod |
| **Preț de lansare** | ❌ **nu se promite acum** | **B1**: reducerea nu ajunge la Stripe ⇒ comanda eșuează; și **€4,99 > €4,19** = contribuția primei luni la prețul de €9,99 (`09-pricing-recommendations.md` §5.2) |
| **Plan anual / „2 luni gratis"** | ❌ **nu se promite** | **B7** + **B4** |
| **„Primii 50 eligibili"** | ❌ **nu se promite** | `maxPerUser` e cod mort ⇒ „eligibil" nu poate însemna „unul per cont" (`05-promotions.md` §5.2) |

### 1.4 Canale

| canal | rol | de ce | blocaj |
|---|---|---|---|
| **Serverul Discord** | canalul principal | singurul canal care nu depinde de nicio funcționalitate a platformei | **serverul trebuie creat** (nu există) |
| **Link în subsolul site-ului** | poarta de intrare | azi subsolul are doar `/docs`, `/status`, `/login` și butoane fără `href` | **mic** — `web/src/home/Rest.tsx:65` |
| **Pagina de produs `/apps/discord-bot`** | pagina de conversie | există, dar are ≈570 caractere de conținut | **mediu** — extindere de conținut |
| **Documentația** (`/docs`, pagina `discord-bot`) | răspunsul la „cum îl pun în funcțiune?" | conținutul există deja | **mic** |
| **Outbound către cei 6 utilizatori existenți** | 6 conversații reale | 12 tichete `OPEN` cu mesaje reale ⇒ **există deja cerere exprimată** | ❌ e-mailul nu pleacă ⇒ **mesaj manual, prin canalul existent** |

### 1.5 Assets necesare

| # | asset | forma | de unde | efort (`INFERRED`) |
|---|---|---|---|---|
| A1 | Server Discord: reguli, canale, roluri, bot de welcome | produs | creator nou | 4–8 h |
| A2 | Bot demonstrativ, deja existent | **există** | una din cele 3 instanțe vii | 0 h |
| A3 | Fișier de pornire (cod + ghid) | repo public sau gist | scris de la zero | 3–5 h |
| A4 | Linkul de Discord în subsol + în pagina de produs | cod | `web/src/home/Rest.tsx:65`, `web/src/app/ProductPage.tsx` | **<1 h** |
| A5 | Textul de „ce oferim azi" (canonic, în română și în engleză) | document | acest raport | 1–2 h |
| A6 | Pagina de produs extinsă | cod | ≈570 → 1500+ caractere | 4–6 h |
| A7 | Script de contorizare a înscrierilor (fără cookie) | cod | de construit | 2–3 h |
| A8 | Instrumentare: Search Console + contor server-side | cont + cod | de configurat | 2–4 h |

> **Efort total estimat: 18–30 h** (`INFERRED` — interval construit din numărul de active de mai sus; nu există un istoric de efort al echipei în repo).

### 1.6 Precondiție de pregătire

| precondiție | starea | clasă |
|---|---|---|
| **Niciuna legată de plăți** | — | — |
| Server Discord creat și moderat de un operator | ❌ **de făcut** | `VERIFIED` (absență) |
| Un operator prezent în comunitate, cu un răspuns zilnic | **operator-input** — există 2 membri de staff în DB | `VERIFIED` |
| Botul demonstrativ merge | ⚠️ **neverificat**: panoul raportează `state = None` pe toate cele 5 servere | `VERIFIED` (poarta 7) |
| **Blocul „50% off" de pe homepage scos** | ❌ **de făcut** (D2) | `CODE-INSPECTED` |
| Linkul de Discord în subsol | ❌ **de făcut** (A4) | `CODE-INSPECTED` |

> **Observație importantă:** chiar și campania aceasta are o precondiție de *verificare*, nu de *cod*: botul demonstrativ trebuie să fie **confirmat viu de pe nod** (poarta 7). Dacă nu e, campania nu trebuie să spună „găzduim un bot funcțional" — poate spune doar „găzduim un bot" și poate arăta panoul.

### 1.7 Ce se măsoară și ce se decide

| metrică | cum se măsoară | decizia pe care o dirijează |
|---|---|---|
| înscrieri în server | contor server-side (A7) | **dacă valoarea canalului Discord justifică efortul de moderare** |
| mesaje în `#ajutor` | contor | **ce întrebări merită ghiduri scrise** ⇒ intră în clusterul C1 din `10-seo.md` |
| **conturi Blipmade create din link** | `AuditLog` — evenimentul de register | **dimensiunea reală a audienței**, singura metrică de top a F0 |
| întrebări despre preț / „când pot plăti?" | manual, din canal | **dimensiunea reală a fricțiunii de plată** — cel mai bun semnal pentru prioritatea reparării lui B1 |
| tichete deschise de participanți | `Ticket` | **de ce se întreabă oamenii** ⇒ sursă directă de FAQ |

---

## Campania 2 — **„Founding Ten"** · ⛔ **TREBUIE să aștepte poarta**

> **De ce e blocată:** este o campanie cu **plată**, iar plata este oprită; și folosește un preț, deci folosește și o reducere, deci lovește **B1**. Fără reparațiile de mai jos, fiecare lead care încearcă să plătească produce o **comandă eșuată** — adică pierdere de client, nu de client.

### 2.1 Mecanică

O **coadă de maximum 10 clienți fondatori** (`audit/16-GO-NO-GO-DECISION.md` §6, Scenariul B: „maximum 10 clienți"), cu o coadă de intrare deschisă în comunitatea Discord și începută în ziua în care se deschid plățile.

| etapă | mecanică | ce se întâmplă |
|---|---|---|
| 1 | **Anunț în Discord + pe site** | lista se deschide, cu prețul afișat: €9,99/lună |
| 2 | **Clientul își creează contul și plătește** | checkout Stripe real, `Payment` + `Subscription` + `Invoice` create |
| 3 | **Provisioning prin calea de cumpărare** | instanța e creată de `fulfilOrder()` — **nu** de operator |
| 4 | **Acces la canalul `#fondatori`** | fondatorul răspunde personal, în aceeași zi lucrătoare |
| 5 | **Preț blocat 12 luni** | promisiune **contractuală**, nu tehnică (vezi 2.3) |
| 6 | **Coada se închide la 10** | limita din `16-` §6 (beta privată, plată manuală, un singur operator). **Creșterea la 15** — break-even-ul din `09-unit-economics.md` §13 — **numai după ce canalul de suport devine susținabil** |

### 2.2 Public țintă

**P1 și P2 de la Campania 1** — autorii de bot Discord — dar **filtrat prin intenție**: cine a cerut deja unde să-și găzduiască botul. Sursa filtrului: **cele 12 tichete deschise** și **mesajele din canalul Discord**, plus conturile create în Campania 1.

### 2.3 Ofertă

| element | oferit | implementabil? | de ce |
|---|---|---|---|
| **Preț** | **€9,99/lună** la 512 MB / 1 vCPU / 5 GB | ✅ | motorul de preț e corect; poarta 10 = 🟢 GREEN |
| **Preț blocat 12 luni** | da | ⚠️ **contractual, nu tehnic** | nu există plan `YEARLY`; blocarea se promite **în scris, de către operator**, și se aplică **manual** la fiecare reînnoire. **Cerință de confirmare juridică** |
| **Preț de fundare aplicat manual** | da | ✅ | `16-` §6, Scenariul B.2: „prețul de fundare e fix și negociat manual, și **se aplică manual**, nu prin codul de promoții — pentru că `COMM-01`/`PROMO-01` fac ca orice reducere să rupă checkoutul". ⇒ **niciun cod promoțional în această campanie** |
| **Acces la canalul fondatorilor** | da | ✅ | costă timp, nu bani — și e chiar **mecanismul de retenție** care scade minutajul de suport |
| **Fără reducere de lansare** | — | ✅ | la €9,99, reducerea maximă care lasă prima lună neutră e **€4,19 (41,9%)**; un „50%" pierde **€0,80/client** în prima lună. **O campanie fără reducere e mai ieftină și mai onestă** |
| **„Primii 50"** | ❌ nu | ❌ | coada e de **15**, nu de 50: 15 e break-even; 50 ar însemna 50 × €4,19 = €209,50 de contribuție distrusă în prima lună |
| **2 luni gratis la plată anuală** | ❌ nu | ❌ | **B7** + **B4** |
| **Trial gratuit** | ❌ nu | ❌ | nu există trial în cod; conversia minimă pentru amortizare în 12 luni e **60,2%** |

### 2.4 Canale

| canal | rol | blocaj |
|---|---|---|
| **Anunț în Discord** (campania 1) | canalul principal, cu cea mai mare încredere | — |
| **Pagina de produs `/apps/discord-bot`** extinsă | pagina de conversie | conținut + preț |
| **Outbound direct** către cei 6 utilizatori + participanții din Discord | conversie caldă | ❌ e-mailul nu pleacă ⇒ mesaj manual |
| **SEO, clusterul C1** (`/guides/discord-bot-hosting`) | trafic de lungă durată | niciunul |
| ~~Ads plătite~~ | — | **nu**: plafonul de CAC la €9,99 e **€25,14** la 6 luni și **€50,28** la 12 luni (`09-unit-economics.md` §8); orice CPC peste ~€1,50 pe client plătitor (la o conversie de 30%) depășește amortizarea |
| ~~Program de afiliat~~ | — | **nu**: plafonul de comision e **20%** recurent la €9,99, dar programul nu există și niciun mecanism de atribuire nu e implementat |

### 2.5 Assets necesare

| # | asset | efort (`INFERRED`) |
|---|---|---|
| B1 | **Secțiunea de prețuri cu €9,99** în catalog și în paginile de produs | 2–3 h |
| B2 | Textul „Founding Ten" (EN + RO) | 2–3 h |
| B3 | Pagină de „preț blocat" / condiții de fondator | 3–5 h |
| B4 | Fluxul de checkout verificat: `POST /api/orders` → `/checkout` → webhook → `fulfilOrder()` → instanță vie | **nu e un efort de marketing, e un effort de inginerie** — condiția 1 + 6 din `07-release-gates.md` §3 |
| B5 | Canalul `#fondatori` și un ritual săptămânal | 1–2 h |
| B6 | **Documentul de preț blocat, semnat, revizuit juridic** | 4–8 h + **confirmare profesională obligatorie** |
| B7 | Instrumentare de conversie: contor pe `/checkout` + eveniment Stripe | 4–6 h |
| B8 | Procedura de suport pentru clienți fondatori (SLA intern, ore, canal) | 2–3 h |
| B9 | Lista de clienți fondatori, publicată **doar cu acordul fiecăruia** | 1–2 h |

> **Efort total: 12–22 h de marketing + un efort de inginerie și unul juridic, care nu se măsoară în ore de conținut.** (`INFERRED`)

### 2.6 Precondiție de pregătire — **cea mai restrictivă dintre toate**

| # | precondiție | sursa | clasă |
|---|---|---|---|
| 1 | **Toate cele 9 condiții** din `audit/07-release-gates.md` §3 | verdictul NO-GO al auditului | `VERIFIED` |
| 2 | **B1** reparat: reducerea ajunge la Stripe | `05-commerce-and-billing.md` §9.1 | `CODE-INSPECTED` |
| 3 | **B5, B6, B3, B4** reparate | `05-commerce-and-billing.md` §9.1–9.3 | `CODE-INSPECTED` |
| 4 | **B2** reparat: prețul stocat = prețul configurației | `05-commerce-and-billing.md` §9.4 | `CODE-INSPECTED` |
| 5 | **B9, B10** reparate: unitatea în contract, `baseAmount` minim nenul | `05-commerce-and-billing.md` §9.6 | `CODE-INSPECTED` |
| 6 | **B11, B12** reparate: promoții editabile, counterul real | `05-commerce-and-billing.md` §9.6 | `CODE-INSPECTED` |
| 7 | **Prețul adoptat: €9,99** (`baseAmount = 976`) și **D3** (minimul produsului ridicat) | `09-pricing-recommendations.md` §2.2, §2.3 | `VERIFIED` |
| 8 | **Cel puțin 20 de rulări consecutive** comandă → plată → provisionare → activare, toate reușite | condiția 6 din `07-release-gates.md` | `VERIFIED` |
| 9 | **O comandă reală plătită**, cu `Payment`, `Subscription` și `Invoice` create și o instanță creată de `fulfilOrder()` | `04-product-certification.md` §4.4 | `VERIFIED` |
| 10 | **Container viu, verificat de pe nod** (nu `state = None`) | condiția 4 | `VERIFIED` |
| 11 | **E-mail funcțional** (`SMTP_URL` reală) — pentru resetarea parolei și pentru facturile clienților fondatori | condiția 2 | `VERIFIED` |
| 12 | **Backup off-host + drill de restaurare** | condiția 3 | `VERIFIED` |
| 13 | **Documentul de preț blocat, confirmat de un profesionist** (drept contractual, fiscal, GDPR) | cerință de conformitate | **necesită confirmare profesională** |
| 14 | **Contract de test semnat cu fiecare client** | `16-` §6, Scenariul B.3 | `VERIFIED` |
| 15 | **Backup manual pe fiecare instanță înainte de orice schimbare**, documentat | `16-` §6, Scenariul B.3 | `VERIFIED` |
| 16 | **Un timp de răspuns la tichete, anunțat explicit** | `16-` §6, Scenariul B.3 | `VERIFIED` |
| 17 | **Celelalte 4 produse ies din catalogul public** („Coming soon" → „indisponibil pe acest server") | `16-` §6, Scenariul B.1 | `VERIFIED` |

### 2.7 Ce se măsoară și ce se decide

| metrică | cum | decizia |
|---|---|---|
| **comenzi create** (`Order` cu status `PENDING`/`AWAITING_PAYMENT`) | baza de date | **funcționează coada?** |
| **comenzi plătite** (`Order.status = PAID`, `Payment` cu `stripePaymentIntentId`) | baza de date | **funcționează checkout-ul?** — singura metrică care contează |
| **instanțe create prin `fulfilOrder()`** | `Instance` cu `orderId` | **funcționează provisioning-ul pe calea de cumpărare?** (diferența față de cele 3 instanțe create de operator e chiar testul) |
| **rambursări** | `Payment.status = REFUNDED` | **funcționează garanția de înapoiere?** |
| **tichete / client / lună** | `Ticket` ÷ clienți plătitori | **suportul e sub 15 min?** — la €9,99, 15,67 min e pragul de contribuție zero; peste el, fiecare client distruge valoare |
| **churn la 30/60/90 de zile** | `Subscription` | **reține?** — **imposibil cât timp B4 e nereparat** (`renew()` fabrică facturi `PAID` false) |
| **timp până la primul răspuns** | `TicketEvent` | **fereastra de suport se ține?** |

---

## Campania 3 — **„Five Apps Open"** · ⛔ **TREBUIE să aștepte certificarea produselor**

> **De ce e blocată:** campania promite un **catalog**, iar 4 din 5 produse **nu pot fi cumpărate**. Serverul le refuză cu 400 înainte de a crea orice (`api/src/services/pricing.ts:104`). Fiecare lead pe aceste pagini ar ajunge la un formular de comandă care se închide.

### 3.1 Mecanică

O lansare **per produs**, în ordinea certificării, nu o lansare simultană:

| etapă | produs | mecanică |
|---|---|---|
| 1 | `discord-bot` | deja acoperit de Campania 2 |
| 2 | **unul** dintre `wordpress` / `uptime-kuma` / `code-server` / `postgresql` — **cel care e certificat primul** | ghid de start, pagina de produs completă, o demonstrație cu deploy real |
| 3 | fiecare produs următor | aceeași structură |
| 4 | toate cinci | **„The catalogue opens"** — eveniment public, cu demo live și cod de reducere **doar atunci când B1 e reparat** |

**Regula:** **un produs, o campanie.** Nu se face o campanie pe un catalog care nu e complet — pentru că fiecare produs necertificat e o **comandă refuzată cu 400**, iar un vizitator care plătește și nu primește nimic e cel mai scump tip de client pierdut.

### 3.2 Public țintă

| segment | produs | nevoie documentată | de ce acum |
|---|---|---|---|
| **S2a** | `wordpress` | „blog / magazin mic, fără să administrezi un VPS" | `08-product-portfolio.md` §10 îl dă **`DO-NOT-OFFER-ON-THIS-HARDWARE`** — nu e o campanie amânată, e un produs care nu se oferă pe acest hardware |
| **S2b** | `uptime-kuma` | „monitoring cu pagină de stare publică" | produs cu `baseAmount = 149` ⇒ **cel mai ieftin de pe card** ⇒ și cel mai rentabil ca **criză de marjă**: la prețul curent, contribuția e **−€4,05/client/lună** |
| **S2c** | `code-server` | „VS Code în browser, pe resursele mele" | cel mai aproape de categoria „app hosting" |
| **S2d** | `postgresql` | „baza de date cu un connection string" | **cel mai periculos de vândut**: cu poarta de capacitate a discului defectă de **1024×** (`api/src/services/provisioning.ts:214`), un server cu 200 GB ar fi acceptat pe un nod cu 800 GB liber **fără nicio verificare reală** |

> **Așa cum e scris în `04-product-certification.md` §4.3**: `wordpress`, `code-server`, `uptime-kuma` și `postgresql` au `deployable:false` în baza de date, deci sunt blocate **server-side**, nu doar ascunse în interfață.

### 3.3 Ofertă

| element | oferit | blocaj |
|---|---|---|
| **Produsul, la prețul recomandat** | €9,99/lună la configurația implicită a fiecărui produs | prețul trebuie recalculat per produs: `baseAmount = 976 − supraclășugile configurației implicite a produsului** (`09-pricing-recommendations.md` §2.3) |
| **Ghid de start per produs** | da | **de scris după certificare** — un ghid despre un produs care nu pornește e cel mai rău conținut posibil |
| **Reducere de lansare** | ⚠️ **doar după repararea lui B1**, și **maxim €4,19** (41,9%) | **B1**; și plafonul de promoție pe 12 luni: **€379,25** la 15 clienți / **€404,54** la 16 (`09-pricing-recommendations.md` §5.2) |
| **„Primii 50 de clienți" per produs** | ❌ **nu** | `maxPerUser` e cod mort ⇒ „eligibil" nu poate însemna „unul per cont" |
| **Plan anual** | ❌ **nu** | **B7** + **B4** |
| **Preț blocat pentru fondatori** | ✅ **da** — și acum are **valoare reală**: prețul de €9,99 e sub pragul de absorbție la 16 clienți | contractual, cu confirmare juridică |

### 3.4 Canale

| canal | rol | blocaj |
|---|---|---|
| **SEO, clusterul C3** (`/guides/wordpress-hosting`, `/guides/uptime-kuma-hosting`, …) | singurul canal care acumulează | **certificarea produsului** |
| **Pagina de produs** `/apps/<slug>` | pagina de conversie | conținut: ≈570 caractere azi, 1500+ necesare |
| **Documentația** per produs | răspunsul la „cum funcționează?" | azi `/docs` listează **12** produse, dintre care **7 nu există** (`web/src/data.ts:19-30`) — **trebuie curățat înainte** |
| **Discord** (campania 1) | lansare anunțată | — |
| **Outbound** către clienții existenți | upsell | ❌ e-mailul nu pleacă |
| ~~SEO pe jocuri (clusterul C4)~~ | — | ⛔ **fără backup și fără DDoS** (toți cei 3 concurenți RO le includ) ⇒ promisiune neonorabilă. *Portul nu e blocajul: `provisioning.ts:218` preferă deja blocul publicat `30000+`.* |

### 3.5 Assets necesare

| # | asset | efort (`INFERRED`) | de unde |
|---|---|---|---|
| C1 | **Certificarea produsului** (comandă reală plătită, container viu de pe nod, un restart, o degradare + o îmbunătățire cu plată) | **efort de inginerie** | `04-product-certification.md` §4.4 |
| C2 | Pagina de produs rescrisă per produs (1500+ caractere) | 4–8 h × 4 produse | — |
| C3 | 4 ghiduri de start | 6–12 h × 4 | — |
| C4 | **Curățarea documentației**: eliminarea celor 7 produse inexistente din `web/src/data.ts:19-30` și din navigația `/docs` | 3–5 h | — |
| C5 | Capturi de ecran reale ale unui produs pornit | 2–4 h | — |
| C6 | Secțiune de preț per produs | 2–3 h × 4 | — |
| C7 | Textul de lansare per produs | 1–2 h × 4 | — |
| C8 | **Corectarea promisiunii „domains included"** (D6) | 1 h | — |
| C9 | **Corectarea poveștii de marketing** (`web/src/home/Story.tsx:8,25` listează „Ghost", „n8n", „Forgejo" fără disclaimer) | 2–3 h | — |

### 3.6 Precondiție de pregătire

| # | precondiție | clasă |
|---|---|---|
| 1 | Toate precondițiile Campaniei 2 (1–13) | `VERIFIED` |
| 2 | **Produsul e certificat end-to-end**: comandă reală plătită → instanță creată de `fulfilOrder()` → container pornit **și verificat viu de pe nod** → un restart curat → o degradare și o îmbunătățire cu plată | `VERIFIED` (`04-product-certification.md` §4.4) |
| 3 | **`feature_limits` realiste** pentru produsul vândut (bazele de date, backup-urile și alocările sunt **dezactivate prin configurație**: `databases=0, backups=0, allocations=0` pe toate cele 5 servere) | `VERIFIED` (poarta 12) |
| 4 | **Poarta de capacitate a discului corectată** (`api/src/services/provisioning.ts:214`, eroare de 1024×) — **obligatoriu pentru `postgresql`** | `VERIFIED` (poarta 5) |
| 5 | Serverele orfane șterse (serverele 8 și 14 ocupă alocările 73 și 76) | `VERIFIED` (poarta 5) |
| 6 | **Preț per produs setat** cu `baseAmount` recalculat; niciun produs nou cu `baseAmount = 0` (**B10**) | `CODE-INSPECTED` |
| 7 | **D6** — „domains included" corectat | `VERIFIED` |

### 3.7 Ce se măsoară și ce se decide

| metrică | cum | decizia |
|---|---|---|
| **comenzi plătite per produs** | `Order` + `Payment` | **care produs se vinde** — și dacă merită făcut ghidul pentru el |
| **rata de eșec a provisioning-ului per produs** | `ProvisioningJob` (`failed` vs `completed`) | **produsul e sănătos?** — dacă rata rămâne peste 10%, campania se oprește |
| **tichete per produs, la 30 de zile** | `Ticket` | **ar trebui acest produs să fie vândut?** (un produs care generează suport constant nu e un produs de €9,99) |
| **conversie pe `/apps/<slug>`** | contor server-side + `Order` | **titlul, descrierea și ghidul funcționează?** |
| **churn per produs** | `Subscription` | **produsul e în retained** — imposibil cât timp B4 e nereparat |

---

## 3. Secvența, într-o singură privire

```
F0  ──► Campania 1 „Blipmade Bot Builders"      ✅ sigură acum
      │      (community, conținut, SEO de fundație, instrumentare)
      │      blocaje: server Discord, D2, A4  — niciunul legat de plată
      ▼
      │  se repară B1→B5→B6→B3→B4→B2→B9/B10→B11/B12
      │  + cele 9 condiții din 07-release-gates.md §3
      ▼
F1  ──► Campania 2 „Founding Ten"             ⛔ așteaptă poarta
      │      max 10 clienți (16- §6, beta privată), la €9,99/lună, preț aplicat manual
      │      blocaje: poarta + B1–B12 + o comandă reală plătită
      ▼
      │  se certifică fiecare produs (§4.4)
      ▼
F2  ──► Campania 3 „Five Apps Open"              ⛔ așteaptă certificarea
      │      un produs, o campanie; reducere doar după repararea lui B1
      ▼
F3  ──► (în afara scopului acestor trei)            ⛔ așteaptă backup + DDoS + produs de joc
         campania pe jocuri
```

---

## 4. Tabelul de decizie: ce se rulează, când

| campanie | **poate porni acum?** | **verdict** | de ce |
|---|---|---|---|
| **1 — „Blipmade Bot Builders"** | **DA** | ✅ **rulează imediat** | nu atinge plățile, e-mailul sau reducerile; produce conturi reale, măsurabile prin `AuditLog`; singura cerință e un server Discord și blocul „50% off" scos |
| **2 — „Founding Ten"** | **NU** | ⛔ **așteaptă** | campanie cu plată ⇒ B1 + cele 9 condiții de poartă; fără ele, fiecare lead plătitor produce o comandă eșuată |
| **3 — „Five Apps Open"** | **NU** | ⛔ **așteaptă** | catalog cu 4 produse necomandabile ⇒ fiecare lead ajunge la un 400 |

---

## 5. Ce nu am făcut și ce nu am invenționat

| item | motiv |
|---|---|
| nu am creat nicio promoție, niciun cod, nicio campanie | audit read-only; `Promotion` = 0 rânduri, și nu s-a făcut nicio scriere |
| nu am estimat numărul de participanți, de clienți sau de euro câștigați | nu există nicio observație de comportament de client; `0` abonamente, `0` facturi, `0` plăți |
| nu am inventat volume de căutare pentru cererea pe `wordpress` / `uptime-kuma` | **nicio sursă**; marcat explicit `UNVERIFIED` în §3.2 |
| nu am inventat concurenți, prețuri de concurență sau recenzii | concurenții **numiți cu preț** sunt preluați din `audit/08-competitive-analysis.md` (citite de un agent sibling pe surse live, 2026-10-23), etichetați `DOCUMENTED-ONLY`; **nu am citit eu paginile** și **nu am inventat** nicio cotă, recenzie sau volum |
| nu am propus un discount de lansare pentru Campania 2 | **B1** și **contribuția**: la €9,99, „50%" pierde **€0,80/client** în prima lună; plafonul neutru e **€4,19 (41,9%)** |
| nu am propus plan anual, trial sau „2 luni gratis" | **B7**, **B4** și **nu există trial** în cod |
| nu am dat eforturi ca numere exacte | **eforturile sunt `INFERRED`** — interval construite din numărul de active, fără istoric de efort al echipei |
| nu am tratat dreptul, fiscalul sau GDPR ca fiind stabilite | **necesită confirmare profesională** — menționat explicit în §2.5 (B6) și în §2.6 (precondiția 13) |
