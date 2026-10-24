# PHASE 14–15 — Reparațiile de cod care închid găurile lăsate de retest

**Data:** 2026-10-24
**Rol:** implementator al fazelor 14 și 15. **Nu** am participat la retestul independent
(`PHASE-13-RETEST.md`) și **nu** îl reprodus aici: verificarea independentă a acestor două faze
este un proces separat, cu alt agent, în desfășurare (`PHASE-14-15-RETEST.md`).
**Ramă:** `remediation/phase-2-critical-fixes`
**Commituri:** `f8b2051` (faza 14), `4969f4a` (faza 15) — peste `888a274`
**Bază de date a suitei:** `blipmade_phase14_test` (creată pentru aceste faze; producția neatinsă)

---

## 1. De ce au existat fazele 14 și 15

Retestul independent al fazei 13 a încheiat cu **7 reparări `DA`, 3 `PARȚIAL`, 0 `NU`** și cu
trei constatări noi pe care le-am tratat drept **defecte deschise**, nu drept observații:

| ID | Constatarea retestului | Severitate | Ce am reparat |
|---|---|---|---|
| `RT-P1-01` | Comanda anulată sau rambursată poate fi resuscitată prin checkout și onorată | **P1 / Critical** | Faza 15 |
| `RT-P1-02` | Jumătatea „de personal" a constatării `ADM-P1-02` nu e reparată | **P1 / High** | Faza 15 |
| `RT-P2-01` | Contorul limitării de rată rămâne global pe șase rute, și niciun test nu apără repararea | **P2 / Medium** | Faza 14 |
| `RT-P2-03` | `markOrderPaid` nu verifică suma pe care i-o dă caller-ul | P2 / Medium | Faza 15 |
| `RT-P2-04` | Rambursarea comenzii unui administrator nu e acoperită de gardă | P2 / Medium | Faza 15 |
| `RT-P3-01` | `api/tests/zz-probe3.test.ts` (scaffolding de depanare) a rămas în ramă | P3 / mică | Faza 15 |
| `RT-P3-02` | `POST /api/orders/:id/cancel` suprascrie starea `REFUNDED` | P3 / mică | Faza 15 |

În plus, **faza 14 închide `SEC-P1-02` și `SESS-P1-04`** (limita per-adresă devenită limită de
platformă / per-edge) și **`SESS-P1-05` + `ADM-P2-06`** (contorul de autentificare care număra și
autentificările reușite) — constatări pe care sinteza le-a marcat `STILL BROKEN`.

**Rămân deschise, în mod explicit:** `RT-P2-02` (planul anual nu e accesibil din interfață),
`RT-P2-05` (fișa unui cont `ADMIN` rămâne lizibilă de un personal), `RT-P2-06` (stiva de revizie
de pe `3101`/`30003` rulează cod vechi) și `RT-P3-03` (două mecanisme paralele pentru `Secure`).

---

## 2. Faza 14 — adresa clientului și contoarele limitărilor

### 2.1 Lanțul real al adresei, măsurat

Producția are trei salturi, nu unul:

```
vizitator → edge (10.77.0.12, Caddy) → web (containăr 172.18.0.6) → API (containăr 172.18.0.5)
```

Măsurătorile făcute pe această rundă:

| Fapt | Cum a fost măsurat |
|---|---|
| Edge-ul e la `10.77.0.12` și web-ul îl crede | `TRUSTED_PROXY_IPS=10.77.0.12` în `.env` |
| API-ul crede web-ul **implicit** | `compose.api.yml:14` → `TRUSTED_PROXIES: "${TRUSTED_PROXIES:-127.0.0.1,::1,172.16.0.0/12}"`, iar `.env` **nu** are `TRUSTED_PROXIES` |
| Rețeaua Docker | `docker network inspect blipmade_default` → `172.18.0.0/16` |
| Web-ul rescrie headerele înainte de a trimite la API | `web/server.mjs` — șterge `x-forwarded-for`, `x-real-ip`, `x-forwarded-proto` și le scrie din adresa rezolvată |
| Web-ul citea lanțul **din stânga** | `web/src/lib/client-address.mjs` — bucla `for (const candidate of splitChain(...))` cu `return` la prima adresă care nu e proxy cunoscut |

### 2.2 Defectul, măsurat înainte de reparare

Lanțul `X-Forwarded-For` se construiește **prin adăugare**: edge-ul scrie adresa vizitatorului
**la sfârșitul** lanțului și păstrează ce a trimis vizitatorul **la început**. Citit din stânga,
lanțul spune ce vrea vizitatorul.

Rezultatul măsurat pe codul de la `888a274` (doveza: `_raw/phase14-proof-unpatched.txt`):

```
edge trusted, client forged a prefix  ->  9.9.9.9      ← adresa aleasă de client
edge trusted, honest chain             ->  5.6.7.8
edge unknown (peer neîncredincios)     ->  172.18.0.5
```

Așadar, în producție, vizitatorul alege el însuși adresa după care platforma îl numără și îl
înregistrează: **limitele se pot ocoli, iar jurnalul poate fi otrăvit**.

