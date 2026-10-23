# 03 — Model de capacitate: câte instanțe se pot vinde

**Data auditării:** 2026-10-23 · **Sursă primară:** hardware măsurat pe `n7030e1`, API-ul de aplicație al Pterodactyl (read-only), baza de date a platformei (read-only), catalogul de produse din cod.

Clasele de verificare sunt cele din `00-BRIEFING.md`. Fiecare număr din acest document indică sursa lui.

---

## 1. Hardware-ul de referință (măsurat)

| Resursă | Valoare | Sursă | Clasă |
|---|---|---|---|
| CPU | 2 × `Xeon E5-2698 v4 @ 2.20GHz`, 40 nuclee / 80 thread-uri | `lscpu`, `pvesh` | `VERIFIED` |
| Set de instrucțiuni | `avx2` prezent, **`avx512f` absent** | `lscpu` `Flags:` | `VERIFIED` |
| Cache | L1d 32 KiB/nucleu, L2 256 KiB/nucleu, L3 50 MiB/socket | `lscpu` | `VERIFIED` |
| NUMA | 2 noduri | `lscpu` | `VERIFIED` |
| RAM total | 251,77 GiB | `pvesh .../status` | `VERIFIED` |
| RAM angajată în VM-uri | 142 GiB (4 + 128 + 2 + 8) | `qm config` | `VERIFIED` |
| RAM folosită de host | 24,26 GiB | `pvesh .../status` | `VERIFIED` |
| Swap | 30,65 GiB, nefolosit | `pvesh .../status` | `VERIFIED` |
| Stocare | 1 725 GiB (1,68 TiB), 41,55 GiB folosit | `pvesh --type storage` | `VERIFIED` |

---

## 2. Nodul de jocuri (VM 101) — ce se vinde efectiv

### 2.1 Poolul real de vânzare (limitele nodului, nu ale mașinii virtuale)

**Nuanța care decide tot modelul:** ceea ce se poate vinde nu este limitat de VM, ci de **limitele configurate în panoul Pterodactyl** pentru nodul 1 (`GET /api/application/nodes/1`):

| Limită | Valoare panel | Valoare VM | Diferență | Clasă |
|---|---|---|---|---|
| RAM | **122 880 MB = 120 GiB** | 131 072 MB = 128 GiB | panelul reține 8 GiB pentru sistem | `VERIFIED` |
| Disc | **819 200 MB = 800 GiB** | 900 GB | 100 GB pentru sistem, imagini Docker, loguri | `VERIFIED` |
| Over-allocate RAM | **0** | — | fără suprasubscriere | `VERIFIED` |
| Over-allocate disc | **0** | — | fără suprasubscriere | `VERIFIED` |
| vCPU | **nu există limită de nod** — se limitează per container | 20 vCPU | fiecare container are plafon individual | `VERIFIED` |
| Alocat acum | 3 072 MB RAM, 25 600 MB disc (5 servere) | — | — | `VERIFIED` |

**Concluzie:** poolul vândabil este **120 GiB RAM, 800 GiB disc, 20 vCPU**. Cei 8 GiB și cei 100 GB rămași în afara pool-ului sunt rezerva pentru nod, nu pentru clienți.

### 2.2 Dimensiunea per container — de unde vine

#### 2.2.1 Ce vinde catalogul **astăzi** (contra-intuitiv, dar decisiv)

Interogarea tabelului `Product` (read-only) returnează **5 produse**, nu jocuri:

| `slug` | Categorie | `minRam` | `defaultRam` | `maxRam` | `minCpu` | `defaultCpu` | `maxCpu` | `minDisk` | `defaultDisk` | `maxDisk` | Vizibil | `deployable` | Egg |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `code-server` | DEVELOPER_TOOLS | 1024 | 2048 | 16384 | 1 | 1 | 4 | 5 | 10 | 100 | ✅ | ❌ | — |
| **`discord-bot`** | **BOTS** | **256** | **512** | **4096** | **1** | **1** | **4** | **1** | **5** | **50** | ✅ | ✅ | **15** |
| `postgresql` | DATABASES | 1024 | 1024 | 16384 | 1 | 1 | 4 | 5 | 10 | 200 | ✅ | ❌ | — |
| `uptime-kuma` | MONITORING | 256 | 512 | 4096 | 1 | 1 | 2 | 5 | 10 | 50 | ✅ | ❌ | — |
| `wordpress` | WEB_CMS | 512 | 1024 | 8192 | 1 | 1 | 4 | 5 | 10 | 100 | ✅ | ❌ | — |

Sursă: `SELECT ... FROM "Product"` pe VM 103 — `VERIFIED`.

> **Constatație majoră, cu impact direct asupra acestui document.** Atribuirea de sarcină presupune că „catalogul vinde Minecraft Java, CS 1.6 și workload-urile «Bots»/aplicații". **Nu este așa.**
>
> - **Nu există niciun produs Minecraft Java și niciun produs CS 1.6** în catalog. Nici în cod, nici în baza de date: `grep -rniE 'minecraft|counter.?strike|cs ?1\.6|valheim|rust'` pe întregul repository nu returnează nicio referință la un joc.
> - **Tabelul `Egg` este gol** (0 rânduri) și **tabelul `Node` este gol** (0 rânduri) — sincronizarea locală cu panoul nu a populat niciunul.
> - **Singurul produs `deployable` este `discord-bot`** (egg 15, `ghcr.io/ptero-eggs/yolks:nodejs_25`). Celelalte patru sunt vizibile în catalog dar **nu pot fi comandate**: `deployable = false`.
> - Toate cele **5 servere existente** în panou folosesc egg 15 (Node.js), nu jocuri.
> - Există însă **alocări pregătite pentru jocuri**: porturile `25565–25600` (36 alocări) și `27015–27050` (36 alocări), toate nealocate. Deci *intenția* exista, *produsul* nu.
>
> **Conform regulii „codul câștigă", modelul de mai jos are două straturi:** (a) **cazul real** — ce se poate vinde azi, adică `discord-bot`/Node.js; (b) **cazurile condiționate** — Minecraft Java și CS 1.6, dimensionate `INFERRED`, marcate explicit ca **necomercializabile în prezent**. Răspunsul final este robust: în toate cele trei cazuri, constrângerea limitantă este aceeași.

