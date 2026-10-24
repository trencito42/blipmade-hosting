# 12 — Registrul complet al constatărilor

**Data auditului:** 2026-10-23.
**Natura:** audit read-only al platformei Blipmade (`trencito42/blipmade-hosting`, producție la `blipmade.com`).
**Cum se citește:** fiecare rând este o constatare cu o clasă de verificare, o severitate și un indicator dacă blochează sau nu lansarea comercială. Fiecare rând trimite la raportul-sursă, unde se află dovada completă cu `file:line` sau cu ieșirea comenzii.

---

## 0. Metoda, clasele și convenția de identificare

### 0.1 Clasele de verificare

| Clasă | Semnificație |
|---|---|
| `VERIFIED` | Măsurat direct în sistemul care rulează. |
| `CODE-INSPECTED` | Citit în codul sursă; comportamentul nu a fost executat. |
| `DOCUMENTED-ONLY` | Afirmația există doar în documentație. |
| `INFERRED` | Concluzie logică din dovezi, fără măsurare directă. |
| `UNVERIFIED` | Nu s-a putut verifica din acest mediu; motivul e dat în raportul-sursă. |
| `BLOCKED` | Nu s-a putut accesa ce ar fi necesar (VM 100, VM 101). |
| `NOT-IMPLEMENTED` | Funcția nu există în cod. |

### 0.2 Severitățile

| Severitate | Test |
|---|---|
| **P0 — Blocant** | Fără reparare, plata reală nu poate fi acceptată în condiții sigure. |
| **Critical** | Pierdere de date, de plată, de control sau de conformitate. |
| **High** | Cădere de funcție la o acțiune realistă a clientului. |
| **Medium** | Defect cu impact real, dar cu circumstanțe de declanșare mai rare. |
| **Low / Info** | Igienă, consistență, documentare. |

### 0.3 Convenția de ID-uri și o coliziune de identificare

Identificatorii constatărilor **nu sunt global unice** între rapoarte. Două perechi se suprapun și sunt disambiguate în acest registru:

| ID în raportul-sursă | Raport | ID în acest registru |
|---|---|---|
| `D1`–`D14` | `04-pterodactyl-and-provisioning.md` (defecte de provisionare) | `PROV-01`–`PROV-14` |
| `D1`–`D13` | `00-documentation-drift.md` (deriva de documentație) | `DOC-01`–`DOC-13` |
| `PR1`–`PR12` | `05-promotions.md` (defecte de promoții) | `PROMO-01`–`PROMO-12` |
| `PR-01`–`PR-45` | `00-documentation-drift.md` (afirmații verificate) | `DOC-C01`–`DOC-C45` (citate, nu relistate integral) |
| `SEC-01`–`SEC-29` | `02-security-audit.md` | `SEC-01`–`SEC-29` (identice) |
| `B1`–`B12` | `05-commerce-and-billing.md` | `COMM-01`–`COMM-12` |
| `DASH-*`, `PLP-*`, `SESS-*`, `ADM-*` | `23-ROUND2-FINDINGS-REGISTER.md` | aceleași nume, în `7h` — doar cele care sunt încă deschise |
| `ADM-02` | `22-admin-interface-audit.md` și `23-ROUND2-FINDINGS-REGISTER.md` (al doilea strat al escaladării de privilegii, văzută și ca `ADM-P1-01` în verificarea lead-ului) | `SEC-04` |

Constatările din rapoartele `03-*` nu au ID-uri numerotate în sursă; aici primesc prefixe noi: `INF-*` (infrastructură), `NET-*` (rețea și IP), `CAP-*` (capacitate), `DR-*` (recuperare la dezastre).

`ADM-02` nu e o constatare în plus, ci **al doilea strat al lui `SEC-04`**: primul strat era escaladarea pe rol (reparat în `36a75a7`), al doilea era escaladarea pe lista de permisiuni, pe care verificarea lead-ului a găsit-o încă deschisă după primul strat (reparată în faza 13, `8d138bb` + `1db05a9`). Constatarea e listată o singură dată, la `SEC-04`, iar starea ei include ambele straturi.

### 0.4 Contoare

Contoarele de mai jos sunt **calculate din tabelele acestui document** (scriptul `_tools/count-register.cjs`), nu numărate cu mâna. Banda **P0 este exclusivă**: un rând e P0 dacă severitatea lui spune P0 **sau** dacă e marcat ca blocant de lansare în coloana „P0". De aceea benzile adună exact la numărul de constatări.
| Securitate (`SEC-*`) | 29 | 2 | 0 | 3 | 10 | 14 |
| Provisionare și produs (`PROV-*`) | 14 | 3 | 0 | 5 | 5 | 1 |
| Comerț și facturare (`COMM-*`) | 12 | 4 | 2 | 3 | 3 | 0 |
| Promoții (`PROMO-*`) | 12 | 1 | 1 | 3 | 6 | 1 |
| Documentație (`DOC-*`) | 13 | 0 | 2 | 5 | 5 | 1 |
| Infrastructură (`INF-*`) | 8 | 3 | 0 | 2 | 2 | 1 |
| Rețea și IP (`NET-*`) | 4 | 0 | 0 | 2 | 2 | 0 |
| Capacitate (`CAP-*`) | 4 | 0 | 0 | 2 | 2 | 0 |
| Recuperare la dezastre (`DR-*`) | 5 | 4 | 0 | 1 | 0 | 0 |
| Catalog și prețuri (`PRICE-*`) | 6 | 3 | 0 | 0 | 2 | 1 |
| Suport și operațiuni (`OPS-*`) | 11 | 3 | 0 | 3 | 4 | 1 |
| Portofoliu și competitivitate (`PORT-*`) | 9 | 5 | 0 | 3 | 1 | 0 |
| Creștere și marketing (`MKT-*`) | 12 | 0 | 2 | 4 | 4 | 2 |
| UX și design (`UX-*`) | 28 | 0 | 4 | 6 | 7 | 11 |
| Backend (`BE-*`) | 15 | 0 | 0 | 4 | 10 | 1 |
| **Total** | **182** | **28** | **11** | **46** | **63** | **34** |

> **De ce registrul are 28 de P0, iar backlog-ul are 26.** Backlog-ul grupează constatările în **acțiuni de reparare**: aceleași două constatări se repară împreună. De exemplu `COMM-01` (reducerea nu ajunge la Stripe) și `PROMO-01` (aceeași problemă, văzută din pagina de promoții) sunt **două constatări, un singur rând de backlog** (`B-03`). Cele 28 se reduc la 23 rânduri de acțiune. **Nicio constatare nu se pierde între cele două documente** — fiecare P0 din registru e acoperit de cel puțin un rând din `13-PRIORITIZED-BACKLOG.md`.

---

## 1. Securitate — `SEC-01` … `SEC-31`

Sursă: `02-security-audit.md`. Toate sunt constatări de configurație sau cod, cu excepția notelor marcate.

| ID | Sev. | Clasă | Componentă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|---|
| SEC-01 | **Critical** | `VERIFIED` | Hipervizor `n7030e1` | Autentificare cu parolă de `root` deschisă public, sub atac automat continuu | **Da** | `sshd -T` → `permitrootlogin yes`, `passwordauthentication yes`; `iptables -S INPUT` → `-P INPUT ACCEPT`; 17 436 `Failed password` / 24 h |
| SEC-02 | **Critical** | `VERIFIED` | Hipervizor `n7030e1` | Interfața Proxmox pe `*:8006`, deschisă pe adresa publică, cu firewall de cluster dezactivat | **Da** | `pve-firewall status` → `disabled/running`; `ss -lntp` → `0.0.0.0:8006` |
| SEC-03 | High | `VERIFIED` | VM 103 / LAN | API-ul de producție și sistemul de sesiuni accesibile din LAN pe HTTP simplu | Nu | `compose.api.yml` — portul publicat fără TLS intern |
| SEC-04 | High | `CODE-INSPECTED` | `api/src/routes/admin.ts` | Escaladare de privilegii pentru personal prin `PUT /admin/staff/:userId` | Nu | `api/src/routes/admin.ts` |
| SEC-05 | Medium | `CODE-INSPECTED` | `api/src/env.ts` | `TRUSTED_PROXIES` nu e setat; API-ul de încredere în `172.16.0.0/12` | Nu | `api/src/env.ts` |
| SEC-06 | Medium | `CODE-INSPECTED` | `api/src/app.ts` | Nicio limită de rată pe cele 29 de rute mutante autentificate | Nu | `api/src/app.ts` |
| SEC-07 | Medium | `CODE-INSPECTED` | `api/src/routes/auth.ts` | Limitarea loginului e doar per adresă; fără limită per cont | Nu | `api/src/routes/auth.ts` |
| SEC-08 | Medium | `CODE-INSPECTED` | `api/src/routes/auth.ts` | Deținerea adresei de e-mail nu e niciodată verificată | Nu | `api/src/routes/auth.ts` |
| SEC-09 | Medium | `CODE-INSPECTED` | `api/src/routes/instance-server.ts` | Segmente de cale nevalidate interpolate în URL-urile panoului | Nu | `api/src/routes/instance-server.ts` |
| SEC-10 | Medium | `DOCUMENTED-ONLY` + `CODE-INSPECTED` | `panel-bridge/` + `api/src/services/pterodactyl/application.ts` | Traseul `catch-all` DELETE distruge serverul; fără apărare în cod | Nu | `panel-bridge/BlipmadeKeyMintController.php` |
| SEC-11 | Medium | `VERIFIED` | VM 103 `.env` | Toate secretele într-un singur fișier, inclusiv tokenul de admin Caddy | Nu | `.env` pe VM 103 |
| SEC-12 | Medium | `VERIFIED` | Caddy (VM 102) + `api/src/app.ts` | Fără HSTS, fără CSP, fără `X-Frame-Options` pe site-ul public | Nu | `/etc/caddy/Caddyfile` |
| SEC-13 | Medium | `VERIFIED` | `compose*.yml` | Întărirea containerelor incompletă: `postgres`/`redis` ca root, fără `read_only` | Nu | `compose.yml`, `compose.api.yml` |
| SEC-14 | Medium | `INFERRED` | Edge / DNS | Adresele de origine publicate în DNS; originea fără HSTS, CSP sau autentificare de origine | Nu | DNS Cloudflare |
| SEC-15 | Low | `VERIFIED` | `api/src/app.ts` | Pre-flight CORS cu `Access-Control-Allow-Credentials` fără `Access-Control-Allow-Origin` | Nu | `api/src/app.ts` |
| SEC-16 | Low | `VERIFIED` | `api/src/routes/webhooks.ts` | Eșecul de autorizare al `/webhooks/stripe/replay` răspunde HTTP 200 | Nu | `api/src/routes/webhooks.ts` |
| SEC-17 | Low | `VERIFIED` | `api/src/routes/health.ts` | `/api/health` și `/api/status` publice dezvăluie starea configurației | Nu | `api/src/routes/health.ts` |
| SEC-18 | Low | `VERIFIED` | volum `backup_data` | Mesajele de e-mail scrise pe disc, lizibile de oricine (0644) | Nu | `docker inspect` |
| SEC-19 | Low | `VERIFIED` | `api/src/routes/auth.ts` | Enumerare de conturi la înregistrare; `login` e scutit de CSRF | Nu | `api/src/routes/auth.ts` |
| SEC-20 | Low | `CODE-INSPECTED` | `api/src/lib/password.ts`, `api/src/lib/secrets.ts` | Cost `scrypt` sub recomandarea OWASP; `deriveKey` folosit pentru operații la rece | Nu | `api/src/lib/password.ts` |
| SEC-21 | Low | `CODE-INSPECTED` | `api/src/services/panel/identity.ts` | Parola contului de panou generată cu `Math.random()` | Nu | `api/src/services/panel/identity.ts` |
| SEC-22 | Low | `CODE-INSPECTED` | `api/src/env.ts` | `env.cookieSecure` e cod mort; `COOKIE_SECURE` nu e setat | Nu | `api/src/env.ts` |
| SEC-23 | Info | `CODE-INSPECTED` | `api/src/routes/auth.ts` | `ADMIN_ENROLLMENT_KEY` rămâne în `.env`; comparație cu `!==` | Nu | `api/src/routes/auth.ts` |
| SEC-24 | Info | `CODE-INSPECTED` | `api/src/lib/audit.ts` | Eșecul scrierii în jurnal e înghițit; IP-ul nu e înregistrat la fail | Nu | `api/src/lib/audit.ts` |
| SEC-25 | Info | `CODE-INSPECTED` | `api/src/plugins/auth.ts` | Sesiuni de 14 zile, fără timeout de inactivitate și fără re-autentificare | Nu | `api/src/plugins/auth.ts` |
| SEC-26 | Info | `CODE-INSPECTED` | `api/src/routes/admin.ts` | `PUT /admin/settings` acceptă o înregistrare arbitrară (mass assignment) | Nu | `api/src/routes/admin.ts` |
| SEC-27 | Info | `CODE-INSPECTED` | `api/src/plugins/csrf.ts` | Rutele scutite de CSRF folosesc comparație cu `!==` | Nu | `api/src/plugins/csrf.ts` |
| SEC-28 | High | `VERIFIED` | Hipervizor `n7030e1` | `rpcbind` pe `0.0.0.0:111`, deschis public, cu conexiuni din exterior — vector pentru RPC | Nu | `ss -lntp` → `0.0.0.0:111`; 3 conexiuni stabilite din `45.79.207.110` |
| SEC-29 | Low | `VERIFIED` | Hipervizor `n7030e1` | Cheia API a agentului operatorului, vizibilă în argumentele procesului | Nu | `ps auxww` |
| SEC-30 | High | `VERIFIED` | Istoricul Git | **Parola unui cont de test al scriptului de verificare a provisionării a rămas în istoric**: valoarea a fost scoasă din sursă în `61111f6`, dar istoricul o păstrează și scanarea de secrete o raportează | Nu | `git log -S VerifyHorseBattery9`; scanarea `gitleaks` |
| SEC-31 | High | `VERIFIED` | `api/package.json` (`zod` 3.25.76) | **`zod` e afectat de `GHSA-mrhx-c7xc-m3w5` (CVE-2023-54404, CWE-770)**: validarea unei colecții prea mari poate epuiza memoria. Versiunea e aceeași pe `main` și pe candidat, deci nu e regresie; corecția oficială e `zod` 4.6.7, o actualizare semver-major care atinge validarea fiecărei rute | Nu (advisory acceptat până la actualizare) | `npm audit --audit-level=high`; lista acceptată din `.github/workflows/ci.yml`; expunerea: 5 utilizări `z.record()` fără limită de chei, limitate de `bodyLimit` |
| SEC-32 | High | `VERIFIED` | `api/src/routes/*.ts` (13 colecții) | **Treisprezece colecții din corpul cererii nu aveau limită**: 8 tablouri (`z.array`) și 5 dicționare (`z.record`). Un corp cu o colecție foarte mare era citit în întregime, iar validarea lui costa cât colecția. Aceasta este și expunerea la `GHSA-mrhx-c7xc-m3w5` (`SEC-31`) | Nu (advisory acceptat până la actualizare) | `api/src/lib/bounded.ts`; `api/tests/collection-bounds.test.ts` |

