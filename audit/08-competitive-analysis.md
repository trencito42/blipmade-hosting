# 08 — Analiza competitivă: cu cine se luptă Blipmade și la ce specificație

> **Toate prețurile de mai jos au fost citite de pe pagina de preț a concurentului, pe 23 octombrie 2026.** Fiecare rând are URL-ul și data. **Nu am inventat niciun preț, niciun uptime, niciun număr de recenzii, niciun volum de clienți.** Când o pagină nu a putut fi citită, rândul spune `NOT-VERIFIED` și motivul (challenge Cloudflare, HTTP 403, DNS/timeout, prețuri randate client-side).
> **Documentul companion:** `08-product-portfolio.md` (ce vinde platforma), `08-product-launch-order.md` (ordinea și pragul de preț).
> **Sursa internă a platformei:** prețurile Blipmade se calculează cu `baseAmount + 60/GB RAM + 40/vCPU + 2/GB disc`, în unități minori (`api/src/services/pricing.ts:32-37`). În acest document, toate sumele sunt în **euro**, convertite o singură dată.

---

## 1. Metodă și limite

| Ce am făcut | Cum |
|---|---|
| Am căutat furnizori cu pagina de preț publică | `html.duckduckgo.com/html/?q=…` (2 interogări: „hosting minecraft server romania pret luni”, „discord bot hosting pret eur luna nodejs”) |
| Am citit paginile de preț ale concurenților | `curl` cu User-Agent de browser, apoi extragerea textului și a numerelor; paralel cu `web_fetch` |
| Am verificat ce e **ro** și ce e internațional | pipeline-ul tău rulează într-o rețea care nu ajunge la unele gazde (ex. `apexhosting.com` → timeout) — de aceea multe rânduri sunt `NOT-VERIFIED` |

**Limite asumate, spuse explicit:**
1. **Nu există un preț de listă al Blipmade pentru Minecraft** — produsul nu există încă. Prețurile Blipmade din coloana de poziționare sunt **propuneri calculate** cu cardul existent (arithmetic shown în `08-product-portfolio.md` §2 și §9).
2. **Recenzile clienților nu au putut fi citite**: Trustpilot a răspuns `HTTP 403` pentru `ovinetwork.ro` și `torchbyte.com` (2026-10-23) → **volumul de recenzii = `NOT-VERIFIED`**. Ce potriviri folosesc: doar semne vizibile pe pagina lor (vechime, uptime declarat, prezența protecției DDoS).
3. **Segmentul internațional de game hosting e slab documentat din această rețea** (§5). Segmentul care contează pentru produsul recomandat — piața românească de Minecraft hosting — **e complet documentat, cu trei furnizori și prețuri reale**.

---

## 2. Piața relevantă pentru produsul recomandat: Minecraft hosting, România

Aceasta e piața pe care platforma intră cu `minecraft-paper`. Am citit trei furnizori români, fiecare cu prețurile afișate public.

### 2.1 OVINETWORK — https://www.ovinetwork.ro/hosting-minecraft (citit 2026-10-23)

| Plan | Preț | Cicl | RAM | vCPU | Disc | Ce e inclus |
|---|---|---|---|---|---|---|
| entry | **€3.99/lună** | lunar | 4 GB DDR4 | 2 nuclee | 25 GB NVMe | Anti-DDoS 1 Tbps |
| 2 | €5.99/lună | lunar | 6 GB | 3 nuclee | 35 GB NVMe | Anti-DDoS 1 Tbps |
| 3 | €12.99/lună | lunar | 12 GB | 4 nuclee | 50 GB NVMe | Anti-DDoS 1 Tbps |
| 4 | €16.99/lună | lunar | 16 GB | 8 nuclee | 100 GB NVMe | Anti-DDoS 1 Tbps |

**Semnale de reputație vizibile pe pagină:** „peste 10 ani pe piața serviciilor"; datacenter Voxility în București; **uptime 99.95% declarat**; prețurile sunt în EUR, dar plata se face în lei la cursul BNR +2%.
**Neclar / `NOT-VERIFIED`:** volumul de recenzii (Trustpilot 403); numărul de clienți; SLA scris.

