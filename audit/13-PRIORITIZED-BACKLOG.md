# 13 — Backlog prioritizat

**Data:** 2026-10-23 · **Sursa:** registrul din `12-FULL-FINDINGS-REGISTER.md` (115 constatări).
**Regula de prioritizare:** P0 blochează lansarea ⇒ se repară primul, indiferent de efort. P1 trebuie reparat înainte de lansarea publică. P2 îmbunătățește și poate aștepta după lansare. P3 e igienă și consistență.

**Cum se citește fiecare rând:**

| Câmp | Semnificație |
|---|---|
| **Efort** | zile-om de lucru efectiv, **la rata operatorului**. Nu include așteptarea după chei, după aprobări de furnizor sau după decizii de produs. |
| **Depinde de** | ID-urile din registrul care trebuie reparate înainte, sau cu cea mai mică schimbare de cod. |
| **Cum se verifică** | Testul concret care închide rândul. Nu „se uită codul". |

**Estimările de efort sunt ale orchestratorului, pe baza întinderii reale a codului citit.** Nu sunt măsurate și nici nu includ costuri furnizor.

---

## 1. P0 — Blocant de lansare (23 rânduri)

Acestea sunt singurele 23 care contează pentru întrebarea „când poate lua bani?". Restul backlog-ului e important, dar nu e prioritar față de ele. **6 dintre ele au fost descoperite pe sistemul viu** și sunt în §1.6.

### 1.1 Siguranța plății (4 rânduri)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-01 | `PROV-01` | **Poarta de capacitate a discului**: `freeDisk` (MB) vs `instance.disk` (GB) → aceeași unitate | 0,5 z | — | Test unitar: o instanță cu `disk` peste `freeDisk` e respinsă cu un mesaj explicit; rulare pe nod cu valoare reală |
| B-02 | `PROV-02` | **Compensare la eșec**: la provisionare nereușită, serverul e șters, alocarea eliberată, comanda marcată pentru refund și refundul executat | 2 z | B-01 | Un job eșuat forțat ⇒ starea finală e „fără server, fără alocare, ban înapoi", verificabil în DB |
| B-03 | `COMM-01` + `PROMO-01` | **Reducerea ajunge la Stripe**: `unit_amount` = suma real discountuită; `verifyAmount` compară aceeași sumă | 1,5 z | — | Un checkout cu cod de promoție ajunge la Stripe cu prețul redus și `amount_total` identic cu `order.total` |
| B-04 | `COMM-02` | **Prețul stocat = prețul configurației**: importul scrie prețul calculat, nu `baseAmount`; plus o reconciliere pentru instanțele existente | 1 z | — | Estimarea lunară din panoul client e egală cu prețul de configurare; cele 3 instanțe existente sunt corectate și reconciliate |

> **B-03 e condiția minimă pentru ca orice campanie cu reducere să poată rula.** Până la el, `PROMO-02` (limită per cont), `PROMO-03` (plafon atomic), `PROMO-06` (`FIXED` fără plafon) și `PROMO-11` (simulatorul care arată alt preț) rămân blocate de faptul că niciun cod cu reducere nu poate ajunge la final.

### 1.2 Produsul vândut (4 rânduri)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-05 | `PROV-04` | **Cheile Stripe live + `PAYMENTS_ENABLED=true`** + o alarmă la lipsa secretului de webhook | 0,5 z (excluzând aprobarea contului) | — | Un checkout real cu plată reală; un webhook real acceptat; unul falsificat refuzat; lipsa cheii produce o alarmă, nu un 503 mut |
| B-06 | `PRICE-01` + `PRICE-02` + `PRICE-04` | **Catalogul public arată doar produsul real**: cele 4 produse fără egg ies din preț și din interfața de deploy; „Coming soon" → „indisponibil pe acest server" | 1 z | — | `GET /api/catalog/products` listează un singur produs cu preț; interfața nu afișează preț pentru servicii inexistente |
| B-07 | `PROV-05` | **Starea reală a containerului**: `ONLINE`/`OFFLINE` sincronizate cu panoul; `RESTARTING` resetat; `DEGRADED` scris | 2 z | B-08 | Un container oprit manual se reflectă în UI în cel mult 30 s; panoul nu mai raportează `state = None` pentru un server existent |
| B-08 | `PROV-11` + `PROV-06` | **Sincronizarea infrastructurii**: rularea lui `POST /admin/infrastructure/sync`; `feature_limits` realiste pentru produsul vândut | 0,5 z | acces la panou | Tabelele `Node` și `Egg` sunt populate; `feature_limits` nu mai promite baze de date și backupe pe produse care nu le au |

