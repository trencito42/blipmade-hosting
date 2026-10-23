# 03 — Recuperare după dezastru: ce supraviețuiește

**Data auditării:** 2026-10-23 · **Metodă:** inspecție read-only a hypervisorului, a scripturilor de backup din repository, a stării reale a backup-urilor și a configurației Cloudflare/DNS.

Clasele de verificare sunt cele din `00-BRIEFING.md`.

---

## 1. Răspunsul scurt

> **Verdict: „No off-host recovery strategy exists for important customer data" este confirmat, fără nuanțe.**
>
> **Nu există o singură copie, în afara tabloului RAID 0, a vreunei date de client.** Nu există țintă de backup configurată, nu există backup programat, backup-ul Pterodactyl este dezactivat per server, iar singurele arhive existente sunt pe același disc cu datele pe care le protejează. **Singura componentă cu o copie în afara hostului este codul sursă**, care stă în GitHub.
>
> Consecința: **pierderea unui singur SSD distruge ireversibil datele tuturor clienților, ale platformei și ale panoului.** Nu este o probabilitate mică și nu este un incident rar — RAID 0 pe două discuri enterprise nu are nicio protecție, iar backup-ul local ar fi și el pe aceleași discuri.

---

## 2. Inventar pe componentă

| Componentă | Ce se pierde dacă pica azi | Ce este copiat acum | Unde ar ajunge copia | Timp de restaurare |
|---|---|---|---|---|
| **Disc hypervisor (`md1`, RAID 0)** | **Tot**: cele 4 discuri de VM, toate bazele de date, tot codul, toate secretele | **Nimic** | — | **Imposibil** pentru datele de client |
| **VM 103** (platforma) | API, web, worker, Postgres, Redis, volumele `upload_data` și `backup_data` | 2 arhive de drill din 2026-10-22, **neschedulate**, pe același disc | `/var/backups/blipmade` — **același RAID 0** | Reconstrucție VM ~1–2 h + restaurare DB < 5 min |
| **VM 101** (noda Wings) | **Toate fișierele clienților**, lumea de joc, bazele de date ale clienților | **Nimic** (`feature_limits.backups = 0` pe toate cele 5 servere) | — | **Imposibil** |
| **VM 100** (panoul) | Panelul, baza lui de date, ouă, noduri, alocări, servere, utilizatori Pterodactyl | **Nimic verificabil** (`BLOCKED` — VM inaccesibil) | necunoscut | Necunoscut; fără backup, reinstall complet |
| **Postgres (platformă)** | Toată data de business: utilizatori, comenzi, facturi, plăți, abonamente, ticket-uri, metadatele instanțelor, domenii, audit log, joburi de provisionare | Doar dacă se rulează `scripts/backup.sh` **manual** | `/var/backups/blipmade` — **același RAID 0** | **< 5 min** (dump 11 MB) |
| **Baza de date a panoului (VM 100)** | Utilizatori Pterodactyl, ouă, noduri, alocări, servere, permisiuni | **Necunoscut** (`BLOCKED`) | necunoscut | necunoscut |
| **Configurația cloud** (zona DNS Cloudflare) | Toate numele publice și regulile de proxy | **Nimic** — niciun token API Cloudflare în `.env` | — | Re-intrare manuală, 15–60 min |
| **Repository-ul** | Sursa aplicației | **DA** — `origin git@github.com:trencito42/blipmade-hosting.git`, working tree curat la `7df3973` | **GitHub** | **Minute** (`git clone`) |

---

## 3. Verificarea afirmației critice, piesă cu piesă

### 3.1 Nu există țintă de backup

| Verificare | Rezultat | Clasă |
|---|---|---|
| `pvesh get /cluster/backup` | `[]` — niciun job | `VERIFIED` |
| `cat /etc/pve/vzdump.cron` | doar `PATH=`; **nicio linie de job** | `VERIFIED` |
| `ls -la /var/lib/vz/dump/` | **gol** | `VERIFIED` |
| `crontab -l` pe host | *no crontab for root* | `VERIFIED` |
| `/etc/cron.d/` | doar `e2scrub_all` și `zfsutils-linux` | `VERIFIED` |
| `systemctl list-timers` | niciun timer de backup | `VERIFIED` |
| `prune-backups keep-all=1` | prezent în `storage.cfg`, dar **inert** — păstrează la nesfârșit ceea ce nu scrie nimeni | `VERIFIED` |

### 3.2 Nu există backup programat al platformei

