# 08 — Portofoliul de produse: ce se vinde, ce nu se vinde și de ce

> **Data măsurătorilor:** 2026-10-23 · **Metodă:** inspecție read-only (DB Postgres pe VM 103, Application API Pterodactyl prin clientul platformei, iptables pe hypervisor, registry GHCR). **Nu s-a scris nimic** în producție: nicio comandă, nicio instanță, nicio modificare de panou, nicio deployment.
> **Convenție monetară:** în cod și în DB, prețurile sunt în **unități minori întregi (EUR cents)**. În text, în euro. `1 unitate minoră = €0.01`. Conversia se face o singură dată, în tabelele de preț.
> **Verdicturi folosite:** `LAUNCH-NOW` · `LAUNCH-AFTER-FIX` · `DO-NOT-OFFER-ON-THIS-HARDWARE` · `NOT-IMPLEMENTED`.
> Documentele înrudite: `08-competitive-analysis.md` (piața) și `08-product-launch-order.md` (ordinea și pragul de preț).

---

## 0. Decizia, în cinci rânduri

1. **Portofoliul de azi este o greșeală, dar nu pentru motivul la care te-ai gândi.** Nu este greșeală că vinde „apps și baze de date" pe un nod de gaming — este greșeală că **vinde patru produse care nu pot fi livrate** (`deployable = false`) cu **prețuri afișate**, în timp ce **singurul produs care poate fi livrat** (`discord-bot`, €1.72/lună) nu poate fi plătit, pentru că plățile sunt oprite pe VM 103 (`PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol, măsurat 2026-10-23).
2. **Hardware-ul și panoul sunt un joc de serveruri, nu o platformă de aplicații.** 16 egg-uri de joc, 173 alocări pregătite, 20 vCPU Broadwell 2016, 120 GiB RAM, 800 GiB disc. Niciun egg de CMS, niciun egg de bază de date, niciun egg de monitoring.
3. **Produsul de lansat este Minecraft (Paper), la €4.09/lună pentru 4 GB / 1 vCPU / 25 GB** (tierul de 2 vCPU: €4.49; 6 GB / 2 vCPU / 40 GB: €5.99), cu un plafon de **16 instanțe** — dar numai dacă fiecare ia **1 vCPU**: cu 2 vCPU, nodul duce doar 8. Prețul de intrare e **la nivelul pieței** (Zentaris: €4.49 la 4 GB / 2 vCPU), nu sub el, pentru că unit economics-ul nu permite subcotarea (`08-product-launch-order.md` §7).
4. **Două lucruri lipsesc și se vând înaintea oricărui joc:** backup (nu există niciunul, `feature_limits.backups = 0` pe toate cele 5 servere) și protecție DDoS (niciun trafic de joc nu este filtrat; doar `blipmade.com` și `www.` sunt prin Cloudflare).
5. **Verdictul economic cel mai important:** la 16 instanțe Minecraft × €4.09 (1 vCPU fiecare), platforma poate duce un cost de nod de **până la €65.44/lună**; cu instanțe de 2 vCPU (8 pe nod) poate duce doar **€35.92/lună**; portofoliul de boți, singur, **€27.52/lună**. Node de gaming + produs de boți = **pierdere garantată dacă boții sunt singuri**.

---

## 1. Cele șapte fapte măsurate pe care se construiește tot portofoliul

| # | Faptul | Sursa | De ce contează pentru portofoliul |
|---|---|---|---|
| F1 | Panoul are **16 egg-uri**, toate reale, în 5 niște: Minecraft (1 Vanilla, 2 Bungeecord, 3 Forge, 4 Sponge, 5 Paper), Source (6 Custom, 7 CS:GO, 8 Ark, 9 TF2, 10 Insurgency, 11 GMod), Voice (12 Mumble, 13 TS3), Rust (14), Discord Bots (15 node.js generic, 16 python generic) | `docker exec blipmade-api-1 node /app/panel-inventory.mjs` (2026-10-23) | Singurul activ real al platformei: 16 produse potențiale cu imagine, installer și startup deja definite |
| F2 | **Baza de date Blipmade are 0 noduri și 0 egg-uri**; `POST /admin/infrastructure/sync` nu a fost rulat niciodată | `SELECT count(*) FROM "Node"` → `0`; `SELECT count(*) FROM "Egg"` → `0` (psql pe VM 103, 2026-10-23) | Panoul nu e în starea platformei: sync-ul e un prerequisite de fază 0, nu un detaliu |
| F3 | Catalogul are **5 produse**, dintre care **4 au `deployable = false`, `eggId` NULL și `dockerImage` gol**: `wordpress`, `code-server`, `uptime-kuma`, `postgresql`. Doar `discord-bot` este deployable, pe egg **15** (node.js generic) | `SELECT slug, "eggId", "dockerImage", visible, deployable … FROM "Product"` (VM 103, 2026-10-23) | Patru produse au **preț afișat fără acoperire** (`04-product-certification.md:175-186`) |
| F4 | Hardware: **20 vCPU, 120 GiB RAM, 800 GiB disc, 173 alocări**, Broadwell 2016 (single node) | `audit/03-capacity-model.md:37-40`; nodul în panou: `ram=122880 disk=819200`, `allocations: 173` (panel-inventory) | Profilează un **game node**, nu un node de aplicații cu I/O dedicat |
| F5 | **Tavanul de capacitate = 16 instanțe sigure** (limitant: vCPU, cu 20% rezervă pentru nod) | `audit/03-capacity-model.md:150, 164-172` | Orice portofoliu încape în 16 instanțe; peste 20 e imposibil (21 ar depăși 20 vCPU) |
| F6 | **DNAT publică doar `30000:39999`** (TCP+UDP) către `10.77.0.11`; alocările `25565-25600` și `27015-27050` **nu sunt publicate** | iptables pe hypervisor: `-A PREROUTING -d 193.34.214.87/32 -i eth0 -p tcp --dport 30000:39999 -j DNAT --to-destination 10.77.0.11` (aceeași regulă și pentru udp); `audit/03-network-and-ip-plan.md:57` | Un server Minecraft pe alocarea lui naturală (25565) ar fi **inaccesibil din internet** |
| F7 | Prețurile: `baseAmount + 60/GB RAM + 40/vCPU + 2/GB disc`, în **unități minori**, `MONTHLY` | `api/src/services/pricing.ts:32-37`; `audit/05-pricing-consistency.md:1-19` | Formula e fixă; **singurele pârghii sunt `baseAmount` per produs și limitele `min*`**, nu ratele |

