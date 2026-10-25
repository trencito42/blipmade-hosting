# Raport de pregătire pentru lansare — runda a treia, faza găzduirii de e-mail și faza comercială a e-mailului

* **Data:** 2026-10-25
* **Ramură:** `feature/email-commerce`, întemeiată pe `feature/mail-hosting` = `6903a04`, care întemeiată pe `fix/audit-round3` = `3bad854`, care întemeiată pe `origin/main` = `106809c`. **Niciun merge în `main`, niciun deploy în producție.**
* **Gazdă:** `debian@10.77.0.13` (VM 103). Producția a fost neatinsă: arborele este la `106809c`, cele 5 containere sunt healthy, Postgres și Redis nu au fost repornite, `stripe: not_configured`, `PAYMENTS_ENABLED=false`.
* **Mașina nouă a e-mailului:** VM 104 `blipmade-mail` (`10.77.0.14`), Debian 13, 4 vCPU, 12 GB, 120 GB, cu Mailcow `55982ac` în 18 containere. A fost creată pe hipervizor și este singura mașină nouă adusă în scenariu.
* **Ce s-a măsurat:** 694 teste API (70 fișiere) + 180 teste web, toate verzi; `tsc` curat pentru API (sursă și teste); suita web verde.
* **Dovezile complete:** `audit/round3/DATA-SAFETY-EVIDENCE.md`, `audit/round3/SMTP-EVIDENCE.md`, `audit/round3/BACKUP-EVIDENCE.md`, `audit/round3/CADDY-EVIDENCE.md`, `audit/mail/MAIL-HOSTING-REPORT.md`, `docs/MAIL_HOSTING.md`, `audit/12-FULL-FINDINGS-REGISTER.md`.

---

## 0. Verdictul

**NO-GO pentru lansare comercială.** Nu declar GO.

Cinci lucruri nu au dovezi suficiente, iar patru dintre ele nu se pot închide fără operator:

1. **Plățile nu sunt dovedite cu un furnizor real.** Codul e reparat și testat cu o poartă locală, dar nu există nicio cheie Stripe, nici în producție, nici local. Semnătura webhook-ului nu a fost verificată contra Stripe.
2. **Restaurarea în afara gazdei nu există.** Gazda rulează RAID 0, iar backupul rămâne pe ea. `scripts/backup-offsite.sh` eșuează vizibil (cod 3) și cere o țintă care nu e configurată.
3. **Nodul nu confirmă niciodată că un container servește.** Cele trei instanțe vii sunt raportate `starting` de 2h35m, respectiv 24m. Platforma poate spune acum „containerul e viu, dar nodul nu confirmă"; nu poate spune „serviciul funcționează".
4. **Niciun e-mail nu ajunge la un client.** Calea a fost construită și măsurată cap la cap pe o mașină reală (Mailcow, VM 104): platforma trimite, serverul semnează cu DKIM și livrează, mesajul e citit înapoi prin IMAP. Ce lipsește e **activarea în producție**: `SMTP_URL` e gol, iar cheia DKIM a lui `blipmade.com` nu e publicată în DNS — o semnătură care nu poate fi verificată e mai rea decât o lipsă de semnătură.
5. **Platforma nu are o adresă publică.** Edge-ul `10.77.0.12` nu e configurat și `DOMAIN_BASE` e gol.

Pentru găzduirea de e-mail, încă trei lucruri sunt deschise și toate trei sunt ale operatorului: adresa publică dedicată a e-mailului, `PTR` pentru ea și numele `mail.blipmade.com` în DNS. Detaliile, cu variabila exactă, locul și verificarea, sunt în `docs/MAIL_HOSTING.md`.

**Faza comercială a e-mailului** (ramura `feature/email-commerce`) nu schimbă verdictul, ci adaugă un blocaj nou, tot al operatorului: **vânzarea e-mailului este închisă și nu poate fi deschisă înainte de dovezi**. Planurile există, cu limitele lor, sunt vizibile în vitrină și nu sunt cumpărate. Ca să fie deschisă vânzarea, trebuie să se întâmple, în această ordine: `mail.blipmade.com` în DNS și certificatul cu `SAN`; cheile Stripe și o plată de probă cu eveniment real; prețurile finale ale planurilor; copia de rezervă în afara mașinii cu drill de restaurare; și abia apoi `MAIL_SALES_ENABLED=true`. Până atunci, comanda unui plan de e-mail e refuzată **în cuvinte**, în catalog, în cotă și la comandă. Detaliile, cu variabila exactă, locul, formatul și verificarea, sunt în 3.9 și în `docs/MAIL_HOSTING.md` §7.

În plus: consola Proxmox, `rpcbind` și `root` cu parolă sunt expuse public (`SEC-01`, `SEC-02`, `SEC-28`), iar 147 de constatări din registru nu au fost începute.

---

## 1. Blocul 1 — Rezolvate și verificate, cu dovezi

Toate de mai jos sunt în ramura `fix/audit-round3`, cu test de regresie în suita care rulează în CI.