### 1.3 Date și supraviețuire (4 rânduri)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-09 | `INF-02` + `DR-02` + `DR-04` | **Backup programat + o copie în afara hostului** pentru: baza de date a platformei, secretele `.env`, și fișierele clienților (backup Pterodactyl per server, sau snapshot zilnic al volumelor de pe nod) | 4 z | țintă de backup (nu există încă) + acces la VM 101 | Un restore complet din copia off-host, pe o mașină goală, cu un drill scris și datat |
| B-10 | `INF-01` + `INF-03` | **RAID 1 (sau o cale echivalentă) pe `/`** în loc de RAID 0 | 4 z | downtime + backup-ul de la B-09 | `md1` raportează `raid1`; un test de citire după simularea pierderii unui disc |
| B-11 | `COMM-08` | **Retenție la anulare**: termen explicit, export înainte de ștergere, `auto_delete_cancelled_instances` setat | 1,5 z | — | O anulare marchează serverul pentru ștergere după termen și generează un export |
| B-12 | `COMM-07` | **Plan anual real**: interval `YEARLY` implementat end-to-end, cu preț și cu reînnoire locală | 3 z | B-03 | Un plan anual se cotează, se plătește și generează o perioadă de 12 luni în DB |

### 1.4 Securitate și expunere (3 rânduri)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-13 | `SEC-01` + `SEC-28` + `INF-04` + `INF-05` | **Firewall efectiv pe hipervisor, VM 102 și VM 103**: se închid `8006`, `111` și porturile de administrare de pe IP-ul public; `rpcbind` se limitează la loopback | 3 z | — | `ss -lntp` nu arată porturi de administrare pe `0.0.0.0`; din exterior, acele porturi sunt filtrate |
| B-14 | `SEC-01` | **Rotația parolei de `root`** + `PermitRootLogin prohibit-password` + `PasswordAuthentication no` | 0,5 z | B-13 (altfel e un lockout) | `sshd -T` arată valorile noi; autentificarea cu parolă e refuzată |
| B-15 | `SEC-04` + `SEC-03` + `SEC-12` | **TLS intern + HSTS/CSP + corectarea escaladării de privilegii** prin `PUT /admin/staff/:userId` | 2 z | — | Un `PUT` cu rol țintă `root_admin` e refuzat; `curl -I https://blipmade.com` arată `Strict-Transport-Security` și o `Content-Security-Policy` |

### 1.5 Lipsa unei plăți reale dovedite (2 rânduri)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-16 | `COMM-04` + `COMM-05` | **`renew()` nu mai fabrică facturi `PAID`**; `invoice.paid` prematur consumat e reluat; reconciliere cu Stripe | 3 z | B-05 | Sweep-ul cu Stripe neconfigurat **nu** creează nicio factură; un `invoice.paid` înainte de `checkout.session.completed` produce o factură, nu o pierdere |
| B-17 | `PROV-13` + `PROV-07` | **Fereastra de server dublu închisă** (idempotency key pe provisionare) + numerotare atomică a comenzilor | 2 z | — | Două rulări simultane ale aceluiași job creează **un** server; 100 de comenzi consecutive nu produc `P2002` |

---

### 1.6 P0 descoperite pe sistemul viu, după primele rapoarte (A11, A08)

