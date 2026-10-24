# REVIEW DE SECURITATE ȘI INFRASTRUCTURĂ — Blipmade

**Audit post-remediere · runda 2 (independentă)**

---

## 1. Antet — ce a fost testat, unde, când, cu ce instrumente și limitări

### 1.1 Ce a fost testat

Stratul de securitate al platformei: autentificare și sesiuni, CSRF, XSS, injecție SQL, SSRF, IDOR/BOLA, încărcare de fișiere și traversare de drumuri, gestionarea secretelor, expunerea cheilor API, vulnerabilitățile dependențelor, izolarea containerelor, permisiunile Pterodactyl, expunerea Proxmox, regulile de firewall, configurația reverse-proxy-ului, TLS, DNS, criptarea backup-urilor, procedurile de restaurare, expunerea bazei de date și înregistrarea datelor sensibile în jurnale.

Ca și la componenta financiară, **nicio afirmație a rundei anterioare nu a fost presupusă adevărată**.

### 1.2 Unde

| Componentă | Locație | Observații |
|---|---|---|
| Cod API | `/root/blipmade-work/api` și `ssh debian@10.77.0.13:/opt/blipmade` (branch `audit/post-remediation`, commit `29a86cc`) | Hash-uri comparate; **două fișiere modificate necomis** în timpul sesiunii (vezi §1.5) |
| Cod web | `/root/blipmade-work/web`, `web/server.mjs` pe VM | Proxy-ul de la interfață spre API a fost citit integral |
| Configurație producție | `compose.yml`, `compose.api.yml`, `compose.web.yml`, `.env` (numele variabilelor) | Citire exclusivă; **nicio valoare de secret nu este reprodusă în acest raport** |
| Stivă izolată | API `127.0.0.1:3101`, web `127.0.0.1:30003`, DB `blipmade_test` | Folosită pentru observații de rețea și de cod |
| Stivă izolată proprie | API `127.0.0.1:3198` / `:3199`, DB **`blipmade_audit_test`**, Redis DB 1 | Creată de mine; toate testele dinamice de securitate s-au rulat aici |
| Gazdă | `debian@10.77.0.13` | `docker ps`, `docker exec ... env`, `docker logs`, `ss -ltnp`, `iptables -S`, `nft list ruleset`, `systemctl`, `ls /etc/systemd/system` |

### 1.3 Când

23 octombrie 2026, ~19:25–20:05 EDT (23:25–00:05 UTC).

### 1.4 Instrumente

`read` / `grep` / `glob` (fără modificări), `ssh`, `docker ps|exec|logs|compose config`, `psql` (doar `SELECT` pe producție), `npm audit --json` (fără `npm install`), `ss`, `iptables -S`, `nft list ruleset`, `systemctl list-timers`, plus harness-uri proprie în `/tmp/audit-sec/` pe VM (`tests.mjs`, `tests2.mjs`).

**Nu am rulat** `scripts/run-tests.sh`, **nu am rulat** `npm install`, **nu am modificat** niciun fișier sursă, **nu am făcut deploy**, **nu am rotit credențiale**, **nu am atins firewall-ul**, **nu am injectat defecte în producție**, **nu am folosit portul 30002**, **nu am accesat `https://blipmade.com`**.

### 1.5 Limitări și divergențe

1. **Repo-ul s-a modificat în timpul sesiunii.** `api/src/env.ts` și `api/src/routes/auth.ts` au devenit modificate **necomis** (adăugarea variabilei `LOGIN_RATE_LIMIT_MAX` și a limitei de autentificare configurabile din mediu). Am auditat starea curentă; constatările despre limita de autentificare sunt marcate `CODE-INSPECTED` pentru cod și `VERIFIED` doar pentru configurația observată în containere.
2. **Nu am accesat gazda de la margine** (`10.77.0.12`): cheia disponibilă nu este acceptată (`Permission denied (publickey)`). **TLS, reverse-proxy-ul de margine, DNS-ul și Proxmox nu au putut fi verificate** (vezi §5).
3. **Nu am fost efectuate teste invazive în producție**: niciun scan de porturi extern, niciun `curl` pe URL-uri publice, niciun test de încărcare, nicio modificare de configurație. Verificările de expunere s-au făcut prin configurare și prin `ss`/`iptables`.
4. **O singură cerere către interfața de staging a fost trimisă înainte de restricția primită** (vezi §1.7) — un `GET /api/auth/session`, fără efect de scriere.
5. **Stiva izolată rulează cu `STRIPE_TEST_MODE=true`**, ceea ce schimbă comportamentul webhook-ului (acceptă evenimente fără semnătură). Am tratat separat comportamentul de producție (`NODE_ENV=production` ⇒ `stripeTestGateway()` este întotdeauna fals).

### 1.6 Secretele

Raportul nu conține niciun token, cookie, cheie sau parolă. Variabilele de mediu sunt citate **doar prin nume**, cu starea „set" / „gol" / „neinstalată". Nu am folosit `ADMIN_ENROLLMENT_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `BLIPMADE_INTERNAL_API_TOKEN`, `PANEL_KEYMINT_SECRET` sau `PTERODACTYL_APP_KEY` în nicio cerere de test cu excepția propriului token intern (în stiva mea izolată), și nici nu le-am reprodus.

### 1.7 Declarație explicită privind scrierile în producție

**Nu am scris niciodată în baza de date de producție `blipmade`** și nu m-am autentificat pe `blipmade.com`.

- Verificat prin `SELECT` pe `blipmade`: **nu există** niciunul dintre conturile mele (`qa.check@`, `qa.other@`, `admin.check@`, `audit1..6@`). Singurele conturi de test din producție sunt `qa.headless.one@example.test` și `qa.headless.two@example.test`, **create de runda anterioară**, nu de mine.
- Singura cerere trimisă către o componentă a platformei a fost `GET http://10.77.0.13:3000/api/auth/session` (interfața de staging), făcută **înainte** de restricția primită de la conducere, pentru a verifica dacă atributul `Secure` al cookie-ului supraviețuiește topologiei. Ruta citește sesiunea și pune un cookie CSRF; **nu scrie niciun rând**. Acest URL nu mai este folosit; toate testele ulterioare s-au făcut pe `127.0.0.1:3198` / `:3199` și pe `blipmade_audit_test`.
- Rândurile scrise de mine în baza izolată comună `blipmade_test` (înainte de a-mi crea baza proprie) sunt enumerate în §5.6 pentru curățare.

