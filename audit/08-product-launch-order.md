# 08 — Ordinea de lansare: ce se lansează, când, la cât, și pragul de preț

> **Data:** 2026-10-23 · **Sursa numerelor:** `audit/03-capacity-model.md` (capacitate), `audit/05-pricing-consistency.md` (cardul de preț), `audit/08-product-portfolio.md` (ce există), `audit/08-competitive-analysis.md` (piața, URL + data citirii).
> **Convenție:** sumele din formule sunt în **euro**, convertite o singură dată din unități minori (`minor / 100`), conform `api/src/lib/money.ts:2-3`.
> **Regulă de citire:** acesta este un **document de decizie**, nu o listă de dorințe. Fiecare produs care se lansează are un preț, un plafon, o condiție deblocantă și un prag de rentabilitate calculat.

---

## 1. Decizia, într-un tabel

| Faza | Ce se lansează | Preț (listă) | Plafon per instanță | Clienți (la capacitate) | Condiția care deschide faza |
|---|---|---|---|---|---|
| **0 — blocaje** | nimic din punct de vedere comercial | — | — | — | plățile deschise + o comandă reală plătită end-to-end + backup + decizia DDoS + sync infrastructură |
| **1 — lansare** | **`minecraft-paper`** (un singur produs) | **€4.09/lună** la 4 GB / 1 vCPU / 25 GB · **€4.49** la 4 GB / 2 vCPU / 25 GB · **€5.99** la 6 GB / 2 vCPU / 40 GB | 6144 MB / 2 vCPU / 40 GB; **16 instanțe de 1 vCPU pe nod** (8 dacă toate iau 2 vCPU) | **16** (1 instanță/client); pragul de rentabilitate: **14 clienți** | faza 0 închisă + `GAMES` în enum + rând `Product` + `ProductPrice` + pagină de produs + documente + capturi |
| **2 — după** | `discord-bot` (re-specificat), `minecraft-vanilla`, `discord-bot-python` | €1.72 / €2.12 / €5.92 (bot) · €4.09 / €5.99 (vanilla) | idem | +16 sloturi (1 vCPU fiecare) | faza 1 are cel puțin **8 clienți plătitori** și **backup-ul funcționează** |
| **3 — după** | `rust`, `teamspeak3`, `cs16`/`cs2` | €3.89 / €2.59 / €2.59 | idem | +8 sloturi (2 vCPU fiecare) | provisionare **multi-alocare** implementată + blocul de porturi publicat extins + cerere explicită |
| **Niciodată pe acest hardware** | `wordpress`, `code-server`, `uptime-kuma`, `postgresql`, „Node.js generic", „Python generic" | — | — | — | nu se vând pe un game node fără backup: vezi `08-product-portfolio.md` §5 |

**Motivul pentru care Minecraft Paper merge primul, în două rânduri:** (1) hardware-ul, panoul (16 egg-uri) și rețeaua sunt **coerente ca game hosting** și incoerente ca platformă de aplicații; (2) **prețul de intrare al pieței e verificabil și e €3.99–4.74** la 4 GB / 2 vCPU, deci există un reper de preț pentru oameni, nu o estimare.

**Motivul pentru care botul nu merge primul:** la €1.72 pe o instanță de 1 vCPU, pragul de acoperire al nodului e de **€3.40/instanță** — botul e cu **€1.68 sub prag**. Botul e un **umplutor de sloturi**, nu o sursă de venit. Detalii în §7.

---

## 2. Faza 0 — blocaje (niciun produs nu poate fi vândut până nu se închid)