Aceste 6 rânduri au apărut **după** ce backlog-ul inițial a fost scris, în urma verificării live a drumului de onboarding și a analizei competitive. **Sunt mai grave decât media P0-urilor de mai sus**, pentru că arată că produsul vândut nu e doar neplătit — nu e nici măcar funcțional.

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| **B-74** | `OPS-01` | **Produsul vândut trebuie să conțină aplicația.** Containerul are doar `.npm/`, `bm-test.txt`, `bm-test copy.txt` — niciun `package.json`, niciun `index.js` — iar startup-ul e `npm run start`. Construirea imaginii reale a produsului, cu aplicația pornită și un health-check al ei | 3–5 z | decizie de produs: ce aplicație rulează | Un container pornit raportează `state: online`, `uptime > 0`, memorie nenulă, **și** endpoint-ul aplicației răspunde |
| **B-75** | `OPS-02` | **Provisionarea e condiționată de plată.** Comanda trebuie să fie în `PAID` înainte de a se crea o instanță; altfel, o comandă `AWAITING_PAYMENT` sau `PENDING` produce un server gratuit | 1 z | — | O comandă neplătită, abandonată la pasul de plată, **nu** produce nicio instanță și nicio alocare |
| **B-76** | `OPS-03` | **Canalul de suport trebuie să funcționeze.** `notifyStaff()` trimite prin `sendMail`; cu `mail: file` ajunge într-un fișier și nimeni nu o citește. Cu releul SMTP rezolvat (condiția 2 din decizie), verificarea e că un bilet nou generează o notificare **livrată**, nu o linie `[mail:file]` | 0,5 z | condiția 2 (SMTP) | Un bilet nou produce o notificare livrată în inboxul de staff; `/status` nu mai raportează „Support — Degraded" din cauza e-mailului |
| **B-77** | `OPS-04` | **URL-ul public al instanței.** `DOMAIN_BASE`, `CADDY_ADMIN_URL` și `CADDY_ADMIN_TOKEN` sunt goale, `InstanceDomain` = 0 rânduri ⇒ „No public URL yet", permanent. Trebuie fie un mecanism de subdomeniu generat dinamic, fie un proxy care nu depinde de API-ul de admin Caddy | 2–3 z | B-78 | O instanță provisionată primește un URL public care răspunde, și DNS-ul se rezolvă |
| **B-78** | `OPS-05` | **Caddy-ul trebuie să poată publica subdomenii** — API-ul de admin Caddy nu e expus (`/etc/caddy/Caddyfile` nu are bloc `admin`), deci `gateway.ts` nu poate crea rute | 1 z | acces la VM 102 | Un subdomeniu nou e creat programatic și răspunde |
| **B-79** | `PORT-01` + `PORT-02` + `PORT-06` | **Cardul de preț se recalculează pe baza floor-ului, nu pe baza pieței.** La `C_node ≈ €54.44` (ancoră Contabo VPS 60, `INFERRED` — **operatorul trebuie să o înlocuiască**), floor-ul e €3.40 la 1 vCPU și €6.81 la 2 vCPU. `discord-bot` la €1.72 e sub floor **și** sub prețul de piață (€0) | 0,5 z | D-1 | Prețul fiecărui produs e peste floor-ul lui, la configurația vândută |

### 1.7 De ce B-74 schimbă ordinea

Până la B-74, planul presupunea că „se repară provisionarea și se vinde produsul". **B-74 arată că produsul nu există încă ca aplicație.** Ordinea corectă devine:

1. **B-74** — există o aplicație care rulează într-un container.
2. **B-75** — nu se poate obține un server fără plată.
3. **B-01, B-02** — provisionarea e fiabilă.
4. **B-77, B-78** — serverul e accesibil din internet.
5. Abia apoi: portofoliul, prețul, campania.

O platformă cu un produs care nu rulează, dar cu checkout, facturare și marketing funcționale, e o platformă care **vinde ceva ce nu funcționează**. E exact starea de azi, minus checkoutul.

---

## 2. P1 — Înainte de lansarea publică (24 rânduri)

Necesare pentru ca platforma să poată fi vândută public fără să mintă și fără să piardă încrederea.