| Verificare | Rezultat | Clasă |
|---|---|---|
| Cron pe VM 103 | `crontab` **nu este instalat** | `VERIFIED` |
| Timers pe VM 103 | doar `tmpfiles-clean`, `dpkg-db-backup`, `logrotate`, `apt-daily*`, `e2scrub_all`, `fstrim` | `VERIFIED` |
| `OFFSITE_TARGET` | **neconfigurat** | `VERIFIED` |
| `OFFSITE_TRANSPORT` | **neconfigurat** | `VERIFIED` |
| `OFFSITE_ENCRYPTION_KEY` | **neconfigurat** | `VERIFIED` |
| Arhive existente | `blipmade-drill-20261022T212029Z.tar.gz` (+`.sha256`), `blipmade-drill-20261022T232117Z.tar.gz` (+`.sha256`) — **ambele pe același RAID 0**, ambele din 2026-10-22, ambele cu eticheta „drill" | `VERIFIED` |

**Workflow-ul „nightly backup drill" nu protejează nimic.** `.github/workflows/nightly-backup-drill.yml` rulează zilnic la 03:17 UTC, însă creează o bază de date PostgreSQL **de unică utilizare** pe runnerul GitHub Actions, rulează `backup.sh` și `restore-drill.sh` **acolo**, cu `BACKUP_DIR=/tmp/backups` al runnerului. **Nu atinge baza de date deployată și nu produce nicio copie a datelor de producție.** `CODE-INSPECTED` (fișier citit integral).

### 3.3 Backup-ul Pterodactyl este dezactivat

Toate cele 5 servere din panou au `feature_limits: { databases: 0, allocations: 0, backups: 0 }` — `VERIFIED`. Mecanismul de backup per instanță există în cod (`api/src/services/panel/operations.ts`, `api/src/services/pterodactyl/client.ts`) și este accesibil din interfața clienților, dar **nu poate fi folosit**: panoul refuză, pentru că limita este `0`.

### 3.4 Secretele nu au nicio copie

| Fapt | Sursă | Clasă |
|---|---|---|
| `.env` conține `SESSION_SECRET`, `POSTGRES_PASSWORD`, `PTERODACTYL_APP_KEY`, `PTERODACTYL_CLIENT_KEY`, `PANEL_KEYMINT_SECRET`, `BLIPMADE_INTERNAL_API_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_ENROLLMENT_KEY`, `CADDY_ADMIN_TOKEN`, `DATABASE_URL`, `STRIPE_SECRET_KEY` | `.env` de pe VM 103 (29 variabile; **valorile nu au fost citite**) | `VERIFIED` |
| `.env` este **ignorat de git** | `.gitignore:1` și `git check-ignore -v .env` | `VERIFIED` |
| `.env` **nu este inclus în arhivele de backup** | `backup.sh`: `tar --exclude='.env' ... compose.yml compose.api.yml compose.web.yml api/prisma web/package.json` | `CODE-INSPECTED` |
| Mirror-ul `/root/blipmade-work` **nu conține** `.env` | `ls -la .env` → *No such file or directory* | `VERIFIED` |

**Concluzie: toate secretele de producție există într-un singur fișier, pe un singur disc, într-un tablou RAID 0, fără nicio copie.** Chiar și backup-ul bazei de date, dacă ar fi programat, **nu** le-ar conține.

### 3.5 Ce este recuperabil astăzi

| Element | Recuperabil? | Cum | Clasă |
|---|---|---|---|
| Codul sursă | **DA** | `git clone git@github.com:trencito42/blipmade-hosting.git`; working tree curat la `7df3973` | `VERIFIED` |
| Configurația Docker | **DA** | `compose.yml`, `compose.api.yml`, `compose.web.yml` sunt în git și în arhivul de backup | `CODE-INSPECTED` |
| Schema Prisma și migrările | **DA** | `api/prisma` este în git și în arhivul de backup | `CODE-INSPECTED` |
| **Secretele** | **NU** | nu sunt în git, nu sunt în backup, nu există în altă parte | `VERIFIED` |
| **Datele de business** | **NU** | nicio copie în afara RAID 0 | `VERIFIED` |
| **Fișierele clienților** | **NU** | backup per instanță dezactivat | `VERIFIED` |
| **Baza de date a panoului** | **NECUNOSUT** | VM 100 inaccesibil | `BLOCKED` |
| **DNS** | **DA** (dacă pierderea e doar a hostului) | zona stă la Cloudflare, nu pe host | `VERIFIED` |
| **Certificatele TLS** | **NU** | sunt în `/var/lib/caddy/.local/share/caddy/certificates` pe VM 102; se re-emit cu ACME | `VERIFIED` |

---

## 4. Lista exactă a datelor fără nicio copie în afara RAID 0

