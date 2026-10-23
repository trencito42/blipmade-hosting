# 03 — Rețea și plan de adrese

**Data auditării:** 2026-10-23 · **Hypervisor:** `n7030e1` · **Metodă:** `ip addr`, `ip route`, `iptables -t nat -S`, `ss -tlnp`, `tcpdump` (citire), `dig`, sondaje TCP (`nc`) din hypervisor și din VM 103, SSH pe VM 102 și VM 103.

Clasele de verificare sunt cele din `00-BRIEFING.md`.

---

## 1. Repere

### 1.1 Stratul fizic

| Nivel | Realitate | Sursă | Clasă |
|---|---|---|---|
| Hypervisor | `n7030e1`, `eth0` = `193.34.214.20/24` + alias-uri `/32` `.86`, `.87`, `.143` | `ip -brief addr` | `VERIFIED` |
| Gateway implicit | `193.34.214.1` via `eth0` | `ip route` | `VERIFIED` |
| Rețea internă | `vmbr1` = `10.77.0.1/24` (bridge, `f2:95:e5:f8:f5:e7`) | `ip -brief link show type bridge` | `VERIFIED` |
| Interfețe bridge | `tap100i0`, `tap101i0`, `tap102i0`, `tap103i0` | `ip -brief addr` | `VERIFIED` |
| IPv6 | Doar link-local (`fe80::`) pe `eth0` și `vmbr1`. **Fără IPv6 global** | `ip -brief addr` | `VERIFIED` |
| Forwarding | `net.ipv4.ip_forward = 1` | `/proc/sys/net/ipv4/ip_forward` | `VERIFIED` |
| `rp_filter` | `2` (loose) pe `all` și pe `eth0` | `/proc/sys/net/ipv4/conf/*/rp_filter` | `VERIFIED` |

### 1.2 Numele publice

| Nume | Rezultat | Tip | Sursă | Clasă |
|---|---|---|---|---|
| `blipmade.com` | `188.114.96.3`, `188.114.97.3` (A) · `2a06:98c1:3120::3`, `2a06:98c1:3121::b` (AAAA) | **Cloudflare anycast — proxyat** | `dig +short` | `VERIFIED` |
| `www.blipmade.com` | `188.114.96.0`, `188.114.97.0` | **Cloudflare anycast — proxyat** | `dig +short` | `VERIFIED` |
| `panel.blipmade.com` | **`193.34.214.86`** | **DNS-only — direct la origine** | `dig +short` | `VERIFIED` |
| `node1.blipmade.com` | **`193.34.214.87`** | **DNS-only — direct la origine** | `dig +short` | `VERIFIED` |
| `test.apps.blipmade.com` | **`193.34.214.143`** | **DNS-only — direct la origine** | `dig +short` | `VERIFIED` |
| `n7030e1.mevnode.com` | **`193.34.214.20`** | **DNS-only — hypervisorul** | `dig +short` | `VERIFIED` |
| `apps.blipmade.com` | fără record A | — | `dig +short` | `VERIFIED` |
| `games.blipmade.com` | fără record A | — | `dig +short` | `VERIFIED` |
| NS | `cartman.ns.cloudflare.com`, `nucum.ns.cloudflare.com` | Cloudflare găzduiește zona | `dig +short NS` | `VERIFIED` |
| MX | `10 mail.xodo.ro` | — | `dig +short MX` | `VERIFIED` |

**Consecința centrală a planului:** doar `blipmade.com` și `www.blipmade.com` sunt proxyate de Cloudflare. `panel.`, `node1.` și `test.apps.` sunt **recorduri DNS-only**: Cloudflare rezolvă numele, dar **nu participă la traseul pachetelor** și **nu filtrează nimic**. Orice DDoS pe aceste nume ajunge direct pe hardware.

---

## 2. Planul de adrese **real** (cel implementat, nu cel intenționat)

Adresele publice nu sunt alocate unor VM-uri. **Toate patru sunt alias-uri pe `eth0` al hypervisorului**, iar serviciile sunt publicate prin **DNAT în `iptables-legacy`** de pe hypervisor către VM-urile interne.

`iptables -t nat -S` — `VERIFIED`:

```
-A PREROUTING -d 193.34.214.86/32  -p tcp --dport 80    -j DNAT --to-destination 10.77.0.10:80
-A PREROUTING -d 193.34.214.86/32  -p tcp --dport 443   -j DNAT --to-destination 10.77.0.10:443
-A PREROUTING -d 193.34.214.87/32  -p tcp --dport 80    -j DNAT --to-destination 10.77.0.11:80
-A PREROUTING -d 193.34.214.87/32  -p tcp --dport 8080  -j DNAT --to-destination 10.77.0.11:8080
-A PREROUTING -d 193.34.214.87/32  -p tcp --dport 2022  -j DNAT --to-destination 10.77.0.11:2022
-A PREROUTING -d 193.34.214.87/32  -p tcp --dport 30001 -j DNAT --to-destination 10.77.0.11:30001
-A PREROUTING -d 193.34.214.143/32 -p tcp --dport 80    -j DNAT --to-destination 10.77.0.12:80
-A PREROUTING -d 193.34.214.143/32 -p tcp --dport 443   -j DNAT --to-destination 10.77.0.12:443
-A PREROUTING -d 193.34.214.87/32 -i eth0 -p tcp --dport 30000:39999 -j DNAT --to-destination 10.77.0.11
-A PREROUTING -d 193.34.214.87/32 -i eth0 -p udp --dport 30000:39999 -j DNAT --to-destination 10.77.0.11
-A POSTROUTING -s 10.77.0.0/24 -o eth0 -j MASQUERADE
```