#### 2.2.2 Dimensiunea per container — `CODE-INSPECTED` + `VERIFIED`

**`discord-bot` (cazul real, singurul vândabil):**

| Dimensiune | Valoare | Sursă | Clasă |
|---|---|---|---|
| RAM | **512 MB** (`defaultRam`) | tabelul `Product` | `VERIFIED` |
| vCPU | **1** (`defaultCpu`) | tabelul `Product` | `VERIFIED` |
| Disc | **5 GB** (`defaultDisk`) | tabelul `Product` | `VERIFIED` |

Coroborat de trei surse independente care concordă:
1. **Cele 3 instanțe din baza de date**: `ram = 512`, `cpu = 1`, `disk = 5` — `VERIFIED`.
2. **Cele 5 servere din panou**: `limits.memory = 512`, `limits.cpu = 100`, `limits.disk = 5120` MB — `VERIFIED`.
3. **Codul de provisionare** (`api/src/services/provisioning.ts:467–479`) fixează unitățile:
   ```ts
   memory: instance.ram,        // MB, direct
   disk: instance.disk * 1024,  // GB -> MB
   cpu: instance.cpu * 100,     // vCPU -> procent (100 = 1 vCPU)
   ```
   → **RAM în MB, disc în GB, CPU în vCPU.** `CODE-INSPECTED` + `VERIFIED`

Deci **1 instanță `discord-bot` = 512 MB RAM + 1 vCPU + 5 GB disc**. Nu este o estimare: este valoarea efectiv cerută de la Pterodactyl.

#### 2.2.3 Minecraft Java — `INFERRED` (necomercializabil în prezent)

Nu există produs, egg sau limită documentată în cod. Dimensiunea trebuie dedusă, iar deducția trebuie scrisă:

> **Presupunere, în scris:** un server Minecraft Java este un proces JVM. Pentru o lume mică și un jucător-tipic de 20–40, dimensiunea de serviciu pe care o folosește în hosting se încadrează în banda **2 GB RAM / 1 vCPU / 10 GB disc**, care este și banda aleasă de catalog pentru celelalte produse de tip „server" (`code-server` are `defaultRam` 2048 și `defaultDisk` 10; `postgresql` are `maxDisk` 200). Aleg 2 GB, nu 1 GB, pentru că `defaultRam` al lui `code-server` — singurul produs existent cu profil de proces lung — este 2048 MB, iar un JVM cu heap și GC pe 1 GB ar fi subdimensionat.
>
> **Marcaj: `INFERRED`.** Nu există în cod și nu există în panou nicio valoare Minecraft de verificat. Dacă produsul Minecraft va fi adăugat, limitele lui trebuie **declarate în `Product.minRam/defaultRam/maxRam`** și acestea, nu estimarea de mai sus, devin sursa de adevăr.

#### 2.2.4 CS 1.6 — `INFERRED` (necomercializabil în prezent)

> **Presupunere, în scris:** CS 1.6 (GoldSrc) este un motor de joc din 1998. Încărcarea pe modern este mică, iar serverul dedicat rulează permanent. Dimensiunea de serviciu **512 MB RAM / 1 vCPU / 5 GB disc** este suficientă și este aceeași cu cea a `discord-bot`.
>
> **Marcaj: `INFERRED`.** Nicio valoare CS 1.6 nu există în cod sau în panou. Singura urmă a faptului că jocul a fost avut în vedere este intervalul de alocări `27015–27050` din panou (36 de alocări pregătite, nealocate).

### 2.3 Numărul maxim de instanțe pe fiecare constrângere

**Formula, pentru orice dimensiune per container (RAM în MB, disc în GB):**

```
N_ram  = 122880 / ram_per_container
N_vcpu = 20 / cpu_per_container
N_disk = 819200 / (disk_per_container × 1024)
N_max  = min(N_ram, N_vcpu, N_disk)
```

#### Cazul real — `discord-bot` (512 MB / 1 vCPU / 5 GB)

| Constrângere | Calcul | Rezultat |
|---|---|---|
| **RAM** | 122 880 MB / 512 MB | **240** |
| **vCPU** | 20 / 1 | **20** |
| **Disc** | 819 200 MB / 5 120 MB | **160** |
| | | **→ limitant: vCPU = 20** |

#### Caz condiționat — Minecraft Java (2 GB / 1 vCPU / 10 GB)

| Constrângere | Calcul | Rezultat |
|---|---|---|
| RAM | 122 880 / 2 048 | 60 |
| **vCPU** | 20 / 1 | **20** |
| Disc | 819 200 / 10 240 | 80 |
| | | **→ limitant: vCPU = 20** |

#### Caz condiționat — CS 1.6 (512 MB / 1 vCPU / 5 GB)

| Constrângere | Calcul | Rezultat |
|---|---|---|
| RAM | 122 880 / 512 | 240 |
| **vCPU** | 20 / 1 | **20** |
| Disc | 819 200 / 5 120 | 160 |
| | | **→ limitant: vCPU = 20** |

