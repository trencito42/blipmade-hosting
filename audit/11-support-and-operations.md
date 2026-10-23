# 11 — Modelul de operare: suport, runbook, on-call

> **Agent:** A11 (audit tehnic + comercial, sesiune ramură).
> **Natură:** audit **read-only**. Singurele fișiere scrise de acest agent sunt cele trei documente `11-*.md` din acest director.
> **Producție:** nu s-a scris, nu s-a deployat, nu s-a comandat, nu s-a plătit, nu s-a trimis e-mail, nu s-a șters date de clienți. Singura autentificare efectuată a fost una, cu contul de test `qa.headless.one@example.test`, pentru a vedea ecranele reale.

## 0. Sumar executiv

Platforma **nu are în prezent un model de suport operabil**. Nu este o judecată de calitate a codului — sistemul de ticketing este bine scris, are categorii, priorități, atașamente, evenimente și o interfață completă pentru personal. Problema este că **lanțul de livrare al suportului este rupt în trei locuri simultan**, iar fiecare rupere e suficientă să anuleze canalul:

1. **Nimeni nu este anunțat.** Un ticket nou declanșează `notifyStaff()` (`api/src/routes/tickets.ts:425-439`), care trimite un e-mail către toți membrii `STAFF`/`ADMIN`. Transportul de e-mail este `file`, nu `smtp`, deci mesajul **nu pleacă niciodată**; singura urmă a lui rămâne o linie de log `[mail:file] ticket notification for ...` (`api/src/routes/tickets.ts:438`). Am găsit **9 astfel de linii în ultimele 24 de ore** în log-ul containerului `blipmade-api-1` (`VERIFIED`). Concret: singura modalitate prin care un agent de suport află că există ticket nou este să deschidă manual `/admin/tickets` și să se uite.
2. **Clientul nu primește răspuns.** Toate cele **14 ticketuri din producție au `lastReplyAt = NULL`** (`VERIFIED`, interogare `psql`). Ecranul `/app/tickets` arată, pentru fiecare dintre cele 14, coloana „LAST REPLY → **No replies yet**" (`VERIFIED`, captură de browser cu contul de test). Niciun răspuns uman nu a fost dat vreodată. `notifyReply()` (`api/src/routes/tickets.ts:442-451`) trimite răspunsul clientului tot în fișier.
3. **Pagina de status spune chiar ea că suportul e degradat.** Componenta „Support" din `/status` este `degraded` **exact pentru că mailul nu se livrează** — `api/src/routes/health.ts:167-172`: `state: mailTransportName() === 'smtp' ? 'operational' : 'degraded'`, cu detaliul „Mail is written to a file, not delivered." (`CODE-INSPECTED`). Ecranul live arată „Support — Degraded performance" (`VERIFIED`).

În plus, **nu există nicio istorie operațională**: toate datele din bază au fost create între `2026-10-22 19:55:54` și `2026-10-23 17:46` (`VERIFIED`, `min(createdAt)` pe `User`, `Product`, `Ticket`, `Session`, `MailDelivery`, `AuditLog`). Baza are 542 rânduri de audit log, apărute integral în fereastra de audit. Prin urmare, **orice cifră de uptime, de volum de incident sau de timp de răspuns ar fi fabricată** — și nu există, nici măcar în documentație.

Concluzia operațională: **singurul canal de suport real este un ticket in-app, citit de om, fără notificare și fără răspuns.** În starea actuală, un client care scrie primește tăcere.

---

## 1. Metodă și limite

**Ce am făcut.** Citește de cod (`api/src/**`, `web/src/**`, `api/prisma/schema.prisma`, `scripts/ops/**`, `docs/**`); interogări `psql` read-only pe `blipmade-postgres-1` de pe VM 103; interogări read-only la panoul Pterodactyl prin Application API (doar `GET`); o singură autentificare în browser (contul de test seed-uit) pentru capturarea ecranelor reale; `docker logs` read-only.

**Ce NU am făcut și de ce.** Nu am creat ticketuri (sunt scrieri în baza de producție) — am citit cele 14 existente. Nu am creat comenzi și nu am plătit. Nu am trimis e-mail. Nu am șters nimic. Nu am modificat panoul, DNAT-ul, DNS-ul sau firewall-ul.

**Limita de fond a întregului audit.** Platforma are ~22 de ore de existență. Tot ce urmează despre „volumul de suport" este o **derivare din ipoteze explicite**, etichetată `INFERRED`; nimic nu este măsurat. Am refuzat să inventez cifre de incident, uptime sau istoric de ticketuri, deoarece nu există.

**Convenție de clase folosită în acest document:**

| Clasă | Semnificație |
|---|---|
| `VERIFIED` | Confirmat pe hostul de producție, prin comandă read-only, cu ieșire înregistrată |
| `CODE-INSPECTED` | Confirmat prin citirea codului din repo (același mirror ca producția) |
| `DOCUMENTED-ONLY` | Afirmație care există doar în documentație, fără corespuns în cod |
| `INFERRED` | Derivare aritmetică din ipoteze identificate explicit |
| `UNVERIFIED` | Nu am putut verifica (nu am acces, sau comportament ambiguu) |
| `BLOCKED` | Nu se poate verifica în condițiile auditului read-only |
| `NOT-IMPLEMENTED` | Funcția necesară nu există în cod |

---

## 2. Bazele de clienți, în cifre reale

Toate cifrele de mai jos sunt `VERIFIED` (interogare `psql` pe `blipmade-postgres-1`):