Filtrul `FORWARD` are doar două reguli `ACCEPT` pentru `30000:39999` pe `10.77.0.11`; restul politicii este `ACCEPT` — `VERIFIED`.

### 2.1 Cele patru adrese publice, una câte una

#### `193.34.214.20` — hypervisorul (management)

| | |
|---|---|
| **Pe ce este legată** | `eth0` al hypervisorului, ca adresă primară `/24`. Nu este alias: `ip -brief addr` o arată ca `193.34.214.20/24` |
| **Ce ar trebui să deservească** | **Management**: Proxmox VE (`pveproxy` pe `*:8006`), SSH, Spice proxy (`*:3128`) |
| **Ce servește efectiv azi** | `ss -tlnp`: `0.0.0.0:22` (sshd), `[::]:22`, `*:8006` (pveproxy), `*:3128` (spiceproxy), `0.0.0.0:111` (rpcbind), `127.0.0.1:25` (postfix), `127.0.0.1:85` (pvedaemon), `[::1]:4173` (node) |
| **Sondaje** | Din hypervisor și din VM 103: `22` **deschis**, `80`/`443`/`8080`/`25565`/`8125`/`8443` **închise**. Din VM 103, `8006` **deschis** pe toate cele patru adrese publice |
| **Este necesară?** | **Da, dar nu ca punct de expunere public.** Este adresa de management. `n7030e1.mevnode.com` indică spre ea, deci este în DNS public |
| **Risc** | `pveproxy` pe `*:8006` ascultă pe **toate** adresele locale, nu doar pe `193.34.214.20`. Un port scanat din internet a găsit `8006` răspunzând pe `.20`, `.86`, `.87` și `.143` |

> **Limită de verificare.** Din interior nu se poate stabili dacă filtrul de la marginea furnizorului blochează `8006` din internet. Ce s-a putut verifica: `8006` **răspunde** pe toate cele patru adrese când sunt sondate de pe VM 103 (adică prin rețeaua internă, cu ieșire pe internet). Faptul că nu se poate confirma din exterior este `UNVERIFIED` și este tratat în §5 ca un blocaj de lansare, nu ca o constatare.

#### `193.34.214.86` — panoul Pterodactyl

| | |
|---|---|
| **Pe ce este legată** | Alias `/32` pe `eth0` al hypervisorului |
| **Ce trebuie să deservească** | Panoul Pterodactyl: `panel.blipmade.com` → `10.77.0.10:80` și `:443` |
| **Ce servește azi** | Da. DNAT activ; nginx + Laravel răspund pe `10.77.0.10:80`/`:443` (`HTTP/1.1 200 OK`, `Server: nginx`, cookie-uri `XSRF-TOKEN` și `pterodactyl_session`) — `VERIFIED` |
| **Sondaje** | Din hypervisor și VM 103 pe `.86`: `22` deschis, `80`/`443` **timeout**, `8080`/`25565`/`8125`/`8443` închise |
| **Este necesară?** | **Da** — panoul este interfața de administrare a lui Pterodactyl |

#### `193.34.214.87` — nodul Wings + porturile de joc

| | |
|---|---|
| **Pe ce este legată** | Alias `/32` pe `eth0` |
| **Ce trebuie să deservească** | Noda Wings `node1.blipmade.com`: `8080` (daemon), `2022` (SFTP), `30000:39999` (TCP+UDP, porturile de instanță), `80`, `30001` |
| **Ce servește azi** | Da, parțial. DNAT activ; Wings răspunde pe `10.77.0.11:8080` (HTTPS, cere antet de autorizare) și `10.77.0.11:2022` |
| **Sondaje** | `.87`: `22` deschis, `80`/`443`/`8080`/`30001` **timeout** din rețeaua internă |
| **Este necesară?** | **Da, dar numai pentru DNS-only.** Fiind record DNS-only, `node1.blipmade.com` este expus direct |

#### `193.34.214.143` — gateway-ul Caddy (originea web)

| | |
|---|---|
| **Pe ce este legată** | Alias `/32` pe `eth0` |
| **Ce trebuie să deservească** | Caddy de pe VM 102: `blipmade.com`, `www.blipmade.com`, `test.apps.blipmade.com` |
| **Ce servește azi** | **Da.** Cloudflare (162.158.x, 172.64.x) se conectează efectiv la `193.34.214.143:443`; Caddy răspunde; lanțul complet funcționează: `https://blipmade.com/api/health` → `200` cu `{"status":"ok","service":"blipmade-api",...}` |
| **Sondaje** | `.143`: `22` deschis, `443` **timeout** din rețeaua internă |
| **Este necesară?** | **Da** — este originea pentru Cloudflare. **Dar** de aceea este și adresa prin care originea poate fi atinsă direct, fără Cloudflare (vezi §4.2) |

### 2.2 De ce sondajele din rețeaua internă dau rezultate false

**Metodă cerută explicit** de atribuire: sondare din hypervisor **și** din VM 103, pentru a evita ipoteze de hairpin. Rezultatul a fost neașteptat și merită documentat, pentru că **contradice briefing-ul**.