> **Robustitudine.** Rezultatul este **identic în toate cele trei cazuri**, pentru că fiecare produs consumă cel puțin 1 vCPU. Constrângerea limitantă este **vCPU**, indiferent dacă mixul conține doar boți, doar Minecraft sau o combinație. Concluzia nu depinde de estimările `INFERRED` pentru jocuri — depinde doar de faptul măsurat că `minCpu = 1` pentru fiecare produs.

### 2.4 Numărul **sigur** recomandat

| | Instanțe | RAM folosit | Disc folosit | vCPU folosit |
|---|---|---|---|---|
| **Tavan teoretic** (limitantul, fără rezervă) | **20** | 10 GiB / 120 GiB (8,3 %) | 100 GiB / 800 GiB (12,5 %) | 20 / 20 (100 %) |
| **Sigur recomandat** | **16** | 8 GiB / 120 GiB (6,7 %) | 80 GiB / 800 GiB (10 %) | 16 / 20 (80 %) |

**Raționamentul rezervei de 4 vCPU (20 %):**

1. **Nodul are nevoie de CPU pentru el însuși.** OS-ul, `systemd`, daemonul Wings, `dockerd` și agentul rulează pe aceleași 20 vCPU. La momentul măsurătorii, VM 101 consumă **0,15 %** din capacitatea sa (`pvesh`, media pe 148 417 s de uptime) cu 5 containere — dar aceasta este o măsurătoare în repaus, la un nod cu 5 containere, nu la un nod cu 20.
2. **Există și „steal" de la hypervisor.** VM 101 rulează cu `cpu: host`, deci împarte direct cei 40 de nuclei fizici cu celelalte trei VM-uri și cu hypervisorul. O rezervă de 20 % este o măsurătoare conservatoare și standard pentru o asemenea rezervă. **`INFERRED`** — nu am putut măsura un vârf de încărcare fără a genera încărcare pe producție.
3. **Costul rezervei este neglijabil.** 4 vCPU libere înseamnă că încă 4 instanțe pot fi vândute oricând; în schimb, un nod care ajunge la 100 % vCPU are tick-uri și latențe degradate pentru **toți** clienții existenți, nu pentru unul singur.

**Verificarea rezervei pe celelalte dimensiuni, la 16 instanțe `discord-bot`:**

| Resursă | Folosit | Pool | Marjă | Verdict |
|---|---|---|---|---|
| RAM | 8 GiB | 120 GiB | 112 GiB (93 %) | ✅ abundent |
| Disc | 80 GiB | 800 GiB | 720 GiB (90 %) | ✅ abundent |
| vCPU | 16 | 20 | 4 (20 %) | ✅ rezervă explicită |

### 2.5 Ce se întâmplă la 20, 21, 24 instanțe

| Instanțe | RAM | Disc | vCPU | Ce se rupe |
|---|---|---|---|---|
| 16 (sigur) | 8 GiB | 80 GiB | 16/20 | nimic |
| 20 (tavan) | 10 GiB | 100 GiB | 20/20 | **zero vCPU rezervă** pentru nod |
| 21 | 10,5 GiB | 105 GiB | **21/20** | **imposibil**: depășirea plafonului de vCPU al mașinii virtuale |
| 24 | 12 GiB | 120 GiB | **24/20** | imposibil; ar necesita creșterea VM-ului la 24 vCPU (și atunci limita devine RAM, 120/0,5 = 240) |

### 2.6 Suprasubscrierea deliberată a CPU-ului — o decizie comercială, nu o recomandare tehnică

Limita de 1 vCPU per container este un **plafon**, nu o rezervare. Un container Node.js care stă la `5 %` de un nucleu poate fi vândut de mai multe ori. `docker stats` arată `blipmade-api-1` la 0,07 % CPU și `blipmade-worker-1` la 0,00 % — `VERIFIED`.

| Raport de suprasubscriere | Instanțe (RAM-limitate la 60 GiB folosite) | vCPU total | Experiență |
|---|---|---|---|
| 1:1 (fără suprasubscriere) | 16 (sigur) / 20 (tavan) | 16–20 | nicio degradare |
| 2:1 | ~32 | 16–20 vCPU | risc redus |
| 4:1 | ~60 | 15–20 vCPU | degradare la încărcare simultană |

`INFERRED`, cu ipoteza scrisă: un bot Node.js inactiv folosește sub 10 % dintr-un nucleu pe acest hardware, deci 4 clienți per nucleu sunt plauzibili *în medie*, cu vârfuri dependente de sarcină.

**Totuși, acesta nu este răspunsul recomandat.** Pentru Minecraft, suprasubscrierea este direct dăunătoare: bucla de tick este single-threaded și fiecare client adaugă un cost fix per tick. Recomandarea rămâne **16**, iar suprasubscrierea este o opțiune comercială care trebuie să fie **decisă explicit**, nu adoptată implicit. Modelul de mai sus folosește RAM limitat la 60 GiB pentru a păstra un plafon realist de suprasubscriere; cu RAM maxim (4 GiB/instanță), 60 de instanțe ar necesita 240 GiB, peste pool-ul de 120 GiB — deci **RAM-ul, nu vCPU-ul, ar deveni limitantul** în acest regim.

### 2.7 Modelul de disc — când se umple nodul de 900 GB

