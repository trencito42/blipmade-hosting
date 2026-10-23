# 04 — Certificarea produselor

**Data auditării:** 2026-10-23 · **Commit de bază:** `7df3973` (`main`, `trencito42/blipmade-hosting`)
**Obiect:** poate un client să cumpere azi un produs din catalog și să primească un server care chiar rulează? Răspunsul, pentru fiecare produs din **catalogul real**, cu dovezi.

Clasele de verificare: `VERIFIED`, `CODE-INSPECTED`, `DOCUMENTED-ONLY`, `INFERRED`, `UNVERIFIED`, `BLOCKED`, `NOT-IMPLEMENTED`.

---

## 1. Catalogul real (nu cel de marketing)

Sursa de adevăr pentru „ce se vinde” este baza de date și API-ul public, nu textul de pe pagină.

```bash
curl -s https://blipmade.com/api/catalog/products
```

→ **5 produse**, cu `deployable` expus de server:

| slug | name | category | deployable | price (public API) |
|---|---|---|---|---|
| `wordpress` | WordPress | WEB_CMS | **false** | 149 unități minori (€1.49) / MONTHLY |
| `code-server` | Code Server | DEVELOPER_TOOLS | **false** | 299 unități minori (€2.99) / MONTHLY |
| `discord-bot` | Discord Bot | BOTS | **true** | 149 unități minori (€1.49) / MONTHLY |
| `uptime-kuma` | Uptime Kuma | MONITORING | **false** | 149 unități minori (€1.49) / MONTHLY |
| `postgresql` | PostgreSQL | DATABASES | **false** | 449 unități minori (€4.49) / MONTHLY |

`VERIFIED` (interogare SQL pe `Product` pe VM 103 + `GET /api/catalog/products`; re-verificat live în această rundă: `wordpress` 149, `code-server` 299, `discord-bot` 149, `uptime-kuma` 149, `postgresql` 449).

> **Atenție la unitate.** API-ul public întoarce `price: { amount: 149, currency: "EUR", period: "MONTHLY" }` — suma este în **unități minori (sutimi)**, nu în euro: `149` = **€1.49**. Câmpul `amount` nu spune unitatea (constatarea B9 din `05-commerce-and-billing.md`). Toate valorile de preț din acest raport sunt date în unități minori, cu echivalentul în euro între paranteză.

Cele patru produse marcate `deployable=false` sunt exact cele patru pe care interfața le etichetează „Coming soon” (`web/src/app/DeployCatalog.tsx:43-49`) și pe care pagina de deploy le refuză explicit („It has not been validated for deployment yet.”, `web/src/app/Deploy.tsx:304-307`). **Marketingul și baza de date sunt de acord.** `CODE-INSPECTED` pentru UI, `VERIFIED` pentru date.

## 2. Ce a fost executat și ce nu

| Ce am făcut | Cum | Efect |
|---|---|---|
| Citit baza de date de pe VM 103 | `psql` read-only, prin `docker compose exec postgres` | produse, prețuri, noduri, egg-uri, instanțe, comenzi, joburi, evenimente, audit |
| Citit API-ul public de catalog | `curl` pe `https://blipmade.com/api/catalog/products` și `/api/catalog/products/:slug` | prețurile și `deployable` văzute de client |
| Citit panoul Pterodactyl | `GET` pe Application API, de pe VM 103, cu cheia deja existentă în `/opt/blipmade/.env` | noduri, nest-uri, egg-uri, alocări, servere |
| Citit bridge-ul, codul sursă și documentația | `panel-bridge/`, `api/src/**`, `docs/` | contractul cu panoul |

**Nimic nu a fost scris**: nicio comandă, nicio instanță, nicio pornire de server, nicio scriere în DB, nicio modificare de stare Pterodactyl. Toate apelurile spre panou au fost `GET`.