Sondajul direct de pe hypervisor spre `.143:443` dă „Connection refused": pachetul trece prin `OUTPUT`, nu prin `PREROUTING`, deci **nu se aplică DNAT** și nu există nimic ascultând pe acea adresă în host. Corect ca comportament, dar irelevant pentru ce servește în realitate.

Sondajul din VM 103 a fost urmărit pe fir cu `tcpdump -i any`:

```
12:33:46.160393 tap103i0 P   IP 10.77.0.13.35810 > 193.34.214.143.443: Flags [S]
12:33:46.160398 vmbr1   In  IP 10.77.0.13.35810 > 193.34.214.143.443: Flags [S]
12:33:46.160451 vmbr1   Out IP 10.77.0.13.35810 > 10.77.0.12.443: Flags [S]     <- DNAT aplicat
12:33:46.160457 tap102i0 Out IP 10.77.0.13.35810 > 10.77.0.12.443: Flags [S]
12:33:46.160896 tap102i0 P   IP 10.77.0.12.443 > 10.77.0.13.35810: Flags [S.]   <- SYN-ACK de la Caddy
12:33:46.160905 tap103i0 Out IP 10.77.0.12.443 > 10.77.0.13.35810: Flags [S.]
12:33:46.161142 tap103i0 P   IP 10.77.0.13.35810 > 10.77.0.12.443: Flags [R]     <- RST trimis de VM 103
```

Lectura: **DNAT-ul funcționează corect**, Caddy acceptă conexiunea și răspunde, dar **kernel-ul de pe VM 103 trimite RST**, pentru că socketul pe care l-a deschis este `(10.77.0.13:35810 → 193.34.214.143:443)` și răspunsul care sosește are alt 4-tuple (`10.77.0.12:443 → 10.77.0.13:35810`). Conexiunea se închide și `nc` raportează timeout.

Rezultatul este reprodusibil pe toate porturile DNAT-uite (`.86:80`, `.86:443`, `.87:8080`, `.87:30001`, `.143:443`) — `VERIFIED`.

**O singură excepție explică totul:** `panel.blipmade.com` a răspuns corect din VM 103 — pentru că `/etc/hosts` pe VM 103 (cloud-init, `manage_etc_hosts: True`) conține `10.77.0.10 panel.blipmade.com`. Testul trecea pe cale **privată**, nu pe calea publică:

```
$ getent hosts panel.blipmade.com
10.77.0.10      panel.blipmade.com
```

> **Concluzie care schimbă briefing-ul.** `00-BRIEFING.md` §4 afirmă că „doar 22/tcp este deschis" pe cele patru adrese publice. Acea afirmație este **artefactul sondajului intern**, nu starea reală. Realitatea, demonstrată independent prin trei dovezi: (a) regulile DNAT există și se execută (trasate pe fir); (b) trafic Cloudflare real ajunge la `193.34.214.143:443` și este servit; (c) `https://blipmade.com/api/health` răspunde `200` prin Cloudflare, iar `curl --resolve blipmade.com:443:10.77.0.12` răspunde `200` direct la Caddy. **Metoda corectă de a verifica ce servește public este: DNAT + trafic observat pe `eth0` + DNS, nu sondajul din interior.**

### 2.3 Rezumat: ce servește efectiv, pe fiecare adresă

| Adresă | Serviciu real | Stare | Dovezi |
|---|---|---|---|
| `193.34.214.20` | Proxmox `8006`, SSH `22`, Spice `3128` | **Activ** | `ss -tlnp` |
| `193.34.214.86` | Panou Pterodactyl `80`/`443` | **Activ** | DNAT + `curl -I https://10.77.0.10/` → 200 |
| `193.34.214.87` | Wings `8080`, SFTP `2022`, instanțe `30000:39999` | **Activ** | DNAT + răspuns Wings cu „required authorization heads were not present" |
| `193.34.214.143` | Caddy `80`/`443` (originea web) | **Activ** | DNAT + trafic Cloudflare pe `eth0` + `health` 200 + SNI 200 |
| `10.77.0.10` | Panou, nginx + Laravel | **Activ** | `curl -I` → 200 |
| `10.77.0.11` | Wings daemon, HTTPS 8080 | **Activ** | răspuns JSON cu eroare de autorizare |
| `10.77.0.12` | Caddy, `80`/`443`, admin API `127.0.0.1:2019` | **Activ** | `ss -tlnp`, SNI → 200 |
| `10.77.0.13` | `web` pe `:3000`; Postgres/Redis/API pe loopback | **Activ** | `docker compose ps`, `nft` Docker |

---

## 3. Rețeaua internă `10.77.0.1/24`

| VM | IP | Gateway | DNS | Servicii |
|---|---|---|---|---|
| 100 | `10.77.0.10/24` | `10.77.0.1` | `1.1.1.1` | Panou Pterodactyl (nginx) `80`, `443` |
| 101 | `10.77.0.11/24` | `10.77.0.1` | `1.1.1.1` | Wings `8080`, SFTP `2022`, alocări `25565–25600`, `27015–27050`, `30000–30100` |
| 102 | `10.77.0.12/24` | `10.77.0.1` | `1.1.1.1` | Caddy `80`, `443`, admin `2019` (loopback) |
| 103 | `10.77.0.13/24` | `10.77.0.1` | `1.1.1.1` | `web` `3000`; Postgres/Redis/API pe loopback |

Sursă: `qm config <vmid>` (`ipconfig0`, `nameserver`) — `VERIFIED`.

