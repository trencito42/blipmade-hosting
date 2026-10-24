# Analiză de gap competitiv — Blipmade

**Document:** faza 9 a auditului post-remediere — poziționare și gap-uri competitive.
**Data cercetării:** 23 octombrie 2026.
**Autor:** agent de audit (rol `Worker`). Audit independent, fără modificări asupra codului sursă.
**Baza Blipmade:** mirrorul `/root/blipmade-work` + rapoartele din
`audit/post-remediation/` + documentele de audit din rundele anterioare (`audit/08-*`,
`audit/09-*`, `audit/10-*`).
**Limba:** română tehnică; numele produselor, ale funcțiilor, citatele și URL-urile rămân în limba
originală.

---

## 1. Antet

### 1.1 Ce a fost cercetat

Șapte produse comparate cu Blipmade, plus un produs de referință:

| # | Produs | Rol în această analiză | Categorie |
|---|---|---|---|
| C1 | **WHMCS** | competitor nominal în brief | platformă de business pentru companii de găzduire |
| C2 | **FOSSBilling** | competitor nominal în brief | platformă de business pentru companii de găzduire |
| C3 | **Railway** | competitor nominal în brief | PaaS găzuit |
| C4 | **Render** | competitor nominal în brief | PaaS găzuit |
| C5 | **Coolify** | competitor nominal în brief | PaaS self-hosted |
| C6 | **Paymenter** | referință de faza 8 | platformă de business, cu extensiune Pterodactyl |
| C7 | **Shockbyte** | concurent direct de găzduire de joc | game hosting găzuit |
| C8 | **Nodecraft** | concurent direct de găzduire de joc | game hosting găzuit |
| C9 | **Aternos** | referință „free" | game hosting găzuit |
| C10 | **OVINETWORK**, **Zentaris Host**, **Torchbyte** | concurenți direcți pe **piața țintă** (RO) | game hosting găzuit, România |

### 1.2 Surse — URL-uri accesate efectiv

Toate URL-urile de mai jos au fost **accesate efectiv** pe 23.10.2026. Fiecare afirmație din
document are o referință la unul dintre ele sau la un `file:line` din mirror.

| # | Sursă | URL | Ce s-a extras |
|---|---|---|---|
| U01 | WHMCS — homepage | https://www.whmcs.com/ | poziționare: „Web Hosting Automation Made Easy"; module: Billing Automation, Web & Domains, Support Tools, Developer Friendly; „WHMCS Fully Managed" (cloud) |
| U02 | WHMCS — prețuri | https://www.whmcs.com/pricing/ | Self-hosted: Plus **$34,95**/lună (250 clienți), Professional **$54,95** (500), Business **$84,95** (1000/2500/5000/10000). Fully Managed: Starter **$9,99** (25 clienți, +$0,40/client suplimentar), Growth **$25,00** (100, +$0,25), Expansion **$75,00** (300, +$0,25). „30 Day Money-Back Guarantee". 40M+ clienți, 50M+ produse, 500+ integrații |
| U03 | WHMCS — Billing Automation | https://www.whmcs.com/billing-automation/ | facturi PDF și chitanțe, facturare recurentă, mementi de plată, PayPal + Stripe + card, **multi-monedă**, **Taxes/VAT**, produse cu plată unică sau recurentă „up to every 3 years", facturi draft ascunse de client, refund direct din factură, confirmări automate prin e-mail, plăți bancare pentru US/UK/EU |
| U04 | WHMCS — Support Tools | https://www.whmcs.com/integrated-support-tools/ | ticketing prin web **sau e-mail**, **departamente**, atribuire, **atașamente de fișier**, knowledgebase, suport 24/7 |
| U05 | WHMCS — Free Tools | https://www.whmcs.com/free-tools/ | cont gratuit de revânzare de domenii |
| U06 | FOSSBilling — homepage | https://fossbilling.org/ | „Free and open source hosting automation"; facturare automată cu **multi-monedă și sincronizarea cursului de schimb**; provisionare pe cPanel/Plesk/DirectAdmin/HestiaCP; ticketing cu notificări prin e-mail și închidere automată; extensii (teme, module, gateway-uri, server managers, registrari); localizare; „Licensed under AGPL 3.0" |
| U07 | FOSSBilling — docs (arbore) | https://docs.fossbilling.org/ | meniu: Localisation, Invoice PDFs, Custom Payment Gateway, Product Types (Hosting / Domains / Downloadable Products / Licenses), **API Keys**, Server Managers (WHM-cPanel, HestiaCP, CWP), Email Templates, Anti-Spam |
| U08 | FOSSBilling — repo (metadate + LICENSE) | `https://api.github.com/repos/fossbilling/fossbilling` · `https://api.github.com/repos/fossbilling/fossbilling/license` · `https://raw.githubusercontent.com/fossbilling/fossbilling/master/LICENSE` | repo: **Apache-2.0**, 1.721 stele, `pushed_at` 2026-10-23; fișierul `LICENSE` e **Apache License 2.0** |
| U09 | Railway — homepage | https://railway.app/ | „The all-in-one intelligent cloud provider"; build & deploy, rețea privată 100 Gbps, scalare, monitorizare (logs/metrics/traces), alerte Slack/Discord/e-mail, medii nelimitate, rollback cu un clic |
| U10 | Railway — prețuri | https://railway.app/pricing | Free **$0**/lună (30 zile trial $5 credite, apoi $1/lună; 1 vCPU / 0,5 GB RAM per serviciu; 0,5 GB volum; suport comunitar); Hobby **$5** minim de consum (până la 48 vCPU / 48 GB, 5 replici, 5 GB volum; 99,9% disponibilitate-țintă); Pro **$20** minim (1.000 vCPU / 1 TB, 42 replici, 1 TB volum; 99,99%); Enterprise custom (SLA, RBAC, SSO, HIPAA, 18 luni jurnal) |
| U11 | Render — homepage | https://render.com/ | „The cloud for builders"; Web Services, Background Workers, Cron Jobs, Postgres, Key Value, Private Services, Static Sites, preview environments, autoscaling, persistent disks, CLI + MCP, IaC |
| U12 | Render — prețuri | https://render.com/pricing | planuri de workspace: Hobby **$0/mo** + compute, Pro **$25/mo** + compute, Scale **$499/mo** + compute, Enterprise custom. Compute: Free 512 MB $0; <1 CPU / 512 MB **$7**; 1 CPU / 2 GB **$25**; 2 CPU / 4 GB **$85**; 2 CPU / 8 GB $135; 2 CPU / 16 GB $200; 4 CPU / 8 GB $175; 4 CPU / 16 GB $225; 8 CPU / 32 GB $450; 12 CPU / 96 GB $1.500. SSD **$0,25/GB/lună**. SLA de uptime contractual, la Scale+ |
| U13 | Coolify — homepage | https://coolify.io/ | „Open source and free forever"; „an open-source and self-hostable alternative to Vercel, Heroku, Netlify and Railway"; **360+ servicii one-click**; proiecte și medii; **MCP server** pentru agenți AI; API; webhooks; push-to-deploy; scheduled tasks; roluri de echipă; 20k+ membri în comunitate; 3.641+ clienți pe Cloud |
| U14 | Coolify — prețuri | https://coolify.io/pricing | **Self-hosted: gratuit, pentru totdeauna, fără restricții de funcții**. Cloud: **$5/lună** bază (2 servere) + **$3/lună** per server suplimentar; serverele rămân ale clientului |
| U15 | Coolify — repo (metadate) | `https://api.github.com/repos/coollabsio/coolify` | **Apache-2.0**, 63.596 stele, `pushed_at` 2026-10-23 |
| U16 | Shockbyte — homepage | https://www.shockbyte.com/ | game hosting pentru **60+ jocuri**; consolă în timp real, instalator de modpack-uri și pluginuri, instanțe de server, manager de configurație, copii de rezervă; suport 24/7; **4,7/5**; interfață poloneză și engleză cu comutator de monedă; blog, bază de cunoștințe, creator de subdomenii |
| U17 | Shockbyte — prețuri Minecraft | https://www.shockbyte.com/minecraft-hosting | Dirt 1 GB **$3,99** ($2,79 discounted), Sand 2 GB **$7,99** ($5,59), Cobblestone 3 GB **$11,99** ($8,39), Iron 4 GB **$15,99** ($11,19). „72hr Self-Serve Refund", „Instant Setup", **„99.9% Uptime"**, **„DDoS Protection"**, instalator instant de modpack/plugin |
| U18 | Nodecraft — homepage | https://www.nodecraft.com/ | „Game Server Hosting — High Performance & Low Latency"; Minecraft, Palworld, FiveM, Hytale, Valheim, Garry's Mod, Factorio, Satisfactory, Terraria; hardware: AMD Ryzen 9 / EPYC, SSD, **ECC RAM**; **4,9/5 din 1800+ recenzii**; blog; suport live chat |
| U19 | Nodecraft — prețuri | https://www.nodecraft.com/pricing | de la **$5,96**/lună ($4,17 prima lună); $9,98; $11,92; $14,90; $17,88; $20,86; **comutator de monedă: AUD, BRL, CAD, EUR, GBP, ILS, JPY, SGD, USD** |
| U20 | OVINETWORK — Minecraft RO | https://ovinetwork.ro/hosting-minecraft | **€3,99**/lună 4 GB RAM DDR4 / 25 GB NVMe; €5,99 6 GB / 35 GB; €12,99 12 GB / 50 GB; €16,99 16 GB / 100 GB; **Anti-DDoS 1 Tbps** în toate planurile; panou **Pterodactyl**; AMD Ryzen 5 5600X; **„Prețurile sunt afișate în euro. Plata se face în lei, la cursul BNR din ziua emiterii facturii proforme + 2%"**; ticket de suport LUNI–VINERI 08:00–20:00 |
| U21 | Zentaris Host — Minecraft RO | https://zentaris-host.ro/hosting-jocuri/minecraft/ | **€4,49**/lună 4 GB DDR4 / 2 vCPU / 25 GB SSD / **sloturi nelimitate** / Anti-DDoS; €8,99 8 GB / 3 vCPU / 50 GB; €15,99 16 GB / 4 vCPU / 100 GB; **„Activare automată în doar câteva minute"**; infrastructură în România; panou Pterodactyl; instalare de modpack-uri în un click; **„pachetele de Minecraft nu includ suport tehnic"** |
| U22 | Torchbyte — Minecraft RO | https://torchbyte.com/ro/game/minecraft | **€4,74**/lună 2 vCPU AMD Ryzen / 4 GB RAM / 50 GB NVMe **+ 50 GB backups** / filtrare DDoS reglată pentru Minecraft / **backup-uri automate zilnice**; €9,50 8 GB / 100 GB; €14,60 12 GB / 150 GB; €19,20 16 GB / 200 GB |
| U23 | Aternos — homepage | https://aternos.org/ | „Free. Forever."; **„Your Minecraft server is fully DDOS protected for free"**; **„Automatic Backups"** în Google Drive; sloturi nelimitate; suport; **20+ limbi, inclusiv Română**; 219.219 GB RAM în total |
| U24 | Paymenter — docs, API, repo | vezi `PAYMENTER-FEATURE-PARITY.md` §1.2 | referință de paritate |

### 1.3 Surse care nu au putut fi accesate