**Nu am executat**: o comandă reală de client, un checkout, un flux de plată, o schimbare de resurse, un reinstall. De aceea, acolo unde scriu „never executat end-to-end prin calea de cumpărare”, starea este `CODE-INSPECTED` sau `BLOCKED`, nu `VERIFIED`.

---

## 3. Matricea de certificare

### 3.1 `discord-bot` — singurul produs cu egg real

| Câmp | Conținut |
|---|---|
| **Produs** | `discord-bot` — „Discord Bot”, categoria `BOTS` (`api/prisma/schema.prisma:214-258`) |
| **Egg** | **egg 15, „node.js generic”**, nest „Discord Bots” (nest 5), imaginea `ghcr.io/ptero-eggs/yolks:nodejs_25` — **identică** cu `Product.dockerImage`. Citit read-only: `GET /api/application/nests/5/eggs` → `{"id":15,"name":"node.js generic","docker_image":"ghcr.io/ptero-eggs/yolks:nodejs_25"}`. `VERIFIED` |
| **Nod și alocare** | **Nod 1** (`games-node-01`, `node1.blipmade.com`, 122880 MB RAM / 819200 MB disc, `maintenance_mode=false`). Alocarea se alege din lista nodului la provisionare: prima alocare neasignată, preferință pentru port ≥ 30000 (`api/src/services/provisioning.ts:216-220`). Nodul are 173 de alocări, 168 libere. Instanțele reale au primit alocările 74 (port 30001), 75 (30002) și 77 (30004). `VERIFIED` |
| **Calea comenzii** | `POST /api/catalog/quote` → `POST /api/orders` → `POST /api/orders/:id/checkout` → `POST /api/webhooks/stripe` → `fulfilOrder()` → coadă → worker. **Plătirea este obligatorie înainte de provisionare**: instanța e creată de `fulfilOrder()` (`api/src/routes/webhooks.ts:151`), care e apelat **doar** după `markOrderPaid()` (`api/src/routes/webhooks.ts:230-237`). Server-side, comanda unui produs cu `deployable=false` e respinsă cu 400 la `api/src/services/pricing.ts:104`. `CODE-INSPECTED` |
| **Sursa prețului** | **Server-side**, din `ProductPrice` activ (`api/src/services/pricing.ts:69-77`): `baseAmount=149`, `ramPerGb=60`, `cpuPerUnit=40`, `diskPerGb=2`, EUR, MONTHLY. Formula: `base + extraRAM_GB×60 + extraCPU×40 + extraDisk_GB×2` (`api/src/services/pricing.ts:39-53`). Clientul nu trimite prețul. `VERIFIED` (prețul public = 149, calculat pe server) |
| **Provisionare** | **`VERIFIED`** — lanțul workerului a fost executat și a produs servere reale: `pterodactyl_user → node_selected → server_created → image_built → installed → started → health_verified → subscription_linked → activated`. Comanda și ieșirea: `GET /api/application/servers/15` → `{"id":15,"name":"Browser instance","user":24,"egg":15,"allocation":77,"node":1,"installed":1,"limits":{"memory":512,"disk":5120,"cpu":100},"container":{"image":"ghcr.io/ptero-eggs/yolks:nodejs_25","startup_command":"npm run start","environment":{"MAIN_FILE":"index.js",…}}}`. Jurnalul: `ProvisioningJob` cu pașii `completed`, `InstanceEvent` „Container started.” / „Instance is online.”, `AuditLog` `instance.provisioned` ×5. **Stepul neexecutat prin calea de cumpărare:** plata și `fulfilOrder()` nu au fost rulate niciodată pe o comandă reală (vezi §3.6) |
| **Rezultatul văzut de client** | Un container Node.js 25 pornit pe nod, cu `npm run start` și `MAIN_FILE=index.js`. **Limitări reale:** platforma trimite `feature_limits: { databases: 0, backups: 0 }` (`api/src/services/provisioning.ts:481`), iar panoul întoarce serverul cu `{databases: 0, allocations: 0, backups: 0}` ⇒ rutele de client pentru baze de date, backupe și alocări sunt refuzate de panou. Produsul e un container **gol**: fără `package.json`/`index.js` în fișiere, `npm run start` nu are ce rula — starea live a containerului n-a putut fi verificată (`BLOCKED`, vezi §5). `VERIFIED` (limitele) + `BLOCKED` (starea live) |
| **Verdict** | **`PARTIAL`** — *provisionarea funcționează și e dovedită; cumpărarea nu funcționează deloc.* Motivul exact: `POST /api/orders/:id/checkout` → `createCheckout()` → `if (!env.paymentsEnabled) throw paymentsUnavailable()` (`api/src/services/stripe.ts:150-153`), iar `env.paymentsEnabled = PAYMENTS_ENABLED && STRIPE_SECRET_KEY.startsWith('sk_')` (`api/src/env.ts:136`), cu `PAYMENTS_ENABLED=false` și `STRIPE_SECRET_KEY` gol în `/opt/blipmade/.env` pe VM 103 ⇒ **HTTP 503 `payments_unavailable` la fiecare comandă**. `VERIFIED` |