### 2.1 Veridicitatea prețurilor și a promisiunilor (6)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-18 | `PRICE-03` + `COMM-09` | **Unitatea se spune în contract**: `price.amountMinor` sau un câmp `price.unit`, în API, în contract și în interfață | 0,5 z | — | `docs/API_CONTRACT.md` și payloadul API spun explicit „minor units"; un integrator nu poate citi greșit |
| B-19 | `COMM-10` | **Un produs nou nu pornește gratuit**: `baseAmount` implicit nenul sau produsul e ascuns până la preț setat | 0,5 z | — | Un produs creat prin admin fără preț nu apare public |
| B-20 | `COMM-11` + `PROMO-04` | **`PATCH` și `DELETE` pe promoții**, cu oprire imediată | 1 z | — | O promoție greșită se oprește din interfață în mai puțin de un minut |
| B-21 | `PROMO-02` + `PROMO-03` | **`maxPerUser` setabil** + plafon aplicat atomic | 1,5 z | B-03 | O campanie „primii 50 eligibili" se oprește la 50, per cont, fără cursă |
| B-22 | `PROMO-12` + `PROMO-05` + `COMM-12` | **Contorul unic**: ecranul arată numărul efectiv de rezervări + plăți, `usedCount` devine cel apli-cat, `PromotionRedemption.amount` e citit sau câmpul e eliminat | 1 z | — | Ce arată operatorul e chiar plafonul aplicat |
| B-23 | `PROMO-10` + `PROMO-11` + `PRICE-06` | **Copy-ul public se potrivește cu realitatea**: reducerile promise apar doar când sunt realizabile; simulatorul arată prețul care ar fi taxat | 1 z | B-03 | Fiecare afirmație de reducere din interfață are un test automat care dovedește că funcționează |

### 2.2 Corectitudinea operațională (8)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-24 | `COMM-03` | **`applyUpgradeOrder()` verifică plata** înainte de a aplica upgrade-ul | 0,5 z | — | Un upgrade cu `order.status != 'PAID'` e refuzat |
| B-25 | `COMM-06` | **O comandă anulată nu poate fi plătită și onorată**: `stripe.ts` respinge `session` pentru ordine anulate | 1 z | — | Un `checkout.session.completed` pe o comandă anulată e refuzat și nu provisionează |
| B-26 | `PROV-08` | **Comanda `UPGRADE` orfană e ștersă** dacă checkout-ul eșuează | 0,5 z | — | Un checkout eșuat nu lasă `PENDING` cu `total > 0` |
| B-27 | `PROV-09` | **Upgrade-ul verifică capacitatea nodului** înainte de a extinde | 0,5 z | B-01 | Un upgrade peste limita nodului e refuzat |
| B-28 | `PROV-10` | **Pasul de eroare e raportat corect** la provisionare | 0,5 z | — | Un job eșuat raportează pasul real, nu `server_created` |
| B-29 | `PROV-03` | **Joburile eșuate nu sunt șterse**; o coadă de eșecuri e păstrată și alertată | 0,5 z | — | Un job eșuat e vizibil 30 de zile și a declanșat o alarmă |
| B-30 | `PROV-12` | **Creditul la degradare ajunge la client** și când nu există abonament | 1 z | — | O degradare cu credit produce o linie în istoricul clientului |
| B-31 | `PROV-14` | **Invalidarea cache-ului de produse** (sau decizia documentată că nu există cache) | 0,5 z | — | O schimbare de preț se vede în catalog în cel mult 60 s |

### 2.3 Igiena operațională și de conformitate (6)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-32 | blocaj SMTP din §4 condiția 2 | **Cheia `SMTP_URL` reală** + e-mail de verificare și de resetare **livrate** + notificări către client și suport | 1 z | cont de relay | Un e-mail de resetare ajunge în inboxul real, nu în fișier |
| B-33 | `SEC-29` + `SEC-23` | **Cheia API a agentului operatorului e scoasă din argumentele procesului**; `ADMIN_ENROLLMENT_KEY` e eliminat din `.env` după prima utilizare | 0,5 z | — | `ps auxww` nu arată cheia |
| B-34 | `SEC-18` | **Transportul de e-mail în fișier devine 0600** și e golit la intervale regulate | 0,5 z | — | `docker inspect` arată `0600`; fișierul e gol după rulare |
| B-35 | `SEC-11` | **Secretele separate de configurație**, cu `SESSION_SECRET` rotit prin procedură cu cale de resetare | 2 z | B-16 | Rotirea se poate executa fără să deconecteze definitiv clienții (sau plan de re-autentificare) |
| B-36 | `DOC-01`…`DOC-13` | **Documentația corectată** — 13 derivații, dintre care 4 critice | 1 z | — | `docs/PRODUCTION_READINESS.md` și `docs/IMPLEMENTATION_STATUS.md` trec printr-un nou tabel de verificare, cu 0 `wrong` |
| B-37 | `CAP-02` + `INF-01` | **Decizia documentată despre al doilea nod** (64 GiB, nu 128) și despre spațiul liber real | 0,5 z | — | Un document de decizie cu numărul de clienți și costul |

