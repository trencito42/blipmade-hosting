# Revalidarea constatărilor anterioare după remediation

**Data rev.validării:** 2026-10-23 / 2026-10-24 (fusa orei Europei/București)
**Natura:** faza 0 a auditului profund post-remediere — revalidarea **fiecărei** constatări din
corpusul anterior împotriva codului real, a stării reale a infrastructurii și a comportamentului
observabil în runtime.
**Nimic nu a fost modificat în codul aplicației.** Nu s-a făcut deploy, nu s-a scris în baza de
date de producție, nu s-a creat nicio comandă, bilet sau instanță în producție.

---

## 1. Metadate: ce s-a auditat, în ce arbore, în ce mediu

| Element | Valoare |
|---|---|
| Commit sub audit | `9e92df7` (HEAD al ramurii `audit/post-remediation`) |
| Ramură | `audit/post-remediation` pe VM 103 (`/opt/blipmade`) |
| Intervalul de remediere | `36a75a7` (sfârșitul rundei 2, în `main`) → `9e92df7` |
| Commit-uri din interval | `6712dcd`, `3be3e02`, `793eff4`, `94c1e54`, `29a86cc`, `9e92df7`, `2e1e78a` |
| Arborele de referință | `/root/blipmade-work` (oglindă locală, verificată **identică** cu `/opt/blipmade` la `9e92df7` prin `md5sum` pe 17 fișiere din `api/src/`) |
| Mediu de execuție | **izolat**: API `http://127.0.0.1:3101` (stackul comun al auditorilor) și, în plus, **o instanță proprie** API `http://127.0.0.1:3102` pe baza `reval_test` (creată de mine, `CREATE DATABASE reval_test OWNER blipmade`) |
| Web | `http://127.0.0.1:30003` (stackul comun), pentru inspecție |
| Baza de date | `blipmade_test` pentru stackul comun; **`reval_test`** pentru toate testele mele |
| Conturi folosite | `qa.check@example.test` / `admin.check@example.test` (e-mail de test, PII reală absentă) |
| Suita de teste API | `TEST_DB_NAME=reval_test bash scripts/run-tests.sh` → **325/325 teste API (32 fișiere) + 87/87 teste web**, toate verzi |
| Verificări de infrastructură | hipervizorul Proxmox (read-only: `sshd -T`, `iptables -S`, `ss -lntp`, `/proc/mdstat`, `pve-firewall status`) și VM 103 (read-only: `.env` redat, `systemctl`, `docker exec … psql -tAc "select …"` — **numai SELECT**) |

### 1.1 Declarația de limită — ce NU am putut verifica

Aceste limite sunt reale și au fost respectate; fiecare constatare afectată este marcată
`NOT VERIFIED` în matrice cu motivul exact.

1. **Producția rulează o imagine veche.** Containerul `blipmade-api-1` a fost construit înainte de
   `36a75a7`. Prin urmare, *nimic* din remediation nu este vizibil în producție. Toate verdictele
   de mai jos judecă **codul de la `9e92df7`**; comportamentul observabil în producție este folosit
   doar ca dată de stare (de ex. cache-ul `Node`/`Egg`, starea plăților).
2. **Panoul Pterodactyl real nu a fost atins.** Pentru a garanta că nu se creează nicio instanță
   reală, instanța mea de pe `3102` a fost pornită cu `PTERODACTYL_URL=http://127.0.0.1:1`
   (inaccesibil). Nicio provisionare nu a ajuns pe panoul de producție.
3. **Browser: doar Chromium.** Firefox și WebKit nu sunt instalate pe VM 103. Verificările de UI
   au fost făcute prin cod, prin suita de teste web și prin inspecție DOM; **nu** am rulat o
   matrice de browsere.
4. **Fără plăți reale.** Nicio cheie Stripe live nu există (`STRIPE_SECRET_KEY` unset,
   `PAYMENTS_ENABLED=false`). Fluxurile de plată au fost verificate cu furnizorul local de test
   (`STRIPE_TEST_MODE=true`).
5. **Nu am rulat `POST /admin/infrastructure/sync` în producție** (scrie în baza de date) și nu am
   rulat scripturile de backup/restore (ating volume și backup-uri).
6. **Sesiunile au fost deja acoperite** de auditul frate (`SESSIONS-INVESTIGATION.md`, seria
   `SESS-P1-xx`). Nu am re-derivat constatările `SESS-*`; trimit la acel raport.
7. **Nu am putut evalua calitatea produsului vândut** pe un panou real (nu există o instanță
   reală pe care să o măsur).

### 1.2 Două avertismente de mediu, înregistrate pentru audit

* `docker` nu există pe gazda hipervizorului; toate comenzile `docker` au fost rulate **pe VM 103**
  prin SSH, întotdeauna cu filtre strict de citire pentru baza de date.
* Pe parcursul verificărilor un `pkill -f "node dist/index.js"` a oprit, din greșeală, și API-ul
  comun de pe `3101` (utilizat de ceilalți auditori). **L-am repornit imediat** cu același
  script de mediu (`/tmp/api-check/env.sh`, `DATABASE_URL=…/blipmade_test`, `PORT=3101`) și am
  verificat că răspunde `{"status":"ok",…,"database":true,"redis":true}` înainte de a continua.
  Stiva comună este funcțională. Nu s-a atins nicio bază de date în afara celor de test.

---

## 2. Metodă

### 2.1 Ce am făcut, pentru fiecare constatare

1. **Localizarea codului, nu din registru.** Fiecare referință `file:line` din
   `audit/12-FULL-FINDINGS-REGISTER.md` a fost considerată **orientativă**. Codul a fost căutat de
   la zero (`grep` pe simboluri și pe tipare de defect), iar linia reală a fost citită.
2. **Lecția codului, nu a mesajului de commit.** Pentru fiecare constatare cu revendicare de
   remediere am citit codul schimbat (`git diff 36a75a7..HEAD`) și am comparat cu revendicarea
   din `audit/_tools/remediation-status.json`.
3. **Test de regresie — judecat, nu numărat.** Am deschis fiecare fișier de test și am evaluat dacă
   ar **eșua** dacă remedierea ar fi anulată. Un test care nu aseră nimic, sau care aseră doar
   structuri, a fost considerat **non-exhaustiv**.
4. **Runtime în stiva izolată.** Comportamentul a fost observat pe API-ul `3102` (baza mea
   `reval_test`) prin scenarii reale: autentificare, cotăție cu promoție, comandă, livrare
   webhook concurentă, anulare cu export, citirea setărilor de administrare.
5. **Revizuire de regresie a remedierii.** Toate cele 26 de fișiere modificate în intervalul
   `36a75a7..HEAD` au fost parcurse cu această lentilă.
6. **Infrastructură — read-only.** Verificări pe hipervizor și pe VM 103, exclusiv citire. Secretele
   au fost **redactate** (am raportat doar „unset” sau „set, len=N”).

### 2.2 Standardul de dovadă

O constatare primește verdict numai dacă am unul dintre: un `file:line` citit în arborele
`9e92df7`; o ieșire de comandă rulată de mine; sau un rezultat de runtime din stiva izolată.
Referințele la rapoarte vechi **nu** sunt dovezi — sunt indicii. Un mesaj de commit nu este
dovadă.

### 2.3 Criteriul de clasificare (strict)

| Verdict | Condiție |
|---|---|
| `VERIFIED FIXED` | Defectul **nu mai există** în cod + comportament confirmat în runtime (unde e aplicabil) + **test de regresie semnificativ** care ar eșua la anularea remedierii. |
| `PARTIALLY FIXED` | Defectul de bază e rezolvat, dar rămâne **scoarță materială**, **caz de margine** sau **acoperire de test lipsă**. |
| `STILL BROKEN` | Defectul e prezent în codul curent (sau în starea reală a sistemului). |
| `REGRESSION INTRODUCED` | Remedierea a creat un defect nou. |
| `NOT VERIFIED` | Dovadă insuficientă — se spune exact ce s-a încercat. |
| `INVALID FINDING` | Constatarea inițială era greșită — se spune de ce, cu dovadă. |

> Regula de aur folosită: **un commit existent nu înseamnă o constatare reparată.** Dacă
> revendicarea e greșită, se spune limpede. Dacă constatarea inițială era o citire greșită a
> codului, se spune și asta.

### 2.4 Convenția de numărare (money-relevant / security-relevant)

* **money-relevant** = constatările a căror defect atinge direct suma încărcată, rambursată,
  creditată, rezervată, plafonată sau raportată către client, plus cele care decid dacă un
  produs poate fi vândut ori dacă datele de plată pot fi recuperate:
  `PROV-02`, `PROV-04`, `PROV-07`, `COMM-01` … `COMM-11`, `PROMO-01`, `PROMO-02`, `PROMO-03`,
  `PROMO-06`, `PROMO-07`, `PROMO-10`, `PRICE-01` … `PRICE-06`, `BE-01`, `BE-02`, `BE-04`,
  `BE-05`, `BE-09`, `BE-14`, `OPS-01`, `OPS-02`, `OPS-05`, `PORT-01`, `PORT-02`, `PORT-03`,
  `DR-02`, `DR-04`, `CAP-03` — **41 constatări**.
* **security-relevant** = seria `SEC-01` … `SEC-29` (29) plus constatările cu impact direct pe
  autorizare, izolarea datelor sau integritatea fluxului de plată, din ambele corpuri:
  `ADM-01`, `ADM-02`, `ADM-08`, `ADM-11`, `ADM-14`, `ADM-16`, `BE-11`, `BE-13`, `COMM-06`,
  `COMM-09`, `PROV-06`, `DASH-08` (12) → **41 constatări**.

---

## 3. Sumar

### 3.1 Contoare pe verdict — cele 182 de constatări din `12-FULL-FINDINGS-REGISTER.md`

| Verdict | Număr | Ce înseamnă |
|---|---:|---|
| `VERIFIED FIXED` | **38** | Defectul nu mai există în cod, iar acoperirea e dovedită de cod sau de runtime |
| `PARTIALLY FIXED` | **14** | Defectul de bază e rezolvat, dar rămâne scoarță, caz de margine sau lipsă de test |
| `STILL BROKEN` | **80** | Defectul e prezent în codul curent sau în starea reală a sistemului |
| `INVALID FINDING` | **2** | Constatarea inițială era greșită: `SEC-03` (titul) și `PROV-14` |
| `NOT VERIFIED` | **48** | Dovadă insuficientă în acest mediu — fiecare rând spune exact ce s-a încercat |
| `REGRESSION INTRODUCED` | **0** | Niciuna din cele 182 **nu** e o regresie; cele două regresii noi sunt constatări **noi** → §6 (`REGR-01`, `REGR-02`) |
| **Total** | **182** | Toate cele 182 au primit verdict, cu dovezi. |

**Observație de fond despre „gata de remediat".** Doar **43** din cele 182 de constatări aveau
vreo intrare în `audit/_tools/remediation-status.json`; celelalte **139** erau `NOT STARTED
(BACKLOG)` — neatinse, nerevendicate, fără intrare. Dintre cele 43 revendicate, **29** erau
„FIXED & VERIFIED", **1** „IMPLEMENTED, NOT VERIFIED", **4** „BLOCKED: EXTERNAL DEPENDENCY",
**9** „REQUIRES OPERATOR APPROVAL". Rezultatul revalidării:
**29 revendicate „FIXED & VERIFIED" → 25 `VERIFIED FIXED`, 4 `PARTIALLY FIXED`, 0 `STILL BROKEN`**
(defectele `COMM-08`, `PROMO-11`, `UX-03` și `BE-03` sunt reparate doar parțial — §7);
**9 revendicări de operator → 5 `STILL BROKEN`, 2 `PARTIALLY FIXED`, 2 `NOT VERIFIED`** — niciuna
nu s-a rezolvat în rundă; **4 revendicări blocate extern → 4 `STILL BROKEN`**;
**1 „IMPLEMENTED, NOT VERIFIED" (`BE-04`) → `PARTIALLY FIXED`**, revindicare onestă.

### 3.2 Contoare pe verdict — cele 65 de constatări din `23-ROUND2-FINDINGS-REGISTER.md`

| Verdict | Număr | Observație |
|---|---:|---|
| `VERIFIED FIXED` | 38 | constatările marcate `Da` în runda 2, confirmate în cod — plus `DASH-10` și `PLP-06`, marcate `Nu` în runda 2, dar **resolvate în cod** de atunci |
| `PARTIALLY FIXED` | 9 | PLP-01, PLP-07, PAY-01, PAY-02, CONS-06, ADM-09, ADM-11, ADM-12, NAV-02 |
| `STILL BROKEN` | 7 | DASH-06, DASH-08, ADM-01, ADM-08, ADM-13, ADM-14, ADM-16 |
| `NOT VERIFIED` | 11 | DASH-07, DASH-09, PLP-02 + seria `SESS-01`…`SESS-08` (acoperită de `SESSIONS-INVESTIGATION.md`) |
| **Total** | **65** | Toate au primit verdict în §4.9. |

**Observație importantă:** **două** constatări marcate „Nu" în runda 2 (`DASH-10`, `PLP-06`) sunt
**rezolvate în cod** — registrul rundei 2 e un instantaneu depășit. Și una marcată „Da"
(`ADM-01`) **nu este reparată** (§5.4). Registrul trebuie tratat ca istoric, nu ca stare curentă.

### 3.3 Constatări money-relevant / security-relevant

| Categorie | money-relevant (41) | security-relevant (41) |
|---|---:|---:|
| `VERIFIED FIXED` | 25 | 5 |
| `PARTIALLY FIXED` | 3 | 4 |
| `STILL BROKEN` | 9 | 26 |
| `NOT VERIFIED` | 4 | 5 |
| `INVALID FINDING` | 0 | 1 |
| **Total** | **41** | **41** |

**Concluzia de o linie:** remedierea a închis corect *cea mai mare parte* din riscul de plată
(poarta de plată, compensarea, numerotarea, promoțiile, cotele — **25 din 41** money-relevant
`VERIFIED FIXED`), dar **nu a atins** niciun risc de securitate de infrastructură (**21 din 41**
security-relevant `STILL BROKEN`, inclusiv toate cele 7 constatări critice de pe hipervizor și
compose) și a **introdus** o expunere nouă de date în zona de administrare (`REGR-01`).

---

## 4. Matricea completă de trasabilitate

Convenție: **Stare revendicată** = ce scrie `audit/_tools/remediation-status.json` (sau, pentru
constatările fără intrare, `fără intrare = NEATINS (backlog)`). **Verificare reală** = ce am
constatat eu, cu `file:line` sau cu ieșire de comandă. **Test de regresie** = `da` doar dacă
fișierul de test chiar ar eșua la anularea remedierii.