| Sursă | URL tentat | Rezultat |
|---|---|---|
| GameServers.org | https://gameservers.org/ | **Eroare SSL** („unable to get local issuer certificate") — pagina nu a putut fi citită. Nu se afirmă nimic despre acest furnizor |
| WHMCS — pagina „Feature Tour" | https://www.whmcs.com/features/ | **404**; înlocuită cu paginile tematice `/billing-automation/` și `/integrated-support-tools/`, ambele accesate |
| FOSSBilling — subpagini docs | `https://docs.fossbilling.org/Getting-Started/Overview` etc. | au rămas **0 octeți** (structura URL diferită); s-a folosit arborele meniului de pe pagina de documentație (U07) |
| WHMCS — prețuri live ale licenței | — | nu există o pagină publică de „licență perpetuă"; WHMCS se vinde pe abonament. Nu se afirmă nimic despre un preț de licență perpetuă |
| Lunafy, Heroku, Contabo | — | nu au fost refetcate în această fază; cifrele există în `audit/08-competitive-analysis.md` §4.1, §4.4, §4.5 și sunt marcate acolo cu URL-ul lor. Sunt folosite doar ca reper istoric |

### 1.4 Limitări structurale ale acestei faze

- **Nu am vizitat `blipmade.com`**, nu m-am autentificat și nu am creat conturi. Toate afirmațiile
  despre Blipmade vin din mirrorul de cod și din rapoartele de audit.
- **Nu am exercitat niciun concurent.** Nu am deschis conturi la Shockbyte, Nodecraft, Aternos,
  OVINETWORK, Zentaris sau Torchbyte. Ce am extras e de pe **paginiile de vânzare publice**, nu
  din panourile clienților. Asta înseamnă că **funcțiile din panoul de client al unui concurent
  nu sunt verificate** — doar ce promite pagina lui publică.
- **Prețurile concurenților sunt cele publicate azi.** Multe oferă reduceri recurente
  („30% OFF RECURRING" la Shockbyte; „$4,17 first month, then $5,96" la Nodecraft). Am notat
  ambele valori unde există, ca să nu se compare un preț promoțional cu unul de listă.
- **Blipmade nu are încă un preț de listă comparabil** pentru un produs de joc, pentru că
  **nu există niciun produs de joc în catalog** (vezi §2.2). Comparația de preț se face pe
  catalogul *actual* (5 produse generice) și pe *propunerea* din `audit/08-product-portfolio.md`.

---

## 2. Metodă

1. **Poziționare întâi, apoi gap-uri.** S-a identificat mai întâi ce promite Blipmade
   (`docs/BLIPMADE_DESIGN_PROMPT.md`, `audit/10-positioning.md` §2), apoi cine sunt
   concurenții **din acea promisiune**. Compararea cu un concurent dintr-o altă categorie
   produce zgomot.
2. **Fiecare afirmație despre un concurent are un URL accesat efectiv** (§1.2). Cifrele din
   rapoartele interne ale rundelor anterioare au fost **refetcate** acolo unde a fost posibil;
   unde nu, sunt marcate explicit ca reper istoric (§1.3).
3. **Vocabular fix**, identic cu faza 8: **prezent** / **parțial** / **absent** / **neverificat**.
   "Neverificat" nu e o lacună — e o limită a cercetării.
4. **Severitate comercială.** O funcție lipsă e `P0/Critical` dacă blochează *o vânzare* în
   starea curentă; `High` dacă blochează o vânzare într-un segment concret; `Medium` dacă
   blochează o operațiune sau o încredere; `Low/Info` dacă e ergonomică.
5. **Severitatea acțiunilor** ține cont de **efort** și de **risc**: o acțiune cu efort L care
   nu închide un blocaj de vânzare e mutată în coadă, nu în top 10.

### 2.1 Constatarea de fond: cine e concurentul real al lui Blipmade

Cele șase produse numite în brief **nu formează o singură categorie**, și asta e cel mai
important lucru din acest raport.

| Categorie | Produse | Ce cumpără clienții de la ele | E Blipmade concurent? |
|---|---|---|---|
| **A. Business software pentru companii de găzduire** | WHMCS, FOSSBilling, Paymenter | un **sistem de facturare + ticketing** pentru un administrator care își vinde hosting | **Nu, direct.** Blipmade nu se adresează administratorului de hosting; Blipmade *este* hostingul. Dar: **sunt potențiali clienți sau parteneri** — un reseller cu Pterodactyl ar putea folosi Paymenter+FOSSBilling, nu Blipmade |
| **B. PaaS găzuit / self-hosted** | Railway, Render, Coolify | un **container** cu codul clientului, cu TLS, scalare, CI/CD | **Da, dar numai pentru jumătatea „aplicații/baze de date"** din catalogul Blipmade |
| **C. Game hosting găzuit** | Shockbyte, Nodecraft, Aternos, OVINETWORK, Zentaris, Torchbyte | un **server de joc gata de jucat**, cu backup și protecție | **Da — dar numai după ce Blipmade creează un produs de joc** |

**Concluzie.** Cei 4 competitori nominali din brief sunt, fie din altă categorie (A), fie
competitori pentru o **singură parte** din catalog (B). Concurenții care îl vor **înlocui**
pe un client final de găzduire de joc sunt din categoria **C**, iar **trei dintre ei sunt
români** și folosesc **același panou Pterodactyl** ca Blipmade.

Această observație schimbă complet lista de acțiuni: e mai util să repari backup-ul și
DDoS-ul decât să construiești un coș de cumpărări.

### 2.2 Poziționarea declarată vs. catalogul real

| | Ce declară | Dovezi |
|---|---|---|
| **Brandul** | „Blipmade sells **freedom to run any app without configuring a VPS**. We do not sell servers or RAM tables." | `docs/BLIPMADE_DESIGN_PROMPT.md:9`, `:32` |
| **Interfața** | categorie „App / Database / Instance", nu „server / VPS / plan" | `web/src/home/Hero.tsx:56`, `web/src/home/Ticker.tsx:5`, `web/src/home/Configurator.tsx:36` |
| **Infrastructura** | nod Pterodactyl, 120 GiB RAM, 800 GiB disc, 173 alocări, **16 ouă** (Minecraft, CS:GO, Rust, Mumble, TeamSpeak) | `audit/00-BRIEFING.md` §12.1 (citat în `audit/10-positioning.md:21`) |
| **Catalogul real** | **5 produse**: `wordpress` (€1,49), `discord-bot` (€1,49), `uptime-kuma` (€1,49), `code-server` (€2,99), `postgresql` (€4,49) — **niciunul de joc** | `api/prisma/seed.ts:55-171` (`baseAmount` 149 / 299 / 149 / 149 / 449) |
| **enum Category** | `WEB_CMS`, `DEVELOPER_TOOLS`, `MONITORING`, `AUTOMATION`, `BOTS`, `DATABASES` — **nicio categorie de jocuri** | `api/prisma/schema.prisma:205-212` |
| **Căutare în tot repo-ul** | `grep -rniE "minecraft\|game server\|game hosting\|palworld\|valorant"` pe `web/src`, `api/src`, `api/prisma`, `docs/` → **0 potriviri** | verificare directă pe mirror |
| **Produsele de joc propuse** | `minecraft-paper` (E1) și `vanilla` (E2) sunt `LAUNCH-AFTER-FIX` — **nu există încă** | `audit/08-product-portfolio.md` §10 (citat în `audit/10-positioning.md:50`) |
| **Ce se poate vinde azi** | `discord-bot` este singurul produs cu `deployable: true` în catalogul live | `audit/10-positioning.md:17` (`VERIFIED` în runda anterioară) |

**Aceasta e cea mai importantă constatare a fazei 9, înainte de orice tabel:**
Blipmade se prezintă ca platformă de găzduire de **aplicații**, dar nu are **niciun** produs de
**joc**, deși infrastructura e o instalație de game-hosting și concurenții de pe piața țintă
vind **doar servere de joc**. Piața de gaming hosting nu e „un segment secundar" al lui Blipmade —
e **singurul segment pentru care infrastructura lui e deja dimensionată și calibrată**.

---

## 3. Tabelul de poziționare

| Produs | Client țintă | Model de preț | Self-hostable | Licență | Ce face cel mai bine, într-o propoziție |
|---|---|---|---|---|---|
| **WHMCS** (U01–U04) | administrator de hosting web/ISP | abonament per număr de **clienți activi**: self-hosted $9,99–$84,95/lună; cloud $9,99–$75/lună | Da (sau Nu — varianta „Fully Managed") | **Proprietar**, licență per site („License Verification" în footer) | Automatizarea completă a ciclului de facturare: facturi PDF, taxe/VAT, recurență, mementi, rambursări, multi-monedă — într-un singur produs, cu 500+ integrații |
| **FOSSBilling** (U06, U07, U08) | administrator de hosting mic/mediu | **gratuit** (open source); costul e hosting-ul propriu | Da | site-ul declară **AGPL 3.0**; fișierul `LICENSE` din repo-ul oficial este **Apache-2.0** — *discrepanță între sursele oficiale, nerezolvată* | Alternativa completă și gratuită la WHMCS, cu portare automată a datelor și extindere prin director de module |
| **Paymenter** (U24) | administrator de hosting | **gratuit** (MIT); extensii și teme premium în marketplace | Da (+ cloud `paas.paymenter.org`) | **MIT** | Ecosistemul de extensii de provisionare: Pterodactyl, Convoy, cPanel, DirectAdmin, Enhance, Plesk, VirtFusion, Virtualizor — plus ~150 module de marketplace |
| **Railway** (U09, U10) | dezvoltator, echipă mică | consum real pe secundă, cu credit minim inclus: $0 / $5 / $20 / custom | Nu | Proprietar (SaaS) | Zero-config: detectarea protocolului, rețea internă 100 Gbps, previews automate la fiecare PR, rollback într-un clic |
| **Render** (U11, U12) | echipă de produs | plan de workspace $0 / $25 / $499 + compute per instanță | Nu | Proprietar (SaaS) | Servicii gestionate cu SLA de uptime contractual, autoscaling, persistent disks, IaC, preview environments |
| **Coolify** (U13–U15) | echipă care vrea PaaS **pe serverele proprii** | **gratuit** self-hosted, fără restricții; cloud $5/lună + $3/server | **Da, prin definiție** | **Apache-2.0** | PaaS pe infrastructura proprie, cu **360+ servicii one-click**, fără vendor lock-in și fără limită de funcții în ediția gratuită |
| **Shockbyte** (U16, U17) | jucător și comunitate mică | abonament per resursă: $3,99–$15,99/lună (reducere recurentă 30%) + refund propriu în 72 h | Nu | Proprietar (SaaS) | **Breadth de catalog: 60+ jocuri**, instalator de modpack-uri și pluginuri, backup-uri, DDoS, „99.9% Uptime" publicat |
| **Nodecraft** (U18, U19) | jucător, comunitate | abonament per resursă de la **$5,96**/lună; multi-monedă (9 valute) | Nu | Proprietar (SaaS) | Hardware de primă clasă (Ryzen 9/EPYC, SSD, ECC RAM) + **4,9/5 din 1800+ recenzii** — încrederea acumulată |
| **Aternos** (U23) | jucător hobbyist | **€0** | Nu | Proprietar (SaaS) | Zero: DDoS gratuit, backup automat în Google Drive, sloturi nelimitate, 20+ limbi inclusiv Română |
| **OVINETWORK** (U20) | jucător din România | abonament EUR (€3,99–€16,99), **plata în lei la cursul BNR + 2%** | Nu | Proprietar | Anti-DDoS 1 Tbps + panou Pterodactyl + preț afișat în euro, plătibil în lei |
| **Zentaris Host** (U21) | jucător din România | abonament EUR (€4,49–€15,99) | Nu | Proprietar | Sloturi nelimitate + activare automată în câteva minute, infrastructură în România |
| **Torchbyte** (U22) | jucător din România | abonament EUR (€4,74–€19,20) | Nu | Proprietar | **Backup zilnic + filtrare DDoS reglată pentru Minecraft inclusă în planul de intrare** |
| **Blipmade** | jucător, comunitate mică, dezvoltator de aplicații | abonament EUR per resursă (€1,49–€4,49 în catalog), cu preț per GB RAM / vCPU / GB disc | **Nu** — doar serviciu găzduit; repo intern, fără ediție publică | Proprietar (repo intern) | **Preț pe resursă cu port dedicat alocat și panou**, fără planuri fixe — dar **produsul nu e încât vândabil** |

