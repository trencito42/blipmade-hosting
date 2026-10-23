# 07 — Porțile de lansare

**Data auditării:** 2026-10-23 · **Obiect:** verdictul de lansare comercială a platformei Blipmade (VM 103 `10.77.0.13`, `/opt/blipmade`, domeniul public `https://blipmade.com`).
**Metodă:** doar dovezi produse în acest audit sau în rapoartele fraților `audit/03-*` și `audit/04-*`, cu referințe `fișier:linie` sau cu comanda și ieșirea ei. Clasele de verificare sunt cele din `00-BRIEFING.md`. Niciun secret nu este reprodus: pentru fiecare valoare sensibilă se indică **locația și tipul**, nu valoarea.

**Regulile respectate:** producția a fost tratată read-only. Au fost rulate suita de teste (doar `blipmade_test`) și verificările de browser pe domeniul public. Nu s-a creat nicio comandă, nicio plată, nicio instanță și nu s-a scris nimic în baza de date în afara celor două efecte proprii ale scriptului de panou (numele clientului de test și un ticket de suport).

---

## 1. Rezumat

| # | Poartă | Verdict |
|---:|---|:---:|
| 1 | Clienții pot accesa resursele altora | 🟢 **GREEN** |
| 2 | Autentificarea plăților în producție este nesigură | 🟠 **AMBER** |
| 3 | O plată reușită poate fi pierdută sau reconciliată greșit | 🟠 **AMBER** |
| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟠 **AMBER** |
| 5 | Provisionarea nu este fiabilă pentru un produs vândut | 🔴 **RED** |
| 6 | O reîncercare obișnuită poate distruge date de client | 🟠 **AMBER** |
| 7 | Se vinde un produs fără un runtime verificat funcțional | 🔴 **RED** |
| 8 | Secretele critice sunt expuse | 🟠 **AMBER** |
| 9 | Nu există strategie de recuperare în afara hostului | 🔴 **RED** |
| 10 | Checkoutul afișează prețuri material greșite | 🟠 **AMBER** |
| 11 | Anularea sau reînnoirea este material incorectă | 🟠 **AMBER** |
| 12 | Funcțiile de bază ale clientului sunt indisponibile | 🔴 **RED** |
| 13 | Securitatea infrastructurii critice nu a fost verificată | 🔴 **RED** |

**5 RED · 7 AMBER · 1 GREEN.**

> **Corectură aplicată după auditul independent** (`12b-INDEPENDENT-AUDIT.md` §8.4, corecturile 26–27). Porțile 4 și 10 erau marcate GREEN, dar fiecare ascundea o constatare P0: `applyUpgradeOrder()` nu verifică plata (`COMM-03`), iar prețul public nu spune unitatea (`PRICE-03`) și totalul afișat nu ajunge la Stripe (`COMM-01`). Verdictul final rămâne **NO-GO** — dar pe baza unei porți verzi mai puține, nu mai multe.

---

## 2. Cele treisprezece porți, una câte una

### Poarta 1 — Clienții pot accesa resursele altora → 🟢 GREEN

**Dovezi**
- `api/tests/isolation.test.ts` (9 teste): „does not list another customer instances”, „answers 404 when a customer reads another customer instance”, „refuses a power change on another customer instance”, „refuses a resource change on another customer instance”, „does not show another customer orders”, „does not show another customer tickets”, „does not let a customer attach a ticket to another customer instance”, „refuses admin routes to a customer”, „rejects a protected route without a session”.
- `api/tests/instance-operations.test.ts`: „does not let one customer reach the server of another one”, „never uses the key of the other customer”.
- Cod: `api/src/routes/instances.ts:56-61` — o instanță a altui client și o instanță inexistentă răspund **ambele** `404`, ca să nu se poată deduce existența unui identificator; `api/src/plugins/auth.ts:138-141` (`requireStaff`).
- **Live, cu o sesiune reală de client** (`qa.headless.one@example.test`, cookie din `/tmp/bm-audit/state-customer.json`):
  ```
  GET /api/instances/cmvkbgm9h0001r18096ep5jzl -> HTTP 200      (instanța clientului)
  GET /api/instances/cmvkbichh0003r180pj33xwom -> HTTP 404      (instanța altui client)
  GET /api/orders/BM-00003                      -> HTTP 404      (comanda altui client)
  GET /api/admin/customers                      -> HTTP 403      (rută de staff)
  ```
- Cheile sunt **per client**: `PanelCredential` are 3 rânduri, toate cu `source='bridge'` (`audit/04-pterodactyl-and-provisioning.md` §6.2); cheia globală `PTERODACTYL_CLIENT_KEY` este **goală**, deci nu există o cheie globală capabilă să ajungă la serverele altora.
- Sweep-ul de browser: personalul (`browser-admin@blipmade.test`) a primit `404` pe ruta de instanță a unui client — izolarea se aplică și în sens invers.

**Ce l-ar muta:** nimic în sensul degradării; o cheie `PTERODACTYL_CLIENT_KEY` globală, dacă ar fi completată, ar reintroduce exact BM-AUD-010. **Recomandare explicită: nu completați `PTERODACTYL_CLIENT_KEY`**, ci păstrați puntea, care emite chei per client.

---

### Poarta 2 — Autentificarea plăților în producție este nesigură → 🟠 AMBER

**Dovezi**
- Cod, calea live: `api/src/routes/webhooks.ts:428-439` — în modul live semnătura e verificată cu `stripe.webhooks.constructEvent`, iar **lipsa secretului e o eroare închisă** („The webhook secret is not configured.”), nu o trecere înainte.
- Cod: `api/src/services/stripe.ts:32-42` — poarta de test local (care acceptă evenimente fără semnătură) e **închisă** dacă `NODE_ENV === 'production'` sau dacă `STRIPE_TEST_MODE === 'false'`. În producție: `NODE_ENV=production`, `STRIPE_TEST_MODE=false`.
- Cod: `api/src/env.ts:136` — `paymentsEnabled` cere și `PAYMENTS_ENABLED` **și** o cheie cu prefixul `sk_`.
- **Live:** `POST /api/webhooks/stripe` cu un eveniment falsificat, fără semnătură → `HTTP 200` `{"received":false,"reason":"Stripe is not configured."}` — **evenimentul nu e procesat**. Nicio comandă nu e marcată plătită.
- `api/tests/webhooks.test.ts` — „ignores an event for an unknown order”, „refuses a payment that does not match the order and keeps the event for a replay”.