Conform cerinței, enumerate explicit:

| # | Categorie | Unde stă azi | Există o copie în afara RAID 0? | Impact real azi |
|---|---|---|---|---|
| 1 | **Fișierele instanțelor clienților** (cod, configurație, conținut încărcat) | `/var/lib/pterodactyl/volumes` pe VM 101 → disc VM 101 → RAID 0 | **NU** | 5 servere, 3 legate de conturi Blipmade |
| 2 | **Lumea de joc / datele de joc** | la fel — volumele Wings pe VM 101 | **NU** | Gol azi (niciun produs de joc vândabil), dar devine imediat dată de client la primul client de joc |
| 3 | **Bazele de date create de clienți** | MySQL/MariaDB pe VM 101, în volumele Pterodactyl | **NU** | **Zero astăzi** (`feature_limits.databases = 0` pe toate serverele). **Devine dată de client de îndată ce se ridică limita** |
| 4 | **Baza de date Postgres a platformei** | volum Docker `blipmade_postgres_data` pe VM 103 → RAID 0 | **NU** | 11 MB acum: 6 utilizatori, 3 instanțe, 5 comenzi, 11 ticket-uri, 251 sesiuni, 0 abonamente, 0 facturi, 0 plăți |
| 5 | **Baza de date a panoului Pterodactyl** (VM 100) | disc VM 100 → RAID 0 | **NU / necunoscut** (`BLOCKED`) | **Nucleul întregii operațiuni**: ouă, noduri, alocări, servere, utilizatori Pterodactyl, permisiuni. Fără ea, platforma nu poate nici provisiona |
| 6 | **Volumul `upload_data`** (fișiere încărcate de clienți prin API) | volum Docker pe VM 103 → RAID 0 | **NU** | Gol acum (8,0 KiB; 0 atașamente) |
| 7 | **Volumul `backup_data`** | volum Docker pe VM 103 → RAID 0 | **NU** | Conține **doar spool-ul de e-mail** (26 fișiere `.json`), nu backup-uri |
| 8 | **Redis** (sesiuni, coadă de provisionare) | volum Docker `blipmade_redis_data` pe VM 103 → RAID 0 | **NU** | 2,3 MiB. Pierderea invalidează toate sesiunile (251) și coada de job-uri |
| 9 | **`.env` — toate secretele** | VM 103 → RAID 0 | **NU** | Toate cheile API, secretul de sesiune, parola Postgres, cheile de bridge cu panoul |
| 10 | **Certificatele TLS** | VM 102 → RAID 0 | **NU** | Se re-emit (ACME), deci pierdere minoră, cu RTO de minute |
| 11 | **Logurile și evenimentele Pterodactyl** | disc VM 100/101 → RAID 0 | **NU** | Pierdere de diagnostic post-incident |

> **Observație esențială: categoriile 2 și 3 sunt goale azi, dar nu pentru că sunt protejate — pentru că nu există încă clienți de joc.** Când se adaugă produsul Minecraft, lumea de joc devine automat dată de client **fără nicio copiere**, pentru că backup-ul per instanță este dezactivat *la nivel de nod*, nu per produs. Mecanismul trebuie reparat **înainte** de vânzare, nu după.

---

## 5. Ce **nu** este recuperabil azi — explicit

1. **Fișierele oricărui client.** Pierdute definitiv dacă dispare discul. Fără backup per instanță și fără snapshot-uri de VM.
2. **Lumea de joc a oricărui client.** Idem.
3. **Bazele de date ale clienților.** Idem.
4. **Baza de date a platformei**, dacă nu s-a rulat `backup.sh` manual înainte de incident. Cele două arhive existente sunt din 2026-10-22 și **nu sunt programate** — de azi în cinci zile nu va mai exista niciuna.
5. **Baza de date a panoului.** Probabil nicio copie; `BLOCKED` pentru confirmare.
6. **Secretele.** Nu se pot reface: `SESSION_SECRET` invalidă toate sesiunile și toate parolele stocate cu `SESSION_SECRET`; cheile de bridge cu panoul (`PANEL_KEYMINT_SECRET`, `PTERODACTYL_APP_KEY`) trebuie **re-emise în panou** și redistribuite.
7. **DNS-ul**, dacă se pierde și contul Cloudflare. În pierderea hostului, DNS-ul supraviețuiește (e la Cloudflare).
8. **Orice instanță clienți ale cărei fișiere se aflau în volumele Wings.** Aceleași cu 1.

---

## 6. Planul de recuperare, în etape

### Etapa 0 — cerințe care **nu există azi** (blocatori hardware/contractuali)