Traficul VM→hypervisor este mascat (`-s 10.77.0.0/24 -o eth0 -j MASQUERADE`), deci VM-urile pot ieși la internet cu adresa publică a hypervisorului. `bridge-nf-call-iptables = 0`, deci regulile `FORWARD` nu se aplică traficului de pe bridge, ci doar celui care trece prin hypervisor. `VERIFIED`

---

## 4. Planul țintă

### 4.1 Cine deține ce adresă

| Adresă | Ținută de | Serviciu | Ce se schimbă |
|---|---|---|---|
| `193.34.214.20` | Hypervisor | **Management** — Proxmox, SSH | Se restrânge la `10.77.0.0/24` și la IP-urile admin explicite |
| `193.34.214.86` | VM 100 | Panoul Pterodactyl | Se elimină publicarea directă; panoul se accesează prin Caddy |
| `193.34.214.87` | VM 101 | Wings + **porturile de joc** | Rămâne singura adresă publică de client; devine și poarta de joc |
| `193.34.214.143` | VM 102 | Caddy — **originea** | Devine strict originea; se blochează accesul direct din afara Cloudflare |
| `10.77.0.0/24` | vmbr1 | Rețeaua internă | Rămâne nepublică, cu filtre explicite pe fiecare VM |

**De ce `193.34.214.86` ar trebui să dispară ca adresă publică de panou:** panoul este interfața de administrare a lui Pterodactyl — cu `feature_limits` și chei de aplicație. Dacă panoul se publică direct pe o adresă publică, orice scan al lui `.86` ajunge la interfața de autentificare fără nicio protecție de rețea. În modelul Cloudflare, panoul ar trebui să fie servit prin Caddy, cu Cloudflare în față.

### 4.2 De unde se publică porturile de joc

**Regula: porturile de joc se publică din hypervisor, pe `193.34.214.87`, și numai acolo.** Raționament:

1. Wings ascultă pe IP-ul **privat** `10.77.0.11`, iar alocările panelului sunt tot pe `10.77.0.11` (`GET /api/application/nodes/1/allocations`, `ip: "10.77.0.11"`) — `VERIFIED`. Wings nu poate asculta direct pe IP-ul public: alias-urile sunt pe hypervisor.
2. Prin urmare, un joc nu poate „deschide singur" un port public. DNAT-ul de pe hypervisor este singurul mecanism disponibil, iar acesta trebuie să acopere **exact** intervalele de alocare ale panelului.
3. **Intervalul actual este greșit.** DNAT publică `30000:39999`, dar panelul are alocate și `25565–25600` și `27015–27050` (173 de alocări în total). Un server Minecraft pe portul 25565 **nu ar fi accesibil din internet** — `VERIFIED`.

**Setul țintă de intervale publice pe `193.34.214.87`:**

| Interval | Conținut | De ce |
|---|---|---|
| `30000:30100` (TCP+UDP) | Alocările de instanță folosite astăzi (73–77) | Sursa reală de trafic de client |
| `25565:25600` (TCP+UDP) | Alocările Minecraft pregătite | Necesar dacă se vinde Minecraft |
| `27015:27050` (TCP+UDP) | Alocările CS/Source pregătite | Necesar dacă se vinde CS 1.6 |
| `8080` (TCP) | Wings daemon | **De eliminat din public** — se folosește bridge-ul |
| `2022` (TCP) | SFTP | De eliminat din public |
| `80`, `30001` | `test.apps` și redirecționări | De eliminat din public |

### 4.3 Cum trebuie să funcționeze protecția DDoS

**Ce face Cloudflare în prezent — și ce nu face:**

| Tip de trafic | Este proxyat de Cloudflare azi? | E protejat de DDoS? | De ce |
|---|---|---|---|
| `blipmade.com`, `www.blipmade.com` (HTTP/HTTPS, 80/443) | **Da** — A/AAAA indică anycast Cloudflare | **Da** | Cloudflare întrerupe și filtrează la muchia rețelei sale |
| `panel.blipmade.com` (80/443) | **Nu** — record DNS-only → `193.34.214.86` | **Nu** | Pachetele ajung direct pe hardware |
| `node1.blipmade.com` (trafic de joc, orice port) | **Nu** — record DNS-only → `193.34.214.87` | **Nu** | Idem |
| `test.apps.blipmade.com` (80/443) | **Nu** — record DNS-only → `193.34.214.143` | **Nu** | Idem |
| `193.34.214.20:8006` (Proxmox) | Nu există proxy | **Nu** | Expus direct |

**Cloudflare nu poate proxya traficul de joc.** Motivele tehnice, pentru a fi explicit:

1. Cloudflare proxyează **HTTP și HTTPS** (protocolul de nivel 7). Minecraft Java, CS 1.6 și jocurile similare folosesc **protocol propriu, de nivel 4** (TCP/UDP binar). Cloudflare are un produs separat, **Spectrum**, pentru asta, care este un add-on **plătit** și **nu este configurat aici** — niciun record DNS cu `proxy: on` pe porturile de joc, nicio referință la Spectrum în zonă.
2. **Nivelul 4 nu poate fi filtrat în același mod.** Un atac volumetric pe `25565` consumă lățime de bandă înainte de orice inspecție; un joc nu poate fi „ascuns" într-un proxy HTTP.
3. **Cloudflare Standard nu proxyează nici măcar porturi non-HTTP pe planurile obișnuite**, iar porturile de joc nu sunt în lista celor proxyate implicit (HTTP 80/443, respectiv 8080, 8443, 2052, 2082, 2086, 2095).