| # | Ce era defect | Repararea | Dovezi |
|---|---|---|---|
| 1 | **Siguranța datelor.** `api/tests/setup.ts` trunchia toate tabelele, iar 4 scripturi puteau ajunge la baza vie. `api/tests/debug.ts` lipsea din ramură. | Gardă canonică fail-closed în `api/src/lib/test-target.ts`: refuz implicit, excepție doar cu `allowProduction` **și** un banner în ieșire. Copie `.mjs` pentru scripturile node simple, cu test de derivă. | `api/tests/test-target-guard.test.ts` (11 teste). Auditul scripturilor: `scripts/perf-data-query-count.ts`, `scripts/perf-data-dead-letter.ts` (citirea rămâne permisă, scrierea e păstrată), `scripts/perf-data-load.mjs`, `scripts/ops/seed-browser-account.mjs` |
| 2 | **Pierderi de date în producție — dovedit că NU au existat.** | Patru probe independente: OID-urile bazelor în logul Postgres, înregistrările TRUNCATE din WAL, prima linie a istoricului de migrări, continuitatea AuditLog-ului. OID-ul producției (`16384`) nu apare în niciun log. | `audit/round3/DATA-SAFETY-EVIDENCE.md`. Rămâne nedemonstrabil: segmentele WAL reciclate și `log_statement=all` neactivat |
| 3 | **Rate limits (SEC-06).** Pluginul era `global: false`, deci 12 din 93 de rute mutante aveau limită. | 89 din 93 de rute mutante au limită, numărată de două ori: contul autentificat și adresa. Webhook-urile rămân libere (un 429 ar face providerul să reia la nesfârșit). | `api/tests/rate-limit-coverage.test.ts` (8 teste). Commit `4cdb73a` |
| 4 | **Verificarea de provisionare accepta orice răspuns al panoului.** | Containerul e judecat după ce spune nodul: confirmat `running` → servit îndată; viu dar neconfirmat → servit după câteva verificări, cu îndoiala scrisă în jurnal; oprit, suspendat, fără memorie sau cu stare necunoscută → refuzat, motivul numește starea. | `api/tests/provisioning-state.test.ts` (15 teste). **Două mutații**: verificarea strictă pică pe testul care servește un container viu; verificarea permisivă pică pe testele care refuză un container oprit, offline sau suspendat. Commit `d048d4f` |
| 5 | **Reconcilierea stării cu nodul nu exista.** | O instanță online e comparată cu nodul la fiecare 3 minute; ce a găsit se scrie ca eveniment și în audit, **fără** să schimbe starea instanței (decizia e a operatorului). O instanță vie dar neconfirmată se numără separat, ca `unconfirmed`. | `api/src/services/runtime-state.ts`, `api/tests/provisioning-state.test.ts`. Commit `646ffce` |
| 6 | **Cozia moartă nu era supraveghută.** | `api/src/services/dead-letter-monitor.ts`: numărul joburilor care așteaptă un operator, avertisment o singură dată pe job, indicatorul `bm_dead_letter_pending_jobs`, timer în worker la 3 minute. | `api/tests/dead-letter-monitor.test.ts` (12 teste). Commit `6e722a2` |
| 7 | **`scripts/restore.sh` nu restaura NIMIC** și totuși spunea „Restore complete". Listing-ul dumpului scria în `head`, care închide tevava → SIGPIPE → starea 141 → scriptul se oprea **înainte** de restaurare. | Tevile citesc tot intrarile și afișează primele linii cu `sed -n '1,20p'`. Aceeași schimbare în `backup-offsite.sh`, `smoke-production.sh`, `test-migrations.sh`, `restore-drill.sh`. | **Drill comparativ, pe aceeași arhivă și spre aceeași bază:** scriptul de azi → starea **141**, **0** tabele (`relation "User" does not exist`); scriptul de acum → starea **0**, **28** tabele cu 2 utilizatori. Gardă: `api/tests/script-pipe-safety.test.ts` (2 teste, care arată starea 141 și starea 0 alături). Commit `26fc2e6` |
| 8 | **Raportul livrărilor ascundea un eșec.** Coada suprascria rândul din baza: un mesaj al cărui fișier a fost șters de retenție e `failed` în baza și `written-to-file` în coadă. | Rândul din baza câștigă; coada completează doar ce baza mai știe ca așteaptă. | `api/tests/email-delivery-report.test.ts` (3 teste). Mutație: fără reparare raportul spune `written-to-file` în loc de `failed`. Commit `a4fa876` |
| 9 | **Campania `LAUNCH` dă 100% reducere fără limită per utilizator.** | Platforma arată riscul (`promotionRisk`), și la **creare** aplică implicit `maxPerUser = 1` pentru campaniile cu 100% reducere, dacă operatorul nu a cerut altceva. Valoarea campaniei vii rămâne decizia operatorului. | `api/tests/promotions.test.ts` (35 teste). Commit `cc3d386` |
| 10 | **Fluxul plată → provisioning nu era acoperit.** | Test de integrare cu livrare **semnată**: webhook → comanda `PAID` → pasul `PROVISIONING` → instanța creată → jobul de provisioning în coadă. Rulează pe codul real (ramura Stripe e îmbinată, nu duplicată). | `api/tests/stripe-webhook.test.ts`. Commit `5a37fe5` |
| 11 | **Workflow-urile nu erau verificate în CI.** | Job nou `workflow-lint`, actionlint 1.7.7 cu sha256 fixat. | Validat local cu actionlint 1.7.7 (ieșire 0) și apoi de jobul din CI. Commit `1458807` |

**Faza găzduirii de e-mail (ramura `feature/mail-hosting`).** Infrastructura e reală și măsurată; codul e nou și rulează pe mașina de mail, nu doar în teste.

| # | Ce era lipsă | Repararea / construcția | Dovezi |
|---|---|---|---|
| 12 | **Nu exista niciun server de e-mail.** | VM 104 `blipmade-mail` creat pe hipervizor (Debian 13, 4 vCPU, 12 GB, 120 GB, `10.77.0.14`), Mailcow `55982ac` în 18 containere. Porturile 25/465/587/993/4190/80/443 ascultă și sunt deschise din internet (check-host, 3 noduri). Adresa publică e tradusă prin DNAT idempotent în `/usr/local/sbin/blipmade-network.sh`. | `audit/mail/MAIL-HOSTING-REPORT.md` §2 |
| 13 | **Nu exista client pentru serverul de e-mail.** | `api/src/services/mailcow.ts`: client HTTPS cu **pin de certificat SHA-256**, timeout, verdictele mailului tratate ca erori care poartă cuvintele refuzului, răspunsurile de citire distincte de refuzuri. Cheia API a mailului cu `access=rw` și listă de adrese permise. | `api/tests/mailcow-client.test.ts` (15 teste, cu server HTTPS real și certificat real) |
| 14 | **Nu exista serviciu, rute, tabele sau pagină de e-mail.** | Modelele `MailDomain`/`Mailbox`/`MailAlias`/`MailJob` + o migrare aditivă; serviciul cu izolare între clienți, limite de plan, audit și jurnal al lucrului; rutele `/api/mail/*` și `/api/admin/mail/*`; paginile `/email` și `/admin/mail`. | `api/tests/mail-service.test.ts` (27), `api/tests/admin-mail.test.ts` (13), `api/tests/mail-dns.test.ts` (16), `web/tests/mail-ui.test.ts` (20), `web/tests/admin-mail-ui.test.ts` (16) |
| 15 | **Nu exista un mod de a ști că platforma și serverul de e-mail spun aceeași poveste.** | Panoul de back office: sănătatea serverului (versiune, disc, reachability), domeniile tuturor clienților, lucrarea făcută și repetarea ei când poate fi repetată. | `api/tests/admin-mail.test.ts` |
| 16 | **Nu exista o cale tranzacțională dovedită.** | Căsuțele `no-reply@`, `support@`, `platform@blipmade.com` în Mailcow; `SMTP_CA_FILE` pentru un releu semnat de nimeni; proba cap la cap: platforma trimite → Mailcow acceptă și semnează DKIM → LMTP → citit înapoi peste IMAP cu headerele reale. | `api/probe/transactional.ts`, mesajul citit: `DKIM-Signature: d=blipmade.com; s=dkim` |
| 17 | **Nu exista o copie a e-mailului care să poată fi citită înapoi.** | `scripts/backup-mail.sh` (dump al bazei, volumele de e-mail, cheile DKIM, certificatele, manifest) și `scripts/restore-mail.sh` (sumă verificată, manifest, număr de domenii/căsuțe/aliasuri/mesaje). | Drill real pe VM 104: arhivă cu 2 domenii, 4 căsuțe, 4 aliasuri, 4 mesaje; suma `OK` |
| 18 | **Nu existau înregistrări DNS pentru domeniile găzduite.** | Generatoare MX/SPF/DMARC/autodiscover/autoconfig/DKIM și verificare prin căutări reale; comparația e tolerantă la ordinea părților, la punctul final și la etichetele DKIM în plus. | `api/tests/mail-dns.test.ts` (16 teste) |

**Faza comercială a e-mailului (ramura `feature/email-commerce`).** E-mailul a devenit un produs: se vinde singur, se adaugă la comanda unui server, are preț, limite și o viață proprie.

