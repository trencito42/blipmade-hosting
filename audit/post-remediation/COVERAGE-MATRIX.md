# Matricea de acoperire — ce lucru completat este în candidat

**Data:** 2026-10-24
**Ramura candidat:** `integration/release-candidate-1` @ `7bb5c42`
**Baza:** `origin/main` @ `e990776`
**Stare:** 50 de commituri înainte de `main`, 0 înapoi, 251 de fișiere schimbate.

Metoda: fiecare ramură și fiecare worktree au fost verificate cu
`git merge-base --is-ancestor` față de candidat, iar conținutul necomis din
worktree-uri a fost comparat byte cu byte cu ce e în ramură. Nicio ramură nu a
fost ștearsă și niciun commit nu a fost rescris.

## 1. Ramurile și ce conțin

| Ramură | SHA | Ce aduce | Unde e în candidat |
|---|---|---|---|
| `main` | `e990776` | Auditul read-only, registrele, rapoartele | strămoș direct |
| `remediation/phase-1-payment-safety` | `29a86cc` | Faza 1: siguranța plății (comandă moartă, perioada prețului, suma) | strămoș |
| `remediation/phase-2-critical-fixes` | `1592fa8` | Fazele 2–12, 13, 14–16 și lotul de performanță | strămoș |
| `fix/phase-14-rate-limits` | `4969f4a` | Faza 14–15: comanda moartă, garda de cont | strămoș |
| `fix/phase-16-retest-followup` | `0928c8a` | Faza 16: cele trei găuri ale retestului | strămoș |
| `audit/post-remediation` | `2e1e78a` | Uneltele de audit, izolarea bazei de producție | strămoș |
| `perf/api`, `perf/web`, `perf/data` | `4969f4a` | Lotul de performanță, împărțit pe trei firde | strămoș |
| `origin/dependabot/*` (8) | — | PR-uri automate de dependențe | **excluse cu un motiv**: nu sunt lucru auditat sau reparat |

Toate cele 9 ramuri de lucru sunt strămoși ai candidatului. Verificarea a fost
făcută cu `git merge-base --is-ancestor`, nu presupusă.

## 2. Worktree-urile

| Worktree | SHA | Stare necomisă | Rezultat |
|---|---|---|---|
| `/opt/blipmade` | `7bb5c42` | curat | ramura candidatului |
| `/home/debian/bm-base` | `888a274` | `web/tests/client-address.test.mjs` modificat, două fișiere de test necomise | **identice** cu ce e în ramură |
| `/home/debian/bm-phase14` | `050a478` | unelte necomise (`perf-db.sh`, `perf-db-url.py`, `perf-db-name.py`, `perf-stack.sh`) | identice, sau **versiuni mai noi** în `audit/_tools/` |
| `/home/debian/wt-api`, `wt-web`, `wt-data` | `4969f4a` | doar `node_modules` | nimic de recuperat |
| `/home/debian/wt-phase16` | `0928c8a` | unelte necomise, `phase16-patch.py` | identice cu `audit/_tools/` |

**Nicio lucrare nu s-a pierdut.** Conținutul necomis a fost fie identic cu cel
din ramură, fie o versiune mai veche a aceluiași fișier.

## 3. Commiturile candidatului, în ordine

