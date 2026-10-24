# Raport de lansare în producție — Blipmade

Data: 24 octombrie 2026
Țintă: `origin/main` = `7a0cce0c3b08854d3e650eade306c4b61aec7490` („State the merge of the handoff exactly")
Gazdă: `10.77.0.13` (Debian 13, RAID 0), panou Pterodactyl `10.77.0.10`, nod de joc `10.77.0.11`, edge `10.77.0.12`

---

## A. Deployment

### A.1 Ce a fost lansat

| Componentă | Stare înainte | Stare după |
|---|---|---|
| `blipmade-api-1` | imagine veche, 15 h | **recreat** din `7a0cce0` |
| `blipmade-worker-1` | imagine veche, 15 h | **recreat** din `7a0cce0` |
| `blipmade-web-1` | imagine veche, 15 h | **recreat** din `7a0cce0` |
| `blipmade-postgres-1` | 47 h uptime | **neatinse**, 47 h uptime |
| `blipmade-redis-1` | 47 h uptime | **neatinse**, 47 h uptime |

Volume-urile `blipmade_postgres_data`, `blipmade_redis_data`, `blipmade_upload_data` și `blipmade_backup_data` au fost păstrate. Comanda folosită a fost `docker compose up -d --no-deps api worker web`, deci baza de date și coada nu au fost recreate.

### A.2 Migrările

Aplicate explicit, în ordine, înainte de repornirea containerelor:

```
20261025120000_dead_letter_jobs
20261025140000_list_page_indexes
20261025160000_payment_customer_index
```

Total în baza vie: **14 migrări, 0 eșuate**. Datele au rămas intacte după aplicare (`User` 4, `Order` 5, `Payment` 1, `Invoice` 1, `Instance` 1, `AuditLog` 576, `Session` 43).

Migrările au fost **testate înainte** pe două trasee, cu `scripts/test-migrations.sh`:

1. **Instalare curată** — baza goală + toate cele 14 migrări → 33 tabele, `prisma migrate diff --exit-code` → *no difference detected*.
2. **Traseu de actualizare** — dumpul de producție restaurat într-o bază temporară + cele 3 migrări noi → aplicate fără eroare, fără drift, cu toate datele păstrate (`User` 4, `Order` 5, `Product` 5, `Payment` 1, `AuditLog` 576, `Instance` 1).

### A.3 Verificarea codului care rulează

Arborele de compilare (`api/`, `web/`) era curat față de `7a0cce0` (`git status --porcelain -- api web` → 0 rânduri). Marcajele distinctive ale release-ului au fost găsite în imaginea care rulează:

| Marcaj | Fișier în imaginea vie |
|---|---|
| `assertBoundedFields` | `/app/dist/lib/bounded.js` |
| `priceRowFor` | `/app/dist/services/pricing.js` |
| `assertMayActOnAccount` | `/app/dist/routes/admin.js` |
| `DeadLetterJob` | `/app/dist/services/dead-letter.js` |

### A.4 Starea după lansare

```
blipmade-api-1      | Up (healthy)
blipmade-worker-1   | Up (healthy)
blipmade-web-1      | Up (healthy)
blipmade-postgres-1 | Up 2 days (healthy)
blipmade-redis-1    | Up 2 days (healthy)
```

Toate punctele de verificare: `127.0.0.1:3100/health` → 200, `/health/live` → 200, `/health/ready` → 200, `10.77.0.13:3000/healthz` → 200, `https://blipmade.com/` → 200, `https://blipmade.com/api/health` → 200.

### A.5 Coada

`blipmade.provision` și `blipmade.email`: 0 în așteptare, 0 active, 0 eșuate. Redis db0: 11 chei. Nu a existat regresie a cozii după lansare.

---

## B. Curățarea datelor de test din producție

### B.1 Ce a fost eliminat

| Unde | Ce | Dovadă | Număr |
|---|---|---|---|
| Baza de date `blipmade` | Rânduri `WebhookEvent` cu identificator `evt_verify_<unix>` | Identificator de tipar fix; platforma nu a avut niciodată cheie de furnizor, iar plățile nu au putut fi reale | 8 |
| Baza de date `blipmade` | Rând `MailDelivery` cu un singur destinatar `browser-customer@blipmade.test` | Destinatar exclusiv de test | 1 |
| Baza de date `blipmade` | Tokenuri `VerificationToken` expirate și nefolosite ale conturilor de administrator | Expirate și brute; tokenurile brute erau recuperabile din fișierele de e-mail rămase pe gazdă | 3 |
| Panou Pterodactyl | Utilizatori `qa-headless-one-*`, `qa-headless-two-*`, `browser-customer-*` @ `panel.blipmade.invalid` | Domeniu `.invalid` rezervat (RFC 2606), niciun server asociat | 4 |
| Gazdă, `/var/backups/blipmade/mail` | Payload-uri de e-mail produse de rulările de test | 14 674 din 14 689 erau adresate unor domenii de test; **0** erau adresate unui cont real | 14 689 (105 MB) |
| Redis, indicii 1–9 | Chei `bull:*` ale stivelor de măsurătoare și de test | Indici separați de coada de producție (db0) | 77 chei |

Curățarea a folosit `scripts/cleanup-release-artifacts.sh` (regim implicit de simulare, criteriu explicit pe fiecare țintă, o singură tranzacție, urmă de audit în `/var/backups/blipmade/cleanup-release-artifacts-*.log`) și `scripts/cleanup-panel.py` (listă de permisiuni cu identificator, e-mail și nume exacte; utilizatorii 1–4 protejați).

### B.2 Ce a fost păstrat, și de ce

| Element | De ce a rămas |
|---|---|
| Cei 4 utilizatori (`admin@blipmade.com`, `stefan@xodo.ro`, `steph@ripboyband.com`, `nissqbv@gmail.com`) | Toți reali. `nissqbv@gmail.com` apare în payload-ul de e-mail ca „Catalin Marian Nitu", cu un cont Pterodactyl propriu — este un vizitator real, nu un artefact |
| Cele 5 comenzi, inclusiv `BM-00007` | `BM-00007` are plată, factură și abonament reale |
| Instanța, cele 10 joburi de provisionare, cele 30 de evenimente | Aparțin comenzii plătite `BM-00007` |
| Toate cele 576 rânduri din `AuditLog` | Istoric de securitate — protejat prin regulă |
| Cele 43 de sesiuni | Toate aparțin unor conturi reale; niciuna expirată |
| Ticketul „test12321321" | Aparține administratorului `stefan@xodo.ro` |
| Cele 5 produse, prețurile, nodul, cele 16 egg-uri, personalul, setările, promoția | Date de configurare a platformei |
| 17 rânduri `MailDelivery` cu destinatar real | Livrări reale; rândurile mixte păstrează și destinatarul de test, pentru că livrarea către adresa reală este un eveniment real |
| Conturile Pterodactyl 1–4 și 25 | Administrați și contul platformei legat de `stefan@xodo.ro` |

### B.3 Surse de contaminare oprite

| Proces | Ce era | Efect |
|---|---|---|
| `api/tests/debug.ts` (pid 46943, pornit la 22 oct 19:31) | `NODE_ENV=test` cu `DATABASE_URL` către **baza de producție**; primul act al scriptului este `TRUNCATE` pe 22 de tabele | Oprit. Nu a executat nicio scriere: nu există `debug@example.com`, nu există eveniment `evt_debug_1`, iar cel mai vechi rând din `AuditLog` (22 oct 19:55:11) este **după** pornirea procesului |
| Stive de audit rămase (`/tmp/cj*`, `/tmp/cjw*`, `/tmp/blipmade-*`) | Stub-uri de panel/wings pe porturile 25568–25587, 3113, 3123, 43661 | Oprite; porturile eliberate |
| Alias fals `10.77.0.11/32` pe `lo` | Adăugat de audit pentru a imita nodul | Eliminat |
| Stiva `bm-phase14` | API pornit pe gazdă, baza `blipmade_perf_test` | Oprită |

**Producția nu a fost atinsă de niciun test scris de mine:** înainte și după rularea end-to-end, `User` 4, `Order` 5, `Session` 43, `Ticket` 1, `MailDelivery` 17 — neschimbate. Cele două rânduri `auth.login_failed` care au apărut în jurnalul de audit provin din `162.158.19.136`, o adresă de edge Cloudflare: trafic extern prin gateway, nu din test.

---

## C. Verificările făcute

### C.1 Pe producție, fără scriere — 31 de verificări, toate verzi (`scripts/smoke-production.sh`)

Pagini publice (acasă, catalog, prețuri, login, register), `api/health`, `api/catalog/products`, `api/catalog/products/discord-bot`, TLS cu verificare validă, resursă statică, zona protejată pentru vizitator fără sesiune (`/api/admin/customers|orders|products|pricing|promotions|audit|dead-letters`, `/api/orders|instances|tickets|settings|domains`, `/api/billing/summary` → toate 401), sănătatea pe gazdă.

### C.2 Pe o copie izolată, cu scriere — 37 de verificări, toate verzi (`audit/_tools/e2e-flows.mjs`)

Stiva de test a avut baza `blipmade_e2e_test`, indicele Redis 5, porturile 3103/3003/2525 și un releu SMTP local care a capturat mesajele reale.

| Parcurs | Verificări |
|---|---|
| Public | sănătate, catalog (5 produse, 1 comandabil), ofertă |
| Client | înregistrare, **e-mail de verificare livrat prin SMTP**, verificare (204), autentificare, sesiune, setări, profil, comenzi, instanțe, facturare, sesiuni, **comandă**, **ticket**, reset de parolă cu răspuns neutru și identic pentru adrese inexistente |
| Administrator | autentificare, `admin/customers`, `admin/orders`, `admin/products`, `admin/promotions`, `admin/pricing`, `admin/audit`, `admin/dead-letters` |
| Izolare între chiriași | administratorul nu vede comenzile clientului în zona client; clientul este refuzat (401) pe toate rutele de administrator |

Copia a fost demolată după test: baza temporară ștearsă, indicele Redis golit, procesele oprite.

### C.3 Ce a fost reparat pe parcurs

| Defect | Cum | Stare |
|---|---|---|
| `wordpress` era `deployable=true` fără egg, deci putea fi vândut fără a putea fi provisionat | Aliniat la seed: `deployable=false` pentru produsele fără egg | reparat |
| Egg-ul 15 nu avea environment template pe nod, deci **niciun produs nu putea fi provisionat** | Creat serverul-template pe egg 15 prin API-ul panelului (id 16, „Blipmade runtime template"), exact cum prescrie mesajul panelului; `eggEnvironmentTemplate(15)` rezolvă acum 11 variabile, fără variabile per-server scurse | reparat |
| `prisma db seed` nu e legat în `package.json` (doar `npm run seed` funcționează) | Constatare | de reparat în cod |
| Fișierul de e-mail al gazdei creștea fără limită | Curățat; retenția rămâne de implementat în cod (lucrător în curs) | în curs |

---

## D. Ce trebuie să facă personalul operatorului

Acestea nu pot fi rezolvate fără chei sau decizii ale operatorului. Fiecare este **verificată**, nu presupusă:

1. **Cheia Stripe live + `PAYMENTS_ENABLED=true`** — `STRIPE_SECRET_KEY` și `STRIPE_PUBLISHABLE_KEY` sunt goale, `PAYMENTS_ENABLED=false`, `STRIPE_TEST_MODE=false`. Fără ele nicio plată nu poate porni. Nu a fost activată nimic.
2. **`SMTP_URL`** — gol. Platforma scrie e-mailurile pe disc în loc să le livreze. Calea SMTP a fost dovedită funcțională în test (livrare reală capturată), deci lipsa releului este singura cauză.
3. **`DOMAIN_BASE` și `CADDY_ADMIN_URL` / `CADDY_ADMIN_TOKEN`** — goale. Provisionarea de domenii și API-ul de administrare Caddy nu pot funcționa.
4. **Destinație de backup în afara gazdei** — nu există `rclone`, `restic`, `borg` și nicio configurație. Gazda este RAID 0, deci copia locală **nu** este o copie de dezastru. `scripts/backup-offsite.sh` a fost reparat să eșueze vizibil în această situație în loc să declare succes (în curs de integrare).
5. **Cheia de backup offsite** — `OFFSITE_TARGET` și cheia de criptare (`OFFSITE_AGE_RECIPIENT`, `OFFSITE_AGE_IDENTITY`, `OFFSITE_ENCRYPTION_KEY`).
6. **Firewall Proxmox** — `*:8006` și `rpcbind` pe `0.0.0.0:111` rămân deschise. Rotirea parolei `root` se face **după** firewall.
7. **Identitatea comercială** — denumire, număr de înregistrare, CUI/TVA, adresă, e-mail de suport, regim de TVA, `C_node`. Cele 35 de marcaje `TODO(operator)` din paginile legale marchează exact aceste poziții.
8. **Stiva de backup extern** — hard de pe gazdă (RAID 0) și o copie în afara gazdei.
9. **Edge-ul `10.77.0.12`** — neconfigurat; `NET-05`, `SESS-01`, `SESS-02`.
10. **Contul `steph@ripboyband.com`** — administrator, e-mail neverificat.
11. **Limitarea campaniei `LAUNCH`** — 100% reducere, `maxPerUser` null.
12. **Curățarea parolei moarte din istoric** (`SEC-30`) — cere force-push, deci nu a fost făcută.

---

## E. Verdictul comercial

**NO-GO pentru lansare comercială**, în ciuda faptului că platforma este acum lansată tehnic, curățată și verificată.

Cele șase porți de cod sunt închise și dovedite. Cele șase porți de operare nu pot fi închise fără cheile de mai sus. Cât timp Stripe nu este conectat, o comandă nu poate fi plătită; cât timp releul SMTP lipsește, un client nu primește niciun e-mail; cât timp backupul nu părăsește gazda, o defectare a hardului pierde totul.

Verdictul separat pe cod (tot verde) și pe platformă (NO-GO) este în `audit/post-remediation/GO-NO-GO-VERDICT.md`.

---

## F. Backlog

### P0 — niciunul deschis

### P1 — niciunul deschis

### P2 — în lucru sau de făcut

| Identificator | Ce | Stare |
|---|---|---|
| BE-20 | E-mailurile livrate cu eșec nu pot fi puse înapoi pe coadă | în curs (lucrător API) |
| BE-04 | Provisionarea face zece mutații pe panou | implementat, neverificat |
| ADM-12 / PERF-P2-03 | Listele plafonate la 200/300 fără pager | neînceput |
| SEC-31 | Advisory `zod` `GHSA-mrhx-c7xc-m3w5` | acceptat și urmărit; upgrade la `zod` 4.6.7 cerut ca PR separat |
| SEC-30 | Cele 5 excepții de scanare de secrete și parola moartă din istoric | acceptate, cere force-push |
| SEC-06 | 29 de rute de scriere fără limită per rută | neînceput |
| — | Retenție pentru fișierul de e-mail, limite per utilizator, paginare, limite pentru indicatorii de copii, supravegherea cozii moarte | în curs |