| # | Blocaj | Cum stă acum | Ce trebuie făcut | Efort | De cine depinde |
|---|---|---|---|---|---|
| B1 | **Plățile sunt oprite** | `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol, `STRIPE_TEST_MODE=false` (VM 103, 2026-10-23) → `POST /api/orders/:id/checkout` → 503 → `fulfilOrder()` nu se apelează niciodată | chei Stripe reale + `PAYMENTS_ENABLED=true` + **o comandă reală plătită**, cu `Payment`, `Subscription`, `Invoice` create | **S** (config) + **M** (verificare end-to-end) | operator + API |
| B2 | **Infrastructura nu e sincronizată** | `SELECT count(*) FROM "Node"` → **0**, `SELECT count(*) FROM "Egg"` → **0**; `POST /admin/infrastructure/sync` nu a fost rulat niciodată | rularea sync-ului + verificarea că nodul și egg-urile apar în DB | **S** | API |
| B3 | **Poarta de capacitate a discului nu leagă nimic** | `api/src/services/provisioning.ts:213-214`: `node.disk` e în **MB** (819200), argumentul `disk` e în **GB** → comparație cu factor 1024 | `disk * 1024` în comparație | **S** (o linie) | API |
| B4 | **Servere orfane și eșecuri fără compensare** | 2 servere orfane ocupă alocările 73 și 76; la o provisionare eșuată rămâne o comandă plătită fără server (`audit/04-product-certification.md:171-172`) | curățarea celor 2 servere + acțiune compensatorie la eșec | **S–M** | API + operații |
| B5 | **Nu există backup** | `feature_limits: { databases: 0, backups: 0 }` pe toate cele 5 servere; backup-ul Pterodactyl e refuzat; nu există țintă în afara hostului (`audit/03-disaster-recovery.md:25,36-48,63`) | limită `backups` > 0 + țintă în afara nodului + buton de restaurare + test de restaurare | **M** (~1 zi) | API + operații |
| B6 | **Nu există protecție DDoS pe traficul de joc** | doar `blipmade.com` și `www.` sunt prin Cloudflare; `panel.`, `node1.`, `test.apps.` sunt DNS-only și „ajung direct pe hardware" (`audit/03-network-and-ip-plan.md:38, 229`) | decizie explicită: (a) contract de protecție (costul intră în `C_node`), sau (b) lansare către un segment care nu cere DDoS, cu text onest pe pagină | **decizie + M** | operator |
| B7 | **Porturi** | DNAT publică doar `30000:39999`; blocul `25565-25600` și `27015-27050` **nu** e publicat; provisionarea preferă deja `port >= 30000` (`api/src/services/provisioning.ts:218`), deci serverele **sunt** accesibile, pe porturi non-standard | fie publicăm `25565:25600` + `27015:27050` (o regulă DNAT + una FORWARD), fie **ștergem** blocurile ca să nu fie capcane; apoi un test de conectare din internet, cu un client real | **S** (operații) | operații |
| B8 | **Nu există categoria `GAMES`** | `enum Category { WEB_CMS, DEVELOPER_TOOLS, MONITORING, AUTOMATION, BOTS, DATABASES }` (`api/prisma/schema.prisma:200-207`) | migrare Prisma cu `GAMES` + adaptări în interfață și în API | **S–M** | DB/API |
| B9 | **Marketingul vinde produse care nu există** | `web/src/data.ts:19-31` listează 12 produse fictive (Ghost, Forgejo, Grafana, n8n, MySQL, Redis, MongoDB…) cu prețuri de la €1.49 | curățarea listei (fișierul spune deja că nu e catalogul, dar listele apar pe scenele de marketing) | **S** | web |
| B10 | **Documentație, pagini de produs, capturi** | nu există capturi de produs (doar paginile aplicației, în `/root/blipmade-work/screenshots/`) | pagină de produs, ghid de instalare, documentația portului, 3 capturi per produs | **M** | web + documente |

---

## 3. Faza 1 — `minecraft-paper`: ce se lansează, exact

### 3.1 Specificația produsului

| Câmp | Valoare | De unde |
|---|---|---|
| slug / nume | `minecraft-paper` / „Minecraft (Paper)" | propus |
| egg | **5** („Paper"), `ghcr.io/pterodactyl/yolks:java_25` (208.9 MiB comprimat, măsurat) | panou, 2026-10-23 |
| `startupCommand` | cel al egg-ului 5: `java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}` | panou |
| `healthProbe` | `{ "kind": "tcp" }` — probe-ul TCP al platformei (`api/src/services/provisioning.ts:305-308`) verifică exact portul alocării, adică portul pe care jucătorul intră | cod |
| `minRam` / `defaultRam` / `maxRam` | 4096 / 4096 / **6144** MB | limita de RAM: 16 × 4 GB = 64 GiB din 120 GiB vândabili |
| `minCpu` / `defaultCpu` / `maxCpu` | 1 / 1 / **2** | **vCPU-ul e resursa limitantă** (`audit/03-capacity-model.md:143`): cu 1 vCPU/instanță nodul duce 16 instanțe, cu 2 vCPU/instanță duce doar 8 |
| `minDisk` / `defaultDisk` / `maxDisk` | 25 / 25 / **40** GB | 16 × 40 GB = 640 GiB din 800 GiB vândabili |
| `baseAmount` | **409** | vezi §3.2 |
| rate | 60/GB RAM · 40/vCPU · 2/GB disc · `MONTHLY` | cardul existent, `api/src/services/pricing.ts:32-37` |

### 3.2 Prețul, cu aritmetica

Formula: `P = base + max(0,(RAM−minRAM)/1024)×60 + max(0,vCPU−minCPU)×40 + max(0,disk−minDisk)×2` (unități minori).

**Tier 1 — 4 GB / 1 vCPU / 25 GB:**
`409 + (4096−4096)/1024×60 + (1−1)×40 + (25−25)×2 = 409 + 0 + 0 + 0 = 409 minor = €4.09` ✔

**Tier 2 — 4 GB / 2 vCPU / 25 GB:**
`409 + 0 + (2−1)×40 + 0 = 449 minor = €4.49` ✔

**Tier 3 — 6 GB / 2 vCPU / 40 GB:**
`409 + (6144−4096)/1024×60 + (2−1)×40 + (40−25)×2 = 409 + 120 + 40 + 30 = 599 minor = €5.99` ✔

**Preț de fondator (doar pentru primii 5 clienți), `baseAmount = 349`:**
`349 = €3.49` la tier 1 (cu €0.09 peste pragul de acoperire de €3.40 — vezi §7), `€3.89` la tier 2, `€5.39` la tier 3.

**De ce €4.09 la tier 1 și nu €3.99:** cele trei prețuri de intrare din piața românească sunt €3.99 (OVINETWORK), €4.49 (Zentaris) și €4.74 (Torchbyte), **la 4 GB / 2 vCPU** (`08-competitive-analysis.md` §2). Tierul 2 ales de Blipmade (4 GB / 2 vCPU = €4.49) e **la prețul pieței**, nu sub el — pentru că subcotarea nu e susținută de unit economics (§7). Tierul 1 (4 GB / **1** vCPU) e cu €0.40 sub OVI, dar cu jumătate din nuclee: **e un preț de pornire, nu un preț cu care se câștigă comparația de specificație** — de aceea există doar ca intrare și ca umplutor de sloturi.

### 3.3 Capacitatea și clienții — **aici e resursa limitantă, nu instanța**

Modelul de capacitate (`audit/03-capacity-model.md:111-150`): `N = min(V/vCPU, RAM/GB, disk/GB)`, cu **rezervă de 20%** (16 din 20 vCPU = 80%).

| Configurație per instanță | N_vcpu | N_ram | N_disk | N_max | **Instanțe sigure** | vCPU consumate la 16 |
|---|---|---|---|---|---|---|
| **4 GB / 1 vCPU / 25 GB** (tier 1) | 20 | 30 | 32 | **20** | **16** | 16 |
| 4 GB / 2 vCPU / 25 GB (tier 2) | 10 | 30 | 32 | **10** | **8** | 16 |
| 6 GB / 2 vCPU / 40 GB (tier 3) | 10 | 20 | 20 | **10** | **8** | 16 |

**Regula de mix:** limita e **Σ vCPU ≤ 16** (sau ≤ 20 la tavan). Un mix de 8 tier-1 + 4 tier-2 = 8 + 8 = **16 vCPU** ✔. Un mix de 16 tier-1 + 8 tier-2 = 32 vCPU ✘.

| Parametru | Valoare |
|---|---|
| Instanțe sigure pe nod | **16** (dacă toate sunt tier 1) / **8** (dacă toate sunt tier 2) |
| Tavan absolut | 20 instanțe × 1 vCPU; **21 instanțe × 1 vCPU ar depăși 20 vCPU** (`audit/03-capacity-model.md:171-172`) |
| Clienți la capacitate | **16** |
| **Clienți necesari pentru rentabilitate** | **14** (la €4.09, vezi §7) |
| Porturi consumate | 1 per instanță → 16 din **96 libere publicate** |
| RAM la 16 × 4 GB | 64 GiB din 120 GiB vândabili |
| Disc la 16 × 25 GB | 400 GiB din 800 GiB vândabili |

### 3.4 Condițiile de lansare (checklist, toate obligatorii)

1. B1 închis și **o comandă plătită reală** a trecut prin `fulfilOrder()` (`Payment`, `Subscription`, `Invoice` create).
2. B2, B3, B4 închise.
3. **B5 închis** — un server Minecraft fără backup nu se vinde.
4. B6 **decis** explicit (contract de DDoS sau poziționare onestă fără claims).
5. B7 — un **test de conectare din internet**, cu un client Minecraft real, pe portul alocat, documentat în ghid și în e-mailul de activare („serverul tău este la `node1.blipmade.com:30012`").
6. B8, B9, B10 închise.
7. `Product` + `ProductPrice` + opțiuni (`ProductOption`: „Paper 1.21.x", „backup zilnic") + pagină de produs + documentație + capturi.

---

## 4. Faza 2 — ce urmează și ce trebuie să fie adevărat

| Produs | Preț | Ce trebuie construit | Condiție de intrare în fază |
|---|---|---|---|
| `discord-bot` (re-spec) | **€1.72** (512/1/5) → €2.12 (1024/1/10) → €5.92 (4096/4/50) | `baseAmount` 149→172, `minRam` 256→512, `minDisk` 1→5; `healthProbe={kind:"container"}`; **livrarea codului** (clone de repo la creare — egg-ul 15 face deja `git pull` dacă `.git` există); documentație; capturi | faza 1 are **≥ 8 clienți plătitori** și backup-ul funcționează |
| `minecraft-vanilla` | **€4.09** → €4.49 → €5.99 | rând `Product` pe egg 1 + `ProductPrice` + pagină de produs | cerere demonstrată (mesaje de la clienți care cer „vanilla") |
| `discord-bot-python` | **€1.72** → €2.12 → €5.92 | rând `Product` pe egg 16 + `ProductPrice` + doc | cerere demonstrată |

**De ce botul e în faza 2, nu în faza 1:** prețul lui (€1.72 pentru 1 vCPU) e **cu €1.68 sub pragul de acoperire** (§7) și sub prețul de intrare al pieței de bot hosting (€0 la Lunafy). Ca produs principal, **mută pierderea**, nu o creează. Ca produs secundar, umple sloturi libere și reduce pierderea de cost fix.

---

## 5. Faza 3 — ce urmează și ce trebuie să fie adevărat

| Produs | Preț | Ce trebuie construit | Condiție |
|---|---|---|---|
| `rust` | **€2.49** (4096/2/20) → **€3.89** (4096/4/50) → €5.09 (6144/4/50) | rând `Product` pe egg 14 + `ProductPrice` + **provisionare cu 4 alocări** (platforma atribuie 1 singură: `provisioning.ts:482-484`) + limitarea instalărilor simultane (primul start compilează harta) + extinderea blocului de porturi | cerere explicită + multi-alocare implementată |
| `teamspeak3` | **€1.49** (1024/1/5) → **€2.59** (2048/2/10) → **€3.99** (4096/2/20) | rând `Product` pe egg 13 + `ProductPrice` + **provisionare cu 5 alocări** + extinderea blocului de porturi | cerere explicită (produs de familie, ARPU bun) |
| `cs16` / `cs2` | **€2.59** (1024/2/25) | egg 6 cu `SRCDS_APPID=90` (CS 1.6) sau 730 (CS2) setat prin `Product.startup` (suprascrierea mediului există: `provisioning.ts:242-248`) + **dovedirea install-ului pe nod** (VM 101 inaccesibil auditului) | install dovedit + cerere (piața RO plătește €3.49+ pentru CS 1.6, `08-competitive-analysis.md` §2.4) |

**De ce faza 3 e târzie și nu refuz:** toate trei cer **mai multe alocări decât una** (4, 5 respectiv 1 + opțiuni), iar provisionarea actuală atribuie una. 16 instanțe Rust ar consuma 64 de porturi, 16 TS3 ar consuma 80 — din 96 libere. **Înainte de faza 3, blocul publicat trebuie extins** (altfel amestecul maxim consumă 96 din 96, fără rezervă). În plus, toate trei sunt de **2 vCPU**, deci fiecare consumă dublul față de un server Minecraft de 1 vCPU (§3.3).

---

## 6. Ce nu se oferă pe acest hardware (decizie, nu amânare)

| Produs | Motiv (o propoziție) |
|---|---|
| `wordpress` | Nu există egg de CMS pe panou, backup-ul lipsește, rutarea domeniilor e `BLOCKED`, iar la €1.49 nu există niciun client care să prefere platforma unui VPS de €5.50 cu 8 GB și trafic nelimitat. |
| `code-server` | Nu există egg code-server; un IDE în browser pe un Broadwell partajat, la €2.99, nu concurează cu tier-urile gratuite (Gitpod, CodeSandbox). |
| `uptime-kuma` | Un monitor care rulează pe nodul pe care îl monitorizează are conflict de interes; starea lui e locală și nu există backup. |
| `postgresql` | Baza de date pe un game node cu `maxDisk = 200` GB e altă afacere, iar poarta de capacitate a discului e defectă (B3) — combinația „produs de 200 GB + poartă nefuncțională" e exact accidentul care stinge nodul pentru toți clienții. |
| „Node.js generic" / „Python generic" | La €1.72 pentru 512 MB, sub Lunafy (€0) și sub tot PaaS-ul cu TLS, e-mail și backup incluse; niciun client corporate nu mută aplicația acolo. |
| `minecraft-forge` | Installer-ul e Java 8, runtime-ul e Java 25: combinația nu e suportată pentru Minecraft modern (INFERRED din cele două imagini măsurate). Se poate relua după ce runtime-ul corespunde versiunii țintă. |
| `mumble` | Ascultă pe 64738, care nu e alocare pe panou și nu e publicat de DNAT: ar cere o alocare cu port custom și o regulă nouă — decizie de rețea, nu de produs. |
| `csgo`, `tf2`, `insurgency` | Titluri înlocuite sau în uitare; instalare grea prin steamcmd; nicio cerere demonstrabilă. |
| `ark`, `gmod` | 3–4 porturi fiecare, install foarte greu, profil de CPU dedicat — nu se vinde pe un nod partajat de 20 vCPU. |
| `bungeecord`, `sponge` | Niște fără cerere demonstrabilă; proxy-ul Bungeecord presupune clienți cu alte servere, adică o rețea, nu o platformă. |

---

## 7. Pragul de preț: când contribuția acoperă costul nodului

### 7.1 Formula

Notăm:
- `C_node` = costul lunar complet al nodului de gaming (hardware + IPv4 + trafic + orice protecție DDoS cumpărată);
- `V_node` = **20 vCPU** (nodul, `audit/03-capacity-model.md:37-40`);
- `N_safe` = instanțe sigure = **16 × (1 vCPU)**, **8 × (2 vCPU)**, **5 × (4 vCPU)** (§3.3, `audit/03-capacity-model.md:150`);
- `v` = vCPU-urile consumate de instanța vândută; `P` = prețul ei (euro/lună).

**Pragul de acoperire, pentru o configurație dată:**

```
P_floor = C_node / N_safe(configuration)
```

**Forma echivalentă, per vCPU** — cea care arată de ce dimensiunea nodului nu schimbă nimic:

```
P_floor = C_node / (0.8 × V_node / v) = (C_node / V_node) × v / 0.8 = k × v / 0.8
   unde k = C_node / V_node  (cost pe vCPU pe lună)
