# Jurnal de schimbări și note de lansare — candidatul de lansare 1

**Data:** 2026-10-24
**Ramura:** `integration/release-candidate-1` → `main`
**Baza:** `origin/main` @ `e990776`

## 1. Jurnalul de schimbări

### Siguranța plății

- O comandă moartă nu mai poate deveni plătită, iar perioada prețului rămâne
  cu comanda (`501277b`).
- O plată corectată ajunge la comanda marcată eșuată (`a4fb004`).
- Un angajat nu mai acordă o permisiune pe care nu o are și nu mai acționează pe
  contul unui administrator (`8d138bb`, `1db05a9`, `b00ffa4`).
- Rambursarea unei plăți sosite pentru o comandă moartă returnează suma care a
  sosit, nu suma comenzii, iar diferenta se scrie în jurnal (`14f7a5f`).
- Catalogul și comanda aleg același rând de preț: un produs cu două prețuri
  active era afișat cu unul și taxat cu altul (`b056749`).
- Limita de campanie per cont e impusă sub lacat (`4969f4a`).

### Contul și sesiunea

- Adresa clientului e citită din dreapta lanțului `X-Forwarded-For`
  (`f8b2051`), iar limita de autentificare numără doar eșecurile (`3b7e98d`).
- Cookie-ul de sesiune e `Secure` în producție (`3b7e98d`).
- Setările interne nu mai sunt accesibile prin endpoint-urile de setări
  (`13bca99`).

### Fiabilitatea și performanța

- Compresie la construire și vendor React separat; o redimensionare a listei de
  la 4 928 la 22 desene (`ab9b259`).
- Timeout-uri pe API, oprire grațioasă la `SIGTERM` (73,6 s → 4,7 s),
  `/health/live` și `/health/ready`, metrici Prometheus pe un listener cu cheie
  (`1831855`, `fdb099d`).
- Joburile eșuate sunt păstrate șapte zile și pot fi reluate; paginare cu
  cursor și șase indexuri compuse; limite și rotație de loguri pe toate
  containerele (`517b2d5`).
- Identificator de cerere în tot traseul web (`4a7fc91`); logo cu dimensiunile
  lui (`113f181`); prima ecrană rezervată pe paginile publice, CLS 0
  (`050a478`).

### Securitatea resurselor

- Treisprezece colecții ale corpului cererii au limită: opt tablouri și cinci
  dicționare (`9734b9b`). Tablourile sunt limitate cu `.max()`, iar numărul
  cheilor unui dicționar e numărat înainte de citirea valorilor.

### CI-ul

- Fișierul workflow-ului era invalid de la adăugare (`runner.temp` într-un
  context care nu îl are), deci GitHub nu a creat niciun job la nicio împingere
  — 49 de rulări, toate eșuate. Reparat (`6272785`).
- Jobul de teste primește adresa panoului și tokenul intern (`264edf4`) și
  instalează dependențele web (`e53a3a9`).

### Documentația și registrul

- Registrul unic are 212 constatări; cele 14 deschise din runda a doua sunt în
  el, iar registrul runzei a doua a fost reconciliat cu candidatul
  (`1e01fba`, `6c7effc`, `7bb5c42`).

## 2. Migrările care se aplică

În ordine:

| Migrare | Ce face | Risc |
|---|---|---|
| `20261025120000_dead_letter_jobs` | creează tabela `DeadLetterJob` | aditivă |
| `20261025140000_list_page_indexes` | creează șase indexuri compuse noi, pe liste care erau parcurse cu o scanare | aditivă; nu șterge nimic |
| `20261025160000_payment_customer_index` | renunță la constrangerea unică pe `Payment.stripeCustomerId` | `DROP INDEX` pe o constrangere — **singurul `DROP` dintre cele trei**; eliberează clienții care plătesc de două ori |

**Condiție de blocare:** migrarea `20261025160000` trebuie aplicată **înainte**
de conectarea providerului de plăți. Fără ea, a doua plată a fiecărui client
eșuează, iar comanda rămâne `PAID` fără plată și fără serviciu.

Toate cele trei sunt verificate de jobul CI `schema-drift`
(`prisma migrate diff --exit-code` → `No difference detected`) și au fost
aplicate într-o bază de test de la zero și într-una populată: în cea populată
toate datele au rămas, cele șase indexuri noi au fost create, iar a doua plată
a aceluiași client a fost acceptată.