Niciuna dintre etapele următoare nu poate fi executată până când acestea sunt îndeplinite:

| # | Cerință | De ce este necesară | Cum se satisface | Stare |
|---|---|---|---|---|
| **R0.1** | **O țintă de stocare off-host** | Fără ea nu există backup off-host, prin definiție | Trei variante, în ordinea preferinței: **(a)** Proxmox Backup Server pe un al doilea host (nativ, dedup, incremental, verificare) — recomandat; **(b)** stocare obiect compatibilă S3 (Cloudflare R2 / Backblaze B2 / MinIO) cu `rclone`; **(c)** o a doua mașină sau un NAS prin `ssh` | ❌ **nu există** |
| **R0.2** | **Cheie de acces la țintă** | `backup-offsite.sh` folosește transportul `rclone` (implicit) sau `ssh` | Pentru `ssh`: cheie dedicată, restricționată la o singură cale. Pentru `rclone`: `rclone config` | ❌ **nu există** |
| **R0.3** | **Instalarea lui `rclone`** | **instrumentul implicit al lui `backup-offsite.sh` nu este instalat** pe VM 103 | `apt install rclone` | ❌ **lipsă** (`rclone` absent — `VERIFIED`) |
| **R0.4** | **Cheia de criptare** | `OFFSITE_ENCRYPTION_KEY` (fallback `openssl`) sau cheia `age` | `age` **nu este instalat** (`VERIFIED`), deci calea `openssl` (`aes-256-cbc`, `pbkdf2`) | ❌ **neconfigurată** |
| **R0.5** | **Un depozit de secrete** | `.env` nu este în backup și nu este în git | Manager de parole cu export, sau un fișier `.env` criptat în off-host, cu cheie separată | ❌ **nu există** |
| **R0.6** | **Acces la panou pentru backup-ul lui** | Baza de date a panoului este pe VM 100, inaccesibilă agentului | Cheie SSH sau agent gazdă pornit pe VM 100 | ❌ **blocat** |
| **R0.7** | **Programare efectivă** | Scripturile există, dar nu sunt chemate de nimic | `systemd timer` (mai robust decât cron, care nu este instalat) | ❌ **neprogramat** |

### Etapa 1 — Platforma (VM 103): backup programat + off-host

**Ce se copiază:** dump-ul Postgres (`pg_dump --format=custom`), arhiva de configurație (fără `.env`), `sha256sum`. Tot ce poate face deja `scripts/backup.sh`.

| Parametru | Propunere | Raționament |
|---|---|---|
| **Frecvență locală** | **oră** | Dump-ul face 11 MB acum și arhiva comprimată ~30 KB. Un cost neglijabil pentru un RPO de 1 h. `INFERRED` (estimare pe baza dimensiunii măsurate) |
| **Frecvență off-host** | **la 6 ore** + **imediat după fiecare migrare** | Ținta off-host trebuie să fie suficient de departe ca să justifice costul, dar nu atât de rare încât RPO-ul să depășește o zi |
| **Retenție locală** | 7 zile (`BACKUP_KEEP_DAYS=7`) | Implicitul scriptului este 14; 7 este suficient pentru investigarea incidentelor |
| **Retenție off-host** | 30 zile zilnic + 12 luni lunar | Politica standard de retenție |
| **Cifrare** | `openssl aes-256-cbc -pbkdf2` (calea implicită, `age` nefiind instalat) | `backup-offsite.sh` alege singur fallback-ul; **cheia nu se scrie niciodată în fișierul copiat** |
| **Verificare** | `restore-drill.sh` zilnic, **pe host** | Scriptul există și compară automat tabele, utilizatori, produse și migrări între baza live și cea restaurată |
| **Verificare a copiei off-host** | **lunar**, pe o altă mașină | Conform `docs/RUNBOOK.md` §9: un drill local **nu dovedește** că copia off-host e lizibilă. Procedura există deja documentată |
| **RPO** | **6 h** (off-host) / **1 h** (local) | Derivat din frecvențele de mai sus |
| **RTO** | **< 5 min** pentru baza de date, **~1–2 h** pentru VM-ul complet | Restaurarea unui dump de 11 MB este sub un minut; refacerea mașinii virtuale domină timpul |

**Implementare:**

```ini
# /etc/systemd/system/blipmade-backup.service  (pe VM 103)
[Unit]
Description=Blipmade backup (local + off-host)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/blipmade
ExecStart=/bin/bash -c 'set -a; . ./.env; set +a; bash scripts/backup.sh hourly'
# Dupa primele 7 zile, se activeaza si copia off-host:
# ExecStart=/bin/bash -c 'set -a; . ./.env; set +a; bash scripts/backup.sh hourly && bash scripts/backup-offsite.sh'
TimeoutStartSec=1800
```