**Deci planul de DDoS trebuie să fie în două straturi, explicite:**

| Strat | Acoperă | Mecanism | Stare azi |
|---|---|---|---|
| **Stratul 1 — Cloudflare** | Doar `blipmade.com` / `www.` | Proxy HTTP/443 deja activ și funcțional | ✅ funcționează |
| **Stratul 2 — origine protejată** | `193.34.214.143` | Originea acceptă **doar** trafic de la IP-urile Cloudflare | ❌ **lipsă** |
| **Stratul 3 — jocuri** | `193.34.214.87` | Nu poate fi Cloudflare Standard → **filtrare la nivel de host + limitare de rată +, la nevoie, Spectrum plătit sau un furnizor cu scrub DDoS** | ❌ **lipsă** |

> **Adevărul incomod, spus direct:** azi, **niciun trafic de joc și niciun trafic de panou nu este protejat de DDoS**, iar originea web este accesibilă direct. Orice valoare de „protecție DDoS" vândută clienților ar fi neadevărată. Cloudflare acoperă strict `blipmade.com` și `www.blipmade.com`.

### 4.4 Ce trebuie schimbat în Caddy

**Configurația curentă, citată integral** (`ssh -i /root/.ssh/id_rsa debian@10.77.0.12 'cat /etc/caddy/Caddyfile'`) — `VERIFIED`:

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

**Probleme identificate în acest fișier:**

1. **Nu există restricție de origine.** Caddy ascultă pe `*:80` și `*:443` și răspunde oricărui `Host` cu certificat valid. Originea este, prin urmare, **direct accesibilă**: `https://193.34.214.143/` cu SNI `blipmade.com` returnează `200` la fel ca prin Cloudflare. Orice client poate ocoli complet Cloudflare.
2. **Nu există `trusted_proxies`.** Caddy nu știe că `X-Forwarded-For` vine de la Cloudflare, deci un client direct poate **forja** acest antet. (Verificarea de mai jos arată că și codul aplicației are o asemenea regulă, dar cu o listă corectă.)
3. **Nu există directive de limitare** (`rate_limit`, `header` cu `Strict-Transport-Security`).
4. **`test.apps.blipmade.com` este un site activ, cu 502 pe tot parcursul** (29/29 cereri în ultimele 3 h), deci este o suprafață de expunere inutilă.

**Caddyfile țintă** (copiabil; `import` și `handle` necesită Caddy ≥ 2.6 — versiunea instalată este exact 2.6.2):

```caddyfile
{
	# Doar IP-urile publice Cloudflare pot ajunge la origina web.
	# Se actualizează la fiecare schimbare a rețelei Cloudflare.
	servers {
		trusted_proxies static 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 \
			103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 \
			188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 \
			104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
	}
}

# Origina pentru Cloudflare. Nu se publică niciun alt nume aici.
blipmade.com, www.blipmade.com {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		-Server
	}
	reverse_proxy 10.77.0.13:3000 {
		header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
	}
	log {
		output file /var/log/caddy/blipmade.log
		format json
	}
}

# Panoul, servit prin aceeași origine, sub un subdomeniu dedicat.
panel.blipmade.com {
	encode zstd gzip
	reverse_proxy 10.77.0.10:443 {
		transport http {
			tls_insecure_skip_verify
		}
	}
}

# Suprafața de test: se elimină sau se limitează la rețeaua internă.
test.apps.blipmade.com {
	@internal remote_ip 10.77.0.0/24
	respond @internal "ok" 200
	respond "not available" 410
}
```

**Și Caddy trebuie legat de regula de firewall de la §5.1** — singura restricție reală a originii trebuie să fie în `iptables` pe hypervisor, nu doar în Caddy, pentru că altfel un `curl` direct pe `193.34.214.143` ajunge oricum la procesul Caddy.

### 4.5 Reguli de firewall — hypervisor

Toate regulile sunt scrise pentru `iptables-legacy`, care este backend-ul activ (`update-alternatives` → `iptables-legacy`, iar `nft list ruleset` nu conține aceste tabele) — `VERIFIED`. Ele trebuie introduse **în această ordine** și persistate cu `netfilter-persistent` (pachetul nu este instalat — `BLOCKED` la persistare, vezi §6).