| Entitate | Valoare | Observație |
|---|---:|---|
| Utilizatori în total | **6** | 4 cu rol `CUSTOMER`, 2 cu rol `ADMIN` (`User.role`); nu există niciun utilizator cu rol `STAFF` |
| Membri `StaffMember` | **2** | `api/prisma/schema.prisma` → `model StaffMember` |
| Instanțe | **3** | 2 `ONLINE`, 1 `STOPPED` |
| Abonaimente (`Subscription`) | **0** | — |
| Facturi (`Invoice`) | **0** | — |
| Comenzi (`Order`) | **5** | 1 `PENDING` + 4 `AWAITING_PAYMENT`; **niciuna plătită** |
| Ticketuri | **14** | toate `OPEN`, toate `NORMAL`, 13 `TECHNICAL` + 1 `ACCOUNT` |
| Ticketuri cu răspuns | **0** | `lastReplyAt IS NULL` pe toate 14 |
| Ticketuri asignate | **0** | `assignedToId IS NULL` pe toate 14 |
| Ticketuri închise | **0** | `closedAt IS NULL` pe toate 14 |
| Mesaje interne (`internal`) | **0** | — |
| Atașamente | **0** | — |
| Evenimente de ticket (`TicketEvent`) | **28** | 2 per ticket (creare + eveniment duplicat, vezi §4.2) |
| Livrări de e-mail | **15** | toate `written-to-file`, **zero** `delivered` |

**Distribuția ticketurilor pe conturi.** Dintre cele 14, **13 aparțin contului seed-uit de audit** `qa.headless.one@example.test` (`VERIFIED`, agregare `LEFT JOIN` pe `User.email`), iar **1** aparține unui cont `ADMIN`. Concluzia onestă: **volumul organic de ticketuri observat este zero**. Cele 14 ticketuri sunt artefacte ale propriului audit (subiecte de tip „Panel check 2026-10-23T…" și unul formulat ca simptom real: „My Discord bot keeps crashing after the latest update and I cannot open the console to read the logs").

**Asta este un fapt important, nu oStatistică confortabilă:** platforma nu a servit niciodată un client plătitor. Niciun preț, niciun SLA și niciun cost de suport nu poate fi validat empiric până la lansare.

---

## 3. Canalele de suport care există azi

### 3.1 Singurul canal funcțional: ticketul in-app

Sistemul de ticketing este **complet și bine construit** — partea cea mai bună a produsului din punct de vedere operațional.

Rutele (`api/src/routes/tickets.ts`):

| Rută | Linie | Ce face |
|---|---|---|
| `GET /tickets/categories` | `:133` | lista de categorii |
| `GET /tickets` | `:135` | ticketurile utilizatorului, ultimele 100, ordonate descrescător după `updatedAt` |
| `POST /tickets` | `:146` | deschide ticket: subiect 3–160 caractere, corp 1–20 000, până la 5 atașamente de max. 5 MB, tip MIME în listă albă (`text/*`, `application/json\|pdf\|zip\|gzip\|x-tar\|octet-stream`, `image/png\|jpeg\|gif\|webp`) |
| `GET /tickets/:id` | `:192` | detaliu + evenimente |
| `POST /tickets/:id/replies` | `:248` | răspuns |
| `POST /tickets/:id/attachments` | `:314` | încărcare |
| `GET /tickets/:id/attachments/:attachmentId` | `:381` | descărcare |
| `POST /tickets/:id/status` | `:401` | schimbare stare |

Toate sunt `CODE-INSPECTED` în `/root/blipmade-work/api/src/routes/tickets.ts`.

Enum-urile (`api/prisma/schema.prisma:680-701`):
- `TicketStatus`: `OPEN`, `AWAITING_CUSTOMER`, `AWAITING_STAFF`, `ON_HOLD`, `CLOSED`
- `TicketPriority`: `LOW`, `NORMAL`, `HIGH`, `URGENT`
- `TicketCategory`: `TECHNICAL`, `BILLING`, `ACCOUNT`, `ABUSE`, `OTHER`

Interfața există pe ambele părți: client (`web/src/app/Tickets.tsx`, `web/src/app/TicketDetail.tsx`) și personal (`web/src/admin/Tickets.tsx`), iar `/admin/customers/:id` afișează explicit „This customer has not contacted support. Tickets appear here as soon as they open one." (`web/src/admin/CustomerDetail.tsx:411`).

**Ce funcționează:** deschiderea unui ticket de către client, cu validare de intrare și audit (`ticket.created`, 14 rânduri în log — `VERIFIED`).
**Ce nu funcționează:** notificarea (vezi §3.2), răspunsul (0/14), și **măsurarea** (§3.4).

### 3.2 Canalul e-mail: implementat, dar niciodată activ

`MAIL_SUPPORT_EMAIL` există, cu valoarea implicită `support@blipmade.com` (`api/src/env.ts:63`), dar **este folosit exclusiv în șabloanele de e-mail** (`api/src/lib/email-templates.ts:167` și `:195`). Nu apare nicăieri în interfața web și nu este un canal de intrare: nimeni nu scrie la el pentru că nu se știe că există.

Mai grav, **canalul nu ar funcționa nici dacă ar exista**: `SMTP_URL` este gol pe VM 103 (`VERIFIED`), deci `env.mailEnabled = false` (`api/src/env.ts:137`) și `mailTransportName()` întoarce `file`. Transportul `file` scrie mesajul **în fișier**, nu îl trimite (`api/src/lib/mailer.ts:321-332`, `writeMessageFile` → `join(env.BACKUP_DIR, 'mail')`).

Starea efectivă a mesajelor:

| Măsurătoare | Valoare | Clasă |
|---|---:|---|
| Rânduri `MailDelivery` | 15, toate `written-to-file`, 0 `delivered` | `VERIFIED` (psql) |
| Fișiere în `/var/backups/blipmade/mail/` | **4 270** | `VERIFIED` (`ls -1 \| wc -l`) |
| — „Confirm your Blipmade email address" | **4 175** | `VERIFIED` |
| — „[Blipmade] Re: A question about billing" | 43 | `VERIFIED` |
| — „wordpress is ready" | 30 | `VERIFIED` |
| — „Confirm the new address of your Blipmade account" | 22 | `VERIFIED` |

Conținutul unui fișier (chei `date`, `from`, `subject`, `text`, `to` — `VERIFIED`) conține **corpul integral al mesajului, inclusiv linkul de verificare cu tokenul**, în text clar, în directorul de backup, cu permisiuni `rw-rw-r--` (`VERIFIED`). Acesta este și un **hazard de securitate și de GDPR**, tratat în `11-compliance-checklist.md` §4.3.