```ini
# /etc/systemd/system/blipmade-backup.timer
[Unit]
Description=Backup Blipmade every hour
[Timer]
OnCalendar=*-*-* *:05:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
```

**Restaurare** (procedura există deja, `scripts/restore.sh`):

```bash
cd /opt/blipmade
set -a; . ./.env; set +a
bash scripts/restore.sh /var/backups/blipmade/blipmade-hourly-<stamp>.tar.gz --yes
# scriptul: verifica sha256 -> listeaza dump-ul -> pg_restore --clean --if-exists -> verifica numarul de tabele
```

### Etapa 2 — Secretele

| Parametru | Propunire | Raționament |
|---|---|---|
| **Ce** | `.env` complet, plus cheile necesare la panou | Singurul loc unde există |
| **Unde** | Depozit de secrete (R0.5) — **nu** în același bucket și **nu** cu aceeași cheie ca backup-urile | Separarea limitează blast radius-ul unei scurgeri de cheie |
| **Frecvență** | La **fiecare schimbare**, obligatoriu | `.env` nu se schimbă des |
| **RPO** | **ore** (timpul manual până la actualizare) | Acceptabil: o cheie pierdută se poate re-emite, cu excepția `SESSION_SECRET` |
| **RTO** | **15 min** | Reintroducerea fișierului și repornirea containerelor |

> **Procedura pentru `SESSION_SECRET`**, din `docs/RUNBOOK.md` §8: rotația deconectează fiecare client și face ilizibile parolele stocate. **Resetarea parolei trebuie să existe și să fie folosită înainte de rotație**, iar fiecare schimbare de credential trebuie scrisă în `AuditLog`.

### Etapa 3 — Mașinile virtuale: `vzdump` către o țintă off-host

Acesta este singurul mecanism care acoperă **fișierele clienților**, fiindcă le copiază împreună cu discul VM 101.

| Parametru | Propunire | Raționament |
|---|---|---|
| **Ce** | `vzdump` pentru VM 100, 101, 102, 103 | VM 101 conține volumele Wings cu fișierele clienților; VM 100 conține baza panoului |
| **Cum** | Stocare Proxmox de tip `pbs` (dacă se face R0.1a) sau `dir` montat pe un share | `storage.cfg` va primi o a doua definiție `storage` |
| **Frecvență** | **zilnic** pentru toate VM-urile + **oră** pentru VM 103 | VM 103 se schimbă continuu; VM 101 și 100 se schimbă mai rar |
| **Retenție** | zilnic 14 zile, săptămânal 8 săptămâni, lunar 12 luni | Politica standard Proxmox |
| **RPO pentru fișierele clienților** | **24 h** | Limitat de cât de des se poate face `vzdump` al unui VM de 900 GB |
| **RTO** | **2–4 h** pentru VM 101 (restore + repunere în funcțiune + reconfigurare Wings) | `INFERRED`, pe baza dimensiunii (900 GB virtual, 9,81 GiB real) și a pașilor de reinstalare |

**Configurația țintă în `storage.cfg`** (nu aplicată — modificare de producție):

```
# stocare off-host, de exemplu Proxmox Backup Server
pbs: offhost
    datastore offhost
    server backup.example.net
    fingerprint <FP>
    content backup
    prune-backups keep-last=14,keep-weekly=8,keep-monthly=12
    encryption <cheie>
```

**Cum se verifică un restore** — cu `vzdump`, nu cu un mirror:

```bash
# pe host-ul nou, dupa ce stocarea off-host este atasata:
qmrestore 103 <archive> --storage local
# apoi, pe masina virtuala restaurata:
cd /opt/blipmade && bash scripts/restore-drill.sh
```

### Etapa 4 — Backup per instanță, pentru clienți

Mecanismul Pterodactyl există, dar este **dezactivat la nivel de nod** (`feature_limits.backups = 0`). Două opțiuni:

| Opțiune | Mecanism |avantaj | Risec |
|---|---|---|---|
| **A. `vzdump` de VM 101** (recomandat ca bază) | Etapa 3 | Nu necesită nimic în panou; copiază toate volumele, inclusiv bazele de date ale clienților | RPO 24 h, granularitate grosieră |
| **B. Backup Pterodactyl per instanță** | Ridicarea lui `feature_limits.backups` și mutarea căii de backup a lui Wings pe un volum montat off-host | Granularitate per client, interfață deja existentă în cod (`createBackup`, `downloadBackup`, `restoreBackup`) | Necesită un share montat (NFS/rclone) — **punct de unic eșec nou**; și un `rclone` care azi nu există |