**Observație de licență (raportată cu grijă).** FOSSBilling publică „Licensed under AGPL 3.0" pe
site-ul oficial (U06), dar fișierul `LICENSE` din repo-ul oficial (`fossbilling/fossbilling`,
ramura `master`) este **Apache License 2.0** (U08). Cele două surse oficiale se contrazic.
Nu rezolv care e corect; raportez faptul, pentru că cineva ar vrea să forkeze FOSSBilling trebuie
să știe că **nu există o licență copyleft în fișierul care controlează repo-ul**.

---

## 4. Gap-uri pe domenii de funcționalitate

Vocabular: **prezent** / **parțial** / **absent** / **neverificat** — raportat la **starea reală**
a Blipmade, nu la ce ar trebui să fie.

### 4.1 WHMCS

| Domeniu | Ce are WHMCS | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | produse cu tip (hosting/domeniu/licență), module de server, integrare cu cPanel/WHM, SSL, automatizare de domenii | **parțial** | Blipmade are 5 produse generice, **0 de joc**; WHMCS are bibliotecă de produse și automatizare de provisionare | Blipmade nu poate „vinde WHMCS" — dar nici nu îl poate concura: **nu se adresează aceleiași persoane** |
| **Prețuri** | preț per produs și per perioadă, până la 3 ani, taxe, promoții, quotes, multi-monedă | **parțial** | Blipmade: per resursă, doar MONTHLY/YEARLY, EUR unic, **fără TVA** | La vânzare către un **client final** (nu reseller), prețul Blipmade e mai simplu și mai ieftin. Avantaj, nu gap |
| **Checkout** | coș, checkout cu metode multiple, plăți recurente, dunning | **absent** | fără coș, fără checkout oaspete, **plățile oprite** | Blipmade nu plătește niciun client de WHMCS; dar nu are nici propriul checkout funcțional |
| **Facturare** | facturi PDF + chitanțe, draft-uri ascunse, **Taxes/VAT**, rambursare din factură, dispute handling | **parțial / absent** | Blipmade: factură = **PDF Stripe**, `tax: 0` hardcodat, facturi invizibile după plată (`FN-P1-26`, `FN-P1-03`) | Blipmade nu poate vinde către **firmă** fără factură cu TVA. WHMCS aici e un reper de funcționalitate, nu un rival |
| **Self-service** | portal client: servicii, facturi, bilete, metode de plată, profil, domenii, SSL | **parțial** | Blipmade are panou client, abonamente, bilete, preferințe — dar **facturile lipsesc** și nu există auto-panou de domeniu | — |
| **Suport** | ticketing prin web sau e-mail, **departamente**, atribuire, **atașamente**, knowledgebase | **parțial** | Blipmade: bilete cu fir și atribuire; **fără atașamente reale** (`FN-P1-02`), fără departamente, fără knowledgebase, fără ticketing prin e-mail | În fața unui concurent de game hosting care dă suport 24/7, lipsa de atașamente e o problemă reală de retenție |
| **Operațiuni staff** | roluri, module, permission sets, MarketConnect | **prezent** | Blipmade: 21 permisiuni fine-grained, roluri, jurnal de audit — **mai bine** decât majoritatea concurenților din categoria A | Avantaj, dar pe un produs care nu se vinde încă |
| **Automatizare** | facturare recurentă, dunning, mementi, automatizare de SSL și domenii, import din WHMCS la concurenți | **parțial** | Blipmade are sweep-uri de reconciliere, dar `BE-08` → erorile sunt înghițite; nu există dunning | — |
| **Fiabilitate** | SaaS sau self-hosted cu suport și garanții | **parțial** | Blipmade: **fără backup off-host** (`DR-02`), fără SLA publicat, un singur nod | Un concurent care publică „99,9% uptime" și backupuri zilnice câștigă comparația la fața unui client de joc |

**Verdict WHMCS: nu e un concurent, e o piață adiacentă.** Blipmade ar trebui să se raporteze la
WHMCS pentru **funcționalitatea de facturare** (mai ales TVA, dunning, rambursare), nu pentru
poziționare.

### 4.2 FOSSBilling

| Domeniu | Ce are FOSSBilling | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | tipuri de produs: Hosting, Domains, Downloadable Products, Licenses; server managers (WHM/cPanel, HestiaCP, CWP) | **parțial** | Blipmade: 5 produse, tipuri categorizate, provisionare Pterodactyl | — |
| **Prețuri** | multi-monedă cu **sincronizare automată a cursului de schimb** | **absent** | Blipmade: EUR unic | — |
| **Checkout** | facturare automată, mementi de plată, gateway-uri | **absent (blocat)** | plățile oprite | — |
| **Facturare** | **Invoice PDFs**, localizare, e-mail templates, produse cu plată unică sau recurentă | **parțial** | Blipmade: PDF-ul e al Stripe | — |
| **Self-service** | bilete cu notificări prin e-mail, închidere automată, suport pentru clienți **și oaspeți** | **parțial** | — | — |
| **Suport** | helpdesk încorporat, e-mail, clienți și oaspeți | **parțial** | — | — |
| **Operațiuni staff** | modul extensibil (module system) | **parțial** | Blipmade: extensie **absentă** | FOSSBilling are un sistem de module; Blipmade n-are punct de extensie. E o limită de scară, nu de vânzare azi |
| **Automatizare** | facturi + mementi automate; **API Keys** în docs | **absent** | fără API public | — |
| **Fiabilitate** | self-hosted, „your data stays on your server" | **absent** | Blipmade nu e self-hostable | **FOSSBilling este, pentru un operator, o cale de a obține ce Blipmade oferă *ca serviciu*** — dar numai dacă are deja Pterodactyl. **Aceasta e cea mai bună interpretare a relației Blipmade–FOSSBilling: nu rivalitate, ci o piață de consolidare** |

### 4.3 Paymenter (referință)

| Domeniu | Ce are Paymenter | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | produse cu stoc, limită per client, cantitate, tipuri de plan | **parțial** | stoc, limită per client și tip de plan lipsesc | — |
| **Prețuri** | planuri Free/One Time/Recurring, interval zile/săptămâni/luni/ani, preț per monedă, taxă de setup | **parțial** | doar MONTHLY/YEARLY, EUR unic, fără tip de plan | — |
| **Checkout** | coș (`Cart`, `CartItem`), checkout, metode de plată per plan | **absent** | — | — |
| **Facturare** | facturi, sume snapshot, tranzacții, note de ajustare, **TaxRate** | **parțial** | fără `TaxRate`, fără snapshot/adjustări | — |
| **Self-service** | profil, sesiuni, **2FA**, credite, metode de plată, upgrade, cancel | **parțial** | fără 2FA, fără credit de cont | — |
| **Suport** | departamente, piping prin IMAP, atașamente de bilet, log de e-mail per bilet | **parțial** | fără atașamente reale, fără piping | — |
| **Operațiuni staff** | roluri, audit, resurse Filament | **prezent** | — | — |
| **Automatizare** | cron programat cu statistică, queue worker, telemetrie | **parțial** | — | — |
| **Fiabilitate** | extensii cu hookuri de lifecycle; temă cu configurare | **absent** | fără puncte de extensie | — |
| **Verdict** | **Paymenter + extensia Pterodactyl e un concurent direct pentru resellerul care vrea să-și vândă serverele cu facturare** | | | Blipmade nu îi poate lua acel client: nu e self-hostable, nu are API, nu are extensii. **Dar acel client e și o piață de intrare pentru găzduire cu facturare — unde Blipmade ar trebui să se poziționeze ca alternativă *găzduită*, mai ieftină pe curent.** |

### 4.4 Railway

| Domeniu | Ce are Railway | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | deploy din repo, orice limbaj, containere Docker, 5GB volum inclus în Hobby | **parțial** | Blipmade nu livrează din repo; livrează din **catalog de produse preconfigurate** | **Blipmade nu poate concura cu Railway pe „deploy anything from git"** — și n-ar trebui: e altă treaptă de produs |
| **Prețuri** | consum real pe secundă, credit minim $5/$20, **fără plafon** | **parțial** | Blipmade: preț fix per configurație | Pentru un client cu consum **constant** (un bot Discord, un uptime kuma), prețul fix e **previzibil**, iar Railway e **neprevizibil**. Blipmade câștigă la clienți cu flux constant; pierde la clienți cu vârfuri |
| **Checkout** | consum, fără „checkout" în sens clasic | **absent (blocat)** | plățile oprite | — |
| **Facturare** | factură de platformă (nu de hosting) | **parțial** | — | Railway nu e relevant pentru facturarea clientului final |
| **Self-service** | dashboard, logs, metrics, traces, alerte Slack/Discord/e-mail, medii nelimitate, rollback | **parțial** | Blipmade: dashboard client, **fără metrici** (`FN-P1-04`), fără logs centralizate, fără alerte | **Blipmade nu are observabilitate.** Pentru un serviciu cu „99,9% uptime" promis de concurent, lipsa de metrici e o slăbiciune de încredere |
| **Suport** | suport comunitar (Free/Hobby), Railway Support (Pro), SLO (Enterprise) | **parțial** | Blipmade: bilete, dar **e-mail inert** (`OPS-03`) | — |
| **Operațiuni staff** | echipe, roluri, audit de 18 luni (Enterprise) | **parțial** | — | — |
| **Automatizare** | CI/CD, previews, rollback, MCP server, API | **absent** | — | — |
| **Fiabilitate** | 99,9% / 99,99% / 99,999% ca **țintă publicată** | **absent** | Blipmade nu publică nicio țintă de disponibilitate | **Concurenții publică SLA; Blipmade nu.** În fața unui client de joc, care compară, asta e o slăbiciune directă |

### 4.5 Render

| Domeniu | Ce are Render | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | web services, background workers, cron jobs, Postgres, Key Value, private services, static sites | **parțial** | Blipmade: catalog fix de 5 produse + Postgres; **nu are background workers, cron jobs ca serviciu, nici Key Value** | Pentru un client care vrea un **serviciu de fundal**, Blipmade nu are nimic |
| **Prețuri** | plan $0/$25/$499 + compute de la $7 (512 MB) | **parțial** | Blipmade: €1,49 pentru 512 MB (`discord-bot`, `uptime-kuma`) | **Blipmade e mai ieftin la volum mic și cu preț fix.** La 4 GB: Blipmade ~€4,49 vs Render $25 (2 GB) — Render nu e un concurent economic la acest nivel |
| **Checkout** | — | **absent (blocat)** | — | — |
| **Facturare** | — | **parțial** | — | — |
| **Self-service** | autoscaling, persistent disks, IaC, preview environments, CLI + MCP | **absent** | Blipmade: fără scalare automată, fără disk persistent ca produs, fără preview | **Render îi taie clienții care au nevoie de CI/CD.** Blipmade nu are acest segment nici cum să-l atace |
| **Suport** | chat (Pro), SLA de răspuns (Scale), account team (Enterprise) | **parțial** | — | — |
| **Operațiuni staff** | SAML SSO, SCIM, RBAC avansat, audit de organizație | **parțial** | — | — |
| **Automatizare** | zero-downtime deploys, autoscaling, IaC, MCP | **absent** | — | — |
| **Fiabilitate** | SLA contractual de uptime la Scale+ | **absent** | — | — |

