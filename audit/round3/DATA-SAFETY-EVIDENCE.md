# Siguranța datelor — dovezi și protecții

Data: 24 octombrie 2026
Ramură: `fix/audit-round3` (bază: `origin/main` = `106809c`)
Gazdă: `10.77.0.13` (Debian 13)

## 1. Ce se cerea

> Investighează complet `api/tests/debug.ts` și orice test, script sau proces care poate folosi
> accidental DATABASE_URL de producție. Implementează protecții fail-closed. Verifică prin dovezi
> dacă au existat pierderi de date. Nu presupune că absența erorilor demonstrează absența
> ștergerilor.

## 2. Inventarul drumurilor de către către baza de date

| Drum | Scrie? | Era păstrat înainte | Stare |
|---|---|---|---|
| `api/tests/setup.ts` (`resetDatabase`) | TRUNCATE a 29 de tabele | da — numele bazei trebuie să se termine în `_test` | **păstrat**, dar cu o copie proprie a regulii |
| `api/tests/debug.ts` | — | — | **absent din ramura curentă** (eliminat în faza precedentă) |
| `scripts/perf-data-query-count.ts` | TRUNCATE a 9 tabele | **nu** | **gaură — închisă acum** |
| `scripts/perf-data-dead-letters.ts` | pune joburi înapoi pe coadă | **nu** (doar o citire era permisă) | **gaură — închisă acum** |
| `scripts/perf-data-load.mjs` | trimite o explozie de cereri care creează comenzi | **nu** | **gaură — închisă acum** |
| `scripts/ops/seed-browser-account.mjs` | creează/șterge conturi | **nu** | **gaură — închisă acum** |
| `scripts/cleanup-data.sh` | DELETE pe conturi cu tipar de verificare | da — plan implicit, `--execute --confirm DELETE-<n>` | **păstrat** (corect: ținte să lovească producția, dar cere confirmarea numărului) |
| `scripts/perf-data-seed.sql` | TRUNCATE + INSERT | textul spune că refuză | verificat mai jos |
| `audit/_tools/seed-check-accounts.mjs` | `deleteMany` | da — `_test` | **păstrat** |

`scripts/perf-data-seed.sql` este executat de `scripts/perf-data-load.mjs` prin `psql`, deci
refuzul este **în codul care îl rulează**, nu în fișierul `.sql` — un fișier SQL nu poate
refuza nimic. Garda nouă este pusă înaintea lui.

## 3. Protecțiile fail-closed adăugate

### 3.1 Modulul canonic

`api/src/lib/test-target.ts` — o singură regulă, scrisă o singură dată:

```ts
assertDisposableDatabase({ label: 'empty the tables' });
```

- citește numele bazei din șirul de conexiune (ultima parte a căii, fără query);
- **refuză** orice nume care nu se termină în `_test`; numele `_test` singur este refuzat, pentru
  că nu e un nume de bază de date, e un nume lipsă;
- un șir de conexiune gol sau absent este refuzat (nu se poate "presupune" că e baza de test);
- excepția pentru producție există doar dacă operatorul o cere **cu voce tare**
  (`allowProduction`), iar excepția este **afișată în ieșire** — nu e un secret și nu e o
  presupunere.

### 3.2 Copia pentru scripturile care rulează cu node simplu

`scripts/lib/assert-disposable-db.mjs` — aceleași reguli, pentru `perf-data-load.mjs` și
`seed-browser-account.mjs`, care nu pot importa un modul TypeScript. **Testul
`api/tests/test-target-guard.test.ts` pune întrebările ambelor copii și cere aceleași răspunsuri**,
deci cele două nu pot diverge în tăcere.

### 3.3 Unde este aplicată

| Script | Cum este păstrat acum |
|---|---|
| `scripts/perf-data-query-count.ts` | refuză înainte de TRUNCATE (eticheta spune ce ar face) |
| `scripts/perf-data-dead-letters.ts` | citirea rămâne permisă (operatorul trebuie să vadă eșecurile producției); **scrierea** cere o bază de test sau `--allow-production` |
| `scripts/perf-data-load.mjs` | refuză, sau `--allow-production` |
| `scripts/ops/seed-browser-account.mjs` | refuză, sau `BM_ALLOW_PRODUCTION=1` (cu banner în ieșire) |
| `api/tests/setup.ts` | folosește modulul canonic (nu mai are o copie proprie a regulii) |

### 3.4 Testul de regresie

`api/tests/test-target-guard.test.ts` — **11 teste**:

- refuză baza de producție;
- refuză șirul de conexiune gol și șirul absent;
- refuză numele `_test` singur;
- acceptă o bază de test, cu și fără query;
- excepția operatorului este permisă **și anunțată**;
- numele bazei este citit corect în toate formele;
- copia `.mjs` se comportă identic cu modulul (fără derivă).

## 4. Au existat pierderi de date în producție?

**Nu.** Nu prin „nu am văzut nicio eroare" — ci prin patru probe independente.

### 4.1 Logul serverului Postgres

Setarea este `log_statement = none`, deci **o instrucțiune reușită nu apare în log**. Logul conține
doar instrucțiunile care au produs o eroare (21.861 de rânduri, 8.397 de erori). În el se găsesc
instrucțiuni distructive:

```
2026-10-24 02:13:14 UTC [99954] ERROR: deadlock detected
2026-10-24 02:13:14 UTC [99954] DETAIL: Process 99954 waits for AccessExclusiveLock on relation ...
2026-10-24 02:13:14 UTC [99954] STATEMENT: TRUNCATE TABLE "AuditLog", "WebhookEvent", ... "User", "Setting" CASCADE;
```