**Recomandare: A ca bază obligatorie, B ca adaos.** B nu trebuie să fie implementat ca să existe o recuperare.

### Etapa 5 — Configurația cloud

| Element | Ce se pierde | Cum se reface | RTO |
|---|---|---|---|
| Zona DNS Cloudflare | Doar dacă se pierde contul Cloudflare | Re-intrare manuală a celor 7 înregistrări | 15–60 min |
| Token API Cloudflare | Nu există în `.env` (verificat: nicio variabilă `CLOUDFLARE*`) | Generarea unui token API și stocarea lui în depozitul de secrete | 30 min |
| Regulile de proxy | — | Re-verificare prin sondaj: `curl https://blipmade.com/api/health` trebuie să întoarcă 200 | 15 min |
| Certificatele TLS | Sunt pe VM 102, pierdut cu discul | Caddy le re-emite automat prin ACME la pornire | 5–10 min |

**Acțiune preventivă:** adăugarea unui export al zonei DNS (acceptat de formatul standard al instrumentelor DNS) în backupul off-host, ca o copie de text, plus un token API cu permisiuni minime, stocat în depozitul de secrete. **DNS-ul nu este azi în backup, dar nici nu e pe host** — deci supraviețuiește pierderii hostului; riscul rămâne la pierderea contului.

---

## 7. Ordinea operațiilor

### 7.1 Pierderea totală a hostului

**Situația de azi, înainte de orice etapă de mai sus: pierderea este totală și ireversibilă.** Datele clienților nu pot fi recuperate. Ordinea de mai jos descrie procedura pentru momentul în care Etapele 1–3 sunt implementate.

| Pas | Acțiune | Timp estimat | Note |
|---|---|---|---|
| 1 | Provisionarea unui host nou cu Proxmox VE **aceeași versiune (9.2.21)** | 1–2 h | `lscpu` pe noul host: Broadwell identic, sau unul mai nou — se verifică |
| 2 | Repunerea în funcțiune a accesului SSH și a adreselor | 15 min | `193.34.214.20` și alias-urile se mută la noul host; **DNS-ul nu trebuie schimbat** — zona e la Cloudflare și indică deja spre aceste adrese |
| 3 | Atașarea stocării off-host și verificarea conectivității | 30 min | `pvesm status` trebuie să arate o a doua stocare `active` |
| 4 | Restaurarea VM 103 din `vzdump` | 30–60 min | `qmrestore 103 <archive> --storage local` |
| 5 | Restaurarea VM 100 și VM 101 din `vzdump` | 30–60 min | VM 101 readuce fișierele clienților înapoi la starea de la ultimul snapshot |
| 6 | Reconstruirea VM 102 (Caddy) sau restaurarea ei | 15 min | Caddy re-emite certificatele prin ACME la prima pornire |
| 7 | Repunerea în funcțiune a secretelor: `.env` din depozitul de secrete | 15 min | **Punctul critic** — fără `.env` nu pornește nimic |
| 8 | Pornirea stack-ului Docker pe VM 103 | 15 min | `docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d` |
| 9 | Restaurarea bazei de date Postgres din dump | < 5 min | `bash scripts/restore.sh <arhiva> --yes` |
| 10 | Aplicarea migrărilor și verificarea sănătății | 10 min | `GET https://blipmade.com/api/health` → `{"status":"ok",...}` |
| 11 | Verificarea podului cu panoul | 15 min | `GET https://blipmade.com/api/health` → `"pterodactyl":"configured"`; nodul trebuie să apară în panou cu limitele corecte |
| 12 | Verificarea alocărilor și a serverelor | 15 min | `GET /api/application/nodes/1/allocations` — alocările trebuie să corespundă cu cele din baza de date a platformei |
| 13 | Repunerea în funcțiune a job-urilor de provisionare | 10 min | Coada Redis se regenerează din `ProvisioningJob`; job-urile rămase în `PENDING` se reiau |
| 14 | Verificarea finală end-to-end | 30 min | Comandă de test prin API → provisionare → pornire → consolă → fișiere |

**Total: 5–8 ore** pentru repunerea în funcțiune a platformei cu datele clienților, în ipoteza că backup-urile există și sunt corecte. `INFERRED`.

**Fără Etapele 1–3, același incident înseamnă:** zile până la reconstrucție + **pierderea permanentă a tuturor fișierelor clienților**, chiar dacă platforma ar fi reconstruită perfect.