Log-ul containerului confirmă mecanismul (`VERIFIED`):
```
[mail:file] ticket notification for admin@blipmade.com, browser-admin@blipmade.test
```
9 apariții în 24 de ore, dintr-un total de 12 764 linii de log.

### 3.3 Nu există canal de suport alternativ

`grep -rniE "support@|help@|contact@|telephone|telefon|\+40[0-9]|live chat"` în `web/src`, `api/src`, `docs` → **singurele potriviri sunt `MAIL_SUPPORT_EMAIL` în cod și `support@blipmade.com` în `docs/EMAIL.md`**. Nu există telefon, chat, Discord de suport, nici formular de contact în afara ticketului. Ecranul `/status` închide cu „Something broken that is not listed here? Open a ticket." (`VERIFIED`, browser) — deci canalul unic declarat public este exact cel care nu este notificat.

### 3.4 Nu se poate măsura un SLA, nici măcar azi

Modelul `Ticket` (`api/prisma/schema.prisma:703-727`) are `lastReplyAt`, `closedAt`, `createdAt`, `updatedAt`, `status`, `priority` — dar **nu are `firstRespondedAt`** și nu are niciun câmp de timp țintă. Consecințe directe, toate `CODE-INSPECTED`:
- **timpul de prim răspuns nu poate fi calculat** nici retroactiv, nici prospectiv, din date;
- **timpul de rezolvare** se poate măsura doar pe ticketurile închise — și sunt **0**;
- **SLA-ul nu poate fi raportat**, deci nici nu poate fi auditat de un client care cere justificare.

Orice SLA pe care platforma îl promite azi ar fi **nepotrivit și nemonstrabil**. În plus, pagina `/status` spune explicit: „90-day uptime history is not available yet. This page only shows the state the platform reports right now." (`VERIFIED`) — deci nici măcar uptime-ul nu poate fi raportat.

### 3.5 Coada, workerul și monitorizarea

| Componentă | Stare | Clasă |
|---|---|---|
| `redis` — coada de provisionare | `Operational` în `/status` | `VERIFIED` |
| Workerul de automatizare | `Operational` în `/status`, healthcheck pe `127.0.0.1:3101/health` la 30 s | `VERIFIED` |
| Timerele workerului | `reconcile` 60 s, `pruneQueue` 10 min, `pruneSessions` 1 h, `sweepBilling` 15 min, `retryWebhooks` 5 min | `CODE-INSPECTED` (`api/src/worker.ts`) |
| Timer legat de ticketuri | **nu există** — nici SLA, nici auto-close, nici escaladare, nici raport | `CODE-INSPECTED` |
| Prometheus / Grafana / Alertmanager / Uptime Kuma / Sentry | **nu există** în `compose.yml` sau în `scripts/ops/` | `CODE-INSPECTED` |
| Rotire loguri Docker | **nu există** — nu e `/etc/docker/daemon.json`, deci `json-file` fără `max-size`; nici `logrotate.d/docker` | `VERIFIED` (config) |
| Cron / timer systemd pentru backup | **nu există** (vezi `03-infrastructure.md` §9.1) | `DOCUMENTED-ONLY` (documentația de audit) |

`/status` este, de fapt, **singurul instrument de monitorizare**, iar el este onest: 10 componente plus „Support", plus avertismentul că nu există istoric.

---

## 4. Runbook: ce există în repo vs ce nu există

### 4.1 Ce există în repo (verificat)

| Artefact | Ce oferă | Clasă |
|---|---|---|
| `docs/RUNBOOK.md` | Proceduri operaționale pentru incidente: ce se verifică, cu ce comenzi, ce înseamnă fiecare stare | `CODE-INSPECTED` |
| `docs/EMAIL.md` | Cum se configurează și se testează transportul SMTP, cum se încearcă livrare | `CODE-INSPECTED` |
| `docs/PRODUCTION_READINESS.md` | Liste de verificare pre-lansare | `DOCUMENTED-ONLY` |
| `docs/AUDIT_REMEDIATION.md`, `docs/CUSTOMER_PANEL_AUDIT.md` | Inventare de probleme și stadiu | `DOCUMENTED-ONLY` |
| `scripts/backup.sh`, `scripts/restore.sh`, `scripts/restore-drill.sh`, `scripts/backup-offsite.sh` | Scripturi de backup și restaurare | `CODE-INSPECTED`; **neschematizate** (`03-infrastructure.md` §9.2) |
| `scripts/cleanup-data.sh` | Curățarea **artefactelor de verificare** (utilizatori cu adrese de test, produse cu prefix de test, instanțele/comenzile/abonamentele lor). Explicit: „The administrator account, the demo catalog and the append-only audit log are never touched." | `CODE-INSPECTED` |
| `scripts/ops/*.py`, `*.mjs` (30+ scripturi) | Sonde read-only pentru panou, nod, alocări, limitele panelului | `CODE-INSPECTED` |
| `docs/API_CONTRACT.md`, `docs/FRONTEND_CONTRACT.md` | Contracte API/UI pentru integrare | `CODE-INSPECTED` |

**Observație esențială:** `scripts/cleanup-data.sh` **nu este un mecanism de retenție**. Este o curățare a artefactelor de test, declanșată manual, cu confirmare explicită. Nu are niciun cron, niciun timer. Nimeni nu rulează `backup.sh` singur (`VERIFIED` pentru absența cronului, în `03-infrastructure.md` §9.1).

### 4.2 Ce NU există — și ce înseamnă asta

Niciunul dintre aceste artefacte **nu există** în repo sau pe host (`CODE-INSPECTED` prin inventarul complet al `docs/` și `scripts/`):

