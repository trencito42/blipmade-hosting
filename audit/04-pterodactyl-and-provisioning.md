# 04 — Pterodactyl și provisionarea

**Data auditării:** 2026-10-23 · **Commit de bază:** `7df3973` (`main`, `trencito42/blipmade-hosting`)
**Obiect:** lanțul complet de provisionare al platformei Blipmade — de la comanda clientului până la serverul pornit pe nodul Wings — plus contractul cu panoul Pterodactyl și corectitudinea resurselor.

Clasele de verificare folosite mai jos: `VERIFIED` (executat și observat pe sistemul viu), `CODE-INSPECTED` (citit în sursă, neexecutat), `DOCUMENTED-ONLY`, `INFERRED`, `UNVERIFIED`, `BLOCKED`, `NOT-IMPLEMENTED`.

---

## 0. Rezumat executiv

Platforma **nu este** Pterodactyl. Blipmade este un produs separat care conduce **panoul** Pterodactyl prin două punți: una în interiorul panoului (`panel-bridge/`, cod PHP care rulează în Laravel) și una în API-ul propriu (`api/src/services/panel/*`, `api/src/services/pterodactyl/*`). Panoul creează la rândul său serverul pe **nodul** Wings.

Trei constatări domină raportul:

1. **Niciun produs nu poate fi vândut astăzi.** Checkout-ul este indisponibil prin configurare, nu prin cod: `PAYMENTS_ENABLED=false` și `STRIPE_SECRET_KEY` gol în `/opt/blipmade/.env` pe VM 103 ⇒ `env.paymentsEnabled === false` (`api/src/env.ts:136`) ⇒ `createCheckout()` aruncă `payments_unavailable` (503) înainte de a crea orice sesiune (`api/src/services/stripe.ts:150-153`). `VERIFIED` (configurația runtime) + `CODE-INSPECTED` (efectul în cod).
2. **Lanțul de provisionare în sine funcționează**, dar a fost executat **în afara căii de cumpărare**. Cele 3 instanțe vii din baza de date au fost create de operator (script de seed și inserări directe), nu de `POST /orders` → webhook → `fulfilOrder`. Nu există niciun rând în `Payment`, `Subscription` sau `Invoice` și nicio comandă cu `status='PAID'`. `VERIFIED`.
3. **Poarta unică de capacitate pe care platforma o deține este defectă.** `chooseNode()` compară discul nodului (măsurat în MB de panoul Pterodactyl) cu discul vândut (în GB): `api/src/services/provisioning.ts:214`. Eroarea este de 1024×, deci limita de disc nu leagă niciodată. `VERIFIED` (valorile reale ale nodului, citite read-only de la panoul) + `CODE-INSPECTED` (comparația).

Niciun produs din catalogul real nu este **certificabil end-to-end** astăzi. Unul singur (`discord-bot`) este **provisionabil**; patru sunt `NOT-IMPLEMENTED` (nu au egg).

---

## 1. Topologie și suprafața de acces

| Componentă | Unde | Cum ajunge platforma | Clasă |
|---|---|---|---|
| Platforma Blipmade (API + worker + Postgres + Redis) | VM 103 `10.77.0.13` | SSH `debian` + `/root/.ssh/blipmade_vm103` | `VERIFIED` |
| Panoul Pterodactyl | VM 100 `10.77.0.10:8080` (public: `panel.blipmade.com`) | HTTP `Application API` cu cheia `ptla_` și `Bridge` cu HMAC | `VERIFIED` pentru API-ul HTTP; `BLOCKED` pentru internele VM-ului |
| Nodul Wings | VM 101 `10.77.0.11:8080` (`node1.blipmade.com:8080`) | numai prin panou (Wings nu e apelat direct de platformă) | `BLOCKED` pentru internele VM-ului |
| Gateway / proxy | VM 102 `10.77.0.12` | Caddy | `CODE-INSPECTED` |

**Acces asimetric.** VM 100 și VM 101 nu sunt accesibile agentului (fără cheie SSH, QEMU guest agent oprit). Totuși, **API-ul HTTP al panoului este accesibil** de la VM 103 — chiar de pe contul folosit de producție. Prin urmare faptele despre panou și despre nod **au fost verificate read-only prin `GET` pe Application API**, fără nicio scriere și fără a atinge vreo stare Pterodactyl.

Verificarea că unele pe VM 103 este exact codul auditat:

```bash
# tar al arborelui api/src, api/prisma, panel-bridge, docs de pe VM 103 + diff
diff -rq /root/blipmade-work/api/src    /tmp/vm103/api/src      # fără ieșire
diff -q  /root/blipmade-work/api/prisma/schema.prisma /tmp/vm103/api/prisma/schema.prisma  # fără ieșire
diff -rq /root/blipmade-work/panel-bridge /tmp/vm103/panel-bridge # fără ieșire
diff -rq /root/blipmade-work/docs         /tmp/vm103/docs          # fără ieșire
```

`VERIFIED` — `api/src`, `api/prisma/schema.prisma`, `panel-bridge/` și `docs/` de pe VM 103 sunt **identice** cu cele din directorul auditat. Numărul de referință din acest raport este deci valabil pentru producție.

### 1.1 Cele două chei și unde stau

| Cheie | Kind | Locație | Cine o folosește | Apare în browser? |
|---|---|---|---|---|
| `PTERODACTYL_APP_KEY` | Application API key Pterodactyl (`ptla_…`) | `/opt/blipmade/.env` pe VM 103, variabila de mediu a containerului `api` | `api/src/services/pterodactyl/application.ts` | nu |
| `PANEL_KEYMINT_SECRET` | secret partajat HMAC cu puntea din panou | `/opt/blipmade/.env` pe VM 103 **și** `BLIPMADE_KEYMINT_SECRET` în `.env`-ul panoului (VM 100) | `api/src/services/panel/credentials.ts:66` (apelul `POST /api/blipmade/keymint`) | nu |
| `ptlc_…` per client | cheie client Pterodactyl, per client | `PanelCredential.tokenEnc` (criptată) în baza de date | toate operațiile clientului | nu |

Valorile **nu** sunt reproduse aici. Sunt verificate doar ca existență și lungime (`CODE-INSPECTED` pe `api/src/env.ts:138,144`; `VERIFIED` pe fișierul `.env` de pe VM 103, cu valorile mascate).

---

## 2. Modelul de date

### 2.1 Ce este un „produs” aici, față de Pterodactyl

În Pterodactyl **nu există** conceptul de produs. Există:

- **Nest** — un grup de șabloane (`Nest` 1..5: Minecraft, Source Engine, Voice Servers, Rust, Discord Bots);
- **Egg** — șablonul unui tip de server (imagine Docker, comandă de pornire, variabile de mediu);
- **Node** — o mașină fizică cu resurse și alocări de port;
- **Server** — instanța concretă, cu limite și o alocare.

În Blipmade, `Product` este un **artefact comercial**: preț, limite vândute, opțiuni, plus **pointerul** către un Egg. `Instance` este un **Server** Pterodactyl, deținut de Blipmade.

| Model | Fișier | Ce ține |
|---|---|---|
| `Product` | `api/prisma/schema.prisma:214-258` | `slug`, `name`, `category`, `eggId`, `dockerImage`, `startupCommand`, `startup` (Json, env), `healthProbe` (Json), `visible`, `deployable`, `min/max Ram|Cpu|Disk`, `default*` |
| `ProductPrice` | `api/prisma/schema.prisma:259-278` | `period`, `baseAmount`, `ramPerGb`, `cpuPerUnit`, `diskPerGb`, `currency`, `active` — **tariful** server-side |
| `ProductOption` | `api/prisma/schema.prisma:279-294` | `code`, `name`, `amount`, `currency`, `active` — opțiuni plătite |
| `Egg` | `api/prisma/schema.prisma:309-…` | **cache local** al oulor Pterodactyl (`pterodactylId`, `uuid`, `name`, `dockerImage`, `startup`) |
| `Node` | `api/prisma/schema.prisma:295-308` | **cache local** al nodurilor (`pterodactylId`, `fqdn`, `memory`, `disk`, `memoryAllocated`, `diskAllocated`, `maintenance`) |
| `Instance` | `api/prisma/schema.prisma:585-633` | legătura cu `Product`/`Order`/`OrderItem`, `status`, `pterodactylServerId`, `pterodactylUuid`, `pterodactylAllocation`, `pterodactylNodeId`, `ram/cpu/disk`, `price`, `provisioningKey`, `provisionStep`, `provisionError`, `provisionLockAt` |
| `ProvisioningJob` | `api/prisma/schema.prisma:811-825` | **traseul** fiecărui pas: `step`, `status` (`running`/`completed`/`failed`), `attempts`, `error` |
| `InstanceEvent` | `api/prisma/schema.prisma:635-644` | jurnalul citibil de evenimente al instanței (`type`, `message`) |