### 7.2 Pierderea unui singur server de joc al unui client

| Pas | Acțiune | Azi | Cu Etapa 3 | Cu Etapa 4 (B) |
|---|---|---|---|---|
| 1 | Confirmarea incidentului; oprirea serverului | ✅ | ✅ | ✅ |
| 2 | Identificarea volumului și a alocării | ✅ | ✅ | ✅ |
| 3 | Verificarea existenței unui backup per instanță | ❌ `feature_limits.backups = 0` | ❌ (rămâne 0) | ✅ |
| 4 | Restaurarea din backup | ❌ **imposibil** | ✅ din snapshot-ul de VM | ✅ din backup-ul per instanță |
| 5 | Repunerea în funcțiune și verificarea | — | 15–30 min | 5–15 min |
| 6 | **Dacă nu există backup** | **clientul reîncarcă fișierele** — și **răspunsul comercial trebuie să spună asta** | idem | idem |

**Răspunsul onest pentru un client, azi:** *„Fișierele serverului dumneavoastră se află pe același disc, fără copie. Le putem ajuta să le reîncarce."* Un astfel de răspuns, în ziua în care apare, este un incident de reputație și, probabil, o cerere de reziliere.

**Acțiunea preventivă minimă, pentru mâine:** un `vzdump` zilnic al VM 101 (Etapa 3) reduce expunerea la 24 h și costă puțin, fiindcă discul real ocupă doar 9,81 GiB.

---

## 8. RTO și RPO — propunere consolidată

| Componentă | RPO propus | RTO propus | Bază | Curent |
|---|---|---|---|---|
| **Baza Postgres a platformei** | 1 h local / **6 h off-host** | **< 5 min** (doar DB) · ~1–2 h (VM complet) | Dump 11 MB, arhivă ~30 KB; `restore.sh` deja existent și verificat | **Fără copiere** — RPO = ∞ |
| **Secretele (`.env`)** | ore (la schimbare) | 15 min | Un singur fișier, reintroducere directă | **Fără copiere** |
| **Fișierele clienților** | **24 h** | 2–4 h (VM 101) · 15–30 min (instanță, cu Etapa 4) | `vzdump` zilnic; disc real 9,81 GiB | **Fără copiere** |
| **Baza de date a panoului** | 24 h | 2–4 h | `vzdump` al VM 100 | **Necunoscut** (`BLOCKED`) |
| **Volumul `upload_data`** | 6 h | < 5 min | Volum Docker, gol acum | **Fără copiere** |
| **Redis** | 1 h | < 5 min (se reconstruiește din Postgres) | Sesiunile se invalidază; job-urile se regenerează din `ProvisioningJob` | **Fără copiere** |
| **DNS / Cloudflare** | n/a (e la Cloudflare) | 15–60 min | Re-intrare manuală | **Fără copie a zonei** |
| **Certificatele TLS** | n/a (se re-emit) | 5–10 min | ACME la pornirea lui Caddy | **Fără copiere** |
| **Codul sursă** | **0** | **Minute** | `git clone` de pe GitHub | ✅ **are deja copie** |
| **Platforma completă (VM 103)** | 1 h | ~1–2 h | Docker Compose, 5 containere | **Fără copiere** |

**Toate valorile RTO/RPO din coloana „propus" sunt `INFERRED`**, cu excepția timpului de restaurare a bazei de date (< 5 min), care rezultă direct din dimensiunea măsurată (11 MB) și din procedura existentă `restore.sh`.

---

## 9. Constatări

| # | Constatație | Clasă | Gravitate |
|---|---|---|---|
| D-01 | Nu există nicio țintă de backup; `pvesh /cluster/backup` → `[]`, `/var/lib/vz/dump/` gol | `VERIFIED` | **Critică** |
| D-02 | Nu există backup programat: niciun cron, niciun timer, `crontab` neinstalat pe VM 103 | `VERIFIED` | **Critică** |
| D-03 | `OFFSITE_TARGET` / `OFFSITE_TRANSPORT` / `OFFSITE_ENCRYPTION_KEY` toate neconfigurate | `VERIFIED` | **Critică** |
| D-04 | Root filesystem-ul este RAID 0 pe ambele SSD-uri | `VERIFIED` | **Critică** |
| D-05 | Backup-ul Pterodactyl per instanță este dezactivat (`feature_limits.backups = 0` pe toate serverele) | `VERIFIED` | **Înaltă** |
| D-06 | Toate secretele există într-un singur fișier, neacoperit de git și exclus din arhivele de backup | `VERIFIED` | **Înaltă** |
| D-07 | Workflow-ul „nightly backup drill" rulează pe o bază de date de unică utilizare și nu protejează producția | `CODE-INSPECTED` | **Înaltă** |
| D-08 | `rclone` (transportul implicit al lui `backup-offsite.sh`) **nu este instalat** | `VERIFIED` | **Înaltă** |
| D-09 | Cele două arhive existente sunt resturi de drill, pe același RAID 0, din 2026-10-22 | `VERIFIED` | **Medie** |
| D-10 | Nu există backup-uri ale mașinilor virtuale (`vzdump` nu este programat) | `VERIFIED` | **Înaltă** |
| D-11 | Baza de date a panoului (VM 100) nu poate fi verificată | `BLOCKED` | **Medie** |
| D-12 | `age` nu este instalat → calea de criptare implicită e `openssl aes-256-cbc` (fără AEAD) | `VERIFIED` | **Medie** |
| D-13 | `prune-backups keep-all=1` este inert | `VERIFIED` | **Informativă** |

