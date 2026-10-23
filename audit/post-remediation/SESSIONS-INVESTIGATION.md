# Auditul gestionării sesiunilor — Blipmade

**Document:** `audit/post-remediation/SESSIONS-INVESTIGATION.md`
**Data testelor:** 23 octombrie 2026, între 23:22 și 23:47 UTC (19:22–19:47 EDT)
**Autor:** auditor independent (sesiune Worker, sub-contract de audit)
**Natura lucrării:** audit de observație. **Niciun fișier din codul platformei nu a fost modificat.** Singurul fișier creat este acest raport. Nu s-a făcut niciun deploy, nu s-a scris în baza de date de producție, nu s-a autentificat pe `blipmade.com`.

---

## 1. Antet: ce s-a testat, unde, când, cu ce instrumente, limitări

### 1.1 Ce s-a testat

Mecanismul complet de sesiuni al platformei Blipmade: deschiderea, rotirea, expirarea, revocarea, identificarea sesiunii curente, stocarea și compararea identificatorilor, configurația cookie-urilor, deconectarea, efectul schimbării parolei / adresei de e-mail / cererii de închidere a contului, plafonul de sesiuni pe cont, comportamentul la semnări concurente, rezolvarea adresei de client în spatele proxy-urilor și ce arată interfața.

### 1.2 Unde