### 3.2 `wordpress`

| Câmp | Conținut |
|---|---|
| **Produs** | `wordpress` — „WordPress”, `WEB_CMS`, `visible=true`, `deployable=false` |
| **Egg** | **`NOT-IMPLEMENTED`** — `Product.eggId` este `NULL`, `Product.dockerImage` este gol, `startup` e `{}`. Nu există niciun egg, nicio imagine, nicio comandă de pornire. `VERIFIED` (interogare SQL) |
| **Nod și alocare** | **N/A** — fără egg nu se ajunge la `chooseNode()` (`api/src/services/provisioning.ts:449`). Nodul 1 există și are 168 alocări libere, dar produsul nu le poate folosi. `VERIFIED` |
| **Calea comenzii** | Rutele există, dar comanda e respinsă **înainte** de a se crea ceva: `POST /api/orders` → `buildQuote()` → `if (!product.deployable) throw badRequest('WordPress is not available to order yet.')` (`api/src/services/pricing.ts:104`). Nicio comandă, nicio instanță. `CODE-INSPECTED` |
| **Sursa prețului** | Server-side, `ProductPrice` activ: `baseAmount=149`, `ramPerGb=60`, `cpuPerUnit=40`, `diskPerGb=2`, EUR/MONTHLY. Prețul **există și e afișat** în catalogul public, deși produsul nu poate fi cumpărat. `VERIFIED` |
| **Provisionare** | **`NOT-IMPLEMENTED`** — dacă ar ajunge la `resolveEgg()`, ar arunca `ProvisioningError('server_created', 'WordPress has no egg mapping yet.')` (`api/src/services/provisioning.ts:235`). Nu s-a executat și nu se poate executa fără egg. `CODE-INSPECTED` |
| **Rezultatul văzut de client** | Nimic. În UI: „Coming soon” (`web/src/app/DeployCatalog.tsx:47`), iar pe pagina de deploy: „Not available to deploy”. `CODE-INSPECTED` |
| **Verdict** | **`NOT-IMPLEMENTED`** — *niciun egg, nicio imagine, `deployable=false`.* Prețul e real în DB, dar produsul nu poate fi comandat nici prin API, nici prin UI. **Nu trebuie oferit.** |

### 3.3 `code-server`

