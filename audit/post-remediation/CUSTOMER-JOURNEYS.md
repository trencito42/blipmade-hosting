# CUSTOMER-JOURNEYS — Testarea călătoriei clientului după remediere

**Fază:** 2 (Customer Journey Testing) din auditul post-remediere
**Data:** 2026-10-23
**Commit:** `a549381` („Add the infrastructure and recovery audit"), ramura `remediation/phase-2-critical-fixes` pe VM 103 (`/opt/blipmade`). Commitul precedent `e990776` este cel la care face referire brief-ul de fază.
**Autor:** agent de audit (faza 2) — rulare pe stiva izolată, fără efecte asupra producției.

---

## 1. Mediu, substituții și limite

### 1.1 Mediu de test

| Componentă | Adresă | Rol |
|---|---|---|
| Web (interfață) | `http://127.0.0.1:30006` (forward local `13006` → VM 103:30006) | interfața clientului, build Vite de producție servit de `web/server.mjs` |
| API | `http://127.0.0.1:3112` (forward local `13112` → VM 103:3112) | API-ul real, construit din același commit |
| Worker (BullMQ) | `127.0.0.1:3113` | coada de provisionare și email |
| Baza de date | `postgresql://…@localhost:5432/cj_test` | **bază proprie**, distinctă de `blipmade` (producție) și de `blipmade_test` (compartizată cu ceilalți auditori) |
| Redis | `redis://localhost:6379/3` | instanță Redis separată (DB 3) pentru a nu atinge coada platformei |
| Catalog | 5 produse seed-uite: `wordpress`, `code-server`, `discord-bot`, `uptime-kuma`, `postgresql` | un produs cu `deployable: false` (`uptime-kuma`) pentru testarea filtrului de fezabilitate |

Conturi seed-uite în stiva izolată: client `qa.check@example.test` / `CorrectHorseBattery9`, admin `admin.check@example.test` / `CorrectHorseBattery9`.
Promoție seed-uită: `CJTEST10` — 10% PERCENT, `maxRedemptions: 3`, `maxPerUser: 1`.

### 1.2 Cum este substituit sistemele externe

| Sistem extern | Substitute | Ce acoperă | Ce NU acoperă |
|---|---|---|---|
| Panoul Pterodactyl | **stub** `/tmp/cj-panel-stub.mjs` pe `127.0.0.1:3199` (endpoint-urile de aplicație) și `127.0.0.1:3198` (consolă websocket) | creare server, pornire/oprire/restart/kill, alocare de port, metrici, fișiere, keymint per client | comportamentul real al panelului, rețeaua reală, Wing, izolarea reală a containerelor, limitele reale de resurse ale nodului |
| Trimiterea e-mail | **sink SMTP** local pe `127.0.0.1:3525` (cititor HTTP pe `:3526`) | e-mailurile reale emise de platformă (verificare, resetare parolă, schimbare e-mail, bilete) și **tokenurile** din ele | deliverability reală, bounce, reputație domeniu, SPF/DKIM |
| Stripe | `PAYMENTS_ENABLED=false`, chei Stripe goale | ramurile de plată: coada comenzii, verificarea sumei, provisionarea condiționată de plată | procesul real Stripe, webhook-urile Stripe, 3DS, taxele Stripe |
| DNS / Caddy / noduri reale | neconfigurate (`DOMAIN_BASE=""`, `CADDY_ADMIN_URL=""`) | nu se poate exercita | domenii, certificate, rutare |

### 1.3 Ce NU am putut verifica

- Comportamentul în Firefox și WebKit: **binarele nu sunt instalate** pe această mașină (`/opt/blipmade/tools/browser` conține doar Chromium). Toate măsurătorile de browser sunt Chromium-only.
- Livrarea reală a e-mailurilor (sink-ul capturează mesajele, nu le livrează).
- Webhook-urile Stripe reale și taxele Stripe (nu există cheie).
- Provisionarea pe Pterodactyl real (noduri, alocare de porturi reale, costuri de infrastructură).
- Domenii personalizate, certificate TLS, DNS.
- Recurența reală a facturării (ciclul de 30 de zile nu poate fi așteptat; s-a verificat *logica* de recurență, nu trecerea timpului).
- Comportamentul pe hardware real (doar Chromium headless, viewport 1280×900 și 390×844).

---

## 2. Metodologie și standardul de evidență

1. **Interfața reală, în browser.** Fiecare pas de călătorie este executat în Chromium (Playwright, `/opt/blipmade/tools/browser/node_modules/playwright-core`, binar `/usr/bin/chromium`, rulat prin `xvfb-run -a`), pe interfața reală de la `:30006`, cu același cont folosit de un client. Capturile sunt păstrate în `/root/blipmade-work/audit/post-remediation/_raw/`.
2. **API-ul pentru adevărul de server.** Unele verificări (de exemplu „prețul cotat este egal cu suma facturată") nu pot fi stabilite din interfață; acestea sunt verificate prin apeluri directe la API, cu `cookie` de sesiune și header `X-CSRF-Token` (așa cum trimite helper-ul aplicației — vezi `web/src/lib.ts`).
3. **Regula CSRF.** Orice apel mutator are nevoie de tokenul `bm_csrf` emis de serverul web. Un `403 „Invalid or missing CSRF token."` este o protecție corectă, **nu** un defect; în acest raport este tratat doar ca defect dacă un flux legitim al interfeței eșuează din cauza lui.
4. **Standardul de evidență.** Un pas este `PASS` numai dacă a fost **observat** un rezultat concret (cod HTTP, rând în baza de date, e-mail capturat în sink, efect vizibil în interfață). Un pas este `FAIL` dacă comportamentul observat diferă de cel așteptat. Un pas este `BLOCKED` dacă nu poate fi executat în sandbox (limitările din 1.3) — și atunci se spune explicit ce anume lipsește. Nu există rezultate „presupuse".
5. **Fiecare defect primește o cauză în cod**, cu `fișier:linie`, verificată în arborele-sursă al API-ului și al interfeței.
6. **Nu se scrie în producție.** Toate scrierile au fost în `cj_test`. Portul 30002 (mort) și adresele publice (`https://blipmade.com`, `http://10.77.0.13:3000`) nu au fost folosite. Nu s-a executat niciun `pkill`/`killall`.

---

## 3. Sumar pe arii de călătorie

_(se completează după rulare)_

---

## 4. Călătoria clientului, pas cu pas

_(se completează după rulare)_