| Element | Valoare |
|---|---|
| VM | `debian@10.77.0.13` (nume de gazdă: `blipmade-platform`) |
| Repository (citit) | `/opt/blipmade`, ramura `audit/post-remediation`, HEAD `29a86cc` („Add the report of the first remediation wave") |
| Copy de lucru (citit) | `/root/blipmade-work` (identic cu repository-ul pentru fișierele citite; `api/src/plugins/auth.ts` și `api/src/routes/settings.ts` au fost comparate byte cu byte cu `/tmp/api-check` — **identice**) |
| Stiva izolată oferită (folosită) | API `127.0.0.1:3101`, web `127.0.0.1:30003`, baza `blipmade_test` |
| Stiva proprie de audit (creată de mine, pentru izolare) | baza `sessaudit_test` (creată în același container PostgreSQL, **nu** în baza de producție), API `127.0.0.1:3111` și `127.0.0.1:3112`, web `127.0.0.1:30004` și `127.0.0.1:30005` |
| Edge-ul public | Caddy la `10.77.0.12` (HTTPS) → web de producție `10.77.0.13:3000`; Cloudflare în fața lui Caddy |
| Baza de producție | `blipmade` — **exclusiv `SELECT`** (diferențiere, agregări, `LIMIT`), nicio scriere |

**De ce am creat o stivă proprie.** Suita de teste a lead-ului rulea în paralel (`node (vitest)`) pe `blipmade_test` și golește toate tabelele la începutul fiecărui fișier de test (`tests/setup.ts` → `TRUNCATE ... CASCADE`). Prima mea serie de măsurători a fost ștearsă sub picioare (contul creat dispărurea între două comenzi). Prin urmare am ridicat o instanță proprie a aceluiași cod (`/tmp/api-check/dist/index.js`, fără nicio modificare de cod) pe o bază separată, `sessaudit_test`, pe porturi libere (3111/3112/30004/30005). Codul rulat este **identic** cu cel al branch-ului; singura diferență față de stiva izolată oferită este `LOGIN_RATE_LIMIT_MAX` (limita per adresă, deja ridicată de lead la 500). Limita per cont (10/15 min) a rămas cea din cod, neatinsă.

### 1.3 Instrumente

- `curl` (cereri HTTP reale, cu și fără cookie, cu anteturi forjate);
- `psql` în containerul PostgreSQL (`docker exec blipmade-postgres-1 psql -U blipmade …`) — **doar `SELECT` pe `blipmade`**, `SELECT`+`INSERT/UPDATE` pe `sessaudit_test` și `blipmade_test`;
- `node` 22 pentru inspecția modulelor compilate (`dist/plugins/auth.js`) și pentru rularea testelor unitare existente;
- `playwright-core` (`/opt/blipmade/tools/browser/node_modules/playwright-core/index.js`) + Chromium `/usr/bin/chromium`, rulat prin `xvfb-run -a node …` pentru interfața grafică;
- inspecție în containere: `docker inspect`, `docker exec … grep`, `docker logs`.

### 1.4 Limitări (citite înainte de a scrie orice concluzie)

1. **Nu există Firefox și nu există WebKit** în acest mediu. Toate verificările de interfață sunt făcute în Chromium. Comportamentul în Firefox/WebKit (de exemplu tratamentul `SameSite=Lax` la navigarea din altă origine) **nu a fost verificat**.
2. **Baza de date de producție a fost citită, nu scrisă.** Nu am făcut niciun `INSERT`/`UPDATE`/`DELETE` pe `blipmade` și nu am făcut niciun apel de autentificare pe `blipmade.com`. Singurele cereri către edge-ul public au fost `HEAD`/`GET` pe `/` și `/api/health` (fără autentificare, fără efect pe baza de date).
3. **Stiva izolată seamănă cu producția, dar nu este producție.** `COOKIE_SECURE=false` și `LOGIN_RATE_LIMIT_MAX=500`; limitele reale de producție (10/15 min per adresă și 10/15 min per cont) au fost verificate separat, prin cod și prin măsurători controlate.
4. **Build-ul deployat în producție este mai vechi decât branch-ul auditat.** Detaliu în §3 — este cauza răspunsului la mai multe întrebări și trebuie citit înainte de orice concluzie.
5. **Edge-ul (Caddy `10.77.0.12` + Cloudflare) nu este accesibil**: cheia SSH nu este acceptată acolo, iar `Caddyfile`-ul nu se află în repository. Comportamentul exact al edge-ului privind `X-Forwarded-For` (suprascrie vs. concatenare) **nu a putut fi verificat** — vezi §7.
6. **Nu am rulat suita completă de teste** (o rulează lead-ul). Am citit testele existente pentru sesiuni (`api/tests/sessions.test.ts`, `api/tests/session-cookie.test.ts`, `api/tests/settings.test.ts`, `web/tests/client-address.test.mjs`) ca să nu contradic ce este deja acoperit.
7. **Platforma nu are niciun al doilea factor (MFA/TOTP)** — căutare pe întregul repository: zero potriviri. Nu există fluxuri MFA de testat.
8. **Nu am folosit starea de pe portul 30002.** Am descoperit (și confirmat prin `/proc/<pid>/environ`) că instancța de pe 30002 are `API_URL=http://127.0.0.1:3100`, adică **API-ul de producție → baza `blipmade`**. Orice autentificare prin 30002 ar fi scris în producție. Este o observație operațională importantă (§5, SESS-P1-13).
9. Am folosit conturi și adrese de test create de mine (`*.example.test`) în baza mea; niciun token, cookie sau parolă nu apare în acest raport.

---

## 2. Metodă

### 2.1 Citirea codului (fără modificări)

```
grep -n "session" api/src/            # 232 potriviri în 13 fișiere
awk '/^model Session/,/^}/' api/prisma/schema.prisma
sed -n '1,282p' api/src/plugins/auth.ts        # sesiuni: creare, rotire, plafon, încărcare, curățare
sed -n '90,212p;214,300p;411,530p' api/src/routes/settings.ts   # lista, revocarea, parola, închiderea
sed -n '179,422p' api/src/routes/auth.ts       # login/logout/reset/prune
cat api/src/lib/tokens.ts api/src/plugins/csrf.ts api/src/env.ts api/src/app.ts
cat web/src/lib/client-address.mjs web/server.mjs web/src/lib/api.ts web/src/app/Settings.tsx
```

### 2.2 Măsurători HTTP reale (API izolat, `sessaudit_test`)

Ordinea executată (fiecare cerere, cu răspunsul observat):

| # | Cerere | Ce s-a măsurat |
|---|---|---|
| M1 | `POST /api/auth/register` | se creează 1 rând de sesiune |
| M2 | `POST /api/auth/login` fără cookie | se creează un rând nou |
| M3 | `POST /api/auth/login` **cu** cookie-ul existent | **rotire**: același rând, token nou, tokenul vechi → 401 |
| M4 | `GET /api/settings/sessions` | cine este `current=true`; se vede `lastSeenAt` |
| M5 | `DELETE /api/settings/sessions/{id}` apoi `GET /api/auth/require` cu tokenul revocat | revocația e reală (401), nu doar cosmetică |
| M6 | `DELETE /api/settings/sessions/{id}` al unui rând al **altui** cont | 404, celălalt cont neatins |
| M7 | `GET /api/auth/require` fără cookie / cookie gol / gunoi / trunchiat | 401 în toate cazurile |
| M8 | `POST /api/auth/logout` | cookie șters (`Max-Age=0`, `Expires=1970`), rând șters, token → 401 |
| M9 | rând expirat inserat direct, apoi folosit | 401 **și rândul șters** (3 din 3 încercări) |
| M10 | `GET /api/settings/sessions` cu un rând expirat | rândul expirat **nu** apare |
| M11 | `POST /api/settings/password` | `closedSessions: 3`; celelalte tokenuri → 401; sesiunea curentă rămâne |
| M12 | `POST /api/settings/email` + confirmare | sesiunile **nu** sunt atinse |
| M13 | `POST /api/settings/account/closure` | sesiunea rămâne valabilă (200) |
| M14 | `DELETE /api/settings/sessions` | `{"closed":1,"current":true}`; celălalt token → 401 |
| M15 | 19 rânduri live inserate + 1 login | plafonul: rămân 20, se închide cel mai vechi, 1 rând în jurnal cu `reason=session_cap` |
| M16 | 6 logins paralele fără cookie | 6 rânduri distincte, 6 tokenuri valide |
| M17 | 2 logins paralele **cu același** cookie | **2 rânduri**, ambele tokenuri valide (cursă) |
| M18 | 11 logins reușite pe același cont | primele 10 → 200, a 11-a → **429** „Too many requests. Try again shortly." |
| M19 | login cu `X-Forwarded-For: 203.0.113.99` direct către API | adresa forjată **este** înregistrată (peer de încredere) |
| M20 | login cu numai `X-Real-IP: 198.51.100.5` | adresa **nu** se schimbă → `X-Real-IP` este ignorat de API |
| M21 | login cu `X-Forwarded-For: 203.0.113.99, 198.51.100.5` direct către API | se înregistrează `198.51.100.5` (API-ul folosește `proxy-addr`, semantica „ultimul neîncredut") |
| M22 | login prin web 30004 (`TRUSTED_PROXY_IPS=10.77.0.12`, peer neîncredut) cu XFF forjat | adresa forjată **ignorată** |
| M23 | login prin web 30005 (`TRUSTED_PROXY_IPS=127.0.0.1`, peer de încredere) cu XFF forjat | adresa forjată **înregistrată** (`203.0.113.99`; și cu lanț de 2 elemente → tot primul element) |
| M24 | login pe instanța 3112 (`COOKIE_SECURE` nesetat) cu `x-forwarded-proto: https` | cookie cu `Secure`; fără antet → fără `Secure` |
| M25 | login pe instanța 3111 (`COOKIE_SECURE=false`) cu `x-forwarded-proto: https` | fără `Secure` (setarea forțează) |
| M26 | 56 rânduri live pentru un cont | API-ul întoarce 50, fără total, fără indicator de trunchiere |
| M27 | inspecție DB: token vs. valoarea stocată | tokenul brut **nu** este în DB; `sha256(token)` este valoarea stocată (64 hex) |

### 2.3 Interfața (Chromium)

```
xvfb-run -a node /tmp/sess-audit/ui.mjs
```
Patru contexte de browser distincte (iPhone / Safari macOS / Chrome macOS / Chrome Windows) s-au autentificat cu același cont; apoi s-a deschis `/app/settings` și s-a extras textul panoului „Sessions" și s-a făcut o captură (`/tmp/sess-audit/ui-sessions.png`).

### 2.4 Producția (numai citire)

```sql
SELECT count(*) FROM "Session";                                  -- 268
SELECT ip, count(*) FROM "Session" GROUP BY ip;                  -- 17 adrese distincte
SELECT count(*) FILTER (WHERE "expiresAt" > now()) ...;          -- toate active
WITH u AS (...) SELECT per cont;                                -- distribuția pe conturi
SELECT action, count(*) FROM "AuditLog" WHERE action IN (...);   -- jurnalul
```
plus: `docker inspect blipmade-api-1|web-1|worker-1` (mediu), `docker exec … grep` (codul din build-ul deployat), `docker logs` (adresa observată de API).

---

## 3. Două configurații distincte: branch auditat vs. build-ul deployat

Acesta este un rezultat central al auditului și trebuie cunoscut înainte de a citi răspunsurile.

| Caracteristică | Branch `audit/post-remediation` (HEAD `29a86cc`) | Build-ul **deployat în producție** (imaginea `blipmade-api:latest`, construită 23.10 06:56, container recreat 18:08) |
|---|---|---|
| Coloana `Session.lastSeenAt` | da (migrarea `20261024110000_session_last_seen`) | **nu există** în baza de producție (`\d "Session"` → fără `lastSeenAt`) |
| Plafon de 20 de sesiuni pe cont | da (`MAX_SESSIONS_PER_USER`, `closeSessionsOverTheCap`) | **nu** (`grep -c "MAX_SESSIONS_PER_USER" /app/dist/plugins/auth.js` → `0`) |
| Lista filtrează sesiunile expirate | da (`expiresAt: { gt: new Date() }`) | **nu** (`where: { userId: user.id }` — fără filtru) |
| Garda per cont la autentificare (10/15 min) | da (`accountGuard`) | **nu** (absent din `dist/routes/auth.js`) |
| Rezolvarea adresei de client | `web/src/lib/client-address.mjs` (lanț citit **de la stânga**) | `server.mjs` vechi (lanț citit **de la dreapta**, ultimul element) + potrivire prin **subșir** a adresei |
| Limitarea per adresă la autentificare | `env.loginRateLimitMax` (implicit 10/15 min) | literal `max: 10` |
| Curățarea sesiunilor expirate | orară, în worker | orară, în worker (prezentă și în build-ul vechi) |

În întregul raport, marchez cu **[R]** ce este măsurat pe branch-ul auditat (stiva izolată, codul din repository) și cu **[P]** ce este măsurat pe build-ul deployat (producție).

---

## 4. Răspunsuri la cele 18 întrebări

| # | Întrebare | Răspuns scurt | Clasă |
|---|---|---|---|
| 1 | Sunt sesiuni genuin distincte? | **Da, sunt rânduri distincte în baza de date** — dar nu pot fi deosebite de utilizator: aceleași metadate (IP + browser) apar repetat. | VERIFIED |
| 2 | Se creează rânduri la fiecare autentificare / cerere / reînoire? | **La fiecare autentificare** (dacă nu se trimite un cookie valid al aceluiași cont). La cerere: **nu** (se scrie doar `lastSeenAt`, cel mult o dată la 5 min). Reînoire de token: **nu există**. | VERIFIED |
| 3 | Sunt sesiunile rotite corect? | **Da, în calea normală**: același rând, token nou, tokenul vechi respins cu 401. **Nu** în calea concurentă: două semnări paralele cu același cookie produc **două rânduri**. | VERIFIED |
| 4 | Sunt sesiunile expirate șterse / filtrate? | **[R]** filtrate din listă, șterse la prima folosire (3/3), curățate orar de worker. **[P]** **nu sunt filtrate** din listă în build-ul deployat (rămân vizibile până la curățarea orară). | VERIFIED |
| 5 | Sunt sesiunile revocate respinse de backend? | **Da**, verificat cu cereri autentice reale: tokenul revocat → **401** pe `/api/auth/require`. | VERIFIED |
| 6 | Cum sunt generate/stocate/comparate identificatorii? | 32 octeți aleatori (`crypto.randomBytes`) → base64url (43 caractere); stocate **ca hash SHA-256** (64 hex); comparate cu `findUnique` pe `tokenHash`. Tokenul brut nu ajunge niciodată în baza de date. | VERIFIED |
| 7 | Cum sunt configurate cookie-urile? Ce se întâmplă la deconectare? | `bm_session`: `Path=/; Expires=+14 zile; HttpOnly; SameSite=Lax` (+`Secure` când protocolul cererii este https); fără `Max-Age`. `bm_csrf`: `Max-Age=86400; Path=/; SameSite=Lax`, **fără** `HttpOnly` (prin design, double-submit). La deconectare: rând șters + `Max-Age=0; Expires=1970`. | VERIFIED |
| 8 | Sesiunea curentă este identificată corect? | **Da**: `request.sessionId` este setat la încărcare, iar lista marchează exact o sesiune `current=true`. Backendul știe care este sesiunea curentă. | VERIFIED |
| 9 | Poate o sesiune să revoke alta? | **Nu.** `DELETE /settings/sessions/:id` verifică `session.userId === user.id` → **404** pentru rândul altui cont; contul celuilalt rămâne neatins. | VERIFIED |
| 10 | Poate un atacator reutiliza un token revocat? | **Nu**: tokenul revocat → 401 imediat. Nici după schimbarea parolei (celelalte tokenuri → 401). | VERIFIED |
| 11 | Sesiunile sunt invalidate la schimbarea parolei / e-mailului / închiderea contului? | **Parolă: da** (celelalte sesiuni închise, curenta rămâne). **E-mail: NU** (sesiunile nu sunt atinse). **Închiderea contului: NU** (doar o cerere de revizie; sesiunea rămâne complet activă). | VERIFIED |
| 12 | Există sesiuni „pending MFA"? | **Nu există MFA în platformă** (zero potriviri pentru mfa/totp/otp/„second factor"). Singurul lucru „pending" din răspunsul `/settings` este `pendingEmail` (cererea de schimbare a adresei). Lista conține **doar sesiuni reale de server**. | VERIFIED |
| 13 | Backendul are încredere în anteturi proxy nesigure? | **Parțial.** API-ul ignoră `X-Real-IP`; citește `X-Forwarded-For` doar de la `TRUSTED_PROXIES`. Dar **web-ul** (nu API-ul) rescrie antetul, iar algoritmul lui nou citește lanțul **de la stânga** → o adresă forjată de client ajunge în sesiune când peer-ul este un proxy de încredere. | VERIFIED |
| 14 | Este adevărata adresă de client capturată în siguranță? | **[P] Nu, în producție.** 198 din 268 de sesiuni (74%) rețin adresa edge-ului Cloudflare, nu adresa clientului. **[R]** branch-ul corectează *citirea* lanțului, dar introduce o **regresie de falsificare** (§5, SESS-P1-03). | VERIFIED |
| 15 | Pot fi deosebite mai multe dispozitive cu aceeași adresă? | **Doar prin eticheta de browser**, dedusă din User-Agent. Nu există identificator de dispozitiv, amprentă sau alt signal. Două sesiuni cu același IP și același browser sunt **de nedistins** (captura de ecran). | VERIFIED |
| 16 | Poate utilizatorul închide toate celelalte sesiuni? | **Da**: `DELETE /api/settings/sessions` → `{"closed":N,"current":true}`; celelalte tokenuri → 401. Butonul există în interfață („Close all other sessions"). | VERIFIED |
| 17 | Arată interfața informații utile? Ce lipsește? | Arată: dispozitiv, „This Device", IP, „signed in on", „active X ago", butoane. **Lipsește:** localizare, un semn care deosebește două rânduri identice, totalul sesiunilor, indicator de trunchiere la 50, precizia ultimei activități, istoricul evenimentelor. | VERIFIED |
| 18 | Se afișează înregistrări duplicate sau expirate inutile? | **Expirate: nu** pe branch (da pe build-ul deployat). **Duplicate: da**, fără nicio diferențiere vizuală — exact simptomul din captură. | VERIFIED |

### 4.1 Detalii pe întrebări

**1. Sunt acestea sesiuni genuin distincte?**
Da la nivel de date: fiecare autentificare creează un rând nou cu `id` (cuid) și `tokenHash` propriu. Măsurat: contul cu cele mai multe sesiuni din producție are **182 rânduri**, dintre care 29 au *exact* aceeași pereche (IP `172.64.200.138`, User-Agent Chrome headless) — deci sunt rânduri distincte create de aceeași mașină/unealtă. Nu sunt „duplicate" în sensul de copii accidentale, ci **acumulare nelimitată**, fără plafon în build-ul deployat și fără nicio informare în interfață care să le deosebească.

**2. Când se creează rânduri?**
- La **autentificare**: `createSession()` → dacă cererea *nu* poartă un cookie valid al aceluiași cont → `INSERT`. Măsurat: 6 logins paralele → 6 rânduri.
- La **cerere**: `loadSession()` rulează la fiecare cerere, dar scrie doar `lastSeenAt`, și doar dacă au trecut 5 minute. Măsurat: după înregistrare `lastSeenAt` este NULL; prima cerere îl scrie; o cerere în interiorul ferestrei de 5 min nu îl rescrie; după 6 minute îl rescrie.
- La **reînoire de token**: **nu există** mecanism de reînoire (`grep -rn "refresh|renew|extend" api/src/routes/*.ts` → nimic relevant). Cookie-ul este o sesiune de 14 zile, fără expirare glisantă.

**3. Rotirea**
`openSession()` caută rândul după hash-ul tokenului purtat și, dacă aparține aceluiași cont și nu e expirat, **actualizează același rând** cu token nou. Măsurat: numărul de rânduri nu se schimbă, tokenul se schimbă, tokenul vechi → 401. Excepție: dacă tokenul purtat aparține **altui cont**, se creează un rând nou (comportament corect, testat în `sessions.test.ts`).

**4. Expirarea**
- Lista (`GET /settings` și `GET /settings/sessions`) filtrează `expiresAt > now()` pe branch → un rând expirat **nu apare**.
- `loadSession()` șterge rândul expirat când tokenul lui este folosit: măsurat 3 din 3 încercări (rândul a dispărut din baza de date).
- Workerul rulează `pruneSessions()` la fiecare oră (`api/src/worker.ts:199`).
- În producție: 0 sesiuni expirate din 268 (platforma are 2 zile), deci nu am putut observa acumularea de rânduri expirate în producție; **am observat însă** că build-ul deployat nu filtrează sesiunile expirate din listă (doar curățarea orară le elimină).

**5. Revocarea — cu cereri autentice, nu din interfață**
`DELETE /api/settings/sessions/{id}` → 200; apoi `GET /api/auth/require` cu același token → **401**. Același lucru pentru tokenurile de pe celelalte dispozitive după schimbarea parolei (→ 401) și după „Close all other sessions" (→ 401).

**6. Identificatorii**
`randomToken(32)` → `randomBytes(32).toString('base64url')` → 43 de caractere, ~256 biți de entropie. Stocat `hashToken(token)` = SHA-256 hex (64 de caractere) în coloana `tokenHash` (unică). Verificat: tokenul brut **nu** apare în baza de date, iar `sha256(token)` coincide cu valoarea stocată. Comparația se face cu `findUnique({ where: { tokenHash } })` — căutare pe hash, deci o scurgere a bazei de date **nu** permite reluarea sesiunilor. (`SESSION_SECRET` este folosit pentru semnarea cookie-urilor `@fastify/cookie`, nu pentru generarea tokenului.)

**7. Cookie-urile**
```
set-cookie: bm_session=<…>; Path=/; Expires=<23:xx, +14 zile>; HttpOnly; SameSite=Lax
set-cookie: bm_csrf=<…>;   Max-Age=86400; Path=/; SameSite=Lax
```
Cu cerere peste https (peer de încredere + `x-forwarded-proto: https`) se adaugă `Secure`. Cu `COOKIE_SECURE=false` (setarea stivei izolate) `Secure` **nu** apare nici pe https. `SameSite=Lax` este potrivit pentru un panou pe aceeași origine; `Strict` ar fi mai restrictiv, dar ar strica linkurile de confirmare a adresei de e-mail — deci **nu** este o constatare.
La deconectare: `bm_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax` + rândul șters din baza de date.

**8. Sesiunea curentă**
`loadSession()` pune `request.sessionId = session.id`; `serializeSession()` compară `session.id === currentId`. Măsurat: lista returnată conține **exact o** sesiune cu `current=true`, cea a cererii. Răspunsul revocării spune și el `current: true` când rândul revocat era cel al cererii. Nu există ambiguitate nici când două sesiuni au același IP și același browser.

**9. Autorizație la nivel de obiect**
`findUnique` + verificare `session.userId !== user.id` → `notFound` (404). Măsurat: contul B a încercat să ștergă rândul contului A → **404**, iar contul A și-a păstrat sesiunile. Nu am găsit nicio cale prin care o sesiune să poată revoca alta.

**10. Reutilizarea unui token revocat**
Nu. Tokenul revocat → 401 la următoarea cerere. Rândul este șters fizic (`delete`), nu doar marcat.

**11. Invalidarea la schimbări**
- **Parolă** (`POST /settings/password`): `deleteMany({ userId, id: { not: current } })` → măsurat `closedSessions: 3`, celelalte tokenuri → 401, sesiunea curentă rămâne validă. La resetarea prin e-mail (`/auth/reset-password`) se șterg **toate** sesiunile, inclusiv cea curentă → corect.
- **E-mail** (`/settings/email/confirm`): tranzacția atinge doar `User` și `EmailChangeRequest`. **Nicio sesiune nu este ștearsă** (măsurat: 1 înainte, 1 după, tokenul încă valid). Inconsistent cu resetarea parolei.
- **Închiderea contului** (`/settings/account/closure`): doar `deletionRequestedAt`; **sesiunile rămân complet active** (măsurat: token → 200 după cerere). Proiectul documentează că „închiderea este o cerere, nu o ștergere" și testul `settings.test.ts` afirmă „is a request and deletes nothing" — deci este o decizie de proiect, dar **nu există nicio acțiune ulterioară** care să închidă sesiunile și niciun instrument de administrare pentru asta (§5, SESS-P1-06 și SESS-P1-12).

**12. „Sesiuni pending MFA"**
Platforma **nu are** al doilea factor: `grep -rni "mfa|twoFactor|totp|otp_|second factor"` pe tot repository-ul → zero potriviri. Nu există tabel, coloană sau stare de tip „pending". Ce conține lista: **doar sesiuni de server, create la autentificare**. Singurul element „pending" din `/settings` este `pendingEmail` (cererea de schimbare a adresei, cu expirare). Nu am verificat comportamentul unei stări MFA inexistente — l-am declarat inexistentă, nu „neverificată".

**13. Anteturile proxy nesigure**
- API-ul: `trustProxy: env.trustProxies` (implicit `127.0.0.1,::1`; în producție, `127.0.0.1,::1,172.16.0.0/12` prin `compose.api.yml`). `X-Real-IP` este **ignorat** (măsurat). Pentru `X-Forwarded-For` folosește `proxy-addr` (semantica „ultimul neîncredut"): măsurat, lanțul `203.0.113.99, 198.51.100.5` → se reține `198.51.100.5`. **API-ul este corect.**
- Web-ul: șterge `x-forwarded-for`, `x-real-ip`, `x-forwarded-host`, `x-forwarded-proto` din cererea clientului și le rescrie cu rezultatul propriu (corect). Dar **algoritmul de rezolvare al web-ului citește lanțul de la stânga** → dintr-un proxy de încredere, primul element al lanțului poate fi ales de client. Măsurat pe instanța 30005 (`TRUSTED_PROXY_IPS=127.0.0.1`): un `X-Forwarded-For: 203.0.113.99` trimis de client ajunge **înregistrat în sesiune**; și cu lanț `203.0.113.99, 198.51.100.5` se reține tot primul element.
- Web-ul cu peer **neîncredut** ignoră complet antetul (măsurat pe 30004) → poarta web-ului funcționează.

**14. Adevărata adresă de client**
- **Producție, măsurat (read-only)**: 268 de sesiuni, **17 adrese distincte**; **198 (74%)** sunt adrese de edge Cloudflare (`172.64.0.0/13`, `162.158.0.0/16`), **68 (25%)** sunt adrese private/interna (bridge-ul Docker `172.18.0.1/0.6`, gateway-ul `10.77.0.12`, VM-ul `10.77.0.13`), **2** sunt loopback, **0** nule. Jurnalul de audit al API-ului arată aceleași adrese Cloudflare ca `remoteAddress`.
- **Cauza (production build)**: `server.mjs` vechi folosește `chain[chain.length - 1]` — **ultimul** element, adică proxy-ul cel mai apropiat de server, nu clientul. Cloudflare trimite lanțul, Caddy îl prelungește, iar rezultatul e adresa edge-ului.
- **Ramura**: `resolveClientAddress()` citește primul element neîncredut de la stânga → ar obține adresa reală a clientului **dacă** edge-ul nu rescrie lanțul; dar aceeași regulă este falsificabilă (§5, SESS-P1-03).
- **Localizare**: platforma nu are nicio bază de date geografică; nici cu adresa corectă, localizarea nu poate fi dedusă fără un serviciu extern, deci **localizarea aproximativă nu este disponibilă legitim** astăzi (§6).

**15. Deosebirea dispozitivelor cu aceeași adresă**
Numai eticheta de browser, construită din User-Agent (`describeAgent()`): browser + sistem + versiune + model. Nu există identificator de dispozitiv, amprentă, `Sec-CH-UA-*` sau orice alt signal. Două rânduri cu același IP și același User-Agent sunt identice în interfață — captură de ecran: două rânduri „Safari on iOS 18.7 (iPhone)", același IP, același minut, diferența fiind doar „This Device" și „active just now" vs. „no activity recorded".

**16. Închiderea tuturor celorlalte sesiuni**
`DELETE /api/settings/sessions` → `{"closed":N,"current":true}`; sesiunea cererii rămâne; celelalte tokenuri → 401. Butonul există în interfață. Funcționează.

**17. Interfața**
Ce arată: `device` („Chrome on macOS 10.15.7"), insigna „This Device", `ip · signed in on <data> · active <relative>`, butonul „Close session"/„Sign out" pe rând și „Close all other sessions".
Ce lipsește: localizare (indisponibilă fără sursă externă — dar **se poate marca explicit** „adresă internă / necunoscută"), o distincție vizibilă între două rânduri identice, totalul sesiunilor și avertismentul de trunchiere la 50, precizia ultimei activități („no activity recorded" este criptic), istoricul evenimentelor de sesiune (jurnalul există în `AuditLog` dar nu e expus), și faptul că adresa afișată poate fi adresa unui proxy, nu a clientului.

**18. Duplicate și expirate**
Expirate: filtrate pe branch (nu pe build-ul deployat). Duplicate: **nu sunt eliminate și nu sunt diferențiate**. Nu propun deduplicare — propun diferențiere (§6).

---

## 5. Constatări

### SESS-P1-01 — Producția rulează un build înainte de remediere: fără plafon de sesiuni, fără „last activity", fără filtrarea expiratelor
- **Severitate:** **Înalt (High)** · **Modul:** `api/src/plugins/auth.ts` (plasat în cod, absent din build), `api/prisma/migrations/20261024110000_session_last_seen`, `api/src/routes/settings.ts`
- **Observat:** build-ul deployat în producție nu conține `MAX_SESSIONS_PER_USER`/`closeSessionsOverTheCap` (`grep` în `/app/dist/plugins/auth.js` → `0`), nu scrie `lastSeenAt` (coloana nu există în baza de producție) și `GET /settings/sessions` nu filtrează `expiresAt`. Un cont din producție are **182 de sesiuni active**; interfața arată doar 50, fără niciun indicator. În același timp, `AuditLog` arată **318 `auth.login`** și **0 `auth.logout`**, **1** singură revocație.
- **Așteptat:** codul din ramura auditată să fie cel deployat (sau o listă explicită a diferențelor); limită de sesiuni pe cont; migrările din ramură aplicate înainte de deploy.
- **Reproducere (read-only):**
  `docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SELECT count(*) FROM \"Session\";"` → 268;
  `docker exec blipmade-api-1 grep -c MAX_SESSIONS_PER_USER /app/dist/plugins/auth.js` → 0;
  `docker exec blipmade-postgres-1 psql … -c "\d \"Session\""` → fără `lastSeenAt`.
- **Cauză confirmată:** derivarea dintre ramura `audit/post-remediation` și imaginea deployată (`blipmade-api:latest`, construită 23.10 06:56) — commit-ul `36a75a7` („Fix the price contract, the client address and the admin permissions", 23.10 22:03) a adăugat migrarea și codul, dar nu a fost build-at și deploy-at.
- **Remediere:** rebuild + deploy al imaginii API pe commit-ul curent, aplicarea migrărilor (`prisma migrate deploy`) înainte de a porni workerul, și un control de release care verifică `SELECT COUNT(*) FROM _prisma_migrations` împotriva listei de migrări din ramură.
- **Criteriu de verificare:** în producție, `lastSeenAt` este populat, contul cu cele mai multe sesiuni are ≤ 20 de rânduri active, iar `GET /api/settings/sessions` nu întoarce rânduri expirate.

### SESS-P1-02 — Adresa de client înregistrată este adresa proxy-ului, nu a clientului
- **Severitate:** **Înalt (High)** · **Modul:** `web/server.mjs` (build-ul deployat), `web/src/lib/client-address.mjs`
- **Observat:** în producție **198 din 268** de sesiuni (74%) rețin adresa edge-ului Cloudflare; 68 rețin adrese private interne; **niciuna** nu reține adresa publică a clientului. Toate adresele din UI sunt, practic, aceleași pentru toți clienții care trec prin același edge.
- **Așteptat:** în sesiune și în jurnal să fie scrisă adresa reală a clientului (sau, explicit, adresa proxy-ului **marcată ca atare**).
- **Reproducere (read-only):**
  `SELECT ip, count(*) FROM "Session" GROUP BY ip ORDER BY 2 DESC;` și
  `docker logs blipmade-api-1 | grep remoteAddress | sort | uniq -c` (predomină `172.64.*`, `162.158.*`, `172.69.*`).
- **Cauză confirmată:** în build-ul deployat, `clientAddress()` întoarce `chain[chain.length - 1]` — ultimul element al lanțului, adică proxy-ul cel mai apropiat, în locul primului element (clientul).
- **Remediere:** a) edge-ul (Caddy) trebuie să **rescrie** `X-Forwarded-For` cu adresa reală (ex. `header_up X-Forwarded-For {http.request.header.CF-Connecting-IP}` sau `{client_ip}` cu `trusted_proxies` configurat pentru Cloudflare) — singura variantă sigură; b) web-ul trebuie să citească lanțul **de la dreapta**, ca `proxy-addr` (vezi SESS-P1-03); c) lista `TRUSTED_PROXY_IPS` trebuie să cuprindă intervalele Cloudflare folosite de testele din repo (`172.64.0.0/13`, `162.158.0.0/16`), nu doar adresa gateway-ului.
- **Criteriu de verificare:** după deploy, adresele din `Session.ip` sunt publice și diferite per client; un control automat (synthetic request prin edge cu un `X-Forwarded-For` forjat) confirmă că adresa forjată **nu** ajunge în baza de date.

### SESS-P1-03 — Regresie: algoritmul nou de rezolvare a adresei citește lanțul `X-Forwarded-For` de la stânga și poate fi falsificat
- **Severitate:** **Înalt (High)** · **Modul:** `web/src/lib/client-address.mjs` (`resolveClientAddress`), `web/tests/client-address.test.mjs`
- **Observat:** pe instanța 30005 (`TRUSTED_PROXY_IPS=127.0.0.1`, deci peer de încredere), o cerere cu `X-Forwarded-For: 203.0.113.99` a fost **înregistrată cu acea adresă în sesiune**; cu lanțul `203.0.113.99, 198.51.100.5` s-a reținut **primul** element, nu ultimul. Adresa ajunge și în jurnal (`AuditLog.ip`) și, prin `request.ip`, în cheia limitării.
- **Așteptat:** lanțul se citește **de la dreapta**, eliminând proxy-urile de încredere de la cel mai apropiat spre cel mai îndepărtat; primul element este singurul controlat de client și nu poate fi folosit ca identitate.
- **Reproducere:**
  `TRUSTED_PROXY_IPS=127.0.0.1 node server.mjs` (port 30005) → `curl -H 'X-Forwarded-For: 203.0.113.99' …/api/auth/login` → `SELECT ip FROM "Session"` → `203.0.113.99`.
  (Control: prin web 30004, cu peer neîncredut, antetul este ignorat → `127.0.0.1`.)
- **Cauză confirmată:** `resolveClientAddress()` parcurge `splitChain(forwardedFor)` de la stânga și întoarce primul element neîncredut; testul din repo fixează explicit această regulă („the chain of the header is read from the left, not from the right").
- **Remediere:** înlocuirea cu semantica `proxy-addr` — parcurgere de la dreapta, cu `socket` ca ultim element; plus rescrierea anteturilor la edge (SESS-P1-02); actualizarea testului `web/tests/client-address.test.mjs` cu cazul „client falsifică primul element".
- **Criteriu de verificare:** cerere prin edge cu `X-Forwarded-For: 203.0.113.99` → adresa înregistrată **nu** este `203.0.113.99`; cerere fără antet prin edge → adresa reală a clientului.

### SESS-P1-04 — Limitarea per adresă este de fapt per edge Cloudflare (cheie comună tuturor clienților)
- **Severitate:** **Înalt (High)** · **Modul:** `api/src/app.ts` (`keyGenerator: request.ip`), `api/src/routes/auth.ts` (`max: 10`)
- **Observat:** în producție, `request.ip` este adresa edge-ului Cloudflare (SESS-P1-02). Cheia limitării este chiar `request.ip`, iar bucla de autentificare are `max: 10` pe 15 minute, **iar garda per cont nu există în build-ul deployat**. Rezultă: (a) limita pe care o credeam „per client" este, de fapt, per edge — un atacator epuizează contorul unui edge și împiedică autentificarea tuturor clienților care trec prin acel edge; (b) 10 încercări de parolă per edge și 15 minute este un prag foarte mic de ghicire.
- **Așteptat:** limitarea per adresă să folosească adresa reală a clientului, iar limita per cont să existe în build-ul deployat.
- **Reproducere:** `docker exec blipmade-api-1 grep -n "keyGenerator" /app/dist/app.js` → `(request) => request.ip`; `docker exec blipmade-api-1 grep -n -A2 "auth/login" /app/dist/routes/auth.js` → `max: 10`; `docker exec blipmade-api-1 grep -c accountGuard /app/dist/routes/auth.js` → `0`.
- **Cauză confirmată:** combinația dintre SESS-P1-02 (adresa greșită) și lipsa gardei per cont în build-ul deployat.
- **Remediere:** deploy-ul build-ului curent (care are garda per cont) + SESS-P1-02; în plus, limitarea pe `/auth/login` să aibă o cheie compusă (adresa reală + cont) și un prag separat pentru eșecuri vs. reușite.
- **Criteriu de verificare:** `POST /api/auth/login` cu cont invalid de 11 ori → contorul per cont se declanșează, iar contorul per adresă **nu**; doi clienți diferiți din spatele aceluiași edge au contoare separate.

### SESS-P1-05 — Limitarea per cont numără și autentificările reușite
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/routes/auth.ts` (`accountGuard`, `max: 10`)
- **Observat:** 11 autentificări **corecte** consecutive cu același cont: primele 10 → HTTP 200, a 11-a → **HTTP 429** „Too many requests. Try again shortly." Contorul este pe adresa de e-mail a contului, cu fereastră de 15 minute, și se consumă la fiecare încercare, inclusiv la cele reușite.
- **Așteptat:** contorul să numere doar eșecurile (sau să aibă un prag separat pentru reușite), pentru ca un client cu conturi partajate sau cu mai multe dispozitive să nu fie blocat cu parola corectă.
- **Reproducere:** `for i in $(seq 1 11); do curl -o /dev/null -w "%{http_code}\n" -X POST $API/api/auth/login -d '{"email":"…","password":"…"}'; done` → `200 ×10`, apoi `429`.
- **Cauză confirmată:** `accountGuard(app, 10)` este aplicat ca `preHandler` pe `/auth/login` (și pe register), fără `skipSuccessfulRequests`.
- **Remediere:** `skipSuccessfulRequests: true` pentru garda per cont (rămâne un plafon separat, mai mare, pentru reușite, ex. 30/15 min), plus o excepție explicită pentru conturile cu rolul de echipă.
- **Criteriu de verificare:** 12 autentificări corecte consecutive pe același cont → toate 200; 11 autentificări greșite consecutive → 429 la a 11-a.

### SESS-P1-06 — Schimbarea adresei de e-mail nu încheie sesiunile
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/routes/settings.ts` (`/settings/email/confirm`)
- **Observat:** după o cerere și o confirmare reușite de schimbare a adresei, numărul de sesiuni rămâne neschimbat (1 → 1) și tokenul curent este încă valid (200). Tranzacția atinge doar `User` și `EmailChangeRequest`. În schimb, resetarea parolei șterge **toate** sesiunile.
- **Așteptat:** o schimbare confirmată a adresei de e-mail (un eveniment clasic de compromitere) să închidă celelalte sesiuni, cel puțin prin trimiterea unei notificări și a unui jurnal.
- **Reproducere:** `POST /api/settings/email` → `POST /api/settings/email/confirm` → `SELECT count(*) FROM "Session"` (ne schimbat) → `GET /api/auth/require` → 200.
- **Cauză confirmată:** lipsa oricărui `prisma.session.*` în handlerul de confirmare.
- **Remediere:** în aceeași tranzacție, ștergerea celorlalte sesiuni + un eveniment `settings.email_changed_sessions_closed`; trimiterea unei notificări către **adresa veche**.
- **Criteriu de verificare:** după confirmarea adresei, celelalte tokenuri → 401; sesiunea curentă rămâne; jurnalul conține evenimentul.

### SESS-P1-07 — Cererea de închidere a contului nu încheie sesiunile și nu există niciun instrument de administrare
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/routes/settings.ts` (`/settings/account/closure`), `api/src/routes/admin.ts`
- **Observat:** după `POST /settings/account/closure` (cu parola corectă și confirmarea `CLOSE MY ACCOUNT`), sesiunea rămâne complet activă (token → 200) și numărul de sesiuni nu se schimbă. Singura acțiune de administrare care închide sesiunile unui client este **suspendarea** contului (`admin.ts:313`), care este o măsură mult mai grea (blochează și serviciile).
- **Așteptat:** cererea de închidere să invalideze sesiunile (sau să le expireze la scurt) și să existe un instrument de administrare pentru „închide toate sesiunile unui client".
- **Reproducere:** `POST /settings/account/closure` → `GET /api/auth/require` → 200.
- **Cauză confirmată:** handlerul scrie doar `deletionRequestedAt`; nu există niciun capăt în `admin.ts` pentru sesiunile unui client.
- **Remediere:** a) expirarea sesiunilor la cererea de închidere (păstrând sesiunea curentă, ca la schimbarea parolei) sau marcarea contului ca „în lichidare" cu blocarea autentificării noi; b) un capăt de administrare `POST /admin/customers/:id/sessions/revoke` care închide sesiunile fără să suspende contul; c) o decizie documentată dacă suspendarea trebuie să rămână singura cale.
- **Criteriu de verificare:** după cererea de închidere, autentificările noi sunt refuzate; agentul poate închide sesiunile unui client fără suspendare.

### SESS-P1-08 — Cursă la rotire: două semnări simultane cu același cookie produc două sesiuni
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/plugins/auth.ts` (`openSession`)
- **Observat:** două cereri de autentificare paralele, ambele purtând **același** cookie valid, au produs **două rânduri** de sesiune; ambele tokenuri sunt valide, iar tokenul vechi este invalid (401). Secvența: cererea B găsește rândul abia după ce cererea A i-a schimbat `tokenHash` → `findUnique` nu mai găsește nimic → creează un rând nou.
- **Așteptat:** o singură sesiune pentru același dispozitiv; rotația să fie atomică.
- **Reproducere:** două `curl -b <jar> -X POST /api/auth/login` în paralel → `SELECT count(*) FROM "Session"` = 2.
- **Cauză confirmată:** citire-și-scriere neatomică (`findUnique` apoi `update`) fără tranzacție și fără `updateMany` condiționat pe vechiul `tokenHash`.
- **Remediere:** `prisma.session.updateMany({ where: { tokenHash: <vechiul>, userId }, data: { tokenHash: <nou> } })` într-o tranzacție, sau o coloană `deviceId` cu o constrângere de unicitate, pentru ca un dispozitiv să aibă o singură sesiune.
- **Criteriu de verificare:** 10 autentificări paralele cu același cookie → exact 1 rând.

### SESS-P1-09 — Lista de sesiuni este trunchiată la 50 fără niciun indicator
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/routes/settings.ts` (`take: 50`), `web/src/app/Settings.tsx`
- **Observat:** cu 56 de rânduri live, API-ul întoarce 50, iar răspunsul conține doar cheia `sessions` — **niciun total, niciun indicator de trunchiere**. În producție, contul cu 182 de sesiuni arată 50 de rânduri; 132 de sesiuni nu pot fi revocate individual, deși butonul „Close all other sessions" le șterge pe toate.
- **Așteptat:** răspunsul să spună câte sunt în total și interfața să avertizeze că lista este trunchiată.
- **Reproducere:** 56 de rânduri → `GET /api/settings/sessions` → `len(sessions) == 50`, fără total.
- **Cauză confirmată:** `take: 50` în ambele interogări, fără un contor suplimentar.
- **Remediere:** `total` în răspuns + „Showing 50 of N" în interfață + link „Show all" (paginare).
- **Criteriu de verificare:** răspunsul conține `total`; interfața arată numărul real.

### SESS-P1-10 — Interfața nu poate deosebi două sesiuni cu aceleași metadate
- **Severitate:** **Mediu (Medium)** · **Modul:** `web/src/app/Settings.tsx`, `web/src/lib/api.ts` (`sessionSummary`)
- **Observat:** captură de ecran: două rânduri consecutive „Safari on iOS 18.7 (iPhone)", același IP, același minut al autentificării, diferența fiind doar „This Device" și „active just now" vs. „no activity recorded". Clientul nu poate decide pe care să le închidă și nu poate afla de unde vine fiecare. „no activity recorded" este o formulare neclară pentru „nu a mai fost folosită".
- **Așteptat:** fiecare rând să poată fi recunoscut (ultima activitate la nivel de minut, un marcaj „dispozitiv nou" / „prima autentificare", poziție în listă, eventual un sufix de identificare).
- **Reproducere:** 4 contexte de browser cu același cont → `/app/settings` → textul extras (vezi §2.3).
- **Cauză confirmată:** șirul afișat este `${ip} · signed in on ${createdAt} · ${activity}`; `createdAt` are precizie de milisecundă dar se afișează la minut, iar `lastSeenAt` lipsește pentru sesiunile nefolosite.
- **Remediere:** fără deduplicare (nici după IP, nici după User-Agent) — așa cum s-a cerut: rândul trebuie să poarte informație **discriminatorie**, nu să fie ascuns.
- **Criteriu de verificare:** două rânduri cu aceleași metadate sunt vizibil diferite (vezi §6).

### SESS-P1-11 — Adresa afișată poate fi o adresă internă sau de proxy, fără nicio marcă
- **Severitate:** **Mediu (Medium)** · **Modul:** `api/src/routes/settings.ts` (`serializeSession`), `web/src/lib/api.ts`
- **Observat:** interfața afișează adresa brută (`10.77.0.12`, `172.18.0.1`, `127.0.0.1`) fără nicio distincție între „adresa clientului" și „adresa unui proxy intern". 68 din 268 de sesiuni din producție au adrese private.
- **Așteptat:** fiecare adresă să fie etichetată ("adresă internă / proxy cunoscut / necunoscută"), iar localizarea să fie afișată **doar dacă este disponibilă legitim** (astăzi nu este).
- **Reproducere:** `SELECT ip, count(*) FROM "Session" GROUP BY ip;` → 68 de adrese RFC1918.
- **Cauză confirmată:** `serializeSession()` trimite `ip` brut, fără clasificare.
- **Remediere:** clasă `ipKind: 'public' | 'private' | 'proxy' | 'unknown'` în API + etichetă în interfață; ascunderea adreselor interne în fața clientului.
- **Criteriu de verificare:** în interfață, o adresă privată este marcată explicit și nu este prezentată ca „locație".

### SESS-P1-12 — Nu există expirare glisantă: o sesiune activă expiră la 14 zile de la ultima *autentificare*
- **Severitate:** **Scăzut / Informativ (Low-Info)** · **Modul:** `api/src/plugins/auth.ts` (`SESSION_TTL_MS`, `loadSession`)
- **Observat:** `expiresAt` este prelungit doar la rotire (autentificare). `loadSession()` actualizează doar `lastSeenAt`. Un client care folosește platforma zilnic este deconectat după 14 zile de la ultima autentificare; în schimb, o sesiune fără activitate rămâne vie 14 zile.
- **Așteptat:** fie expirare glisantă (prelungirea termenului la activitate, cu plafon), fie o notificare înainte de expirare.
- **Reproducere:** `SESS_TTL_MS = 1000*60*60*24*14` (`api/src/plugins/auth.ts:12`); `expiresAt` neschimbat de `loadSession`.
- **Remediere:** prelungirea termenului cu cel mult o dată pe zi, la activitate, până la un plafon (ex. 30 de zile), plus un mesaj în interfață înainte de expirare.
- **Criteriu de verificare:** după 13 zile de activitate continuă, sesiunea nu expiră brusc.

### SESS-P1-13 — Stiva de test „izolată" de pe portul 30002 scrie în baza de date de producție
- **Severitate:** **Mediu (Medium)** · **Modul:** infrastructură de test (`/opt/blipmade`, procese `node server.mjs`)
- **Observat:** `ps` arată trei procese `node server.mjs`; cel de pe 30002 are `API_URL=http://127.0.0.1:3100` — **API-ul de producție** (containerul `blipmade-api-1`, baza `blipmade`) — în timp ce cel de pe 30003 are `API_URL=http://127.0.0.1:3101` (API de test → `blipmade_test`). Confirmare în baza de producție: există conturi create de unelte de audit (`qa.headless.one@example.test` cu **182 de sesiuni**, `qa.headless.two@example.test`, `browser-admin@blipmade.test`, `browser-customer@blipmade.test`) — conturi care nu aparțin clienților și **s-au scris în producție**.
- **Așteptat:** stiva de test să nu poată ajunge la producție; un control care să refuză pornirea unei instanțe de test cu `API_URL` spre API-ul de producție.
- **Reproducere (read-only):** `tr '\0' '\n' < /proc/<pid>/environ | grep API_URL`; `SELECT email FROM "User" ORDER BY "createdAt" DESC LIMIT 8;` pe `blipmade`.
- **Cauză confirmată:** parametrizarea manuală a lui `API_URL` per instanță, fără o verificare că baza de date țintă are sufixul `_test`.
- **Remediere:** a) oprirea folosirii portului 30002 sau redirecționarea lui spre API-ul de test; b) în `web/server.mjs` și în `api/src/env.ts`, refuzul pornirii dacă `DATABASE_URL` nu se termină în `_test` și `NODE_ENV=test` (există deja un asemenea plasă în `api/tests/setup.ts` — modelul există); c) curățarea conturilor de test din producție, cu acordul lead-ului.
- **Criteriu de verificare:** nicio instanță cu `NODE_ENV=test` nu poate porni cu o bază de date care nu are sufixul `_test`; după curățare, producția nu mai conține conturi de audit.