| Câmp | Conținut |
|---|---|
| **Produs** | `code-server` — „Code Server”, `DEVELOPER_TOOLS`, `visible=true`, `deployable=false` |
| **Egg** | **`NOT-IMPLEMENTED`** — `eggId` `NULL`, `dockerImage` gol, `startup` `{}`. Există pe panou un egg 16 „python generic” (`ghcr.io/ptero-eggs/yolks:python_3.13`), dar **nu există niciun egg code-server** și produsul nu îl indică. `VERIFIED` (lista de egg-uri a panoului) |
| **Nod și alocare** | **N/A** — fără egg nu se ajunge la `chooseNode()`. `VERIFIED` |
| **Calea comenzii** | `POST /api/orders` → `buildQuote()` → 400 „Code Server is not available to order yet.” (`api/src/services/pricing.ts:104`). `CODE-INSPECTED` |
| **Sursa prețului** | Server-side: `baseAmount=299` (+60/GB RAM, +40/vCPU, +2/GB disc), EUR/MONTHLY. `VERIFIED` |
| **Provisionare** | **`NOT-IMPLEMENTED`** — `api/src/services/provisioning.ts:235` (fără egg). `CODE-INSPECTED` |
| **Rezultatul văzut de client** | Nimic; „Coming soon”. `CODE-INSPECTED` |
| **Verdict** | **`NOT-IMPLEMENTED`** — *niciun egg, nicio imagine, `deployable=false`.* **Nu trebuie oferit.** |

### 3.4 `uptime-kuma`

| Câmp | Conținut |
|---|---|
| **Produs** | `uptime-kuma` — „Uptime Kuma”, `MONITORING`, `visible=true`, `deployable=false` |
| **Egg** | **`NOT-IMPLEMENTED`** — `eggId` `NULL`, `dockerImage` gol, `startup` `{}`. `VERIFIED` |
| **Nod și alocare** | **N/A**. `VERIFIED` |
| **Calea comenzii** | `POST /api/orders` → 400 „Uptime Kuma is not available to order yet.” (`api/src/services/pricing.ts:104`). `CODE-INSPECTED` |
| **Sursa prețului** | Server-side: `baseAmount=149` (+60/GB RAM, +40/vCPU, +2/GB disc), EUR/MONTHLY. `VERIFIED` |
| **Provisionare** | **`NOT-IMPLEMENTED`** — `api/src/services/provisioning.ts:235`. `CODE-INSPECTED` |
| **Rezultatul văzut de client** | Nimic; „Coming soon”. `CODE-INSPECTED` |
| **Verdict** | **`NOT-IMPLEMENTED`** — *niciun egg, nicio imagine, `deployable=false`.* **Nu trebuie oferit.** |

### 3.5 `postgresql`

| Câmp | Conținut |
|---|---|
| **Produs** | `postgresql` — „PostgreSQL”, `DATABASES`, `visible=true`, `deployable=false` |
| **Egg** | **`NOT-IMPLEMENTED`** — `eggId` `NULL`, `dockerImage` gol, `startup` `{}`. Panoul nu are niciun egg PostgreSQL (16 egg-uri: Minecraft ×5, Source ×7, Voice ×2, Rust, node.js generic, python generic). `VERIFIED` |
| **Nod și alocare** | **N/A**. `VERIFIED` |
| **Calea comenzii** | `POST /api/orders` → 400 „PostgreSQL is not available to order yet.” (`api/src/services/pricing.ts:104`). `CODE-INSPECTED` |
| **Sursa prețului** | Server-side: `baseAmount=449` (+60/GB RAM, +40/vCPU, +2/GB disc), EUR/MONTHLY. **Cel mai scump din catalog, cu `maxDisk=200` GB — și cu poarta de capacitate a discului defectă (§4.2), ar fi produsul cu cea mai mare probabilitate de a umple discul nodului.** `VERIFIED` |
| **Provisionare** | **`NOT-IMPLEMENTED`** — `api/src/services/provisioning.ts:235`. `CODE-INSPECTED` |
| **Rezultatul văzut de client** | Nimic; „Coming soon”. `CODE-INSPECTED` |
| **Verdict** | **`NOT-IMPLEMENTED`** — *niciun egg, nicio imagine, `deployable=false`.* **Nu trebuie oferit.** |

### 3.6 Rezumatul matricei

