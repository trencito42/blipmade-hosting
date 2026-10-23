# 03 — Infrastructura: ce rulează efectiv

**Data auditării:** 2026-10-23 · **Hypervisor:** `n7030e1` (Proxmox VE 9.2.21) · **Metodă:** inspecție read-only prin `qm config`, `pvesh`, `pvesm`, `/proc/mdstat`, `ss`, `iptables`, `docker` și SSH pe VM 102 și VM 103.

Clasele de verificare folosite mai jos sunt cele din `00-BRIEFING.md`:
`VERIFIED` · `CODE-INSPECTED` · `DOCUMENTED-ONLY` · `INFERRED` · `UNVERIFIED` · `BLOCKED` · `NOT-IMPLEMENTED`.

Niciun secret nu este reprodus în acest document. Pentru fiecare valoare sensibilă se indică **locația și tipul**, nu valoarea.

---

## 1. Hypervisorul

### 1.1 CPU și memorie

| Proprietate | Valoare | Sursă |
|---|---|---|
| Model | `Intel(R) Xeon(R) CPU E5-2698 v4 @ 2.20GHz` | `lscpu`, `pvesh get /nodes/n7030e1/status` → `cpuinfo.model` — `VERIFIED` |
| Topologie | 2 socket-uri × 20 nuclee × 2 thread-uri = **40 nuclee fizice / 80 CPU logice** | `lscpu` (`Core(s) per socket: 20`, `Socket(s): 2`, `Thread(s) per core: 2`) — `VERIFIED` |
| NUMA | 2 noduri (0 = CPU-urile pare, 1 = impare), L3 = 100 MiB (2 × 50 MiB) | `lscpu` — `VERIFIED` |
| Frecvență | `cpuinfo_max_freq` 3600000 kHz, `scaling_cur_freq` la momentul măsurătorii 1200182 kHz | `/sys/devices/system/cpu/cpu0/cpufreq/` — `VERIFIED` |
| Set de instrucțiuni | `avx2` prezent; **`avx512f` absent** | `lscpu` `Flags:` — `VERIFIED` |
| RAM total | 270 334 566 400 B = **251,77 GiB** | `pvesh .../status` → `memory.total`; `free -b` — `VERIFIED` |
| RAM folosit de host | 26 047 713 280 B = 24,26 GiB | `pvesh .../status` → `memory.used` — `VERIFIED` |
| RAM disponibil | 244 286 853 120 B = 227,51 GiB | `pvesh .../status` → `memory.available` — `VERIFIED` |
| Swap | 30,65 GiB, **utilizare 0 B** | `pvesh .../status` → `swap` — `VERIFIED` |
| Load | 1,35 / 1,22 / 1,04 | `pvesh .../status` → `loadavg` — `VERIFIED` |

> **Observație de reconciliere cu briefing-ul.** `00-BRIEFING.md` §2 spune „1.8 GHz base", iar atribuția de sarcină repetă „1.8 GHz base". `lscpu` și Proxmox nu raportează 1.8 GHz: numele modelului spune `@ 2.20GHz`, frecvența maximă este 3600 MHz, iar frecvența curentă observată a fost 1200 MHz (stare C-state). Nu există în sistem un raport care să confirme „1.8 GHz base". Conform regulii „codul câștigă", raportul folosește **modelul măsurat** (`@ 2.20GHz`, max 3.6 GHz, min observat 1.2 GHz) și marchează cifra „1.8 GHz base" din briefing ca **neconfirmată** — `UNVERIFIED`. Diferența nu schimbă nicio concluzie din acest audit: Broadwell rămâne o platformă Broadwell, fără AVX-512.

### 1.2 Stocare și RAID

```
md0 : active raid0 sdb2[1] sda2[0]   2 095 104 blocks  -> /boot  (ext4, 2,0 GiB, 247 MiB folosit)
md1 : active raid0 sdb3[1] sda3[0]   1 837 789 184 blocks -> /      (root, 1,7 TiB, 42 GiB folosit)
md2 : active raid0 sda4[0] sdb4[1]   32 137 216 blocks  -> swap     (30,65 GiB, 0 folosit)
```
Sursă: `cat /proc/mdstat` și `mdadm --detail /dev/mdN` — `VERIFIED`.

**Toate cele trei tablouri md sunt `raid0`.** Nu există niciun tablou cu redundanță pe întreaga mașină. `mdadm --detail /dev/md1` confirmă `Raid Level : raid0`, `Consistency Policy : none`, `State : clean`.

> **Constație cu briefing-ul — și o corecție în briefing.** `00-BRIEFING.md` §2 descrie `md2` drept `raid1 sda4+sdb4 ... (not separately mounted at audit time)`. Realitatea măsurată: `md2` este **`raid0`**, nu `raid1`, și **este montat** — este chiar **swap-ul** sistemului (UUID `7131919c-ee16-49ea-8856-3e00e3655609`, identic cu linia `UUID=7131919c-... none swap sw 0 0` din `/etc/fstab`; `free -h` confirmă „Swap: 30Gi"). `md1` (root) este tot RAID 0. Concluzia briefing-ului („nu există redundanță pe tabloul care ține fiecare disc de VM și fiecare fișier de bază de date") **rămâne corectă**, dar descrierea lui `md2` este greșită și trebuie corectată în briefing.

Toate partițiile provin de pe două discuri identice: `Samsung MZ7L3960HCJR-00A07`, 894,3 GB, etichetate `rescue-jessie` în `blkid` — `VERIFIED`.