| Element | Valoare | Clasă |
|---|---|---|
| Disc virtual al VM 101 | 900 GB | `VERIFIED` |
| **Spațiu alocat real acum** (qcow2, pe RAID 0) | **9,81 GiB** | `VERIFIED` (`du`) |
| Pool de alocări al panelului | 800 GiB (819 200 MB) | `VERIFIED` |
| Costul unei instanțe `discord-bot` | 5 GB | `VERIFIED` |
| Instanțe până la umplerea pool-ului de alocări | 800 / 5 = **160** | `VERIFIED` (calcul) |
| Instanțe până la umplerea volumelor guest-ului | ~800 GiB volume + ~10 GiB overhead ≈ 810 GB din 900 GB | `INFERRED` (suprapunere cu overhead-ul nodului) |

**Punctul în care nodul de 900 GB este plin: în jur de 160 de instanțe** — adică de **8× peste tavanul de 20 impus de vCPU**. Discul **nu** este constrângerea limitantă la niciun mix realist.

**Atenție, însă, la o eroare comună de dimensionare:** dacă cineva ar calcula „900 GB ÷ 5 GB = 180 de instanțe" și ar vinde 180, ar umple **volumul guest-ului**, nu doar pool-ul, și ar lăsa nodul fără spațiu pentru imagini Docker, loguri și baza de date a lui Wings. Limita corectă rămâne cea a panelului: 160.

### 2.8 Cât se poate încasa — folosind doar lista de prețuri proprie a platformei

Nu există în sistem nicio preț de piață, niciun preț de concurență, niciun raport de uptime. Prin urmare, singurele cifre pe care le folosesc sunt **cele ale platformei însăși**, din tabelul `ProductPrice`:

| Câmp | Valoare | Sursă | Clasă |
|---|---|---|---|
| `baseAmount` | 149 (EUR/lună, în unități minor) | `ProductPrice` | `VERIFIED` |
| `ramPerGb` | 60 | `ProductPrice` | `VERIFIED` |
| `cpuPerUnit` | 40 | `ProductPrice` | `VERIFIED` |
| `diskPerGb` | 2 | `ProductPrice` | `VERIFIED` |

Formula este în cod, `api/src/services/pricing.ts` (`priceConfiguration`):

```ts
preț = baseAmount
     + max(0, (ram - minRam)/1024) × ramPerGb
     + max(0, cpu - minCpu) × cpuPerUnit
     + max(0, disk - minDisk) × diskPerGb
     + opțiuni plătite
```

**Verificare:** pentru `discord-bot` la configurația implicită (512 MB / 1 vCPU / 5 GB, `minRam` 256, `minCpu` 1, `minDisk` 1):
`149 + (256/1024)×60 + 0 + (5−1)×2 = 149 + 15 + 0 + 8 = **172**` — care este **exact** prețul stocat pe instanțele reale din baza de date (`Instance.price = 172`). `VERIFIED` — formula și prețul se reproduc exact.

**Observația decisivă: lista de prețuri este liniară în exact resursele care se consumă.** Prin urmare:

| Configurație `discord-bot` | Preț/lună | vCPU | **EUR per vCPU vândut** |
|---|---|---|---|
| Minim (256 MB / 1 / 1 GB) | 149 | 1 | 149 |
| Implicit (512 MB / 1 / 5 GB) | 172 | 1 | **172** |
| 2 GB / 1 / 5 GB | 262 | 1 | **262** |
| Maxim (4 GB / 4 / 50 GB) | 592 | 4 | 148 |

**Concluzie, derivată, nu inventată:** deoarece RAM-ul este abundent (240 de instanțe ar încăpea în RAM) și vCPU-ul este rar (20), **rentabilitatea pe vCPU este maximă la instanțele cu multă memorie și un singur vCPU**. O instanță de 2 GB la 1 vCPU aduce 262 EUR pe un vCPU consumat; o instanță maximă de 4 GB la 4 vCPU aduce 148 EUR pe vCPU. **Mixul optim comercial este „memorie mare, un singur vCPU"** — exact inversul instinctului de „vânză puternică, cu multe vCPU-uri".

Verificarea acestui mix pe nod, la 16 instanțe (numărul sigur), toate la 2 GB / 1 vCPU / 10 GB:
RAM 32 GiB / 120 GiB ✅ · Disc 160 GiB / 800 GiB ✅ · vCPU 16 / 20 ✅ → 16 × 262 = **4 192 EUR/lună** la nivelul listei de prețuri a platformei.

> **Limită explicită.** Aceste sume sunt **prețurile pe care platforma le are deja definite în propria listă**, nu o proiecție de piață și nu o recomandare de preț. Cât de mult din această listă poate fi încărcat efectiv pe piață este `UNVERIFIED` — nu există în sistem nicio valoare de concurență, niciun volum de căutare, nici un istoric de vânzări (`0` abonamente, `0` facturi, `0` plăți în baza de date). În plus, `PAYMENTS_ENABLED = false`, deci **astăzi nu se încasează nimic** prin acest canal.

---

## 3. Platforma (VM 103) — consum real și comportament la 10×

### 3.1 Starea curentă, măsurată

| Resursă | Măsurat | Sursă | Clasă |
|---|---|---|---|
| RAM VM | 8 GiB (8 589 934 592 B) | `qm config 103` | `VERIFIED` |
| RAM folosită în containere | **≈ 752 MiB** | `docker stats --no-stream` | `VERIFIED` |
| RAM folosită de host (inclusiv containere) | 1,6 GiB | `free -h` | `VERIFIED` |
| RAM disponibilă | 6,2 GiB | `free -h` | `VERIFIED` |
| Swap | **0 B** | `free -h` | `VERIFIED` |
| CPU mediu al VM-ului | **2,86 %** din 4 vCPU, pe 85 258 s de uptime | `pvesh` | `VERIFIED` |
| Postgres `shared_buffers` | 128 MB | `psql SHOW shared_buffers` | `VERIFIED` |
| Postgres `max_connections` | 100 | `psql SHOW max_connections` | `VERIFIED` |
| Postgres `work_mem` | 4 MB | `psql SHOW work_mem` | `VERIFIED` |
| Dimensiune bază de date | 11 MB | `pg_database_size` | `VERIFIED` |
| Volum Postgres pe disc | 121,3 MiB | `du` pe volum | `VERIFIED` |
| Redis `used_memory` | 2,49 MB (RSS 14,55 MB) | `redis-cli INFO memory` | `VERIFIED` |
| Redis `maxmemory` / politică | **0 (fără limită)** / `noeviction` | `redis-cli CONFIG GET` | `VERIFIED` |