## 3. Ce trebuie schimbat în configurație

| Ce | Valoare | Cine |
|---|---|---|
| `DATABASE_URL` | neschimbat | — |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | cheile live | operator |
| `PAYMENTS_ENABLED` | `true` | operator, **după** migrare |
| `SMTP_URL` | releul real | operator |
| `OFFSITE_TARGET`, `OFFSITE_KEY`, `rclone` | backupul în afara mașinii | operator |
| `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` | adresa publică și administrarea Caddy | operator |
| `TRUSTED_PROXIES` | proxy-urile de încredere, după reconfigurarea edge-ului | operator |
| fișierul `.env` al API-ului | neschimbat | — |
| containerele | limitele și rotația logurilor sunt în `compose*.yml` | — |

**Nu trebuie introduse** în configurație: chei de panou reale, adresa
panoului de producție, sau orice secret nou. CI-ul folosește constante
de unică folosință și o adresă de loopback pe care nu ascultă nimeni.

## 4. Condiții de backup înainte de deploy

1. **Backup verificat al bazei de producție**, făcut înainte de
   `prisma migrate deploy`. Scriptul este `scripts/backup.sh`, iar forarea
   zilnică este `scripts/systemd/blipmade-backup.timer`.
2. **Un restore într-o bază de probă**, cu `scripts/restore-drill.sh`. Exercițiul
   nocturn face asta în fiecare noapte; ultima lui rulare a fost verde.
3. **Backup în afara mașinii**: `OFFSITE_TARGET` + `OFFSITE_KEY` + `rclone`.
   Până când sunt configurate, backup-ul rămâne pe aceeași mașină — și
   `DR-*` din registru rămân deschise.
4. **Copie a fișierului `.env`** înaintea oricărei modificări.

## 5. Procedura de rollback

1. **Oprește containerele** web, api și worker: `docker compose stop web api worker`.
2. **Rapoartă baza de date** la starea de dinaintea migrării:
   ```bash
   psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS \"DeadLetterJob\";"
   psql "$DATABASE_URL" -c "DROP INDEX IF EXISTS \"Payment_stripeCustomerId_idx\";"
   psql "$DATABASE_URL" -c "CREATE UNIQUE INDEX \"Payment_stripeCustomerId_key\" ON \"Payment\"(\"stripeCustomerId\");"
   ```
   Indexurile creați de `20261025140000` se refac cu `scripts/` sau cu
   `prisma migrate deploy` după ce codul vechi e înapoi.
3. **Rapoartă codul**: `git revert` al comiturilor de după ultima versiune
   bună, sau punerea la loc a imaginii vechi a containerelor.
4. **Pornește containerele** și verifică `/health/live`, `/health/ready` și
   pagina de început.
5. **Nu** șterge backup-ul: el e singura cale de întoarcere a datelor.

Rollback-ul codului este sigur în orice moment: niciuna dintre cele trei
migrări șterge date de client. Singura care schimbă o constrangere este
a treia, și inversul ei e un `CREATE UNIQUE INDEX`, care poate eșua dacă
între timp a apărut un al doilea client cu același id de provider — caz în
care se șterge mai întâi rândul duplicat.

## 6. Dependențe de operare

- **Cheile Stripe live** și `PAYMENTS_ENABLED=true`.
- **`SMTP_URL`** — canalul de suport este inert până când e setat (`OPS-03`).
- **Edge-ul `10.77.0.12`** — `deploy/edge/Caddyfile` e pregătit, dar
  reconfigurarea lui e manuală (`NET-05`, `SESS-01`, `SESS-02`).
- **RAID** — rădăcina e RAID 0 (`DR-04`).
- **Firewall pe Proxmox** înainte de rotirea parolei de `root` (`SEC-01`,
  `SEC-02`, `SEC-28`).
- **`C_node`**, regimul de TVA, confirmarea contului `steph@ripboyband.com`.

Lista completă e în `audit/25-OPERATOR-DEPENDENCIES.md`, iar verdictul de
lansare, în `audit/post-remediation/GO-NO-GO-VERDICT.md`.