### 1.3 Stocarea Proxmox

| Proprietate | Valoare | Sursă |
|---|---|---|
| Definiție | `dir: local`, `path /var/lib/vz`, `content rootdir,vztmpl,iso,backup,images,snippets`, `format qcow2` | `cat /etc/pve/storage.cfg` — `VERIFIED` |
| Politică de păstrare | `prune-backups keep-all=1` | `cat /etc/pve/storage.cfg` — `VERIFIED` |
| Total | 1 852 161 003 520 B = 1 725 GiB (1,68 TiB) | `pvesh get /cluster/resources --type storage` — `VERIFIED` |
| Folosit | 44 612 452 352 B = 41,55 GiB (2,41 %) | idem; `pvesm status` — `VERIFIED` |

`prune-backups keep-all=1` înseamnă „**nu șterge niciodată** backup-urile". Nu înseamnă că ceva se copiază. Vezi §7.

---

## 2. Cele patru mașini virtuale

Sursă: `qm config <vmid>` și `pvesh get /cluster/resources --type vm --output-format json` — `VERIFIED`.

| VM | Nume | vCPU | RAM | Disk | Agent gazdă | `onboot` | CPU mediu | RAM folosit |
|---|---|---|---|---|---|---|---|---|
| 100 | `debian13-test` | 2 | 4 GiB | 40 GB | `enabled=1`, **nu rulează** | **absent** | 0,79 % | 0,95 GiB |
| 101 | `games-node-01` | **20** | **128 GiB** | **900 GB** | `enabled=1`, **nu rulează** | `1` | 0,15 % | 4,34 GiB |
| 102 | `blipmade-proxy` | 2 | 2 GiB | 20 GB | **neconfigurat** | `1` | 1,53 % | 0,69 GiB |
| 103 | `blipmade-platform` | 4 | 8 GiB | 80 GB | `enabled=1`, **rulează** | `1` | 2,86 % | 5,09 GiB |

Toate patru sunt pe `vmbr1` = `10.77.0.1/24`, cu `cpu: host` (passthrough hardware, fără emulare) și `scsihw: virtio-scsi-single` + `iothread=1` pe VM 100/101/103. VM 102 nu are `iothread` pe disc.

**Total angajat:** 142 GiB RAM, 28 din 80 CPU-uri logice, 1 038 GiB de disc virtual (40 + 900 + 20 + 80), din care doar **32,81 GiB sunt alocați efectiv** pe RAID 0.

Toate cele patru sunt `status: running` cu uptime între 85 258 s (VM 103) și 148 417 s (VM 101) — `VERIFIED`.

### 2.1 Consumul real de disc (nu spațiul virtual)

| Fișier | Virtual | Real alocat pe RAID 0 |
|---|---|---|
| `vm-101-disk-0.qcow2` | 900 GB | **9,81 GiB** |
| `vm-103-disk-0.qcow2` | 80 GB | 19,46 GiB |
| `vm-100-disk-0.qcow2` | 40 GB | 2,14 GiB |
| `vm-102-disk-0.qcow2` | 20 GB | 1,39 GiB |
| **Total** | **1 038 GiB** | **32,81 GiB** |

Sursă: `du --apparent-size` vs `du` pe `/var/lib/vz/images/*/` — `VERIFIED`. Consecință: alocarea unui al doilea nod de 900 GB costă doar ce se scrie efectiv, nu 900 GB de spațiu.

---

## 3. VM 103 — platforma Blipmade (5 containere)

`docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps` — `VERIFIED`:

```
NAME                  SERVICE    STATUS                 PORTS
blipmade-api-1        api        Up 10 hours (healthy)   127.0.0.1:3100->3100/tcp
blipmade-postgres-1   postgres   Up 21 hours (healthy)   127.0.0.1:5432->5432/tcp
blipmade-redis-1      redis      Up 21 hours (healthy)   127.0.0.1:6379->6379/tcp
blipmade-web-1        web        Up 9 hours (healthy)    10.77.0.13:3000->3000/tcp
blipmade-worker-1     worker     Up 10 hours (healthy)   3100/tcp
```

### 3.1 Politica de restart, health check și limite per container

Toate valorile sunt din `compose.yml`, `compose.api.yml`, `compose.web.yml` — `CODE-INSPECTED`; starea este `VERIFIED` prin `docker compose ps`.

| Service | Imagine | `restart` | Health check | `start_period` / `interval` / `timeout` / `retries` | `cap_drop` | `security_opt` | Port public |
|---|---|---|---|---|---|---|---|
| `postgres` | `postgres:17-alpine` | `unless-stopped` | `pg_isready -U blipmade -d blipmade` | 10 s / 5 s / 5 s | — | — | `127.0.0.1:5432` |
| `redis` | `redis:7-alpine` | `unless-stopped` | `redis-cli ping` | 10 s / 5 s / 5 s | — | — | `127.0.0.1:6379` |
| `api` | build `./api` | `unless-stopped` | `wget -qO- http://127.0.0.1:3100/health` | 30 s / 30 s / 5 s / 3 | `ALL` | `no-new-privileges:true` | `127.0.0.1:3100` |
| `worker` | build `./api` | `unless-stopped` | `wget -qO- http://127.0.0.1:3101/health` | 20 s / 30 s / 5 s / 3 | `ALL` | `no-new-privileges:true` | niciunul (expus intern) |
| `web` | build `./web` | `unless-stopped` | `wget -qO- http://127.0.0.1:3000/healthz` | 15 s / 30 s / 5 s / 3 | `ALL` | `no-new-privileges:true` | `10.77.0.13:3000` |