### 4.6 Coolify

| Domeniu | Ce are Coolify | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | **360+ servicii one-click**, proiecte și medii, orice imagine Docker | **parțial** | Blipmade: 5 produse | **Coolify e un catalog vast și gratuit.** Blipmade nu îl poate ajunge nici ca gamă, nici ca preț (0 €). Dar Coolify **nu face nimic pentru un jucător**: cere SSH, Docker și cunoștințe. **Piațele nu se intersectează aproape deloc** |
| **Prețuri** | gratuit self-hosted; cloud $5 + $3/server | **parțial** | — | — |
| **Checkout** | — | **absent (blocat)** | — | — |
| **Facturare** | — | **parțial** | — | — |
| **Self-service** | dashboard, terminal în browser, roluri de echipă, scheduled tasks | **parțial** | — | — |
| **Suport** | comunitate 20k+, suport limitat pe cloud | **parțial** | — | — |
| **Operațiuni staff** | roluri și permisiuni, API | **parțial** | — | — |
| **Automatizare** | push-to-deploy, webhooks, CI/CD, API, **MCP server pentru agenți AI** | **absent** | — | — |
| **Fiabilitate** | tu îți iei serverele; Coolify nu e responsible de uptime-ul aplicației tale | **parțial** | — | — |

### 4.7 Shockbyte și Nodecraft (game hosting global)

| Domeniu | Ce au Shockbyte / Nodecraft | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | Shockbyte: **60+ jocuri**, instalator de modpack-uri și pluginuri, console live, manager de configurație. Nodecraft: Minecraft, Palworld, FiveM, Hytale, Valheim, Garry's Mod, Factorio, Satisfactory, Terraria | **absent** | Blipmade: **0 produse de joc** | **Cea mai mare lacună din tot raportul.** Fără un produs de joc, Blipmade nu intră într-o piață pe care concurenții o domină cu zeci de titluri |
| **Prețuri** | Shockbyte de la $3,99/1 GB; Nodecraft de la $5,96 | **parțial** | Blipmade: €1,49 (produs generic), preț pe resursă | Prețul Blipmade e **mai mic** decât oricare concurent. **Prețul nu e problema** — absența produsului e problema |
| **Checkout** | instant setup, 72 h self-serve refund (Shockbyte) | **absent (blocat)** | plățile oprite | **Refund-ul propriu în 72 h e o funcție de încredere**, nu un detaliu: în game hosting, clienții pleacă ușor și caută „îmi dau banii înapoi" |
| **Facturare** | facturi cu plată în USD/EUR, multi-monedă la Nodecraft (9 valute) | **parțial** | Blipmade: EUR unic | — |
| **Self-service** | consolă live, fișiere, instalator de modpack, subdomeniu, backup-uri, panel propriu | **parțial** | Blipmade are toate tab-urile de instanță (files, console, databases, backups, network, startup, schedules) — **dar clasificate `PW`**, dependente de panou și neverificate (`FN-P1-23`); **fără instalator de modpack**, fără page builder | **Blipmade are, ca arhitectură, un panou de client mai bogat decât concurenții** (14 taburi vs. un panou de joc tipic). Dar nu l-a fost exercitat niciodată |
| **Suport** | Shockbyte: **24/7**, 4,7/5. Nodecraft: live chat, **4,9/5 din 1800+ recenzii** | **absent în practică** | Biletele există, dar **e-mailul nu merge** (`OPS-03`), iar atașamentele nu ajung (`FN-P1-02`) | **Recenzile sunt capitalul concurenților.** 1800+ recenzii la Nodecraft înseamnă că un client nou compară nu prețul, ci **numărul de recenzii și suportul** |
| **Operațiuni staff** | nu e relevant (nu au admin public) | — | — | — |
| **Automatizare** | instalare automată de joc, modpack-uri, backup-uri automate | **parțial** | Blipmade: provisionare automată **și** compensație pe eșec — un avantaj real; dar **nu are backup-uri** | — |
| **Fiabilitate** | Shockbyte: „**99.9% Uptime**" + DDoS + backup-uri. Nodecraft: hardware dedicat, latență | **absent** | Blipmade: **fără backup off-host**, fără SLA, DDoS necunoscut (`PORT-03` → `NOT VERIFIED`), `node1.` și `panel.` DNS-only | **Backup-ul și DDoS-ul sunt cele două lucruri pe care fiecare concurent le pune în planul de intrare.** Lipsa lor nu e un defect — e o **vulnerabilitate de vânzare** (`audit/10-positioning.md:53`) |

### 4.8 Aternos (referința „free")

| Domeniu | Ce are Aternos | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog** | Minecraft + Hytale, software oficial | **absent** | — | — |
| **Prețuri** | **€0** | n/a | — | **Aternos nu e un concurent de preț, e o amenințare de segment:** nu câștigă clientul care plătește, ci clientul care *nu plătește deloc*. Blipmade nu îl poate câștiga pe preț; poate doar pe **backup cu backup-uri reale, latență și suport în română** |
| **Fiabilitate** | DDoS gratuit, backup automat în Google Drive, sloturi nelimitate | **absent** | — | — |
| **Localizare** | **20+ limbi, inclusiv Română** | **absent** | Blipmade: interfață strict în engleză, `en-IE` codificat | **Aternos vorbește română. Blipmade nu.** Pe o piață care include România, e o asimetrie directă |

### 4.9 OVINETWORK, Zentaris Host, Torchbyte (piața RO)

| Domeniu | Ce au cei trei | Stare în Blipmade | Gap concret | Consecință |
|---|---|---|---|---|
| **Catalog & deployment** | OVI: Minecraft + panou Pterodactyl. Zentaris: Minecraft Java & Bedrock, sloturi nelimitate, modpack-uri într-un click, Pterodactyl. Torchbyte: Paper, Spigot, Fabric, Forge, modpack-uri complete | **absent** | Blipmade: 0 produse de joc | — |
| **Prețuri** | OVI **€3,99**/4 GB/25 GB NVMe; Zentaris **€4,49**/4 GB/2 vCPU/25 GB SSD; Torchbyte **€4,74**/2 vCPU/4 GB/50 GB NVMe | **parțial** | Blipmade: nu are produs de joc, deci nu are preț de joc. **Propunerea internă** de €4,09 (4 GB/1 vCPU) și €4,49 (4 GB/2 vCPU) ar fi **la prețul pieței** | **Prețul Blipmade ar fi corect calibrat.** Nu e o pârghie de câștig — e condiție de intrare (`audit/08-competitive-analysis.md` §6.3) |
| **Checkout** | OVI: „Prețurile sunt afișate în euro. **Plata se face în lei, la cursul BNR din ziua emiterii facturii proforme + 2%**" | **absent** | Blipmade: EUR fix, fără echivalent în lei | **Blipmade pierde un argument de conversie concret pe piața RO.** OVINETWORK a rezolvat exact problema care e în `PAR-P1-07`: preț afișat familiar, plată în moneda locală |
| **Facturare** | factură cu TVA în lei (implicit) | **absent** | Blipmade: fără TVA (`PAR-P1-02`), factură = PDF Stripe | **Pe piața RO, factura fără TVA e o piedică reală, nu o tehnicitate** |
| **Self-service** | OVI și Zentaris: **ambele folosesc Pterodactyl** — deci **același panou, aceleași file, aceeași consolă** | **parțial** | Blipmade: aceleași tab-uri de instanță, dar `PW`/neverificate (`FN-P1-23`) | **Concurenții nu câștigă din panou — câștigă din „funcționează acum".** Deci relația cu ei e de **fiabilitate**, nu de features |
| **Suport** | OVI: ticket LUNI–VINERI 08:00–20:00. Zentaris: „**pachetele de Minecraft nu includ suport tehnic**". Torchbyte: ingineri care chiar joacă jocul | **absent în practică** | Blipmade: bilete, e-mail inert, fără atașamente | **Zentaris a renunțat explicit la suportul tehnic pe planurile de joc** — deci suportul **nu e o cerință de bază** în această piață. Blipmade nu are nici atât. **Concluzie: suportul e o diferență de așteptare, nu o poziție de leadership** |
| **Automatizare** | activare automată în câteva minute (Zentaris); backup-uri zilnice (Torchbyte) | **parțial** | Blipmade: provisionare automată + compensare pe eșec — **avantaj real**; dar **fără backup** | — |
| **Fiabilitate** | **Anti-DDoS 1 Tbps** la OVI și Zentaris (în toate planurile); filtrare DDoS reglată pentru Minecraft + **backup zilnic inclus** la Torchbyte; OVI declară 99,95% uptime | **absent** | Blipmade: fără backup off-host, fără SLA publicat, DDoS necunoscut | **Acesta e golul comercial #1.** Toți cei trei concurenți RO pun DDoS în planul de intrare; Torchbyte pune și backup-uri zilnice |

---

## 5. Lectura comercială — trei segmente reale

Segmentele de mai jos sunt cele pe care o afacere mică de găzduire le vinde efectiv. Fiecare
afișare e susținută de o cifră sau o funcție verificată, nu de o impresie.

### 5.1 Segmentul S1 — hobbyistul cu un singur server de joc

**Cine e:** un jucător care vrea un server Minecraft pentru 3–8 prieteni. Buget: 0–5 €/lună.
**Cum decide:** caută „minecraft hosting romania", compară 3 prețuri, citește ce promite fiecare
despre backup și DDoS, și încearcă să plătească. Dacă plățile nu merg, pleacă.

| Ce câștigă Blipmade | Ce pierde Blipmade |
|---|---|
| **Prețul, dacă ar exista un produs de joc.** Propunerea internă de €4,09 (4 GB / 1 vCPU / 25 GB) e **la nivelul pieței**: OVI €3,99, Zentaris €4,49, Torchbyte €4,74. Blipmade ar fi al treilea, cu **1 vCPU în plus față de OVI la același preț** (`audit/08-competitive-analysis.md` §6) | **Nu există produs de joc.** `api/prisma/seed.ts:55-171` conține 5 produse, toate generice; `grep` pe tot repo-ul: **0 mențiuni de Minecraft/game server**. Un hobbyist Minecraft **nu găsește ce caută** — nu pierde un avantaj, **nu intră pe site cu această intenție** |
| — | **Nu există backup.** `DR-02`: `OFFSITE_TARGET` unset, `rclone` neinstalat, timerul neinstalat. Torchbyte pune **50 GB de backup + backup zilnic în planul de €4,74** |
| — | **Nu există protecție DDoS** (`PORT-03` → `NOT VERIFIED`; `panel.` și `node1.` DNS-only). OVI: **1 Tbps**; Zentaris: Anti-DDoS inclus; Aternos: gratuit |
| — | **Interfața e în engleză, iar formatarea e `en-IE`** (`api/src/lib/money.ts:8`) — o **limbă care nu e nici engleză, nici română**. Aternos are **20+ limbi, inclusiv Română** |
| — | **Nu există plan free.** Aternos: **€0**, cu DDoS și backup. Blipmade: cel mai ieftin produs e €1,49, iar plățile sunt oprite |
| — | **Nu există instalare cu un click a jocului / modpack-urilor.** Zentaris și Shockbyte o au; Blipmade livrează un „starter app" generic (`api/src/services/starter-apps.ts:53-91`) — `OPS-01` |
| — | **Portul nu e 25565.** Provisionarea preferă `port >= 30000` (`api/src/services/provisioning.ts:218`), deci un server ajunge pe `node1.blipmade.com:30012` — **funcțional, dar cu friction** |
| — | **Nu există recenzii și nu există suport.** Nodecraft: **4,9/5 din 1800+ recenzii**; Shockbyte: 4,7/5, 24/7. Blipmade: bilete, dar e-mail inert și fără atașamente (`OPS-03`, `FN-P1-02`) |