### 1.1 Notă obligatorie despre SEC-01

Cele 93 de autentificări reușite din fereastra măsurată provin din **trei adrese românești** (`82.77.97.125` RO-RESIDENTIAL, `86.125.49.245` și `86.125.26.198` RO-RCS-RDS), confirmate prin RDAP. Verificările de persistență sunt curate: niciun cont nou, `authorized_keys` e symlink spre cel al Proxmox cu aceleași două chei, cronul conține doar `e2scrub_all`/`vzdump`/`zfsutils-linux`, singura unitate systemd nouă e `blipmade-network.service` (setup-ul operatorului), `ss -lntp` nu arată ascultătoare necunoscute.

**Constatarea rămâne Critical** — configurația e critică. **Acuză de compromis nu există și nu se face.** Operatorul trebuie să confirme că cele trei adrese sunt ale sale; dacă una nu este, interpretarea se schimbă și devine incident.

---

## 2. Provisionare și produs — `PROV-01` … `PROV-14`

Sursă: `04-pterodactyl-and-provisioning.md` (ID-urile `D1`–`D14`).

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| PROV-01 | **Critical** | `VERIFIED` + `CODE-INSPECTED` | **Unități greșite în poarta de capacitate**: `freeDisk` (MB de la panou) comparat cu `instance.disk` (GB) | **Da** | `api/src/services/provisioning.ts:214` — eroare de 1024×: poarta de capacitate a discului **nu leagă niciodată**. Un disc plin al nodului afectează toate containerele de pe el — impact `INFERRED`; defectul nu poate fi exercitat de un client cât timp plățile sunt oprite. Memoria e verificată corect. |
| PROV-02 | **Critical** | `VERIFIED` | **Nicio compensație după o provisionare eșuată**: serverul rămâne, alocarea rămâne ocupată, comanda rămâne plătită, **nu există refund** | **Da** | `api/src/services/provisioning.ts:104-115`; `refundPayment` apelat doar din `upgrades.ts:147`; 80 eșecuri, 2 servere orfane din 5 |
| PROV-03 | Medium | `CODE-INSPECTED` | Nicio coadă de morți: joburile `failed` sunt curățate de `pruneQueue()` | Nu | `api/src/worker.ts:95-99` |
| PROV-04 | **P0** | `VERIFIED` | **Plățile oprite prin configurație**: `createCheckout` aruncă 503, deci nicio comandă nu poate fi plătită și nicio instanță nu poate fi creată prin calea de cumpărare | **Da** | `api/src/env.ts:136`; `api/src/services/stripe.ts:150-153`; `.env` pe VM 103: `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol |
| PROV-05 | High | `CODE-INSPECTED` | Starea `RESTARTING` nu e niciodată resetată; `DEGRADED` nu e scrisă niciodată; `ONLINE` nu e sincronizat cu starea reală a containerului | Nu | `api/src/routes/instances.ts:149-150`; `api/src/services/provisioning.ts:638-641` |
| PROV-06 | High | `CODE-INSPECTED` + `VERIFIED` | `feature_limits` cu `databases: 0` și `backups: 0`, în timp ce platforma expune rute de client pentru baze de date, backupe și alocări | Nu | `api/src/services/provisioning.ts:481` vs `api/src/routes/instance-server.ts:400-740` |
| PROV-07 | High | `CODE-INSPECTED` | Numerotarea comenzilor neatomică (`count()+1` în două locuri) contra unei coloane `@unique` ⇒ coliziune ⇒ `P2002` nemapabil ⇒ **HTTP 500** | Nu | `api/src/routes/orders.ts:58-61`; `api/src/services/upgrades.ts:72-75`; `api/prisma/schema.prisma:350` |
| PROV-08 | Medium | `CODE-INSPECTED` | O comandă `UPGRADE` orfană rămâne în baza de date când checkout-ul eșuează | Nu | `api/src/routes/instances.ts:296` |
| PROV-09 | Medium | `CODE-INSPECTED` | Upgrade-ul nu verifică capacitatea nodului | Nu | `api/src/services/upgrades.ts:123-133` |
| PROV-10 | Medium | `CODE-INSPECTED` | Eroarea de infrastructură e raportată la pasul greșit (`server_created`) | Nu | `api/src/services/provisioning.ts:678` |
| PROV-11 | High | `VERIFIED` | **Cache-urile `Node` și `Egg` sunt goale** ⇒ `POST /admin/infrastructure/sync` nu a fost rulat niciodată ⇒ panoul de infrastructură arată o platformă goală | Nu | `api/src/routes/admin.ts:694-746`; 0 rânduri în `Node`/`Egg` |
| PROV-12 | Medium | `CODE-INSPECTED` + `VERIFIED` | Creditul la degradare nu ajunge la client când nu există abonament | Nu | `api/src/services/upgrades.ts:179-203`; 0 abonamente |
| PROV-13 | High | `CODE-INSPECTED` | Fereastră de server dublu: o eroare la scrierea lui `pterodactylServerId` după creare duce la un al doilea server pentru același client | Nu | `api/src/services/provisioning.ts:487-497` |
| PROV-14 | Low | `UNVERIFIED` | Cache-ul local de produse nu e invalidat — nu există cache azi și nu există mecanism | Nu | — |

---

## 3. Comerț și facturare — `COMM-01` … `COMM-12`

Sursă: `05-commerce-and-billing.md` (ID-urile `B1`–`B12`).

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| COMM-01 | **P0** | `CODE-INSPECTED` | **Reducerea de promoție nu ajunge la Stripe și rupe checkout-ul**: `createCheckout` trimite `unitAmount` nerediscountuit; `order.total` e discountuit; `verifyAmount` compară `amount_total` cu `order.total` ⇒ mismatch ⇒ `FAILED` | **Da** | `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:188-196` |
| COMM-02 | **P0** | `CODE-INSPECTED` + `VERIFIED` | **Prețul stocat al instanței poate fi diferit de configurație și nu e reconciliat niciodată** (importul scrie `baseAmount` în loc de prețul configurației) ⇒ estimarea lunară a clientului e greșită | **Da** | `api/src/routes/admin.ts:912`; DB: 3 instanțe la prețuri diferite pentru aceeași configurație |
| COMM-03 | **P0** | `CODE-INSPECTED` | **`applyUpgradeOrder()` nu verifică plata** | **Da** | `api/src/services/upgrades.ts:106-119` — latent azi (singurul apelant neplătit are `total=0`), dar bombă cu ceas la orice apel nou |
| COMM-04 | **Critical** | `CODE-INSPECTED` | **`renew()` fabrică facturi `PAID` fără încasare** când Stripe nu e live — condiția `!stripeLive()` e adevărată în producția de azi | Nu (blocaj de lansare) | `api/src/services/billing.ts:248`, `:96-142` |
| COMM-05 | **Critical** | `CODE-INSPECTED` | Un `invoice.paid` ajuns înainte de `checkout.session.completed` e consumat ca procesat și nu mai e reluat ⇒ **factura nu se mai creează niciodată** | Nu (blocaj de lansare) | `api/src/routes/webhooks.ts:270-280`, `:395-399`, `:599-604` |
| COMM-06 | High | `CODE-INSPECTED` | O comandă anulată poate fi plătită și onorată ulterior; o comandă anulată consumă promoția | Nu | `api/src/routes/orders.ts:150,165-178`; `api/src/services/stripe.ts:263-268` |
| COMM-07 | High | `NOT-IMPLEMENTED` | **Nu există mecanism real de reînnoire local și nu există plan anual** (`YEARLY` nu e folosit nicăieri) | Nu (blocaj de lansare) | `api/src/services/stripe.ts:176`; `api/prisma/schema.prisma:209-212` |
| COMM-08 | High | `VERIFIED` | **Nu există retenție a datelor la anulare**: serverul Pterodactyl rămâne pe nod, fără termen, fără export | Nu (blocaj de lansare) | `api/src/services/billing.ts`; `Setting` = 0 rânduri (lipsa lui `auto_delete_cancelled_instances`) |
| COMM-09 | **P0** (același defect ca `PRICE-03`) | `CODE-INSPECTED` | Câmpul `price.amount` nu spune că e în unități minori; convenția apare o singură dată în tot contractul. **Același defect ca `PRICE-03`; se numără o singură dată** | **Da** | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md:5,57,60,89` |
| COMM-10 | Medium | `CODE-INSPECTED` | Un produs nou creat prin admin pornește cu `baseAmount = 0` ⇒ **gratuit**, până când operatorul intră în ecranul de prețuri | Nu | `api/src/routes/admin.ts:428,460`; `api/prisma/schema.prisma:259-273` |
| COMM-11 | Medium | `CODE-INSPECTED` | **Nu se poate edita sau dezactiva o promoție**: există doar `GET` și `POST /admin/promotions`; niciun `PATCH`, niciun `DELETE` | Nu | `api/src/routes/admin.ts:610-660`; `web/src/admin/Promotions.tsx` |
| COMM-12 | Medium | `CODE-INSPECTED` | **Counterul afișat de operator nu e counterul aplicat**: ecranul arată `promotion.usedCount` (doar plăți), plafonul se aplică pe `countEffectiveRedemptions` (rezervări + plăți) | Nu | `web/src/admin/Promotions.tsx:260,302`; `api/src/services/pricing.ts:148-163` |
| COMM-13 | **Critical** | `VERIFIED` | **Un client care a plătit o dată nu putea plăti a doua oară**: coloana `Payment.stripeCustomerId` era unică, așa că a doua plată a aceluiași client era respinsă de baza de date, comanda rămâne `PAID` și serviciul nu era livrat | Da | `api/prisma/schema.prisma:521`; `api/src/services/stripe.ts:502` |

---

## 4. Promoții — `PROMO-01` … `PROMO-12`

Sursă: `05-promotions.md` (ID-urile `PR1`–`PR12`).

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| PROMO-01 | Critical (= `COMM-01`) | `CODE-INSPECTED` | **Același defect ca `COMM-01`**, văzut din pagina de promoții: reducerea nu ajunge la Stripe ⇒ comanda eșuează la `verifyAmount`, iar clientul ar fi taxat cu prețul neredus. **Nu e o constatare distinctă — se numără o singură dată** | Nu (este `COMM-01`) | vezi `COMM-01`; `api/src/services/stripe.ts:175` vs `api/src/routes/orders.ts:79` vs `api/src/routes/webhooks.ts:192` |
| PROMO-02 | **P0** | `CODE-INSPECTED` | `maxPerUser` nu poate fi setat ⇒ campania nu e limitată per cont, în ciuda promise-ului public | **Da** | `api/src/routes/admin.ts:630-639`; `web/src/admin/Promotions.tsx:149-179` |
| PROMO-03 | High | `CODE-INSPECTED` + `INFERRED` | Plafonul nu e aplicat atomic ⇒ curse la limită | Nu | `api/src/services/pricing.ts:208-253` |
| PROMO-04 | High | `CODE-INSPECTED` | Nu există editare/dezactivare/ștergere a unei promoții ⇒ **o campanie greșită nu poate fi oprită din interfață** | Nu | `api/src/routes/admin.ts:610-660` |
| PROMO-05 | Medium | `CODE-INSPECTED` | Ecranul arată `usedCount`, plafonul se aplică pe `countEffectiveRedemptions`; descrierea ecranului mințe | Nu | `web/src/admin/Promotions.tsx:108,260,302` vs `api/src/services/pricing.ts:148-163` |
| PROMO-06 | Medium | `CODE-INSPECTED` | `FIXED` fără plafon ⇒ poate produce o comandă cu total 0 ⇒ pierdere de cost de provisionare | Nu | `api/src/routes/admin.ts:634`; `api/src/services/pricing.ts:275` |
| PROMO-07 | Medium | `CODE-INSPECTED` | Cota publică nu verifică limita per cont ⇒ clientul vede un cod valid, comanda e refuzată | Nu | `api/src/routes/catalog.ts:135` vs `api/src/routes/orders.ts:72` |
| PROMO-08 | Medium | `CODE-INSPECTED` | Nu se validează `startsAt < endsAt`; `value = 0` e acceptat ⇒ campanii moarte, ferestre inversate | Nu | `api/src/routes/admin.ts:634-637` |
| PROMO-09 | Medium | `CODE-INSPECTED` | `checkout.session.expired` netratat ⇒ rezervare ținută 48 h ⇒ sloturi de campanie blocate | Nu | `api/src/routes/webhooks.ts:395-396` |
| PROMO-10 | High | `CODE-INSPECTED` | Copy-ul public promite „50% off your first month" și „code per account" — **niciunul realizabil** azi | Nu | `web/src/home/Catalog.tsx:206,210-213` |
| PROMO-11 | Medium | `CODE-INSPECTED` | Simulatorul de marketing arată un preț de 50% care nu e ce l-ar taxa clientul (€1.49 vs €0.74) | Nu | `web/src/home/Catalog.tsx:202-209` |
| PROMO-12 | Low | `CODE-INSPECTED` | `PromotionRedemption.amount` e scris, dar nu e citit nicăieri | Nu | `api/prisma/schema.prisma:561-562`; `api/src/services/pricing.ts:250` |

---

## 5. Documentație — `DOC-01` … `DOC-13`

Sursă: `00-documentation-drift.md` (ID-urile `D1`–`D13`). Acestea sunt **deriva de documentație**, nu defecte de cod — dar fiecare a indus deja o decizie greșită sau o ar induce.