**Observație critică:** cache-urile `Egg` și `Node` sunt **goale** în producție (0 rânduri, vezi §8). Ele **nu** sunt sursa de adevăr pentru provisionare: worker-ul citește direct din panou (`ptero.listNodes()` la `api/src/services/provisioning.ts:204`, `ptero.listNests()`/`listEggs()` la `237-240`). Cache-ul e doar un ecran de administrare, și e gol → `api/src/routes/admin.ts:694-746` (`POST /admin/infrastructure/sync`) **nu a fost rulat niciodată**. `VERIFIED`.

### 2.2 Maparea produs → egg + nod + alocare

```
Product.eggId ──► resolveEgg(product)            api/src/services/provisioning.ts:233-253
                   ├─ caută egg-ul în toate nest-urile (panel GET /api/application/nests/{id}/eggs)
                   ├─ image      = product.dockerImage ?? egg.docker_image
                   ├─ startup    = product.startupCommand ?? egg.startup
                   └─ environment= { ...eggEnvironmentTemplate(egg), ...product.startup }

Product.ram/cpu/disk ──► limits Pterodactyl      api/src/services/provisioning.ts:466-480
                   memory = ram (MB), disk = disk*1024 (MB), cpu = cpu*100 (%), io = 500

chooseNode(ram, disk)  ──► node + allocation     api/src/services/provisioning.ts:203-225
                   nod: primul node cu memorie liberă şi cu o alocare neasignată (preferinţă port >= 30000)
                   alocare: prima alocare cu !assigned

Instance.pterodactylServerId / Uuid / Allocation / NodeId  ← întorcerea de la panel
```

`Instance.price` este prețul **individual** al configurației comandate (minor units), nu totalul comenzii: `webhooks.ts:162` (`price: item.unitAmount`).

---

## 3. Fluxul complet: de la „clic pe Deploy” la „serverul rulează”

Fiecare pas cu fișierul și funcția care îl execută. Coloana „Clasă” se referă la faptul că pasul a fost executat pe sistemul viu.

| # | Pas | Unde | Ce face | Clasă |
|---|---|---|---|---|
| 1 | Clientul cere un preț | `POST /api/catalog/quote` → `api/src/routes/catalog.ts:128` → `buildQuote()` `api/src/services/pricing.ts:88-` | calculează prețul **pe server**, din `ProductPrice` | `VERIFIED` (răspunsul public) |
| 2 | Clientul creează comanda | `POST /api/orders` → `api/src/routes/orders.ts:64-117` | `buildQuote()` (poartă `deployable` la `pricing.ts:104`), apoi `prisma.order.create` cu `status='PENDING'` (`orders.ts:74-101`), apoi rezervarea promoției (`orders.ts:106-113`) | `CODE-INSPECTED` |
| 3 | Clientul plătește | `POST /api/orders/:id/checkout` → `api/src/routes/orders.ts:142-163` → `createCheckout()` `api/src/services/stripe.ts:142-209` | creează sesiunea Stripe; aici **se oprește totul azi** (503) | `VERIFIED` (config) / `CODE-INSPECTED` |
| 4 | Panoul confirmă plata | `POST /api/webhooks/stripe` → `api/src/routes/webhooks.ts:448` → `readStripeEvent()` `428` → `processEvent()` → `handleStripeEvent()` `198` | semnătură verificată, eveniment în jurnalul `WebhookEvent`, deduplicat | `CODE-INSPECTED` |
| 5 | Verificarea sumei | `verifyAmount()` `api/src/routes/webhooks.ts:188-196` | `amount_total` trebuie să fie **egal** cu `Order.total`; altfel comanda devine `FAILED` | `CODE-INSPECTED` |
| 6 | Marcarea plății | `markOrderPaid()` `api/src/services/stripe.ts:252-…` | `Order.status='PAID'`, creează `Payment` și câte un `Subscription` pe linie de comandă (`stripe.ts:304-317`) | `CODE-INSPECTED` |
| 7 | Transformarea comenzii în instanțe | `fulfilOrder()` `api/src/routes/webhooks.ts:132-182` | pentru fiecare linie × `quantity` creează `Instance` cu `provisioningKey = order:{orderId}:item:{itemId}:unit:{n}` (`webhooks.ts:147`, cheie idempotentă), apoi `enqueueProvisioning()` (`174`) | `CODE-INSPECTED` |
| 8 | Introducerea în coadă | `enqueueProvisioning()` `api/src/services/queue.ts:53-66` | job BullMQ `provision`, `jobId` derivat din `instanceId` (un singur job per instanță) | `CODE-INSPECTED` |
| 9 | Worker-ul preia jobul | `api/src/worker.ts:29-42` → `provisionInstance()` `api/src/services/provisioning.ts:420` | sare peste instanțele deja `ONLINE` (`worker.ts:36`) | `VERIFIED` (joburi executate) |
| 10 | Blocarea | `acquireLock()` `provisioning.ts:53-63` | `provisionLockAt`, TTL 30 min (`provisioning.ts:34`) | `VERIFIED` |
| 11 | Contul de pe panou | `ensurePterodactylUser()` `provisioning.ts:168-184` → `reconcilePanelIdentity()` `api/src/services/panel/identity.ts:69-154` | caută panoul după `external_id = blipmade_acc_{User.id}` și **numai** după acesta; creează contul dacă lipsește (3 încercări, tratarea cursei „external_id taken”) | `VERIFIED` (conturi 19, 20, 24 create) |
| 12 | Alegerea nodului și a alocării | `chooseNode()` `provisioning.ts:203-225` | vezi §2.2 | `VERIFIED` (nod 1, alocări 74/75/77) |
| 13 | Rezolvarea egg-ului | `resolveEgg()` `provisioning.ts:233-253` | fără `eggId` → `ProvisioningError('server_created', "… has no egg mapping yet.")` (`235`) | `VERIFIED` (egg 15 rezolvat) |
| 14 | Crearea serverului | `provisioning.ts:454-500` → `ptero.createServer()` `api/src/services/pterodactyl/application.ts:107-113` | `POST /api/application/servers` cu `limits`, `resource_limits`, `feature_limits`, `allocation {default, allocations}`; apoi salvează `pterodactylServerId/Uuid/Allocation/NodeId` **din răspunsul panelului** (`487-497`) | `VERIFIED` (serverele 10, 11, 15) |
| 15 | Cererea instalării | `provisioning.ts:533-545` → `ptero.reinstallServer()` `application.ts:220-222` | `POST /api/application/servers/{id}/reinstall`; **dacă `container.installed === 1`, nu reinstalează** (nu șterge fișierele clientului) | `VERIFIED` (`installed 1` pe toate serverele) |
| 16 | Așteptarea instalării | `provisioning.ts:547-554` → `waitForServerInstalled()` `application.ts:227-236` | timeout **900 000 ms**; la depășire → `ProvisioningError('installed', 'The installation did not finish in time.')` | `CODE-INSPECTED` |
| 17 | Pornirea containerului | `provisioning.ts:556-577` → `withCustomerKey()` `provisioning.ts:149-166` → `client.sendPower()` `api/src/services/pterodactyl/client.ts:396-398` | `POST /api/client/servers/{uuid}/power` cu **cheia clientului**, nu cu cea administrativă; la 401 se re-mintuiește cheia și se reia o singură dată | `VERIFIED` (pornit) |
| 18 | Verificarea deployment-ului | `provisioning.ts:579-611` → `probeFor()` `280-298`, `verifyDeployment()` `321-368` (HTTP/TCP), `verifyContainerDeployment()` `378-406` (container) | 40 × 3 s pentru HTTP/TCP, 20 × 3 s pentru container; un status HTTP neașteptat e **eșec**, nu verde | `VERIFIED` (`health_verified completed`) |
| 19 | Legarea abonamentului | `provisioning.ts:614-622` | leagă `Subscription.instanceId` dacă există abonament pentru linia de comandă | `VERIFIED` (no-op: 0 abonamente) |
| 20 | Activarea | `provisioning.ts:637-643` | `Instance.status='ONLINE'`, `provisionStep='activated'`, `completeProvisioning()` | `VERIFIED` |
| 21 | Închiderea comenzii | `provisioning.ts:645-661` | dacă nu mai există instanțe nefinalizate ale comenzii și comanda e `PAID` → `status='FULFILLED'`, `fulfillmentStatus='FULFILLED'` | `CODE-INSPECTED` |
| 22 | Notificarea | `provisioning.ts:663-676` | `AuditLog('instance.provisioned')` + e-mail (fără releu → scris în fișier) | `VERIFIED` (5 rânduri `instance.provisioned`) |