### 2.4 Ce e de făcut înainte de lansare, dar **nu** e P0 (4)

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-38 | `SEC-06` | Limită de rată pe cele 29 de rute mutante autentificate | 1 z | — | Un test de sarcină arată 429 la prag |
| B-39 | `SEC-07` | Limită de login per cont, nu doar per adresă | 0,5 z | — | 10 încercări pe același cont, de la adrese diferite, se blochează |
| B-40 | `SEC-19` | Se ascunde existența contului la înregistrare | 0,5 z | — | Răspunsul e identic pentru e-mail existent și inexistent |
| B-41 | `SEC-16` | Eșecul de autorizare al `/webhooks/stripe/replay` răspunde 401, nu 200 | 0,5 z | — | Un replay neautorizat e refuzat cu cod ne-2xx |

---

## 3. P2 — După lansare, înainte de scalare (18 rânduri)

Nu blochează lansarea, dar blochează **creșterea**. Ordinea contează: primele 6 sunt legate de cost și de riscul financiar.

| # | Constatări | Ce se repară | Efort | Depinde de | Cum se verifică |
|---|---|---|---|---|---|
| B-42 | `CAP-03` | **Cardul de preț mutat la €9.99** pentru produsul vândut, cu pragurile din `09-pricing-recommendations.md` §1 | 0,5 z | B-19 | Prețul afișat e €9.99; contribuția per client e pozitivă la configurația implicită |
| B-43 | — | **Instrumentare de bază**: evenimente de conversie, venit recunoscut, cost per client | 3 z | — | Un raport lunar poate fi produs fără interogare manuală a DB-ului |
| B-44 | `PROV-14` | Cache invalidat (dacă nu e deja acoperit de B-31) | — | B-31 | — |
| B-45 | `COMM-08` | Export automat al datelor clientului înainte de ștergere (complementar al lui B-11) | 1 z | B-11 | Exportul e descărcabil din interfață |
| B-46 | `SEC-05` | `TRUSTED_PROXIES` setat explicit | 0,5 z | — | `api/src/env.ts` citește variabila și o validează |
| B-47 | `SEC-09` | Validarea segmentelor de cale interpolate în URL-urile panoului | 1 z | — | Un segment malițios e respins cu 400 |
| B-48 | `SEC-10` | Traseul `catch-all` DELETE nu poate distruge un server; `panel-bridge` primește un allow-list de operații | 1 z | acces la panou | Un DELETE cu o cale nepermisă e respins |
| B-49 | `SEC-12` + `SEC-14` + `SEC-15` | HSTS, CSP, `X-Frame-Options`, CORS corect | 1,5 z | B-15 | Antetele sunt prezente; CORS nu combină `Allow-Credentials` fără `Allow-Origin` |
| B-50 | `SEC-13` | Containere ca non-root, `read_only`, `cap_drop` complet | 2 z | — | `docker inspect` arată configurația întărită |
| B-51 | `SEC-20` | `scrypt` la parametrii OWASP; `deriveKey` înlocuit cu un KDF dedicat pentru operații la rece | 1 z | — | Benchmark-ul de autentificare nu se degradează vizibil |
| B-52 | `SEC-21` | Parola de panou generată cu un generator criptografic | 0,5 z | — | `Math.random()` nu mai apare în generatoare de secrete |
| B-53 | `SEC-22` | `COOKIE_SECURE` setat în producție; `env.cookieSecure` fie devine real, fie dispare | 0,5 z | — | Cookie-urile de sesiune au `Secure` în producție |
| B-54 | `SEC-17` | `/api/status` nu mai expune detalii de configurație public | 0,5 z | — | Răspunsul public nu conține starea Stripe/mail/panou |
| B-55 | `SEC-26` | `PUT /admin/settings` cu allow-list de chei | 0,5 z | — | O cheie necunoscută e respinsă cu 400 |
| B-56 | `SEC-25` | Timeout de inactivitate pe sesiuni și re-autentificare la 14 zile | 1 z | — | O sesiune inactivă expiră |
| B-57 | `SEC-27` + `SEC-23` + `SEC-24` | Comparații de token în timp constant; eșecul de audit nu mai e înghițit | 1 z | — | — |
| B-58 | `SEC-14` + `NET-04` | Origine protejată: autentificare de origine sau retragerea adreselor de origine din DNS | 1 z | — | — |
| B-59 | `NET-01` + `NET-03` | **Cele trei adrese publice goale se fie atribuie, fie se elimină din DNS**; portul de alocare închis se deschide | 1 z | acces la nod | Fiecare adresă declarată în DNS servește ceva sau e înlăturată |