| # | Ce era lipsă | Construcția | Dovezi |
|---|---|---|---|
| 19 | **Nu exista un catalog de planuri de e-mail.** | Categoria `EMAIL_HOSTING` și `Product.fulfilment = EMAIL`: un plan de e-mail nu are ou, nu are nod și nu are instanță. Limitele planului sunt pe coloane proprii (`mailMaxDomains`, `mailMaxMailboxes`, `mailMaxAliases`, `mailMaxForwarding`, `mailTotalStorageMb`, `mailMailboxQuotaMb`, `mailSendLimit`, `mailSendInterval`), prețul e în `ProductPrice`, în unități mici. Trei planuri **draft** în seed (`email-starter`, `email-plus`, `email-business`): limitele propuse, **niciun preț**, vânzarea închisă. | `api/tests/mail-commerce-admin.test.ts` (23 teste), `web/tests/email-commerce-admin-ui.test.ts` (17) |
| 20 | **Platforma nu putea vinde e-mail: orice produs cerea un ou și un nod.** | `deploymentAvailability` știe acum că un produs `EMAIL` nu are nevoie de ou, iar vânzarea e deschisă doar de `MAIL_SALES_ENABLED` (închisă implicit). Refuzul e spus în cuvinte, în același loc, în catalog, în cotă și la comandă. | `api/tests/mail-commerce-routes.test.ts` (24), `api/tests/mail-commerce-flow.test.ts` (10) |
| 21 | **Nu exista o identitate a e-mailului cu viață proprie.** | `MailService`: fără instanță, cu abonament fără instanță, cu limitele **copiate** din planul plătit (o schimbare de catalog nu schimbă un serviciu deja cumpărat), cu cheie de provisionare idempotentă. Anularea serverului nu o atinge, iar ea nu anulează serverul. | `api/tests/mail-commerce-flow.test.ts` — „keeps the mail when the server of the same customer is cancelled" |
| 22 | **Progresul era per comandă, nu per linie.** | `OrderItem.fulfillmentStatus` + `fulfillmentError`: o linie de e-mail și o linie de server progresează separat; eșecul uneia nu marchează cealaltă și nu o șterge pe cealaltă. | `api/tests/mail-commerce-flow.test.ts` — „never marks one line as failed because the other one failed" |
| 23 | **Nu exista verificare de proprietate a domeniului.** | Înregistrare `TXT` la `_blipmade-verify.<domeniu>` cu un token: domeniul e găzduit **numai** după ce clientul a demonstrat că îl are. Marcajul platformei (`blipmade-service:<id>`) pe domeniul din Mailcow ca două conturi să nu se poată suprapune, plus refuzul la comandă al unui domeniu deja găzduit pentru altcineva. | `api/tests/mail-commerce-routes.test.ts`, `api/tests/mail-commerce-flow.test.ts` — „refuses a domain that another customer already hosts" |
| 24 | **Nu exista o coadă pentru e-mail.** | `blipmade.mail.provision`, cu repetare și reconciliere: un job de e-mail blocat nu blochează serverele și un eșec de server nu arată ca un eșec de e-mail. | `api/src/services/queue.ts`, `api/src/worker.ts` |
| 25 | **Nu exista o perioadă de grație, de suspendare și de retenție.** | `MAIL_GRACE_PERIOD_DAYS` (implicit 14) și `MAIL_RETENTION_DAYS` (implicit 30): grația → suspendare → ștergere **la finalul retenției**. Ștergerea imediată la expirare e interzisă; o plată eșuată nu distruge date. | `api/tests/mail-commerce-flow.test.ts` — „keeps the data of a cancelled service through the grace and the retention" |
| 26 | **Nu exista interfața.** | Vitrina publică `/email` (planurile se citesc și când nu sunt pe sale, cu motivul în cuvinte), comanda `/app/email/checkout`, secțiunea „Email hosting" din panoul clientului (servicii, plan, utilizare, domenii, demonstrarea de proprietate, DNS, webmail, suspendare/reactivare/anulare, schimbare de plan), **add-on-ul** la comanda serverului (nepselectat, preț recurent, linie separată în rezumat) și back office-ul (planuri, servicii, utilizare, limite de trimitere, acțiuni). | `web/tests/email-commerce-ui.test.ts` (20), `web/tests/email-commerce-admin-ui.test.ts` (17) |
| 27 | **Prețul putea fi scris în interfață.** | Interfața citește limitele, prețurile, monedele și perioadele numai din API; testele citește sursa și refută orice preț literal în ea. | `web/tests/email-commerce-ui.test.ts`, `web/tests/email-commerce-admin-ui.test.ts` |