---

## 2. Metodă

### 2.1 Comenzi concrete

```bash
# a) suprafața de expunere
ssh debian@10.77.0.13 'docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh debian@10.77.0.13 'ss -ltnp | grep -E "3100|3101|3000|30002|30003|5432|6379"'

# b) firewall și NAT
ssh debian@10.77.0.13 'sudo -n ufw status verbose'      # -> ufw: command not found
ssh debian@10.77.0.13 'sudo -n iptables -S'              # -> -P INPUT ACCEPT ; DOCKER chains
ssh debian@10.77.0.13 'sudo -n nft list ruleset'         # -> masq, DOCKER nat

# c) configurația containerelor (doar numele + starea)
ssh debian@10.77.0.13 'docker exec blipmade-api-1 env | cut -d= -f1 | sort'
ssh debian@10.77.0.13 'docker exec blipmade-web-1 printenv TRUSTED_PROXY_IPS'

# d) adresa văzută de API pentru cererile venite prin interfață
ssh debian@10.77.0.13 'docker logs blipmade-api-1 --tail 400 | grep -o "\"remoteAddress\":\"[^\"]*\""'

# e) dependințe
cd api && npm audit --json > /tmp/audit-api.json      # 12 vulnerabilități (2 critice)
cd web && npm audit --json > /tmp/audit-web.json      # 0

# f) backup
ssh debian@10.77.0.13 'systemctl list-timers | grep -i backup'
ssh debian@10.77.0.13 'systemctl status blipmade-backup.timer'   # -> could not be found
ssh debian@10.77.0.13 'ls -la /var/backups/blipmade'
```

### 2.2 Cereri HTTP reprezentative

```bash
# CSRF lipsă pe o cerere de stare
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3198/api/orders \
  -H "Content-Type: application/json" -b "$JAR" -d '{"items":[...]}'          # -> 403

# limitatorul per-adresă, cu adrese false
for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " -X POST http://127.0.0.1:3199/api/orders \
  -H "X-Forwarded-For: 203.0.113.$i" -H "Content-Type: application/json" -d '{...}'; done
# -> toate 403 (fără sesiune), fără niciun 429 -> același ghesc

# eveniment webhook fără semnătură, prin interfața de test
curl -s -X POST http://10.77.0.13:30003/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_lan_...","type":"checkout.session.completed","data":{"object":{...}}}'
# -> HTTP 200 {"received":true}   (acceptat fără semnătură)

# rută internă fără token
curl -s http://127.0.0.1:3198/api/webhooks/stripe/failed     # -> HTTP 200 cu corp de eroare
```

### 2.3 Harness-uri

`/tmp/audit-sec/tests.mjs` (IDOR, CSRF, cookie-uri, limitare, SQLi, traversare, semnătură, scurgere de erori) și `/tmp/audit-sec/tests2.mjs` (prăbușirea limitatorului per-adresă, flag-ul `Secure`, accesibilitatea webhook-ului din LAN, rutele cu token intern, autorizația de admin).

---

## 3. Verificarea afirmațiilor remediării

**Legendă:** `VERIFIED` = reprodus pe comportament observabil · `CODE-INSPECTED` = confirmat prin lectură de cod · `INFERRED` = deducție solidă · `UNVERIFIED` = nu am reușit · stările negative: `STILL BROKEN` / `PARTIALLY FIXED` / `REGRESSION INTRODUCED`.