**Verdict S1: pierdut pe categoria, nu pe preț.** Blipmade n-are ce compara. Orice lucru construit
înainte de a exista un produs de joc, backup și DDoS se pierde înainte de a fi folosit.

### 5.2 Segmentul S2 — comunitatea mică (8–50 jucători)

**Cine e:** un grup care are nevoie de 6–12 GB RAM, de un port dedicat, de backup-uri și de
**un preț care crește cu resursa** fără schimbare de plan.

| Ce câștigă Blipmade | Ce pierde Blipmade |
|---|---|
| **Preț pe resursă, fără planuri fixe.** Clientul crește de la 4 GB la 8 GB **fără să-și schimbe planul** — prețul se recalculează pe resursa reală (`api/prisma/schema.prisma:264-282`: `ramPerGb`, `cpuPerUnit`, `diskPerGb`). Zentaris și Torchbyte vând **planuri discrete**, cu salturi de la 4 la 8 la 16 GB | **Peste 6 GB RAM, cardul de preț pierde față de un VPS.** La 8 GB / 2 vCPU / 50 GB, prețul calculat e **€7,39**, iar un VPS de 8 GB / 4 vCPU se vinde la **€5,50** (`audit/08-competitive-analysis.md` §6.2). **Plaidarul e corect pentru 2–6 GB și greșit peste 6 GB** — plafonul de RAM al produsului de joc trebuie să fie 6 GB, nu 16 |
| **Compensare automată la eșecul de provisionare.** Niciun concurent verificat nu o promite public; e o garanție reală, implementată (`api/src/services/provisioning.ts:477-500`) | **Sloturile nelimitate** sunt un argument de vânzare explicit la Zentaris („Sloturi nelimitate" în toate planurile) și la Aternos („Unlimited slots"). Blipmade nu are un concept de slot — **nici pro, nici contra** |
| **Self-service complet în interfață**, fără să intri în panoul Pterodactyl: fișiere, consolă, baze de date, backup-uri, rețea, startup, cron-uri — 12 tab-uri (`FUNCTIONAL-COVERAGE.md:207-214`) | **Dar toate sunt `PW`** (parțial conectate) și `FN-P1-23` le marchează neverificate: „funcțiile de instanță care depind de panou nu au putut fi exercitate". **Un panou bogat, care nu a fost niciodată demonstrat funcționând** |
| **Prețul e previzibil** (fix per configurație), pe când Railway și Render taxează consumul real | **Fără SLA publicat.** OVI declară 99,95%; Shockbyte publică „99.9% Uptime"; Blipmade nu publică nimic |
| — | **Fără backup** — pentru o comunitate, o lume pierdută înseamnă un client pierdut (`audit/10-positioning.md:52`) |
| — | **Fără protecție DDoS** — o comunitate publică e ținta naturală a unui atac |
| — | **Fără instalare de modpack-uri / pluginuri în un click** — pentru Minecraft e o condiție de bază la concurenți |
| — | **Fără uptime-monitorizare pentru client**: niciun consum real de resurse (`FN-P1-04`), niciun dashboard de metrici |

**Verdict S2: potențial real, dar goluri care se citesc înaintea prețului.** Blipmade are aici
singurul model de preț cu care chiar poate câștiga (resursă, nu plan) — dar fiecare gol
(DDoS, backup, sloturi, modpack-uri, SLA) e verificabil de client înainte de a plăti.

### 5.3 Segmentul S3 — resellerul

**Cine e:** cineva care deține 10–100 de servere și le vinde. Buget: un software de business,
sau o platformă găzduită cu facturare.

| Ce câștigă Blipmade | Ce pierde Blipmade |
|---|---|
| **Foarte puțin.** Cele trei lucruri pe care le are: preț pe resursă (util pentru un catalog de produse), compensație la eșec, și prețuri EUR | **Nu e self-hostable.** Un reseller nu-și poate pune platforma pe serverul lui — deci **nu poate folosi Blipmade ca platformă a afacerii lui** |
| — | **Niciun API public** (`grep openapi` → 0 potriviri). Fără API, un reseller nu poate sincroniza clienții, comenzile sau serverele cu sistemul lui |
| — | **Fără multi-tenant.** Un singur set de setări (`api/prisma/schema.prisma:809`), un singur catalog, un singur set de utilizatori. Niciun mecanism de „sub-conturi" de reseller |
| — | **Fără preț cu grosime / revânzare**, fără program de afiliați, fără markup per reseller |
| — | **Fără punct de extensie** — nu poate adăuga un gateway, un tip de produs sau un panou client propriu |
| — | **Fără facturare completă** (TVA, dunning, rambursare) — deci nici măcar nu poate face ce știe face |

**Ce face un reseller azi:** instalează **Pterodactyl** (gratuit) + **Paymenter** (MIT) sau
**FOSSBilling** (gratuit/Apache-2.0), și obține catalog, facturare, ticketing și provisionare
într-o oră. **Alternativa lui Blipmade, pentru el, nu există.**

**Verdict S3: pierdut categoric, și e corect să fie pierdut.** Blipmade nu ar trebui să
concureză aici, pentru că ar trebui să devină un concurent direct al lui Paymenter și
FOSSBilling — adică exact lucrul pe care faza 8 arată că îl face prost. **S3 e o piață de
consolidare, nu de concurență**: un reseller care are prea mulți clienți și nu-și vrea
administrarea factură poate deveni client Blipmade. Pentru asta îi trebuie **API + facturare
completă**, nu un motor de temă.

### 5.4 Rezumatul pe segmente

| Segment | Câștigă azi | Pierde azi | Ce trebuie, ca să câștige |
|---|---|---|---|
| **S1 hobbyist** | preț (dacă ar exista produs) | **nu există produs de joc**, backup, DDoS, plan free, RO | produs de joc + backup + DDoS + RO + plată pornită |
| **S2 comunitate** | preț pe resursă fără planuri, compensație la eșec, self-service | sloturi, modpack-uri, SLA, metrici, backup, DDoS | cele de mai sus + sloturi + metrici |
| **S3 reseller** | nimic relevant | tot | API + facturare completă + multi-tenant (nu se face acum) |

---

## 6. Ce Blipmade NU ar trebui să construiască

Nomind ce trebuie **omis**, cu motivul. O platformă mică care copiază WHMCS pierde.

| # | Ce NU să construiască | De ce | Ce să facă în schimb |
|---|---|---|---|
| 1 | **Un clone de WHMCS** (dunning, facturi draft, dispute handling, quotes, 3 ani de perioade, 20 de gateway-uri) | WHMCS costă $34,95/lună și are 500+ integrații; FOSSBilling e **gratuit** și are Invoice PDFs, multi-monedă și API Keys; Paymenter e **MIT**. Reproducerea acestui set e ani de lucru și n-ar ajunge la nivelul pieței | Să folosească **un motor de facturare existent**, dacă va fi nevoie, ca motor intern — și să se concentreze pe **provisionare**, unde e unica cu adevărat |
| 2 | **Multi-monedă cu sincronizarea cursului** | Pe piața țintă, **toți cei trei concurenți RO afișează prețul în EUR** (OVI plătește în lei la BNR+2%, dar afișează EUR). Moneda unică EUR e **coerentă cu piața**. Nodecraft are 9 valute, dar Nodecraft vinde internațional | **O singură monedă, afișată corect** + un formular de plată care să spună clar „factura e în EUR". Pentru clienți RO: **factură în lei, nu neapărat preț în lei** |
| 3 | **Sistem de teme și marketplace de extensii** | Nu există ecosistem, nu există bază de utilizatori, nu există terți. Un marketplace gol e un eșec public. Paymenter are marketplace pentru că are ~2.800 de stele și 4 ani de dezvoltare | **Un design system intern, bine făcut** — care există deja (`web/src/ui-app.tsx`) |
| 4 | **Departamente de ticketing, ticketing prin IMAP, chat live** | Un operator, trei bilete. Zentaris a renunțat explicit la suportul tehnic pe planurile de joc și continuă să câștige | **Un formular de bilet care funcționează, cu atașament** (`FN-P1-02`) — un singur lucru, bine făcut |
| 5 | **Motor de cupoane avansat, gift cards, loyalty, cashback** | `Promotion` cu procent/fix, plafon, per-utilizator, fereastră de validitate există și e suficient pentru o campanie de lansare | **Folosiți ce există**: o campanie Discord (`MKT-11`) e realizabilă mecanic (`PROMO-02/03/07` → `VERIFIED FIXED`) |
| 6 | **Module de reseller VPS** (Proxmox, Hetzner, Linode — ca în marketplace-ul Paymenter) | E altă piață, altă marjă, alt model de cost. Nodul Blipmade e un nod de jocuri; un VPS pe același nod are un cost de calcul și un risc de vecinătate diferite | **Zero.** Singura excepție: dacă operatorul vrea diversificare, e o decizie de business separată, nu o funcție de platformă |
| 7 | **API public REST complet cu 48 de endpoint-uri** (ca Paymenter) | Blipmade nu are contract de preț stabilizat public, nici consumatori. Un API mare, înainte de a exista consumatori, e întreținere | **Un API read-only mic** (servicii, facturi, instanțe, bilete) — dar **după** ce plățile și catalogul funcționează |
| 8 | **Blog, SEO și marketing automation ca platformă** | Nu blochează o vânzare și consumă buget de la operațiuni | **O pagină de produs corectă** și, mai târziu, conținut |
| 9 | **2FA, MFA, SSO, SCIM, RBAC avansat** | Nu e cerință de segment pe piața țintă — dar **2FA singur** e altă chestie: platforma deține chei Stripe și token-uri de panou. Costă o zi | **Doar 2FA (TOTP)**, pentru conturile staff și admin. Atât |
| 10 | **Să încerce să servească simultan segmentul S1 și S2 și S3** | Resursele sunt limitate; un produs cu 4 GB nu-i place nici pe S1 (prea scump) nici pe S2 (prea puțin). Răspunsul corect e **un plan de 2–6 GB optimizat pentru 4 GB**, ca în propunerea internă | **Un singur produs de intrare, bine calibrat**, plus un upgrade clar |

**Regula de aur, reformulată:** *fiecare funcție nouă trebuie să închidă un gol pe care un
concurent îl acoperă deja și care apare **înainte** de momentul plății.* Funcțiile care nu se
potrivesc acestui criteriu intră în coadă, indiferent cât de elegant sunt.

---

## 7. Diferențiatorul realist — răspunsul onest

Brief-ul cere să spunem limpede dacă munca din rundă este un **avantaj de piață astăzi** sau doar
o **nichelitate tehnică până se pornesc plățile și catalogul**. Răspunsul este al doilea, dar
cu o precizare importantă: există **un singur** activ care ar putea deveni diferențiator, și
el este mai bun decât media.

### 7.1 Ce e deja construit (runda 1 și 2) și cum arată pe piață