**Runda anterioară, deja predată și îmbinată aici:** `fix/stripe-integration` (10 defecte de plată reparate, 77 de teste noi, CI 6/6 pe https://github.com/trencito42/blipmade-hosting/actions/runs/40133024733). Commit-ul de îmbinare: `6e59944`.

---

## 2. Blocul 2 — Implementate, dar neverificate

Nimic din blocul 1 rulează în producție: ramura nu a fost îmbinată și nu a fost lansată, conform instrucțiunii. „Neverificat" înseamnă aici **verificat în suita de test, dar nu încă în lumea reală** — și mai sunt și cazuri care nu pot fi verificate nici în suita.

| Ce | De ce nu e verificat în producție | Ce ar trebui pentru verificare |
|---|---|---|
| Limitele de rată pe 89 de rute | Nimeni nu a lovit limita în producție de când codul n-a fost lansat. **Mai mult:** cât timp proxy-ul nu e de încredere, cheia de adresă e **per conexiune**, deci limita de adresă e mai slabă decât a fost gândită (limita de cont rămâne solidă). | Lansare + `TRUSTED_PROXIES` + edge-ul care rescrie `X-Forwarded-For` |
| Monitorul cozii moarte | Timerul de 3 minute e în ramură; workerul din producție rulează `106809c`. Nu a existat niciodată un job mort real pe care monitorul să-l fi prins. | Lansare + un job mort real (de exemplu o provisionare cu panoul oprit) |
| Judecata containerului și reconcilierea stării | Codul e nou și rulează doar în teste. **N-a fost încercat niciodată pe nod**, pentru că provisionarea reală ar crea un server nou. | Lansare + o comandă reală cu un client real |
| Garda de date | Scripturile sunt protejate acum, dar scripturile rulate în producție n-au fost reluate cu garma activată. | Lansare + rularea unui script de operare |
| Fluxul plată → provisioning | Verificat cu **poarta locală de test**, nu cu Stripe. Semnătura a fost verificată contra secretului de test, nu contra unui eveniment real de la Stripe. | Chei Stripe în modul test (vezi blocul 3) || Găzduirea de e-mail, în ansamblu | Codul rulează pe o mașină de mail **reală**, dar nu în producție și nu pentru un client real: domeniul de probă e sub `.test` (rezervat, nu rezolvă niciodată) și mesajele de probă au mers într-o căsuță a serverului de mail al platformei. Niciun domeniu și nicio adresă de client nu au fost atinse. | Lansare + `MAILCOW_API_KEY` nou + numele `mail.blipmade.com` în DNS |
| Calea tranzacțională prin Mailcow | Calea e măsurată cap la cap pe o mașină reală, dar **producția trimite în continuare în fișiere**, pentru că `SMTP_URL` e gol în `/opt/blipmade/.env` și pentru că cheia DKIM a lui `blipmade.com` nu e publicată încă. | Publicarea înregistrării DKIM (3.2.b) + `SMTP_URL` + recrearea containerelor |
| Cheia API a serverului de e-mail | Cheia folosită a apărut în transcrierea lucrului, deci **trebuie rotită înainte de folosirea în producție**. | Cheie nouă cu `access=rw` și listă de adrese, în `MAILCOW_API_KEY` |
| **Vânzarea e-mailului, cap la cap** | Codul e nou și e testat, dar **nicio comandă de e-mail nu a fost plătită**: nu există cheie Stripe, deci nu există eveniment real de plată și niciun client real cu un domeniu al lui. | Chei Stripe în modul test → o comandă de e-mail plătită → proba găzduirii pe Mailcow (3.9) |
| **Provisionarea unui domeniu plătit** | Faza anterioară a creat și a șters un domeniu pe Mailcow prin serviciul platformei, dar nu printr-o comandă plătită și nu cu limita de trimitere a unui plan. | O comandă plătită + proba de găzduire cu plan |
| **Limita de trimitere scrisă în Mailcow** | `edit/rl-domain` a fost apelat cu valoarea planului în timpul probei, nu prin fluxul de vânzare. | O comandă plătită + citirea limitei înapoi din Mailcow |
| **Interfața comercială** | Testele rulează fără ecran (redare pe server și citirea sursei); nu s-a verificat într-un browser real, pe un telefon sau cu o tastatură. | Lansare + o parcurgere manuală a vitrinei, a comenzii și a add-on-ului |
| Copia e-mailului care părăsește mașina | Copia e pe RAID 0, ca restul platformei, și arhiva conține secrete, deci nu poate călători necriptată. | `OFFSITE_TARGET` + `age` (vezi 3.3) |

**Ce nu poate fi verificat cu nicio cheie, fiindcă nu e al platformei:** faptul că aplicația din container servește cu adevărat (nodul nu confirmă starea `running` — blocul 4, punctul 1).

---

## 3. Blocul 3 — Blocate de acces, de chei sau de decizia operatorului

Pentru fiecare: variabila exactă, locul configurării, formatul așteptat (**niciun secret real**) și metoda de verificare.

### 3.1 Plățile (Stripe, mod test și apoi live)

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `/opt/blipmade/.env` pe VM 103 | `sk_test_…` pentru test, `sk_live_…` pentru live | `curl -sS -H "Authorization: Bearer $STRIPE_SECRET_KEY" https://api.stripe.com/v1/charges?limit=1` → JSON cu `object: list` |
| `STRIPE_PUBLISHABLE_KEY` | `/opt/blipmade/.env` | `pk_test_…` / `pk_live_…` | Se afișează în pagina de plată; comanda se creează cu `success` |
| `STRIPE_WEBHOOK_SECRET` | `/opt/blipmade/.env` | `whsec_…` | Livrare de test cu `Stripe-Signature` → evenimentul e primit o singură dată, iar o livrare cu semnătură stricată e respinsă cu 400 |
| `PAYMENTS_ENABLED` | `/opt/blipmade/.env` | `true` (implicit `false`) | `POST /api/orders/:id/checkout` → 200 cu `url` și `id` de sesiune; cu `false` → 503 `payments_unavailable` |
| `STRIPE_TAX_ENABLED` | `/opt/blipmade/.env` | `false` (implicit), `true` doar cu identificator fiscal | Factura nu conține taxă când e `false` |
| Endpointul webhookului | Panoul Stripe → Webhooks | `https://blipmade.com/api/webhooks/stripe` | Evenimentele Stripe: `checkout.session.completed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `payment_intent.payment_failed`, `charge.dispute.created` |

### 3.2 E-mail tranzacțional (SMTP)

Calea a fost construită și măsurată pe serverul de e-mail al platformei (VM 104). Ce lipsește e activarea în producție.

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `SMTP_URL` | `/opt/blipmade/.env` pe VM 103 | `smtp://no-reply%40blipmade.com:<parola>@mail.blipmade.com:587` — **numele căsuței e adresa întreagă**, cu `%40` pentru `@`, pentru că releul refuză să trimită în numele altei căsuțe | `GET /health` → `mail: "smtp"` și `mailDelivery.configured: true`; apoi o livrare reală: mesajul ajunge în inbox și **nu** mai apare ca `written-to-file` |
| `SMTP_CA_FILE` | `/opt/blipmade/.env` pe VM 103 | calea unui fișier PEM: `/opt/blipmade-mail/mailcow-ca.pem` | Fișierul există și e lizibil: `openssl x509 -in "$SMTP_CA_FILE" -noout -subject` |
| Numele serverului de e-mail | `/etc/hosts` pe VM 103 (până când numele e în DNS) | `10.77.0.14 mail.blipmade.com` | `getent hosts mail.blipmade.com` |
| Numele serverului de e-mail în container | `compose.api.yml` → `extra_hosts` | `"mail.blipmade.com:10.77.0.14"` | `docker compose exec api getent hosts mail.blipmade.com` |

### 3.2.b Găzduirea de e-mail (blocată de DNS, PTR, IP și chei)

Pașii în ordine, cu valoarea exactă, locul și verificarea. Detaliul complet, cu formatul fiecărei valori, e în `docs/MAIL_HOSTING.md`.

| Variabilă / element | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `MAILCOW_API_URL` | `/opt/blipmade/.env` pe VM 103 | `https://mail.blipmade.com` | `curl -sS -H "X-API-Key: $MAILCOW_API_KEY" https://mail.blipmade.com/api/v1/get/status/version` → `{"version":"…"}` |
| `MAILCOW_API_KEY` | `/opt/blipmade/.env` pe VM 103 | șir hexazecimal lung; **cheie nouă**, cu `access=rw` și `allow_from` = adresele platformei | `curl -sS -H "X-API-Key: <cheia>" https://mail.blipmade.com/api/v1/get/domain/all` → lista, nu `access_denied` |
| `MAILCOW_API_CERT_SHA256` | `/opt/blipmade/.env` pe VM 103 | 64 de caractere hexazecimale, fără două puncte; gol după ce certificatul e semnat de o autoritate | `openssl x509 -in .../cert.pem -noout -fingerprint -sha256` |
| `MAIL_HOSTNAME` | `/opt/blipmade/.env` pe VM 103 | `mail.blipmade.com` | apare în `Subject` al certificatului serverului |
| `MAIL_WEBMAIL_URL` | `/opt/blipmade/.env` pe VM 103 | `https://mail.blipmade.com` | linkul apare în pagina clientului |
| `MAIL_RUA_ADDRESS` | `/opt/blipmade/.env` pe VM 103 | adresă fără nume de afișare: `postmaster@blipmade.com` | valoarea apare în înregistrarea DMARC generată |
| Limitele planului | `/opt/blipmade/.env` pe VM 103 | `MAIL_MAX_DOMAINS_PER_CUSTOMER=3`, `MAIL_MAX_MAILBOXES_PER_DOMAIN=10`, `MAIL_MAX_ALIASES_PER_DOMAIN=100`, `MAIL_MAX_QUOTA_MB_PER_MAILBOX=1024`, `MAIL_MAX_QUOTA_MB_PER_DOMAIN=10240` | limitele apar în pagina clientului și sunt cele cerute serverului de e-mail |
| Adresa publică dedicată | furnizorul de hosting + `/usr/local/sbin/blipmade-network.sh` | un IP din `193.34.214.0/24` care **nu** e `.20`, `.86`, `.87` sau `.143` | `check-host.net/check-tcp?host=<IP>:25&max_nodes=3` → `OK` din 3 noduri |
| `PTR` al adresei de e-mail | furnizorul de hosting | `mail.blipmade.com` | `host -t PTR <IP>` → `mail.blipmade.com` |
| Numele `mail.blipmade.com` | DNS (Cloudflare) | un `A` cu adresa de e-mail | `host -t A mail.blipmade.com` |
| Înregistrarea DKIM a lui `blipmade.com` | DNS (Cloudflare) | `TXT` la `dkim._domainkey.blipmade.com` cu `v=DKIM1;k=rsa;t=s;s=email;p=…` (valoarea exactă e în `docs/MAIL_HOSTING.md` §4.6) | `host -t TXT dkim._domainkey.blipmade.com` |
| Certificatul de ACME | `/opt/mailcow-dockerized` pe VM 104 | certificat semnat de o autoritate, după publicarea numelui | `openssl s_client -connect mail.blipmade.com:443` → emitentul nu mai e `mailcow` |

### 3.3 Backup în afara gazdei

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `OFFSITE_TARGET` | `/opt/blipmade/.env` | `rclone:nume-backup` sau `utilizator@host:/srv/blipmade` | `bash scripts/backup-offsite.sh` → fără țintă: cod **3** și mesajul „no copy left this host"; cu țintă: cod **0** și o listare remote care conține arhiva |
| `OFFSITE_AGE_RECIPIENT` | `/opt/blipmade/.env` | `age1…` (cheia publică a destinatarului) | Arhiva de pe țintă se decripta și compară cu originalul |
| `OFFSITE_AGE_IDENTITY` | `/opt/blipmade/.env` | calea către fișierul cheii private (`/etc/blipmade/age.key`) | `age -d -i "$OFFSITE_AGE_IDENTITY" -o - "$fișier"` |
| `OFFSITE_ENCRYPTION_KEY` | `/opt/blipmade/.env` | frază de rezervă pentru `openssl` | Se folosește doar dacă `age` nu e instalat |
| `rclone`, `age` | pachetele sistemului | `rclone` și `age` instalate pe gazdă | `command -v rclone age` — **astăzi ambele lipsesc** |

### 3.4 Edge-ul și adresa publică (Caddy)

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `DOMAIN_BASE` | `/opt/blipmade/.env` | `blipmade.com` (fără `https://`) | `GET /health` → `domainBase`; subdomeniul unui client primește certificat |
| `DOMAIN_TARGET` | `/opt/blipmade/.env` | adresa IP a gazdei web (`10.77.0.13`) | `curl -sS -o /dev/null -w '%{http_code}' "https://<subdomeniu>.${DOMAIN_BASE}/"` → 200 |
| `CADDY_ADMIN_URL` | `/opt/blipmade/.env` | `http://10.77.0.12:2019` | `curl -sS "$CADDY_ADMIN_URL/config/"` → JSON al configurației |
| `CADDY_ADMIN_TOKEN` | `/opt/blipmade/.env` | tokenul admin al lui Caddy | `curl -sS -H "Authorization: Bearer $CADDY_ADMIN_TOKEN" "$CADDY_ADMIN_URL/config/"` → 200 |
| `CADDY_APP_SERVER` | `/opt/blipmade/.env` | numele serverului Caddy care ține rutele clienților; implicit `blipmade` | `GET $CADDY_ADMIN_URL/config/apps/http/servers/<nume>/routes` → 200 |
| Blocul `apps` | Fișierul Caddy al edge-ului | un server numit `blipmade` (sau numele de mai sus) în `apps { http { servers { … } } }`; **fișierul de referință are acum blocul** | `GET $CADDY_ADMIN_URL/config/apps/http/servers/blipmade/routes` → 200, nu 404 |
| API-ul admin al lui Caddy | Opțiunile globale ale edge-ului | `admin 10.77.0.12:2019` — implicit Caddy ascultă doar pe `localhost:2019`, **la care VM 103 nu ajunge** (port 2019 filtrat) | `curl -sS -H "Authorization: Bearer $CADDY_ADMIN_TOKEN" "$CADDY_ADMIN_URL/config/"` de pe 10.77.0.13 → 200 |
| Rută pentru hostname-urile clienților | Fișierul Caddy al edge-ului | o rută care dă containerul: `reverse_proxy` → `10.77.0.11:<port>` (portul alocării) | Un hostname real rezolvă și încape TLS; `curl -H "Host: witch.pw" http://10.77.0.12/` răspunde din container |

### 3.4.b Cazul `witch.pw` — pașii exacți, în ordine

Starea reală, citită astăzi din producție (read-only):

| Fapt | Valoare |
|---|---|
| Instanța | `1` (`cmvmuropo0017ns01rl6essbo`), server 18, alocarea 74 → **`10.77.0.11:30001`** |
| Dovada de ownership | **deja acceptată** la 2026-10-24 20:34:56 (`verifiedAt` setat) |
| TXT publicat | `_blipmade-verify.witch.pw` → `MOSUh_viwgyl4IqziLzUx7pLibRxQ0VL` — **corect și public** |
| A / CNAME | `witch.pw` și `www.witch.pw` răspund cu IP-urile Cloudflare (188.114.96.11 / 188.114.97.11) — deci domeniul e deja în spatele Cloudflare |
| Ce lipsește pe platformă | `CADDY_ADMIN_URL` și `CADDY_ADMIN_TOKEN` sunt **goale** în `/opt/blipmade/.env` |
| Ce lipsește pe edge | Caddy nu are blocul `apps` (fișierul de referință îl are acum) și API-ul admin nu e accesibil de pe VM 103 |
| Ce lipsește la DNS | Origin-ul Cloudflare pentru `witch.pw` trebuie să fie `193.34.214.143` (aceeași adresă ca pentru `blipmade.com`) |

Pașii:

1. Pe edge (10.77.0.12): aplică blocul `apps` din `audit/_tools/edge-Caddyfile`, leagă `admin 10.77.0.12:2019` și lasă firewall-ul să permită doar 10.77.0.13 către 2019.
2. Pe VM 103: în `/opt/blipmade/.env`, pune `CADDY_ADMIN_URL=http://10.77.0.12:2019` și `CADDY_ADMIN_TOKEN=<tokenul din Caddy>` (dacă serverul Caddy existent nu poate avea al doilea server pe aceleași adrese, pune `CADDY_APP_SERVER=<numele serverului existent>`).
3. În Cloudflare: origin-ul pentru `witch.pw` → `193.34.214.143`.
4. Verifică: `GET $CADDY_ADMIN_URL/config/apps/http/servers/blipmade/routes` → 200, apoi în interfață apasă **Verifică** pe domeniu. Ruta care trebuie să apară: `host: witch.pw` → `dial: 10.77.0.11:30001`.
5. Certificate: pentru hostname-uri necunoscute în avans, Caddy nu cere certificat singur — deciziile sunt ale operatorului (CDN care termină TLS, sau un certificat care acoperă hostname-urile).

**Atenție: pasul 4 nu este suficient.** Citire read-only de azi: porturile de alocare
`30000`, `30001`, `30002` și `30003` de pe nod (`10.77.0.11`) sunt **închise** din rețeaua
internă, iar nodul raportează `starting` pentru toate cele trei containere. Așadar, chiar cu
gateway-ul complet configurat, `witch.pw` ar ajunge la un container care nu răspunde pe
30001. Cauza nu se poate afla de pe VM 103: comanda trimisă în consolă nu întoarce ieșirea
prin API-ul panoului, iar nodul `10.77.0.11` refuză cheia (`Permission denied (publickey)`).
Verificarea trebuie făcută **pe nod**, în interiorul containerului:

```
# pe 10.77.0.11, in containerul serverului 18
cat /proc/net/tcp | awk 'NR>1 {print $2}'        # porturile in ascultare (0BB8 = 3000)
ps aux                                          # procesul node
```

Dacă `0BB8` nu apare, aplicația nu ascultă pe 3000 și cauza este în produs sau în egg
(`OPS-01`, `OPS-17`), nu în poartă. Dacă apare, cauza este în health check-ul egg-ului
sau în maparea portului, iar poarta rămâne singurul pas lipsă.

### 3.5 Adresa reală a clientului (proxy de încredere)

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `TRUSTED_PROXIES` | `/opt/blipmade/.env` | lista adreselor de proxy de încredere, de exemplu `172.18.0.0/16` | `GET /health` → secțiunea de proxy; o cerere prin edge păstrează adresa clientului în log |
| `X-Forwarded-For` la edge | Fișierul Caddy al edge-ului | `header_up X-Forwarded-For {client_ip}` — `audit/_tools/edge-Caddyfile` e deja pregătit | Un request prin edge arată IP-ul vizitatorului, nu `172.18.0.1` |

### 3.6 Infrastructura expusă (necesită aprobare explicită)

| Element | Locul configurării | Ce trebuie | Verificare |
|---|---|---|---|
| Firewall Proxmox | hipervizor `n7030e1` | `8006` și `111` închise pe interfața publică | `pve-firewall status` → `enabled`; `ss -lntp` nu mai arată `*:8006` |
| `sshd` | hipervizor | `PermitRootLogin prohibit-password`, `PasswordAuthentication no`, `AllowUsers` | `sshd -T` |
| `rpcbind` | hipervizor | oprit și dezactivat la boot | `ss -lntp | grep :111` → nimic |
| Parola `root` | hipervizor | rotită **după** firewall | `sshd -T` + o încercare de autentificare veche |

**Nu am atins niciunul dintre acestea**: firewallul, SSH-ul, parola `root` și istoricul Git sunt interzise fără aprobare expresă.

### 3.7 Nodul care nu confirmă starea `running`

| Element | Locul configurării | Ce trebuie | Verificare |
|---|---|---|---|
| Health check-ul egg-ului 15 | Panoul Pterodactyl → egg `nodejs_25` de pe nodul 1 | fie health check-ul se potrivește cu aplicația (portul ascultat), fie se scoate; **sau** aplicația ascultă pe portul egg-ului | Citirea resurselor nodului: `current_state` trece din `starting` în `running` |
| Produsul „Discord Bot" | Panoul / catalogul produsului | aplicația reală în container (astăzi rădăcina containerului are doar `.npm/` și `bm-test.txt` — `OPS-01`) | `npm run start` în containerul real pornește procesul |

### 3.8 Decizii de produs și de operare

| Decizie | Unde | Ce | Ce se întâmplă până la decizie |
|---|---|---|---|
| `maxPerUser` pe campania `LAUNCH` vie | Tabelul `Promotion` din baza de producție | `maxPerUser = 1` (o reducere de 100% per cont) | Platforma arată riscul în lista de campanii; campania rămâne fără limită explicită |
| Starea `RESTARTING` a instanței `cmvmyg0vz002lns01ptrqpmrz` | Tabelul `Instance` din producție | resetată la `ONLINE` dacă nodul o confirmă vie, sau marcată explicit ca degradată | Platforma nu schimbă niciodată singură starea unei instanțe reale; reconcilierea doar înregistrează |
| Cheile Stripe în modul test | `/opt/blipmade/.env` | cele de la 3.1, cu `sk_test_…` | Testul de integrare al fluxului de plată rulează contra porții locale, nu contra Stripe |

---

### 3.9 Vânzarea e-mailului (comercializarea găzduirii)

Vânzarea e-mailului e **închisă** (`MAIL_SALES_ENABLED=false`). Planurile se citesc în vitrină, cu limitele lor, dar nu se pot cumpăra. Cinci lucruri sunt întrebarea operatorului; fiecare cu variabila exactă, locul, formatul și verificarea.

| Ce | Variabilă / loc | Formatul așteptat | Verificare |
|---|---|---|---|
| **Prețul planurilor** | Back office: `/admin/mail` → pagina planurilor (sau `PATCH /admin/mail/plans/:id`) | `prices: [{ "period": "MONTHLY", "amount": 1990, "currency": "EUR" }]`. `amount` e în **unități mici** (1990 = 19,90 EUR); `period` e `MONTHLY` sau `YEARLY` | `GET /mail/plans` răspunde cu `price.amount` și `price.period`; vitrina arată aceeași sumă |
| **Cheile plăților** | `/opt/blipmade/.env` (containerul API): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Trei șiruri cu prefixul furnizorului; secretul de webhooks e cel al endpointului de webhooks, nu o cheie de API | O plată în modul test al furnizorului: evenimentul ajunge la `/webhooks/stripe`, comanda trece din `AWAITING_PAYMENT` în `PAID`, iar linia de e-mail trece în `PROVISIONING` **fără** o a doua plată |
| **Numele serverului de e-mail în DNS** | DNS-ul zonei `blipmade.com`, la furnizorul de nume: înregistrare `A` pentru `mail.blipmade.com` → adresa publică a serverului de e-mail (azi `193.34.214.20`) | O adresă IPv4 publică, aceeași pe care o rezolvă și portul 25 | `dig +short mail.blipmade.com` răspunde cu adresa, iar serverul răspunde pe 443 cu un certificat care are numele în `SAN` |
| **Certificatul serverului de e-mail** | `/opt/blipmade/.env`: `MAILCOW_API_CERT_SHA256` (amprenta SHA-256 a certificatului, hex mic) și `SMTP_CA_FILE` (fișierul CA pentru clienții de mail) | 64 de cifre hex, fără `:` | `curl -sS https://mail.blipmade.com/api/v1/get/status/version` răspunde fără avertisment de certificat |
| **Copia de rezervă în afara mașinii** | Mediul mașinii de e-mail: `OFFSITE_TARGET` (bucket sau mașină), cu `age` și `rclone` instalate | O destinație de tip `s3:`/`rclone:` cu o cheie deja rotită | `sudo bash backup-mail.sh drill` restaurează ultima arhivă și numără domeniile, căsuțele și mesajele care au revenit; numărul e cel al arhivei |
| **Deschiderea vânzării** | `/opt/blipmade/.env`: `MAIL_SALES_ENABLED=true`, apoi repornirea containerului API și a workerului | `true` sau `false` | `GET /mail/plans` răspunde cu `onSale: true` pentru planurile care au preț, iar `POST /catalog/quote` cu o linie de e-mail răspunde cu prețul, nu cu un refuz |

**Ordinea**: DNS și certificat (3.9) → cheile plăților și o plată de probă (3.9) → prețurile planurilor (3.9) → copia de rezervă și drill-ul (3.9) → abia apoi `MAIL_SALES_ENABLED=true`. Până la ultimul pas, planurile rămân **draft**: vizibile, cu limitele lor, necomandabile.

## 4. Blocul 4 — Probleme reale de lansare, încă nerezolvate

Acestea nu sunt blocaje de acces: sunt lucruri care rămân deschise chiar dacă operatorul dă cheile.

1. **Nodul nu confirmă niciodată că un container servește.** Citire read-only pe resursele Wings: serverul 17 → `current_state: "starting"`, 46 694 400 B memorie, uptime 2 h 35 min, trafic rx 347 296 B; serverul 19 → `starting`, 33 923 072 B, uptime 24 min. Containerele sunt vii; health check-ul egg-ului nu trece, deci Wings nu le promotează niciodată. Platforma spune acum „e viu, dar nodul nu confirmă" — nu poate spune „serviciul funcționează". Registrat ca `OPS-17`.
2. **Produsul vândut nu conține aplicația.** Rădăcina containerului are doar `.npm/` și `bm-test.txt`, iar startup-ul e `npm run start` (`OPS-01`, decizie de operator).
3. **Limita de adresă e mai slabă decât a fost gândită, cât timp proxy-ul nu e de încredere.** Cheia devine `adresă:port de conexiune`, deci un vizitator care deschide multe conexiuni are mai multe contoare. Limita **de cont** rămâne corectă. Se închide odată cu `TRUSTED_PROXIES` și edge-ul.
4. **Consola Proxmox, `rpcbind` și `root` cu parolă sunt expuse public** (`SEC-01`, `SEC-02`, `SEC-28`). Pierdere totală, nu disconfort; nu se rezolvă cu cod.
5. **Backupul nu părăsește gazda, iar gazda rulează RAID 0** (`INF-02`). O defectare a hardului pierde totul. Și până la reparația de azi, chiar și restaurarea de pe aceeași gazdă nu funcționa.
6. **Niciun e-mail nu ajunge la un client** (`OPS-03`). Resetul de parolă, verificarea și notificările ajung în fișiere. Calea prin Mailcow e construită și măsurată cap la cap, dar **nu e activată în producție**: `SMTP_URL` e gol, iar cheia DKIM a lui `blipmade.com` nu e publicată (3.2, 3.2.b).
7. **Platforma nu are o adresă publică** (`OPS-04`): edge-ul nu e configurat, `DOMAIN_BASE` e gol, `InstanceDomain` are 0 rânduri.
8. **Identitatea comercială lipsește**: 35 de marcaje `TODO(operator)` în paginile legale (nume, CUI/TVA, adresă, e-mail de suport, regim de TVA, `C_node`).
9. **O parolă moartă e în istoricul Git** (`SEC-30`): curățarea cere force-push, deci aprobare.
10. **147 de constatări din registru nu au fost începute** (`audit/12-FULL-FINDINGS-REGISTER.md`), dintre care `UX-02`, `UX-05`, `UX-06/07`, `UX-08`, `UX-09/10`, `UX-04`, `OPS-06`, `SEC-07`, `SEC-08`, `SEC-09`, `SEC-12`, `SEC-14`.
11. **Găzduirea de e-mail nu poate fi lansată public încă.** Serverul de e-mail e real și funcționează, dar: (a) e-mailul iese prin adresa platformei, nu prin una dedicată, și e vorba despre o adresă care e și a site-ului, a panoului și a nodului; (b) **nu există `PTR` pentru niciuna dintre cele patru adrese** ale platformei, deci un receptor care caută numele invers al adresei ține sau aruncă mesajul; (c) `mail.blipmade.com` nu e în DNS, deci clienții nu pot publica un `MX` care să ajungă undeva; (d) certificatul serverului e semnat de el însuși (platforma îl acceptă prin pin, dar un client de mail nu îl va accepta). Toate patru sunt ale operatorului (3.2.b).
12. **E-mailul clienților și e-mailul tranzacțional al platformei sunt două lucruri.**
13. **Vânzarea e-mailului nu poate fi deschisă încă.** Codul e complet și testat (blocul 1, punctele 19–27), dar **nicio comandă de e-mail nu a fost plătită**: nu există cheie Stripe, nu există preț, `mail.blipmade.com` nu e în DNS, iar copia de rezervă nu părăsește mașina. Toate patru sunt ale operatorului (3.9). Până când sunt închise, `MAIL_SALES_ENABLED` rămâne `false` și planurile sunt draft-uri vizibile, necomandabile.
14. **Plafonul platformei taie planurile mari.** `MAIL_MAX_DOMAINS_PER_CUSTOMER=3`, `MAIL_MAX_MAILBOXES_PER_DOMAIN=10`, `MAIL_MAX_QUOTA_MB_PER_DOMAIN=10240` și `MAIL_MAX_SEND_LIMIT=500` sunt plafonul de azi: planul `email-business` cere 10 domenii, 25 căsuțe și 2000 de mesaje pe oră, deci **limita aplicată e cea a plafonului**, nu cea a planului. E comportamentul dorit (o plan nu poate promite mai mult decât platforma poate ține), dar operatorul trebuie să ridice plafonul înainte să vândă planul mare, iar interfața arată ambele numere: cerut și aplicat.
 Serverul de e-mail poate găzdui domeniile clienților și poate trimite ca `blipmade.com`, dar `blipmade.com` are MX-ul la `mail.xodo.ro` (providerul actual), iar înregistrarea DKIM a lui `blipmade.com` nu e publicată. Decizia „MX-ul lui `blipmade.com` trece la serverul de e-mail" e a operatorului și schimbă unde se primesc e-mailurile de suport.

---

## 5. Ce n-am atins, și de ce

| Nu am atins | De ce |
|---|---|
| `main`, merge, deploy în producție | Instrucțiune expresă. `main` e la `106809c`; producția e neatinsă |
| Plăți live, tranzacții taxabile | Nu există cheie; o comandă cu reducere de 100% a fost deja provisionată în testul de integrare, nu în producție |
| Firewall, SSH, parola `root`, istoricul Git | Interzise fără aprobare expresă |
| Starea instanțelor reale | Decizia e a operatorului; reconcilierea doar înregistrează |
| `cleanup-data.sh` | Plan implicit și `--confirm DELETE-<n>`; e corect așa cum e |
| Rularea Stripe reală | Nu există cheie, nici pe VM, nici local |
| Nodul `10.77.0.11` și edge-ul `10.77.0.12` | Inaccesibili de pe VM 103 (timeout pe `node1.blipmade.com:8080`, conexiune refuzată pe 443) |
| DNS-ul lui `blipmade.com` și al lui `witch.pw` | DNS-ul aparține operatorului; platforma **doar verifică** înregistrările clienților, nu le scrie |
| Adresa publică a platformei | Nu există `PTR` pe niciuna dintre cele patru adrese; un `PTR` se cere furnizorului |
| `SMTP_URL` în producție | Calea e dovedită, dar o semnătură DKIM care nu poate fi verificată e mai rea decât lipsa ei, deci activarea așteaptă publicarea cheii |
| Cheia API a serverului de e-mail | Folosită ca atare în probe; trebuie rotită înainte de producție, pentru că a apărut în transcriere |
| Prețurile finale ale planurilor de e-mail | Sunt o decizie comercială a operatorului. Seedul scrie **limitele propuse** și **niciun preț**: planurile sunt draft-uri vizibile și necomandabile |
| Vânzarea e-mailului | `MAIL_SALES_ENABLED` e închisă implicit; nu se deschide până când plățile, mailul, DNS-ul, copia de rezervă și provisionarea nu sunt dovedite cap la cap |
| DNS-ul domeniilor clienților | Platforma **doar verifică** înregistrările; demonstrația de proprietate se face printr-o înregistrare `TXT` publicată de client, nu scrisă de platformă |
| Comenzi și abonamente reale | Nicio comandă reală nu a fost plătită sau modificată; toate probele au rulat pe baze de test cu sufix `_test` |

---

## 6. Ordinea propusă pentru operator

1. **Firewall, `sshd`, `rpcbind`, parola `root`** — înainte de orice altceva. Pierdere totală.
2. **Cheile Stripe în modul test** → proba fluxului de plată cu o livrare semnată reală → apoi cheile live și `PAYMENTS_ENABLED=true`.
3. **Găzduirea de e-mail, în ordinea dependențelor:** publicați `mail.blipmade.com` și înregistrarea DKIM a lui `blipmade.com` → cereți adresa dedicată și `PTR`-ul → rotiți cheia API a serverului de e-mail → activați `SMTP_URL` și `SMTP_CA_FILE` → proba livrării reale.
4. **`OFFSITE_TARGET` + cheile `age`/`rclone`** → backupul pleacă din gazdă → drill de restaurare din țintă.
5. **`TRUSTED_PROXIES` + edge-ul Caddy cu blocul `apps` și rută pentru subdomenii** → `DOMAIN_BASE`, `DOMAIN_TARGET`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` → platforma devine accesibilă.
6. **Health check-ul egg-ului 15 și aplicația din container** → nodul confirmă `running`.
7. **`maxPerUser = 1` pe campania `LAUNCH`** și starea instanței `RESTARTING`.
8. **Vânzarea e-mailului**, în ordinea din 3.9: DNS și certificat → cheile Stripe și o plată de probă → prețurile planurilor → copia de rezervă și drill → `MAIL_SALES_ENABLED=true`. Fiecare pas se dovedește înaintea următorului.
9. **Abia apoi**: merge în `main` și lansare.

Până la punctul 8, verdictul rămâne **NO-GO**.

---

## 7. Ce a fost rulat pe această ramură

| Verificare | Rezultat |
|---|---|
| Suita API (pe `fix/audit-round3`) | **619 / 619**, 66 fișiere (baza `blipmade_r3_main_test`, Redis 15) |
| Suita API (pe `feature/mail-hosting`) | **694 / 694**, 70 fișiere (baza `blipmade_mail_test`, Redis 9) |
| Suita web (pe `fix/audit-round3`) | **144 / 144** |
| Suita web (pe `feature/mail-hosting`) | **180 / 180** (144 + 20 pentru pagina clientului + 16 pentru pagina de back office) |
| Suita API (pe `feature/email-commerce`) | **751 / 751**, 73 fișiere (baza `blipmade_mail_test`, Redis 9) — 694 + 24 rute client + 23 back office + 10 fluxuri cap la cap |
| Suita web (pe `feature/email-commerce`) | **217 / 217**, 34 suite-uri (180 + 20 interfață client + 17 back office) |
| Fluxuri comerciale dovedite cap la cap | `api/tests/mail-commerce-flow.test.ts` (10): cumpărare standalone, add-on la comanda unui server, izolarea eșecului unei linii, eveniment de plată livrat de două ori, anularea serverului cu e-mail activ, izolare între clienți, schimbare de plan după plată, grație și retenție, domeniu deja găzduit pentru altcineva, repetarea unei provisionări eșuate |
| `gitleaks` 8.30.1 pe fișierele noi | **0 scurgeri** (38 de fișiere, 894 KB) |
| `tsc` API (sursă) | curat |
| `tsc` API (teste) | curat |
| `actionlint` 1.7.7 | curat (local și în CI) |
| Mutații verificate | 5: `queue.ts` (raportul livrărilor), `judgeContainer` strict, `judgeContainer` permisiv, garda țevii, scriptul de restaurare |
| Probă pe infrastructură reală | creare/ștergere de domeniu, căsuță și alias pe Mailcow; tranzacțional trimis și citit înapoi peste IMAP; backup și drill de restaurare |
| `tsc` web (sursă) | curat |
| CI | vezi secțiunea 8 |

## 8. CI

Pe ramura `feature/email-commerce` (faza comercială a e-mailului), **7/7 joburi verzi**:

* commit-ul `9ba38f2` („Sell the hosted mail") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40165122396** — prima rulare: 6/7, cu `API typecheck` picând pe faptul că tipul funcției de checkout cerea rândul întreg al unei linii de comandă. Repararea e în tipul funcției, nu în test: `f9f4407`.
* commit-ul `f9f4407` („Ask the checkout only for the fields it reads") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40165612598** — **7/7 joburi verzi**.
* commit-ul `dfdbd12` („Cite the green run of the commercial mail") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40166002111** — 6/7: `Unit and integration tests` a picat pe un **test instabil din faza găzduirii**, nu pe codul fazei comerciale: `tests/mailcow-client.test.ts` cerea ca o cerere cu un termen de o milisecundă să fie refuzată de un server care răspunde imediat. Pe un calculator lent termenul se aprinde înainte de răspuns, pe unul rapid nu — deci testul depindea de viteza mașinii, nu de cod. Repararea: serverul de probă **ține cererea deschisă și nu răspunde niciodată**, iar termenul e de 250 ms; așa testul verifică ce zice să verifice („clientul renunță când serverul de e-mail nu răspunde").
* commit-ul `ea4f53f` („Make the timeout of the mail client a test of the code") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40166996926** — **7/7 joburi verzi**.

Pe ramura `feature/mail-hosting` (faza găzduirii de e-mail):

* commit-ul `991cf91` („Add the hosted mail") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40158217954**
* commit-ul `5f88b6c` („Type check the probes of the mail") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40158521149**
* commit-ul `f1afa88` („Cite the green runs of the mail") — **https://github.com/trencito42/blipmade-hosting/actions/runs/40158745028**

| Job | Rezultat |
|---|---|
| API typecheck | **success** |
| Web typecheck and build | **success** |
| Unit and integration tests | **success** (694 teste API + 180 web) |
| Secret scan | **success** |
| Dependency audit | **success** |
| Schema drift | **success** |
| Workflow lint | **success** |

**7/7 joburi verzi pe ambele rulări.** Scanarea secretelor a raportat o singură
constentare nouă: amprenta certificatului serverului de e-mail, care e `SHA-256` al unui
certificat public, nu o cheie. Ea e în lista de excepții cu valoarea exactă și cu motivul
ei, ca în runda a treia.

Două rulări verzi pe ramura `fix/audit-round3`:

* commit-ul `05b5951` — **https://github.com/trencito42/blipmade-hosting/actions/runs/40142773601**
* commit-ul `e6bbc4b` (raportul) — **https://github.com/trencito42/blipmade-hosting/actions/runs/40143149673**

| Job | Rezultat |
|---|---|
| API typecheck | **success** |
| Web typecheck and build | **success** |
| Unit and integration tests | **success** (619 teste API + 144 web) |
| Secret scan | **success** |
| Dependency audit | **success** |
| Schema drift | **success** |
| Workflow lint | **success** (jobul nou cu actionlint) |

**7/7 joburi verzi.** Niciun job de securitate nu a fost dezactivat sau slăbit: jobul
`Secret scan` a picat într-o primă rulare (https://github.com/trencito42/blipmade-hosting/actions/runs/40141750353)
pentru două valori din documentele de dovezi — tokenul unui mesaj capturat pe sink-ul local al
auditului și tokenul DNS al unui domeniu de test din domeniul rezervat `example.test`. Ambele
au fost verificate ca fiind străine platformei (0 rânduri în baza vie) și au fost **redactate**
din documente; istoricul le păstrează, deci lista de excepții a scanării a crescut cu două
intrări, fiecare cu valoarea exactă și cu motivul ei. Scanarea raportează orice altceva.

Verificarea locală a istoricului întreg, cu gitleaks 8.30.1 și aceeași configurație:
**131 commituri, 29,09 MB scanate, 0 scurgeri**.