### 3.1 Doar pasul 3 blochează calea reală

Lanțul 4→22 a fost executat de 8 ori pe 2026-10-22 (vezi §8.3), pe comenzi plătite prin gateway-ul de test. Pe 2026-10-23 lanțul a fost executat de operator pe instanțe create **în afara** comenzilor.

**Clasa corectă pentru „provisionarea funcționează”:** `VERIFIED` pentru pașii 9–20 (joburi, evenimente, servere reale, container pornit, `health_verified` trecut).
**Clasa corectă pentru „un client poate cumpăra și primește un server”:** `BLOCKED` — pasul 3 răspunde 503.

---

## 4. Tratarea eșecului

### 4.1 Mecanismele existente

| Mecanism | Unde | Efect |
|---|---|---|
| Retry cu backoff | `api/src/services/queue.ts:41-46` (`attempts: 5`, `backoff: exponential, delay 5000`) | BullMQ reia jobul de 5 ori |
| Lock per instanță | `provisioning.ts:53-63`, TTL 30 min (`:34`) | două rulări nu lucrează simultan pe aceeași instanță |
| Concurență worker | `queue.ts:71-75` (`concurrency: 2`, `lockDuration: 120_000`) | — |
| Reconciliere | `worker.ts:78-92` + `reconcileInterruptedInstances()` `provisioning.ts:691-…`, la fiecare 60 s (`worker.ts:165`) | instanțele rămase în `PROVISIONING`/`PENDING` cu lock vechi sunt reintroduse în coadă |
| Pas reluat | `isDone()` `provisioning.ts:97-102` + `completeStep()` `:85-96` | reluarea continuă **după** ultimul pas reușit; nu reinstalează |
| Timeout instalare | `provisioning.ts:551` (900 s) | `ProvisioningError('installed', …)` |
| Timeout bridge | `api/src/services/panel/credentials.ts:70` (`AbortSignal.timeout(15_000)`) | cheia nu e obținută → 503 |
| Jurnal al pașilor | `ProvisioningJob` (tabel) + `InstanceEvent` (tabel) + `AuditLog` | urmărire completă |
| **Dead-letter** | **nu există** | `worker.ts:95-99` curăță și joburile `failed` (`queue.clean(0, 1000, 'failed')`), deci nu rămâne o coadă de morți; singura urmă e tabelul `ProvisioningJob` |

### 4.2 Ce se întâmplă concret la fiecare eșec

**a) Panelul refuză un apel (de exemplu refuză limitele).**
Excepția urcă din `provisionInstance` în `catch` (`provisioning.ts:677-681`), `failProvisioning()` (`:104-115`) scrie `status='FAILED'`, `provisionError="{step}: {message}"`, marchează joburile `running` ca `failed`, creează un `InstanceEvent` și un `AuditLog`.

**b) Instalarea nu se termină.**
Timeout la 900 s → `ProvisioningError('installed')` → `FAILED`. Jobul BullMQ reia; la reluare `done('installed')` este fals, deci așteaptă din nou.

**c) Nodul nu poate fi contactat.**
`ptero.listNodes()` aruncă o excepție generică (nu `ProvisioningError`). `catch`-ul de la `provisioning.ts:678` atribuie pasul prin valoare implicită: `const step = error instanceof ProvisioningError ? error.step : 'server_created'`. **Deci o panou indisponibil sau un nod mort este raportat ca o eroare la pasul `server_created`**, deși nu s-a ajuns la crearea serverului. Diagnostic fals pentru operator. `CODE-INSPECTED` la `provisioning.ts:678`.

**d) Alocarea este luată între timp.**
`chooseNode()` verifică `!allocation.assigned` (`provisioning.ts:217`), dar alegerea și `createServer()` sunt în trepte distincte: între ele alocarea poate fi luată. Panelul refuză `POST /api/application/servers` → eșec la `server_created`. Reluarea jobului reia de la `node_selected` (blocul `if (!server)` de la `provisioning.ts:447` nu consultă `done('node_selected')`), deci **alegerea se repetă** și se poate lua altă alocare. Comportament corect, dar fără retry explicit în interiorul unui singur pas.

**e) Produsul nu are egg.**
`resolveEgg()` aruncă `ProvisioningError('server_created', "{name} has no egg mapping yet.")` (`provisioning.ts:235`). Nu se creează niciun server, deci nu există scurucă. Dar atenție: acest pas e **după** alegerea nodului (`449`), deci evenimentul „Reserved an address on node 1” e scris și rămâne în jurnal chiar dacă provisionarea eșuează.

**f) Produsul nu are preț activ.**
`loadPrice()` → `notFound('This product has no active price.')` (`api/src/services/pricing.ts:77`); în calea de schimbare de resurse: `badRequest('This product has no active price.')` (`api/src/services/upgrades.ts:45`). Comanda nu se creează. Protecție corectă.

**g) Produsul nu este „deployable”.**
`buildQuote()` → `badRequest("{name} is not available to order yet.")` (`api/src/services/pricing.ts:104`). Comanda nu se creează. **Protecție corectă și server-side** — cei patru produse fără egg nu pot fi comandate nici prin API, nici prin UI.

### 4.3 Ce **nu** există: acțiune compensatorie

`failProvisioning()` (`api/src/services/provisioning.ts:104-115`) face **trei lucruri**: scrie starea, marchează joburile, scrie evenimentul. Nu face **nimic** din următoarele:

1. **Nu șterge serverul deja creat pe panou.** Dacă eșecul vine după pasul 14 (de exemplu la `started`, cum s-a întâmplat de 80 de ori în istoricul din DB), serverul rămâne pe nod, cu alocarea ocupată și cu RAM/disc consumate. `deleteServer()` există (`application.ts:238-240`) dar e apelat **doar** din `services/billing.ts:83`, la retragerea unui abonament, și doar dacă setarea `auto_delete_cancelled_instances` e `true`.
2. **Nu face refund.** `refundPayment()` (`api/src/services/stripe.ts:471-…`) este apelat **doar** din `api/src/services/upgrades.ts:147` (calea de schimbare de resurse). **Calea de provisionare nu refundă niciodată.**
3. **Nu marchează comanda ca reușită sau eșuată.** Comanda rămâne în starea în care era (`PAID`), iar `fulfillmentStatus` rămâne `PROVISIONING` (sau `NOT_STARTED`).

### 4.4 Starea reală: o comandă plătită, fără server

Concluzia combinată a §4.2–4.3: **o provisionare eșuată lasă o comandă încărcată și un server orfan.** Nu există niciun mecanism care să compenseze.

**Cât de des s-a întâmplat, în producție:** `AuditLog` conține **80** de rânduri `instance.provision_failed` și **5** de `instance.provisioned` (la 2026-10-23 07:23:31, ultimul). `VERIFIED` (interogare SQL pe `AuditLog`).

Concret, din istoricul joburilor (`ProvisioningJob`, 2026-10-23 01:53→03:59): primele două instanțe au eșuat repetat la pasul `started` cu „The container cannot be started: The panel cannot issue a client key for this customer…”, în timp ce pașii `pterodactyl_user`, `node_selected`, `server_created`, `image_built` și `installed` rămăneau `completed` — deci **serverul era creat și instalat, iar eșecul era la pornire**. Abia după ce cheia a fost obținută prin punte (bridge) s-a trecut de `started` → `health_verified` → `activated`.

**Starea pe panou confirmă scurucile:** panoul are **5 servere**, dar baza de date Blipmade are **3 instanțe**:

| Server pe panou | Cont de panou | Alocare | Instanță Blipmade |
|---|---|---|---|
| 8 „Blipmade Port Test” | 2 | 73 | **niciuna** (server de test al operatorului) |
| 10 „Discord Bot” | 19 | 74 | `cmvkbgm9h0001r18096ep5jzl` |
| 11 „Discord Bot” | 20 | 75 | `cmvkbichh0003r180pj33xwom` |
| 14 „Browser instance” | 23 | 76 | **niciuna** (contul 23 a fost șters de scriptul de curățare) |
| 15 „Browser instance” | 24 | 77 | `cmvkn67g90003psd841h9qc3g` |

`VERIFIED` — `GET /api/application/servers?per_page=100` (read-only) + interogare SQL pe `Instance`.

Așadar **2 din 5 servere (40%) sunt orfane**: consumă resursele nodului și ocupă alocări, fără să existe o instanță sau o comandă asociată. Comanda de ștergere a serverului la anulare (`billing.ts:80-85`) este dezactivată, pentru că tabela `Setting` are **0 rânduri** și `autoDeleteEnabled()` (`billing.ts:30-34`) întoarce `false` când setarea lipsește. `VERIFIED`.

### 4.5 Acțiunea de retry a operatorului

`POST /admin/instances/:id/retry` → `api/src/routes/admin.ts:845-858`:

```ts
await prisma.instance.update({ where: { id }, data: { status: 'PROVISIONING', provisionError: null } });
await enqueueProvisioning(id, { reason, requestedBy: actor.id });
```

Observații:

- Retry-ul **resetează doar starea locală** și reintră în coadă; nu creează un server nou dacă `pterodactylServerId` există (codul îl reutilizează prin `ptero.getServer()` de la `provisioning.ts:441-443`).
- Retry-ul **nu reîncepe de la zero**: continuă după `provisionStep`. Bun pentru clienți, dar implică că o instanță FAILED rămâne legată de un server creat într-o rulare anterioară.
- **Cazul periculos**: dacă serverul a fost creat pe panou, dar `prisma.instance.update` cu `pterodactylServerId` (`:487-497`) a eșuat, instanța nu știe de server, iar următoarea rulare creează **un al doilea server** pentru același client. E o fereastră îngustă, dar există: nu există nicio căutare a serverelor orfane după `external_id`/`name` înainte de creare.
- Retry-ul este folosit de operator în realitate: `AuditLog` are **8** rânduri `instance.retry_requested` (ultimul la 2026-10-23 04:15:02). `VERIFIED`.

---

## 5. Mașina de stări a lui `Instance.status`

Enum-ul complet: `PENDING`, `PROVISIONING`, `ONLINE`, `RESTARTING`, `STOPPED`, `DEGRADED`, `FAILED`, `SUSPENDED`, `CANCELLED` (`api/prisma/schema.prisma:573-583`).

| Stare | Cine o scrie | Cum se ajunge la ea | Reachable de client? |
|---|---|---|---|
| `PENDING` | implicit la creare (`schema.prisma:598`) | instanță nouă, înainte de provisionare | nu (doar admin/worker) |
| `PROVISIONING` | `beginProvisioning()` `provisioning.ts:70-74`; retry admin `admin.ts:853` | rulează un pas al provisionării | nu |
| `ONLINE` | `provisioning.ts:638-641` (pasul `activated`); `instances.ts:150` (acțiune `start`); `instance-server.ts:1031` (reluare din `SUSPENDED`) | provisionare reușită, pornire manuală, reluare | **da** — `POST /instances/:id/power` și `POST /instances/:id/suspend` |
| `STOPPED` | `instances.ts:150` (acțiune `stop`) | oprire manuală | **da** |
| `RESTARTING` | `instances.ts:150` (acțiune `restart`) | restart manual | **da** |
| `DEGRADED` | **nimeni** — valoare moartă în enum | nu există niciun `data: { status: 'DEGRADED' }` în tot codul (`grep` pe `api/src`) | nu |
| `FAILED` | `failProvisioning()` `provisioning.ts:104-108` | eșec al unui pas | nu |
| `SUSPENDED` | `instance-server.ts:1027-1033` (suspendare manuală); `billing.ts:221-224` (sweep: neplătit după 7 zile de grație) | neplătit, suspendare manuală | **da** (suspend/reluare) |
| `CANCELLED` | `instances.ts:353-356` (anulare de către client); `billing.ts:68-71` (retragere la finalul perioadei plătite) | anulare, retragere | **da** (cancel) |

### 5.1 Tranziții legale și ieșiri din mașină

```
                    (creare)                (worker)
                        │                     │
                        ▼                     ▼
                    PENDING ──────────► PROVISIONING ──┬──► ONLINE ──► STOPPED ──► RESTARTING
                        ▲                 │  ▲           │      │  ▲         │
                        │                 │  │ retry     │      │  │         │
                        │                 ▼  │ admin     │      ▼  │         │
                        │               FAILED ──────────┘   SUSPENDED ────────┘
                        │
                 (script operator)                          CANCELLED ◄── anulare / retragere
```

Legale și implementate:

- `PENDING → PROVISIONING` (worker; `provisioning.ts:73`)
- `PROVISIONING → ONLINE` (worker; `provisioning.ts:640`)
- `PROVISIONING → FAILED` (worker; `provisioning.ts:107`)
- `FAILED → PROVISIONING` (retry admin; `admin.ts:853`)
- `ONLINE ↔ STOPPED`, `ONLINE/STOPPED → RESTARTING` (client; `instances.ts:150`)
- `* → SUSPENDED` (client sau sweep; `instance-server.ts:1031`, `billing.ts:223`)
- `SUSPENDED → ONLINE` (client; `instance-server.ts:1031`)
- `* → CANCELLED` (client sau sweep; `instances.ts:354`, `billing.ts:70`)

### 5.2 Defecte ale mașinii de stări

1. **`RESTARTING` nu este niciodată resetată.** `instances.ts:149-150` scrie `RESTARTING` la un restart, dar niciun cod nu îl readuce ulterior pe `ONLINE` sau `STOPPED`. După un restart, instanța rămâne „RESTARTING” în UI la nesfârșit, până la următoarea acțiune de power. `CODE-INSPECTED` (`api/src/routes/instances.ts:149-150`; singurul scriitor al lui `RESTARTING`).
2. **`ONLINE` nu este sincronizat cu starea reală a containerului.** Singura citire live este `GET /instances/:id/metrics` (`api/src/routes/instances.ts:157-186`, `client.getResources()` la `:165`). Nu există niciun job periodic care compare `Instance.status` cu starea raportată de panou. Așadar `ONLINE` poate fi **stale**: panoul poate spune `off` sau `crash-looping`, iar baza de date continuă să spună `ONLINE`. `CODE-INSPECTED` (niciun apel `getResources` în afara rutei de metrici și a probe-ului de container).
3. **`DEGRADED` nu e folosit niciodată.** `CODE-INSPECTED` (`grep 'DEGRADED' api/src` → doar `admin.ts:64`, unde e folosit într-o statistică de dashboard, niciodată ca stare scrisă).
4. **`SUSPENDED → ONLINE` nu verifică panoul.** `instance-server.ts:1027-1033` scrie `ONLINE` după o reluare, fără să citească starea containerului. `CODE-INSPECTED`.

---

## 6. Contractul cu panoul

### 6.1 Cele două suprafețe de autentificare

| Suprafață | Cheie | Unde se folosește |
|---|---|---|
| **Application API** (`/api/application/*`) | `PTERODACTYL_APP_KEY` (`ptla_…`), din `/opt/blipmade/.env` pe VM 103 | tot ce poate face doar proprietarul: creare cont, creare server, build, startup, reinstall, listări de infrastructură (`api/src/services/pterodactyl/application.ts`) |
| **Client API** (`/api/client/*`) | `ptlc_…` per client, obținută de la punte, stocată criptată | tot ce aparține clientului: power, consolă, fișiere, baze de date, backupe, planificări, alocări, activitate (`api/src/services/pterodactyl/client.ts`) |

### 6.2 Puntea (`panel-bridge/`)