### SESS-P1-14 — Observații de cod: `env.cookieSecure` este cod mort, iar potrivirea adreselor de proxy din build-ul vechi este prin subșir
- **Severitate:** **Scăzut / Informativ (Low-Info)** · **Modul:** `api/src/env.ts:128`, build-ul vechi `web/server.mjs`
- **Observat:** `env.cookieSecure` este calculat (din `APP_ORIGIN`) dar **nu este folosit nicăieri** — regula efectivă este `resolveCookieSecure(request)`. În build-ul deployat, `isTrustedProxy()` face `TRUSTED_PROXY_IPS.includes(address)` — potrivire prin **subșir**: cu `TRUSTED_PROXY_IPS=10.77.0.12`, și `10.77.0.120` sau `110.77.0.12` ar fi considerate de încredere. Ramura curentă a înlocuit cu parsare CIDR corectă (`parseTrustedProxies`).
- **Așteptat:** `env.cookieSecure` eliminat (sau folosit), iar potrivirea adreselor exactă sau pe intervale.
- **Reproducere:** `grep -rn "cookieSecure" api/src` → o singură apariție (definirea); `docker exec blipmade-web-1 grep -n "includes(normalizeAddress" /app/server.mjs`.
- **Remediere:** eliminarea câmpului mort; păstrarea parsării CIDR din ramură (inclusă la deploy).
- **Criteriu de verificare:** `grep -rn "cookieSecure" api/src` → fără cod mort.

