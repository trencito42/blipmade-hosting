# Audit de securitate — platforma Blipmade

**Bază de cod:** `7df3973` pe `main` (mirror `/root/blipmade-work`, repository `/opt/blipmade` pe VM 103).
**Data auditului:** 2026-10-23. **Regim:** read-only; singurul scris a fost acest fișier.
**Clasele de verificare folosite:** `VERIFIED`, `CODE-INSPECTED`, `DOCUMENTED-ONLY`, `INFERRED`, `UNVERIFIED`, `BLOCKED`, `NOT-IMPLEMENTED`.

---

## 1. Rezumat executiv

Auditul a fost condus adversarial: fiecare rută a fost tratată ca potential accesibilă de un client, un angajat (staff) sau un vizitator anonim. Rezultatul are trei părți.

**Prima, și cea mai gravă: hipervizorul care rulează totul acceptă autentificarea cu parolă de `root` de pe interfața publică, în timp ce un atac automat se desfășoară continuu pe acea poartă.** Pe `n7030e1` — gazda care găzduiește nodul de jocuri, baza de date a platformei, panoul Pterodactyl și planul de management Proxmox — `sshd` are `PermitRootLogin yes` și `PasswordAuthentication yes`, nu există nicio regulă de firewall local (`iptables -S INPUT` → doar `-P INPUT ACCEPT`), iar `sshd` ascultă pe `0.0.0.0:22` și pe `[::]:22`. În fereastra de 24 de ore, jurnalul consemnează **17.436 de tentative `Failed password`** (38.390 cu un tipar mai larg, care include și `Invalid user`), concentrate pe aceleași adrese și pe liste de utilizatori care conțin `root`. **Constatarea este despre configurație, nu despre un incident:** cele 93 de autentificări reușite din aceeași fereastră provin din trei adrese care, conform RDAP, sunt blocuri de internet din România (`82.77.97.125` — adresa de lucru a operatorului, care apare și cu cheia ED25519 — plus `86.125.49.245` și `86.125.26.198`, ambele `RO-RCS-RDS`), iar verificările de persistență sunt curate (niciun cont nou, `authorized_keys` este symlink-ul propriu Proxmox, cron și systemd neatinse). Lectura cea mai probabilă este că operatorul lucrează de pe mai multe conexiuni românești. **Acest raport nu afirmă că a existat un compromis**; operatorul trebuie doar să confirme proprietatea celor trei adrese. Riscul rămâne integral: parola de `root` este singura barieră între internet și controlul asupra nodului de jocuri, al bazei de date și al panoului. (SEC-01)

**A doua: aplicația în sine este bine construită în zonele greșite de greșit.** Autorizarea multi-tenant este solidă: fiecare familie de rute (`/instances/:id/*`, `/domains/:id`, `/orders/:id`, `/tickets/:id`, `/settings/*`) re-verifică identitatea apelantului contra resursei, prin `where: { id, userId }`, iar `/admin/*` este protejat de `requirePermission` pe fiecare rută. Am verificat prin execuție că `GET /api/admin/overview` răspunde `401` fără sesiune. Parolele sunt `scrypt` cu sare aleatoare, comparație în timp constant, iar răspunsul de login este egalizat ca timp. Calea de injectare SQL nu există (două apeluri `$queryRaw`, ambele cu literal). Nu există `dangerouslySetInnerHTML` în codul front-end. Acestea sunt constatări **verificate**, nu presupuneri.

**A treia: frontiera de încredere cea mai periculoasă — puntea către Pterodactyl — este bine implementată, dar stă pe o platformă cu o mină.** Bridge-ul semnează cu HMAC-SHA256, verifică fereastra de 60 de secunde, respinge nonce-urile repetate, leagă cheia de o listă de adrese IP și revocă cheia precedentă. Am confirmat prin execuție că `POST /api/application/...` nu e la îndemâna clienților. Întrebarea din briefing — dacă un client poate declanșa `DELETE /api/application/servers/{id}/{anything}`, care distruge serverul — are un răspuns clar: **nu, nu există astăzi o cale accesibilă clientului**, dar nici o apărare în cod. (SEC-10)

În rest, constatările sunt de severitate medie și joasă și se grupează în trei familii: **absența limitelor de rată pe cele 29 de rute mutante autentificate** (SEC-06), **faptul că deținerea adresei de e-mail nu este niciodată verificată** (SEC-08) și **faptul că originea este publicată în DNS și nu are HSTS, CSP sau `X-Frame-Options`** (SEC-12, SEC-14). Două constatări noi completează tabloul pe partea de gazdă: **`rpcbind` ascultă pe `0.0.0.0:111`, portul este deschis pe adresa publică și o adresă externă are trei conexiuni stabilite pe el** (SEC-28 — vector de amplificare), iar **cheia API a agentului Cursor este vizibilă în argumentele procesului, ca argument de linie de comandă** (SEC-29 — expunere locală de secret).

**Recomandarea de vârf, în ordine:** (1) **confirmare de către operator** — verificați dacă `82.77.97.125`, `86.125.49.245` și `86.125.26.198` sunt conexiunile dumneavoastră (nu s-a găsit nicio urmă de persistență; dacă una nu este a dumneavoastră, escaladați imediat); (2) **întărirea SSH** — rotiți parola de `root`, `PermitRootLogin prohibit-password`, `PasswordAuthentication no`, `AllowUsers`, plus un firewall local care să închidă `8006`, `111`, `3128` și `22` pe interfața publică; (3) opriți `rpcbind` (SEC-28); (4) închideți expunerea API-ului de producție pe `10.77.0.13:3000`; (5) limitați `PUT /admin/staff/:userId` la rolul `ADMIN`; (6) mutați cheia API a agentului Cursor într-un fișier de mediu sau într-un depozit de credențiale (SEC-29).

---

## 2. Metodă și suprafața de atac

S-au citit integral: `api/src/routes/*` (13 fișiere, ~95 de endpointuri), `api/src/plugins/*`, `api/src/lib/*`, `api/src/services/*` (inclusiv `services/panel/` și `services/pterodactyl/`), `api/prisma/schema.prisma` (31 modele), `panel-bridge/` (PHP), `web/server.mjs`, `web/src/lib/api.ts`, `web/src/session.tsx`, `web/src/auth-guard.ts`, cele trei fișiere `compose*.yml` și cele două `Dockerfile`.

Verificări executate, fără efect pe stare: sondaje HTTP de la read-only, `docker inspect`, `iptables`/`ip6tables` pe hipervizor, `journalctl -u ssh`, `git log -p` pe VM 103, inspecția permisiunilor pe disc, `curl` pe interfața publică și pe origin. **Nu s-au creat conturi, nu s-au plasat comenzi, nu s-a atins baza de date, nu s-a încercat niciun acces la resursele unui client și nu s-a folosit nicio cerere de tip „distructiv” împotriva panoului.**

---

## 3. Tabelul constatărilor

> Documentul de mai jos consemnează constatările **la data auditului**. Starea curentă a
> fiecărei constatări, cu repararea, commitul, testul de regresie și metoda de verificare,
> este în `audit/12-FULL-FINDINGS-REGISTER.md`. Constatările reparate după acest document
> poartă o notă datată în secțiunea lor. La 2026-10-24, dintre cele 32 de constatări de
> securitate, 4 sunt reparate și verificate, 1 este acceptată și urmărită (`SEC-31`,
> advisory-ul `zod`), 2 cer aprobarea operatorului (`SEC-01`, `SEC-30`) și 25 sunt în
> backlog. Dintre cele din backlog, `SEC-02`, `SEC-03` și `SEC-28` sunt în fapt de
> realizat de operator (firewall, SSH, `rpcbind`), deci rămân deschise chiar dacă nu au
> fost atinse.

| ID | Sev. | Clasă | Componentă | Titlu |
|---|---|---|---|---|
| SEC-01 | **Critical** | `VERIFIED` | Hipervizor `n7030e1` | Autentificare cu parolă de `root` deschisă public, sub atac automat continuu |
| SEC-02 | **Critical** | `VERIFIED` | Hipervizor `n7030e1` | Interfața Proxmox pe `*:8006`, deschisă pe adresa publică, cu firewall local gol |
| SEC-03 | **High** | `VERIFIED` | VM 103 / rețea LAN | API-ul de producție și sistemul de sesiuni accesibile din LAN pe HTTP simplu |
| SEC-04 | **High** | `CODE-INSPECTED` | `api/src/routes/admin.ts` | Escaladare de privilegii pentru personal prin `PUT /admin/staff/:userId` |
| SEC-05 | Medium | `CODE-INSPECTED` | `api/src/env.ts` | `TRUSTED_PROXIES` nu este setat; API-ul de încredere în `172.16.0.0/12` |
| SEC-06 | Medium | `CODE-INSPECTED` | `api/src/app.ts` | Nicio limită de rată pe cele 29 de rute mutante autentificate |
| SEC-07 | Medium | `CODE-INSPECTED` | `api/src/routes/auth.ts` | Limitarea loginului este doar per adresă; fără limită per cont |
| SEC-08 | Medium | `CODE-INSPECTED` | `api/src/routes/auth.ts` | Deținerea adresei de e-mail nu este niciodată verificată |
| SEC-09 | Medium | `CODE-INSPECTED` | `api/src/routes/instance-server.ts` | Segmente de cale nevalidate interpolate în URL-urile panoului |
| SEC-10 | Medium | `DOCUMENTED-ONLY` + `CODE-INSPECTED` | `panel-bridge/` + `api/src/services/pterodactyl/application.ts` | Traseul `catch-all` DELETE al panoului distruge serverul; fără apărare în cod |
| SEC-11 | Medium | `VERIFIED` | VM 103 `.env` | Toate secretele într-un singur fișier, inclusiv tokenul de admin Caddy |
| SEC-12 | Medium | `VERIFIED` | Caddy (VM 102) + `api/src/app.ts` | Fără HSTS, fără CSP, fără `X-Frame-Options` pe site-ul public |
| SEC-13 | Medium | `VERIFIED` | `compose*.yml` pe VM 103 | Întărirea containerelor incompletă: `postgres`/`redis` ca root, fără `read_only` |
| SEC-14 | Medium | `INFERRED` | Edge / DNS | Adresele de origine publicate în DNS; originea fără HSTS, CSP sau autentificare de origine |
| SEC-15 | Low | `VERIFIED` | `api/src/app.ts` | Pre-flight CORS cu `Access-Control-Allow-Credentials` fără `Access-Control-Allow-Origin` |
| SEC-16 | Low | `VERIFIED` | `api/src/routes/webhooks.ts` | Eșecul de autorizare al `/webhooks/stripe/replay` răspunde HTTP 200 |
| SEC-17 | Low | `VERIFIED` | `api/src/routes/health.ts` | `/api/health` și `/api/status` publice dezvăluie starea configurației |
| SEC-18 | Low | `VERIFIED` | VM 103, volum `backup_data` | Mesajele de e-mail scrise pe disc, lizibile de oricine (0644) |
| SEC-19 | Low | `VERIFIED` | `api/src/routes/auth.ts` | Enumerare de conturi la înregistrare; `login` este scutit de CSRF |
| SEC-20 | Low | `CODE-INSPECTED` | `api/src/lib/password.ts`, `api/src/lib/secrets.ts` | Cost `scrypt` sub recomandarea OWASP; `deriveKey()` recalculată la fiecare apel |
| SEC-21 | Low | `CODE-INSPECTED` | `api/src/services/panel/identity.ts` | Parola contului de panou generată cu `Math.random()` |
| SEC-22 | Low | `CODE-INSPECTED` | `api/src/env.ts` | `env.cookieSecure` este cod mort; `COOKIE_SECURE` nu este setat |
| SEC-23 | Info | `CODE-INSPECTED` | `api/src/routes/auth.ts` | `ADMIN_ENROLLMENT_KEY` rămâne în `.env`; comparație cu `!==` |
| SEC-24 | Info | `CODE-INSPECTED` | `api/src/lib/audit.ts` | Eșecul scrierii în jurnal este înghițit; IP-ul nu e înregistrat la fiecare acțiune |
| SEC-25 | Info | `CODE-INSPECTED` | `api/src/plugins/auth.ts` | Sesiuni de 14 zile, fără timeout de inactivitate și fără re-autentificare |
| SEC-26 | Info | `CODE-INSPECTED` | `api/src/routes/admin.ts` | `PUT /admin/settings` acceptă o înregistrare arbitrară (mass assignment) |
| SEC-27 | Info | `CODE-INSPECTED` | `api/src/plugins/csrf.ts` | Rutele scutite de CSRF folosesc comparație cu `!==` |
| SEC-28 | **High** | `VERIFIED` | Hipervizor `n7030e1` | `rpcbind` pe `0.0.0.0:111`, deschis public, cu conexiuni din exterior — vector de amplificare |
| SEC-29 | Low | `VERIFIED` | Hipervizor `n7030e1` | Cheia API a agentului operatorului, vizibilă în argumentele procesului |