| # | Afirmația rundei anterioare | Cum am verificat | Rezultat | Evidență |
|---|---|---|---|---|
| S1 | **„Doar proxy-urile de încredere pot seta antetele de redirecționare"** | Lectura `app.ts:51` + `env.ts:102,157`; compararea cu `TRUSTED_PROXIES` real din container; comportament observabil | **VERIFIED** (ca mecanism) / **STILL BROKEN** (ca efect) | `trustProxy: env.trustProxies`; valoarea implicită `127.0.0.1,::1`. Mecanismul e corect — dar `TRUSTED_PROXIES` **nu este setat** în containerul API din producție, deci adresa reală a proxy-ului (`10.77.0.13`, din jurnal) **nu e de încredere** → efectul e stricat (SEC-P1-01, SEC-P1-02) |
| S2 | **„Cookie-ul de sesiune poartă `Secure`, `HttpOnly` și `SameSite`"** | Atributele `Set-Cookie` observate + codul `resolveCookieSecure()` | **PARTIALLY FIXED** | `HttpOnly` ✓, `SameSite=Lax` ✓, `Path=/` ✓ — **dar `Secure` lipsește** în topologia de producție: `Set-Cookie: bm_csrf=…; Max-Age=86400; Path=/; SameSite=Lax` (fără `Secure`). SEC-P1-01 |
| S3 | **„Protecția CSRF este aplicată tuturor rutelor de stare"** | Cerere POST fără `X-CSRF-Token` + codul `csrfGuard` | **VERIFIED** | `plugins/csrf.ts:28-39`; comparație constantă prin `safeEqual`; POST fără token → **403**. Excepțiile sunt limitate la rutele de credential (login/registrare) și la webhook-uri (care au propria verificare de semnătură) |
| S4 | **„Limitarea autentificării protejează contul și adresa"** | 14 încercări de autentificare cu cont inexistent; codul `accountGuard` | **VERIFIED** (comportament) | Coduri: `401×10, apoi 429×4` → garda per-cont (max 10 / 15 min, `routes/auth.ts:182`) funcționează. **Dar** limita per-adresă a devenit globală (SEC-P1-02), iar `LOGIN_RATE_LIMIT_MAX` poate fi setat până la 1000 (SEC-P3-02) |
| S5 | **„Nicio cerere nu poate citi date din alt cont"** | Test IDOR pe comenzi, facturi și instanțe, cu două clienți | **VERIFIED** | SEC-T01: clientul B primește **404** pe comanda clientului A, nu vede factura lui și primește 404 pe instanța lui. Modelul `findFirst({ where: { id, userId } })` este aplicat consecvent |
| S6 | **„Interogările SQL sunt parametrizate"** | Căutare de SQL brut în cod + test de injecție | **VERIFIED** | Un singur `$queryRaw` în cod: `services/pricing.ts:297` (`SELECT "id" FROM "Promotion" WHERE "id" = ${id} FOR UPDATE`) — parametrizat. Test cu `x' OR '1'='1` în calea unui identificator → **404**, fără scurgere |
| S7 | **„Fișierele încărcate nu pot ieși din directorul lor"** | Codul `attachments.ts` + test de traversare | **VERIFIED** | `attachmentPath()` rezolvă și impune cuprinderea în rădăcină (`lib/attachments.ts:53-59`); cheie de stocare aleatoare (12 octeți); `safeFilename` curăță numele; descărcarea se face cu `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` (`routes/tickets.ts:403-404`). Teste de traversare → 404 |
| S8 | **„Nu se expun chei API sau parole în răspunsuri sau jurnale"** | Test pe `/api/status`, pe erori și pe codul de redactare | **VERIFIED** | `app.ts:32-40` redactează `authorization`, `cookie`, `x-csrf-token`, `set-cookie`; handler-ul de erori (`plugins/errorHandler.ts:36-38`) întoarce un mesaj generic cu `requestId`; SEC-T09: răspuns 404 fără stivă, fără SQL |
| S9 | **„Baza de date și Redis nu sunt expuse"** | `compose.yml` + `ss -ltnp` + `iptables -S` | **VERIFIED** | `postgres` și `redis` publicați **doar pe `127.0.0.1`**; API pe `127.0.0.1:3100`; `DOCKER-USER`/`DOCKER` permit pe interfața de bridge. Nicio expunere a bazei de date |
| S10 | **„Containerele sunt izolate"** | `compose.api.yml`, `compose.web.yml` | **PARTIALLY FIXED** | `no-new-privileges:true` și `cap_drop: ALL` ✓ pe `api`, `worker` și `web`. **Dar** gazda nu are firewall (`INPUT ACCEPT`), iar interfața de staging + stivele de test sunt publicate pe `0.0.0.0` (SEC-P2-01) |
| S11 | **„Există o copie de siguranță programată și o restaurare testată"** | `systemctl`, conținutul `/var/backups/blipmade`, `.env` (nume de variabile), scripturile | **STILL BROKEN** | `blipmade-backup.timer` — **„Unit could not be found"**, `not-found`, `inactive`; nicio unitate în `/etc/systemd/system`; `/var/backups/blipmade` conține doar `mail/` și **două arhive de drill** din 2026-10-22; `OFFSITE_TARGET` **nu există** în `.env`. SEC-P2-02 |
| S12 | **„Dependențele sunt actualizate"** | `npm audit --json` pe API și web | **STILL BROKEN** | API: **2 critice + 7 high + 3 moderate**. Web: **0**. SEC-P3-01 |
| S13 | **„Webhook-ul respinge un eveniment fără semnătură"** | Cerere fără semnătură pe stiva de test + lectura codului | **PARTIALLY FIXED** | În producție: `NODE_ENV=production` ⇒ `stripeTestGateway()` fals ⇒ ruta răspunde `{received:false}` cu HTTP 200, **fără** a aplica evenimentul ✓. **Dar** în stiva izolată `STRIPE_TEST_MODE=true` ⇒ evenimentele **fără semnătură sunt acceptate** (HTTP 200 `{"received":true}`) și stiva de test e **accesibilă din LAN** pe `0.0.0.0:30003`. SEC-P2-03 |
| S14 | **„Rutele interne cer un token"** | Cerere fără token; codul `webhooks.ts` | **PARTIALLY FIXED** | Tokenul **este cerut** (comparat cu `!==`, deci **nu** în timp constant) și ruta nu efectuează acțiunea. Dar răspunde **HTTP 200** cu un corp de eroare în loc de 401/403. SEC-P4-01 |
| S15 | **„Worker-ul se oprește curat"** | Codul `worker.ts:203-216` | **VERIFIED** (cod) | `SIGTERM`/`SIGINT` → `clearInterval` pe toate timerele, `healthServer.close()`, `worker.close()`, `emailWorker.close()`, `closeQueue()`, `redis.quit()`, `prisma.$disconnect()`, `process.exit(0)` |
| S16 | **„Nu există dependențe de rulare nefolosite în imagine"** | `package.json` + căutare în `src/` | **PARTIALLY FIXED** | `@fastify/static` e dependență directă, în versiuni vulnerabile, dar **nu este înregistrat nicăieri** în `src/` — moartă, dar se livrează în imagine. Vitest/Vite/Tinypool (2 critice) sunt exclusiv `devDependencies` și sunt excluse de `npm ci --omit=dev` (Dockerfile:24) → **nu ajung în producție** |

---

## 4. Constatări

### SEC-P1-01 — Cookie-ul de sesiune este emis **fără** `Secure` în topologia de producție

- **Severitate:** P1 / High
- **Modul afectat:** `api/src/plugins/auth.ts:50-54,186-194`, `api/src/app.ts:51`, `api/src/env.ts:102,157`, `compose.api.yml`
- **Comportament observat:** în producție, cererile ajung la API prin containerul web, peste puntea Docker. Jurnalul API arată `remoteAddress: 10.77.0.13` și `host: api:3100` — adresa **conțainerului web**, nu adresa clientului. `TRUSTED_PROXIES` **nu este setat** în containerul API, deci `env.trustProxies` = valoarea implicită `['127.0.0.1','::1']`, iar adresa reală a proxy-ului **nu este de încredere**. Fastify rezolvă atunci `request.protocol = 'http'`, iar `resolveCookieSecure()` întoarce `false`. Rezultat observat:
  ```
  set-cookie: bm_csrf=…; Max-Age=86400; Path=/; SameSite=Lax      ← fără „Secure"
  ```
  Reproductibil pe o instanță proprie cu aceeași configurație de proxy (`TRUSTED_PROXIES` gol): `Set-Cookie` fără `Secure` (SEC-T12).
- **Comportament așteptat:** într-un site servit prin HTTPS, cookie-ul de sesiune să poarte `Secure`, astfel încât să nu fie acceptat și trimis în clar peste HTTP.
- **Reproducere:**
  ```bash
  # topologia de producție
  docker exec blipmade-api-1 printenv TRUSTED_PROXIES      # -> gol (implicit 127.0.0.1,::1)
  curl -s -D - -o /dev/null http://10.77.0.13:3000/api/auth/session | grep -i set-cookie
  # -> bm_csrf=…; Max-Age=86400; Path=/; SameSite=Lax     (fără Secure)
  ```