---

## 6. Propunere de interfață

**Principiu:** nicio deduplicare (nici după IP, nici după User-Agent, nici după eticheta dispozitivului). Fiecare sesiune rămâne un rând; problema se rezolvă dând fiecărui rând informație **discriminatorie** și un control clar.

### 6.1 Ce arată un rând

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● Chrome pe macOS 10.15.7            [ Acest dispozitiv ]   [ Neprecizat ]  │
│   198.51.100.24 · ultima activitate: acum 3 min (23:41)                     │
│   Autentificat la 23:38 · sesiunea #a3f9…c1                                  │
│                                            [ Închide sesiunea ]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Câmp | Sursă | reguli |
|---|---|---|
| **Marcaj „Acest dispozitiv"** | `current` | există deja; se păstrează |
| **Nume dispozitiv** | `device` (User-Agent) | rămâne ca este; dacă User-Agent e absent → „Browser necunoscut" |
| **Marcaj „Dispozitiv nou"** | comparație cu ultimele 30 de zile | **nou** dacă nu există altă sesiune cu același `device` în fereastră → rezolvă direct simptomul din captură |
| **Adresă + tip** | `ip` + `ipKind` | „Adresă internă (proxy cunoscut)" / „Adresă privată" / adresa publică; **localizare doar dacă o sursă legitimă există** (astăzi nu există → nu se afișează) |
| **Ultima activitate** | `lastSeenAt` | „acum 3 min" + oră exactă la secundă (nu „no activity recorded" — se scrie „nu a fost folosită după autentificare") |
| **Autentificat la** | `createdAt` | oră exactă, cu secundele → diferențiază două rânduri deschise în același minut |
| **Identificator scurt** | `id` (prima și ultima grupă) | permite clientului să identifice rândul în suport, fără a expune identificatorul complet |
| **Buton** | `DELETE /settings/sessions/:id` | „Închide sesiunea" (pentru sesiunea curentă: „Deconectează acest dispozitiv") |