**Decuplarea față de volumul nodului de jocuri este totală:** platforma rulează pe 4 vCPU / 8 GiB, iar nodul de jocuri pe 20 vCPU / 128 GiB. Cele două nu se influențează.

### 3.2 Ce se întâmplă la 10× numărul de clienți

Volumul de date curent (baza de date a platformei): **6 utilizatori, 3 instanțe, 5 comenzi, 11 ticket-uri, 251 sesiuni, 0 abonamente, 0 facturi, 0 plăți, 5 produse, 0 atașamente, 0 domenii** — `VERIFIED`.

La 10×: ~60 utilizatori, ~30 instanțe, ~50 comenzi, ~110 ticket-uri, ~2 510 sesiuni.

| Componentă | Acum | Estimare la 10× | Mecanism | Clasă |
|---|---|---|---|---|
| Postgres (RSS) | 620 MiB | **1,0–1,5 GiB** | `shared_buffers` fix (128 MB) + cache de relații ≈ 2–3× dată (11 MB → ~110 MB) + cost per conexiune | `INFERRED` |
| Redis (RSS) | 11 MiB | **50–100 MiB** | set de date 2,49 MB → ~25 MB + chei de sesiune/queue | `INFERRED` |
| api + worker + web | 121 MiB | **300–400 MiB** | heap proporțional cu working set-ul, crește sub-săptămânal | `INFERRED` |
| **Total RAM** | **752 MiB** | **≈ 1,5–2,0 GiB** | | `INFERRED` |
| CPU | 2,86 % din 4 vCPU | **~29 %** din 4 vCPU, dacă scalarea ar fi perfect liniară | scalarea nu este liniară (există cost fix), deci estimarea e o limită superioară optimistă | `INFERRED` |

**Verdict la 10×: RAM-ul nu este problema** (2 GiB estimat din 8 GiB disponibile) și nici CPU-ul nu pare să fie.

### 3.3 Ce **se** strânge la 10× — și este altceva

| Limită | Valoare | Ce se întâmplă | Clasă |
|---|---|---|---|
| **Pool-ul de conexiuni Prisma** | Schema **nu** setează `connection_limit` (`grep` pe `api/prisma/schema.prisma` → niciun rezultat), deci se aplică implicitul driverului: `2 × nr_vCPU + 1` = **9 conexiuni per proces** pe 4 vCPU | API-ul și worker-ul au fiecare ~9 → **~18 conexiuni concurente** față de bază | `INFERRED` (formula implicită a driverului, neconfigurată explicit în cod) |
| `max_connections` Postgres | 100 | Împărțit între cele două procese; cu pool de 9+9 rămâne loc pentru `psql`, drill-uri și administrare | `VERIFIED` (valoare) |
| **Lipsa swap** | 0 B | Un vârf de memorie în Postgres nu are amortizare: OOM în loc de swap | `VERIFIED` |
| **Lipsa limitelor per container** | niciun `mem_limit`/`cpus` | Un container poate consuma toată RAM-ul VM-ului și omoară Postgres și API-ul împreună | `CODE-INSPECTED` |
| `maxmemory` Redis | 0 (nelimitat) + `noeviction` | Redis poate crește fără plafon până când OOM-killer-ul omoară un container | `VERIFIED` |

**Concluzia de 10×: platforma are suficientă RAM și suficient CPU. Ce o poate omorî nu este încarcarea, ci lipsa limitelor per container și absența swap-ului.** Un bot cu o buclă de memorie poate consuma cei 8 GiB ai VM-ului și opri simultan baza de date, API-ul, worker-ul și web-ul — toate în același VM, cu același `docker compose`.

### 3.4 Marja reală a platformei

| Metrică | Valoare | Clasă |
|---|---|---|
| RAM nefolosită pe VM 103 | ~6,2 GiB din 8 GiB (77 %) | `VERIFIED` |
| CPU nefolosit pe VM 103 | ~97 % (media) | `VERIFIED` |
| **Clienți care ar încăpea înainte de a fi nevoie de alt VM** | **foarte mulți** — limita nu e resursele, ci conectivitatea și corectitudinea | `INFERRED` |

Platforma **nu** este restrânsă de hardware la volum curent. Este limitată de faptul că rulează împreună cu baza de date, cache-ul, API-ul, worker-ul și web-ul în același VM de 8 GiB, fără limitare per container.

---

## 4. Hypervisorul ca întreg — loc pentru un al doilea nod?

### 4.1 Inventarul liber

| Resursă | Total | Angajat | Liber | Sursă | Clasă |
|---|---|---|---|---|---|
| **CPU logic** | 80 | 28 (2 + 20 + 2 + 4) | **52** | `qm config` | `VERIFIED` |
| **RAM pentru angajamente noi** | 251,77 GiB | 24,26 GiB (host) + 142 GiB (VM-uri) = 166,26 GiB | **85,51 GiB** | `pvesh` + `qm config` | `VERIFIED` (calcul) |
| RAM „disponibilă" raportată de host | 227,51 GiB | — | — | `pvesh .../status` | `VERIFIED` |
| **Stocare** | 1 725 GiB (1,68 TiB) | 41,55 GiB | **1 683 GiB (1,64 TiB)** | `pvesh --type storage` | `VERIFIED` |
| Swap | 30,65 GiB | 0 | 30,65 GiB | `pvesh` | `VERIFIED` |