**De ce nu e GREEN**
1. **Calea live nu a fost executată niciodată.** Nu există un eveniment Stripe real acceptat și unul real refuzat. Codul e corect citit, dar nu dovedit.
2. **Apărarea depinde de egalitatea exactă a unui șir de configurare**: `stripe.ts:40` compară literalul `'production'`. O eroare de tip (`NODE_ENV=prod`) ar **reaperta** poarta de test local, care acceptă evenimente fără semnătură — exact cea descrisă în comentariul propriu al codului ca fiind periculoasă.
3. **Nu există un health-check al secretului de webhook.** Dacă `STRIPE_WEBHOOK_SECRET` ar lipsi în producție după ce `STRIPE_SECRET_KEY` e completat, `readStripeEvent` ar refuza **toate** evenimentele, iar o plată reală ar rămâne neprocesată până la o livrare manuală. Nu există alarmă pentru asta.

**Ce l-ar muta în GREEN:** completarea cheilor Stripe live; un eveniment de test cu semnătură validă acceptat și unul cu semnătură modificată refuzat, pe producție; o verificare de pornire care să refuze pornirea API-ului dacă `NODE_ENV ≠ 'production'` sau dacă `STRIPE_TEST_MODE ≠ 'false'`; și un health-check care să semnaleze lipsa lui `STRIPE_WEBHOOK_SECRET`.

---

### Poarta 3 — O plată reușită poate fi pierdută sau reconciliată greșit → 🟠 AMBER

**Dovezi**
- Idempotență: `api/prisma/schema.prisma:798` — `@@unique([provider, eventId])`; `api/src/routes/webhooks.ts:59-95` (`claimEvent`) — un eveniment repetat e marcat `duplicate` și nu e procesat a doua oară.
- Reluare: `api/src/routes/webhooks.ts:469-473` — un eveniment eșuat rămâne în registru, providerul îl reia, iar `api/src/worker.ts:120-122,169` reia evenimentele eșuate **la fiecare 5 minute**.
- Teste: `api/tests/webhooks.test.ts` — „processes a redelivered event only once”, „records a payment exactly once for a repeated event”, „replays a failed event”, „refuses a payment that does not match the order and keeps the event for a replay”, „marks an order paid and creates exactly one instance”, „creates one subscription per order line”, „provisions one instance per unit of a line”.
- Unicitate: `api/prisma/schema.prisma:502` (`Payment.stripePaymentIntentId`), `:370` (`Order.stripeCheckoutSessionId`).

**De ce nu e GREEN — trei goluri reale**
1. **Rambursarea e înghițită.** `api/src/services/stripe.ts:490-491` — `catch { return false; }`: o eroare Stripe la rambursare dispare. Mai rău, `api/src/services/upgrades.ts:136-139` marchează comanda `FAILED` **înainte** de a cere rambursarea (`:147-152`), iar singura urmă e `meta.refunded = false` în `AuditLog`. **Un client poate rămâne debitor pentru o schimbare care nu i-a fost aplicată**, fără coadă de reluare și fără alarmă. Nu există niciun test automat pentru rambursare.
2. **Nu există reconciliere cu Stripe.** Funcțiile de sincronizare a abonamentului se opresc imediat când Stripe nu e live (`api/src/services/stripe.ts:452,477,497,517`): nu e niciun job care să compare abonamentele din Stripe cu cele locale și să repare o divergență.
3. **Nicio plată nu a existat niciodată în producție:** `Payment`, `Subscription` și `Invoice` au **câte 0 rânduri**. Tot mecanismul de reconciliere e nefolosit.

**Ce l-ar muta în GREEN:** o plată reală urmată de un refuz forțat al panoului la o schimbare de resurse, cu rambursarea verificată în panoul Stripe și `Payment.status = REFUNDED`; un job de reconciliere cu Stripe, cu alertă; o alarmă când o rambursare eșuează.

---

### Poarta 4 — Upgrade-urile de resurse se fac fără plată corespunzătoare → 🟠 AMBER

**Dovezi**
- Cod: `api/src/routes/instances.ts:268-301` — o schimbare cu `priceDelta > 0` creează o comandă `AWAITING_PAYMENT` și **nu atinge instanța** (`createCheckout` la `:297`); `applyUpgradeOrder` e apelat direct **numai** în ramura fără plată (`:278-282`), adică pentru o schimbare care costă mai puțin.
- Cod: `api/src/routes/webhooks.ts:137` — `applyUpgradeOrder` e apelat din handlerul de plată confirmată.
- Teste: `api/tests/upgrades.test.ts` — „quotes a change without touching the instance”, „does not change the instance before the payment”, „applies the change once the payment is confirmed”, „leaves the instance alone when the panel refuses the new limits”, „applies a change that costs less right away”, „refuses a change outside the limits of the product”.

**De ce nu e GREEN:** `applyUpgradeOrder()` (`api/src/services/upgrades.ts:106-119`) **nu verifică plata** (`COMM-03`, P0). E latent doar cât timp singurul apelant neplătit are `total = 0`, dar funcția e o bombă cu ceas pentru orice apel nou. `VERIFIED` pe cod; `INFERRED` pe impact.

**Rezervă declarată:** jumătatea „plată" e dovedită **doar** prin poarta de test local (`api/src/services/stripe.ts:32-42`), inactivă în producție. Porția e corectă și ordinea e impusă de cod; nu e însă probată contra unei plăți reale.

**Ce l-ar întări:** o încercare de upgrade cu Stripe live, care să arate că instanța nu se schimbă până la confirmarea plății.