Constatări:

- **Nu există limită de resurse (`mem_limit`, `cpus`) pe niciun container.** Containerele pot consuma până la limita VM-ului. `docker stats` arată `MEM USAGE / LIMIT = ... / 7.762GiB` — limita afișată este cea a mașinii virtuale, nu o rezervare per container — `VERIFIED`.
- **API-ul și worker-ul au health check pe porturi diferite.** API-ul ascultă pe `3100`, worker-ul pe `3101`; health check-ul worker-ului verifică `127.0.0.1:3101/health` — `CODE-INSPECTED` (`compose.api.yml`). Worker-ul **nu expune niciun port** în `compose.api.yml`; commentariul din fișier confirmă intenția („the worker does not serve the API").
- **Bind-urile de pe VM 103 sunt corecte ca intenție**: Postgres, Redis și API sunt legate la `127.0.0.1` (nu accesibile din `10.77.0.0/24`); doar `web` ascultă pe `10.77.0.13:3000`, adică pe interfața internă — `VERIFIED` prin `ss -tlnp` pe VM 103 și prin regulile `nft` Docker (`ip daddr 10.77.0.13 ... tcp dport 3000 ... dnat to 172.18.0.6:3000`).
- **Ordinea de pornire** este asigurată: `api` și `worker` au `depends_on: postgres/redis` cu `condition: service_healthy`; `web` depinde de `api` — `CODE-INSPECTED`.
- `restart: unless-stopped` înseamnă că un container oprit manual **nu se relansează** după un restart al mașinii. Pentru o platformă comercială, `always` este de obicei alegerea corectă. **Nu am schimbat nimic** (audit read-only); este o **constatație**.

### 3.2 Consum real măsurat

`docker stats --no-stream` — `VERIFIED`:

| Container | CPU % | RAM folosit | Rețea | PIDs |
|---|---|---|---|---|
| `blipmade-postgres-1` | 4,05 % | 620,1 MiB | 52,8 MB / 65,9 MB | 18 |
| `blipmade-api-1` | 0,07 % | 55,44 MiB | 12,4 MB / 12,5 MB | 17 |
| `blipmade-worker-1` | 0,00 % | 44,27 MiB | 4,22 MB / 14,6 MB | 16 |
| `blipmade-web-1` | 0,01 % | 21,64 MiB | 8,62 MB / 12,6 MB | 11 |
| `blipmade-redis-1` | 0,94 % | 10,96 MiB | 29,3 MB / 8,22 MB | 6 |
| **Total containere** | — | **≈ 752 MiB** | — | — |

`free -h` pe VM 103: `total 7,8 GiB · used 1,6 GiB · free 2,5 GiB · available 6,2 GiB`, **swap 0 B** — `VERIFIED`.

Starea bazelor de date:
- Postgres: `pg_database_size = 11 MB`, `shared_buffers = 128MB`, `work_mem = 4MB`, `max_connections = 100` — `VERIFIED`.
- Redis: `used_memory = 2,49 MB`, `maxmemory = 0` (fără limită), `maxmemory-policy = noeviction`, `appendonly yes` — `VERIFIED`.
- Volumul `blipmade_postgres_data` ocupă 121,3 MiB pe disc, `blipmade_redis_data` 2,3 MiB, `blipmade_upload_data` 8,0 KiB (gol), `blipmade_backup_data` conține **doar spool-ul de e-mail** (26 fișiere `.json`) — `VERIFIED`.

### 3.3 Secretele

Fișierul `.env` de pe VM 103 conține 29 variabile, incluzând `POSTGRES_PASSWORD`, `SESSION_SECRET`, `PTERODACTYL_APP_KEY`, `PTERODACTYL_CLIENT_KEY`, `PANEL_KEYMINT_SECRET`, `BLIPMADE_INTERNAL_API_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_ENROLLMENT_KEY`, `CADDY_ADMIN_TOKEN`, `DATABASE_URL`, `STRIPE_SECRET_KEY`. **Valorile nu au fost citate sau afișate.** Localizare și tip raportate, așa cum cere regula 3 din briefing.

`.env` este în `.gitignore` (linia 1) și `git check-ignore -v .env` confirmă că **nu este urmărit de git** — `VERIFIED`. Vezi `03-disaster-recovery.md` pentru consecința de recuperare.

---

## 4. VM 102 — gateway-ul (Caddy)

| Proprietate | Valoare | Sursă |
|---|---|---|
| OS | Debian GNU/Linux 13 (trixie) | `cat /etc/os-release` — `VERIFIED` |
| Caddy | **2.6.2-12+deb13u1** (pachetul Debian) | `caddy version`, `dpkg -l caddy` — `VERIFIED` |
| Unit systemd | `caddy.service`, `enabled`, `active (running)` | `systemctl status caddy` — `VERIFIED` |
| Socketuri | `*:80`, `*:443`, `127.0.0.1:2019` (API admin) | `ss -tlnp` — `VERIFIED` |
| RAM | 29,1 MiB (vârf 33,5 MiB), CPU cumulat 45,026 s | `systemctl status caddy` — `VERIFIED` |

### 4.1 Configurația Caddy — citată integral

`/etc/caddy/Caddyfile` (169 B, modificat 2026-10-23 01:23) — `VERIFIED`:

```caddyfile
test.apps.blipmade.com {
	encode zstd gzip

	reverse_proxy 10.77.0.11:30001
}

blipmade.com, www.blipmade.com {
    encode zstd gzip
    reverse_proxy 10.77.0.13:3000
}
```

Concluzii din configurația reală:

- **Sunt două site-uri, nu unul.** `blipmade.com` și `www.blipmade.com` merg către `10.77.0.13:3000` (containerul `web` de pe VM 103), `test.apps.blipmade.com` merge către `10.77.0.11:30001` (noda Wings).
- **Nu există niciun `tls`, `header`, `handle` sau `route` în Caddyfile.** TLS automat este folosit implicit de Caddy 2.6.2; certificatelele Let's Encrypt există local pentru `blipmade.com`, `www.blipmade.com` și `test.apps.blipmade.com` (`/var/lib/caddy/.local/share/caddy/certificates/acme-v02.api.letsencrypt.org-directory/`) — `VERIFIED`.
- **Nu există restricție de origine (origin shield).** Caddy ascultă pe `*:80` și `*:443`, deci răspunde la orice `Host` validat de ACME — `VERIFIED`.
- **`test.apps.blipmade.com` este rupt în acest moment.** Caddy returnează **502** pentru că `10.77.0.11:30001` refuză conexiunea. În ultimele 3 h, Caddy a înregistrat **29 de cereri, toate cu `status 502`, toate cu `host: test.apps.blipmade.com`** — `journalctl -u caddy` — `VERIFIED`.
- Fișierele istorice `/etc/caddy/Caddyfile.backup` (Caddyfile de bază cu `:80 { file_server }`) și `/etc/caddy/Caddyfile.before-blipmade` (doar `test.apps.blipmade.com`) arată că singura modificare a fost adăugarea blocului `blipmade.com` — `VERIFIED`.

### 4.2 Caddy 2.6.2 — notă de întreținere

Versiunea este din pachetul Debian 13. Caddy 2.6.2 a fost lansată în 2022 și nu primește patch-uri de la Debian (`unattended-upgrades` actualizează pachetul Debian, nu pachetul upstream). API-ul de administrare Caddy (`127.0.0.1:2019`) este activ și **ascultat doar pe loopback** — `VERIFIED`. Modulul de rute al aplicației (`api/src/services/gateway.ts`) folosește acel API cu token de administrator, un server Caddy dedicat numit `blipmade` și prefixul de id `blipmade-route-`, pe intervalul de porturi `TARGET_PORT_MIN = 30000` … `TARGET_PORT_MAX = 39999` — `CODE-INSPECTED`.

---

## 5. VM 101 — nodul de jocuri (Pterodactyl Wings)

Nodul **nu este accesibil prin SSH** de către agent (nicio cheie, agentul gazdă nu rulează). Datele de mai jos provin din API-ul de aplicație al panelului Pterodactyl (`GET /api/application/nodes/1`), accesat read-only cu cheia de aplicație deja prezentă pe VM 103 — `VERIFIED`.

| Proprietate | Valoare |
|---|---|
| Nume | `games-node-01` |
| Descriere | `Blipmade - Bots & Game Hosting` |
| UUID | `28ea643b-919d-40cb-a420-3868305cc2af` |
| FQDN | `node1.blipmade.com` |
| Port daemon | `8080` (HTTPS), SFTP `2022` |
| Baza volumelor | `/var/lib/pterodactyl/volumes` |
| Limită RAM nod | **122 880 MB = 120 GiB** |
| Over-allocate RAM | **0** |
| Limită disc nod | **819 200 MB = 800 GiB** |
| Over-allocate disc | **0** |
| Resurse alocate acum | RAM 3 072 MB, disc 25 600 MB |
| `behind_proxy` | **false** |
| `maintenance_mode` | false |

**Verificare independentă din exterior:** `https://10.77.0.11:8080/` răspunde `{"error":"The required authorization heads were not present in the request."}` pe HTTPS și „Client sent an HTTP request to an HTTPS server" pe HTTP — deci rulează **Wings** pe HTTPS — `VERIFIED`.

### 5.1 Serverele existente pe nod

`GET /api/application/servers` — `VERIFIED`. Există **5 servere**, toate pe nodul 1, **toate cu egg 15** (`ghcr.io/ptero-eggs/yolks:nodejs_25`), toate cu limitele `memory 512` (unul 1024), `disk 5120`, `cpu 100` (= 1 vCPU):

| ID | Nume | Alocare | RAM | vCPU | Disc | Imagine |
|---|---|---|---|---|---|---|
| 8 | `Blipmade Port Test` | 73 | 1024 MB | 1 | 5120 MB | `yolks:nodejs_25` |
| 10 | `Discord Bot` | 74 | 512 MB | 1 | 5120 MB | `yolks:nodejs_25` |
| 11 | `Discord Bot` | 75 | 512 MB | 1 | 5120 MB | `yolks:nodejs_25` |
| 14 | `Browser instance` | 76 | 512 MB | 1 | 5120 MB | `yolks:nodejs_25` |
| 15 | `Browser instance` | 77 | 512 MB | 1 | 5120 MB | `yolks:nodejs_25` |

**`feature_limits.backups = 0` pentru toate cele 5 servere** — funcția de backup a lui Pterodactyl este dezactivată la nivel de server. Nu există niciun backup de instanță în panou — `VERIFIED`.

### 5.2 Alocările de porturi

`GET /api/application/nodes/1/allocations` — **173 alocări**, toate pe IP-ul privat `10.77.0.11`:

| ID-uri | Porturi | Stare |
|---|---|---|
| 1–36 | `25565`–`25600` | **nealocate** (interval Minecraft) |
| 37–72 | `27015`–`27050` | **nealocate** (interval Source/CS) |
| 73–173 | `30000`–`30100` | 5 alocate (73–77, serverele de mai sus), restul libere |

> **Constatație critică pentru planul de rețea.** Intervalele de porturi pregătite pentru jocuri (`25565–25600`, `27015–27050`) **nu se află în intervalul `30000:39999`** care este singurul publicat prin DNAT pe `193.34.214.87` (vezi `03-network-and-ip-plan.md` §2). Un server Minecraft pus pe alocarea implicită (portul 25565) **nu ar fi accesibil din internet**. Intervale pregătite, nepublicate.

---

## 6. VM 100 — panoul Pterodactyl

Nodul **nu este accesibil prin SSH** de către agent. Ce se poate afirma:

| Proprietate | Valoare | Sursă |
|---|---|---|
| Rol | Panoul Pterodactyl (interfața de administrare a lui Pterodactyl) | `00-BRIEFING.md` §1; confirmat de API — `VERIFIED` |
| Serviciu web | **nginx** în fața aplicației Laravel | `curl -I https://10.77.0.10/` → `Server: nginx`, `Set-Cookie: XSRF-TOKEN`, `pterodactyl_session` — `VERIFIED` |
| Porturi | 80 (HTTP) și 443 (HTTPS) deschise pe `10.77.0.10` | sondaj TCP — `VERIFIED` |
| Adresă publică | `panel.blipmade.com` → `193.34.214.86` | `dig +short` — `VERIFIED` |

**`BLOCKED` — de ce nu putem afirma mai mult:** agentul nu are cheie SSH pentru `10.77.0.10` și agentul gazdă QEMU nu rulează (`qm agent 100 ping` → „QEMU guest agent is not running"), deci nu există nici execuție în mașina virtuală, nici snapshot, nici citire a fișierelor. Nu putem verifica: versiunea panelului, starea bazei de date a panelului, dimensiunea acesteia, dacă panoul are backup programat, ce servicii rulează, dacă `p:backup:db` a fost folosit. **Pasul de deblocare sigur:** instalarea și pornirea `qemu-guest-agent` în VM 100 (necesită un restart al serviciului `qemu-guest-agent` în guest — modificare de producție, deci **nu** a fost făcută în acest audit) sau furnizarea unei chei SSH de citire pentru `debian@10.77.0.10`.

---

## 7. Puncte unice de eșec (SPOF)

| # | Componentă | Ce se întrerupe dacă pica | Evidență | Clasă |
|---|---|---|---|---|
| SP1 | **RAID 0 pe root** (`md1`, ambele SSD-uri) | **Tot**: toate cele patru discuri de VM, toate bazele de date, tot codul, tot secretele | `/proc/mdstat` → `md1 : active raid0 sdb3[1] sda3[0]` | `VERIFIED` |
| SP2 | **Hypervisorul însuși** | Tot. Nu există al doilea host, nu există HA (`/etc/pve/ha/` gol, `replication.cfg` gol) | `ls /etc/pve/ha/`, `cat /etc/pve/replication.cfg` → gol | `VERIFIED` |
| SP3 | **VM 103** (platforma) | Site, API, autentificare, comenzi, facturare, ticket-uri | `qm config 103` | `VERIFIED` |
| SP4 | **VM 100** (panoul) | Administrarea Pterodactyl: noduri, alocări, servere, utilizatori, ouă | `qm config 100` | `VERIFIED` |
| SP5 | **VM 101** (nodul Wings) | **Toate instanțele clienților**, fișierele lor, bazele lor de date | `qm config 101` | `VERIFIED` |
| SP6 | **VM 102** (Caddy) | TLS și tot traficul HTTP/HTTPS prin Cloudflare | `qm config 102` | `VERIFIED` |
| SP7 | **Postgres pe VM 103** | API-ul, worker-ul de provisionare, autentificarea | `compose.yml`; `depends_on ... condition: service_healthy` | `VERIFIED` |
| SP8 | **Redis pe VM 103** | Cache-ul, coada de provisionare, sesiunile | `compose.yml` | `VERIFIED` |
| SP9 | **DNS Cloudflare** | Toate numele publice | `dig +short blipmade.com NS` → `cartman.ns.cloudflare.com`, `nucum.ns.cloudflare.com` | `VERIFIED` |
| SP10 | **Cheia partajată a aplicației (`SESSION_SECRET`)** | **Toate sesiunile** — rotația deconectează fiecare client | `docs/RUNBOOK.md` §8 | `DOCUMENTED-ONLY` |
| SP11 | **Baza de date a panoului Pterodactyl (VM 100)** | Panoul, inclusiv maparea alocărilor și egg-urile | `BLOCKED` — VM 100 inaccesibil | `BLOCKED` |

Niciun SPOF din listă nu are o replică sau o copie externă. Detalii în `03-disaster-recovery.md`.

---

## 8. Postura firewall

### 8.1 Hypervisorul — firewall **dezactivat**

```
$ pve-firewall status
Status: disabled/running
```
`cat /etc/pve/cluster/firewall` → *No such file or directory*. `cat /etc/pve/nodes/n7030e1/host/firewall` → *No such file or directory*. `nft list ruleset` → **gol**. `iptables --version` → **v1.8.11 (legacy)**, iar `update-alternatives` arată că `iptables-legacy` este backend-ul activ. — toate `VERIFIED`.

> **Corecție a briefing-ului.** `00-BRIEFING.md` §4 spune că „rulesetul firewall-ului Proxmox este gol (digest da39a3e… = configurăție goală)". Realitatea măsurată este **mai severă**: serviciul `pve-firewall` este în starea `disabled`, deci **nu există niciun filtru** pe hypervisor. Un ruleset gol ar fi respingut implicit (`DROP`); aici nu există deloc filtru. Diferența nu este de grad, este de natură.

Filtrele de firewall efectiv active pe hypervisor sunt **doar cele scrise manual** în `iptables-legacy`:

```
filter/FORWARD: policy ACCEPT
  -A FORWARD -d 10.77.0.11/32 -i eth0 -o vmbr1 -p udp --dport 30000:39999 -j ACCEPT
  -A FORWARD -d 10.77.0.11/32 -i eth0 -o vmbr1 -p tcp --dport 30000:39999 -j ACCEPT
filter/INPUT:   policy ACCEPT
filter/OUTPUT:  policy ACCEPT
```

Cu alte cuvinte: **orice pachet care ajunge pe `eth0` și orice pachet între VM-uri este acceptat.** Cele două reguli `FORWARD` sunt redundante (politica este deja `ACCEPT`); ele documentează intenția, nu restricția.

### 8.2 VM 102 (gateway)

`sudo -n iptables -S` → `-P INPUT ACCEPT / -P FORWARD ACCEPT / -P OUTPUT ACCEPT`, fără nicio regulă suplimentară. `nft` și `ufw` **nu sunt instalate**. → **VM 102 nu are firewall.** — `VERIFIED`

### 8.3 VM 103 (platforma)

`sudo -n iptables -S` → `-P INPUT ACCEPT`, `-P FORWARD DROP` (cu lanțurile `DOCKER-*` generate de Docker). `nft list ruleset` conține doar tabelele create de Docker (`ip nat` cu `DOCKER`, `PREROUTING`, `OUTPUT`, `POSTROUTING` și `ip filter` cu lanțurile bridge). `ufw` nu este instalat. → **VM 103 nu are firewall de gazdă**; singurele reguli sunt cele generate de Docker. — `VERIFIED`

### 8.4 VM 101 și VM 100

`BLOCKED` — ambele sunt inaccesibile agentului. Din exterior: VM 101 expune `8080` (Wings) și `2022` (SFTP) pe `10.77.0.11`, ambele DNAT-uite pe `193.34.214.87`; VM 100 expune `80`/`443` pe `10.77.0.10`, DNAT-uite pe `193.34.214.86`. **Ambele servicii de administrare sunt publicate pe internet**, fără restricție de sursă vizibilă.

---

## 9. Postura de backup

### 9.1 Ce este configurat

| Element | Stare | Sursă |
|---|---|---|
| Țintă de backup Proxmox | **Nu există.** `pvesh get /cluster/backup` → `[]` | `VERIFIED` |
| `vzdump.cron` | **Fără nicio linie de job** (doar `PATH=`) | `VERIFIED` |
| `/var/lib/vz/dump/` | **Gol** — nu a existat niciodată un dump | `VERIFIED` |
| Cron pe host | `crontab -l` → *no crontab for root*; `/etc/cron.d/` conține doar `e2scrub_all` și `zfsutils-linux` | `VERIFIED` |
| Timer systemd pentru backup | **Nu există** (`systemctl list-timers` → doar `tmpfiles-clean`, `dpkg-db-backup`, `logrotate`, `apt-daily*`, `pve-daily-update`, `e2scrub_all`, `fstrim`) | `VERIFIED` |
| `prune-backups keep-all=1` | Present, dar **inert**: păstrează la nesfârșit ceea ce nu scrie nimeni | `VERIFIED` |

**Concluzie: pe hypervisor nu se scrie niciun backup. Nu există backup-uri ale mașinilor virtuale.** `vzdump` a fost verificat și nu are niciun job; nu există `vzdump` în cron sau timer.

### 9.2 Ce scrie într-adevăr backup-uri

Instrumentele există în cod: `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`, `scripts/backup-offsite.sh` (toate prezente pe mirror și pe VM 103, toate în `git ls-files`) — `CODE-INSPECTED`.

`backup.sh` face `pg_dump --format=custom` + arhivă de configurație (fără `.env`) + `sha256sum` + retenție locală `BACKUP_KEEP_DAYS` (implicit 14) și, **doar dacă `OFFSITE_TARGET` este setat**, trimite o copie criptată prin `backup-offsite.sh`. Altfel tipărie explicit: *„OFFSITE_TARGET is not set, so the copy stayed on this host. The host uses RAID 0."*

Starea efectivă:
- `OFFSITE_TARGET` → **neconfigurat**; `OFFSITE_TRANSPORT` → neconfigurat; `OFFSITE_ENCRYPTION_KEY` → neconfigurat — `VERIFIED` (valorile citite din `.env` de pe VM 103 ca „<unset/empty>"; nicio valoare afișată).
- Artefacte existente: `/var/backups/blipmade/blipmade-drill-20261022T212029Z.tar.gz` (+`.sha256`) și `blipmade-drill-20261022T232117Z.tar.gz` (+`.sha256`), ambele din **2026-10-22**, ambele **pe același RAID 0** — `VERIFIED`.
- **Niciun backup nu este programat.** Nu există cron, nu există timer, `crontab` nu este nici măcar instalat pe VM 103. Cele două arhive sunt resturi de drill, nu o serie programată.
- Workflow-ul `.github/workflows/nightly-backup-drill.yml` rulează zilnic la 03:17 UTC, dar **împotriva unei baze de date PostgreSQL de unică utilizare, creată de runnerul GitHub Actions**, și scrie în `/tmp/backups` al runnerului. **Nu atinge baza de date deployată și nu creează nicio copie a datelor de producție.** — `CODE-INSPECTED` (citirea integrală a fișierului).

### 9.3 Backup-uri per instanță (Pterodactyl)

Funcția există în cod (`api/src/services/panel/operations.ts` → `backups`, `createBackup`, `downloadBackup`, `restoreBackup`, `deleteBackup`, `api/src/services/pterodactyl/client.ts` → `listBackups`, `createBackup`, `deleteBackup`, `downloadBackup`, `restoreBackup`) — `CODE-INSPECTED`. Dar **`feature_limits.backups = 0` pe toate cele 5 servere** din panou, deci funcția este **inactivă**: nu există backup-uri per instanță — `VERIFIED`.

### 9.4 Concluzie

**Nu există o singură copie a datelor de client în afara tabloului RAID 0.** Vezi `03-disaster-recovery.md` §3 pentru lista exactă.

---

## 10. RAID 0 — este recunoscut în runbook-uri?

**Da, în trei documente, dar nu ca procedură operațională.**

| Document | Linie | Ce spune | Clasă |
|---|---|---|---|
| `docs/RUNBOOK.md` | 485 | „The host uses RAID 0. A copy that stays on the host is not a backup, and a restore drill against the local archive does not prove that the off-site copy is readable." — în secțiunea **„9. The off-host restore, before go-live"** | `CODE-INSPECTED` |
| `docs/PRODUCTION_READINESS.md` | 102 | „### 5. The backups stay on a RAID 0 host — **operator**" — listat ca **blocaj de lansare** cu acțiunea „Configure `OFFSITE_TARGET` and `OFFSITE_ENCRYPTION_KEY`, then repeat the restore drill against the off-host copy." | `CODE-INSPECTED` |
| `docs/IMPLEMENTATION_STATUS.md` | 290 | `OFFSITE_TARGET` — „Off-host backups. The host uses **RAID 0**. A local copy is not a backup." | `CODE-INSPECTED` |
| `docs/AUDIT_REMEDIATION.md` | 317–328 | „BM-AUD-013 — The backups only lived on RAID 0", stare **Partial**, cu `backup-offsite.sh` scris dar țintă neconfigurată | `CODE-INSPECTED` |

**Constatație.** Riscul RAID 0 **este** recunoscut, dar numai ca problemă de *backup*. Niciun document nu treată raid0-ul ca atare — nici măcar cu avertismentul că **înlocuirea unui singur SSD pierde tot**, cu excepția faptului că `PRODUCTION_READINESS.md` îl numește blocaj. Nu există în runbook nicio procedură de **recuperare după pierderea unui disc**, pentru că nu poate exista: nu există copie. `docs/PRODUCTION_READINESS.md` §5 confirmă că blocajul este **cunoscut și nerezolvat**.

---

## 11. Agenții gazdă lipsă

| VM | `agent` în `qm config` | `qm agent <vmid> ping` | Consecință | Clasă |
|---|---|---|---|---|
| 100 | `agent: enabled=1` | **„QEMU guest agent is not running"** | Fără `qm shutdown` curat, fără `qm agent <id> exec`, fără citirea IP-ului din interior | `VERIFIED` |
| 101 | `agent: enabled=1` | **„QEMU guest agent is not running"** | La fel | `VERIFIED` |
| 102 | **nicio linie `agent:`** | **„No QEMU guest agent configured"** | Nu e o eroare: agentul nu a fost activat deloc pe VM 102 | `VERIFIED` |
| 103 | `agent: enabled=1` | **fără ieșire = succes** | Controlul funcționează | `VERIFIED` |

Două aspecte:

1. **VM 100 și VM 101 au agentul *configurat* dar nu *rulat*.** `qm agent 100 ping` și `qm agent 101 ping` eșuează, deci serviciul `qemu-guest-agent` nu rulează în interiorul celor două mașini. Proxmox raportează totuși `agent: 1` în `status/current`, ceea ce poate induce în eroare: statusul este un counter, nu o confirmare a funcționării.
2. **VM 102 nu are agent deloc.** `qm config 102` nu conține `agent:`, deci agentul nu a fost activat. VM 102 rulează de 26 de ore și are Caddy în prim plan; lipsa agentului înseamnă că oprirea ei va fi o oprire bruscă, fără handshake.

Consecința operațională directă: **cele două componente care conțin datele clienților (VM 101 și panoul din VM 100) nu pot fi oprite curat și nu pot fi inspectate de la exterior**, ceea ce îngreunează și recuperarea după incident.

---

## 12. Audit `onboot`

| VM | `onboot` | Verdict |
|---|---|---|
| 100 `debian13-test` (panoul) | **absent din `qm config`** | ❌ **Nu pornește după un restart al hypervisorului** |
| 101 `games-node-01` (noda Wings) | `onboot: 1` | ✅ Pornește |
| 102 `blipmade-proxy` (Caddy) | `onboot: 1` | ✅ Pornește |
| 103 `blipmade-platform` | `onboot: 1` | ✅ Pornește |

`onboot` lipsește **doar** pentru VM 100 — `qm config 100` nu conține cheia `onboot` (nu `onboot: 0`, ci **deloc**, deci valoarea implicită Proxmox = 0) — `VERIFIED`.

**Severitate.** VM 100 găzduiește **panoul Pterodactyl**. Dacă hypervisorul se repornește (actualizare de pachete, reboot de urgență, incident), panoul nu revine. API-ul Blipmade continuă să funcționeze (are bridge-ul propriu), dar:

- operatorul nu mai poate crea servere, nu mai poate aloca porturi, nu mai poate crea ouă și nu mai poate accesa interfața de administrare;
- provisionarea de instanțe noi va eșua, iar `chooseNode()` din `api/src/services/provisioning.ts` nu va găsi niciun nod;
- clientul nu mai are unde să vadă consola și fișierele.

O `qm set 100 --onboot 1` ar rezolva; **nu a fost făcut**, fiind o modificare de producție.

---

## 13. Sumarul constatărilor

| # | Constatație | Clasă | Gravitate |
|---|---|---|---|
| F-01 | Root filesystem-ul este RAID 0 pe ambele SSD-uri; pierderea unui disc pierde tot | `VERIFIED` | **Critică** |
| F-02 | Nu există nicio țintă de backup: `pvesh /cluster/backup` → `[]`, `/var/lib/vz/dump/` gol, `vzdump.cron` fără joburi | `VERIFIED` | **Critică** |
| F-03 | `pve-firewall` este **disabled** pe hypervisor; INPUT/FORWARD/OUTPUT = ACCEPT | `VERIFIED` | **Critică** |
| F-04 | VM 100 (panoul) nu are `onboot` — nu revine după un restart al hypervisorului | `VERIFIED` | **Înaltă** |
| F-05 | `OFFSITE_TARGET` neconfigurat → nicio copie în afara RAID 0 | `VERIFIED` | **Înaltă** |
| F-06 | Niciun backup nu este programat (fără cron, fără timer); cele două arhive sunt resturi de drill | `VERIFIED` | **Înaltă** |
| F-07 | Backup-ul Pterodactyl dezactivat per server (`feature_limits.backups = 0`) | `VERIFIED` | **Înaltă** |
| F-08 | VM 100 și VM 101: agent gazdă configurat dar **nu rulează**; VM 102: agent neconfigurat | `VERIFIED` | **Medie** |
| F-09 | Nicio limită de resurse per container pe VM 103 | `CODE-INSPECTED` | **Medie** |
| F-10 | Niciun firewall pe VM 102 și VM 103 | `VERIFIED` | **Medie** |
| F-11 | Porturile de joc `25565–25600` / `27015–27050` sunt alocate în panou, dar **nu sunt publicate** prin DNAT | `VERIFIED` | **Medie** |
| F-12 | `test.apps.blipmade.com` returnează 502 pentru toate cererile | `VERIFIED` | **Medie** |
| F-13 | `restart: unless-stopped` — un container oprit manual nu revine după restart | `CODE-INSPECTED` | **Medie** |
| F-14 | Caddy 2.6.2 (pachet Debian 2022), fără restricție de origine | `VERIFIED` | **Medie** |
| F-15 | `md2` este RAID 0, nu RAID 1 — **corecție a briefing-ului**; este swap-ul, nu „nesmontat" | `VERIFIED` | **Informativă** |
| F-16 | Briefing-ul afirmă „1.8 GHz base"; `lscpu`/Proxmox raportează `@ 2.20GHz`, max 3600 MHz, min observat 1200 MHz | `VERIFIED` | **Informativă** |
| F-17 | `.env` cu toate secretele există într-un singur fișier, neacoperit de git, pe același RAID 0 | `VERIFIED` | **Înaltă** |
| F-18 | Caddy servește doar `Host`-uri valide; cererile fără SNI cunoscut eșuează la handshake | `VERIFIED` | **Informativă** |
| F-19 | Baza de date a panoului Pterodactyl (VM 100) nu poate fi verificată | `BLOCKED` | **Medie** |

---

## 14. Note de metodă și limite

- Auditul a fost strict read-only pe producție: `qm config`, `pvesh`, `pvesm`, `cat /proc/mdstat`, `mdadm --detail`, `ss`, `iptables -S` / `iptables -t nat -S`, `nft list ruleset`, `tcpdump` (doar citire, fișiere `.pcap` în `/tmp`), `docker stats`/`docker compose ps`, `curl`/`nc` (doar cereri), API-ul de aplicație al Pterodactyl (`GET` exclusiv).
- **O singură scriere accidentală a fost făcută și anulată:** la inspectarea volumelor Docker a fost trasă imaginea `alpine:latest` pe VM 103, care nu exista. A fost eliminată imediat (`docker rmi alpine:latest` → „Deleted"), iar lista finală de imagini a fost reverificată: `blipmade-web:latest, blipmade-worker:latest, blipmade-api:latest, postgres:17-alpine, redis:7-alpine` — identică cu cea de la începutul auditului. Nicio modificare de configurație, nicio oprire, nicio repunere, nicio scriere în baza de date.
- Fișierele pcap de diagnostic au fost temporare, în `/tmp` pe hypervisor, și au fost **șterse după folosire**; nu conțineau date de clienți (doar trafic public de scaner și trafic Cloudflare).
- Limită structurală: **VM 100 și VM 101 nu pot fi inspectate din interior.** Toate afirmațiile despre ele se bazează pe interogarea read-only a API-ului de aplicație al Pterodactyl, pe interogări TCP/HTTP din exterior și pe `qm config`/`qm agent ping`. Marcajele `BLOCKED` din document indică exact ce nu a putut fi verificat.