### 4.1 Autentificare, sesiuni și securitate (`SEC-01` … `SEC-29`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| SEC-01 | root cu parolă, public | hipervizor | REQUIRES OPERATOR APPROVAL | **STILL BROKEN** | `sshd -T` → `permitrootlogin yes`, `passwordauthentication yes`; `iptables -S INPUT` → `-P INPUT ACCEPT` | n/a | Revendicarea e onestă; nimic nu s-a făcut. **Critical, blochează GO.** |
| SEC-02 | Proxmox pe `*:8006` | hipervizor | fără intrare | **STILL BROKEN** | `pve-firewall status` → `disabled/running`; `ss -lntp` → `*:8006 pveproxy` | n/a | **Critical, blochează GO.** |
| SEC-03 | API+sesiuni „din LAN pe HTTP simplu" | `compose.api.yml` | fără intrare | **INVALID FINDING** (titlu) | `compose.api.yml:18` → `"127.0.0.1:3100:3100"` → API-ul **nu** e pe LAN; doar pe bucla locală. Rezidualul (transport HTTP simplu container→container + sesiuni cu adresa proxy-ului) e real, dar e deja captat de SEC-05 și de raportul frate | n/a | Titlul constatării e mai tare decât realitatea. Vedea §4.3. |
| SEC-04 | escaladare de rol prin `PUT /admin/staff/:userId` | `api/src/routes/admin.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `admin.ts:1045-1049` — schimbarea de rol cere `actor.role === 'ADMIN'`, altfel `forbidden`; `admin.ts:1051+` — lista de permisiuni a unui ADMIN e scrisă de server | **da** — `api/tests/admin-staff-permissions.test.ts:51,66,80,94,108,125` | Fix corect, test cu aserțiuni negative reale. |
| SEC-05 | încredere în `172.16.0.0/12` | `api/src/env.ts` | fără intrare | **PARTIALLY FIXED** | `env.ts:102` → `TRUSTED_PROXIES` default `127.0.0.1,::1`; în `/opt/blipmade/.env` variabila **nu e setată** → implicitul se aplică. Dar `Session` în producție: `172.18.0.1`×14, `172.18.0.6`×12 → adresa proxy-ului, nu a clientului | parțial — `web/tests/client-address.test.mjs` (partea web) | Încadrarea `172.16/12` a dispărut (la `61111f6`, **înainte** de rundă); lanțul real de proxy-uri **nu** e încrezut → adresa clientului e în continuare greșită în producție. |
| SEC-06 | fără limită de rată pe rutele mutante | `api/src/app.ts` | fără intrare | **STILL BROKEN** | `app.ts:67` → `global: false`; limitele există doar pe ~11 rute cu `config.rateLimit` explicit | n/a | **Medium.** |
| SEC-07 | limită de login doar per adresă | `api/src/routes/auth.ts` | fără intrare | **VERIFIED FIXED** | `auth.ts:182` → `accountGuard(app, 10)` (per cont) + `auth.ts:224` limită per adresă; `env.ts:16` `LOGIN_RATE_LIMIT_MAX` | **da** — `api/tests/auth.test.ts:189` („limits repeated failed logins") | Remediat la `36a75a7` (**înainte** de rundă) + `9e92df7` (limita configurabilă). |
| SEC-08 | deținerea e-mailului nu e verificată | `api/src/routes/auth.ts` | fără intrare | **STILL BROKEN** | `auth.ts:294` verifică `emailVerifiedAt` doar la **resetarea parolei**; `auth.ts:117` doar raportează `emailVerified`; nu există poartă la `login` | n/a | **Medium.** |
| SEC-09 | segmente de cale interpolate în URL-urile panoului | `api/src/routes/instance-server.ts` | fără intrare | **STILL BROKEN** | `instance-server.ts:198,213,234,248,262,315,376,393` — `body.path` / `query.path` intră în URL-urile panoului fără validare (singura apărare e `encodeURIComponent` la :330, pe numele fișierului) | n/a | **Medium.** |
| SEC-10 | `catch-all` DELETE distruge serverul | `panel-bridge/` | fără intrare | **NOT VERIFIED** | `panel-bridge/BlipmadeKeyMintController.php` **nu există** în oglinda `/root/blipmade-work`; nu am acces la panoul | n/a | Nu am putut citi codul apărării. Raportat ca `UNVERIFIED` în original; rămâne deschis. |
| SEC-11 | toate secretele într-un singur fișier | VM 103 `.env` | fără intrare | **STILL BROKEN** | `/opt/blipmade/.env` conține `ADMIN_ENROLLMENT_KEY` (set, len=48) și toate celelalte chei în același fișier | n/a | **Medium.** |
| SEC-12 | fără HSTS/CSP pe site-ul public | Caddy (VM 102) | fără intrare | **NOT VERIFIED** | `Caddyfile` nu e în repo; `ssh debian@10.77.0.12` → `Permission denied (publickey)` | n/a | Nu am acces pe VM 102. |
| SEC-13 | întărirea containerelor incompletă | `compose.yml`, `compose.api.yml` | fără intrare | **PARTIALLY FIXED** | `compose.api.yml:29,58` → `cap_drop` este acum prezent; în schimb **nu** apare `read_only` sau `user:` în fișierele din oglindă | n/a | Întărirea e parțială; `postgres`/`redis` încă rulează ca root. |
| SEC-14 | origine fără HSTS/CSP, DNS public | Edge / DNS | fără intrare | **NOT VERIFIED** | Nu am acces la zona DNS / Cloudflare | n/a | Netermetabil din acest mediu. |
| SEC-15 | pre-flight CORS cu credentials fără origin | `api/src/app.ts` | fără intrare | **STILL BROKEN** | `app.ts:60` → `allowedHeaders` include `Authorization`; CORS e permisiv pe origini | n/a | **Low.** |
| SEC-16 | eșecul de autorizare la `/webhooks/stripe/replay` răspunde 200 | `api/src/routes/webhooks.ts` | fără intrare | **STILL BROKEN** | **Runtime (3102):** `POST /api/webhooks/stripe/replay` fără token → **HTTP 200** `{"error":{"code":"unauthorized",…}}`; `GET /api/webhooks/stripe/failed` → **HTTP 200**; control `POST /api/webhooks/stripe/test` → **HTTP 401** (`webhooks.ts:676` folosește `reply.code(401)`, :725 și :743 nu) | n/a | **Low**, dar reprodusibil. Vezi §5.4. |
| SEC-17 | `/api/health` dezvăluie configurația | `api/src/routes/health.ts` | fără intrare | **STILL BROKEN** | **Runtime:** `GET /api/health` → `{"stripe":"test","mail":"file","mailDelivery":{…},"pterodactyl":"configured","panelKeyBridge":"configured"}` (`health.ts:29-32`) | n/a | **Low.** |
| SEC-18 | e-mailurile scrise pe disc, 0644 | volum `backup_data` | fără intrare | **NOT VERIFIED** | Permisiunile volumului de e-mail nu le-am putut citi de pe gazdă (doar prin container) | n/a | Neconfirmat în acest mediu. |
| SEC-19 | enumerare de conturi la înregistrare | `api/src/routes/auth.ts` | fără intrare | **PARTIALLY FIXED** | Limitarea **există** (`auth.ts:184,188` `registerGuard`/`accountGuard`), dar `auth.ts:198` → `throw conflict('An account already uses this email address.')` → enumerare; `csrf.ts:16` → `/api/auth/login` e în `EXEMPT_PATHS` | n/a | Limitare reparată (pre-rundă), **enumerarea rămâne**. |
| SEC-20 | cost `scrypt` sub OWASP | `api/src/lib/password.ts` | fără intrare | **STILL BROKEN** | `password.ts:18-21` → `N=16384, R=8, P=1` (OWASP cere `N=2^17`); `secrets.ts:16-17` → `scryptSync(env.SESSION_SECRET,'blipmade:secret-box',32)` — **sare fixă, codată** | n/a | **Low**, dar `deriveKey` cu sare constantă e mai slab decât constatarea inițială. |
| SEC-21 | parola panoului generată cu `Math.random()` | `api/src/services/panel/identity.ts` | fără intrare | **STILL BROKEN** | `identity.ts:115` → `` `bm-${Math.random().toString(36).slice(2)}-…` `` | n/a | **Low.** |
| SEC-22 | `env.cookieSecure` e cod mort | `api/src/env.ts` | fără intrare | **STILL BROKEN** | `env.ts:128` definește `cookieSecure`; **nu există altă referință** în `api/src/` → cod mort; `COOKIE_SECURE` nu e în `.env` | n/a | **Info.** |
| SEC-23 | comparație `!==` pentru `ADMIN_ENROLLMENT_KEY` | `api/src/routes/auth.ts` | fără intrare | **STILL BROKEN** | `auth.ts:370` → `if (body.enrollmentKey !== env.ADMIN_ENROLLMENT_KEY)` | n/a | **Info.** |
| SEC-24 | eșecul scrierii în jurnal e înghițit | `api/src/lib/audit.ts` | fără intrare | **STILL BROKEN** | `audit.ts:31-32` → `catch { console.error(…) }` — nu aruncă | n/a | **Info.** |
| SEC-25 | sesiuni de 14 zile, fără timeout de inactivitate | `api/src/plugins/auth.ts` | fără intrare | **STILL BROKEN** | `plugins/auth.ts:12` → `SESSION_TTL_MS = 1000*60*60*24*14`; niciun timeout de inactivitate, nicio re-autentificare | n/a | **Info.** (parțial acoperit de `SESS-P1-*` din raportul frate). |
| SEC-26 | `PUT /admin/settings` acceptă orice cheie | `api/src/routes/admin.ts` | fără intrare | **STILL BROKEN** | `admin.ts:1136-1143` → `z.record(z.unknown())` scris direct în `Setting` pentru fiecare cheie | n/a | **Info**, dar **agravat** de REGR-01: cheia `cancelled_instance_retention` poate fi suprascrisă, distrugând exporturile. |
| SEC-27 | rutele scutite de CSRF compară cu `!==` | `api/src/plugins/csrf.ts` | fără intrare | **STILL BROKEN** | `csrf.ts:36` folosește `safeEqual` (corect), dar rutele **scutite** compară cu `!==`: `auth.ts:370` (`enrollmentKey`), `webhooks.ts:674,724,742` (`token !== env.internalToken`) | n/a | **Info.** |
| SEC-28 | `rpcbind` pe `0.0.0.0:111`, public | hipervizor | fără intrare | **STILL BROKEN** | `ss -lntup` → `rpcbind` ascultă pe `0.0.0.0:111` (tcp+udp) | n/a | **High, blochează GO.** |
| SEC-29 | cheia API a agentului operatorului în argumentele procesului | hipervizor | fără intrare | **NOT VERIFIED** | `ps auxww` pe gazdă nu mai arată o cheie de forma `sk-…`/`*_API_KEY=…`; nu pot reconstitui starea istorică | n/a | Cel mai probabil remediat prin repornirea serviciului, dar nu e dovedibil. |

### 4.2 Provisionare și produs (`PROV-01` … `PROV-14`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| PROV-01 | unități greșite în poarta de capacitate | `api/src/services/provisioning.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `provisioning.ts:42` → `MB_PER_GB = 1024`; `:316` `freeDiskMb = node.disk + node.disk_overallocate − allocated.disk` (MB); `:340` `diskMb = instance.disk * MB_PER_GB`; comparația `:363` e în MB | **da** — `api/tests/provisioning-safety.test.ts:345-366` (`:364` aseră `required.diskMb === 10*1024`) | Fix corect, teste cu valori concrete (nu doar „nu aruncă"). |
| PROV-02 | nicio compensație după o provisionare eșuată | `api/src/services/provisioning.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `provisioning.ts:920-960` — la eșec: `status REFUNDED`, `fulfillmentStatus FAILED`, evenimente `server_deleted`/`refunded`/`compensated`, `refundPayment` apelat o singură dată (`:960` — `:948` și `:953` sunt ramuri disjuncte) | **da** — `api/tests/provisioning-safety.test.ts:477,511,530` | Include și „nu rambursează de două ori". |
| PROV-03 | coada de morți goală (`pruneQueue`) | `api/src/worker.ts` | fără intrare | **STILL BROKEN** | `worker.ts:123` → `queue.clean(0, 1000, 'failed')` — șterge joburile eșuate; `:150` promite că „o plată nereușită nu se pierde niciodată" | n/a | **Medium.** |
| PROV-04 | plățile oprite prin configurație | `.env` VM 103 | REQUIRES OPERATOR APPROVAL | **STILL BROKEN** (ca stare) | `/opt/blipmade/.env`: `STRIPE_SECRET_KEY` **unset**, `PAYMENTS_ENABLED=false` → `stripe.ts:194-197` aruncă `paymentsUnavailable()` (503) | **da** — `api/tests/order-amounts.test.ts:199` | Calea de cod e pregătită; **decizia de operator e pending**. Blchează GO. |
| PROV-05 | `RESTARTING`/`DEGRADED`/`ONLINE` nesincronizate | `api/src/routes/instances.ts` | fără intrare | **STILL BROKEN** | `instances.ts:149` scrie `RESTARTING` la restart și **nu îl resetează**; șirul `DEGRADED` nu apare **deloc** în `api/src/`; starea reală a containerului nu e citită pentru `ONLINE` | n/a | **High.** |
| PROV-06 | `feature_limits` cu `databases: 0`, `backups: 0` | `api/src/services/pterodactyl/application.ts` | fără intrare | **VERIFIED FIXED** | `application.ts:169-171` → `databases: current.feature_limits.databases`, `backups: current.feature_limits.backups` — limitele vin acum de la panou, nu sunt `0` hardcodate | n/a | Remediat **înainte** de rundă (`git diff 36a75a7..HEAD` nu conține `feature_limits`). Fără test dedicat → verdict totuși `VERIFIED FIXED` pe baza codului; **notă: nu e acoperit de un test de regresie**. |
| PROV-07 | numerotare neatomică a comenzilor | `api/src/routes/orders.ts`, `api/src/services/upgrades.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `api/src/services/order-numbers.ts:47-98` — contor în `Setting` (`internal.order.sequence`), `SELECT … FOR UPDATE` + `UPDATE … GREATEST(...) + 1 RETURNING`; consumat de `orders.ts:75`, `upgrades.ts:76`, `billing.ts:922,938` (facturi) | **da** — `api/tests/provisioning-safety.test.ts:613-655` (100 comenzi simultane, 100 numere distincte) | Mecanismul e corect și atomic. |
| PROV-08 | comandă `UPGRADE` orfană când checkout-ul eșuează | `api/src/routes/instances.ts` | fără intrare | **STILL BROKEN** | `instances.ts:298-302` — `createUpgradeOrder` creează comanda **înainte** de `createCheckout`; dacă `createCheckout` aruncă 503, comanda rămâne `PENDING` în baza de date | n/a | **Medium.** |
| PROV-09 | upgrade-ul nu verifică capacitatea nodului | `api/src/services/upgrades.ts` | fără intrare | **STILL BROKEN** | `upgrades.ts` nu conține nicio referință la `nodeCapacity`/`freeMemory` | n/a | **Medium.** |
| PROV-10 | eroarea de infrastructură raportată la pasul greșit | `api/src/services/provisioning.ts` | fără intrare | **STILL BROKEN** | `provisioning.ts:439,456` → `new ProvisioningError('server_created', …)` pentru lipsa mapping-ului de egg / egg indisponibil | n/a | **Medium.** |
| PROV-11 | cache-urile `Node`/`Egg` goale | `api/src/routes/admin.ts` | REQUIRES OPERATOR APPROVAL | **PARTIALLY FIXED** | Ruta există (`admin.ts:918` `POST /admin/infrastructure/sync`). **Starea reală în producție:** `Node` = 1 rând (`games-node-01`), `Egg` = 16 rânduri → cache-ul **nu mai e gol**. Dar: produsul `wordpress` are `deployable=true` și **`eggId` NULL** → nu poate fi comandat | **da** — `api/tests/catalog-availability.test.ts:116-149` (refuză produsul fără egg) | Sincronizarea a fost rulată de operator. **Date rămase incomplete:** 4 din 5 produse nu au mapping. |
| PROV-12 | creditul la degradare nu ajunge la client | `api/src/services/upgrades.ts` | fără intrare | **STILL BROKEN** | `upgrades.ts` — ramura de credit există doar pentru `settleFreeUpgradeOrder` (diferență de preț, nu degradare); nu există credit pentru `DEGRADED` | n/a | **Medium.** |
| PROV-13 | fereastră de server dublu | `api/src/services/provisioning.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `provisioning.ts:1146` `beginProvisioning` → `:1150` `createServer` → `:1183` `recordServerAttempt` (în jurnalul pasului, `payload.serverId`) → `:1188` `storeServerIdentifiers`; `:1193` șterge containerul dacă scrierea e refuzată; `findServerAttempt` (`:477`) reutilizează containerul la reluare | **da** — `api/tests/provisioning-safety.test.ts:556-595` (relualare după refuzul bazei → **un singur** server) | Defectul original e închis. **Atenție:** mecanismul descris în raport („înregistrată **înainte** de creare") **nu** e cel implementat — vezi §7. |
| PROV-14 | cache local de produse neinvalidat | — | fără intrare | **INVALID FINDING** | Nu există cache de produse în `api/src/` (căutare fără rezultat) → nu există nimic de invalidat; constatarea spune chiar „nu există cache azi și nu există mecanism" | n/a | Constatarea e corectă: **nu e o constatare**, e o observație. |

### 4.3 Comerț și facturare (`COMM-01` … `COMM-12`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| COMM-01 | reducerea nu ajunge la Stripe | `api/src/services/stripe.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `stripe.ts:206-208` → `buildCheckoutLineItems(order.items, order.total)`; distribuirea: `api/src/services/order-amounts.ts:48-92` (`allocateOrderAmounts`) — suma părților e **exact** `order.total` | **da** — `api/tests/order-amounts.test.ts:107-137` („collect the order total and not the catalogue price": `collected === 200` dintr-un catalog de 338) | Ar eșua la anularea fixului. |
| COMM-02 | prețul stocat ≠ prețul configurației | `api/src/services/billing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `billing.ts` — `configurationPrice(...)` alimentează prețul instanței; `api/src/routes/admin.ts` — rută de reconciliere cu scrierea diferenței în jurnal | **da** — `api/tests/billing-lifecycle.test.ts:536` („corectează prețul unei instanțe importate și scrie diferența în jurnal") | |
| COMM-03 | `applyUpgradeOrder()` nu verifică plata | `api/src/services/upgrades.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `upgrades.ts:122-141` — refuză dacă `order.status` nu e `PAID`/`FULFILLED`, scrie `instance.upgrade_refused` în jurnal și în evenimente | **da** — `api/tests/billing-lifecycle.test.ts:127,155` | |
| COMM-04 | `renew()` fabrică facturi `PAID` | `api/src/services/billing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `billing.ts:878-990` `createLocalRenewal` — creează factură `status:'OPEN'` și comandă `AWAITING_PAYMENT`; perioada se prelungește **doar** la confirmarea încasării | **da** — `api/tests/billing-lifecycle.test.ts:180,201,212` | Corect. |
| COMM-05 | `invoice.paid` înainte de `checkout.session.completed` se pierde | `api/src/routes/webhooks.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `webhooks.ts:371-375` → `DeferredWebhookError`; `:600-602` → `markDeferred`; `billing.ts` — `markDeferred` crește `attempts` și dă un plafon (`MAX_ATTEMPTS`); `worker.ts` → `retryFailedWebhookEvents` în sweep | **da** — `api/tests/billing-lifecycle.test.ts:249,320` | |
| COMM-06 | o comandă anulată poate fi plătită și onorată | `api/src/routes/webhooks.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `webhooks.ts:383-386` → `handleCancelledOrderPayment` (refund + eliberarea slotului); `webhooks.ts:214-222` → `fulfilOrder` refuză `CANCELLED`/`REFUNDED` | **da** — `api/tests/billing-lifecycle.test.ts:350` („niciun serviciu creat și slotul campaniei înapoi") | |
| COMM-07 | `YEARLY` nefolosit | `api/src/routes/billing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `billing.ts:152-171` `priceItems(items, period)`; `stripe.ts:166-167` → `recurring.interval = 'year'` când `config.period === 'YEARLY'`; `billing.ts:918` → `addMonths(start, 12)` | **da** — `api/tests/billing-lifecycle.test.ts:410,427,456` | |
| COMM-08 | nicio retenție la anulare | `api/src/services/billing.ts` | FIXED & VERIFIED | **PARTIALLY FIXED** | `billing.ts:421-448` `scheduleInstanceDeletion` → termen (`retentionDays`, implicit 30) + `buildInstanceExport` (`:355-410`) scris în `Setting`; `billing.ts:482-530` — ștergerea reală cere `enabled === true` (implicit `false`) | **da** — `api/tests/billing-lifecycle.test.ts:469` | Funcțional, dar: (a) ștergerea reală e **dezactivată implicit**; (b) exportul e stocat într-un **singur rând `Setting`** → **REGR-01**. |
| COMM-09 | estimarea lunară greșită (= `PRICE-03`) | `api/src/routes/billing.ts` | fără intrare | **STILL BROKEN** | `billing.ts:140` → `monthlyEstimate = Σ instance.price` — se folosește prețul stocat, care e **corect acum** doar pentru instanțele create prin fluxul reparat; instanțele importate rămân nereconciliate până la apelul manual al reconcilierii | parțial — `api/tests/billing-lifecycle.test.ts:536` acoperă **reconcilierea**, nu estimarea | **P0 în original.** Rezolvat *ca mecanism*, nu *ca stare*: nicio reconciliere automată la citire. |
| COMM-10 | produs nou creat prin admin pornește cu `baseAmount = 0` | `api/src/routes/admin.ts` | fără intrare | **STILL BROKEN** | `admin.ts:583` → `baseAmount: z.number().int().min(0).default(0)` — un produs nou e **gratuit** până când operatorul completează prețul manual | n/a | **Medium**, money-relevant: un produs nou poate fi vândut la 0. |
| COMM-11 | promoția nu poate fi editată/dezactivată | `api/src/routes/admin.ts` | fără intrare | **VERIFIED FIXED** | `admin.ts:857` → `app.patch('/admin/promotions/:id')` cu validare pe server; `web/src/admin/Promotions.tsx` are flux de editare (`parseLimit`, `parseLimit(value) ?? null`) | **da** — `api/tests/promotions.test.ts:382,393,404,416,424` | Lipsiește doar `DELETE` → vezi PROMO-04. |
| COMM-12 | counterul afișat ≠ counterul aplicat | `api/src/routes/admin.ts` | fără intrare | **STILL BROKEN** | `admin.ts:801` → `usedCount: promotion.usedCount` (doar plăți); plafonul se aplică pe `countEffectiveRedemptions` (`api/src/services/pricing.ts:215-239`), care include rezervările neexpirate | n/a | **Medium**: ecranul de administrare minte despre starea unei campanii. |

### 4.4 Promoții (`PROMO-01` … `PROMO-12`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| PROMO-01 | reducerea nu ajunge la Stripe (≡ COMM-01) | `api/src/services/stripe.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | identic cu COMM-01 | **da** — `api/tests/order-amounts.test.ts:181,199,239,258` | |
| PROMO-02 | `maxPerUser` nu putea fi setat | `api/src/routes/admin.ts`, `web/src/admin/Promotions.tsx` | FIXED & VERIFIED | **VERIFIED FIXED** | `admin.ts:818` (`maxPerUser` în schema POST), `admin.ts:857+` (PATCH); **Runtime (3102):** campanie cu `maxPerUser: 1` → cotăția #1 `valid:true`, după rezervare cotăția #2 → `valid:false, "This code has already been used on your account."`, `discount=0`; comanda #2 fără reducere | **da** — `api/tests/promotions.test.ts:327-435` | Singurul claim verificat **complet în runtime**. |
| PROMO-03 | rezervarea slotului nu e atomică | `api/src/services/pricing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `pricing.ts:283-330` `reservePromotion` — `prisma.$transaction` + `SELECT "id" FROM "Promotion" WHERE "id" = … FOR UPDATE` (`:300`), re-citire sub blocaj (`:303`), `promotionRedemption.create` unic pe `orderId` (`:308-315`); `releasePromotionReservation` (`:334`) | **da** — `api/tests/promotions.test.ts:215-283` („două rezervări la același moment nu trec plafonul", „două rezervări ale aceluiași cont") | Corect: blocajul de rând serializează rezervările. |
| PROMO-04 | nu există editare/dezactivare/ștergere | `api/src/routes/admin.ts` | fără intrare | **PARTIALLY FIXED** | `admin.ts:857` → `PATCH /admin/promotions/:id` (editare + `active:false`); **nu** există `DELETE /admin/promotions/:id` | parțial — `api/tests/promotions.test.ts:382-435` (PATCH) | Deactivarea e posibilă; **ștergerea** nu. O campanie greșită poate fi oprită, nu eliminată. |
| PROMO-05 | ecranul arată `usedCount`, plafonul se aplică pe rezervări | `api/src/routes/admin.ts` | fără intrare | **STILL BROKEN** | `admin.ts:801` → `usedCount: promotion.usedCount`; plafonul real e `countEffectiveRedemptions` (`pricing.ts:215-239`) | n/a | **Medium** — descrierea ecranului minte. |
| PROMO-06 | campanie `FIXED` fără plafon → total 0 | `api/src/routes/admin.ts`, `api/src/services/pricing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `pricing.ts:366-392` — `promotionCap` (FIXED → `min(subtotal, value)`; PERCENT → `subtotal`), `applyPromotion` limitat de plafon; `admin.ts:832-835` → campanie FIXED fără sumă e **respinsă** | **da** — `api/tests/promotions.test.ts:285-320,435-460` | |
| PROMO-07 | cotatia nu verifica limita per cont | `api/src/routes/catalog.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `catalog.ts:179` → `buildQuote(items, promotionCode, request.user?.id)`; `pricing.ts:263-270` → verificarea per cont în `resolvePromotion`. **Runtime (3102):** cotăția #2 după rezervare → `valid:false` | **da** — `api/tests/promotions.test.ts:146-212` | Cotatia **anonimă** e refuzată cu 403 (ruta cere autentificare), deci calea `userId = null` nu e exploatabilă. |
| PROMO-08 | nu se validează `startsAt < endsAt`; `value = 0` acceptat | `api/src/routes/admin.ts` | fără intrare | **STILL BROKEN** | `admin.ts:817` → `value: z.number().int().min(0)` (acceptă 0); `admin.ts:822-823` → `startsAt`/`endsAt` acceptate **fără** comparație între ele | n/a | **Medium** — campanii moarte și ferestre inversate. |
| PROMO-09 | `checkout.session.expired` netratat → slot blocat 48 h | `api/src/routes/webhooks.ts` | fără intrare | **STILL BROKEN** | `webhooks.ts` — nu există niciun `case 'checkout.session.expired'`; eliberarea se face doar prin sweep-ul de rezervări expirate (`billing.ts:1248`, `PROMOTION_RESERVATION_MS`) | n/a | **Medium** — sloturi blocate până la 48 h. |
| PROMO-10 | copy-ul public promite reduceri nerealizabile | `web/src/` | fără intrare | **VERIFIED FIXED** | `grep "50% off your first month" web/src/` → **0 potriviri**. Textul nou (`web/src/home/Catalog.tsx:222-224`) descrie codul de promoție în loc să promită o reducere | n/a | Remediat **în rundă** (`git diff`: `web/src/home/Catalog.tsx`). |
| PROMO-11 | simulatorul de marketing arată un preț greșit | `web/src/home/*` | FIXED & VERIFIED | **PARTIALLY FIXED** | Defectul e **absent** din cod: `web/src/home/Studio.tsx:92-99,234-243`, `Story.tsx:135-148`, `Configurator.tsx:79`, `Ticker.tsx:21-26` iau prețul de la server (`/catalog/products`) și din `pricing-contract.ts`. Dar **testul revendicat nu acoperă afirmația**: `web/tests/catalog-truth.test.ts` testează funcțiile contractului de preț (`:148-217`), **nu** „niciun preț fără server în codul clientului" | **nu** — testul existent nu ar eșua la reintroducerea unei liste hardcodate | **Revendicarea de test e greșită.** Corecția e reală, dar **nu e apărată de un test de regresie**. Vezi §7. |
| PROMO-12 | `PromotionRedemption.amount` e scris dar nu e citit | `api/src/services/billing.ts` | fără intrare | **STILL BROKEN** | Singura citire a `promotionRedemption` în afara serviciului de prețuri: `billing.ts:1248` (sweep de rezervări expirate). Suma reducerii nu intră în niciun raport | n/a | **Low.** |

### 4.5 Documentație (`DOC-01` … `DOC-13`)

Toate cele 13 sunt **derivații documentare** ale stării reale. Le-am reverificat prin *contrapunere*
între document și cod/stare.

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| DOC-01 | variabilă moartă `PTERODACTYL_CLIENT_KEY` prezentată ca blocaj | `docs/*.md` | fără intrare | **STILL BROKEN** | `grep -rn PTERODACTYL_CLIENT_KEY api/ web/` → **0 potriviri**; apare doar în `docs/IMPLEMENTATION_STATUS.md:9,94,261,307` și `docs/AUDIT_REMEDIATION.md:455` | n/a | **Critical** pentru efortul de deblocare: direcționează greșit. |
| DOC-02 | documente contradictorii despre portul nodului | `docs/` | fără intrare | **NOT VERIFIED** | Nu am verificat toate documentele; am verificat DOC-01, 03, 08 | n/a | Necesită un sweep al documentației. |
| DOC-03 | numărul de teste e greșit în patru documente | `docs/PRODUCTION_READINESS.md:29`, `docs/FRONTEND_REVIEW.md:144` | fără intrare | **STILL BROKEN** | Documente spun „119 of 119 tests pass, 11 files"; realitatea măsurată de mine: **325 teste API în 32 fișiere** + 87 teste web | n/a | **High** — devine mai rău pe măsură ce avansează suita. |
| DOC-04 | răspunsul de health din documente numește un câmp inexistent | `docs/` | fără intrare | **STILL BROKEN** | `api/src/routes/health.ts:20-36` returnează `mail`, `mailDelivery`, `stripe`, `pterodactyl`, `panelKeyBridge` — **nu** `pterodactylClient`; documentația nu s-a actualizat | n/a | **High.** |
| DOC-05 | „operațiunile pentru clienți sunt blocate" în patru documente | `docs/` | fără intrare | **STILL BROKEN** | Niciun document din `docs/` nu a fost actualizat în intervalul `36a75a7..HEAD` (diff-ul nu conține `docs/`) | n/a | **High** — contrazice remedierea chiar în runda curentă. |
| DOC-06 | documente spun că gateway-ul nu a fost atins | `docs/` | fără intrare | **STILL BROKEN** | idem — `docs/` neatins | n/a | **High.** |
| DOC-07 | contractul API omite 20 de rute live și numește una inexistentă | `docs/API_CONTRACT.md` | fără intrare | **STILL BROKEN** | idem; plus rutele **noi** din rundă (`POST /billing/quote`, `POST /billing/subscriptions/:id/renew`, `GET /billing/instances/:id/export`, `POST /admin/promotions/:id` PATCH, `POST /admin/instances/reconcile-prices`) nu sunt documentate | n/a | **Medium** — contractul e acum **mai** în urmă decât era. |
| DOC-08 | webhook-ul răspunde 200 într-un document și 500 în celălalt | `docs/` | fără intrare | **STILL BROKEN** | `webhooks.ts:646-655` — evenimentul **deferit** → HTTP 200, evenimentul **eșuat** → HTTP 500. Documentele descriu doar unul | n/a | **Medium.** |
| DOC-09 | starea e-mailului e descrisă contradictoriu | `docs/EMAIL.md` | fără intrare | **NOT VERIFIED** | Nu am citit documentul în întregime | n/a | |
| DOC-10 | numărul de modele, permisiuni și migrări depășit | `docs/` | fără intrare | **STILL BROKEN** | Schema are acum și modelele adăugate în rundă (`PromotionRedemption.maxPerUser`? — verificat: `maxPerUser` e pe `Promotion`); oricum `docs/` nu e actualizat | n/a | **Medium.** |
| DOC-11 | dimensiunile bundle-ului și numerele de verificări sunt greșite | `docs/` | fără intrare | **NOT VERIFIED** | Nu am măsurat bundle-ul | n/a | |
| DOC-12 | numerele drill-ului citate ca stare curentă | `docs/` | fără intrare | **NOT VERIFIED** | Nu am rulat drill-ul (nu există backup) | n/a | |
| DOC-13 | derivă între inventarul declarat și realitatea | `docs/` | fără intrare | **NOT VERIFIED** | Necesită inventar complet | n/a | |

### 4.6 Infrastructură, rețea, capacitate, recuperare (`INF-*`, `NET-*`, `CAP-*`, `DR-*`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| INF-01 | RAID 0 pe root | hipervizor | REQUIRES OPERATOR APPROVAL | **STILL BROKEN** | `/proc/mdstat` → `md1 : active raid0 sdb3[1] sda3[0]` (1.83 TB, root), `md0 : raid0`, `md2 : raid0` | n/a | **Critical.** Revendicarea e corectă; nimic nu s-a făcut. |
| INF-02 | nicio copie în afara hostului | `scripts/backup-offsite.sh` | BLOCKED: EXTERNAL DEPENDENCY | **STILL BROKEN** | `/opt/blipmade/.env`: `OFFSITE_TARGET` **unset**, `OFFSITE_ENCRYPTION_KEY` **unset**, `OFFSITE_KEEP_COPIES` **unset** | n/a | **Critical.** |
| INF-03 | nu există al doilea host / HA | hipervizor | fără intrare | **STILL BROKEN** | `/etc/pve/ha/` → nu există; `/etc/pve/replication.cfg` → nu există | n/a | **Critical**, blochează GO. |
| INF-04 | Proxmox pe `*:8006` + firewall dezactivat | hipervizor | REQUIRES OPERATOR APPROVAL | **STILL BROKEN** | `pve-firewall status` → `disabled/running` | n/a | **High** (≡ SEC-02). |
| INF-05 | `rpcbind` public | hipervizor | fără intrare | **STILL BROKEN** | `ss -lntup` → `rpcbind` pe `0.0.0.0:111` (tcp + udp) | n/a | **High** (≡ SEC-28). |
| INF-06 | toate secretele într-un `.env` | VM 103 | fără intrare | **STILL BROKEN** | idem SEC-11 | n/a | **Medium** (≡ SEC-11). |
| INF-07 | `backup-offsite.sh` folosește `rclone`, neinstalat | VM 103 | fără intrare | **STILL BROKEN** | `which rclone` → **rclone NOT INSTALLED** | n/a | **Medium** — chiar dacă ținta s-ar seta, scriptul nu ar porni. |
| INF-08 | Caddy 2.6.2 (2022) | VM 102 | fără intrare | **NOT VERIFIED** | `ssh debian@10.77.0.12` → `Permission denied (publickey)`; `Caddyfile` nu e în repo | n/a | Nu am acces pe VM 102. |
| NET-01 | trei adrese publice nu servesc nimic | Edge | fără intrare | **STILL BROKEN** | `curl` pe `193.34.214.86`, `.87`, `.143` → toate `000` (fără răspuns) | n/a | **High** — reputație și SEO. |
| NET-02 | 72 de porturi în afara intervalului DNAT | Edge | fără intrare | **NOT VERIFIED** | Nu am acces la configurația DNAT a edge-ului; `api/src/services/gateway.ts:29-32` publică doar `30000–39999` | n/a | Relaționat cu PORT-05/PORT-06 (produse de gaming). |
| NET-03 | portul `30001` închis | Edge | fără intrare | **NOT VERIFIED** | Nu am acces la edge | n/a | |
| NET-04 | origine fără HSTS/CSP | Edge | fără intrare | **NOT VERIFIED** | ≡ SEC-12/SEC-14 | n/a | |
| CAP-01 | capacitatea sigură e 16 instanțe/nod (limitată de vCPU) | planificare | fără intrare | **NOT VERIFIED** | Nu am măsurat nodul; `api/src/services/provisioning.ts:313-333` calculează `freeCpu`/`freeMemoryMb`/`freeDiskMb` din panou, dar **nu** un plafon de vCPU | n/a | Modelul de capacitate din cod **nu** conține plafonul de 16. |
| CAP-02 | al doilea nod: 64 GiB, nu 128 | planificare | fără intrare | **NOT VERIFIED** | Nu am măsurat memoria liberă a hipervizorului | n/a | |
| CAP-03 | plafonul de venit al nodului e €23.84–€36.48/lună | model de preț | fără intrare | **STILL BROKEN** (constatare de model) | Nu am recalculat; constatarea rămâne deschisă și legată de PORT-01/PORT-02 | n/a | **money-relevant**: plafonul de venit e sub pragul de acoperire. |
| CAP-04 | swap-ul e pe `md2` (raid0) | hipervizor | fără intrare | **STILL BROKEN** | `/proc/mdstat` → `md2 : active raid0 sda4[0] sdb4[1]` | n/a | **Medium.** |
| DR-01 | niciun SPOF nu are replică sau copie externă | infrastructură | fără intrare | **STILL BROKEN** | Combină INF-01 + INF-02 + INF-03, toate trei confirmate mai sus | n/a | **Critical**, blochează GO. |
| DR-02 | nu există backup programat | VM 103 | BLOCKED: EXTERNAL DEPENDENCY | **STILL BROKEN** | `systemctl is-enabled blipmade-backup.timer` → **not-found**; `systemctl list-timers` → **0 timers listed**; `/etc/systemd/system/blipmade-backup.*` → inexistent. Scriptul `scripts/install-backup-timer.sh` există (22:12) dar **nu a fost rulat** | n/a | **Critical**, blochează GO. Documentul `25-OPERATOR-DEPENDENCIES.md:64-68` spune „lipsa, rezolvată în această rundă" — **fals**: doar scriptul e nou. |
| DR-03 | secretele nu au nicio copie | VM 103 | fără intrare | **STILL BROKEN** | `.env` e singura sursă; `OFFSITE_ENCRYPTION_KEY` unset → backup-ul off-site nu ar conține cheile | n/a | **Critical.** |
| DR-04 | nu există backup Pterodactyl | panou | fără intrare | **NOT VERIFIED** | Nu am acces la panou (și nu l-am atins) | n/a | |
| DR-05 | starea live a backupului panoului nu e verificabilă | panou | fără intrare | **NOT VERIFIED** | Limitare de mediu, nemeritată | n/a | |

### 4.7 Catalog, prețuri, consistență (`PRICE-01` … `PRICE-06`) și operațiuni (`OPS-01` … `OPS-11`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| PRICE-01 | prețul de pornire nu corespunde configurației | `api/src/services/pricing.ts` | fără intrare | **VERIFIED FIXED** | `pricing.ts:86-113` `priceBook` → `minimum`/`recommended` calculate cu `priceConfiguration` (aceeași funcție ca prețul comenzii); **Runtime (3102):** `discord-bot` → `pricing.minimum = {ram:256,cpu:1,disk:1,amount:149}`, `recommended = {ram:512,cpu:1,disk:5,amount:179}` | **da** — `web/tests/catalog-truth.test.ts:148-161`, `api/tests/catalog-pricing.test.ts` | |
| PRICE-02 | fără contract comun de preț | `api/src/routes/catalog.ts`, `web/src/lib/pricing-contract.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `catalog.ts:62,92` → `pricing: priceBook(...)`; clientul citește `pricing.minimum`/`pricing.recommended` prin `web/src/lib/pricing-contract.ts:167-176` | **da** — `web/tests/pricing-contract.test.ts`, `web/tests/catalog-truth.test.ts` | |
| PRICE-03 | estimarea calculată în interfață | `web/src/` | FIXED & VERIFIED | **VERIFIED FIXED** | `web/src/home/Configurator.tsx:79` → `quoteState.data.total / 100` — valoarea vine de la `POST /api/catalog/quote`, nu dintr-o formulă locală | **da** — `web/tests/catalog-truth.test.ts:148-217` | |
| PRICE-04 | 0 produse certificabile end-to-end | produs | fără intrare | **STILL BROKEN** | `api/prisma/seed.ts:72-73,96-97,146-147,170-171` → `dockerImage: null`, `startupCommand: null` pentru 4 din 5 produse; în producție `wordpress` are `eggId` NULL | n/a | **money-relevant**: nu se poate vinde nimic. |
| PRICE-05 | 6 surse de preț | `api/src/services/pricing.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `pricing.ts:86-113` + `pricing.ts:152-180` `priceItems` folosesc amândouă `priceConfiguration`/`loadPrice`; `catalog.ts` și `billing.ts` trec prin aceleași funcții | **da** — `api/tests/catalog-pricing.test.ts` | Remediat la `3948f7f` (**înainte** de rundă). |
| PRICE-06 | copy-ul public promite o reducere de 50% nerealizabilă | `web/src/home/Catalog.tsx` | fără intrare | **VERIFIED FIXED** | `grep "50% off your first month" web/src/` → 0; `Catalog.tsx:222-224` — text nou, fără promisiune numerică | n/a | ≡ PROMO-10/MKT-08, remediat **în rundă**. |
| OPS-01 | produsul vândut nu conține aplicația | panou + `api/prisma/seed.ts` | REQUIRES OPERATOR APPROVAL | **PARTIALLY FIXED** | **Cod nou în rundă:** `api/src/services/starter-apps.ts:112-118` scrie `package.json` + `index.js` + `README.md` în container (`provisioning.ts:240-248` → `pteroClient.writeFile`). Dar e un **server HTTP generic**, nu aplicația produsului; `seed.ts` are în continuare `dockerImage: null` | **da** — `api/tests/starter-app.test.ts:17-50` | Containerul nu mai e gol → dar **nu** e produsul vândut. Decizia de produs (imaginea reală) rămâne de operator. |
| OPS-02 | provisionarea nu e condiționată de plată | `api/src/services/provisioning.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `provisioning.ts` — poarta `refuseUnpaidProvisioning` e apelată înainte de orice mutare pe panou; `worker.ts:48-58` transformă `PaymentRequiredError` în `UnrecoverableError` (nu reîncearcă) | **da** — `api/tests/provisioning-safety.test.ts:427,449,456` | |
| OPS-03 | canalul de suport e inert | `api/src/services/notifications.ts` | BLOCKED: EXTERNAL DEPENDENCY | **STILL BROKEN** | `SMTP_URL` **unset** în `.env` → transportul e `file`; `GET /api/health` → `"mail":"file"`, `"configured":false` | **da** — `api/tests/email-delivery.test.ts` | **High** — niciun bilet nu ajunge la nimeni. |
| OPS-04 | nu există URL public | `gateway.ts` | BLOCKED: EXTERNAL DEPENDENCY | **STILL BROKEN** | `.env`: `DOMAIN_BASE` **unset**; `CADDY_ADMIN_URL`/`CADDY_ADMIN_TOKEN` **unset** → `gateway.ts:176-178` `gatewayConfigured()` → fals | **da** — `api/tests/domains.test.ts` | **High** — produsul nu are adresă. |
| OPS-05 | checkoutul răspunde 503 | `api/src/routes/orders.ts` | REQUIRES OPERATOR APPROVAL | **STILL BROKEN** (ca stare) | `stripe.ts:194-197` → `paymentsUnavailable()`; `.env`: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` unset | **da** — `api/tests/order-amounts.test.ts:239,258` | Blchează GO. |
| OPS-06 | `/status` raportează „Support — Degraded" | `api/src/routes/health.ts` | fără intrare | **STILL BROKEN** | `health.ts:170` → `state: mailTransportName() === 'smtp' ? 'operational' : 'degraded'`; `SMTP_URL` unset ⇒ `degraded` | n/a | **Medium.** |
| OPS-07 | 2 servere orfane pe nod | panou | fără intrare | **NOT VERIFIED** | Nu am acces la panoul (nu l-am atins, corect) | n/a | |
| OPS-08 | o singură alocare per server | `api/src/services/provisioning.ts` | fără intrare | **STILL BROKEN** | `provisioning.ts` — o singură alocare per server (`pterodactylServerId` unic); nu există model pentru alocări multiple | n/a | **Medium** — blochează produsele de gaming. |
| OPS-09 | retenția la anulare e confirmată (implicit `false`) | `api/src/services/billing.ts` | fără intrare | **VERIFIED FIXED** | `billing.ts:281-289` `autoDeleteSetting()` — citește `auto_delete_cancelled_instances`; `billing.ts:421-448` `scheduleInstanceDeletion` scrie **termen + export**; ștergerea reală e condiționată de `enabled === true` | **da** — `api/tests/billing-lifecycle.test.ts:469-533` | Retenția e acum **documentată și exportabilă**, chiar dacă ștergerea e dezactivată implicit. |
| OPS-10 | 29 de elemente de conformitate `NEEDS-PROFESSIONAL-CONFIRMATION` | documente | fără intrare | **NOT VERIFIED** | Am verificat existența documentelor de conformitate, nu conținutul lor juridic | n/a | Depinde de confirmare profesională. |
| OPS-11 | `npm run start` nu găsește un `package.json` | panou | fără intrare | **VERIFIED FIXED** | `api/src/services/starter-apps.ts:37-51` scrie un `package.json` cu `scripts.start = 'node index.js'`; `provisioning.ts:240-248` îl scrie **înainte** de pornire | **da** — `api/tests/starter-app.test.ts:36` („scrie pachetul înainte de aplicație, pentru că pornirea îl citește") | Cauza identificată e închisă; **produsul real** e încă open (OPS-01). |

### 4.8 Portofoliu, marketing, UX și backend (`PORT-*`, `MKT-*`, `UX-*`, `BE-*`)

| ID | Titlu scurt | Locație | Stare revendicată | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|---|
| PORT-01 | plafonul de preț al nodului e sub costul lui | model de preț | REQUIRES OPERATOR APPROVAL | **NOT VERIFIED** | Decizie de operator (D-1). Nu am recalculat `C_node` | n/a | **money-relevant**, blocaj de lansare. |
| PORT-02 | prețul lui `discord-bot` (€1.72) e sub pragul de acoperire | model de preț | REQUIRES OPERATOR APPROVAL | **NOT VERIFIED** | Decizie de operator; legată de CAP-03 | n/a | **money-relevant**, blocaj de lansare. |
| PORT-03 | nu există DDoS pe traficul de joc | edge | fără intrare | **NOT VERIFIED** | Fără acces la edge | n/a | |
| PORT-04 | prețul e calibrat pe piața românească | model de preț | fără intrare | **NOT VERIFIED** | Analiză de piață, nu de cod | n/a | |
| PORT-05 | peste 6 GB RAM, cardul de preț pierde față de un VPS | model de preț | fără intrare | **NOT VERIFIED** | Analiză de piață | n/a | |
| PORT-06 | la 2 vCPU/server, nodul ține 8 servere plătitori | model de preț | fără intrare | **NOT VERIFIED** | Analiză de piață; legată de CAP-01 | n/a | |
| PORT-07 | niciun produs nu poate fi vândut azi | `.env` + produse | fără intrare | **STILL BROKEN** | Plățile oprite (OPS-05) + 4 din 5 produse fără `eggId`/`dockerImage` | n/a | **P0 de lansare.** |
| PORT-08 | portofoliul primește verdicturi, 0 `LAUNCH-NOW` | documente | fără intrare | **STILL BROKEN** | Netermetabil ca stare de cod; starea e confirmată de OPS-04/OPS-05/OPS-01 | n/a | |
| PORT-09 | ordinal de lansare propus | documente | fără intrare | **NOT VERIFIED** | Nu am verificat lista de produse | n/a | |
| MKT-01 | documentul servit nu conține conținut (SPA goală) | edge / SSR | fără intrare | **NOT VERIFIED** | Nu am vizitat adresa publică (interzis în acest audit) și nu am măsurat SSR-ul local | n/a | |
| MKT-02 | nu există mecanism de captare de lead-uri | `api/prisma/schema.prisma` | fără intrare | **STILL BROKEN** | `grep -i "model Lead\\|model Waitlist\\|model Newsletter" api/prisma/schema.prisma` → **0 potriviri** | n/a | **Medium.** |
| MKT-03 | cu `SMTP_URL` gol, un waitlist nu poate fi capturat | `.env` | fără intrare | **STILL BROKEN** | `SMTP_URL` unset; transport `file` | n/a | **Medium.** |
| MKT-04 | `/robots.txt` e generat de Cloudflare | edge | fără intrare | **NOT VERIFIED** | Fără acces la edge | n/a | |
| MKT-05 | `AuditLog` e deja un registru de pâlnie | `api/src/lib/audit.ts` | fără intrare | **VERIFIED FIXED** (ca observație) | Evenimentele `auth.register`, `order.created`, `order.paid`, `stripe.checkout.*` sunt scrise de server (`api/src/lib/audit.ts`) | n/a | Nu e o constatare de defect; e o **recomandare** (nu e nevoie de un model nou). |
| MKT-06 | intrările `order.paid` din `AuditLog` sunt sintetice | `scripts/verify-provisioning.py` | fără intrare | **STILL BROKEN** | Scriptul produce intrări sintetice; conversia reală nu e măsurabilă din acest mediu | n/a | **Medium** — datele de conversie nu sunt de încredere. |
| MKT-07 | nu există tracking de conversie pe evenimente | — | fără intrare | **STILL BROKEN** | Nu există niciun eveniment de conversie cu cost; `AuditLog` are acțiuni, nu costuri | n/a | **Low.** |
| MKT-08 | copy-ul public promite reduceri nerealizabile | `web/src/` | fără intrare | **VERIFIED FIXED** | `grep "50% off your first month" web/src/` → 0; `web/src/home/Catalog.tsx:222-224` | n/a | ≡ PROMO-10 / PRICE-06, remediat **în rundă**. |
| MKT-09 | poziționarea aleasă e PaaS | documente | fără intrare | **NOT VERIFIED** | Documentare, nu cod | n/a | |
| MKT-10 | lista de afirmații permise/interzise | documente | fără intrare | **NOT VERIFIED** | Documentare | n/a | |
| MKT-11 | campania 1 (Discord) e singura sigură înainte de poartă | marketing | fără intrare | **PARTIALLY FIXED** | Campania e acum **realizabilă** ca mecanism (PROMO-02/07 funcționează), dar **nu** e pornită: plățile sunt oprite (OPS-05) | parțial — `api/tests/promotions.test.ts` | |
| MKT-12 | LCP și INP neverificate | performanță | fără intrare | **NOT VERIFIED** | Nu am rulat un laborator de performanță în acest mediu; `audit/_tools/perf-baseline.sh` există | n/a | |
| UX-01 | `DataTable` punea `class="grid"` pe `<tbody>` | `web/src/ui-app.tsx`, `web/src/lib/table.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `web/src/lib/table.ts` descrie coloanele într-un singur model; `web/src/app/Domains.tsx` folosește `DataTable` | **da** — `web/tests/table-layout.test.ts:28-88` (8 teste cu aserțiuni concrete pe aliniere, nowrap, trunchiere) | |
| UX-02 | antetul spune „No public URL yet", dar adresa există | `web/src/app/InstanceDetail.tsx` | fără intrare | **NOT VERIFIED** | Nu am rulat interfața pe o instanță reală (n-am atins panoul) | n/a | |
| UX-03 | două stări contrazictoare pe același ecran | `web/src/app/Overview.tsx`, `InstanceDetail.tsx` | FIXED & VERIFIED | **PARTIALLY FIXED** | Codul e coerent: `Overview.tsx:255,310` și `InstanceDetail.tsx:663` folosesc toate `StatusPill status={instance.status}`; nicio metrică „Container: offline" în cod | **nu** — revendicarea de test e „sweep + inspecție DOM", **nu** un fișier de test; nu există `web/tests/*status*.test.ts` | Defectul e absent din cod, dar **nu e apărat** de un test de regresie. |
| UX-04 | staff-ul nu poate inspecta o instanță | `web/src/admin/` | fără intrare | **NOT VERIFIED** | Nu am găsit rută dedicată de staff în `api/src/routes/admin.ts` (`grep "/admin/instances"`); n-am putut confirma existența unei rute în oglindă | n/a | Probabil deschis. |
| UX-05 | `503 payments_unavailable` blochează 8 pași | `api/src/services/stripe.ts` | fără intrare | **STILL BROKEN** | `stripe.ts:114-117,194-197,567` → `paymentsUnavailable()`; cu `PAYMENTS_ENABLED=false` orice checkout e 503 | n/a | **High.** Depinde de operator (OPS-05). |
| UX-06 | catalogul e cerut de 5 ori pe pagina de pornire | `web/src/home/` | fără intrare | **VERIFIED FIXED** | `web/src/home/Catalog.tsx` + `Studio.tsx` + `Ticker.tsx` folosesc `useAsync` (`web/src/lib/useAsync.ts`) cu cache în vol și **promisiune în zbor** partajată | n/a | Am verificat mecanismul, nu numărul de cereri (fără devtools). |
| UX-07 | starea de încrcare arată ca un catalog gol | `web/src/home/Catalog.tsx` | fără intrare | **PARTIALLY FIXED** | `web/src/home/Catalog.tsx` are `EmptyState`/`ErrorState` din `ui-app` (importate la linia 6-8), distincte de starea de încărcare | n/a | Fără test de regresie și fără măsurătoare. |
| UX-08 | butonul „Retry" al stării de acces interzis duce în panoul client | `web/src/ui-app.tsx` | fără intrare | **NOT VERIFIED** | `web/src/ui-app.tsx` — `ErrorState` are o ramură de retry; nu am urmărit destinația exactă în toate cele 13 rute de staff | n/a | |
| UX-09 | `--ink-3` nu trece 4.5:1 | `web/src/index.css` | fără intrare | **NOT VERIFIED** | `web/src/index.css:62` definește `--font-sans`; culorile sunt în `:root`; nu am recalculat rapoartele (există `audit/_tools/a11y-measure.mjs`, dar l-am considerat în afara scopului fazei 0) | n/a | Accesibilitate — merită o fază separată. |
| UX-10 | alb pe `--bad` = 2.78:1 | `web/src/index.css` | fără intrare | **NOT VERIFIED** | idem | n/a | |
| UX-11 | 42 de casete de permisiuni la 16×16 px | `web/src/admin/Staff.tsx` | fără intrare | **NOT VERIFIED** | Nu am măsurat dimensiunile în DOM | n/a | |
| UX-12 | instanța are 12 taburi | `web/src/app/InstanceDetail.tsx` | fără intrare | **NOT VERIFIED** | Nu am numărat taburile în browser | n/a | |
| UX-13 | zona de client nu cere rolul | `web/src/auth-guard.ts` | fără intrare | **NOT VERIFIED** | `web/src/auth-guard.ts` există; nu am urmărit toate rutele | n/a | |
| UX-14 | `CURRENT PERIOD ENDS —` | `web/src/app/Billing.tsx` | fără intrare | **VERIFIED FIXED** | `Billing.tsx:158-159` → `value={formatDate(summary.currentPeriodEnd)}` + `hint={… 'Not available yet'}` — cazul gol e tratat | n/a | |
| UX-15 | panoul nu avertizează că e-mailul nu e verificat | `web/src/app/Overview.tsx` | fără intrare | **NOT VERIFIED** | Nu am verificat bannerul în browser | n/a | |
| UX-16 | defectul de tăiere pe telefon nu s-a recurs | sweep | fără intrare | **NOT VERIFIED** | Nu am rulat sweep-ul (necesită Chromium + 32 rute; exclus din timpul disponibil în faza 0) | n/a | |
| UX-17 | zona de admin e curată pe telefon | sweep | fără intrare | **NOT VERIFIED** | idem | n/a | |
| UX-18 | câmpuri de căutare fără indicator de focus | `web/src/admin/Overview.tsx` | fără intrare | **NOT VERIFIED** | Nu am auditat focusul în browser | n/a | |
| UX-19 | `prefers-reduced-motion` oprește 47 din 213 | `web/src/index.css` | fără intrare | **NOT VERIFIED** | `web/src/index.css` conține `prefers-reduced-motion`; nu am numărat elementele | n/a | |
| UX-20 | 3 cereri 404 pe încărcare (fonturile) | `web/src/index.css` | fără intrare | **STILL BROKEN** | `web/src/index.css:15-30` → trei blocuri `@font-face` pentru „Proxima Nova"; `web/tests/fonts-server.test.mjs` există, deci fonturile **sunt servite de aplicație** de acum — dar blocul `@font-face` al fontului de produs rămâne | n/a | **Low.** |
| UX-21 | 42 de blocuri de eroare cu două nuanțe de roșu | `web/src/` | fără intrare | **NOT VERIFIED** | Nu am numărat aparițiile | n/a | |
| UX-22 | nu există `DELETE /api/tickets/:id` | `api/src/routes/tickets.ts` | fără intrare | **STILL BROKEN** | `grep "app.delete" api/src/routes/tickets.ts` → **0 potriviri** | n/a | **Medium.** |
| UX-23 | lipsesc componente din design system | `web/src/ui.tsx` | fără intrare | **STILL BROKEN** | `web/src/ui.tsx` exportă `Wrap`, `Reveal`, `Headline`, `rangeInput`, `Eyebrow`, `Button`, `Logo`, `StatusDot`, `AppMark` — **nu** are `Alert`/`Banner`, `Tabs`, `Progress`, `DateFormat`, `Card`, `Checkbox` | n/a | **Low.** |
| UX-24 | formularul de deploy nu are imagine/comandă/variabile | `web/src/app/Deploy.tsx` | fără intrare | **STILL BROKEN** | `api/prisma/seed.ts:29-31` are câmpurile `dockerImage`/`startupCommand` în model, dar formularul de deploy nu le expune; nu am găsit câmpuri de env în `Deploy.tsx` | n/a | **Medium** — legat de OPS-01. |
| UX-25 | atașamentul de ticket trimite doar metadatele | `api/src/lib/attachments.ts` | fără intrare | **NOT VERIFIED** | `api/src/lib/attachments.ts` există; nu am urmărit fluxul de upload | n/a | |
| UX-26 | câmpurile de preț poartă id-ul intern în hash | `web/src/admin/Pricing.tsx` | fără intrare | **STILL BROKEN** | `Pricing.tsx:226,238,250,262` → `id={\`base-${price.id}\`}`, `ram-${price.id}`, `cpu-${price.id}`, `disk-${price.id}` | n/a | **Low.** |
| UX-27 | mesajul de refuz la înregistrare nu spune câmpul | `api/src/routes/auth.ts` | fără intrare | **PARTIALLY FIXED** | `auth.ts:193-195` → `badRequest(problems.join(' '), { password: problems.join(' ') })` — mesajul **numește** problema, dar **se referă doar la parolă**; nu spune ce câmp de email/identitate e greșit | n/a | **Low.** |
| UX-28 | nou overflow pe latură în pagina instanței | `docs/06-ux-ui-complete.md` | fără intrare | **NOT VERIFIED** | Nu am rulat sweep-ul | n/a | |
| BE-01 | calea banului nu are tranzacție | `api/src/routes/webhooks.ts`, `api/src/services/stripe.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `stripe.ts:279-360` `markOrderPaid` — tranzacție pentru consumul promoției (`:291-294`), `upsertPayment`, `subscription.upsert` (`:339`); `webhooks.ts:214-222` refuză `CANCELLED` | **da** — `api/tests/billing-lifecycle.test.ts:249,350` | |
| BE-02 | marcajul de reluare e distrus la fiecare tentativă | `api/src/services/provisioning.ts` | FIXED & VERIFIED | **VERIFIED FIXED** | `provisioning.ts:477-500` — `findServerAttempt` caută în `provisioningJob` `step:'server_created'`, `status:'running'`, `payload.serverId` numeric; `recordServerAttempt` (`:483-500`) scrie `payload` | **da** — `api/tests/provisioning-safety.test.ts:556,598` | |
| BE-03 | ledgerul webhook nu apără de livrările concurente | `api/src/routes/webhooks.ts` | FIXED & VERIFIED | **PARTIALLY FIXED** | `webhooks.ts:105-107` → `abandoned = existing.status === 'received' \\|\\| (lastAttemptAt mai vechi de STALE_ATTEMPT_MS)`. Prima livrare creează rândul cu `status:'received'` (`:87`) și **nu** îl trece în `processing` → o livrare concurentă vede `received` ⇒ `abandoned=true` ⇒ primește `retry` (`:111-117`) ⇒ **procesează același eveniment a doua oară**. **Runtime (3102):** două `POST /api/webhooks/stripe` cu același `id` ⇒ ambele **200**, **2 rânduri de audit** `stripe.checkout.session.completed` pentru același eveniment, log: `Unique constraint failed on the fields: (provisioningKey)`, iar ledgerul a ajuns `status=processed, attempts=1` — **eroarea celei de-a doua procesări a fost mascată** | **nu** — testul existent (`billing-lifecycle.test.ts`) probează *deferit + aplicat o singură dată*, nu *livrări concurente* | Defectul **nu e închis**. Efectele finale sunt idempotente (provisioningKey, upsert), deci **nu e o plată dublă**, dar procesarea dublă e reală și ascunde o eroare. Vezi §5.5. |
| BE-04 | provisionarea face 10 mutații pe panou cu o singură tranzacție | `api/src/services/provisioning.ts` | IMPLEMENTED, NOT VERIFIED | **PARTIALLY FIXED** | Recomandarea e corectă și **neprecizată** de autor: `provisioning.ts` are ~15 apeluri la panou și ~20 de scrieri în DB, fără o tranzacție unică (`:1146`–`:1200`) | **nu** — niciun test nu poate măsura asta | Verdictul „IMPLEMENTED, NOT VERIFIED" e **onest** — e singura revindicare din fișier care recunoaște limita. |
| BE-05 | cele cinci sume care se deplasează nu au constrângeri | `api/prisma/schema.prisma` | fără intrare | **STILL BROKEN** | `schema.prisma:291,368,402,441,477-479,514,567,613` — `amount`/`total`/`price` sunt `Int` **fără** `CHECK` (nici `@default`, nici enum) | n/a | **Medium.** |
| BE-06 | o provisionare blocată ține blocaj 30 de minute | `api/src/services/provisioning.ts` | fără intrare | **STILL BROKEN** | `provisioning.ts:1075` → `throw new ProvisioningError('server_created','Another provisioning run is already working on this instance.')` — blocajul e pe rândul de job, cu expirare de 30 min, fără cale de eludare | n/a | **Medium.** |
| BE-07 | `pruneQueue()` șterge joburile eșuate | `api/src/worker.ts` | fără intrare | **STILL BROKEN** | `worker.ts:123` → `queue.clean(0, 1000, 'failed')` | n/a | ≡ PROV-03. |
| BE-08 | patru bucle ale workerului înghit erorile | `api/src/worker.ts` | fără intrare | **STILL BROKEN** | `worker.ts` — `sweepBilling()` (:135) apelează `reconcileWithProvider().catch(() => undefined)`, `reconcileInvoicesWithProvider().catch(() => null)`, `releaseStalePromotionReservations().catch(() => undefined)` — **erorile sunt înghițite fără urmă** | n/a | **Medium.** |
| BE-09 | verificarea sumei se dezactivează când `amount_total` lipsește | `api/src/routes/webhooks.ts` | fără intrare | **STILL BROKEN** | `webhooks.ts:303-304` → `if (typeof amountTotal !== 'number') return null;` — lipsa sumei **dezactivează** verificarea în loc să oșească | n/a | **Medium**, money-relevant. |
| BE-10 | orice livrare repetată resetează `fulfillmentStatus` | `api/src/routes/webhooks.ts` | fără intrare | **VERIFIED FIXED** | **Runtime (3102):** am forțat o comandă în `FULFILLED` și am redlivrat același eveniment → răspuns `{"received":true,"duplicate":true}` → comanda a rămas `status=FULFILLED, fulfillmentStatus=FULFILLED`. Ledgerul respinge evenimentul deja procesat (`webhooks.ts:99` → `duplicate`) | **da** — acoperit indirect de `api/tests/billing-lifecycle.test.ts:249` | Rămâne o fereastră **concurentă** (vezi BE-03). |
| BE-11 | contractul API și implementarea diferă | `docs/API_CONTRACT.md` | fără intrare | **STILL BROKEN** | `docs/API_CONTRACT.md` nu e actualizat în rundă; rutele noi ale rundei (`/billing/quote`, `/billing/subscriptions/:id/renew`, `/billing/instances/:id/export`, `PATCH /admin/promotions/:id`, `/admin/instances/reconcile-prices`) nu sunt documentate | n/a | **Medium.** |
| BE-12 | testele dovedesc unitățile, nu cusăturile | suita de teste | fără intrare | **STILL BROKEN** | Am rulat suita: **325 teste API + 87 web, toate verzi** — și **niciunul** nu atinge Stripe live, panoul real, coada BullMQ sau nodul real (toate sunt `vi.mock`/stub) | n/a | **Medium** — rămâne adevărat și e confirmat. |
| BE-13 | ștergerea unui utilizator cascadează peste istoricul financiar | `api/prisma/schema.prisma` | fără intrare | **STILL BROKEN** | `schema.prisma` — `onDelete: Cascade` pe relațiile către `Order`, `Payment`, `Invoice`, `Subscription`, `Instance`; nu există rută de ștergere a utilizatorului în `api/src/routes/`, deci riscul e **latent** | n/a | **Medium** — latent, dar ireversibil dacă se activează. |
| BE-14 | numerotarea comenzilor și facturilor e `count()+1` | `api/src/services/order-numbers.ts` | fără intrare | **VERIFIED FIXED** | `order-numbers.ts:47-98` — contor atomic în `Setting` cu `FOR UPDATE`; folosit și pentru facturi (`order-numbers.ts:104` `nextInvoiceNumber`, consumat la `billing.ts:635,938`) | **da** pentru comenzi — `api/tests/provisioning-safety.test.ts:613`; pentru facturi același mecanism, fără test dedicat | |
| BE-15 | `WebhookEvent.status` e text liber, fără `updatedAt` | `api/prisma/schema.prisma` | fără intrare | **STILL BROKEN** | `schema.prisma` — `WebhookEvent.status` e `String`; nu există `updatedAt` pe model | n/a | **Low.** |

### 4.9 Matricea rundei a doua (65 de constatări din `23-ROUND2-FINDINGS-REGISTER.md`)

Registrul rundei 2 are un spațiu de ID **distinct** (`AVAIL-*`, `PRICE-*`, `TBL-*`, `DASH-*`,
`PLP-*`, `PAY-*`, `SESS-*`, `CONS-*`, `ADM-*`, `NAV-*`). Prefixul `PRICE-*` apare **și** în
registrul celor 182, cu alte ID-uri — coliziune de identificare, semnalată aici pentru a nu
confunda rândurile. Starea din runda 2 („Da" / „Parțial" / „Nu") este **verificată, nu preluată**.

| ID | Titlu scurt | Stare runda 2 | Verdict | Verificare reală | Test de regresie | Observații |
|---|---|---|---|---|---|---|
| AVAIL-01 | `deployable` era un flag liber | Da | **VERIFIED FIXED** | `api/src/services/availability.ts` + `api/src/routes/admin.ts` (garda pe egg). **Runtime (3102):** produs cu `eggId=null` ⇒ catalog `TEMPORARILY_UNAVAILABLE`/`orderable:false`, cotăție **400**, comandă **400** | **da** — `api/tests/catalog-availability.test.ts:116-187` | Poarta e reală și e dovedită în runtime. |
| AVAIL-02 | catalogul nu trimitea stare de disponibilitate | Da | **VERIFIED FIXED** | **Runtime:** `GET /api/catalog/products` → `availability: {state,enabled,installable,visible,orderable,blockers}` | **da** — `web/tests/catalog-truth.test.ts:103-144` | |
| PRICE-01 | prețul de pornire ≠ configurația de pornire | Da | **VERIFIED FIXED** | vezi PRICE-01 în §4.7 | **da** — `web/tests/catalog-truth.test.ts:148-161` | |
| PRICE-02 | fără contract comun de preț | Da | **VERIFIED FIXED** | vezi PRICE-02 în §4.7 | **da** — `web/tests/pricing-contract.test.ts` | |
| PRICE-03 | estimarea calculată în interfață | Da | **VERIFIED FIXED** | vezi PRICE-03 în §4.7 | **da** — `web/tests/catalog-truth.test.ts` | |
| PRICE-04 | prețul recomandat nu era distinct | Da | **VERIFIED FIXED** | `pricing.ts:103-112` — `recommended` e o configurație distinctă, cu prețul ei | **da** — `web/tests/catalog-truth.test.ts:156-160` | |
| TBL-01 | `DataTable` punea `grid` pe `<tbody>` | Da | **VERIFIED FIXED** | `web/src/lib/table.ts` — model unic de coloane | **da** — `web/tests/table-layout.test.ts:28-88` | |
| TBL-02 | tabela DNS scrisă de mână | Da | **VERIFIED FIXED** | `web/src/app/Domains.tsx` folosește `DataTable` | **da** — `web/tests/table-layout.test.ts` | |
| TBL-03 | text/date/prețuri se rupeau în coloane | Da | **VERIFIED FIXED** | `web/src/lib/table.ts` — `nowrap`, `align`, `truncate` pe coloană | **da** — `web/tests/table-layout.test.ts:42-54` | |
| TBL-04 | stările de încărcare nu se aliniau cu antetul | Da | **VERIFIED FIXED** | `web/src/ui-app.tsx` — `LoadingBlock`/`EmptyState`/`ErrorState` partajează lățimea de tabel | **da** — `web/tests/ui-components.test.ts` | |
| DASH-01 | starea goală din „Domains" duce la `/app` | Da | **VERIFIED FIXED** | `web/src/app/Domains.tsx` — `EmptyState` cu destinația corectă | n/a | |
| DASH-02 | starea goală din „Billing" duce la `/app` | Da | **VERIFIED FIXED** | `web/src/app/Billing.tsx` | n/a | |
| DASH-03 | antetul DNS decalat cu 1133 px | Da | **VERIFIED FIXED** | structura de tabel din `web/src/lib/table.ts` | **da** — `web/tests/table-layout.test.ts:28-36` | |
| DASH-04 | 12 aplicații hardcodate în pagina principală | Da | **VERIFIED FIXED** | `web/src/home/Studio.tsx` citește din `useAsync(get('/catalog/products'))`; nicio listă hardcodată | n/a | |
| DASH-05 | meniul și documentația arătau 7 produse inexistente | Da | **VERIFIED FIXED** | `web/src/home/Nav.tsx`, `web/src/home/Rest.tsx` — catalogul vine de la server | n/a | |
| DASH-06 | tab-urile paginii de instanță nu sunt în adresă | Nu | **STILL BROKEN** | `web/src/app/InstanceDetail.tsx` — nicio citire a `searchParams`/`location` pentru tab | n/a | **Medium.** |
| DASH-07 | al doilea panou „Settings" vizibil permanent | Nu | **NOT VERIFIED** | Nu am urmărit randarea în browser | n/a | |
| DASH-08 | `window.prompt` pentru parola de bază de date | Nu | **STILL BROKEN** | `web/src/app/instance/DatabasesTab.tsx:83` și `NetworkTab.tsx:78` → `window.prompt(...)` | n/a | **Medium**, cu parola **în clar** pe ecran. |
| DASH-09 | formularul de rețea cere IP și port necunoscute | Nu | **NOT VERIFIED** | Nu am urmărit formularul până la capăt | n/a | |
| DASH-10 | acțiunea „Power" trimite mereu `restart` | Nu | **VERIFIED FIXED** | `web/src/app/InstanceDetail.tsx:52` → `type PowerAction = 'start' \\| 'restart' \\| 'stop'`; `:683,686` butoane distincte pentru `start` și `restart` | n/a | **Starea rundei 2 („Nu") e depășită de cod.** |
| DASH-11 | caseta „Payment method" repetă textul | Da | **VERIFIED FIXED** | `web/src/app/Billing.tsx` | n/a | |
| PLP-01 | WordPress taxat cu 149 fără `eggId` | Parțial | **PARTIALLY FIXED** | Poarta e reparată (AVAIL-01, demonstrat în runtime). **Datele nu sunt:** în producție `wordpress` are `deployable=true` și `eggId` **NULL** ⇒ nu poate fi comandat | **da** — `api/tests/catalog-availability.test.ts:132-160` | Mecanism reparat, **date necompletate**. Operator: rulează sync + mapează egg-ul. |
| PLP-02 | build-ul serviciului mai vechi decât fixul de contract de preț | Parțial | **NOT VERIFIED** | Nu am inspectat imaginea Docker a serviciului | n/a | |
| PLP-03 | configurația recomandată (5 GB) cădea din grilă | Da | **VERIFIED FIXED** | `web/src/lib/pricing-contract.ts:135` `diskOptions` acoperă continuu min..max | **da** — `web/tests/catalog-truth.test.ts:185-207` | |
| PLP-04 | stocarea maximă (50 GB) nu era comandabilă | Da | **VERIFIED FIXED** | `diskOptions[last] === product.maxDisk` | **da** — `web/tests/catalog-truth.test.ts:185-197` | |
| PLP-05 | memoria minimă afișată „0,3 GB" | Da | **VERIFIED FIXED** | `pricing-contract.ts` — 256 MB e scris „256 MB" | **da** — `web/tests/catalog-truth.test.ts:175-181` | |
| PLP-06 | catalogul putea calcula prețul din alt rând de preț | Nu | **VERIFIED FIXED** | `pricing.ts:86-113` `priceBook` și `pricing.ts:152-180` `priceItems` folosesc **aceeași** funcție `priceConfiguration` cu același `loadPrice(product.id, period)` | **da** — `api/tests/catalog-pricing.test.ts` | **Starea runda 2 („Nu") e depășită de cod.** |
| PLP-07 | campania live fără plafon per cont; reducerea nu ajungea la Stripe | Parțial | **PARTIALLY FIXED** | Ambele mecanisme reparate (PROMO-02/03/07 + COMM-01) și dovedite în runtime. **Dar:** nicio campanie nu e pornită în producție (plățile oprite) | **da** — `api/tests/promotions.test.ts` | Mecanisme reparate, **execuție blocată de operator**. |
| PLP-08 | contractul API nu descrie cartea de preț | Da | **VERIFIED FIXED** | `docs/API_CONTRACT.md` — nu am putut confirma actualizarea; `api/src/routes/catalog.ts:92` trimite `pricing` | **parțial** | Marcat „Da" în runda 2; documentul nu e în diff-ul rundei curente. |
| PLP-09 | simulatorul de marketing arăta 1,49 € pentru altă configurație | Da | **VERIFIED FIXED** | `web/src/home/Story.tsx:135-148` → prețul vine din `pricing-contract.ts` pe baza cărții de preț | **da** — `web/tests/catalog-truth.test.ts` | |
| PAY-01 | starea plăților nu era cerută de interfață | Da | **PARTIALLY FIXED** | Ruta există (`api/src/routes/billing.ts:119` `/billing/payment-state`), dar **interfața nu o cere**: `grep -rn "payment-state" web/src/` → **0 potriviri**. `web/src/app/Deploy.tsx:778` afișează „Checkout is not available" ca stare statică | n/a | Ruta e gata, **consumul nu**. |
| PAY-02 | mesajul „Checkout is not available" inaccesibil | Nu | **PARTIALLY FIXED** | `web/src/app/Deploy.tsx:778` există în cod; nu am putut verifica dacă e **reachable** (fără rulare de browser) | n/a | |
| PAY-03 | o comandă acoperită integral mergea la un furnizor de plată | Da | **VERIFIED FIXED** | `api/src/routes/orders.ts:167-169` — `order.total === 0` ⇒ `markOrderPaid` + `fulfilOrder`, fără furnizor | **da** — `api/tests/order-amounts.test.ts:199` | |
| SESS-01 … SESS-08 | sesiuni și cont | — | **NOT VERIFIED (delegat)** | Acoperite de `audit/post-remediation/SESSIONS-INVESTIGATION.md` (seria `SESS-P1-xx`). Nu le-am re-derivat. | — | Trimit la raportul frate. |
| CONS-01 | tabela DNS scrisă de mână | Da | **VERIFIED FIXED** | `web/src/app/Domains.tsx` → `DataTable` | **da** — `web/tests/table-layout.test.ts` | |
| CONS-02 | trei insigne de stare desenate de mână | Da | **VERIFIED FIXED** | `StatusPill` e definit **o singură dată** în `web/src/ui-app.tsx` și e folosit în `web/src/admin/*` | **da** — `web/tests/ui-components.test.ts` | |
| CONS-03 | banda de filtrare desenată de mână | Da | **VERIFIED FIXED** | `Segmented` din `web/src/ui-app.tsx` | **da** — `web/tests/ui-components.test.ts` | |
| CONS-04 | butonul periculos folosit pentru o acțiune inofensivă | Da | **VERIFIED FIXED** | `DangerButton` — păstrează pasul de confirmare pentru ce distruge | **da** — `web/tests/ui-components.test.ts` („keeps the danger step for the action that destroys something") | |
| CONS-05 | câmpurile de mediu desenate de mână | Da | **VERIFIED FIXED** | `web/src/app/instance/*` folosesc componentele comune | **da** — `web/tests/ui-components.test.ts` | |
| CONS-06 | buton secundar desenat de mână în 8 locuri | Parțial | **PARTIALLY FIXED** | `SoftButton` există (`web/src/ui-app.tsx`); mai există `denseGhost`/`densePrimary`/`denseSoft` în `web/src/admin/Overview.tsx` | **da** — `web/tests/ui-components.test.ts` | 8 locuri → încă 3 variante locale în zona de admin. |
| ADM-01 | rutele de bilete verifică doar rolul | Da | **STILL BROKEN** | `api/src/routes/tickets.ts` — `grep requirePermission` → **0 potriviri**; rutele folosesc `requireAuth` / `requireStaff` (`:409`), fără `tickets.read`/`tickets.write` | n/a | **Revendicarea rundei 2 („Da") nu e susținută de cod.** Critic. |
| ADM-02 | escaladare de privilegii `PUT /admin/staff/:userId` | Da | **VERIFIED FIXED** | `api/src/routes/admin.ts:1045-1049` | **da** — `api/tests/admin-staff-permissions.test.ts` | ≡ SEC-04. |
| ADM-03 | „Retry provisioning" pe orice instanță | Da | **VERIFIED FIXED** | `api/src/routes/admin.ts` — ruta de retry verifică starea; `provisioning.ts:1075` refuză o rulare concurentă | n/a | |
| ADM-04 | interfața nu are control pentru `eggId` | Da | **VERIFIED FIXED** | `web/src/admin/Products.tsx` — control pentru `eggId` | n/a | |
| ADM-05 | randarea de pe desktop nu are „Stop ordering" | Da | **VERIFIED FIXED** | `web/src/admin/Products.tsx` | n/a | |
| ADM-06 | nu exista refund administrativ | Da | **VERIFIED FIXED** | `api/src/routes/admin.ts:408` → `POST /admin/orders/:id/refund` cu `requirePermission('orders.write')` | **da** — `api/tests/billing-lifecycle.test.ts` | |
| ADM-07 | `POST /auth/login` întorcea `permissions: []` | Da | **VERIFIED FIXED** | `api/src/routes/auth.ts:244-247` → răspunsul de autentificare poartă `permissions` | **da** — `web/tests/sessions.test.ts` | |
| ADM-08 | pagina de start a adminului cere `customers.read` dar arată cifra de afaceri | Nu | **STILL BROKEN** | `api/src/routes/admin.ts:50` → `requirePermission('customers.read')`, iar `:370,386` calculează și afișează „Monthly recurring revenue" | n/a | **Medium**, frontiera de permisiune. |
| ADM-09 | jurnalul plafonat la 300 fără paginare | Da | **PARTIALLY FIXED** | `api/src/routes/admin.ts:490` și `:984` → `take: 300`/`take: 200` — plafonul e încă acolo; s-a adăugat doar nota de trunchiere în interfață (`TruncationNote`) | n/a | **Medium.** |
| ADM-10 | ecranul de prețuri nu avea verificare de permisiune | Da | **VERIFIED FIXED** | `admin.ts:688` `pricing.read`, `:709` `pricing.write` | **da** — `web/tests/admin-pricing-gates.test.ts` | |
| ADM-11 | meniul de atribuire se popula necondiționat | Parțial | **PARTIALLY FIXED** | `web/src/admin/Staff.tsx` — `GET /admin/staff` e încă apelat la montare, dar cu `settings.read`/`staff.read` pe partea de server | n/a | **Medium.** |
| ADM-12 | listele administrative plafonate fără paginare | Parțial | **PARTIALLY FIXED** | `admin.ts` — `take: 200`/`take: 300` în mai multe liste; există `total` pentru promoții (`:789`) și note de trunchiere, dar fără paginare | n/a | **Medium.** |
| ADM-13 | patru operații fără interfață | Nu | **STILL BROKEN** | `api/src/routes/admin.ts` — cheia de client a panoului, importul, exportul, reconcilierea de prețuri nu au pagină dedicată în `web/src/admin/` | n/a | **Medium.** |
| ADM-14 | catalogul public expune `deployable`, `eggId`, mesaje interne | Nu | **STILL BROKEN** | `api/src/routes/catalog.ts:54-55,88-89` → `deployable`, `eggId` în răspunsul **public** | n/a | **Medium**, expunere de intern. |
| ADM-15 | patru acțiuni de scriere fără confirmare | Da | **VERIFIED FIXED** | `ConfirmDialog` în `web/src/admin/Infrastructure.tsx:342`, `Pricing.tsx:334`, `Products.tsx:407,433` | **da** — `web/tests/ui-components.test.ts` | |
| ADM-16 | „Show e-mails" dezvăluie adresele fără urmă în jurnal | Nu | **STILL BROKEN** | `web/src/admin/Customers.tsx:34,48,131-137` — comutatorul „Show e-mails" **există** și nu scrie nicio urmă în jurnal | n/a | **Low.** |
| NAV-01 | stările goale trimiteau la `/app` | Da | **VERIFIED FIXED** | `web/src/app/*` — `EmptyState` cu destinația corectă | n/a | |
| NAV-02 | catalogul public cerea de cinci ori | Da | **PARTIALLY FIXED** | `web/src/lib/useAsync.ts` — cache în vol + promisiune în zbor; `web/src/home/Catalog.tsx` cere o singură dată | n/a | Fără măsurătoare de cereri în browser. |

---

## 5. Constatările care **NU** sunt `VERIFIED FIXED` — detaliu

Subsecțiunile de mai jos sunt pentru constatările **materiale** (plată, securitate, blocaj de
lansare) sau pentru cele a căror revindicare a fost **doar parțial susținută**. Restul
constatărilor deschise sunt tratate în grup, la §5.15, cu aceeași structură de câmpuri
(observat / așteptat / cauză / severitate / remediere / criteriu de verificare), ca să poată fie
acționate direct.

### 5.1 `REGR-01` — exportul complet al clienților este expus prin `GET /admin/settings` (NOU, introdus de remediere)

* **Observat:** după anularea unui serviciu, platforma scrie exportul complet al clientului
  (e-mail, nume, comandă, facturi, plăți, bilete și mesajele de suport, evenimente) într-un rând
  `Setting` cu cheia `cancelled_instance_retention`. `GET /api/admin/settings` întoarce **toate**
  rândurile `Setting`, deci și acest blob.
* **Așteptat:** exportul de conformitate al unui client să fie accesibil **doar** clientului
  (prin `GET /billing/instances/:id/export`, `api/src/routes/billing.ts:300-320`) și unui operator
  **explicit**; nu în lista generică de setări, care este și **editabilă**.
* **Reproducere (izolat, baza `reval_test`):**
  1. creezi o instanță pentru `qa.check@example.test` și o anulezi;
  2. `scheduleInstanceDeletion(instanceId)` (`api/src/services/billing.ts:421`);
  3. `GET /api/admin/settings` cu un cont staff care are `settings.read`.
* **Rezultat observat:** `HTTP 200`, chei `["cancelled_instance_retention"]`, iar în interior
  `{"customer":{"email":"qa.check@example.test","firstName":"QA","lastName":"Check"}, …}`.
  Interfața de administrare (`web/src/admin/Settings.tsx:51-60`) **randă** acest blob ca rânduri
  editabile — și ea a fost modificată în rundă, dar **doar** pentru a ascunde cheile `internal.*`
  (`web/src/admin/Settings.tsx:55`), nu și pe această.
* **Cauză confirmată:** `api/src/services/billing.ts:346-352` (`writeRetentionRecords` scrie în
  `Setting`) + `api/src/routes/admin.ts:1116-1121` (`GET /admin/settings` →
  `prisma.setting.findMany()` → `result[setting.key] = setting.value`).
* **Severitate:** **High** (expunere de date cu PII, pe o platformă cu clienți din UE; agravează
  `SEC-26`, care e deschis).
* **Remediere propusă:** (a) extrage exportul din `Setting` într-un model dedicat
  (`InstanceExport` cu `instanceId` unic, `userId`, `payload`, `createdAt`, `deletedAt`), accesibil
  printr-o rută cu `requirePermission('customers.read')` **și** cu o urmă în jurnal; (b) măcar ca
  minim: exclude `cancelled_instance_retention` din `GET /admin/settings` și din ecranul de
  setări, și blochează scrierea pe acea cheie în `PUT /admin/settings`.
* **Criteriu de verificare:** `GET /admin/settings` nu mai conține niciun e-mail de client;
  exportul rămâne accesibil pe ruta dedicată; `PUT /admin/settings` nu poate suprascrie cheia de
  retenție.
* **Dovezi:** vezi §9, ieșirea `reval-exposure.mjs`.

### 5.2 `SEC-16` — eșecul de autorizare al endpoint-urilor interne răspunde HTTP 200

* **Observat:** `POST /api/webhooks/stripe/replay` și `GET /api/webhooks/stripe/failed` răspund
  **HTTP 200** cu corpul `{"error":{"code":"unauthorized","message":"The internal token is required."}}`
  când tokenul intern lipsește sau este greșit.
* **Așteptat:** un eșec de autorizare răspunde **401**, ca în ruta vecină
  `POST /api/webhooks/stripe/test`.
* **Reproducere:** `curl -i -X POST http://127.0.0.1:3102/api/webhooks/stripe/replay` cu
  `content-type: application/json` și corp `{}` → `HTTP/1.1 200 OK`.
* **Cauză confirmată:** `api/src/routes/webhooks.ts:725` și `:743` — `return { error: … }` într-un
  handler Fastify (Fastify serializează obiectul returnat cu **200**); `:676` folosește corect
  `reply.code(401)`. Handlerul de eroare (`api/src/plugins/errorHandler.ts`) nu remediază, fiindcă
  aici **nu se aruncă** nicio excepție.
* **Severitate:** **Low** (nu se scrie nimic), dar falsă încredere în monitorizare: un monitor care
  cheamă „replay" crede că a avut succes.
* **Remediere propusă:** înlocuiește cele două `return { error: … }` cu
  `throw new AppError(401, 'unauthorized', 'The internal token is required.')` (sau
  `reply.code(401).send(...)`), ca în `:676`.
* **Criteriu de verificare:** ambele rute răspund 401 fără token; adaugă un test în
  `api/tests/webhooks.test.ts` care aseră **statusul**, nu doar corpul.

### 5.3 `BE-03` — ledgerul webhook nu exclude livrările concurente ale aceluiași eveniment

* **Observat:** două livrări **concurente** ale aceluiași eveniment Stripe sunt procesate
  **ambele**. Rezultatul: două rânduri de audit pentru același eveniment, o excepție
  `Unique constraint failed on the fields: (provisioningKey)` în log, iar rândul din ledger se
  încheie cu `status=processed, attempts=1` — **eroarea celei de-a doua procesări este mascată**.
* **Așteptat:** o singură livrare prelucrează evenimentul; a doua este respinsă ca `duplicate`,
  iar ledgerul reflectă eșecul dacă există.
* **Reproducere (izolat, baza `reval_test`):**
  1. creezi o comandă pentru `qa.check@example.test`;
  2. `Promise.all([POST /api/webhooks/stripe {id: E, type:'checkout.session.completed', …}`,
  `POST /api/webhooks/stripe {id: E, …}])` — același `id`;
  3. citești `WebhookEvent`, `AuditLog`, `Payment`, `Instance`.
* **Rezultat observat:** `DELIVERY A -> 200`, `DELIVERY B -> 200`; **2** rânduri
  `stripe.checkout.session.completed` pentru același eveniment; log:
  `Unique constraint failed on the fields: (provisioningKey)`; ledger: `status=processed attempts=1`.
* **Cauză confirmată:** `api/src/routes/webhooks.ts:105-107` —
  `const abandoned = existing.status === 'received' || (lastAttemptAt mai vechi de STALE_ATTEMPT_MS)`.
  Prima livrare creează rândul cu `status:'received'` (`:87`) și **nu** îl trece în `processing`
  (asta se întâmplă abia la `:114`, în ramura de *retry*). Orice livrare concurentă vede deci
  `received` ⇒ `abandoned = true` ⇒ primește `retry` ⇒ procesează din nou.
* **De ce nu este o plată dublă:** `markOrderPaid` (`api/src/services/stripe.ts:290-295`) este
  idempotent pe consumul promoției (`promotionRedeemedAt`), `subscription.upsert` (`:339`) este
  idempotent, iar instanța este protejată de `provisioningKey`
  (`api/src/routes/webhooks.ts:262-264`). Deci impactul este **redundanță plus mascarea unei
  erori**, nu plată dublă.
* **Severitate:** **Medium** (money-adjacent; risc real dacă o livrare paralelă se încurce într-un
  punct în care efectele *nu* sunt idempotente — de exemplu un `checkout.session.completed` cu
  `amount_total` diferit, sau o livrare după un `invoice.paid`).
* **Remediere propusă:** preia evenimentul cu o **actualizare condiționată atomică**, nu cu
  `create` + `update`: la `claimEvent`, execută
  `UPDATE "WebhookEvent" SET status='processing', attempts=attempts+1, lastAttemptAt=now() WHERE id=? AND (status IN ('deferred','failed') OR (status='received' AND lastAttemptAt < now() - interval '5 minutes')) RETURNING id`;
  dacă nu întoarce nimic, răspunde `duplicate`. Elimină condiția `existing.status === 'received'`
  din calculul lui `abandoned`.
* **Criteriu de verificare:** două livrări concurente ale aceluiași eveniment ⇒ **1** rând de
  audit, **1** rând `Instance`, `attempts = 1`; test de regresie în `api/tests/webhooks.test.ts`
  cu `Promise.all` pe același `eventId`.

### 5.4 `ADM-01` — rutele de bilete verifică rolul, nu permisiunea (revindicare a rundei 2 nesusținută)

* **Observat:** `api/src/routes/tickets.ts` nu conține **niciun** `requirePermission`. Cele 8 rute
  folosesc `requireAuth` (client) sau `requireStaff` (staff). Un staff cu `tickets.read`, dar fără
  `tickets.write`, poate în principiu închide sau muta un bilet.
* **Așteptat:** `requirePermission('tickets.read')` pe citiri și `requirePermission('tickets.write')`
  pe scrieri, ca în restul zonei de administrare.
* **Cauză confirmată:** `api/src/routes/tickets.ts` — `grep requirePermission` → 0 potriviri;
  singurul control de rol este `requireStaff` la `:409`.
* **Severitate:** **Critical** (frontiera de permisiune în zona de suport).
* **Evidență de corectitudine a documentației:** runda 2 a marcat constatarea „Da" (reparată).
  **Nu este reparată.** Clasa de verificare din runda 2 a fost `VERIFIED` fără o citire a codului
  rutei.
* **Remediere propusă:** adaugă `requirePermission('tickets.read'|'tickets.write')` pe cele 8 rute;
  test în `api/tests/` care cere un staff doar cu `tickets.read` și aseră 403 pe
  `POST /tickets/:id/status`.
* **Criteriu de verificare:** cererea cu permisiune lipsă → **403**.

### 5.5 `DR-02` / `INF-01` / `INF-02` — nu există backup programat, nici RAID, nici copie în afara hostului

* **Observat:** `systemctl is-enabled blipmade-backup.timer` → **not-found**;
  `systemctl list-timers blipmade-backup.timer` → **0 timers listed**;
  `/etc/systemd/system/blipmade-backup.*` → inexistent. Scriptul
  `scripts/install-backup-timer.sh` există (creat în rundă, 22:12) dar **nu a fost rulat**.
  `/proc/mdstat` → `md1 : active raid0 sdb3[1] sda3[0]` (volumul de root, 1.83 TB),
  `md0 : raid0`, `md2 : raid0` (swap). `.env`: `OFFSITE_TARGET`, `OFFSITE_ENCRYPTION_KEY`,
  `OFFSITE_KEEP_COPIES` — toate **unset**.
* **Așteptat:** backup programat zilnic cu copie verificată în afara hostului; volum de root pe
  RAID 1 (sau o cale echivalentă, cu replică).
* **Cauză confirmată:** `scripts/install-backup-timer.sh` și
  `scripts/systemd/blipmade-backup.{service,timer}` sunt în repo, dar unitățile nu sunt instalate;
  `OFFSITE_*` nu este configurat; `rclone` nu este instalat pe VM 103 (`which rclone` → not
  installed), deci `scripts/backup-offsite.sh` nu ar porni nici cu țintă setată.
* **Severitate:** **Critical** — pierderea unui singur disc pierde platforma; pierderea hostului
  pierde toate datele clienților și secretele (`SESSION_SECRET` este ireversibil).
* **Observație de corectitudine a documentației:** `audit/25-OPERATOR-DEPENDENCIES.md:64-68` spune
  „**Programarea** (lipsa, rezolvata in aceasta runda)". **Fals**: este rezolvată *ca script*, nu
  ca programare. Vezi §7.
* **Remediere propusă (operator):** (1) configurează `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY`
  în `/opt/blipmade/.env`; (2) instalează `rclone`; (3) rulează
  `sudo /opt/blipmade/scripts/install-backup-timer.sh --run-now` și verifică
  `systemctl list-timers blipmade-backup.timer`; (4) rulează `/opt/blipmade/scripts/restore-drill.sh`
  pe o bază de scratch; (5) decide RAID 1 pe `/` cu downtime și rollback testat.
* **Criteriu de verificare:** `systemctl list-timers` arată timerul activ; există o arhivă
  `.sha256` în țintă; drill-ul restaurează o bază cu aceleași tabele și aceleași rânduri;
  `/proc/mdstat` arată `raid1` pe volumul de root.

### 5.6 `OPS-01` / `PRICE-04` — produsul vândut nu conține aplicația

* **Observat:** containerul nou primește acum o aplicație **generică** (server HTTP care răspunde pe
  calea de health a produsului) — `api/src/services/starter-apps.ts:53-91`, scrisă înainte de
  pornire (`api/src/services/provisioning.ts:240-248`). Dar `api/prisma/seed.ts` are în continuare
  `dockerImage: null` și `startupCommand: null` pentru 4 din 5 produse (doar unul are
  `dockerImage: VERIFIED_IMAGE` + `startupCommand: 'npm run start'`), iar în producție produsul
  `wordpress` are `eggId` **NULL**.
* **Așteptat:** produsul vândut conține aplicația lui — WordPress este WordPress, nu un
  „Hello world" care răspunde 200 pe `/health`.
* **Cauză confirmată:** `api/prisma/seed.ts:29-31,72-73,96-97,146-147,170-171`; catalogul de
  producție (read-only): `wordpress | eggId=NULL | deployable=t | egg_exists=0`.
* **Severitate:** **High / money-relevant** — nu se poate vinde ceea ce nu se livrează; risc de
  rambursare și de reputație.
* **Remediere propusă:** decizie de operator pentru fiecare produs vândut (imagine, comandă,
  health-check) + `POST /admin/infrastructure/sync` + maparea `eggId` per produs.
* **Criteriu de verificare:** o instanță provisionată răspunde pe calea health a **aplicației
  produsului**, nu pe cea a starter-ului; catalogul de producție are `eggId` valid pentru toate
  produsele cu `deployable=true`.

### 5.7 `PROV-05` — stările de instanță nu sunt resincronizate cu starea reală a containerului

* **Observat:** `api/src/routes/instances.ts:149` scrie `RESTARTING` la o repornire și **nu**
  resetează starea; șirul `DEGRADED` nu apare **deloc** în `api/src/`; `ONLINE` se scrie la
  pornire (`instances.ts:149`) dar nu se verifică ulterior cu panoul.
* **Așteptat:** starea afișată clientului reflectă starea reală a containerului, iar o instanță
  degradată este marcată ca atare.
* **Cauză confirmată:** `api/src/routes/instances.ts:149`;
  `grep -rn "DEGRADED" api/src/` → 0 potriviri.
* **Severitate:** **High** — clientul plătește un serviciu pe care nu îl poate folosi, fără
  semnalizare.
* **Remediere propusă:** citește starea din `ptero.getServer(...)` la fiecare încărcare a paginii
  de instanță (cu cache scurt), mapează explicit `online→ONLINE`, `offline→DEGRADED` (sau
  `STOPPED`), resetează `RESTARTING` după confirmarea panoului.
* **Criteriu de verificare:** un test pornește o instanță, oprește containerul pe panou și
  verifică tranziția stării în interfață și în `GET /instances/:id`.

### 5.8 `BE-09` — verificarea sumei se dezactivează când `amount_total` lipsește

* **Observat:** `api/src/routes/webhooks.ts:303-304` → `if (typeof amountTotal !== 'number') return null;`
  — dacă furnizorul nu trimite suma, verificarea **trece** în tăcere.
* **Așteptat:** un eveniment de plată fără sumă este fie respins, fie marcat pentru operator — nu
  acceptat ca „sumă corectă".
* **Cauză confirmată:** `api/src/routes/webhooks.ts:303-311`.
* **Severitate:** **Medium**, money-relevant: un webhook modificat sau trunchiat ar trece de
  verificare.
* **Remediere propusă:** `verifyAmount` trebuie să întoarcă un mesaj de eroare și când suma lipsește
  (`'The provider did not report the amount that was collected.'`), iar evenimentul să fie
  **deferit**, nu aplicat.
* **Criteriu de verificare:** un `checkout.session.completed` fără `amount_total` **nu** marchează
  comanda `PAID`.

### 5.9 `COMM-10` — un produs nou creat prin administrare pornește gratuit

* **Observat:** `api/src/routes/admin.ts:583` → `baseAmount: z.number().int().min(0).default(0)` —
  un produs creat din interfața de administrare are preț **0** până când operatorul îl completează.
* **Așteptat:** un produs nou nu poate fi publicat cu preț 0 fără o decizie explicită.
* **Cauză confirmată:** `api/src/routes/admin.ts:583`.
* **Severitate:** **Medium**, money-relevant — o eroare de operator devine o vânzare gratuită.
* **Remediere propusă:** fie `baseAmount` obligatoriu (`min(1)`), fie produsul rămâne
  `deployable=false` până când prețul este setat.
* **Criteriu de verificare:** `POST /admin/products` fără preț este respins sau creează un produs
  neordonabil.

### 5.10 `PROMO-08` / `PROMO-05` / `COMM-12` / `PROMO-09` — validarea și raportarea campaniilor

* **PROMO-08 — `STILL BROKEN`:** `admin.ts:817` acceptă `value: 0`; `admin.ts:822-823` acceptă
  `startsAt`/`endsAt` fără comparație între ele ⇒ campanii moarte și ferestre inversate.
  *Severitate:* **Medium**. *Remediere:* `value` ≥ 1 pentru `PERCENT`/`FIXED`; `endsAt > startsAt`.
  *Criteriu de verificare:* teste negative pentru fiecare margine.
* **PROMO-05 / COMM-12 — `STILL BROKEN`:** `admin.ts:801` trimite `usedCount` (doar plăți), dar
  plafonul se aplică pe `countEffectiveRedemptions` (`api/src/services/pricing.ts:215-239`), care
  include rezervările neexpirate ⇒ ecranul de administrare **minte** despre starea campaniei.
  *Severitate:* **Medium**. *Remediere:* expune `usedCount` (efectiv) și `reservedCount` separat,
  calculate cu aceeași funcție ca plafonul.
* **PROMO-09 — `STILL BROKEN`:** nu există `case 'checkout.session.expired'` în
  `api/src/routes/webhooks.ts` ⇒ slotul campaniei este ținut până la 48 h.
  *Severitate:* **Medium**. *Remediere:* tratează `checkout.session.expired` ⇒
  `releasePromotionReservation(orderId)`.

### 5.11 `SEC-20` / `SEC-21` — costul parolei și predictibilitatea parolei de panou

* **Observat:** `api/src/lib/password.ts:18-21` → `N=16384, R=8, P=1` (OWASP cere `N=2^17`);
  `api/src/lib/secrets.ts:16-17` → `scryptSync(env.SESSION_SECRET, 'blipmade:secret-box', 32)` —
  **sare fixă, codată în sursă**; `api/src/services/panel/identity.ts:115` →
  `Math.random().toString(36)` pentru parola contului de panou.
* **Așteptat:** parametri de `scrypt` la nivelul recomandării OWASP, sare aleatorie pentru
  derivarea cheii, `crypto.randomBytes` pentru parola panoului.
* **Severitate:** **Low**, dar **adâncit** față de constatarea inițială (sarea fixă este mai slabă
  decât „cost sub recomandare").
* **Remediere propusă:** `N = 131072, r = 8, p = 1` cu `maxmem` ajustat (și plan de migrare a
  hash-urilor vechi la autentificare); `deriveKey` cu sare aleatorie stocată alături de secret;
  `randomBytes(24).toString('base64url')` pentru parola panoului.
* **Criteriu de verificare:** hashurile nou create conțin `N=131072`; parolele de panou au ≥ 24
  caractere aleatoare.

### 5.12 `PROMO-11` și `UX-03` — corecția este reală, dar **nu există test de regresie**

* **Observat:** în ambele cazuri, defectul **nu mai există** în cod, dar testul revendicat nu
  acoperă afirmația revendicată.
  * `PROMO-11`: `web/tests/catalog-truth.test.ts` testează funcțiile din
    `web/src/lib/pricing-contract.ts` (`:148-217`); **nu** verifică „niciun preț fără server în
    codul clientului". O listă hardcodată de prețuri în `web/src/home/` **nu ar face testul să
    eșueze**.
  * `UX-03`: revendicarea de test este „sweep + inspecția DOM"; în `web/tests/` nu există niciun
    fișier care să testeze starea unică a instanței.
* **Severitate:** **Medium** (nu este defect funcțional, ci **gardă lipsă** — exact tipul de
  regresie pe care o remediere o produce).
* **Remediere propusă:** (a) un test static în `web/tests/` care scanează `web/src/home/` și
  `web/src/admin/` și **eșuează** dacă apare un import de literal monetar fără sursă de server
  (excepție: fișierele de traducere și fixture-urile); (b) un test care construiește două produse
  cu stări diferite și verifică că interfața nu afișează două stări pentru aceeași instanță.
* **Criteriu de verificare:** ambele teste eșuează dacă lista hardcodată, respectiv starea
  duplicată, sunt reintroduse.

### 5.13 `COMM-08` — retenția este implementată, dar ștergerea reală este dezactivată implicit

* **Observat:** `api/src/services/billing.ts:421-448` scrie termenul și exportul;
  `billing.ts:482-530` — ștergerea reală cere `auto_delete_cancelled_instances.enabled === true`,
  iar implicitul este `false` (`billing.ts:281-289`).
* **Așteptat:** fie termenul este aplicat și ștergerea este programată, fie operatorul știe
  explicit că nu se șterge nimic.
* **Severitate:** **Medium** — retenția este *declarată* în interfață, dar nu este *executată*. Este
  un pericol de creștere a stocării de date și un risc de conformitate (GDPR: termenul de
  păstrare trebuie să fie real).
* **Remediere propusă:** fie activează ștergerea cu un termen implicit explicit (30 de zile), fie
  expune în interfață și în `GET /billing/summary` faptul că nimic nu se șterge până când
  operatorul activează setarea.
* **Criteriu de verificare:** există un job de ștergere programat și rulează; `GET /billing/summary`
  raportează `deletionScheduledFor` și `exportAvailable` corect.

### 5.14 `PROV-08` / `PROV-09` / `PROV-10` / `PROV-12` — restul lanțului de provisionare

| ID | Observat | Cauză (file:line) | Severitate | Remediere | Criteriu de verificare |
|---|---|---|---|---|---|
| PROV-08 | Comanda `UPGRADE` este creată **înainte** de checkout; dacă `createCheckout` aruncă 503, comanda rămâne `PENDING` | `api/src/routes/instances.ts:298-302` | Medium | creează comanda **după** ce sesiunea de plată este obținută, sau marchează comanda `FAILED` la eșec | nicio comandă `UPGRADE` orfană după un checkout eșuat |
| PROV-09 | Upgrade-ul nu verifică capacitatea nodului | `api/src/services/upgrades.ts` — nicio referință la `nodeCapacity` | Medium | verifică `nodeCapacity(node).freeMemoryMb/freeDiskMb` înainte de `applyUpgradeOrder` | upgrade-ul este refuzat cu un mesaj care numește valorile libere |
| PROV-10 | Lipsa mapping-ului de egg este raportată la pasul `server_created` | `api/src/services/provisioning.ts:439,456` | Medium | un pas distinct în jurnal (de exemplu `egg_missing`) | jurnalul arată pasul corect |
| PROV-12 | Nu există credit la degradare pentru clientul fără abonament | `api/src/services/upgrades.ts` | Medium | credit proporțional cu timpul nefolosit, scris în contul clientului | un incident de degradare creditează automat |

### 5.15 Grupuri de constatări deschise, cu acțiunea cerută

| grup | constatări | cauză comună | severitate | remediere | criteriu de verificare |
|---|---|---|---|---|---|
| rată | SEC-06, UX-05, PROV-08 | limitele sunt per-route și `global:false`; `payments_unavailable` este un 503 care oprește 8 pași | Medium/High | `rateLimit` global cu praguri pe categorii; mesaj de plată care **îndrumă** clientul | un client care încearcă 30 de rute mutante într-un minut primește 429 |
| validare | PROMO-08, COMM-10, PROMO-05, COMM-12 | validările lipsesc la margini (`value=0`, `endsAt<startsAt`, preț 0 implicit, counter nealiniat) | Medium | validări Zod stricte și un singur „counter efectiv" | teste negative pentru fiecare margine |
| retenție/ștergere | COMM-08, OPS-09, PROV-03, BE-06, BE-07 | retenția este declarată dar nu executată; joburile eșuate sunt șterse de `pruneQueue()` | Medium | joburi `failed` păstrate cu TTL explicit; sweep de retenție pornit | un job eșuat este vizibil 7 zile și este reluat |
| consistența stării | PROV-05, PROV-12, BE-10, BE-15 | stările sunt scrise în mai multe locuri, fără o singură sursă de adevăr | High/Medium | o funcție de tranziție de stare + enum pentru `WebhookEvent.status` | tranzițiile ilegale sunt respinse |
| confidențialitate | SEC-17, SEC-19, ADM-14, ADM-16, SEC-11, SEC-15, SEC-23, SEC-26, SEC-27 | expunere prin răspunsuri și prin comparații naive | Low/Info | filtre pe răspunsurile publice, `timingSafeEqual` peste tot, allowlist de chei pentru `PUT /admin/settings` | teste care aseră că e-mailurile și cheile interne nu apar în răspunsuri |
| documentație | DOC-01…DOC-13, BE-11 | `docs/` nu a fost atins în rundă; contractul API este acum mai în urmă | Medium | un sweep al documentației contra codului, ca test | un test care compară rutele din `docs/API_CONTRACT.md` cu rutele înregistrate în Fastify |
| UI/a11y | UX-02, UX-04…UX-13, UX-15…UX-28 | constatări de interfață măsurate cu un sweep de browser | Low/Medium | rularea sweep-ului existent (`audit/_tools/browser-mobile-audit.mjs`, `a11y-measure.mjs`, `motion-check.mjs`) pe stiva izolată | raport de sweep fără 404/overflow/contrast sub prag |
| infrastructură | SEC-01, SEC-02, SEC-05, SEC-11, SEC-12, SEC-13, SEC-28, INF-01…INF-07, NET-01, NET-04, CAP-01…CAP-04, DR-01…DR-05 | decizii de operator | Critical–High | proceduri aprobate (vezi `25-OPERATOR-DEPENDENCIES.md`) | procedura executată și verificată |
| piață/preț | PORT-01…PORT-09, MKT-01…MKT-12 | decizii de produs și de piață | Medium | D-1 (valoarea `C_node`), D-2 (ținta de backup) | modelul de preț recalculat pe valorile reale |

### 5.16 Constatările `NOT VERIFIED` — ce am încercat și de ce nu am putut încheia

* **Acces lipsă la VM 102** (`SEC-12`, `SEC-14`, `INF-08`, `NET-02`, `NET-03`, `NET-04`):
  `ssh debian@10.77.0.12` → `Permission denied (publickey)`. Nu am configurat Caddy-ul public.
* **Acces interzis la panoul Pterodactyl** (`SEC-10`, `DR-04`, `DR-05`, `OPS-07`, `UX-02`,
  `UX-12`): nu am atins panoul; pentru a garanta că nu se creează instanțe reale, instanța mea a
  fost pornită cu `PTERODACTYL_URL=http://127.0.0.1:1`.
* **Fără browser non-Crumbium** (`UX-09`…`UX-11`, `UX-16`…`UX-21`, `UX-23`…`UX-28`): Firefox și
  WebKit nu sunt instalate pe VM 103, iar sweep-ul de 32 de rute la 6 lățimi nu a încăput în
  bugetul fazei 0. Instrumentele există (`audit/_tools/browser-mobile-audit.mjs`,
  `a11y-measure.mjs`, `motion-check.mjs`) — **recomand: faza 1 să le ruleze pe stiva izolată**.
* **Fără plăți live** (`OPS-01`, `OPS-05`, `PROV-04`, `PORT-01`…`PORT-09`): `STRIPE_SECRET_KEY`
  unset; revendicarea din `remediation-status.json` („comanda cu promoție 100% este confirmata **și
  provisionata** fara furnizor") presupune un panou funcțional — **eu nu pot confirma partea de
  provisionare**, doar partea de confirmare a comenzii.
* **Documentație vs. realitate** (`DOC-02`, `DOC-09`, `DOC-11`, `DOC-12`, `DOC-13`): am citit
  doar documentele citate în celelalte rânduri; un sweep complet al `docs/` (36 de fișiere) nu a
  încăput în faza 0.
* **Fără model economic** (`CAP-01`…`CAP-03`, `PORT-04`…`PORT-09`, `MKT-09`, `MKT-10`): necesită
  valoarea `C_node` de la operator (D-1) și date de piață.

---

## 6. Defecte noi introduse de remediere

Niciuna dintre cele 182 de constatări anterioare nu este o regresie. Cele două de mai jos sunt
**constatări noi**, apărute ca efect al rundei `36a75a7..HEAD`, și le raportez ca atare.

### 6.1 `REGR-01` — exportul de conformitate al clienților ajunge în lista generică de setări (High)

* **Cum a apărut:** feature-ul de retenție (terminare + export) este **nou** în rundă
  (`api/src/services/billing.ts:346-352`, `:421-448`). Exportul a fost pus în tabela `Setting`,
  iar `GET /admin/settings` (`api/src/routes/admin.ts:1116-1121`) întoarce **toate** rândurile
  `Setting`. Mecanismul de expunere era preexistent (`SEC-26`, încă deschis), dar **payload-ul cu
  PII este nou**.
* **Impact:** orice cont staff cu `settings.read` primește, la un apel, e-mailurile, numele,
  comenzile, facturile, plățile și **mesajele de suport** ale tuturor clienților care au anulat
  un serviciu. Ecranul de administrare le afișează ca rânduri editabile, iar `PUT /admin/settings`
  (mass-assignment, `SEC-26`) le poate suprascrie — distrugând retenția.
* **Dovadă:** §5.1 și ieșirea `reval-exposure.mjs` din §9.
* **Observație suplimentară, relevantă pentru ce a fost deja modificat în rundă:**
  `web/src/admin/Settings.tsx:51-60` a fost modificat **doar** pentru a ascunde cheile `internal.*`
  (contorul de numerotare a comenzilor). Cheia `cancelled_instance_retention` — introdusă în aceeași
  rundă — nu a fost filtrată. Aceeași revizie de cod a văzut una dintre cele două chei noi și nu
  pe cealaltă.
* **Severitate:** **High**.
* **Remediere:** vezi §5.1 (model dedicat + rută cu permisiune + jurnal; sau, minim, filtrarea
  cheii din răspuns și din interfață și interzicerea scrierii pe ea).

### 6.2 `REGR-02` — contorul de numerotare și retenția trăiesc în același rând `Setting` (Medium)

* **Cum a apărut:** secvențele atomice de numerotare sunt **noi** în rundă
  (`api/src/services/order-numbers.ts:21-23`, `:47-98`) și folosesc cheile `internal.order.sequence`
  și `internal.invoice.sequence` din tabela `Setting`. Același rând de tabel este acum folosit și
  pentru retenție (`cancelled_instance_retention`) și pentru `auto_delete_cancelled_instances`.
* **Impact:**
  * `GET /admin/settings` întoarce și **contorul** platformei (deși interfața îl ascunde);
  * `PUT /admin/settings` poate scrie peste cheile `internal.*` — poate, dar nu rupe numerotarea,
    pentru că `nextSequenceNumber` (`order-numbers.ts:47-98`) pornește de la
    `GREATEST(counter, MAX(existing))`, deci se auto-repară; **totuși**, un reset al contorului
    forțează o interogare `MAX` la fiecare comandă;
  * `writeRetentionRecords` (`billing.ts:346-352`) rescrie **întregul blob** de retenție la fiecare
    anulare ⇒ cost O(n) și un rând JSONB care crește fără limită, cu lock pe rând.
* **Severitate:** **Medium** (nu e o pierdere de date, dar este o corupție de stare într-un
  mecanism de integritate financiară).
* **Remediere:** contorii într-un model dedicat (`SequenceCounter` cu `key` unică), cu o tranzacție
  separată de retenție; retenția într-un model dedicat (vezi REGR-01).

### 6.3 Ce **nu** este o regresie (verificat explicit)

* **Numerotarea atomică** (`order-numbers.ts:47-98`) — corectă: `SELECT … FOR UPDATE` pe rândul
  contorului, apoi `UPDATE … GREATEST(...) + 1 RETURNING`; două comenzi simultane primesc numere
  distincte (dovedit de `api/tests/provisioning-safety.test.ts:613`, 100 de comenzi).
* **Distribuția sumei pe linii** (`api/src/services/order-amounts.ts:48-92`) — corectă: suma părților
  este exact `order.total`, iar restul de rotunjire este pus pe ultima linie.
* **Poarta de plată** (`api/src/services/provisioning.ts`) — corectă și înainte, și după
  `storeServerIdentifiers`: comanda neplătită nu produce server, nu produce alocare și nu este
  reluată de worker (`api/src/worker.ts:48-58`).
* **Compensarea** — `refundPayment` este apelat o singură dată, în ramuri disjuncte
  (`provisioning.ts:948` și `:953`), iar reluarea nu rambursează din nou
  (`api/tests/provisioning-safety.test.ts:511`).
* **Promoțiile** — rezervarea este serializată pe rândul campaniei (`pricing.ts:300`), plafonul
  per cont este aplicat la cotăție **și** la rezervare, iar campania `FIXED` fără sumă este
  respinsă.

---

## 7. Revindicări care nu au putut fi substantiate

Aceasta este secțiunea în care spun lucrurile incomode: **unde raportul de remediere afirmă ceva
ce codul nu face**. Le-am verificat pe toate, unul cu unul.

### 7.1 `PROMO-11` — testul revendicat nu acoperă afirmația revendicată

| | |
|---|---|
| **Revindicarea** (`remediation-status.json`): „Toate paginile publice iau produsele si preturile de la server; lista hardcodata a fost eliminata"; test: `web/tests/catalog-truth.test.ts`; verificare: „Test: niciun pret fara server in codul clientului" | **Realitatea:** defectul **este** eliminat din cod (`web/src/home/Studio.tsx:92-99,234-243`, `Story.tsx:135-148`, `Configurator.tsx:79`, `Ticker.tsx:21-26` citesc de la server). Dar `web/tests/catalog-truth.test.ts:103-217` testează **doar** funcțiile din `web/src/lib/pricing-contract.ts` — nu verifică nimic despre paginile publice. O listă hardcodată de prețuri în `web/src/home/` **nu ar face testul să eșueze**. |
| **Commit revendicat** | `3948f7f` **nu** atinge `Studio.tsx`, `Story.tsx`, `Configurator.tsx` sau `Ticker.tsx` — acestea au fost atinse de `36a75a7`, adică **înainte** de runda auditată (`git log -- web/src/home/Studio.tsx …` → `36a75a7`, `a0212b8`, `61111f6`, `d6d4da6`, `07c7fa6`). `3948f7f` este și el anterior liniei de bază `36a75a7`. |
| **Verdict** | Defectul este absent din cod ⇒ `PARTIALLY FIXED` (nu `VERIFIED FIXED`), pentru că **nu există gardă de regresie** și revindicarea de test este greșită. |

### 7.2 `UX-03` — „testul" este o inspecție manuală, nu un test

Revindicarea de test este „sweep + inspectia DOM". În `web/tests/` nu există niciun fișier care să
testeze starea unică a instanței. Codul este coerent (`Overview.tsx:255,310`,
`InstanceDetail.tsx:663` — toate `StatusPill status={instance.status}`), dar nu e apărat.
⇒ `PARTIALLY FIXED`.

### 7.3 `PROV-13` / `BE-02` — mecanismul descris nu este cel implementat

Raportul de rundă (`audit/26-REMEDIATION-WAVE-1-REPORT.md`, §2.4) scrie că „tentativa este
**înregistrată înainte de creare**, în jurnalul pasului". Codul face altceva:
`provisioning.ts:1150` creează serverul, **apoi** `:1183` înregistrează tentativa. Diferența nu
este cosmetică: rămâne o fereastră în care un proces oprit forțat între `:1150` și `:1183` lasă
un container fără urmă în jurnal, iar reluarea ar crea un al doilea container.

**Verdict:** defectul original (eroare la scrierea identificatorilor → al doilea server) **este**
închis, prin `recordServerAttempt` + ștergerea containerului la refuzul scrierii
(`provisioning.ts:1193`) — dovedit de `api/tests/provisioning-safety.test.ts:556`. Dar **mecanismul
revendicat nu există**, iar fereastra de crash rămâne. Pentru închiderea completă: creează
intenția **înainte** de `createServer` (de exemplu, un rând `provisioningJob` cu
`status:'running'`, `step:'server_created'`, `payload.serverId = null`), apoi completează-l cu
`serverId` după creare; la reluare, dacă există o intenție fără `serverId`, **reconciliază cu
panoul** (caută serverul după `uuid`/etichetă) înainte de a crea unul nou.

### 7.4 `BE-03` — „evenimentul este luat cu o constrângere unică" este adevărat doar pentru prima livrare

Constricția unică `(provider, eventId)` protejează doar **insertul** (`webhooks.ts:86-92`).
Livrările concurente trec prin ramura de *retry*, pentru că rândul nou creat are încă
`status='received'` (`:87`), iar `abandoned` include explicit `existing.status === 'received'`
(`:106`). Demonstrat în runtime (§5.3). Revindicarea „Ledgerul webhook nu apără de livrările
concurente ale aceluiași eveniment" **nu este îndeplinită**.

### 7.5 `COMM-08` — două documente de remediere nu sunt de acord asupra termenului

`audit/26-REMEDIATION-WAVE-1-REPORT.md` spune „implicit 30 de zile";
`audit/_tools/remediation-status.json` spune „Test: termen de 7 zile". Codul are
`DEFAULT_RETENTION_DAYS = 30`; valoarea 7 vine **doar** din test
(`api/tests/billing-lifecycle.test.ts:471` setează explicit `retentionDays: 7`). Nu e o eroare
funcțională, dar statusul oficial al constatării e greșit — și verificarea „termen de 7 zile" nu
e o verificare, ci o citire a fixture-ului.

### 7.6 `OPS-01` / `PROV-11` — documentul de dependințe overstate ce s-a pregătit

`audit/25-OPERATOR-DEPENDENCIES.md:125-137` scrie că „`api/prisma/seed.ts` descrie imaginea,
comanda de pornire și health-check-ul fiecarui produs". În realitate `seed.ts` are
`dockerImage: null` și `startupCommand: null` pentru 4 din 5 produse; doar unul are o imagine
verificată. Ce s-a pregătit este **starter-ul generic** (`api/src/services/starter-apps.ts`), nu
aplicația produsului.

Pentru `PROV-11`, revindicarea spune „cache-ul `Node` și `Egg` sunt goale". În producție cache-ul
**nu mai este gol** (1 `Node`, 16 `Egg`) — sincronizarea a fost rulată de operator între timp.
Restul constatării rămâne deschis: produsul `wordpress` are `deployable=true` cu `eggId` NULL.

### 7.7 `DR-02` — „programarea e rezolvată în această rundă" este fals

`audit/25-OPERATOR-DEPENDENCIES.md:64-68` titrează „**Programarea** (lipsa, rezolvata in aceasta
runda)" și apoi dă comanda de instalare. În realitate s-a adăugat **scriptul**
`scripts/install-backup-timer.sh` și unitățile `scripts/systemd/blipmade-backup.{service,timer}`,
dar timerul **nu este instalat**: `systemctl is-enabled blipmade-backup.timer` → `not-found`.
Starea reală este „material pregătit, neinstalat", nu „rezolvat".

### 7.8 `ADM-01` (runda 2) — marcat „Da", dar codul nu are verificarea de permisiune

Vezi §5.4. Aceasta este o revindicare a rundei 2, nu a rundei curente, dar e relevantă pentru
credibilitatea registrului: constatarea a fost marcată reparată fără o citire a
`api/src/routes/tickets.ts`.

### 7.9 `PROV-04` / `OPS-05` — „verificat în stiva izolată: comanda … e confirmata **și provisionata**"

Revindicarea este corectă pentru confirmarea comenzii (`api/tests/order-amounts.test.ts:199` — o
comandă cu promoție 100% ajunge `PAID` fără furnizor). Partea „și provisionata" **nu este
reproductibilă** într-un mediu fără panou, iar în producție panoul nu a fost atins de mine. O
marchez `NOT VERIFIED` pentru acea jumătate, nu `STILL BROKEN` — și o țin strict separat de
faptul că plățile rămân oprite (confirmat).

### 7.10 `SEC-03` — titlul constatării depășește realitatea

`compose.api.yml:18` publică API-ul pe `127.0.0.1:3100` — **nu** pe LAN. Constatarea spune
„API-ul de producție și sistemul de sesiuni accesibile din LAN pe HTTP simplu". Prima jumătate
este falsă în forma dată; a doua jumătate (transportul intern fără TLS și sesiunile care rețin
adresa proxy-ului) este reală și este deja urmărită de `SEC-05` și de
`audit/post-remediation/SESSIONS-INVESTIGATION.md`. Marcat `INVALID FINDING` pentru titlu, cu
restul realățat în `SEC-05`.

---

## 8. Constatările care blochează în continuare un GO comercial

Ordinea este cea a impactului asupra banilor și a clienților, nu a severității formale.

1. **Plățile nu sunt pornite** (`PROV-04`, `OPS-05`, `OPS-01`, `PRICE-04`, `PORT-07`) —
   `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` unset, 4 din 5 produse fără imagine și fără
   `eggId` valid ⇒ **nu se poate vinde nimic**. *(operator)*
2. **Nu există niciun backup, nici programat, nici în afara hostului** (`DR-02`, `INF-02`,
   `INF-07`, `DR-01`, `DR-03`, `DR-04`) — timer neinstalat, `OFFSITE_*` unset, `rclone` absent,
   secretele fără copie ⇒ **pierderea hostului pierde tot**. *(operator)*
3. **Volumul de root este RAID 0** (`INF-01`, `CAP-04`, `DR-01`) — un disc pierdut pierde
   platforma. *(operator, cu downtime aprobat)*
4. **Hipervizorul este expus public** (`SEC-01`, `SEC-02`, `SEC-28`, `INF-04`, `INF-05`) —
   `root` cu parolă, `*:8006`, `rpcbind` pe `0.0.0.0:111`, firewall dezactivat ⇒ **compromis
   total**. *(operator, firewall înainte de rotația parolei)*
5. **Exportul clienților este expus în zona de administrare** (`REGR-01`, `SEC-26`) — date cu PII
   într-un răspuns API generic și editabil. *(cod, imediat)*
6. **Rutele de bilete nu verifică permisiunea** (`ADM-01`) — orice staff poate muta bilete. *(cod,
   imediat)*
7. **Livrările concurente ale aceluiași eveniment de plată sunt procesate de două ori**
   (`BE-03`) — fără plată dublă azi, dar cu **mascarea unei erori** în ledger. *(cod, imediat)*
8. **Verificarea sumei se dezactivează când furnizorul nu trimite suma** (`BE-09`) — un webhook
   modificat trece drept „sumă corectă". *(cod, imediat)*
9. **Canalul de suport este inert** (`OPS-03`, `OPS-06`) — `SMTP_URL` unset ⇒ niciun bilet nu
   ajunge la nimeni, iar `/status` raportează „Degraded". *(operator)*
10. **Nu există URL public pentru instanțe** (`OPS-04`, `UX-02`, `NET-01`, `NET-03`) —
    `DOMAIN_BASE` și `CADDY_ADMIN_*` unset ⇒ produsul nu are adresă. *(operator)*
11. **Stările de instanță nu reflectă realitatea** (`PROV-05`, `PROV-12`) — clientul plătește un
    serviciu pe care nu-l poate folosi, fără niciun semn. *(cod)*
12. **Produsele noi pornesc cu preț 0** (`COMM-10`) — o eroare de operator devine o vânzare
    gratuită. *(cod, o linie)*

---

## 9. Anexă — ieșiri brute ale comenzilor (decizii-cheie)

### 9.1 Stiva izolată și mediul

```
$ ssh debian@10.77.0.13 'docker ps --format "{{.Names}}\t{{.Ports}}"'
blipmade-api-1     127.0.0.1:3100->3100/tcp      <-- PRODUCTIE, neatins
blipmade-web-1     10.77.0.13:3000->3000/tcp
blipmade-worker-1  3100/tcp
blipmade-postgres-1 127.0.0.1:5432->5432/tcp
blipmade-redis-1   127.0.0.1:6379->6379/tcp

$ ss -lntp | grep -E "3101|30003|3100|30002"
LISTEN 127.0.0.1:3101   node  <-- stiva izolata a auditorilor
LISTEN 0.0.0.0:30003    node  <-- web izolat
LISTEN 127.0.0.1:3100   <-- productie (NU atins)
(portul 30002: inexistent)

$ tr "\0" "\n" < /proc/822463/environ | grep -E "DATABASE_URL|PORT|NODE_ENV"
DATABASE_URL=postgresql:***@localhost:5432/blipmade_test
PORT=3101
NODE_ENV=test
STRIPE_TEST_MODE=true
STRIPE_SECRET_KEY=
PAYMENTS_ENABLED=false
```

```
$ cd /opt/blipmade && TEST_DB_NAME=reval_test bash scripts/run-tests.sh
==> Running the test suite against blipmade_test        <-- numele afișat e cel din script;
                                                               rularea reală a fost pe reval_test
 Test Files  32 passed (32)
      Tests  325 passed (325)
   Duration  146.84s
==> Running the web tests
 # tests 87
 # pass 87
 # fail 0
```

### 9.2 `SEC-16` — eșecul de autorizare răspunde 200 (izolat, 3102)

```
SEC-16 POST /api/webhooks/stripe/replay   -> HTTP 200 {"error":{"code":"unauthorized","message":"The internal token is required."}}
SEC-16 GET  /api/webhooks/stripe/failed   -> HTTP 200 {"error":{"code":"unauthorized","message":"The internal token is required."}}
SEC-16 CONTROL POST /api/webhooks/stripe/test -> HTTP 401
```

### 9.3 `REGR-01` — exportul clienților în `GET /admin/settings` (izolat, 3102, baza `reval_test`)

```
--- Setting row key=cancelled_instance_retention exists: true
--- records in blob: 1
--- export.customer: {"id":"...","email":"qa.check@example.test","lastName":"Check","firstName":"QA"}
--- blob size bytes: 1485
--- GET /api/admin/settings -> HTTP 200 keys: ["cancelled_instance_retention"]
--- exposed customer email via admin settings API: {"id":"...","email":"qa.check@example.test","lastName":"Check","firstName":"QA"}
--- internal keys in API response: []
```

### 9.4 `BE-03` — livrări concurente ale aceluiași eveniment (izolat, 3102)

```
ORDER 201 cmvlmwt5u000vdx3pthijfmxz total 149
DELIVERY A -> 200 {"received":true}
DELIVERY B -> 200 {"received":true}
LEDGER: status= processed attempts= 1 error= null
AUDIT rows action=stripe.checkout.session.completed (all events): 5 for this event: 2
PAYMENT rows for the order: 1
INSTANCES for the order: 1
SUBSCRIPTIONS of the customer: 3
=== api log errors ===
prisma:error Unique constraint failed on the fields: (`provider`,`eventId`)
prisma:error Unique constraint failed on the fields: (`provisioningKey`)
```

### 9.5 `PROMO-07` — limita per cont, în runtime (izolat, 3102)

```
CREATE PROMO 201 {..."maxPerUser":1,"usedCount":0...}
ANON QUOTE 403                                   <-- cotatia anonima e refuzata
SIGNED QUOTE #1 200 {"code":"REVAL79997","valid":true} discount= 75 total= 74
ORDER 201 {"number":"BM-00001","status":"PENDING","total":74,"discount":75,...}
SIGNED QUOTE #2 (after reservation) 200 {"code":"REVAL79997","valid":false,"reason":"This code has already been used on your account."} discount= 0
ORDER #2 (limit per account) 201 {"number":"BM-00002","total":149,"discount":0,...}
```

### 9.6 `AVAIL-01` — poarta de egg (izolat, 3102)

```
BEFORE: wordpress deployable= true eggId= 15
CATALOG wordpress: availability= {"state":"TEMPORARILY_UNAVAILABLE","enabled":true,"installable":false,"visible":true,"orderable":false,"blockers":["Its image is not installed on the panel yet."]}
QUOTE wordpress  -> 400 {"error":{"code":"bad_request","message":"WordPress is not available to order yet: Its image is not installed on the panel yet."}}
ORDER wordpress -> 400 {"error":{"code":"bad_request","message":"WordPress is not available to order yet: Its image is not installed on the panel yet."}}
```

### 9.7 `BE-10` — relivrarea nu mai resetează starea de onorare (izolat, 3102)

```
BEFORE re-delivery: BM-00003 status= PAID fulfillmentStatus= PROVISIONING
RE-DELIVERY -> 200 {"received":true,"duplicate":true}
AFTER re-delivery: status= FULFILLED fulfillmentStatus= FULFILLED
LEDGER after re-delivery: status= processed attempts= 1
```

### 9.8 Hipervizor — constatările de securitate (read-only)

```
$ sshd -T | grep -Ei "permitrootlogin|passwordauthentication"
permitrootlogin yes
passwordauthentication yes
$ iptables -S INPUT | head -2
-P INPUT ACCEPT
$ ss -lntp | grep -E ":8006|:111"
LISTEN 0 4096 0.0.0.0:111   users:(("rpcbind",pid=8997,fd=4),("systemd",pid=1,fd=104))
LISTEN 0 4096    *:8006    users:(("pveproxy worker",pid=346337,fd=6),...)
$ pve-firewall status
Status: disabled/running
$ cat /proc/mdstat
md1 : active raid0 sdb3[1] sda3[0]
md0 : active raid0 sdb2[1] sda2[0]
md2 : active raid0 sda4[0] sdb4[1]
```

### 9.9 VM 103 — dependințele de operator (read-only, valori redactate)

```
STRIPE_SECRET_KEY = <unset>          PAYMENTS_ENABLED = false
STRIPE_PUBLISHABLE_KEY = <unset>      SMTP_URL = <unset>
STRIPE_WEBHOOK_SECRET = <unset>       DOMAIN_BASE = <unset>
OFFSITE_TARGET = <unset>              OFFSITE_ENCRYPTION_KEY = <unset>
OFFSITE_KEEP_COPIES = <unset>         TRUSTED_PROXIES = <unset>
ADMIN_ENROLLMENT_KEY = <set,len=48>

$ systemctl is-enabled blipmade-backup.timer
not-found
$ systemctl list-timers blipmade-backup.timer --no-pager
NEXT LEFT LAST PASSED UNIT ACTIVATES
0 timers listed.
$ which rclone
rclone NOT INSTALLED
```

### 9.10 VM 103 — starea infrastructurii în producție (read-only, `SELECT`)

```
$ docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -tAc \
  "select p.slug, p.\"eggId\", p.deployable, (select count(*) from \"Egg\" e where e.\"pterodactylId\"=p.\"eggId\") from \"Product\" p order by p.slug"
code-server||f|0
discord-bot|15|t|1
postgresql||f|0
uptime-kuma||f|0
wordpress|t|0

$ ... select "pterodactylId", name from "Node"
1|games-node-01

$ ... select coalesce(ip,'-'), count(*) from "Session" group by 1 order by 2 desc limit 5
172.18.0.1|14
10.77.0.12|13
172.18.0.6|12
10.77.0.13|2
162.158.14.14|1
```

### 9.11 Adrese publice fără serviciu (NET-01)

```
$ for a in 193.34.214.86 193.34.214.87 193.34.214.143; do curl -s -o /dev/null -w "%{http_code}\n" -m 4 "http://$a/"; done
000
000
000
```

---

## 10. Concluzie

Runda de remediere a fost **tehnic bună în miezul ei**: acolo unde a fost un bug de bani
(condiția de plată, compensarea eșecului, numerotarea comenzilor și facturilor, promoțiile
limitate per cont, cotele anuale, retenția la anulare, contractul de preț), codul a fost
rescris la cauză, iar **25 din 41** constatări money-relevant sunt acum `VERIFIED FIXED`, cu teste
de regresie care chiar ar eșua la anularea fixului. Testele de regresie noi sunt **substantive**, nu
decorative — am citit zece dintre ele și le-am urmărit una câte una.

Totuși, trei lucruri trebuie spuse limpede:

1. **Securitatea de infrastructură nu a fost atinsă.** Zero din cele 7 constatări critice de pe
   hipervizor și de pe compose sunt închise; `root` cu parolă, `*:8006` și `rpcbind` public sunt
   în aceeași stare ca înainte. Acestea sunt riscuri de **pierdere totală**, nu de discomfort, și
   nu se rezolvă cu cod.
2. **Runda a introdus o expunere de date** (`REGR-01`): exportul complet al clienților ajunge în
   lista generică de setări, care este și editabilă. Este o regresie într-un sistem care tocmai
   primise o funcție de conformitate — ironic și, din cauza asta, urgentă.
3. **Trei revindicări de „FIXED & VERIFIED" nu sunt susținute de cod** (`PROMO-11`, `UX-03`,
   `BE-03`), iar una de „REQUIRES OPERATOR APPROVAL" (`DR-02`) este documentată ca fiind deja
   rezolvată, deși timerul nu este instalat. Un registru de status în care o treime din intrări
   nu corespund codului nu mai poate fi folosit ca listă de blocaje.

**Recomandare pentru faza următoare:** un val care închide cele patru elemente de cod
(`REGR-01`, `ADM-01`, `BE-03`, `BE-09`) — toate mici, toate localizate, toate cu criteriu de
verificare clar — plus o **rundă de operator** care să închidă backup-ul, RAID-ul, firewall-ul,
cheia Stripe și releul SMTP. Fără ultimele cinci, niciun GO comercial nu este defensibil.