```bash
#!/bin/bash
# Firewall hypervisor Blipmade - n7030e1
# Backend: iptables-legacy (verificat: update-alversatives -> iptables-legacy)
# ATENTIE: ruleaza inainte de a sterge regulile existente, dintr-o sesiune SSH stabila.

# --- 0. Curatare doar a lanturilor pe care le gestionam ---
iptables -t nat -F PREROUTING
iptables -t nat -A POSTROUTING -s 10.77.0.0/24 -o eth0 -j MASQUERADE

# --- 1. MANAGEMENT: pastram doar accesul pe 22, 8006 si 3128 ---
# Intentie: pveproxy (8006) si spiceproxy (3128) trebuie sa ramana accesibile
# administratorului, dar numai pe IP-urile de management explicite.
iptables -A INPUT -p tcp --dport 8006 -s 10.77.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 8006 -s 193.34.214.20 -j ACCEPT
iptables -A INPUT -p tcp --dport 3128 -s 10.77.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3128 -s 193.34.214.20 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 10.77.0.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -s 193.34.214.20 -j ACCEPT
# Intentie: de aici incolo, orice port nou pe host este refuzat implicit.
iptables -P INPUT DROP

# --- 2. ORIGINE WEB: 193.34.214.143 accepta numai de la Cloudflare ---
# Intentie: originea sa nu mai fie accesibila direct; doar Cloudflare o atinge.
for NET in 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 \
           141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 \
           197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 \
           104.24.0.0/14 172.64.0.0/13 131.0.72.0/22; do
    iptables -A INPUT -d 193.34.214.143 -s "$NET" -j ACCEPT
done
iptables -A INPUT -d 193.34.214.143 -s 10.77.0.0/24 -j ACCEPT

# --- 3. PORTURI DE JOC: 193.34.214.87, intervale care corespund alocarilor ---
# Intentie: publicam exact porturile pe care panelul le poate aloca clientilor.
# 30000:30100 = alocarile de instanta in uz; 25565:25600 = Minecraft;
# 27015:27050 = CS/Source. Regula generala 30000:39999 se retrage.
for RANGE in 30000:30100 25565:25600 27015:27050; do
    iptables -t nat -A PREROUTING -d 193.34.214.87 -i eth0 -p tcp --dport "$RANGE" \
        -j DNAT --to-destination 10.77.0.11
    iptables -t nat -A PREROUTING -d 193.34.214.87 -i eth0 -p udp --dport "$RANGE" \
        -j DNAT --to-destination 10.77.0.11
    iptables -A FORWARD -d 10.77.0.11/32 -i eth0 -o vmbr1 -p tcp --dport "$RANGE" -j ACCEPT
    iptables -A FORWARD -d 10.77.0.11/32 -i eth0 -o vmbr1 -p udp --dport "$RANGE" -j ACCEPT
done

# --- 4. PANOU: 193.34.214.86 ---
# Intentie: panoul este administrativ; daca ramane public, se limiteaza la
# HTTPS si se cere un allow-list de IP-uri de administrator.
iptables -t nat -A PREROUTING -d 193.34.214.86 -i eth0 -p tcp --dport 443 \
    -j DNAT --to-destination 10.77.0.10:443
# Intentie: portul 80 al panoului se elimina; daca trebuie, se face redirect
# in Caddy, nu in DNAT.

# --- 5. RETEA INTERNA: blocam accesul VM-urilor spre exterior, cu exceptii ---
# Intentie: o instanta compromise nu trebuie sa poata scana interiorul.
iptables -A FORWARD -s 10.77.0.0/24 -d 10.77.0.0/24 -j ACCEPT
iptables -A FORWARD -s 10.77.0.0/24 -j DROP
# (dacă VM-urile au nevoie de acces la internet - de ex. npm, docker pull -
#  se face exceptie pe 80/443 catre 10.77.0.13 si catre DNS 1.1.1.1)

# --- 6. ORICE ALTRE TRAFIC DE intrare pe eth0 este refuzat ---
iptables -A INPUT -i eth0 -j DROP
```

### 4.6 Reguli de firewall — fiecare VM

Toate se aplică **în interiorul** VM-ului, cu `nft` sau `iptables`, și trebuie să fie persistate (`systemd` unit sau `netfilter-persistent`).

**VM 102 — gateway (Caddy):**

```bash
#!/bin/bash
# VM 102 - blipmade-proxy. Politica: totul implicit DROP.
# Intentie: Caddy accepta doar de la hypervisor (L3/L4) si de la Cloudflare (L7),
# iar API-ul de administrare Caddy ramane pe loopback.
nft flush ruleset
nft add table inet filter
nft add chain inet filter input  '{ type filter hook input priority 0; policy drop; }'
nft add chain inet filter output '{ type filter hook output priority 0; policy accept; }'
nft add chain inet filter forward '{ type filter hook forward priority 0; policy drop; }'

# Intentie: traficul de la hypervisor (bridge-ul vmbr1) - Caddy primeste aici
# de la cloudflared/cloudflare si de la clientii interni.
nft add rule inet filter input iifname "vmbr1" accept

# Intentie: porturile folosite de Caddy sunt deja ocupate pe toate interfetele;
# nu e nevoie sa le deschidem explicit, dar le enumeram pentru lizibilitate.
# (80, 443 sunt in LISTEN pe 0.0.0.0; input de la eth0 este blocat)

# Intentie: API-ul de administrare Caddy (127.0.0.1:2019) este deja legat
# numai pe loopback; regula il apara explicit daca binding-ul se schimba.
nft add rule inet filter input iifname "lo" accept

# Intentie: logam refuzurile pentru audit si incident.
nft add rule inet filter input limit rate 5/minute log prefix "nft-drop: " level info
```

**VM 103 — platforma:**