| # | SHA | Ce face |
|---:|---|---|
| 1 | `a549381` | auditul de infrastructură și de recuperare |
| 2 | `501277b` | o comandă moartă nu devine plătită; perioada prețului rămâne cu comanda |
| 3 | `f160087` | rapoartele rundei și verdictul |
| 4–5 | `8d138bb`, `1db05a9` | un angajat nu acordă permisiuni pe care nu le are și nu acționează pe contul unui administrator |
| 6 | `13bca99` | setările interne rămân în afara endpoint-urilor de setări |
| 7 | `3b7e98d` | cookie de sesiune `Secure` în producție; limita de rată împărțită |
| 8–9 | `b44c0f5`, `a4fb004` | plățile se închid în interfață și se facturează; o plată corectată ajunge la comanda marcată eșuată |
| 10–11 | `5aad666`, `888a274` | raportul de parcurs al clientului și harta de funcții lipsă |
| 12 | `f8b2051` | adresa clientului e citită din dreapta lanțului |
| 13 | `4969f4a` | comanda moartă rămâne moartă, conturile platformei sunt păzate |
| 14–15 | `3ec6ab8`, `fdd19d8` | retestul primei runde, raportul runzei a doua, deploy-ul ramurii de reparare |
| 16–17 | `0928c8a`, `56b64ed` | cele trei găuri ale retestului; stiva de revizie reconstruită din ramă, cu dovadă |
| 18–25 | `ab9b259` … `1592fa8` | lotul de performanță: compresie, vendor React, timeout-uri, oprire grațioasă, `/health/live` și `/health/ready`, metrici, dead-letter, paginare cu cursor, limite și rotație de loguri, CLS 0 |
| 26 | `e35e575` | suita de teste primește baza 1 de Redis |
| 27 | `4ea98ee` | schema declară default-ul pe care migrarea îl creează |
| 28 | `0f05ace` | indicele de Redis al suitei e alegibil |
| 29 | `1e01fba` | al doilea nume al unei constatări apare în registru; randatorul se oprește la o intrare fără rând |
| 30 | `5bdc92b` | **P0**: un client poate plăti a doua oară |
| 31 | `b00ffa4` | **P1**: garda de cont pe confirmarea unei colectări |
| 32 | `14f7a5f` | trei defecte mici ale verificării independente |
| 33 | `6c7effc` | cele 11 constatări noi intră în registru |
| 34 | `667dbb2` | lista de excepții a scanării de secrete |
| 35–38 | `fea5363` … `2b273af` | descrierea pull request-ului, dovezile retestului de fluxuri, ce schimbă candidatul la deploy |
| 39–41 | `4fcf66f` … `a937a91` | advisory-ul de `zod` acceptat temporar, cu urmărire în registru |
| 42 | `6272785` | **CI**: workflow-ul, invalid de la început, reparat |
| 43 | `9734b9b` | limitele celor 13 colecții ale corpului cererii |
| 44 | `264edf4` | **CI**: cele două valori de care are nevoie jobul de teste |
| 45–48 | `f6d43a5` … `422abe7` | constatările reparării CI în registru; dependențele web în jobul de teste |
| 49 | `b056749` | catalogul și comanda aleg același rând de preț |
| 50 | `7bb5c42` | registrul runzei a doua, reconciliat cu candidatul |

## 4. Ce nu este în candidat, și de ce

| Ce | De ce nu e |
|---|---|
| cele 8 ramuri `origin/dependabot/*` | PR-uri automate de dependențe. Nu sunt lucru auditat sau reparat, și nu au fost revizuite. Depind de pachete care cer salturi de versiune (`prisma` 7, `fastify` multipart 11, `stripe` 23) |
| `audit/_tools/phase16-patch.py`, `perf-*.sh` din worktree-uri | identice cu ce e în `audit/_tools/` |
| modificările necomise din `bm-base` | identice cu ce e în ramură |

## 5. Dovezile verificării finale

| Ce | Unde |
|---|---|
| cele șase joburi ale CI-ului, verzi | https://github.com/trencito42/blipmade-hosting/actions/runs/40113378507 |
| suita completă, într-o copie a arborelui, cu mediul jobului de runner | API 465/465, web 109/109 |
| scanarea de secrete, cu versiunea exactă a acțiunii | `gitleaks` 8.24.3: 82 de commituri, 28 MB, 0 scurgeri |
| validarea workflow-urilor | `actionlint` 1.7.7: fără observații |
| drift de schemă | `prisma migrate diff --exit-code`: `No difference detected` |
| registrul unic | `audit/12-FULL-FINDINGS-REGISTER.md`: 212 constatări |
| registrul runzei a doua, reconciliat | `audit/23-ROUND2-FINDINGS-REGISTER.md`: 51 `Da`, 5 `Parțial`, 9 `Nu` |