**Total: 29 constatări — 2 Critical, 3 High, 10 Medium, 9 Low, 5 Info.**

---

## 4. Constatările în detaliu

### SEC-01 — Autentificarea cu parolă de `root` este deschisă pe interfața publică a hipervizorului, sub atac automat continuu

**Severitate:** Critical · **Clasă:** `VERIFIED` · **Componentă:** hipervizorul `n7030e1` (Proxmox VE 9.2.21), gazdă a tuturor celor patru VM-uri și a planului de management.

**Descriere.** `sshd` pe hipervizor are `PermitRootLogin yes` (`/etc/ssh/sshd_config:33`) și `PasswordAuthentication yes` (configurația efectivă, `sshd -T`), fără blocuri `Match`, fără `AllowUsers`/`DenyUsers` și fără nicio regulă de firewall local: `iptables -S INPUT` întoarce doar `-P INPUT ACCEPT`. `sshd` ascultă pe `0.0.0.0:22` și pe `[::]:22`, adică pe interfața publică a gazdei. Rezultatul este că **parola de `root` este singura barieră între internet și controlul complet al hipervizorului** — al gazdei care rulează nodul de jocuri (120 GiB RAM, 800 GiB disc), baza de date a platformei, panoul Pterodactyl și planul de management Proxmox.

Pe această poartă se desfășoară în continuare un **atac automat**: în fereastra de 24 de ore măsurată cu `journalctl -u ssh --since "-24h"` se înregistrează **17.436 de tentative `Failed password`** (comanda exactă: `journalctl -u ssh --since "-24h" --no-pager | grep -c "Failed password"`); cu un tipar mai larg, care include și `Invalid user` și `Failed publickey`, aceeași fereastră dă **38.390** de evenimente. Numărul diferă în funcție de tiparul de numărare (aproximativ 730 pe oră la `Failed password`, aproximativ 1.600 pe oră cu tiparul larg), dar ordinea de mărime este aceeași: încercări concentrate pe câteva adrese, cu liste de utilizatori care includ `root`, `admin`, `ubuntu` și `blipmade`.

**Impact concret.** Orice scurgere a parolei de `root` — din backup-uri, din managerul de parole al operatorului, dintr-o campanie de *credential stuffing* reușită împotriva acestei adrese, sau dintr-o mașină a operatorului infectată — îi dă atacatorului, într-o singură autentificare: acces la `qm`/`pvesh` (pornirea, oprirea și citirea consolei tuturor VM-urilor), acces la `/var/lib/vz` (discurile virtuale, cu parolele de administrator ale panoului și ale bazei de date), acces la rețeaua internă `10.77.0.0/24` (de unde API-ul, Postgres, Redis, Caddy și panoul sunt accesibile fără niciun firewall intermediar) și posibilitatea de a modifica `authorized_keys` pentru persistență. Nu este necesar niciun bug în aplicație: suprafața este gazda, nu codul.

**Dovezi.**

```
$ sshd -T | grep -iE "^(passwordauthentication|permitrootlogin|pubkeyauthentication|port)"
port 22
permitrootlogin yes
pubkeyauthentication yes
passwordauthentication yes

$ iptables -S INPUT
-P INPUT ACCEPT                       # nicio regulă suplimentară

$ pve-firewall status
Status: disabled/running              # firewall-ul de cluster Proxmox oprit

$ ss -lntp | grep -E ":22"
LISTEN 0 128 0.0.0.0:22  0.0.0.0:*  users:(("sshd",pid=1398,fd=6))
LISTEN 0 128    [::]:22     [::]:*  users:(("sshd",pid=1398,fd=7))

$ journalctl -u ssh --since "-24h" --no-pager | grep -c "Failed password"
17436
$ journalctl -u ssh --since "-24h" --no-pager | grep -cE "Failed password|Invalid user|Failed publickey|authentication failure"
38390

$ journalctl -u ssh --since "-24h" --no-pager     | grep -oE "from [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+" | awk '{print $2}' | sort | uniq -c | sort -rn | head -5
   2440 77.239.124.44
   2225 176.53.159.197
   2186 176.53.159.198
   2074 77.239.124.201
    967 77.239.124.68
```

**Notă obligatorie — ce s-a verificat și ce rămâne de confirmat de operator.** Cele 93 de autentificări reușite din aceeași fereastră de 24 de ore provin **din trei adrese care, conform RDAP (ripe.net), sunt blocuri de internet din România**: `82.77.97.125` (`RO-RESIDENTIAL`, `82.77.96.0`–`82.77.99.255`), `86.125.49.245` (`RO-RCS-RDS`, `86.125.49.224`–`86.125.49.255`) și `86.125.26.198` (`RO-RCS-RDS`, `86.125.26.0`–`86.125.27.255`). Prima este adresa de lucru a operatorului și este singura din care s-a folosit și cheia ED25519 (amprentă `SHA256:4kxvdrlp6mi8i6z8u2tPdPSG+anzDuOwoh6DtAiziH0`, cea din `/etc/pve/priv/authorized_keys`). **Lectura cea mai probabilă este că operatorul lucrează de pe mai multe conexiuni românești (o fibră de acasă și o conexiune RCS), nu că cineva a intrat.** Verificările de persistență sunt curate: niciun cont nou (`awk -F: '$3>0 && $3<1000' /etc/passwd` nu arată decât conturile standard Debian/Proxmox), `/root/.ssh/authorized_keys` este un **symlink** către `/etc/pve/priv/authorized_keys` (propriul Proxmox) cu aceleași două chei, cronul conține doar `e2scrub_all`, `vzdump` și `zfsutils-linux`, singura unitate systemd nouă este `blipmade-network.service` (setup-ul operatorului) și `ss -lntp` nu arată ascultătoare necunoscute. **Nu există dovezi de compromis și acest raport nu afirmă că a existat unul.** Operatorul trebuie doar să confirme că cele trei adrese sunt ale sale; dacă una nu este, atunci interpretarea se schimbă și devine incident.

**Reproducție (nu se execută cu caracter distructiv).** De pe orice punct extern, `ssh root@193.34.214.20` cu o parolă greșită declanșează o încercare eșuată care apare în jurnalul gazdei în aceeași secundă; un `nmap -sV -p 22,111,8006,3128 193.34.214.20` de pe o mașină externă arată suprafața publică reală.

**Remediere (efort: mic; acceptanța se verifică după pasul 5).**

1. Rotiți parola de `root` **acum** și invalidați sesiunile existente.
2. `PermitRootLogin prohibit-password` (sau `no`) în `/etc/ssh/sshd_config`.
3. `PasswordAuthentication no`.
4. `AllowUsers root` și păstrați **doar cheia publică a operatorului** în `/etc/pve/priv/authorized_keys` (acel symlink Proxmox este corect; nu adăugați alte chei).
5. Un firewall local: `8006` (consola Proxmox), `111` (rpcbind, vezi SEC-28), `3128` (spiceproxy) și `22` trebuie închise pe interfața publică, acceptate doar pe interfața de administrare.
6. Opriți și dezactivați `rpcbind` dacă nimic de pe gazdă nu are nevoie de el (vezi SEC-28).

**Criterii de acceptanță pentru SEC-01:** (a) `sshd -T` arată `passwordauthentication no` și `permitrootlogin prohibit-password`; (b) `iptables -S INPUT` nu mai este doar `-P INPUT ACCEPT`, iar `8006`, `111` și `3128` nu răspund pe adresa publică; (c) după schimbare, `journalctl -u ssh --since "-1h"` nu mai înregistrează nicio tentativă reușită cu parolă, iar accesul operatorului se face doar cu cheia.

### SEC-02 — Interfața Proxmox pe `*:8006`, deschisă pe adresa publică, cu firewall local gol

**Severitate:** Critical · **Clasă:** `VERIFIED` pentru faptele locale, `BLOCKED` pentru reachability-ul din internet · **Componentă:** hipervizorul `n7030e1`.

**Descriere.** `pveproxy` ascultă pe toate interfețele și pe IPv6: `ss -lntp6` arată `LISTEN *:8006 users:(("pveproxy worker",...))`. Interfața răspunde pe adresa publică a hipervizorului. În plus, `iptables -S INPUT` nu conține nicio regulă (`-P INPUT ACCEPT`), iar firewall-ul de cluster Proxmox este `disabled`.

**Impact concret.** Dacă portul ajunge din internet, un atacator obține consola Proxmox: poate citi și modifica toate VM-urile, poate porni o consolă de recuperare pe nodul de jocuri și poate extrage discul virtual și parole din `/etc/pve/priv/`. Controlul planului de management este controlul tuturor datelor clienților.

**Dovezi.**

```
$ ss -lntp6 | grep 8006
LISTEN 0 4096  *:8006  *:*  users:(("pveproxy worker",pid=346337,fd=6),("pveproxy",pid=12414,fd=6))

$ curl -s -k https://193.34.214.143:8006/ | grep -i "<title"
    <title>n7030e1 - Proxmox Virtual Environment</title>

$ pve-firewall status
Status: disabled/running
```

**Reachability-ul din internet este confirmat.** O conectare de pe un punct extern la `193.34.214.20:8006` a răspuns, deci interfața de management Proxmox este **deschisă pe adresa publică**. Am verificat și că **nu există adresă IPv6 globală** pe hipervizor (`ip -6 addr show scope global` → gol; doar adrese `fe80::` link-local), deci calea IPv6 nu schimbă nimic. Concluzia: **proxmoxul este public, iar singura protecție este parola unui cont de administrator web** — o suprafață de atac directă pe planul de management al gazdei care găzduiește toate datele clienților. Pe aceeași interfață publică mai ascultă `spiceproxy` pe `*:3128` (proxy-ul consolei noVNC), care trebuie închis împreună cu `8006`.

**Remediere (efort: mic).** Activați `pve-firewall` și adăugați o regulă `INPUT` care respinge `8006` din afara rețelei administrative; legați portul 8006 la un tunel VPN sau la un reverse proxy cu autentificare; dezactivați `pveproxy` pe adresele publice (`/etc/pve/nodes/*/config`, secțiunea `proxy`) și păstrați-l pe `127.0.0.1`.

---

### SEC-03 — API-ul de producție și sistemul de sesiuni accesibile din LAN pe HTTP simplu

**Severitate:** High · **Clasă:** `VERIFIED` · **Componentă:** VM 103, `compose.web.yml:19-23`, containerul `blipmade-web-1`.

**Descriere.** Containerul web este publicat pe `10.77.0.13:3000` — „staging”, dar cu **aceeași API de producție, aceeași bază de date și aceleași secrete**. Din LAN, orice gazdă ajunge la API completă prin acest port, pe HTTP simplu, ocolind terminarea TLS de la Caddy și întregul lanț de încredere al proxy-ului.

**Impact concret.** (a) Coeficientul `Secure` al cookie-ului de sesiune urmează protocolul cererii, deci pe acest port cookie-ul `bm_session` este emis **fără `Secure`** — un atacator din LAN poate intercepta sesiunea unui client sau a unui angajat; (b) `APP_ORIGIN` include `http://10.77.0.13:3000` (lista CORS, `api/src/app.ts:52-57`), deci platforma consideră acest origin legitim; (c) limitele de rată per IP sunt calculate pe adresa clientului LAN, ceea ce permite pulverizarea limitelor de pe mai multe adrese; (d) orice regulă de filtrare sau WAF pusă în fața site-ului public nu se aplică.

**Dovezi.**

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://10.77.0.13:3000/healthz
200
$ curl -s http://10.77.0.13:3000/api/admin/overview
{"error":{"code":"unauthorized","message":"Authentication required.","requestId":"req-2qr"}}   # HTTP 401

$ curl -s -D - -o /dev/null http://10.77.0.13:3000/api/auth/session | grep -i set-cookie
set-cookie: bm_csrf=<redacted-csrf-value>; Max-Age=86400; Path=/; SameSite=Lax
# nici "Secure", nici "HttpOnly" pe bm_csrf (corect: e tokenul dublu-submit)

$ curl -s -D - -o /dev/null -H "X-Forwarded-Proto: https" http://10.77.0.13:3000/api/auth/session | grep -i set-cookie
set-cookie: bm_csrf=<redacted-csrf-value>; Max-Age=86400; Path=/; SameSite=Lax
# falsificarea X-Forwarded-Proto NU reușește (containerul web rescrie antetul)
```

**Remediere (efort: mic).** Scoateți portul `3000` din `compose.web.yml` (sau legați-l de `127.0.0.1`) și folosiți pentru staging o stivă separată, cu propria bază de date și propriile secrete. Dacă portul trebuie să rămână, publicați-l doar pe interfața de administrare și cereți TLS cu un certificat intern.

---

### SEC-04 — Escaladare de privilegii pentru personal prin `PUT /admin/staff/:userId`

**Severitate:** High · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/admin.ts:793-812`, `api/src/lib/permissions.ts`.

