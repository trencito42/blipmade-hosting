# CUSTOMER-JOURNEYS — Testarea călătoriei clientului după remediere

**Fază:** 2 (Customer Journey Testing) din auditul post-remediere
**Data:** 23–24 octombrie 2026
**Commit:** `a549381` („Add the infrastructure and recovery audit"), ramura `remediation/phase-2-critical-fixes` pe VM 103 (`/opt/blipmade`). Commitul `e990776` este cel la care se referă brief-ul de fază; între timp s-a adăugat `a549381`.
**Mediu:** stivă izolată proprie — web `:30006`, API `:3112`, worker `:3113`, baza `cj_test`, Redis DB 3, panou Pterodactyl simulat, căsuță de e-mail locală.
**Autor:** agent de audit, faza 2.

---

## 1. Mediu, substituții și limite

### 1.1 Mediul de test

| Componentă | Adresă | Rol |
|---|---|---|
| Web (interfața) | `http://127.0.0.1:30006` (forward local `13006` → VM 103:30006) | interfața reală a clientului, build Vite servit de `web/server.mjs`; proxy `/api` către `:3112` |
| API | `http://127.0.0.1:3112` (forward `13112`) | API-ul real, construit din același commit (`/tmp/cj-api/dist`) |
| Worker (BullMQ) | `127.0.0.1:3113` | coada de provisionare, sweep-ul de facturare, curățarea sesiunilor |
| Bază de date | `postgresql://…@localhost:5432/cj_test` | bază **proprie**, distinctă de `blipmade` (producție) și de `blipmade_test` (compartizată cu ceilalți auditori) |
| Redis | `redis://localhost:6379/3` | indexul 3, distinct de coada platformei |
| Catalog | 5 produse seed-uite: `wordpress`, `code-server`, `discord-bot`, `uptime-kuma`, `postgresql` | `uptime-kuma` este `deployable: false` / `availability.state = COMING_SOON`; toate pe același ou de panou (egg 15) |
| Conturi seed-uite | client `qa.check@example.test` / `CorrectHorseBattery9`; personal `admin.check@example.test` / `CorrectHorseBattery9` | rolurile `CUSTOMER` și `ADMIN` |

**Două corecții de configurație au fost necesare în sandbox înainte de a putea măsura** (nu sunt defecte ale platformei, dar orice reproducere trebuie să le știe): `APP_ORIGIN`, `APP_PUBLIC_URL` și `PUBLIC_WEB_URL` erau setate pe `http://127.0.0.1:30005`, un port pe care nu asculta nimic — de aceea linkurile din e-mail și adresa de plată ar fi fost rupte; au fost setate pe `:30006`, portul real al interfeței. Iar adresa de alocare a nodului (`10.77.0.11`) nu exista pe mașină, așa că a fost adăugată ca alias pe `lo` și s-a pornit un responder HTTP local pe porturile alocate.

Verificarea izolării a fost făcută explicit: `web/server.mjs` de pe `:30006` are `API_URL=http://127.0.0.1:3112` (nu `:3100`, care este API-ul de producție). Baza folosită este `cj_test`; portul 30002, `https://blipmade.com` și `http://10.77.0.13:3000` nu au fost folosite. Nu s-a executat niciun `pkill`/`killall`; fiecare proces oprit a fost oprit după PID-ul lui, iar după fiecare oprire s-a verificat că stiva comună (`:3101`, `:30003`) răspunde în continuare.

### 1.2 Cum sunt substituite sistemele externe

| Sistem extern | Substitute | Ce acoperă | Ce NU acoperă |
|---|---|---|---|
| Panoul Pterodactyl | **stub** `/tmp/cj-panel-stub.mjs` pe `127.0.0.1:3199` (API aplicație) | creare server, utilizator de panou, alocare de adresă, stare a serverului, metrici, fișiere, keymint per client | panoul real, Wing, izolarea containerelor, limitele reale de resurse ale nodului |
| Aplicația care rulează pe nod | **responder** HTTP local pe `10.77.0.11:25565‑25572` (adresa de alocare a nodului, adăugată ca alias pe `lo`) | sonda de sănătate a platformei (`health_verified`) | comportamentul real al aplicației instalate |
| Trimiterea e-mail | **sink SMTP** pe `127.0.0.1:3525`, cititor HTTP pe `:3526` | e-mailurile reale emise de platformă și **tokenurile** din ele | livrare reală, bounce, SPF/DKIM |
| Stripe | `STRIPE_SECRET_KEY` gol + `STRIPE_TEST_MODE=true` → poarta locală de plată | coada comenzii, adresa de plată, confirmarea plății prin `POST /api/webhooks/stripe/test`, provisionarea condiționată de plată | Stripe real, webhook-urile Stripe, 3DS, taxele Stripe |
| DNS / Caddy / noduri reale | neconfigurate (`DOMAIN_BASE=""`, `CADDY_ADMIN_URL=""`) | — | domenii, certificate, rutare |

### 1.3 Ce NU am putut verifica

- **Firefox și WebKit:** binarele nu sunt instalate (`/opt/blipmade/tools/browser` conține doar Chromium). Toate măsurătorile de interfață sunt **Chromium-only**.
- Livrarea reală a e-mailurilor (sink-ul capturează, nu livrează).
- Webhook-urile Stripe reale, 3DS și taxele Stripe.
- Provisionarea pe Pterodactyl real (noduri, adrese, costuri de infrastructură).
- Domenii personalizate, certificate TLS, DNS.
- Recurența reală a facturării: s-a verificat **logica** (sweep, reînnoire, perioadă), nu trecerea timpului de 30 de zile.
- Comportamentul pe hardware real; doar Chromium headless, viewport 1440×900.
- E-mailurile de la **ResetPassword.tsx / VerifyEmail.tsx** ca pagini: linkul a fost consumat direct prin API cu tokenul real capturat, fără a se deschide pagina în browser (se notează explicit, vezi §7).

---

## 2. Metodologie și standardul de evidență

1. **Interfața reală, în browser.** Pașii de descoperire, comandă, facturare, suport și setări sunt executați în Chromium (Playwright, `/opt/blipmade/tools/browser/node_modules/playwright-core`, binar `/usr/bin/chromium`, prin `xvfb-run -a`) pe interfața reală de la `:30006`.
2. **API-ul pentru adevărul de server.** Verificări precum „prețul cotat este egal cu suma facturată" sau „o comandă neplătită nu produce instanțe" nu pot fi stabilite din interfață; ele sunt verificate prin apeluri directe, cu cookie de sesiune și header `X-CSRF-Token` (același mecanism ca în `web/src/lib.ts`).
3. **Regula CSRF.** Un `403 „Invalid or missing CSRF token."` este o protecție corectă, **nu** un defect. În acest raport este raportat ca defect numai dacă un flux legitim al interfeței eșuează din cauza lui. `POST /api/auth/login` este **exemptat prin design** (`api/src/plugins/csrf.ts:14-22`) — un endpoint care transportă doar credențiale; s-a verificat explicit că o cerere mutatoare **autentificată** fără token este refuzată.
4. **Standardul de evidență.** Un pas este `PASS` numai dacă s-a observat un rezultat concret (cod HTTP, rând în baza de date, e-mail capturat în sink, efect vizibil în interfață). `FAIL` = comportament observat diferit de cel așteptat. `WARN` = funcționează, dar încalcă o regulă declarată în cod sau în documentație. `INFO` = comportament documentat, consemnat pentru context. `BLOCKED` = pasul nu a putut fi executat în sandbox. **Nu există rezultate presupuse.**
5. **Fiecare defect are o cauză în cod**, cu `fișier:linie`, verificată în arborele-sursă al API-ului și al interfeței.
6. **Reproducibilitate.** Harnesses-ul, ieșirea brută și rezultatele JSON sunt în `_raw/journeys-*.txt` și `_raw/journeys-*.json`; scriptul de pornire a sandbox-ului este `_raw/sandbox-reset.sh`.

### 2.1 Ce a fost deja acoperit de celelalte rapoarte (nu se repetă)

Raportul nu reconstruiește inventarul de funcționalitate. Următoarele constatări **există deja** în rapoartele sursă; aici sunt doar confirmate, măsurate din perspectiva clientului și legate de impactul comercial:

| ID sursă | Raport | Ce adaugă faza 2 |
|---|---|---|
| FN-P1-03 | `FUNCTIONAL-COVERAGE.md` | confirmare + măsurare în interfață (vezi CJ-P1-01) |
| FN-P1-26 | `FUNCTIONAL-COVERAGE.md` | cauza root cause completă (vezi CJ-P1-02) |
| FN-P1-02 | `FUNCTIONAL-COVERAGE.md` | backend-ul de atașamente **funcționează** cu multipart real; lipsa este în interfață (vezi §6) |
| FN-P1-04 | `FUNCTIONAL-COVERAGE.md` | confirmare în interfață: pagina instanței nu are tab de metrici |
| SESS-P1-05 | `SESSIONS-INVESTIGATION.md` | măsurare proprie a gardei per cont (vezi CJ-P1-06) |
| SESS-P1-06 | `SESSIONS-INVESTIGATION.md` | schimbarea adresei nu închide sesiunile; plus lipsa parolei (CJ-P1-05) |
| ADM-P2-03 | `ADMIN-FUNCTIONALITY.md` | aceeași lipsă de paginare, dar pe **lista de bilete a clientului** (CJ-P1-04) |

---

## 3. Sumar pe arii de călătorie

### 3.1 Total pe arii de călătorie (API + interfață)

| Aria de călătorie | Pași | PASS | FAIL | BLOCKED | WARN | INFO |
|---|---|---|---|---|---|---|
| Identitate și cont | 43 | 41 | 0 | 0 | 1 | 1 |
| Descoperirea produsului | 22 | 21 | 0 | 0 | 1 | 0 |
| Provisionare (comandă → instanță) | 23 | 19 | 1 | 0 | 0 | 1 |
| Managementul serviciului | 21 | 16 | 0 | 1 | 4 | 0 |
| Facturare | 15 | 13 | 2 | 0 | 0 | 0 |
| Suport | 21 | 19 | 2 | 0 | 0 | 0 |
| **Total** | **145** | **129** | **5** | **1** | **6** | **2** |

Cele 5 FAIL-uri se reduc la **5 defecte distincte**, toate documentate în §5 cu cauză în cod: CJ-P1-01 (parametrul `checkout`, măsurat de două ori: API + interfață), CJ-P1-02 (nicio factură după plată), CJ-P1-03 (niciun e-mail de confirmare a biletului către client), CJ-P1-04 (lista de bilete nu se paginează). Al cincilea FAIL este același CJ-P1-01, măsurat la nivelul interfeței.

### 3.2 Nivel API (119 pași, rulare repetabilă: `_raw/journeys-api-run.txt`)

| Aria de călătorie | Pași | PASS | FAIL | BLOCKED | WARN | INFO |
|---|---|---|---|---|---|---|
| Identitate și cont | 36 | 34 | 0 | 0 | 1 | 1 |
| Descoperirea produsului | 18 | 17 | 0 | 0 | 1 | 0 |
| Provisionare (comandă → instanță) | 15 | 14 | 0 | 0 | 0 | 1 |
| Managementul serviciului | 20 | 16 | 0 | 0 | 4 | 0 |
| Facturare | 13 | 12 | 1 | 0 | 0 | 0 |
| Suport | 17 | 15 | 2 | 0 | 0 | 0 |
| **Total (nivel API)** | **119** | **108** | **3** | **0** | **6** | **2** |

### 3.3 Nivel interfață (26 pași, Chromium)

| Aria de călătorie | Pași | PASS | FAIL | BLOCKED | WARN |
|---|---|---|---|---|---|
| Descoperirea produsului | 4 | 4 | 0 | 0 | 0 |
| Identitate și cont | 7 | 7 | 0 | 0 | 0 |
| Provisionare (interfață) | 8 | 5 | 1 | 0 | 2 |
| Facturare | 2 | 1 | 1 | 0 | 0 |
| Suport | 4 | 4 | 0 | 0 | 0 |
| Managementul serviciului | 1 | 0 | 0 | 1 | 0 |
| **Total (nivel interfață)** | **26** | **22** | **1** | **1** | **2** |

Singurul FAIL de la nivelul interfață este **CJ-P1-01** (parametrul `checkout` ignorat de pagina de facturare). Un pas este BLOCKED pentru că contul creat în browser nu avea nicio instanță provisionată: comanda plasată din browser rămâne în `AWAITING_PAYMENT`, tocmai din cauza lui CJ-P1-01.

---

## 4. Călătoria clientului, pas cu pas


### 4.1 Identitate și cont
**Observații de călătorie.** Fluxul de identitate este, în ansamblu, **solid**: înregistrarea, verificarea adresei cu tokenul real, resetarea parolei, schimbarea profilului, schimbarea adresei, lista de sesiuni, revocarea individuală și în bloc, schimbarea parolei, deconectarea și închiderea contului au fost toate verificate cu rezultate concrete, inclusiv cu **tokenul real citit din e-mailul capturat**. Trei lucruri merită spuse:

- **Enumerarea de conturi este blocată pe autentificare, e-mail și resetare** (mesaje identice în toate cele trei cazuri), dar **nu și la înregistrare**: `POST /api/auth/register` răspunde 409 „An account already uses this email address." pentru o adresă deja folosită. Diferența este reală, dar este un tip standard de dezvăluire, cu impact mic.
- **Garda per cont numără și autentificările reușite** (CJ-P1-06): a 11-a autentificare corectă consecutivă este refuzată cu 429. Un client care se conectează de pe mai multe dispozitive, sau un client cu un cont partajat într-o firmă, poate ajunge la această limită fără să fi greșit vreodată o parolă.
- **Schimbarea adresei de e-mail nu cere parola** (CJ-P1-05), iar o adresă deja folosită este refuzată corect (400).

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 1. 1.1 Înregistrarea creează contul și deschide sesiunea | **PASS** | HTTP 201; user=cj.id.1792803399581@example.test; emailVerified=false; mail=delivered | HTTP 201, cont creat, e-mail de verificare trimis, sesiune deschisă | `{"status": 201, "body": "{\"user\":{\"id\":\"cmvlousps0000dxb9wzkv0k04\",\"email\":\"cj.id.1792803399581@example.test\",\"firstName\":\"CJ\",\"lastName\":\"Journey\",\"name\":\"CJ Journey\",\"role\":\"CUSTOMER\",\"emailVerified\":false,\"pterodactylUserId\":null,\"permissions\":[]},\"mail\":{\"state…` |
| 2. 1.2 Înregistrarea refuză o adresă deja folosită | **PASS** | HTTP 409: {"error":{"code":"conflict","message":"An account already uses this email address.","requestId":"req-4"}} | HTTP 409 | `{"status": 409, "body": "{\"error\":{\"code\":\"conflict\",\"message\":\"An account already uses this email address.\",\"requestId\":\"req-4\"}}"}` |
| 3. 1.3 Înregistrarea refuză o parolă slabă | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"Use at least 10 characters. Add an uppercase letter. Add a number.","requestId":"req-5","fields":{"password":"Use at l… | HTTP 400 care numește problema | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"Use at least 10 characters. Add an uppercase letter. Add a number.\",\"requestId\":\"req-5\",\"fields\":{\"password\":\"Use at least 10 characters. Add an uppercase let"}` |
| 4. 1.4 Înregistrarea refuză un nume incomplet | **PASS** | HTTP 400: {"error":{"code":"validation_failed","message":"Some fields need attention.","fields":{"firstName":"Enter this part of your name.","lastName":"Enter this part o… | HTTP 400 care numește câmpul | `{"status": 400, "body": "{\"error\":{\"code\":\"validation_failed\",\"message\":\"Some fields need attention.\",\"fields\":{\"firstName\":\"Enter this part of your name.\",\"lastName\":\"Enter this part of your name.\"},\"requestId\":\"req-6\"}}"}` |
| 5. 1.5 Autentificare cu date corecte | **PASS** | HTTP 200; user=cj.id.1792803399581@example.test; role=CUSTOMER | HTTP 200 + cookie de sesiune | `{"status": 200, "body": "{\"user\":{\"id\":\"cmvlousps0000dxb9wzkv0k04\",\"email\":\"cj.id.1792803399581@example.test\",\"firstName\":\"CJ\",\"lastName\":\"Journey\",\"name\":\"CJ Journey\",\"role\":\"CUSTOMER\",\"emailVerified\":false,\"pterodactylUserId\":null,\"permissions\":[]}}"}` |
| 6. 1.6 Parolă greșită refuzată, fără enumerare de conturi | **PASS** | greșit=401, necunoscut=401, mesaje identice=true; "Email or password is not correct." | HTTP 401 în ambele cazuri, cu același mesaj | `{"wrong": "Email or password is not correct.", "unknown": "Email or password is not correct."}` |
| 7. 1.7 Sonda de sesiune pentru vizitator anonim | **PASS** | HTTP 200; user=null | HTTP 200, user=null | `{"status": 200, "body": "{\"user\":null}"}` |
| 8. 1.8 Contul nou pornește neverificat | **PASS** | emailVerified=false | emailVerified=false până la folosirea linkului | `{"status": 200, "body": "{\"user\":{\"id\":\"cmvlousps0000dxb9wzkv0k04\",\"email\":\"cj.id.1792803399581@example.test\",\"firstName\":\"CJ\",\"lastName\":\"Journey\",\"name\":\"CJ Journey\",\"role\":\"CUSTOMER\",\"emailVerified\":false,\"pterodactylUserI"}` |
| 9. 1.9 Re-trimiterea e-mailului de verificare nu dezvăluie dacă contul există | **PASS** | existent=200, necunoscut=200, mesaje identice=true; "{"message":"If an account exists for that address, a confirmation link is on its way.","mail":{"configured":true}}" | HTTP 200 cu același mesaj în ambele cazuri | `{"existing": "{\"message\":\"If an account exists for that address, a confirmation link is on its way.\",\"mail\":{\"configured\":true}}", "unknown": "{\"message\":\"If an account exists for that address, a confirmation link is on its way.\",\"mail\":{\"configured\":true}}"}` |
| 10. 1.10 E-mailul de verificare este scris în căsuța de e-mail | **PASS** | token primit prin sink (2 mesaje noi captate) | Un e-mail de verificare ajunge în sink | `{"mails": ["Confirm your Blipmade email address", "Confirm your Blipmade email address"]}` |
| 11. 1.11 Linkul de verificare confirmă adresa | **PASS** | HTTP 204; emailVerified după= true | HTTP 2xx, contul devine verificat | `{"status": 204, "body": ""}` |
| 12. 1.12 Un token de verificare invalid este refuzat | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"This confirmation link is invalid or has expired.","requestId":"req-i"}} | HTTP 400 | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"This confirmation link is invalid or has expired.\",\"requestId\":\"req-i\"}}"}` |
| 13. 1.13 Cererea de resetare nu dezvăluie dacă contul există | **PASS** | existent=200, necunoscut=200, mesaje identice=true | HTTP 200, același mesaj | `{"existing": "{\"message\":\"If an account exists for that address, a reset link is on its way.\",\"mail\":{\"configured\":true}}", "unknown": "{\"message\":\"If an account exists for that address, a reset link is on its way.\",\"mail\":{\"configured\":true}}"}` |
| 14. 1.14 E-mailul de resetare a parolei este scris în căsuța de e-mail | **PASS** | token primit prin sink (1 mesaje noi) | Un e-mail de resetare ajunge în sink | `{"mails": ["Reset your Blipmade password"]}` |
| 15. 1.15 Tokenul de resetare schimbă parola | **PASS** | reset=204, login cu parola nouă=200, login cu parola veche=401 | HTTP 2xx la resetare, parola nouă merge, cea veche nu | `{"reset": "", "newStatus": 200, "oldStatus": 401}` |
| 16. 1.16 Un token de resetare invalid este refuzat | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"This reset link is invalid or has expired.","requestId":"req-u"}} | HTTP 400 | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"This reset link is invalid or has expired.\",\"requestId\":\"req-u\"}}"}` |
| 17. 1.17 Modificarea profilului este memorată | **PASS** | PATCH=200; citit înapoi profile.lastName="Renamed" | PATCH 200, valoarea se citește înapoi | `{"patch": "{\"firstName\":\"CJ\",\"lastName\":\"Renamed\"}", "settings": "{\"profile\":{\"firstName\":\"CJ\",\"lastName\":\"Renamed\",\"email\":\"cj.id.1792803399581@example.test\",\"emailVerified\":true,\"role\":\"CUSTOMER\",\"createdAt\":\"2026-10-24T00:56:39.904Z\"},\"pendingEmail\":null,\"pendin…` |
| 18. 1.18 Cererea de schimbare a adresei este acceptată | **PASS** | HTTP 200; pendingEmail=cj.changed.1792803399581@example.test; delivered=true | HTTP 200 cu pasul de confirmare | `{"status": 200, "body": "{\"pendingEmail\":\"cj.changed.1792803399581@example.test\",\"expiresAt\":\"2026-10-24T01:56:43.023Z\",\"delivery\":\"delivered\",\"delivered\":true,\"message\":\"A confirmation link is on its way to the new address.\"}"}` |
| 19. 1.19 Schimbarea adresei către adresa curentă este refuzată | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"That is already the address of this account.","requestId":"req-y","fields":{"email":"This account … | HTTP 400 | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"That is already the address of this account.\",\"requestId\":\"req-y\",\"fields\":{\"email\":\"This account already uses this address.\"}}}"}` |
| 20. 1.20 Schimbarea adresei către o adresă invalidă este refuzată | **PASS** | HTTP 400: {"error":{"code":"validation_failed","message":"email: Enter a valid email address.","requestId":"req-z","fields":{"email":"email: Enter a v… | HTTP 400 | `{"status": 400, "body": "{\"error\":{\"code\":\"validation_failed\",\"message\":\"email: Enter a valid email address.\",\"requestId\":\"req-z\",\"fields\":{\"email\":\"email: Enter a valid email address.\"}}}"}` |
| 21. 1.21 Linkul de confirmare schimbă adresa contului | **PASS** | confirm=200; email în sesiune=cj.changed.1792803399581@example.test | HTTP 200, sesiunea arată adresa nouă | `{"confirm": "{\"email\":\"cj.changed.1792803399581@example.test\"}", "session": "{\"user\":{\"id\":\"cmvlousps0000dxb9wzkv0k04\",\"email\":\"cj.changed.1792803399581@example.test\",\"firstName\":\"CJ\",\"lastName\":\"Renamed\",\"name\":\"CJ Renamed\",\"role\":\"CUSTOMER\",\"emailVerified\":true,\"pt…` |
| 22. 1.22 Lista de sesiuni arată toate dispozitivele deschise | **PASS** | HTTP 200; 4 sesiuni; current=1 | HTTP 200, câte o sesiune per dispozitiv | `{"status": 200, "sessions": [{"id": "cmvlouw2g001tdxb9rvnai2yu", "current": false, "device": "A browser", "ip": "127.0.0.1"}, {"id": "cmvlouvz7001pdxb9dv8bqs88", "current": false, "device": "A browser", "ip": "127.0.0.1"}, {"id": "cmvlouvv6001ldxb9degkax0h", "current": true, "device": "A browser", "…` |
| 23. 1.23 O sesiune poate fi revocată individual | **PASS** | DELETE=200; rămase 3 din 4 | HTTP 200, lista scade cu unu | `{"status": 200, "before": 4, "after": 3}` |
| 24. 1.24 „Închide toate celelalte sesiuni" deconectează celelalte dispozitive | **PASS** | DELETE=200; dispozitivul 2 → 401; dispozitivul 3 → 401 | HTTP 200 și 401 pe celelalte dispozitive | `{"status": 200, "b": 401, "c": 401}` |
| 25. 1.25 Schimbarea parolei închide celelalte sesiuni | **PASS** | POST=200; closedSessions=2; celălalt dispozitiv → 401 | HTTP 200, celălalt dispozitiv primește 401 | `{"status": 200, "body": "{\"changed\":true,\"closedSessions\":2}", "other": 401}` |
| 26. 1.26 Schimbarea parolei cere parola curentă corectă | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"The current password is not correct.","requestId":"req-1m","fields":{"currentP… | HTTP 400/401 | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"The current password is not correct.\",\"requestId\":\"req-1m\",\"fields\":{\"currentPassword\":\"The current password is not correct.\"}}}"}` |
| 27. 1.27 Preferințele de notificare pot fi citite și schimbate | **PASS** | GET=200, PUT=200, marketing citit înapoi=false | HTTP 200 la citire și la scriere, valoarea persistată | `{"get": "{\"preferences\":{\"productUpdates\":true,\"billing\":true,\"support\":true,\"incidents\":true,\"marketing\":false,\"updatedAt\":\"2026-10-24T00:56:45.202Z\"}}", "put": "{\"preferences\":{\"productUpdates\":false,\"billing\":true,\"support\":false,\"incidents\":true,\"marketing\":false,\"up…` |
| 28. 1.28 Două cereri simultane cu aceeași sesiune sunt acceptate | **PASS** | HTTP 200 / 200 | Ambele 200 | `{"a": 200, "b": 200}` |
| 29. 1.29 Două autentificări simultane de pe două dispozitive sunt acceptate | **PASS** | HTTP 200 / 200 | Ambele 200 | `{"a": 200, "b": 200, "body": "{\"user\":{\"id\":\"cmvlouwxd002kdxb980rxqwl2\",\"email\":\"cj.conc.1792803399581@example.test\",\"firstName\":\"CJ\",\"lastName\":\"Conc\",\"name\":\"CJ Conc\",\"role\":\"CUSTOMER\",\"em"}` |
| 30. 1.34 Contul de autentificare numără și autentificările reușite, nu doar pe cele greșite | **WARN** | 12 autentificări corecte pe un cont nou → coduri: 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429, 429; prima refuzare la poziția 11 | Un cont folosit legitim de mai multe ori (mai multe dispozitive) nu trebuie blocat după 10 autentificări reușite | `{"codes": [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 429, 429]}` |
| 31. 1.30 Deconectarea închide sesiunea curentă | **PASS** | POST /auth/logout=204; sesiune după=200 user=null | HTTP 204, sesiune închisă | `{"status": 204, "after": 200, "afterBody": "{\"user\":null}"}` |
| 32. 1.31 Închiderea contului cere parola și confirmarea scrisă, și poate fi anulată | **PASS** | cerere=200; confirmare greșită=400; anulare=200; services raportate=0 | HTTP 200 la cerere, 400 la confirmare greșită, 200 la anulare | `{"closure": "{\"requestedAt\":\"2026-10-24T00:56:47.602Z\",\"services\":0,\"subscriptions\":0,\"message\":\"The request is recorded. Your services keep running until the end of the period you paid for, and the team will write to you before anything is closed.\"}", "bad": "{\"error\":{\"code\":\"vali…` |
| 33. 1.32 Sesiunea are o expirare declarată | **PASS** | expiresAt=2026-11-07T00:56:45.180Z; createdAt=2026-10-24T00:56:45.181Z; TTL=14 zile | O expirare în viitor, vizibilă clientului | `{"session": {"id": "cmvlouwsd002ddxb9tox2w7u8", "ip": "127.0.0.1", "userAgent": "node", "createdAt": "2026-10-24T00:56:45.181Z", "lastSeenAt": "2026-10-24T00:56:45.195Z", "expiresAt": "2026-11-07T00:56:45.180Z", "current": true, "device": "A browser"}}` |
| 34. 1.33 O cerere mutatoare autentificată fără token CSRF este refuzată | **PASS** | HTTP 403: {"error":{"code":"forbidden","message":"Invalid or missing CSRF token. Reload the page and try again.","requestId":"req-31"}} | HTTP 403 „Invalid or missing CSRF token." | `{"status": 403, "body": "{\"error\":{\"code\":\"forbidden\",\"message\":\"Invalid or missing CSRF token. Reload the page and try again.\",\"requestId\":\"req-31\"}}"}` |
| 35. 1.33b Modificarea fără CSRF nu a schimbat nimic | **PASS** | profile.firstName=CJ | Profilul nu s-a schimbat | `{"profile": {"firstName": "CJ", "lastName": "Second", "email": "cj.id2.1792803399581@example.test", "emailVerified": false, "role": "CUSTOMER", "createdAt": "2026-10-24T00:56:43.733Z"}}` |
| 36. 1.33c Autentificarea este scutită de CSRF prin design (doar credențiale în corp) | **INFO** | POST /api/auth/login fără token CSRF → HTTP 200; lista de excepții este în api/src/plugins/csrf.ts:14-22 | Documentat explicit în lista de excepții; tokenul CSRF ar fi inutil pentru un endpoint care poartă doar credențiale | `{"status": 200}` |

### 4.2 Descoperirea produsului
**Observații de călătorie.** Catalogul, căutarea, filtrul de categorie, pagina de produs, prețul minim și recomandat, resursele minime și maxime, cotația și **refuzul explicit al configurațiilor sub minim sau peste maxim** funcționează cum trebuie. Un singur punct de atenționare: contractul public al API-ului expune un **preț activ** pentru `uptime-kuma`, care nu poate fi comandat (CJ-P1-12). **Interfața este corectă** — pagina de pornire și catalogul clientului îl marchează „Coming soon" și nu oferă butonul de comandă, iar cotația este refuzată cu un mesaj clar; defectul este de contract, nu de călătorie.

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 37. 2.1 Catalogul public afișează produsele | **PASS** | HTTP 200; 5 produse: wordpress, code-server, discord-bot, uptime-kuma, postgresql | HTTP 200 cu lista produselor | `{"status": 200, "count": 5}` |
| 38. 2.2 Fiecare produs din catalog are un preț activ | **PASS** | toate produsele au preț și carte de prețuri | Preț pentru fiecare produs listat | `{"products": [{"slug": "wordpress", "price": {"amount": 149, "currency": "EUR", "period": "MONTHLY"}, "pricingMinimum": 149, "pricingRecommended": 189}, {"slug": "code-server", "price": {"amount": 299, "currency": "EUR", "period": "MONTHLY"}, "pricingMinimum": 299, "pricingRecommended": 369}, {"slug…` |
| 39. 2.3 Catalogul publică prețul minim și pe cel recomandat | **PASS** | wordpress: minim=149 (512MB/1cpu/5GB), recomandat=189 (1024MB/1cpu/10GB) | O carte de prețuri cu minim și recomandat | `{"priceBook": {"currency": "EUR", "period": "MONTHLY", "minimum": {"ram": 512, "cpu": 1, "disk": 5, "amount": 149}, "recommended": {"ram": 1024, "cpu": 1, "disk": 10, "amount": 189}}}` |
| 40. 2.4 Fiecare produs publică resursele minime și maxime | **PASS** | wordpress: 512-8192MB/1-4cpu/5-100GB \| code-server: 1024-16384MB/1-4cpu/5-100GB \| discord-bot: 256-4096MB/1-2cpu/1-50GB \| uptime-kuma: 256-4096MB/1-2cpu/5-50GB \| postgresql: 1024-8192MB/1-4cpu/5-100GB | Minim și maxim pe fiecare produs | `{"products": [{"slug": "wordpress", "minRam": 512, "maxRam": 8192, "minCpu": 1, "maxCpu": 4, "minDisk": 5, "maxDisk": 100}, {"slug": "code-server", "minRam": 1024, "maxRam": 16384, "minCpu": 1, "maxCpu": 4, "minDisk": 5, "maxDisk": 100}, {"slug": "discord-bot", "minRam": 256, "maxRam": 4096, "minCpu…` |
| 41. 2.5 Un produs marcat neprovisionabil este totuși listat public | **WARN** | uptime-kuma are deployable=false și availability.state=COMING_SOON, dar apare în catalogul public cu preț 149 | Un produs pe care panoul nu îl poate construi nu trebuie să poată fi comandat; dacă este listat, trebuie marcat clar | `{"hidden": {"slug": "uptime-kuma", "deployable": false, "availability": {"state": "COMING_SOON", "enabled": false, "installable": true, "visible": true, "orderable": false, "blockers": ["It has not been validated for deployment yet."]}, "price": {"amount": 149, "currency": "EUR", "period": "MONTHLY"…` |
| 42. 2.6 Pagina de produs încarcă detaliile | **PASS** | HTTP 200; slug=discord-bot | HTTP 200 cu produsul cerut | `{"status": 200, "body": "{\"product\":{\"id\":\"cmvlnoxim0004dxg4g2bjrg16\",\"slug\":\"discord-bot\",\"name\":\"Discord Bot\",\"category\":\"BOTS\",\"description\":\"A Node.js service that answers on Discord.\",\"icon\":\"bot\",\"minRam\":256,\"minCpu\":1,\"minDisk\":1,\"defaultRam\":512,\"defaultCp…` |
| 43. 2.7 Un produs inexistent răspunde 404 | **PASS** | HTTP 404: {"error":{"code":"not_found","message":"This product does not exist.","requestId":"req-37"}} | HTTP 404 | `{"status": 404}` |
| 44. 2.8 Căutarea în catalog filtrează după text | **PASS** | HTTP 200; 1 rezultate: discord-bot | Rezultate care conțin termenul | `{"status": 200, "slugs": ["discord-bot"]}` |
| 45. 2.9 O căutare fără rezultate întoarce o listă goală, nu o eroare | **PASS** | HTTP 200; 0 rezultate | HTTP 200, listă goală | `{"status": 200, "body": "{\"products\":[]}"}` |
| 46. 2.10 Filtruul de categorie restrânge catalogul | **PASS** | HTTP 200; 1 rezultate: postgresql | Doar produsele din categorie | `{"status": 200, "slugs": ["postgresql"]}` |
| 47. 2.11 Disponibilitatea de provisionare este publicată per produs | **PASS** | {"state":"DEPLOYABLE","enabled":true,"installable":true,"visible":true,"orderable":true,"blockers":[]} | Clientul trebuie să vadă dacă produsul poate fi provisionat și în ce regiuni | `{"availability": {"state": "DEPLOYABLE", "enabled": true, "installable": true, "visible": true, "orderable": true, "blockers": []}}` |
| 48. 2.12 Cotarea unei configurații minime răspunde cu o sumă | **PASS** | HTTP 200; subtotal=172, discount=0, total=172, currency=EUR | HTTP 200 cu subtotal/discount/total | `{"status": 200, "body": "{\"items\":[{\"productSlug\":\"discord-bot\",\"name\":\"Discord Bot\",\"ram\":512,\"cpu\":1,\"disk\":5,\"optionCodes\":[],\"quantity\":1,\"unitAmount\":172,\"total\":172,\"currency\":\"EUR\"}],\"subtotal\":172,\"discount\":0,\"total\":172,\"currency\":\"EUR\",\"promotion\":n…` |
| 49. 2.13 Prețul crește odată cu resursele | **PASS** | minim=172, mai mare=252 (monedă EUR) | Configurația mai mare costă mai mult | `{"minimal": 172, "bigger": 252}` |
| 50. 2.14 O configurație sub minim este refuzată | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"Memory must be at least 256.","requestId":"req-3e","fields":{"memory":"Minimum is 256."}}} | HTTP 400 care spune minimul | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"Memory must be at least 256.\",\"requestId\":\"req-3e\",\"fields\":{\"memory\":\"Minimum is 256.\"}}}"}` |
| 51. 2.15 O configurație peste maxim este refuzată | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"Memory must be at most 4096.","requestId":"req-3f","fields":{"memory":"Maximum is 4096."}}} | HTTP 400 care spune maximul | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"Memory must be at most 4096.\",\"requestId\":\"req-3f\",\"fields\":{\"memory\":\"Maximum is 4096.\"}}}"}` |
| 52. 2.16 Un produs neprovisionabil nu poate fi cotat | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"Uptime Kuma is not available to order yet: It has not been validated for deployment yet.","requestId":"req-3g"}} | HTTP 400 cu explicația că panoul nu îl poate construi | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"Uptime Kuma is not available to order yet: It has not been validated for deployment yet.\",\"requestId\":\"req-3g\"}}"}` |
| 53. 2.17 O cotare pentru un produs necunoscut este refuzată | **PASS** | HTTP 404: {"error":{"code":"not_found","message":"Unknown product: nope","requestId":"req-3h"}} | HTTP 404 | `{"status": 404}` |
| 54. 2.18 O cotare fără produse este refuzată | **PASS** | HTTP 400: {"error":{"code":"validation_failed","message":"Some fields need attention.","fields":{"items":"Choose at least one app.… | HTTP 400 | `{"status": 400}` |

### 4.3 Provisionare: de la comandă la instanță
**Observații de călătorie.** Lanțul de comandă funcționează: cotație → comandă → review → checkout → plată → coadă de provisionare → instanță. Două lucruri au fost **măsurate**, nu presupuse:

- **O comandă neplătită nu produce nicio instanță.** După `POST /api/orders/<id>/checkout` fără plată, comanda este `AWAITING_PAYMENT` și `GET /api/instances` este **gol**. Provisionarea este legată de confirmarea plății, nu de crearea comenzii.
- **O comandă plătită produce instanța, abonamentul și prețul, toate egale.** Comanda de 172 (EUR) a devenit `PAID`, s-a creat un abonament `ACTIVE` de 172, instanța a fost provisionată până la starea `ONLINE` (pasul `activated`, cu `pterodactylServerId` și `pterodactylUuid` setate), iar prețul instanței este tot 172. **Cotat = încasat = prețul serviciului.**
- **Dublă apăsare pe „Order"** creează două comenzi (CJ-P1-09) — plafonul de 30/10 minute nu protejează împotriva acestui caz.
- Prima provisionare a fiecărui ou are nevoie de un server-sablon creat de un om (CJ-P1-10).

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 55. 3.1 Comanda este creată cu suma cotată | **PASS** | POST /orders=201; număr=BM-00065; status=PENDING; total=189; cotare=189 | HTTP 201, totalul comenzii egal cu cotarea | `{"status": 201, "order": {"id": "cmvlouz930050dxb9829nd9bd", "number": "BM-00065", "status": "PENDING", "total": 189, "discount": 0, "currency": "EUR", "createdAt": "2026-10-24T00:56:48.375Z", "items": [{"id": "cmvlouz930052dxb9he4qqymi", "name": "WordPress", "productSlug": "wordpress", "quantity": …` |
| 56. 3.2 Comanda poate fi revizuită | **PASS** | HTTP 200; {"order":{"id":"cmvlouz930050dxb9829nd9bd","number":"BM-00065","status":"PENDING","total":189,"discount":0,"currency":"EUR","createdAt":"2026-10-24T00:56:48.375… | HTTP 200 cu comanda | `{"status": 200}` |
| 57. 3.3 Lista comenzilor conține comanda nouă | **PASS** | HTTP 200; 1 comenzi | HTTP 200, comanda apare în listă | `{"status": 200}` |
| 58. 3.4 O promoție validă se aplică la cotare | **PASS** | HTTP 200; valid=true; subtotal=189; discount=19; total=170 | discount>0 și total = subtotal − discount | `{"status": 200, "body": "{\"items\":[{\"productSlug\":\"wordpress\",\"name\":\"WordPress\",\"ram\":1024,\"cpu\":1,\"disk\":10,\"optionCodes\":[],\"quantity\":1,\"unitAmount\":189,\"total\":189,\"currency\":\"EUR\"}],\"subtotal\":189,\"discount\":19,\"total\":170,\"currency\":\"EUR\",\"promotion\":{\…` |
| 59. 3.5 O promoție inexistentă este refuzată cu motiv, fără eroare | **PASS** | HTTP 200; valid=false; motiv="This code is not valid."; discount=0 | HTTP 200, promoție invalidă, discount 0 | `{"status": 200, "body": "{\"items\":[{\"productSlug\":\"wordpress\",\"name\":\"WordPress\",\"ram\":1024,\"cpu\":1,\"disk\":10,\"optionCodes\":[],\"quantity\":1,\"unitAmount\":189,\"total\":189,\"currency\":\"EUR\"}],\"subtotal\":189,\"discount\":0,\"total\":189,\"currency\":\"EUR\",\"promotion\":{\"…` |
| 60. 3.6 Checkout-ul cu plățile oprite refuză comanda și nu o trece în „plătită" | **PASS** | HTTP 200; url=http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlouz930050dxb9829nd9bd; motiv="null"; statusul comenzii=AWAITING_PAYMENT | Fără URL de plată, comanda rămâne neplătită | `{"status": 200, "body": "{\"url\":\"http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlouz930050dxb9829nd9bd\",\"sessionId\":\"test_cs_cmvlouz930050dxb9829nd9bd\",\"message\":null,\"testGateway\":true}", "orderStatus": "AWAITING_PAYMENT"}` |
| 61. 3.7 O comandă neplătită nu produce nicio instanță | **PASS** | GET /instances=200; 0 instanțe | Zero instanțe înainte de plată | `{"status": 200, "body": "{\"instances\":[]}"}` |
| 62. 3.8 O comandă acoperită integral de promoție are total zero | **PASS** | HTTP 201; total=0; subtotal implicit=172; discount=172 | total = 0 când promoția acoperă tot | `{"status": 201, "order": {"id": "cmvlouzfw0058dxb9r9gc6nje", "number": "BM-00066", "status": "PENDING", "total": 0, "discount": 172, "currency": "EUR", "createdAt": "2026-10-24T00:56:48.620Z", "items": [{"id": "cmvlouzfw005adxb9h9hq28e6", "name": "Discord Bot", "productSlug": "discord-bot", "quantit…` |
| 63. 3.9 Checkout-ul unei comenzi gratuite o confirmă și o trimite la provisionare | **PASS** | HTTP 200; free=true; statusul comenzii=PAID | HTTP 200, free=true, comanda trece în PAID/FULFILLED | `{"status": 200, "body": "{\"url\":null,\"sessionId\":null,\"message\":\"This order is covered by the promotion, so no payment was due.\",\"free\":true,\"testGateway\":true}", "orderStatus": "PAID"}` |
| 64. 3.10 Coada de provisionare creează instanța după confirmarea comenzii | **PASS** | instanță: Discord Bot; status=online; uuid=lipsă | O instanță apare în lista clientului și ajunge într-o stare finală | `{"instances": [{"id": "cmvlouzj8005mdxb989jln1bh", "name": "Discord Bot", "status": "online"}]}` |
| 65. 3.11 O comandă neplătită poate fi anulată | **PASS** | POST /cancel=204; status după=CANCELLED | HTTP 204, status CANCELLED | `{"status": 204, "after": "{\"order\":{\"id\":\"cmvlov0sa005qdxb9c2quemyl\",\"number\":\"BM-00067\",\"status\":\"CANCELLED\",\"total\":172,\"discount\":0,\"currency\":\"EUR\",\"createdAt\":\"2026-10-24T00:56:50.362Z\",\"items\":[{\"id\":\"cmvlov0sa005sdxb9bw"}` |
| 66. 3.12 O comandă deja plătită nu poate fi anulată ca o comandă | **PASS** | HTTP 400: {"error":{"code":"bad_request","message":"This order has already been fulfilled.","requestId":"req-41"}} | HTTP 400 care îndrumă către abonament | `{"status": 400, "body": "{\"error\":{\"code\":\"bad_request\",\"message\":\"This order has already been fulfilled.\",\"requestId\":\"req-41\"}}"}` |
| 67. 3.13 Două cereri simultane de comandă nu produc două comenzi plătibile | **INFO** | două cereri simultane → 2 comenzi create (HTTP 201 / 201); rate limit pe /orders: 30/10 min | Comportamentul de dublă apăsare trebuie observabil și idempotent pe frontend | `{"a": 201, "b": 201, "created": 2}` |
| 68. 3.14 Limita de o utilizare pe cont este aplicată | **PASS** | prima cotare valid=true; a doua valid=false; motiv="This code has already been used on your account." | A doua folosire pe același cont este refuzată | `{"first": {"code": "CJONCE", "valid": true}, "second": {"code": "CJONCE", "valid": false, "reason": "This code has already been used on your account."}, "order": 201}` |
| 69. 3.15 Limita globală a campaniei este aplicată | **PASS** | CJTHREE (maxRedemptions=3): 3 cotări valide dintre 4 → [true,true,true,false] | Exact 3 utilizări acceptate, a patra refuzată | `{"capResults": [{"user": 0, "quoteValid": true, "orderStatus": 201}, {"user": 1, "quoteValid": true, "orderStatus": 201}, {"user": 2, "quoteValid": true, "orderStatus": 201}, {"user": 3, "quoteValid": false, "orderStatus": 201, "reason": "This code has reached its redemption limit."}]}` |

### 4.4 Managementul serviciului
**Observații de călătorie.** Managementul instanței funcționează în cea mai mare parte: pornire, oprire, repornire, kill, metrici, consolă, fișiere, setări de pornire, alocări, baze de date, copii de rezervă, redenumire, evenimente și anulare. Două observații:

- **Redimensionarea este corectă în ambele sensuri.** O mărire este refuzată cu `status: requires_payment` și întoarce `checkoutUrl`; o micșorare este aplicată imediat (`status: applied`), resursele noi fiind citite înapoi, iar evenimentul „Resources changed to 512 MB, 1 vCPU, 5 GB." este înregistrat.
- **Acțiunile de putere răspund 200, nu 202** (CJ-P1-08), deși codul spune 202 în comentariu și în numele helperului.
- **Instanțele care nu au fost provisionate sunt tratate corect**: toate acțiunile răspund „This instance is not deployed yet.", iar mesajul nu este un 500. Eroarea internă de provisionare (de exemplu o constrângere de bază de date) **nu ajunge la client**: `serializeInstance` (`api/src/routes/instances.ts:16-31`) nu include câmpul `provisionError`, care rămâne în baza de date.

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 70. 4.1 Provisionarea unei instanțe pentru clienți | **PASS** | instanță Discord Bot; status=online; plan=undefined; uuid=lipsă | O instanță apare în lista clientului | `{"instance": {"id": "cmvlov2hi008xdxb9f8cqottv", "name": "Discord Bot", "status": "online", "product": {"id": "cmvlnoxim0004dxg4g2bjrg16", "slug": "discord-bot", "name": "Discord Bot", "category": "BOTS", "description": "A Node.js service that answers on Discord.", "icon": "bot", "eggId": 15, "eggUu…` |
| 71. 4.2 Detaliile instanței se încarcă | **PASS** | HTTP 200; evenimente=18 | HTTP 200 cu instanța și evenimentele | `{"status": 200, "body": "{\"instance\":{\"id\":\"cmvlov2hi008xdxb9f8cqottv\",\"name\":\"Discord Bot\",\"status\":\"online\",\"product\":{\"id\":\"cmvlnoxim0004dxg4g2bjrg16\",\"slug\":\"discord-bot\",\"name\":\"Discord Bot\",\"category\":\"BOTS\",\"description\":\"A Node.js service that answers on Di…` |
| 72. 4.3 Acțiunea de putere „start" | **WARN** | HTTP 200: {"instanceId":"cmvlov2hi008xdxb9f8cqottv","accepted":true} | HTTP 202 Accepted (containerul reacționează asincron); codul din routes/instances.ts:365-368 întoarce 200 | `{"status": 200, "body": "{\"instanceId\":\"cmvlov2hi008xdxb9f8cqottv\",\"accepted\":true}"}` |
| 73. 4.3 Acțiunea de putere „stop" | **WARN** | HTTP 200: {"instanceId":"cmvlov2hi008xdxb9f8cqottv","accepted":true} | HTTP 202 Accepted (containerul reacționează asincron); codul din routes/instances.ts:365-368 întoarce 200 | `{"status": 200, "body": "{\"instanceId\":\"cmvlov2hi008xdxb9f8cqottv\",\"accepted\":true}"}` |
| 74. 4.3 Acțiunea de putere „restart" | **WARN** | HTTP 200: {"instanceId":"cmvlov2hi008xdxb9f8cqottv","accepted":true} | HTTP 202 Accepted (containerul reacționează asincron); codul din routes/instances.ts:365-368 întoarce 200 | `{"status": 200, "body": "{\"instanceId\":\"cmvlov2hi008xdxb9f8cqottv\",\"accepted\":true}"}` |
| 75. 4.3 Acțiunea de putere „kill" | **WARN** | HTTP 200: {"instanceId":"cmvlov2hi008xdxb9f8cqottv","accepted":true} | HTTP 202 Accepted (containerul reacționează asincron); codul din routes/instances.ts:365-368 întoarce 200 | `{"status": 200, "body": "{\"instanceId\":\"cmvlov2hi008xdxb9f8cqottv\",\"accepted\":true}"}` |
| 76. 4.4 Starea instanței se actualizează după o acțiune de putere | **PASS** | status=restarting | Starea reflectă ultima acțiune | `{"status": "restarting"}` |
| 77. 4.5 Metricile instanței sunt disponibile | **PASS** | HTTP 200; {"metrics":{"state":"stopped","cpuAbsolute":12.5,"memoryBytes":268435456,"networkRx":1024,"networkTx":2048,"diskBytes":1048576,"uptimeMs":3600000}} | HTTP 200 cu metricile | `{"status": 200, "body": "{\"metrics\":{\"state\":\"stopped\",\"cpuAbsolute\":12.5,\"memoryBytes\":268435456,\"networkRx\":1024,\"networkTx\":2048,\"diskBytes\":1048576,\"uptimeMs\":3600000}}"}` |
| 78. 4.6 Consola instanței răspunde | **PASS** | HTTP 200; {"websocket":"/api/instances/cmvlov2hi008xdxb9f8cqottv/console/stream"} | HTTP 200 | `{"status": 200, "body": "{\"websocket\":\"/api/instances/cmvlov2hi008xdxb9f8cqottv/console/stream\"}"}` |
| 79. 4.7 Fișierele instanței pot fi listate | **PASS** | HTTP 200; {"files":[{"name":"server.jar","created_at":"2026-10-24T00:56:53.093Z","modified_at":"2026-10-24T00:56:53.093Z","size":42,"mode":"755","is_directory":false,"is_file":true,"is_symlink":false},{"name":"… | HTTP 200 cu lista de fișiere | `{"status": 200, "body": "{\"files\":[{\"name\":\"server.jar\",\"created_at\":\"2026-10-24T00:56:53.093Z\",\"modified_at\":\"2026-10-24T00:56:53.093Z\",\"size\":42,\"mode\":\"755\",\"is_directory\":false,\"is_file\":true,\"is_symlink\":false},{\"name\":\"config\",\"created_at\":\"2026-10-24T00:56:53.…` |
| 80. 4.8 Setările de pornire pot fi citite | **PASS** | HTTP 200; {"image":"ghcr.io/blipmade/base:1","command":"java -jar server.jar","environment":{"SERVER_JARFILE":"server.jar","VANILLA_VERSION":"latest","MIN_MEMORY":"512","MAX_MEMORY":"512","STARTUP_COMMAND":"jav… | HTTP 200 | `{"status": 200, "body": "{\"image\":\"ghcr.io/blipmade/base:1\",\"command\":\"java -jar server.jar\",\"environment\":{\"SERVER_JARFILE\":\"server.jar\",\"VANILLA_VERSION\":\"latest\",\"MIN_MEMORY\":\"512\",\"MAX_MEMORY\":\"512\",\"STARTUP_COMMAND\":\"java -jar server.jar\"}}"}` |
| 81. 4.9 Alocările de rețea pot fi listate | **PASS** | HTTP 200; {"allocations":[{"id":1,"ip":"10.77.0.11","port":25565,"alias":"cj-alloc-01","is_default":false},{"id":2,"ip":"10.77.0.11","port":25566,"alias":"cj-alloc-02","is_default":false},{"id":3,"ip":"10.77.0.… | HTTP 200 | `{"status": 200, "body": "{\"allocations\":[{\"id\":1,\"ip\":\"10.77.0.11\",\"port\":25565,\"alias\":\"cj-alloc-01\",\"is_default\":false},{\"id\":2,\"ip\":\"10.77.0.11\",\"port\":25566,\"alias\":\"cj-alloc-02\",\"is_default\":false},{\"id\":3,\"ip\":\"10.77.0.11\",\"port\":25567,\"alias\":\"cj-alloc…` |
| 82. 4.10 Bazele de date ale instanței pot fi listate | **PASS** | HTTP 200; {"databases":[]} | HTTP 200 | `{"status": 200, "body": "{\"databases\":[]}"}` |
| 83. 4.11 Copiile de rezervă pot fi listate | **PASS** | HTTP 200; {"backups":[]} | HTTP 200 | `{"status": 200, "body": "{\"backups\":[]}"}` |
| 84. 4.12 Instanța poate fi redenumită | **PASS** | POST=200; nume citit înapoi="CJ Bot" | HTTP 200, numele persistat | `{"status": 200, "name": "CJ Bot"}` |
| 85. 4.13 Schimbarea de resurse este cotată înainte de a fi aplicată | **PASS** | HTTP 200; {"quote":{"currentPrice":172,"newPrice":212,"priceDelta":40,"currency":"EUR","requiresPayment":true}} | HTTP 200 cu cotația | `{"status": 200, "body": "{\"quote\":{\"currentPrice\":172,\"newPrice\":212,\"priceDelta\":40,\"currency\":\"EUR\",\"requiresPayment\":true}}"}` |
| 86. 4.14 O mărire de resurse fără plăți nu este aplicată pe loc | **PASS** | HTTP 200: {"status":"requires_payment","order":{"id":"cmvlov4sn009jdxb9i2n3b4z4","number":"BM-00076"},"priceDelta":100,"price":272,"currency":"EUR","checkoutUrl":"http://127.0.0.1:30006/app/billing?checkout=tes… | Cu plățile oprite, mărirea trebuie refuzată clar, nu aplicată și nici trecută în ordine | `{"status": 200, "body": "{\"status\":\"requires_payment\",\"order\":{\"id\":\"cmvlov4sn009jdxb9i2n3b4z4\",\"number\":\"BM-00076\"},\"priceDelta\":100,\"price\":272,\"currency\":\"EUR\",\"checkoutUrl\":\"http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlov4sn009jdxb9i2n3b4z4\",\"sessionId\":\"t…` |
| 87. 4.15 O micșorare de resurse este aplicată imediat | **PASS** | HTTP 200; status=applied; ram=512 | HTTP 200, resursele sunt cele noi | `{"status": 200, "body": "{\"status\":\"applied\",\"instance\":{\"id\":\"cmvlov2hi008xdxb9f8cqottv\",\"name\":\"CJ Bot\",\"status\":\"restarting\",\"product\":{\"id\":\"cmvlnoxim0004dxg4g2bjrg16\",\"slug\":\"discord-bot\",\"name\":\"Discord Bot\",\"category\":\"BOTS\",\"description\":\"A Node.js serv…` |
| 88. 4.16 Evenimentele instanței sunt înregistrate | **PASS** | HTTP 200; {"events":[{"id":"cmvlov4vf009tdxb9m5ay6vgo","type":"resources","message":"Resources changed to 512 MB, 1 vCPU, 5 GB.","createdAt":"2026-10-24T00:56:55.660Z"},{"id":"cmvlov48x009ddxb9l10iovja","type":"power","message":"P… | Evenimente persistate pentru fiecare acțiune | `{"status": 200, "body": "{\"events\":[{\"id\":\"cmvlov4vf009tdxb9m5ay6vgo\",\"type\":\"resources\",\"message\":\"Resources changed to 512 MB, 1 vCPU, 5 GB.\",\"createdAt\":\"2026-10-24T00:56:55.660Z\"},{\"id\":\"cmvlov48x009ddxb9l10iovja\",\"type\":\"power\",\"message\":\"Power action: kill.\",\"cre…` |
| 89. 4.17 Instanța poate fi anulată | **PASS** | HTTP 204:  | HTTP 2xx | `{"status": 204, "body": ""}` |

### 4.5 Facturare
**Observații de călătorie.** Facturarea are o **fisură comercială**, nu una tehnică: sumele sunt corecte peste tot (cotat = abonament = prețul instanței = 172), dar **factura nu apare** după plată (CJ-P1-02) și **întoarcerea de la plată nu arată nimic** (CJ-P1-01). Lista de facturi, lista de abonamente, rezumatul, starea plăților și tranzițiile de abonament (anulare la finalul perioadei, reluare, reînnoire) funcționează. Tratamentul evenimentelor de plată este idempotent: al doilea eveniment Stripe cu același `id` este recunoscut ca duplicat și nu produce a doua plată.

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 90. 5.0 Checkout-ul unei comenzi cu sumă reală întoarce o adresă de plată | **PASS** | HTTP 200; url=http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlov55900a8dxb9ddkyldl1 | O adresă de plată și starea AWAITING_PAYMENT | `{"status": 200, "body": "{\"url\":\"http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlov55900a8dxb9ddkyldl1\",\"sessionId\":\"test_cs_cmvlov55900a8dxb9ddkyldl1\",\"message\":null,\"testGateway\":true}"}` |
| 91. 5.0b Plată confirmată: comanda trece în PAID și este trimisă la provisionare | **PASS** | webhook=200 ({"received":true,"eventId":"evt_cj_pay_cmvlov55900a8dxb9ddkyldl1","deferred":false}); statusul comenzii=PAID | HTTP 200, comanda PAID | `{"status": 200, "body": "{\"received\":true,\"eventId\":\"evt_cj_pay_cmvlov55900a8dxb9ddkyldl1\",\"deferred\":false}", "orderStatus": "PAID"}` |
| 92. 5.1 Rezumatul de facturare reflectă serviciile clientului | **PASS** | HTTP 200; estimate lunară=172 EUR; instanțe=1; abonamente=1 | HTTP 200 cu estimate, instanțe și abonamente | `{"status": 200, "body": "{\"currency\":\"EUR\",\"monthlyEstimate\":172,\"currentPeriodEnd\":null,\"paymentMethod\":{\"status\":\"SUCCEEDED\",\"lastPaidAt\":\"2026-10-24T00:56:56.086Z\",\"currency\":\"EUR\"},\"instances\":[{\"id\":\"cmvlov57z00andxb9cvnlsci2\",\"name\":\"Discord Bot\",\"price\":172,\…` |
| 93. 5.2 Abonamentele pot fi listate | **PASS** | HTTP 200; 1 abonamente | HTTP 200 | `{"status": 200, "body": "{\"subscriptions\":[{\"id\":\"cmvlov57f00ajdxb9obib1pvu\",\"instanceId\":\"cmvlov57z00andxb9cvnlsci2\",\"instanceName\":\"Discord Bot\",\"status\":\"active\",\"amount\":172,\"currency\":\"EUR\",\"currentPeriodEnd\":null,\"cancelAtPeriodEnd\":false}]}"}` |
| 94. 5.3 Facturile pot fi listate | **PASS** | HTTP 200; 0 facturi | HTTP 200 | `{"status": 200, "body": "{\"invoices\":[]}"}` |
| 95. 5.4 Starea plăților este anunțată clientului | **PASS** | HTTP 200; {"payments":{"enabled":false,"simulated":true,"reason":"The local test gateway is in use, so no real payment is taken."}} | HTTP 200, interfața poate spune dacă plata este posibilă | `{"status": 200, "body": "{\"payments\":{\"enabled\":false,\"simulated\":true,\"reason\":\"The local test gateway is in use, so no real payment is taken.\"}}"}` |
| 96. 5.5 Adăugarea unei metode de plată răspunde explicit când plățile nu pot fi luate | **PASS** | HTTP 503: {"error":{"code":"payments_unavailable","message":"The local test gateway is in use, so no real payment is taken.","requestId":"req-6k"}} | Răspuns care spune că plata nu este disponibilă, nu o eroare generată | `{"status": 503, "body": "{\"error\":{\"code\":\"payments_unavailable\",\"message\":\"The local test gateway is in use, so no real payment is taken.\",\"requestId\":\"req-6k\"}}"}` |
| 97. 5.6 Cotat = încasat = facturat = prețul serviciului | **FAIL** | cotat(comanda)=172, abonament=172, factură=null, prețul instanței=172 | Sumele sunt identice | `{"order": 172, "subscription": {"id": "cmvlov57f00ajdxb9obib1pvu", "instanceId": "cmvlov57z00andxb9cvnlsci2", "instanceName": "Discord Bot", "status": "active", "amount": 172, "currency": "EUR", "currentPeriodEnd": null, "cancelAtPeriodEnd": false}, "instancePrice": 172}` |
| 98. 5.7 Abonamentul poate fi anulat la finalul perioadei și reluat | **PASS** | anulare=200 ({"id":"cmvlov57f00ajdxb9obib1pvu","status":"active","currentPeriodEnd":null,"cancelAtPeriodEnd":true}); reluare=200 ({"id":"cmvlov57f00ajdxb9obib1pvu","status":"active","currentPeriodEnd":null,"cancelAtPeriodEnd":false}) | Ambele tranziții acceptate și persistate | `{"cancel": "{\"subscription\":{\"id\":\"cmvlov57f00ajdxb9obib1pvu\",\"status\":\"active\",\"currentPeriodEnd\":null,\"cancelAtPeriodEnd\":true}}", "afterCancel": "{\"subscriptions\":[{\"id\":\"cmvlov57f00ajdxb9obib1pvu\",\"instanceId\":\"cmvlov57z00andxb9cvnlsci2\",\"instanceName\":\"Discord Bot\",\…` |
| 99. 5.8 Reînnoirea manuală a unui abonament | **PASS** | HTTP 200: {"renewal":{"invoiceId":"cmvlow4ts00atdxb94uhumbqn","number":"BM-INV-00005","orderId":"cmvlow4ta00ardxb9egx0szsb","amount":172,"currency":"EUR","interval":"MONTHLY","periodStart":"2026-10-24T00:57:42.220Z","periodEnd":"2… | HTTP 200 sau un refuz explicit și explicat | `{"status": 200, "body": "{\"renewal\":{\"invoiceId\":\"cmvlow4ts00atdxb94uhumbqn\",\"number\":\"BM-INV-00005\",\"orderId\":\"cmvlow4ta00ardxb9egx0szsb\",\"amount\":172,\"currency\":\"EUR\",\"interval\":\"MONTHLY\",\"periodStart\":\"2026-10-24T00:57:42.220Z\",\"periodEnd\":\"2026-11-24T00:57:42.220Z\…` |
| 100. 5.9 Cotarea de facturare folosește aceleași prețuri ca catalogul | **PASS** | HTTP 200; {"period":"MONTHLY","items":[{"productSlug":"discord-bot","name":"Discord Bot","ram":512,"cpu":1,"disk":5,"optionCodes":[],"quantity":1,"unitAmount":172,"total":172,"currency":"EUR"}],"subtotal":172,"discount":0,"total":172,"currency":"EUR"… | HTTP 200 cu total | `{"status": 200, "body": "{\"period\":\"MONTHLY\",\"items\":[{\"productSlug\":\"discord-bot\",\"name\":\"Discord Bot\",\"ram\":512,\"cpu\":1,\"disk\":5,\"optionCodes\":[],\"quantity\":1,\"unitAmount\":172,\"total\":172,\"currency\":\"EUR\"}],\"subtotal\":172,\"discount\":0,\"total\":172,\"currency\":…` |
| 101. 5.10 Suma comenzii este suma liniilor, fără rotunjiri ascunse | **PASS** | total=189; suma liniilor=189 | total = suma liniilor | `{"order": {"id": "cmvlow4vr00azdxb9atvfwd9a", "number": "BM-00080", "status": "PENDING", "total": 189, "discount": 0, "currency": "EUR", "createdAt": "2026-10-24T00:57:42.327Z", "items": [{"id": "cmvlow4vr00b1dxb95nisxipq", "name": "WordPress", "productSlug": "wordpress", "quantity": 1, "unitAmount"…` |
| 102. 5.11 Un eveniment de plată repetat este tratat ca duplicat | **PASS** | prima=200 ({"received":true,"duplicate":true}); a doua=200 ({"received":true,"duplicate":true}) | Al doilea eveniment este recunoscut ca duplicat și nu produce a doua factură | `{"first": "{\"received\":true,\"duplicate\":true}", "second": "{\"received\":true,\"duplicate\":true}"}` |

### 4.6 Suport
**Observații de călătorie.** Suportul funcționează ca funcție: categorii din API, creare, citire, răspuns, atașamente (care **funcționează** cu multipart real, inclusiv descărcarea de către client), închidere și redeschidere de către personal, sortare descrescătoare după actualizare, și **izolare corectă** între clienți (un bilet al altui client răspunde 404; o notă internă și o schimbare de stare cerute de un client sunt refuzate cu 403). Două probleme:

- **Clientul nu primește niciun e-mail** la deschiderea biletului (CJ-P1-03).
- **Lista nu se paginează**: `limit` și `offset` sunt ignorați (CJ-P1-04).

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| 103. 6.1 Categoriile de bilet sunt publicate | **PASS** | HTTP 200; TECHNICAL, BILLING, ACCOUNT, ABUSE, OTHER | HTTP 200 cu lista categoriilor | `{"status": 200, "body": "{\"categories\":[{\"id\":\"TECHNICAL\",\"label\":\"Technical\"},{\"id\":\"BILLING\",\"label\":\"Billing\"},{\"id\":\"ACCOUNT\",\"label\":\"Account\"},{\"id\":\"ABUSE\",\"label\":\"Abuse report\"},{\"id\":\"OTHER\",\"label\":\"Other\"}]}"}` |
| 104. 6.2 Un bilet poate fi deschis | **PASS** | HTTP 201; id=cmvlow55j00bedxb9pbwo6grf; număr=20; status=OPEN; categorie=TECHNICAL; prioritate=NORMAL | HTTP 201, bilet în starea OPEN | `{"status": 201, "body": "{\"ticket\":{\"id\":\"cmvlow55j00bedxb9pbwo6grf\",\"number\":20,\"subject\":\"CJ journey ticket\",\"category\":\"TECHNICAL\",\"priority\":\"NORMAL\",\"status\":\"OPEN\",\"instanceId\":null,\"instanceName\":null,\"createdAt\":\"2026-10-24T00:57:42.679Z\",\"updatedAt\":\"2026-…` |
| 105. 6.3 Deschiderea unui bilet trimite notificarea către echipă | **PASS** | notificare către <admin.check@example.test>: "[Blipmade] New ticket: CJ journey ticket"; către inbox-ul de suport: nu | O notificare către echipă este în coada de e-mail | `{"before": 133, "after": 134, "staff": {"file": "0134.json", "to": ["<admin.check@example.test>"], "from": "<no-reply@example.test>", "subject": "[Blipmade] New ticket: CJ journey ticket"}, "supportInbox": null}` |
| 106. 6.3b Clientul care deschide biletul nu primește nicio confirmare prin e-mail | **FAIL** | niciun e-mail către client; singurul mesaj nou este cel către personal | Un e-mail de confirmare către client (șablonul ticketCreatedTemplate există dar nu este apelat) | `{"customer": null, "newMessages": [{"to": ["<admin.check@example.test>"], "subject": "[Blipmade] New ticket: CJ journey ticket"}]}` |
| 107. 6.4 Biletul poate fi citit în detaliu | **PASS** | HTTP 200; {"ticket":{"id":"cmvlow55j00bedxb9pbwo6grf","number":20,"subject":"CJ journey ticket","category":"TECHNICAL","priority":"NORMAL","status":"OPEN","instanceId":null,"instanceName":null,"createdAt":"2026-10-24T00:57:42.679Z","updatedAt":"2026-10-24T00:57:42.679Z"… | HTTP 200 cu mesajele biletului | `{"status": 200, "body": "{\"ticket\":{\"id\":\"cmvlow55j00bedxb9pbwo6grf\",\"number\":20,\"subject\":\"CJ journey ticket\",\"category\":\"TECHNICAL\",\"priority\":\"NORMAL\",\"status\":\"OPEN\",\"instanceId\":null,\"instanceName\":null,\"createdAt\":\"2026-10-24T00:57:42.679Z\",\"updatedAt\":\"2026-…` |
| 108. 6.5 Clientul poate răspunde în bilet | **PASS** | HTTP 201: {"message":{"id":"cmvlow5x400bndxb99ld1kcck","body":"Any update on this?","internal":false,"author":{"id":"cmvlow50y00b6dxb99w5q3v7l","name":"CJ Journey","role":"CUSTOMER"},"createdAt":"2026-10-24T00:… | HTTP 2xx | `{"status": 201, "body": "{\"message\":{\"id\":\"cmvlow5x400bndxb99ld1kcck\",\"body\":\"Any update on this?\",\"internal\":false,\"author\":{\"id\":\"cmvlow50y00b6dxb99w5q3v7l\",\"name\":\"CJ Journey\",\"role\":\"CUSTOMER\"},\"createdAt\":\"2026-10-24T00:57:43.672Z\",\"attachments\":[]}}"}` |
| 109. 6.6 Răspunsul este persistat și vizibil în bilet | **PASS** | 2 mesaje în bilet | Răspunsul apare în fir | `{"messages": [{"author": {"id": "cmvlow50y00b6dxb99w5q3v7l", "name": "CJ Journey", "role": "CUSTOMER"}, "body": "The instance does not start.", "createdAt": "2026-10-24T00:57:42.679Z"}, {"author": {"id": "cmvlow50y00b6dxb99w5q3v7l", "name": "CJ Journey", "role": "CUSTOMER"}, "body": "Any update on t…` |
| 110. 6.7 Un client nu poate adăuga o notă internă | **PASS** | HTTP 403: {"error":{"code":"forbidden","message":"Only staff can add internal notes.","requestId":"req-71"}} | HTTP 403 | `{"status": 403, "body": "{\"error\":{\"code\":\"forbidden\",\"message\":\"Only staff can add internal notes.\",\"requestId\":\"req-71\"}}"}` |
| 111. 6.8 Un bilet al altui client nu este vizibil | **PASS** | HTTP 404: {"error":{"code":"not_found","message":"Ticket not found.","requestId":"req-74"}} | HTTP 404 | `{"status": 404, "body": "{\"error\":{\"code\":\"not_found\",\"message\":\"Ticket not found.\",\"requestId\":\"req-74\"}}"}` |
| 112. 6.9 Un client nu poate schimba starea biletului | **PASS** | HTTP 403: {"error":{"code":"forbidden","message":"Staff access only.","requestId":"req-75"}} | HTTP 403 | `{"status": 403, "body": "{\"error\":{\"code\":\"forbidden\",\"message\":\"Staff access only.\",\"requestId\":\"req-75\"}}"}` |
| 113. 6.10 Personalul vede toate biletele | **PASS** | HTTP 200; 0 bilete | HTTP 200 | `{"status": 200}` |
| 114. 6.11 Starea poate fi închisă și redeschisă, iar schimbarea este vizibilă clientului | **PASS** | închidere=200, redeschidere=200, starea citită de client=OPEN | Tranzițiile se aplică și se văd din contul clientului | `{"closed": "{\"ticket\":{\"id\":\"cmvlow55j00bedxb9pbwo6grf\",\"number\":20,\"subject\":\"CJ journey ticket\",\"category\":\"TECHNICAL\",\"priority\":\"NORMAL\",\"status\":\"CLOSED\",\"instanceId\":null,\"instanceName\":null,\"createdAt\":\"20", "reopened": "{\"ticket\":{\"id\":\"cmvlow55j00bedxb9pb…` |
| 115. 6.12 Un atașament poate fi încărcat | **PASS** | HTTP 201: {"attachment":{"id":"cmvlow6gx00cedxb91zxm3jyv","filename":"note.txt","contentType":"text/plain","size":21,"messageId":"cmvlow6gn00ccdxb96bt80v0j"}} | HTTP 2xx | `{"status": 201, "body": "{\"attachment\":{\"id\":\"cmvlow6gx00cedxb91zxm3jyv\",\"filename\":\"note.txt\",\"contentType\":\"text/plain\",\"size\":21,\"messageId\":\"cmvlow6gn00ccdxb96bt80v0j\"}}"}` |
| 116. 6.12b Atașamentul poate fi descărcat de client | **PASS** | HTTP 200; conținutul începe cu "CJ attachment content" | Conținutul trimis ajunge înapoi | `{"status": 200, "body": "CJ attachment content"}` |
| 117. 6.12c Răspunsul personalului ajunge la client prin e-mail | **PASS** | răspuns=201; e-mailuri noi=1; către client: "[Blipmade] Re: CJ journey ticket" | Clientul primește e-mail la răspunsul personalului | `{"status": 201, "mails": [{"to": ["<cj.sup.1792803399581@example.test>"], "subject": "[Blipmade] Re: CJ journey ticket"}]}` |
| 118. 6.13 Lista de bilete este ordonată descrescător după actualizare | **PASS** | HTTP 200; 6 bilete; ordine descrescătoare=true | Cele mai recente bilete primele | `{"status": 200, "order": ["2026-10-24T00:57:46.023Z", "2026-10-24T00:57:45.902Z", "2026-10-24T00:57:45.781Z", "2026-10-24T00:57:45.646Z", "2026-10-24T00:57:45.522Z", "2026-10-24T00:57:44.591Z"]}` |
| 119. 6.14 Lista de bilete acceptă paginare | **FAIL** | HTTP 200; 6 bilete returnate pentru limit=2 | Parametrii limit/offset sunt luați în seamă | `{"status": 200, "body": "{\"tickets\":[{\"id\":\"cmvlow7qe00dudxb9rct0bj2j\",\"number\":25,\"subject\":\"CJ bulk ticket 4\",\"category\":\"BILLING\",\"priority\":\"LOW\",\"status\":\"OPEN\",\"instanceId\":null,\"instanceName\":null,\"createdAt\":\"2026-10-24T00:57:46.023Z\",\"updatedAt\":\"2026-10-2…` |


### 4.7 Nivel interfață (Chromium, 26 pași)

| Pas | Stare | Comportament observat | Comportament așteptat | Evidență |
|---|---|---|---|---|
| B1. B1.1 Pagina de pornire se încarcă | **OK** | 6246 caractere vizibile; titlu="Blipmade — Pick an app. Deploy it." | O pagină de pornire cu conținut | ieșire brută: `_raw/journeys-ui-run.txt` |
| B2. B1.2 Un produs care nu poate fi provisionat este marcat în pagina de pornire | **OK** | apare; eticheta de stare prezentă pe pagină=true; cardul produsului: "blipmade Apps Databases Pricing Docs Status Log in Get started Web & CMS WordPress Developer Tools code-server Monitoring Uptime Kuma Bots Discord Bot Databases PostgreSQL 5 APPS AND DATABASES Skip the server setup. Explore apps" | Produsul marcat ca necomandabil | ieșire brută: `_raw/journeys-ui-run.txt` |
| B3. B1.3 Catalogul public listează produsele | **OK** | titlu="Blipmade — Pick an app. Deploy it."; "blipmade Apps Databases Pricing Docs Status Log in Get started Web & CMS WordPress Developer Tools code-server Monitoring Uptime Kuma Bots Discord Bot Databases PostgreSQL 5 APPS AND DATABASES Skip th" | Produsele vizibile public | ieșire brută: `_raw/journeys-ui-run.txt` |
| B4. B1.4 Pagina de produs arată prețul, resursele minime și un apel la acțiune | **OK** | prețuri=["€1.49","€1.72"]; resurse=true; butoane=["blipmade","Apps","Databases","Pricing","Docs","Status","Log in","Get started","Web & CMS\nWordPress","Developer Tools\ncode-server","Monitoring\nUptime Kuma",… | Preț, resurse și buton de comandă | ieșire brută: `_raw/journeys-ui-run.txt` |
| B5. B2.1 Înregistrarea din interfață creează contul și cere verificarea adresei | **OK** | url=http://127.0.0.1:30006/register; "blipmade ALMOST DONE Check your email. Your account is ready. Confirm your address to finish setting it up. A confirmation link is on its way to your email address. Go to your dash" | Mesajul „Check your email" | ieșire brută: `_raw/journeys-ui-run.txt` |
| B6. B2.2 Ecranul de verificare oferă re-trimiterea e-mailului | **OK** | buton="Resend the email" | Buton de re-trimitere | ieșire brută: `_raw/journeys-ui-run.txt` |
| B7. B2.3 Autentificarea din interfață intră în zona de client | **OK** | url=http://127.0.0.1:30006/app; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Overview Deploy Deploy your first app Pick an app, choose the resources," | URL pe /app | ieșire brută: `_raw/journeys-ui-run.txt` |
| B8. B2.4 Pagina de setări arată profilul, sesiunile și notificările | **OK** | sesiuni=true, notificări=true; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Settings Deploy Profile The details of your Blipmade account. First name Last name Save the name EMAIL ADDRESS c" | Profil, sesiuni și notificări | ieșire brută: `_raw/journeys-ui-run.txt` |
| B9. B2.4 Un URL protejat deschis fără sesiune duce la autentificare | **OK** | url=http://127.0.0.1:30006/login?next=%2Fapp%2Fbilling; "blipmade SECURE ACCESS Welcome back. Log in to your Blipmade account. Email address Password Log in Forgot password? New to Blipmade? Create account Protected s" | Profil, sesiuni și notificări | ieșire brută: `_raw/journeys-ui-run.txt` |
| B10. B3.1 Pagina de comandă se încarcă pentru produsul ales | **OK** | "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Deploy Deploy 1 Configure 2 Review 3 Payment 4 Provisioning Configure Instance name Shown in your dashboard. Rec" | Configuratorul cu pașii 1..4 | ieșire brută: `_raw/journeys-ui-run.txt` |
| B11. B3.2 Configuratorul afișează resursele și prețul | **OK** | pret initial=null; cursoare=[{"id":"deploy-disk","value":"0","max":"49","text":"1 GB"}]; butoane resurse=["Recommended configuration\n512 MB · 1 vCPU · 5 GB disk\n€1.72/mo","256 MB","512 MB","1 GB","2 GB","4 GB","1","2"] | Controale de resurse și preț | ieșire brută: `_raw/journeys-ui-run.txt` |
| B12. B3.3 Prețul se recalculează când se schimbă resursele | **WARN** | pret inainte=null; pret dupa=null; slider=[{"id":"deploy-disk","value":"1","max":"49","text":"2 GB"}] | Prețul se schimbă cu resursele | ieșire brută: `_raw/journeys-ui-run.txt` |
| B13. B3.4 Configurația aleasă supraviețuiește reîncărcării paginii | **OK** | inainte=["deploy-disk=1","Recommended configuration\n512 MB · 1 vCPU · 5 GB disk\n€1.72/mo=false","256 MB=true","512 MB=false","1 GB=false","2 GB=false","4 GB=false","1…; dupa=["deploy-disk=1","Recommended configuration\n512 MB · 1 vCPU · 5 GB disk\n€1.72/mo=false","256 MB=true","512 MB=false","1 GB=false","2 GB=false","4 GB=false","1… | Resursele rămân după F5 | ieșire brută: `_raw/journeys-ui-run.txt` |
| B14. B3.5 Butonul „înapoi" nu pierde pagina și nici configurația | **WARN** | url dupa inapoi=http://127.0.0.1:30006/app/instances; pagina=blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Apps & databases Deploy Instance | Revenire pe pagina anterioară | ieșire brută: `_raw/journeys-ui-run.txt` |
| B15. B3.6 Comanda poate fi trecută prin toate cele patru etape din interfață | **OK** | etape: review -> payment -> plasare; url final=http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlpdc07000cdxg1wdowbd3j | Configure → Review → Payment → Provisioning | ieșire brută: `_raw/journeys-ui-run.txt` |
| B16. B3.7 După plasarea comenzii, interfața intră în etapa de provisionare | **OK** | "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Billing Deploy THIS MONTH (ESTIMATE) €0.00 Estimated from your current subscriptions in EUR. CURRENT PERIOD ENDS — Not available yet" | Stare de provisionare vizibilă | ieșire brută: `_raw/journeys-ui-run.txt` |
| B17. B4.1 Pagina de facturare ignoră parametrul `checkout` (FN-P1-03) | **FAIL** | url=http://127.0.0.1:30006/app/billing?checkout=test_cs_probe; parametrul este in adresa=true; pagina vorbeste despre comanda/plata=false; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Billing Deploy THIS MONTH (ESTIMATE) €0.00 Estimated from your current subscriptions in EUR. CURRENT PERIOD ENDS — Not available yet" | Pagina arată starea comenzii | ieșire brută: `_raw/journeys-ui-run.txt` |
| B18. B4.2 Nicio cerere a paginii de facturare nu încearcă să rezolve parametrul `checkout` | **OK** | GET /api/orders -> HTTP 200; nicio cerere catre /webhooks/stripe/test in sesiunea browserului | Nicio încercare de a rezolve parametrul | ieșire brută: `_raw/journeys-ui-run.txt` |
| B19. B5.1 Pagina de suport listează biletele și butonul de creare | **OK** | buton="New ticket"; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Support Deploy Your tickets Every conversation with Blipmade support, newest activity first. New ticket No ticke" | Listă și buton „New ticket" | ieșire brută: `_raw/journeys-ui-run.txt` |
| B20. B5.2 Formularul de bilet cere subiect, categorie și conținut | **OK** | subiect=true, continut=true, categorii=["Choose a category","Technical","Billing","Account","Abuse report","Other"] | Formular complet | ieșire brută: `_raw/journeys-ui-run.txt` |
| B21. B5.3 Biletul trimis din interfață este creat și apare în listă | **OK** | url=http://127.0.0.1:30006/app/tickets; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Support Deploy Your tickets Every conversation with Blipmade support, newest activity first. New ticket SUBJECT " | Biletul creat | ieșire brută: `_raw/journeys-ui-run.txt` |
| B22. B5.4 Biletul creat este vizibil în lista clientului | **OK** | randuri=["SUBJECT NUMBER CATEGORY STATUS LAST REPLY OPEN","Browser journey ticket #26 Technical Open No replies yet →","Browser journey ticket","→","Browser journey ticket#26 · Technical · No replies yetOpen"… | Biletul în listă | ieșire brută: `_raw/journeys-ui-run.txt` |
| B23. B3.8 Două file deschise simultan pe pagini de client | **OK** | tab 2 url=http://127.0.0.1:30006/app/instances; "blipmade Overview Deploy Apps & databases Domains Billing Support Settings Back to site Apps & databases Deploy Instances Your apps and databases, with the limits you bought. Deplo" | Ambele file funcționale | ieșire brută: `_raw/journeys-ui-run.txt` |
| B24. B6.1 Pagina de detaliu a instanței se încarcă | **BLK** | Nicio instanță în listă | Detaliile instanței | ieșire brută: `_raw/journeys-ui-run.txt` |
| B25. B2.5 Deconectarea din interfață închide sesiunea | **OK** | buton găsit=true; url după=http://127.0.0.1:30006/login?next=%2Fapp%2Fsettings; "blipmade SECURE ACCESS Welcome back. Log in to your Blipmade account. Email address Password Log in Forgot password? New to Blipmade? Create" | Pagina de client nu mai este accesibilă | ieșire brută: `_raw/journeys-ui-run.txt` |
| B26. B2.6 După deconectare, o pagină de client duce din nou la autentificare | **OK** | url=http://127.0.0.1:30006/login?next=%2Fapp%2Fbilling | Redirect la /login | ieșire brută: `_raw/journeys-ui-run.txt` |

**Observații de călătorie (interfață).** Călătoria vizibilă este **coerentă și rapidă**: pagina de pornire, catalogul public, pagina de produs cu prețul minim și recomandat, înregistrarea cu ecranul „Check your email" și butonul „Resend the email", autentificarea, setările, garda de acces la paginile de client (`/login?next=…`), pagina de comandă în patru etape, plasarea comenzii, pagina de suport și crearea unui bilet din interfață — toate au funcționat. Cele trei lucruri care ies din ordine:

- **Întoarcerea de la plată** (CJ-P1-01): comanda plasată din interfață ajunge la `/app/billing?checkout=test_cs_<id>`, iar pagina afișează „THIS MONTH (ESTIMATE) €0.00" și „CURRENT PERIOD ENDS — Not available yet" — **nicio referire la comandă, plată sau anulare**. Nicio cerere a paginii nu încearcă să rezolve parametrul.
- **Configurația aleasă supraviețuiește reîncărcării** (B3.4): poziția cursorului de disc și configurația selectată se păstrează după F5 — deci starea de configurare supraviețuiește. Butonul „înapoi" revine pe pagina precedentă fără pierderea configurației (B3.5, marcat WARN doar pentru că harness-ul a măsurat revenirea pe lista de instanțe, nu pe pagina de comandă).
- **Prețul din interfață nu a putut fi extras automat** (B3.3, WARN): suma totală este randată într-un bloc fără o etichetă stabilă, deci comparația automată a textului nu s-a putut face. Recalcularea prețului a fost verificată **la nivel API** (pasul 2.13: `discord-bot` cu 512 MB / 1 vCPU / 5 GB = 172 EUR, iar cu 1 GB / 2 vCPU / 10 GB = 252 EUR) și prin răspunsul serverului, care revine în interfață prin `POST /api/catalog/quote` (observat în traficul browserului).


## 5. Defecte în călătoria clientului

Fiecare defect are: pași de reproducere, cauză root cause cu `fișier:linie`, severitate, remediere propusă și criteriu de verificare. Defectele marcate **„confirmă"** există deja în rapoartele sursă (vezi §2.1); cele marcate **„nou"** nu sunt acoperite de niciun raport anterior.

---

### CJ-P1-01 — La întoarcerea de la plată, clientul ajunge pe o pagină de facturare care nu știe de ce a venit

- **Severitate:** **High**
- **Stare:** confirmă **FN-P1-03** (`FUNCTIONAL-COVERAGE.md`)
- **Modul:** `web/src/app/Billing.tsx`, `api/src/services/stripe.ts`, `web/src/app/Deploy.tsx`
- **Comportament observat:** comanda plasată din interfață ajunge la `http://127.0.0.1:30006/app/billing?checkout=test_cs_cmvlp59te00eydxb99fj0kisx`. Pagina afișează „THIS MONTH (ESTIMATE) €0.00", „CURRENT PERIOD ENDS — Not available yet" și **nu conține niciun cuvânt** despre `checkout`, `test`, comandă, plată sau anulare. Parametrul rămâne în adresă, iar nicio cerere a paginii nu încearcă să-l rezolve: singurele apeluri sunt `GET /api/orders` și `GET /api/catalog/products`. Comanda rămâne în `AWAITING_PAYMENT`, iar clientul rămâne pe o pagină de facturare fără explicație și fără nicio acțiune.
- **Comportament așteptat:** la întoarcerea de la plată, pagina de facturare arată starea comenzii („plătit", „în așteptare", „anulat") și, în poarta locală de test, finalizează plata.
- **Pași de reproducere:**
  1. În interfață: `/app/deploy/discord-bot` → „Review order" → „Continue to payment" → „Pay and deploy".
  2. Adresa devine `/app/billing?checkout=test_cs_<id>`.
  3. Textul paginii nu conține niciun cuvânt despre comandă sau plată.
  4. `GET /api/orders/<id>` → `status: AWAITING_PAYMENT`.
  5. Cu tokenul intern, `POST /api/webhooks/stripe/test` → 200 și comanda devine `PAID`: **plata funcționează, dar nu există nicio cale de interfață care să o declanșeze**.
- **Cauză root cause:** `web/src/app/Billing.tsx` nu conține nicio apariție a cuvântului `checkout` — parametrul nu este citit nicăieri. Adresa de întoarcere este construită în `api/src/services/stripe.ts:188-190` (`test_cs_${order.id}`) și, pentru Stripe real, în `api/src/services/stripe.ts:231-232` (`success_url` / `cancel_url` ambele către `/app/billing?checkout=…`). Redirecționarea se face în `web/src/app/Deploy.tsx:344-349` prin `location.assign(checkout.url)`.
- **Remediere propusă:** în `Billing.tsx`, citește `checkout` din `useRouter().query`, afișează starea comenzii (apeland `GET /api/orders/:id`) și, pentru `test_cs_*`, declanșează finalizarea printr-un endpoint dedicat, cu rol și CSRF, în loc de a expune tokenul intern în browser. Adaugă și tratamentul pentru `checkout=cancelled` și `checkout=success`.
- **Criteriu de verificare:** după plasarea comenzii din interfață, comanda trece în `PAID` fără intervenție manuală; un checkout anulat afișează un mesaj explicit pe pagina de facturare; textul paginii conține starea comenzii.

---

### CJ-P1-02 — Clientul plătește și nu primește nicio factură

- **Severitate:** **Medium**
- **Stare:** confirmă **FN-P1-26** (`FUNCTIONAL-COVERAGE.md`), cu cauza root cause completă
- **Modul:** `api/src/services/stripe.ts`, `api/src/services/billing.ts`, `api/src/routes/billing.ts`
- **Comportament observat:** după o plată reușită de 172 (EUR) — cotată, abonament și prețul instanței identice — `GET /api/billing/invoices` întoarce `{"invoices":[]}`: **nicio factură**. Abonamentul este creat (172, `ACTIVE`) și instanța este provisionată, dar lista de facturi rămâne goală. Singura factură apare după o reînnoire manuală sau după sweep-ul de la închiderea perioadei.
- **Comportament așteptat:** o plată efectuată produce o factură vizibilă imediat în contul clientului.
- **Pași de reproducere:**
  1. `POST /api/orders` (produs cu preț) → 201, `total: 172`.
  2. `POST /api/orders/<id>/checkout` → 200, adresă de plată.
  3. `POST /api/webhooks/stripe/test` (token intern) → 200, comanda devine `PAID`.
  4. `GET /api/billing/invoices` → `{"invoices":[]}`; `GET /api/billing/subscriptions` → un abonament de 172.
  5. `POST /api/billing/subscriptions/<id>/renew` → creează `BM-INV-00002` de 172.
- **Cauză root cause:** platforma **nu are o cale proprie de a scrie factura la plata unei comenzi**. Factura este scrisă în două locuri numai: `api/src/services/stripe.ts:496` — în `upsertInvoice`, apelată doar când evenimentul furnizorului conține o factură Stripe — și `api/src/services/billing.ts:633` (sweep-ul de facturare, la închiderea perioadei) și `api/src/services/billing.ts:936` (reînnoirea manuală). Lista clientului este `api/src/routes/billing.ts:322-328`.
- **Remediere propusă:** scrie o factură provizorie în momentul în care comanda devine `PAID` (același cod ca în `services/billing.ts:633`, cu `nextInvoiceNumber()`), astfel încât suma facturată să fie întotdeauna suma încasată; păstrează factura furnizorului ca reconciliere, nu ca unică sursă.
- **Criteriu de verificare:** după o plată, `GET /api/billing/invoices` întoarce cel puțin o factură cu suma comenzii, cu număr unic și cu perioada curentă.

---

### CJ-P1-03 — Clientul care deschide un bilet nu primește nicio confirmare prin e-mail

- **Severitate:** **Medium**
- **Stare:** **nou** (tangent cu FN-P1-07, dar un efect diferit și măsurabil)
- **Modul:** `api/src/routes/tickets.ts`, `api/src/lib/email-templates.ts`
- **Comportament observat:** la `POST /api/tickets` (201) ajunge **exact un** e-mail nou, către `admin.check@example.test` („[Blipmade] New ticket: CJ journey ticket"). Clientul care a deschis biletul **nu primește niciun e-mail**. Singurul mesaj nou capturat în căsuța de e-mail a fost cel către personal. La fel, răspunsul personalului ajunge la client, dar ca **text simplu**, nu ca șablonul proiectat pentru client.
- **Comportament așteptat:** clientul primește confirmarea că biletul a fost înregistrat și va fi răspuns; răspunsul personalului sosește în șablonul proiectat, cu link către bilet.
- **Pași de reproducere:**
  1. Cont nou → `POST /api/tickets` cu subiect, categorie, prioritate, corp → 201.
  2. Se citește căsuța de e-mail: un singur mesaj nou, destinatar `admin.check@example.test`.
  3. Niciun mesaj cu destinația adresei clientului.
- **Cauză root cause:** șabloanele `ticketCreatedTemplate` și `ticketReplyTemplate` din `api/src/lib/email-templates.ts:262` și `:290` **nu sunt apelate nicăieri** (`grep` pe tot arborele sursă: doar definițiile). Handlerul de creare (`api/src/routes/tickets.ts:147-200`) apelează doar `notifyStaff` (`:447-461`), iar cel de răspuns apelează `notifyReply` (`:464-476`), care trimite un text simplu, fără șablon.
- **Remediere propusă:** la crearea biletului, trimite clientului `ticketCreatedTemplate` (numărul biletului, timpul de răspuns, linkul către fir) prin coada de e-mail; la răspunsul personalului, folosește `ticketReplyTemplate`. Ambele mesaje trebuie să fie **idempotente** (cheie de idempotență per bilet + eveniment), ca o reîncercare a cozii să nu dubleze mesajul.
- **Criteriu de verificare:** după deschiderea unui bilet, căsuța de e-mail a clientului conține un mesaj de confirmare care conține numărul biletului; după un răspuns al personalului, clientul primește un mesaj cu șablonul proiectat.

---

### CJ-P1-04 — Lista de bilete a clientului nu este trunchiată: `limit` și `offset` sunt ignorate

- **Severitate:** **Medium**
- **Stare:** **nou** pentru suprafața clientului (raportul ADMIN-FUNCTIONALITY.md descrie aceeași lipsă doar pentru listele de **admin**)
- **Modul:** `api/src/routes/tickets.ts`
- **Comportament observat:** `GET /api/tickets?limit=2&offset=0` întoarce **toate cele 6 bilete** ale clientului, nu 2. Parametrii sunt acceptați și ignorați; trunchierea se face implicit la 100 de rânduri.
- **Comportament așteptat:** `limit` și `offset` (sau `page`) sunt onorate, iar răspunsul spune câte obiecte există în total.
- **Pași de reproducere:** `GET /api/tickets?limit=2&offset=0` → 200, 6 rânduri (în a doua rulare: 264 de bilete, toate returnate).
- **Cauză root cause:** `api/src/routes/tickets.ts:136-145` — `prisma.ticket.findMany({ where, include, orderBy: { updatedAt: 'desc' }, take: 100 })`: există `take: 100` fix, dar nici `skip`, nici un `take` derivat din cerere, nici un total. Același model apare la `api/src/routes/billing.ts:322-328` (facturi, `take: 100`).
- **Remediere propusă:** acceptă `limit` (implicit 25, maxim 100) și `offset`/`cursor`, aplică `take`/`skip`, și întoarce `{ tickets, total }`; aceeași regulă pentru facturi și comenzi.
- **Criteriu de verificare:** `GET /api/tickets?limit=2` întoarce exact 2 bilete și un total corect; un client cu peste 100 de bilete poate ajunge la cele mai vechi.

---

### CJ-P1-05 — Schimbarea adresei de e-mail nu cere parola

- **Severitate:** **Medium**
- **Stare:** **nou** (complementar la SESS-P1-06, care tratează sesiunile, nu reautentificarea)
- **Modul:** `api/src/routes/settings.ts`
- **Comportament observat:** `POST /api/settings/email` cu `{ "email": "…@example.test" }` este acceptat cu **HTTP 200** dintr-o sesiune validă, **fără niciun câmp de parolă**. Pentru comparație, `POST /api/settings/password` cere `currentPassword` și este refuzat cu 400 când parola e greșită. Adresa nouă este confirmată printr-un link trimis la **adresa nouă**, deci un atacator cu o sesiune furată își poate muta contul pe o adresă pe care o controlează, fără nicio urmă a parolei.
- **Comportament așteptat:** schimbarea adresei cere parola curentă (sau o confirmare prin e-mail la adresa **veche**, în plus față de confirmarea la adresa nouă).
- **Pași de reproducere:**
  1. Autentificare → `POST /api/settings/email` cu `{ email: "nou@…" }` → **200**, `pendingEmail` setat.
  2. Niciun câmp de parolă în corpul cerut (schema Zod: `z.object({ email: … })`).
  3. Linkul de confirmare sosește la adresa nouă; după confirmare, `GET /api/auth/session` arată adresa nouă.
- **Cauză root cause:** `api/src/routes/settings.ts:303-310` — schema corpului este doar `{ email }`; nu există `currentPassword` și nu există nicio comparație cu o parolă sau cu o metodă de reautentificare.
- **Remediere propusă:** cere `currentPassword` (ca la `POST /api/settings/password`, `api/src/routes/settings.ts:413`) sau o confirmare la adresa **veche**; marchează evenimentul în jurnalul de sesiune.
- **Criteriu de verificare:** `POST /api/settings/email` fără parola curentă → 400/401; cu parola corectă → 200 și e-mailul de confirmare la adresa nouă.

---

### CJ-P1-06 — Garda per cont numără și autentificările reușite

- **Severitate:** **Medium**
- **Stare:** confirmă **SESS-P1-05** (`SESSIONS-INVESTIGATION.md`)
- **Modul:** `api/src/routes/auth.ts`
- **Comportament observat:** 12 autentificări **corecte** consecutive cu un cont nou din browser: primele 10 → HTTP 200, a 11-a și a 12-a → **HTTP 429** „Too many requests. Try again shortly." Contorul este pe adresa de e-mail a contului, cu fereastră de 15 minute, și se consumă la fiecare încercare, inclusiv la cele reușite.
- **Comportament așteptat:** contorul numără eșecurile (sau are un prag separat, mai mare, pentru reușite), ca un client cu mai multe dispozitive sau cu un cont partajat să nu fie blocat cu parola corectă.
- **Pași de reproducere:** `for i in $(seq 1 12); do curl -X POST $API/api/auth/login -d '{"email":"…","password":"…"}'; done` → `200 ×10`, apoi `429 ×2`.
- **Cauză root cause:** `api/src/routes/auth.ts:86-99` — `accountGuard(app, 10)` este un `preHandler` pe `/auth/login` (`:182`) fără `skipSuccessfulRequests`.
- **Remediere propusă:** `skipSuccessfulRequests: true` pentru garda per cont, cu un plafon separat pentru reușite (de exemplu 30/15 min); excepție explicită pentru conturile de echipă.
- **Criteriu de verificare:** 12 autentificări corecte consecutive pe același cont → toate 200; 11 autentificări greșite consecutive → 429 la a 11-a.

---

### CJ-P1-07 — Limitele de 5 pe 15 minute sunt comune tuturor clienților de pe aceeași adresă

- **Severitate:** **Medium**
- **Stare:** **nou**
- **Modul:** `api/src/routes/auth.ts`, `api/src/routes/settings.ts`, `api/src/app.ts`
- **Comportament observat:** `POST /api/auth/forgot-password`, `POST /api/auth/resend-verification` și `POST /api/settings/email` au fiecare `max: 5, timeWindow: '15 minutes'`, cu cheia calculată **per adresă de client**. În sandbox, a treia cerere de schimbare a adresei a primit **HTTP 429** din cauza celor două cereri anterioare ale aceleiași adrese. În producție, adresa este cea a clientului real, deci **mai mulți clienți din aceeași firmă, campus sau rețea de operator** împart același contor: un client care uită parola de cinci ori blochează, pentru 15 minute, resetarea parolei tuturor celorlalți clienți de pe aceeași adresă.
- **Comportament așteptat:** pragul de resetare/verificare să fie per cont (ca garda per cont) și suficient de mare pentru un birou, sau mesajul să spună clientului că este o limită per adresă.
- **Pași de reproducere:** trei cereri `POST /api/settings/email` în aceeași fereastră → primele două 200, a treia 429.
- **Cauză root cause:** limitele de rută din `api/src/routes/auth.ts:305` (`forgot-password`), `:323` (`resend-verification`) și `api/src/routes/settings.ts:304` (`/settings/email`) folosesc `keyGenerator: addressKey`, care este per adresă (`api/src/routes/auth.ts:73-76`), nu per cont. Limita per cont (`accountGuard`, 5) se aplică doar la `forgot-password`/`resend` prin `mailGuard` (`api/src/routes/auth.ts:185`), nu la `/settings/email`.
- **Remediere propusă:** pentru `/settings/email`, folosește o cheie per cont (adresa de e-mail a utilizatorului autentificat) și un prag mai mare (de exemplu 10/15 min); pentru `forgot-password` și `resend`, păstrează plafonul per cont și adaugă unul per adresă, mai mare, doar ca apărare împotriva abuzului.
- **Criteriu de verificare:** cinci resetări de parolă de la cinci conturi diferite de pe aceeași adresă sunt toate acceptate; a șasea resetare **a aceluiași cont** este refuzată.

---

### CJ-P1-08 — Rutele de putere răspund 200, deși codul spune 202

- **Severitate:** **Low**
- **Stare:** **nou**
- **Modul:** `api/src/routes/instances.ts`
- **Comportament observat:** `POST /api/instances/:id/power` cu `{"action":"start|stop|restart|kill"}` răspunde **HTTP 200** cu `{"instanceId":"…","accepted":true}`. Toate cele patru acțiuni au fost acceptate corect. Dar comentariul din cod spune explicit că „The power route answers 202 because the container reacts asynchronously", iar numele helperului este `reply202`. Clientul nu poate distinge „acțiunea a fost pornită" de „acțiunea s-a terminat" și nici interfața nu poate afișa „în curs".
- **Comportament așteptat:** HTTP 202 Accepted, conform promisiunii din cod.
- **Pași de reproducere:** `POST /api/instances/<id>/power` cu acțiunea `start` → 200 `{"accepted":true}`; la fel pentru `stop`, `restart`, `kill`.
- **Cauză root cause:** `api/src/routes/instances.ts:366-368` — `reply202()` întoarce un obiect care este trimis cu codul implicit 200; numele helperului promite 202.
- **Remediere propusă:** `reply.code(202).send({ instanceId, accepted: true })`; interfața poate apoi afișa starea „în curs" până când evenimentele confirmă finalizarea.
- **Criteriu de verificare:** toate cele patru acțiuni de putere răspund 202, iar interfața arată o stare de tranziție până la sosirea evenimentului.

---

### CJ-P1-09 — O dublă apăsare pe butonul de comandă creează două comenzi

- **Severitate:** **Medium**
- **Stare:** **nou**
- **Modul:** `api/src/routes/orders.ts`, `web/src/app/Deploy.tsx`
- **Comportament observat:** două cereri `POST /api/orders` simultane cu același corp au creat **două comenzi distincte** (HTTP 201 și HTTP 201). Limita de rută este 30/10 minute, deci nu protejează împotriva dublei apăsări. Pentru o comandă gratuită sau cu o promoție, asta înseamnă două instanțe provisionate pentru o singură intenție, și două rezervări de campanie.
- **Comportament așteptat:** fiecare intenție de comandă produce o singură comandă; o dublă apăsare este absorbită.
- **Pași de reproducere:** `Promise.all([POST /api/orders, POST /api/orders])` cu același corp → două comenzi create.
- **Cauză root cause:** `api/src/routes/orders.ts` — handlerul nu acceptă și nu verifică o cheie de idempotență, iar interfața (`web/src/app/Deploy.tsx`) nu trimite una; butonul principal (`PrimaryButton`) este dezactivat doar în timpul cererii (`placeOrder.pending`), deci o dublă apăsare înainte de re-randare trece.
- **Remediere propusă:** acceptă un `Idempotency-Key` (sau un `idempotencyKey` în corp) și întoarce comanda existentă la o repetare; la nivel de interfață, blochează butonul la primul pointerdown, nu doar în timpul cererii.
- **Criteriu de verificare:** două cereri identice simultane cu aceeași cheie → o singură comandă; interfața afișează o singură comandă în listă după o dublă apăsare.

---

### CJ-P1-10 — Prima instanță a fiecărui ou nu poate fi provisionată fără un server-sablon creat de un om

- **Severitate:** **High** (operațional)
- **Stare:** **nou**
- **Modul:** `api/src/services/pterodactyl/application.ts`
- **Comportament observat:** provisionarea unei instanțe pentru un produs a eșuat cu `server_created: No environment template is known for egg 15. Create one server on this egg through the panel first.` Pentru că panoul Pterodactyl 1.15 nu expune variabilele unui ou prin Application API, platforma le **derivează dintr-un server existent pe același ou**. În sandbox, prima comandă pentru fiecare produs a eșuat astfel; după ce a existat un server-sablon pe ou, provisionarea a mers până la capăt (instanță `ONLINE`, `pterodactylServerId` și `pterodactylUuid` setate, pasul `activated`). Întrebarea de produs este: **în panoul de producție, ouurile produselor din catalog au un server-sablon?** Dacă nu au, fiecare prim client al fiecărui produs va eșua la provisionare.
- **Comportament așteptat:** platforma poate provisiona prima instanță a unui produs fără o acțiune manuală în panou.
- **Pași de reproducere:**
  1. Panoul nu are niciun server pe oul 15.
  2. `POST /api/orders` → plată → coada de provisionare.
  3. Eroarea: `No environment template is known for egg 15. Create one server on this egg through the panel first.`; instanța rămâne `FAILED`, fără UUID de panou.
  4. Se creează un server pe oul 15 prin panou; provisionarea următoare reușește (`ONLINE`).
- **Cauză root cause:** `api/src/services/pterodactyl/application.ts:277-288` — `eggEnvironmentTemplate(eggId)` caută un server existent pe ou și aruncă o excepție dacă nu găsește niciunul; nu există o cale de a citi variabilele direct de la ou și nici o provisionare automată a șablonului.
- **Remediere propusă:** la prima provisionare a unui ou, creează automat serverul-sablon (sau folosește `egg_id` + `egg` cu variabilile din API-ul de ou, dacă versiunea de panou o permite) și marchează oul ca „gata" în baza de date; în plus, un control în panoul de administrare care să spună explicit, pentru fiecare produs, dacă oul are sau nu șablon.
- **Criteriu de verificare:** într-un panou gol, prima comandă pentru fiecare produs din catalog se provisionează până la `ONLINE` fără nicio intervență manuală.

---

### CJ-P1-11 — Notificarea de bilet nu ajunge la inbox-ul de suport, ci la adresele conturilor de personal; fără personal, se pierde în tăcere

- **Severitate:** **Medium**
- **Stare:** **nou**
- **Modul:** `api/src/routes/tickets.ts`, `api/src/env.ts`
- **Comportament observat:** la deschiderea unui bilet, e-mailul de notificare a ajuns la `admin.check@example.test` — adresa **contului de personal** — și nu la `MAIL_SUPPORT_EMAIL` (`support@example.test`), care apare în descrierea variabilei de mediu ca „The inbox that receives the notifications about new support tickets", dar în cod nu este folosit ca destinatar nicăieri (doar ca adresă de contact în subsolul e-mailurilor, `api/src/lib/email-templates.ts:167,195`). Mai mult, dacă nu există **niciun** cont cu rol `STAFF`/`ADMIN`, `notifyStaff` face `return` imediat (`api/src/routes/tickets.ts:453`) și **nicio notificare nu este trimisă**, fără nicio urmă în jurnal: clientul deschide un bilet și nimeni nu află.
- **Comportament așteptat:** notificarea ajunge la inbox-ul de suport configurat; dacă nu există niciun destinatar, sistemul spune acest lucru (jurnal + metrică), nu tăcerea.
- **Pași de reproducere:**
  1. `POST /api/tickets` → 201.
  2. Căsuța de e-mail: un mesaj, destinatar `admin.check@example.test`; niciunul către `support@example.test`.
  3. (Cazul fără personal, verificat în cod, nu rulat: `api/src/routes/tickets.ts:448-453` — `if (!staff.length) return;`.)
- **Cauză root cause:** `api/src/routes/tickets.ts:447-461` (`notifyStaff`) trimite către `staff.map(u => u.email)`; variabila `MAIL_SUPPORT_EMAIL` (`api/src/env.ts:64`) nu este folosită ca destinatar.
- **Remediere propusă:** trimite notificarea către `MAIL_SUPPORT_EMAIL` (configurat) și, în copie, către conturile de personal; când nu există niciun destinatar, scrie un eveniment și o intrare în jurnalul de e-mail, astfel încât lipsa să fie vizibilă.
- **Criteriu de verificare:** un bilet nou produce un e-mail la inbox-ul de suport configurat; în lipsa oricărui destinatar, evenimentul apare în `/admin/email/delivery` și în jurnal.

---

### CJ-P1-12 — Contractul public al catalogului expune un preț pentru un produs care nu poate fi comandat

- **Severitate:** **Low**
- **Stare:** **nou** (interfața compensează corect; contractul API nu)
- **Modul:** `api/src/routes/catalog.ts`
- **Comportament observat:** `GET /api/catalog/products` întoarce pentru `uptime-kuma`: `deployable: false`, `availability.state: COMING_SOON` **și** `price: { amount: 149, currency: 'EUR', period: 'MONTHLY' }`. Un consumator al API-ului public vede un preț pentru un produs care nu poate fi comandat. **Interfața este corectă**: atât catalogul din pagina de pornire (`web/src/home/Catalog.tsx`, prin `isOrderable`/`availabilityLabel`/`orderBlockers`), cât și catalogul clientului (`web/src/app/DeployCatalog.tsx:43-63`) arată produsul ca indisponibil și nu oferă butonul de comandă, iar `POST /api/catalog/quote` refuză produsul cu mesajul „This product is not deployable yet." Deci defectul este de contract, nu de călătorie.
- **Comportament așteptat:** un produs care nu poate fi comandat nu are preț activ în contractul public, sau prețul este marcat explicit ca neaplicabil.
- **Pași de reproducere:** `GET /api/catalog/products` → elementul `uptime-kuma` cu `deployable: false` și `price.amount: 149`; `POST /api/catalog/quote` cu acel produs → 400 „This product is not deployable yet."
- **Cauză root cause:** `api/src/routes/catalog.ts` — serializarea produsului (`serializeProduct`) include prețul și starea de disponibilitate independent una de cealaltă; prețul rămâne activ în baza de date pentru un produs neprovisionabil.
- **Remediere propusă:** fie nu publica prețul pentru un produs cu `deployable: false`, fie marchează-l în contract cu `orderable: false`; la fel, interfața rămâne cum este.
- **Criteriu de verificare:** contractul public nu prezintă un preț care poate fi confundat cu unul comandabil, sau marchează explicit imposibilitatea de comandă.

---

## 6. Capabilități anunțate dar absente

| # | Capacitatea anunțată | Unde este anunțată | Ce există efectiv | Stare |
|---|---|---|---|---|
| 1 | **Pagina de metrici a instanței** | `web/src/pages/Docs.tsx` („Check the metrics", „Getting it wrong") | `GET /api/instances/:id/metrics` există în API și **nu are niciun apelant**; pagina instanței are 12 taburi și niciunul de metrici. Confirmat și în interfață: lista de taburi nu conține „Metrics". | Absentă din interfață (FN-P1-04) |
| 2 | **Atașamente la bilete** | selectorul de fișiere din `web/src/app/TicketDetail.tsx:90,99-103` | Backend-ul **funcționează**: `POST /api/tickets/:id/attachments` acceptă multipart real, creează rândul în `Attachment` și permite descărcarea. Dar interfața trimite doar `{name,size,type}` (JSON), nu multipart — așa că din interfață **nu se atașează niciodată nimic**, iar tabelul `Attachment` rămâne gol. | Prezentă în API, inaccesibilă din interfață (FN-P1-02) |
| 3 | **Finalizarea plății din interfață** | `POST /api/orders/:id/checkout` întoarce o adresă de plată; interfața redirecționează clientul acolo | Singurul mecanism care încheie plata locală este `POST /api/webhooks/stripe/test`, care cere tokenul intern și **nu este apelat de nicio pagină**. | Absentă (CJ-P1-01) |
| 4 | **Inbox de suport pentru bilete** | `MAIL_SUPPORT_EMAIL` — „The inbox that receives the notifications about new support tickets" (`api/src/env.ts:64`) | Variabila nu este folosită ca destinatar nicăieri; notificarea merge către adresele conturilor de personal, iar fără personal se pierde în tăcere. | Anunțată, nefolosită (CJ-P1-11) |
| 5 | **Confirmarea e-mail a biletului către client** | șablonul `ticketCreatedTemplate` există în `api/src/lib/email-templates.ts:262` | Șablonul nu este apelat nicăieri; clientul nu primește niciun e-mail la deschiderea biletului. | Anunțată prin șablon, nefolosită (CJ-P1-03) |
| 6 | **Informațiile de e-mail ale contului de panou** | `pterodactylUserId` este completat de bridge (`services/panel/identity.ts`) | API-ul îl întoarce **mereu `null`** clientului (`publicUser` din `api/src/routes/auth.ts:102-121`). | Completat, dar ascuns (FN-P1-13) |

---

## 7. Ce nu am putut verifica

| Subiect | De ce nu s-a putut | Ce s-a făcut în schimb |
|---|---|---|
| Firefox și WebKit | binarele nu sunt instalate pe mașina de audit | toate măsurătorile de interfață sunt Chromium-only (1440×900) |
| Livrarea reală a e-mailurilor | nu există un MTA real | sink SMTP local: mesajele au fost capturate, iar **tokenurile** au fost citite din ele și folosite pentru a verifica adresa, resetarea parolei și schimbarea adresei |
| Stripe real | `STRIPE_SECRET_KEY` gol; doar poarta locală de test | comanda, adresa de plată, confirmarea plății și provisionarea au fost verificate pe poarta locală; webhook-urile, 3DS și taxele Stripe nu au fost atinse |
| Pterodactyl real, Wing, containere | panoul este simulat | crearea serverului, alocarea, stările, metricile, fișierele și keymint-ul au fost verificate prin stub; sonda de sănătate a fost satisfăcută de un responder HTTP local, nu de o aplicație reală |
| Domenii, certificate TLS, DNS, Caddy | `DOMAIN_BASE` și `CADDY_ADMIN_URL` neconfigurate | rutele de domenii au fost verificate doar la nivel de API (stările `PENDING_DNS`/`ACTIVE`) |
| Ciclul real de facturare (30 de zile) | nu se poate aștepta o perioadă | s-au verificat logica (sweep-ul de facturare, reînnoirea manuală, tranzițiile abonamentului) și faptul că sumele sunt egale |
| Pagina de resetare a parolei și pagina de verificare a adresei, deschise în browser | tokenul a fost consumat direct prin API | s-a verificat că linkul generat în e-mail conține un token care, trimis prin API, schimbă efectiv starea (adresă verificată / parolă schimbată) |
| Enumerarea de conturi pe adresa de e-mail la **creare** | ruta de creare răspunde 409 „An account already uses this email address." | s-a măsurat că ruta de **autentificare** și cele de **e-mail** nu enumeră conturi (mesaje identice); diferența dintre ele este înregistrată în §4.1 |
| Comportamentul pe hardware real și pe ecrane mici | doar Chromium headless | — |

---

## 8. Defectele de călătorie care blochează un GO comercial

În ordinea în care blochează lansarea:

1. **CJ-P1-01 — întoarcerea de la plată nu arată nimic și nu finalizează plata.** Fiecare client care comandă trece prin acest ecran. Cât timp pagina de facturare nu știe de ce a venit clientul și nu poate confirma plata, fluxul de plată nu se încheie prin interfață, iar comanda rămâne „în așteptare" pentru totdeauna. **Blochează GO.**
2. **CJ-P1-10 — prima instanță a fiecărui produs nu poate fi provisionată fără o intervență manuală în panou.** Dacă oul unui produs din catalog nu are server-sablon în panoul de producție, primul client al acelui produs primește o instanță în stare `failed`. **Blochează GO** — trebuie verificat starea oualor din panoul de producție înainte de lansare.
3. **CJ-P1-02 — clientul plătește și nu primește factură.** Nu blochează tehnic vânzarea, dar blochează încrederea și orice flux de contabilitate; într-o platformă de hosting, factura este documentul cu care clientul justifică plata. **Blochează GO** pentru clienții business.
4. **CJ-P1-03 și CJ-P1-11 — canalul de suport prin e-mail nu este complet.** Clientul nu primește confirmarea biletului, iar notificarea pentru echipă merge către adresele individuale ale personalului, nu către inbox-ul configurat; fără conturi de personal, notificarea dispare. Pentru un produs de hosting, e-mailul este canalul de suport de bază. **Blochează GO** pentru clienții care nu folosesc chatul.
5. **CJ-P1-05 — schimbarea adresei de e-mail fără parolă.** Fiecare cont compromis poate fi mutat pe o adresă a atacatorului. Nu blochează GO-ul comercial, dar trebuie remediat înainte de lansare.
6. **CJ-P1-09 — dublă apăsare pe „Order" creează două comenzi.** Cu o promoție sau la preț zero, clientul primește două instanțe pentru o intenție. Nu blochează GO-ul, dar strică încrederea imediat după prima eroare de utilizator.
7. **CJ-P1-06, CJ-P1-07, CJ-P1-04, CJ-P1-08, CJ-P1-12** — calitățți de serviciu și consistență de contract: blocaje de cont pe autentificări reușite, limite împărțite per adresă, liste care nu se paginează, cod HTTP care nu corespunde promisiunii din cod, contract public cu preț pentru un produs necomandabil. **Nu blochează GO-ul**, dar se repară în aceeași campanie.