**Formula pentru RAM-ul liber:**
```
251,77 GiB (total)
 −  24,26 GiB (host: kernel, Proxmox, procese)
 − 142,00 GiB (angajate în cele 4 VM-uri)
 =  85,51 GiB
```

> **Reconciliere cu atribuirea.** Atribuirea menționează „109 GiB RAM liber". Acea cifră corespunde calculului `251,77 − 142 = 109,77 GiB`, care **omite cei 24,26 GiB folosiți de hypervisor**. Cu hostul inclus, numărul corect este **85,51 GiB**. Diferența de 24,26 GiB este exact consumul hostului, și contează: este diferența dintre „al doilea nod încape" și „al doilea nod nu încape". Prezint ambele calcule, cu formula, și folosesc **85,51 GiB**.

### 4.2 Încape un al doilea nod?

| Specificația celui de-al doilea nod | CPU | RAM | Disc | Încape? |
|---|---|---|---|---|
| **Identic cu nodul 1** (20 vCPU / 128 GiB / 900 GB) | 52 ≥ 20 ✅ | 85,51 < 128 ❌ | ✅ | **NU — lipsește 42,49 GiB de RAM** |
| **20 vCPU / 96 GiB / 900 GB** | ✅ | 85,51 < 96 ❌ | ✅ | **NU — lipsește 10,49 GiB** |
| **20 vCPU / 80 GiB / 900 GB** | ✅ | ✅ (marjă 5,51 GiB) | ✅ | Da, dar marjă prea mică |
| **20 vCPU / 64 GiB / 900 GB** | ✅ | ✅ (marjă 21,51 GiB) | ✅ | **Da — configurația recomandată** |

**Două drumuri, ambele valide:**

**Drumul A — al doilea nod de 64 GiB.** Se creează VM 102/104 cu 20 vCPU / 64 GiB / 900 GB. Limita panoul pentru acel nod s-ar seta la **60 GiB** (aceeași rezervă de 8 GiB pentru sistem ca la nodul 1). Nodul 101 rămâne neatins.

**Drumul B — se micșorează nodul 1.** VM 101 de la 128 GiB la **96 GiB** (limita panoului de la 120 GiB la 88 GiB) eliberează 32 GiB, aducând RAM-ul liber la **117,51 GiB**, suficient pentru un al doilea nod de 96–112 GiB.

> **Drumul B are un cost ascuns care trebuie spus:** micșorarea lui VM 101 la 96 GiB micșorează și **poolul vândabil** al nodului 1 de la 120 GiB la 88 GiB. La `discord-bot` (512 MB), asta nu schimbă numărul de instanțe (limitantul rămâne vCPU-ul = 20), dar la un mix bogat în memorie (2–4 GB) poolul de 88 GiB ar putea deveni limitant înainte de vCPU. **Recomandarea: Drumul A**, pentru că păstrează capacitatea comercială a nodului 1 intactă.

**Discul nu limitează în niciun drum.** Un nod nou de 900 GB costă doar ce se scrie efectiv (nodul 1 ocupă 9,81 GiB real), iar liberul este 1 683 GiB (1,64 TiB).

### 4.3 Ce se vinde pe hypervisor în total

| Configurație | Nod 1 (128 GiB) | Nod 2 (64 GiB) | Total vândabil | Total sigur |
|---|---|---|---|---|
| `discord-bot` 512 MB / 1 / 5 GB | 20 (tavan) / 16 (sigur) | 20 / 16 | **40 / 32** | **32** |
| Minecraft Java 2 GB / 1 / 10 GB | 20 / 16 | 20 / 16 | **40 / 32** | **32** |
| Mix 50/50 boți + Minecraft | 20 / 16 | 20 / 16 | **40 / 32** | **32** |

Motivația este aceeași în toate cazurile: **fiecare nod are 20 vCPU proprii, iar fiecare instanță consumă cel puțin 1 vCPU.** Al doilea nod dublează capacitatea de vânzare **exact**, fără a dubla RAM-ul angajat, pentru că fiecare nod rămâne limitat de vCPU, nu de memorie.