| ID | Sev. | Clasă | Deriva | Impact |
|---|---|---|---|---|
| DOC-01 | **Critical** | `VERIFIED` | O variabilă moartă (`PTERODACTYL_CLIENT_KEY`) e prezentată ca blocajul platformei; **niciun cod nu o citește** | A dirijat efortul de deblocare spre o cheie inutilă |
| DOC-02 | **Critical** | `VERIFIED` | Două documente se contrazic despre portul nodului și **amândouă sunt greșite** | Diagnostic greșit al stării nodului |
| DOC-03 | High | `VERIFIED` | Numărul de teste e greșit în patru documente (119 în loc de 240) | Estimare falsă a acoperirii |
| DOC-04 | High | `VERIFIED` | Răspunsul de health din documente numește un câmp care nu există (`pterodactylClient`) | Diagnostic fals |
| DOC-05 | High | `VERIFIED` | „Operațiunile pentru clienți sunt blocate" apare în patru documente, în două lângă afirmația opusă | Convingere falsă despre gradul de blocare |
| DOC-06 | High | `VERIFIED` | Trei documente spun că gateway-ul Caddy și domeniul live *nu au fost atinse*; **au fost** | Refacerea unui lucru deja făcut |
| DOC-07 | High | `VERIFIED` | Contractul API omite 20 de rute live și numește una care nu există | Integratori integrați greșit |
| DOC-08 | Medium | `VERIFIED` | Webhook-ul răspunde 200 într-un document și 500 în celălalt | Test de integrare greșit |
| DOC-09 | Medium | `VERIFIED` | Starea e-mailului e descrisă ca trăind în memoria procesului, în documentul care o descrie ca fiind pe disc | Diagnostic greșit |
| DOC-10 | Medium | `VERIFIED` | Numărul de modele, de permisiuni și lista de migrări sunt depășite | Inventar greșit |
| DOC-11 | Medium | `VERIFIED` | Dimensiunile bundle-ului și numerele de verificări sunt greșite | Buget greșit |
| DOC-12 | Medium | `VERIFIED` | Numerele drill-ului sunt citate ca stare curentă în trei documente | Risc netestimat |
| DOC-13 | Low | `VERIFIED` | Deriva între inventarul declarat și realitatea din documentele mici | Confuzie la preluare |

### 5.1 Cifrele verificării documentației

`docs/PRODUCTION_READINESS.md` (45 de afirmații) și `docs/IMPLEMENTATION_STATUS.md` (59 de afirmații) au fost verificate integral, afirmație cu afirmație. Distribuția verdictelor în tabelul `PR-01`–`PR-45`: **25 `holds`, 9 `wrong`, 4 `outdated`, 5 `unverifiable`, 1 `unverifiable` în parte, 1 `holds` ca fapt dar `wrong` ca blocaj**. Cele 19 afirmații `unverifiable` sunt despre **VM 100** (panou) sau **VM 101** (nod), care nu au shell, sau necesită o rulare de script de browser care scrie în baza de date de producție. Pasul de deblocare pentru fiecare e dat în tabel și în `00-current-state.md` §4.

---

## 6. Infrastructură, rețea, capacitate, recuperare — `INF-*`, `NET-*`, `CAP-*`, `DR-*`

Sursă: `03-infrastructure.md`, `03-network-and-ip-plan.md`, `03-capacity-model.md`, `03-disaster-recovery.md`.

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| INF-01 | **Critical** | `VERIFIED` | **RAID 0 pe root** (`md1`, ambele SSD-uri): un singur disc pierdut distruge tot | **Da** | `/proc/mdstat` → `md1 : active raid0 sdb3[1] sda3[0]` |
| INF-02 | **Critical** | `VERIFIED` | **Nu există nicio copie a datelor clienților în afara hostului** — nicio țintă de backup, niciun backup programat, backup-ul Pterodactyl dezactivat | **Da** | `03-disaster-recovery.md` §1, §3.1–3.3; `.env` fără `OFFSITE_TARGET` |
| INF-03 | **Critical** | `VERIFIED` | **Nu există al doilea host și nici HA**: `/etc/pve/ha/` gol, `replication.cfg` gol | **Da** | `ls /etc/pve/ha/`, `cat /etc/pve/replication.cfg` |
| INF-04 | High | `VERIFIED` | **Proxmox UI pe `*:8006` deschis public**, cu firewall de cluster dezactivat (=`SEC-02`, reluat din perspectiva infrastructurii) | Nu | `pve-firewall status` |
| INF-05 | High | `VERIFIED` | **`rpcbind` pe `0.0.0.0:111` deschis public**, cu 3 conexiuni stabilite din exterior (relatare `SEC-28`) | Nu | `ss -lntp` |
| INF-06 | Medium | `VERIFIED` | Toate secretele într-un singur fișier `.env` pe VM 103, inclusiv tokenul de admin Caddy (relatare `SEC-11`) | Nu | `.env` pe VM 103 |
| INF-07 | Medium | `VERIFIED` | `backup-offsite.sh` folosește `rclone`, **care nu e instalat** pe VM 103 ⇒ scriptul nu ar rula | Nu | `which rclone` → gol |
| INF-08 | Low | `VERIFIED` | Caddy 2.6.2 — notă de întreținere: versiune din 2022 | Nu | `compose`/`Caddyfile` |
| NET-01 | High | `VERIFIED` | **Trei dintre cele patru adrese publice nu servesc nimic**: `193.34.214.86`, `.87`, `.143` sunt aliasuri goale | Nu | sondaj TCP + RDAP |
| NET-02 | High | `VERIFIED` | **72 de porturi de alocare (25565–25600, 27015–27050) sunt în afara intervalului DNAT publicat (30000–39999)**. Alocatorul preferă un port ≥ 30000 (`api/src/services/provisioning.ts:217`) și, cu 96 de porturi publicate libere, îl găsește mereu ⇒ serverele de joc ar funcționa, dar **pe porturi nestandard (30000+ în loc de 25565)**, iar clienții ar trebui să primească un port personalizat. Când porturile publicate se epuizează, rezerva `free[0]` poate întâlni un port nepublicat, **silențios inaccesibil** | Nu (latent) | măsurat live: 173 alocări în trei blocuri — `25565-25600`, `27015-27050`, `30000-30100`; 101 ≥ 30000, 72 < 30000; 168 nealocate, dintre care 96 libere ≥ 30000 |
| NET-03 | Medium | `VERIFIED` | Portul de alocare `30001` e închis, `30000` deschis (HTTP 200) ⇒ un server nu răspunde pe portul lui | Nu | sondaj TCP din VM 103 |
| NET-04 | Medium | `INFERRED` | Originea fără HSTS/CSP și cu adresele publicate în DNS | Nu | `03-network-and-ip-plan.md` §2 |
| CAP-01 | High | `VERIFIED` | **Capacitatea sigură e 16 instanțe pe nod** (tavan 20), limitată de **vCPU**, nu de RAM (RAM ar permite 240) | Nu | `03-capacity-model.md` §2.3–2.4 |
| CAP-02 | High | `VERIFIED` | **Al doilea nod trebuie să fie de 64 GiB, nu 128** — în hipervizor e liberă doar **85.51 GiB** RAM | Nu | `pvesh get /cluster/resources`; `03-capacity-model.md` |
| CAP-03 | Medium | `INFERRED` | **Plafonul de venit al nodului la lista proprie de prețuri e €23.84–€36.48/lună**, nu mii de euro — corectarea unei erori de 100× | Nu | `03-capacity-model.md` §2.8; `09-capacity-and-revenue.md` §0 |
| CAP-04 | Medium | `VERIFIED` | Swap-ul e pe `md2`, care e raid0, nu raid1 — swap-ul nu e protejat nici el | Nu | `/proc/mdstat` |
| DR-01 | **Critical** | `VERIFIED` | **Niciun SPOF din cele 11 inventariate nu are replică sau copie externă** | **Da** | `03-infrastructure.md` §7 |
| DR-02 | **P0** | `VERIFIED` | **Nu există backup programat al platformei**; cele două arhive existente sunt din 2026-10-22 și **nu sunt programate** | **Da** | `03-disaster-recovery.md` §3.2 |
| DR-03 | **Critical** | `VERIFIED` | **Secretele nu au nicio copie**; `SESSION_SECRET` e ireversibil — invalidă toate sesiunile și toate parolele stocate cu el | **Da** | `03-disaster-recovery.md` §3.4 |
| DR-04 | **P0** | `VERIFIED` | **Nu există backup Pterodactyl** (dezactivat per server) | **Da** | `03-disaster-recovery.md` §3.3 |
| DR-05 | High | `BLOCKED` | Starea live a backupului panoului și a containerelor pe nod nu poate fi verificată | Nu | VM 100/101 inaccesibile |
| NET-05 | High | `VERIFIED` | **Contorul de rată nu ajunge la adresa vizitatorului până la reconfigurarea edge-ului**: lanțul `X-Forwarded-For` este citit din dreapta, deci fără un proxy de încredere toți vizitatorii au adresa edge-ului | Nu (blocaj de lansare) | `web/src/lib/client-address.mjs:197`; `deploy/edge/Caddyfile` |

---

## 7. Catalog, prețuri și consistență — `PRICE-*`