| Activ construit | E vizibil de client? | E un avantaj azi? | De ce |
|---|---|---|---|
| **Contractul de preț** — o singură funcție de calcul, folosită de catalog, cotă și comandă | Da — prețul afișat e prețul plătit | **Nu** | Niciun concurent verificat nu afișează un preț greșit; deci nu se vede. E o condiție de igienă, nu un argument |
| **Disponibilitatea derivată din realitate** (`deployable` din ou, nu din flag) | Da — catalogul spune „nu e disponibil" în loc să ascundă produsul | **Nu** | Niciun concurent nu ascunde produse. Diferența e că Blipmade *nu minte* — iar un concurent care minte e un concurent care pierde clientul, nu unul care câștigă |
| **Poarta de capacitate** și stările realiste de instanță | Parțial | **Nu** | `PROV-05` → stările **nu** reflectă încă realitatea (`api/src/routes/instances.ts:149`) |
| **Compensarea pe provisionare eșuată** + idempotență | Da — clientul primește compensație | **Nu (încă)** | Niciun concurent verificat nu o promite public; dar până când catalogul nu are produse, nu se declanșează |
| **Numerotarea atomică** a comenzilor și facturilor | Nu — e invizibilă | **Nu** | E corectitudine contabilă. Clientul nu o vede; auditorul o vede |

**Concluzia fermă: în starea curentă, niciuna dintre aceste lucruri nu e un avantaj de piață.**
Toate sunt **active** care ar deveni avantaje într-un scenariu determinat — și acel scenariu nu
e „când se termină developmentul", ci „când se pornesc plățile **și** există produse de joc
**și** există backup **și** există DDoS".

### 7.2 Singurul activ cu potențial real de diferențiere

**Prețul pe resursă, cu garanții de încredere pe care concurenții nu le au.**

| Componentă | Are concurentul? | E implementată în Blipmade? |
|---|---|---|
| Preț care crește **continuu** cu resursa, fără planuri discrete | Zentaris/Torchbyte/OVI: **nu**, planuri fixe cu salturi | **Da** — `api/prisma/schema.prisma:264-282`, contract de preț unic (`PRICE-02`/`PRICE-05` → `VERIFIED FIXED`) |
| **Compensație automată** dacă provisionarea eșuează | **Nu verificat** la niciun concurent | **Da** — `api/src/services/provisioning.ts:477-500` |
| **Disponibilitate onestă** — produsul care nu poate fi livrat nu e comandabil | Shockbyte/Nodecraft au catalog fix, nu au această problemă | **Da** — `api/src/services/availability.ts` (`AVAIL-01`) |
| **Backup cu cota, la preț** | Torchbyte: 50 GB + zilnic la €4,74 | **Nu** — `DR-02` |
| **DDoS în planul de intrare** | OVI 1 Tbps, Zentaris inclus, Shockbyte inclus | **Nu** — `PORT-03` |
| **Interfață în română** | Aternos: 20+ limbi | **Nu** — `en-IE` codificat |

**Deci:** diferențiatorul **nu există încă**. Cele trei componente pe care Blipmade le are
avantajoase față de concurenți (preț continuu, compensație, disponibilitate onestă) sunt
**invizibile** fără un produs de joc, fără backup și fără DDoS — adică exact lucrurile care
lipsesc. Cele trei componente pe care concurenții le au și Blipmade nu (backup, DDoS, română)
sunt **vizibile înainte de plată**.

**Este, în formularea cea mai exactă: un potențial de poziționare, suspendat de trei
dependințe de operator.** Când se închid cele trei, diferențiatorul devine real **în aceeași
zi** — pentru că platforma care onorează prețul, compensează eșecul și nu vinde ce nu livrează
**devine exact tipul de serviciu pentru care un client de joc plătește în plus față de oamenii
care vând un plan și o adresă IP.**

---

## 8. Top 10 acțiuni competitive, în ordine

Ordinea reflectă **blocajul de vânzare**, nu efortul. Acțiunile 1–4 sunt toate dependințe de
operator; 5–7 sunt de cod, cu o decizie de operator asociată.