- **Ce face:** singurul cod care poate crea o cheie `ptlc_` — rulează **în interiorul** panoului, ca Laravel controller: `panel-bridge/BlipmadeKeyMintController.php`, înregistrat ca rută `POST /api/blipmade/keymint`.
- **De ce e necesară:** `docs/PANEL_BRIDGE.md:19-31` documentează că `POST /api/application/users/{id}/token` nu există, `POST /api/client/account/api-tokens` nu există, `POST /api/client/auth/login` nu există, iar client API cu cheia de aplicație dă `403`.
- **Autentificare:** HMAC-SHA256 peste `timestamp . '.' . nonce . '.' . external_id` (`BlipmadeKeyMintController.php:74`, identic cu `api/src/services/panel/credentials.ts:49-51`); fereastră de 60 s pentru ceas (`:80-83`); nonce de un singur folosire prin `Cache::add` (`:86-89`); contul găsit **doar** după `external_id` (`:93`); conturile `root_admin` sunt refuzate (`:99-104`); lista `BLIPMADE_KEYMINT_ALLOWED_IPS` limitează originea (`:132-137`); cheia anterioară a contului este revocată (`:149-157`).
- **Stare reală:** funcționează. Tabela `PanelCredential` are **3** rânduri, toate cu `source='bridge'` și `lastUsedAt` recent (04:15, 05:02, 07:23 pe 2026-10-23). `VERIFIED`.
- **Verificarea formei cheii în Blipmade:** `isClientKey()` (`credentials.ts:30-34`) cere prefixul `ptlc_` și lungime ≥ 40 — altfel răspunsul punții e respins cu 503 (`credentials.ts:89-91`).

### 6.3 Ce se întâmplă la o versiune diferită de panou

- Codul își declară ținta: „Body accepted by `POST /api/application/servers` on Pterodactyl **1.15**” (`api/src/services/pterodactyl/types.ts:95`).
- Puntea e scrisă ca să funcționeze pe două layouts: Pterodactyl **1.11+** (`routes/api-client.php` / `routes/api-application.php`, deci ruta trebuie înregistrată printr-un service provider care o scoate din middleware-ul de autentificare) și panoul vechi (`routes/api.php`). `docs/PANEL_BRIDGE.md:139-145` și `panel-bridge/install.sh` (care detectează layout-ul și îl anunță).
- **Singura incompatibilitate concretă a punții** e în PHP: `$user->createToken(self::MEMO, $ips)` (`BlipmadeKeyMintController.php:110`) folosește semnătura cu doi argumente, care există în Pterodactyl 1.11+. Pe un panou mai vechi, `User::createToken(string $description)` acceptă un singur argument ⇒ `ArgumentCountError` ⇒ puntea răspunde 500 ⇒ `mintViaBridge()` aruncă 503 ⇒ **toate operațiile clientului mor** (consolă, fișiere, power, backupe, baze de date). `CODE-INSPECTED` (`BlipmadeKeyMintController.php:110` vs. semnătura Pterodactyl < 1.11).
- Coloana `api_keys.memo` e tratată defensiv: `Schema::hasColumn('api_keys','memo')` (`:106`) comută între „memo” și „șterge toate cheile contului” (`:112-116`, `:149-157`). `CODE-INSPECTED`.
- **Nu există niciun mecanism de detectare a versiunii** în codul platformei: niciun `GET` pe un endpoint de versiune, nicio comparație de header, niciun health-check al punții care să verifice forma răspunsului. Singurul „health check” al punții este că răspunsul e parsat și are forma `ptlc_…` (`credentials.ts:83-91`). `CODE-INSPECTED`.

### 6.4 Ce se întâmplă dacă panoul este actualizat

| Risc | De ce contează | Unde |
|---|---|---|
| Câmpurile `limits` / `resource_limits` / `feature_limits` din `POST /api/application/servers` | sunt singurele limite pe care le scrie platforma; o schimbare de nume sau de unitate ar da servere cu limite greșite | `api/src/services/provisioning.ts:466-481` |
| `POST /api/application/servers/{id}/reinstall` | este cum se cere instalarea; dacă devine asincron cu altă semantica, pasul `installed` ar cădea | `api/src/services/pterodactyl/application.ts:220-222` |
| `GET /api/client/servers/{uuid}/resources` → `state` | baza health-check-ului de tip „container” și a metricilor | `api/src/services/pterodactyl/client.ts:392-394` |
| `client.ts` — întreaga suprafață client | console, fișiere, backupe, baze de date, planificări, alocări | `api/src/services/pterodactyl/client.ts` (35+ endpoint-uri) |
| Puntea PHP (`createToken`, `api_keys.memo`, `User::where('external_id')`) | singurul punct care poate muri **în tăcere** la o actualizare | `panel-bridge/BlipmadeKeyMintController.php` |
| Forma răspunsului `{attributes, data, meta}` a Application API | parsată în `application.ts` și `client.ts` | `api/src/services/pterodactyl/types.ts` |

### 6.5 Inventarul complet al endpoint-urilor Pterodactyl de care depinde platforma

**Application API** (`api/src/services/pterodactyl/application.ts`):

| Metodă + cale | Folosit pentru | Linie |
|---|---|---|
| `GET /api/application/servers?per_page=100` | lista serverelor (import, admin) | `:95` |
| `GET /api/application/servers/{id}` | server + `container.installed` + `limits` | `:100-103` |
| `POST /api/application/servers` | **crearea serverului** | `:108-112` |
| `PATCH /api/application/servers/{id}/details` | nume + descriere | `:132-136` |
| `PATCH /api/application/servers/{id}/build` | **limitele** (calea de upgrade) | `:157-163` |
| `PATCH /api/application/servers/{id}/startup` | imagine, comandă, env | `:193-199` |
| `POST /api/application/servers/{id}/reinstall` | **cererea instalării** | `:221` |
| `DELETE /api/application/servers/{id}` | ștergerea serverului (doar la retragere) | `:239` |
| `GET /api/application/nodes` | **alegerea nodului** | `:243` |
| `GET /api/application/nests` | găsirea egg-ului | `:248` |
| `GET /api/application/nests/{nestId}/eggs` | **rezolvarea egg-ului** | `:254-256` |
| `GET /api/application/nodes/{nodeId}/allocations?per_page=500` | **alegerea alocării** | `:262-264` |
| `GET /api/application/users?per_page=100` | găsirea contului după `external_id` | `:297` |
| `POST /api/application/users` | crearea contului de panou | `:330-333` |
| `GET /api/application/nodes` (ping) | health-check | `:346` |
| `GET /api/application/eggs/{id}/environment` | șablonul de env al egg-ului | `api/src/services/pterodactyl/egg.ts` (folosit la `provisioning.ts:242`) |

**Client API** (`api/src/services/pterodactyl/client.ts`), toate cu cheia clientului:

| Metodă + cale | Linie |
|---|---|
| `GET /api/client/servers/{uuid}` | `:389` |
| `GET /api/client/servers/{uuid}/resources` | `:393` |
| `POST /api/client/servers/{uuid}/power` | `:397` |
| `POST /api/client/servers/{uuid}/command` | `:405` |
| `GET /api/client/servers/{uuid}/websocket` | `:469` |
| `GET /api/client/servers/{uuid}/files/list` | `:409` |
| `GET /api/client/servers/{uuid}/files/contents` | `:422`, `:598` |
| `POST /api/client/servers/{uuid}/files/write` | `:434`, `:574` |
| `POST /api/client/servers/{uuid}/files/delete` | `:447` |
| `PUT /api/client/servers/{uuid}/files/rename` | `:511`, `:525` |
| `POST /api/client/servers/{uuid}/files/copy` | `:544` |
| `POST /api/client/servers/{uuid}/files/compress` · `/decompress` · `/chmod` | `:614`, `:631`, `:640` |
| `GET /api/client/servers/{uuid}/backups` · `POST …/backups` · `DELETE …/backups/{id}` · `GET …/backups/{id}/download` · `POST …/backups/{id}/restore` | `:454`, `:458`, `:729`, `:734`, `:742` |
| `GET/POST /api/client/servers/{uuid}/databases` · `DELETE …/databases/{id}` · `POST …/databases/{id}/rotate-password` | `:672`, `:697`, `:712`, `:708` |
| `GET/POST/PATCH/DELETE /api/client/servers/{uuid}/schedules` · `POST …/schedules/{id}/execute` · `POST …/schedules/{id}/tasks` | `:810`, `:843`, `:874`, `:907`, `:912`, `:849`, `:892` |
| `GET/POST /api/client/servers/{uuid}/network/allocations` · `POST …/allocations/{id}` · `POST …/allocations/{id}/primary` · `DELETE …/allocations/{id}` | `:926`, `:949`, `:954`, `:959`, `:963` |
| `POST /api/client/servers/{uuid}/settings/rename` · `/settings/reinstall` | `:969`, `:974` |
| `GET /api/client/servers/{uuid}/activity` | `:992` |