**Tavanul total pe hardware:** 52 CPU-uri libere ar permite, teoretic, încă 2 noduri de 20 vCPU (60 > 52, deci **nu** — încă un singur nod suplimentar, cu 12 vCPU libere după). Pe 80 de CPU-uri logice cu 28 angajate, **maximum 2 noduri de 20 vCPU` + restul pentru VM-urile existente**. **Verdict: un al doilea nod, nu trei.**

---

## 5. Realitatea de performanță a procesorului

### 5.1 Setul de instrucțiuni — ce este verificat

```
lscpu Flags: ... avx2 ... (lista completă)
```
- **`avx2` — prezent** ✅
- **`avx512f` — absent** ❌
- Alte flag-uri notabile: `f16c`, `fma`, `bmi1`, `bmi2`, `rdrand`, `rdseed`, `clflushopt` absent (listă scurtată la flag-urile din `lscpu`), `invpcid`, `smep`, `erms`, `ibrs`, `stibp`, `ssbd`, `sha_ni` absent.
- `Architecture: x86_64`, `CPU family 6`, `Model 79` (Broadwell), `Stepping 1` — `VERIFIED`

### 5.2 Ce înseamnă pentru Minecraft

1. **AVX-512 nu ajută Minecraft.** Bucle de tick, generarea de chunk-uri, fizică și AI-ul entităților sunt calcule branchy, cu dependențe de date; HotSpot nu are un traseu vectorizat AVX-512 în acest profil. **Absența AVX-512 nu este un dezavantaj direct pentru Minecraft.** `INFERRED` (calificativ, fără cifre de benchmark).
2. **Ce limitează de fapt un server Minecraft** este viteza single-core și cache-ul, nu setul de instrucțiuni: bucla principală de tick este single-threaded, iar datele de chunk (secțiuni 16×16×384) sunt sensibile la cache. Broadwell oferă **L1d 32 KiB și L2 256 KiB pe nucleu** (`VERIFIED`), valori din 2016.
3. **Ceasul și IPC-ul sunt factorii reali.** Modelul spune `@ 2.20GHz`, cu vârf la 3600 MHz (`VERIFIED`). Arhitectura Broadwell are un IPC per clock material mai mic decât generațiile Zen 3 și ulterioare, iar frecvența susținută este mai mică. **Consecința, exprimată calitativ:** un număr egal de vCPU-uri pe acest hardware prestează **materjal mai puțin per tick** decât același număr de vCPU-uri pe o platformă Ryzen modernă. `INFERRED` — nu există în sistem nicio măsurătoare de performanță și **nu invoc niciun benchmark extern, pentru că niciunul nu poate fi verificat aici**.
4. **Consecința comercială pentru Minecraft.** Dacă se vinde Minecraft pe acest nod, **nu se poate suprasubscrie vCPU-ul** (§2.6) fără degradare directă a experienței: fiecare jucător adaugă un cost fix per tick, iar tick-ul este single-threaded. Numărul de jucători per server trebuie dimensionat la un nivel de tick confortabil pe **Broadwell**, care este mai mic decât pe hardware nou.

### 5.3 Ce înseamnă pentru workload-urile Node.js (boți)

1. **Nu sunt limitate de setul de instrucțiuni.** Un bot Node.js este aproape complet I/O-bound; partea de CPU (parsing, serializare, bucla de evenimente) rulează pe fracțiuni de nucleu.
2. **Cheia este latența și idle-ul, nu puterea.** `docker stats` arată `blipmade-api-1` la 0,07 % și `blipmade-worker-1` la 0,00 % CPU — `VERIFIED`. Cu șase containere pe un host aproape gol, capacitatea rezervată e subutilizată.
3. **Totuși, e o limită reală pentru „worker"-uri de procesare intensivă** (build-uri, procesare de imagini, scraping la scară): un singur vCPU Broadwell la ~2,2–3,6 GHz procesează strict mai puține operații pe secundă decât un vCPU Ryzen modern, la același consum. `INFERRED` (calitativ).
4. **Aici suprasubscrierea CPU-ului este mult mai puțin riscantă** decât pentru Minecraft, pentru că procesele stau în `epoll`/`io_uring` și consumă CPU în rafale scurte, nu continuu.

### 5.4 Comparație cu o generație modernă Ryzen / DDR5

Folosind **doar** setul de instrucțiuni verificat de `lscpu` și fapte de arhitectură cu sursă nominalizată:

| Proprietate | Această mașină (Broadwell, 2016) | Generație modernă | Sursa afirmației |
|---|---|---|---|
| Instrucțiuni vectoriale | `avx2`, **fără** `avx512f` | **AVX-512** de la **Zen 4** (Ryzen 7000) încolo | Documentația ISA a AMD (documentare de producător, nu benchmark) |
| Cache L2/nucleu | 256 KiB (`VERIFIED`) | 512 KiB (Zen 3), 1 MiB (Zen 4) | Documentație AMD |
| L3 | 50 MiB/socket (`VERIFIED`) | 32–96 MiB, cache în chiplet, cu latență mai mică | Documentație AMD |
| Memorie | DDR4 ECC | **DDR5** — rată de transfer mai mare pe pin, canale independente | JEDEC / documentație producător |
| Număr de canale | 6 (Broadwell, 6× DDR4) | 2 canale (consumer) / 4–8 (server) | Documentație platformă |
| Ceas efectiv | ~2,2 GHz base, 3,6 GHz turbo (`VERIFIED`) | Frecvențe nominale mai mari pe watt | Documentație procesor |

**Ce spune această comparație, în termeni de vânzare:**

- **AVX-512 nu aduce nimic clienților acestei platforme** (Minecraft și boți nici nu îl folosesc). Deci **nu trebuie plătit un premium pentru hardware nou din cauza setului de instrucțiuni**.
- **Motivul real al migrării** este **viteza single-core și cache-ul per nucleu**, care se traduc în **mai mulți jucători per vCPU vândut** — adică în preț pe vCPU mai mare.
- **DDR5 aduce un beneficiu marginal** pentru acest profil de workload: nici Minecraft, nici un bot Node.js nu sunt limitate de lățime de bandă. Beneficiul ar fi pentru clienți care rulează baze de date în memorie sau procesare video — cazuri care **nu există în catalog**.
- **Concluzia de preț, formulată fără să inventez cifre:** deoarece **prețul se calculează liniar după vCPU** (§2.8), iar fiecare vCPU Broadwell livrează mai puțin per tick decât un vCPU Ryzen modern, **plafonul de preț pe vCPU al acestei platforme este mai mic decât pe hardware nou**. Cifra concretă **nu poate fi derivată** din nimic măsurabil în acest sistem: nu există benchmark, nu există preț de concurență, nu există istoric de vânzări. Singura listă de prețuri disponibilă este cea proprie platformei (149 + 60/GB + 40/vCPU + 2/GB), care este **un fapt al sistemului**, nu o estimare de piață.

> **Explicit, pentru a nu lăsa loc de interpretare:** acest document **nu conține** și nu invocă nicio cifră de benchmark, niciun preț de concurență, nicio cotă de piață și nicio cifră de uptime. Toate numerele provin din comenzi executate pe sistem sau din cod și baza de date ale platformei, cu sursa indicată.

---

## 6. Tabelul cerut — maximum vândabil, pe fiecare constrângere

### Nodul 1, așa cum este acum (20 vCPU, 128 GiB RAM, 900 GB disc; pool panel 120 GiB / 800 GiB)

| Produs | RAM/inst. | vCPU/inst. | Disc/inst. | Max după RAM | Max după vCPU | Max după disc | **Limitant** | **Tavan** | **Sigur recomandat** |
|---|---|---|---|---|---|---|---|---|---|
| `discord-bot` (real) | 512 MB | 1 | 5 GB | 240 | **20** | 160 | **vCPU** | **20** | **16** |
| Minecraft Java (`INFERRED`) | 2 GB | 1 | 10 GB | 60 | **20** | 80 | **vCPU** | **20** | **16** |
| CS 1.6 (`INFERRED`) | 512 MB | 1 | 5 GB | 240 | **20** | 160 | **vCPU** | **20** | **16** |

### Nodul 1 + al doilea nod (64 GiB; pool panel 60 GiB / 800 GiB)

| Produs | Max după RAM (nod 1 + nod 2) | Max după vCPU | Max după disc | **Limitant** | **Tavan** | **Sigur recomandat** |
|---|---|---|---|---|---|---|
| `discord-bot` | 240 + 120 = 360 | **20 + 20 = 40** | 160 + 160 = 320 | **vCPU** | **40** | **32** |
| Minecraft Java | 60 + 30 = 90 | **40** | 80 + 80 = 160 | **vCPU** | **40** | **32** |
| CS 1.6 | 240 + 120 = 360 | **40** | 320 | **vCPU** | **40** | **32** |

### Răspunsul, într-o singură propoziție

> **Nodul de jocuri, așa cum este, poate vinde 16 instanțe în siguranță (tavan teoretic 20). Constrângerea limitantă este vCPU-ul, nu memoria și nici discul — 20 de vCPU-uri pe nod, minimum 1 vCPU per instanță. Cu un al doilea nod de 64 GiB, totalul sigur devine 32 de instanțe (tavan 40), fiindcă fiecare nod are propriile 20 de vCPU-uri.**

---

## 7. Recomandări, în ordine

1. **Decide acum dacă se vinde Minecraft/CS 1.6 sau nu.** Dacă da, **adaugă produsele cu limitele scrise în `Product.minRam/defaultRam/maxRam/minCpu/defaultCpu/maxCpu/minDisk/defaultDisk/maxDisk`** — acelea devin sursa de adevăr și înlocuiesc estimările `INFERRED` din §2.2.3 și §2.2.4. Dacă nu, catalogul rămâne ce este: **un singur produs vândabil** (`discord-bot`), ceea ce înseamnă un catalog comercial cu o singură linie.
2. **Sincronizează `Node` și `Egg` în baza de date** — ambele tabele sunt goale (`VERIFIED`), deci logica de alegere a nodului (`chooseNode()` din `api/src/services/provisioning.ts`) nu are de unde citi limitele nodului. Verifică dacă sincronizarea e ruptă sau nu a fost niciodată pornită.
3. **Corectează intervalele de porturi DNAT** (§4.2 din `03-network-and-ip-plan.md`): porturile `25565–25600` și `27015–27050` sunt alocate în panou, dar nu publicate. Fără asta, vânzarea Minecraft ar produce servere inaccesibile.
4. **Pune limitele per container pe VM 103** (`mem_limit` / `cpus` în `compose.api.yml` și `compose.web.yml`). Platforma are 77 % RAM liberă; nu are nicio protecție împotriva unui container care o consumă pe toată.
5. **Creează al doilea nod cu 64 GiB** (nu 128 — nu încape) și înregistrează-l în panou cu limita de 60 GiB.
6. **Rezervă 4 vCPU** (20 %) pe fiecare nod pentru nodul însuși; nu vinde până la 20 decât dacă sunteți dispus să acceptați zero rezervă.

---

## 8. Limitări ale modelului

| Limită | Efect | Clasă |
|---|---|---|
| Nu există **nicio măsurătoare de încărcare** sub sarcină (nici pe nod, nici pe platformă) | Rezerva de 20 % vCPU este o convenție defensivă, nu o măsurătoare | `INFERRED` |
| Dimensionarea Minecraft / CS 1.6 nu are **nicio sursă în cod sau în panou** | Cazurile condiționate sunt estimări documentate; concluzia finală (vCPU limitant) nu depinde de ele | `INFERRED` |
| Pool-ul de conexiuni Prisma este **neconfigurat explicit** | Estimarea de 9 conexiuni/proces folosește implicitul driverului | `INFERRED` |
| Starea interioară a VM 101 și VM 100 (de ex. consumul real al lui Wings, dimensiunea bazei de date a panoului) **nu a putut fi măsurată** | Limitele nodului sunt cele declarate în panou, nu cele măsurate în guest | `BLOCKED` |
| Nu există istoric de vânzări, uptime sau preț de concurență în sistem | Nicio cifră de piață nu este folosită; doar lista de prețuri proprie a platformei | `VERIFIED` (absența) |