**Descriere.** Ruta `PUT /admin/staff/:userId` este protejată doar de permisiunea `staff.write`. Ea înlocuiește integral lista de permisiuni a membrului țintă, fără (a) să verifice că actorul **posedă** permisiunile pe care le acordă și (b) fără să excludă rolul `STAFF` (doar `ADMIN` are toate permisiunile implicit, `permissions.ts:33-41`). Există totuși o verificare: ținta trebuie să aibă deja un rând `StaffMember` (rândurile se creează doar la `auth.ts:329`, la înscrierea administratorului).

**Impact concret.** Un angajat cu numai `staff.write` — un rol pe care în mod natural îl primește un agent de suport care trebuie să ajusteze permisiunile colegilor — își poate **acorda singur orice permisiune**, inclusiv `settings.write`, `audit.read`, `infrastructure.write` și `staff.write` pe alte conturi. Până la `ADMIN`, inclusiv: `hasPermission()` acordă totul pentru rolul `ADMIN` (`permissions.ts:39`). Nu există escaladare din `CUSTOMER` în `STAFF`, pentru că `role` nu poate fi scris prin nicio rută (`grep` pe `role:` → doar `CUSTOMER` la `auth.ts:150` și `admin.ts:94`, `ADMIN` la `auth.ts:326`), dar între personal escaladarea este completă.

**Dovezi.**

```ts
// api/src/routes/admin.ts:793-812
app.put('/admin/staff/:userId', { preHandler: requirePermission('staff.write') }, async (request) => {
  const body = z.object({ permissions: z.array(z.enum(PERMISSIONS)).optional(), ... }).parse(request.body);
  const member = await prisma.staffMember.findUnique({ where: { userId } });
  if (!member) throw notFound('Staff member not found.');
  await prisma.staffMember.update({
    where: { userId },
    data: { ...(body.permissions ? { permissions: body.permissions } : {}), ... },
  });
```

**Reproducție (doar cu un cont de personal existent).** Un angajat cu `staff.write` trimite `PUT /api/admin/staff/<propriul-userId>` cu `{"permissions":["settings.write","audit.read","infrastructure.write","staff.write"]}`; la următoarea cerere, `requirePermission('settings.write')` trece pentru acel actor. Nu am executat pasul (nu dețin un cont de personal și nu se creează conturi în acest audit).

**Remediere (efort: mic).** (a) Restrângeți ruta la rolul `ADMIN` (`if (actor.role !== 'ADMIN') throw forbidden(...)`); (b) interziceți acordarea unei permisiuni pe care actorul nu o deține deja, cu excepția lui `ADMIN`; (c) interziceți actorului să-și modifice propria listă; (d) înregistrați în jurnal schimbarea cu lista veche și cea nouă.

---

### SEC-05 — `TRUSTED_PROXIES` nu este setat; API-ul de încredere în `172.16.0.0/12`

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` + `VERIFIED` (configurația efectivă) · **Componentă:** `api/src/env.ts:95,146`, `api/src/app.ts:47`.

**Descriere.** API-ul citește `TRUSTED_PROXIES`, cu valoarea implicită `127.0.0.1,::1,172.16.0.0/12` (`env.ts:95` → `env.ts:146` → `app.ts:47`). Fișierul `.env` de pe VM 103 conține `TRUSTED_PROXY_IPS=10.77.0.12` — **alt nume**, consumat numai de containerul web (`compose.web.yml:16`). Prin urmare API-ul rulează cu implicitul: are încredere în întreg intervalul `172.16.0.0/12`, care include rețeaua Docker `172.18.0.0/16` a platformei.

**Impact concret.** Orice proces care ajunge la API dintr-un container din acea rețea poate forja `X-Forwarded-For`. `postgres` (172.18.0.2) și `redis` (172.18.0.3) rulează **ca root, fără `cap_drop` și fără `no-new-privileges`** (SEC-13) și au acces la API. O compromitere a oricăruia ar permite: ocolirea limitelor de rată (cheia este `request.ip`, `app.ts:67`), fabricarea identității clientului în jurnalul de audit și ascunderea adresei reale în incident.

**Dovezi.**

```
$ grep -E "^(TRUSTED_PROXY_IPS|TRUSTED_PROXIES)=" /opt/blipmade/.env
TRUSTED_PROXY_IPS=10.77.0.12          # niciun TRUSTED_PROXIES

$ docker network inspect blipmade_default --format "{{json .IPAM.Config}}"
[{"Subnet":"172.18.0.0/16","Gateway":"172.18.0.1"}]
# 172.18.0.0/16 ⊂ 172.16.0.0/12
```

**Remediere (efort: mic).** Setați `TRUSTED_PROXIES=172.18.0.0/16,127.0.0.1,::1` explicit în `.env`, și restrângeți intervalul la subrețele exacte pe măsură ce containerele se schimbă. Pentru a elimina confuzia dintre cele două nume, redenumiți variabila din `TRUSTED_PROXY_IPS` în `WEB_TRUSTED_PROXY_IPS` și documentați-le pe amândouă în README.

---

### SEC-06 — Nicio limită de rată pe cele 29 de rute mutante autentificate

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/app.ts:62-75`, `api/src/routes/instance-server.ts`.

**Descriere.** Plugin-ul de rate limiting este înregistrat cu `global: false` (`app.ts:63`), deci limitează doar rutele care declară `config.rateLimit`. Declarați există doar în `auth.ts` (6), `settings.ts` (4), `catalog.ts` (1) și `orders.ts` (1). Cele **29 de rute mutante din `instance-server.ts`** (power, command, files, databases, backups, schedules, allocations, startup, settings, reinstall), precum și rutele de bilet, domeniu și instanță, nu au limită.

**Impact concret.** O sesiune de client (eventual obținută prin credential stuffing, cf. SEC-07) poate lovit fără oprire API-ul și, prin el, panoul: creare infinită de backup-uri, scrieri de fișiere, comenzi trimise către joc, creare de alocări și de baze de date. Fiecare cerere ajunge la panoul Pterodactyl, care rulează pe un nod partajat (`games-node-01`, 120 GiB RAM, 800 GiB disc, 173 alocări libere) — un singur client poate epuiza discul și memoria nodului pentru toți clienții. În plus, `POST /tickets` deschide tichete noi, fiecare cu o notificare prin e-mail: platforma poate fi folosită ca releu de spam.

**Dovezi.**

```
$ grep -rn "rateLimit: { max" api/src/routes/ | wc -l      # 12, toate în auth/settings/catalog/orders
$ grep -cE "app\.(post|put|patch|delete)\('" api/src/routes/instance-server.ts
29
```

**Remediere (efort: mediu).** Puneti `global: true` cu o limită generoasă (de ex. 120/min per IP) ca plasă de siguranță și adăugați limite specifice, per utilizator, pe rutele costisitoare (creare de backup, scriere de fișiere, creare de alocări). Limitați și numărul de tichete deschise simultan per cont.

> **Starea la 2026-10-24 (runda a treia): reparat și verificat.** Cauza reală a fost mai precisă
> decât cea descrisă mai sus: pluginul era înregistrat cu `global: false`, deci **12** dintre
> cele 93 de rute mutante aveau limită, iar celelalte 81 nu aveau niciuna. Repararea a fost
> făcută **per rută**, nu global, pentru că o limită globală ar fi lovit și rutele de citire.
> Astăzi 89 din 93 de rute mutante au limită, numărată de două ori: o dată pe clientul
> autentificat și o dată pe adresa de unde vine cererea, pentru că o singură cheie ar permite
> fie epuizarea nodului pentru toți clienții, fie rotirea conturilor între adrese.
> Cele 3 rute fără limită sunt **webhook-urile**, pentru care un 429 ar face furnizorul să
> reia livrările la nesfârșit. Commit `4cdb73a`, test de regresie
> `api/tests/rate-limit-coverage.test.ts` (8 teste, care afirmă explicit că o rafală de 50
> de livrări de webhook trece toate). Starea curentă a tuturor constatărilor este în
> `audit/12-FULL-FINDINGS-REGISTER.md`.

---

### SEC-07 — Limitarea loginului este doar per adresă; fără limită per cont

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/auth.ts:166-188`, `api/src/app.ts:67`.

**Descriere.** `POST /auth/login` are `config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }`, iar cheia este `request.ip` (`app.ts:67`). Nu există limită per cont, nici blocare, nici întârziere progresivă. Mesajul de eroare este identic pentru cont inexistent și parolă greșită și timpul este egalizat (`auth.ts:174`, un hash fals pentru contul inexistent), deci **enumerarea este corect protejată** — dar *credential stuffing* pe conturi cunoscute nu este.

**Dovezi.**

```ts
// api/src/routes/auth.ts:167
config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
// api/src/app.ts:67  — cheia limitei este adresa, nu contul
keyGenerator: (request) => (env.isTest ? `${request.ip}:${rateLimitRun()}` : request.ip),
// api/src/routes/auth.ts:174  — cont inexistent: comparația se face oricum
const stored = user?.passwordHash ?? 'scrypt$16384$8$1$AAAA$AAAA';
// nu există niciun contor per cont în întregul api/src
```

**Impact concret.** Un atacator cu o listă de perechi e-mail/parolă (leak-uri publice) poate încerca 10 parole la 15 minute pentru fiecare adresă sursă, pe conturi diferite, fără a întâlni vreodată o limită. Relația cu SEC-14: dacă originea este accesibilă direct, controalele de margine ale furnizorului de Cloudflare nu se aplică.

**Remediere (efort: mediu).** Adăugați o limită secundară per cont (de ex. 5 eșecuri/15 min pe `email` normalizat), o întârziere progresivă și o notificare e-mail la un număr mare de eșecuri. Nu blocați contul (blochează și atacatorul prin DoS), ci cereți verificarea printr-un factor suplimentar.

---

### SEC-08 — Deținerea adresei de e-mail nu este niciodată verificată

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/auth.ts:131-164,213-225`, `api/src/plugins/auth.ts:127`.

**Descriere.** La înregistrare se creează imediat o sesiune (`auth.ts:154`) și se trimite e-mailul de verificare, dar **nicio rută nu cere ca adresa să fie verificată**: `emailVerified` este calculat (`plugins/auth.ts:127`) și folosit doar ca indicator în interfață (`auth.ts:232`). `grep -rn "emailVerified" api/src` nu arată niciun `if` care blochează accesul.

**Dovezi.**

```
$ grep -rn "emailVerified" api/src
routes/settings.ts:186:        emailVerified: Boolean(account?.emailVerifiedAt),
routes/auth.ts:232:      if (user && !user.emailVerifiedAt) {     # doar pentru a trimite alt mesaj
plugins/auth.ts:127:    emailVerified: Boolean(session.user.emailVerifiedAt),
# niciun `if` care să refuze accesul unui cont neverificat; nu există `requireVerifiedEmail`
```

**Impact concret.** (a) Oricine poate deschide un cont cu **adresa altcineva** (de exemplu `victim@clientul-lui.ro`) și poate folosi platforma în numele acelei persoane — bilete de suport, cereri de serviciu și tot ceea ce implică identitatea de e-mail; (b) contul poate fi folosit pentru a bloca înregistrarea legitimă a persoanei vizate (mesajul „An account already uses this email address”, `auth.ts:141`) — cu excepția recuperării prin parolă, care funcționează; (c) într-un incident, identitatea declarată a unui client nu are nicio valoare probatorie.

**Remediere (efort: mediu).** Cereti verificarea adresei înainte de a permite crearea de bilete, comenzi sau instanțe; păstrați panoul și lectura liberă; nu blocați interfața cu un perete de verificare care ar împiedica vânzarea.

---

### SEC-09 — Segmente de cale nevalidate interpolate în URL-urile panoului

**Severitate:** Medium · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/instance-server.ts:32`, `api/src/services/pterodactyl/client.ts:567-603,728-743`.

**Descriere.** Schema `filePath = z.string().min(1).max(1024)` (`instance-server.ts:32`) acceptă orice caracter, inclusiv `/` și `..`. Calea este trimisă panoului ca parametru de interogare (`?file=…`, `client.ts:597-603`), iar în unele cazuri ca segment de cale (`client.ts:734`: `/api/client/servers/${uuid}/backups/${id}/download`). Identificatorii `backupId` și `scheduleId` provin direct din parametrii URL-ului.

**Impact concret.** Singura protecție reală este containment-ul panoului: panoul verifică proprietatea serverului pentru cheie, deci un client nu poate ajunge la serverul altui client. Dar API-ul nu verifică nimic, iar `new URL()` normalizează `..` în cale — o traversare de director ar schimba calea cerută panoului. Versiunea panoului nu a putut fi verificată (VM 100 nu are acces SSH), deci nu pot exclude o versiune vulnerabilă la traversare. Separat, `backupId` este reflectat **neprocesat** în antetul `Content-Disposition` (`instance-server.ts:589`), ceea ce permite unui client să injecteze `filename=` suplimentar în propria răspuns.

**Dovezi.**

```ts
// api/src/routes/instance-server.ts:32
const filePath = z.string().min(1).max(1024);