Al doilea defect, independent: **12 rute cu limită de rată**, dintre care faza 13 a reparat
doar 6 (cele de autentificare). Celelalte 6 — `catalog.ts:170` (`POST /catalog/quote`, **anonim**),
`orders.ts:64` (`POST /orders`), `settings.ts:304,365,413,569` — foloseau cheia globală
`request.ip` (`api/src/app.ts:80`). Măsurat de retestul independent: **121 cotări → HTTP 429, iar
un alt vizitator primea tot HTTP 429** — un contor pentru toată platforma.

Al treilea defect: contorul per-cont număra **fiecare** cerere de autentificare, inclusiv
autenticările reușite. Măsurat: **11 autentificări corecte consecutive → a 11-a = HTTP 429**
(`SESS-P1-05` / `ADM-P2-06`).

### 2.3 Ce am schimbat

| Fișier | Schimbarea | De ce |
|---|---|---|
| `web/src/lib/client-address.mjs` | Lanțul se citește **din dreapta**: adresa clientului e ultimul element care nu e proxy cunoscut | Edge-ul scrie adresa vizitatorului la sfârșit; ce a trimis vizitatorul e la început și nu mai contează |
| `api/src/plugins/auth.ts` | Se exportă `addressRateLimitKey(request)`: adresa clientului când e cunoscută, **conexiunea** când nu e | Ca o limită să nu poată deveni limită de platformă nici când lista de proxy-uri nu e setată |
| `api/src/app.ts` | Limita globală folosește cheia nouă | Era `request.ip` — adresa proxy-ului când proxyul nu e crezut |
| `api/src/routes/catalog.ts`, `orders.ts`, `settings.ts` | Cele 6 rute cu limită folosesc cheia nouă | Închide `RT-P2-01` |
| `api/src/lib/failed-attempts.ts` (nou) | Contor de încercări eșuate, cu fereastră, tabel mărginit | Contorul de autentificare trebuie să numere eșecurile, nu cererile |
| `api/src/routes/auth.ts` | Autentificarea: contorul per-cont și per-adresă numără doar eșecurile; o autentificare reușită **șterge** contorul contului; plafonul total de cereri pe adresă = 30 | `SESS-P1-05` / `ADM-P2-06`: clientul nu se blochează singur, iar ghirirea de parolă e numărată în continuare |
| `api/src/env.ts` | `LOGIN_RATE_LIMIT_MAX` e documentat ca „numărul de încercări **eșuate**" | Knob-ul exista; semantica lui trebuia să spună ce măsoară |

**De ce plafonul total a rămas.** Limita de eșecuri protejează contul și serverul; un plafon
separat de cereri protejează procesul de un potop de cereri (fiecare autentificare costă o
comparare `scrypt`). Plafonul a fost 10 și număra și succesele; e acum **30 de cereri pe adresă în
15 minute**, suficient pentru un client real și suficient de mic pentru a nu lăsa procesul să ardă.

### 2.4 Dovada că testele cad fără reparare

Rulată pe codul **nereparat** (`888a274`), într-un arbore de lucru separat:

```
=== web: node --test web/tests/client-address.test.mjs ===
not ok 1 - the last address of the chain is the address of the client
not ok 11 - the chain of the header is read from the right, not from the left
not ok 12 - a client that forges the head of the chain does not choose its address
# tests 13   # pass 10   # fail 3

=== api: vitest run tests/phase14-rate-limits.test.ts ===
   × the limit of the sign-in > does not count a sign-in that worked
     → expected 429 to be 200
   × the limit of the sign-in > forgets the attempts that failed when the sign-in works
     → expected 429 to be 401
      Tests  2 failed | 2 passed (4)
```

Cele două eșecuri ale API-ului **reproduc exact** constatările `SESS-P1-05` / `ADM-P2-06`
măsurate de retest: a 11-a autentificare corectă era refuzată cu 429.

### 2.5 Testele noi

- `api/tests/phase14-address-key.test.ts` (4 cazuri) — cheia limitatorului: adresa clientului când
  proxyul e crezut; **nu** adresa proxyului când nu e; două conexiuni = două contoare; un client
  care vorbește singur își păstrează contorul.
- `api/tests/phase14-rate-limits.test.ts` (4 cazuri, **scris ca test de comportament**, ca să poată
  fi rulat și pe codul vechi) — limita unei pagini e per vizitator; o autentificare reușită nu
  numără; eșecurile se numără și următorul e refuzat; succesul șterge contorul contului.
- `web/tests/client-address.test.mjs` (13 cazuri) — convenția nouă + cazul falsificării.

---

## 3. Faza 15 — viața comenzii și conturile platformei

### 3.1 `RT-P1-01` — comanda anulată nu mai poate fi resuscitată

Cauza, așa cum a arătat-o retestul: garda din `markOrderPaid` este corectă, dar **ruta de checkout
rescrie starea înainte de ea**:

```
api/src/routes/orders.ts (vechi)   → verifică doar PAID/FULFILLED, apoi scrie AWAITING_PAYMENT
api/src/services/stripe.ts:308     → garda vede deja AWAITING_PAYMENT
```

Repararea: `POST /orders/:id/checkout` **refuză** o comandă `CANCELLED` sau `REFUNDED` cu 409,
înainte de orice altă operație.

**Comanda `FAILED` rămâne plătibilă**, pentru că nu e moartă: o plată eșuată poate fi reluată, și
astea e calea de recuperare a operatorului (corectare + replay). Refuzul ei ar închide
recuperarea, nu defectul.

### 3.2 Restul reparărilor

| ID | Schimbarea | Fișier |
|---|---|---|
| `RT-P3-02` | `POST /orders/:id/cancel` refuză o comandă `REFUNDED` (400) | `api/src/routes/orders.ts` |
| `RT-P2-03` | `markOrderPaid` verifică suma primită față de `order.total`; **fail-closed** (fără sumă → refuz) | `api/src/services/stripe.ts` |
| `RT-P1-02` | `assertMayActOnAccount` acoperă și rolul `STAFF` | `api/src/plugins/auth.ts` |
| `RT-P2-04` | Ruta de rambursare apelează `assertMayActOnAccount` pe rolul deținătorului comenzii | `api/src/routes/admin.ts` |
| `RT-P3-01` | `api/tests/zz-probe3.test.ts` șters din ramă | — |

### 3.3 Dovada că testele cad fără reparare

Pe codul **nereparat** (`888a274`):

```
× does not send a cancelled order to a checkout again      → expected 200 to be 409
× does not send a refunded order to a checkout again       → expected 200 to be 409
× keeps the trace of the refund when the order is cancelled→ expected 204 to be 400
× pays the order the sum it was quoted                     → promise resolved instead of rejecting
× does not let a member of the staff suspend another member → expected 200 to be 403
× does not let a member of the staff refund the order of an administrator → expected 409 to be 403
✓ lets an order that failed be paid again                  ← calea de recuperare rămâne deschisă
✓ lets an administrator suspend a member of the staff      ← nu am stricat ce era corect
      Tests  6 failed | 2 passed (8)
```

Cele șase eșecuri reproduc **exact** cele șase constatări ale retestului. Cele două teste care
trec sunt tot probe utile: primul gartează calea de recuperare a operatorului, al doilea gartează
că dreptul administratorului nu a fost stricat.

---

## 4. Starea suitei

Rulată pe codul reparat, pe baza proprie a acestor faze:

```
 Test Files  38 passed (38)
      Tests  380 passed (380)

==> Running the web tests
# tests 89
# pass 89
# fail 0
```

| Ramă | API | Web |
|---|---|---|
| `888a274` (vârful verificat de retest) | 366/366 în 36 fișiere | 87/87 |
| `4969f4a` (fazele 14+15) | **380/380 în 38 fișiere** | **89/89** |

Diferența: +14 teste API (4 + 4 + 8 noi, −2 din fișierul de gunoi șters) și +2 teste web.

---

## 5. Ce rămâne în afara codului

`TRUSTED_PROXIES` al API-ului trebuie setat de operator la `127.0.0.1,::1,172.18.0.0/16`
(rețeaua Docker `blipmade_default`), **nu** la adresa containerului web, care se schimbă la
fiecare recreare. Detalii, măsurători și criteriu de verificare: `audit/25-OPERATOR-DEPENDENCIES.md`
§11.

Fără această valoare, limitele per-adresă **nu mai sunt o limită de platformă** (repararea de cod
intră în regresie per-conexiune), dar **nu sunt nici per vizitator**: ele rămân per conexiune.

---

## 6. Deploy-ul în producție (autorizat de operator)

Ramura `remediation/phase-2-critical-fixes` @ `3ec6ab8` a fost aplicată în producție la
**2026-10-24, 02:55 UTC**, cu autorizația operatorului: copie de siguranță înainte de deploy
(`/var/backups/blipmade/pre-deploy-phase15/prod-predeploy-20261024-025438.sql`, 32 tabele),
`TRUSTED_PROXIES=127.0.0.1,::1,172.18.0.0/16` pus în `.env`, imagini reconstruite, 5 containere
healthy, codul live verificat (garda fazei 15, cheia limitatorului, contorul de eșecuri) și
**date neramificate**. Detalii: `_raw/PRODUCTION-STATE-2026-10-24.md` §5.

## 7. Fișierele dovezilor

| Fișier | Ce conține |
|---|---|
| `_raw/phase14-proof-unpatched.txt` | Ieșirile brute ale probelor rulate pe codul **nereparat**: web (3 eșecuri din 13) și API faza 14 (2 eșecuri din 4) și faza 15 (6 eșecuri din 8) |
| `PHASE-13-RETEST.md` | Retestul independent al fazei 13 (agent diferit) — sursa constatărilor `RT-*` |
| `PHASE-14-15-RETEST.md` | Retestul independent al fazelor 14 și 15 (în desfășurare, alt agent) |