| Document / mecanism lipsă | Consecința concretă |
|---|---|
| **Runbook de suport / triage** | Nimeni nu știe ce se face cu un ticket `URGENT`. Există `TicketPriority.URGENT` în enum, dar niciun cod, niciun timer, niciun document nu-i atribuie vreo semnificație. |
| **Matrice de severitate a incidentelor** | Nu există nicio definiție pentru „outage" vs „degraded" vs „incident" în interiorul echipei. Singura definiție de severitate din produs este cea a stării componentelor din `/status` (`health.ts:157-181`), care descrie platforma, nu incidentul. |
| **Cale de escaladare** | Nu există. Există un singur operator. `POST /admin/tickets/:id/assign` (`api/src/routes/admin.ts:591`) permite atribuirea nominală unui `StaffMember`, dar nu există regulă care să declanșeze atribuirea, și **0 din 14 ticketuri sunt atribuite**. |
| **Program on-call / rotație** | Nu există. Nu există telefon, pager, chat sau rotație scrisă. |
| **Politica SLA / Timp de prim răspuns** | Nu există, iar datele nu permit măsurarea lui (§3.4). |
| **Politica de rambursare / drept de retragere** | Nu există în produs și nu apare în interfață. Nicio rută de refund în inventarul API. |
| **Procedura de comunicare cu clienții la incident** | Nu există. Nu există niciun șablon de comunicare, nici pagină de incident, nici mecanism prin care un client să fie informat (e-mailul nu merge). |
| **Procedura de incident / post-mortem** | Nu există șablon, nu există istoric, nu există decizie documentată. |
| **Politica de escaladare a abuzului** | `TicketCategory.ABUSE` există; nu există procedură, nu există contact pentru plângeri, nu există registru de incidente de abuz. |
| **Procedura de răspuns la cereri DMCA / de takedown** | Nu există (vezi `11-compliance-checklist.md` §8). |
| **Runbook de restaurare testat periodic** | Scripturile există; programarea nu există; cele două arhive rămase în `/var/backups/blipmade/` sunt resturi de drill din `2026-10-22` (`03-infrastructure.md` §9.2). |
| **Politica de retenție a datelor** | Nu există (vezi `11-compliance-checklist.md` §10). |

### 4.3 O observație de calitate a datelor de ticket

`POST /tickets` creează **două** evenimente identice pentru un ticket nou: unul în `events: { create: ... }` din `prisma.ticket.create` (`api/src/routes/tickets.ts:180`) și unul explicit, imediat după (`api/src/routes/tickets.ts:185`). Rezultatul: **28 `TicketEvent` pentru 14 ticketuri** (`VERIFIED`), adică fiecare ticket are un eveniment „created" duplicat. Nu e o eroare funcțională, dar însemnează că orice metrică viitoare pe evenimente va fi dublu numărată dacă nu se curăță la scriere. `CODE-INSPECTED`.

---

## 5. On-call: realitatea tehnică

Ce se întâmplă efectiv dacă API-ul sau workerul moare azi (`VERIFIED` pe `compose.api.yml`):

| Mecanism | Configurat | Efect |
|---|---|---|
| Politica de restart | `restart: unless-stopped` (api, worker, web) | containerul se ridică la nouă repornire a mașinii |
| Healthcheck | `wget -qO- http://127.0.0.1:3100/health` (api) / `:3101/health` (worker), la 30 s, `retries: 3`, `start_period: 30 s` | Docker marchează containerul `unhealthy` — dar **nu există `depends_on: condition: service_healthy` între api și web** în `compose.web.yml` (`depends_on: [api]` simplu) și **nimic nu reacționează la `unhealthy`** |
| Ieșirea din container | unhandled exception → procesul moare → Docker reia containerul | recuperare automată, dar **cu pierderea stării în memorie** și fără alertă umană |
| Alertare către om | **nu există** — nici Prometheus, nici Alertmanager, nici Sentry, nici Uptime Kuma | nimeni nu află |
| Notificare de incident către client | **nu există** | nimeni nu află nici clientul |
| Pagina `/status` | reflectă starea curentă, calculeată la cerere | reflectă, dar nu avertizează |

**Consecința on-call, spusă direct:** singurul mecanism de detectare este oameni care deschid `/status` sau observă că un client scrie. Nu există paginare, nu există rotație, nu existie supraveghere. Pentru o platformă cu **un** operator, asta înseamnă că **timpul de detectare (MTTD) este egal cu timpul până când cineva se uită** — un timp nelimitat și nedeductibil. Măsurarea lui nu e posibilă, pentru că nu există evenimente.

**Observație conexă, pentru același dosar:** `healthcheck`-ul are `retries: 3` la 30 s, adică ~90 s până la marcarea `unhealthy`, dar un container `unhealthy` **continuă să primească trafic** dacă procesul nu a murit; policy-ul de restart se declanșează doar la ieșirea procesului. Nu există `restart: on-failure` + `stop_grace_period` configurate explicit, iar `docker ps` arată toate containerele `Up ... (healthy)` (`VERIFIED`) — adică starea curentă e sănătoasă, dar **nu există prag definit pentru „degradat"**.

---

## 6. Matrice de severitate a incidentelor (propunere — nu există azi)

Nicio matrice nu există în repo (`CODE-INSPECTED`, inventar complet `docs/`). Mai jos este o propunere **de proiectare**, construită ca să poată fi măsurată cu instrumentele existente, și marcată explicit ca propunere, nu ca realitate.

| Sev. | Definție operațională | Exemplu pe platforma de azi | Acțiune | Obiectiv de răspuns | Canal |
|---|---|---|---|---|---|
| **S1 — Total indisponibil** | Panoul, API-ul sau coada nu răspund; **niciun client nu își poate accesa serverul** | API-ul oprit; Redis indisponibil; panoul inaccesibil | Păstrează pagina, verifică `/status`, verifică logurile, reia containerul | 15 min | Telefon/on-call (de definit) |
| **S2 — Parțial indisponibil** | Platforma merge, o funcție e jos | Checkout 503 (`VERIFIED` azi); provisionarea eșuează | Diagnostic pe funcție, hotărâre de rollback/forward-fix | 1 h | Ticket + on-call |
| **S3 — Funcționalitate degradată** | Totul merge, un rezultat e greșit sau lent | Instanță marcată `Online` în timp ce containerul e `offline` (`VERIFIED` azi) | Ticket + plan de corecție | 1 zi lucrătoare | Ticket |
| **S4 — Defect funcțional fără impact pe serviciu** | Comportament greșit într-un flux secundar | Factură cu `tax: 0` | Ticket | 3 zile lucrătoare | Ticket |
| **S5 — Întrebare / cerere de informație** | Nu e incident | „Cum îmi schimb e-mailul?" | Ticket | 5 zile lucrătoare | Ticket |