**Puntea:** `POST /api/blipmade/keymint` (`panel-bridge/routes-snippet.php`, `BlipmadeKeyMintController.php`).

Total: **15 endpoint-uri pe Application API + 36 pe Client API + 1 pe punte = 52 de suprafete dependate.** Orice actualizare de versiune a panoului sau a punții le poate atinge pe toate.

---

## 7. Corectitudinea resurselor și alocărilor

### 7.1 Traducerea limitelor

| Limită vândută | Unitate în Blipmade | Traducere Pterodactyl | Corect? |
|---|---|---|---|
| RAM | MB (`Instance.ram`) | `limits.memory = ram`, `resource_limits.memory = ram` (`provisioning.ts:467`, `:475`) | **da** (Pterodactyl așteaptă MB) |
| CPU | vCPU (`Instance.cpu`) | `limits.cpu = cpu * 100` (`provisioning.ts:472`) | **da** (Pterodactyl exprimă procent dintr-un nucleu; comentariul din cod spune exact asta, `:471`) |
| Disk | GB (`Instance.disk`) | `limits.disk = disk * 1024` (`provisioning.ts:469`) | **da** pentru panou |

Verificat pe serverele reale: serverul 10 are `limits = {memory: 512, disk: 5120, cpu: 100}` pentru o instanță cu `ram=512, cpu=1, disk=5`. `VERIFIED` (`GET /api/application/servers/10`).

### 7.2 Poarta de capacitate a nodului — **defect**

```ts
// api/src/services/provisioning.ts:203-214
const freeMemory = node.memory + node.memory_overallocate - node.allocated_resources.memory;
const freeDisk   = node.disk   + node.disk_overallocate   - node.allocated_resources.disk;
if (freeMemory < ram || freeDisk < disk) continue;     // ← disk este în GB, freeDisk este în MB
```

`chooseNode(instance.ram, instance.disk)` (`provisioning.ts:449`) primește **discul în GB**, dar `node.disk` vine de la panou **în MB**. Valorile reale, citite read-only:

```
GET /api/application/nodes  →  {"id":1,"name":"games-node-01","fqdn":"node1.blipmade.com",
  "memory":122880,"disk":819200,"memory_overallocate":0,"disk_overallocate":0,
  "allocated_resources":{"memory":3072,"disk":25600}}
```

⇒ `freeDisk = 819200 − 25600 = 793600` **MB** (≈ 775 GB) este comparat cu `disk` în **GB** (1…50 pentru `discord-bot`, până la 200 pentru `postgresql`). Poarta de disc nu leagă niciun nod vreodată: ar fi necesar ca un nod să aibă **mai puțin de 1 GB liber** pentru ca un produs cu 1 GB să fie refuzat.

**Consecință:** suma discurilor vândute **poate depăși discul nodului**. Memoria este verificată corect (MB vs. MB), deci acolo overcommit-ul nu se produce prin poarta platformei.

Cum se manifestă: un server nou cu `limits.disk` prea mare este creat și pornește, dar Wings nu poate aloca spațiul pe disc ⇒ containerul intră în `crash-looping` sau install-ul eșuează, iar **nodul e afectat pentru toți clienții**, nu doar pentru cel care a cumpărat. Nu există nicio verificare a spațiului real pe disc al nodului (discul utilizabil depinde de `docker` și de sistemul de fișiere al nodului — informație pe care platforma nu o are și nici nu o cere).

**Corectarea** (neproductivă aici, doar raportată): `chooseNode` trebuie să primească discul în MB (`instance.disk * 1024`) sau comparația trebuie să normalizeze unitățile.

### 7.3 Upgrade-ul nu verifică capacitatea nodului

`applyUpgradeOrder()` (`api/src/services/upgrades.ts:123-133`) apelează `pteroApp.updateServerBuild()` cu limitele noi, **fără** nicio verificare de capacitate a nodului și **fără** nicio verificare a spațiului real pe disc. Extinderea unui server la 16 GB RAM pe un nod care are 2 GB libere este acceptată de panou (limita serverului e sub limita nodului) și eșuează la runtime. `CODE-INSPECTED`.

### 7.4 Upgrade fără plată — verificarea cerută de brief

Brief-ul cere verificarea lui `GET /instances/:id/resources/quote` și a rutei de modificare a resurselor. **Atenție la nume:** nu există `PATCH /instances/:id/*` pentru resurse. Singura rută care schimbă limitele este **`PUT /instances/:id/resources`** (`api/src/routes/instances.ts:268`); `PATCH /instances/:id/settings` (`api/src/routes/instance-server.ts:972`) schimbă **doar** numele și descrierea.

Cum funcționează:

1. `GET /instances/:id/resources/quote` (`instances.ts:246-259`) → `quoteResourceChange()` (`upgrades.ts:37-60`):
   - prețul vine **de pe server** din `ProductPrice` activ (`upgrades.ts:41-45`);
   - configurația e validată contra limitelor produsului (`validateConfiguration`, `pricing.ts:55-67`);
   - `priceDelta = newPrice − instance.price` (`upgrades.ts:50`);
   - `requiresPayment = priceDelta > 0` (`upgrades.ts:58`).
2. `PUT /instances/:id/resources` (`instances.ts:268-312`):
   - `priceDelta <= 0` ⇒ **se aplică imediat, fără plată** (`instances.ts:278-282`): `createUpgradeOrder()` apoi `applyUpgradeOrder()`. E o **degradare** (mai puține resurse, preț mai mic) — panoul e modificat primul, iar dacă panoul refuză, comanda e `FAILED` și plata e rambursată (`upgrades.ts:134-160`). Comportament legitim.
   - `priceDelta > 0` ⇒ `createUpgradeOrder()` (`upgrades.ts:66-97`, comanda rămâne `PENDING`) apoi `createCheckout({...order, items: []})` (`instances.ts:297`). **Astăzi asta aruncă 503** (`stripe.ts:150-153`), deci **instanța NU este atinsă** ⇒ **nu se poate obține un upgrade gratuit**.
   - **Defect secundar:** comanda `UPGRADE` e creată **înainte** de încercarea de checkout (`instances.ts:296`), deci un 503 lasă în baza de date o comandă `PENDING` orfană, cu `total > 0`.
3. **Verdict:** *nu* există o cale prin care un client să obțină un upgrade fără plată. Dar **piesa care împiedică acest lucru nu este o verificare de plată**, ci faptul că `requiresPayment` e calculat din preț *înainte* de a fi creat comanda: `applyUpgradeOrder()` **nu verifică niciodată `order.status === 'PAID'`** (`upgrades.ts:106-119` verifică doar `kind`, existența instanței și `fulfillmentStatus`). Cele două căi de apel sunt `instances.ts:282` (degradare, prin construcție `delta ≤ 0`) și `webhooks.ts:137` (după plată). Orice apel nou cu o comandă neplătită ar aplica schimbarea gratuit. Risc latent, `CODE-INSPECTED`.
4. **Creditul la degradare nu ajunge la client.** `applyUpgradeOrder()` scrie `discount` pe comandă (`upgrades.ts:82`) și micșorează `Instance.price` (`upgrades.ts:172-175`), dar suma nouă se propagă la abonament **numai dacă există un abonament** (`upgrades.ts:179-203`). Azi sunt **0 abonamente**, deci diferența se pierde: clientul plătește mai puțin, dar nu primește credit pentru perioada deja plătită. `VERIFIED` (0 rânduri în `Subscription`) + `CODE-INSPECTED`.
5. **Numerotarea comenzilor nu e atomică.** `nextOrderNumber()` (`orders.ts:58-61`) și `createUpgradeOrder()` (`upgrades.ts:72-75`) calculează ambele `BM-{count+1}`, iar `Order.number` este `@unique` (`schema.prisma:350`). Două comenzi create în același moment (sau o comandă de upgrade concurentă cu o comandă nouă) ⇒ coliziune ⇒ 500 pe ruta de upgrade. `CODE-INSPECTED`.

### 7.5 Alocările