---

### Poarta 5 — Provisionarea nu este fiabilă pentru un produs vândut → 🔴 RED

**Dovezi**
- **Rata de eșec a joburilor, live:** `ProvisioningJob` are **30 `failed` și 93 `completed`** (SQL read-only, VM 103) — 24% eșec.
- **Jurnalul de audit:** **80** de rânduri `instance.provision_failed` față de **5** `instance.provisioned`, plus **8** de `instance.retry_requested` — reluări cerute explicit, toate pe fondul unor eșecuri (SQL read-only pe `AuditLog`, VM 103; aceeași cifră în `audit/04-pterodactyl-and-provisioning.md:197`).
- **Servere orfane:** panoul are **5 servere**, baza de date are **3 instanțe**. Serverele **8** („Blipmade Port Test”) și **14** („Browser instance”) nu au nicio instanță care să le corespundă. Eșecul de după pasul 14 **nu șterge serverul** (`audit/04-pterodactyl-and-provisioning.md:189`; `deleteServer()` e apelat doar din `api/src/services/billing.ts:83`, la retragerea unui abonament, și doar dacă `auto_delete_cancelled_instances` e `true`).
- **Poarta de capacitate e defectă:** `chooseNode()` compară discul vândut (GB) cu discul nodului raportat de panou (MB) — `api/src/services/provisioning.ts:214`. Eroarea de 1024× face ca limita de disc să nu lege niciodată (`audit/04-pterodactyl-and-provisioning.md` §1.3, `VERIFIED`).
- **Nu există coadă de morți:** `api/src/worker.ts:95-99` curăță joburile `failed` din coadă; singura urmă e tabelul `ProvisioningJob`, fără alarmă și fără reluare automată.
- **Acordul dintre documente e în conflict:** `docs/PRODUCTION_READINESS.md:20` prezintă provisionarea ca un flux care „așteaptă instalarea, pornește containerul și verifică aplicația înainte să spună online” — ceea ce e **adevărat ca cod**, dar nu e spus nimic despre rata de eșec de 24% și nici despre serverele orfane.
- Teste: `api/tests/provisioning.test.ts` — „does not create a second server when it is retried”, „does not reinstall a server after a crash between the install and the start”, „refuses a second run while another run holds the instance”, „records the failure and does not activate the instance”, „names the missing client key when the container cannot be started”.

**Ce l-ar muta în GREEN:** o rulare completă, repetată, a lanțului comandă → plată → provisionare → activare, cu rata de succes 100% pe cel puțin 20 de rulări consecutive și cu marcarea fiecărui pas; ștergerea serverelor orfane 8 și 14 și a oricăror clienți de panou rămași; corectarea unității la `api/src/services/provisioning.ts:214` și o poartă de capacitate care se declanșează efectiv; o coadă de morți sau o alarmă la un job eșuat.

---

### Poarta 6 — O reîncercare obișnuită poate distruge date de client → 🟠 AMBER

**Dovezi — partea care funcționează**
- Garda de reinstalare: `api/src/services/provisioning.ts:527-545` — starea `installed` a serverului se **recitește la fiecare rulare**, iar un server deja instalat nu e reinstalat; comentariul spune explicit că panoul șterge fișierele la reinstalare.
- Test: `api/tests/provisioning.test.ts` — „does not reinstall a server after a crash between the install and the start”.
- Reconcilierea nu reintră în gol: `api/src/services/provisioning.ts:691-707` reia doar instanțele în `PROVISIONING`/`PENDING` cu lock vechi; `api/src/worker.ts:165` o rulează la fiecare 60 s.
- Reinstalarea manuală, de către client, e **explicită și urmărită**: `api/src/routes/instance-server.ts:1049-1051` cere `confirm: true` și scrie un eveniment („The files of the container were erased.”) plus o intrare de audit. Nu e o „reîncercare obișnuită”.

**De ce nu e GREEN**
1. **Nu există nicio copie a datelor clientului în afara nodului.** `audit/03-disaster-recovery.md` §2: pentru VM 101 (noda Wings) — „Ce se pierde dacă pica azi: toate fișierele clienților… Ce este copiat acum: Nimic (`feature_limits.backups = 0` pe toate cele 5 servere)”. Confirmat live: toate cele 5 servere au `feature_limits.backups = 0`.
2. **Singurele arhive de backup sunt pe același RAID 0** (`/var/backups/blipmade`, două arhive de drill, neschedulate) — vezi poarta 9.
3. **Un reinstall poate veni pe calea greșită**: garda se bazează pe `container.installed === 1` raportat de panou. Dacă panoul raportează `installed = 0` pentru un server care conține date de client (de exemplu după o repunere manuală în panou), platforma va apela `reinstallServer` și va șterge conținutul.
4. **Cheia de execuție a drill-ului de restaurare poate fi suprascrisă**: `scripts/restore-drill.sh:15` citește `SCRATCH_DB` din mediu, iar `:47` face `DROP DATABASE IF EXISTS "$SCRATCH_DB"`. Cu `SCRATCH_DB=blipmade` setat, drill-ul șterge baza de date vie. E un pas de operator, nu o reîncercare — dar e o capcană într-un script care distruge date.

**Ce l-ar muta în GREEN:** o copie a datelor clientului în afara nodului (poarta 9) plus o poartă explicită înaintea oricărui reinstall; un test care dovedește că o instanță cu fișiere, marcată greșit ca neinstalată, nu e reinstalată; `SCRATCH_DB` blocat la valoarea fixă, cu o verificare explicită că baza țintă nu e cea vie.

---

### Poarta 7 — Se vinde un produs fără un runtime verificat funcțional → 🔴 RED