**Observație critică pentru S1/S2:** în starea curentă, canalul de contact între operator și client este **e-mailul**, iar e-mailul nu se livrează. Prin urmare, în orice incident S1 sau S2, **clientul nu află nimic** până când vine el și întreabă. Asta trebuie rezolvat **înainte** de orice SLA, nu după.

---

## 7. Calea de escaladare (propunere)

Nicio cale de escaladare nu există (`CODE-INSPECTED`). Propunere, cu roluri reale, nu fictive:

1. **Auto-detecție → Ticket S1.** Orice condiție S1 detectată de operator generează un ticket cu `priority = URGENT`, `category = TECHNICAL`, **asignat automat** celui care a deschis incidentul. Azi: 0/14 sunt asignate, deci pasul 1 nu există în practică.
2. **Escaladare la 30 de minute fără răspuns.** Pragul există astăzi doar în `TicketPriority.URGENT` ca etichetă. Propunere: un timer în worker (locul lui e `sweepBilling`, la 15 min) care escaladează automat un `URGENT` nerezolvat și **scrie în logul de audit** — astfel încât escaladarea e măsurabilă, nu declarativă.
3. **Escaladare la 4 ore.** Cu doi membri `StaffMember` în bază (`VERIFIED`), al doilea este chemat. **Cum?**: singurele canale disponibile azi sunt e-mailul (nu merge) și telefonul (nu există). **Concluzie: escaladarea nu poate fi implementată înainte de a funcționa transportul de e-mail sau un canal nou.**
4. **Post-mortem.** Pentru fiecare S1/S2: cauză, acțiuni, preventiv, într-un document versionat. Azi: **zero** post-mortem-uri, pentru că nu există incidente istorice.

---

## 8. Volumul realist de ticketuri impus de baza de clienți

### 8.1 Ce se poate afirma

- **Volumul organic observat = 0.** Cele 14 ticketuri sunt, cu excepția unuia, artefacte ale auditului (§2). Nu există nicio observație de comportament real al clienților.
- **Baza de clienți reali = 0 plătitori.** Nicio comandă plătită, niciun abonament, nicio factură (`VERIFIED`).
- **Nu există istoric.** Baza are ~22 de ore. Orice proiecție de volum construită pe „istoricul ticketurilor" ar fi fabricată.

### 8.2 Ce se poate deriva, cu ipotezele scrise explicit

Ipoteza de cost a suportului vine din `09-unit-economics.md` §3.2 și este `OPERATOR-INPUT`:
> suport = `15 min / 60 × 20.00 EUR/h` = **€5,0000 pe client pe lună**

Aceeași coloană din A09 dă costurile fixe: comision de plată `0.03 × P`, comision fix `0,25`, backup/stocare `0,25`, deci
```
VC(P) = 0.03 × P + 0.50 + (m / 60) × 20.00        [m = minute de suport pe client pe lună]
```
Verificare de reconciliere cu A09: la `P = 9.99`, `m = 15` → `VC = 5.7997` și contribuția `+4.1903` (41,9 %) — **identic** cu `09-unit-economics.md` §12. La `P = 1.49`, `m = 15` → contribuția `−4.0547` — **identic** cu valoarea `−4.05` publicată de A09. Formula e corectă și e cea a lui A09, nu una nouă.

**Interpretarea lui `m`.** A09 nu spune dacă cei 15 min reprezintă un ticket complet sau o porție dintr-o conversație. Două citiri oneste:

| Citire | Ce înseamnă | Ticketuri pe lună la un nod plin (16 clienți, A09) |
|---|---|---:|
| **A (literală)** | un ticket consumă 15 min de timp de operator | 16 ticketuri/lună = ~0,53/zi pentru toată baza |
| **B (interacțiune)** | 15 min/client/lună împărțite la ~20 min per ciclu de ticket (prim răspuns + follow-up) | 12 ticketuri/lună = ~0,40/zi |

Ambele sunt `INFERRED` și **ambele sunt irelevante pentru o decizie de azi**, pentru că se referă la o bază de clienți care nu există. Ele au un singur folos real: **arată că 15 min/client/lună este o ipoteză, nu o măsurătoare, și că ea trebuie recalibrată după primele 90 de zile de trafic real**. Cât timp platforma are 4 clienți, chiar și un singur ticket de 45 de minute cu un client care cere ajutor pentru „botul meu nu pornește" consumă **45 de minute** — adică **3× bugetul lunar de suport al întregii baze** (16 × 15 = 240 min/lună la un nod plin).

### 8.3 Pragul care chiar contează

Din formula lui A09, `minutes_maxime(P) = (P − 0.03×P − 0.50) / 20.00 × 60`:

| P | Minute de suport admise pe client pe lună | Verdict la ipoteza de 15 min |
|---:|---:|---|
| **€1.49** | **2,84** | deficit de 12,16 min |
| **€1.72** | **3,51** | deficit de 11,49 min |
| **€4.50** | 11,60 | deficit de 3,40 min |
| **€9.99** (recomandarea A09) | **27,57** | **headroom de 12,57 min (+84 %)** |

*(primele patru rânduri: `DOCUMENTED-ONLY` din `09-unit-economics.md` §4.1; rândul €9.99: `INFERRED`, aplicând formula lui A09 la prețul recomandat în `09-pricing-recommendations.md`)*

**Aceasta este singura afirmație solidă despre suport pe care o poate face acest audit:** *la prețul recomandat de €9.99/lună, bugetul de suport de 15 min/client/lună este sustenabil, cu o marjă de 12,57 minute; la prețurile curente de €1.49 și €1.72, același buget de suport este imposibil de atins — platforma pierde bani pe fiecare client cu care vorbește.*

---

## 9. Instrumentele disponibile operatorului