---

## 10. Recomandări, ordonate după raportul efort/impact

1. **Astăzi, fără cost extern:** creează un `systemd timer` pe VM 103 care rulează `scripts/backup.sh` orar, cu `BACKUP_KEEP_DAYS=7`. Costă zero și transformă „nicio copie" în „o copie locală pe oră". **Nu rezolvă problema RAID 0** — de aceea urmează punctul 2 imediat.
2. **Imediat după:** contractează sau pune la dispoziție **o țintă off-host** (R0.1) și configurează `OFFSITE_TARGET` + cheia (R0.2, R0.4). Dacă alegi varianta `ssh`, sunt necesare doar o cheie restricționată și un director pe cealaltă mașină — **nu** este nevoie de `rclone`. Dacă alegi `rclone`, trebuie instalat mai întâi (R0.3).
3. **În aceeași zi:** salvează `.env` într-un depozit de secrete (R0.5). Costă cinci minute și este singurul lucru care nu poate fi refăcut.
4. **În săptămâna următoare:** adaugă un storage off-host în `storage.cfg` și programează `vzdump` pentru cele patru VM-uri (Etapa 3). **Este singurul pas care acoperă fișierele clienților.**
5. **În aceeași săptămână:** pornește agentul gazdă pe VM 100 și VM 101 (F-08 din `03-infrastructure.md`) și obține acces SSH la VM 100 — fără astfel, backup-ul bazei panoului nu poate nici măcar fi verificat.
6. **Înainte de primul client de joc:** activează backup-urile per instanță în panou **sau** confirmă că `vzdump` zilnic acoperă nevoia (Etapa 4). Nu vinde Minecraft/CS 1.6 înainte de aceasta — lumea de joc a clientului nu va avea nicio copie.
7. **Înainte de lansare:** execută drill-ul de restaurare **de pe altă mașină**, conform `docs/RUNBOOK.md` §9. Un drill local nu dovedește că copia off-host este lizibilă.
8. **În paralel:** rezolvă RAID 0. Niciun backup nu substituie un tablou cu redundanță; un backup bun face ca pierderea unui disc să fie un inconvenient, nu un dezastru. Discul `md2` (swap, tot RAID 0) ar putea fi eliminat, iar tablourile pentru `/` și `/boot` ar trebui reconstruite cu redundanță — într-o fereastră de mentenanță, cu risk asumat și verificat.

---

## 11. Limitări

- **Baza de date a panoului Pterodactyl (VM 100) nu a putut fi inspectată.** Nu se poate afirma dacă panoul are un backup propriu programat (`p:backup:db`): `BLOCKED`. Pasul de deblocare: cheie SSH de citire sau pornirea agentului gazdă.
- **Nu există măsurători de volum pentru fișierele clienților**, deci rata de creștere a volumelor Wings nu poate fi estimată. Astăzi sunt 5 servere aproape goale, dar tendința pentru prima lună de trafic real nu este măsurabilă.
- **Timpii de restaurare sunt `INFERRED`**, din dimensiunile măsurate și din pașii documentați în `restore.sh` / `restore-drill.sh`. Nu au fost executate restore-uri pe producție (ar fi o scriere, interzisă în acest audit).
- **Nu a fost creat niciun backup nou în timpul acestui audit**, conform regulilor. Toate măsurătorile s-au făcut în regim read-only.
- **Costurile de stocare off-host nu au fost estimate**, pentru că nu există în sistem nicio cotă de preț și niciun consum măsurat care să justifice o estimare. Sunt date de volum, nu de cost: dump-ul Postgres este de 11 MB, iar discul real al nodului de jocuri este de 9,81 GiB.
