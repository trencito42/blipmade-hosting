# Raport de pregătire pentru lansare — runda a treia

* **Data:** 2026-10-24
* **Ramura:** `fix/audit-round3`, întemeiată pe `origin/main` = `106809c`. **Niciun merge în `main`, niciun deploy în producție.**
* **Gazdă:** `debian@10.77.0.13` (VM 103). Producția a fost neatinsă: arborele este la `106809c`, cele 5 containere sunt healthy, Postgres și Redis nu au fost repornite, `stripe: not_configured`, `PAYMENTS_ENABLED=false`.
* **Ce s-a măsurat:** 619 teste API (66 fișiere) + 144 teste web, toate verzi; `tsc` curat pentru API (sursă și teste); suita web verde.
* **Dovezile complete:** `audit/round3/DATA-SAFETY-EVIDENCE.md`, `audit/round3/SMTP-EVIDENCE.md`, `audit/round3/BACKUP-EVIDENCE.md`, `audit/round3/CADDY-EVIDENCE.md`, `audit/12-FULL-FINDINGS-REGISTER.md`.

---

## 0. Verdictul

**NO-GO pentru lansare comercială.** Nu declar GO.

Cinci lucruri nu au dovezi suficiente, iar patru dintre ele nu se pot închide fără operator:

1. **Plățile nu sunt dovedite cu un furnizor real.** Codul e reparat și testat cu o poartă locală, dar nu există nicio cheie Stripe, nici în producție, nici local. Semnătura webhook-ului nu a fost verificată contra Stripe.
2. **Restaurarea în afara gazdei nu există.** Gazda rulează RAID 0, iar backupul rămâne pe ea. `scripts/backup-offsite.sh` eșuează vizibil (cod 3) și cere o țintă care nu e configurată.
3. **Nodul nu confirmă niciodată că un container servește.** Cele trei instanțe vii sunt raportate `starting` de 2h35m, respectiv 24m. Platforma poate spune acum „containerul e viu, dar nodul nu confirmă"; nu poate spune „serviciul funcționează".
4. **Niciun e-mail nu ajunge la un client.** `SMTP_URL` e gol, deci resetul de parolă și verificarea scriu în fișiere.
5. **Platforma nu are o adresă publică.** Edge-ul `10.77.0.12` nu e configurat și `DOMAIN_BASE` e gol.

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
| Fluxul plată → provisioning | Verificat cu **poarta locală de test**, nu cu Stripe. Semnătura a fost verificată contra secretului de test, nu contra unui eveniment real de la Stripe. | Chei Stripe în modul test (vezi blocul 3) |

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

### 3.2 E-mail (SMTP)

| Variabilă | Locul configurării | Formatul așteptat | Verificare |
|---|---|---|---|
| `SMTP_URL` | `/opt/blipmade/.env` | `smtp://utilizator:parola@host:587` sau `smtps://utilizator:parola@host:465` | `GET /health` → `mail: "smtp"` și `mailDelivery.configured: true`; apoi o livrare reală: mesajul ajunge în inbox și **nu** mai apare ca `written-to-file` |

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
| Blocul `apps` | Fișierul Caddy al edge-ului | `audit/_tools/edge-Caddyfile` **nu** are bloc `apps`; fără el, namespace-ul `servers/blipmade` dă 404 | `curl -sS -H "Authorization: Bearer $CADDY_ADMIN_TOKEN" "$CADDY_ADMIN_URL/config/apps/"` → obiect, nu 404 |
| Rută pentru hostname-urile clienților | Fișierul Caddy al edge-ului | o rută care înlocuiește `*.${DOMAIN_BASE}` cu ținta web | Un subdomeniu real rezolvă și încape TLS |

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

## 4. Blocul 4 — Probleme reale de lansare, încă nerezolvate

Acestea nu sunt blocaje de acces: sunt lucruri care rămân deschise chiar dacă operatorul dă cheile.