### 2.2 Zentaris Host — https://zentaris-host.ro/hosting-jocuri/minecraft/ (citit 2026-10-23)

| Plan | Preț | Cicl | RAM | vCPU | Disc | Ce e inclus |
|---|---|---|---|---|---|---|
| entry | **€4.49/lună** | lunar | 4 GB DDR4 | 2 vCPU | 25 GB SSD | Anti-DDoS, sloturi nelimitate |
| 2 | €8.99/lună | lunar | 8 GB | 3 vCPU | 50 GB SSD | Anti-DDoS avansat |
| 3 | €15.99/lună | lunar | 16 GB | 4 vCPU | 100 GB SSD | Anti-DDoS |

**Semnale de reputație vizibile:** panou **Pterodactyl** (aceeași tehnologie ca Blipmade), activare instantă, suport 7 zile din 7.
**Neclar / `NOT-VERIFIED`:** anul de înființare, volumul de recenzii.

### 2.3 Torchbyte — https://torchbyte.com/ro/game/minecraft (citit 2026-10-23)

| Plan | Preț | Cicl | RAM | vCPU | Disc | Ce e inclus |
|---|---|---|---|---|---|---|
| Rookie | **€4.74/lună** | lunar | 4 GB | 2 vCPU (AMD Ryzen) | 50 GB NVMe **+ 50 GB backup** | filtrare DDoS ajustată pentru Minecraft |
| Amateur | €9.50/lună | lunar | 8 GB | 2 vCPU | 100 GB NVMe + 100 GB backup | idem |
| Pro | €14.60/lună | lunar | 12 GB | 4 vCPU | 150 GB NVMe + 150 GB backup | idem |
| Elite | €19.20/lună | lunar | 16 GB | 4 vCPU | 200 GB NVMe + 200 GB backup | idem |

**Semnale de reputație vizibile:** „Aprindem vise **din 2021**"; „+1 Tbit/s" DDoS; **backup-uri zilnice**; prețurile **includ TVA 21%**.
**Neclar / `NOT-VERIFIED`:** volumul de recenzii (Trustpilot 403).

### 2.4 CS 1.6 — Zentaris Host (segmentul pe care îl menționa briefing-ul)

https://zentaris-host.ro/hosting-jocuri/counter-strike-16 (citit 2026-10-23): **€3.49/lună** (16 sloturi), **€4.99/lună** (24 sloturi), **€7.99/lună** (32 sloturi); Anti-DDoS inclus în toate planurile, activare instantă. **RAM/vCPU/disc nu sunt publicate** pe pagină → `NOT-VERIFIED`.

**Concluzie de segment:** CS 1.6 e încă un segment plătitor în România (€3.49+), dar panoul Blipmade nu are egg de CS 1.6 — are „Custom Source Engine Game" (egg 6) cu variabila `SRCDS_APPID`, deci produsul e construibil, dar **doar ca fază 3**, după ce install-ul e dovedit pe nod.

---

## 3. Referința „free": Aternos

https://aternos.org/ (citit 2026-10-23):
- titlu pe pagină: „**Minecraft servers. Free. Forever.**"
- text: „**We are free, and we will always be free for everyone at any time. There is no possibility to pay for anything.**"
- text: „**Your Minecraft server is fully DDOS protected for free** to keep you safe from attacks."
- backup-uri gratuite în cloud storage (menționate pe pagină, citită la 2026-10-23).

**Ce înseamnă pentru Blipmade:** segmentul de intrare are un reper **gratuit, cu DDoS și cu backup**. Blipmade nu poate câștiga pe preț acest segment (are nevoie de cost, iar Aternos are cost zero) și **nici măcar nu-l poate câștiga pe DDoS și backup, fiindcă nu le are**. Segmentul vizibil de vânzare este deci **server dedicat 24/7 pentru o comunitate**, la €3.99–4.74, nu „gaming ieftin".