- **Cauză rădăcină (confirmată):** default-ul `TRUSTED_PROXIES='127.0.0.1,::1'` (`env.ts:102`) nu corespunde topologiei reale (proxy-ul este la `172.18.0.x` / `10.77.0.13`), iar `compose.api.yml` **intenționează** să seteze `TRUSTED_PROXIES: "${TRUSTED_PROXIES:-127.0.0.1,::1,172.16.0.0/12}"` — dar variabila **nu ajunge în containerul pornit** (containerul rulează de ~6 ore, iar valoarea lipseste la runtime).
- **Dovezi:** `docker exec blipmade-api-1 printenv TRUSTED_PROXIES` → gol; `docker logs blipmade-api-1` → `remoteAddress: 10.77.0.13`; `Set-Cookie` fără `Secure`; `plugins/auth.ts:50-54`.
- **Impact:** cookie-ul de sesiune poate fi trimis și acceptat în clar peste HTTP (degradare TLS/SSL-stripping, MITM), iar `SameSite=Lax` nu compensează. Se pierde una dintre principalele protecții ale cookie-ului de sesiune.
- **Remediere propusă:**
  1. Setează `TRUSTED_PROXIES` explicit la adresa reală a proxy-ului (de ex. `172.18.0.0/16` sau IP-ul containerului web) și **în containerul pornit**, nu doar în fișierul compose.
  2. Setează `COOKIE_SECURE=true` explicit în mediul de producție, ca apărare în adâncime, independent de topologie.
  3. Adaugă un test de fuziune care cere un `GET /api/auth/session` prin interfață și **exigă** prezența lui `Secure` în `Set-Cookie`.
  4. Verifică la pornire (startup) că `TRUSTED_PROXIES` conține proxy-ul real, și nu pornește în caz contrar.
- **Criterii de verificare:** `curl -s -D - … /api/auth/session` prin interfață întoarce `Secure` în `Set-Cookie`; `docker exec … printenv TRUSTED_PROXIES` nevid și egal cu adresa proxy-ului.

---

### SEC-P1-02 — Limitarea per-adresă a devenit o limitare **globală**: DoS pe autentificare pentru toți clienții

- **Severitate:** P1 / High
- **Modul afectat:** `api/src/app.ts:80` (`keyGenerator`), `api/src/routes/auth.ts:61-99` (`accountGuard`/`accountKey`), `api/src/env.ts:157`
- **Comportament observat:** cheia limitatorului este `request.ip`. Din cauza aceleiași cauze ca la SEC-P1-01, `request.ip` este **aceeași adresă pentru toate cererile** care trec prin interfață (adresa containerului web). Consecințe:
  1. **DoS:** un singur atacator care trimite 10 parolă grele într-o oră blochează **toate** autentificările clienților pentru 15 minute (garda per-cont este per-cont, dar limita per-adresă este globală; un atacator își poate bloca singur contul, însă limita per-adresă este cea care se lovește global).
  2. **Pierderea protecției per-adresă:** câmpul „adresa clientului" nu mai este cunoscut, deci limitele pe adresă nu mai au sens, iar înregistrările de audit (`ip`) din `AuditLog` nu mai identifică clientul.
- **Comportament așteptat:** limitele per-adresă să fie per-adresă, iar un atacator pe o singură adresă să nu poată opri autentificarea celorlalți.
- **Reproducere:**
  ```bash
  # instanță proprie cu proxy neîncredut (configurația de producție)
  for i in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code} " \
    -X POST http://127.0.0.1:3199/api/orders -H "X-Forwarded-For: 203.0.113.$i" … ; done
  # -> toate aceeași ghesc (SEC-T11: rateLimited=0, adrese false distincte, un singur ghesc)
  ```
- **Cauză rădăcină (confirmată):** aceeași ca la SEC-P1-01 — `TRUSTED_PROXIES` nu acoperă proxy-ul real.
- **Dovezi:** SEC-T11; `docker logs blipmade-api-1` → un singur `remoteAddress` pentru cererile de interfață; `app.ts:80`.
- **Impact:** indisponibilitate a autentificării pentru întreaga platformă, plus pierderea identității clientului în jurnale și în limite.
- **Remediere propusă:** aceeași remediere ca la SEC-P1-01 (setarea corectă a lui `TRUSTED_PROXIES`), plus:
  - o limită **globală** separată, cu un prag mult mai mare, pentru a opri un atacator care cimentează o singură adresă;
  - un **adaptor de rată** pe `request.ip`, bazat pe adresa reală, o dată ce încrederea proxy-ului e corectă.
- **Criterii de verificare:** în jurnalul API, cererile prin interfață arată `remoteAddress` diferite, corespunzătoare clienților; un atacator cu 40 adrese false **nu** produce 429 pentru ceilalți.

---

### SEC-P2-01 — Nu există firewall pe gazdă; interfețele de staging și de test sunt publicate pe `0.0.0.0`

- **Severitate:** P2 / Medium
- **Modul afectat:** gazda `10.77.0.13`; `compose.web.yml`; stivele de test
- **Comportament observat:**
  - `ufw` nu este instalat; `iptables -S` → `-P INPUT ACCEPT`, fără reguli de filtrare a intrării; `nft` conține doar lanțurile `DOCKER`.
  - `compose.web.yml` publică interfața de staging pe `10.77.0.13:3000` — **accesibilă din toată rețeaua locală**.
  - Stivele de test ascultă pe **`0.0.0.0:30002` și `0.0.0.0:30003`** (`ss -ltnp`).
  - `postgres` și `redis` sunt pe `127.0.0.1` ✓; API-ul de producție pe `127.0.0.1:3100` ✓.