**Dovezi**
- **4 din 5 produse au preț și nu au runtime.** `wordpress`, `code-server`, `uptime-kuma`, `postgresql` au `eggId` NULL, `dockerImage` gol, `startup` `{}`, toate `deployable=false` — dar toate sunt `visible=true` și **au preț activ**, afișat public: 149 / 299 / 149 / 449 unități minori pe lună (€1.49 / €2.99 / €1.49 / €4.49) (`audit/04-product-certification.md` §3.2–3.5; live, `GET /api/catalog/products`).
- **Al cincilea produs nu are un runtime verificat.** `discord-bot` are ou real (egg 15 „node.js generic”), server real și lanț complet de provisionare — dar:
  - **Baza de date platformei spune `ONLINE`, panoul spune că nu rulează.** Pentru instanța `cmvkbgm9h0001r18096ep5jzl`, cu `status = ONLINE` și `provisionStep = activated` în baza de date și un eveniment „Instance is online.” în jurnal:
    ```
    GET /api/instances/cmvkbgm9h0001r18096ep5jzl/server
      -> {"server":{"state":"","features":[],"limits":{"memory":512,"disk":5120,"cpu":100}}}
    GET /api/instances/cmvkbgm9h0001r18096ep5jzl/resources
      -> {"resources":{"state":"offline","cpu_absolute":0,"memory_bytes":0,"uptime":0,"disk":{"used":8814}}}
    ```
  - Citirea directă de pe panou, pentru **toate cele 5 servere** (Application API, read-only): `installed = 1`, **`state = None`**, `feature_limits: databases=0, backups=0, allocations=0`. Niciun server nu raportează o stare de container.
  - Produsul e un **container gol**: `startup` este `npm run start` cu `MAIN_FILE=index.js`, dar nu există `package.json`/`index.js` (`audit/04-product-certification.md` §3.1).
  - `GET /api/instances/<id>/databases` → `{"databases":[]}` și `/backups` → `{"backups":[]}`: interfața arată „fără baze de date”, nu o eroare — deci cliențul nu află niciodată că funcția nu e disponibilă.
- **Niciun produs nu poate fi cumpărat azi**: `POST /api/orders/:id/checkout` → `HTTP 503 payments_unavailable` (live, comanda `BM-00002`). `audit/04-product-certification.md` §3.6: **0 din 5** produse pot fi cumpărate și livrate end-to-end.

**Ce l-ar muta în GREEN:** ascunderea prețului și a cardului pentru cele 4 produse fără runtime (sau implementarea lor); un container pornit, cu aplicația produsului în interior, care răspunde pe portul propriu — verificat de pe nod, nu doar din baza de date; iar panoul trebuie să raporteze o stare de container, nu `None`/`offline`.

---

### Poarta 8 — Secretele critice sunt expuse → 🟠 AMBER

**Dovezi — nu am găsit expunere**
- `/opt/blipmade/.env` este `-rw-------` (0600), proprietar `debian`; verificat pe VM 103.
- **Nicio valoare secretă de producție nu apare în istoricul git public.** Repo-ul este public (`https://github.com/trencito42/blipmade-hosting` → HTTP 200 fără autentificare). Am comparat, prin hash, fiecare valoare secretă din `.env` (`POSTGRES_PASSWORD`, `SESSION_SECRET`, `ADMIN_PASSWORD`) cu fiecare apariție din `git log -p --all`: **NICIUNA nu se potrivește**. Singurele valori literale din istoric sunt `Pr0be-Passw0rd-x9` (parola unui cont de probă sintetic, `blipmade-probe@example.test`, în `scripts/ops/probe-panel-token-mint.mjs`) și `CorrectHorseBattery9` (o constantă de test). Nu există `.env` urmărit în git (`git ls-files` nu returnează niciun fișier de secret).
- Jurnalele API: nicio urmă de `sk_live`, `whsec_` sau cheie privată în ultimele 2000 de linii.
- Token-urile de e-mail nu ajung niciodată în fișier sau log: `api/tests/email-delivery.test.ts` — „keeps the token out of the file it writes”, „keeps the token out of the log lines”, „keeps the token out of the log lines of a reset”, „never writes the token down, only its hash”, „removes the token from a link”.
- Cheia de aplicație a panoului nu părăsește serverul: `api/src/services/pterodactyl/application.ts` e folosită numai server-side; cheia de client e stocată criptată în `PanelCredential.tokenEnc`.
- Audit: BM-AUD-009 („credential în cod hardcodat într-un repository public”) este marcat **Fixed** în `docs/AUDIT_REMEDIATION.md:29`.

**De ce nu e GREEN**
1. **Panoul și nodul nu au fost inspectate** (`BLOCKED`): internele VM 100 și VM 101 nu sunt accesibile pentru contul operatorului. Nu se poate afirma că *întregul* estate e lipsit de expunere.
2. **Patru conturi `root_admin` pe panou** sunt încă de redus — `docs/PRODUCTION_READINESS.md:118-119` le listează ca cerință înainte de lansare.
3. **Rotirea `SESSION_SECRET` face ilizibilă parola panoului clientului** (`docs/PRODUCTION_READINESS.md:120-122`), pentru că e derivată din același secret. Nu există o cale de resetare a parolei de panou; o rotire devine o blocare.
4. **Transportul de e-mail în fișier nu are retenție**: 4270 de fișiere, 23 MB, în `/var/backups/blipmade/mail` — directorul care e și ținta arhivelor de backup. Adresele clienților și conținutul mesajelor ajung în arhive. Directorul e protejat de părintele `drwxr-x---`, deci nu e o expunere, dar e o retenție necontrolată.

**Ce l-ar muta în GREEN:** inspecția internelor panoului și a nodului; reducerea conturilor `root_admin`; o cale de resetare a parolei de panou înainte de orice rotire a secretului; o retenție (curăță) pe transportul de e-mail în fișier.

---

### Poarta 9 — Nu există strategie de recuperare în afara hostului → 🔴 RED

