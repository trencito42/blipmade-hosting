# INFRA-P1 — Infrastructură, configurare de securitate și recuperare

**Faza:** 6 (post-remediere) · **Data auditului:** 2026-10-23 / 2026-10-24 (UTC) · **Raport scris:** 2026-10-23
**Commit auditat:** `main` @ `2e1e78a` („Keep the audit tooling away from the production database")
**Gazda inspectată:** `blipmade-platform` (VM 103, Proxmox 9.2.21, KVM, Debian 13.7 trixie, kernel 6.12.113+deb13, 4 vCPU, 8192 MB RAM)
**Topologie:** o singură VM de platformă în spatele unui gateway de margine; Cloudflare în fața gateway-ului.

---

## 1. Metadate: ce am inspectat, ce am rulat, ce nu am putut accesa

### 1.1 Ce am inspectat **doar în citire**

| Suprafață | Metodă | Ce s-a citit |
|---|---|---|
| VM 103 (platforma) | `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13` + `sudo -n` pentru inspecție | `/etc/os-release`, `apt-get -s upgrade` (simulare, fără modificare), `lsblk`, `/proc/mdstat`, `/proc/swaps`, `free`, `/proc/pressure/*`, `dmesg`, `journalctl -k`, `ss -lntp`, `iptables -S`, `nft list ruleset`, `docker ps/info/images/inspect/stats/history`, `systemctl list-timers/status/cat`, `journalctl -u blipmade-backup.service`, `psql -c "SHOW ..."`, `redis-cli CONFIG GET`, `tar -tzvf` pe arhivă, `sha256sum --check` |
| Hipervisorul Proxmox (rulează de pe el spațiul de lucru: `10.77.0.1`, `vmbr1`) | `ss -lntp`, `iptables -S`, `iptables -t nat -L PREROUTING -n -v`, `/proc/mdstat`, `lsblk`, `cat /etc/pve/storage.cfg`, `qm config 100/101/102/103`, `qm list`, `pvesm status`, `pveversion` | Structura de stocare a hipervisorului, regulile NAT, lista de listeneri publici |
| Edge-ul public | `openssl s_client` (doar handshake TLS), `curl -I` (doar anteturi), `dig` | Versiuni TLS, cipher, valabilitatea certificatului, anteturi HTTP, lanțul DNS |
| Codul sursă | `api/src/services/queue.ts`, `api/src/worker.ts`, `api/src/services/provisioning.ts`, `api/src/routes/health.ts`, `api/src/plugins/errorHandler.ts`, `api/src/app.ts`, `api/src/env.ts`, `web/server.mjs`, `web/src/lib/client-address.mjs`, `scripts/*.sh`, `scripts/systemd/*` | Comportamentul cozilor, al worker-ului, al endpointurilor de sănătate, al logării, al backup-ului |

### 1.2 Ce am rulat ca **experiment controlat** (un singurul, deliberat)

1. **Drill-ul de restaurare** (`scripts/restore-drill.sh`) pe VM 103: a creat baza de scratch `blipmade_restore_check`, a restaurat arhiva cea mai recentă în ea, a comparat cu baza vie și a șters baza de scratch. **Nu a scris niciodată în baza `blipmade`.** Contorizările de rânduri înainte/după sunt identice (User=3, Session=42, Order=4, Ticket=1, AuditLog=561, Instance=0).
2. **Sonde de rețea** din exteriorul VM-ului (de pe hipervisor, `10.77.0.1`): `timeout 3 bash -c "echo > /dev/tcp/<ip>/<port>"` pe o listă fixă de porturi, plus un `curl` de citire prin gateway-ul de la margine (`GET /` și `GET /api/health`, fără autentificare, fără endpoint de scriere).

Nu am repornit, oprit, recreat sau reconfigurat niciun container, serviciu, unit systemd, firewall sau bază de date. Nu am scris în baza `blipmade`. Nu am făcut niciun deploy. Nu am accesat `https://blipmade.com` cu credențiale și nu am exercitat niciun endpoint de scriere.

### 1.3 Ce **nu** am putut accesa (limite declarate)

| Limită | Ce se pierde |
|---|---|
| **Gateway-ul de margine `10.77.0.12` (VM 102)** — fără cheie SSH (`Permission denied (publickey)`) | Configurația Caddy/nginx: timeout-uri, keep-alive, dimensiuni de buffer, modul în care se construiește `X-Forwarded-For`, certificate manager, HSTS, buffering, rate limiting |
| **Contul Cloudflare** | Zona DNS, setările de origin, certificate mode, WAF, rate limiting, cache |
| **Contul Proxmox / consolă PVE** | Politicile de backup ale hipervisorului, storage-ul replicat (dacă există), configurația HA |
| **`10.77.0.10` (panoul Pterodactyl) și `10.77.0.11` (nodul de joc)** | Configurația panelului, a lui Wings, a reverse-proxy-ului panelului |
| **Starea anterioară a mașinii** | Jurnalul nu acoperă decât un singur boot (`Thu 2026-10-22 16:48` → acum); nu există istoric de OOM sau de incidente mai vechi |
| **Cloudflare → origin** | Am observat comportamentul de la margine, dar nu am măsurat latența, cache-ul sau WAF-ul |

### 1.4 Fapte stabilite înaintea acestei faze (confirmate, nu re-derivate)

- Timerul `blipmade-backup.timer` **este instalat, activat și programat**; a rulat o dată cu succes (`ExecStart` și `ExecStartPost` au ieșit `0/SUCCESS`), producând `/var/backups/blipmade/blipmade-scheduled-20261024T001409Z.tar.gz` + `.sha256`. `OFFSITE_TARGET` **nu este setat** → nicio copie nu părăsește hostul. **Nu este încă un backup.**
- **Nu există nicio cheie `OFFSITE_*` în `/opt/blipmade/.env`** (verificat: `grep -E "^OFFSITE_"` → zero rezultate).
- Datele de producție au fost curățate; rămân 3 utilizatori, 42 sesiuni, 4 comenzi, 1 bilet, 561 rânduri de audit-log, 0 instanțe.
- Producția a fost deployată din `main` @ `2e1e78a`; migrarea `20261024110000_session_last_seen` a fost aplicată. **Verificat independent:** arborele `api/src`, `web/src`, `web/server.mjs` și `api/prisma` este identic între `2e1e78a` și `HEAD` (`git rev-parse 2e1e78a:api/src` = `git rev-parse HEAD:api/src` = `6558e42f…`); commitul `29a6b28` adaugă doar documente de audit și **nu** a fost folosit la build (imaginile au fost create la `00:12:02`, commitul e la `00:18:43`).

---

## 2. Metodologie și standardul de dovadă

- **Standardul de dovadă:** fiecare afirmație din acest raport este însoțită de comanda exactă și de ieșirea relevantă, sau de `fișier:linie`. Nu există afirmații doar narrative.
- **Severități:** `P0` = platforma nu poate fi vândută sau nu poate fi recuperată în siguranță; `Critical` = pierdere de date sau expunere de administrare; `High` = incident în producție plauzibil și cu impact; `Medium` = degradare reală a observabilității/controlului; `Low` = igienă și coerență; `Low-Info` = constatare pozitivă sau de interes.
- **Distincția esențială** între *observat* și *inferat*: când o cauză se află într-un strat inaccesibil (gateway, Cloudflare, Proxmox), raportul spune explicit **„observat"** și **„cauza este în stratul inaccesibil"**, fără să invente mecanismul.
- **Regula secretelor:** nu s-a copiat niciun secret în acest raport. Pentru `.env` s-a raportat doar **starea** variabilelor (`SET` / `EMPTY` / absent) și numai valorile de rețea ne-confidențiale (`TRUSTED_PROXY_IPS`, `PTERODACTYL_URL`, `DOMAIN_TARGET`, `APP_ORIGIN`, `PANEL_NODE_ADDRESSES`).
- **Revalidare independentă a constatărilor anterioare:** `INF-01` (RAID 0) a fost verificată **la nivelul hipervisorului** și s-a confirmat, dar **mecanismul real diferă** de cel descris (vezi `INFRA-P1-02`). `INF-02` / `DR-02` (copie off-host) s-au confirmat: `OFFSITE_TARGET` lipsește, logul arată explicit mesajul de avertizare.

---

## 3. Topologia reală și limitele de încredere

```
                          INTERNET (public)
                                 │
        ┌────────────────────────┴────────────────────────┐
        │                                                 │
  193.34.214.20 (+ /32: .86 .87 .143)              Cloudflare (188.114.97.3)
  Proxmox host 9.2.21                                NS: cartman/nucum.ns.cloudflare.com
  eth0 = 193.34.214.20/24 + 3 alias-uri /32
        │                                                 │
        │  nat/PREROUTING DNAT (INPUT ACCEPT, FORWARD ACCEPT)   │ origin: 193.34.214.143
        │  ├─ .143:80/443  ──► 10.77.0.12:80/443   (edge)       │
        │  ├─ .86:80/443   ──► 10.77.0.10:80/443   (panou)      │
        │  └─ .87:80/8080/2022/30001 + 30000:39999 ──► 10.77.0.11 (nod)
        │                                                 │
  ══════╪═════════════════ TRUST BOUNDARY 1 ═══════════╪══════
  Hipervisor: 22, 111, 8006, 3128 ascultă pe 0.0.0.0 / ::   │
        │                                                 │
   ┌────┴─────────────────────────────────────────────┐  │
   │  vmbr1  10.77.0.0/24                             │  │
   │                                                 │  │
   │  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │  │
   │  │ 10.77.0.12   │  │ 10.77.0.10   │  │10.77.0.11│ │  │
   │  │ VM102 proxy  │  │ VM100 panel  │  │VM101 node│ │  │
   │  │ TLS term.    │  │ Pterodactyl  │  │Wings:8080│ │  │
   │  │ LE cert      │  │ LE cert      │  │games     │ │  │
   │  │ 2019 închis  │  │              │  │          │ │  │
   │  └──────┬───────┘  └──────┬───────┘  └─────────┘ │  │
   │         │  HTTP/HTTPS     │                     │  │
   │  ═══════╪═════════════════╪═════════════════════╪══╪═
   │  TRUST BOUNDARY 2 (LAN / segmentul intern)        │  │
   │         │                 │                     │  │
   │  ┌──────▼─────────────────▼──────────────────────▼┐ │
   │  │ VM 103  blipmade-platform  10.77.0.13          │ │
   │  │                                               │ │
   │  │  docker compose (compose.yml + .api + .web)    │ │
   │  │  ┌──────────────────────────────────────────┐  │ │
   │  │  │ br-375c6f6b5497  172.18.0.0/16          │  │ │
   │  │  │                                          │  │ │
   │  │  │  postgres:17-alpine   127.0.0.1:5432 ─────┼──┼─┼ (loopback)
   │  │  │  redis:7-alpine       127.0.0.1:6379 ─────┼──┼─┼ (loopback)
   │  │  │  api (node)          127.0.0.1:3100 ─────┼──┼─┼ (loopback)
   │  │  │  worker (node)        127.0.0.1:3101 (health intern)
   │  │  │  web (node+vite)     10.77.0.13:3000 ────┼──┼─┼ (LAN)
   │  │  └──────────────────────────────────────────┘  │ │
   │  │  volume postgres_data (221M) · redis_data (3.5M) │ │
   │  │  volume upload_data (/data/uploads)              │ │
   │  │  volume backup_data (/var/backups/blipmade)      │ │
   │  └─────────────────────────────────────────────────┘ │
   │  sshd 0.0.0.0:22 · LLMNR 0.0.0.0:5355              │
   └─────────────────────────────────────────────────────┘
```

**Limitele de încredere și ce le traversează:**

| Limită | Ce o traversează | Ce ar trebui să o traverseze | Stare |
|---|---|---|---|
| **TB-1** Internet → hipervisor | TLS către Cloudflare; TCP simplu către DNAT-uri | Doar TLS; `8006`/`111`/`3128` **nu ar trebui să fie accesibile** | ❌ `8006`, `111`, `3128` sunt publice |
| **TB-2** Internet → edge (`10.77.0.12:443`) | HTTPS cu SNI `blipmade.com`, certificat Let's Encrypt valid | Doar TLS 1.2/1.3 | ✅ TLS 1.0/1.1 refuzate |
| **TB-3** Edge → web (`10.77.0.13:3000`) | HTTP în clar, în segmentul LAN | HTTP intern cu `X-Forwarded-For` de la o sursă de încredere | ⚠️ IP-ul real al vizitatorului se pierde (vezi `INFRA-P1-09`) |
| **TB-4** Web → API (`api:3100`) | HTTP intern, header-uri rescrise de containerul web | Doar de la containerul web | ✅ `X-Forwarded-For` rescris; ⚠️ API-ul are încredere în tot bridge-ul (`INFRA-P1-10`) |
| **TB-5** API → Postgres / Redis | TCP intern, `127.0.0.1` | Loopback | ✅ Nu există nicio cale de la exterior |
| **TB-6** API/worker → Pterodactyl | HTTPS prin `/etc/hosts` → `10.77.0.10` | TLS cu cheie de aplicație | ✅ Cheia de aplicație separată de `PTERODACTYL_CLIENT_KEY` (gol) |
| **TB-7** Container → volum | Volume Docker named, rw | Volume cu copie în backup | ⚠️ `upload_data` **nu** este în backup (`INFRA-P1-08`) |

---

## 4. Tabelul de expunere

Metodă: `ss -lntp` + `iptables -t nat -L PREROUTING -n -v` (cu contoare) + teste TCP din afara fiecărui segment. „Public" înseamnă accesibil de pe un IP care nu aparține segmentului `10.77.0.0/24`.

### 4.1 VM 103 — platforma (`10.77.0.13`)

| Port | Serviciu | Ascultare | Accesibil din exteriorul hostului | Verdict |
|---|---|---|---|---|
| 22/tcp | `sshd` | `0.0.0.0` + `[::]` | Doar LAN (IP RFC1918, fără DNAT) | **Trebuie privat** — OK (key-only: `passwordauthentication no`) |
| 3000/tcp | `web` (container) | `10.77.0.13:3000` | Doar LAN; de fapt traversat de edge prin DNAT | **Trebuie privat** — OK |
| 30003/tcp | `node server.mjs` (`/tmp/web-check`) | `0.0.0.0` | **LAN, publicat pe toate interfețele** | **Nejustificat** — stack de verificare al auditului (`INFRA-P1-18`) |
| 30004/tcp | `node server.mjs` (`/tmp/web-check`) | `0.0.0.0` | **LAN, publicat** | **Nejustificat** (`INFRA-P1-18`) |
| 30005/tcp | `node server.mjs` (`/tmp/uxaudit/web`) | `0.0.0.0` | **LAN, publicat** | **Nejustificat** (`INFRA-P1-18`) |
| 5355/tcp+udp | `systemd-resolved` (LLMNR) | `0.0.0.0` | **LAN** | **Trebuie privat** (`INFRA-P1-19`) |
| 3100/tcp | API | `127.0.0.1` | **Nu** | ✅ Corect |
| 3101/tcp | worker health | `127.0.0.1` | **Nu** | ✅ Corect |
| 3105/tcp | API de audit (`/tmp/uxaudit/api`) | `127.0.0.1` | **Nu** | ✅ Corect |
| 5432/tcp | `postgres:17-alpine` | `127.0.0.1` | **Nu** | ✅ Corect |
| 6379/tcp | `redis:7-alpine` | `127.0.0.1` | **Nu** | ✅ Corect |

**Verdictul central: baza de date, redis și API-ul nu sunt accesibile din exteriorul hostului.** Regula DNAT a hipervisorului (`-d 193.34.214.143/32 … dport:443 → 10.77.0.12:443`) nu conține nicio cale către `10.77.0.13:3100`, `:5432` sau `:6379`.

### 4.2 Hipervisor Proxmox (`193.34.214.20`, alias-uri `/32` `.86`, `.87`, `.143`)

| Port | Serviciu | Ascultare | Accesibil din internet | Verdict |
|---|---|---|---|---|
| 22/tcp | `sshd` | `0.0.0.0` + `[::]` | **Da, pe toate cele patru adrese** | **Trebuie privat** ❌ |
| 111/tcp+udp | `rpcbind` | `0.0.0.0` + `[::]` | **Da, pe toate cele patru adrese** | **Trebuie privat** ❌ (și nu este necesar: pe VM 103 `rpcbind` este *inactive*) |
| 8006/tcp | `pveproxy` (consola Proxmox) | `*` | **Da, pe toate cele patru adrese** | **Trebuie privat** ❌ |
| 3128/tcp | `spiceproxy` | `*` | **Da** | **Nejustificat** ❌ |
| 25/tcp | `postfix` | `127.0.0.1` | Nu | ✅ |
| 85, 13101, 13003, 4173 | `pvedaemon`, tunel SSH, node | loopback / `[::1]` | Nu | ✅ |
| `.143`:80/443 | DNAT → `10.77.0.12` (edge) | — | Da, cu contoare active (11 609 pachete pe 443) | **Trebuie public** ✅ |
| `.86`:80/443 | DNAT → `10.77.0.10` (panou) | — | Da, cu contoare active (3 317 pachete pe 443) | **Trebuie public** ✅ |
| `.87`:80/8080/2022/30001 + 30000-39999 | DNAT → `10.77.0.11` (nod) | — | Da | **Trebuie public** ⚠️ `8080` (Wings) și `2022` nu au nevoie de expunere publică |

### 4.3 Edge (`10.77.0.12`) / panou (`10.77.0.10`) / nod (`10.77.0.11`)

| Port | Serviciu | Verdict |
|---|---|---|
| `10.77.0.12`:22/80/443 | SSH, HTTP, TLS (certificat LE `CN=blipmade.com`, 23.10.2026 → 21.01.2027) | 443 trebuie public ✅; 22 trebuie privat ✅ |
| `10.77.0.12`:2019 | API-ul de admin Caddy | **Închis** ✅ (nu s-a deschis) |
| `10.77.0.10`:22 | SSH panou | Trebuie privat ✅ (doar LAN) |
| `10.77.0.10`:80/443 | Panou Pterodactyl (certificat LE `CN=panel.blipmade.com`) | Trebuie public ✅ (prin DNAT) |
| `10.77.0.11`:22 | SSH nod | Trebuie privat ✅ |
| `10.77.0.11`:8080 | Wings | Trebuie privat ⚠️ (expus public prin DNAT) |
| `10.77.0.11`:30000-39999 | Porturile de joc alocate | Trebuie public ✅ |

**Concluzia expunerii:** suprafața publică a platformei este corectă (doar TLS către edge și panou), dar **suprafața publică a hipervisorului este deschisă și nefiltrată**: `22`, `111`, `8006`, `3128` pe toate adresele publice, cu `INPUT ACCEPT` și `FORWARD ACCEPT`, fără `ufw`, fără `firewalld`, fără `nftables` (serviciul `nftables` este `disabled`).

---

## 5. Constatări

### INFRA-P1-01 — **Critical** — Copia de backup nu părăsește niciodată hostul

| Câmp | Conținut |
|---|---|
| **Componentă** | `scripts/backup.sh`, `scripts/backup-offsite.sh`, `blipmade-backup.service` |
| **Comportament observat** | Rularea programată produce arhiva și `.sha256`, apoi `backup.sh` scrie `==> OFFSITE_TARGET is not set, so the copy stayed on this host.` și `backup-offsite.sh` scrie `==> OFFSITE_TARGET is not set, so no off-site copy was made.` — ambele **ieșind cu cod 0**, deci systemd consideră serviciul reușit. Nu există nicio cheie `OFFSITE_*` în `.env`. Contoarele regulilor NAT arată că nu există nicio cale de ieșire folosită de backup. |
| **Comportament așteptat** | Copia criptată părăsește hostul, este verificată prin decriptare + comparare, și backup-ul local este păstrat până când copia de la destinație e confirmată. |
| **Dovezi** | `journalctl -u blipmade-backup.service` → `blipmade-backup.service: Deactivated successfully.` + `==> OFFSITE_TARGET is not set, so the copy stayed on this host.`; `grep -E "^OFFSITE_" /opt/blipmade/.env` → **fără rezultat**; `scripts/backup.sh:66-75`; `scripts/backup-offsite.sh:71-76` (ieșire 0) |
| **Cauză** | Decizia D-2 a operatorului (ținta off-host + cheia de criptare) nu a fost dusă la îndeplinire. Codul e pregătit; lipseste configurația. |
| **Remediere propusă** | În `/opt/blipmade/.env`: `OFFSITE_TARGET=rclone:blipmade-backups` (sau `user@host:/srv/blipmade`) **și** `OFFSITE_ENCRYPTION_KEY` (sau `OFFSITE_AGE_RECIPIENT` + `OFFSITE_AGE_IDENTITY`), apoi `sudo systemctl start blipmade-backup.service` și verificarea copiei la destinație. **În plus (cod, fără autorizare):** `backup-offsite.sh` ar trebui să iasă cu cod ≠ 0 când ținta e setată dar nu se poate copia — astfel ca `systemctl` să marcheze eșecul (astăzi eșecul e mascat ca succes). |
| **Criteriu de verificare** | `ls -l` pe destinația off-host arată `blipmade-offsite-<stamp>.tar.gz.enc`; `systemctl status blipmade-backup.service` arată `status=1/SUCCESS` **și** logul conține `==> The encrypted copy was verified.`; arhiva locală există și `.sha256` e valid. |
| **Autorizare necesară** | **Da** — alegerea țintei off-host și gestionarea cheii de criptare sunt decizii de operator (cost, custodie, rotație). |

### INFRA-P1-02 — **Critical** — RAID 0 confirmat, dar la nivelul hipervisorului, nu al VM-ului

| Câmp | Conținut |
|---|---|
| **Componentă** | Stocarea hipervisorului Proxmox; imaginea de disc a VM 103 |
| **Comportament observat** | În VM 103: un singur disc virtual `sda` (`QEMU HARDDISK`), **fără** `/proc/mdstat`, fără `mdadm`, fără LVM — deci **VM-ul nu are RAID 0**. Pe hipervisor: `/proc/mdstat` arată `md1 : active raid0 sdb3[1] sda3[0]` montat pe `/` (1,7 TB), plus `md0` (raid0, `/boot`) și `md2` (raid0, swap). Singurul storage Proxmox definit este `dir: local` cu `path /var/lib/vz` — **fără replicare, fără ZFS, fără LVM-thin**. Discul VM-ului este un fișier `vm-103-disk-0.qcow2` (85 GB) pe acest RAID 0. |
| **Comportament așteptat** | Storage-ul care conține imaginea VM-ului să aibă redundanță (RAID 1/10, ZFS mirror, replicare) sau backup-ul să existe pe un suport distinct. |
| **Dovezi** | `cat /proc/mdstat` (hipervisor) → `md1 : active raid0 sdb3[1] sda3[0]`; `cat /etc/pve/storage.cfg` → un singur `dir: local`; `qm config 103` → `scsi0: local:103/vm-103-disk-0.qcow2,size=80G`; `ls -la /var/lib/vz/images/103/` → `vm-103-disk-0.qcow2 85375647744`; în VM: `lsblk` → un singur `sda`, `cat /proc/mdstat` → *No such file or directory* |
| **Cauză** | Stocarea a fost provisionată ca RAID 0 la nivelul hipervisorului; VM-ul moștenește dependența fără să o poată vedea. |
| **Remediere propusă** | **(operator, cu downtime)** Migrare a `/var/lib/vz` pe RAID 1 sau ZFS mirror, sau o soluție echivalentă cu copie pe alt suport — **numai după** ce backup-ul off-host există și drill-ul trece (`INFRA-P1-01` → `INFRA-P1-08` → `INFRA-P1-02`). **În cod (fără autorizare):** `scripts/backup.sh` ar trebui să verifice real că s-a făcut o copie off-host și să spună explicit în prima linie a output-ului dacă backup-ul este sau nu extern. |
| **Criteriu de verificare** | `cat /proc/mdstat` pe hipervisor arată `mdX : active raid1 …` (sau ZFS mirror); `pvesm status` arată un storage cu replicare; după simularea pierderii unui disc, `qm start 103` reușește și `docker compose ps` arată toate serviciile `healthy`. |
| **Autorizare necesară** | **Da** — schimbare de RAID = downtime + procedură aprobată + risc de pierdere. |

### INFRA-P1-03 — **Critical** — Niciun firewall pe gazda platformei și niciunul pe hipervisor

| Câmp | Conținut |
|---|---|
| **Componentă** | Netfilter/iptables pe VM 103 și pe hipervisor |
| **Comportament observat** | Pe VM 103: `iptables -S` → `-P INPUT ACCEPT`, `-P OUTPUT ACCEPT`; `ufw` nu este instalat; `firewalld` `inactive`/`not-found`; serviciul `nftables` `disabled`. **Nu există nicio regulă de filtrare pe INPUT.** Pe hipervisor: identic — `-P INPUT ACCEPT`, `-P FORWARD ACCEPT` (singura regulă FORWARD este `ACCEPT` pe `30000:39999` către `10.77.0.11`). Docker a creat singur lanțurile sale (`DOCKER`, `DOCKER-FORWARD` cu `policy drop` pe FORWARD), dar acestea nu protejează socketurile hostului. |
| **Comportament așteptat** | `INPUT` cu `policy DROP` și excepții explicite (22 din IP-urile de administrare, 3000/443 din segmentul intern), plus blocarea porturilor de administrare ai hipervisorului. |
| **Dovezi** | `sudo iptables -S` → `-P INPUT ACCEPT`; `sudo nft list ruleset` → doar tabelele `ip nat` și `ip filter` create de Docker; `systemctl is-enabled nftables` → `disabled`; `systemctl is-active firewalld` → `inactive`; pe hipervisor: `iptables -S` → `-P INPUT ACCEPT` |
| **Cauză** | Decizia de restrângere a filtrelor a fost amânată la operator (raportul 25, secțiunea 4). |
| **Remediere propusă** | **(operator)** Pe hipervisor: `INPUT` cu `DROP`, păstrând 22 doar din `10.77.0.0/24` + IP-ul de administrare, blocând 111 și 3128, și limitând 8006 la VPN/administrare. Pe VM 103: `INPUT` cu `DROP`, păstrând 22 (key-only) și ce vine de pe `vmbr1`. **Ordine obligatorie (din raportul 25): firewall înainte de rotația parolei**, altfel lockout. |
| **Criteriu de verificare** | `sudo iptables -S | head -3` arată `-P INPUT DROP`; din exterior, `nc -z <ip> 111` / `:8006` / `:3128` eșuează; `ssh` de la IP-ul de administrare continuă să funcționeze. |
| **Autorizare necesară** | **Da** — reguli de firewall și rotație de credentiale. |

### INFRA-P1-04 — **High** — Consola Proxmox, rpcbind și spiceproxy sunt expuse public

| Câmp | Conținut |
|---|---|
| **Componentă** | `pveproxy` (8006), `rpcbind` (111), `spiceproxy` (3128), `sshd` (22) pe hipervisor |
| **Comportament observat** | Toate patru sunt ascultate pe `0.0.0.0`/`*` și sunt **accesibile din internet** pe toate cele patru adrese publice ale hipervisorului (`193.34.214.20`, `.86`, `.87`, `.143`). `pveproxy` este interfața completă de administrare a hipervisorului; `rpcbind` oferă un broker RPC care este vector de amplificare cunoscut; `spiceproxy` expune consola grafică a VM-urilor. |
| **Comportament așteptat** | Interfața de administrare a hipervisorului accesibilă doar din segmentul de administrare (VPN) sau cu restricție de sursă. |
| **Dovezi** | `ss -lntp` (hipervisor) → `LISTEN 0.0.0.0:111 users:(("rpcbind",pid=8997))`, `LISTEN *:8006 users:(("pveproxy",pid=12414))`, `LISTEN *:3128 users:(("spiceproxy",pid=12430))`; teste TCP din internet: `OPEN 193.34.214.20:22 / :111 / :8006 / :3128`, `OPEN 193.34.214.86:22 / :111 / :8006` (idem `.87`, `.143`) |
| **Cauză** | Absența filtrării pe INPUT (`INFRA-P1-03`). |
| **Remediere propusă** | **(operator)** Firewall cu `DROP` pe INPUT, cu excepții pentru 22 limitate la IP-urile de administrare și 8006 limitat la VPN. `rpcbind` și `spiceproxy` nu au nevoie de expunere publică: `systemctl disable --now rpcbind` (nici VM 103, nici nodul nu îl folosesc; pe VM 103 `rpcbind` e deja `inactive`). |
| **Criteriu de verificare** | Din exterior, toate cele patru adrese răspund `closed` pe 111/8006/3128 și `closed` pe 22 din afara segmentului de administrare; `systemctl is-active rpcbind` → `inactive` pe hipervisor. |
| **Autorizare necesară** | **Da** — firewall și (pentru 8006) decizia de a-l ține accesibil prin VPN. |

### INFRA-P1-05 — **High** — Nicio limită de resurse pe containere și niciun swap

| Câmp | Conținut |
|---|---|
| **Componentă** | Toate cele 5 servicii compose; kernel-ul gazdei |
| **Comportament observat** | Pentru toate containerele: `Memory=0`, `MemorySwap=0`, `NanoCpus=0`, `CpuQuota=0`, `CpuPeriod=0`, `PidsLimit=<no value>`, `OomKillDisable=<no value>`. Gazda: `SwapTotal: 0 kB`, `SwapFree: 0 kB`, **niciun swapfile**. Consumul real este mic (`api` 48,8 MiB, `worker` 36,9 MiB, `web` 16,0 MiB, `postgres` 1,357 GiB, `redis` 11,3 MiB), dar **nu există nicio limită superioară**: un vârf de memorie într-un container poate consuma toată RAM-ul, iar OOM-killer-ul hostului (fără swap) ar omorî `postgres` și `redis` împreună cu aplicația. |
| **Comportament așteptat** | `mem_limit` și `cpus` per serviciu, `pids_limit`, și un swapfile (sau `zram`) ca amortizor. |
| **Dovezi** | `docker inspect --format 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}} PidsLimit={{.HostConfig.PidsLimit}}'` → `Memory=0 NanoCpus=0 PidsLimit=<no value>` pentru toate; `free -h` → `Swap: 0B 0B 0B`; `cat /proc/swaps` → doar antetul; `docker stats` → `postgres 1.357GiB / 7.762GiB` |
| **Cauză** | Limitele nu au fost scrise în fișierele compose. |
| **Remediere propusă** | **(cod, fără autorizare, dar cere un restart al stivei → fereastră de mentenanță)** În `compose.yml` / `compose.api.yml` / `compose.web.yml`: `mem_limit` (postgres 2g, api 1g, worker 1g, web 512m, redis 512m), `cpus`, `pids_limit`. Separat: **crearea swapfile-ului** este o modificare de host → autorizare de operator (`fallocate -l 2G /swapfile; chmod 600; mkswap; swapon` + o intrare în `/etc/fstab`). |
| **Criteriu de verificare** | `docker inspect` arată `Memory=2147483648` etc. pentru fiecare serviciu; `free -h` arată `Swap: 2.0Gi`; un test cu `docker update --memory 256m` nu afectează celelalte containere. |
| **Autorizare necesară** | **Parțial** — limitele de container: **Nu** (cod, cu restart); swapfile-ul pe host: **Da**. |

### INFRA-P1-06 — **High** — Jurnalele Docker nu sunt rotite

| Câmp | Conținut |
|---|---|
| **Componentă** | Docker daemon (`json-file`), toate containerele |
| **Comportament observat** | `LogDriver=json-file` cu `LogOpts=map[]` — adică **fără `max-size` și fără `max-file`**. Nu există `/etc/docker/daemon.json`. Jurnalul `postgres` a ajuns deja la **978 KB în 29 de ore** (cu `log_statement=none`, deci aproape tot ce scrie sunt erori și checkpoint-uri). Creșterea este nelimitată, iar volumul de rădăcină are 59 GB liberi, din care 12,56 GB sunt deja cache de build (`docker system df` → `Build Cache 12.56GB`, 12,3 GB reclamabile). |
| **Comportament așteptat** | `max-size` + `max-file` per serviciu, sau un driver de rotire (`local`/`journald`) cu limită. |
| **Dovezi** | `docker inspect --format 'LogDriver={{.HostConfig.LogConfig.Type}} LogOpts={{.HostConfig.LogConfig.Config}}'` → `json-file` / `map[]`; `sudo cat /etc/docker/daemon.json` → *No such file or directory*; `find /var/lib/docker/containers -name '*-json.log' -printf '%s %p\n'` → `978077 …postgres…json.log`; `docker system df` → `Build Cache 12.56GB` |
| **Cauză** | Politica de rotire nu a fost configurată nici în daemon, nici în compose. |
| **Remediere propusă** | **(cod, fără autorizare; se aplică la recreare)** `logging: { driver: "json-file", options: { max-size: "10m", max-file: "3" } }` pe fiecare serviciu din compose. **(host, cu autorizare)** `/etc/docker/daemon.json` cu `{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"}}` + `systemctl restart docker` → downtime. Separat: `docker builder prune` pentru cele 12,3 GB de cache. |
| **Criteriu de verificare** | `docker inspect` arată `LogOpts=map[max-file:3 max-size:10m]`; după câteva zile, `du -sh /var/lib/docker/containers/` rămâne sub ~200 MB. |
| **Autorizare necesară** | **Parțial** — opțiunile per serviciu în compose: **Nu**; `daemon.json` + restartul Docker: **Da**. |

### INFRA-P1-07 — **High** — Nu există recuperare la un punct în timp (PITR)

| Câmp | Conținut |
|---|---|
| **Componentă** | PostgreSQL 17 |
| **Comportament observat** | `archive_mode = off`, `archive_command = (disabled)`, `wal_keep_size = 0`, `pg_replication_slots` = 0 rânduri, `pg_publication` = 0, `pg_subscription` = 0. `wal_level = replica` (implicit), dar nu e folosit pentru nimic. Directorul `pg_wal` are 96 MB / 8 fișiere. |
| **Comportament așteptat** | `archive_mode = on` cu un `archive_command` către o destinație distinctă, plus un slot de replicare sau un flux fizic continuu, care să permită refacerea până la o secundă. |
| **Dovezi** | `docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SHOW archive_mode; SHOW archive_command; SHOW wal_keep_size; SELECT * FROM pg_replication_slots; SELECT count(*) FROM pg_publication; SELECT count(*) FROM pg_subscription;"` → `off`, `(disabled)`, `0`, 0 rânduri, 0, 0 |
| **Cauză** | Nu a fost configurat PITR. |
| **Remediere propusă** | **(operator + cod)** `archive_mode = on` și `archive_command` către un bucket/host distinct (de exemplu `rclone` către ținta off-host), plus retenție. În Postgres 17 se poate folosi `archive_library` sau un `archive_command` clasic. Alternativ, backup-uri incrementale cu `pg_basebackup` + slot. **Până când e implementat, singura protecție e dumpul zilnic → RPO = 24 h** (vezi secțiunea 6). |
| **Criteriu de verificare** | `SHOW archive_mode` → `on`; `pg_stat_archiver` → `archived_count` crește, `last_failed_time` e `NULL`; un restore cu `-t <timestamp>` readuce baza până la secunda. |
| **Autorizare necesară** | **Da** — destination și retenție off-host; modificarea configului Postgres în volum e un restart (fereastră). |

### INFRA-P1-08 — **High** — Arhiva de backup nu conține volumul de atașamente

| Câmp | Conținut |
|---|---|
| **Componentă** | `scripts/backup.sh` vs. `scripts/backup-offsite.sh` |
| **Comportament observat** | Conținutul real al arhivei programate: **doar** `./config.tar.gz` (17 558 B) și `./database.dump` (118 625 B). `backup.sh` nu include niciodată `ATTACHMENT_DIR` (`/data/uploads`, volumul `upload_data`). Doar `backup-offsite.sh` ar include `OFFSITE_UPLOAD_DIR` — dar acesta nu rulează niciodată (`OFFSITE_TARGET` absent). `.env` este exclus explicit din arhivă (corect: secretele nu se arhivează în clar), deci **nici configurația reală nu este în backup**. |
| **Comportament așteptat** | Arhiva să conțină baza de date, volumul de încărcări și configurația (fără secretele, sau cu secretele într-un cofactor extern). |
| **Dovezi** | `tar -tzvf /var/backups/blipmade/blipmade-scheduled-20261024T001409Z.tar.gz` → `./config.tar.gz`, `./database.dump` — **niciun alt fișier**; `scripts/backup.sh:41-47` (tar fără `/data`); `scripts/backup-offsite.sh:54` (`UPLOAD_DIR="${OFFSITE_UPLOAD_DIR:-${ATTACHMENT_DIR:-/data/uploads}}"`); `du -sh /var/lib/docker/volumes/blipmade_upload_data/_data/` → 8,0 K (gol acum) |
| **Cauză** | Scriptul de backup programat nu a fost extins cu volumul de fișiere, iar calea care ar fi acoperit-o nu se execută. |
| **Remediere propusă** | **(cod, fără autorizare)** `backup.sh` ar trebui să adauge volumul de încărcări la arhivă (`tar` din `OFFSITE_UPLOAD_DIR`/`ATTACHMENT_DIR`), să includă un `.env` **criptat** (sau să emită un avertisment explicit că secretele trebuie refăcute manual la restaurare) și să verifice la final că arhiva conține ce trebuie. **Până la implementare, orice atașament de bilet este definitiv pierdut la pierderea hostului.** |
| **Criteriu de verificare** | `tar -tzvf <arhivă> \| grep uploads` listează fișierele; după un restore, `ATTACHMENT_DIR` conține aceleași fișiere; `scripts/restore-drill.sh` extinde și el verificarea cu volumul de fișiere. |
| **Autorizare necesară** | **Nu** pentru schimbarea scriptului; **Da** pentru decizia privind unde se păstrează copia criptată a secretelor. |

### INFRA-P1-09 — **High** — Pe traseul public, API-ul nu mai vede adresa vizitatorului

| Câmp | Conținut |
|---|---|
| **Componentă** | `web/server.mjs` → `web/src/lib/client-address.mjs` → `api/src/app.ts` (`trustProxy`) |
| **Comportament observat** | Jurnalul API-ului arată `remoteAddress` cu **doar** patru valori distincte: `127.0.0.1` (19), `172.18.0.1` (5), `10.77.0.1` (1) și **`162.158.14.14` (3)** — o adresă din spațiul Cloudflare. Cele trei cereri cu `162.158.14.14` sunt cereri reale de interfață (`/api/auth/session`, `/api/catalog/products`, `/api/instances`). Prin contrast, o cerere identică trimisă prin gateway-ul de la margine de pe segmentul intern e înregistrată cu `remoteAddress: 10.77.0.1` — adică adresa reală a clientului. **Deci: pe calea publică, „adresa clientului" este adresa Cloudflare, nu a vizitatorului.** |
| **Comportament așteptat** | API-ul să primească adresa reală a vizitatorului (Cloudflare → gateway → web → API), ca limitarea pe IP, jurnalul de audit și sesiunile să fie atribuite corect. |
| **Dovezi** | `docker logs blipmade-api-1 \| grep -oE '"remoteAddress":"[^"]*"' \| sort \| uniq -c` → `3 "remoteAddress":"162.158.14.14"`; `curl --resolve blipmade.com:443:10.77.0.12 https://blipmade.com/api/health` → în jurnal `{"reqId":"req-u","req":{"url":"/api/health","remoteAddress":"10.77.0.1"}}`; `TRUSTED_PROXY_IPS=10.77.0.12` în containerul web |
| **Cauză** | **Cauza este în stratul inaccesibil** (configurația de proxy a gateway-ului `10.77.0.12`, care nu poate fi citită): header-ul `X-Forwarded-For` este reconstruit fără adresa vizitatorului, iar containerul web ia primul element al lanțului (`web/src/lib/client-address.mjs:85-87`), deci primește adresa Cloudflare. |
| **Remediere propusă** | **(operator, pe gateway)** Gateway-ul trebuie să transmită adresa reală a vizitatorului: fie `X-Forwarded-For` complet (lanț complet, cu `CF-Connecting-IP` al lui Cloudflare ca prim element), fie un header dedicat. **(cod, fără autorizare)** `web/src/lib/client-address.mjs` poate citi `cf-connecting-ip` **numai** când socketul peer este în `TRUSTED_PROXY_IPS`, iar `api/src/env.ts` poate expune `TRUSTED_PROXY_IPS` către API. **Până la remediere, limitarea pe IP este per POP Cloudflare, iar jurnalul de audit nu mai poate identifica vizitatorul.** |
| **Criteriu de verificare** | Un `GET /api/health` prin calea publică produce în jurnal un `remoteAddress` care nu aparține Cloudflare; două vizitatori diferiți primesc contoare de limitare diferite (`429` doar pentru unul dintre ei). |
| **Autorizare necesară** | **Da** pentru configurația gateway-ului; **Nu** pentru partea de cod. |

### INFRA-P1-10 — **Medium** — API-ul are încredere în întregul bridge Docker

| Câmp | Conținut |
|---|---|
| **Componentă** | `compose.api.yml` (linia 14), `api/src/env.ts:102` |
| **Comportament observat** | `compose.api.yml` definește `TRUSTED_PROXIES: "${TRUSTED_PROXIES:-127.0.0.1,::1,172.16.0.0/12}"`, iar `.env` **nu** definește `TRUSTED_PROXIES`. Valoarea efectivă în container este `127.0.0.1,::1,172.16.0.0/12` — un prefix care acoperă întreaga rețea `172.18.0.0/16` a proiectului. Valorile reale ale aplicației (`api/src/env.ts:102`) sunt `127.0.0.1,::1`. `TRUSTED_PROXY_IPS=10.77.0.12` (web) e corect, dar nu are corespondent în API. |
| **Comportament așteptat** | API-ul să creadă doar adresa containerului web (sau măcar o listă explicită), nu orice container adăugat ulterior pe bridge. |
| **Dovezi** | `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' blipmade-api-1 \| grep TRUSTED` → `TRUSTED_PROXIES=127.0.0.1,::1,172.16.0.0/12`; `grep -E "^TRUSTED_PROXIES=" /opt/blipmade/.env` → fără rezultat; `compose.api.yml:11-14` (comentariul spune „este domeniul care se îngustează în .env-ul operatorului (SEC-05)") |
| **Cauză** | Valoarea pregătită în `.env` de către operator nu a fost pusă. |
| **Remediere propusă** | **(operator, o singură linie în `.env` + restart API)** `TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.6` (adresa containerului web) — sau valoarea documentată în `audit/25-OPERATOR-DEPENDENCIES.md`. **(cod, fără autorizare)** `compose.api.yml` ar trebui să nu aibă un prefix atât de larg ca implicit: implicitul sigur e `127.0.0.1,::1`, iar lățimea e o decizie explicită a operatorului. |
| **Criteriu de verificare** | `docker inspect blipmade-api-1` arată `TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.6`; un container de test pe același bridge care trimite `X-Forwarded-For: 1.2.3.4` **nu** schimbă `request.ip` în API. |
| **Autorizare necesară** | **Da** — valoarea e în `.env` (operație pe producție + restart API). |

### INFRA-P1-11 — **Medium** — `requestId` nu este un identificator de corelare utilizabil

| Câmp | Conținut |
|---|---|
| **Componentă** | `api/src/plugins/errorHandler.ts`, Fastify (generatorul implicit de `req.id`) |
| **Comportament observat** | Eroarea trimisă clientului conține `requestId` cu valoarea generată implicit de Fastify: un **contor per proces** (`req-1`, `req-2`, apoi baza 36: `req-m`, `req-n`, `req-o`). Jurnalul folosește cheia `reqId` (Fastify), nu `requestId`. Nu există antet `x-request-id` în răspuns. Consecințe: (a) valoarea se resetează la fiecare repornire a containerului → același `requestId` există în zile diferite; (b) două procese (API și worker) și stiva de verificare din `/tmp` generează aceeași familie de valori; (c) clientul și jurnalul folosesc **nume de câmp diferite** pentru aceeași valoare → un `grep requestId` în jurnal nu returnează nimic. |
| **Comportament așteptat** | Un identificator unic (UUID v4) propagat ca `requestId` în corpul erorii, ca `reqId` în jurnal și ca antet `x-request-id` în răspuns. |
| **Dovezi** | `docker logs blipmade-api-1 \| grep -oE '"reqId":"[^"]*"'` → `"reqId":"req-1"`, `"reqId":"req-m"`, `"reqId":"req-n"`; `api/src/plugins/errorHandler.ts:7` (`request.id`), `:36` (`request.log.error({ err: error, requestId }, …)`), `:44` (`requestId: request.id`); `curl -sD- http://127.0.0.1:3100/health` → **niciun** antet `x-request-id` |
| **Cauză** | Nu s-a configurat `genReqId` în `api/src/app.ts` și nu s-a propagat antetul. |
| **Remediere propusă** | **(cod, fără autorizare)** În `api/src/app.ts`: `genReqId: () => randomUUID()` și `requestIdHeader: 'x-request-id'`; în `errorHandler.ts`, păstrați `requestId` în corp și **adaugați** `reqId` (sau redenumit în `requestId`) în jurnal. La fel în `web/server.mjs`, dacă proxy-ul trebuie să transmită antetul în sus. |
| **Criteriu de verificare** | Un `GET /api/nonexistent` întoarce `{"error":{"requestId":"3f2b…"}}` **și** antetul `x-request-id: 3f2b…`; `docker logs blipmade-api-1 \| grep 3f2b` returnează exact o linie. |
| **Autorizare necesară** | **Nu** — schimbare de cod, dar cere redeploy. |

### INFRA-P1-12 — **Medium** — Nu există monitorizare, alertare sau metrică

| Câmp | Conținut |
|---|---|
| **Componentă** | Hostul, unitul de backup, cozile |
| **Comportament observat** | Pe host: **niciun** agent de monitorizare — `prometheus`, `node_exporter`, `fail2ban`, `crowdsec`, `grafana`, `loki`, `alertmanager`, `sensu`, `icinga`, `monit`, `netdata` sunt toate `inactive` sau absente ca binar. Nu există `auditd`. Nu există monitorizare de disc sau de memorie. Unitul `blipmade-backup.service` **nu are `OnFailure=`** → o rulare eșuată nu generează nicio notificare; singurul semnal este `journalctl -u blipmade-backup.service`. Webhook-urile eșuate se retriesc la 5 minute (`api/src/worker.ts:201`) și sunt vizibile doar în baza de date (`WebhookEvent`), fără canal de alertă. |
| **Comportament așteptat** | Alertă la: backup eșuat, backup lipsă, disc peste prag, memorie sub prag, container în `unhealthy`, coadă cu joburi eșuate, webhook eșuat. |
| **Dovezi** | `systemctl is-active prometheus node_exporter fail2ban crowdsec grafana loki alertmanager sensu icinga monit netdata` → toate `inactive`; `systemctl is-active auditd` → `inactive`; `cat /etc/systemd/system/blipmade-backup.service` → fără secțiune `[Install]`/`OnFailure`; `grep -c OnFailure` → 0 |
| **Cauză** | Nu a fost ales și instalat un canal de observabilitate. |
| **Remediere propusă** | **(cod, fără autorizare)** `blipmade-backup.service` ar trebui să aibă `OnFailure=` cu o unitate care trimite o notificare (e-mail prin releu sau `systemd` + `logger`), iar `restore-drill.sh` ar trebui să fie programat (unar, ex. duminica) ca test de recuperare. **(operator)** Instalarea unui agent de monitorizare + un canal de alertă (e-mail/Slack/webhook) și a unui releu SMTP. |
| **Criteriu de verificare** | Un backup eșuat produce o notificare în canalul de alertă în ≤ 5 minute; există un drill programat și un alert când nu s-a rulat în 26 de ore. |
| **Autorizare necesară** | **Parțial** — `OnFailure=` în unit: **Da** (unitate nouă în `/etc/systemd/system`); restul: **Da** (pachete noi, releu, canal). |

### INFRA-P1-13 — **Medium** — Nu există dead-letter durabil pentru joburile eșuate

| Câmp | Conținut |
|---|---|
| **Componentă** | `api/src/worker.ts` (`pruneQueue`), BullMQ |
| **Comportament observat** | `pruneQueue()` rulează la fiecare 10 minute și face `queue.clean(0, 1000, 'completed')` **și** `queue.clean(0, 1000, 'failed')` — cu `grace = 0`. Prin urmare un job eșuat este **șters în cel mult 10 minute**. Ceea ce rămâne: `instance.provisionError` și `InstanceEvent` în baza de date (bine) și rândul `failed` al cozii (nu). În plus, **niciun endpoint nu expune joburile eșuate**: `/api/status` arată doar numere, `/admin/email/delivery` acoperă coada de e-mail, dar coada de provisionare nu are o pagină de diagnostic. |
| **Comportament așteptat** | Joburile eșuate să fie păstrate (cel puțin `removeOnFail: { count: 500 }` să nu fie anulat de curăță) și vizibile operatorului cu motivul complet. |
| **Dovezi** | `api/src/worker.ts:120-124` → `await queue.clean(0, 1000, 'failed');`; `api/src/worker.ts:198` → `setInterval(…, 10 * 60_000)`; `api/src/services/queue.ts:66-67` → `removeOnFail: { count: 500 }`; `api/src/routes/health.ts:68-82` → doar contori |
| **Cauză** | Curățăția periodică a fost scrisă fără să țină cont de diagnosticul de incident. |
| **Remediere propusă** | **(cod, fără autorizare)** Separă `clean` pentru `completed` de cel pentru `failed` (păstrează `failed` cu o retenție de câteva zile) și adaugă un endpoint de diagnostic (staff-only) care listează joburile eșuate cu `failedReason` și `stacktrace`. |
| **Criteriu de verificare** | După o rulare eșuată forțată, jobul eșuat e încă listabil peste 24 de ore; diagnosticul apare în interfața admin cu motivul exact. |
| **Autorizare necesară** | **Nu** |

### INFRA-P1-14 — **Medium** — `/api/status` este public și dezvăluie topologia internă

| Câmp | Conținut |
|---|---|
| **Componentă** | `api/src/routes/health.ts` (`registerStatusRoutes`), `api/src/app.ts:143-160` |
| **Comportament observat** | Ruta este înregistrată sub prefixul `/api` **fără** `preHandler` de autentificare. Răspunsul conține: numărul de noduri, **numărul exact de porturi libere** („101 port(s) are free for new services"), adâncimea cozilor, starea panelului, starea workerului, starea provisionării și transportul e-mailului. |
| **Comportament așteptat** | Fie autentificare, fie o versiune redusă pentru exterior (doar `overall` + `updatedAt`), și detaliul complet doar pentru staff. |
| **Dovezi** | `api/src/routes/health.ts:145` → `app.get('/status', async () => {…})` (fără `preHandler`); `curl http://127.0.0.1:3100/api/status` → `{"overall":"degraded","components":[…{"id":"allocator","detail":"101 port(s) are free for new services."}…]}` |
| **Cauză** | Ruta de stare a fost scrisă ca pagină publică de status. |
| **Remediere propusă** | **(cod, fără autorizare)** Separă `GET /api/status` (public, redusă) de `GET /api/admin/status` (staff, completă). Alternativ, păstrează ruta publică dar scoate numărul de porturi libere și adâncimea cozilor. |
| **Criteriu de verificare** | `curl -s https://blipmade.com/api/status` nu mai conține `port(s) are free`; varianta completă cere `settings.read`. |
| **Autorizare necesară** | **Nu** |

### INFRA-P1-15 — **Medium** — Imaginile Docker: tag `latest`, fără registru, fără cale de rollback

| Câmp | Conținut |
|---|---|
| **Componentă** | `compose.api.yml` / `compose.web.yml` (`build: ./api`), Docker |
| **Comportament observat** | Cele trei imagini ale aplicației sunt `blipmade-api:latest`, `blipmade-worker:latest`, `blipmade-web:latest`, ** construite local**, cu **etichete absente** și **fără registru** (nicio referință la `ghcr.io` sau Docker Hub). `docker images -a` nu arată nicio imagine anterioară și `docker images -f dangling=true` e gol → **rollback-ul prin imagine nu e posibil**: trebuie `git checkout <sha>` + rebuild. `api` și `worker` sunt două builduri **separate** ale aceleiași surse (`build: ./api`), deci pot diverge. `git status -sb` → `## main...origin/main [ahead 1]` — commitul `29a6b28` (rapoartele de audit) **nu e împins** în origin. |
| **Comportament așteptat** | Imagini etichetate cu SHA-ul commitului, împinse într-un registru, cu imaginea precedentă păstrată pentru rollback și sursa replicată. |
| **Dovezi** | `docker images --no-trunc` → `blipmade-worker latest sha256:93fbbc…` etc.; `docker images -f dangling=true` → gol; `docker image inspect blipmade-api` → `Tags=[blipmade-api:latest]`, `Labels=map[com.docker.compose.project:blipmade …]` (fără `org.opencontainers.image.revision`); `cd /opt/blipmade && git status -sb` → `## main...origin/main [ahead 1]` |
| **Cauză** | Nu există un flux de publicare a imaginilor; deploy-ul e „build pe loc". |
| **Remediere propusă** | **(cod, fără autorizare)** `compose.api.yml`/`compose.web.yml`: `image: ghcr.io/trencito42/blipmade-api:${GIT_SHA:-latest}` + etichete în Dockerfile (`org.opencontainers.image.revision`); un singur build pentru `api` și `worker` (același context, comanda diferită) ca să nu diverge. **(operator)** Crearea registrului + a tokenului de push + împunșarea sursei. |
| **Criteriu de verificare** | `docker images` arată etichete cu SHA; `docker pull` de pe registru reproduce bit-cu-bit imaginea; rollback-ul la commitul precedent e o operație de minute, nu de build. |
| **Autorizare necesară** | **Da** pentru registru/token; **Nu** pentru partea de compose/Dockerfile. |

### INFRA-P1-16 — **Medium** — PostgreSQL nu are vizibilitate pe interogări

| Câmp | Conținut |
|---|---|
| **Componentă** | PostgreSQL 17 |
| **Comportament observat** | `log_statement = none`, `log_min_duration_statement = -1` (dezactivat), `logging_collector = off`, `log_destination = stderr`. Jurnalul conține **doar** erorile și checkpoint-urile. Un incident de interogare lentă nu lasă nicio urmă în afară de `responseTime` din jurnalul Pino al API-ului (doar pentru cererile HTTP, nu pentru joburile cozilor). |
| **Comportament așteptat** | Prag de durată activ (`log_min_duration_statement = 500` sau 1000 ms) și `log_checkpoints`/`log_lock_waits` utile la diagnostic. |
| **Dovezi** | `docker exec blipmade-postgres-1 psql … -c "SHOW log_statement; SHOW log_min_duration_statement; SHOW logging_collector;"` → `none`, `-1`, `off`; `docker logs blipmade-postgres-1` → doar `LOG: checkpoint …` și `ERROR: …` |
| **Cauză** | Setările de logare au rămas la implicit, iar volumul de date nu are o configurare de `postgresql.conf` explicită. |
| **Remediere propusă** | **(operator, cu restart)** `postgresql.conf` montat în volum: `log_min_duration_statement = 1000`, `log_checkpoints = on`, `log_lock_waits = on`, `log_line_prefix` cu `%m [%p] %q%u@%d`. Alternativ, prin `command:` în compose (atunci se pierde la upgrade). |
| **Criteriu de verificare** | O interogare peste prag apare în jurnal cu `duration: … ms`; diagnosticul unei interogări lente e posibil fără instrumentare suplimentară. |
| **Autorizare necesară** | **Da** — modificare de configurație a bazei de date în producție. |

### INFRA-P1-17 — **Medium** — Resturi de audit în producție: 7 099 e-mailuri nedeliverate și 9 baze de test

| Câmp | Conținut |
|---|---|
| **Componentă** | Transportul de e-mail (`file`), serverul PostgreSQL de producție |
| **Comportament observat** | `SMTP_URL` este **gol**, deci fiecare e-mail e scris în fișier în loc de a fi livrat: `/var/backups/blipmade/mail` conține **7 099 fișiere (46 MB)**, iar volumul `backup_data` (montat în containere la `/var/backups/blipmade`) conține încă **30** de fișiere. În PostgreSQL au rămas **9 baze de test** în afara celei de producție: `blipmade_audit_test`, `blipmade_check`, `blipmade_shadow`, `blipmade_suite_test`, `blipmade_test`, `cj_test`, `reval_test`, `sessaudit_test`, `uxaudit_test` — în total ≈ 90 MB, în **aceeași** instanță care ține datele clienților. |
| **Comportament așteptat** | Un releu SMTP real (altfel niciun bilet nou nu ajunge la nimeni) și o curățare a bazei de date de producție de resturile de test. |
| **Dovezi** | `ls /var/backups/blipmade/mail \| wc -l` → `7099`; `du -sh /var/backups/blipmade/mail` → `46M`; `ls /var/lib/docker/volumes/blipmade_backup_data/_data/mail \| wc -l` → `30`; `docker exec blipmade-postgres-1 psql … -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database …"` → `reval_test 12 MB`, `blipmade_test 12 MB`, `blipmade 11 MB`, + 7 altele |
| **Cauză** | Curățarea din 2026-10-23 a eliminat datele de test din **tabele**, dar nu și bazele de test, iar releul SMTP nu a fost instalat. |
| **Remediere propusă** | **(cod, fără autorizare)** `scripts/cleanup-data.sh` ar trebui să elimine și bazele `_test`/`*_audit_test` create de audit, nu doar rândurile; și să golească directorul de e-mail. **(operator)** Un releu SMTP real + o regulă de retenție pentru `mail/`. |
| **Criteriu de verificare** | `docker exec blipmade-postgres-1 psql -tAc "SELECT datname FROM pg_database"` arată doar `blipmade`, `postgres`, `template0/1`; `ls /var/backups/blipmade/mail \| wc -l` → 0 sau un număr mic, explicabil. |
| **Autorizare necesară** | **Da** — `DROP DATABASE` în producție este o ștergere de date; releul SMTP e o dependență externă. |

### INFRA-P1-18 — **Low** — Stack-ul de verificare al auditului este publicat pe `0.0.0.0`

| Câmp | Conținut |
|---|---|
| **Componentă** | Procese `node server.mjs` pornite din `/tmp/web-check` și `/tmp/uxaudit/web` pe VM 103 |
| **Comportament observat** | Trei servere de test din această rundă de audit ascultă pe `0.0.0.0`: `30003` (din `/tmp/web-check`), `30004` (din `/tmp/web-check`, cu `API_URL=http://127.0.0.1:3111`) și `30005` (din `/tmp/uxaudit/web`). Sunt **accesibile din întreaga rețea `10.77.0.0/24`** (test TCP: `OPEN 10.77.0.13:30003/30004/30005`). API-urile de verificare corespunzătoare (`3101`, `3105`) sunt corect pe `127.0.0.1`. |
| **Comportament așteptat** | Stiva de verificare să fie izolată și pe rețea, nu doar pe planul aplicației. |
| **Dovezi** | `ss -lntp` → `LISTEN 0.0.0.0:30003`, `:30004`, `:30005` cu `users:(("node",pid=822467,…))`, `readlink /proc/<pid>/cwd` → `/tmp/web-check`, `/tmp/uxaudit/web`; teste TCP de pe hipervisor → `OPEN` pe toate trei |
| **Cauză** | Serverele de test au fost pornite cu `setsid nohup node server.mjs` fără `--host 127.0.0.1`; `web/server.mjs` ascultă pe `0.0.0.0` prin default (`SERVER_PORT` fără limită de interfață). |
| **Remediere propusă** | **(igienă de audit, fără autorizare)** Oprește aceste procese la finalul rundei. **(cod, fără autorizare)** `web/server.mjs` ar trebui să aibă `HOST` (implicit `127.0.0.1` pentru rulările locale, `0.0.0.0` doar în container) — o modificare mică care elimină clasa de eroare. |
| **Criteriu de verificare** | `ss -lntp \| grep -E '3000[345]'` nu returnează nimic; `web/server.mjs` citește `process.env.HOST`. |
| **Autorizare necesară** | **Nu** |

### INFRA-P1-19 — **Low** — LLMNR ascultă pe toate interfețele

| Câmp | Conținut |
|---|---|
| **Componentă** | `systemd-resolved` |
| **Comportament observat** | `LISTEN 0 4096 0.0.0.0:5355` și `[::]:5355` — LLMNR (resolver multicast) expus pe interfața de rețea, accesibil din `10.77.0.0/24` (`OPEN 10.77.0.13:5355`). LLMNR este un vector cunoscut de amplificare/reflexie DNS. |
| **Comportament așteptat** | LLMNR dezactivat pe o gazdă de server, sau limitat la loopback. |
| **Dovezi** | `ss -lntp` → `LISTEN 0 4096 0.0.0.0:5355 users:(("systemd-resolve",pid=397,…))`; test TCP → `OPEN 10.77.0.13:5355` |
| **Cauză** | `systemd-resolved` e lăsat cu setările implicite pe o interfață de server. |
| **Remediere propusă** | **(operator, modificare de host)** `/etc/systemd/resolved.conf`: `LLMNR=no`, `MulticastDNS=no`, apoi `systemctl restart systemd-resolved`. |
| **Criteriu de verificare** | `ss -lntp \| grep 5355` nu mai returnează nimic; `resolvectl status` arată `LLMNR: no`. |
| **Autorizare necesară** | **Da** — modificare de configurație de host. |

### INFRA-P1-20 — **Low** — HSTS și CSP lipsesc pe traseul static public

| Câmp | Conținut |
|---|---|
| **Componentă** | `web/server.mjs` (răspunsurile statice), `api/src/app.ts` (`helmet`) |
| **Comportament observat** | API-ul (răspunsuri `/api/*`) trimite `strict-transport-security: max-age=31536000; includeSubDomains`, `x-frame-options: SAMEORIGIN`, `referrer-policy: no-referrer` etc. (helmet). Dar **containerul web** servește HTML-ul static cu propriile anteturi, care conțin doar `X-Content-Type-Options: nosniff` și `Cache-Control` — **fără HSTS, fără CSP, fără `Referrer-Policy`, fără `Permissions-Policy`**. Observarea publică confirmă: `curl -I https://blipmade.com/` → `HTTP/2 200` cu anteturi de la Cloudflare, **fără** `strict-transport-security`. `helmet` e configurat cu `contentSecurityPolicy: false` (`api/src/app.ts:62-65`). |
| **Comportament așteptat** | Anteturile de securitate aplicate uniform pe tot traseul public (web + API), cu HSTS la nivelul marginii. |
| **Dovezi** | `curl -sD- http://10.77.0.13:3000/api/health` → conține `strict-transport-security`; `curl -sI https://blipmade.com/` → **fără** `strict-transport-security`; `web/server.mjs:195-200` → anteturi doar `Content-Type`, `Content-Length`, `Cache-Control`, `X-Content-Type-Options` |
| **Cauză** | Containerul web nu aplică helmet, iar marginea fie nu adaugă HSTS, fie o face doar pe anumite rute — **nedeterminabil de aici**, pentru că configurația gateway-ului e inaccesibilă. |
| **Remediere propusă** | **(cod, fără autorizare)** `web/server.mjs`: adaugă `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` pe toate răspunsurile; activează `contentSecurityPolicy` în `helmet` cu o politică minimală. **(operator, pe gateway)** HSTS + `includeSubDomains` la nivel de margine, unde se aplică și paginile statice. |
| **Criteriu de verificare** | `curl -I https://blipmade.com/` conține `strict-transport-security` și o politică CSP efectivă; `curl -sI http://10.77.0.13:3000/` conține aceiași anteturi. |
| **Autorizare necesară** | **Parțial** — cod: **Nu**; anteturi la margine: **Da**. |

### INFRA-P1-21 — **Low** — `EXPOSE` al worker-ului indică portul greșit

| Câmp | Conținut |
|---|---|
| **Componentă** | `api/Dockerfile` (`EXPOSE 3100`), `compose.api.yml` (serviciul `worker`) |
| **Comportament observat** | `docker ps` arată `blipmade-worker-1 ... 3100/tcp`, dar worker-ul ascultă pe **3101** (`api/src/worker.ts:164`: `WORKER_HEALTH_PORT ?? 3101`) și health-check-ul folosește `http://127.0.0.1:3101/health`. Metadatul `EXPOSE` al imaginii este moștenit de la Dockerfile-ul comun și e greșit pentru serviciul worker. Nu e o vulnerabilitate (portul nu e publicat), dar induce în eroare la diagnostic. |
| **Comportament așteptat** | Metadatele imaginii să corespundă serviciului pentru care sunt folosite. |
| **Dovezi** | `docker ps --format "{{.Names}} {{.Ports}}"` → `blipmade-worker-1 ... 3100/tcp`; `api/src/worker.ts:164-170` → `healthPort = … ?? 3101` și `healthServer.listen(healthPort, '0.0.0.0')` |
| **Cauză** | Un singur Dockerfile pentru două servicii cu porturi diferite. |
| **Remediere propusă** | **(cod, fără autorizare)** `compose.api.yml`: `expose: ["3101"]` pentru `worker` și `expose: ["3100"]` pentru `api`, în locul `EXPOSE` din Dockerfile. |
| **Criteriu de verificare** | `docker inspect blipmade-worker-1 --format '{{.Config.ExposedPorts}}'` → `{"3101/tcp":{}}`. |
| **Autorizare necesară** | **Nu** |

### INFRA-P1-22 — **Low-Info** — Starea patch-urilor OS: în general la nivel, o actualizare de securitate în așteptare

| Câmp | Conținut |
|---|---|
| **Componentă** | Debian 13.7 (trixie), kernel 6.12.113+deb13 |
| **Comportament observat** | `apt-get -s upgrade` (simulare, fără modificare) → 2 pachete de actualizat: `tzdata` (stable-updates) și **`libbrotli1` (13-security)**. `unattended-upgrades` este `enabled` + `active`; `apt-daily-upgrade.timer` rulează zilnic. Nu e necesară repornirea (`/var/run/reboot-required` absent). `libbrotli1` e o bibliotecă folosită de compresia HTTP — relevantă, dar cu impact redus. |
| **Comportament așteptat** | Zero actualizări de securitate în așteptare. |
| **Dovezi** | `sudo apt-get -s upgrade` → `Inst libbrotli1 [1.1.0-2+b7] (1.1.0-2+deb13u1 Debian-Security:13/stable-security)`; `systemctl is-active unattended-upgrades` → `active`; `systemctl list-timers` → `apt-daily-upgrade.timer` programat |
| **Cauză** | Actualizarea de securitate publicată recent; `unattended-upgrades` o va prelua la următoarea rulare. |
| **Remediere propusă** | **(operator)** `sudo apt-get upgrade` într-o fereastră; opțional `apt-config dump | grep -i Unattended-Upgrade::Origins` ca `security` să fie aplicat în maximum 24 h. |
| **Criteriu de verificare** | `apt-get -s upgrade` → „0 upgraded, 0 to remove". |
| **Autorizare necesară** | **Da** — actualizare de pachete pe host. |

### INFRA-P1-23 — **Low** — Ramura `main` este cu un commit înainte de origin

| Câmp | Conținut |
|---|---|
| **Componentă** | Repository-ul de pe `/opt/blipmade` |
| **Comportament observat** | `git status -sb` → `## main...origin/main [ahead 1]`; commitul local `29a6b28` („Add the first four reports of the post-remediation audit") nu există în origin. Sursa de aplicație pentru producție e deja la `2e1e78a` și e în origin; deci nu există risc pentru runtime, dar **backup-ul sursei de reconstrucție** (registry + rebuild) ar folosi un commit care nu e replicat. |
| **Comportament așteptat** | `main` sincronizat cu origin, cu etichete pe commiturile de producție. |
| **Dovezi** | `cd /opt/blipmade && git status -sb` → `## main...origin/main [ahead 1]`; `git log --oneline -3` → `29a6b28`, `2e1e78a`, `9e92df7`; `git remote -v` → `origin git@github.com:trencito42/blipmade-hosting.git` |
| **Cauză** | Commitul de audit a fost făcut pe host, înainte de împins. |
| **Remediere propusă** | **(operator)** `git push origin main` și crearea unei etichete pe commitul de producție (`git tag -a prod-2026-10-24 2e1e78a`). |
| **Criteriu de verificare** | `git status -sb` → `## main...origin/main` (fără „ahead"); `git ls-remote --tags origin` arată eticheta de producție. |
| **Autorizare necesară** | **Da** — împins în repository-ul remote. |

---

## 6. Recuperare

### 6.1 Drill-ul de restaurare — **executat, cu rezultat**

Am rulat `scripts/restore-drill.sh` pe VM 103, în forma lui implicită, după ce am citit scriptul (`scripts/restore-drill.sh:46-55`): scriptul creează o bază **de scratch** (`blipmade_restore_check`), restaurează în ea, compară cu baza vie **doar prin `SELECT`**, și o șterge. Nu există niciun `pg_restore` și niciun `DROP` care să atingă baza `blipmade`. **Drill-ul a fost deci sigur de rulat și a fost rulat.**

```
==> Archive: /var/backups/blipmade/blipmade-scheduled-20261024T001409Z.tar.gz
==> Creating the scratch database
NOTICE:  database "blipmade_restore_check" does not exist, skipping
==> Restoring into blipmade_restore_check
==> Comparing the live database with the restored one
  tables         live=32     restored=32
  users          live=3      restored=3
  products       live=5      restored=5
  migrations     live=11     restored=11
  RESULT: the backup restores into a database that matches the live one.
==> Dropping the scratch database
RESTORE_DRILL_EXIT=0
RESTORE_DRILL_WALL_SECONDS=3
```

**Verificarea că baza vie nu a fost atinsă** (citiri înainte și după, identice):

| Tabel | Înainte | După |
|---|---|---|
| `User` | 3 | 3 |
| `Session` | 42 | 42 |
| `Order` | 4 | 4 |
| `Ticket` | 1 | 1 |
| `AuditLog` | 561 | 561 |
| `Instance` | 0 | 0 |

Verificarea integrității arhivei a trecut independent: `sha256sum --check blipmade-scheduled-20261024T001409Z.tar.gz.sha256` → `OK`.

**Concluzie: backup-ul programat este *răsturnabil* la nivel de date, dar nu este încă un *backup*** — pentru că nu există nicio copie în afara hostului (`INFRA-P1-01`) și fiindcă acoperirea e incompletă (`INFRA-P1-08`).

### 6.2 Ce conține arhiva — și ce nu conține

| Element | Prezent? | Detaliu |
|---|---|---|
| Dumpul bazei de date | ✅ | `database.dump`, format custom `pg_dump`, 118 625 B, 32 tabele, 11 migrări aplicate |
| Configurația (compose, prisma, package.json) | ✅ | `config.tar.gz`, 17 558 B, **fără `.env`** (corect — secretele nu se arhivează în clar) |
| Volumul de încărcări (`/data/uploads`) | ❌ | Absent din `backup.sh` (`INFRA-P1-08`) |
| Secretele (`.env`) | ❌ | Prin design; înseamnă că **la restaurare trebuie refăcute manual** `SESSION_SECRET`, `PTERODACTYL_APP_KEY`, cheile Stripe etc. |
| Volumul Redis | ❌ | Nu e necesar: Redis e cache + coadă, cu AOF `everysec`; starea cozilor e reconstructibilă |
| Imagini Docker | ❌ | Nu e backupabil (se reconstruiesc din sursă — `INFRA-P1-15`) |
| Volumul `postgres_data` | ❌ (nici necesar) | Se reconstruiește din dump |

### 6.3 RTO și RPO **măsurate**, nu estimate

| Metric | Valoare | Cum a fost obținută | Realitate |
|---|---|---|---|
| **RTO — restaurarea bazei de date** | **≈ 3 s** | `RESTORE_DRILL_WALL_SECONDS=3` pentru fluxul complet: verificare SHA-256 + extragere + `pg_restore` într-o bază goală + 4 interogări de comparație + `DROP` | **Măsurat.** Volumul de date e mic (11 MB). |
| **RTO — repornirea stivei din imagini existente** | **≈ 46 s** | `StartedAt` al containerului api = `2026-10-24T00:12:48`, imaginile create la `00:12:02` → 46 s de la imagine la container sănătos (cu cache de build cald) | **Măsurat**, cu cache de build prezent. |
| **RTO — reconstruirea imaginilor fără cache** | **nemăsurat** (estimare 5–15 min) | Nu am rulat un build (ar fi o scriere pe host și ar consuma cache-ul) | **Estimare.** Stratul `npm ci --omit=dev` al imaginii api e 342 MB, stratul build `npm ci --include=dev` + `vite build` e dependent de rețea. |
| **RTO — refacerea platformei după pierderea hostului** | **ore, nu minute** | Combinând: re-provisionarea VM-ului (nu e automatizată) + reconstructirea volumelor + rebuild + restore + reconfigurarea manuală a secretelor | **Realitate, nu măsurătoare** |
| **RPO — pierdere de date pe hostul viu** | **≤ 24 h** | Timerul rulează `OnCalendar=*-*-* 02:15:00` cu `RandomizedDelaySec=900` → interval nominal 24 h | **Realitate.** |
| **RPO — pierdere de date la pierderea hostului/RAID 0** | **∞ (tot)** | Unica copie e pe același RAID 0; `OFFSITE_TARGET` nu e setat | **Realitate — acesta e blockerul principal.** |
| **RPO — după o tranzacție coruptă (fără PITR)** | **până la 24 h înapoi** | `archive_mode=off`, fără sloturi, fără replicare (`INFRA-P1-07`) | **Realitate.** |
| **PITR** | **inexistent** | `SHOW archive_mode` → `off` | O comandă `DROP`/`UPDATE` greșită nu e recuperabilă înainte de următorul dump. |

**Formula de recuperare, așa cum stă astăzi:**
`RTO_discard_date = până la 24 h + timpul de reconstructire a imaginii + timpul de refacere a secretelor`
`RTO_host_loss = ∞ (procedura nu există: nu e definit unde se reface gazda, nu există backup al volumelor, nu există backup al secretelor)`

### 6.4 Ce mai stă între platformă și un dezastru real

1. **Nicio copie în afara hostului** (`INFRA-P1-01`) — e condiția care face ca toate celelalte măsuri să nu conteze.
2. **RAID 0** (`INFRA-P1-02`) — o singură eroare de disc pe hipervisor pierde simultan platforma și backup-ul.
3. **Fără PITR** (`INFRA-P1-07`) — corupția logică nu e recuperabilă.
4. **Volumul de încărcări necuprins** (`INFRA-P1-08`) — atașamentele clienților se pierd definitiv.
5. **Secretele nu sunt în backup** — la restaurare, `SESSION_SECRET` (invalidând toate sesiunile), `PTERODACTYL_APP_KEY` și cheile Stripe trebuie refăcute; până atunci platforma e închisă pentru clienți.
6. **Nu există procedură documentată de refacere a gazdei** — nu există un document care să spună cum se reface VM 103 de la zero (rețea, volume, secrete, DNS, certificate).
7. **Imaginile nu sunt într-un registru** (`INFRA-P1-15`) — reconstrucția depinde de GitHub și de un build reușit.

### 6.5 Ce **nu** am făcut, pentru că ar fi fost o scriere în producție

- Nu am rulat `scripts/restore.sh` (restaurare peste baza vie) — ar fi suprascris baza de producție.
- Nu am rulat `scripts/backup.sh` cu o țintă off-host — nicio țintă nu e configurată, iar crearea ei e o decizie de operator.
- Nu am construit/împins imagini, nu am aplicat o migrare, nu am modificat `.env`.
- Nu am șters bazele de test rămase (`INFRA-P1-17`) — `DROP DATABASE` în producție cere autorizare.
- Nu am oprit procesele de verificare ale auditului (`INFRA-P1-18`) — aparțin altor lucrători din această rundă; se opresc la finalul rundei.

---

## 7. Plan de recuperare, așa cum ar trebui executat

> Fiecare pas de mai jos e **exECUTABIL** în forma dată, cu scripturile reale din `/opt/blipmade/scripts`. Pașii marcați **[LIPSEște]** nu au o procedură existentă și trebuie scrise/autorizate înainte de a conta drept plan.

### 7.1 Containerul API a căzut

```bash
# 1. Starea reală (nu dați restart la întâmplare)
ssh debian@10.77.0.13
cd /opt/blipmade
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps
sudo docker logs --tail 100 blipmade-api-1

# 2. Restart controlat al serviciului (cu recreate dacă imaginea e coruptă)
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml restart api
# sau, dacă imaginea e coruptă:
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --force-recreate api

# 3. Verificare
curl -s http://127.0.0.1:3100/health | jq          # status: ok, database: true, redis: true
curl -s http://127.0.0.1:3100/api/status | jq .overall
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps   # api healthy

# 4. Dacă API-ul pornește dar migrarea e pending: entrypoint-ul aplică automat
#    (RUN_MIGRATIONS=true -> prisma migrate deploy, api/docker-entrypoint.sh:8-11)
sudo docker logs blipmade-api-1 | grep "Applying database migrations"

# 5. Coada: joburile pierdute sunt requeued de worker la fiecare 60s
sudo docker logs --tail 50 blipmade-worker-1 | grep reconcile
```

**Observații:** `restart: unless-stopped` e pe toate serviciile → un container oprit manual rămâne oprit până la `docker compose up -d`. Migrările sunt aplicate automat la pornire. **Nu există** un script de "readiness gate" care să blocheze redeploy-ul până când API-ul e sănătos; verificarea e manuală, cu `curl` pe `/health`.

### 7.2 Baza de date coruptă

```bash
# 1. NU porniți cu "repair" pe loc. Izolați mai întâi.
sudo docker compose -f compose.yml stop api worker

# 2. Verifică backup-urile și integritatea lor
ls -la /var/backups/blipmade/
cd /var/backups/blipmade && sha256sum --check blipmade-scheduled-*.tar.gz.sha256

# 3. Drill de verificare FĂRĂ a atinge producția (sigur, rulează de fiecare dată)
cd /opt/blipmade && sudo -u debian bash scripts/restore-drill.sh
#    -> "RESULT: the backup restores into a database that matches the live one."

# 4. Restaurare peste producția de pe ultima arhivă (CERE INTERVENȚIE UMANĂ)
cd /opt/blipmade
sudo -u debian bash scripts/restore.sh /var/backups/blipmade/blipmade-scheduled-<stamp>.tar.gz
#    -> verifică checksum-ul, listează dumpul, cere confirmarea "restore", apoi pg_restore --clean --if-exists

# 5. După restore: pornirea stivei aplică migrările lipsă
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d
curl -s http://127.0.0.1:3100/health | jq
```

**Observații critice:**
- `restore.sh` **suprascrie** baza vie cu `--clean --if-exists` — pierderile de date între ultimul dump și momentul restore-ului sunt **definitiv pierdute** (fără PITR, `INFRA-P1-07`).
- `restore.sh` **nu** restaurează `.env` și **nu** restaurează volumul de încărcări → după un disaster complet, secretele trebuie refăcute manual (`INFRA-P1-08`).
- **[LIPSEște]** Nu există o procedură documentată de refacere a **gazdei** (VM 103) de la zero: cine reface discul, cine atașează volumele, cine reface `.env`, cine reînregistrează DNS-ul. **[LIPSEște]** Nu există o politică de reținere multi-zi: `BACKUP_KEEP_DAYS=14`, dar cu o singură arhivă programată existentă, istoricul nu există încă.

### 7.3 Deploy rogue (cod nedorit în producție)

```bash
# 1. Identifică ce rulează acum
cd /opt/blipmade
git log --oneline -3
git status -sb
git rev-parse HEAD:api/src          # arborele efectiv al codului de aplicație
sudo docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}"

# 2. Compară cu commitul de producție cunoscut (2e1e78a)
git diff --stat 2e1e78a HEAD -- api/src web/src web/server.mjs api/prisma

# 3. Rollback: sursa e în origin, imaginile nu se păstrează -> trebuie rebuild
git checkout 2e1e78a
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build api worker web
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d
curl -s http://127.0.0.1:3100/health | jq
```

**Observații:**
- Rollback-ul e **build + recreate**, nu „redeploy rapid" — fără registru și fără imagini păstrate (`INFRA-P1-15`).
- Migrările deja aplicate **nu** se inversează automat (`prisma migrate deploy` e forward-only). O migrare rogue rămâne în baza de date; e nevoie de o migrare manuală de compensare. **[LIPSEște]** Nu există un `migrate reset`/rollback documentat.
- `git checkout 2e1e78a` lasă arborele în „detached HEAD" și `main` local e deja cu un commit înainte de origin (`INFRA-P1-23`) — atenție la ce se împinge după rollback.

### 7.4 Cheie API compromise

```bash
# 1. Rotirea cheii de aplicație Pterodactyl (PTERODACTYL_APP_KEY) se face in panou
#    (Panel > Settings > API Keys) sau din DB-ul panoului.
# 2. Inainte: gaseste toate consumatorii cheii pe platforma
sudo grep -rl "PTERODACTYL_APP_KEY" /opt/blipmade --include="*.yml" --include="*.sh" --include="*.ts" 2>/dev/null

# 3. Actualizeaza in /opt/blipmade/.env si rehidrateaza containerele
sudo -n true   # editarea lui .env este o operatie de operator (fiecare secret e redat in raport)
sudo docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --force-recreate api worker
curl -s http://127.0.0.1:3100/health | jq .pterodactyl

# 4. Verifica ca vechea cheie nu mai functioneaza (test negativ, la panou)
```

**Observații:**
- Cheia trăiește în `.env`, care e în afara arhivei de backup (`INFRA-P1-08`) → **nu există o copie de rezervă a secretului**; dacă e pierdută, trebuie regenerată la panou.
- `PTERODACTYL_CLIENT_KEY` e deja **gol** în `.env` (status `EMPTY`), deci niciun consumator nu depinde de el.
- Cheile Stripe live nu există încă (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` = `EMPTY`) → **nu există cheie de plată de rotit în acest moment**; când se vor introduce, rotirea trebuie prevăzută în procedură.
- **[LIPSEște]** Nu există o listă de „unde se rotesc toate cheile" (`.env` + panoul Pterodactyl + registrul de containere + eventualele secrete din pipeline). Nu există nici măsurare a impactului unei chei compromise (ce cereri au folosit-o).

### 7.5 Pași care **nu există** și trebuie scrise

| Gap | De ce contează |
|---|---|
| Procedură de refacere a gazdei (VM 103 de la zero) | Fără ea, RTO-ul la pierderea gazdei e nelimitat |
| Politică de reținere și test de rotire a backup-urilor | Cu o singură arhivă programată, „retenția de 14 zile" nu e dovedită |
| PITR (arhivare WAL + slot) | Singura protecție împotriva corupției logice |
| Rotirea secretelor (listă, procedură, fereastră) | Cheia Pterodactyl și, în viitor, cele Stripe |
| Alertare pentru backup eșuat / lipsă / disc plin | `INFRA-P1-12` |
| Politica de incidente pentru expunerea publică a hipervisorului | `INFRA-P1-04` |

---

## 8. Ce nu am putut verifica

1. **Configurația reverse-proxy-ului de la margine (`10.77.0.12`)** — timeout-uri, keep-alive, dimensiuni de buffer, `X-Forwarded-For`, TLS ciphers per rută, HSTS, caching. Fără acces SSH (`Permission denied (publickey)`). **Aceasta e cauza probabilă a `INFRA-P1-09`** și nu poate fi localizată exact de aici.
2. **Contul Cloudflare** — zona DNS, origin-ul configurat, certificate mode (Full/Full-strict), WAF, rate limiting, cache rules, origin certificate. Am observat doar comportamentul public (TLS, anteturi, DNS).
3. **Politica de backup a hipervisorului Proxmox** — `pvesm status` arată un singur storage (`local`, tip `dir`), fără replicare; dacă există o copie externă la nivel de Proxmox (vzdump către altă mașină), nu am avut cum s-o verific și nici măsură.
4. **Panoul Pterodactyl (`10.77.0.10`) și nodul (`10.77.0.11`)** — configurația Wings, a reverse-proxy-ului panelului, starea reală a containerelor de joc, backup-ul panoului.
5. **Comportamentul cozilor în eșec** — am citit codul și am măsurat starea curentă (cozile sunt goale), dar **nu am declanșat** oProvisioning eșuată pentru a măsura în practică cele 5 încercări, backoff-ul și compensația. Comportamentul e descris din cod (`api/src/services/provisioning.ts:1391-1420`, `api/src/services/queue.ts:27`, `:60-67`, `:92-96`).
6. **Comportamentul la pierderea hostului** — nu am simulat pierderea hostului, fiindcă asta ar însemna distrugerea mediului de producție.
7. **Istoric** — journalul acoperă un singur boot (2026-10-22 16:48 → acum). Nu există istoric de OOM, de incident sau de upgrade-uri anterioare; `journalctl --list-boots` arată o singură intrare.
8. **Consumul real de resurse sub încărcare** — am citit `docker stats` în repaus (API 48,8 MiB, postgres 1,357 GiB). Nu am generat încărcare; limitele recomandate din `INFRA-P1-05` trebuie calibrate cu un test de sarcină.
9. **Transmiterea corectă a adresei clientului prin Cloudflare** — am dedus comportamentul din jurnalul API-ului, dar nu am putut citi header-urile pe care gateway-ul le trimite efectiv către web.
10. **Politica de retenție a Cloudflare și efectul ei asupra `/api/*`** — anteturile văzute public (`cache-control: no-cache`, `cf-cache-status: DYNAMIC`) indică că nu se cacheuiește, dar nu am măsurat comportamentul pe rute necacheuite.
11. **Faptul că `app.blipmade.com` nu are înregistrare DNS publică** — confirmat (`dig @1.1.1.1 app.blipmade.com A` → fără rezultat), dar mecanismul de emitere a rutelor publice pentru instanțe (Caddy admin pe VM 102) nu a putut fi verificat: `2019` e închis și `DOMAIN_BASE` e gol.

---

## 9. Blocaje de infrastructură pentru un GO comercial (ordine de prioritate)

| # | Blocaj | De ce blochează un GO | ID | Autorizare |
|---|---|---|---|---|
| 1 | **Nicio copie de backup în afara hostului, pe un storage RAID 0** | Fără asta, backup-ul nu e backup: o singură eroare de disc pe hipervisor pierde simultan platforma și datele. Un GO comercial cu date de clienți cere o garanție de recuperare. | `INFRA-P1-01`, `INFRA-P1-02` | Operator (țintă + cheie + RAID) |
| 2 | **Interfața de administrare Proxmox (8006), rpcbind (111) și spiceproxy (3128) sunt accesibile public, fără firewall** | Un server de administrare expus public, pe adresa IP care deservește și platforma. Compromisează toate cele patru VM-uri și toate datele. | `INFRA-P1-03`, `INFRA-P1-04` | Operator (firewall) |
| 3 | **Fără limită de resurse și fără swap** | Un vârf de memorie într-un container omoară hostul, deci și baza de date, pentru că nu există amortizor și nu există limite. | `INFRA-P1-05` | Parțial (cod: Nu; swap: Da) |
| 4 | **Fără PITR și fără acoperirea volumului de atașamente** | Corupția logică și pierderea fișierelor clienților nu sunt recuperabile. Pentru o platformă care vinde stocare și bilete cu fișiere, e o limită de garanție. | `INFRA-P1-07`, `INFRA-P1-08` | Parțial (cod: Nu; arhivare WAL: Da) |
| 5 | **Jurnalele nu sunt rotite și nu există monitorizare sau alertare** | La 3 dimineața, un backup eșuat, un disc plin sau un OOM nu produc niciun semnal — decât un client nemulțumit. Fără asta, niciun alt blocaj de mai sus nu poate fi detectat în timp util. | `INFRA-P1-06`, `INFRA-P1-12` | Operator (agent + releu) |
| 6 | **Pe traseul public, API-ul vede adresa Cloudflare, nu a vizitatorului** | Limitarea pe IP (inclusiv cea de autentificare) se aplică per POP, nu per persoană; jurnalul de audit nu mai poate atribui abuzul. Pentru o platformă cu autentificare, e o problemă de conformitate, nu doar de metrică. | `INFRA-P1-09` | Operator (gateway) + cod (web) |
| 7 | **Nu există procedură de refacere a gazdei, nu există registru de imagini, secretele nu sunt în backup** | RTO-ul la pierderea hostului e „ore sau nu se poate" — nu un număr. Fără registru, rollback-ul e un build; fără secrete în backup, refacerea e manuală. | `INFRA-P1-15`, secțiunea 6.5 | Operator (registru + document) |
| 8 | **Resturi de audit în producție: 9 baze de test, 7 099 e-mailuri nedeliverate (46 MB)** | Suprafață de produs expusă și consum nejustificat în instanța care ține datele clienților. | `INFRA-P1-17` | Operator (ștergere) + SMTP |
| 9 | **Identificatorul de corelare (`requestId`) nu e utilizabil, iar `/api/status` e public și dezvăluie topologia** | Incidentul nu poate fi urmărit de la „requestId" la linia de jurnal, iar un atacator vede numărul de porturi libere. | `INFRA-P1-11`, `INFRA-P1-14` | Nu (cod) |
| 10 | **Stack-ul de verificare al auditului e publicat pe `0.0.0.0`; LLMNR ascultă pe toate interfețele** | Igienă: un stack de test „izolat" e accesibil din rețea, iar LLMNR e un vector de amplificare. | `INFRA-P1-18`, `INFRA-P1-19` | Nu (cod) / Da (host) |

---

*Raport produs în cadrul fazei 6 a auditului post-remediere. Toate comenzile au fost executate în regim de citire, cu excepția drill-ului de restaurare, care a lucrat exclusiv într-o bază de scratch (`blipmade_restore_check`) și a fost verificat că nu a modificat baza de producție. Niciun secret nu apare în acest document.*