- Alegerea: prima alocare **neasignată**, cu preferință pentru porturi ≥ 30000 (`provisioning.ts:216-220`). Nodul are 173 de alocări, 5 ocupate, 168 libere — deci alegerea nu e niciodată blocată de lipsa de porturi. `VERIFIED`.
- Portul real **nu e niciodată presupus**: e citit înapoi din panou după creare (`provisioning.ts:508-518`) și salvat în `Instance.pterodactylAllocation`. Corect.
- **Alocare în plus, fără plată:** platforma trimite explicit `feature_limits: { databases: 0, backups: 0 }` (`api/src/services/provisioning.ts:481`), iar panoul întoarce serverul cu `feature_limits = {databases: 0, allocations: 0, backups: 0}` ⇒ clientul nu poate crea nici baze de date, nici backupe, nici alocări, deși platforma expune rutele `POST /instances/:id/allocations` și `PUT /instances/:id/allocations` (`api/src/routes/instance-server.ts:671`, `:693`). Aceste rute vor fi refuzate de panou. `CODE-INSPECTED` + `VERIFIED` (serverele reale).

---

## 8. Realitatea runtime (VM 103 + panoul, read-only)

### 8.1 Catalogul și prețurile

```
SELECT slug, name, category, "eggId", "dockerImage", "startupCommand", startup, visible, deployable,
       "minRam","maxRam","minCpu","maxCpu","minDisk","maxDisk", "healthProbe" FROM "Product" ORDER BY "sortOrder";
```

| slug | eggId | dockerImage | deployable | healthProbe | preț lunar |
|---|---|---|---|---|---|
| `wordpress` | *(null)* | *(gol)* | **false** | `{}` | 149 (base), +60/GB RAM, +40/vCPU, +2/GB disc |
| `code-server` | *(null)* | *(gol)* | **false** | `{}` | 299 |
| `discord-bot` | **15** | `ghcr.io/ptero-eggs/yolks:nodejs_25` | **true** | `{"kind":"container"}` | 149 |
| `uptime-kuma` | *(null)* | *(gol)* | **false** | `{}` | 149 |
| `postgresql` | *(null)* | *(gol)* | **false** | `{}` | 449 |

Toate cele 5 au câte un `ProductPrice` activ `MONTHLY` în EUR (`baseAmount`, `ramPerGb=60`, `cpuPerUnit=40`, `diskPerGb=2`). **Prețul e server-side** (`api/src/services/pricing.ts:39-53`, `api/src/services/pricing.ts:69-77`) și e confirmat de API-ul public: `GET https://blipmade.com/api/catalog/products` → prețurile 149/299/149/149/449 cu `deployable` true **doar** pentru `discord-bot`. `VERIFIED`.

### 8.2 Panoul (read-only, `GET` pe Application API)

| Entitate | Realitate |
|---|---|
| Nod | 1 nod: `id=1`, `games-node-01`, `fqdn=node1.blipmade.com`, `memory=122880` MB, `disk=819200` MB, overcommit 0, `maintenance_mode=false`, `allocated_resources={memory:3072, disk:25600}` |
| Nest-uri | 5: Minecraft, Source Engine, Voice Servers, Rust, Discord Bots |
| Egg-uri | 16; **egg 15 = „node.js generic”**, imaginea `ghcr.io/ptero-eggs/yolks:nodejs_25`, în nest-ul „Discord Bots” — **identică cu `dockerImage` din `discord-bot`** |
| Alocări pe nodul 1 | 173 în total; 5 ocupate (id 73–77, porturi 30000–30004), 168 libere |
| Servere | 5 (vezi tabelul din §4.4): 3 legate de instanțe, 2 orfane |
| Versiunea panoului | **nedeterminabilă** prin API (nu există endpoint de versiune, nu există header de versiune) ⇒ `BLOCKED` |

### 8.3 Instanțele, comenzile, plățile

```
SELECT status, count(*) FROM "Order" GROUP BY status;   →  AWAITING_PAYMENT 4 | PENDING 1
SELECT status, count(*) FROM "Instance" GROUP BY status; →  ONLINE 2 | STOPPED 1
SELECT count(*) FROM "Payment";    →  0
SELECT count(*) FROM "Subscription"; →  0
SELECT count(*) FROM "Invoice";    →  0
SELECT count(*) FROM "Setting";    →  0
SELECT count(*) FROM "Node";       →  0
SELECT count(*) FROM "Egg";        →  0
```

- **Nicio comandă plătită nu există în baza de date curentă.** Cele 5 comenzi (BM-00001…BM-00005) sunt `AWAITING_PAYMENT`/`PENDING`, toate cu `fulfillmentStatus='NOT_STARTED'`, iar 4 dintre ele au `stripeCheckoutSessionId` de forma `test_cs_*` — adică au trecut prin gateway-ul de test, nu prin Stripe.
- **Singurele comenzi plătite din istoricul întreg** sunt cele 8 din `AuditLog` cu acțiunea `order.paid`, toate pe **2026-10-22 între 20:03 și 20:17**, cu id-uri de ordine și de client care nu mai există în baza de date. Ele corespund exact celor 8 evenimente `evt_verify_*` din tabelul `WebhookEvent` — adică rulările scriptului `scripts/verify-provisioning.py` (care creează un produs `nginx-verify-<stamp>` cu `eggId: 15`, `scripts/verify-provisioning.py:151-183`). **Produsele, comenzile și clienții aceia au fost șterși după test.** `VERIFIED`.
- **Proveniența celor 3 instanțe vii:**
  - `cmvkn67g90003psd841h9qc3g` („Browser instance”, server 15): creată **direct în baza de date** de `scripts/ops/seed-browser-account.mjs` (`prisma.instance.create` cu `status: 'PENDING'`, fără `orderId`, fără `provisioningKey`) — scriptul de fixture pentru testele de browser. `VERIFIED` (scriptul de pe VM 103, linia `prisma.instance.create`).
  - `cmvkbgm9h0001r18096ep5jzl` și `cmvkbichh0003r180pj33xwom`: au `provisioningKey` de forma `order:{orderId}:item:{itemId}:unit:0`, dar comenzile lor (BM-00002, BM-00003) **nu au fost niciodată plătite** (`status` AWAITING_PAYMENT/PENDING, `fulfillmentStatus=NOT_STARTED`, `paidAt` null) și **nu există niciun eveniment în `WebhookEvent`** pentru ele. Cum `fulfilOrder()` este singurul loc din cod care scrie acel tip de cheie (`webhooks.ts:147`), iar `claimEvent()` ar fi creat un rând în jurnalul evenimentelor, aceste două instanțe au fost **inserate direct în baza de date de operator**, în afara căii de aplicare. `VERIFIED` + `INFERRED` (urmărirea elimină fiecare explicație din cod).
- **Joburile de provisionare nu poartă `payload`**, deși `enqueueProvisioning()` scrie `{reason: 'order paid'}` (`webhooks.ts:174`), `{reason: 'reconciliation'}` (`worker.ts:88`) sau `{reason, requestedBy}` (`admin.ts:854`). Payload gol ⇒ niciun job nu a fost pornit prin coadă pentru aceste instanțe. `VERIFIED`.
- **Cele 2 servere orfane** (8 și 14) confirmă, la nivel de panou, că provisionarea produce servere care nu rămân legate de o instanță. `VERIFIED`.

### 8.4 Istoricul de provisionare