### 6.2 Ce fac controalele

| Control | Endpoint existent | Efect |
|---|---|---|
| „Închide sesiunea" (pe rând) | `DELETE /api/settings/sessions/:id` | există și funcționează; invalidarea este **imediată** (401 la cererea următoare) |
| „Deconectează acest dispozitiv" (rândul curent) | același endpoint + `logout()` | există |
| „Închide celelalte sesiuni" | `DELETE /api/settings/sessions` | există; **îmbunătățire propusă**: confirmare care spune *câte* sesiuni și *când* au fost deschise, nu doar un număr |
| „Deconectează toate dispozitivele" (inclusiv curent) | **endpoint nou** `DELETE /api/settings/sessions?all=true` (sau `POST /api/settings/sessions/revoke-all`) | lipsește; util pentru „ cineva e în contul meu" |
| **Nou**, la nivel de cont: „închide sesiunile unui client" (agent) | **endpoint nou de administrare** | lipsește (vezi SESS-P1-07) |
| **Nou**, în listă: „sunt 182 de sesiuni; arată primele 50" | total în răspuns + paginare | lipsește (SESS-P1-09) |
| **Nou**, contextual: „această sesiune este nouă / nu o recunoști" | comparație cu istoricul | rezolvă simptomul fără deduplicare |