Sursă: `05-pricing-consistency.md`, `04-product-certification.md`.

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| PRICE-01 | **P0** | `VERIFIED` | **Doar 1 din 5 produse e deployable** (`discord-bot`, egg #15). Celelalte 4 au `deployable=false`, `eggId` NULL, `dockerImage` gol, `startup` `{}` | **Da** | `GET /api/catalog/products`; DB `Product` |
| PRICE-02 | **P0** | `VERIFIED` | **Celelalte 4 produse au totuși preț activ și sunt vizibile public** ⇒ clientul vede un preț pentru un serviciu care nu poate fi cumpărat | **Da** | `04-product-certification.md` §1, §3.2–3.5 |
| PRICE-03 | **P0** | `VERIFIED` | **Prețul afișat public nu spune unitatea** (`price.amount = 149` = €1.49) — convenția apare o singură dată în tot contractul. **Același defect ca `COMM-09`; se numără o singură dată** | **Da** | `api/src/routes/catalog.ts:59`; `docs/API_CONTRACT.md` |
| PRICE-04 | Medium | `VERIFIED` | **0 produse certificabile end-to-end**; 1 provisionabil; 4 `NOT-IMPLEMENTED` | Nu | `04-product-certification.md` |
| PRICE-05 | Low | `VERIFIED` | **255/255 cotații live au corespuns formulei** ⇒ 0 inconsistențe între cele 6 surse de preț | Nu (pozitiv) | `05-pricing-consistency.md` |
| PRICE-06 | Medium | `VERIFIED` | Copy-ul public de pe pagina de catalog promite o reducere de 50% la prima lună, nerealizabilă azi (relatare `PROMO-10`) | Nu | `web/src/home/Catalog.tsx:202-213` |

---

## 7b. Suport, operațiuni și produsul vândut — `OPS-01` … `OPS-11`

Sursă: `11-support-and-operations.md`, `11-onboarding.md`, `11-compliance-checklist.md`.

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| OPS-01 | **Critical** | `VERIFIED` | **Produsul vândut nu conține aplicația**: rădăcina containerului are doar `.npm/`, `bm-test.txt`, `bm-test copy.txt` — niciun `package.json`, niciun `index.js` — în timp ce startup-ul e `npm run start`. Rezultatul: `GET /api/instances/:id/resources` → `state: "offline", uptime: 0, memory_bytes: 0`, în timp ce DB-ul zice `ONLINE` | **Da** | containerul live al instanței; `api/src/routes/instance-server.ts` |
| OPS-02 | **Critical** | `VERIFIED` | **Provisionarea nu e condiționată de plată**: instanța `Discord Bot` / `ONLINE` provine din comanda `BM-00002` cu status **`AWAITING_PAYMENT`**, iar alta din `BM-00003` / `PENDING`. `Subscription` = **0 rânduri**. Părăsirea la pasul de plată produce un server gratuit | **Da** | join `Instance` × `Order` × `Subscription` în DB; `api/src/services/provisioning.ts:652` — verificarea e un `updateMany`, nu o poartă |
| OPS-03 | **Critical** | `VERIFIED` | **Canalul de suport este inert**: toate cele 14 bilete de producție au `lastReplyAt = NULL`, 0 alocate, 0 închise; interfața afișează „No replies yet" pe fiecare rând. `notifyStaff()` scrie alerta în fișier în loc să o trimită | **Da** | `psql` pe bilete; `api/src/routes/tickets.ts:425-439`; 9 rânduri `[mail:file] ticket notification` în 24 h |
| OPS-04 | High | `VERIFIED` | **Nu există URL public, structural**: `DOMAIN_BASE`, `CADDY_ADMIN_URL` și `CADDY_ADMIN_TOKEN` sunt goale, `InstanceDomain` = **0 rânduri** ⇒ `url: null` ⇒ „No public URL yet", definitiv | Nu (blocaj de produs) | `.env` pe VM 103; `api/src/services/dns.ts`, `api/src/services/gateway.ts` |
| OPS-05 | High | `VERIFIED` | **Checkoutul 503, verificat live**: `POST /api/orders/:id/checkout` → `{"code":"payments_unavailable","message":"Payments are not available at the moment: no Stripe key is configured on this environment."}`; mesajul prietenos „deschide un bilet de suport" din `Deploy.tsx` nu apare niciodată, pentru că excepția e tratată înaintea drumului `{url:null}` | Nu | măsurat live, fără scriere: API-ul aruncă înainte de a atinge comanda |
| OPS-06 | High | `VERIFIED` | **`/status` raportează „Support — Degraded performance"** *fiindcă* e-mailul nu e livrat | Nu | `api/src/routes/health.ts:167-172` |
| OPS-07 | Medium | `VERIFIED` | **5 servere pe panou, 3 instanțe în DB** ⇒ 2 servere orfane pe nod, cu resurse ocupate | Nu | inventar panou + DB; `04-pterodactyl-and-provisioning.md` |
| OPS-08 | Medium | `VERIFIED` | **O singură alocare per server** (`api/src/services/provisioning.ts:482-484`) ⇒ Rust, TeamSpeak3 și alte produse care au nevoie de mai multe alocări nu pot fi provisionate | Nu | `api/src/services/provisioning.ts:482-484` |
| OPS-09 | Medium | `VERIFIED` | **Retenția la anulare e confirmată**: `autoDeleteEnabled()` are implicit `false` (`billing.ts:29-34`) și `Setting` are 0 rânduri ⇒ serverele anulate nu sunt șterse niciodată (coroborează `COMM-08`) | Nu | `api/src/services/billing.ts:29-34`; DB `Setting` |
| OPS-10 | Medium | `VERIFIED` | **29 de elemente de conformitate marcate `NEEDS-PROFESSIONAL-CONFIRMATION`** (47 de marcaje): identitate, C2-C, drept de retragere, garanții, anti-spam, facturare, TVA, praguri de înregistrare fiscală, temei juridic, GDPR (Art. 13/14, 15, 17, 18, 20, 21, 32, 33, 44/45), DPA, înregistrări și DPO, transferuri internaționale, cookie-uri, drepturi IP, politica de abuz, takedown, ștergere în backup-uri | Nu | `11-compliance-checklist.md` |
| OPS-11 | Low | `INFERRED` | Cauza probabilă a ieșirii containerului: `npm run start` nu găsește un `package.json`. Două fapte convergente, confirmate cu un `docker logs` pe nod | Nu | `11-onboarding.md` |
| OPS-12 | High | `VERIFIED` | `.github/workflows/ci.yml:148` | **Fișierul workflow-ului era invalid, deci GitHub nu a creat niciun job la nicio împingere**: contextul `runner` nu există în mediul unui job, așa că `runner.temp` a făcut ca întregul fișier să fie refuzat. 49 de rulări, toate eșuate, niciun job | Da (blocaj de lansare) | `actionlint`: `context "runner" is not allowed here`; https://github.com/trencito42/blipmade-hosting/actions/runs/40109857754 |
| OPS-13 | High | `VERIFIED` | `.github/workflows/ci.yml` (jobul `test`) | **Jobul de teste nu avea adresa panoului și tokenul intern**: suita simulează panoul la nivel de rețea, dar codul refuză să lucreze fără adresa lui, iar poarta de test cere tokenul intern. Zece erori pe runner, toate din mediu | Da (blocaj de lansare) | rularea 40109857754, adnotările jobului `Unit and integration tests` |
| OPS-14 | High | `VERIFIED` | `.github/workflows/ci.yml` (jobul `test`) | **Jobul de teste nu instalase dependențele web**, iar runner-ul de teste rulează și testele web: unul dintre ele construiește o pagină cu React și Vite, deci fișierul nu găsea pachetul `react` și pasul cădea | Da (blocaj de lansare) | rularea 40112428500: `Cannot find package 'react' imported from tests/ui-components.test.ts` |

---

## 7c. Portofoliul, prețul de floor și poziția competitivă — `PORT-01` … `PORT-09`

Sursă: `08-product-portfolio.md`, `08-competitive-analysis.md`, `08-product-launch-order.md`.

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| PORT-01 | **Critical** | `INFERRED` | **Plafonul de preț al nodului e sub costul lui.** `P_floor = C_node / N_safe(config)`, cu `N_safe` = 16 la 1 vCPU, 8 la 2 vCPU, 5 la 4 vCPU. Ancorarea externă folosită: Contabo VPS 60 (18 vCPU / 96 GB = €49.00/lună, citit 2026-10-23) ⇒ `C_node ≈ €54.44` ⇒ floor **€3.40** la 1 vCPU, **€6.81** la 2 vCPU | **Da** | `08-product-launch-order.md` §7; `C_node` e **input al operatorului**, nu o valoare auditată |
| PORT-02 | **Critical** | `DOCUMENTED-ONLY` + `INFERRED` | **Prețul actual al lui `discord-bot` (€1.72) e sub pragul de acoperire al nodului (€3.40 la 1 vCPU)**. **Atenție la ordine:** pragul de cost e *peste* prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci **prețul lui NU e sub prețul pieței**, ci **pragul e peste prețul pieței**. Concluzia: botul nu poate fi produsul principal pe acest hardware | **Da** | `08-product-launch-order.md` §7; `08-competitive-analysis.md` §4 |
| PORT-03 | **Critical** | `VERIFIED` (absența DDoS/backup) + `DOCUMENTED-ONLY` (comparația) + `INFERRED` (concluzia) | **Nu există DDoS pe traficul de joc, și nu există backup** — serviciul e cu un pas în urmă față de **cei 3 furnizori de Minecraft români verificați** în `08-competitive-analysis.md` §2 și față de Aternos, care e gratuit. Nu se generalizează peste furnizorii internaționali, marcați `NOT-VERIFIED` chiar în sursă | **Da** | `08-competitive-analysis.md` — 10 pagini de prețuri citite 2026-10-23 |
| PORT-04 | High | `VERIFIED` | **Prețul e corect calibrat pe piața românească**: €4.49 = nivelul de intrare al Zentaris, cu €0.50 peste OVI și €0.25 sub Torchbyte la aceeași specificație | Nu (pozitiv) | `08-competitive-analysis.md` |
| PORT-05 | High | `VERIFIED` | **Peste 6 GB RAM, cardul de preț pierde direct față de un VPS de €5.50** ⇒ portofoliul trebuie să fie „server de joc 2–6 GB cu protecție și backup" | Nu | `08-competitive-analysis.md` |
| PORT-06 | **Critical** | `VERIFIED` | **La specificația de piață (2 vCPU/server), nodul de 20 vCPU ține doar 8 servere plătitori (€35.92/lună)** — insuficient pentru o mașină de clasa asta. **Oferta e necompetitivă la specificația pieței, cu excepția vânzării la 1 vCPU** | **Da** | `08-product-launch-order.md`; corectat de însuși agentul după o eroare de aritmetică proprie (32 vCPU pe un nod de 20) |
| PORT-07 | High | `VERIFIED` | **Niciun produs nu poate fi vândut azi**: `LAUNCH-NOW` e gol pentru fiecare produs, pentru că plățile sunt oprite | **Da** | `.env`: `PAYMENTS_ENABLED=false` |
| PORT-08 | High | `VERIFIED` | **Portofoliul de 21 de candidați primește verdicturi**: 0 `LAUNCH-NOW`, 7 `LAUNCH-SOON`, 4 `CONDITIONAL`, 10 `NEVER` pe acest hardware | Nu | `08-product-portfolio.md` §10 |
| PORT-09 | Medium | `VERIFIED` | **Ordinal de lansare propus**: faza 1 = `minecraft-paper` (egg 5, `yolks:java_25`) la €4.09 (4 GB/1 vCPU/25 GB), €4.49 (4 GB/2 vCPU/25 GB), €5.99 (6 GB/2 vCPU/40 GB) — cu `baseAmount = 409`, ratele 60/40/2 neschimbate | Nu | `08-product-launch-order.md` |

---

## 7d. Creștere, SEO și marketing — `MKT-01` … `MKT-12`

Sursă: `10-positioning.md`, `10-seo.md`, `10-marketing-strategy.md`, `10-launch-campaigns.md`, `10-launch-copy.md`, `10-growth-metrics.md`.

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| MKT-01 | **Critical** | `VERIFIED` | **Documentul servit nu conține conținut**: 850 de octeți (401 brotli), cu doar `<div id="root">`; același `<title>` pe toate cele 6 rute publice; `/apps` n-are niciun `<h1>`; `sitemap.xml` → **404**; niciun `canonical`, niciun JSON-LD, niciun OG | Nu (blocaj de canal) | `curl -s https://blipmade.com/ \| wc -c` → 850; `curl -o /dev/null -w '%{http_code}' /sitemap.xml` → 404 |
| MKT-02 | High | `CODE-INSPECTED` | **Nu există mecanism de captare a lead-urilor**: niciun model `Lead`/`Waitlist`/`Newsletter` în cele 31 de modele Prisma | Nu | `api/prisma/schema.prisma` — toate cele 31 de modele |
| MKT-03 | High | `VERIFIED` | **Cu `SMTP_URL` gol (transport `file`), un waitlist nu poate fi capturat în produs** ⇒ singurul canal sigur înainte de poartă e **Discord** | Nu | `.env`: `SMTP_URL` gol; `11-compliance-checklist.md` |
| MKT-04 | Medium | `VERIFIED` | `/robots.txt` e generat de Cloudflare, nu de aplicație | Nu | `curl -s https://blipmade.com/robots.txt` |
| MKT-05 | **Critical** | `VERIFIED` | **`AuditLog` e deja un registru complet de pâlnie**: `auth.register` (11), `order.created` (13), `order.paid` (8), `stripe.checkout.session.completed` (8), `auth.login` (310). Funnelul e măsurabil **azi, cu zero cod nou** | Nu (pozitiv) | `SELECT action, count(*) FROM "AuditLog" GROUP BY action` |
| MKT-06 | High | `VERIFIED` | **Cele 8 intrări `order.paid` din `AuditLog` sunt sintetice**, produse de `scripts/verify-provisioning.py` ⇒ **conversia reală e 0**, chiar dacă mecanismul de urmărire e funcțional | Nu | `05-commerce-and-billing.md` |
| MKT-07 | High | `VERIFIED` | **Nu există tracking de conversie pe evenimente** și nici raportare de cost per client | Nu | `api/src/routes/admin.ts` — există `revenueMonth` și `mrr` (rândurile 58, 73, 82, 84), dar calculate local, **nereconciliate** cu Stripe, și azi **€0** |
| MKT-08 | Medium | `CODE-INSPECTED` | **Copy-ul public promite reduceri nerealizabile** („50% off your first month", „code per account") — legat de `PROMO-10` și `PROMO-11` | Nu | `web/src/home/Catalog.tsx:202-213` |
| MKT-09 | Medium | `DOCUMENTED-ONLY` | **Poziționarea aleasă e „managed application hosting (PaaS)"**, cu segmentul de gaming amânat explicit, nu ignorat | Nu | `10-positioning.md` §3–§4 |
| MKT-10 | Medium | `DOCUMENTED-ONLY` | **Lista de afirmații permise / interzise azi** e explicită, cu contra-adevărul verificat pentru fiecare interzicere | Nu | `10-positioning.md` §7.1–§7.3 |
| MKT-11 | Low | `CODE-INSPECTED` | **Campania 1 (Discord) e singura sigură înainte de poartă**; celelalte două sunt blocate de plăți și de reduceri | Nu | `10-launch-campaigns.md` |
| MKT-12 | Low | `VERIFIED` | LCP și INP sunt `UNVERIFIED` — măsurate doar FCP (432–848 ms) și CLS (0) | Nu | `10-seo.md` |

---

## 7e. Reconcilierea celor două praguri de preț — nu e o contradicție

Două rapoarte folosesc două modele de cost diferite și **ajung la concluzii diferite despre `discord-bot`**. Reconcilierea:

| Prag | Ce măsoară | Document | Valoare pentru `discord-bot` |
|---|---|---|---|
| `P_floor = C_node / N_safe(config)` | **Costul fix al nodului împărțit la instanțe** — acoperit din venit, fără costuri variabile | `08-product-launch-order.md` §7 | €3.40 la 1 vCPU, €6.81 la 2 vCPU |
| Pragul de contribuție `VC = 0.03·P + 0.50 + (m/60)·20 ≥ 0` | **Venit minus cost variabil per client**, cu suportul inclus | `09-unit-economics.md` | **€5.67** |

**Cele două măsoară lucruri diferite** și niciunul nu e greșit. `P_floor` spune „cât trebuie să coste un server ca nodul să nu fie pe minus"; pragul de contribuție spune „cât trebuie să coste un server ca **fiecare client în parte** să nu fie pe minus, cu suportul cu tot". Suportul e o cheltuială variabilă per client, deci nu intră în `C_node`.

**Pragul care leagă e cel mai mare dintre ele.** Pentru `discord-bot` la 1 vCPU: `max(€3.40, €5.67) = **€5.67**`. La 2 vCPU: `max(€6.81, €5.67) = **€6.81**`. Prețul recomandat de **€9.99** trece ambele praguri, plus pragurile de payback (€7.82 la 12 luni, €9.97 la 6 luni) și pragul de absorbție a costului fix la 16 clienți (€9.60).

**De ce contează:** `discord-bot` la **€1.72** e sub ambele praguri, deci e imposibil de vândut ca produs principal pe acest hardware. **Atenție la ordine:** pragul de cost e *peste* prețul de intrare al pieței de bot hosting (€0/lună la primul server Lunafy, €1/lună per server suplimentar) — deci **prețul lui nu e sub prețul pieței**, ci **pragul e peste prețul pieței**, ceea ce înseamnă că nu poți concura pe preț cu un concurent cu tier gratuit. `08-product-launch-order.md` propune în schimb `minecraft-paper` la €4.09–€5.99, care trece pragul la 1 vCPU. **Cele două recomandări sunt compatibile**: `discord-bot` rămâne produsul de test și de învățare (e singurul deployable), iar primul produs **vândut** e cel care trece pragurile.

**Notă de prudență:** `C_node ≈ €54.44` e o ancoră `INFERRED` (Contabo VPS 60, 18 vCPU / 96 GB la €49.00/lună, citită 2026-10-23). **Operatorul trebuie să o înlocuiască cu valoarea reală a facturii**, pentru că fiecare prag se deplasează liniar cu ea.

---

## 7f. UX, design și parcursul clientului — `UX-01` … `UX-28`

Sursă: `06-route-matrix.md`, `06-design-system.md`, `06-customer-journeys.md`, `06-ux-ui-complete.md`, `06-design-improvement-backlog.md`.

**Măsurătoare:** 35 de intrări de rută (33 de pattern-uri în `web/src/routes.tsx:85-121` + `/` + fallback 404), 36 de URL-uri, măsurate în 3 roluri la 6 lățimi de telefon și 2 lățimi desktop. **59 de pași de parcurs: 36 `WORKS`, 6 `PARTIAL`, 1 `BROKEN`, 13 `BLOCKED`, 3 `NOT-IMPLEMENTED`.**

| ID | Sev. | Clasă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|
| UX-01 | **Critical** | `VERIFIED` | **`DataTable` strică modelul de tabel**: `class="grid"` pe `<tbody>` ⇒ antetul nu se aliniază cu corpul, decalaj **105–562 px** pe 9 rute; un subiect de 100 de caractere împinge rândul cu 479 px în afara fundalului lui | Nu | măsurătoare DOM pe 22 de tabele, 9 rute |
| UX-02 | **Critical** | `VERIFIED` | **Antetul spune „No public URL yet", dar adresa `10.77.0.11:30001` există** și e în al 6-lea din 12 taburi | Nu | captură live |
| UX-03 | **Critical** | `VERIFIED` | **„Online" (pastilă) și „Container: offline" (metrici) pe același ecran**, toate metricile la 0 | Nu | captură live |
| UX-04 | High | `VERIFIED` | **Staff-ul nu poate inspecta o instanță**: nicio rută, niciun link, iar adresa din zona de client răspunde 404 | Nu | `/admin/services` |
| UX-05 | **Critical** | `VERIFIED` | **`503 payments_unavailable` blochează 8 pași de parcurs** — checkout, comandă, subscripție și domeniu | Nu (blocaj de produs) | captură live |
| UX-06 | High | `VERIFIED` | **Catalogul e cerut de 5 ori pe pagina de pornire** — `pricing.ts` cacheuiește rezultatul, nu promisiunea în zbor | Nu | contor de apeluri de rețea |
| UX-07 | High | `VERIFIED` | **Starea de încărcare a catalogului arată ca un catalog gol** — 8 carduri goale, indistinctibile de un catalog gol | Nu | captură live + măsurare a duratei skeletului |
| UX-08 | High | `VERIFIED` | **Butonul „Retry" al stării de acces interzis te duce în panoul client**, pe 13 rute de staff | Nu | captură live |
| UX-09 | High | `VERIFIED` | **`--ink-3` (`#7b827b`) nu trece 4.5:1** pe `--s2` (4.31), `--s3` (3.80), `--acc-bg` (3.92) — **toate cele 63 de elemente de text care eșuează în produs provin din acest singur token**; corecția e **o linie de CSS** (`#8a9090`) | Nu | măsurătoare de contrast pe 202 de elemente |
| UX-10 | High | `VERIFIED` | **Alb pe `--bad` = 2.78:1** în dialogul de confirmare; `--ink` pe `--bad` = 2.55:1 în panoul staff — **o linie de CSS** | Nu | măsurătoare de contrast |
| UX-11 | Medium | `VERIFIED` | **42 de casete de permisiuni la 16×16 px**, sub 24×24 cerut de WCAG 2.5.8 — **o clasă** | Nu | măsurătoare de ținte |
| UX-12 | Medium | `VERIFIED` | **Instanța are 12 taburi**; adresa, consola și fișierele sunt pe 2–6, iar parametrii de pornire există doar după plată | Nu | captură live |
| UX-13 | Medium | `VERIFIED` | **Zona de client nu cere rolul** — staff-ul vede contul lui de client, gol | Nu | captură live |
| UX-14 | Medium | `VERIFIED` | **`CURRENT PERIOD ENDS —`** — câmpul există, valoarea e `null` | Nu | captură live |
| UX-15 | Medium | `VERIFIED` | **Panoul nu avertizează că adresa de e-mail nu e verificată** — textul există doar în Setări | Nu | captură live |
| UX-16 | Medium | `VERIFIED` | **Defectul de tăiere pe telefon nu s-a recurs** pe niciuna din cele 32 de rute sweeping la 6 lățimi (`layout == visual == scroll == width`, `sideways=false`) | Nu (pozitiv) | sweep mobil |
| UX-17 | Medium | `VERIFIED` | **Zona de admin e curată pe telefon la fiecare lățime** | Nu (pozitiv) | sweep mobil |
| UX-18 | Low | `VERIFIED` | **Cele două câmpuri de căutare n-au indicator de focus**; 5 casete de notificare fără legătură etichetă↔input; 6 rute cu ținte de 20–23 px | Nu | măsurătoare de focus |
| UX-19 | Low | `VERIFIED` | `prefers-reduced-motion` oprește 47 de elemente din 213; **166 continuă să animeze** | Nu | măsurătoare de mișcare |
| UX-20 | Low | `VERIFIED` | **3 cereri 404 la fiecare încărcare** — blocul `@font-face` Proxima Nova, ale cărei fișiere nu există | Nu | `06-design-system.md` |
| UX-21 | Low | `VERIFIED` | 42 de blocuri de eroare cu două nuanțe de roșu (`bg-bad/10` și `bg-bad/12`); butonul periculos are trei reprezentări; 5 raze de card, 3 formate de dată, fără token | Nu | tokenuri |
| UX-22 | Low | `CODE-INSPECTED` | **Nu există `DELETE /api/tickets/:id`** — un ticket nu poate fi șters, nici prin API, nici din interfață | Nu | `api/src/routes/tickets.ts` |
| UX-23 | Low | `CODE-INSPECTED` | Lipsește `Alert`/`Banner`, `Tabs`, `Progress`, `DateFormat`, `Card`, `Checkbox` din design system | Nu | `06-design-system.md` §4 |
| UX-24 | Low | `VERIFIED` | Formularul de deploy nu are câmp pentru imagine, comandă și variabile de mediu | Nu | captură live |
| UX-25 | Low | `VERIFIED` | Atașamentul de ticket trimite doar numele, marimea și tipul, nu conținutul | Nu | `api/src/routes/tickets.ts` |
| UX-26 | Low | `VERIFIED` | Câmpurile de preț din `/admin/pricing` poartă id-ul intern în hash (`base-cmvjyo5yh0003dxtl58rz6pjt`) | Nu | captură live |
| UX-27 | Low | `VERIFIED` | Mesajul de refuz la înregistrare nu spune care câmp e greșit | Nu | captură live |
| UX-28 | Low | `VERIFIED` | `06-ux-ui-complete.md` — **defectul de tăiere pe telefon nu s-a recurs**, dar a apărut un **nou overflow pe latură** în pagina instanței — verificat ca fals pozitiv (ancestrul `p.truncate` taie cu elipsă) | Nu | `06-ux-ui-complete.md` §0 |

### 7f.1 Artefact rezidual pe producție — declarat

Verificarea UX a creat **ticket #48 „Audit journey probe 2026-10-23"** (2026-10-23, 17:39 UTC) pe contul de test `browser-admin@blipmade.test`. **Nu există endpoint `DELETE /api/tickets/:id` și niciun buton de ștergere** (`UX-22`), iar o ștergere directă în baza de date ar fi încălcat regula read-only a auditului. **A rămas în urmă, intentionat, și e semnalat aici.**

Impact: un ticket de test, pe un cont de test, fără date de client. **Niciun client real n-a fost afectat.** DB-ul e altfel neschimbat: 3 instanțe, 5 comenzi, 6 utilizatori, 0 abonamente, 0 facturi.

---

## 7g. Backend — `BE-01` … `BE-15`

Sursă: `01-backend-audit.md` (1318 de linii, 15 constatări). **Nicio constatare nouă P0**: backendul nu adaugă blocaje de lansare peste ce s-a găsit deja. Confirmă însă **mecanismele** care stau la baza constatărilor P0 existente.

| ID | Sev. | Clasă | Constatare | Suprapunere | P0 |
|---|---|---|---|---|---|
| BE-01 | High | `CODE-INSPECTED` | **Calea banului nu are tranzacție**: o comandă poate deveni `PAID` fără plată și fără abonament | `OPS-02`, `COMM-03` | Nu |
| BE-02 | High | `VERIFIED` | **Marcajul de reluare al provisionării e distrus la fiecare tentativă**; garanția documentată nu se aplică | `PROV-01`, `PROV-13` | Nu |
| BE-03 | High | `CODE-INSPECTED` | **Ledgerul webhook nu apără de livrările concurente ale aceluiași eveniment** | `COMM-01`, `COMM-05` | Nu |
| BE-04 | High | `CODE-INSPECTED` | **Provisionarea face 10 mutații pe panou și ~20 de scrieri în DB cu o singură tranzacție** | `PROV-02` | Nu |
| BE-05 | Medium | `CODE-INSPECTED` | **Cele cinci sume care se deplasează nu au nicio constrângere în schemă** | `COMM-09` (= `PRICE-03`) | Nu |
| BE-06 | Medium | `CODE-INSPECTED` | O provisionare blocată ține blocaj 30 de minute; retry-ul manual nu poate trece | `PROV-06` | Nu |
| BE-07 | Medium | `CODE-INSPECTED` | **`pruneQueue()` șterge joburile eșuate și anulează retenția declarată** | `PROV-03` | Nu |
| BE-08 | Medium | `CODE-INSPECTED` | Patru bucle ale workerului înghit erorile fără să scrie nimic | `PROV-03` | Nu |
| BE-09 | Medium | `CODE-INSPECTED` | **Verificarea sumei se dezactivează când `amount_total` lipsește** | `COMM-01` | Nu |
| BE-10 | Medium | `CODE-INSPECTED` | Orice livrare repetată resetează `fulfillmentStatus` la `PROVISIONING` | `COMM-05` | Nu |
| BE-11 | Medium | `CODE-INSPECTED` | Contractul API și implementarea diferă: o rută documentată nu există, 20 lipsesc | `DOC-07` | Nu |
| BE-12 | Medium | `DOCUMENTED-ONLY` + `CODE-INSPECTED` | **Cele 240 de teste dovedesc unitățile, nu cusăturile**: panoul, Stripe live, coada, workerul și nodul real nu sunt acoperite | `07-release-gates.md` | Nu |
| BE-13 | Medium | `VERIFIED` | **Ștergerea unui utilizator cascadează peste istoricul său financiar** | `COMM-08`, `OPS-10` | Nu |
| BE-14 | Medium | `CODE-INSPECTED` | Numerotarea comenzilor și a facturilor e `count()+1`, nu o secvență | `PROV-07` | Nu |
| BE-15 | Low | `CODE-INSPECTED` | `WebhookEvent.status` e text liber, fără enum și fără `updatedAt` | — | Nu |
| BE-16 | High | `VERIFIED` | **Confirmarea unei colectări făcute în afara platformei nu avea garda de cont**: un membru al personalului putea confirma factura unui administrator și îi prelungea gratuit perioada serviciului | `api/src/routes/admin.ts:443` | Nu |
| BE-17 | Low | `VERIFIED` | **Tabelul joburilor eșuate nu era golit între fișierele de test**: un test putea citi un rând al testului dinaintea lui | `api/tests/setup.ts` | Nu |
| BE-18 | Low | `VERIFIED` | **Comentariul serverului spunea că lanțul `X-Forwarded-For` se citește din stânga, iar codul îl citește din dreapta**: un întreținător putea readuce codul la forma vulnerabilă | `web/server.mjs:259` | Nu |
| BE-19 | Low | `CODE-INSPECTED` | **Scrierile dead-letter nu sunt așteptate** (`void noteJobFailure(...)`): o cursă între scrierea de `failed` și cea de `completed` poate lăsa un rând `pending` pentru un job reușit, iar un `SIGKILL` imediat după eșec pierde rândul | `api/src/worker.ts:70` | Nu |
| BE-20 | Low | `VERIFIED` | **Joburile dead-letter ale e-mailului nu pot fi puse înapoi pe coadă**: `requeueDeadLetter` refuză coada `blipmade.email`, iar starea rămâne `pending` | `api/src/services/dead-letter.ts` | Nu |
| BE-21 | Medium | `VERIFIED` | **Un atacator poate bloca definitiv un cont cunoscut**: zece parole greșite cu e-mailul victimei aduc un `429` chiar și cu parola corectă, pentru 15 minute | `api/src/plugins/auth.ts` | Nu |
| BE-22 | Low | `CODE-INSPECTED` | **Plata nu este legată din nou de cont și de comandă la actualizare**: dacă același intent ar fi raportat pentru altă comandă, rândul ar rămâne legat de prima | `api/src/services/stripe.ts:506` | Nu |
| BE-23 | Medium | `VERIFIED` | **Rambursarea unei plăți sosite pentru o comandă moartă returna suma comenzii, nu suma primită**: o rambursare a unei sume care nu a fost încasată e refuzată de provider, iar banii rămân la platformă | `api/src/routes/webhooks.ts:342` | Nu |

**Concluzia de fond a raportului de backend:** `BE-01` și `BE-04` explică **mecanismul** care stă la baza a trei P0-uri deja înregistrate — o comandă poate ajunge `PAID` fără plată (`OPS-02`), iar provisionarea face zece mutații pe panou fără o tranzacție care să le anuleze (`PROV-02`). `BE-03` explică de ce `COMM-01` produce **mismatch-uri**, nu doar eșecuri. **Backendul nu adaugă nimic nou la lista de blocaje; el arată că mecanismul e mai profund decât părea.**

---

## 7h. Constatările deschise din runda a doua de audit — `DASH-*`, `PLP-*`, `SESS-*`, `ADM-*`

A doua rundă de audit are registrul ei, `23-ROUND2-FINDINGS-REGISTER.md`, cu starea proprie
a fiecărei constatări. Constatările care sunt încă deschise sunt aici și ele, ca să nu poată
fi pierdute în afara registrului unic. Cele reparate au rămas în registrul rundei, cu
doveza, și nu mai sunt listate aici.

| ID | Sev. | Clasă | Componentă | Constatare | P0 | Evidență |
|---|---|---|---|---|---|---|
| DASH-06 | Medium | `CODE-INSPECTED` | `web/src/app/InstanceDetail.tsx` | **Tab-urile paginii de instanță nu sunt în adresa**: fără intrare în istoric, fără link partajabil, reîncărcarea revine la „Overview" | Nu | `web/src/app/InstanceDetail.tsx` |
| DASH-07 | Medium | `CODE-INSPECTED` | `web/src/app/InstanceDetail.tsx:733` | **Al doilea panou „Settings" rămâne vizibil permanent sub tab-panel**, lângă tabul „Settings" | Nu | `web/src/app/InstanceDetail.tsx:733` |
| DASH-08 | Medium | `CODE-INSPECTED` | `web/src/app/instance/DatabasesTab.tsx:83` | **`window.prompt` nativ pentru parola de bază de date (în clar) și pentru alias** | Nu | `web/src/app/instance/DatabasesTab.tsx:83`; `web/src/app/instance/NetworkTab.tsx:78` |
| DASH-09 | Medium | `CODE-INSPECTED` | `web/src/app/instance/NetworkTab.tsx:39` | **Formularul de rețea cere IP și port pe care clientul nu le poate afla din interfață** | Nu | `web/src/app/instance/NetworkTab.tsx:39` |
| DASH-10 | Low | `CODE-INSPECTED` | `web/src/app/instance/SchedulesTab.tsx:64` | **Acțiunea „Power" trimite întotdeauna `restart`**: clientul nu poate alege pornire sau oprire | Nu | `web/src/app/instance/SchedulesTab.tsx:64` |
| PLP-01 | P0 | `VERIFIED` | `api/src/services/availability.ts` | **Codul reparat, valoarea din baza vie rămâne**: WordPress era taxat cu 149 și putea fi comandat fără `eggId`, deci plata se accepta pentru un serviciu care nu putea fi creat | Da (deploy) | `api/src/services/availability.ts`; baza vie |
| PLP-02 | High | `VERIFIED` | `api/src/routes/catalog.ts` | **Build-ul din serviciu era mai vechi decât fixul de contract de preț**: API-ul nu trimitea `pricing` și `availability`, deci clientul vedea un număr și comanda alta | Da (deploy) | `api/src/routes/catalog.ts` |
| SESS-01 | High | `VERIFIED` | `web/server.mjs`, `api/src/app.ts` | **Adresa înregistrată în sesiuni și în jurnal era adresa proxy-ului, nu a clientului**: 241 dintre cele 269 de sesiuni vii aveau o adresă Cloudflare | Nu (edge) | `web/server.mjs`; `api/src/app.ts` |
| SESS-02 | High | `VERIFIED` | `api/src/routes/auth.ts` | **Limita de autentificare era cheiată pe adresa edge-ului Cloudflare**, nu pe cont și nu pe adresa clientului | Nu (edge) | `api/src/routes/auth.ts` |
| ADM-12 | Medium | `VERIFIED` | `api/src/routes/admin.ts` | **Listele administrative sunt plafonate server-side la 200 și 300 de rânduri, fără pager**: clientul nu poate ajunge la rândurile vechi | Nu (decizie de produs) | `api/src/routes/admin.ts`; `PERF-P2-03` |
| SESS-07 | Info | `NOT-IMPLEMENTED` | `api/src`, `web/src` | **Nu există al doilea factor**, deci nu există categorie de sesiuni „în așteptarea confirmării MFA" | Nu | căutare în `api/src` și `web/src` |
| ADM-13 | Medium | `CODE-INSPECTED` | `api/src/routes/admin.ts` | **Patru operații pe care API-ul le oferă nu au interfață**: cheia de client a panoului, importul unei servere existente, raportul de livrare a e-mailului | Nu | `api/src/routes/admin.ts` |
| ADM-14 | Low | `VERIFIED` | `api/src/routes/catalog.ts:60` | **Catalogul public, fără sesiune, expune `deployable`, `eggId` și mesajele interne de blocaj** | Nu | `api/src/routes/catalog.ts:60,94` |
| ADM-16 | Low | `CODE-INSPECTED` | `web/src/admin/Customers.tsx:132` | **Butonul „Show e-mails" dezvăluie adresele clienților în zona staff fără nicio urmă în jurnal** | Nu | `web/src/admin/Customers.tsx:132`; `web/src/admin/Staff.tsx:167` |

---

## 8. Porți de lansare — cele 13 porți

Sursă: `07-release-gates.md`. Fiecare poartă e o întrebare de release, cu verdict și condiții de promovare.

| # | Poarta | Verdict |
|---:|---|---|
| 1 | Clienții pot accesa resursele altora | 🟢 GREEN |
| 2 | Autentificarea plăților în producție e sigură | 🟠 AMBER |
| 3 | O plată reușită poate fi pierdută sau reconciliată greșit | 🟠 AMBER |
| 4 | Upgrade-urile de resurse se fac fără plată corespunzătoare | 🟠 AMBER |
| 5 | Provisionarea nu e fiabilă pentru un produs vândut | 🔴 RED |
| 6 | O reîncercare obișnuită poate distruge date de client | 🟠 AMBER |
| 7 | Se vinde un produs fără un runtime verificat funcțional | 🔴 RED |
| 8 | Secretele critice sunt expuse | 🟠 AMBER |
| 9 | Nu există strategie de recuperare în afara hostului | 🔴 RED |
| 10 | Checkoutul afișează prețuri material greșite | 🟠 AMBER |
| 11 | Anularea sau reînnoirea e material incorectă | 🟠 AMBER |
| 12 | Funcțiile de bază ale clientului sunt indisponibile | 🔴 RED |
| 13 | Securitatea infrastructurii critice nu a fost verificată | 🔴 RED |

**Cinci porți RED.** Conform regulii brief-ului, o singură poartă RED blochează lansarea. Condițiile complete de inversare NO-GO → GO sunt cele 9 rânduri din `07-release-gates.md` §3.

<!-- REMEDIATION:START -->

## 11. Starea remedierii

Secțiunea aceasta este randată de `_tools/render-remediation-status.mjs` din
`_tools/remediation-status.json`. Registrul de mai sus rămâne singura listă a constatărilor; aici
fiecare constatare primește starea ei de remediere, cauza, repararea, commitul, testul și rezultatul
verificării.

Cele cinci stări cerute de brief sunt stările finale. O constatare la care runda de remediere nu a
ajuns încă păstrează starea `NOT STARTED (BACKLOG)` — nu este o stare de rezolvare, iar numărul ei
arată cât a rămas.

O constatare văzută în mai multe rapoarte poartă mai multe nume. Ea este listată o singură dată,
sub numele din registru, iar celelalte nume apar lângă el după semnul `=`. Așa apare `ADM-02`
lângă `SEC-04`: nu este o constatare în plus, ci al doilea strat al aceleiași escaladări de privilegii.

| Stare | Constatări |
|---|---:|
| FIXED & VERIFIED | 39 |
| IMPLEMENTED, NOT VERIFIED | 1 |
| BLOCKED: EXTERNAL DEPENDENCY | 3 |
| REQUIRES OPERATOR APPROVAL | 16 |
| NOT STARTED (BACKLOG) | 153 |
| **Total** | **212** |

| ID | Sev. | Cod / infrastructură afectată | Stare | Cauza rădăcină | Reparare | Commit | Test de regresie | Verificare |
|---|---|---|---|---|---|---|---|---|
| `SEC-01` | Critical | VM 102 / VM 103, sshd | REQUIRES OPERATOR APPROVAL | Parola de root si accesul prin parole | Nu s-a atins: rotatia parolei de root inainte de firewall e lockout, iar brieful cere o procedura aprobata | — | — | Nu s-a rulat nimic pe infrastructura |
| `SEC-02` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-03` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-04` = `ADM-02` | High | api/src/routes/admin.ts, web/src/admin/Staff.tsx, api/src/lib/permissions.ts | FIXED & VERIFIED | PUT /admin/staff/:userId cerea doar staff.write, deci orice staff putea acorda rolul ADMIN; restrictia era doar in interfata. Al doilea strat al defectului: garda de la admin.ts:1059 verifica doar ca lista de 21 de permisiuni nu este acordata integral, si nu compara actorul cu tinta, deci un staff cu staff.write putea sa-si acorde 20 din cele 21 de permisiuni | Serverul refuza (403) schimbarea rolului si a permisiunilor unui administrator de catre un non-administrator; schimbarea este scrisa in jurnal. Faza 13 adauga regula de lista: un staff nu isi modifica propria lista, nu atinge lista unui administrator, acorda numai permisiuni pe care le are el si nu poate acorda lista intreaga; un singur helper, in toate rutele care ating un cont | 36a75a7, 8d138bb, 1db05a9 | api/tests/admin-staff-permissions.test.ts, api/tests/phase2-access-control.test.ts | Test: staff.write primeste 403 la acordarea rolului ADMIN; ADMIN reuseste. Retest independent al fazei 13: audit/post-remediation/PHASE-13-RETEST.md. Verificarea lead-ului: garda de la admin.ts:1059 bloca doar 21 din 21 |
| `SEC-05` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-06` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-07` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-11` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-13` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-14` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-15` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-16` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-17` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-18` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-19` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-20` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-21` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-22` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-23` | Info | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-24` | Info | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-25` | Info | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-26` | Info | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-27` | Info | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-28` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-29` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `SEC-30` | High | scripts/verify-provisioning.py, istoricul Git | REQUIRES OPERATOR APPROVAL | Scriptul de verificare a provisionarii scria parola contului de test in sursa, inainte ca parola sa vina din mediu | Parola vine din mediu de la commitul 61111f6, iar arborele nu o mai contine. Restul istoricului nu poate fi curatat fara rescrierea istoricului, ceea ce inseamna force-push si cere autorizatia operatorului. Pana atunci, scanarea de secrete primeste o lista de exceptii cu valoarea exacta, documentata in .gitleaks.toml | 61111f6, .gitleaks.toml | gitleaks 8.30.1 pe intreaga istorie: 0 scurgeri cu lista de exceptii | Baza vie nu are niciun cont cu parola: 4 utilizatori, 0 potriviri la verificarea hash-ului. Valoarea a fost a unui cont de test, pe adresa locala, creat de un script de verificare |
| `SEC-31` | High | api/package.json, .github/workflows/ci.yml | NOT STARTED (BACKLOG) | zod 3.25.76 este afectat de GHSA-mrhx-c7xc-m3w5: validarea unei colectii prea mari poate epuiza memoria. Versiunea e aceeasi pe main si pe candidat, deci nu e regresie a ramurii | Advisory-ul e acceptat in lista din .github/workflows/ci.yml, ca celelalte douasprezece. Corectia oficiala e zod 4.6.7, o actualizare semver-major care schimba validarea fiecarei rute si forma erorii ZodError, deci e o schimbare cu testele ei | .github/workflows/ci.yml | npm audit --audit-level=high pentru api si web | Expunerea masurata in cod: 5 utilizari z.record() fara limita de numar de chei, limitate de bodyLimit (2 MiB, 64 MiB pe o singura ruta). In zod v3 limita lungimii unui z.array().max(n) e verificata inainte de iterarea elementelor, deci vectorul e z.record, nu z.array. CVSS 7,5, EPSS 0,35% |
| `SEC-32` | High | api/src/lib/bounded.ts, api/src/routes/catalog.ts, api/src/routes/orders.ts, api/src/routes/billing.ts, api/src/routes/admin.ts, api/src/routes/instance-server.ts | FIXED & VERIFIED | Niciuna dintre cele treisprezece colectii din corpul cererii nu avea o limita. zod verifica lungimea unui tablou inainte sa parcurga elementele, deci un tablou cu limita nu poate face validarea scumpa, dar o limita nu era pusa. Un dicionar nu are limita in aceasta versiune de zod, deci numarul cheilor era necunoscut pana la citirea valorilor | Tablourile au limita maxima, iar numarul cheilor unui dicionar este numarat inainte de citirea valorilor, printr-o functie care arunca aceeasi eroare de validare. Cele 13 colectii sunt limitate acum: 20 de linii de cotatie sau de comanda, 50 de coduri de optiune, 100 de variabile de mediu sau de payload, 200 de setari | 9734b9b | api/tests/collection-bounds.test.ts | Cele patru teste de refuz picau pe codul de dinaintea reparației si trec pe codul de dupa: 4 picate si 1 verde inainte, 5 verzi dupa. Testul care cere marimile obisnuite trece in ambele, deci nu ascunde o regresie |
| `PROV-01` | Critical | api/src/services/provisioning.ts (chooseNode, nodeCapacity, requiredCapacity) | FIXED & VERIFIED | Poarta de capacitate compara disk-ului nodului (MB de la panou) cu disk-ul instantei (GB): factor 1024 | Ambele valori sunt aduse la MB inainte de comparatie; refuzul numeste valorile si unitatea lor | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: refuzul numeste MB si GB; 13 teste de capacitate |
| `PROV-02` | Critical | api/src/services/provisioning.ts (compensateFailedProvisioning) | FIXED & VERIFIED | La provisionare nereusita serverul, alocarea si suma ramaneau; nu exista compensare | Compensarea sterge containerul, elibereaza alocarea, returneaza banii sau marcheaza refundul de facut, si scrie totul in jurnal; ruleaza doar la ultima incercare | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: fara server, fara alocatie, banii inapoi; nu se ramburseaza de doua ori |
| `PROV-03` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-04` | P0 | .env pe VM 103 (PAYMENTS_ENABLED, STRIPE_SECRET_KEY) | REQUIRES OPERATOR APPROVAL | Platile oprite prin configuratie: createCheckout arunca 503, deci nicio comanda nu poate fi platita | Calea de cod e pregatita si testata (comanda cu total 0 se confirma fara furnizor); ce lipseste este cheia Stripe live si PAYMENTS_ENABLED=true, decizie si credential de la operator | — | api/tests/order-amounts.test.ts | Verificat in stiva izolata: comanda cu promoție 100% e confirmata si provisionata fara furnizor |
| `PROV-05` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-06` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-07` | High | api/src/services/order-numbers.ts | FIXED & VERIFIED | Numarul comenzii era count()+1 contra unei coloane unice: P2002, HTTP 500 | Numarul vine dintr-un contor ridicat atomic, cu recuperare daca contorul a fost stricat; acelasi contor pentru comenzi, facturi si upgrade-uri | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: 100 de comenzi simultane, numere distincte, niciun P2002 |
| `PROV-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-11` | High | POST /admin/infrastructure/sync, tabelele Node si Egg | REQUIRES OPERATOR APPROVAL | Cache-urile Node si Egg sunt goale: sincronizarea nu a fost rulata niciodata | Ruta exista; rularea ei in productie scrie in baza de date, deci cere aprobare | — | api/tests/panel-client-contracts.test.ts | Verificat: sincronizarea citeste panoul corect |
| `PROV-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROV-13` | High | api/src/services/provisioning.ts (recordServerAttempt, findServerAttempt) | FIXED & VERIFIED | Containerul era creat, apoi scria identificatorul; o eroare ducea la un al doilea server | Incercarea este inregistrata inainte de creare si reluarea o reutilizeaza; daca inregistrarea esueaza, containerul nou este sters | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: reluarea dupa refuzul scrierii face un singur server |
| `PROV-14` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `COMM-01` | P0 | api/src/services/order-amounts.ts, api/src/services/stripe.ts | FIXED & VERIFIED | createCheckout trimitea pretul de lista, iar verifyAmount respingea comanda pentru ca sumele nu se potriveau | Totalul comenzii este impartit pe linii, suma incasata este exact suma cotata, iar o comanda acoperita integral este confirmata fara furnizor de plata | 3948f7f / remediation/phase-1-payment-safety | api/tests/order-amounts.test.ts | Test: 21 de teste; comanda cu promoție 100% ajunge PAID si este provisionata |
| `COMM-02` | P0 | api/src/services/billing.ts (configurationPrice, reconcileInstancePrices), api/src/routes/admin.ts | FIXED & VERIFIED | Pretul stocat al instantei putea fi cel de baza al produsului, nu cel al configuratiei; nu se reconcilia niciodata | Pretul instantei este pretul configuratiei sale; importul scrie pretul configuratiei, iar POST /admin/instances/reconcile-prices reconciliaza si scrie diferenta in jurnal | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: pretul corectat 100 -> 2200, estimarea clientului egaleaza pretul configuratiei |
| `COMM-03` | P0 | api/src/services/upgrades.ts (applyUpgradeOrder) | FIXED & VERIFIED | Schimbarea de resurse se aplica fara ca plata sa fie confirmata | Functia refuza orice comanda care nu este platita, lasa instanta neatinsa si scrie motivul in jurnal | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: refuz pentru comanda neplata, aplicare pentru cea platita |
| `COMM-04` | Critical | api/src/services/billing.ts (renew, reconcileInvoicesWithProvider) | FIXED & VERIFIED | renew() marca facturile platite cand Stripe nu era activ, adica in productie | Factura devine platita doar la confirmarea incasarii; fara furnizor ramane deschisa, perioada nu se prelungeste, abonamentul trece in PAST_DUE; o reconciliere cu furnizorul exista | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: nicio factura plata fara furnizor; o factura perioada la doua baleieri |
| `COMM-05` | Critical | api/src/routes/webhooks.ts (markDeferred, claimEvent, retryFailedWebhookEvents) | FIXED & VERIFIED | Un invoice.paid sosit inainte de checkout era consumat ca procesat si nu mai era reluat | Evenimentul este amanat, numarul de incercari este numarat, reluarea are o limita si exista o cale de replay | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: eveniment amanat, apoi aplicat; un eveniment imposibil se opreste la limita |
| `COMM-06` | High | api/src/routes/webhooks.ts (handleCancelledOrderPayment, releaseCancelledOrderPromotion) | FIXED & VERIFIED | O comanda anulata putea fi platita si onorata, iar slotul campaniei era consumat | Comanda anulata nu este onorata, banii sunt returnati sau marcati pentru operator, iar slotul campaniei este eliberat | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: niciun serviciu creat, slotul campaniei inapoiat |
| `COMM-07` | High | api/src/routes/billing.ts (quote, subscriptions/:id/renew), api/src/services/billing.ts (createLocalRenewal) | FIXED & VERIFIED | YEARLY nu era folosit niciodata si nu exista reinnoire care functioneaza fara Stripe | Planul anual se coteste si se plateste, perioada este de 12 luni, iar reinnoirea locala produce o factura deschisa confirmata de operator | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: cotatie anuala 7000, reinnoire de 12 luni, fara prelungire dubla |
| `COMM-08` | High | api/src/services/billing.ts (withdraw, scheduleInstanceDeletion, buildInstanceExport) | FIXED & VERIFIED | La anulare serverul era sters imediat, fara termen si fara export | Serviciul este marcat pentru stergere dupa termenul din setare, datele clientului sunt exportate inainte de orice stergere, iar exportul ramane la dispozitie | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: termen de 7 zile, serverul nu se sterge inainte, exportul exista |
| `COMM-09` | P0 (același defect ca `PRICE-03`) | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `COMM-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `COMM-11` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `COMM-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `COMM-13` | Critical | api/prisma/schema.prisma, api/src/services/stripe.ts | FIXED & VERIFIED | Coloana clientului de la provider era unica in tabelul platilor. Un client plateste mai multe ori si platforma refoloseste clientul de la provider, deci a doua plata avea aceeasi valoare si constrangerea respingea scrierea. Comanda era marcata plata inainte de scriere, deci banii erau luati, plata nu era scrisa si serviciul nu era livrat | Coloana pastreaza un index, pentru ca clientul de la provider se cauta prin ea, dar indexul nu mai este o constrangere. Migratia 20261025160000_payment_customer_index renunta la constrangerea din baza vie, deci trebuie aplicata inainte de conectarea providerului | 5bdc92b | api/tests/payment-second-purchase.test.ts | Testul trimite doua evenimente cu acelasi client de la provider, ca platforma. Fara reparare: HTTP 500 si 'Unique constraint failed on the fields: (stripeCustomerId)'. Cu repararea: 200, plata scrisa, comanda plata si doua servicii livrate |
| `PROMO-01` | Critical (= `COMM-01`) | api/src/services/order-amounts.ts | FIXED & VERIFIED | Acelasi defect ca COMM-01, vazut din pagina de promotii | Reducerea ajunge la furnizorul de plata prin aceeasi impartire a totalului | 3948f7f / remediation/phase-1-payment-safety | api/tests/order-amounts.test.ts | Test: suma incasata este suma cotata |
| `PROMO-02` | P0 | api/src/routes/admin.ts (POST/PATCH /admin/promotions), web/src/admin/Promotions.tsx | FIXED & VERIFIED | maxPerUser nu putea fi setat, deci fiecare campanie era nelimitata per cont | Administratorul poate fixa, schimba si goli limita per cont, cu validare pe server si in formular | remediation/phase-1-payment-safety | api/tests/promotions.test.ts | Test: limita se poate seta, se schimba, se goleste si se respinge valoarea invalida |
| `PROMO-03` | High | api/src/services/pricing.ts (reservePromotion, effectiveRedemptions) | FIXED & VERIFIED | Contorul era citit si apoi scris, deci doua comenzi simultane puteau trece de limita | Rezervarea ruleaza intr-o tranzactie care blocheaza randul campaniei si numara in interiorul ei; contorul de rezervari este tabelul de redemptions, nu usedCount | remediation/phase-1-payment-safety | api/tests/promotions.test.ts | Test: doua rezervari simultane nu trec de plafon |
| `PROMO-04` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROMO-05` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROMO-06` | Medium | api/src/services/pricing.ts (promotionCap, applyPromotion), api/src/routes/admin.ts | FIXED & VERIFIED | O campanie FIXED fara plafon putea da comanda cu total 0 | Campania FIXED trebuie sa aiba o suma, iar serverul garanteaza ca reducerea nu depaseste niciodata comanda | remediation/phase-1-payment-safety | api/tests/promotions.test.ts | Test: reducerea nu depaseste comanda; campania FIXED fara suma este respinsa |
| `PROMO-07` | Medium | api/src/routes/catalog.ts (POST /catalog/quote) | FIXED & VERIFIED | Cotatia publica nu verifica limita per cont, deci clientul vedea un cod valid si comanda era respinsa mai tarziu | Cotatia primeste utilizatorul semnat si verifica limita per cont inainte de a arata reducerea | remediation/phase-1-payment-safety | api/tests/promotions.test.ts | Test: limita per cont se aplica la cotatie |
| `PROMO-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROMO-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROMO-10` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PROMO-11` | Medium | web/src/home/Studio.tsx, Story.tsx, Configurator.tsx, Ticker.tsx | FIXED & VERIFIED | Simulatorul de marketing arata preturi care nu erau preturile configuratiilor | Toate paginile publice iau produsele si preturile de la server; lista hardcodata a fost eliminata | 3948f7f / remediation/phase-1-payment-safety | web/tests/catalog-truth.test.ts | Test: niciun pret fara server in codul clientului |
| `PROMO-12` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-01` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-02` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-03` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-04` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-05` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-06` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-07` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-11` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DOC-13` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `INF-01` | Critical | VM 101, / (RAID 0) | REQUIRES OPERATOR APPROVAL | RAID 0 pe volumul de root: pierderea unui disc pierde totul | Nu s-a atins: brieful interzice schimbarea RAID fara o procedura aprobata si un plan de rollback testat | — | — | Nu s-a rulat nimic: schimbarea necesita downtime si backup (B-09) si aprobare |
| `INF-02` | Critical | scripts/backup.sh, scripts/backup-offsite.sh | BLOCKED: EXTERNAL DEPENDENCY | Nu exista o copie a datelor in afara hostului | Timerul ruleaza si arhiva se verifica, dar OFFSITE_TARGET si OFFSITE_KEY nu sunt setate, deci copia nu paraseste gazda. Decizia (provider, volum, cost, cheie de criptare) este a operatorului | - | scripts/backup-offsite.sh | Executat postup: backupul s-a creat, ExecStartPost a iesit 0, si nu exista nicio copie in afara gazdei. RPO la pierderea gazdei: infinit |
| `INF-03` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `INF-04` | High | VM 102, VM 103, firewall | REQUIRES OPERATOR APPROVAL | Porturile de administrare (8006, 111) sunt ascultate public | Nu s-a atins: brieful interzice schimbarea regulilor de firewall care ar putea produce lockout fara procedura aprobata | — | — | Nu s-a rulat nimic pe infrastructura |
| `INF-05` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `INF-06` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `INF-07` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `INF-08` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `NET-01` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `NET-02` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `NET-03` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `NET-04` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `CAP-01` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `CAP-02` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `CAP-03` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `CAP-04` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DR-01` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DR-02` | P0 | scripts/systemd/blipmade-backup.{service,timer}, scripts/install-backup-timer.sh, scripts/restore-drill.sh | FIXED & VERIFIED | Timerul exista in repository de doua runde, dar nu era instalat pe gazda: programarea nu rula | Timerul si unitatea au fost instalate in /etc/systemd/system, activate cu systemctl enable, si o rulare a produs arhiva cu checksum. Drill-ul de restaurare a fost rulat: copia se restaureaza intr-o baza de gol si se compara cu cea vie | 9e92df7 (scriptul), instalare pe gazda 2026-10-24 | scripts/restore-drill.sh | Rulare: arhiva blipmade-scheduled-20261024T001409Z.tar.gz (59620 B) + .sha256; drill: 32 tabele identice, 3 utilizatori, 5 produse, 11 migrari, RTO 3 s. NOTA: copia nu paraseste inca gazda - vezi INF-02 |
| `DR-03` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DR-04` | P0 | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `DR-05` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `NET-05` | High | web/src/lib/client-address.mjs, deploy/edge/Caddyfile, edge-ul 10.77.0.12 | REQUIRES OPERATOR APPROVAL | Adresa clientului este citita din dreapta lantului X-Forwarded-For, pentru ca ultima pozitie este proxyul cel mai apropiat. Edge-ul de la 10.77.0.12 nu a fost reconfigurat, deci nu rescrie antetul, iar contorul grupeaza dupa adresa edge-ului | deploy/edge/Caddyfile este pregatit cu trusted_proxies si header_up X-Forwarded-For {client_ip}. Aplicarea lui cere acces la edge, pe care operatorul il are | 0928c8a, f8b2051 | web/tests/client-address.test.mjs | Masurare: cu edge-ul care rescrie, adresa reala a vizitatorului; fara el, toate adresele sunt 10.77.0.12. Limita per cont ramane intacta, deci forta bruta a parolei nu e ocolita |
| `PRICE-01` | P0 | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PRICE-02` | P0 | api/src/services/availability.ts, web/src/lib/pricing-contract.ts | FIXED & VERIFIED | Produsele fara mapping de egg aveau pret activ si erau vizibile, deci clientul vedea un pret pentru un serviciu care nu putea fi cumparat | Disponibilitatea e derivata (orderable = visible && deployable && eggId != null), serverul trimite cele 4 stari, comanda e refuzata server-side, interfata nu arata CTA pentru un produs indisponibil | 3948f7f / 210a677 | api/tests/catalog-availability.test.ts | Testele trec; WordPress apare "temporarily unavailable" si nu poate fi comandat |
| `PRICE-03` | P0 | docs/API_CONTRACT.md | FIXED & VERIFIED | Campul price.amount nu spunea ca e in unitati minori; conventia aparea o singura data in tot contractul | Contractul API spune explicit ca toate sumele sunt in unitati minori si descrie cartea de preturi si starea de disponibilitate | 36a75a7 | documentatia contractului | Contractul API descrie acum unitatea, cartea de preturi si cele 4 stari |
| `PRICE-04` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PRICE-05` | Low | api/src/services/pricing.ts, api/src/routes/catalog.ts | FIXED & VERIFIED | Existau 6 surse de pret; o regula noua intr-un strat lasa celelalte in urma | Catalogul, cartea de preturi si cotatia sunt calculate cu aceeasi functie (priceBook / priceConfiguration) | 3948f7f | api/tests/catalog-pricing.test.ts | 255/255 cotatii se potrivesc; testele trec |
| `PRICE-06` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-01` | Critical | api/src/services/provisioning.ts, api/prisma/seed.ts | REQUIRES OPERATOR APPROVAL | Produsul vandut nu contine aplicatia: radacina containerului are doar .npm/ si bm-test.txt, iar startup-ul e npm run start | Poarta e implementata: un produs fara mapping de egg nu poate fi comandat (disponibilitatea derivata). Ce lipseste este decizia de produs despre aplicatia care ruleaza si imaginea ei | 210a677 | api/tests/catalog-availability.test.ts | Verificat: WordPress (fara egg) e TEMPORARILY_UNAVAILABLE si nu are CTA |
| `OPS-02` | Critical | api/src/services/provisioning.ts (refuseUnpaidProvisioning, storeServerIdentifiers) | FIXED & VERIFIED | Provisionarea nu era conditionata de plata: instante ONLINE din comenzi neplatite | Poarta este in serviciul de provisionare, rescrisa si in tranzactia care scrie identificatorii; refuzul e jurnalizat si nu se reincearca | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: comanda neplata nu produce server si nici alocatie |
| `OPS-03` | Critical | api/src/services/notifications.ts, relay SMTP | BLOCKED: EXTERNAL DEPENDENCY | Canalul de suport este inert: notifyStaff() scrie intr-un fisier pe mail:file si nimeni nu il citeste | Implementarea e gata; depinde de un relay SMTP real, care este o dependenta externa | — | api/tests/email-delivery.test.ts | Verificat in stiva izolata: cu mail:file mesajul ajunge in fisier, cum e documentat |
| `OPS-04` | High | DOMAIN_BASE, CADDY_ADMIN_URL, CADDY_ADMIN_TOKEN, gateway.ts | BLOCKED: EXTERNAL DEPENDENCY | Nu exista URL public, structural: valorile sunt goale si InstanceDomain are 0 randuri | Mecanismul din cod este la locul lui; publicarea subdomeniului cere Caddy-ul de pe VM 102 configurat cu un bloc admin si cu cele trei variabile | — | api/tests/domains.test.ts | Verificat: domeniul se rezerva si se elibereaza corect; URL-ul public depinde de gateway |
| `OPS-05` | High | api/src/routes/orders.ts, .env pe VM 103 | REQUIRES OPERATOR APPROVAL | Checkoutul 503, verificat live, pentru ca nu exista cheie Stripe | Codul e pregatit; activarea platilor cere cheia Stripe live si PAYMENTS_ENABLED=true | — | api/tests/order-amounts.test.ts | Verificat: cu furnizorul pornit, checkoutul intoarce o sesiune |
| `OPS-06` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-07` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-11` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `OPS-12` | High | .github/workflows/ci.yml | FIXED & VERIFIED | Contextul runner nu exista in mediul unui job, deci cele doua linii care numeau directorul temporar al runner-ului au facut ca intregul fisier sa fie invalid. GitHub crea rularea, refuza sa creeze joburile si o marca ca esuata, la fiecare impingere, de cand fisierul a fost adaugat | Cele doua directoare sunt facute acum in pasul care ruleaza suita, cu variabila runner-ului, pe care fiecare pas o are. Fisierul a fost verificat cu actionlint, care raporteaza aceeasi eroare ca GitHub pe fisierul de dinainte si nimic pe fisierul de dupa | 6272785 | actionlint 1.7.7 pe ambele fisiere de workflow | Rularea 40109857754 a creat cele sase joburi, dintre care cinci au trecut: API typecheck, Dependency audit, Web typecheck and build, Secret scan, Schema drift |
| `OPS-13` | High | .github/workflows/ci.yml, jobul test | FIXED & VERIFIED | Suita simuleaza panoul la nivel de retea, dar codul refuza sa lucreze fara adresa panoului, iar poarta de test cere tokenul intern al platformei. Mediul de pe runner nu avea niciuna dintre cele doua valori, pentru ca fisierul .env nu este in depozit | Jobul primeste adresa panoului, care indica bucla runner-ului pe un port pe care nu asculta nimeni, si un token intern de unica folosinta. O cerere care ar scapa de simulare esueaza imediat si ramane pe masina | 264edf4 | rularea completa a suitei intr-o copie a arborelui, cu mediul jobului de pe runner | Zece erori pe runner, toate din mediu: cinci in instance-operations, doua in credential-renewal, una in billing-lifecycle si doua urmari. Cu cele doua valori, suita trece in intregime |
| `OPS-14` | High | .github/workflows/ci.yml, jobul test | FIXED & VERIFIED | Runner-ul de teste ruleaza si testele web, si unul dintre ele construieste o pagina cu React si Vite, dar jobul instala doar dependintele API. Fisierul de test nu putea gasi pachetul react | Jobul instaleaza si dependintele web, din fisierul de lock file, ca cele ale API | e53a3a9 | rularea completa a suitei, cu si fara dependintele web | Fara dependintele web: 93 verzi si unul rosu, cel care construieste pagina. Cu ele: 109 verzi |
| `PORT-01` | Critical | cardul de pret din audit/05-commerce-and-billing.md | REQUIRES OPERATOR APPROVAL | Pretul se recalculeaza pe baza floor-ului, nu pe baza pietii | Nu s-a atins: valoarea C_node si decizia asupra cardului de pret sunt D-1 a operatorului | — | — | Nu s-a rulat nimic: pretul nu e o decizie de inginer |
| `PORT-02` | Critical | documente de conformitate | REQUIRES OPERATOR APPROVAL | Comparatia cu piata si regimul fiscal | Nu s-a atins: e o decizie de operator si o confirmare profesionala | — | — | Nu s-a putut verifica |
| `PORT-03` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-04` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-05` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-06` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-07` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-08` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `PORT-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-01` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-02` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-03` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-04` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-05` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-06` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-07` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-11` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `MKT-12` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-01` | Critical | web/src/ui-app.tsx (DataTable), web/src/lib/table.ts, web/src/app/Domains.tsx | FIXED & VERIFIED | DataTable punea class="grid" pe tbody, ceea ce distrugea modelul de coloane; o tabela DNS era scrisa de mana cu randurile scoase din tabel | Tabel real: thead si tbody din aceeasi descriere de coloane, colgroup explicit, nowrap/align/truncate pe coloana | 3948f7f | web/tests/table-layout.test.ts | Sweep 26 rute x 3 latimi: decalaj maxim antet-corp 0 px (era 701 px) |
| `UX-02` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-03` | Critical | web/src/app/Overview.tsx, web/src/app/InstanceDetail.tsx | FIXED & VERIFIED | Doua stari contrazicatoare pe acelasi ecran: pastila "Online" si metrica "Container: offline" | Toate vederile folosesc StatusPill dintr-o singura sursa; metrica contradictorie a fost eliminata | 210a677 | sweep + inspectia DOM | Verificat in browser: o singura stare per instanta |
| `UX-04` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-05` | Critical | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-06` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-07` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-08` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-09` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-10` | High | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-11` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-13` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-14` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-15` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-16` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-17` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-18` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-19` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-20` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-21` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-22` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-23` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-24` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-25` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-26` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-27` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `UX-28` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-01` | High | api/src/routes/webhooks.ts, api/src/services/stripe.ts | FIXED & VERIFIED | Calea banului nu avea tranzactie: o comanda putea deveni PAID fara plata si fara abonament | Comanda platita consuma slotul campaniei si creeaza abonamentul in aceeasi cale; o comanda anulata nu este onorata | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: eveniment amanat si aplicat; comanda anulata refuzata |
| `BE-02` | High | api/src/services/provisioning.ts (recordServerAttempt) | FIXED & VERIFIED | Marcajul de reluare a provisionarii era distrus la fiecare tentativa | Incercarea este pastrata in jurnalul pasului, deci reluarea stie ce a facut | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: reluarea nu creeaza un al doilea server |
| `BE-03` | High | api/src/routes/webhooks.ts (claimEvent, markDeferred) | FIXED & VERIFIED | Ledgerul webhook nu proteja de livrarile concurente ale aceluiasi eveniment | Evenimentul este luat cu o constrangere unica si amanatele sunt numarate si reluate cu o limita | remediation/phase-1-payment-safety | api/tests/billing-lifecycle.test.ts | Test: evenimentul amanat este aplicat o singura data |
| `BE-04` | High | api/src/services/provisioning.ts | IMPLEMENTED, NOT VERIFIED | Provisionarea face 10 mutatii pe panou si ~20 de scrieri in DB cu o singura tranzactie | Incercarea, identificatorii si compensarea au fost restructurate; tranzactia unica peste toate panourile ramane o refactorizare mai mare, nemtestata pe un panou real | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Testele trec; tranzactia completa peste panou nu a fost masurata pe panoul real |
| `BE-05` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-06` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-07` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-08` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-09` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-10` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-11` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-12` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-13` | Medium | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-14` | Medium | api/src/services/order-numbers.ts | FIXED & VERIFIED | Numarul comenzilor si al facturilor era numarul de randuri plus unu | Un singur contor atomic pentru comenzi si facturi, folosit de toate caile | remediation/phase-1-payment-safety | api/tests/provisioning-safety.test.ts | Test: numerele nu se repeta niciodata |
| `BE-15` | Low | — | NOT STARTED (BACKLOG) | — | — | — | — | — |
| `BE-16` | High | api/src/routes/admin.ts | FIXED & VERIFIED | Ruta de confirmare a colectarii cerea doar orders.write si requireStaff. Confirmarea marcheaza factura ca plata si prelungeste perioada abonamentului, deci scrie pe contul clientului, iar regula assertMayActOnAccount era aplicata pe celelalte sase rute care ating un cont, nu pe aceasta | Regula este aplicata si aici: un administrator este confirmat doar de alt administrator, iar contul unui client poate fi confirmat de un membru al personalului | b00ffa4 | api/tests/phase2-invoice-collection.test.ts | Fara reparare: un staff cu orders.write confirma factura unui ADMIN si raspunsul este 200. Cu repararea: 403, iar factura ramane OPEN |
| `BE-17` | Low | api/tests/setup.ts | FIXED & VERIFIED | Tabelul DeadLetterJob a fost adaugat dupa scrierea suitei, iar lista tabelelor golite la inceputul fiecarui fisier de test nu l-a inclus | Tabelul este in lista, deci fiecare fisier de test incepe de la baza goala | 14f7a5f | api/tests/perf-data-dead-letter.test.ts | Verificarea independenta a gasit 3 randuri in loc de 2, dintr-un test anterior. Cu repararea, lista e completa |
| `BE-18` | Low | web/server.mjs | FIXED & VERIFIED | Comentariul a fost scris pentru forma veche a citirii lantului si nu a fost schimbat cand faza 14 a mutat citirea in dreapta | Comentariul spune acum ce face codul: lantul se citeste din dreapta, pentru ca ultima pozitie este proxyul cel mai apropiat | 14f7a5f | web/tests/client-address.test.mjs | Textul si codul spun acum acelasi lucru |
| `BE-19` | Low | api/src/worker.ts | NOT STARTED (BACKLOG) | Nota de esec este scrisa fara a fi asteptata, iar scrierea de reusita poate ajunge inaintea ei | Nota de esec se asteapta inainte de a se intoarce din handler, sau se scrie intr-o tranzactie cu starea jobului | — | — | Fereastra e mica. Nu e o pierdere de bani, dar o reproducere poate pierde urma unei esecuri |
| `BE-20` | Low | api/src/services/dead-letter.ts | NOT STARTED (BACKLOG) | Repunerea pe coada este refuzata pentru coada de e-mail, pentru ca mesajele nu se trimit la fel | Interfata de administrare trebuie sa spuna ca o livrare esuata nu se poate repune pe coada, si sa ofere o trimitere noua | — | — | Proba independenta: starea ramane pending dupa refuz |
| `BE-21` | Medium | api/src/plugins/auth.ts | NOT STARTED (BACKLOG) | Limita se numara pe adresa, iar atacatorul si victima sunt pe aceeasi adresa in multe cazuri | Limita pe cont poate fi ridicata la o valoare mai mare, sau contorul poate fi tinut separat de contorul pe adresa | — | — | Preexistent: pe main limita numara toate cererile, deci era la fel sau mai rau. Ramura a imbunatatit situatia utilizatorilor legittimi, pentru ca o autentificare reusita reseteaza contorul |
| `BE-22` | Low | api/src/services/stripe.ts | NOT STARTED (BACKLOG) | Ramura de actualizare schimba suma si starea, dar nu legatura cu contul si cu comanda | Legatura se actualizeaza si ea, sau se verifica ca intentul apartine aceleiasi comenzi inainte de a scrie | — | — | Nu e accesibil atacatorului: client_reference_id este derivat pe server, iar comanda vine din sesiune |
| `BE-23` | Medium | api/src/routes/webhooks.ts | FIXED & VERIFIED | Verificarea sumei este sarita pentru o comanda moarta, iar rambursarea cerea suma comenzii, nu suma care a sosit | Se ramburseaza suma care a sosit, iar cand cele doua sume difera, diferenta se scrie in jurnal | 14f7a5f | api/tests/webhooks.test.ts | Probabilitatea e mica, pentru ca suma vine din checkout-ul construit pe server, dar rambursarea sumei care a sosit este corecta in orice caz |
| `DASH-06` | Medium | web/src/app/InstanceDetail.tsx | NOT STARTED (BACKLOG) | Tab-urile paginii de instante nu sunt in adresa | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `DASH-07` | Medium | web/src/app/InstanceDetail.tsx | NOT STARTED (BACKLOG) | Al doilea panou Settings ramane vizibil permanent sub tab-panel | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `DASH-08` | Medium | web/src/app/instance/DatabasesTab.tsx | NOT STARTED (BACKLOG) | Fereastra nativa, cu parola in clar | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `DASH-09` | Medium | web/src/app/instance/NetworkTab.tsx | NOT STARTED (BACKLOG) | Formularul de retea cere IP si port | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `DASH-10` | Low | web/src/app/instance/SchedulesTab.tsx | NOT STARTED (BACKLOG) | Actiunea Power trimite intotdeauna restart | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `PLP-01` | P0 | api/src/services/availability.ts | REQUIRES OPERATOR APPROVAL | Codul reparat; valoarea din baza vie si deployul raman | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `PLP-02` | High | api/src/routes/catalog.ts | REQUIRES OPERATOR APPROVAL | Codul reparat; deployul ramane | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `SESS-01` | High | web/server.mjs | REQUIRES OPERATOR APPROVAL | Codul reparat; edge-ul ramane | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `SESS-02` | High | api/src/routes/auth.ts | REQUIRES OPERATOR APPROVAL | Limita per cont exista; adresa reala cere edge-ul | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `ADM-12` | Medium | api/src/routes/admin.ts | REQUIRES OPERATOR APPROVAL | Plafonul de 200 si 300 de randuri ramane; decizia de pager este deschisa | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `SESS-07` | Info | api/src, web/src | NOT STARTED (BACKLOG) | Al doilea factor nu exista; este o alegere de produs | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `ADM-13` | Medium | api/src/routes/admin.ts | NOT STARTED (BACKLOG) | Patru operatii ale api-ului nu au interfata | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `ADM-14` | Low | api/src/routes/catalog.ts | NOT STARTED (BACKLOG) | Catalogul public expune deployable si eggId | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |
| `ADM-16` | Low | web/src/admin/Customers.tsx | NOT STARTED (BACKLOG) | Butonul dezvaluie adresele fara urma in jurnal | — | — | — | Constatare deschisa, in registrul runzei a doua: 23-ROUND2-FINDINGS-REGISTER.md |

<!-- REMEDIATION:END -->