| Produs | Egg | Provisionare | Cumpărat astăzi | Verdict |
|---|---|---|---|---|
| `discord-bot` | egg 15 „node.js generic” (real) | `VERIFIED` | **Nu** (503 la checkout) | **`PARTIAL`** |
| `wordpress` | `NOT-IMPLEMENTED` | `NOT-IMPLEMENTED` | Nu (400 la comandă) | **`NOT-IMPLEMENTED`** |
| `code-server` | `NOT-IMPLEMENTED` | `NOT-IMPLEMENTED` | Nu (400 la comandă) | **`NOT-IMPLEMENTED`** |
| `uptime-kuma` | `NOT-IMPLEMENTED` | `NOT-IMPLEMENTED` | Nu (400 la comandă) | **`NOT-IMPLEMENTED`** |
| `postgresql` | `NOT-IMPLEMENTED` | `NOT-IMPLEMENTED` | Nu (400 la comandă) | **`NOT-IMPLEMENTED`** |

**Numere:**

- **0** produse din 5 pot fi cumpărate și livrate end-to-end **astăzi**.
- **1** din 5 (`discord-bot`) are un egg real, un nod real și o alocare reală, iar lanțul de provisionare e **dovedit** pe servere reale.
- **1** din 5 (`discord-bot`) poate fi **provisionat imediat** ce plățile se deschid.
- **4** din 5 sunt `NOT-IMPLEMENTED` — nu au egg, nu au imagine, nu au comandă de pornire.

---

## 4. Ce se poate vinde azi, ce trebuie reparat, ce nu trebuie oferit

### 4.1 Se poate vinde azi: **niciun produs**

Nu pentru că lipsește infrastructura — infrastructura există și e funcțională — ci pentru că **nu se poate lua plata**:

```
api/src/env.ts:136   paymentsEnabled: raw.PAYMENTS_ENABLED && raw.STRIPE_SECRET_KEY.startsWith('sk_')
api/src/services/stripe.ts:150-153
    if (!env.paymentsEnabled) { throw paymentsUnavailable(); }   // 503 payments_unavailable
```

Starea pe VM 103: `NODE_ENV=production`, `PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY=` (gol), `STRIPE_TEST_MODE=false`. Deci `stripeTestGateway()` (`api/src/services/stripe.ts:32-42`) este **închis** (returnează `false` în producție) — nu se poate nici măsura o plată falsă.

Consecințe, măsurate:

- `POST /api/orders` funcționează (crează comanda `PENDING`).
- `POST /api/orders/:id/checkout` → **503**.
- Prin urmare **nu se poate crea nicio instanță prin calea de cumpărare**: `Instance` se creează doar în `fulfilOrder()` (`api/src/routes/webhooks.ts:151`), care e apelat doar după plata confirmată (`webhooks.ts:230-237`).

**Dovada că nu a existat niciodată o cumpărare reală:**

```sql
SELECT status, count(*) FROM "Order" GROUP BY status;   -- AWAITING_PAYMENT 4 | PENDING 1
SELECT count(*) FROM "Payment";     -- 0
SELECT count(*) FROM "Subscription"; -- 0
SELECT count(*) FROM "Invoice";     -- 0
SELECT count(*) FROM "AuditLog" WHERE action='order.paid'; -- 8
```

Cele 8 rânduri `order.paid` sunt **toate** din 2026-10-22 între 20:03 și 20:17 și corespund exact celor 8 evenimente `evt_verify_*` din `WebhookEvent` — adică rulările scriptului `scripts/verify-provisioning.py` (care creează produsul temporar `nginx-verify-<stamp>` cu `eggId: 15`, `scripts/verify-provisioning.py:151-183`). **Acele produse, comenzi și clienți au fost șterși după test.** Nicio comandă a unui client real nu a fost plătită vreodată.

### 4.2 Trebuie reparat **înainte** de a se vinde `discord-bot`