1. **Nodul nu confirmă niciodată că un container servește.** Citire read-only pe resursele Wings: serverul 17 → `current_state: "starting"`, 46 694 400 B memorie, uptime 2 h 35 min, trafic rx 347 296 B; serverul 19 → `starting`, 33 923 072 B, uptime 24 min. Containerele sunt vii; health check-ul egg-ului nu trece, deci Wings nu le promotează niciodată. Platforma spune acum „e viu, dar nodul nu confirmă" — nu poate spune „serviciul funcționează". Registrat ca `OPS-17`.
2. **Produsul vândut nu conține aplicația.** Rădăcina containerului are doar `.npm/` și `bm-test.txt`, iar startup-ul e `npm run start` (`OPS-01`, decizie de operator).
3. **Limita de adresă e mai slabă decât a fost gândită, cât timp proxy-ul nu e de încredere.** Cheia devine `adresă:port de conexiune`, deci un vizitator care deschide multe conexiuni are mai multe contoare. Limita **de cont** rămâne corectă. Se închide odată cu `TRUSTED_PROXIES` și edge-ul.
4. **Consola Proxmox, `rpcbind` și `root` cu parolă sunt expuse public** (`SEC-01`, `SEC-02`, `SEC-28`). Pierdere totală, nu disconfort; nu se rezolvă cu cod.
5. **Backupul nu părăsește gazda, iar gazda rulează RAID 0** (`INF-02`). O defectare a hardului pierde totul. Și până la reparația de azi, chiar și restaurarea de pe aceeași gazdă nu funcționa.
6. **Niciun e-mail nu ajunge la un client** (`OPS-03`). Resetul de parolă, verificarea și notificările ajung în fișiere.
7. **Platforma nu are o adresă publică** (`OPS-04`): edge-ul nu e configurat, `DOMAIN_BASE` e gol, `InstanceDomain` are 0 rânduri.
8. **Identitatea comercială lipsește**: 35 de marcaje `TODO(operator)` în paginile legale (nume, CUI/TVA, adresă, e-mail de suport, regim de TVA, `C_node`).
9. **O parolă moartă e în istoricul Git** (`SEC-30`): curățarea cere force-push, deci aprobare.
10. **147 de constatări din registru nu au fost începute** (`audit/12-FULL-FINDINGS-REGISTER.md`), dintre care `UX-02`, `UX-05`, `UX-06/07`, `UX-08`, `UX-09/10`, `UX-04`, `OPS-06`, `SEC-07`, `SEC-08`, `SEC-09`, `SEC-12`, `SEC-14`.

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

---

## 6. Ordinea propusă pentru operator

1. **Firewall, `sshd`, `rpcbind`, parola `root`** — înainte de orice altceva. Pierdere totală.
2. **Cheile Stripe în modul test** → proba fluxului de plată cu o livrare semnată reală → apoi cheile live și `PAYMENTS_ENABLED=true`.
3. **`SMTP_URL`** → proba livrării reale.
4. **`OFFSITE_TARGET` + cheile `age`/`rclone`** → backupul pleacă din gazdă → drill de restaurare din țintă.
5. **`TRUSTED_PROXIES` + edge-ul Caddy cu blocul `apps` și rută pentru subdomenii** → `DOMAIN_BASE`, `DOMAIN_TARGET`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` → platforma devine accesibilă.
6. **Health check-ul egg-ului 15 și aplicația din container** → nodul confirmă `running`.
7. **`maxPerUser = 1` pe campania `LAUNCH`** și starea instanței `RESTARTING`.
8. **Abia apoi**: merge în `main` și lansare.

Până la punctul 8, verdictul rămâne **NO-GO**.

---

## 7. Ce a fost rulat pe această ramură

| Verificare | Rezultat |
|---|---|
| Suita API | **619 / 619**, 66 fișiere (baza `blipmade_r3_main_test`, Redis 15) |
| Suita web | **144 / 144** |
| `tsc` API (sursă) | curat |
| `tsc` API (teste) | curat |
| `actionlint` 1.7.7 | curat (local și în CI) |
| Mutații verificate | 5: `queue.ts` (raportul livrărilor), `judgeContainer` strict, `judgeContainer` permisiv, garda țevii, scriptul de restaurare |
| CI | vezi secțiunea 8 |

## 8. CI

Rularea pe commit-ul `05b5951` al ramurii `fix/audit-round3`:
**https://github.com/trencito42/blipmade-hosting/actions/runs/40142773601**

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