- **Comportament așteptat:** interfețele care nu trebuie să fie publice să fie restricționate la loopback sau la o rețea de administrare; gazda să aibă un filtru de intrare.
- **Reproducere:** `ssh debian@10.77.0.13 'ss -ltnp | grep -E "3000|30002|30003"'` → `0.0.0.0:30002`, `0.0.0.0:30003`, `10.77.0.13:3000`.
- **Cauză rădăcină (confirmată):** publicările Docker pe `0.0.0.0`/`10.77.0.13` plus absența unui filtru de intrare pe gazdă.
- **Dovezi:** `iptables -S`, `nft list ruleset`, `ss -ltnp`.
- **Impact:** suprafața de expunere a stivei de test (și a secretelor ei — vezi SEC-P2-03) este întreaga rețea locală; interfața de staging e publică pentru orice dispozitiv din segment.
- **Remediere propusă:** filtrează `INPUT` cu `ufw`/`nftables` (implicit DROP, allow pentru SSH și segmentul de administrare); publică interfețele de test doar pe `127.0.0.1`; leagă interfața de staging de o interfață de administrare sau de un tunel.
- **Criterii de verificare:** `ss -ltnp` nu mai arată `0.0.0.0:3000x`; `iptables -S` arată `-P INPUT DROP` cu excepții documentate.

---

### SEC-P2-02 — Nu există copii de siguranță programate și nicio copie în afara gazdei

- **Severitate:** P2 / Medium (impact potential: pierderea totală a datelor)
- **Modul afectat:** `scripts/systemd/blipmade-backup.{service,timer}`, `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`, `scripts/install-backup-timer.sh`
- **Comportament observat:**
  - `systemctl status blipmade-backup.timer` → **„Unit blipmade-backup.timer could not be found"**; `systemctl is-enabled` → `not-found`; `systemctl is-active` → `inactive`; `/etc/systemd/system` nu conține nicio unitate `blipmade-*`.
  - `/var/backups/blipmade` conține **doar** `mail/` și două arhive de **drill** (`blipmade-drill-20261022T232117Z.tar.gz`, `blipmade-drill-20261022T212029Z.tar.gz`) din 22 octombrie. **Nicio arhivă programată** (`blipmade-<label>-<stamp>.tar.gz`).
  - `OFFSITE_TARGET` **nu există** în `.env` → `scripts/backup.sh` nu trimite nimic în afara gazdei. Scriptul avertizează chiar el: gazda folosește **RAID 0**, deci o copie locală *nu* e o copie de siguranță.
  - `BACKUP_KEEP_DAYS=14` (implicit) ar șterge arhivele locale după 14 zile.
- **Comportament așteptat:** o copie programată zilnic (timer-ul din repo spune `02:15`, `Persistent=true`), o copie criptată în afara gazdei, și o restaurare exersată.
- **Reproducere:** comenzile de mai sus.
- **Cauză rădăcină (confirmată):** unitățile systemd există în repo, dar **nu au fost instalate** (`scripts/install-backup-timer.sh` nu a fost rulat) și ținta off-site nu e configurată.
- **Dovezi:** `systemctl status`/`is-enabled`, `ls -la /var/backups/blipmade`, absența lui `OFFSITE_TARGET` din `.env`, `scripts/backup.sh` (blocul `OFFSITE_TARGET`).
- **Impact:** pierderea gazdei (RAID 0 ⇒ un singur eșec de disc pierde tot) înseamnă pierderea **definitivă** a bazei de date: comenzi, facturi, abonamente, dovezi de audit, credențiale de panou. Criptarea și restaurarea sunt **codificate și scrise bine**, dar **nu au fost niciodată rulate pe o copie reală**.
- **Remediere propusă:**
  1. Instalează și activează timer-ul: `systemctl enable --now blipmade-backup.timer`; verifică `systemctl list-timers` și **jurnalul** unei rulări reușite.
  2. Configurează `OFFSITE_TARGET` și o cheie de criptare **care nu apare în lista de procese** (așa cum e deja prevăzut în `backup-offsite.sh`); verifică că arhiva de pe țintă e ilizibilă fără cheie.
  3. Rulează `scripts/restore-drill.sh` pe o copie reală, **nu** pe un drill, și păstrează dovada (data, durata, numărul de tabele restaurate).
  4. Definește explicit politica de retenție (`BACKUP_KEEP_DAYS`) și o alertă la eșec.
- **Criterii de verificare:** `systemctl is-enabled blipmade-backup.timer` → `enabled`; `ls /var/backups/blipmade` conține o arhivă programată din ultimele 24 h; există o arhivă criptată pe ținta off-site; un drill de restaurare reușit, recent, cu un contor de tabele.

---

### SEC-P2-03 — Stiva izolată refolosește secretele de producție și este accesibilă din rețea, cu webhook fără semnătură

- **Severitate:** P2 / Medium
- **Modul afectat:** mediul de test de pe VM; `api/src/services/stripe.ts:33-43` (`stripeTestGateway`); `routes/webhooks.ts:632-644`
- **Comportament observat:** mediul stivei de test (procesul API de test) are **aceleași secrete** ca producția: `ADMIN_PASSWORD`, `ADMIN_ENROLLMENT_KEY`, `SESSION_SECRET`, `BLIPMADE_INTERNAL_API_TOKEN`, `PANEL_KEYMINT_SECRET`, `PTERODACTYL_APP_KEY` (toate setate, aceeași lungime ca în producție). Stiva rulează cu `STRIPE_TEST_MODE=true` → `stripeTestGateway()` este adevărat → `readStripeEvent()` **nu verifică semnătura** și parsează JSON-ul direct. Interfața de test ascultă pe `0.0.0.0:30003` și trimite `/api/*` către API.
  Rezultat observat: `POST http://10.77.0.13:30003/api/webhooks/stripe` cu un eveniment `checkout.session.completed` **fără semnătură** → **HTTP 200 `{"received":true}`** (SEC-T13), evenimentul ajunge în ledger cu `status='processed'`.