| Instrument | Există? | Ce face în practică | Clasă |
|---|---|---|---|
| **Sistem de ticketing** | da | Funcționează pentru client; **nu notifică, nu primește răspuns** | `VERIFIED` / `CODE-INSPECTED` |
| **Consolă de suport (`/admin/tickets`)** | da | **Singura sursă de adevăr despre ticketuri.** Fără notificare, trebuie deschisă manual | `CODE-INSPECTED` |
| **Audit log** | da | 542 rânduri **la momentul măsurării** (numărul crește în continuare, fără nicio retenție), cu `actorId`, `actorEmail`, `action`, `targetType`, `targetId`, `meta`, `ip`, `createdAt` | `VERIFIED` (psql) / `CODE-INSPECTED` (`schema.prisma:763-779`) |
| — acțiuni înregistrate | — | `auth.login` 309, `instance.provision_failed` **80**, `instance.file_deleted` 25, `ticket.created` 14, `settings.profile_updated` 13, `order.created` 13, `auth.login_failed` 11, `auth.register` 11, `order.paid` 8, `instance.retry_requested` 8, `product.created` 8, `stripe.checkout.session.completed` 8, `instance.power.start` 7, `instance.power.stop` 7, `instance.provisioned` 5, `order.checkout_started` 4, `worker.reconciled` 3, `product.updated` 3, `instance.schedule_deleted` 2, `auth.reset_requested` 2 | `VERIFIED` |
| **Curățare a audit log-ului** | **nu** | `grep -rn "auditLog.deleteMany"` → **zero potriviri**. Logul crește fără limită și conține `actorEmail` și `ip` — date personale | `CODE-INSPECTED` |
| **Consolă de infrastructură (`/admin/infrastructure`)** | da | Vedere pe noduri, alocări, containere | `CODE-INSPECTED` |
| **Pagina `/status`** | da | 10 componente + „Support"; **fără istoric** | `VERIFIED` |
| **Monitorizare externă / alerting** | **nu** | — | `CODE-INSPECTED` |
| **Rotire și arhivare loguri** | **nu** | fără `daemon.json`, fără `logrotate` | `VERIFIED` (config) |
| **Drept de ștergere a datelor** | **nu** | vezi `11-compliance-checklist.md` §4 | `CODE-INSPECTED` |

**Cele 80 de `instance.provision_failed`** sunt cel mai util semnal din tot logul: în fereastra de ~22 de ore, provisionarea a eșuat de 80 de ori (40 pe 22 oct., 40 pe 23 oct.) — toate în timpul eșecurilor reale de test ale echipei de audit. Merită spus limpede: **acestea sunt eșecuri produse de audit, nu incidente de producție**, dar arată ce se întâmplă când provisionarea eșuează: `instance.retry_requested` de 8 ori, tot fără răspuns uman, și tot fără notificare pe e-mail.

---

## 10. O zi în viața operatorului (scenariul realist, bazat pe starea măsurată)

**08:30** — Operatorul deschide `https://blipmade.com/status`. Vede „Degraded performance" în titlu, „Support — Degraded performance", și amintirea „90-day uptime history is not available yet." Nu e alarmă, e permanent — pagina arată asta *permanent*, deoarece mailul nu se livrează. **MTTD = 0, dar nu pentru că sistemul funcționează, ci pentru că nu există încotro.**

**09:00** — Operatorul deschide `/admin/tickets`. Găsește 14 ticketuri, toate `Open`, toate „No replies yet", niciunul asignat, niciunul închis. Le parcurge. 13 sunt probe ale auditului; unul spune „My Discord bot keeps crashing after the latest update and I cannot open the console to read the logs" — **un simptom real, raportat de un client, fără răspuns de 11 ore** (`createdAt` 2026-10-23 06:15:44, `lastReplyAt` NULL, `VERIFIED`).

**09:20** — Clientul a deschis ticket și **nu a primit niciun e-mail**. Nu știe că ticketul a fost înregistrat. Poate redeschide, poate deschide încă unul. (Nu se poate verifica dacă s-a întâmplat: nu există `order.paid`… pardon, nu există metrică de ticketuri dublate. `NOT-IMPLEMENTED`.)

**10:00** — Un client deschide un ticket nou. `notifyStaff()` scrie un fișier în `/var/backups/blipmade/mail/` și lasă o linie în log. **Operatorul nu află.** Dacă nu deschide `/admin/tickets` până la seară, ticketul rămâne fără răspuns.

**12:00** — Verificare de rutine: `docker ps` — toate containerele `healthy`. `psql` — verifică instanțele: 3 înregistrări, dintre care 2 `ONLINE`. **Dar** `GET /api/instances/:id/resources` pentru instanța respectivă întoarce `state: "offline"`, `uptime: 0`, `memory_bytes: 0` (`VERIFIED`). Baza de date spune „Online"; panoul spune „offline". Operatorul trebuie să știe că are o contradicție între două surse de adevăr, și nu are niciun instrument care să o rezolve.

**14:00** — Un client cere ajutor pentru o problemă de plată. Operatorul deschide `/app/billing`... și vede, în contul propriu de test, „CURRENT PERIOD ENDS — Not available yet", „PAYMENT METHOD — No payment method on file", „Subscriptions — No subscriptions yet", „Invoices — No invoices yet". **În contul unui client care are o instanță activă.** Abia acum înțelege că de fapt **plățile nu funcționează deloc**: `POST /api/orders/:id/checkout` → `503`, `{"error":{"code":"payments_unavailable","message":"Payments are not available at the moment: no Stripe key is configured on this environment."}}` (`VERIFIED`, măsurat live). Orice client care încearcă să plătească eșuează.

**16:00** — Verificare a unei alerte de `instance.provision_failed`. Nu există alertă. Doar log-ul: 80 de eșecuri. În lipsa unei proceduri, operatorul decide ad hoc dacă reîncearcă (`instance.retry_requested`, 8 înregistrări) sau nu.

**18:00** — Închiderea zilei. **Nu există raport zilnic**, nu există metrici exportabile, nu există istoric. Dacă operatorul uită un ticket, **nu există nimic care să îl reamintească**.