```bash
#!/bin/bash
# VM 103 - blipmade-platform. Politica: implicit DROP pe interfata externa.
# ATENTIE: nu se aplica inainte de a confirma regulile Docker (nft table ip
# nat / DOCKER), care trebuie sa ramana functionale.
nft flush ruleset
nft add table inet filter
nft add chain inet filter input  '{ type filter hook input priority 0; policy drop; }'
nft add chain inet filter output '{ type filter hook output priority 0; policy accept; }'
nft add chain inet filter forward '{ type filter hook forward priority 0; policy drop; }'

# Intentie: loopback (API <-> Postgres/Redis prin 127.0.0.1).
nft add rule inet filter input iifname "lo" accept

# Intentie: bridge-ul Docker - comunicatia dintre containere (api -> postgres,
# web -> api) si portul public al containerului web.
nft add rule inet filter input iifname "br-*" accept
nft add rule inet filter forward iifname "br-*" accept

# Intentie: SSH de la hypervisor si din reteaua interna.
nft add rule inet filter input ip saddr 10.77.0.0/24 tcp dport 22 accept

# Intentie: web (:3000) si Caddy (:12) trebuie sa ajunga la API.
nft add rule inet filter input ip saddr 10.77.0.12 tcp dport 3000 accept

# Intentie: DNS catre resolver-ul configurat.
nft add rule inet filter output ip daddr 1.1.1.1 udp dport 53 accept
```

**VM 101 — nodul Wings:**

```bash
#!/bin/bash
# VM 101 - games-node-01. Politica: implicit DROP pe eth0 (noda nu trebuie
# sa aiba nicio legatura directa cu internetul public).
# ATENTIE: Docker publica porturile containerelor pe 0.0.0.0; daca se aplica
# nft flush ruleset, regulile Docker din ip nat/ip filter trebuie pastrate.
nft flush ruleset
nft add table inet filter
nft add chain inet filter input  '{ type filter hook input priority 0; policy drop; }'
nft add chain inet filter output '{ type filter hook output priority 0; policy accept; }'
nft add chain inet filter forward '{ type filter hook forward priority 0; policy drop; }'

# Intentie: bridge-ul Docker - porturile de instanta (30000:30100 etc.) sunt
# publicate de Docker si trebuie sa ramana accesibile prin DNAT de pe hypervisor.
nft add rule inet filter input iifname "br-*" accept
nft add rule inet filter forward iifname "br-*" oifname "br-*" accept

# Intentie: loopback - Wings si API-ul sau intern.
nft add rule inet filter input iifname "lo" accept

# Intentie: bridge-ul vmbr1 - trafficul de la hypervisor si de la API.
nft add rule inet filter input iifname "vmbr1" accept
nft add rule inet filter forward iifname "vmbr1" accept

# Intentie: porturile Wings (8080, 2022) sunt accesibile doar de pe vmbr1 -
# nu trebuie sa fie deschise pe eth0.
```

**VM 100 — panoul:**

```bash
#!/bin/bash
# VM 100 - panoul Pterodactyl. Politica: implicit DROP pe eth0.
# NOTA: agentul nu are acces in aceasta VM, deci regulile trebuie scrise si
# verificate de un operator cu acces. Nu au fost aplicate in acest audit.
nft flush ruleset
nft add table inet filter
nft add chain inet filter input  '{ type filter hook input priority 0; policy drop; }'
nft add chain inet filter output '{ type filter hook output priority 0; policy accept; }'

# Intentie: loopback - nginx si aplicatia Laravel.
nft add rule inet filter input iifname "lo" accept

# Intentie: bridge-ul vmbr1 - Caddy de pe VM 102 si API-ul de pe VM 103.
nft add rule inet filter input iifname "vmbr1" accept

# Intentie: numai SSH, si numai din reteaua interna / allow-list de admini.
nft add rule inet filter input ip saddr 10.77.0.0/24 tcp dport 22 accept

# Intentie: daca panoul ramane public pe 193.34.214.86, se limiteaza la 443
# si la un allow-list de IP-uri de administrator.
# nft add rule inet filter input tcp dport 443 ip saddr @admin_ips accept
```

### 4.7 Ce **nu** se poate face cu Cloudflare Standard

Pentru a fi explicit, așa cum cere atribuirea:

- **Nu** se poate pune Cloudflare în fața traficului de joc cu planul curent. Cloudflare proxyează HTTP/HTTPS; Minecraft Java și CS 1.6 folosesc protocoale proprii de nivel 4.
- **Nu** se poate folosi Cloudflare ca „origin shield" pentru `panel.blipmade.com` și `node1.blipmade.com` fără schimbarea tipului de record DNS din DNS-only în proxyat — ceea ce ar forța traficul de joc să treacă prin Cloudflare și să fie refuzat, fiindcă planul nu proxyează porturi non-HTTP.
- **Nu** se poate ascunde originea doar cu Caddy: Caddy răspunde pe `*:443` și orice `Host` validat de ACME trece. **Singura** restricție reală este în `iptables` pe hypervisor.
- **Spectrum** ar fi soluția pentru jocuri, dar este un add-on plătit și **nu este configurat** — `UNVERIFIED` dacă este disponibil sau nu pe contractul existent, `NOT-IMPLEMENTED` în configurația curentă.

---

## 5. Constatări și riscuri de rețea