**Dovezi**
- `OFFSITE_TARGET` și `OFFSITE_ENCRYPTION_KEY` **nu există** în `/opt/blipmade/.env` (lista completă a cheilor citită pe VM 103). `scripts/backup-offsite.sh` există și refuză să ruleze fără cheie — deci nu e executat.
- `audit/03-disaster-recovery.md` §1: „**Nu există o singură copie, în afara tabloului RAID 0, a vreunei date de client.** Nu există țintă de backup configurată, nu există backup programat, backup-ul Pterodactyl este dezactivat per server, iar singurele arhive existente sunt pe același disc cu datele pe care le protejează.”
- Verificat independent: `pvesh get /cluster/backup` → `[]`; `/etc/pve/vzdump.cron` conține doar `PATH=`; `/var/lib/vz/dump/` e gol; `crontab -l` pe host → „no crontab for root”; `systemctl list-timers` → niciun timer de backup. Toate cele trei tablouri `md` sunt `raid0` (`audit/03-disaster-recovery.md` §3.1, `VERIFIED`).
- **Live:** `/var/backups/blipmade` conține doar două arhive de drill din 2026-10-22 (`blipmade-drill-20261022T212029Z.tar.gz` și `…T232117Z.tar.gz`), **neschedulate**, pe același RAID 0.
- **Datele clienților de pe nod nu au nicio copie:** `feature_limits.backups = 0` pe toate cele 5 servere (citit live de pe panou).
- `docs/PRODUCTION_READINESS.md:23` spune „Backups | Works.” — în timp ce `:102-106` spune „A local copy on a RAID 0 host is not a backup.” Cele două afirmații din același document nu sunt compatibile (vezi §4).

**Ce l-ar muta în GREEN:** `OFFSITE_TARGET` și `OFFSITE_ENCRYPTION_KEY` setate, un job programat de backup, o arhivă descărcată în afara hostului și **un drill de restaurare executat pe acea copie**, plus backup-uri Pterodactyl activate per server pentru datele clienților.

---

### Poarta 10 — Checkoutul afișează prețuri material greșite → 🟠 AMBER

**Dovezi**
- Prețul e **server-side**: `api/src/services/pricing.ts:39-53` calculează `base + RAM_GB×60 + CPU×40 + disc_GB×2`, din `ProductPrice` activ (`pricing.ts:69-77`). Clientul nu trimite prețul.
- `api/tests/pricing.test.ts` — „charges the base amount for the minimum configuration”, „charges extra memory, cpu and storage above the minimum”, „keeps every amount an integer number of minor units”, „rejects a configuration below the product minimum”, „rejects a configuration above the product maximum”, „adds paid options to the total”, „applies a percentage promotion”, „reports an unknown promotion without failing the quote”, „has no promotion at all when no code was typed”, „refuses to quote a product that is not deployable”.
- `api/tests/catalog.test.ts` — „returns every amount as an integer number of cents”, „shows a product without a price as a null price”.
- Linia de comandă a checkoutului preia **prețul server-side al comenzii**, nu unul din browser: `api/tests/stripe-origin.test.ts` — „keeps the line items and the metadata of the order”, „creates an order with a server-side price” (`api/tests/webhooks.test.ts`).
- **Live:** `GET /api/catalog/products` → 149 / 299 / 149 / 149 / 449 unități minori (€1.49 / €2.99 / €1.49 / €1.49 / €4.49), `EUR/MONTHLY`, identice cu `ProductPrice` din bază de date. `api/tests/pricing.test.ts` confirmă că suma e rotunjită la sutimi.
- Live: promoțiile **nu sunt consumate înainte de plată** (`webhooks.test.ts` — „does not consume a promotion before the payment”).

**De ce nu e GREEN:** mecanismul de **calcul** e corect (255/255 cote cu corespuns formulei), dar **totalul afișat ≠ totalul încasat**. `COMM-01` (= `PROMO-01`, P0) face ca o comandă cu reducere să fie taxată cu suma **neredusă** — `stripe.ts:175` trimite `item.unitAmount` nerediscountuit, `order.total` e discountuit, iar `verifyAmount` (`webhooks.ts:192`) respinge comanda. `PRICE-03` (P0): prețul public nu spune unitatea (`price.amount = 149` = €1.49).

**Rezervă declarată:** ecranul de checkout nu a fost randat niciodată cu o sumă, pentru că `POST /api/orders/:id/checkout` răspunde `503`. Verificarea e despre **calculul** prețului, nu despre afișaj. **Observație conexă, tratată la poarta 7:** prețul afișat pentru 4 produse fără runtime nu e greșit ca sumă, dar promite un lucru care nu poate fi livrat.

**Ce l-ar muta în GREEN:** randarea checkoutului cu o sumă, după ce plățile se deschid.

---

### Poarta 11 — Anularea sau reînnoirea este material incorectă → 🟠 AMBER

**Dovezi**
- `api/tests/billing.test.ts` — „renews a service whose period ended and writes the invoice”, „leaves a service alone while its period is still running”, „withdraws a service whose paid period ended after a cancellation”, „suspends a service whose payment is overdue”, „releases the reservation of an order that was never paid”.
- `api/tests/webhooks.test.ts` — „does not let a customer cancel a paid order” (anularea nu e o comandă nouă).
- Cod: `api/src/services/stripe.ts:496-503` — anularea șterge **doar** articolul abonamentului, cu `proration_behavior: 'create_prorations'`, ca restul să continue să ruleze până la sfârșitul perioadei plătite.
- Baleierea rulează la fiecare 15 minute (`api/src/worker.ts:168`).

**De ce nu e GREEN**
1. **Tot mecanismul Stripe nu a fost executat niciodată.** `cancelSubscription()` și facturarea de reînnoire apelează API-ul Stripe; în producție (fără cheie) aceste ramuri nu se execută niciodată — `Subscription` are **0 rânduri**.
2. **Anularea nu e legată de o rambursare prevăzută.** `refundPayment()` (poarta 3) e înghițită la eroare, iar `Subscription.status` e singurul indicator local.
3. **Suspendarea pentru plată întârziată** se bazează pe baleierea de 15 minute — o granularitate grosieră, pentru care nu există măsurătoare în test.