Lista de tabele este **exact** cea din `api/tests/setup.ts` (29 de tabele) — deci suita de teste a
rulat un TRUNCATE în cluster. Dar **pe ce bază?** Mesajul de deadlock spune:

```
... of database 2135583
```

OID-urile bazelor de azi:

| OID | Bază | Există? |
|---|---|---|
| **16384** | **`blipmade` (producția)** | **da** |
| 2376729 | `blipmade_phase14_test` | da |
| **2135583** | **baza temporară a unei runde de teste** | **nu mai există** |

Cele 36 de mențiuni ale OID-ului `2135583` provin dintr-o bază de test temporară, eliminată după
runde; cele 2 mențiuni ale lui `2376729` provin din `blipmade_phase14_test`. **OID-ul bazei de
producție (`16384`) nu apare nici o dată.**

### 4.2 Write-Ahead Log

WAL-ul conține **exact o singură înregistrare de ștergere** în segmentele păstrate:

```
rmgr: Storage  len (rec/tot): 46/46, tx: 334717, lsn: 0/FBCDD9D8, desc: TRUNCATE base/4714333/1259 to 89 blocks
```

`4714333` este OID-ul lui `blipmade_stripe_main_test` (baza de test a fazei Stripe). Numărul de
înregistrări care privesc baza de producție (`db: 16384`) în segmentele păstrate: **0**.

### 4.3 Istoricul migrărilor al producției

Tabela `_prisma_migrations` din producție are 14 rânduri, iar **cel mai vechi are
`started_at = 2026-10-22 19:25:56`** — înaintea primului rând din log. Logul conține patru
`DROP TABLE _prisma_migrations` (22:57 pe 22 octombrie, 06:19, 06:50 și 17:11 pe 24 octombrie).
Dacă unul dintre ele ar fi lovit producția, istoricul migrărilor ar începe **după** acel moment.
Nu se întâmplă: istoricul începe de la prima migrare, cu data de inițializare a containerului.

### 4.4 Continuitatea jurnalului de audit

Jurnalul de audit al producției are 600 de rânduri, de la **2026-10-22 19:55:11** (prima
activitate a platformei: `auth.login_failed`) până la **2026-10-24 20:35**. Pe hartă, activitatea
este continuă, cu goluri doar în orele de liniște:

```
2026-10-22 19:00 | 1     2026-10-23 08:00 | 61    2026-10-24 15:00 | 1
2026-10-22 20:00 | 88    2026-10-23 14:00 | 2     2026-10-24 16:00 | 3
2026-10-22 21:00 | 2     2026-10-23 16:00 | 3     2026-10-24 17:00 | 11
2026-10-22 22:00 | 11    2026-10-23 17:00 | 11    2026-10-24 19:00 | 2
2026-10-22 23:00 | 16    2026-10-23 18:00 | 7     2026-10-24 20:00 | 22
2026-10-23 00:00 | 24    2026-10-23 19:00 | 4
...                                    2026-10-23 20:00 | 6
```

Un TRUNCATE ar fi șters **tot** jurnalul de dinaintea lui, nu ar fi lăsat un gol de câteva ore: ar
fi mutat primul rând la momentul ștergerii. Primul rând este încă cel de la 19:55 pe 22 octombrie.
Ștergerile din log au fost în bazele de test; în producție nu s-a întâmplat niciuna.

### 4.5 Conținutul de azi al producției

```
User 4   Order 7   OrderItem 6   Payment 2   Invoice 2   Instance 2   Subscription 2
Ticket 1 AuditLog 600  Session 42  ProvisioningJob 28  InstanceEvent 68
Promotion 1  PromotionRedemption 3  WebhookEvent 0
```

Cele două instanțe reale, cele două abonamente, cele două facturi și cele 28 de joburi de
provisioning (toate `completed`) sunt acolo.

### 4.6 Ce NU este demonstrat, spus limpede

Segmentele de WAL din 22–23 octombrie au fost **reciclate** (`pg_wal` păstrează doar câteva
segmente), deci un TRUNCATE reușit din acea fereastră **nu poate fi exclus prin WAL**. Argumentul
pentru acea fereastră stă pe 4.3 și 4.4: istoricul migrărilor și jurnalul de audit sunt
neîntrerupte de la prima migrare și de la prima activitate a platformei.

## 5. Concluzie

- **Nu au existat pierderi de date în producție.** Contaminarea era reală — suita de teste a
  rulat TRUNCATE în același cluster Postgres — dar împotriva bazelor de test, niciodată împotriva
  bazei de producție, după cum arată patru probe independente.
- **Rămân însă găuri reale:** patru scripturi puteau ajunge la baza de producție. Acum toate sunt
  închise cu o reglement unică, testată, cu excepție doar la cerere explicită și afișată.
- `api/tests/debug.ts` nu mai există în ramură; a fost eliminat în faza precedentă.

## 6. Ce a rămas în afara puterii noastre

- **Segmentele de WAL reciclate** nu pot fi recuperate; perioada 22–23 octombrie nu are o
  urmă directă în WAL.
- **Logul Postgres nu conține instrucțiunile reușite.** Pentru o următoare cercetare de
  acest tip, `log_statement = 'all'` (sau `auto_explain`/pgaudit) ar da o urmă completă; este o
  setare a serverului și **nu a fost schimbată**, pentru că cere repornirea containerului în
  producție.
- **Firewalls, SSH și parola root** nu au fost atinse.