---

## 4. P3 — Igienă, consistență, cunoștințe (14 rânduri)

| # | Constatări | Ce se repară | Efort |
|---|---|---|---|
| B-60 | `SEC-08` | Verificarea deținerii adresei de e-mail | 1 z |
| B-61 | `DOC-07` | Contractul API actualizat cu cele 20 de rute live lipsă și cu ruta care nu există | 1 z |
| B-62 | `DOC-03` + `DOC-11` | Numărul de teste și dimensiunile bundle-ului corecte în toate documentele | 0,5 z |
| B-63 | `DOC-04` + `DOC-13` | Răspunsul de health și inventarul modelelor corecte în documentație | 0,5 z |
| B-64 | `DOC-08` + `DOC-09` + `DOC-10` + `DOC-12` | Webhook, e-mail, modele, permisiuni, migrări: descrieri corecte | 1 z |
| B-65 | `DR-01` | Documentul de recuperare are un copilot, o ordine și o listă de decizii, nu doar un plan | 1 z |
| B-66 | `DR-03` | Procedura de rotire a secretelor e scrisă și testată | 0,5 z |
| B-67 | `INF-07` | `rclone` e instalat pe VM 103 **sau** scriptul de backup offsite e rescris cu o unealtă prezentă | 0,5 z |
| B-68 | `INF-08` | Actualizarea Caddyului la o versiune întreținută | 1 z |
| B-69 | `CAP-04` | Swap-ul pe `md2` e raid0: fie se repară, fie se documentează explicit ca sacrificiu acceptat | 1 z |
| B-70 | `DR-05` | **Accesul de audit la VM 100 și VM 101** — cheie read-only în `authorized_keys` + pornirea QEMU guest agent pe nod | 0,5 z |
| B-71 | `DOC-02` + `PROV-11` | Documentul de runbook corectat despre starea nodului și a punții | 0,5 z |
| B-72 | `SEC-29` | Cheia de audit a agentului e într-o locație cu acces restrâns, nu în `ps` | 0,5 z |
| B-73 | `NET-01` | Inventarul de adrese publice e menținut într-un singur loc, ca să nu se mai degradeze | 0,5 z |

---

## 5. Undele de execuție

Ordinea e stabilită de **dependențe**, nu de efort. Undele se pot suprapune dacă sunt mai mulți oameni.

### Unda 0 — Deblocări (fără schimbare de cod, 1–2 zile)

| Acțiune | De ce e prima |
|---|---|
| Cheie Stripe de **test** într-un mediu de test, nu în producție | Fără asta, niciun test de plată nu se poate executa |
| Relay SMTP (Brevo/Resend sau similar) | Altfel niciun e-mail nu ajunge nicăieri |
| Țintă de backup off-host | Altfel B-09 nu are destinations |
| **Cheie read-only de audit pe VM 100 și VM 101** + QEMU guest agent pe nod | 19 afirmații rămân `unverifiable` fără asta; poarta 7 nu poate fi evaluată complet |
| **Rularea lui `POST /admin/infrastructure/sync`** | Precondiție pentru B-07 și B-08 |

