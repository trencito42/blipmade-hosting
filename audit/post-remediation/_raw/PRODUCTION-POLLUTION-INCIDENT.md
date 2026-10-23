# Incident: date de test ajunse în baza de date de producție

**Data:** 2026-10-23
**Descoperit de:** agentul de audit al sesiunilor (`SESSIONS-INVESTIGATION.md`, constatarea `SESS-P1-13`)
**Neutratizat de:** lead (auditul post-remediere)
**Clasă:** eroare proprie a echipamentului de audit — **nu** un defect al platformei

---

## 1. Ce s-a întâmplat

Instanța locală de interfață pornită de `/root/sync-check.sh` pe portul **30002** avea
`API_URL=http://127.0.0.1:3100`. Portul **3100** este **API-ul de producție**.

În plus, o parte dintre uneltele de audit au deschis interfața prin adresa publică
`https://blipmade.com` (prin muchia Cloudflare).

Rezultatul: autentificări, bilete, comenzi și instanțe create de unelte au ajuns în
baza de date de producție `blipmade` și, prin provisionare, pe panoul Pterodactyl.

**Niciun client real nu a fost afectat.** Conturile reale, comenzile reale, biletul real
și cele 5 servere de pe panou au fost identificate și păstrate.

---

## 2. Inventarul exact al impactului

### 2.1 Conturi create de unelte (4)

| Cont | Rol | Creat | Impact |
|---|---|---|---|
| `browser-admin@blipmade.test` | ADMIN | 2026-10-23 07:21 | **28 de sesiuni active cu o parolă cunoscută de unelte** |
| `browser-customer@blipmade.test` | CUSTOMER | 2026-10-23 07:21 | 1 instanță |
| `qa.headless.one@example.test` | CUSTOMER | 2026-10-23 01:53 | 182 de sesiuni, 1 comandă, 13 bilete, 1 instanță |
| `qa.headless.two@example.test` | CUSTOMER | 2026-10-23 01:55 | 15 de sesiuni, 1 comandă, 1 instanță |

### 2.2 Rânduri produse în baza de producție

| Tabel | Rânduri ale uneltelor | Rânduri ale oamenilor (de păstrat) |
|---|---|---|
| `User` | 4 (suspendate) | 3 (`admin@blipmade.com`, `stefan@xodo.ro`, `steph@ripboyband.com`) |
| `Session` | 226 (șterse) | 42 (păstrate) |
| `Ticket` | 13 | 1 (`#46`, autor `stefan@xodo.ro`) |
| `TicketMessage` | 13 | 0 |
| `Order` | 2 (`BM-00002`, `BM-00003`) | 4 (`BM-00001`, `BM-00004`, `BM-00005`, `BM-00006`) |
| `Instance` | 3 | 0 |
| `Invoice` | 0 | 0 |
| `Payment` | 0 | 0 |
| `Subscription` | 0 | 0 |

**Nicio sumă a fost încasată.** Zero facturi, zero plăți, zero abonamente. Comențile
uneltelor au rămas în `AWAITING_PAYMENT` / `PENDING` și nu au fost plătite.

### 2.3 Panoul Pterodactyl (producție)

Toate cele **5 servere** de pe panou sunt artefacte de audit:

| Nume | Owner | Server DB | Stare |
|---|---|---|---|
| `Blipmade Port Test` | 2 | — (orfan) | nesuspendat |
| `Discord Bot` | 19 | — (orfan) | nesuspendat |
| `Discord Bot` | 20 | — (orfan) | nesuspendat |
| `Browser instance` | 23 | `15` | ONLINE |
| `Browser instance` | 24 | `11`, `10` | STOPPED / ONLINE |

**Nu există niciun server de client real pe panou.** Doi servere sunt orfane (nu mai
au rând în `Instance`).

### 2.4 Ce NU a fost atins

- Containerele de producție: 5, toate `healthy`, niciodată restartate de unelte.
- Codul de producție: nicio modificare.
- Stripe: zero plăți, zero sesiuni de checkout capturate.
- E-mail: livrările către adrese de test au fost consumate de transportul local.
- Jurnalul de audit (`AuditLog`): **păstrat** — este dovada incidentului.

---

## 3. Acțiuni deja executate (reversibile)

1. **Instanța 30002 oprită.** Nu mai există nicio interfață locală care să ajungă la
   API-ul de producție.
2. **226 de sesiuni ale conturilor de test șterse.** Backdoor-ul de autentificare cu
   rol ADMIN este închis: tokenurile nu mai sunt valide.
3. **Cele 4 conturi de test suspendate** (`suspendedAt` setat). Autentificarea este
   refuzată de `api/src/routes/auth.ts` (`if (user.suspendedAt) throw unauthorized(...)`).
   Suspendarea este **reversibilă** printr-o singură comandă.
4. **Corectarea cauzei:** `/root/sync-check.sh` nu mai pornește nicio instanță web
   către `3100`, iar o gardă explicită oprește pornirea dacă portul de producție
   apare în `API_URL`.

Starea verificată după neutralizare: `0` sesiuni rămase ale conturilor de test.

---

## 4. Acțiuni care Așteaptă autorizarea operatorului

Următoarele sunt operațiuni destructive pe producție sau pe infrastructură externă.
**Nu au fost executate.** Conform brief-ului, cer autorizare explicită.

| # | Acțiune | Scope | De ce nu a fost făcută automat |
|---|---|---|---|
| A1 | ștergerea celor 4 conturi de test | baza `blipmade` | ștergere pe producție |
| A2 | ștergerea celor 13 bilete + 13 mesaje ale uneltelor | baza `blipmade` | ștergere pe producție |
| A3 | ștergerea comenzilor `BM-00002`, `BM-00003` | baza `blipmade` | ștergere pe producție |
| A4 | ștergerea celor 3 rânduri `Instance` ale uneltelor | baza `blipmade` | ștergere pe producție |
| A5 | ștergerea celor 5 servere de pe panoul Pterodactyl | infrastructură externă | ștergere pe panoul de producție |
| A6 | rotirea parolei și a cheilor folosite de unelte | credentiale externe | operațiune pe credentiale |

**Ordinea recomandată:** A1→A4 într-o singură tranzacție (rândurile legate dispar în
cascadă), apoi A5 pe panou, apoi A6.

**Notă despre A1–A4:** ștergerea unui cont în cascadă șterge și sesiunile, comenzile,
biletele și instanțele lui. Comanda trebuie să vizeze **doar** cele patru adrese de
test. Adresele reale (`admin@blipmade.com`, `stefan@xodo.ro`, `steph@ripboyband.com`)
și biletul `#46` trebuie să rămână.

---

## 5. Măsuri preventive aplicate

- `/root/sync-check.sh`: instanța 30002 indică acum `3101`; gardă care refuză pornirea
  dacă `API_URL` conține portul de producție.
- `scripts/run-tests.sh`: acceptă `TEST_DB_NAME=<nume>_test`, ca suita de teste să nu
  mai golească baza comună a auditorilor.
- `audit/_tools/seed-check-accounts.mjs`: corectat — `deleteMany` nu este un argument
  valid pe calea de creare a produsului.
- Toți agenții de audit au primit instrucțiunea explicită: doar `30003`/`3101`,
  niciodată `30002`, niciodată `https://blipmade.com`.
- `api/src/env.ts` / `api/src/routes/auth.ts`: limita de autentificare este
  configurabilă (`LOGIN_RATE_LIMIT_MAX`, implicit 10). Stiva izolată folosește 500,
  pentru că mai mulți auditori se autentifică de la aceeași adresă. **Producția nu este
  afectată** (valoarea implicită rămâne 10).
