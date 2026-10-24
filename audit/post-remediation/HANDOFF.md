# Predare — candidatul de lansare 1, fuzionat în `main`

**Data:** 2026-10-24
**Fuziune:** `main` @ `e990776` → `65887da` (fast-forward, fără commit de fuziune, fără rescriere)
**Ramura de origine:** `integration/release-candidate-1` @ `65887da`

## A. Starea finală a depozitului

| Ce | Valoare |
|---|---|
| `main` înainte | `e990776024d641324e24d3fac29fec9dad99d4cd` |
| `main` după | `65887da80623406aa1e6cb39f5094849de3ea106` |
| Ramura de origine | `integration/release-candidate-1` @ `65887da` (identică cu `main`) |
| Commit de fuziune | **nu există** — fuziune rapidă, istoricul rămâne liniar |
| Push folosit | `git push origin integration/release-candidate-1:main` — normal, **non-force** |
| Pull request | https://github.com/trencito42/blipmade-hosting/pull/new/integration/release-candidate-1 |

**PR-ul nu a putut fi deschis programatic**: în acest mediu nu există `gh`,
niciun token GitHub, niciun connector GitHub (doar `email_workbench` și
`matrix` sunt conectate), iar remote-ul e doar SSH. Pașul manual este un singur
click la adresa de mai sus; GitHub va arăta că `main` conține deja comiturile.

**Ramurile rămase, neatinse:** `main`, `integration/release-candidate-1`,
`remediation/phase-1-payment-safety`, `remediation/phase-2-critical-fixes`,
`fix/phase-14-rate-limits`, `fix/phase-16-retest-followup`, `audit/post-remediation`,
`perf/api`, `perf/web`, `perf/data`, plus cele 8 ramuri `origin/dependabot/*`.
**Nicio ramură n-a fost ștearsă.** Toate cele 9 ramuri de lucru sunt strămoși ai
candidatului — verificat cu `git merge-base --is-ancestor`, nu presupus.

## B. Verificarea

### Cele șase joburi ale CI-ului

Pe ramura candidat, comitul `65887da` — rularea
**https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363**