**Concluzia zilei:** munca operatorului este *reactivă prin oameni*. Nimic nu se întâmplă automat, pentru că nu există niciun automatism care să observe. Costul real al suportului nu e cel din modelul A09 (15 min/client/lună) — ci **nelimitat**, pentru că nimeni nu măsoară timpul petrecut și nimeni nu vede backlog-ul.

---

## 11. Opțiuni de SLA de suport și consecința de cost

**Toate cifrele din tabel sunt `INFERRED`**, derivate din formula lui A09 (`09-unit-economics.md` §3.2), reconciliată cu valorile publicate de A09 (§12: contribuție `−4.05` la €1.49, `+4.19` la €9.99, prag ARPU `€5.67`, prag full-absorption `€9.60`). Formula: `VC(P, m) = 0.03·P + 0.50 + (m/60)·20.00`; contribuția `= P − VC`.

**Contextul de pornire (VERIFIED):** prețul recomandat de A09 pentru `discord-bot` este **€9.99/lună** (`09-pricing-recommendations.md`). Cardul de preț curent: `256 MB / 1 vCPU / 1 GB` → **€1.49**; `512 MB / 1 vCPU / 5 GB` → **€1.72** (implicit, prețul tuturor celor 3 instanțe live); `4 GB / 2 vCPU / 20 GB` → **€4.52** (neselectabil în wizard). Supracargările se aplică **peste minimul produsului**, nu peste zero (`api/src/services/pricing.ts:39-53`).

### 11.1 Tabelul de opțiuni

| Opțiune | `m` (min/client/lună) | Angajament propus | VC la €1.49 | Contrib. la €1.49 | VC la €1.72 | Contrib. la €1.72 | VC la €9.99 | Contrib. la €9.99 |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| **S0 — Fără suport** | 0 | niciun angajament | 0,5447 | **+0,9453** | 0,5516 | **+1,1684** | 0,7997 | **+9,1903** |
| **S1 — „best effort"** | 5 | răspuns în 5 zile lucrătoare, fără garanție | 2,2114 | **−0,7214** | 2,2183 | **−0,4983** | 2,4664 | **+7,5236** (+75,3 %) |
| **S2 — Standard** *(ipoteza A09)* | 15 | răspuns în 1 zi lucrătoare, 2 runde de follow-up | 5,5447 | **−4,0547** | 5,5516 | **−3,8316** | 5,7997 | **+4,1903** (+41,9 %) |
| **S3 — Rapid** | 30 | răspuns în 4 h lucrătoare, 4 runde de follow-up | 10,5447 | **−9,0547** | 10,5516 | **−8,8316** | 10,7997 | **−0,8097** |
| **S4 — 24/7** | 60 | răspuns în 1 h, ori/zi, incidente S1 | 20,5447 | **−19,0547** | 20,5516 | **−18,8316** | 20,7997 | **−10,8097** |

*(contribuție negativă = platforma pierde bani pentru fiecare client servit)*

### 11.2 Ce înseamnă concret fiecare linie

- **La prețurile curente (€1.49 / €1.72), orice SLA mai generos decât „best effort" este imposibil.** Chiar și S1 (5 min) e sub prag. La €1.72, bugetul maxim e **3,51 minute** pe client pe lună — mai puțin de un singur răspuns lung. **Prețul, nu SLA-ul, este problema** (aceeași concluzie ca A09 §12).
- **La €9.99, S2 (15 min) este sustenabil** cu 12,57 minute de rezervă (+84 % peste buget), și contribuie cu **+41,9 %**. S3 (30 min) **rupe echilibrul**: contribuția devine **−€0,81/client/lună**, deci fiecare client adăugat **crește pierderea**, indiferent de volum.
- **S4 (24/7) este imposibilă la orice preț din card.** Ca să nu fie negativă contribuția, ar trebui `P ≥ 21,13`; ca să absoarbă și costul fix de €61/lună la 16 clienți, `P ≥ 25,06`. Amândouă sunt de 2,5–4× prețul recomandat. **Un SLA 24/7 nu este o opțiune de suport, este o decizie de model de afaceri.**
- **Cel mai important rând este S0.** Fără suport, la €9.99, contribuția este **+€9,19/client/lună** (92 %) — aproape dublă față de S2. **Înainte de a îmbunătăți suportul, trebuie redusă necesitatea lui: documentație, `/docs`, page de status și ghiduri de auto-depanare.** Platforma are deja `web/src/pages/Docs.tsx` (110 KB de conținut — `CODE-INSPECTED`), dar nu îl leagă de fluxul de suport.

### 11.3 Opțiunea S1 (5 minute) există deja în modelul lui A09

Nu am inventat tierul de 5 minute: **`09-pricing-recommendations.md` §2.4 îl invocă explicit** ca ipoteză care ar permite cardul de rezervă:

> „**Recomandarea rămâne €9.99 / `baseAmount = 976`**; `baseAmount = 599` este doar varianta de rezervă, **dacă operatorul decide că suportul trebuie redus la 5 minute pe client** (§5)."

Cardul de rezervă al lui A09 (verificat în același fișier, §2.4): `256 MB / 1 / 1 GB` → €5.99; `512 MB / 1 / 5 GB` → **€6.22**; `2048 MB / 2 / 10 GB` → €7.62; `4096 MB / 2 / 22 GB` → €9.06; `4096 MB / 4 / 49 GB` → €10.40.

Ce ar însemna aritmetically (`INFERRED`, aceeași formulă a lui A09):

| Configurație | Preț | VC la m = 5 min | Contribuție | Break-even la F = €61 |
|---|---:|---:|---:|---|
| 512 MB / 1 / 5 GB | €6.22 | 2,3533 | **+€3,87** | 61 / 3,87 ≈ **16 clienți** (ocupare plină) |
| 512 MB / 1 / 5 GB | €6.22 | 5,6866 (la m = 15) | +€0,53 | 61 / 0,53 ≈ **115 clienți** |

