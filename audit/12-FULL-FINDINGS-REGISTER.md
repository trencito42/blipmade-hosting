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

Constatările din rapoartele `03-*` nu au ID-uri numerotate în sursă; aici primesc prefixe noi: `INF-*` (infrastructură), `NET-*` (rețea și IP), `CAP-*` (capacitate), `DR-*` (recuperare la dezastre).

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
| **Total** | **167** | **28** | **11** | **42** | **53** | **33** |

> **De ce registrul are 28 de P0, iar backlog-ul are 26.** Backlog-ul grupează constatările în **acțiuni de reparare**: aceleași două constatări se repară împreună. De exemplu `COMM-01` (reducerea nu ajunge la Stripe) și `PROMO-01` (aceeași problemă, văzută din pagina de promoții) sunt **două constatări, un singur rând de backlog** (`B-03`). Cele 28 se reduc la 23 rânduri de acțiune. **Nicio constatare nu se pierde între cele două documente** — fiecare P0 din registru e acoperit de cel puțin un rând din `13-PRIORITIZED-BACKLOG.md`.

---

## 1. Securitate — `SEC-01` … `SEC-29`

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

---