| Job | Rezultat | |
|---|---|---|
| API typecheck | ✅ | [120940764570](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764570) |
| Web typecheck and build | ✅ | [120940764787](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764787) |
| Unit and integration tests | ✅ | [120940764746](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764746) |
| Secret scan | ✅ | [120940764790](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764790) |
| Dependency audit | ✅ | [120940764824](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764824) |
| Schema drift | ✅ | [120940764777](https://github.com/trencito42/blipmade-hosting/actions/runs/40117183363/job/120940764777) |

Pe `main`, după fuziune, același comit — rularea
**https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090** — tot
șase joburi verzi:
[Dependency audit](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270626) ·
[Web typecheck and build](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270629) ·
[Unit and integration tests](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270633) ·
[API typecheck](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270634) ·
[Secret scan](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270686) ·
[Schema drift](https://github.com/trencito42/blipmade-hosting/actions/runs/40117671090/job/120942270698)

### Numărul de teste

| | API | Web |
|---|---|---|
| Fișiere de test | 52 | 12 |
| Teste | **467 verzi** | **109 verzi** |

Suita a fost rulată și într-o copie a arborelui, cu mediul jobului de runner și
nimic altceva: același rezultat.

### Verdictul verificării independente

Un agent care nu a scris codul a verificat candidatul (22 de fluxuri
comerciale și de securitate, baza de securitate, CI-ul și documentele).

**Verdict: PASS.** Niciun P0 și niciun P1 deschis. Cele trei reparări
declarate (P0 `5bdc92b`, P1 `b00ffa4`, limitele `9734b9b`) și prețul
`b056749` au fost demonstrate prin teste care pică pe codul de dinaintea
reparației.

Cinci constatări P2, toate de documentare sau teoretice, au fost reparate:
descrierea migrărilor (a doua creează șase indexuri noi și nu șterge nimic; a
treia e singura cu `DROP`), contoarele registrului runzei a doua, numărul de
utilizatori din baza vie, numărul de teste, și departajarea a două rânduri de
preț cu aceeași dată — închisă în cod, cu test.

### Riscuri acceptate, înregistrate

| Risic | Unde | De ce e acceptat |
|---|---|---|
| Advisory-ul `zod` (`GHSA-mrhx-c7xc-m3w5`, high) | `SEC-31`, lista acceptată din `ci.yml` | corecția e `zod` 4.6.7, o actualizare semver-major; expunerea a fost redusă oricum prin limitarea celor 13 colecții (`SEC-32`) |
| Cinci valori exceptate de scanarea de secrete | `SEC-30`, `.gitleaks.toml` | patru sunt false positive (chei de test, exemplu de documentație); a cincea e o parolă moartă dintr-un script eliminat, verificată contra celor 4 conturi din baza vie: 0 potriviri |
| Livrările de e-mail nu pot fi puse înapoi pe coadă | `BE-20` | prin construcție; interfața trebuie să spună asta |
| Listele administrative plafonate la 200 și 300 de rânduri, fără pager | `ADM-12`, `PERF-P2-03` | decizie de produs |
| Provisionarea face zece mutații pe panou, fără tranzacție | `BE-04` | e marcat „IMPLEMENTED, NOT VERIFIED" |

## C. Pregătirea deploy-ului

**Migrațiile**, în ordine: `20261025120000_dead_letter_jobs` (creează tabela
`DeadLetterJob`) · `20261025140000_list_page_indexes` (creează șase indexuri
compuse noi) · `20261025160000_payment_customer_index` (renunță la constrangerea
unică pe `Payment.stripeCustomerId` — **singura care șterge ceva**).

**Condiția de blocare:** `20261025160000` înainte de conectarea providerului de
plăți. Fără ea, a doua plată a fiecărui client eșuează, iar comanda rămâne
`PAID` fără plată și fără serviciu.

**Configurația de schimbat:** cheile Stripe live și `PAYMENTS_ENABLED=true`;
`SMTP_URL`; `OFFSITE_TARGET` + `OFFSITE_KEY` + `rclone`; `DOMAIN_BASE` +
`CADDY_ADMIN_URL` + `CADDY_ADMIN_TOKEN`; `TRUSTED_PROXIES` după edge.

**Backup înainte:** backupul bazei de producție, un restore într-o bază de
probă (`scripts/restore-drill.sh`), o copie a `.env`, și backupul în afara
mașinii (care lipsește).

**Rollback:** `docker compose stop web api worker` → `DROP TABLE IF EXISTS
"DeadLetterJob"`, recrearea indexului unic pe `Payment` → `git revert` sau
imaginea veche a containerelor → pornire și verificare. Nu se șterge backupul.
Niciuna dintre cele trei migrări șterge date de client.

## D. Pregătirea produsului

| Produs | Stare |
|---|---|
| `discord-bot` | **funcțional** — imagine și egg |
| `code-server`, `postgresql`, `uptime-kuma` | **incomplet** — fără imagine, fără egg, `deployable=false` |
| `wordpress` | **marcat `deployable` fără egg** — codul îl refuză acum la comandă (`PLP-01`), dar valoarea din baza vie rămâne până la deploy |

**Campania live `LAUNCH`**: 100%, activă, `maxPerUser` **null**,
`maxRedemptions` 25. Codul impune plafonul per cont când campania are unul, dar
campania nu are, deci o comandă poate iese cu `total 0` și cu o plată de zero
(`PLP-07`, nevoie de operator).

**Parcurgeri care așteaptă verificarea pe producție:** tot ce ține de Stripe
(checkout, rambursare, reînnoire), tot ce ține de SMTP (verificarea contului,
resetarea parolei, notificarea de bilet), și adresa reală a vizitatorului, care
depinde de reconfigurarea edge-ului.

## E. Pregătirea infrastructurii

| Ce | Stare | Constatare |
|---|---|---|
| Firewall pe gazda Proxmox | **dezactivat** | `SEC-01`, `SEC-02`, `SEC-28` — `*:8006` și `rpcbind` pe `0.0.0.0:111` |
| Parola de `root` și accesul de administrare | **parolă, fără cheie** | `SEC-01` — rotirea după firewall |
| Redundanța stocării | **RAID 0** | `DR-04` — pierderea gazdei e pierderea totală |
| Backupul în afara gazdei | **lipseste** | `INF-02` — RPO infinit la pierderea gazdei |
| Gateway și proxy-urile de încredere | **edge-ul neconfigurat** | `NET-05`, `SESS-01`, `SESS-02` |
| Monitorizarea | **măsurări, fără alarmă** | `METRICS_*` și `/health/ready` sunt în cod; nu există alertare |
| Exercițiul de restaurare | **verde** | rulat în fiecare noapte, `DR-02` |

## F. Planul de lucru, în ordine

**P0 — blocaje de lansare**
1. Firewall pe Proxmox, apoi rotirea parolei de `root`.
2. Cheile Stripe live și `PAYMENTS_ENABLED`, **după** migrarea `20261025160000`.
3. `SMTP_URL` și releul de e-mail.
4. Backupul în afara gazdei: `OFFSITE_TARGET`, `OFFSITE_KEY`, `rclone`.
5. Produsul de joc, cu imagine și egg, și `DOMAIN_BASE` cu adresa publică.
6. Reconfigurarea edge-ului, pentru ca limita de rată să ajungă la adresa reală.
7. Plafonul per cont al campaniei `LAUNCH`, sau campania inactive.
8. Curățarea parolei moarte din istoric (`SEC-30`) — cere force-push.

**P1 — importante**
9. Produsele `code-server`, `postgresql`, `uptime-kuma`: imagine, egg, preț.
10. Pager sau plafon mai mare la listele administrative (`ADM-12`).
11. `zod` 4.6.7, apoi linia din lista acceptată (`SEC-31`).
12. RAID, sau o copie a datelor în afara mașinii.
13. Deciziile de conformitate: regimul de TVA, `C_node`, contul
    `steph@ripboyband.com`.

**P2 — după lansare**
14. Tab-urile paginii de instanță în adresa (`DASH-06`), al doilea panou
    „Settings" (`DASH-07`), `window.prompt` pentru parola de bază de date
    (`DASH-08`), formularul de rețea (`DASH-09`), acțiunea „Power"
    (`DASH-10`).
15. Interfețele lipsă pentru cele patru operații ale API-ului (`ADM-13`), și
    catalogul public care expune `deployable` și `eggId` (`ADM-14`).
16. Butonul „Show e-mails" fără urmă în jurnal (`ADM-16`).
17. Al doilea factor (`SESS-07`).
18. Scrierile dead-letter care nu sunt așteptate (`BE-19`), legătura plății la
    actualizare (`BE-22`).
19. Un pas de lint al workflow-urilor în CI, cu `actionlint`.