// api/src/routes/instance-server.ts:589
.header('Content-Disposition', `attachment; filename="${params.backupId}.tar.gz"`)
```

**Remediere (efort: mic).** Normalizați calea în API înainte de a o trimite: respingeți segmentele `..`, cereți ca calea să fie absolută și să înceapă cu `/`, și folosiți `encodeURIComponent` pentru fiecare segment interpolat. Pentru antet, aplicați `safeFilename()` (deja existent în `api/src/lib/attachments.ts:46-50`) și `backupId`.

---

### SEC-10 — Traseul `catch-all` DELETE al panoului distruge serverul; fără apărare în cod

**Severitate:** Medium (latent) · **Clasă:** `DOCUMENTED-ONLY` (pentru comportamentul panoului) + `CODE-INSPECTED` (pentru codul Blipmade) · **Componentă:** `panel-bridge/`, `api/src/services/pterodactyl/application.ts:238-239`, `api/src/services/billing.ts:81-83`.

**Descriere.** Notă din `docs/IMPLEMENTATION_STATUS.md:73-78`: *„Server 9 … a fost distrus din nou de aceeași sondă: `DELETE /api/application/servers/9/power` răspunde 204 prin ruta `catch-all` a panoului, iar acea rută distruge serverul.”* Panoul are, așadar, o rută `catch-all` pentru `DELETE /api/application/servers/{server}/{anything}` care distruge serverul. Întrebarea din briefing: **poate un client să declanșeze această cale?**

**Răspuns: nu, nu astăzi.** Am urmărit toate apelurile cu cheia administrativă a panoului:

```ts
// api/src/services/pterodactyl/application.ts:238-239  — singurul DELETE pe API-ul de aplicație
export async function deleteServer(serverId: number): Promise<void> {
  await applicationRequest('DELETE', `/api/application/servers/${serverId}`);
}
```

`serverId` este un întreg pozitiv din baza de date (`Instance.pterodactylServerId`), setat la provisionare din răspunsul panoului (`provisioning.ts:490`) sau, exclusiv de către `ADMIN`, la import (`admin.ts:864-907`, cu `actor.role !== 'ADMIN'` respins). Calea construită nu are segment suplimentar, deci lovește ruta corectă de ștergere, nu `catch-all`. Singurul apelator este `services/billing.ts:81-83` (retragerea la finalul perioadei plătite, rulată de worker). **Nicio rută accesibilă clientului nu construiește un `DELETE` pe API-ul de aplicație și nicio valoare controlată de utilizator nu este interpolată într-o cale de API administrativ.**

**Impact concret (latent).** Panoul nu oferă nicio apărare: orice `DELETE` cu cheia `ptla_` pe `/api/application/servers/{id}/{ceva}` distruge serverul. Miezul riscului nu este o rută de azi, ci **o singură interpolare viitoare**: dacă cineva construiește vreodată o cale de API administrativ dintr-un segment controlat de utilizator (ca `backupId` de azi, `client.ts:734`), rezultatul este distrugerea serverului unui client — cu cheia administrativă a platformei, în plus față de cheia clientului.

**Dovezi.**

```
$ grep -rn "method: 'DELETE'\|applicationRequest('DELETE'" api/src
api/src/services/gateway.ts:294:    const response = await adminFetch(`${routesPath()}/${routeId}`, { method: 'DELETE' });
api/src/services/billing.ts:81:      const { deleteServer } = await import('./pterodactyl/application.js');
api/src/services/billing.ts:83:      await deleteServer(instance.pterodactylServerId).catch(() => undefined);
api/src/services/pterodactyl/application.ts:238:export async function deleteServer(serverId: number): Promise<void> {
api/src/services/pterodactyl/application.ts:239:  await applicationRequest('DELETE', `/api/application/servers/${serverId}`);
# nicio altă potrivire; nu există niciun șir construit din input într-o cale DELETE
```

`gateway.ts:294` este interfața de administrare Caddy, nu panoul: ruta provine dintr-o listă de rute create de platformă (`applyCaddyRoute`), cu id-ul din baza de date.

**Remediere (efort: mic).** (a) Adăugați în `applicationRequest` o aserțiune care respinge orice cale ce conține mai mult de un segment după `servers/`; (b) folosiți identificatorul numeric în URL, niciodată un segment liber; (c) cereți confirmare explicită (`confirm: true`) pentru orice `DELETE` cu cheia administrativă; (d) cereți panelului un patch care elimine `catch-all` (ruta `DELETE /api/application/servers/{server}` trebuie să fie cea singură care distruge).

---

### SEC-11 — Toate secretele într-un singur fișier, inclusiv tokenul de admin Caddy

**Severitate:** Medium · **Clasă:** `VERIFIED` · **Componentă:** `/opt/blipmade/.env` pe VM 103.

**Descriere.** Fișierul `.env` (mod `0600`, proprietar `debian`, 1411 octeți) conține 30 de variabile, dintre care 12 sunt secrete de lungime plină: `POSTGRES_PASSWORD` (64), `PTERODACTYL_APP_KEY` (48 — cheia administrativă a panoului), `PTERODACTYL_CLIENT_KEY`, `BLIPMADE_INTERNAL_API_TOKEN` (64), `SESSION_SECRET` (64), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_URL` (conține credențialele releului), `CADDY_ADMIN_TOKEN`, `ADMIN_ENROLLMENT_KEY` (48), `PANEL_KEYMINT_SECRET` (64) și `ADMIN_PASSWORD` (24, **în clar**).

**Impact concret.** Consecința unui singur compromis (pentru care configurația SSH de la SEC-01 este deja o cale realistă) este compromisia întregii platforme dintr-un singur fișier: acces la baza de date (parola Postgres), la panoul Pterodactyl ca root (`ptla_`), la emiterea de chei pentru orice client (`PANEL_KEYMINT_SECRET`), la toate sesiunile și la datele criptate ale acestora (`SESSION_SECRET` este și cheia de derivare pentru `encryptSecret`, `api/src/lib/secrets.ts:16-18`), la rutarea prin Caddy (`CADDY_ADMIN_TOKEN` — rescrierea tuturor rutelor, deci interceptarea completă a traficului) și la plățile (`STRIPE_SECRET_KEY`). **Concentrarea este mai gravă decât fiecare secret în parte**: `CADDY_ADMIN_TOKEN` este de fapt mai puternic decât `PTERODACTYL_APP_KEY`.

**Dovezi.**

```
$ grep -rniE "^\.env" /opt/blipmade/.gitignore
.env
.env.*
!.env.example
$ ls -la /opt/blipmade/.env*
-rw------- 1 debian debian 1411 /opt/blipmade/.env
-rw------- 1 debian debian 1321 /opt/blipmade/.env.bak.1792735247
-rw------- 1 debian debian 1411 /opt/blipmade/.env.bak.1792741882
```

**Bun (verificat):** niciun fișier `.env` nu a fost vreodată comis, `.gitignore` acoperă `.env` și `.env.*`, și **nicio valoare secretă din `.env` nu apare în istoricul git** (3,58 MB de `git log --all -p` verificate prin numărare, fără afișarea valorilor):

```
$ python3 … # pe VM 103: numără aparițiile fiecărei valori în git log --all -p
POSTGRES_PASSWORD          len=64   occurrences_in_history=0
PTERODACTYL_APP_KEY        len=48   occurrences_in_history=0
BLIPMADE_INTERNAL_API_TOKEN len=64  occurrences_in_history=0
SESSION_SECRET             len=64   occurrences_in_history=0
ADMIN_ENROLLMENT_KEY       len=48   occurrences_in_history=0
ADMIN_PASSWORD             len=24   occurrences_in_history=0
PANEL_KEYMINT_SECRET       len=64   occurrences_in_history=0
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / SMTP_URL / CADDY_ADMIN_TOKEN  occurrences_in_history=0
```

`git log --all --pretty=format: --name-only` nu conține niciun `.env`, `.pem`, `.key` sau `id_rsa`; `git rev-list --all --objects` nu conține niciun obiect cu aceste nume. Singurele fișiere cu „secret” în nume sunt sursă (`secrets.ts`, `credentials.ts`) și un test.

**Remediere (efort: mediu).** (a) Eliminați `ADMIN_PASSWORD` din `.env` după prima utilizare; (b) mutați `CADDY_ADMIN_TOKEN` în afara platformei (Caddy îl are nevoie, API-ul nu — și în prezent `CADDY_ADMIN_URL` este gol, deci integrarea Caddy nu este activă); (c) folosiți un manager de secrete (sau măcar fișiere `*.env` separate per rol, cu permisiuni `0600` și grupări diferite); (d) **rotați toate secretele imediat**, dacă se confirmă că hipervizorul a fost compromis (SEC-01); (e) ștergeți copiile `.env.bak.*` după ce vă asigurați că nu conțin valori vechi utile.

---

### SEC-12 — Fără HSTS, fără CSP, fără `X-Frame-Options` pe site-ul public

**Severitate:** Medium · **Clasă:** `VERIFIED` · **Componentă:** Caddy pe VM 102 (`/etc/caddy/Caddyfile`), `api/src/app.ts:58-61`.

**Descriere.** Configurația Caddy este minimală: două blocuri de site, `encode` și `reverse_proxy`, fără `header` și fără `tls` explicit (TLS 1.2/1.3 și cifre moderne sunt implicitele Caddy 2.6.2, deci **TLS-ul în sine este corect**). API-ul dezactivează explicit `contentSecurityPolicy` (`app.ts:59`) și `crossOriginEmbedderPolicy` (`app.ts:60`). Singurul antet de securitate care ajunge la browser este `X-Content-Type-Options: nosniff`, pus de containerul web.

**Impact concret.** Fără `Strict-Transport-Security`, prima vizită acceptă o conexiune în downgrade (atacatorul din mijloc prezintă un certificat pentru un alt nume, iar browserul trece la HTTP înainte de a construi headerul HSTS) — clasicul „SSL-strip” la prima vizită a unui client nou. Fără CSP și fără `X-Frame-Options`, site-ul nu are apărare în profunzime: dacă apare o injecție într-un șir randat de utilizator, nu există `script-src` care s-o blocheze, iar panoul client poate fi încorporat într-un `iframe` pe un site al atacatorului (impact limitat de `SameSite=Lax`, care nu trimite cookie-ul într-un iframe cross-site — dar limitarea este incidentală, nu un control).

**Dovezi.**

```
$ curl -s -D - -o /dev/null https://blipmade.com/ | grep -iE "strict-transport|content-security|x-frame|referrer|x-content-type"
x-content-type-options: nosniff
# strict-transport-security: absent
# content-security-policy: absent
# x-frame-options: absent
# referrer-policy: absent

$ sudo cat /etc/caddy/Caddyfile
test.apps.blipmade.com {
	encode zstd gzip
	reverse_proxy 10.77.0.11:30001
}
blipmade.com, www.blipmade.com {
    encode zstd gzip
    reverse_proxy 10.77.0.13:3000
}
```

**Remediere (efort: mic).** Adăugați în Caddy, pentru ambele site-uri:
`header Strict-Transport-Security "max-age=31536000; includeSubDomains"` și
`header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"`,
plus `X-Frame-Options: DENY` și `Referrer-Policy: strict-origin-when-cross-origin`. Activați `contentSecurityPolicy` în `helmet` pentru răspunsurile API.

---

### SEC-13 — Întărirea containerelor incompletă: `postgres`/`redis` ca root, fără `read_only`

**Severitate:** Medium · **Clasă:** `VERIFIED` · **Componentă:** `compose.yml`, `compose.api.yml`, `compose.web.yml` pe VM 103.

**Descriere.** `docker inspect` arată o configurație bună pentru containerele de aplicație și una slabă pentru cele de infrastructură.

**Dovezi.**

| Container | User | `cap_drop` | `no-new-privileges` | `read_only` | Porturi publicate |
|---|---|---|---|---|---|
| `blipmade-api-1` | `blip` | `ALL` | `true` | `false` | `127.0.0.1:3100` |
| `blipmade-worker-1` | `blip` | `ALL` | `true` | `false` | — |
| `blipmade-web-1` | `node` | `ALL` | `true` | `false` | `10.77.0.13:3000` |
| `blipmade-postgres-1` | **(root)** | **(nimic)** | **(nimic)** | `false` | `127.0.0.1:5432` |
| `blipmade-redis-1` | **(root)** | **(nimic)** | **(nimic)** | `false` | `127.0.0.1:6379` |

`read_only` nu este activat nicăieri, iar volumele `backup_data` (`/var/backups/blipmade`) și `upload_data` (`/data`) sunt `0755`, iar fișierele scrise în ele sunt `0644`.

**Impact concret.** `postgres` și `redis` rulează ca root, cu toate capabilitățile, în aceeași rețea Docker cu API-ul. O compromisie a bazei de date (de exemplu prin extensii, prin `COPY` sau prin o funcție cu privilegii) înseamnă root în container și acces imediat la API, cu posibilitatea de a forja `X-Forwarded-For` (SEC-05). `redis` nu are nici măcar autentificare (`command: ["redis-server", "--appendonly", "yes"]`), iar although este legat la loopback, este accesibil din rețeaua Docker.

**Remediere (efort: mediu).** Rulează `postgres` cu `user: postgres` și `cap_drop: ALL` + `no-new-privileges:true`; adaugă `redis-server --requirepass` cu parola din `.env` (sau folosește ACL-uri); activează `read_only: true` pentru `api` și `worker` cu `tmpfs` pentru `/tmp` și volume rw doar pentru `/data` și `/var/backups/blipmade`; setează `umask 0077` în `docker-entrypoint.sh` pentru fișierele scrise.

---

### SEC-14 — Adresele de origine publicate în DNS; originea fără HSTS, CSP sau autentificare de origine

**Severitate:** Medium · **Clasă:** `INFERRED` · **Componentă:** Edge (Proxmox + Caddy) și DNS.

**Descriere și raționament.** `blipmade.com` este servit prin Cloudflare (`server: cloudflare`, `cf-ray`, `report-to: cf-nel` — verificat). Dar celelalte două nume publice indică **direct** adresele de origine: `test.apps.blipmade.com → 193.34.214.143` (Caddy, prin DNAT pe hipervizor) și `panel.blipmade.com → 193.34.214.86` (panelul Pterodactyl, prin DNAT). Adresele de origine sunt deci **publicate în DNS**.

În același timp, hipervizorul are `INPUT` în `ACCEPT` fără reguli și Caddy ascultă pe `*:80`/`*:443` cu o configurație fără `header` și fără restricții de origine (`trusted_proxies`, `client_ip_headers` etc. — Caddy 2.6.2 nu are `trusted_proxies` în configurația globală aici). Sondajele din briefing arată că, din exterior, pe adresele publice se deschide **doar `22/tcp`**: deci filtrul de margine al furnizorului blochează `443` pentru clienți obișnuiți și îl permite doar celor necesari (probabil rețelei Cloudflare). **Aceasta este o inferență (`INFERRED`): regula furnizorului nu poate fi văzută din interior.** Concluzia: barica reală între internet și origine nu stă în codul platformei, ci într-o regulă din afara ei, iar originea nu are niciun control propriu care să reziste dacă acea regulă se schimbă ori este aplicată doar parțial.

**Impact concret.** Orice schimbare la filtrul furnizorului (o regulă mai permisivă, o adresă nouă, un al doilea furnizor) transformă site-ul într-un origin direct: Cloudflare este ocolit, WAF-ul și limitele de margine dispar, iar site-ul rămâne fără HSTS, fără CSP și fără autentificare de origine. În plus, publicarea adreselor permite ținte precisă a celor patru adrese publice și a serviciilor din spatele lor (panelul Pterodactyl și interfața Proxmox sunt tot pe aceste adrese).

**Dovezi.**

```
$ getent hosts blipmade.com test.apps.blipmade.com panel.blipmade.com
2a06:98c1:3120::3   blipmade.com                  # Cloudflare
193.34.214.143      test.apps.blipmade.com        # adresa de origine, publicată
193.34.214.86       panel.blipmade.com            # adresa de origine, publicată

$ curl -s -D - -o /dev/null https://blipmade.com/ | grep -iE "^server|cf-ray"
server: cloudflare
cf-ray: a4f228182d7c15f8-WAW
# antetele de securitate: doar x-content-type-options (vezi SEC-12)
```

**Remediere (efort: mediu).** (a) Folosiți Cloudflare și pentru `panel.blipmade.com` și `test.apps.blipmade.com` (proxy activ, cu `Allow` pentru origini) sau mutați-le pe subdomenii care rezolvă doar pe adrese private; (b) cereți de la furnizor un filtru de margine explicit, documentat, cu porturile permise; (c) activați HSTS și CSP (SEC-12) pentru ca originea să fie rezistentă și în cazul în care filtrul cade; (d) adăugați pe Caddy o autentificare de origine (mTLS cu Cloudflare sau un secret partajat) pentru `/api/*`.

---

### SEC-15 — Pre-flight CORS cu `Access-Control-Allow-Credentials` fără `Access-Control-Allow-Origin`

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** `api/src/app.ts:52-57`.

**Descriere.** Configurația CORS (`origin` din lista `APP_ORIGIN`, `credentials: true`) este **corectă**: cererea simplă de la un origin nepermis nu primește `Access-Control-Allow-Origin`, deci browserul blocă lectura. Dar răspunsul la pre-flight **include** `Access-Control-Allow-Credentials: true` și `Access-Control-Allow-Methods` chiar pentru un origin nepermis.

**Dovezi.**

```
$ curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://evil.example" \
    -H "Access-Control-Request-Method: POST" http://10.77.0.13:3000/api/auth/login | grep -i access-control
access-control-allow-credentials: true
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
# lipsește access-control-allow-origin
```

**Impact concret.** Nu este exploatabil într-un browser standard (fără `Access-Control-Allow-Origin`, pre-flight-ul eșuează), dar este un semnal greșit pentru clienți non-browser și pentru automatizări. **Remediere:** răspundeți `403` la pre-flight pentru un origin din afara listei.

---

### SEC-16 — Eșecul de autorizare al `/webhooks/stripe/replay` răspunde HTTP 200

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** `api/src/routes/webhooks.ts:558-562`.

**Descriere.** Ruta de replay este protejată de `BLIPMADE_INTERNAL_API_TOKEN`, dar când tokenul lipsește sau nu coincide, răspunde **HTTP 200** cu un corp de eroare, nu 401. Orice alertă bazată pe coduri HTTP 4xx nu observă tentativa. Comparația tokenului este `token !== env.internalToken`, fără constantă.

**Dovezi.**

```
$ curl -s -w "\nHTTP %{http_code}\n" -X POST -d '{}' http://10.77.0.13:3000/api/webhooks/stripe/replay
{"error":{"code":"unauthorized","message":"The internal token is required."}}
HTTP 200
```

**Impact concret.** Tokenul intern poate forța marcarea unor ordine ca plătite și poate declanșa provisionarea — o capacitate de administrare completă. **Remediere:** `reply.code(401)` și comparație în timp constant (`safeEqual` există deja în `api/src/lib/password.ts:50-55`).

---

### SEC-17 — `/api/health` și `/api/status` publice dezvăluie starea configurației

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** `api/src/routes/health.ts`.

**Descriere.** Endpoint-urile de sănătate și de stare sunt înregistrate fără prefix și fără autentificare.

**Dovezi.**

```
$ curl -s http://10.77.0.13:3000/api/health
{"status":"ok","service":"blipmade-api","version":"1.0.0","database":true,"redis":true,
 "mail":"file","mailDelivery":{"transport":"file","configured":false,"counts":{...,"writtenToFile":7,...}},
 "stripe":"not_configured","pterodactyl":"configured","panelKeyBridge":"configured"}
```

**Impact concret.** Dizolvă relația de configurare a platformei (relay absent, Stripe absent, bridge instalat), numărul de noduri libere și adâncimea cozii (`/api/status`). Nu conține secrete. **Impact:** ajută un atacator să aleagă ținta și să înțeleagă ce este *off*. **Remediere:** păstrați un indicator de sănătate public dar mutați detaliile într-un endpoint care cere permisiunea `infrastructure.read` (există deja).

---

### SEC-18 — Mesajele de e-mail scrise pe disc, lizibile de oricine (0644)

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** VM 103, volum `backup_data`.

**Descriere.** Transportul de e-mail este `file` (nu există `SMTP_URL`), deci mesajele ajung pe discul containerului.

**Dovezi.**

```
$ docker exec blipmade-api-1 ls -la /var/backups/blipmade/mail
drwxr-xr-x 2 blip blip 4096 Oct 23 14:23 .
-rw-r--r-- 1 blip blip  452 Oct 22 20:03 1792699431797-39hqn4.json
```

**Impact concret.** Fiecare mesaj — inclusiv cele de verificare și de resetare a parolei — ajunge pe disc, în mod lizibil de orice utilizator local. **Mitigarea deja implementată și verificată:** `redactTokens()` (`api/src/lib/mailer.ts:238-240`) elimină tokenul din link înainte de scriere, deci fișierul **nu poate fi folosit pentru a semna** (`mailer.ts:317-339`). Rămâne expunerea de date personale (adresa destinatarului, subiectul, corpul fără link). **Remediere (efort: mic).** `umask 0077` la scriere (`writeFile(..., { mode: 0o600 })`) și `chmod 700` pe director.

---

### SEC-19 — Enumerare de conturi la înregistrare; `login` scutit de CSRF

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** `api/src/routes/auth.ts:141`, `api/src/plugins/csrf.ts:13-21`.

**Descriere.** Comportamentul rutei de înregistrare și al celor de recuperare a parolei.

**Impact concret.** Enumerarea conturilor la înregistrare: `POST /auth/register` răspunde `409 conflict` cu „An account already uses this email address.” — enumerare directă a conturilor. În schimb, `forgot-password` și `resend-verification` răspund identic indiferent de existența contului (`auth.ts:253-258`), ceea ce este corect; și `login` răspunde identic, cu timp egalizat (`auth.ts:174`). Pe partea CSRF, rutele `login`, `register`, `forgot-password`, `reset-password`, `verify-email`, `resend-verification`, `enroll-admin` sunt scutite (`csrf.ts:13-21`), deci un site al atacatorului poate forța un login în contul atacatorului în browserul victimei (*login CSRF*); `SameSite=Lax` limitează impactul la navigări de nivel superior.
**Dovezi.**

```
$ grep -rn "An account already uses this email address" api/src
api/src/routes/auth.ts:141:      if (existing) throw conflict('An account already uses this email address.');
# în schimb, forgot-password și resend-verification răspund identic (auth.ts:255-258, 237-241)
```

**Remediere (efort: mic).** La înregistrare, răspundeți întotdeauna cu `202` și trimiteți e-mailul și când adresa există deja; păstrați scutirea CSRF pentru `login` (este necesară pentru aplicațiile non-browser) și adăugați un `Origin` check.

---

### SEC-20 — Cost `scrypt` sub recomandarea OWASP; `deriveKey()` recalculată la fiecare apel

**Severitate:** Low · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/lib/password.ts:18-28`, `api/src/lib/secrets.ts:16-18`.

**Descriere.** Parametrii de hash și modul de derivare a cheii de criptare.

**Impact concret.** Costul de forțare a parolei este mai mic decât recomandarea curentă.

**Dovezi.**

```ts
// api/src/lib/password.ts:18-22
const N = 16384; const R = 8; const P = 1; const KEYLEN = 64;
// api/src/lib/secrets.ts:16-18  — apelată la fiecare encrypt/decrypt, fără cache
function deriveKey(): Buffer { return scryptSync(env.SESSION_SECRET, 'blipmade:secret-box', 32); }
```

Hash-urile folosesc `scrypt` cu `N=16384, r=8, p=1`, `keylen=64`, sare aleatoare de 16 octeți și format parametrizat (`scrypt$N$r$p$salt$hash`) — implementare solidă. Dar `N=2^14` este sub pragul recomandat de OWASP pentru parole (`N≥2^17` cu `r=8,p=1`, sau `N=2^16` cu `r=8,p=2`), ceea ce înseamnă un cost de forțare a parolei de ordinul a 4–8 ori mai mic decât recomandarea curentă. Separat, `deriveKey()` apelează `scryptSync(SESSION_SECRET, …)` la **fiecare** `encryptSecret`/`decryptSecret`/`secretFingerprint` — o alocare de 16 MiB și un calcul de ordinul a 50 ms per apel, necache-uită; `decryptSecret` este apelat pe calea fierbinte a operațiilor cu panoul.

**Remediere (efort: mic).** Ridicați `N` la `32768` sau `65536` (formatul stocat permite ridicarea fără invalidarea hash-urilor existente) și cache-uiti `deriveKey()` într-o variabilă de modul.

---

### SEC-21 — Parola contului de panou generată cu `Math.random()`

**Severitate:** Low · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/services/panel/identity.ts:115`.

**Descriere.** Parola contului de panou al fiecărui client este generată la crearea contului.

**Impact concret.** Impactul este mic: parola nu este nicăieri stocată și nu este întâlnită nicăiată de client („the customer never signs in to the panel”, `identity.ts:111-114`), deci nu poate fi folosită pentru autentificare. Generarea nu este însă criptografică.

**Dovezi.**

```ts
// api/src/services/panel/identity.ts:115
const password = `bm-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
```

`Math.random()` nu este un generator criptografic. **Remediere (efort: minim):** folosiți `randomBytes(24).toString('base64url')`.

---

### SEC-22 — `env.cookieSecure` este cod mort; `COOKIE_SECURE` nu este setat

**Severitate:** Low · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/env.ts:121-126`.

**Descriere.** Două mecanisme concurente pentru atributul `Secure` al cookie-ului.

**Impact concret.** Valoarea calculată (`env.cookieSecure`) nu ajunge nicăieri, deci o eroare de configurare viitoare ar trece neobservată.

**Dovezi.**

```
$ grep -rn "cookieSecure" api/src
api/src/env.ts:121:  cookieSecure:          # calculat, niciodată consumat
# singurul consumator real: resolveCookieSecure(request) în api/src/plugins/auth.ts:49-53
$ grep -E "^COOKIE_SECURE=" /opt/blipmade/.env   # variabila nu este setată
```

`env.cookieSecure` este calculat (`raw.COOKIE_SECURE === 'true' ? true : … : raw.APP_ORIGIN.startsWith('https://')`) și **nu este folosit nicăieri** (`grep -rn "cookieSecure" api/src` → doar definiția). Comportamentul real este `resolveCookieSecure(request)` (`api/src/plugins/auth.ts:49-53`): override prin `COOKIE_SECURE`, altfel protocolul cererii. `COOKIE_SECURE` nu este în `.env`, deci urmează protocolul. **Lanțul de încredere funcționează corect** (falsificarea `X-Forwarded-Proto` de la un client LAN nu produce un cookie `Secure` — verificat), dar consecința este că pe origin-ul HTTP din LAN cookie-ul de sesiune circulă fără `Secure` (SEC-03). **Remediere:** fie ștergeți câmpul mort, fie folosiți-l: setați `COOKIE_SECURE=true` în producție și păstrați comportamentul legat de protocol doar în test.

---

### SEC-23 — `ADMIN_ENROLLMENT_KEY` rămâne în `.env`; comparație cu `!==`

**Severitate:** Info · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/auth.ts:290-311`.

**Descriere.** Cheia de înscriere a primului administrator este păstrată în fișierul de secrete.

**Impact concret.** Riscul este redus: ruta este inactivă de îndată ce există un administrator.

**Dovezi.**

```
# api/src/routes/auth.ts:293-311
if (!env.ADMIN_ENROLLMENT_KEY) throw badRequest('Administrator enrollment is not configured ...');
if (body.enrollmentKey !== env.ADMIN_ENROLLMENT_KEY) throw unauthorized(...);
const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
if (adminCount > 0) throw conflict('This platform already has an administrator.');
```

Ruta `POST /auth/enroll-admin` funcționează doar cât timp platforma nu are niciun administrator (`auth.ts:310-311`) și cere cheia din `.env`. Cheia rămâne în fișier după înscriere, iar comparația este `body.enrollmentKey !== env.ADMIN_ENROLLMENT_KEY` (fără constantă) și ruta este scutită de CSRF (`csrf.ts:20`). **Remediere:** ștergeți `ADMIN_ENROLLMENT_KEY` din `.env` după înscriere și folosiți `safeEqual`.

---

### SEC-24 — Eșecul scrierii în jurnal este înghițit; IP-ul nu e înregistrat la fiecare acțiune

**Severitate:** Info · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/lib/audit.ts:18-34`, `api/prisma/schema.prisma:763-778`.

**Descriere.** Mecanismul de jurnalizare și proprietățile tabelului `AuditLog`.

**Impact concret.** O acțiune nerecordată este posibilă fără nicio alarmă, iar acțiunile unui utilizator șters rămân fără actor identificabil.

**Dovezi.**

```
$ grep -rn "auditLog\.\(update\|delete\|upsert\)" api/src     # fără rezultat -> append-only
# api/src/lib/audit.ts:31-33
} catch (error) { console.error('[audit] failed to record entry', input.action, ...); }
# api/prisma/schema.prisma:766  — actor User? @relation(..., onDelete: SetNull)
```

**Bun (verificat):** jurnalul este **append-only în cod** — `grep -rn "auditLog\.\(update\|delete\|upsert\)" api/src` nu returnează nimic, la fel `instanceEvent` și `ticketEvent`. Modelul `AuditLog` are index pe `createdAt`, `actorId` și pe perechea `targetType/targetId` (`schema.prisma:763-778`), deci interogările de incident sunt ieftine. **Deficiențe:** `audit()` prinde și înghite orice eroare (`audit.ts:31-33`), deci o lipsă de scriere înseamnă o acțiune nerecordată, fără alarmă; și `ip` este trecut doar la unele acțiuni (de exemplu `auth.login` și `auth.logout` îl trimit, `instance.command_sent` nu). În plus, `AuditLog.actorId` are `onDelete: SetNull`, deci ștergerea unui utilizator face ca acțiunile lui să rămână fără actor. **Remediere:** scrieți într-o coadă cu retry și expuneți un contor al eșecurilor în `/api/health`; completați `ip` la fiecare `audit()` cu `request.ip` prin wrapper.

---

### SEC-25 — Sesiuni de 14 zile, fără timeout de inactivitate și fără re-autentificare

**Severitate:** Info · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/plugins/auth.ts:11,61-62,100-131`.

**Descriere.** Durata de viață a unei sesiuni și mecanismele de încheiere.

**Impact concret.** Un cookie furat (de pe un calculator partajat, din backup-urile browserului, printr-un XSS) este bun două săptămâni, fără timeout de inactivitate și fără re-autentificare pentru operațiile sensibile.

**Dovezi.**

```
# api/src/plugins/auth.ts:11
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
# api/src/plugins/auth.ts:112-115  — expirarea e verificată la fiecare cerere
if (session.expiresAt.getTime() < Date.now()) { await prisma.session.delete(...); return undefined; }
```

`SESSION_TTL_MS` este de 14 zile, absolut, fără glisare și fără timeout de inactivitate: **Bun:** sesiunea este stocată server-side ca hash SHA-256 al tokenului (`plugins/auth.ts:61-72`, `lib/tokens.ts:9-11`), deci o scurgere a bazei de date nu permite reluarea sesiunilor; sesiunile expirate sunt șterse la citire și de către worker (`pruneSessions`); schimbarea parolei închide toate celelalte sesiuni (`settings.ts:379-394`) și resetarea parolei le închide pe toate (`auth.ts:279`); utilizatorul poate revoca o sesiune individual (`settings.ts:415-434`), cu verificare de proprietar. **Remediere:** reduceți TTL-ul la 7 zile, cereți parola curentă pentru schimbarea adresei de e-mail și pentru operațiile de personal, și cereți o re-autentificare înainte de operațiile sensibile (consolă, credential de panou).

---

### SEC-26 — `PUT /admin/settings` acceptă o înregistrare arbitrară (mass assignment)

**Severitate:** Info · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/admin.ts:834-842`.

**Descriere.** `PUT /admin/settings` scrie orice pereche cheie–valoare din corpul cererii în tabelul `Setting`.

**Impact concret.** Limitat: la runtime se citesc doar două chei, deci nu există o cheie cu efect de escaladare.

**Dovezi.**

```
# api/src/routes/admin.ts:836-839
const body = z.record(z.unknown()).parse(request.body);
for (const [key, value] of Object.entries(body)) { await prisma.setting.upsert({ where: { key }, ... }); }
# singurele citiri runtime:
api/src/services/billing.ts:31   -> key: 'auto_delete_cancelled_instances'
api/src/routes/domains.ts:129    -> key: 'reserved_domains'
```

Rota parsează corpul cu `z.record(z.unknown())` și scrie orice cheie în tabelul `Setting`. **Remediere:** folosiți o listă albă de chei cunoscute și validați tipul fiecăreia.

---

### SEC-27 — Rutele scutite de CSRF folosesc comparație cu `!==`

**Severitate:** Info · **Clasă:** `CODE-INSPECTED` · **Componentă:** `api/src/routes/auth.ts:306`, `api/src/routes/webhooks.ts:560,493`.

**Descriere.** Cele două comparații de token care nu folosesc timp constant.

**Impact concret.** Neglijabil: cu un spațiu de căutare de 48 de caractere aleatorii, o diferență de timp nu este măsurabilă de la rețea.

**Dovezi.**

```
# api/src/routes/auth.ts:306
if (body.enrollmentKey !== env.ADMIN_ENROLLMENT_KEY) throw unauthorized(...);
# api/src/routes/webhooks.ts:560 și :493
if (!env.internalToken || token !== env.internalToken) { ... }
# în comparație, CSRF-ul folosește corect safeEqual (api/src/plugins/csrf.ts:36)
```

Comparațiile de token de la `enroll-admin` (`!==`) și de la tokenul intern (`!==`) nu sunt în timp constant, în timp ce comparația CSRF este corectă (`safeEqual`, `plugins/csrf.ts:36`). **Remediere:** folosiți `safeEqual` (`api/src/lib/password.ts:50-55`) peste tot.

---

### SEC-28 — `rpcbind` ascultă pe `0.0.0.0:111`, portul este deschis public și primește conexiuni din exterior

**Severitate:** High · **Clasă:** `VERIFIED` · **Componentă:** hipervizorul `n7030e1` (`rpcbind` / `systemd-rpcbind`, PID 8997).

**Descriere.** Portmapper (`rpcbind`) rulează pe hipervizor și ascultă pe **toate interfețele, pe TCP și pe UDP**: `0.0.0.0:111` și `[::]:111`. Pe gazdă nu există nicio regulă de firewall (`iptables -S INPUT` → doar `-P INPUT ACCEPT`), deci portul este expus pe interfața publică. Nimic de pe această gazdă nu folosește NFS sau Sun RPC: singurele exporturi locale sunt `vzdump`, `zfsutils-linux` și `e2scrub_all`, iar `exportfs` nu are exporturi. **Trei conexiuni TCP stabilite vin de la o adresă externă** (`45.79.207.110`) către `193.34.214.143:111` și `193.34.214.86:111` — conexiuni care pot exista doar dacă portul este deschis prin marginea furnizorului, deci reachability-ul din internet este dovedit de trafic, nu doar de o presupunere.

**Impact concret.** `rpcbind` este un reflector de amplificare clasic: o cerere UDP mică trimisă pe portul 111 produce un răspuns considerabil mai mare, direcționat către adresa sursă falsificată. Un atacator care folosește gazda drept reflector își descarcă atacul DDoS asupra unei terțe părți, cu **adresa IP a platformei ca sursă** — deci cu reputația și cu posibilitatea de a fi blocate ale acesteia. În plus, portmapper publicat enumeră programele RPC înregistrate pe gazdă (cartografiere a serviciilor, inclusiv a planului de management Proxmox de pe `8006` și a lui `spiceproxy` de pe `3128`) și oferă un reflector permanent, cu suprafață mică și cost aproape zero pentru atacator.

**Dovezi.**

```
$ ss -lntup | grep ":111"
udp UNCONN 0 0 0.0.0.0:111 0.0.0.0:*  users:(("rpcbind",pid=8997,fd=5),("systemd",pid=1,fd=105))
udp UNCONN 0 0    [::]:111    [::]:*  users:(("rpcbind",pid=8997,fd=7),("systemd",pid=1,fd=107))
tcp LISTEN 0 4096 0.0.0.0:111 0.0.0.0:* users:(("rpcbind",pid=8997,fd=4),("systemd",pid=1,fd=104))
tcp LISTEN 0 4096    [::]:111    [::]:* users:(("rpcbind",pid=8997,fd=6),("systemd",pid=1,fd=106))

$ ss -ntp | grep ":111 "
ESTAB 0 0 193.34.214.143:111 45.79.207.110:50624 users:(("rpcbind",pid=8997,fd=11))
ESTAB 0 0 193.34.214.143:111 45.79.207.110:50622 users:(("rpcbind",pid=8997,fd=10))
ESTAB 0 0 193.34.214.86:111  45.79.207.110:54750 users:(("rpcbind",pid=8997,fd=9))

$ iptables -S INPUT
-P INPUT ACCEPT
```

**Reproducție (fără caracter distructiv).** `ss -ntp | grep ':111 '` arată cele trei conexiuni stabilite; dintr-o mașină externă, `nc -vz 193.34.214.20 111` răspunde, iar `nc -vzu 193.34.214.20 111` (un `pmap` de test) arată răspunsul de portmapper — **nu trimiteți astfel de cereri**: un test de amplificare, chiar și inofensiv, poate fi confundat cu un atac de reflectare.

**Remediere (efort: mic).** (a) `systemctl disable --now rpcbind rpcbind.socket` — nimic de pe hipervizor nu are nevoie de el, iar Proxmox nu depinde de NFS; (b) dacă trebuie păstrat, legați-l de `127.0.0.1` și adăugați o regulă `INPUT` care respinge `111/tcp` și `111/udp` pe interfața publică; (c) includeți `111` în lista de porturi închise din remedierea SEC-01; (d) identificați sursa celor trei conexiuni (`45.79.207.110`) și decideți dacă este un scanator cunoscut sau ceva care merită un incident propriu.

---

### SEC-29 — Cheia API a agentului operatorului este vizibilă în argumentele procesului

**Severitate:** Low · **Clasă:** `VERIFIED` · **Componentă:** hipervizorul `n7030e1`, tooling-ul propriu al operatorului (`/root/.cursor-server/.../cursor-agent`).

**Descriere.** Worker-ul agentului rulează cu cheia API transmisă **ca argument de linie de comandă** (`--api-key <valoare>`). În Linux, argumentele unui proces sunt în `/proc/<pid>/cmdline`, iar fișierul este creat cu modulul `0444` — deci **citibil de orice utilizator local**, nu doar de `root`. Procesul rulează ca `root` pe gazda care găzduiește toate secretele platformei. Valoarea este o credențială de 69 de caractere; **nu este reprodusă în acest raport** — se raportează doar tipul, lungimea și locul.

**Impact concret.** Orice utilizator local sau orice proces care poate citi tabelul de procese obține cheia, cu care poate conduce agentul de cod al operatorului: acces la spațiile de lucru pe care le are, scriere de fișiere, execuție de comenzi și exfiltrare de cod. Expunerea este **locală, nu de la distanță** — de aceea severitatea este Low — dar stă pe aceeași gazdă ca toate secretele platformei, pe care un proces compromis le-ar citi oricum. Context: singura conexiune outbound de lungă durată a acestui proces este cea a propriului agent (`34.225.159.174:443`), adică trafic legitim, nu exfiltrare.

**Dovezi.**

```
$ ps -eo pid,user,args | grep cursor-agent | grep -v grep
# valoarea este redată aici; forma este --api-key <69 de caractere>
203648 root  /root/.cursor-server/data/User/globalStorage/<...>/cursor-agent --use-system-ca         /root/.cursor-server/data/User/globalStorage/<...>/versions/<...>/index.js         --api-key <redacted-len-69> --endpoint https://api2.cursor.sh worker start ... --name ~ @ n7030e1 ...

$ ls -l /proc/203648/cmdline
-r--r--r-- 1 root root 0 Oct 22 14:12 /proc/203648/cmdline     # 0444 -> orice utilizator local poate citi

$ ss -ntp | grep 203648
ESTAB 0 0 193.34.214.20:34094 34.225.159.174:443 users:(("MainThread",pid=203648,fd=30))
```

**Reproducție (fără caracter distructiv).** `ps -eo args | grep -o '\-\-api-key [^ ]*'` de către orice utilizator local de pe gazdă (de exemplu `debian`) extrage cheia.

**Remediere (efort: mic).** (a) Transmiteți cheia prin mediu (`CURSOR_API_KEY`) dintr-un fișier cu modul `0600`, sau printr-un depozit de credențiale, nu prin argumentul de linie de comandă; dacă clientul impune `--api-key`, puneți lansarea într-un script care citește cheia dintr-un fișier root-only și o șterge din `argv` înainte de exec; (b) ca întărire, montați `/proc` cu `hidepid=2` pentru a limita vizibilitatea argumentelor; (c) roțiți cheia dacă a fost văzută în afara gazdei (de exemplu într-un transcript de terminal partajat).

---

## 5. Top 10 riscuri, ordonate după severitate × exploatabilitate

| # | ID | De ce este pe această poziție | Risc real |
|---|---|---|---|
| 1 | **SEC-01** | Parola de `root` acceptată pe interfața publică a gazdei care ține totul, sub un atac automat care produce mii de încercări pe oră. Configurația este cea care este defectă, nu comportamentul cuiva. | Orice scurgere a parolei = control asupra nodului de jocuri, al bazei de date, al panoului și al hipervizorului. |
| 2 | **SEC-02** | Consola Proxmox răspunde pe adresa publică, iar singura protecție este o parolă de administrator web. Nu este nevoie de nicio abilitate specială. | Controlul planului de management = controlul tuturor datelor clienților. |
| 3 | **SEC-28** | `rpcbind` pe `0.0.0.0:111`, deschis public și confirmat traversat din exterior; reflector de amplificare cu cost zero pentru atacator. | Gazda devine reflector DDoS cu adresa IP a platformei ca sursă; plus enumerarea serviciilor. |
| 4 | **SEC-04** | O singură rută, un singur rol (`staff.write`), fără verificarea permisiunilor acordate. Exploatare imediată de către orice angajat cu acel rol. | Personalul cu privilegii minime devine `ADMIN` efectiv. |
| 5 | **SEC-03** | API-ul de producție, cu baza de date și secretele, pe HTTP simplu, accesibil din rețeaua internă. | Interceptarea sesiunilor, ocolirea TLS-ului, pulverizarea limitelor de rată. |
| 6 | **SEC-06** | 29 de rute mutante fără limită, toate ajungând la panoul și la nodul partajat; nu cere nicio abilitate. | Epuizarea discului/memoriei nodului pentru toți clienții; abuz de releu de e-mail. |
| 7 | **SEC-07** | Fără limită per cont; 10 parole/15 min/adresă. | Credential stuffing pe conturi cunoscute. |
| 8 | **SEC-09** | Segmentele de cale nevalidate ajung la panoul; singura protecție este cea a panoului, a cărei versiune nu o pot verifica. | Citirea/scrierea de fișiere în afara containerului, dacă panoul are o versiune vulnerabilă. |
| 9 | **SEC-05** | `TRUSTED_PROXIES` nu e setat → încredere în `172.16.0.0/12`; `postgres`/`redis` rulează ca root în aceeași rețea. | Ocolirea limitelor de rată și falsificarea IP-urilor în jurnal, dintr-un container compromis. |
| 10 | **SEC-12** | Fără HSTS și fără CSP; efectul este *first-visit downgrade* și absența apărării în profunzime. | Degradarea TLS la prima vizită; impact XSS și clickjacking neacoperit. |

*Urmează imediat după SEC-12: **SEC-14** (originea și adresele de panou publicate în DNS, singura barieră fiind o regulă a furnizorului, `INFERRED`) și **SEC-29** (cheia API a agentului în argumentele procesului, expunere locală).*---

## 6. Ce a fost verificat și s-a dovedit corect

Acestea sunt constatări **pozitive**, cu dovezi, pentru ca cititorul să-și facă o imagine despre acoperirea auditului.

**Autorizare și multi-tenancy**
- Fiecare rută din familia `/instances/:id/*` re-verifică proprietatea: `loadInstance(userId, id)` (`api/src/routes/instances.ts:60-65`) și `loadOwnedInstance(userId, id)` (`api/src/services/panel/operations.ts:36-49`) folosesc `where: { id, userId }`. Atât consolă, cât și fișiere, baze de date, backup-uri, planificări, alocări, setări, startup, metrici, evenimente și server folosesc `withInstance()` sau `loadOwnedInstance`. **Nu am găsit nicio rută din această familie care să folosească identificatorul din cerere fără a-l re-verifica.**
- Websocket-ul consolei verifică sesiunea și proprietatea înainte de a deschide orice conexiune (`api/src/routes/instances.ts:375-401`); tokenul panoului nu ajunge în browser (`instances.ts:414-434`).
- Tichetele: `ticket.userId !== user.id && !isStaff → 404` (`api/src/routes/tickets.ts:213,264,321,388`), iar descărcarea unui atașament cere și apartenența la tichet (`tickets.ts:390`).
- Domeniile: `claimedByUserId !== user.id → 403` (`api/src/routes/domains.ts:370`) și `DELETE` cere de asemenea proprietatea (`domains.ts:473`).
- `DELETE /api/admin/instances/import` este restricționat suplimentar la `ADMIN` (`api/src/routes/admin.ts:866`), iar `PUT /admin/settings` nu poate modifica secrete (SEC-26).
- `/admin/*`: **fiecare** rută are `preHandler: requirePermission(...)` sau `requireStaff` (cele 30 de rute din `admin.ts` au fiecare un `preHandler` — `grep` pe lista completă), `requireStaff` cere `role ∈ {STAFF, ADMIN}` (`plugins/auth.ts:138-142`), iar permisiunile vin din rândul `StaffMember` (`plugins/auth.ts:130`, `schema.prisma:185-199`). Nu există rută publică prin care un `CUSTOMER` devine `STAFF` (`grep "role:\s*'"` → doar `CUSTOMER` la `auth.ts:150` și `admin.ts:94`, `ADMIN` la `auth.ts:326`).
- **Verificat prin execuție:** `GET /api/admin/overview` fără sesiune → `401 {"error":{"code":"unauthorized"}}`; `GET /api/internal/whoami` → `{"user":null}`.

**Parole și sesiuni**
- `scrypt` cu sare aleatoare per parolă, `timingSafeEqual` la comparare (`api/src/lib/password.ts:24-45`), format parametrizat care permite ridicarea costului fără invalidare. Politică: minimum 10, maximum 200, literă mare, mică și cifră (`password.ts:57-70`).
- Răspunsul de login este egalizat ca timp pentru cont inexistent (`auth.ts:174`), mesajul nu distinge contul existent de parola greșită, `forgot-password` și `resend-verification` răspund identic (`auth.ts:253-258`).
- Tokenul de sesiune: 32 de octeți aleatori, stocat **doar ca hash SHA-256** (`plugins/auth.ts:61-72`, `lib/tokens.ts:9-11`); sesiunile expirate sunt respinse și șterse la citire (`plugins/auth.ts:112-115`); utilizatorul suspendat pierde accesul imediat (`plugins/auth.ts:116`).
- Cookie: `HttpOnly` pe `bm_session`, `SameSite=Lax`, `Path=/`, fără `Domain` (host-only), `Secure` derivat din protocolul cererii printr-un lanț de încredere corect (`plugins/auth.ts:74-81`). `bm_csrf` este intenționat lizibil de JS, cu `SameSite=Lax` și `maxAge` 24h (`plugins/csrf.ts:44-52`).
- **CSRF:** dublu-submit cu comparație în timp constant (`plugins/csrf.ts:28-39`), aplicat tuturor metodelor care modifică starea, cu excepții restrânse și argumentate (`csrf.ts:13-21,30`).
- Revocarea sesiunilor funcționează și este limitată la proprietar (`settings.ts:415-434`); schimbarea parolei închide celelalte sesiuni (`settings.ts:379-394`).

**Validare și injecție**
- **SQL:** doar două apeluri `$queryRaw`, ambele cu șir literal (`api/src/routes/health.ts:13`, `api/src/worker.ts:142`). Prisma parametriză restul; nicio șir SQL construit prin concatenare.
- **Execuție de comenzi:** niciun `child_process`, `exec`, `spawn` sau `shell: true` în `api/src` (am căutat în tot repository-ul).
- **Traversare de drum:** serverul static conține calea (`web/server.mjs:172-173`: `resolve(root, '.' + pathname)` + verificarea prefixului); **verificat prin execuție** — `/%2e%2e%2f%2e%2e%2fetc/passwd` → `403`, iar variantele necodificate întorc `index.html` (SPA), nu fișierul cerut. Atașamentele au nume aleator, `resolve` + verificare de apartenență la rădăcină și nume de fișier sanitizat (`api/src/lib/attachments.ts:38-59`).
- **XSS:** `grep -rn "dangerouslySetInnerHTML|innerHTML|eval\(|new Function" web/src` → **niciun rezultat**. React escapează prin default, iar interfața nu are niciun punct în care conținutul utilizatorului ar fi interpretat ca HTML.
- **Prototipuri / mass assignment:** `zod` parsează fiecare corp de cerere; `PUT /admin/settings` este singurul caz permis (SEC-26, limitat).
- **Intrări nelimitate:** `bodyLimit: 2 MB` (`app.ts:48`), limite pe lungimea șirurilor, `take: 200` pe listele de administrare, `take: 50` pe liste de fișiere, `max 50` pe listele de arhive.

**Puntea către Pterodactyl**
- Bridge-ul semnează cu HMAC-SHA256 peste `timestamp.nonce.external_id` (`panel-bridge/BlipmadeKeyMintController.php:49,74-76`), compară cu `hash_equals`, impune o fereastră de 60 de secunde (`php:80`), respinge nonce-urile repetate prin `Cache::add` atomic (`php:85-89`), leagă cheia de o listă de adrese (`php:110,132-137`), refuză conturile `root_admin` (`php:99-104`) și revocă cheia precedentă (`php:118,149-157`).
- **Verificat prin execuție:** `POST https://panel.blipmade.com/api/blipmade/keymint` cu o semnătură falsă (dar cu formă validă) → `401 {"error":"unauthorized"}`. Deci bridge-ul este instalat, secretul este configurat (≥32 de caractere) și lista de adrese permise **nu este goală** (altfel răspunsul ar fi `503 disabled`, `php:49-54`).
- Cheia clientului este stocată **criptată** (`PanelCredential.tokenEnc`, `schema.prisma:135-151`) cu AES-256-GCM și IV aleator (`api/src/lib/secrets.ts:13-43`); nu este trimisă niciodată în browser (`admin.ts:215-224` arată doar existența ei).
- Identitatea pe panel este legată de un `external_id` derivat din id-ul intern al clientului, niciodată de o adresă de e-mail (`api/src/services/panel/identity.ts:28-30,69-110`); o adresă scrisă manual nu poate prelua contul altcuiva.
- **Clientul nu poate influența nodul sau alocarea:** `chooseNode(ram, disk)` alege server-side pe baza capacității libere (`api/src/services/provisioning.ts:203,449`), iar `created.node`/`created.allocation` sunt valorile *returnate de panou*, nu cele cerute (`provisioning.ts:490-493`).
- Operațiile cu cheia clientului sunt limitate la serverul clientului; panoul verifică proprietatea (nu am putut verifica versiunea panoului — VM 100 fără acces SSH).

**Plăți**
- Webhook-ul Stripe verifică semnătura cu `stripe.webhooks.constructEvent` (`api/src/routes/webhooks.ts:435`); în producție gateway-ul de test este oprit (`stripe.ts:39-42`, iar `STRIPE_TEST_MODE=false` și `NODE_ENV=production` pe server). **Verificat prin execuție:** `POST /api/webhooks/stripe` fără semnătură → `{"received":false,"reason":"Stripe is not configured."}`, fără nicio modificare de stare; `POST /api/webhooks/stripe/test` → `404`; `POST /api/webhooks/stripe/replay` fără tokenul intern → refuzat. Suma colectată este comparată cu totalul comenzii (`webhooks.ts:192-194,218`).

**Gazdă — ce s-a verificat și nu a găsit nimic**
- Verificările de persistență pe hipervizor sunt ** curate**: niciun cont nou (`awk -F: '$3>0 && $3<1000' /etc/passwd` arată doar conturile standard Debian/Proxmox), `/root/.ssh/authorized_keys` este un symlink către `/etc/pve/priv/authorized_keys` (structura proprie Proxmox) cu aceleași două chei, cronul conține doar `e2scrub_all`, `vzdump` și `zfsutils-linux`, singura unitate systemd nouă este `blipmade-network.service` (setup-ul operatorului), iar `ss -lntp` nu arată ascultătoare necunoscute. De asemenea, **nicio modificare a depozitului** `/opt/blipmade` în afara checkout-ului git (`git status --porcelain` gol) și **niciun fișier modificat** acolo după 11:30 pe 23 octombrie, în afara istoricului git.
- Cele trei adrese din care provin autentificările reușite (`82.77.97.125`, `86.125.49.245`, `86.125.26.198`) sunt, conform RDAP, blocuri de internet din România (`RO-RESIDENTIAL` și `RO-RCS-RDS`) — **nu există niciun element care să indice un atacator**; cele 13 eșecuri anterioare ale lui `86.125.49.245` (utilizatorul `ubuntu`) sunt tipice pentru un scanner de porturi și pentru un client care încearcă mai multe metode de autentificare.
- TLS-ul Caddy este implicitul Caddy 2.6.2 (TLS 1.2/1.3, cifre moderne); `caddy version` → `2.6.2`.
- API-ul este legat **doar** la loopback (`127.0.0.1:3100`); `postgres` și `redis` la fel. Doar staging-ul este publicat în rețeaua (SEC-03).

**Transport și containere**
- `cap_drop: ALL` și `no-new-privileges:true` pe cele trei containere de aplicație, cu utilizatori non-root (`blip`, `node`).
- Interfața de administrare Caddy ascultă doar pe `127.0.0.1:2019` (`ss -lntp` pe VM 102) — nu este expusă.

---

## 7. Ce nu a putut fi verificat, cu pasul de deblocare

| # | Ce | De ce | Pasul de deblocare sigur |
|---|---|---|---|
| 1 | Setul exact de reguli al filtrului de margine al furnizorului | Reachability-ul lui `8006/tcp` pe `193.34.214.20` este **confirmat** (conectare din exterior), dar **regulile** furnizorului nu sunt vizibile din interior; de aceea nu se poate spune ce alte porturi sunt deschise. | Un `nmap -Pn -p 1-1024,30000-30100,8000-8100,3128 193.34.214.20 193.34.214.143 193.34.214.86 193.34.214.87` **de pe o mașină din afara rețelei 10.77.0.0/24**, plus raportul furnizorului despre filtrul de margine. |
| 2 | Reachability-ul din internet a originii pe `443` și dacă regulile furnizorului permit și altceva decât rețelele Cloudflare | `blipmade.com` este servit prin Cloudflare, deci originea se vede doar din interior. | `curl --resolve blipmade.com:443:193.34.214.143 https://blipmade.com/ -k` **de pe o mașină externă**, plus `curl --resolve panel.blipmade.com:443:193.34.214.86 https://panel.blipmade.com/ -k` pentru panou. |
| 3 | Versiunea panoului Pterodactyl și dacă are o versiune vulnerabilă la traversare de drum | VM 100 nu are cheie SSH pentru agent și agentul oaspeților nu rulează. | Fie o cheie SSH pentru `debian@10.77.0.10`, fie rularea agentului oaspeților pe VM 100, fie `docker exec` pe panou pentru `php artisan about`. Alternativ, din aplicație: `GET /api/application/servers` cu cheia de aplicație (numărul de versiune apare în antetele de răspuns ale panoului). |
| 4 | Conținutul real al listei `BLIPMADE_KEYMINT_ALLOWED_IPS` pe panou și dacă include adresa din care cheile de client sunt folosite | Configurația panoului nu este lizibilă fără acces la VM 100. | Același pas ca la #3; alternativ, o operație reală de client (de ex. deschiderea consolei) arată un `403` de la panou dacă lista nu conține adresa corectă. |
| 5 | Confirmarea de către operator a celor trei adrese de origine a autentificărilor reușite (`82.77.97.125`, `86.125.49.245`, `86.125.26.198`) | Verificările de persistență **s-au făcut și sunt curate**; ce nu se poate stabili din interior este intenția umană din spatele celor trei adrese. | Operatorul confirmă din jurnalul conexiunilor proprii (Termius, furnizorul de internet) dacă toate trei adrese sunt ale sale. Dacă una nu este, se escaladează imediat la incident, cu `journalctl -u ssh --since "-72h" --no-pager` complet. |
| 6 | Conținutul efectiv al traficului prin Cloudflare și dacă WAF-ul/bot-ul este activ | Cloudflare e la margine și nu este configurabil de aici. | Contul Cloudflare: zona `blipmade.com` → Security/WAF și速率 limiting. |
| 7 | Politica reală a furnizorului pentru `22/tcp` pe cele patru adrese publice | Parec să existe un filtru extern (doar `22` a răspuns), dar regulile nu sunt vizibile. | Contractul/consolea furnizorului sau un `nmap` extern pe `22` și pe intervalul `8000-8100` și `30000-31000`. |
| 8 | Integritatea bazei de date și a volumelor față de o eventuală compromisă a hipervizorului (configurația de la SEC-01) | Auditul nu atinge baza de date (regula 1 a briefing-ului). | `docker compose exec -T postgres psql -U blipmade -d blipmade -c "SELECT ..."` în **doar citire**, cu atenție la tabelele `AuditLog`, `User` și `Session` (creare recentă, roluri neobișnuite); comparație cu `pg_stat_activity`. |

---

## 8. Anexă — comenzile de verificare executate

Toate au fost în regim read-only și nu au schimbat starea.

```bash
# suprafața de cod
grep -rnE '\$queryRaw|\$executeRaw|child_process|exec\(|spawn|shell: true|eval\(' api/src
grep -rn "dangerouslySetInnerHTML|innerHTML|eval\(|new Function" web/src
grep -rn "auditLog\.\(update\|delete\|upsert\)" api/src
grep -rn "rateLimit: { max" api/src/routes/
grep -nE "app\.(get|post|put|patch|delete)\('" api/src/routes/*.ts

# runtime, fără sesiune
curl -s -o /dev/null -w "%{http_code}\n" http://10.77.0.13:3000/healthz
curl -s -w "\nHTTP %{http_code}\n" http://10.77.0.13:3000/api/admin/overview
curl -s -w "\nHTTP %{http_code}\n" http://10.77.0.13:3000/api/internal/whoami
curl -s -D - -o /dev/null http://10.77.0.13:3000/api/auth/session | grep -i set-cookie
curl -s -D - -o /dev/null -H "X-Forwarded-Proto: https" http://10.77.0.13:3000/api/auth/session | grep -i set-cookie
curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://evil.example" http://10.77.0.13:3000/api/auth/login
curl -s --path-as-is -o /dev/null -w "%{http_code}\n" "http://10.77.0.13:3000/%2e%2e%2f%2e%2e%2fetc/passwd"

# webhook-uri
curl -s -w "\nHTTP %{http_code}\n" -X POST -d '{}' http://10.77.0.13:3000/api/webhooks/stripe/replay
curl -s -w "\nHTTP %{http_code}\n" -X POST -d '{"orderId":"x"}' http://10.77.0.13:3000/api/webhooks/stripe/test
curl -s -w "\nHTTP %{http_code}\n" -X POST -d '{"id":"evt_probe_1","type":"checkout.session.completed","data":{"object":{}}}' http://10.77.0.13:3000/api/webhooks/stripe

# bridge (o cerere, cu semnătură falsă, respingere așteptată)
curl -s -w "\nHTTP %{http_code}\n" -k --resolve panel.blipmade.com:443:10.77.0.10 -X POST \
  -H "Content-Type: application/json" \
  -d '{"external_id":"blipmade_acc_probe","timestamp":"1700000000","nonce":"ZZZZZZZZZZZZZZZZZZ","signature":"0000000000000000000000000000000000000000000000000000000000000000"}' \
  https://panel.blipmade.com/api/blipmade/keymint

# gazde
iptables -S ; iptables -t nat -S PREROUTING ; ip6tables -S
ss -lntp ; ss -lntp6
sshd -T | grep -iE '^(passwordauthentication|permitrootlogin|pubkeyauthentication)'
pve-firewall status
journalctl -u ssh --since "-24h" --no-pager | grep -c "Failed password"
journalctl -u ssh --since "-24h" --no-pager | grep -cE "Failed password|Invalid user|Failed publickey|authentication failure"
journalctl -u ssh --since "-24h" --no-pager | grep -oE "Accepted [a-z]+ for [a-zA-Z0-9_-]+ from [0-9.]+" | sort | uniq -c

# rpcbind (SEC-28) si persistenta
ss -lntup | grep ":111"
ss -ntp | grep ":111 "
awk -F: '$3>0 && $3<1000 {print $1" uid="$3}' /etc/passwd
ls -l /root/.ssh/authorized_keys ; ssh-keygen -lf /etc/pve/priv/authorized_keys

# cheia din argumentele procesului (SEC-29) - valoarea NU se afiseaza
ps -eo pid,args | grep cursor-agent | grep -v grep | sed -E 's/(--api-key )[A-Za-z0-9._-]+/\1<redacted>/'
ls -l /proc/$(pgrep -f cursor-agent | head -1)/cmdline

# containere și secrete (fără a tipări valori)
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker inspect blipmade-api-1 --format "User={{.Config.User}} Readonly={{.HostConfig.ReadonlyRootfs}} ..."'
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker exec blipmade-api-1 ls -la /var/backups/blipmade/mail'
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && git log --all --pretty=format: --name-only | grep -iE "\.env|\.pem|id_rsa"'
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'python3 -c "<numără aparițiile fiecărei valori din .env în git log --all -p>"'
```

---

*Raport redactat de subagentul `worker` pentru sesiunea de audit a platformei Blipmade. Nicio valoare de secret nu apare în acest document; pentru secrete s-au raportat doar numele variabilei, tipul și lungimea.*