### Unda 1 — Siguranța plății (5 rânduri, ~5 zile)

`B-01` → `B-02` → `B-03` → `B-04` → `B-16` → `B-17`
Toate sunt în `api/src/services/provisioning.ts`, `api/src/services/stripe.ts` și `api/src/routes/webhooks.ts`. Se pot face într-un singur commit logic, cu migrări dacă e nevoie.

### Unda 2 — Produsul vândut (7 rânduri, ~9 zile)

`B-74` → `B-75` → `B-06` → `B-07` → `B-08` → `B-05` → `B-77` + `B-78`
`B-05` depinde de Unda 0 (cheia Stripe). `B-06` e independent și se poate face imediat — e o modificare de afișare, nu de logică.
`B-74` (aplicația există) e primul: fără ea, provisionarea reparată tot nu produce nimic funcțional.

### Unda 2b — Canalul de suport (1 rând, 0,5 zile)

`B-76` — după ce SMTP-ul e rezolvat (Unda 0). E cel mai ieftin rând din tot backlog-ul și deschide calea de suport pentru beta.

### Unda 3 — Siguranța infrastructurii (4 rânduri, ~7 zile)

`B-13` → `B-14` (ordine strictă: firewallul înainte de rotație, altfel e lockout)
`B-09` + `B-10` în paralel, după Unda 0.
`B-15` în paralel.

### Unda 4 — Adevărul comercial (6 rânduri, ~4 zile)

`B-18` → `B-19` → `B-20` → `B-21` → `B-22` → `B-23` → `B-42`
Toate în `api/src/routes/admin.ts`, `api/src/routes/catalog.ts`, `api/src/services/pricing.ts`, `web/src/admin/Promotions.tsx`, `web/src/home/Catalog.tsx`.

### Unda 5 — Închiderea porților pentru beta (5 rânduri, ~3 zile)

`B-11`, `B-12`, `B-24`…`B-31`, `B-32`…`B-37`
Aici se execută **cele 20 de rulări consecutive** comandă → plată → provisionare → activare din condiția 6 a deciziei go/no-go, și **drill-ul de restaurare** din condiția 3.

### Unda 6 — După lansare

P2 și P3, în ordinea din §3 și §4.

---

## 6. Ce nu e în backlog, pentru că nu e o alegere de inginer

Aceste patru au nevoie de o **decizie a operatorului**, nu de o schimbare de cod. Fără ele, backlog-ul nu ajunge la GO.

| # | Decizie | Ce e nevoie | Ce blochează |
|---|---|---|---|
| D-1 | **Prețul de lansare** | Aprobarea cardului la €9.99 (sau altceva) | B-42, modelul economic, scenariul B |
| D-2 | **Ținta de backup** | Alegerea unui provider/țintă off-host și a bugetului | B-09, poarta 9 |
| D-3 | **Accesul la VM 100 și VM 101** | Cheia de audit + pornirea QEMU guest agent | 19 afirmații `unverifiable`, poarta 7 |
| D-4 | **Statutul comercial și termenii** | Confirmarea celor trei adrese românești de la SEC-01, și decizia asupra regimului juridic și fiscal | Conformitate, și lectura corectă a SEC-01 |

---

## 7. Criteriul de ieșire din backlog

Backlog-ul e închis când:

1. Toate cele **17 rânduri P0** sunt închise și verificate prin criteriul din coloana „Cum se verifică".
2. Cele **9 condiții** din `16-GO-NO-GO-DECISION.md` §4 sunt îndeplinite și dovedite.
3. **Cele 20 de rulări consecutive** reușesc, cu 0 servere orfane.
4. **Un drill de restaurare** din copia off-host reușește, cu data și rezultatul scrise.
5. **Un checkout real cu plată reală** reușește, cu webhook acceptat și unul falsificat refuzat.
6. **Cel puțin un container rulează efectiv**, cu aplicația produsului în interior, verificat de pe nod.

Până atunci, scenariul C (waitlist) e singurul permis.