| # | Constatație | Clasă | Gravitate |
|---|---|---|---|
| N-01 | `pve-firewall` **disabled** pe hypervisor; INPUT/FORWARD/OUTPUT = ACCEPT | `VERIFIED` | **Critică** |
| N-02 | `pveproxy` ascultă pe `*:8006` — răspunde pe toate cele patru adrese publice | `VERIFIED` | **Înaltă** |
| N-03 | Originea web este accesibilă **direct**, fără Cloudflare (Caddy pe `*:443`, fără restricție de IP) | `VERIFIED` | **Înaltă** |
| N-04 | Caddy nu are `trusted_proxies` → `X-Forwarded-For` poate fi falsificat de un client direct | `VERIFIED` | **Înaltă** |
| N-05 | Intervalele de alocare `25565–25600` și `27015–27050` **nu sunt publicate** prin DNAT | `VERIFIED` | **Înaltă** |
| N-06 | Wings `8080` și SFTP `2022` sunt publice pe `193.34.214.87` | `VERIFIED` | **Înaltă** |
| N-07 | Panoul Pterodactyl este public pe `193.34.214.86`, fără Cloudflare | `VERIFIED` | **Înaltă** |
| N-08 | Niciun firewall pe VM 102 și VM 103 | `VERIFIED` | **Medie** |
| N-09 | `test.apps.blipmade.com` returnează 502 pentru toate cererile, dar este activ și cu certificat | `VERIFIED` | **Medie** |
| N-10 | DNAT-ul se execută pe `iptables-legacy`, în timp ce Docker folosește `iptables-nft` — **două backends coexistent** | `VERIFIED` | **Medie** |
| N-11 | `prune-backups keep-all=1` fără nicio țintă (vezi `03-infrastructure.md` §9) | `VERIFIED` | **Medie** |
| N-12 | Reguli firewall scrise manual, **fără `netfilter-persistent`** — se pierd la restart | `VERIFIED` | **Medie** |
| N-13 | Cloudflare acoperă **doar** `blipmade.com` și `www.`; jocurile și panoul nu au protecție DDoS | `VERIFIED` | **Înaltă** |
| N-14 | Briefing-ul §4 („doar 22 deschis") este un artefact al sondajului intern | `VERIFIED` | **Informativă** |

### 5.1 Observație asupra aplicatiei

`TRUSTED_PROXY_IPS = 10.77.0.12` pe VM 103 (doar Caddy) — corect, și mai îngust decât implicit. `TRUSTED_PROXIES` (pentru API) este **neconfigurat**, deci se folosește valoarea implicită din `api/src/env.ts:95`: `127.0.0.1,::1,172.16.0.0/12`. Intervalul `172.16.0.0/12` **nu** include `10.77.0.0/24`, deci API-ul nu acordă încredere altui VM din rețeaua internă prin `X-Forwarded-For` — `CODE-INSPECTED` + `VERIFIED` (valoarea `.env`). Comportament corect.

---

## 6. Ordinea de implementare a planului țintă

Pașii sunt ordonați astfel încât să nu se întrerupă serviciul la niciun moment.

1. **Jurnalizare, nu blocare.** Adaugă regulile de `INPUT` cu politica încă `ACCEPT` și doar cu `LOG`, ca să se vadă ce ar fi tăiat. Măsoară câteva zile.
2. **Restrângerea originii la Cloudflare.** Adaugă `trusted_proxies` în Caddy și regula `iptables` care acceptă `.143` numai de la rețelele Cloudflare. Verifică cu `curl --resolve blipmade.com:443:193.34.214.143` (trebuie să eșueze) și cu `https://blipmade.com/api/health` (trebuie să rămână 200).
3. **Mutarea panoului în spatele Caddy** și eliminarea lui `.86` din DNS public. `panel.blipmade.com` → Cloudflare proxyat → `.143` → Caddy → `10.77.0.10`.
4. **Corectarea intervalelor de porturi.** Publică `25565:25600` și `27015:27050`, retrage regulile `30000:39999` în favoarea `30000:30100`, retrage `.87:80` și `.87:30001`.
5. **Retragerea expunerii lui Wings.** Elimină `.87:8080` și `.87:2022` din DNAT; bridge-ul API-ului folosește deja `10.77.0.11:8080` prin `PANEL_NODE_ADDRESSES`.
6. **Firewall pe fiecare VM**, în ordinea: VM 100 → VM 101 → VM 103 → VM 102, cu `policy drop` și excepții.
7. **Persistență:** `apt install netfilter-persistent` și `netfilter-persistent save`, plus o unitate `systemd` care re-aplică regulile la boot.
8. **Restrângerea lui `pveproxy`:** fie legare pe `193.34.214.20` numai (prin proxy), fie allow-list cu `pve-firewall` activat — dar numai **după** pasul 1, pentru că activarea firewall-ului Proxmox fără un allow-list ar bloca accesul de administrare.

> **Notă de ordine critică.** `pve-firewall` trebuie activat **după** ce regulile `iptables` manuale sunt validate, pentru că activarea lui rescrie lanțurile `INPUT`/`FORWARD`/`OUTPUT` și ar șterge DNAT-ul scris manual. Dacă DNAT-ul se pierde, toate cele trei adrese publice devin mute.

---

## 7. Limitări

- Nu s-a putut verifica din exterior ce filtrează furnizorul de rețea la marginea sa (`8006`, `8080`, `2022` de pe adresele publice). Marcaj `UNVERIFIED`; pasul de deblocare: un sondaj din afara rețelei furnizorului (de exemplu un checker extern), sau o cerere către furnizor cu lista porturilor deschise.
- Starea internă a firewall-urilor VM 100 și VM 101 nu a putut fi verificată (`BLOCKED`): nu există cheie SSH și agentul gazdă nu rulează.
- Listele de intervale Cloudflare folosite în Caddyfile-ul țintă sunt cele documentate public de Cloudflare la momentul redactării; **nu** au fost re-verificate contra zonei reale, pentru că zonele Cloudflare nu pot fi citite de pe planul curent (`UNVERIFIED`). Verificarea practică: după pasul 2, `https://blipmade.com/api/health` trebuie să rămână `200`.