Ultima rând reproduce exact verdictul lui A09 („acest card nu se închide… break-even **115 clienți** pe un nod de 16"), ceea ce confirmă că formula e cea a lui A09. **Așadar: reducerea suportului la 5 minute pe client ar permite un preț de €6.22 cu break-even la ocupare plină.** Aceea este singura combinație preț/SLA din tot materialul economic care se închide la volum realist, în afara prețului recomandat de €9.99.

**Atenție, totuși:** reducerea de la 15 la 5 minute pe client nu este o optimizare de cost — este o **reducere a nivelului de serviciu**, și ea nu e posibilă azi: fără e-mail funcțional, fără notificare de ticket și fără măsurare a timpului de răspuns, „5 minute de suport pe client pe lună" nu e o ofertă, e o cifră.

### 11.4 De ce S1/S2 nu pot fi promise azi
| Cerință de SLA | Stare | Clasă |
|---|---|---|
| Transport de e-mail funcțional (pentru confirmarea de primire și răspunsuri) | **nu** — `SMTP_URL` gol; 4 270 mesaje în fișier | `VERIFIED` |
| Timestamp de prim răspuns | **nu** — `Ticket` nu are `firstRespondedAt` | `CODE-INSPECTED` |
| Raport periodic SLA | **nu** — nu există job, export sau metrică | `CODE-INSPECTED` |
| Notificare de incident către client | **nu** — `/status` e static, nu există pagină de incident | `CODE-INSPECTED` |
| Politica de refund / retragere | **nu** — nu există rută, nu există text | `CODE-INSPECTED` |
| Escaladare | **nu** — 0/14 ticketuri asignate | `VERIFIED` |

**Concluzia secției 11, spusă fără atenuări:** *un SLA de suport nu se promite înainte de a exista un sistem care (a) notifică operatorul, (b) trimite clientului răspunsul, (c) măsoară propriul timp de răspuns și (d) are un cost unitar măsurat. Astăzi platforma nu are niciuna din cele patru. În plus, SLA-ul trebuie dimensionat la **€9.99**, nu la €1.49 — la prețul curent, chiar un SLA de 5 minute pe client pe lună pierde bani.*

---

## 12. Remediere în ordine (fără rescrieri, în ordine de dependență)

| # | Acțiune | De ce e primul | Cost | Efect |
|---|---|---|---|---|
| **R1** | **Configurează SMTP real** (`SMTP_URL`) și verifică livrarea | De ce e primul: fără el, *niciun* alt rând din tabel nu e posibil — și canalul e-mail e condiția de existență a oricărui SLA | configurație + un domeniu cu SPF/DKIM/DMARC | de la 0 la 14 notificări de ticket, de la 0 la 4 270 mesaje pierdute pe disc |
| **R2** | **Adaugă `firstRespondedAt` la `Ticket`** și un job de raport SLA | Fără el, SLA-ul e nemonstrabil | migrare mică + job | face SLA-ul măsurabil |
| **R3** | **Răspunde la cele 14 ticketuri deschise** și închide-le | Sunt 11 zile deschise, 0 răspunsuri; un client care a raportat un crash n-a primit nimic | ~1–2 h de operator | închide singurul „incident" real existent |
| **R4** | **Curăță cele 4 270 fișiere de mail** din `/var/backups/blipmade/mail/` după R1 | Conțin tokeni de verificare și de resetare în text clar | minut | elimină expunerea de date personale și tokeni |
| **R5** | **Scrie `docs/RUNBOOK-SUPPORT.md`** (triage, severitate, escaladare) | Nu există nimic; severitatea `URGENT` e goală | 2–3 h | face comportamentul repetabil |
| **R6** | **Adaugă un timer în worker** pentru escaladarea automată a `URGENT` nerezolvat | Locul lui e deja stabilit (workerul rulează la 15/60/300 s) | ~30 min cod | escaladarea devine automată și auditabilă |
| **R7** | **Configurează rotația logurilor Docker** (`daemon.json` cu `max-size`/`max-file`) | Nu e `/etc/docker/daemon.json`; logul crește fără limită pe un disc de 20 GB | 5 min | protejează discul și păstrează istoricul |
| **R8** | **Elimină duplicarea evenimentului `created`** din `POST /tickets` | 28 evenimente pentru 14 ticketuri; orice metrică viitoare e dublu numărată | 1 linie | metrici corecte |
| **R9** | **Definește un preț de suport și scrie SLA-ul** — la €9.99, nu la €1.49 | La prețul curent, SLA-ul e imposibil economic (S1 pierde bani și la €1.72) | decizie | previne un angajament care nu poate fi onorat |
| **R10** | **Pune alerta de e-mail pe inboxul de monitorizare** | Ultima linie de apărare: detectarea manuală | minut | MTTD de la „laș" la „minut" |

---

## 13. Ce rămâne nerezolvat (limite onest ale acestui audit)

- **Nu pot măsura timpul real de răspuns**, pentru că nu există niciun răspuns dat (0/14) și nu există timestamp de prim răspuns (`CODE-INSPECTED`).
- **Nu pot măsura uptime-ul**, pentru că pagina `/status` spune explicit că nu există istoric (`VERIFIED`), iar baza are ~22 de ore (`VERIFIED`).
- **Nu pot valida ipoteza de 15 min/client/lună** — e `OPERATOR-INPUT` la A09, și nu există trafic real care s-o calibreze. E un input, nu o măsurătoare.
- **Nu pot spune câte minute de suport ar costa incidentele reale**, pentru că nu există incident istoric și nici backlog curent cu răspunsuri date.
- **Nu am verificat comportamentul SMTP cu un server real**, pentru că auditul este read-only și `SMTP_URL` e gol — deci *niciun e-mail nu a fost trimis, nici măcar de test*. Testul de livrare (din `docs/EMAIL.md`) rămâne neexecutat (`BLOCKED`).

---

*Document scris de agentul A11. Toate afirmațiile au clasă de evidență și sunt urmărite la o sursă concretă (fișier:linie sau ieșire de comandă). Nu conține secrete, date personale ale clienților sau cifre fabricate.*