**Ce l-ar muta în GREEN:** un abonament real, cu o reînnoire și o anulare executate contra Stripe live, cu verificarea facturii și a perioadei plătite în panoul Stripe.

---

### Poarta 12 — Funcțiile de bază ale clientului sunt indisponibile → 🔴 RED

**Dovezi — ce funcționează**
- Panoul clientului: **191 de verificări de browser, 0 probleme** pe domeniul public — rutarea cu și fără sesiune, setările (profil, sesiuni, preferințe, salvarea numelui), deschiderea unui ticket, pagina de facturare, fonturile, 5 lățimi × 9 rute, plus 2 lățimi × 4 rute de personal.
- Telefon: **60 de verificări** (client) și **240** (personal), 0 probleme.
- Teste: `api/tests/instance-operations.test.ts` — „shows the usage of the server”, „lists the files with the key of the customer”, „lists the backups and the databases”; `api/tests/pterodactyl-client.test.ts` — „reads the resource usage from the attributes”, „lists the files through the list endpoint”, „writes a file with the raw content as the body”.

**Dovezi — ce nu funcționează**
1. **Bazele de date, backup-urile și alocările sunt absente prin configurație, pe toate cele 5 servere.** Citit live de pe panou: `feature_limits: databases=0, backups=0, allocations=0`. Platforma trimite chiar `feature_limits: { databases: 0, backups: 0 }` la provisionare (`api/src/services/provisioning.ts:481`). Live, interfața răspunde `200` cu `{"databases":[]}` și `{"backups":[]}` — deci clientul vede „fără baze de date”, nu o eroare, și nu află niciodată că funcția nu există.
2. **Containerul nu rulează** (poarta 7): panoul raportează `state = None` pe toate cele 5 servere; API-ul de client raportează `state: "offline"`, `uptime: 0`, `memory_bytes: 0` pentru instanța marcată `ONLINE` în baza de date. Interfața arată „Online”, panoul spune „offline”.
3. **Checkoutul e indisponibil**: `503 payments_unavailable` (live).
4. **Resetarea parolei nu poate funcționa pentru un client real**: transportul de e-mail e în fișier (`mail: "file"`, `configured: false`), deci niciun client nu primește niciodată linkul de resetare.
5. **Consola și planificările nu au fost verificate live** (`CTL-01`, `CTL-07` — `NOT-EXECUTED`), iar internele nodului sunt inaccesibile de aici.

**Ce l-ar muta în GREEN:** un server care rulează efectiv, cu `feature_limits` realiste pentru produsul vândut, un consumator de e-mail real și un checkout funcțional; apoi o parcurgere completă, pe telefon, a fluxurilor de client cu o instanță reală pornită.

---

### Poarta 13 — Securitatea infrastructurii critice nu a fost verificată → 🔴 RED

**Dovezi**
- **Hipervisorul nu are firewall:** `pve-firewall status` → „disabled/running”; `nft list ruleset` → gol; `iptables` legacy cu `filter/INPUT: policy ACCEPT`, `filter/FORWARD: policy ACCEPT`, `filter/OUTPUT: policy ACCEPT` (`audit/03-infrastructure.md` §8.1, `VERIFIED`).
- **VM 102 (gateway) nu are firewall:** `iptables -S` → `-P INPUT ACCEPT / -P FORWARD ACCEPT / -P OUTPUT ACCEPT`, fără nicio regulă; `nft` și `ufw` neinstalate (§8.2).
- **VM 103 (platforma) nu are firewall de gazdă:** `-P INPUT ACCEPT`, `-P FORWARD DROP` cu lanțurile `DOCKER-*`; `ufw` neinstalat (§8.3).
- **VM 100 (panoul) și VM 101 (noda) nu au fost inspectate** — `BLOCKED`, internele inaccesibile (§8.4).
- **Regulile de DNAT publică serviciile de administrare:** VM 101 expune `8080` (Wings) și `2022` (SFTP) pe `193.34.214.87`, VM 100 expune `80`/`443` pe `193.34.214.86`, fără restricție de sursă vizibilă (§8.4). **Verificat din rețeaua de audit:** aceste porturi **nu** au răspuns, deci publicitatea lor nu e confirmată din exterior — dar regulile sunt prezente pe hipervisor, iar *ce le ascunde* nu a putut fi verificat, pentru că interiorul nodului e inaccesibil.
- **Puntea e un punct unic de eșec, dependentă de versiune:** `panel-bridge/BlipmadeKeyMintController.php:110` folosește `$user->createToken(self::MEMO, $ips)`, semnătură care există în Pterodactyl 1.11+; pe un panou mai vechi, răspunsul e `500` → `mintViaBridge()` aruncă 503 → **mori toată suprafața de client** (consolă, fișiere, power, backupe, baze de date). Nu există niciun mecanism de detectare a versiunii (`audit/04-pterodactyl-and-provisioning.md` §6.3).
- **Cheia client a panoului e stocată criptată cu o cheie derivată din `SESSION_SECRET`** — o rotire a secretului face ilizibile toate cheile clienților (`docs/PRODUCTION_READINESS.md:120-122`).

**Ce l-ar muta în GREEN:** un audit al internelor VM 100 și VM 101; o postură de firewall efectivă (cel puțin pe hipervisor și pe VM 102/103); confirmarea că porturile de administrare ale nodului și panoului nu sunt publicate public; un health-check al punții care să detecteze forma răspunsului și o procedură de test la o actualizare de panou.

---

## 3. Verdictul go / no-go

> ### ❌ **NO-GO** pentru o lansare comercială controlată.
>
> **Cinci porți sunt RED** (5 — fiabilitatea provisionării, 7 — produs vândut fără runtime verificat, 9 — lipsa recuperării în afara hostului, 12 — funcții de bază indisponibile, 13 — securitatea infrastructurii critice neverificată). Conform regulii din brief, **o singură poartă RED blochează lansarea**.