```

> `C_node` **nu este documentat în niciun artefact auditat** (nici în `00-architecture.md`, `03-infrastructure.md`, `03-disaster-recovery.md`, `05-*`, nici în `docs/`). **Este o intrare a operatorului.** Tot ce urmează e **aritmetică în funcție de `C_node`**, cu un singur reper extern pentru ordinea de mărime, marcat ca atare.

### 7.2 Reperul extern (singurul ancorat în surse)

Cea mai apropiată ofertă publică pentru o mașină de clasa nodului, citită de pe pagina prețului furnizorului: **Contabo VPS 60 — €49.00/lună pentru 18 vCPU / 96 GB RAM / trafic nelimitat** (https://contabo.com/en/vps/, citit 2026-10-23).

Dacă nodul Blipmade (20 vCPU / 120 GiB / 800 GiB) ar costa proporțional cu vCPU-urile:
`C_node ≈ 20 × (49.00 / 18) = €54.44/lună` → `k = 54.44 / 20 = €2.72 pe vCPU pe lună`.
**Acesta e un `INFERRED` (ipoteza „cost proporțional cu vCPU"), cu o singură sursă externă, nu o factură.** Operatorul înlocuiește `C_node` cu numărul lui real și rescrie rândurile de mai jos.

### 7.3 Pragurile, calculate

| Configurație | Preț | vCPU | N_safe | `P_floor = C_node/N_safe` | Venit la plafonul sigur | Venit la tavan | **Cumprenta maximă a nodului** | Pragul de rentabilitate (instanțe) | Occupare |
|---|---|---|---|---|---|---|---|---|---|
| **Minecraft tier 1** (4 GB / 1 vCPU / 25 GB) | **€4.09** | 1 | 16 | 54.44/16 = **€3.40** | 16 × 4.09 = **€65.44** | 20 × 4.09 = €81.80 | **€65.44/lună** | 54.44/4.09 = 13.3 → **14** | 14/16 = **87.5%** |
| **Minecraft tier 2** (4 GB / 2 vCPU / 25 GB) | **€4.49** | 2 | 8 | 54.44/8 = **€6.81** | 8 × 4.49 = **€35.92** | 10 × 4.49 = €44.90 | €35.92/lună | 12.1 → **imposibil** (>8) | **>100%** |
| **Minecraft tier 3** (6 GB / 2 vCPU / 40 GB) | **€5.99** | 2 | 8 | 54.44/8 = **€6.81** | 8 × 5.99 = **€47.92** | 10 × 5.99 = €59.90 | €47.92/lună | 9.1 → **imposibil** (>8) | **>100%** |
| Minecraft tier 1, preț fondator | €3.49 | 1 | 16 | €3.40 | 16 × 3.49 = €55.84 | €69.80 | €55.84/lună | 15.6 → **16** | **100%** |
| `discord-bot` | €1.72 | 1 | 16 | **€3.40** | 16 × 1.72 = **€27.52** | €34.40 | €27.52/lună | 31.7 → imposibil | >100% |
| `discord-bot` | €2.12 | 1 | 16 | €3.40 | 16 × 2.12 = €33.92 | €42.40 | €33.92/lună | 25.7 → imposibil | >100% |
| `teamspeak3` | €2.59 | 2 | 8 | **€6.81** | 8 × 2.59 = **€20.72** | €25.90 | €20.72/lună | 21.0 → imposibil | >100% |
| `rust` | €3.89 | 4 | 5 | 54.44/5 = **€10.89** | 5 × 3.89 = **€19.45** | 5 × 3.89 = €19.45 (tavan = sigur, 4 vCPU × 5 = 20) | €19.45/lună | 14.0 → imposibil | >100% |
| Mix 12 × tier-1 + 2 × bot | — | — | 14 | 54.44/14 = €3.89 | 12 × 4.09 + 2 × 1.72 = **€52.52** | — | €52.52/lună | ~13 → 14 | 100% |

### 7.4 Concluziile pragului — spuse fără menajamente

1. **Doar configurația de 1 vCPU trece pragul.** La `C_node = €54.44`, pragul de acoperire e **€3.40/instanță** pentru 16 instanțe de 1 vCPU și **€6.81** pentru 8 instanțe de 2 vCPU. Tierul 1 (€4.09) trece cu **€0.69**; tierul 2 (€4.49) e **cu €2.32 sub prag**; tierul 3 (€5.99) e cu €0.82 sub prag.
2. **Prin urmare: la specificația de piață (2 vCPU), acest nod nu se poate plăti singur.** 8 instanțe × €4.49 = €35.92/lună, contra unui nod al cărui cost e de ordinul €54/lună (reperul `INFERRED`) — **pierdere de €18.52/lună chiar la 100% ocupare a tavanului** (10 × 4.49 = €44.90 → −€9.54). **Aceasta e constatarea centrală: Broadwell-ul de 20 de nuclee e suficient pentru 16 servere de 1 vCPU, dar nu pentru 8 servere de 2 vCPU la preț de piață.**
3. **Produsul de bot nu trece niciodată.** Pragul (€3.40) e peste prețul de listă (€1.72) și peste prețul de intrare al pieței (€0 la Lunafy). La 16 instanțe, aduce €27.52 pe un nod de €54.44 → **−€26.92/lună**. **„Dacă pragul e peste prețul pieței, spune-o" — se spune: botul e sub prag, deci nu poate fi produsul principal.**
4. **TS3 și Rust nu trec nici ele la prețurile propuse** (€2.59 respectiv €3.89, praguri €6.81 și €10.89). Ele trec doar dacă sunt vândute **ca produse de familie cu preț mai mare** (TS3 la ≈€7+ pentru 2 vCPU, Rust la ≈€11+) — adică la prețul unui server dedicat, nu la prețul de „gaming hosting ieftin". **Faza 3 e, deci, o fază de produse de preț mare, nu de produse de volum.**
5. **Dimensiunea nodului nu repară economia.** Din `P_floor = k × v / 0.8`, dacă `C_node` e proporțional cu `V_node`, ocuparea necesară **nu depinde de dimensiunea nodului**: redimensionarea la 10 vCPU (8 instanțe sigure, `C_node ≈ €27.22`) dă același „87.5% ocupare necesară". Redimensionarea **micșorează pierderea absolută, nu o repară**. Singurele pârghii: **preț mai mare** (cu o diferențiere reală: DDoS + backup) sau **cost per vCPU mai mic**.
6. **Pragul include și platforma, sau nu?** Calculul acoperă **doar nodul de gaming**. Mașina platformei (VM 103), panoul (VM 100), IP-ul public și licențele stau în plus, iar **niciuna nu e documentată ca cost**. **Pragul real e mai mare decât cel calculat.** Operatorul trebuie să adune costul platformei la `C_node` și să recalculeze.
7. **Prețul de intrare `€1.49` al cardului e sub prag de 2,3 ori** — nu se vinde nimic sub prag. Pentru produsul de joc, asta înseamnă `minRam = 4096`, `minCpu = 1`, `minDisk = 25` și o intrare la **€4.09**, nu la €1.49.

---

## 8. Criteriile de decizie (de re-aplicat la orice produs nou)

Aplicate în această ordine; un produs care pică la primul criteriu e respins.

| # | Criteriu | Test | Ce s-a întâmplat cu candidații |
|---|---|---|---|
| C1 | **Încadrarea în hardware** | E un container cu 1 proces, 1 port expus și stare locală? | ✅ Minecraft, Rust, Source, TS3 · ❌ WordPress, PostgreSQL, Code Server, Uptime Kuma (nu au egg și nu au clasa de workload) |
| C2 | **Existența assetului** | Există egg + imagine pe panou? | ✅ 16 din 16 candidați au egg; ❌ cele 4 produse de catalog n-au (deci nu e o decizie de vânzare, e o decizie de build) |
| C3 | **Accesibilitatea prin rețea** | Portul cerut e într-un bloc publicat și există alocare? Câte alocări cere? | ✅ Minecraft/bot: 1 alocare, blocul 30000+ publicat · ❌ Mumble (64738 inexistent) · ⚠️ Rust/Ark/TS3: 3–5 alocări, provisionarea actuală dă 1 |
| C4 | **Starea și backup-ul** | E stateful? → backup-ul trebuie să existe înainte de vânzare | ❌ toate produsele de joc sunt stateful → B5 e blocaj de lansare, nu de produs |
| C5 | **Necesitatea de DDoS** | Segmentul cer protecție? → fie cost, fie poziționare onestă | ❌ Blipmade nu are; toți cei 3 concurenți RO și Aternos o au |
| C6 | **Economicitatea** | `P ≥ C_node/N_safe` **la configurația vândută**? (nu „pe instanță", ci pe configurația care consumă vCPU) | ✅ tier 1 Minecraft (€4.09 vs €3.40) · ❌ tier 2 (€4.49 vs €6.81), bot (€1.72 vs €3.40), TS3, Rust |
| C7 | **Paralitatea cu prețul de intrare al pieței** | Prețul de intrare e peste prețul minim de intrare al cel puțin 2 concurenți **verificați**? | ✅ Minecraft: €4.09–4.49 vs €3.99/€4.49/€4.74 · ❌ bot: €1.72 vs €0/€1 |
| C8 | **Complexitatea operațională** | Câte alocări, cât de greu e install-ul, cât CPU la primul start, **câte vCPU consumă**? | ✅ Minecraft tier 1 (1 alocare, 1 vCPU, install ușor) · ⚠️ Rust (4 alocări, 4 vCPU, compilare de hartă) · ❌ Ark/GMod (foarte greu) |
| C9 | **Suprafața de expunere** | Câți clienți se pierd dacă produsul e retras? | Se păstrează **2** produse în catalog, nu 5 |
| C10 | **Verificabilitatea pieței** | Există cel puțin 2 concurenți cu prețuri publicate și lizibile? | ✅ segmentul RO (3 furnizori) · ❌ segmentul internațional de game hosting, din această rețea (`NOT-VERIFIED`) |

---

## 9. Contingența: dacă produsul de fază 1 nu convertește

**Declanșatorul, măsurabil:** după 30 de zile de la lansare, nodul are **mai puțin de `N_BE` instanțe plătite de 1 vCPU**, unde `N_BE = C_node / 4.09` (la reperul `INFERRED`: **14**). Nu se folosesc rate de conversie inventate — se folosește **starea măsurată a nodului**, care e și singura care contează pentru cash-flow.

**Ordinea acțiunilor (prima care e plauzibilă e aleasă; fiecare are aritmetica ei):**

| # | Acțiune | Efectul aritmetic | Ce nu se face |
|---|---|---|---|
| 1 | **Nu tăia prețul sub prag.** Scăderea la €3.49 (preț de fondator) duce `N_BE` de la 14 la 16 (87.5% → 100% ocupare) | pierdere mai mare, nu mai mică | nu se face discount sub prag, nici pe termen lung |
| 2 | **Cumpără protecție DDoS și re-prețuiește la banda de sus a pieței** (€4.74–5.99 la tier 1, cu backup inclus) | la €4.74: `N_BE = 54.44/4.74 = 11.5` → 12 instanțe (75%); la €5.39: `N_BE = 10.1` → 11 (69%) | nu se face preț „de fondator" la nesfârșit |
| 3 | **Umple sloturile libere cu `discord-bot`** (faza 2) | fiecare slot cu €1.72 în loc de €0 acoperiește o parte din costul fix: 12 tier-1 + 2 bot = €52.52 → încă sub prag, deci e **amortizare, nu profit** | nu se numără ca venit de marjă |
| 4 | **Verifică dacă produsul e complet, nu ieftin**: backup, DDoS, ghid, port, capturi, suport — dacă lipsesc, ele se construiesc înainte să se cere piața | lipsa lor explică o vânzare slabă mai bine decât prețul | nu se face „discount de lansare" în loc de livrare |
| 5 | **Nu vinde nimic cu 2 vCPU pe acest nod, ca produs de bază.** Tierul 2 (€4.49) are pragul la €6.81 → fie se vinde la **≈€6.81+** (preț de server dedicat), fie nu se vinde deloc | la €6.81, 8 instanțe = €54.48 ≈ pragul; sub 8 instanțe, pierdere garantată | nu se face „upgrade la 2 vCPU" ca mecanism de creștere a venitului |
| 6 | **Dacă după 60 de zile nodul are < 8 clienți: micșorează VM-ul** (20 → 10 vCPU) | `N_safe` 16 → 8; `C_node ≈ €27.22` (INFERRED, proporțional); `N_BE = 27.22/4.09 = 6.7` → 7 instanțe; **ocuparea necesară rămâne 87.5%** | nu se speră că redimensionarea repară economia (`P_floor = k × v / 0.8` e independent de dimensiune) |
| 7 | **Ultima opțiune: vinde nodul ca resursă dedicată** (un client, 16 vCPU / 100 GiB / 640 GB, preț între €65.44 și €81.80/lună) | platforma poate provisiona deja o instanță cu configurație la comandă; reperul de piață pentru o mașină similară e €49 + management | nu se vinde sub `C_max` |
| 8 | **Dacă nici asta nu merge: oprirea vânzării pe acest nod** și decizia hardware revine la operator | — | nu se vinde pe minus |

**Contingența pentru produsul de bot, în caz că Minecraft nu merge:** **nu se lansează botul în locul lui.** Botul are pragul de acoperire peste prețul de listă (§7.4) și prețul de intrare de piață e €0. Înlocuirea unui produs cu altul care pierde mai mult pe instanță ar fi o decizie greșită. **Singura alternativă onestă, în acel caz, e acțiunea 7 (nodul ca resursă dedicată).**

---

## 10. Rezumatul deciziei în cinci rânduri

1. **Faza 1 = un singur produs: `minecraft-paper`, la €4.09 (4 GB / 1 vCPU / 25 GB), €4.49 (4 GB / 2 vCPU) și €5.99 (6 GB / 2 vCPU / 40 GB), cu plafon de 16 instanțe și prag de rentabilitate la 14 clienți — iar tierul de 1 vCPU este singurul care trece pragul.**
2. **Faza 0 are 10 blocaje**, dintre care două sunt decisive: **plățile sunt oprite** (nimic nu se poate vinde) și **nu există backup** (nimic stateful nu se poate vinde).
3. **Faza 2 = botul (re-specificat) + vanilla + varianta Python**, ca umplutor de sloturi și extindere; **faza 3 = Rust, TS3, CS 1.6/CS2**, care cer provisionare multi-alocare, extinderea blocului de porturi și **prețuri de server dedicat**, nu de „gaming hosting ieftin".
4. **Nu se oferă pe acest hardware:** WordPress, Code Server, Uptime Kuma, PostgreSQL, Node.js/Python „generic" — plus egg-urile Mumble, Forge, CS:GO, TF2, Insurgency, Ark, GMod, Bungeecord, Sponge.
5. **Pragul de preț:** `P_floor = C_node/N_safe(configurație)` (și `= k × v / 0.8`, unde `k = C_node/20`). La reperul `INFERRED` de €54.44/lună: pragul e **€3.40** pentru 16 instanțe de 1 vCPU și **€6.81** pentru 8 instanțe de 2 vCPU — **Minecraft tier 1 (€4.09) trece**, tierul 2 (€4.49) **nu**, botul (€1.72) **nu trece niciodată** (prag peste prețul de listă și peste prețul pieței, €0), TS3 (€2.59) și Rust (€3.89) **nu**.