| # | Acțiune | De ce câștigă sau pierde vânzări | Efort | Risc | Dependențe |
|---|---|---|---|---|---|
| **1** | **Creează produsul de joc `minecraft-paper`** (imagine Docker reală, ou Pterodactyl mapat, health-check pe aplicația produsului, preț €4,09 la 4 GB/1 vCPU și €4,49 la 4 GB/2 vCPU, plafon RAM 6 GB) | Fără el, Blipmade **nu intră pe piața pe care infrastructura lui e deja calibrată**. Competitorii RO vând exclusiv asta. Prețul propus e deja la nivelul pieței (OVI €3,99, Zentaris €4,49, Torchbyte €4,74), deci **nu e nevoie de o pârghie de preț** | **M** (cod: rând de produs, `eggId`, `healthProbe`, `minRam/minCpu/minDisk`, `baseAmount`) + **L** (conținutul imaginii) | **Mediu** — o imagine greșită înseamnă „serverul nu pornește" la fiecare comandă; cost de suport și de reputație | **Operator**: imaginea Docker + maparea `eggId` + `POST /admin/infrastructure/sync`. **Cod**: `OPS-01`, `PLP-01` (WordPress are `eggId` NULL) |
| **2** | **Pornește plățile** (chei Stripe live, `PAYMENTS_ENABLED=true`, webhook, un checkout real de probă cu factură confirmată) | **Zero venit până aici.** Orice altă acțiune de marketing produce comenzi eșuate, nu clienți | **S** | **Scăzut** — codul e complet și testat (`PAY-03`, `OPS-02`); e o problemă de chei, nu de bug | **Operator**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`. **Blocă acțiunea 7** |
| **3** | **Backup off-host programat, cu restaurare probată** + promisiune „backup zilnic, N GB" în pagina de produs | **Torchbyte pune 50 GB de backup zilnic în planul de €4,74.** Fără backup, produsele de joc sunt stateful și o lume pierdută înseamnă un client pierdut (`audit/10-positioning.md:52`). E un **criteriu de eliminare**, nu un avantaj | **S** — scripturile există (`scripts/install-backup-timer.sh`, `scripts/backup-offsite.sh`, `scripts/restore-drill.sh`); lipsește *programarea* și *ținta* | **Scăzut** | **Operator**: `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` în `/opt/blipmade/.env`, instalarea lui `rclone` (absent pe VM 103), rularea `install-backup-timer.sh --run-now`, `restore-drill.sh` pe bază de scratch. **Este și o condiție de GDPR** (`COMM-08`) |
| **4** | **Protecție DDoS la edge pentru `node1.` și `panel.`** — sau, dacă nu e posibilă acum, o poziționare explicită („fără DDoS, cu preț mai mic") | OVI: **1 Tbps**; Zentaris: Anti-DDoS inclus; Shockbyte: inclus; Aternos: **gratuit**. Vinderea unui server public fără filtrare DDoS, într-o piață în care toți o includ, e **o vulnerabilitate de vânzare**, nu o poziționare (`audit/10-positioning.md:53`) | **M** (cod/config) + **L** (rețea) | **Mediu-înalt** — cost recurent; DDoS-ul e un serviciu cu cost variabil, iar un incident pe un nod de joc e vizibil public | **Operator**: edge-ul de pe VM 102 (acces neacordat în runda anterioară), plan de filtrare la furnizorul de rețea. **Doar după acțiunea 3** |
| **5** | **Interfață în română** — `ro` în formatarea banilor și a datelor, plus traducerea paginilor de checkout, catalog, bilete și e-mailuri | Aternos servește **20+ limbi, inclusiv Română**; OVINETWORK plătește în **lei la cursul BNR + 2%**. Pe o piață care include România, engleză e o asimetrie, iar `en-IE` e o **limbă greșită** (`api/src/lib/money.ts:8`) | **M** | **Scăzut** — cu excepția conținutului editorial, care trebuie tradus și revizuit | **Nicio** (textele în română sunt decizie de operator, nu blocaj tehnic) |
| **6** | **Adresă publică reală pentru instanțe** (Caddy edge + `DOMAIN_BASE` + credențiale admin) + documentație despre port | Fără adresă, produsul nu există. Plus: provisionarea preferă `port >= 30000` (`api/src/services/provisioning.ts:218`), deci serverul ajunge pe `node1.blipmade.com:30012` — **funcțional, dar cu friction de vânzare** față de un concurent care dă port standard | **S** (config) | **Mediu** — greșelile DNS/edge produc erori greu de diagnosticat pentru client | **Operator**: `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`; acces la VM 102 |
| **7** | **Factură proprie, cu TVA, emisă și vizibilă de client** | Fără factură, **clientul de business nu plătește** (`FN-P1-26`, `FN-P1-03`). Fără TVA, factura nu e deductibilă (`PAR-P1-02`). Pe piața RO, unde facturile se emit în lei cu TVA, e o condiție, nu un detaliu | **M** | **Scăzut** | **Acțiunea 2** (plățile) + **decizie de operator**: rată, bază (net / TVA-inclus), tratament pentru clienți B2B |
| **8** | **Instalare cu un click a jocului și a modpack-urilor** + **semantică de sloturi** („sloturi nelimitate" apare la Zentaris în toate planurile și la Aternos) | E în tabelul de comparație al fiecărui concurent RO și internațional. Un client care alege între două panouri cu preț similar alege pe „câte jucători intră" | **M–L** | **Mediu** — dependente de ou; e o funcție a panoului Pterodactyl, deci e mai ieftină decât pare | **Acțiunea 1** (produsul de joc) |
| **9** | **Pagină de stare reală + țintă de uptime publicată + changelog „shipped"** | Shockbyte publică „99.9% Uptime"; OVI declară 99,95%. Blipmade are deja `/status`, dar raportează „Support — Degraded" (`OPS-06`) și „Automation worker: Outage" în stiva izolată. **O pagină de stare care spune „degraded" în permanență distruge mai mult decât lipsa ei** | **S** | **Scăzut** — cu un risc de onestitate: publicarea unei ținte impune măsurarea ei | **Nicio** tehnică; depinde de backup + edge pentru ca măsurătoarea să fie credibilă |
| **10** | **Construiește stratul de încredere: 3–5 clienți nominali, un studiu de caz, recenzii reale, preț și garanții afișate pe pagina de produs** | Nodecraft: **4,9/5 din 1800+ recenzii**. Shockbyte: 4,7/5 cu 24/7. **Recenzia e cel mai puternic activ competitiv din întregul set** — și Blipmade are **0**. Un client nou compară numărul de recenzii înainte de preț | **M** | **Mediu** — reputațional: o recenzie negativă pe o platformă cu 0 clienți nu e compensată de nimic | **Acțiunile 1, 2, 3 și 6** — **nu se poate cere o recenzie înainte ca produsul să funcționeze**. Această acțiune e deliberată **la sfârșit**, nu prima |

### 8.1 Acțiuni care ar fi tentante dar nu se fac acum

| Acțiune tentantă | De ce nu e în top 10 |
|---|---|
| API public pentru reselleri | Segmentul S3 nu e ținta (vezi §5.3); un API consumă întreținere fără consumatori |
| Cofurnică de produse (10 produse de joc) | Acțiunea 1 e despre **un** produs bine calibrat. Zece produse cu imagini neverificate = zece moduri de a eșua |
| Program de afiliați | Nu blochează o vânzare și nu aduce clienți înainte de a exista produsul |
| Chat live / WhatsApp | Un operator; biletele cu atașament rezolvă 90% din cazuri |
| Extensii Pterodactyl/Convoy/cPanel | Blipmade **nu** e o platformă de business; astea sunt funcții de reseller |
| Multi-monedă | Piața țintă tranzacționează în EUR (vezi §6, poziția 2) |

---

## 9. Constatări

| ID | Titlu | Severitate | Consecință comercială | Dovezi | Acțiune recomandată | Efort | Dependență |
|---|---|---|---|---|---|---|---|
| **COMP-P1-01** | **Nu există niciun produs de joc în catalog** | **P0 / Critical** | Blipmade nu intră pe singura piață pentru care infrastructura lui e dimensionată. Nu e o problemă de „feature lipsă" — e o problemă de **piață absentă**. Toate celelalte acțiuni (backup, DDoS, română, recenzii) sunt amânate până când există un produs de vândut | `api/prisma/seed.ts:55-171` (5 produse, toate generice); `api/prisma/schema.prisma:205-212` (`enum Category` fără categorie de jocuri); `grep -rniE "minecraft\|game server\|palworld\|valorant"` pe tot repo-ul → **0 potriviri**; `audit/10-positioning.md:50` (`minecraft-paper` = `LAUNCH-AFTER-FIX`) | Acțiunea 1 | M | **Operator** (imagine + egg) |
| **COMP-P1-02** | **Plățile sunt oprite: nu se poate vinde nimic** | **P0 / Critical** | Zero venit; în plus, orice campanie de marketing produce comenzi eșuate | `OPS-05` → `STILL BROKEN`; `api/src/services/stripe.ts:194-197`; `PORT-07` → `STILL BROKEN` („niciun produs nu poate fi vândut azi"); `docs/PRODUCTION_READINESS.md:83` | Acțiunea 2 | S | **Operator** (chei Stripe) |
| **COMP-P1-03** | **Nu există backup off-host, iar backupul e în planul de intrare al fiecărui concurent RO** | **P0 / Critical** | Produsele de joc sunt stateful. O lume pierdută = client pierdut + recenzie negativă. E un **criteriu de eliminare** înaintea prețului. Plus: `SESSION_SECRET` e ireversibil — pierderea hostului pierde toate datele clienților | `DR-02`/`INF-01`/`INF-02` (`PREVIOUS-FINDINGS-REVALIDATION.md:602-629`): timer neinstalat, `OFFSITE_*` unset, `rclone` absent; Torchbyte: 50 GB + zilnic la €4,74 (U22) | Acțiunea 3 | S | **Operator** (`OFFSITE_*`, `rclone`, timer, drill) |
| **COMP-P1-04** | **Nu există protecție DDoS, deși toți concurenții o includ** | **P0 / Critical** | Fiecare concurent din set o pune în planul de intrare; Aternos o dă gratuit. Absența e o **vulnerabilitate de vânzare**, nu o poziționare | `PORT-03` → `NOT VERIFIED`; `audit/10-positioning.md:53` („nu e o poziționare — e o vulnerabilitate de vânzare"); OVI 1 Tbps (U20), Zentaris inclus (U21), Shockbyte inclus (U17), Aternos gratuit (U23) | Acțiunea 4 | M | **Operator** (edge VM 102) |
| **COMP-P1-05** | **Fără adresă publică pentru instanțe** | **P0 / Critical** | Produsul nu are adresă; niciun concurent nu vinde fără | `OPS-04` → `STILL BROKEN` (`DOMAIN_BASE` unset; `api/src/services/gateway.ts:176-178`); `docs/PRODUCTION_READINESS.md:94` | Acțiunea 6 | S | **Operator** (Caddy, VM 102) |
| **COMP-P1-06** | **Interfața e strict în engleză, iar formatarea e `en-IE`** | **High** | Asimetrie directă pe o piață care include România: Aternos servește România; OVINETWORK plătește în lei la BNR+2%. `en-IE` e **irlandeză** — formatarea banilor și a datelor e greșită pentru un client RO, pe pagina de checkout | `api/src/lib/money.ts:8`; `web/src/lib/api.ts:164`; `web/src/app/Settings.tsx:62`; `web/src/app/instance/common.tsx:76,89` | Acțiunea 5 | M | — |
| **COMP-P1-07** | **Factura de client e un PDF Stripe, fără TVA** | **High** | Blochează clienții de business; nu e deductibilă; nu e în română. Pe piața RO e o condiție de plată | `FN-P1-26`, `FN-P1-03`; `api/prisma/schema.prisma:482` (`pdfUrl`); `api/src/services/stripe.ts:438-460` (`tax ?? 0`); `api/src/services/billing.ts:642,944` (`tax: 0`) | Acțiunea 7 | M | Acțiunea 2 + decizie de operator (TVA) |
| **COMP-P1-08** | **Blipmade nu poate fi folosit de un reseller** | **High** (pentru segmentul S3) | Un reseller instalează Pterodactyl + Paymenter/FOSSBilling într-o oră și obține catalog, facturare, ticketing și provisionare. Blipmade nu îi oferă niciuna dintre primele trei | `grep openapi` → 0; niciun `ApiKey` în `schema.prisma`; `schema.prisma:809` (`Setting` unic, fără multi-tenant); FOSSBilling gratuit + Apache-2.0 (U06, U08); Paymenter MIT (U24) | **Nu se acționează acum.** Se documentează ca decizie de scope: S3 nu e ținta | — | — |
| **COMP-P1-09** | **Peste 6 GB RAM, prețul pierde față de un VPS** | **High** | Clientul compară și pleacă. E un plafon de **portofoliu**, nu de cod | `audit/08-competitive-analysis.md` §6.2: la 8 GB / 2 vCPU / 50 GB prețul calculat e **€7,39**, iar un VPS de 8 GB / 4 vCPU e **€5,50** | plafon de RAM la 6 GB pentru produsul de joc (decizie de produs) | S | — |
| **COMP-P1-10** | **Nu există recenzii, referințe sau dovezi publice** | **High** | Nodecraft: **4,9/5 din 1800+ recenzii**; Shockbyte: 4,7/5. Recenzia e cel mai puternic activ din set, iar Blipmade are **0**. Cu 0 clienți și 0 recenzii, prima recenzie negativă nu e compensată de nimic | U17, U18, U19; starea curentă: plăți oprite, catalog fără produs de joc | Acțiunea 10 — **la sfârșit**, nu la început | M | Acțiunile 1, 2, 3, 6 |
| **COMP-P1-11** | **Suportul e un canal mort**: e-mail inert, atașamente care nu ajung, niciun răspuns real | **High** | Shockbyte oferă 24/7 cu 4,7/5; Nodecraft, live chat cu 4,9/5. În game hosting, un bilet fără log e un bilet rezolvat prin refuz | `OPS-03` → `STILL BROKEN` (`SMTP_URL` unset, transport `file`); `FN-P1-02` (`Attachment` = 0 rânduri); `OPS-06` (`/status` → „Support — Degraded") | Configurare SMTP + upload real de atașamente | S + M | **Operator** (`SMTP_URL`) |
| **COMP-P1-12** | **Pagină de stare care raportează „degraded"** | **Medium** | O pagină `/status` care spune permanent „Support — Degraded" și „Automation worker: Outage" e mai costisitoare decât absența ei: e o declarație publică de incident | `OPS-06` → `STILL BROKEN`; `FUNCTIONAL-COVERAGE.md:189` (A05: „Automation worker: Outage") | Repară cauzele sau scoate pagina din piață până e corectă; publică apoi o țintă de uptime | S | — |
| **COMP-P1-13** | **Nicio instalare cu un click de joc / modpack, nici semantică de sloturi** | **Medium** | E în tabelul de comparație al fiecărui concurent RO și internațional | U21 (Zentaris: modpack-uri într-un click, sloturi nelimitate), U16 (Shockbyte: instalator de modpack-uri și pluginuri), U23 (Aternos: unlimited slots) | Acțiunea 8 | M–L | Acțiunea 1 |
| **COMP-P1-14** | **Prețul nu e o pârghie: e deja corect calibrat, dar nu câștigă nimic** | **Medium** (constatare, nu defect) | Concluzia de la `audit/08-competitive-analysis.md` §6.3 se confirmă: la €4,49 pentru 4 GB / 2 vCPU, Blipmade ar fi la nivelul Zentaris, cu €0,50 peste OVI și €0,25 sub Torchbyte. **Câștigul trebuie să vină din backup + DDoS**, singurele două lucruri pe care concurenții le pun în plan | U20, U21, U22; `audit/08-competitive-analysis.md` §6.3 | Nu se face nimic pe preț; se investește în backup și DDoS | — | — |
| **COMP-P1-15** | **Blipmade nu are un API, deci nu e integrabil** | **Medium** | Nu blochează vânzarea S1/S2, dar blochează orice automatizare externă și exclude segmentul S3. Paymenter are 22 rute / 48 operații documentate în OpenAPI | `grep -rniE "openapi\|swagger" api/src web/src` → **0 potriviri**; niciun `ApiKey` în `schema.prisma`; U24 (`https://paymenter.org/openapi.json`, OpenAPI 3.1.0, 11 tag-uri, 48 operații) | API read-only mic, **după** ce plățile și catalogul funcționează | M | Acțiunile 1 și 2 |
| **COMP-P1-16** | **Fără SLA și fără țintă de uptime publicată** | **Medium** | Shockbyte publică „99.9% Uptime"; OVI declară 99,95%. În fața unui client de joc care compară, absența promisiunii e o promisiune mai slabă | U17, U20; Blipmade: nu publică nicio țintă | Acțiunea 9 | S | Acțiunea 3 (ca să fie credibilă) |
| **COMP-P1-17** | **Fără 2FA, pe o platformă care deține chei Stripe și token-uri de panou** | **Medium** | Nu blochează vânzarea pe piața țintă, dar e o slăbiciune de credibilitate în fața unui client care plătește cu cardul companiei | `grep -rniE "totp\|2fa\|twoFactor" api/src web/src api/prisma/schema.prisma` → **0 potriviri** | TOTP pentru staff și admin | M | — |
| **COMP-P1-18** | **Fără plan free / fără prag de intrare** | **Medium** | Aternos: **€0**, cu DDoS și backup. Un vizitator care nu vrea să plătească nu are nicio treaptă; iar un client de gaming compară cu „gratuit" | U23; `enum SubscriptionStatus` conține `TRIALING` (`schema.prisma:416`) dar nu există logică de perioadă de probă | Un plan de probă sau o treaptă foarte ieftină, după acțiunea 2 | M | Decizie de operator |
| **COMP-P1-19** | **Blipmade nu se poate integra cu tooling extern** | **Low / Info** | Nu blochează o vânzare; blochează eficiența operațională | ca COMP-P1-15 | — | — | — |
| **COMP-P1-20** | **Discrepanță de licență la FOSSBilling între site și repo** | **Low / Info** | Nu afectează Blipmade. Dar cine ar forka FOSSBilling trebuie să știe că **fișierul `LICENSE` din repo este Apache-2.0**, nu AGPL-3.0 | U06 („Licensed under AGPL 3.0") vs. U08 (`LICENSE` = Apache License 2.0; `api.github.com/repos/fossbilling/fossbilling/license` → `Apache-2.0`) | Raportat; nicio acțiune | — | — |

---

## 10. Ce nu am putut verifica

### 10.1 Despre concurenți

| Ce | De ce nu s-a putut verifica | Ce am făcut în schimb |
|---|---|---|
| **Panourile de client ale concurenților** (Shockbyte, Nodecraft, OVI, Zentaris, Torchbyte, Aternos) | Nu am creat conturi și nu am făcut comenzi. Nu s-a exercitat niciun concurent | Am extras **doar ce promit paginile lor publice de vânzare**. Funcționalitatea reală a panoului lor e `neverificat` |
| **Fiabilitatea reală** a serviciilor lor (uptime efectiv, calitatea backup-urilor) | Nu se poate măsura de pe paginile de marketing | Am citit **declarațiile** lor („99.9% Uptime", „backup-uri automate zilnice") și le-am tratat ca **declarații de marketing**, nu ca măsurători |
| **GameServers.org** | **Eroare SSL** la acces (`unable to get local issuer certificate`) | Nu se afirmă **nimic** despre acest furnizor |
| **Suportul tehnic real** al OVINETWORK/Zentaris/Torchbyte | Orarul și politica sunt publicate; timpul real de răspuns nu e măsurabil de pe pagini | Am citit declarațiile: OVI „TICHET SUPORT: LUNI-VINERI 08:00-20:00"; Zentaris „pachetele de Minecraft nu includ suport tehnic" |
| **Dacă FOSSBilling are într-adevăr module AGPL** | Discrepanță între surse oficiale (§3, observația de licență) | Am raportat **ambele** surse, fără să aleg |
| **Calitatea traducerii RO a interfeței Aternos** | Pagina e disponibilă în română, dar n-am verificat profunzimea traducerii | Am raportat existența limbii (`U23`), nu calitatea ei |
| **Numerele de recenzii ale Nodecraft și Shockbyte în timp** | Sunt afișate pe pagină la momentul citirii | Am notat valoarea și data (23.10.2026) |
| **Furnizorii internaționali de game hosting din `audit/08-competitive-analysis.md` §5** — rămși `NOT-VERIFIED` în runda anterioară | Nu au fost re-verificați în această fază | Am închis parțial golul cu **Shockbyte** și **Nodecraft** (U16–U19), ambele citite direct |
| **Prețurile Heroku, Contabo, Lunafy** | Nu refetcate în această fază | Folosite doar ca reper istoric din `audit/08-competitive-analysis.md` §4.1, §4.4, §4.5, cu URL-ul lor acolo |
| **Dacă există un concurent cu un preț *sub* €3,99 pentru Minecraft în RO** | Am căutat trei furnizori RO și Aternos; o căutare exhaustivă nu a fost făcută | Cifrele raportate sunt cele ale furnizorilor **verificați**; nu se afirmă că lista e completă |
| **Comisioanele Stripe în RO și impactul lor asupra prețului final** | Nu am verificat lista oficială de prețuri Stripe | Nu se afirmă nimic despre rata efectivă pentru clientul final RO |

### 10.2 Despre Blipmade

| Ce | De ce nu s-a putut verifica | Ce am făcut în schimb |
|---|---|---|
| **Prețul efectiv de vânzare** | Nu există produs de joc de vândut, deci nu există un preț de listă comparabil | Am comparat pe catalogul actual (€1,49–€4,49) și pe **propunerea** din `audit/08-product-portfolio.md`, marcată ca atare |
| **Ce se vede efectiv pe `blipmade.com`** | Nu s-a vizitat adresa publică (interzis) și nu s-a creat cont | S-a folosit catalogul din cod + rapoartele de audit; `MKT-01` rămâne `NOT VERIFIED` |
| **Ce funcții ale concurenților funcționează efectiv** | Nu s-au creat conturi la ei | Marcat `neverificat` implicit: tabelele din §4 descriu **ce promit**, nu ce funcționează |
| **Starea live a catalogului** | Nu s-a interogat producția | `OPS-01`/`PRICE-04`, `PLP-01`: `wordpress` are `eggId` NULL în producție |
| **Dacă `PORT-03` (DDoS) e într-adevăr absent sau doar neverificat** | Nu am acces la edge | `PORT-03` → `NOT VERIFIED`; `audit/10-positioning.md:53` afirmă că `panel.` și `node1.` sunt DNS-only — dar **aceasta e o sursă internă, nu o verificare proprie a acestei faze** |

### 10.3 Despre metoda însăși

- **„Prezent" înseamnă „promis public"**, nu „funcționează". Pentru Blipmade, criteriul a fost
  existența **codului**; pentru concurenți, existența **promisiunii pe pagina lor**. Cele două
  sunt asimmetrice prin construcție: un concurent care promite ceva ce nu face nu știm, dar
  un Blipmade cu un buton mort **știm** că e mort. Tabelele trebuie citite ținând cont de asta.
- **Prețurile includ reduceri recurente** la Shockbyte („30% OFF RECURRING") și prețuri
  promoționale la Nodecraft („$4,17 first month, then $5,96"). Am notat ambele valori ca să nu
  se compare un preț promoțional cu unul de listă.
- **Moneda e un factor de decizie**, nu o cifră. OVINETWORK afișează EUR și încasează lei la
  BNR+2%; Nodecraft vinde în 9 valute; Blipmade vinde în EUR. Comparația „Blipmade e mai ieftin
  decât Shockbyte" e adevărată la curs, dar **la paritatea de putere de cumpărare** se micșorează.
- **Nu am evaluat calitatea tehnică** a niciunui concurent. Nu am măsurat LCP, uptime real, sau
  calitatea panelului. Acestea ar cere măsurători, nu citire de pagină.

---

## 11. Gapurile care blochează un GO comercial

În ordine. Un GO comercial cere ca toate P0-urile de mai jos să fie închise; primele patru
sunt **dependințe de operator**, nu de cod.

| # | Gap | De ce blochează | Ce trebuie întâmplat | Dependență |
|---|---|---|---|---|
| 1 | **COMP-P1-01 — niciun produs de joc în catalog** | Blipmade nu intră pe piața pentru care infrastructura e dimensionată. Nu e o îmbunătățire, e o **intrare pe piață** | Un produs `minecraft-paper` cu imagine reală, ou mapat, health-check pe aplicație și preț calibrat | **Operator** (imagine + egg) |
| 2 | **COMP-P1-02 — plățile oprite** | Zero venit; campaniile produc comenzi eșuate | Chei Stripe live + webhook + checkout real de probă | **Operator** (chei) |
| 3 | **COMP-P1-03 — fără backup off-host** | Produsele de joc sunt stateful; backup-ul e în planul de intrare al fiecărui concurent RO; `SESSION_SECRET` e ireversibil | `OFFSITE_*` + `rclone` + timer + drill de restaurare | **Operator** |
| 4 | **COMP-P1-04 — fără DDoS** | Toți concurenții îl includ; e un criteriu de eliminare înainte de preț | Filtrare la edge pentru `node1.` și `panel.`, sau o poziționare explicită și un preț mai mic | **Operator** (edge, VM 102) |
| 5 | **COMP-P1-05 — fără adresă publică** | Produsul nu are adresă | `DOMAIN_BASE` + credențiale Caddy + test de rutare | **Operator** |
| 6 | **COMP-P1-07 — factură fără TVA și invizibilă** | Blochează clienții de business; pe piața RO e o condiție de plată | Factură proprie cu TVA, emisă după plată | Depinde de #2 + decizie de operator |
| 7 | **COMP-P1-11 — suport mort** | În game hosting, un ticket fără răspuns e un client pierdut | `SMTP_URL` + upload real de atașamente | **Operator** (`SMTP_URL`) |
| 8 | **COMP-P1-06 — engleză, `en-IE`** | Asimetrie pe o piață care include România; Aternos servește România | `ro` + traducerea fluxului de checkout | — |
| 9 | **COMP-P1-13 — fără instalare cu un click / sloturi** | E în tabelul de comparație al fiecărui concurent | Depinde de ou-ul produsului | Depinde de #1 |
| 10 | **COMP-P1-10 — zero recenzii** | Recenzia e cel mai puternic activ din set; primul client negativ nu e compensat | Primii clienți nominali + un studiu de caz | Depinde de #1, #2, #3, #5 |

### 11.1 Observația de fond, înainte de a închide raportul

**Șase dintre cele zece blocaje sunt dependințe de operator**, nu de cod. În timp ce dezvoltarea
Blipmade a construit în două runde lucruri reale — contractul de preț, disponibilitatea
derivată din realitate, numerotarea atomică, rezervarea atomică de campanie, compensarea pe
provisionare — și le-a lăsat, corect, **neactivate**.

Aceasta e o observație despre **esecul de execuție**, nu despre calitatea codului. Platforma are
mecanismele; nu are cheile, imaginile, adresa, e-mailul și backup-ul.

Și există o a doua observație, mai incomodă: **diferențiatorul construit în aceste runde
(compensație, preț pe resursă, disponibilitate onestă) devine vizibil abia după ce se repară
exact lucrurile care lipsesc.** Până atunci, el e o nichelitate tehnică. După ce se repară,
e singurul activ din întregul set competitiv care poate susține o preț de listă **peste**
Zentaris și OVINETWORK, pe un segment unde prețul nu e o pârghie.

---

## 12. Sumar pe competitor

| Competitor | Poziția față de Blipmade | Ce înseamnă concret |
|---|---|---|
| **WHMCS** | **Nu e concurent** — business software | reper de funcționalitate de facturare (TVA, dunning, rambursare, multi-monedă) |
| **FOSSBilling** | **Nu e concurent** — business software, gratuit | reper de funcționalitate + **piață de consolidare** pentru reselleri |
| **Paymenter** | **Nu e concurent direct** — business software cu extensie Pterodactyl | cel mai apropiat reper funcțional; ar concura cu Blipmade doar la reseller |
| **Railway** | concurent parțial (doar jumătatea „aplicații" din catalog) | concurent pe **preț variabil** vs. preț fix; Blipmade câștigă la flux constant |
| **Render** | concurent parțial, dar **economic inaplicabil** la nivelul de 1–4 GB | Blipmade e cu ~4× mai ieftin la 4 GB; Render nu e o amenințare |
| **Coolify** | concurent parțial, **fără intersecție de piață** | Coolify cere SSH și Docker; un jucător nu îl folosește |
| **Shockbyte** | **concurent direct** (game hosting) | 60+ jocuri, modpack-uri, DDoS, 99,9% uptime, 4,7/5 |
| **Nodecraft** | **concurent direct** (game hosting) | hardware premium, multi-monedă, **4,9/5 din 1800+ recenzii** |
| **Aternos** | **referință „free"** | €0 cu DDoS și backup; definește pragul de jos al pieței |
| **OVINETWORK** | **concurent direct, piața țintă** | €3,99, Pterodactyl, **DDoS 1 Tbps**, plată în lei la BNR+2% |
| **Zentaris Host** | **concurent direct, piața țintă** | €4,49, sloturi nelimitate, activare în minute, găzduit în RO |
| **Torchbyte** | **concurent direct, piața țintă** | €4,74, **backup zilnic + 50 GB** și DDoS reglat pentru Minecraft |

**Concluzia finală, în trei propoziții.** Blipmade nu e în concurență cu WHMCS, FOSSBilling,
Paymenter, Railway, Render sau Coolify — sunt în concurență cu Shockbyte, Nodecraft, Aternos și
cei trei furnizori români, iar **acolo nu există încă un produs de vândut**. Blipmade are în
cod cele trei calități care ar putea susține un preț de listă peste concurenți — preț pe
resursă, compensație pe eșec, disponibilitate onestă — dar ele sunt invizibile până când
produsul există, plățile sunt pornite, backup-ul e real și DDoS-ul e prezent. **Cele patru
dependențe de operator sunt lista de lansare; diferențiatorul e deja construit; ceea ce lipsește
e alegerea de a le activa.**