**De ce verdictul nu poate fi înmuițat prin adăugarea cheilor lipsă.** În acest moment platforma **nu poate lua nicio plată**, fiindcă `STRIPE_SECRET_KEY` e gol și `PAYMENTS_ENABLED=false`. Dar tocmai de aceea **nu se poate lansa doar cu cheile**: deschiderea plăților ar expune comercial un produs al cărui container nu rulează (panoul: `state = None` pe toate cele 5 servere), cu bazele de date, backup-urile și alocările dezactivate prin configurație, cu provisionarea eșuată în 24% din joburi, fără nicio copie a datelor clienților în afara nodului și fără backup programat. **Adăugarea cheii Stripe ar transforma o platformă care nu poate lua plată într-una care ia plată pentru un serviciu care nu rulează.** Cheile lipsă sunt necesare, dar nu sunt suficiente.

**Ce funcționează și e dovedit** (nu e totul prost, și merită spus): izolarea dintre clienți (`GREEN`), disciplina prețurilor și a comenzilor înainte de plată (`GREEN`), paritatea dintre preț și banul real, idempotența webhook-ului, garda de reinstalare, structura semantică și navigarea cu tastatura, 553 de verificări de browser verzi și 240 de teste automate verzi.

**Condițiile care ar schimba verdictul în NO-GO → GO** (toate, nu un subset):

| # | Condiție | Poarta |
|---:|---|---:|
| 1 | Cheile Stripe live + `PAYMENTS_ENABLED=true`; un checkout real cu o plată reală, un webhook real acceptat și unul falsificat refuzat; o alarmă la lipsa secretului de webhook | 2, 3 |
| 2 | Cheia `SMTP_URL` reală; un e-mail de verificare și unul de resetare **livrate**; notificări livrate către client și către suport | 3, 12 |
| 3 | `OFFSITE_TARGET` + `OFFSITE_ENCRYPTION_KEY` setate, backup programat, o copie în afara hostului și **un drill de restaurare pe acea copie**; backup-uri Pterodactyl activate per server | 9, 6 |
| 4 | Un container care rulează efectiv, cu aplicația produsului în interior, verificat **de pe nod**; panoul raportează o stare, nu `None`/`offline` | 7, 12 |
| 5 | Prețul și cardul ascunse pentru cele 4 produse fără egg; `feature_limits` realiste pentru produsul vândut | 7, 12 |
| 6 | 20 de rulări consecutive comandă → plată → provisionare → activare, toate reușite; serverele orfane șterse; poarta de capacitate a discului corectată; alarmă la job eșuat | 5 |
| 7 | Rambursarea nu mai e înghițită (alarmă + reluare); un job de reconciliere cu Stripe | 3 |
| 8 | Auditul internelor panoului și nodului; firewall efectiv pe hipervisor, VM 102 și VM 103; confirmarea că porturile de administrare nu sunt publice; un health-check al punții | 13 |
| 9 | Rotirea parolei de panou a clientului, cu o cale de resetare, înainte de orice rotire a `SESSION_SECRET`; reducerea conturilor `root_admin`; retenție pe transportul de e-mail în fișier | 8 |

**O notă de proces, pentru că afectează încrederea în cifre:** `scripts/ops/browser-customer-panel.mjs` nu poate rula complet pe producție — face 12 autentificări, iar limita e 10 la 15 minute. Verificările din acest raport au fost făcute cu o variantă cu sesiune reutilizată, cu toate verificările identice. Instrumentul trebuie reparat înainte de a-l folosi ca poartă într-o procedură de lansare.

---

## 4. Verificarea afirmațiilor din `docs/PRODUCTION_READINESS.md`, poartă cu poartă

### 4.1 Porți în care documentul este **mai optimist** decât dovezile susțin

| # | Afirmația din document | Ce susține documentul | Ce arată dovezile | Poarta |
|---:|---|---|---|---:|
| 1 | `:17` „Customer area and admin panel \| **Ready.** Every screen renders real data, with loading, empty, error and populated states.” | Fiecare ecran desenează date reale | Ecrane desenează, dar **bazele de date, backup-urile și alocările sunt goale prin configurație** pe toate cele 5 servere (`feature_limits: databases=0, backups=0, allocations=0`), iar ecranul arată „fără baze de date” în loc de o eroare; runtime-ul e `offline` pe panou | 7, 12 |
| 2 | `:20` „Hosting (Pterodactyl) \| The node publishes its ports. The provisioning now waits for the install, starts the container and verifies the application before it says online.” | Fluxul de provisionare e corect | Corect **ca cod**, dar **30 joburi `failed` din 123**, 80 `instance.provision_failed` vs 5 `instance.provisioned`, **5 servere pe panou vs 3 instanțe** (orfane 8 și 14) și o poartă de capacitate a discului defectă de 1024×. Documentul nu menționează niciunul | 5, 7 |
| 3 | `:23` „Backups \| **Works.** The off-host copy is implemented but the destination is not set.” | Backup-urile funcționează | Nu există **niciun** backup programat (`pvesh get /cluster/backup` → `[]`, `vzdump.cron` gol, niciun timer), doar două arhive de drill neschedulate pe același RAID 0. **Documentul se contrazice cu propriul punct 5** (`:102-106`: „A local copy on a RAID 0 host is not a backup”) | 9 |
| 4 | `:15` „Application code \| **Ready.**” | Codul e gata de lansare | Codul are un gol de accesibilitate (`ACC-05`: 18 elemente păstrează tranziția de 0,2 s în modul redus), un inel de înghițire în `refundPayment` și două scripturi de operare cu ortografie inversată a mesajelor și o listă de rute învechită | 3, 5, 8 |
| 5 | `:45-48` „**Backup and restore** — `scripts/backup.sh` produced a verified archive; `scripts/restore-drill.sh` restored it… 26 tables, 1 user, 5 products and 3 migrations matched exactly.” | Backup-ul e validat | Drill-ul a fost o rulare **manuală unică, din 2026-10-22**, pe o copie locală. Nu există programare, nu există copie externă, iar datele clienților de pe nod nu intră în backup deloc | 9, 6 |
| 6 | `:153-156` „The test data that the verification runs created was removed afterwards: eight test servers, ten test panel accounts, eight test orders, eight test instances, eight test subscriptions and eight test products.” | Curățarea a fost făcută | **Nu**: `AuditLog` arată 8 `order.paid`, 8 `instance.retry_requested` și 5 `instance.provisioned`, deci datele existau și au fost plătite; dar panoul are încă **5 servere** (8 și 14 orfane, fără instanță), baza de date **3 instanțe**, **5 comenzi** și **13 ticket-uri deschise**. Ce s-a șters a fost `Payment`/`Subscription`/`Invoice` (câte 0 rânduri) | 5, 12 |
| 7 | `:112` „Required before go-live: 2. Add the **Stripe test keys**, run a real checkout and confirm the webhook.” | Cheile de test sunt suficiente pentru lansare | `paymentsEnabled` cere o cheie cu prefix `sk_` și `PAYMENTS_ENABLED=true` (`api/src/env.ts:136`); cheile de test nu deschid o plată reală | 2, 3 |
| 8 | `:110` „Required before go-live: 1. **Add `PTERODACTYL_CLIENT_KEY`** and run one provisioning job end to end…” | Completarea cheii globale e pasul 1 | **Instrucțiunea e depășită și, urmată, ar înrăutăți izolarea**: cheia globală ar re Introduce BM-AUD-010 (cheie de client cu arie globală). Puntea (`PANEL_KEYMINT_URL` + `PANEL_KEYMINT_SECRET`) emite deja chei per client — 3 rânduri `PanelCredential` cu `source='bridge'`, `/api/health` → `panelKeyBridge: "configured"` | 1, 5 |