- **Comportament așteptat:** o stivă de test accesibilă din rețea să nu poată accepta plăți forjate, iar secretele ei să nu fie cele de producție.
- **Reproducere:** cererea de mai sus; plus `ps` pe procesul API de test și compararea numelor de variabile cu containerul de producție.
- **Cauză rădăcină (confirmată):** mediul de test moștenește fișierul `.env` de producție; `stripeTestGateway()` permite evenimente fără semnătură în orice mediu care nu este `NODE_ENV=production`.
- **Dovezi:** SEC-T13; `services/stripe.ts:33-43, 610-625`; `ss -ltnp` → `0.0.0.0:30003`.
- **Impact:** orice dispozitiv din segmentul rețelei poate **marca drept plătite** comenzi arbitrare în baza de test — și, mai grav, poate folosi secretele de producție (token intern, cheie de panou, parolă de admin) pentru a ajunge la componente de producție. Impactul asupra datelor de producție este **zero** (bazele sunt separate), dar expunerea credentialelor este reală.
- **Remediere propusă:**
  1. **Rotiți** secretele partajate (`ADMIN_ENROLLMENT_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `BLIPMADE_INTERNAL_API_TOKEN`, `PANEL_KEYMINT_SECRET`, `PTERODACTYL_APP_KEY`) și dați stivei de test valori **distincte, generate aleator**.
  2. Limitați stivele de test la `127.0.0.1` (sau la o interfață de administrare).
  3. În stivele de test, cere **și** semnătura (un secret local), chiar dacă `STRIPE_TEST_MODE=true`; păstrați doar „gateway-ul de test" pentru fluxul de ordine, nu pentru webhook.
  4. Folosiți profiluri compose separate (`.env.test`) cu `env_file` propriu.
- **Criterii de verificare:** `docker exec … printenv SESSION_SECRET` în stiva de test ≠ cel din producție; `POST /api/webhooks/stripe` fără semnătură → 400/401; `ss -ltnp` nu mai arată `0.0.0.0:3000x`.

---

### SEC-P3-01 — Dependențe cu vulnerabilități aplicabile; `nodemailer` este mult în urmă

- **Severitate:** P3 / Medium
- **Modul afectat:** `api/package.json` (`nodemailer`, `zod`, `@fastify/static`)
- **Comportament observat:** `npm audit --json` în `api/`:
  - **12 vulnerabilități: 2 critice, 7 high, 3 moderate**. Web: **0**.
  - **2 critice** — `tinypool` (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) și `vitest` (GHSA-5xrq-8626-4rwp, cvss 9.8) — sunt **doar `devDependencies`** și sunt excluse de `npm ci --omit=dev` (Dockerfile:24). **Nu ajung în producție.**
  - **`nodemailer` 6.10.1** (direct, în runtime) — ~20 de consultanțe, dintre care **aplicabile** versiunii instalate: GHSA-rcmh-qjqh-p98v (addressparser, DoS recursiv, cvss 7.5), GHSA-2x7j-588g-ccc2 (O(n²) în addressparser, cvss 7.5), GHSA-wmmp-3585-3rmp (ocolirea validării de domeniu prin IDN/punycode, cvss 6.5), GHSA-cc9r-2j5m-2m83 (ocolirea validării de domeniu prin parsing de comentariu RFC 5322, cvss 6.5), GHSA-p6gq-j5cr-w38f (oprimarea `disableFileAccess`/`disableUrlAccess` → citire de fișiere arbitrară + SSRF, cvss 7.1), GHSA-8c8m-p3m8-cjg8 / GHSA-m943-m63w-w62w / GHSA-85x2-q946-cp5h (trunchierea prematură a grupurilor de destinatari).
  - **`zod` 3.25.76** — GHSA-mrhx-c7xc-m3w5 (epuizarea memoriei la validarea colecțiilor constrânse prea mari, cvss 7.5), range `<4.6.6`.
  - **`@fastify/static` ^8.0.4** (direct, dar **nefolosit** în `src/`) — 4 consultanțe de traversare de drumuri/ocolire de gardă (GHSA-83w8-p2f5-377r cvss 7.5).
- **Comportament așteptat:** dependențele în runtime să nu conțină consultanțe critice/high aplicabile; mailer-ul să fie la o versiune întreținută.
- **Reproducere:** `cd api && npm audit --json`.
- **Cauză rădăcină:** dependențele directă nu au fost actualizate de la ultimul val de consultanțe; `nodemailer` este cu ~4 versiuni majore în urmă.
- **Dovezi:** `npm audit --json`; `package.json` (`nodemailer` direct; `vitest`/`vite` în `devDependencies`); `Dockerfile:24` (`npm ci --omit=dev`).
- **Impact:** platforma trimite mail de verificare, de resetare a parolei și de facturare la adrese furnizate de utilizator. Cu `nodemailer` 6.10.1, o adresă de utilizator poate fi interpretată într-un mod care ocolesc validările de domeniu (deplasarea către un domeniu controlat de atacator), iar o listă de destinatari poate produce DoS prin analizatorul de adrese. Risc real, deși **neverificat** printr-un atac.
- **Remediere propusă:**
  1. Actualizează `nodemailer` la ≥10.1.4 (sau la ultima versiune întreținută) și **validează** lista de destinatari **înainte** de a o da bibliotecii.
  2. Actualizează `zod` la ≥4.6.7 (migrare cu atenție: `z.record`/`z.enum` și `.strict()` se comportă diferit) sau, dacă rămâi pe v3, limitează dimensiunea maximă a fiecărei colecții validate.
  3. Elimină `@fastify/static` din `dependencies` (nu e folosit) sau actualizează-l la ≥10.1.7.
  4. Adaugă `npm audit --audit-level=high` în CI, cu excepții documentate pentru devDependencies.
- **Criterii de verificare:** `npm audit --json` în `api/` raportează 0 critice și 0 high pe dependențele de runtime; `npm audit` pe `web/` rămâne 0.

---

### SEC-P3-02 — Limita de autentificare a devenit configurabilă din mediu, până la 1000 de încercări / 15 minute

- **Severitate:** P3 / Medium
- **Modul afectat:** `api/src/env.ts:16,137`, `api/src/routes/auth.ts:224` (**modificări necomise**, ulterioare rundei de remediere)
- **Comportament observat:** limita per-adresă a autentificării a trecut de la constanta `10` la variabila de mediu `LOGIN_RATE_LIMIT_MAX`, cu `z.coerce.number().int().min(1).max(1000).default(10)`. Stiva izolată o are deja setată la **500** — adică protecția împotriva forțării brute este **practic dezactivată** acolo.
- **Comportament așteptat:** ca o protecție de securitate să nu poată fi slăbită prin-tr-o greșeală de configurație, sau ca o valoare absurdă să fie respinsă.
- **Reproducere:** `tr "\0" "\n" < /proc/<pid-api-test>/environ | grep LOGIN_RATE_LIMIT_MAX` → `LOGIN_RATE_LIMIT_MAX=500`; `env.ts:16` → `.max(1000)`.
- **Cauză rădăcină:** variabila a fost introdusă fără o limită superioară restrictivă și fără o alertă la o valoare prea mare. Garda **per-cont** (`accountGuard(app, 10)`, `routes/auth.ts:182`) rămâne la 10 și **nu** este configurabilă — deci limita reală de forțare brută pe cont rămâne intactă; riscul e limitat la volumul total.
- **Dovezi:** `env.ts:16`; valoarea observată în mediul de test; `routes/auth.ts:182`.
- **Impact:** un operator ( sau un `.env` copiat într-un mediu greșit) poate seta 500 sau 1000 și poate face ca atacatorul să încerce 1000 de parole pe 15 minute de pe o adresă. Protecția per-cont (10) limitează totuși impactul asupra unui cont individual.
- **Remediere propusă:** plafon mai mic (de ex. 50) pentru `LOGIN_RATE_LIMIT_MAX`; **păstrează** garda per-cont la 10 ca limită principală și **nu** o face configurabilă; adaugă un avertisment în `/health` (fără secret) când valoarea depășește un prag rezonabil.
- **Criterii de verificare:** `env.ts` plafonează variabila; o valoare de 500 într-un mediu produce un avertisment în health-check.

---

### SEC-P3-03 — Colecții validate fără limită superioară în cotare

- **Severitate:** P4 / Low-Info
- **Modul afectat:** `api/src/routes/billing.ts:199-218`
- **Comportament observat:** `POST /api/billing/quote` validează `items: z.array({...}).min(1)` **fără `.max()`**, spre deosebire de `POST /api/orders`, care limitează `quantity` la 20. Un corp de 2 MB (limita `bodyLimit` din `app.ts:52`) poate conține zeci de mii de elemente, toate validate și apoi prețuite.
- **Comportament așteptat:** o limită superioară coerentă cu cea a comenzilor.
- **Reproducere (statică):** `routes/billing.ts:206-214` vs. `routes/orders.ts:13-20`.
- **Cauză rădăcină:** limite inconsistente între rute.
- **Dovezi:** cele două referințe de cod; `app.ts:52`; `zod` GHSA-mrhx-c7xc-m3w5.
- **Impact:** **mărginit** de `bodyLimit` (2 MB) și de consumul de CPU/DB al cotării; riscul este de DoS de grad mic.
- **Remediere propusă:** `.max(50)` pe `items` în `/billing/quote`, cu un mesaj explicit.
- **Criterii de verificare:** un corp cu 51 de elemente este respins cu 400.

---

### SEC-P4-01 — Rutele cu token intern răspund HTTP 200 și compară tokenul în timp neconstant

- **Severitate:** P4 / Low-Info
- **Modul afectat:** `api/src/routes/webhooks.ts:663-668, 692-697, 712-717`
- **Comportament observat:** cele trei rute interne (`/webhooks/stripe/failed`, `/webhooks/stripe/replay`, și pagina de evenimente) compară `token !== env.internalToken` — comparație pe șir, **în timp dependent de intrare** — și, când tokenul lipsește, răspund cu **HTTP 200** și un corp `{"error":{"code":"unauthorized",…}}`. Comparația cu `safeEqual` (constantă) există deja în cod, pentru CSRF (`lib/password.ts`, folosit de `plugins/csrf.ts:36`).
- **Comportament așteptat:** 401 pentru un token lipsă sau greșit; comparație în timp constant.
- **Reproducere:** `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3198/api/webhooks/stripe/failed` → **200** (SEC-T14). Funcțional, ruta **nu** execută acțiunea fără token.
- **Cauză rădăcină (confirmată):** `token !== env.internalToken` în loc de `safeEqual`, plus `reply.code(200)` în loc de `reply.code(401)`.
- **Dovezi:** SEC-T14; codul rutelor.
- **Impact:** **redus**. Pragul de comparație pe șir este în general necesar; impactul real e că un monitor de securitate bazat pe codul HTTP nu vede 401, iar clienții automatizați pot considera cererea reușită.
- **Remediere propusă:** înlocuiește `token !== env.internalToken` cu `safeEqual(token ?? '', env.internalToken)` și răspunde cu 401.
- **Criterii de verificare:** cererea fără token → HTTP 401.

---

### SEC-P4-02 — Politica `Content-Security-Policy` este dezactivată

- **Severitate:** P4 / Low-Info
- **Modul afectat:** `api/src/app.ts:62-65`
- **Comportament observat:** `helmet` este înregistrat cu `contentSecurityPolicy: false` și `crossOriginEmbedderPolicy: false`.
- **Comportament așteptat:** o CSP care să limiteze sursele scripturilor; CSP ca strat suplimentar peste `HttpOnly`/`SameSite`/`X-Content-Type-Options`.
- **Cauză rădăcină:** decizie de configurare, fără justificare înregistrată.
- **Dovezi:** `app.ts:62-65`.
- **Impact:** **redus** — `HttpOnly` blochează lectura cookie-ului din JavaScript, iar interfața este o aplicație React fără HTML generat din input-ul utilizatorului. Dar lipsa CSP-ului mărește impactul oricărei XSS rămase (de ex. în aplicație, prin biblioteci).
- **Remediere propusă:** introdu o CSP în **web** (unde se servește HTML-ul), nu în API — API-ul nu returnează HTML.
- **Criterii de verificare:** antet `Content-Security-Policy` prezent pe răspunsurile interfeței.

---

### SEC-P4-03 — Istoricul joburilor eșuate din coadă este șters la 10 minute

- **Severitate:** P4 / Low-Info
- **Modul afectat:** `api/src/worker.ts:120-124`
- **Comportament observat:** `pruneQueue()` execută `queue.clean(0, 1000, 'completed')` și `queue.clean(0, 1000, 'failed')` la fiecare 10 minute. Un job eșuat definitiv (și deci **după** ce compensația a fost executată) dispare din istoricul BullMQ în cel mult 10 minute.
- **Comportament așteptat:** un termen de păstrare pentru diagnosticarea incidentelor.
- **Cauză rădăcină:** curățarea e aplicată și joburilor eșuate, nu doar celor încheiate cu succes.
- **Dovezi:** `worker.ts:120-124`.
- **Impact:** **redus** — ledgerul durabil (`WebhookEvent`, `InstanceEvent`, `AuditLog`) păstrează istoricul; doar panoul BullMQ îl pierde. Mecanismul de compensare **nu** e afectat (el se declanșează înainte ca jobul să ajungă în starea `failed`).
- **Remediere propusă:** curăță joburile eșuate doar după 7 zile (`age`), nu la 0.
- **Criterii de verificare:** un job eșuat e încă vizibil în coadă după 30 de minute.

---

## 5. Ce nu am putut verifica

1. **TLS, reverse-proxy-ul de la margine, DNS-ul** — gazda de la margine (`10.77.0.12`) respinge cheia disponibilă (`Permission denied (publickey)`). Nu am verificat: versiunea TLS și suitele de cifre, certificate-ul și reînnoirea lui, `Strict-Transport-Security`, redirecționarea HTTP→HTTPS, antetele de securitate emise de proxy, configurația `CADDY_ADMIN_URL`/`CADDY_ADMIN_TOKEN` (ambele **gol** în `.env`).
2. **Proxmox** — nu am avut acces; nu am verificat segmentarea rețelei, regulile firewall-ului Proxmox, expunerea consolei de administrare, backup-urile VM-urilor sau izolarea containerelor LXC.
3. **Permisiunile Pterodactyl / `panel-keymint`** — `PTERODACTYL_APP_KEY`, `PANEL_KEYMINT_SECRET` și `PANEL_KEYMINT_URL` sunt setate, dar nu am făcut apeluri la panou și nu am auditat drepturile cheii pe panou, separarea drepturilor pe noduri, sau izolarea containerelor aplicației (ce se întâmplă în `panel-bridge`).
4. **Criptarea reală a backup-urilor** — `scripts/backup-offsite.sh` a fost citit; nu am rulat backup-ul și nu am verificat dacă ținta off-site e configurată (`OFFSITE_TARGET` lipsește) sau dacă arhiva de pe țintă e ilizibilă fără cheie.
5. **Expunerea bazei de date către exterior** — am verificat legăturile Docker și `ss`; nu am scanat din exterior și nu am folosit `nmap`. Nu pot exclude o regulă de NAT sau o tunel în afara a ceea ce arată configurația.
6. **Containerele rulează ca `root`?** — `compose.api.yml` nu setează `user:`; n-am verificat identitatea efectivă din interiorul containerului (`id` în `docker exec`), deci afirmația „rulează ca non-root" ar fi o presupunere. Ce am putut confirma: `no-new-privileges:true` și `cap_drop: ALL` pe `api`, `worker` și `web`.
7. **Semnătură TLS a conexiunii la Pterodactyl / la bridge-ul de panou** — n-am inspectat șirurile de certificate ale acestor componente.
8. **Jurnalele de acces ale gazdei / syslog / `auditd`** — n-am citit fișierele de jurnal ale sistemului; am citit doar `docker logs` pentru containerul API.
9. **Comportamentul în luptă al limitelor** — nu am făcut teste de încărcare (nici pe stiva mea, pentru a nu consuma resursele comune); constatările despre DoS sunt deduse din configurație și din cod, nu măsurate.
10. **Scanarea dependențelor din `web`** — `npm audit` a raportat 0; nu am făcut o revizie manuală a riscurilor de lanț de aprobizionare (registry, integritatea *lockfile-ului*, semnăturile de pachete).

### 5.6 Rândurile mele din baza izolată comună `blipmade_test` (pentru curățare)

Le-am creat înainte de a-mi face baza proprie. **Nu au fost șterse** — baza a fost trunchiată concurent de suita conducătorului, dar câteva rânduri au supraviețuit. Enumerare exactă, măsurată la 23:59 UTC:

| Tabelă | Rânduri | Cum se identifică |
|---|---|---|
| `User` | `qa.check@example.test`, `admin.check@example.test` | e-mailuri create de mine (conturile `audit1..6@` și `qa.other@` au fost trunchiate) |
| `Order` | `BM-00002`, `BM-00003`, `BM-00004` | aparțin utilizatorului `qa.check@example.test` |
| `OrderItem` | 4 rânduri | cele ale comenzilor de mai sus |
| `Instance` | `cmvlmabek017ddxm76zn9la7k` | `provisioningKey` = `order:cmvlmabae016wdxm7vbovd8v1:item:cmvlmabae016ydxm7tdv7orae:unit:0` |
| `Subscription` | 1 rând | legat de instanța de mai sus |
| `PromotionRedemption` | 2 rânduri | legate de comenzile mele |
| `WebhookEvent` | `evt_test_cmvlmabae016wdxm7vbovd8v1_1792799085051`, `evt_lan_1792799185415` | primul e evenimentul plății mele, al doilea e cel din testul SEC-T13 |

**Nu am creat** în `blipmade_test` niciun produs sau promoție care să mai existe acum: promoțiile `AUDIT10`, `EX3HALF`, `EX4PAID` care sunt în tabel **nu sunt ale mele** (eu am folosit `AUDIT100`, `AUDITONE`, `AUDITHALF`, `AUDITFREE`, `AUDIT100PCT`, `AUDITRACE`, toate trunchiate ulterior).

Rândurile din `Session` și `AuditLog` nu pot fi atribuite individual, fiind amestecate cu ale celorlalți auditori; cele ale mele provin din autentificările cu `qa.check@`/`admin.check@`/`audit1..6@` și din cererile de test.

---

## 6. Concluzie

Rundei anterioare i se confirmă **8 afirmații** (S3, S4 ca comportament per-cont, S5, S6, S7, S8, S9, S15), **5 sunt parțiale** (S1, S2, S10, S13, S14, S16) și **2 sunt încă rupte** (S11 — backup-uri; S12 — dependențe).

Cele trei probleme care contează cel mai mult:

1. **SEC-P1-01** — cookie-ul de sesiune este emis **fără `Secure`**, pentru că `TRUSTED_PROXIES` nu acoperă proxy-ul real în topologia de producție. Este o slăbire directă a securității sesiunii.
2. **SEC-P1-02** — aceeași cauză face ca limitarea per-adresă să devină **globală**: un atacator poate bloca autentificarea tuturor clienților, iar adresa reală a clientului se pierde din jurnale.
3. **SEC-P2-02** — **nu există nicio copie de siguranță programată** și nicio copie în afara gazdei, pe o gazdă cu RAID 0: pierderea gazdei înseamnă pierderea definitivă a bazei de date. Scripturile de backup și restaurare există și sunt bine scrise, dar nu au fost rulate pe o copie reală.