### 6.3 Ce **nu** se face

- **Nu** se grupează și **nu** se ascund rândurile cu același IP sau același User-Agent — asta ar ascunde exact problema din captură.
- **Nu** se afișează o localizare inventată (geo-IP din baza brută, sau „aproximativ" fără sursă). Dacă în viitor se adaugă o sursă legitimă (ex. un furnizor de geo-IP cu contract și politici de confidențialitate), atunci locația intră în listă; până atunci, rândul arată adresa și tipul ei, și atât.
- **Nu** se schimbă modelul de date al sesiunilor pentru a „inventa" o poziție: lipsa identificatorului de dispozitiv este un fapt, iar UI-ul trebuie să-l spună („dispozitiv necunoscut"), nu să-l mascheze.

---

## 7. Ce nu am putut verifica (și de ce)

1. **Comportamentul edge-ului Caddy/Cloudflare privind `X-Forwarded-For`** (suprascrie sau concatenare). Motiv: cheia SSH nu e acceptată pe `10.77.0.12`, iar `Caddyfile`-ul nu e în repository. **Impact:** nu pot afirma cu certitudine dacă, după deploy-ul ramurii, adresa înregistrată va fi cea reală a clientului sau una falsificabilă. Am măsurat însă *algoritmul* ramurii pe o instanță controlată (SESS-P1-03) și am măsurat *efectul* actual în producție (SESS-P1-02).
2. **Sesiunile în Firefox și WebKit** — mediul nu le are. Am verificat doar Chromium.
3. **Comportamentul după deploy al ramurii în producție** — nu am făcut deploy (interzis). Toate măsurătorile de comportament sunt pe stiva izolată; diferențele față de build-ul deployat sunt enumerate în §3.
4. **Identitatea reală a clienților din cele 268 de sesiuni de producție.** Am raportat doar adrese și agregate, fără să numesc clienți; numerele mari (182, 29, 21, 20, 15) aparțin unor conturi create de unelte de audit (`*.example.test`, `*.blipmade.test`) — nu clienților reali. Cei trei operatori reali au 29, 21 și 20 de sesiuni.
5. **Curățarea periodică a sesiunilor expirate în producție** — există codul (`worker.ts`, `setInterval(…, 60*60_000)`) și l-am verificat în build-ul deployat, dar nu am putut *observa* o curățare: în producție sunt 0 sesiuni expirate (platforma are două zile). Am observat, în schimb, că build-ul deployat nu le filtrează din listă înainte de curățare.
6. **Fluxuri MFA / al doilea factor** — nu există în platformă; nu era nimic de testat.
7. **Schimbarea adresei de e-mail — pasul de confirmare complet.** E-mailul nu este livrat în stiva izolată („delivery: written-to-file", `delivered: false`), deci tokenul de confirmare nu a putut fi obținut din mesaj. Concluzia din SESS-P1-06 se bazează pe **codul handlerului** (`/settings/email/confirm` nu conține nicio operație pe `Session`) și pe observația că numărul de sesiuni nu se schimbă după cererea de schimbare — nu pe o confirmare completă. Nu am citit fișierul de e-mail scris pe disc (n-ar fi necesar pentru concluzie).
8. **Comportamentul la o încărcare masivă a listei** (peste 50 de rânduri) în interfața reală — am măsurat trunchierea la nivel de API; randarea în browser peste 50 de elemente n-a fost măsurată.
9. **Efectul real al limitării per adresă asupra disponibilității în producție** — mecanismul este demonstrat (cheia este `request.ip` = adresa edge-ului), dar *gradul* de coliziune între clienți și edge-uri Cloudflare nu poate fi măsurat de aici; depinde de rutarea anycast.

---

## 8. Anexă — dovezi brute (fără tokeni, fără cookie-uri, fără parole)

```
# producție (read-only)
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SELECT count(*) FROM \"Session\";"                    -- 268
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SELECT ip, count(*) FROM \"Session\" GROUP BY ip ORDER BY 2 DESC;"
   -- 198 Cloudflare edge / 68 private+internal / 2 loopback / 0 null ; 17 adrese distincte
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SELECT count(*) FILTER (WHERE \"expiresAt\">now()) FROM \"Session\";"  -- 268 (toate active)
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "SELECT action,count(*) FROM \"AuditLog\" WHERE action LIKE '%session%' OR action LIKE '%login%' OR action LIKE '%password%' OR action LIKE '%closure%' GROUP BY action;"
   -- auth.login=318, settings.session_revoked=1, logout=0, password_changed=0, password_reset=0

# build-ul deployat vs. ramura
docker exec blipmade-api-1 grep -c "MAX_SESSIONS_PER_USER\|lastSeenAt" /app/dist/plugins/auth.js    -- 0
docker exec blipmade-postgres-1 psql -U blipmade -d blipmade -c "\d \"Session\""                      -- fără lastSeenAt
docker exec blipmade-api-1 grep -n -A3 "settings/sessions" /app/dist/routes/settings.js               -- where:{userId} fără expiresAt
docker exec blipmade-api-1 grep -c accountGuard /app/dist/routes/auth.js                             -- 0
docker exec blipmade-web-1 grep -n "chain\[chain.length" /app/server.mjs                             -- ultima adresă din lanț

# măsurători pe stiva proprie (sessaudit_test)
login fără cookie            -> +1 rând ; login cu cookie valid -> același rând, token nou, token vechi 401
6 logins paralele            -> 6 rânduri, 6 tokenuri valide
2 logins paralele, același cookie -> 2 rânduri, ambele tokenuri valide
revocare + GET /api/auth/require  -> 401
DELETE cross-cont            -> 404
cookie lipsă/gol/gunoi/trunchiat  -> 401,401,401,401
rând expirat: absent din listă ; folosit -> 401 și rândul șters (3/3)
parolă nouă                  -> closedSessions=3 ; celelalte tokenuri 401 ; curentul 200
schimbare e-mail             -> sesiuni neschimbate, token încă 200
cerere închidere cont        -> sesiune încă 200
DELETE /settings/sessions    -> {"closed":1,"current":true}
plafon 20                    -> rămân 20, se închide cel mai vechi, 1 rând în jurnal cu reason=session_cap
11 logins corecte            -> 200 x10 apoi 429
XFF forjat către API (peer de încredere) -> adresa forjată înregistrată
X-Real-IP                     -> ignorat
XFF prin web cu peer neîncredut -> ignorat
XFF prin web cu peer de încredere -> înregistrat (regresie)
COOKIE_SECURE nesetat + https -> Secure ; COOKIE_SECURE=false -> fără Secure
56 rânduri                    -> API-ul întoarce 50, fără total
token brut în DB             -> absent ; sha256(token) == tokenHash stocat
```

**Instanțe create de acest audit, pentru curățare ulterioară de către lead:** baza `sessaudit_test` (containerul PostgreSQL), API-ul `127.0.0.1:3111` și web-ul `127.0.0.1:30004` (procese `node dist/index.js` din `/tmp/api-check` și `node server.mjs` din `/tmp/web-check`) — **rulate în continuare**, ca dovezile să poată fi verificate; API-ul `127.0.0.1:3112` și web-ul `127.0.0.1:30005` (sondaje punctuale) au fost **oprite** după măsurători. Scripturile și capturile sunt în `/tmp/sess-audit/` pe VM. Niciun fișier din repository nu a fost modificat; nicio bază de date de producție nu a fost scrisă.