**Bonus critic, măsurat:** provisionarea **preferă deja alocările cu port ≥ 30000**:

```ts
// api/src/services/provisioning.ts:216-219
const allocations = await ptero.listAllocations(node.id);
const free = allocations.filter((allocation) => !allocation.assigned);
const preferred = free.find((allocation) => allocation.port >= 30000);
if (preferred) return { nodeId: node.id, allocationId: preferred.id };
```

Asta înseamnă că **serverele de joc lansate de platformă ajung în blocul publicat** și sunt accesibile — pe porturi non-standard (30000+), nu pe 25565. Bug-ul DNAT este, pentru lansare, **o problemă de cosmetică și de port, nu o blocare** — cu o singură excepție: Mumble (§6).

---

## 2. Cardul de preț, o singură dată, cu verificarea lui

```ts
// api/src/services/pricing.ts:32-37 (rezumat în audit/05-pricing-consistency.md:1-19)
price_minor = baseAmount
            + max(0, (ramMB  - minRam ) / 1024) * ramPerGb   // 60
            + max(0, (cpu    - minCpu )         ) * cpuPerUnit  // 40
            + max(0, (diskGB - minDisk)         ) * diskPerGb  //  2
```

`MONTHLY`, EUR cents. Conversie: `EUR = minor / 100`.

**Verificare pe date reale (nu pe teorie):** instanța live `cmvkbgm9h0001r18096ep5jzl` (Discord Bot, 512 MB / 1 vCPU / 5 GB) are `price = 172`.
`149 + (512-256)/1024×60 + 0 + (5-1)×2 = 149 + 15 + 0 + 8 = 172` ✔ (`Instance.price`, psql 2026-10-23).