`ProvisioningJob` (2026-10-23) arată, per instanță, pașii `pterodactyl_user` → `node_selected` → `server_created` → `image_built` → `installed` → `started` → `health_verified` → `subscription_linked` → `activated`, cu eșecuri repetate la `started` („The panel cannot be started: The panel cannot issue a client key for this customer…”) și eșecuri la `health_verified` („No HTTP response from http://10.77.0.11:30001/”, probe-ul HTTP vechi), până la trecerea la probe-ul de tip „container” și obținerea cheii prin punte. `VERIFIED`.

**Doar 1 din cele 5 produse din catalog are un egg real** (`discord-bot` → egg 15). **Niciun produs nu poate fi cumpărat azi** (plățile sunt oprite), dar **1 poate fi provisionat** imediat ce plățile se deschid.

---

## 9. Defectele găsite, în ordinea severității

| # | Defect | Fișier:linie | Clasă | Impact |
|---|---|---|---|---|
| **D1** | **Unități greșite în poarta de capacitate a nodului**: `freeDisk` (MB de la panou) e comparat cu `instance.disk` (GB). | `api/src/services/provisioning.ts:214` (apelat din `:449`) | `VERIFIED` (nodul real) + `CODE-INSPECTED` | Eroare de 1024×. Discul vândut poate depăși discul nodului; un container care nu-și încape pe disc afectează **tot nodul**, nu doar clientul. Memoria e verificată corect. |
| **D2** | **Nicio acțiune compensatorie după o provisionare eșuată**: serverul rămâne pe nod, alocarea rămâne ocupată, comanda rămâne plătită și **nu există refund** (`refundPayment` e apelat doar din `upgrades.ts:147`). | `api/src/services/provisioning.ts:104-115` | `VERIFIED` (80 eșecuri, 2 servere orfane) | **Client plătit fără server**, resursă publică a nodului pierdută definitiv. |
| **D3** | **Nicio coadă de morți / retenție a eșecurilor**: joburile `failed` sunt curățate de `pruneQueue()`. | `api/src/worker.ts:95-99` | `CODE-INSPECTED` | Singura urmă e tabelul `ProvisioningJob`, la care nu se uită nimeni automat. |
| **D4** | **Plățile sunt oprite prin configurare** ⇒ `createCheckout` aruncă 503 ⇒ nicio comandă nu poate fi plătită ⇒ nicio instanță nu poate fi creată prin calea de cumpărare. | `api/src/env.ts:136` + `api/src/services/stripe.ts:150-153`; `/opt/blipmade/.env` pe VM 103 (`PAYMENTS_ENABLED=false`, `STRIPE_SECRET_KEY` gol) | `VERIFIED` | **Blocaj de lansare**: butonul „Deploy” nu poate duce la un server plătit. |
| **D5** | **Starea `RESTARTING` nu e niciodată resetată**; `DEGRADED` nu e scrisă niciodată; `ONLINE` nu e sincronizat cu starea reală a containerului. | `api/src/routes/instances.ts:149-150`; `api/src/routes/instance-server.ts:1027-1033`; `api/src/services/provisioning.ts:638-641` | `CODE-INSPECTED` | UI-ul poate arăta „running” pentru un container oprit. |
| **D6** | **`feature_limits` cu `databases: 0` și `backups: 0`** în timp ce platforma expune rute de client pentru baze de date, backupe și alocări (panoul întoarce și `allocations: 0`). | `api/src/services/provisioning.ts:481` vs. `api/src/routes/instance-server.ts:400-533`, `:535-644`, `:646-740` | `CODE-INSPECTED` + `VERIFIED` (serverele reale) | Trei funcții de client promises în panou, dar refuzate de panou. |
| **D7** | **Numerotarea comenzilor e neatomică** (`count()+1` în două locuri) contra unei coloane `@unique`. | `api/src/routes/orders.ts:58-61`, `api/src/services/upgrades.ts:72-75` vs. `api/prisma/schema.prisma:350` | `CODE-INSPECTED` | Coliziune de număr ⇒ `P2002`, care nu e mapat de handler (`api/src/plugins/errorHandler.ts:9-39` mapează doar `AppError`/`ZodError`) ⇒ **500** la comandă sau la upgrade. Numărul crește și scade cu numărul de comenzi, deci ștergerea unei comenzi (curățenie, teste) reintroduce coliziunile. |
| **D8** | **O comandă `UPGRADE` orfană** rămâne în baza de date când checkout-ul eșuează (creată înainte de checkout). | `api/src/routes/instances.ts:296` | `CODE-INSPECTED` | Comenzi `PENDING` cu `total > 0` care nu vor fi plătite niciodată. |
| **D9** | **Upgrade-ul nu verifică capacitatea nodului**. | `api/src/services/upgrades.ts:123-133` | `CODE-INSPECTED` | Un server poate fi extins peste limita fizică a nodului. |
| **D10** | **Eroarea de infrastructură e raportată la pasul greșit**: orice excepție care nu e `ProvisioningError` e atribuită pasului `server_created`. | `api/src/services/provisioning.ts:678` | `CODE-INSPECTED` | Diagnostic greșit pentru operator în incident. |
| **D11** | **Cache-urile `Node` și `Egg` sunt goale** ⇒ `POST /admin/infrastructure/sync` nu a fost rulat niciodată ⇒ panoul de infrastructură arată o platformă goală. | `api/src/routes/admin.ts:694-746`; 0 rânduri în `Node`/`Egg` | `VERIFIED` | Operatorul nu are vizibilitate pe infrastructură. |
| **D12** | **Creditul la degradare nu ajunge la client** când nu există abonament. | `api/src/services/upgrades.ts:179-203` | `CODE-INSPECTED` + `VERIFIED` (0 abonamente) | Clientul pierde diferența. |
| **D13** | **Fereastră de server dublu**: dacă `prisma.instance.update` cu `pterodactylServerId` eșuează după crearea serverului, următoarea rulare creează un al doilea server pentru același client. | `api/src/services/provisioning.ts:487-497` + `:441-443` | `CODE-INSPECTED` | Contaminare a nodului. |
| **D14** | **Cache-ul local de produse nu e invalidat**: nu e o problemă azi (nu există cache), dar nu există niciun mecanism. | — | `UNVERIFIED` | — |

**Defectul cel mai sever de provisionare: D1** (`api/src/services/provisioning.ts:214`). Singura poartă de capacitate pe care platforma o deține este scrisă cu unități incompatibile, deci nu leagă nimic, iar eroarea e de 1024× în direcția care permite **supravânzarea** de disc. Combinat cu D2 (nicio compensație), o comandă poate produce un server care ocupă un disc pe care nodul nu îl are.

---

## 10. Ce a rămas `BLOCKED` și cum se deblochează

| Item | De ce e blocat | Pasul sigur de deblocare |
|---|---|---|
| Versiunea exactă a Pterodactylului pe VM 100 | Niciun endpoint de versiune, niciun header; agentul nu are acces la VM-ul | SSH pe VM 100 ca `debian` (sau pornirea QEMU guest agent și `qm guest exec 100 -- …`) și citirea `config/app.php` / setarea `version` |
| Configurația internă a lui Wings pe VM 101 (limite, `docker_overallocate`, porturi, imagini deja pulluite) | VM 101 inaccesibil agentului | SSH pe VM 101 sau `qm guest exec 101 -- cat /etc/pterodactyl/config.yml` |
| Starea live a containerelor (dacă `npm run start` intră în crash-loop pe un container gol) | Application API nu întoarce starea de execuție; client API cere o cheie de client; nodul e inaccesibil | Dintr-o sesiune de client: `GET /api/instances/:id/metrics` (`api/src/routes/instances.ts:157`); sau `docker ps` + logurile Wings pe VM 101 |
| Dacă imaginile `wordpress` / `postgresql` / `uptime-kuma` pot porni pe CPU-ul nodului | VM 101 inaccesibil; niciun produs nu are egg ca să se testeze | Provisionarea unui server de test cu egg-ul dorit, pe VM 101, și citirea logului de instalare |
| Comportamentul exact al punții după o actualizare a panoului | Panel upgrade never happened; documentația e `DOCUMENTED-ONLY` | Upgrade controlat al panoului într-o fereastră de test + `POST /api/blipmade/keymint` cu o cheie HMAC validă |
| Dacă suma limitelor vândute depășește nodul în producție | Nu se poate executa o comandă reală (read-only) | După D1, se rulează `POST /admin/infrastructure/sync` și se compară `sum(limits)` cu `Node.memory`/`Node.disk` |

---

## 11. Concluzie

Lanțul de provisionare **e bine construit ca structură**: idempotență prin `provisioningKey`, reluare după ultimul pas reușit, blocare per instanță, reconciliere la 60 s, nu se presupune niciodată un port sau o alocare, iar prețul e întotdeauna server-side.

Dar **nu poate fi exercitat de un client azi**, pentru că plățile sunt oprite prin configurare (D4), iar **nu a fost niciodată exercitat de un client**: toate cele 8 comenzi plătite din istoric sunt comenzi sintetice ale scriptului de verificare, iar cele 3 instanțe vii au fost create de operator în afara căii de cumpărare. Cele trei defecte care transformă o eșec în pierdere permanentă sunt D1 (poarta de capacitate nu leagă), D2 (nicio compensație, niciun refund) și D4 (plățile oprite).

Înainte de a se vinde ceva, trebuie: (a) deschis plățile și probat o comandă reală end-to-end, (b) reparat unitățile din `chooseNode`, (c) adăugat o acțiune compensatorie la eșec (ștergerea serverului + refund) sau o stare explicită „FAILED, server existent, deci de compensat”.