### 4.2 Porți în care documentul este **mai pesimist** decât dovezile susțin (deriva în sens opus, raportată pentru corectitudine)

| Afirmația din document | Ce arată dovezile |
|---|---|
| `:21`, `:69-81` „Customer power control, files, console \| **Blocked** by the missing client API key”, „`PTERODACTYL_CLIENT_KEY` is empty… It also blocks the console relay and the customer facing power control, file manager and metrics.” | **Nu mai e adevărat.** Puntea emite chei per client (`PanelCredential`, 3 rânduri, `source='bridge'`, `lastUsedAt` recent); `/api/health` → `panelKeyBridge: "configured"`; live, `GET /api/instances/<id>/files` → `200` cu lista reală de fișiere, `/resources` → `200`, `/server` → `200`. Doar consola rămâne neexercitată |
| `:79-81` „The panel login currently answers `500 TypeError` for every account, so the key cannot be issued from here.” | **Depășit.** Cheia este emisă de aici, prin punte; `api/src/services/panel/credentials.ts` e funcțional (`lastUsedAt` recent) |
| `:29` „`bash scripts/run-tests.sh` on VM 103: **11 files, 119 tests**, all passing.” | Numărul real e **240 de teste în 24 de fișiere** (219 API în 22 fișiere + 21 web în 3 fișiere). Documentul subestimează acoperirea |
| `:49-50` „Responsive rendering — **30 screenshots** at 390 px and 1440 px” | Sunt **553 de verificări de browser** verzi acum (191 pe panou + 60 telefon client + 240 telefon personal + 62 structură). Documentul subestimează |

### 4.3 Afirmații din document **pe care acest audit nu le-a reverificat**

Nu le-am marcat nici verificate, nici false: `prisma migrate deploy` / `prisma migrate diff` fără diferențe (`:33-36`), „the build is clean" (`:27-28`), protecția conturilor `root_admin` (`:118-119`), paritatea cuvântului de recuperare al parolei de panou (`:120-122`). Sunt în afara scopului acestui audit (calitate și porți de lansare) și rămân **neverificate de aici**, nu confirmate.

### 4.4 Ce e corect în `docs/PRODUCTION_READINESS.md`

Verdictul general al documentului („**The platform is not ready to take paying customers**”, `:7-11`) e **confirmat** de acest audit. Următoarele afirmații sunt verificate și corecte: limitarea suitei la baza `_test` și refuzul de a rula altfel (`:30-32`); containerele sănătoase (`:37`, confirmat de `docker ps`); porturile publicate de nod (`:52-65`); prețurile server-side și banul în sutimi (`:146`); limitarea ratelor pe login, înregistrare, resetare, cote și comenzi (`:144-145`, confirmată în `api/src/routes/`); hash-urile scrypt și sesiunile în Postgres cu doar hash-ul tokenului (`:140-141`); CSRF cu dublu submit (`:142-143`); `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `SMTP_URL`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` goale (`:83-100`, confirmat pe VM 103); `OFFSITE_TARGET` nesetat (`:104`); existența `scripts/backup-offsite.sh` cu refuzul de a rula fără cheie (`:104-105`).

---

## 5. Limitările acestui verdict

1. **Nu am executat nicio plată și nicio comandă**, deci verdictul se bazează pe cod, pe starea live a bazei de date, pe starea live a panoului și pe verificările de browser. Nu am „testat o plată reușită" și nici nu am simulat una.
2. **Panoul și nodul nu au fost inspectate la interior** (`BLOCKED`) — aceasta e chiar poarta 13, dar și o limită a restului verdictului.
3. **Securitatea infrastructurii critice e evaluată prin configurația hypervisorului și a VM-urilor accesibile**, nu prin scanare; nu am făcut niciun test de penetrare și nu am încercat nicio escaladare.
4. **Verificările de browser au fost făcute cu o variantă cu sesiune reutilizată**, din cauza limitei de 10 autentificări; verificările, pașii și măsurătorile sunt identice cu cele din scriptul din repository.
5. **Starea „offline" a containerului a fost citită prin API-ul de client al platformei** (care e ceea ce arată și interfața) și prin Application API a panoului (`state = None` pe toate cele 5 servere). Confirmarea de pe nod (VM 101) n-a fost posibilă; e tocmai motivul pentru care rândul e înregistrat ca RED și nu ca „doar neclar".