| # | Ce | Unde | De ce blochează vânzarea |
|---|---|---|---|
| 1 | **Deschis plățile** și probat o comandă reală end-to-end (plasă → checkout → webhook → instanță) | `/opt/blipmade/.env` pe VM 103: `PAYMENTS_ENABLED=true`, `STRIPE_SECRET_KEY=sk_…`, `STRIPE_WEBHOOK_SECRET=…` | fără asta nu există niciun drum de la „clic” la „server”. E o schimbare de configurare, nu de cod. |
| 2 | **Reparat unitățile din `chooseNode`** | `api/src/services/provisioning.ts:214` | discul nodului vine în MB, discul vândut e în GB ⇒ poarta de capacitate nu leagă nimic (eroare de 1024×). Cu `discord-bot` (max. 50 GB) riscul e mic; **cu `postgresql` (max. 200 GB) sau la scalare, riscul e real**: un container care nu-și încape pe disc dă în crash-loop și strică nodul pentru toți clienții. |
| 3 | **Adăugat o acțiune compensatorie la eșec** | `api/src/services/provisioning.ts:104-115` | azi o provisionare eșuată lasă **comanda plătită fără server** și **serverul orfan pe nod**. În istoricul real: 80 de eșecuri și **2 servere orfane din 5** pe panou (serverul 8 „Blipmade Port Test” și serverul 14, al unui cont șters). |
| 4 | **Dezactivat/curățat serverele orfane existente** | panoul, cu `DELETE /api/application/servers/{id}` | 2 servere ocupă azi alocări 73 și 76 și consumă RAM/disc pe singurul nod. |
| 5 | **Reparat stările** | `api/src/routes/instances.ts:149-150` (`RESTARTING` nu e resetat), `api/src/services/provisioning.ts:481` (`feature_limits` zero la backupe/baze de date/alocări) | clientul vede „running” pentru un container oprit și are butoane pentru funcții pe care panoul le refuză. |

### 4.3 **Nu trebuie oferit** pe serverul curent

| Produs | Motivul exact |
|---|---|
| `wordpress` | **Nu există produsul**: `eggId` NULL, `dockerImage` gol, `startup` `{}` ⇒ `NOT-IMPLEMENTED`. Panoul nu are niciun egg WordPress (16 egg-uri, niciunul de CMS). Server-side, comanda e respinsă cu 400 („WordPress is not available to order yet.”, `api/src/services/pricing.ts:104`), deci nici măcar nu se poate „cumpăra și pierde” — dar **nici prețul afișat nu are acoperire**: clientul vede €1.49/lună pentru un serviciu inexistent. |
| `code-server` | **Nu există produsul**: `eggId` NULL. Pe panou există egg 16 „python generic”, dar **nu există egg code-server** și produsul nu îl referă. Preț €2.99/lună fără acoperire. |
| `uptime-kuma` | **Nu există produsul**: `eggId` NULL. Niciun egg de monitoring pe panou. Preț €1.49/lună fără acoperire. |
| `postgresql` | **Nu există produsul**: `eggId` NULL, niciun egg PostgreSQL pe panou. Preț €4.49/lună, `maxDisk=200` GB, `maxRam=16384` MB — și **cu poarta de capacitate a discului defectă**, un server cu 200 GB ar fi acceptat pe un nod cu 800 GB liber fără nicio verificare reală. |

Toate patru au `deployable=false` în baza de date, deci sunt **blocate server-side**, nu doar ascunse în interfață. `CODE-INSPECTED` + `VERIFIED`.

**Recomandare concretă**: până când `discord-bot` trece printr-o comandă plătită reală și D1/D2 din `04-pterodactyl-and-provisioning.md` sunt reparate, **catalogul public nu trebuie să afișeze preț pentru niciun produs**, iar eticheta „Coming soon” ar trebui înlocuită cu „indisponibil pe acest server” — pentru că „coming soon” promite ceva ce poate fi livrat, iar în cazul lui `discord-bot` chiar poate, cu o excepție: **plățile**.

### 4.4 Ce ar trebui certificate înainte de lansare

O certificare onestă pentru `discord-bot` cere, în ordine:

1. o comandă reală plătită, cu `Payment`, `Subscription` și `Invoice` create, și o instanță creată de `fulfilOrder()` (nu de operator);
2. un container pornit **și** verificat viu — azi starea live nu e verificabilă de agent (`BLOCKED`, §5);
3. un restart de container, ca să se vadă că starea nu rămâne „RESTARTING” pentru totdeauna;
4. o degradare și o îmbunătățire a resurselor, ca să se vadă că prețul se recalculează pe server și că o îmbunătățire cere plată.

Până atunci, singura afirmație onestă despre `discord-bot` este cea din verdict: **`PARTIAL` — „provisionarea este dovedită, cumpărarea nu funcționează.”**

---

## 5. Ce a rămas `BLOCKED`

| Item | Blocker exact | Pasul sigur de deblocare |
|---|---|---|
| Starea live a containerului lui `discord-bot` (rulează? intră în crash-loop din cauza lui `npm run start` pe un container gol?) | Application API nu întoarce starea de execuție (`state: None`); Client API cere o cheie `ptlc_`; nodul (VM 101) e inaccesibil agentului | Dintr-o sesiune de client: `GET /api/instances/:id/metrics` (`api/src/routes/instances.ts:157`, care apelează `client.getResources()`); alternativ SSH pe VM 101 și `docker ps` + logurile Wings |
| Dacă imaginile pentru `wordpress` / `postgresql` / `uptime-kuma` pot porni pe CPU-ul nodului | VM 101 inaccesibil; nu există egg-uri pe care să le testeze | Provisionarea unui server de test cu egg-ul dorit pe VM 101 și citirea logului de instalare |
| Versiunea Pterodactylului de pe VM 100 | Niciun endpoint de versiune; agentul nu are acces la VM | SSH pe VM 100 sau `qm guest exec 100 -- …`, apoi `config/app.php` |
| Capacitatea reală utilizabilă a nodului (spațiu efectiv pe disc, limite Wings) | `Node.disk` vine din panou, dar discul real depinde de sistemul de fișiere al nodului; agentul nu-l poate citi | SSH pe VM 101: `df -h`, `/etc/pterodactyl/config.yml` |
| Comportamentul punții după o actualizare a panoului | `createToken($memo, $ips)` (`panel-bridge/BlipmadeKeyMintController.php:110`) cere Pterodactyl ≥ 1.11; pe o versiune mai veche puntea moare cu 500 și **toate** operațiile clientului cad | Upgrade controlat al panoului + un `POST /api/blipmade/keymint` cu semnătură HMAC validă, ca test de regresie |

---

## 6. Concluzie

Catalogul real are **5** produse. **Unul** (`discord-bot`) e real: egg 15 „node.js generic” există pe panou, imaginea se potrivește, nodul 1 are capacitate și 168 alocări libere, iar workerul a creat efectiv servere, le-a instalat, le-a pornit și a trecut verificarea de deployment — dovedit cu `ProvisioningJob`, `InstanceEvent`, `AuditLog` și cu `GET` pe panoul viu. **Patru** sunt fictive la nivel de implementare: nu au egg, nu au imagine, nu au comandă de pornire, iar serverul le refuză cu 400 înainte de a crea orice.

Dar **niciun produs nu se poate vinde azi**, pentru un motiv care nu ține de produse: plățile sunt oprite prin configurare, iar **nicio comandă a unui client nu a fost plătită niciodată** în această instalare (0 `Payment`, 0 `Subscription`, 0 `Invoice`; cele 8 plăți din istoric sunt comenzi sintetice de test, șterse după rulare). Cele trei instanțe vii au fost create de operator, în afara căii de cumpărare — deci **nu dovedesc** că un client poate obține un server.

Verdictul pe scurt: **0 certificabile end-to-end azi, 1 provisionabil, 4 de neimplementat.** Calea de ieșire e scurtă și e clară: deschide plățile, repară poarta de capacitate (`api/src/services/provisioning.ts:214`) și adaugă o compensație la eșec (`api/src/services/provisioning.ts:104`), apoi rulează o comandă plătită reală și re-certifică `discord-bot`.