**Atenție la o unitate de măsură în briefing:** `00-BRIEFING.md` §12.3 scrie „512 MB, 1 vCPU, 5 GB ⇒ 229 cents". **229 este greșit** — este calculul unui card *fără* pragul `min`: cu `minRam = 256` și `minDisk = 1` (valorile reale din `Product`), prețul este **172 = €1.72**. Ecuația 229 corespunde variantei „149 + 60×0.5 + 40×1 + 2×5", care presupune că RAM-ul și discul se taxează peste zero, nu peste minimul produsului. Prețul corect este cel calculat în `05-pricing-consistency.md` și verificat contra instanțelor live: **172**. Concluzia briefing-ului („minimul produsului deployable = 149 = €1.49") rămâne corectă pentru configurația *absolut minimă* (256 MB / 1 vCPU / 1 GB), dar **configurația implicită reală costă €1.72**, nu €2.29.

---

## 3. Portofoliul de azi: cele 5 produse din `Product` (măsurate)

Coloana „Preț" arată formula cu `baseAmount` și limitele reale ale produsului, apoi euro.

| # | Produs | Sursă | Workload | Imagine | min (RAM/vCPU/disc) | rec (RAM/vCPU/disc) | max (RAM/vCPU/disc) | Preț min → rec → max (eur) | Cost de instalare | Povară operațională | Competiție | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `discord-bot` | catalog + egg 15 | proces Node.js de lungă durată (bot Discord), 1 port TCP | `ghcr.io/ptero-eggs/yolks:nodejs_25` — **419.6 MiB** (comprimat, linux/amd64, măsurat) | 256 / 1 / 1 | **512 / 1 / 5** (configurația celor 2 instanțe live) | 4096 / 4 / 50 | **€1.49 → €1.72 → €5.92** (`149` / `149+15+0+8=172` / `149+225+120+98=592`) | imagine 419.6 MiB + `npm install` al proiectului clientului la primul start (mărime **NOT-MEASURED**, depinde de proiect) | fără backup; `git pull` la start doar dacă `.git` există deja (egg 15: `if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi`) → **livrarea codului nu e implementată**: provisionarea nu clonează repo-ul | Lunafy **€0**/server + €0.50/port; Render $7; Railway $5; Contabo VPS €5.50 | **LAUNCH-AFTER-FIX** |
| C2 | `wordpress` | catalog, **fără egg, fără imagine** | PHP + MySQL (stateful: DB + uploads) | **niciuna** | 512 / 1 / 5 | 1024 / 1 / 10 | 8192 / 4 / 100 | **€1.49 → €1.89 → €9.09** (`149` / `149+30+0+10=189` / `149+450+120+190=909`) | n/a — nu există imagine; costul unei imagini reale: **NOT-MEASURED** | updates (core+pluginuri), stateful, backup inexistent, fără DNS/TLS/mail (rutarea domeniilor e `BLOCKED`, `audit/00-current-state.md:129-135`) | Render/Railway/Heroku/Contabo (§`08-competitive-analysis.md`) | **DO-NOT-OFFER-ON-THIS-HARDWARE** |
| C3 | `code-server` | catalog, **fără egg** (egg 16 e „python generic", nu code-server) | IDE în browser, interactiv, latență-sensibil | **niciuna** | 1024 / 1 / 5 | 2048 / 1 / 10 | 16384 / 4 / 100 | **€2.99 → €3.69 → €15.09** (`299` / `299+60+0+10=369` / `299+900+120+190=1509`) | n/a | interactiv pe Broadwell partajat; backup inexistent | idem + Gitpod/CodeSandbox (free tier) | **DO-NOT-OFFER-ON-THIS-HARDWARE** |
| C4 | `uptime-kuma` | catalog, **fără egg** | monitoring: trebuie să sondeze **din exterior** | **niciuna** | 256 / 1 / 5 | 512 / 1 / 10 | 4096 / 2 / 50 | **€1.49 → €1.74 → €5.04** (`149` / `149+15+0+10=174` / `149+225+40+90=504`) | n/a | stateful (DB intern); un monitor care rulează *pe* nodul monitorizat are conflict de interes; nicio sondă externă | UptimeRobot/Better Stack tier gratuit | **DO-NOT-OFFER-ON-THIS-HARDWARE** |
| C5 | `postgresql` | catalog, **fără egg** | bază de date relațională, stateful, I/O intens | **niciuna** | 1024 / 1 / 5 | 1024 / 1 / 10 | 16384 / 4 / 200 | **€4.49 → €4.59 → €18.59** (`449` / `449+0+0+10=459` / `449+900+120+390=1859`) | n/a | **stateful, backup inexistent, poarta de disc defectă** (§9.3) | RDS managed, VPS+Hetzner, Neon/Supabase free tier | **DO-NOT-OFFER-ON-THIS-HARDWARE** |

**De ce `discord-bot` este singurul care rămâne, și cu ce preț propus:** cardul lui (`base 149`, `minRam 256`, `minDisk 1`) expune o configurație de **256 MB / 1 GB** care nu se poate vinde: un bot cu 1 GB de disc nu are loc. Re-spec propus: `baseAmount = 172`, `minRam = 512`, `minDisk = 5` → intrările devin **€1.72 (512 MB/1 vCPU/5 GB)** și **€2.12 (1024/1/10)**, plafon **€5.92 (4096/4/50)**, iar **cele 2 instanțe live rămân la 172** (nicio reprețare a clienților existenți; `Payment`/`Subscription`/`Invoice` = 0 rânduri, `audit/04-product-certification.md:156-160`).

---

## 4. Cele 16 egg-uri de pe panou (niciunul nu are rând în `Product`)

Toate sunt măsurate din panou (Application API, 2026-10-23). **Niciunul nu este un produs azi**: nu există `Product`, nu există preț, nu există opțiuni (`SELECT count(*) FROM "ProductOption"` → `0`). Verdictul de mai jos este **decizia** pentru fiecare.

| # | Egg (id) | Workload | Imagine (măsurată) | Config. min → rec → max (RAM/vCPU/disc) | Preț propus (eur), cu `base` propus | Cost de instalare | Povară operațională | Competiție | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| E1 | **Paper** (5) | server Minecraft Java | `ghcr.io/pterodactyl/yolks:java_25` — **208.9 MiB** | 4096/1/25 → **4096/1/25** → 6144/2/40 | €4.09 → **€4.09** → €5.99 (`base 409`, `minRam 4096`, `minCpu 1`, `minDisk 25`; tier 2 vCPU: `409+40=449` = €4.49) | imagine 208.9 MiB + jar-ul serverului (≈50–100 MB, **NOT-MEASURED**) + generarea lumii la primul start | stateful (lumea), updates de versiune, **fără backup**; **1 vCPU/instanță = 16 instanțe pe nod**; cu 2 vCPU = doar 8 | RO: OVI €3.99, Zentaris €4.49, Torchbyte €4.74 (la 4 GB / 2 vCPU) | **LAUNCH-AFTER-FIX** ← *produsul de fază 1* |
| E2 | Vanilla Minecraft (1) | server Minecraft Java (purist) | `yolks:java_25` — 208.9 MiB | 4096/1/25 → 4096/1/25 → 6144/2/40 | €4.09 → €4.09 → €5.99 (același card ca E1) | idem E1 | idem E1 | idem E1 | **LAUNCH-AFTER-FIX** (faza 2: al doilea rând `Product`, același card) |
| E3 | Forge Minecraft (3) | Minecraft moddat | `yolks:java_25` — 208.9 MiB | 4096/2/25 → 6144/4/40 → 6144/4/50 | €4.49 → €6.79 (`base 409`; indicativ) | descărcare de installer + modpack (2–10 GB, **NOT-MEASURED**) | **installerul e `eclipse-temurin:8-jdk-jammy` (Java 8), runtime-ul e `yolks:java_25` (Java 25)** → combinația nu e suportată pentru Minecraft modern (INFERRED, din cele două imagini măsurate) | idem E1 | **NOT-IMPLEMENTED** (blocaj: Java-ul runtime-ului trebuie să corespundă versiunii) |
| E4 | Sponge (SpongeVanilla) (4) | Minecraft cu Sponge | `yolks:java_25` — 208.9 MiB | 4096/1/25 → 4096/1/25 → 6144/2/40 | €4.09 → €4.09 → €5.99 (indicativ) | idem E1 | idem E1 | niște | **NOT-IMPLEMENTED** |
| E5 | Bungeecord (2) | proxy pentru rețele de servere | `yolks:java_25` — 208.9 MiB | 1024/1/5 → 2048/2/10 → 2048/2/20 | €1.49 → €2.59 | 208.9 MiB + jar | proxy: trebuie să ajungă la alte servere; niște | niște | **NOT-IMPLEMENTED** |
| E6 | Custom Source Engine (6) | orice joc Source (CS 1.6 = appid 90, CS2 = 730) | `ghcr.io/pterodactyl/games:source` — **233.5 MiB** | 512/1/5 → 1024/2/25 → 2048/2/25 | €1.49 → €2.59 (`base 149`) | steamcmd + conținutul jocului (**multi-GB, NOT-MEASURED** — VM 101 inaccesibil pentru un test de install) | updates Steam, content creator | Zentaris CS 1.6: **€3.49** (16 sloturi) / €4.99 (24) / €7.99 (32) | **NOT-IMPLEMENTED** (faza 3: produsul CS 1.6/CS2 — egg-ul are deja variabila `SRCDS_APPID`, deci produsul se poate construi, dar install-ul trebuie dovedit pe nod) |
| E7 | CS:GO (7) | Counter-Strike: Global Offensive (2012) | `games:source` — 233.5 MiB | 512/1/5 → 1024/2/25 → 2048/2/25 | €1.49 → €2.59 | steamcmd, conținut CS:GO (**NOT-MEASURED**) | titlu înlocuit de CS2 | jocuri vechi | **NOT-IMPLEMENTED** (nu se vinde un titlu mort) |
| E8 | Ark: Survival Evolved (8) | server Ark | `games:source` — 233.5 MiB | 4096/2/20 → 6144/4/50 → 6144/4/50 | €2.49 → €5.09 (`base 249`) | steamcmd, joc foarte mare (**NOT-MEASURED**) | **3 porturi** (SERVER/RCON/QUERY); CPU-gol | niște, hardware dedicat | **NOT-IMPLEMENTED** |
| E9 | Team Fortress 2 (9) | server TF2 | `games:source` — 233.5 MiB | 512/1/5 → 1024/2/25 → 2048/2/25 | €1.49 → €2.59 | steamcmd (**NOT-MEASURED**) | titlu vechi, niște | niște | **NOT-IMPLEMENTED** |
| E10 | Insurgency (10) | server Insurgency | `games:source` — 233.5 MiB | 512/1/5 → 1024/2/25 → 2048/2/25 | €1.49 → €2.59 | steamcmd (**NOT-MEASURED**) | titlu vechi, niște | niște | **NOT-IMPLEMENTED** |
| E11 | Garry's Mod (11) | server GMod | `games:source` — 233.5 MiB | 4096/2/25 → 6144/4/40 → 6144/4/50 | €4.49 → €6.79 (`base 409`; indicativ) | steamcmd + workshop content (**NOT-MEASURED**) | tickrate, CPU-gol, conținut creat de terți | niște | **NOT-IMPLEMENTED** |
| E12 | Mumble Server (12) | server voce Mumble | `ghcr.io/parkervcp/yolks:voice_mumble` — **116.0 MiB** | 512/1/5 → 1024/1/5 → 2048/1/10 | €1.49 → €1.79 → €2.49 (`base 149`) | 116 MiB + `apk add murmur` | **startup-ul nu are nicio variabilă de port** (`mumble-server -fg -ini murmur.ini`) → ascultă pe **64738**, care **nu e publicat și nu există ca alocare** | niște; TS3 e standardul în RO | **NOT-IMPLEMENTED** (blocaj de rețea, §6) |
| E13 | Teamspeak3 Server (13) | server voce TS3 | `ghcr.io/pterodactyl/yolks:debian` — **293.1 MiB** | 1024/1/5 → 2048/2/10 → 4096/2/20 | €1.49 → €2.59 → €3.99 (`base 149`; `149+180+40+30=399`) | 293.1 MiB + tarball TS3 (~100–200 MB, **NOT-MEASURED**) | **5 porturi** (voice/query/filetransfer/query-http/query-ssh); produs de familie; **2 vCPU/instanță → 8 instanțe pe nod** | Zentaris TS3: **€3.49/lună** | **LAUNCH-AFTER-FIX** (faza 3, produs complementar) |
| E14 | Rust (14) | server Rust | `ghcr.io/pterodactyl/games:rust` — **158.6 MiB** | 4096/2/20 → 4096/4/50 → 6144/4/50 | €2.49 → €3.89 → €5.09 (`base 249`) | 158.6 MiB + steamcmd + RustDedicated + generarea hărții la primul start (multi-GB, **NOT-MEASURED**) | **4 porturi**; primul start consumă un nucleu complet (INFERRED din natura jocului) | joc popular în RO, preț de verificat | **LAUNCH-AFTER-FIX** (faza 3, cu condiții) |
| E15 | node.js generic (15) | container Node.js generic | `ghcr.io/ptero-eggs/yolks:nodejs_25` — **419.6 MiB** | 256/1/1 → 512/1/5 → 4096/4/50 | €1.49 → €1.72 → €5.92 | 419.6 MiB + deps | fără backup; livrare de cod lipsă | Lunafy €0, Render $7, Railway $5, Contabo €5.50 | **ca imagine a lui `discord-bot`: LAUNCH-AFTER-FIX** · **ca „hosting Node.js generic": DO-NOT-OFFER-ON-THIS-HARDWARE** |
| E16 | python generic (16) | container Python generic | `ghcr.io/ptero-eggs/yolks:python_3.13` — **401.6 MiB** | 512/1/5 → 1024/1/10 → 4096/4/50 | €1.72 → €2.12 → €5.92 (`base 172`, propus) | 401.6 MiB + pip install | fără backup; `pip install -U` la fiecare start | idem E15 | **ca „Discord Bot (Python)": LAUNCH-AFTER-FIX** (faza 2) · **ca „hosting Python generic": DO-NOT-OFFER-ON-THIS-HARDWARE** |

**Despre „generic" (E15, E16) ca produs de vânzare.** Un container Node.js/Python de 512 MB la €1.72/lună nu poate câștiga față de Lunafy (€0 primul server, 512 MB/0.5 vCPU), Render Starter ($7, 512 MB), Railway Hobby ($5, 1 vCPU/0.5 GB) sau un VPS Contabo de €5.50 (4 vCPU/8 GB). Diferența nu e prețul, e ce **nu** oferi: TLS/hostname, e-mail, backup, egress garantat, auto-scaling. Un „hosting de aplicații" cu aceste lipsuri e un produs pe care nu îl poți vinde pe preț. Verdictul „generic" e deci **DO-NOT-OFFER-ON-THIS-HARDWARE**; valoarea reală a acestor două egg-uri e că sunt **imaginea** lui `discord-bot` și a unei variante Python.

---

## 5. Ce se potrivește hardware-ului și ce nu

**Se potrivește (game server):** Minecraft (Paper/Vanilla), Rust, Source Engine (CS 1.6/CS2), TS3, Mumble, Bungeecord, GMod, Ark, TF2, Insurgency, CS:GO — toate au aceleași trei caracteristici: (1) **un container, un proces**; (2) **1 port TCP/UDP expus** pe care clientul intră; (3) **stare pe disc local** (lume, configurație, save-uri) fără dependență de un service extern. Nodul are 120 GiB de RAM și 800 GiB de disc pentru exact acest tip de workload, iar panoul are egg-urile, instalatorii și alocările pregătite.

**Nu se potrivește (aplicație + bază de date):** WordPress, Code Server, Uptime Kuma, PostgreSQL — și, în lectura „generic", egg-urile 15 și 16. Motive, toate măsurate:

1. **Nu există egg.** Niciunul din cele 16 egg-uri nu e CMS, IDE, monitor sau bază de date (`panel-inventory`, 2026-10-23). Fiecare produs din această categorie ar începe de la zero: egg + imagine + `Product` + `ProductPrice` + probe + documentație.
2. **Baza de date pe un game node e altă afacere.** `postgresql` cere `maxDisk = 200` GB și `maxRam = 16384` MB; pe același nod, cu Minecraft la 25 GB, 16 instanțe × 200 GB = 3.2 TB pe un disc de 800 GB. I/O-ul unei baze de date pe discuri partajate cu 16 jocuri e altă clasă de serviciu, cu alt preț și altă promisiune. Nu se vinde pe același nod, cu același preț.
3. **Backup-ul lipsește peste tot** (`feature_limits.backups = 0`, `audit/03-disaster-recovery.md:25,63`). Pentru o bază de date sau un site, „fără backup" înseamnă pierdere de date garantată. Pentru o lume Minecraft, înseamnă jucători nemulțumiți. Pentru un bot, de obicei înseamnă nimic.
4. **WordPress și Code Server au nevoie de domeniu + TLS + e-mail**, iar rutarea domeniilor este `BLOCKED` (`audit/00-current-state.md:129-135`). Fără ea, „WordPress hosting" înseamnă „un container PHP pe un port 30012" — nu un produs.
5. **Prețul de intrare e sub piața și sub costul nodului.** WordPress la €1.49 și Uptime Kuma la €1.49 nu au corespondent pe piață (Render $7, Railway $5, Heroku $7, Contabo €5.50) — nici sus, nici jos: nu câștigi clienți pentru că e ieftin (PaaS-ul e mai ieftin sau gratuit) și nu câștigi pentru că e scump (nimeni nu plătește €1.49 pentru hosting).

**Concluzia secțiunii:** hardware-ul, panoul și rețeaua sunt **coerente ca produs de game hosting** și **incoerente ca platformă de aplicații**. Portofoliul de azi (4 din 5 produse sunt din categoria care nu se potrivește) este **inversat față de hardware**.

**Atenție: limita de capacitate e dată de vCPU-ul pe instanță, nu de numărul de instanțe.** Cu același nod (20 vCPU, rezervă de 20% → 16 vCPU vândabili):

| vCPU pe instanță | Instanțe sigure | RAM maximă pe instanță (la 16 instanțe) | Instanțe sigure cu 2 vCPU | Instanțe sigure cu 4 vCPU |
|---|---|---|---|---|
| **1 vCPU** | **16** | 7,5 GiB | 8 | 4 |
| 2 vCPU | 8 | — | 8 | 4 |
| 4 vCPU | 4 | — | 4 | 4 |

(calcul: `N = min(20/v, 120/GB, 800/GB)`, rezervă 20%, conform `audit/03-capacity-model.md:111-150`). **Un produs de joc vândut la 2 vCPU — adică standardul pieței — înjumătățește numărul de clienți pe nod** și e exact cauza pentru care pragul de rentabilitate al nodului nu se atinge la preț de piață (`08-product-launch-order.md` §7.4).

---

## 6. Porturile: ce cere produsul și ce publică rețeaua

### 6.1 Inventarul real

| Bloc de alocări | Porturi | Nr. | Liber(e) | Publicat de DNAT? | Cine le folosește |
|---|---|---|---|---|---|
| Minecraft | 25565–25600 | 36 | 36 | **Nu** | nimeni (portul natural al jocului) |
| Source | 27015–27050 | 36 | 36 | **No** | nimeni |
| Aplicație | 30000–30100 | 101 | 96 (5 ocupate: 30000–30004) | **Da** (`30000:39999` TCP+UDP) | cele 5 servere existente + orice instanță nouă |

Sursă: `listAllocations(1)` prin clientul platformei (2026-10-23) — 173 alocări în total; iptables pe hypervisor pentru DNAT.

**Observație dură:** DNAT-ul publică 10.000 de porturi (30000–39999), dar **panoul nu are alocări peste 30100**. Adică **96 de porturi accesibile din internet**, nu 10.000. Cele 72 de alocări din blocurile 25565 și 27015 sunt **moarte**: nimeni nu poate ajunge la ele.

### 6.2 Ce port cere fiecare produs

| Produs | Porturi necesare | Cum le obține | Reachability |
|---|---|---|---|
| Minecraft (toate egg-urile 1–5) | **1** | `server-port: {{server.build.default.port}}` (măsurat în `config.files` al egg-ului 1 și 5) = portul alocării | ✔ dacă alocarea e în 30000–30100; provisionarea **preferă deja** `port >= 30000` (`provisioning.ts:218`) |
| Source (6–11) | **1** pentru joc (`-port {{SERVER_PORT}}`); **+2** pentru Ark (`{{RCON_PORT}}`, `{{QUERY_PORT}}`) | portul alocării | ✔ 1 port; ✖ Ark — platforma atribuie **o singură alocare** pe server (`provisioning.ts:484`: `allocations: [choice.allocationId]`) |
| Rust (14) | **4** (`{{SERVER_PORT}}`, `{{QUERY_PORT}}`, `{{RCON_PORT}}`, `+server.app.port`) | alocări multiple | ✖ **nu e provisionabil corect azi** — lipsește alocarea 2–4 |
| TS3 (13) | **5** (`default_voice_port`, `query_port`, `filetransfer_port`, `query_http_port`, `query_ssh_port`) | alocări multiple | ✖ **nu e provisionabil corect azi** |
| Mumble (12) | **1, dar fix: 64738** | startup-ul nu are variabilă de port → `murmur.ini` implicit | ✖ **nu există alocare 64738 și nu e publicat**; ar necesita o alocare cu port custom + o regulă DNAT nouă |
| Discord bot (15) / Python (16) | **1** (health probe TCP) | portul alocării | ✔ |
| WordPress / Code Server / Uptime Kuma / PostgreSQL | **1 + DNS + TLS + mail** | port + domeniu | ✖ rutarea domeniilor e `BLOCKED` |

### 6.3 Concluzia pe porturi

- **Nimic nu blochează lansarea Minecraft**: alocarea aleasă de platformă e deja în blocul publicat. Portul clientului va fi **`node1.blipmade.com:30012`**, nu `:25565` — trebuie spus explicit în documentație și în e-mailul de activare.
- **Fixul corect, în ordine:** (1) **publică `25565:25600` și `27015:27050`** în DNAT (o regulă iptables + o regulă FORWARD; nu am modificat nimic — sistemul e read-only) sau **șterge acele blocuri de alocări**, ca să nu rămână capcane; (2) **alocă porturi noi peste 30100** dacă se vor vinde produse multi-port (Rust/TS3), ca bugetul de porturi să nu fie 96;
- **Bugetul de porturi devine real de la faza 3:** 16 instanțe Rust = 64 porturi, 16 instanțe TS3 = 80 porturi, 16 Minecraft = 16 porturi. Amestecul maxim (16 Minecraft + 16 TS3) consumă **96 de 96** porturi publicate — **zero rezervă**. De aceea produsele multi-port nu pot veni înainte de extinderea blocului publicat.
- **Mumble nu se vinde pe infrastructura actuală** fără o alocare cu port custom și o regulă DNAT nouă; e o decizie de rețea, nu de produs.

---

## 7. Produsele stateful și povestea de backup

**Ce e stateful:** toate produsele de joc (lumea Minecraft, save-urile Rust, configurația și logurile TS3, conținutul Source), botul (dacă scrie fișiere local), plus toate cele 4 produse de aplicații (DB + uploads).

**Starea backup-ului, măsurată:**
- `feature_limits: { databases: 0, allocations: 0, backups: 0 }` pe **toate cele 5 servere** din panou (`audit/03-disaster-recovery.md:25,63`) → mecanismul de backup per server al lui Pterodactyl există în cod (`api/src/services/panel/operations.ts`) dar **panoul îl refuză**, pentru că limita e `0`.
- Nu există țintă de backup: `pvesh get /cluster/backup` → `[]`, niciun timer, arhivele existente stau **pe același RAID 0** pe care stau datele (`audit/03-disaster-recovery.md:36-48`).
- Workflow-ul „nightly backup drill" din CI rulează pe runner-ul GitHub, **nu pe producție** (`audit/03-disaster-recovery.md:59`).

**Consecința comercială, în două rânduri:** (1) **Minecraft nu trebuie vândut fără backup** — o lume pierdută înseamnă un client pierdut și un review negativ; (2) **Torchbyte, cel mai ieftin concurent cu preț similar, include 50 GB de backup la €4.74** — lipsa de backup nu e doar o datorie tehnică, e o **poziționare de piață**.

**Povestea minimă de backup, suficientă pentru lansare (efort M, ~1 zi):** backup programat al directorului de instanță (`/mnt/server/<id>`) pe un volum secundar **în afara nodului de joc** + o copie a planului de restaurare + un buton de „restore" în panoul clientului; sau activarea limitei `backups` pe servere și configurarea țintei pe VM 101 (nodul e accesibil doar de la platformă). Fără asta, faza 1 nu se lansează.

---

## 8. Riscul de concentrare

| Dimensiune | Stare | Consecință |
|---|---|---|
| Produse | 1 deployable (`discord-bot`), 4 afișate cu preț | dacă `discord-bot` se retrage → catalogul afișează 4 prețuri pentru produse inexistente; **cifra de afaceri = €0** |
| Clienți plătitori | **0** (`Payment` = 0, `Subscription` = 0, `Invoice` = 0; cele 8 evenimente `order.paid` sunt din scriptul de test `scripts/verify-provisioning.py`) | `audit/04-product-certification.md:156-163` |
| Instanțe | 3 (2 „Discord Bot", 1 „Browser instance" de test) | niciuna plătită |
| Hardware | **un singur nod**, o singură adresă IP publică, **RAID 0** | un incident de disc/RAID pierde **100% din afacere** (`audit/03-disaster-recovery.md:15`) |
| Venit | **€0/lună** | concentrat prin definiție: nu există încă diversificare |

**Cum se reduce:**
1. **Minimizarea suprafeței expuse:** lasă în catalog doar 2 produse (Minecraft + bot). Un produs retras devine o decizie de afișare, nu un incident de vânzare — și nimeni nu plătește pentru ceva ce nu se livrează.
2. **Al doilea produs = un rând în `Product`, nu o rescriere:** Minecraft (Paper) și Discord Bot folosesc același provisioner, același nod, aceleași alocări. Dacă `discord-bot` se retrage, rămâne Minecraft; dacă Minecraft se retrage, rămâne botul.
3. **Diversificarea hardware:** când există doi clienți plătitori, al doilea nod (sau o mașină separată pentru bazele de date) trebuie să intre în plan înainte de primul incident.
4. **FărăClaims nerealiste:** până când backup-ul și DDoS-ul există, marketingul nu poate spune „gaming hosting complet" — trebuie să spună ce e adevărat (vezi `08-competitive-analysis.md` §6).

---

## 9. Traseul de migrare: de la cele 5 de azi la portofoliul recomandat

### 9.1 Lista de produse

| Acțiune | Produs | Ce trebuie construit | Efort | Dependențe |
|---|---|---|---|---|
| **Retrage** | `wordpress` | `visible=false` (sau rând șters) + eliminat din lista de marketing `web/src/data.ts` (`APPS` conține 12 produse fictive, `web/src/data.ts:19-31`) + text în site/docs „indisponibil pe acest server" | **S** (2–4 h) | owner web |
| **Retrage** | `code-server` | idem | **S** | owner web |
| **Retrage** | `uptime-kuma` | idem | **S** | owner web |
| **Retrage** | `postgresql` | idem | **S** | owner web |
| **Păstrează, re-spec** | `discord-bot` | `baseAmount` 149→**172**, `minRam` 256→**512**, `minDisk` 1→**5**; `healthProbe = { kind: 'container' }` (există deja în cod, `provisioning.ts:285-286`); **livrare de cod**: clone-ul repo-ului la creare (egg-ul 15 face deja `git pull` dacă `.git` există); documentație; 2 capturi de ecran | **M** (1–2 zile) | owner API + web |
| **Nou** | `minecraft-paper` | **rând `Product`** (slug `minecraft-paper`, `eggId=5`, `dockerImage=ghcr.io/pterodactyl/yolks:java_25`, `startupCommand` = cel al egg-ului 5, `healthProbe={kind:'tcp'}`); **rând `ProductPrice`** (base 409, 60/40/2, MONTHLY); limite: min 4096/1/25, default 4096/1/25, max 6144/2/40 (1 vCPU/instanță → 16 instanțe pe nod); **categorie nouă `GAMES`** → migrare Prisma (`api/prisma/schema.prisma:200-207` nu are `GAMES`); **opțiuni** (`ProductOption`, 0 rânduri azi): „Paper 1.21.x", „Paper + plugins", „backup zilnic" (opțiunile au `amount` și `recurring`, `schema.prisma:279-292`); pagină de produs (`web/src/app/ProductPage.tsx`), documentație (port, versiune, backup, limite), 3 capturi de ecran | **M** (2–3 zile) | owner DB (migrare enum) + API + web |
| **Nou, faza 2** | `minecraft-vanilla` | rând `Product` pe egg 1 + rând `ProductPrice` (base 409) + pagină de produs | **S** (2–3 h) | owner API + web |
| **Nou, faza 2** | `discord-bot-python` | rând `Product` pe egg 16 + `ProductPrice` (base 172) + doc | **S** (2–3 h) | owner API |
| **Nou, faza 3** | `rust` | rând `Product` pe egg 14 + `ProductPrice` (base 249) + **provisionare cu 4 alocări** (platforma atribuie 1) + limitarea instalărilor simultane | **L** (3–5 zile) | owner API (provisionare multi-alocare) |
| **Nou, faza 3** | `teamspeak3` | rând `Product` pe egg 13 + `ProductPrice` (base 149) + **provisionare cu 5 alocări** | **L** (3–5 zile) | owner API |
| **Nou, faza 3** | `cs16` / `cs2` | egg 6 cu `SRCDS_APPID=90` (CS 1.6) sau 730 (CS2) setat prin `Product.startup` (suprascrierea mediului există: `provisioning.ts:242-248`) + dovedirea install-ului pe nod (VM 101 inaccesibil auditului) + doc | **L** (3–5 zile) | owner API + operații |

### 9.2 Ce **nu** se construiește (și de ce)

- Niciun egg Source 6–11 ca produs separat (CS:GO, TF2, Insurgency, Ark, GMod): jocuri vechi sau cu profil de hardware dedicat, cost de install greu, piețe de niște.
- Mumble: blocat de port (§6.2).
- Forge: blocat de versiunea Java (§4, E3).
- Bungeecord, Sponge: niște, fără cerere demonstrabilă.
- Un „hosting Node.js/Python generic": concurență PaaS cu preț și e-mail/TLS/backup pe care platforma nu le are (§4, E15–E16).

### 9.3 Două defecte de platformă care trebuie reparate **înainte** de orice lansare

| Defect | Cod | Efectul pe portofoliul | Efort |
|---|---|---|---|
| **Poarta de capacitate a discului nu leagă nimic** | `api/src/services/provisioning.ts:213-214`: `freeDisk = node.disk + …` e în **MB** (819200), `disk` argumentul e în **GB** → comparație cu factor 1024× | Un produs cu `maxDisk = 200` (ca `postgresql`) ar fi acceptat pe un nod cu 800 GB liber, fără verificare reală; pentru Minecraft (max 50 GB) riscul e mic **la 16 instanțe**, dar devine real la 16 × 50 GB = 800 GB = exact discul nodului | **S** (o linie: `disk * 1024`) |
| **O singură alocare pe server** | `api/src/services/provisioning.ts:482-484`: `allocation: { default: choice.allocationId, allocations: [choice.allocationId] }` | **Rust (4 porturi) și TS3 (5 porturi) nu pot fi provisionate corect** cu provisionarea actuală | **M** (alocări multiple per produs) |

Ambele sunt în `api/src/services/provisioning.ts` — proprietatea ownerului API, nu a acestui raport; le semnalez pentru că decid ce se poate vinde.

---

## 10. Sumarul verdicturilor (21 de candidați)

| Verdict | Număr | Candidați (21 = 5 din catalog + 16 egg-uri) |
|---|---|---|
| `LAUNCH-NOW` | **0** | — (plățile sunt oprite: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol — niciun produs nu poate fi vândut azi) |
| `LAUNCH-AFTER-FIX` | **7** | C1 `discord-bot` (imagine: E15) · E1 Paper · E2 Vanilla · E16 python generic (imagine pentru `discord-bot-python`) · E14 Rust · E13 Teamspeak3 |
| `DO-NOT-OFFER-ON-THIS-HARDWARE` | **4** | C2 `wordpress` · C3 `code-server` · C4 `uptime-kuma` · C5 `postgresql` |
| `NOT-IMPLEMENTED` | **10** | E3 Forge · E4 Sponge · E5 Bungeecord · E6 Custom Source · E7 CS:GO · E8 Ark · E9 TF2 · E10 Insurgency · E11 GMod · E12 Mumble |
| **Total** | **21** | ✔ |

**Două decizii suplimentare, care nu adaugă candidați** (ci schimbă sensul unui egg deja numărat):
- **E15 și E16 ca „hosting generic"** (Node.js / Python vândut ca atare) → `DO-NOT-OFFER-ON-THIS-HARDWARE`: egg-urile sunt valorizate **ca imagine** a celor două produse de bot, nu ca produse de aplicații. Raționamentul e în rândurile lor (§4).
- **E6, E13, E14** sunt `NOT-IMPLEMENTED` *azi*, dar sunt **decizii de fază 3**, nu „nu se construiește" (§9.1).

---

## 11. Anexă: comenzile de verificare (read-only, 2026-10-23)

```bash
# Panou: noduri, niște, egg-uri, alocări
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker exec blipmade-api-1 node /app/panel-inventory.mjs'

# Detalii per egg (id, nume, imagine, startup, config.files, installer)
docker exec blipmade-api-1 node --input-type=module -e "
const { applicationRequest } = await import('/app/dist/services/pterodactyl/application.js');
const raw = await applicationRequest('GET','/api/application/nests/1/eggs/5');
console.log(JSON.stringify(raw.attributes ?? raw, null, 1));"

# Catalog, prețuri, instanțe, opțiuni (VM 103, Postgres)
cd /opt/blipmade && docker compose -f compose.yml exec -T postgres psql -U blipmade -d blipmade \
  -c "SELECT p.slug,p.category,p.\"eggId\",p.visible,p.deployable,p.\"minRam\",p.\"defaultRam\",p.\"maxRam\",p.\"minCpu\",p.\"maxCpu\",p.\"minDisk\",p.\"defaultDisk\",p.\"maxDisk\",pp.\"baseAmount\",pp.\"ramPerGb\",pp.\"cpuPerUnit\",pp.\"diskPerGb\",pp.period FROM \"Product\" p LEFT JOIN \"ProductPrice\" pp ON pp.\"productId\"=p.id ORDER BY p.slug;" \
  -c "SELECT id,name,status,ram,cpu,disk,price FROM \"Instance\" ORDER BY id;" \
  -c "SELECT count(*) FROM \"Node\";" -c "SELECT count(*) FROM \"Egg\";" -c "SELECT count(*) FROM \"ProductOption\";"

# DNAT (hypervisor)
iptables-legacy -t nat -S PREROUTING | grep 193.34.214.87

# Dimensiunile imaginilor (registry GHCR, linux/amd64, suma layer-urilor comprimate)
skopeo inspect --override-os linux --override-arch amd64 --raw docker://ghcr.io/pterodactyl/yolks:java_25
```

**Nicio comandă cu scriere nu a fost rulată.** Nicio comandă, instanță, deployment sau modificare de panou nu a fost efectuată; toate accesele au fost GET-uri și SELECT-uri.