---

## 4. Alternativele PaaS-like pentru produsul de bot / aplicații

### 4.1 Lunafy (bot hosting, preț în EUR) — https://lunafy.run/en/pricing (citit 2026-10-23)

| Element | Preț | Cicl | Ce e inclus |
|---|---|---|---|
| primul server | **€0/lună** | lunar | 512 MB RAM / 0.5 vCPU per container („Sufficient for most standard Discord bots") |
| server suplimentar | **€1/lună** | lunar | idem |
| port deschis | **€0.50/lună** | lunar | porturi alocate la cerere, facturate lunar |

### 4.2 Render (PaaS) — https://render.com/pricing (citit 2026-10-23)

| Plan web service | Preț | Cicl | RAM | CPU |
|---|---|---|---|---|
| Free | **$0/lună** | lunar | 512 MB | < 1 CPU (oprire după inactivitate) |
| Starter | **$7/lună** | lunar | 512 MB | 0.5 CPU |
| Standard | **$25/lună** | lunar | 2 GB | 1 CPU |
| Pro | **$85/lună** | lunar | 4 GB | 2 CPU |
| Pro+ | $135/lună | lunar | 8 GB | 2 CPU |
| scale | $200/lună | lunar | 16 GB | 4 CPU |

Plus: „Background workers / Node, Python, Go, Rust, Ruby / Custom Docker containers / SSDs for $0.25/GB per month".

### 4.3 Railway (PaaS) — https://railway.app/pricing (citit 2026-10-23)

| Plan | Preț | Cicl | Ce e inclus |
|---|---|---|---|
| Trial | 30 zile, $5 credite | — | până la 2 vCPU / 1 GB în trial, 50 GB volum |
| Hobby | **$5/lună** | lunar | până la 1 vCPU / 0.5 GB RAM per serviciu, 0.5 GB volum, $5 credite de consum incluse; după credite se taxează consumul real (per GB/sec, per vCPU/sec, per GB-month) |
| Pro | **$20/lună** | lunar | până la 48 vCPU / 48 GB per serviciu, 5 replici × 8 vCPU / 8 GB, 5 GB volum, $20 credite incluse |

### 4.4 Heroku (PaaS) — https://www.heroku.com/pricing (citit 2026-10-23)

| Plan | Preț | Cicl | Observații publicate |
|---|---|---|---|
| Eco | **$5/lună** | lunar | planul de intrare listat pe pagina de preț |
| Hobby | **$7/lună** | lunar | 512 MB RAM × 1 |
| Standard | **$25/lună** | lunar | 1 GB RAM × 1 |

### 4.5 Contabo (VPS ieftin, UE) — https://contabo.com/en/vps/ (citit 2026-10-23)

| Plan VPS | Preț | Cicl | vCPU | RAM |
|---|---|---|---|---|
| VPS 10 | **€5.50/lună** (primele 24 luni) | lunar | 4 | 8 GB |
| VPS 20 | €7.50/lună | lunar | 6 | 12 GB |
| VPS 30 | €14.00/lună | lunar | 8 | 24 GB |
| VPS 40 | €25.00/lună | lunar | 12 | 48 GB |
| VPS 50 | €37.00/lună | lunar | 16 | 64 GB |
| VPS 60 | **€49.00/lună** | lunar | 18 | 96 GB |
| Cloud VPS | de la **€4.40/lună** | lunar | — | — |

Toate planurile VPS listate au **trafic nelimitat**. Fiecare include o adresă IPv4 și un server virtualizat, dar **nu** panou de joc, **nu** alocări de port dedicate, **nu** protecție DDoS de joc.

---

## 5. Furnizori internaționali de game hosting — `NOT-VERIFIED`

| Furnizor | URL | Rezultat | Motiv |
|---|---|---|---|
| Shockbyte | https://www.shockbyte.com/games/minecraft | **`NOT-VERIFIED`** | challenge Cloudflare („Just a moment…"); pagina nu a fost livrată |
| Apex Hosting | https://www.apexhosting.com/minecraft-hosting | **`NOT-VERIFIED`** | conexiunea nu s-a închis (curl `http=000`, timeout) din rețeaua de audit |
| Apex Minecraft | https://apexminecraft.com/ | **`NOT-VERIFIED`** | timeout identic |
| Bisect Hosting | https://www.bisecthosting.com/minecraft-hosting/ | **`NOT-VERIFIED`** | pagina se încarcă (HTTP 200, 804 KB), dar prețurile sunt randate client-side; zero texte de preț în HTML-ul servit |
| melbahosting | https://www.melbahosting.com/en/games/minecraft/ | **`NOT-VERIFIED`** | timeout (curl `http=000`) |
| minecraft.hosting | https://minecraft.hosting/ | **`NOT-VERIFIED`** | timeout |
| gameserver.eu | https://www.gameserver.eu/ | **`NOT-VERIFIED`** | HTTP 200, dar zero texte de preț în HTML-ul servit |
| Hetzner Cloud (planuri shared vCPU) | https://www.hetzner.com/cloud/ | **`NOT-VERIFIED`** pentru CX/CPX | pagina e randată client-side; s-au citit doar prețurile pentru vCPU-uri dedicate (€5.99, €6.49, €43.49, €67.70), nu pentru clasele shared comparabile |
| TheCrewHost (Discord bots) | https://thecrewhost.com/en/games/discord-nodejs | **`NOT-VERIFIED`** | HTTP 403 |
| Trustpilot (ovinetwork.ro) | https://www.trustpilot.com/review/ovinetwork.ro | **`NOT-VERIFIED`** | HTTP 403 |
| Trustpilot (torchbyte.com) | https://www.trustpilot.com/review/torchbyte.com | **`NOT-VERIFIED`** | HTTP 403 |

**Consecință asupra analizei:** segmentul internațional de game hosting **nu poate fi folosit ca reper de preț** în acest raport. De aceea comparația de poziționare (§6) se face **doar cu piața românească** (segmente complet documentat) și cu PaaS-ul (documentat), plus Aternos ca reper gratuit. **Niciun preț străin nu a fost estimat sau invocat.**

---

## 6. Poziționare: la ce specificație e Blipmade competitiv

Specificația de comparație: **4 GB RAM / 2 vCPU / 25 GB disc** — cea mai apropiată de configurația recomandată pentru `minecraft-paper` și de planurile de intrare ale celor trei furnizori români.

| | Blipmade (propunere `minecraft-paper`) | OVINETWORK | Zentaris | Torchbyte | Aternos | Contabo VPS 10 |
|---|---|---|---|---|---|---|
| Preț la 4 GB / 2 vCPU | **€4.49/lună** (listă) | €3.99/lună | €4.49/lună | €4.74/lună | €0 | €5.50/lună (8 GB / 4 vCPU) |
| Preț la 4 GB / 1 vCPU (tierul de bază propus) | **€4.09/lună** (€3.49 fondator) | nu există plan echivalent | nu există plan echivalent | nu există plan echivalent | neprecizat | — |
| RAM | 4 GB | 4 GB DDR4 | 4 GB DDR4 | 4 GB | neprecizat | 8 GB |
| vCPU | 2 | 2 nuclee | 2 | 2 (AMD Ryzen) | neprecizat | 4 |
| Disc | 25 GB | 25 GB NVMe | 25 GB SSD | 50 GB NVMe | neprecizat | neprecizat |
| **Protecție DDoS** | **❌ absentă** | ✅ 1 Tbps | ✅ | ✅ (ajustată pentru Minecraft) | ✅ gratuit | ❌ |
| **Backup** | **❌ absent** | neprecizat | neprecizat | ✅ 50 GB + zilnic | ✅ gratuit în cloud | ❌ (snapshot la preț) |
| Panou / management | Pterodactyl (propriu) | neprecizat | Pterodactyl | neprecizat | neprecizat | panel propriu |
| Preț pe GB RAM | **€1.12/GB** (listă) · €0.87/GB (fondator) | €1.00/GB | €1.12/GB | €1.19/GB | — | €0.69/GB |
| Preț pe vCPU | **€2.25** (listă) · €3.49 (fondator, 1 vCPU) | €2.00 | €2.25 | €2.37 | — | €1.38 |
| Port dedicat + instalare cu un clic | ✅ (alocare + egg) | ✅ | ✅ | ✅ | ✅ (browser) | ❌ (doar IPv4:port) |

**Calculul prețurilor Blipmade** (cardul existent, `baseAmount` propus per produs; formula în `08-product-portfolio.md` §2):
- `minecraft-paper` cu `baseAmount = 409`, `minRam = 4096`, `minCpu = 1`, `minDisk = 25` — **tier 1, 4 GB / 1 vCPU / 25 GB**: `409 + (4096-4096)/1024×60 + (1-1)×40 + (25-25)×2 = 409 + 0 + 0 + 0 = 409 minor = €4.09` ✔
- **tier 2, 4 GB / 2 vCPU / 25 GB**: `409 + 0 + (2-1)×40 + 0 = 449 minor = €4.49` ✔ — acesta e tierul care se compară cu planurile de intrare ale pieței
- **tier 3, 6 GB / 2 vCPU / 40 GB**: `409 + (6144-4096)/1024×60 + (2-1)×40 + (40-25)×2 = 409 + 120 + 40 + 30 = 599 minor = €5.99` ✔ (contra OVI: 6 GB / 3 nuclee / 35 GB = €5.99 — **paritate de preț, mai puține nuclee, plus DDoS la ei**)
- preț de fondator (`baseAmount = 349`): `€3.49` / `€3.89` / `€5.39` — limitat la primii 5 clienți, pentru că e aproape de pragul de acoperire (`08-product-launch-order.md` §7)
- `discord-bot` cu `baseAmount = 172`, `minRam = 512`, `minDisk = 5`: `172 + 0 + 0 + 0 = 172 minor = €1.72` ✔

### 6.1 Unde Blipmade e competitiv

1. **Prețul e corect calibrat, nu ieftin.** La 4 GB / 2 vCPU, €4.49 e **la prețul pieței** (Zentaris: €4.49), cu €0.50 peste OVI și €0.25 sub Torchbyte; tierul de bază (4 GB / **1** vCPU) e la €4.09, adică €0.40 peste OVI, dar cu **jumătate din nuclee** — deci nu se câștigă nici el pe specificație. **Concluzia: prețul nu poate fi pârghia de câștig** — cu unit economics-ul din `08-product-launch-order.md` §7, subcotarea duce pragul de rentabilitate de la 14 la 16 instanțe (100% ocupare). Câștigul trebuie să vină din **backup + DDoS**, singurele două lucruri pe care concurenții le pun în plan și platforma nu le are.
2. **Față de PaaS, pe „preț per GB cu un port dedicat”:** un container Node.js la €1.72 pentru 512 MB/1 vCPU e sub Render ($7), Railway ($5) și Heroku ($7) și comparabil cu Lunafy (€1/server) — dar doar dacă clientul nu are nevoie de TLS/hostname/e-mail/backup, pe care platforma nu le oferă.
3. **În fața unui VPS, pe ce contează la un server de joc:** un VPS Contabo de €5.50 dă 8 GB și 4 vCPU, dar **nu dă** un port dedicat alocat, un panou de joc, instalarea cu un clic a serverului, nici backup. La 4 GB / 2 vCPU, Blipmade e cu €1.01 sub prețul acelui VPS și oferă toate astea.

### 6.2 Unde Blipmade **nu** e competitiv — și aici e cinstea

1. **Peste 6 GB RAM, cardul de preț pierde față de un VPS obișnuit.** Cu cardul propus (base 409, min 4096/1/25): 8 GB / 2 vCPU / 50 GB = `409 + 240 + 40 + 50 = 739 = €7.39`, în timp ce Contabo vinde 8 GB / 4 vCPU la **€5.50**. Structura ratei de `60/GB` peste minim face ca, peste 6 GB, clientul să compare cu un VPS și să câștige cel care nu e platforma. **De aceea plafonul de RAM propus pentru produsul de joc este 6 GB (6144 MB), nu 16: peste el, prețul nu mai e defensibil în fața unui VPS.**
2. **Protectorul de DDoS lipsește, și e chiar primul lucru pe care îl vede un client de joc.** Toți cei trei furnizori români îl listează în planul de intrare; Aternos îl dă gratuit. La Blipmade, `panel.`, `node1.` și `test.apps.` sunt recorduri DNS-only: „orice DDoS pe aceste nume ajunge direct pe hardware" (`audit/03-network-and-ip-plan.md:38, 229`). **Vinderea unui server Minecraft public fără filtrare DDoS, într-o piață în care toți competitorii o includ, nu e o poziționare — e o vulnerabilitate de vânzare.** La fel, backup-ul lipsește (`feature_limits.backups = 0`), iar Torchbyte pune 50 GB de backup în planul de €4.74.
3. **CPU-ul e o generație în urmă.** Broadwell 2016 pe nodul Blipmade vs „AMD Ryzen" la Torchbyte (și implicit platforme noi la OVI/Zentaris). La 4 GB, un server Minecraft stă sub limita de tick și diferența nu se vede; la 8–16 GB cu pluginuri, sau la CS2/Rust, se vede.
4. **În bot/app hosting, prețul nu poate fi câștigat:** Lunafy dă primul server la €0, Render și Railway au tier gratuit, Contabo dă 8 GB la €5.50 *cu* trafic nelimitat. Blipmade nu are niciuna dintre cele trei: backup, TLS/hostname gestionat, sau un preț sub zero.
5. **Portul.** Clientul primește `node1.blipmade.com:30012`, nu `:25565`. Nu e o barieră tehnică (provisionarea preferă deja blocul publicat, `api/src/services/provisioning.ts:218`), dar e un friction de vânzare față de un concurent care dă port standard. În plus, `panel.` și `node1.` nu sunt prin Cloudflare: și acolo DDoS-ul ajunge direct.
6. **Nicio garanție publicată de uptime pentru Blipmade**, în timp ce OVI declară 99.95%. Absența unei promisiuni e corectă până când există un al doilea nod; dar e o promisiune mai slabă decât a concurenților în fața clienților care compară.

### 6.3 Verdictul în trei propoziții

**Prețul Blipmade e calibrat corect pe piață — la €4.49 pentru 4 GB / 2 vCPU e la nivelul planului de intrare al Zentaris, la €0.50 peste OVI și la €0.25 sub Torchbyte — deci prețul nu e o pârghie de câștig, ci o condiție de intrare.** Serviciul e însă cu un pas în urmă, pentru că **nu are nici DDoS, nici backup**, pe care concurenții le pun în planul de intrare sau chiar gratuit (Aternos). Ca urmare, **o lansare făcută doar pe preț, fără backup și fără DDoS, pierde comparația pe „ce primești pentru prețul ăsta”**, oricât de corect ar fi calculul. **Iar peste 6 GB RAM, cardul de preț pierde definitiv față de un VPS de €5.50, deci portofoliul trebuie construit ca „server de joc 2–6 GB, cu protecție și backup”, nu ca „gaming hosting pentru orice configurație”.**

---

## 7. Ce ar trebui să se vadă pe pagina de produs (decizie de poziționare)

Până când backup-ul și DDoS-ul există, pagina nu poate spune „gaming hosting complet" și nu poate claims' nimic despre uptime sau „backup-uri zilnice". Ce poate spune, onest:

| Claim | Verdict |
|---|---|
| „Server Minecraft instalat în câteva minute, cu panou și consolă" | ✅ susținut (egg + provisionare + panou) |
| „Preț de la €4.09/lună pentru 4 GB / 1 vCPU, €4.49 la 4 GB / 2 vCPU" | ✅ susținut (cardul calculat: `409` și `449` unități minori) |
| „Port dedicat, inclus" | ✅ susținut (alocare + DNAT) — dar trebuie spus **portul nu e 25565** |
| „Backup zilnic" | ❌ **nu se spune** (nu există) |
| „Protecție DDoS" | ❌ **nu se spune** (nu există) |
| „99.9% uptime" | ❌ **nu se spune** (un singur nod, fără SLA) |
| „Rulează pe hardware de generație 2016, cu 20 de nuclee partajați" | ⚠️ adevărat, dar se spune doar dacă nu ascunde nimic (recomandarea: se spune explicit, în nota tehnică) |

---

## 8. Rezumatul surselor

| # | Sursă | URL | Data citirii | Ce s-a extras |
|---|---|---|---|---|
| S1 | OVINETWORK Minecraft | https://www.ovinetwork.ro/hosting-minecraft | 2026-10-23 | 4 planuri, €3.99–16.99, 10+ ani, 99.95%, Voxility |
| S2 | Zentaris Minecraft | https://zentaris-host.ro/hosting-jocuri/minecraft/ | 2026-10-23 | 3 planuri, €4.49–15.99, Pterodactyl, Anti-DDoS |
| S3 | Zentaris CS 1.6 | https://zentaris-host.ro/hosting-jocuri/counter-strike-16 | 2026-10-23 | 3 planuri, €3.49–7.99 pe sloturi |
| S4 | Torchbyte Minecraft | https://torchbyte.com/ro/game/minecraft | 2026-10-23 | 4 planuri, €4.74–19.20, Ryzen, backup-uri, DDoS, din 2021 |
| S5 | Aternos | https://aternos.org/ | 2026-10-23 | „Free. Forever.", DDoS gratuit, backup gratuit |
| S6 | Lunafy pricing | https://lunafy.run/en/pricing | 2026-10-23 | €0 primul server, €1/server, €0.50/port, 512 MB / 0.5 vCPU |
| S7 | Render pricing | https://render.com/pricing | 2026-10-23 | Free $0, $7, $25, $85, $135, $200; SSD $0.25/GB |
| S8 | Railway pricing | https://railway.app/pricing | 2026-10-23 | Trial $5, Hobby $5 (1 vCPU/0.5 GB), Pro $20 (48 vCPU/48 GB) |
| S9 | Heroku pricing | https://www.heroku.com/pricing | 2026-10-23 | Eco $5, Hobby $7 (512 MB), Standard $25 |
| S10 | Contabo VPS | https://contabo.com/en/vps/ | 2026-10-23 | €5.50–49, 4–18 vCPU, 8–96 GB, trafic nelimitat; Cloud VPS de la €4.40 |
| S11 | Shockbyte | https://www.shockbyte.com/games/minecraft | 2026-10-23 | `NOT-VERIFIED` — challenge Cloudflare |
| S12 | Apex Hosting | https://www.apexhosting.com/minecraft-hosting | 2026-10-23 | `NOT-VERIFIED` — timeout |
| S13 | Bisect Hosting | https://www.bisecthosting.com/minecraft-hosting/ | 2026-10-23 | `NOT-VERIFIED` — prețuri randate client-side |
| S14 | Hetzner Cloud | https://www.hetzner.com/cloud/ | 2026-10-23 | `NOT-VERIFIED` pentru clasele shared |
| S15 | TheCrewHost | https://thecrewhost.com/en/games/discord-nodejs | 2026-10-23 | `NOT-VERIFIED` — HTTP 403 |
| S16 | Trustpilot (ovinetwork.ro, torchbyte.com) | https://www.trustpilot.com/review/ovinetwork.ro · https://www.trustpilot.com/review/torchbyte.com | 2026-10-23 | `NOT-VERIFIED` — HTTP 403 (volum de recenzii indisponibil) |
